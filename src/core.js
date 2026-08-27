import { Bus } from './bus.js'
import { Net, Actions } from './net.js'
import { makeStore, coreStore, RAW_PREFIX, rawKeys, rawGet, rawSet } from './store.js'
import { UI } from './ui.js'
import { DomWatcher } from './dom.js'
import { Channel } from './channel.js'
import * as site from './site.js'
import { Election } from './election.js'
import { satisfies, deepFreeze, clone, esc, num, text, sleep, throttle } from './util.js'
import {
  SCRIPTS,
  gfJsonUrl,
  parseStoreScript,
  classifyVersion,
  localOxygenVersion,
  installHref,
} from './check-update.js'

export const VERSION = '0.1.33'

/** 权限清单：插件在 manifest.permissions 里声明，未声明即调用会抛错 */
export const PERMISSIONS = {
  read: '读取页面结构与站内 GET 请求',
  write: '代表当前用户发起写操作（回复/点赞/收藏等）',
  storage: '持久化自己的数据',
  ui: '注册面板、注入界面元素',
  net: '访问站外域名（需脚本自身 @connect）',
  admin: '全库数据导出/导入（数据主权，仅迁移类工具应申请）',
  events: '订阅与广播事件',
}

const DEFAULT_PERMISSIONS = ['read', 'storage', 'ui', 'events']

/** 幂等方法（只读语义）：其余方法一律按写操作对待 */
const IDEMPOTENT_METHODS = new Set(['GET', 'HEAD', 'OPTIONS'])
export function isIdempotent(method) {
  return IDEMPOTENT_METHODS.has(String(method || 'GET').toUpperCase())
}

class PluginRecord {
  constructor(manifest, setup) {
    this.id = manifest.id
    this.name = manifest.name || manifest.id
    this.version = manifest.version || '0.0.0'
    this.author = manifest.author || null
    this.description = manifest.description || ''
    this.requires = manifest.requires || {} // { base: '^0.1.0', plugins: { 'x': '^1.0.0' } }
    this.permissions = manifest.permissions || DEFAULT_PERMISSIONS
    this.pages = manifest.pages || null // ['topic','home'] 限定生效页面
    this.provides = manifest.provides || [] // 声明会 handle 的 RPC 名
    this.configSchema = manifest.config || null
    this.setup = setup
    this.state = 'registered' // registered|active|disabled|error|skipped
    this.error = null
    this.disposers = []
    this.exports = null
  }
}

export class Core {
  constructor(opts = {}) {
    this.version = VERSION
    this.ready = false
    this.debug = !!coreStore.get('debug', false)
    this.plugins = new Map()
    this._logs = []

    this.bus = new Bus({
      onError: (e, info) => this._onPluginError(info.owner, e, `event ${info.event}`),
    })
    this.net = new Net({
      rate: coreStore.get('rate', 900),
      log: (m) => this.log('net', m),
      gmRequest: typeof GM_xmlhttpRequest === 'function' ? GM_xmlhttpRequest : null,
    })
    this.actions = new Actions(this.net)
    this.ui = new UI({ title: 'LINUX.SB · 氢（RC）', version: VERSION })
    this.dom = new DomWatcher(this.bus)
    this.site = site
    this.channel = null
    this.snapshot = null
    this._opts = opts
    this._bootOff = []
    this._errs = coreStore.get('errorlog', []) || []
  }

  /* ─────────── 日志 ─────────── */

  log(scope, ...args) {
    const line = { ts: Date.now(), scope, args: args.map((a) => (typeof a === 'string' ? a : safeStr(a))) }
    this._logs.push(line)
    if (this._logs.length > 500) this._logs.shift()
    if (this.debug) console.log(`%c[LSB:${scope}]`, 'color:#5eaaa0', ...args)
  }

  logs() {
    return [...this._logs]
  }

  /** 持久化错误日志（跨页面留存，最近 200 条） */
  errors() {
    return [...this._errs]
  }

  clearErrors() {
    this._errs = []
    coreStore.set('errorlog', [])
    this.bus.emit('core:errors-cleared', null, { source: 'core' })
  }

  /**
   * 错误入账：2 秒内同源同类合并计数防风暴；写存储持久化；广播供日志面板实时刷新。
   * entry: { kind, id?, phase?, msg, stack?, where? }
   */
  _pushErr(entry) {
    if (this._inErrEmit) return // 防递归：plugin:error 的监听者再抛错时不无限套娃
    const e = { t: Date.now(), page: this.snapshot?.page?.type || '?', n: 1, ...entry }
    const dup = this._errs.find(
      (x) => x.kind === e.kind && x.id === e.id && x.msg === e.msg && e.t - x.t < 2000,
    )
    if (dup) {
      dup.n++
      dup.t = e.t
    } else {
      this._errs.unshift(e)
      if (this._errs.length > 200) this._errs.length = 200
    }
    try {
      coreStore.set('errorlog', this._errs)
    } catch {
      /* 存储满等异常忽略 */
    }
    this._inErrEmit = true
    try {
      this.bus.emit('core:error-logged', { ...e }, { source: 'core' })
      this.bus.emit(
        'plugin:error',
        { id: e.id || e.kind, phase: e.phase || e.kind, message: e.msg },
        { source: 'core' },
      )
    } finally {
      this._inErrEmit = false
    }
    if (this.debug) console.error(`%c[LSB:${e.kind}]`, 'color:#d55', e)
  }

  /* ─────────── 启动 ─────────── */

