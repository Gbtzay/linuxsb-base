// History state and temporary scroll-anchoring ownership for shell navigation.
export function createSkinHistoryController({ window, document, getScrollRoot, readScroll, scrollTo }) {
  const history = window.history
  let index = 0
  let rollbackIndex = null
  let bound = false
  let previousRestoration
  let ownsRestoration = false
  let restoreCleanup = null

  function readIndex() {
    const value = Number(history.state?.lsbShellSpaIndex)
    return Number.isSafeInteger(value) && value >= 0 ? value : null
  }

  function entryState(url, nextIndex, x, y) {
    const prior = history.state && typeof history.state === 'object' ? history.state : {}
    return {
      ...prior,
      lsbShellSpa: true,
      lsbShellSpaIndex: nextIndex,
      lsbShellSpaUrl: url,
      lsbScrollX: Number(x) || 0,
      lsbScrollY: Number(y) || 0,
    }
  }

  function rememberScroll() {
    const nextIndex = readIndex() ?? index
    const { x, y } = readScroll()
    try {
      history.replaceState(entryState(window.location.href, nextIndex, x, y), '', window.location.href)
      index = nextIndex
    } catch { /* history unavailable must not block content navigation */ }
  }

  function bind() {
    if (bound) return
    bound = true
    try {
      previousRestoration = history.scrollRestoration
      history.scrollRestoration = 'manual'
      ownsRestoration = true
    } catch { /* unsupported history property */ }
    index = readIndex() ?? 0
    rememberScroll()
  }

  function apply(target, mode) {
    if (mode === 'none') return
    const currentIndex = readIndex() ?? index
    const nextIndex = mode === 'replace' ? currentIndex : currentIndex + 1
    try {
      const state = entryState(target.href, nextIndex, 0, 0)
      if (mode === 'replace') history.replaceState(state, '', target.href)
      else history.pushState(state, '', target.href)
      index = nextIndex
    } catch { /* content can still render when the address bar cannot be updated */ }
  }

  function acceptPop(canLeave) {
    const targetIndex = readIndex()
    if (rollbackIndex !== null) {
      const expected = rollbackIndex
      rollbackIndex = null
      if (targetIndex === expected) {
        index = expected
        return false
      }
    }
    if (!canLeave()) {
      rollbackIndex = index
      try {
        history.go(targetIndex === null ? 1 : index - targetIndex)
      } catch { rollbackIndex = null }
      return false
    }
    if (targetIndex !== null) index = targetIndex
    return true
  }

  function cancelRestore() {
    restoreCleanup?.()
  }

  function protectScrollAnchor() {
    const root = getScrollRoot() || document.scrollingElement || document.documentElement
    if (!root?.style) return
    const style = root.style
    const prior = style.getPropertyValue('overflow-anchor')
    const priority = style.getPropertyPriority('overflow-anchor')
    style.setProperty('overflow-anchor', 'none', 'important')
    const events = ['wheel', 'touchstart', 'pointerdown', 'keydown', 'pagehide']
    const scrollKeys = new Set(['ArrowUp', 'ArrowDown', 'ArrowLeft', 'ArrowRight', 'PageUp', 'PageDown', 'Home', 'End', ' ', 'Spacebar'])
    let active = true
    let timer = 0
    const cleanup = () => {
      if (!active) return
      active = false
      window.clearTimeout(timer)
      for (const event of events) window.removeEventListener(event, onInput, true)
      if (style.getPropertyValue('overflow-anchor') === 'none' && style.getPropertyPriority('overflow-anchor') === 'important') {
        if (prior) style.setProperty('overflow-anchor', prior, priority)
        else style.removeProperty('overflow-anchor')
      }
      if (restoreCleanup === cleanup) restoreCleanup = null
    }
    function onInput(event) {
      if (event.type !== 'keydown' || scrollKeys.has(event.key)) cleanup()
    }
    restoreCleanup = cleanup
    for (const event of events) window.addEventListener(event, onInput, { capture: true, passive: true })
    // Covers the native toolbar's following frames and the 180ms content entrance.
    // No repeated scroll writes: user intent and subsequent layout keep their ownership.
    timer = window.setTimeout(cleanup, 250)
  }

  function restoreScroll(mode) {
    cancelRestore()
    const savedAxis = (key) => {
      const value = Number(history.state?.[key])
      return Number.isFinite(value) && value >= 0 ? value : 0
    }
    if (mode === 'none') protectScrollAnchor()
    try {
      scrollTo(mode === 'none' ? savedAxis('lsbScrollX') : 0, mode === 'none' ? savedAxis('lsbScrollY') : 0)
    } catch {
      cancelRestore()
    }
  }

  function cancel() {
    rollbackIndex = null
    cancelRestore()
  }

  function dispose() {
    cancel()
    if (ownsRestoration) {
      try {
        if (history.scrollRestoration === 'manual') {
          if (previousRestoration === undefined) delete history.scrollRestoration
          else history.scrollRestoration = previousRestoration
        }
      } catch { /* read-only history property */ }
    }
    ownsRestoration = false
    bound = false
  }

  return { bind, rememberScroll, apply, acceptPop, restoreScroll, cancelRestore, cancel, dispose }
}
