import { abortError, throwIfAborted, withAbort, abortableDelay } from './abort.js'
import { ROUTES, readCsrf } from './site.js'

const WRITE_MESSAGE_LIMIT = 240

function normalizeRequestUrl(path, origin) {
  const raw = String(path ?? '')
  let url
  try {
    url = new URL(raw, origin)
  } catch {
    throw new Error(`请求 URL 无效：${raw.slice(0, 160)}`)
  }
  if (!['http:', 'https:'].includes(url.protocol)) {
    throw new Error(`请求 URL 协议不受支持：${url.protocol || 'unknown'}`)
  }
  if (url.username || url.password) {
    throw new Error('请求 URL 不得包含用户名或密码')
  }
  if (url.hash) {
    throw new Error('请求 URL 不得包含 hash fragment')
  }
  return url.href
}

function writeMessage(value) {
  const text = String(value || '').replace(/[\u0000-\u001f\u007f]/g, ' ').replace(/\s+/g, ' ').trim()
  return text.slice(0, WRITE_MESSAGE_LIMIT)
}

function safeWriteRedirect(value, origin) {
  if (!value) return ''
  try {
    const url = new URL(String(value), origin)
    if (url.origin !== origin || url.hash) return ''
    const allowed =
      /^\/topic\/\d+(?:\/)?$/.test(url.pathname) ||
      /^\/forum\/\d+(?:\/)?$/.test(url.pathname) ||
      /^\/user\/\d+(?:\/)?$/.test(url.pathname) ||
      /^\/index\.php$/.test(url.pathname) ||
      /^\/topic_edit\/?$/.test(url.pathname) ||
      /^\/daily_checkin\/?$/.test(url.pathname)
    if (!allowed) return ''
    return url.pathname + url.search
  } catch {
    return ''
  }
}

/**
 * 解析本站写接口的响应。
 * BBS1ORG 的 AJAX 写接口以 JSON {ok: 1|0, message|tip, redirect} 为协议；
 * 只有明确的 ok 才能判定成功，HTTP 2xx 或 HTML 页面本身不能代表成功。
 * 网络异常不会进入此函数，由调用方标记为 unknown。
 */
export function classifyWriteResponse(response, { actionPath = '' } = {}) {
  const status = Number(response?.status)
  const output = { outcome: 'unknown', status: Number.isFinite(status) ? status : 0 }
  if (!Number.isFinite(status) || status <= 0) return output
  const raw = String(response?.text || '')
  let data = null
  try {
    data = JSON.parse(raw)
  } catch {
    data = null
  }
  if (status >= 500) return { ...output, outcome: 'unknown', message: `HTTP ${status}` }
  if (status < 200 || status >= 300) {
    return {
      ...output,
      outcome: 'failure',
      message: writeMessage(data?.message || data?.tip || `HTTP ${status}`),
    }
  }
  if (status === 204) return output
  if (!data || typeof data !== 'object' || Array.isArray(data)) return output

  const explicit = data.ok
  const message = writeMessage(data.message || data.tip)
  let origin = 'https://linux.sb'
  try { origin = new URL(String(response?.url || origin), origin).origin } catch { /* use default origin */ }
  const redirect = safeWriteRedirect(data.redirect, origin)
  if (explicit === true || explicit === 1 || explicit === '1') {
    return { ...output, outcome: 'success', message, ...(redirect ? { redirect } : {}) }
  }
  if (explicit === false || explicit === 0 || explicit === '0') {
    return { ...output, outcome: 'failure', message: message || `本站拒绝了${actionPath || '写入'}请求` }
  }
  return { ...output, message, ...(redirect ? { redirect } : {}) }
}

/**
 * 网络层：所有插件的站内请求都必须走这里。
 *
 * 为什么强制统一出口：
 *  - 全局串行 + 限速，防止 N 个插件各自狂发请求把账号刷成 429 / 触发 Cloudflare
 *  - 自动注入 _csrf，token 过期时从新页面重新取
 *  - 同源限制：默认只允许 linux.sb，跨域必须显式声明（GM_xmlhttpRequest 才有权限）
 */
export class Net {
  constructor({ origin = location.origin, rate = 900, log = () => {}, gmRequest = null } = {}) {
    this.origin = origin
    this.rate = rate // 相邻请求最小间隔（ms）
    this.log = log
    this.gmRequest = gmRequest // GM_xmlhttpRequest，跨域时使用
    this._queue = Promise.resolve()
    this._last = 0
    this._csrf = null
    this._inflight = new Map() // 相同 GET 去重
    this._signalIds = new WeakMap()
    this._nextSignalId = 1
  }

  setCsrf(token) {
    this._csrf = token || null
  }

  classifyWrite(response, opts = {}) {
    return classifyWriteResponse(response, opts)
  }

