// Shared online roster and avatar lifecycle for both shell modes.
export function createSkinOnlineController({ window, document, request, isEnabled, isChallengeDocument }) {
  const { Element, MutationObserver, DOMParser } = window
  const REFRESH_MS = 30000
  let running = false
  let avatarObserver = null
  let avatarTimer = 0
  let refreshTimer = 0
  let inflight = null
  let visibilityPending = null
  let refreshAfterInflight = false
  let generation = 0
  let revision = 0
  let lastSyncAt = null

  function enabled() {
    return !!isEnabled() && !isChallengeDocument(document)
  }

  function onlineUserIdFromHref(href) {
    const value = String(href || '')
    const pretty = value.match(/\/user\/(\d+)(?:[/?#]|$)/)
    if (pretty) return pretty[1]
    if (!/[?&]a=user(?:&|$)/.test(value)) return ''
    return value.match(/[?&]id=(\d+)(?:&|$)/)?.[1] || ''
  }

  function onlineUsersBoot(root = document) {
    return root?.querySelector?.('[data-online-users-ids]') || null
  }

  function syncDots() {
    if (!enabled()) return false
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

  function syncBoot(sourceDoc) {
    if (!enabled() || isChallengeDocument(sourceDoc)) return false
    const source = onlineUsersBoot(sourceDoc)
    if (!(source instanceof Element)) return false
    let target = onlineUsersBoot()
    if (!(target instanceof Element)) {
      if (!document.body) return false
      target = document.createElement('span')
      target.className = 'online-users-boot'
      target.hidden = true
      document.body.append(target)
    }
    target.dataset.onlineUsersIds = source.dataset.onlineUsersIds || ''
    target.dataset.onlineUsersLabel = source.dataset.onlineUsersLabel || '在线'
    revision += 1
    lastSyncAt = window.Date.now()
    return syncDots()
  }

  function stop() {
    running = false
    generation += 1
    if (refreshTimer) window.clearTimeout(refreshTimer)
    if (avatarTimer) window.clearTimeout(avatarTimer)
    refreshTimer = 0
    avatarTimer = 0
    visibilityPending = null
    refreshAfterInflight = false
    avatarObserver?.disconnect()
    avatarObserver = null
    document.removeEventListener('visibilitychange', onVisibilityChange)
    // Retain the unfinished request for deduplication across stop/start.
    // Its generation prevents committing into the next lifecycle.
  }

  function cooldownRemaining() {
    if (lastSyncAt === null) return 0
    const elapsed = Math.max(0, window.Date.now() - lastSyncAt)
    return Math.max(0, REFRESH_MS - elapsed)
  }

  function scheduleRefresh(delay = REFRESH_MS, force = false, bypassCooldown = false) {
    if (!running) return
    if (!enabled()) {
      stop()
      return
    }
    if (refreshTimer) {
      if (!force) return
      window.clearTimeout(refreshTimer)
      refreshTimer = 0
    }
    if (inflight) {
      if (bypassCooldown) refreshAfterInflight = true
      return
    }
    const notBefore = bypassCooldown ? 0 : cooldownRemaining()
    const wait = Math.max(0, Number(delay) || 0, notBefore)
    refreshTimer = window.setTimeout(() => {
      refreshTimer = 0
      void refresh(bypassCooldown)
    }, wait)
  }

  function refresh(bypassCooldown = false) {
    if (!running) return
    if (!enabled()) {
      stop()
      return
    }
    if (document.visibilityState === 'hidden') {
      visibilityPending = { bypassCooldown: bypassCooldown || !!visibilityPending?.bypassCooldown }
      return
    }
    visibilityPending = null
    if (inflight) return inflight
    // A route may have supplied a fresh roster after this timer was queued.
    if (!bypassCooldown && cooldownRemaining() > 0) {
      scheduleRefresh(0, true)
      return
    }
    const requestGeneration = generation
    const requestRevision = revision
    // Defer the request so synchronous adapter failures also settle after
    // the shared task reference has been assigned.
    const task = Promise.resolve().then(async () => {
      if (requestGeneration !== generation || !running || !enabled()) return
      const url = new window.URL('/', window.location.href)
      const res = await request(`${url.pathname}${url.search}`, {
        queue: false,
        timeout: 15000,
        retry: 0,
        headers: { 'cache-control': 'no-cache' },
      })
      if (requestGeneration !== generation || requestRevision !== revision || !running || !enabled() || !res.ok) return
      syncBoot(new DOMParser().parseFromString(res.text || '', 'text/html'))
    }).catch(() => {
      /* 在线清单刷新失败时保留上一份清单，下一周期继续尝试。 */
    }).finally(() => {
      if (inflight === task) inflight = null
      const rerun = refreshAfterInflight
      refreshAfterInflight = false
      // Scheduling belongs to the current lifecycle, even when the settled
      // response was invalidated by an earlier stop or route commit.
      if (running) scheduleRefresh(rerun ? 0 : REFRESH_MS, rerun, rerun)
    })
    inflight = task
    return task
  }

  function onVisibilityChange() {
    if (!running || document.visibilityState !== 'visible' || !visibilityPending) return
    const { bypassCooldown } = visibilityPending
    visibilityPending = null
    void refresh(bypassCooldown)
  }

  function scheduleDots() {
    if (!running) return
    if (!enabled()) {
      stop()
      return
    }
    if (avatarTimer) return
    avatarTimer = window.setTimeout(() => {
      avatarTimer = 0
      if (running) syncDots()
    }, 50)
  }

  function start() {
    if (!enabled()) {
      stop()
      return
    }
    running = true
    syncDots()
    document.addEventListener('visibilitychange', onVisibilityChange)
    if (!avatarObserver && document.body instanceof Element) {
      avatarObserver = new MutationObserver((records) => {
        const hasAvatar = records.some((record) => [...record.addedNodes].some((node) => (
          node instanceof Element && (node.matches('img.avatar-img') || !!node.querySelector('img.avatar-img'))
        )))
        if (hasAvatar) scheduleDots()
      })
      avatarObserver.observe(document.body, { childList: true, subtree: true })
    }
    scheduleRefresh()
  }

  return { syncDots, syncBoot, start, scheduleRefresh, stop }
}
