// Owns bounded live view fragments and background homepage refreshes.
export function createSkinViewCache({ window, document, request, getContext, parse, isTopic, cacheKey }) {
  const VIEW_CACHE_MAX = 5
  const HOME_STASH_REFRESH_MS = 30000
  const viewCache = new Map()
  let homeStashTimer = 0
  let homeStashInflight = null
  let homeSeedInflight = null
  let homeStashGen = 0
  let homeStashPending = false

  function rememberView(key, entry) {
    if (viewCache.has(key)) viewCache.delete(key)
    viewCache.set(key, entry)
    while (viewCache.size > VIEW_CACHE_MAX) {
      const oldest = viewCache.keys().next().value
      viewCache.delete(oldest)
    }
  }

  function takeView(key) {
    if (isTopic(key)) return null
    const entry = viewCache.get(key)
    if (!entry) return null
    viewCache.delete(key)
    return entry
  }

  function wantsHomeStashRefresh() {
    return getContext().enabled && getContext().viewKey !== '/' && viewCache.has('/')
  }

  function stopHomeStashRefresh() {
    if (homeStashTimer) {
      window.clearTimeout(homeStashTimer)
      homeStashTimer = 0
    }
    homeStashPending = false
    homeStashGen += 1
    const operation = homeStashInflight
    homeStashInflight = null
    operation?.controller.abort()
  }

  function scheduleHomeStashRefresh() {
    if (!wantsHomeStashRefresh()) {
      stopHomeStashRefresh()
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
    if (homeStashInflight) return homeStashInflight.promise
    const gen = homeStashGen
    const operation = { controller: new window.AbortController(), promise: null }
    homeStashInflight = operation
    operation.promise = (async () => {
      try {
        const res = await request('/', { queue: false, timeout: 15000, retry: 0, signal: operation.controller.signal })
        if (gen !== homeStashGen || homeStashInflight !== operation) return
        if (!res.ok || !wantsHomeStashRefresh()) return
        const parsed = parse(res.text)
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
        if (homeStashInflight === operation) {
          homeStashInflight = null
          if (gen === homeStashGen) scheduleHomeStashRefresh()
        }
      }
    })()
    return operation.promise
  }

  function onHomeStashVisible() {
    if (document.visibilityState !== 'visible' || !homeStashPending) return
    homeStashPending = false
    void refreshStashedHome()
  }

  function seedHomeView() {
    const here = cacheKey(getContext().href)
    if (!getContext().enabled || here === '/' || viewCache.has('/')) return
    if (homeSeedInflight) return homeSeedInflight.promise
    const operation = { controller: new window.AbortController(), promise: null }
    homeSeedInflight = operation
    const current = () => homeSeedInflight === operation && getContext().enabled
      && !viewCache.has('/') && getContext().viewKey !== '/'
    operation.promise = (async () => {
      try {
        const res = await request('/', { queue: false, timeout: 15000, retry: 0, signal: operation.controller.signal })
        if (!res.ok || !current()) return
        const parsed = parse(res.text)
        if (!parsed || !current()) return
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
      } finally {
        if (homeSeedInflight === operation) homeSeedInflight = null
      }
    })()
    return operation.promise
  }

  function stop() {
    stopHomeStashRefresh()
    const operation = homeSeedInflight
    homeSeedInflight = null
    operation?.controller.abort()
  }

  return { remember: rememberView, take: takeView, seed: seedHomeView,
    schedule: scheduleHomeStashRefresh, onVisible: onHomeStashVisible, stop,
    clear: () => viewCache.clear() }
}
