const VERSION = 1
const MAX_ROUTE_SCOPE = 160
const MAX_AUTHOR = 80
const MAX_EXCERPT = 240
const MAX_CONTENT = 4000
const MAX_REASON = 80
const FRESHNESS = new Set(['fresh', 'changed', 'removed', 'unverifiable'])
const STATUSES = new Set(['unchanged', 'changed', 'removed', 'unverifiable'])

function positiveInt(value) {
  const n = Number(value)
  return Number.isSafeInteger(n) && n > 0 ? n : 0
}

function nonNegativeInt(value) {
  const n = Number(value)
  return Number.isSafeInteger(n) && n >= 0 ? n : -1
}

function clip(value, limit) {
  return Array.from(String(value ?? '')).slice(0, limit).join('')
}

function cleanText(value, limit = MAX_CONTENT) {
  return clip(String(value ?? '').normalize('NFKC').replace(/\s+/gu, ' ').trim(), limit)
}

function redact(value) {
  return String(value || '')
    .replace(/(?:https?:\/\/|\/\/)[^\s<>]+/gi, '[链接已省略]')
    .replace(/\b(?:api[-_]?key|authorization|bearer|token|_csrf|password|secret)\s*[:=]?\s*["']?[^\s,"';<>]+/gi, '[凭据已隐藏]')
    .replace(/\bsk-[a-z0-9_-]{8,}/gi, '[凭据已隐藏]')
}

function hashText(value) {
  let hash = 2166136261
  for (const ch of String(value || '')) {
    hash ^= ch.codePointAt(0)
    hash = Math.imul(hash, 16777619)
  }
  return (hash >>> 0).toString(36)
}

function normalizeScope(raw = {}) {
  const source = raw && typeof raw === 'object' ? raw : {}
  return {
    kind: cleanText(source.kind, 40),
    routeType: cleanText(source.routeType, 40),
    topicId: positiveInt(source.topicId),
    routeScope: cleanText(source.routeScope, MAX_ROUTE_SCOPE),
  }
}

function validScope(scope) {
  return Boolean(scope && typeof scope === 'object' && scope.kind && scope.routeType && positiveInt(scope.topicId))
}

function normalizePost(raw, scope) {
  const source = raw && typeof raw === 'object' ? raw : {}
  const topicId = positiveInt(source.topicId) || positiveInt(scope.topicId)
  const postId = positiveInt(source.postId ?? source.id)
  const floor = nonNegativeInt(source.floor)
  const page = positiveInt(source.page) || 1
  const authorName = redact(cleanText(source.authorName ?? source.author ?? '', MAX_AUTHOR))
  const content = redact(cleanText(source.content ?? source.body ?? '', MAX_CONTENT))
  if (!topicId || floor < 0 || !page || !content) return null
  const key = postId ? `topic:${topicId}:post:${postId}` : `topic:${topicId}:floor:${floor}:page:${page}`
  const contentFingerprint = hashText(JSON.stringify({ topicId, postId, floor, page, authorName, content }))
  return {
    key,
    topicId,
    postId: postId || null,
    floor,
    page,
    authorName: authorName || '?',
    excerpt: clip(content, MAX_EXCERPT),
    contentFingerprint,
    known: Boolean(postId),
    freshness: postId ? undefined : 'unverifiable',
    _content: content,
  }
}

function publicRow(row) {
  if (!row) return null
  const result = {
    key: cleanText(row.key, 120),
    topicId: positiveInt(row.topicId),
    postId: positiveInt(row.postId) || null,
    floor: positiveInt(row.floor),
    page: positiveInt(row.page) || 1,
    authorName: clip(redact(cleanText(row.authorName, MAX_AUTHOR)) || '?', MAX_AUTHOR),
    excerpt: clip(redact(cleanText(row.excerpt, MAX_EXCERPT)), MAX_EXCERPT),
    contentFingerprint: clip(cleanText(row.contentFingerprint, 32), 32),
    known: row.known !== false && Boolean(positiveInt(row.postId)),
  }
  if (FRESHNESS.has(row.freshness)) result.freshness = row.freshness
  if (row.reason) result.reason = clip(redact(cleanText(row.reason, MAX_REASON)), MAX_REASON)
  return result.topicId && result.floor && result.key && result.contentFingerprint ? result : null
}

function compareRows(before, after) {
  if (!before) return { status: after?.known === false ? 'unverifiable' : 'changed', reason: 'added' }
  if (!after) return { status: 'removed', reason: 'missing' }
  if (after.known === false) return { status: 'unverifiable', reason: 'missing-post-id' }
  if (before.topicId !== after.topicId || before.postId !== after.postId) return { status: 'changed', reason: 'identity' }
  if (before.floor !== after.floor) return { status: 'changed', reason: 'floor' }
  if (before.page !== after.page) return { status: 'changed', reason: 'page' }
  if (before.authorName !== after.authorName) return { status: 'changed', reason: 'author' }
  if (before.contentFingerprint !== after.contentFingerprint) return { status: 'changed', reason: 'content' }
  return { status: 'unchanged', reason: 'fingerprint' }
}
function aggregateStatus(counts) {
  if (counts.unverifiable) return 'unverifiable'
  if (counts.removed) return 'removed'
  if (counts.changed) return 'changed'
  return 'unchanged'
}

export function buildEvidenceSnapshot(posts, scope, options = {}) {
  const normalizedScope = normalizeScope(scope)
  const limit = Math.max(1, Math.min(40, positiveInt(options.maxCitations) || 40))
  const byKey = new Map()
  for (const raw of Array.isArray(posts) ? posts : []) {
    const row = normalizePost(raw, normalizedScope)
    if (!row) continue
    const current = byKey.get(row.key)
    if (!current || row._content.length > current._content.length || (row._content.length === current._content.length && row.contentFingerprint < current.contentFingerprint)) {
      byKey.set(row.key, row)
    }
  }
  const allRows = [...byKey.values()]
  const citations = allRows
    .sort((a, b) => a.topicId - b.topicId || a.page - b.page || a.floor - b.floor || String(a.postId || '').localeCompare(String(b.postId || '')) || a.key.localeCompare(b.key))
    .filter((row) => row.floor > 0)
    .slice(0, limit)
    .map((row) => {
      const output = publicRow(row)
      delete output._content
      if (output.freshness === undefined) delete output.freshness
      return output
    })
  const materialFingerprint = hashText(JSON.stringify({
    version: VERSION,
    scope: normalizedScope,
    materials: allRows
      .sort((a, b) => a.topicId - b.topicId || a.page - b.page || a.floor - b.floor || String(a.postId || '').localeCompare(String(b.postId || '')) || a.key.localeCompare(b.key))
      .map((row) => ({ key: row.key, contentFingerprint: row.contentFingerprint })),
  }))
  return { version: VERSION, scope: normalizedScope, materialFingerprint, citations }
}

export function diffEvidenceSnapshots(previous, current) {
  const valid = (snapshot) => snapshot && snapshot.version === VERSION && validScope(snapshot.scope) && Array.isArray(snapshot.citations)
  if (!valid(previous) || !valid(current)) {
    return { status: 'unverifiable', rows: [{ key: 'snapshot', status: 'unverifiable', reason: 'invalid-snapshot' }], counts: { unchanged: 0, changed: 0, removed: 0, unverifiable: 1 } }
  }
  if (JSON.stringify(normalizeScope(previous.scope)) !== JSON.stringify(normalizeScope(current.scope))) {
    return { status: 'unverifiable', rows: [{ key: 'scope', status: 'unverifiable', reason: 'scope-changed' }], counts: { unchanged: 0, changed: 0, removed: 0, unverifiable: 1 } }
  }
  const before = new Map(previous.citations.map((row) => [row.key, publicRow(row)]).filter(([, row]) => row))
  const after = new Map(current.citations.map((row) => [row.key, publicRow(row)]).filter(([, row]) => row))
  const keys = [...new Set([...before.keys(), ...after.keys()])].sort()
  const rows = []
  const counts = { unchanged: 0, changed: 0, removed: 0, unverifiable: 0 }
  for (const key of keys) {
    const result = compareRows(before.get(key), after.get(key))
    const row = { ...(after.get(key) || before.get(key) || { key }), key, status: result.status, reason: result.reason, before: before.get(key) || null, after: after.get(key) || null }
    rows.push(row)
    counts[result.status] += 1
  }
  return { status: aggregateStatus(counts), rows, counts }
}

export function mergeCitationReview(previousRows, review) {
  const base = new Map()
  for (const raw of Array.isArray(previousRows) ? previousRows : []) {
    const row = publicRow(raw)
    if (row) base.set(row.key, row)
  }
  const reviewRows = Array.isArray(review?.rows) ? review.rows : []
  for (const raw of reviewRows) {
    const key = cleanText(raw?.key, 120)
    if (!key) continue
    const current = publicRow({ ...base.get(key), ...raw, key }) || publicRow(raw)
    if (!current) continue
    const status = STATUSES.has(raw?.status) ? raw.status : review?.status
    const sameFingerprint = !raw?.contentFingerprint || !base.get(key)?.contentFingerprint || raw.contentFingerprint === base.get(key).contentFingerprint
    current.freshness = status === 'unchanged' && sameFingerprint ? 'fresh' : FRESHNESS.has(status) ? status : 'unverifiable'
    if (raw?.reason) current.reason = clip(redact(cleanText(raw.reason, MAX_REASON)), MAX_REASON)
    base.set(key, current)
  }
  return [...base.values()].slice(0, 40)
}


