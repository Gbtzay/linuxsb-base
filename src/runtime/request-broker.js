import { sanitizeDiagnostic } from './redaction.js'
import { routeFingerprint, snapshotValue } from './route-utils.js'

const METHODS = new Set(['GET', 'HEAD', 'OPTIONS', 'POST', 'PUT', 'PATCH', 'DELETE'])
const IDEMPOTENT = new Set(['GET', 'HEAD', 'OPTIONS'])

function errorWith(code, message, fields = {}) {
  const error = new Error(message || code)
  error.code = code
  if (code === 'request.aborted') error.name = 'AbortError'
  Object.assign(error, fields)
  return error
}

function nowOrigin(value) {
  if (value) {
    try { return new URL(String(value)).origin } catch { /* use fallback */ }
  }
  try { return location.origin } catch { return 'https://linux.sb' }
}

function headersObject(headers) {
  if (!headers) return {}
  if (typeof headers.entries === 'function') return Object.fromEntries(headers.entries())
  return { ...headers }
}

function isFormData(value) {
  return typeof FormData !== 'undefined' && value instanceof FormData
}

function isUrlSearchParams(value) {
  return typeof URLSearchParams !== 'undefined' && value instanceof URLSearchParams
}

function hasFormToken(body) {
  if (isFormData(body) || isUrlSearchParams(body)) return body.has('_csrf') && !!body.get('_csrf')
  if (body && typeof body === 'object' && !Array.isArray(body)) return body._csrf != null && String(body._csrf) !== ''
  if (typeof body === 'string') return /(?:^|&)\s*_csrf=/.test(body)
  return false
}

function addCsrf(body, token, headers) {
  if (hasFormToken(body)) return body
  if (isFormData(body)) {
    const next = new FormData()
    for (const [key, value] of body.entries()) next.append(key, value)
    next.append('_csrf', token)
    return next
  }
  if (isUrlSearchParams(body)) {
    const next = new URLSearchParams(body)
    next.set('_csrf', token)
    return next
  }
  if (body == null) return { _csrf: token }
  if (typeof body === 'object' && !Array.isArray(body)) return { ...body, _csrf: token }
  const contentType = String(headers?.['content-type'] || headers?.['Content-Type'] || '').toLowerCase()
  if (contentType.includes('application/x-www-form-urlencoded') || typeof body === 'string') {
    const next = new URLSearchParams(String(body))
    next.set('_csrf', token)
    return next
  }
  throw errorWith('csrf.body-unsupported', '当前请求正文不支持安全的 CSRF 注入')
}

function normalizeRepresentations(value) {
  const input = value == null ? ['text'] : Array.isArray(value) ? value : [value]
  return new Set(input.map((item) => String(item)).filter((item) => ['text', 'json', 'document'].includes(item)))
}

function normalizeResponse(response, requested, requestUrl) {
  const status = Number(response?.status)
  const rawText = typeof response?.text === 'string' ? response.text : ''
  const output = {
    ok: response?.ok == null ? status >= 200 && status < 300 : !!response.ok,
    status: Number.isFinite(status) ? status : 0,
    headers: sanitizeDiagnostic(headersObject(response?.headers)),
  }
  try {
    const requestedUrl = new URL(requestUrl)
    const finalUrl = new URL(String(response?.url || requestedUrl.href), requestedUrl.href)
    if (
      ['http:', 'https:'].includes(finalUrl.protocol)
      && !finalUrl.username
      && !finalUrl.password
      && finalUrl.origin === requestedUrl.origin
      && finalUrl.href !== requestedUrl.href
    ) output.finalUrl = finalUrl.href
  } catch {
    /* 不可信或缺失的响应地址不会进入安全 envelope */
  }
  if (requested.has('text')) output.text = rawText
  if (requested.has('json')) {
    if (response && Object.prototype.hasOwnProperty.call(response, 'json')) output.json = response.json
    else {
      try { output.json = JSON.parse(rawText) } catch { output.json = null }
    }
  }
  if (requested.has('document')) {
    try {
      const Parser = typeof DOMParser !== 'undefined' ? DOMParser : null
      output.document = Parser ? new Parser().parseFromString(rawText, 'text/html') : null
    } catch { output.document = null }
  }
  return output
}

