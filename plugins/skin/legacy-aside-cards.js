/** Owns legacy sidebar cards, cached fallbacks and late-card observation. */
export function createSkinAsideCardsController({ window, document, store, getSidebars, getPage, isSelfUserCard, isEnabled, syncOnlineDots }) {
  const { Element, Node } = document.defaultView
  const asideHomes = new Map()
  const asidePersistentCards = new Map()
  let onlineObs = null
  let observedSidebars = []

  function restoreNode(el, home, cls) {
    if (!el) return
    el.classList.remove(cls)
    if (!home?.parent?.isConnected) {
      el.remove()
      return
    }
    if (home.next?.parentNode === home.parent) {
      home.parent.insertBefore(el, home.next)
    } else {
      home.parent.append(el)
    }
  }

  function nativeCards() {
    return getSidebars().flatMap((side) => [...side.querySelectorAll('.sidebar-card')])
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
        : getSidebars().find((side) => side.isConnected)
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
      if (el.hasAttribute('data-lsb-aside-keep')) return false
      if (seen.has(el)) return false
      seen.add(el)
      return true
    })
    const text = (el) => (el.textContent || '').replace(/\s+/g, ' ').trim()
    const onUser = getPage()?.type === 'user'
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
    syncOnlineDots()
  }

  function cardLabel(el) {
    return (el.textContent || '').replace(/\s+/g, ' ').trim()
  }

  function snapshotAsideKeep(host) {
    if (!(host instanceof Element)) return
    const keep = { ...(store.get('asideKeep') || {}) }
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
    if (changed) store.set('asideKeep', keep)
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
    const keep = store.get('asideKeep') || {}
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
    stopOnlineWatch()
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
    const liveOnline = '#lsb-shell-aside [data-lsb-shell-site] .online-users-card:not([data-lsb-aside-keep])'
    if (!isEnabled() || document.querySelector(liveOnline)) {
      stopOnlineWatch()
      return
    }
    const sides = getSidebars().filter((side) => side.isConnected)
    if (onlineObs && sides.length === observedSidebars.length && sides.every((side, i) => side === observedSidebars[i])) return
    stopOnlineWatch()
    if (!sides.length) return
    onlineObs = new window.MutationObserver(() => {
      const host = document.querySelector('#lsb-shell-aside [data-lsb-shell-site]')
      if (!host || !isEnabled()) return
      adoptAsideCards(host)
      if (document.querySelector(liveOnline)) stopOnlineWatch()
    })
    observedSidebars = sides
    for (const side of sides) onlineObs.observe(side, { childList: true, subtree: true })
  }

  function stopOnlineWatch() {
    onlineObs?.disconnect()
    onlineObs = null
    observedSidebars = []
  }

  return { adopt: adoptAsideCards, restore: restoreAsideCards, restorePersistent: restoreAsidePersistentCards,
    pruneDetached: pruneDetachedAsideCards, watch: watchOnlineCard, stop: stopOnlineWatch }
}
