// Owns SPA requests, browser events, cancellation, progress and route settlement.
export function createSkinSpaController({ window, document, getConfig, request, routeDocument, viewCacheController, historyController, hooks, perf, pendingClass }) {
  const history = window.history
  const { topicUrl: topicSpaUrl, accepts: isSpaUrl, cacheKey: viewCacheKey,
    matchesTopic: topicResponseMatches, commit: commitRoute, applyView } = routeDocument
  const { take: takeView, seed: seedHomeView, schedule: scheduleHomeStashRefresh,
    onVisible: onHomeStashVisible } = viewCacheController
  const { rememberScroll: rememberHistoryScroll, apply: applyHistory } = historyController
  const { findRouteOutlet, stashView, markNative, applyMarkers, fillShell, refreshRouteEnhancements, syncShellRoute, scrollToTopicTarget, refreshNativeRouteEnhancements, unbindHomeInfiniteScroll, syncHomeInfiniteScroll, cancelRefresh } = hooks
  const { span: perfSpan, spanAsync: perfSpanAsync, emit: perfEmit } = perf
  let spaRouteChromeSerial = 0
  let spaSerial = 0
  let spaFilledSerial = 0
  let spaAbortController = null
  let spaProgressTimer = 0
  let spaIgnorePop = false
  let spaBound = false
  let spaViewKey = ''

  function holdSpaRouteChrome(serial) {
    if (serial !== spaSerial) return false
    spaRouteChromeSerial = serial
    document.documentElement.classList.add(pendingClass)
    return true
  }

  function releaseSpaRouteChrome(serial) {
    if (serial !== spaSerial || spaRouteChromeSerial !== serial) return false
    spaRouteChromeSerial = 0
    document.documentElement.classList.remove(pendingClass)
    return true
  }

  function clearSpaRouteChromeHold() {
    spaRouteChromeSerial = 0
    document.documentElement.classList.remove(pendingClass)
  }

  function setRoutePhase(serial, phase) {
    if (serial !== spaSerial) return false
    const root = document.documentElement
    if (phase) root.dataset.lsbRoutePhase = phase
    else delete root.dataset.lsbRoutePhase
    return true
  }

  function settleSpaRoute(serial) {
    if (serial !== spaSerial) return false
    delete document.documentElement.dataset.lsbRoutePhase
    releaseSpaRouteChrome(serial)
    return true
  }

  function hasUnsavedEditor() {
    return [...document.querySelectorAll('textarea, [contenteditable="true"]')].some((el) => {
      if (el.closest('#lsb-shell, .lsb-panel')) return false
      const value = 'value' in el ? el.value : el.textContent
      return String(value || '').trim().length > 0
    })
  }

  function ensureProgress() {
    const shell = document.getElementById('lsb-shell')
    if (!shell) return null
    let el = document.getElementById('lsb-shell-progress')
    if (el) return el
    el = document.createElement('div')
    el.id = 'lsb-shell-progress'
    el.setAttribute('aria-hidden', 'true')
    el.innerHTML = '<span data-lsb-shell-progress-bar></span>'
    shell.append(el)
    return el
  }

  function ensureRouteAnnouncer() {
    const shell = document.getElementById('lsb-shell')
    if (!shell) return null
    let announcer = shell.querySelector('#lsb-route-announcer')
    if (announcer) return announcer
    announcer = document.createElement('span')
    announcer.id = 'lsb-route-announcer'
    announcer.setAttribute('role', 'status')
    announcer.setAttribute('aria-live', 'polite')
    shell.append(announcer)
    return announcer
  }

  function focusAndAnnounceRoute(source) {
    if (source === 'history') return
    const outlet = findRouteOutlet()
    if (!outlet) return
    outlet.setAttribute('tabindex', '-1')
    try {
      outlet.focus({ preventScroll: true })
    } catch {
      outlet.focus?.()
    }
    const announcer = ensureRouteAnnouncer()
    if (announcer) announcer.textContent = `已打开：${document.title}`
  }

  function startProgress(serial) {
    const el = ensureProgress()
    if (!el) return
    el.dataset.phase = 'idle'
    el.style.setProperty('--lsb-shell-progress', '.08')
    window.clearTimeout(spaProgressTimer)
    spaProgressTimer = window.setTimeout(() => {
      if (serial !== spaSerial) return
      el.dataset.phase = 'loading'
      el.style.setProperty('--lsb-shell-progress', '.72')
    }, 90)
  }

  function finishProgress(serial) {
    const el = document.getElementById('lsb-shell-progress')
    window.clearTimeout(spaProgressTimer)
    spaProgressTimer = 0
    if (!el) return
    if (serial !== spaSerial) return
    el.dataset.phase = 'done'
    el.style.setProperty('--lsb-shell-progress', '1')
    spaProgressTimer = window.setTimeout(() => {
      el.dataset.phase = 'idle'
      el.style.setProperty('--lsb-shell-progress', '0')
    }, 220)
  }

  function hideProgress(serial) {
    window.clearTimeout(spaProgressTimer)
    spaProgressTimer = 0
    if (serial !== spaSerial) return
    const el = document.getElementById('lsb-shell-progress')
    if (!el) return
    el.dataset.phase = 'idle'
    el.style.setProperty('--lsb-shell-progress', '0')
  }

  function notifyRoute() {
    spaIgnorePop = true
    try {
      const view = document.defaultView
      const Ev = view.PopStateEvent || view.Event
      view.dispatchEvent(new Ev('popstate'))
    } catch {
      try {
        window.dispatchEvent(new window.Event('popstate'))
      } catch {
        /* 基座还有 url 轮询兜底 */
      }
    } finally {
      spaIgnorePop = false
    }
  }

  function fallbackRoute(mode, targetUrl) {
    if (mode === 'none') window.location.reload()
    else if (mode === 'replace') window.location.replace(targetUrl)
    else window.location.assign(targetUrl)
  }

  async function navigateSpa(href, options = {}) {
    const settings = { historyMode: 'push', force: false, source: 'user', ...options }
    let target
    try {
      target = new URL(href, window.location.href)
    } catch {
      return false
    }
    if (!isSpaUrl(target.href)) return false
    if (!settings.force && hasUnsavedEditor() && !window.confirm('当前编辑内容尚未保存，确定离开吗？')) {
      return false
    }
    historyController.cancelRestore()
    const same = target.pathname === window.location.pathname && target.search === window.location.search
    if (same && !settings.force) {
      if (target.hash) {
        const id = decodeURIComponent(target.hash.slice(1))
        document.getElementById(id)?.scrollIntoView()
      }
      return true
    }

    if (settings.historyMode !== 'none') rememberHistoryScroll()
    const fromKey = spaViewKey
    unbindHomeInfiniteScroll()
    const destKey = viewCacheKey(target.href)
    const cached = takeView(destKey)
    const serial = ++spaSerial
    spaAbortController?.abort()
    const requestController = new window.AbortController()
    spaAbortController = requestController
    const tTotal = perf.enabled() ? perf.now() : 0
    const outlet = findRouteOutlet()
    holdSpaRouteChrome(serial)
    markNative(true)
    outlet?.setAttribute('aria-busy', 'true')
    setRoutePhase(serial, 'preparing')
    startProgress(serial)
    let committed = false
    try {
      if (cached) {
        setRoutePhase(serial, 'committing')
        stashView(fromKey)
        perfSpan('spa.commit', () => applyView(cached, findRouteOutlet() || outlet))
        committed = true
        applyHistory(target, settings.historyMode)
        spaViewKey = destKey
        scheduleHomeStashRefresh()
        perfSpan('spa.fillShell', () => {
          applyMarkers()
          fillShell()
        })
        spaFilledSerial = serial
        cancelRefresh()
        hideProgress(serial)
        historyController.restoreScroll(settings.historyMode)
        if (tTotal) perfEmit('spa.total', perf.now() - tTotal)
        afterPaint(() => {
          if (serial !== spaSerial) return
          setRoutePhase(serial, 'settling')
          try {
            perfSpan('spa.notify', () => {
              notifyRoute()
              if (!refreshRouteEnhancements(serial)) return
              syncShellRoute()
              scrollToTopicTarget(target.href)
              focusAndAnnounceRoute(settings.source)
            })
          } finally {
            settleSpaRoute(serial)
          }
          try {
            perf.emitGlobal('spa:view-restored', { href: destKey, live: !!cached.live })
          } catch {
            /* 实时流缺席不得打断壳 */
          }
        })
        return true
      }

      setRoutePhase(serial, 'fetching')
      const res = await perfSpanAsync('spa.fetch', () =>
        request(`${target.pathname}${target.search}`, {
          queue: false,
          timeout: 15000,
          retry: 0,
          signal: requestController.signal,
        }),
      )
      if (serial !== spaSerial) return false
      if (!res.ok) throw new Error(`HTTP ${res.status}`)
      const finalUrl = new URL(res.url || target.href, target.href)
      if (!finalUrl.hash && target.hash) finalUrl.hash = target.hash
      if (!isSpaUrl(finalUrl.href)) {
        hideProgress(serial)
        outlet?.removeAttribute('aria-busy')
        settleSpaRoute(serial)
        fallbackRoute(settings.historyMode, finalUrl.href)
        return false
      }
      const pageDoc = perfSpan('spa.parse', () => new window.DOMParser().parseFromString(res.text, 'text/html'))
      const remoteOutlet = findRouteOutlet(pageDoc)
      if (!remoteOutlet) throw new Error('no remote outlet')
      if (!topicResponseMatches(pageDoc, finalUrl)) throw new Error('invalid topic response')
      setRoutePhase(serial, 'committing')
      stashView(fromKey)
      perfSpan('spa.commit', () => {
        commitRoute(pageDoc, remoteOutlet, finalUrl, settings.historyMode)
      })
      committed = true
      spaViewKey = viewCacheKey(finalUrl.href)
      scheduleHomeStashRefresh()
      perfSpan('spa.fillShell', () => {
        applyMarkers()
        fillShell()
      })
      spaFilledSerial = serial
      cancelRefresh()
      finishProgress(serial)
      historyController.restoreScroll(settings.historyMode)
      if (tTotal) perfEmit('spa.total', perf.now() - tTotal)
      afterPaint(() => {
        if (serial !== spaSerial) return
        setRoutePhase(serial, 'settling')
        try {
          perfSpan('spa.notify', () => {
            notifyRoute()
            if (!refreshRouteEnhancements(serial)) return
            syncShellRoute()
            scrollToTopicTarget(finalUrl.href)
            focusAndAnnounceRoute(settings.source)
          })
        } finally {
          settleSpaRoute(serial)
        }
      })
      return true
    } catch (err) {
      if (serial !== spaSerial) return false
      hideProgress(serial)
      settleSpaRoute(serial)
      outlet?.removeAttribute('aria-busy')
      const aborted = requestController.signal.aborted || err?.name === 'AbortError'
      if (!committed && !aborted) fallbackRoute(settings.historyMode, target.href)
      return false
    } finally {
      if (spaAbortController === requestController) spaAbortController = null
    }
  }

  function onSpaClick(event) {
    if (event.defaultPrevented || event.button !== 0) return
    if (event.metaKey || event.ctrlKey || event.shiftKey || event.altKey) return
    const anchor = event.target?.closest?.('a[href]')
    if (
      !anchor
      || anchor.hasAttribute('download')
      || (anchor.target && anchor.target !== '_self')
      || /\bexternal\b/i.test(anchor.rel || '')
      || anchor.matches('[data-method], [data-confirm], [data-no-spa]')
    ) return
    const currentTopic = !!topicSpaUrl(window.location.href)
    const targetTopic = !!topicSpaUrl(anchor.href)
    if (anchor.closest('.pagination-bar, .pagination') && (!currentTopic || !targetTopic)) return
    if (!isSpaUrl(anchor.href)) return
    if (anchor.href === window.location.href) {
      if (cancelPendingSpaNavigation()) event.preventDefault()
      return
    }
    event.preventDefault()
    void navigateSpa(anchor.href)
  }

  function onSpaSubmit(event) {
    if (event.defaultPrevented || !getConfig().shell) return
    const form = event.target instanceof window.HTMLFormElement ? event.target : null
    if (!form || String(form.method || 'get').toLowerCase() !== 'get') return
    if (form.target && form.target !== '_self') return
    if (form.matches('[data-no-spa], [data-confirm], [data-method]')) return
    let target
    try {
      target = new URL(form.action || window.location.href, window.location.href)
      const data = event.submitter ? new window.FormData(form, event.submitter) : new window.FormData(form)
      target.search = new window.URLSearchParams(data).toString()
    } catch {
      return
    }
    if (!isSpaUrl(target.href)) return
    event.preventDefault()
    void navigateSpa(target.href)
  }

  function onSpaPop() {
    if (spaIgnorePop || !getConfig().shell) return
    if (!historyController.acceptPop(() =>
      !hasUnsavedEditor() || window.confirm('当前编辑内容尚未保存，确定离开吗？'))) return
    if (!isSpaUrl(window.location.href)) {
      // 软跳文档被后退到交易页/帖子等整页地址时，主栏还是列表，必须重开。
      // 交易页本身就是整页打开的，不能见 popstate 就 reload，否则会刷死。
      let paintedSpa = false
      try {
        paintedSpa = isSpaUrl(new URL(spaViewKey || '/', window.location.origin).href)
      } catch {
        paintedSpa = false
      }
      if (paintedSpa) window.location.reload()
      return
    }
    let targetHref = window.location.href
    try {
      const recorded = new URL(history.state?.lsbShellSpaUrl || '', window.location.href)
      if (recorded.origin === window.location.origin && recorded.href === window.location.href) targetHref = recorded.href
    } catch {
      /* 地址栏仍是该历史项的权威目标 */
    }
    void navigateSpa(targetHref, { historyMode: 'none', force: true, source: 'history' })
  }

  function clearSpaTransaction() {
    spaSerial += 1
    historyController.cancel()
    const controller = spaAbortController
    spaAbortController = null
    controller?.abort()
    window.clearTimeout(spaProgressTimer)
    spaProgressTimer = 0
    findRouteOutlet()?.removeAttribute('aria-busy')
    clearSpaRouteChromeHold()
    const root = document.documentElement
    delete root.dataset.lsbRoutePhase
    const progress = document.getElementById('lsb-shell-progress')
    if (progress) {
      progress.dataset.phase = 'idle'
      progress.style.setProperty('--lsb-shell-progress', '0')
    }
  }

  function cancelPendingSpaNavigation() {
    const root = document.documentElement
    const pending = !!spaAbortController
      || root.hasAttribute('data-lsb-route-phase')
      || root.classList.contains(pendingClass)
    if (!pending) return false
    clearSpaTransaction()
    try {
      spaViewKey = viewCacheKey(window.location.href)
    } catch {
      spaViewKey = ''
    }
    if (getConfig().shell) {
      applyMarkers()
      if (document.getElementById('lsb-shell')) fillShell()
      else syncHomeInfiniteScroll()
      refreshNativeRouteEnhancements()
    }
    return true
  }

  function onSpaPageShow(event) {
    if (event.persisted) clearSpaTransaction()
  }

  function bindSpa() {
    if (spaBound) return
    spaBound = true
    document.addEventListener('click', onSpaClick, true)
    document.addEventListener('submit', onSpaSubmit, true)
    window.addEventListener('popstate', onSpaPop)
    window.addEventListener('pageshow', onSpaPageShow)
    document.addEventListener('visibilitychange', onHomeStashVisible)
    historyController.bind()
    spaViewKey = viewCacheKey(window.location.href)
    seedHomeView()
    scheduleHomeStashRefresh()
  }

  function unbindSpa() {
    if (!spaBound) return
    spaBound = false
    clearSpaTransaction()
    historyController.dispose()
    document.removeEventListener('click', onSpaClick, true)
    document.removeEventListener('submit', onSpaSubmit, true)
    window.removeEventListener('popstate', onSpaPop)
    window.removeEventListener('pageshow', onSpaPageShow)
    document.removeEventListener('visibilitychange', onHomeStashVisible)
    viewCacheController.stop()
    document.getElementById('lsb-shell-progress')?.remove()
  }

  function afterPaint(fn) {
    // One rAF runs before paint; the second lets the committed outlet paint first.
    // Hidden and prerendered documents may pause rAF, so notify without waiting for an invisible frame.
    const requestFrame = window.requestAnimationFrame
    if (typeof requestFrame !== 'function' || document.visibilityState !== 'visible') {
      window.queueMicrotask(fn)
      return
    }
    requestFrame.call(window, () => requestFrame.call(window, fn))
  }

  return { navigate: navigateSpa, bind: bindSpa, unbind: unbindSpa,
    clear: clearSpaTransaction, cancelPending: cancelPendingSpaNavigation, clearChrome: clearSpaRouteChromeHold,
    resetView() { spaViewKey = '' },
    isCurrent: (serial) => serial === spaSerial,
    markFilled(serial) { spaFilledSerial = serial },
    get bound() { return spaBound }, get viewKey() { return spaViewKey },
    get filled() { return !!spaFilledSerial && spaFilledSerial === spaSerial } }
}
