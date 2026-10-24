export const TRACE_STAGES = Object.freeze(['plan', 'scope', 'read', 'validate', 'answer', 'execute', 'check', 'limit'])
export const TRACE_STATES = Object.freeze(['pending', 'active', 'complete', 'failed', 'unknown', 'skipped'])
export const TRACE_EVIDENCE = Object.freeze(['verified', 'partial', 'unverified'])

const STAGE_SET = new Set(TRACE_STAGES)
const STATE_SET = new Set(TRACE_STATES)
const EVIDENCE_SET = new Set(TRACE_EVIDENCE)
const COUNT_KEYS = ['selected', 'read', 'matched', 'citations']
const REASON_CODES = new Set([
  'trace-invalid',
  'scope-empty',
  'read-partial',
  'read-failed',
  'plan-normalized',
  'plan-downgraded',
  'plan-unsupported',
  'write-unknown',
])
const EVENT_KEYS = new Set([
  'id',
  'flowId',
  'stage',
  'state',
  'title',
  'summary',
  'evidence',
  'counts',
  'citations',
  'reasonCode',
  'startedAt',
  'finishedAt',
])

function isRecord(value) {
  return !!value && typeof value === 'object' && !Array.isArray(value)
}

function clip(value, limit) {
  return Array.from(String(value ?? '')).slice(0, limit).join('')
}

function safeSummary(value) {
  return clip(value, 200)
    .replace(/[\u0000-\u0008\u000b\u000c\u000e-\u001f\u007f]/g, ' ')
    .replace(/<[^>]{0,160}>/g, '')
    .replace(/https?:\/\/[^\s<]+/gi, '[链接已隐藏]')
    .replace(/\b(?:api[_ -]?key|x[_-]?csrf[_-]?token|_?csrf|cookie|authorization)\s*[:=]\s*[^\s,;]+/gi, '$1=[已隐藏]')
    .replace(/\bBearer\s+[A-Za-z0-9._~+/=-]+/gi, 'Bearer [已隐藏]')
}

function safeCount(value) {
  const n = Number(value)
  if (!Number.isFinite(n)) return 0
  return Math.max(0, Math.min(9999, Math.trunc(n)))
}

function safeTimestamp(value) {
  const n = Number(value)
  return Number.isFinite(n) && n >= 0 ? Math.trunc(n) : undefined
}

