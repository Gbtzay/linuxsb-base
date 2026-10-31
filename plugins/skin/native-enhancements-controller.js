// Owns native reply threads, verification widgets and their route lifecycle.
export function createSkinNativeEnhancementsController({ window, document, topicUrl, startOnline }) {
  let nativeThreadObserver = null
  let nativeThreadList = null
  let nativeThreadApplyTimer = 0
  let nativeThreadLifecycleBound = false
  const nativeReplyParentByForm = new WeakMap()
  let nativeCaptchaObserver = null
  let nativeCaptchaApplyTimer = 0
  let nativeCaptchaEpoch = 0
  const nativeCaptchaSolvers = new WeakMap()

  const NATIVE_THREAD_VISIBLE_LIMIT = 5

  function nativeThreadFloor(value) {
    const text = String(value || '')
    return /^[1-9]\d*$/.test(text) ? text : ''
  }

  function nativeThreadParentFromContent(row, replyRows) {
    for (const link of row.querySelectorAll('.post-content a[href]')) {
      try {
        const url = new window.URL(link.href, window.location.href)
        const floor = nativeThreadFloor(url.searchParams.get('floor'))
        if (floor) return floor
        const replyId = nativeThreadFloor(url.searchParams.get('replyid') || url.searchParams.get('reply_id'))
        const parentFloor = replyId ? nativeThreadFloor(replyRows.get(replyId)?.dataset.floor) : ''
        if (parentFloor) return parentFloor
      } catch {
        /* A malformed quote link cannot determine a parent. */
      }
    }
    return nativeThreadFloor(String(row.querySelector('.post-content')?.textContent || '').match(/@[^\s#]+\s+#([1-9]\d*)\b/u)?.[1])
  }

  function nativeThreadParentFromForm(form) {
    if (!(form instanceof window.HTMLFormElement)) return ''
    const explicit = form.dataset.quoteThreadsParentFloor
      || form.querySelector('[name="quote_threads_parent_floor"], [name="parent_floor"], [data-quote-threads-parent-floor]')?.value
    const explicitFloor = nativeThreadFloor(explicit)
    if (explicitFloor) return explicitFloor
    const body = form.querySelector('textarea[name="body"], textarea[name="content"], [contenteditable="true"]')
    const text = 'value' in (body || {}) ? body.value : body?.textContent
    return nativeThreadFloor(String(text || '').match(/@[^ #]+ +#([1-9][0-9]*)/u)?.[1])
  }

  function nativeThreadReplyId(row) {
    return String(row?.id || '').match(/^post-([1-9][0-9]*)$/)?.[1] || ''
  }

  function addNativeThreadReference(row, parentFloor) {
    const floor = nativeThreadFloor(parentFloor)
    if (!(row instanceof window.Element) || !floor) return
    const meta = row.querySelector('.post-meta')
    if (!(meta instanceof window.Element)) return
    let reference = meta.querySelector(':scope > .quote-threads-reference')
    if (!reference) {
      reference = document.createElement('span')
      reference.className = 'quote-threads-reference'
      meta.prepend(reference)
    }
    reference.textContent = `回复 #${floor}`
    reference.dataset.quoteThreadsParentFloor = floor
  }

  function normalizeNativeThreadLinks(rows, byFloor) {
    const currentTopic = topicUrl(window.location.href)
    if (!currentTopic) return
    const normalize = (link, ownReplyId = '') => {
      if (!(link instanceof window.HTMLAnchorElement)) return
      let url
      try {
        url = new window.URL(link.getAttribute('href') || link.href, window.location.href)
      } catch {
        return
      }
      if (url.origin !== currentTopic.origin || url.pathname !== currentTopic.pathname) return
      const floor = nativeThreadFloor(url.searchParams.get('floor'))
      const replyId = ownReplyId || (floor ? nativeThreadReplyId(byFloor.get(floor)) : '')
      if (!replyId) return
      url.searchParams.delete('floor')
      url.searchParams.delete('p')
      url.searchParams.delete('reply_id')
      url.searchParams.set('replyid', replyId)
      link.setAttribute('href', url.href)
    }
    for (const row of rows) {
      const ownReplyId = nativeThreadReplyId(row)
      for (const link of row.querySelectorAll('a[href]')) normalize(link, link.classList.contains('post-floor') ? ownReplyId : '')
    }
  }

  function handleNativeReplySubmit(event) {
    const form = event.target instanceof window.HTMLFormElement
      ? event.target
      : event.target?.closest?.('form.ajax-reply-form')
    if (!(form instanceof window.HTMLFormElement)) return
    const parentFloor = nativeThreadParentFromForm(form)
    if (parentFloor) nativeReplyParentByForm.set(form, parentFloor)
  }

  function handleNativeReplySaved(event) {
    const detail = event.detail && typeof event.detail === 'object' ? event.detail : {}
    const form = detail.form instanceof window.HTMLFormElement ? detail.form : null
    const replyCandidate = detail.reply || detail.post || detail.element || event.target
    const reply = replyCandidate instanceof window.Element
      ? (replyCandidate.matches('li.post-item.post-entry') ? replyCandidate : replyCandidate.closest('li.post-item.post-entry'))
      : null
    if (!reply) return
    const parentFloor = nativeThreadFloor(nativeReplyParentByForm.get(form))
      || nativeThreadFloor(reply.dataset.quoteThreadsParentFloor)
      || nativeThreadParentFromContent(reply, new Map())
    if (parentFloor) reply.dataset.quoteThreadsParentFloor = parentFloor
    const list = reply.closest('ul.post-list.topic-post-list') || nativeThreadList
    if (list) rebuildNativeThreadTree(list)
  }

  function bindNativeThreadLifecycle() {
    if (nativeThreadLifecycleBound) return
    nativeThreadLifecycleBound = true
    document.addEventListener('submit', handleNativeReplySubmit, true)
    document.addEventListener('bbs1:reply-saved', handleNativeReplySaved)
  }

  function unbindNativeThreadLifecycle() {
    if (!nativeThreadLifecycleBound) return
    nativeThreadLifecycleBound = false
    document.removeEventListener('submit', handleNativeReplySubmit, true)
    document.removeEventListener('bbs1:reply-saved', handleNativeReplySaved)
  }

  function renderNativeThreadCollapse(list, root, rootRow, branch) {
    if (!(rootRow instanceof window.Element) || branch.length <= NATIVE_THREAD_VISIBLE_LIMIT) return
    const containsTarget = branch.some((row) => (
      row.classList.contains('post-highlight')
      || (new window.URL(window.location.href).searchParams.get('replyid') && row.id === `post-${new window.URL(window.location.href).searchParams.get('replyid')}`)
      || (new window.URL(window.location.href).searchParams.get('floor') && row.dataset.floor === new window.URL(window.location.href).searchParams.get('floor'))
    ))
    if (containsTarget && rootRow.dataset.quoteThreadsTargetRevealed !== '1') {
      rootRow.dataset.quoteThreadsExpanded = '1'
      rootRow.dataset.quoteThreadsTargetRevealed = '1'
    }
    const expanded = rootRow.dataset.quoteThreadsExpanded === '1'
    branch.forEach((row, index) => {
      row.classList.toggle('quote-threads-is-collapsed', !expanded && index >= NATIVE_THREAD_VISIBLE_LIMIT)
    })
    if (!expanded) {
      branch[branch.length - 1].classList.remove('quote-threads-thread-end')
      branch[NATIVE_THREAD_VISIBLE_LIMIT - 1].classList.add('quote-threads-thread-end')
    }
    const toggleRow = document.createElement('li')
    toggleRow.className = 'quote-threads-toggle-row'
    const button = document.createElement('button')
    button.type = 'button'
    button.className = 'quote-threads-toggle'
    button.dataset.quoteThreadsToggle = root
    button.dataset.expanded = expanded ? '1' : '0'
    button.setAttribute('aria-expanded', expanded ? 'true' : 'false')
    button.textContent = expanded ? '收起讨论串' : `展开剩余 ${branch.length - NATIVE_THREAD_VISIBLE_LIMIT} 条回复`
    toggleRow.append(button)
    ;(expanded ? branch[branch.length - 1] : branch[NATIVE_THREAD_VISIBLE_LIMIT - 1]).after(toggleRow)
  }

  function rebuildNativeThreadTree(list) {
    if (!(list instanceof window.Element)) return
    list.querySelectorAll(':scope > .quote-threads-toggle-row').forEach((row) => row.remove())
    const rows = [...list.querySelectorAll(':scope > li.post-item.post-entry')]
    list.dataset.quoteThreadsCollapseReady = '1'
    if (rows.length < 2) return

    const byFloor = new Map()
    const replyRows = new Map()
    const parents = new Map()
    const roots = new Map()
    const branches = new Map()
    const branchRoots = []

    rows.forEach((row) => {
      row.dataset.quoteThreadsProcessed = '1'
      row.querySelectorAll('.quote-threads-reference').forEach((reference) => reference.remove())
      const floor = nativeThreadFloor(row.dataset.floor)
      if (floor) byFloor.set(floor, row)
      const replyId = String(row.id || '').match(/^post-([1-9][0-9]*)$/)?.[1] || ''
      if (replyId) replyRows.set(replyId, row)
      row.classList.remove(
        'quote-threads-child',
        'quote-threads-cross-page',
        'quote-threads-thread-item',
        'quote-threads-thread-end',
        'quote-threads-is-collapsed',
      )
    })

    rows.forEach((row) => {
      const floor = nativeThreadFloor(row.dataset.floor)
      let parentFloor = nativeThreadFloor(row.dataset.quoteThreadsParentFloor)
      if (!parentFloor) {
        parentFloor = nativeThreadParentFromContent(row, replyRows)
        if (parentFloor) row.dataset.quoteThreadsParentFloor = parentFloor
      }
      if (!floor || !parentFloor || parentFloor === floor) return
      addNativeThreadReference(row, parentFloor)
      if (byFloor.has(parentFloor)) parents.set(floor, parentFloor)
      else row.classList.add('quote-threads-cross-page')
    })
    normalizeNativeThreadLinks(rows, byFloor)

    const rootFloor = (floor) => {
      if (roots.has(floor)) return roots.get(floor)
      const trail = []
      const seen = new Set()
      let current = floor
      let root = floor
      while (true) {
        if (roots.has(current)) {
          root = roots.get(current)
          break
        }
        if (seen.has(current)) break
        seen.add(current)
        trail.push(current)
        const parentFloor = parents.get(current)
        if (!parentFloor) {
          root = current
          break
        }
        current = parentFloor
      }
      trail.forEach((value) => roots.set(value, root))
      return root
    }

    rows.forEach((row, index) => {
      const floor = nativeThreadFloor(row.dataset.floor)
      const root = floor ? rootFloor(floor) : `@${index}`
      if (!branches.has(root)) {
        branches.set(root, [])
        branchRoots.push(root)
      }
      branches.get(root).push(row)
    })

    const orderedRows = []
    const collapsibleBranches = []
    for (const root of branchRoots) {
      const rootRow = byFloor.get(root)
      const storedBranch = branches.get(root)
      const branch = rootRow && storedBranch.length > 1
        ? [rootRow, ...storedBranch.filter((row) => row !== rootRow)]
        : storedBranch
      if (rootRow && branch.length > 1) {
        branch.forEach((row) => {
          row.classList.add('quote-threads-thread-item')
          if (row !== rootRow) row.classList.add('quote-threads-child')
        })
        branch[branch.length - 1].classList.add('quote-threads-thread-end')
        collapsibleBranches.push([root, rootRow, branch])
      } else if (branch.length === 1 && branch[0].classList.contains('quote-threads-cross-page')) {
        branch[0].classList.add('quote-threads-thread-item', 'quote-threads-child', 'quote-threads-thread-end')
      }
      branch.forEach((row) => orderedRows.push(row))
    }

    if (!rows.every((row, index) => row === orderedRows[index])) {
      const fragment = document.createDocumentFragment()
      orderedRows.forEach((row) => fragment.append(row))
      list.append(fragment)
    }
    collapsibleBranches.forEach(([root, rootRow, branch]) => renderNativeThreadCollapse(list, root, rootRow, branch))
  }

  function clearNativeThreadObserver() {
    nativeThreadObserver?.disconnect?.()
    nativeThreadObserver = null
    nativeThreadList = null
    if (nativeThreadApplyTimer) {
      window.clearTimeout(nativeThreadApplyTimer)
      nativeThreadApplyTimer = 0
    }
  }

  function observeNativeThreadTree(list) {
    if (!(list instanceof window.Element)) {
      clearNativeThreadObserver()
      return
    }
    bindNativeThreadLifecycle()
    if (nativeThreadList === list && nativeThreadObserver) {
      rebuildNativeThreadTree(list)
      return
    }
    clearNativeThreadObserver()
    nativeThreadList = list
    if (list.dataset.lsbNativeThreadBound !== '1') {
      list.dataset.lsbNativeThreadBound = '1'
      list.addEventListener('click', (event) => {
        const button = event.target?.closest?.('[data-quote-threads-toggle]')
        if (!(button instanceof window.HTMLButtonElement)) return
        const root = nativeThreadFloor(button.dataset.quoteThreadsToggle)
        const rootRow = [...list.querySelectorAll(':scope > li.post-item.post-entry')]
          .find((row) => nativeThreadFloor(row.dataset.floor) === root)
        if (!rootRow) return
        rootRow.dataset.quoteThreadsExpanded = button.dataset.expanded === '1' ? '0' : '1'
        rebuildNativeThreadTree(list)
      })
    }
    rebuildNativeThreadTree(list)
    if (typeof window.MutationObserver !== 'function') return
    nativeThreadObserver = new window.MutationObserver((records) => {
      const hasNewReply = records.some((record) => [...record.addedNodes].some((node) => (
        node instanceof window.Element
        && (node.matches('li.post-item.post-entry') || !!node.querySelector('li.post-item.post-entry'))
        && [...(node.matches('li.post-item.post-entry') ? [node] : node.querySelectorAll('li.post-item.post-entry'))]
          .some((reply) => reply.dataset.quoteThreadsProcessed !== '1')
      )))
      if (hasNewReply && !nativeThreadApplyTimer) {
        nativeThreadApplyTimer = window.setTimeout(() => {
          nativeThreadApplyTimer = 0
          if (nativeThreadList === list && list.isConnected) rebuildNativeThreadTree(list)
        }, 0)
      }
    })
    nativeThreadObserver.observe(list, { childList: true, subtree: true })
  }

  function nativeCapVerificationSetStatus(root, message, error = false) {
    const status = root?.querySelector?.('[data-cap-verification-status]')
    if (!(status instanceof window.HTMLElement)) return
    status.textContent = message
    if (error) status.setAttribute('data-cap-error', '1')
    else status.removeAttribute('data-cap-error')
  }

  function nativeCapVerificationLoad(root) {
    const scriptUrl = root?.getAttribute?.('data-cap-widget-script') || ''
    const wasmUrl = root?.getAttribute?.('data-cap-wasm-url') || ''
    if (wasmUrl) window.CAP_CUSTOM_WASM_URL = wasmUrl
    if (window.__capVerificationWidgetPromise) return Promise.resolve(window.__capVerificationWidgetPromise)
    if (window.customElements?.get?.('cap-widget')) return Promise.resolve()
    if (!scriptUrl) return Promise.resolve()
    try {
      const promise = import(scriptUrl)
      window.__capVerificationWidgetPromise = promise
      promise.catch((error) => { window.__capVerificationWidgetError = error })
      return promise
    } catch (error) {
      return Promise.reject(error)
    }
  }

  function prepareNativeCapVerification(root = document) {
    const widgets = []
    if (root?.matches?.('[data-cap-verification]')) widgets.push(root)
    root?.querySelectorAll?.('[data-cap-verification]')?.forEach((widget) => widgets.push(widget))
    for (const widget of widgets) {
      if (widget.dataset.capVerificationBound !== '1') {
        widget.dataset.capVerificationBound = '1'
        const capWidget = widget.querySelector('cap-widget')
        capWidget?.addEventListener?.('solve', () => {
          nativeCapVerificationSetStatus(widget, '人机验证已完成，可以提交。')
        })
        capWidget?.addEventListener?.('error', () => {
          nativeCapVerificationSetStatus(widget, '人机验证失败，请重新验证。', true)
        })
      }
      nativeCapVerificationLoad(widget).then(() => {
        if (!widget.isConnected) return
        const form = widget.closest('form')
        const token = form?.querySelector('input[name="cap_token"]')
        if (!token || !String(token.value || '').trim()) {
          nativeCapVerificationSetStatus(widget, '人机验证已加载，请完成验证。')
        }
      }).catch(() => {
        nativeCapVerificationSetStatus(widget, '人机验证加载失败，请刷新页面后重试。', true)
      })
    }
  }

  function nativeCaptchaHex(buffer) {
    return [...new Uint8Array(buffer)].map((value) => value.toString(16).padStart(2, '0')).join('')
  }

  async function solveNativeCaptcha(widget) {
    if (!(widget instanceof window.Element) || !widget.isConnected) return false
    const epoch = nativeCaptchaEpoch
    const powInput = widget.querySelector('input[name="native_captcha_pow"]')
    if (!powInput || powInput.value) return true
    const status = widget.querySelector('[data-native-captcha-status]')
    if (widget.dataset.powRequired === '0') {
      if (status) status.textContent = '微信浏览器已免除浏览器校验'
      return true
    }
    const generation = widget.dataset.powGeneration || ''
    const prefix = widget.dataset.powPrefix || ''
    const zeroes = Math.max(2, Math.min(5, Number(widget.dataset.powZeroes || 3)))
    const cryptoApi = window.crypto
    const TextEncoderCtor = window.TextEncoder || globalThis.TextEncoder
    if (!cryptoApi?.subtle || typeof TextEncoderCtor !== 'function') {
      if (status) status.textContent = '当前浏览器不支持浏览器校验，请换用新版浏览器'
      return false
    }
    const target = '0'.repeat(zeroes)
    const encoder = new TextEncoderCtor()
    if (status) status.textContent = '校验准备中…'
    for (let i = 0; i < 2000000; i += 1) {
      const nonce = i.toString(16)
      const digest = nativeCaptchaHex(await cryptoApi.subtle.digest('SHA-256', encoder.encode(`${prefix}:${nonce}`)))
      if (epoch !== nativeCaptchaEpoch || !widget.isConnected) return false
      if (digest.slice(0, zeroes) === target) {
        if ((widget.dataset.powGeneration || '') !== generation) return false
        powInput.value = nonce
        if (status) status.textContent = '校验已就绪'
        return true
      }
      if (i > 0 && i % 250 === 0) await new Promise((resolve) => window.setTimeout(resolve, 0))
    }
    if (status) status.textContent = '浏览器校验准备超时，请刷新页面后重试'
    return false
  }

  function prepareNativeCaptcha(root = document) {
    const widgets = []
    if (root?.matches?.('[data-native-captcha]')) widgets.push(root)
    root?.querySelectorAll?.('[data-native-captcha]')?.forEach((widget) => widgets.push(widget))
    for (const widget of widgets) {
      if (nativeCaptchaSolvers.has(widget)) continue
      const task = solveNativeCaptcha(widget)
      nativeCaptchaSolvers.set(widget, task)
      task.then(
        () => {
          if (nativeCaptchaSolvers.get(widget) === task) nativeCaptchaSolvers.delete(widget)
        },
        () => {
          if (nativeCaptchaSolvers.get(widget) === task) nativeCaptchaSolvers.delete(widget)
        },
      )
    }
  }

  function clearNativeCaptchaObserver() {
    nativeCaptchaEpoch += 1
    nativeCaptchaObserver?.disconnect?.()
    nativeCaptchaObserver = null
    if (nativeCaptchaApplyTimer) {
      window.clearTimeout(nativeCaptchaApplyTimer)
      nativeCaptchaApplyTimer = 0
    }
  }

  function bindNativeCaptchaObserver() {
    if (nativeCaptchaObserver || typeof window.MutationObserver !== 'function' || !document.body) return
    nativeCaptchaObserver = new window.MutationObserver((records) => {
      const roots = []
      for (const record of records) {
        for (const node of record.addedNodes) {
          if (!(node instanceof window.Element)) continue
          const hasNativeCaptcha = node.matches('[data-native-captcha]') || !!node.querySelector('[data-native-captcha]')
          const hasCapVerification = node.matches('[data-cap-verification]') || !!node.querySelector('[data-cap-verification]')
          if (hasNativeCaptcha || hasCapVerification) roots.push(node)
        }
      }
      if (!roots.length || nativeCaptchaApplyTimer) return
      nativeCaptchaApplyTimer = window.setTimeout(() => {
        nativeCaptchaApplyTimer = 0
        roots.forEach((root) => {
          prepareNativeCaptcha(root)
          prepareNativeCapVerification(root)
        })
      }, 0)
    })
    nativeCaptchaObserver.observe(document.body, { childList: true, subtree: true })
  }

  function refreshNativeRouteEnhancements() {
    observeNativeThreadTree(document.querySelector('ul.post-list.topic-post-list'))
    prepareNativeCaptcha(document)
    prepareNativeCapVerification(document)
    bindNativeCaptchaObserver()
    startOnline()
  }

  return {
    refresh: refreshNativeRouteEnhancements,
    clear() {
      clearNativeThreadObserver()
      unbindNativeThreadLifecycle()
      clearNativeCaptchaObserver()
    },
  }
}
