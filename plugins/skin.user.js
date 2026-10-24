// ==UserScript==
// @name         LSB·界面精修
// @namespace    https://linux.sb/
// @version      2.0.33
// @description  旧三段式与 iOS 27 单画布双模式界面：连续正文、工具浮层、外观与布局自定义。需要 LINUX.SB 基座。
// @author       you
// @match        https://linux.sb/*
// @grant        none
// @run-at       document-end
// @noframes
// ==/UserScript==


(function () {
  'use strict'

  const manifest = {
    id: 'skin',
    name: '界面精修',
    version: '2.0.33',
    description: '旧三段式与 iOS 27 单画布双模式，保留正文排版与站内安全链',
    author: 'you',
    requires: { base: '^0.2.3' },
    permissions: ['ui', 'storage', 'events', 'read'],
    config: {
      shell: { type: 'switch', label: '氢壳', desc: '同时控制旧三段式和 iOS 27 单画布；关闭后恢复站点原生页面。', default: true },
      uiMode: {
        type: 'select',
        label: '界面模式',
        default: 'legacy',
        options: [
          { value: 'legacy', label: '旧三段式' },
          { value: 'ios27', label: 'iOS 27 单画布' },
        ],
      },
      topicSpa: { type: 'switch', label: '帖子页同文档软跳', desc: '默认开启；可关闭以恢复站点原生帖子生命周期与交互。', default: true },
      glass: { type: 'switch', label: '玻璃材料', default: false },
      glassOpacity: { type: 'number', label: '玻璃透明度（0.35–1）', default: 0.72 },
      glassBlur: { type: 'number', label: '玻璃模糊（0–32px）', default: 18 },
      baseFontSize: { type: 'number', label: '基础字号（12–32px）', default: 14 },
      fontFamily: { type: 'text', label: '界面字体', default: '' },
      fontUrl: { type: 'text', label: '字体 URL（HTTPS）', default: '' },
      backgroundVideoEnabled: { type: 'switch', label: '启用视频背景', default: false },
      backgroundVideoUrl: { type: 'text', label: '视频 URL（HTTPS）', default: '' },
      backgroundVideoLocalKey: { type: 'text', label: '本地视频资源键', default: '' },
      backgroundImageUrl: { type: 'text', label: '静态图片 URL（HTTPS）', default: '' },
      backgroundImageLocalKey: { type: 'text', label: '本地图片资源键', default: '' },
      fontLocalKey: { type: 'text', label: '本地字体资源键', default: '' },
      typography: { type: 'switch', label: '正文排版（行高 1.75 · 中文字体栈）', default: true },
      density: {
        type: 'select',
        label: '列表密度',
        default: '舒适',
        options: ['紧凑', '舒适'],
      },
      codeblock: { type: 'switch', label: '代码块样式强化', default: true },
      floors: { type: 'switch', label: '楼层优化（分隔线）', default: true },
      measure: { type: 'switch', label: '宽屏限宽阅读（≥1280px 生效）', default: false },
    },
  }

  /* M17 单一画布状态契约：保持纯函数，DOM 与存储适配留在 setup。 */
  const CANVAS_STATE_VERSION = 2
  const CANVAS_STATE_KEY = 'canvas-state:v2'
  const CANVAS_WIDTH_CLASSES = ['wide', 'mid', 'narrow']
  const CLOUDFLARE_CHALLENGE_ATTR = 'data-lsb-cloudflare-challenge'
  const SPA_ROUTE_PENDING_CLASS = 'lsb-canvas-route-pending'
  const SPA_ROUTE_COMMITTED_EVENT = 'lsb:route-committed'
  const CLOUDFLARE_CHALLENGE_MARKERS = '#challenge-stage, #challenge-form, #challenge-running, #cf-challenge-running, .cf-browser-verification, [data-cf-challenge]'
  const CLOUDFLARE_CHALLENGE_TITLE_COPY = /(?:just a moment|attention required|checking your browser|checking if (?:the )?site connection is secure)/i
  const CLOUDFLARE_CHALLENGE_BODY_COPY = /(?:checking your browser|verify (?:that )?you are human|enable javascript and cookies to continue|performing (?:a )?security (?:check|verification)|complete (?:the )?security check|请完成.{0,12}验证|请进行.{0,12}验证|正在验证|人机验证)/i
  const CLOUDFLARE_CHALLENGE_COPY_SELECTOR = 'h1, h2, h3, p, [role="heading"], #challenge-error-text, #challenge-body-text, [data-cf-challenge-message]'
  const CANVAS_DEFAULT_APPEARANCE = Object.freeze({
    background: 'static', backgroundVideoUrl: '', backgroundVideoLocalKey: '', backgroundImageUrl: '', backgroundImageLocalKey: '',
    opacity: 0.72, blur: 18, fontFamily: '', fontUrl: '', fontLocalKey: '',
    fontSize: 14, textColor: '', panelColor: '', accentColor: '', radius: 16,
    motion: 'auto', transparency: 'auto',
  })
  const CANVAS_DEFAULT_SURFACES = Object.freeze({
    // @LSB_DEV_AI_START
    aiCard: { width: 420, height: 560 },
    // @LSB_DEV_AI_END
    siteCard: { width: 360, height: 560 }, evidenceCard: { width: 420, height: 320 },
  })
  const CANVAS_AI_MARKUP = { capsule: '', tool: '', query: '', card: '' }
  // @LSB_DEV_AI_START
  CANVAS_AI_MARKUP.capsule = '<button type="button" data-canvas-open="ai-card" aria-label="AI 助理">✦</button>'
  CANVAS_AI_MARKUP.tool = '<button type="button" data-tool-action="ai-card">AI 助理</button>'
  CANVAS_AI_MARKUP.query = '<div data-canvas-query><textarea data-canvas-query-input aria-label="自然语言工具请求" placeholder="直接说你想做什么"></textarea><button type="button" data-canvas-send>发送</button></div>'
  CANVAS_AI_MARKUP.card = `<section data-surface="ai-card" role="dialog" tabindex="-1" aria-hidden="true" aria-keyshortcuts="Arrow keys, Shift+Arrow keys, Home, End, Escape" aria-labelledby="lsb-canvas-ai-title" hidden>
              <div data-canvas-sheet-head><span data-canvas-sheet-grabber aria-hidden="true"></span><h2 id="lsb-canvas-ai-title">AI 助理</h2><button type="button" data-canvas-close aria-label="关闭">×</button></div>
              <div data-canvas-ai-host style="min-height:0;flex:1;display:flex;flex-direction:column">AI 工作台尚未启用</div>
              <span data-canvas-resize-handle role="separator" aria-label="调整 AI 卡片大小"></span>
            </section>`
  // @LSB_DEV_AI_END

  function isCloudflareChallengeDocument(doc) {
    if (!doc?.querySelector) return false
    if (doc.documentElement?.getAttribute(CLOUDFLARE_CHALLENGE_ATTR) === 'true') return true
    if (!doc.querySelector(CLOUDFLARE_CHALLENGE_MARKERS)) return false
    if (CLOUDFLARE_CHALLENGE_TITLE_COPY.test(String(doc.title || ''))) return true
    const view = doc.defaultView
    for (const node of doc.querySelectorAll(CLOUDFLARE_CHALLENGE_COPY_SELECTOR)) {
      if (!CLOUDFLARE_CHALLENGE_BODY_COPY.test(node.textContent || '')) continue
      let visible = true
      for (let current = node; current?.nodeType === 1; current = current.parentElement) {
        if (current.hidden || current.getAttribute('aria-hidden') === 'true') {
          visible = false
          break
        }
        const style = view?.getComputedStyle?.(current)
        if (style && (style.display === 'none' || style.visibility === 'hidden' || style.visibility === 'collapse' || style.opacity === '0')) {
          visible = false
          break
        }
        if (current === doc.body || !current.parentElement) break
      }
      if (visible) return true
    }
    return false
  }

  function canvasFinite(value, fallback = 0) {
    const n = Number(value)
    return Number.isFinite(n) ? n : fallback
  }

  function canvasCopy(value) {
    if (value === null || typeof value !== 'object') return value
    if (Array.isArray(value)) return value.map(canvasCopy)
    const out = {}
    for (const [key, item] of Object.entries(value)) out[key] = canvasCopy(item)
    return out
  }

  function canvasMerge(left, right) {
    const a = left && typeof left === 'object' ? left : {}
    const b = right && typeof right === 'object' ? right : {}
    const out = canvasCopy(a)
    for (const [key, value] of Object.entries(b)) {
      if (value && typeof value === 'object' && !Array.isArray(value) && a[key] && typeof a[key] === 'object' && !Array.isArray(a[key])) out[key] = canvasMerge(a[key], value)
      else out[key] = canvasCopy(value)
    }
    return out
  }

  function widthClass(width) {
    const n = canvasFinite(width, 0)
    return n >= 1100 ? 'wide' : n >= 700 ? 'mid' : 'narrow'
  }

  function siteKeyFromLocation(locationLike) {
    try {
      const url = locationLike instanceof URL
        ? locationLike
        : new URL(String(locationLike?.href || locationLike || ''), 'https://linux.sb/')
      return url.origin
    } catch {
      return ''
    }
  }

  function defaultCanvasState() {
    return {
      version: CANVAS_STATE_VERSION,
      enabled: true,
      global: {
        preset: 'balanced-glass',
        appearance: canvasCopy(CANVAS_DEFAULT_APPEARANCE),
        surfaceDefaults: canvasCopy(CANVAS_DEFAULT_SURFACES),
        layout: { wide: {}, mid: {}, narrow: {} },
      },
      sites: {},
      legacyLayoutSnapshot: null,
    }
  }

  function mergeCanvasState(globalState, siteOverride = {}) {
    const source = globalState && typeof globalState === 'object' ? globalState : {}
    const base = source.global && typeof source.global === 'object' ? source.global : source
    const overrideSource = siteOverride && typeof siteOverride === 'object' ? siteOverride : {}
    const override = overrideSource.global && typeof overrideSource.global === 'object' ? overrideSource.global : overrideSource
    const merged = canvasMerge(base, override)
    if (!merged.preset) merged.preset = 'balanced-glass'
    merged.appearance = canvasMerge(CANVAS_DEFAULT_APPEARANCE, merged.appearance)
    merged.surfaceDefaults = canvasMerge(CANVAS_DEFAULT_SURFACES, merged.surfaceDefaults)
    merged.layout = canvasMerge({ wide: {}, mid: {}, narrow: {} }, merged.layout)
    return merged
  }

  function clampSurfaceRect(rect = {}, viewport = {}, minimum = {}) {
    const vw = Math.max(1, Math.round(canvasFinite(viewport.width, 1)))
    const vh = Math.max(1, Math.round(canvasFinite(viewport.height, 1)))
    const minWidth = Math.max(1, Math.round(canvasFinite(minimum.width, 240)))
    const minHeight = Math.max(1, Math.round(canvasFinite(minimum.height, 160)))
    const width = Math.min(vw, Math.max(minWidth, Math.round(canvasFinite(rect.width, minWidth))))
    const height = Math.min(vh, Math.max(minHeight, Math.round(canvasFinite(rect.height, minHeight))))
    const x = Math.min(Math.max(0, Math.round(canvasFinite(rect.x, 0))), Math.max(0, vw - width))
    const y = Math.min(Math.max(0, Math.round(canvasFinite(rect.y, 0))), Math.max(0, vh - height))
    return { x, y, width, height }
  }

  function migrateLegacySkinState(rawConfig = {}, mediaMeta = {}) {
    const raw = rawConfig && typeof rawConfig === 'object' ? rawConfig : {}
    const next = defaultCanvasState()
    next.enabled = raw.shell !== false
    const appearance = {}
    for (const [source, target] of [['backgroundVideoUrl', 'backgroundVideoUrl'], ['backgroundVideoLocalKey', 'backgroundVideoLocalKey'], ['backgroundImageUrl', 'backgroundImageUrl'], ['backgroundImageLocalKey', 'backgroundImageLocalKey'], ['fontUrl', 'fontUrl'], ['fontLocalKey', 'fontLocalKey'], ['fontFamily', 'fontFamily'], ['textColor', 'textColor'], ['panelColor', 'panelColor'], ['accentColor', 'accentColor']]) {
      if (raw[source]) appearance[target] = String(raw[source])
    }
    if (raw.baseFontSize != null) appearance.fontSize = canvasFinite(raw.baseFontSize, 14)
    if (raw.glassOpacity != null) appearance.opacity = canvasFinite(raw.glassOpacity, 0.72)
    if (raw.glassBlur != null) appearance.blur = canvasFinite(raw.glassBlur, 18)
    if (raw.backgroundVideoEnabled === true) appearance.background = 'video'
    else if (raw.backgroundImageUrl || raw.backgroundImageLocalKey) appearance.background = 'image'
    if (Object.keys(appearance).length) next.global.appearance = canvasMerge(next.global.appearance, appearance)
    if (mediaMeta && typeof mediaMeta === 'object') next.global.appearance = canvasMerge(next.global.appearance, {
      ...(mediaMeta.videoId || mediaMeta.videoKey ? { backgroundVideoLocalKey: mediaMeta.videoId || mediaMeta.videoKey } : {}),
      ...(mediaMeta.fontId || mediaMeta.fontKey ? { fontLocalKey: mediaMeta.fontId || mediaMeta.fontKey } : {}),
    })
    next.legacyLayoutSnapshot = {
      version: 1, shell: raw.shell, layoutMode: raw.layoutMode, header: raw.header, rail: raw.rail, aside: raw.aside,
      wallpaperUrl: raw.wallpaperUrl, backgroundVideoUrl: raw.backgroundVideoUrl, backgroundVideoLocalKey: raw.backgroundVideoLocalKey,
      backgroundImageUrl: raw.backgroundImageUrl, backgroundImageLocalKey: raw.backgroundImageLocalKey,
      fontFamily: raw.fontFamily, fontUrl: raw.fontUrl, fontLocalKey: raw.fontLocalKey, glassOpacity: raw.glassOpacity, glassBlur: raw.glassBlur,
    }
    return next
  }

  function resolveSurfaceMode(widthValue, surfaceKind = '') {
    const bucket = CANVAS_WIDTH_CLASSES.includes(widthValue) ? widthValue : 'wide'
    const kind = String(surfaceKind || '')
    if (kind === 'top-status' || kind === 'tool-capsule') return 'fixed'
    if (bucket === 'wide') {
      if (kind === 'site-card') return 'rail'
      return kind.endsWith('sheet') ? 'sheet' : 'floating'
    }
    return bucket === 'mid' ? 'sheet' : 'fullscreen'
  }

  // ═══════════════════════════════════════════════════════════
  // 章节索引（本文件 8205 行，全仓最大，改动前先定位章节）：
  //   A: 画布状态 — defaultCanvasState / mergeCanvasState / clampSurfaceRect / migrateLegacySkinState / read/saveCanvasState
  //   B: 工具与壳样式 — shellCss / canvasCss / css / applyShellTokens / 媒体/字体/视频
  //   C: 原生结构接管 — restyle / markNative / nativeHeaders/Sidebars / asideWide / uiMode resize
  //   D: 氢壳视图与窗口 — aside/shellAside* / window/shellWindow* / canvas 状态持久化
  //   E: 插件特性与工具菜单 — collectBoards / renderPluginFeatureEntries / collectTools
  //   F: 导航与搜索 — pagePath / locationText / shellSearchHost / adoptSearch
  // 拆分建议：按 A–F 提 plugins/skin/*.js 子模块，由 build-suite.mjs 聚合（复用 skin 的 @LSB_DEV_AI_START 机制）。
  // ═══════════════════════════════════════════════════════════
  function setup(api) {
    let cfg = api.config()

    // ── A: 配置与画布状态（effectiveUiMode/canvasViewport/readSaveCanvasState） ──
    function effectiveUiMode() {
      return cfg?.uiMode === 'ios27' ? 'ios27' : 'legacy'
    }

    const SEARCH_FORM_SELECTOR = 'form.search-form, form.meilisearch-search-top-form, form[role="search"][aria-label="站内搜索"]'
    const TOP_SEARCH_FORM_SELECTOR = 'body > .top form.search-form, body > .top form.meilisearch-search-top-form, body > .top form[role="search"][aria-label="站内搜索"]'
    const topicSpaMigrationKey = 'topicSpaNewWorldDefaultMigrationV1'
    try {
      if (api.store.get(topicSpaMigrationKey) !== true) {
        api.saveConfig({ topicSpa: true })
        cfg = { ...cfg, topicSpa: true }
        api.store.set(topicSpaMigrationKey, true)
      }
    } catch {
      // Keep the resolved config when migration storage is unavailable.
    }
    let canvasState = null
    let canvasEffective = null
    let canvasSiteKey = siteKeyFromLocation(location)
    let canvasWidthClass = widthClass(window.innerWidth || document.documentElement?.clientWidth || 0)
    let canvasStateMigrated = false

    function canvasViewport() {
      return {
        width: Math.max(1, Number(window.innerWidth || document.documentElement?.clientWidth || 1)),
        height: Math.max(1, Number(window.innerHeight || document.documentElement?.clientHeight || 1)),
      }
    }

    function readCanvasState() {
      let stored = null
      try { stored = api.store.get(CANVAS_STATE_KEY, null) } catch { stored = null }
      if (!stored || typeof stored !== 'object' || Number(stored.version) !== CANVAS_STATE_VERSION) {
        canvasState = migrateLegacySkinState(cfg)
        canvasStateMigrated = true
        try { api.store.set(CANVAS_STATE_KEY, canvasState) } catch { /* storage may be unavailable */ }
      } else {
        const base = defaultCanvasState()
        canvasState = canvasMerge(base, stored)
        canvasState.version = CANVAS_STATE_VERSION
        canvasState.sites = stored.sites && typeof stored.sites === 'object' ? canvasCopy(stored.sites) : {}
      }
      canvasSiteKey = siteKeyFromLocation(location)
      canvasWidthClass = widthClass(canvasViewport().width)
      canvasEffective = mergeCanvasState(canvasState, canvasState.sites?.[canvasSiteKey] || {})
      return canvasEffective
    }

    function saveCanvasState() {
      if (!canvasState) return
      try { api.store.set(CANVAS_STATE_KEY, canvasCopy(canvasState)) } catch { /* storage failure is non-fatal */ }
    }

    function canvasDebugSnapshot() {
      const host = document.getElementById('lsb-shell-surfaces')
      return {
        enabled: canvasState?.enabled !== false && cfg.shell !== false,
        version: CANVAS_STATE_VERSION,
        siteKey: canvasSiteKey,
        widthClass: canvasWidthClass,
        preset: canvasEffective?.preset || 'balanced-glass',
        legacyLayoutSnapshot: canvasCopy(canvasState?.legacyLayoutSnapshot || null),
        surfaces: [...(host?.querySelectorAll?.('[data-surface]') || [])]
          .filter((node) => !node.hidden && !['top-status', 'tool-capsule'].includes(node.getAttribute('data-surface')))
          .map((node) => String(node.getAttribute('data-surface') || ''))
          .filter(Boolean),
        user: {
          enabled: canvasPageType() === 'user',
          selfProfile: {
            mounted: !!document.querySelector('[data-canvas-profile-host] .lsb-canvas-self-user-card'),
            expanded: document.querySelector('[data-canvas-profile-host]')?.dataset.expanded === 'true',
            locked: document.querySelector('[data-canvas-profile-host]')?.dataset.locked === 'true',
          },
          profile: {
            scrollMode: document.querySelector('[data-lsb-canvas-profile]')?.dataset.scrollMode || 'full',
            expanded: document.querySelector('[data-lsb-canvas-profile]')?.dataset.expanded === 'true',
            mounted: !!document.querySelector('[data-lsb-canvas-profile] .sidebar-card.user-card'),
          },
          listMounted: !!document.querySelector('[data-lsb-canvas-list]'),
          topLinks: [...(host?.querySelectorAll?.('[data-canvas-status-links] a, [data-canvas-pinned-links] a') || [])].map((node) => String(node.textContent || '').trim()).filter(Boolean),
          gap: 12,
        },
      }
    }

    readCanvasState()
    const shellLayoutApi = api.ui.shellLayout || null
    const shellStyleApi = api.ui.shellStyle || null
    const hasWindowApi = typeof api.ui.shellWindowController === 'function'
    let contentHome = null
    let contentOutlet = null
    let contentScroller = null
    let scrollBridge = null
    const nativeSidebarHomes = new Map()
    let shellWindowLayout = null
    let shellWindowRegistry = []
    let shellLayoutKey = ''
    let shellLayoutSaveTimer = 0
    const shellTokenProps = new Set()
    let mediaDbPromise = null
    let mediaGeneration = 0
    let backgroundVideo = null
    let backgroundVideoObjectUrl = ''
    let backgroundImage = null
    let backgroundImageObjectUrl = ''
    let loadedFontFace = null
    let loadedFontObjectUrl = ''
    let backgroundSpecKey = ''
    let fontSpecKey = ''
    let spaRouteChromeSerial = 0
    let mountedUiMode = null
    let pendingUiModeScroll = null
    let cloudflareChallengeObserver = null
    let uiModeResizeBound = false
    let uiModeWideSnapshot = null
    let canvasShell = null
    let canvasSurfaceHost = null
    let canvasActiveSheet = ''
    let canvasFocusReturn = null
    let canvasSearchOutsideHandler = null
    let canvasZIndex = 0
    let canvasSelectionBound = false
    let canvasSelectionHandler = null
    let canvasSelectionPost = null
    let canvasSelectionText = ''
    let canvasSelectionDismissTimer = 0
    let canvasScrollBound = false
    let canvasScrollLast = 0
    let canvasScrollRaf = 0
    let canvasScrollHandler = null
    let canvasResizeHandler = null
    let canvasDragState = null
    let canvasDragRaf = 0
    let canvasProfileExpanded = false
    let canvasProfileScrollMode = 'full'
    let canvasSelfProfileHome = null
    let canvasSelfProfileHost = null
    let canvasSelfProfileLocked = false
    let canvasListSurface = null
    let canvasListHome = null
    let canvasStatusObserver = null
    let canvasScrollTarget = null
    const canvasStatusLinkHomes = new Map()
    let windowInteractionBound = false
    let windowInteractionState = null
    let windowInteractionRaf = 0
    let responsiveBound = false
    let responsiveHandler = null
    let narrowActiveWindow = 'content'
    const LAYOUT_MIGRATION_KEY = 'layoutMigrationVersion'
    const LAYOUT_MIGRATION_VERSION = 1
    const LAYOUT_SAVE_DEBOUNCE = 150
    const offWindowController = hasWindowApi
      ? api.ui.shellWindowController((action, value) => {
        if (action === 'focus') return focusShellWindow(value)
        if (action === 'arrange') return arrangeShellWindows()
        if (action === 'reset') return resetShellWindow(value)
        if (action === 'layout') return shellWindowLayout ? structuredCloneSafe(shellWindowLayout) : null
        return null
      })
      : () => {}
    const offScrollRoot = typeof api.ui.shellScrollRootController === 'function'
      ? api.ui.shellScrollRootController(() => contentScroller)
      : () => {}
    const offAsideController = typeof api.ui.shellAsideController === 'function'
      ? api.ui.shellAsideController((id) => {
        const aside = document.querySelector('#lsb-shell-aside')
        return asideSetActive(id, aside, true)
      })
      : () => {}
    // @LSB_DEV_AI_START
    const SORTS = Object.freeze(['post', 'comment', 'lucky', 'card', 'red_packet'])
    api.ai.registerAction({
      id: 'site.filter',
      version: 1,
      terminal: true,
      order: 15,
      label: '列表筛选',
      description: '按固定排序筛选当前首页或版块列表',
      permission: 'read',
      pages: ['home', 'forum'],
      args: { sort: { type: 'enum', values: SORTS } },
      validateArgs: (_args, context) => {
        if (context.route?.type === 'forum' && !Number.isInteger(Number(context.route.id))) {
          return { code: 'route.invalid', path: 'route.id', message: '当前版块路由无效' }
        }
        return null
      },
      preview: (args, context) => `按“${args.sort}”排序当前${context.route?.type === 'forum' ? '版块' : '首页'}列表`,
      execute: (args, context) => ({
        kind: 'navigation',
        url: context.route?.type === 'forum' ? api.routes.forum(Number(context.route.id), { sort: args.sort }) : api.routes.homeSorted(args.sort),
        label: '已应用列表筛选',
      }),
    })
    // @LSB_DEV_AI_END
    let searchHome = null
    let userCardHome = null
    let canvasProfileSlot = null
    let canvasProfileOutlet = null
    const canvasSiteSidebarHomes = new Map()
    const canvasPersistentSiteCards = new Map()
    let canvasSiteSidebarHost = null
    let canvasSiteStatusHost = null
    let canvasSiteStatusLocked = false
    let canvasSidebarObserver = null
    const extrasHomes = new Map()
    const asideHomes = new Map()
    const asidePersistentCards = new Map()
    const asideViews = new Map()
    const externalWindowViews = new Map()
    const ASIDE_ACTIVE_KEY = 'aside-active'
    const storedAsideId = api.store.get(ASIDE_ACTIVE_KEY, 'site')
    let asidePreferredId = storedAsideId === 'site' || /^[a-z][a-z0-9-]{0,63}$/.test(String(storedAsideId || ''))
      ? String(storedAsideId || 'site')
      : 'site'
    let asideActiveId = 'site'
    let asideResizeBound = false
    let themeToggleHome = null
    let colorSchemeHome = null
    let colorSchemeModalHome = null
    let onlineObs = null
    let onlineAvatarObs = null
    let onlineAvatarTimer = 0
    let onlineUserRefreshTimer = 0
    let onlineUserRefreshInflight = null
    let onlineUserRefreshPending = false
    let onlineUserRefreshAfterInflight = false
    let onlineUserRefreshVisibilityBound = false
    let onlineUserRefreshGeneration = 0
    let onlineUserLastSyncAt = 0
    let extrasObs = null
    let timelineRaf = 0
    let refreshTimer = 0
    let windowListening = false
    let spaSerial = 0
    let spaFilledSerial = 0
    let nativeThreadObserver = null
    let nativeThreadList = null
    let nativeThreadApplyTimer = 0
    let nativeThreadLifecycleBound = false
    const nativeReplyParentByForm = new WeakMap()
    let nativeCaptchaObserver = null
    let nativeCaptchaApplyTimer = 0
    let nativeCaptchaEpoch = 0
    const nativeCaptchaSolvers = new WeakMap()
    let spaAbortController = null
    let toolsCache = null
    let spaProgressTimer = 0
    let spaIgnorePop = false
    let spaHistoryIndex = 0
    let spaHistoryRollbackIndex = null
    let spaBound = false
    let homeInf = null
    const homeInfRecords = new WeakMap()
    let spaViewKey = ''
    const VIEW_CACHE_MAX = 5
    const HOME_STASH_REFRESH_MS = 30000
    const ONLINE_USER_REFRESH_MS = 30000
    const viewCache = new Map()
    let homeStashTimer = 0
    let homeStashInflight = null
    let homeStashGen = 0
    let homeStashPending = false

    const BUILTIN_WINDOWS = Object.freeze([
      { id: 'nav', label: '导航', order: 10, min: { width: 200, height: 160 }, defaultRect: { width: 240, height: 640 } },
      { id: 'content', label: '正文', order: 20, min: { width: 320, height: 240 }, defaultRect: { width: 720, height: 640 } },
      { id: 'site', label: '站点', order: 30, min: { width: 240, height: 160 }, defaultRect: { width: 280, height: 640 } },
    ])

    /* ── 共存检测：色彩主题已由其它脚本负责，本模块只做排版层，天然无冲突。
       若未来加入色彩子项，须在此让位。 ── */
    const themesPresent = !!document.querySelector('style[data-themes-plugin]')

    const FONT_SANS =
      "system-ui,-apple-system,'Segoe UI','PingFang SC','Hiragino Sans GB','Microsoft YaHei','Noto Sans SC',sans-serif"
    const FONT_MONO =
      "ui-monospace,SFMono-Regular,'Cascadia Code',Consolas,'JetBrains Mono','Noto Sans Mono CJK SC',monospace"

    // ── B: 工具与样式（esc/shellCss/canvasCss/css/applyShellTokens） ──
    function esc(s) {
      return String(s ?? '').replace(/[&<>"']/g, (c) =>
        ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c],
      )
    }

    function structuredCloneSafe(value) {
      try {
        if (typeof structuredClone === 'function') return structuredClone(value)
      } catch {
        /* fall through to JSON for the small layout record */
      }
      try {
        return JSON.parse(JSON.stringify(value))
      } catch {
        return value
      }
    }

    // · B1 shellCss: 旧三段式壳（固定顶栏/左轨/右栏变量与栅格） ──
    function shellCss() {
      return `
        html.lsb-skin-shell-on{
          --lsb-shell-header:48px;
          --lsb-shell-rail:240px;
          --lsb-shell-gutter:12px;
          --lsb-shell-panel-pad:24px;
          --lsb-shell-main-inset:calc(var(--lsb-shell-gutter) + var(--lsb-shell-panel-pad));
          --lsb-shell-aside:280px;
          --lsb-shell-timeline:72px;
          --lsb-radius:12px;
          --lsb-radius-sm:8px;
          --lsb-radius-lg:16px;
          background:var(--bg,#f4f5f7);
          color:var(--text,#222);
        }
        html.lsb-skin-shell-topic{--lsb-shell-main-inset:var(--lsb-shell-gutter)}
        html.lsb-skin-shell-user{--lsb-shell-main-inset:calc(var(--lsb-shell-gutter) + 12px)}
        html[data-themes-color-mode="dark"],html[data-dark-mode-theme="dark"]{color-scheme:dark}
        html[data-themes-color-mode="light"],html[data-dark-mode-theme="light"]{color-scheme:light}
        #lsb-shell{
          display:none;position:fixed;inset:0;z-index:7999;pointer-events:none;
        }
        #lsb-shell > *{pointer-events:auto}
        #lsb-shell-header{
          position:fixed;top:0;left:0;right:0;height:var(--lsb-shell-header);z-index:8002;
          display:grid;align-items:center;
          grid-template-columns:var(--lsb-shell-rail) minmax(160px,360px) minmax(0,1fr) auto auto;
          column-gap:0;padding:0 16px 0 0;
          background:color-mix(in srgb,var(--panel,#fff) 78%,transparent);
          backdrop-filter:blur(16px) saturate(140%);
          -webkit-backdrop-filter:blur(16px) saturate(140%);
          box-shadow:0 1px 0 color-mix(in srgb,var(--line,#ddd) 55%,transparent);
          font-family:${FONT_SANS};
        }
        #lsb-shell-rail{
          position:fixed;top:0;left:0;bottom:0;width:var(--lsb-shell-rail);z-index:8001;
          display:flex;flex-direction:column;
          background:var(--bg,#f4f5f7);color:var(--text,#222);
          border-right:1px solid var(--line-soft,#e8e8e8);
          font-family:${FONT_SANS};
        }
        .lsb-shell-rail-scroll{flex:1;min-height:0;overflow:hidden;padding:56px 12px 12px;display:flex;flex-direction:column}
        .lsb-shell-rail-scroll [data-lsb-shell-section="home"]{flex:0 0 auto}
        .lsb-shell-rail-scroll [data-lsb-shell-section="boards"]{flex:1 1 auto;min-height:0;overflow:auto}
        .lsb-shell-rail-scroll [data-lsb-shell-section="tools"]{flex:0 0 auto}
        .lsb-shell-me{margin:0 0 14px}
        .lsb-shell-me .sidebar-card.user-card{
          margin:0;padding:10px 10px;border:0;box-shadow:none;
          border-radius:var(--lsb-radius);
          background:color-mix(in srgb,var(--panel,#fff) 72%,transparent);
        }
        .lsb-shell-me .user-header-info{gap:8px}
        .lsb-shell-me .user-avatar-big img,.lsb-shell-me .avatar-img{
          width:40px!important;height:40px!important;
        }
        .lsb-shell-me .user-name{font-size:13px;font-weight:600;white-space:nowrap;overflow:hidden;text-overflow:ellipsis}
        .lsb-shell-me .user-rank{font-size:11px;color:var(--text-muted,#888)}
        .lsb-shell-rail-foot{padding:10px 12px 14px;border-top:1px solid var(--line-soft,#e8e8e8)}
        .lsb-shell-brand{
          display:flex;align-items:center;gap:8px;margin:0;width:100%;height:100%;
          padding:0 14px;font-weight:700;font-size:14px;letter-spacing:-.02em;
          color:var(--text,#222);text-decoration:none;
          min-width:0;white-space:nowrap;overflow:hidden;
        }
        .lsb-shell-logo{
          flex:0 0 22px;width:22px;height:22px;border-radius:6px;display:block;
        }
        .lsb-shell-search-host{
          min-width:0;max-width:360px;width:100%;box-sizing:border-box;
          padding-left:var(--lsb-shell-main-inset);
        }
        .lsb-shell-search-host .search-form,.lsb-shell-search-host .lsb-shell-search{
          display:flex;align-items:center;gap:8px;margin:0;padding:3px 6px 3px 10px;
          width:100%;max-width:none;justify-self:stretch;
          grid-column:auto;grid-row:auto;
          border-radius:var(--lsb-radius);overflow:hidden;
          background:color-mix(in srgb,var(--bg,#f4f5f7) 88%,transparent);
        }
        .lsb-shell-search-host .search-page-link{
          display:flex;align-items:center;margin:0;padding:0;width:100%;max-width:none;height:30px;
          grid-area:auto;grid-column:auto;grid-row:auto;justify-self:stretch;
          border:1px solid var(--line,#ddd);border-radius:var(--lsb-radius);
          background:color-mix(in srgb,var(--bg,#f4f5f7) 88%,transparent);
          color:var(--text-subtle,#888);text-decoration:none;overflow:hidden;
        }
        .lsb-shell-search-host .search-page-fake-input{
          flex:1;min-width:0;padding:0 10px;font-size:13px;
          white-space:nowrap;overflow:hidden;text-overflow:ellipsis;
        }
        .lsb-shell-search-host .search-page-fake-icon{
          display:inline-flex;align-items:center;justify-content:center;
          flex:0 0 30px;width:30px;height:100%;
        }
        .lsb-shell-search-host select{
          border:0;border-radius:var(--lsb-radius-sm);background:transparent;
          color:var(--text,#222);font-size:12px;height:26px;
        }
        .lsb-shell-search-host input[type=search],.lsb-shell-search-host input[name=q]{
          flex:1;min-width:0;height:26px;border:0;border-radius:var(--lsb-radius-sm);
          background:transparent;color:var(--text,#222);padding:0 8px;font-size:13px;
        }
        .lsb-shell-search-host button{
          border:0;border-radius:var(--lsb-radius-sm);height:26px;padding:0 10px;
          background:var(--brand-soft,#e8f4f2);color:var(--brand,#5eaaa0);font-size:12px;cursor:pointer;
        }
        .lsb-shell-extras{
          display:flex;align-items:center;gap:14px;min-width:0;overflow:hidden;
          margin-left:16px;
        }
        .lsb-shell-extras a{
          flex:0 0 auto;color:var(--text,#222);text-decoration:none;font-size:13px;font-weight:500;
          white-space:nowrap;
        }
        .lsb-shell-where{
          margin-left:16px;font-size:13px;font-weight:600;letter-spacing:-.01em;
          color:var(--text,#222);white-space:nowrap;overflow:hidden;text-overflow:ellipsis;max-width:22vw;
        }
        .lsb-shell-theme{margin-left:8px;display:flex;align-items:center;gap:8px;overflow:visible;position:relative}
        .lsb-shell-theme [data-themes-mode-toggle]{
          border:0;background:transparent;color:var(--text,#222);cursor:pointer;
          width:32px;height:32px;padding:4px;border-radius:var(--lsb-radius-sm);
        }
        .lsb-shell-theme [data-themes-mode-toggle] svg{display:block;width:18px;height:18px}
        .lsb-shell-theme .dark-mode-control{position:relative;flex:0 0 auto;grid-area:auto;justify-self:auto}
        .lsb-shell-theme .dark-mode-menu{z-index:8003}
        html.lsb-skin-shell-on #color-scheme-modal{z-index:8020!important}
        html.lsb-skin-shell-on .lsb-shell-theme-modal{z-index:8020!important}
        .lsb-shell-theme .color-scheme-top-link{
          display:inline-flex;width:30px;height:30px;align-items:center;justify-content:center;
          grid-area:auto;justify-self:auto;flex:0 0 30px;
          color:var(--text-muted,#888);text-decoration:none;
        }
        .lsb-shell-theme .color-scheme-top-link svg{width:17px;height:17px;display:block}
        #lsb-shell-aside{
          display:none;flex-direction:column;position:fixed;top:var(--lsb-shell-header);right:0;bottom:0;
          width:var(--lsb-shell-aside);z-index:7999;overflow:hidden;padding:0;
          background:var(--bg,#f4f5f7);color:var(--text,#222);
          border-left:1px solid var(--line-soft,#e8e8e8);
          font-family:${FONT_SANS};
        }
        #lsb-shell-aside-tabs{
          display:flex;align-items:center;gap:4px;min-height:40px;padding:6px 10px;
          border-bottom:1px solid var(--line-soft,#e8e8e8);background:color-mix(in srgb,var(--panel,#fff) 72%,transparent);
        }
        #lsb-shell-aside-tabs[hidden]{display:none!important}
        #lsb-shell-aside-tabs [data-lsb-shell-aside-tab]{
          flex:1 1 0;min-width:0;height:28px;padding:0 8px;border:0;border-radius:var(--lsb-radius-sm);
          background:transparent;color:var(--text-muted,#888);font:inherit;font-size:12px;cursor:pointer;
        }
        #lsb-shell-aside-tabs [data-lsb-shell-aside-tab][aria-selected="true"]{
          background:var(--brand-soft,#e8f4f2);color:var(--brand,#5eaaa0);font-weight:600;
        }
        .lsb-shell-aside-panes{flex:1 1 auto;height:auto;min-height:0}
        [data-lsb-shell-aside-pane]{height:100%;min-height:0;box-sizing:border-box;overflow:auto;padding:12px 10px 16px}
        [data-lsb-shell-aside-pane][hidden]{display:none!important}
        #lsb-shell-aside .sidebar-card{
          margin:0 0 10px;padding:10px 10px 8px;border-radius:var(--lsb-radius);
          background:color-mix(in srgb,var(--panel,#fff) 78%,transparent);
        }
        .lsb-shell-nav-section{margin:0 0 16px}
        .lsb-shell-nav-section h2{
          margin:0 8px 6px;font-size:11px;font-weight:600;color:var(--text-muted,#888);
          letter-spacing:.04em;
        }
        .lsb-shell-nav .lsb-shell-link{
          display:flex;align-items:center;justify-content:space-between;gap:8px;padding:6px 10px;border-radius:var(--lsb-radius-sm);
          color:var(--text,#222);text-decoration:none;font-size:13px;font-weight:500;
          width:100%;border:0;background:transparent;cursor:pointer;text-align:left;font-family:inherit;box-sizing:border-box;
        }
        .lsb-shell-nav .lsb-shell-link-label{
          min-width:0;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;
        }
        .lsb-shell-nav .lsb-shell-count{
          flex:0 0 auto;font-size:11px;font-weight:500;color:var(--text-muted,#888);
          font-variant-numeric:tabular-nums;
        }
        .lsb-shell-nav a.is-active{
          background:var(--brand-soft,#e8f4f2);color:var(--brand,#5eaaa0);font-weight:600;
        }
        .lsb-shell-settings{
          width:100%;height:32px;border:0;border-radius:var(--lsb-radius-sm);cursor:pointer;
          background:transparent;color:var(--text,#222);font-size:13px;font-weight:600;
        }
        .lsb-shell-settings:active,.lsb-shell-nav .lsb-shell-link:active{transform:scale(.98)}
        #lsb-shell-timeline{
          position:fixed;top:calc(var(--lsb-shell-header) + 20px);right:14px;bottom:28px;
          width:var(--lsb-shell-timeline);z-index:7998;
          display:flex;flex-direction:column;align-items:center;gap:8px;
          font-family:${FONT_SANS};font-size:11px;font-weight:600;color:var(--text-muted,#888);
        }
        #lsb-shell-timeline[hidden]{display:none!important}
        html.lsb-skin-shell-on .image-lightbox-image{max-width:100%;max-height:100%}
        .lsb-shell-edge{
          border:0;background:transparent;color:var(--text,#222);cursor:pointer;
          font:inherit;font-weight:600;padding:4px;
        }
        .lsb-shell-edge:active{transform:scale(.97)}
        .lsb-shell-now{text-align:center;line-height:1.25}
        .lsb-shell-now strong{display:block;color:var(--text,#222);font-size:12px}
        .lsb-shell-track{
          flex:1;width:3px;padding:0;border:0;border-radius:99px;cursor:pointer;
          background:var(--line-soft,#e6e6e6);position:relative;min-height:64px;
        }
        .lsb-shell-thumb{
          position:absolute;left:50%;top:var(--lsb-timeline-progress,0%);
          width:8px;height:8px;margin:-4px 0 0 -4px;border-radius:50%;
          background:var(--brand,#5eaaa0);
        }
        html.lsb-skin-shell-on li.post-item{padding-block:8px!important;border-radius:var(--lsb-radius)}
        html.lsb-skin-shell-on li.post-item .post-title{
          font-weight:600;font-size:14px;letter-spacing:-.01em;line-height:1.3;
        }
        html.lsb-skin-shell-on li.post-item .post-meta{
          font-size:12px;font-weight:400;color:var(--text-muted,#888);
        }
        html.lsb-skin-shell-on li.post-item .post-avatar img{
          width:32px!important;height:32px!important;border-radius:50%;
        }
        html.lsb-skin-shell-on li.post-item:not(.post-entry) .meta-icon{display:none}
        html.lsb-skin-shell-on main.wrap{
          max-width:none!important;margin-left:0!important;margin-right:0!important;width:auto!important;
          padding-left:var(--lsb-shell-gutter)!important;
        }
        html.lsb-skin-shell-on .forum-layout.forum-layout-has-sidebar{gap:12px!important}
        html.lsb-skin-shell-on main.wrap,
        html.lsb-skin-shell-on .forum-main,
        html.lsb-skin-shell-on .home-shell{
          border-radius:var(--lsb-radius-lg);
        }
        html.lsb-skin-shell-on ul.post-list{
          border-radius:var(--lsb-radius-lg);
        }
        /* legacy 首页宽屏把纵向滚动交给中间面板，页面根和右栏保持固定。首页由 JS 明确标记，不能用 .home-shell 判断：首页和帖子页共用这个容器。 */
        @media(min-width:900px){
          html.lsb-skin-shell-on.lsb-skin-shell-home:not(.lsb-canvas-mode){
            box-sizing:border-box!important;height:100vh!important;max-height:100vh!important;overflow:hidden!important;
          }
          html.lsb-skin-shell-on.lsb-skin-shell-home:not(.lsb-canvas-mode) body{
            box-sizing:border-box!important;display:flex!important;flex-direction:column!important;
            height:calc(100vh - var(--lsb-shell-header))!important;
            max-height:calc(100vh - var(--lsb-shell-header))!important;
            min-height:0!important;margin:0!important;overflow:hidden!important;
          }
          html.lsb-skin-shell-on.lsb-skin-shell-home:not(.lsb-canvas-mode) body > main.wrap{
            box-sizing:border-box!important;display:flex!important;flex:1 1 auto!important;flex-direction:column!important;
            width:auto!important;max-width:none!important;margin-left:0!important;margin-right:0!important;padding-right:0!important;
            height:100%!important;max-height:100%!important;
            min-width:0!important;min-height:0!important;overflow:hidden!important;
          }
          html.lsb-skin-shell-on.lsb-skin-shell-home:not(.lsb-canvas-mode) body > main.wrap .home-shell,
          html.lsb-skin-shell-on.lsb-skin-shell-home:not(.lsb-canvas-mode) body > main.wrap .home-shell > .forum-layout.forum-layout-has-sidebar,
          html.lsb-skin-shell-on.lsb-skin-shell-home:not(.lsb-canvas-mode) body > main.wrap .home-shell > .forum-layout.forum-layout-has-sidebar > .forum-main{
            box-sizing:border-box!important;display:flex!important;flex:1 1 auto!important;flex-direction:column!important;
            width:100%!important;max-width:none!important;min-width:0!important;min-height:0!important;
          }
          html.lsb-skin-shell-on.lsb-skin-shell-home:not(.lsb-canvas-mode) body > main.wrap .home-shell{
            padding-right:0!important;
          }
          html.lsb-skin-shell-on.lsb-skin-shell-home:not(.lsb-canvas-mode) body > main.wrap .home-shell > .forum-layout.forum-layout-has-sidebar > .forum-main > .main-panel{
            box-sizing:border-box!important;display:flex!important;flex:1 1 auto!important;flex-direction:column!important;
            width:100%!important;max-width:none!important;min-width:0!important;min-height:0!important;
            overflow-y:auto!important;overflow-x:hidden!important;overscroll-behavior:contain;scrollbar-gutter:stable;
          }
        }
        html.lsb-skin-shell-on .post-content img,
        html.lsb-skin-shell-on .post-content video{
          border-radius:var(--lsb-radius-sm);
        }
        html.lsb-skin-shell-on .pagination a,
        html.lsb-skin-shell-on .pagination span,
        html.lsb-skin-shell-on .tab-link,
        html.lsb-skin-shell-on .sort-tabs a{
          border-radius:var(--lsb-radius-sm)!important;
        }
        html.lsb-skin-shell-on .pagination-bar.sb-infinite-scroll-pagination-hidden{
          display:none!important;
        }
        html.lsb-skin-shell-on form.ajax-reply-form,
        html.lsb-skin-shell-on .reply-box,
        html.lsb-skin-shell-on textarea{
          border-radius:var(--lsb-radius)!important;
        }
        @media(min-width:900px){
          html.lsb-skin-shell-on #lsb-shell{display:block}
          html.lsb-skin-shell-on{padding-top:var(--lsb-shell-header);padding-left:var(--lsb-shell-rail)}
          html.lsb-skin-shell-topic{padding-right:var(--lsb-shell-timeline)}
          html.lsb-skin-shell-on .lsb-native-header-hidden,
          html.lsb-skin-shell-on .forum-more-region{display:none!important}
          html.lsb-skin-shell-on .lsb-native-sidebar-hidden,
          html.lsb-skin-shell-on .lsb-native-left-hidden{display:none!important}
          html.lsb-skin-shell-on .forum-layout.forum-layout-has-sidebar{
            display:block!important;grid-template-columns:1fr!important;
          }
          html.lsb-skin-shell-on .lsb-launcher{display:none!important}
          html.lsb-skin-shell-user{padding-right:var(--lsb-shell-aside)}
          html.lsb-skin-shell-user #lsb-shell-aside{display:block}
          html.lsb-skin-shell-on .image-lightbox-overlay{
            top:var(--lsb-shell-header);left:var(--lsb-shell-rail);right:0;bottom:0;
          }
          html.lsb-skin-shell-topic .image-lightbox-overlay{right:var(--lsb-shell-timeline)}
          html.lsb-skin-shell-user .image-lightbox-overlay{right:var(--lsb-shell-aside)}
        }
        @media(min-width:1100px){
          html.lsb-skin-shell-on{padding-right:var(--lsb-shell-aside)}
          html.lsb-skin-shell-topic{padding-right:var(--lsb-shell-aside)}
          html.lsb-skin-shell-on #lsb-shell-aside{display:flex}
          html.lsb-skin-shell-on #lsb-shell-timeline{display:none!important}
          html.lsb-skin-shell-on .image-lightbox-overlay{right:var(--lsb-shell-aside)}
        }
        @media(hover:hover) and (pointer:fine){
          .lsb-shell-nav .lsb-shell-link:hover{background:color-mix(in srgb,var(--bg,#fff) 40%,transparent)}
          .lsb-shell-extras a:hover{color:var(--brand,#5eaaa0)}
          .lsb-shell-settings:hover{background:var(--brand-soft,#e8f4f2)}
        }
        @media(prefers-reduced-transparency:reduce){
          #lsb-shell-header{background:var(--panel,#fff);backdrop-filter:none;-webkit-backdrop-filter:none}
        }
        @media(prefers-reduced-motion:reduce){
          html.lsb-skin-shell-on #lsb-shell *{scroll-behavior:auto!important;transform:none!important}
          #lsb-shell-progress,
          #lsb-shell-progress [data-lsb-shell-progress-bar]{transition:none!important}
        }
        #lsb-shell-progress{
          --lsb-shell-progress:0;
          position:fixed;top:0;left:0;right:0;z-index:8002;height:3px;
          pointer-events:none;opacity:0;background:transparent;
          transition:opacity 120ms cubic-bezier(.23,1,.32,1);
        }
        #lsb-shell-progress[data-phase="loading"],
        #lsb-shell-progress[data-phase="done"]{opacity:1}
        #lsb-shell-progress [data-lsb-shell-progress-bar]{
          display:block;width:100%;height:100%;
          transform:scaleX(var(--lsb-shell-progress));transform-origin:left center;
          background:var(--brand,#5eaaa0);
          transition:transform 200ms cubic-bezier(.23,1,.32,1);
        }
        [data-lsb-route-content-enter]{animation:lsb-route-content-in 180ms ease both}
        @keyframes lsb-route-content-in{from{opacity:0;transform:translateY(5px)}to{opacity:1;transform:translateY(0)}}
        #lsb-route-announcer{
          position:absolute;width:1px;height:1px;padding:0;margin:-1px;overflow:hidden;
          clip-path:inset(50%);white-space:nowrap;border:0;
        }
        @media(prefers-reduced-motion:reduce){[data-lsb-route-content-enter]{animation:none!important;transform:none!important}}
        html.lsb-canvas-reduced-motion [data-lsb-route-content-enter]{animation:none!important;transform:none!important}
        /* H2 窗口工作区：默认令牌仍继承站点主题，几何由 skin 的 layout controller 写入。 */
        #lsb-shell[data-lsb-shell-mode="windowed"] #lsb-shell-workspace{
          position:fixed;top:var(--lsb-shell-header);left:0;right:0;bottom:0;
          overflow:hidden;pointer-events:none;
        }
        /* 窗口模式覆盖 700–899px 的媒体查询空档；窗口已挂载就必须可见。 */
        html.lsb-skin-shell-windowed #lsb-shell[data-lsb-shell-mode="windowed"]{display:block}
        html.lsb-skin-shell-windowed .lsb-native-header-hidden,
        html.lsb-skin-shell-windowed .lsb-native-sidebar-hidden,
        html.lsb-skin-shell-windowed .lsb-native-left-hidden,
        html.lsb-skin-shell-windowed .forum-more-region{display:none!important}
        #lsb-shell-workspace > [data-lsb-shell-video]{
          position:absolute;inset:0;width:100%;height:100%;object-fit:cover;
          z-index:0;pointer-events:none;opacity:0;transition:opacity 180ms ease;
        }
        html.lsb-skin-video-on #lsb-shell-workspace > [data-lsb-shell-video]{opacity:1}
        #lsb-shell-workspace > [data-lsb-shell-image]{
          position:absolute;inset:0;width:100%;height:100%;object-fit:cover;
          z-index:0;pointer-events:none;opacity:0;transition:opacity 180ms ease;
        }
        html.lsb-skin-image-on #lsb-shell-workspace > [data-lsb-shell-image]{opacity:1}
        #lsb-shell[data-lsb-shell-mode="windowed"] .lsb-shell-window{
          position:absolute;display:flex;flex-direction:column;min-width:0;min-height:0;
          box-sizing:border-box;overflow:hidden;pointer-events:auto;
          border:1px solid var(--line-soft,#e8e8e8);border-radius:var(--lsb-radius-lg);
          background:var(--panel,#fff);color:var(--text,#222);
          box-shadow:0 12px 30px color-mix(in srgb,var(--text,#222) 12%,transparent);
          z-index:1;
        }
        #lsb-shell[data-lsb-shell-mode="windowed"] .lsb-shell-window[data-lsb-shell-interacting="drag"]{
          will-change:transform;contain:layout paint;
        }
        #lsb-shell[data-lsb-shell-mode="windowed"] .lsb-shell-window[data-lsb-shell-interacting="resize"]{
          will-change:left,top,width,height;contain:layout paint;
        }
        #lsb-shell[data-lsb-shell-mode="windowed"] .lsb-shell-window[hidden]{display:none!important}
        #lsb-shell[data-lsb-shell-mode="windowed"] .lsb-shell-window[data-lsb-shell-external="true"][data-lsb-shell-open="false"]{display:none!important}
        #lsb-shell[data-lsb-shell-mode="windowed"] .lsb-shell-window-bar{
          display:flex;align-items:center;gap:6px;min-height:32px;flex:0 0 32px;
          padding:0 8px;border-bottom:1px solid var(--line-soft,#e8e8e8);
          background:color-mix(in srgb,var(--panel,#fff) 82%,transparent);
          color:var(--text,#222);user-select:none;touch-action:none;position:relative;z-index:5;
        }
        #lsb-shell[data-lsb-shell-mode="windowed"] .lsb-shell-window-title{
          min-width:0;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;
          font:600 12px/1 ${FONT_SANS};
        }
        #lsb-shell[data-lsb-shell-mode="windowed"] .lsb-shell-window-drag{
          flex:1;min-width:16px;height:100%;cursor:grab;
        }
        #lsb-shell[data-lsb-shell-mode="windowed"] .lsb-shell-window-drag:active{cursor:grabbing}
        #lsb-shell[data-lsb-shell-mode="windowed"] .lsb-shell-window-action{
          flex:0 0 28px;width:28px;height:28px;padding:0;border:0;border-radius:6px;
          background:transparent;color:var(--text-muted,#888);cursor:pointer;font:inherit;
        }
        #lsb-shell[data-lsb-shell-mode="windowed"] .lsb-shell-window-action:hover,
        #lsb-shell[data-lsb-shell-mode="windowed"] .lsb-shell-window-action:focus-visible{
          background:var(--brand-soft,#e8f4f2);color:var(--brand,#5eaaa0);outline:none;
        }
        #lsb-shell[data-lsb-shell-mode="windowed"] .lsb-shell-window:focus-visible{
          outline:2px solid var(--brand,#5eaaa0);outline-offset:2px;
        }
        #lsb-shell[data-lsb-shell-mode="windowed"] .lsb-shell-window-body{
          flex:1 1 auto;min-width:0;min-height:0;overflow:auto;overscroll-behavior:contain;
        }
        #lsb-shell[data-lsb-shell-mode="windowed"] #lsb-shell-rail > .lsb-shell-window-body,
        #lsb-shell[data-lsb-shell-mode="windowed"] #lsb-shell-aside > .lsb-shell-window-body{
          display:flex;flex-direction:column;
        }
        #lsb-shell[data-lsb-shell-mode="windowed"] #lsb-shell-rail,
        #lsb-shell[data-lsb-shell-mode="windowed"] #lsb-shell-aside,
        #lsb-shell[data-lsb-shell-mode="windowed"] #lsb-shell-window-content{
          top:0;right:auto;bottom:auto;left:auto;width:auto;height:auto;
          position:absolute;z-index:auto;
        }
        #lsb-shell[data-lsb-shell-mode="windowed"] #lsb-shell-rail{padding:0;border-right:0}
        #lsb-shell[data-lsb-shell-mode="windowed"] #lsb-shell-rail .lsb-shell-rail-scroll{padding-top:12px}
        #lsb-shell[data-lsb-shell-mode="windowed"] #lsb-shell-aside{display:flex;padding:0;border-left:0}
        #lsb-shell[data-lsb-shell-mode="windowed"] #lsb-shell-window-content main.wrap{
          width:auto!important;max-width:none!important;margin:0!important;padding:12px!important;
        }
        #lsb-shell[data-lsb-shell-mode="windowed"] .lsb-shell-window-content-body{
          flex:1 1 auto;min-width:0;min-height:0;overflow:auto;overscroll-behavior:contain;
        }
        #lsb-shell[data-lsb-shell-mode="windowed"] [data-lsb-shell-resize-edge]{
          position:absolute;z-index:4;touch-action:none;
        }
        #lsb-shell[data-lsb-shell-mode="windowed"] [data-lsb-shell-resize-edge="e"],
        #lsb-shell[data-lsb-shell-mode="windowed"] [data-lsb-shell-resize-edge="w"]{
          top:12px;bottom:12px;width:10px;cursor:ew-resize;
        }
        #lsb-shell[data-lsb-shell-mode="windowed"] [data-lsb-shell-resize-edge="e"]{right:-5px}
        #lsb-shell[data-lsb-shell-mode="windowed"] [data-lsb-shell-resize-edge="w"]{left:-5px}
        #lsb-shell[data-lsb-shell-mode="windowed"] [data-lsb-shell-resize-edge="s"],
        #lsb-shell[data-lsb-shell-mode="windowed"] [data-lsb-shell-resize-edge="n"]{
          left:12px;right:12px;height:10px;cursor:ns-resize;
        }
        #lsb-shell[data-lsb-shell-mode="windowed"] [data-lsb-shell-resize-edge="s"]{bottom:-5px}
        #lsb-shell[data-lsb-shell-mode="windowed"] [data-lsb-shell-resize-edge="n"]{top:-5px}
        #lsb-shell[data-lsb-shell-mode="windowed"] [data-lsb-shell-resize-edge="e"],
        #lsb-shell[data-lsb-shell-mode="windowed"] [data-lsb-shell-resize-edge="w"]{
          width:10px;top:12px;bottom:12px;
        }
        #lsb-shell[data-lsb-shell-mode="windowed"] [data-lsb-shell-resize-edge="e"]{right:-5px}
        #lsb-shell[data-lsb-shell-mode="windowed"] [data-lsb-shell-resize-edge="w"]{left:-5px}
        #lsb-shell[data-lsb-shell-mode="windowed"] [data-lsb-shell-resize-edge="s"],
        #lsb-shell[data-lsb-shell-mode="windowed"] [data-lsb-shell-resize-edge="n"]{
          height:10px;left:12px;right:12px;
        }
        #lsb-shell[data-lsb-shell-mode="windowed"] [data-lsb-shell-resize-edge="s"]{bottom:-5px}
        #lsb-shell[data-lsb-shell-mode="windowed"] [data-lsb-shell-resize-edge="n"]{top:32px}
        #lsb-shell[data-lsb-shell-mode="windowed"] [data-lsb-shell-resize-edge="ne"],
        #lsb-shell[data-lsb-shell-mode="windowed"] [data-lsb-shell-resize-edge="nw"],
        #lsb-shell[data-lsb-shell-mode="windowed"] [data-lsb-shell-resize-edge="se"],
        #lsb-shell[data-lsb-shell-mode="windowed"] [data-lsb-shell-resize-edge="sw"]{
          width:14px;height:14px;
        }
        #lsb-shell[data-lsb-shell-mode="windowed"] [data-lsb-shell-resize-edge="ne"]{right:-5px;top:32px;cursor:nesw-resize}
        #lsb-shell[data-lsb-shell-mode="windowed"] [data-lsb-shell-resize-edge="nw"]{left:-5px;top:32px;cursor:nwse-resize}
        #lsb-shell[data-lsb-shell-mode="windowed"] [data-lsb-shell-resize-edge="se"]{right:-5px;bottom:-5px;cursor:nwse-resize}
        #lsb-shell[data-lsb-shell-mode="windowed"] [data-lsb-shell-resize-edge="sw"]{left:-5px;bottom:-5px;cursor:nesw-resize}
        #lsb-shell[data-lsb-shell-mode="windowed"] .lsb-shell-window-switcher{display:none}
        @media(max-width:699px){
          html.lsb-skin-shell-on{padding:0!important;overflow:hidden}
          html.lsb-skin-shell-on body{overflow:hidden}
          html.lsb-skin-shell-on #lsb-shell{display:block}
          html.lsb-skin-shell-on .lsb-native-header-hidden,
          html.lsb-skin-shell-on .forum-more-region{display:none!important}
          html.lsb-skin-shell-on .lsb-native-sidebar-hidden,
          html.lsb-skin-shell-on .lsb-native-left-hidden{display:none!important}
          #lsb-shell[data-lsb-shell-mode="windowed"] #lsb-shell-workspace{top:var(--lsb-shell-header)}
          #lsb-shell[data-lsb-shell-mode="windowed"] .lsb-shell-window-switcher{
            display:flex;position:fixed;top:var(--lsb-shell-header);left:0;right:0;height:36px;
            z-index:8010;gap:4px;padding:4px;background:var(--panel,#fff);overflow:auto;
          }
          #lsb-shell[data-lsb-shell-mode="windowed"] .lsb-shell-window-switcher [role="tab"]{
            flex:1 0 auto;border:0;border-radius:6px;background:transparent;color:var(--text-muted,#888);
            padding:0 10px;font:600 12px ${FONT_SANS};
          }
          #lsb-shell[data-lsb-shell-mode="windowed"] .lsb-shell-window-switcher [aria-selected="true"]{
            background:var(--brand-soft,#e8f4f2);color:var(--brand,#5eaaa0);
          }
          #lsb-shell[data-lsb-shell-mode="windowed"] #lsb-shell-workspace{top:calc(var(--lsb-shell-header) + 44px)}
          #lsb-shell[data-lsb-shell-mode="windowed"] .lsb-shell-window:not([data-lsb-shell-active="true"]){display:none}
        }
        @media(prefers-reduced-motion:reduce){
          #lsb-shell[data-lsb-shell-mode="windowed"] .lsb-shell-window,
          #lsb-shell[data-lsb-shell-mode="windowed"] .lsb-shell-window *{transition:none!important;scroll-behavior:auto!important}
        }
        html.lsb-skin-shell-on{
          font-size:var(--lsb-shell-font-size,14px);
        }
        html.lsb-skin-shell-on #lsb-shell{
          font-family:var(--lsb-shell-font-family,${FONT_SANS});
        }
        html.lsb-skin-shell-on #lsb-shell-window-content,
        html.lsb-skin-shell-on #lsb-shell-rail,
        html.lsb-skin-shell-on #lsb-shell-aside{
          color:var(--lsb-shell-text,var(--text,#222));
        }
        html.lsb-skin-shell-on #lsb-shell[data-lsb-shell-mode="windowed"] .lsb-shell-window{
          background:var(--lsb-shell-panel,var(--panel,#fff));
        }
        html.lsb-skin-shell-on .lsb-shell-brand,
        html.lsb-skin-shell-on .lsb-shell-window-action{color:var(--lsb-shell-accent,var(--brand,#5eaaa0))}
        html.lsb-skin-glass-on #lsb-shell-header,
        html.lsb-skin-glass-on #lsb-shell[data-lsb-shell-mode="windowed"] .lsb-shell-window,
        html.lsb-skin-glass-on #lsb-shell[data-lsb-shell-mode="windowed"] .lsb-shell-window-bar{
          background:color-mix(in srgb,var(--lsb-shell-panel,var(--panel,#fff)) var(--lsb-shell-glass-opacity,.72),transparent);
          backdrop-filter:blur(var(--lsb-shell-glass-blur,18px));
          -webkit-backdrop-filter:blur(var(--lsb-shell-glass-blur,18px));
        }
        html.lsb-skin-shell-on #lsb-shell[data-lsb-shell-mode="windowed"] .lsb-shell-window[data-lsb-shell-glass="true"],
        html.lsb-skin-shell-on #lsb-shell[data-lsb-shell-mode="windowed"] .lsb-shell-window[data-lsb-shell-glass="true"] .lsb-shell-window-bar{
          background:color-mix(in srgb,var(--lsb-shell-panel,var(--panel,#fff)) var(--lsb-shell-glass-opacity,.72),transparent);
          backdrop-filter:blur(var(--lsb-shell-glass-blur,18px));
          -webkit-backdrop-filter:blur(var(--lsb-shell-glass-blur,18px));
        }
        @media(prefers-reduced-transparency:reduce){
          html.lsb-skin-glass-on #lsb-shell-header,
          html.lsb-skin-glass-on #lsb-shell[data-lsb-shell-mode="windowed"] .lsb-shell-window,
          html.lsb-skin-glass-on #lsb-shell[data-lsb-shell-mode="windowed"] .lsb-shell-window-bar{
            background:var(--lsb-shell-panel,var(--panel,#fff));backdrop-filter:none;-webkit-backdrop-filter:none;
          }
          html.lsb-skin-shell-on #lsb-shell[data-lsb-shell-mode="windowed"] .lsb-shell-window[data-lsb-shell-glass="true"],
          html.lsb-skin-shell-on #lsb-shell[data-lsb-shell-mode="windowed"] .lsb-shell-window[data-lsb-shell-glass="true"] .lsb-shell-window-bar{
            background:var(--lsb-shell-panel,var(--panel,#fff));backdrop-filter:none;-webkit-backdrop-filter:none;
          }
        }
      `
    }

    // · B2 canvasCss: iOS27 单画布（状态/浮层/响应式） ──
    function canvasCss() {
      return `
        html.lsb-skin-shell-on.lsb-canvas-mode{
          --lsb-canvas-safe-top:env(safe-area-inset-top,0px);
          --lsb-canvas-chrome-height:56px;
          --lsb-canvas-safe-bottom:env(safe-area-inset-bottom,0px);
          --lsb-canvas-surface-bg:color-mix(in srgb,var(--lsb-shell-panel,var(--panel,#fff)) calc(var(--lsb-shell-glass-opacity,.72) * 100%),transparent);
          --lsb-glass-fill:var(--lsb-canvas-surface-bg);
          --lsb-glass-border:color-mix(in srgb,var(--lsb-shell-text,var(--text,#222)) 18%,transparent);
          --lsb-glass-highlight:inset 0 1px 0 rgb(255 255 255 / 42%);
          --lsb-glass-shadow:0 14px 38px color-mix(in srgb,var(--lsb-shell-text,var(--text,#222)) 18%,transparent);
          --lsb-glass-blur:var(--lsb-shell-glass-blur,18px);
          --lsb-glass-saturation:140%;
          --lsb-canvas-content-bg:color-mix(in srgb,var(--lsb-shell-panel,var(--panel,#fff)) 94%,var(--bg,#f4f5f7));
          --lsb-canvas-media-scrim:rgb(8 12 22 / 18%);
          --lsb-canvas-radius:var(--lsb-shell-radius,16px);
          min-height:100%;padding:0!important;background:var(--bg,#f4f5f7);color:var(--lsb-shell-text,var(--text,#222));
          font-size:var(--lsb-shell-font-size,14px);
        }
        /* 让资料表面相对页面滚动而非被 body 的隐式滚动容器截断，sticky 才能跟随顶部状态条。 */
        html.lsb-skin-shell-on.lsb-canvas-mode body{min-height:100%;overflow-x:clip!important;overflow-y:visible!important;padding:0!important;isolation:isolate}
        html.lsb-skin-shell-on.lsb-canvas-mode #color-scheme-modal{z-index:8020!important}
        html.lsb-skin-shell-on.lsb-canvas-mode .lsb-shell-theme-modal{z-index:8020!important}
        html.lsb-skin-shell-on.lsb-canvas-mode body::before{content:'';position:fixed;inset:0;z-index:0;pointer-events:none;background:var(--lsb-canvas-media-scrim);opacity:0;transition:opacity 180ms ease}
        html.lsb-skin-shell-on.lsb-canvas-mode.lsb-skin-video-on body::before,
        html.lsb-skin-shell-on.lsb-canvas-mode.lsb-skin-image-on body::before{opacity:1}
        #lsb-shell-progress{
          --lsb-shell-progress:0;
          position:fixed;top:0;left:0;right:0;z-index:8002;height:3px;
          pointer-events:none;opacity:0;background:transparent;
          transition:opacity 120ms cubic-bezier(.23,1,.32,1)
        }
        #lsb-shell-progress[data-phase="loading"],#lsb-shell-progress[data-phase="done"]{opacity:1}
        #lsb-shell-progress [data-lsb-shell-progress-bar]{display:block;width:100%;height:100%;transform:scaleX(var(--lsb-shell-progress));transform-origin:left center;background:var(--brand,#5eaaa0);transition:transform 200ms cubic-bezier(.23,1,.32,1)}
        [data-lsb-route-content-enter]{animation:lsb-route-content-in 180ms ease both}
        @keyframes lsb-route-content-in{from{opacity:0;transform:translateY(5px)}to{opacity:1;transform:translateY(0)}}
        #lsb-route-announcer{position:absolute;width:1px;height:1px;padding:0;margin:-1px;overflow:hidden;clip-path:inset(50%);white-space:nowrap;border:0}
        @media(prefers-reduced-motion:reduce){[data-lsb-route-content-enter]{animation:none!important;transform:none!important}}
        html.lsb-canvas-reduced-motion [data-lsb-route-content-enter]{animation:none!important;transform:none!important}
        html.lsb-skin-shell-on.lsb-canvas-mode .lsb-canvas-content-root{position:relative;z-index:1;background:var(--lsb-canvas-content-bg);color:var(--lsb-shell-text,var(--text,#222))}
        html.lsb-skin-shell-on.lsb-canvas-mode main.wrap,
        html.lsb-skin-shell-on.lsb-canvas-mode .forum-main,
        html.lsb-skin-shell-on.lsb-canvas-mode .home-shell{
          box-sizing:border-box;display:block!important;width:auto!important;max-width:1120px!important;
          margin:0 auto!important;padding:calc(64px + var(--lsb-canvas-safe-top)) 24px calc(116px + var(--lsb-canvas-safe-bottom))!important;
        }
        html.lsb-skin-shell-on.lsb-canvas-mode .lsb-canvas-content-root{padding-top:0!important}
        html.lsb-skin-shell-on.lsb-canvas-mode .lsb-canvas-content-root .home-shell,html.lsb-skin-shell-on.lsb-canvas-mode .lsb-canvas-content-root .forum-main{padding-top:0!important}
        html.lsb-skin-shell-on.lsb-canvas-mode .lsb-canvas-content-root .main-panel{padding-top:0!important}
        html.lsb-skin-shell-on.lsb-canvas-mode:not(.lsb-canvas-page-home) .lsb-canvas-content-root{margin-top:calc(64px + var(--lsb-canvas-safe-top))!important}
        html.lsb-skin-shell-on.lsb-canvas-mode main.wrap,
        html.lsb-skin-shell-on.lsb-canvas-mode .forum-main,
        html.lsb-skin-shell-on.lsb-canvas-mode .home-shell,
        html.lsb-skin-shell-on.lsb-canvas-mode .main-panel{
          font-family:var(--lsb-shell-font-family,${FONT_SANS})!important;
          font-size:var(--lsb-shell-font-size,14px);
        }
        html.lsb-skin-shell-on.lsb-canvas-mode [data-canvas-profile-slot]{
          display:block;position:relative;margin:0 0 16px;padding:0;max-width:100%;
        }
        html.lsb-skin-shell-on.lsb-canvas-mode [data-canvas-profile-slot] > .sidebar-card.user-card{
          display:block!important;width:100%;margin:0;padding:12px 14px;border:1px solid color-mix(in srgb,var(--line,#ddd) 72%,transparent);
          border-radius:var(--lsb-canvas-radius);background:var(--lsb-canvas-surface-bg);backdrop-filter:blur(var(--lsb-shell-glass-blur,18px)) saturate(140%);
          box-shadow:0 8px 24px color-mix(in srgb,var(--text,#222) 10%,transparent);
        }
        [data-canvas-profile-slot] .user-header-info{gap:10px}
        [data-canvas-profile-slot] .user-avatar-big img,[data-canvas-profile-slot] .avatar-img{width:42px!important;height:42px!important}
        [data-canvas-profile-slot] .user-links{display:flex;gap:6px;flex-wrap:wrap;margin-top:10px}
        [data-canvas-profile-slot] .user-links a{display:inline-flex;align-items:center;gap:4px;padding:5px 8px;border-radius:999px;background:color-mix(in srgb,var(--panel,#fff) 42%,transparent);color:inherit;text-decoration:none;font-size:12px}
        [data-canvas-profile-slot] .btn-post{display:inline-flex;margin-top:10px}
        html.lsb-skin-shell-on.lsb-canvas-mode.lsb-canvas-page-user main.wrap{max-width:1120px!important;display:flex!important;flex-direction:column!important;gap:0!important}
        html.lsb-skin-shell-on.lsb-canvas-mode.lsb-canvas-page-user [data-lsb-canvas-profile],
        html.lsb-skin-shell-on.lsb-canvas-mode.lsb-canvas-page-user [data-lsb-canvas-list]{box-sizing:border-box;width:min(980px,100%)!important;max-width:980px!important;margin-left:auto!important;margin-right:auto!important;min-width:0}
        html.lsb-skin-shell-on.lsb-canvas-mode.lsb-canvas-page-user [data-lsb-canvas-profile]{
          position:sticky;top:calc(10px + var(--lsb-canvas-safe-top) + var(--lsb-canvas-chrome-height) + 6px);z-index:25;margin:0 auto!important;overflow:visible;
          width:fit-content!important;max-width:min(100%,760px)!important;
        }
        html.lsb-skin-shell-on.lsb-canvas-mode.lsb-canvas-page-user [data-lsb-canvas-profile] > .sidebar-card.user-card{
          display:block!important;width:fit-content!important;max-width:100%;margin:0;padding:12px 14px;border:1px solid color-mix(in srgb,var(--line,#ddd) 72%,transparent);
          border-radius:var(--lsb-canvas-radius);background:var(--lsb-canvas-surface-bg);backdrop-filter:blur(var(--lsb-shell-glass-blur,18px)) saturate(140%);
          box-shadow:0 8px 24px color-mix(in srgb,var(--text,#222) 10%,transparent);transition:none;
        }
        html.lsb-skin-shell-on.lsb-canvas-mode.lsb-canvas-page-user [data-lsb-canvas-list]{margin:12px auto 0!important;padding:12px!important;border:1px solid color-mix(in srgb,var(--line,#ddd) 72%,transparent);
          border-radius:var(--lsb-canvas-radius);background:var(--lsb-canvas-surface-bg);backdrop-filter:blur(var(--lsb-shell-glass-blur,18px)) saturate(140%);
          box-shadow:0 8px 24px color-mix(in srgb,var(--text,#222) 8%,transparent)}
        html.lsb-skin-shell-on.lsb-canvas-mode.lsb-canvas-page-user [data-lsb-canvas-list] > .home-shell,
        html.lsb-skin-shell-on.lsb-canvas-mode.lsb-canvas-page-user [data-lsb-canvas-list] > .forum-layout,
        html.lsb-skin-shell-on.lsb-canvas-mode.lsb-canvas-page-user [data-lsb-canvas-list] > .forum-main,
        html.lsb-skin-shell-on.lsb-canvas-mode.lsb-canvas-page-user [data-lsb-canvas-list] .forum-layout.forum-layout-has-sidebar,
        html.lsb-skin-shell-on.lsb-canvas-mode.lsb-canvas-page-user [data-lsb-canvas-list] .forum-main,
        html.lsb-skin-shell-on.lsb-canvas-mode.lsb-canvas-page-user [data-lsb-canvas-list] .main-panel{
          display:block!important;width:100%!important;max-width:none!important;margin:0!important;padding:0!important;background:transparent!important;
        }
        html.lsb-skin-shell-on.lsb-canvas-mode .forum-layout.forum-layout-has-sidebar{display:block!important;grid-template-columns:1fr!important}
        html.lsb-skin-shell-on.lsb-canvas-mode.lsb-canvas-page-home .home-shell,
        html.lsb-skin-shell-on.lsb-canvas-mode.lsb-canvas-page-home .forum-main{
          padding:0!important;
        }
        html.lsb-skin-shell-on.lsb-canvas-mode.lsb-canvas-page-home [data-canvas-profile-slot]{
          width:fit-content!important;max-width:min(100%,760px)!important;margin:0 auto 12px!important;
        }
        html.lsb-skin-shell-on.lsb-canvas-mode.lsb-canvas-page-home [data-canvas-profile-slot] > .sidebar-card.user-card{
          width:fit-content!important;max-width:100%;max-height:none!important;overflow:visible!important;
          padding:12px 14px;border-radius:var(--lsb-canvas-radius);
        }
        html.lsb-skin-shell-on.lsb-canvas-mode.lsb-canvas-page-home [data-canvas-profile-slot] .user-links{display:flex!important}
        html.lsb-skin-shell-on.lsb-canvas-mode.lsb-canvas-page-home [data-canvas-profile-slot] .btn-post{display:inline-flex!important}
        html.lsb-skin-shell-on.lsb-canvas-mode.lsb-canvas-page-home [data-canvas-profile-slot] .user-avatar-big img,
        html.lsb-skin-shell-on.lsb-canvas-mode.lsb-canvas-page-home [data-canvas-profile-slot] .avatar-img{width:36px!important;height:36px!important}
        html.lsb-skin-shell-on.lsb-canvas-mode.lsb-canvas-page-home .home-shell{
          background:transparent!important;border:0!important;box-shadow:none!important;border-radius:0!important;overflow:visible;
        }
        html.lsb-skin-shell-on.lsb-canvas-mode.lsb-canvas-page-home .main-panel{
          background:var(--lsb-canvas-surface-bg)!important;border:1px solid color-mix(in srgb,var(--line,#ddd) 72%,transparent);
          border-radius:var(--lsb-canvas-radius)!important;box-shadow:0 8px 24px color-mix(in srgb,var(--text,#222) 8%,transparent);
          overflow:hidden;
        }
        @media(min-width:700px){
          html.lsb-skin-shell-on.lsb-canvas-mode.lsb-canvas-page-home .lsb-canvas-content-root{
            display:flex!important;flex-direction:column!important;min-height:0!important;height:100vh!important;max-height:100vh!important;
            overflow:hidden!important;overscroll-behavior:none;
          }
          html.lsb-skin-shell-on.lsb-canvas-mode.lsb-canvas-page-home .lsb-canvas-content-root > .home-shell{
            display:flex!important;flex:1 1 auto;flex-direction:column;min-width:0;min-height:0;
          }
          html.lsb-skin-shell-on.lsb-canvas-mode.lsb-canvas-page-home .home-shell > .forum-layout.forum-layout-has-sidebar{
            display:flex!important;flex:1 1 auto;flex-direction:column;min-width:0;min-height:0;
          }
          html.lsb-skin-shell-on.lsb-canvas-mode.lsb-canvas-page-home .forum-layout.forum-layout-has-sidebar > .forum-main{
            display:flex!important;flex:1 1 auto;flex-direction:column;min-width:0;min-height:0;
          }
          html.lsb-skin-shell-on.lsb-canvas-mode.lsb-canvas-page-home .forum-main > .main-panel{
            display:flex!important;flex:1 1 auto;flex-direction:column;min-width:0;min-height:0;
            overflow-y:auto!important;overflow-x:hidden!important;overscroll-behavior:contain;scrollbar-gutter:stable;
          }
        }
        @media(max-width:699px){
          html.lsb-skin-shell-on.lsb-canvas-mode.lsb-canvas-page-home .lsb-canvas-content-root{
            height:auto!important;max-height:none!important;overflow:visible!important;
          }
          html.lsb-skin-shell-on.lsb-canvas-mode.lsb-canvas-page-home .main-panel{
            height:auto!important;max-height:none!important;overflow:visible!important;
          }
        }
        html.lsb-skin-shell-on.lsb-canvas-mode.lsb-canvas-page-home .topic-toolbar{
          min-height:44px;margin:0!important;padding:8px 12px!important;align-items:center;
        }
        html.lsb-skin-shell-on.lsb-canvas-mode .lsb-native-header-hidden,
        html.lsb-skin-shell-on.lsb-canvas-mode .lsb-native-sidebar-hidden,
        html.lsb-skin-shell-on.lsb-canvas-mode .lsb-native-left-hidden,
        html.lsb-skin-shell-on.lsb-canvas-mode .forum-more-region{display:none!important}
        html.lsb-canvas-route-pending body > .top,
        html.lsb-canvas-route-pending body > header,
        html.lsb-canvas-route-pending body > .site-header,
        html.lsb-canvas-route-pending body > [data-site-header],
        html.lsb-canvas-route-pending .forum-more-region,
        html.lsb-canvas-route-pending aside.sidebar:not(#mobile-menu-drawer):not(.mobile-menu-drawer),
        html.lsb-canvas-route-pending .forum-enhancements-left-fixed,
        html.lsb-canvas-route-pending #mobile-menu,
        html.lsb-canvas-route-pending .mobile-menu-backdrop,
        html.lsb-canvas-route-pending .lsb-launcher{display:none!important}
        html.lsb-skin-shell-on.lsb-canvas-mode aside.sidebar:not(#mobile-menu-drawer):not(.mobile-menu-drawer),
        html.lsb-skin-shell-on.lsb-canvas-mode .forum-enhancements-left-fixed{display:none!important}
        html.lsb-skin-shell-on.lsb-canvas-mode li.post-item:not(.post-entry) .meta-icon{display:none}
        html.lsb-skin-shell-on.lsb-canvas-mode li.post-item{padding-block:8px!important;border-radius:var(--lsb-canvas-radius)}
        html.lsb-skin-shell-on.lsb-canvas-mode li.post-entry{border-radius:var(--lsb-canvas-radius)}
        #lsb-shell[data-lsb-canvas-shell]{display:block;position:fixed;inset:0;z-index:7999;pointer-events:none;font-family:var(--lsb-shell-font-family,${FONT_SANS});color:var(--lsb-shell-text,var(--text,#222))}
        #lsb-shell[data-lsb-canvas-shell] *{box-sizing:border-box}
        #lsb-shell[data-lsb-canvas-shell] > [data-lsb-shell-video],#lsb-shell[data-lsb-canvas-shell] > [data-lsb-shell-image]{position:absolute;inset:0;width:100%;height:100%;object-fit:cover;z-index:0;pointer-events:none;opacity:0;transition:opacity 180ms ease}
        html.lsb-skin-video-on #lsb-shell[data-lsb-canvas-shell] > [data-lsb-shell-video]{opacity:1}
        html.lsb-skin-image-on #lsb-shell[data-lsb-canvas-shell] > [data-lsb-shell-image]{opacity:1}
        html.lsb-skin-shell-on.lsb-canvas-mode body > [data-lsb-shell-video][data-lsb-shell-video-layer="canvas"]{
          position:fixed;inset:0;width:100%;height:100%;box-sizing:border-box;object-fit:cover;
          z-index:0;pointer-events:none;opacity:0;transition:opacity 180ms ease;
        }
        html.lsb-skin-video-on.lsb-canvas-mode body > [data-lsb-shell-video][data-lsb-shell-video-layer="canvas"]{opacity:1}
        html.lsb-skin-shell-on.lsb-canvas-mode body > [data-lsb-shell-image][data-lsb-shell-image-layer="canvas"]{
          position:fixed;inset:0;width:100%;height:100%;box-sizing:border-box;object-fit:cover;
          z-index:0;pointer-events:none;opacity:0;transition:opacity 180ms ease;
        }
        html.lsb-skin-image-on.lsb-canvas-mode body > [data-lsb-shell-image][data-lsb-shell-image-layer="canvas"]{opacity:1}
        html.lsb-skin-shell-on .lsb-launcher{display:none!important}
        #lsb-shell-surfaces{position:absolute;inset:0;pointer-events:none;--lsb-canvas-chrome-height:56px}
        #lsb-shell-surfaces > [data-surface]{pointer-events:auto}
        #lsb-shell-surfaces [data-surface]{font:inherit;color:inherit}
        [data-canvas-profile-host]{
          position:fixed;top:calc(10px + var(--lsb-canvas-safe-top));left:max(12px,calc((100% - 1120px) / 2 + 24px));z-index:8004;
          display:flex;align-items:center;min-width:0;pointer-events:auto;color:inherit;
        }
        [data-canvas-profile-host][hidden]{display:none!important}
        [data-canvas-profile-host] > .sidebar-card.user-card{
          position:relative;display:block!important;box-sizing:border-box;width:190px;min-width:0;height:var(--lsb-canvas-chrome-height);max-height:var(--lsb-canvas-chrome-height);margin:0;padding:0 72px 0 10px;
          overflow:visible!important;border:1px solid var(--lsb-glass-border);border-radius:999px;background:var(--lsb-glass-fill);
          backdrop-filter:blur(var(--lsb-glass-blur)) saturate(var(--lsb-glass-saturation));-webkit-backdrop-filter:blur(var(--lsb-glass-blur)) saturate(var(--lsb-glass-saturation));
          box-shadow:var(--lsb-glass-highlight),var(--lsb-glass-shadow);transition:box-shadow 160ms ease;
        }
        [data-canvas-profile-host]:not([data-expanded="true"]) > .sidebar-card.user-card{overflow:hidden!important;}
        [data-canvas-profile-host]:not([data-expanded="true"]) .user-wrap{width:100%;height:100%;padding:0!important;margin:0!important;box-sizing:border-box}
        [data-canvas-profile-host]:not([data-expanded="true"]) .user-header{display:flex!important;align-items:center;min-height:100%;height:100%;margin:0!important;padding:0!important}
        [data-canvas-profile-host]:not([data-expanded="true"]) .user-header-info{display:flex!important;align-items:center;gap:6px;min-width:0;width:100%;height:100%;padding:0!important}
        [data-canvas-profile-host]:not([data-expanded="true"]) .user-avatar-big{display:flex!important;align-items:center;justify-content:center;flex:0 0 36px;width:36px!important;height:36px!important;min-width:36px}
        [data-canvas-profile-host]:not([data-expanded="true"]) .user-avatar-big img,[data-canvas-profile-host]:not([data-expanded="true"]) .avatar-img{display:block;width:36px!important;height:36px!important;min-width:36px;object-fit:cover}
        [data-canvas-profile-host]:not([data-expanded="true"]) .user-header-info > div{min-width:0;flex:0 1 auto;width:60px}
        [data-canvas-profile-host]:not([data-expanded="true"]) .user-name{display:block;max-width:60px;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;font-size:12px;font-weight:650;line-height:16px}
        [data-canvas-profile-host]:not([data-expanded="true"]) .user-rank,
        [data-canvas-profile-host]:not([data-expanded="true"]) .user-group,
        [data-canvas-profile-host]:not([data-expanded="true"]) .user-title{display:none!important}
        [data-canvas-profile-host]:not([data-expanded="true"]) .user-links{position:absolute;top:50%;right:42px;display:flex!important;align-items:center;gap:4px;margin:0!important;transform:translateY(-50%)}
        [data-canvas-profile-host] .user-links a[data-canvas-profile-bell]{position:relative;display:inline-flex!important;align-items:center;justify-content:center;width:27px;height:27px;padding:0;border-radius:999px;background:color-mix(in srgb,var(--panel,#fff) 42%,transparent);font-size:0;line-height:1;color:inherit}
        [data-canvas-profile-host] .user-links a[data-canvas-profile-bell] .meta-icon{width:16px;height:16px;margin:0}
        [data-canvas-profile-host] .user-links a[data-canvas-profile-bell]:hover,[data-canvas-profile-host] .user-links a[data-canvas-profile-bell]:focus-visible{background:var(--brand-soft,#e8f4f2);outline:none}
        [data-canvas-profile-host] .user-links a[data-canvas-profile-bell] .notify-badge{position:absolute;top:-2px;right:-2px;min-width:9px;height:9px;padding:0;border:2px solid var(--lsb-shell-panel,var(--panel,#fff));border-radius:50%;font-size:0;line-height:0;background:var(--danger,#e07a7a)}
        [data-canvas-profile-host]:not([data-expanded="true"]) .user-links a:not([data-canvas-profile-bell]),
        [data-canvas-profile-host]:not([data-expanded="true"]) .btn-post{display:none!important}
        [data-canvas-profile-host][data-expanded="true"]{align-items:flex-start}
        [data-canvas-profile-host][data-expanded="true"] > .sidebar-card.user-card{position:absolute;top:calc(100% + 8px);left:0;width:min(340px,calc(100vw - 24px));height:auto;max-height:none;padding:12px 14px;border-radius:var(--lsb-canvas-radius);box-shadow:var(--lsb-glass-highlight),0 18px 44px color-mix(in srgb,var(--lsb-shell-text,var(--text,#222)) 22%,transparent)}
        [data-canvas-profile-host][data-expanded="true"] .user-links{position:static;display:flex!important;gap:6px;flex-wrap:wrap;margin-top:10px!important}
        [data-canvas-profile-host][data-expanded="true"] .user-links a:not([data-canvas-profile-bell]){display:inline-flex!important}
        [data-canvas-profile-host][data-expanded="true"] .user-links a[data-canvas-profile-bell]{display:inline-flex!important;align-items:center;justify-content:center;width:auto!important;min-width:0;height:auto!important;min-height:27px;padding:5px 8px!important;gap:4px;font-size:12px!important;line-height:1.2;white-space:nowrap}
        [data-canvas-profile-host][data-expanded="true"] .user-links a[data-canvas-profile-bell] .meta-icon{flex:0 0 auto;width:14px;height:14px;margin:0}
        [data-canvas-profile-expand]{position:absolute;top:50%;right:4px;z-index:2;display:inline-flex;align-items:center;justify-content:center;width:28px;height:28px;padding:0;border:0;border-radius:999px;background:transparent;color:inherit;cursor:pointer;font:inherit;font-size:16px;line-height:1;transform:translateY(-50%)}
        [data-canvas-profile-expand]:hover,[data-canvas-profile-expand]:focus-visible{background:var(--brand-soft,#e8f4f2);outline:none}
        [data-canvas-profile-host][data-expanded="true"] [data-canvas-profile-expand]{background:var(--brand-soft,#e8f4f2)}
        @media(max-width:1099px){
          [data-canvas-profile-host]{top:calc(6px + var(--lsb-canvas-safe-top));left:8px;max-width:190px}
          [data-canvas-profile-host] > .sidebar-card.user-card{width:190px}
          #lsb-shell-surfaces [data-surface="top-status"]{left:210px;right:8px;transform:none;max-width:none}
          #lsb-shell-surfaces [data-surface="top-status"][data-compact="true"]{transform:translateY(-34px)}
          #lsb-shell-surfaces [data-surface="site-status"]{display:none!important}
        }
        @media(max-width:699px){
          [data-canvas-profile-host]{max-width:184px}
          [data-canvas-profile-host] > .sidebar-card.user-card{width:184px}
          [data-canvas-profile-host]:not([data-expanded="true"]) .user-header-info > div,
          [data-canvas-profile-host]:not([data-expanded="true"]) .user-name,
          [data-canvas-profile-host]:not([data-expanded="true"]) .user-rank{width:54px;max-width:54px}
          #lsb-shell-surfaces [data-surface="top-status"]{left:204px;max-width:calc(100vw - 16px);height:var(--lsb-canvas-chrome-height);min-height:var(--lsb-canvas-chrome-height)}
        }
        @media(min-width:1100px){
          #lsb-shell-surfaces [data-surface="top-status"]{width:min(620px,calc(100vw - 24px));max-width:min(620px,calc(100vw - 24px))}
          #lsb-shell-surfaces [data-surface="site-status"]{position:fixed;top:calc(10px + var(--lsb-canvas-safe-top));right:max(12px,calc((100vw - 1120px) / 2 + 12px));z-index:8000;display:flex;align-items:center;justify-content:flex-end;width:auto;height:var(--lsb-canvas-chrome-height);min-height:var(--lsb-canvas-chrome-height);padding:0;border:0;border-radius:0;background:transparent;backdrop-filter:none;-webkit-backdrop-filter:none;box-shadow:none;overflow:visible}
          #lsb-shell-surfaces [data-surface="site-status"][hidden]{display:none!important}
        }
        [data-canvas-backdrop]{position:fixed;inset:0;z-index:8009;background:rgb(5 8 18 / 52%);backdrop-filter:blur(4px);-webkit-backdrop-filter:blur(4px);pointer-events:auto}
        [data-canvas-backdrop][hidden]{display:none!important}
        [data-surface="top-status"]{
          position:fixed;top:calc(10px + var(--lsb-canvas-safe-top));left:50%;transform:translateX(-50%);z-index:8000;
          display:flex;align-items:center;gap:8px;height:var(--lsb-canvas-chrome-height);min-height:var(--lsb-canvas-chrome-height);max-width:min(840px,calc(100vw - 24px));padding:7px 10px;
          border:1px solid var(--lsb-glass-border);border-radius:999px;
          background:var(--lsb-glass-fill);backdrop-filter:blur(var(--lsb-glass-blur)) saturate(var(--lsb-glass-saturation));-webkit-backdrop-filter:blur(var(--lsb-glass-blur)) saturate(var(--lsb-glass-saturation));
          box-shadow:var(--lsb-glass-highlight),var(--lsb-glass-shadow);transition:opacity 160ms ease,transform 160ms ease;
        }
        [data-surface="top-status"][data-compact="true"]{opacity:.78;transform:translate(-50%,-34px)}
        [data-surface="top-status"] button,[data-surface="tool-capsule"] button,[data-surface="tool-sheet"] button{font:inherit}
        [data-surface="top-status"] [data-canvas-status-title]{flex:0 0 auto;min-width:0;max-width:46vw;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;font-weight:650}
        [data-route-transition="in"]{animation:lsb-route-title-in 180ms ease both}
        @keyframes lsb-route-title-in{from{opacity:.45;transform:translateY(2px)}to{opacity:1;transform:none}}
        [data-canvas-status-links]{display:flex;align-items:center;gap:5px;flex:1 1 auto;min-width:0;overflow-x:auto;overscroll-behavior-inline:contain;scrollbar-width:none}
        [data-canvas-status-links]::-webkit-scrollbar{display:none}
        [data-canvas-pinned-links]{display:flex;align-items:center;gap:5px;flex:0 0 auto;min-width:0}
        [data-canvas-status-links] a,[data-canvas-pinned-links] a,[data-canvas-pinned-links] [data-canvas-navigation-trigger]{display:inline-flex;align-items:center;flex:0 0 auto;min-height:30px;padding:0 8px;border:0;border-radius:999px;
          color:inherit;text-decoration:none;font:inherit;font-size:12px;font-weight:550;white-space:nowrap;background:color-mix(in srgb,var(--panel,#fff) 48%,transparent);cursor:pointer}
        [data-canvas-status-links] a:hover,[data-canvas-status-links] a:focus-visible,[data-canvas-pinned-links] a:hover,[data-canvas-pinned-links] a:focus-visible,[data-canvas-pinned-links] [data-canvas-navigation-trigger]:hover,[data-canvas-pinned-links] [data-canvas-navigation-trigger]:focus-visible{background:var(--brand-soft,#e8f4f2);outline:none}
        [data-canvas-search-host]{position:relative;display:flex;align-items:center;justify-content:center;flex:0 0 34px;width:34px;min-width:34px;max-width:34px;height:34px;margin-left:2px;overflow:visible}
        [data-canvas-search-host][hidden]{display:none!important}
        [data-canvas-search-trigger]{display:inline-flex;align-items:center;justify-content:center;flex:0 0 34px;width:34px;height:34px;padding:0;border:1px solid var(--lsb-glass-border);border-radius:50%;background:color-mix(in srgb,var(--panel,#fff) 42%,transparent);box-shadow:var(--lsb-glass-highlight);color:inherit;cursor:pointer}
        [data-canvas-search-trigger]:hover,[data-canvas-search-trigger]:focus-visible{background:var(--brand-soft,#e8f4f2);outline:none}
        [data-canvas-search-trigger] svg{display:block;width:17px;height:17px;stroke:currentColor;stroke-width:1.8;fill:none;stroke-linecap:round;stroke-linejoin:round}
        [data-canvas-search-panel]{position:absolute;top:calc(100% + 8px);right:0;z-index:8020;box-sizing:border-box;width:min(320px,calc(100vw - 24px));max-width:calc(100vw - 24px);padding:8px;border:1px solid var(--lsb-glass-border);border-radius:20px;background:var(--lsb-glass-fill);backdrop-filter:blur(var(--lsb-glass-blur)) saturate(var(--lsb-glass-saturation));-webkit-backdrop-filter:blur(var(--lsb-glass-blur)) saturate(var(--lsb-glass-saturation));box-shadow:var(--lsb-glass-highlight),var(--lsb-glass-shadow)}
        [data-canvas-search-panel][hidden]{display:none!important}
        [data-canvas-search-panel] .lsb-shell-search{display:flex!important;align-items:center;gap:4px;box-sizing:border-box;width:100%;min-width:0;max-width:none;height:34px;margin:0;padding:3px 5px 3px 9px;border:1px solid var(--lsb-glass-border);border-radius:999px;background:color-mix(in srgb,var(--panel,#fff) 42%,transparent);box-shadow:var(--lsb-glass-highlight);overflow:hidden}
        [data-canvas-search-panel] .lsb-shell-search input[type="search"],[data-canvas-search-panel] .lsb-shell-search input[name="q"]{box-sizing:border-box;flex:1 1 auto;width:100%;min-width:0;height:26px;margin:0;padding:0 5px;border:0;border-radius:999px;background:transparent;color:inherit;font:inherit;font-size:12px}
        [data-canvas-search-panel] .lsb-shell-search select{flex:0 1 auto;max-width:68px;min-width:0;height:26px;border:0;border-radius:999px;background:transparent;color:inherit;font:inherit;font-size:11px}
        [data-canvas-search-panel] .lsb-shell-search button{flex:0 0 auto;min-width:28px;height:26px;padding:0 7px;border:0;border-radius:999px;background:var(--brand-soft,#e8f4f2);color:var(--brand,#5eaaa0);font:inherit;font-size:11px;cursor:pointer}
        [data-canvas-search-panel] .lsb-shell-search.search-page-link{display:flex!important;align-items:center;justify-content:space-between;min-width:40px;padding:0 9px;color:inherit;text-decoration:none;font-size:12px}
        [data-canvas-site-status-host]{position:relative;isolation:isolate;display:flex;align-items:center;gap:2px;width:auto;height:100%;min-height:var(--lsb-canvas-chrome-height);padding:0 8px 0 14px;border:0;border-radius:999px;background:transparent;box-shadow:none;overflow:visible;z-index:1;cursor:pointer;color:inherit}
        [data-canvas-site-status-host]::before{content:'';position:absolute;inset:0;z-index:0;border:1px solid var(--lsb-glass-border);border-radius:inherit;background:var(--lsb-glass-fill);backdrop-filter:blur(var(--lsb-glass-blur)) saturate(var(--lsb-glass-saturation));-webkit-backdrop-filter:blur(var(--lsb-glass-blur)) saturate(var(--lsb-glass-saturation));box-shadow:var(--lsb-glass-highlight),var(--lsb-glass-shadow);pointer-events:none}
        [data-canvas-site-status-host][hidden]{display:none!important}
        [data-canvas-site-status-body]{display:flex;align-items:center;gap:6px;width:100%;height:100%;min-width:0;overflow:hidden;border:0;border-radius:999px;background:transparent;backdrop-filter:none;-webkit-backdrop-filter:none;box-shadow:none}
        [data-canvas-site-status-body] > .sidebar-card{display:block!important;flex:0 0 auto!important;width:100%;height:var(--lsb-canvas-chrome-height)!important;max-height:var(--lsb-canvas-chrome-height)!important;overflow:hidden!important;margin:0;padding:0 34px 0 10px;border:0;border-radius:999px;background:transparent;box-shadow:none}
        [data-canvas-site-status-body] > .sidebar-card .quick-wrap{height:100%;padding:0!important;margin:0!important;display:flex;align-items:center;min-width:0}
        [data-canvas-site-status-body] > .sidebar-card .quick-title,[data-canvas-site-status-body] > .sidebar-card .daily-hot-topics-head{display:block;min-width:0;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;font-size:12px;font-weight:650}
        [data-canvas-site-status-body] > .sidebar-card .quick-links,[data-canvas-site-status-body] > .sidebar-card .daily-hot-topics-list{display:none!important}
        [data-canvas-site-status-body] [data-canvas-site-empty-state]{display:block!important;margin:0;padding:0 10px;color:var(--text-muted,#888);font-size:11px;line-height:1.2;white-space:nowrap;overflow:hidden;text-overflow:ellipsis}
        [data-canvas-site-status-body] [data-canvas-site-empty-state][hidden]{display:none!important}
        [data-canvas-site-status-host]:not([data-expanded="true"]) [data-canvas-site-status-body]{display:none!important}
        [data-canvas-site-status-label]{position:relative;z-index:1;display:inline-flex;align-items:center;border:0;padding:0;background:transparent;color:inherit;font:inherit;font-size:12px;font-weight:550;line-height:1;white-space:nowrap;cursor:pointer}
        [data-canvas-site-status-expand]{position:relative;z-index:1;top:auto;right:auto;display:inline-flex;align-items:center;justify-content:center;width:22px;height:22px;padding:0;border:0;border-radius:999px;background:transparent;color:inherit;cursor:pointer;font:inherit;font-size:14px;line-height:1;transform:none}
        [data-canvas-site-status-expand]:hover,[data-canvas-site-status-expand]:focus-visible{background:var(--brand-soft,#e8f4f2);outline:none}
        [data-canvas-site-status-host][data-expanded="true"]{align-items:center}
        [data-canvas-site-status-host][data-expanded="true"] [data-canvas-site-status-body]{position:absolute;top:calc(100% + 8px);right:0;z-index:2;display:flex;flex-direction:column;align-items:stretch;gap:0;width:min(340px,calc(100vw - 24px));height:auto;max-height:calc(100vh - 90px);overflow:auto;padding:8px 14px;border:1px solid var(--lsb-glass-border);border-radius:34px;background:var(--lsb-glass-fill);backdrop-filter:blur(var(--lsb-glass-blur)) saturate(var(--lsb-glass-saturation));-webkit-backdrop-filter:blur(var(--lsb-glass-blur)) saturate(var(--lsb-glass-saturation));box-shadow:var(--lsb-glass-highlight),var(--lsb-glass-shadow)}
        [data-canvas-site-status-host][data-expanded="true"] [data-canvas-site-status-body] > .sidebar-card{height:auto!important;max-height:none!important;overflow:visible!important;margin:0!important;padding:10px 2px!important;border:0!important;border-radius:0!important;background:transparent!important;box-shadow:none!important}
        [data-canvas-site-status-host][data-expanded="true"] [data-canvas-site-status-body] > .sidebar-card + .sidebar-card{margin-top:0!important;border-top:1px solid color-mix(in srgb,var(--lsb-shell-text,var(--text,#222)) 12%,transparent)!important}
        [data-canvas-site-status-host][data-expanded="true"] [data-canvas-site-status-body] .quick-links,[data-canvas-site-status-host][data-expanded="true"] [data-canvas-site-status-body] .daily-hot-topics-list{display:block!important}
        [data-canvas-site-status-host][data-expanded="true"] [data-canvas-site-status-expand]{background:var(--brand-soft,#e8f4f2)}
        html.lsb-canvas-page-user #lsb-shell-surfaces [data-surface="top-status"] [data-canvas-status-title]{max-width:24vw}
        [data-canvas-action]{border:0;background:transparent;color:inherit;cursor:pointer;border-radius:999px;min-width:30px;min-height:30px;padding:0 8px}
        [data-canvas-action]:hover,[data-canvas-action]:focus-visible{background:color-mix(in srgb,var(--brand-soft,#e8f4f2) 80%,transparent);outline:none}
        [data-surface="tool-capsule"]{
          position:fixed;left:50%;bottom:calc(14px + var(--lsb-canvas-safe-bottom));transform:translateX(-50%);z-index:8001;
          display:flex;align-items:center;gap:4px;padding:6px;border:1px solid var(--lsb-glass-border);
          border-radius:999px;background:var(--lsb-glass-fill);backdrop-filter:blur(var(--lsb-glass-blur)) saturate(var(--lsb-glass-saturation));-webkit-backdrop-filter:blur(var(--lsb-glass-blur)) saturate(var(--lsb-glass-saturation));
          box-shadow:var(--lsb-glass-highlight),var(--lsb-glass-shadow)
        }
        [data-surface="tool-capsule"] button{min-width:38px;height:34px;border:0;border-radius:999px;background:transparent;color:inherit;cursor:pointer}
        [data-surface="tool-capsule"] button:hover,[data-surface="tool-capsule"] button:focus-visible{background:var(--brand-soft,#e8f4f2);outline:none}
        [data-surface="tool-sheet"], [data-surface="navigation-sheet"], [data-surface="site-card"], [data-surface="appearance-sheet"], [data-surface="ai-card"], [data-surface="plugin-features-sheet"], [data-surface="plugin-settings-sheet"]{
          position:fixed;left:50%;bottom:calc(70px + var(--lsb-canvas-safe-bottom));transform:translateX(-50%);z-index:8010;
          width:min(520px,calc(100vw - 24px));max-height:min(70vh,640px);overflow:auto;padding:18px;
          border:1px solid var(--lsb-glass-border);border-radius:var(--lsb-canvas-radius);
          background:var(--lsb-glass-fill);backdrop-filter:blur(var(--lsb-glass-blur)) saturate(var(--lsb-glass-saturation));-webkit-backdrop-filter:blur(var(--lsb-glass-blur)) saturate(var(--lsb-glass-saturation));
          box-shadow:var(--lsb-glass-highlight),var(--lsb-glass-shadow);opacity:1;transition:opacity 180ms ease,transform 180ms ease
        }
        [data-surface="tool-sheet"][hidden],[data-surface="navigation-sheet"][hidden],[data-surface="site-card"][hidden],[data-surface="appearance-sheet"][hidden],[data-surface="ai-card"][hidden],[data-surface="plugin-features-sheet"][hidden],[data-surface="plugin-settings-sheet"][hidden],[data-surface="context-pill"][hidden]{display:none!important}
        [data-surface="context-pill"]{
          position:fixed;display:flex;align-items:center;gap:3px;padding:4px;
          border:1px solid var(--lsb-glass-border);border-radius:999px;
          background:var(--lsb-glass-fill);backdrop-filter:blur(var(--lsb-glass-blur)) saturate(var(--lsb-glass-saturation));-webkit-backdrop-filter:blur(var(--lsb-glass-blur)) saturate(var(--lsb-glass-saturation));
          box-shadow:var(--lsb-glass-highlight),var(--lsb-glass-shadow);white-space:nowrap
        }
        [data-surface="context-pill"] button{min-height:30px;padding:0 10px;border:0;border-radius:999px;background:transparent;color:inherit;font:inherit;font-size:12px;cursor:pointer}
        [data-surface="context-pill"] button:hover,[data-surface="context-pill"] button:focus-visible{background:var(--brand-soft,#e8f4f2);outline:none}
        [data-surface="ai-card"][data-surface-mode="floating"]{left:auto;right:24px;bottom:88px;transform:none;width:420px;max-width:calc(100vw - 32px);height:560px;max-height:calc(100vh - 120px);resize:both;overflow:auto}
        [data-surface="site-card"][data-surface-mode="floating"],[data-surface="evidence-card"][data-surface-mode="floating"]{transform:none;right:auto;bottom:auto;max-width:calc(100vw - 32px);max-height:calc(100vh - 32px);height:auto}
        [data-surface="site-card"][data-surface-mode="rail"]{
          position:fixed;top:calc(72px + var(--lsb-canvas-safe-top));right:max(12px,calc((100vw - 1120px) / 2));bottom:calc(70px + var(--lsb-canvas-safe-bottom));left:auto;transform:none;
          width:min(320px,calc(30vw - 24px));max-width:calc(100vw - 32px);max-height:none;height:auto;overflow:auto;padding:16px;
          border-radius:20px;z-index:8005;
        }
        [data-surface="site-card"][data-surface-mode="rail"] [data-canvas-sheet-head]{cursor:default}
        [data-surface="site-card"][data-surface-mode="rail"] [data-canvas-resize-handle]{display:none!important}
        [data-surface="ai-card"]{display:flex;flex-direction:column;gap:10px}
        [data-surface="ai-card"] [data-canvas-ai-host]{min-height:0;flex:1;overflow:auto}
        [data-surface="ai-card"][data-surface-mode="sheet"]{bottom:calc(70px + var(--lsb-canvas-safe-bottom));width:min(520px,calc(100vw - 24px));max-height:min(70vh,640px)}
        [data-surface="ai-card"][data-surface-mode="fullscreen"]{left:8px;right:8px;bottom:calc(58px + var(--lsb-canvas-safe-bottom));transform:none;width:auto;max-height:calc(100vh - 82px);border-radius:22px}
        [data-surface="ai-card"][data-ai-workbench-mounted]{padding:0!important;gap:0}
        [data-surface="ai-card"][data-ai-workbench-mounted] > [data-canvas-sheet-head]{display:none!important}
        [data-surface][data-surface-mode="floating"] [data-canvas-sheet-head]{cursor:grab;user-select:none}
        [data-surface][data-surface-mode="floating"][data-canvas-dragging="true"]{will-change:transform;cursor:grabbing}
        [data-surface][data-surface-mode="floating"] [data-canvas-resize-handle]{position:absolute;right:3px;bottom:3px;width:16px;height:16px;cursor:nwse-resize;touch-action:none}
        [data-surface] [data-canvas-sheet-head]{position:relative;display:flex;align-items:center;justify-content:space-between;gap:12px;margin:-2px 0 12px;padding-top:8px}
        [data-canvas-sheet-grabber]{position:absolute;top:0;left:50%;width:34px;height:4px;transform:translateX(-50%);border-radius:999px;background:color-mix(in srgb,var(--lsb-shell-text,var(--text,#222)) 26%,transparent)}
        [data-surface][data-canvas-surface-state="opening"]{opacity:0;transform:translateX(-50%) translateY(8px) scale(.985)}
        [data-surface][data-canvas-surface-state="closing"]{opacity:0;pointer-events:none}
        [data-surface][data-surface-mode="floating"][data-canvas-surface-state="opening"]{transform:translateY(8px) scale(.985)}
        [data-surface="site-card"][data-surface-mode="rail"][data-canvas-surface-state="opening"]{transform:translateY(0) scale(1)}
        [data-surface][data-surface-mode="fullscreen"][data-canvas-surface-state="opening"]{transform:translateY(12px) scale(.99)}
        [data-surface] [data-canvas-sheet-head] h2{margin:0;font-size:16px;line-height:1.3}
        [data-surface] [data-canvas-close]{border:0;border-radius:999px;background:transparent;color:inherit;cursor:pointer;width:32px;height:32px;font-size:18px}
        [data-surface] [data-canvas-close]:hover,[data-surface] [data-canvas-close]:focus-visible{background:var(--brand-soft,#e8f4f2);outline:none}
        [data-surface="tool-sheet"] [data-tool-grid]{display:grid;grid-template-columns:repeat(2,minmax(0,1fr));gap:8px;margin-bottom:14px}
        [data-surface="tool-sheet"] [data-tool-action]{min-height:46px;padding:10px;border:1px solid var(--line-soft,#e8e8e8);border-radius:12px;background:color-mix(in srgb,var(--panel,#fff) 48%,transparent);color:inherit;text-align:left;cursor:pointer}
        [data-surface="tool-sheet"] [data-tool-action]:hover,[data-surface="tool-sheet"] [data-tool-action]:focus-visible{border-color:var(--brand,#5eaaa0);outline:none}
        [data-surface="tool-sheet"] [data-canvas-query]{display:flex;gap:8px;align-items:flex-end}
        [data-surface="tool-sheet"] textarea{flex:1;min-height:70px;resize:vertical;border:1px solid var(--line,#ddd);border-radius:12px;padding:9px;background:color-mix(in srgb,var(--panel,#fff) 64%,transparent);color:inherit;font:inherit}
        [data-surface="tool-sheet"] [data-canvas-send]{min-height:38px;border:0;border-radius:999px;padding:0 16px;background:var(--brand,#5eaaa0);color:#fff;cursor:pointer}
        [data-surface="plugin-features-sheet"] [data-plugin-feature-list],[data-surface="plugin-settings-sheet"] [data-plugin-settings-list]{display:grid;gap:7px;margin:8px 0 14px}
        [data-surface="plugin-features-sheet"] [data-plugin-feature-list] .lsb-empty,[data-surface="plugin-settings-sheet"] [data-plugin-settings-list] .lsb-empty{margin:0;padding:10px;border-radius:10px;background:color-mix(in srgb,var(--panel,#fff) 42%,transparent)}
        .lsb-plugin-entry{display:flex;align-items:center;gap:6px;min-width:0;padding:4px;border:1px solid var(--line-soft,#e8e8e8);border-radius:12px;background:color-mix(in srgb,var(--panel,#fff) 42%,transparent)}
        .lsb-plugin-entry-main,.lsb-plugin-entry-settings,.lsb-plugin-settings-entry,[data-plugin-settings-directory],[data-plugin-settings-back]{min-height:38px;border:0;border-radius:9px;background:transparent;color:inherit;font:inherit;cursor:pointer}
        .lsb-plugin-entry-main{flex:1;min-width:0;padding:7px 10px;text-align:left}
        .lsb-plugin-entry-settings{flex:0 0 38px;padding:0;font-size:17px}
        .lsb-plugin-settings-entry{display:flex;align-items:center;justify-content:space-between;gap:10px;width:100%;padding:8px 10px;border:1px solid var(--line-soft,#e8e8e8);text-align:left}
        .lsb-plugin-settings-entry small{color:var(--text-muted,#888);font-size:11px}
        [data-plugin-settings-directory]{padding:7px 12px;border:1px solid var(--line,#ddd);background:color-mix(in srgb,var(--panel,#fff) 48%,transparent)}
        [data-plugin-settings-back]{margin:-4px 0 8px;padding:4px 9px;color:var(--text-muted,#888)}
        .lsb-plugin-entry button:hover,.lsb-plugin-settings-entry:hover,[data-plugin-settings-directory]:hover,[data-plugin-settings-back]:hover{background:var(--brand-soft,#e8f4f2);color:var(--brand,#5eaaa0)}
        [data-surface="plugin-features-sheet"] h3,[data-surface="plugin-settings-sheet"] h3{margin:10px 0 6px;font-size:13px}
        [data-surface="site-card"] [data-canvas-site-sidebar]{display:flex;flex-direction:column;gap:10px;margin-top:14px;max-height:none!important;overflow:visible!important;padding-right:2px}
        [data-surface="site-card"] [data-canvas-site-sidebar]:empty::before{content:'当前页面没有可用的站点侧栏信息';display:block;padding:12px;border-radius:12px;color:var(--text-muted,#888);background:color-mix(in srgb,var(--panel,#fff) 38%,transparent);font-size:12px}
        [data-surface="site-card"] [data-canvas-site-empty-state]{display:block;margin:14px 0 0;padding:12px;border-radius:12px;color:var(--text-muted,#888);background:color-mix(in srgb,var(--panel,#fff) 38%,transparent);font-size:12px}
        [data-surface="site-card"] [data-canvas-site-empty-state][hidden]{display:none!important}
        [data-surface="site-card"] [data-canvas-site-sidebar] > .sidebar-card{display:block!important;flex:0 0 auto!important;width:100%;height:auto!important;max-height:none!important;overflow:visible!important;margin:0;padding:12px;border:1px solid color-mix(in srgb,var(--line,#ddd) 62%,transparent);border-radius:14px;background:color-mix(in srgb,var(--panel,#fff) 42%,transparent);box-shadow:none}
        [data-surface="site-card"] [data-canvas-site-sidebar] .quick-links{max-height:none!important;overflow:visible!important}
        [data-surface="site-card"]{height:auto;max-height:calc(100vh - 32px)}
        [data-surface="site-card"][data-surface-mode="sheet"],[data-surface="site-card"][data-surface-mode="fullscreen"]{height:auto;max-height:calc(100vh - 82px)}
        [data-surface="appearance-sheet"] [data-canvas-appearance-controls]{display:grid;grid-template-columns:repeat(2,minmax(0,1fr));gap:10px;margin-top:14px}
        [data-surface="appearance-sheet"] [data-canvas-background-modes]{display:flex;align-items:center;gap:7px;flex-wrap:wrap;margin-top:14px}
        [data-surface="appearance-sheet"] [data-canvas-background-modes] strong{font-size:12px;color:var(--text-muted,#888);font-weight:600;margin-right:2px}
        [data-surface="appearance-sheet"] [data-canvas-background-modes] button{min-height:32px;padding:5px 10px;border:1px solid var(--line,#ddd);border-radius:999px;background:transparent;color:inherit;cursor:pointer;font:inherit;font-size:12px}
        [data-surface="appearance-sheet"] [data-canvas-background-modes] button[aria-pressed="true"]{border-color:var(--lsb-shell-accent,var(--brand,#5eaaa0));background:var(--brand-soft,#e8f4f2);color:var(--lsb-shell-accent,var(--brand,#5eaaa0));font-weight:600}
        [data-surface="appearance-sheet"] [data-canvas-appearance-controls] label{display:flex;flex-direction:column;gap:5px;font-size:12px;color:var(--text-muted,#888)}
        [data-surface="appearance-sheet"] [data-canvas-appearance-controls] input{width:100%;min-width:0;border:1px solid var(--line,#ddd);border-radius:9px;padding:6px;background:color-mix(in srgb,var(--panel,#fff) 70%,transparent);color:inherit;font:inherit}
        [data-surface="appearance-sheet"] [data-canvas-appearance-controls] input[type="range"]{padding:0}
        [data-surface="appearance-sheet"] [data-canvas-appearance-actions]{display:flex;gap:8px;flex-wrap:wrap;margin-top:14px}
        [data-surface="appearance-sheet"] [data-canvas-appearance-actions] button{border:1px solid var(--line,#ddd);border-radius:999px;padding:7px 11px;background:transparent;color:inherit;cursor:pointer}
        [data-surface="top-status"] button:focus-visible,[data-surface="tool-capsule"] button:focus-visible,[data-surface="tool-sheet"] button:focus-visible,[data-surface="navigation-sheet"] a:focus-visible{outline:2px solid var(--brand,#5eaaa0);outline-offset:2px}
        html.lsb-skin-shell-on.lsb-canvas-mode.lsb-skin-glass-on #lsb-shell-surfaces [data-surface]{background:var(--lsb-canvas-surface-bg)}
        html.lsb-skin-shell-on.lsb-canvas-mode.lsb-skin-glass-on #lsb-shell-surfaces [data-surface="site-status"]{background:transparent;border:0;border-radius:0;box-shadow:none;overflow:visible}
        @media(max-width:699px){
          html.lsb-skin-shell-on.lsb-canvas-mode main.wrap,html.lsb-skin-shell-on.lsb-canvas-mode .forum-main,html.lsb-skin-shell-on.lsb-canvas-mode .home-shell{padding-inline:14px!important}
          [data-surface="top-status"]{max-width:calc(100vw - 16px);top:calc(6px + var(--lsb-canvas-safe-top));height:var(--lsb-canvas-chrome-height);min-height:var(--lsb-canvas-chrome-height)}
          [data-surface="top-status"] [data-canvas-status-title]{max-width:42vw}
          html.lsb-canvas-page-user #lsb-shell-surfaces [data-surface="top-status"]{width:calc(100vw - 16px);gap:4px;padding:5px 6px}
          html.lsb-canvas-page-user #lsb-shell-surfaces [data-surface="top-status"] [data-canvas-status-title]{max-width:20vw}
          #lsb-shell-surfaces [data-surface="site-status"]{display:none!important}
          html.lsb-skin-shell-on.lsb-canvas-mode.lsb-canvas-page-user [data-lsb-canvas-profile]{position:sticky!important;top:calc(6px + var(--lsb-canvas-safe-top) + var(--lsb-canvas-chrome-height))!important;z-index:25!important}
          html.lsb-skin-shell-on.lsb-canvas-mode.lsb-canvas-page-user [data-lsb-canvas-list]{padding:8px!important}
          [data-surface="tool-sheet"],[data-surface="navigation-sheet"],[data-surface="site-card"],[data-surface="appearance-sheet"],[data-surface="ai-card"],[data-surface="plugin-features-sheet"],[data-surface="plugin-settings-sheet"]{left:8px;right:8px;bottom:calc(58px + var(--lsb-canvas-safe-bottom));transform:none;width:auto;max-height:calc(100vh - 82px);border-radius:22px}
          [data-surface="tool-capsule"]{bottom:calc(8px + var(--lsb-canvas-safe-bottom));max-width:calc(100vw - 16px)}
          [data-surface="site-card"][data-surface-mode="rail"]{top:calc(6px + var(--lsb-canvas-safe-top) + var(--lsb-canvas-chrome-height));right:8px;bottom:calc(58px + var(--lsb-canvas-safe-bottom));left:8px;width:auto;max-width:none;max-height:calc(100vh - 82px);border-radius:22px}
          [data-surface="appearance-sheet"] [data-canvas-appearance-controls]{grid-template-columns:1fr!important}
          [data-surface="appearance-sheet"] [data-canvas-appearance-actions]{flex-direction:column!important;align-items:stretch!important}
          [data-surface="appearance-sheet"] [data-canvas-appearance-actions] button{min-height:40px}
        }
        @media(prefers-reduced-transparency:reduce){
          #lsb-shell-surfaces [data-surface]{background:var(--lsb-shell-panel,var(--panel,#fff));backdrop-filter:none;-webkit-backdrop-filter:none;box-shadow:0 8px 24px rgb(0 0 0 / 12%)}
          [data-canvas-site-status-host]::before,[data-canvas-site-status-host][data-expanded="true"] [data-canvas-site-status-body]{background:var(--lsb-shell-panel,var(--panel,#fff));backdrop-filter:none;-webkit-backdrop-filter:none}
          html.lsb-skin-shell-on.lsb-canvas-mode{--lsb-glass-fill:var(--lsb-shell-panel,var(--panel,#fff));--lsb-canvas-media-scrim:rgb(8 12 22 / 26%)}
        }
        @media(prefers-reduced-motion:reduce){
          #lsb-shell-surfaces [data-surface],#lsb-shell-progress,html.lsb-skin-shell-on.lsb-canvas-mode body::before{transition:none!important;scroll-behavior:auto!important}
          #lsb-shell-progress [data-lsb-shell-progress-bar]{transition:none!important}
          [data-route-transition="in"]{animation:none!important}
          [data-surface][data-canvas-surface-state="opening"],[data-surface][data-canvas-surface-state="closing"]{transform:none!important}
        }
        @media(prefers-reduced-motion:reduce){html.lsb-canvas-page-user [data-lsb-canvas-profile] > .sidebar-card.user-card{transition:none!important}}
        html.lsb-canvas-reduced-transparency #lsb-shell-surfaces [data-surface]{background:var(--lsb-shell-panel,var(--panel,#fff));backdrop-filter:none;-webkit-backdrop-filter:none;box-shadow:0 8px 24px rgb(0 0 0 / 12%)}
        html.lsb-canvas-reduced-transparency [data-canvas-site-status-host]::before,html.lsb-canvas-reduced-transparency [data-canvas-site-status-host][data-expanded="true"] [data-canvas-site-status-body]{background:var(--lsb-shell-panel,var(--panel,#fff));backdrop-filter:none;-webkit-backdrop-filter:none}
        html.lsb-canvas-reduced-motion #lsb-shell-surfaces [data-surface],html.lsb-canvas-reduced-motion #lsb-shell-progress{transition:none!important;scroll-behavior:auto!important}
        html.lsb-canvas-reduced-motion #lsb-shell-progress [data-lsb-shell-progress-bar]{transition:none!important}
        html.lsb-canvas-reduced-motion [data-route-transition="in"]{animation:none!important}
        html.lsb-canvas-reduced-motion [data-surface][data-canvas-surface-state="opening"],html.lsb-canvas-reduced-motion [data-surface][data-canvas-surface-state="closing"]{transform:none!important}
      `
    }

    // · B3 css: 全局正文排版/列表密度/代码块/楼层 ──
    function css() {
      const parts = []

      if (shellUiActive()) {
        parts.push(effectiveUiMode() === 'ios27' ? canvasCss() : shellCss())
      }

      if (cfg.typography) {
        parts.push(`
          html.lsb-skin-type-on .post-content{font-family:${FONT_SANS};line-height:1.75;word-break:break-word}
          html.lsb-skin-type-on .post-content p{margin-block:.85em}
          html.lsb-skin-type-on .post-title{line-height:1.45}
        `)
      }

      if (cfg.density === '紧凑') {
        parts.push(`
          html.lsb-skin-density-compact ul.post-list li.post-item{padding-block:3px!important}
          html.lsb-skin-density-compact li.post-item .post-avatar img{width:32px!important;height:32px!important}
        `)
      }

      if (cfg.codeblock) {
        parts.push(`
          html.lsb-skin-code-on .post-content pre{
            background:var(--bg,#f6f8fa)!important;border:1px solid var(--line,#ddd)!important;
            border-radius:8px!important;padding:12px 14px!important;overflow-x:auto!important;
            font-family:${FONT_MONO}!important;font-size:13px!important;line-height:1.55!important;
          }
          html.lsb-skin-code-on .post-content code{font-family:${FONT_MONO}}
          html.lsb-skin-code-on .post-content :not(pre)>code{
            background:var(--line-soft,#eceff2);border-radius:4px;padding:1px 5px;font-size:.92em;
          }
        `)
      }

      if (cfg.floors) {
        parts.push(`
          html.lsb-skin-floors-on li.post-entry{border-bottom:1px solid var(--line-soft,#eee)}
        `)
      }

      if (cfg.measure) {
        parts.push(`
          @media(min-width:1280px){
            html.lsb-skin-measure-on main.wrap{max-width:1120px!important;margin-inline:auto!important}
            html.lsb-skin-measure-on .post-content>p{max-width:74ch}
          }
        `)
      }

      return parts.join('\n')
    }

    /** 状态类挂 <html> 上：CSS 特异性干净，测试也容易断言 */
    // · B4 applyShellTokens: 玻璃/字号/字体令牌注入 ──
    function applyShellTokens() {
      const root = document.documentElement
      const appearance = canvasEffective?.appearance || {}
      const canvasOn = !!cfg.shell && effectiveUiMode() === 'ios27'
      const shellOn = shellUiActive()
      root.classList.toggle('lsb-canvas-reduced-motion', canvasOn && appearance.motion === 'reduced')
      root.classList.toggle('lsb-canvas-reduced-transparency', canvasOn && appearance.transparency === 'reduced')
      if (!shellStyleApi) return
      if (!shellOn) {
        for (const prop of shellTokenProps) root.style.removeProperty(prop)
        shellTokenProps.clear()
        root.classList.remove('lsb-skin-glass-on', 'lsb-canvas-reduced-motion', 'lsb-canvas-reduced-transparency')
        return
      }
      const globalTokens = {
        baseFontSize: appearance.fontSize ?? cfg.baseFontSize,
        fontFamily: appearance.fontFamily || cfg.fontFamily,
        textColor: appearance.textColor,
        panelColor: appearance.panelColor,
        accentColor: appearance.accentColor,
        glassOpacity: appearance.opacity ?? (cfg.glass ? (cfg.glassOpacity ?? 0.72) : 0.72),
        glassBlur: appearance.blur ?? (cfg.glass ? (cfg.glassBlur ?? 18) : 18),
        density: cfg.density,
      }
      const tokens = shellStyleApi.mergeShellTokens(globalTokens, {})
      const cssText = shellStyleApi.tokenCss(tokens)
      const nextProps = new Set()
      for (const declaration of cssText.split(';')) {
        const index = declaration.indexOf(':')
        if (index <= 0) continue
        const prop = declaration.slice(0, index).trim()
        const value = declaration.slice(index + 1).trim()
        if (!prop.startsWith('--lsb-shell-') || !value) continue
        root.style.setProperty(prop, value)
        nextProps.add(prop)
      }
      for (const prop of shellTokenProps) if (!nextProps.has(prop)) root.style.removeProperty(prop)
      shellTokenProps.clear()
      for (const prop of nextProps) shellTokenProps.add(prop)
      const radius = canvasFinite(appearance.radius, 16)
      root.style.setProperty('--lsb-shell-radius', `${Math.max(8, Math.min(32, radius))}px`)
      shellTokenProps.add('--lsb-shell-radius')
      root.classList.toggle('lsb-skin-glass-on', shellOn)
    }

    // ── C: 媒体与背景（mediaOriginKey/ensureMediaDb/syncBackgroundMedia） ──
    // · C1 mediaOriginKey/ensureMediaDb: IndexedDB 媒体键与库 ──
    function mediaOriginKey(kind) {
      return `${location.origin}:${kind}`
    }

    function ensureMediaDb() {
      if (!api.ui.shellMedia?.openMediaDb) return Promise.resolve(null)
      if (!mediaDbPromise) {
        mediaDbPromise = Promise.resolve(api.ui.shellMedia.openMediaDb(window.indexedDB, 'lsb_skin_media')).catch(() => null)
      }
      return mediaDbPromise
    }

    function releaseBackgroundVideo() {
      if (backgroundVideo) {
        backgroundVideo.pause?.()
        backgroundVideo.remove()
        backgroundVideo = null
      }
      if (backgroundVideoObjectUrl) {
        try { URL.revokeObjectURL(backgroundVideoObjectUrl) } catch { /* ignore */ }
        backgroundVideoObjectUrl = ''
      }
    }

    function releaseBackgroundImage() {
      backgroundImage?.remove?.()
      backgroundImage = null
      if (backgroundImageObjectUrl) {
        try { URL.revokeObjectURL(backgroundImageObjectUrl) } catch { /* ignore */ }
        backgroundImageObjectUrl = ''
      }
    }

    function releaseBackgroundMedia() {
      releaseBackgroundVideo()
      releaseBackgroundImage()
    }

    function holdSpaRouteChrome(serial) {
      if (serial !== spaSerial) return false
      spaRouteChromeSerial = serial
      document.documentElement.classList.add(SPA_ROUTE_PENDING_CLASS)
      return true
    }

    function releaseSpaRouteChrome(serial) {
      if (serial !== spaSerial || spaRouteChromeSerial !== serial) return false
      spaRouteChromeSerial = 0
      document.documentElement.classList.remove(SPA_ROUTE_PENDING_CLASS)
      return true
    }

    function clearSpaRouteChromeHold() {
      spaRouteChromeSerial = 0
      document.documentElement.classList.remove(SPA_ROUTE_PENDING_CLASS)
    }

    function setRoutePhase(serial, phase) {
      if (serial !== spaSerial) return false
      const root = document.documentElement
      if (phase) root.dataset.lsbRoutePhase = phase
      else delete root.dataset.lsbRoutePhase
      return true
    }

    function settleSpaRoute(serial) {
      if (serial !== spaSerial) return false
      delete document.documentElement.dataset.lsbRoutePhase
      releaseSpaRouteChrome(serial)
      return true
    }

    function releaseFontFace() {
      loadedFontFace?.dispose?.()
      loadedFontFace = null
      loadedFontObjectUrl = ''
    }

    async function loadLocalMedia(kind, key) {
      if (!key || !api.ui.shellMedia?.readMedia) return null
      const db = await ensureMediaDb()
      if (!db) return null
      try {
        const value = await api.ui.shellMedia.readMedia({ db, kind, key: String(key) })
        if (value && api.ui.shellMedia.validateMediaFile) {
          const check = api.ui.shellMedia.validateMediaFile(value, { kind })
          if (!check.ok) return null
        }
        return value
      } catch {
        return null
      }
    }

    // · C2 syncBackgroundMedia/syncShellFont: 背景/字体同步链 ──
    async function syncBackgroundMedia() {
      const root = document.documentElement
      const canvasMode = canvasShell instanceof Element && canvasShell.getAttribute('data-lsb-canvas-shell') === 'true'
      const workspace = canvasMode ? document.body : shellWorkspace()
      const appearance = canvasEffective?.appearance || {}
      const requestedMode = String(appearance.background || '').toLowerCase()
      const mode = requestedMode === 'video' || (requestedMode !== 'image' && cfg.backgroundVideoEnabled === true) ? 'video' : requestedMode === 'image' ? 'image' : 'static'
      const remoteVideo = String(appearance.backgroundVideoUrl || cfg.backgroundVideoUrl || '').trim()
      const localVideoKey = String(appearance.backgroundVideoLocalKey || cfg.backgroundVideoLocalKey || '').trim()
      const remoteImage = String(appearance.backgroundImageUrl || cfg.backgroundImageUrl || '').trim()
      const localImageKey = String(appearance.backgroundImageLocalKey || cfg.backgroundImageLocalKey || '').trim()
      const validVideo = !!api.ui.shellMedia?.isHttpsUrl?.(remoteVideo)
      const validImage = !!api.ui.shellMedia?.isHttpsUrl?.(remoteImage)
      const sourceKey = mode === 'video'
        ? `${validVideo ? remoteVideo : ''}|${localVideoKey}`
        : mode === 'image'
          ? `${validImage ? remoteImage : ''}|${localImageKey}`
          : ''
      const specKey = `${mode}|${appearance.motion || 'auto'}|${sourceKey}`
      if (specKey === backgroundSpecKey && (mode === 'video' ? backgroundVideo : mode === 'image' ? backgroundImage : !backgroundVideo && !backgroundImage)) return
      backgroundSpecKey = specKey
      mediaGeneration += 1
      const generation = mediaGeneration
      releaseBackgroundMedia()
      root.classList.remove('lsb-skin-video-on')
      root.classList.remove('lsb-skin-image-on')
      if (!cfg.shell || mode === 'static' || !(workspace instanceof Element)) return

      let source = ''
      const kind = mode === 'video' ? 'video' : 'image'
      const localKey = mode === 'video' ? localVideoKey : localImageKey
      const remote = mode === 'video' ? remoteVideo : remoteImage
      const validRemote = mode === 'video' ? validVideo : validImage
      if (localKey) {
        const file = await loadLocalMedia(kind, localKey)
        if (generation !== mediaGeneration) return
        if (file) {
          try {
            const objectUrl = URL.createObjectURL(file)
            if (mode === 'video') backgroundVideoObjectUrl = objectUrl
            else backgroundImageObjectUrl = objectUrl
            source = objectUrl
          } catch { source = '' }
        }
      }
      if (!source && validRemote) source = remote
      if (generation !== mediaGeneration || !source) return

      if (mode === 'image') {
        const image = document.createElement('img')
        image.setAttribute('data-lsb-shell-image', '')
        image.setAttribute('data-lsb-shell-image-layer', canvasMode ? 'canvas' : 'windowed')
        image.setAttribute('aria-hidden', 'true')
        image.alt = ''
        image.decoding = 'async'
        image.loading = 'eager'
        image.addEventListener('error', () => {
          if (generation !== mediaGeneration || backgroundImage !== image) return
          root.classList.remove('lsb-skin-image-on')
          image.dataset.lsbShellImageState = 'error'
          api.ui.toast?.('静态背景加载失败，已使用原始背景', { type: 'error' })
        })
        workspace.prepend(image)
        backgroundImage = image
        image.src = source
        if (generation === mediaGeneration && backgroundImage === image) {
          root.classList.add('lsb-skin-image-on')
          image.dataset.lsbShellImageState = 'loaded'
        }
        return
      }

      const video = document.createElement('video')
      video.setAttribute('data-lsb-shell-video', '')
      video.setAttribute('data-lsb-shell-video-layer', canvasMode ? 'canvas' : 'windowed')
      video.setAttribute('aria-hidden', 'true')
      video.setAttribute('muted', '')
      video.setAttribute('autoplay', '')
      video.setAttribute('loop', '')
      video.setAttribute('playsinline', '')
      video.defaultMuted = true
      video.muted = true
      video.loop = true
      video.autoplay = true
      video.playsInline = true
      video.preload = 'auto'
      const markVideoError = () => {
        if (generation !== mediaGeneration || backgroundVideo !== video) return
        if (video.dataset.lsbShellVideoState === 'error') return
        root.classList.remove('lsb-skin-video-on')
        video.controls = false
        video.style.pointerEvents = 'none'
        video.dataset.lsbShellVideoState = 'error'
        api.ui.toast?.('视频背景加载失败，已使用静态背景', { type: 'error' })
      }
      video.addEventListener('error', markVideoError)
      workspace.prepend(video)
      backgroundVideo = video
      video.src = source
      try { video.load?.() } catch { /* an older media element may not expose load */ }
      const exposeManualPlayback = (message) => {
        if (generation !== mediaGeneration || backgroundVideo !== video) return
        if (video.dataset.lsbShellVideoState === 'error' || video.error) return
        root.classList.add('lsb-skin-video-on')
        video.controls = false
        video.style.pointerEvents = 'none'
        video.dataset.lsbShellVideoState = 'manual'
        if (message) api.ui.toast?.(message, { type: 'info' })
      }
      if (appearance.motion === 'reduced' || window.matchMedia?.('(prefers-reduced-motion: reduce)')?.matches) {
        exposeManualPlayback('视频已暂停以减少动态')
        return
      }
      try {
        await video.play()
        if (generation === mediaGeneration && backgroundVideo === video) {
          if (video.dataset.lsbShellVideoState === 'error' || video.error) return
          root.classList.add('lsb-skin-video-on')
          video.controls = false
          video.style.pointerEvents = 'none'
          video.dataset.lsbShellVideoState = 'playing'
        }
      } catch {
        exposeManualPlayback('浏览器阻止自动播放，视频背景保持静止')
      }
    }

    async function syncBackgroundVideo() {
      return syncBackgroundMedia()
    }

    async function syncShellFont() {
      const root = document.documentElement
      const appearance = canvasEffective?.appearance || {}
      const remote = String(appearance.fontUrl || cfg.fontUrl || '').trim()
      const localKey = String(appearance.fontLocalKey || cfg.fontLocalKey || '').trim()
      const validRemote = !!api.ui.shellMedia?.isHttpsUrl?.(remote)
      const specKey = `${validRemote ? remote : ''}|${localKey}`
      if (specKey === fontSpecKey && (loadedFontFace || !remote && !localKey)) return
      fontSpecKey = specKey
      releaseFontFace()
      const configuredFamily = shellStyleApi?.sanitizeTokenValue?.('fontFamily', appearance.fontFamily || cfg.fontFamily)
      if (configuredFamily) root.style.setProperty('--lsb-shell-font-family', configuredFamily)
      else root.style.removeProperty('--lsb-shell-font-family')
      if (!validRemote && !localKey) return
      const generation = mediaGeneration
      let source = validRemote ? `url(${remote})` : null
      if (!source && localKey) source = await loadLocalMedia('font', localKey)
      if (generation !== mediaGeneration || !source || !api.ui.shellMedia?.loadFontFace) return
      try {
        loadedFontFace = await api.ui.shellMedia.loadFontFace({
          family: 'LSBShellUserFont',
          source,
          document,
          URLCtor: URL,
        })
        if (generation === mediaGeneration) root.style.setProperty('--lsb-shell-font-family', 'LSBShellUserFont')
      } catch {
        loadedFontFace = null
        if (!configuredFamily) root.style.removeProperty('--lsb-shell-font-family')
        api.ui.toast?.('字体加载失败，已回退站点字体', { type: 'error' })
      }
    }

    function syncShellMedia() {
      void syncBackgroundMedia()
      void syncShellFont()
    }

    // ── D: 原生结构接管（applyMarkers/restyle/nativeHeaders） ──
    // · D1 applyMarkers: 逐容器打点与兴趣节点标记 ──
    function applyMarkers() {
      const root = document.documentElement
      const shellOn = shellUiActive()
      const canvasOn = !!cfg.shell && effectiveUiMode() === 'ios27'
      const shellHome = shellOn && (pagePath() === '/' || pagePath() === '/index.php')
      root.classList.toggle('lsb-skin-type-on', !!cfg.typography)
      root.classList.toggle('lsb-skin-density-compact', cfg.density === '紧凑')
      root.classList.toggle('lsb-skin-code-on', !!cfg.codeblock)
      root.classList.toggle('lsb-skin-floors-on', !!cfg.floors)
      root.classList.toggle('lsb-skin-measure-on', !!cfg.measure)
      root.classList.toggle('lsb-skin-shell-on', shellOn)
      root.classList.toggle('lsb-skin-shell-home', shellHome)
      root.classList.toggle('lsb-canvas-mode', canvasOn)
      root.classList.toggle('lsb-skin-shell-topic', shellOn && api.page?.type === 'topic')
      root.classList.toggle('lsb-skin-shell-user', shellOn && api.page?.type === 'user')
      /* 旧模式始终为固定三栏；窗口化布局已不再是可选模式。 */
      root.classList.remove('lsb-skin-shell-windowed')
      root.removeAttribute('data-lsb-shell-mode')
    }

    // · D2 restyle: 按兴趣重写布局骨架（topic/suite 归一） ──
    function restyle() {
      applyMarkers()
      applyShellTokens()
      const id = 'lsb-skin-style'
      let el = document.getElementById(id)
      if (!el) {
        el = document.createElement('style')
        el.id = id
        document.head.appendChild(el)
      }
      el.textContent = css()
    }

    // · D3 nativeHeaders/Sidebars: 原生头部/侧栏收敛 ──
    function nativeHeaders() {
      const headers = new Set(document.querySelectorAll('body > .top, body > header, body > .site-header, body > [data-site-header]'))
      for (const menu of document.querySelectorAll('[data-slot~="top.menu_links"]')) {
        if (menu.closest('#mobile-menu, #mobile-menu-drawer, .mobile-menu-drawer')) continue
        let header = menu
        while (header.parentElement && header.parentElement !== document.body) header = header.parentElement
        if (header.parentElement === document.body) headers.add(header)
      }
      return [...headers]
    }

    function nativeSidebars() {
      return [...new Set(document.querySelectorAll('aside.sidebar, [data-slot~="sidebar.stack"]'))].filter(
        (el) => el.id !== 'mobile-menu-drawer' && !el.classList.contains('mobile-menu-drawer'),
      )
    }

    function nativeLeftRails(scope = document) {
      return [...(scope?.querySelectorAll?.('.forum-enhancements-left-fixed') || [])]
    }

    function markNative(on) {
      for (const el of nativeHeaders()) el.classList.toggle('lsb-native-header-hidden', on)
      for (const el of nativeSidebars()) el.classList.toggle('lsb-native-sidebar-hidden', on)
      for (const el of nativeLeftRails()) el.classList.toggle('lsb-native-left-hidden', on)
      for (const el of document.querySelectorAll('.sidebar-card.user-card')) el.toggleAttribute('data-lsb-shell-me', on)
    }

    // ── E: 侧栏与氢壳视图（asideWide/asideSetActive/syncAsideViews） ──
    // · E1 asideWide: 侧栏宽度与可见性判定 ──
    function asideWide() {
      try {
        if (typeof window.matchMedia === 'function') return !!window.matchMedia('(min-width: 1100px)').matches
      } catch {
        /* jsdom and older embedded browsers may not implement matchMedia */
      }
      const width = Number(window.innerWidth || document.documentElement?.clientWidth || 0)
      return width >= 1100
    }

    function onUiModeResize() {
      const wide = asideWide()
      if (wide === uiModeWideSnapshot) return
      uiModeWideSnapshot = wide
      scheduleRefresh(false)
    }

    function bindUiModeResize() {
      if (uiModeResizeBound) return
      uiModeResizeBound = true
      uiModeWideSnapshot = asideWide()
      window.addEventListener('resize', onUiModeResize)
    }

    function unbindUiModeResize() {
      if (!uiModeResizeBound) return
      window.removeEventListener('resize', onUiModeResize)
      uiModeResizeBound = false
      uiModeWideSnapshot = null
    }

    function bindCloudflareChallengeWatch() {
      if (cloudflareChallengeObserver || typeof MutationObserver !== 'function') return
      const root = document.documentElement
      if (!root) return
      cloudflareChallengeObserver = new MutationObserver(() => scheduleRefresh(false))
      cloudflareChallengeObserver.observe(root, {
        attributes: true,
        attributeFilter: [CLOUDFLARE_CHALLENGE_ATTR],
      })
    }

    function unbindCloudflareChallengeWatch() {
      cloudflareChallengeObserver?.disconnect?.()
      cloudflareChallengeObserver = null
    }

    function shellUiActive() {
      return !!cfg.shell && (effectiveUiMode() === 'ios27' || asideWide())
    }

    function asideContext() {
      return {
        page: api.page,
        route: api.page,
        snapshot: api.snapshot,
        wide: asideWide(),
      }
    }

    // · E2 asideSetActive/removeAsideView: 侧栏视图激活与销毁 ──
    function asideSetActive(id, aside = document.querySelector('#lsb-shell-aside'), persist = false) {
      if (!(aside instanceof Element)) return 'site'
      const registered = api.ui.shellAsideViews(asideContext()).find((view) => view.id === id)
      const exists = id === 'site' || asideViews.has(id) || !!registered
      asideActiveId = exists ? id : 'site'
      if (persist && exists) {
        asidePreferredId = asideActiveId
        try {
          api.store.set(ASIDE_ACTIVE_KEY, asidePreferredId)
        } catch {
          /* A storage failure must not block the current tab selection. */
        }
      }
      for (const tab of aside.querySelectorAll('[data-lsb-shell-aside-tab]')) {
        const active = tab.getAttribute('data-lsb-shell-aside-tab') === asideActiveId
        tab.setAttribute('aria-selected', active ? 'true' : 'false')
        tab.tabIndex = active ? 0 : -1
      }
      for (const pane of aside.querySelectorAll('[data-lsb-shell-aside-pane]')) {
        pane.hidden = pane.getAttribute('data-lsb-shell-aside-pane') !== asideActiveId
      }
      const selectedView = asideViews.get(asideActiveId)?.view
        || api.ui.shellAsideViews(asideContext()).find((view) => view.id === asideActiveId)
      const windowId = selectedView?.windowId || 'site'
      if (windowId !== 'site' && shellWindowLayout?.windows?.[windowId]) focusShellWindow(windowId)
      for (const current of externalWindowViews.values()) {
        if (current.view?.windowId) current.host.dataset.lsbShellOpen = current.view.id === asideActiveId ? 'true' : 'false'
      }
      return asideActiveId
    }

    function removeAsideView(id) {
      const rec = asideViews.get(id)
      if (!rec) return
      try {
        rec.dispose?.()
      } catch (e) {
        console.error('[LSB skin] 右栏视图清理失败', id, e)
      }
      rec.tab?.remove()
      rec.pane?.remove()
      asideViews.delete(id)
      if (asideActiveId === id) asideActiveId = 'site'
    }

    function destroyAsideViews() {
      for (const id of [...asideViews.keys()]) removeAsideView(id)
      asideActiveId = 'site'
    }

    // · E3 syncAsideViews/bindAsideResize: 侧栏视图同步与自适应 ──
    function syncAsideViews(el = document.getElementById('lsb-shell')) {
      const aside = el?.querySelector?.('#lsb-shell-aside') || document.querySelector('#lsb-shell-aside')
      if (!(aside instanceof Element)) return
      const tabs = aside.querySelector('#lsb-shell-aside-tabs')
      const panes = aside.querySelector('.lsb-shell-aside-panes')
      const site = panes?.querySelector('[data-lsb-shell-aside-pane="site"]')
      if (!(tabs instanceof Element) || !(panes instanceof Element) || !(site instanceof Element)) return

      const wide = asideWide()
      const context = asideContext()
      const visible = wide ? api.ui.shellAsideViews(context) : []
      const next = new Map(visible.map((view) => [view.id, view]))

      for (const id of [...asideViews.keys()]) {
        const view = next.get(id)
        const current = asideViews.get(id)
        if (!view || current.view !== view) removeAsideView(id)
      }

      let siteTab = tabs.querySelector('[data-lsb-shell-aside-tab="site"]')
      if (!siteTab) {
        siteTab = document.createElement('button')
        siteTab.type = 'button'
        siteTab.setAttribute('role', 'tab')
        siteTab.setAttribute('data-lsb-shell-aside-tab', 'site')
        siteTab.textContent = '站点'
        siteTab.addEventListener('click', () => asideSetActive('site', aside, true))
        tabs.append(siteTab)
      }

      for (const view of visible) {
        let rec = asideViews.get(view.id)
        if (!rec) {
          const tab = document.createElement('button')
          tab.type = 'button'
          tab.setAttribute('role', 'tab')
          tab.setAttribute('data-lsb-shell-aside-tab', view.id)
          tab.textContent = view.label
          const pane = document.createElement('section')
          pane.setAttribute('role', 'tabpanel')
          pane.setAttribute('data-lsb-shell-aside-pane', view.id)
          pane.setAttribute('aria-label', view.label)
          pane.tabIndex = 0
          tab.addEventListener('click', () => asideSetActive(view.id, aside, true))
          panes.append(pane)
          let dispose = null
          if (view.windowId && view.windowId !== 'site') {
            pane.textContent = `${view.label}已在独立窗口打开`
            pane.setAttribute('data-lsb-shell-window-proxy', view.windowId)
          } else {
            try {
              dispose = view.render(pane, context)
            } catch (e) {
              pane.textContent = 'AI 视图加载失败'
              console.error('[LSB skin] 右栏视图渲染失败', view.id, e)
            }
          }
          rec = { view, tab, pane, dispose: typeof dispose === 'function' ? dispose : null }
          asideViews.set(view.id, rec)
        }
        tabs.append(rec.tab)
        panes.append(rec.pane)
      }
      tabs.append(siteTab)
      // 站点页固定在首位；append 顺序用于浏览器键盘和读屏顺序。
      tabs.insertBefore(siteTab, tabs.firstChild)
      panes.insertBefore(site, panes.firstChild)
      tabs.hidden = !wide || visible.length === 0
      asideSetActive(wide ? asidePreferredId : 'site', aside)
    }

    function bindAsideResize() {
      if (asideResizeBound) return
      asideResizeBound = true
      window.addEventListener('resize', onAsideResize)
    }

    function unbindAsideResize() {
      if (!asideResizeBound) return
      window.removeEventListener('resize', onAsideResize)
      asideResizeBound = false
    }

    function onAsideResize() {
      if (cfg.shell) syncAsideViews()
    }

    // ── F: 插件特性与工具菜单（collectBoards/collectTools） ──
    // · F1 collectBoards: 版块清单与插件特性聚合 ──
    function collectBoards() {
      const forums = api.forums || []
      const cached = api.store.get('boardCounts') || {}
      const live = {}
      for (const f of forums) {
        if (Number.isFinite(f.topics)) live[f.id] = f.topics
      }
      const counts = { ...cached, ...live }
      if (Object.keys(live).length) api.store.set('boardCounts', counts)
      if (forums.length) {
        return forums.map((f) => ({
          href: `/forum/${f.id}`,
          label: f.name,
          count: counts[f.id],
        }))
      }
      const seen = new Set()
      const out = []
      for (const a of document.querySelectorAll('.forum-nav a[href^="/forum/"]')) {
        const href = a.getAttribute('href')
        const label = (a.textContent || '').trim()
        if (!href || seen.has(href)) continue
        seen.add(href)
        const id = Number((href.match(/\/forum\/(\d+)/) || [])[1])
        out.push({ href, label, count: counts[id] })
      }
      return out
    }

    const PLUGIN_FEATURES = [
      { plugin: 'ai-summary', panel: 'ai-summary-history', label: 'AI 历史' },
      { plugin: 'checkin-calendar', panel: 'checkin-calendar', label: '签到日历' },
      { plugin: 'points-title-workbench', rpc: 'points-title-workbench:open', label: '积分-称号' },
      { plugin: 'annual-report', panel: 'annual-report', label: '年度报告' },
    ]

    function collectPluginFeatureEntries() {
      const w = typeof unsafeWindow !== 'undefined' ? unsafeWindow : window
      const info = w.LSB?.info?.() || {}
      const states = new Map((info.plugins || []).map((plugin) => [plugin.id, plugin.state]))
      const panelIds = new Set(api.ui.panels().map((panel) => panel.id))
      const handlers = new Set((info.handlers || []).map((handler) => handler.name))
      const settings = new Set(api.ui.settingsPlugins().map((plugin) => plugin.id))
      return PLUGIN_FEATURES
        .filter((item) => states.get(item.plugin) === 'active')
        .filter((item) => item.panel ? panelIds.has(item.panel) : handlers.has(item.rpc))
        .map((item) => ({ ...item, hasSettings: settings.has(item.plugin) }))
    }

    function collectPluginSettingsEntries() {
      return api.ui.settingsPlugins()
    }

    function renderPluginFeatureEntries() {
      const host = canvasSurface('plugin-features-sheet')?.querySelector('[data-plugin-feature-list]')
      if (!(host instanceof Element)) return
      host.replaceChildren()
      const entries = collectPluginFeatureEntries()
      if (!entries.length) {
        const empty = document.createElement('p')
        empty.className = 'lsb-empty'
        empty.textContent = '目前没有可用的插件功能。'
        host.append(empty)
        return
      }
      for (const entry of entries) {
        const row = document.createElement('div')
        row.className = 'lsb-plugin-entry'
        row.setAttribute('data-plugin-feature-entry', entry.plugin)
        const action = document.createElement('button')
        action.type = 'button'
        action.className = 'lsb-plugin-entry-main'
        action.setAttribute('data-plugin-feature-action', entry.plugin)
        action.textContent = entry.label
        row.append(action)
        if (entry.hasSettings) {
          const settings = document.createElement('button')
          settings.type = 'button'
          settings.className = 'lsb-plugin-entry-settings'
          settings.setAttribute('data-plugin-settings-open', entry.plugin)
          settings.setAttribute('aria-label', `打开${entry.label}设置`)
          settings.title = `${entry.label}设置`
          settings.textContent = '⚙'
          row.append(settings)
        }
        host.append(row)
      }
    }

    function pluginStateLabel(state) {
      if (state === 'disabled') return '已停用'
      if (state === 'skipped') return '当前页面未启用'
      if (state === 'error') return '异常'
      if (state === 'registered') return '等待启用'
      return ''
    }

    function renderPluginSettingsEntries() {
      const host = canvasSurface('plugin-settings-sheet')?.querySelector('[data-plugin-settings-list]')
      if (!(host instanceof Element)) return
      host.replaceChildren()
      const entries = collectPluginSettingsEntries()
      if (!entries.length) {
        const empty = document.createElement('p')
        empty.className = 'lsb-empty'
        empty.textContent = '没有声明配置项的插件。'
        host.append(empty)
        return
      }
      for (const entry of entries) {
        const button = document.createElement('button')
        button.type = 'button'
        button.className = 'lsb-plugin-settings-entry'
        button.setAttribute('data-plugin-settings-entry', entry.id)
        const name = document.createElement('span')
        name.textContent = entry.name || entry.id
        button.append(name)
        const state = pluginStateLabel(entry.state)
        if (state) {
          const status = document.createElement('small')
          status.textContent = state
          button.append(status)
        }
        host.append(button)
      }
    }

    // · F2 collectTools/invalidateTools: 工具菜单（入口与失效） ──
    function collectTools() {
      if (toolsCache) return toolsCache
      const w = typeof unsafeWindow !== 'undefined' ? unsafeWindow : window
      const active = new Set(
        (w.LSB?.info?.().plugins || []).filter((p) => p.state === 'active').map((p) => p.id),
      )
      toolsCache = PLUGIN_FEATURES
        .filter((tool) => active.has(tool.plugin))
        .map(({ panel, rpc, label }) => (rpc ? { rpc, label } : { panel, label }))
      return toolsCache
    }

    function invalidateTools() {
      toolsCache = null
    }

    // ── G: 导航与搜索（pagePath/shellSearchHost/adoptSearch） ──
    // · G1 pagePath/locationText/isActiveHref: 当前路径与站点文案 ──
    function pagePath() {
      try {
        return location.pathname.replace(/\/+$/, '') || '/'
      } catch {
        return ''
      }
    }

    function locationText() {
      const p = api.page || {}
      const path = pagePath()
      const type = p.type
      if (type === 'collections' || path === '/topic_collections') {
        let tab = type === 'collections' ? p.tab : null
        if (tab == null) {
          try {
            tab = new URL(location.href).searchParams.get('tab')
          } catch {
            tab = null
          }
        }
        return tab === 'mine' || !tab ? '我的淘帖' : '淘帖中心'
      }
      if (type === 'collection' || /^\/topic_collection\/\d+$/.test(path)) {
        const title = (document.querySelector('h1.post-content-title, h1')?.textContent || '').trim()
        return title || '淘帖'
      }
      if (type === 'identity' || path === '/identity_center') return '认证中心'
      if (type === 'promotions' || path === '/promotions') return '我的广告'
      if (type === 'messages' || path === '/direct_messages') return '我的私信'
      if (type === 'user_block' || path === '/user_block') return '屏蔽名单'
      if (type === 'essence_review' || path === '/topic_essence_review_list') return '申精'
      if (type === 'home' || path === '/' || path === '/index.php') {
        if (path === '/' || path === '/index.php') {
          if (p.sort === 'lucky') return '抽奖'
          if (p.sort === 'card') return '发卡'
          if (p.sort === 'red_packet') return '红包'
          if (p.sort === 'comment') return '新评论'
          return '新帖子'
        }
      }
      if (type === 'forum') {
        const f = (api.forums || []).find((x) => x.id === p.id)
        return f?.name || '版块'
      }
      if (type === 'topic') {
        try {
          const title = api.parse.topic(document)?.title
          if (title) return title
        } catch {
          /* 解析失败则读标题节点 */
        }
        return (document.querySelector('h1.post-content-title')?.textContent || '').trim() || '帖子'
      }
      if (type === 'user') return '用户'
      if (type === 'featured') return '精华'
      if (type === 'hot_discussions' || path === '/hot_discussions') return '热议'
      if (type === 'footprint') return '足迹'
      if (type === 'gacha') return '称号抽取'
      if (type === 'gacha_market') return '称号交易'
      if (type === 'gacha_profile') return '我的称号'
      if (type === 'wallet') return '我的烧饼'
      if (type === 'invite') return '邀请中心'
      return 'LINUX SB'
    }

    function isActiveHref(href) {
      const p = api.page || {}
      if (href === '/' || href === '') return p.type === 'home'
      if (p.type === 'forum') return href === `/forum/${p.id}`
      return false
    }

    function restoreNode(el, home, cls) {
      if (!el) return
      el.classList.remove(cls)
      if (!home?.parent?.isConnected) {
        el.remove()
        return
      }
      if (home.next?.parentNode === home.parent) {
        home.parent.insertBefore(el, home.next)
      } else {
        home.parent.append(el)
      }
    }

    // · G2 shellSearchHost/adoptSearch/restoreSearch: 搜索框接管 ──
    function shellSearchHost() {
      return document.querySelector('#lsb-shell [data-canvas-search-host]') || document.querySelector('.lsb-shell-search-host')
    }

    function adoptSearch(host) {
      if (!(host instanceof Element)) return
      const canvasHost = host.matches('[data-canvas-search-host]')
      const panel = canvasHost ? host.querySelector('[data-canvas-search-panel]') : host
      if (!(panel instanceof Element)) return
      const hostedForm = panel.querySelector(SEARCH_FORM_SELECTOR)
      if (hostedForm) {
        hostedForm.classList.add('lsb-shell-search')
        if (canvasHost) host.hidden = false
        return
      }
      const nativeForm = document.querySelector(TOP_SEARCH_FORM_SELECTOR) || document.querySelector(SEARCH_FORM_SELECTOR)
      if (nativeForm && !panel.contains(nativeForm)) {
        const fallback = panel.querySelector('a.search-page-link')
        if (fallback) {
          fallback.classList.remove('lsb-shell-search')
          fallback.remove()
        }
        searchHome = { parent: nativeForm.parentNode, next: nativeForm.nextSibling }
        nativeForm.classList.add('lsb-shell-search')
        panel.append(nativeForm)
        if (canvasHost) host.hidden = false
        return
      }
      const adoptedLink = panel.querySelector('a.search-page-link')
      if (adoptedLink) {
        if (canvasHost) host.hidden = false
        return
      }
      const el =
        document.querySelector('body > .top .search-page-link') ||
        document.querySelector('a.search-page-link')
      if (!(el instanceof Element) || host.contains(el)) {
        if (canvasHost) host.hidden = true
        return
      }
      searchHome = { parent: el.parentNode, next: el.nextSibling }
      el.classList.add('lsb-shell-search')
      panel.append(el)
      if (canvasHost) host.hidden = false
    }

    function restoreSearch() {
      const el = document.querySelector('.lsb-shell-search')
      restoreNode(el, searchHome, 'lsb-shell-search')
      searchHome = null
    }

    function findNativeUserCard() {
      const hosted = document.querySelector('#lsb-shell [data-lsb-shell-me] .sidebar-card.user-card')
      if (hosted) return hosted
      for (const side of nativeSidebars()) {
        const card = side.querySelector('.sidebar-card.user-card')
        if (card) return card
      }
      return document.querySelector('aside.sidebar .sidebar-card.user-card')
    }

    function isSelfUserCard(card) {
      if (!(card instanceof Element)) return false
      const uid = api.me?.uid
      if (uid == null) return true
      const href = card.querySelector('a.user-name')?.getAttribute('href') || ''
      return href.includes(`/user/${uid}`)
    }

    function findIncomingSelfCard(host) {
      for (const card of document.querySelectorAll('.sidebar-card.user-card')) {
        if (host?.contains(card)) continue
        if (!isSelfUserCard(card)) continue
        return card
      }
      return null
    }

    function userCardKey(card) {
      if (!(card instanceof Element)) return ''
      return [...card.querySelectorAll('a[href]')]
        .map((a) => a.getAttribute('href') || '')
        .join('\n')
    }

    function adoptUserCard(host) {
      if (!(host instanceof Element)) return
      const userPageProfile = api.page?.type === 'user' && host.hasAttribute('data-lsb-canvas-profile')
      const incoming = userPageProfile ? null : findIncomingSelfCard(host)
      const hosted = host.querySelector('.sidebar-card.user-card')
      if (incoming && incoming !== hosted) {
        if (hosted && userCardKey(hosted) === userCardKey(incoming)) return
        if (hosted) restoreUserCard()
        userCardHome = { parent: incoming.parentNode, next: incoming.nextSibling }
        incoming.classList.add('lsb-shell-user-card')
        host.append(incoming)
        return
      }
      if (hosted) return
      let card = findNativeUserCard()
      if (userPageProfile) {
        card = nativeSidebars()
          .flatMap((side) => [...side.querySelectorAll('.sidebar-card.user-card')])
          .find((candidate) => !host.contains(candidate) && !isSelfUserCard(candidate)) || card
      }
      if (!(card instanceof Element) || host.contains(card) || (!userPageProfile && !isSelfUserCard(card))) return
      userCardHome = { parent: card.parentNode, next: card.nextSibling }
      card.classList.add('lsb-shell-user-card')
      host.append(card)
    }

    function restoreUserCard() {
      const card = document.querySelector('.lsb-shell-user-card')
      restoreNode(card, userCardHome, 'lsb-shell-user-card')
      userCardHome = null
    }

    function canvasProfileSetExpanded(host, expanded, locked = canvasSelfProfileLocked) {
      if (!(host instanceof Element)) return
      const next = !!expanded
      host.dataset.expanded = String(next)
      host.dataset.locked = String(!!locked)
      const button = host.querySelector('[data-canvas-profile-expand]')
      if (button instanceof HTMLElement) {
        button.setAttribute('aria-expanded', String(next))
        button.textContent = next ? '⌃' : '⌄'
        button.setAttribute('title', next ? (locked ? '收起个人资料卡' : '个人资料卡已展开') : '展开个人资料卡')
      }
    }

    function canvasBindSelfProfile(host) {
      if (!(host instanceof Element) || host.dataset.canvasProfileBound === '1') return
      host.dataset.canvasProfileBound = '1'
      host.addEventListener('mouseenter', () => {
        if (canvasViewport().width < 1100 || canvasSelfProfileLocked) return
        canvasProfileSetExpanded(host, true, false)
      })
      host.addEventListener('mouseleave', () => {
        if (canvasSelfProfileLocked) return
        canvasProfileSetExpanded(host, false, false)
      })
      host.addEventListener('focusout', (event) => {
        if (canvasSelfProfileLocked || host.contains(event.relatedTarget)) return
        canvasProfileSetExpanded(host, false, false)
      })
      const button = host.querySelector('[data-canvas-profile-expand]')
      button?.addEventListener('click', (event) => {
        event.preventDefault()
        event.stopPropagation()
        const next = !canvasSelfProfileLocked
        canvasSelfProfileLocked = next
        canvasProfileSetExpanded(host, next, canvasSelfProfileLocked)
      })
    }

    function canvasPrepareSelfProfileCard(card) {
      if (!(card instanceof Element)) return
      card.classList.add('lsb-canvas-self-user-card')
      card.id = 'lsb-canvas-self-profile-card'
      const host = card.closest('[data-canvas-profile-host]')
      host?.querySelector('[data-canvas-profile-expand]')?.setAttribute('aria-controls', card.id)
      const bell = [...card.querySelectorAll('a[href]')].find((a) => {
        const href = a.getAttribute('href') || ''
        return /[?&]tab=notifications(?:&|$)/.test(href)
      })
      if (bell) {
        bell.setAttribute('data-canvas-profile-bell', '')
        bell.setAttribute('aria-label', '我的通知')
        bell.setAttribute('title', '我的通知')
      }
    }

    function canvasMountSelfProfile() {
      const host = canvasSurfaceHost?.querySelector?.('[data-canvas-profile-host]')
      if (!(host instanceof Element)) return null
      canvasSelfProfileHost = host
      canvasBindSelfProfile(host)
      let card = host.querySelector('.sidebar-card.user-card')
      if (card instanceof Element) {
        canvasPrepareSelfProfileCard(card)
        host.hidden = false
        canvasSelfProfileLocked = false
        canvasProfileSetExpanded(host, false, false)
        return host
      }
      if (!(card instanceof Element)) {
        card = document.querySelector('.lsb-canvas-self-user-card')
      }
      if (!(card instanceof Element)) {
        card = findIncomingSelfCard(host) || findNativeUserCard()
      }
      if (!(card instanceof Element) || host.contains(card) || !isSelfUserCard(card)) {
        host.hidden = true
        canvasSelfProfileLocked = false
        canvasProfileSetExpanded(host, false, false)
        return host
      }
      if (!canvasSelfProfileHome) canvasSelfProfileHome = { parent: card.parentNode, next: card.nextSibling }
      canvasPrepareSelfProfileCard(card)
      host.append(card)
      host.hidden = false
      canvasSelfProfileLocked = false
      canvasProfileSetExpanded(host, false, false)
      return host
    }

    function canvasRestoreSelfProfile() {
      const card = document.querySelector('.lsb-canvas-self-user-card')
      restoreNode(card, canvasSelfProfileHome, 'lsb-canvas-self-user-card')
      canvasSelfProfileHome = null
      canvasSelfProfileLocked = false
      if (canvasSelfProfileHost) {
        canvasSelfProfileHost.hidden = true
        canvasSelfProfileHost.removeAttribute('data-expanded')
        canvasSelfProfileHost.removeAttribute('data-locked')
      }
      canvasSelfProfileHost = null
    }

    function canvasProfileSlotFor(outlet) {
      if (!(outlet instanceof Element)) return null
      let slot = [...outlet.children].find((node) => node.getAttribute?.('data-canvas-profile-slot') === 'true')
      if (!(slot instanceof Element)) {
        slot = document.createElement('div')
        slot.setAttribute('data-canvas-profile-slot', 'true')
        slot.setAttribute('aria-label', '个人信息')
        outlet.insertBefore(slot, outlet.firstChild)
      } else if (slot !== outlet.firstElementChild) {
        outlet.insertBefore(slot, outlet.firstChild)
      }
      return slot
    }

    function canvasRestoreProfile() {
      canvasRestoreSelfProfile()
      restoreUserCard()
      if (canvasListSurface) canvasListSurface.removeAttribute('data-lsb-canvas-list')
      canvasListSurface = null
      canvasListHome = null
      canvasProfileExpanded = false
      canvasProfileScrollMode = 'full'
      canvasProfileSlot?.remove()
      canvasProfileSlot = null
      canvasProfileOutlet = null
    }

    function canvasUserListSurface(outlet) {
      if (!(outlet instanceof Element) || api.page?.type !== 'user') return null
      const direct = [...outlet.children].find((node) => node.matches?.('.home-shell, .forum-layout, .forum-main, .main-panel'))
      const list = direct || outlet.querySelector('.home-shell, .forum-layout, .forum-main, .main-panel')
      if (!(list instanceof Element)) return null
      if (canvasListSurface && canvasListSurface !== list) canvasListSurface.removeAttribute('data-lsb-canvas-list')
      if (!canvasListHome) canvasListHome = { node: list, parent: list.parentNode, next: list.nextSibling }
      list.setAttribute('data-lsb-canvas-list', '')
      canvasListSurface = list
      return list
    }

    function canvasApplyUserSurfaceState(outlet, slot) {
      if (!(slot instanceof Element) || api.page?.type !== 'user') return
      canvasProfileExpanded = false
      canvasProfileScrollMode = 'full'
      slot.setAttribute('data-lsb-canvas-profile', '')
      slot.dataset.scrollMode = canvasProfileScrollMode
      slot.dataset.expanded = String(canvasProfileExpanded)
      canvasUserListSurface(outlet)
    }

    function canvasMountProfile(outlet) {
      if (!(outlet instanceof Element)) return null
      if (canvasProfileOutlet && canvasProfileOutlet !== outlet) canvasRestoreProfile()
      canvasMountSelfProfile()
      canvasProfileOutlet = outlet
      if (api.page?.type !== 'user') return canvasSelfProfileHost
      const slot = canvasProfileSlotFor(outlet)
      if (!(slot instanceof Element)) return null
      canvasProfileSlot = slot
      slot.setAttribute('data-lsb-canvas-profile', '')
      adoptUserCard(slot)
      if (!slot.querySelector('.sidebar-card.user-card')) {
        slot.hidden = true
      } else {
        slot.hidden = false
        canvasApplyUserSurfaceState(outlet, slot)
      }
      return slot
    }

    function canvasPersistentSiteCardKind(card) {
      if (!(card instanceof Element)) return ''
      if (card.matches('.sidebar-promotions-card')) return 'promotions'
      if (card.matches('.daily-hot-topics-card')) return 'daily-hot-topics'
      return ''
    }

    function canvasEnsurePersistentSiteCard(card) {
      const kind = canvasPersistentSiteCardKind(card)
      if (!kind) return null
      let record = canvasPersistentSiteCards.get(kind)
      if (!record) {
        const parent = card.parentNode
        const placeholder = document.createComment(`lsb-canvas-${kind}-origin`)
        parent?.insertBefore(placeholder, card)
        record = { node: card, placeholder, originalParent: parent, originalNext: card.nextSibling }
        canvasPersistentSiteCards.set(kind, record)
      }
      return record
    }

    function canvasAdoptRebuiltPersistentSiteCard(kind, card) {
      const record = canvasPersistentSiteCards.get(kind)
      const parent = card?.parentNode
      if (!record || record.node?.isConnected || !parent) return false
      const placeholder = document.createComment(`lsb-canvas-${kind}-origin`)
      const originalNext = card.nextSibling
      parent.insertBefore(placeholder, card)
      canvasSiteSidebarHomes.delete(record.node)
      record.node = card
      record.placeholder = placeholder
      record.originalParent = parent
      record.originalNext = originalNext
      return true
    }

    function canvasRestorePersistentSiteCard(kind, record, { release = true } = {}) {
      if (!record?.node) return
      const { node, placeholder, originalParent, originalNext } = record
      const placeholderParent = placeholder?.parentNode
      const connectedParent = placeholderParent?.isConnected
        ? placeholderParent
        : (originalParent?.isConnected ? originalParent : nativeSidebars().find((side) => side.isConnected))
      if (connectedParent && placeholderParent === connectedParent) {
        connectedParent.replaceChild(node, placeholder)
      } else if (connectedParent) {
        const before = originalNext?.parentNode === connectedParent ? originalNext : null
        connectedParent.insertBefore(node, before)
      } else if (originalParent?.isConnected) {
        const before = originalNext?.parentNode === originalParent ? originalNext : null
        originalParent.insertBefore(node, before)
      } else if (!node.parentNode?.isConnected) {
        node.remove()
      }
      node.classList.remove('lsb-canvas-site-card')
      if (release) canvasPersistentSiteCards.delete(kind)
      canvasSiteSidebarHomes.delete(node)
    }

    function canvasStagePersistentSiteCardOrigins(remoteOutlet) {
      if (!(remoteOutlet instanceof Element)) return
      for (const [kind] of canvasPersistentSiteCards) {
        const remotes = [...remoteOutlet.querySelectorAll('.sidebar-promotions-card, .daily-hot-topics-card')]
          .filter((card) => canvasPersistentSiteCardKind(card) === kind)
        for (const remote of remotes) {
          const marker = remote.ownerDocument.createElement('span')
          marker.hidden = true
          marker.dataset.lsbCanvasSiteOrigin = kind
          marker.setAttribute('aria-hidden', 'true')
          remote.replaceWith(marker)
        }
      }
    }

    function canvasRebindPersistentSiteCardOrigins(routeOutlet) {
      if (!routeOutlet?.querySelector) return
      for (const [kind, record] of canvasPersistentSiteCards) {
        const marker = routeOutlet.querySelector(`[data-lsb-canvas-site-origin="${kind}"]`)
        if (!marker) continue
        record.placeholder = marker
        record.originalParent = marker.parentNode
        record.originalNext = marker.nextSibling
      }
    }

    function canvasRestoreSiteSidebar({ releasePersistent = false, restorePersistent = false } = {}) {
      const persistentByNode = new Map(
        [...canvasPersistentSiteCards].map(([kind, record]) => [record.node, { kind, record }]),
      )
      for (const [card, home] of [...canvasSiteSidebarHomes]) {
        const persistent = persistentByNode.get(card)
        if (persistent && !releasePersistent) continue
        if (persistent) canvasRestorePersistentSiteCard(persistent.kind, persistent.record, { release: releasePersistent })
        else restoreNode(card, home, 'lsb-canvas-site-card')
        canvasSiteSidebarHomes.delete(card)
      }
      if (restorePersistent && !releasePersistent) {
        for (const [kind, record] of canvasPersistentSiteCards) {
          canvasRestorePersistentSiteCard(kind, record, { release: false })
        }
      }
      if (releasePersistent) {
        for (const [kind, record] of [...canvasPersistentSiteCards]) {
          canvasRestorePersistentSiteCard(kind, record, { release: true })
        }
      }
      for (const card of [...(canvasSiteSidebarHost?.querySelectorAll?.(':scope > .sidebar-card') || [])]) {
        if (!releasePersistent && persistentByNode.has(card)) continue
        card.remove()
      }
      if (releasePersistent) canvasPersistentSiteCards.clear()
      canvasSiteSidebarHost = null
      canvasSiteStatusHost = null
      canvasSiteStatusLocked = false
    }

    function canvasPromotionNeedsNativeInitialization(card) {
      if (!(card instanceof Element) || !card.matches('.sidebar-promotions-card')) return false
      const links = [...card.querySelectorAll('[data-sidebar-promotions-ad-link="1"]')]
      const textLinks = links.filter((link) =>
        link.matches('.sidebar-promotions-slot-text, [data-sidebar-promotions-lottery-slot="1"]')
        || (!link.matches('.sidebar-promotions-slot-image') && !link.querySelector('img')),
      )
      if (!textLinks.length) return false
      return textLinks.some((link) => {
        const style = link.getAttribute('style') || ''
        return !/--sidebar-promotion-text\s*:/.test(style)
          || !/--sidebar-promotion-background\s*:/.test(style)
      })
    }

    function canvasNativeSiteCards() {
      const cards = []
      const emittedPersistentKinds = new Set()
      for (const side of nativeSidebars()) {
        for (const card of [...side.children].filter((node) => node.matches?.('.sidebar-card'))) {
          if (card.classList.contains('user-card')) continue
          if (card.classList.contains('mobile-menu-drawer')) continue
          const kind = canvasPersistentSiteCardKind(card)
          if (kind) {
            const existing = canvasPersistentSiteCards.get(kind)
            if (existing && existing.node !== card) {
              if (existing.node?.isConnected) {
                if (canvasPromotionNeedsNativeInitialization(card)) card.remove()
                else cards.push(card)
                continue
              }
              if (canvasPromotionNeedsNativeInitialization(card)) {
                card.remove()
                continue
              }
              canvasAdoptRebuiltPersistentSiteCard(kind, card)
            }
            const record = canvasEnsurePersistentSiteCard(card)
            if (!record) continue
            if (!emittedPersistentKinds.has(kind)) {
              cards.push(record.node)
              emittedPersistentKinds.add(kind)
            }
            continue
          }
          cards.push(card)
        }
      }
      for (const [kind, record] of canvasPersistentSiteCards) {
        if (record.node.isConnected && !emittedPersistentKinds.has(kind)) cards.push(record.node)
      }
      return cards
    }

    function canvasSiteStatusBody() {
      return canvasSurface('site-status')?.querySelector('[data-canvas-site-status-body]') || null
    }

    function canvasSiteStatusSetExpanded(host, expanded, locked = canvasSiteStatusLocked) {
      if (!(host instanceof Element)) return
      const next = !!expanded
      canvasSiteStatusLocked = !!locked
      host.dataset.expanded = String(next)
      host.dataset.locked = String(canvasSiteStatusLocked)
      const button = host.querySelector('[data-canvas-site-status-expand]')
      const label = host.querySelector('[data-canvas-site-status-label]')
      if (label instanceof HTMLElement) label.setAttribute('aria-expanded', String(next))
      if (button instanceof HTMLElement) {
        button.setAttribute('aria-expanded', String(next))
        button.textContent = next ? '⌃' : '⌄'
        button.setAttribute('title', next ? '收起站点信息' : '展开站点信息')
        button.setAttribute('aria-label', next ? '收起站点信息' : '展开站点信息')
      }
    }

    function canvasSyncPersistentSiteCards(surface = canvasSurface('site-card')) {
      const statusSurface = canvasSurface('site-status')
      const statusHost = statusSurface?.querySelector('[data-canvas-site-status-host]')
      const useStatusHost = canvasWidthClass === 'wide' && statusHost instanceof Element
      const host = useStatusHost ? canvasSiteStatusBody() : surface?.querySelector?.('[data-canvas-site-sidebar]')
      if (!(host instanceof Element)) return
      canvasSiteSidebarHost = host
      canvasSiteStatusHost = useStatusHost ? statusHost : null
      const cards = []
      const emitted = new Set()
      for (const side of nativeSidebars()) {
        for (const card of [...side.children].filter((node) => node.matches?.('.sidebar-card'))) {
          const kind = canvasPersistentSiteCardKind(card)
          if (!kind) continue
          const existing = canvasPersistentSiteCards.get(kind)
          if (existing && existing.node !== card) {
            if (existing.node?.isConnected) {
              if (canvasPromotionNeedsNativeInitialization(card)) card.remove()
              continue
            }
            if (canvasPromotionNeedsNativeInitialization(card)) {
              card.remove()
              continue
            }
            canvasAdoptRebuiltPersistentSiteCard(kind, card)
          }
          const record = canvasEnsurePersistentSiteCard(card)
          if (record && !emitted.has(kind)) {
            cards.push(record.node)
            emitted.add(kind)
          }
        }
      }
      for (const [kind, record] of canvasPersistentSiteCards) {
        if (record.node.isConnected && !emitted.has(kind)) cards.push(record.node)
      }
      for (const card of cards) {
        if (host.contains(card)) continue
        card.classList.add('lsb-canvas-site-card')
        host.append(card)
      }
      const empty = host.querySelector('[data-canvas-site-empty-state]')
      if (empty instanceof HTMLElement) empty.hidden = cards.length > 0
    }

    function canvasSyncSiteSidebar(surface = canvasSurface('site-card')) {
      const statusSurface = canvasSurface('site-status')
      const statusHost = statusSurface?.querySelector('[data-canvas-site-status-host]')
      const useStatusHost = canvasWidthClass === 'wide' && statusHost instanceof Element
      const host = useStatusHost ? canvasSiteStatusBody() : surface?.querySelector?.('[data-canvas-site-sidebar]')
      if (!(host instanceof Element)) return
      canvasSiteSidebarHost = host
      canvasSiteStatusHost = useStatusHost ? statusHost : null
      if (statusSurface instanceof HTMLElement) statusSurface.hidden = !useStatusHost
      if (statusHost instanceof HTMLElement) {
        statusHost.hidden = !useStatusHost
        if (!useStatusHost) canvasSiteStatusSetExpanded(statusHost, false, false)
      }
      const cards = canvasNativeSiteCards()
      const current = new Set(cards)
      const persistentNodes = new Set(
        [...canvasPersistentSiteCards.values()].map((record) => record.node),
      )
      for (const [card] of [...canvasSiteSidebarHomes]) {
        if (!card.isConnected) canvasSiteSidebarHomes.delete(card)
      }
      for (const card of [...host.children].filter((node) => node.matches?.('.sidebar-card'))) {
        if (persistentNodes.has(card) || current.has(card) || canvasSiteSidebarHomes.has(card)) continue
        const home = canvasSiteSidebarHomes.get(card)
        if (home) {
          restoreNode(card, home, 'lsb-canvas-site-card')
          canvasSiteSidebarHomes.delete(card)
        } else {
          card.remove()
        }
      }
      for (const card of cards) {
        if (host.contains(card)) continue
        if (!persistentNodes.has(card) && !canvasSiteSidebarHomes.has(card)) {
          canvasSiteSidebarHomes.set(card, { parent: card.parentNode, next: card.nextSibling })
        }
        card.classList.add('lsb-canvas-site-card')
        host.append(card)
      }
      const empty = host.querySelector('[data-canvas-site-empty-state]')
      if (empty instanceof HTMLElement) {
        const mounted = host.querySelectorAll(':scope > .sidebar-card').length
        empty.hidden = cards.length > 0 || mounted > 0
      }
    }

    function canvasBindSiteStatus(host) {
      if (!(host instanceof Element) || host.dataset.canvasSiteStatusBound === '1') return
      host.dataset.canvasSiteStatusBound = '1'
      canvasSiteStatusSetExpanded(host, false, false)
    }

    function canvasOpenSiteStatus(trigger = null) {
      const host = canvasSurface('site-status')?.querySelector('[data-canvas-site-status-host]')
      if (!(host instanceof Element)) return null
      if (canvasActiveSheet && canvasActiveSheet !== 'site-card') canvasCloseSurface(canvasActiveSheet, false)
      canvasFocusReturn = trigger instanceof Element
        ? trigger
        : (document.activeElement instanceof Element ? document.activeElement : null)
      canvasSyncSiteSidebar()
      host.hidden = false
      canvasSiteStatusSetExpanded(host, true, true)
      canvasActiveSheet = 'site-card'
      canvasSetBackdrop(false)
      canvasZIndex += 1
      host.style.zIndex = String(8010 + canvasZIndex)
      return host
    }

    function canvasWatchSidebar() {
      canvasSidebarObserver?.disconnect?.()
      canvasSidebarObserver = null
      const sides = nativeSidebars()
      if (!sides.length || typeof MutationObserver !== 'function') return
      canvasSidebarObserver = new MutationObserver(() => {
        if (!cfg.shell) return
        canvasMountProfile(findRouteOutlet())
        const site = canvasSurface('site-card')
        canvasSyncPersistentSiteCards(site)
        if (canvasActiveSheet === 'site-card' || site?.dataset.surfaceMode === 'rail') canvasSyncSiteSidebar(site)
      })
      for (const side of sides) canvasSidebarObserver.observe(side, { childList: true, subtree: true })
    }

    function canvasStopSidebarWatch() {
      canvasSidebarObserver?.disconnect?.()
      canvasSidebarObserver = null
    }

    function extraLabel(a) {
      if (!(a instanceof Element)) return ''
      const text = [...a.childNodes]
        .filter((n) => n.nodeType === 3)
        .map((n) => (n.textContent || '').trim())
        .find(Boolean)
      return text || (a.getAttribute('aria-label') || '').trim()
    }

    function isPersonalExtra(href, label) {
      const name = String(label || '').replace(/\s+/g, '')
      if (/^我的/.test(name)) return true
      try {
        const path = new URL(href, location.href).pathname
        if (/^\/user\/\d+\/?$/.test(path)) return true
      } catch {
        /* ignore */
      }
      return false
    }

    function isJunkExtra(href, label) {
      const name = String(label || '').replace(/\s+/g, '')
      if (!name || /^\d+$/.test(name)) return true
      return isPersonalExtra(href, label)
    }

    function isAiConsoleExtra(node, href = '', label = '') {
      if (node?.classList?.contains('lsb-ai-console-top')) return true
      const name = String(label || extraLabel(node) || node?.textContent || '').replace(/\s+/g, ' ')
      return /AI\s*操作台/.test(name)
    }

    function collectTopExtras() {
      const top = document.querySelector('body > .top')
      if (!top) return []
      const seen = new Set()
      const out = []
      const take = (a) => {
        if (!(a instanceof HTMLAnchorElement)) return
        const label = extraLabel(a)
        if (!label || isAiConsoleExtra(a, a.href, label) || isJunkExtra(a.href, label)) return
        let abs
        try {
          abs = new URL(a.href, location.href).href
        } catch {
          return
        }
        if (seen.has(abs)) return
        seen.add(abs)
        out.push(a)
      }
      for (const a of top.querySelectorAll('a.forum-enhancements-custom-top-link')) take(a)
      for (const a of top.querySelectorAll('a.plugin-top-menu-link')) take(a)
      return out
    }

    function collectCanvasTopLinks() {
      const out = []
      const seen = new Set()
      const add = (node, fallback = {}) => {
        if (node?.classList?.contains('lsb-ai-console-top') || node?.classList?.contains('lsb-ai-copilot-top')) return
        const href = node?.getAttribute?.('href') || fallback.url || ''
        const label = extraLabel(node) || String(node?.textContent || fallback.name || '').replace(/\s+/g, ' ').trim()
        if (!href || !label || isJunkExtra(href, label)) return
        let absolute
        try { absolute = new URL(href, location.href).href } catch { return }
        if (seen.has(absolute)) return
        seen.add(absolute)
        out.push({
          node: node instanceof HTMLAnchorElement ? node : null,
          href: node?.getAttribute?.('href') || fallback.url || href,
          label,
          target: node?.getAttribute?.('target') || (fallback.new_window ? '_blank' : ''),
          rel: node?.getAttribute?.('rel') || '',
        })
      }
      const top = document.querySelector('body > .top')
      top?.querySelectorAll('a.forum-enhancements-custom-top-link, a.plugin-top-menu-link').forEach((node) => add(node))
      top?.querySelectorAll('a.forum-enhancements-custom-top-link, a.plugin-top-menu-link').forEach((node) => add(node))
      const configNode = document.querySelector('.forum-enhancements-config')
      if (configNode) {
        try {
          const config = JSON.parse(configNode.getAttribute('data-config') || '{}')
          for (const item of Array.isArray(config.topCustomLinks) ? config.topCustomLinks : []) add(null, item)
        } catch {
          /* optional enhancement config may be malformed */
        }
      }
      document.querySelectorAll('.feature-links a, .mobile-menu-section a.mobile-menu-link').forEach((node) => add(node))
      for (const item of api.store.get('topExtras') || []) add(null, item)
      return out
    }

    function restoreCanvasTopLinks() {
      for (const [node, home] of canvasStatusLinkHomes) restoreNode(node, home, 'lsb-canvas-status-link')
      canvasStatusLinkHomes.clear()
    }

    function renderCanvasTopLinks() {
      const host = canvasSurface('top-status')?.querySelector('[data-canvas-status-links]')
      const pinnedLinks = canvasSurface('top-status')?.querySelector('[data-canvas-pinned-links]')
      if (!(host instanceof Element) || !(pinnedLinks instanceof Element)) return
      restoreCanvasTopLinks()
      host.replaceChildren()
      pinnedLinks.replaceChildren()
      const items = collectCanvasTopLinks()
      const visibleItems = canvasWidthClass === 'narrow' ? items.slice(0, 4) : items
      const makeNavigationTrigger = () => {
        const button = document.createElement('button')
        button.type = 'button'
        button.className = 'lsb-canvas-navigation-trigger'
        button.setAttribute('data-canvas-open', 'navigation-sheet')
        button.setAttribute('data-canvas-navigation-trigger', '')
        button.setAttribute('aria-label', '导航')
        button.textContent = '导航'
        return button
      }
      let identityLink = null
      for (const item of visibleItems) {
        let link = item.node
        if (!(link instanceof HTMLAnchorElement)) {
          link = document.createElement('a')
          link.href = item.href
          link.textContent = item.label
          if (item.target) link.target = item.target
          if (item.rel) link.rel = item.rel
        }
        if (host.contains(link) || pinnedLinks.contains(link)) continue
        if (link.parentNode) canvasStatusLinkHomes.set(link, { parent: link.parentNode, next: link.nextSibling })
        link.classList.add('lsb-canvas-status-link')
        link.setAttribute('data-lsb-canvas-status-link', '')
        let identityPath = ''
        try { identityPath = new URL(item.href, location.href).pathname.replace(/\/+$/, '') } catch { /* malformed optional link */ }
        if (!identityLink && (identityPath === '/identity_center' || item.label === '认证中心')) {
          identityLink = link
          pinnedLinks.append(link)
        } else {
          host.append(link)
        }
      }
      pinnedLinks.append(makeNavigationTrigger())
      host.hidden = host.children.length === 0
    }

    function adoptTopExtras(host) {
      if (!(host instanceof Element)) return
      for (const a of [...host.querySelectorAll('a[href]')]) {
        const label = extraLabel(a) || (a.textContent || '').trim()
        if (!isAiConsoleExtra(a, a.href, label) && !isJunkExtra(a.href, label)) continue
        if (extrasHomes.has(a)) {
          restoreNode(a, extrasHomes.get(a), 'lsb-shell-extra-link')
          extrasHomes.delete(a)
        } else {
          a.remove()
        }
      }
      const have = new Set([...host.querySelectorAll('a[href]')].map((a) => a.href))
      for (const a of collectTopExtras()) {
        if (host.contains(a)) continue
        if (have.has(a.href)) {
          a.remove()
          continue
        }
        extrasHomes.set(a, { parent: a.parentNode, next: a.nextSibling })
        a.classList.add('lsb-shell-extra-link')
        host.append(a)
        have.add(a.href)
      }
      hydrateTopExtras(host, have)
      pruneJunkExtraNodes(host)
      snapshotTopExtras(host)
    }

    function pruneJunkExtraNodes(host) {
      if (!(host instanceof Element)) return
      for (const node of [...host.childNodes]) {
        if (node.nodeType === 3 && /^\s*\d+\s*$/.test(node.textContent || '')) {
          node.remove()
          continue
        }
        if (!(node instanceof Element)) continue
        const label = extraLabel(node) || (node.textContent || '').trim()
        if (node.matches('a[href]') && (isAiConsoleExtra(node, node.getAttribute('href'), label) || isJunkExtra(node.getAttribute('href'), label))) {
          if (extrasHomes.has(node)) {
            restoreNode(node, extrasHomes.get(node), 'lsb-shell-extra-link')
            extrasHomes.delete(node)
          } else {
            node.remove()
          }
          continue
        }
        if (!node.matches('a') && /^\d+$/.test(label.replace(/\s+/g, ''))) node.remove()
      }
    }

    function snapshotTopExtras(host) {
      if (!(host instanceof Element)) return
      const links = [...host.querySelectorAll('a[href]')]
        .map((a) => ({ href: a.getAttribute('href'), label: extraLabel(a) || (a.textContent || '').trim() }))
        .filter((x) => x.href && x.label && !isAiConsoleExtra(null, x.href, x.label) && !isJunkExtra(x.href, x.label))
      if (links.length) api.store.set('topExtras', links)
    }

    function hydrateTopExtras(host, have) {
      if (!(host instanceof Element)) return
      const known = have || new Set([...host.querySelectorAll('a[href]')].map((a) => a.href))
      for (const item of api.store.get('topExtras') || []) {
        if (!item?.href || !item.label || isAiConsoleExtra(null, item.href, item.label) || isJunkExtra(item.href, item.label)) continue
        let abs
        try {
          abs = new URL(item.href, location.href).href
        } catch {
          continue
        }
        if (known.has(abs)) continue
        const a = document.createElement('a')
        a.setAttribute('href', item.href)
        a.textContent = item.label
        a.className = 'lsb-shell-extra-link'
        a.setAttribute('data-lsb-extra-keep', '1')
        host.append(a)
        known.add(abs)
      }
    }

    function restoreTopExtras() {
      for (const [a, home] of extrasHomes) restoreNode(a, home, 'lsb-shell-extra-link')
      extrasHomes.clear()
    }

    function adoptThemeToggle(host) {
      const modal = document.querySelector('#color-scheme-modal')
      if (modal instanceof Element && modal.parentNode !== document.body) {
        if (!colorSchemeModalHome) colorSchemeModalHome = { parent: modal.parentNode, next: modal.nextSibling }
        modal.classList.add('lsb-shell-theme-modal')
        document.body.append(modal)
      }
      if (!(host instanceof Element)) return
      if (!host.querySelector('.color-scheme-top-link')) {
        const scheme =
          document.querySelector('body > .top a.color-scheme-top-link') ||
          document.querySelector('a.color-scheme-top-link')
        if (scheme && !host.contains(scheme)) {
          if (!colorSchemeHome) colorSchemeHome = { parent: scheme.parentNode, next: scheme.nextSibling }
          scheme.classList.add('lsb-shell-theme-scheme')
          host.append(scheme)
        }
      }
      if (host.querySelector('.dark-mode-control, [data-themes-mode-toggle]')) return
      const widget =
        document.querySelector('body > .top .dark-mode-control') ||
        document.querySelector('.dark-mode-control') ||
        document.querySelector('[data-themes-mode-toggle]')
      if (!widget || host.contains(widget)) return
      if (!themeToggleHome) themeToggleHome = { parent: widget.parentNode, next: widget.nextSibling }
      widget.classList.add('lsb-shell-theme-toggle')
      host.append(widget)
    }

    function restoreThemeToggle() {
      const widget = document.querySelector('.lsb-shell-theme-toggle')
      restoreNode(widget, themeToggleHome, 'lsb-shell-theme-toggle')
      themeToggleHome = null
      const scheme = document.querySelector('.lsb-shell-theme-scheme')
      restoreNode(scheme, colorSchemeHome, 'lsb-shell-theme-scheme')
      colorSchemeHome = null
      const modal = document.querySelector('.lsb-shell-theme-modal')
      if (modal instanceof Element && colorSchemeModalHome) {
        restoreNode(modal, colorSchemeModalHome, 'lsb-shell-theme-modal')
      } else {
        modal?.classList.remove('lsb-shell-theme-modal')
      }
      colorSchemeModalHome = null
    }

    function nativeCards() {
      return nativeSidebars().flatMap((side) => [...side.querySelectorAll('.sidebar-card')])
    }

    function asidePersistentCardKind(card) {
      if (!(card instanceof Element)) return ''
      if (card.matches('.sidebar-promotions-card')) return 'promotions'
      if (card.matches('.daily-hot-topics-card')) return 'daily-hot-topics'
      return ''
    }

    function ensureAsidePersistentCard(card) {
      const kind = asidePersistentCardKind(card)
      if (!kind) return null
      const existing = asidePersistentCards.get(kind)
      if (existing?.node?.isConnected) return existing
      const parent = card.parentNode
      const record = { node: card, originalParent: parent, originalNext: card.nextSibling }
      asidePersistentCards.set(kind, record)
      return record
    }

    function removeRebuiltAsidePersistentCards() {
      for (const [kind, record] of asidePersistentCards) {
        for (const card of nativeCards()) {
          if (card !== record.node && asidePersistentCardKind(card) === kind) card.remove()
        }
      }
    }

    function restoreAsidePersistentCards() {
      for (const [kind, record] of [...asidePersistentCards]) {
        const node = record?.node
        if (!(node instanceof Element)) {
          asidePersistentCards.delete(kind)
          continue
        }
        const parent = record.originalParent?.isConnected
          ? record.originalParent
          : nativeSidebars().find((side) => side.isConnected)
        if (!(parent instanceof Element)) continue
        const before = record.originalNext?.parentNode === parent ? record.originalNext : null
        parent.insertBefore(node, before)
        node.classList.remove('lsb-shell-aside-card')
        asidePersistentCards.delete(kind)
      }
    }

    function pickAsideCards() {
      const persistent = [...asidePersistentCards.values()]
        .map((record) => record.node)
        .filter((node) => node?.isConnected)
      const hosted = [...document.querySelectorAll('#lsb-shell-aside .sidebar-card')]
      const all = [...persistent, ...hosted, ...nativeCards()]
      const seen = new Set()
      const uniq = all.filter((el) => {
        if (seen.has(el)) return false
        seen.add(el)
        return true
      })
      const text = (el) => (el.textContent || '').replace(/\s+/g, ' ').trim()
      const onUser = api.page?.type === 'user'
      const profile = onUser
        ? uniq.find(
            (c) =>
              c.classList.contains('user-card')
              && !c.classList.contains('lsb-shell-user-card')
              && !isSelfUserCard(c),
          )
        : null
      const bio = onUser ? uniq.find((c) => c.classList.contains('bio-card')) : null
      const promo = uniq.find((c) => c.classList.contains('sidebar-promotions-card'))
      const announce = uniq.find(
        (c) => c.classList.contains('forum-enhancements-left-announcements') || text(c).startsWith('站务公告'),
      )
      const quick = uniq.find((c) => text(c).startsWith('快捷功能'))
      const hot = uniq.find((c) => c.classList.contains('daily-hot-topics-card'))
      const stats = uniq.find((c) => c.classList.contains('stats-card'))
      const online = uniq.find((c) => c.classList.contains('online-users-card'))
      return [profile, bio, promo, announce, quick, hot, stats, online].filter(Boolean)
    }

    function adoptAsideCards(host) {
      if (!(host instanceof Element)) return
      for (const card of pickAsideCards()) {
        const kind = asidePersistentCardKind(card)
        if (kind) {
          const record = ensureAsidePersistentCard(card)
          if (record?.node !== card) {
            card.remove()
            continue
          }
          if (host.contains(card)) continue
        } else if (host.contains(card) || card.classList.contains('lsb-shell-user-card')) {
          continue
        } else {
          asideHomes.set(card, { parent: card.parentNode, next: card.nextSibling })
        }
        card.classList.add('lsb-shell-aside-card')
        host.append(card)
      }
      removeRebuiltAsidePersistentCards()
      hydrateAsideKeep(host)
      snapshotAsideKeep(host)
      if (onlineUsersBoot()) syncOnlineUserDots()
    }

    function cardLabel(el) {
      return (el.textContent || '').replace(/\s+/g, ' ').trim()
    }

    function snapshotAsideKeep(host) {
      if (!(host instanceof Element)) return
      const keep = { ...(api.store.get('asideKeep') || {}) }
      const live = [...host.querySelectorAll('.sidebar-card')].filter(
        (el) => !el.hasAttribute('data-lsb-aside-keep'),
      )
      const quick = live.find((c) => cardLabel(c).startsWith('快捷功能'))
      const stats = live.find((c) => c.classList.contains('stats-card'))
      const online = live.find((c) => c.classList.contains('online-users-card'))
      let changed = false
      if (quick) {
        const node = quick.cloneNode(true)
        node.querySelectorAll('[data-themes-mode-toggle], .dark-mode-control').forEach((n) => n.remove())
        keep.quick = node.outerHTML
        changed = true
      }
      if (stats) {
        keep.stats = stats.outerHTML
        changed = true
      }
      if (online) {
        keep.online = online.outerHTML
        changed = true
      }
      if (changed) api.store.set('asideKeep', keep)
    }

    function injectKeptCard(host, html, slot, before) {
      if (!html || host.querySelector(`[data-lsb-aside-keep="${slot}"]`)) return
      const box = document.createElement('div')
      box.innerHTML = html
      const el = box.firstElementChild
      if (!(el instanceof Element)) return
      el.setAttribute('data-lsb-aside-keep', slot)
      el.classList.add('lsb-shell-aside-card')
      if (before instanceof Node && before.parentNode === host) host.insertBefore(el, before)
      else host.append(el)
    }

    function hydrateAsideKeep(host) {
      if (!(host instanceof Element)) return
      const keep = api.store.get('asideKeep') || {}
      const live = [...host.querySelectorAll('.sidebar-card')].filter(
        (el) => !el.hasAttribute('data-lsb-aside-keep'),
      )
      const hasQuick = live.some((c) => cardLabel(c).startsWith('快捷功能'))
      const hasStats = live.some((c) => c.classList.contains('stats-card'))
      const hasOnline = live.some((c) => c.classList.contains('online-users-card'))
      if (hasQuick) host.querySelector('[data-lsb-aside-keep="quick"]')?.remove()
      else injectKeptCard(host, keep.quick, 'quick', host.querySelector('.daily-hot-topics-card'))
      if (hasStats) host.querySelector('[data-lsb-aside-keep="stats"]')?.remove()
      else {
        const hot = host.querySelector('.daily-hot-topics-card')
        injectKeptCard(host, keep.stats, 'stats', hot?.nextSibling)
      }
      if (hasOnline) host.querySelector('[data-lsb-aside-keep="online"]')?.remove()
      else injectKeptCard(host, keep.online, 'online', null)
    }

    function restoreAsideCards() {
      for (const [card, home] of asideHomes) restoreNode(card, home, 'lsb-shell-aside-card')
      asideHomes.clear()
    }

    function pruneDetachedAsideCards() {
      for (const [card, home] of [...asideHomes]) {
        if (home?.parent?.isConnected) continue
        restoreNode(card, home, 'lsb-shell-aside-card')
        asideHomes.delete(card)
      }
    }

    function watchOnlineCard() {
      if (onlineObs || document.querySelector('#lsb-shell-aside .online-users-card')) return
      const sides = nativeSidebars()
      if (!sides.length) return
      onlineObs = new MutationObserver(() => {
        const host = document.querySelector('#lsb-shell-aside')
        if (!host || !cfg.shell) return
        adoptAsideCards(host)
        if (host.querySelector('.online-users-card')) stopOnlineWatch()
      })
      for (const side of sides) onlineObs.observe(side, { childList: true, subtree: true })
    }

    function stopOnlineWatch() {
      onlineObs?.disconnect()
      onlineObs = null
    }

    function onlineUserIdFromHref(href) {
      const value = String(href || '')
      const pretty = value.match(/\/user\/(\d+)(?:[/?#]|$)/)
      if (pretty) return pretty[1]
      if (!/[?&]a=user(?:&|$)/.test(value)) return ''
      return value.match(/[?&]id=(\d+)(?:&|$)/)?.[1] || ''
    }

    function onlineUsersBoot(root = document) {
      if (!root?.querySelector) return null
      return root.querySelector('[data-online-users-ids]')
    }

    function syncOnlineUserDots() {
      const boot = onlineUsersBoot()
      if (!(boot instanceof Element)) return false
      const ids = new Set(String(boot.dataset.onlineUsersIds || '').split(',').map((id) => id.trim()).filter(Boolean))
      const label = boot.dataset.onlineUsersLabel || '在线'
      for (const img of document.querySelectorAll('img.avatar-img')) {
        const host = img.parentElement
        if (!(host instanceof Element)) continue
        const dot = host.querySelector(':scope > .online-users-dot')
        const marked = host.closest('[data-online-user-id]')
        const link = img.closest('a[href]')
        const uid = String(marked?.getAttribute('data-online-user-id') || (link ? onlineUserIdFromHref(link.getAttribute('href')) : '')).trim()
        if (uid && ids.has(uid)) {
          host.classList.add('online-users-host')
          if (dot) dot.title = label
          else {
            const next = document.createElement('span')
            next.className = 'online-users-dot'
            next.title = label
            host.append(next)
          }
        } else {
          dot?.remove()
          host.classList.remove('online-users-host')
        }
      }
      return true
    }

    function syncOnlineUserBoot(sourceDoc) {
      const source = onlineUsersBoot(sourceDoc)
      if (!(source instanceof Element)) return false
      let target = onlineUsersBoot()
      if (!(target instanceof Element)) {
        target = document.createElement('span')
        target.className = 'online-users-boot'
        target.hidden = true
        document.body?.append(target)
      }
      if (!(target instanceof Element)) return false
      target.dataset.onlineUsersIds = source.dataset.onlineUsersIds || ''
      target.dataset.onlineUsersLabel = source.dataset.onlineUsersLabel || '在线'
      const synced = syncOnlineUserDots()
      if (synced) onlineUserLastSyncAt = Date.now()
      return synced
    }

    function wantsOnlineUserRefresh() {
      return !!cfg.shell && !isCloudflareChallengeDocument(document)
    }

    function onlineUserRefreshPath() {
      const url = new URL('/', location.href)
      return `${url.pathname}${url.search}`
    }

    function stopOnlineUserRefresh() {
      if (onlineUserRefreshTimer) {
        window.clearTimeout(onlineUserRefreshTimer)
        onlineUserRefreshTimer = 0
      }
      onlineUserRefreshPending = false
      onlineUserRefreshAfterInflight = false
      onlineUserRefreshGeneration += 1
      if (onlineUserRefreshVisibilityBound) {
        document.removeEventListener('visibilitychange', onOnlineUserVisibilityChange)
        onlineUserRefreshVisibilityBound = false
      }
    }

    function scheduleOnlineUserRefresh(delay = ONLINE_USER_REFRESH_MS, force = false, bypassCooldown = false) {
      if (!wantsOnlineUserRefresh()) {
        stopOnlineUserRefresh()
        return
      }
      if (onlineUserRefreshTimer) {
        if (!force) return
        window.clearTimeout(onlineUserRefreshTimer)
        onlineUserRefreshTimer = 0
      }
      if (onlineUserRefreshInflight) {
        if (bypassCooldown) onlineUserRefreshAfterInflight = true
        return
      }
      const elapsed = onlineUserLastSyncAt ? Date.now() - onlineUserLastSyncAt : 0
      const notBefore = bypassCooldown || !onlineUserLastSyncAt
        ? 0
        : Math.max(0, ONLINE_USER_REFRESH_MS - Math.max(0, elapsed))
      const wait = Math.max(0, Number(delay) || 0, notBefore)
      onlineUserRefreshTimer = window.setTimeout(() => {
        onlineUserRefreshTimer = 0
        void refreshOnlineUsers()
      }, wait)
    }

    async function refreshOnlineUsers() {
      if (!wantsOnlineUserRefresh()) return
      if (document.visibilityState === 'hidden') {
        onlineUserRefreshPending = true
        return
      }
      onlineUserRefreshPending = false
      if (onlineUserRefreshInflight) return onlineUserRefreshInflight
      const generation = onlineUserRefreshGeneration
      const task = (async () => {
        try {
          const res = await api.net.raw(onlineUserRefreshPath(), {
            queue: false,
            timeout: 15000,
            retry: 0,
            headers: { 'cache-control': 'no-cache' },
          })
          if (generation !== onlineUserRefreshGeneration || !wantsOnlineUserRefresh() || !res.ok) return
          const sourceDoc = new DOMParser().parseFromString(res.text || '', 'text/html')
          if (syncOnlineUserBoot(sourceDoc)) onlineUserLastSyncAt = Date.now()
        } catch {
          /* 在线清单刷新失败时保留上一份清单，下一周期继续尝试。 */
        } finally {
          if (onlineUserRefreshInflight === task) onlineUserRefreshInflight = null
          const rerun = onlineUserRefreshAfterInflight
          onlineUserRefreshAfterInflight = false
          if (generation === onlineUserRefreshGeneration) {
            if (rerun) scheduleOnlineUserRefresh(0, true, true)
            else scheduleOnlineUserRefresh()
          }
        }
      })()
      onlineUserRefreshInflight = task
      return task
    }

    function onOnlineUserVisibilityChange() {
      if (document.visibilityState !== 'visible' || !onlineUserRefreshPending) return
      onlineUserRefreshPending = false
      void refreshOnlineUsers()
    }

    function startOnlineUserRefresh() {
      if (!wantsOnlineUserRefresh()) return
      if (!onlineUserRefreshVisibilityBound) {
        document.addEventListener('visibilitychange', onOnlineUserVisibilityChange)
        onlineUserRefreshVisibilityBound = true
      }
      scheduleOnlineUserRefresh()
    }

    function scheduleOnlineUserDots() {
      if (onlineAvatarTimer) return
      onlineAvatarTimer = window.setTimeout(() => {
        onlineAvatarTimer = 0
        syncOnlineUserDots()
      }, 50)
    }

    function watchOnlineUserDots() {
      if (onlineAvatarObs || !(document.body instanceof Element) || !cfg.shell) return
      onlineAvatarObs = new MutationObserver((records) => {
        const hasAvatar = records.some((record) => [...record.addedNodes].some((node) => (
          node instanceof Element && (node.matches('img.avatar-img') || !!node.querySelector('img.avatar-img'))
        )))
        if (hasAvatar) scheduleOnlineUserDots()
      })
      onlineAvatarObs.observe(document.body, { childList: true, subtree: true })
    }

    function stopOnlineUserDots() {
      onlineAvatarObs?.disconnect()
      onlineAvatarObs = null
      if (onlineAvatarTimer) {
        window.clearTimeout(onlineAvatarTimer)
        onlineAvatarTimer = 0
      }
    }

    function watchTopExtras() {
      if (extrasObs) return
      const top = document.querySelector('body > .top')
      if (!top) return
      extrasObs = new MutationObserver(() => {
        const host = document.querySelector('[data-lsb-shell-extras]')
        if (!host || !cfg.shell) return
        adoptTopExtras(host)
      })
      extrasObs.observe(top, { childList: true, subtree: true })
    }

    function stopExtrasWatch() {
      extrasObs?.disconnect()
      extrasObs = null
    }

    function renderLinks(links) {
      return links
        .map((link) => {
          if (link.rpc) {
            return `<button type="button" class="lsb-shell-link" data-lsb-rpc="${esc(link.rpc)}"><span class="lsb-shell-link-label">${esc(link.label)}</span></button>`
          }
          if (link.panel) {
            return `<button type="button" class="lsb-shell-link" data-lsb-panel="${esc(link.panel)}"><span class="lsb-shell-link-label">${esc(link.label)}</span></button>`
          }
          const active = isActiveHref(link.href) ? ' is-active' : ''
          const count = Number.isFinite(link.count)
            ? `<span class="lsb-shell-count">${esc(String(link.count))}</span>`
            : ''
          return `<a class="lsb-shell-link${active}" href="${esc(link.href)}"><span class="lsb-shell-link-label">${esc(link.label)}</span>${count}</a>`
        })
        .join('')
    }

    function paintActive(host) {
      if (!(host instanceof Element)) return
      for (const a of host.querySelectorAll('a.lsb-shell-link')) {
        a.classList.toggle('is-active', isActiveHref(a.getAttribute('href')))
      }
    }

    function setSection(host, title, links) {
      if (!(host instanceof Element)) return
      const sig = title + JSON.stringify(links)
      if (host.dataset.sig === sig) {
        paintActive(host)
        return
      }
      host.dataset.sig = sig
      if (!links.length) {
        host.innerHTML = ''
        return
      }
      const heading = title ? `<h2>${esc(title)}</h2>` : ''
      host.innerHTML = `<section class="lsb-shell-nav-section">${heading}<div class="lsb-shell-nav">${renderLinks(links)}</div></section>`
    }

    function topicPosts() {
      const sel = api.sel?.topicPosts || 'ul.topic-post-list > li.post-entry, ul.post-list > li.post-entry'
      const nodes = [...document.querySelectorAll(sel)]
      return nodes.slice().sort((a, b) => {
        const fa = Number(a.dataset?.floor)
        const fb = Number(b.dataset?.floor)
        const na = Number.isFinite(fa) && fa > 0 ? fa : 0
        const nb = Number.isFinite(fb) && fb > 0 ? fb : 0
        if (na !== nb) return na - nb
        return nodes.indexOf(a) - nodes.indexOf(b)
      })
    }

    function scrollToPost(post, block) {
      post?.scrollIntoView({
        behavior: matchMedia('(prefers-reduced-motion: reduce)').matches ? 'auto' : 'smooth',
        block: block || 'start',
      })
    }

    function bindTimeline(timeline) {
      if (timeline.dataset.bound) return
      timeline.dataset.bound = '1'
      timeline.querySelector('.lsb-shell-edge[data-timeline-edge="start"]').addEventListener('click', () => {
        scrollToPost(topicPosts()[0], 'start')
      })
      timeline.querySelector('.lsb-shell-edge[data-timeline-edge="end"]').addEventListener('click', () => {
        scrollToPost(topicPosts().at(-1), 'center')
      })
      timeline.querySelector('.lsb-shell-track').addEventListener('click', (event) => {
        const posts = topicPosts()
        if (!posts.length) return
        const rect = event.currentTarget.getBoundingClientRect()
        const ratio = rect.height > 0 ? Math.min(1, Math.max(0, (event.clientY - rect.top) / rect.height)) : 0
        scrollToPost(posts[Math.round(ratio * Math.max(0, posts.length - 1))], 'center')
      })
    }

    function ensureTimeline(shellEl) {
      const onTopic = api.page?.type === 'topic' && topicPosts().length > 0
      let timeline = shellEl.querySelector('#lsb-shell-timeline')
      if (!onTopic) {
        if (timeline) timeline.hidden = true
        return null
      }
      if (!timeline) {
        timeline = document.createElement('nav')
        timeline.id = 'lsb-shell-timeline'
        timeline.setAttribute('aria-label', '楼层')
        timeline.innerHTML = `
          <button type="button" class="lsb-shell-edge" data-timeline-edge="start">主帖</button>
          <div class="lsb-shell-now"><strong data-timeline-current>主帖</strong><span data-timeline-date></span></div>
          <button type="button" class="lsb-shell-track" data-timeline-track role="scrollbar" aria-label="楼层轨道" aria-orientation="vertical" aria-valuemin="0" aria-valuemax="100" aria-valuenow="0">
            <span class="lsb-shell-thumb" aria-hidden="true"></span>
          </button>
          <div data-timeline-total></div>
          <button type="button" class="lsb-shell-edge" data-timeline-edge="end">最新</button>`
        shellEl.append(timeline)
        bindTimeline(timeline)
      }
      timeline.hidden = false
      return timeline
    }

    function currentTimelinePost(posts) {
      if (!posts.length) return { post: null, index: 0 }
      const offset = 56
      let index = 0
      for (let i = 0; i < posts.length; i += 1) {
        if (posts[i].getBoundingClientRect().top <= offset) index = i
        else break
      }
      return { post: posts[index], index }
    }

    function updateTimeline() {
      timelineRaf = 0
      if (!api.hasHandler('perf-probe:record')) {
        updateTimelineBody()
        return
      }
      const t0 = performance.now()
      try {
        updateTimelineBody()
      } finally {
        perfEmitTimeline(performance.now() - t0)
      }
    }

    function updateTimelineBody() {
      const doc = typeof document !== 'undefined' ? document : null
      const timeline = doc?.querySelector?.('#lsb-shell-timeline')
      if (!timeline || !cfg.shell) return
      const posts = topicPosts()
      if (!posts.length) {
        timeline.hidden = true
        return
      }
      timeline.hidden = false
      const { post, index } = currentTimelinePost(posts)
      const floor = Number(post?.dataset?.floor)
      const progress = posts.length > 1 ? (index / (posts.length - 1)) * 100 : 0
      timeline.style.setProperty('--lsb-timeline-progress', `${progress}%`)
      timeline.querySelector('[data-timeline-current]').textContent =
        Number.isFinite(floor) && floor > 1 ? `#${floor}` : '主帖'
      const time = post?.querySelector('time, span[data-performance-time], .post-time')
      timeline.querySelector('[data-timeline-date]').textContent = (time?.textContent || '').trim().slice(0, 24)
      timeline.querySelector('[data-timeline-total]').textContent = `${Math.max(0, posts.length - 1)} 条回复`
      const track = timeline.querySelector('.lsb-shell-track')
      track.setAttribute('aria-valuenow', String(Math.round(progress)))
    }

    function scheduleTimeline() {
      if (timelineRaf) return
      const requestFrame = window.requestAnimationFrame
      timelineRaf = typeof requestFrame === 'function'
        ? requestFrame.call(window, updateTimeline)
        : window.setTimeout(updateTimeline, 16)
    }

    function bindWindow() {
      if (windowListening) return
      windowListening = true
      window.addEventListener('scroll', scheduleTimeline, { passive: true })
      window.addEventListener('resize', scheduleTimeline)
    }

    function unbindWindow() {
      if (!windowListening) return
      windowListening = false
      window.removeEventListener('scroll', scheduleTimeline)
      window.removeEventListener('resize', scheduleTimeline)
    }

    function shellWindowEnabled() {
      return false
    }

    function shellWorkspace(el = document.getElementById('lsb-shell')) {
      return el?.querySelector?.('[data-lsb-shell-workspace]') || null
    }

    function shellViewport(workspace) {
      const width = Number(workspace?.clientWidth || window.innerWidth || document.documentElement?.clientWidth || 1)
      const height = Number(workspace?.clientHeight || (window.innerHeight || document.documentElement?.clientHeight || 1) - 48)
      return { width: Math.max(1, width), height: Math.max(1, height) }
    }

    function cssPixels(name, fallback) {
      try {
        const value = getComputedStyle(document.documentElement).getPropertyValue(name)
        const parsed = Number.parseFloat(value)
        return Number.isFinite(parsed) ? parsed : fallback
      } catch {
        return fallback
      }
    }

    function shellLayoutStorageKey(viewport = shellViewport(shellWorkspace())) {
      if (!shellLayoutApi) return ''
      const bucket = shellLayoutApi.widthBucket(viewport.width)
      return shellLayoutApi.layoutStorageKey(location.origin, bucket)
    }

    function readLegacyShellLayout() {
      return {
        header: cssPixels('--lsb-shell-header', 48),
        rail: cssPixels('--lsb-shell-rail', 240),
        aside: cssPixels('--lsb-shell-aside', 280),
        asideActiveId: asidePreferredId,
      }
    }

    function saveShellLayout({ immediate = false } = {}) {
      if (!shellWindowLayout || !shellLayoutKey || !shellLayoutApi) return null
      if (!immediate) {
        window.clearTimeout(shellLayoutSaveTimer)
        shellLayoutSaveTimer = window.setTimeout(() => {
          shellLayoutSaveTimer = 0
          saveShellLayout({ immediate: true })
        }, LAYOUT_SAVE_DEBOUNCE)
        return null
      }
      window.clearTimeout(shellLayoutSaveTimer)
      shellLayoutSaveTimer = 0
      const viewport = shellViewport(shellWorkspace())
      const clean = shellLayoutApi.sanitizeShellLayout(shellWindowLayout, {
        ...viewport,
        registry: shellWindowRegistry,
      })
      clean.updatedAt = Date.now()
      shellWindowLayout = clean
      try {
        api.store.set(shellLayoutKey, structuredCloneSafe(clean))
      } catch {
        /* 存储不可用时继续保留内存布局，不能阻塞壳。 */
      }
      return structuredCloneSafe(clean)
    }

    function loadShellLayout(viewport = shellViewport(shellWorkspace())) {
      if (!shellLayoutApi) return null
      const key = shellLayoutStorageKey(viewport)
      shellLayoutKey = key
      let stored = null
      try {
        stored = api.store.get(key, null)
      } catch {
        stored = null
      }
      if (stored && typeof stored === 'object' && stored.windows && typeof stored.windows === 'object') {
        const clean = shellLayoutApi.sanitizeShellLayout(stored, {
          ...viewport,
          registry: shellWindowRegistry,
        })
        if (Object.keys(clean.windows).length) return clean
      }

      let migrationVersion = 0
      try { migrationVersion = Number(api.store.get(LAYOUT_MIGRATION_KEY, 0)) || 0 } catch { migrationVersion = 0 }
      if (!stored && migrationVersion < LAYOUT_MIGRATION_VERSION) {
        const migrated = shellLayoutApi.migrateLegacyShellLayout({
          viewport,
          legacy: readLegacyShellLayout(),
          registry: shellWindowRegistry,
        })
        migrated.updatedAt = Date.now()
        try { api.store.set(LAYOUT_MIGRATION_KEY, LAYOUT_MIGRATION_VERSION) } catch { /* optional marker */ }
        return migrated
      }
      return shellLayoutApi.defaultShellLayout({ ...viewport, registry: shellWindowRegistry })
    }

    function ensureRegisteredShellLayout(layout, viewport) {
      if (!layout || !shellLayoutApi) return layout
      const defaults = shellLayoutApi.defaultShellLayout({ ...viewport, registry: shellWindowRegistry })
      for (const [id, state] of Object.entries(defaults.windows || {})) {
        if (!layout.windows?.[id]) layout.windows[id] = state
        if (!layout.zOrder?.includes(id)) layout.zOrder.push(id)
      }
      return layout
    }

    function shellHost(id, el = document.getElementById('lsb-shell')) {
      if (id === 'nav') return el?.querySelector?.('#lsb-shell-rail') || null
      if (id === 'site') return el?.querySelector?.('#lsb-shell-aside') || null
      if (id === 'content') return el?.querySelector?.('#lsb-shell-window-content') || null
      const wanted = String(id || '')
      return [...(el?.querySelectorAll?.('[data-lsb-shell-window]') || [])]
        .find((node) => node.getAttribute('data-lsb-shell-window') === wanted) || null
    }

    function ensureWindowChrome(host, id, label) {
      if (!(host instanceof Element)) return null
      host.classList.add('lsb-shell-window')
      host.setAttribute('data-lsb-shell-window', id)
      host.setAttribute('role', 'region')
      if (!host.hasAttribute('tabindex')) host.tabIndex = 0
      const titleId = `lsb-shell-window-${id}-title`
      host.setAttribute('aria-labelledby', titleId)
      let bar = host.querySelector(':scope > [data-lsb-shell-window-bar]')
      if (!bar) {
        bar = document.createElement('div')
        bar.className = 'lsb-shell-window-bar'
        bar.setAttribute('data-lsb-shell-window-bar', '')
        const title = document.createElement('strong')
        title.className = 'lsb-shell-window-title'
        title.id = titleId
        title.textContent = label
        const drag = document.createElement('span')
        drag.className = 'lsb-shell-window-drag'
        drag.setAttribute('data-lsb-shell-window-drag', '')
        drag.setAttribute('aria-hidden', 'true')
        bar.append(title, drag)
        host.prepend(bar)
      } else {
        const title = bar.querySelector('.lsb-shell-window-title')
        if (title) title.textContent = label
      }
      const ensureAction = (kind, text, aria, titleText, handler) => {
        let button = bar.querySelector(`[data-lsb-shell-window-${kind}]`)
        if (!button) {
          button = document.createElement('button')
          button.type = 'button'
          button.className = 'lsb-shell-window-action'
          button.setAttribute(`data-lsb-shell-window-${kind}`, '')
          bar.append(button)
        }
        button.setAttribute('aria-label', aria)
        button.title = titleText
        button.textContent = text
        if (!button.dataset.lsbShellBound) {
          button.dataset.lsbShellBound = '1'
          button.addEventListener('click', (event) => {
            event.preventDefault()
            handler(button)
          })
        }
        return button
      }
      ensureAction('inspect', '⋮', `打开${label}窗口检查器`, '窗口检查器', () => {
        openWindowInspector(id)
      })
      ensureAction('focus', '◎', `聚焦${label}窗口`, '聚焦窗口', () => {
        focusShellWindow(id)
        host.focus?.()
      })
      ensureAction('collapse', '−', `折叠${label}窗口`, '折叠窗口', (button) => {
        toggleShellWindowCollapsed(id, button)
      })
      ensureAction('reset', '↺', `恢复${label}窗口布局`, '恢复布局', () => {
        resetShellWindow(id)
      })
      let body = host.querySelector(':scope > [data-lsb-shell-window-body]')
      if (!body) {
        body = document.createElement('div')
        body.className = 'lsb-shell-window-body'
        body.setAttribute('data-lsb-shell-window-body', '')
        while (bar.nextSibling) body.append(bar.nextSibling)
        host.append(body)
      }
      for (const edge of ['n', 'e', 's', 'w', 'ne', 'nw', 'se', 'sw']) {
        if (host.querySelector(`:scope > [data-lsb-shell-resize-edge="${edge}"]`)) continue
        const handle = document.createElement('span')
        handle.setAttribute('data-lsb-shell-resize-edge', edge)
        handle.setAttribute('aria-label', `调整${label}窗口${edge}边界`)
        handle.setAttribute('role', 'separator')
        host.append(handle)
      }
      return { host, bar, body }
    }

    function applyShellWindowState(id, state, host = shellHost(id)) {
      if (!(host instanceof Element) || !state) return
      host.style.left = `${Math.round(state.x || 0)}px`
      host.style.top = `${Math.round(state.y || 0)}px`
      host.style.width = `${Math.max(1, Math.round(state.width || 1))}px`
      host.style.height = `${Math.max(1, Math.round(state.height || 1))}px`
      host.style.zIndex = String(8000 + Math.max(0, shellWindowLayout?.zOrder?.indexOf(id) ?? 0))
      host.hidden = state.visible === false
      host.dataset.lsbShellActive = state.visible === false ? 'false' : 'true'
      host.dataset.lsbShellWindowId = id
      host.dataset.lsbShellCollapsed = state.collapsed === true ? 'true' : 'false'
      const localGlass = !!shellStyleApi?.sanitizeTokenValue?.('glassOpacity', state.overrides?.glassOpacity)
        || !!shellStyleApi?.sanitizeTokenValue?.('glassBlur', state.overrides?.glassBlur)
      host.dataset.lsbShellGlass = cfg.glass || localGlass ? 'true' : 'false'
      const oldOverrideProps = host.__lsbShellOverrideProps || new Set()
      for (const prop of oldOverrideProps) host.style.removeProperty(prop)
      const nextOverrideProps = new Set()
      if (shellStyleApi && state.overrides && typeof state.overrides === 'object') {
        const overrideCss = shellStyleApi.tokenCss(state.overrides)
        for (const declaration of overrideCss.split(';')) {
          const index = declaration.indexOf(':')
          if (index <= 0) continue
          const prop = declaration.slice(0, index).trim()
          const value = declaration.slice(index + 1).trim()
          if (!prop.startsWith('--lsb-shell-') || !value) continue
          host.style.setProperty(prop, value)
          nextOverrideProps.add(prop)
        }
      }
      host.__lsbShellOverrideProps = nextOverrideProps
      const body = host.querySelector(':scope > [data-lsb-shell-window-body]')
      if (body) body.hidden = state.collapsed === true
      const collapse = host.querySelector(':scope > [data-lsb-shell-window-bar] [data-lsb-shell-window-collapse]')
      if (collapse) {
        collapse.textContent = state.collapsed === true ? '+' : '−'
        collapse.setAttribute('aria-label', state.collapsed === true ? '展开窗口' : '折叠窗口')
        collapse.title = state.collapsed === true ? '展开窗口' : '折叠窗口'
      }
    }

    function collectShellWindowRegistry(el = document.getElementById('lsb-shell')) {
      const externalViews = syncExternalShellWindows(el)
      const external = typeof api.ui.shellWindows === 'function'
        ? api.ui.shellWindows(asideContext())
        : []
      const records = [...BUILTIN_WINDOWS]
      for (const item of externalViews) {
        if (records.some((row) => row.id === item.id)) continue
        records.push({
          id: item.id,
          label: item.label || item.id,
          order: Number(item.order) || 100,
          min: item.min || { width: 320, height: 240 },
          defaultRect: item.defaultRect || { width: 376, height: 600 },
          view: item.view,
        })
      }
      for (const view of external) {
        const id = String(view.windowId || view.id || '')
        if (!id || records.some((row) => row.id === id)) continue
        records.push({
          id,
          label: view.label || id,
          order: Number(view.order) || 100,
          min: view.min || { width: 240, height: 160 },
          defaultRect: view.defaultRect || { width: 320, height: 480 },
          view,
        })
      }
      shellWindowRegistry = records.filter((row) => shellHost(row.id, el))
      return shellWindowRegistry
    }

    function applyShellWindowLayout(layout = shellWindowLayout) {
      if (!layout) return
      for (const [id, state] of Object.entries(layout.windows || {})) applyShellWindowState(id, state)
      const workspace = shellWorkspace()
      if (workspace) workspace.dataset.lsbShellBucket = shellLayoutApi.widthBucket(shellViewport(workspace).width)
    }

    function syncExternalShellWindows(el = document.getElementById('lsb-shell')) {
      const workspace = shellWorkspace(el)
      if (!(workspace instanceof Element)) return []
      const context = asideContext()
      const asideRecords = api.ui.shellAsideViews(context)
        .filter((view) => view.windowId && view.windowId !== 'site')
        .map((view) => ({
          id: String(view.windowId),
          label: view.label || view.windowId,
          order: Number(view.order) || 100,
          min: view.min || { width: 320, height: 240 },
          defaultRect: view.defaultRect || { width: 376, height: 600 },
          view,
        }))
      const registered = typeof api.ui.shellWindows === 'function' ? api.ui.shellWindows(context) : []
      const records = [...asideRecords, ...registered.map((view) => ({
        id: String(view.windowId || view.id),
        label: view.label || view.id,
        order: Number(view.order) || 100,
        min: view.min || { width: 320, height: 240 },
        defaultRect: view.defaultRect || { width: 376, height: 600 },
        view,
      }))]
      const next = new Map()
      for (const record of records) {
        if (!record.id || next.has(record.id)) continue
        const host = shellHost(record.id, el) || (() => {
          const section = document.createElement('section')
          section.setAttribute('data-lsb-shell-window', record.id)
          workspace.append(section)
          return section
        })()
        ensureWindowChrome(host, record.id, record.label)
        const body = host.querySelector(':scope > [data-lsb-shell-window-body]')
        let current = externalWindowViews.get(record.id)
        if (!current || current.view !== record.view) {
          current?.dispose?.()
          body?.replaceChildren()
          let dispose = null
          try { dispose = record.view?.render?.(body, context) } catch (error) {
            if (body) body.textContent = '窗口加载失败'
            console.error('[LSB skin] 外部窗口渲染失败', record.id, error)
          }
          current = { ...record, host, body, dispose: typeof dispose === 'function' ? dispose : null }
        } else {
          current.host = host
          current.body = body
        }
        host.dataset.lsbShellExternal = 'true'
        host.dataset.lsbShellOpen = record.view?.windowId ? (record.view.id === asideActiveId ? 'true' : 'false') : 'true'
        next.set(record.id, current)
      }
      for (const [id, current] of externalWindowViews) {
        if (next.has(id)) continue
        try { current.dispose?.() } catch (error) { console.error('[LSB skin] 外部窗口清理失败', id, error) }
        current.host?.remove?.()
      }
      externalWindowViews.clear()
      for (const [id, current] of next) externalWindowViews.set(id, current)
      return [...next.values()]
    }

    function focusShellWindow(id, { persist = true } = {}) {
      const wanted = String(id || '')
      if (!shellWindowLayout?.windows?.[wanted]) return ''
      shellWindowLayout.zOrder = [...(shellWindowLayout.zOrder || []).filter((item) => item !== wanted), wanted]
      applyShellWindowLayout(shellWindowLayout)
      if (persist) saveShellLayout()
      return wanted
    }

    function toggleShellWindowCollapsed(id, button = null) {
      const wanted = String(id || '')
      const current = shellWindowLayout?.windows?.[wanted]
      if (!current) return null
      current.collapsed = !current.collapsed
      applyShellWindowLayout(shellWindowLayout)
      if (button) button.focus?.()
      saveShellLayout({ immediate: true })
      return current.collapsed
    }

    function arrangeShellWindows() {
      if (!shellWindowLayout || !shellLayoutApi) return null
      const workspace = shellWorkspace()
      shellWindowLayout = shellLayoutApi.arrangeShellWindows(shellWindowLayout, shellWindowRegistry, shellViewport(workspace))
      applyShellWindowLayout(shellWindowLayout)
      saveShellLayout({ immediate: true })
      return structuredCloneSafe(shellWindowLayout)
    }

    function resetShellWindow(id) {
      if (!shellWindowLayout || !shellLayoutApi) return null
      const wanted = String(id || '')
      const workspace = shellWorkspace()
      const defaults = shellLayoutApi.defaultShellLayout({ ...shellViewport(workspace), registry: shellWindowRegistry })
      if (wanted && shellWindowLayout.windows[wanted] && defaults.windows[wanted]) {
        shellWindowLayout.windows[wanted] = defaults.windows[wanted]
      } else if (!wanted) {
        shellWindowLayout = defaults
      }
      applyShellWindowLayout(shellWindowLayout)
      saveShellLayout({ immediate: true })
      return structuredCloneSafe(shellWindowLayout)
    }

    function openWindowInspector(id) {
      const wanted = String(id || '')
      const current = shellWindowLayout?.windows?.[wanted]
      const host = shellHost(wanted)
      if (!current || !(host instanceof Element)) return null
      document.querySelector('[data-lsb-shell-window-inspector]')?.remove()
      const mask = document.createElement('div')
      mask.setAttribute('data-lsb-shell-window-inspector', '')
      mask.setAttribute('role', 'dialog')
      mask.setAttribute('aria-modal', 'true')
      mask.style.cssText = 'position:fixed;inset:0;z-index:9000;display:flex;align-items:center;justify-content:center;background:rgb(0 0 0 / 28%);padding:16px;'
      const panel = document.createElement('div')
      panel.style.cssText = 'width:min(360px,92vw);max-height:90vh;overflow:auto;background:var(--panel,#fff);color:var(--text,#222);border:1px solid var(--line,#ddd);border-radius:12px;padding:16px;box-shadow:0 18px 48px rgb(0 0 0 / 24%);'
      const title = document.createElement('h2')
      title.textContent = `${host.querySelector('.lsb-shell-window-title')?.textContent || wanted}窗口检查器`
      title.style.cssText = 'font-size:16px;margin:0 0 12px;'
      panel.append(title)
      const fields = new Map()
      const styleModel = shellStyleApi?.moduleInspectorModel?.(shellWindowLayout, wanted) || { values: {}, inherited: {} }
      const overrideNames = ['fontFamily', 'baseFontSize', 'glassOpacity', 'glassBlur']
      const addField = (name, labelText, type = 'text', value = '', step = '') => {
        const label = document.createElement('label')
        label.style.cssText = 'display:flex;align-items:center;gap:8px;margin:8px 0;font-size:13px;'
        const text = document.createElement('span')
        text.textContent = labelText
        const input = document.createElement('input')
        input.type = type
        input.setAttribute('data-lsb-shell-inspector-field', name)
        if (type === 'number' && step) input.step = step
        input.value = value ?? ''
        input.style.cssText = 'flex:1;min-width:0;'
        label.append(text, input)
        panel.append(label)
        fields.set(name, input)
      }
      const visible = document.createElement('label')
      visible.style.cssText = 'display:flex;gap:8px;align-items:center;margin:8px 0;font-size:13px;'
      const visibleInput = document.createElement('input')
      visibleInput.type = 'checkbox'
      visibleInput.checked = current.visible !== false
      const visibleText = document.createElement('span')
      visibleText.textContent = '显示窗口'
      visible.append(visibleInput, visibleText)
      panel.append(visible)
      const collapsed = document.createElement('label')
      collapsed.style.cssText = visible.style.cssText
      const collapsedInput = document.createElement('input')
      collapsedInput.type = 'checkbox'
      collapsedInput.checked = current.collapsed === true
      const collapsedText = document.createElement('span')
      collapsedText.textContent = '折叠窗口'
      collapsed.append(collapsedInput, collapsedText)
      panel.append(collapsed)
      addField('width', '宽度', 'number', current.width)
      addField('height', '高度', 'number', current.height)
      const inspectorField = (name, labelText, type = 'text', step = '') => {
        const raw = current.overrides?.[name] ?? styleModel.values?.[name] ?? ''
        const value = type === 'number' ? String(raw).replace(/px$/i, '') : raw
        addField(name, labelText, type, value, step)
      }
      inspectorField('fontFamily', '局部字体')
      inspectorField('baseFontSize', '局部字号', 'number', '1')
      inspectorField('glassOpacity', '局部透明度', 'number', '0.01')
      inspectorField('glassBlur', '局部玻璃模糊', 'number', '1')
      const inherit = document.createElement('label')
      inherit.style.cssText = visible.style.cssText
      const inheritInput = document.createElement('input')
      inheritInput.type = 'checkbox'
      inheritInput.checked = overrideNames.every((name) => styleModel.inherited?.[name] !== false)
      const inheritText = document.createElement('span')
      inheritText.textContent = '局部样式继承全局'
      inherit.append(inheritInput, inheritText)
      panel.append(inherit)
      for (const name of overrideNames) {
        fields.get(name)?.addEventListener('input', () => {
          if (String(fields.get(name).value || '').trim()) inheritInput.checked = false
        })
      }
      const actions = document.createElement('div')
      actions.style.cssText = 'display:flex;justify-content:flex-end;gap:8px;margin-top:14px;'
      const cancel = document.createElement('button')
      cancel.type = 'button'
      cancel.textContent = '取消'
      const save = document.createElement('button')
      save.type = 'button'
      save.textContent = '保存'
      save.className = 'lsb-btn is-primary'
      actions.append(cancel, save)
      panel.append(actions)
      mask.append(panel)
      document.body.append(mask)
      const close = () => mask.remove()
      cancel.addEventListener('click', close)
      mask.addEventListener('click', (event) => { if (event.target === mask) close() })
      save.addEventListener('click', () => {
        const next = { ...current }
        next.visible = visibleInput.checked
        next.collapsed = collapsedInput.checked
        next.width = Number(fields.get('width').value)
        next.height = Number(fields.get('height').value)
        const overrides = { ...(current.overrides || {}) }
        for (const name of overrideNames) {
          if (inheritInput.checked || !String(fields.get(name).value || '').trim()) delete overrides[name]
          else overrides[name] = fields.get(name).value
        }
        next.overrides = overrides
        shellWindowLayout.windows[wanted] = next
        shellWindowLayout = shellLayoutApi.sanitizeShellLayout(shellWindowLayout, {
          ...shellViewport(shellWorkspace()),
          registry: shellWindowRegistry,
        })
        applyShellWindowLayout(shellWindowLayout)
        saveShellLayout({ immediate: true })
        syncResponsiveMode()
        close()
      })
      panel.querySelector('input')?.focus?.()
      return mask
    }

    function windowBounds() {
      return shellLayoutApi
        ? { x: 0, y: 0, ...shellViewport(shellWorkspace()) }
        : { x: 0, y: 0, width: Number(window.innerWidth || 1), height: Number(window.innerHeight || 1) }
    }

    function windowMin(id) {
      return shellWindowRegistry.find((item) => item.id === id)?.min || { width: 240, height: 160 }
    }

    function windowOthers(id) {
      return Object.entries(shellWindowLayout?.windows || {})
        .filter(([otherId, state]) => otherId !== id && state?.visible !== false)
        .map(([, state]) => state)
    }

    function interactionEventPosition(event) {
      return { x: Number(event.clientX || 0), y: Number(event.clientY || 0) }
    }

    function interactionNextRect(state, { snap = false } = {}) {
      const dx = state.last.x - state.start.x
      const dy = state.last.y - state.start.y
      const next = { ...state.origin }
      if (state.kind === 'drag') {
        next.x += dx
        next.y += dy
      } else {
        const edge = state.edge
        if (edge.includes('w')) {
          next.x += dx
          next.width -= dx
        }
        if (edge.includes('e')) next.width += dx
        if (edge.includes('n')) {
          next.y += dy
          next.height -= dy
        }
        if (edge.includes('s')) next.height += dy
      }
      return shellLayoutApi.snapRect(next, {
        bounds: windowBounds(),
        others: windowOthers(state.id),
        min: windowMin(state.id),
        grid: snap ? undefined : 1,
        threshold: snap ? undefined : 0,
      })
    }

    function flushWindowInteraction() {
      const state = windowInteractionState
      windowInteractionRaf = 0
      if (!state || !shellWindowLayout?.windows?.[state.id]) return
      const next = interactionNextRect(state)
      state.pending = next
      if (state.kind === 'drag') {
        state.host.style.transform = `translate3d(${next.x - state.origin.x}px,${next.y - state.origin.y}px,0)`
      } else {
        state.host.style.left = `${next.x}px`
        state.host.style.top = `${next.y}px`
        state.host.style.width = `${next.width}px`
        state.host.style.height = `${next.height}px`
      }
    }

    function scheduleWindowInteraction() {
      if (windowInteractionRaf) return
      const raf = window.requestAnimationFrame || ((fn) => window.setTimeout(fn, 0))
      windowInteractionRaf = raf(flushWindowInteraction)
    }

    function endWindowInteraction(event) {
      const state = windowInteractionState
      if (!state) return
      if (event?.type === 'pointerup' && Number.isFinite(event.clientX) && Number.isFinite(event.clientY)) {
        state.last = interactionEventPosition(event)
      }
      if (windowInteractionRaf) {
        const cancel = window.cancelAnimationFrame || window.clearTimeout
        cancel(windowInteractionRaf)
        windowInteractionRaf = 0
      }
      flushWindowInteraction()
      const finalRect = state.pending ? interactionNextRect(state, { snap: true }) : state.origin
      const current = shellWindowLayout?.windows?.[state.id]
      if (current) shellWindowLayout.windows[state.id] = { ...current, ...finalRect }
      state.host.style.transform = ''
      delete state.host.dataset.lsbShellInteracting
      applyShellWindowLayout(shellWindowLayout)
      saveShellLayout({ immediate: true })
      window.removeEventListener('pointermove', onWindowPointerMove)
      window.removeEventListener('pointerup', endWindowInteraction)
      window.removeEventListener('pointercancel', endWindowInteraction)
      try { state.captureTarget?.releasePointerCapture?.(state.pointerId) } catch { /* jsdom/旧浏览器没有 pointer capture */ }
      windowInteractionState = null
    }

    function onWindowPointerMove(event) {
      if (!windowInteractionState) return
      windowInteractionState.last = interactionEventPosition(event)
      scheduleWindowInteraction()
    }

    function beginWindowInteraction(event, host, id, kind, edge = '') {
      if (event.button != null && event.button !== 0) return
      const current = shellWindowLayout?.windows?.[id]
      if (!current) return
      event.preventDefault()
      focusShellWindow(id, { persist: false })
      const point = interactionEventPosition(event)
      windowInteractionState = {
        id,
        host,
        kind,
        edge,
        start: point,
        last: point,
        origin: { x: current.x, y: current.y, width: current.width, height: current.height },
        pending: null,
        pointerId: event.pointerId,
        captureTarget: event.currentTarget,
      }
      host.dataset.lsbShellInteracting = kind
      try { event.currentTarget?.setPointerCapture?.(event.pointerId) } catch { /* jsdom/旧浏览器没有 pointer capture */ }
      window.addEventListener('pointermove', onWindowPointerMove)
      window.addEventListener('pointerup', endWindowInteraction, { once: false })
      window.addEventListener('pointercancel', endWindowInteraction, { once: false })
    }

    function keyWindowHost(event) {
      const target = event?.target
      if (target?.closest) {
        const fromTarget = target.closest('[data-lsb-shell-window]')
        if (fromTarget) return fromTarget
      }
      const active = document.activeElement
      return active?.closest?.('[data-lsb-shell-window]') || null
    }

    function onWindowKeyDown(event) {
      const host = keyWindowHost(event)
      if (!(host instanceof Element)) return
      const id = host.getAttribute('data-lsb-shell-window') || ''
      if (!shellWindowLayout?.windows?.[id]) return
      if (event.key === 'Escape') {
        if (windowInteractionState) {
          event.preventDefault()
          endWindowInteraction()
        }
        return
      }
      if (!['ArrowLeft', 'ArrowRight', 'ArrowUp', 'ArrowDown'].includes(event.key)) return
      const target = event.target
      if (target?.matches?.('input, textarea, select, button, a, [contenteditable="true"]')) return
      const current = shellWindowLayout.windows[id]
      const step = 12
      const next = { ...current }
      if (event.shiftKey) {
        if (event.key === 'ArrowLeft') { next.x += step; next.width -= step }
        if (event.key === 'ArrowRight') next.width += step
        if (event.key === 'ArrowUp') { next.y += step; next.height -= step }
        if (event.key === 'ArrowDown') next.height += step
      } else {
        if (event.key === 'ArrowLeft') next.x -= step
        if (event.key === 'ArrowRight') next.x += step
        if (event.key === 'ArrowUp') next.y -= step
        if (event.key === 'ArrowDown') next.y += step
      }
      const clean = shellLayoutApi.snapRect(next, {
        bounds: windowBounds(),
        others: windowOthers(id),
        min: windowMin(id),
      })
      event.preventDefault()
      focusShellWindow(id)
      shellWindowLayout.windows[id] = { ...current, ...clean }
      applyShellWindowLayout(shellWindowLayout)
      saveShellLayout()
    }

    function syncResponsiveMode(el = document.getElementById('lsb-shell')) {
      if (!(el instanceof Element) || !shellWindowEnabled()) return
      const workspace = shellWorkspace(el)
      const viewport = shellViewport(workspace)
      const width = viewport.width
      const bucket = shellLayoutApi.widthBucket(width)
      const key = shellLayoutStorageKey(viewport)
      if (shellWindowLayout && shellLayoutKey && key !== shellLayoutKey) {
        saveShellLayout({ immediate: true })
        shellWindowLayout = loadShellLayout(viewport)
        shellWindowLayout = ensureRegisteredShellLayout(shellWindowLayout, viewport)
        applyShellWindowLayout(shellWindowLayout)
      } else if (shellWindowLayout) {
        shellWindowLayout = shellLayoutApi.sanitizeShellLayout(shellWindowLayout, {
          ...viewport,
          registry: shellWindowRegistry,
        })
        applyShellWindowLayout(shellWindowLayout)
      }
      el.dataset.lsbShellBucket = bucket
      const switcher = el.querySelector('[data-lsb-shell-window-switcher]')
      if (switcher) {
        switcher.replaceChildren()
        for (const item of shellWindowRegistry) {
          const button = document.createElement('button')
          button.type = 'button'
          button.setAttribute('role', 'tab')
          button.setAttribute('data-lsb-shell-window-switch', item.id)
          button.setAttribute('aria-controls', shellHost(item.id, el)?.id || `lsb-shell-window-${item.id}`)
          button.textContent = item.label
          button.addEventListener('click', () => {
            narrowActiveWindow = item.id
            const external = externalWindowViews.get(item.id)
            if (external?.view?.id) asideSetActive(external.view.id, el.querySelector('#lsb-shell-aside'), true)
            focusShellWindow(item.id)
            syncResponsiveMode(el)
          })
          switcher.append(button)
        }
      }
      const available = shellWindowRegistry.filter((item) => shellWindowLayout?.windows?.[item.id]?.visible !== false)
      if (!available.some((item) => item.id === narrowActiveWindow)) narrowActiveWindow = available[0]?.id || 'content'
      for (const item of shellWindowRegistry) {
        const host = shellHost(item.id, el)
        if (!(host instanceof Element)) continue
        const active = bucket !== 'narrow' || item.id === narrowActiveWindow
        host.dataset.lsbShellActive = active ? 'true' : 'false'
        const tab = switcher?.querySelector(`[data-lsb-shell-window-switch="${item.id}"]`)
        if (tab) tab.setAttribute('aria-selected', active ? 'true' : 'false')
      }
    }

    function bindWindowInteractions(el = document.getElementById('lsb-shell')) {
      if (!(el instanceof Element) || !shellWindowEnabled()) return
      for (const item of shellWindowRegistry) {
        const host = shellHost(item.id, el)
        if (!(host instanceof Element)) continue
        if (host.dataset.lsbShellWindowInteractionsBound !== '1') {
          host.dataset.lsbShellWindowInteractionsBound = '1'
          const bar = host.querySelector(':scope > [data-lsb-shell-window-bar]')
          bar?.addEventListener('pointerdown', (event) => {
            if (event.target.closest?.('[data-lsb-shell-window-action], [data-lsb-shell-resize-edge], input, textarea, select, button, a')) return
            beginWindowInteraction(event, host, item.id, 'drag')
          })
          host.addEventListener('pointerdown', (event) => {
            if (event.target.closest?.('[data-lsb-shell-window-action], [data-lsb-shell-window-bar], [data-lsb-shell-resize-edge], input, textarea, button, a')) return
            focusShellWindow(item.id)
            if (event.currentTarget === host && event.target === host) host.focus?.()
          })
          host.addEventListener('focus', () => focusShellWindow(item.id))
          for (const handle of host.querySelectorAll('[data-lsb-shell-resize-edge]')) {
            handle.addEventListener('pointerdown', (event) => beginWindowInteraction(event, host, item.id, 'resize', handle.getAttribute('data-lsb-shell-resize-edge') || 'se'))
          }
        }
      }
      if (!windowInteractionBound) {
        windowInteractionBound = true
        window.addEventListener('keydown', onWindowKeyDown)
        if (!responsiveBound) {
          responsiveBound = true
          responsiveHandler = () => syncResponsiveMode(el)
          window.addEventListener('resize', responsiveHandler)
        }
      }
    }

    function unbindWindowInteractions() {
      endWindowInteraction()
      windowInteractionBound = false
      window.removeEventListener('keydown', onWindowKeyDown)
      if (responsiveBound) {
        responsiveBound = false
        if (responsiveHandler) window.removeEventListener('resize', responsiveHandler)
        responsiveHandler = null
      }
    }

    function isNativeSidebarNode(node) {
      return node instanceof Element
        && node.matches('aside.sidebar')
        && node.id !== 'mobile-menu-drawer'
        && !node.classList.contains('mobile-menu-drawer')
    }

    function detachNativeSidebars(outlet) {
      if (!(outlet instanceof Element)) return
      for (const side of [...outlet.querySelectorAll('aside.sidebar')].filter(isNativeSidebarNode)) {
        if (!nativeSidebarHomes.has(side)) {
          nativeSidebarHomes.set(side, { parent: side.parentNode, next: side.nextSibling })
        }
        if (side.parentNode !== document.body) document.body.append(side)
      }
      for (const rail of nativeLeftRails(outlet)) {
        if (!nativeSidebarHomes.has(rail)) {
          nativeSidebarHomes.set(rail, { parent: rail.parentNode, next: rail.nextSibling })
        }
        rail.classList.add('lsb-native-left-hidden')
        if (rail.parentNode !== document.body) document.body.append(rail)
      }
    }

    function restoreDetachedNativeSidebars() {
      for (const [side, home] of nativeSidebarHomes) {
        const parent = home?.parent
        if (parent instanceof Node && parent.isConnected && side.parentNode !== parent) {
          try {
            parent.insertBefore(side, home.next && home.next.parentNode === parent ? home.next : null)
          } catch {
            try { parent.append(side) } catch { /* stale route node */ }
          }
        }
      }
      nativeSidebarHomes.clear()
    }

    function syncShellScrollBridge(root = null) {
      const next = root instanceof Element ? root : null
      if (scrollBridge?.root === next) return
      scrollBridge?.dispose?.()
      scrollBridge = null
      if (!next || typeof api.ui.shellScrollBridge !== 'function') return
      try {
        scrollBridge = api.ui.shellScrollBridge({ windowRef: window, root: next })
      } catch {
        scrollBridge = null
      }
    }

    function mountContentWindow(el = document.getElementById('lsb-shell')) {
      const content = shellHost('content', el)
      const body = content?.querySelector?.('[data-lsb-shell-window-body]')
      if (!(content instanceof Element) || !(body instanceof Element)) return
      const outlet = findRouteOutlet()
      if (!(outlet instanceof Element)) return
      if (contentOutlet && contentOutlet !== outlet) restoreDetachedNativeSidebars()
      if (!contentHome) contentHome = { parent: outlet.parentNode, next: outlet.nextSibling }
      contentOutlet = outlet
      detachNativeSidebars(outlet)
      if (outlet.parentNode !== body) body.append(outlet)
      contentScroller = body
      syncShellScrollBridge(body)
    }

    function mountShellWindows(el = document.getElementById('lsb-shell')) {
      if (!(el instanceof Element) || !shellWindowEnabled()) return
      const workspace = shellWorkspace(el)
      if (!(workspace instanceof Element)) return
      const nav = shellHost('nav', el)
      const site = shellHost('site', el)
      const content = shellHost('content', el)
      ensureWindowChrome(nav, 'nav', '导航')
      ensureWindowChrome(site, 'site', '站点')
      ensureWindowChrome(content, 'content', '正文')
      mountContentWindow(el)
      collectShellWindowRegistry(el)
      const viewport = shellViewport(workspace)
      const key = shellLayoutStorageKey(viewport)
      if (shellWindowLayout && shellLayoutKey === key) {
        shellWindowLayout = shellLayoutApi.sanitizeShellLayout(shellWindowLayout, { ...viewport, registry: shellWindowRegistry })
      } else {
        if (shellWindowLayout && shellLayoutKey && shellLayoutKey !== key) saveShellLayout({ immediate: true })
        shellWindowLayout = loadShellLayout(viewport)
      }
      shellWindowLayout = ensureRegisteredShellLayout(shellWindowLayout, viewport)
      applyShellWindowLayout(shellWindowLayout)
      el.dataset.lsbShellMode = 'windowed'
      if (content) content.dataset.lsbShellActive = 'true'
      syncResponsiveMode(el)
      bindWindowInteractions(el)
    }

    function unmountShellWindows() {
      saveShellLayout({ immediate: true })
      window.clearTimeout(shellLayoutSaveTimer)
      shellLayoutSaveTimer = 0
      restoreDetachedNativeSidebars()
      const outlet = contentOutlet
      if (outlet && contentHome?.parent) {
        try {
          contentHome.parent.insertBefore(outlet, contentHome.next && contentHome.next.parentNode === contentHome.parent ? contentHome.next : null)
        } catch {
          document.body.append(outlet)
        }
      }
      contentHome = null
      contentOutlet = null
      contentScroller = null
      syncShellScrollBridge()
      shellWindowLayout = null
      shellWindowRegistry = []
      shellLayoutKey = ''
    }

    /* ── M17 单一阅读画布 ─────────────────────────────────────────────── */
    function canvasPageType() {
      const type = String(api.page?.type || '')
      if (['home', 'forum', 'topic', 'user', 'settings'].includes(type)) return type
      const path = pagePath()
      if (path === '/' || path === '/index.php') return 'home'
      if (/^\/forum\/\d+/.test(path) || /^\/category\/\d+/.test(path)) return 'forum'
      if (/^\/topic\/\d+/.test(path)) return 'topic'
      if (/^\/user(?:\/|$)/.test(path)) return 'user'
      if (/settings|preferences|config/i.test(path)) return 'settings'
      return 'page'
    }

    function canvasApplyPageClass() {
      const root = document.documentElement
      for (const name of ['home', 'forum', 'topic', 'user', 'settings', 'page']) root.classList.remove(`lsb-canvas-page-${name}`)
      const pageType = canvasPageType()
      root.classList.add(`lsb-canvas-page-${pageType}`)
      const outlet = findRouteOutlet()
      outlet?.classList.toggle('lsb-canvas-content-root', true)
      canvasSiteKey = siteKeyFromLocation(location)
      canvasWidthClass = widthClass(canvasViewport().width)
      if (canvasState) canvasEffective = mergeCanvasState(canvasState, canvasState.sites?.[canvasSiteKey] || {})
      if (canvasScrollBound) canvasSyncScrollTarget()
    }

    function canvasSurface(id) {
      const wanted = String(id || '')
      if (!wanted) return null
      return canvasSurfaceHost?.querySelector?.(`[data-surface="${wanted.replace(/"/g, '')}"]`) || null
    }

    function canvasSetBackdrop(visible) {
      const backdrop = canvasSurfaceHost?.querySelector?.('[data-canvas-backdrop]')
      if (!(backdrop instanceof HTMLElement)) return
      backdrop.hidden = !visible
      backdrop.setAttribute('aria-hidden', String(!visible))
    }

    function canvasFocusFirst(surface) {
      if (!(surface instanceof Element)) return
      const target = surface.querySelector('button:not([disabled]),a[href],input,textarea,select,[tabindex]:not([tabindex="-1"])')
      target?.focus?.()
    }

    function canvasCloseSurface(id = canvasActiveSheet, restore = true) {
      if (id === 'site-card' && canvasWidthClass === 'wide') {
        const host = canvasSurface('site-status')?.querySelector('[data-canvas-site-status-host]')
        canvasSiteStatusSetExpanded(host, false, false)
        if (canvasActiveSheet === id) canvasActiveSheet = ''
        if (!canvasActiveSheet) canvasSetBackdrop(false)
        const trigger = canvasFocusReturn
        canvasFocusReturn = null
        if (restore && trigger?.isConnected) trigger.focus?.()
        return
      }
      const surface = canvasSurface(id)
      if (surface) {
        surface.setAttribute('data-canvas-surface-state', 'closing')
        surface.hidden = true
        surface.setAttribute('aria-hidden', 'true')
        surface.setAttribute('data-canvas-surface-state', 'closed')
      }
      if (canvasActiveSheet === id) canvasActiveSheet = ''
      if (!canvasActiveSheet) canvasSetBackdrop(false)
      if (id === 'site-card') canvasRestoreSiteSidebar({ restorePersistent: true })
      // @LSB_DEV_AI_START
      if (id === 'ai-card') {
        surface?.removeAttribute?.('data-canvas-ai-requested')
        try { document.dispatchEvent(new CustomEvent('lsb:canvas-ai-close', { detail: { host: surface?.querySelector?.('[data-canvas-ai-host]') || null } })) } catch { /* optional bridge */ }
      }
      // @LSB_DEV_AI_END
      const trigger = canvasFocusReturn
      canvasFocusReturn = null
      if (restore && trigger?.isConnected) trigger.focus?.()
    }

    function closePluginMenuSurfaces() {
      for (const id of ['plugin-features-sheet', 'plugin-settings-sheet', 'tool-sheet']) {
        canvasCloseSurface(id, false)
      }
    }

    function openPluginFeature(pluginId) {
      const entry = collectPluginFeatureEntries().find((item) => item.plugin === pluginId)
      closePluginMenuSurfaces()
      if (!entry) {
        api.ui.toast('这个插件功能当前不可用', { type: 'info' })
        return
      }
      if (entry.panel) {
        api.ui.openPanel(entry.panel)
        return
      }
      try {
        Promise.resolve(api.request(entry.rpc)).catch(() => {
          api.ui.toast('插件功能打开失败', { type: 'error' })
        })
      } catch {
        api.ui.toast('插件功能打开失败', { type: 'error' })
      }
    }

    function openPluginSettings(pluginId) {
      const available = collectPluginSettingsEntries().some((item) => item.id === pluginId)
      closePluginMenuSurfaces()
      if (!available) {
        api.ui.toast('这个插件没有可用的设置表单', { type: 'info' })
        return
      }
      try {
        api.ui.openPluginSettings(pluginId)
      } catch {
        api.ui.toast('插件设置当前不可用', { type: 'error' })
      }
    }

    function canvasCloseContextPill(restore = false) {
      const pill = canvasSurface('context-pill')
      if (pill) {
        pill.setAttribute('data-canvas-surface-state', 'closing')
        pill.hidden = true
        pill.setAttribute('aria-hidden', 'true')
        pill.setAttribute('data-canvas-surface-state', 'closed')
      }
      canvasSelectionPost = null
      canvasSelectionText = ''
      if (canvasSelectionDismissTimer) {
        window.clearTimeout(canvasSelectionDismissTimer)
        canvasSelectionDismissTimer = 0
      }
      if (restore && canvasFocusReturn?.isConnected) canvasFocusReturn.focus?.()
    }

    function canvasNativeAction(action) {
      const post = canvasSelectionPost
      const text = canvasSelectionText
      if (!(post instanceof Element)) return
      const clickFirst = (selectors) => {
        for (const selector of selectors) {
          const target = post.querySelector(selector) || document.querySelector(selector)
          if (target instanceof HTMLElement || target instanceof SVGElement) {
            target.click?.()
            target.focus?.()
            return true
          }
        }
        return false
      }
      if (action === 'reply') {
        clickFirst(['.reply-box', '.post-reply', '[data-reply-action]'])
          || clickFirst(['.reply-panel textarea[name="body"]', '.reply-panel textarea', 'textarea[name="body"]', '.btn-post[href="#reply"]'])
      } else if (action === 'quote') {
        clickFirst(['.quote-reply', '[data-quote-action]', 'a[href="#reply"]'])
      } else if (action === 'favorite') {
        clickFirst(['.favorite-action', '[data-favorite-action]', '.topic-favorites-action .fav-btn', '.topic-favorites-action button'])
      } else if (action === 'copy' && text) {
        try {
          const clipboard = navigator.clipboard
          if (clipboard?.writeText) void clipboard.writeText(text)
          else {
            const area = document.createElement('textarea')
            area.value = text
            area.setAttribute('aria-hidden', 'true')
            area.style.cssText = 'position:fixed;left:-9999px;top:0'
            document.body.append(area)
            area.select()
            document.execCommand?.('copy')
            area.remove()
          }
          api.ui.toast?.('已复制选中文本', { type: 'success' })
        } catch {
          api.ui.toast?.('复制失败，请手动选择文本', { type: 'error' })
        }
      }
    }

    function canvasShowContextPill(post, range) {
      const pill = canvasSurface('context-pill')
      if (!(pill instanceof Element) || !(post instanceof Element)) return
      const text = String(window.getSelection?.()?.toString?.() || '').trim()
      if (!text) return canvasCloseContextPill()
      const rect = range?.getBoundingClientRect?.() || post.getBoundingClientRect?.()
      canvasSelectionPost = post
      canvasSelectionText = text.slice(0, 2000)
      pill.hidden = false
      pill.setAttribute('aria-hidden', 'false')
      canvasZIndex += 1
      pill.style.zIndex = String(8020 + canvasZIndex)
      const viewport = canvasViewport()
      const width = Math.min(260, Math.max(180, pill.getBoundingClientRect?.().width || 220))
      const height = Math.max(36, pill.getBoundingClientRect?.().height || 42)
      const x = Math.min(Math.max(8, Number(rect?.left || 0)), Math.max(8, viewport.width - width - 8))
      const y = Math.min(Math.max(8, Number(rect?.bottom || 0) + 8), Math.max(8, viewport.height - height - 8))
      pill.style.left = `${Math.round(x)}px`
      pill.style.top = `${Math.round(y)}px`
      pill.style.right = 'auto'
      pill.style.bottom = 'auto'
      if (canvasSelectionDismissTimer) window.clearTimeout(canvasSelectionDismissTimer)
      canvasSelectionDismissTimer = window.setTimeout(() => {
        canvasSelectionDismissTimer = 0
        if (!pill.matches(':focus-within')) canvasCloseContextPill()
      }, 8000)
    }

    function canvasSelectionSync() {
      if (!canvasSurfaceHost || canvasActiveSheet === 'context-pill') return
      const selection = window.getSelection?.()
      const text = String(selection?.toString?.() || '').trim()
      const node = selection?.anchorNode
      const post = node?.nodeType === 1 ? node.closest?.('.post-entry, .post-item') : node?.parentElement?.closest?.('.post-entry, .post-item')
      if (!text || !(post instanceof Element) || !document.documentElement.contains(post)) {
        if (!canvasSurface('context-pill')?.matches(':focus-within')) canvasCloseContextPill()
        return
      }
      canvasShowContextPill(post, selection.getRangeAt?.(0))
    }

    function canvasBindSelection() {
      if (canvasSelectionBound) return
      canvasSelectionBound = true
      canvasSelectionHandler = () => {
        const raf = window.requestAnimationFrame || ((fn) => window.setTimeout(fn, 0))
        raf(canvasSelectionSync)
      }
      document.addEventListener('selectionchange', canvasSelectionHandler, { passive: true })
      document.addEventListener('pointerup', canvasSelectionHandler, { passive: true })
    }

    function canvasUnbindSelection() {
      if (!canvasSelectionBound) return
      canvasSelectionBound = false
      if (canvasSelectionHandler) {
        document.removeEventListener('selectionchange', canvasSelectionHandler)
        document.removeEventListener('pointerup', canvasSelectionHandler)
      }
      canvasSelectionHandler = null
      canvasCloseContextPill()
    }

    function canvasOpenSurface(id, trigger = null) {
      const wanted = String(id || '')
      if (wanted === 'site-card' && canvasWidthClass === 'wide') return canvasOpenSiteStatus(trigger)
      const surface = canvasSurface(wanted)
      if (!(surface instanceof Element)) return null
      if (wanted === 'plugin-features-sheet') renderPluginFeatureEntries()
      if (wanted === 'plugin-settings-sheet') renderPluginSettingsEntries()
      if (wanted !== 'context-pill') canvasCloseContextPill()
      if (canvasActiveSheet && canvasActiveSheet !== wanted) canvasCloseSurface(canvasActiveSheet, false)
      canvasFocusReturn = trigger instanceof Element ? trigger : (document.activeElement instanceof Element ? document.activeElement : null)
      surface.hidden = false
      surface.setAttribute('aria-hidden', 'false')
      surface.setAttribute('data-canvas-surface-state', 'opening')
      canvasActiveSheet = wanted
      const isPersistentRail = wanted === 'site-card' && surface.dataset.surfaceMode === 'rail'
      if (wanted !== 'context-pill') canvasSetBackdrop(!isPersistentRail)
      if (wanted === 'site-card') canvasSyncSiteSidebar(surface)
      canvasZIndex += 1
      surface.style.zIndex = String(8010 + canvasZIndex)
      // @LSB_DEV_AI_START
      if (wanted === 'ai-card') {
        surface.setAttribute('data-canvas-ai-requested', 'true')
        try {
          document.dispatchEvent(new CustomEvent('lsb:canvas-ai-open', {
            detail: { host: surface.querySelector('[data-canvas-ai-host]'), viewContext: { route: api.page, siteKey: canvasSiteKey } },
          }))
        } catch { /* optional bridge */ }
      }
      // @LSB_DEV_AI_END
      canvasFocusFirst(surface)
      const raf = window.requestAnimationFrame || ((fn) => window.setTimeout(fn, 0))
      raf(() => {
        if (surface.hidden || surface.getAttribute('aria-hidden') !== 'false') return
        surface.setAttribute('data-canvas-surface-state', 'open')
      })
      return surface
    }

    // @LSB_DEV_AI_START
    function canvasInvokeAiConsole(trigger = null) {
      const link = document.querySelector('a.lsb-ai-console-top')
      if (link instanceof HTMLElement) {
        link.click()
        return link
      }
      return canvasOpenSurface('ai-card', trigger)
    }
    // @LSB_DEV_AI_END

    function canvasRenderNavigation(surface) {
      if (!(surface instanceof Element)) return
      const list = surface.querySelector('[data-canvas-navigation-list]')
      if (!(list instanceof Element)) return
      list.replaceChildren()
      const currentHref = `${location.pathname}${location.search}${location.hash}`
      const favorite = document.querySelector('a[href*="tab=favorites"], a[href*="favorites"]')
      const search = document.querySelector('form.search-form')
      const entries = [
        { href: '/', label: '全部主题', group: '站点' },
        { href: api.routes.homeSorted('post'), label: '新帖子', group: '站点' },
        ...(currentHref !== '/' ? [{ href: currentHref, label: '当前页面', group: '最近访问' }] : []),
        ...(favorite?.getAttribute('href') ? [{ href: favorite.getAttribute('href'), label: '我的收藏', group: '收藏' }] : []),
        ...(search?.getAttribute('action') ? [{ href: search.getAttribute('action'), label: '站内搜索', group: '搜索' }] : [{ href: '/search', label: '站内搜索', group: '搜索' }]),
        ...collectBoards().slice(0, 80).map((item) => ({ href: item.href, label: item.label, group: '版块' })),
      ]
      const seen = new Set()
      for (const item of entries) {
        if (!item?.href || !item.label || seen.has(item.href)) continue
        seen.add(item.href)
        const link = document.createElement('a')
        link.href = item.href
        link.textContent = item.label
        link.title = item.group || ''
        link.setAttribute('data-canvas-navigation-link', '')
        link.style.cssText = 'display:block;padding:10px 12px;border-radius:10px;color:inherit;text-decoration:none'
        link.addEventListener('click', () => canvasCloseSurface('navigation-sheet', false))
        list.append(link)
      }
    }

    function canvasSyncText() {
      const title = canvasSurface('top-status')?.querySelector('[data-canvas-status-title]')
      const morphText = (node, value) => {
        if (!(node instanceof HTMLElement)) return
        const next = String(value ?? '')
        if (node.textContent === next) return
        node.setAttribute('data-route-transition', 'in')
        node.textContent = next
        const clear = () => {
          if (node.isConnected && node.textContent === next) node.removeAttribute('data-route-transition')
        }
        if (typeof queueMicrotask === 'function') queueMicrotask(clear)
        else Promise.resolve().then(clear)
      }
      morphText(title, canvasPageType() === 'topic' ? 'LINUX SB' : locationText())
      canvasRenderNavigation(canvasSurface('navigation-sheet'))
      renderCanvasTopLinks()
      const currentPage = canvasPageType()
      canvasSurfaceHost?.setAttribute('data-canvas-page', currentPage)
    }

    function canvasSurfaceRect(surface) {
      if (!(surface instanceof Element)) return { x: 0, y: 0, width: 320, height: 240 }
      const rect = surface.getBoundingClientRect?.()
      const parse = (value, fallback) => Number.isFinite(Number(value)) && Number(value) > 0 ? Number(value) : fallback
      return {
        x: parse(rect?.left, parseFloat(surface.style.left) || 0),
        y: parse(rect?.top, parseFloat(surface.style.top) || 0),
        width: parse(rect?.width, parseFloat(surface.style.width) || 420),
        height: parse(rect?.height, parseFloat(surface.style.height) || 560),
      }
    }

    function canvasPersistSurfaceRect(id, rect) {
      if (!canvasState || !canvasSiteKey || !CANVAS_WIDTH_CLASSES.includes(canvasWidthClass)) return
      const site = canvasState.sites[canvasSiteKey] || {}
      const layout = site.layout && typeof site.layout === 'object' ? site.layout : {}
      const bucket = layout[canvasWidthClass] && typeof layout[canvasWidthClass] === 'object' ? layout[canvasWidthClass] : {}
      canvasState.sites[canvasSiteKey] = canvasMerge(site, { layout: { [canvasWidthClass]: { ...bucket, [id]: canvasCopy(rect) } } })
      canvasEffective = mergeCanvasState(canvasState, canvasState.sites[canvasSiteKey])
      saveCanvasState()
    }

    function canvasApplySurfaceModes() {
      if (!(canvasSurfaceHost instanceof Element)) return
      for (const id of ['ai-card', 'site-card', 'evidence-card']) {
        const surface = canvasSurface(id)
        if (!(surface instanceof Element)) continue
        const mode = resolveSurfaceMode(canvasWidthClass, id)
        surface.dataset.surfaceMode = mode
        const resizeHandle = surface.querySelector('[data-canvas-resize-handle]')
        if (resizeHandle instanceof HTMLElement) resizeHandle.hidden = mode === 'rail'
        const stored = canvasEffective?.layout?.[canvasWidthClass]?.[id]
        if (mode === 'floating') {
          const viewport = canvasViewport()
          const defaultKey = id === 'ai-card' ? 'aiCard' : id === 'site-card' ? 'siteCard' : 'evidenceCard'
          const configured = canvasEffective?.surfaceDefaults?.[defaultKey] || CANVAS_DEFAULT_SURFACES[defaultKey] || {}
          const minimum = id === 'ai-card' ? { width: 320, height: 260 } : { width: 240, height: 160 }
          const fallback = {
            x: Math.max(0, viewport.width - Math.max(minimum.width, Number(configured.width) || 420) - 24),
            y: 88,
            width: Number(configured.width) || 420,
            height: Number(configured.height) || 560,
          }
          const rect = clampSurfaceRect(stored || fallback, viewport, minimum)
          surface.style.left = `${rect.x}px`
          surface.style.top = `${rect.y}px`
          surface.style.width = String(rect.width) + 'px'
          if (id === 'site-card' && !stored) surface.style.removeProperty('height')
          else surface.style.height = String(rect.height) + 'px'
          surface.style.right = 'auto'
          surface.style.bottom = 'auto'
        } else if (mode === 'rail') {
          for (const prop of ['left', 'top', 'width', 'height', 'right', 'bottom']) surface.style.removeProperty(prop)
          const statusOwnsSiteCard = id === 'site-card' && canvasWidthClass === 'wide'
          surface.hidden = statusOwnsSiteCard
          surface.setAttribute('aria-hidden', String(statusOwnsSiteCard))
          surface.setAttribute('data-canvas-surface-state', statusOwnsSiteCard ? 'closed' : 'open')
        } else {
          for (const prop of ['left', 'top', 'width', 'height', 'right', 'bottom']) surface.style.removeProperty(prop)
        }
      }
      const statusHost = canvasSurface('site-status')?.querySelector('[data-canvas-site-status-host]')
      if (statusHost instanceof Element && canvasWidthClass !== 'wide') canvasSiteStatusSetExpanded(statusHost, false, false)
      if (canvasWidthClass === 'wide') canvasSyncSiteSidebar()
    }

    function canvasEndDrag(commit = true) {
      const state = canvasDragState
      if (!state) return
      if (canvasDragRaf) {
        const cancel = window.cancelAnimationFrame || window.clearTimeout
        cancel(canvasDragRaf)
        canvasDragRaf = 0
      }
      window.removeEventListener('pointermove', state.move)
      window.removeEventListener('pointerup', state.up)
      window.removeEventListener('pointercancel', state.cancel || state.up)
      state.surface.removeAttribute('data-canvas-dragging')
      const finalRect = clampSurfaceRect({
        ...state.start,
        x: state.start.x + (state.kind === 'resize' ? 0 : state.dx),
        y: state.start.y + (state.kind === 'resize' ? 0 : state.dy),
        width: state.start.width + (state.kind === 'resize' ? state.dx : 0),
        height: state.start.height + (state.kind === 'resize' ? state.dy : 0),
      }, canvasViewport(), { width: 320, height: 220 })
      state.surface.style.transform = ''
      if (commit) {
        state.surface.style.left = `${finalRect.x}px`
        state.surface.style.top = `${finalRect.y}px`
        if (state.kind === 'resize') {
          state.surface.style.width = `${finalRect.width}px`
          state.surface.style.height = `${finalRect.height}px`
        }
        canvasPersistSurfaceRect(state.id, finalRect)
      } else {
        state.surface.style.left = `${state.start.x}px`
        state.surface.style.top = `${state.start.y}px`
        if (state.kind === 'resize') {
          if (state.styleWidth) state.surface.style.width = state.styleWidth
          else state.surface.style.removeProperty('width')
          if (state.styleHeight) state.surface.style.height = state.styleHeight
          else state.surface.style.removeProperty('height')
        }
      }
      state.surface.releasePointerCapture?.(state.pointerId)
      canvasDragState = null
    }

    function canvasBeginDrag(event, surface) {
      if (!(surface instanceof Element) || surface.dataset.surfaceMode !== 'floating') return
      if (event.button != null && event.button !== 0) return
      if (event.target?.closest?.('[data-canvas-close],button,input,textarea,select,a')) return
      const start = canvasSurfaceRect(surface)
      const pointerId = event.pointerId
      const state = { id: surface.getAttribute('data-surface') || '', surface, start, dx: 0, dy: 0, pointerId, move: null, up: null }
      state.move = (moveEvent) => {
        if (pointerId != null && moveEvent.pointerId != null && moveEvent.pointerId !== pointerId) return
        state.dx = Number(moveEvent.clientX || 0) - Number(event.clientX || 0)
        state.dy = Number(moveEvent.clientY || 0) - Number(event.clientY || 0)
        if (canvasDragRaf) return
        const raf = window.requestAnimationFrame || ((fn) => window.setTimeout(fn, 0))
        canvasDragRaf = raf(() => {
          canvasDragRaf = 0
          if (state.kind === 'resize') {
            surface.style.width = `${Math.max(1, Math.round(state.start.width + state.dx))}px`
            surface.style.height = `${Math.max(1, Math.round(state.start.height + state.dy))}px`
          } else {
            surface.style.transform = `translate3d(${Math.round(state.dx)}px,${Math.round(state.dy)}px,0)`
          }
        })
      }
      state.up = () => canvasEndDrag(true)
      state.cancel = () => canvasEndDrag(false)
      canvasDragState = state
      surface.dataset.canvasDragging = 'true'
      surface.setPointerCapture?.(pointerId)
      window.addEventListener('pointermove', state.move)
      window.addEventListener('pointerup', state.up, { once: true })
      window.addEventListener('pointercancel', state.cancel, { once: true })
      event.preventDefault?.()
    }

    function canvasBeginResize(event, surface) {
      if (!(surface instanceof Element) || surface.dataset.surfaceMode !== 'floating') return
      if (event.button != null && event.button !== 0) return
      const start = canvasSurfaceRect(surface)
      const pointerId = event.pointerId
      const state = { id: surface.getAttribute('data-surface') || '', surface, start, styleWidth: surface.style.width, styleHeight: surface.style.height, dx: 0, dy: 0, pointerId, kind: 'resize', move: null, up: null }
      state.move = (moveEvent) => {
        if (pointerId != null && moveEvent.pointerId != null && moveEvent.pointerId !== pointerId) return
        state.dx = Number(moveEvent.clientX || 0) - Number(event.clientX || 0)
        state.dy = Number(moveEvent.clientY || 0) - Number(event.clientY || 0)
        if (canvasDragRaf) return
        const raf = window.requestAnimationFrame || ((fn) => window.setTimeout(fn, 0))
        canvasDragRaf = raf(() => {
          canvasDragRaf = 0
          surface.style.width = `${Math.max(1, Math.round(state.start.width + state.dx))}px`
          surface.style.height = `${Math.max(1, Math.round(state.start.height + state.dy))}px`
        })
      }
      state.up = () => canvasEndDrag(true)
      state.cancel = () => canvasEndDrag(false)
      canvasDragState = state
      surface.dataset.canvasDragging = 'true'
      surface.setPointerCapture?.(pointerId)
      window.addEventListener('pointermove', state.move)
      window.addEventListener('pointerup', state.up, { once: true })
      window.addEventListener('pointercancel', state.cancel, { once: true })
      event.preventDefault?.()
    }

    function canvasKeyboardMove(event, surface) {
      if (!(surface instanceof Element) || surface.dataset.surfaceMode !== 'floating') return
      const id = surface.getAttribute('data-surface') || ''
      const current = canvasSurfaceRect(surface)
      const step = event.shiftKey ? 16 : 8
      let next = { ...current }
      if (event.shiftKey && event.key === 'ArrowLeft') next.width -= step
      else if (event.shiftKey && event.key === 'ArrowRight') next.width += step
      else if (event.shiftKey && event.key === 'ArrowUp') next.height -= step
      else if (event.shiftKey && event.key === 'ArrowDown') next.height += step
      else if (event.key === 'ArrowLeft') next.x -= step
      else if (event.key === 'ArrowRight') next.x += step
      else if (event.key === 'ArrowUp') next.y -= step
      else if (event.key === 'ArrowDown') next.y += step
      else if (event.key === 'Home') {
        canvasZIndex += 1
        surface.style.zIndex = String(8010 + canvasZIndex)
        event.preventDefault()
        return
      }
      else if (event.key === 'End') {
        surface.style.zIndex = '8000'
        event.preventDefault()
        return
      }
      else if (event.key === 'Escape') { canvasCloseSurface(id); return }
      else return
      event.preventDefault()
      const clean = clampSurfaceRect(next, canvasViewport(), { width: 320, height: 220 })
      surface.style.left = `${clean.x}px`
      surface.style.top = `${clean.y}px`
      canvasPersistSurfaceRect(id, clean)
    }

    function canvasScrollSync() {
      canvasScrollRaf = 0
      const y = canvasScrollY()
      const status = canvasSurface('top-status')
      if (!status) return
      const previous = canvasScrollLast
      const down = y > previous + 2
      const up = y < previous - 2
      canvasScrollLast = y
      if (down || up) status.dataset.compact = down && y > 48 ? 'true' : 'false'
      canvasUpdateProfileScroll(y, previous)
    }

    function canvasHomeScrollRoot() {
      const root = document.documentElement
      const canvasMode = root.classList.contains('lsb-canvas-mode')
      if (!root.classList.contains('lsb-skin-shell-on')) return null
      if (!root.classList.contains('lsb-skin-shell-home')) return null
      if (canvasMode) {
        if (!root.classList.contains('lsb-canvas-page-home')) return null
        if (canvasViewport().width < 700) return null
      } else if (!asideWide()) {
        return null
      }
      const panel = canvasMode
        ? document.querySelector('.lsb-canvas-content-root > .home-shell .main-panel')
        : document.querySelector('body > main.wrap .home-shell .main-panel')
      return panel instanceof Element ? panel : null
    }

    function canvasScrollRoot() {
      return canvasHomeScrollRoot() || (contentScroller instanceof Element ? contentScroller : null)
    }

    function canvasSyncScrollTarget() {
      const next = canvasScrollRoot()
      syncShellScrollBridge(next)
      if (next === canvasScrollTarget) return
      const previousTarget = canvasScrollTarget
      const carryX = !(previousTarget instanceof Element) && next instanceof Element
        ? Number(window.scrollX || document.documentElement?.scrollLeft || 0)
        : 0
      const carryY = !(previousTarget instanceof Element) && next instanceof Element
        ? Number(window.scrollY || document.documentElement?.scrollTop || 0)
        : 0
      if (previousTarget instanceof Element && canvasScrollHandler) {
        previousTarget.removeEventListener('scroll', canvasScrollHandler)
      }
      canvasScrollTarget = next
      if (canvasScrollTarget instanceof Element) {
        if (carryX > 0 && Number(canvasScrollTarget.scrollLeft || 0) === 0) canvasScrollTarget.scrollLeft = carryX
        if (carryY > 0 && Number(canvasScrollTarget.scrollTop || 0) === 0) canvasScrollTarget.scrollTop = carryY
        if (canvasScrollHandler) canvasScrollTarget.addEventListener('scroll', canvasScrollHandler, { passive: true })
      }
      canvasScrollLast = canvasScrollY()
    }

    function canvasScrollY() {
      if (canvasScrollTarget instanceof Element) return Number(canvasScrollTarget.scrollTop || 0)
      return Number(window.scrollY || document.documentElement?.scrollTop || 0)
    }

    function canvasUpdateProfileScroll(y, previous) {
      const host = document.querySelector('[data-lsb-canvas-profile]')
      if (!(host instanceof Element) || api.page?.type !== 'user') return
      // 资料卡已经收窄到原生选项的内容宽度，完整链接始终可见，不再因滚动折叠。
      canvasProfileExpanded = false
      canvasProfileScrollMode = 'full'
      host.dataset.scrollMode = canvasProfileScrollMode
      host.dataset.expanded = String(canvasProfileExpanded)
    }

    function canvasScheduleScroll() {
      if (canvasScrollRaf) return
      const raf = window.requestAnimationFrame || ((fn) => window.setTimeout(fn, 0))
      canvasScrollRaf = raf(canvasScrollSync)
    }

    function canvasBindWindow() {
      if (canvasScrollBound) return
      canvasScrollBound = true
      canvasScrollHandler = canvasScheduleScroll
      canvasResizeHandler = () => {
        canvasWidthClass = widthClass(canvasViewport().width)
        canvasApplyPageClass()
        canvasApplySurfaceModes()
        canvasScheduleScroll()
      }
      window.addEventListener('scroll', canvasScrollHandler, { passive: true })
      window.addEventListener('resize', canvasResizeHandler)
      canvasSyncScrollTarget()
      canvasScrollLast = canvasScrollY()
      canvasUpdateProfileScroll(canvasScrollLast, canvasScrollLast)
    }

    function canvasUnbindWindow() {
      if (!canvasScrollBound) return
      canvasScrollBound = false
      if (canvasScrollHandler) window.removeEventListener('scroll', canvasScrollHandler)
      if (canvasResizeHandler) window.removeEventListener('resize', canvasResizeHandler)
      canvasScrollTarget?.removeEventListener('scroll', canvasScrollHandler)
      canvasScrollHandler = null
      canvasResizeHandler = null
      canvasScrollTarget = null
      if (canvasScrollRaf) {
        const cancel = window.cancelAnimationFrame || window.clearTimeout
        cancel(canvasScrollRaf)
        canvasScrollRaf = 0
      }
    }

    function canvasSearchSetOpen(host, open, restoreFocus = false) {
      if (!(host instanceof Element)) return false
      const trigger = host.querySelector('[data-canvas-search-trigger]')
      const panel = host.querySelector('[data-canvas-search-panel]')
      if (!(trigger instanceof HTMLElement) || !(panel instanceof HTMLElement)) return false
      const next = !!open && !!panel.querySelector('form, .search-page-link')
      host.dataset.searchOpen = String(next)
      panel.hidden = !next
      trigger.setAttribute('aria-expanded', String(next))
      trigger.setAttribute('aria-label', next ? '关闭站点搜索' : '打开站点搜索')
      if (next) {
        const input = panel.querySelector('input[type="search"], input[name="q"]')
        input?.focus?.()
      } else if (restoreFocus) {
        trigger.focus?.()
      }
      return next
    }

    function canvasUnbindEvents() {
      if (canvasSearchOutsideHandler) {
        document.removeEventListener('click', canvasSearchOutsideHandler, true)
        canvasSearchOutsideHandler = null
      }
    }

    function canvasBindEvents() {
      if (!(canvasSurfaceHost instanceof Element) || canvasSurfaceHost.dataset.canvasEventsBound === '1') return
      canvasSurfaceHost.dataset.canvasEventsBound = '1'
      canvasSurfaceHost.addEventListener('click', (event) => {
        const searchTrigger = event.target.closest?.('[data-canvas-search-trigger]')
        if (searchTrigger) {
          event.preventDefault()
          const host = searchTrigger.closest('[data-canvas-search-host]')
          canvasSearchSetOpen(host, host?.dataset.searchOpen !== 'true')
          return
        }
        if (event.target.closest?.('[data-canvas-backdrop]')) {
          event.preventDefault()
          canvasCloseSurface()
          return
        }
        const back = event.target.closest?.('[data-canvas-back]')
        if (back) {
          event.preventDefault()
          if (history.length > 1) history.back()
          return
        }
        const close = event.target.closest?.('[data-canvas-close]')
        if (close) {
          event.preventDefault()
          canvasCloseSurface(close.closest('[data-surface]')?.getAttribute('data-surface') || canvasActiveSheet)
          return
        }
        const contextAction = event.target.closest?.('[data-context-action]')
        if (contextAction) {
          event.preventDefault()
          canvasNativeAction(contextAction.getAttribute('data-context-action') || '')
          canvasCloseContextPill(true)
          return
        }
        // @LSB_DEV_AI_START
        if (event.target.closest?.('[data-ai-workbench-close]')) {
          event.preventDefault()
          canvasCloseSurface('ai-card')
          return
        }
        const consoleAction = event.target.closest?.('[data-canvas-ai-console]')
        if (consoleAction) {
          event.preventDefault()
          canvasInvokeAiConsole(consoleAction)
          return
        }
        // @LSB_DEV_AI_END
        const siteStatusHost = event.target.closest?.('[data-canvas-site-status-host]')
        if (siteStatusHost && !event.target.closest?.('[data-canvas-site-status-body]')) {
          event.preventDefault()
          const next = siteStatusHost.dataset.locked !== 'true'
          canvasSiteStatusSetExpanded(siteStatusHost, next, next)
          canvasActiveSheet = next ? 'site-card' : ''
          return
        }
        const pluginSettingsAction = event.target.closest?.('[data-plugin-settings-open], [data-plugin-settings-entry]')
        if (pluginSettingsAction) {
          event.preventDefault()
          openPluginSettings(
            pluginSettingsAction.getAttribute('data-plugin-settings-open')
            || pluginSettingsAction.getAttribute('data-plugin-settings-entry')
            || '',
          )
          return
        }
        const pluginFeatureAction = event.target.closest?.('[data-plugin-feature-action]')
        if (pluginFeatureAction) {
          event.preventDefault()
          openPluginFeature(pluginFeatureAction.getAttribute('data-plugin-feature-action') || '')
          return
        }
        const settingsDirectory = event.target.closest?.('[data-plugin-settings-directory]')
        if (settingsDirectory) {
          event.preventDefault()
          canvasOpenSurface('plugin-settings-sheet', settingsDirectory)
          return
        }
        const settingsBack = event.target.closest?.('[data-plugin-settings-back]')
        if (settingsBack) {
          event.preventDefault()
          canvasOpenSurface('plugin-features-sheet', settingsBack)
          return
        }
        const action = event.target.closest?.('[data-canvas-open]')
        if (action) {
          event.preventDefault()
          canvasOpenSurface(action.getAttribute('data-canvas-open'), action)
          return
        }
        const tool = event.target.closest?.('[data-tool-action]')
        if (tool) {
          event.preventDefault()
          const target = tool.getAttribute('data-tool-action')
          canvasCloseSurface('tool-sheet', false)
          // @LSB_DEV_AI_START
          if (target === 'ai-console') {
            canvasInvokeAiConsole(tool)
            return
          }
          // @LSB_DEV_AI_END
          canvasOpenSurface(target, tool)
          return
        }
        // @LSB_DEV_AI_START
        const send = event.target.closest?.('[data-canvas-send]')
        if (send) {
          event.preventDefault()
          const query = canvasSurface('tool-sheet')?.querySelector('[data-canvas-query-input]')?.value?.trim() || ''
          if (!query) return
          canvasCloseSurface('tool-sheet', false)
          const ai = canvasOpenSurface('ai-card', send)
          window.setTimeout(() => {
            const input = ai?.querySelector('[data-ai-chat-input]')
            if (input) { input.value = query; input.focus?.(); input.dispatchEvent(new Event('input', { bubbles: true })) }
          }, 0)
          return
        }
        // @LSB_DEV_AI_END
      })
      canvasSearchOutsideHandler = (event) => {
        const host = canvasSurfaceHost?.querySelector('[data-canvas-search-host]')
        if (host?.dataset.searchOpen !== 'true' || host.contains(event.target)) return
        canvasSearchSetOpen(host, false)
      }
      document.addEventListener('click', canvasSearchOutsideHandler, true)
      canvasSurfaceHost.addEventListener('keydown', (event) => {
        if (event.key === 'Escape') {
          const searchHost = canvasSurfaceHost.querySelector('[data-canvas-search-host]')
          if (searchHost?.dataset.searchOpen === 'true') {
            event.preventDefault()
            event.stopPropagation()
            canvasSearchSetOpen(searchHost, false, true)
            return
          }
        }
        if (event.key === 'Escape' && canvasDragState) {
          event.preventDefault()
          canvasEndDrag(false)
          return
        }
        if (event.key === 'Escape' && canvasActiveSheet) {
          event.preventDefault()
          canvasCloseSurface(canvasActiveSheet)
        }
        const surface = event.target.closest?.('[data-surface]')
        if (surface) canvasKeyboardMove(event, surface)
      })
      canvasSurfaceHost.addEventListener('pointerdown', (event) => {
        const surface = event.target.closest?.('[data-surface]')
        const handle = event.target.closest?.('[data-canvas-sheet-head]')
        const resize = event.target.closest?.('[data-canvas-resize-handle]')
        if (surface && resize) canvasBeginResize(event, surface)
        else if (surface && handle) canvasBeginDrag(event, surface)
      })
    }

    function ensureCanvasShell() {
      let el = document.getElementById('lsb-shell')
      if (el && el.getAttribute('data-lsb-canvas-shell') !== 'true') el.remove()
      el = document.getElementById('lsb-shell')
      if (!el) {
        el = document.createElement('div')
        el.id = 'lsb-shell'
        el.setAttribute('data-lsb-canvas-shell', 'true')
        el.innerHTML = `
          <div id="lsb-shell-surfaces" data-lsb-canvas-surfaces>
            <div data-canvas-backdrop hidden aria-hidden="true"></div>
            <div data-canvas-profile-host hidden aria-label="当前用户资料">
              <button type="button" data-canvas-profile-expand aria-expanded="false" aria-label="展开个人资料卡" title="展开个人资料卡">⌄</button>
            </div>
            <section data-surface="top-status" role="status" aria-live="polite">
              <button type="button" data-canvas-action data-canvas-back aria-label="返回">‹</button>
              <a class="lsb-shell-brand" data-canvas-home href="/" aria-label="回到首页">⌂</a>
              <strong data-canvas-status-title>LINUX SB</strong>
              <nav data-canvas-status-links aria-label="站点快捷入口"></nav>
              <nav data-canvas-pinned-links aria-label="认证与导航"></nav>
              <div data-canvas-search-host hidden aria-label="站点搜索">
                <button type="button" data-canvas-search-trigger aria-label="打开站点搜索" aria-expanded="false" aria-controls="lsb-canvas-search-panel">
                  <svg viewBox="0 0 24 24" aria-hidden="true"><circle cx="10.8" cy="10.8" r="6.6"></circle><path d="m16 16 4.5 4.5"></path></svg>
                </button>
                <div id="lsb-canvas-search-panel" data-canvas-search-panel role="dialog" aria-label="站点搜索" hidden></div>
              </div>
              <button type="button" data-canvas-open="tool-sheet" data-canvas-action aria-label="打开工具">⋯</button>
            </section>
            <section data-surface="site-status" aria-label="站点信息栏" hidden>
              <div data-canvas-site-status-host aria-label="站点信息" data-expanded="false" data-locked="false">
                <button type="button" data-canvas-site-status-label aria-expanded="false">站点信息</button>
                <div data-canvas-site-status-body data-canvas-site-sidebar aria-label="原站右侧栏"><p data-canvas-site-empty-state hidden>当前页面没有原生站点信息栏内容</p></div>
                <button type="button" data-canvas-site-status-expand aria-expanded="false" aria-label="展开站点信息" title="展开站点信息">⌄</button>
              </div>
            </section>
            <section data-surface="tool-capsule" aria-label="工具入口">
              ${CANVAS_AI_MARKUP.capsule}
              <button type="button" data-canvas-open="tool-sheet" aria-label="更多工具">⋯</button>
            </section>
            <section data-surface="tool-sheet" role="dialog" aria-modal="false" aria-hidden="true" aria-labelledby="lsb-canvas-tool-title" hidden>
              <div data-canvas-sheet-head><span data-canvas-sheet-grabber aria-hidden="true"></span><h2 id="lsb-canvas-tool-title">工具</h2><button type="button" data-canvas-close aria-label="关闭">×</button></div>
              <div data-tool-grid>
                <button type="button" data-tool-action="site-card">站点信息</button>
                ${CANVAS_AI_MARKUP.tool}
                <button type="button" data-tool-action="appearance-sheet">外观</button>
                <button type="button" data-tool-action="plugin-features-sheet">插件功能</button>
              </div>
              ${CANVAS_AI_MARKUP.query}
            </section>
            <section data-surface="plugin-features-sheet" role="dialog" aria-hidden="true" aria-labelledby="lsb-canvas-plugin-features-title" hidden>
              <div data-canvas-sheet-head><span data-canvas-sheet-grabber aria-hidden="true"></span><h2 id="lsb-canvas-plugin-features-title">插件功能</h2><button type="button" data-canvas-close aria-label="关闭">×</button></div>
              <section aria-labelledby="lsb-canvas-plugin-feature-list-title">
                <h3 id="lsb-canvas-plugin-feature-list-title">功能入口</h3>
                <div data-plugin-feature-list></div>
              </section>
              <section aria-labelledby="lsb-canvas-plugin-settings-title">
                <h3 id="lsb-canvas-plugin-settings-title">插件设置</h3>
                <p class="lsb-row-desc">浏览所有已声明设置项的插件。</p>
                <button type="button" data-plugin-settings-directory>全部插件设置</button>
              </section>
            </section>
            <section data-surface="plugin-settings-sheet" role="dialog" aria-hidden="true" aria-labelledby="lsb-canvas-plugin-settings-sheet-title" hidden>
              <div data-canvas-sheet-head><span data-canvas-sheet-grabber aria-hidden="true"></span><h2 id="lsb-canvas-plugin-settings-sheet-title">全部插件设置</h2><button type="button" data-canvas-close aria-label="关闭">×</button></div>
              <button type="button" data-plugin-settings-back>返回插件功能</button>
              <div data-plugin-settings-list></div>
            </section>
            <section data-surface="navigation-sheet" role="dialog" aria-hidden="true" aria-labelledby="lsb-canvas-navigation-title" hidden>
              <div data-canvas-sheet-head><span data-canvas-sheet-grabber aria-hidden="true"></span><h2 id="lsb-canvas-navigation-title">导航</h2><button type="button" data-canvas-close aria-label="关闭">×</button></div>
              <nav data-canvas-navigation-list aria-label="站点板块"></nav>
            </section>
            <section data-surface="site-card" role="dialog" aria-hidden="true" aria-labelledby="lsb-canvas-site-title" hidden>
              <div data-canvas-sheet-head><span data-canvas-sheet-grabber aria-hidden="true"></span><h2 id="lsb-canvas-site-title">站点信息</h2><button type="button" data-canvas-close aria-label="关闭">×</button></div>
              <div data-canvas-site-sidebar aria-label="原站右侧栏"><p data-canvas-site-empty-state hidden>当前页面没有原生站点信息栏内容</p></div>
              <span data-canvas-resize-handle role="separator" aria-label="调整站点卡片大小"></span>
            </section>
            <section data-surface="context-pill" role="toolbar" aria-label="选中文本操作" aria-hidden="true" hidden>
              <button type="button" data-context-action="reply">回复</button>
              <button type="button" data-context-action="quote">引用</button>
              <button type="button" data-context-action="favorite">收藏</button>
              <button type="button" data-context-action="copy">复制</button>
            </section>
            ${CANVAS_AI_MARKUP.card}
            <section data-surface="appearance-sheet" role="dialog" aria-hidden="true" aria-labelledby="lsb-canvas-appearance-title" hidden>
              <div data-canvas-sheet-head><span data-canvas-sheet-grabber aria-hidden="true"></span><h2 id="lsb-canvas-appearance-title">外观</h2><button type="button" data-canvas-close aria-label="关闭">×</button></div>
              <div data-canvas-presets role="group" aria-label="外观预设">
                <button type="button" data-canvas-preset="native-site">D 原生站点</button>
                <button type="button" data-canvas-preset="balanced-glass">A 平衡玻璃</button>
                <button type="button" data-canvas-preset="immersive-video">B 沉浸视频</button>
                <button type="button" data-canvas-preset="static-readable">C 静态可读</button>
              </div>
              <div data-canvas-background-modes role="group" aria-label="背景模式">
                <strong>背景</strong>
                <button type="button" data-canvas-background="original" aria-pressed="false">原始背景</button>
                <button type="button" data-canvas-background="image" aria-pressed="false">静态图片</button>
                <button type="button" data-canvas-background="video" aria-pressed="false">视频背景</button>
              </div>
              <div data-canvas-appearance-controls>
                <label>透明度 <input type="range" min="0.35" max="1" step="0.01" data-canvas-appearance="opacity"></label>
                <label>模糊 <input type="range" min="0" max="32" step="1" data-canvas-appearance="blur"></label>
                <label>字号 <input type="range" min="12" max="32" step="1" data-canvas-appearance="fontSize"></label>
                <label>圆角 <input type="range" min="8" max="32" step="1" data-canvas-appearance="radius"></label>
                <label>系统字体 <select data-canvas-appearance="fontFamily"><option value="">站点默认</option><option value="system-ui">System UI</option><option value="'PingFang SC'">苹方</option><option value="'Microsoft YaHei'">微软雅黑</option><option value="'Segoe UI'">Segoe UI</option></select></label>
                <label>视频 URL（HTTPS） <input type="url" data-canvas-appearance="backgroundVideoUrl"></label>
                <label>图片 URL（HTTPS） <input type="url" data-canvas-appearance="backgroundImageUrl"></label>
                <label>字体 URL（HTTPS） <input type="url" data-canvas-appearance="fontUrl"></label>
                <label>本地视频（≤50MB） <input type="file" accept="video/*" data-canvas-media-file="video"></label>
                <label>本地图片（≤20MB） <input type="file" accept="image/*" data-canvas-media-file="image"></label>
                <label>本地字体（≤10MB） <input type="file" accept=".woff2,.woff,.ttf,.otf,font/*" data-canvas-media-file="font"></label>
              </div>
              <div data-canvas-appearance-actions><button type="button" data-canvas-save-appearance>保存外观</button><button type="button" data-canvas-reset-appearance>恢复默认外观</button><button type="button" data-canvas-reset-layout>恢复默认布局</button></div>
              <p data-canvas-appearance-status aria-live="polite"></p>
            </section>
          </div>`
        document.body.append(el)
      }
      canvasShell = el
      canvasSurfaceHost = el.querySelector('#lsb-shell-surfaces')
      canvasBindSiteStatus(canvasSurfaceHost.querySelector('[data-canvas-site-status-host]'))
      canvasBindEvents()
      canvasBindSelection()
      return el
    }

    function canvasSyncAppearance(feedback = '') {
      if (!(canvasSurfaceHost instanceof Element)) return
      const appearance = canvasEffective?.appearance || {}
      const status = canvasSurface('appearance-sheet')?.querySelector('[data-canvas-appearance-status]')
      const presetLabels = {
        'native-site': 'D 原生站点',
        'balanced-glass': 'A 平衡玻璃',
        'immersive-video': 'B 沉浸视频',
        'static-readable': 'C 静态可读',
      }
      if (status) status.textContent = feedback || `当前预设：${presetLabels[canvasEffective?.preset] || presetLabels['balanced-glass']}`
      for (const button of canvasSurface('appearance-sheet')?.querySelectorAll('[data-canvas-preset]') || []) {
        button.setAttribute('aria-pressed', button.getAttribute('data-canvas-preset') === (canvasEffective?.preset || 'balanced-glass') ? 'true' : 'false')
      }
      const backgroundMode = String(appearance.background || 'static') === 'image'
        ? 'image'
        : String(appearance.background || 'static') === 'video' ? 'video' : 'original'
      for (const button of canvasSurface('appearance-sheet')?.querySelectorAll('[data-canvas-background]') || []) {
        button.setAttribute('aria-pressed', button.getAttribute('data-canvas-background') === backgroundMode ? 'true' : 'false')
      }
      for (const input of canvasSurface('appearance-sheet')?.querySelectorAll('[data-canvas-appearance]') || []) {
        const key = input.getAttribute('data-canvas-appearance')
        if (!key || document.activeElement === input) continue
        if (appearance[key] != null) input.value = String(appearance[key])
      }
      const siteSummary = canvasSurface('site-card')?.querySelector('[data-canvas-site-summary]')
      if (siteSummary) siteSummary.textContent = `${canvasSiteKey.replace(/^https?:\/\//, '')} · ${locationText()}`
      canvasShell?.style.setProperty('--lsb-canvas-current-opacity', String(appearance.opacity ?? .72))
    }

    function canvasCommitAppearanceControls() {
      const controls = canvasSurface('appearance-sheet')?.querySelectorAll('[data-canvas-appearance]') || []
      const values = [...controls].map((input) => [input.getAttribute('data-canvas-appearance'), input.value])
      for (const [key, value] of values) {
        const input = [...controls].find((node) => node.getAttribute('data-canvas-appearance') === key)
        if (!key || String(canvasEffective?.appearance?.[key] ?? '') === String(value ?? '')) continue
        canvasSetAppearance(key, value, { defer: true })
      }
      saveCanvasState()
      applyShellTokens()
      canvasSyncAppearance()
      syncShellMedia()
    }

    function canvasSaveAppearance() {
      if (!canvasState) return
      canvasCommitAppearanceControls()
      canvasSyncAppearance('\u5916\u89c2\u5df2\u4fdd\u5b58')
    }

    function canvasSetAppearance(name, value, options = {}) {
      const key = String(name || '')
      if (!CANVAS_DEFAULT_APPEARANCE.hasOwnProperty(key) || !canvasState) return
      let next = value
      if (['opacity', 'blur', 'fontSize', 'radius'].includes(key)) {
        const n = Number(value)
        if (!Number.isFinite(n)) return
        const bounds = { opacity: [.35, 1], blur: [0, 32], fontSize: [12, 32], radius: [8, 32] }[key]
        next = Math.min(bounds[1], Math.max(bounds[0], n))
      }
      if (['textColor', 'panelColor', 'accentColor'].includes(key)) {
        const text = String(value || '').trim()
        if (!text) next = ''
        else {
          const valid = shellStyleApi?.sanitizeTokenValue?.(key, text)
          if (!valid) return
          next = text
        }
      }
      if (key === 'fontFamily') {
        if (!value) next = ''
        else {
          const valid = shellStyleApi?.sanitizeTokenValue?.('fontFamily', value)
          if (!valid) return
          next = String(value)
        }
      }
      if (['backgroundVideoUrl', 'backgroundImageUrl', 'fontUrl'].includes(key)) {
        if (value && !api.ui.shellMedia?.isHttpsUrl?.(value)) return
        next = String(value || '').trim()
      }
      const site = canvasState.sites[canvasSiteKey] || {}
      const appearancePatch = { [key]: next }
      if (key === 'backgroundVideoUrl' && next) {
        appearancePatch.background = 'video'
        appearancePatch.backgroundImageUrl = ''
        appearancePatch.backgroundImageLocalKey = ''
      }
      if (key === 'backgroundImageUrl' && next) {
        appearancePatch.background = 'image'
        appearancePatch.backgroundVideoUrl = ''
        appearancePatch.backgroundVideoLocalKey = ''
      }
      if (key === 'backgroundVideoUrl' && !next) appearancePatch.background = 'static'
      if (key === 'backgroundImageUrl' && !next) appearancePatch.background = 'static'
      canvasState.sites[canvasSiteKey] = canvasMerge(site, { appearance: appearancePatch })
      canvasEffective = mergeCanvasState(canvasState, canvasState.sites[canvasSiteKey])
      if (options.defer) return
      saveCanvasState()
      applyShellTokens()
      canvasSyncAppearance()
      syncShellMedia()
    }

    function canvasSetBackgroundMode(mode) {
      if (!canvasState) return
      const nextMode = ['image', 'video'].includes(String(mode)) ? String(mode) : 'static'
      const site = canvasState.sites[canvasSiteKey] || {}
      const appearancePatch = {
        background: nextMode,
        ...(nextMode === 'static' || nextMode === 'video' ? { backgroundImageUrl: '', backgroundImageLocalKey: '' } : {}),
        ...(nextMode === 'static' || nextMode === 'image' ? { backgroundVideoUrl: '', backgroundVideoLocalKey: '' } : {}),
      }
      canvasState.sites[canvasSiteKey] = canvasMerge(site, { appearance: appearancePatch })
      canvasEffective = mergeCanvasState(canvasState, canvasState.sites[canvasSiteKey])
      saveCanvasState()
      canvasSyncAppearance()
      syncShellMedia()
    }

    async function canvasSaveMediaFile(kind, file) {
      if (!file || !api.ui.shellMedia?.validateMediaFile) return
      const check = api.ui.shellMedia.validateMediaFile(file, { kind })
      if (!check.ok) {
        api.ui.toast?.(kind === 'video' ? '视频文件超过 50MB 或类型不受支持' : kind === 'image' ? '图片文件超过 20MB 或类型不受支持' : '字体文件超过 10MB 或类型不受支持', { type: 'error' })
        return
      }
      try {
        const db = await ensureMediaDb()
        if (!db || !api.ui.shellMedia.writeMedia) throw new Error('media-store-unavailable')
        const key = mediaOriginKey(kind)
        await api.ui.shellMedia.writeMedia({ db, kind, key, value: file })
        const field = kind === 'video' ? 'backgroundVideoLocalKey' : kind === 'image' ? 'backgroundImageLocalKey' : 'fontLocalKey'
        const site = canvasState?.sites?.[canvasSiteKey] || {}
        const appearancePatch = {
          [field]: key,
          ...(kind === 'video' ? { background: 'video', backgroundVideoUrl: '', backgroundImageUrl: '', backgroundImageLocalKey: '' } : {}),
          ...(kind === 'image' ? { background: 'image', backgroundImageUrl: '', backgroundVideoUrl: '', backgroundVideoLocalKey: '' } : {}),
        }
        canvasState.sites[canvasSiteKey] = canvasMerge(site, { appearance: appearancePatch })
        canvasEffective = mergeCanvasState(canvasState, canvasState.sites[canvasSiteKey])
        saveCanvasState()
        canvasSyncAppearance()
        syncShellMedia()
        api.ui.toast?.('本地资源已保存并应用', { type: 'success' })
      } catch {
        api.ui.toast?.('本地资源保存失败，已保留当前外观', { type: 'error' })
      }
    }

    function canvasChoosePreset(preset) {
      if (!canvasState || !['native-site', 'balanced-glass', 'immersive-video', 'static-readable'].includes(preset)) return
      const values = {
        'native-site': { opacity: 1, blur: 0, background: 'static', backgroundVideoUrl: '', backgroundVideoLocalKey: '', backgroundImageUrl: '', backgroundImageLocalKey: '', fontFamily: '', fontUrl: '', fontLocalKey: '', fontSize: 14, textColor: '', panelColor: '', accentColor: '', radius: 16, motion: 'auto', transparency: 'reduced' },
        'balanced-glass': { opacity: .72, blur: 18, background: 'static', backgroundVideoUrl: '', backgroundVideoLocalKey: '', backgroundImageUrl: '', backgroundImageLocalKey: '', textColor: '', panelColor: '', accentColor: '', motion: 'auto', transparency: 'auto' },
        'immersive-video': { opacity: .56, blur: 22, background: 'video', backgroundVideoUrl: '', backgroundVideoLocalKey: '', backgroundImageUrl: '', backgroundImageLocalKey: '', textColor: '', panelColor: '', accentColor: '', motion: 'auto', transparency: 'auto' },
        'static-readable': { opacity: .94, blur: 0, background: 'static', backgroundVideoUrl: '', backgroundVideoLocalKey: '', backgroundImageUrl: '', backgroundImageLocalKey: '', textColor: '', panelColor: '', accentColor: '', motion: 'reduced', transparency: 'reduced' },
      }[preset]
      const site = canvasState.sites?.[canvasSiteKey]
      if (site?.appearance) {
        const next = { ...site }
        delete next.appearance
        canvasState.sites[canvasSiteKey] = next
      }
      canvasState.global = canvasMerge(canvasState.global, { preset, appearance: values })
      canvasEffective = mergeCanvasState(canvasState, canvasState.sites?.[canvasSiteKey] || {})
      saveCanvasState()
      applyShellTokens()
      canvasSyncAppearance()
      syncShellMedia()
    }

    function canvasResetAppearance() {
      if (!canvasState) return
      const site = canvasState.sites[canvasSiteKey]
      if (site?.appearance) {
        const next = { ...site }
        delete next.appearance
        canvasState.sites[canvasSiteKey] = next
      }
      canvasState.global = canvasMerge(canvasState.global, { preset: 'balanced-glass', appearance: canvasCopy(CANVAS_DEFAULT_APPEARANCE) })
      canvasEffective = mergeCanvasState(canvasState, canvasState.sites?.[canvasSiteKey] || {})
      saveCanvasState()
      applyShellTokens()
      canvasSyncAppearance()
      syncShellMedia()
    }

    function canvasResetLayout() {
      if (!canvasState) return
      const site = canvasState.sites[canvasSiteKey]
      if (site?.layout) {
        const next = { ...site }
        delete next.layout
        canvasState.sites[canvasSiteKey] = next
      }
      canvasEffective = mergeCanvasState(canvasState, canvasState.sites?.[canvasSiteKey] || {})
      saveCanvasState()
      canvasApplySurfaceModes()
    }

    function mountCanvas() {
      const outlet = findRouteOutlet()
      if (!(outlet instanceof Element)) return null
      /* Keep the document-start bootstrap opaque until the real canvas and all
         of its surfaces have been created.  Removing it before ensureCanvasShell
         lets the native route paint for one frame during a full-page topic hop. */
      canvasApplyPageClass()
      markNative(true)
      const el = ensureCanvasShell()
      if (!(el instanceof Element) || !(el.querySelector('#lsb-shell-surfaces') instanceof Element)) return null
      adoptSearch(el.querySelector('[data-canvas-search-host]'))
      adoptThemeToggle(el.querySelector('[data-lsb-shell-theme]'))
      /* Keep the real self card in the reading flow.  The native sidebar
         remains hidden in place; only the card is temporarily adopted by the
         inline slot and is restored before route content is stashed. */
      canvasMountProfile(outlet)
      canvasWatchSidebar()
      canvasSyncText()
      canvasSyncAppearance()
      canvasApplySurfaceModes()
      if (canvasWidthClass === 'wide' || canvasActiveSheet === 'site-card') canvasSyncSiteSidebar()
      else canvasSyncPersistentSiteCards()
      canvasBindWindow()
      canvasScheduleScroll()
      const presets = canvasSurface('appearance-sheet')?.querySelectorAll('[data-canvas-preset]') || []
      for (const button of presets) {
        if (button.dataset.canvasBound === '1') continue
        button.dataset.canvasBound = '1'
        button.addEventListener('click', () => canvasChoosePreset(button.getAttribute('data-canvas-preset')))
      }
      const backgroundButtons = canvasSurface('appearance-sheet')?.querySelectorAll('[data-canvas-background]') || []
      for (const button of backgroundButtons) {
        if (button.dataset.canvasBound === '1') continue
        button.dataset.canvasBound = '1'
        button.addEventListener('click', () => canvasSetBackgroundMode(button.getAttribute('data-canvas-background')))
      }
      const controls = canvasSurface('appearance-sheet')?.querySelectorAll('[data-canvas-appearance]') || []
      for (const input of controls) {
        if (input.dataset.canvasBound === '1') continue
        input.dataset.canvasBound = '1'
        const update = () => {
          canvasSetAppearance(input.getAttribute('data-canvas-appearance'), input.value)
        }
        input.addEventListener(input.type === 'range' ? 'input' : 'change', update)
      }
      const mediaInputs = canvasSurface('appearance-sheet')?.querySelectorAll('[data-canvas-media-file]') || []
      for (const input of mediaInputs) {
        if (input.dataset.canvasBound === '1') continue
        input.dataset.canvasBound = '1'
        input.addEventListener('change', () => {
          const file = input.files?.[0]
          void canvasSaveMediaFile(input.getAttribute('data-canvas-media-file'), file).finally(() => { input.value = '' })
        })
      }
      const resetAppearance = canvasSurface('appearance-sheet')?.querySelector('[data-canvas-reset-appearance]')
      const resetLayout = canvasSurface('appearance-sheet')?.querySelector('[data-canvas-reset-layout]')
      const saveAppearance = canvasSurface('appearance-sheet')?.querySelector('[data-canvas-save-appearance]')
      if (saveAppearance && saveAppearance.dataset.canvasBound !== '1') {
        saveAppearance.dataset.canvasBound = '1'
        saveAppearance.addEventListener('click', canvasSaveAppearance)
      }
      if (resetAppearance && resetAppearance.dataset.canvasBound !== '1') {
        resetAppearance.dataset.canvasBound = '1'
        resetAppearance.addEventListener('click', canvasResetAppearance)
      }
      if (resetLayout && resetLayout.dataset.canvasBound !== '1') {
        resetLayout.dataset.canvasBound = '1'
        resetLayout.addEventListener('click', canvasResetLayout)
      }
      document.documentElement.classList.remove('lsb-canvas-boot')
      document.getElementById('lsb-shell-boot-frame')?.remove()
      return el
    }

    function unmountCanvas() {
      canvasEndDrag(false)
      canvasUnbindWindow()
      canvasUnbindSelection()
      canvasUnbindEvents()
      canvasStopSidebarWatch()
      canvasCloseSurface(canvasActiveSheet, false)
      canvasRestoreSiteSidebar({ releasePersistent: true })
      canvasRestoreProfile()
      restoreCanvasTopLinks()
      canvasSurfaceHost = null
      restoreSearch()
      canvasShell?.remove()
      canvasShell = null
      canvasActiveSheet = ''
      canvasFocusReturn = null
      document.querySelector('.lsb-canvas-content-root')?.classList.remove('lsb-canvas-content-root')
      for (const name of ['canvas-mode', 'lsb-canvas-page-home', 'lsb-canvas-page-forum', 'lsb-canvas-page-topic', 'lsb-canvas-page-user', 'lsb-canvas-page-settings', 'lsb-canvas-page-page']) document.documentElement.classList.remove(name)
    }

    function stripShellWindowChrome(el) {
      if (!(el instanceof Element)) return
      el.querySelector('#lsb-shell-window-content')?.remove()
      el.querySelector('[data-lsb-shell-window-switcher]')?.remove()
      el.querySelectorAll('[data-lsb-shell-window-bar], [data-lsb-shell-window-drag], [data-lsb-shell-window-action], [data-lsb-shell-resize-edge]')
        .forEach((node) => node.remove())
      for (const node of el.querySelectorAll('[data-lsb-shell-window]')) node.removeAttribute('data-lsb-shell-window')
      el.removeAttribute('data-lsb-shell-mode')
    }

    function ensureShell() {
      let el = document.getElementById('lsb-shell')
      if (el) {
        if (el.parentNode !== document.body) document.body.append(el)
        stripShellWindowChrome(el)
        return el
      }
      el = document.createElement('div')
      el.id = 'lsb-shell'
      const nativeBrand = document.querySelector('body > .top a.brand')
      const brandName = 'LINUX SB'
      const nativeLogo = nativeBrand?.querySelector('img[src], source[src]')
      const logoSrc =
        (nativeLogo instanceof Element && nativeLogo.getAttribute('src'))
        || document.querySelector('link[rel~="icon"]')?.getAttribute('href')
        || '/app/assets/index.svg'
      el.innerHTML = `
        <header id="lsb-shell-header">
          <a class="lsb-shell-brand" href="/"><img class="lsb-shell-logo" src="${esc(logoSrc)}" alt="" width="22" height="22">${esc(brandName)}</a>
          <div class="lsb-shell-search-host"></div>
          <nav class="lsb-shell-extras" data-lsb-shell-extras aria-label="站点入口"></nav>
          <div class="lsb-shell-where" data-lsb-shell-where></div>
          <div class="lsb-shell-theme" data-lsb-shell-theme></div>
        </header>
        <div id="lsb-shell-workspace" data-lsb-shell-workspace>
        <aside id="lsb-shell-rail" aria-label="氢导航" data-lsb-shell-window="nav">
          <div class="lsb-shell-rail-scroll">
            <div class="lsb-shell-me" data-lsb-shell-me></div>
            <div data-lsb-shell-section="home"></div>
            <div data-lsb-shell-section="boards"></div>
            <div data-lsb-shell-section="tools"></div>
          </div>
          <div class="lsb-shell-rail-foot">
            <button type="button" class="lsb-shell-settings" data-lsb-shell-settings>设置</button>
          </div>
        </aside>
        <aside id="lsb-shell-aside" aria-label="站点信息" data-lsb-shell-window="site">
          <nav id="lsb-shell-aside-tabs" role="tablist" aria-label="右栏视图" hidden></nav>
          <div class="lsb-shell-aside-panes">
            <section data-lsb-shell-aside-pane="site" data-lsb-shell-site aria-label="站点" tabindex="0"></section>
          </div>
        </aside>
        <section id="lsb-shell-window-content" class="lsb-shell-window" data-lsb-shell-window="content" role="region" aria-labelledby="lsb-shell-window-content-title">
          <div class="lsb-shell-window-bar" data-lsb-shell-window-bar>
            <strong id="lsb-shell-window-content-title" class="lsb-shell-window-title">正文</strong>
            <span class="lsb-shell-window-drag" data-lsb-shell-window-drag aria-hidden="true"></span>
            <button type="button" class="lsb-shell-window-action" data-lsb-shell-window-reset aria-label="恢复正文窗口布局" title="恢复布局">↺</button>
          </div>
          <div class="lsb-shell-window-body lsb-shell-window-content-body" data-lsb-shell-window-body></div>
        </section>
        <nav class="lsb-shell-window-switcher" data-lsb-shell-window-switcher role="tablist" aria-label="氢壳窗口切换"></nav>
        </div>`
      stripShellWindowChrome(el)
      el.querySelector('[data-lsb-shell-settings]').addEventListener('click', () => api.ui.openPanel('skin'))
      el.querySelector('#lsb-shell-rail').addEventListener('click', (e) => {
        const rpcBtn = e.target.closest('[data-lsb-rpc]')
        if (rpcBtn) {
          e.preventDefault()
          api.request(rpcBtn.getAttribute('data-lsb-rpc'))
          return
        }
        const btn = e.target.closest('[data-lsb-panel]')
        if (!btn) return
        e.preventDefault()
        api.ui.openPanel(btn.getAttribute('data-lsb-panel'))
      })
      document.body.append(el)
      return el
    }

    function syncShellRoute(el = document.getElementById('lsb-shell')) {
      if (cfg.shell && el?.getAttribute?.('data-lsb-canvas-shell') === 'true') {
        canvasApplyPageClass()
        markNative(true)
        canvasSyncText()
        canvasSyncAppearance()
        canvasApplySurfaceModes()
        canvasWatchSidebar()
        return
      }
      applyMarkers()
      if (!(el instanceof Element)) return
      const where = el.querySelector('[data-lsb-shell-where]')
      if (where) where.textContent = locationText()
      paintActive(el.querySelector('[data-lsb-shell-section="home"]'))
      paintActive(el.querySelector('[data-lsb-shell-section="boards"]'))
      const timeline = ensureTimeline(el)
      if (timeline) {
        bindWindow()
        scheduleTimeline()
      } else {
        unbindWindow()
      }
      syncAsideViews(el)
    }

    function fillShell() {
      if (!(findRouteOutlet() instanceof Element)) return null
      const el = ensureShell()
      if (shellWindowEnabled()) mountShellWindows(el)
      pruneDetachedAsideCards()
      adoptSearch(el.querySelector('.lsb-shell-search-host'))
      adoptTopExtras(el.querySelector('[data-lsb-shell-extras]'))
      adoptThemeToggle(el.querySelector('[data-lsb-shell-theme]'))
      adoptUserCard(el.querySelector('[data-lsb-shell-me]'))
      adoptAsideCards(el.querySelector('[data-lsb-shell-site]'))
      watchOnlineCard()
      watchTopExtras()
      setSection(el.querySelector('[data-lsb-shell-section="home"]'), '', [
        { href: '/', label: '全部主题' },
      ])
      setSection(el.querySelector('[data-lsb-shell-section="boards"]'), '版块', collectBoards())
      setSection(el.querySelector('[data-lsb-shell-section="tools"]'), '工具', collectTools())
      syncShellRoute(el)
      syncShellScrollBridge(canvasHomeScrollRoot() || contentScroller)
      syncHomeInfiniteScroll()
      syncShellMedia()
      return el
    }

    function refreshRouteEnhancements(serial) {
      if (serial !== spaSerial) return false
      applyMarkers()
      fillShell()
      refreshNativeRouteEnhancements()
      scheduleOnlineUserRefresh(0, true, true)
      if (serial !== spaSerial) return false
      try {
        const EventCtor = window.CustomEvent || CustomEvent
        document.dispatchEvent(new EventCtor(SPA_ROUTE_COMMITTED_EVENT, {
          detail: { href: location.href, serial },
        }))
      } catch {
        /* A native enhancement hook is optional and must not block routing. */
      }
      spaFilledSerial = serial
      return true
    }

    function isHomeInfPath(urlLike = location.href) {
      try {
        const url = new URL(urlLike, location.href)
        const path = url.pathname.replace(/\/{2,}/g, '/') || '/'
        if (path !== '/' && path !== '/index.php') return false
        if (url.searchParams.get('q')) return false
        return true
      } catch {
        return false
      }
    }

    function homeInfEnabled() {
      if ((document.cookie.match(/(?:^|; )sb_infinite_scroll_enabled=([^;]*)/) || [])[1] === '0') return false
      const config = window.__sbInfiniteScrollConfig || window.__infiniteScrollConfig || {}
      return config.enabled !== false
    }

    function homeInfTopicKey(item) {
      const title = item?.querySelector?.('.post-title')
      const href = title?.getAttribute('href') || ''
      if (href) return href.replace(/([?&])replyid=[^&]*/g, '').replace(/([?&])p=[^&]*/g, '')
      return `${(title?.textContent || '').trim()}|${(item?.textContent || '').trim().slice(0, 80)}`
    }

    function homeInfHasNext(root) {
      const pag = root?.querySelector?.('.pagination-bar') || root
      if (!pag?.querySelectorAll) return false
      for (const a of pag.querySelectorAll('a')) {
        if ((a.textContent || '').trim() === '下一页') return true
      }
      const page = homeInf?.page || 1
      for (const el of pag.querySelectorAll('a, span')) {
        const num = parseInt(el.textContent, 10)
        if (num > page) return true
      }
      return false
    }

    function rememberHomeInfState(state) {
      if (!state?.list) return
      homeInfRecords.set(state.list, {
        page: state.page,
        loaded: state.loaded,
        seen: state.seen,
        hasMore: state.hasMore,
      })
    }

    function unbindHomeInfiniteScroll() {
      if (!homeInf) return
      const state = homeInf
      rememberHomeInfState(state)
      for (const target of state.scrollTargets || [window]) target.removeEventListener?.('scroll', state.onScroll)
      if (state.scrollTimer) {
        window.clearTimeout(state.scrollTimer)
        state.scrollTimer = 0
      }
      state.status?.remove()
      state.controller?.abort()
      homeInf = null
    }

    function homeInfStateActive(state) {
      if (!state || homeInf !== state || !isHomeInfPath()) return false
      let routeKey
      try {
        routeKey = viewCacheKey(location.href)
      } catch {
        return false
      }
      return (
        state.routeKey === routeKey
        && state.list?.isConnected
        && state.list === document.querySelector('.main-panel > ul.post-list')
        && state.pagination?.isConnected
        && state.pagination === document.querySelector('.pagination-bar')
      )
    }

    function hideHomePagination(pagination) {
      if (!(pagination instanceof Element)) return
      pagination.classList.add('sb-infinite-scroll-pagination-hidden')
      pagination.setAttribute('aria-hidden', 'true')
      pagination.setAttribute('data-lsb-shell-inf', '1')
    }

    function setHomeInfStatus(kind, text) {
      if (!homeInf?.pagination?.parentNode) return
      homeInf.status?.remove()
      if (!kind) {
        homeInf.status = null
        return
      }
      const el = document.createElement('div')
      el.className = kind === 'end' ? 'infinite-scroll-end' : 'infinite-scroll-loader'
      el.setAttribute('data-lsb-inf-status', kind)
      el.textContent = text
      homeInf.pagination.parentNode.insertBefore(el, homeInf.pagination)
      homeInf.status = el
    }

    async function loadHomeInfPage() {
      const state = homeInf
      if (!homeInfStateActive(state) || state.loading || !state.hasMore) return
      state.loading = true
      setHomeInfStatus('loading', '加载中...')
      let next = state.page + 1
      while (state.loaded[next]) next += 1
      const url = new URL(location.href)
      url.searchParams.set('p', String(next))
      try {
        const res = await api.net.raw(`${url.pathname}${url.search}`, {
          queue: false,
          timeout: 15000,
          retry: 0,
          ...(state.controller?.signal ? { signal: state.controller.signal } : {}),
        })
        if (!homeInfStateActive(state)) return
        if (!res.ok) throw new Error(`HTTP ${res.status}`)
        const doc = new DOMParser().parseFromString(res.text, 'text/html')
        const remoteList = doc.querySelector('.main-panel > ul.post-list, ul.post-list')
        const items = remoteList
          ? [...remoteList.children].filter((item) => item.matches?.('.post-item') && !item.classList.contains('post-entry'))
          : []
        if (!items.length) {
          state.hasMore = false
          rememberHomeInfState(state)
          setHomeInfStatus('end', '没有更多内容了')
          return
        }
        const fresh = []
        for (const item of items) {
          const key = homeInfTopicKey(item)
          if (key && state.seen[key]) continue
          if (key) state.seen[key] = true
          fresh.push(document.importNode(item, true))
        }
        if (fresh.length) state.list.append(...fresh)
        const pagHtml = doc.querySelector('.pagination-bar')?.innerHTML
        if (pagHtml) state.pagination.innerHTML = pagHtml
        hideHomePagination(state.pagination)
        state.loaded[next] = true
        state.page = Math.max(state.page, next)
        if (!homeInfHasNext(doc)) {
          state.hasMore = false
          setHomeInfStatus('end', '没有更多内容了')
        } else {
          setHomeInfStatus(null)
        }
        rememberHomeInfState(state)
        document.dispatchEvent(new CustomEvent('sb:topic-list-updated', {
          detail: { list: state.list, items: fresh, page: next, source: 'lsb_shell' },
        }))
      } catch {
        if (homeInf !== state) return
        setHomeInfStatus('end', '加载失败，继续滚动或点分页重试')
      } finally {
        if (homeInf === state) state.loading = false
      }
    }

    function bindHomeInfiniteScroll(list, pagination) {
      const prior = homeInfRecords.get(list)
      const seen = prior?.seen || {}
      if (!prior) {
        for (const item of list.children) {
          if (item.matches?.('.post-item')) {
            const key = homeInfTopicKey(item)
            if (key) seen[key] = true
          }
        }
      }
      const pageFromUrl = parseInt(new URL(location.href).searchParams.get('p'), 10) || 1
      const loaded = prior?.loaded || {}
      loaded[pageFromUrl] = true
      const page = Math.max(pageFromUrl, Number(prior?.page) || pageFromUrl)
      const scrollRoot = canvasHomeScrollRoot()
      const scrollTargets = scrollRoot ? [scrollRoot, window] : [window]
      const onScroll = () => {
        if (!homeInfStateActive(homeInf) || homeInf.loading || !homeInf.hasMore) return
        if (homeInf.scrollTimer) return
        homeInf.scrollTimer = window.setTimeout(() => {
          if (homeInf) homeInf.scrollTimer = 0
          if (!homeInfStateActive(homeInf) || homeInf.list !== list) return
          const rect = list.getBoundingClientRect()
          const root = homeInf.scrollRoot instanceof Element ? homeInf.scrollRoot : null
          const rootRect = root?.getBoundingClientRect?.()
          const viewportBottom = root
            ? (Number(rootRect?.bottom) || Number(rootRect?.top || 0) + Number(root.clientHeight || 0))
            : (window.innerHeight || 0)
          const distance = rect.bottom - viewportBottom
          if (distance <= 100) void loadHomeInfPage()
        }, 80)
      }
      hideHomePagination(pagination)
      homeInf = {
        list,
        pagination,
        routeKey: viewCacheKey(location.href),
        seen,
        loaded,
        page,
        loading: false,
        hasMore: prior ? prior.hasMore : homeInfHasNext(document),
        onScroll,
        scrollRoot,
        scrollTargets,
        scrollTimer: 0,
        status: null,
        controller: typeof AbortController === 'function' ? new AbortController() : null,
      }
      rememberHomeInfState(homeInf)
      if (!homeInf.hasMore) {
        setHomeInfStatus('end', '没有更多内容了')
        return
      }
      for (const target of scrollTargets) target.addEventListener?.('scroll', onScroll, { passive: true })
    }

    function syncHomeInfiniteScroll() {
      if (!cfg.shell || !isHomeInfPath() || !homeInfEnabled()) {
        unbindHomeInfiniteScroll()
        return
      }
      const list = document.querySelector('.main-panel > ul.post-list')
      const pagination = document.querySelector('.pagination-bar')
      if (!list || !pagination || containsTopicPostContent(list)) {
        unbindHomeInfiniteScroll()
        return
      }
      const routeKey = viewCacheKey(location.href)
      const scrollRoot = canvasHomeScrollRoot()
      if (
        homeInf?.list === list
        && homeInf.pagination === pagination
        && homeInf.routeKey === routeKey
        && homeInf.scrollRoot === scrollRoot
      ) return
      unbindHomeInfiniteScroll()
      if (
        pagination.classList.contains('sb-infinite-scroll-pagination-hidden')
        && !pagination.hasAttribute('data-lsb-shell-inf')
        && !(scrollRoot instanceof Element)
      ) return
      bindHomeInfiniteScroll(list, pagination)
    }

    const NATIVE_THREAD_VISIBLE_LIMIT = 5

    function nativeThreadFloor(value) {
      const text = String(value || '')
      return /^[1-9]\d*$/.test(text) ? text : ''
    }

    function nativeThreadParentFromContent(row, replyRows) {
      for (const link of row.querySelectorAll('.post-content a[href]')) {
        try {
          const url = new URL(link.href, location.href)
          const floor = nativeThreadFloor(url.searchParams.get('floor'))
          if (floor) return floor
          const replyId = nativeThreadFloor(url.searchParams.get('replyid') || url.searchParams.get('reply_id'))
          const parentFloor = replyId ? nativeThreadFloor(replyRows.get(replyId)?.dataset.floor) : ''
          if (parentFloor) return parentFloor
        } catch {
          /* A malformed quote link cannot determine a parent. */
        }
      }
      return nativeThreadFloor(String(row.querySelector('.post-content')?.textContent || '').match(/@[^\s#]+\s+#([1-9]\d*)\b/u)?.[1])
    }

    function nativeThreadParentFromForm(form) {
      if (!(form instanceof HTMLFormElement)) return ''
      const explicit = form.dataset.quoteThreadsParentFloor
        || form.querySelector('[name="quote_threads_parent_floor"], [name="parent_floor"], [data-quote-threads-parent-floor]')?.value
      const explicitFloor = nativeThreadFloor(explicit)
      if (explicitFloor) return explicitFloor
      const body = form.querySelector('textarea[name="body"], textarea[name="content"], [contenteditable="true"]')
      const text = 'value' in (body || {}) ? body.value : body?.textContent
      return nativeThreadFloor(String(text || '').match(/@[^ #]+ +#([1-9][0-9]*)/u)?.[1])
    }

    function nativeThreadReplyId(row) {
      return String(row?.id || '').match(/^post-([1-9][0-9]*)$/)?.[1] || ''
    }

    function addNativeThreadReference(row, parentFloor) {
      const floor = nativeThreadFloor(parentFloor)
      if (!(row instanceof Element) || !floor) return
      const meta = row.querySelector('.post-meta')
      if (!(meta instanceof Element)) return
      let reference = meta.querySelector(':scope > .quote-threads-reference')
      if (!reference) {
        reference = document.createElement('span')
        reference.className = 'quote-threads-reference'
        meta.prepend(reference)
      }
      reference.textContent = `回复 #${floor}`
      reference.dataset.quoteThreadsParentFloor = floor
    }

    function normalizeNativeThreadLinks(rows, byFloor) {
      const currentTopic = topicSpaUrl(location.href)
      if (!currentTopic) return
      const normalize = (link, ownReplyId = '') => {
        if (!(link instanceof HTMLAnchorElement)) return
        let url
        try {
          url = new URL(link.getAttribute('href') || link.href, location.href)
        } catch {
          return
        }
        if (url.origin !== currentTopic.origin || url.pathname !== currentTopic.pathname) return
        const floor = nativeThreadFloor(url.searchParams.get('floor'))
        const replyId = ownReplyId || (floor ? nativeThreadReplyId(byFloor.get(floor)) : '')
        if (!replyId) return
        url.searchParams.delete('floor')
        url.searchParams.delete('p')
        url.searchParams.delete('reply_id')
        url.searchParams.set('replyid', replyId)
        link.setAttribute('href', url.href)
      }
      for (const row of rows) {
        const ownReplyId = nativeThreadReplyId(row)
        for (const link of row.querySelectorAll('a[href]')) normalize(link, link.classList.contains('post-floor') ? ownReplyId : '')
      }
    }

    function handleNativeReplySubmit(event) {
      const form = event.target instanceof HTMLFormElement
        ? event.target
        : event.target?.closest?.('form.ajax-reply-form')
      if (!(form instanceof HTMLFormElement)) return
      const parentFloor = nativeThreadParentFromForm(form)
      if (parentFloor) nativeReplyParentByForm.set(form, parentFloor)
    }

    function handleNativeReplySaved(event) {
      const detail = event.detail && typeof event.detail === 'object' ? event.detail : {}
      const form = detail.form instanceof HTMLFormElement ? detail.form : null
      const replyCandidate = detail.reply || detail.post || detail.element || event.target
      const reply = replyCandidate instanceof Element
        ? (replyCandidate.matches('li.post-item.post-entry') ? replyCandidate : replyCandidate.closest('li.post-item.post-entry'))
        : null
      if (!reply) return
      const parentFloor = nativeThreadFloor(nativeReplyParentByForm.get(form))
        || nativeThreadFloor(reply.dataset.quoteThreadsParentFloor)
        || nativeThreadParentFromContent(reply, new Map())
      if (parentFloor) reply.dataset.quoteThreadsParentFloor = parentFloor
      const list = reply.closest('ul.post-list.topic-post-list') || nativeThreadList
      if (list) rebuildNativeThreadTree(list)
    }

    function bindNativeThreadLifecycle() {
      if (nativeThreadLifecycleBound) return
      nativeThreadLifecycleBound = true
      document.addEventListener('submit', handleNativeReplySubmit, true)
      document.addEventListener('bbs1:reply-saved', handleNativeReplySaved)
    }

    function unbindNativeThreadLifecycle() {
      if (!nativeThreadLifecycleBound) return
      nativeThreadLifecycleBound = false
      document.removeEventListener('submit', handleNativeReplySubmit, true)
      document.removeEventListener('bbs1:reply-saved', handleNativeReplySaved)
    }

    function renderNativeThreadCollapse(list, root, rootRow, branch) {
      if (!(rootRow instanceof Element) || branch.length <= NATIVE_THREAD_VISIBLE_LIMIT) return
      const containsTarget = branch.some((row) => (
        row.classList.contains('post-highlight')
        || (new URL(location.href).searchParams.get('replyid') && row.id === `post-${new URL(location.href).searchParams.get('replyid')}`)
        || (new URL(location.href).searchParams.get('floor') && row.dataset.floor === new URL(location.href).searchParams.get('floor'))
      ))
      if (containsTarget && rootRow.dataset.quoteThreadsTargetRevealed !== '1') {
        rootRow.dataset.quoteThreadsExpanded = '1'
        rootRow.dataset.quoteThreadsTargetRevealed = '1'
      }
      const expanded = rootRow.dataset.quoteThreadsExpanded === '1'
      branch.forEach((row, index) => {
        row.classList.toggle('quote-threads-is-collapsed', !expanded && index >= NATIVE_THREAD_VISIBLE_LIMIT)
      })
      if (!expanded) {
        branch[branch.length - 1].classList.remove('quote-threads-thread-end')
        branch[NATIVE_THREAD_VISIBLE_LIMIT - 1].classList.add('quote-threads-thread-end')
      }
      const toggleRow = document.createElement('li')
      toggleRow.className = 'quote-threads-toggle-row'
      const button = document.createElement('button')
      button.type = 'button'
      button.className = 'quote-threads-toggle'
      button.dataset.quoteThreadsToggle = root
      button.dataset.expanded = expanded ? '1' : '0'
      button.setAttribute('aria-expanded', expanded ? 'true' : 'false')
      button.textContent = expanded ? '收起讨论串' : `展开剩余 ${branch.length - NATIVE_THREAD_VISIBLE_LIMIT} 条回复`
      toggleRow.append(button)
      ;(expanded ? branch[branch.length - 1] : branch[NATIVE_THREAD_VISIBLE_LIMIT - 1]).after(toggleRow)
    }

    function rebuildNativeThreadTree(list) {
      if (!(list instanceof Element)) return
      list.querySelectorAll(':scope > .quote-threads-toggle-row').forEach((row) => row.remove())
      const rows = [...list.querySelectorAll(':scope > li.post-item.post-entry')]
      list.dataset.quoteThreadsCollapseReady = '1'
      if (rows.length < 2) return

      const byFloor = new Map()
      const replyRows = new Map()
      const parents = new Map()
      const roots = new Map()
      const branches = new Map()
      const branchRoots = []

      rows.forEach((row) => {
        row.dataset.quoteThreadsProcessed = '1'
        row.querySelectorAll('.quote-threads-reference').forEach((reference) => reference.remove())
        const floor = nativeThreadFloor(row.dataset.floor)
        if (floor) byFloor.set(floor, row)
        const replyId = String(row.id || '').match(/^post-([1-9][0-9]*)$/)?.[1] || ''
        if (replyId) replyRows.set(replyId, row)
        row.classList.remove(
          'quote-threads-child',
          'quote-threads-cross-page',
          'quote-threads-thread-item',
          'quote-threads-thread-end',
          'quote-threads-is-collapsed',
        )
      })

      rows.forEach((row) => {
        const floor = nativeThreadFloor(row.dataset.floor)
        let parentFloor = nativeThreadFloor(row.dataset.quoteThreadsParentFloor)
        if (!parentFloor) {
          parentFloor = nativeThreadParentFromContent(row, replyRows)
          if (parentFloor) row.dataset.quoteThreadsParentFloor = parentFloor
        }
        if (!floor || !parentFloor || parentFloor === floor) return
        addNativeThreadReference(row, parentFloor)
        if (byFloor.has(parentFloor)) parents.set(floor, parentFloor)
        else row.classList.add('quote-threads-cross-page')
      })
      normalizeNativeThreadLinks(rows, byFloor)

      const rootFloor = (floor) => {
        if (roots.has(floor)) return roots.get(floor)
        const trail = []
        const seen = new Set()
        let current = floor
        let root = floor
        while (true) {
          if (roots.has(current)) {
            root = roots.get(current)
            break
          }
          if (seen.has(current)) break
          seen.add(current)
          trail.push(current)
          const parentFloor = parents.get(current)
          if (!parentFloor) {
            root = current
            break
          }
          current = parentFloor
        }
        trail.forEach((value) => roots.set(value, root))
        return root
      }

      rows.forEach((row, index) => {
        const floor = nativeThreadFloor(row.dataset.floor)
        const root = floor ? rootFloor(floor) : `@${index}`
        if (!branches.has(root)) {
          branches.set(root, [])
          branchRoots.push(root)
        }
        branches.get(root).push(row)
      })

      const orderedRows = []
      const collapsibleBranches = []
      for (const root of branchRoots) {
        const rootRow = byFloor.get(root)
        const storedBranch = branches.get(root)
        const branch = rootRow && storedBranch.length > 1
          ? [rootRow, ...storedBranch.filter((row) => row !== rootRow)]
          : storedBranch
        if (rootRow && branch.length > 1) {
          branch.forEach((row) => {
            row.classList.add('quote-threads-thread-item')
            if (row !== rootRow) row.classList.add('quote-threads-child')
          })
          branch[branch.length - 1].classList.add('quote-threads-thread-end')
          collapsibleBranches.push([root, rootRow, branch])
        } else if (branch.length === 1 && branch[0].classList.contains('quote-threads-cross-page')) {
          branch[0].classList.add('quote-threads-thread-item', 'quote-threads-child', 'quote-threads-thread-end')
        }
        branch.forEach((row) => orderedRows.push(row))
      }

      if (!rows.every((row, index) => row === orderedRows[index])) {
        const fragment = document.createDocumentFragment()
        orderedRows.forEach((row) => fragment.append(row))
        list.append(fragment)
      }
      collapsibleBranches.forEach(([root, rootRow, branch]) => renderNativeThreadCollapse(list, root, rootRow, branch))
    }

    function clearNativeThreadObserver() {
      nativeThreadObserver?.disconnect?.()
      nativeThreadObserver = null
      nativeThreadList = null
      if (nativeThreadApplyTimer) {
        window.clearTimeout(nativeThreadApplyTimer)
        nativeThreadApplyTimer = 0
      }
    }

    function observeNativeThreadTree(list) {
      if (!(list instanceof Element)) {
        clearNativeThreadObserver()
        return
      }
      bindNativeThreadLifecycle()
      if (nativeThreadList === list && nativeThreadObserver) {
        rebuildNativeThreadTree(list)
        return
      }
      clearNativeThreadObserver()
      nativeThreadList = list
      if (list.dataset.lsbNativeThreadBound !== '1') {
        list.dataset.lsbNativeThreadBound = '1'
        list.addEventListener('click', (event) => {
          const button = event.target?.closest?.('[data-quote-threads-toggle]')
          if (!(button instanceof HTMLButtonElement)) return
          const root = nativeThreadFloor(button.dataset.quoteThreadsToggle)
          const rootRow = [...list.querySelectorAll(':scope > li.post-item.post-entry')]
            .find((row) => nativeThreadFloor(row.dataset.floor) === root)
          if (!rootRow) return
          rootRow.dataset.quoteThreadsExpanded = button.dataset.expanded === '1' ? '0' : '1'
          rebuildNativeThreadTree(list)
        })
      }
      rebuildNativeThreadTree(list)
      if (typeof MutationObserver !== 'function') return
      nativeThreadObserver = new MutationObserver((records) => {
        const hasNewReply = records.some((record) => [...record.addedNodes].some((node) => (
          node instanceof Element
          && (node.matches('li.post-item.post-entry') || !!node.querySelector('li.post-item.post-entry'))
          && [...(node.matches('li.post-item.post-entry') ? [node] : node.querySelectorAll('li.post-item.post-entry'))]
            .some((reply) => reply.dataset.quoteThreadsProcessed !== '1')
        )))
        if (hasNewReply && !nativeThreadApplyTimer) {
          nativeThreadApplyTimer = window.setTimeout(() => {
            nativeThreadApplyTimer = 0
            if (nativeThreadList === list && list.isConnected) rebuildNativeThreadTree(list)
          }, 0)
        }
      })
      nativeThreadObserver.observe(list, { childList: true, subtree: true })
    }

    function nativeCapVerificationSetStatus(root, message, error = false) {
      const status = root?.querySelector?.('[data-cap-verification-status]')
      if (!(status instanceof HTMLElement)) return
      status.textContent = message
      if (error) status.setAttribute('data-cap-error', '1')
      else status.removeAttribute('data-cap-error')
    }

    function nativeCapVerificationLoad(root) {
      const scriptUrl = root?.getAttribute?.('data-cap-widget-script') || ''
      const wasmUrl = root?.getAttribute?.('data-cap-wasm-url') || ''
      if (wasmUrl) window.CAP_CUSTOM_WASM_URL = wasmUrl
      if (window.__capVerificationWidgetPromise) return Promise.resolve(window.__capVerificationWidgetPromise)
      if (window.customElements?.get?.('cap-widget')) return Promise.resolve()
      if (!scriptUrl) return Promise.resolve()
      try {
        const promise = import(scriptUrl)
        window.__capVerificationWidgetPromise = promise
        promise.catch((error) => { window.__capVerificationWidgetError = error })
        return promise
      } catch (error) {
        return Promise.reject(error)
      }
    }

    function prepareNativeCapVerification(root = document) {
      const widgets = []
      if (root?.matches?.('[data-cap-verification]')) widgets.push(root)
      root?.querySelectorAll?.('[data-cap-verification]')?.forEach((widget) => widgets.push(widget))
      for (const widget of widgets) {
        if (widget.dataset.capVerificationBound !== '1') {
          widget.dataset.capVerificationBound = '1'
          const capWidget = widget.querySelector('cap-widget')
          capWidget?.addEventListener?.('solve', () => {
            nativeCapVerificationSetStatus(widget, '人机验证已完成，可以提交。')
          })
          capWidget?.addEventListener?.('error', () => {
            nativeCapVerificationSetStatus(widget, '人机验证失败，请重新验证。', true)
          })
        }
        nativeCapVerificationLoad(widget).then(() => {
          if (!widget.isConnected) return
          const form = widget.closest('form')
          const token = form?.querySelector('input[name="cap_token"]')
          if (!token || !String(token.value || '').trim()) {
            nativeCapVerificationSetStatus(widget, '人机验证已加载，请完成验证。')
          }
        }).catch(() => {
          nativeCapVerificationSetStatus(widget, '人机验证加载失败，请刷新页面后重试。', true)
        })
      }
    }

    function nativeCaptchaHex(buffer) {
      return [...new Uint8Array(buffer)].map((value) => value.toString(16).padStart(2, '0')).join('')
    }

    async function solveNativeCaptcha(widget) {
      if (!(widget instanceof Element) || !widget.isConnected) return false
      const epoch = nativeCaptchaEpoch
      const powInput = widget.querySelector('input[name="native_captcha_pow"]')
      if (!powInput || powInput.value) return true
      const status = widget.querySelector('[data-native-captcha-status]')
      if (widget.dataset.powRequired === '0') {
        if (status) status.textContent = '微信浏览器已免除浏览器校验'
        return true
      }
      const generation = widget.dataset.powGeneration || ''
      const prefix = widget.dataset.powPrefix || ''
      const zeroes = Math.max(2, Math.min(5, Number(widget.dataset.powZeroes || 3)))
      const cryptoApi = window.crypto
      const TextEncoderCtor = window.TextEncoder || globalThis.TextEncoder
      if (!cryptoApi?.subtle || typeof TextEncoderCtor !== 'function') {
        if (status) status.textContent = '当前浏览器不支持浏览器校验，请换用新版浏览器'
        return false
      }
      const target = '0'.repeat(zeroes)
      const encoder = new TextEncoderCtor()
      if (status) status.textContent = '校验准备中…'
      for (let i = 0; i < 2000000; i += 1) {
        const nonce = i.toString(16)
        const digest = nativeCaptchaHex(await cryptoApi.subtle.digest('SHA-256', encoder.encode(`${prefix}:${nonce}`)))
        if (epoch !== nativeCaptchaEpoch || !widget.isConnected) return false
        if (digest.slice(0, zeroes) === target) {
          if ((widget.dataset.powGeneration || '') !== generation) return false
          powInput.value = nonce
          if (status) status.textContent = '校验已就绪'
          return true
        }
        if (i > 0 && i % 250 === 0) await new Promise((resolve) => window.setTimeout(resolve, 0))
      }
      if (status) status.textContent = '浏览器校验准备超时，请刷新页面后重试'
      return false
    }

    function prepareNativeCaptcha(root = document) {
      const widgets = []
      if (root?.matches?.('[data-native-captcha]')) widgets.push(root)
      root?.querySelectorAll?.('[data-native-captcha]')?.forEach((widget) => widgets.push(widget))
      for (const widget of widgets) {
        if (nativeCaptchaSolvers.has(widget)) continue
        const task = solveNativeCaptcha(widget)
        nativeCaptchaSolvers.set(widget, task)
        task.then(
          () => {
            if (nativeCaptchaSolvers.get(widget) === task) nativeCaptchaSolvers.delete(widget)
          },
          () => {
            if (nativeCaptchaSolvers.get(widget) === task) nativeCaptchaSolvers.delete(widget)
          },
        )
      }
    }

    function clearNativeCaptchaObserver() {
      nativeCaptchaEpoch += 1
      nativeCaptchaObserver?.disconnect?.()
      nativeCaptchaObserver = null
      if (nativeCaptchaApplyTimer) {
        window.clearTimeout(nativeCaptchaApplyTimer)
        nativeCaptchaApplyTimer = 0
      }
    }

    function bindNativeCaptchaObserver() {
      if (nativeCaptchaObserver || typeof MutationObserver !== 'function' || !document.body) return
      nativeCaptchaObserver = new MutationObserver((records) => {
        const roots = []
        for (const record of records) {
          for (const node of record.addedNodes) {
            if (!(node instanceof Element)) continue
            const hasNativeCaptcha = node.matches('[data-native-captcha]') || !!node.querySelector('[data-native-captcha]')
            const hasCapVerification = node.matches('[data-cap-verification]') || !!node.querySelector('[data-cap-verification]')
            if (hasNativeCaptcha || hasCapVerification) roots.push(node)
          }
        }
        if (!roots.length || nativeCaptchaApplyTimer) return
        nativeCaptchaApplyTimer = window.setTimeout(() => {
          nativeCaptchaApplyTimer = 0
          roots.forEach((root) => {
            prepareNativeCaptcha(root)
            prepareNativeCapVerification(root)
          })
        }, 0)
      })
      nativeCaptchaObserver.observe(document.body, { childList: true, subtree: true })
    }

    function refreshNativeRouteEnhancements() {
      observeNativeThreadTree(document.querySelector('ul.post-list.topic-post-list'))
      prepareNativeCaptcha(document)
      prepareNativeCapVerification(document)
      bindNativeCaptchaObserver()
      syncOnlineUserDots()
      watchOnlineUserDots()
      startOnlineUserRefresh()
    }

    function findRouteOutlet(scope = document) {
      if (isCloudflareChallengeDocument(scope)) return null
      const candidates = [
        scope.querySelector?.('[data-slot~="page.before_render"]'),
        scope.querySelector?.('main.wrap'),
        scope.querySelector?.('main'),
      ]
      for (const el of candidates) {
        if (!el || el.id === 'lsb-shell' || el.querySelector?.('#lsb-shell')) continue
        return el
      }
      return null
    }

    function containsTopicPostContent(root) {
      return !!root?.matches?.('ul.topic-post-list, li.post-entry')
        || !!root?.querySelector?.('ul.topic-post-list, li.post-entry')
    }

    function hideNativeSidebars(root) {
      if (!root?.querySelectorAll) return
      for (const el of root.querySelectorAll('aside.sidebar, [data-slot~="sidebar.stack"]')) {
        if (el.id === 'mobile-menu-drawer' || el.classList.contains('mobile-menu-drawer')) continue
        el.classList.add('lsb-native-sidebar-hidden')
      }
      for (const el of nativeLeftRails(root)) el.classList.add('lsb-native-left-hidden')
    }

    function topicSpaUrl(urlLike) {
      if (!cfg.shell || cfg.topicSpa !== true) return null
      let url
      try {
        url = new URL(urlLike, location.href)
      } catch {
        return null
      }
      if (url.origin !== location.origin) return null
      const path = url.pathname.replace(/\/{2,}/g, '/') || '/'
      const match = path.match(/^\/topic\/([1-9]\d*)\/?$/)
      if (!match || !Number.isSafeInteger(Number(match[1]))) return null
      return url
    }

    function isSpaUrl(urlLike) {
      if (!cfg.shell) return false
      let url
      try {
        url = new URL(urlLike, location.href)
      } catch {
        return false
      }
      if (url.origin !== location.origin) return false
      const path = url.pathname.replace(/\/{2,}/g, '/') || '/'
      // 帖子阅读路由只由 topicSpaUrl 判定；关闭试验开关时仍整页导航。
      if (topicSpaUrl(url.href)) return true
      if (/^\/topic(?:\/|$)/.test(path)) return false
      // 淘帖详情仍靠站点脚本在整页生命周期里挂载；不能用软跳剥掉脚本。
      if (/^\/topic_collection\/\d+\/?$/.test(path)) return false
      return (
        path === '/'
        || path === '/index.php'
        || path === '/topic_featured'
        || path === '/hot_discussions'
        || path === '/unread_topic_notice_footprint'
        || path === '/topic_collections'
        || path === '/topic_essence_review_list'
        || /^\/forum\/\d+/.test(path)
        || /^\/category\/\d+/.test(path)
      )
    }

    function viewCacheKey(href) {
      const u = new URL(href, location.href)
      let path = u.pathname.replace(/\/{2,}/g, '/') || '/'
      if (path === '/index.php') path = '/'
      return path + u.search
    }

    function rememberView(key, entry) {
      if (viewCache.has(key)) viewCache.delete(key)
      viewCache.set(key, entry)
      while (viewCache.size > VIEW_CACHE_MAX) {
        const oldest = viewCache.keys().next().value
        viewCache.delete(oldest)
      }
    }

    function snapshotOutletAttrs(el) {
      if (!(el instanceof Element)) return []
      return [...el.attributes].map((a) => [a.name, a.value])
    }

    function stashView(key) {
      if (!key) return
      try {
        const normalized = new URL(key, location.origin).href
        if (!isSpaUrl(normalized)) return
        canvasSyncPersistentSiteCards()
        if (topicSpaUrl(normalized)) return
      } catch {
        return
      }
      /* Non-persistent cards are temporarily mounted outside their native
         sidebar while the canvas is active.  Restore those cards before moving
         the route outlet into the SPA cache; persistent cards stay mounted in
         the canvas and keep their hidden origin markers. */
      restoreAsideCards()
      canvasStopSidebarWatch()
      canvasRestoreSiteSidebar()
      canvasRestoreProfile()
      restoreDetachedNativeSidebars()
      const outlet = findRouteOutlet()
      if (!outlet?.firstChild) return
      if (containsTopicPostContent(outlet)) return
      const frag = document.createDocumentFragment()
      while (outlet.firstChild) frag.appendChild(outlet.firstChild)
      rememberView(key, {
        frag,
        title: document.title,
        head: captureRouteHead(),
        scrollX: currentScrollX(),
        scrollY: currentScrollY(),
        live: true,
        attrs: snapshotOutletAttrs(outlet),
      })
    }

    function takeView(key) {
      if (topicSpaUrl(key)) return null
      const entry = viewCache.get(key)
      if (!entry) return null
      viewCache.delete(key)
      return entry
    }

    function applyView(entry, outlet) {
      if (!outlet || !entry?.frag) return
      canvasRestoreSiteSidebar()
      canvasRestoreProfile()
      restoreDetachedNativeSidebars()
      if (entry.attrs) {
        for (const name of [...outlet.getAttributeNames()]) outlet.removeAttribute(name)
        for (const [name, value] of entry.attrs) {
          if (name.startsWith('data-lsb-')) continue
          outlet.setAttribute(name, value)
        }
      }
      outlet.replaceChildren()
      outlet.append(entry.frag)
      canvasRebindPersistentSiteCardOrigins(outlet)
      outlet.setAttribute('tabindex', '-1')
      markRouteContentEnter(outlet)
      if (entry.head) applyRouteHeadSnapshot(entry.head)
      else if (entry.title) document.title = entry.title
      outlet.removeAttribute('aria-busy')
      markNative(true)
    }

    function parseOutletFrag(html) {
      const pageDoc = new DOMParser().parseFromString(html, 'text/html')
      const remote = findRouteOutlet(pageDoc)
      if (!remote) return null
      remote.querySelectorAll('script').forEach((node) => node.remove())
      hideNativeSidebars(remote)
      canvasStagePersistentSiteCardOrigins(remote)
      const frag = document.createDocumentFragment()
      for (const node of [...remote.childNodes]) frag.appendChild(document.importNode(node, true))
      canvasRebindPersistentSiteCardOrigins(frag)
      return { frag, title: pageDoc.title || '', head: routeHeadSnapshot(pageDoc), attrs: snapshotOutletAttrs(remote) }
    }

    function wantsHomeStashRefresh() {
      return spaBound && cfg.shell && spaViewKey !== '/' && viewCache.has('/')
    }

    function stopHomeStashRefresh() {
      if (homeStashTimer) {
        window.clearTimeout(homeStashTimer)
        homeStashTimer = 0
      }
    }

    function scheduleHomeStashRefresh() {
      if (!wantsHomeStashRefresh()) {
        stopHomeStashRefresh()
        homeStashPending = false
        homeStashGen += 1
        return
      }
      if (homeStashTimer || homeStashInflight) return
      homeStashTimer = window.setTimeout(() => {
        homeStashTimer = 0
        void refreshStashedHome()
      }, HOME_STASH_REFRESH_MS)
    }

    async function refreshStashedHome() {
      if (!wantsHomeStashRefresh()) return
      if (document.visibilityState === 'hidden') {
        homeStashPending = true
        return
      }
      homeStashPending = false
      if (homeStashInflight) return homeStashInflight
      const gen = homeStashGen
      homeStashInflight = (async () => {
        try {
          const res = await api.net.raw('/', { queue: false, timeout: 15000, retry: 0 })
          if (gen !== homeStashGen) return
          if (!res.ok || !wantsHomeStashRefresh()) return
          const parsed = parseOutletFrag(res.text)
          if (!parsed || gen !== homeStashGen || !wantsHomeStashRefresh()) return
          rememberView('/', {
            frag: parsed.frag,
            title: parsed.title,
            head: parsed.head,
            scrollX: 0,
            scrollY: 0,
            live: false,
            attrs: parsed.attrs,
          })
        } catch {
          /* 后台刷新失败则还回仍用旧存档 */
        } finally {
          homeStashInflight = null
          if (gen === homeStashGen) scheduleHomeStashRefresh()
        }
      })()
      return homeStashInflight
    }

    function onHomeStashVisible() {
      if (document.visibilityState !== 'visible' || !homeStashPending) return
      homeStashPending = false
      void refreshStashedHome()
    }

    function seedHomeView() {
      const here = viewCacheKey(location.href)
      if (here === '/' || viewCache.has('/')) return
      void (async () => {
        try {
          const res = await api.net.raw('/', { queue: false, timeout: 15000, retry: 0 })
          if (!res.ok || viewCache.has('/') || spaViewKey === '/') return
          const parsed = parseOutletFrag(res.text)
          if (!parsed || viewCache.has('/') || spaViewKey === '/') return
          rememberView('/', {
            frag: parsed.frag,
            title: parsed.title,
            head: parsed.head,
            scrollX: 0,
            scrollY: 0,
            live: false,
            attrs: parsed.attrs,
          })
          scheduleHomeStashRefresh()
        } catch {
          /* 预取失败则点首页仍 GET */
        }
      })()
    }

    function hasUnsavedEditor() {
      return [...document.querySelectorAll('textarea, [contenteditable="true"]')].some((el) => {
        if (el.closest('#lsb-shell, .lsb-panel')) return false
        const value = 'value' in el ? el.value : el.textContent
        return String(value || '').trim().length > 0
      })
    }

    function ensureProgress() {
      const shell = document.getElementById('lsb-shell')
      if (!shell) return null
      let el = document.getElementById('lsb-shell-progress')
      if (el) return el
      el = document.createElement('div')
      el.id = 'lsb-shell-progress'
      el.setAttribute('aria-hidden', 'true')
      el.innerHTML = '<span data-lsb-shell-progress-bar></span>'
      shell.append(el)
      return el
    }

    function ensureRouteAnnouncer() {
      const shell = document.getElementById('lsb-shell')
      if (!shell) return null
      let announcer = shell.querySelector('#lsb-route-announcer')
      if (announcer) return announcer
      announcer = document.createElement('span')
      announcer.id = 'lsb-route-announcer'
      announcer.setAttribute('role', 'status')
      announcer.setAttribute('aria-live', 'polite')
      shell.append(announcer)
      return announcer
    }

    function focusAndAnnounceRoute(source) {
      if (source === 'history') return
      const outlet = findRouteOutlet()
      if (!outlet) return
      outlet.setAttribute('tabindex', '-1')
      try {
        outlet.focus({ preventScroll: true })
      } catch {
        outlet.focus?.()
      }
      const announcer = ensureRouteAnnouncer()
      if (announcer) announcer.textContent = `已打开：${document.title}`
    }

    function startProgress(serial) {
      const el = ensureProgress()
      if (!el) return
      el.dataset.phase = 'idle'
      el.style.setProperty('--lsb-shell-progress', '.08')
      window.clearTimeout(spaProgressTimer)
      spaProgressTimer = window.setTimeout(() => {
        if (serial !== spaSerial) return
        el.dataset.phase = 'loading'
        el.style.setProperty('--lsb-shell-progress', '.72')
      }, 90)
    }

    function finishProgress(serial) {
      const el = document.getElementById('lsb-shell-progress')
      window.clearTimeout(spaProgressTimer)
      spaProgressTimer = 0
      if (!el) return
      if (serial !== spaSerial) return
      el.dataset.phase = 'done'
      el.style.setProperty('--lsb-shell-progress', '1')
      spaProgressTimer = window.setTimeout(() => {
        el.dataset.phase = 'idle'
        el.style.setProperty('--lsb-shell-progress', '0')
      }, 220)
    }

    function hideProgress(serial) {
      window.clearTimeout(spaProgressTimer)
      spaProgressTimer = 0
      if (serial !== spaSerial) return
      const el = document.getElementById('lsb-shell-progress')
      if (!el) return
      el.dataset.phase = 'idle'
      el.style.setProperty('--lsb-shell-progress', '0')
    }

    function routeHeadSnapshot(source = document) {
      const read = (selector, attribute) => source.querySelector(selector)?.getAttribute(attribute) ?? null
      return {
        title: source.title || '',
        canonical: read('link[rel="canonical"]', 'href'),
        description: read('meta[name="description"]', 'content'),
        ogTitle: read('meta[property="og:title"]', 'content'),
      }
    }

    function applyRouteHeadSnapshot(snapshot) {
      if (!snapshot) return
      document.title = String(snapshot.title || '')
      const fields = [
        ['link[rel="canonical"]', 'href', 'canonical'],
        ['meta[name="description"]', 'content', 'description'],
        ['meta[property="og:title"]', 'content', 'ogTitle'],
      ]
      for (const [selector, attribute, key] of fields) {
        const node = document.querySelector(selector)
        if (!node) continue
        const value = snapshot[key]
        if (value === null || value === undefined) node.removeAttribute(attribute)
        else node.setAttribute(attribute, String(value))
      }
    }

    function captureRouteHead() {
      return routeHeadSnapshot(document)
    }

    function syncRouteHead(pageDoc) {
      const snapshot = routeHeadSnapshot(pageDoc)
      applyRouteHeadSnapshot(snapshot)
      return snapshot
    }

    function markRouteContentEnter(outlet) {
      if (!outlet) return
      outlet.removeAttribute('data-lsb-route-content-enter')
      void outlet.offsetWidth
      outlet.setAttribute('data-lsb-route-content-enter', '')
    }

    function topicResponseMatches(pageDoc, finalUrl) {
      const target = topicSpaUrl(finalUrl)
      if (!target) return true
      const targetId = Number((target.pathname.match(/^\/topic\/(\d+)/) || [])[1])
      if (!Number.isSafeInteger(targetId) || targetId <= 0) return false
      const canonical = pageDoc.querySelector('link[rel="canonical"]')?.getAttribute('href') || ''
      if (!canonical) return false
      let canonicalUrl
      try {
        canonicalUrl = new URL(canonical, finalUrl)
      } catch {
        return false
      }
      const canonicalTopic = topicSpaUrl(canonicalUrl.href)
      const canonicalId = Number((canonicalTopic?.pathname.match(/^\/topic\/(\d+)/) || [])[1])
      if (!canonicalTopic || canonicalId !== targetId) return false
      const remote = findRouteOutlet(pageDoc)
      const list = remote?.querySelector('ul.topic-post-list')
      const posts = list?.querySelectorAll('li.post-entry:not(.reply-pin-duplicate)')
      return !!remote && !!list && !!posts?.length
    }

    function syncOutletAttrs(outlet, remote) {
      for (const attr of [...outlet.attributes]) {
        if (attr.name.startsWith('data-lsb-') || attr.name === 'aria-busy') continue
        outlet.removeAttribute(attr.name)
      }
      for (const attr of [...remote.attributes]) {
        if (attr.name.startsWith('data-lsb-')) continue
        outlet.setAttribute(attr.name, attr.value)
      }
    }

    function commitRoute(pageDoc, remoteOutlet, targetUrl, historyMode) {
      const outlet = findRouteOutlet()
      if (!outlet || !remoteOutlet) throw new Error('no outlet')
      /* Hide any native chrome before the old outlet is detached.  The shell
         remains the only visible navigation layer for the whole transaction. */
      markNative(true)
      canvasStopSidebarWatch()
      canvasRestoreSiteSidebar()
      canvasRestoreProfile()
      restoreDetachedNativeSidebars()
      remoteOutlet.querySelectorAll('script').forEach((node) => node.remove())
      hideNativeSidebars(remoteOutlet)
      canvasStagePersistentSiteCardOrigins(remoteOutlet)
      const kids = [...remoteOutlet.childNodes].map((node) => document.importNode(node, true))
      applyHistory(targetUrl, historyMode)
      syncRouteHead(pageDoc)
      syncOutletAttrs(outlet, remoteOutlet)
      outlet.replaceChildren(...kids)
      syncOnlineUserBoot(pageDoc)
      canvasRebindPersistentSiteCardOrigins(outlet)
      outlet.setAttribute('tabindex', '-1')
      markRouteContentEnter(outlet)
      outlet.removeAttribute('aria-busy')
      markNative(true)
    }

    function notifyRoute() {
      spaIgnorePop = true
      try {
        const view = document.defaultView
        const Ev = view.PopStateEvent || view.Event
        view.dispatchEvent(new Ev('popstate'))
      } catch {
        try {
          window.dispatchEvent(new Event('popstate'))
        } catch {
          /* 基座还有 url 轮询兜底 */
        }
      } finally {
        spaIgnorePop = false
      }
    }

    function topicTargetId(urlLike = location.href) {
      const url = topicSpaUrl(urlLike)
      if (!url) return ''
      const replyid = url.searchParams.get('replyid') || ''
      if (/^[1-9]\d*$/.test(replyid)) return `#post-${replyid}`
      const floor = url.searchParams.get('floor') || ''
      if (/^[1-9]\d*$/.test(floor)) return `[data-floor="${floor}"]`
      return ''
    }

    function scrollToTopicTarget(urlLike = location.href) {
      const selector = topicTargetId(urlLike)
      let node = null
      if (selector) {
        try {
          node = document.querySelector(selector)
        } catch {
          node = null
        }
      }
      if (node) {
        node.scrollIntoView?.({ block: 'center' })
        return true
      }
      let hash = ''
      try {
        hash = new URL(urlLike, location.href).hash
      } catch {
        return false
      }
      if (!hash) return false
      try {
        const id = decodeURIComponent(hash.slice(1))
        node = document.getElementById(id) || document.querySelector(hash)
      } catch {
        return false
      }
      node?.scrollIntoView?.()
      return !!node
    }

    function currentScrollRoot() {
      if (canvasScrollTarget instanceof Element) return canvasScrollTarget
      if (contentScroller instanceof Element) return contentScroller
      return null
    }

    function currentScrollY() {
      const root = currentScrollRoot()
      const rootY = root ? Number(root.scrollTop || 0) : 0
      if (rootY > 0) return rootY
      return Number(window.scrollY || window.pageYOffset || 0)
    }

    function currentScrollX() {
      const root = currentScrollRoot()
      const rootX = root ? Number(root.scrollLeft || 0) : 0
      if (rootX > 0) return rootX
      return Number(window.scrollX || window.pageXOffset || 0)
    }

    function scrollCurrentRootTo(x = 0, y = 0) {
      const root = currentScrollRoot()
      if (root) {
        const nextX = Math.max(0, Number(x) || 0)
        const nextY = Math.max(0, Number(y) || 0)
        root.scrollLeft = nextX
        root.scrollTop = nextY
        // 保留 window.scrollTo 通知，兼容依赖窗口滚动语义的站点脚本和历史测试；实际滚动仍由面板承载。
        window.scrollTo(nextX, nextY)
        canvasScheduleScroll()
        return
      }
      window.scrollTo(x, y)
    }

    function historyEntryState(url, index, x, y) {
      const prior = history.state && typeof history.state === 'object' ? history.state : {}
      return {
        ...prior,
        lsbShellSpa: true,
        lsbShellSpaIndex: index,
        lsbShellSpaUrl: url,
        lsbScrollX: Number(x) || 0,
        lsbScrollY: Number(y) || 0,
      }
    }

    function readHistoryIndex(state = history.state) {
      const value = Number(state?.lsbShellSpaIndex)
      return Number.isSafeInteger(value) && value >= 0 ? value : null
    }

    function initializeHistoryEntry() {
      const existingIndex = readHistoryIndex()
      spaHistoryIndex = existingIndex ?? 0
      try {
        history.replaceState(
          historyEntryState(location.href, spaHistoryIndex, currentScrollX(), currentScrollY()),
          '',
          location.href,
        )
      } catch {
        /* history 不可用时不阻断正文导航 */
      }
    }

    function rememberHistoryScroll() {
      const index = readHistoryIndex() ?? spaHistoryIndex
      try {
        history.replaceState(
          historyEntryState(location.href, index, currentScrollX(), currentScrollY()),
          '',
          location.href,
        )
        spaHistoryIndex = index
      } catch {
        /* history 不可用时不阻断正文导航 */
      }
    }

    function historyScrollX() {
      const value = Number(history.state?.lsbScrollX)
      return Number.isFinite(value) && value >= 0 ? value : 0
    }

    function historyScrollY() {
      const value = Number(history.state?.lsbScrollY)
      return Number.isFinite(value) && value >= 0 ? value : 0
    }

    function applyHistory(target, mode) {
      if (mode === 'none') return
      const currentIndex = readHistoryIndex() ?? spaHistoryIndex
      const nextIndex = mode === 'replace' ? currentIndex : currentIndex + 1
      const state = historyEntryState(target.href, nextIndex, 0, 0)
      try {
        if (mode === 'replace') history.replaceState(state, '', target.href)
        else history.pushState(state, '', target.href)
        spaHistoryIndex = nextIndex
      } catch {
        /* history 不可用时仍换 DOM，地址栏可能落后 */
      }
    }

    function fallbackRoute(mode, targetUrl) {
      if (mode === 'none') location.reload()
      else if (mode === 'replace') location.replace(targetUrl)
      else location.assign(targetUrl)
    }

    function perfHref() {
      try {
        return location.pathname + location.search
      } catch {
        return ''
      }
    }

    function perfEmit(name, ms) {
      try {
        if (!api.hasHandler('perf-probe:record')) return
        api.emitGlobal('perf:span', {
          name,
          plugin: 'skin',
          ms,
          href: perfHref(),
          t: Date.now(),
        })
      } catch {
        /* 探针失败不得打断壳 */
      }
    }

    function perfSpan(name, fn) {
      if (!api.hasHandler('perf-probe:record')) return fn()
      const t0 = performance.now()
      try {
        return fn()
      } finally {
        perfEmit(name, performance.now() - t0)
      }
    }

    async function perfSpanAsync(name, fn) {
      if (!api.hasHandler('perf-probe:record')) return fn()
      const t0 = performance.now()
      try {
        return await fn()
      } finally {
        perfEmit(name, performance.now() - t0)
      }
    }

    let timelineEmitSec = -1
    let timelineEmitN = 0
    function perfEmitTimeline(ms) {
      if (ms < 8) return
      const sec = Math.floor(Date.now() / 1000)
      if (sec !== timelineEmitSec) {
        timelineEmitSec = sec
        timelineEmitN = 0
      }
      if (timelineEmitN >= 2) return
      timelineEmitN += 1
      perfEmit('timeline.update', ms)
    }

    async function navigateSpa(href, options = {}) {
      const settings = { historyMode: 'push', force: false, source: 'user', ...options }
      let target
      try {
        target = new URL(href, location.href)
      } catch {
        return false
      }
      if (!isSpaUrl(target.href)) return false
      if (!settings.force && hasUnsavedEditor() && !window.confirm('当前编辑内容尚未保存，确定离开吗？')) {
        return false
      }
      const same = target.pathname === location.pathname && target.search === location.search
      if (same && !settings.force) {
        if (target.hash) {
          const id = decodeURIComponent(target.hash.slice(1))
          document.getElementById(id)?.scrollIntoView()
        }
        return true
      }

      if (settings.historyMode !== 'none') rememberHistoryScroll()
      const fromKey = spaViewKey
      unbindHomeInfiniteScroll()
      const destKey = viewCacheKey(target.href)
      const cached = takeView(destKey)
      const serial = ++spaSerial
      spaAbortController?.abort()
      const requestController = new AbortController()
      spaAbortController = requestController
      const tTotal = api.hasHandler('perf-probe:record') ? performance.now() : 0
      const outlet = findRouteOutlet()
      holdSpaRouteChrome(serial)
      markNative(true)
      outlet?.setAttribute('aria-busy', 'true')
      setRoutePhase(serial, 'preparing')
      startProgress(serial)
      let committed = false
      try {
        if (cached) {
          setRoutePhase(serial, 'committing')
          stashView(fromKey)
          perfSpan('spa.commit', () => applyView(cached, findRouteOutlet() || outlet))
          committed = true
          applyHistory(target, settings.historyMode)
          spaViewKey = destKey
          scheduleHomeStashRefresh()
          perfSpan('spa.fillShell', () => {
            applyMarkers()
            fillShell()
          })
          spaFilledSerial = serial
          window.clearTimeout(refreshTimer)
          refreshTimer = 0
          hideProgress(serial)
          try {
            scrollCurrentRootTo(
              settings.historyMode === 'none' ? historyScrollX() : 0,
              settings.historyMode === 'none' ? historyScrollY() : 0,
            )
          } catch {
            /* jsdom 没有视口 */
          }
          if (tTotal) perfEmit('spa.total', performance.now() - tTotal)
          afterPaint(() => {
            if (serial !== spaSerial) return
            setRoutePhase(serial, 'settling')
            try {
              perfSpan('spa.notify', () => {
                notifyRoute()
                if (!refreshRouteEnhancements(serial)) return
                syncShellRoute()
                scrollToTopicTarget(target.href)
                focusAndAnnounceRoute(settings.source)
              })
            } finally {
              settleSpaRoute(serial)
            }
            try {
              api.emitGlobal('spa:view-restored', { href: destKey, live: !!cached.live })
            } catch {
              /* 实时流缺席不得打断壳 */
            }
          })
          return true
        }

        setRoutePhase(serial, 'fetching')
        const res = await perfSpanAsync('spa.fetch', () =>
          api.net.raw(`${target.pathname}${target.search}`, {
            queue: false,
            timeout: 15000,
            retry: 0,
            signal: requestController.signal,
          }),
        )
        if (serial !== spaSerial) return false
        if (!res.ok) throw new Error(`HTTP ${res.status}`)
        const finalUrl = new URL(res.url || target.href, target.href)
        if (!finalUrl.hash && target.hash) finalUrl.hash = target.hash
        if (!isSpaUrl(finalUrl.href)) {
          hideProgress(serial)
          outlet?.removeAttribute('aria-busy')
          settleSpaRoute(serial)
          fallbackRoute(settings.historyMode, finalUrl.href)
          return false
        }
        const pageDoc = perfSpan('spa.parse', () => new DOMParser().parseFromString(res.text, 'text/html'))
        const remoteOutlet = findRouteOutlet(pageDoc)
        if (!remoteOutlet) throw new Error('no remote outlet')
        if (!topicResponseMatches(pageDoc, finalUrl)) throw new Error('invalid topic response')
        setRoutePhase(serial, 'committing')
        stashView(fromKey)
        perfSpan('spa.commit', () => {
          commitRoute(pageDoc, remoteOutlet, finalUrl, settings.historyMode)
        })
        committed = true
        spaViewKey = viewCacheKey(finalUrl.href)
        scheduleHomeStashRefresh()
        perfSpan('spa.fillShell', () => {
          applyMarkers()
          fillShell()
        })
        spaFilledSerial = serial
        window.clearTimeout(refreshTimer)
        refreshTimer = 0
        finishProgress(serial)
        try {
          scrollCurrentRootTo(
            settings.historyMode === 'none' ? historyScrollX() : 0,
            settings.historyMode === 'none' ? historyScrollY() : 0,
          )
        } catch {
          /* jsdom 没有视口 */
        }
        if (tTotal) perfEmit('spa.total', performance.now() - tTotal)
        afterPaint(() => {
          if (serial !== spaSerial) return
          setRoutePhase(serial, 'settling')
          try {
            perfSpan('spa.notify', () => {
              notifyRoute()
              if (!refreshRouteEnhancements(serial)) return
              syncShellRoute()
              scrollToTopicTarget(finalUrl.href)
              focusAndAnnounceRoute(settings.source)
            })
          } finally {
            settleSpaRoute(serial)
          }
        })
        return true
      } catch (err) {
        if (serial !== spaSerial) return false
        hideProgress(serial)
        settleSpaRoute(serial)
        outlet?.removeAttribute('aria-busy')
        const aborted = requestController.signal.aborted || err?.name === 'AbortError'
        if (!committed && !aborted) fallbackRoute(settings.historyMode, target.href)
        return false
      } finally {
        if (spaAbortController === requestController) spaAbortController = null
      }
    }

    function onSpaClick(event) {
      if (event.defaultPrevented || event.button !== 0) return
      if (event.metaKey || event.ctrlKey || event.shiftKey || event.altKey) return
      const anchor = event.target?.closest?.('a[href]')
      if (
        !anchor
        || anchor.hasAttribute('download')
        || (anchor.target && anchor.target !== '_self')
        || /\bexternal\b/i.test(anchor.rel || '')
        || anchor.matches('[data-method], [data-confirm], [data-no-spa]')
      ) return
      const currentTopic = !!topicSpaUrl(location.href)
      const targetTopic = !!topicSpaUrl(anchor.href)
      if (anchor.closest('.pagination-bar, .pagination') && (!currentTopic || !targetTopic)) return
      if (!isSpaUrl(anchor.href)) return
      if (anchor.href === location.href) {
        if (cancelPendingSpaNavigation()) event.preventDefault()
        return
      }
      event.preventDefault()
      void navigateSpa(anchor.href)
    }

    function onSpaSubmit(event) {
      if (event.defaultPrevented || !cfg.shell) return
      const form = event.target instanceof HTMLFormElement ? event.target : null
      if (!form || String(form.method || 'get').toLowerCase() !== 'get') return
      if (form.target && form.target !== '_self') return
      if (form.matches('[data-no-spa], [data-confirm], [data-method]')) return
      let target
      try {
        target = new URL(form.action || location.href, location.href)
        const data = event.submitter ? new FormData(form, event.submitter) : new FormData(form)
        target.search = new URLSearchParams(data).toString()
      } catch {
        return
      }
      if (!isSpaUrl(target.href)) return
      event.preventDefault()
      void navigateSpa(target.href)
    }

    function onSpaPop() {
      if (spaIgnorePop || !cfg.shell) return
      const targetIndex = readHistoryIndex()
      if (spaHistoryRollbackIndex !== null) {
        const rollbackIndex = spaHistoryRollbackIndex
        spaHistoryRollbackIndex = null
        if (targetIndex === rollbackIndex) {
          spaHistoryIndex = rollbackIndex
          return
        }
      }
      const previousIndex = spaHistoryIndex
      if (hasUnsavedEditor() && !window.confirm('当前编辑内容尚未保存，确定离开吗？')) {
        spaHistoryRollbackIndex = previousIndex
        const delta = targetIndex === null ? 1 : previousIndex - targetIndex
        try {
          history.go(delta)
        } catch {
          spaHistoryRollbackIndex = null
        }
        return
      }
      if (targetIndex !== null) spaHistoryIndex = targetIndex
      if (!isSpaUrl(location.href)) {
        // 软跳文档被后退到交易页/帖子等整页地址时，主栏还是列表，必须重开。
        // 交易页本身就是整页打开的，不能见 popstate 就 reload，否则会刷死。
        let paintedSpa = false
        try {
          paintedSpa = isSpaUrl(new URL(spaViewKey || '/', location.origin).href)
        } catch {
          paintedSpa = false
        }
        if (paintedSpa) location.reload()
        return
      }
      let targetHref = location.href
      try {
        const recorded = new URL(history.state?.lsbShellSpaUrl || '', location.href)
        if (recorded.origin === location.origin && recorded.href === location.href) targetHref = recorded.href
      } catch {
        /* 地址栏仍是该历史项的权威目标 */
      }
      void navigateSpa(targetHref, { historyMode: 'none', force: true, source: 'history' })
    }

    function clearSpaTransaction() {
      spaSerial += 1
      spaHistoryRollbackIndex = null
      const controller = spaAbortController
      spaAbortController = null
      controller?.abort()
      window.clearTimeout(spaProgressTimer)
      spaProgressTimer = 0
      findRouteOutlet()?.removeAttribute('aria-busy')
      clearSpaRouteChromeHold()
      const root = document.documentElement
      delete root.dataset.lsbRoutePhase
      const progress = document.getElementById('lsb-shell-progress')
      if (progress) {
        progress.dataset.phase = 'idle'
        progress.style.setProperty('--lsb-shell-progress', '0')
      }
    }

    function cancelPendingSpaNavigation() {
      const root = document.documentElement
      const pending = !!spaAbortController
        || root.hasAttribute('data-lsb-route-phase')
        || root.classList.contains(SPA_ROUTE_PENDING_CLASS)
      if (!pending) return false
      clearSpaTransaction()
      try {
        spaViewKey = viewCacheKey(location.href)
      } catch {
        spaViewKey = ''
      }
      if (cfg.shell) {
        applyMarkers()
        if (document.getElementById('lsb-shell')) fillShell()
        else syncHomeInfiniteScroll()
        refreshNativeRouteEnhancements()
      }
      return true
    }

    function onSpaPageShow(event) {
      if (event.persisted) clearSpaTransaction()
    }

    function bindSpa() {
      if (spaBound) return
      spaBound = true
      try {
        history.scrollRestoration = 'manual'
      } catch {
        /* ignore */
      }
      document.addEventListener('click', onSpaClick, true)
      document.addEventListener('submit', onSpaSubmit, true)
      window.addEventListener('popstate', onSpaPop)
      window.addEventListener('pageshow', onSpaPageShow)
      document.addEventListener('visibilitychange', onHomeStashVisible)
      initializeHistoryEntry()
      spaViewKey = viewCacheKey(location.href)
      seedHomeView()
      scheduleHomeStashRefresh()
    }

    function unbindSpa() {
      if (!spaBound) return
      spaBound = false
      clearSpaTransaction()
      document.removeEventListener('click', onSpaClick, true)
      document.removeEventListener('submit', onSpaSubmit, true)
      window.removeEventListener('popstate', onSpaPop)
      window.removeEventListener('pageshow', onSpaPageShow)
      document.removeEventListener('visibilitychange', onHomeStashVisible)
      stopHomeStashRefresh()
      homeStashPending = false
      homeStashGen += 1
      document.getElementById('lsb-shell-progress')?.remove()
    }

    function unmountShellLayer({ preserveBootStyle = false } = {}) {
      clearSpaTransaction()
      clearNativeThreadObserver()
      unbindNativeThreadLifecycle()
      clearNativeCaptchaObserver()
      if (timelineRaf) {
        const cancel = window.cancelAnimationFrame || window.clearTimeout
        cancel(timelineRaf)
        timelineRaf = 0
      }
      clearSpaRouteChromeHold()
      delete document.documentElement.dataset.lsbRoutePhase
      unbindWindow()
      unbindWindowInteractions()
      unbindAsideResize()
      stopOnlineWatch()
      stopExtrasWatch()
      destroyAsideViews()
      unmountCanvas()
      unmountShellWindows()
      mediaGeneration += 1
      backgroundSpecKey = ''
      fontSpecKey = ''
      releaseBackgroundVideo()
      releaseBackgroundImage()
      releaseFontFace()
      mediaDbPromise = null
      restoreAsideCards()
      restoreAsidePersistentCards()
      restoreUserCard()
      restoreTopExtras()
      restoreThemeToggle()
      restoreSearch()
      document.getElementById('lsb-shell')?.remove()
      markNative(false)

      const root = document.documentElement
      root.removeAttribute('data-lsb-shell-mode')
      root.classList.remove(
        'lsb-skin-shell-on', 'lsb-skin-shell-home', 'lsb-skin-shell-topic', 'lsb-skin-shell-user', 'lsb-skin-shell-windowed',
        'lsb-skin-glass-on', 'lsb-skin-video-on', 'lsb-skin-image-on', 'lsb-canvas-mode',
        'lsb-canvas-reduced-motion', 'lsb-canvas-reduced-transparency',
        'lsb-canvas-boot', 'lsb-shell-boot',
      )
      for (const name of ['home', 'forum', 'topic', 'user', 'settings', 'page']) root.classList.remove(`lsb-canvas-page-${name}`)
      for (const prop of shellTokenProps) root.style.removeProperty(prop)
      shellTokenProps.clear()
      root.style.removeProperty('--lsb-shell-font-family')
      if (!preserveBootStyle) document.getElementById('lsb-shell-boot-style')?.remove()
      document.getElementById('lsb-shell-boot-frame')?.remove()
      mountedUiMode = null
    }

    function teardownShell() {
      window.clearTimeout(refreshTimer)
      refreshTimer = 0
      unbindUiModeResize()
      unbindCloudflareChallengeWatch()
      unbindSpa()
      unbindHomeInfiniteScroll()
      stopOnlineUserDots()
      stopOnlineUserRefresh()
      unmountShellLayer()
      viewCache.clear()
      spaViewKey = ''
    }

    function refreshShell() {
      refreshTimer = 0
      if (!cfg.shell) {
        const scrollPosition = pendingUiModeScroll
        pendingUiModeScroll = null
        teardownShell()
        if (scrollPosition) scrollCurrentRootTo(scrollPosition.x, scrollPosition.y)
        return
      }

      bindCloudflareChallengeWatch()
      if (isCloudflareChallengeDocument(document)) {
        const scrollPosition = pendingUiModeScroll
        pendingUiModeScroll = null
        unbindUiModeResize()
        unbindSpa()
        unbindHomeInfiniteScroll()
        stopOnlineUserRefresh()
        unmountShellLayer({ preserveBootStyle: true })
        if (scrollPosition) scrollCurrentRootTo(scrollPosition.x, scrollPosition.y)
        return
      }

      bindUiModeResize()
      const mode = effectiveUiMode()
      const targetMode = mode === 'ios27' || asideWide() ? mode : null
      const modeChanged = mountedUiMode !== targetMode
      const scrollPosition = pendingUiModeScroll || (modeChanged
        ? { x: currentScrollX(), y: currentScrollY() }
        : null)
      pendingUiModeScroll = null
      const hadLayer = mountedUiMode !== null || !!document.getElementById('lsb-shell')
      if (modeChanged && hadLayer) unmountShellLayer()

      if (!targetMode) {
        unbindHomeInfiniteScroll()
        restyle()
        refreshNativeRouteEnhancements()
        bindSpa()
        if (scrollPosition) scrollCurrentRootTo(scrollPosition.x, scrollPosition.y)
        return
      }

      restyle()
      markNative(true)
      bindAsideResize()
      try {
        const mounted = targetMode === 'ios27' ? mountCanvas() : fillShell()
        if (!(mounted instanceof Element)) throw new Error(`${targetMode} shell did not mount`)
        mountedUiMode = targetMode
        refreshNativeRouteEnhancements()
        bindSpa()
        syncShellMedia()
        if (scrollPosition) scrollCurrentRootTo(scrollPosition.x, scrollPosition.y)
      } catch (error) {
        unbindHomeInfiniteScroll()
        unmountShellLayer()
        bindSpa()
        if (scrollPosition) scrollCurrentRootTo(scrollPosition.x, scrollPosition.y)
        if (typeof console !== 'undefined' && typeof console.warn === 'function') {
          console.warn('[LSB skin] shell mount failed; restored native page', error)
        }
      }
    }

    function afterPaint(fn) {
      // One rAF runs before paint; the second lets the committed outlet paint first.
      // Hidden and prerendered documents may pause rAF, so notify without waiting for an invisible frame.
      const requestFrame = window.requestAnimationFrame
      if (typeof requestFrame !== 'function' || document.visibilityState !== 'visible') {
        queueMicrotask(fn)
        return
      }
      requestFrame.call(window, () => requestFrame.call(window, fn))
    }

    function scheduleRefresh(fromRoute) {
      if (fromRoute && spaFilledSerial && spaFilledSerial === spaSerial) return
      window.clearTimeout(refreshTimer)
      refreshTimer = window.setTimeout(refreshShell, 50)
    }

    function applyAll() {
      restyle()
      refreshShell()
    }

    function renderSkinSettings(host) {
      const section = document.createElement('section')
      section.className = 'lsb-skin-media-settings'
      const heading = document.createElement('h3')
      heading.textContent = '本地资源与窗口布局'
      section.append(heading)
      const hint = document.createElement('p')
      hint.className = 'lsb-row-desc'
      hint.textContent = '视频单文件不超过 50MB，字体单文件不超过 10MB；二进制只保存在本机 IndexedDB。'
      section.append(hint)

      const appendFile = (kind, labelText, accept, configKey, enabledKey = '') => {
        const label = document.createElement('label')
        label.className = 'lsb-field'
        const title = document.createElement('span')
        title.textContent = labelText
        const input = document.createElement('input')
        input.type = 'file'
        input.accept = accept
        input.addEventListener('change', async () => {
          const file = input.files?.[0]
          if (!file || !api.ui.shellMedia) return
          const check = api.ui.shellMedia.validateMediaFile(file, { kind })
          if (!check.ok) {
            api.ui.toast?.(kind === 'video' ? '视频文件超过 50MB 或类型不受支持' : kind === 'image' ? '图片文件超过 20MB 或类型不受支持' : '字体文件超过 10MB 或类型不受支持', { type: 'error' })
            input.value = ''
            return
          }
          try {
            const db = await ensureMediaDb()
            await api.ui.shellMedia.writeMedia({ db, kind, key: mediaOriginKey(kind), value: file })
            api.saveConfig({
              [configKey]: mediaOriginKey(kind),
              ...(enabledKey ? { [enabledKey]: true } : {}),
              ...(kind === 'video' ? { backgroundVideoUrl: '', backgroundImageUrl: '', backgroundImageLocalKey: '' } : {}),
              ...(kind === 'image' ? { backgroundVideoEnabled: false, backgroundVideoUrl: '', backgroundVideoLocalKey: '' } : {}),
            })
            cfg = api.config()
            applyAll()
            api.ui.toast?.('本地资源已保存', { type: 'success' })
          } catch {
            api.ui.toast?.('本地资源保存失败', { type: 'error' })
          } finally {
            input.value = ''
          }
        })
        label.append(title, input)
        section.append(label)
      }

      appendFile('video', '选择本地视频', 'video/*', 'backgroundVideoLocalKey', 'backgroundVideoEnabled')
      appendFile('image', '选择静态图片', 'image/*', 'backgroundImageLocalKey')
      appendFile('font', '选择本地字体', '.woff2,.woff,.ttf,.otf,font/*', 'fontLocalKey')

      const actions = document.createElement('div')
      actions.className = 'lsb-actions'
      const arrange = document.createElement('button')
      arrange.type = 'button'
      arrange.className = 'lsb-btn'
      arrange.textContent = '一键整理窗口'
      arrange.addEventListener('click', () => api.ui.shellWindowArrange?.())
      const reset = document.createElement('button')
      reset.type = 'button'
      reset.className = 'lsb-btn'
      reset.textContent = '恢复默认布局'
      reset.addEventListener('click', () => api.ui.shellWindowReset?.())
      actions.append(arrange, reset)
      section.append(actions)
      host.append(section)
    }

    api.ui.configTab({ name: '界面精修', order: 80, render: renderSkinSettings })

    let unregMenu = () => {}
    function syncGmMenu() {
      unregMenu()
      const on = !!api.config().shell
      unregMenu = api.ui.menuCommand(on ? '氢壳：关闭，回到原版界面' : '氢壳：开启', () => {
        api.saveConfig({ shell: !api.config().shell })
      })
    }
    syncGmMenu()

    api.on('config:changed:skin', () => {
      const previousMode = effectiveUiMode()
      const previousShell = cfg.shell
      const scrollPosition = { x: currentScrollX(), y: currentScrollY() }
      cfg = api.config()
      if (effectiveUiMode() !== previousMode || cfg.shell !== previousShell) pendingUiModeScroll = scrollPosition
      readCanvasState()
      invalidateTools()
      applyAll()
      syncGmMenu()
    })
    api.on('route:changed', () => {
      scheduleRefresh(true)
    })
    api.on('plugin:activated', () => {
      invalidateTools()
      scheduleRefresh(false)
    })
    api.on('plugin:disabled', () => {
      invalidateTools()
      scheduleRefresh(false)
    })
    api.on('topic:posts-added', scheduleTimeline)
    api.dom.each(
      '.dark-mode-control, [data-themes-mode-toggle], a.color-scheme-top-link, a.search-page-link, form.search-form, form.meilisearch-search-top-form, form[role="search"][aria-label="站内搜索"], .sidebar-card.user-card',
      () => {
        if (!cfg.shell) return
        adoptSearch(shellSearchHost())
        adoptThemeToggle(document.querySelector('[data-lsb-shell-theme]'))
        adoptUserCard(document.querySelector('[data-lsb-shell-me]'))
        if (mountedUiMode === 'ios27') {
          const outlet = findRouteOutlet()
          canvasMountProfile(outlet)
          const site = canvasSurface('site-card')
          if (canvasActiveSheet === 'site-card' || site?.dataset.surfaceMode === 'rail') canvasSyncSiteSidebar(site)
        }
      },
    )

    api.onDispose(() => {
      unregMenu()
      teardownShell()
      const root = document.documentElement
      for (const c of [...root.classList].filter((x) => x.startsWith('lsb-skin-'))) root.classList.remove(c)
      document.getElementById('lsb-skin-style')?.remove()
    })

    api.handle('skin:debug', () => ({
      active: { ...cfg },
      markers: [...document.documentElement.classList].filter((c) => c.startsWith('lsb-skin-')),
      styleBytes: (document.getElementById('lsb-skin-style')?.textContent || '').length,
      themesPluginDetected: themesPresent,
      canvas: canvasDebugSnapshot(),
      shell: {
        on: !!cfg.shell,
        mounted: !!document.getElementById('lsb-shell'),
        boards: collectBoards().length,
        location: locationText(),
        timeline: !!document.getElementById('lsb-shell-timeline'),
        me: !!document.querySelector('#lsb-shell .sidebar-card.user-card'),
        extras: document.querySelectorAll('.lsb-shell-extras a').length,
        aside: document.querySelectorAll('#lsb-shell-aside .sidebar-card').length,
        spa: spaBound,
        windows: shellWindowRegistry.map((item) => {
          const host = shellHost(item.id)
          const rect = host?.getBoundingClientRect?.()
          const body = host?.querySelector?.('[data-lsb-shell-window-body]')
          return {
            id: item.id,
            visible: !host?.hidden,
            rect: rect ? { x: rect.x, y: rect.y, width: rect.width, height: rect.height } : null,
            scrollTop: Number(body?.scrollTop || 0),
          }
        }),
        layoutKey: shellWindowLayout ? shellLayoutApi.layoutStorageKey(location.origin, shellLayoutApi.widthBucket(shellViewport(shellWorkspace()).width)) : '',
        scrollBridge: !!scrollBridge,
      },
    }))

    applyAll()

    return {}
  }

  const w = typeof unsafeWindow !== 'undefined' ? unsafeWindow : window
  if (w.LSB && w.LSB.register) w.LSB.register(manifest, setup)
  else (w.LSB_PLUGINS = w.LSB_PLUGINS || []).push({ manifest, setup })
})()