function safeCitations(value) {
  if (!Array.isArray(value)) return []
  const seen = new Set()
  const output = []
  for (const item of value) {
    const citation = clip(item, 120)
    if (/https?:\/\/|javascript:|^\/\//i.test(citation)) continue
    if (!citation || seen.has(citation)) continue
    seen.add(citation)
    output.push(citation)
    if (output.length >= 40) break
  }
  return output
}

function fail(code, message, path = '') {
  return { ok: false, error: { code, path, message } }
}

function safeQuestion(value) {
  return clip(value, 500).trim()
}

function actionRecord(actions, id) {
  return (Array.isArray(actions) ? actions : []).find((item) => String(item?.id || '') === id) || null
}

function containsUnsafeValue(value, key = '') {
  const unsafeKey = /^(?:url|href|selector|request|headers|method|csrf|cookie|authorization|topicid|topic_id|postid|post_id|userid|user_id|targetid|target_id|targetkey|target_key|body)$/i
  if (unsafeKey.test(key)) return true
  if (typeof value === 'string' && /(?:https?:\/\/|javascript:|^\/\/)/i.test(value)) return true
  if (!isRecord(value) && !Array.isArray(value)) return false
  if (Array.isArray(value)) return value.some((item) => containsUnsafeValue(item, ''))
  return Object.entries(value).some(([name, item]) => {
    if (name === 'id' && key === 'args') return true
    return containsUnsafeValue(item, name)
  })
}

function hasWriteStep(steps, actions) {
  return steps.some((step) => {
    const id = String(step?.action || step?.id || '')
    const record = actionRecord(actions, id)
    return record?.permission === 'write' || /^.+\.write(?:-|$)/.test(id)
  })
}

function hasUnknownStep(steps, actions) {
  return steps.some((step) => {
    const id = String(step?.action || step?.id || '')
    return !actionRecord(actions, id)
  })
}

/**
 * Keep the trace payload deliberately smaller than the data it describes.
 * This function never copies arbitrary keys from the caller.
 */
export function sanitizeTraceEvent(raw) {
  const source = isRecord(raw) ? raw : {}
  const event = {}
  const id = clip(source.id, 80)
  const flowId = clip(source.flowId, 100)
  if (id) event.id = id
  if (flowId) event.flowId = flowId
  if (STAGE_SET.has(String(source.stage))) event.stage = String(source.stage)
  if (STATE_SET.has(String(source.state))) event.state = String(source.state)
  if (source.title != null) event.title = clip(source.title, 80)
  if (source.summary != null) event.summary = safeSummary(source.summary)
  if (EVIDENCE_SET.has(String(source.evidence))) event.evidence = String(source.evidence)

  const counts = {}
  const rawCounts = isRecord(source.counts) ? source.counts : {}
  for (const key of COUNT_KEYS) counts[key] = safeCount(rawCounts[key])
  event.counts = counts
  event.citations = safeCitations(source.citations)

  if (source.reasonCode != null && REASON_CODES.has(String(source.reasonCode))) {
    event.reasonCode = String(source.reasonCode)
  }
  const startedAt = safeTimestamp(source.startedAt)
  const finishedAt = safeTimestamp(source.finishedAt)
  if (startedAt !== undefined) event.startedAt = startedAt
  if (finishedAt !== undefined) event.finishedAt = finishedAt
  return event
}

export function validateTraceEvent(raw, previous = null) {
  if (!isRecord(raw)) return fail('trace.invalid', '阶段事件必须是对象', 'event')
  for (const key of Object.keys(raw)) {
    if (!EVENT_KEYS.has(key)) return fail('trace.unknown-field', '阶段事件包含未知字段', key)
  }
  if (typeof raw.id !== 'string' || !raw.id || raw.id.length > 80) return fail('trace.id', '阶段 ID 不合法', 'id')
  if (typeof raw.flowId !== 'string' || !raw.flowId || raw.flowId.length > 100) return fail('trace.flow-id', '流程 ID 不合法', 'flowId')
  if (!STAGE_SET.has(raw.stage)) return fail('trace.stage', '阶段类型不受支持', 'stage')
  if (!STATE_SET.has(raw.state)) return fail('trace.state', '阶段状态不受支持', 'state')
  if (typeof raw.title !== 'string' || raw.title.length > 80) return fail('trace.title', '阶段标题不合法', 'title')
  if (typeof raw.summary !== 'string' || raw.summary.length > 200) return fail('trace.summary', '阶段摘要不合法', 'summary')
  if (!EVIDENCE_SET.has(raw.evidence)) return fail('trace.evidence', '证据状态不受支持', 'evidence')
  if (!isRecord(raw.counts)) return fail('trace.counts', '阶段数量必须是对象', 'counts')
  for (const key of COUNT_KEYS) {
    if (!Number.isSafeInteger(raw.counts[key]) || raw.counts[key] < 0 || raw.counts[key] > 9999) {
      return fail('trace.count', '阶段数量不合法', `counts.${key}`)
    }
  }
  if (!Array.isArray(raw.citations) || raw.citations.length > 40) return fail('trace.citations', '阶段引用不合法', 'citations')
  if (raw.citations.some((item) => typeof item !== 'string' || !item || item.length > 120)) {
    return fail('trace.citation', '阶段引用格式不合法', 'citations')
  }
  if (new Set(raw.citations).size !== raw.citations.length) return fail('trace.citation-duplicate', '阶段引用不能重复', 'citations')
  if (raw.reasonCode !== undefined && !REASON_CODES.has(raw.reasonCode)) return fail('trace.reason', '阶段原因码不受支持', 'reasonCode')
  for (const key of ['startedAt', 'finishedAt']) {
    if (raw[key] !== undefined && (!Number.isSafeInteger(raw[key]) || raw[key] < 0)) return fail('trace.timestamp', '阶段时间戳不合法', key)
  }
  if (previous) {
    const before = validateTraceEvent(previous)
    if (!before.ok) return fail('trace.previous', '阶段前态不合法', 'previous')
    if (before.event.id !== raw.id || before.event.flowId !== raw.flowId || before.event.stage !== raw.stage) {
      return fail('trace.identity', '阶段更新必须保持相同的 ID、流程和类型', 'event')
    }
    if (!ALLOWED_TRANSITIONS.get(before.event.state)?.has(raw.state)) {
      return fail('trace.transition', '阶段状态迁移不合法', 'state')
    }
  }
  return { ok: true, event: raw }
}

const ALLOWED_TRANSITIONS = new Map([
  ['pending', new Set(['pending', 'active'])],
  ['active', new Set(['active', 'complete', 'failed', 'unknown', 'skipped'])],
  ['complete', new Set(['complete'])],
  ['failed', new Set(['failed'])],
  ['unknown', new Set(['unknown'])],
  ['skipped', new Set(['skipped'])],
])

export function transitionTrace(previous, next) {
  const checked = validateTraceEvent(next)
  if (!checked.ok) return checked
  if (!previous) return checked
  const before = validateTraceEvent(previous)
  if (!before.ok) return fail('trace.previous', '阶段前态不合法', 'previous')
  if (before.event.id !== checked.event.id || before.event.flowId !== checked.event.flowId || before.event.stage !== checked.event.stage) {
    return fail('trace.identity', '阶段更新必须保持相同的 ID、流程和类型', 'event')
  }
  if (!ALLOWED_TRANSITIONS.get(before.event.state)?.has(checked.event.state)) {
    return fail('trace.transition', '阶段状态迁移不合法', 'state')
  }
  return checked
}

function normalizedSteps(rawSteps) {
  if (!Array.isArray(rawSteps) || rawSteps.length < 1 || rawSteps.length > 5) return null
  const steps = []
  let changed = false
  let unsafe = false
  for (const raw of rawSteps) {
    if (!isRecord(raw)) return null
    const action = typeof raw.action === 'string' ? raw.action : typeof raw.id === 'string' ? raw.id : ''
    const args = Object.prototype.hasOwnProperty.call(raw, 'args') ? raw.args : raw.params
    if (!action || !isRecord(args)) return null
    if (raw.action !== action || raw.args !== args || Object.prototype.hasOwnProperty.call(raw, 'id') || Object.prototype.hasOwnProperty.call(raw, 'params')) changed = true
    if (Object.keys(raw).some((key) => !['action', 'id', 'args', 'params'].includes(key))) {
      changed = true
      unsafe = true
    }
    steps.push({ action, args })
  }
  return { steps, changed, unsafe }
}

export function normalizePlanVersion(raw, context = {}) {
  if (!isRecord(raw)) return { kind: 'unsupported', warnings: [], reasonCode: 'plan-unsupported' }
  const rawSteps = Array.isArray(raw.steps) ? raw.steps : raw.actions
  const steps = normalizedSteps(rawSteps)
  const versionKnown = raw.version === 1 || raw.version === '1' || (raw.version == null && Array.isArray(rawSteps))
  const question = safeQuestion(context.question)
  const actions = Array.isArray(context.actions) ? context.actions : []
  const unsafe = containsUnsafeValue(raw) || Boolean(steps?.unsafe) || (steps ? hasWriteStep(steps.steps, actions) : false)
  const unknownAction = steps ? hasUnknownStep(steps.steps, actions) : true

  if (!versionKnown) {
    if (unsafe || unknownAction || !steps || !question) {
      return { kind: 'unsupported', warnings: [], reasonCode: 'plan-unsupported' }
    }
    const allReadOnly = steps.steps.every((step) => actionRecord(actions, step.action)?.permission !== 'write')
    if (!allReadOnly) return { kind: 'unsupported', warnings: [], reasonCode: 'plan-unsupported' }
    return { kind: 'fallback', question, warnings: ['plan-downgraded'], reasonCode: 'plan-downgraded' }
  }

  if (!steps) return { kind: 'unsupported', warnings: [], reasonCode: 'plan-unsupported' }
  const suspiciousFields = Object.keys(raw).filter((key) => /^(?:executed|execute|receipt|result|status|write|permission)$/i.test(key))
  if (suspiciousFields.length) return { kind: 'unsupported', warnings: [], reasonCode: 'plan-unsupported' }
  const summary = clip(raw.summary, 240).trim()
  if (!summary) return { kind: 'unsupported', warnings: [], reasonCode: 'plan-unsupported' }
  const warnings = []
  if (raw.version !== 1 || rawSteps !== raw.steps || steps.changed || Object.keys(raw).some((key) => !['version', 'summary', 'steps', 'actions'].includes(key))) {
    warnings.push('plan-normalized')
  }
  return {
    kind: 'plan',
    plan: { version: 1, summary, steps: steps.steps },
    warnings: [...new Set(warnings)],
  }
}

export function reasonCode(code) {
  const value = String(code || '')
  return REASON_CODES.has(value) ? value : null
}
