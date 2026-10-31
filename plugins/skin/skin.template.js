// ==UserScript==
// @name         LSB·界面精修
// @namespace    https://linux.sb/
// @version      2.0.59
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
    version: '2.0.59',
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

  // @LSB_SKIN_CANVAS_STATE
  // @LSB_SKIN_STYLES
  // @LSB_SKIN_MEDIA
  // @LSB_SKIN_PLUGIN_CATALOG
  // @LSB_SKIN_SEARCH
  // @LSB_SKIN_NAVIGATION
  // @LSB_SKIN_CONTENT
  // @LSB_SKIN_HISTORY
  // @LSB_SKIN_PROFILE
  // @LSB_SKIN_SITE_CARDS
  // @LSB_SKIN_ONLINE
  // @LSB_SKIN_ASIDE_CARDS
  // @LSB_SKIN_ASIDE_VIEWS
  // @LSB_SKIN_CONFIG
  // @LSB_SKIN_SPA_DOCUMENT
  // @LSB_SKIN_VIEW_CACHE
  // @LSB_SKIN_SPA
  // @LSB_SKIN_HOME_INFINITE
  // @LSB_SKIN_NATIVE_ENHANCEMENTS
  // @LSB_SKIN_SETTINGS
  // @LSB_SKIN_TOPBAR
  // @LSB_SKIN_TIMELINE
  // @LSB_SKIN_SELECTION
  // @LSB_SKIN_APPEARANCE
  // @LSB_SKIN_SURFACE_LAYOUT
  // @LSB_SKIN_CANVAS_SCROLL
  // @LSB_SKIN_WINDOWS
  // @LSB_SKIN_CANVAS_HOST
  // @LSB_SKIN_RUNTIME

  const CLOUDFLARE_CHALLENGE_ATTR = 'data-lsb-cloudflare-challenge'
  const SPA_ROUTE_PENDING_CLASS = 'lsb-canvas-route-pending'
  const SPA_ROUTE_COMMITTED_EVENT = 'lsb:route-committed'
  const CLOUDFLARE_CHALLENGE_MARKERS = '#challenge-stage, #challenge-form, #challenge-running, #cf-challenge-running, .cf-browser-verification, [data-cf-challenge]'
  const CLOUDFLARE_CHALLENGE_TITLE_COPY = /(?:just a moment|attention required|checking your browser|checking if (?:the )?site connection is secure)/i
  const CLOUDFLARE_CHALLENGE_BODY_COPY = /(?:checking your browser|verify (?:that )?you are human|enable javascript and cookies to continue|performing (?:a )?security (?:check|verification)|complete (?:the )?security check|请完成.{0,12}验证|请进行.{0,12}验证|正在验证|人机验证)/i
  const CLOUDFLARE_CHALLENGE_COPY_SELECTOR = 'h1, h2, h3, p, [role="heading"], #challenge-error-text, #challenge-body-text, [data-cf-challenge-message]'
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

  // 状态、资源、原生节点、SPA、首页加载、正文增强、设置、顶栏、时间轴、文本选择、外观交互、浮层布局、画布滚动、共享窗口、画布宿主与入口生命周期由显式模块提供；模板保留模块装配、公共注册和必要的视图/路由适配。
  // 后续拆分顺序与编辑方式见 plugins/skin/README.md。
  function setup(api) {
    const configController = createSkinConfigController({
      getConfig: () => api.config(), saveConfig: (patch) => api.saveConfig(patch), store: api.store,
      getLocation: () => location, getViewport: canvasViewport,
      stateApi: { CANVAS_STATE_KEY, CANVAS_STATE_VERSION, CANVAS_WIDTH_CLASSES, CANVAS_DEFAULT_APPEARANCE, defaultCanvasState, migrateLegacySkinState, canvasMerge, canvasCopy, mergeCanvasState, siteKeyFromLocation, widthClass },
      sanitizeTokenValue: (name, value) => api.ui.shellStyle?.sanitizeTokenValue?.(name, value),
      isHttpsUrl: (value) => api.ui.shellMedia?.isHttpsUrl?.(value),
    })
    const { effectiveUiMode, read: readCanvasState, save: saveCanvasState,
      persistSurfaceRect: canvasPersistSurfaceRect } = configController
    const { collectBoards, pagePath, locationText, isActiveHref, canvasPageType, navigationEntries } = createSkinNavigation({
      document,
      getPage: () => api.page,
      getForums: () => api.forums,
      getLocation: () => location,
      parseTopic: (doc) => api.parse.topic(doc),
      store: api.store,
      homeSorted: (sort) => api.routes.homeSorted(sort),
    })

    // ── A: 配置与画布状态（effectiveUiMode/canvasViewport/readSaveCanvasState） ──
    function canvasViewport() {
      return {
        width: Math.max(1, Number(window.innerWidth || document.documentElement?.clientWidth || 1)),
        height: Math.max(1, Number(window.innerHeight || document.documentElement?.clientHeight || 1)),
      }
    }

    function canvasDebugSnapshot() {
      const host = document.getElementById('lsb-shell-surfaces')
      return {
        enabled: configController.state?.enabled !== false && configController.config.shell !== false,
        version: CANVAS_STATE_VERSION,
        siteKey: configController.siteKey,
        widthClass: configController.widthClass,
        preset: configController.effective?.preset || 'balanced-glass',
        legacyLayoutSnapshot: canvasCopy(configController.state?.legacyLayoutSnapshot || null),
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
    const contentController = createSkinContentController({
      window, document,
      isChallengeDocument: isCloudflareChallengeDocument,
      findLeftRails: nativeLeftRails,
      createScrollBridge: api.ui.shellScrollBridge,
    })
    const {
      findOutlet: findRouteOutlet,
      restoreSidebars: restoreDetachedNativeSidebars,
      syncScrollBridge: syncShellScrollBridge,
    } = contentController
    const historyController = createSkinHistoryController({
      window, document,
      getScrollRoot: currentScrollRoot,
      readScroll: () => ({ x: currentScrollX(), y: currentScrollY() }),
      scrollTo: scrollCurrentRootTo,
    })
    const { apply: applyHistory } = historyController
    const windowController = createSkinWindowController({
      window, document, ui: api.ui, store: api.store, configController, contentController,
      layoutApi: shellLayoutApi, styleApi: shellStyleApi, getLocation: () => location,
      getAsideContext: asideContext, getAsidePreferredId: () => asideViewsController.preferredId,
      getAsideActiveId: () => asideViewsController.activeId,
      setAsideActive: (id, host, persist) => asideSetActive(id, host, persist),
      findOutlet: findRouteOutlet, clone: structuredCloneSafe,
    })
    const { enabled: shellWindowEnabled, workspace: shellWorkspace, viewport: shellViewport,
      host: shellHost, focus: focusShellWindow, arrange: arrangeShellWindows, reset: resetShellWindow,
      unbind: unbindWindowInteractions, mount: mountShellWindows, unmount: unmountShellWindows } = windowController
    const shellTokenProps = new Set()
    const canvasHostController = createSkinCanvasHostController({
      window, document, configController, aiMarkup: CANVAS_AI_MARKUP, getPage: () => api.page,
      pluginCatalog: {
        features: () => pluginCatalog.features(), settings: () => pluginCatalog.settings(),
        openFeature: (id) => pluginCatalog.openFeature(id), openSettings: (id) => pluginCatalog.openSettings(id),
      },
      siteCardsController: {
        sync: (host, options) => siteCardsController.sync(host, options),
        restore: (options) => siteCardsController.restore(options),
      },
      hooks: {
        canvasPageType: () => canvasPageType(),
        locationText: () => locationText(),
        navigationEntries: () => navigationEntries(),
        findRouteOutlet: () => findRouteOutlet(),
        nativeSidebars: () => nativeSidebars(),
        markNative: (on) => markNative(on),
        renderCanvasTopLinks: () => renderCanvasTopLinks(),
        restoreCanvasTopLinks: () => restoreCanvasTopLinks(),
        canvasMountProfile: (outlet) => canvasMountProfile(outlet),
        canvasRestoreProfile: () => canvasRestoreProfile(),
        canvasSearchSetOpen: (host, open, restore) => canvasSearchSetOpen(host, open, restore),
        adoptSearch: (host) => adoptSearch(host),
        restoreSearch: () => restoreSearch(),
        adoptThemeToggle: (host) => adoptThemeToggle(host),
        canvasCloseContextPill: (restore) => canvasCloseContextPill(restore),
        canvasNativeAction: (action) => canvasNativeAction(action),
        canvasBindSelection: () => canvasBindSelection(),
        canvasUnbindSelection: () => canvasUnbindSelection(),
        canvasEndDrag: (commit) => canvasEndDrag(commit),
        canvasBeginDrag: (event, surface) => canvasBeginDrag(event, surface),
        canvasBeginResize: (event, surface) => canvasBeginResize(event, surface),
        canvasKeyboardMove: (event, surface) => canvasKeyboardMove(event, surface),
        canvasApplySurfaceModes: () => canvasApplySurfaceModes(),
        canvasSyncAppearance: () => canvasSyncAppearance(),
        bindAppearance: () => appearanceController.bind(),
        canvasBindWindow: () => canvasBindWindow(),
        canvasUnbindWindow: () => canvasUnbindWindow(),
        canvasScheduleScroll: () => canvasScheduleScroll(),
        canvasSyncScrollTarget: () => canvasSyncScrollTarget(),
        isCanvasScrollBound: () => canvasScrollController.bound,
        isSurfaceDragging: () => surfaceLayoutController.dragging,
      },
    })
    const {
      mount: mountCanvas,
      unmount: unmountCanvas,
      surface: canvasSurface,
      applyPageClass: canvasApplyPageClass,
      syncText: canvasSyncText,
      closeSurface: canvasCloseSurface,
      openPluginFeature: openPluginFeature,
      restoreSiteSidebar: canvasRestoreSiteSidebar,
      syncSiteSidebar: canvasSyncSiteSidebar,
      syncPersistentSiteCards: canvasSyncPersistentSiteCards,
      setSiteStatusExpanded: canvasSiteStatusSetExpanded,
      stopSidebarWatch: canvasStopSidebarWatch,
      watchSidebar: canvasWatchSidebar,
    } = canvasHostController
    const canvasScrollController = createSkinCanvasScrollController({
      window, document, getSurface: canvasSurface, getViewport: canvasViewport,
      isAsideWide: asideWide, getContentScroller: () => contentController.scroller,
      syncScrollBridge: syncShellScrollBridge,
      updateProfileScroll: (y, previous) => canvasUpdateProfileScroll(y, previous),
      applyPageClass: canvasApplyPageClass, applySurfaceModes: () => canvasApplySurfaceModes(),
    })
    const { homeRoot: canvasHomeScrollRoot, syncTarget: canvasSyncScrollTarget,
      schedule: canvasScheduleScroll, bind: canvasBindWindow, unbind: canvasUnbindWindow } = canvasScrollController
    // 公共控制器注销由基座 API 的 own() 管理，运行时只释放皮肤持有的资源。
    const offWindowController = hasWindowApi
      ? api.ui.shellWindowController((action, value) => {
        if (action === 'focus') return focusShellWindow(value)
        if (action === 'arrange') return arrangeShellWindows()
        if (action === 'reset') return resetShellWindow(value)
        if (action === 'layout') return windowController.layout ? structuredCloneSafe(windowController.layout) : null
        return null
      })
      : () => {}
    const offScrollRoot = typeof api.ui.shellScrollRootController === 'function'
      ? api.ui.shellScrollRootController(() => contentController.scroller)
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
    const {
      host: shellSearchHost,
      adopt: adoptSearch,
      restore: restoreSearch,
      setOpen: canvasSearchSetOpen,
    } = createSkinSearchController({ document })
    const onlineController = createSkinOnlineController({
      window,
      document,
      request: (path, options) => api.net.raw(path, options),
      isEnabled: () => configController.config.shell,
      isChallengeDocument: isCloudflareChallengeDocument,
    })
    const asideCardsController = createSkinAsideCardsController({
      window, document, store: api.store, getSidebars: nativeSidebars,
      getPage: () => api.page, isSelfUserCard: (card) => profileController.isSelfUserCard(card),
      isEnabled: () => configController.config.shell, syncOnlineDots: () => onlineController.syncDots(),
    })
    const { adopt: adoptAsideCards, restore: restoreAsideCards, restorePersistent: restoreAsidePersistentCards,
      pruneDetached: pruneDetachedAsideCards, watch: watchOnlineCard, stop: stopOnlineWatch } = asideCardsController
    const asideViewsController = createSkinAsideViewsController({
      window, document, store: api.store, getContext: asideContext,
      getViews: (context) => api.ui.shellAsideViews(context), isEnabled: () => configController.config.shell,
      onSelect: (id, selectedView) => {
        const windowId = selectedView?.windowId || 'site'
        if (windowId !== 'site' && windowController.layout?.windows?.[windowId]) focusShellWindow(windowId)
        for (const current of windowController.externalViews.values()) {
          if (current.view?.windowId) current.host.dataset.lsbShellOpen = current.view.id === id ? 'true' : 'false'
        }
      },
    })
    const { setActive: asideSetActive, sync: syncAsideViews, destroy: destroyAsideViews,
      bindResize: bindAsideResize, unbindResize: unbindAsideResize } = asideViewsController
    const spaDocumentController = createSkinSpaDocumentController({
      window, document, getConfig: () => configController.config, findRouteOutlet, nativeLeftRails, applyHistory,
      lifecycle: { canvasStopSidebarWatch, canvasRestoreSiteSidebar, restoreDetachedNativeSidebars, markNative,
        canvasRestoreProfile: () => canvasRestoreProfile(),
        canvasStagePersistentSiteCardOrigins: (root) => canvasStagePersistentSiteCardOrigins(root),
        canvasRebindPersistentSiteCardOrigins: (root) => canvasRebindPersistentSiteCardOrigins(root),
        syncOnlineBoot: (pageDoc) => onlineController.syncBoot(pageDoc) },
    })
    const { topicUrl: topicSpaUrl, accepts: isSpaUrl, cacheKey: viewCacheKey,
      containsTopicPostContent, snapshotOutletAttrs, captureHead: captureRouteHead,
      parse: parseOutletFrag } = spaDocumentController
    const { refresh: refreshNativeRouteEnhancements, clear: clearNativeRouteEnhancements } = createSkinNativeEnhancementsController({
      window, document, topicUrl: topicSpaUrl, startOnline: () => onlineController.start(),
    })
    const { sync: syncHomeInfiniteScroll, unbind: unbindHomeInfiniteScroll } = createSkinHomeInfiniteController({
      window, document, getConfig: () => configController.config,
      request: (path, options) => api.net.raw(path, options), cacheKey: viewCacheKey,
      containsTopicPostContent, getScrollRoot: canvasHomeScrollRoot,
    })
    const viewCacheController = createSkinViewCache({
      window, document, request: (path, options) => api.net.raw(path, options),
      getContext: () => ({ enabled: spaController.bound && configController.config.shell, viewKey: spaController.viewKey, href: location.href }),
      parse: parseOutletFrag, isTopic: topicSpaUrl, cacheKey: viewCacheKey,
    })
    const { remember: rememberView } = viewCacheController
    const spaController = createSkinSpaController({
      window, document, getConfig: () => configController.config,
      request: (path, options) => api.net.raw(path, options), routeDocument: spaDocumentController,
      viewCacheController, historyController, pendingClass: SPA_ROUTE_PENDING_CLASS,
      hooks: { findRouteOutlet, stashView, markNative, applyMarkers, fillShell, refreshRouteEnhancements,
        syncShellRoute, scrollToTopicTarget, refreshNativeRouteEnhancements, unbindHomeInfiniteScroll, syncHomeInfiniteScroll,
        cancelRefresh: () => runtimeController.cancelRefresh() },
      perf: { enabled: () => api.hasHandler('perf-probe:record'), now: () => performance.now(),
        span: perfSpan, spanAsync: perfSpanAsync, emit: perfEmit,
        emitGlobal: (name, detail) => api.emitGlobal(name, detail) },
    })
    const { bind: bindSpa, unbind: unbindSpa, clear: clearSpaTransaction,
      clearChrome: clearSpaRouteChromeHold } = spaController

    /* ── 共存检测：色彩主题已由其它脚本负责，本模块只做排版层，天然无冲突。
       若未来加入色彩子项，须在此让位。 ── */
    const themesPresent = !!document.querySelector('style[data-themes-plugin]')

    // ── B: 工具与样式适配（esc/structuredCloneSafe/applyShellTokens） ──
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

    /** 状态类挂 <html> 上：CSS 特异性干净，测试也容易断言 */
    // · B4 applyShellTokens: 玻璃/字号/字体令牌注入 ──
    function applyShellTokens() {
      const root = document.documentElement
      const appearance = configController.effective?.appearance || {}
      const canvasOn = !!configController.config.shell && effectiveUiMode() === 'ios27'
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
      const tokens = shellStyleApi.mergeShellTokens(configController.tokenValues(), {})
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

    // ── C: 媒体适配与路由状态 ──
    const mediaController = createSkinMediaController({
      window,
      document,
      media: api.ui.shellMedia,
      style: shellStyleApi,
      getContext: () => {
        const canvasMode = canvasHostController.shell instanceof Element && canvasHostController.shell.getAttribute('data-lsb-canvas-shell') === 'true'
        return { config: configController.config, appearance: configController.effective?.appearance || {}, workspace: canvasMode ? document.body : shellWorkspace(), canvasMode }
      },
      toast: (message, options) => api.ui.toast?.(message, options),
    })

    function syncShellMedia() {
      void mediaController.sync()
    }

    // ── D: 原生结构接管（applyMarkers/restyle/nativeHeaders） ──
    // · D1 applyMarkers: 逐容器打点与兴趣节点标记 ──
    function applyMarkers() {
      const root = document.documentElement
      const shellOn = shellUiActive()
      const canvasOn = !!configController.config.shell && effectiveUiMode() === 'ios27'
      const shellHome = shellOn && (pagePath() === '/' || pagePath() === '/index.php')
      root.classList.toggle('lsb-skin-type-on', !!configController.config.typography)
      root.classList.toggle('lsb-skin-density-compact', configController.config.density === '紧凑')
      root.classList.toggle('lsb-skin-code-on', !!configController.config.codeblock)
      root.classList.toggle('lsb-skin-floors-on', !!configController.config.floors)
      root.classList.toggle('lsb-skin-measure-on', !!configController.config.measure)
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
      el.textContent = skinCss(configController.config, { shellActive: shellUiActive(), uiMode: effectiveUiMode() })
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

    function shellUiActive() {
      return !!configController.config.shell && (effectiveUiMode() === 'ios27' || asideWide())
    }

    function asideContext() {
      return {
        page: api.page,
        route: api.page,
        snapshot: api.snapshot,
        wide: asideWide(),
      }
    }

    // ── F: 插件特性与工具菜单 ──
    const pluginCatalog = createSkinPluginCatalog({
      getInfo: () => (typeof unsafeWindow !== 'undefined' ? unsafeWindow : window).LSB?.info?.(),
      ui: api.ui,
      request: (name) => api.request(name),
    })

    // ── G: 原生节点接管与还原 ──
    const profileController = createSkinProfileController({
      window, document,
      getPage: () => api.page, getMe: () => api.me, getSidebars: nativeSidebars,
      getSelfHost: () => canvasHostController.surfaceHost?.querySelector('[data-canvas-profile-host]'),
      getViewport: canvasViewport,
    })
    const { adoptUserCard, restoreUserCard, isSelfUserCard, mount: canvasMountProfile, restore: canvasRestoreProfile, updateScroll: canvasUpdateProfileScroll } = profileController
    const siteCardsController = createSkinSiteCardsController({ document, getSidebars: nativeSidebars })
    const { stageOrigins: canvasStagePersistentSiteCardOrigins, rebindOrigins: canvasRebindPersistentSiteCardOrigins } = siteCardsController

    const {
      renderCanvasTopLinks, restoreCanvasTopLinks, adoptTopExtras, restoreTopExtras,
      adoptThemeToggle, restoreThemeToggle, watchTopExtras, stopExtrasWatch,
    } = createSkinTopbarController({
      window, document, store: api.store, isEnabled: () => configController.config.shell,
      getWidthClass: () => configController.widthClass, getTopStatus: () => canvasSurface('top-status'),
    })

    function renderLinks(links) {
      return links
        .map((link) => {
          const feature = link.plugin ? ` data-lsb-plugin-feature="${esc(link.plugin)}"` : ''
          if (link.rpc) {
            return `<button type="button" class="lsb-shell-link" data-lsb-rpc="${esc(link.rpc)}"${feature}><span class="lsb-shell-link-label">${esc(link.label)}</span></button>`
          }
          if (link.panel) {
            return `<button type="button" class="lsb-shell-link" data-lsb-panel="${esc(link.panel)}"${feature}><span class="lsb-shell-link-label">${esc(link.label)}</span></button>`
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

    const timelineController = createSkinTimelineController({
      window, document, getPage: () => api.page, getPostSelector: () => api.sel?.topicPosts,
      isEnabled: () => configController.config.shell,
      hasPerfProbe: () => api.hasHandler('perf-probe:record'), emitPerf: perfEmit,
    })
    const { ensure: ensureTimeline, schedule: scheduleTimeline, bind: bindWindow, unbind: unbindWindow } = timelineController

    /* ── M17 单一阅读画布 ─────────────────────────────────────────────── */
    const { close: canvasCloseContextPill, act: canvasNativeAction,
      bind: canvasBindSelection, unbind: canvasUnbindSelection } = createSkinSelectionController({
      window, document, ui: api.ui,
      getPill: () => canvasSurface('context-pill'), getSurfaceHost: () => canvasHostController.surfaceHost,
      getActiveSheet: () => canvasHostController.activeSheet, getViewport: canvasViewport,
      nextZIndex: () => canvasHostController.nextZIndex(),
      restoreFocus: () => canvasHostController.restoreFocus(),
    })

    const surfaceLayoutController = createSkinSurfaceLayoutController({
      window, configController,
      getSurfaceHost: () => canvasHostController.surfaceHost, getSurface: canvasSurface, getViewport: canvasViewport,
      stateApi: { CANVAS_DEFAULT_SURFACES, resolveSurfaceMode, clampSurfaceRect },
      persistRect: canvasPersistSurfaceRect, setSiteStatusExpanded: canvasSiteStatusSetExpanded,
      syncSiteSidebar: canvasSyncSiteSidebar, nextZIndex: () => canvasHostController.nextZIndex(), closeSurface: canvasCloseSurface,
    })
    const { applyModes: canvasApplySurfaceModes, endDrag: canvasEndDrag,
      beginDrag: canvasBeginDrag, beginResize: canvasBeginResize, keyboardMove: canvasKeyboardMove } = surfaceLayoutController

    const appearanceController = createSkinAppearanceController({
      window, document, ui: api.ui, configController, mediaController,
      getSurfaceHost: () => canvasHostController.surfaceHost, getSurface: canvasSurface, getShell: () => canvasHostController.shell,
      locationText, saveState: saveCanvasState, applyTokens: applyShellTokens,
      syncMedia: syncShellMedia, applySurfaceModes: canvasApplySurfaceModes,
    })
    const { sync: canvasSyncAppearance } = appearanceController

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
        const featureBtn = e.target.closest('[data-lsb-plugin-feature]')
        if (featureBtn) {
          e.preventDefault()
          openPluginFeature(featureBtn.getAttribute('data-lsb-plugin-feature'))
          return
        }
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
      if (configController.config.shell && el?.getAttribute?.('data-lsb-canvas-shell') === 'true') {
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
      setSection(el.querySelector('[data-lsb-shell-section="tools"]'), '工具', pluginCatalog.tools())
      syncShellRoute(el)
      syncShellScrollBridge(canvasHomeScrollRoot() || contentController.scroller)
      syncHomeInfiniteScroll()
      syncShellMedia()
      return el
    }

    function refreshRouteEnhancements(serial) {
      if (!spaController.isCurrent(serial)) return false
      applyMarkers()
      fillShell()
      refreshNativeRouteEnhancements()
      onlineController.scheduleRefresh(0, true, true)
      if (!spaController.isCurrent(serial)) return false
      try {
        const EventCtor = window.CustomEvent || CustomEvent
        document.dispatchEvent(new EventCtor(SPA_ROUTE_COMMITTED_EVENT, {
          detail: { href: location.href, serial },
        }))
      } catch {
        /* A native enhancement hook is optional and must not block routing. */
      }
      spaController.markFilled(serial)
      return true
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
      if (canvasScrollController.target instanceof Element) return canvasScrollController.target
      if (contentController.scroller instanceof Element) return contentController.scroller
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

    const runtimeController = createSkinRuntimeController({
      window, document, configController, timelineController, mediaController,
      onlineController, viewCacheController, spaController, canvasHostController, shellTokenProps,
      getSettingsController: () => settingsController,
      challengeAttr: CLOUDFLARE_CHALLENGE_ATTR, isChallengeDocument: isCloudflareChallengeDocument,
      hooks: {
        asideWide,
        restyle,
        markNative,
        currentScrollX,
        currentScrollY,
        scrollCurrentRootTo,
        clearNativeRouteEnhancements,
        unbindWindow,
        unbindWindowInteractions,
        unbindAsideResize,
        stopOnlineWatch,
        stopExtrasWatch,
        destroyAsideViews,
        unmountCanvas,
        unmountShellWindows,
        restoreAsideCards,
        restoreAsidePersistentCards,
        restoreUserCard,
        restoreTopExtras,
        restoreThemeToggle,
        restoreSearch,
        unbindHomeInfiniteScroll,
        refreshNativeRouteEnhancements,
        bindAsideResize,
        mountCanvas,
        fillShell,
        syncHomeInfiniteScroll,
        syncShellMedia,
        adoptSearch,
        shellSearchHost,
        adoptThemeToggle,
        adoptUserCard,
        findRouteOutlet,
        canvasMountProfile,
        canvasSurface,
        canvasSyncSiteSidebar,
      },
    })
    const { applyAll, scheduleRefresh } = runtimeController

    const settingsController = createSkinSettingsController({
      document, ui: api.ui, getConfig: () => api.config(), saveConfig: (patch) => api.saveConfig(patch),
      configController, mediaController, applyAll,
    })
    api.ui.configTab({ name: '界面精修', order: 80, render: settingsController.render })

    settingsController.syncMenu()

    api.on('config:changed:skin', runtimeController.onConfigChanged)
    api.on('route:changed', () => {
      scheduleRefresh(true)
    })
    api.on('plugin:activated', () => {
      scheduleRefresh(false)
    })
    api.on('plugin:disabled', () => {
      scheduleRefresh(false)
    })
    api.on('topic:posts-added', scheduleTimeline)
    api.dom.each(
      '.dark-mode-control, [data-themes-mode-toggle], a.color-scheme-top-link, a.search-page-link, form.search-form, form.meilisearch-search-top-form, form[role="search"][aria-label="站内搜索"], .sidebar-card.user-card',
      runtimeController.onNativeNode,
    )

    api.onDispose(runtimeController.dispose)

    api.handle('skin:debug', () => ({
      active: { ...configController.config },
      markers: [...document.documentElement.classList].filter((c) => c.startsWith('lsb-skin-')),
      styleBytes: (document.getElementById('lsb-skin-style')?.textContent || '').length,
      themesPluginDetected: themesPresent,
      canvas: canvasDebugSnapshot(),
      shell: {
        on: !!configController.config.shell,
        mounted: !!document.getElementById('lsb-shell'),
        boards: collectBoards().length,
        location: locationText(),
        timeline: !!document.getElementById('lsb-shell-timeline'),
        me: !!document.querySelector('#lsb-shell .sidebar-card.user-card'),
        extras: document.querySelectorAll('.lsb-shell-extras a').length,
        aside: document.querySelectorAll('#lsb-shell-aside .sidebar-card').length,
        spa: spaController.bound,
        windows: windowController.registry.map((item) => {
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
        layoutKey: windowController.layout ? shellLayoutApi.layoutStorageKey(location.origin, shellLayoutApi.widthBucket(shellViewport(shellWorkspace()).width)) : '',
        scrollBridge: !!contentController.bridge,
      },
    }))

    applyAll()

    return {}
  }

  const w = typeof unsafeWindow !== 'undefined' ? unsafeWindow : window
  if (w.LSB && w.LSB.register) w.LSB.register(manifest, setup)
  else (w.LSB_PLUGINS = w.LSB_PLUGINS || []).push({ manifest, setup })
})()