  boot() {
    if (this.ready) return this
    this.snapshot = site.snapshot(document, location)
    this._sealSnapshot()
    this.net.setCsrf(this.snapshot.csrf)
    this.channel = new Channel(this.bus, { store: coreStore })
    this.dom.start(document.body)
    this.ui.ensureBase()
    if (coreStore.get('launcher', true)) this.ui.mountLauncher()
    this._registerCoreTabs()
    this._bootOff = []
    const onErr = (ev) => {
      const msg0 = String(ev.message || '')
      if (/^ResizeObserver loop/i.test(msg0)) return
      this._pushErr({
        kind: 'uncaught',
        msg: String(ev.message || (ev.error && ev.error.message) || 'unknown error'),
        stack: String((ev.error && ev.error.stack) || '').slice(0, 400),
        where: (ev.filename || '') + ':' + (ev.lineno || 0),
      })
    }
    const onRej = (ev) => {
      const r = ev.reason
      this._pushErr({
        kind: 'rejection',
        msg: String((r && r.message) || r || 'unknown rejection'),
        stack: String((r && r.stack) || '').slice(0, 400),
      })
    }
    window.addEventListener('error', onErr)
    window.addEventListener('unhandledrejection', onRej)
    this._bootOff.push(() => window.removeEventListener('error', onErr))
    this._bootOff.push(() => window.removeEventListener('unhandledrejection', onRej))
    // 日志面板打开时实时刷新
    this.bus.on(
      'core:error-logged',
      () => {
        if (this.ui._panel && this.ui._active === '__core_logs') {
          const host = this.ui._panel.panel.querySelector('.lsb-view')
          if (host) this._renderLogTab(host)
        }
      },
      { owner: '__core' },
    )
    this.ready = true

    this.log('core', `启动 v${VERSION}`, this.snapshot.page.type, this.snapshot.me.guest ? '访客' : `uid=${this.snapshot.me.uid}`)
    // sticky：晚加载的插件注册时也能立即收到
    this.bus.emit('site:ready', this.snapshot, { sticky: true, source: 'core', raw: true })
    this._activateAll()
    this._watchNavigation()
    return this
  }

  /** 站点为多页面导航 + 原生无限滚动；这里把 DOM 增量与 URL 变化都归一成事件 */
  _watchNavigation() {
    this.bus.on(
      'dom:posts-added',
      (posts) => {
        const parsed = posts.map((el) => site.parsePost(el))
        this.bus.emit('topic:posts-added', parsed, { source: 'core', raw: true })
      },
      { owner: '__core' },
    )
    this._watchUrl()
  }

  /**
   * URL 追踪：无限滚动/软导航下 pathname 与 ?p= 会变。
   * 不 patch history（油猴沙箱里改不到页面侧对象），用「事件 + 低频轮询」双保险：
   *   - popstate / hashchange 立即检查
   *   - urlPoll ms 轮询兜底（站点直接改 location 或用未覆盖的 API 时也能追上）
   * 触发时更新 snapshot.page（api.page 保持新鲜）并 emit route:changed。
   */
  _refreshSnapshot() {
    try {
      this.snapshot = site.snapshot(document, location, this.snapshot)
      this._sealSnapshot()
      this.net.setCsrf(this.snapshot.csrf)
    } catch {
      try {
        if (this.snapshot) this.snapshot.page = site.detectPage(window.location)
      } catch {
        /* location 不可解析时保持旧值 */
      }
    }
  }

  /** 只冻 me / forums：整份 snapshot 含 DOM 节点，不能冻 */
  _sealSnapshot() {
    const s = this.snapshot
    if (!s) return
    if (s.me) deepFreeze(s.me)
    if (s.forums) deepFreeze(s.forums)
  }

  /** pages: 限定的插件随路由启停；无 pages 的插件不受影响 */
  _syncPagePlugins() {
    const type = this.snapshot?.page?.type
    if (!type) return
    for (const rec of this.plugins.values()) {
      if (!rec.pages) continue
      const inScope = rec.pages.includes(type)
      if (rec.state === 'active' && !inScope) {
        this._dispose(rec)
        rec.state = 'skipped'
        rec.error = `不适用于 ${type} 页`
        this.log('core', `停用 ${rec.id}：离开 ${rec.pages.join('/')} 页`)
      } else if (rec.state === 'skipped' && inScope && !coreStore.get(`disabled:${rec.id}`, false)) {
        rec.state = 'registered'
        rec.error = null
      }
    }
    this._activateAll()
  }

  _watchUrl() {
    let lastHref = window.location.href
    const check = () => {
      if (window.location.href === lastHref) return
      lastHref = window.location.href
      this._refreshSnapshot()
      this.log('core', `路由 → ${this.snapshot.page.type}`, lastHref)
      this.bus.emit('route:changed', { href: lastHref, page: clone(this.snapshot.page) }, { source: 'core' })
      this._syncPagePlugins()
    }
    const wins = [window]
    if (typeof unsafeWindow !== 'undefined' && unsafeWindow !== window) wins.push(unsafeWindow)
    for (const w of wins) {
      w.addEventListener('popstate', check)
      w.addEventListener('hashchange', check)
      this._bootOff.push(() => {
        w.removeEventListener('popstate', check)
        w.removeEventListener('hashchange', check)
      })
    }
    const iv = Number(coreStore.get('urlPoll', 700))
    if (iv > 0) {
      this._urlTimer = setInterval(check, iv)
      this._urlTimer?.unref?.()
    }
  }