/**
 * Platform v2 的请求闸门。它只负责意图校验、能力检查、CSRF 注入、
 * 取消/超时与安全 envelope；实际网络传输仍委托给现有 Net.raw 或注入的
 * transport 函数，因此不改变 linux.sb 的端点协议。
 */
export class RequestBroker {
  constructor({ transport, snapshot = () => ({}), origin, rate = 0, timeout = 20000, trace = () => {}, clock = () => Date.now() } = {}) {
    if (!transport) throw new TypeError('RequestBroker 需要 transport')
    this.transport = transport
    this.snapshot = snapshot
    this.origin = nowOrigin(origin)
    this.rate = Math.max(0, Number(rate) || 0)
    this.timeout = Math.max(1, Number(timeout) || 20000)
    this.trace = typeof trace === 'function' ? trace : () => {}
    this.clock = typeof clock === 'function' ? clock : () => Date.now()
    this._queue = Promise.resolve()
    this._last = 0
  }

  _emit(event) {
    try { this.trace(sanitizeDiagnostic(event)) } catch { /* 诊断不能影响请求 */ }
  }

  _context(owner) {
    return owner?.require ? owner : owner?.context?.require ? owner.context : null
  }

  _require(owner, capability, purpose) {
    const context = this._context(owner)
    if (!context) {
      throw errorWith(
        'capability.denied',
        '调用方没有能力上下文',
        { owner: String(owner || 'unknown'), capability, purpose: String(purpose || '') },
      )
    }
    context.require(capability, purpose)
    return context
  }

  _routeCheck(intent, snapshot) {
    if (intent.routeScope == null) return
    const expected = typeof intent.routeScope === 'object'
      ? intent.routeScope.fingerprint ?? intent.routeScope.routeFingerprint ?? intent.routeScope.route
      : intent.routeScope
    const current = routeFingerprint(snapshot)
    if (String(expected ?? '') !== String(current ?? '')) {
      throw errorWith('route.scope-mismatch', '请求目标已离开原路由', { expected: String(expected ?? ''), current: String(current ?? '') })
    }
  }

  _csrf(snapshot, body) {
    if (hasFormToken(body)) return null
    const token = snapshot?.csrf?.token ?? snapshot?.csrf
    return token == null || String(token) === '' ? null : String(token)
  }

  _enqueue(task, signal) {
    if (!this.rate) return task()
    const run = this._queue.then(async () => {
      if (signal?.aborted) throw errorWith('request.aborted', '请求已取消')
      const wait = this.rate - (this.clock() - this._last)
      if (wait > 0) await new Promise((resolve, reject) => {
        let settled = false
        const finish = (fn, value) => {
          if (settled) return
          settled = true
          clearTimeout(timer)
          signal?.removeEventListener('abort', stop)
          fn(value)
        }
        const timer = setTimeout(() => finish(resolve), wait)
        const stop = () => finish(reject, errorWith('request.aborted', '请求已取消'))
        signal?.addEventListener('abort', stop, { once: true })
      })
      if (signal?.aborted) throw errorWith('request.aborted', '请求已取消')
      this._last = this.clock()
      return task()
    })
    this._queue = run.then(() => {}, () => {})
    return run
  }

  async _transport(url, options) {
    if (typeof this.transport === 'function') return this.transport(url, options)
    if (typeof this.transport.raw === 'function') return this.transport.raw(url, options)
    if (typeof this.transport.request === 'function') return this.transport.request({ url, ...options })
    throw new TypeError('RequestBroker transport 不支持 raw/request')
  }

