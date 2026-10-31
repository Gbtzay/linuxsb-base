// Owns topbar links, native appearance controls, and their original DOM positions.
export function createSkinTopbarController({ window, document, store, isEnabled, getWidthClass, getTopStatus }) {
  const { Element, HTMLAnchorElement, MutationObserver, URL, location } = window
  const canvasStatusLinkHomes = new Map()
  const extrasHomes = new Map()
  let themeToggleHome = null
  let colorSchemeHome = null
  let colorSchemeModalHome = null
  let extrasObs = null

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
    for (const item of store.get('topExtras') || []) add(null, item)
    return out
  }

  function restoreCanvasTopLinks() {
    for (const [node, home] of canvasStatusLinkHomes) restoreNode(node, home, 'lsb-canvas-status-link')
    canvasStatusLinkHomes.clear()
  }

  function renderCanvasTopLinks() {
    const host = getTopStatus()?.querySelector('[data-canvas-status-links]')
    const pinnedLinks = getTopStatus()?.querySelector('[data-canvas-pinned-links]')
    if (!(host instanceof Element) || !(pinnedLinks instanceof Element)) return
    restoreCanvasTopLinks()
    host.replaceChildren()
    pinnedLinks.replaceChildren()
    const items = collectCanvasTopLinks()
    const visibleItems = getWidthClass() === 'narrow' ? items.slice(0, 4) : items
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
    if (links.length) store.set('topExtras', links)
  }

  function hydrateTopExtras(host, have) {
    if (!(host instanceof Element)) return
    const known = have || new Set([...host.querySelectorAll('a[href]')].map((a) => a.href))
    for (const item of store.get('topExtras') || []) {
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

  function watchTopExtras() {
    if (extrasObs) return
    const top = document.querySelector('body > .top')
    if (!top) return
    extrasObs = new MutationObserver(() => {
      const host = document.querySelector('[data-lsb-shell-extras]')
      if (!host || !isEnabled()) return
      adoptTopExtras(host)
    })
    extrasObs.observe(top, { childList: true, subtree: true })
  }

  function stopExtrasWatch() {
    extrasObs?.disconnect()
    extrasObs = null
  }

  return {
    renderCanvasTopLinks, restoreCanvasTopLinks, adoptTopExtras, restoreTopExtras,
    adoptThemeToggle, restoreThemeToggle, watchTopExtras, stopExtrasWatch,
  }
}