  /** 拆掉基座自身的全局副作用（测试与热重载用；正常页面生命周期不需要） */
  shutdown() {
    if (this._urlTimer) clearInterval(this._urlTimer)
    this._urlTimer = null
    for (const off of this._bootOff || []) {
      try {
        off()
      } catch {
        /* ignore */
      }
    }
    this._bootOff = []
    this.bus.offOwner('__core')
    this.dom.stop()
    this.channel?.close()
    for (const rec of this.plugins.values()) {
      if (rec.state === 'active') this._dispose(rec)
    }
    this.ready = false
  }

  /* ─────────── 插件注册 ─────────── */

  /**
   * @param {object} manifest { id, name, version, requires, permissions, pages, config }
   * @param {(api)=>any} setup 插件主体，返回值作为 exports 供其它插件读取
   */
  register(manifest, setup) {
    if (!manifest || !manifest.id) throw new Error('register: manifest.id 必填')
    if (typeof setup !== 'function') throw new Error(`register(${manifest.id}): setup 必须是函数`)
    if (!/^[a-z0-9-]+$/.test(manifest.id)) throw new Error(`register: 非法 id "${manifest.id}"（仅小写字母/数字/连字符）`)
    if (manifest.version && !/^\d+\.\d+\.\d+/.test(manifest.version)) console.warn(`[LSB] 插件 ${manifest.id} 版本号 "${manifest.version}" 不符合 semver` )
    if (manifest.config && typeof manifest.config !== 'object') throw new Error(`register(${manifest.id}): config 必须是对象`)
    if (this.plugins.has(manifest.id)) {
      this.log('core', `插件 ${manifest.id} 重复注册，已忽略`)
      return this.plugins.get(manifest.id)
    }
    const rec = new PluginRecord(manifest, setup)
    this.plugins.set(rec.id, rec)
    this.log('core', `注册插件 ${rec.id}@${rec.version}`)
    this.bus.emit('plugin:registered', { id: rec.id, version: rec.version }, { source: 'core' })
    this._ensureConfigTab(rec)
    if (this.ready) this._activateAll()
    return rec
  }

  /**
   * 有 config schema 的插件，设置页在 register 时就挂上。
   * pages 限定插件在非适用页是 skipped、setup 不会跑，但 API Key 这类配置
   * 必须在首页也能改，不能逼用户先进帖子。
   */
  _ensureConfigTab(rec) {
    if (!rec.configSchema || rec._configTabReady) return
    rec._configTabReady = true
    const store = makeStore(rec.id)
    this.ui.registerTab({
      id: rec.id,
      name: rec.name,
      order: 50,
      render: (host) => {
        if (!rec.configSchema) {
          host.innerHTML = '<div class="lsb-empty">该插件未声明配置项。</div>'
          return
        }
        this.ui.buildForm(host, rec.configSchema, store.config(rec.configSchema), (v) => {
          store.saveConfig(v)
          this.bus.emit(`config:changed:${rec.id}`, v, { source: 'core' })
        })
      },
    })
  }

  /** 反复扫描直到没有新插件能被激活（解决插件间依赖顺序问题） */
  _activateAll() {
    let progressed = true
    while (progressed) {
      progressed = false
      for (const rec of this.plugins.values()) {
        if (rec.state !== 'registered') continue
        const verdict = this._canActivate(rec)
        if (verdict.ok) {
          this._activate(rec)
          progressed = true
        } else if (verdict.fatal) {
          rec.state = verdict.state
          rec.error = verdict.reason
          this.log('core', `跳过 ${rec.id}：${verdict.reason}`)
          progressed = true
        }
      }
    }
    const pending = [...this.plugins.values()].filter((r) => r.state === 'registered')
    if (pending.length) {
      const waitingIds = new Set(pending.map((r) => r.id))
      for (const rec of pending) {
        const deps = Object.keys(rec.requires.plugins || {})
        if (deps.some((d) => waitingIds.has(d))) {
          rec.state = 'error'
          rec.error = `循环依赖（${deps.join(', ')}）`
          this.log('core', `跳过 ${rec.id}：${rec.error}`)
        }
      }
    }
  }

  _canActivate(rec) {
    if (coreStore.get(`disabled:${rec.id}`, false)) {
      return { ok: false, fatal: true, state: 'disabled', reason: '用户已停用' }
    }
    const baseRange = rec.requires.base
    if (baseRange && !satisfies(VERSION, baseRange)) {
      return { ok: false, fatal: true, state: 'error', reason: `需要基座 ${baseRange}，当前 ${VERSION}` }
    }
    if (rec.pages && !rec.pages.includes(this.snapshot.page.type)) {
      return { ok: false, fatal: true, state: 'skipped', reason: `不适用于 ${this.snapshot.page.type} 页` }
    }
    for (const [dep, range] of Object.entries(rec.requires.plugins || {})) {
      const d = this.plugins.get(dep)
      if (!d) return { ok: false, fatal: false, reason: `等待依赖 ${dep}` }
      if (d.state === 'error' || d.state === 'disabled' || d.state === 'skipped') {
        return { ok: false, fatal: true, state: 'error', reason: `依赖 ${dep} 不可用（${d.state}）` }
      }
      if (d.state !== 'active') return { ok: false, fatal: false, reason: `等待依赖 ${dep} 激活` }
      if (range && !satisfies(d.version, range)) {
        return { ok: false, fatal: true, state: 'error', reason: `依赖 ${dep} 需要 ${range}，实际 ${d.version}` }
      }
    }
    return { ok: true }
  }

