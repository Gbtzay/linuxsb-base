// ==UserScript==
// @name         LSB·断点续读
// @namespace    https://linux.sb/
// @version      1.0.6
// @description  记住每个帖子读到的楼层；再次进入时提示「继续阅读」，并把没读过的楼层标为 NEW。需要 LINUX.SB 基座。
// @author       you
// @match        https://linux.sb/*
// @grant        none
// @run-at       document-end
// @noframes
// ==/UserScript==

(function () {
  'use strict'

  const manifest = {
    id: 'resume-reading',
    name: '断点续读',
    version: '1.0.6',
    description: '记住每帖读到哪层，回来一键续读，未读楼层标 NEW',
    author: 'you',
    requires: { base: '^0.1.0' },
    permissions: ['read', 'storage', 'ui', 'events'],
    config: {
      minAsk: { type: 'number', label: '至少读到第几楼才提示续读', default: 3 },
      autoJump: { type: 'switch', label: '同一页时自动跳转（不再弹条）', default: false },
      keepDays: { type: 'number', label: '记录保留天数', default: 120 },
      cap: { type: 'number', label: '最多保存帖子数', default: 500 },
    },
  }

  function setup(api) {
    let cfg = api.config()
    api.on('config:changed:resume-reading', () => {
      cfg = api.config()
    })
    const tidOf = () => api.page.id
    const pageOf = () => api.page.page || 1

    /* ── 存储层：单键 + 容量/时效修剪 ── */
    function loadAll() {
      const all = api.store.get('positions', {})
      return all && typeof all === 'object' && !Array.isArray(all) ? all : {}
    }
    function prune(all) {
      const deadline = Date.now() - cfg.keepDays * 864e5
      let list = Object.entries(all).filter(([, r]) => r?.ts > deadline)
      list.sort((a, b) => b[1].ts - a[1].ts)
      list = list.slice(0, Math.max(50, cfg.cap))
      return Object.fromEntries(list)
    }
    function saveRec(rec, tidArg) {
      const t = tidArg || tidOf()
      if (!Number.isSafeInteger(Number(t)) || Number(t) <= 0) return null
      const all = loadAll()
      all[t] = { ...(all[t] || {}), ...rec, ts: rec.ts || Date.now() }
      api.store.set('positions', prune(all))
      api.emit('changed', { topicId: Number(t) })
      return all[t]
    }
    function load() {
      return loadAll()[tidOf()] || null
    }

    function records() {
      return Object.entries(prune(loadAll())).flatMap(([id, r]) => {
        const topicId = Number(id), floor = Number(r.f), page = Number(r.p || 1)
        if (!Number.isSafeInteger(topicId) || topicId <= 0 || !Number.isSafeInteger(floor) || floor < 0
          || !Number.isSafeInteger(page) || page < 1 || !Number.isFinite(Number(r.ts))) return []
        const href = api.routes.topic(topicId, page) + (floor > 0 ? `${page > 1 ? '&' : '?'}floor=${floor}` : '')
        return [{ topicId, title: typeof r.title === 'string' ? r.title : '', floor, page,
          updatedAt: Number(r.ts), source: 'resume-reading', href }]
      }).sort((a, b) => b.updatedAt - a.updatedAt || b.topicId - a.topicId)
    }
    api.handle('resume-reading:list', records)
    api.handle('resume-reading:get', ({ topicId } = {}) => records().find((r) => r.topicId === Number(topicId)) || null)

    function startTopic() {
      // A route may already expose the next snapshot when the old session flushes.
      const topicId = api.page.id, page = api.page.page || 1
      const title = api.snapshot?.topic?.title || ''
      const tidOf = () => topicId
      const pageOf = () => page
      const load = () => loadAll()[topicId] || null
      const disposers = []
      const own = (fn) => disposers.push(fn)
      let alive = true
      function throttle(fn, wait) {
        let timer = null, last = 0
        own(() => clearTimeout(timer))
        return () => {
          if (!alive) return
          const remaining = wait - (Date.now() - last)
          if (remaining <= 0) {
            clearTimeout(timer)
            timer = null
            last = Date.now()
            fn()
          } else if (!timer) timer = setTimeout(() => {
            timer = null
            last = Date.now()
            if (alive) fn()
          }, remaining)
        }
      }

      /* ── 阅读位置追踪 ── */
      let curFloor = 0
      let dirty = false
      const hideTimers = new Set()
      const hiding = new WeakSet()
      const NEW_HIDE_MS = 5000
      const flush = () => {
        if (!dirty) return
        dirty = false
        saveRec({ f: curFloor, p: pageOf(), title }, topicId)
      }
      const flushLater = throttle(flush, 1200)

      function lastVisibleFloor() {
        let max = 0
        for (const li of document.querySelectorAll('li.post-entry')) {
          const rect = li.getBoundingClientRect?.() || { top: 0, height: 0, width: 0 }
          if (!rect.height && !rect.width) continue
          if (rect.top <= window.innerHeight * 0.72) {
            const f = Number(li.getAttribute('data-floor') || 0)
            if (f > max) max = f
          } else {
            break // DOM 顺序≈视觉顺序，可提前结束；乱序也不会漏（max 取最大）
          }
        }
        return max
      }
      const onScroll = throttle(() => {
        const f = lastVisibleFloor()
        if (f > curFloor) {
          curFloor = f
          dirty = true
          flushLater()
        }
        if (valid && f > 0) scheduleHideUpTo(f)
      }, 600)

      const onVisibility = () => {
        if (document.hidden) flush()
      }

      /* ── 未读标记 ── */
      const saved = load()
      const valid = saved && saved.f >= (cfg.minAsk || 3)
      // Floor numbers span pages: reopening an earlier page must not erase a
      // later checkpoint merely because the first few replies are visible.
      curFloor = Number(saved?.f) || 0
      saveRec({ f: saved?.f || 0, p: saved?.p || page, title: title || saved?.title || '' }, topicId)

      api.ui.style(`
        .lsb-new{display:inline-block;margin-left:6px;font-size:10px;font-weight:700;color:#fff;
          background:var(--brand,#5eaaa0);border-radius:4px;padding:1px 5px;vertical-align:middle;line-height:1.3}
        li.post-entry.lsb-flash{background:var(--warning-soft,#fff3d6)!important;transition:background 1.4s ease}
        .lsb-resume-bar{position:fixed;left:50%;transform:translateX(-50%);bottom:64px;z-index:99997;
          display:flex;align-items:center;gap:10px;padding:8px 14px;border-radius:999px;
          background:var(--panel,#fff);border:1px solid var(--line,#ddd);color:var(--text,#222);
          font-size:13px;box-shadow:0 6px 20px var(--shadow-medium,rgba(0,0,0,.2))}
        .lsb-resume-bar .lsb-btn{white-space:nowrap}
      `)

      function newAnchor(li) {
        const uid = [...li.querySelectorAll('.post-user-group')].find(
          (g) => g.classList.contains('user-uid-badge') || /^UID\b/i.test((g.textContent || '').trim()),
        )
        if (uid) return uid
        return li.querySelector('a.post-title.post-author')
      }

      function setUnread(li, unread) {
        li.classList.toggle('lsb-unread', unread)
        let badge = li.querySelector('.lsb-new')
        if (!unread) {
          badge?.remove()
          return
        }
        if (!badge) {
          badge = document.createElement('span')
          badge.className = 'lsb-new'
          badge.textContent = 'NEW'
        }
        const anchor = newAnchor(li)
        if (anchor) {
          if (badge.previousElementSibling !== anchor) anchor.after(badge)
        } else if (!li.contains(badge)) {
          li.appendChild(badge)
        }
      }

      function scheduleHideUpTo(readFloor) {
        for (const li of document.querySelectorAll('li.post-entry.lsb-unread')) {
          const f = Number(li.getAttribute('data-floor') || 0)
          if (!(f > 0) || f > readFloor || hiding.has(li)) continue
          hiding.add(li)
          const t = setTimeout(() => {
            hideTimers.delete(t)
            setUnread(li, false)
          }, NEW_HIDE_MS)
          hideTimers.add(t)
        }
      }

      function markUnread(fromFloor) {
        let n = 0
        for (const li of document.querySelectorAll(api.sel.topicPosts)) {
          const f = Number(li.getAttribute('data-floor') || 0)
          const unread = f > fromFloor
          setUnread(li, unread)
          if (unread) n++
        }
        return n
      }
      // 之后 AJAX 新增的楼层也按已读线标记
      function markNode(li) {
        if (!valid) return
        const f = Number(li.getAttribute('data-floor') || 0)
        setUnread(li, f > saved.f)
      }
      let unreadCount = valid ? markUnread(saved.f) : 0
      window.addEventListener('scroll', onScroll, { passive: true })
      window.addEventListener('pagehide', flush)
      document.addEventListener('visibilitychange', onVisibility)
      own(() => {
        // 三个监听都要摘：旧实现只摘了 scroll，pagehide/visibilitychange 会在
        // 插件停用后继续写存储。
        window.removeEventListener('scroll', onScroll)
        window.removeEventListener('pagehide', flush)
        document.removeEventListener('visibilitychange', onVisibility)
        for (const t of hideTimers) clearTimeout(t)
        hideTimers.clear()
        flush()
        for (const li of document.querySelectorAll('li.post-entry.lsb-unread, li.post-entry.lsb-flash')) {
          setUnread(li, false)
          li.classList.remove('lsb-flash')
        }
      })
      onScroll()

      /* ── 续读提示条 ── */
      function floorEl(floor) {
        const n = Number(floor)
        if (!Number.isFinite(n) || n <= 0) {
          return (
            document.querySelector('li.post-entry:not([data-floor])')
            || document.querySelector(`${api.sel.postEntry}:first-child`)
            || document.querySelector(api.sel.postEntry)
          )
        }
        return document.querySelector(`${api.sel.postEntry}[data-floor="${n}"]`)
      }

      function jump(floor) {
        const el = floorEl(floor)
        if (!el) {
          api.ui.toast(`#${floor} 楼不在当前页`, { type: 'error' })
          return false
        }
        try {
          el.scrollIntoView({ block: 'center', behavior: 'smooth' })
        } catch {
          /* jsdom 无此方法 */
        }
        el.classList.add('lsb-flash')
        const timer = setTimeout(() => { hideTimers.delete(timer); el.classList.remove('lsb-flash') }, 1800)
        hideTimers.add(timer)
        return true
      }

      function dismissBar(bar) {
        bar?.remove()
      }

      if (valid) {
        const samePage = saved.p === pageOf()
        if (samePage && cfg.autoJump) {
          jump(saved.f)
        } else {
          const bar = document.createElement('div')
          bar.className = 'lsb-resume-bar'
          const info = document.createElement('span')
          info.textContent =
            `上次读到 #${saved.f}${unreadCount ? ` · 还有 ${unreadCount} 层没看` : ''}` +
            (samePage ? '' : ` · 在第 ${saved.p} 页`)
          const go = document.createElement('button')
          go.className = 'lsb-btn is-primary'
          go.textContent = samePage ? '接着看' : `去第 ${saved.p} 页`
          go.onclick = () => {
            if (samePage) jump(saved.f)
            else window.location.assign(api.routes.topic(tidOf(), saved.p))
            dismissBar(bar)
          }
          const no = document.createElement('button')
          no.className = 'lsb-btn'
          no.textContent = '忽略'
          no.onclick = () => dismissBar(bar)
          bar.append(info, go, no)
          document.body.appendChild(bar)
          const autoHide = setTimeout(() => dismissBar(bar), 15000) // 15 秒不打扰自动消失
          own(() => {
            clearTimeout(autoHide)
            dismissBar(bar)
          })
        }
      }

      return {
        load, jump, markNode, unreadCount,
        saveFloor: (f) => {
          if (!alive) return null
          curFloor = f
          return saveRec({ f, p: page, title }, topicId)
        },
        markCount: () => markUnread(curFloor || (saved ? saved.f : 0)),
        dispose() {
          alive = false
          for (const fn of disposers.splice(0)) fn()
        },
      }
    }

    let session = null, sessionKey = ''
    function syncTopic() {
      const key = api.page.type === 'topic' ? `${api.page.id}:${api.page.page || 1}` : ''
      if (key === sessionKey) return
      session?.dispose()
      session = null
      sessionKey = key
      if (key) session = startTopic()
    }
    syncTopic()
    api.on('route:changed', syncTopic)
    api.dom.each('li.post-entry', (li) => session?.markNode(li))
    api.onDispose(() => { session?.dispose(); session = null })

    /* ── 面板：最近阅读 ── */
    function timeAgo(ts) {
      const s = Math.max(1, (Date.now() - ts) / 1000)
      if (s < 3600) return `${Math.floor(s / 60)} 分钟前`
      if (s < 86400) return `${Math.floor(s / 3600)} 小时前`
      return `${Math.floor(s / 86400)} 天前`
    }

    api.ui.tab({
      name: '阅读历史',
      order: 60,
      render(host) {
        const all = loadAll()
        const rows = Object.entries(all).sort((a, b) => b[1].ts - a[1].ts).slice(0, 30)
        if (!rows.length) {
          host.innerHTML = '<div class="lsb-empty">还没有阅读记录。</div>'
          return
        }
        host.innerHTML = `
          <div class="lsb-row-desc" style="margin-bottom:8px">共 ${Object.keys(all).length} 帖有记录（上限 ${cfg.cap}）</div>
          ${rows
            .map(([id, r]) => `
            <div class="lsb-row">
              <div class="lsb-row-main">
                <a class="lsb-row-name" href="${api.routes.topic(Number(id), r.p || 1)}">${api.util.esc(r.title || '帖子 #' + id)}</a>
                <div class="lsb-row-desc">读到 #${r.f} · ${r.p > 1 ? `第 ${r.p} 页 · ` : ''}${timeAgo(r.ts)}</div>
              </div>
            </div>`)
            .join('')}`
        const clear = document.createElement('button')
        clear.className = 'lsb-btn'
        clear.textContent = '清空全部记录'
        clear.style.marginTop = '10px'
        clear.onclick = async () => {
          if (await api.ui.confirm('确定清空所有阅读记录？不可恢复。')) {
            api.store.set('positions', {})
            api.emit('changed', {})
            api.ui.toast('已清空', { type: 'success' })
            host.innerHTML = ''
            api.ui.showTab('resume-reading')
          }
        }
        host.appendChild(clear)
      },
    })

    /* ── 调试/测试接口 ── */
    api.handle('resume-reading:debug', () => ({
      load,
      saveRec,
      all: loadAll,
      saveFloor: (f) => session?.saveFloor(f),
      barVisible: () => !!document.querySelector('.lsb-resume-bar'),
      markCount: () => session?.markCount() || 0,
      unreadCount: session?.unreadCount || 0,
      jump: (floor) => session?.jump(floor) || false,
    }))

    return {}
  }

  const w = typeof unsafeWindow !== 'undefined' ? unsafeWindow : window
  if (w.LSB && w.LSB.register) w.LSB.register(manifest, setup)
  else ;(w.LSB_PLUGINS = w.LSB_PLUGINS || []).push({ manifest, setup })
})()
