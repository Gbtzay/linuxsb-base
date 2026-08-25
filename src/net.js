import { sleep } from './util.js'
import { ROUTES, readCsrf } from './site.js'

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
  }

  setCsrf(token) {
    this._csrf = token || null
  }

  csrf() {
    if (!this._csrf) this._csrf = readCsrf(document)
    return this._csrf
  }

  /** 全局串行闸门：无论谁调用，都排队按 rate 出队 */
  _gate(task) {
    const run = this._queue.then(async () => {
      const wait = this.rate - (Date.now() - this._last)
      if (wait > 0) await sleep(wait)
      this._last = Date.now()
      return task()
    })
    // 让队列不因单次失败而中断
    this._queue = run.then(() => {}, () => {})
    return run
  }

  _url(path) {
    return path.startsWith('http') ? path : this.origin + (path.startsWith('/') ? path : '/' + path)
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

  async raw(path, { method = 'GET', body = null, headers = {}, external = false, retry, timeout = 20000, backoff, queue } = {}) {
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
    const attempt = async () => {
      let lastErr
      for (let i = 0; i <= retry; i++) {
        try {
          const res = isExternal && this.gmRequest
            ? await this._viaGm(url, { method, body, headers, timeout })
            : await this._viaFetch(url, { method, body, headers, timeout })
          if (res.status === 429 || res.status === 503) {
            this.log(`限流 ${res.status}，退避重试 ${i + 1}/${retry}`)
            await sleep(bo.rate * (i + 1))
            lastErr = new Error(`HTTP ${res.status}`)
            continue
          }
          return res
        } catch (e) {
          lastErr = e
          if (i === retry) break
          await sleep(bo.err * (i + 1))
        }
      }
      throw lastErr
    }
    return useQueue ? this._gate(attempt) : attempt()
  }

  async _viaFetch(url, { method, body, headers, timeout }) {
    const ctrl = new AbortController()
    const timer = setTimeout(() => ctrl.abort(), timeout)
    try {
      const res = await fetch(url, {
        method,
        body,
        headers,
        credentials: 'same-origin',
        redirect: 'follow',
        signal: ctrl.signal,
      })
      return { status: res.status, ok: res.ok, url: res.url, text: await res.text() }
    } finally {
      clearTimeout(timer)
    }
  }

  _viaGm(url, { method, body, headers, timeout }) {
    let data = body
    if (body && typeof body !== 'string' && typeof FormData !== 'undefined' && !(body instanceof FormData)) {
      data = JSON.stringify(body)
    }
    return new Promise((resolve, reject) => {
      const fail = (why) =>
        reject(
          new Error(
            `GM 请求失败: ${url}（${why}。氢需 @connect 该域名，请确认已更新氢脚本并允许跨域）`,
          ),
        )
      this.gmRequest({
        url,
        method,
        data,
        headers,
        timeout,
        anonymous: true,
        onload: (r) => {
          if (!r || !r.status) return fail(r?.error || 'status 0，多半是域名未放行')
          resolve({ status: r.status, ok: r.status >= 200 && r.status < 300, url, text: r.responseText })
        },
        onerror: (r) => fail(r?.error || r?.status || '网络失败或被油猴拦截'),
        ontimeout: () => reject(new Error(`GM 请求超时: ${url}`)),
      })
    })
  }

  /** 取 HTML 并解析为 Document（不执行脚本、不加载子资源） */
  async doc(path, opts = {}) {
    const key = `GET ${this._url(path)}`
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

  /** 回复帖子 */
  async reply(topicId, body, extra = {}) {
    if (!body || !String(body).trim()) throw new Error('回复内容不能为空')
    const res = await this.net.form(ROUTES.post.reply, { topic_id: topicId, body, ...extra })
    return { ok: res.ok, status: res.status, raw: res.text }
  }

  /** 收藏 / 取消收藏（服务端切换） */
  async toggleFavorite(topicId) {
    const res = await this.net.form(ROUTES.post.favorite, { topic_id: topicId })
    return { ok: res.ok, status: res.status }
  }

  /** 点赞或投币；type: 'topic' | 'reply'，coin 为投币数（0 = 仅点赞） */
  async likeCoin({ type = 'reply', id, coin = 0 }) {
    const res = await this.net.form(ROUTES.post.likeCoin, {
      like_coin_type: type,
      like_coin_id: id,
      ...(coin ? { coin } : {}),
    })
    return { ok: res.ok, status: res.status, raw: res.text }
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