  _activate(rec) {
    const api = this._makeApi(rec)
    try {
      rec.exports = rec.setup(api) || null
      rec.state = 'active'
      this.log('core', `激活 ${rec.id}`)
      this.bus.emit('plugin:activated', { id: rec.id, version: rec.version }, { source: 'core' })
    } catch (e) {
      rec.state = 'error'
      rec.error = e.message
      this._onPluginError(rec.id, e, 'setup')
      this._dispose(rec)
    }
  }

  _dispose(rec) {
    for (const fn of rec.disposers.splice(0)) {
      try {
        fn()
      } catch (e) {
        console.error(`[LSB] ${rec.id} 清理失败`, e)
      }
    }
    this.bus.offOwner(rec.id)
    this.dom.offOwner(rec.id)
  }

  disable(id) {
    const rec = this.plugins.get(id)
    if (!rec) return false
    coreStore.set(`disabled:${id}`, true)
    this._dispose(rec)
    rec.state = 'disabled'
    this.bus.emit('plugin:disabled', { id }, { source: 'core' })
    return true
  }

  enable(id) {
    coreStore.del(`disabled:${id}`)
    const rec = this.plugins.get(id)
    if (!rec) return false
    if (rec.state === 'disabled') {
      rec.state = 'registered'
      rec.error = null
      this._activateAll()
    }
    return true
  }

  _onPluginError(owner, err, phase) {
    this.log('error', `${owner} @ ${phase}: ${err?.message || err}`)
    console.error(`[LSB] 插件 ${owner} 在 ${phase} 出错`, err)
    this._pushErr({
      kind: 'plugin-error',
      id: owner,
      phase,
      msg: String((err && err.message) || err),
      stack: String((err && err.stack) || '').slice(0, 400),
    })
  }

  /* ─────────── 插件 API（每插件一份，带权限校验与自动清理） ─────────── */

