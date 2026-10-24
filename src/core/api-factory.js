import { makeStore, RAW_PREFIX, rawKeys, rawGet, rawSet } from '../store.js'
import * as site from '../site.js'
import { Election } from '../election.js'
import { VERSION } from './core-version.js'
import { isIdempotent } from './permissions.js'
import { throwIfAborted } from '../abort.js'
import { prepareConversation, buildConversationContext } from '../ai/conversation.js'
import { buildEvidenceSnapshot, diffEvidenceSnapshots, mergeCitationReview } from '../ai/evidence.js'
import { createAnswerStream } from '../ai/stream.js'
import { normalizeEndpoint, classifyProbeResponse, redactDiagnostic } from '../ai/diagnostics.js'
import { sanitizeTraceEvent, validateTraceEvent, transitionTrace, normalizePlanVersion, reasonCode } from '../ai/trace.js'
import { esc, num, text, sleep, throttle, clone, satisfies } from '../util.js'
import * as shellLayout from '../shell/layout.js'
import { installShellScrollBridge } from '../shell/scroll.js'
import * as shellStyle from '../shell/style.js'
import * as shellMedia from '../shell/media.js'

export function createPluginApi(rec, core) {
  const has = (p) => rec.permissions.includes(p)
  const need = (p, what) => {
    if (rec.context) return rec.context.require(p, what)
    if (!has(p)) throw new Error(`插件 ${rec.id} 未声明 '${p}' 权限，无法 ${what}`)
  }
  const own = (fn) => {
    rec.disposers.push(fn)
    return fn
  }
  const requestOpts = (opts) => ({
    ...(opts && typeof opts === 'object' ? opts : {}),
    signal: opts?.signal || rec.abortController?.signal,
  })
  const store = makeStore(rec.id)

  const brokerResponse = (path, envelope) => {
    let url = ''
    try { url = new URL(String(path), core.net.origin).href } catch { /* RequestBroker 已校验 URL */ }
    const { finalUrl, ...response } = envelope
    return { ...response, ...(finalUrl || url ? { url: finalUrl || url } : {}) }
  }
  const brokerRaw = (path, opts = {}) =>
    core.requestBroker.request({
      owner: rec.context,
      purpose: opts.purpose || `插件 ${rec.id} 网络请求`,
      path,
      ...opts,
      signal: opts.signal || rec.abortController?.signal,
      response: ['text'],
    }).then((envelope) => brokerResponse(path, envelope))
  const brokerDoc = async (path, opts = {}) => {
    const envelope = await core.requestBroker.request({
      owner: rec.context,
      purpose: opts.purpose || `插件 ${rec.id} 读取页面`,
      path,
      ...opts,
      signal: opts.signal || rec.abortController?.signal,
      response: ['text'],
    })
    if (!envelope.ok) throw new Error(`${String(path)} → HTTP ${envelope.status}`)
    const doc = new DOMParser().parseFromString(envelope.text || '', 'text/html')
    const csrf = site.readCsrf(doc)
    if (csrf) core.net.setCsrf(csrf)
    return doc
  }
  const brokerJson = async (path, opts = {}) => {
    const envelope = await core.requestBroker.request({
      owner: rec.context,
      purpose: opts.purpose || `插件 ${rec.id} 读取 JSON`,
      path,
      ...opts,
      signal: opts.signal || rec.abortController?.signal,
      response: ['json', 'text'],
    })
    if (envelope.json === null && envelope.text && !/^\s*(?:null|false|0)\s*$/.test(envelope.text)) {
      try { return JSON.parse(envelope.text) } catch { throw new Error(`${String(path)} 返回非 JSON（HTTP ${envelope.status}）`) }
    }
    return envelope.json
  }

  const api = {
    base: { version: VERSION, id: rec.id, debug: core.debug },
    runtime: {
      context: () => rec.context?.summary() || { owner: rec.id, capabilities: Object.freeze([]) },
    },
    get page() { return core.snapshot.page },
    get me() { return core.snapshot.me },
    get forums() { return core.snapshot.forums },
    get snapshot() { return core.snapshot },
    get signal() { return rec.abortController?.signal || null },

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
      return core.bus.emit(`plugin:${rec.id}:${event}`, payload, { ...opts, source: rec.id })
    },
    emitGlobal(event, payload, opts) {
      need('events', '广播事件')
      return core.bus.emit(event, payload, { ...opts, source: rec.id })
    },
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
    plugin(id) {
      if (!(rec.requires.plugins || {})[id] && id !== rec.id) {
        throw new Error(`插件 ${rec.id} 未在 requires.plugins 声明依赖 ${id}`)
      }
      return core.plugins.get(id)?.exports ?? null
    },

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

    net: {
      doc: (path, opts) => (need('read', '发起站内请求'), brokerDoc(path, requestOpts(opts))),
      json: (path, opts) => (need('read', '发起站内请求'), brokerJson(path, requestOpts(opts))),
      search: (query, field, opts) => (need('read', '执行站内搜索'), core.net.search(query, field, requestOpts(opts))),
      classifyWrite: (response, opts) => (need('read', '解析站内写入响应'), core.net.classifyWrite(response, opts)),
      raw: (path, opts) => {
        const external = opts?.external
        if (external || !core.net.isSameOrigin(path)) {
          need('net', '访问站外域名')
        } else if (!isIdempotent(opts?.method)) {
          need('write', `对站内发起 ${String(opts?.method || 'GET').toUpperCase()} 请求`)
        } else {
          need('read', '发起站内请求')
        }
        return brokerRaw(path, requestOpts(opts))
      },
      async *pages(pathFn, maxPage = 1, opts = {}) {
        need('read', '发起站内请求')
        const scopedOpts = requestOpts(opts)
        for (let p = 1; p <= maxPage; p++) {
          throwIfAborted(scopedOpts.signal)
          yield { page: p, doc: await core.net.doc(typeof pathFn === 'function' ? pathFn(p) : pathFn, scopedOpts) }
        }
      },
    },

    actions: new Proxy(
      {},
      {
        get(_t, key) {
          return (...args) => {
            need('write', `执行写操作 ${String(key)}`)
            const fn = core.actions[key]
            if (typeof fn !== 'function') throw new Error(`未知动作 actions.${String(key)}`)
            core.log('action', `${rec.id} → ${String(key)}`, args[0])
            return core.actionBroker.legacy(rec.context, key, () => fn.apply(core.actions, args))
          }
        },
      },
    ),

    parse: {
      list: site.parseList,
      listPages: site.listPages,
      listItem: site.parseListItem,
      topic: site.parseTopic,
      userReplies: site.parseUserReplies,
      post: site.parsePost,
      user: site.parseUser,
      notifications: site.parseNotifications,
      likeTargets: site.parseLikeTargets,
      topicFavoriteState: site.parseTopicFavoriteState,
      detectPage: site.detectPage,
      snapshot: site.snapshot,
    },
    routes: site.ROUTES,
    sel: site.SEL,

    ui: {
      toast: (msg, opts) => (need('ui', '弹提示'), core.ui.toast(msg, opts)),
      confirm: (msg, opts) => (need('ui', '弹确认框'), core.ui.confirm(msg, opts)),
      style: (css) => (need('ui', '注入样式'), core.ui.injectStyle(css, `lsb-style-${rec.id}`)),
      showTab: (id) => { need('ui', '切换面板页'); core.ui.showTab(id) },
      buildForm: (host, schema, values, onSave) => {
        need('ui', '生成设置表单')
        return core.ui.buildForm(host, schema, values, onSave)
      },
      tab: (opt) => {
        need('ui', '注册设置页')
        return own(core.ui.registerTab({ id: opt.id || rec.id, name: opt.name || rec.name, order: opt.order, render: opt.render }))
      },
      openPanel: (id) => (need('ui', '打开面板'), core.ui.openPanel(id)),
      panels: () => (need('ui', '读取面板目录'), core.ui.panelCatalog()),
      settingsPlugins: () => {
        need('ui', '读取插件设置目录')
        return [...core.plugins.values()]
          .filter((plugin) => !!plugin.configSchema)
          .map((plugin) => ({ id: plugin.id, name: plugin.name, state: plugin.state }))
      },
      openPluginSettings: (id) => {
        need('ui', '打开插件设置')
        const pluginId = String(id || '')
        const plugin = core.plugins.get(pluginId)
        if (!plugin) throw new Error(`插件 ${pluginId || '(空)'} 不存在`)
        if (!plugin.configSchema) throw new Error(`插件 ${pluginId} 未声明配置项`)
        core.ui.openSettingsPanel({
          id: plugin.id,
          name: plugin.name,
          render: (host) => {
            if (typeof plugin.configTabRenderer === 'function') plugin.configTabRenderer(host)
            else core._renderConfigForm(plugin, host)
          },
        })
      },
      menuCommand: (title, fn) => (need('ui', '注册油猴菜单'), core.ui.menuCommand(title, fn)),
      postAction: (postEl, opt) => (need('ui', '注入楼层按钮'), core.ui.addPostAction(postEl, opt)),
      topLink: (opt) => (need('ui', '注入顶栏'), core.ui.addTopLink(opt)),
      configTab: (opt = {}) => {
        need('ui', '注册设置页')
        const render = (host) => {
          if (!rec.configSchema) {
            host.innerHTML = '<div class="lsb-empty">该插件未声明配置项。</div>'
            return
          }
          core.ui.buildForm(host, rec.configSchema, store.config(rec.configSchema), (v) => api.saveConfig(v))
          if (opt.render) opt.render(host)
        }
        if (rec.configSchema) rec.configTabRenderer = render
        return core.ui.registerTab({
          id: opt.id || rec.id,
          name: opt.name || rec.name,
          order: opt.order,
          render,
        })
      },
      shellAsideView: (opt) => (need('ui', '注册侧栏视图'), own(core.ui.registerShellAsideView(opt))),
      shellAsideViews: (context) => (need('ui', '读取侧栏视图'), core.ui.shellAsideViews(context)),
      shellAsideController: (fn) => (need('ui', '注册侧栏控制器'), own(core.ui.registerShellAsideController(fn))),
      shellAsideSelect: (id) => (need('ui', '切换侧栏视图'), core.ui.shellAsideSelect(id)),
      shellWindowRegister: (opt) => (need('ui', '注册氢壳窗口'), own(core.ui.registerShellWindow(opt))),
      shellWindows: (context) => (need('ui', '读取氢壳窗口'), core.ui.shellWindows(context)),
      shellWindowController: (fn) => (need('ui', '注册氢壳窗口控制器'), own(core.ui.registerShellWindowController(fn))),
      shellWindowFocus: (id) => (need('ui', '聚焦氢壳窗口'), core.ui.shellWindowFocus(id)),
      shellWindowArrange: () => (need('ui', '整理氢壳窗口'), core.ui.shellWindowArrange()),
      shellWindowReset: (id) => (need('ui', '重置氢壳窗口'), core.ui.shellWindowReset(id)),
      shellWindowLayout: () => (need('ui', '读取氢壳布局'), core.ui.shellWindowLayout()),
      shellScrollRootController: (fn) => (need('ui', '注册氢壳滚动根'), own(core.ui.registerShellScrollRoot(fn))),
      shellScrollRoot: () => (need('ui', '读取氢壳滚动根'), core.ui.shellScrollRoot()),
      shellScrollBridge: (options) => {
        need('ui', '安装氢壳滚动桥')
        const bridge = installShellScrollBridge(options)
        const dispose = () => bridge.dispose()
        own(dispose)
        return bridge
      },
      shellStyle: Object.freeze({
        sanitizeTokenValue: (name, value) => (need('ui', '读取氢壳样式函数'), shellStyle.sanitizeTokenValue(name, value)),
        mergeShellTokens: (globalTokens, overrides) => (need('ui', '读取氢壳样式函数'), shellStyle.mergeShellTokens(globalTokens, overrides)),
        tokenCss: (tokens) => (need('ui', '读取氢壳样式函数'), shellStyle.tokenCss(tokens)),
        moduleInspectorModel: (layout, id) => (need('ui', '读取氢壳样式函数'), shellStyle.moduleInspectorModel(layout, id)),
      }),
      shellMedia: Object.freeze({
        isHttpsUrl: (value) => (need('ui', '读取氢壳媒体函数'), shellMedia.isHttpsUrl(value)),
        validateMediaFile: (file, options) => (need('ui', '读取氢壳媒体函数'), shellMedia.validateMediaFile(file, options)),
        validateMediaDescriptor: (kind, descriptor) => (need('ui', '读取氢壳媒体描述'), shellMedia.validateMediaDescriptor(kind, descriptor)),
        openMediaDb: (indexedDBRef, name) => (need('ui', '打开氢壳媒体存储'), shellMedia.openMediaDb(indexedDBRef, name)),
        readMedia: (options) => (need('ui', '读取氢壳媒体存储'), shellMedia.readMedia(options)),
        writeMedia: (options) => (need('ui', '写入氢壳媒体存储'), shellMedia.writeMedia(options)),
        clearMedia: (options) => (need('ui', '删除氢壳媒体存储'), shellMedia.clearMedia(options)),
        loadFontFace: (options) => (need('ui', '加载氢壳字体'), shellMedia.loadFontFace(options)),
      }),
      shellLayout: Object.freeze({
        widthBucket: (width) => (need('ui', '读取氢壳布局函数'), shellLayout.widthBucket(width)),
        layoutStorageKey: (origin, bucket) => (need('ui', '读取氢壳布局函数'), shellLayout.layoutStorageKey(origin, bucket)),
        snapRect: (rect, options) => (need('ui', '读取氢壳布局函数'), shellLayout.snapRect(rect, options)),
        sanitizeShellLayout: (raw, options) => (need('ui', '读取氢壳布局函数'), shellLayout.sanitizeShellLayout(raw, options)),
        defaultShellLayout: (options) => (need('ui', '读取氢壳布局函数'), shellLayout.defaultShellLayout(options)),
        arrangeShellWindows: (layout, registry, viewport) => (need('ui', '读取氢壳布局函数'), shellLayout.arrangeShellWindows(layout, registry, viewport)),
        migrateLegacyShellLayout: (options) => (need('ui', '读取氢壳布局函数'), shellLayout.migrateLegacyShellLayout(options)),
      }),
    },

    admin: {
      exportAll: () => {
        need('admin', '导出全部数据')
        const data = {}
        for (const k of rawKeys()) data[k] = rawGet(k)
        return { app: "lsb", version: VERSION, exportedAt: Date.now(), count: Object.keys(data).length, data }
      },
      importAll: (payload, opts = {}) => {
        need('admin', '导入全部数据')
        const merge = !!(opts && opts.merge)
        if (!payload || payload.app !== "lsb" || typeof payload.data !== "object") {
          throw new Error("备份文件格式不正确（缺少 app/data 字段）")
        }
        let imported = 0
        let skipped = 0
        for (const [k, v] of Object.entries(payload.data)) {
          if (!k.startsWith(RAW_PREFIX)) continue
          if (merge && rawGet(k) !== undefined) { skipped++; continue }
          rawSet(k, v)
          imported++
        }
        return { imported, skipped }
      },
    },

    dom: {
      each: (selector, fn) => {
        need('read', '监听 DOM')
        return own(core.dom.onEach(selector, fn, { owner: rec.id }))
      },
      posts: () => [...document.querySelectorAll(site.SEL.postEntry)],
      items: () => [...document.querySelectorAll(site.SEL.listItems)],
    },

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

    election: (opts = {}) => {
      need('events', '参与选主')
      const el = new Election(api.tabs, {
        onPromote: opts.onPromote,
        onDemote: opts.onDemote,
        jitter: opts.jitter ?? 800,
        id: core.channel?.id ? `${core.channel.id}:${rec.id}` : undefined,
        beatMs: opts.beatMs,
        leaderTimeoutMs: opts.leaderTimeoutMs,
      })
      el.start()
      own(() => el.stop())
      return el
    },

    util: { esc, num, text, sleep, throttle, clone, satisfies },
    log: (...a) => core.log(rec.id, ...a),
    error: (msg) => {
      const e = msg instanceof Error ? msg : new Error(String(msg))
      core._pushErr({
        kind: 'module-error',
        id: rec.id,
        msg: String(e.message),
        stack: String(e.stack || '').slice(0, 400),
      })
    },
    track: (event, detail) => {
      core._pushErr({ kind: 'track', id: rec.id, msg: event + (detail ? ' · ' + String(detail) : '') })
    },
    onDispose: (fn) => own(fn),
  }
  if (typeof __LSB_BUILD_PROFILE__ === 'undefined' || __LSB_BUILD_PROFILE__ === 'dev') {
    api.ai = {
      prepareConversation,
      buildConversationContext,
      throwIfAborted,
      createAnswerStream,
      diagnostics: Object.freeze({ normalizeEndpoint, classifyProbeResponse, redactDiagnostic }),
      evidence: Object.freeze({ buildEvidenceSnapshot, diffEvidenceSnapshots, mergeCitationReview }),
      registerAction: (spec) => {
        const permission = spec?.permission || 'read'
        need(permission, '注册 AI 动作')
        return own(core.ai.register(spec, rec.id, rec.context))
      },
      actions: (context) => (need('read', '读取 AI 动作目录'), core.ai.actions(context)),
      describe: (context) => (need('read', '读取 AI 动作目录'), core.ai.describe(context)),
      validate: (step, context, options) => (need('read', '校验 AI 动作'), core.ai.validate(step, context, options)),
      validatePlan: (plan, context, options) => (need('read', '校验 AI 计划'), core.ai.validatePlan(plan, context, options)),
      preview: (step, context) => (need('read', '预览 AI 动作'), core.ai.preview(step, context)),
      execute: (step, context) => (need('read', '执行 AI 动作'), core.ai.execute(step, context)),
      trace: {
        sanitize: (event) => sanitizeTraceEvent(event),
        validate: (event, previous) => validateTraceEvent(event, previous),
        transition: (previous, next) => transitionTrace(previous, next),
        normalizePlanVersion: (plan, context) => normalizePlanVersion(plan, context),
        reasonCode: (code) => reasonCode(code),
        emit: (event) => {
          need('events', '广播 AI 阶段事件')
          const safe = sanitizeTraceEvent(event)
          const checked = validateTraceEvent(safe)
          if (!checked.ok) return checked
          core.bus.emit('ai:trace', safe, { source: rec.id })
          return { ok: true, event: safe }
        },
      },
    }
  }
  return api
}