  csrf() {
    if (!this._csrf) this._csrf = readCsrf(document)
    return this._csrf
  }

  /** 全局串行闸门：无论谁调用，都排队按 rate 出队 */
  _gate(task, signal) {
    const run = this._queue.then(async () => {
      throwIfAborted(signal)
      const wait = this.rate - (Date.now() - this._last)
      if (wait > 0) await abortableDelay(wait, signal)
      throwIfAborted(signal)
      this._last = Date.now()
      return task()
    })
    // 让队列不因单次失败而中断
    this._queue = run.then(() => {}, () => {})
    return withAbort(run, signal)
  }

  _url(path) {
    return normalizeRequestUrl(path, this.origin)
  }

  _inflightKey(url, signal) {
    if (!signal || (typeof signal !== 'object' && typeof signal !== 'function')) return `GET ${url}`
    let id = this._signalIds.get(signal)
    if (!id) {
      id = this._nextSignalId++
      this._signalIds.set(signal, id)
    }
    return `GET ${url} signal:${id}`
  }

  _sameOrigin(url) {
    try {
      return new URL(url, this.origin).origin === this.origin
    } catch {
      return false
    }
  }

  /** 供权限层判定「这是站内请求还是站外请求」（core 的 write/net 分流依据） */
  isSameOrigin(path) {
    return this._sameOrigin(this._url(path))
  }

  /**
   * 仅供 Platform v2 RequestBroker 使用的传输委托。
   * 不增加新的端点语义，仍由 raw 统一执行限速、取消、重试和 GM/fetch 选择。
   */
  transport(path, opts = {}) {
    return this.raw(path, opts)
  }

  async raw(path, { method = 'GET', body = null, headers = {}, external = false, retry, timeout = 20000, backoff, queue, signal, onChunk } = {}) {
    throwIfAborted(signal)
    const url = this._url(path)
    if (!this._sameOrigin(url) && !external) {
      throw new Error(`跨域请求被拒绝：${url}（需 external:true 且脚本已 @connect）`)
    }
    // 非幂等方法默认不重试：POST 重发会造成重复回复/重复签到这类不可撤销的副作用。
    // 需要重试的调用方必须显式传 retry。
    const idempotent = method === 'GET' || method === 'HEAD'
    if (retry == null) retry = idempotent ? 2 : 0
    const bo = { rate: 1500, err: 800, ...(backoff || {}) }
    const isExternal = !this._sameOrigin(url)
    // 限速队列的存在意义是保护 linux.sb 不被众插件刷成 429，站外请求不该占用它——
    // 一次 LLM 调用可能挂 60s+，排在它后面的站内请求全部饿死（实时流停摆、悬浮卡转圈）。
    // 故站外请求默认绕过闸门；调用方可用 queue:true 显式要求排队。
    const useQueue = queue == null ? !isExternal : !!queue
    let delivered = false
    const notify = typeof onChunk === 'function' ? (chunk) => {
      throwIfAborted(signal)
      if (!chunk) return
      delivered = true
      onChunk(chunk)
    } : null
    const attempt = async () => {
      let lastErr
      for (let i = 0; i <= retry; i++) {
        throwIfAborted(signal)
        try {
          const res = isExternal && this.gmRequest
            ? await this._viaGm(url, { method, body, headers, timeout, signal, onChunk: notify })
            : await this._viaFetch(url, { method, body, headers, timeout, signal, onChunk: notify })
          throwIfAborted(signal)
          if (res.status === 429 || res.status === 503) {
            if (i === retry) return res
            this.log(`限流 ${res.status}，退避重试 ${i + 1}/${retry}`)
            await abortableDelay(bo.rate * (i + 1), signal)
            lastErr = new Error(`HTTP ${res.status}`)
            continue
          }
          return res
        } catch (e) {
          throwIfAborted(signal)
          if (delivered) throw e
          lastErr = e
          if (i === retry) break
          await abortableDelay(bo.err * (i + 1), signal)
        }
      }
      throw lastErr
    }
    return useQueue ? this._gate(attempt, signal) : attempt()
  }

