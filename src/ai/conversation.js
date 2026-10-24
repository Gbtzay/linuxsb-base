/** Bounded, untrusted conversation background. Never use it as evidence or action authority. */
function safeText(value) {
  return String(value ?? '')
    .replace(/[\u0000-\u0008\u000b\u000c\u000e-\u001f\u007f]/g, '')
    .replace(/(?:https?:\/\/|\/\/)[^\s<>]+/gi, '[链接已省略]')
    .replace(/\b(?:api[-_]?key|authorization|bearer|token|_csrf|password|secret)\s*[:=]?\s*["']?[^\s,"';<>]+/gi, '[凭据已隐藏]')
    .replace(/\bsk-[a-z0-9_-]{8,}/gi, '[凭据已隐藏]')
    .trim()
}

function clampChars(value, fallback, maximum = 16384) {
  const number = Number(value)
  if (!Number.isFinite(number)) return fallback
  return Math.max(0, Math.min(maximum, Math.floor(number)))
}

function scopeValue(value) {
  if (value == null || value === '') return ''
  if (typeof value === 'string' || typeof value === 'number' || typeof value === 'boolean') return String(value)
  if (typeof value !== 'object') return ''
  const keys = ['kind', 'routeType', 'topicId', 'routeScope', 'materialMode']
  const result = {}
  for (const key of keys) {
    const item = value[key]
    if (item == null || item === '') continue
    if (key === 'materialMode' && !['attached', 'detached'].includes(String(item))) continue
    result[key] = typeof item === 'number' && Number.isFinite(item) ? item : String(item)
  }
  return JSON.stringify(result)
}

function rowScope(row) {
  return scopeValue(row?.scope ?? row?.context)
}

function hashConversation(value) {
  let hash = 2166136261
  for (const char of String(value)) {
    hash ^= char.codePointAt(0)
    hash = Math.imul(hash, 16777619)
  }
  return `m13-${(hash >>> 0).toString(16).padStart(8, '0')}`
}

function pairChars(pair) {
  return pair.reduce((sum, row) => sum + Array.from(row.content).length, 0)
}

function clipPair(pair, budget) {
  if (budget < 2) return null
  const question = Array.from(pair[0].content)
  const answer = Array.from(pair[1].content)
  const questionCount = Math.min(question.length, Math.max(1, Math.floor(budget / 2)))
  const answerCount = Math.min(answer.length, budget - questionCount)
  if (answerCount < 1) return null
  return [
    { role: 'user', content: question.slice(0, questionCount).join('') },
    { role: 'assistant', content: answer.slice(0, answerCount).join('') },
  ]
}

function boundedPairs(pairs, budget, { clip = true } = {}) {
  const selected = []
  let chars = 0
  for (let index = pairs.length - 1; index >= 0; index -= 1) {
    const pair = pairs[index]
    const size = pairChars(pair)
    if (chars + size <= budget) {
      selected.unshift(pair)
      chars += size
      continue
    }
    if (clip && !selected.length) {
      const clipped = clipPair(pair, budget - chars)
      if (clipped) {
        selected.unshift(clipped)
        chars += pairChars(clipped)
      }
    }
  }
  return { pairs: selected, chars }
}

/**
 * Split completed, read-only conversation pairs into recent raw context and
 * older input for the compaction layer. The returned text is untrusted prompt
 * background; it never grants evidence or write authority.
 */
export function buildConversationContext(input, options = {}) {
  const budget = clampChars(options.maxChars, 4000, 16384)
  const summaryBudget = clampChars(options.summaryChars, 1600, 1600)
  const recentLimit = Math.max(0, Math.min(3, Math.floor(Number(options.recentPairs ?? 3) || 0)))
  const expectedScope = scopeValue(options.scope)
  const pairs = []
  let pending = null
  for (const raw of Array.isArray(input) ? input : []) {
    if (!raw || typeof raw !== 'object') {
      pending = null
      continue
    }
    const role = raw.role === 'user' || raw.role === 'assistant' ? raw.role : ''
    const state = raw.state == null ? 'complete' : String(raw.state)
    const capability = String(raw.capability || '')
    const scope = rowScope(raw)
    const eligible = state === 'complete' && capability !== 'site-action' && (!expectedScope || scope === expectedScope)
    if (role === 'user' && eligible) {
      const content = safeText(raw.content)
      pending = content ? { role, content, scope } : null
      continue
    }
    if (role === 'assistant' && eligible && pending) {
      const content = safeText(raw.content)
      if (content && (!pending.scope || !scope || pending.scope === scope)) {
        pairs.push([
          { role: 'user', content: pending.content },
          { role: 'assistant', content },
        ])
      }
    }
    pending = null
  }

  const recentSource = recentLimit ? pairs.slice(-recentLimit) : []
  const summarySource = pairs.slice(0, Math.max(0, pairs.length - recentSource.length))
  const recent = boundedPairs(recentSource, budget, { clip: true })
  const summary = boundedPairs(summarySource, summaryBudget, { clip: false })
  const recentRows = recent.pairs.flat()
  const summaryInput = summary.pairs.flat()
  const text = recentRows.length
    ? JSON.stringify(recentRows).replace(/</g, '\\u003c').replace(/>/g, '\\u003e')
    : ''
  const fingerprintSource = JSON.stringify({
    version: 1,
    scope: expectedScope,
    recent: recentRows,
    summary: summaryInput,
  })
  return {
    recentRows,
    summaryInput,
    text,
    chars: recent.chars,
    omittedPairs: Math.max(0, summarySource.length - summary.pairs.length),
    fingerprint: hashConversation(fingerprintSource),
  }
}

export function prepareConversation(input, { maxChars = 4000, maxTurns = 3 } = {}) {
  const budget = Math.max(0, Math.min(4000, Math.floor(Number(maxChars) || 0)))
  const limit = Math.max(0, Math.min(3, Math.floor(Number(maxTurns) || 0)))
  const pairs = []
  let question = null
  for (const row of Array.isArray(input) ? input : []) {
    if (row?.role === 'user') question = safeText(row.content)
    else if (row?.role === 'assistant' && question) {
      const answer = safeText(row.content)
      if (answer) pairs.push([{ role: 'user', content: question }, { role: 'assistant', content: answer }])
      question = null
    } else question = null
  }
  const selected = []
  let chars = 0
  let clipped = false
  for (const pair of (limit ? pairs.slice(-limit) : []).reverse()) {
    if (!limit || selected.length >= limit || budget - chars < 2) break
    const available = budget - chars
    const q = Array.from(pair[0].content).slice(0, Math.min(500, available - 1))
    const a = Array.from(pair[1].content).slice(0, available - q.length)
    if (!q.length || !a.length) break
    clipped ||= q.length < Array.from(pair[0].content).length || a.length < Array.from(pair[1].content).length
    selected.unshift([{ role: 'user', content: q.join('') }, { role: 'assistant', content: a.join('') }])
    chars += q.length + a.length
  }
  const rows = selected.flat()
  const text = rows.length ? JSON.stringify(rows).replace(/</g, '\\u003c').replace(/>/g, '\\u003e') : ''
  return { rows, text, chars, truncated: clipped || selected.length < pairs.length, budget }
}
