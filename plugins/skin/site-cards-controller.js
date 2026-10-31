/** Owns canvas site cards, their native origins and persistent route placeholders. */
export function createSkinSiteCardsController({ document, getSidebars }) {
  const { Element, HTMLElement } = document.defaultView
  const canvasSiteSidebarHomes = new Map()
  const canvasPersistentSiteCards = new Map()

  function restoreNode(el, home, cls) {
    if (!el) return
    if (!home?.hadClass) el.classList.remove(cls)
    if (!el.parentNode) {
      home?.placeholder?.remove()
      return
    }
    if (!home?.parent?.isConnected) {
      home?.placeholder?.remove()
      el.remove()
      return
    }
    if (home.placeholder?.parentNode === home.parent) {
      home.parent.replaceChild(el, home.placeholder)
    } else if (home.next?.parentNode === home.parent) {
      home.parent.insertBefore(el, home.next)
    } else {
      home.parent.append(el)
    }
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
      : (originalParent?.isConnected ? originalParent : getSidebars().find((side) => side.isConnected))
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
    if (releasePersistent) canvasPersistentSiteCards.clear()
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
    const cards = [...canvasSiteSidebarHomes]
      .filter(([card, home]) => card.parentNode && home.parent?.isConnected)
      .map(([card]) => card)
    const emittedPersistentKinds = new Set()
    for (const side of getSidebars()) {
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
    return [...new Set(cards)]
  }

  function syncPersistent(host) {
    const cards = []
    const emitted = new Set()
    for (const side of getSidebars()) {
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

  function syncAll(host) {
    const cards = canvasNativeSiteCards()
    const current = new Set(cards)
    const persistentNodes = new Set(
      [...canvasPersistentSiteCards.values()].map((record) => record.node),
    )
    for (const [card, home] of [...canvasSiteSidebarHomes]) {
      if (!card.parentNode || !home.parent?.isConnected) {
        restoreNode(card, home, 'lsb-canvas-site-card')
        canvasSiteSidebarHomes.delete(card)
      }
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
        const parent = card.parentNode
        const placeholder = document.createComment('lsb-canvas-site-card-origin')
        parent?.insertBefore(placeholder, card)
        canvasSiteSidebarHomes.set(card, { parent, next: card.nextSibling, placeholder, hadClass: card.classList.contains('lsb-canvas-site-card') })
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

  function sync(host, { persistentOnly = false } = {}) {
    if (!(host instanceof Element)) return
    if (persistentOnly) syncPersistent(host)
    else syncAll(host)
  }
  return { sync, restore: canvasRestoreSiteSidebar, stageOrigins: canvasStagePersistentSiteCardOrigins, rebindOrigins: canvasRebindPersistentSiteCardOrigins }
}