  async _viaFetch(url, { method, body, headers, timeout, signal, onChunk }) {
    throwIfAborted(signal)
    const ctrl = new AbortController()
    const stop = () => ctrl.abort()
    signal?.addEventListener('abort', stop, { once: true })
    const timer = setTimeout(() => ctrl.abort(), timeout)
    try {
      const res = await withAbort(fetch(url, {
        method,
        body,
        headers,
        credentials: 'same-origin',
        redirect: 'follow',
        signal: ctrl.signal,
      }), ctrl.signal)
      let text = ''
      if (onChunk && res.ok && res.body?.getReader && typeof TextDecoder === 'function') {
        const reader = res.body.getReader()
        const decoder = new TextDecoder()
        try {
          for (;;) {
            const { done, value } = await withAbort(reader.read(), ctrl.signal)
            const chunk = done ? decoder.decode() : decoder.decode(value, { stream: true })
            text += chunk
            if (text.length > 1000000) throw new Error('流式响应超过长度上限')
            throwIfAborted(ctrl.signal)
            if (chunk) onChunk(chunk)
            if (done) break
          }
        } catch (error) {
          void reader.cancel().catch(() => {})
          throw error
        } finally { reader.releaseLock?.() }
      } else {
        text = await withAbort(res.text(), ctrl.signal)
        throwIfAborted(ctrl.signal)
        if (onChunk && res.ok) {
          if (text.length > 1000000) throw new Error('流式响应超过长度上限')
          onChunk(text)
        }
      }
      throwIfAborted(ctrl.signal)
      return { status: res.status, ok: res.ok, url: res.url, text }
    } finally {
      clearTimeout(timer)
      signal?.removeEventListener('abort', stop)
    }
  }

  _viaGm(url, { method, body, headers, timeout, signal, onChunk }) {
    throwIfAborted(signal)
    let data = body
    if (body && typeof body !== 'string' && typeof FormData !== 'undefined' && !(body instanceof FormData)) {
      data = JSON.stringify(body)
    }
    return new Promise((resolve, reject) => {
      let settled = false
      let handle
      let offset = 0
      const finish = (fn, value) => {
        if (settled) return
        settled = true
        signal?.removeEventListener('abort', stop)
        fn(value)
      }
      const stop = () => {
        finish(reject, abortError())
        try { handle?.abort?.() } catch { /* Cancellation already settled the caller. */ }
      }
      const fail = (why) =>
        finish(reject,
          new Error(
            `GM 请求失败: ${url}（${why}。氢需 @connect 该域名，请确认已更新氢脚本并允许跨域）`,
          ),
        )
      signal?.addEventListener('abort', stop, { once: true })
      const progress = (r) => {
        if (settled || !onChunk || r?.status < 200 || r?.status >= 300) return
        const text = String(r?.responseText || '')
        if (text.length < offset) return
        try {
          if (text.length > 1000000) throw new Error('流式响应超过长度上限')
          const end = /[\uD800-\uDBFF]$/.test(text) ? text.length - 1 : text.length
          const chunk = text.slice(offset, end)
          offset = end
          if (chunk) onChunk(chunk)
        } catch (error) {
          finish(reject, error)
          try { handle?.abort?.() } catch { /* Rejection already recorded. */ }
        }
      }
      try { handle = this.gmRequest({
        url,
        method,
        data,
        headers,
        timeout,
        anonymous: true,
        responseType: 'text',
        onprogress: progress,
        onreadystatechange: progress,
        onload: (r) => {
          if (settled) return
          if (!r || !r.status) return fail(r?.error || 'status 0，多半是域名未放行')
          progress(r)
          finish(resolve, { status: r.status, ok: r.status >= 200 && r.status < 300, url, text: r.responseText })
        },
        onerror: (r) => fail(r?.error || r?.status || '网络失败或被油猴拦截'),
        ontimeout: () => finish(reject, new Error(`GM 请求超时: ${url}`)),
        onabort: () => finish(reject, abortError()),
      }) } catch (error) { finish(reject, error) }
      if (signal?.aborted) stop()
    })
  }

  /** 取 HTML 并解析为 Document（不执行脚本、不加载子资源） */
  async doc(path, opts = {}) {
    const key = this._inflightKey(this._url(path), opts.signal)
    if (this._inflight.has(key)) return this._inflight.get(key)
    const p = (async () => {
      const res = await this.raw(path, opts)
      if (!res.ok) throw new Error(`${path} → HTTP ${res.status}`)
      const d = new DOMParser().parseFromString(res.text, 'text/html')
      const t = readCsrf(d)
      if (t) this._csrf = t // 顺带续期 token
      return d
    })()
    this._inflight.set(key, p)
    try {
      return await p
    } finally {
      this._inflight.delete(key)
    }
  }

  async json(path, opts = {}) {
    const res = await this.raw(path, {
      ...opts,
      headers: { accept: 'application/json', ...(opts.headers || {}) },
    })
    try {
      return JSON.parse(res.text)
    } catch {
      throw new Error(`${path} 返回非 JSON（HTTP ${res.status}）`)
    }
  }

