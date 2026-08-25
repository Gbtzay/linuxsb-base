import { clone, uid } from './util.js'

/**
 * 事件总线：插件间的主要通信方式。
 *
 * - 支持命名空间通配：on('topic:*') / on('*')
 * - emit 的 payload 默认深拷贝，防止一个插件改写另一个插件的对象
 * - 监听器异常被隔离，不会中断其它监听器
 * - request/respond：一对一 RPC，用于「A 插件向 B 插件要数据」
 */
export class Bus {
  constructor({ onError } = {}) {
    this._map = new Map() // event → Set<handlerRecord>
    this._handlers = new Map() // requestName → { owner, fn }
    this._onError = onError || ((e, info) => console.error('[LSB bus]', info, e))
    this._replay = new Map() // 粘性事件：晚注册的插件也能拿到最后一次值
  }

  on(event, fn, { owner = 'anonymous', once = false } = {}) {
    if (typeof fn !== 'function') throw new TypeError('on(event, fn): fn 必须是函数')
    const rec = { fn, owner, once, event }
    if (!this._map.has(event)) this._map.set(event, new Set())
    this._map.get(event).add(rec)
    // 粘性事件补发
    if (this._replay.has(event)) {
      const { payload, meta } = this._replay.get(event)
      this._invoke(rec, clone(payload), meta)
    }
    return () => this.off(event, fn)
  }

  once(event, fn, opts = {}) {
    return this.on(event, fn, { ...opts, once: true })
  }

  off(event, fn) {
    const set = this._map.get(event)
    if (!set) return false
    for (const rec of set) {
      if (rec.fn === fn) {
        set.delete(rec)
        if (!set.size) this._map.delete(event)
        return true
      }
    }
    return false
  }

  /** 卸载某个插件的所有监听与 handler */
  offOwner(owner) {
    for (const [event, set] of [...this._map]) {
      for (const rec of [...set]) if (rec.owner === owner) set.delete(rec)
      if (!set.size) this._map.delete(event)
    }
    for (const [name, rec] of [...this._handlers]) {
      if (rec.owner === owner) this._handlers.delete(name)
    }
  }

  /**
   * @param {string} event
   * @param {any} payload
   * @param {{ sticky?: boolean, source?: string, raw?: boolean }} opts
   *   sticky: 记住最后一次，后注册的监听者立即收到（如 site:ready）
   *   raw:    不深拷贝（传 DOM 节点时用）
   */
  emit(event, payload, opts = {}) {
    const meta = { event, source: opts.source || 'core', ts: Date.now(), id: uid('ev') }
    const data = opts.raw ? payload : clone(payload)
    if (opts.sticky) this._replay.set(event, { payload: data, meta })
    let n = 0
    for (const key of this._matching(event)) {
      for (const rec of [...(this._map.get(key) || [])]) {
        n++
        this._invoke(rec, data, meta)
      }
    }
    return n
  }

  _invoke(rec, payload, meta) {
    if (rec.once) this._map.get(rec.event)?.delete(rec)
    try {
      const r = rec.fn(payload, meta)
      if (r && typeof r.catch === 'function') {
        r.catch((e) => this._onError(e, { event: meta.event, owner: rec.owner, async: true }))
      }
    } catch (e) {
      this._onError(e, { event: meta.event, owner: rec.owner })
    }
  }

  /** 事件名 a:b:c 会命中 a:b:c、a:b:*、a:*、* */
  _matching(event) {
    const keys = ['*']
    const parts = String(event).split(':')
    for (let i = 1; i < parts.length; i++) keys.push(parts.slice(0, i).join(':') + ':*')
    keys.push(event)
    return keys.filter((k) => this._map.has(k))
  }

  /* ─────────── 一对一 RPC ─────────── */

  /** 注册可被调用的能力，同名后注册者报错（先到先得，避免插件互相覆盖） */
  handle(name, fn, { owner = 'anonymous' } = {}) {
    if (this._handlers.has(name)) {
      throw new Error(`handle('${name}') 已被 ${this._handlers.get(name).owner} 占用`)
    }
    this._handlers.set(name, { owner, fn })
    return () => {
      if (this._handlers.get(name)?.fn === fn) this._handlers.delete(name)
    }
  }

  hasHandler(name) {
    return this._handlers.has(name)
  }

  /** await bus.request('mod:stats', { uid: 1 }) */
  async request(name, payload, { timeout = 15000 } = {}) {
    const rec = this._handlers.get(name)
    if (!rec) throw new Error(`no handler for '${name}'`)
    const call = Promise.resolve().then(() => rec.fn(clone(payload), { name, ts: Date.now() }))
    if (!timeout) return call
    let timer
    try {
      return await Promise.race([
        call,
        new Promise((_, rej) => {
          timer = setTimeout(() => rej(new Error(`request '${name}' 超时 ${timeout}ms`)), timeout)
        }),
      ])
    } finally {
      clearTimeout(timer)
    }
  }

  listEvents() {
    return [...this._map.keys()].sort()
  }

  listHandlers() {
    return [...this._handlers.entries()].map(([name, r]) => ({ name, owner: r.owner }))
  }
}
