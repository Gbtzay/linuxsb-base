import { sanitizeDiagnostic } from './redaction.js'

/** Platform v2 支持的能力名称。未知名称永远不会被授予。 */
export const CAPABILITIES = Object.freeze([
  'read',
  'write',
  'storage',
  'ui',
  'net',
  'admin',
  'events',
])

const KNOWN = new Set(CAPABILITIES)

function normalizeCapabilities(manifest) {
  const input = manifest?.permissions ?? manifest?.capabilities ?? []
  const values = Array.isArray(input) ? input : []
  return Object.freeze([...new Set(values.map((value) => String(value)).filter((value) => KNOWN.has(value)))])
}

function capabilityError(code, fields, message) {
  const error = new Error(message || code)
  error.code = code
  for (const [key, value] of Object.entries(fields || {})) error[key] = value
  return error
}

function safePurpose(purpose) {
  return String(purpose || '未说明用途').replace(/[\u0000-\u001f\u007f]/g, ' ').slice(0, 120)
}

/**
 * 创建插件范围的能力上下文。
 *
 * 上下文是本地安全链的唯一能力检查入口。它不把 token、请求正文或
 * 其它插件对象放入错误对象；调用方可以把 context 传给 RequestBroker
 * 与 ActionBroker 继续做同一条能力链的校验。
 */
export function createCapabilityContext(manifest = {}, services = {}) {
  const parent = services.parent || null
  const owner = String(manifest.id || services.owner || 'anonymous')
  const capabilities = normalizeCapabilities(manifest)
  const capabilitySet = new Set(capabilities)
  const controller = new AbortController()
  let disposed = false
  let parentStop = null
  const disposers = []

  const parentSignal = services.signal || parent?.signal
  if (parentSignal) {
    const abort = () => controller.abort()
    parentStop = abort
    if (parentSignal.aborted) controller.abort()
    else parentSignal.addEventListener('abort', abort, { once: true })
  }

  const context = {
    owner,
    capabilities,
    signal: controller.signal,
    get disposed() {
      return disposed
    },
    require(capability, purpose) {
      const name = String(capability || '')
      if (disposed) {
        throw capabilityError('capability.disposed', { owner, capability: name, purpose: safePurpose(purpose) }, '能力上下文已停用')
      }
      if (!capabilitySet.has(name)) {
        throw capabilityError(
          'capability.denied',
          { owner, capability: name, purpose: safePurpose(purpose) },
          `插件 ${owner} 未声明 '${name}' 权限，无法 ${safePurpose(purpose)}`,
        )
      }
      return true
    },
    child(purpose, allowed = capabilities) {
      if (disposed) throw capabilityError('capability.disposed', { owner, purpose: safePurpose(purpose) }, '能力上下文已停用')
      const requested = Array.isArray(allowed) ? [...new Set(allowed.map((value) => String(value)))] : []
      const escalation = requested.filter((name) => !capabilitySet.has(name))
      if (escalation.length) {
        throw capabilityError(
          'capability.escalation',
          { owner, purpose: safePurpose(purpose), capabilities: Object.freeze(escalation) },
          '子上下文不能扩大能力范围',
        )
      }
      const childContext = createCapabilityContext(
        { id: `${owner}/${safePurpose(purpose)}`, permissions: requested },
        { parent: context, signal: controller.signal },
      )
      context.own(() => childContext.dispose())
      return childContext
    },
    own(dispose) {
      if (typeof dispose !== 'function') throw new TypeError('能力清理器必须是函数')
      if (disposed) {
        try { dispose() } catch { /* 清理器错误不应阻断其它收摊路径 */ }
        return dispose
      }
      disposers.push(dispose)
      return dispose
    },
    dispose() {
      if (disposed) return
      disposed = true
      controller.abort()
      if (parentSignal && parentStop) parentSignal.removeEventListener('abort', parentStop)
      for (const dispose of disposers.splice(0)) {
        try { dispose() } catch { /* 生命周期清理必须继续 */ }
      }
    },
    summary() {
      return Object.freeze({ owner, capabilities })
    },
  }

  // services 只用于把基座自己的清理钩子挂到上下文，不暴露 service 对象给插件。
  if (typeof services.onDispose === 'function') context.own(services.onDispose)
  if (parent) parent.own(() => context.dispose())

  return context
}

export { sanitizeDiagnostic }
