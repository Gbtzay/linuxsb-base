// Owns the canvas host, panel presentation and delegated interactions.
// Dependencies are invoked lazily; setup retains global lifecycle orchestration.
export function createSkinCanvasHostController({
  window, document, configController, aiMarkup: CANVAS_AI_MARKUP, getPage,
  pluginCatalog, siteCardsController, hooks,
}) {
  const { Element, HTMLElement, CustomEvent, Event, MutationObserver, history, queueMicrotask } = window
  const {
    canvasPageType,
    locationText,
    navigationEntries,
    findRouteOutlet,
    nativeSidebars,
    markNative,
    renderCanvasTopLinks,
    restoreCanvasTopLinks,
    canvasMountProfile,
    canvasRestoreProfile,
    canvasSearchSetOpen,
    adoptSearch,
    restoreSearch,
    adoptThemeToggle,
    canvasCloseContextPill,
    canvasNativeAction,
    canvasBindSelection,
    canvasUnbindSelection,
    canvasEndDrag,
    canvasBeginDrag,
    canvasBeginResize,
    canvasKeyboardMove,
    canvasApplySurfaceModes,
    canvasSyncAppearance,
    bindAppearance,
    canvasBindWindow,
    canvasUnbindWindow,
    canvasScheduleScroll,
    canvasSyncScrollTarget,
    isCanvasScrollBound,
    isSurfaceDragging,
  } = hooks
  let canvasShell = null
  let canvasSurfaceHost = null
  let canvasActiveSheet = ''
  let canvasFocusReturn = null
  let canvasSearchOutsideHandler = null
  let canvasZIndex = 0
  let canvasSiteStatusHost = null
  let canvasSiteStatusLocked = false
  let canvasSidebarObserver = null

  function renderPluginFeatureEntries() {
    const host = canvasSurface('plugin-features-sheet')?.querySelector('[data-plugin-feature-list]')
    if (!(host instanceof Element)) return
    host.replaceChildren()
    const entries = pluginCatalog.features()
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
    const entries = pluginCatalog.settings()
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

  function canvasRestoreSiteSidebar(options) {
    siteCardsController.restore(options)
    canvasSiteStatusHost = null
    canvasSiteStatusLocked = false
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
    const useStatusHost = configController.widthClass === 'wide' && statusHost instanceof Element
    const host = useStatusHost ? canvasSiteStatusBody() : surface?.querySelector?.('[data-canvas-site-sidebar]')
    if (!(host instanceof Element)) return
    canvasSiteStatusHost = useStatusHost ? statusHost : null
    siteCardsController.sync(host, { persistentOnly: true })
  }

  function canvasSyncSiteSidebar(surface = canvasSurface('site-card')) {
    const statusSurface = canvasSurface('site-status')
    const statusHost = statusSurface?.querySelector('[data-canvas-site-status-host]')
    const useStatusHost = configController.widthClass === 'wide' && statusHost instanceof Element
    const host = useStatusHost ? canvasSiteStatusBody() : surface?.querySelector?.('[data-canvas-site-sidebar]')
    if (!(host instanceof Element)) return
    canvasSiteStatusHost = useStatusHost ? statusHost : null
    if (statusSurface instanceof HTMLElement) statusSurface.hidden = !useStatusHost
    if (statusHost instanceof HTMLElement) {
      statusHost.hidden = !useStatusHost
      if (!useStatusHost) canvasSiteStatusSetExpanded(statusHost, false, false)
    }
    siteCardsController.sync(host)
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
      if (!configController.config.shell) return
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

  function canvasApplyPageClass() {
    const root = document.documentElement
    for (const name of ['home', 'forum', 'topic', 'user', 'settings', 'page']) root.classList.remove(`lsb-canvas-page-${name}`)
    const pageType = canvasPageType()
    root.classList.add(`lsb-canvas-page-${pageType}`)
    const outlet = findRouteOutlet()
    outlet?.classList.toggle('lsb-canvas-content-root', true)
    configController.refreshContext()
    if (isCanvasScrollBound()) canvasSyncScrollTarget()
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
    if (id === 'site-card' && configController.widthClass === 'wide') {
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
    closePluginMenuSurfaces()
    void pluginCatalog.openFeature(pluginId)
  }

  function openPluginSettings(pluginId) {
    closePluginMenuSurfaces()
    pluginCatalog.openSettings(pluginId)
  }

  function canvasOpenSurface(id, trigger = null) {
    const wanted = String(id || '')
    if (wanted === 'site-card' && configController.widthClass === 'wide') return canvasOpenSiteStatus(trigger)
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
          detail: { host: surface.querySelector('[data-canvas-ai-host]'), viewContext: { route: getPage(), siteKey: configController.siteKey } },
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
    for (const item of navigationEntries()) {
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
      if (event.key === 'Escape' && isSurfaceDragging()) {
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
    if (configController.widthClass === 'wide' || canvasActiveSheet === 'site-card') canvasSyncSiteSidebar()
    else canvasSyncPersistentSiteCards()
    canvasBindWindow()
    canvasScheduleScroll()
    bindAppearance()
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

  return {
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
    nextZIndex: () => ++canvasZIndex,
    restoreFocus: () => { if (canvasFocusReturn?.isConnected) canvasFocusReturn.focus?.() },
    get shell() { return canvasShell },
    get surfaceHost() { return canvasSurfaceHost },
    get activeSheet() { return canvasActiveSheet },
  }
}
