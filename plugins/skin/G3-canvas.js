// @skin-part: G3 M17 单一阅读画布 — canvas 渲染与交互（约 3281 行）
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