  /** 固定站内搜索语义：POST /search 后只接受同源的已知 redirect。 */
  async search(query, field = 'title', opts = {}) {
    const q = String(query || '').trim()
    if (!q || q.length > 120 || /[\u0000-\u001f\u007f]/.test(q)) throw new Error('关键词长度或字符不合法')
    if (!['title', 'body', 'reply'].includes(field)) throw new Error('搜索字段不合法')
    const res = await this.form(ROUTES.post.search, { q, field }, opts)
    if (!res?.ok) throw new Error(`HTTP ${Number(res?.status) || 0}`)
    let parsed
    try {
      parsed = JSON.parse(res.text || '{}')
    } catch {
      throw new Error('搜索接口返回异常')
    }
    if (!(parsed && (parsed.ok === true || parsed.ok === 1 || parsed.ok === '1'))) {
      throw new Error(String(parsed?.message || parsed?.tip || '搜索接口返回异常'))
    }
    let target
    try {
      target = new URL(parsed.redirect || '', this.origin)
    } catch {
      throw new Error('搜索接口返回了未知 redirect')
    }
    const targetPath = target.pathname + target.search
    if (target.origin !== this.origin || !/^\/(?:index\.php|search)(?:\?|$)/.test(targetPath)) {
      throw new Error('搜索接口返回了站外或未知 redirect')
    }
    return { url: targetPath, doc: await this.doc(targetPath, opts) }
  }

  /** 表单 POST，自动带 _csrf。fields 为普通对象或 FormData */
  async form(path, fields = {}, opts = {}) {
    const fd = fields instanceof FormData ? fields : new FormData()
    if (!(fields instanceof FormData)) {
      for (const [k, v] of Object.entries(fields)) {
        if (v !== undefined && v !== null) fd.append(k, v)
      }
    }
    if (!fd.has('_csrf')) {
      const token = this.csrf()
      if (!token) throw new Error('缺少 _csrf：当前页面未登录或未渲染表单')
      fd.append('_csrf', token)
    }
    const res = await this.raw(path, {
      method: 'POST',
      body: fd,
      headers: { 'x-requested-with': 'XMLHttpRequest', ...(opts.headers || {}) },
      ...opts,
    })
    return res
  }
}

/**
 * 站点动作：把「发回复」「收藏」「点赞」这类写操作包成语义化 API。
 * 写操作有副作用，因此需要插件在 manifest 声明 'write' 权限（见 core.js）。
 */
export class Actions {
  constructor(net) {
    this.net = net
  }

  async _write(path, fields) {
    const res = await this.net.form(path, fields)
    const parsed = classifyWriteResponse(res, { actionPath: path })
    return {
      ok: parsed.outcome === 'success',
      outcome: parsed.outcome,
      status: parsed.status,
      ...(parsed.message ? { message: parsed.message } : {}),
      ...(parsed.redirect ? { redirect: parsed.redirect } : {}),
    }
  }

  /** 回复帖子 */
  async reply(topicId, body, extra = {}) {
    if (!body || !String(body).trim()) throw new Error('回复内容不能为空')
    return this._write(ROUTES.post.reply, { topic_id: topicId, body, ...extra })
  }

  /** 发布新主题 */
  async topic(forumId, title, body, extra = {}) {
    if (!title || !String(title).trim()) throw new Error('主题标题不能为空')
    if (!body || !String(body).trim()) throw new Error('主题内容不能为空')
    return this._write(ROUTES.post.topic, { forum_id: forumId, title, body, ...extra })
  }

  /** 收藏 / 取消收藏（服务端切换） */
  async toggleFavorite(topicId) {
    return this._write(ROUTES.post.favorite, { topic_id: topicId })
  }

  /** 点赞或投币；type: 'topic' | 'reply'，coin 为投币数（0 = 仅点赞） */
  async likeCoin({ type = 'reply', id, coin = 0 }) {
    return this._write(ROUTES.post.likeCoin, {
      like_coin_type: type,
      like_coin_id: id,
      ...(coin ? { coin } : {}),
    })
  }

  /** Markdown 预览（站点自带 /nb_editor_preview） */
  async preview(body) {
    const res = await this.net.form(ROUTES.post.preview, { body })
    return res.text
  }

  /**
   * 搜索：field = title | body | reply。
   * GET 与 POST 各试一次，用「响应像不像搜索页」做合理性校验——
   * 旧实现盲信 GET 返回，站点回退到首页列表时把 53 条首页帖当搜索结果（误报根源）。
   */
  /**
   * 搜索（实测协议）：POST /search {_csrf,q} → JSON {ok:1,redirect:'/index.php?q=..&field=..'}
   * → GET 该 redirect 即结果列表页。旧 GET 直连会被 302 回首页造成假命中。
   */
  async search(q, field = 'title') {
    const res = await this.net.form(ROUTES.post.search, { q, field })
    let j = null
    try { j = JSON.parse(res.text || '') } catch { /* 非 JSON */ }
    if (!(j && j.ok && j.redirect)) {
      throw new Error('搜索接口返回异常：' + String(res.text || '').slice(0, 80))
    }
    return await this.net.doc(j.redirect)
  }


  /** 打赏动态流 */
  async donateFeed(topicId, lastId = 0) {
    return this.net.json(`${ROUTES.donateFeed}?topic_id=${topicId}&last_id=${lastId}`)
  }
}
