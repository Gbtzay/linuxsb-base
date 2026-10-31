// Owns canvas surface geometry and pointer/keyboard layout interactions.
export function createSkinSurfaceLayoutController({
  window, configController, getSurfaceHost, getSurface, getViewport, stateApi,
  persistRect, setSiteStatusExpanded, syncSiteSidebar, nextZIndex, closeSurface,
}) {
  const { Element, HTMLElement } = window
  const { CANVAS_DEFAULT_SURFACES, resolveSurfaceMode, clampSurfaceRect } = stateApi
  let canvasDragState = null
  let canvasDragRaf = 0

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

  function canvasApplySurfaceModes() {
    if (!(getSurfaceHost() instanceof Element)) return
    for (const id of ['ai-card', 'site-card', 'evidence-card']) {
      const surface = getSurface(id)
      if (!(surface instanceof Element)) continue
      const mode = resolveSurfaceMode(configController.widthClass, id)
      surface.dataset.surfaceMode = mode
      const resizeHandle = surface.querySelector('[data-canvas-resize-handle]')
      if (resizeHandle instanceof HTMLElement) resizeHandle.hidden = mode === 'rail'
      const stored = configController.effective?.layout?.[configController.widthClass]?.[id]
      if (mode === 'floating') {
        const viewport = getViewport()
        const defaultKey = id === 'ai-card' ? 'aiCard' : id === 'site-card' ? 'siteCard' : 'evidenceCard'
        const configured = configController.effective?.surfaceDefaults?.[defaultKey] || CANVAS_DEFAULT_SURFACES[defaultKey] || {}
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
        const statusOwnsSiteCard = id === 'site-card' && configController.widthClass === 'wide'
        surface.hidden = statusOwnsSiteCard
        surface.setAttribute('aria-hidden', String(statusOwnsSiteCard))
        surface.setAttribute('data-canvas-surface-state', statusOwnsSiteCard ? 'closed' : 'open')
      } else {
        for (const prop of ['left', 'top', 'width', 'height', 'right', 'bottom']) surface.style.removeProperty(prop)
      }
    }
    const statusHost = getSurface('site-status')?.querySelector('[data-canvas-site-status-host]')
    if (statusHost instanceof Element && configController.widthClass !== 'wide') setSiteStatusExpanded(statusHost, false, false)
    if (configController.widthClass === 'wide') syncSiteSidebar()
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
    }, getViewport(), { width: 320, height: 220 })
    state.surface.style.transform = ''
    if (commit) {
      state.surface.style.left = `${finalRect.x}px`
      state.surface.style.top = `${finalRect.y}px`
      if (state.kind === 'resize') {
        state.surface.style.width = `${finalRect.width}px`
        state.surface.style.height = `${finalRect.height}px`
      }
      persistRect(state.id, finalRect)
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
      surface.style.zIndex = String(8010 + nextZIndex())
      event.preventDefault()
      return
    }
    else if (event.key === 'End') {
      surface.style.zIndex = '8000'
      event.preventDefault()
      return
    }
    else if (event.key === 'Escape') { closeSurface(id); return }
    else return
    event.preventDefault()
    const clean = clampSurfaceRect(next, getViewport(), { width: 320, height: 220 })
    surface.style.left = `${clean.x}px`
    surface.style.top = `${clean.y}px`
    persistRect(id, clean)
  }

  return {
    applyModes: canvasApplySurfaceModes, endDrag: canvasEndDrag,
    beginDrag: canvasBeginDrag, beginResize: canvasBeginResize, keyboardMove: canvasKeyboardMove,
    get dragging() { return !!canvasDragState },
  }
}
