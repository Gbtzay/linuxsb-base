// Owns the live outlet, temporarily detached sidebars, and the window scroll bridge.
export function createSkinContentController({ window, document, isChallengeDocument, findLeftRails, createScrollBridge }) {
  let outlet = null
  let home = null
  let scroller = null
  let bridge = null
  const sidebarHomes = new Map()

  function findOutlet(scope = document) {
    if (isChallengeDocument(scope)) return null
    const candidates = [
      scope.querySelector?.('[data-slot~="page.before_render"]'),
      scope.querySelector?.('main.wrap'),
      scope.querySelector?.('main'),
    ]
    return candidates.find((node) => node && node.id !== 'lsb-shell' && !node.querySelector?.('#lsb-shell')) || null
  }

  function detachSidebars(root) {
    const sidebars = [...root.querySelectorAll('aside.sidebar')].filter((node) =>
      node.id !== 'mobile-menu-drawer' && !node.classList.contains('mobile-menu-drawer'))
    const rails = findLeftRails(root)
    for (const node of [...sidebars, ...rails]) {
      if (!sidebarHomes.has(node)) {
        sidebarHomes.set(node, {
          parent: node.parentNode,
          next: node.nextSibling,
          addedHidden: rails.includes(node) && !node.classList.contains('lsb-native-left-hidden'),
        })
      }
      if (rails.includes(node)) node.classList.add('lsb-native-left-hidden')
      if (node.parentNode !== document.body) document.body.append(node)
    }
  }

  function restoreSidebars() {
    // Reverse order restores adjacent siblings even when their anchors were also moved.
    for (const [node, origin] of [...sidebarHomes].reverse()) {
      const parent = origin.parent
      if (parent && node.parentNode !== parent) {
        try {
          parent.insertBefore(node, origin.next?.parentNode === parent ? origin.next : null)
        } catch {
          try { parent.append(node) } catch { /* stale route node */ }
        }
      }
      if (origin.addedHidden) node.classList.remove('lsb-native-left-hidden')
    }
    sidebarHomes.clear()
  }

  function syncScrollBridge(root = null) {
    const next = root instanceof window.Element ? root : null
    if (bridge?.root === next) return
    bridge?.dispose?.()
    bridge = null
    if (!next || typeof createScrollBridge !== 'function') return
    try {
      bridge = createScrollBridge({ windowRef: window, root: next })
    } catch { /* bridge unavailable: leave native window scrolling intact */ }
  }

  function release() {
    restoreSidebars()
    // An outlet removed by the site belongs to the old route; do not resurrect it.
    if (outlet?.isConnected && home) {
      const parent = home.parent?.isConnected ? home.parent : document.body
      try {
        parent.insertBefore(outlet, home.next?.parentNode === parent ? home.next : null)
      } catch {
        document.body.append(outlet)
      }
    }
    outlet = null
    home = null
    scroller = null
    syncScrollBridge()
  }

  function mount(next, host) {
    if (!(next instanceof window.Element) || !(host instanceof window.Element)) return
    if (outlet && outlet !== next) release()
    if (!home) home = { parent: next.parentNode, next: next.nextSibling }
    outlet = next
    detachSidebars(next)
    if (next.parentNode !== host) host.append(next)
    scroller = host
    syncScrollBridge(host)
  }

  return {
    findOutlet, mount, restoreSidebars, syncScrollBridge, release,
    get scroller() { return scroller },
    get bridge() { return bridge },
  }
}
