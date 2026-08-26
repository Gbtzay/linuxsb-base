/**
 * 存储层：每个插件拿到自己的命名空间，互不覆盖。
 *
 * 底层优先 GM_getValue/GM_setValue（跨标签页、跨域持久），
 * 无 GM 时退回 localStorage，便于在页面 console 里裸测。
 */

const PREFIX = 'lsb_base'

function gmAvailable() {
  return typeof GM_getValue === 'function' && typeof GM_setValue === 'function'
}

class Backend {
  constructor() {
    this._mem = new Map()
    this._lsRef = null
  }

  /** 测试里每次换 JSDOM 会换 localStorage 实例，缓存必须跟着丢掉 */
  _syncCacheScope() {
    if (gmAvailable()) return
    try {
      if (this._lsRef !== localStorage) {
        this._mem.clear()
        this._lsRef = localStorage
      }
    } catch {
      this._mem.clear()
      this._lsRef = null
    }
  }

  get(key, def) {
    this._syncCacheScope()
    if (gmAvailable()) {
      if (this._mem.has(key)) {
        const hit = this._mem.get(key)
        return hit.value === undefined ? def : hit.value
      }
      const v = GM_getValue(key, undefined)
      if (v === undefined) return def
      this._mem.set(key, { value: v })
      return v
    }
    try {
      const raw = localStorage.getItem(key)
      if (raw === null) {
        this._mem.delete(key)
        return def
      }
      const hit = this._mem.get(key)
      if (hit && hit.raw === raw) return hit.value
      const v = JSON.parse(raw)
      this._mem.set(key, { raw, value: v })
      return v
    } catch {
      return def
    }
  }

  set(key, value) {
    this._syncCacheScope()
    if (gmAvailable()) {
      this._mem.set(key, { value })
      return GM_setValue(key, value)
    }
    try {
      const raw = JSON.stringify(value)
      localStorage.setItem(key, raw)
      this._mem.set(key, { raw, value })
    } catch (e) {
      console.warn('[LSB store] 写入失败', e)
    }
  }

  del(key) {
    this._syncCacheScope()
    this._mem.delete(key)
    if (gmAvailable() && typeof GM_deleteValue === 'function') return GM_deleteValue(key)
    try {
      localStorage.removeItem(key)
    } catch {
      /* ignore */
    }
  }

  keys() {
    if (gmAvailable() && typeof GM_listValues === 'function') return GM_listValues()
    try {
      return Object.keys(localStorage)
    } catch {
      return []
    }
  }
}

const backend = new Backend()

/** 插件视角的存储句柄：键自动加 `lsb_base:<plugin>:` 前缀 */
export class Store {
  constructor(ns) {
    this.ns = ns
    this._prefix = `${PREFIX}:${ns}:`
    this._watchers = new Set()
  }

  _k(key) {
    return this._prefix + key
  }

  get(key, def = null) {
    return backend.get(this._k(key), def)
  }

  set(key, value) {
    const old = backend.get(this._k(key), undefined)
    backend.set(this._k(key), value)
    for (const fn of this._watchers) {
      try {
        fn(key, value, old)
      } catch (e) {
        console.error('[LSB store watcher]', e)
      }
    }
    return value
  }

  del(key) {
    backend.del(this._k(key))
  }

  /** 读改写一体，避免并发下丢更新 */
  update(key, fn, def = null) {
    return this.set(key, fn(this.get(key, def)))
  }

  keys() {
    return backend.keys()
      .filter((k) => k.startsWith(this._prefix))
      .map((k) => k.slice(this._prefix.length))
  }

  all() {
    const out = {}
    for (const k of this.keys()) out[k] = this.get(k)
    return out
  }

  clear() {
    for (const k of this.keys()) this.del(k)
  }

  /** 本标签页内的变更通知（跨标签页请配合 GM_addValueChangeListener） */
  watch(fn) {
    this._watchers.add(fn)
    return () => this._watchers.delete(fn)
  }

  /**
   * 配置项：带默认值合并，插件升级新增字段时旧数据不会缺键。
   * defaults 为 schema：{ key: { type, default, label, desc, options? } }
   */
  config(defaults = {}) {
    const saved = this.get('__config', {}) || {}
    const out = {}
    for (const [k, def] of Object.entries(defaults)) {
      const spec = typeof def === 'object' && def && 'default' in def ? def : { default: def }
      out[k] = k in saved ? saved[k] : spec.default
    }
    return out
  }

  saveConfig(patch) {
    return this.update('__config', (cur) => ({ ...(cur || {}), ...patch }), {})
  }
}

export function makeStore(ns) {
  return new Store(ns)
}

/** 核心自身的存储（插件启用状态、面板位置等） */
export const coreStore = new Store('__core')

// ── 全库原语（仅供基座核心的数据主权功能使用）──
export const RAW_PREFIX = PREFIX
export const rawKeys = () => backend.keys().filter((k) => k.startsWith(PREFIX))
export const rawGet = (k) => backend.get(k, undefined)
export const rawSet = (k, v) => backend.set(k, v)
