// Validates and commits SPA documents; event and request ownership stays with the caller.
export function createSkinSpaDocumentController({ window, document, getConfig, findRouteOutlet, nativeLeftRails, lifecycle, applyHistory }) {
  const { canvasStopSidebarWatch, canvasRestoreSiteSidebar, canvasRestoreProfile, restoreDetachedNativeSidebars, canvasStagePersistentSiteCardOrigins, canvasRebindPersistentSiteCardOrigins, markNative, syncOnlineBoot } = lifecycle
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
    if (!getConfig().shell || getConfig().topicSpa !== true) return null
    let url
    try {
      url = new URL(urlLike, window.location.href)
    } catch {
      return null
    }
    if (url.origin !== window.location.origin) return null
    const path = url.pathname.replace(/\/{2,}/g, '/') || '/'
    const match = path.match(/^\/topic\/([1-9]\d*)\/?$/)
    if (!match || !Number.isSafeInteger(Number(match[1]))) return null
    return url
  }

  function isSpaUrl(urlLike) {
    if (!getConfig().shell) return false
    let url
    try {
      url = new URL(urlLike, window.location.href)
    } catch {
      return false
    }
    if (url.origin !== window.location.origin) return false
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
    const u = new URL(href, window.location.href)
    let path = u.pathname.replace(/\/{2,}/g, '/') || '/'
    if (path === '/index.php') path = '/'
    return path + u.search
  }

  function snapshotOutletAttrs(el) {
    if (!(el instanceof window.Element)) return []
    return [...el.attributes].map((a) => [a.name, a.value])
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
    const pageDoc = new window.DOMParser().parseFromString(html, 'text/html')
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
    syncOnlineBoot(pageDoc)
    canvasRebindPersistentSiteCardOrigins(outlet)
    outlet.setAttribute('tabindex', '-1')
    markRouteContentEnter(outlet)
    outlet.removeAttribute('aria-busy')
    markNative(true)
  }

  return { topicUrl: topicSpaUrl, accepts: isSpaUrl, cacheKey: viewCacheKey,
    containsTopicPostContent, snapshotOutletAttrs, captureHead: captureRouteHead,
    parse: parseOutletFrag, matchesTopic: topicResponseMatches, commit: commitRoute, applyView }
}
