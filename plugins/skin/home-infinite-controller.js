// Owns homepage infinite loading, per-list records and route-aware cleanup.
export function createSkinHomeInfiniteController({ window, document, getConfig, request, cacheKey, containsTopicPostContent, getScrollRoot }) {
  let homeInf = null
  const homeInfRecords = new WeakMap()

  function isHomeInfPath(urlLike = window.location.href) {
    try {
      const url = new window.URL(urlLike, window.location.href)
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
      routeKey = cacheKey(window.location.href)
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
    if (!(pagination instanceof window.Element)) return
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
    const url = new window.URL(window.location.href)
    url.searchParams.set('p', String(next))
    try {
      const res = await request(`${url.pathname}${url.search}`, {
        queue: false,
        timeout: 15000,
        retry: 0,
        ...(state.controller?.signal ? { signal: state.controller.signal } : {}),
      })
      if (!homeInfStateActive(state)) return
      if (!res.ok) throw new Error(`HTTP ${res.status}`)
      const doc = new window.DOMParser().parseFromString(res.text, 'text/html')
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
      document.dispatchEvent(new window.CustomEvent('sb:topic-list-updated', {
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
    const pageFromUrl = parseInt(new window.URL(window.location.href).searchParams.get('p'), 10) || 1
    const loaded = prior?.loaded || {}
    loaded[pageFromUrl] = true
    const page = Math.max(pageFromUrl, Number(prior?.page) || pageFromUrl)
    const scrollRoot = getScrollRoot()
    const scrollTargets = scrollRoot ? [scrollRoot, window] : [window]
    const onScroll = () => {
      if (!homeInfStateActive(homeInf) || homeInf.loading || !homeInf.hasMore) return
      if (homeInf.scrollTimer) return
      homeInf.scrollTimer = window.setTimeout(() => {
        if (homeInf) homeInf.scrollTimer = 0
        if (!homeInfStateActive(homeInf) || homeInf.list !== list) return
        const rect = list.getBoundingClientRect()
        const root = homeInf.scrollRoot instanceof window.Element ? homeInf.scrollRoot : null
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
      routeKey: cacheKey(window.location.href),
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
      controller: typeof window.AbortController === 'function' ? new window.AbortController() : null,
    }
    rememberHomeInfState(homeInf)
    if (!homeInf.hasMore) {
      setHomeInfStatus('end', '没有更多内容了')
      return
    }
    for (const target of scrollTargets) target.addEventListener?.('scroll', onScroll, { passive: true })
  }

  function syncHomeInfiniteScroll() {
    if (!getConfig().shell || !isHomeInfPath() || !homeInfEnabled()) {
      unbindHomeInfiniteScroll()
      return
    }
    const list = document.querySelector('.main-panel > ul.post-list')
    const pagination = document.querySelector('.pagination-bar')
    if (!list || !pagination || containsTopicPostContent(list)) {
      unbindHomeInfiniteScroll()
      return
    }
    const routeKey = cacheKey(window.location.href)
    const scrollRoot = getScrollRoot()
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
      && !(scrollRoot instanceof window.Element)
    ) return
    bindHomeInfiniteScroll(list, pagination)
  }

  return { sync: syncHomeInfiniteScroll, unbind: unbindHomeInfiniteScroll }
}
