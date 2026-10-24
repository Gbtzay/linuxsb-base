const PROTOCOLS = new Set(['openai', 'anthropic'])
const OUTCOMES = new Set(['ok', 'error', 'cancelled', 'invalid'])
const STATUS_CLASSES = new Set(['2xx', '4xx', '5xx', 'network', 'unknown'])
const REASONS = new Set([
  'ok',
  'configured-missing',
  'endpoint-invalid',
  'protocol-invalid',
  'http-auth',
  'http-rate-limit',
  'http-server',
  'http-error',
  'stream-unsupported',
  'timeout',
  'cancelled',
  'network',
])

function cleanText(value, limit = 160) {
  return String(value ?? '')
    .replace(/[\u0000-\u001f\u007f]/g, '')
    .trim()
    .slice(0, limit)
}

function protocolValue(value) {
  const text = cleanText(value, 40).toLocaleLowerCase('en-US')
  if (text === 'anthropic') return 'anthropic'
  if (text === 'openai') return 'openai'
  return ''
}

function statusClass(status) {
  const value = Number(status)
  if (!Number.isFinite(value) || value <= 0) return 'network'
  if (value >= 200 && value < 300) return '2xx'
  if (value >= 400 && value < 500) return '4xx'
  if (value >= 500 && value < 600) return '5xx'
  return 'unknown'
}

function protocolFromUrl(url) {
  if (/(?:^|\.)anthropic\.com$/i.test(url.hostname)) return 'anthropic'
  const path = url.pathname.replace(/\/+$/, '')
  if (path.endsWith('/messages') && !path.endsWith('/chat/completions')) return 'anthropic'
  return 'openai'
}

/** Normalize provider configuration without retaining credentials or query strings. */
export function normalizeEndpoint({ apiUrl = '', apiStyle = '', model = '' } = {}, baseHref = 'https://linux.sb/') {
  const raw = String(apiUrl || '').trim()
  const forced = protocolValue(apiStyle)
  const empty = {
    valid: false,
    protocol: forced || 'openai',
    origin: '',
    path: '',
    modelKey: cleanText(model, 120),
    key: '',
    reasonCode: 'endpoint-invalid',
  }
  if (!raw) return empty
  let url
  try {
    url = new URL(raw, baseHref)
  } catch {
    return empty
  }
  if (!['http:', 'https:'].includes(url.protocol) || url.username || url.password || !url.hostname) return empty
  const path = url.pathname.replace(/\/{2,}/g, '/').replace(/\/+$/, '') || '/'
  const protocol = forced || protocolFromUrl(url)
  const modelKey = cleanText(model, 120)
  const origin = url.origin
  return {
    valid: true,
    protocol: PROTOCOLS.has(protocol) ? protocol : 'openai',
    origin,
    path,
    modelKey,
    key: `${PROTOCOLS.has(protocol) ? protocol : 'openai'}|${origin}${path}|${modelKey}`,
    reasonCode: 'ok',
  }
}

function capabilityFlags({ json = false, stream = false, cancel = false } = {}) {
  return { json: Boolean(json), stream: Boolean(stream), cancel: Boolean(cancel) }
}

/** Classify one explicit probe attempt; never includes response text or endpoint data. */
export function classifyProbeResponse({
  protocol = 'openai',
  status = 0,
  contentType = '',
  sawDelta = false,
  completed = false,
  aborted = false,
  elapsedMs = 0,
} = {}) {
  const safeProtocol = PROTOCOLS.has(protocolValue(protocol)) ? protocolValue(protocol) : 'openai'
  const safeStatus = Number(status)
  const statusKind = statusClass(safeStatus)
  const elapsed = Number.isFinite(Number(elapsedMs)) ? Math.max(0, Math.min(600000, Math.trunc(Number(elapsedMs)))) : 0
  const type = cleanText(contentType, 120).toLocaleLowerCase('en-US')
  if (aborted) {
    return {
      protocol: safeProtocol,
      outcome: 'cancelled',
      capabilities: capabilityFlags({ cancel: true }),
      statusClass: statusKind,
      reasonCode: 'cancelled',
      elapsedMs: elapsed,
    }
  }
  if (statusKind === 'network') {
    return {
      protocol: safeProtocol,
      outcome: 'error',
      capabilities: capabilityFlags(),
      statusClass: statusKind,
      reasonCode: 'network',
      elapsedMs: elapsed,
    }
  }
  if (safeStatus === 401 || safeStatus === 403) {
    return { protocol: safeProtocol, outcome: 'error', capabilities: capabilityFlags(), statusClass: statusKind, reasonCode: 'http-auth', elapsedMs: elapsed }
  }
  if (safeStatus === 429) {
    return { protocol: safeProtocol, outcome: 'error', capabilities: capabilityFlags(), statusClass: statusKind, reasonCode: 'http-rate-limit', elapsedMs: elapsed }
  }
  if (statusKind === '5xx') {
    return { protocol: safeProtocol, outcome: 'error', capabilities: capabilityFlags(), statusClass: statusKind, reasonCode: 'http-server', elapsedMs: elapsed }
  }
  if (statusKind !== '2xx') {
    return { protocol: safeProtocol, outcome: 'error', capabilities: capabilityFlags(), statusClass: statusKind, reasonCode: 'http-error', elapsedMs: elapsed }
  }
  const isStream = sawDelta || type.includes('text/event-stream')
  const isJson = !isStream && (type.includes('json') || type === '')
  if (!completed || (!isStream && !isJson)) {
    return { protocol: safeProtocol, outcome: 'invalid', capabilities: capabilityFlags(), statusClass: statusKind, reasonCode: 'protocol-invalid', elapsedMs: elapsed }
  }
  return {
    protocol: safeProtocol,
    outcome: 'ok',
    capabilities: capabilityFlags({ json: isJson, stream: isStream }),
    statusClass: statusKind,
    reasonCode: 'ok',
    elapsedMs: elapsed,
  }
}

/** Keep only the stable, non-sensitive fields used by settings and workbench UI. */
export function redactDiagnostic(raw = {}) {
  const protocol = PROTOCOLS.has(protocolValue(raw.protocol)) ? protocolValue(raw.protocol) : 'openai'
  const outcome = OUTCOMES.has(String(raw.outcome)) ? String(raw.outcome) : 'invalid'
  const status = STATUS_CLASSES.has(String(raw.statusClass)) ? String(raw.statusClass) : 'unknown'
  const reasonCode = REASONS.has(String(raw.reasonCode)) ? String(raw.reasonCode) : 'protocol-invalid'
  const elapsed = Number.isFinite(Number(raw.elapsedMs)) ? Math.max(0, Math.min(600000, Math.trunc(Number(raw.elapsedMs)))) : 0
  const createdAt = Number.isFinite(Number(raw.createdAt)) && Number(raw.createdAt) > 0 ? Math.trunc(Number(raw.createdAt)) : Date.now()
  return {
    version: 1,
    protocol,
    outcome,
    capabilities: capabilityFlags(raw.capabilities),
    statusClass: status,
    elapsedMs: elapsed,
    reasonCode,
    createdAt,
  }
}
