// @skin-part: A 配置与画布状态 — effectiveUiMode / canvasViewport / readSaveCanvasState 等，闭包：cfg / canvasState / api。
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