  async request(intent = {}) {
    const method = String(intent.method || 'GET').toUpperCase()
    if (!METHODS.has(method)) throw errorWith('request.invalid-method', `不支持的请求方法 ${method}`)
    const rawPath = String(intent.path ?? '')
    let url
    try {
      url = new URL(rawPath, this.origin)
      if (!['http:', 'https:'].includes(url.protocol) || url.username || url.password || url.hash) throw new Error('invalid')
    } catch {
      throw errorWith('request.invalid-url', '请求 URL 无效')
    }
    const sameOrigin = url.origin === this.origin
    const external = !sameOrigin
    if (!sameOrigin && !intent.external) throw errorWith('request.cross-origin', '跨域请求必须显式 external:true')
    const snapshot = snapshotValue(this.snapshot)
    this._routeCheck(intent, snapshot)
    const purpose = String(intent.purpose || '网络请求').slice(0, 120)
    const context = this._require(intent.owner || intent.context, external ? 'net' : IDEMPOTENT.has(method) ? 'read' : 'write', purpose)
    const signal = intent.signal || context.signal
    if (signal?.aborted) throw errorWith('request.aborted', '请求已取消')
    const headers = { ...(intent.headers || {}) }
    let body = intent.body
    if (!external && !IDEMPOTENT.has(method) && intent.csrfMode !== 'none') {
      const token = this._csrf(snapshot, body)
      if (!hasFormToken(body)) {
        if (!token) throw errorWith('csrf.missing', '当前页面没有可用 CSRF token')
        body = addCsrf(body, token, headers)
      }
    }
    const timeout = Math.max(1, Number(intent.timeout ?? this.timeout) || this.timeout)
    const controller = new AbortController()
    const relay = () => controller.abort()
    signal?.addEventListener('abort', relay, { once: true })
    let timedOut = false
    const timer = setTimeout(() => { timedOut = true; controller.abort() }, timeout)
    const transportOptions = {
      method,
      body,
      headers,
      external,
      signal: controller.signal,
      timeout,
      retry: intent.retryPolicy?.retries ?? intent.retry ?? (IDEMPOTENT.has(method) ? 2 : 0),
      backoff: intent.backoff,
      queue: intent.queue,
      onChunk: intent.onChunk,
    }
    const safePath = `${url.pathname}`
    this._emit({ kind: 'request.start', owner: context.owner, purpose, method, path: safePath })
    try {
      const result = await this._enqueue(async () => {
        let call
        try {
          // Start transport in the current turn so legacy fetch callers can
          // observe the request before the first await yields control.
          call = Promise.resolve(this._transport(url.href, transportOptions))
        } catch (error) {
          call = Promise.reject(error)
        }
        const abort = new Promise((_, reject) => {
          const stop = () => reject(timedOut ? errorWith('request.timeout', '请求超时') : errorWith('request.aborted', '请求已取消'))
          controller.signal.addEventListener('abort', stop, { once: true })
          const settled = call.finally(() => controller.signal.removeEventListener('abort', stop))
          // settled is also part of the race, so a late transport rejection is handled.
          settled.catch(() => {})
        })
        return Promise.race([call, abort])
      }, signal)
      const envelope = normalizeResponse(result, normalizeRepresentations(intent.response ?? intent.representations), url.href)
      this._emit({ kind: 'request.finish', owner: context.owner, purpose, method, path: safePath, status: envelope.status, ok: envelope.ok })
      return envelope
    } catch (cause) {
      const code = timedOut ? 'request.timeout' : signal?.aborted || cause?.code === 'request.aborted' ? 'request.aborted' : cause?.code || 'request.failed'
      const safeCause = sanitizeDiagnostic(cause)
      const fallback = code === 'request.timeout' ? '请求超时' : code === 'request.aborted' ? '请求已取消' : '请求失败'
      const message = typeof safeCause?.message === 'string' && safeCause.message ? safeCause.message : fallback
      const error = errorWith(code, message)
      this._emit({ kind: 'request.error', owner: context.owner, purpose, method, path: safePath, code })
      throw error
    } finally {
      clearTimeout(timer)
      signal?.removeEventListener('abort', relay)
    }
  }
}