  _makeApi(rec) {
    const core = this
    const has = (p) => rec.permissions.includes(p)
    const need = (p, what) => {
      if (!has(p)) throw new Error(`插件 ${rec.id} 未声明 '${p}' 权限，无法 ${what}`)
    }
    const own = (fn) => {
      rec.disposers.push(fn)
      return fn
    }
    const store = makeStore(rec.id)

    const api = {
      base: { version: VERSION, id: rec.id, debug: core.debug },
      /** 页面快照（只读） */
      get page() {
        return core.snapshot.page
      },
      get me() {
        return core.snapshot.me
      },
      get forums() {
        return core.snapshot.forums
      },
      get snapshot() {
        return core.snapshot
      },

      /* 事件 */
      on(event, fn) {
        need('events', '订阅事件')
        const off = core.bus.on(event, fn, { owner: rec.id })
        own(off)
        return off
      },
      once(event, fn) {
        need('events', '订阅事件')
        const off = core.bus.once(event, fn, { owner: rec.id })
        own(off)
        return off
      },
      emit(event, payload, opts) {
        need('events', '广播事件')
        // 默认发到本插件私有命名空间 plugin:<id>:<event>；
        // 要广播公共约定事件（如 'topic:scored'）请用 emitGlobal
        return core.bus.emit(`plugin:${rec.id}:${event}`, payload, { ...opts, source: rec.id })
      },
      /** 广播到全局命名空间（需明确事件名，用于公共约定事件如 'topic:scored'） */
      emitGlobal(event, payload, opts) {
        need('events', '广播事件')
        return core.bus.emit(event, payload, { ...opts, source: rec.id })
      },
      /** 提供能力给其它插件调用 */
      handle(name, fn) {
        need('events', '注册 RPC')
        const off = core.bus.handle(name, fn, { owner: rec.id })
        own(off)
        return off
      },
      request(name, payload, opts) {
        need('events', '调用 RPC')
        return core.bus.request(name, payload, opts)
      },
      hasHandler: (name) => core.bus.hasHandler(name),
      /** 读取另一插件的 exports（依赖需在 manifest.requires.plugins 声明） */
      plugin(id) {
        if (!(rec.requires.plugins || {})[id] && id !== rec.id) {
          throw new Error(`插件 ${rec.id} 未在 requires.plugins 声明依赖 ${id}`)
        }
        return core.plugins.get(id)?.exports ?? null
      },

      /* 存储 */
      store: {
        get: (k, d) => (need('storage', '读取存储'), store.get(k, d)),
        set: (k, v) => (need('storage', '写入存储'), store.set(k, v)),
        del: (k) => (need('storage', '删除存储'), store.del(k)),
        update: (k, fn, d) => (need('storage', '更新存储'), store.update(k, fn, d)),
        keys: () => (need('storage', '列出存储'), store.keys()),
        clear: () => (need('storage', '清空存储'), store.clear()),
        watch: (fn) => {
          need('storage', '监听存储')
          return own(store.watch(fn))
        },
      },
      /** 配置：读一次得到合并默认值的对象，save 后触发 config:changed */
      config: () => {
        need('storage', '读取配置')
        return store.config(rec.configSchema || {})
      },
      saveConfig: (patch) => {
        need('storage', '保存配置')
        const v = store.saveConfig(patch)
        core.bus.emit(`config:changed:${rec.id}`, v, { source: 'core' })
        return v
      },

      /* 网络（读） */
      net: {
        doc: (path, opts) => (need('read', '发起站内请求'), core.net.doc(path, opts)),
        json: (path, opts) => (need('read', '发起站内请求'), core.net.json(path, opts)),
        /**
         * 底层请求。权限判定按「去向 + 方法」双轴：
         *   站外任意方法   → net（脚本自身还需 @connect）
         *   站内非幂等方法 → write（POST/PUT/PATCH/DELETE 会改动站点状态）
         *   站内 GET/HEAD  → read
         * 补 write 这一档是因为：只有 read 却能 POST /reply_edit，
         * 等于绕开 api.actions 的权限门——写操作必须一视同仁。
         */
        raw: (path, opts) => {
          const external = opts?.external
          if (external || !core.net.isSameOrigin(path)) {
            need('net', '访问站外域名')
          } else if (!isIdempotent(opts?.method)) {
            need('write', `对站内发起 ${String(opts?.method || 'GET').toUpperCase()} 请求`)
          } else {
            need('read', '发起站内请求')
          }
          return core.net.raw(path, opts)
        },
        /** 分页抓取：await for (const doc of api.net.pages('/forum/1', 3)) */
        async *pages(pathFn, maxPage = 1) {
          need('read', '发起站内请求')
          for (let p = 1; p <= maxPage; p++) {
            yield { page: p, doc: await core.net.doc(typeof pathFn === 'function' ? pathFn(p) : pathFn) }
          }
        },
      },

      /* 站点动作（写） */
      actions: new Proxy(
        {},
        {
          get(_t, key) {
            return (...args) => {
              need('write', `执行写操作 ${String(key)}`)
              const fn = core.actions[key]
              if (typeof fn !== 'function') throw new Error(`未知动作 actions.${String(key)}`)
              core.log('action', `${rec.id} → ${String(key)}`, args[0])
              return fn.apply(core.actions, args)
            }
          },
        },
      ),

      /* 解析器（纯函数，无权限要求） */
      parse: {
        list: site.parseList,
        listItem: site.parseListItem,
        topic: site.parseTopic,
        post: site.parsePost,
        user: site.parseUser,
        notifications: site.parseNotifications,
        likeTargets: site.parseLikeTargets,
        detectPage: site.detectPage,
        snapshot: site.snapshot,
      },
      routes: site.ROUTES,
      sel: site.SEL,

      /* UI */
      ui: {
        toast: (msg, opts) => (need('ui', '弹提示'), core.ui.toast(msg, opts)),
        confirm: (msg, opts) => (need('ui', '弹确认框'), core.ui.confirm(msg, opts)),
        style: (css) => (need('ui', '注入样式'), core.ui.injectStyle(css, `lsb-style-${rec.id}`)),
        /** 切换到指定插件 Tab 并重渲染（面板需已打开） */
        showTab: (id) => {
          need('ui', '切换面板页')
          core.ui.showTab(id)
        },
        /** 由 schema 生成表单（onSave 收到完整值对象） */
        buildForm: (host, schema, values, onSave) => {
          need('ui', '生成设置表单')
          return core.ui.buildForm(host, schema, values, onSave)
        },
        tab: (opt) => {
          need('ui', '注册设置页')
          return own(core.ui.registerTab({ id: opt.id || rec.id, name: opt.name || rec.name, order: opt.order, render: opt.render }))
        },
        openPanel: (id) => (need('ui', '打开面板'), core.ui.openPanel(id)),
        /** 油猴扩展图标下的菜单命令；无 GM 时为空操作 */
        menuCommand: (title, fn) => (need('ui', '注册油猴菜单'), core.ui.menuCommand(title, fn)),
        postAction: (postEl, opt) => (need('ui', '注入楼层按钮'), core.ui.addPostAction(postEl, opt)),
        topLink: (opt) => (need('ui', '注入顶栏'), core.ui.addTopLink(opt)),
        /** 由 configSchema 自动生成设置页 */
        configTab: (opt = {}) => {
          need('ui', '注册设置页')
          // 不进 disposers：pages 跳过会 dispose，设置页必须在首页仍能打开
          return core.ui.registerTab({
            id: opt.id || rec.id,
            name: opt.name || rec.name,
            order: opt.order,
            render: (host) => {
              if (!rec.configSchema) {
                host.innerHTML = '<div class="lsb-empty">该插件未声明配置项。</div>'
                return
              }
              core.ui.buildForm(host, rec.configSchema, store.config(rec.configSchema), (v) => api.saveConfig(v))
              if (opt.render) opt.render(host)
            },
          })
        },
      },

      /* 数据主权（admin 权限） */
      admin: {
        /** 全库导出 */
        exportAll: () => {
          need('admin', '导出全部数据')
          const data = {}
          for (const k of rawKeys()) data[k] = rawGet(k)
          return { app: "lsb", version: VERSION, exportedAt: Date.now(), count: Object.keys(data).length, data }
        },
        /** merge=true 时保留现有同名键，默认覆盖 */
        importAll: (payload, opts = {}) => {
          need('admin', '导入全部数据')
          const merge = !!(opts && opts.merge)
          if (!payload || payload.app !== "lsb" || typeof payload.data !== "object") {
            throw new Error("备份文件格式不正确（缺少 app/data 字段）")
          }
          let imported = 0
          let skipped = 0
          for (const [k, v] of Object.entries(payload.data)) {
            if (!k.startsWith(RAW_PREFIX)) continue // 拒绝越界写入
            if (merge && rawGet(k) !== undefined) { skipped++; continue }
            rawSet(k, v)
            imported++
          }
          return { imported, skipped }
        },
      },

      /* DOM */
      dom: {
        each: (selector, fn) => {
          need('read', '监听 DOM')
          return own(core.dom.onEach(selector, fn, { owner: rec.id }))
        },
        posts: () => [...document.querySelectorAll(site.SEL.postEntry)],
        items: () => [...document.querySelectorAll(site.SEL.listItems)],
      },

      /* 跨标签页 */
      tabs: {
        post: (event, payload) => {
          need('events', '跨标签广播')
          core.channel?.post({ plugin: rec.id, event, payload })
        },
        on: (event, fn) => {
          need('events', '跨标签订阅')
          return own(core.bus.on(`tab:${rec.id}:${event}`, fn, { owner: rec.id }))
        },
      },

      /* 选主（跨标签单例） */
      election: (opts = {}) => {
        need('events', '参与选主')
        const el = new Election(api.tabs, {
          onPromote: opts.onPromote,
          onDemote: opts.onDemote,
          jitter: opts.jitter ?? 800,
          // 身份取自跨标签通道的实例 id：同一标签内多个模块各自选主互不干扰，
          // 而跨标签比较时又稳定唯一（仲裁靠它比大小）。
          id: core.channel?.id ? `${core.channel.id}:${rec.id}` : undefined,
          beatMs: opts.beatMs,
          leaderTimeoutMs: opts.leaderTimeoutMs,
        })
        el.start()
        own(() => el.stop())
        return el
      },

      /* 工具 */
      util: { esc, num, text, sleep, throttle, clone, satisfies },
      log: (...a) => core.log(rec.id, ...a),
      /** 记录本模块的错误 → 持久化到基座错误日志（面板「运行日志」可见） */
      error: (msg) => {
        const e = msg instanceof Error ? msg : new Error(String(msg))
        core._pushErr({
          kind: 'module-error',
          id: rec.id,
          msg: String(e.message),
          stack: String(e.stack || '').slice(0, 400),
        })
      },
      /** 主动打点：非错误的运行时事件（持久化，便于事后回溯） */
      track: (event, detail) => {
        core._pushErr({ kind: 'track', id: rec.id, msg: event + (detail ? ' · ' + String(detail) : '') })
      },
      /** 注册清理逻辑（插件被停用时调用） */
      onDispose: (fn) => own(fn),
    }
    return api
  }

