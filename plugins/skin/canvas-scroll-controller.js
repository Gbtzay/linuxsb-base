// Owns canvas scroll targets, frame scheduling, and window listener lifecycle.
export function createSkinCanvasScrollController({
  window, document, getSurface, getViewport, isAsideWide, getContentScroller,
  syncScrollBridge, updateProfileScroll, applyPageClass, applySurfaceModes,
}) {
  const { Element } = window
  let canvasScrollBound = false
  let canvasScrollLast = 0
  let canvasScrollRaf = 0
  let canvasScrollHandler = null
  let canvasResizeHandler = null
  let canvasScrollTarget = null

  function canvasScrollSync() {
    canvasScrollRaf = 0
    const y = canvasScrollY()
    const status = getSurface('top-status')
    if (!status) return
    const previous = canvasScrollLast
    const down = y > previous + 2
    const up = y < previous - 2
    canvasScrollLast = y
    if (down || up) status.dataset.compact = down && y > 48 ? 'true' : 'false'
    updateProfileScroll(y, previous)
  }

  function canvasHomeScrollRoot() {
    const root = document.documentElement
    const canvasMode = root.classList.contains('lsb-canvas-mode')
    if (!root.classList.contains('lsb-skin-shell-on')) return null
    if (!root.classList.contains('lsb-skin-shell-home')) return null
    if (canvasMode) {
      if (!root.classList.contains('lsb-canvas-page-home')) return null
      if (getViewport().width < 700) return null
    } else if (!isAsideWide()) {
      return null
    }
    const panel = canvasMode
      ? document.querySelector('.lsb-canvas-content-root > .home-shell .main-panel')
      : document.querySelector('body > main.wrap .home-shell .main-panel')
    return panel instanceof Element ? panel : null
  }

  function canvasScrollRoot() {
    return canvasHomeScrollRoot() || (getContentScroller() instanceof Element ? getContentScroller() : null)
  }

  function canvasSyncScrollTarget() {
    const next = canvasScrollRoot()
    syncScrollBridge(next)
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
      applyPageClass()
      applySurfaceModes()
      canvasScheduleScroll()
    }
    window.addEventListener('scroll', canvasScrollHandler, { passive: true })
    window.addEventListener('resize', canvasResizeHandler)
    canvasSyncScrollTarget()
    canvasScrollLast = canvasScrollY()
    updateProfileScroll(canvasScrollLast, canvasScrollLast)
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

  return {
    homeRoot: canvasHomeScrollRoot, syncTarget: canvasSyncScrollTarget,
    schedule: canvasScheduleScroll, bind: canvasBindWindow, unbind: canvasUnbindWindow,
    get bound() { return canvasScrollBound },
    get target() { return canvasScrollTarget },
  }
}
