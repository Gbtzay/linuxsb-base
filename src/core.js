import { Bus } from './bus.js'
import { Net, Actions } from './net.js'
import { createCapabilityContext } from './runtime/capabilities.js'
import { RequestBroker } from './runtime/request-broker.js'
import { ActionBroker } from './runtime/action-broker.js'
import { ActionRegistry } from './ai/actions.js'
import { prepareConversation, buildConversationContext } from './ai/conversation.js'
import { throwIfAborted } from './abort.js'
import { buildEvidenceSnapshot, diffEvidenceSnapshots, mergeCitationReview } from './ai/evidence.js'
import { createAnswerStream } from './ai/stream.js'
import { normalizeEndpoint, classifyProbeResponse, redactDiagnostic } from './ai/diagnostics.js'
import {
  sanitizeTraceEvent,
  validateTraceEvent,
  transitionTrace,
  normalizePlanVersion,
  reasonCode,
} from './ai/trace.js'
import { makeStore, coreStore } from './store.js'
import { UI } from './ui.js'
import { DomWatcher } from './dom.js'
import { Channel } from './channel.js'
import * as site from './site.js'
import { satisfies, deepFreeze, clone } from './util.js'
import { createPluginApi } from './core/api-factory.js'
import { isLtsChannel, ltsDisplayVersion } from './check-update.js'
import { VERSION } from './core/core-version.js'
export { VERSION } from './core/core-version.js'
export { PERMISSIONS, DEFAULT_PERMISSIONS, isIdempotent } from './core/permissions.js'
import { DEFAULT_PERMISSIONS, isIdempotent } from './core/permissions.js'
import { renderLogTab } from './core/panels/log-tab.js'
import { renderUpdateTab } from './core/panels/update-tab.js'
import { renderPluginList } from './core/panels/plugin-list.js'
import { renderBaseSettings } from './core/panels/base-settings.js'

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
    this.configTabRenderer = null
    this.setup = setup
    this.state = 'registered' // registered|active|disabled|error|skipped
    this.error = null
    this.disposers = []
    this.exports = null
    this.abortController = null
    this.context = null
  }
}

export class Core {
  constructor() {
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
    this.requestBroker = new RequestBroker({
      transport: (url, options) => this.net.transport(url, options),
      snapshot: () => this.snapshot || {},
      origin: this.net.origin,
      trace: (event) => this.log('runtime.request', safeStr(event)),
    })
    this.actionBroker = new ActionBroker({
      snapshot: () => this.snapshot || {},
      request: (intent) => this.requestBroker.request(intent),
      trace: (event) => this.log('runtime.action', safeStr(event)),
    })
    if (typeof __LSB_BUILD_PROFILE__ === 'undefined' || __LSB_BUILD_PROFILE__ === 'dev') {
      this.ai = new ActionRegistry({ broker: this.actionBroker })
    }
    this.ui = new UI({
      title: isLtsChannel() ? 'LINUX.SB · LTS' : 'LINUX.SB · 氢',
      version: isLtsChannel() ? ltsDisplayVersion() || VERSION : VERSION,
    })
    this.dom = new DomWatcher(this.bus)
    this.site = site
    this.channel = null
    this.snapshot = null
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

  _renderConfigForm(rec, host) {
    if (!rec.configSchema) {
      host.innerHTML = '<div class="lsb-empty">该插件未声明配置项。</div>'
      return
    }
    const store = makeStore(rec.id)
    this.ui.buildForm(host, rec.configSchema, store.config(rec.configSchema), (v) => {
      store.saveConfig(v)
      this.bus.emit(`config:changed:${rec.id}`, v, { source: 'core' })
    })
  }

  /**
   * 有 config schema 的插件，设置页在 register 时就挂上。
   * pages 限定插件在非适用页是 skipped、setup 不会跑，但 API Key 这类配置
   * 必须在首页也能改，不能逼用户先进帖子。
   */
  _ensureConfigTab(rec) {
    if (!rec.configSchema || rec._configTabReady) return
    rec._configTabReady = true
    this.ui.registerTab({
      id: rec.id,
      name: rec.name,
      order: 50,
      render: (host) => this._renderConfigForm(rec, host),
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
    // Platform 2 keeps the legacy facade source-compatible with bundled and
    // third-party plugins that still declare the old 0.1.x/0.2.x ranges.
    const legacyBaseBridge = /^\^0\.(?:1|2)\./.test(String(baseRange || '')) && /^2\./.test(VERSION)
    if (baseRange && !satisfies(VERSION, baseRange) && !legacyBaseBridge) {
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
    rec.abortController = new AbortController()
    rec.context = createCapabilityContext(
      { id: rec.id, permissions: rec.permissions },
      { signal: rec.abortController.signal },
    )
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
    try {
      rec.abortController?.abort()
    } catch {
      /* AbortController is best-effort; disposer cleanup still must run. */
    }
    try {
      rec.context?.dispose()
    } catch {
      /* Capability context cleanup is best-effort; continue legacy cleanup. */
    }
    rec.context = null
    for (const fn of rec.disposers.splice(0)) {
      try {
        fn()
      } catch (e) {
        console.error(`[LSB] ${rec.id} 清理失败`, e)
      }
    }
    this.bus.offOwner(rec.id)
    this.dom.offOwner(rec.id)
    this.ai?.dispose(rec.id)
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

  _makeApi(rec) { return createPluginApi(rec, this) }

  /* ─────────── 核心自带面板 ─────────── */

  _registerCoreTabs() {
    this.ui.registerTab({
      id: '__core_logs',
      name: '运行日志',
      order: 2,
      render: (host) => renderLogTab(host, this),
    })
    this.ui.registerTab({
      id: '__core_plugins',
      name: '插件',
      order: 0,
      render: (host) => renderPluginList(host, this),
    })
    this.ui.registerTab({
      id: '__core_settings',
      name: '基座设置',
      order: 1,
      render: (host) => renderBaseSettings(host, this),
    })
    this.ui.registerTab({
      id: '__core_updates',
      name: '检查更新',
      order: 3,
      render: (host) => renderUpdateTab(host, this),
    })
  }

  _renderLogTab(host) { return renderLogTab(host, this) }
  _renderUpdateTab(host) { return renderUpdateTab(host, this) }
  _renderPluginList(host) { return renderPluginList(host, this) }

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
