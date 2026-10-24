// @skin-part: G2 shellSearchHost/adoptSearch/restoreSearch: 搜索框接管（约 2395 行）
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