  /* ─────────── 核心自带面板 ─────────── */

  _registerCoreTabs() {
    this.ui.registerTab({
      id: '__core_logs',
      name: '运行日志',
      order: 2,
      render: (host) => this._renderLogTab(host),
    })
    this.ui.registerTab({
      id: '__core_plugins',
      name: '插件',
      order: 0,
      render: (host) => this._renderPluginList(host),
    })
    this.ui.registerTab({
      id: '__core_settings',
      name: '基座设置',
      order: 1,
      render: (host) => {
        const schema = {
          rate: { type: 'number', label: '请求最小间隔 (ms)', desc: '所有插件共享同一队列，过低会触发站点限流', default: 900 },
          urlPoll: { type: 'number', label: 'URL 变化轮询 (ms)', desc: '无限滚动时追踪 ?p= 变化；0 = 只靠 popstate 事件', default: 700 },
          launcher: { type: 'switch', label: '显示右下角入口按钮', default: true },
          debug: { type: 'switch', label: '调试日志', default: false },
        }
        const cur = {
          rate: coreStore.get('rate', 900),
          urlPoll: coreStore.get('urlPoll', 700),
          launcher: coreStore.get('launcher', true),
          debug: coreStore.get('debug', false),
        }
        this.ui.buildForm(host, schema, cur, (v) => {
          coreStore.set('rate', Math.max(200, Number(v.rate) || 900))
          coreStore.set('urlPoll', Math.max(0, Number(v.urlPoll) || 0))
          coreStore.set('launcher', !!v.launcher)
          coreStore.set('debug', !!v.debug)
          this.net.rate = coreStore.get('rate', 900)
          this.debug = !!v.debug
        })
        const info = document.createElement('div')
        info.className = 'lsb-row-desc'
        info.style.marginTop = '12px'
        info.textContent = `页面：${this.snapshot.page.type} · 站点版本：${this.snapshot.version || '未知'} · 身份：${
          this.snapshot.me.guest ? '访客' : `${this.snapshot.me.name || 'uid ' + this.snapshot.me.uid}`
        } · CSRF：${this.snapshot.csrf ? '已获取' : '无'}`
        host.appendChild(info)
      },
    })
    this.ui.registerTab({
      id: '__core_updates',
      name: '检查更新',
      order: 3,
      render: (host) => this._renderUpdateTab(host),
    })
  }

