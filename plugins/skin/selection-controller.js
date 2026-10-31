// Owns canvas text selection, native context actions, and dismissal lifecycle.
export function createSkinSelectionController({ window, document, ui, getPill, getSurfaceHost, getActiveSheet, restoreFocus, getViewport, nextZIndex }) {
  const { Element, HTMLElement, SVGElement, navigator } = window
  let canvasSelectionBound = false
  let canvasSelectionHandler = null
  let canvasSelectionPost = null
  let canvasSelectionText = ''
  let canvasSelectionDismissTimer = 0

  function canvasCloseContextPill(restore = false) {
    const pill = getPill()
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
    if (restore) restoreFocus()
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
        ui.toast?.('已复制选中文本', { type: 'success' })
      } catch {
        ui.toast?.('复制失败，请手动选择文本', { type: 'error' })
      }
    }
  }

  function canvasShowContextPill(post, range) {
    const pill = getPill()
    if (!(pill instanceof Element) || !(post instanceof Element)) return
    const text = String(window.getSelection?.()?.toString?.() || '').trim()
    if (!text) return canvasCloseContextPill()
    const rect = range?.getBoundingClientRect?.() || post.getBoundingClientRect?.()
    canvasSelectionPost = post
    canvasSelectionText = text.slice(0, 2000)
    pill.hidden = false
    pill.setAttribute('aria-hidden', 'false')
    const zIndex = nextZIndex()
    pill.style.zIndex = String(8020 + zIndex)
    const viewport = getViewport()
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
    if (!getSurfaceHost() || getActiveSheet() === 'context-pill') return
    const selection = window.getSelection?.()
    const text = String(selection?.toString?.() || '').trim()
    const node = selection?.anchorNode
    const post = node?.nodeType === 1 ? node.closest?.('.post-entry, .post-item') : node?.parentElement?.closest?.('.post-entry, .post-item')
    if (!text || !(post instanceof Element) || !document.documentElement.contains(post)) {
      if (!getPill()?.matches(':focus-within')) canvasCloseContextPill()
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

  return { close: canvasCloseContextPill, act: canvasNativeAction, bind: canvasBindSelection, unbind: canvasUnbindSelection }
}
