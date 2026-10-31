// Coordinates shell refresh, mode transitions and existing resource cleanup.
// Construction is inert; setup keeps registration ownership and its original order.
export function createSkinRuntimeController({
  window, document, configController, timelineController, mediaController,
  onlineController, viewCacheController, spaController, canvasHostController,
  shellTokenProps, getSettingsController, challengeAttr, isChallengeDocument, hooks,
}) {
  const { Element, MutationObserver } = window
  const { effectiveUiMode, read: readCanvasState } = configController
  const { bind: bindSpa, unbind: unbindSpa, clear: clearSpaTransaction, clearChrome: clearSpaRouteChromeHold } = spaController
  const {
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
  } = hooks
  let mountedUiMode = null
  let pendingUiModeScroll = null
  let cloudflareChallengeObserver = null
  let uiModeResizeBound = false
  let uiModeWideSnapshot = null
  let refreshTimer = 0

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
      attributeFilter: [challengeAttr],
    })
  }

  function unbindCloudflareChallengeWatch() {
    cloudflareChallengeObserver?.disconnect?.()
    cloudflareChallengeObserver = null
  }

  function unmountShellLayer({ preserveBootStyle = false } = {}) {
    clearSpaTransaction()
    clearNativeRouteEnhancements()
    timelineController.cancelPending()
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
    mediaController.reset()
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
    onlineController.stop()
    unmountShellLayer()
    viewCacheController.clear()
    spaController.resetView()
  }

  function refreshShell() {
    refreshTimer = 0
    if (!configController.config.shell) {
      const scrollPosition = pendingUiModeScroll
      pendingUiModeScroll = null
      teardownShell()
      if (scrollPosition) scrollCurrentRootTo(scrollPosition.x, scrollPosition.y)
      return
    }

    bindCloudflareChallengeWatch()
    if (isChallengeDocument(document)) {
      const scrollPosition = pendingUiModeScroll
      pendingUiModeScroll = null
      unbindUiModeResize()
      unbindSpa()
      unbindHomeInfiniteScroll()
      onlineController.stop()
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
      // Canvas mounting also needs to bind the initial homepage scroll root;
      // waiting for a later route refresh leaves the first page inert.
      syncHomeInfiniteScroll()
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

  function scheduleRefresh(fromRoute) {
    if (fromRoute && spaController.filled) return
    window.clearTimeout(refreshTimer)
    refreshTimer = window.setTimeout(refreshShell, 50)
  }

  function applyAll() {
    restyle()
    refreshShell()
  }

  function onConfigChanged() {
    const previousMode = effectiveUiMode()
    const previousShell = configController.config.shell
    const scrollPosition = { x: currentScrollX(), y: currentScrollY() }
    configController.reload()
    if (effectiveUiMode() !== previousMode || configController.config.shell !== previousShell) pendingUiModeScroll = scrollPosition
    readCanvasState()
    applyAll()
    getSettingsController().syncMenu()
  }

  function onNativeNode() {
    if (!configController.config.shell) return
    adoptSearch(shellSearchHost())
    adoptThemeToggle(document.querySelector('[data-lsb-shell-theme]'))
    adoptUserCard(document.querySelector('[data-lsb-shell-me]'))
    if (mountedUiMode === 'ios27') {
      const outlet = findRouteOutlet()
      canvasMountProfile(outlet)
      const site = canvasSurface('site-card')
      if (canvasHostController.activeSheet === 'site-card' || site?.dataset.surfaceMode === 'rail') canvasSyncSiteSidebar(site)
    }
  }

  function dispose() {
    mediaController.dispose()
    getSettingsController().clearMenu()
    teardownShell()
    const root = document.documentElement
    for (const c of [...root.classList].filter((x) => x.startsWith('lsb-skin-'))) root.classList.remove(c)
    document.getElementById('lsb-skin-style')?.remove()
  }

  function cancelRefresh() {
    window.clearTimeout(refreshTimer)
    refreshTimer = 0
  }

  return { applyAll, scheduleRefresh, cancelRefresh, onConfigChanged, onNativeNode, dispose }
}
