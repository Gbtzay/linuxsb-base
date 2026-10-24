const DEFAULT_SENSITIVE = /(?:authorization|cookie|csrf|api[-_]?key|token|password|passwd|secret|credential|body|raw[-_]?query)/i
const URL_RE = /^https?:\/\//i

function redactString(value) {
  const input = String(value)
  if (URL_RE.test(input)) {
    try {
      const url = new URL(input)
      return `${url.origin}${url.pathname}`
    } catch {
      /* fall through to conservative text redaction */
    }
  }
  return input
    .replace(/\b(?:Bearer|Basic)\s+[^\s]+/gi, '[redacted]')
    .replace(/([?&](?:token|key|api_key|csrf|code|secret|password)=)[^&#\s]*/gi, '$1[redacted]')
}

/**
 * 递归清理诊断对象。默认保留稳定 reason/code 等字段，敏感字段值统一
 * 替换为固定标记；循环引用和过深对象被安全截断。
 */
export function sanitizeDiagnostic(value, policy = {}) {
  const sensitive = policy.sensitiveKeys instanceof RegExp ? policy.sensitiveKeys : DEFAULT_SENSITIVE
  const maxDepth = Number.isFinite(policy.maxDepth) ? Math.max(1, policy.maxDepth) : 8
  const seen = new WeakSet()

  const walk = (input, key, depth) => {
    if (key != null && sensitive.test(String(key))) return '[redacted]'
    if (input == null || typeof input === 'boolean' || typeof input === 'number') return input
    if (typeof input === 'string') return redactString(input)
    if (typeof input === 'bigint') return `${input}n`
    if (typeof input === 'function' || typeof input === 'symbol') return '[redacted]'
    if (depth >= maxDepth) return '[truncated]'
    if (seen.has(input)) return '[circular]'
    seen.add(input)

    const crossRealmError = Object.prototype.toString.call(input) === '[object Error]'
      || (typeof input.message === 'string' && typeof input.name === 'string' && (
        input.name.endsWith('Error') || input.name === 'DOMException'
      ))
    if (input instanceof Error || crossRealmError) {
      return {
        name: redactString(input.name),
        code: input.code == null ? undefined : redactString(input.code),
        message: redactString(input.message),
      }
    }
    if (Array.isArray(input)) return input.map((item) => walk(item, null, depth + 1))
    if (input instanceof URL) return `${input.origin}${input.pathname}`
    const out = {}
    for (const [childKey, childValue] of Object.entries(input)) out[childKey] = walk(childValue, childKey, depth + 1)
    return out
  }

  return walk(value, null, 0)
}
