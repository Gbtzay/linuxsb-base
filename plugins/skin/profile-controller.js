/** Owns native user cards and reversible canvas profile decoration. */
export function createSkinProfileController({ window, document, getPage, getMe, getSidebars, getSelfHost, getViewport }) {
  const { Element, HTMLElement, URL } = window
  let canvasProfileExpanded = false
  let canvasProfileScrollMode = 'full'
  let canvasSelfProfileHome = null
  let canvasSelfProfileHost = null
  let canvasSelfProfileLocked = false
  let canvasListSurface = null
  let canvasListHome = null
  let userCardHome = null
  let canvasProfileSlot = null
  let canvasProfileOutlet = null
  const decorations = new Map()
  const bindings = new Map()

  function rememberHome(node, cls) {
    return { node, parent: node.parentNode, next: node.nextSibling, hadClass: node.classList.contains(cls) }
  }

  function decorate(node, name, value) {
    if (!node) return
    let attributes = decorations.get(node)
    if (!attributes) decorations.set(node, attributes = new Map())
    if (!attributes.has(name)) attributes.set(name, { before: node.getAttribute(name), applied: value })
    const owned = attributes.get(name)
    if (node.getAttribute(name) !== owned.applied) owned.before = node.getAttribute(name)
    owned.applied = value
    node.setAttribute(name, value)
  }

  function restoreDecorations() {
    for (const [node, attributes] of decorations) {
      for (const [name, { before, applied }] of attributes) {
        if (node.getAttribute(name) !== applied) continue
        if (before === null) node.removeAttribute(name)
        else node.setAttribute(name, before)
      }
    }
    decorations.clear()
  }

  function restoreNode(el, home, cls) {
    if (!el) return
    if (!home?.hadClass) el.classList.remove(cls)
    if (!el.parentNode) return
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

  function findNativeUserCard() {
    const hosted = document.querySelector('#lsb-shell [data-lsb-shell-me] .sidebar-card.user-card')
    if (hosted) return hosted
    for (const side of getSidebars()) {
      const card = side.querySelector('.sidebar-card.user-card')
      if (card) return card
    }
    return document.querySelector('aside.sidebar .sidebar-card.user-card')
  }

  function isSelfUserCard(card) {
    if (!(card instanceof Element)) return false
    const uid = getMe()?.uid
    if (uid == null) return true
    const href = card.querySelector('a.user-name')?.getAttribute('href') || ''
    try {
      const url = new URL(href, document.location.href)
      return url.origin === document.location.origin && url.pathname.replace(/\/+$/, '') === `/user/${uid}`
    } catch { return false }
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
    const userPageProfile = getPage()?.type === 'user' && host.hasAttribute('data-lsb-canvas-profile')
    const incoming = userPageProfile ? null : findIncomingSelfCard(host)
    const hosted = host.querySelector('.sidebar-card.user-card')
    if (incoming && incoming !== hosted) {
      if (hosted && userCardKey(hosted) === userCardKey(incoming)) return
      if (hosted) restoreUserCard()
      if (userCardHome?.node !== incoming) userCardHome = rememberHome(incoming, 'lsb-shell-user-card')
      incoming.classList.add('lsb-shell-user-card')
      host.append(incoming)
      return
    }
    if (hosted) return
    let card = findNativeUserCard()
    if (userPageProfile) {
      card = getSidebars()
        .flatMap((side) => [...side.querySelectorAll('.sidebar-card.user-card')])
        .find((candidate) => !host.contains(candidate) && !isSelfUserCard(candidate)) || card
    }
    if (!(card instanceof Element) || host.contains(card) || (!userPageProfile && !isSelfUserCard(card))) return
    if (userCardHome?.node !== card) userCardHome = rememberHome(card, 'lsb-shell-user-card')
    card.classList.add('lsb-shell-user-card')
    host.append(card)
  }

  function restoreUserCard() {
    const card = userCardHome?.node
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
    if (!(host instanceof Element) || bindings.has(host)) return
    host.dataset.canvasProfileBound = '1'
    const listeners = []
    const on = (node, event, listener) => {
      if (!node) return
      node.addEventListener(event, listener)
      listeners.push(() => node.removeEventListener(event, listener))
    }
    bindings.set(host, () => {
      listeners.forEach((off) => off())
      host.removeAttribute('data-canvas-profile-bound')
    })
    on(host, 'mouseenter', () => {
      if (getViewport().width < 1100 || canvasSelfProfileLocked) return
      canvasProfileSetExpanded(host, true, false)
    })
    on(host, 'mouseleave', () => {
      if (canvasSelfProfileLocked) return
      canvasProfileSetExpanded(host, false, false)
    })
    on(host, 'focusout', (event) => {
      if (canvasSelfProfileLocked || host.contains(event.relatedTarget)) return
      canvasProfileSetExpanded(host, false, false)
    })
    const button = host.querySelector('[data-canvas-profile-expand]')
    on(button, 'click', (event) => {
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
    decorate(card, 'id', 'lsb-canvas-self-profile-card')
    const host = card.closest('[data-canvas-profile-host]')
    decorate(host?.querySelector('[data-canvas-profile-expand]'), 'aria-controls', card.id)
    const bell = [...card.querySelectorAll('a[href]')].find((a) => {
      const href = a.getAttribute('href') || ''
      return /[?&]tab=notifications(?:&|$)/.test(href)
    })
    if (bell) {
      decorate(bell, 'data-canvas-profile-bell', '')
      decorate(bell, 'aria-label', '我的通知')
      decorate(bell, 'title', '我的通知')
    }
  }

  function canvasMountSelfProfile() {
    const host = getSelfHost()
    if (!(host instanceof Element)) return null
    if (canvasSelfProfileHost && canvasSelfProfileHost !== host) {
      bindings.get(canvasSelfProfileHost)?.()
      bindings.delete(canvasSelfProfileHost)
      canvasSelfProfileHost.hidden = true
    }
    canvasSelfProfileHost = host
    canvasBindSelfProfile(host)
    let card = host.querySelector('.sidebar-card.user-card')
    if (card instanceof Element) {
      if (canvasSelfProfileHome?.node !== card) {
        restoreNode(canvasSelfProfileHome?.node, canvasSelfProfileHome, 'lsb-canvas-self-user-card')
        restoreDecorations()
        canvasSelfProfileHome = rememberHome(card, 'lsb-canvas-self-user-card')
      }
      canvasPrepareSelfProfileCard(card)
      host.hidden = false
      canvasSelfProfileLocked = false
      canvasProfileSetExpanded(host, false, false)
      return host
    }
    if (!(card instanceof Element)) {
      card = canvasSelfProfileHome?.node?.parentNode ? canvasSelfProfileHome.node : null
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
    if (canvasSelfProfileHome?.node !== card) {
      restoreNode(canvasSelfProfileHome?.node, canvasSelfProfileHome, 'lsb-canvas-self-user-card')
      restoreDecorations()
      canvasSelfProfileHome = rememberHome(card, 'lsb-canvas-self-user-card')
    }
    host.append(card)
    canvasPrepareSelfProfileCard(card)
    host.hidden = false
    canvasSelfProfileLocked = false
    canvasProfileSetExpanded(host, false, false)
    return host
  }

  function canvasRestoreSelfProfile() {
    const card = canvasSelfProfileHome?.node
    restoreNode(card, canvasSelfProfileHome, 'lsb-canvas-self-user-card')
    restoreDecorations()
    for (const off of bindings.values()) off()
    bindings.clear()
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
    if (canvasListSurface && canvasListHome) {
      if (canvasListHome.mark === null) canvasListSurface.removeAttribute('data-lsb-canvas-list')
      else canvasListSurface.setAttribute('data-lsb-canvas-list', canvasListHome.mark)
    }
    canvasListSurface = null
    canvasListHome = null
    canvasProfileExpanded = false
    canvasProfileScrollMode = 'full'
    canvasProfileSlot?.remove()
    canvasProfileSlot = null
    canvasProfileOutlet = null
  }

  function canvasUserListSurface(outlet) {
    if (!(outlet instanceof Element) || getPage()?.type !== 'user') return null
    const direct = [...outlet.children].find((node) => node.matches?.('.home-shell, .forum-layout, .forum-main, .main-panel'))
    const list = direct || outlet.querySelector('.home-shell, .forum-layout, .forum-main, .main-panel')
    if (!(list instanceof Element)) return null
    if (canvasListSurface && canvasListSurface !== list) {
      if (canvasListHome?.mark === null) canvasListSurface.removeAttribute('data-lsb-canvas-list')
      else if (canvasListHome) canvasListSurface.setAttribute('data-lsb-canvas-list', canvasListHome.mark)
      canvasListHome = null
    }
    if (!canvasListHome) canvasListHome = { mark: list.getAttribute('data-lsb-canvas-list') }
    list.setAttribute('data-lsb-canvas-list', '')
    canvasListSurface = list
    return list
  }

  function canvasApplyUserSurfaceState(outlet, slot) {
    if (!(slot instanceof Element) || getPage()?.type !== 'user') return
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
    if (getPage()?.type !== 'user') return canvasSelfProfileHost
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

  function canvasUpdateProfileScroll(y, previous) {
    const host = document.querySelector('[data-lsb-canvas-profile]')
    if (!(host instanceof Element) || getPage()?.type !== 'user') return
    // 资料卡已经收窄到原生选项的内容宽度，完整链接始终可见，不再因滚动折叠。
    canvasProfileExpanded = false
    canvasProfileScrollMode = 'full'
    host.dataset.scrollMode = canvasProfileScrollMode
    host.dataset.expanded = String(canvasProfileExpanded)
  }

  return { adoptUserCard, restoreUserCard, isSelfUserCard, mount: canvasMountProfile, restore: canvasRestoreProfile, updateScroll: canvasUpdateProfileScroll }
}