  /** 运行日志面板：持久化错误 + 实时运行日志，可过滤/搜索/导出 */
  _renderLogTab(host) {
    host.replaceChildren()
    if (!this._logViewState) this._logViewState = { showErr: true, showRun: false, q: '' }
    const st = this._logViewState
    const fmtT = (t) => new Date(t).toLocaleTimeString('zh-CN')

    const render = () => {
      const errs = this.errors()
      let rows = []
      if (st.showErr)
        rows.push(
          ...errs.map((e) => ({
            t: e.t,
            lvl: 'err',
            who: e.id || e.kind,
            txt: `[${e.kind}${e.phase ? '/' + e.phase : ''}] ${e.msg}${e.n > 1 ? ' ×' + e.n : ''} · ${e.page}`,
            tip: [e.stack, e.where].filter(Boolean).join('\n'),
          })),
        )
      if (st.showRun)
        rows.push(
          ...this.logs()
            .slice(-200)
            .reverse()
            .map((l) => ({ t: l.ts, lvl: 'run', who: l.scope, txt: l.args.join(' '), tip: '' })),
        )
      if (st.q) rows = rows.filter((r) => (r.who + ' ' + r.txt).toLowerCase().includes(st.q))
      rows.sort((a, b) => b.t - a.t)

      wrap.innerHTML =
        '<div style="display:flex;gap:8px;align-items:center;margin-bottom:8px;flex-wrap:wrap">' +
        '<label style="font-size:12px;display:flex;gap:4px;align-items:center"><input type="checkbox" data-e' +
        (st.showErr ? ' checked' : '') + '> 错误 (' + errs.length + ')</label>' +
        '<label style="font-size:12px;display:flex;gap:4px;align-items:center"><input type="checkbox" data-r' +
        (st.showRun ? ' checked' : '') + '> 运行日志</label>' +
        '<input type="search" placeholder="过滤…" data-q value="' +
        esc(st.q).replace(/"/g, '&quot;') + '" style="flex:1;min-width:120px;padding:4px 7px;border:1px solid var(--line,#ddd);border-radius:6px;background:var(--bg,#fff);color:var(--text,#222)">' +
        '<button class="lsb-btn" data-export>导出</button>' +
        '<button class="lsb-btn" data-clear>清空错误</button></div>' +
        '<div style="max-height:52vh;overflow:auto;border-top:1px solid var(--line-soft,#eee)">' +
        (rows.length
          ? rows
              .map(
                (r) =>
                  '<div class="lsb-row"' + (r.tip ? ' title="' + esc(r.tip).replace(/"/g, '&quot;') + '"' : '') + '>' +
                  '<span style="color:var(--text-muted,#888);font-size:11px;min-width:64px">' + fmtT(r.t) + '</span>' +
                  '<span class="lsb-badge' + (r.lvl === 'err' ? ' is-err' : '') + '">' + esc(String(r.who)) + '</span>' +
                  '<span style="margin-left:8px;font-size:12px;word-break:break-word">' + esc(r.txt) + '</span></div>',
              )
              .join('')
          : '<div class="lsb-empty">暂无记录。</div>') +
        '</div>'

      wrap.querySelector('[data-e]').onchange = (e) => {
        st.showErr = e.target.checked
        render()
      }
      wrap.querySelector('[data-r]').onchange = (e) => {
        st.showRun = e.target.checked
        render()
      }
      wrap.querySelector('[data-q]').oninput = (e) => {
        st.q = e.target.value.toLowerCase()
        render()
      }
      wrap.querySelector('[data-clear]').onclick = async () => {
        if (await this.ui.confirm('清空全部错误记录？')) {
          this.clearErrors()
          render()
        }
      }
      wrap.querySelector('[data-export]').onclick = () => {
        try {
          const blob = new Blob([JSON.stringify({ errors: this.errors(), runLog: this.logs() }, null, 2)], {
            type: 'application/json',
          })
          const a = document.createElement('a')
          a.href = URL.createObjectURL(blob)
          a.download = 'lsb-logs-' + Date.now() + '.json'
          a.click()
          setTimeout(() => URL.revokeObjectURL(a.href), 4000)
        } catch (e) {
          this.ui.toast('导出失败：' + e.message, { type: 'error' })
        }
      }
    }

    const wrap = document.createElement('div')
    host.appendChild(wrap)
    render()
  }

  _renderUpdateTab(host) {
    const wrap = document.createElement('div')
    host.appendChild(wrap)
    let gen = 0
    let inflight = null

    const scripts = {
      hydrogen: SCRIPTS.find((s) => s.id === 'hydrogen'),
      oxygen: SCRIPTS.find((s) => s.id === 'oxygen'),
    }

    const snapshot = () => {
      const ox = localOxygenVersion([...this.plugins.values()])
      return {
        hydrogen: { local: VERSION, missing: false },
        oxygen: { local: ox, missing: !ox },
      }
    }

    const paint = (states, { busy = false } = {}) => {
      const loc = snapshot()
      const badgeClass = (status) => {
        if (status === 'behind' || status === 'fail' || status === 'invalid') return 'lsb-badge is-err'
        if (status === 'equal') return 'lsb-badge is-on'
        return 'lsb-badge'
      }
      const badgeText = (st) => {
        if (!st || !st.status) return ''
        return {
          behind: '有更新',
          equal: '已是最新',
          ahead: '比商店新',
          missing: '未安装',
          invalid: '版本号无效',
          fail: '查询失败',
        }[st.status] || ''
      }
      const desc = (id, st) => {
        const local = loc[id].local
        if (!st || !st.status) return local ? `本地 ${local}` : ''
        if (st.status === 'missing') return ''
        if (st.status === 'behind' || st.status === 'ahead') return `本地 ${local} · 商店 ${st.store}`
        if (st.status === 'equal') return `本地与商店同为 ${local}`
        if (st.status === 'invalid') return [local, st.store].filter(Boolean).join(' · ')
        if (st.status === 'fail') return st.connect ? '氢需要允许 greasyfork.org 跨域' : '无法读取 Greasy Fork'
        return ''
      }
      const install = (id, st) => {
        const script = scripts[id]
        const show = st && (st.status === 'behind' || st.status === 'missing')
        if (!show) return ''
        const href = st.status === 'missing' ? script.installUrl : installHref(st.parsed, script.installUrl)
        return `<a class="lsb-btn is-primary" data-install href="${esc(href)}" target="_blank" rel="noopener noreferrer">打开安装页</a>`
      }
      const row = (id) => {
        const st = states[id] || (loc[id].missing ? { status: 'missing' } : null)
        const local = loc[id].local
        const bt = badgeText(st)
        const ver = local ? `<span class="lsb-badge">v${esc(local)}</span>` : ''
        const bd = bt ? `<span class="${badgeClass(st.status)}">${esc(bt)}</span>` : ''
        const d = desc(id, st)
        return `<div class="lsb-row" data-script="${id}">
          <div class="lsb-row-main">
            <div class="lsb-row-name">${esc(scripts[id].label)} ${ver}${bd}</div>
            ${d ? `<div class="lsb-row-desc">${esc(d)}</div>` : ''}
          </div>${install(id, st)}</div>`
      }
      wrap.innerHTML =
        '<div class="lsb-actions" style="border:0;padding:0 0 8px;justify-content:flex-start">' +
        `<button class="lsb-btn is-primary" type="button" data-check${busy ? ' disabled' : ''}>${busy ? '查询中…' : '对照 Greasy Fork'}</button></div>` +
        row('hydrogen') +
        row('oxygen') +
        '<div class="lsb-row-desc">安装仍由油猴接管；两个都要装，先氢后氧。</div>'
      const btn = wrap.querySelector('[data-check]')
      if (btn && !busy) btn.onclick = () => run()
    }

    const loadOne = async (script) => {
      try {
        const json = await this.net.json(gfJsonUrl(script.gfId), { external: true })
        const parsed = parseStoreScript(json)
        if (!parsed) return { error: 'read' }
        return { parsed }
      } catch (e) {
        const msg = String((e && e.message) || e)
        return { error: /域名未放行|跨域请求被拒绝/.test(msg) ? 'connect' : 'read' }
      }
    }

    const run = () => {
      if (inflight) return inflight
      const my = ++gen
      inflight = (async () => {
        paint({ oxygen: snapshot().oxygen.missing ? { status: 'missing' } : null }, { busy: true })
        const loc = snapshot()
        const jobs = [loadOne(scripts.hydrogen)]
        if (!loc.oxygen.missing) jobs.push(loadOne(scripts.oxygen))
        const settled = await Promise.allSettled(jobs)
        if (my !== gen || !wrap.isConnected) return
        const fromLoad = (res, local) => {
          if (res.status !== 'fulfilled') {
            return { status: 'fail', connect: false }
          }
          const v = res.value
          if (v.error === 'connect') return { status: 'fail', connect: true }
          if (v.error) return { status: 'fail', connect: false }
          const status = classifyVersion(local, v.parsed.version)
          return { status, store: v.parsed.version, parsed: v.parsed }
        }
        const hRes = settled[0]
        const states = { hydrogen: fromLoad(hRes, loc.hydrogen.local) }
        if (loc.oxygen.missing) states.oxygen = { status: 'missing' }
        else states.oxygen = fromLoad(settled[1], loc.oxygen.local)
        if (states.hydrogen.status === 'fail' || states.oxygen.status === 'fail') {
          this.log('core', '检查更新查询失败')
        }
        paint(states)
      })().finally(() => {
        if (inflight && my === gen) inflight = null
      })
      return inflight
    }

    paint({ oxygen: snapshot().oxygen.missing ? { status: 'missing' } : null })
  }

  _renderPluginList(host) {
    if (!this.plugins.size) {
      host.innerHTML = '<div class="lsb-empty">尚未加载任何插件。安装依附脚本后会自动出现在这里。</div>'
      return
    }
    for (const rec of this.plugins.values()) {
      const row = document.createElement('div')
      row.className = 'lsb-row'
      const stateLabel = { active: '运行中', disabled: '已停用', error: '出错', skipped: '本页不适用', registered: '等待依赖' }[rec.state]
      const cls = rec.state === 'active' ? ' is-on' : rec.state === 'error' ? ' is-err' : ''
      row.innerHTML = `
        <div class="lsb-row-main">
          <div class="lsb-row-name">${esc(rec.name)} <span class="lsb-badge">v${esc(rec.version)}</span><span class="lsb-badge${cls}">${esc(stateLabel)}</span></div>
          <div class="lsb-row-desc">${esc(rec.description || rec.id)}${rec.error ? ` · ${esc(rec.error)}` : ''}</div>
          <div class="lsb-row-desc">权限：${esc(rec.permissions.join(' / '))}</div>
        </div>`
      const btn = document.createElement('button')
      btn.className = 'lsb-btn'
      btn.textContent = rec.state === 'disabled' ? '启用' : '停用'
      btn.onclick = () => {
        if (rec.state === 'disabled') this.enable(rec.id)
        else this.disable(rec.id)
        this.ui.toast('设置已生效，刷新页面后完全应用', { type: 'info' })
        host.innerHTML = ''
        this._renderPluginList(host)
      }
      row.appendChild(btn)
      host.appendChild(row)
    }
  }

  /** 对外只读信息，供插件/调试使用 */
  info() {
    return deepFreeze({
      version: VERSION,
      page: this.snapshot?.page,
      plugins: [...this.plugins.values()].map((p) => ({
        id: p.id,
        name: p.name,
        version: p.version,
        state: p.state,
        error: p.error,
        permissions: p.permissions,
      })),
      events: this.bus.listEvents(),
      handlers: this.bus.listHandlers(),
    })
  }
}

function safeStr(v) {
  try {
    return typeof v === 'object' ? JSON.stringify(v)?.slice(0, 300) : String(v)
  } catch {
    return String(v)
  }
}
