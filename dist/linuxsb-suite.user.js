// ==UserScript==
// @name         LINUX.SB 氧
// @name:en      LINUX.SB Oxygen
// @namespace    https://linux.sb/
// @version      2.0.64
// @description  linux.sb 正式功能套件：氢壳、实时流、未读哨兵、签到日历等 21 个非 AI 模块。
// @description:en  Public feature pack for linux.sb with 21 non-AI modules. Requires LINUX.SB Hydrogen.
// @author       xB70sR71
// @license      MIT
// @match        https://linux.sb/*
// @match        https://www.linux.sb/*
// @grant        none
// @run-at       document-end
// @noframes
// ==/UserScript==
//
// ── 包含模块 ──
// · LSB·楼层统计（示例插件：服务提供方） v1.0.1
// · LSB·高频发言标记（示例插件：服务消费方） v1.0.1
// · LSB·断点续读 v1.0.6
// · LSB·阅读中心 v1.0.0
// · LSB·已读置灰 v1.0.5
// · LSB·红包发卡 v1.0.0
// · LSB·首页回位 v1.0.1
// · LSB·主楼预览 v1.1.3
// · LSB·未读哨兵 v1.0.17
// · LSB·机会监控 v1.0.2
// · LSB·签到日历 v1.0.4
// · LSB·积分趋势 v1.0.2
// · LSB·称号行情 v1.0.19
// · LSB·UR 合成规划 v0.1.3
// · LSB·积分-称号工作台 v0.1.0
// · LSB·配置迁移 v1.0.0
// · LSB·个人存档 v1.0.0
// · LSB·年度报告 v1.0.1
// · LSB·界面精修 v2.0.59
// · LSB·实时流 v1.2.21
// · LSB·性能探针 v1.0.0
//

;
/* ══════════════ LSB·楼层统计（示例插件：服务提供方） v1.0.1 (floor-stats) ══════════════ */
/**
 * 示例要点：
 *  1. 标准引导写法 —— 基座未就绪就排队，加载顺序无关
 *  2. manifest 声明权限 / 页面 / 配置项
 *  3. api.handle 对其它脚本暴露 RPC 能力
 *  4. api.dom.each 幂等处理现有 + 未来新增的楼层
 *  5. api.ui.tab 注册基座设置面板里的分页
 */
(function () {
  'use strict'

  const manifest = {
    id: 'floor-stats',
    name: '楼层统计',
    version: '1.0.1',
    description: '统计当前帖各作者楼层数，提供 RPC 与「只看TA」按钮',
    author: 'you',
    requires: { base: '^0.1.0' },
    permissions: ['read', 'storage', 'ui', 'events'],
    pages: ['topic'],
    config: {
      topN: { type: 'number', label: '面板显示前 N 名', default: 10 },
      showButton: { type: 'switch', label: '楼层显示「只看TA」按钮', default: true },
    },
  }

  function setup(api) {
    let cfg = api.config()
    api.on('config:changed:floor-stats', () => {
      cfg = api.config()
    })
    let counts = new Map() // uid → { name, n }

    /** 从快照与增量事件重建统计 */
    function absorb(posts) {
      for (const p of posts || []) {
        if (!p.authorId) continue
        const cur = counts.get(p.authorId) || { uid: p.authorId, name: p.authorName, n: 0 }
        cur.name = p.authorName || cur.name
        cur.n++
        counts.set(p.authorId, cur)
      }
    }
    absorb(api.snapshot?.topic?.posts)

    // 新楼层（AJAX 回复）到达时增量更新
    api.on('topic:posts-added', (posts) => absorb(posts))

    /* ── 给其它脚本的 RPC：await api.request('floorstats:summary') ── */
    api.handle('floorstats:summary', () => ({
      topicId: api.page.id,
      total: [...counts.values()].reduce((s, x) => s + x.n, 0),
      authors: [...counts.values()].sort((a, b) => b.n - a.n),
      generatedAt: Date.now(),
    }))

    /* ── 楼层按钮：只看TA / 取消 ── */
    let focusUid = null
    api.ui.style(`
      li.post-entry.lsb-dim{display:none}
      .lsb-only-btn.is-on{color:var(--brand,#5eaaa0);font-weight:600}
    `)

    function applyFocus() {
      for (const li of document.querySelectorAll(api.sel.topicPosts)) {
        const a = li.querySelector('a[href^="/user/"]')
        const uid = a ? Number((a.getAttribute('href').match(/\/user\/(\d+)/) || [])[1]) : null
        li.classList.toggle('lsb-dim', focusUid != null && uid !== focusUid)
      }
    }

    function wire(li) {
      if (!cfg.showButton) return
      const a = li.querySelector('a[href^="/user/"]')
      if (!a) return
      const uid = Number((a.getAttribute('href').match(/\/user\/(\d+)/) || [])[1])
      const btn = api.ui.postAction(li, {
        label: '只看TA',
        title: `${api.util.text(a)} 的其余楼层将被隐藏`,
        onClick: () => {
          focusUid = focusUid === uid ? null : uid
          btn.textContent = focusUid === uid ? '显示全部' : '只看TA'
          btn.classList.toggle('is-on', focusUid === uid)
          // 同步其它楼层按钮的文案
          document.querySelectorAll('.lsb-only-btn').forEach((b) => {
            if (b !== btn) {
              b.textContent = '只看TA'
              b.classList.remove('is-on')
            }
          })
          applyFocus()
        },
      })
      btn?.classList.add('lsb-only-btn')
    }
    api.dom.each('li.post-entry', wire)

    /* ── 设置面板分页 ── */
    api.ui.tab({
      name: '楼层统计',
      order: 50,
      render(host) {
        const c = cfg
        const sorted = [...counts.values()].sort((a, b) => b.n - a.n)
        const rows = sorted.slice(0, c.topN || 10)
        const totalFloors = sorted.reduce((s, x) => s + x.n, 0)
        if (!rows.length) {
          host.innerHTML = '<div class="lsb-empty">本帖还没有可统计的楼层。</div>'
          return
        }
        const max = rows[0].n
        host.innerHTML = `
          <div class="lsb-row-desc" style="margin-bottom:8px">
            ${api.util.esc(api.snapshot?.topic?.title || '')} · 共 ${totalFloors} 楼 / ${counts.size} 人
          </div>
          ${rows
            .map(
              (r) => `
            <div class="lsb-row">
              <div class="lsb-row-main">
                <div class="lsb-row-name">${api.util.esc(r.name || 'uid ' + r.uid)}
                  <span class="lsb-badge">${r.n} 楼</span>
                </div>
                <div style="height:4px;background:var(--line-soft,#eee);border-radius:2px;margin-top:5px">
                  <div style="width:${Math.round((r.n / max) * 100)}%;height:100%;background:var(--brand,#5eaaa0);border-radius:2px"></div>
                </div>
              </div>
              <a class="lsb-btn" href="${api.routes.user(r.uid)}" target="_blank">主页</a>
            </div>`,
            )
            .join('')}`
      }
    })

    // 配置由面板保存，刷新页面后生效（按钮的挂载是一次性的）

    return {
      /** 其它已声明依赖的脚本也可用 api.plugin('floor-stats').countOf(uid) */
      countOf(uid) {
        return counts.get(uid)?.n ?? 0
      },
    }
  }

  /* ── 标准引导：与基座的加载顺序无关 ── */
  const w = typeof unsafeWindow !== 'undefined' ? unsafeWindow : window
  if (w.LSB && w.LSB.register) {
    w.LSB.register(manifest, setup)
  } else {
    ;(w.LSB_PLUGINS = w.LSB_PLUGINS || []).push({ manifest, setup })
  }
})()


;
/* ══════════════ LSB·高频发言标记（示例插件：服务消费方） v1.0.1 (hot-floor-badge) ══════════════ */
/**
 * 示例要点：
 *  1. requires.plugins 声明依赖 —— 基座会等「floor-stats」激活后再激活本插件，
 *     且版本不满足（^1.0.0）时拒绝运行并面板提示
 *  2. api.request('floorstats:summary') 跨脚本 RPC
 *  3. api.plugin('floor-stats') 直接读取对方的 exports（countOf）
 */
(function () {
  'use strict'

  const manifest = {
    id: 'hot-floor-badge',
    name: '高频发言标记',
    version: '1.0.1',
    description: '给楼层数达到阈值的作者在每层加 🔥 标记',
    author: 'you',
    requires: { base: '^0.1.0', plugins: { 'floor-stats': '^1.0.0' } },
    permissions: ['read', 'storage', 'ui', 'events'],
    pages: ['topic'],
    config: {
      threshold: { type: 'number', label: '多少楼以上算高频', default: 5 },
    },
  }

  function setup(api) {
    const hot = new Set()

    async function refresh() {
      const threshold = api.config().threshold || 5
      // 跨脚本 RPC：由 floor-stats 提供
      const summary = await api.request('floorstats:summary')
      hot.clear()
      for (const a of summary.authors) {
        if (a.n >= threshold) hot.add(a.uid)
      }
      apply()
      api.log(`高频作者 ${hot.size} 人（阈值 ${threshold}）`)
    }

    function isHot(li) {
      const a = li.querySelector('a[href^="/user/"]')
      if (!a) return false
      const uid = Number((a.getAttribute('href').match(/\/user\/(\d+)/) || [])[1])
      return hot.has(uid)
    }

    function apply() {
      api.dom.posts().forEach((li) => {
        let badge = li.querySelector('.lsb-hot-badge')
        if (isHot(li)) {
          if (!badge) {
            badge = document.createElement('span')
            badge.className = 'lsb-badge lsb-hot-badge'
            badge.title = `该作者在本帖发言 ≥ 阈值（共 ${api.plugin('floor-stats').countOf(
              Number((li.querySelector('a[href^="/user/"]')?.getAttribute('href') || '').match(/\/user\/(\d+)/)?.[1] || 0),
            )} 楼）`
            badge.textContent = '🔥 高频'
            const nameEl = li.querySelector('.post-user-group')
            ;(nameEl && nameEl.parentElement ? nameEl.parentElement : li).appendChild(badge)
          }
        } else if (badge) {
          badge.remove()
        }
      })
    }

    api.ui.style('.lsb-hot-badge{background:var(--warning-soft,#3a2a14)!important;color:var(--warning,#d4a05a)!important}')

    // site:ready 是 sticky 事件；这里其实已就绪，直接刷新一次即可
    refresh()
    // 新楼层到达也重算（floor-stats 的计数是增量的，这里只需重贴标记）
    api.on('topic:posts-added', () => refresh())

    /* ── 设置页（由 manifest.config 自动生成） ── */
    api.ui.configTab({ name: "高频标记", order: 54 })

    return {}
  }

  /* ── 标准引导 ── */
  const w = typeof unsafeWindow !== 'undefined' ? unsafeWindow : window
  if (w.LSB && w.LSB.register) {
    w.LSB.register(manifest, setup)
  } else {
    ;(w.LSB_PLUGINS = w.LSB_PLUGINS || []).push({ manifest, setup })
  }
})()


;
/* ══════════════ LSB·断点续读 v1.0.6 (resume-reading) ══════════════ */
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


;
/* ══════════════ LSB·阅读中心 v1.0.0 (reading-center) ══════════════ */
(function () {
  'use strict'

  const manifest = {
    id: 'reading-center', name: '阅读中心', version: '1.0.0',
    description: '统一最近阅读、稍后阅读与继续阅读', author: 'you',
    requires: { base: '^2.4.2' }, permissions: ['read', 'storage', 'ui', 'events'],
  }
  const CAP = 500
  const BATCH = 50
  const validId = (value) => Number.isSafeInteger(Number(value)) && Number(value) > 0

  function setup(api) {
    let alive = true, generation = 0, view = null
    let history = [], sourceStatus = 'unavailable', activeTab = 'recent', query = '', limit = BATCH
    const buttons = new Set()
    const esc = api.util.esc

    function loadLater() {
      const raw = api.store.get('later', {})
      if (!raw || typeof raw !== 'object' || Array.isArray(raw)) return {}
      return Object.fromEntries(Object.entries(raw).filter(([id, item]) => validId(id)
        && item && typeof item.title === 'string' && Number.isFinite(item.addedAt) && item.addedAt > 0)
        .map(([id, item]) => [Number(id), { title: item.title.slice(0, 500), addedAt: item.addedAt }]))
    }

    function saveLater(topicId, title, remove = false) {
      if (!alive || !validId(topicId)) return false
      const all = loadLater()
      if (remove) delete all[topicId]
      else if (!all[topicId]) {
        if (Object.keys(all).length >= CAP) {
          api.ui.toast('稍后阅读已满 500 帖，请先移除一些条目。', { type: 'error' })
          return false
        }
        all[topicId] = { title: String(title || `帖子 #${topicId}`).slice(0, 500), addedAt: Date.now() }
      }
      try { api.store.set('later', all) }
      catch {
        api.ui.toast('保存失败，请检查本地存储后重试。', { type: 'error' })
        return false
      }
      paintButtons()
      paint()
      return true
    }

    // Only identifiers and positions construct links; stored URLs are never trusted.
    function href(record) {
      const page = Number.isSafeInteger(record?.page) && record.page > 0 ? record.page : 1
      const floor = Number.isSafeInteger(record?.floor) && record.floor > 0 ? record.floor : 0
      return api.routes.topic(record.topicId, page) + (floor ? `${page > 1 ? '&' : '?'}floor=${floor}` : '')
    }

    function rows() {
      const later = loadLater()
      const byId = new Map(history.map((item) => [item.topicId, item]))
      const list = activeTab === 'recent' ? history : Object.entries(later).map(([id, item]) => ({
        ...byId.get(Number(id)), topicId: Number(id), title: byId.get(Number(id))?.title || item.title,
        addedAt: item.addedAt,
      })).sort((a, b) => b.addedAt - a.addedAt || b.topicId - a.topicId)
      const needle = query.trim().toLocaleLowerCase()
      return list.filter((item) => !needle || `${item.title} ${item.topicId}`.toLocaleLowerCase().includes(needle))
    }

    function paint() {
      if (!alive || !view?.isConnected) return
      const later = loadLater(), list = rows()
      view.querySelector('[data-reading-status]').textContent = sourceStatus === 'ok'
        ? `${history.length} 帖有阅读记录 · ${Object.keys(later).length} / ${CAP} 帖稍后阅读`
        : sourceStatus === 'error' ? '阅读记录暂时无法读取，请刷新重试；稍后阅读仍可使用。'
          : '未启用断点续读，暂不能显示最近阅读；稍后阅读仍可使用。'
      for (const button of view.querySelectorAll('[data-reading-tab]')) {
        const selected = button.dataset.readingTab === activeTab
        button.setAttribute('aria-selected', String(selected))
        button.classList.toggle('is-primary', selected)
      }
      view.querySelector('[data-reading-rows]').innerHTML = list.length ? list.slice(0, limit).map((item) => {
        const position = Number.isSafeInteger(item.floor) ? `读到 #${item.floor} · 第 ${item.page || 1} 页` : '尚无阅读位置'
        const timestamp = activeTab === 'later' ? item.addedAt : item.updatedAt
        const saved = !!later[item.topicId]
        return `<article class="lsb-reading-row" data-reading-topic="${item.topicId}">
          <div class="lsb-reading-main"><a class="lsb-reading-title" href="${href(item)}">${esc(item.title || `帖子 #${item.topicId}`)}</a>
          <p>${position} · ${esc(new Date(timestamp).toLocaleString('zh-CN'))}</p></div>
          <div class="lsb-reading-actions"><a class="lsb-btn" href="${href(item)}">${item.floor > 0 ? '继续阅读' : '打开帖子'}</a>
          <button type="button" class="lsb-btn" ${saved ? 'data-reading-remove' : 'data-reading-save'}>${saved ? '移出稍后阅读' : '稍后阅读'}</button></div>
        </article>`
      }).join('') : `<p class="lsb-empty">${query.trim() ? '没有匹配的帖子。' : activeTab === 'later'
        ? '还没有稍后阅读。在帖子标题旁或最近阅读中点击「稍后阅读」。'
        : sourceStatus === 'ok' ? '还没有阅读记录，打开一篇帖子开始阅读。' : '启用「断点续读」后可查看已有记录。'}</p>`
      const more = view.querySelector('[data-reading-more]')
      more.hidden = list.length <= limit
      more.textContent = `加载更多（已显示 ${Math.min(limit, list.length)} / ${list.length}）`
    }

    async function refresh() {
      if (!alive) return
      const ticket = ++generation
      let records = [], status = 'unavailable'
      if (api.hasHandler('resume-reading:list')) {
        try {
          const result = await api.request('resume-reading:list', null, { timeout: 2000 })
          records = Array.isArray(result) ? result.filter((r) => r && validId(r.topicId)
            && Number.isSafeInteger(r.floor) && r.floor >= 0 && Number.isSafeInteger(r.page) && r.page > 0
            && Number.isFinite(r.updatedAt)) : []
          status = Array.isArray(result) ? 'ok' : 'error'
        } catch { status = 'error' }
      }
      if (!alive || ticket !== generation) return
      history = records
      sourceStatus = status
      paintButtons()
      paint()
      if (view?.isConnected) view.dataset.ready = 'true'
    }

    function render(host) {
      view = document.createElement('section')
      view.dataset.readingCenter = ''
      view.className = 'lsb-reading-center'
      query = ''
      limit = BATCH
      view.innerHTML = `<header><h2>阅读中心</h2><p>找回读过的帖子，也留一些给下次。</p></header>
        <div class="lsb-reading-toolbar"><div role="tablist" aria-label="阅读列表">
          <button type="button" role="tab" class="lsb-btn" data-reading-tab="recent">最近阅读</button>
          <button type="button" role="tab" class="lsb-btn" data-reading-tab="later">稍后阅读</button></div>
          <button type="button" class="lsb-btn" data-reading-refresh>刷新</button></div>
        <label class="lsb-reading-search">搜索本地记录<input type="search" placeholder="标题或主题 ID" aria-label="搜索本地阅读记录"></label>
        <p class="lsb-reading-status" data-reading-status role="status" aria-live="polite">正在读取本地记录…</p>
        <div data-reading-rows></div><button type="button" class="lsb-btn" data-reading-more hidden>加载更多</button>
        <p class="lsb-reading-note">稍后阅读仅保存在本地，不会加入站点收藏。阅读记录的保留时间由「断点续读」设置决定。</p>`
      view.addEventListener('input', (event) => {
        if (!alive || event.target.type !== 'search') return
        query = event.target.value
        limit = BATCH
        paint()
      })
      view.addEventListener('click', (event) => {
        if (!alive) return
        const button = event.target.closest('button')
        if (button?.hasAttribute('data-reading-tab')) {
          activeTab = button.dataset.readingTab
          limit = BATCH
          paint()
        } else if (button?.hasAttribute('data-reading-refresh')) refresh()
        else if (button?.hasAttribute('data-reading-more')) { limit += BATCH; paint() }
        else if (button) {
          const row = button.closest('[data-reading-topic]')
          if (row) saveLater(Number(row.dataset.readingTopic), row.querySelector('a').textContent,
            button.hasAttribute('data-reading-remove'))
        }
        // Close the base panel through its own close handler; keep the real link
        // event intact so skin can soft-navigate (or the browser can open a tab).
        const link = event.target.closest('a[href]')
        if (link && event.button === 0 && !event.ctrlKey && !event.metaKey && !event.shiftKey && !event.altKey) {
          view.closest('.lsb-panel')?.querySelector('.lsb-panel-close')?.click()
        }
      })
      host.append(view)
      refresh()
    }

    function paintButtons() {
      const all = loadLater()
      for (const button of buttons) {
        if (!button.isConnected) { button.remove(); buttons.delete(button); continue }
        const saved = !!all[button.dataset.readingToggle]
        button.textContent = saved ? '已加入稍后阅读' : '稍后阅读'
        button.setAttribute('aria-pressed', String(saved))
        button.title = saved ? '移出稍后阅读' : '加入稍后阅读'
      }
    }

    function addButton(host, topicId, title) {
      if (!alive || !validId(topicId) || host.querySelector('[data-reading-toggle]')) return
      const button = document.createElement('button')
      button.type = 'button'
      button.className = 'lsb-reading-toggle'
      button.dataset.readingToggle = String(topicId)
      button.dataset.readingTitle = String(title || '').slice(0, 500)
      host.append(button)
      buttons.add(button)
      paintButtons()
    }

    function decorateList(li) {
      if (!alive || !li.isConnected) return
      const item = api.parse.listItem(li)
      if (item?.id) addButton(li.querySelector('.post-title-row') || li.querySelector('.post-body') || li, item.id, item.title)
    }

    function decorateTopic() {
      if (api.page.type !== 'topic') return
      const heading = document.querySelector('.post-content-title')
      if (!heading) return
      let host = heading.nextElementSibling
      if (!host?.matches('[data-reading-topic-actions]')) {
        host = document.createElement('div')
        host.dataset.readingTopicActions = ''
        heading.after(host)
      }
      // The heading can be reused by a skin route commit.
      if (host.firstElementChild?.dataset.readingToggle !== String(api.page.id)) host.replaceChildren()
      addButton(host, api.page.id, heading.textContent)
    }

    function syncPage() {
      paintButtons()
      document.querySelectorAll(api.sel.listItems).forEach(decorateList)
      decorateTopic()
      if (view?.isConnected) refresh()
    }

    const onToggle = (event) => {
      const button = event.target.closest?.('[data-reading-toggle]')
      if (!alive || !button || !buttons.has(button)) return
      event.preventDefault()
      const id = Number(button.dataset.readingToggle)
      saveLater(id, button.dataset.readingTitle, !!loadLater()[id])
    }
    const onFocus = () => { if (alive) { paintButtons(); if (view?.isConnected) refresh() } }
    const onVisible = () => { if (!document.hidden) onFocus() }
    document.addEventListener('click', onToggle)
    window.addEventListener('focus', onFocus)
    document.addEventListener('visibilitychange', onVisible)
    api.dom.each(api.sel.listItems, decorateList)
    api.on('route:changed', syncPage)
    api.on('plugin:resume-reading:changed', () => { if (view?.isConnected) refresh() })
    for (const event of ['plugin:activated', 'plugin:disabled']) api.on(event, ({ id } = {}) => {
      if (id === 'resume-reading' && view?.isConnected) refresh()
    })
    api.store.watch(() => { if (alive) { paintButtons(); paint() } })
    api.ui.tab({ name: '阅读中心', order: 59, render })
    api.handle('reading-center:open', () => { if (alive) api.ui.openPanel('reading-center') })
    api.handle('reading-center:debug', () => ({ refresh, state: () => ({
      activeTab, sourceStatus, recentCount: history.length, laterCount: Object.keys(loadLater()).length,
    }) }))
    api.ui.style(`
      .lsb-reading-center{color:var(--text,#222);min-width:0}
      .lsb-reading-center h2{margin:0 0 6px;font-size:22px}
      .lsb-reading-center header p,.lsb-reading-status,.lsb-reading-note,.lsb-reading-main p{color:var(--text,#222);opacity:.72;font-size:12px;line-height:1.6}
      .lsb-reading-toolbar,.lsb-reading-toolbar [role=tablist],.lsb-reading-actions{display:flex;gap:8px;flex-wrap:wrap;align-items:center}
      .lsb-reading-toolbar{justify-content:space-between;margin:18px 0 14px}
      .lsb-reading-search{display:block;font-size:12px}
      .lsb-reading-search input{display:block;box-sizing:border-box;width:100%;min-width:0;padding:10px;margin-top:6px;border:1px solid var(--line,#ddd);border-radius:8px;background:var(--panel,#fff);color:inherit;font:inherit;font-size:14px}
      .lsb-reading-row{padding:16px 0;border-bottom:1px solid var(--line,#ddd)}
      .lsb-reading-title{font-size:15px;font-weight:600;line-height:1.6;overflow-wrap:anywhere;color:inherit;text-decoration:none}
      .lsb-reading-title:hover{text-decoration:underline}.lsb-reading-main p{margin:6px 0 10px}
      .lsb-reading-actions .lsb-btn,.lsb-reading-toolbar .lsb-btn{min-height:36px}
      .lsb-reading-note{margin:18px 0 0}.lsb-reading-center [hidden]{display:none!important}
      .lsb-reading-toggle{font:inherit;font-size:11px;line-height:1.5;flex:0 0 auto;margin:4px 0 4px 8px;padding:4px 8px;border:1px solid var(--line,#ddd);border-radius:999px;background:var(--panel,#fff);color:var(--muted,#666);cursor:pointer}
      .lsb-reading-toggle[aria-pressed=true]{color:var(--brand,#38867c);border-color:currentColor}
      [data-reading-topic-actions] .lsb-reading-toggle{margin-left:0}
      @media(max-width:600px){
        .lsb-panel:has([data-reading-center]) .lsb-panel-body{flex-direction:column}
        .lsb-panel:has([data-reading-center]) .lsb-tabs{display:flex;flex:0 0 auto;border-right:0;border-bottom:1px solid var(--line,#ddd);max-width:100%;gap:4px}
        .lsb-panel:has([data-reading-center]) .lsb-tab{flex:0 0 auto;width:auto;white-space:nowrap;min-height:44px}
        .lsb-reading-toolbar .lsb-btn,.lsb-reading-actions .lsb-btn,.lsb-reading-toggle{min-height:44px}
        .lsb-reading-toolbar{gap:12px}.lsb-reading-actions{gap:6px}.lsb-reading-toggle{margin-left:0}
      }
    `)
    syncPage()
    api.onDispose(() => {
      alive = false
      generation++
      document.removeEventListener('click', onToggle)
      window.removeEventListener('focus', onFocus)
      document.removeEventListener('visibilitychange', onVisible)
      for (const button of buttons) button.remove()
      buttons.clear()
      document.querySelectorAll('[data-reading-topic-actions]').forEach((host) => host.remove())
      view?.remove()
      view = null
      document.getElementById('lsb-style-reading-center')?.remove()
    })
  }

  const w = typeof unsafeWindow !== 'undefined' ? unsafeWindow : window
  if (w.LSB && w.LSB.register) w.LSB.register(manifest, setup)
  else (w.LSB_PLUGINS = w.LSB_PLUGINS || []).push({ manifest, setup })
})()


;
/* ══════════════ LSB·已读置灰 v1.0.5 (read-mark) ══════════════ */
(function () {
  'use strict'

  const manifest = {
    id: 'read-mark',
    name: '已读置灰',
    version: '1.0.5',
    description: '看过的帖子在列表中变灰；读到当前评论数后清理站点未读提示',
    author: 'you',
    requires: { base: '^0.1.0' },
    permissions: ['read', 'storage', 'ui', 'events'],
    // 不设 pages：topic 页负责「标记已读」，列表页负责「上色」，两边都要在
    config: {
      dim: {
        type: 'select',
        label: '置灰强度',
        default: '中',
        options: ['轻', '中', '重'],
      },
      keepDays: { type: 'number', label: '记录保留天数', default: 180 },
      cap: { type: 'number', label: '最多保存帖子数', default: 3000 },
    },
  }

  function setup(api) {
    let cfg = api.config()
    api.on('config:changed:read-mark', () => {
      cfg = api.config()
      restyle()
    })

    /* ── 存储层：marks[tid] = { ts: 标记时间, w: 水位线(楼层最大ts), r: 标记时回复数 } ── */
    function loadAll() {
      return api.store.get('marks', {}) || {}
    }
    function save(all) {
      api.store.set('marks', prune(all))
    }
    function prune(all) {
      const deadline = Date.now() - cfg.keepDays * 864e5
      let list = Object.entries(all).filter(([, r]) => r.ts > deadline)
      list.sort((a, b) => b[1].ts - a[1].ts)
      list = list.slice(0, Math.max(100, cfg.cap))
      return Object.fromEntries(list)
    }
    /** 记录/更新已读：w 只增不减；r 为 null 表示保持原值 */
    function markSeen(tid, w, r) {
      if (tid == null) return null
      const all = loadAll()
      const prev = all[tid] || {}
      const rec = {
        ts: Date.now(),
        w: Math.max(prev.w || 0, w || 0),
        r: r != null ? r : prev.r,
      }
      all[tid] = rec
      save(all)
      return rec
    }

    let topicSeenPosts = new Set()

    /* ── 标记侧：帖子页打开即视为已读（壳内跳转也走 route:changed，不能只在 setup 时记一次） ── */
    function markOpenTopic() {
      if (api.page.type !== 'topic') {
        topicSeenPosts = new Set()
        return
      }
      const tid = api.page.id
      topicSeenPosts = new Set(
        [...document.querySelectorAll('li.post-entry')]
          .map((li) => Number((li.id || '').match(/^post-(\d+)$/)?.[1] || 0))
          .filter(Boolean),
      )
      let topic = null
      try {
        topic = api.parse.topic(document)
      } catch {
        /* 解析失败退回启动快照 */
      }
      if (!topic) topic = api.snapshot?.topic || null
      const floorTs = (topic?.posts || []).map((p) => p.ts || 0)
      markSeen(tid, Math.max(0, ...floorTs), topic?.replies != null ? topic.replies : null)
    }

    markOpenTopic()
    api.on('topic:posts-added', (posts) => {
      if (api.page.type !== 'topic' || !posts.length) return
      const tid = api.page.id
      const fresh = posts.filter((post) => post.postId && !topicSeenPosts.has(post.postId))
      for (const post of posts) if (post.postId) topicSeenPosts.add(post.postId)
      // 软跳提交正文也会触发一次 posts-added；这些楼层已经在打开时计入水位，不能重复加回复数。
      if (!fresh.length) return
      const all = loadAll()
      const prev = all[tid]
      markSeen(
        tid,
        Math.max(0, ...fresh.map((p) => p.ts || 0)),
        prev && prev.r != null ? prev.r + fresh.length : null,
      )
    })

    /* ── 上色侧：列表页把看过的条目变灰 ── */
    const DIM = { 轻: 0.7, 中: 0.55, 重: 0.35 }

    /** 当前列表行是否已经读到记录中的回复数；没有回复数时退回楼层时间水位。 */
    function isReadAt(rec, it) {
      if (it.replies != null && rec.r != null) return it.replies <= rec.r
      if (it.lastActiveTs != null && rec.w != null) return it.lastActiveTs <= rec.w
      return true
    }

    function clearNativeUnread(li) {
      li.querySelectorAll('a.unread-topic-notice').forEach((node) => node.remove())
      // 实时流的短时高亮也是「新评论」提示；用户已经读到当前水位后一起清掉。
      li.classList.remove('lsb-live-bumped')
    }

    function restyle() {
      const id = 'lsb-read-mark-style'
      let el = document.getElementById(id)
      if (!el) {
        el = document.createElement('style')
        el.id = id
        document.head.appendChild(el)
      }
      el.textContent = `
        li.post-item.lsb-seen{opacity:${DIM[cfg.dim] ?? 0.55}}
        li.post-item.lsb-seen .post-title{color:var(--text-soft,#6b7280)}
        li.post-item.lsb-seen img{filter:grayscale(.8)}
      `
    }
    restyle()

    function paint(li) {
      const it = api.parse.listItem(li)
      if (!it || !it.id) return
      const rec = loadAll()[it.id]
      if (!rec) return
      li.classList.add('lsb-seen')
      if (isReadAt(rec, it)) clearNativeUnread(li)
    }

    function paintTopic(id) {
      if (id == null) return
      for (const li of document.querySelectorAll(api.sel?.listItems || 'ul.post-list > li.post-item:not(.post-entry):not(.topic-collections-collection-row)')) {
        const it = api.parse.listItem(li)
        if (it?.id === Number(id)) paint(li)
      }
    }

    function paintAll() {
      for (const li of document.querySelectorAll(api.sel?.listItems || 'ul.post-list > li.post-item:not(.post-entry):not(.topic-collections-collection-row)')) {
        paint(li)
      }
    }

    // 现有 + 无限滚动新增的条目各回调一次（幂等）
    api.dom.each(api.sel?.listItems || 'ul.post-list > li.post-item:not(.post-entry):not(.topic-collections-collection-row)', paint)
    // 软导航后 DOM 可能被整段换掉：记账 + 全量重涂
    api.on('route:changed', () => {
      markOpenTopic()
      setTimeout(paintAll, 50)
    })

    // 实时流更新了旧帖行的评论数后重新判断：用户已读到该水位时，清除缓存行里的旧提示。
    api.on('live-feed:list-row-updated', ({ id } = {}) => paintTopic(id))

    /* ── 面板：设置表单（自动生成）+ 统计与清空 ── */
    api.ui.configTab({
      name: '已读置灰',
      order: 40,
      render(host) {
        const all = loadAll()
        const total = Object.keys(all).length
        host.insertAdjacentHTML('beforeend', '<div style="height:10px"></div>')
        const info = document.createElement('div')
        info.className = 'lsb-row-desc'
        info.style.marginBottom = '10px'
        info.textContent = `本地已记录 ${total} 帖。已读到当前评论数时清理站点未读提示；置灰只改外观。`
        host.appendChild(info)

        const clear = document.createElement('button')
        clear.className = 'lsb-btn'
        clear.textContent = '清空全部已读记录（全部恢复原色）'
        clear.onclick = async () => {
          if (await api.ui.confirm('清空全部已读记录？列表将恢复未读外观。')) {
            api.store.set('marks', {})
            paintAll()
            api.ui.showTab('read-mark')
          }
        }
        host.appendChild(clear)
      },
    })

    /* ── 调试接口（测试 / 年度报告聚合用） ── */
    api.handle('read-mark:debug', () => ({
      all: loadAll,
      seen: (id) => !!loadAll()[Number(id)],
      rec: (id) => loadAll()[Number(id)] || null,
      mark: (id, w, r) => markSeen(Number(id), w, r),
      forget: (id) => {
        const a = loadAll()
        delete a[Number(id)]
        save(a)
      },
      clear: () => api.store.set('marks', {}),
    }))

    return {}
  }

  const w = typeof unsafeWindow !== 'undefined' ? unsafeWindow : window
  if (w.LSB && w.LSB.register) w.LSB.register(manifest, setup)
  else ;(w.LSB_PLUGINS = w.LSB_PLUGINS || []).push({ manifest, setup })
})()


;
/* ══════════════ LSB·红包发卡 v1.0.0 (topic-marks) ══════════════ */
(function () {
  'use strict'

  const manifest = {
    id: 'topic-marks',
    name: '红包发卡',
    version: '1.0.0',
    description: '列表左侧色条标出还活着的红包 / 发卡',
    author: 'you',
    requires: { base: '^0.1.0' },
    permissions: ['read', 'ui', 'events'],
  }

  function setup(api) {
    const STYLE_ID = 'lsb-topic-marks-style'
    const RED = 'lsb-topic-mark-red'
    const CARD = 'lsb-topic-mark-card'
    const listSel =
      api.sel?.listItems || 'ul.post-list > li.post-item:not(.post-entry):not(.topic-collections-collection-row)'

    const el = document.createElement('style')
    el.id = STYLE_ID
    el.textContent =
      `li.post-item.${RED}{box-shadow:inset 3px 0 0 #e11d48}` +
      `li.post-item.${CARD}{box-shadow:inset 3px 0 0 #d97706}` +
      `li.post-item.${RED}.${CARD}{box-shadow:inset 3px 0 0 #e11d48,inset 6px 0 0 #d97706}`
    document.head.appendChild(el)

    function paint(li) {
      const it = api.parse.listItem(li)
      li.classList.toggle(RED, it?.marks?.redPacket === 'live')
      li.classList.toggle(CARD, it?.marks?.virtualCard === 'live')
    }

    function paintAll() {
      for (const li of document.querySelectorAll(listSel)) paint(li)
    }

    api.dom.each(listSel, paint)
    api.on('route:changed', () => {
      setTimeout(paintAll, 50)
    })
    api.onDispose(() => {
      document.getElementById(STYLE_ID)?.remove()
      for (const li of document.querySelectorAll(`li.post-item.${RED}, li.post-item.${CARD}`)) {
        li.classList.remove(RED, CARD)
      }
    })

    api.ui.configTab({
      name: '红包发卡',
      order: 41,
      render(host) {
        const p = document.createElement('div')
        p.className = 'lsb-row-desc'
        p.textContent =
          '列表左侧色条标出还活着的红包（红）和发卡（琥珀）。结束态不画。盯红包 / 盯发卡在机会监控里，默认关。'
        host.appendChild(p)
      },
    })

    api.handle('topic-marks:debug', () => ({
      painted: () => document.querySelectorAll(`li.post-item.${RED}, li.post-item.${CARD}`).length,
      liveRed: () => document.querySelectorAll(`li.post-item.${RED}`).length,
      liveCard: () => document.querySelectorAll(`li.post-item.${CARD}`).length,
    }))

    return {}
  }

  const w = typeof unsafeWindow !== 'undefined' ? unsafeWindow : window
  if (w.LSB && w.LSB.register) w.LSB.register(manifest, setup)
  else {
    w.LSB_PLUGINS = w.LSB_PLUGINS || []
    w.LSB_PLUGINS.push({ manifest, setup })
  }
})()


;
/* ══════════════ LSB·首页回位 v1.0.1 (home-return) ══════════════ */
(function () {
  'use strict'

  const KEY = 'lsb_base:home-return:target'
  const MAX_PAGES = 20

  const manifest = {
    id: 'home-return',
    name: '首页回位',
    version: '1.0.1',
    description: '回首页时滚到上次点进的那条帖；回成功一次后刷新不再跳',
    author: 'you',
    requires: { base: '^0.1.0' },
    permissions: ['read', 'storage', 'ui', 'events'],
    config: {
      enabled: { type: 'switch', label: '回首页时回到上次点进的帖', default: true },
    },
  }

  function setup(api) {
    let cfg = api.config()
    api.on('config:changed:home-return', () => {
      cfg = api.config()
    })

    let scheduled = 0
    let inflight = null
    const watches = new Set()

    function topicIdFrom(href) {
      const m = String(href || '').match(/\/topic\/(\d+)/)
      return m ? Number(m[1]) : 0
    }

    function onHome() {
      try {
        return api.parse.detectPage(location).type === 'home'
      } catch {
        return api.page.type === 'home'
      }
    }

    function read() {
      try {
        const rec = JSON.parse(sessionStorage.getItem(KEY) || 'null')
        if (!rec || !Number.isFinite(rec.tid) || rec.tid <= 0) return null
        return rec
      } catch {
        return null
      }
    }

    function write(tid, offset) {
      try {
        sessionStorage.setItem(KEY, JSON.stringify({ tid, offset, ts: Date.now() }))
      } catch {
        /* 隐私模式可能写不了 */
      }
    }

    function clear() {
      try {
        sessionStorage.removeItem(KEY)
      } catch {
        /* ignore */
      }
    }

    function findItem(tid) {
      for (const li of document.querySelectorAll(api.sel.listItems)) {
        if (topicIdFrom(li.querySelector('a.post-title')?.getAttribute('href')) === tid) return li
      }
      return null
    }

    function applyScroll(li, offset) {
      const top = li.getBoundingClientRect().top + (window.scrollY || window.pageYOffset || 0)
      const y = Math.max(0, top - (Number.isFinite(offset) ? offset : 0))
      try {
        window.scrollTo(0, y)
      } catch {
        /* jsdom 视口 */
      }
    }

    function pagePath(p) {
      const url = new URL(location.href)
      url.searchParams.set('p', String(p))
      return `${url.pathname}${url.search}`
    }

    async function loadNext(page) {
      const doc = await api.net.doc(pagePath(page))
      const ul = document.querySelector(api.sel.listUl)
      if (!ul) return 0
      const seen = new Set(
        [...ul.querySelectorAll(api.sel.listItems)].map((li) =>
          topicIdFrom(li.querySelector('a.post-title')?.getAttribute('href')),
        ),
      )
      let added = 0
      for (const li of doc.querySelectorAll(api.sel.listItems)) {
        const id = topicIdFrom(li.querySelector('a.post-title')?.getAttribute('href'))
        if (!id || seen.has(id)) continue
        seen.add(id)
        ul.appendChild(document.importNode(li, true))
        added += 1
      }
      return added
    }

    async function restore() {
      if (!cfg.enabled) return false
      if (!onHome()) return false
      const rec = read()
      if (!rec) return false
      let el = findItem(rec.tid)
      if (!el) {
        let page = Number(api.page.page) || 1
        for (let i = 0; i < MAX_PAGES; i++) {
          page += 1
          let added = 0
          try {
            added = await loadNext(page)
          } catch {
            break
          }
          el = findItem(rec.tid)
          if (el) break
          if (!added) break
        }
      }
      if (!el) return false
      applyScroll(el, rec.offset)
      clear()
      return true
    }

    function scheduleRestore() {
      if (!cfg.enabled || !onHome()) return
      window.clearTimeout(scheduled)
      scheduled = window.setTimeout(() => {
        scheduled = 0
        if (inflight) return
        inflight = restore().finally(() => {
          inflight = null
        })
      }, 50)
    }

    function watchHomeArrival() {
      const from = location.href
      let n = 0
      const iv = window.setInterval(() => {
        n += 1
        if (onHome() && location.href !== from) {
          window.clearInterval(iv)
          watches.delete(iv)
          scheduleRestore()
        } else if (n >= 40) {
          window.clearInterval(iv)
          watches.delete(iv)
        }
      }, 20)
      watches.add(iv)
    }

    function onClick(e) {
      if (e.button !== 0) return
      const a = e.target?.closest?.('a[href]')
      if (!a) return
      if (a.target && a.target !== '_self') return
      try {
        const dest = api.parse.detectPage(new URL(a.href, location.href))
        if (cfg.enabled && dest.type === 'home' && !onHome()) watchHomeArrival()
      } catch {
        /* 坏 href 忽略 */
      }
      if (!cfg.enabled || !onHome()) return
      const title = a.closest('a.post-title')
      if (!title) return
      const li = title.closest('li.post-item')
      if (!li || !li.parentElement?.matches?.('ul.post-list')) return
      const tid = topicIdFrom(title.getAttribute('href'))
      if (!tid) return
      write(tid, li.getBoundingClientRect().top)
    }

    function onPageShow() {
      scheduleRestore()
    }

    document.addEventListener('click', onClick, true)
    window.addEventListener('pageshow', onPageShow)
    window.addEventListener('popstate', onPageShow)
    api.on('route:changed', scheduleRestore)
    api.onDispose(() => {
      document.removeEventListener('click', onClick, true)
      window.removeEventListener('pageshow', onPageShow)
      window.removeEventListener('popstate', onPageShow)
      if (scheduled) window.clearTimeout(scheduled)
      scheduled = 0
      for (const iv of watches) window.clearInterval(iv)
      watches.clear()
    })

    api.handle('home-return:debug', () => ({
      peek: read,
      find: (tid) => !!findItem(Number(tid)),
      restore,
    }))

    scheduleRestore()
    return {}
  }

  const w = typeof unsafeWindow !== 'undefined' ? unsafeWindow : window
  if (w.LSB && w.LSB.register) w.LSB.register(manifest, setup)
  else (w.LSB_PLUGINS = w.LSB_PLUGINS || []).push({ manifest, setup })
})()


;
/* ══════════════ LSB·主楼预览 v1.1.3 (topic-preview) ══════════════ */
(function () {
  'use strict'

  const manifest = {
    id: 'topic-preview',
    name: '主楼预览',
    version: '1.1.3',
    description: '列表点预览，浮窗嵌原帖（裁外壳）',
    author: 'you',
    requires: { base: '^0.1.0' },
    permissions: ['read', 'ui', 'events'],
  }

  const CROP_CSS =
    '.top,nav.forum-nav,aside.sidebar,aside.mobile-menu-drawer,footer.footer,' +
    '.mobile-menu-backdrop,.mobile-menu-trigger,.forum-more-region{display:none!important}' +
    '.forum-layout.forum-layout-has-sidebar{display:block!important;grid-template-columns:1fr!important}' +
    'main.wrap{max-width:none!important;margin-left:0!important;margin-right:0!important;width:auto!important}' +
    'body{overflow-y:auto!important}'

  function setup(api) {
    let activeId = null
    let mask = null
    let panel = null
    let onKey = null
    let frameWin = null
    let frameEsc = null

    const style = document.createElement('style')
    style.id = 'lsb-topic-preview-style'
    style.textContent = `
      .lsb-topic-preview-btn{
        margin-left:8px;padding:0 6px;height:20px;border:1px solid var(--line,#ddd);
        border-radius:4px;background:transparent;color:var(--text-muted,#888);
        font-size:12px;cursor:pointer;flex-shrink:0;vertical-align:middle;
      }
      .lsb-topic-preview-btn:hover{color:var(--brand,#5eaaa0);border-color:var(--brand,#5eaaa0)}
      .lsb-topic-preview-btn:active{transform:scale(.97)}
      #lsb-topic-preview{width:min(800px,94vw)}
      #lsb-topic-preview .lsb-view{
        position:relative;flex:0 0 auto;height:min(70vh,640px);padding:0;overflow:hidden;
      }
      #lsb-topic-preview iframe{
        position:absolute;inset:0;width:100%;height:100%;border:0;background:var(--bg,#fff);
      }
      #lsb-topic-preview [data-lsb-tp-loading]{
        position:absolute;inset:0;z-index:1;display:flex;align-items:center;justify-content:center;
        background:var(--panel,#fff);color:var(--text-muted,#888);font-size:13px;
      }
      #lsb-topic-preview [data-lsb-tp-loading][hidden]{display:none!important}
    `
    document.head.appendChild(style)

    function topicIdFrom(href) {
      const m = String(href || '').match(/\/topic\/(\d+)/)
      return m ? Number(m[1]) : null
    }

    function isTopicFrame(iframe) {
      return !!topicIdFrom(iframe?.getAttribute('src') || iframe?.src || '')
    }

    function unbindFrameEsc() {
      if (frameWin && frameEsc) {
        try {
          frameWin.removeEventListener('keydown', frameEsc)
        } catch {
          /* 翻页后旧 window 可能已经没了 */
        }
      }
      frameWin = null
      frameEsc = null
    }

    function bindFrameEsc(iframe) {
      unbindFrameEsc()
      const win = iframe.contentWindow
      if (!win) return
      frameEsc = (e) => {
        if (e.key === 'Escape') close()
      }
      frameWin = win
      win.addEventListener('keydown', frameEsc)
    }

    function cropFrame(iframe) {
      const doc = iframe.contentDocument
      if (!doc) return
      let st = doc.getElementById('lsb-topic-preview-crop')
      if (!st) {
        st = doc.createElement('style')
        st.id = 'lsb-topic-preview-crop'
        const host = doc.head || doc.documentElement
        if (!host) return
        host.appendChild(st)
      }
      st.textContent = CROP_CSS
    }

    function dropUi() {
      unbindFrameEsc()
      mask?.remove()
      panel?.remove()
      mask = null
      panel = null
      if (onKey) {
        document.removeEventListener('keydown', onKey)
        onKey = null
      }
    }

    function close() {
      activeId = null
      dropUi()
    }

    function onFrameLoad() {
      const iframe = panel?.querySelector('iframe')
      if (!iframe || !isTopicFrame(iframe)) return
      try {
        cropFrame(iframe)
        bindFrameEsc(iframe)
      } catch {
        /* 跨域错误页或沙箱拦 contentDocument：帖仍在 iframe 里，不能卡加载中 */
      }
      const loading = panel.querySelector('[data-lsb-tp-loading]')
      if (loading) loading.hidden = true
    }

    function ensureUi() {
      if (panel && mask) return panel
      dropUi()
      mask = document.createElement('div')
      mask.className = 'lsb-mask lsb-topic-preview-mask'
      panel = document.createElement('div')
      panel.className = 'lsb-panel'
      panel.id = 'lsb-topic-preview'
      panel.innerHTML =
        '<div class="lsb-panel-head"><strong data-lsb-tp-title>预览</strong>' +
        '<button type="button" class="lsb-panel-close" aria-label="关闭">×</button></div>' +
        '<div class="lsb-view"><div data-lsb-tp-loading>加载中</div>' +
        '<iframe class="lsb-topic-preview-frame" title="帖子预览"></iframe></div>' +
        '<div class="lsb-actions"><a class="lsb-btn is-primary" data-lsb-tp-open>打开帖子</a></div>'
      panel.querySelector('.lsb-panel-close').onclick = close
      mask.onclick = close
      panel.querySelector('iframe').addEventListener('load', onFrameLoad)
      document.body.append(mask, panel)
      onKey = (e) => {
        if (e.key === 'Escape') close()
      }
      document.addEventListener('keydown', onKey)
      return panel
    }

    function openPreview(id, listTitle) {
      const el = ensureUi()
      el.querySelector('[data-lsb-tp-title]').textContent = listTitle || '预览'
      el.querySelector('[data-lsb-tp-open]').setAttribute('href', api.routes.topic(id))
      const iframe = el.querySelector('iframe')
      const already = activeId === id && isTopicFrame(iframe) && topicIdFrom(iframe.getAttribute('src')) === id
      activeId = id
      if (already) return
      const loading = el.querySelector('[data-lsb-tp-loading]')
      if (loading) loading.hidden = false
      iframe.setAttribute('src', api.routes.topic(id))
    }

    function paint(li) {
      if (api.page.type === 'topic' || api.page.type === 'user') return
      if (!(li instanceof Element) || li.classList.contains('post-entry')) return
      if (li.querySelector(':scope .lsb-topic-preview-btn')) return
      const titleA = li.querySelector('a.post-title[href*="/topic/"]')
      if (!titleA) return
      const id = topicIdFrom(titleA.getAttribute('href'))
      if (!id) return
      const btn = document.createElement('button')
      btn.type = 'button'
      btn.className = 'lsb-topic-preview-btn'
      btn.textContent = '预览'
      btn.addEventListener('click', (e) => {
        e.preventDefault()
        e.stopPropagation()
        const it = api.parse.listItem(li)
        openPreview(id, (it && it.title) || titleA.textContent.trim())
      })
      const row = li.querySelector('.post-title-row')
      if (row && titleA.parentElement === row) titleA.after(btn)
      else (row || li.querySelector('.post-body') || li).append(btn)
    }

    api.dom.each(api.sel.listItems, paint)
    api.on('route:changed', close)
    api.onDispose(() => {
      close()
      for (const btn of document.querySelectorAll('.lsb-topic-preview-btn')) btn.remove()
      style.remove()
    })

    api.handle('topic-preview:debug', () => ({
      buttons: () => document.querySelectorAll('.lsb-topic-preview-btn').length,
      open: () => !!document.getElementById('lsb-topic-preview'),
      activeId: () => activeId,
      frameSrc: () => panel?.querySelector('iframe')?.getAttribute('src') || null,
    }))

    return {}
  }

  const w = typeof unsafeWindow !== 'undefined' ? unsafeWindow : window
  if (w.LSB && w.LSB.register) w.LSB.register(manifest, setup)
  else (w.LSB_PLUGINS = w.LSB_PLUGINS || []).push({ manifest, setup })
})()


;
/* ══════════════ LSB·未读哨兵 v1.0.17 (unread-sentinel) ══════════════ */
(function () {
  'use strict'

  const manifest = {
    id: 'unread-sentinel',
    name: '未读哨兵',
    version: '1.0.17',
    description: '低频巡检首页新动态；跨标签选主去重；标题角标 + 通知 + 消息箱；左栏通知红点跟个人卡走',
    author: 'you',
    requires: { base: '^0.1.0' },
    permissions: ['read', 'storage', 'ui', 'events'],
    config: {
      intervalMin: { type: 'number', label: '巡检间隔 (分钟)', default: 3 },
      jitterMs: { type: 'number', label: '选主随机延迟 (ms)', default: 1200 },
      badgeInTitle: { type: 'switch', label: '标题栏未读角标', default: true },
      notifyDesktop: { type: 'switch', label: '桌面通知', default: false },
    },
  }

  function setup(api) {
    let cfg = api.config()
    api.on('config:changed:unread-sentinel', () => {
      cfg = api.config()
      if (election.isLeader) scheduleNext()
    })
    const origTitle = document.title
    let timer = null
    let inflight = null // 在途巡检 Promise：并发调用复用同一轮而非静默丢弃
    let notifyFresh = false
    let nextAt = null
    let lastErr = null
    const probe = {}
    const JITTER = Number.isFinite(Number(cfg.jitterMs)) ? Math.max(0, Number(cfg.jitterMs)) : 1200

    /* ── 状态存储 ── */
    const seenGet = () => api.store.get('seen', {}) || {}
    const seenSet = (m) => api.store.set('seen', m)
    const inboxGet = () => api.store.get('inbox', []) || []
    const inboxSet = (arr) => api.store.set('inbox', arr.slice(0, 100))
    const lastOpenTs = () => api.store.get('lastOpenTs', 0)

    api.ui.style(
      '.lsb-notify-badge{display:none!important}',
    )

    function notifyHosts() {
      const hosts = [...document.querySelectorAll('a[href*="tab=notifications"]')].filter((a) => {
        const href = a.getAttribute('href') || ''
        return !/[?&]p=/.test(href)
      })
      const mine = document.querySelector('a.nav-mine')
      if (mine && !hosts.includes(mine)) hosts.push(mine)
      return hosts
    }

    function isUserCardNotify(a) {
      if (a.classList.contains('nav-mine') || a.classList.contains('tab')) return false
      return !!(a.closest('.user-card, .user-links, [data-lsb-shell-me]'))
    }

    function isKeywordFilterBadge(el) {
      return !!(
        el.classList.contains('home-keyword-filter-count')
        || el.closest('.home-keyword-filter-button')
      )
    }

    function nativesOn(a) {
      // 个人卡「我的通知」原生是 .notify-badge（红底白字）。
      // .notification-unread 是通知页浅色胶囊，叠上去会看成白点。
      if (isUserCardNotify(a)) {
        a.querySelectorAll('.notification-unread').forEach((el) => el.remove())
      }
      return [...a.querySelectorAll('.notify-badge, .notification-unread, .mobile-nav-unread')].filter(
        (el) => !isKeywordFilterBadge(el),
      )
    }

    function rememberOrig(el) {
      if (!el.hasAttribute('data-lsb-notify-orig')) {
        el.setAttribute('data-lsb-notify-orig', el.textContent || '')
      }
    }

    function showNative(el, label) {
      rememberOrig(el)
      el.textContent = label
      el.hidden = false
      el.removeAttribute('data-lsb-notify-hid')
      el.style.removeProperty('display')
    }

    function hideNative(el) {
      rememberOrig(el)
      el.textContent = ''
      el.setAttribute('data-lsb-notify-hid', '')
      // 站点 .notification-unread{display:inline-flex} 会盖掉 hidden
      el.style.setProperty('display', 'none', 'important')
    }

    function canCreateNative(a) {
      return !a.classList.contains('nav-mine') && !a.classList.contains('tab')
    }

    function paintNotify(n) {
      const count = Math.max(0, Number(n) || 0)
      const label = count > 9 ? '9+' : String(count)
      document.querySelectorAll('.lsb-notify-badge').forEach((el) => el.remove())
      for (const a of notifyHosts()) {
        const natives = nativesOn(a)
        if (count <= 0) {
          for (const el of natives) {
            if (el.hasAttribute('data-lsb-notify')) el.remove()
            else hideNative(el)
          }
          continue
        }
        if (natives.length) {
          for (const el of natives) showNative(el, label)
          continue
        }
        if (!canCreateNative(a)) continue
        const el = document.createElement('span')
        el.className = 'notify-badge'
        el.setAttribute('data-lsb-notify', '')
        el.textContent = label
        a.append(el)
      }
    }

    function storedCount() {
      return Math.max(0, Number(api.store.get('notifyCount', 0)) || 0)
    }

    function stripCardSoftPills() {
      for (const a of notifyHosts()) {
        if (!isUserCardNotify(a)) continue
        a.querySelectorAll('.notification-unread').forEach((el) => el.remove())
      }
    }

    // 刷新后库存经常是 0：先留着站点 SSR 红点，等从个人卡抄到数字再决定藏不藏。
    function paintStored() {
      stripCardSoftPills()
      const n = storedCount()
      if (n > 0 || notifyFresh) paintNotify(n)
    }

    function applyNotify(n) {
      const count = Math.max(0, Number(n) || 0)
      notifyFresh = true
      api.store.set('notifyCount', count)
      paintNotify(count)
      api.tabs.post('notify', { count })
    }

    function cardNotifyAnchors(root) {
      return [...root.querySelectorAll('a[href*="tab=notifications"]')].filter((a) => {
        const href = a.getAttribute('href') || ''
        if (/[?&]p=/.test(href)) return false
        if (a.classList.contains('nav-mine') || a.classList.contains('tab')) return false
        return !!(a.closest('.user-card, .user-links, [data-lsb-shell-me]'))
      })
    }

    /** 从个人卡原生红点读数。打开通知页会把未读标掉，所以不能靠 GET 通知页。
     *  哨兵自己补的 / 藏掉的点不算原生：只有它们时返回 null，避免软跳把库存写成 0。 */
    function countNativeNotify(root) {
      const as = cardNotifyAnchors(root)
      if (!as.length) return null
      let max = 0
      let sawNative = false
      let sawOurs = false
      for (const a of as) {
        const els = [...a.querySelectorAll('.notify-badge, .notification-unread, .mobile-nav-unread')].filter(
          (el) => !isKeywordFilterBadge(el),
        )
        for (const el of els) {
          if (el.hasAttribute('data-lsb-notify') || el.hasAttribute('data-lsb-notify-hid')) {
            sawOurs = true
            continue
          }
          sawNative = true
          const raw = (el.textContent || '').trim()
          const n = raw === '9+' ? 10 : parseInt(raw, 10)
          if (Number.isFinite(n) && n > max) max = n
        }
      }
      if (sawNative) return max
      if (sawOurs) return null
      return 0
    }

    function isOwnNotifyPage(page = api.page) {
      if (page?.type !== 'user' || page.tab !== 'notifications') return false
      if (api.me.guest || api.me.uid == null) return false
      return Number(page.id) === Number(api.me.uid)
    }

    function refreshNotifyFromHere() {
      if (isOwnNotifyPage()) {
        applyNotify(0)
        return
      }
      applyNotifyFrom(document)
      paintStored()
    }

    function applyNotifyFrom(root) {
      if (isOwnNotifyPage()) {
        applyNotify(0)
        return
      }
      if (api.me.guest || api.me.uid == null) {
        applyNotify(0)
        return
      }
      const n = countNativeNotify(root)
      if (n == null) return
      applyNotify(n)
    }

    function unreadCount() {
      return inboxGet().filter((x) => x.lastTs > lastOpenTs()).length
    }
    function applyTitle() {
      if (!cfg.badgeInTitle) return
      const n = unreadCount()
      document.title = n > 0 ? `(${n}) ${origTitle}` : origTitle
    }

    api.tabs.on('events', ({ items, drop }) => {
      if (Array.isArray(drop) && drop.length) {
        const dropSet = new Set(drop.map(Number))
        inboxSet(inboxGet().filter((x) => !dropSet.has(Number(x.id))))
      }
      if (items?.length) mergeInbox(items)
      applyTitle()
    })
    api.tabs.on('notify', ({ count }) => {
      if (isOwnNotifyPage()) {
        notifyFresh = true
        api.store.set('notifyCount', 0)
        paintNotify(0)
        return
      }
      notifyFresh = true
      api.store.set('notifyCount', count)
      paintNotify(count)
    })
    api.on('route:changed', () => {
      refreshNotifyFromHere()
    })
    api.dom.each('a[href*="tab=notifications"], a.nav-mine', () => {
      if (isOwnNotifyPage()) applyNotify(0)
      else paintStored()
    })

    /* 红点只抄个人卡原生数字。GET 通知页会被站点当成打开，未读立刻清掉。
     * 人已经进了自己的通知页时，这一轮就清库存，不必等 3 分钟后再抄首页个人卡。 */
    applyTitle()
    refreshNotifyFromHere()

    const election = api.election({
      onPromote: () => cycle(),
      onDemote: () => {
        if (timer) clearTimeout(timer)
        timer = null
        nextAt = null
      },
      jitter: JITTER,
    })

    /* ── 巡检核心 ── */
    async function cycle(force = false) {
      if (inflight || (election.role === 'follower' && !force)) return inflight
      inflight = (async () => {
        try {
          probe.at = Date.now()
          const doc = await api.net.doc('/')
          applyNotifyFrom(doc)
          const parsed = api.parse.list(doc)
          probe.parsed = parsed.length
          const items = parsed.filter((x) => x.id && x.lastActiveTs)
          probe.items = items.length
          probe.seenBefore = Object.keys(seenGet()).length
          const seen = seenGet()
          const fresh = []
          const pinnedIds = new Set()
          for (const it of items) {
            const prev = seen[it.id]
            seen[it.id] = Math.max(prev || 0, it.lastActiveTs)
            if (it.pinned) {
              pinnedIds.add(it.id)
              continue
            }
            if (prev == null || it.lastActiveTs > prev) {
              fresh.push({ id: it.id, title: it.title, lastTs: it.lastActiveTs, replies: it.replies })
            }
          }
          // 容量修剪：保留最近 400 帖的水位线
          const entries = Object.entries(seen).sort((a, b) => b[1] - a[1]).slice(0, 400)
          seenSet(Object.fromEntries(entries))

          if (pinnedIds.size) {
            const kept = inboxGet().filter((x) => !pinnedIds.has(Number(x.id)))
            if (kept.length !== inboxGet().length) {
              inboxSet(kept)
              applyTitle()
            }
          }

          probe.fresh = fresh.length
          if (fresh.length) {
            fresh.sort((a, b) => (b.lastTs || 0) - (a.lastTs || 0))
            mergeInbox(fresh)
            applyTitle()
            if (!force) announce(fresh)
          }
          if (fresh.length || pinnedIds.size) {
            api.tabs.post('events', { items: fresh, drop: [...pinnedIds] })
          }
        } catch (e) {
          lastErr = String((e && e.message) || e); api.log('sentinel 巡检失败', lastErr)
        } finally {
          inflight = null
          if (election.isLeader) scheduleNext()
        }
      })()
      return inflight
    }

    function mergeInbox(items) {
      const inbox = inboxGet()
      for (const it of items) {
        // 入站条目的时间字段是 lastTs（cycle 里就这么组的）；
        // 旧实现读 it.ts → undefined → Math.max 出 NaN，被合并的条目时间戳直接坏掉。
        const ts = it.lastTs ?? it.ts ?? 0
        const exist = inbox.find((x) => x.id === it.id)
        if (exist) {
          exist.lastTs = Math.max(exist.lastTs || 0, ts)
          exist.count = (exist.count || 1) + 1
          exist.title = it.title || exist.title
        } else {
          inbox.unshift({ ...it, lastTs: ts, count: 1, firstTs: Date.now() })
        }
      }
      inbox.sort((a, b) => (b.lastTs || 0) - (a.lastTs || 0))
      inboxSet(inbox)
    }

    function announce(items) {
      const names = items.slice(0, 3).map((x) => x.title).join('、')
      api.ui.toast(`${items.length} 个帖子有新动态：${names}${items.length > 3 ? ' 等' : ''}`, {
        title: '未读哨兵',
        timeout: 5000,
      })
      if (cfg.notifyDesktop && typeof Notification !== 'undefined') {
        try {
          if (Notification.permission === 'granted') {
            new Notification(`linux.sb · ${items.length} 条新动态`, { body: names })
          } else if (Notification.permission === 'default') {
            Notification.requestPermission()
          }
        } catch {
          /* 无通知环境 */
        }
      }
    }

    function scheduleNext() {
      if (timer) clearTimeout(timer)
      nextAt = Date.now() + cfg.intervalMin * 60000
      timer = setTimeout(() => cycle(), cfg.intervalMin * 60000)
      timer.unref?.()
    }
    api.onDispose(() => {
      if (timer) clearTimeout(timer)
      timer = null
      document.title = origTitle // 停用即还原标题，不留角标
      document.querySelectorAll('.lsb-notify-badge').forEach((el) => el.remove())
      document.querySelectorAll('[data-lsb-notify]').forEach((el) => el.remove())
      document.querySelectorAll('[data-lsb-notify-orig]').forEach((el) => {
        el.style.removeProperty('display')
        el.hidden = false
        el.removeAttribute('data-lsb-notify-hid')
        el.textContent = el.getAttribute('data-lsb-notify-orig') || ''
        el.removeAttribute('data-lsb-notify-orig')
      })
    })

    /* ── 面板：消息箱 ── */
    api.ui.tab({
      id: 'unread-sentinel-inbox',
      name: '消息箱',
      order: 63,
      render(host) {
        api.store.set('lastOpenTs', Date.now())
        applyTitle()
        const inbox = inboxGet()
        const head = document.createElement('div')
        head.className = 'lsb-row-desc'
        head.style.marginBottom = '8px'
        head.textContent = `角色：${election.role === 'leader' ? '本标签负责巡检' : election.role === 'follower' ? '由其它标签巡检' : '待定'}${
          nextAt ? ` · 下次检查 ${Math.max(0, Math.round((nextAt - Date.now()) / 1000))}s 后` : ''
        }`
        host.appendChild(head)

        if (!inbox.length) {
          host.insertAdjacentHTML('beforeend', '<div class="lsb-empty">还没有捕获到新动态。</div>')
        } else {
          host.insertAdjacentHTML(
            'beforeend',
            inbox.slice(0, 30)
              .map(
                (x) => `
              <div class="lsb-row">
                <div class="lsb-row-main">
                  <a class="lsb-row-name" href="${api.routes.topic(x.id)}">${api.util.esc(x.title)}</a>
                  <div class="lsb-row-desc">${new Date(x.lastTs * 1000).toLocaleString('zh-CN')} · ${x.count > 1 ? `更新 ${x.count} 次` : '新动态'}</div>
                </div>
                <a class="lsb-btn" href="${api.routes.topic(x.id)}">查看</a>
              </div>`,
              )
              .join(''),
          )
        }
        const clear = document.createElement('button')
        clear.className = 'lsb-btn'
        clear.textContent = '清空消息箱'
        clear.style.marginTop = '10px'
        clear.onclick = async () => {
          if (await api.ui.confirm('清空全部消息？')) {
            inboxSet([])
            applyTitle()
            api.ui.showTab('unread-sentinel-inbox')
          }
        }
        host.appendChild(clear)
      },
    })

    /* ── 启动 ── */
    // 角色由 election 自行决定（单标签抖动后自动上位，多标签靠心跳竞争）

    /* ── 调试接口 ── */
    /* ── 设置页（由 manifest.config 自动生成） ── */
    api.ui.configTab({ name: "哨兵设置", order: 55 })

    api.handle('unread-sentinel:debug', () => ({
      role: () => election.role,
      election: () => election.state(), // id / leaderId / 距上次 leader 心跳，排查跨标签问题用
      lastError: () => lastErr,
      probe: () => probe,
      diag: () => ({ origTitle, badge: !!cfg.badgeInTitle, unread: unreadCount(), inboxLen: inboxGet().length, lastOpen: lastOpenTs(), firstTs: inboxGet()[0] && inboxGet()[0].lastTs, notifyCount: api.store.get('notifyCount', 0) }),
      tick: () => cycle(true), // force 绕过 follower 门禁，测试用
      inbox: inboxGet,
      seen: seenGet,
      setSeenEntry: (id, ts) => {
        const s = seenGet()
        s[id] = ts
        seenSet(s)
      },
      title: () => document.title,
    }))

    return {}
  }

  const w = typeof unsafeWindow !== 'undefined' ? unsafeWindow : window
  if (w.LSB && w.LSB.register) w.LSB.register(manifest, setup)
  else ;(w.LSB_PLUGINS = w.LSB_PLUGINS || []).push({ manifest, setup })
})()


;
/* ══════════════ LSB·机会监控 v1.0.2 (forum-watch) ══════════════ */
/**
 * 未读哨兵的定向版：复用心跳选主思路，但按「版块 × 关键词」过滤，
 * 只把对你有价值的帖子送进「机会箱」。巡检走基座限速队列。
 */
(function () {
  'use strict'

  const manifest = {
    id: 'forum-watch',
    name: '机会监控',
    version: '1.0.2',
    description: '版块新帖关键词命中提醒；多标签选主去重',
    author: 'you',
    requires: { base: '^0.1.0' },
    permissions: ['read', 'storage', 'ui', 'events'],
    config: {
      forums: { type: 'text', label: '监听版块 id（逗号分隔）', default: '5' },
      keywords: { type: 'textarea', label: '关键词（每行一个，不区分大小写）', default: '', rows: 4 },
      intervalMin: { type: 'number', label: '巡检间隔 (分钟)', default: 5 },
      jitterMs: { type: 'number', label: '选主随机延迟 (ms)', default: 1000 },
      notifyDesktop: { type: 'switch', label: '桌面通知', default: false },
      watchRedPacket: { type: 'switch', label: '盯红包（列表标记为活着）', default: false },
      watchVirtualCard: { type: 'switch', label: '盯发卡（列表标记为活着）', default: false },
    },
  }

  function setup(api) {
    let cfg = api.config()
    api.on('config:changed:forum-watch', () => {
      cfg = api.config()
      if (election.isLeader) scheduleNext()
    })
    let timer = null
    let inflight = null // 在途巡检 Promise：并发调用复用同一轮而非静默丢弃
    let lastErr = null
    const probeData = {}
    const JITTER = Number.isFinite(Number(cfg.jitterMs)) ? Math.max(0, Number(cfg.jitterMs)) : 1200

    const forumIds = () =>
      (cfg.forums || '').split(/[,，\s]+/).map(Number).filter((x) => x > 0)
    const keywords = () =>
      (cfg.keywords || '').split(/\n+/).map((s) => s.trim().toLowerCase()).filter(Boolean)

    /* ── 状态 ── */
    const seenGet = () => api.store.get('seen', {}) || {}
    const seenSet = (m) => api.store.set('seen', m)
    const hitsGet = () => api.store.get('hits', []) || []
    function pushHits(items) {
      const arr = [...items, ...hitsGet()].slice(0, 200)
      api.store.set('hits', arr)
    }

    let nextAt = null
    const election = api.election({
      onPromote: () => cycle(),
      onDemote: () => {
        if (timer) clearTimeout(timer)
        timer = null
        nextAt = null
      },
      jitter: JITTER,
    })
    function scheduleNext() {
      if (timer) clearTimeout(timer)
      nextAt = Date.now() + cfg.intervalMin * 60000
      timer = setTimeout(() => cycle(), cfg.intervalMin * 60000)
      timer.unref?.()
    }
    api.onDispose(() => {
      if (timer) clearTimeout(timer)
      timer = null
    })

    /* ── 巡检 ── */
    async function cycle(force = false) {
      if (inflight || (election.role === 'follower' && !force)) return inflight
      inflight = (async () => {
        try {
          const kws = keywords()
          const watchingMarks = !!(cfg.watchRedPacket || cfg.watchVirtualCard)
          if (!kws.length && !watchingMarks) return
          // 整轮共用一份 seen 快照，循环末尾统一落盘：
          // 旧实现每个版块都 get/set 一次全量对象，版块多时白白多几轮序列化。
          const seen = seenGet()
          let dirty = false
          for (const fid of forumIds()) {
            const doc = await api.net.doc(api.routes.forum(fid, { sort: 'post' }))
            probeData.fetches = (probeData.fetches || 0) + 1
            const items = api.parse.list(doc)
            probeData.lastItems = items.length
            probeData.lastTitles = items.slice(0, 3).map((x) => x.title)
            const per = seen[fid] || {}
            const fresh = []
            for (const it of items) {
              if (per[it.id]) continue
              per[it.id] = it.lastActiveTs || Date.now()
              const reasons = []
              const kw = kws.find((k) => String(it.title).toLowerCase().includes(k))
              if (kw) reasons.push(kw)
              if (cfg.watchRedPacket && it.marks?.redPacket === 'live') reasons.push('红包')
              if (cfg.watchVirtualCard && it.marks?.virtualCard === 'live') reasons.push('发卡')
              if (reasons.length) {
                fresh.push({
                  tid: it.id,
                  title: it.title,
                  forumId: fid,
                  reasons,
                  kw: reasons.join(' · '),
                  author: it.authorName,
                  ts: Date.now(),
                })
              }
            }
            // 每个版块只留最近 400 帖水位线
            const keys = Object.keys(per).sort((a, b) => per[b] - per[a]).slice(0, 400)
            seen[fid] = Object.fromEntries(keys.map((k) => [k, per[k]]))
            dirty = true

            probeData.lastFresh = fresh.length
            if (fresh.length) {
              pushHits(fresh)
              announce(fresh)
            }
          }
          if (dirty) seenSet(seen)
        } catch (e) {
          lastErr = String((e && e.message) || e)
          api.log('机会监控巡检失败', lastErr)
        } finally {
          inflight = null
          if (election.isLeader) scheduleNext()
        }
      })()
      return inflight
    }

    function announce(items) {
      const first = items[0]
      api.ui.toast(
        `${first.title}${items.length > 1 ? ` 等 ${items.length} 条` : ''}`,
        { title: `🎯 命中「${first.kw}」`, timeout: 6000 },
      )
      if (cfg.notifyDesktop && typeof Notification !== 'undefined') {
        try {
          if (Notification.permission === 'granted') {
            new Notification('linux.sb · 机会命中', { body: first.title })
          } else if (Notification.permission === 'default') {
            Notification.requestPermission()
          }
        } catch {
          /* 无通知环境 */
        }
      }
    }

    // （已由 election 自动处理单标签上位）

    /* ── 面板：机会箱 + 配置 ── */
    api.ui.configTab({
      name: '机会监控',
      order: 66,
      render(host) {
        const hits = hitsGet()
        const head = document.createElement('div')
        head.className = 'lsb-row-desc'
        head.style.margin = '10px 0 6px'
        head.textContent =
          `角色：${election.role === 'leader' ? '本标签巡检中' : election.role === 'follower' ? '由其它标签巡检' : '待定'}` +
          `${lastErr ? ' · 最近错误：' + lastErr : ''}`
        host.appendChild(head)

        if (!hits.length) {
          host.insertAdjacentHTML('beforeend', '<div class="lsb-empty">还没有命中记录。</div>')
        } else {
          host.insertAdjacentHTML(
            'beforeend',
            hits.slice(0, 30)
              .map(
                (h) => `
              <div class="lsb-row">
                <div class="lsb-row-main">
                  <a class="lsb-row-name" href="${api.routes.topic(h.tid)}">${api.util.esc(h.title)}</a>
                  <div class="lsb-row-desc">命中「${api.util.esc(h.kw)}」 · ${h.author ? api.util.esc(h.author) + ' · ' : ''}${new Date(h.ts).toLocaleString('zh-CN')}</div>
                </div>
                <a class="lsb-btn" href="${api.routes.topic(h.tid)}">查看</a>
              </div>`,
              )
              .join(''),
          )
        }
        const bar = document.createElement('div')
        bar.style.cssText = 'display:flex;gap:8px;margin-top:10px'
        const test = document.createElement('button')
        test.className = 'lsb-btn'
        test.textContent = '立即巡检'
        test.onclick = () => cycle(true).then(() => api.ui.showTab('forum-watch'))
        const clear = document.createElement('button')
        clear.className = 'lsb-btn'
        clear.textContent = '清空命中'
        clear.onclick = async () => {
          if (await api.ui.confirm('清空全部命中记录？')) {
            api.store.set('hits', [])
            api.ui.showTab('forum-watch')
          }
        }
        bar.append(test, clear)
        host.appendChild(bar)
      },
    })

    /* ── 调试接口 ── */
    api.handle('forum-watch:debug', () => ({
      role: () => election.role,
      election: () => election.state(),
      tick: () => cycle(true),
      lastError: () => lastErr,
      hits: hitsGet,
      forget: (tid) => {
        const m = seenGet()
        for (const fid of Object.keys(m)) {
          if (m[fid] && typeof m[fid] === 'object') delete m[fid][tid]
        }
        seenSet(m)
      },
      probe: () => ({
        forums: forumIds(),
        kws: keywords(),
        watchRedPacket: !!cfg.watchRedPacket,
        watchVirtualCard: !!cfg.watchVirtualCard,
        ...probeData,
      }),
    }))

    return {}
  }

  const w = typeof unsafeWindow !== 'undefined' ? unsafeWindow : window
  if (w.LSB && w.LSB.register) w.LSB.register(manifest, setup)
  else {
    w.LSB_PLUGINS = w.LSB_PLUGINS || []
    w.LSB_PLUGINS.push({ manifest, setup })
  }
})()


;
/* ══════════════ LSB·签到日历 v1.0.4 (checkin-calendar) ══════════════ */
/**
 * 说明：
 *  - 每天首次浏览时访问 /daily_checkin 探测状态（已签/未签），写入本地日历；
 *  - 「立即签到」会解析该页的签到表单并代表你提交（提交前有确认弹窗）；
 *  - 原生不支持补签，本插件同样只记录、不伪造历史。
 */
(function () {
  'use strict'

  const manifest = {
    id: 'checkin-calendar',
    name: '签到日历',
    version: '1.0.4',
    description: '签到状态日历 + 连击统计 + 一键签今天',
    author: 'you',
    requires: { base: '^0.1.0' },
    // write：一键签到是代表用户提交表单的写操作（POST /daily_checkin）。
    // 基座已把「站内非幂等请求」纳入 write 权限门，此处如实声明。
    permissions: ['read', 'storage', 'ui', 'events', 'write'],
    config: {
      remind: { type: 'switch', label: '未签到时提醒', default: true },
      harvest: { type: 'switch', label: '从签到页收割历史日期', default: true },
      autoProbe: { type: 'switch', label: '每天首次浏览自动探测', default: true },
    },
  }

  function setup(api) {
    let cfg = api.config()
    api.on('config:changed:checkin-calendar', () => {
      cfg = api.config()
    })

    function dkey(d) {
      const x = d || new Date()
      const p = (n) => String(n).padStart(2, '0')
      return x.getFullYear() + '-' + p(x.getMonth() + 1) + '-' + p(x.getDate())
    }
    const today = () => dkey(new Date())

    const recsGet = () => api.store.get('recs', {}) || {}
    function setDay(key, s) {
      const r = recsGet()
      r[key] = { s, t: Date.now() }
      api.store.set('recs', r)
    }

    /* ── 状态探测 ── */
    let status = null // ok | open | unknown
    let formInfo = null // {action, fields:[{name,value}]}

    function detect(doc) {
      const txt = doc.body ? doc.body.textContent : ''
      if (/已签到|今日已签|明日再来/.test(txt)) return 'ok'
      const f = [...doc.querySelectorAll('form')].find((f) =>
        /checkin/i.test(f.getAttribute('action') || ''),
      )
      if (f) {
        formInfo = {
          action: f.getAttribute('action') || '/daily_checkin',
          fields: [...f.querySelectorAll('input[name]')].map((i) => ({
            name: i.getAttribute('name'),
            value: i.value,
          })),
        }
        return 'open'
      }
      return 'unknown'
    }

    /** 从页面文本里收割历史签到日期（通用正则，不依赖具体 DOM） */
    function harvestHistory(doc) {
      const txt = doc.body ? doc.body.textContent : ''
      const found = []
      const seen = new Set()
      for (const m of txt.matchAll(/(20\d{2})-(\d{2})-(\d{2})/g)) {
        const key = m[1] + '-' + m[2] + '-' + m[3]
        const t = new Date(key + 'T12:00:00').getTime()
        if (Number.isNaN(t) || t > Date.now()) continue
        if (Date.now() - t > 366 * 864e5) continue
        if (key === today() || seen.has(key)) continue
        seen.add(key)
        found.push(key)
      }
      return found
    }
    async function probe(force = false) {
      if (!force && status) return status
      const doc = await api.net.doc('/daily_checkin')
      status = detect(doc)
      setDay(today(), status)
      if (cfg.harvest !== false && cfg.harvest) {
        for (const k of harvestHistory(doc)) setDay(k, 'ok')
      }
      if (status === 'open' && cfg.remind) {
        api.ui.toast('今天还没签到', { title: '签到日历' })
      }
      return status
    }

    // 每天首次浏览自动探测一次
    if (cfg.autoProbe && api.store.get('probedDay', '') !== today()) {
      probe()
        .then(() => api.store.set('probedDay', today()))
        .catch(() => {})
    }

    /* ── 一键签今天 ── */
    async function doCheckin(skipConfirm = false, { detailed = false } = {}) {
      if (!skipConfirm && !(await api.ui.confirm('提交今天的签到？'))) return false
      if (!formInfo) await probe(true)
      if (status === 'ok' || /已签到|今日已签/.test(document.body?.textContent || '')) {
        setDay(today(), 'ok')
        api.ui.toast('今天已经签过啦', { title: '签到日历' })
        return { done: false, reason: 'already-signed' }
      }
      if (!formInfo) throw new Error('未找到签到表单（页面结构可能变化）')
      const fd = new FormData()
      for (const f of formInfo.fields) fd.append(f.name, f.value)
      let res
      try {
        res = await api.net.raw(formInfo.action, {
          method: 'POST',
          body: fd,
          headers: { 'x-requested-with': 'XMLHttpRequest' },
        })
      } catch {
        const result = { done: false, reason: 'unknown', outcome: 'unknown', status: 0, message: '签到请求未收到可判定结果' }
        api.ui.toast('签到结果未知，请检查站点状态', { type: 'error' })
        return result
      }
      const outcome = api.net.classifyWrite(res, { actionPath: formInfo.action })
      if (outcome.outcome !== 'success') {
        const result = {
          done: false,
          reason: outcome.outcome === 'failure' ? `http-${outcome.status || 'error'}` : 'unknown',
          outcome: outcome.outcome,
          status: outcome.status,
          ...(outcome.message ? { message: outcome.message } : {}),
        }
        api.ui.toast('签到失败 HTTP ' + res.status, { type: 'error' })
        return result
      }
      status = 'ok'
      setDay(today(), 'ok')
      api.ui.toast('签到完成', { type: 'success' })
      return detailed ? { done: true, outcome: 'success', status: outcome.status, ...(outcome.message ? { message: outcome.message } : {}) } : true
    }

    /* ── 连击统计 ── */
    function streak() {
      const r = recsGet()
      let n = 0
      const d = new Date()
      if (r[dkey(d)]?.s !== 'ok') d.setDate(d.getDate() - 1) // 今天还没签则从昨天起算
      while (r[dkey(d)]?.s === 'ok') {
        n++
        d.setDate(d.getDate() - 1)
      }
      return n
    }
    function monthCount(offset = 0) {
      const now = new Date()
      const m = new Date(now.getFullYear(), now.getMonth() + offset, 1)
      const pre = dkey(m).slice(0, 7)
      const r = recsGet()
      return Object.keys(r).filter((k) => k.startsWith(pre) && r[k].s === 'ok').length
    }

    /* ── 面板：月历 ── */
    let viewOffset = 0
    api.ui.tab({
      name: '签到日历',
      order: 64,
      render(host) {
        const base = new Date()
        const view = new Date(base.getFullYear(), base.getMonth() + viewOffset, 1)
        const ym = dkey(view).slice(0, 7)
        const firstDow = new Date(view.getFullYear(), view.getMonth(), 1).getDay()
        const daysIn = new Date(view.getFullYear(), view.getMonth() + 1, 0).getDate()
        const r = recsGet()

        let cells = ''
        for (let i = 0; i < firstDow; i++) cells += '<span class="lsb-cal-cell is-empty"></span>'
        for (let d = 1; d <= daysIn; d++) {
          const key = ym + '-' + String(d).padStart(2, '0')
          const st = r[key]?.s
          const cls = st === 'ok' ? ' is-ok' : st === 'open' ? ' is-miss' : ' is-none'
          cells += `<span class="lsb-cal-cell${cls}" title="${key}">${d}</span>`
        }

        host.innerHTML = `
          <div class="lsb-cal-head">
            <button class="lsb-btn" data-prev>‹</button>
            <strong>${ym}</strong>
            <button class="lsb-btn" data-next>›</button>
            <span class="lsb-row-desc" style="margin-left:auto">
              本月 ${monthCount(viewOffset)} 天 · 连击 ${streak()} 天 · 今日：${
                r[today()]?.s === 'ok' ? '已签' : r[today()]?.s === 'open' ? '未签' : '未知'
              }</span>
          </div>
          <div class="lsb-cal-grid">
            ${['日', '一', '二', '三', '四', '五', '六'].map((x) => `<span class="lsb-cal-dow">${x}</span>`).join('')}
            ${cells}
          </div>
          <div class="lsb-actions" style="border:0;padding:10px 0 0">
            <button class="lsb-btn" data-probe>重新探测</button>
            <button class="lsb-btn is-primary" data-go>${
              r[today()]?.s === 'ok' ? '今日已签' : '立即签到'
            }</button>
          </div>`

        host.querySelector('[data-prev]').onclick = () => {
          viewOffset--
          host.innerHTML = ''
          thisRender()
        }
        host.querySelector('[data-next]').onclick = () => {
          viewOffset++
          host.innerHTML = ''
          thisRender()
        }
        host.querySelector('[data-probe]').onclick = () =>
          probe(true).then(() => {
            host.innerHTML = ''
            thisRender()
          })
        const go = host.querySelector('[data-go]')
        go.disabled = r[today()]?.s === 'ok'
        go.onclick = () =>
          doCheckin().then(() => {
            host.innerHTML = ''
            thisRender()
          }).catch((e) => api.ui.toast(e.message, { type: 'error' }))
      },
    })
    function thisRender() {
      api.ui.showTab('checkin-calendar')
    }

    api.ui.style(`
      .lsb-cal-head{display:flex;align-items:center;gap:8px;margin-bottom:8px}
      .lsb-cal-grid{display:grid;grid-template-columns:repeat(7,34px);gap:4px}
      .lsb-cal-dow{font-size:11px;color:var(--text-muted,#888);text-align:center}
      .lsb-cal-cell{height:30px;display:flex;align-items:center;justify-content:center;
        border-radius:6px;font-size:12px;background:var(--bg,#f5f5f5);color:var(--text,#222)}
      .lsb-cal-cell.is-empty{background:transparent}
      .lsb-cal-cell.is-ok{background:var(--brand,#5eaaa0);color:#fff;font-weight:600}
      .lsb-cal-cell.is-miss{background:var(--warning-soft,#fff3d6);color:var(--warning,#b8860b)}
      .lsb-cal-cell.is-none{opacity:.45}
    `)

    /* ── 调试接口 ── */
    api.handle('checkin-calendar:debug', () => ({
      probe,
      doCheckin: () => doCheckin(true),
      status: () => status,
      setDay,
      recs: recsGet,
      streak,
      form: () => formInfo,
    }))

    api.handle('checkin-calendar:ai-checkin', async () => {
      if (!formInfo) await probe(true)
      const csrf = formInfo?.fields?.filter((field) => field.name === '_csrf') || []
      let action
      try {
        action = new URL(formInfo?.action || '', location.href)
      } catch {
        throw new Error('签到表单地址无效，已停止提交')
      }
      if (action.origin !== location.origin || !/checkin/i.test(action.pathname) || csrf.length !== 1 || !String(csrf[0].value || '').trim()) {
        throw new Error('签到表单或 CSRF 校验失败，已停止提交')
      }
      return doCheckin(false, { detailed: true })
    })

    return {}
  }

  const w = typeof unsafeWindow !== 'undefined' ? unsafeWindow : window
  if (w.LSB && w.LSB.register) w.LSB.register(manifest, setup)
  else {
    w.LSB_PLUGINS = w.LSB_PLUGINS || []
    w.LSB_PLUGINS.push({ manifest, setup })
  }
})()


;
/* ══════════════ LSB·积分趋势 v1.0.2 (points-ledger) ══════════════ */
/**
 * 数据源：侧栏用户卡的「积分 xxxx」（site.js 的 me.points，选择器稳定）。
 * 快照序列 → 折线图 + 相邻差值（每日净变化）。明细归因（哪帖赚的）留给后续版本。
 */
(function () {
  'use strict'

  const manifest = {
    id: 'points-ledger',
    name: '积分趋势',
    version: '1.0.2',
    description: '积分余额快照时间序列 → 趋势折线 + 每日增减',
    author: 'you',
    requires: { base: '^0.1.0' },
    permissions: ['read', 'storage', 'ui', 'events'],
    config: {
      intervalHours: { type: 'number', label: '自动快照间隔 (小时)', default: 6 },
      keepDays: { type: 'number', label: '保留天数', default: 365 },
    },
  }

  function setup(api) {
    let cfg = api.config()
    api.on('config:changed:points-ledger', () => {
      cfg = api.config()
      arm()
    })
    let timer = null
    function arm() {
      if (timer) {
        clearInterval(timer)
        timer = null
      }
      const hours = Number(cfg.intervalHours)
      if (!(hours > 0)) return
      const ms = Math.max(250, hours * 3600e3)
      timer = setInterval(() => autoSnap().catch(() => {}), ms)
      timer.unref?.()
    }
    let rangeDays = 90 // 面板查看范围

    const get = () => api.store.get('series', []) || []
    const set = (a) => api.store.set('series', a)

    function pushSnap(ts, points) {
      if (points == null) return false
      const arr = get()
      const last = arr[arr.length - 1]
      if (last && last.p === points && ts - last.t < 3600e3 * 12) {
        last.t = Math.max(last.t, ts) // 同值 12h 内视为同一状态，只推进时间
        set(arr)
        return false
      }
      arr.push({ t: ts, p: points })
      const deadline = Date.now() - cfg.keepDays * 864e5
      set(arr.filter((x) => x.t >= deadline))
      return true
    }

    async function autoSnap(force = false) {
      if (api.me.uid == null) return false
      const arr = get()
      const last = arr[arr.length - 1]
      const due = !last || Date.now() - last.t >= cfg.intervalHours * 3600e3
      if (!due && !force) return false
      return pushSnap(Date.now(), api.me.points)
    }
    autoSnap().catch(() => {})
    arm()
    api.onDispose(() => {
      if (timer) clearInterval(timer)
      timer = null
    })

    /* ── SVG 图表 ── */
    function chart(series) {
      if (series.length < 2) {
        return '<div class="lsb-empty">至少两次快照后开始绘制（当前 ' + series.length + ' 次）。</div>'
      }
      const W = 620
      const H = 170
      const P = { l: 46, r: 12, t: 12, b: 22 }
      const ps = series.map((x) => x.p)
      const min = Math.min(...ps)
      const max = Math.max(...ps)
      const span = max - min || 1
      const X = (i) => P.l + (i / (series.length - 1)) * (W - P.l - P.r)
      const Y = (v) => P.t + (1 - (v - min) / span) * (H - P.t - P.b)
      const pts = series.map((s, i) => `${X(i).toFixed(1)},${Y(s.p).toFixed(1)}`).join(' ')
      const area = `${P.l},${H - P.b} ${pts} ${X(series.length - 1).toFixed(1)},${H - P.b}`
      const deltas = []
      for (let i = 1; i < series.length; i++) {
        const d = series[i].p - series[i - 1].p
        if (d !== 0) deltas.push({ t: series[i].t, d })
      }
      const recent = deltas.slice(-5).reverse()
      return `
        <svg class="lsb-svg" viewBox="0 0 ${W} ${H}" preserveAspectRatio="xMidYMid meet" role="img" style="aspect-ratio:${W}/${H}">
          <rect x="${P.l}" y="${P.t}" width="${W - P.l - P.r}" height="${H - P.t - P.b}" fill="none" stroke="var(--line-soft,#eee)"></rect>
          <polygon points="${area}" fill="var(--brand-soft,#e8f4f2)"></polygon>
          <polyline points="${pts}" fill="none" stroke="var(--brand,#5eaaa0)" stroke-width="2"></polyline>
          ${series
            .map((s, i) => `<circle cx="${X(i).toFixed(1)}" cy="${Y(s.p).toFixed(1)}" r="2.5" fill="var(--brand,#5eaaa0)"></circle>`)
            .join('')}
          <text x="${P.l - 6}" y="${Y(max) + 4}" text-anchor="end" font-size="11" fill="var(--text-muted,#888)">${max}</text>
          <text x="${P.l - 6}" y="${Y(min) + 4}" text-anchor="end" font-size="11" fill="var(--text-muted,#888)">${min}</text>
          <text x="${W - P.r}" y="${H - 6}" text-anchor="end" font-size="11" fill="var(--text-muted,#888)">
            ${new Date(series[series.length - 1].t).toLocaleDateString('zh-CN')} · ${series[series.length - 1].p}</text>
          <text x="${P.l}" y="${H - 6}" font-size="11" fill="var(--text-muted,#888)">${new Date(series[0].t).toLocaleDateString('zh-CN')}</text>
        </svg>
        <div class="lsb-row-desc" style="margin-top:6px">最近变化：</div>
        ${
          recent.length
            ? recent
                .map(
                  (d) =>
                    `<div class="lsb-row"><span>${new Date(d.t).toLocaleString('zh-CN')}</span>` +
                    `<strong style="margin-left:auto;color:${d.d > 0 ? 'var(--success,#3aa08f)' : 'var(--danger,#d55)'}">${d.d > 0 ? '+' : ''}${d.d}</strong></div>`,
                )
                .join('')
            : '<div class="lsb-empty">暂无变化记录。</div>'
        }`
    }

    api.ui.style(
      '.lsb-chart-host{min-width:0;width:100%;overflow:hidden}' +
        '.lsb-svg{display:block;width:100%;height:auto;max-width:100%}',
    )

    /* ── 对外 RPC（给未来的年度报告/Dashboard 用） ── */
    api.handle('points-ledger:series', ({ days = 90 } = {}) => {
      const cutoff = Date.now() - days * 864e5
      return get().filter((x) => x.t >= cutoff)
    })

    /* ── 调试接口 ── */
    api.handle('points-ledger:debug', () => ({
      series: get,
      reset: () => set([]),
      snap: () => autoSnap(true),
      add: (t, p) => pushSnap(t, p),
      armed: () => !!timer,
    }))

    return {}
  }

  const w = typeof unsafeWindow !== 'undefined' ? unsafeWindow : window
  if (w.LSB && w.LSB.register) w.LSB.register(manifest, setup)
  else {
    w.LSB_PLUGINS = w.LSB_PLUGINS || []
    w.LSB_PLUGINS.push({ manifest, setup })
  }
})()


;
/* ══════════════ LSB·称号行情 v1.0.19 (title-quotes) ══════════════ */
/**
 * 数据源：/gacha_market 在售卡片。站点按页展示（约 24 条/页），必须跟分页把挂单收全；
 * 只拉每个筛选的第一页会丢掉中间价，巡检高低价就会和交易页对不上。
 * 成交记录双方可见，不用。选择器只写在本文件。
 */
(function () {
  'use strict'

  const manifest = {
    id: 'title-quotes',
    name: '称号行情',
    version: '1.0.19',
    description: '采集称号交易挂单行情并提供交易页内嵌分析；工作台通过正式 RPC 读取市场快照',
    author: 'you',
    requires: { base: '^0.1.0' },
    permissions: ['read', 'storage', 'ui', 'events'],
    config: {
      intervalSec: { type: 'number', label: '巡检间隔 (秒)', default: 30 },
      keepDays: { type: 'number', label: '保留天数', default: 90 },
    },
  }

  const MERGE_MS = 12 * 3600e3
  const MOVER_TOP = 10
  const FORCE_DEBOUNCE_MS = 5000
  const WATCH_MS = 10000
  const WATCH_TTL_MS = 15000
  const WATCH_BEAT_MS = 5000
  const MAX_PAGES = 40
  const ROLES = [
    { id: 'hi', label: '最高', color: 'var(--danger,#d55)' },
    { id: 'midHi', label: '中位偏上', color: 'var(--warning,#c90)' },
    { id: 'midLo', label: '中位偏下', color: 'var(--brand,#5eaaa0)' },
    { id: 'lo', label: '最低', color: 'var(--success,#3aa08f)' },
  ]
  const TITLE_LINES = [
    { id: 'hi', label: '最高', color: 'var(--danger,#d55)' },
    { id: 'lo', label: '最低', color: 'var(--success,#3aa08f)' },
  ]

  function titleKey(name, rarity) {
    return `${name}@${rarity}`
  }
  function splitKey(k) {
    const i = String(k).lastIndexOf('@')
    if (i < 0) return { name: k, rarity: '' }
    return { name: k.slice(0, i), rarity: k.slice(i + 1) }
  }
  function median(nums) {
    const a = (nums || []).slice().sort((x, y) => x - y)
    if (!a.length) return 0
    const lo = Math.floor((a.length - 1) / 2)
    const hi = Math.ceil((a.length - 1) / 2)
    if (lo === hi) return a[lo]
    return Math.round((a[lo] + a[hi]) / 2)
  }
  function parseCards(src) {
    let root = src
    if (typeof src === 'string') {
      root = new DOMParser().parseFromString(src, 'text/html')
    } else if (!src || !src.querySelectorAll) {
      root = document
    }
    const out = []
    for (const el of root.querySelectorAll('.gacha-market-card')) {
      const name = (el.querySelector('.gacha-title-name')?.textContent || '').trim()
      const rarity = (el.querySelector('.gacha-title-rarity')?.textContent || '').trim()
      const form = el.querySelector('[data-gacha-market-price]')
      const price = Number(form?.getAttribute('data-gacha-market-price'))
      const id = (el.querySelector('input[name="listing_id"]')?.value || '').trim()
      if (!name || !Number.isFinite(price)) continue
      const meta = el.querySelector('.gacha-market-meta')?.textContent || ''
      const qtyMatch = meta.match(/剩余\s*(\d+)\s*个/)
      const maxQty = Number(el.querySelector('input[name="quantity"]')?.getAttribute('max'))
      const qty = qtyMatch ? Number(qtyMatch[1]) : maxQty > 0 ? maxQty : 1
      out.push({
        id: id || `${name}@${rarity}@${price}@${out.length}`,
        name,
        rarity,
        price,
        qty: qty > 0 ? qty : 1,
      })
    }
    return out
  }
  function parsePageCount(src) {
    let root = src
    if (typeof src === 'string') {
      root = new DOMParser().parseFromString(src, 'text/html')
    } else if (!src || !src.querySelectorAll) {
      root = document
    }
    let max = 1
    for (const a of root.querySelectorAll('a[href]')) {
      const m = (a.getAttribute('href') || '').match(/[?&]p=(\d+)/)
      if (m) max = Math.max(max, Number(m[1]))
    }
    return Math.min(MAX_PAGES, Math.max(1, max))
  }
  function mergeListings(lists) {
    const seen = new Set()
    const out = []
    for (const arr of lists || []) {
      for (const x of arr || []) {
        if (x.id && seen.has(x.id)) continue
        if (x.id) seen.add(x.id)
        out.push(x)
      }
    }
    return out
  }
  function foldTitles(listings) {
    const bag = {}
    for (const x of listings || []) {
      const k = titleKey(x.name, x.rarity)
      if (!bag[k]) bag[k] = { name: x.name, rarity: x.rarity, prices: [], n: 0 }
      bag[k].prices.push(x.price)
      bag[k].n += Number(x.qty) > 0 ? Number(x.qty) : 1
    }
    const titles = {}
    for (const [k, v] of Object.entries(bag)) {
      titles[k] = { rarity: v.rarity, lo: Math.min(...v.prices), hi: Math.max(...v.prices), mid: median(v.prices), n: v.n }
    }
    return titles
  }

  const BOOK_STALE_MS = 3 * 3600e3

  function bookFromListings(listings) {
    const rows = {}
    for (const x of listings || []) {
      if (!x || !x.id) continue
      const qty = Number(x.qty) > 0 ? Number(x.qty) : 1
      rows[String(x.id)] = { key: titleKey(x.name, x.rarity), qty }
    }
    return rows
  }

  function diffBook(prevRows, listings) {
    const curr = bookFromListings(listings)
    const prev = prevRows || {}
    const out = {}
    const add = (key, sold, fills) => {
      if (!key || (!(sold > 0) && !(fills > 0))) return
      if (!out[key]) out[key] = { sold: 0, fills: 0 }
      out[key].sold += sold
      out[key].fills += fills
    }
    for (const [id, row] of Object.entries(prev)) {
      const now = curr[id]
      if (!now) {
        add(row.key, Number(row.qty) > 0 ? Number(row.qty) : 0, 1)
        continue
      }
      const before = Number(row.qty) > 0 ? Number(row.qty) : 0
      const after = Number(now.qty) > 0 ? Number(now.qty) : 0
      if (after < before) add(now.key || row.key, before - after, 1)
    }
    return out
  }

  function estimateFlow(prevBook, listings, now = Date.now()) {
    if (!prevBook || !prevBook.rows || !Number.isFinite(prevBook.t)) return {}
    if (now - prevBook.t > BOOK_STALE_MS) return {}
    return diffBook(prevBook.rows, listings)
  }

  function flowTraded(flow) {
    return Object.values(flow || {}).some((d) => Number(d?.sold) > 0 || Number(d?.fills) > 0)
  }

  function sumFlow(series, key, { rangeDays = 7, now = Date.now() } = {}) {
    const cutoff = rangeCutoff(rangeDays, now)
    let sold = 0
    let fills = 0
    for (const s of series || []) {
      if (!s || s.t < cutoff) continue
      const d = (s.flow && s.flow[key]) || (s.titles && s.titles[key])
      if (!d) continue
      const ds = Number(d.sold)
      const df = Number(d.fills)
      if (ds > 0) sold += ds
      if (df > 0) fills += df
    }
    return { sold, fills }
  }

  function pickAnchors(listings, titles) {
    if (!listings || !listings.length) return []
    let hiL = listings[0]
    let loL = listings[0]
    for (const L of listings) {
      if (L.price > hiL.price) hiL = L
      if (L.price < loL.price) loL = L
    }
    const used = new Set([titleKey(hiL.name, hiL.rarity), titleKey(loL.name, loL.rarity)])
    const anchors = [{ role: 'hi', name: hiL.name, rarity: hiL.rarity, price: hiL.price }]
    const S = Object.entries(titles || {})
      .filter(([k]) => !used.has(k))
      .map(([k, v]) => ({ key: k, name: splitKey(k).name, ...v }))
      .sort((a, b) => a.mid - b.mid || a.name.localeCompare(b.name, 'zh-CN'))
    const n = S.length
    if (n === 1) {
      anchors.push({ role: 'midLo', name: S[0].name, rarity: S[0].rarity, price: S[0].mid })
    } else if (n >= 2) {
      let iLo = Math.floor((n - 1) / 2)
      let iHi = Math.ceil((n - 1) / 2)
      if (iLo === iHi) iHi = iHi + 1 < n ? iHi + 1 : null
      anchors.push({ role: 'midLo', name: S[iLo].name, rarity: S[iLo].rarity, price: S[iLo].mid })
      if (iHi != null) {
        anchors.push({ role: 'midHi', name: S[iHi].name, rarity: S[iHi].rarity, price: S[iHi].mid })
      }
    }
    anchors.push({ role: 'lo', name: loL.name, rarity: loL.rarity, price: loL.price })
    return anchors
  }
  function snapSig(s) {
    const a = (s.anchors || [])
      .map((x) => [x.role, x.name, x.rarity, x.price].join('|'))
      .sort()
      .join(';')
    const t = Object.keys(s.titles || {})
      .sort()
      .map((k) => {
        const v = s.titles[k]
        return `${k}:${v.lo}/${v.hi}/${v.mid}/${v.n ?? ''}`
      })
      .join(';')
    return a + '#' + t
  }

  function rangeCutoff(rangeDays, now = Date.now()) {
    const d = Number(rangeDays)
    if (d === 0) {
      const start = new Date(now)
      start.setHours(0, 0, 0, 0)
      return start.getTime()
    }
    const days = Number.isFinite(d) && d > 0 ? d : 7
    return now - days * 864e5
  }

  function periodMs(rangeDays, barMin) {
    const d = Number(rangeDays)
    if (d === 0) {
      const m = Number(barMin)
      if (m === 1 || m === 5 || m === 15 || m === 30 || m === 60) return m * 60e3
      return 30 * 60e3
    }
    if (!Number.isFinite(d) || d < 0) return 4 * 3600e3
    if (d <= 7) return 4 * 3600e3
    if (d <= 30) return 864e5
    return 3 * 864e5
  }

  function foldCandles(series, key, { rangeDays = 7, now = Date.now(), barMin } = {}) {
    const period = periodMs(rangeDays, barMin)
    const cutoff = rangeCutoff(rangeDays, now)
    const raw = series || []
    const inRange = raw.filter((s) => s.t >= cutoff)
    const snaps = (inRange.length ? inRange : rangeDays === 0 ? [] : raw).slice().sort((a, b) => a.t - b.t)
    const points = snaps.map((s) => ({
      t: s.t,
      q: s.titles && s.titles[key] ? s.titles[key] : null,
    }))
    const firstWith = points.find((p) => p.q)
    if (!firstWith) return []
    const start = Math.floor(firstWith.t / period) * period
    const end = Math.floor(now / period) * period + period
    const bars = []
    let prevC = null
    for (let b = start; b < end; b += period) {
      const quotes = points.filter((p) => p.t >= b && p.t < b + period && p.q).map((p) => p.q)
      if (!quotes.length) continue
      const mids = quotes.map((q) => q.mid)
      const c = mids[mids.length - 1]
      const o = prevC == null ? mids[0] : prevC
      bars.push({
        t: b,
        o,
        h: Math.max(o, ...mids),
        l: Math.min(o, ...mids),
        c,
      })
      prevC = c
    }
    return bars
  }

  function mean(nums) {
    const a = (nums || []).filter((n) => Number.isFinite(n))
    if (!a.length) return null
    return a.reduce((s, x) => s + x, 0) / a.length
  }

  function snapshotIndex(titles) {
    const buckets = {}
    const all = []
    for (const v of Object.values(titles || {})) {
      if (!v || !Number.isFinite(v.mid)) continue
      const r = typeof v.rarity === 'string' ? v.rarity : ''
      if (!buckets[r]) buckets[r] = []
      buckets[r].push(v.mid)
      all.push(v.mid)
    }
    const byRarity = {}
    for (const [r, mids] of Object.entries(buckets)) {
      byRarity[r] = { mean: mean(mids), n: mids.length }
    }
    return { overall: mean(all), byRarity }
  }

  function indexPoints(series, rarity) {
    const out = []
    for (const s of series || []) {
      const idx = snapshotIndex(s.titles || {})
      const mid = rarity === null ? idx.overall : idx.byRarity[rarity]?.mean
      if (Number.isFinite(mid)) out.push({ t: s.t, mid })
    }
    return out
  }

  function foldIndexCandles(points, opts) {
    const key = '__idx'
    const series = (points || [])
      .filter((p) => p && Number.isFinite(p.t) && Number.isFinite(p.mid))
      .map((p) => ({ t: p.t, titles: { [key]: { mid: p.mid } } }))
    return foldCandles(series, key, opts)
  }

  function sma(values, n) {
    const out = []
    const k = Number(n)
    for (let i = 0; i < (values || []).length; i++) {
      if (!Number.isFinite(k) || k < 1 || i + 1 < k) {
        out[i] = null
        continue
      }
      out[i] = mean(values.slice(i + 1 - k, i + 1))
    }
    return out
  }

  function stdevPop(values) {
    const a = (values || []).filter((n) => Number.isFinite(n))
    if (!a.length) return null
    const m = mean(a)
    let s = 0
    for (const x of a) s += (x - m) * (x - m)
    return Math.sqrt(s / a.length)
  }

  function bollinger(closes, n = 20, k = 2) {
    const mid = sma(closes, n)
    const upper = []
    const lower = []
    const kk = Number(k)
    for (let i = 0; i < (closes || []).length; i++) {
      if (mid[i] == null || !Number.isFinite(kk)) {
        upper[i] = null
        lower[i] = null
        continue
      }
      const sd = stdevPop(closes.slice(i + 1 - n, i + 1))
      upper[i] = mid[i] + kk * sd
      lower[i] = mid[i] - kk * sd
    }
    return { mid, upper, lower }
  }

  function overlays(bars) {
    const closes = (bars || []).map((b) => b.c)
    const sma5 = sma(closes, 5)
    const bb = bollinger(closes, 20, 2)
    return closes.map((_, i) => {
      const row = {}
      if (sma5[i] != null) row.sma5 = sma5[i]
      if (bb.mid[i] != null) {
        row.sma20 = bb.mid[i]
        row.bbMid = bb.mid[i]
        row.bbUpper = bb.upper[i]
        row.bbLower = bb.lower[i]
      }
      return row
    })
  }

  function niceTicks(min, max, n = 4) {
    if (!(max > min)) return [min]
    const span = max - min
    const step0 = span / n
    const mag = Math.pow(10, Math.floor(Math.log10(step0)))
    const err = step0 / mag
    const step = err >= 7.5 ? 10 * mag : err >= 3 ? 5 * mag : err >= 1.5 ? 2 * mag : mag
    const lo = Math.floor(min / step) * step
    const hi = Math.ceil(max / step) * step
    const ticks = []
    for (let v = lo; v <= hi + step * 0.25; v += step) {
      ticks.push(Number(Number(v).toPrecision(12)))
    }
    return ticks.length ? ticks : [min, max]
  }

  function fmtPrice(v) {
    if (!Number.isFinite(v)) return ''
    return Number.isInteger(v) ? String(v) : String(Math.round(v * 10) / 10)
  }

  function fmtTime(t, rangeDays) {
    const d = new Date(t)
    const md = `${d.getMonth() + 1}-${d.getDate()}`
    const hh = String(d.getHours()).padStart(2, '0')
    const mm = String(d.getMinutes()).padStart(2, '0')
    if (rangeDays === 0) return `${hh}:${mm}`
    if (rangeDays <= 7) return `${md} ${hh}:${mm}`
    return md
  }

  function fmtPct(ratio) {
    if (!Number.isFinite(ratio)) return ''
    const p = ratio * 100
    const sign = p > 0 ? '+' : ''
    return `${sign}${(Math.round(p * 10) / 10).toFixed(1)}%`
  }

  function movers(latestTitles, baseTitles) {
    const latest = latestTitles || {}
    const base = baseTitles || {}
    const listed = []
    const delisted = []
    const up = []
    const down = []
    for (const key of Object.keys(latest)) {
      if (!base[key]) {
        const meta = splitKey(key)
        listed.push({ key, name: meta.name, rarity: latest[key].rarity ?? meta.rarity, mid: latest[key].mid })
      }
    }
    for (const key of Object.keys(base)) {
      if (!latest[key]) {
        const meta = splitKey(key)
        delisted.push({ key, name: meta.name, rarity: base[key].rarity ?? meta.rarity })
      }
    }
    for (const key of Object.keys(latest)) {
      if (!base[key]) continue
      const cur = Number(latest[key].mid)
      const prev = Number(base[key].mid)
      if (!Number.isFinite(cur) || !Number.isFinite(prev) || prev === 0) continue
      const delta = cur - prev
      const pct = delta / prev
      if (pct === 0) continue
      const meta = splitKey(key)
      const row = {
        key,
        name: meta.name,
        rarity: latest[key].rarity ?? meta.rarity,
        mid: cur,
        delta,
        pct,
      }
      if (pct > 0) up.push(row)
      else down.push(row)
    }
    const byKey = (a, b) => a.key.localeCompare(b.key, 'zh-CN')
    up.sort((a, b) => b.pct - a.pct || byKey(a, b))
    down.sort((a, b) => a.pct - b.pct || byKey(a, b))
    return {
      up: up.slice(0, MOVER_TOP),
      down: down.slice(0, MOVER_TOP),
      listed,
      delisted,
    }
  }

  function boardPair(series, { rangeDays = 7, now = Date.now(), mode = 'short' } = {}) {
    const all = (series || []).slice().sort((a, b) => a.t - b.t)
    if (mode === 'short') {
      return {
        latest: all[all.length - 1] || null,
        base: all.length >= 2 ? all[all.length - 2] : null,
        emptyWindow: false,
      }
    }
    const cutoff = rangeCutoff(rangeDays, now)
    const view = all.filter((s) => s.t >= cutoff)
    if (!view.length) return { latest: null, base: null, emptyWindow: true }
    return { latest: view[view.length - 1], base: view[0], emptyWindow: false }
  }

  function fmtBarTip(bar, rangeDays, barMin) {
    const t = Number(bar.t)
    const o = Number(bar.o)
    const h = Number(bar.h)
    const l = Number(bar.l)
    const c = Number(bar.c)
    const chg = c - o
    const sign = chg > 0 ? '+' : ''
    const when = `${fmtTime(t, rangeDays)}–${fmtTime(t + periodMs(rangeDays, barMin), rangeDays)}`
    const lines = [
      when,
      `开 ${fmtPrice(o)}`,
      `高 ${fmtPrice(h)}`,
      `低 ${fmtPrice(l)}`,
      `收 ${fmtPrice(c)}  ${sign}${fmtPrice(chg)}`,
    ]
    const add = (label, raw) => {
      const v = Number(raw)
      if (!Number.isFinite(v)) return
      lines.push(`${label} ${fmtPrice(v)}`)
    }
    add('均5', bar.sma5)
    add('均20', bar.sma20)
    add('上轨', bar.bbUpper)
    add('下轨', bar.bbLower)
    return lines.join('\n')
  }

  // ═══════════════════════════════════════════════════════════
  // 章节索引（1736 行，行情数据源 + 交易页内嵌 + 工作台 RPC）：
  //   A: 市场快照采集与轮询 B: 交易页行情折叠/折线/K 线 C: title-quotes:market-data / refresh 供给
  // 拆分建议：渲染层提 title-quotes/render.js。
  // ═══════════════════════════════════════════════════════════
  function setup(api) {
    const esc = api.util.esc
    let cfg = api.config()
    ;(function migrateInterval() {
      const saved = api.store.get('__config', {}) || {}
      if ('intervalSec' in saved) return
      if (!('intervalMin' in saved)) return
      const min = Number(saved.intervalMin)
      // 1 分钟 / 30 分钟是旧默认，不是用户定制；换成 30 秒
      let sec = 30
      if (Number.isFinite(min) && min > 0 && min !== 1 && min !== 30) {
        sec = Math.max(1, Math.round(min * 60))
      }
      api.saveConfig({ intervalSec: sec })
      cfg = api.config()
    })()
    api.on('config:changed:title-quotes', () => {
      cfg = api.config()
      if (election.isLeader) scheduleNext()
    })
    let timer = null
    let forceTimer = null
    let inflight = null
    let lastErr = null
    let lastAt = null
    let toasted = false
    let rangeDays = 7
    let boardView = 'quotes'
    let boardRarity = null
    let boardMove = 'short'
    let focusKey = null
    let forceFoldOpen = false
    const getKind = () => (api.store.get('chartKind') === 'line' ? 'line' : 'candle')
    const setKind = (k) => api.store.set('chartKind', k === 'line' ? 'line' : 'candle')
    const getBarMin = () => {
      const m = Number(api.store.get('barMin', 30))
      return m === 1 || m === 5 || m === 15 || m === 30 || m === 60 ? m : 30
    }
    const setBarMin = (n) => {
      const m = Number(n)
      api.store.set('barMin', m === 1 || m === 5 || m === 15 || m === 30 || m === 60 ? m : 30)
    }
    let clipSeq = 0
    const get = () => api.store.get('series', []) || []
    const set = (a) => api.store.set('series', a)
    const tabId = Math.random().toString(36).slice(2, 10)
    let beatTimer = null
    let armedMs = null
    let drag = null
    let plotW = 800
    let plotH = 380
    const plotByHost = new WeakMap()
    let plotHost = null
    let sizeWatch = null
    let sizeTimer = 0
    let plotGen = 0

    function readChartH() {
      const n = Number(api.store.get('chartH', 380))
      return Math.min(720, Math.max(240, Number.isFinite(n) && n > 0 ? n : 380))
    }
    plotH = readChartH()

    function pushSnap(snap, now = Date.now()) {
      const arr = get()
      const last = arr[arr.length - 1]
      const traded = flowTraded(snap.flow)
      if (last && snapSig(last) === snapSig(snap) && now - last.t < MERGE_MS && !traded) {
        last.t = Math.max(last.t, now)
        set(arr)
        return false
      }
      arr.push({ t: now, anchors: snap.anchors, titles: snap.titles, flow: snap.flow || {} })
      const deadline = now - cfg.keepDays * 864e5
      set(arr.filter((x) => x.t >= deadline))
      return true
    }

    function normalizeCoverage(coverage = {}, listings = []) {
      const expectedPages = Number.isFinite(Number(coverage.expectedPages)) && Number(coverage.expectedPages) > 0
        ? Math.min(MAX_PAGES, Math.floor(Number(coverage.expectedPages)))
        : 1
      const fetchedPages = Number.isFinite(Number(coverage.fetchedPages)) && Number(coverage.fetchedPages) >= 0
        ? Math.min(expectedPages, Math.floor(Number(coverage.fetchedPages)))
        : expectedPages
      const failedPages = Number.isFinite(Number(coverage.failedPages)) && Number(coverage.failedPages) >= 0
        ? Math.min(expectedPages, Math.floor(Number(coverage.failedPages)))
        : 0
      const challengePages = Number.isFinite(Number(coverage.challengePages)) && Number(coverage.challengePages) >= 0
        ? Math.min(expectedPages, Math.floor(Number(coverage.challengePages)))
        : 0
      return {
        complete: coverage.complete === true || (fetchedPages === expectedPages && failedPages === 0 && challengePages === 0 && listings.length > 0),
        expectedPages,
        fetchedPages,
        failedPages,
        challengePages,
      }
    }

    function ingestListings(listings, now = Date.now(), coverage = {}) {
      const prev = api.store.get('book', null)
      const flow = estimateFlow(prev, listings, now)
      api.store.set('book', { t: now, rows: bookFromListings(listings) })
      const titles = foldTitles(listings)
      for (const k of Object.keys(titles)) {
        titles[k].sold = flow[k]?.sold ?? 0
        titles[k].fills = flow[k]?.fills ?? 0
      }
      const market = {
        schema: 2,
        fetchedAt: now,
        coverage: normalizeCoverage(coverage, listings || []),
        listings: (listings || [])
          .filter((x) => x && x.name && x.rarity != null && Number.isFinite(Number(x.price)))
          .map((x) => ({
            key: titleKey(x.name, x.rarity),
            price: Number(x.price),
            qty: Number(x.qty) > 0 ? Number(x.qty) : 1,
          })),
        titles: Object.fromEntries(
          Object.entries(titles).map(([key, value]) => [key, {
            rarity: value.rarity,
            lo: value.lo,
            hi: value.hi,
            mid: value.mid,
            n: value.n,
          }]),
        ),
      }
      api.store.set('market', market)
      const anchors = pickAnchors(listings, titles)
      return pushSnap({ anchors, titles, flow }, now)
    }

    function isMarket() {
      try {
        return location.pathname.replace(/\/+$/, '') === '/gacha_market'
      } catch {
        return false
      }
    }
    function unmountEmbed() {
      document.querySelectorAll('.lsb-title-quotes-embed').forEach((el) => el.remove())
    }
    function mountEmbed() {
      if (!isMarket()) {
        unmountEmbed()
        return
      }
      const sections = [...document.querySelectorAll('.gacha-market-section')]
      const sold = sections.find((s) => /在售(交易|列表)/.test(s.querySelector('h2')?.textContent || ''))
      if (!sold) return
      let el = document.querySelector('.lsb-title-quotes-embed')
      if (!el) {
        el = document.createElement('section')
        el.className = 'lsb-title-quotes-embed'
        sold.parentNode.insertBefore(el, sold)
      }
      render(el)
    }

    function plotGeom() {
      const s = (plotHost && plotByHost.get(plotHost)) || { W: plotW, H: plotH }
      return { W: s.W, H: s.H, P: { l: 52, r: 14, t: 12, b: 32 } }
    }

    function timeWindow(times, rangeDays, now, barMin) {
      const tMax = now
      const rangeMin = rangeCutoff(rangeDays, now)
      const nums = (times || []).filter((t) => Number.isFinite(t) && t <= tMax)
      const inRange = nums.filter((t) => t >= rangeMin)
      const src = inRange.length ? inRange : rangeDays === 0 ? nums.filter((t) => t >= rangeMin) : nums
      const dataMin = src.length ? Math.min(...src) : rangeMin
      let tMin = Math.max(rangeMin, Math.min(dataMin, tMax))
      const period = periodMs(rangeDays, barMin)
      const minSpan = Math.max(period, rangeDays === 0 ? 30 * 60e3 : 3600e3)
      if (tMax - tMin < minSpan) tMin = Math.max(rangeMin, tMax - minSpan)
      const pad = Math.max((tMax - tMin) * 0.05, period * 0.35)
      tMin = Math.max(rangeMin, tMin - pad)
      return { tMin, tMax: tMax + pad * 0.12 }
    }

    function yScale(min, max, P, H) {
      const pad = (max - min || 1) * 0.12
      const lo = min - pad
      const hi = max + pad
      const span = hi - lo || 1
      const Y = (v) => P.t + (1 - (v - lo) / span) * (H - P.t - P.b)
      return { lo, hi, Y, ticks: niceTicks(min, max, 4) }
    }

    function xScale(tMin, tMax, P, W) {
      const span = Math.max(1, tMax - tMin)
      return (t) => P.l + ((t - tMin) / span) * (W - P.l - P.r)
    }

    function gridAndAxes({ W, H, P, Y, ticks, tMin, tMax, rangeDays, clip }) {
      const innerW = W - P.l - P.r
      const innerH = H - P.t - P.b
      const x0 = P.l
      const x1 = P.l + innerW
      const y0 = P.t
      const y1 = P.t + innerH
      const hair = 'stroke="currentColor" vector-effect="non-scaling-stroke" shape-rendering="crispEdges"'
      const gridH = ticks
        .map((v) => {
          const y = Y(v)
          if (y < y0 - 0.5 || y > y1 + 0.5) return ''
          return `<line class="lsb-title-quotes-grid" x1="${x0}" x2="${x1}" y1="${y.toFixed(1)}" y2="${y.toFixed(1)}" ${hair} stroke-opacity="0.28"></line>
            <text x="${x0 - 8}" y="${(y + 3.5).toFixed(1)}" text-anchor="end" font-size="10" fill="currentColor" fill-opacity="0.62">${esc(fmtPrice(v))}</text>`
        })
        .join('')
      const tMid = tMin + (tMax - tMin) / 2
      const times = tMax > tMin ? [tMin, tMid, tMax] : [tMin]
      const X = xScale(tMin, tMax, P, W)
      const gridV = times
        .map((t) => {
          const x = X(t)
          return `<line class="lsb-title-quotes-grid" x1="${x.toFixed(1)}" x2="${x.toFixed(1)}" y1="${y0}" y2="${y1}" ${hair} stroke-opacity="0.16"></line>`
        })
        .join('')
      const labels = times
        .map((t, i) => {
          const x = X(t)
          const anchor = i === 0 ? 'start' : i === times.length - 1 ? 'end' : 'middle'
          return `<text x="${x.toFixed(1)}" y="${H - 8}" text-anchor="${anchor}" font-size="10" fill="currentColor" fill-opacity="0.62">${esc(fmtTime(t, rangeDays))}</text>`
        })
        .join('')
      return `<defs><clipPath id="${clip}"><rect x="${x0}" y="${y0}" width="${innerW}" height="${innerH}"></rect></clipPath></defs>
        <rect x="${x0}" y="${y0}" width="${innerW}" height="${innerH}" fill="currentColor" fill-opacity="0.04" stroke="currentColor" stroke-opacity="0.32" vector-effect="non-scaling-stroke"></rect>
        ${gridH}${gridV}${labels}`
    }

    function chartSvg(extraClass, W, H, inner) {
      return `<svg class="lsb-svg${extraClass ? ` ${extraClass}` : ''}" viewBox="0 0 ${W} ${H}" preserveAspectRatio="none" role="img" font-family="ui-sans-serif, system-ui, sans-serif">${inner}</svg>`
    }

    function lines(points, keys, rangeDays = 7, now = Date.now()) {
      if (points.length < 2) return ''
      const { W, H, P } = plotGeom()
      const vals = []
      for (const p of points) {
        for (const k of keys) if (p[k.id] != null) vals.push(p[k.id])
      }
      if (!vals.length) return ''
      const min = Math.min(...vals)
      const max = Math.max(...vals)
      const { Y, ticks } = yScale(min, max, P, H)
      const { tMin, tMax } = timeWindow(
        points.map((p) => p.t),
        rangeDays,
        now,
        getBarMin(),
      )
      const X = xScale(tMin, tMax, P, W)
      const clip = `lsb-tq-l-${++clipSeq}`
      const polylines = keys
        .map((k) => {
          const pts = points
            .filter((p) => p[k.id] != null && p.t != null)
            .map((p) => `${X(p.t).toFixed(1)},${Y(p[k.id]).toFixed(1)}`)
            .join(' ')
          if (!pts) return ''
          return `<polyline points="${pts}" fill="none" stroke="${k.color}" stroke-width="2" stroke-linejoin="round" stroke-linecap="round" clip-path="url(#${clip})"></polyline>`
        })
        .join('')
      const frame = gridAndAxes({ W, H, P, Y, ticks, tMin, tMax, rangeDays, clip })
      return chartSvg('', W, H, `${frame}${polylines}`)
    }

    function overlayPaths(bars, overlayRows, X, Y, period) {
      if (!overlayRows) return ''
      const draw = (key, stroke, dash) => {
        const segs = []
        let d = ''
        const flush = () => {
          if (d) segs.push(d)
          d = ''
        }
        for (let i = 0; i < bars.length; i++) {
          if (i > 0 && bars[i].t - bars[i - 1].t > period) flush()
          const v = Number(overlayRows[i]?.[key])
          if (!Number.isFinite(v)) {
            flush()
            continue
          }
          const x = X(bars[i].t + period / 2).toFixed(1)
          const y = Y(v).toFixed(1)
          d += d ? ` L${x} ${y}` : `M${x} ${y}`
        }
        flush()
        const dashAttr = dash ? ' stroke-dasharray="4 3"' : ''
        return segs
          .map(
            (p) =>
              `<path fill="none" stroke="${stroke}" stroke-width="1.4"${dashAttr} vector-effect="non-scaling-stroke" pointer-events="none" d="${p}"></path>`,
          )
          .join('')
      }
      return (
        draw('sma5', '#6b8afd', false) +
        draw('sma20', '#c9892e', false) +
        draw('bbUpper', '#8b8d9a', true) +
        draw('bbLower', '#8b8d9a', true)
      )
    }

    function candles(bars, rangeDays = 7, now = Date.now(), overlayRows = null) {
      if (!bars.length) return ''
      const { W, H, P } = plotGeom()
      const barMin = getBarMin()
      const period = periodMs(rangeDays, barMin)
      const vals = bars.flatMap((bar) => [bar.o, bar.h, bar.l, bar.c])
      if (overlayRows) {
        for (const row of overlayRows) {
          if (!row) continue
          for (const v of Object.values(row)) {
            if (Number.isFinite(v)) vals.push(v)
          }
        }
      }
      const min = Math.min(...vals)
      const max = Math.max(...vals)
      const { Y, ticks } = yScale(min, max, P, H)
      const { tMin, tMax } = timeWindow(
        bars.map((bar) => bar.t),
        rangeDays,
        now,
        barMin,
      )
      const X = xScale(tMin, tMax, P, W)
      const innerW = W - P.l - P.r
      const span = Math.max(1, tMax - tMin)
      const slots = Math.max(bars.length + 1, span / period)
      const bodyW = Math.max(5, Math.min(14, (innerW / slots) * 0.58))
      const clip = `lsb-tq-k-${++clipSeq}`
      const parts = bars
        .map((bar, i) => {
          const x = X(bar.t + period / 2)
          const yO = Y(bar.o)
          const yC = Y(bar.c)
          const color = bar.c > bar.o ? '#d94c4c' : bar.c < bar.o ? '#2a9a7c' : '#8b8d9a'
          const yH = Y(bar.h)
          const yL = Y(bar.l)
          const flat = Math.abs(yO - yC) < 1.2
          const hair = 'vector-effect="non-scaling-stroke"'
          const body = flat
            ? `<line class="lsb-title-quotes-body" x1="${(x - bodyW / 2).toFixed(1)}" x2="${(x + bodyW / 2).toFixed(1)}" y1="${yC.toFixed(1)}" y2="${yC.toFixed(1)}" stroke="${color}" stroke-width="2" stroke-linecap="square" ${hair}></line>`
            : `<rect class="lsb-title-quotes-body" x="${(x - bodyW / 2).toFixed(1)}" y="${Math.min(yO, yC).toFixed(1)}" width="${bodyW.toFixed(1)}" height="${Math.max(1.2, Math.abs(yO - yC)).toFixed(1)}" fill="${color}" stroke="${color}" stroke-width="1" ${hair}></rect>`
          const wick = `<line class="lsb-title-quotes-wick" x1="${x.toFixed(1)}" x2="${x.toFixed(1)}" y1="${yH.toFixed(1)}" y2="${yL.toFixed(1)}" stroke="${color}" stroke-width="1" ${hair}></line>`
          const innerH = H - P.t - P.b
          const slotW = Math.max(bodyW + 6, innerW / slots)
          const hit = `<rect class="lsb-title-quotes-hit" x="${(x - slotW / 2).toFixed(1)}" y="${P.t}" width="${slotW.toFixed(1)}" height="${innerH}" fill="transparent"></rect>`
          let ovAttrs = ''
          if (overlayRows) {
            const ov = overlayRows[i] || {}
            const put = (attr, raw) => {
              const v = Number(raw)
              if (!Number.isFinite(v)) return
              ovAttrs += ` ${attr}="${v}"`
            }
            put('data-sma5', ov.sma5)
            put('data-sma20', ov.sma20)
            put('data-bb-upper', ov.bbUpper)
            put('data-bb-lower', ov.bbLower)
          }
          return `<g class="lsb-title-quotes-bar" data-t="${bar.t}" data-o="${bar.o}" data-h="${bar.h}" data-l="${bar.l}" data-c="${bar.c}"${ovAttrs}>${hit}${wick}${body}</g>`
        })
        .join('')
      const ovSvg = overlayPaths(bars, overlayRows, X, Y, period)
      const frame = gridAndAxes({ W, H, P, Y, ticks, tMin, tMax, rangeDays, clip })
      return chartSvg('lsb-title-quotes-k', W, H, `${frame}<g clip-path="url(#${clip})">${parts}${ovSvg}</g>`)
    }

    function statusLine() {
      if (lastErr) {
        const when = lastAt ? new Date(lastAt).toLocaleString('zh-CN') : '尚无成功采集'
        return `上次采集 ${when} · 本轮失败`
      }
      if (lastAt) return `上次采集 ${new Date(lastAt).toLocaleString('zh-CN')}`
      return ''
    }

    function render(host) {
      if (!host) return
      plotHost = host
      const all = get()
      const latest = all[all.length - 1]
      const cutoff = rangeCutoff(rangeDays)
      const view = all.filter((x) => x.t >= cutoff)
      const chartSrc = view.length >= 2 ? view : rangeDays === 0 ? view : all
      const kind = getKind()

      const viewBtns = `<button class="lsb-btn${boardView === 'quotes' ? ' is-primary' : ''}" data-board-view="quotes">行情</button>
          <button class="lsb-btn${boardView === 'board' ? ' is-primary' : ''}" data-board-view="board">大盘</button>`
      const chartBtns =
        boardView === 'quotes'
          ? [
              ['candle', 'K线'],
              ['line', '折线'],
            ]
              .map(
                ([id, label]) =>
                  `<button class="lsb-btn${kind === id ? ' is-primary' : ''}" data-chart="${id}">${label}</button>`,
              )
              .join('')
          : ''
      const rangeBtns = [
        [0, '本日'],
        [7, '7天'],
        [30, '30天'],
        [90, '90天'],
      ]
        .map(
          ([d, label]) =>
            `<button class="lsb-btn${rangeDays === d ? ' is-primary' : ''}" data-range="${d}">${label}</button>`,
        )
        .join('')
      const barMin = getBarMin()
      const showBarMin = rangeDays === 0 && (boardView === 'board' || kind !== 'line')
      const barMinBtns = showBarMin
        ? [1, 5, 15, 30, 60]
            .map(
              (m) =>
                `<button type="button" class="lsb-btn${barMin === m ? ' is-primary' : ''}" data-bar-min="${m}">${m}分</button>`,
            )
            .join('')
        : ''
      const tools = `<span style="display:flex;gap:6px;align-items:center">${viewBtns}</span>
        <span style="margin-left:auto;display:flex;gap:8px;align-items:center">
          ${chartBtns ? `<span style="display:flex;gap:6px">${chartBtns}</span>` : ''}
          <span style="display:flex;gap:6px">${rangeBtns}</span>
          ${barMinBtns ? `<span style="display:flex;gap:6px">${barMinBtns}</span>` : ''}
        </span>`
      const isEmbed = host.classList.contains('lsb-title-quotes-embed')
      const isFloat = host.classList.contains('lsb-title-quotes-float-body')
      const keepOpen =
        (isEmbed && !!host.querySelector('details.lsb-title-quotes-fold')?.open) || forceFoldOpen
      const head = isEmbed
        ? `<div class="lsb-cal-head">${tools}</div>`
        : `<div class="lsb-cal-head">
          ${isFloat ? '' : '<strong>称号行情</strong>'}
          <span class="lsb-row-desc">${esc(statusLine())}</span>
          ${tools}
        </div>`

      let bodyHtml = ''
      if (boardView === 'board') {
        if (!all.length) {
          bodyHtml = '<div class="lsb-empty">还没采到行情。打开交易页或等下一轮巡检。</div>'
        } else {
          const raritySet = new Set()
          for (const s of view) {
            for (const t of Object.values(s.titles || {})) raritySet.add(t.rarity ?? '')
          }
          const latestIdx = snapshotIndex(latest?.titles || {})
          const rarities = [...raritySet].sort((a, b) => {
            const na = latestIdx.byRarity[a]?.n ?? 0
            const nb = latestIdx.byRarity[b]?.n ?? 0
            if (nb !== na) return nb - na
            return a.localeCompare(b, 'zh-CN')
          })
          const chips =
            `<button type="button" class="lsb-title-quotes-chip${boardRarity === null ? ' is-primary' : ''}" data-board-idx="all">总指数</button>` +
            rarities
              .map((r) => {
                const label = r === '' ? '未知' : r
                const on = boardRarity === r
                return `<button type="button" class="lsb-title-quotes-chip${on ? ' is-primary' : ''}" data-board-idx="rarity" data-rarity="${esc(r)}">${esc(label)}</button>`
              })
              .join('')
          const bars = foldIndexCandles(indexPoints(all, boardRarity), { rangeDays, barMin })
          let chartBlock = '<div class="lsb-empty">这个时间窗还不够画指数</div>'
          if (bars.length) {
            const ov = overlays(bars)
            chartBlock =
              `<div class="lsb-title-quotes-host">${candles(bars, rangeDays, Date.now(), ov)}</div>` +
              `<div class="lsb-row-desc">K · 5 · 20 · 布林</div>` +
              `<div class="lsb-row-desc">挂单中位 · 非成交</div>`
          }
          const moveBtns = `<div style="display:flex;gap:6px;margin:8px 0">
          <button class="lsb-btn${boardMove === 'short' ? ' is-primary' : ''}" data-board-move="short">短线</button>
          <button class="lsb-btn${boardMove === 'range' ? ' is-primary' : ''}" data-board-move="range">区间</button>
        </div>`
          const pair = boardPair(all, { rangeDays, mode: boardMove })
          let pack = { up: [], down: [], listed: [], delisted: [] }
          if (pair.emptyWindow) pack = null
          else if (pair.latest && !pair.base && boardMove === 'short') pack = movers(pair.latest.titles, {})
          else if (pair.latest && pair.base) pack = movers(pair.latest.titles, pair.base.titles)
          const nameBtn = (row) =>
            `<button type="button" class="lsb-title-quotes-name" data-board-key="${esc(row.key)}">${esc(row.name)}</button>`
          const moverLine = (row) => {
            const dSign = row.delta > 0 ? '+' : ''
            const fl = sumFlow(all, row.key, { rangeDays })
            return `<div class="lsb-title-quotes-mover">${nameBtn(row)}<span>${dSign}${esc(fmtPrice(row.delta))} · ${esc(fmtPct(row.pct))} · 估 ${fl.fills}笔 ${fl.sold}件</span></div>`
          }
          const summarySide = (label, items) => {
            if (!items.length) return ''
            const shown = items.slice(0, 20)
            const tail = items.length > 20 ? '等' : ''
            return `<div class="lsb-row-desc">${label} ${items.length}：${shown.map(nameBtn).join('')}${tail}</div>`
          }
          let rankBody = '<div class="lsb-empty">没有可比的涨跌</div>'
          if (pack) {
            const { up, down, listed, delisted } = pack
            if (up.length || down.length || listed.length || delisted.length) {
              rankBody =
                `<div class="lsb-title-quotes-movers">${[
                  ['涨幅 Top 10', up],
                  ['跌幅 Top 10', down],
                ]
                  .map(
                    ([title, rows]) =>
                      `<div><div class="lsb-row-desc">${title}</div>${rows.map(moverLine).join('')}</div>`,
                  )
                  .join('')}</div>` +
                summarySide('新上', listed) +
                summarySide('下架', delisted)
            }
          }
          bodyHtml = `<div class="lsb-title-quotes-chips">${chips}</div>${chartBlock}${moveBtns}${rankBody}`
        }
      } else {
        const anchors = latest?.anchors || []
        const byRole = Object.fromEntries(anchors.map((x) => [x.role, x]))
        const cards = ROLES.filter((r) => byRole[r.id])
          .map((r) => {
            const a = byRole[r.id]
            return `<div class="lsb-title-quotes-card">
            <span class="lsb-row-desc"><span class="lsb-title-quotes-pip" style="background:${r.color}"></span>${esc(r.label)}</span>
            <strong>${esc(a.name)}</strong>
            <span class="lsb-row-desc">${esc(a.rarity)} · ${esc(a.price)} 积分</span>
          </div>`
          })
          .join('')
        let marketChart = '<div class="lsb-empty">还没采到行情。打开交易页或等下一轮巡检。</div>'
        if (all.length === 1) {
          marketChart = '<div class="lsb-empty">再等一轮巡检后开始绘制折线。</div>'
        } else if (all.length >= 2) {
          const pts = chartSrc.map((s) => {
            const row = { t: s.t }
            for (const a of s.anchors || []) row[a.role] = a.price
            return row
          })
          marketChart = `<div class="lsb-title-quotes-host">${lines(pts, ROLES, rangeDays)}</div>`
        }

        const openKeys = new Set(
          [...host.querySelectorAll('.lsb-title-quotes-row[open]')].map((el) => el.getAttribute('data-key')),
        )
        if (focusKey) openKeys.add(focusKey)
        const listed = latest?.titles || {}
        const keys = new Set()
        for (const s of all) Object.keys(s.titles || {}).forEach((k) => keys.add(k))
        const ordered = [...keys].sort((a, b) => {
          const da = listed[a] ? 0 : 1
          const db = listed[b] ? 0 : 1
          if (da !== db) return da - db
          return (listed[a]?.lo ?? 1e15) - (listed[b]?.lo ?? 1e15) || a.localeCompare(b, 'zh-CN')
        })
        const rows = ordered
          .map((k) => {
            const meta = splitKey(k)
            const cur = listed[k]
            const off = !cur
            const lo = cur?.lo
            const hi = cur?.hi
            let body = ''
            if (kind === 'line') {
              const pick = (src) =>
                src
                  .map((s) => {
                    const t = s.titles && s.titles[k]
                    return t ? { t: s.t, lo: t.lo, hi: t.hi } : null
                  })
                  .filter(Boolean)
              let pts = pick(view)
              if (pts.length < 2 && rangeDays !== 0) pts = pick(all)
              if (pts.length >= 2) {
                body =
                  `<div class="lsb-title-quotes-host">${lines(pts, TITLE_LINES, rangeDays)}</div>` +
                  `<div class="lsb-row-desc">挂单高低 · 非成交</div>`
              }
            } else {
              const bars = foldCandles(all, k, { rangeDays, barMin })
              if (bars.length) {
                body =
                  `<div class="lsb-title-quotes-host">${candles(bars, rangeDays)}</div>` +
                  `<div class="lsb-row-desc">挂单合成 · 非成交</div>`
              }
            }
            const flow = sumFlow(all, k, { rangeDays })
            const est = `估 ${flow.fills} 笔 · ${flow.sold} 件`
            const price = off
              ? `已下架 · ${est}`
              : `最低 ${lo} · 最高 ${hi} · 上架 ${cur.n ?? 0} 个 · ${est}`
            return `<details class="lsb-title-quotes-row${off ? ' is-off' : ''}" data-key="${esc(k)}"${openKeys.has(k) ? ' open' : ''}>
            <summary><strong>${esc(meta.name)}</strong>
              <span class="lsb-row-desc">${esc(meta.rarity)} · ${esc(price)}</span></summary>
            ${body}
          </details>`
          })
          .join('')
        bodyHtml = `<div class="lsb-title-quotes-anchors">${cards || ''}</div>
        ${marketChart}
        ${rows ? `<div class="lsb-title-quotes-list">${rows}</div>` : ''}`
      }

      const estNote = `<div class="lsb-row-desc">成交为挂单剩余变化的估计，含下架/撤单，不是真成交</div>`
      const inner = `
        ${head}
        ${estNote}
        ${bodyHtml}`
      host.classList.add('lsb-title-quotes')
      host.innerHTML = isEmbed
        ? `<details class="lsb-title-quotes-fold"${keepOpen ? ' open' : ''}>
            <summary class="lsb-title-quotes-fold-sum"><strong>称号行情</strong>
              <span class="lsb-row-desc">${esc(statusLine())}</span></summary>
            <div class="lsb-title-quotes-fold-body">${inner}</div>
          </details>`
        : inner
      forceFoldOpen = false
      focusKey = null
      host.querySelectorAll('[data-range]').forEach((b) => {
        b.onclick = () => {
          rangeDays = Number(b.dataset.range)
          render(host)
        }
      })
      host.querySelectorAll('[data-bar-min]').forEach((b) => {
        b.onclick = () => {
          setBarMin(Number(b.getAttribute('data-bar-min')))
          render(host)
        }
      })
      host.querySelectorAll('[data-chart]').forEach((b) => {
        b.onclick = () => {
          setKind(b.dataset.chart)
          render(host)
        }
      })
      host.querySelectorAll('[data-board-view]').forEach((b) => {
        b.onclick = () => {
          boardView = b.dataset.boardView
          render(host)
        }
      })
      host.querySelectorAll('[data-board-idx]').forEach((el) => {
        el.onclick = () => {
          if (el.getAttribute('data-board-idx') === 'all') boardRarity = null
          else boardRarity = el.getAttribute('data-rarity')
          render(host)
        }
      })
      host.querySelectorAll('[data-board-move]').forEach((b) => {
        b.onclick = () => {
          boardMove = b.getAttribute('data-board-move') === 'range' ? 'range' : 'short'
          render(host)
        }
      })
      host.querySelectorAll('[data-board-key]').forEach((el) => {
        el.onclick = () => {
          focusKey = el.getAttribute('data-board-key')
          boardView = 'quotes'
          forceFoldOpen = true
          render(host)
        }
      })
      bindCandleTips(host)
      bindChartSize(host)
      plotHost = null
    }

    function bindChartSize(root) {
      if (sizeWatch) {
        sizeWatch.disconnect()
        sizeWatch = null
      }
      const wraps = [...root.querySelectorAll('.lsb-title-quotes-host')]
      const h = readChartH()
      for (const wrap of wraps) wrap.style.height = `${h}px`
      const sample = wraps[0]
      const prev = plotByHost.get(root) || { W: plotW, H: plotH }
      if (sample && sample.clientWidth >= 40) {
        const nw = Math.max(320, Math.round(sample.clientWidth))
        const nh = Math.min(720, Math.max(240, Math.round(sample.clientHeight || h)))
        if (Math.abs(nw - prev.W) > 8 || Math.abs(nh - prev.H) > 8) {
          plotByHost.set(root, { W: nw, H: nh })
          queueMicrotask(() => render(root))
          return
        }
        plotByHost.set(root, { W: nw, H: nh })
      }
      if (!sample || typeof ResizeObserver === 'undefined') return
      const gen = ++plotGen
      sizeWatch = new ResizeObserver((entries) => {
        const el = entries[0]?.target
        if (!el?.isConnected || gen !== plotGen) return
        window.clearTimeout(sizeTimer)
        sizeTimer = window.setTimeout(() => {
          if (gen !== plotGen || !el.isConnected) return
          const nw = Math.round(el.clientWidth)
          const nh = Math.round(el.clientHeight)
          if (nw < 40 || nh < 40) return
          const last = plotByHost.get(root) || { W: plotW, H: plotH }
          if (Math.abs(nw - last.W) < 8 && Math.abs(nh - last.H) < 8) return
          api.store.set('chartH', Math.min(720, Math.max(240, nh)))
          plotByHost.set(root, {
            W: Math.max(320, nw),
            H: Math.min(720, Math.max(240, nh)),
          })
          render(root)
        }, 320)
      })
      sizeWatch.observe(sample)
    }

    function bindCandleTips(root) {
      for (const wrap of root.querySelectorAll('.lsb-title-quotes-host')) {
        if (!wrap.querySelector('svg.lsb-title-quotes-k')) continue
        let tip = wrap.querySelector('.lsb-title-quotes-tip')
        if (!tip) {
          tip = document.createElement('div')
          tip.className = 'lsb-title-quotes-tip'
          wrap.append(tip)
        }
        const hide = () => tip.classList.remove('is-on')
        wrap.onmousemove = (e) => {
          const g = e.target.closest?.('.lsb-title-quotes-bar')
          if (!g || !wrap.contains(g)) {
            hide()
            return
          }
          tip.textContent = fmtBarTip(g.dataset, rangeDays, getBarMin())
          tip.classList.add('is-on')
          const box = wrap.getBoundingClientRect()
          const tw = tip.offsetWidth || 0
          const th = tip.offsetHeight || 0
          let x = e.clientX - box.left + 12
          let y = e.clientY - box.top - th - 8
          if (box.width && x + tw > box.width - 4) x = Math.max(4, box.width - tw - 4)
          if (x < 4) x = 4
          if (y < 4) y = e.clientY - box.top + 16
          if (box.height && y + th > box.height - 4) y = Math.max(4, box.height - th - 4)
          tip.style.left = `${x}px`
          tip.style.top = `${y}px`
        }
        wrap.onmouseleave = hide
      }
    }

    function refreshViews() {
      mountEmbed()
      const body = document.querySelector('.lsb-title-quotes-float-body')
      if (body) render(body)
    }

    function isChallengePage(doc) {
      const text = String(doc?.body?.textContent || doc?.documentElement?.textContent || '')
      return /cloudflare|checking your browser|challenge/i.test(text)
    }

    async function cycle(force = false) {
      if (inflight) return inflight
      if (election.role === 'follower' && !force) return null
      inflight = (async () => {
        const coverage = { expectedPages: 1, fetchedPages: 0, failedPages: 0, challengePages: 0 }
        try {
          const lists = []
          const readPage = async (path) => {
            try {
              const doc = await api.net.doc(path)
              if (isChallengePage(doc)) {
                coverage.challengePages += 1
                throw new Error('挑战页未完成')
              }
              coverage.fetchedPages += 1
              return doc
            } catch (error) {
              if (!/挑战页未完成/.test(String(error?.message || error))) coverage.failedPages += 1
              throw error
            }
          }
          const first = await readPage('/gacha_market?p=1')
          lists.push(parseCards(first))
          const pages = parsePageCount(first)
          coverage.expectedPages = pages
          for (let p = 2; p <= pages; p++) {
            lists.push(parseCards(await readPage(`/gacha_market?p=${p}`)))
          }
          if (isMarket()) lists.push(parseCards(document))
          const listings = mergeListings(lists)
          if (!listings.length) throw new Error('市场页面格式无法识别')
          ingestListings(listings, Date.now(), coverage)
          lastErr = null
          lastAt = Date.now()
          toasted = false
          refreshViews()
          return { n: listings.length, market: api.store.get('market', null) }
        } catch (e) {
          lastErr = String((e && e.message) || e)
          api.log('采集失败', lastErr)
          if (!toasted) {
            toasted = true
            api.ui.toast('称号行情本轮采集失败', { type: 'error' })
          }
          refreshViews()
        } finally {
          inflight = null
          if (election.isLeader) scheduleNext()
        }
      })()
      return inflight
    }

    async function refreshMarket() {
      const result = await cycle(true)
      const market = result?.market || null
      if (!result || !market?.coverage?.complete) {
        throw new Error(lastErr || '行情数据不足')
      }
      return market
    }

    function watching() {
      const beat = api.store.get('watchBeat', null)
      const t = Number(beat && beat.t)
      return Number.isFinite(t) && t > 0 && Date.now() - t < WATCH_TTL_MS
    }
    function configMs() {
      const n = Number(cfg.intervalSec)
      return Math.max(250, (Number.isFinite(n) && n > 0 ? n : 30) * 1000)
    }
    function pollMs() {
      const ms = configMs()
      return watching() ? Math.min(WATCH_MS, ms) : ms
    }
    function scheduleNext() {
      if (timer) clearTimeout(timer)
      armedMs = pollMs()
      timer = setTimeout(() => cycle(), armedMs)
      timer.unref?.()
    }
    function scheduleForceSnap() {
      if (forceTimer) clearTimeout(forceTimer)
      forceTimer = setTimeout(() => {
        forceTimer = null
        cycle(true)
      }, FORCE_DEBOUNCE_MS)
      forceTimer.unref?.()
    }

    const election = api.election({
      onPromote: () => cycle(),
      onDemote: () => {
        if (timer) clearTimeout(timer)
        timer = null
        armedMs = null
      },
      jitter: 800,
    })

    function pageVisible() {
      return document.visibilityState === 'visible' && !document.hidden
    }
    function stopBeatTimer() {
      if (beatTimer) clearInterval(beatTimer)
      beatTimer = null
    }
    function maybeReschedule() {
      if (election.isLeader && pollMs() !== armedMs) scheduleNext()
    }
    function writeWatchBeat() {
      if (!api.store.get('floatOpen')) return
      if (!pageVisible()) return
      const beat = { t: Date.now(), id: tabId }
      api.store.set('watchBeat', beat)
      api.tabs.post('watch', beat)
      maybeReschedule()
    }
    function startBeatTimer() {
      stopBeatTimer()
      writeWatchBeat()
      beatTimer = setInterval(writeWatchBeat, WATCH_BEAT_MS)
      beatTimer.unref?.()
    }
    api.tabs.on('watch', () => maybeReschedule())

    function applyRect(el) {
      const r = api.store.get('floatRect', null)
      el.style.position = 'fixed'
      el.style.zIndex = '99990'
      el.style.minWidth = '360px'
      el.style.minHeight = '360px'
      el.style.maxWidth = '94vw'
      el.style.maxHeight = '90vh'
      if (
        r &&
        Number.isFinite(r.left) &&
        Number.isFinite(r.top) &&
        Number.isFinite(r.width) &&
        Number.isFinite(r.height)
      ) {
        el.style.left = `${r.left}px`
        el.style.top = `${r.top}px`
        el.style.width = `${Math.max(360, r.width)}px`
        el.style.height = `${Math.max(360, r.height)}px`
        el.style.right = 'auto'
        el.style.bottom = 'auto'
      } else {
        el.style.left = 'auto'
        el.style.top = 'auto'
        el.style.right = '16px'
        el.style.bottom = '130px'
        el.style.width = '560px'
        el.style.height = '640px'
      }
    }
    function persistRect(el) {
      const box = el.getBoundingClientRect()
      if (!box.width || !box.height) return
      const prev = api.store.get('floatRect', null) || {}
      const height = el.classList.contains('is-collapsed') && Number.isFinite(prev.height)
        ? prev.height
        : box.height
      api.store.set('floatRect', { left: box.left, top: box.top, width: box.width, height })
    }
    function clamp(el) {
      const box = el.getBoundingClientRect()
      const vw = window.innerWidth || 800
      const vh = window.innerHeight || 600
      let left = box.left
      let top = box.top
      if (box.right < 40) left = 0
      if (box.left > vw - 40) left = Math.max(0, vw - 40)
      if (box.bottom < 28) top = 0
      if (box.top > vh - 28) top = Math.max(0, vh - 28)
      el.style.left = `${left}px`
      el.style.top = `${top}px`
      el.style.right = 'auto'
      el.style.bottom = 'auto'
    }
    function setCollapsed(on) {
      const el = document.querySelector('.lsb-title-quotes-float')
      if (!el) return
      el.classList.toggle('is-collapsed', !!on)
      el.style.minHeight = on ? '0px' : '360px'
      api.store.set('floatCollapsed', !!on)
      const btn = el.querySelector('[data-float-collapse]')
      if (btn) btn.textContent = on ? '展开' : '收起'
    }
    function unmountFloat() {
      document.querySelectorAll('.lsb-title-quotes-float').forEach((n) => n.remove())
    }
    function bindChrome(el) {
      const head = el.querySelector('.lsb-title-quotes-float-head')
      head.addEventListener('pointerdown', (e) => {
        if (e.target.closest('button')) return
        const box = el.getBoundingClientRect()
        drag = { kind: 'move', dx: e.clientX - box.left, dy: e.clientY - box.top }
        e.preventDefault()
      })
      el.querySelector('.lsb-title-quotes-float-resize').addEventListener('pointerdown', (e) => {
        const box = el.getBoundingClientRect()
        drag = { kind: 'resize', x: e.clientX, y: e.clientY, w: box.width, h: box.height, l: box.left, t: box.top }
        e.preventDefault()
        e.stopPropagation()
      })
      el.querySelector('[data-float-close]').addEventListener('click', () => closeFloat())
      el.querySelector('[data-float-collapse]').addEventListener('click', () => {
        setCollapsed(!el.classList.contains('is-collapsed'))
      })
      el.addEventListener('wheel', onFloatWheel, { passive: false })
    }
    function onFloatWheel(e) {
      const dy = e.deltaY
      const root = e.currentTarget
      const scroller = e.target?.closest?.('.lsb-title-quotes-float-body')
      if (scroller && root.contains(scroller)) {
        const top = scroller.scrollTop
        const max = scroller.scrollHeight - scroller.clientHeight
        if ((dy < 0 && top > 0) || (dy > 0 && top < max - 0.5)) return
      }
      e.preventDefault()
    }
    function onPointerMove(e) {
      const el = document.querySelector('.lsb-title-quotes-float')
      if (!drag || !el) return
      if (drag.kind === 'move') {
        el.style.left = `${e.clientX - drag.dx}px`
        el.style.top = `${e.clientY - drag.dy}px`
        el.style.right = 'auto'
        el.style.bottom = 'auto'
      } else {
        el.style.left = `${drag.l}px`
        el.style.top = `${drag.t}px`
        el.style.width = `${Math.max(360, drag.w + (e.clientX - drag.x))}px`
        el.style.height = `${Math.max(360, drag.h + (e.clientY - drag.y))}px`
        el.style.right = 'auto'
        el.style.bottom = 'auto'
      }
    }
    function onPointerUp() {
      const el = document.querySelector('.lsb-title-quotes-float')
      if (drag && el) {
        clamp(el)
        persistRect(el)
      }
      drag = null
    }
    function onWinResize() {
      const el = document.querySelector('.lsb-title-quotes-float')
      if (el) clamp(el)
    }
    function onVis() {
      if (!api.store.get('floatOpen')) return
      if (pageVisible()) startBeatTimer()
      else stopBeatTimer()
    }
    function onKey(e) {
      if (e.key !== 'Escape') return
      if (document.querySelector('.lsb-panel')) return
      if (!api.store.get('floatOpen')) return
      closeFloat()
    }
    function mountFloat() {
      let el = document.querySelector('.lsb-title-quotes-float')
      if (!el) {
        el = document.createElement('div')
        el.className = 'lsb-title-quotes-float'
        el.innerHTML =
          `<div class="lsb-title-quotes-float-head"><strong>称号行情</strong>` +
          `<button type="button" class="lsb-btn" data-float-collapse>收起</button>` +
          `<button type="button" class="lsb-panel-close" data-float-close title="关闭">×</button></div>` +
          `<div class="lsb-title-quotes-float-body"></div>` +
          `<div class="lsb-title-quotes-float-resize"></div>`
        document.body.append(el)
        bindChrome(el)
      }
      applyRect(el)
      setCollapsed(!!api.store.get('floatCollapsed', false))
      return el
    }
    function closeFloat() {
      stopBeatTimer()
      const beat = api.store.get('watchBeat', null)
      if (beat && beat.id === tabId) {
        const off = { t: 0, id: tabId }
        api.store.set('watchBeat', off)
        api.tabs.post('watch', off)
      }
      api.store.set('floatOpen', false)
      unmountFloat()
      maybeReschedule()
    }
    function showFloat({ expand } = {}) {
      api.store.set('floatOpen', true)
      if (expand) api.store.set('floatCollapsed', false)
      const el = mountFloat()
      setCollapsed(!!api.store.get('floatCollapsed', false))
      const body = el.querySelector('.lsb-title-quotes-float-body')
      render(body)
      startBeatTimer()
      maybeReschedule()
    }
    function openFloat() {
      showFloat({ expand: true })
    }

    document.addEventListener('pointermove', onPointerMove)
    document.addEventListener('pointerup', onPointerUp)
    window.addEventListener('resize', onWinResize)
    document.addEventListener('keydown', onKey)
    document.addEventListener('visibilitychange', onVis)

    api.on('route:changed', () => {
      mountEmbed()
      if (isMarket()) scheduleForceSnap()
    })
    mountEmbed()
    if (isMarket()) scheduleForceSnap()
    api.onDispose(() => {
      if (timer) clearTimeout(timer)
      if (forceTimer) clearTimeout(forceTimer)
      if (sizeTimer) window.clearTimeout(sizeTimer)
      if (sizeWatch) sizeWatch.disconnect()
      sizeWatch = null
      stopBeatTimer()
      timer = null
      forceTimer = null
      document.removeEventListener('pointermove', onPointerMove)
      document.removeEventListener('pointerup', onPointerUp)
      window.removeEventListener('resize', onWinResize)
      document.removeEventListener('keydown', onKey)
      document.removeEventListener('visibilitychange', onVis)
      unmountEmbed()
      unmountFloat()
    })

    api.ui.tab({
      name: '称号行情',
      order: 66,
      render(host) {
        api.ui.buildForm(host, manifest.config, api.config(), (v) => api.saveConfig(v))
      },
    })

    api.ui.style(
        '.lsb-title-quotes-host{position:relative;min-width:0;width:100%;height:380px;min-height:240px;max-height:720px;resize:vertical;overflow:hidden;margin:2px 0 4px}' +
        '.lsb-title-quotes .lsb-svg,.lsb-title-quotes-embed .lsb-svg,.lsb-title-quotes-host .lsb-svg{display:block;width:100%;height:100%;max-width:none;color:var(--text,#222)}' +
        '.lsb-title-quotes-bar{cursor:crosshair}' +
        '.lsb-title-quotes-tip{position:absolute;z-index:4;display:none;pointer-events:none;font-size:12px;line-height:1.45;padding:6px 8px;border-radius:6px;background:var(--panel,#fff);color:var(--text,#222);border:1px solid var(--line,#ddd);box-shadow:0 6px 18px var(--shadow-medium,rgba(0,0,0,.18));white-space:pre-line;max-width:min(16em,calc(100% - 8px));overflow-wrap:anywhere;word-break:break-word}' +
        '.lsb-title-quotes-tip.is-on{display:block}' +
        '.lsb-title-quotes-anchors{display:grid;grid-template-columns:repeat(auto-fit,minmax(140px,1fr));gap:8px;margin:8px 0}' +
        '.lsb-title-quotes-pip{display:inline-block;width:7px;height:7px;border-radius:50%;margin-right:6px;vertical-align:0.1em}' +
        '.lsb-title-quotes-card{border:1px solid var(--line-soft,#eee);border-radius:8px;padding:8px 10px}' +
        '.lsb-title-quotes-card strong{display:block;font-size:16px;margin:2px 0}' +
        '.lsb-title-quotes-row{margin:6px 0;border:1px solid var(--line-soft,#eee);border-radius:8px;padding:6px 10px}' +
        '.lsb-title-quotes-row summary{cursor:pointer;display:flex;gap:8px;flex-wrap:wrap;align-items:baseline}' +
        '.lsb-title-quotes-row.is-off{opacity:.65}' +
        '.lsb-title-quotes-embed{margin:0 0 16px}' +
        '.lsb-title-quotes-fold{border:1px solid var(--line-soft,#eee);border-radius:8px;padding:8px 12px}' +
        '.lsb-title-quotes-fold-sum{cursor:pointer;display:flex;gap:8px;flex-wrap:wrap;align-items:baseline}' +
        '.lsb-title-quotes-chips{display:flex;flex-wrap:wrap;gap:6px;margin:8px 0}' +
        '.lsb-title-quotes-chip{padding:4px 10px;border:1px solid var(--line,#ddd);border-radius:6px;background:var(--bg,#fafafa);color:var(--text,#222);cursor:pointer;font-size:12px}' +
        '.lsb-title-quotes-chip:hover{border-color:var(--brand,#5eaaa0);color:var(--brand,#5eaaa0)}' +
        '.lsb-title-quotes-chip.is-primary{background:var(--brand,#5eaaa0);border-color:var(--brand,#5eaaa0);color:#fff}' +
        '.lsb-title-quotes-movers{display:grid;grid-template-columns:repeat(auto-fit,minmax(220px,1fr));gap:12px;margin:8px 0}' +
        '.lsb-title-quotes-mover{display:flex;gap:8px;justify-content:space-between;align-items:baseline;margin:4px 0;font-size:13px}' +
        '.lsb-title-quotes-name{border:0;background:none;padding:0;color:var(--brand,#5eaaa0);cursor:pointer;font:inherit;text-align:left}' +
        '.lsb-title-quotes-name:hover{text-decoration:underline}' +
        '.lsb-title-quotes-float{position:fixed;z-index:99990;display:flex;flex-direction:column;background:var(--panel,#fff);color:var(--text,#222);border:1px solid var(--line,#ddd);border-radius:10px;box-shadow:0 18px 48px var(--shadow-medium,rgba(0,0,0,.3));overflow:hidden;overscroll-behavior:contain}' +
        '.lsb-title-quotes-float-head{display:flex;align-items:center;gap:8px;padding:8px 10px;border-bottom:1px solid var(--line-soft,#eee);cursor:move;flex:0 0 auto}' +
        '.lsb-title-quotes-float-head strong{font-size:14px;margin-right:auto}' +
        '.lsb-title-quotes-float-head .lsb-panel-close{margin-left:0}' +
        '.lsb-title-quotes-float-body{flex:1;min-height:0;overflow:auto;overscroll-behavior:contain;padding:8px 12px}' +
        '.lsb-title-quotes-float-resize{position:absolute;right:0;bottom:0;width:14px;height:14px;cursor:nwse-resize}' +
        '.lsb-title-quotes-float.is-collapsed{height:auto !important;min-height:0 !important}' +
        '.lsb-title-quotes-float.is-collapsed .lsb-title-quotes-float-body,.lsb-title-quotes-float.is-collapsed .lsb-title-quotes-float-resize{display:none}',
    )

    api.handle('title-quotes:market-data', () => api.store.get('market', null))
    api.handle('title-quotes:refresh', () => refreshMarket())
    api.handle('title-quotes:debug', () => ({
      parseCards,
      parsePageCount,
      mergeListings,
      foldTitles,
      median,
      pickAnchors,
      bookFromListings,
      diffBook,
      estimateFlow,
      sumFlow,
      flowTraded,
      BOOK_STALE_MS,
      periodMs,
      rangeCutoff,
      fmtBarTip,
      fmtPct,
      movers,
      boardPair,
      foldCandles,
      mean,
      snapshotIndex,
      indexPoints,
      foldIndexCandles,
      sma,
      stdevPop,
      bollinger,
      overlays,
      pushSnap,
      ingestListings,
      series: get,
      reset: () => {
        set([])
        api.store.set('book', null)
        api.store.set('market', null)
      },
      snap: () => cycle(true),
      refresh: refreshMarket,
      intervalMs: pollMs,
      watching,
      watchBeat: () => api.store.get('watchBeat', null),
      setWatchBeat: (v) => api.store.set('watchBeat', v),
      openFloat,
      closeFloat,
      barMin: getBarMin,
      writeWatchBeat,
      tabId: () => tabId,
      armed: () => !!timer,
      lastErr: () => lastErr,
      lastAt: () => lastAt,
    }))

    return {}
  }

  const w = typeof unsafeWindow !== 'undefined' ? unsafeWindow : window
  if (w.LSB && w.LSB.register) w.LSB.register(manifest, setup)
  else {
    w.LSB_PLUGINS = w.LSB_PLUGINS || []
    w.LSB_PLUGINS.push({ manifest, setup })
  }
})()


;
/* ══════════════ LSB·UR 合成规划 v0.1.3 (title-forge-planner) ══════════════ */
(function () {
  'use strict'

  const manifest = {
    id: 'title-forge-planner',
    name: 'UR 合成规划',
    version: '0.1.3',
    description: '根据配方、行情、抽取概率、积分和库存规划 UR 合成路径',
    author: 'you',
    requires: { base: '^0.2.2', plugins: { 'title-quotes': '^1.0.19' } },
    permissions: ['read', 'storage', 'ui', 'events'],
  }

  function toDocument(input) {
    if (typeof input === 'string') return new DOMParser().parseFromString(input, 'text/html')
    if (input?.querySelectorAll) return input
    return document
  }

  function textOf(el) {
    return (el?.textContent || '').trim()
  }

  function attrOrText(el, attr, pattern) {
    const value = el?.getAttribute?.(attr)
    if (value != null && String(value).trim()) return String(value).trim()
    const text = textOf(el)
    const match = text.match(pattern)
    return match ? match[1].trim() : ''
  }

  function numberAttrOrText(el, attr, pattern) {
    const raw = attrOrText(el, attr, pattern)
    if (!raw) return null
    const n = Number(raw.replace(/,/g, ''))
    return Number.isFinite(n) ? n : null
  }

  function classRarity(el) {
    const match = String(el?.className || '').match(/(?:^|\s)gacha-(?:title|pool-rarity)-(ur|ssr|sr|r|n)(?:\s|$)/i)
    return match ? match[1].toUpperCase() : ''
  }

  function titleParts(el) {
    const badge = el?.matches?.('.gacha-title-badge') ? el : el?.querySelector?.('.gacha-title-badge')
    const name = textOf(badge?.querySelector?.('.gacha-title-name')) || textOf(el?.querySelector?.('.gacha-title-name')) || ''
    const rarity = (textOf(badge?.querySelector?.('.gacha-title-rarity')) || textOf(el?.querySelector?.('.gacha-title-rarity')) || classRarity(badge) || classRarity(el)).toUpperCase()
    return { name, rarity }
  }

  function slashQuantity(el) {
    const match = textOf(el).match(/\s+([\d,]+)\s*\/\s*([\d,]+)\s*$/)
    if (!match) return null
    const owned = Number(match[1].replace(/,/g, ''))
    const qty = Number(match[2].replace(/,/g, ''))
    return Number.isFinite(owned) && Number.isFinite(qty) ? { owned, qty } : null
  }

  function countFromClass(el) {
    const match = String(el?.className || '').match(/(?:^|\s)gacha-pull-(\d+)(?:\s|$)/i)
    return match ? Number(match[1]) : null
  }

  function keyOf(name, rarity) {
    return `${name}@${rarity || ''}`
  }

  function issue(scope, reason, extra = {}) {
    return { scope, reason, ...extra }
  }

  function parseRecipes(input) {
    const root = toDocument(input)
    const recipes = []
    const issues = []
    const nodes = [...root.querySelectorAll('[data-gacha-recipe], .gacha-recipe-card')]
    if (!nodes.length) {
      return { recipes, issues: [issue('recipes', 'recipes-not-found')] }
    }
    for (const el of nodes) {
      const actualCard = el.matches?.('.gacha-recipe-card')
      const form = el.querySelector('form')
      const recipeId = form?.querySelector('[name="recipe_id"]')?.getAttribute('value')
      const id = (el.getAttribute('data-recipe-id') || '').trim() || recipeId?.trim() || `recipe-${recipes.length + issues.length + 1}`
      const targetBadge = actualCard ? el.querySelector('.gacha-recipe-target .gacha-title-badge') : null
      const targetTitle = titleParts(targetBadge)
      const targetName = targetTitle.name || attrOrText(el, 'data-target-name', /(?:目标|产出|结果)\s*[:：]?\s*(.+?)(?:\s+(?:UR|SSR|SR|R|N)\b|$)/i) ||
        textOf(el.querySelector('[data-gacha-target], .gacha-recipe-target, h1, h2, h3, h4, strong')).match(/^\s*(.+?)\s+(?:UR|SSR|SR|R|N)\b/i)?.[1]?.trim() ||
        textOf(el).match(/^\s*(.+?)\s+(?:UR|SSR|SR|R|N)\b/i)?.[1]?.trim() || ''
      const targetRarity = (targetTitle.rarity || attrOrText(el, 'data-target-rarity', /\b(UR|SSR|SR|R|N)\b/i)).toUpperCase()
      let fee = numberAttrOrText(el, 'data-fee', /(?:费用|消耗|积分)\s*[:：]?\s*([\d,]+(?:\.\d+)?)/)
      if (actualCard && fee == null) fee = 0
      if (targetRarity !== 'UR') continue
      const materials = actualCard ? [...el.querySelectorAll('.gacha-recipe-materials > span')] : [...el.querySelectorAll('[data-gacha-material]')]
      const inputs = []
      let invalid = false
      for (const material of materials) {
        const parsedTitle = titleParts(material)
        const slash = slashQuantity(material)
        const rawMaterial = textOf(material)
        const name = attrOrText(material, 'data-name', /^\s*(.+?)\s+(?:UR|SSR|SR|R|N)\b/i) ||
          parsedTitle.name ||
          (actualCard ? rawMaterial.replace(/\s+[\d,]+\s*\/\s*[\d,]+\s*$/, '').trim() : '')
        const rarity = (parsedTitle.rarity || attrOrText(material, 'data-rarity', /\b(UR|SSR|SR|R|N)\b/i)).toUpperCase()
        const qty = numberAttrOrText(material, 'data-qty', /[×x]\s*([\d,]+(?:\.\d+)?)/i) ?? slash?.qty
        if (!name || (!actualCard && !rarity) || !Number.isFinite(qty) || qty <= 0) {
          invalid = true
          break
        }
        inputs.push({ key: keyOf(name, rarity), name, rarity, qty })
      }
      if (!targetName || targetRarity !== 'UR' || !inputs.length || !Number.isFinite(fee) || fee < 0 || invalid) {
        issues.push(issue('recipe', 'recipe-incomplete', { id }))
        continue
      }
      recipes.push({
        id,
        target: { key: keyOf(targetName, targetRarity), name: targetName, rarity: targetRarity },
        inputs,
        fee,
      })
    }
    return { recipes, issues }
  }

  function parseGacha(input) {
    const root = toDocument(input)
    const pools = []
    const issues = []
    const titleCatalog = []
    const knownTitles = new Set()
    const addTitle = (name, rarity) => {
      if (!name || !rarity) return
      const key = keyOf(name, rarity)
      if (knownTitles.has(key)) return
      knownTitles.add(key)
      titleCatalog.push({ key, name, rarity })
    }
    const nodes = [...root.querySelectorAll('[data-gacha-pool]')]
    if (nodes.length) {
      for (const el of nodes) {
        const id = (el.getAttribute('data-pool-id') || '').trim() || `pool-${pools.length + issues.length + 1}`
        const label = (el.getAttribute('data-pool-label') || '').trim() || textOf(el.querySelector('[data-gacha-pool-label]')) || id
        const drawCost = numberAttrOrText(el, 'data-draw-cost', /(?:抽取|消耗|费用)\s*[:：]?\s*([\d,]+(?:\.\d+)?)/)
        const outcomes = []
        let invalid = false
        for (const outcome of el.querySelectorAll('[data-gacha-outcome]')) {
          const name = attrOrText(outcome, 'data-name', /^\s*(.+?)\s+(?:UR|SSR|SR|R|N)\b/i)
          const rarity = attrOrText(outcome, 'data-rarity', /\b(UR|SSR|SR|R|N)\b/i).toUpperCase()
          const probability = numberAttrOrText(outcome, 'data-probability', /([\d.]+)\s*%?/)
          const probabilitySource = outcome.getAttribute('data-probability') || textOf(outcome)
          const normalizedProbability = probability != null && /%/.test(probabilitySource) ? probability / 100 : probability
          if (!name || !rarity || !Number.isFinite(normalizedProbability) || normalizedProbability < 0 || normalizedProbability > 1) {
            invalid = true
            continue
          }
          addTitle(name, rarity)
          outcomes.push({ key: keyOf(name, rarity), name, rarity, probability: normalizedProbability })
        }
        const total = outcomes.reduce((sum, item) => sum + item.probability, 0)
        if (!Number.isFinite(drawCost) || drawCost <= 0 || !outcomes.length || invalid) {
          issues.push(issue('pool', 'pool-incomplete', { id }))
          continue
        }
        const probabilityComplete = Math.abs(total - 1) <= 1e-9
        if (!probabilityComplete) issues.push(issue('pool', 'probability-incomplete', { id, total }))
        pools.push({ id, label, drawCost, outcomes, probabilityComplete })
      }
      return { pools, titleCatalog, issues }
    }

    const rarityNodes = [...root.querySelectorAll('.gacha-pool-section .gacha-pool-rarity')]
    const allItems = [...root.querySelectorAll('.gacha-all-item')]
    if (!rarityNodes.length && !allItems.length) return { pools, titleCatalog, issues: [issue('gacha', 'pools-not-found')] }
    for (const item of allItems) {
      const title = titleParts(item)
      addTitle(title.name, title.rarity)
    }
    if (!rarityNodes.length || !titleCatalog.length) {
      return { pools, titleCatalog, issues: [issue('gacha', 'pool-incomplete')] }
    }

    const rates = new Map()
    let invalid = false
    for (const el of rarityNodes) {
      const rarity = (textOf(el.querySelector('.gacha-pool-rarity-label')) || classRarity(el)).toUpperCase()
      const countMatch = textOf(el.querySelector('.gacha-pool-rarity-count')).match(/([\d,]+)\s*种/)
      const rateMatch = textOf(el.querySelector('.gacha-pool-rarity-rate')).match(/([\d.]+)\s*%/)
      const count = countMatch ? Number(countMatch[1].replace(/,/g, '')) : null
      const probability = rateMatch ? Number(rateMatch[1]) / 100 : null
      if (!rarity || !Number.isInteger(count) || count < 0 || !Number.isFinite(probability) || probability < 0 || probability > 1) {
        invalid = true
        continue
      }
      rates.set(rarity, { count, probability })
    }

    const outcomes = []
    for (const title of titleCatalog) {
      const rate = rates.get(title.rarity)
      if (!rate || rate.count <= 0) continue
      outcomes.push({ ...title, probability: rate.probability / rate.count })
    }
    const total = [...rates.values()].reduce((sum, item) => sum + item.probability, 0)
    const positiveRatesMissingTitles = [...rates.entries()].some(([rarity, rate]) => rate.probability > 0 && (rate.count <= 0 || !titleCatalog.some((title) => title.rarity === rarity)))
    const probabilityComplete = !invalid && !positiveRatesMissingTitles && Math.abs(total - 1) <= 1e-9
    const costOptions = [...root.querySelectorAll('.gacha-pull-btn[data-cost]')].map((button) => {
      const cost = Number((button.getAttribute('data-cost') || '').replace(/,/g, ''))
      const count = countFromClass(button)
      return Number.isFinite(cost) && cost > 0 && Number.isFinite(count) && count > 0 ? cost / count : null
    }).filter((cost) => cost != null)
    const drawCost = costOptions.length ? Math.min(...costOptions) : null
    const id = 'standard'
    if (!Number.isFinite(drawCost) || drawCost <= 0 || !outcomes.length || !probabilityComplete) {
      issues.push(issue('pool', !probabilityComplete ? 'probability-incomplete' : 'pool-incomplete', { id, total }))
    }
    if (Number.isFinite(drawCost) && drawCost > 0 && outcomes.length) {
      pools.push({ id, label: '标准抽取（按页面概率和同稀有度数量均分）', drawCost, outcomes, probabilityComplete })
    }
    return { pools, titleCatalog, issues }
  }

  function parseInventory(input) {
    const root = toDocument(input)
    const inventory = {}
    const issues = []
    const actualPage = !!root.querySelector('.gacha-profile-page')
    const nodes = [...root.querySelectorAll('[data-gacha-owned], .gacha-profile-item')]
    if (!nodes.length) return { inventory, issues: [issue('inventory', 'inventory-not-found')], recognized: actualPage || !!root.querySelector('[data-gacha-profile]') }
    for (const el of nodes) {
      const actualItem = el.matches?.('.gacha-profile-item')
      const title = titleParts(el.querySelector('.gacha-profile-badge') || el)
      const raw = textOf(el)
      const name = attrOrText(el, 'data-name', /^\s*(.+?)\s+(?:UR|SSR|SR|R|N)\b/i) ||
        title.name ||
        (actualItem ? raw.match(/^\s*(.+?)(?:\s+\S+)?\s+\S+\s+×\s*[\d,]+/i)?.[1]?.trim() || '' : '')
      const rarity = (title.rarity || attrOrText(el, 'data-rarity', /\b(UR|SSR|SR|R|N)\b/i)).toUpperCase()
      const qtySource = actualItem ? el.querySelector('.gacha-status-tag') || el : el
      const qty = numberAttrOrText(qtySource, 'data-qty', /[×x]\s*([\d,]+(?:\.\d+)?)/i)
      if (!name || !rarity || !Number.isFinite(qty) || qty < 0) {
        issues.push(issue('inventory', 'inventory-entry-incomplete'))
        continue
      }
      const key = keyOf(name, rarity)
      inventory[key] = (inventory[key] || 0) + qty
    }
    return { inventory, issues, recognized: actualPage || !!root.querySelector('[data-gacha-profile]') }
  }

  function aggregateRequirements(inputs) {
    const out = new Map()
    for (const input of inputs || []) {
      if (!input || !input.key || !Number.isFinite(Number(input.qty)) || Number(input.qty) <= 0) continue
      const qty = Number(input.qty)
      const current = out.get(input.key)
      if (current) current.qty += qty
      else out.set(input.key, {
        key: input.key,
        name: input.name || String(input.key).split('@').slice(0, -1).join('@'),
        rarity: input.rarity || String(input.key).split('@').pop() || '',
        qty,
      })
    }
    return [...out.values()]
  }

  function missingInputs(inputs, inventory = {}) {
    const owned = inventory && typeof inventory === 'object' ? inventory : {}
    return aggregateRequirements(inputs).flatMap((input) => {
      const have = Number(owned[input.key])
      const qty = Math.max(0, input.qty - (Number.isFinite(have) && have > 0 ? have : 0))
      return qty > 0 ? [{ ...input, qty }] : []
    })
  }

  function planResult(status, cost, fee, steps, reason, currentPoints = null) {
    const points = currentPoints == null || !Number.isFinite(Number(currentPoints)) ? null : Number(currentPoints)
    const amount = Number.isFinite(Number(cost)) ? Number(cost) : null
    return {
      status,
      cost: amount,
      fee: Number.isFinite(Number(fee)) ? Number(fee) : null,
      steps: steps || [],
      reason: reason || null,
      currentPoints: points,
      remaining: points != null && amount != null ? Math.max(0, points - amount) : null,
      shortfall: points != null && amount != null ? Math.max(0, amount - points) : null,
    }
  }

  function applyPoints(plan, points) {
    if (!plan || plan.status === 'unavailable') {
      const out = planResult(plan?.status || 'unavailable', plan?.cost, plan?.fee, plan?.steps, plan?.reason, points)
      for (const key of ['expected', 'approximate', 'expectedDraws', 'expectedCost', 'poolChoices', 'missing']) {
        if (plan?.[key] !== undefined) out[key] = plan[key]
      }
      return out
    }
    const out = planResult(plan.status, plan.cost, plan.fee, plan.steps, plan.reason, points)
    for (const key of ['expected', 'approximate', 'expectedDraws', 'expectedCost', 'poolChoices', 'missing']) {
      if (plan[key] !== undefined) out[key] = plan[key]
    }
    if (out.currentPoints != null && out.cost != null && out.cost > out.currentPoints) out.status = 'insufficient'
    return out
  }

  function unavailable(reason, fee = null, steps = [], points = null) {
    return planResult('unavailable', null, fee, steps, reason, points)
  }

  function marketCost(requirements, listings, fee) {
    if (!Number.isFinite(Number(fee)) || Number(fee) < 0) return unavailable('fee-missing')
    const rows = aggregateRequirements(requirements)
    const byKey = new Map()
    for (let i = 0; i < (listings || []).length; i++) {
      const listing = listings[i]
      const price = Number(listing?.price)
      const qty = Number(listing?.qty)
      if (!listing?.key || !Number.isFinite(price) || price < 0 || !Number.isFinite(qty) || qty <= 0) continue
      if (!byKey.has(listing.key)) byKey.set(listing.key, [])
      byKey.get(listing.key).push({ key: listing.key, price, qty, index: i })
    }
    for (const group of byKey.values()) group.sort((a, b) => a.price - b.price || a.index - b.index)
    const steps = [{ kind: 'fee', fee: Number(fee), cost: Number(fee) }]
    const missing = []
    let total = Number(fee)
    for (const requirement of rows) {
      let remaining = requirement.qty
      for (const listing of byKey.get(requirement.key) || []) {
        if (remaining <= 0) break
        const qty = Math.min(remaining, listing.qty)
        const cost = qty * listing.price
        steps.push({ kind: 'market', key: requirement.key, price: listing.price, qty, cost })
        total += cost
        remaining -= qty
      }
      if (remaining > 0) missing.push({ ...requirement, qty: remaining })
    }
    if (missing.length) {
      const out = unavailable('market-insufficient', Number(fee), steps)
      out.missing = missing
      return out
    }
    return planResult('ok', total, Number(fee), steps, 'market-low')
  }

  function medianCost(requirements, titles, fee) {
    if (!Number.isFinite(Number(fee)) || Number(fee) < 0) return unavailable('fee-missing')
    const rows = aggregateRequirements(requirements)
    const steps = [{ kind: 'fee', fee: Number(fee), cost: Number(fee) }]
    let total = Number(fee)
    for (const requirement of rows) {
      const mid = Number(titles?.[requirement.key]?.mid)
      if (!Number.isFinite(mid) || mid < 0) return unavailable('median-missing', Number(fee), steps)
      const cost = mid * requirement.qty
      steps.push({ kind: 'median', key: requirement.key, price: mid, qty: requirement.qty, cost })
      total += cost
    }
    return planResult('ok', total, Number(fee), steps, 'market-median')
  }

  function recipeFor(key, recipes) {
    return (recipes || []).find((recipe) => recipe?.target?.key === key) || null
  }

  function expandNode(recipe, recipes, trail, scale, leaves, steps) {
    const recipeFee = Number(recipe?.fee)
    if (!Number.isFinite(recipeFee) || recipeFee < 0) return { fee: 0, issue: 'fee-missing' }
    steps.push({ kind: 'recipe', id: recipe.id, target: recipe.target, qty: scale, fee: recipeFee * scale })
    let fee = recipeFee * scale
    let issueReason = null
    for (const input of recipe.inputs || []) {
      const qty = Number(input.qty) * scale
      const child = recipeFor(input.key, recipes)
      if (!child) {
        const current = leaves.get(input.key)
        if (current) current.qty += qty
        else leaves.set(input.key, { ...input, qty })
        continue
      }
      if (trail.has(child.target.key)) {
        issueReason ||= 'recipe-cycle'
        steps.push({ kind: 'direct', key: input.key, name: input.name, rarity: input.rarity, qty })
        const current = leaves.get(input.key)
        if (current) current.qty += qty
        else leaves.set(input.key, { ...input, qty })
        continue
      }
      const nextTrail = new Set(trail)
      nextTrail.add(child.target.key)
      const nested = expandNode(child, recipes, nextTrail, qty, leaves, steps)
      fee += nested.fee
      issueReason ||= nested.issue
    }
    return { fee, issue: issueReason }
  }

  function expandRequirements(targetRecipe, recipes, inventory = {}, seen = new Set()) {
    const leaves = new Map()
    const steps = []
    const trail = new Set(seen || [])
    if (targetRecipe?.target?.key) trail.add(targetRecipe.target.key)
    const expanded = expandNode(targetRecipe, recipes || [], trail, 1, leaves, steps)
    const allRequirements = [...leaves.values()]
    const requirements = missingInputs(allRequirements, inventory)
    const owned = inventory && typeof inventory === 'object' ? inventory : {}
    for (const input of allRequirements) {
      const have = Number(owned[input.key])
      const used = Math.min(input.qty, Number.isFinite(have) && have > 0 ? have : 0)
      if (used > 0) steps.push({ kind: 'inventory', key: input.key, name: input.name, rarity: input.rarity, qty: used })
    }
    return {
      requirements,
      fee: expanded.fee,
      steps,
      issue: expanded.issue || null,
      reason: expanded.issue || null,
    }
  }

  function addRecipeContext(route, expansion, recipe) {
    if (!route || route.status === 'unavailable') return route
    const context = expansion?.steps?.length ? expansion.steps : [{ kind: 'recipe', id: recipe.id, target: recipe.target, qty: 1, fee: recipe.fee }]
    return { ...route, steps: [...context, ...route.steps] }
  }

  function bestRoute(routes) {
    const valid = (routes || []).filter((route) => route && route.status !== 'unavailable' && Number.isFinite(route.cost))
    if (!valid.length) return routes?.find(Boolean) || unavailable('no-route')
    return valid.slice().sort((a, b) => a.cost - b.cost || (a.reason === 'market-low' ? -1 : 1))[0]
  }

  function planMarket({ recipes = [], market = {}, inventory = {}, points = null } = {}) {
    const out = []
    for (const recipe of recipes || []) {
      if (!recipe?.target?.key || recipe.target.rarity !== 'UR') continue
      const direct = { requirements: missingInputs(recipe.inputs, inventory), fee: recipe.fee, steps: [] }
      const directLow = addRecipeContext(marketCost(direct.requirements, market?.listings || [], direct.fee), direct, recipe)
      const directMedian = addRecipeContext(medianCost(direct.requirements, market?.titles || {}, direct.fee), direct, recipe)
      const expanded = expandRequirements(recipe, recipes, inventory, new Set())
      const candidates = [directLow, directMedian]
      if (!expanded.issue) {
        candidates.push(addRecipeContext(marketCost(expanded.requirements, market?.listings || [], expanded.fee), expanded, recipe))
        candidates.push(addRecipeContext(medianCost(expanded.requirements, market?.titles || {}, expanded.fee), expanded, recipe))
      }
      const route = applyPoints(bestRoute(candidates), points)
      out.push({ target: recipe.target, recipe, route, routes: {
        marketLow: applyPoints(bestRoute([directLow, !expanded.issue ? candidates[2] : null]), points),
        marketMedian: applyPoints(bestRoute([directMedian, !expanded.issue ? candidates[3] : null]), points),
      } })
    }
    return out.sort((a, b) => (a.route.cost ?? Infinity) - (b.route.cost ?? Infinity) || a.target.key.localeCompare(b.target.key, 'zh-CN') || String(a.recipe.id).localeCompare(String(b.recipe.id)))
  }

  const MAX_EXACT_GACHA_STATES = 250000
  const APPROX_GACHA_STEPS = 2048

  function stateSpaceSize(rows, limit = MAX_EXACT_GACHA_STATES) {
    let size = 1
    for (const row of rows || []) {
      size *= Number(row?.qty || 0) + 1
      if (size > limit) return size
    }
    return size
  }

  function logFactorial(n) {
    let value = 0
    for (let i = 2; i <= n; i++) value += Math.log(i)
    return value
  }

  function poissonTailAtLeast(shape, mean, shapeLogFactorial) {
    if (!(mean > 0)) return 0
    const threshold = shape + 12 * Math.sqrt(shape + 1)
    if (mean > threshold) {
      let term = Math.exp(-mean)
      let sum = term
      for (let k = 1; k < shape; k++) {
        term *= mean / k
        sum += term
      }
      return Math.max(0, Math.min(1, 1 - sum))
    }
    let term = Math.exp(-mean + shape * Math.log(mean) - shapeLogFactorial)
    let sum = term
    for (let k = shape; k < shape + 10000; k++) {
      term *= mean / (k + 1)
      sum += term
      if (k > mean && term <= sum * 1e-15) break
    }
    return Math.max(0, Math.min(1, sum))
  }

  function approximateSinglePoolDraws(rows, pool) {
    const probabilities = new Map()
    for (const outcome of pool?.outcomes || []) {
      const probability = Number(outcome?.probability)
      if (!outcome?.key || !Number.isFinite(probability) || probability <= 0) continue
      probabilities.set(outcome.key, (probabilities.get(outcome.key) || 0) + probability)
    }
    const normalized = (rows || []).map((row) => ({
      qty: Number(row.qty),
      probability: Number(probabilities.get(row.key)),
      logFactorial: logFactorial(Number(row.qty)),
    }))
    if (normalized.some((row) => !Number.isInteger(row.qty) || row.qty < 1 || !(row.probability > 0))) return null
    const upper = Math.max(...normalized.map((row) => (row.qty + 12 * Math.sqrt(row.qty + 1)) / row.probability))
    if (!Number.isFinite(upper) || upper <= 0) return null
    const integrand = (time) => {
      let completed = 1
      for (const row of normalized) {
        completed *= poissonTailAtLeast(row.qty, row.probability * time, row.logFactorial)
        if (completed === 0) break
      }
      return Math.max(0, 1 - completed)
    }
    const integrate = (steps) => {
      const width = upper / steps
      let sum = integrand(0) + integrand(upper)
      for (let i = 1; i < steps; i++) sum += (i % 2 ? 4 : 2) * integrand(i * width)
      return sum * width / 3
    }
    let steps = APPROX_GACHA_STEPS
    let value = integrate(steps)
    for (let i = 0; i < 2; i++) {
      const next = integrate(steps * 2)
      if (Math.abs(next - value) <= Math.max(1e-6, Math.abs(next) * 1e-5)) {
        value = next
        break
      }
      value = next
      steps *= 2
    }
    return Number.isFinite(value) && value >= 0 ? value : null
  }

  function expectedGachaCost(requirements, pools, fee) {
    if (!Number.isFinite(Number(fee)) || Number(fee) < 0) return unavailable('fee-missing')
    const rows = aggregateRequirements(requirements)
    if (rows.some((row) => !Number.isInteger(row.qty) || row.qty < 1)) return unavailable('requirements-invalid', Number(fee))
    const validPools = []
    let sawIncomplete = false
    for (const pool of pools || []) {
      const drawCost = Number(pool?.drawCost)
      if (!Number.isFinite(drawCost) || drawCost <= 0 || !Array.isArray(pool?.outcomes) || pool.outcomes.length === 0) {
        sawIncomplete = true
        continue
      }
      const outcomes = pool.outcomes.filter((outcome) => {
        const p = Number(outcome?.probability)
        return outcome?.key && Number.isFinite(p) && p >= 0 && p <= 1
      })
      const total = outcomes.reduce((sum, outcome) => sum + Number(outcome.probability), 0)
      if (outcomes.length !== pool.outcomes.length || Math.abs(total - 1) > 1e-9 || pool.probabilityComplete === false) {
        sawIncomplete = true
        continue
      }
      validPools.push({ ...pool, drawCost, outcomes })
    }
    if (!validPools.length) return unavailable(sawIncomplete ? 'probability-incomplete' : 'gacha-unavailable', Number(fee))
    const estimatedStates = stateSpaceSize(rows)
    if (estimatedStates > MAX_EXACT_GACHA_STATES) {
      if (validPools.length !== 1) return unavailable('state-space-too-large', Number(fee))
      const pool = validPools[0]
      const expectedDraws = approximateSinglePoolDraws(rows, pool)
      if (!Number.isFinite(expectedDraws)) return unavailable('gacha-unavailable', Number(fee))
      const expectedCost = pool.drawCost * expectedDraws
      const steps = [
        { kind: 'fee', fee: Number(fee), cost: Number(fee) },
        { kind: 'gacha', expected: true, approximate: true, expectedDraws, expectedCost, choices: [{ poolId: pool.id || null, label: pool.label || pool.id || '', approximate: true }] },
      ]
      const result = planResult('ok', Number(fee) + expectedCost, Number(fee), steps, 'gacha')
      result.expected = true
      result.approximate = true
      result.expectedDraws = expectedDraws
      result.expectedCost = expectedCost
      result.poolChoices = steps[1].choices
      return result
    }
    const indexOf = new Map(rows.map((row, index) => [row.key, index]))
    const memo = new Map()
    const solve = (remaining) => {
      const stateKey = remaining.join(',')
      if (memo.has(stateKey)) return memo.get(stateKey)
      if (remaining.every((qty) => qty === 0)) {
        const done = { cost: 0, draws: 0, choices: [] }
        memo.set(stateKey, done)
        return done
      }
      let best = null
      for (const pool of validPools) {
        const transitions = new Map()
        for (const outcome of pool.outcomes) {
          const index = indexOf.get(outcome.key)
          if (index == null || remaining[index] <= 0) continue
          transitions.set(index, (transitions.get(index) || 0) + Number(outcome.probability))
        }
        const progressProbability = [...transitions.values()].reduce((sum, p) => sum + p, 0)
        if (!(progressProbability > 0)) continue
        let childCost = 0
        let childDraws = 0
        let valid = true
        for (const [index, probability] of transitions) {
          const next = remaining.slice()
          next[index] -= 1
          const child = solve(next)
          if (!child) {
            valid = false
            break
          }
          childCost += probability * child.cost
          childDraws += probability * child.draws
        }
        if (!valid) continue
        const candidate = {
          cost: (pool.drawCost + childCost) / progressProbability,
          draws: (1 + childDraws) / progressProbability,
          // 只保留当前状态的最优决策；把所有后续概率分支展开到 choices
          // 会产生指数级重复数组，真实 UR 配方会因此耗尽页面内存。
          choices: [{ poolId: pool.id || null, label: pool.label || pool.id || '', state: stateKey, progressProbability }],
        }
        if (!best || candidate.cost < best.cost || (candidate.cost === best.cost && candidate.draws < best.draws)) best = candidate
      }
      memo.set(stateKey, best)
      return best
    }
    const solved = solve(rows.map((row) => row.qty))
    if (!solved) return unavailable('gacha-unavailable', Number(fee))
    const steps = [
      { kind: 'fee', fee: Number(fee), cost: Number(fee) },
      { kind: 'gacha', expected: true, expectedDraws: solved.draws, expectedCost: solved.cost, choices: solved.choices },
    ]
    const result = planResult('ok', Number(fee) + solved.cost, Number(fee), steps, 'gacha')
    result.expected = true
    result.expectedDraws = solved.draws
    result.expectedCost = solved.cost
    result.poolChoices = solved.choices
    return result
  }

  function resolveRecipeRarities(recipes, titleCatalog = [], fallbackKeys = []) {
    const byName = new Map()
    for (const title of titleCatalog || []) {
      if (!title?.name || !title?.rarity) continue
      if (!byName.has(title.name)) byName.set(title.name, new Set())
      byName.get(title.name).add(String(title.rarity).toUpperCase())
    }
    for (const key of fallbackKeys || []) {
      const value = String(key || '')
      const split = value.lastIndexOf('@')
      if (split <= 0) continue
      const name = value.slice(0, split)
      const rarity = value.slice(split + 1).toUpperCase()
      if (!name || !rarity) continue
      if (!byName.has(name)) byName.set(name, new Set())
      byName.get(name).add(rarity)
    }
    return (recipes || []).map((recipe) => ({
      ...recipe,
      inputs: (recipe.inputs || []).map((input) => {
        if (input?.rarity) return input
        const rarities = [...(byName.get(input?.name) || [])]
        if (rarities.length !== 1) return input
        const rarity = rarities[0]
        return { ...input, rarity, key: keyOf(input.name, rarity) }
      }),
    }))
  }

  function summarizeMode(targets, points) {
    const valid = (targets || []).filter((target) => target?.best && target.best.status !== 'unavailable' && Number.isFinite(target.best.cost))
    const ordered = valid.slice().sort((a, b) => a.best.cost - b.best.cost || a.target.key.localeCompare(b.target.key, 'zh-CN') || String(a.recipe.id).localeCompare(String(b.recipe.id)))
    const summaryEntry = (target) => target ? { ...target, route: target.best, cost: target.best.cost, shortfall: target.best.shortfall } : null
    const nearest = summaryEntry(ordered[0])
    if (points == null || !Number.isFinite(Number(points))) return { state: 'unknown', bestFeasible: null, nearest }
    const feasible = ordered.filter((target) => target.best.cost <= Number(points))
    if (feasible.length) return { state: 'feasible', bestFeasible: summaryEntry(feasible[0]), nearest }
    return { state: ordered.length ? 'insufficient' : 'unknown', bestFeasible: null, nearest }
  }

  function buildTargetPlan(recipe, recipes, market, gachaPools, inventory, points) {
    const direct = { requirements: missingInputs(recipe.inputs, inventory), fee: recipe.fee, steps: [] }
    const expanded = expandRequirements(recipe, recipes, inventory, new Set())
    const lowCandidates = [
      addRecipeContext(marketCost(direct.requirements, market?.listings || [], direct.fee), direct, recipe),
    ]
    const medianCandidates = [
      addRecipeContext(medianCost(direct.requirements, market?.titles || {}, direct.fee), direct, recipe),
    ]
    const gachaCandidates = [
      addRecipeContext(expectedGachaCost(direct.requirements, gachaPools, direct.fee), direct, recipe),
    ]
    if (!expanded.issue) {
      lowCandidates.push(addRecipeContext(marketCost(expanded.requirements, market?.listings || [], expanded.fee), expanded, recipe))
      medianCandidates.push(addRecipeContext(medianCost(expanded.requirements, market?.titles || {}, expanded.fee), expanded, recipe))
      gachaCandidates.push(addRecipeContext(expectedGachaCost(expanded.requirements, gachaPools, expanded.fee), expanded, recipe))
    }
    const routes = {
      marketLow: applyPoints(bestRoute(lowCandidates), points),
      marketMedian: applyPoints(bestRoute(medianCandidates), points),
      gacha: applyPoints(bestRoute(gachaCandidates), points),
    }
    return {
      target: recipe.target,
      recipe,
      routes,
      best: applyPoints(bestRoute(Object.values(routes)), points),
    }
  }

  function calculatePlans({ recipes = [], market = {}, gachaPools = [], inventory = {}, points = null } = {}) {
    const buildMode = (owned) => {
      const targets = (recipes || [])
        .filter((recipe) => recipe?.target?.rarity === 'UR')
        .map((recipe) => buildTargetPlan(recipe, recipes, market, gachaPools, owned, points))
        .sort((a, b) => a.target.key.localeCompare(b.target.key, 'zh-CN') || String(a.recipe.id).localeCompare(String(b.recipe.id)))
      return { targets, summary: summarizeMode(targets, points) }
    }
    return {
      modes: {
        noInventory: buildMode({}),
        inventory: buildMode(inventory || {}),
      },
      points: points == null || !Number.isFinite(Number(points)) ? null : Number(points),
    }
  }

  const FORGE_PREFERENCES_KEY = 'forge-preferences'
  const FORGE_PREFERENCES_VERSION = 1

  function normalizeForgePreferences(raw) {
    const source = raw && typeof raw === 'object' ? raw : {}
    const selection = {}
    if (source.selection && typeof source.selection === 'object') {
      for (const [key, value] of Object.entries(source.selection)) {
        if (key && typeof value === 'boolean') selection[key] = value
      }
    }
    const excludedTitles = [...new Set(
      (Array.isArray(source.excludedTitles) ? source.excludedTitles : [])
        .map((key) => String(key || '').trim())
        .filter(Boolean),
    )]
    return {
      version: FORGE_PREFERENCES_VERSION,
      selection,
      excludeSsr: source.excludeSsr === true,
      excludeRogueR: source.excludeRogueR !== false,
      excludedTitles,
    }
  }

  function forgeMaterialHost(input) {
    return input?.closest?.(
      '[data-gacha-forge-material], .gacha-forge-select, [data-gacha-forge-item], [data-gacha-forge-title]',
    ) || input?.closest?.('label') || input?.parentElement || input
  }

  function firstAttr(elements, names) {
    for (const el of elements) {
      for (const name of names) {
        const value = el?.getAttribute?.(name)
        if (value != null && String(value).trim()) return String(value).trim()
      }
    }
    return ''
  }

  function forgeMaterialMeta(input) {
    const host = forgeMaterialHost(input)
    const elements = [input, host]
    const rawText = textOf(host)
      .replace(/\b(?:UR|SSR|SR|R|N)\b/gi, '')
      .replace(/\b[\d,]+\s*\/\s*[\d,]+\b/g, '')
      .replace(/[×x]\s*[\d,]+(?:\.\d+)?/gi, '')
      .replace(/\s+/g, ' ')
      .trim()
    const name =
      firstAttr(elements, [
        'data-gacha-forge-title',
        'data-title',
        'data-title-name',
        'data-name',
      ]) ||
      textOf(host?.querySelector?.('[data-gacha-forge-title-name], .gacha-title-name')) ||
      titleParts(host).name ||
      rawText
    const rarity = (
      firstAttr(elements, [
        'data-gacha-forge-rarity',
        'data-rarity',
        'data-title-rarity',
      ]) ||
      textOf(host?.querySelector?.('[data-gacha-forge-title-rarity], .gacha-title-rarity')) ||
      titleParts(host).rarity ||
      textOf(host).match(/\b(UR|SSR|SR|R|N)\b/i)?.[1] ||
      ''
    ).toUpperCase()
    const id = firstAttr(elements, [
      'data-gacha-forge-title-id',
      'data-title-id',
      'data-gacha-title-id',
      'data-id',
    ])
    const fallbackName = name || id || input?.value || ''
    const key = fallbackName ? keyOf(fallbackName, rarity) : ''
    return { key, name: fallbackName, rarity, id }
  }

  function isForgeMaterialInput(input) {
    if (!input || String(input.type || '').toLowerCase() !== 'checkbox') return false
    if (input.matches?.('[data-gacha-forge-rarity], [data-gacha-forge-material], [data-gacha-forge-title]')) return true
    return !!input.closest?.('.gacha-forge-select, [data-gacha-forge-item], [data-gacha-forge-material]')
  }

  function findForgeMaterialInputs(input = document) {
    const root = toDocument(input)
    const seen = new Set()
    const nodes = []
    const selectors = [
      'input[type="checkbox"][data-gacha-forge-rarity]',
      '[data-gacha-forge-material] input[type="checkbox"]',
      '[data-gacha-forge-title] input[type="checkbox"]',
      '.gacha-forge-select input[type="checkbox"]',
      '[data-gacha-forge-item] input[type="checkbox"]',
    ]
    for (const selector of selectors) {
      for (const el of root.querySelectorAll?.(selector) || []) {
        if (seen.has(el) || !isForgeMaterialInput(el) || el.closest?.('[data-lsb-forge-controls]')) continue
        seen.add(el)
        nodes.push(el)
      }
    }
    return nodes
  }

  function readForgeSelection(inputs = []) {
    const selection = {}
    for (const input of inputs || []) {
      const meta = forgeMaterialMeta(input)
      if (meta.key) selection[meta.key] = !!input.checked
    }
    return selection
  }

  function isForgeRogueR(meta) {
    return meta?.rarity === 'R' && String(meta?.name || '').replace(/\s+/g, '') === '反贼'
  }

  function forgeExcluded(meta, preferences) {
    const excluded = new Set(preferences?.excludedTitles || [])
    return (preferences?.excludeSsr && meta.rarity === 'SSR') ||
      (preferences?.excludeRogueR && isForgeRogueR(meta)) ||
      excluded.has(meta.key)
  }

  function applyForgeSelection(inputs = [], preferences = {}, { dispatch = false } = {}) {
    const normalized = normalizeForgePreferences(preferences)
    for (const input of inputs || []) {
      const meta = forgeMaterialMeta(input)
      if (!meta.key) continue
      const excluded = forgeExcluded(meta, normalized)
      const desired = Object.prototype.hasOwnProperty.call(normalized.selection, meta.key)
        ? normalized.selection[meta.key]
        : !!input.checked
      const checked = desired && !excluded
      input.disabled = excluded
      if (excluded) input.setAttribute('aria-disabled', 'true')
      else input.removeAttribute('aria-disabled')
      if (input.checked === checked) continue
      input.checked = checked
      if (dispatch) input.dispatchEvent(new Event('change', { bubbles: true }))
    }
    return readForgeSelection(inputs)
  }

  function selectAllForgeMaterials(inputs = [], preferences = {}, { dispatch = false } = {}) {
    const normalized = normalizeForgePreferences(preferences)
    for (const input of inputs || []) {
      const meta = forgeMaterialMeta(input)
      if (!meta.key) continue
      const excluded = forgeExcluded(meta, normalized)
      input.disabled = excluded
      if (excluded) input.setAttribute('aria-disabled', 'true')
      else input.removeAttribute('aria-disabled')
      const checked = !excluded
      if (input.checked === checked) continue
      input.checked = checked
      if (dispatch) input.dispatchEvent(new Event('change', { bubbles: true }))
    }
    return readForgeSelection(inputs)
  }

  const SOURCE_NAMES = {
    recipes: '合成表',
    gacha: '抽取概率',
    inventory: '我的库存',
    market: '称号行情',
  }

  const SOURCE_TIMEOUT_MS = 10_000

  // ═══════════════════════════════════════════════════════════
  // 章节索引（1077 行，只读 UR 规划数据源，UI 已移至工作台）：
  //   A: 配方/概率/库存读取 B: calculate/refresh RPC
  // ═══════════════════════════════════════════════════════════
  function setup(api) {
    const sourceState = Object.fromEntries(Object.keys(SOURCE_NAMES).map((key) => [key, {
      status: 'idle', fetchedAt: null, error: null, stale: false, issues: [],
    }]))
    let data = { recipes: [], gachaPools: [], titleCatalog: [], inventory: {}, inventoryAvailable: false, market: null }
    let hostRef = null
    let refreshPromise = null
    let hasRendered = false
    let calculatedAt = null
    let forgePreferences = normalizeForgePreferences(api.store.get(FORGE_PREFERENCES_KEY, null))
    let forgeControls = null
    let forgeMount = null
    let forgeSyncTimer = null

    function cloneData(value) {
      try {
        return JSON.parse(JSON.stringify(value))
      } catch {
        return null
      }
    }

    function sourceMessage(error) {
      if (error?.message) return String(error.message)
      return String(error || '数据不足')
    }

    function classifyDocument(doc) {
      const body = String(doc?.body?.textContent || doc?.documentElement?.textContent || '').trim()
      if (/cloudflare|checking your browser|challenge/i.test(body)) return '挑战未完成'
      if (/登录|请先登录|log\s*in|sign\s*in/i.test(body) && !doc?.querySelector('[data-gacha-recipe], [data-gacha-pool], [data-gacha-owned]')) return '需要登录'
      return null
    }

    function sourceError(message) {
      const error = new Error(message)
      error.sourceMessage = message
      return error
    }

    function withSourceTimeout(job, timeoutMs = SOURCE_TIMEOUT_MS) {
      const controller = new AbortController()
      const parent = api.signal
      const forwardAbort = () => controller.abort(parent?.reason)
      if (parent?.aborted) forwardAbort()
      else parent?.addEventListener?.('abort', forwardAbort, { once: true })
      let timer = null
      const cleanup = () => {
        if (timer) clearTimeout(timer)
        parent?.removeEventListener?.('abort', forwardAbort)
      }
      return new Promise((resolve, reject) => {
        timer = setTimeout(() => {
          controller.abort()
          cleanup()
          reject(sourceError('读取超时'))
        }, timeoutMs)
        Promise.resolve()
          .then(() => job(controller.signal))
          .then(
            (value) => {
              cleanup()
              resolve(value)
            },
            (error) => {
              cleanup()
              reject(error)
            },
          )
      })
    }

    function setSource(key, patch) {
      Object.assign(sourceState[key], patch)
    }

    function hasSourceData(key) {
      if (key === 'recipes') return data.recipes.length > 0
      if (key === 'gacha') return data.gachaPools.length > 0
      if (key === 'inventory') return data.inventoryAvailable
      return !!data.market
    }

    function restoreCache() {
      const cached = api.store.get('snapshot', null)
      if (!cached?.data) return
      const saved = cached.data
      data = {
        recipes: Array.isArray(saved.recipes) ? saved.recipes : [],
        gachaPools: Array.isArray(saved.gachaPools) ? saved.gachaPools : [],
        titleCatalog: Array.isArray(saved.titleCatalog) ? saved.titleCatalog : [],
        inventory: saved.inventory && typeof saved.inventory === 'object' ? saved.inventory : {},
        inventoryAvailable: saved.inventoryAvailable === true,
        market: saved.market || null,
      }
      for (const key of Object.keys(SOURCE_NAMES)) {
        if (hasSourceData(key)) setSource(key, { status: 'stale', stale: true, fetchedAt: cached.savedAt || null })
      }
    }

    async function loadSources() {
      const jobs = {
        recipes: async (signal) => {
          const doc = await api.net.doc('/gacha_recipes', { signal })
          const failure = classifyDocument(doc)
          if (failure) throw sourceError(failure)
          const parsed = parseRecipes(doc)
          if (!parsed.recipes.length) throw sourceError(parsed.issues[0]?.reason === 'recipes-not-found' ? '页面格式无法识别' : '数据不足')
          return { value: parsed, partial: parsed.issues.length > 0 }
        },
        gacha: async (signal) => {
          const doc = await api.net.doc('/gacha', { signal })
          const failure = classifyDocument(doc)
          if (failure) throw sourceError(failure)
          const parsed = parseGacha(doc)
          if (!parsed.pools.length) throw sourceError(parsed.issues[0]?.reason === 'pools-not-found' ? '页面格式无法识别' : '数据不足')
          return { value: parsed, partial: parsed.issues.length > 0 }
        },
        inventory: async (signal) => {
          const doc = await api.net.doc('/gacha_profile', { signal })
          const failure = classifyDocument(doc)
          if (failure) throw sourceError(failure)
          const parsed = parseInventory(doc)
          if (!parsed.recognized) {
            throw sourceError(parsed.issues[0]?.reason === 'inventory-not-found' ? '页面格式无法识别' : '数据不足')
          }
          return { value: parsed, partial: parsed.issues.length > 0 }
        },
        market: async () => {
          const market = await api.request('title-quotes:market-data')
          if (!market || !Array.isArray(market.listings) || !market.titles || !Number.isFinite(Number(market.fetchedAt))) throw sourceError('数据不足')
          return { value: market, fetchedAt: Number(market.fetchedAt), partial: false }
        },
      }
      const entries = Object.entries(jobs)
      const results = await Promise.allSettled(entries.map(async ([key, job]) => [key, await withSourceTimeout(job)]))
      for (let i = 0; i < results.length; i++) {
        const result = results[i]
        const key = entries[i][0]
        if (result.status === 'fulfilled') {
          const loaded = result.value[1]
          const parsed = loaded.value
          if (key === 'recipes') data.recipes = parsed.recipes
          else if (key === 'gacha') {
            data.gachaPools = parsed.pools
            data.titleCatalog = parsed.titleCatalog || []
          } else if (key === 'inventory') {
            data.inventory = parsed.inventory
            data.inventoryAvailable = true
          } else data.market = parsed
          setSource(key, {
            status: loaded.partial ? 'partial' : 'ok',
            fetchedAt: loaded.fetchedAt || Date.now(),
            error: null,
            stale: false,
            issues: parsed.issues || [],
          })
        } else {
          const message = sourceMessage(result.reason)
          setSource(key, {
            status: hasSourceData(key) ? 'stale' : 'unavailable',
            error: message,
            stale: hasSourceData(key),
          })
        }
      }
      data.recipes = resolveRecipeRarities(
        data.recipes,
        data.titleCatalog,
        [
          ...Object.keys(data.market?.titles || {}),
          ...Object.keys(data.inventory || {}),
        ],
      )
      calculatedAt = Date.now()
      try {
        api.store.set('snapshot', { savedAt: Date.now(), data: cloneData(data) })
      } catch {
        /* storage failure does not invalidate current in-memory results */
      }
      return {
        sources: cloneData(sourceState),
        data: cloneData(data),
      }
    }

    function snapshot() {
      return {
        sources: cloneData(sourceState),
        data: cloneData(data),
      }
    }

    function publicSnapshot() {
      const full = snapshot()
      const sources = Object.fromEntries(['recipes', 'gacha', 'inventory'].map((key) => [key, full.sources[key]]))
      const data = { ...full.data }
      delete data.market
      return { sources, data }
    }

    function forgePageActive() {
      return api.page?.type === 'gacha_forge'
    }

    function forgeMountFor(inputs) {
      const first = inputs[0]
      return first?.closest?.('form') ||
        document.querySelector('[data-gacha-forge-page], .gacha-forge-page, .gacha-center-page') ||
        first?.parentElement ||
        document.body
    }

    function forgeSave(inputs) {
      forgePreferences = normalizeForgePreferences({
        ...forgePreferences,
        selection: {
          ...forgePreferences.selection,
          ...readForgeSelection(inputs),
        },
      })
      api.store.set(FORGE_PREFERENCES_KEY, forgePreferences)
      return forgePreferences
    }

    function forgeSelectionCount(inputs) {
      return (inputs || []).reduce((count, input) => count + (input.checked ? 1 : 0), 0)
    }

    function forgeUpdateSummary(inputs) {
      const summary = forgeControls?.querySelector?.('[data-lsb-forge-selection-count]')
      if (summary) summary.textContent = `已选 ${forgeSelectionCount(inputs)} 项`
    }

    function forgeRemoveControls() {
      forgeControls?.remove?.()
      forgeControls = null
      forgeMount = null
    }

    function forgeCreateControls(mount) {
      const controls = document.createElement('div')
      controls.className = 'lsb-title-forge-controls'
      controls.setAttribute('data-lsb-forge-controls', '')
      controls.innerHTML =
        '<button type="button" class="lsb-btn" data-lsb-forge-select-all>全选材料</button>' +
        '<label class="lsb-title-forge-exclude"><input type="checkbox" data-lsb-forge-exclude-ssr> 排除 SSR</label>' +
        '<label class="lsb-title-forge-exclude"><input type="checkbox" data-lsb-forge-exclude-rogue-r> 排除 R 级反贼</label>' +
        '<span class="lsb-title-forge-selection-count" data-lsb-forge-selection-count></span>'
      mount.insertBefore(controls, mount.firstChild)
      controls.querySelector('[data-lsb-forge-exclude-ssr]').checked = forgePreferences.excludeSsr
      controls.querySelector('[data-lsb-forge-exclude-rogue-r]').checked = forgePreferences.excludeRogueR
      controls.querySelector('[data-lsb-forge-select-all]').addEventListener('click', (event) => {
        event.preventDefault()
        const inputs = findForgeMaterialInputs(document)
        if (!inputs.length) return
        if (forgePreferences.excludeSsr) {
          const excluded = new Set(forgePreferences.excludedTitles)
          for (const input of inputs) {
            const meta = forgeMaterialMeta(input)
            if (meta.rarity === 'SSR' && meta.key) excluded.add(meta.key)
          }
          forgePreferences.excludedTitles = [...excluded]
        }
        if (forgePreferences.excludeRogueR) {
          const excluded = new Set(forgePreferences.excludedTitles)
          for (const input of inputs) {
            const meta = forgeMaterialMeta(input)
            if (isForgeRogueR(meta) && meta.key) excluded.add(meta.key)
          }
          forgePreferences.excludedTitles = [...excluded]
        }
        const selection = selectAllForgeMaterials(inputs, forgePreferences, { dispatch: true })
        forgePreferences = normalizeForgePreferences({
          ...forgePreferences,
          selection: { ...forgePreferences.selection, ...selection },
        })
        forgeSave(inputs)
        forgeUpdateSummary(inputs)
      })
      controls.querySelector('[data-lsb-forge-exclude-rogue-r]').addEventListener('change', (event) => {
        const inputs = findForgeMaterialInputs(document)
        const checked = !!event.currentTarget.checked
        const excluded = new Set(forgePreferences.excludedTitles)
        for (const input of inputs) {
          const meta = forgeMaterialMeta(input)
          if (!isForgeRogueR(meta) || !meta.key) continue
          if (checked) excluded.add(meta.key)
          else excluded.delete(meta.key)
        }
        forgePreferences = normalizeForgePreferences({
          ...forgePreferences,
          excludeRogueR: checked,
          excludedTitles: [...excluded],
        })
        applyForgeSelection(inputs, forgePreferences, { dispatch: true })
        forgeSave(inputs)
        forgeUpdateSummary(inputs)
      })
      controls.querySelector('[data-lsb-forge-exclude-ssr]').addEventListener('change', (event) => {
        const inputs = findForgeMaterialInputs(document)
        const checked = !!event.currentTarget.checked
        const excluded = new Set(forgePreferences.excludedTitles)
        if (!checked) {
          for (const key of excluded) {
            if (String(key).endsWith('@SSR')) excluded.delete(key)
          }
        }
        for (const input of inputs) {
          const meta = forgeMaterialMeta(input)
          if (!meta.key || meta.rarity !== 'SSR') continue
          if (checked) excluded.add(meta.key)
        }
        forgePreferences = normalizeForgePreferences({
          ...forgePreferences,
          excludeSsr: checked,
          excludedTitles: [...excluded],
        })
        applyForgeSelection(inputs, forgePreferences, { dispatch: true })
        forgeSave(inputs)
        forgeUpdateSummary(inputs)
      })
      return controls
    }

    function forgeSync() {
      forgeSyncTimer = null
      if (!forgePageActive()) {
        forgeRemoveControls()
        return
      }
      const inputs = findForgeMaterialInputs(document)
      if (!inputs.length) {
        forgeRemoveControls()
        return
      }
      const mount = forgeMountFor(inputs)
      if (!mount) return
      if (!forgeControls || forgeMount !== mount || !forgeControls.isConnected) {
        forgeRemoveControls()
        forgeMount = mount
        forgeControls = forgeCreateControls(mount)
      }
      if (forgePreferences.excludeSsr) {
        const excluded = new Set(forgePreferences.excludedTitles)
        for (const input of inputs) {
          const meta = forgeMaterialMeta(input)
          if (meta.rarity === 'SSR' && meta.key) excluded.add(meta.key)
        }
        forgePreferences = normalizeForgePreferences({ ...forgePreferences, excludedTitles: [...excluded] })
      }
      if (forgePreferences.excludeRogueR) {
        const excluded = new Set(forgePreferences.excludedTitles)
        for (const input of inputs) {
          const meta = forgeMaterialMeta(input)
          if (isForgeRogueR(meta) && meta.key) excluded.add(meta.key)
        }
        forgePreferences = normalizeForgePreferences({ ...forgePreferences, excludedTitles: [...excluded] })
      }
      applyForgeSelection(inputs, forgePreferences, { dispatch: true })
      forgeSave(inputs)
      const exclude = forgeControls.querySelector('[data-lsb-forge-exclude-ssr]')
      if (exclude) exclude.checked = forgePreferences.excludeSsr
      const excludeRogue = forgeControls.querySelector('[data-lsb-forge-exclude-rogue-r]')
      if (excludeRogue) excludeRogue.checked = forgePreferences.excludeRogueR
      forgeUpdateSummary(inputs)
    }

    function scheduleForgeSync() {
      if (forgeSyncTimer != null) return
      forgeSyncTimer = setTimeout(forgeSync, 0)
    }

    function refresh() {
      if (refreshPromise) return refreshPromise
      for (const key of Object.keys(SOURCE_NAMES)) setSource(key, { status: 'loading', error: null })
      paint(hostRef)
      refreshPromise = loadSources().finally(() => {
        refreshPromise = null
        paint(hostRef)
      })
      return refreshPromise
    }

    function esc(value) {
      return api.util.esc(String(value ?? ''))
    }

    function sourceLabel(key) {
      const state = sourceState[key]
      const time = state.fetchedAt ? ` · 最后更新 ${new Date(state.fetchedAt).toLocaleString('zh-CN')}` : ''
      if (state.status === 'loading') return '读取中…'
      if (state.status === 'ok') return `已更新${time}`
      if (state.status === 'partial') return `部分可用${time}`
      if (state.status === 'stale') return `使用上次成功数据${time}`
      if (state.status === 'unavailable') return `${state.error || '数据不足'}${time}`
      return '未读取'
    }

    function routeText(route, key) {
      if (!route || route.status === 'unavailable') {
        if (route?.reason === 'market-insufficient') {
          const missing = (Array.isArray(route.missing) ? route.missing : [])
            .map((row) => `${row.name || row.key}还缺${Math.round(Number(row.qty) * 100) / 100}个`)
            .join('、')
          return `挂单不足${missing ? `：${missing}` : ''}`
        }
        return key === 'gacha' ? '数据不足' : '不可用'
      }
      const cost = Number.isFinite(route.cost) ? `预计 ${Math.round(route.cost * 100) / 100} 积分` : '成本未知'
      if (route.status === 'insufficient') return `${cost} · 还差 ${Math.round((route.shortfall || 0) * 100) / 100} 积分`
      if (route.currentPoints == null) return cost
      return `${cost} · 剩余 ${Math.round((route.remaining || 0) * 100) / 100} 积分`
    }

    function routeHtml(route, key) {
      const label = key === 'marketLow' ? '市场最低挂单' : key === 'marketMedian' ? '市场中位价估算' : '抽取路线'
      const note = key === 'gacha' ? route?.approximate ? '近似期望值，不保证实际结果' : '期望值，不保证实际结果' : ''
      const steps = route?.status === 'unavailable' ? '' : (() => {
        const rows = []
        const marketGroups = new Map()
        for (const step of Array.isArray(route?.steps) ? route.steps : []) {
          if (step.kind === 'market') {
            let group = marketGroups.get(step.key)
            if (!group) {
              group = { key: step.key, qty: 0, cost: 0, tiers: [] }
              marketGroups.set(step.key, group)
              rows.push({ kind: 'market', group })
            }
            const price = Number(step.price)
            let tier = group.tiers.find((item) => item.price === price)
            if (!tier) {
              tier = { price, qty: 0 }
              group.tiers.push(tier)
            }
            tier.qty += Number(step.qty) || 0
            group.qty += Number(step.qty) || 0
            group.cost += Number(step.cost) || 0
            continue
          }
          if (step.kind === 'median') rows.push({ html: `<li>${esc(step.key)}：中位价 ${esc(step.price)} × ${esc(step.qty)}</li>` })
          else if (step.kind === 'inventory') rows.push({ html: `<li>${esc(step.key)}：库存抵扣 ${esc(step.qty)}</li>` })
          else if (step.kind === 'gacha') rows.push({ html: `<li>期望抽取 ${esc(Math.round((step.expectedDraws || 0) * 100) / 100)} 次</li>` })
        }
        return rows.map((row) => {
          if (row.html) return row.html
          const group = row.group
          const tiers = group.tiers.map((tier) => `${esc(tier.qty)} 个 × ${esc(tier.price)}`).join(' + ')
          return `<li>${esc(group.key)}：${tiers}（合计 ${esc(group.qty)} 个，${esc(Math.round(group.cost * 100) / 100)} 积分）</li>`
        }).join('')
      })()
      const selectorKey = key === 'marketLow' ? 'market-low' : key === 'marketMedian' ? 'market-median' : 'gacha'
      return `<div class="lsb-title-forge-planner-plan" data-title-forge-planner-plan="${esc(selectorKey)}"><strong>${esc(label)}</strong><span>${esc(routeText(route, key))}</span>${note ? `<em>${esc(note)}</em>` : ''}${steps ? `<details><summary>查看步骤</summary><ul>${steps}</ul></details>` : ''}</div>`
    }

    function modeHtml(modeKey, modeName, result) {
      if (!result) return `<section data-title-forge-planner-mode="${esc(modeKey)}"><h3>${esc(modeName)}</h3><p>无法判断：合成表数据不足。</p></section>`
      const summary = result.summary
      let summaryText = '无法判断'
      if (summary.state === 'feasible') summaryText = `当前可行：${summary.bestFeasible.target.name}，${routeText(summary.bestFeasible.route, summary.bestFeasible.route.reason === 'gacha' ? 'gacha' : summary.bestFeasible.route.reason === 'market-median' ? 'marketMedian' : 'marketLow')}`
      else if (summary.state === 'insufficient' && summary.nearest) summaryText = `全部不足：${summary.nearest.target.name}，最小缺口 ${Math.round((summary.nearest.shortfall || 0) * 100) / 100} 积分`
      const targetRows = result.targets.map((target) => `<article data-title-forge-planner-target><h4>${esc(target.target.name)} <small>${esc(target.recipe.id)}</small></h4>${routeHtml(target.routes.marketLow, 'marketLow')}${routeHtml(target.routes.marketMedian, 'marketMedian')}${routeHtml(target.routes.gacha, 'gacha')}</article>`).join('')
      return `<section class="lsb-title-forge-planner-mode" data-title-forge-planner-mode="${esc(modeKey)}"><h3>${esc(modeName)}</h3><p class="lsb-title-forge-planner-summary">${esc(summaryText)}</p>${targetRows || '<p>无法判断：没有可解析的 UR 配方。</p>'}</section>`
    }

    function paint(host) {
      if (!host) return
      host.innerHTML = `<div class="lsb-title-forge-planner" data-title-forge-planner><div class="lsb-title-forge-planner-head"><strong>UR 合成规划</strong><span>当前积分：${esc(api.me.points == null ? '未知' : api.me.points)}</span><span>最后计算：${esc(calculatedAt ? new Date(calculatedAt).toLocaleString('zh-CN') : '尚未刷新')}</span><button type="button" class="lsb-btn is-primary" data-title-forge-planner-refresh>刷新数据</button></div><div class="lsb-title-forge-planner-sources">${Object.keys(SOURCE_NAMES).map((key) => `<div data-title-forge-planner-source="${esc(key)}"><b>${esc(SOURCE_NAMES[key])}</b><span>${esc(sourceLabel(key))}</span>${sourceState[key].error ? `<small>${esc(sourceState[key].error)}</small>` : ''}</div>`).join('')}</div>${!data.inventoryAvailable && (sourceState.inventory.status === 'unavailable' || sourceState.inventory.status === 'stale') ? `<div class="lsb-title-forge-planner-warning">计入当前库存：无法确认库存数据。</div>` : ''}${data.recipes.length ? (() => { const result = calculatePlans({ recipes: data.recipes, market: data.market || {}, gachaPools: data.gachaPools, inventory: data.inventory, points: api.me.points }); return modeHtml('no-inventory', '不计库存', result.modes.noInventory) + (data.inventoryAvailable ? modeHtml('inventory', '计入当前库存', result.modes.inventory) : `<section data-title-forge-planner-mode="inventory"><h3>计入当前库存</h3><p>无法确认当前库存。</p></section>`) })() : `${modeHtml('no-inventory', '不计库存', null)}<section data-title-forge-planner-mode="inventory"><h3>计入当前库存</h3><p>无法确认当前库存。</p></section>`}</div>`
      const button = host.querySelector('[data-title-forge-planner-refresh]')
      if (button) button.addEventListener('click', () => refresh())
    }

    restoreCache()
    api.ui.style('.lsb-title-forge-planner{padding:8px 0;color:var(--text,#222)}.lsb-title-forge-planner-head{display:flex;gap:10px;align-items:center;flex-wrap:wrap}.lsb-title-forge-planner-head strong{font-size:18px}.lsb-title-forge-planner-head span{font-size:12px;color:var(--muted,#777)}.lsb-title-forge-planner-head button{margin-left:auto}.lsb-title-forge-planner-sources{display:grid;grid-template-columns:repeat(auto-fit,minmax(150px,1fr));gap:6px;margin:12px 0}.lsb-title-forge-planner-sources>div{display:flex;flex-direction:column;gap:3px;padding:7px 9px;border:1px solid var(--line-soft,#eee);border-radius:7px}.lsb-title-forge-planner-sources span{font-size:12px;color:var(--muted,#777)}.lsb-title-forge-planner-sources small{color:var(--danger,#b44)}.lsb-title-forge-planner-warning{padding:8px;border:1px solid var(--warning,#c90);border-radius:7px;margin:8px 0}.lsb-title-forge-planner-mode{margin:12px 0;padding:10px;border:1px solid var(--line-soft,#eee);border-radius:9px}.lsb-title-forge-planner-mode h3{margin:0 0 6px}.lsb-title-forge-planner-summary{font-weight:600}.lsb-title-forge-planner-mode article{padding:8px 0;border-top:1px solid var(--line-soft,#eee)}.lsb-title-forge-planner-mode h4{margin:0 0 6px}.lsb-title-forge-planner-mode h4 small{font-weight:400;color:var(--muted,#777)}.lsb-title-forge-planner-plan{display:grid;grid-template-columns:150px 1fr;gap:5px;padding:4px 0;font-size:13px}.lsb-title-forge-planner-plan em{grid-column:2;color:var(--brand,#5eaaa0);font-size:12px}.lsb-title-forge-planner-plan details{grid-column:2}.lsb-title-forge-planner-plan ul{margin:4px 0 0;padding-left:18px}.lsb-title-forge-planner-plan span{color:var(--muted,#666)}@media(max-width:620px){.lsb-title-forge-planner-plan{grid-template-columns:1fr}.lsb-title-forge-planner-plan em,.lsb-title-forge-planner-plan details{grid-column:1}.lsb-title-forge-planner-head button{margin-left:0}}')
    const forgeStyle = document.createElement('style')
    forgeStyle.id = 'lsb-title-forge-planner-forge-style'
    forgeStyle.textContent = '.lsb-title-forge-controls{display:flex;align-items:center;gap:10px;flex-wrap:wrap;margin:0 0 12px;padding:8px 10px;border:1px solid var(--line-soft,#eee);border-radius:7px;background:var(--panel,var(--bg,#fafafa));color:var(--text,#222);font-size:13px}.lsb-title-forge-controls button{margin:0}.lsb-title-forge-exclude{display:inline-flex;align-items:center;gap:5px}.lsb-title-forge-selection-count{color:var(--text-muted,var(--muted,#777));font-size:12px}'
    document.head.appendChild(forgeStyle)
    api.on('route:changed', scheduleForgeSync)
    api.on('dom:changed', scheduleForgeSync)
    const onForgeMaterialChange = (event) => {
      if (!forgePageActive() || !isForgeMaterialInput(event.target)) return
      const inputs = findForgeMaterialInputs(document)
      forgeSave(inputs)
      forgeUpdateSummary(inputs)
    }
    document.addEventListener('change', onForgeMaterialChange)
    api.onDispose(() => {
      if (forgeSyncTimer != null) clearTimeout(forgeSyncTimer)
      document.removeEventListener('change', onForgeMaterialChange)
      forgeStyle.remove()
      forgeRemoveControls()
    })
    forgeSync()
    api.handle('title-forge-planner:refresh', () => refresh().then(() => publicSnapshot()))
    api.handle('title-forge-planner:calculate', (input = {}) => calculatePlans(input))
    api.handle('title-forge-planner:debug', () => ({
      keyOf,
      parseRecipes,
      parseGacha,
      parseInventory,
      resolveRecipeRarities,
      missingInputs,
      marketCost,
      medianCost,
      expandRequirements,
      planMarket,
      expectedGachaCost,
      summarizeMode,
      calculatePlans,
      normalizeForgePreferences,
      forgeMaterialMeta,
      findForgeMaterialInputs,
      readForgeSelection,
      applyForgeSelection,
      selectAllForgeMaterials,
      planResult,
      refresh,
      state: () => ({ sourceState: cloneData(sourceState), data: cloneData(data), calculatedAt }),
      issues: [],
    }))
  }

  const w = typeof unsafeWindow !== 'undefined' ? unsafeWindow : window
  if (w.LSB && w.LSB.register) w.LSB.register(manifest, setup)
  else {
    w.LSB_PLUGINS = w.LSB_PLUGINS || []
    w.LSB_PLUGINS.push({ manifest, setup })
  }
})()


;
/* ══════════════ LSB·积分-称号工作台 v0.1.0 (points-title-workbench) ══════════════ */
(function () {
  'use strict'

  const SOURCE_KEYS = ['points', 'recipes', 'gacha', 'inventory', 'market']
  const SOURCE_NAMES = {
    points: '积分',
    recipes: '合成表',
    gacha: '抽取概率',
    inventory: '我的库存',
    market: '称号行情',
  }
  const SOURCE_TIMEOUT_MS = 10_000
  const DEFAULT_RECT = { left: 42, top: 56, width: 820, height: 650 }

  const manifest = {
    id: 'points-title-workbench',
    name: '积分-称号工作台',
    version: '0.1.0',
    description: '统一查看积分、称号行情和 UR 合成规划',
    author: 'you',
    requires: {
      base: '^0.2.2',
      plugins: {
        'points-ledger': '^1.0.2',
        'title-quotes': '^1.0.19',
        'title-forge-planner': '^0.1.0',
      },
    },
    permissions: ['read', 'storage', 'ui', 'events'],
  }

  function finite(value, fallback = null) {
    if (value == null || (typeof value === 'string' && !value.trim())) return fallback
    const n = Number(value)
    return Number.isFinite(n) ? n : fallback
  }

  function clone(value) {
    try {
      return JSON.parse(JSON.stringify(value))
    } catch {
      return null
    }
  }

  function clampRect(rect, viewport = {}) {
    const vw = Math.max(1, finite(viewport.width, 1024))
    const vh = Math.max(1, finite(viewport.height, 768))
    const rawWidth = finite(rect?.width, DEFAULT_RECT.width)
    const rawHeight = finite(rect?.height, DEFAULT_RECT.height)
    const minWidth = Math.min(320, Math.max(220, vw - 16))
    const minHeight = Math.min(360, Math.max(180, vh - 16))
    const width = Math.min(Math.max(minWidth, rawWidth), Math.max(minWidth, vw - 16))
    const height = Math.min(Math.max(minHeight, rawHeight), Math.max(minHeight, vh - 16))
    const left = Math.min(Math.max(0, finite(rect?.left, DEFAULT_RECT.left)), Math.max(0, vw - width))
    const top = Math.min(Math.max(0, finite(rect?.top, DEFAULT_RECT.top)), Math.max(0, vh - height))
    return { left, top, width, height }
  }

  function setup(api) {
    let refreshPromise = null
    let refreshController = null
    let windowEl = null
    let activeView = 'overview'
    let collapsed = api.store.get('collapsed', false) === true
    let calculatedAt = null
    let rect = clampRect(api.store.get('rect', DEFAULT_RECT), {
      width: window.innerWidth,
      height: window.innerHeight,
    })
    const sourceState = Object.fromEntries(SOURCE_KEYS.map((key) => [key, {
      status: 'idle',
      fetchedAt: null,
      error: null,
      stale: false,
      issues: [],
    }]))
    let data = {
      points: null,
      series: [],
      recipes: [],
      gachaPools: [],
      titleCatalog: [],
      inventory: {},
      inventoryAvailable: false,
      market: null,
    }
    let plans = null

    function currentPoints() {
      const raw = api.me?.points
      if (raw == null) return null
      if (Number(raw) === 0) {
        const rank = String(api.me?.rank || '')
        const separator = rank.lastIndexOf('·')
        const pointText = separator >= 0 ? rank.slice(separator + 1) : ''
        if (!/\d/.test(pointText)) return null
      }
      return finite(raw)
    }

    function esc(value) {
      return api.util.esc(String(value ?? ''))
    }

    function sourceHasData(key) {
      if (key === 'points') return Number.isFinite(Number(data.points))
      if (key === 'recipes') return Array.isArray(data.recipes) && data.recipes.length > 0
      if (key === 'gacha') return Array.isArray(data.gachaPools) && data.gachaPools.length > 0
      if (key === 'inventory') return data.inventoryAvailable === true
      return !!data.market
    }

    function setSource(key, patch) {
      if (!sourceState[key]) return
      Object.assign(sourceState[key], patch)
    }

    function normalizeError(key, error) {
      const text = String(error?.message || error || '数据不足')
      if (key === 'inventory') {
        if (/登录|库存|profile|challenge|挑战|cloudflare|格式|超时/i.test(text)) return '无法确认库存数据'
      }
      if (/页面|格式|selector|challenge|挑战|cloudflare|登录|超时/i.test(text)) return '页面格式无法识别'
      return text || '数据不足'
    }

    function sourceLabel(key) {
      const state = sourceState[key]
      const time = state.fetchedAt ? ` · ${new Date(state.fetchedAt).toLocaleString('zh-CN')}` : ''
      if (state.status === 'loading') return '读取中…'
      if (state.status === 'ok') return `已更新${time}`
      if (state.status === 'partial') return `部分可用${time}`
      if (state.status === 'stale') return `使用上次成功数据${time}`
      if (state.status === 'unavailable') return `${state.error || '数据不足'}${time}`
      return '未读取'
    }

    function saveSnapshot() {
      try {
        api.store.set('snapshot', {
          savedAt: Date.now(),
          sources: clone(sourceState),
          data: clone(data),
          plans: clone(plans),
          calculatedAt,
        })
      } catch {
        /* 存储失败不影响当前页面结果 */
      }
    }

    function restoreSnapshot() {
      const saved = api.store.get('snapshot', null)
      if (!saved?.data) return
      const value = saved.data
      data = {
        points: finite(value.points),
        series: Array.isArray(value.series) ? value.series : [],
        recipes: Array.isArray(value.recipes) ? value.recipes : [],
        gachaPools: Array.isArray(value.gachaPools) ? value.gachaPools : [],
        titleCatalog: Array.isArray(value.titleCatalog) ? value.titleCatalog : [],
        inventory: value.inventory && typeof value.inventory === 'object' ? value.inventory : {},
        inventoryAvailable: value.inventoryAvailable === true,
        market: value.market || null,
      }
      plans = value.plans || null
      calculatedAt = finite(value.calculatedAt)
      for (const key of SOURCE_KEYS) {
        if (sourceHasData(key)) {
          const old = saved.sources?.[key] || {}
          setSource(key, {
            status: 'stale',
            fetchedAt: finite(old.fetchedAt, finite(saved.savedAt)),
            stale: true,
            error: null,
          })
        }
      }
    }

    function refreshAbortError() {
      const error = new Error('刷新已取消')
      error.name = 'AbortError'
      return error
    }

    function withTimeout(job, timeoutMs = SOURCE_TIMEOUT_MS, signal = null) {
      let timer = null
      let settled = false
      return new Promise((resolve, reject) => {
        const cleanup = () => {
          if (timer) clearTimeout(timer)
          signal?.removeEventListener?.('abort', onAbort)
        }
        const finish = (fn, value) => {
          if (settled) return
          settled = true
          cleanup()
          fn(value)
        }
        const onAbort = () => finish(reject, refreshAbortError())
        if (signal?.aborted) {
          onAbort()
          return
        }
        signal?.addEventListener?.('abort', onAbort, { once: true })
        timer = setTimeout(() => finish(reject, new Error('读取超时')), timeoutMs)
        Promise.resolve()
          .then(job)
          .then(
            (value) => finish(resolve, value),
            (error) => finish(reject, error),
          )
      })
    }

    function ensureRefreshActive(signal) {
      if (signal?.aborted) throw refreshAbortError()
    }

    function applyPlannerSnapshot(result) {
      const sourceMap = result?.sources || {}
      const value = result?.data || {}
      for (const key of ['recipes', 'gacha', 'inventory']) {
        const loaded = sourceMap[key]
        const state = loaded || { status: 'unavailable', error: '数据不足', issues: [] }
        const has = sourceHasData(key)
        if (state.status === 'ok' || state.status === 'partial') {
          if (key === 'recipes') data.recipes = Array.isArray(value.recipes) ? value.recipes : []
          if (key === 'gacha') {
            data.gachaPools = Array.isArray(value.gachaPools) ? value.gachaPools : []
            data.titleCatalog = Array.isArray(value.titleCatalog) ? value.titleCatalog : []
          }
          if (key === 'inventory') {
            data.inventory = value.inventory && typeof value.inventory === 'object' ? value.inventory : {}
            data.inventoryAvailable = value.inventoryAvailable === true
          }
        }
        const fresh = state.status === 'ok' || state.status === 'partial'
        const previousFetchedAt = finite(state.fetchedAt, finite(sourceState[key].fetchedAt))
        const fetchedAt = fresh ? finite(state.fetchedAt, Date.now()) : has ? previousFetchedAt : null
        setSource(key, {
          status: fresh ? state.status : has ? 'stale' : 'unavailable',
          fetchedAt,
          error: state.error ? normalizeError(key, state.error) : null,
          stale: state.stale === true || !fresh,
          issues: Array.isArray(state.issues) ? state.issues : [],
        })
      }
    }

    function applyMarket(market) {
      if (!market || !Array.isArray(market.listings) || !market.titles) throw new Error('行情数据不足')
      if (market.coverage && market.coverage.complete !== true) throw new Error('称号行情数据不足')
      data.market = market
      setSource('market', {
        status: 'ok',
        fetchedAt: finite(market.fetchedAt, Date.now()),
        error: null,
        stale: false,
        issues: [],
      })
    }

    function refresh() {
      if (refreshPromise) return refreshPromise
      const controller = new AbortController()
      const signal = controller.signal
      refreshController = controller
      for (const key of SOURCE_KEYS) setSource(key, { status: 'loading', error: null, stale: false })
      paint()
      refreshPromise = (async () => {
        const jobs = {
          points: () => Promise.all([
            Promise.resolve(currentPoints()),
            api.request('points-ledger:series', { days: 90 }),
          ]),
          market: () => api.request('title-quotes:refresh'),
          planner: () => api.request('title-forge-planner:refresh'),
        }
        const entries = Object.entries(jobs)
        const results = await Promise.allSettled(entries.map(async ([key, job]) => [key, await withTimeout(job, SOURCE_TIMEOUT_MS, signal)]))
        ensureRefreshActive(signal)
        for (const [index, result] of results.entries()) {
          const key = result.status === 'fulfilled' ? result.value[0] : entries[index][0]
          if (result.status === 'fulfilled') {
            const value = result.value[1]
            if (key === 'points') {
              data.points = finite(value[0])
              data.series = Array.isArray(value[1]) ? value[1] : []
              setSource('points', { status: 'ok', fetchedAt: Date.now(), error: null, stale: false, issues: [] })
            } else if (key === 'market') {
              try {
                applyMarket(value)
              } catch (error) {
                const has = sourceHasData('market')
                setSource('market', { status: has ? 'stale' : 'unavailable', fetchedAt: Date.now(), error: normalizeError('market', error), stale: has })
              }
            } else if (key === 'planner') {
              applyPlannerSnapshot(value)
            }
          } else if (key === 'planner') {
            const message = normalizeError('planner', result.reason)
            const targets = ['recipes', 'gacha', 'inventory']
            for (const target of targets) {
              const has = sourceHasData(target)
              setSource(target, { status: has ? 'stale' : 'unavailable', fetchedAt: Date.now(), error: normalizeError(target, result.reason), stale: has, issues: [{ reason: message }] })
            }
          } else {
            const has = sourceHasData(key)
            const message = normalizeError(key, result.reason)
            setSource(key, { status: has ? 'stale' : 'unavailable', fetchedAt: Date.now(), error: message, stale: has, issues: [{ reason: message }] })
          }
        }
        ensureRefreshActive(signal)
        const input = {
          recipes: data.recipes,
          market: data.market || {},
          gachaPools: data.gachaPools,
          inventory: data.inventory,
          points: data.points,
        }
        try {
          plans = await api.request('title-forge-planner:calculate', input)
          ensureRefreshActive(signal)
          calculatedAt = Date.now()
        } catch (error) {
          if (signal.aborted) throw refreshAbortError()
          plans = null
          calculatedAt = null
          setSource('recipes', { error: normalizeError('recipes', error) })
        }
        ensureRefreshActive(signal)
        saveSnapshot()
        paint()
        return { sources: clone(sourceState), data: clone(data), plans: clone(plans), calculatedAt }
      })().finally(() => {
        if (refreshController === controller) refreshController = null
        refreshPromise = null
      })
      return refreshPromise
    }

    function routeText(route, kind) {
      if (!route || route.status === 'unavailable') {
        if (route?.reason === 'market-insufficient' && Array.isArray(route.missing) && route.missing.length) {
          const missing = route.missing.map((item) => `${item.name || item.key}还缺${finite(item.qty, 0)}个`).join('、')
          return `挂单不足：${missing}`
        }
        return kind === 'gacha' ? '数据不足' : '不可用'
      }
      if (route.status === 'insufficient') return `预计 ${Math.round(Number(route.cost || 0) * 100) / 100} 积分 · 还差 ${Math.round(Number(route.shortfall || 0) * 100) / 100} 积分`
      return `预计 ${Math.round(Number(route.cost || 0) * 100) / 100} 积分`
    }

    function routeSteps(route) {
      const steps = Array.isArray(route?.steps) ? route.steps : []
      const rows = []
      const marketGroups = new Map()
      for (const step of steps) {
        if (step.kind === 'market') {
          let group = marketGroups.get(step.key)
          if (!group) {
            group = { key: step.key, qty: 0, cost: 0, tiers: [] }
            marketGroups.set(step.key, group)
            rows.push({ kind: 'market', group })
          }
          const price = finite(step.price)
          const qty = finite(step.qty, 0)
          if (price == null || qty <= 0) continue
          let tier = group.tiers.find((item) => item.price === price)
          if (!tier) {
            tier = { price, qty: 0 }
            group.tiers.push(tier)
          }
          tier.qty += qty
          group.qty += qty
          group.cost += finite(step.cost, price * qty)
          continue
        }
        if (step.kind === 'median') rows.push({ text: `${step.key}：中位价 ${finite(step.price, '未知')} × ${finite(step.qty, 0)}` })
        else if (step.kind === 'inventory') rows.push({ text: `${step.key}：库存抵扣 ${finite(step.qty, 0)}` })
        else if (step.kind === 'gacha') rows.push({ text: `期望抽取 ${Math.round(Number(step.expectedDraws || 0) * 100) / 100} 次` })
      }
      const items = rows.map((row) => {
        if (row.text) return row.text
        const group = row.group
        const tiers = group.tiers.map((tier) => `${tier.qty} 个 × ${tier.price}`).join(' + ')
        return `${group.key}：${tiers}（合计 ${group.qty} 个，${Math.round(group.cost * 100) / 100} 积分）`
      })
      return items.length
        ? `<details data-workbench-route-steps><summary>查看步骤</summary><ul>${items.map((row) => `<li>${esc(row)}</li>`).join('')}</ul></details>`
        : ''
    }

    function renderRoutes(result) {
      const targets = Array.isArray(result?.targets) ? result.targets : []
      return targets.map((target) => {
        const routes = target.routes || {}
        return `<article data-workbench-target><h4>${esc(target.target?.name || target.target?.key || '未知 UR')}</h4>${[
          ['market-low', routes.marketLow],
          ['market-median', routes.marketMedian],
          ['gacha', routes.gacha],
        ].map(([kind, route]) => `<div data-workbench-route="${kind}" data-status="${esc(route?.status || 'unavailable')}"><b>${kind === 'market-low' ? '市场最低挂单' : kind === 'market-median' ? '市场中位价估算' : '抽取路线'}</b><span>${esc(routeText(route, kind))}</span>${kind === 'gacha' ? '<em>期望值，不保证实际结果</em>' : ''}${routeSteps(route)}</div>`).join('')}</article>`
      }).join('')
    }

    function renderMode(key, label, result) {
      const summary = result?.summary
      const summaryText = summary?.state === 'feasible'
        ? `当前可行：${summary.bestFeasible?.target?.name || '未知目标'}`
        : summary?.state === 'insufficient'
          ? `全部不足：${summary.nearest?.target?.name || '未知目标'}`
          : '无法判断'
      return `<section data-workbench-mode="${key}"><h3>${label}</h3><p>${esc(summaryText)}</p>${renderRoutes(result)}</section>`
    }

    function renderOverview() {
      const marketSampleCount = Array.isArray(data.market?.listings) ? data.market.listings.length : null
      return `<section data-workbench-view="overview"><div class="lsb-points-title-summary"><div><small>当前积分</small><strong>${esc(data.points == null ? '未知' : data.points)}</strong></div><div><small>行情样本</small><strong>${esc(marketSampleCount == null ? '未知' : marketSampleCount)}</strong></div><div><small>最后计算</small><strong>${esc(calculatedAt ? new Date(calculatedAt).toLocaleString('zh-CN') : '尚未刷新')}</strong></div></div>${renderMode('no-inventory', '不计库存', plans?.modes?.noInventory)}${renderMode('inventory', '计入当前库存', data.inventoryAvailable ? plans?.modes?.inventory : null)}</section>`
    }

    function pointsChart(series) {
      const rows = (Array.isArray(series) ? series : [])
        .map((row) => ({ t: finite(row?.t), p: finite(row?.p) }))
        .filter((row) => row.t != null && row.p != null)
        .slice(-366)
      if (rows.length < 2) return `<div class="lsb-empty">至少两次快照后开始绘制（当前 ${esc(rows.length)} 次）。</div>`
      const W = 620
      const H = 180
      const P = { l: 46, r: 12, t: 12, b: 28 }
      const values = rows.map((row) => row.p)
      const min = Math.min(...values)
      const max = Math.max(...values)
      const span = max - min || 1
      const x = (index) => P.l + (index / (rows.length - 1)) * (W - P.l - P.r)
      const y = (value) => P.t + (1 - (value - min) / span) * (H - P.t - P.b)
      const points = rows.map((row, index) => `${x(index).toFixed(1)},${y(row.p).toFixed(1)}`).join(' ')
      const changes = []
      for (let i = 1; i < rows.length; i++) {
        const delta = rows[i].p - rows[i - 1].p
        if (delta !== 0) changes.push({ t: rows[i].t, delta })
      }
      const recent = changes.slice(-5).reverse()
      return `<div class="lsb-points-title-workbench-chart"><svg class="lsb-svg" viewBox="0 0 ${W} ${H}" preserveAspectRatio="xMidYMid meet" role="img"><rect x="${P.l}" y="${P.t}" width="${W - P.l - P.r}" height="${H - P.t - P.b}" fill="none" stroke="var(--line-soft,#eee)"></rect><polyline points="${esc(points)}" fill="none" stroke="var(--brand,#5eaaa0)" stroke-width="2"></polyline>${rows.map((row, index) => `<circle cx="${x(index).toFixed(1)}" cy="${y(row.p).toFixed(1)}" r="2.5" fill="var(--brand,#5eaaa0)"></circle>`).join('')}<text x="${P.l - 6}" y="${y(max) + 4}" text-anchor="end" font-size="11" fill="var(--text-muted,#888)">${esc(max)}</text><text x="${P.l - 6}" y="${y(min) + 4}" text-anchor="end" font-size="11" fill="var(--text-muted,#888)">${esc(min)}</text></svg><div class="lsb-row-desc">最近变化：</div>${recent.length ? recent.map((change) => `<div class="lsb-row"><span>${esc(new Date(change.t).toLocaleString('zh-CN'))}</span><strong>${change.delta > 0 ? '+' : ''}${esc(change.delta)}</strong></div>`).join('') : '<div class="lsb-empty">暂无变化记录。</div>'}</div>`
    }

    function renderPoints() {
      return `<section data-workbench-view="points"><h3>积分</h3><p>当前积分：${esc(data.points == null ? '未知' : data.points)}</p>${pointsChart(data.series)}</section>`
    }

    function renderMarket() {
      const coverage = data.market?.coverage
      const coverageText = coverage?.complete === true
        ? `完整 ${esc(coverage.fetchedPages)}/${esc(coverage.expectedPages)} 页`
        : '行情数据不足'
      const fetchedAt = finite(data.market?.fetchedAt)
      const titles = data.market?.titles && typeof data.market.titles === 'object' ? data.market.titles : {}
      const rows = Object.entries(titles).slice(0, 240).map(([key, value]) => {
        const split = String(key).lastIndexOf('@')
        const name = split > 0 ? String(key).slice(0, split) : String(key)
        const rarity = split > 0 ? String(key).slice(split + 1) : ''
        const lo = finite(value?.lo)
        const mid = finite(value?.mid)
        const n = finite(value?.n)
        return `<article data-workbench-market-title><strong>${esc(name)}</strong><span>${esc(rarity)} · 最低挂单 ${esc(lo == null ? '未知' : lo)} · 中位价估算 ${esc(mid == null ? '未知' : mid)} · 挂单数量 ${esc(n == null ? '未知' : n)}</span></article>`
      }).join('')
      return `<section data-workbench-view="market"><h3>行情</h3><p>${esc(coverageText)}</p><p>更新时间：${esc(fetchedAt == null ? '未知' : new Date(fetchedAt).toLocaleString('zh-CN'))}</p>${rows || '<p>行情数据不足</p>'}</section>`
    }

    function renderForge() {
      return `<section data-workbench-view="forge"><h3>UR 规划</h3>${renderMode('no-inventory', '不计库存', plans?.modes?.noInventory)}${renderMode('inventory', '计入当前库存', data.inventoryAvailable ? plans?.modes?.inventory : null)}</section>`
    }

    let interaction = null

    function onPointerMove(event) {
      if (!interaction) return
      const dx = finite(event.clientX, interaction.startX) - interaction.startX
      const dy = finite(event.clientY, interaction.startY) - interaction.startY
      if (interaction.type === 'drag') {
        rect = clampRect({ ...interaction.base, left: interaction.base.left + dx, top: interaction.base.top + dy }, {
          width: window.innerWidth,
          height: window.innerHeight,
        })
      } else {
        rect = clampRect({ ...interaction.base, width: interaction.base.width + dx, height: interaction.base.height + dy }, {
          width: window.innerWidth,
          height: window.innerHeight,
        })
      }
      applyRect()
    }

    function onPointerUp() {
      if (!interaction) return
      interaction = null
      api.store.set('rect', rect)
    }

    function bindWindowInteractions() {
      const head = windowEl?.querySelector('.lsb-points-title-workbench-head')
      const resize = windowEl?.querySelector('.lsb-points-title-workbench-resize')
      head?.addEventListener('pointerdown', (event) => {
        if (event.target?.closest?.('button')) return
        interaction = { type: 'drag', startX: event.clientX, startY: event.clientY, base: { ...rect } }
      })
      resize?.addEventListener('pointerdown', (event) => {
        interaction = { type: 'resize', startX: event.clientX, startY: event.clientY, base: { ...rect } }
      })
    }

    function applyRect() {
      if (!windowEl) return
      const next = clampRect(rect, { width: window.innerWidth, height: window.innerHeight })
      rect = next
      windowEl.style.left = `${next.left}px`
      windowEl.style.top = `${next.top}px`
      windowEl.style.width = `${next.width}px`
      windowEl.style.height = `${next.height}px`
    }

    function paint() {
      if (!windowEl) return
      const active = activeView
      windowEl.classList.toggle('is-collapsed', collapsed)
      windowEl.innerHTML = `<div class="lsb-points-title-workbench-head"><strong>积分-称号工作台</strong><span>可拖动 · ${sourceLabel('market')}</span><button type="button" data-workbench-collapse>${collapsed ? '展开' : '收起'}</button><button type="button" data-workbench-refresh>刷新</button><button type="button" data-workbench-close>×</button></div><nav class="lsb-points-title-workbench-tabs">${[['overview', '总览'], ['points', '积分'], ['market', '行情'], ['forge', 'UR 规划']].map(([key, label]) => `<button type="button" data-workbench-tab="${key}" class="${active === key ? 'is-active' : ''}">${label}</button>`).join('')}</nav><div class="lsb-points-title-workbench-body"><div class="lsb-points-title-workbench-sources">${SOURCE_KEYS.map((key) => `<div data-workbench-source="${key}" class="${sourceState[key].status === 'loading' ? 'is-loading' : ''}"><b>${esc(SOURCE_NAMES[key])}</b><span>${esc(sourceLabel(key))}</span></div>`).join('')}</div>${active === 'overview' ? renderOverview() : active === 'points' ? renderPoints() : active === 'market' ? renderMarket() : renderForge()}</div><i class="lsb-points-title-workbench-resize" aria-hidden="true"></i>`
      windowEl.querySelectorAll('[data-workbench-tab]').forEach((button) => {
        button.addEventListener('click', () => {
          activeView = button.dataset.workbenchTab || 'overview'
          paint()
        })
      })
      windowEl.querySelector('[data-workbench-refresh]')?.addEventListener('click', () => refresh())
      windowEl.querySelector('[data-workbench-collapse]')?.addEventListener('click', () => {
        collapsed = !collapsed
        api.store.set('collapsed', collapsed)
        paint()
      })
      windowEl.querySelector('[data-workbench-close]')?.addEventListener('click', closeWindow)
      bindWindowInteractions()
      applyRect()
    }

    function openWindow() {
      if (!windowEl || !windowEl.isConnected) {
        windowEl = document.createElement('section')
        windowEl.className = 'lsb-points-title-workbench'
        windowEl.dataset.pointsTitleWorkbench = ''
        document.body.appendChild(windowEl)
      }
      activeView = 'overview'
      paint()
      return refresh()
    }

    function closeWindow() {
      refreshController?.abort()
      refreshController = null
      windowEl?.remove()
      windowEl = null
    }

    restoreSnapshot()

    api.ui.style(
      '.lsb-points-title-workbench{position:fixed;z-index:99990;display:flex;flex-direction:column;min-width:220px;min-height:180px;overflow:hidden;background:var(--panel,#fff);color:var(--text,#222);border:1px solid var(--line,#ddd);border-radius:10px;box-shadow:0 18px 48px var(--shadow-medium,rgba(0,0,0,.3))}.lsb-points-title-workbench-head{display:flex;align-items:center;gap:8px;padding:10px 12px;border-bottom:1px solid var(--line-soft,#eee);cursor:move}.lsb-points-title-workbench-head strong{margin-right:auto}.lsb-points-title-workbench-head button{border:1px solid var(--line,#ddd);background:transparent;color:inherit;border-radius:5px;cursor:pointer}.lsb-points-title-workbench-tabs{display:flex;gap:4px;padding:8px 10px 0;overflow-x:auto;border-bottom:1px solid var(--line-soft,#eee)}.lsb-points-title-workbench-tabs button{flex:0 0 auto;padding:7px 10px;border:0;border-bottom:2px solid transparent;background:transparent;color:inherit;cursor:pointer}.lsb-points-title-workbench-tabs button.is-active{border-bottom-color:var(--brand,#5eaaa0);font-weight:700}.lsb-points-title-workbench-body{min-height:0;flex:1;overflow:auto;padding:10px 12px}.lsb-points-title-workbench-sources{display:grid;grid-template-columns:repeat(auto-fit,minmax(130px,1fr));gap:6px;margin-bottom:10px}.lsb-points-title-workbench-sources>div{display:flex;flex-direction:column;gap:3px;padding:7px 8px;border:1px solid var(--line-soft,#eee);border-radius:7px}.lsb-points-title-workbench-sources span{font-size:11px;color:var(--muted,#777)}.lsb-points-title-workbench-sources .is-loading span{color:var(--warning,#a66)}.lsb-points-title-summary{display:grid;grid-template-columns:repeat(3,minmax(0,1fr));gap:8px;margin-bottom:10px}.lsb-points-title-summary>div{padding:10px;border:1px solid var(--line-soft,#eee);border-radius:8px}.lsb-points-title-summary small,.lsb-points-title-summary strong{display:block}.lsb-points-title-summary strong{margin-top:4px}.lsb-points-title-workbench-body section{margin:10px 0;padding:10px;border:1px solid var(--line-soft,#eee);border-radius:8px}.lsb-points-title-workbench-body article{padding:7px 0;border-top:1px solid var(--line-soft,#eee)}.lsb-points-title-workbench-body article h4{margin:0 0 5px}.lsb-points-title-workbench-body [data-workbench-route]{display:grid;grid-template-columns:150px 1fr;gap:5px;padding:4px 0}.lsb-points-title-workbench-body [data-workbench-route] span{color:var(--muted,#777)}.lsb-points-title-workbench-body [data-workbench-route] em{grid-column:2;color:var(--brand,#5eaaa0);font-size:12px}.lsb-points-title-workbench-body [data-workbench-route] details{grid-column:2;min-width:0}.lsb-points-title-workbench-body [data-workbench-route] details>ul{margin:4px 0 0;padding-left:18px}.lsb-points-title-workbench-body [data-workbench-route] details>ul>li+li{margin-top:3px}.lsb-points-title-workbench-resize{position:absolute;right:0;bottom:0;width:15px;height:15px;cursor:nwse-resize}.lsb-points-title-workbench.is-collapsed{height:auto !important;min-height:0 !important}.lsb-points-title-workbench.is-collapsed .lsb-points-title-workbench-tabs,.lsb-points-title-workbench.is-collapsed .lsb-points-title-workbench-body,.lsb-points-title-workbench.is-collapsed .lsb-points-title-workbench-resize{display:none}@media(max-width:760px){.lsb-points-title-workbench{width:calc(100vw - 16px) !important}.lsb-points-title-summary{grid-template-columns:repeat(2,minmax(0,1fr))}.lsb-points-title-workbench-body [data-workbench-route]{grid-template-columns:1fr}.lsb-points-title-workbench-body [data-workbench-route] em{grid-column:1}.lsb-points-title-workbench-body [data-workbench-route] details{grid-column:1}}',
    )

    api.handle('points-title-workbench:open', () => openWindow())
    api.handle('points-title-workbench:debug', () => ({
      clampRect,
      refresh,
      state: () => ({ rect: clone(rect), activeView, sourceState: clone(sourceState), data: clone(data), plans: clone(plans), calculatedAt }),
    }))

    const onResize = () => {
      rect = clampRect(rect, { width: window.innerWidth, height: window.innerHeight })
      api.store.set('rect', rect)
      applyRect()
    }
    window.addEventListener('resize', onResize)
    document.addEventListener('pointermove', onPointerMove)
    document.addEventListener('pointerup', onPointerUp)
    api.onDispose(() => {
      window.removeEventListener('resize', onResize)
      document.removeEventListener('pointermove', onPointerMove)
      document.removeEventListener('pointerup', onPointerUp)
      closeWindow()
    })
  }

  const w = typeof unsafeWindow !== 'undefined' ? unsafeWindow : window
  if (w.LSB && w.LSB.register) w.LSB.register(manifest, setup)
  else {
    w.LSB_PLUGINS = w.LSB_PLUGINS || []
    w.LSB_PLUGINS.push({ manifest, setup })
  }
})()


;
/* ══════════════ LSB·配置迁移 v1.0.0 (data-migration) ══════════════ */
(function () {
  'use strict'

  const manifest = {
    id: 'data-migration',
    name: '配置迁移',
    version: '1.0.0',
    description: '全库数据备份/恢复（JSON），支持文件下载、剪贴板、合并或覆盖导入',
    author: 'you',
    requires: { base: '^0.1.1' }, // 需要 admin API
    permissions: ['read', 'storage', 'ui', 'events', 'admin'],
  }

  function setup(api) {
    function download(name, text) {
      try {
        const blob = new Blob([text], { type: 'application/json' })
        const a = document.createElement('a')
        a.href = URL.createObjectURL(blob)
        a.download = name
        a.click()
        setTimeout(() => URL.revokeObjectURL(a.href), 4000)
        return true
      } catch (e) {
        api.log('下载失败', e)
        return false
      }
    }

    /* ── 面板 ── */
    api.ui.tab({
      name: '配置迁移',
      order: 68,
      render(host) {
        const dump = api.admin.exportAll()
        const kb = (JSON.stringify(dump).length / 1024).toFixed(1)

        // 按模块聚合统计
        const per = {}
        for (const k of Object.keys(dump.data)) {
          const m = k.match(/^lsb_base:([^:]+):/)
          const mod = m ? m[1] : '(其它)'
          per[mod] = (per[mod] || 0) + 1
        }
        const breakdown = Object.entries(per)
          .sort((a, b) => b[1] - a[1])
          .map(([m, n]) => `${api.util.esc(m)}(${n})`)
          .join(' · ')

        host.innerHTML = `
          <div class="lsb-row">
            <div class="lsb-row-main">
              <div class="lsb-row-name">当前库：${dump.count} 个键 · ${kb} KB</div>
              <div class="lsb-row-desc">${breakdown || '空库'}</div>
            </div>
          </div>
          <div class="lsb-actions" style="border:0;padding:8px 0">
            <button class="lsb-btn is-primary" data-export>⬇ 导出备份文件</button>
            <button class="lsb-btn" data-copy>复制到剪贴板</button>
          </div>
          <label class="lsb-field"><span>导入：选择备份文件或直接粘贴 JSON</span>
            <input type="file" accept=".json,application/json" data-file style="margin-bottom:6px">
            <textarea data-json rows="6" placeholder='{"app":"lsb", ...}'></textarea>
          </label>
          <div class="lsb-row" style="border:0">
            <label style="display:flex;gap:6px;align-items:center;font-size:12px">
              <input type="checkbox" data-merge> 合并模式（保留现有同名键，只补缺失）
            </label>
            <button class="lsb-btn is-primary" data-import style="margin-left:auto">⬆ 导入</button>
          </div>
          <div class="lsb-row-desc" style="margin-top:10px">
            ⚠️ 覆盖模式会替换同名键的全部现值；导入后建议刷新页面。备份包含各模块数据与配置，
            请勿分享给不信任的人（可能含 Cookie 以外的敏感本地数据）。
          </div>`

        host.querySelector('[data-export]').onclick = () => {
          const name = `lsb-backup-${today()}.json`
          if (download(name, JSON.stringify(dump))) {
            api.ui.toast(`已下载 ${name}`, { type: 'success' })
          } else {
            api.ui.toast('下载失败，请用「复制到剪贴板」', { type: 'error' })
          }
        }
        host.querySelector('[data-copy]').onclick = async () => {
          try {
            await navigator.clipboard.writeText(JSON.stringify(dump))
            api.ui.toast('已复制到剪贴板', { type: 'success' })
          } catch {
            api.ui.toast('剪贴板不可用', { type: 'error' })
          }
        }

        const ta = host.querySelector('[data-json]')
        host.querySelector('[data-file]').onchange = async (e) => {
          const f = e.target.files?.[0]
          if (!f) return
          ta.value = await f.text()
          api.ui.toast(`已读取 ${f.name}，点击「导入」确认`)
        }
        host.querySelector('[data-import]').onclick = async () => {
          let payload
          try {
            payload = JSON.parse(ta.value)
          } catch {
            api.ui.toast('JSON 解析失败', { type: 'error' })
            return
          }
          const merge = host.querySelector('[data-merge]').checked
          const ok = await api.ui.confirm(
            merge ? `以合并模式导入 ${payload.count ?? '?'} 键？现有同名键保留。` : '以覆盖模式导入？同名键将被替换！',
            { title: '导入确认' },
          )
          if (!ok) return
          try {
            const r = api.admin.importAll(payload, { merge })
            api.ui.toast(`导入完成：写入 ${r.imported}，跳过 ${r.skipped}；建议刷新页面`, { type: 'success', timeout: 5000 })
          } catch (e) {
            api.ui.toast(e.message, { type: 'error' })
          }
        }
      },
    })

    function today() {
      const x = new Date()
      const p = (n) => String(n).padStart(2, '0')
      return x.getFullYear() + p(x.getMonth() + 1) + p(x.getDate())
    }

    /* ── 调试接口 ── */
    api.handle('data-migration:debug', () => ({
      export: () => api.admin.exportAll(),
      import: (payload, opts) => api.admin.importAll(payload, opts),
    }))

    return {}
  }

  const w = typeof unsafeWindow !== 'undefined' ? unsafeWindow : window
  if (w.LSB && w.LSB.register) w.LSB.register(manifest, setup)
  else {
    w.LSB_PLUGINS = w.LSB_PLUGINS || []
    w.LSB_PLUGINS.push({ manifest, setup })
  }
})()


;
/* ══════════════ LSB·个人存档 v1.0.0 (my-archive) ══════════════ */
(function () {
  'use strict'

  const manifest = {
    id: 'my-archive',
    name: '个人存档',
    version: '1.0.0',
    description: '自己的主题/回复全量抓取 → 本地累积 → 导出 JSON/Markdown',
    author: 'you',
    requires: { base: '^0.1.0' },
    permissions: ['read', 'storage', 'ui', 'events'],
    config: {
      includeReplies: { type: 'switch', label: '同时备份回帖页', default: true },
      maxPages: { type: 'number', label: '每类最多翻页数', default: 50 },
    },
  }

  function setup(api) {
    let cfg = api.config()
    api.on('config:changed:my-archive', () => {
      cfg = api.config()
    })

    const archGet = () => api.store.get('archive', null)

    /* ── 分页发现：不假设参数名，从页面链接里学 ── */
    function discoverPagination(doc, uid, tab) {
      let maxPage = 1
      let paramName = 'p'
      for (const a of doc.querySelectorAll(`a[href*="/user/${uid}"]`)) {
        const h = a.getAttribute('href') || ''
        if (!h.includes(`tab=${tab}`)) continue
        const m = h.match(new RegExp(`[?&](p|page)=(\\d+)`))
        if (m && Number(m[2]) > maxPage) {
          maxPage = Number(m[2])
          paramName = m[1]
        }
      }
      return { maxPage, paramName }
    }

    function pageUrl(uid, tab, p, paramName) {
      const q = [`tab=${tab}`]
      if (p > 1) q.push(`${paramName}=${p}`)
      return `/user/${uid}?${q.join('&')}`
    }

    /* ── 备份主体 ── */
    async function backup({ silent = false } = {}) {
      const me = api.me
      if (me.guest || me.uid == null) throw new Error('请先登录再备份')

      const prev = archGet() || { topics: {}, replies: {} }
      const merged = {
        uid: me.uid,
        name: me.name,
        firstBackupAt: prev.firstBackupAt || Date.now(),
        lastBackupAt: Date.now(),
        topics: { ...prev.topics },
        replies: { ...prev.replies },
      }
      // 增量落盘：几十页抓取里任何一页失败（掉线/限流/站点改版）都不该
      // 让之前抓到的全部作废。每页写一次，失败时已抓部分留在本地，
      // 下次备份从合并结果继续。
      const persist = () => {
        merged.lastBackupAt = Date.now()
        api.store.set('archive', merged)
      }
      let pagesDone = 0

      // 主题 tab
      let doc = await api.net.doc(api.routes.user(me.uid, 'topics'))
      let { maxPage, paramName } = discoverPagination(doc, me.uid, 'topics')
      const cap = Math.min(maxPage, cfg.maxPages || 50)
      for (let p = 1; p <= cap; p++) {
        if (p > 1) {
          if (!silent) api.ui.toast(`主题备份中 ${p}/${cap}…`, { title: '个人存档' })
          doc = await api.net.doc(pageUrl(me.uid, 'topics', p, paramName))
        }
        for (const it of api.parse.list(doc)) {
          merged.topics[it.id] = {
            id: it.id,
            title: it.title,
            forumId: it.forumId,
            forumName: it.forumName,
            replies: it.replies,
            lastTs: it.lastActiveTs,
            pinned: it.pinned,
          }
        }
        pagesDone++
        persist()
      }

      // 回帖 tab（结构可能不同：解析失败则记录条数）
      if (cfg.includeReplies) {
        doc = await api.net.doc(api.routes.user(me.uid, 'replies'))
        const d2 = discoverPagination(doc, me.uid, 'replies')
        const cap2 = Math.min(Math.max(d2.maxPage, 1), cfg.maxPages || 50)
        for (let p = 1; p <= cap2; p++) {
          if (p > 1) {
            if (!silent) api.ui.toast(`回帖备份中 ${p}/${cap2}…`, { title: '个人存档' })
            doc = await api.net.doc(pageUrl(me.uid, 'replies', p, d2.paramName))
          }
          const items = api.parse.list(doc)
          if (items.length) {
            for (const it of items) {
              merged.replies[it.id] = { id: it.id, title: it.title, lastTs: it.lastActiveTs }
            }
          } else if (p === 1) {
            merged.repliesUnparsed = doc.querySelectorAll('ul.post-list > li').length
            persist()
            break
          }
          pagesDone++
          persist()
        }
      }

      persist()
      const summary = { ...summaryOf(merged), pagesDone }
      if (!silent) {
        api.ui.toast(
          `备份完成：主题 ${summary.topicCount} · 回帖 ${summary.replyCount}`,
          { title: '个人存档', type: 'success' },
        )
      }
      return summary
    }

    function summaryOf(a) {
      return {
        uid: a.uid,
        topicCount: Object.keys(a.topics || {}).length,
        replyCount: Object.keys(a.replies || {}).length + (a.repliesUnparsed || 0),
        firstBackupAt: a.firstBackupAt,
        lastBackupAt: a.lastBackupAt,
      }
    }

    /* ── Markdown / JSON 导出 ── */
    function toMarkdown(a) {
      const s = summaryOf(a)
      const fmt = (ts) => (ts ? new Date(ts * 1000).toLocaleDateString('zh-CN') : '')
      const lines = [
        `# linux.sb 个人存档 · ${a.name || 'uid ' + a.uid}`,
        '',
        `- 导出时间：${new Date().toLocaleString('zh-CN')}`,
        `- 首次备份：${new Date(s.firstBackupAt).toLocaleString('zh-CN')}`,
        `- 主题 ${s.topicCount} 篇 · 回帖 ${s.replyCount} 条`,
        '',
        `## 主题`,
        '',
        ...Object.values(a.topics || {})
          .sort((x, y) => (y.lastTs || 0) - (x.lastTs || 0))
          .map((t) => `- [${t.title}](${api.routes.topic(t.id)}) — ${t.forumName || ''}${t.replies != null ? ` · ${t.replies} 回复` : ''} · ${fmt(t.lastTs)}${t.pinned ? ' · 📌' : ''}`),
        '',
        `## 回帖`,
        '',
        ...(a.repliesUnparsed
          ? [`原始条目 ${a.repliesUnparsed} 条（页面结构未解析，可从 JSON 档案补齐）`]
          : Object.values(a.replies || {})
              .sort((x, y) => (y.lastTs || 0) - (x.lastTs || 0))
              .map((t) => `- [${t.title}](${api.routes.topic(t.id)}) · ${fmt(t.lastTs)}`)),
      ]
      return lines.join('\n')
    }

    function saveText(name, text, mime) {
      try {
        const blob = new Blob([text], { type: mime })
        const a = document.createElement('a')
        a.href = URL.createObjectURL(blob)
        a.download = name
        a.click()
        setTimeout(() => URL.revokeObjectURL(a.href), 4000)
        return true
      } catch (e) {
        api.log('下载失败', e)
        lastDownload = { name, size: text.length }
        return false
      }
    }
    let lastDownload = null

    /* ── 面板 ── */
    api.ui.tab({
      name: '个人存档',
      order: 69,
      render(host) {
        const a = archGet()
        host.innerHTML = a
          ? `<div class="lsb-row-desc">上次备份：${new Date(a.lastBackupAt).toLocaleString('zh-CN')} · 主题 ${
              Object.keys(a.topics || {}).length
            } 篇 · 回帖 ${Object.keys(a.replies || {}).length + (a.repliesUnparsed || 0)} 条</div>`
          : '<div class="lsb-empty">还没有备份过。</div>'

        const bar = document.createElement('div')
        bar.className = 'lsb-actions'
        bar.style.cssText += ';border:0;padding:8px 0;flex-wrap:wrap'
        const mkBtn = (label, primary, fn) => {
          const b = document.createElement('button')
          b.className = 'lsb-btn' + (primary ? ' is-primary' : '')
          b.textContent = label
          b.onclick = () => fn(b)
          bar.appendChild(b)
          return b
        }
        mkBtn('🔄 开始 / 增量备份', true, (b) => {
          b.disabled = true
          b.textContent = '抓取中…'
          backup()
            .then(() => api.ui.showTab('my-archive'))
            .catch((e) => api.ui.toast(e.message, { type: 'error' }))
            .finally(() => {
              b.disabled = false
            })
        })
        if (a) {
          mkBtn('⬇ JSON', false, () =>
            saveText(`linuxsb-my-${a.uid}-${today()}.json`, JSON.stringify(a, null, 2), 'application/json'),
          )
          mkBtn('⬇ Markdown', false, () =>
            saveText(`linuxsb-my-${a.uid}-${today()}.md`, toMarkdown(a), 'text/markdown'),
          )
          mkBtn('🗑 清空本地档', false, async () => {
            if (await api.ui.confirm('清空本地累积的存档？（不影响线上）')) {
              api.store.del('archive')
              api.ui.showTab('my-archive')
            }
          })
        }
        host.appendChild(bar)
      },
    })

    function today() {
      const x = new Date()
      const p = (n) => String(n).padStart(2, '0')
      return x.getFullYear() + p(x.getMonth() + 1) + p(x.getDate())
    }

    /* ── RPC + 调试 ── */
    api.handle('my-archive:summary', () => {
      const a = archGet()
      if (!a) return { topicCount: 0, replyCount: 0, lastBackupAt: null, empty: true }
      return summaryOf(a)
    })
    api.handle('my-archive:debug', () => ({
      backup,
      archive: archGet,
      markdown: () => toMarkdown(archGet()),
      lastDownload: () => lastDownload,
      forget: (id) => {
        const a = archGet()
        delete a.topics[id]
        delete a.replies[id]
        api.store.set('archive', a)
      },
    }))

    return {}
  }

  const w = typeof unsafeWindow !== 'undefined' ? unsafeWindow : window
  if (w.LSB && w.LSB.register) w.LSB.register(manifest, setup)
  else {
    w.LSB_PLUGINS = w.LSB_PLUGINS || []
    w.LSB_PLUGINS.push({ manifest, setup })
  }
})()


;
/* ══════════════ LSB·年度报告 v1.0.1 (annual-report) ══════════════ */
(function () {
  'use strict'

  const manifest = {
    id: 'annual-report',
    name: '年度报告',
    version: '1.0.1',
    description: '聚合全部本地数据出一份「我的 linux.sb 这一年」',
    author: 'you',
    requires: { base: '^0.1.0' },
    permissions: ['read', 'storage', 'ui', 'events'],
  }

  const DAYS = 365

  function setup(api) {
    let lastMd = null

    async function collect() {
      const since = Date.now() - DAYS * 864e5
      const safe = async (label, fn) => {
        try {
          return { label, value: await fn() }
        } catch {
          return { label, value: null } // 模块未安装 / 被停用
        }
      }

      const [points, checkin, reading, inbox, hits, archive] = await Promise.all([
        safe('积分趋势', () => api.request('points-ledger:series', { days: DAYS })),
        safe('签到日历', () => api.request('checkin-calendar:debug')),
        safe('断点续读', () => api.request('resume-reading:debug')),
        safe('未读哨兵', () => api.request('unread-sentinel:debug')),
        safe('机会监控', () => api.request('forum-watch:debug')),
        safe('个人存档', () => api.request('my-archive:summary')),
      ])

      /* 积分 */
      let pointsStats = null
      if (points.value && points.value.length >= 2) {
        const s = points.value
        const first = s[0]
        const lastP = s[s.length - 1]
        const peak = s.reduce((m, x) => (x.p > m.p ? x : m), s[0])
        pointsStats = {
          start: first.p,
          end: lastP.p,
          delta: lastP.p - first.p,
          peak: peak.p,
          snapshots: s.length,
          spark: s.map((x) => x.p),
        }
      }

      /* 签到 */
      let checkinStats = null
      if (checkin.value) {
        const recs = checkin.value.recs()
        const okDays = Object.keys(recs).filter((k) => recs[k].s === 'ok')
        const inWindow = okDays.filter((k) => new Date(k + 'T12:00:00').getTime() >= since)
        checkinStats = { totalOk: okDays.length, windowOk: inWindow.length, streak: checkin.value.streak() }
      }

      /* 阅读 */
      let readingStats = null
      if (reading.value) {
        const all = reading.value.all()
        const list = Object.entries(all)
          .map(([id, r]) => ({ id: Number(id), title: r.title, f: r.f, ts: r.ts }))
          .sort((a, b) => b.ts - a.ts)
        readingStats = { count: list.length, recent: list.slice(0, 3) }
      }

      return {
        since,
        sections: [
          { key: 'points', label: '📈 积分轨迹', ok: !!pointsStats, stats: pointsStats, raw: null },
          {
            key: 'checkin',
            label: '✅ 签到',
            ok: !!checkinStats,
            stats: checkinStats,
            raw: null,
          },
          { key: 'reading', label: '📖 阅读足迹', ok: !!readingStats, stats: readingStats, raw: null },
          {
            key: 'inbox',
            label: '🔔 消息箱动态',
            ok: !!inbox.value,
            stats: inbox.value ? { count: inbox.value.inbox().length } : null,
            raw: null,
          },
          {
            key: 'hits',
            label: '🎯 机会命中',
            ok: !!hits.value,
            stats: hits.value ? { count: hits.value.hits().length } : null,
            raw: null,
          },
          {
            key: 'archive',
            label: '🗄 个人存档',
            ok: !!archive.value,
            stats: archive.value,
            raw: null,
          },
        ],
      }
    }

    /* ── 渲染 ── */
    function verdict(points, checkin) {
      const out = []
      if (points && points.delta !== 0) {
        out.push(points.delta > 0 ? `这一年净赚 ${points.delta} 分，攒饼能力在线。` : `这一年净亏 ${Math.abs(points.delta)} 分，消费需节制。`)
      }
      if (checkin && checkin.streak >= 7) out.push(`连续签到 ${checkin.streak} 天，毅力可嘉。`)
      return out
    }

    function renderHtml(data) {
      const sec = data.sections
      const row = (label, val, muted) =>
        `<div class="lsb-row"><span>${label}</span><strong style="margin-left:auto;${muted ? 'color:var(--text-muted,#888);font-weight:400' : ''}">${val}</strong></div>`
      let html = ''

      // 积分
      const p = sec.find((s) => s.key === 'points')
      html += `<h3 style="margin:10px 0 4px">📈 积分轨迹</h3>`
      if (p.ok) {
        const st = p.stats
        html +=
          row('区间变化', `${st.start} → ${st.end}`) +
          row('净增减', `${st.delta > 0 ? '+' : ''}${st.delta}`, false) +
          row('期间峰值', String(st.peak)) +
          row('快照次数', String(st.snapshots))
        // sparkline
        if (st.spark.length > 1) {
          const min = Math.min(...st.spark)
          const max = Math.max(...st.spark)
          const span = max - min || 1
          const pts = st.spark.map((v, i) => `${(i / (st.spark.length - 1)) * 300},${30 - ((v - min) / span) * 26}`).join(' ')
          html += `<svg width="300" height="34" style="margin-top:4px"><polyline points="${pts}" fill="none" stroke="var(--brand,#5eaaa0)" stroke-width="2"/></svg>`
        }
      } else {
        html += `<div class="lsb-empty">安装「积分趋势」并产生快照后解锁。</div>`
      }

      // 签到
      const c = sec.find((s) => s.key === 'checkin')
      html += `<h3 style="margin:14px 0 4px">✅ 签到</h3>`
      html += c.ok
        ? row('累计签到', `${c.stats.totalOk} 天`) + row('近一年', `${c.stats.windowOk} 天`) + row('当前连击', `${c.stats.streak} 天`)
        : `<div class="lsb-empty">安装「签到日历」后解锁。</div>`

      // 阅读
      const r = sec.find((s) => s.key === 'reading')
      html += `<h3 style="margin:14px 0 4px">📖 阅读足迹</h3>`
      html += r.ok
        ? row('追踪帖子', `${r.stats.count} 帖`) +
          (r.stats.recent.length
            ? `<div class="lsb-row-desc" style="margin-top:4px">最近在读：${r.stats.recent.map((x) => api.util.esc(x.title || '#' + x.id)).join('、')}</div>`
            : '')
        : `<div class="lsb-empty">安装「断点续读」后解锁。</div>`

      // 其余计数行
      for (const key of ['inbox', 'hits']) {
        const s = sec.find((x) => x.key === key)
        html += `<h3 style="margin:14px 0 4px">${s.label}</h3>`
        html += s.ok ? row('数值', String(s.stats.count ?? (s.stats.online ? '在线' : '离线'))) : `<div class="lsb-empty">对应模块未安装或无数据。</div>`
      }

      // 存档
      const a = sec.find((x) => x.key === 'archive')
      html += `<h3 style="margin:14px 0 4px">🗄 个人存档</h3>`
      html += a.ok
        ? row('主题 / 回帖', `${a.stats.topicCount} / ${a.stats.replyCount}`)
        : `<div class="lsb-empty">安装「个人存档」后解锁。</div>`

      // 判词
      const v = verdict(p.ok ? p.stats : null, c.ok ? c.stats : null)
      if (v.length) {
        html += `<div class="lsb-row" style="border:0;margin-top:10px"><em>${v.map(api.util.esc).join(' ')}</em></div>`
      }
      return html
    }

    function buildMd(data) {
      const L = [`# 我的 linux.sb 这一年`, '', `- 统计窗口：近 ${DAYS} 天`, `- 生成时间：${new Date().toLocaleString('zh-CN')}`, '']
      const s = Object.fromEntries(data.sections.map((x) => [x.key, x]))
      L.push(`## 📈 积分轨迹`)
      if (s.points.ok) {
        L.push(`- ${s.points.stats.start} → ${s.points.stats.end}（净增减 **${s.points.stats.delta > 0 ? '+' : ''}${s.points.stats.delta}**）`)
        L.push(`- 期间峰值 ${s.points.stats.peak} · 快照 ${s.points.stats.snapshots} 次`)
      } else L.push('- （无数据）')
      L.push('', `## ✅ 签到`)
      L.push(s.checkin.ok ? `- 累计 ${s.checkin.stats.totalOk} 天 · 近一年 ${s.checkin.stats.windowOk} 天 · 连击 ${s.checkin.stats.streak} 天` : '- （无数据）')
      L.push('', `## 📖 阅读足迹`)
      if (s.reading.ok) {
        L.push(`- 追踪 ${s.reading.stats.count} 帖`)
        for (const x of s.reading.stats.recent) L.push(`  - [${x.title || '#' + x.id}](${api.routes.topic(x.id)})`)
      } else L.push('- （无数据）')
      for (const [key, label] of [['inbox', '消息箱'], ['hits', '机会命中']]) {
        const x = s[key]
        L.push('', `## ${label}`)
        L.push(x.ok ? '- 有记录' : '- （无数据）')
      }
      L.push('', `## 🗄 个人存档`)
      L.push(s.archive.ok ? `- 主题 ${s.archive.stats.topicCount} · 回帖 ${s.archive.stats.replyCount}` : '- （无数据）')
      return L.join('\n')
    }

    /* ── 面板 ── */
    api.ui.tab({
      name: '年度报告',
      order: 70,
      render(host) {
        host.innerHTML = '<div class="lsb-empty">汇总中…</div>'
        collect().then((data) => {
          host.innerHTML =
            `<div class="lsb-cal-head"><strong>我的 linux.sb 这一年</strong>` +
            `<span class="lsb-row-desc">窗口：近 ${DAYS} 天</span></div>` +
            renderHtml(data)
          const bar = document.createElement('div')
          bar.className = 'lsb-actions'
          bar.style.border = '0'
          const md = document.createElement('button')
          md.className = 'lsb-btn is-primary'
          md.textContent = '⬇ 导出 Markdown'
          md.onclick = () => {
            lastMd = buildMd(data)
            try {
              const blob = new Blob([lastMd], { type: 'text/markdown' })
              const a = document.createElement('a')
              a.href = URL.createObjectURL(blob)
              a.download = `linuxsb-year-report-${today()}.md`
              a.click()
              setTimeout(() => URL.revokeObjectURL(a.href), 4000)
            } catch {
              api.ui.toast('下载失败，可用调试接口取文本', { type: 'error' })
            }
          }
          bar.appendChild(md)
          host.appendChild(bar)
        })
      },
    })

    function today() {
      const x = new Date()
      const p = (n) => String(n).padStart(2, '0')
      return x.getFullYear() + p(x.getMonth() + 1) + p(x.getDate())
    }

    /* ── 调试 ── */
    api.handle('annual-report:debug', () => ({
      collect,
      buildMd: async () => {
        lastMd = buildMd(await collect())
        return lastMd
      },
      lastMd: () => lastMd,
    }))

    return {}
  }

  const w = typeof unsafeWindow !== 'undefined' ? unsafeWindow : window
  if (w.LSB && w.LSB.register) w.LSB.register(manifest, setup)
  else {
    w.LSB_PLUGINS = w.LSB_PLUGINS || []
    w.LSB_PLUGINS.push({ manifest, setup })
  }
})()


;
/* ══════════════ LSB·界面精修 v2.0.59 (skin) ══════════════ */
// Generated by scripts/build-skin.mjs. Edit plugins/skin/ sources; run npm run build:skin.


(function () {
  'use strict'

  const manifest = {
    id: 'skin',
    name: '界面精修',
    version: '2.0.59',
    description: '旧三段式与 iOS 27 单画布双模式，保留正文排版与站内安全链',
    author: 'you',
    requires: { base: '^0.2.3' },
    permissions: ['ui', 'storage', 'events', 'read'],
    config: {
      shell: { type: 'switch', label: '氢壳', desc: '同时控制旧三段式和 iOS 27 单画布；关闭后恢复站点原生页面。', default: true },
      uiMode: {
        type: 'select',
        label: '界面模式',
        default: 'legacy',
        options: [
          { value: 'legacy', label: '旧三段式' },
          { value: 'ios27', label: 'iOS 27 单画布' },
        ],
      },
      topicSpa: { type: 'switch', label: '帖子页同文档软跳', desc: '默认开启；可关闭以恢复站点原生帖子生命周期与交互。', default: true },
      glass: { type: 'switch', label: '玻璃材料', default: false },
      glassOpacity: { type: 'number', label: '玻璃透明度（0.35–1）', default: 0.72 },
      glassBlur: { type: 'number', label: '玻璃模糊（0–32px）', default: 18 },
      baseFontSize: { type: 'number', label: '基础字号（12–32px）', default: 14 },
      fontFamily: { type: 'text', label: '界面字体', default: '' },
      fontUrl: { type: 'text', label: '字体 URL（HTTPS）', default: '' },
      backgroundVideoEnabled: { type: 'switch', label: '启用视频背景', default: false },
      backgroundVideoUrl: { type: 'text', label: '视频 URL（HTTPS）', default: '' },
      backgroundVideoLocalKey: { type: 'text', label: '本地视频资源键', default: '' },
      backgroundImageUrl: { type: 'text', label: '静态图片 URL（HTTPS）', default: '' },
      backgroundImageLocalKey: { type: 'text', label: '本地图片资源键', default: '' },
      fontLocalKey: { type: 'text', label: '本地字体资源键', default: '' },
      typography: { type: 'switch', label: '正文排版（行高 1.75 · 中文字体栈）', default: true },
      density: {
        type: 'select',
        label: '列表密度',
        default: '舒适',
        options: ['紧凑', '舒适'],
      },
      codeblock: { type: 'switch', label: '代码块样式强化', default: true },
      floors: { type: 'switch', label: '楼层优化（分隔线）', default: true },
      measure: { type: 'switch', label: '宽屏限宽阅读（≥1280px 生效）', default: false },
    },
  }

  const CANVAS_STATE_VERSION = 2
  const CANVAS_STATE_KEY = 'canvas-state:v2'
  const CANVAS_WIDTH_CLASSES = ['wide', 'mid', 'narrow']

  const CANVAS_DEFAULT_APPEARANCE = Object.freeze({
    background: 'static', backgroundVideoUrl: '', backgroundVideoLocalKey: '', backgroundImageUrl: '', backgroundImageLocalKey: '',
    opacity: 0.72, blur: 18, fontFamily: '', fontUrl: '', fontLocalKey: '',
    fontSize: 14, textColor: '', panelColor: '', accentColor: '', radius: 16,
    motion: 'auto', transparency: 'auto',
  })
  const CANVAS_DEFAULT_SURFACES = Object.freeze({
    siteCard: { width: 360, height: 560 }, evidenceCard: { width: 420, height: 320 },
  })

  function canvasFinite(value, fallback = 0) {
    const n = Number(value)
    return Number.isFinite(n) ? n : fallback
  }

  function canvasCopy(value) {
    if (value === null || typeof value !== 'object') return value
    if (Array.isArray(value)) return value.map(canvasCopy)
    const out = {}
    for (const [key, item] of Object.entries(value)) out[key] = canvasCopy(item)
    return out
  }

  function canvasMerge(left, right) {
    const a = left && typeof left === 'object' ? left : {}
    const b = right && typeof right === 'object' ? right : {}
    const out = canvasCopy(a)
    for (const [key, value] of Object.entries(b)) {
      if (value && typeof value === 'object' && !Array.isArray(value) && a[key] && typeof a[key] === 'object' && !Array.isArray(a[key])) out[key] = canvasMerge(a[key], value)
      else out[key] = canvasCopy(value)
    }
    return out
  }

  function widthClass(width) {
    const n = canvasFinite(width, 0)
    return n >= 1100 ? 'wide' : n >= 700 ? 'mid' : 'narrow'
  }

  function siteKeyFromLocation(locationLike) {
    try {
      const url = locationLike instanceof URL
        ? locationLike
        : new URL(String(locationLike?.href || locationLike || ''), 'https://linux.sb/')
      return url.origin
    } catch {
      return ''
    }
  }

  function defaultCanvasState() {
    return {
      version: CANVAS_STATE_VERSION,
      enabled: true,
      global: {
        preset: 'balanced-glass',
        appearance: canvasCopy(CANVAS_DEFAULT_APPEARANCE),
        surfaceDefaults: canvasCopy(CANVAS_DEFAULT_SURFACES),
        layout: { wide: {}, mid: {}, narrow: {} },
      },
      sites: {},
      legacyLayoutSnapshot: null,
    }
  }

  function mergeCanvasState(globalState, siteOverride = {}) {
    const source = globalState && typeof globalState === 'object' ? globalState : {}
    const base = source.global && typeof source.global === 'object' ? source.global : source
    const overrideSource = siteOverride && typeof siteOverride === 'object' ? siteOverride : {}
    const override = overrideSource.global && typeof overrideSource.global === 'object' ? overrideSource.global : overrideSource
    const merged = canvasMerge(base, override)
    if (!merged.preset) merged.preset = 'balanced-glass'
    merged.appearance = canvasMerge(CANVAS_DEFAULT_APPEARANCE, merged.appearance)
    merged.surfaceDefaults = canvasMerge(CANVAS_DEFAULT_SURFACES, merged.surfaceDefaults)
    merged.layout = canvasMerge({ wide: {}, mid: {}, narrow: {} }, merged.layout)
    return merged
  }

  function clampSurfaceRect(rect = {}, viewport = {}, minimum = {}) {
    const vw = Math.max(1, Math.round(canvasFinite(viewport.width, 1)))
    const vh = Math.max(1, Math.round(canvasFinite(viewport.height, 1)))
    const minWidth = Math.max(1, Math.round(canvasFinite(minimum.width, 240)))
    const minHeight = Math.max(1, Math.round(canvasFinite(minimum.height, 160)))
    const width = Math.min(vw, Math.max(minWidth, Math.round(canvasFinite(rect.width, minWidth))))
    const height = Math.min(vh, Math.max(minHeight, Math.round(canvasFinite(rect.height, minHeight))))
    const x = Math.min(Math.max(0, Math.round(canvasFinite(rect.x, 0))), Math.max(0, vw - width))
    const y = Math.min(Math.max(0, Math.round(canvasFinite(rect.y, 0))), Math.max(0, vh - height))
    return { x, y, width, height }
  }

  function migrateLegacySkinState(rawConfig = {}, mediaMeta = {}) {
    const raw = rawConfig && typeof rawConfig === 'object' ? rawConfig : {}
    const next = defaultCanvasState()
    next.enabled = raw.shell !== false
    const appearance = {}
    for (const [source, target] of [['backgroundVideoUrl', 'backgroundVideoUrl'], ['backgroundVideoLocalKey', 'backgroundVideoLocalKey'], ['backgroundImageUrl', 'backgroundImageUrl'], ['backgroundImageLocalKey', 'backgroundImageLocalKey'], ['fontUrl', 'fontUrl'], ['fontLocalKey', 'fontLocalKey'], ['fontFamily', 'fontFamily'], ['textColor', 'textColor'], ['panelColor', 'panelColor'], ['accentColor', 'accentColor']]) {
      if (raw[source]) appearance[target] = String(raw[source])
    }
    if (raw.baseFontSize != null) appearance.fontSize = canvasFinite(raw.baseFontSize, 14)
    if (raw.glassOpacity != null) appearance.opacity = canvasFinite(raw.glassOpacity, 0.72)
    if (raw.glassBlur != null) appearance.blur = canvasFinite(raw.glassBlur, 18)
    if (raw.backgroundVideoEnabled === true) appearance.background = 'video'
    else if (raw.backgroundImageUrl || raw.backgroundImageLocalKey) appearance.background = 'image'
    if (Object.keys(appearance).length) next.global.appearance = canvasMerge(next.global.appearance, appearance)
    if (mediaMeta && typeof mediaMeta === 'object') next.global.appearance = canvasMerge(next.global.appearance, {
      ...(mediaMeta.videoId || mediaMeta.videoKey ? { backgroundVideoLocalKey: mediaMeta.videoId || mediaMeta.videoKey } : {}),
      ...(mediaMeta.fontId || mediaMeta.fontKey ? { fontLocalKey: mediaMeta.fontId || mediaMeta.fontKey } : {}),
    })
    next.legacyLayoutSnapshot = {
      version: 1, shell: raw.shell, layoutMode: raw.layoutMode, header: raw.header, rail: raw.rail, aside: raw.aside,
      wallpaperUrl: raw.wallpaperUrl, backgroundVideoUrl: raw.backgroundVideoUrl, backgroundVideoLocalKey: raw.backgroundVideoLocalKey,
      backgroundImageUrl: raw.backgroundImageUrl, backgroundImageLocalKey: raw.backgroundImageLocalKey,
      fontFamily: raw.fontFamily, fontUrl: raw.fontUrl, fontLocalKey: raw.fontLocalKey, glassOpacity: raw.glassOpacity, glassBlur: raw.glassBlur,
    }
    return next
  }

  function resolveSurfaceMode(widthValue, surfaceKind = '') {
    const bucket = CANVAS_WIDTH_CLASSES.includes(widthValue) ? widthValue : 'wide'
    const kind = String(surfaceKind || '')
    if (kind === 'top-status' || kind === 'tool-capsule') return 'fixed'
    if (bucket === 'wide') {
      if (kind === 'site-card') return 'rail'
      return kind.endsWith('sheet') ? 'sheet' : 'floating'
    }
    return bucket === 'mid' ? 'sheet' : 'fullscreen'
  }
  const FONT_SANS =
    "system-ui,-apple-system,'Segoe UI','PingFang SC','Hiragino Sans GB','Microsoft YaHei','Noto Sans SC',sans-serif"
  const FONT_MONO =
    "ui-monospace,SFMono-Regular,'Cascadia Code',Consolas,'JetBrains Mono','Noto Sans Mono CJK SC',monospace"

  // · B1 shellCss: 旧三段式壳（固定顶栏/左轨/右栏变量与栅格） ──
  function shellCss() {
    return `
      html.lsb-skin-shell-on{
        --lsb-shell-header:48px;
        --lsb-shell-rail:240px;
        --lsb-shell-gutter:12px;
        --lsb-shell-panel-pad:24px;
        --lsb-shell-main-inset:calc(var(--lsb-shell-gutter) + var(--lsb-shell-panel-pad));
        --lsb-shell-aside:280px;
        --lsb-shell-timeline:72px;
        --lsb-radius:12px;
        --lsb-radius-sm:8px;
        --lsb-radius-lg:16px;
        background:var(--bg,#f4f5f7);
        color:var(--text,#222);
      }
      html.lsb-skin-shell-topic{--lsb-shell-main-inset:var(--lsb-shell-gutter)}
      html.lsb-skin-shell-user{--lsb-shell-main-inset:calc(var(--lsb-shell-gutter) + 12px)}
      html[data-themes-color-mode="dark"],html[data-dark-mode-theme="dark"]{color-scheme:dark}
      html[data-themes-color-mode="light"],html[data-dark-mode-theme="light"]{color-scheme:light}
      #lsb-shell{
        display:none;position:fixed;inset:0;z-index:7999;pointer-events:none;
      }
      #lsb-shell > *{pointer-events:auto}
      #lsb-shell-header{
        position:fixed;top:0;left:0;right:0;height:var(--lsb-shell-header);z-index:8002;
        display:grid;align-items:center;
        grid-template-columns:var(--lsb-shell-rail) minmax(160px,360px) minmax(0,1fr) auto auto;
        column-gap:0;padding:0 16px 0 0;
        background:color-mix(in srgb,var(--panel,#fff) 78%,transparent);
        backdrop-filter:blur(16px) saturate(140%);
        -webkit-backdrop-filter:blur(16px) saturate(140%);
        box-shadow:0 1px 0 color-mix(in srgb,var(--line,#ddd) 55%,transparent);
        font-family:${FONT_SANS};
      }
      #lsb-shell-rail{
        position:fixed;top:0;left:0;bottom:0;width:var(--lsb-shell-rail);z-index:8001;
        display:flex;flex-direction:column;
        background:var(--bg,#f4f5f7);color:var(--text,#222);
        border-right:1px solid var(--line-soft,#e8e8e8);
        font-family:${FONT_SANS};
      }
      .lsb-shell-rail-scroll{flex:1;min-height:0;overflow:hidden;padding:56px 12px 12px;display:flex;flex-direction:column}
      .lsb-shell-rail-scroll [data-lsb-shell-section="home"]{flex:0 0 auto}
      .lsb-shell-rail-scroll [data-lsb-shell-section="boards"]{flex:1 1 auto;min-height:0;overflow:auto}
      .lsb-shell-rail-scroll [data-lsb-shell-section="tools"]{flex:0 0 auto}
      .lsb-shell-me{margin:0 0 14px}
      .lsb-shell-me .sidebar-card.user-card{
        margin:0;padding:10px 10px;border:0;box-shadow:none;
        border-radius:var(--lsb-radius);
        background:color-mix(in srgb,var(--panel,#fff) 72%,transparent);
      }
      .lsb-shell-me .user-header-info{gap:8px}
      .lsb-shell-me .user-avatar-big img,.lsb-shell-me .avatar-img{
        width:40px!important;height:40px!important;
      }
      .lsb-shell-me .user-name{font-size:13px;font-weight:600;white-space:nowrap;overflow:hidden;text-overflow:ellipsis}
      .lsb-shell-me .user-rank{font-size:11px;color:var(--text-muted,#888)}
      .lsb-shell-rail-foot{padding:10px 12px 14px;border-top:1px solid var(--line-soft,#e8e8e8)}
      .lsb-shell-brand{
        display:flex;align-items:center;gap:8px;margin:0;width:100%;height:100%;
        padding:0 14px;font-weight:700;font-size:14px;letter-spacing:-.02em;
        color:var(--text,#222);text-decoration:none;
        min-width:0;white-space:nowrap;overflow:hidden;
      }
      .lsb-shell-logo{
        flex:0 0 22px;width:22px;height:22px;border-radius:6px;display:block;
      }
      .lsb-shell-search-host{
        min-width:0;max-width:360px;width:100%;box-sizing:border-box;
        padding-left:var(--lsb-shell-main-inset);
      }
      .lsb-shell-search-host .search-form,.lsb-shell-search-host .lsb-shell-search{
        display:flex;align-items:center;gap:8px;margin:0;padding:3px 6px 3px 10px;
        width:100%;max-width:none;justify-self:stretch;
        grid-column:auto;grid-row:auto;
        border-radius:var(--lsb-radius);overflow:hidden;
        background:color-mix(in srgb,var(--bg,#f4f5f7) 88%,transparent);
      }
      .lsb-shell-search-host .search-page-link{
        display:flex;align-items:center;margin:0;padding:0;width:100%;max-width:none;height:30px;
        grid-area:auto;grid-column:auto;grid-row:auto;justify-self:stretch;
        border:1px solid var(--line,#ddd);border-radius:var(--lsb-radius);
        background:color-mix(in srgb,var(--bg,#f4f5f7) 88%,transparent);
        color:var(--text-subtle,#888);text-decoration:none;overflow:hidden;
      }
      .lsb-shell-search-host .search-page-fake-input{
        flex:1;min-width:0;padding:0 10px;font-size:13px;
        white-space:nowrap;overflow:hidden;text-overflow:ellipsis;
      }
      .lsb-shell-search-host .search-page-fake-icon{
        display:inline-flex;align-items:center;justify-content:center;
        flex:0 0 30px;width:30px;height:100%;
      }
      .lsb-shell-search-host select{
        border:0;border-radius:var(--lsb-radius-sm);background:transparent;
        color:var(--text,#222);font-size:12px;height:26px;
      }
      .lsb-shell-search-host input[type=search],.lsb-shell-search-host input[name=q]{
        flex:1;min-width:0;height:26px;border:0;border-radius:var(--lsb-radius-sm);
        background:transparent;color:var(--text,#222);padding:0 8px;font-size:13px;
      }
      .lsb-shell-search-host button{
        border:0;border-radius:var(--lsb-radius-sm);height:26px;padding:0 10px;
        background:var(--brand-soft,#e8f4f2);color:var(--brand,#5eaaa0);font-size:12px;cursor:pointer;
      }
      .lsb-shell-extras{
        display:flex;align-items:center;gap:14px;min-width:0;overflow:hidden;
        margin-left:16px;
      }
      .lsb-shell-extras a{
        flex:0 0 auto;color:var(--text,#222);text-decoration:none;font-size:13px;font-weight:500;
        white-space:nowrap;
      }
      .lsb-shell-where{
        margin-left:16px;font-size:13px;font-weight:600;letter-spacing:-.01em;
        color:var(--text,#222);white-space:nowrap;overflow:hidden;text-overflow:ellipsis;max-width:22vw;
      }
      .lsb-shell-theme{margin-left:8px;display:flex;align-items:center;gap:8px;overflow:visible;position:relative}
      .lsb-shell-theme [data-themes-mode-toggle]{
        border:0;background:transparent;color:var(--text,#222);cursor:pointer;
        width:32px;height:32px;padding:4px;border-radius:var(--lsb-radius-sm);
      }
      .lsb-shell-theme [data-themes-mode-toggle] svg{display:block;width:18px;height:18px}
      .lsb-shell-theme .dark-mode-control{position:relative;flex:0 0 auto;grid-area:auto;justify-self:auto}
      .lsb-shell-theme .dark-mode-menu{z-index:8003}
      html.lsb-skin-shell-on #color-scheme-modal{z-index:8020!important}
      html.lsb-skin-shell-on .lsb-shell-theme-modal{z-index:8020!important}
      .lsb-shell-theme .color-scheme-top-link{
        display:inline-flex;width:30px;height:30px;align-items:center;justify-content:center;
        grid-area:auto;justify-self:auto;flex:0 0 30px;
        color:var(--text-muted,#888);text-decoration:none;
      }
      .lsb-shell-theme .color-scheme-top-link svg{width:17px;height:17px;display:block}
      #lsb-shell-aside{
        display:none;flex-direction:column;position:fixed;top:var(--lsb-shell-header);right:0;bottom:0;
        width:var(--lsb-shell-aside);z-index:7999;overflow:hidden;padding:0;
        background:var(--bg,#f4f5f7);color:var(--text,#222);
        border-left:1px solid var(--line-soft,#e8e8e8);
        font-family:${FONT_SANS};
      }
      #lsb-shell-aside-tabs{
        display:flex;align-items:center;gap:4px;min-height:40px;padding:6px 10px;
        border-bottom:1px solid var(--line-soft,#e8e8e8);background:color-mix(in srgb,var(--panel,#fff) 72%,transparent);
      }
      #lsb-shell-aside-tabs[hidden]{display:none!important}
      #lsb-shell-aside-tabs [data-lsb-shell-aside-tab]{
        flex:1 1 0;min-width:0;height:28px;padding:0 8px;border:0;border-radius:var(--lsb-radius-sm);
        background:transparent;color:var(--text-muted,#888);font:inherit;font-size:12px;cursor:pointer;
      }
      #lsb-shell-aside-tabs [data-lsb-shell-aside-tab][aria-selected="true"]{
        background:var(--brand-soft,#e8f4f2);color:var(--brand,#5eaaa0);font-weight:600;
      }
      .lsb-shell-aside-panes{flex:1 1 auto;height:auto;min-height:0}
      [data-lsb-shell-aside-pane]{height:100%;min-height:0;box-sizing:border-box;overflow:auto;padding:12px 10px 16px}
      [data-lsb-shell-aside-pane][hidden]{display:none!important}
      #lsb-shell-aside .sidebar-card{
        margin:0 0 10px;padding:10px 10px 8px;border-radius:var(--lsb-radius);
        background:color-mix(in srgb,var(--panel,#fff) 78%,transparent);
      }
      .lsb-shell-nav-section{margin:0 0 16px}
      .lsb-shell-nav-section h2{
        margin:0 8px 6px;font-size:11px;font-weight:600;color:var(--text-muted,#888);
        letter-spacing:.04em;
      }
      .lsb-shell-nav .lsb-shell-link{
        display:flex;align-items:center;justify-content:space-between;gap:8px;padding:6px 10px;border-radius:var(--lsb-radius-sm);
        color:var(--text,#222);text-decoration:none;font-size:13px;font-weight:500;
        width:100%;border:0;background:transparent;cursor:pointer;text-align:left;font-family:inherit;box-sizing:border-box;
      }
      .lsb-shell-nav .lsb-shell-link-label{
        min-width:0;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;
      }
      .lsb-shell-nav .lsb-shell-count{
        flex:0 0 auto;font-size:11px;font-weight:500;color:var(--text-muted,#888);
        font-variant-numeric:tabular-nums;
      }
      .lsb-shell-nav a.is-active{
        background:var(--brand-soft,#e8f4f2);color:var(--brand,#5eaaa0);font-weight:600;
      }
      .lsb-shell-settings{
        width:100%;height:32px;border:0;border-radius:var(--lsb-radius-sm);cursor:pointer;
        background:transparent;color:var(--text,#222);font-size:13px;font-weight:600;
      }
      .lsb-shell-settings:active,.lsb-shell-nav .lsb-shell-link:active{transform:scale(.98)}
      #lsb-shell-timeline{
        position:fixed;top:calc(var(--lsb-shell-header) + 20px);right:14px;bottom:28px;
        width:var(--lsb-shell-timeline);z-index:7998;
        display:flex;flex-direction:column;align-items:center;gap:8px;
        font-family:${FONT_SANS};font-size:11px;font-weight:600;color:var(--text-muted,#888);
      }
      #lsb-shell-timeline[hidden]{display:none!important}
      html.lsb-skin-shell-on .image-lightbox-image{max-width:100%;max-height:100%}
      .lsb-shell-edge{
        border:0;background:transparent;color:var(--text,#222);cursor:pointer;
        font:inherit;font-weight:600;padding:4px;
      }
      .lsb-shell-edge:active{transform:scale(.97)}
      .lsb-shell-now{text-align:center;line-height:1.25}
      .lsb-shell-now strong{display:block;color:var(--text,#222);font-size:12px}
      .lsb-shell-track{
        flex:1;width:3px;padding:0;border:0;border-radius:99px;cursor:pointer;
        background:var(--line-soft,#e6e6e6);position:relative;min-height:64px;
      }
      .lsb-shell-thumb{
        position:absolute;left:50%;top:var(--lsb-timeline-progress,0%);
        width:8px;height:8px;margin:-4px 0 0 -4px;border-radius:50%;
        background:var(--brand,#5eaaa0);
      }
      html.lsb-skin-shell-on li.post-item{padding-block:8px!important;border-radius:var(--lsb-radius)}
      html.lsb-skin-shell-on li.post-item .post-title{
        font-weight:600;font-size:14px;letter-spacing:-.01em;line-height:1.3;
      }
      html.lsb-skin-shell-on li.post-item .post-meta{
        font-size:12px;font-weight:400;color:var(--text-muted,#888);
      }
      html.lsb-skin-shell-on li.post-item .post-avatar img{
        width:32px!important;height:32px!important;border-radius:50%;
      }
      html.lsb-skin-shell-on li.post-item:not(.post-entry) .meta-icon{display:none}
      html.lsb-skin-shell-on main.wrap{
        max-width:none!important;margin-left:0!important;margin-right:0!important;width:auto!important;
        padding-left:var(--lsb-shell-gutter)!important;
      }
      html.lsb-skin-shell-on .forum-layout.forum-layout-has-sidebar{gap:12px!important}
      html.lsb-skin-shell-on main.wrap,
      html.lsb-skin-shell-on .forum-main,
      html.lsb-skin-shell-on .home-shell{
        border-radius:var(--lsb-radius-lg);
      }
      html.lsb-skin-shell-on ul.post-list{
        border-radius:var(--lsb-radius-lg);
      }
      /* legacy 首页宽屏把纵向滚动交给中间面板，页面根和右栏保持固定。首页由 JS 明确标记，不能用 .home-shell 判断：首页和帖子页共用这个容器。 */
      @media(min-width:900px){
        html.lsb-skin-shell-on.lsb-skin-shell-home:not(.lsb-canvas-mode){
          box-sizing:border-box!important;height:100vh!important;max-height:100vh!important;overflow:hidden!important;
        }
        html.lsb-skin-shell-on.lsb-skin-shell-home:not(.lsb-canvas-mode) body{
          box-sizing:border-box!important;display:flex!important;flex-direction:column!important;
          height:calc(100vh - var(--lsb-shell-header))!important;
          max-height:calc(100vh - var(--lsb-shell-header))!important;
          min-height:0!important;margin:0!important;overflow:hidden!important;
        }
        html.lsb-skin-shell-on.lsb-skin-shell-home:not(.lsb-canvas-mode) body > main.wrap{
          box-sizing:border-box!important;display:flex!important;flex:1 1 auto!important;flex-direction:column!important;
          width:auto!important;max-width:none!important;margin-left:0!important;margin-right:0!important;padding-right:0!important;
          height:100%!important;max-height:100%!important;
          min-width:0!important;min-height:0!important;overflow:hidden!important;
        }
        html.lsb-skin-shell-on.lsb-skin-shell-home:not(.lsb-canvas-mode) body > main.wrap .home-shell,
        html.lsb-skin-shell-on.lsb-skin-shell-home:not(.lsb-canvas-mode) body > main.wrap .home-shell > .forum-layout.forum-layout-has-sidebar,
        html.lsb-skin-shell-on.lsb-skin-shell-home:not(.lsb-canvas-mode) body > main.wrap .home-shell > .forum-layout.forum-layout-has-sidebar > .forum-main{
          box-sizing:border-box!important;display:flex!important;flex:1 1 auto!important;flex-direction:column!important;
          width:100%!important;max-width:none!important;min-width:0!important;min-height:0!important;
        }
        html.lsb-skin-shell-on.lsb-skin-shell-home:not(.lsb-canvas-mode) body > main.wrap .home-shell{
          padding-right:0!important;
        }
        html.lsb-skin-shell-on.lsb-skin-shell-home:not(.lsb-canvas-mode) body > main.wrap .home-shell > .forum-layout.forum-layout-has-sidebar > .forum-main > .main-panel{
          box-sizing:border-box!important;display:flex!important;flex:1 1 auto!important;flex-direction:column!important;
          width:100%!important;max-width:none!important;min-width:0!important;min-height:0!important;
          overflow-y:auto!important;overflow-x:hidden!important;overscroll-behavior:contain;scrollbar-gutter:stable;
        }
      }
      html.lsb-skin-shell-on .post-content img,
      html.lsb-skin-shell-on .post-content video{
        border-radius:var(--lsb-radius-sm);
      }
      html.lsb-skin-shell-on .pagination a,
      html.lsb-skin-shell-on .pagination span,
      html.lsb-skin-shell-on .tab-link,
      html.lsb-skin-shell-on .sort-tabs a{
        border-radius:var(--lsb-radius-sm)!important;
      }
      html.lsb-skin-shell-on .pagination-bar.sb-infinite-scroll-pagination-hidden{
        display:none!important;
      }
      html.lsb-skin-shell-on form.ajax-reply-form,
      html.lsb-skin-shell-on .reply-box,
      html.lsb-skin-shell-on textarea{
        border-radius:var(--lsb-radius)!important;
      }
      @media(min-width:900px){
        html.lsb-skin-shell-on #lsb-shell{display:block}
        html.lsb-skin-shell-on{padding-top:var(--lsb-shell-header);padding-left:var(--lsb-shell-rail)}
        html.lsb-skin-shell-topic{padding-right:var(--lsb-shell-timeline)}
        html.lsb-skin-shell-on .lsb-native-header-hidden,
        html.lsb-skin-shell-on .forum-more-region{display:none!important}
        html.lsb-skin-shell-on .lsb-native-sidebar-hidden,
        html.lsb-skin-shell-on .lsb-native-left-hidden{display:none!important}
        html.lsb-skin-shell-on .forum-layout.forum-layout-has-sidebar{
          display:block!important;grid-template-columns:1fr!important;
        }
        html.lsb-skin-shell-on .lsb-launcher{display:none!important}
        html.lsb-skin-shell-user{padding-right:var(--lsb-shell-aside)}
        html.lsb-skin-shell-user #lsb-shell-aside{display:block}
        html.lsb-skin-shell-on .image-lightbox-overlay{
          top:var(--lsb-shell-header);left:var(--lsb-shell-rail);right:0;bottom:0;
        }
        html.lsb-skin-shell-topic .image-lightbox-overlay{right:var(--lsb-shell-timeline)}
        html.lsb-skin-shell-user .image-lightbox-overlay{right:var(--lsb-shell-aside)}
      }
      @media(min-width:1100px){
        html.lsb-skin-shell-on{padding-right:var(--lsb-shell-aside)}
        html.lsb-skin-shell-topic{padding-right:var(--lsb-shell-aside)}
        html.lsb-skin-shell-on #lsb-shell-aside{display:flex}
        html.lsb-skin-shell-on #lsb-shell-timeline{display:none!important}
        html.lsb-skin-shell-on .image-lightbox-overlay{right:var(--lsb-shell-aside)}
      }
      @media(hover:hover) and (pointer:fine){
        .lsb-shell-nav .lsb-shell-link:hover{background:color-mix(in srgb,var(--bg,#fff) 40%,transparent)}
        .lsb-shell-extras a:hover{color:var(--brand,#5eaaa0)}
        .lsb-shell-settings:hover{background:var(--brand-soft,#e8f4f2)}
      }
      @media(prefers-reduced-transparency:reduce){
        #lsb-shell-header{background:var(--panel,#fff);backdrop-filter:none;-webkit-backdrop-filter:none}
      }
      @media(prefers-reduced-motion:reduce){
        html.lsb-skin-shell-on #lsb-shell *{scroll-behavior:auto!important;transform:none!important}
        #lsb-shell-progress,
        #lsb-shell-progress [data-lsb-shell-progress-bar]{transition:none!important}
      }
      #lsb-shell-progress{
        --lsb-shell-progress:0;
        position:fixed;top:0;left:0;right:0;z-index:8002;height:3px;
        pointer-events:none;opacity:0;background:transparent;
        transition:opacity 120ms cubic-bezier(.23,1,.32,1);
      }
      #lsb-shell-progress[data-phase="loading"],
      #lsb-shell-progress[data-phase="done"]{opacity:1}
      #lsb-shell-progress [data-lsb-shell-progress-bar]{
        display:block;width:100%;height:100%;
        transform:scaleX(var(--lsb-shell-progress));transform-origin:left center;
        background:var(--brand,#5eaaa0);
        transition:transform 200ms cubic-bezier(.23,1,.32,1);
      }
      [data-lsb-route-content-enter]{animation:lsb-route-content-in 180ms ease both}
      @keyframes lsb-route-content-in{from{opacity:0;transform:translateY(5px)}to{opacity:1;transform:translateY(0)}}
      #lsb-route-announcer{
        position:absolute;width:1px;height:1px;padding:0;margin:-1px;overflow:hidden;
        clip-path:inset(50%);white-space:nowrap;border:0;
      }
      @media(prefers-reduced-motion:reduce){[data-lsb-route-content-enter]{animation:none!important;transform:none!important}}
      html.lsb-canvas-reduced-motion [data-lsb-route-content-enter]{animation:none!important;transform:none!important}
      /* H2 窗口工作区：默认令牌仍继承站点主题，几何由 skin 的 layout controller 写入。 */
      #lsb-shell[data-lsb-shell-mode="windowed"] #lsb-shell-workspace{
        position:fixed;top:var(--lsb-shell-header);left:0;right:0;bottom:0;
        overflow:hidden;pointer-events:none;
      }
      /* 窗口模式覆盖 700–899px 的媒体查询空档；窗口已挂载就必须可见。 */
      html.lsb-skin-shell-windowed #lsb-shell[data-lsb-shell-mode="windowed"]{display:block}
      html.lsb-skin-shell-windowed .lsb-native-header-hidden,
      html.lsb-skin-shell-windowed .lsb-native-sidebar-hidden,
      html.lsb-skin-shell-windowed .lsb-native-left-hidden,
      html.lsb-skin-shell-windowed .forum-more-region{display:none!important}
      #lsb-shell-workspace > [data-lsb-shell-video]{
        position:absolute;inset:0;width:100%;height:100%;object-fit:cover;
        z-index:0;pointer-events:none;opacity:0;transition:opacity 180ms ease;
      }
      html.lsb-skin-video-on #lsb-shell-workspace > [data-lsb-shell-video]{opacity:1}
      #lsb-shell-workspace > [data-lsb-shell-image]{
        position:absolute;inset:0;width:100%;height:100%;object-fit:cover;
        z-index:0;pointer-events:none;opacity:0;transition:opacity 180ms ease;
      }
      html.lsb-skin-image-on #lsb-shell-workspace > [data-lsb-shell-image]{opacity:1}
      #lsb-shell[data-lsb-shell-mode="windowed"] .lsb-shell-window{
        position:absolute;display:flex;flex-direction:column;min-width:0;min-height:0;
        box-sizing:border-box;overflow:hidden;pointer-events:auto;
        border:1px solid var(--line-soft,#e8e8e8);border-radius:var(--lsb-radius-lg);
        background:var(--panel,#fff);color:var(--text,#222);
        box-shadow:0 12px 30px color-mix(in srgb,var(--text,#222) 12%,transparent);
        z-index:1;
      }
      #lsb-shell[data-lsb-shell-mode="windowed"] .lsb-shell-window[data-lsb-shell-interacting="drag"]{
        will-change:transform;contain:layout paint;
      }
      #lsb-shell[data-lsb-shell-mode="windowed"] .lsb-shell-window[data-lsb-shell-interacting="resize"]{
        will-change:left,top,width,height;contain:layout paint;
      }
      #lsb-shell[data-lsb-shell-mode="windowed"] .lsb-shell-window[hidden]{display:none!important}
      #lsb-shell[data-lsb-shell-mode="windowed"] .lsb-shell-window[data-lsb-shell-external="true"][data-lsb-shell-open="false"]{display:none!important}
      #lsb-shell[data-lsb-shell-mode="windowed"] .lsb-shell-window-bar{
        display:flex;align-items:center;gap:6px;min-height:32px;flex:0 0 32px;
        padding:0 8px;border-bottom:1px solid var(--line-soft,#e8e8e8);
        background:color-mix(in srgb,var(--panel,#fff) 82%,transparent);
        color:var(--text,#222);user-select:none;touch-action:none;position:relative;z-index:5;
      }
      #lsb-shell[data-lsb-shell-mode="windowed"] .lsb-shell-window-title{
        min-width:0;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;
        font:600 12px/1 ${FONT_SANS};
      }
      #lsb-shell[data-lsb-shell-mode="windowed"] .lsb-shell-window-drag{
        flex:1;min-width:16px;height:100%;cursor:grab;
      }
      #lsb-shell[data-lsb-shell-mode="windowed"] .lsb-shell-window-drag:active{cursor:grabbing}
      #lsb-shell[data-lsb-shell-mode="windowed"] .lsb-shell-window-action{
        flex:0 0 28px;width:28px;height:28px;padding:0;border:0;border-radius:6px;
        background:transparent;color:var(--text-muted,#888);cursor:pointer;font:inherit;
      }
      #lsb-shell[data-lsb-shell-mode="windowed"] .lsb-shell-window-action:hover,
      #lsb-shell[data-lsb-shell-mode="windowed"] .lsb-shell-window-action:focus-visible{
        background:var(--brand-soft,#e8f4f2);color:var(--brand,#5eaaa0);outline:none;
      }
      #lsb-shell[data-lsb-shell-mode="windowed"] .lsb-shell-window:focus-visible{
        outline:2px solid var(--brand,#5eaaa0);outline-offset:2px;
      }
      #lsb-shell[data-lsb-shell-mode="windowed"] .lsb-shell-window-body{
        flex:1 1 auto;min-width:0;min-height:0;overflow:auto;overscroll-behavior:contain;
      }
      #lsb-shell[data-lsb-shell-mode="windowed"] #lsb-shell-rail > .lsb-shell-window-body,
      #lsb-shell[data-lsb-shell-mode="windowed"] #lsb-shell-aside > .lsb-shell-window-body{
        display:flex;flex-direction:column;
      }
      #lsb-shell[data-lsb-shell-mode="windowed"] #lsb-shell-rail,
      #lsb-shell[data-lsb-shell-mode="windowed"] #lsb-shell-aside,
      #lsb-shell[data-lsb-shell-mode="windowed"] #lsb-shell-window-content{
        top:0;right:auto;bottom:auto;left:auto;width:auto;height:auto;
        position:absolute;z-index:auto;
      }
      #lsb-shell[data-lsb-shell-mode="windowed"] #lsb-shell-rail{padding:0;border-right:0}
      #lsb-shell[data-lsb-shell-mode="windowed"] #lsb-shell-rail .lsb-shell-rail-scroll{padding-top:12px}
      #lsb-shell[data-lsb-shell-mode="windowed"] #lsb-shell-aside{display:flex;padding:0;border-left:0}
      #lsb-shell[data-lsb-shell-mode="windowed"] #lsb-shell-window-content main.wrap{
        width:auto!important;max-width:none!important;margin:0!important;padding:12px!important;
      }
      #lsb-shell[data-lsb-shell-mode="windowed"] .lsb-shell-window-content-body{
        flex:1 1 auto;min-width:0;min-height:0;overflow:auto;overscroll-behavior:contain;
      }
      #lsb-shell[data-lsb-shell-mode="windowed"] [data-lsb-shell-resize-edge]{
        position:absolute;z-index:4;touch-action:none;
      }
      #lsb-shell[data-lsb-shell-mode="windowed"] [data-lsb-shell-resize-edge="e"],
      #lsb-shell[data-lsb-shell-mode="windowed"] [data-lsb-shell-resize-edge="w"]{
        top:12px;bottom:12px;width:10px;cursor:ew-resize;
      }
      #lsb-shell[data-lsb-shell-mode="windowed"] [data-lsb-shell-resize-edge="e"]{right:-5px}
      #lsb-shell[data-lsb-shell-mode="windowed"] [data-lsb-shell-resize-edge="w"]{left:-5px}
      #lsb-shell[data-lsb-shell-mode="windowed"] [data-lsb-shell-resize-edge="s"],
      #lsb-shell[data-lsb-shell-mode="windowed"] [data-lsb-shell-resize-edge="n"]{
        left:12px;right:12px;height:10px;cursor:ns-resize;
      }
      #lsb-shell[data-lsb-shell-mode="windowed"] [data-lsb-shell-resize-edge="s"]{bottom:-5px}
      #lsb-shell[data-lsb-shell-mode="windowed"] [data-lsb-shell-resize-edge="n"]{top:-5px}
      #lsb-shell[data-lsb-shell-mode="windowed"] [data-lsb-shell-resize-edge="e"],
      #lsb-shell[data-lsb-shell-mode="windowed"] [data-lsb-shell-resize-edge="w"]{
        width:10px;top:12px;bottom:12px;
      }
      #lsb-shell[data-lsb-shell-mode="windowed"] [data-lsb-shell-resize-edge="e"]{right:-5px}
      #lsb-shell[data-lsb-shell-mode="windowed"] [data-lsb-shell-resize-edge="w"]{left:-5px}
      #lsb-shell[data-lsb-shell-mode="windowed"] [data-lsb-shell-resize-edge="s"],
      #lsb-shell[data-lsb-shell-mode="windowed"] [data-lsb-shell-resize-edge="n"]{
        height:10px;left:12px;right:12px;
      }
      #lsb-shell[data-lsb-shell-mode="windowed"] [data-lsb-shell-resize-edge="s"]{bottom:-5px}
      #lsb-shell[data-lsb-shell-mode="windowed"] [data-lsb-shell-resize-edge="n"]{top:32px}
      #lsb-shell[data-lsb-shell-mode="windowed"] [data-lsb-shell-resize-edge="ne"],
      #lsb-shell[data-lsb-shell-mode="windowed"] [data-lsb-shell-resize-edge="nw"],
      #lsb-shell[data-lsb-shell-mode="windowed"] [data-lsb-shell-resize-edge="se"],
      #lsb-shell[data-lsb-shell-mode="windowed"] [data-lsb-shell-resize-edge="sw"]{
        width:14px;height:14px;
      }
      #lsb-shell[data-lsb-shell-mode="windowed"] [data-lsb-shell-resize-edge="ne"]{right:-5px;top:32px;cursor:nesw-resize}
      #lsb-shell[data-lsb-shell-mode="windowed"] [data-lsb-shell-resize-edge="nw"]{left:-5px;top:32px;cursor:nwse-resize}
      #lsb-shell[data-lsb-shell-mode="windowed"] [data-lsb-shell-resize-edge="se"]{right:-5px;bottom:-5px;cursor:nwse-resize}
      #lsb-shell[data-lsb-shell-mode="windowed"] [data-lsb-shell-resize-edge="sw"]{left:-5px;bottom:-5px;cursor:nesw-resize}
      #lsb-shell[data-lsb-shell-mode="windowed"] .lsb-shell-window-switcher{display:none}
      @media(max-width:699px){
        html.lsb-skin-shell-on{padding:0!important;overflow:hidden}
        html.lsb-skin-shell-on body{overflow:hidden}
        html.lsb-skin-shell-on #lsb-shell{display:block}
        html.lsb-skin-shell-on .lsb-native-header-hidden,
        html.lsb-skin-shell-on .forum-more-region{display:none!important}
        html.lsb-skin-shell-on .lsb-native-sidebar-hidden,
        html.lsb-skin-shell-on .lsb-native-left-hidden{display:none!important}
        #lsb-shell[data-lsb-shell-mode="windowed"] #lsb-shell-workspace{top:var(--lsb-shell-header)}
        #lsb-shell[data-lsb-shell-mode="windowed"] .lsb-shell-window-switcher{
          display:flex;position:fixed;top:var(--lsb-shell-header);left:0;right:0;height:36px;
          z-index:8010;gap:4px;padding:4px;background:var(--panel,#fff);overflow:auto;
        }
        #lsb-shell[data-lsb-shell-mode="windowed"] .lsb-shell-window-switcher [role="tab"]{
          flex:1 0 auto;border:0;border-radius:6px;background:transparent;color:var(--text-muted,#888);
          padding:0 10px;font:600 12px ${FONT_SANS};
        }
        #lsb-shell[data-lsb-shell-mode="windowed"] .lsb-shell-window-switcher [aria-selected="true"]{
          background:var(--brand-soft,#e8f4f2);color:var(--brand,#5eaaa0);
        }
        #lsb-shell[data-lsb-shell-mode="windowed"] #lsb-shell-workspace{top:calc(var(--lsb-shell-header) + 44px)}
        #lsb-shell[data-lsb-shell-mode="windowed"] .lsb-shell-window:not([data-lsb-shell-active="true"]){display:none}
      }
      @media(prefers-reduced-motion:reduce){
        #lsb-shell[data-lsb-shell-mode="windowed"] .lsb-shell-window,
        #lsb-shell[data-lsb-shell-mode="windowed"] .lsb-shell-window *{transition:none!important;scroll-behavior:auto!important}
      }
      html.lsb-skin-shell-on{
        font-size:var(--lsb-shell-font-size,14px);
      }
      html.lsb-skin-shell-on #lsb-shell{
        font-family:var(--lsb-shell-font-family,${FONT_SANS});
      }
      html.lsb-skin-shell-on #lsb-shell-window-content,
      html.lsb-skin-shell-on #lsb-shell-rail,
      html.lsb-skin-shell-on #lsb-shell-aside{
        color:var(--lsb-shell-text,var(--text,#222));
      }
      html.lsb-skin-shell-on #lsb-shell[data-lsb-shell-mode="windowed"] .lsb-shell-window{
        background:var(--lsb-shell-panel,var(--panel,#fff));
      }
      html.lsb-skin-shell-on .lsb-shell-brand,
      html.lsb-skin-shell-on .lsb-shell-window-action{color:var(--lsb-shell-accent,var(--brand,#5eaaa0))}
      html.lsb-skin-glass-on #lsb-shell-header,
      html.lsb-skin-glass-on #lsb-shell[data-lsb-shell-mode="windowed"] .lsb-shell-window,
      html.lsb-skin-glass-on #lsb-shell[data-lsb-shell-mode="windowed"] .lsb-shell-window-bar{
        background:color-mix(in srgb,var(--lsb-shell-panel,var(--panel,#fff)) var(--lsb-shell-glass-opacity,.72),transparent);
        backdrop-filter:blur(var(--lsb-shell-glass-blur,18px));
        -webkit-backdrop-filter:blur(var(--lsb-shell-glass-blur,18px));
      }
      html.lsb-skin-shell-on #lsb-shell[data-lsb-shell-mode="windowed"] .lsb-shell-window[data-lsb-shell-glass="true"],
      html.lsb-skin-shell-on #lsb-shell[data-lsb-shell-mode="windowed"] .lsb-shell-window[data-lsb-shell-glass="true"] .lsb-shell-window-bar{
        background:color-mix(in srgb,var(--lsb-shell-panel,var(--panel,#fff)) var(--lsb-shell-glass-opacity,.72),transparent);
        backdrop-filter:blur(var(--lsb-shell-glass-blur,18px));
        -webkit-backdrop-filter:blur(var(--lsb-shell-glass-blur,18px));
      }
      @media(prefers-reduced-transparency:reduce){
        html.lsb-skin-glass-on #lsb-shell-header,
        html.lsb-skin-glass-on #lsb-shell[data-lsb-shell-mode="windowed"] .lsb-shell-window,
        html.lsb-skin-glass-on #lsb-shell[data-lsb-shell-mode="windowed"] .lsb-shell-window-bar{
          background:var(--lsb-shell-panel,var(--panel,#fff));backdrop-filter:none;-webkit-backdrop-filter:none;
        }
        html.lsb-skin-shell-on #lsb-shell[data-lsb-shell-mode="windowed"] .lsb-shell-window[data-lsb-shell-glass="true"],
        html.lsb-skin-shell-on #lsb-shell[data-lsb-shell-mode="windowed"] .lsb-shell-window[data-lsb-shell-glass="true"] .lsb-shell-window-bar{
          background:var(--lsb-shell-panel,var(--panel,#fff));backdrop-filter:none;-webkit-backdrop-filter:none;
        }
      }
    `
  }

  // · B2 canvasCss: iOS27 单画布（状态/浮层/响应式） ──
  function canvasCss() {
    return `
      html.lsb-skin-shell-on.lsb-canvas-mode{
        --lsb-canvas-safe-top:env(safe-area-inset-top,0px);
        --lsb-canvas-chrome-height:56px;
        --lsb-canvas-safe-bottom:env(safe-area-inset-bottom,0px);
        --lsb-canvas-surface-bg:color-mix(in srgb,var(--lsb-shell-panel,var(--panel,#fff)) calc(var(--lsb-shell-glass-opacity,.72) * 100%),transparent);
        --lsb-glass-fill:var(--lsb-canvas-surface-bg);
        --lsb-glass-border:color-mix(in srgb,var(--lsb-shell-text,var(--text,#222)) 18%,transparent);
        --lsb-glass-highlight:inset 0 1px 0 rgb(255 255 255 / 42%);
        --lsb-glass-shadow:0 14px 38px color-mix(in srgb,var(--lsb-shell-text,var(--text,#222)) 18%,transparent);
        --lsb-glass-blur:var(--lsb-shell-glass-blur,18px);
        --lsb-glass-saturation:140%;
        --lsb-canvas-content-bg:color-mix(in srgb,var(--lsb-shell-panel,var(--panel,#fff)) 94%,var(--bg,#f4f5f7));
        --lsb-canvas-media-scrim:rgb(8 12 22 / 18%);
        --lsb-canvas-radius:var(--lsb-shell-radius,16px);
        min-height:100%;padding:0!important;background:var(--bg,#f4f5f7);color:var(--lsb-shell-text,var(--text,#222));
        font-size:var(--lsb-shell-font-size,14px);
      }
      /* 让资料表面相对页面滚动而非被 body 的隐式滚动容器截断，sticky 才能跟随顶部状态条。 */
      html.lsb-skin-shell-on.lsb-canvas-mode body{min-height:100%;overflow-x:clip!important;overflow-y:visible!important;padding:0!important;isolation:isolate}
      html.lsb-skin-shell-on.lsb-canvas-mode #color-scheme-modal{z-index:8020!important}
      html.lsb-skin-shell-on.lsb-canvas-mode .lsb-shell-theme-modal{z-index:8020!important}
      html.lsb-skin-shell-on.lsb-canvas-mode body::before{content:'';position:fixed;inset:0;z-index:0;pointer-events:none;background:var(--lsb-canvas-media-scrim);opacity:0;transition:opacity 180ms ease}
      html.lsb-skin-shell-on.lsb-canvas-mode.lsb-skin-video-on body::before,
      html.lsb-skin-shell-on.lsb-canvas-mode.lsb-skin-image-on body::before{opacity:1}
      #lsb-shell-progress{
        --lsb-shell-progress:0;
        position:fixed;top:0;left:0;right:0;z-index:8002;height:3px;
        pointer-events:none;opacity:0;background:transparent;
        transition:opacity 120ms cubic-bezier(.23,1,.32,1)
      }
      #lsb-shell-progress[data-phase="loading"],#lsb-shell-progress[data-phase="done"]{opacity:1}
      #lsb-shell-progress [data-lsb-shell-progress-bar]{display:block;width:100%;height:100%;transform:scaleX(var(--lsb-shell-progress));transform-origin:left center;background:var(--brand,#5eaaa0);transition:transform 200ms cubic-bezier(.23,1,.32,1)}
      [data-lsb-route-content-enter]{animation:lsb-route-content-in 180ms ease both}
      @keyframes lsb-route-content-in{from{opacity:0;transform:translateY(5px)}to{opacity:1;transform:translateY(0)}}
      #lsb-route-announcer{position:absolute;width:1px;height:1px;padding:0;margin:-1px;overflow:hidden;clip-path:inset(50%);white-space:nowrap;border:0}
      @media(prefers-reduced-motion:reduce){[data-lsb-route-content-enter]{animation:none!important;transform:none!important}}
      html.lsb-canvas-reduced-motion [data-lsb-route-content-enter]{animation:none!important;transform:none!important}
      html.lsb-skin-shell-on.lsb-canvas-mode .lsb-canvas-content-root{position:relative;z-index:1;background:var(--lsb-canvas-content-bg);color:var(--lsb-shell-text,var(--text,#222))}
      html.lsb-skin-shell-on.lsb-canvas-mode main.wrap,
      html.lsb-skin-shell-on.lsb-canvas-mode .forum-main,
      html.lsb-skin-shell-on.lsb-canvas-mode .home-shell{
        box-sizing:border-box;display:block!important;width:auto!important;max-width:1120px!important;
        margin:0 auto!important;padding:calc(64px + var(--lsb-canvas-safe-top)) 24px calc(116px + var(--lsb-canvas-safe-bottom))!important;
      }
      html.lsb-skin-shell-on.lsb-canvas-mode .lsb-canvas-content-root{padding-top:0!important}
      html.lsb-skin-shell-on.lsb-canvas-mode .lsb-canvas-content-root .home-shell,html.lsb-skin-shell-on.lsb-canvas-mode .lsb-canvas-content-root .forum-main{padding-top:0!important}
      html.lsb-skin-shell-on.lsb-canvas-mode .lsb-canvas-content-root .main-panel{padding-top:0!important}
      html.lsb-skin-shell-on.lsb-canvas-mode:not(.lsb-canvas-page-home) .lsb-canvas-content-root{margin-top:calc(64px + var(--lsb-canvas-safe-top))!important}
      html.lsb-skin-shell-on.lsb-canvas-mode main.wrap,
      html.lsb-skin-shell-on.lsb-canvas-mode .forum-main,
      html.lsb-skin-shell-on.lsb-canvas-mode .home-shell,
      html.lsb-skin-shell-on.lsb-canvas-mode .main-panel{
        font-family:var(--lsb-shell-font-family,${FONT_SANS})!important;
        font-size:var(--lsb-shell-font-size,14px);
      }
      html.lsb-skin-shell-on.lsb-canvas-mode [data-canvas-profile-slot]{
        display:block;position:relative;margin:0 0 16px;padding:0;max-width:100%;
      }
      html.lsb-skin-shell-on.lsb-canvas-mode [data-canvas-profile-slot] > .sidebar-card.user-card{
        display:block!important;width:100%;margin:0;padding:12px 14px;border:1px solid color-mix(in srgb,var(--line,#ddd) 72%,transparent);
        border-radius:var(--lsb-canvas-radius);background:var(--lsb-canvas-surface-bg);backdrop-filter:blur(var(--lsb-shell-glass-blur,18px)) saturate(140%);
        box-shadow:0 8px 24px color-mix(in srgb,var(--text,#222) 10%,transparent);
      }
      [data-canvas-profile-slot] .user-header-info{gap:10px}
      [data-canvas-profile-slot] .user-avatar-big img,[data-canvas-profile-slot] .avatar-img{width:42px!important;height:42px!important}
      [data-canvas-profile-slot] .user-links{display:flex;gap:6px;flex-wrap:wrap;margin-top:10px}
      [data-canvas-profile-slot] .user-links a{display:inline-flex;align-items:center;gap:4px;padding:5px 8px;border-radius:999px;background:color-mix(in srgb,var(--panel,#fff) 42%,transparent);color:inherit;text-decoration:none;font-size:12px}
      [data-canvas-profile-slot] .btn-post{display:inline-flex;margin-top:10px}
      html.lsb-skin-shell-on.lsb-canvas-mode.lsb-canvas-page-user main.wrap{max-width:1120px!important;display:flex!important;flex-direction:column!important;gap:0!important}
      html.lsb-skin-shell-on.lsb-canvas-mode.lsb-canvas-page-user [data-lsb-canvas-profile],
      html.lsb-skin-shell-on.lsb-canvas-mode.lsb-canvas-page-user [data-lsb-canvas-list]{box-sizing:border-box;width:min(980px,100%)!important;max-width:980px!important;margin-left:auto!important;margin-right:auto!important;min-width:0}
      html.lsb-skin-shell-on.lsb-canvas-mode.lsb-canvas-page-user [data-lsb-canvas-profile]{
        position:sticky;top:calc(10px + var(--lsb-canvas-safe-top) + var(--lsb-canvas-chrome-height) + 6px);z-index:25;margin:0 auto!important;overflow:visible;
        width:fit-content!important;max-width:min(100%,760px)!important;
      }
      html.lsb-skin-shell-on.lsb-canvas-mode.lsb-canvas-page-user [data-lsb-canvas-profile] > .sidebar-card.user-card{
        display:block!important;width:fit-content!important;max-width:100%;margin:0;padding:12px 14px;border:1px solid color-mix(in srgb,var(--line,#ddd) 72%,transparent);
        border-radius:var(--lsb-canvas-radius);background:var(--lsb-canvas-surface-bg);backdrop-filter:blur(var(--lsb-shell-glass-blur,18px)) saturate(140%);
        box-shadow:0 8px 24px color-mix(in srgb,var(--text,#222) 10%,transparent);transition:none;
      }
      html.lsb-skin-shell-on.lsb-canvas-mode.lsb-canvas-page-user [data-lsb-canvas-list]{margin:12px auto 0!important;padding:12px!important;border:1px solid color-mix(in srgb,var(--line,#ddd) 72%,transparent);
        border-radius:var(--lsb-canvas-radius);background:var(--lsb-canvas-surface-bg);backdrop-filter:blur(var(--lsb-shell-glass-blur,18px)) saturate(140%);
        box-shadow:0 8px 24px color-mix(in srgb,var(--text,#222) 8%,transparent)}
      html.lsb-skin-shell-on.lsb-canvas-mode.lsb-canvas-page-user [data-lsb-canvas-list] > .home-shell,
      html.lsb-skin-shell-on.lsb-canvas-mode.lsb-canvas-page-user [data-lsb-canvas-list] > .forum-layout,
      html.lsb-skin-shell-on.lsb-canvas-mode.lsb-canvas-page-user [data-lsb-canvas-list] > .forum-main,
      html.lsb-skin-shell-on.lsb-canvas-mode.lsb-canvas-page-user [data-lsb-canvas-list] .forum-layout.forum-layout-has-sidebar,
      html.lsb-skin-shell-on.lsb-canvas-mode.lsb-canvas-page-user [data-lsb-canvas-list] .forum-main,
      html.lsb-skin-shell-on.lsb-canvas-mode.lsb-canvas-page-user [data-lsb-canvas-list] .main-panel{
        display:block!important;width:100%!important;max-width:none!important;margin:0!important;padding:0!important;background:transparent!important;
      }
      html.lsb-skin-shell-on.lsb-canvas-mode .forum-layout.forum-layout-has-sidebar{display:block!important;grid-template-columns:1fr!important}
      html.lsb-skin-shell-on.lsb-canvas-mode.lsb-canvas-page-home .home-shell,
      html.lsb-skin-shell-on.lsb-canvas-mode.lsb-canvas-page-home .forum-main{
        padding:0!important;
      }
      html.lsb-skin-shell-on.lsb-canvas-mode.lsb-canvas-page-home [data-canvas-profile-slot]{
        width:fit-content!important;max-width:min(100%,760px)!important;margin:0 auto 12px!important;
      }
      html.lsb-skin-shell-on.lsb-canvas-mode.lsb-canvas-page-home [data-canvas-profile-slot] > .sidebar-card.user-card{
        width:fit-content!important;max-width:100%;max-height:none!important;overflow:visible!important;
        padding:12px 14px;border-radius:var(--lsb-canvas-radius);
      }
      html.lsb-skin-shell-on.lsb-canvas-mode.lsb-canvas-page-home [data-canvas-profile-slot] .user-links{display:flex!important}
      html.lsb-skin-shell-on.lsb-canvas-mode.lsb-canvas-page-home [data-canvas-profile-slot] .btn-post{display:inline-flex!important}
      html.lsb-skin-shell-on.lsb-canvas-mode.lsb-canvas-page-home [data-canvas-profile-slot] .user-avatar-big img,
      html.lsb-skin-shell-on.lsb-canvas-mode.lsb-canvas-page-home [data-canvas-profile-slot] .avatar-img{width:36px!important;height:36px!important}
      html.lsb-skin-shell-on.lsb-canvas-mode.lsb-canvas-page-home .home-shell{
        background:transparent!important;border:0!important;box-shadow:none!important;border-radius:0!important;overflow:visible;
      }
      html.lsb-skin-shell-on.lsb-canvas-mode.lsb-canvas-page-home .main-panel{
        background:var(--lsb-canvas-surface-bg)!important;border:1px solid color-mix(in srgb,var(--line,#ddd) 72%,transparent);
        border-radius:var(--lsb-canvas-radius)!important;box-shadow:0 8px 24px color-mix(in srgb,var(--text,#222) 8%,transparent);
        overflow:hidden;
      }
      @media(min-width:700px){
        html.lsb-skin-shell-on.lsb-canvas-mode.lsb-canvas-page-home .lsb-canvas-content-root{
          display:flex!important;flex-direction:column!important;min-height:0!important;height:100vh!important;max-height:100vh!important;
          overflow:hidden!important;overscroll-behavior:none;
        }
        html.lsb-skin-shell-on.lsb-canvas-mode.lsb-canvas-page-home .lsb-canvas-content-root > .home-shell{
          display:flex!important;flex:1 1 auto;flex-direction:column;min-width:0;min-height:0;
        }
        html.lsb-skin-shell-on.lsb-canvas-mode.lsb-canvas-page-home .home-shell > .forum-layout.forum-layout-has-sidebar{
          display:flex!important;flex:1 1 auto;flex-direction:column;min-width:0;min-height:0;
        }
        html.lsb-skin-shell-on.lsb-canvas-mode.lsb-canvas-page-home .forum-layout.forum-layout-has-sidebar > .forum-main{
          display:flex!important;flex:1 1 auto;flex-direction:column;min-width:0;min-height:0;
        }
        html.lsb-skin-shell-on.lsb-canvas-mode.lsb-canvas-page-home .forum-main > .main-panel{
          display:flex!important;flex:1 1 auto;flex-direction:column;min-width:0;min-height:0;
          overflow-y:auto!important;overflow-x:hidden!important;overscroll-behavior:contain;scrollbar-gutter:stable;
        }
      }
      @media(max-width:699px){
        html.lsb-skin-shell-on.lsb-canvas-mode.lsb-canvas-page-home .lsb-canvas-content-root{
          height:auto!important;max-height:none!important;overflow:visible!important;
        }
        html.lsb-skin-shell-on.lsb-canvas-mode.lsb-canvas-page-home .main-panel{
          height:auto!important;max-height:none!important;overflow:visible!important;
        }
      }
      html.lsb-skin-shell-on.lsb-canvas-mode.lsb-canvas-page-home .topic-toolbar{
        min-height:44px;margin:0!important;padding:8px 12px!important;align-items:center;
      }
      html.lsb-skin-shell-on.lsb-canvas-mode .lsb-native-header-hidden,
      html.lsb-skin-shell-on.lsb-canvas-mode .lsb-native-sidebar-hidden,
      html.lsb-skin-shell-on.lsb-canvas-mode .lsb-native-left-hidden,
      html.lsb-skin-shell-on.lsb-canvas-mode .forum-more-region{display:none!important}
      html.lsb-canvas-route-pending body > .top,
      html.lsb-canvas-route-pending body > header,
      html.lsb-canvas-route-pending body > .site-header,
      html.lsb-canvas-route-pending body > [data-site-header],
      html.lsb-canvas-route-pending .forum-more-region,
      html.lsb-canvas-route-pending aside.sidebar:not(#mobile-menu-drawer):not(.mobile-menu-drawer),
      html.lsb-canvas-route-pending .forum-enhancements-left-fixed,
      html.lsb-canvas-route-pending #mobile-menu,
      html.lsb-canvas-route-pending .mobile-menu-backdrop,
      html.lsb-canvas-route-pending .lsb-launcher{display:none!important}
      html.lsb-skin-shell-on.lsb-canvas-mode aside.sidebar:not(#mobile-menu-drawer):not(.mobile-menu-drawer),
      html.lsb-skin-shell-on.lsb-canvas-mode .forum-enhancements-left-fixed{display:none!important}
      html.lsb-skin-shell-on.lsb-canvas-mode li.post-item:not(.post-entry) .meta-icon{display:none}
      html.lsb-skin-shell-on.lsb-canvas-mode li.post-item{padding-block:8px!important;border-radius:var(--lsb-canvas-radius)}
      html.lsb-skin-shell-on.lsb-canvas-mode li.post-entry{border-radius:var(--lsb-canvas-radius)}
      #lsb-shell[data-lsb-canvas-shell]{display:block;position:fixed;inset:0;z-index:7999;pointer-events:none;font-family:var(--lsb-shell-font-family,${FONT_SANS});color:var(--lsb-shell-text,var(--text,#222))}
      #lsb-shell[data-lsb-canvas-shell] *{box-sizing:border-box}
      #lsb-shell[data-lsb-canvas-shell] > [data-lsb-shell-video],#lsb-shell[data-lsb-canvas-shell] > [data-lsb-shell-image]{position:absolute;inset:0;width:100%;height:100%;object-fit:cover;z-index:0;pointer-events:none;opacity:0;transition:opacity 180ms ease}
      html.lsb-skin-video-on #lsb-shell[data-lsb-canvas-shell] > [data-lsb-shell-video]{opacity:1}
      html.lsb-skin-image-on #lsb-shell[data-lsb-canvas-shell] > [data-lsb-shell-image]{opacity:1}
      html.lsb-skin-shell-on.lsb-canvas-mode body > [data-lsb-shell-video][data-lsb-shell-video-layer="canvas"]{
        position:fixed;inset:0;width:100%;height:100%;box-sizing:border-box;object-fit:cover;
        z-index:0;pointer-events:none;opacity:0;transition:opacity 180ms ease;
      }
      html.lsb-skin-video-on.lsb-canvas-mode body > [data-lsb-shell-video][data-lsb-shell-video-layer="canvas"]{opacity:1}
      html.lsb-skin-shell-on.lsb-canvas-mode body > [data-lsb-shell-image][data-lsb-shell-image-layer="canvas"]{
        position:fixed;inset:0;width:100%;height:100%;box-sizing:border-box;object-fit:cover;
        z-index:0;pointer-events:none;opacity:0;transition:opacity 180ms ease;
      }
      html.lsb-skin-image-on.lsb-canvas-mode body > [data-lsb-shell-image][data-lsb-shell-image-layer="canvas"]{opacity:1}
      html.lsb-skin-shell-on .lsb-launcher{display:none!important}
      #lsb-shell-surfaces{position:absolute;inset:0;pointer-events:none;--lsb-canvas-chrome-height:56px}
      #lsb-shell-surfaces > [data-surface]{pointer-events:auto}
      #lsb-shell-surfaces [data-surface]{font:inherit;color:inherit}
      [data-canvas-profile-host]{
        position:fixed;top:calc(10px + var(--lsb-canvas-safe-top));left:max(12px,calc((100% - 1120px) / 2 + 24px));z-index:8004;
        display:flex;align-items:center;min-width:0;pointer-events:auto;color:inherit;
      }
      [data-canvas-profile-host][hidden]{display:none!important}
      [data-canvas-profile-host] > .sidebar-card.user-card{
        position:relative;display:block!important;box-sizing:border-box;width:190px;min-width:0;height:var(--lsb-canvas-chrome-height);max-height:var(--lsb-canvas-chrome-height);margin:0;padding:0 72px 0 10px;
        overflow:visible!important;border:1px solid var(--lsb-glass-border);border-radius:999px;background:var(--lsb-glass-fill);
        backdrop-filter:blur(var(--lsb-glass-blur)) saturate(var(--lsb-glass-saturation));-webkit-backdrop-filter:blur(var(--lsb-glass-blur)) saturate(var(--lsb-glass-saturation));
        box-shadow:var(--lsb-glass-highlight),var(--lsb-glass-shadow);transition:box-shadow 160ms ease;
      }
      [data-canvas-profile-host]:not([data-expanded="true"]) > .sidebar-card.user-card{overflow:hidden!important;}
      [data-canvas-profile-host]:not([data-expanded="true"]) .user-wrap{width:100%;height:100%;padding:0!important;margin:0!important;box-sizing:border-box}
      [data-canvas-profile-host]:not([data-expanded="true"]) .user-header{display:flex!important;align-items:center;min-height:100%;height:100%;margin:0!important;padding:0!important}
      [data-canvas-profile-host]:not([data-expanded="true"]) .user-header-info{display:flex!important;align-items:center;gap:6px;min-width:0;width:100%;height:100%;padding:0!important}
      [data-canvas-profile-host]:not([data-expanded="true"]) .user-avatar-big{display:flex!important;align-items:center;justify-content:center;flex:0 0 36px;width:36px!important;height:36px!important;min-width:36px}
      [data-canvas-profile-host]:not([data-expanded="true"]) .user-avatar-big img,[data-canvas-profile-host]:not([data-expanded="true"]) .avatar-img{display:block;width:36px!important;height:36px!important;min-width:36px;object-fit:cover}
      [data-canvas-profile-host]:not([data-expanded="true"]) .user-header-info > div{min-width:0;flex:0 1 auto;width:60px}
      [data-canvas-profile-host]:not([data-expanded="true"]) .user-name{display:block;max-width:60px;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;font-size:12px;font-weight:650;line-height:16px}
      [data-canvas-profile-host]:not([data-expanded="true"]) .user-rank,
      [data-canvas-profile-host]:not([data-expanded="true"]) .user-group,
      [data-canvas-profile-host]:not([data-expanded="true"]) .user-title{display:none!important}
      [data-canvas-profile-host]:not([data-expanded="true"]) .user-links{position:absolute;top:50%;right:42px;display:flex!important;align-items:center;gap:4px;margin:0!important;transform:translateY(-50%)}
      [data-canvas-profile-host] .user-links a[data-canvas-profile-bell]{position:relative;display:inline-flex!important;align-items:center;justify-content:center;width:27px;height:27px;padding:0;border-radius:999px;background:color-mix(in srgb,var(--panel,#fff) 42%,transparent);font-size:0;line-height:1;color:inherit}
      [data-canvas-profile-host] .user-links a[data-canvas-profile-bell] .meta-icon{width:16px;height:16px;margin:0}
      [data-canvas-profile-host] .user-links a[data-canvas-profile-bell]:hover,[data-canvas-profile-host] .user-links a[data-canvas-profile-bell]:focus-visible{background:var(--brand-soft,#e8f4f2);outline:none}
      [data-canvas-profile-host] .user-links a[data-canvas-profile-bell] .notify-badge{position:absolute;top:-2px;right:-2px;min-width:9px;height:9px;padding:0;border:2px solid var(--lsb-shell-panel,var(--panel,#fff));border-radius:50%;font-size:0;line-height:0;background:var(--danger,#e07a7a)}
      [data-canvas-profile-host]:not([data-expanded="true"]) .user-links a:not([data-canvas-profile-bell]),
      [data-canvas-profile-host]:not([data-expanded="true"]) .btn-post{display:none!important}
      [data-canvas-profile-host][data-expanded="true"]{align-items:flex-start}
      [data-canvas-profile-host][data-expanded="true"] > .sidebar-card.user-card{position:absolute;top:calc(100% + 8px);left:0;width:min(340px,calc(100vw - 24px));height:auto;max-height:none;padding:12px 14px;border-radius:var(--lsb-canvas-radius);box-shadow:var(--lsb-glass-highlight),0 18px 44px color-mix(in srgb,var(--lsb-shell-text,var(--text,#222)) 22%,transparent)}
      [data-canvas-profile-host][data-expanded="true"] .user-links{position:static;display:flex!important;gap:6px;flex-wrap:wrap;margin-top:10px!important}
      [data-canvas-profile-host][data-expanded="true"] .user-links a:not([data-canvas-profile-bell]){display:inline-flex!important}
      [data-canvas-profile-host][data-expanded="true"] .user-links a[data-canvas-profile-bell]{display:inline-flex!important;align-items:center;justify-content:center;width:auto!important;min-width:0;height:auto!important;min-height:27px;padding:5px 8px!important;gap:4px;font-size:12px!important;line-height:1.2;white-space:nowrap}
      [data-canvas-profile-host][data-expanded="true"] .user-links a[data-canvas-profile-bell] .meta-icon{flex:0 0 auto;width:14px;height:14px;margin:0}
      [data-canvas-profile-expand]{position:absolute;top:50%;right:4px;z-index:2;display:inline-flex;align-items:center;justify-content:center;width:28px;height:28px;padding:0;border:0;border-radius:999px;background:transparent;color:inherit;cursor:pointer;font:inherit;font-size:16px;line-height:1;transform:translateY(-50%)}
      [data-canvas-profile-expand]:hover,[data-canvas-profile-expand]:focus-visible{background:var(--brand-soft,#e8f4f2);outline:none}
      [data-canvas-profile-host][data-expanded="true"] [data-canvas-profile-expand]{background:var(--brand-soft,#e8f4f2)}
      @media(max-width:1099px){
        [data-canvas-profile-host]{top:calc(6px + var(--lsb-canvas-safe-top));left:8px;max-width:190px}
        [data-canvas-profile-host] > .sidebar-card.user-card{width:190px}
        #lsb-shell-surfaces [data-surface="top-status"]{left:210px;right:8px;transform:none;max-width:none}
        #lsb-shell-surfaces [data-surface="top-status"][data-compact="true"]{transform:translateY(-34px)}
        #lsb-shell-surfaces [data-surface="site-status"]{display:none!important}
      }
      @media(max-width:699px){
        [data-canvas-profile-host]{max-width:184px}
        [data-canvas-profile-host] > .sidebar-card.user-card{width:184px}
        [data-canvas-profile-host]:not([data-expanded="true"]) .user-header-info > div,
        [data-canvas-profile-host]:not([data-expanded="true"]) .user-name,
        [data-canvas-profile-host]:not([data-expanded="true"]) .user-rank{width:54px;max-width:54px}
        #lsb-shell-surfaces [data-surface="top-status"]{left:204px;max-width:calc(100vw - 16px);height:var(--lsb-canvas-chrome-height);min-height:var(--lsb-canvas-chrome-height)}
      }
      @media(min-width:1100px){
        #lsb-shell-surfaces [data-surface="top-status"]{width:min(620px,calc(100vw - 24px));max-width:min(620px,calc(100vw - 24px))}
        #lsb-shell-surfaces [data-surface="site-status"]{position:fixed;top:calc(10px + var(--lsb-canvas-safe-top));right:max(12px,calc((100vw - 1120px) / 2 + 12px));z-index:8000;display:flex;align-items:center;justify-content:flex-end;width:auto;height:var(--lsb-canvas-chrome-height);min-height:var(--lsb-canvas-chrome-height);padding:0;border:0;border-radius:0;background:transparent;backdrop-filter:none;-webkit-backdrop-filter:none;box-shadow:none;overflow:visible}
        #lsb-shell-surfaces [data-surface="site-status"][hidden]{display:none!important}
      }
      [data-canvas-backdrop]{position:fixed;inset:0;z-index:8009;background:rgb(5 8 18 / 52%);backdrop-filter:blur(4px);-webkit-backdrop-filter:blur(4px);pointer-events:auto}
      [data-canvas-backdrop][hidden]{display:none!important}
      [data-surface="top-status"]{
        position:fixed;top:calc(10px + var(--lsb-canvas-safe-top));left:50%;transform:translateX(-50%);z-index:8000;
        display:flex;align-items:center;gap:8px;height:var(--lsb-canvas-chrome-height);min-height:var(--lsb-canvas-chrome-height);max-width:min(840px,calc(100vw - 24px));padding:7px 10px;
        border:1px solid var(--lsb-glass-border);border-radius:999px;
        background:var(--lsb-glass-fill);backdrop-filter:blur(var(--lsb-glass-blur)) saturate(var(--lsb-glass-saturation));-webkit-backdrop-filter:blur(var(--lsb-glass-blur)) saturate(var(--lsb-glass-saturation));
        box-shadow:var(--lsb-glass-highlight),var(--lsb-glass-shadow);transition:opacity 160ms ease,transform 160ms ease;
      }
      [data-surface="top-status"][data-compact="true"]{opacity:.78;transform:translate(-50%,-34px)}
      [data-surface="top-status"] button,[data-surface="tool-capsule"] button,[data-surface="tool-sheet"] button{font:inherit}
      [data-surface="top-status"] [data-canvas-status-title]{flex:0 0 auto;min-width:0;max-width:46vw;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;font-weight:650}
      [data-route-transition="in"]{animation:lsb-route-title-in 180ms ease both}
      @keyframes lsb-route-title-in{from{opacity:.45;transform:translateY(2px)}to{opacity:1;transform:none}}
      [data-canvas-status-links]{display:flex;align-items:center;gap:5px;flex:1 1 auto;min-width:0;overflow-x:auto;overscroll-behavior-inline:contain;scrollbar-width:none}
      [data-canvas-status-links]::-webkit-scrollbar{display:none}
      [data-canvas-pinned-links]{display:flex;align-items:center;gap:5px;flex:0 0 auto;min-width:0}
      [data-canvas-status-links] a,[data-canvas-pinned-links] a,[data-canvas-pinned-links] [data-canvas-navigation-trigger]{display:inline-flex;align-items:center;flex:0 0 auto;min-height:30px;padding:0 8px;border:0;border-radius:999px;
        color:inherit;text-decoration:none;font:inherit;font-size:12px;font-weight:550;white-space:nowrap;background:color-mix(in srgb,var(--panel,#fff) 48%,transparent);cursor:pointer}
      [data-canvas-status-links] a:hover,[data-canvas-status-links] a:focus-visible,[data-canvas-pinned-links] a:hover,[data-canvas-pinned-links] a:focus-visible,[data-canvas-pinned-links] [data-canvas-navigation-trigger]:hover,[data-canvas-pinned-links] [data-canvas-navigation-trigger]:focus-visible{background:var(--brand-soft,#e8f4f2);outline:none}
      [data-canvas-search-host]{position:relative;display:flex;align-items:center;justify-content:center;flex:0 0 34px;width:34px;min-width:34px;max-width:34px;height:34px;margin-left:2px;overflow:visible}
      [data-canvas-search-host][hidden]{display:none!important}
      [data-canvas-search-trigger]{display:inline-flex;align-items:center;justify-content:center;flex:0 0 34px;width:34px;height:34px;padding:0;border:1px solid var(--lsb-glass-border);border-radius:50%;background:color-mix(in srgb,var(--panel,#fff) 42%,transparent);box-shadow:var(--lsb-glass-highlight);color:inherit;cursor:pointer}
      [data-canvas-search-trigger]:hover,[data-canvas-search-trigger]:focus-visible{background:var(--brand-soft,#e8f4f2);outline:none}
      [data-canvas-search-trigger] svg{display:block;width:17px;height:17px;stroke:currentColor;stroke-width:1.8;fill:none;stroke-linecap:round;stroke-linejoin:round}
      [data-canvas-search-panel]{position:absolute;top:calc(100% + 8px);right:0;z-index:8020;box-sizing:border-box;width:min(320px,calc(100vw - 24px));max-width:calc(100vw - 24px);padding:8px;border:1px solid var(--lsb-glass-border);border-radius:20px;background:var(--lsb-glass-fill);backdrop-filter:blur(var(--lsb-glass-blur)) saturate(var(--lsb-glass-saturation));-webkit-backdrop-filter:blur(var(--lsb-glass-blur)) saturate(var(--lsb-glass-saturation));box-shadow:var(--lsb-glass-highlight),var(--lsb-glass-shadow)}
      [data-canvas-search-panel][hidden]{display:none!important}
      [data-canvas-search-panel] .lsb-shell-search{display:flex!important;align-items:center;gap:4px;box-sizing:border-box;width:100%;min-width:0;max-width:none;height:34px;margin:0;padding:3px 5px 3px 9px;border:1px solid var(--lsb-glass-border);border-radius:999px;background:color-mix(in srgb,var(--panel,#fff) 42%,transparent);box-shadow:var(--lsb-glass-highlight);overflow:hidden}
      [data-canvas-search-panel] .lsb-shell-search input[type="search"],[data-canvas-search-panel] .lsb-shell-search input[name="q"]{box-sizing:border-box;flex:1 1 auto;width:100%;min-width:0;height:26px;margin:0;padding:0 5px;border:0;border-radius:999px;background:transparent;color:inherit;font:inherit;font-size:12px}
      [data-canvas-search-panel] .lsb-shell-search select{flex:0 1 auto;max-width:68px;min-width:0;height:26px;border:0;border-radius:999px;background:transparent;color:inherit;font:inherit;font-size:11px}
      [data-canvas-search-panel] .lsb-shell-search button{flex:0 0 auto;min-width:28px;height:26px;padding:0 7px;border:0;border-radius:999px;background:var(--brand-soft,#e8f4f2);color:var(--brand,#5eaaa0);font:inherit;font-size:11px;cursor:pointer}
      [data-canvas-search-panel] .lsb-shell-search.search-page-link{display:flex!important;align-items:center;justify-content:space-between;min-width:40px;padding:0 9px;color:inherit;text-decoration:none;font-size:12px}
      [data-canvas-site-status-host]{position:relative;isolation:isolate;display:flex;align-items:center;gap:2px;width:auto;height:100%;min-height:var(--lsb-canvas-chrome-height);padding:0 8px 0 14px;border:0;border-radius:999px;background:transparent;box-shadow:none;overflow:visible;z-index:1;cursor:pointer;color:inherit}
      [data-canvas-site-status-host]::before{content:'';position:absolute;inset:0;z-index:0;border:1px solid var(--lsb-glass-border);border-radius:inherit;background:var(--lsb-glass-fill);backdrop-filter:blur(var(--lsb-glass-blur)) saturate(var(--lsb-glass-saturation));-webkit-backdrop-filter:blur(var(--lsb-glass-blur)) saturate(var(--lsb-glass-saturation));box-shadow:var(--lsb-glass-highlight),var(--lsb-glass-shadow);pointer-events:none}
      [data-canvas-site-status-host][hidden]{display:none!important}
      [data-canvas-site-status-body]{display:flex;align-items:center;gap:6px;width:100%;height:100%;min-width:0;overflow:hidden;border:0;border-radius:999px;background:transparent;backdrop-filter:none;-webkit-backdrop-filter:none;box-shadow:none}
      [data-canvas-site-status-body] > .sidebar-card{display:block!important;flex:0 0 auto!important;width:100%;height:var(--lsb-canvas-chrome-height)!important;max-height:var(--lsb-canvas-chrome-height)!important;overflow:hidden!important;margin:0;padding:0 34px 0 10px;border:0;border-radius:999px;background:transparent;box-shadow:none}
      [data-canvas-site-status-body] > .sidebar-card .quick-wrap{height:100%;padding:0!important;margin:0!important;display:flex;align-items:center;min-width:0}
      [data-canvas-site-status-body] > .sidebar-card .quick-title,[data-canvas-site-status-body] > .sidebar-card .daily-hot-topics-head{display:block;min-width:0;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;font-size:12px;font-weight:650}
      [data-canvas-site-status-body] > .sidebar-card .quick-links,[data-canvas-site-status-body] > .sidebar-card .daily-hot-topics-list{display:none!important}
      [data-canvas-site-status-body] [data-canvas-site-empty-state]{display:block!important;margin:0;padding:0 10px;color:var(--text-muted,#888);font-size:11px;line-height:1.2;white-space:nowrap;overflow:hidden;text-overflow:ellipsis}
      [data-canvas-site-status-body] [data-canvas-site-empty-state][hidden]{display:none!important}
      [data-canvas-site-status-host]:not([data-expanded="true"]) [data-canvas-site-status-body]{display:none!important}
      [data-canvas-site-status-label]{position:relative;z-index:1;display:inline-flex;align-items:center;border:0;padding:0;background:transparent;color:inherit;font:inherit;font-size:12px;font-weight:550;line-height:1;white-space:nowrap;cursor:pointer}
      [data-canvas-site-status-expand]{position:relative;z-index:1;top:auto;right:auto;display:inline-flex;align-items:center;justify-content:center;width:22px;height:22px;padding:0;border:0;border-radius:999px;background:transparent;color:inherit;cursor:pointer;font:inherit;font-size:14px;line-height:1;transform:none}
      [data-canvas-site-status-expand]:hover,[data-canvas-site-status-expand]:focus-visible{background:var(--brand-soft,#e8f4f2);outline:none}
      [data-canvas-site-status-host][data-expanded="true"]{align-items:center}
      [data-canvas-site-status-host][data-expanded="true"] [data-canvas-site-status-body]{position:absolute;top:calc(100% + 8px);right:0;z-index:2;display:flex;flex-direction:column;align-items:stretch;gap:0;width:min(340px,calc(100vw - 24px));height:auto;max-height:calc(100vh - 90px);overflow:auto;padding:8px 14px;border:1px solid var(--lsb-glass-border);border-radius:34px;background:var(--lsb-glass-fill);backdrop-filter:blur(var(--lsb-glass-blur)) saturate(var(--lsb-glass-saturation));-webkit-backdrop-filter:blur(var(--lsb-glass-blur)) saturate(var(--lsb-glass-saturation));box-shadow:var(--lsb-glass-highlight),var(--lsb-glass-shadow)}
      [data-canvas-site-status-host][data-expanded="true"] [data-canvas-site-status-body] > .sidebar-card{height:auto!important;max-height:none!important;overflow:visible!important;margin:0!important;padding:10px 2px!important;border:0!important;border-radius:0!important;background:transparent!important;box-shadow:none!important}
      [data-canvas-site-status-host][data-expanded="true"] [data-canvas-site-status-body] > .sidebar-card + .sidebar-card{margin-top:0!important;border-top:1px solid color-mix(in srgb,var(--lsb-shell-text,var(--text,#222)) 12%,transparent)!important}
      [data-canvas-site-status-host][data-expanded="true"] [data-canvas-site-status-body] .quick-links,[data-canvas-site-status-host][data-expanded="true"] [data-canvas-site-status-body] .daily-hot-topics-list{display:block!important}
      [data-canvas-site-status-host][data-expanded="true"] [data-canvas-site-status-expand]{background:var(--brand-soft,#e8f4f2)}
      html.lsb-canvas-page-user #lsb-shell-surfaces [data-surface="top-status"] [data-canvas-status-title]{max-width:24vw}
      [data-canvas-action]{border:0;background:transparent;color:inherit;cursor:pointer;border-radius:999px;min-width:30px;min-height:30px;padding:0 8px}
      [data-canvas-action]:hover,[data-canvas-action]:focus-visible{background:color-mix(in srgb,var(--brand-soft,#e8f4f2) 80%,transparent);outline:none}
      [data-surface="tool-capsule"]{
        position:fixed;left:50%;bottom:calc(14px + var(--lsb-canvas-safe-bottom));transform:translateX(-50%);z-index:8001;
        display:flex;align-items:center;gap:4px;padding:6px;border:1px solid var(--lsb-glass-border);
        border-radius:999px;background:var(--lsb-glass-fill);backdrop-filter:blur(var(--lsb-glass-blur)) saturate(var(--lsb-glass-saturation));-webkit-backdrop-filter:blur(var(--lsb-glass-blur)) saturate(var(--lsb-glass-saturation));
        box-shadow:var(--lsb-glass-highlight),var(--lsb-glass-shadow)
      }
      [data-surface="tool-capsule"] button{min-width:38px;height:34px;border:0;border-radius:999px;background:transparent;color:inherit;cursor:pointer}
      [data-surface="tool-capsule"] button:hover,[data-surface="tool-capsule"] button:focus-visible{background:var(--brand-soft,#e8f4f2);outline:none}
      [data-surface="tool-sheet"], [data-surface="navigation-sheet"], [data-surface="site-card"], [data-surface="appearance-sheet"], [data-surface="ai-card"], [data-surface="plugin-features-sheet"], [data-surface="plugin-settings-sheet"]{
        position:fixed;left:50%;bottom:calc(70px + var(--lsb-canvas-safe-bottom));transform:translateX(-50%);z-index:8010;
        width:min(520px,calc(100vw - 24px));max-height:min(70vh,640px);overflow:auto;padding:18px;
        border:1px solid var(--lsb-glass-border);border-radius:var(--lsb-canvas-radius);
        background:var(--lsb-glass-fill);backdrop-filter:blur(var(--lsb-glass-blur)) saturate(var(--lsb-glass-saturation));-webkit-backdrop-filter:blur(var(--lsb-glass-blur)) saturate(var(--lsb-glass-saturation));
        box-shadow:var(--lsb-glass-highlight),var(--lsb-glass-shadow);opacity:1;transition:opacity 180ms ease,transform 180ms ease
      }
      [data-surface="tool-sheet"][hidden],[data-surface="navigation-sheet"][hidden],[data-surface="site-card"][hidden],[data-surface="appearance-sheet"][hidden],[data-surface="ai-card"][hidden],[data-surface="plugin-features-sheet"][hidden],[data-surface="plugin-settings-sheet"][hidden],[data-surface="context-pill"][hidden]{display:none!important}
      [data-surface="context-pill"]{
        position:fixed;display:flex;align-items:center;gap:3px;padding:4px;
        border:1px solid var(--lsb-glass-border);border-radius:999px;
        background:var(--lsb-glass-fill);backdrop-filter:blur(var(--lsb-glass-blur)) saturate(var(--lsb-glass-saturation));-webkit-backdrop-filter:blur(var(--lsb-glass-blur)) saturate(var(--lsb-glass-saturation));
        box-shadow:var(--lsb-glass-highlight),var(--lsb-glass-shadow);white-space:nowrap
      }
      [data-surface="context-pill"] button{min-height:30px;padding:0 10px;border:0;border-radius:999px;background:transparent;color:inherit;font:inherit;font-size:12px;cursor:pointer}
      [data-surface="context-pill"] button:hover,[data-surface="context-pill"] button:focus-visible{background:var(--brand-soft,#e8f4f2);outline:none}
      [data-surface="ai-card"][data-surface-mode="floating"]{left:auto;right:24px;bottom:88px;transform:none;width:420px;max-width:calc(100vw - 32px);height:560px;max-height:calc(100vh - 120px);resize:both;overflow:auto}
      [data-surface="site-card"][data-surface-mode="floating"],[data-surface="evidence-card"][data-surface-mode="floating"]{transform:none;right:auto;bottom:auto;max-width:calc(100vw - 32px);max-height:calc(100vh - 32px);height:auto}
      [data-surface="site-card"][data-surface-mode="rail"]{
        position:fixed;top:calc(72px + var(--lsb-canvas-safe-top));right:max(12px,calc((100vw - 1120px) / 2));bottom:calc(70px + var(--lsb-canvas-safe-bottom));left:auto;transform:none;
        width:min(320px,calc(30vw - 24px));max-width:calc(100vw - 32px);max-height:none;height:auto;overflow:auto;padding:16px;
        border-radius:20px;z-index:8005;
      }
      [data-surface="site-card"][data-surface-mode="rail"] [data-canvas-sheet-head]{cursor:default}
      [data-surface="site-card"][data-surface-mode="rail"] [data-canvas-resize-handle]{display:none!important}
      [data-surface="ai-card"]{display:flex;flex-direction:column;gap:10px}
      [data-surface="ai-card"] [data-canvas-ai-host]{min-height:0;flex:1;overflow:auto}
      [data-surface="ai-card"][data-surface-mode="sheet"]{bottom:calc(70px + var(--lsb-canvas-safe-bottom));width:min(520px,calc(100vw - 24px));max-height:min(70vh,640px)}
      [data-surface="ai-card"][data-surface-mode="fullscreen"]{left:8px;right:8px;bottom:calc(58px + var(--lsb-canvas-safe-bottom));transform:none;width:auto;max-height:calc(100vh - 82px);border-radius:22px}
      [data-surface="ai-card"][data-ai-workbench-mounted]{padding:0!important;gap:0}
      [data-surface="ai-card"][data-ai-workbench-mounted] > [data-canvas-sheet-head]{display:none!important}
      [data-surface][data-surface-mode="floating"] [data-canvas-sheet-head]{cursor:grab;user-select:none}
      [data-surface][data-surface-mode="floating"][data-canvas-dragging="true"]{will-change:transform;cursor:grabbing}
      [data-surface][data-surface-mode="floating"] [data-canvas-resize-handle]{position:absolute;right:3px;bottom:3px;width:16px;height:16px;cursor:nwse-resize;touch-action:none}
      [data-surface] [data-canvas-sheet-head]{position:relative;display:flex;align-items:center;justify-content:space-between;gap:12px;margin:-2px 0 12px;padding-top:8px}
      [data-canvas-sheet-grabber]{position:absolute;top:0;left:50%;width:34px;height:4px;transform:translateX(-50%);border-radius:999px;background:color-mix(in srgb,var(--lsb-shell-text,var(--text,#222)) 26%,transparent)}
      [data-surface][data-canvas-surface-state="opening"]{opacity:0;transform:translateX(-50%) translateY(8px) scale(.985)}
      [data-surface][data-canvas-surface-state="closing"]{opacity:0;pointer-events:none}
      [data-surface][data-surface-mode="floating"][data-canvas-surface-state="opening"]{transform:translateY(8px) scale(.985)}
      [data-surface="site-card"][data-surface-mode="rail"][data-canvas-surface-state="opening"]{transform:translateY(0) scale(1)}
      [data-surface][data-surface-mode="fullscreen"][data-canvas-surface-state="opening"]{transform:translateY(12px) scale(.99)}
      [data-surface] [data-canvas-sheet-head] h2{margin:0;font-size:16px;line-height:1.3}
      [data-surface] [data-canvas-close]{border:0;border-radius:999px;background:transparent;color:inherit;cursor:pointer;width:32px;height:32px;font-size:18px}
      [data-surface] [data-canvas-close]:hover,[data-surface] [data-canvas-close]:focus-visible{background:var(--brand-soft,#e8f4f2);outline:none}
      [data-surface="tool-sheet"] [data-tool-grid]{display:grid;grid-template-columns:repeat(2,minmax(0,1fr));gap:8px;margin-bottom:14px}
      [data-surface="tool-sheet"] [data-tool-action]{min-height:46px;padding:10px;border:1px solid var(--line-soft,#e8e8e8);border-radius:12px;background:color-mix(in srgb,var(--panel,#fff) 48%,transparent);color:inherit;text-align:left;cursor:pointer}
      [data-surface="tool-sheet"] [data-tool-action]:hover,[data-surface="tool-sheet"] [data-tool-action]:focus-visible{border-color:var(--brand,#5eaaa0);outline:none}
      [data-surface="tool-sheet"] [data-canvas-query]{display:flex;gap:8px;align-items:flex-end}
      [data-surface="tool-sheet"] textarea{flex:1;min-height:70px;resize:vertical;border:1px solid var(--line,#ddd);border-radius:12px;padding:9px;background:color-mix(in srgb,var(--panel,#fff) 64%,transparent);color:inherit;font:inherit}
      [data-surface="tool-sheet"] [data-canvas-send]{min-height:38px;border:0;border-radius:999px;padding:0 16px;background:var(--brand,#5eaaa0);color:#fff;cursor:pointer}
      [data-surface="plugin-features-sheet"] [data-plugin-feature-list],[data-surface="plugin-settings-sheet"] [data-plugin-settings-list]{display:grid;gap:7px;margin:8px 0 14px}
      [data-surface="plugin-features-sheet"] [data-plugin-feature-list] .lsb-empty,[data-surface="plugin-settings-sheet"] [data-plugin-settings-list] .lsb-empty{margin:0;padding:10px;border-radius:10px;background:color-mix(in srgb,var(--panel,#fff) 42%,transparent)}
      .lsb-plugin-entry{display:flex;align-items:center;gap:6px;min-width:0;padding:4px;border:1px solid var(--line-soft,#e8e8e8);border-radius:12px;background:color-mix(in srgb,var(--panel,#fff) 42%,transparent)}
      .lsb-plugin-entry-main,.lsb-plugin-entry-settings,.lsb-plugin-settings-entry,[data-plugin-settings-directory],[data-plugin-settings-back]{min-height:38px;border:0;border-radius:9px;background:transparent;color:inherit;font:inherit;cursor:pointer}
      .lsb-plugin-entry-main{flex:1;min-width:0;padding:7px 10px;text-align:left}
      .lsb-plugin-entry-settings{flex:0 0 38px;padding:0;font-size:17px}
      .lsb-plugin-settings-entry{display:flex;align-items:center;justify-content:space-between;gap:10px;width:100%;padding:8px 10px;border:1px solid var(--line-soft,#e8e8e8);text-align:left}
      .lsb-plugin-settings-entry small{color:var(--text-muted,#888);font-size:11px}
      [data-plugin-settings-directory]{padding:7px 12px;border:1px solid var(--line,#ddd);background:color-mix(in srgb,var(--panel,#fff) 48%,transparent)}
      [data-plugin-settings-back]{margin:-4px 0 8px;padding:4px 9px;color:var(--text-muted,#888)}
      .lsb-plugin-entry button:hover,.lsb-plugin-settings-entry:hover,[data-plugin-settings-directory]:hover,[data-plugin-settings-back]:hover{background:var(--brand-soft,#e8f4f2);color:var(--brand,#5eaaa0)}
      [data-surface="plugin-features-sheet"] h3,[data-surface="plugin-settings-sheet"] h3{margin:10px 0 6px;font-size:13px}
      [data-surface="site-card"] [data-canvas-site-sidebar]{display:flex;flex-direction:column;gap:10px;margin-top:14px;max-height:none!important;overflow:visible!important;padding-right:2px}
      [data-surface="site-card"] [data-canvas-site-sidebar]:empty::before{content:'当前页面没有可用的站点侧栏信息';display:block;padding:12px;border-radius:12px;color:var(--text-muted,#888);background:color-mix(in srgb,var(--panel,#fff) 38%,transparent);font-size:12px}
      [data-surface="site-card"] [data-canvas-site-empty-state]{display:block;margin:14px 0 0;padding:12px;border-radius:12px;color:var(--text-muted,#888);background:color-mix(in srgb,var(--panel,#fff) 38%,transparent);font-size:12px}
      [data-surface="site-card"] [data-canvas-site-empty-state][hidden]{display:none!important}
      [data-surface="site-card"] [data-canvas-site-sidebar] > .sidebar-card{display:block!important;flex:0 0 auto!important;width:100%;height:auto!important;max-height:none!important;overflow:visible!important;margin:0;padding:12px;border:1px solid color-mix(in srgb,var(--line,#ddd) 62%,transparent);border-radius:14px;background:color-mix(in srgb,var(--panel,#fff) 42%,transparent);box-shadow:none}
      [data-surface="site-card"] [data-canvas-site-sidebar] .quick-links{max-height:none!important;overflow:visible!important}
      [data-surface="site-card"]{height:auto;max-height:calc(100vh - 32px)}
      [data-surface="site-card"][data-surface-mode="sheet"],[data-surface="site-card"][data-surface-mode="fullscreen"]{height:auto;max-height:calc(100vh - 82px)}
      [data-surface="appearance-sheet"] [data-canvas-appearance-controls]{display:grid;grid-template-columns:repeat(2,minmax(0,1fr));gap:10px;margin-top:14px}
      [data-surface="appearance-sheet"] [data-canvas-background-modes]{display:flex;align-items:center;gap:7px;flex-wrap:wrap;margin-top:14px}
      [data-surface="appearance-sheet"] [data-canvas-background-modes] strong{font-size:12px;color:var(--text-muted,#888);font-weight:600;margin-right:2px}
      [data-surface="appearance-sheet"] [data-canvas-background-modes] button{min-height:32px;padding:5px 10px;border:1px solid var(--line,#ddd);border-radius:999px;background:transparent;color:inherit;cursor:pointer;font:inherit;font-size:12px}
      [data-surface="appearance-sheet"] [data-canvas-background-modes] button[aria-pressed="true"]{border-color:var(--lsb-shell-accent,var(--brand,#5eaaa0));background:var(--brand-soft,#e8f4f2);color:var(--lsb-shell-accent,var(--brand,#5eaaa0));font-weight:600}
      [data-surface="appearance-sheet"] [data-canvas-appearance-controls] label{display:flex;flex-direction:column;gap:5px;font-size:12px;color:var(--text-muted,#888)}
      [data-surface="appearance-sheet"] [data-canvas-appearance-controls] input{width:100%;min-width:0;border:1px solid var(--line,#ddd);border-radius:9px;padding:6px;background:color-mix(in srgb,var(--panel,#fff) 70%,transparent);color:inherit;font:inherit}
      [data-surface="appearance-sheet"] [data-canvas-appearance-controls] input[type="range"]{padding:0}
      [data-surface="appearance-sheet"] [data-canvas-appearance-actions]{display:flex;gap:8px;flex-wrap:wrap;margin-top:14px}
      [data-surface="appearance-sheet"] [data-canvas-appearance-actions] button{border:1px solid var(--line,#ddd);border-radius:999px;padding:7px 11px;background:transparent;color:inherit;cursor:pointer}
      [data-surface="top-status"] button:focus-visible,[data-surface="tool-capsule"] button:focus-visible,[data-surface="tool-sheet"] button:focus-visible,[data-surface="navigation-sheet"] a:focus-visible{outline:2px solid var(--brand,#5eaaa0);outline-offset:2px}
      html.lsb-skin-shell-on.lsb-canvas-mode.lsb-skin-glass-on #lsb-shell-surfaces [data-surface]{background:var(--lsb-canvas-surface-bg)}
      html.lsb-skin-shell-on.lsb-canvas-mode.lsb-skin-glass-on #lsb-shell-surfaces [data-surface="site-status"]{background:transparent;border:0;border-radius:0;box-shadow:none;overflow:visible}
      @media(max-width:699px){
        html.lsb-skin-shell-on.lsb-canvas-mode main.wrap,html.lsb-skin-shell-on.lsb-canvas-mode .forum-main,html.lsb-skin-shell-on.lsb-canvas-mode .home-shell{padding-inline:14px!important}
        [data-surface="top-status"]{max-width:calc(100vw - 16px);top:calc(6px + var(--lsb-canvas-safe-top));height:var(--lsb-canvas-chrome-height);min-height:var(--lsb-canvas-chrome-height)}
        [data-surface="top-status"] [data-canvas-status-title]{max-width:42vw}
        html.lsb-canvas-page-user #lsb-shell-surfaces [data-surface="top-status"]{width:calc(100vw - 16px);gap:4px;padding:5px 6px}
        html.lsb-canvas-page-user #lsb-shell-surfaces [data-surface="top-status"] [data-canvas-status-title]{max-width:20vw}
        #lsb-shell-surfaces [data-surface="site-status"]{display:none!important}
        html.lsb-skin-shell-on.lsb-canvas-mode.lsb-canvas-page-user [data-lsb-canvas-profile]{position:sticky!important;top:calc(6px + var(--lsb-canvas-safe-top) + var(--lsb-canvas-chrome-height))!important;z-index:25!important}
        html.lsb-skin-shell-on.lsb-canvas-mode.lsb-canvas-page-user [data-lsb-canvas-list]{padding:8px!important}
        [data-surface="tool-sheet"],[data-surface="navigation-sheet"],[data-surface="site-card"],[data-surface="appearance-sheet"],[data-surface="ai-card"],[data-surface="plugin-features-sheet"],[data-surface="plugin-settings-sheet"]{left:8px;right:8px;bottom:calc(58px + var(--lsb-canvas-safe-bottom));transform:none;width:auto;max-height:calc(100vh - 82px);border-radius:22px}
        [data-surface="tool-capsule"]{bottom:calc(8px + var(--lsb-canvas-safe-bottom));max-width:calc(100vw - 16px)}
        [data-surface="site-card"][data-surface-mode="rail"]{top:calc(6px + var(--lsb-canvas-safe-top) + var(--lsb-canvas-chrome-height));right:8px;bottom:calc(58px + var(--lsb-canvas-safe-bottom));left:8px;width:auto;max-width:none;max-height:calc(100vh - 82px);border-radius:22px}
        [data-surface="appearance-sheet"] [data-canvas-appearance-controls]{grid-template-columns:1fr!important}
        [data-surface="appearance-sheet"] [data-canvas-appearance-actions]{flex-direction:column!important;align-items:stretch!important}
        [data-surface="appearance-sheet"] [data-canvas-appearance-actions] button{min-height:40px}
      }
      @media(prefers-reduced-transparency:reduce){
        #lsb-shell-surfaces [data-surface]{background:var(--lsb-shell-panel,var(--panel,#fff));backdrop-filter:none;-webkit-backdrop-filter:none;box-shadow:0 8px 24px rgb(0 0 0 / 12%)}
        [data-canvas-site-status-host]::before,[data-canvas-site-status-host][data-expanded="true"] [data-canvas-site-status-body]{background:var(--lsb-shell-panel,var(--panel,#fff));backdrop-filter:none;-webkit-backdrop-filter:none}
        html.lsb-skin-shell-on.lsb-canvas-mode{--lsb-glass-fill:var(--lsb-shell-panel,var(--panel,#fff));--lsb-canvas-media-scrim:rgb(8 12 22 / 26%)}
      }
      @media(prefers-reduced-motion:reduce){
        #lsb-shell-surfaces [data-surface],#lsb-shell-progress,html.lsb-skin-shell-on.lsb-canvas-mode body::before{transition:none!important;scroll-behavior:auto!important}
        #lsb-shell-progress [data-lsb-shell-progress-bar]{transition:none!important}
        [data-route-transition="in"]{animation:none!important}
        [data-surface][data-canvas-surface-state="opening"],[data-surface][data-canvas-surface-state="closing"]{transform:none!important}
      }
      @media(prefers-reduced-motion:reduce){html.lsb-canvas-page-user [data-lsb-canvas-profile] > .sidebar-card.user-card{transition:none!important}}
      html.lsb-canvas-reduced-transparency #lsb-shell-surfaces [data-surface]{background:var(--lsb-shell-panel,var(--panel,#fff));backdrop-filter:none;-webkit-backdrop-filter:none;box-shadow:0 8px 24px rgb(0 0 0 / 12%)}
      html.lsb-canvas-reduced-transparency [data-canvas-site-status-host]::before,html.lsb-canvas-reduced-transparency [data-canvas-site-status-host][data-expanded="true"] [data-canvas-site-status-body]{background:var(--lsb-shell-panel,var(--panel,#fff));backdrop-filter:none;-webkit-backdrop-filter:none}
      html.lsb-canvas-reduced-motion #lsb-shell-surfaces [data-surface],html.lsb-canvas-reduced-motion #lsb-shell-progress{transition:none!important;scroll-behavior:auto!important}
      html.lsb-canvas-reduced-motion #lsb-shell-progress [data-lsb-shell-progress-bar]{transition:none!important}
      html.lsb-canvas-reduced-motion [data-route-transition="in"]{animation:none!important}
      html.lsb-canvas-reduced-motion [data-surface][data-canvas-surface-state="opening"],html.lsb-canvas-reduced-motion [data-surface][data-canvas-surface-state="closing"]{transform:none!important}
    `
  }

  // · B3 css: 全局正文排版/列表密度/代码块/楼层 ──
  function skinCss(cfg = {}, { shellActive = false, uiMode = 'legacy' } = {}) {
    const parts = []

    if (shellActive) {
      parts.push(uiMode === 'ios27' ? canvasCss() : shellCss())
    }

    if (cfg.typography) {
      parts.push(`
        html.lsb-skin-type-on .post-content{font-family:${FONT_SANS};line-height:1.75;word-break:break-word}
        html.lsb-skin-type-on .post-content p{margin-block:.85em}
        html.lsb-skin-type-on .post-title{line-height:1.45}
      `)
    }

    if (cfg.density === '紧凑') {
      parts.push(`
        html.lsb-skin-density-compact ul.post-list li.post-item{padding-block:3px!important}
        html.lsb-skin-density-compact li.post-item .post-avatar img{width:32px!important;height:32px!important}
      `)
    }

    if (cfg.codeblock) {
      parts.push(`
        html.lsb-skin-code-on .post-content pre{
          background:var(--bg,#f6f8fa)!important;border:1px solid var(--line,#ddd)!important;
          border-radius:8px!important;padding:12px 14px!important;overflow-x:auto!important;
          font-family:${FONT_MONO}!important;font-size:13px!important;line-height:1.55!important;
        }
        html.lsb-skin-code-on .post-content code{font-family:${FONT_MONO}}
        html.lsb-skin-code-on .post-content :not(pre)>code{
          background:var(--line-soft,#eceff2);border-radius:4px;padding:1px 5px;font-size:.92em;
        }
      `)
    }

    if (cfg.floors) {
      parts.push(`
        html.lsb-skin-floors-on li.post-entry{border-bottom:1px solid var(--line-soft,#eee)}
      `)
    }

    if (cfg.measure) {
      parts.push(`
        @media(min-width:1280px){
          html.lsb-skin-measure-on main.wrap{max-width:1120px!important;margin-inline:auto!important}
          html.lsb-skin-measure-on .post-content>p{max-width:74ch}
        }
      `)
    }

    return parts.join('\n')
  }
  /** Owns one skin instance's media resources; reset is reusable, dispose is final. */
  function createSkinMediaController({ window, document, media, style, getContext, toast }) {
    const root = document.documentElement
    const fontProperty = '--lsb-shell-font-family'
    const revisions = new Map()
    let disposed = false
    let epoch = 0
    let database = null
    let background = null
    let font = null

    function abortError() {
      const error = new Error('media-operation-cancelled')
      error.name = 'AbortError'
      return error
    }

    function assertCurrent(start) {
      if (disposed || start !== epoch) throw abortError()
    }

    function closeDatabase(record) {
      if (!record?.db) return
      try { record.db.close?.() } catch { /* already closed */ }
      record.db = null
    }

    function ensureDatabase() {
      if (!media?.openMediaDb) return Promise.resolve(null)
      if (!database) {
        const record = { db: null, promise: null }
        database = record
        record.promise = Promise.resolve().then(() => media.openMediaDb(window.indexedDB, 'lsb_skin_media')).then((db) => {
          record.db = db
          if (disposed || database !== record) {
            closeDatabase(record)
            throw abortError()
          }
          return db
        }).catch((error) => {
          if (error?.name === 'AbortError') throw error
          if (database === record) database = null
          return null
        })
      }
      return database.promise
    }

    async function loadLocal(kind, key) {
      if (!key || !media?.readMedia) return null
      const start = epoch
      try {
        const db = await ensureDatabase()
        assertCurrent(start)
        if (!db) return null
        const file = await media.readMedia({ db, kind, key })
        assertCurrent(start)
        return file && (!media.validateMediaFile || media.validateMediaFile(file, { kind }).ok) ? file : null
      } catch { return null }
    }

    async function saveFile(kind, file) {
      const start = epoch
      assertCurrent(start)
      const check = media?.validateMediaFile?.(file, { kind })
      if (!check?.ok) throw new Error(check?.reason || 'media-validation-unavailable')
      try {
        const db = await ensureDatabase()
        assertCurrent(start)
        if (!db || !media?.writeMedia) throw new Error('media-store-unavailable')
        const key = `${window.location.origin}:${kind}`
        await media.writeMedia({ db, kind, key, value: file })
        assertCurrent(start)
        const revisionKey = `${kind}:${key}`
        revisions.set(revisionKey, (revisions.get(revisionKey) || 0) + 1)
        return key
      } catch (error) {
        assertCurrent(start)
        throw error
      }
    }

    function releaseBackground(record) {
      if (!record) return
      const node = record.node
      if (node) {
        node.removeEventListener('error', record.onError)
        if (record.mode === 'video') {
          try { node.pause?.() } catch { /* unavailable media element */ }
        }
        node.removeAttribute('src')
        if (record.mode === 'video') {
          try { node.load?.() } catch { /* release the decoder when available */ }
        }
        node.remove()
        record.node = null
      }
      if (record.url) {
        try { window.URL.revokeObjectURL(record.url) } catch { /* ignore */ }
        record.url = ''
      }
    }

    function releaseFont(record) {
      record?.face?.dispose?.()
      if (record) record.face = null
    }

    function applyFont(record) {
      const family = record?.face ? 'LSBShellUserFont' : record?.fallback
      if (family) root.style.setProperty(fontProperty, family)
      else root.style.removeProperty(fontProperty)
    }

    function syncBackground({ config, appearance, workspace, canvasMode }) {
      const requested = String(appearance.background || '').toLowerCase()
      const mode = requested === 'video' || (requested !== 'image' && config.backgroundVideoEnabled === true)
        ? 'video' : requested === 'image' ? 'image' : 'static'
      const enabled = !!config.shell && workspace instanceof window.Element
      const field = mode === 'image' ? 'backgroundImage' : 'backgroundVideo'
      const remote = String(appearance[`${field}Url`] || config[`${field}Url`] || '').trim()
      const localKey = String(appearance[`${field}LocalKey`] || config[`${field}LocalKey`] || '').trim()
      const validRemote = !!media?.isHttpsUrl?.(remote)
      const reduced = appearance.motion === 'reduced' || !!window.matchMedia?.('(prefers-reduced-motion: reduce)')?.matches
      const key = JSON.stringify([enabled, mode, canvasMode, reduced, validRemote ? remote : '', localKey, revisions.get(`${mode}:${localKey}`) || 0])
      if (background?.key === key && background.workspace === workspace &&
        (background.pending || background.node || !enabled || mode === 'static')) return background.promise
      const previous = background
      const record = { key, workspace, mode, node: null, url: '', onError: null, promise: null, pending: true }
      background = record
      releaseBackground(previous)
      root.classList.remove('lsb-skin-video-on', 'lsb-skin-image-on')
      record.promise = (async () => {
        if (!enabled || mode === 'static') return
        let source = ''
        if (localKey) {
          const file = await loadLocal(mode, localKey)
          if (background !== record) return
          if (file) {
            try { source = record.url = window.URL.createObjectURL(file) } catch { /* use HTTPS fallback */ }
          }
        }
        if (!source && validRemote) source = remote
        if (background !== record || !source) return
        const node = document.createElement(mode === 'image' ? 'img' : 'video')
        record.node = node
        node.setAttribute(`data-lsb-shell-${mode}`, '')
        node.setAttribute(`data-lsb-shell-${mode}-layer`, canvasMode ? 'canvas' : 'windowed')
        node.setAttribute('aria-hidden', 'true')
        const current = () => background === record && record.node === node
        if (mode === 'image') {
          node.alt = ''
          node.decoding = 'async'
          node.loading = 'eager'
          record.onError = () => {
            if (!current() || node.dataset.lsbShellImageState === 'error') return
            root.classList.remove('lsb-skin-image-on')
            node.dataset.lsbShellImageState = 'error'
            toast?.('静态背景加载失败，已使用原始背景', { type: 'error' })
          }
          node.addEventListener('error', record.onError)
          workspace.prepend(node)
          node.src = source
          if (current() && node.dataset.lsbShellImageState !== 'error') {
            root.classList.add('lsb-skin-image-on')
            node.dataset.lsbShellImageState = 'loaded'
          }
          return
        }

        for (const attr of ['muted', 'autoplay', 'loop', 'playsinline']) node.setAttribute(attr, '')
        node.defaultMuted = true
        node.muted = true
        node.loop = true
        node.autoplay = true
        node.playsInline = true
        node.preload = 'auto'
        record.onError = () => {
          if (!current() || node.dataset.lsbShellVideoState === 'error') return
          root.classList.remove('lsb-skin-video-on')
          node.controls = false
          node.style.pointerEvents = 'none'
          node.dataset.lsbShellVideoState = 'error'
          toast?.('视频背景加载失败，已使用静态背景', { type: 'error' })
        }
        node.addEventListener('error', record.onError)
        workspace.prepend(node)
        node.src = source
        try { node.load?.() } catch { /* older media elements may not expose load */ }
        const markPlayback = (state, message) => {
          if (!current() || node.dataset.lsbShellVideoState === 'error' || node.error) return
          root.classList.add('lsb-skin-video-on')
          node.controls = false
          node.style.pointerEvents = 'none'
          node.dataset.lsbShellVideoState = state
          if (message) toast?.(message, { type: 'info' })
        }
        if (reduced) {
          markPlayback('manual', '视频已暂停以减少动态')
          return
        }
        try {
          await node.play()
          markPlayback('playing')
        } catch {
          markPlayback('manual', '浏览器阻止自动播放，视频背景保持静止')
        }
      })().finally(() => { record.pending = false })
      return record.promise
    }

    function syncFont({ config, appearance, workspace }) {
      const enabled = !!config.shell && workspace instanceof window.Element
      const remote = String(appearance.fontUrl || config.fontUrl || '').trim()
      const localKey = String(appearance.fontLocalKey || config.fontLocalKey || '').trim()
      const validRemote = !!media?.isHttpsUrl?.(remote)
      const key = JSON.stringify([enabled, validRemote ? remote : '', localKey, revisions.get(`font:${localKey}`) || 0])
      const fallback = enabled ? style?.sanitizeTokenValue?.('fontFamily', appearance.fontFamily || config.fontFamily) : ''
      if (font?.key === key && (font.pending || font.face || !enabled || !validRemote && !localKey)) {
        font.fallback = fallback
        applyFont(font)
        return font.promise
      }
      const previous = font
      const record = { key, fallback, face: null, promise: null, pending: true }
      font = record
      releaseFont(previous)
      applyFont(record)
      record.promise = (async () => {
        if (!enabled || !media?.loadFontFace || !validRemote && !localKey) return
        const source = validRemote ? `url(${remote})` : await loadLocal('font', localKey)
        if (font !== record || !source) return
        try {
          const face = await media.loadFontFace({ family: 'LSBShellUserFont', source, document, URLCtor: window.URL })
          if (font !== record) {
            face?.dispose?.()
            return
          }
          record.face = face
          applyFont(record)
        } catch {
          if (font !== record) return
          applyFont(record)
          toast?.('字体加载失败，已回退站点字体', { type: 'error' })
        }
      })().finally(() => { record.pending = false })
      return record.promise
    }

    function sync() {
      if (disposed) return Promise.resolve()
      const { config = {}, appearance = {}, workspace, canvasMode = false } = getContext()
      const context = { config, appearance, workspace, canvasMode }
      return Promise.all([syncBackground(context), syncFont(context)])
    }

    function reset() {
      epoch++
      const oldBackground = background, oldFont = font, oldDatabase = database
      background = null
      font = null
      database = null
      releaseBackground(oldBackground)
      releaseFont(oldFont)
      closeDatabase(oldDatabase)
      root.classList.remove('lsb-skin-video-on', 'lsb-skin-image-on')
      root.style.removeProperty(fontProperty)
    }

    function dispose() {
      if (disposed) return
      disposed = true
      reset()
      revisions.clear()
    }

    return { sync, saveFile, reset, dispose }
  }
  const SKIN_PLUGIN_FEATURES = [
    { plugin: 'reading-center', rpc: 'reading-center:open', label: '阅读中心' },
    { plugin: 'checkin-calendar', panel: 'checkin-calendar', label: '签到日历' },
    { plugin: 'points-title-workbench', rpc: 'points-title-workbench:open', label: '积分-称号' },
    { plugin: 'annual-report', panel: 'annual-report', label: '年度报告' },
  ]

  /** Both skins resolve live capabilities, including again at activation time. */
  function createSkinPluginCatalog({ getInfo, ui, request }) {
    function settings() {
      return ui.settingsPlugins()
    }

    function features() {
      const info = getInfo() || {}
      const states = new Map((info.plugins || []).map((plugin) => [plugin.id, plugin.state]))
      const panels = new Set(ui.panels().map((panel) => panel.id))
      const handlers = new Set((info.handlers || []).map((handler) => handler.name))
      const configured = new Set(settings().map((plugin) => plugin.id))
      return SKIN_PLUGIN_FEATURES
        .filter((item) => states.get(item.plugin) === 'active')
        .filter((item) => item.panel ? panels.has(item.panel) : handlers.has(item.rpc))
        .map((item) => ({ ...item, hasSettings: configured.has(item.plugin) }))
    }

    function tools() {
      return features().map(({ plugin, panel, rpc, label }) => rpc ? { plugin, rpc, label } : { plugin, panel, label })
    }

    async function openFeature(pluginId) {
      const entry = features().find((item) => item.plugin === pluginId)
      if (!entry) {
        ui.toast('这个插件功能当前不可用', { type: 'info' })
        return false
      }
      try {
        if (entry.panel) ui.openPanel(entry.panel)
        else await request(entry.rpc)
        return true
      } catch {
        ui.toast('插件功能打开失败', { type: 'error' })
        return false
      }
    }

    function openSettings(pluginId) {
      if (!settings().some((item) => item.id === pluginId)) {
        ui.toast('这个插件没有可用的设置表单', { type: 'info' })
        return false
      }
      try {
        ui.openPluginSettings(pluginId)
        return true
      } catch {
        ui.toast('插件设置当前不可用', { type: 'error' })
        return false
      }
    }

    return { features, settings, tools, openFeature, openSettings }
  }
  const SKIN_SEARCH_FORMS = 'form.search-form, form.meilisearch-search-top-form, form[role="search"][aria-label="站内搜索"]'
  const SKIN_TOP_SEARCH_FORMS = 'body > .top form.search-form, body > .top form.meilisearch-search-top-form, body > .top form[role="search"][aria-label="站内搜索"]'

  /** Moves native nodes without cloning their fields or taking over submission. */
  function createSkinSearchController({ document }) {
    const { Element, HTMLElement } = document.defaultView
    let node = null
    let home = null
    let panel = null

    function host() {
      return document.querySelector('#lsb-shell [data-canvas-search-host]') || document.querySelector('.lsb-shell-search-host')
    }

    function ownHosted(element, target) {
      if (node !== element) node?.classList.remove('lsb-shell-search')
      node = element
      panel = target
      node.classList.add('lsb-shell-search')
    }

    function reconcileReplacement() {
      // The site may replace a placeholder before our mutation callback runs.
      const replacement = node && !node.isConnected
        ? panel?.querySelector(SKIN_SEARCH_FORMS) || panel?.querySelector('a.search-page-link') : null
      if (replacement) ownHosted(replacement, panel)
    }

    function adopt(targetHost) {
      if (!(targetHost instanceof Element)) return
      const canvas = targetHost.matches('[data-canvas-search-host]')
      const target = canvas ? targetHost.querySelector('[data-canvas-search-panel]') : targetHost
      if (!(target instanceof Element)) return
      reconcileReplacement()
      if (node?.matches(SKIN_SEARCH_FORMS) && panel?.contains(node)) {
        const moving = panel !== target
        ownHosted(node, target)
        if (moving) target.append(node)
        if (canvas) targetHost.hidden = false
        return
      }
      const hostedForm = target.querySelector(SKIN_SEARCH_FORMS)
      if (hostedForm) {
        ownHosted(hostedForm, target)
        if (canvas) targetHost.hidden = false
        return
      }
      const nativeForm = document.querySelector(SKIN_TOP_SEARCH_FORMS) || document.querySelector(SKIN_SEARCH_FORMS)
      if (nativeForm && !target.contains(nativeForm)) {
        const fallback = target.querySelector('a.search-page-link')
        if (fallback) {
          fallback.classList.remove('lsb-shell-search')
          fallback.remove()
        }
        if (nativeForm !== node) home = { parent: nativeForm.parentNode, next: nativeForm.nextSibling }
        ownHosted(nativeForm, target)
        target.append(nativeForm)
        if (canvas) targetHost.hidden = false
        return
      }
      const hostedLink = target.querySelector('a.search-page-link')
      if (hostedLink) {
        ownHosted(hostedLink, target)
        if (canvas) targetHost.hidden = false
        return
      }
      const link = node?.matches('a.search-page-link') && panel?.contains(node)
        ? node : document.querySelector('body > .top .search-page-link') || document.querySelector('a.search-page-link')
      if (!(link instanceof Element) || targetHost.contains(link)) {
        if (canvas) targetHost.hidden = true
        return
      }
      if (link !== node) home = { parent: link.parentNode, next: link.nextSibling }
      ownHosted(link, target)
      target.append(link)
      if (canvas) targetHost.hidden = false
    }

    function restore() {
      reconcileReplacement()
      if (node) {
        node.classList.remove('lsb-shell-search')
        if (!home?.parent?.isConnected) node.remove()
        else if (home.next?.parentNode === home.parent) home.parent.insertBefore(node, home.next)
        else home.parent.append(node)
      }
      node = null
      home = null
      panel = null
    }

    function setOpen(targetHost, open, restoreFocus = false) {
      if (!(targetHost instanceof Element)) return false
      const trigger = targetHost.querySelector('[data-canvas-search-trigger]')
      const target = targetHost.querySelector('[data-canvas-search-panel]')
      if (!(trigger instanceof HTMLElement) || !(target instanceof HTMLElement)) return false
      const next = !!open && !!target.querySelector('form, .search-page-link')
      targetHost.dataset.searchOpen = String(next)
      target.hidden = !next
      trigger.setAttribute('aria-expanded', String(next))
      trigger.setAttribute('aria-label', next ? '关闭站点搜索' : '打开站点搜索')
      if (next) target.querySelector('input[type="search"], input[name="q"]')?.focus?.()
      else if (restoreFocus) trigger.focus?.()
      return next
    }

    return { host, adopt, restore, setOpen }
  }
  /** 双界面的导航数据；每次读取当前路由、站点目录与 DOM，渲染和生命周期由调用方管理。 */
  function createSkinNavigation({ document, getPage, getForums, getLocation, parseTopic, store, homeSorted }) {
    function collectBoards() {
      const forums = getForums() || []
      const cached = store.get('boardCounts') || {}
      const live = {}
      for (const f of forums) {
        if (Number.isFinite(f.topics)) live[f.id] = f.topics
      }
      const counts = { ...cached, ...live }
      if (Object.keys(live).length) store.set('boardCounts', counts)
      if (forums.length) {
        return forums.map((f) => ({
          href: `/forum/${f.id}`,
          label: f.name,
          count: counts[f.id],
        }))
      }
      const seen = new Set()
      const out = []
      for (const a of document.querySelectorAll('.forum-nav a[href^="/forum/"]')) {
        const href = a.getAttribute('href')
        const label = (a.textContent || '').trim()
        if (!href || seen.has(href)) continue
        seen.add(href)
        const id = Number((href.match(/\/forum\/(\d+)/) || [])[1])
        out.push({ href, label, count: counts[id] })
      }
      return out
    }

    function pagePath() {
      try {
        return getLocation().pathname.replace(/\/+$/, '') || '/'
      } catch {
        return ''
      }
    }

    function locationText() {
      const p = getPage() || {}
      const path = pagePath()
      const type = p.type
      if (type === 'collections' || path === '/topic_collections') {
        let tab = type === 'collections' ? p.tab : null
        if (tab == null) {
          try {
            tab = new URL(getLocation().href).searchParams.get('tab')
          } catch {
            tab = null
          }
        }
        return tab === 'mine' || !tab ? '我的淘帖' : '淘帖中心'
      }
      if (type === 'collection' || /^\/topic_collection\/\d+$/.test(path)) {
        const title = (document.querySelector('h1.post-content-title, h1')?.textContent || '').trim()
        return title || '淘帖'
      }
      if (type === 'identity' || path === '/identity_center') return '认证中心'
      if (type === 'promotions' || path === '/promotions') return '我的广告'
      if (type === 'messages' || path === '/direct_messages') return '我的私信'
      if (type === 'user_block' || path === '/user_block') return '屏蔽名单'
      if (type === 'essence_review' || path === '/topic_essence_review_list') return '申精'
      if (type === 'home' || path === '/' || path === '/index.php') {
        if (path === '/' || path === '/index.php') {
          if (p.sort === 'lucky') return '抽奖'
          if (p.sort === 'card') return '发卡'
          if (p.sort === 'red_packet') return '红包'
          if (p.sort === 'comment') return '新评论'
          return '新帖子'
        }
      }
      if (type === 'forum') {
        const f = (getForums() || []).find((x) => x.id === p.id)
        return f?.name || '版块'
      }
      if (type === 'topic') {
        try {
          const title = parseTopic(document)?.title
          if (title) return title
        } catch {
          /* 解析失败则读标题节点 */
        }
        return (document.querySelector('h1.post-content-title')?.textContent || '').trim() || '帖子'
      }
      if (type === 'user') return '用户'
      if (type === 'featured') return '精华'
      if (type === 'hot_discussions' || path === '/hot_discussions') return '热议'
      if (type === 'footprint') return '足迹'
      if (type === 'gacha') return '称号抽取'
      if (type === 'gacha_market') return '称号交易'
      if (type === 'gacha_profile') return '我的称号'
      if (type === 'wallet') return '我的烧饼'
      if (type === 'invite') return '邀请中心'
      return 'LINUX SB'
    }

    function isActiveHref(href) {
      const p = getPage() || {}
      if (href === '/' || href === '') return p.type === 'home'
      if (p.type === 'forum') return href === `/forum/${p.id}`
      return false
    }

    function canvasPageType() {
      const type = String(getPage()?.type || '')
      if (['home', 'forum', 'topic', 'user', 'settings'].includes(type)) return type
      const path = pagePath()
      if (path === '/' || path === '/index.php') return 'home'
      if (/^\/forum\/\d+/.test(path) || /^\/category\/\d+/.test(path)) return 'forum'
      if (/^\/topic\/\d+/.test(path)) return 'topic'
      if (/^\/user(?:\/|$)/.test(path)) return 'user'
      if (/settings|preferences|config/i.test(path)) return 'settings'
      return 'page'
    }

    function navigationEntries() {
      const location = getLocation()
      const currentHref = `${location.pathname}${location.search}${location.hash}`
      const favorite = document.querySelector('a[href*="tab=favorites"], a[href*="favorites"]')
      const search = document.querySelector('form.search-form')
      const entries = [
        { href: '/', label: '全部主题', group: '站点' },
        { href: homeSorted('post'), label: '新帖子', group: '站点' },
        ...(currentHref !== '/' ? [{ href: currentHref, label: '当前页面', group: '最近访问' }] : []),
        ...(favorite?.getAttribute('href') ? [{ href: favorite.getAttribute('href'), label: '我的收藏', group: '收藏' }] : []),
        ...(search?.getAttribute('action') ? [{ href: search.getAttribute('action'), label: '站内搜索', group: '搜索' }] : [{ href: '/search', label: '站内搜索', group: '搜索' }]),
        ...collectBoards().slice(0, 80).map((item) => ({ href: item.href, label: item.label, group: '版块' })),
      ]
      const out = []
      const seen = new Set()
      for (const item of entries) {
        if (!item?.href || !item.label || seen.has(item.href)) continue
        seen.add(item.href)
        out.push(item)
      }
      return out
    }

    return { collectBoards, pagePath, locationText, isActiveHref, canvasPageType, navigationEntries }
  }
  // Owns the live outlet, temporarily detached sidebars, and the window scroll bridge.
  function createSkinContentController({ window, document, isChallengeDocument, findLeftRails, createScrollBridge }) {
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
  // History state and temporary scroll-anchoring ownership for shell navigation.
  function createSkinHistoryController({ window, document, getScrollRoot, readScroll, scrollTo }) {
    const history = window.history
    let index = 0
    let rollbackIndex = null
    let bound = false
    let previousRestoration
    let ownsRestoration = false
    let restoreCleanup = null

    function readIndex() {
      const value = Number(history.state?.lsbShellSpaIndex)
      return Number.isSafeInteger(value) && value >= 0 ? value : null
    }

    function entryState(url, nextIndex, x, y) {
      const prior = history.state && typeof history.state === 'object' ? history.state : {}
      return {
        ...prior,
        lsbShellSpa: true,
        lsbShellSpaIndex: nextIndex,
        lsbShellSpaUrl: url,
        lsbScrollX: Number(x) || 0,
        lsbScrollY: Number(y) || 0,
      }
    }

    function rememberScroll() {
      const nextIndex = readIndex() ?? index
      const { x, y } = readScroll()
      try {
        history.replaceState(entryState(window.location.href, nextIndex, x, y), '', window.location.href)
        index = nextIndex
      } catch { /* history unavailable must not block content navigation */ }
    }

    function bind() {
      if (bound) return
      bound = true
      try {
        previousRestoration = history.scrollRestoration
        history.scrollRestoration = 'manual'
        ownsRestoration = true
      } catch { /* unsupported history property */ }
      index = readIndex() ?? 0
      rememberScroll()
    }

    function apply(target, mode) {
      if (mode === 'none') return
      const currentIndex = readIndex() ?? index
      const nextIndex = mode === 'replace' ? currentIndex : currentIndex + 1
      try {
        const state = entryState(target.href, nextIndex, 0, 0)
        if (mode === 'replace') history.replaceState(state, '', target.href)
        else history.pushState(state, '', target.href)
        index = nextIndex
      } catch { /* content can still render when the address bar cannot be updated */ }
    }

    function acceptPop(canLeave) {
      const targetIndex = readIndex()
      if (rollbackIndex !== null) {
        const expected = rollbackIndex
        rollbackIndex = null
        if (targetIndex === expected) {
          index = expected
          return false
        }
      }
      if (!canLeave()) {
        rollbackIndex = index
        try {
          history.go(targetIndex === null ? 1 : index - targetIndex)
        } catch { rollbackIndex = null }
        return false
      }
      if (targetIndex !== null) index = targetIndex
      return true
    }

    function cancelRestore() {
      restoreCleanup?.()
    }

    function protectScrollAnchor() {
      const root = getScrollRoot() || document.scrollingElement || document.documentElement
      if (!root?.style) return
      const style = root.style
      const prior = style.getPropertyValue('overflow-anchor')
      const priority = style.getPropertyPriority('overflow-anchor')
      style.setProperty('overflow-anchor', 'none', 'important')
      const events = ['wheel', 'touchstart', 'pointerdown', 'keydown', 'pagehide']
      const scrollKeys = new Set(['ArrowUp', 'ArrowDown', 'ArrowLeft', 'ArrowRight', 'PageUp', 'PageDown', 'Home', 'End', ' ', 'Spacebar'])
      let active = true
      let timer = 0
      const cleanup = () => {
        if (!active) return
        active = false
        window.clearTimeout(timer)
        for (const event of events) window.removeEventListener(event, onInput, true)
        if (style.getPropertyValue('overflow-anchor') === 'none' && style.getPropertyPriority('overflow-anchor') === 'important') {
          if (prior) style.setProperty('overflow-anchor', prior, priority)
          else style.removeProperty('overflow-anchor')
        }
        if (restoreCleanup === cleanup) restoreCleanup = null
      }
      function onInput(event) {
        if (event.type !== 'keydown' || scrollKeys.has(event.key)) cleanup()
      }
      restoreCleanup = cleanup
      for (const event of events) window.addEventListener(event, onInput, { capture: true, passive: true })
      // Covers the native toolbar's following frames and the 180ms content entrance.
      // No repeated scroll writes: user intent and subsequent layout keep their ownership.
      timer = window.setTimeout(cleanup, 250)
    }

    function restoreScroll(mode) {
      cancelRestore()
      const savedAxis = (key) => {
        const value = Number(history.state?.[key])
        return Number.isFinite(value) && value >= 0 ? value : 0
      }
      if (mode === 'none') protectScrollAnchor()
      try {
        scrollTo(mode === 'none' ? savedAxis('lsbScrollX') : 0, mode === 'none' ? savedAxis('lsbScrollY') : 0)
      } catch {
        cancelRestore()
      }
    }

    function cancel() {
      rollbackIndex = null
      cancelRestore()
    }

    function dispose() {
      cancel()
      if (ownsRestoration) {
        try {
          if (history.scrollRestoration === 'manual') {
            if (previousRestoration === undefined) delete history.scrollRestoration
            else history.scrollRestoration = previousRestoration
          }
        } catch { /* read-only history property */ }
      }
      ownsRestoration = false
      bound = false
    }

    return { bind, rememberScroll, apply, acceptPop, restoreScroll, cancelRestore, cancel, dispose }
  }
  /** Owns native user cards and reversible canvas profile decoration. */
  function createSkinProfileController({ window, document, getPage, getMe, getSidebars, getSelfHost, getViewport }) {
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
  /** Owns canvas site cards, their native origins and persistent route placeholders. */
  function createSkinSiteCardsController({ document, getSidebars }) {
    const { Element, HTMLElement } = document.defaultView
    const canvasSiteSidebarHomes = new Map()
    const canvasPersistentSiteCards = new Map()

    function restoreNode(el, home, cls) {
      if (!el) return
      if (!home?.hadClass) el.classList.remove(cls)
      if (!el.parentNode) {
        home?.placeholder?.remove()
        return
      }
      if (!home?.parent?.isConnected) {
        home?.placeholder?.remove()
        el.remove()
        return
      }
      if (home.placeholder?.parentNode === home.parent) {
        home.parent.replaceChild(el, home.placeholder)
      } else if (home.next?.parentNode === home.parent) {
        home.parent.insertBefore(el, home.next)
      } else {
        home.parent.append(el)
      }
    }

    function canvasPersistentSiteCardKind(card) {
      if (!(card instanceof Element)) return ''
      if (card.matches('.sidebar-promotions-card')) return 'promotions'
      if (card.matches('.daily-hot-topics-card')) return 'daily-hot-topics'
      return ''
    }

    function canvasEnsurePersistentSiteCard(card) {
      const kind = canvasPersistentSiteCardKind(card)
      if (!kind) return null
      let record = canvasPersistentSiteCards.get(kind)
      if (!record) {
        const parent = card.parentNode
        const placeholder = document.createComment(`lsb-canvas-${kind}-origin`)
        parent?.insertBefore(placeholder, card)
        record = { node: card, placeholder, originalParent: parent, originalNext: card.nextSibling }
        canvasPersistentSiteCards.set(kind, record)
      }
      return record
    }

    function canvasAdoptRebuiltPersistentSiteCard(kind, card) {
      const record = canvasPersistentSiteCards.get(kind)
      const parent = card?.parentNode
      if (!record || record.node?.isConnected || !parent) return false
      const placeholder = document.createComment(`lsb-canvas-${kind}-origin`)
      const originalNext = card.nextSibling
      parent.insertBefore(placeholder, card)
      canvasSiteSidebarHomes.delete(record.node)
      record.node = card
      record.placeholder = placeholder
      record.originalParent = parent
      record.originalNext = originalNext
      return true
    }

    function canvasRestorePersistentSiteCard(kind, record, { release = true } = {}) {
      if (!record?.node) return
      const { node, placeholder, originalParent, originalNext } = record
      const placeholderParent = placeholder?.parentNode
      const connectedParent = placeholderParent?.isConnected
        ? placeholderParent
        : (originalParent?.isConnected ? originalParent : getSidebars().find((side) => side.isConnected))
      if (connectedParent && placeholderParent === connectedParent) {
        connectedParent.replaceChild(node, placeholder)
      } else if (connectedParent) {
        const before = originalNext?.parentNode === connectedParent ? originalNext : null
        connectedParent.insertBefore(node, before)
      } else if (originalParent?.isConnected) {
        const before = originalNext?.parentNode === originalParent ? originalNext : null
        originalParent.insertBefore(node, before)
      } else if (!node.parentNode?.isConnected) {
        node.remove()
      }
      node.classList.remove('lsb-canvas-site-card')
      if (release) canvasPersistentSiteCards.delete(kind)
      canvasSiteSidebarHomes.delete(node)
    }

    function canvasStagePersistentSiteCardOrigins(remoteOutlet) {
      if (!(remoteOutlet instanceof Element)) return
      for (const [kind] of canvasPersistentSiteCards) {
        const remotes = [...remoteOutlet.querySelectorAll('.sidebar-promotions-card, .daily-hot-topics-card')]
          .filter((card) => canvasPersistentSiteCardKind(card) === kind)
        for (const remote of remotes) {
          const marker = remote.ownerDocument.createElement('span')
          marker.hidden = true
          marker.dataset.lsbCanvasSiteOrigin = kind
          marker.setAttribute('aria-hidden', 'true')
          remote.replaceWith(marker)
        }
      }
    }

    function canvasRebindPersistentSiteCardOrigins(routeOutlet) {
      if (!routeOutlet?.querySelector) return
      for (const [kind, record] of canvasPersistentSiteCards) {
        const marker = routeOutlet.querySelector(`[data-lsb-canvas-site-origin="${kind}"]`)
        if (!marker) continue
        record.placeholder = marker
        record.originalParent = marker.parentNode
        record.originalNext = marker.nextSibling
      }
    }

    function canvasRestoreSiteSidebar({ releasePersistent = false, restorePersistent = false } = {}) {
      const persistentByNode = new Map(
        [...canvasPersistentSiteCards].map(([kind, record]) => [record.node, { kind, record }]),
      )
      for (const [card, home] of [...canvasSiteSidebarHomes]) {
        const persistent = persistentByNode.get(card)
        if (persistent && !releasePersistent) continue
        if (persistent) canvasRestorePersistentSiteCard(persistent.kind, persistent.record, { release: releasePersistent })
        else restoreNode(card, home, 'lsb-canvas-site-card')
        canvasSiteSidebarHomes.delete(card)
      }
      if (restorePersistent && !releasePersistent) {
        for (const [kind, record] of canvasPersistentSiteCards) {
          canvasRestorePersistentSiteCard(kind, record, { release: false })
        }
      }
      if (releasePersistent) {
        for (const [kind, record] of [...canvasPersistentSiteCards]) {
          canvasRestorePersistentSiteCard(kind, record, { release: true })
        }
      }
      if (releasePersistent) canvasPersistentSiteCards.clear()
    }

    function canvasPromotionNeedsNativeInitialization(card) {
      if (!(card instanceof Element) || !card.matches('.sidebar-promotions-card')) return false
      const links = [...card.querySelectorAll('[data-sidebar-promotions-ad-link="1"]')]
      const textLinks = links.filter((link) =>
        link.matches('.sidebar-promotions-slot-text, [data-sidebar-promotions-lottery-slot="1"]')
        || (!link.matches('.sidebar-promotions-slot-image') && !link.querySelector('img')),
      )
      if (!textLinks.length) return false
      return textLinks.some((link) => {
        const style = link.getAttribute('style') || ''
        return !/--sidebar-promotion-text\s*:/.test(style)
          || !/--sidebar-promotion-background\s*:/.test(style)
      })
    }

    function canvasNativeSiteCards() {
      const cards = [...canvasSiteSidebarHomes]
        .filter(([card, home]) => card.parentNode && home.parent?.isConnected)
        .map(([card]) => card)
      const emittedPersistentKinds = new Set()
      for (const side of getSidebars()) {
        for (const card of [...side.children].filter((node) => node.matches?.('.sidebar-card'))) {
          if (card.classList.contains('user-card')) continue
          if (card.classList.contains('mobile-menu-drawer')) continue
          const kind = canvasPersistentSiteCardKind(card)
          if (kind) {
            const existing = canvasPersistentSiteCards.get(kind)
            if (existing && existing.node !== card) {
              if (existing.node?.isConnected) {
                if (canvasPromotionNeedsNativeInitialization(card)) card.remove()
                else cards.push(card)
                continue
              }
              if (canvasPromotionNeedsNativeInitialization(card)) {
                card.remove()
                continue
              }
              canvasAdoptRebuiltPersistentSiteCard(kind, card)
            }
            const record = canvasEnsurePersistentSiteCard(card)
            if (!record) continue
            if (!emittedPersistentKinds.has(kind)) {
              cards.push(record.node)
              emittedPersistentKinds.add(kind)
            }
            continue
          }
          cards.push(card)
        }
      }
      for (const [kind, record] of canvasPersistentSiteCards) {
        if (record.node.isConnected && !emittedPersistentKinds.has(kind)) cards.push(record.node)
      }
      return [...new Set(cards)]
    }

    function syncPersistent(host) {
      const cards = []
      const emitted = new Set()
      for (const side of getSidebars()) {
        for (const card of [...side.children].filter((node) => node.matches?.('.sidebar-card'))) {
          const kind = canvasPersistentSiteCardKind(card)
          if (!kind) continue
          const existing = canvasPersistentSiteCards.get(kind)
          if (existing && existing.node !== card) {
            if (existing.node?.isConnected) {
              if (canvasPromotionNeedsNativeInitialization(card)) card.remove()
              continue
            }
            if (canvasPromotionNeedsNativeInitialization(card)) {
              card.remove()
              continue
            }
            canvasAdoptRebuiltPersistentSiteCard(kind, card)
          }
          const record = canvasEnsurePersistentSiteCard(card)
          if (record && !emitted.has(kind)) {
            cards.push(record.node)
            emitted.add(kind)
          }
        }
      }
      for (const [kind, record] of canvasPersistentSiteCards) {
        if (record.node.isConnected && !emitted.has(kind)) cards.push(record.node)
      }
      for (const card of cards) {
        if (host.contains(card)) continue
        card.classList.add('lsb-canvas-site-card')
        host.append(card)
      }
      const empty = host.querySelector('[data-canvas-site-empty-state]')
      if (empty instanceof HTMLElement) empty.hidden = cards.length > 0
    }

    function syncAll(host) {
      const cards = canvasNativeSiteCards()
      const current = new Set(cards)
      const persistentNodes = new Set(
        [...canvasPersistentSiteCards.values()].map((record) => record.node),
      )
      for (const [card, home] of [...canvasSiteSidebarHomes]) {
        if (!card.parentNode || !home.parent?.isConnected) {
          restoreNode(card, home, 'lsb-canvas-site-card')
          canvasSiteSidebarHomes.delete(card)
        }
      }
      for (const card of [...host.children].filter((node) => node.matches?.('.sidebar-card'))) {
        if (persistentNodes.has(card) || current.has(card) || canvasSiteSidebarHomes.has(card)) continue
        const home = canvasSiteSidebarHomes.get(card)
        if (home) {
          restoreNode(card, home, 'lsb-canvas-site-card')
          canvasSiteSidebarHomes.delete(card)
        } else {
          card.remove()
        }
      }
      for (const card of cards) {
        if (host.contains(card)) continue
        if (!persistentNodes.has(card) && !canvasSiteSidebarHomes.has(card)) {
          const parent = card.parentNode
          const placeholder = document.createComment('lsb-canvas-site-card-origin')
          parent?.insertBefore(placeholder, card)
          canvasSiteSidebarHomes.set(card, { parent, next: card.nextSibling, placeholder, hadClass: card.classList.contains('lsb-canvas-site-card') })
        }
        card.classList.add('lsb-canvas-site-card')
        host.append(card)
      }
      const empty = host.querySelector('[data-canvas-site-empty-state]')
      if (empty instanceof HTMLElement) {
        const mounted = host.querySelectorAll(':scope > .sidebar-card').length
        empty.hidden = cards.length > 0 || mounted > 0
      }
    }

    function sync(host, { persistentOnly = false } = {}) {
      if (!(host instanceof Element)) return
      if (persistentOnly) syncPersistent(host)
      else syncAll(host)
    }
    return { sync, restore: canvasRestoreSiteSidebar, stageOrigins: canvasStagePersistentSiteCardOrigins, rebindOrigins: canvasRebindPersistentSiteCardOrigins }
  }
  // Shared online roster and avatar lifecycle for both shell modes.
  function createSkinOnlineController({ window, document, request, isEnabled, isChallengeDocument }) {
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
  /** Owns legacy sidebar cards, cached fallbacks and late-card observation. */
  function createSkinAsideCardsController({ window, document, store, getSidebars, getPage, isSelfUserCard, isEnabled, syncOnlineDots }) {
    const { Element, Node } = document.defaultView
    const asideHomes = new Map()
    const asidePersistentCards = new Map()
    let onlineObs = null
    let observedSidebars = []

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

    function nativeCards() {
      return getSidebars().flatMap((side) => [...side.querySelectorAll('.sidebar-card')])
    }

    function asidePersistentCardKind(card) {
      if (!(card instanceof Element)) return ''
      if (card.matches('.sidebar-promotions-card')) return 'promotions'
      if (card.matches('.daily-hot-topics-card')) return 'daily-hot-topics'
      return ''
    }

    function ensureAsidePersistentCard(card) {
      const kind = asidePersistentCardKind(card)
      if (!kind) return null
      const existing = asidePersistentCards.get(kind)
      if (existing?.node?.isConnected) return existing
      const parent = card.parentNode
      const record = { node: card, originalParent: parent, originalNext: card.nextSibling }
      asidePersistentCards.set(kind, record)
      return record
    }

    function removeRebuiltAsidePersistentCards() {
      for (const [kind, record] of asidePersistentCards) {
        for (const card of nativeCards()) {
          if (card !== record.node && asidePersistentCardKind(card) === kind) card.remove()
        }
      }
    }

    function restoreAsidePersistentCards() {
      for (const [kind, record] of [...asidePersistentCards]) {
        const node = record?.node
        if (!(node instanceof Element)) {
          asidePersistentCards.delete(kind)
          continue
        }
        const parent = record.originalParent?.isConnected
          ? record.originalParent
          : getSidebars().find((side) => side.isConnected)
        if (!(parent instanceof Element)) continue
        const before = record.originalNext?.parentNode === parent ? record.originalNext : null
        parent.insertBefore(node, before)
        node.classList.remove('lsb-shell-aside-card')
        asidePersistentCards.delete(kind)
      }
    }

    function pickAsideCards() {
      const persistent = [...asidePersistentCards.values()]
        .map((record) => record.node)
        .filter((node) => node?.isConnected)
      const hosted = [...document.querySelectorAll('#lsb-shell-aside .sidebar-card')]
      const all = [...persistent, ...hosted, ...nativeCards()]
      const seen = new Set()
      const uniq = all.filter((el) => {
        if (el.hasAttribute('data-lsb-aside-keep')) return false
        if (seen.has(el)) return false
        seen.add(el)
        return true
      })
      const text = (el) => (el.textContent || '').replace(/\s+/g, ' ').trim()
      const onUser = getPage()?.type === 'user'
      const profile = onUser
        ? uniq.find(
            (c) =>
              c.classList.contains('user-card')
              && !c.classList.contains('lsb-shell-user-card')
              && !isSelfUserCard(c),
          )
        : null
      const bio = onUser ? uniq.find((c) => c.classList.contains('bio-card')) : null
      const promo = uniq.find((c) => c.classList.contains('sidebar-promotions-card'))
      const announce = uniq.find(
        (c) => c.classList.contains('forum-enhancements-left-announcements') || text(c).startsWith('站务公告'),
      )
      const quick = uniq.find((c) => text(c).startsWith('快捷功能'))
      const hot = uniq.find((c) => c.classList.contains('daily-hot-topics-card'))
      const stats = uniq.find((c) => c.classList.contains('stats-card'))
      const online = uniq.find((c) => c.classList.contains('online-users-card'))
      return [profile, bio, promo, announce, quick, hot, stats, online].filter(Boolean)
    }

    function adoptAsideCards(host) {
      if (!(host instanceof Element)) return
      for (const card of pickAsideCards()) {
        const kind = asidePersistentCardKind(card)
        if (kind) {
          const record = ensureAsidePersistentCard(card)
          if (record?.node !== card) {
            card.remove()
            continue
          }
          if (host.contains(card)) continue
        } else if (host.contains(card) || card.classList.contains('lsb-shell-user-card')) {
          continue
        } else {
          asideHomes.set(card, { parent: card.parentNode, next: card.nextSibling })
        }
        card.classList.add('lsb-shell-aside-card')
        host.append(card)
      }
      removeRebuiltAsidePersistentCards()
      hydrateAsideKeep(host)
      snapshotAsideKeep(host)
      syncOnlineDots()
    }

    function cardLabel(el) {
      return (el.textContent || '').replace(/\s+/g, ' ').trim()
    }

    function snapshotAsideKeep(host) {
      if (!(host instanceof Element)) return
      const keep = { ...(store.get('asideKeep') || {}) }
      const live = [...host.querySelectorAll('.sidebar-card')].filter(
        (el) => !el.hasAttribute('data-lsb-aside-keep'),
      )
      const quick = live.find((c) => cardLabel(c).startsWith('快捷功能'))
      const stats = live.find((c) => c.classList.contains('stats-card'))
      const online = live.find((c) => c.classList.contains('online-users-card'))
      let changed = false
      if (quick) {
        const node = quick.cloneNode(true)
        node.querySelectorAll('[data-themes-mode-toggle], .dark-mode-control').forEach((n) => n.remove())
        keep.quick = node.outerHTML
        changed = true
      }
      if (stats) {
        keep.stats = stats.outerHTML
        changed = true
      }
      if (online) {
        keep.online = online.outerHTML
        changed = true
      }
      if (changed) store.set('asideKeep', keep)
    }

    function injectKeptCard(host, html, slot, before) {
      if (!html || host.querySelector(`[data-lsb-aside-keep="${slot}"]`)) return
      const box = document.createElement('div')
      box.innerHTML = html
      const el = box.firstElementChild
      if (!(el instanceof Element)) return
      el.setAttribute('data-lsb-aside-keep', slot)
      el.classList.add('lsb-shell-aside-card')
      if (before instanceof Node && before.parentNode === host) host.insertBefore(el, before)
      else host.append(el)
    }

    function hydrateAsideKeep(host) {
      if (!(host instanceof Element)) return
      const keep = store.get('asideKeep') || {}
      const live = [...host.querySelectorAll('.sidebar-card')].filter(
        (el) => !el.hasAttribute('data-lsb-aside-keep'),
      )
      const hasQuick = live.some((c) => cardLabel(c).startsWith('快捷功能'))
      const hasStats = live.some((c) => c.classList.contains('stats-card'))
      const hasOnline = live.some((c) => c.classList.contains('online-users-card'))
      if (hasQuick) host.querySelector('[data-lsb-aside-keep="quick"]')?.remove()
      else injectKeptCard(host, keep.quick, 'quick', host.querySelector('.daily-hot-topics-card'))
      if (hasStats) host.querySelector('[data-lsb-aside-keep="stats"]')?.remove()
      else {
        const hot = host.querySelector('.daily-hot-topics-card')
        injectKeptCard(host, keep.stats, 'stats', hot?.nextSibling)
      }
      if (hasOnline) host.querySelector('[data-lsb-aside-keep="online"]')?.remove()
      else injectKeptCard(host, keep.online, 'online', null)
    }

    function restoreAsideCards() {
      stopOnlineWatch()
      for (const [card, home] of asideHomes) restoreNode(card, home, 'lsb-shell-aside-card')
      asideHomes.clear()
    }

    function pruneDetachedAsideCards() {
      for (const [card, home] of [...asideHomes]) {
        if (home?.parent?.isConnected) continue
        restoreNode(card, home, 'lsb-shell-aside-card')
        asideHomes.delete(card)
      }
    }

    function watchOnlineCard() {
      const liveOnline = '#lsb-shell-aside [data-lsb-shell-site] .online-users-card:not([data-lsb-aside-keep])'
      if (!isEnabled() || document.querySelector(liveOnline)) {
        stopOnlineWatch()
        return
      }
      const sides = getSidebars().filter((side) => side.isConnected)
      if (onlineObs && sides.length === observedSidebars.length && sides.every((side, i) => side === observedSidebars[i])) return
      stopOnlineWatch()
      if (!sides.length) return
      onlineObs = new window.MutationObserver(() => {
        const host = document.querySelector('#lsb-shell-aside [data-lsb-shell-site]')
        if (!host || !isEnabled()) return
        adoptAsideCards(host)
        if (document.querySelector(liveOnline)) stopOnlineWatch()
      })
      observedSidebars = sides
      for (const side of sides) onlineObs.observe(side, { childList: true, subtree: true })
    }

    function stopOnlineWatch() {
      onlineObs?.disconnect()
      onlineObs = null
      observedSidebars = []
    }

    return { adopt: adoptAsideCards, restore: restoreAsideCards, restorePersistent: restoreAsidePersistentCards,
      pruneDetached: pruneDetachedAsideCards, watch: watchOnlineCard, stop: stopOnlineWatch }
  }
  /** Owns legacy sidebar tabs, selection preference and view lifecycles. */
  function createSkinAsideViewsController({ window, document, store, getContext, getViews, isEnabled, onSelect }) {
    const { Element } = document.defaultView
    const asideViews = new Map()
    const ASIDE_ACTIVE_KEY = 'aside-active'
    const storedAsideId = store.get(ASIDE_ACTIVE_KEY, 'site')
    let asidePreferredId = storedAsideId === 'site' || /^[a-z][a-z0-9-]{0,63}$/.test(String(storedAsideId || ''))
      ? String(storedAsideId || 'site')
      : 'site'
    let asideActiveId = 'site'
    let asideResizeBound = false

    // · E2 asideSetActive/removeAsideView: 侧栏视图激活与销毁 ──
    function asideSetActive(id, aside = document.querySelector('#lsb-shell-aside'), persist = false) {
      if (!(aside instanceof Element)) return 'site'
      const registered = getViews(getContext()).find((view) => view.id === id)
      const exists = id === 'site' || asideViews.has(id) || !!registered
      asideActiveId = exists ? id : 'site'
      if (persist && exists) {
        asidePreferredId = asideActiveId
        try {
          store.set(ASIDE_ACTIVE_KEY, asidePreferredId)
        } catch {
          /* A storage failure must not block the current tab selection. */
        }
      }
      for (const tab of aside.querySelectorAll('[data-lsb-shell-aside-tab]')) {
        const active = tab.getAttribute('data-lsb-shell-aside-tab') === asideActiveId
        tab.setAttribute('aria-selected', active ? 'true' : 'false')
        tab.tabIndex = active ? 0 : -1
      }
      for (const pane of aside.querySelectorAll('[data-lsb-shell-aside-pane]')) {
        pane.hidden = pane.getAttribute('data-lsb-shell-aside-pane') !== asideActiveId
      }
      const selectedView = asideViews.get(asideActiveId)?.view
        || getViews(getContext()).find((view) => view.id === asideActiveId)
      onSelect(asideActiveId, selectedView)
      return asideActiveId
    }

    function removeAsideView(id) {
      const rec = asideViews.get(id)
      if (!rec) return
      try {
        rec.dispose?.()
      } catch (e) {
        console.error('[LSB skin] 右栏视图清理失败', id, e)
      }
      rec.tab?.remove()
      rec.pane?.remove()
      asideViews.delete(id)
      if (asideActiveId === id) asideActiveId = 'site'
    }

    function destroyAsideViews() {
      for (const id of [...asideViews.keys()]) removeAsideView(id)
      asideActiveId = 'site'
    }

    // · E3 syncAsideViews/bindAsideResize: 侧栏视图同步与自适应 ──
    function syncAsideViews(el = document.getElementById('lsb-shell')) {
      const aside = el?.querySelector?.('#lsb-shell-aside') || document.querySelector('#lsb-shell-aside')
      if (!(aside instanceof Element)) return
      const tabs = aside.querySelector('#lsb-shell-aside-tabs')
      const panes = aside.querySelector('.lsb-shell-aside-panes')
      const site = panes?.querySelector('[data-lsb-shell-aside-pane="site"]')
      if (!(tabs instanceof Element) || !(panes instanceof Element) || !(site instanceof Element)) return

      const wide = getContext().wide
      const context = getContext()
      const visible = wide ? getViews(context) : []
      const next = new Map(visible.map((view) => [view.id, view]))

      for (const id of [...asideViews.keys()]) {
        const view = next.get(id)
        const current = asideViews.get(id)
        if (!view || current.view !== view) removeAsideView(id)
      }

      let siteTab = tabs.querySelector('[data-lsb-shell-aside-tab="site"]')
      if (!siteTab) {
        siteTab = document.createElement('button')
        siteTab.type = 'button'
        siteTab.setAttribute('role', 'tab')
        siteTab.setAttribute('data-lsb-shell-aside-tab', 'site')
        siteTab.textContent = '站点'
        siteTab.addEventListener('click', () => asideSetActive('site', aside, true))
        tabs.append(siteTab)
      }

      for (const view of visible) {
        let rec = asideViews.get(view.id)
        if (!rec) {
          const tab = document.createElement('button')
          tab.type = 'button'
          tab.setAttribute('role', 'tab')
          tab.setAttribute('data-lsb-shell-aside-tab', view.id)
          tab.textContent = view.label
          const pane = document.createElement('section')
          pane.setAttribute('role', 'tabpanel')
          pane.setAttribute('data-lsb-shell-aside-pane', view.id)
          pane.setAttribute('aria-label', view.label)
          pane.tabIndex = 0
          tab.addEventListener('click', () => asideSetActive(view.id, aside, true))
          panes.append(pane)
          let dispose = null
          if (view.windowId && view.windowId !== 'site') {
            pane.textContent = `${view.label}已在独立窗口打开`
            pane.setAttribute('data-lsb-shell-window-proxy', view.windowId)
          } else {
            try {
              dispose = view.render(pane, context)
            } catch (e) {
              pane.textContent = 'AI 视图加载失败'
              console.error('[LSB skin] 右栏视图渲染失败', view.id, e)
            }
          }
          rec = { view, tab, pane, dispose: typeof dispose === 'function' ? dispose : null }
          asideViews.set(view.id, rec)
        }
        tabs.append(rec.tab)
        panes.append(rec.pane)
      }
      tabs.append(siteTab)
      // 站点页固定在首位；append 顺序用于浏览器键盘和读屏顺序。
      tabs.insertBefore(siteTab, tabs.firstChild)
      panes.insertBefore(site, panes.firstChild)
      tabs.hidden = !wide || visible.length === 0
      asideSetActive(wide ? asidePreferredId : 'site', aside)
    }

    function bindAsideResize() {
      if (asideResizeBound) return
      asideResizeBound = true
      window.addEventListener('resize', onAsideResize)
    }

    function unbindAsideResize() {
      if (!asideResizeBound) return
      window.removeEventListener('resize', onAsideResize)
      asideResizeBound = false
    }

    function onAsideResize() {
      if (isEnabled()) syncAsideViews()
    }

    return { setActive: asideSetActive, sync: syncAsideViews, destroy: destroyAsideViews,
      bindResize: bindAsideResize, unbindResize: unbindAsideResize,
      get activeId() { return asideActiveId }, get preferredId() { return asidePreferredId } }
  }
  /** Owns skin configuration and persisted canvas preferences; no DOM or resources. */
  function createSkinConfigController({ getConfig, saveConfig, store, getLocation, getViewport, stateApi, sanitizeTokenValue, isHttpsUrl }) {
    const { CANVAS_STATE_KEY, CANVAS_STATE_VERSION, CANVAS_WIDTH_CLASSES, CANVAS_DEFAULT_APPEARANCE, defaultCanvasState, migrateLegacySkinState, canvasMerge, canvasCopy, mergeCanvasState, siteKeyFromLocation, widthClass } = stateApi
    let cfg = getConfig()
    function effectiveUiMode() {
      return cfg?.uiMode === 'ios27' ? 'ios27' : 'legacy'
    }

    const topicSpaMigrationKey = 'topicSpaNewWorldDefaultMigrationV1'
    try {
      if (store.get(topicSpaMigrationKey) !== true) {
        saveConfig({ topicSpa: true })
        cfg = { ...cfg, topicSpa: true }
        store.set(topicSpaMigrationKey, true)
      }
    } catch {
      // Keep the resolved config when migration storage is unavailable.
    }
    let canvasState = null
    let canvasEffective = null
    let canvasSiteKey = siteKeyFromLocation(getLocation())
    let canvasWidthClass = widthClass(getViewport().width)

    function readCanvasState() {
      let stored = null
      try { stored = store.get(CANVAS_STATE_KEY, null) } catch { stored = null }
      if (!stored || typeof stored !== 'object' || Number(stored.version) !== CANVAS_STATE_VERSION) {
        canvasState = migrateLegacySkinState(cfg)
        try { store.set(CANVAS_STATE_KEY, canvasCopy(canvasState)) } catch { /* storage may be unavailable */ }
      } else {
        const base = defaultCanvasState()
        canvasState = canvasMerge(base, stored)
        canvasState.version = CANVAS_STATE_VERSION
        canvasState.sites = stored.sites && typeof stored.sites === 'object' ? canvasCopy(stored.sites) : {}
      }
      canvasSiteKey = siteKeyFromLocation(getLocation())
      canvasWidthClass = widthClass(getViewport().width)
      canvasEffective = mergeCanvasState(canvasState, canvasState.sites?.[canvasSiteKey] || {})
      return canvasEffective
    }

    function saveCanvasState() {
      if (!canvasState) return
      try { store.set(CANVAS_STATE_KEY, canvasCopy(canvasState)) } catch { /* storage failure is non-fatal */ }
    }

    function reload() {
      cfg = getConfig()
      return cfg
    }

    function refreshContext() {
      canvasSiteKey = siteKeyFromLocation(getLocation())
      canvasWidthClass = widthClass(getViewport().width)
      if (canvasState) canvasEffective = mergeCanvasState(canvasState, canvasState.sites?.[canvasSiteKey] || {})
    }

    function tokenValues() {
      const appearance = canvasEffective?.appearance || {}
      return {
        baseFontSize: appearance.fontSize ?? cfg.baseFontSize,
        fontFamily: appearance.fontFamily || cfg.fontFamily,
        textColor: appearance.textColor,
        panelColor: appearance.panelColor,
        accentColor: appearance.accentColor,
        glassOpacity: appearance.opacity ?? (cfg.glass ? (cfg.glassOpacity ?? 0.72) : 0.72),
        glassBlur: appearance.blur ?? (cfg.glass ? (cfg.glassBlur ?? 18) : 18),
        density: cfg.density,
      }
    }

    function canvasSetAppearance(name, value, options = {}) {
      const key = String(name || '')
      if (!CANVAS_DEFAULT_APPEARANCE.hasOwnProperty(key) || !canvasState) return false
      let next = value
      if (['opacity', 'blur', 'fontSize', 'radius'].includes(key)) {
        const n = Number(value)
        if (!Number.isFinite(n)) return false
        const bounds = { opacity: [.35, 1], blur: [0, 32], fontSize: [12, 32], radius: [8, 32] }[key]
        next = Math.min(bounds[1], Math.max(bounds[0], n))
      }
      if (['textColor', 'panelColor', 'accentColor'].includes(key)) {
        const text = String(value || '').trim()
        if (!text) next = ''
        else {
          const valid = sanitizeTokenValue(key, text)
          if (!valid) return false
          next = text
        }
      }
      if (key === 'fontFamily') {
        if (!value) next = ''
        else {
          const valid = sanitizeTokenValue('fontFamily', value)
          if (!valid) return false
          next = String(value)
        }
      }
      if (['backgroundVideoUrl', 'backgroundImageUrl', 'fontUrl'].includes(key)) {
        if (value && !isHttpsUrl(value)) return false
        next = String(value || '').trim()
      }
      const site = canvasState.sites[canvasSiteKey] || {}
      const appearancePatch = { [key]: next }
      if (key === 'backgroundVideoUrl' && next) {
        appearancePatch.background = 'video'
        appearancePatch.backgroundImageUrl = ''
        appearancePatch.backgroundImageLocalKey = ''
      }
      if (key === 'backgroundImageUrl' && next) {
        appearancePatch.background = 'image'
        appearancePatch.backgroundVideoUrl = ''
        appearancePatch.backgroundVideoLocalKey = ''
      }
      if (key === 'backgroundVideoUrl' && !next) appearancePatch.background = 'static'
      if (key === 'backgroundImageUrl' && !next) appearancePatch.background = 'static'
      canvasState.sites[canvasSiteKey] = canvasMerge(site, { appearance: appearancePatch })
      canvasEffective = mergeCanvasState(canvasState, canvasState.sites[canvasSiteKey])
      if (!options.defer) saveCanvasState()
      return true
    }

    function canvasSetBackgroundMode(mode) {
      if (!canvasState) return false
      const nextMode = ['image', 'video'].includes(String(mode)) ? String(mode) : 'static'
      const site = canvasState.sites[canvasSiteKey] || {}
      const appearancePatch = {
        background: nextMode,
        ...(nextMode === 'static' || nextMode === 'video' ? { backgroundImageUrl: '', backgroundImageLocalKey: '' } : {}),
        ...(nextMode === 'static' || nextMode === 'image' ? { backgroundVideoUrl: '', backgroundVideoLocalKey: '' } : {}),
      }
      canvasState.sites[canvasSiteKey] = canvasMerge(site, { appearance: appearancePatch })
      canvasEffective = mergeCanvasState(canvasState, canvasState.sites[canvasSiteKey])
      saveCanvasState()
      return true
    }

    function canvasChoosePreset(preset) {
      if (!canvasState || !['native-site', 'balanced-glass', 'immersive-video', 'static-readable'].includes(preset)) return false
      const values = {
        'native-site': { opacity: 1, blur: 0, background: 'static', backgroundVideoUrl: '', backgroundVideoLocalKey: '', backgroundImageUrl: '', backgroundImageLocalKey: '', fontFamily: '', fontUrl: '', fontLocalKey: '', fontSize: 14, textColor: '', panelColor: '', accentColor: '', radius: 16, motion: 'auto', transparency: 'reduced' },
        'balanced-glass': { opacity: .72, blur: 18, background: 'static', backgroundVideoUrl: '', backgroundVideoLocalKey: '', backgroundImageUrl: '', backgroundImageLocalKey: '', textColor: '', panelColor: '', accentColor: '', motion: 'auto', transparency: 'auto' },
        'immersive-video': { opacity: .56, blur: 22, background: 'video', backgroundVideoUrl: '', backgroundVideoLocalKey: '', backgroundImageUrl: '', backgroundImageLocalKey: '', textColor: '', panelColor: '', accentColor: '', motion: 'auto', transparency: 'auto' },
        'static-readable': { opacity: .94, blur: 0, background: 'static', backgroundVideoUrl: '', backgroundVideoLocalKey: '', backgroundImageUrl: '', backgroundImageLocalKey: '', textColor: '', panelColor: '', accentColor: '', motion: 'reduced', transparency: 'reduced' },
      }[preset]
      const site = canvasState.sites?.[canvasSiteKey]
      if (site?.appearance) {
        const next = { ...site }
        delete next.appearance
        canvasState.sites[canvasSiteKey] = next
      }
      canvasState.global = canvasMerge(canvasState.global, { preset, appearance: values })
      canvasEffective = mergeCanvasState(canvasState, canvasState.sites?.[canvasSiteKey] || {})
      saveCanvasState()
      return true
    }

    function canvasResetAppearance() {
      if (!canvasState) return false
      const site = canvasState.sites[canvasSiteKey]
      if (site?.appearance) {
        const next = { ...site }
        delete next.appearance
        canvasState.sites[canvasSiteKey] = next
      }
      canvasState.global = canvasMerge(canvasState.global, { preset: 'balanced-glass', appearance: canvasCopy(CANVAS_DEFAULT_APPEARANCE) })
      canvasEffective = mergeCanvasState(canvasState, canvasState.sites?.[canvasSiteKey] || {})
      saveCanvasState()
      return true
    }

    function canvasResetLayout() {
      if (!canvasState) return false
      const site = canvasState.sites[canvasSiteKey]
      if (site?.layout) {
        const next = { ...site }
        delete next.layout
        canvasState.sites[canvasSiteKey] = next
      }
      canvasEffective = mergeCanvasState(canvasState, canvasState.sites?.[canvasSiteKey] || {})
      saveCanvasState()
      return true
    }

    function canvasPersistSurfaceRect(id, rect) {
      if (!canvasState || !canvasSiteKey || !CANVAS_WIDTH_CLASSES.includes(canvasWidthClass)) return false
      const site = canvasState.sites[canvasSiteKey] || {}
      const layout = site.layout && typeof site.layout === 'object' ? site.layout : {}
      const bucket = layout[canvasWidthClass] && typeof layout[canvasWidthClass] === 'object' ? layout[canvasWidthClass] : {}
      canvasState.sites[canvasSiteKey] = canvasMerge(site, { layout: { [canvasWidthClass]: { ...bucket, [id]: canvasCopy(rect) } } })
      canvasEffective = mergeCanvasState(canvasState, canvasState.sites[canvasSiteKey])
      saveCanvasState()
      return true
    }

    function setMediaKey(kind, key) {
      if (!canvasState) return false
      const field = kind === 'video' ? 'backgroundVideoLocalKey' : kind === 'image' ? 'backgroundImageLocalKey' : 'fontLocalKey'
      const site = canvasState?.sites?.[canvasSiteKey] || {}
      const appearancePatch = {
        [field]: key,
        ...(kind === 'video' ? { background: 'video', backgroundVideoUrl: '', backgroundImageUrl: '', backgroundImageLocalKey: '' } : {}),
        ...(kind === 'image' ? { background: 'image', backgroundImageUrl: '', backgroundVideoUrl: '', backgroundVideoLocalKey: '' } : {}),
      }
      canvasState.sites[canvasSiteKey] = canvasMerge(site, { appearance: appearancePatch })
      canvasEffective = mergeCanvasState(canvasState, canvasState.sites[canvasSiteKey])
      saveCanvasState()
      return true
    }

    function saveLegacyMedia(kind, key) {
      const configKey = kind === 'video' ? 'backgroundVideoLocalKey' : kind === 'image' ? 'backgroundImageLocalKey' : 'fontLocalKey'
      const enabledKey = kind === 'video' ? 'backgroundVideoEnabled' : ''
      saveConfig({
        [configKey]: key,
        ...(enabledKey ? { [enabledKey]: true } : {}),
        ...(kind === 'video' ? { backgroundVideoUrl: '', backgroundImageUrl: '', backgroundImageLocalKey: '' } : {}),
        ...(kind === 'image' ? { backgroundVideoEnabled: false, backgroundVideoUrl: '', backgroundVideoLocalKey: '' } : {}),
      })
      cfg = getConfig()
      return cfg
    }

    return { reload, read: readCanvasState, save: saveCanvasState, refreshContext, effectiveUiMode, tokenValues,
      setAppearance: canvasSetAppearance, setBackgroundMode: canvasSetBackgroundMode, setMediaKey,
      choosePreset: canvasChoosePreset, resetAppearance: canvasResetAppearance,
      resetLayout: canvasResetLayout, persistSurfaceRect: canvasPersistSurfaceRect, saveLegacyMedia,
      get config() { return cfg }, get state() { return canvasState }, get effective() { return canvasEffective },
      get siteKey() { return canvasSiteKey }, get widthClass() { return canvasWidthClass } }
  }
  // Validates and commits SPA documents; event and request ownership stays with the caller.
  function createSkinSpaDocumentController({ window, document, getConfig, findRouteOutlet, nativeLeftRails, lifecycle, applyHistory }) {
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
  // Owns bounded live view fragments and background homepage refreshes.
  function createSkinViewCache({ window, document, request, getContext, parse, isTopic, cacheKey }) {
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
  // Owns SPA requests, browser events, cancellation, progress and route settlement.
  function createSkinSpaController({ window, document, getConfig, request, routeDocument, viewCacheController, historyController, hooks, perf, pendingClass }) {
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
  // Owns homepage infinite loading, per-list records and route-aware cleanup.
  function createSkinHomeInfiniteController({ window, document, getConfig, request, cacheKey, containsTopicPostContent, getScrollRoot }) {
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
  // Owns native reply threads, verification widgets and their route lifecycle.
  function createSkinNativeEnhancementsController({ window, document, topicUrl, startOnline }) {
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
  // Owns the skin settings renderer and the current userscript menu registration.
  function createSkinSettingsController({ document, ui, getConfig, saveConfig, configController, mediaController, applyAll }) {
    function renderSkinSettings(host) {
      const section = document.createElement('section')
      section.className = 'lsb-skin-media-settings'
      const heading = document.createElement('h3')
      heading.textContent = '本地资源与窗口布局'
      section.append(heading)
      const hint = document.createElement('p')
      hint.className = 'lsb-row-desc'
      hint.textContent = '视频单文件不超过 50MB，字体单文件不超过 10MB；二进制只保存在本机 IndexedDB。'
      section.append(hint)

      const appendFile = (kind, labelText, accept) => {
        const label = document.createElement('label')
        label.className = 'lsb-field'
        const title = document.createElement('span')
        title.textContent = labelText
        const input = document.createElement('input')
        input.type = 'file'
        input.accept = accept
        input.addEventListener('change', async () => {
          const file = input.files?.[0]
          if (!file || !ui.shellMedia) return
          const check = ui.shellMedia.validateMediaFile(file, { kind })
          if (!check.ok) {
            ui.toast?.(kind === 'video' ? '视频文件超过 50MB 或类型不受支持' : kind === 'image' ? '图片文件超过 20MB 或类型不受支持' : '字体文件超过 10MB 或类型不受支持', { type: 'error' })
            input.value = ''
            return
          }
          try {
            const key = await mediaController.saveFile(kind, file)
            configController.saveLegacyMedia(kind, key)
            applyAll()
            ui.toast?.('本地资源已保存', { type: 'success' })
          } catch (error) {
            if (error?.name === 'AbortError') return
            ui.toast?.('本地资源保存失败', { type: 'error' })
          } finally {
            input.value = ''
          }
        })
        label.append(title, input)
        section.append(label)
      }

      appendFile('video', '选择本地视频', 'video/*')
      appendFile('image', '选择静态图片', 'image/*')
      appendFile('font', '选择本地字体', '.woff2,.woff,.ttf,.otf,font/*')

      const actions = document.createElement('div')
      actions.className = 'lsb-actions'
      const arrange = document.createElement('button')
      arrange.type = 'button'
      arrange.className = 'lsb-btn'
      arrange.textContent = '一键整理窗口'
      arrange.addEventListener('click', () => ui.shellWindowArrange?.())
      const reset = document.createElement('button')
      reset.type = 'button'
      reset.className = 'lsb-btn'
      reset.textContent = '恢复默认布局'
      reset.addEventListener('click', () => ui.shellWindowReset?.())
      actions.append(arrange, reset)
      section.append(actions)
      host.append(section)
    }

    let unregMenu = () => {}
    function syncGmMenu() {
      unregMenu()
      const on = !!getConfig().shell
      unregMenu = ui.menuCommand(on ? '氢壳：关闭，回到原版界面' : '氢壳：开启', () => {
        saveConfig({ shell: !getConfig().shell })
      })
    }

    return { render: renderSkinSettings, syncMenu: syncGmMenu, clearMenu() { unregMenu() } }
  }
  // Owns topbar links, native appearance controls, and their original DOM positions.
  function createSkinTopbarController({ window, document, store, isEnabled, getWidthClass, getTopStatus }) {
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
  // Owns the legacy topic timeline, scroll scheduling, and timeline performance sampling.
  function createSkinTimelineController({ window, document, getPage, getPostSelector, isEnabled, hasPerfProbe, emitPerf }) {
    const { performance, Date } = window
    let timelineRaf = 0
    let windowListening = false
    let timelineEmitSec = -1
    let timelineEmitN = 0

    function topicPosts() {
      const sel = getPostSelector() || 'ul.topic-post-list > li.post-entry, ul.post-list > li.post-entry'
      const nodes = [...document.querySelectorAll(sel)]
      return nodes.slice().sort((a, b) => {
        const fa = Number(a.dataset?.floor)
        const fb = Number(b.dataset?.floor)
        const na = Number.isFinite(fa) && fa > 0 ? fa : 0
        const nb = Number.isFinite(fb) && fb > 0 ? fb : 0
        if (na !== nb) return na - nb
        return nodes.indexOf(a) - nodes.indexOf(b)
      })
    }

    function scrollToPost(post, block) {
      post?.scrollIntoView({
        behavior: window.matchMedia('(prefers-reduced-motion: reduce)').matches ? 'auto' : 'smooth',
        block: block || 'start',
      })
    }

    function bindTimeline(timeline) {
      if (timeline.dataset.bound) return
      timeline.dataset.bound = '1'
      timeline.querySelector('.lsb-shell-edge[data-timeline-edge="start"]').addEventListener('click', () => {
        scrollToPost(topicPosts()[0], 'start')
      })
      timeline.querySelector('.lsb-shell-edge[data-timeline-edge="end"]').addEventListener('click', () => {
        scrollToPost(topicPosts().at(-1), 'center')
      })
      timeline.querySelector('.lsb-shell-track').addEventListener('click', (event) => {
        const posts = topicPosts()
        if (!posts.length) return
        const rect = event.currentTarget.getBoundingClientRect()
        const ratio = rect.height > 0 ? Math.min(1, Math.max(0, (event.clientY - rect.top) / rect.height)) : 0
        scrollToPost(posts[Math.round(ratio * Math.max(0, posts.length - 1))], 'center')
      })
    }

    function ensureTimeline(shellEl) {
      const onTopic = getPage()?.type === 'topic' && topicPosts().length > 0
      let timeline = shellEl.querySelector('#lsb-shell-timeline')
      if (!onTopic) {
        if (timeline) timeline.hidden = true
        return null
      }
      if (!timeline) {
        timeline = document.createElement('nav')
        timeline.id = 'lsb-shell-timeline'
        timeline.setAttribute('aria-label', '楼层')
        timeline.innerHTML = `
          <button type="button" class="lsb-shell-edge" data-timeline-edge="start">主帖</button>
          <div class="lsb-shell-now"><strong data-timeline-current>主帖</strong><span data-timeline-date></span></div>
          <button type="button" class="lsb-shell-track" data-timeline-track role="scrollbar" aria-label="楼层轨道" aria-orientation="vertical" aria-valuemin="0" aria-valuemax="100" aria-valuenow="0">
            <span class="lsb-shell-thumb" aria-hidden="true"></span>
          </button>
          <div data-timeline-total></div>
          <button type="button" class="lsb-shell-edge" data-timeline-edge="end">最新</button>`
        shellEl.append(timeline)
        bindTimeline(timeline)
      }
      timeline.hidden = false
      return timeline
    }

    function currentTimelinePost(posts) {
      if (!posts.length) return { post: null, index: 0 }
      const offset = 56
      let index = 0
      for (let i = 0; i < posts.length; i += 1) {
        if (posts[i].getBoundingClientRect().top <= offset) index = i
        else break
      }
      return { post: posts[index], index }
    }

    function updateTimeline() {
      timelineRaf = 0
      if (!hasPerfProbe()) {
        updateTimelineBody()
        return
      }
      const t0 = performance.now()
      try {
        updateTimelineBody()
      } finally {
        perfEmitTimeline(performance.now() - t0)
      }
    }

    function updateTimelineBody() {
      const doc = typeof document !== 'undefined' ? document : null
      const timeline = doc?.querySelector?.('#lsb-shell-timeline')
      if (!timeline || !isEnabled()) return
      const posts = topicPosts()
      if (!posts.length) {
        timeline.hidden = true
        return
      }
      timeline.hidden = false
      const { post, index } = currentTimelinePost(posts)
      const floor = Number(post?.dataset?.floor)
      const progress = posts.length > 1 ? (index / (posts.length - 1)) * 100 : 0
      timeline.style.setProperty('--lsb-timeline-progress', `${progress}%`)
      timeline.querySelector('[data-timeline-current]').textContent =
        Number.isFinite(floor) && floor > 1 ? `#${floor}` : '主帖'
      const time = post?.querySelector('time, span[data-performance-time], .post-time')
      timeline.querySelector('[data-timeline-date]').textContent = (time?.textContent || '').trim().slice(0, 24)
      timeline.querySelector('[data-timeline-total]').textContent = `${Math.max(0, posts.length - 1)} 条回复`
      const track = timeline.querySelector('.lsb-shell-track')
      track.setAttribute('aria-valuenow', String(Math.round(progress)))
    }

    function scheduleTimeline() {
      if (timelineRaf) return
      const requestFrame = window.requestAnimationFrame
      timelineRaf = typeof requestFrame === 'function'
        ? requestFrame.call(window, updateTimeline)
        : window.setTimeout(updateTimeline, 16)
    }

    function bindWindow() {
      if (windowListening) return
      windowListening = true
      window.addEventListener('scroll', scheduleTimeline, { passive: true })
      window.addEventListener('resize', scheduleTimeline)
    }

    function unbindWindow() {
      if (!windowListening) return
      windowListening = false
      window.removeEventListener('scroll', scheduleTimeline)
      window.removeEventListener('resize', scheduleTimeline)
    }

    function perfEmitTimeline(ms) {
      if (ms < 8) return
      const sec = Math.floor(Date.now() / 1000)
      if (sec !== timelineEmitSec) {
        timelineEmitSec = sec
        timelineEmitN = 0
      }
      if (timelineEmitN >= 2) return
      timelineEmitN += 1
      emitPerf('timeline.update', ms)
    }

    function cancelPending() {
      if (timelineRaf) {
        const cancel = window.cancelAnimationFrame || window.clearTimeout
        cancel(timelineRaf)
        timelineRaf = 0
      }
    }

    return { ensure: ensureTimeline, schedule: scheduleTimeline, bind: bindWindow, unbind: unbindWindow, cancelPending }
  }
  // Owns canvas text selection, native context actions, and dismissal lifecycle.
  function createSkinSelectionController({ window, document, ui, getPill, getSurfaceHost, getActiveSheet, restoreFocus, getViewport, nextZIndex }) {
    const { Element, HTMLElement, SVGElement, navigator } = window
    let canvasSelectionBound = false
    let canvasSelectionHandler = null
    let canvasSelectionPost = null
    let canvasSelectionText = ''
    let canvasSelectionDismissTimer = 0

    function canvasCloseContextPill(restore = false) {
      const pill = getPill()
      if (pill) {
        pill.setAttribute('data-canvas-surface-state', 'closing')
        pill.hidden = true
        pill.setAttribute('aria-hidden', 'true')
        pill.setAttribute('data-canvas-surface-state', 'closed')
      }
      canvasSelectionPost = null
      canvasSelectionText = ''
      if (canvasSelectionDismissTimer) {
        window.clearTimeout(canvasSelectionDismissTimer)
        canvasSelectionDismissTimer = 0
      }
      if (restore) restoreFocus()
    }

    function canvasNativeAction(action) {
      const post = canvasSelectionPost
      const text = canvasSelectionText
      if (!(post instanceof Element)) return
      const clickFirst = (selectors) => {
        for (const selector of selectors) {
          const target = post.querySelector(selector) || document.querySelector(selector)
          if (target instanceof HTMLElement || target instanceof SVGElement) {
            target.click?.()
            target.focus?.()
            return true
          }
        }
        return false
      }
      if (action === 'reply') {
        clickFirst(['.reply-box', '.post-reply', '[data-reply-action]'])
          || clickFirst(['.reply-panel textarea[name="body"]', '.reply-panel textarea', 'textarea[name="body"]', '.btn-post[href="#reply"]'])
      } else if (action === 'quote') {
        clickFirst(['.quote-reply', '[data-quote-action]', 'a[href="#reply"]'])
      } else if (action === 'favorite') {
        clickFirst(['.favorite-action', '[data-favorite-action]', '.topic-favorites-action .fav-btn', '.topic-favorites-action button'])
      } else if (action === 'copy' && text) {
        try {
          const clipboard = navigator.clipboard
          if (clipboard?.writeText) void clipboard.writeText(text)
          else {
            const area = document.createElement('textarea')
            area.value = text
            area.setAttribute('aria-hidden', 'true')
            area.style.cssText = 'position:fixed;left:-9999px;top:0'
            document.body.append(area)
            area.select()
            document.execCommand?.('copy')
            area.remove()
          }
          ui.toast?.('已复制选中文本', { type: 'success' })
        } catch {
          ui.toast?.('复制失败，请手动选择文本', { type: 'error' })
        }
      }
    }

    function canvasShowContextPill(post, range) {
      const pill = getPill()
      if (!(pill instanceof Element) || !(post instanceof Element)) return
      const text = String(window.getSelection?.()?.toString?.() || '').trim()
      if (!text) return canvasCloseContextPill()
      const rect = range?.getBoundingClientRect?.() || post.getBoundingClientRect?.()
      canvasSelectionPost = post
      canvasSelectionText = text.slice(0, 2000)
      pill.hidden = false
      pill.setAttribute('aria-hidden', 'false')
      const zIndex = nextZIndex()
      pill.style.zIndex = String(8020 + zIndex)
      const viewport = getViewport()
      const width = Math.min(260, Math.max(180, pill.getBoundingClientRect?.().width || 220))
      const height = Math.max(36, pill.getBoundingClientRect?.().height || 42)
      const x = Math.min(Math.max(8, Number(rect?.left || 0)), Math.max(8, viewport.width - width - 8))
      const y = Math.min(Math.max(8, Number(rect?.bottom || 0) + 8), Math.max(8, viewport.height - height - 8))
      pill.style.left = `${Math.round(x)}px`
      pill.style.top = `${Math.round(y)}px`
      pill.style.right = 'auto'
      pill.style.bottom = 'auto'
      if (canvasSelectionDismissTimer) window.clearTimeout(canvasSelectionDismissTimer)
      canvasSelectionDismissTimer = window.setTimeout(() => {
        canvasSelectionDismissTimer = 0
        if (!pill.matches(':focus-within')) canvasCloseContextPill()
      }, 8000)
    }

    function canvasSelectionSync() {
      if (!getSurfaceHost() || getActiveSheet() === 'context-pill') return
      const selection = window.getSelection?.()
      const text = String(selection?.toString?.() || '').trim()
      const node = selection?.anchorNode
      const post = node?.nodeType === 1 ? node.closest?.('.post-entry, .post-item') : node?.parentElement?.closest?.('.post-entry, .post-item')
      if (!text || !(post instanceof Element) || !document.documentElement.contains(post)) {
        if (!getPill()?.matches(':focus-within')) canvasCloseContextPill()
        return
      }
      canvasShowContextPill(post, selection.getRangeAt?.(0))
    }

    function canvasBindSelection() {
      if (canvasSelectionBound) return
      canvasSelectionBound = true
      canvasSelectionHandler = () => {
        const raf = window.requestAnimationFrame || ((fn) => window.setTimeout(fn, 0))
        raf(canvasSelectionSync)
      }
      document.addEventListener('selectionchange', canvasSelectionHandler, { passive: true })
      document.addEventListener('pointerup', canvasSelectionHandler, { passive: true })
    }

    function canvasUnbindSelection() {
      if (!canvasSelectionBound) return
      canvasSelectionBound = false
      if (canvasSelectionHandler) {
        document.removeEventListener('selectionchange', canvasSelectionHandler)
        document.removeEventListener('pointerup', canvasSelectionHandler)
      }
      canvasSelectionHandler = null
      canvasCloseContextPill()
    }

    return { close: canvasCloseContextPill, act: canvasNativeAction, bind: canvasBindSelection, unbind: canvasUnbindSelection }
  }
  // Coordinates canvas appearance controls with the existing config and media controllers.
  function createSkinAppearanceController({
    window, document, ui, configController, mediaController,
    getSurfaceHost, getSurface, getShell, locationText,
    saveState, applyTokens, syncMedia, applySurfaceModes,
  }) {
    const { Element } = window

    function canvasSyncAppearance(feedback = '') {
      if (!(getSurfaceHost() instanceof Element)) return
      const appearance = configController.effective?.appearance || {}
      const status = getSurface('appearance-sheet')?.querySelector('[data-canvas-appearance-status]')
      const presetLabels = {
        'native-site': 'D 原生站点',
        'balanced-glass': 'A 平衡玻璃',
        'immersive-video': 'B 沉浸视频',
        'static-readable': 'C 静态可读',
      }
      if (status) status.textContent = feedback || `当前预设：${presetLabels[configController.effective?.preset] || presetLabels['balanced-glass']}`
      for (const button of getSurface('appearance-sheet')?.querySelectorAll('[data-canvas-preset]') || []) {
        button.setAttribute('aria-pressed', button.getAttribute('data-canvas-preset') === (configController.effective?.preset || 'balanced-glass') ? 'true' : 'false')
      }
      const backgroundMode = String(appearance.background || 'static') === 'image'
        ? 'image'
        : String(appearance.background || 'static') === 'video' ? 'video' : 'original'
      for (const button of getSurface('appearance-sheet')?.querySelectorAll('[data-canvas-background]') || []) {
        button.setAttribute('aria-pressed', button.getAttribute('data-canvas-background') === backgroundMode ? 'true' : 'false')
      }
      for (const input of getSurface('appearance-sheet')?.querySelectorAll('[data-canvas-appearance]') || []) {
        const key = input.getAttribute('data-canvas-appearance')
        if (!key || document.activeElement === input) continue
        if (appearance[key] != null) input.value = String(appearance[key])
      }
      const siteSummary = getSurface('site-card')?.querySelector('[data-canvas-site-summary]')
      if (siteSummary) siteSummary.textContent = `${configController.siteKey.replace(/^https?:\/\//, '')} · ${locationText()}`
      getShell()?.style.setProperty('--lsb-canvas-current-opacity', String(appearance.opacity ?? .72))
    }

    function canvasCommitAppearanceControls() {
      const controls = getSurface('appearance-sheet')?.querySelectorAll('[data-canvas-appearance]') || []
      const values = [...controls].map((input) => [input.getAttribute('data-canvas-appearance'), input.value])
      for (const [key, value] of values) {
        const input = [...controls].find((node) => node.getAttribute('data-canvas-appearance') === key)
        if (!key || String(configController.effective?.appearance?.[key] ?? '') === String(value ?? '')) continue
        canvasSetAppearance(key, value, { defer: true })
      }
      saveState()
      applyTokens()
      canvasSyncAppearance()
      syncMedia()
    }

    function canvasSaveAppearance() {
      if (!configController.state) return
      canvasCommitAppearanceControls()
      canvasSyncAppearance('\u5916\u89c2\u5df2\u4fdd\u5b58')
    }

    function canvasSetAppearance(name, value, options = {}) {
      if (!configController.setAppearance(name, value, options) || options.defer) return
      applyTokens()
      canvasSyncAppearance()
      syncMedia()
    }

    function canvasSetBackgroundMode(mode) {
      if (!configController.setBackgroundMode(mode)) return
      canvasSyncAppearance()
      syncMedia()
    }

    async function canvasSaveMediaFile(kind, file) {
      if (!file || !ui.shellMedia?.validateMediaFile) return
      const check = ui.shellMedia.validateMediaFile(file, { kind })
      if (!check.ok) {
        ui.toast?.(kind === 'video' ? '视频文件超过 50MB 或类型不受支持' : kind === 'image' ? '图片文件超过 20MB 或类型不受支持' : '字体文件超过 10MB 或类型不受支持', { type: 'error' })
        return
      }
      try {
        const key = await mediaController.saveFile(kind, file)
        if (!configController.setMediaKey(kind, key)) return
        canvasSyncAppearance()
        syncMedia()
        ui.toast?.('本地资源已保存并应用', { type: 'success' })
      } catch (error) {
        if (error?.name === 'AbortError') return
        ui.toast?.('本地资源保存失败，已保留当前外观', { type: 'error' })
      }
    }

    function canvasChoosePreset(preset) {
      if (!configController.choosePreset(preset)) return
      applyTokens()
      canvasSyncAppearance()
      syncMedia()
    }

    function canvasResetAppearance() {
      if (!configController.resetAppearance()) return
      applyTokens()
      canvasSyncAppearance()
      syncMedia()
    }

    function canvasResetLayout() {
      if (!configController.resetLayout()) return
      applySurfaceModes()
    }

    function bindAppearanceControls() {
      const presets = getSurface('appearance-sheet')?.querySelectorAll('[data-canvas-preset]') || []
      for (const button of presets) {
        if (button.dataset.canvasBound === '1') continue
        button.dataset.canvasBound = '1'
        button.addEventListener('click', () => canvasChoosePreset(button.getAttribute('data-canvas-preset')))
      }
      const backgroundButtons = getSurface('appearance-sheet')?.querySelectorAll('[data-canvas-background]') || []
      for (const button of backgroundButtons) {
        if (button.dataset.canvasBound === '1') continue
        button.dataset.canvasBound = '1'
        button.addEventListener('click', () => canvasSetBackgroundMode(button.getAttribute('data-canvas-background')))
      }
      const controls = getSurface('appearance-sheet')?.querySelectorAll('[data-canvas-appearance]') || []
      for (const input of controls) {
        if (input.dataset.canvasBound === '1') continue
        input.dataset.canvasBound = '1'
        const update = () => {
          canvasSetAppearance(input.getAttribute('data-canvas-appearance'), input.value)
        }
        input.addEventListener(input.type === 'range' ? 'input' : 'change', update)
      }
      const mediaInputs = getSurface('appearance-sheet')?.querySelectorAll('[data-canvas-media-file]') || []
      for (const input of mediaInputs) {
        if (input.dataset.canvasBound === '1') continue
        input.dataset.canvasBound = '1'
        input.addEventListener('change', () => {
          const file = input.files?.[0]
          void canvasSaveMediaFile(input.getAttribute('data-canvas-media-file'), file).finally(() => { input.value = '' })
        })
      }
      const resetAppearance = getSurface('appearance-sheet')?.querySelector('[data-canvas-reset-appearance]')
      const resetLayout = getSurface('appearance-sheet')?.querySelector('[data-canvas-reset-layout]')
      const saveAppearance = getSurface('appearance-sheet')?.querySelector('[data-canvas-save-appearance]')
      if (saveAppearance && saveAppearance.dataset.canvasBound !== '1') {
        saveAppearance.dataset.canvasBound = '1'
        saveAppearance.addEventListener('click', canvasSaveAppearance)
      }
      if (resetAppearance && resetAppearance.dataset.canvasBound !== '1') {
        resetAppearance.dataset.canvasBound = '1'
        resetAppearance.addEventListener('click', canvasResetAppearance)
      }
      if (resetLayout && resetLayout.dataset.canvasBound !== '1') {
        resetLayout.dataset.canvasBound = '1'
        resetLayout.addEventListener('click', canvasResetLayout)
      }
    }

    return { sync: canvasSyncAppearance, bind: bindAppearanceControls }
  }
  // Owns canvas surface geometry and pointer/keyboard layout interactions.
  function createSkinSurfaceLayoutController({
    window, configController, getSurfaceHost, getSurface, getViewport, stateApi,
    persistRect, setSiteStatusExpanded, syncSiteSidebar, nextZIndex, closeSurface,
  }) {
    const { Element, HTMLElement } = window
    const { CANVAS_DEFAULT_SURFACES, resolveSurfaceMode, clampSurfaceRect } = stateApi
    let canvasDragState = null
    let canvasDragRaf = 0

    function canvasSurfaceRect(surface) {
      if (!(surface instanceof Element)) return { x: 0, y: 0, width: 320, height: 240 }
      const rect = surface.getBoundingClientRect?.()
      const parse = (value, fallback) => Number.isFinite(Number(value)) && Number(value) > 0 ? Number(value) : fallback
      return {
        x: parse(rect?.left, parseFloat(surface.style.left) || 0),
        y: parse(rect?.top, parseFloat(surface.style.top) || 0),
        width: parse(rect?.width, parseFloat(surface.style.width) || 420),
        height: parse(rect?.height, parseFloat(surface.style.height) || 560),
      }
    }

    function canvasApplySurfaceModes() {
      if (!(getSurfaceHost() instanceof Element)) return
      for (const id of ['ai-card', 'site-card', 'evidence-card']) {
        const surface = getSurface(id)
        if (!(surface instanceof Element)) continue
        const mode = resolveSurfaceMode(configController.widthClass, id)
        surface.dataset.surfaceMode = mode
        const resizeHandle = surface.querySelector('[data-canvas-resize-handle]')
        if (resizeHandle instanceof HTMLElement) resizeHandle.hidden = mode === 'rail'
        const stored = configController.effective?.layout?.[configController.widthClass]?.[id]
        if (mode === 'floating') {
          const viewport = getViewport()
          const defaultKey = id === 'ai-card' ? 'aiCard' : id === 'site-card' ? 'siteCard' : 'evidenceCard'
          const configured = configController.effective?.surfaceDefaults?.[defaultKey] || CANVAS_DEFAULT_SURFACES[defaultKey] || {}
          const minimum = id === 'ai-card' ? { width: 320, height: 260 } : { width: 240, height: 160 }
          const fallback = {
            x: Math.max(0, viewport.width - Math.max(minimum.width, Number(configured.width) || 420) - 24),
            y: 88,
            width: Number(configured.width) || 420,
            height: Number(configured.height) || 560,
          }
          const rect = clampSurfaceRect(stored || fallback, viewport, minimum)
          surface.style.left = `${rect.x}px`
          surface.style.top = `${rect.y}px`
          surface.style.width = String(rect.width) + 'px'
          if (id === 'site-card' && !stored) surface.style.removeProperty('height')
          else surface.style.height = String(rect.height) + 'px'
          surface.style.right = 'auto'
          surface.style.bottom = 'auto'
        } else if (mode === 'rail') {
          for (const prop of ['left', 'top', 'width', 'height', 'right', 'bottom']) surface.style.removeProperty(prop)
          const statusOwnsSiteCard = id === 'site-card' && configController.widthClass === 'wide'
          surface.hidden = statusOwnsSiteCard
          surface.setAttribute('aria-hidden', String(statusOwnsSiteCard))
          surface.setAttribute('data-canvas-surface-state', statusOwnsSiteCard ? 'closed' : 'open')
        } else {
          for (const prop of ['left', 'top', 'width', 'height', 'right', 'bottom']) surface.style.removeProperty(prop)
        }
      }
      const statusHost = getSurface('site-status')?.querySelector('[data-canvas-site-status-host]')
      if (statusHost instanceof Element && configController.widthClass !== 'wide') setSiteStatusExpanded(statusHost, false, false)
      if (configController.widthClass === 'wide') syncSiteSidebar()
    }

    function canvasEndDrag(commit = true) {
      const state = canvasDragState
      if (!state) return
      if (canvasDragRaf) {
        const cancel = window.cancelAnimationFrame || window.clearTimeout
        cancel(canvasDragRaf)
        canvasDragRaf = 0
      }
      window.removeEventListener('pointermove', state.move)
      window.removeEventListener('pointerup', state.up)
      window.removeEventListener('pointercancel', state.cancel || state.up)
      state.surface.removeAttribute('data-canvas-dragging')
      const finalRect = clampSurfaceRect({
        ...state.start,
        x: state.start.x + (state.kind === 'resize' ? 0 : state.dx),
        y: state.start.y + (state.kind === 'resize' ? 0 : state.dy),
        width: state.start.width + (state.kind === 'resize' ? state.dx : 0),
        height: state.start.height + (state.kind === 'resize' ? state.dy : 0),
      }, getViewport(), { width: 320, height: 220 })
      state.surface.style.transform = ''
      if (commit) {
        state.surface.style.left = `${finalRect.x}px`
        state.surface.style.top = `${finalRect.y}px`
        if (state.kind === 'resize') {
          state.surface.style.width = `${finalRect.width}px`
          state.surface.style.height = `${finalRect.height}px`
        }
        persistRect(state.id, finalRect)
      } else {
        state.surface.style.left = `${state.start.x}px`
        state.surface.style.top = `${state.start.y}px`
        if (state.kind === 'resize') {
          if (state.styleWidth) state.surface.style.width = state.styleWidth
          else state.surface.style.removeProperty('width')
          if (state.styleHeight) state.surface.style.height = state.styleHeight
          else state.surface.style.removeProperty('height')
        }
      }
      state.surface.releasePointerCapture?.(state.pointerId)
      canvasDragState = null
    }

    function canvasBeginDrag(event, surface) {
      if (!(surface instanceof Element) || surface.dataset.surfaceMode !== 'floating') return
      if (event.button != null && event.button !== 0) return
      if (event.target?.closest?.('[data-canvas-close],button,input,textarea,select,a')) return
      const start = canvasSurfaceRect(surface)
      const pointerId = event.pointerId
      const state = { id: surface.getAttribute('data-surface') || '', surface, start, dx: 0, dy: 0, pointerId, move: null, up: null }
      state.move = (moveEvent) => {
        if (pointerId != null && moveEvent.pointerId != null && moveEvent.pointerId !== pointerId) return
        state.dx = Number(moveEvent.clientX || 0) - Number(event.clientX || 0)
        state.dy = Number(moveEvent.clientY || 0) - Number(event.clientY || 0)
        if (canvasDragRaf) return
        const raf = window.requestAnimationFrame || ((fn) => window.setTimeout(fn, 0))
        canvasDragRaf = raf(() => {
          canvasDragRaf = 0
          if (state.kind === 'resize') {
            surface.style.width = `${Math.max(1, Math.round(state.start.width + state.dx))}px`
            surface.style.height = `${Math.max(1, Math.round(state.start.height + state.dy))}px`
          } else {
            surface.style.transform = `translate3d(${Math.round(state.dx)}px,${Math.round(state.dy)}px,0)`
          }
        })
      }
      state.up = () => canvasEndDrag(true)
      state.cancel = () => canvasEndDrag(false)
      canvasDragState = state
      surface.dataset.canvasDragging = 'true'
      surface.setPointerCapture?.(pointerId)
      window.addEventListener('pointermove', state.move)
      window.addEventListener('pointerup', state.up, { once: true })
      window.addEventListener('pointercancel', state.cancel, { once: true })
      event.preventDefault?.()
    }

    function canvasBeginResize(event, surface) {
      if (!(surface instanceof Element) || surface.dataset.surfaceMode !== 'floating') return
      if (event.button != null && event.button !== 0) return
      const start = canvasSurfaceRect(surface)
      const pointerId = event.pointerId
      const state = { id: surface.getAttribute('data-surface') || '', surface, start, styleWidth: surface.style.width, styleHeight: surface.style.height, dx: 0, dy: 0, pointerId, kind: 'resize', move: null, up: null }
      state.move = (moveEvent) => {
        if (pointerId != null && moveEvent.pointerId != null && moveEvent.pointerId !== pointerId) return
        state.dx = Number(moveEvent.clientX || 0) - Number(event.clientX || 0)
        state.dy = Number(moveEvent.clientY || 0) - Number(event.clientY || 0)
        if (canvasDragRaf) return
        const raf = window.requestAnimationFrame || ((fn) => window.setTimeout(fn, 0))
        canvasDragRaf = raf(() => {
          canvasDragRaf = 0
          surface.style.width = `${Math.max(1, Math.round(state.start.width + state.dx))}px`
          surface.style.height = `${Math.max(1, Math.round(state.start.height + state.dy))}px`
        })
      }
      state.up = () => canvasEndDrag(true)
      state.cancel = () => canvasEndDrag(false)
      canvasDragState = state
      surface.dataset.canvasDragging = 'true'
      surface.setPointerCapture?.(pointerId)
      window.addEventListener('pointermove', state.move)
      window.addEventListener('pointerup', state.up, { once: true })
      window.addEventListener('pointercancel', state.cancel, { once: true })
      event.preventDefault?.()
    }

    function canvasKeyboardMove(event, surface) {
      if (!(surface instanceof Element) || surface.dataset.surfaceMode !== 'floating') return
      const id = surface.getAttribute('data-surface') || ''
      const current = canvasSurfaceRect(surface)
      const step = event.shiftKey ? 16 : 8
      let next = { ...current }
      if (event.shiftKey && event.key === 'ArrowLeft') next.width -= step
      else if (event.shiftKey && event.key === 'ArrowRight') next.width += step
      else if (event.shiftKey && event.key === 'ArrowUp') next.height -= step
      else if (event.shiftKey && event.key === 'ArrowDown') next.height += step
      else if (event.key === 'ArrowLeft') next.x -= step
      else if (event.key === 'ArrowRight') next.x += step
      else if (event.key === 'ArrowUp') next.y -= step
      else if (event.key === 'ArrowDown') next.y += step
      else if (event.key === 'Home') {
        surface.style.zIndex = String(8010 + nextZIndex())
        event.preventDefault()
        return
      }
      else if (event.key === 'End') {
        surface.style.zIndex = '8000'
        event.preventDefault()
        return
      }
      else if (event.key === 'Escape') { closeSurface(id); return }
      else return
      event.preventDefault()
      const clean = clampSurfaceRect(next, getViewport(), { width: 320, height: 220 })
      surface.style.left = `${clean.x}px`
      surface.style.top = `${clean.y}px`
      persistRect(id, clean)
    }

    return {
      applyModes: canvasApplySurfaceModes, endDrag: canvasEndDrag,
      beginDrag: canvasBeginDrag, beginResize: canvasBeginResize, keyboardMove: canvasKeyboardMove,
      get dragging() { return !!canvasDragState },
    }
  }
  // Owns canvas scroll targets, frame scheduling, and window listener lifecycle.
  function createSkinCanvasScrollController({
    window, document, getSurface, getViewport, isAsideWide, getContentScroller,
    syncScrollBridge, updateProfileScroll, applyPageClass, applySurfaceModes,
  }) {
    const { Element } = window
    let canvasScrollBound = false
    let canvasScrollLast = 0
    let canvasScrollRaf = 0
    let canvasScrollHandler = null
    let canvasResizeHandler = null
    let canvasScrollTarget = null

    function canvasScrollSync() {
      canvasScrollRaf = 0
      const y = canvasScrollY()
      const status = getSurface('top-status')
      if (!status) return
      const previous = canvasScrollLast
      const down = y > previous + 2
      const up = y < previous - 2
      canvasScrollLast = y
      if (down || up) status.dataset.compact = down && y > 48 ? 'true' : 'false'
      updateProfileScroll(y, previous)
    }

    function canvasHomeScrollRoot() {
      const root = document.documentElement
      const canvasMode = root.classList.contains('lsb-canvas-mode')
      if (!root.classList.contains('lsb-skin-shell-on')) return null
      if (!root.classList.contains('lsb-skin-shell-home')) return null
      if (canvasMode) {
        if (!root.classList.contains('lsb-canvas-page-home')) return null
        if (getViewport().width < 700) return null
      } else if (!isAsideWide()) {
        return null
      }
      const panel = canvasMode
        ? document.querySelector('.lsb-canvas-content-root > .home-shell .main-panel')
        : document.querySelector('body > main.wrap .home-shell .main-panel')
      return panel instanceof Element ? panel : null
    }

    function canvasScrollRoot() {
      return canvasHomeScrollRoot() || (getContentScroller() instanceof Element ? getContentScroller() : null)
    }

    function canvasSyncScrollTarget() {
      const next = canvasScrollRoot()
      syncScrollBridge(next)
      if (next === canvasScrollTarget) return
      const previousTarget = canvasScrollTarget
      const carryX = !(previousTarget instanceof Element) && next instanceof Element
        ? Number(window.scrollX || document.documentElement?.scrollLeft || 0)
        : 0
      const carryY = !(previousTarget instanceof Element) && next instanceof Element
        ? Number(window.scrollY || document.documentElement?.scrollTop || 0)
        : 0
      if (previousTarget instanceof Element && canvasScrollHandler) {
        previousTarget.removeEventListener('scroll', canvasScrollHandler)
      }
      canvasScrollTarget = next
      if (canvasScrollTarget instanceof Element) {
        if (carryX > 0 && Number(canvasScrollTarget.scrollLeft || 0) === 0) canvasScrollTarget.scrollLeft = carryX
        if (carryY > 0 && Number(canvasScrollTarget.scrollTop || 0) === 0) canvasScrollTarget.scrollTop = carryY
        if (canvasScrollHandler) canvasScrollTarget.addEventListener('scroll', canvasScrollHandler, { passive: true })
      }
      canvasScrollLast = canvasScrollY()
    }

    function canvasScrollY() {
      if (canvasScrollTarget instanceof Element) return Number(canvasScrollTarget.scrollTop || 0)
      return Number(window.scrollY || document.documentElement?.scrollTop || 0)
    }

    function canvasScheduleScroll() {
      if (canvasScrollRaf) return
      const raf = window.requestAnimationFrame || ((fn) => window.setTimeout(fn, 0))
      canvasScrollRaf = raf(canvasScrollSync)
    }

    function canvasBindWindow() {
      if (canvasScrollBound) return
      canvasScrollBound = true
      canvasScrollHandler = canvasScheduleScroll
      canvasResizeHandler = () => {
        applyPageClass()
        applySurfaceModes()
        canvasScheduleScroll()
      }
      window.addEventListener('scroll', canvasScrollHandler, { passive: true })
      window.addEventListener('resize', canvasResizeHandler)
      canvasSyncScrollTarget()
      canvasScrollLast = canvasScrollY()
      updateProfileScroll(canvasScrollLast, canvasScrollLast)
    }

    function canvasUnbindWindow() {
      if (!canvasScrollBound) return
      canvasScrollBound = false
      if (canvasScrollHandler) window.removeEventListener('scroll', canvasScrollHandler)
      if (canvasResizeHandler) window.removeEventListener('resize', canvasResizeHandler)
      canvasScrollTarget?.removeEventListener('scroll', canvasScrollHandler)
      canvasScrollHandler = null
      canvasResizeHandler = null
      canvasScrollTarget = null
      if (canvasScrollRaf) {
        const cancel = window.cancelAnimationFrame || window.clearTimeout
        cancel(canvasScrollRaf)
        canvasScrollRaf = 0
      }
    }

    return {
      homeRoot: canvasHomeScrollRoot, syncTarget: canvasSyncScrollTarget,
      schedule: canvasScheduleScroll, bind: canvasBindWindow, unbind: canvasUnbindWindow,
      get bound() { return canvasScrollBound },
      get target() { return canvasScrollTarget },
    }
  }
  // Owns the existing shared-window compatibility layout and interaction state.
  function createSkinWindowController({
    window, document, ui, store, configController, contentController, layoutApi, styleApi,
    getLocation, getAsideContext, getAsidePreferredId, getAsideActiveId, setAsideActive, findOutlet, clone,
  }) {
    const { Element } = window
    let shellWindowLayout = null
    let shellWindowRegistry = []
    let shellLayoutKey = ''
    let shellLayoutSaveTimer = 0
    let windowInteractionBound = false
    let windowInteractionState = null
    let windowInteractionRaf = 0
    let responsiveBound = false
    let responsiveHandler = null
    let narrowActiveWindow = 'content'
    const externalWindowViews = new Map()
    const LAYOUT_MIGRATION_KEY = 'layoutMigrationVersion'
    const LAYOUT_MIGRATION_VERSION = 1
    const LAYOUT_SAVE_DEBOUNCE = 150
    const BUILTIN_WINDOWS = Object.freeze([
      { id: 'nav', label: '导航', order: 10, min: { width: 200, height: 160 }, defaultRect: { width: 240, height: 640 } },
      { id: 'content', label: '正文', order: 20, min: { width: 320, height: 240 }, defaultRect: { width: 720, height: 640 } },
      { id: 'site', label: '站点', order: 30, min: { width: 240, height: 160 }, defaultRect: { width: 280, height: 640 } },
    ])

    function shellWindowEnabled() {
      return false
    }

    function shellWorkspace(el = document.getElementById('lsb-shell')) {
      return el?.querySelector?.('[data-lsb-shell-workspace]') || null
    }

    function shellViewport(workspace) {
      const width = Number(workspace?.clientWidth || window.innerWidth || document.documentElement?.clientWidth || 1)
      const height = Number(workspace?.clientHeight || (window.innerHeight || document.documentElement?.clientHeight || 1) - 48)
      return { width: Math.max(1, width), height: Math.max(1, height) }
    }

    function cssPixels(name, fallback) {
      try {
        const value = window.getComputedStyle(document.documentElement).getPropertyValue(name)
        const parsed = Number.parseFloat(value)
        return Number.isFinite(parsed) ? parsed : fallback
      } catch {
        return fallback
      }
    }

    function shellLayoutStorageKey(viewport = shellViewport(shellWorkspace())) {
      if (!layoutApi) return ''
      const bucket = layoutApi.widthBucket(viewport.width)
      return layoutApi.layoutStorageKey(getLocation().origin, bucket)
    }

    function readLegacyShellLayout() {
      return {
        header: cssPixels('--lsb-shell-header', 48),
        rail: cssPixels('--lsb-shell-rail', 240),
        aside: cssPixels('--lsb-shell-aside', 280),
        asideActiveId: getAsidePreferredId(),
      }
    }

    function saveShellLayout({ immediate = false } = {}) {
      if (!shellWindowLayout || !shellLayoutKey || !layoutApi) return null
      if (!immediate) {
        window.clearTimeout(shellLayoutSaveTimer)
        shellLayoutSaveTimer = window.setTimeout(() => {
          shellLayoutSaveTimer = 0
          saveShellLayout({ immediate: true })
        }, LAYOUT_SAVE_DEBOUNCE)
        return null
      }
      window.clearTimeout(shellLayoutSaveTimer)
      shellLayoutSaveTimer = 0
      const viewport = shellViewport(shellWorkspace())
      const clean = layoutApi.sanitizeShellLayout(shellWindowLayout, {
        ...viewport,
        registry: shellWindowRegistry,
      })
      clean.updatedAt = Date.now()
      shellWindowLayout = clean
      try {
        store.set(shellLayoutKey, clone(clean))
      } catch {
        /* 存储不可用时继续保留内存布局，不能阻塞壳。 */
      }
      return clone(clean)
    }

    function loadShellLayout(viewport = shellViewport(shellWorkspace())) {
      if (!layoutApi) return null
      const key = shellLayoutStorageKey(viewport)
      shellLayoutKey = key
      let stored = null
      try {
        stored = store.get(key, null)
      } catch {
        stored = null
      }
      if (stored && typeof stored === 'object' && stored.windows && typeof stored.windows === 'object') {
        const clean = layoutApi.sanitizeShellLayout(stored, {
          ...viewport,
          registry: shellWindowRegistry,
        })
        if (Object.keys(clean.windows).length) return clean
      }

      let migrationVersion = 0
      try { migrationVersion = Number(store.get(LAYOUT_MIGRATION_KEY, 0)) || 0 } catch { migrationVersion = 0 }
      if (!stored && migrationVersion < LAYOUT_MIGRATION_VERSION) {
        const migrated = layoutApi.migrateLegacyShellLayout({
          viewport,
          legacy: readLegacyShellLayout(),
          registry: shellWindowRegistry,
        })
        migrated.updatedAt = Date.now()
        try { store.set(LAYOUT_MIGRATION_KEY, LAYOUT_MIGRATION_VERSION) } catch { /* optional marker */ }
        return migrated
      }
      return layoutApi.defaultShellLayout({ ...viewport, registry: shellWindowRegistry })
    }

    function ensureRegisteredShellLayout(layout, viewport) {
      if (!layout || !layoutApi) return layout
      const defaults = layoutApi.defaultShellLayout({ ...viewport, registry: shellWindowRegistry })
      for (const [id, state] of Object.entries(defaults.windows || {})) {
        if (!layout.windows?.[id]) layout.windows[id] = state
        if (!layout.zOrder?.includes(id)) layout.zOrder.push(id)
      }
      return layout
    }

    function shellHost(id, el = document.getElementById('lsb-shell')) {
      if (id === 'nav') return el?.querySelector?.('#lsb-shell-rail') || null
      if (id === 'site') return el?.querySelector?.('#lsb-shell-aside') || null
      if (id === 'content') return el?.querySelector?.('#lsb-shell-window-content') || null
      const wanted = String(id || '')
      return [...(el?.querySelectorAll?.('[data-lsb-shell-window]') || [])]
        .find((node) => node.getAttribute('data-lsb-shell-window') === wanted) || null
    }

    function ensureWindowChrome(host, id, label) {
      if (!(host instanceof Element)) return null
      host.classList.add('lsb-shell-window')
      host.setAttribute('data-lsb-shell-window', id)
      host.setAttribute('role', 'region')
      if (!host.hasAttribute('tabindex')) host.tabIndex = 0
      const titleId = `lsb-shell-window-${id}-title`
      host.setAttribute('aria-labelledby', titleId)
      let bar = host.querySelector(':scope > [data-lsb-shell-window-bar]')
      if (!bar) {
        bar = document.createElement('div')
        bar.className = 'lsb-shell-window-bar'
        bar.setAttribute('data-lsb-shell-window-bar', '')
        const title = document.createElement('strong')
        title.className = 'lsb-shell-window-title'
        title.id = titleId
        title.textContent = label
        const drag = document.createElement('span')
        drag.className = 'lsb-shell-window-drag'
        drag.setAttribute('data-lsb-shell-window-drag', '')
        drag.setAttribute('aria-hidden', 'true')
        bar.append(title, drag)
        host.prepend(bar)
      } else {
        const title = bar.querySelector('.lsb-shell-window-title')
        if (title) title.textContent = label
      }
      const ensureAction = (kind, text, aria, titleText, handler) => {
        let button = bar.querySelector(`[data-lsb-shell-window-${kind}]`)
        if (!button) {
          button = document.createElement('button')
          button.type = 'button'
          button.className = 'lsb-shell-window-action'
          button.setAttribute(`data-lsb-shell-window-${kind}`, '')
          bar.append(button)
        }
        button.setAttribute('aria-label', aria)
        button.title = titleText
        button.textContent = text
        if (!button.dataset.lsbShellBound) {
          button.dataset.lsbShellBound = '1'
          button.addEventListener('click', (event) => {
            event.preventDefault()
            handler(button)
          })
        }
        return button
      }
      ensureAction('inspect', '⋮', `打开${label}窗口检查器`, '窗口检查器', () => {
        openWindowInspector(id)
      })
      ensureAction('focus', '◎', `聚焦${label}窗口`, '聚焦窗口', () => {
        focusShellWindow(id)
        host.focus?.()
      })
      ensureAction('collapse', '−', `折叠${label}窗口`, '折叠窗口', (button) => {
        toggleShellWindowCollapsed(id, button)
      })
      ensureAction('reset', '↺', `恢复${label}窗口布局`, '恢复布局', () => {
        resetShellWindow(id)
      })
      let body = host.querySelector(':scope > [data-lsb-shell-window-body]')
      if (!body) {
        body = document.createElement('div')
        body.className = 'lsb-shell-window-body'
        body.setAttribute('data-lsb-shell-window-body', '')
        while (bar.nextSibling) body.append(bar.nextSibling)
        host.append(body)
      }
      for (const edge of ['n', 'e', 's', 'w', 'ne', 'nw', 'se', 'sw']) {
        if (host.querySelector(`:scope > [data-lsb-shell-resize-edge="${edge}"]`)) continue
        const handle = document.createElement('span')
        handle.setAttribute('data-lsb-shell-resize-edge', edge)
        handle.setAttribute('aria-label', `调整${label}窗口${edge}边界`)
        handle.setAttribute('role', 'separator')
        host.append(handle)
      }
      return { host, bar, body }
    }

    function applyShellWindowState(id, state, host = shellHost(id)) {
      if (!(host instanceof Element) || !state) return
      host.style.left = `${Math.round(state.x || 0)}px`
      host.style.top = `${Math.round(state.y || 0)}px`
      host.style.width = `${Math.max(1, Math.round(state.width || 1))}px`
      host.style.height = `${Math.max(1, Math.round(state.height || 1))}px`
      host.style.zIndex = String(8000 + Math.max(0, shellWindowLayout?.zOrder?.indexOf(id) ?? 0))
      host.hidden = state.visible === false
      host.dataset.lsbShellActive = state.visible === false ? 'false' : 'true'
      host.dataset.lsbShellWindowId = id
      host.dataset.lsbShellCollapsed = state.collapsed === true ? 'true' : 'false'
      const localGlass = !!styleApi?.sanitizeTokenValue?.('glassOpacity', state.overrides?.glassOpacity)
        || !!styleApi?.sanitizeTokenValue?.('glassBlur', state.overrides?.glassBlur)
      host.dataset.lsbShellGlass = configController.config.glass || localGlass ? 'true' : 'false'
      const oldOverrideProps = host.__lsbShellOverrideProps || new Set()
      for (const prop of oldOverrideProps) host.style.removeProperty(prop)
      const nextOverrideProps = new Set()
      if (styleApi && state.overrides && typeof state.overrides === 'object') {
        const overrideCss = styleApi.tokenCss(state.overrides)
        for (const declaration of overrideCss.split(';')) {
          const index = declaration.indexOf(':')
          if (index <= 0) continue
          const prop = declaration.slice(0, index).trim()
          const value = declaration.slice(index + 1).trim()
          if (!prop.startsWith('--lsb-shell-') || !value) continue
          host.style.setProperty(prop, value)
          nextOverrideProps.add(prop)
        }
      }
      host.__lsbShellOverrideProps = nextOverrideProps
      const body = host.querySelector(':scope > [data-lsb-shell-window-body]')
      if (body) body.hidden = state.collapsed === true
      const collapse = host.querySelector(':scope > [data-lsb-shell-window-bar] [data-lsb-shell-window-collapse]')
      if (collapse) {
        collapse.textContent = state.collapsed === true ? '+' : '−'
        collapse.setAttribute('aria-label', state.collapsed === true ? '展开窗口' : '折叠窗口')
        collapse.title = state.collapsed === true ? '展开窗口' : '折叠窗口'
      }
    }

    function collectShellWindowRegistry(el = document.getElementById('lsb-shell')) {
      const externalViews = syncExternalShellWindows(el)
      const external = typeof ui.shellWindows === 'function'
        ? ui.shellWindows(getAsideContext())
        : []
      const records = [...BUILTIN_WINDOWS]
      for (const item of externalViews) {
        if (records.some((row) => row.id === item.id)) continue
        records.push({
          id: item.id,
          label: item.label || item.id,
          order: Number(item.order) || 100,
          min: item.min || { width: 320, height: 240 },
          defaultRect: item.defaultRect || { width: 376, height: 600 },
          view: item.view,
        })
      }
      for (const view of external) {
        const id = String(view.windowId || view.id || '')
        if (!id || records.some((row) => row.id === id)) continue
        records.push({
          id,
          label: view.label || id,
          order: Number(view.order) || 100,
          min: view.min || { width: 240, height: 160 },
          defaultRect: view.defaultRect || { width: 320, height: 480 },
          view,
        })
      }
      shellWindowRegistry = records.filter((row) => shellHost(row.id, el))
      return shellWindowRegistry
    }

    function applyShellWindowLayout(layout = shellWindowLayout) {
      if (!layout) return
      for (const [id, state] of Object.entries(layout.windows || {})) applyShellWindowState(id, state)
      const workspace = shellWorkspace()
      if (workspace) workspace.dataset.lsbShellBucket = layoutApi.widthBucket(shellViewport(workspace).width)
    }

    function syncExternalShellWindows(el = document.getElementById('lsb-shell')) {
      const workspace = shellWorkspace(el)
      if (!(workspace instanceof Element)) return []
      const context = getAsideContext()
      const asideRecords = ui.shellAsideViews(context)
        .filter((view) => view.windowId && view.windowId !== 'site')
        .map((view) => ({
          id: String(view.windowId),
          label: view.label || view.windowId,
          order: Number(view.order) || 100,
          min: view.min || { width: 320, height: 240 },
          defaultRect: view.defaultRect || { width: 376, height: 600 },
          view,
        }))
      const registered = typeof ui.shellWindows === 'function' ? ui.shellWindows(context) : []
      const records = [...asideRecords, ...registered.map((view) => ({
        id: String(view.windowId || view.id),
        label: view.label || view.id,
        order: Number(view.order) || 100,
        min: view.min || { width: 320, height: 240 },
        defaultRect: view.defaultRect || { width: 376, height: 600 },
        view,
      }))]
      const next = new Map()
      for (const record of records) {
        if (!record.id || next.has(record.id)) continue
        const host = shellHost(record.id, el) || (() => {
          const section = document.createElement('section')
          section.setAttribute('data-lsb-shell-window', record.id)
          workspace.append(section)
          return section
        })()
        ensureWindowChrome(host, record.id, record.label)
        const body = host.querySelector(':scope > [data-lsb-shell-window-body]')
        let current = externalWindowViews.get(record.id)
        if (!current || current.view !== record.view) {
          current?.dispose?.()
          body?.replaceChildren()
          let dispose = null
          try { dispose = record.view?.render?.(body, context) } catch (error) {
            if (body) body.textContent = '窗口加载失败'
            console.error('[LSB skin] 外部窗口渲染失败', record.id, error)
          }
          current = { ...record, host, body, dispose: typeof dispose === 'function' ? dispose : null }
        } else {
          current.host = host
          current.body = body
        }
        host.dataset.lsbShellExternal = 'true'
        host.dataset.lsbShellOpen = record.view?.windowId ? (record.view.id === getAsideActiveId() ? 'true' : 'false') : 'true'
        next.set(record.id, current)
      }
      for (const [id, current] of externalWindowViews) {
        if (next.has(id)) continue
        try { current.dispose?.() } catch (error) { console.error('[LSB skin] 外部窗口清理失败', id, error) }
        current.host?.remove?.()
      }
      externalWindowViews.clear()
      for (const [id, current] of next) externalWindowViews.set(id, current)
      return [...next.values()]
    }

    function focusShellWindow(id, { persist = true } = {}) {
      const wanted = String(id || '')
      if (!shellWindowLayout?.windows?.[wanted]) return ''
      shellWindowLayout.zOrder = [...(shellWindowLayout.zOrder || []).filter((item) => item !== wanted), wanted]
      applyShellWindowLayout(shellWindowLayout)
      if (persist) saveShellLayout()
      return wanted
    }

    function toggleShellWindowCollapsed(id, button = null) {
      const wanted = String(id || '')
      const current = shellWindowLayout?.windows?.[wanted]
      if (!current) return null
      current.collapsed = !current.collapsed
      applyShellWindowLayout(shellWindowLayout)
      if (button) button.focus?.()
      saveShellLayout({ immediate: true })
      return current.collapsed
    }

    function arrangeShellWindows() {
      if (!shellWindowLayout || !layoutApi) return null
      const workspace = shellWorkspace()
      shellWindowLayout = layoutApi.arrangeShellWindows(shellWindowLayout, shellWindowRegistry, shellViewport(workspace))
      applyShellWindowLayout(shellWindowLayout)
      saveShellLayout({ immediate: true })
      return clone(shellWindowLayout)
    }

    function resetShellWindow(id) {
      if (!shellWindowLayout || !layoutApi) return null
      const wanted = String(id || '')
      const workspace = shellWorkspace()
      const defaults = layoutApi.defaultShellLayout({ ...shellViewport(workspace), registry: shellWindowRegistry })
      if (wanted && shellWindowLayout.windows[wanted] && defaults.windows[wanted]) {
        shellWindowLayout.windows[wanted] = defaults.windows[wanted]
      } else if (!wanted) {
        shellWindowLayout = defaults
      }
      applyShellWindowLayout(shellWindowLayout)
      saveShellLayout({ immediate: true })
      return clone(shellWindowLayout)
    }

    function openWindowInspector(id) {
      const wanted = String(id || '')
      const current = shellWindowLayout?.windows?.[wanted]
      const host = shellHost(wanted)
      if (!current || !(host instanceof Element)) return null
      document.querySelector('[data-lsb-shell-window-inspector]')?.remove()
      const mask = document.createElement('div')
      mask.setAttribute('data-lsb-shell-window-inspector', '')
      mask.setAttribute('role', 'dialog')
      mask.setAttribute('aria-modal', 'true')
      mask.style.cssText = 'position:fixed;inset:0;z-index:9000;display:flex;align-items:center;justify-content:center;background:rgb(0 0 0 / 28%);padding:16px;'
      const panel = document.createElement('div')
      panel.style.cssText = 'width:min(360px,92vw);max-height:90vh;overflow:auto;background:var(--panel,#fff);color:var(--text,#222);border:1px solid var(--line,#ddd);border-radius:12px;padding:16px;box-shadow:0 18px 48px rgb(0 0 0 / 24%);'
      const title = document.createElement('h2')
      title.textContent = `${host.querySelector('.lsb-shell-window-title')?.textContent || wanted}窗口检查器`
      title.style.cssText = 'font-size:16px;margin:0 0 12px;'
      panel.append(title)
      const fields = new Map()
      const styleModel = styleApi?.moduleInspectorModel?.(shellWindowLayout, wanted) || { values: {}, inherited: {} }
      const overrideNames = ['fontFamily', 'baseFontSize', 'glassOpacity', 'glassBlur']
      const addField = (name, labelText, type = 'text', value = '', step = '') => {
        const label = document.createElement('label')
        label.style.cssText = 'display:flex;align-items:center;gap:8px;margin:8px 0;font-size:13px;'
        const text = document.createElement('span')
        text.textContent = labelText
        const input = document.createElement('input')
        input.type = type
        input.setAttribute('data-lsb-shell-inspector-field', name)
        if (type === 'number' && step) input.step = step
        input.value = value ?? ''
        input.style.cssText = 'flex:1;min-width:0;'
        label.append(text, input)
        panel.append(label)
        fields.set(name, input)
      }
      const visible = document.createElement('label')
      visible.style.cssText = 'display:flex;gap:8px;align-items:center;margin:8px 0;font-size:13px;'
      const visibleInput = document.createElement('input')
      visibleInput.type = 'checkbox'
      visibleInput.checked = current.visible !== false
      const visibleText = document.createElement('span')
      visibleText.textContent = '显示窗口'
      visible.append(visibleInput, visibleText)
      panel.append(visible)
      const collapsed = document.createElement('label')
      collapsed.style.cssText = visible.style.cssText
      const collapsedInput = document.createElement('input')
      collapsedInput.type = 'checkbox'
      collapsedInput.checked = current.collapsed === true
      const collapsedText = document.createElement('span')
      collapsedText.textContent = '折叠窗口'
      collapsed.append(collapsedInput, collapsedText)
      panel.append(collapsed)
      addField('width', '宽度', 'number', current.width)
      addField('height', '高度', 'number', current.height)
      const inspectorField = (name, labelText, type = 'text', step = '') => {
        const raw = current.overrides?.[name] ?? styleModel.values?.[name] ?? ''
        const value = type === 'number' ? String(raw).replace(/px$/i, '') : raw
        addField(name, labelText, type, value, step)
      }
      inspectorField('fontFamily', '局部字体')
      inspectorField('baseFontSize', '局部字号', 'number', '1')
      inspectorField('glassOpacity', '局部透明度', 'number', '0.01')
      inspectorField('glassBlur', '局部玻璃模糊', 'number', '1')
      const inherit = document.createElement('label')
      inherit.style.cssText = visible.style.cssText
      const inheritInput = document.createElement('input')
      inheritInput.type = 'checkbox'
      inheritInput.checked = overrideNames.every((name) => styleModel.inherited?.[name] !== false)
      const inheritText = document.createElement('span')
      inheritText.textContent = '局部样式继承全局'
      inherit.append(inheritInput, inheritText)
      panel.append(inherit)
      for (const name of overrideNames) {
        fields.get(name)?.addEventListener('input', () => {
          if (String(fields.get(name).value || '').trim()) inheritInput.checked = false
        })
      }
      const actions = document.createElement('div')
      actions.style.cssText = 'display:flex;justify-content:flex-end;gap:8px;margin-top:14px;'
      const cancel = document.createElement('button')
      cancel.type = 'button'
      cancel.textContent = '取消'
      const save = document.createElement('button')
      save.type = 'button'
      save.textContent = '保存'
      save.className = 'lsb-btn is-primary'
      actions.append(cancel, save)
      panel.append(actions)
      mask.append(panel)
      document.body.append(mask)
      const close = () => mask.remove()
      cancel.addEventListener('click', close)
      mask.addEventListener('click', (event) => { if (event.target === mask) close() })
      save.addEventListener('click', () => {
        const next = { ...current }
        next.visible = visibleInput.checked
        next.collapsed = collapsedInput.checked
        next.width = Number(fields.get('width').value)
        next.height = Number(fields.get('height').value)
        const overrides = { ...(current.overrides || {}) }
        for (const name of overrideNames) {
          if (inheritInput.checked || !String(fields.get(name).value || '').trim()) delete overrides[name]
          else overrides[name] = fields.get(name).value
        }
        next.overrides = overrides
        shellWindowLayout.windows[wanted] = next
        shellWindowLayout = layoutApi.sanitizeShellLayout(shellWindowLayout, {
          ...shellViewport(shellWorkspace()),
          registry: shellWindowRegistry,
        })
        applyShellWindowLayout(shellWindowLayout)
        saveShellLayout({ immediate: true })
        syncResponsiveMode()
        close()
      })
      panel.querySelector('input')?.focus?.()
      return mask
    }

    function windowBounds() {
      return layoutApi
        ? { x: 0, y: 0, ...shellViewport(shellWorkspace()) }
        : { x: 0, y: 0, width: Number(window.innerWidth || 1), height: Number(window.innerHeight || 1) }
    }

    function windowMin(id) {
      return shellWindowRegistry.find((item) => item.id === id)?.min || { width: 240, height: 160 }
    }

    function windowOthers(id) {
      return Object.entries(shellWindowLayout?.windows || {})
        .filter(([otherId, state]) => otherId !== id && state?.visible !== false)
        .map(([, state]) => state)
    }

    function interactionEventPosition(event) {
      return { x: Number(event.clientX || 0), y: Number(event.clientY || 0) }
    }

    function interactionNextRect(state, { snap = false } = {}) {
      const dx = state.last.x - state.start.x
      const dy = state.last.y - state.start.y
      const next = { ...state.origin }
      if (state.kind === 'drag') {
        next.x += dx
        next.y += dy
      } else {
        const edge = state.edge
        if (edge.includes('w')) {
          next.x += dx
          next.width -= dx
        }
        if (edge.includes('e')) next.width += dx
        if (edge.includes('n')) {
          next.y += dy
          next.height -= dy
        }
        if (edge.includes('s')) next.height += dy
      }
      return layoutApi.snapRect(next, {
        bounds: windowBounds(),
        others: windowOthers(state.id),
        min: windowMin(state.id),
        grid: snap ? undefined : 1,
        threshold: snap ? undefined : 0,
      })
    }

    function flushWindowInteraction() {
      const state = windowInteractionState
      windowInteractionRaf = 0
      if (!state || !shellWindowLayout?.windows?.[state.id]) return
      const next = interactionNextRect(state)
      state.pending = next
      if (state.kind === 'drag') {
        state.host.style.transform = `translate3d(${next.x - state.origin.x}px,${next.y - state.origin.y}px,0)`
      } else {
        state.host.style.left = `${next.x}px`
        state.host.style.top = `${next.y}px`
        state.host.style.width = `${next.width}px`
        state.host.style.height = `${next.height}px`
      }
    }

    function scheduleWindowInteraction() {
      if (windowInteractionRaf) return
      const raf = window.requestAnimationFrame || ((fn) => window.setTimeout(fn, 0))
      windowInteractionRaf = raf(flushWindowInteraction)
    }

    function endWindowInteraction(event) {
      const state = windowInteractionState
      if (!state) return
      if (event?.type === 'pointerup' && Number.isFinite(event.clientX) && Number.isFinite(event.clientY)) {
        state.last = interactionEventPosition(event)
      }
      if (windowInteractionRaf) {
        const cancel = window.cancelAnimationFrame || window.clearTimeout
        cancel(windowInteractionRaf)
        windowInteractionRaf = 0
      }
      flushWindowInteraction()
      const finalRect = state.pending ? interactionNextRect(state, { snap: true }) : state.origin
      const current = shellWindowLayout?.windows?.[state.id]
      if (current) shellWindowLayout.windows[state.id] = { ...current, ...finalRect }
      state.host.style.transform = ''
      delete state.host.dataset.lsbShellInteracting
      applyShellWindowLayout(shellWindowLayout)
      saveShellLayout({ immediate: true })
      window.removeEventListener('pointermove', onWindowPointerMove)
      window.removeEventListener('pointerup', endWindowInteraction)
      window.removeEventListener('pointercancel', endWindowInteraction)
      try { state.captureTarget?.releasePointerCapture?.(state.pointerId) } catch { /* jsdom/旧浏览器没有 pointer capture */ }
      windowInteractionState = null
    }

    function onWindowPointerMove(event) {
      if (!windowInteractionState) return
      windowInteractionState.last = interactionEventPosition(event)
      scheduleWindowInteraction()
    }

    function beginWindowInteraction(event, host, id, kind, edge = '') {
      if (event.button != null && event.button !== 0) return
      const current = shellWindowLayout?.windows?.[id]
      if (!current) return
      event.preventDefault()
      focusShellWindow(id, { persist: false })
      const point = interactionEventPosition(event)
      windowInteractionState = {
        id,
        host,
        kind,
        edge,
        start: point,
        last: point,
        origin: { x: current.x, y: current.y, width: current.width, height: current.height },
        pending: null,
        pointerId: event.pointerId,
        captureTarget: event.currentTarget,
      }
      host.dataset.lsbShellInteracting = kind
      try { event.currentTarget?.setPointerCapture?.(event.pointerId) } catch { /* jsdom/旧浏览器没有 pointer capture */ }
      window.addEventListener('pointermove', onWindowPointerMove)
      window.addEventListener('pointerup', endWindowInteraction, { once: false })
      window.addEventListener('pointercancel', endWindowInteraction, { once: false })
    }

    function keyWindowHost(event) {
      const target = event?.target
      if (target?.closest) {
        const fromTarget = target.closest('[data-lsb-shell-window]')
        if (fromTarget) return fromTarget
      }
      const active = document.activeElement
      return active?.closest?.('[data-lsb-shell-window]') || null
    }

    function onWindowKeyDown(event) {
      const host = keyWindowHost(event)
      if (!(host instanceof Element)) return
      const id = host.getAttribute('data-lsb-shell-window') || ''
      if (!shellWindowLayout?.windows?.[id]) return
      if (event.key === 'Escape') {
        if (windowInteractionState) {
          event.preventDefault()
          endWindowInteraction()
        }
        return
      }
      if (!['ArrowLeft', 'ArrowRight', 'ArrowUp', 'ArrowDown'].includes(event.key)) return
      const target = event.target
      if (target?.matches?.('input, textarea, select, button, a, [contenteditable="true"]')) return
      const current = shellWindowLayout.windows[id]
      const step = 12
      const next = { ...current }
      if (event.shiftKey) {
        if (event.key === 'ArrowLeft') { next.x += step; next.width -= step }
        if (event.key === 'ArrowRight') next.width += step
        if (event.key === 'ArrowUp') { next.y += step; next.height -= step }
        if (event.key === 'ArrowDown') next.height += step
      } else {
        if (event.key === 'ArrowLeft') next.x -= step
        if (event.key === 'ArrowRight') next.x += step
        if (event.key === 'ArrowUp') next.y -= step
        if (event.key === 'ArrowDown') next.y += step
      }
      const clean = layoutApi.snapRect(next, {
        bounds: windowBounds(),
        others: windowOthers(id),
        min: windowMin(id),
      })
      event.preventDefault()
      focusShellWindow(id)
      shellWindowLayout.windows[id] = { ...current, ...clean }
      applyShellWindowLayout(shellWindowLayout)
      saveShellLayout()
    }

    function syncResponsiveMode(el = document.getElementById('lsb-shell')) {
      if (!(el instanceof Element) || !shellWindowEnabled()) return
      const workspace = shellWorkspace(el)
      const viewport = shellViewport(workspace)
      const width = viewport.width
      const bucket = layoutApi.widthBucket(width)
      const key = shellLayoutStorageKey(viewport)
      if (shellWindowLayout && shellLayoutKey && key !== shellLayoutKey) {
        saveShellLayout({ immediate: true })
        shellWindowLayout = loadShellLayout(viewport)
        shellWindowLayout = ensureRegisteredShellLayout(shellWindowLayout, viewport)
        applyShellWindowLayout(shellWindowLayout)
      } else if (shellWindowLayout) {
        shellWindowLayout = layoutApi.sanitizeShellLayout(shellWindowLayout, {
          ...viewport,
          registry: shellWindowRegistry,
        })
        applyShellWindowLayout(shellWindowLayout)
      }
      el.dataset.lsbShellBucket = bucket
      const switcher = el.querySelector('[data-lsb-shell-window-switcher]')
      if (switcher) {
        switcher.replaceChildren()
        for (const item of shellWindowRegistry) {
          const button = document.createElement('button')
          button.type = 'button'
          button.setAttribute('role', 'tab')
          button.setAttribute('data-lsb-shell-window-switch', item.id)
          button.setAttribute('aria-controls', shellHost(item.id, el)?.id || `lsb-shell-window-${item.id}`)
          button.textContent = item.label
          button.addEventListener('click', () => {
            narrowActiveWindow = item.id
            const external = externalWindowViews.get(item.id)
            if (external?.view?.id) setAsideActive(external.view.id, el.querySelector('#lsb-shell-aside'), true)
            focusShellWindow(item.id)
            syncResponsiveMode(el)
          })
          switcher.append(button)
        }
      }
      const available = shellWindowRegistry.filter((item) => shellWindowLayout?.windows?.[item.id]?.visible !== false)
      if (!available.some((item) => item.id === narrowActiveWindow)) narrowActiveWindow = available[0]?.id || 'content'
      for (const item of shellWindowRegistry) {
        const host = shellHost(item.id, el)
        if (!(host instanceof Element)) continue
        const active = bucket !== 'narrow' || item.id === narrowActiveWindow
        host.dataset.lsbShellActive = active ? 'true' : 'false'
        const tab = switcher?.querySelector(`[data-lsb-shell-window-switch="${item.id}"]`)
        if (tab) tab.setAttribute('aria-selected', active ? 'true' : 'false')
      }
    }

    function bindWindowInteractions(el = document.getElementById('lsb-shell')) {
      if (!(el instanceof Element) || !shellWindowEnabled()) return
      for (const item of shellWindowRegistry) {
        const host = shellHost(item.id, el)
        if (!(host instanceof Element)) continue
        if (host.dataset.lsbShellWindowInteractionsBound !== '1') {
          host.dataset.lsbShellWindowInteractionsBound = '1'
          const bar = host.querySelector(':scope > [data-lsb-shell-window-bar]')
          bar?.addEventListener('pointerdown', (event) => {
            if (event.target.closest?.('[data-lsb-shell-window-action], [data-lsb-shell-resize-edge], input, textarea, select, button, a')) return
            beginWindowInteraction(event, host, item.id, 'drag')
          })
          host.addEventListener('pointerdown', (event) => {
            if (event.target.closest?.('[data-lsb-shell-window-action], [data-lsb-shell-window-bar], [data-lsb-shell-resize-edge], input, textarea, button, a')) return
            focusShellWindow(item.id)
            if (event.currentTarget === host && event.target === host) host.focus?.()
          })
          host.addEventListener('focus', () => focusShellWindow(item.id))
          for (const handle of host.querySelectorAll('[data-lsb-shell-resize-edge]')) {
            handle.addEventListener('pointerdown', (event) => beginWindowInteraction(event, host, item.id, 'resize', handle.getAttribute('data-lsb-shell-resize-edge') || 'se'))
          }
        }
      }
      if (!windowInteractionBound) {
        windowInteractionBound = true
        window.addEventListener('keydown', onWindowKeyDown)
        if (!responsiveBound) {
          responsiveBound = true
          responsiveHandler = () => syncResponsiveMode(el)
          window.addEventListener('resize', responsiveHandler)
        }
      }
    }

    function unbindWindowInteractions() {
      endWindowInteraction()
      windowInteractionBound = false
      window.removeEventListener('keydown', onWindowKeyDown)
      if (responsiveBound) {
        responsiveBound = false
        if (responsiveHandler) window.removeEventListener('resize', responsiveHandler)
        responsiveHandler = null
      }
    }

    function mountContentWindow(el = document.getElementById('lsb-shell')) {
      const content = shellHost('content', el)
      const body = content?.querySelector?.('[data-lsb-shell-window-body]')
      if (!(content instanceof Element) || !(body instanceof Element)) return
      contentController.mount(findOutlet(), body)
    }

    function mountShellWindows(el = document.getElementById('lsb-shell')) {
      if (!(el instanceof Element) || !shellWindowEnabled()) return
      const workspace = shellWorkspace(el)
      if (!(workspace instanceof Element)) return
      const nav = shellHost('nav', el)
      const site = shellHost('site', el)
      const content = shellHost('content', el)
      ensureWindowChrome(nav, 'nav', '导航')
      ensureWindowChrome(site, 'site', '站点')
      ensureWindowChrome(content, 'content', '正文')
      mountContentWindow(el)
      collectShellWindowRegistry(el)
      const viewport = shellViewport(workspace)
      const key = shellLayoutStorageKey(viewport)
      if (shellWindowLayout && shellLayoutKey === key) {
        shellWindowLayout = layoutApi.sanitizeShellLayout(shellWindowLayout, { ...viewport, registry: shellWindowRegistry })
      } else {
        if (shellWindowLayout && shellLayoutKey && shellLayoutKey !== key) saveShellLayout({ immediate: true })
        shellWindowLayout = loadShellLayout(viewport)
      }
      shellWindowLayout = ensureRegisteredShellLayout(shellWindowLayout, viewport)
      applyShellWindowLayout(shellWindowLayout)
      el.dataset.lsbShellMode = 'windowed'
      if (content) content.dataset.lsbShellActive = 'true'
      syncResponsiveMode(el)
      bindWindowInteractions(el)
    }

    function unmountShellWindows() {
      saveShellLayout({ immediate: true })
      window.clearTimeout(shellLayoutSaveTimer)
      shellLayoutSaveTimer = 0
      contentController.release()
      shellWindowLayout = null
      shellWindowRegistry = []
      shellLayoutKey = ''
    }

    return {
      enabled: shellWindowEnabled, workspace: shellWorkspace, viewport: shellViewport, host: shellHost,
      focus: focusShellWindow, arrange: arrangeShellWindows, reset: resetShellWindow,
      unbind: unbindWindowInteractions, mount: mountShellWindows, unmount: unmountShellWindows,
      get layout() { return shellWindowLayout },
      get registry() { return shellWindowRegistry },
      get externalViews() { return externalWindowViews },
    }
  }
  // Owns the canvas host, panel presentation and delegated interactions.
  // Dependencies are invoked lazily; setup retains global lifecycle orchestration.
  function createSkinCanvasHostController({
    window, document, configController, aiMarkup: CANVAS_AI_MARKUP, getPage,
    pluginCatalog, siteCardsController, hooks,
  }) {
    const { Element, HTMLElement, CustomEvent, Event, MutationObserver, history, queueMicrotask } = window
    const {
      canvasPageType,
      locationText,
      navigationEntries,
      findRouteOutlet,
      nativeSidebars,
      markNative,
      renderCanvasTopLinks,
      restoreCanvasTopLinks,
      canvasMountProfile,
      canvasRestoreProfile,
      canvasSearchSetOpen,
      adoptSearch,
      restoreSearch,
      adoptThemeToggle,
      canvasCloseContextPill,
      canvasNativeAction,
      canvasBindSelection,
      canvasUnbindSelection,
      canvasEndDrag,
      canvasBeginDrag,
      canvasBeginResize,
      canvasKeyboardMove,
      canvasApplySurfaceModes,
      canvasSyncAppearance,
      bindAppearance,
      canvasBindWindow,
      canvasUnbindWindow,
      canvasScheduleScroll,
      canvasSyncScrollTarget,
      isCanvasScrollBound,
      isSurfaceDragging,
    } = hooks
    let canvasShell = null
    let canvasSurfaceHost = null
    let canvasActiveSheet = ''
    let canvasFocusReturn = null
    let canvasSearchOutsideHandler = null
    let canvasZIndex = 0
    let canvasSiteStatusHost = null
    let canvasSiteStatusLocked = false
    let canvasSidebarObserver = null

    function renderPluginFeatureEntries() {
      const host = canvasSurface('plugin-features-sheet')?.querySelector('[data-plugin-feature-list]')
      if (!(host instanceof Element)) return
      host.replaceChildren()
      const entries = pluginCatalog.features()
      if (!entries.length) {
        const empty = document.createElement('p')
        empty.className = 'lsb-empty'
        empty.textContent = '目前没有可用的插件功能。'
        host.append(empty)
        return
      }
      for (const entry of entries) {
        const row = document.createElement('div')
        row.className = 'lsb-plugin-entry'
        row.setAttribute('data-plugin-feature-entry', entry.plugin)
        const action = document.createElement('button')
        action.type = 'button'
        action.className = 'lsb-plugin-entry-main'
        action.setAttribute('data-plugin-feature-action', entry.plugin)
        action.textContent = entry.label
        row.append(action)
        if (entry.hasSettings) {
          const settings = document.createElement('button')
          settings.type = 'button'
          settings.className = 'lsb-plugin-entry-settings'
          settings.setAttribute('data-plugin-settings-open', entry.plugin)
          settings.setAttribute('aria-label', `打开${entry.label}设置`)
          settings.title = `${entry.label}设置`
          settings.textContent = '⚙'
          row.append(settings)
        }
        host.append(row)
      }
    }

    function pluginStateLabel(state) {
      if (state === 'disabled') return '已停用'
      if (state === 'skipped') return '当前页面未启用'
      if (state === 'error') return '异常'
      if (state === 'registered') return '等待启用'
      return ''
    }

    function renderPluginSettingsEntries() {
      const host = canvasSurface('plugin-settings-sheet')?.querySelector('[data-plugin-settings-list]')
      if (!(host instanceof Element)) return
      host.replaceChildren()
      const entries = pluginCatalog.settings()
      if (!entries.length) {
        const empty = document.createElement('p')
        empty.className = 'lsb-empty'
        empty.textContent = '没有声明配置项的插件。'
        host.append(empty)
        return
      }
      for (const entry of entries) {
        const button = document.createElement('button')
        button.type = 'button'
        button.className = 'lsb-plugin-settings-entry'
        button.setAttribute('data-plugin-settings-entry', entry.id)
        const name = document.createElement('span')
        name.textContent = entry.name || entry.id
        button.append(name)
        const state = pluginStateLabel(entry.state)
        if (state) {
          const status = document.createElement('small')
          status.textContent = state
          button.append(status)
        }
        host.append(button)
      }
    }

    function canvasRestoreSiteSidebar(options) {
      siteCardsController.restore(options)
      canvasSiteStatusHost = null
      canvasSiteStatusLocked = false
    }

    function canvasSiteStatusBody() {
      return canvasSurface('site-status')?.querySelector('[data-canvas-site-status-body]') || null
    }

    function canvasSiteStatusSetExpanded(host, expanded, locked = canvasSiteStatusLocked) {
      if (!(host instanceof Element)) return
      const next = !!expanded
      canvasSiteStatusLocked = !!locked
      host.dataset.expanded = String(next)
      host.dataset.locked = String(canvasSiteStatusLocked)
      const button = host.querySelector('[data-canvas-site-status-expand]')
      const label = host.querySelector('[data-canvas-site-status-label]')
      if (label instanceof HTMLElement) label.setAttribute('aria-expanded', String(next))
      if (button instanceof HTMLElement) {
        button.setAttribute('aria-expanded', String(next))
        button.textContent = next ? '⌃' : '⌄'
        button.setAttribute('title', next ? '收起站点信息' : '展开站点信息')
        button.setAttribute('aria-label', next ? '收起站点信息' : '展开站点信息')
      }
    }

    function canvasSyncPersistentSiteCards(surface = canvasSurface('site-card')) {
      const statusSurface = canvasSurface('site-status')
      const statusHost = statusSurface?.querySelector('[data-canvas-site-status-host]')
      const useStatusHost = configController.widthClass === 'wide' && statusHost instanceof Element
      const host = useStatusHost ? canvasSiteStatusBody() : surface?.querySelector?.('[data-canvas-site-sidebar]')
      if (!(host instanceof Element)) return
      canvasSiteStatusHost = useStatusHost ? statusHost : null
      siteCardsController.sync(host, { persistentOnly: true })
    }

    function canvasSyncSiteSidebar(surface = canvasSurface('site-card')) {
      const statusSurface = canvasSurface('site-status')
      const statusHost = statusSurface?.querySelector('[data-canvas-site-status-host]')
      const useStatusHost = configController.widthClass === 'wide' && statusHost instanceof Element
      const host = useStatusHost ? canvasSiteStatusBody() : surface?.querySelector?.('[data-canvas-site-sidebar]')
      if (!(host instanceof Element)) return
      canvasSiteStatusHost = useStatusHost ? statusHost : null
      if (statusSurface instanceof HTMLElement) statusSurface.hidden = !useStatusHost
      if (statusHost instanceof HTMLElement) {
        statusHost.hidden = !useStatusHost
        if (!useStatusHost) canvasSiteStatusSetExpanded(statusHost, false, false)
      }
      siteCardsController.sync(host)
    }

    function canvasBindSiteStatus(host) {
      if (!(host instanceof Element) || host.dataset.canvasSiteStatusBound === '1') return
      host.dataset.canvasSiteStatusBound = '1'
      canvasSiteStatusSetExpanded(host, false, false)
    }

    function canvasOpenSiteStatus(trigger = null) {
      const host = canvasSurface('site-status')?.querySelector('[data-canvas-site-status-host]')
      if (!(host instanceof Element)) return null
      if (canvasActiveSheet && canvasActiveSheet !== 'site-card') canvasCloseSurface(canvasActiveSheet, false)
      canvasFocusReturn = trigger instanceof Element
        ? trigger
        : (document.activeElement instanceof Element ? document.activeElement : null)
      canvasSyncSiteSidebar()
      host.hidden = false
      canvasSiteStatusSetExpanded(host, true, true)
      canvasActiveSheet = 'site-card'
      canvasSetBackdrop(false)
      canvasZIndex += 1
      host.style.zIndex = String(8010 + canvasZIndex)
      return host
    }

    function canvasWatchSidebar() {
      canvasSidebarObserver?.disconnect?.()
      canvasSidebarObserver = null
      const sides = nativeSidebars()
      if (!sides.length || typeof MutationObserver !== 'function') return
      canvasSidebarObserver = new MutationObserver(() => {
        if (!configController.config.shell) return
        canvasMountProfile(findRouteOutlet())
        const site = canvasSurface('site-card')
        canvasSyncPersistentSiteCards(site)
        if (canvasActiveSheet === 'site-card' || site?.dataset.surfaceMode === 'rail') canvasSyncSiteSidebar(site)
      })
      for (const side of sides) canvasSidebarObserver.observe(side, { childList: true, subtree: true })
    }

    function canvasStopSidebarWatch() {
      canvasSidebarObserver?.disconnect?.()
      canvasSidebarObserver = null
    }

    function canvasApplyPageClass() {
      const root = document.documentElement
      for (const name of ['home', 'forum', 'topic', 'user', 'settings', 'page']) root.classList.remove(`lsb-canvas-page-${name}`)
      const pageType = canvasPageType()
      root.classList.add(`lsb-canvas-page-${pageType}`)
      const outlet = findRouteOutlet()
      outlet?.classList.toggle('lsb-canvas-content-root', true)
      configController.refreshContext()
      if (isCanvasScrollBound()) canvasSyncScrollTarget()
    }

    function canvasSurface(id) {
      const wanted = String(id || '')
      if (!wanted) return null
      return canvasSurfaceHost?.querySelector?.(`[data-surface="${wanted.replace(/"/g, '')}"]`) || null
    }

    function canvasSetBackdrop(visible) {
      const backdrop = canvasSurfaceHost?.querySelector?.('[data-canvas-backdrop]')
      if (!(backdrop instanceof HTMLElement)) return
      backdrop.hidden = !visible
      backdrop.setAttribute('aria-hidden', String(!visible))
    }

    function canvasFocusFirst(surface) {
      if (!(surface instanceof Element)) return
      const target = surface.querySelector('button:not([disabled]),a[href],input,textarea,select,[tabindex]:not([tabindex="-1"])')
      target?.focus?.()
    }

    function canvasCloseSurface(id = canvasActiveSheet, restore = true) {
      if (id === 'site-card' && configController.widthClass === 'wide') {
        const host = canvasSurface('site-status')?.querySelector('[data-canvas-site-status-host]')
        canvasSiteStatusSetExpanded(host, false, false)
        if (canvasActiveSheet === id) canvasActiveSheet = ''
        if (!canvasActiveSheet) canvasSetBackdrop(false)
        const trigger = canvasFocusReturn
        canvasFocusReturn = null
        if (restore && trigger?.isConnected) trigger.focus?.()
        return
      }
      const surface = canvasSurface(id)
      if (surface) {
        surface.setAttribute('data-canvas-surface-state', 'closing')
        surface.hidden = true
        surface.setAttribute('aria-hidden', 'true')
        surface.setAttribute('data-canvas-surface-state', 'closed')
      }
      if (canvasActiveSheet === id) canvasActiveSheet = ''
      if (!canvasActiveSheet) canvasSetBackdrop(false)
      if (id === 'site-card') canvasRestoreSiteSidebar({ restorePersistent: true })
      const trigger = canvasFocusReturn
      canvasFocusReturn = null
      if (restore && trigger?.isConnected) trigger.focus?.()
    }

    function closePluginMenuSurfaces() {
      for (const id of ['plugin-features-sheet', 'plugin-settings-sheet', 'tool-sheet']) {
        canvasCloseSurface(id, false)
      }
    }

    function openPluginFeature(pluginId) {
      closePluginMenuSurfaces()
      void pluginCatalog.openFeature(pluginId)
    }

    function openPluginSettings(pluginId) {
      closePluginMenuSurfaces()
      pluginCatalog.openSettings(pluginId)
    }

    function canvasOpenSurface(id, trigger = null) {
      const wanted = String(id || '')
      if (wanted === 'site-card' && configController.widthClass === 'wide') return canvasOpenSiteStatus(trigger)
      const surface = canvasSurface(wanted)
      if (!(surface instanceof Element)) return null
      if (wanted === 'plugin-features-sheet') renderPluginFeatureEntries()
      if (wanted === 'plugin-settings-sheet') renderPluginSettingsEntries()
      if (wanted !== 'context-pill') canvasCloseContextPill()
      if (canvasActiveSheet && canvasActiveSheet !== wanted) canvasCloseSurface(canvasActiveSheet, false)
      canvasFocusReturn = trigger instanceof Element ? trigger : (document.activeElement instanceof Element ? document.activeElement : null)
      surface.hidden = false
      surface.setAttribute('aria-hidden', 'false')
      surface.setAttribute('data-canvas-surface-state', 'opening')
      canvasActiveSheet = wanted
      const isPersistentRail = wanted === 'site-card' && surface.dataset.surfaceMode === 'rail'
      if (wanted !== 'context-pill') canvasSetBackdrop(!isPersistentRail)
      if (wanted === 'site-card') canvasSyncSiteSidebar(surface)
      canvasZIndex += 1
      surface.style.zIndex = String(8010 + canvasZIndex)
      canvasFocusFirst(surface)
      const raf = window.requestAnimationFrame || ((fn) => window.setTimeout(fn, 0))
      raf(() => {
        if (surface.hidden || surface.getAttribute('aria-hidden') !== 'false') return
        surface.setAttribute('data-canvas-surface-state', 'open')
      })
      return surface
    }


    function canvasRenderNavigation(surface) {
      if (!(surface instanceof Element)) return
      const list = surface.querySelector('[data-canvas-navigation-list]')
      if (!(list instanceof Element)) return
      list.replaceChildren()
      for (const item of navigationEntries()) {
        const link = document.createElement('a')
        link.href = item.href
        link.textContent = item.label
        link.title = item.group || ''
        link.setAttribute('data-canvas-navigation-link', '')
        link.style.cssText = 'display:block;padding:10px 12px;border-radius:10px;color:inherit;text-decoration:none'
        link.addEventListener('click', () => canvasCloseSurface('navigation-sheet', false))
        list.append(link)
      }
    }

    function canvasSyncText() {
      const title = canvasSurface('top-status')?.querySelector('[data-canvas-status-title]')
      const morphText = (node, value) => {
        if (!(node instanceof HTMLElement)) return
        const next = String(value ?? '')
        if (node.textContent === next) return
        node.setAttribute('data-route-transition', 'in')
        node.textContent = next
        const clear = () => {
          if (node.isConnected && node.textContent === next) node.removeAttribute('data-route-transition')
        }
        if (typeof queueMicrotask === 'function') queueMicrotask(clear)
        else Promise.resolve().then(clear)
      }
      morphText(title, canvasPageType() === 'topic' ? 'LINUX SB' : locationText())
      canvasRenderNavigation(canvasSurface('navigation-sheet'))
      renderCanvasTopLinks()
      const currentPage = canvasPageType()
      canvasSurfaceHost?.setAttribute('data-canvas-page', currentPage)
    }

    function canvasUnbindEvents() {
      if (canvasSearchOutsideHandler) {
        document.removeEventListener('click', canvasSearchOutsideHandler, true)
        canvasSearchOutsideHandler = null
      }
    }

    function canvasBindEvents() {
      if (!(canvasSurfaceHost instanceof Element) || canvasSurfaceHost.dataset.canvasEventsBound === '1') return
      canvasSurfaceHost.dataset.canvasEventsBound = '1'
      canvasSurfaceHost.addEventListener('click', (event) => {
        const searchTrigger = event.target.closest?.('[data-canvas-search-trigger]')
        if (searchTrigger) {
          event.preventDefault()
          const host = searchTrigger.closest('[data-canvas-search-host]')
          canvasSearchSetOpen(host, host?.dataset.searchOpen !== 'true')
          return
        }
        if (event.target.closest?.('[data-canvas-backdrop]')) {
          event.preventDefault()
          canvasCloseSurface()
          return
        }
        const back = event.target.closest?.('[data-canvas-back]')
        if (back) {
          event.preventDefault()
          if (history.length > 1) history.back()
          return
        }
        const close = event.target.closest?.('[data-canvas-close]')
        if (close) {
          event.preventDefault()
          canvasCloseSurface(close.closest('[data-surface]')?.getAttribute('data-surface') || canvasActiveSheet)
          return
        }
        const contextAction = event.target.closest?.('[data-context-action]')
        if (contextAction) {
          event.preventDefault()
          canvasNativeAction(contextAction.getAttribute('data-context-action') || '')
          canvasCloseContextPill(true)
          return
        }
        const siteStatusHost = event.target.closest?.('[data-canvas-site-status-host]')
        if (siteStatusHost && !event.target.closest?.('[data-canvas-site-status-body]')) {
          event.preventDefault()
          const next = siteStatusHost.dataset.locked !== 'true'
          canvasSiteStatusSetExpanded(siteStatusHost, next, next)
          canvasActiveSheet = next ? 'site-card' : ''
          return
        }
        const pluginSettingsAction = event.target.closest?.('[data-plugin-settings-open], [data-plugin-settings-entry]')
        if (pluginSettingsAction) {
          event.preventDefault()
          openPluginSettings(
            pluginSettingsAction.getAttribute('data-plugin-settings-open')
            || pluginSettingsAction.getAttribute('data-plugin-settings-entry')
            || '',
          )
          return
        }
        const pluginFeatureAction = event.target.closest?.('[data-plugin-feature-action]')
        if (pluginFeatureAction) {
          event.preventDefault()
          openPluginFeature(pluginFeatureAction.getAttribute('data-plugin-feature-action') || '')
          return
        }
        const settingsDirectory = event.target.closest?.('[data-plugin-settings-directory]')
        if (settingsDirectory) {
          event.preventDefault()
          canvasOpenSurface('plugin-settings-sheet', settingsDirectory)
          return
        }
        const settingsBack = event.target.closest?.('[data-plugin-settings-back]')
        if (settingsBack) {
          event.preventDefault()
          canvasOpenSurface('plugin-features-sheet', settingsBack)
          return
        }
        const action = event.target.closest?.('[data-canvas-open]')
        if (action) {
          event.preventDefault()
          canvasOpenSurface(action.getAttribute('data-canvas-open'), action)
          return
        }
        const tool = event.target.closest?.('[data-tool-action]')
        if (tool) {
          event.preventDefault()
          const target = tool.getAttribute('data-tool-action')
          canvasCloseSurface('tool-sheet', false)
          canvasOpenSurface(target, tool)
          return
        }
      })
      canvasSearchOutsideHandler = (event) => {
        const host = canvasSurfaceHost?.querySelector('[data-canvas-search-host]')
        if (host?.dataset.searchOpen !== 'true' || host.contains(event.target)) return
        canvasSearchSetOpen(host, false)
      }
      document.addEventListener('click', canvasSearchOutsideHandler, true)
      canvasSurfaceHost.addEventListener('keydown', (event) => {
        if (event.key === 'Escape') {
          const searchHost = canvasSurfaceHost.querySelector('[data-canvas-search-host]')
          if (searchHost?.dataset.searchOpen === 'true') {
            event.preventDefault()
            event.stopPropagation()
            canvasSearchSetOpen(searchHost, false, true)
            return
          }
        }
        if (event.key === 'Escape' && isSurfaceDragging()) {
          event.preventDefault()
          canvasEndDrag(false)
          return
        }
        if (event.key === 'Escape' && canvasActiveSheet) {
          event.preventDefault()
          canvasCloseSurface(canvasActiveSheet)
        }
        const surface = event.target.closest?.('[data-surface]')
        if (surface) canvasKeyboardMove(event, surface)
      })
      canvasSurfaceHost.addEventListener('pointerdown', (event) => {
        const surface = event.target.closest?.('[data-surface]')
        const handle = event.target.closest?.('[data-canvas-sheet-head]')
        const resize = event.target.closest?.('[data-canvas-resize-handle]')
        if (surface && resize) canvasBeginResize(event, surface)
        else if (surface && handle) canvasBeginDrag(event, surface)
      })
    }

    function ensureCanvasShell() {
      let el = document.getElementById('lsb-shell')
      if (el && el.getAttribute('data-lsb-canvas-shell') !== 'true') el.remove()
      el = document.getElementById('lsb-shell')
      if (!el) {
        el = document.createElement('div')
        el.id = 'lsb-shell'
        el.setAttribute('data-lsb-canvas-shell', 'true')
        el.innerHTML = `
          <div id="lsb-shell-surfaces" data-lsb-canvas-surfaces>
            <div data-canvas-backdrop hidden aria-hidden="true"></div>
            <div data-canvas-profile-host hidden aria-label="当前用户资料">
              <button type="button" data-canvas-profile-expand aria-expanded="false" aria-label="展开个人资料卡" title="展开个人资料卡">⌄</button>
            </div>
            <section data-surface="top-status" role="status" aria-live="polite">
              <button type="button" data-canvas-action data-canvas-back aria-label="返回">‹</button>
              <a class="lsb-shell-brand" data-canvas-home href="/" aria-label="回到首页">⌂</a>
              <strong data-canvas-status-title>LINUX SB</strong>
              <nav data-canvas-status-links aria-label="站点快捷入口"></nav>
              <nav data-canvas-pinned-links aria-label="认证与导航"></nav>
              <div data-canvas-search-host hidden aria-label="站点搜索">
                <button type="button" data-canvas-search-trigger aria-label="打开站点搜索" aria-expanded="false" aria-controls="lsb-canvas-search-panel">
                  <svg viewBox="0 0 24 24" aria-hidden="true"><circle cx="10.8" cy="10.8" r="6.6"></circle><path d="m16 16 4.5 4.5"></path></svg>
                </button>
                <div id="lsb-canvas-search-panel" data-canvas-search-panel role="dialog" aria-label="站点搜索" hidden></div>
              </div>
              <button type="button" data-canvas-open="tool-sheet" data-canvas-action aria-label="打开工具">⋯</button>
            </section>
            <section data-surface="site-status" aria-label="站点信息栏" hidden>
              <div data-canvas-site-status-host aria-label="站点信息" data-expanded="false" data-locked="false">
                <button type="button" data-canvas-site-status-label aria-expanded="false">站点信息</button>
                <div data-canvas-site-status-body data-canvas-site-sidebar aria-label="原站右侧栏"><p data-canvas-site-empty-state hidden>当前页面没有原生站点信息栏内容</p></div>
                <button type="button" data-canvas-site-status-expand aria-expanded="false" aria-label="展开站点信息" title="展开站点信息">⌄</button>
              </div>
            </section>
            <section data-surface="tool-capsule" aria-label="工具入口">
              ${CANVAS_AI_MARKUP.capsule}
              <button type="button" data-canvas-open="tool-sheet" aria-label="更多工具">⋯</button>
            </section>
            <section data-surface="tool-sheet" role="dialog" aria-modal="false" aria-hidden="true" aria-labelledby="lsb-canvas-tool-title" hidden>
              <div data-canvas-sheet-head><span data-canvas-sheet-grabber aria-hidden="true"></span><h2 id="lsb-canvas-tool-title">工具</h2><button type="button" data-canvas-close aria-label="关闭">×</button></div>
              <div data-tool-grid>
                <button type="button" data-tool-action="site-card">站点信息</button>
                ${CANVAS_AI_MARKUP.tool}
                <button type="button" data-tool-action="appearance-sheet">外观</button>
                <button type="button" data-tool-action="plugin-features-sheet">插件功能</button>
              </div>
              ${CANVAS_AI_MARKUP.query}
            </section>
            <section data-surface="plugin-features-sheet" role="dialog" aria-hidden="true" aria-labelledby="lsb-canvas-plugin-features-title" hidden>
              <div data-canvas-sheet-head><span data-canvas-sheet-grabber aria-hidden="true"></span><h2 id="lsb-canvas-plugin-features-title">插件功能</h2><button type="button" data-canvas-close aria-label="关闭">×</button></div>
              <section aria-labelledby="lsb-canvas-plugin-feature-list-title">
                <h3 id="lsb-canvas-plugin-feature-list-title">功能入口</h3>
                <div data-plugin-feature-list></div>
              </section>
              <section aria-labelledby="lsb-canvas-plugin-settings-title">
                <h3 id="lsb-canvas-plugin-settings-title">插件设置</h3>
                <p class="lsb-row-desc">浏览所有已声明设置项的插件。</p>
                <button type="button" data-plugin-settings-directory>全部插件设置</button>
              </section>
            </section>
            <section data-surface="plugin-settings-sheet" role="dialog" aria-hidden="true" aria-labelledby="lsb-canvas-plugin-settings-sheet-title" hidden>
              <div data-canvas-sheet-head><span data-canvas-sheet-grabber aria-hidden="true"></span><h2 id="lsb-canvas-plugin-settings-sheet-title">全部插件设置</h2><button type="button" data-canvas-close aria-label="关闭">×</button></div>
              <button type="button" data-plugin-settings-back>返回插件功能</button>
              <div data-plugin-settings-list></div>
            </section>
            <section data-surface="navigation-sheet" role="dialog" aria-hidden="true" aria-labelledby="lsb-canvas-navigation-title" hidden>
              <div data-canvas-sheet-head><span data-canvas-sheet-grabber aria-hidden="true"></span><h2 id="lsb-canvas-navigation-title">导航</h2><button type="button" data-canvas-close aria-label="关闭">×</button></div>
              <nav data-canvas-navigation-list aria-label="站点板块"></nav>
            </section>
            <section data-surface="site-card" role="dialog" aria-hidden="true" aria-labelledby="lsb-canvas-site-title" hidden>
              <div data-canvas-sheet-head><span data-canvas-sheet-grabber aria-hidden="true"></span><h2 id="lsb-canvas-site-title">站点信息</h2><button type="button" data-canvas-close aria-label="关闭">×</button></div>
              <div data-canvas-site-sidebar aria-label="原站右侧栏"><p data-canvas-site-empty-state hidden>当前页面没有原生站点信息栏内容</p></div>
              <span data-canvas-resize-handle role="separator" aria-label="调整站点卡片大小"></span>
            </section>
            <section data-surface="context-pill" role="toolbar" aria-label="选中文本操作" aria-hidden="true" hidden>
              <button type="button" data-context-action="reply">回复</button>
              <button type="button" data-context-action="quote">引用</button>
              <button type="button" data-context-action="favorite">收藏</button>
              <button type="button" data-context-action="copy">复制</button>
            </section>
            ${CANVAS_AI_MARKUP.card}
            <section data-surface="appearance-sheet" role="dialog" aria-hidden="true" aria-labelledby="lsb-canvas-appearance-title" hidden>
              <div data-canvas-sheet-head><span data-canvas-sheet-grabber aria-hidden="true"></span><h2 id="lsb-canvas-appearance-title">外观</h2><button type="button" data-canvas-close aria-label="关闭">×</button></div>
              <div data-canvas-presets role="group" aria-label="外观预设">
                <button type="button" data-canvas-preset="native-site">D 原生站点</button>
                <button type="button" data-canvas-preset="balanced-glass">A 平衡玻璃</button>
                <button type="button" data-canvas-preset="immersive-video">B 沉浸视频</button>
                <button type="button" data-canvas-preset="static-readable">C 静态可读</button>
              </div>
              <div data-canvas-background-modes role="group" aria-label="背景模式">
                <strong>背景</strong>
                <button type="button" data-canvas-background="original" aria-pressed="false">原始背景</button>
                <button type="button" data-canvas-background="image" aria-pressed="false">静态图片</button>
                <button type="button" data-canvas-background="video" aria-pressed="false">视频背景</button>
              </div>
              <div data-canvas-appearance-controls>
                <label>透明度 <input type="range" min="0.35" max="1" step="0.01" data-canvas-appearance="opacity"></label>
                <label>模糊 <input type="range" min="0" max="32" step="1" data-canvas-appearance="blur"></label>
                <label>字号 <input type="range" min="12" max="32" step="1" data-canvas-appearance="fontSize"></label>
                <label>圆角 <input type="range" min="8" max="32" step="1" data-canvas-appearance="radius"></label>
                <label>系统字体 <select data-canvas-appearance="fontFamily"><option value="">站点默认</option><option value="system-ui">System UI</option><option value="'PingFang SC'">苹方</option><option value="'Microsoft YaHei'">微软雅黑</option><option value="'Segoe UI'">Segoe UI</option></select></label>
                <label>视频 URL（HTTPS） <input type="url" data-canvas-appearance="backgroundVideoUrl"></label>
                <label>图片 URL（HTTPS） <input type="url" data-canvas-appearance="backgroundImageUrl"></label>
                <label>字体 URL（HTTPS） <input type="url" data-canvas-appearance="fontUrl"></label>
                <label>本地视频（≤50MB） <input type="file" accept="video/*" data-canvas-media-file="video"></label>
                <label>本地图片（≤20MB） <input type="file" accept="image/*" data-canvas-media-file="image"></label>
                <label>本地字体（≤10MB） <input type="file" accept=".woff2,.woff,.ttf,.otf,font/*" data-canvas-media-file="font"></label>
              </div>
              <div data-canvas-appearance-actions><button type="button" data-canvas-save-appearance>保存外观</button><button type="button" data-canvas-reset-appearance>恢复默认外观</button><button type="button" data-canvas-reset-layout>恢复默认布局</button></div>
              <p data-canvas-appearance-status aria-live="polite"></p>
            </section>
          </div>`
        document.body.append(el)
      }
      canvasShell = el
      canvasSurfaceHost = el.querySelector('#lsb-shell-surfaces')
      canvasBindSiteStatus(canvasSurfaceHost.querySelector('[data-canvas-site-status-host]'))
      canvasBindEvents()
      canvasBindSelection()
      return el
    }

    function mountCanvas() {
      const outlet = findRouteOutlet()
      if (!(outlet instanceof Element)) return null
      /* Keep the document-start bootstrap opaque until the real canvas and all
         of its surfaces have been created.  Removing it before ensureCanvasShell
         lets the native route paint for one frame during a full-page topic hop. */
      canvasApplyPageClass()
      markNative(true)
      const el = ensureCanvasShell()
      if (!(el instanceof Element) || !(el.querySelector('#lsb-shell-surfaces') instanceof Element)) return null
      adoptSearch(el.querySelector('[data-canvas-search-host]'))
      adoptThemeToggle(el.querySelector('[data-lsb-shell-theme]'))
      /* Keep the real self card in the reading flow.  The native sidebar
         remains hidden in place; only the card is temporarily adopted by the
         inline slot and is restored before route content is stashed. */
      canvasMountProfile(outlet)
      canvasWatchSidebar()
      canvasSyncText()
      canvasSyncAppearance()
      canvasApplySurfaceModes()
      if (configController.widthClass === 'wide' || canvasActiveSheet === 'site-card') canvasSyncSiteSidebar()
      else canvasSyncPersistentSiteCards()
      canvasBindWindow()
      canvasScheduleScroll()
      bindAppearance()
      document.documentElement.classList.remove('lsb-canvas-boot')
      document.getElementById('lsb-shell-boot-frame')?.remove()
      return el
    }

    function unmountCanvas() {
      canvasEndDrag(false)
      canvasUnbindWindow()
      canvasUnbindSelection()
      canvasUnbindEvents()
      canvasStopSidebarWatch()
      canvasCloseSurface(canvasActiveSheet, false)
      canvasRestoreSiteSidebar({ releasePersistent: true })
      canvasRestoreProfile()
      restoreCanvasTopLinks()
      canvasSurfaceHost = null
      restoreSearch()
      canvasShell?.remove()
      canvasShell = null
      canvasActiveSheet = ''
      canvasFocusReturn = null
      document.querySelector('.lsb-canvas-content-root')?.classList.remove('lsb-canvas-content-root')
      for (const name of ['canvas-mode', 'lsb-canvas-page-home', 'lsb-canvas-page-forum', 'lsb-canvas-page-topic', 'lsb-canvas-page-user', 'lsb-canvas-page-settings', 'lsb-canvas-page-page']) document.documentElement.classList.remove(name)
    }

    return {
      mount: mountCanvas,
      unmount: unmountCanvas,
      surface: canvasSurface,
      applyPageClass: canvasApplyPageClass,
      syncText: canvasSyncText,
      closeSurface: canvasCloseSurface,
      openPluginFeature: openPluginFeature,
      restoreSiteSidebar: canvasRestoreSiteSidebar,
      syncSiteSidebar: canvasSyncSiteSidebar,
      syncPersistentSiteCards: canvasSyncPersistentSiteCards,
      setSiteStatusExpanded: canvasSiteStatusSetExpanded,
      stopSidebarWatch: canvasStopSidebarWatch,
      watchSidebar: canvasWatchSidebar,
      nextZIndex: () => ++canvasZIndex,
      restoreFocus: () => { if (canvasFocusReturn?.isConnected) canvasFocusReturn.focus?.() },
      get shell() { return canvasShell },
      get surfaceHost() { return canvasSurfaceHost },
      get activeSheet() { return canvasActiveSheet },
    }
  }
  // Coordinates shell refresh, mode transitions and existing resource cleanup.
  // Construction is inert; setup keeps registration ownership and its original order.
  function createSkinRuntimeController({
    window, document, configController, timelineController, mediaController,
    onlineController, viewCacheController, spaController, canvasHostController,
    shellTokenProps, getSettingsController, challengeAttr, isChallengeDocument, hooks,
  }) {
    const { Element, MutationObserver } = window
    const { effectiveUiMode, read: readCanvasState } = configController
    const { bind: bindSpa, unbind: unbindSpa, clear: clearSpaTransaction, clearChrome: clearSpaRouteChromeHold } = spaController
    const {
      asideWide,
      restyle,
      markNative,
      currentScrollX,
      currentScrollY,
      scrollCurrentRootTo,
      clearNativeRouteEnhancements,
      unbindWindow,
      unbindWindowInteractions,
      unbindAsideResize,
      stopOnlineWatch,
      stopExtrasWatch,
      destroyAsideViews,
      unmountCanvas,
      unmountShellWindows,
      restoreAsideCards,
      restoreAsidePersistentCards,
      restoreUserCard,
      restoreTopExtras,
      restoreThemeToggle,
      restoreSearch,
      unbindHomeInfiniteScroll,
      refreshNativeRouteEnhancements,
      bindAsideResize,
      mountCanvas,
      fillShell,
      syncHomeInfiniteScroll,
      syncShellMedia,
      adoptSearch,
      shellSearchHost,
      adoptThemeToggle,
      adoptUserCard,
      findRouteOutlet,
      canvasMountProfile,
      canvasSurface,
      canvasSyncSiteSidebar,
    } = hooks
    let mountedUiMode = null
    let pendingUiModeScroll = null
    let cloudflareChallengeObserver = null
    let uiModeResizeBound = false
    let uiModeWideSnapshot = null
    let refreshTimer = 0

    function onUiModeResize() {
      const wide = asideWide()
      if (wide === uiModeWideSnapshot) return
      uiModeWideSnapshot = wide
      scheduleRefresh(false)
    }

    function bindUiModeResize() {
      if (uiModeResizeBound) return
      uiModeResizeBound = true
      uiModeWideSnapshot = asideWide()
      window.addEventListener('resize', onUiModeResize)
    }

    function unbindUiModeResize() {
      if (!uiModeResizeBound) return
      window.removeEventListener('resize', onUiModeResize)
      uiModeResizeBound = false
      uiModeWideSnapshot = null
    }

    function bindCloudflareChallengeWatch() {
      if (cloudflareChallengeObserver || typeof MutationObserver !== 'function') return
      const root = document.documentElement
      if (!root) return
      cloudflareChallengeObserver = new MutationObserver(() => scheduleRefresh(false))
      cloudflareChallengeObserver.observe(root, {
        attributes: true,
        attributeFilter: [challengeAttr],
      })
    }

    function unbindCloudflareChallengeWatch() {
      cloudflareChallengeObserver?.disconnect?.()
      cloudflareChallengeObserver = null
    }

    function unmountShellLayer({ preserveBootStyle = false } = {}) {
      clearSpaTransaction()
      clearNativeRouteEnhancements()
      timelineController.cancelPending()
      clearSpaRouteChromeHold()
      delete document.documentElement.dataset.lsbRoutePhase
      unbindWindow()
      unbindWindowInteractions()
      unbindAsideResize()
      stopOnlineWatch()
      stopExtrasWatch()
      destroyAsideViews()
      unmountCanvas()
      unmountShellWindows()
      mediaController.reset()
      restoreAsideCards()
      restoreAsidePersistentCards()
      restoreUserCard()
      restoreTopExtras()
      restoreThemeToggle()
      restoreSearch()
      document.getElementById('lsb-shell')?.remove()
      markNative(false)

      const root = document.documentElement
      root.removeAttribute('data-lsb-shell-mode')
      root.classList.remove(
        'lsb-skin-shell-on', 'lsb-skin-shell-home', 'lsb-skin-shell-topic', 'lsb-skin-shell-user', 'lsb-skin-shell-windowed',
        'lsb-skin-glass-on', 'lsb-skin-video-on', 'lsb-skin-image-on', 'lsb-canvas-mode',
        'lsb-canvas-reduced-motion', 'lsb-canvas-reduced-transparency',
        'lsb-canvas-boot', 'lsb-shell-boot',
      )
      for (const name of ['home', 'forum', 'topic', 'user', 'settings', 'page']) root.classList.remove(`lsb-canvas-page-${name}`)
      for (const prop of shellTokenProps) root.style.removeProperty(prop)
      shellTokenProps.clear()
      root.style.removeProperty('--lsb-shell-font-family')
      if (!preserveBootStyle) document.getElementById('lsb-shell-boot-style')?.remove()
      document.getElementById('lsb-shell-boot-frame')?.remove()
      mountedUiMode = null
    }

    function teardownShell() {
      window.clearTimeout(refreshTimer)
      refreshTimer = 0
      unbindUiModeResize()
      unbindCloudflareChallengeWatch()
      unbindSpa()
      unbindHomeInfiniteScroll()
      onlineController.stop()
      unmountShellLayer()
      viewCacheController.clear()
      spaController.resetView()
    }

    function refreshShell() {
      refreshTimer = 0
      if (!configController.config.shell) {
        const scrollPosition = pendingUiModeScroll
        pendingUiModeScroll = null
        teardownShell()
        if (scrollPosition) scrollCurrentRootTo(scrollPosition.x, scrollPosition.y)
        return
      }

      bindCloudflareChallengeWatch()
      if (isChallengeDocument(document)) {
        const scrollPosition = pendingUiModeScroll
        pendingUiModeScroll = null
        unbindUiModeResize()
        unbindSpa()
        unbindHomeInfiniteScroll()
        onlineController.stop()
        unmountShellLayer({ preserveBootStyle: true })
        if (scrollPosition) scrollCurrentRootTo(scrollPosition.x, scrollPosition.y)
        return
      }

      bindUiModeResize()
      const mode = effectiveUiMode()
      const targetMode = mode === 'ios27' || asideWide() ? mode : null
      const modeChanged = mountedUiMode !== targetMode
      const scrollPosition = pendingUiModeScroll || (modeChanged
        ? { x: currentScrollX(), y: currentScrollY() }
        : null)
      pendingUiModeScroll = null
      const hadLayer = mountedUiMode !== null || !!document.getElementById('lsb-shell')
      if (modeChanged && hadLayer) unmountShellLayer()

      if (!targetMode) {
        unbindHomeInfiniteScroll()
        restyle()
        refreshNativeRouteEnhancements()
        bindSpa()
        if (scrollPosition) scrollCurrentRootTo(scrollPosition.x, scrollPosition.y)
        return
      }

      restyle()
      markNative(true)
      bindAsideResize()
      try {
        const mounted = targetMode === 'ios27' ? mountCanvas() : fillShell()
        if (!(mounted instanceof Element)) throw new Error(`${targetMode} shell did not mount`)
        mountedUiMode = targetMode
        // Canvas mounting also needs to bind the initial homepage scroll root;
        // waiting for a later route refresh leaves the first page inert.
        syncHomeInfiniteScroll()
        refreshNativeRouteEnhancements()
        bindSpa()
        syncShellMedia()
        if (scrollPosition) scrollCurrentRootTo(scrollPosition.x, scrollPosition.y)
      } catch (error) {
        unbindHomeInfiniteScroll()
        unmountShellLayer()
        bindSpa()
        if (scrollPosition) scrollCurrentRootTo(scrollPosition.x, scrollPosition.y)
        if (typeof console !== 'undefined' && typeof console.warn === 'function') {
          console.warn('[LSB skin] shell mount failed; restored native page', error)
        }
      }
    }

    function scheduleRefresh(fromRoute) {
      if (fromRoute && spaController.filled) return
      window.clearTimeout(refreshTimer)
      refreshTimer = window.setTimeout(refreshShell, 50)
    }

    function applyAll() {
      restyle()
      refreshShell()
    }

    function onConfigChanged() {
      const previousMode = effectiveUiMode()
      const previousShell = configController.config.shell
      const scrollPosition = { x: currentScrollX(), y: currentScrollY() }
      configController.reload()
      if (effectiveUiMode() !== previousMode || configController.config.shell !== previousShell) pendingUiModeScroll = scrollPosition
      readCanvasState()
      applyAll()
      getSettingsController().syncMenu()
    }

    function onNativeNode() {
      if (!configController.config.shell) return
      adoptSearch(shellSearchHost())
      adoptThemeToggle(document.querySelector('[data-lsb-shell-theme]'))
      adoptUserCard(document.querySelector('[data-lsb-shell-me]'))
      if (mountedUiMode === 'ios27') {
        const outlet = findRouteOutlet()
        canvasMountProfile(outlet)
        const site = canvasSurface('site-card')
        if (canvasHostController.activeSheet === 'site-card' || site?.dataset.surfaceMode === 'rail') canvasSyncSiteSidebar(site)
      }
    }

    function dispose() {
      mediaController.dispose()
      getSettingsController().clearMenu()
      teardownShell()
      const root = document.documentElement
      for (const c of [...root.classList].filter((x) => x.startsWith('lsb-skin-'))) root.classList.remove(c)
      document.getElementById('lsb-skin-style')?.remove()
    }

    function cancelRefresh() {
      window.clearTimeout(refreshTimer)
      refreshTimer = 0
    }

    return { applyAll, scheduleRefresh, cancelRefresh, onConfigChanged, onNativeNode, dispose }
  }

  const CLOUDFLARE_CHALLENGE_ATTR = 'data-lsb-cloudflare-challenge'
  const SPA_ROUTE_PENDING_CLASS = 'lsb-canvas-route-pending'
  const SPA_ROUTE_COMMITTED_EVENT = 'lsb:route-committed'
  const CLOUDFLARE_CHALLENGE_MARKERS = '#challenge-stage, #challenge-form, #challenge-running, #cf-challenge-running, .cf-browser-verification, [data-cf-challenge]'
  const CLOUDFLARE_CHALLENGE_TITLE_COPY = /(?:just a moment|attention required|checking your browser|checking if (?:the )?site connection is secure)/i
  const CLOUDFLARE_CHALLENGE_BODY_COPY = /(?:checking your browser|verify (?:that )?you are human|enable javascript and cookies to continue|performing (?:a )?security (?:check|verification)|complete (?:the )?security check|请完成.{0,12}验证|请进行.{0,12}验证|正在验证|人机验证)/i
  const CLOUDFLARE_CHALLENGE_COPY_SELECTOR = 'h1, h2, h3, p, [role="heading"], #challenge-error-text, #challenge-body-text, [data-cf-challenge-message]'
  const CANVAS_AI_MARKUP = { capsule: '', tool: '', query: '', card: '' }

  function isCloudflareChallengeDocument(doc) {
    if (!doc?.querySelector) return false
    if (doc.documentElement?.getAttribute(CLOUDFLARE_CHALLENGE_ATTR) === 'true') return true
    if (!doc.querySelector(CLOUDFLARE_CHALLENGE_MARKERS)) return false
    if (CLOUDFLARE_CHALLENGE_TITLE_COPY.test(String(doc.title || ''))) return true
    const view = doc.defaultView
    for (const node of doc.querySelectorAll(CLOUDFLARE_CHALLENGE_COPY_SELECTOR)) {
      if (!CLOUDFLARE_CHALLENGE_BODY_COPY.test(node.textContent || '')) continue
      let visible = true
      for (let current = node; current?.nodeType === 1; current = current.parentElement) {
        if (current.hidden || current.getAttribute('aria-hidden') === 'true') {
          visible = false
          break
        }
        const style = view?.getComputedStyle?.(current)
        if (style && (style.display === 'none' || style.visibility === 'hidden' || style.visibility === 'collapse' || style.opacity === '0')) {
          visible = false
          break
        }
        if (current === doc.body || !current.parentElement) break
      }
      if (visible) return true
    }
    return false
  }

  // 状态、资源、原生节点、SPA、首页加载、正文增强、设置、顶栏、时间轴、文本选择、外观交互、浮层布局、画布滚动、共享窗口、画布宿主与入口生命周期由显式模块提供；模板保留模块装配、公共注册和必要的视图/路由适配。
  // 后续拆分顺序与编辑方式见 plugins/skin/README.md。
  function setup(api) {
    const configController = createSkinConfigController({
      getConfig: () => api.config(), saveConfig: (patch) => api.saveConfig(patch), store: api.store,
      getLocation: () => location, getViewport: canvasViewport,
      stateApi: { CANVAS_STATE_KEY, CANVAS_STATE_VERSION, CANVAS_WIDTH_CLASSES, CANVAS_DEFAULT_APPEARANCE, defaultCanvasState, migrateLegacySkinState, canvasMerge, canvasCopy, mergeCanvasState, siteKeyFromLocation, widthClass },
      sanitizeTokenValue: (name, value) => api.ui.shellStyle?.sanitizeTokenValue?.(name, value),
      isHttpsUrl: (value) => api.ui.shellMedia?.isHttpsUrl?.(value),
    })
    const { effectiveUiMode, read: readCanvasState, save: saveCanvasState,
      persistSurfaceRect: canvasPersistSurfaceRect } = configController
    const { collectBoards, pagePath, locationText, isActiveHref, canvasPageType, navigationEntries } = createSkinNavigation({
      document,
      getPage: () => api.page,
      getForums: () => api.forums,
      getLocation: () => location,
      parseTopic: (doc) => api.parse.topic(doc),
      store: api.store,
      homeSorted: (sort) => api.routes.homeSorted(sort),
    })

    // ── A: 配置与画布状态（effectiveUiMode/canvasViewport/readSaveCanvasState） ──
    function canvasViewport() {
      return {
        width: Math.max(1, Number(window.innerWidth || document.documentElement?.clientWidth || 1)),
        height: Math.max(1, Number(window.innerHeight || document.documentElement?.clientHeight || 1)),
      }
    }

    function canvasDebugSnapshot() {
      const host = document.getElementById('lsb-shell-surfaces')
      return {
        enabled: configController.state?.enabled !== false && configController.config.shell !== false,
        version: CANVAS_STATE_VERSION,
        siteKey: configController.siteKey,
        widthClass: configController.widthClass,
        preset: configController.effective?.preset || 'balanced-glass',
        legacyLayoutSnapshot: canvasCopy(configController.state?.legacyLayoutSnapshot || null),
        surfaces: [...(host?.querySelectorAll?.('[data-surface]') || [])]
          .filter((node) => !node.hidden && !['top-status', 'tool-capsule'].includes(node.getAttribute('data-surface')))
          .map((node) => String(node.getAttribute('data-surface') || ''))
          .filter(Boolean),
        user: {
          enabled: canvasPageType() === 'user',
          selfProfile: {
            mounted: !!document.querySelector('[data-canvas-profile-host] .lsb-canvas-self-user-card'),
            expanded: document.querySelector('[data-canvas-profile-host]')?.dataset.expanded === 'true',
            locked: document.querySelector('[data-canvas-profile-host]')?.dataset.locked === 'true',
          },
          profile: {
            scrollMode: document.querySelector('[data-lsb-canvas-profile]')?.dataset.scrollMode || 'full',
            expanded: document.querySelector('[data-lsb-canvas-profile]')?.dataset.expanded === 'true',
            mounted: !!document.querySelector('[data-lsb-canvas-profile] .sidebar-card.user-card'),
          },
          listMounted: !!document.querySelector('[data-lsb-canvas-list]'),
          topLinks: [...(host?.querySelectorAll?.('[data-canvas-status-links] a, [data-canvas-pinned-links] a') || [])].map((node) => String(node.textContent || '').trim()).filter(Boolean),
          gap: 12,
        },
      }
    }

    readCanvasState()
    const shellLayoutApi = api.ui.shellLayout || null
    const shellStyleApi = api.ui.shellStyle || null
    const hasWindowApi = typeof api.ui.shellWindowController === 'function'
    const contentController = createSkinContentController({
      window, document,
      isChallengeDocument: isCloudflareChallengeDocument,
      findLeftRails: nativeLeftRails,
      createScrollBridge: api.ui.shellScrollBridge,
    })
    const {
      findOutlet: findRouteOutlet,
      restoreSidebars: restoreDetachedNativeSidebars,
      syncScrollBridge: syncShellScrollBridge,
    } = contentController
    const historyController = createSkinHistoryController({
      window, document,
      getScrollRoot: currentScrollRoot,
      readScroll: () => ({ x: currentScrollX(), y: currentScrollY() }),
      scrollTo: scrollCurrentRootTo,
    })
    const { apply: applyHistory } = historyController
    const windowController = createSkinWindowController({
      window, document, ui: api.ui, store: api.store, configController, contentController,
      layoutApi: shellLayoutApi, styleApi: shellStyleApi, getLocation: () => location,
      getAsideContext: asideContext, getAsidePreferredId: () => asideViewsController.preferredId,
      getAsideActiveId: () => asideViewsController.activeId,
      setAsideActive: (id, host, persist) => asideSetActive(id, host, persist),
      findOutlet: findRouteOutlet, clone: structuredCloneSafe,
    })
    const { enabled: shellWindowEnabled, workspace: shellWorkspace, viewport: shellViewport,
      host: shellHost, focus: focusShellWindow, arrange: arrangeShellWindows, reset: resetShellWindow,
      unbind: unbindWindowInteractions, mount: mountShellWindows, unmount: unmountShellWindows } = windowController
    const shellTokenProps = new Set()
    const canvasHostController = createSkinCanvasHostController({
      window, document, configController, aiMarkup: CANVAS_AI_MARKUP, getPage: () => api.page,
      pluginCatalog: {
        features: () => pluginCatalog.features(), settings: () => pluginCatalog.settings(),
        openFeature: (id) => pluginCatalog.openFeature(id), openSettings: (id) => pluginCatalog.openSettings(id),
      },
      siteCardsController: {
        sync: (host, options) => siteCardsController.sync(host, options),
        restore: (options) => siteCardsController.restore(options),
      },
      hooks: {
        canvasPageType: () => canvasPageType(),
        locationText: () => locationText(),
        navigationEntries: () => navigationEntries(),
        findRouteOutlet: () => findRouteOutlet(),
        nativeSidebars: () => nativeSidebars(),
        markNative: (on) => markNative(on),
        renderCanvasTopLinks: () => renderCanvasTopLinks(),
        restoreCanvasTopLinks: () => restoreCanvasTopLinks(),
        canvasMountProfile: (outlet) => canvasMountProfile(outlet),
        canvasRestoreProfile: () => canvasRestoreProfile(),
        canvasSearchSetOpen: (host, open, restore) => canvasSearchSetOpen(host, open, restore),
        adoptSearch: (host) => adoptSearch(host),
        restoreSearch: () => restoreSearch(),
        adoptThemeToggle: (host) => adoptThemeToggle(host),
        canvasCloseContextPill: (restore) => canvasCloseContextPill(restore),
        canvasNativeAction: (action) => canvasNativeAction(action),
        canvasBindSelection: () => canvasBindSelection(),
        canvasUnbindSelection: () => canvasUnbindSelection(),
        canvasEndDrag: (commit) => canvasEndDrag(commit),
        canvasBeginDrag: (event, surface) => canvasBeginDrag(event, surface),
        canvasBeginResize: (event, surface) => canvasBeginResize(event, surface),
        canvasKeyboardMove: (event, surface) => canvasKeyboardMove(event, surface),
        canvasApplySurfaceModes: () => canvasApplySurfaceModes(),
        canvasSyncAppearance: () => canvasSyncAppearance(),
        bindAppearance: () => appearanceController.bind(),
        canvasBindWindow: () => canvasBindWindow(),
        canvasUnbindWindow: () => canvasUnbindWindow(),
        canvasScheduleScroll: () => canvasScheduleScroll(),
        canvasSyncScrollTarget: () => canvasSyncScrollTarget(),
        isCanvasScrollBound: () => canvasScrollController.bound,
        isSurfaceDragging: () => surfaceLayoutController.dragging,
      },
    })
    const {
      mount: mountCanvas,
      unmount: unmountCanvas,
      surface: canvasSurface,
      applyPageClass: canvasApplyPageClass,
      syncText: canvasSyncText,
      closeSurface: canvasCloseSurface,
      openPluginFeature: openPluginFeature,
      restoreSiteSidebar: canvasRestoreSiteSidebar,
      syncSiteSidebar: canvasSyncSiteSidebar,
      syncPersistentSiteCards: canvasSyncPersistentSiteCards,
      setSiteStatusExpanded: canvasSiteStatusSetExpanded,
      stopSidebarWatch: canvasStopSidebarWatch,
      watchSidebar: canvasWatchSidebar,
    } = canvasHostController
    const canvasScrollController = createSkinCanvasScrollController({
      window, document, getSurface: canvasSurface, getViewport: canvasViewport,
      isAsideWide: asideWide, getContentScroller: () => contentController.scroller,
      syncScrollBridge: syncShellScrollBridge,
      updateProfileScroll: (y, previous) => canvasUpdateProfileScroll(y, previous),
      applyPageClass: canvasApplyPageClass, applySurfaceModes: () => canvasApplySurfaceModes(),
    })
    const { homeRoot: canvasHomeScrollRoot, syncTarget: canvasSyncScrollTarget,
      schedule: canvasScheduleScroll, bind: canvasBindWindow, unbind: canvasUnbindWindow } = canvasScrollController
    // 公共控制器注销由基座 API 的 own() 管理，运行时只释放皮肤持有的资源。
    const offWindowController = hasWindowApi
      ? api.ui.shellWindowController((action, value) => {
        if (action === 'focus') return focusShellWindow(value)
        if (action === 'arrange') return arrangeShellWindows()
        if (action === 'reset') return resetShellWindow(value)
        if (action === 'layout') return windowController.layout ? structuredCloneSafe(windowController.layout) : null
        return null
      })
      : () => {}
    const offScrollRoot = typeof api.ui.shellScrollRootController === 'function'
      ? api.ui.shellScrollRootController(() => contentController.scroller)
      : () => {}
    const offAsideController = typeof api.ui.shellAsideController === 'function'
      ? api.ui.shellAsideController((id) => {
        const aside = document.querySelector('#lsb-shell-aside')
        return asideSetActive(id, aside, true)
      })
      : () => {}
    const {
      host: shellSearchHost,
      adopt: adoptSearch,
      restore: restoreSearch,
      setOpen: canvasSearchSetOpen,
    } = createSkinSearchController({ document })
    const onlineController = createSkinOnlineController({
      window,
      document,
      request: (path, options) => api.net.raw(path, options),
      isEnabled: () => configController.config.shell,
      isChallengeDocument: isCloudflareChallengeDocument,
    })
    const asideCardsController = createSkinAsideCardsController({
      window, document, store: api.store, getSidebars: nativeSidebars,
      getPage: () => api.page, isSelfUserCard: (card) => profileController.isSelfUserCard(card),
      isEnabled: () => configController.config.shell, syncOnlineDots: () => onlineController.syncDots(),
    })
    const { adopt: adoptAsideCards, restore: restoreAsideCards, restorePersistent: restoreAsidePersistentCards,
      pruneDetached: pruneDetachedAsideCards, watch: watchOnlineCard, stop: stopOnlineWatch } = asideCardsController
    const asideViewsController = createSkinAsideViewsController({
      window, document, store: api.store, getContext: asideContext,
      getViews: (context) => api.ui.shellAsideViews(context), isEnabled: () => configController.config.shell,
      onSelect: (id, selectedView) => {
        const windowId = selectedView?.windowId || 'site'
        if (windowId !== 'site' && windowController.layout?.windows?.[windowId]) focusShellWindow(windowId)
        for (const current of windowController.externalViews.values()) {
          if (current.view?.windowId) current.host.dataset.lsbShellOpen = current.view.id === id ? 'true' : 'false'
        }
      },
    })
    const { setActive: asideSetActive, sync: syncAsideViews, destroy: destroyAsideViews,
      bindResize: bindAsideResize, unbindResize: unbindAsideResize } = asideViewsController
    const spaDocumentController = createSkinSpaDocumentController({
      window, document, getConfig: () => configController.config, findRouteOutlet, nativeLeftRails, applyHistory,
      lifecycle: { canvasStopSidebarWatch, canvasRestoreSiteSidebar, restoreDetachedNativeSidebars, markNative,
        canvasRestoreProfile: () => canvasRestoreProfile(),
        canvasStagePersistentSiteCardOrigins: (root) => canvasStagePersistentSiteCardOrigins(root),
        canvasRebindPersistentSiteCardOrigins: (root) => canvasRebindPersistentSiteCardOrigins(root),
        syncOnlineBoot: (pageDoc) => onlineController.syncBoot(pageDoc) },
    })
    const { topicUrl: topicSpaUrl, accepts: isSpaUrl, cacheKey: viewCacheKey,
      containsTopicPostContent, snapshotOutletAttrs, captureHead: captureRouteHead,
      parse: parseOutletFrag } = spaDocumentController
    const { refresh: refreshNativeRouteEnhancements, clear: clearNativeRouteEnhancements } = createSkinNativeEnhancementsController({
      window, document, topicUrl: topicSpaUrl, startOnline: () => onlineController.start(),
    })
    const { sync: syncHomeInfiniteScroll, unbind: unbindHomeInfiniteScroll } = createSkinHomeInfiniteController({
      window, document, getConfig: () => configController.config,
      request: (path, options) => api.net.raw(path, options), cacheKey: viewCacheKey,
      containsTopicPostContent, getScrollRoot: canvasHomeScrollRoot,
    })
    const viewCacheController = createSkinViewCache({
      window, document, request: (path, options) => api.net.raw(path, options),
      getContext: () => ({ enabled: spaController.bound && configController.config.shell, viewKey: spaController.viewKey, href: location.href }),
      parse: parseOutletFrag, isTopic: topicSpaUrl, cacheKey: viewCacheKey,
    })
    const { remember: rememberView } = viewCacheController
    const spaController = createSkinSpaController({
      window, document, getConfig: () => configController.config,
      request: (path, options) => api.net.raw(path, options), routeDocument: spaDocumentController,
      viewCacheController, historyController, pendingClass: SPA_ROUTE_PENDING_CLASS,
      hooks: { findRouteOutlet, stashView, markNative, applyMarkers, fillShell, refreshRouteEnhancements,
        syncShellRoute, scrollToTopicTarget, refreshNativeRouteEnhancements, unbindHomeInfiniteScroll, syncHomeInfiniteScroll,
        cancelRefresh: () => runtimeController.cancelRefresh() },
      perf: { enabled: () => api.hasHandler('perf-probe:record'), now: () => performance.now(),
        span: perfSpan, spanAsync: perfSpanAsync, emit: perfEmit,
        emitGlobal: (name, detail) => api.emitGlobal(name, detail) },
    })
    const { bind: bindSpa, unbind: unbindSpa, clear: clearSpaTransaction,
      clearChrome: clearSpaRouteChromeHold } = spaController

    /* ── 共存检测：色彩主题已由其它脚本负责，本模块只做排版层，天然无冲突。
       若未来加入色彩子项，须在此让位。 ── */
    const themesPresent = !!document.querySelector('style[data-themes-plugin]')

    // ── B: 工具与样式适配（esc/structuredCloneSafe/applyShellTokens） ──
    function esc(s) {
      return String(s ?? '').replace(/[&<>"']/g, (c) =>
        ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c],
      )
    }

    function structuredCloneSafe(value) {
      try {
        if (typeof structuredClone === 'function') return structuredClone(value)
      } catch {
        /* fall through to JSON for the small layout record */
      }
      try {
        return JSON.parse(JSON.stringify(value))
      } catch {
        return value
      }
    }

    /** 状态类挂 <html> 上：CSS 特异性干净，测试也容易断言 */
    // · B4 applyShellTokens: 玻璃/字号/字体令牌注入 ──
    function applyShellTokens() {
      const root = document.documentElement
      const appearance = configController.effective?.appearance || {}
      const canvasOn = !!configController.config.shell && effectiveUiMode() === 'ios27'
      const shellOn = shellUiActive()
      root.classList.toggle('lsb-canvas-reduced-motion', canvasOn && appearance.motion === 'reduced')
      root.classList.toggle('lsb-canvas-reduced-transparency', canvasOn && appearance.transparency === 'reduced')
      if (!shellStyleApi) return
      if (!shellOn) {
        for (const prop of shellTokenProps) root.style.removeProperty(prop)
        shellTokenProps.clear()
        root.classList.remove('lsb-skin-glass-on', 'lsb-canvas-reduced-motion', 'lsb-canvas-reduced-transparency')
        return
      }
      const tokens = shellStyleApi.mergeShellTokens(configController.tokenValues(), {})
      const cssText = shellStyleApi.tokenCss(tokens)
      const nextProps = new Set()
      for (const declaration of cssText.split(';')) {
        const index = declaration.indexOf(':')
        if (index <= 0) continue
        const prop = declaration.slice(0, index).trim()
        const value = declaration.slice(index + 1).trim()
        if (!prop.startsWith('--lsb-shell-') || !value) continue
        root.style.setProperty(prop, value)
        nextProps.add(prop)
      }
      for (const prop of shellTokenProps) if (!nextProps.has(prop)) root.style.removeProperty(prop)
      shellTokenProps.clear()
      for (const prop of nextProps) shellTokenProps.add(prop)
      const radius = canvasFinite(appearance.radius, 16)
      root.style.setProperty('--lsb-shell-radius', `${Math.max(8, Math.min(32, radius))}px`)
      shellTokenProps.add('--lsb-shell-radius')
      root.classList.toggle('lsb-skin-glass-on', shellOn)
    }

    // ── C: 媒体适配与路由状态 ──
    const mediaController = createSkinMediaController({
      window,
      document,
      media: api.ui.shellMedia,
      style: shellStyleApi,
      getContext: () => {
        const canvasMode = canvasHostController.shell instanceof Element && canvasHostController.shell.getAttribute('data-lsb-canvas-shell') === 'true'
        return { config: configController.config, appearance: configController.effective?.appearance || {}, workspace: canvasMode ? document.body : shellWorkspace(), canvasMode }
      },
      toast: (message, options) => api.ui.toast?.(message, options),
    })

    function syncShellMedia() {
      void mediaController.sync()
    }

    // ── D: 原生结构接管（applyMarkers/restyle/nativeHeaders） ──
    // · D1 applyMarkers: 逐容器打点与兴趣节点标记 ──
    function applyMarkers() {
      const root = document.documentElement
      const shellOn = shellUiActive()
      const canvasOn = !!configController.config.shell && effectiveUiMode() === 'ios27'
      const shellHome = shellOn && (pagePath() === '/' || pagePath() === '/index.php')
      root.classList.toggle('lsb-skin-type-on', !!configController.config.typography)
      root.classList.toggle('lsb-skin-density-compact', configController.config.density === '紧凑')
      root.classList.toggle('lsb-skin-code-on', !!configController.config.codeblock)
      root.classList.toggle('lsb-skin-floors-on', !!configController.config.floors)
      root.classList.toggle('lsb-skin-measure-on', !!configController.config.measure)
      root.classList.toggle('lsb-skin-shell-on', shellOn)
      root.classList.toggle('lsb-skin-shell-home', shellHome)
      root.classList.toggle('lsb-canvas-mode', canvasOn)
      root.classList.toggle('lsb-skin-shell-topic', shellOn && api.page?.type === 'topic')
      root.classList.toggle('lsb-skin-shell-user', shellOn && api.page?.type === 'user')
      /* 旧模式始终为固定三栏；窗口化布局已不再是可选模式。 */
      root.classList.remove('lsb-skin-shell-windowed')
      root.removeAttribute('data-lsb-shell-mode')
    }

    // · D2 restyle: 按兴趣重写布局骨架（topic/suite 归一） ──
    function restyle() {
      applyMarkers()
      applyShellTokens()
      const id = 'lsb-skin-style'
      let el = document.getElementById(id)
      if (!el) {
        el = document.createElement('style')
        el.id = id
        document.head.appendChild(el)
      }
      el.textContent = skinCss(configController.config, { shellActive: shellUiActive(), uiMode: effectiveUiMode() })
    }

    // · D3 nativeHeaders/Sidebars: 原生头部/侧栏收敛 ──
    function nativeHeaders() {
      const headers = new Set(document.querySelectorAll('body > .top, body > header, body > .site-header, body > [data-site-header]'))
      for (const menu of document.querySelectorAll('[data-slot~="top.menu_links"]')) {
        if (menu.closest('#mobile-menu, #mobile-menu-drawer, .mobile-menu-drawer')) continue
        let header = menu
        while (header.parentElement && header.parentElement !== document.body) header = header.parentElement
        if (header.parentElement === document.body) headers.add(header)
      }
      return [...headers]
    }

    function nativeSidebars() {
      return [...new Set(document.querySelectorAll('aside.sidebar, [data-slot~="sidebar.stack"]'))].filter(
        (el) => el.id !== 'mobile-menu-drawer' && !el.classList.contains('mobile-menu-drawer'),
      )
    }

    function nativeLeftRails(scope = document) {
      return [...(scope?.querySelectorAll?.('.forum-enhancements-left-fixed') || [])]
    }

    function markNative(on) {
      for (const el of nativeHeaders()) el.classList.toggle('lsb-native-header-hidden', on)
      for (const el of nativeSidebars()) el.classList.toggle('lsb-native-sidebar-hidden', on)
      for (const el of nativeLeftRails()) el.classList.toggle('lsb-native-left-hidden', on)
      for (const el of document.querySelectorAll('.sidebar-card.user-card')) el.toggleAttribute('data-lsb-shell-me', on)
    }

    // ── E: 侧栏与氢壳视图（asideWide/asideSetActive/syncAsideViews） ──
    // · E1 asideWide: 侧栏宽度与可见性判定 ──
    function asideWide() {
      try {
        if (typeof window.matchMedia === 'function') return !!window.matchMedia('(min-width: 1100px)').matches
      } catch {
        /* jsdom and older embedded browsers may not implement matchMedia */
      }
      const width = Number(window.innerWidth || document.documentElement?.clientWidth || 0)
      return width >= 1100
    }

    function shellUiActive() {
      return !!configController.config.shell && (effectiveUiMode() === 'ios27' || asideWide())
    }

    function asideContext() {
      return {
        page: api.page,
        route: api.page,
        snapshot: api.snapshot,
        wide: asideWide(),
      }
    }

    // ── F: 插件特性与工具菜单 ──
    const pluginCatalog = createSkinPluginCatalog({
      getInfo: () => (typeof unsafeWindow !== 'undefined' ? unsafeWindow : window).LSB?.info?.(),
      ui: api.ui,
      request: (name) => api.request(name),
    })

    // ── G: 原生节点接管与还原 ──
    const profileController = createSkinProfileController({
      window, document,
      getPage: () => api.page, getMe: () => api.me, getSidebars: nativeSidebars,
      getSelfHost: () => canvasHostController.surfaceHost?.querySelector('[data-canvas-profile-host]'),
      getViewport: canvasViewport,
    })
    const { adoptUserCard, restoreUserCard, isSelfUserCard, mount: canvasMountProfile, restore: canvasRestoreProfile, updateScroll: canvasUpdateProfileScroll } = profileController
    const siteCardsController = createSkinSiteCardsController({ document, getSidebars: nativeSidebars })
    const { stageOrigins: canvasStagePersistentSiteCardOrigins, rebindOrigins: canvasRebindPersistentSiteCardOrigins } = siteCardsController

    const {
      renderCanvasTopLinks, restoreCanvasTopLinks, adoptTopExtras, restoreTopExtras,
      adoptThemeToggle, restoreThemeToggle, watchTopExtras, stopExtrasWatch,
    } = createSkinTopbarController({
      window, document, store: api.store, isEnabled: () => configController.config.shell,
      getWidthClass: () => configController.widthClass, getTopStatus: () => canvasSurface('top-status'),
    })

    function renderLinks(links) {
      return links
        .map((link) => {
          const feature = link.plugin ? ` data-lsb-plugin-feature="${esc(link.plugin)}"` : ''
          if (link.rpc) {
            return `<button type="button" class="lsb-shell-link" data-lsb-rpc="${esc(link.rpc)}"${feature}><span class="lsb-shell-link-label">${esc(link.label)}</span></button>`
          }
          if (link.panel) {
            return `<button type="button" class="lsb-shell-link" data-lsb-panel="${esc(link.panel)}"${feature}><span class="lsb-shell-link-label">${esc(link.label)}</span></button>`
          }
          const active = isActiveHref(link.href) ? ' is-active' : ''
          const count = Number.isFinite(link.count)
            ? `<span class="lsb-shell-count">${esc(String(link.count))}</span>`
            : ''
          return `<a class="lsb-shell-link${active}" href="${esc(link.href)}"><span class="lsb-shell-link-label">${esc(link.label)}</span>${count}</a>`
        })
        .join('')
    }

    function paintActive(host) {
      if (!(host instanceof Element)) return
      for (const a of host.querySelectorAll('a.lsb-shell-link')) {
        a.classList.toggle('is-active', isActiveHref(a.getAttribute('href')))
      }
    }

    function setSection(host, title, links) {
      if (!(host instanceof Element)) return
      const sig = title + JSON.stringify(links)
      if (host.dataset.sig === sig) {
        paintActive(host)
        return
      }
      host.dataset.sig = sig
      if (!links.length) {
        host.innerHTML = ''
        return
      }
      const heading = title ? `<h2>${esc(title)}</h2>` : ''
      host.innerHTML = `<section class="lsb-shell-nav-section">${heading}<div class="lsb-shell-nav">${renderLinks(links)}</div></section>`
    }

    const timelineController = createSkinTimelineController({
      window, document, getPage: () => api.page, getPostSelector: () => api.sel?.topicPosts,
      isEnabled: () => configController.config.shell,
      hasPerfProbe: () => api.hasHandler('perf-probe:record'), emitPerf: perfEmit,
    })
    const { ensure: ensureTimeline, schedule: scheduleTimeline, bind: bindWindow, unbind: unbindWindow } = timelineController

    /* ── M17 单一阅读画布 ─────────────────────────────────────────────── */
    const { close: canvasCloseContextPill, act: canvasNativeAction,
      bind: canvasBindSelection, unbind: canvasUnbindSelection } = createSkinSelectionController({
      window, document, ui: api.ui,
      getPill: () => canvasSurface('context-pill'), getSurfaceHost: () => canvasHostController.surfaceHost,
      getActiveSheet: () => canvasHostController.activeSheet, getViewport: canvasViewport,
      nextZIndex: () => canvasHostController.nextZIndex(),
      restoreFocus: () => canvasHostController.restoreFocus(),
    })

    const surfaceLayoutController = createSkinSurfaceLayoutController({
      window, configController,
      getSurfaceHost: () => canvasHostController.surfaceHost, getSurface: canvasSurface, getViewport: canvasViewport,
      stateApi: { CANVAS_DEFAULT_SURFACES, resolveSurfaceMode, clampSurfaceRect },
      persistRect: canvasPersistSurfaceRect, setSiteStatusExpanded: canvasSiteStatusSetExpanded,
      syncSiteSidebar: canvasSyncSiteSidebar, nextZIndex: () => canvasHostController.nextZIndex(), closeSurface: canvasCloseSurface,
    })
    const { applyModes: canvasApplySurfaceModes, endDrag: canvasEndDrag,
      beginDrag: canvasBeginDrag, beginResize: canvasBeginResize, keyboardMove: canvasKeyboardMove } = surfaceLayoutController

    const appearanceController = createSkinAppearanceController({
      window, document, ui: api.ui, configController, mediaController,
      getSurfaceHost: () => canvasHostController.surfaceHost, getSurface: canvasSurface, getShell: () => canvasHostController.shell,
      locationText, saveState: saveCanvasState, applyTokens: applyShellTokens,
      syncMedia: syncShellMedia, applySurfaceModes: canvasApplySurfaceModes,
    })
    const { sync: canvasSyncAppearance } = appearanceController

    function stripShellWindowChrome(el) {
      if (!(el instanceof Element)) return
      el.querySelector('#lsb-shell-window-content')?.remove()
      el.querySelector('[data-lsb-shell-window-switcher]')?.remove()
      el.querySelectorAll('[data-lsb-shell-window-bar], [data-lsb-shell-window-drag], [data-lsb-shell-window-action], [data-lsb-shell-resize-edge]')
        .forEach((node) => node.remove())
      for (const node of el.querySelectorAll('[data-lsb-shell-window]')) node.removeAttribute('data-lsb-shell-window')
      el.removeAttribute('data-lsb-shell-mode')
    }

    function ensureShell() {
      let el = document.getElementById('lsb-shell')
      if (el) {
        if (el.parentNode !== document.body) document.body.append(el)
        stripShellWindowChrome(el)
        return el
      }
      el = document.createElement('div')
      el.id = 'lsb-shell'
      const nativeBrand = document.querySelector('body > .top a.brand')
      const brandName = 'LINUX SB'
      const nativeLogo = nativeBrand?.querySelector('img[src], source[src]')
      const logoSrc =
        (nativeLogo instanceof Element && nativeLogo.getAttribute('src'))
        || document.querySelector('link[rel~="icon"]')?.getAttribute('href')
        || '/app/assets/index.svg'
      el.innerHTML = `
        <header id="lsb-shell-header">
          <a class="lsb-shell-brand" href="/"><img class="lsb-shell-logo" src="${esc(logoSrc)}" alt="" width="22" height="22">${esc(brandName)}</a>
          <div class="lsb-shell-search-host"></div>
          <nav class="lsb-shell-extras" data-lsb-shell-extras aria-label="站点入口"></nav>
          <div class="lsb-shell-where" data-lsb-shell-where></div>
          <div class="lsb-shell-theme" data-lsb-shell-theme></div>
        </header>
        <div id="lsb-shell-workspace" data-lsb-shell-workspace>
        <aside id="lsb-shell-rail" aria-label="氢导航" data-lsb-shell-window="nav">
          <div class="lsb-shell-rail-scroll">
            <div class="lsb-shell-me" data-lsb-shell-me></div>
            <div data-lsb-shell-section="home"></div>
            <div data-lsb-shell-section="boards"></div>
            <div data-lsb-shell-section="tools"></div>
          </div>
          <div class="lsb-shell-rail-foot">
            <button type="button" class="lsb-shell-settings" data-lsb-shell-settings>设置</button>
          </div>
        </aside>
        <aside id="lsb-shell-aside" aria-label="站点信息" data-lsb-shell-window="site">
          <nav id="lsb-shell-aside-tabs" role="tablist" aria-label="右栏视图" hidden></nav>
          <div class="lsb-shell-aside-panes">
            <section data-lsb-shell-aside-pane="site" data-lsb-shell-site aria-label="站点" tabindex="0"></section>
          </div>
        </aside>
        <section id="lsb-shell-window-content" class="lsb-shell-window" data-lsb-shell-window="content" role="region" aria-labelledby="lsb-shell-window-content-title">
          <div class="lsb-shell-window-bar" data-lsb-shell-window-bar>
            <strong id="lsb-shell-window-content-title" class="lsb-shell-window-title">正文</strong>
            <span class="lsb-shell-window-drag" data-lsb-shell-window-drag aria-hidden="true"></span>
            <button type="button" class="lsb-shell-window-action" data-lsb-shell-window-reset aria-label="恢复正文窗口布局" title="恢复布局">↺</button>
          </div>
          <div class="lsb-shell-window-body lsb-shell-window-content-body" data-lsb-shell-window-body></div>
        </section>
        <nav class="lsb-shell-window-switcher" data-lsb-shell-window-switcher role="tablist" aria-label="氢壳窗口切换"></nav>
        </div>`
      stripShellWindowChrome(el)
      el.querySelector('[data-lsb-shell-settings]').addEventListener('click', () => api.ui.openPanel('skin'))
      el.querySelector('#lsb-shell-rail').addEventListener('click', (e) => {
        const featureBtn = e.target.closest('[data-lsb-plugin-feature]')
        if (featureBtn) {
          e.preventDefault()
          openPluginFeature(featureBtn.getAttribute('data-lsb-plugin-feature'))
          return
        }
        const rpcBtn = e.target.closest('[data-lsb-rpc]')
        if (rpcBtn) {
          e.preventDefault()
          api.request(rpcBtn.getAttribute('data-lsb-rpc'))
          return
        }
        const btn = e.target.closest('[data-lsb-panel]')
        if (!btn) return
        e.preventDefault()
        api.ui.openPanel(btn.getAttribute('data-lsb-panel'))
      })
      document.body.append(el)
      return el
    }

    function syncShellRoute(el = document.getElementById('lsb-shell')) {
      if (configController.config.shell && el?.getAttribute?.('data-lsb-canvas-shell') === 'true') {
        canvasApplyPageClass()
        markNative(true)
        canvasSyncText()
        canvasSyncAppearance()
        canvasApplySurfaceModes()
        canvasWatchSidebar()
        return
      }
      applyMarkers()
      if (!(el instanceof Element)) return
      const where = el.querySelector('[data-lsb-shell-where]')
      if (where) where.textContent = locationText()
      paintActive(el.querySelector('[data-lsb-shell-section="home"]'))
      paintActive(el.querySelector('[data-lsb-shell-section="boards"]'))
      const timeline = ensureTimeline(el)
      if (timeline) {
        bindWindow()
        scheduleTimeline()
      } else {
        unbindWindow()
      }
      syncAsideViews(el)
    }

    function fillShell() {
      if (!(findRouteOutlet() instanceof Element)) return null
      const el = ensureShell()
      if (shellWindowEnabled()) mountShellWindows(el)
      pruneDetachedAsideCards()
      adoptSearch(el.querySelector('.lsb-shell-search-host'))
      adoptTopExtras(el.querySelector('[data-lsb-shell-extras]'))
      adoptThemeToggle(el.querySelector('[data-lsb-shell-theme]'))
      adoptUserCard(el.querySelector('[data-lsb-shell-me]'))
      adoptAsideCards(el.querySelector('[data-lsb-shell-site]'))
      watchOnlineCard()
      watchTopExtras()
      setSection(el.querySelector('[data-lsb-shell-section="home"]'), '', [
        { href: '/', label: '全部主题' },
      ])
      setSection(el.querySelector('[data-lsb-shell-section="boards"]'), '版块', collectBoards())
      setSection(el.querySelector('[data-lsb-shell-section="tools"]'), '工具', pluginCatalog.tools())
      syncShellRoute(el)
      syncShellScrollBridge(canvasHomeScrollRoot() || contentController.scroller)
      syncHomeInfiniteScroll()
      syncShellMedia()
      return el
    }

    function refreshRouteEnhancements(serial) {
      if (!spaController.isCurrent(serial)) return false
      applyMarkers()
      fillShell()
      refreshNativeRouteEnhancements()
      onlineController.scheduleRefresh(0, true, true)
      if (!spaController.isCurrent(serial)) return false
      try {
        const EventCtor = window.CustomEvent || CustomEvent
        document.dispatchEvent(new EventCtor(SPA_ROUTE_COMMITTED_EVENT, {
          detail: { href: location.href, serial },
        }))
      } catch {
        /* A native enhancement hook is optional and must not block routing. */
      }
      spaController.markFilled(serial)
      return true
    }

    function stashView(key) {
      if (!key) return
      try {
        const normalized = new URL(key, location.origin).href
        if (!isSpaUrl(normalized)) return
        canvasSyncPersistentSiteCards()
        if (topicSpaUrl(normalized)) return
      } catch {
        return
      }
      /* Non-persistent cards are temporarily mounted outside their native
         sidebar while the canvas is active.  Restore those cards before moving
         the route outlet into the SPA cache; persistent cards stay mounted in
         the canvas and keep their hidden origin markers. */
      restoreAsideCards()
      canvasStopSidebarWatch()
      canvasRestoreSiteSidebar()
      canvasRestoreProfile()
      restoreDetachedNativeSidebars()
      const outlet = findRouteOutlet()
      if (!outlet?.firstChild) return
      if (containsTopicPostContent(outlet)) return
      const frag = document.createDocumentFragment()
      while (outlet.firstChild) frag.appendChild(outlet.firstChild)
      rememberView(key, {
        frag,
        title: document.title,
        head: captureRouteHead(),
        scrollX: currentScrollX(),
        scrollY: currentScrollY(),
        live: true,
        attrs: snapshotOutletAttrs(outlet),
      })
    }

    function topicTargetId(urlLike = location.href) {
      const url = topicSpaUrl(urlLike)
      if (!url) return ''
      const replyid = url.searchParams.get('replyid') || ''
      if (/^[1-9]\d*$/.test(replyid)) return `#post-${replyid}`
      const floor = url.searchParams.get('floor') || ''
      if (/^[1-9]\d*$/.test(floor)) return `[data-floor="${floor}"]`
      return ''
    }

    function scrollToTopicTarget(urlLike = location.href) {
      const selector = topicTargetId(urlLike)
      let node = null
      if (selector) {
        try {
          node = document.querySelector(selector)
        } catch {
          node = null
        }
      }
      if (node) {
        node.scrollIntoView?.({ block: 'center' })
        return true
      }
      let hash = ''
      try {
        hash = new URL(urlLike, location.href).hash
      } catch {
        return false
      }
      if (!hash) return false
      try {
        const id = decodeURIComponent(hash.slice(1))
        node = document.getElementById(id) || document.querySelector(hash)
      } catch {
        return false
      }
      node?.scrollIntoView?.()
      return !!node
    }

    function currentScrollRoot() {
      if (canvasScrollController.target instanceof Element) return canvasScrollController.target
      if (contentController.scroller instanceof Element) return contentController.scroller
      return null
    }

    function currentScrollY() {
      const root = currentScrollRoot()
      const rootY = root ? Number(root.scrollTop || 0) : 0
      if (rootY > 0) return rootY
      return Number(window.scrollY || window.pageYOffset || 0)
    }

    function currentScrollX() {
      const root = currentScrollRoot()
      const rootX = root ? Number(root.scrollLeft || 0) : 0
      if (rootX > 0) return rootX
      return Number(window.scrollX || window.pageXOffset || 0)
    }

    function scrollCurrentRootTo(x = 0, y = 0) {
      const root = currentScrollRoot()
      if (root) {
        const nextX = Math.max(0, Number(x) || 0)
        const nextY = Math.max(0, Number(y) || 0)
        root.scrollLeft = nextX
        root.scrollTop = nextY
        // 保留 window.scrollTo 通知，兼容依赖窗口滚动语义的站点脚本和历史测试；实际滚动仍由面板承载。
        window.scrollTo(nextX, nextY)
        canvasScheduleScroll()
        return
      }
      window.scrollTo(x, y)
    }

    function perfHref() {
      try {
        return location.pathname + location.search
      } catch {
        return ''
      }
    }

    function perfEmit(name, ms) {
      try {
        if (!api.hasHandler('perf-probe:record')) return
        api.emitGlobal('perf:span', {
          name,
          plugin: 'skin',
          ms,
          href: perfHref(),
          t: Date.now(),
        })
      } catch {
        /* 探针失败不得打断壳 */
      }
    }

    function perfSpan(name, fn) {
      if (!api.hasHandler('perf-probe:record')) return fn()
      const t0 = performance.now()
      try {
        return fn()
      } finally {
        perfEmit(name, performance.now() - t0)
      }
    }

    async function perfSpanAsync(name, fn) {
      if (!api.hasHandler('perf-probe:record')) return fn()
      const t0 = performance.now()
      try {
        return await fn()
      } finally {
        perfEmit(name, performance.now() - t0)
      }
    }

    const runtimeController = createSkinRuntimeController({
      window, document, configController, timelineController, mediaController,
      onlineController, viewCacheController, spaController, canvasHostController, shellTokenProps,
      getSettingsController: () => settingsController,
      challengeAttr: CLOUDFLARE_CHALLENGE_ATTR, isChallengeDocument: isCloudflareChallengeDocument,
      hooks: {
        asideWide,
        restyle,
        markNative,
        currentScrollX,
        currentScrollY,
        scrollCurrentRootTo,
        clearNativeRouteEnhancements,
        unbindWindow,
        unbindWindowInteractions,
        unbindAsideResize,
        stopOnlineWatch,
        stopExtrasWatch,
        destroyAsideViews,
        unmountCanvas,
        unmountShellWindows,
        restoreAsideCards,
        restoreAsidePersistentCards,
        restoreUserCard,
        restoreTopExtras,
        restoreThemeToggle,
        restoreSearch,
        unbindHomeInfiniteScroll,
        refreshNativeRouteEnhancements,
        bindAsideResize,
        mountCanvas,
        fillShell,
        syncHomeInfiniteScroll,
        syncShellMedia,
        adoptSearch,
        shellSearchHost,
        adoptThemeToggle,
        adoptUserCard,
        findRouteOutlet,
        canvasMountProfile,
        canvasSurface,
        canvasSyncSiteSidebar,
      },
    })
    const { applyAll, scheduleRefresh } = runtimeController

    const settingsController = createSkinSettingsController({
      document, ui: api.ui, getConfig: () => api.config(), saveConfig: (patch) => api.saveConfig(patch),
      configController, mediaController, applyAll,
    })
    api.ui.configTab({ name: '界面精修', order: 80, render: settingsController.render })

    settingsController.syncMenu()

    api.on('config:changed:skin', runtimeController.onConfigChanged)
    api.on('route:changed', () => {
      scheduleRefresh(true)
    })
    api.on('plugin:activated', () => {
      scheduleRefresh(false)
    })
    api.on('plugin:disabled', () => {
      scheduleRefresh(false)
    })
    api.on('topic:posts-added', scheduleTimeline)
    api.dom.each(
      '.dark-mode-control, [data-themes-mode-toggle], a.color-scheme-top-link, a.search-page-link, form.search-form, form.meilisearch-search-top-form, form[role="search"][aria-label="站内搜索"], .sidebar-card.user-card',
      runtimeController.onNativeNode,
    )

    api.onDispose(runtimeController.dispose)

    api.handle('skin:debug', () => ({
      active: { ...configController.config },
      markers: [...document.documentElement.classList].filter((c) => c.startsWith('lsb-skin-')),
      styleBytes: (document.getElementById('lsb-skin-style')?.textContent || '').length,
      themesPluginDetected: themesPresent,
      canvas: canvasDebugSnapshot(),
      shell: {
        on: !!configController.config.shell,
        mounted: !!document.getElementById('lsb-shell'),
        boards: collectBoards().length,
        location: locationText(),
        timeline: !!document.getElementById('lsb-shell-timeline'),
        me: !!document.querySelector('#lsb-shell .sidebar-card.user-card'),
        extras: document.querySelectorAll('.lsb-shell-extras a').length,
        aside: document.querySelectorAll('#lsb-shell-aside .sidebar-card').length,
        spa: spaController.bound,
        windows: windowController.registry.map((item) => {
          const host = shellHost(item.id)
          const rect = host?.getBoundingClientRect?.()
          const body = host?.querySelector?.('[data-lsb-shell-window-body]')
          return {
            id: item.id,
            visible: !host?.hidden,
            rect: rect ? { x: rect.x, y: rect.y, width: rect.width, height: rect.height } : null,
            scrollTop: Number(body?.scrollTop || 0),
          }
        }),
        layoutKey: windowController.layout ? shellLayoutApi.layoutStorageKey(location.origin, shellLayoutApi.widthBucket(shellViewport(shellWorkspace()).width)) : '',
        scrollBridge: !!contentController.bridge,
      },
    }))

    applyAll()

    return {}
  }

  const w = typeof unsafeWindow !== 'undefined' ? unsafeWindow : window
  if (w.LSB && w.LSB.register) w.LSB.register(manifest, setup)
  else (w.LSB_PLUGINS = w.LSB_PLUGINS || []).push({ manifest, setup })
})()


;
/* ══════════════ LSB·实时流 v1.2.21 (live-feed) ══════════════ */
(function () {
  'use strict'

  const manifest = {
    id: 'live-feed',
    name: '实时流',
    version: '1.2.21',
    description: '新帖/新回复免刷新送达：视口锚点无感插入 + 打字免打扰 + 新动态高亮并同步评论数',
    author: 'you',
    requires: { base: '^0.1.0' },
    permissions: ['read', 'storage', 'ui', 'events'],
    config: {
      pollSec: { type: 'number', label: '前台轮询间隔 (秒)', default: 30 },
      bgSec: { type: 'number', label: '后台标签轮询间隔 (秒)', default: 150 },
      toastOnNew: { type: 'switch', label: '发现新内容时弹提示', default: true },
      notifyDesktop: { type: 'switch', label: '桌面通知', default: false },
      autoInsert: { type: 'switch', label: '自动插入（时机合适时免点击）', default: true },
      anchorScroll: {
        type: 'switch',
        label: '视口锚点补偿（插入时画面不跳动）',
        default: true,
        desc: '关闭后仅在页面顶部自动插入，其余情况出横幅',
      },
      pauseWhileTyping: {
        type: 'switch',
        label: '写回复期间不自动插入',
        default: true,
        desc: '仍会照常检查并出横幅，写完自动补上',
      },
      highlightBumped: { type: 'switch', label: '老帖有新回复时原地高亮', default: true },
      trackTopicReplies: { type: 'switch', label: '跟踪当前帖新回复', default: true },
      maxInsert: { type: 'number', label: '单次最多加载数', default: 30 },
      jitterMs: { type: 'number', label: '选主随机延迟 (ms)', default: 800 },
    },
  }

  /** 锚点补偿的持续帧数：图片/字体late load 会继续改变高度，单帧校正不够 */
  const ANCHOR_FRAMES = 8
  /** 补偿期间用户自己滚动的容差（px）：超出即让位，绝不与用户抢滚动条 */
  const USER_SCROLL_TOLERANCE = 24
  /** 帖子页「回复顶到新页」时本轮最多追补几页 */
  const MAX_PAGE_CATCHUP = 3

  function setup(api) {
    let cfg = api.config()
    api.on('config:changed:live-feed', () => {
      cfg = api.config()
      if (shouldPoll()) scheduleNext()
    })

    /* ── 消息侧：复用未读哨兵的消息箱做「新消息」计数（哨兵缺席则静默降级） ── */
    let msgBase = null // 激活时的消息箱长度基线
    async function msgDelta() {
      try {
        const d = await api.request('unread-sentinel:debug')
        const n = d.inbox().length
        if (msgBase == null) msgBase = n
        return Math.max(0, n - msgBase)
      } catch {
        return 0
      }
    }

    /* ── 页面模式与基线 ── */
    let mode = null // 'list' | 'topic'
    let ctx = {} // list: {ul, seen:Map<id,fp>, maxId, maxTs, sort}  topic: {tid, ul, maxPostId, pages}
    let pending = [] // 待展示的新条目（保留来源文档节点，插入时 importNode）
    let banner = null
    let bannerAction = null
    let navGen = 0

    function captureContext() {
      return {
        gen: navGen,
        mode,
        ul: ctx.ul || null,
        tid: mode === 'topic' ? Number(ctx.tid) || 0 : 0,
      }
    }

    function currentListUl() {
      const selector = api.sel?.listUl || 'ul.post-list'
      const outlets = document.querySelectorAll('#lsb-shell-window-content main.wrap, .lsb-canvas-content-root, .main-panel')
      for (const outlet of outlets) {
        for (const ul of outlet.querySelectorAll(selector)) {
          // 帖子楼层也带 post-list 类，且可能留在隐藏的旧出口或缓存 DOM 中。
          // 只接受当前路由出口中真正的列表容器，避免把帖子正文识别成首页实时流列表。
          if (ul.classList.contains('topic-post-list')) continue
          if ([...ul.children].some((child) => child.classList.contains('post-entry'))) continue
          return ul
        }
      }
      return null
    }

    function currentTopicUl() {
      return document.querySelector(api.sel?.topicUl || 'ul.topic-post-list, ul.post-list')
    }

    function currentRoutePage() {
      try {
        return api.parse.detectPage(location)
      } catch {
        return api.page || {}
      }
    }

    function contextActive(token) {
      if (!token || token.gen !== navGen || token.mode !== mode) return false
      if (!(token.ul?.nodeType === 1) || !token.ul.isConnected || ctx.ul !== token.ul) return false
      const page = currentRoutePage()
      if (token.mode === 'topic') {
        return page.type === 'topic'
          && Number(page.id) === token.tid
          && api.page?.type === 'topic'
          && Number(api.page.id) === token.tid
          && Number(ctx.tid) === token.tid
          && currentTopicUl() === token.ul
      }
      if (token.mode !== 'list') return false
      const pageType = page.type
      const listPage = pageType === 'home'
        || pageType === 'forum'
        || pageType === 'featured'
        || pageType === 'footprint'
        || isUserTopicList(page)
      return listPage && currentListUl() === token.ul
    }

    /**
     * 列表条目的「新鲜度指纹」：回复数 + 最后活跃时间。
     * 用它替代单纯的「见过/没见过」，才能区分三种状态：
     *   没见过 → 新帖（插入）
     *   见过且指纹不变 → 无动静（什么都不做）
     *   见过但指纹变了 → 老帖有新回复（原地高亮，不重复插入）
     * 指纹取自 parse.listItem 的结构化字段，不靠猜图标（逛吧靠匹配 SVG path 的 d
     * 属性来分辨「这个数字是回复数还是浏览数」，站点换图标即失效）。
     */
    function freshnessOf(it) {
      return `${it.replies ?? ''}#${it.lastActiveTs ?? 0}`
    }

    function isListRow(li) {
      return li && !li.classList.contains('notification-item') && !li.classList.contains('post-entry')
    }

    function listSort() {
      if (api.page.type === 'user') return api.page.tab === 'replies' ? 'comment' : 'post'
      return api.page.sort === 'comment' ? 'comment' : 'post'
    }

    function isUserTopicList(page = api.page) {
      if (page?.type !== 'user') return false
      const tab = page.tab || 'topics'
      return tab === 'topics' || tab === 'replies'
    }

    function shouldPoll() {
      return election.isLeader || isUserTopicList()
    }

    function isTopicListPage() {
      const t = api.page?.type
      if (t === 'home' || t === 'forum' || t === 'featured' || t === 'hot_discussions' || t === 'footprint') return true
      return isUserTopicList()
    }

    function captureList() {
      const ul = currentListUl()
      if (!ul) return false
      if (ul.querySelector('li.notification-item')) return false
      const seen = new Map()
      let maxId = 0
      let maxTs = 0
      for (const li of ul.querySelectorAll('li.post-item')) {
        if (!isListRow(li)) continue
        const it = api.parse.listItem(li)
        if (it?.id) {
          seen.set(it.id, freshnessOf(it))
          maxId = Math.max(maxId, it.id)
          maxTs = Math.max(maxTs, it.lastActiveTs || 0)
        }
      }
      ctx = { ul, seen, maxId, maxTs, sort: listSort(), prime: listSort() === 'comment' }
      mode = 'list'
      return true
    }

    function captureTopic() {
      const tid = api.page.type === 'topic' ? api.page.id : null
      if (!tid) return false
      const t = api.snapshot?.topic
      const ul = document.querySelector(api.sel?.topicUl || 'ul.topic-post-list, ul.post-list')
      if (!t || !ul) return false
      const posts = [...document.querySelectorAll('li.post-entry')]
      const seenPosts = new Set()
      let maxPostId = 0
      for (const li of posts) {
        const id = Number((li.id || '').match(/^post-(\d+)/)?.[1] || 0)
        if (!id) continue
        seenPosts.add(id)
        maxPostId = Math.max(maxPostId, id)
      }
      ctx = { tid, ul, maxPostId, pages: t.pages || 1, seenPosts }
      mode = 'topic'
      return true
    }

    /** 当前讨论串里已经出现过的楼（含站点 AJAX 自己插进来的）。不能用「最大 id」当水位：自己刚发出的回复 id 更新，会把中间还没插入的别人回复从暂存里冲掉。 */
    function ackLivePost(id) {
      if (!id || mode !== 'topic') return
      if (!ctx.seenPosts) ctx.seenPosts = new Set()
      ctx.seenPosts.add(id)
    }

    function isKnownPost(id) {
      if (!id) return true
      return !!(ctx.seenPosts?.has(id) || document.getElementById('post-' + id))
    }

    function init() {
      teardown()
      navGen += 1
      if (api.page.type === 'topic' && cfg.trackTopicReplies) {
        if (!captureTopic()) mode = null
        return
      }
      if (!isTopicListPage()) {
        mode = null
        return
      }
      if (!captureList()) mode = null
    }

    function teardown() {
      clearBumps()
      banner?.remove()
      banner = null
      bannerAction = null
      pending = []
      mode = null
      ctx = {}
    }

    function pinnedCount() {
      if (!ctx.ul || mode !== 'list') return 0
      let c = 0
      for (const li of ctx.ul.children) {
        // 置顶帖始终保持在最顶部，实时新帖插在其后
        if (li.classList.contains('topic-pinned') || li.querySelector('.topic-badge.pinned')) c++
        else break
      }
      return c
    }

    /* ── 样式 ── */
    api.ui.style(`
      .lsb-live-banner{cursor:pointer;display:flex;align-items:center;justify-content:center;gap:8px;
        margin:8px 0;padding:9px 12px;border:1px dashed var(--brand,#5eaaa0);border-radius:10px;
        background:var(--brand-soft,#eef7f5);color:var(--brand-hover,#3d7a72);list-style:none;
        font-size:13px;font-weight:600;text-align:center}
      .lsb-live-banner:hover{border-style:solid}
      .lsb-live-banner .lsb-live-dot{flex:0 0 auto;width:7px;height:7px;border-radius:50%;
        background:var(--brand,#5eaaa0);animation:lsb-live-pulse 1.6s ease-in-out infinite}
      .lsb-live-banner.is-topic{margin:10px auto}
      .lsb-live-banner.is-quiet{border-style:solid;opacity:.85;font-weight:500}
      @keyframes lsb-live-pulse{50%{opacity:.25}}
      li.post-item.lsb-live-bumped{animation:lsb-live-bump 2.4s ease-out;opacity:1}
      li.post-item.lsb-seen.lsb-live-bumped{opacity:1}
      li.post-item.lsb-seen.lsb-live-bumped .post-title{color:inherit}
      li.post-item.lsb-seen.lsb-live-bumped img{filter:none}
      @keyframes lsb-live-bump{
        0%,28%{background:var(--brand-soft,#eef7f5);box-shadow:inset 4px 0 0 var(--brand,#5eaaa0)}
        100%{background:transparent;box-shadow:none}
      }
    `)

    function showBanner(text, onClick, { asTopic = false, quiet = false, token = null } = {}) {
      if (token && !contextActive(token)) return false
      // 动作存在可变引用里：横幅语义会随状态变化（「点击加载」→「已加载，回顶部」），
      // 旧实现只在创建时绑一次 onClick，后续传入的新动作会被静默忽略。
      bannerAction = onClick
      if (!banner) {
        banner = document.createElement(asTopic ? 'div' : 'li')
        banner.className = 'lsb-live-banner' + (asTopic ? ' is-topic' : '')
        banner.innerHTML = '<span class="lsb-live-dot"></span><span class="lsb-live-txt"></span>'
        banner.addEventListener('click', () => bannerAction?.())
      }
      banner.classList.toggle('is-quiet', !!quiet)
      if (asTopic) {
        const form = document.querySelector('form.ajax-reply-form')
        const host = form?.parentElement || ctx.ul?.parentElement
        if (host && banner.parentElement !== host) host.insertBefore(banner, form || ctx.ul.nextSibling)
      } else if (ctx.ul) {
        const pos = pinnedCount()
        const ref = ctx.ul.children[pos]
        if (banner.parentElement !== ctx.ul || banner.nextElementSibling !== ref) {
          if (ref) ctx.ul.insertBefore(banner, ref)
          else ctx.ul.appendChild(banner)
        }
      }
      banner.querySelector('.lsb-live-txt').textContent = text
      banner.style.display = ''
    }

    function hideBanner() {
      if (banner) banner.style.display = 'none'
    }

    /* ══════════════ 视口锚点：插入内容后画面不跳动 ══════════════
     * 记「哪个条目在视口的什么高度」，插完再把它挪回原高度。
     * 锚用内容标识（topicId / postId）而非像素，所以即便在锚上方插了 20 条也能精确回补——
     * 这正是可以取消「必须停在页面顶部」这一前提的原因。
     *
     * 相比逛吧的实现多做三件事：
     *   ① 多帧持续校正（图片/字体延迟加载会继续改变高度，单帧校正会残留偏移）
     *   ② 备用锚（首选锚可能因屏蔽/删除而消失，逐个回退）
     *   ③ 检测用户主动滚动并立即让位（绝不与用户抢滚动条）
     */
    function anchorItems() {
      if (mode === 'topic') return [...document.querySelectorAll('li.post-entry')]
      return ctx.ul ? [...ctx.ul.querySelectorAll(':scope > li.post-item')] : []
    }

    function anchorKeyOf(el) {
      if (mode === 'topic') {
        const m = (el.id || '').match(/^post-(\d+)$/)
        return m ? 'post-' + m[1] : null
      }
      const href = el.querySelector('a.post-title[href*="/topic/"]')?.getAttribute('href') || ''
      const m = href.match(/\/topic\/(\d+)/)
      return m ? 'topic-' + m[1] : null
    }

    function findAnchorEl(key) {
      if (key.startsWith('post-')) return document.getElementById(key)
      const id = key.slice('topic-'.length)
      for (const el of anchorItems()) {
        if (el.querySelector(`a.post-title[href*="/topic/${id}"]`)) return el
      }
      return null
    }

    function scrollTop() {
      return window.scrollY ?? window.pageYOffset ?? 0
    }

    function captureAnchor() {
      if (!cfg.anchorScroll) return null
      const vh = window.innerHeight || 0
      const cands = []
      for (const el of anchorItems()) {
        const r = el.getBoundingClientRect?.()
        if (!r) continue
        // 跨过视口顶线或位于视口内的条目才有参考价值
        if (r.bottom > 0 && r.top < vh) {
          const key = anchorKeyOf(el)
          if (key) cands.push({ key, top: r.top })
          if (cands.length >= 3) break // 首选 + 两个备用足够
        }
      }
      if (!cands.length) return null
      return { cands, scrollY: scrollTop(), at: Date.now() }
    }

    let anchorFrames = 0 // 供测试观察补偿是否真的跑过
    function restoreAnchor(anchor) {
      if (!anchor || typeof window.requestAnimationFrame !== 'function') return
      let expected = anchor.scrollY
      let frame = 0
      const step = () => {
        // 用户在补偿窗口内自己滚了 → 让位，不再纠正
        if (Math.abs(scrollTop() - expected) > USER_SCROLL_TOLERANCE) return
        const hit = anchor.cands.map((c) => ({ c, el: findAnchorEl(c.key) })).find((x) => x.el)
        if (!hit) return // 三个锚都没了（被屏蔽/删除）：宁可不动也不乱跳
        const delta = hit.el.getBoundingClientRect().top - hit.c.top
        if (Math.abs(delta) > 1) {
          window.scrollBy?.(0, delta)
          expected = scrollTop()
          anchorFrames++
        }
        if (++frame < ANCHOR_FRAMES) requestAnimationFrame(step)
      }
      // 双帧起步：等浏览器完成本次插入引起的重排
      requestAnimationFrame(() => requestAnimationFrame(step))
    }

    /* ══════════════ 打字保护 ══════════════
     * 正在写回复时往 DOM 里插内容会顶走焦点、打断输入法候选，最坏情况让人丢草稿。
     *
     * 与逛吧的关键差别（它那套有两个会让功能永久停摆的坑）：
     *   ① 它扫描全页所有 textarea/input，任何一个有内容就判定「在编辑」——
     *      搜索框里剩个关键词、站点预填了值，实时流就永久停摆。这里只看
     *      回复/发帖表单的正文框。
     *   ② 它在编辑期间连「抓取」都停。这里只暂停「自动插入」：照常抓、照常出横幅，
     *      用户想看随时点，写完自动补上。功能降级而非罢工。
     */
    const EDITOR_FOCUS_SELECTOR =
      'textarea,[contenteditable="true"],[contenteditable=""],' +
      'input:not([type=radio]):not([type=checkbox]):not([type=submit]):not([type=button]):not([type=reset])'
    const DRAFT_SELECTOR = [
      'form.ajax-reply-form textarea',
      'form[action="/reply_edit"] textarea',
      'form[action="/topic_edit"] textarea',
      'textarea[name="body"]',
      'textarea[name="content"]',
    ].join(',')

    function isTyping() {
      if (!cfg.pauseWhileTyping) return false
      const a = document.activeElement
      if (a && a !== document.body && a.matches?.(EDITOR_FOCUS_SELECTOR)) return true
      for (const ta of document.querySelectorAll(DRAFT_SELECTOR)) {
        if (ta.disabled || ta.hidden || ta.closest('[hidden]')) continue
        if (String(ta.value ?? '').trim() !== '') return true // 草稿未清空：也算在写
      }
      return false
    }

    function liveDoc(path) {
      // 当前页巡检不能进全站闸门：哨兵一启动会拉整页通知，称号行情也 30 秒一轮，
      // 排在它们后面时实时流整段停摆。氢壳无限滚动同样 queue:false。
      return api.net.doc(path, { queue: false })
    }
    function listUrl() {
      if (api.page.type === 'forum') {
        return api.routes.forum(api.page.id, { sort: ctx.sort === 'post' ? 'post' : undefined })
      }
      // 首页：沿用当前 URL 的排序参数、剥掉页码——轮询与视图同一条流，杜绝串台误报
      const q = new URLSearchParams(location.search)
      q.delete('p')
      const qs = q.toString()
      return location.pathname.replace(/\/+$/, '') + (qs ? '?' + qs : '') || '/'
    }

    let lastBumped = 0
    const bumpTimers = []
    function numericMetaSpans(root) {
      return [...(root?.querySelectorAll?.('.post-meta span') || [])]
        .filter((el) => /^\d[\d,]*$/.test(el.textContent.trim()))
    }

    /** 只更新评论数的文字节点，保留站点放在同一 span 里的图标和其它标记。 */
    function syncReplyCount(row, src, replies) {
      if (replies == null) return
      const target = numericMetaSpans(row).at(-1)
      if (!target) return
      const source = numericMetaSpans(src).at(-1)
      const display = source?.textContent.trim() || String(replies)
      const walker = document.createTreeWalker(target, 4)
      const textNodes = []
      let node
      while ((node = walker.nextNode())) textNodes.push(node)
      if (textNodes.length) {
        textNodes.forEach((textNode, i) => {
          textNode.nodeValue = i === textNodes.length - 1 ? display : ''
        })
      } else {
        target.appendChild(document.createTextNode(display))
      }
    }

    function notifyListRowUpdated(id) {
      try {
        api.emitGlobal('live-feed:list-row-updated', { id })
      } catch {
        /* 已读插件缺席不得影响实时流 */
      }
    }

    function attachNativeUnread(row, src) {
      const from = src?.querySelector?.('a.unread-topic-notice')
      if (!row || !from || row.querySelector('a.unread-topic-notice')) return
      const node = document.importNode(from, true)
      const title = row.querySelector('a.post-title:not(.post-author)')
      if (title) title.after(node)
      else row.querySelector('.post-title-row')?.appendChild(node)
    }
    function markBumped(items, token = captureContext()) {
      if (!contextActive(token)) return
      lastBumped = items.length
      if (!items.length || !ctx.ul) return
      for (const it of items) {
        const row = ctx.ul.querySelector(`:scope > li.post-item a.post-title[href*="/topic/${it.id}"]`)
          ?.closest('li.post-item')
        if (!row) continue
        // 轮询返回的是同一帖的最新行：同步评论数，不能只复制未读点和高亮。
        syncReplyCount(row, it.el, it.replies)
        // 站点刷新会在标题旁留「未读」红点；高亮只闪 2.6 秒，点要一直留到用户进帖。
        attachNativeUnread(row, it.el)
        if (cfg.highlightBumped) {
          row.classList.remove('lsb-live-bumped')
          void row.offsetWidth
          row.classList.add('lsb-live-bumped')
          const tid = setTimeout(() => row.classList.remove('lsb-live-bumped'), 2600)
          bumpTimers.push(tid)
        }
        // 已读插件在这里重新检查水位，避免软跳缓存里的旧提示被重新挂回。
        notifyListRowUpdated(it.id)
      }
    }

    function clearBumps() {
      for (const t of bumpTimers.splice(0)) clearTimeout(t)
      document.querySelectorAll('li.post-item.lsb-live-bumped').forEach((row) => row.classList.remove('lsb-live-bumped'))
    }

    function announceNew(kind, n) {
      if (!n) return
      if (cfg.toastOnNew) api.ui.toast(`发现 ${n} 条新${kind}`, { title: '实时流' })
      if (cfg.notifyDesktop && typeof Notification !== 'undefined') {
        try {
          if (Notification.permission === 'granted') {
            new Notification(`linux.sb · ${n} 条新${kind}`)
          } else if (Notification.permission === 'default') {
            Notification.requestPermission()
          }
        } catch {
          /* 无通知环境 */
        }
      }
    }

    async function cycleList() {
      const token = captureContext()
      const seen = ctx.seen
      if (!contextActive(token) || !seen) return 0
      const doc = await liveDoc(listUrl())
      if (!contextActive(token) || ctx.seen !== seen) return 0
      const isPost = ctx.sort === 'post'
      // 回复流首页每条评论都在转：存档还回后立刻 cycle 会把整页热帖当成「新的」。
      // 第一轮只对齐水位，真正的增量留给之后的巡检。发布流不这么做——还回首页仍要立刻插入新 id。
      const priming = !!ctx.prime && !isPost
      const bumped = []
      for (const li of doc.querySelectorAll('li.post-item')) {
        if (!isListRow(li)) continue
        const it = api.parse.listItem(li)
        if (!it?.id) continue
        const fp = freshnessOf(it)
        if (it.pinned) {
          ctx.seen.set(it.id, fp) // 置顶帖不参与新帖判定，但要记指纹免得当成新动态
          continue
        }
        const prev = ctx.seen.get(it.id)
        if (prev === undefined) {
          // 序数守卫：发布流只认 id 创新高的真·新帖；回复流只认活跃时间创新的。
          // 对侧流的旧帖即便没见过也不算数——这是「1 个说成 40+」的根因。
          if (!priming && (isPost ? it.id > ctx.maxId : (it.lastActiveTs || 0) > ctx.maxTs)) {
            pending.push(it)
            if (pending.length > 200) pending.shift()
          }
          ctx.seen.set(it.id, fp) // 无论是否计入，见过的都不再当新帖
          if (priming) {
            ctx.maxTs = Math.max(ctx.maxTs, it.lastActiveTs || 0)
            ctx.maxId = Math.max(ctx.maxId, it.id)
          }
        } else if (prev !== fp) {
          // 已在列表里、但回复数/活跃时间变了 → 老帖有新动态：原地高亮而非重复插入
          bumped.push(it)
          ctx.seen.set(it.id, fp)
        }
      }
      if (priming) ctx.prime = false
      markBumped(bumped, token)

      if (!pending.length) {
        if (!bumped.length) hideBanner()
        return 0
      }
      if (!contextActive(token)) return 0
      announceNew('帖', pending.length)
      ctx.maxId = Math.max(ctx.maxId, ...pending.map((x) => x.id))
      ctx.maxTs = Math.max(ctx.maxTs, ...pending.map((x) => x.lastActiveTs || 0))
      const n = pending.length
      if (!contextActive(token)) return 0
      await flushOrOffer(token)
      return n
    }

    /** 距页面顶部足够近（用于决定插入后是否需要提示「已加载」） */
    function nearTop() {
      return scrollTop() < 240
    }

    /**
     * 有待插入内容时的统一决策：能插就插，不能插就出横幅等用户。
     * 「能插」= 自动插入已开启 + 不在打字 + 页面可见 +（锚点补偿可用 或 就在顶部）。
     */
    function canFlushNow() {
      if (!cfg.autoInsert || !pending.length) return false
      if (document.visibilityState === 'hidden') return false // 看不见时不动，切回来再补
      if (isTyping()) return false
      return cfg.anchorScroll || nearTop()
    }

    async function flushOrOffer(token) {
      if (!contextActive(token) || !pending.length) return
      if (canFlushNow()) {
        const away = !nearTop()
        const n = insertPending(true, token)
        // 在视口外静默插入后仍然告知一声，并给一键回顶——内容不过期，用户也不失去感知。
        // （逛吧只是静默插入，用户不知道上面多了东西）
        if (n && contextActive(token) && away) {
          showBanner(`▲ 已加载 ${n} 条新帖 — 点击回到顶部`, () => {
            if (!contextActive(token)) return
            hideBanner()
            window.scrollTo?.({ top: 0, behavior: 'smooth' })
          }, { quiet: true, token })
        }
        return
      }
      const m = await msgDelta()
      if (!contextActive(token) || !pending.length) return
      const why = isTyping() ? '（写完自动加载）' : ''
      showBanner(
        `▲ ${pending.length} 条新帖${m ? ` · ${m} 条新消息` : ''} — 点击加载${why}`,
        () => insertPending(false, token),
        { token },
      )
    }

    function insertPending(silent = false, token = captureContext()) {
      if (!contextActive(token) || !pending.length) return 0
      const anchor = captureAnchor()
      hideBanner()
      const frag = document.createDocumentFragment()
      const batch = pending.splice(0, cfg.maxInsert)
      for (const it of batch) {
        const node = document.importNode(it.el, true)
        const notices = [...node.querySelectorAll('a.unread-topic-notice')]
        notices.slice(1).forEach((n) => n.remove())
        frag.appendChild(node)
      }
      // 插入到置顶帖之后，保持置顶始终在最顶部
      const pos = pinnedCount()
      const ref = ctx.ul.children[pos]
      if (ref) ctx.ul.insertBefore(frag, ref)
      else ctx.ul.appendChild(frag)
      restoreAnchor(anchor)
      if (!silent) api.ui.toast(`已加载 ${batch.length} 条新帖`, { title: '实时流', type: 'success' })
      if (pending.length) showBanner(
        `▲ 还有 ${pending.length} 条新帖 — 继续加载`,
        () => insertPending(false, token),
        { token },
      )
      return batch.length
    }

    /* ── 轮询：帖子模式 ── */
    async function cycleTopic() {
      const token = captureContext()
      const tid = token.tid
      if (!contextActive(token) || !tid) return 0
      const fresh = new Map() // postId → post（跨页去重）
      const absorb = (t) => {
        for (const p of t.posts) {
          if (!p.postId || fresh.has(p.postId)) continue
          if (p.el?.classList?.contains('quote-threads-child')) {
            ackLivePost(p.postId)
            ctx.maxPostId = Math.max(ctx.maxPostId || 0, p.postId)
            continue
          }
          if (isKnownPost(p.postId)) {
            ackLivePost(p.postId)
            ctx.maxPostId = Math.max(ctx.maxPostId || 0, p.postId)
            continue
          }
          fresh.set(p.postId, p)
        }
      }

      // 新回复总在最后一页
      let t = api.parse.topic(await liveDoc(api.routes.topic(tid, Math.max(1, ctx.pages || 1))))
      if (!contextActive(token)) return 0
      absorb(t)
      // 回复把帖子顶到了新页：本轮立即追补，不必等下一个周期。
      // 否则每次翻页都会让新页的首批回复延迟一整个轮询间隔才出现。
      for (let i = 0; i < MAX_PAGE_CATCHUP && t.pages > ctx.pages; i++) {
        ctx.pages = t.pages
        t = api.parse.topic(await liveDoc(api.routes.topic(tid, ctx.pages)))
        if (!contextActive(token)) return 0
        absorb(t)
      }
      if (t.pages > ctx.pages) ctx.pages = t.pages

      if (!contextActive(token) || !fresh.size) return 0
      pending = [...fresh.values()].sort((a, b) => a.floor - b.floor)
      if (!contextActive(token)) return 0
      const n = pending.length
      announceNew('回复', n)
      if (cfg.autoInsert && !isTyping() && document.visibilityState !== 'hidden') {
        insertFloors(true, token)
        return n
      }
      const m = await msgDelta()
      if (!contextActive(token) || !pending.length) return 0
      const why = isTyping() ? '（写完自动加载）' : ''
      showBanner(
        `↓ ${n} 条新回复${m ? ` · ${m} 条新消息` : ''} — 点击加载${why}`,
        () => insertFloors(false, token),
        { asTopic: true, token },
      )
      return n
    }

    function insertFloors(silent = false, token = captureContext()) {
      if (!contextActive(token) || !pending.length) return 0
      const anchor = captureAnchor()
      let n = 0
      for (const p of pending) {
        if (p.postId && document.getElementById('post-' + p.postId)) {
          ackLivePost(p.postId)
          ctx.maxPostId = Math.max(ctx.maxPostId || 0, p.postId)
          continue
        }
        if (p.el?.classList?.contains('quote-threads-child')) {
          ackLivePost(p.postId)
          continue
        }
        ctx.ul.appendChild(document.importNode(p.el, true))
        if (p.postId) {
          ackLivePost(p.postId)
          ctx.maxPostId = Math.max(ctx.maxPostId || 0, p.postId)
        }
        n += 1
      }
      pending = []
      hideBanner()
      restoreAnchor(anchor)
      if (!silent && n) api.ui.toast(`已加载 ${n} 条新回复`, { title: '实时流', type: 'success' })
      return n
    }

    /* ── 时机到了就把暂存内容补上（事件驱动，无需常驻定时器） ── */
    function tryFlush() {
      const token = captureContext()
      if (!contextActive(token) || !pending.length) return false
      if (token.mode === 'topic') {
        if (!cfg.autoInsert || isTyping() || document.visibilityState === 'hidden') return false
        return insertFloors(true, token) > 0
      }
      if (!canFlushNow()) return false
      return insertPending(true, token) > 0
    }

    /* ── 巡检核心（在途 Promise 复用，并发不丢弃） ── */
    let inflight = null
    let lastErr = null
    let lastFresh = 0

    function perfHref() {
      try {
        return location.pathname + location.search
      } catch {
        return ''
      }
    }

    function perfEmitCycle(ms) {
      try {
        if (!api.hasHandler('perf-probe:record')) return
        api.emitGlobal('perf:span', {
          name: 'cycle',
          plugin: 'live-feed',
          ms,
          href: perfHref(),
          t: Date.now(),
        })
      } catch {
        /* 探针失败不得打断巡检 */
      }
    }

    async function cycle() {
      if (!mode) init()
      if (!mode) return 0
      if (inflight) return inflight
      const timed = api.hasHandler('perf-probe:record')
      const t0 = timed ? performance.now() : 0
      inflight = (async () => {
        try {
          lastFresh = mode === 'list' ? await cycleList() : await cycleTopic()
          return lastFresh
        } catch (e) {
          lastErr = String((e && e.message) || e)
          api.log('实时流巡检失败', lastErr)
          return 0
        } finally {
          inflight = null
          if (timed) perfEmitCycle(performance.now() - t0)
          if (mode && shouldPoll()) scheduleNext()
        }
      })()
      return inflight
    }

    /* ── 跨标签：心跳选主（只有主标签发请求） ── */
    let timer = null
    let nextAt = null
    function intervalMs() {
      return (document.hidden ? cfg.bgSec : cfg.pollSec) * 1000
    }
    function scheduleNext() {
      if (timer) clearTimeout(timer)
      nextAt = Date.now() + intervalMs()
      timer = setTimeout(() => cycle(), intervalMs())
    }
    const JITTER = Number.isFinite(Number(cfg.jitterMs)) ? Math.max(0, Number(cfg.jitterMs)) : 800
    const election = api.election({
      onPromote: () => cycle(),
      onDemote: () => {
        if (isUserTopicList()) {
          // 资料页与首页不是同一条流：被首页主标签抢走后仍要自己巡检，否则只能刷新才看到新帖
          cycle()
          return
        }
        if (timer) clearTimeout(timer)
        timer = null
        nextAt = null
        hideBanner()
      },
      jitter: JITTER,
    })
    init()
    if (shouldPoll()) cycle()

    // 阻塞条件一解除就补上暂存内容：焦点离开编辑器、标签页切回前台。
    // 逛吧靠 1 秒心跳反复试探；这里事件驱动——响应更快，也不需要常驻定时器。
    const onFocusOut = () => setTimeout(tryFlush, 0) // 等 activeElement 更新完
    const onVisible = () => {
      if (document.visibilityState === 'visible') tryFlush()
    }
    document.addEventListener('focusout', onFocusOut)
    document.addEventListener('visibilitychange', onVisible)

    api.onDispose(() => {
      if (timer) clearTimeout(timer)
      timer = null
      teardown()
      document.removeEventListener('focusout', onFocusOut)
      document.removeEventListener('visibilitychange', onVisible)
    })

    /* 消息基线尽早建立：此后每轮对比增量（哨兵缺席则静默，成功后不再重置） */
    msgDelta().catch(() => {})

    /* 软导航换页：立刻重建基线。旧实现延迟 80ms，换页窗口里巡检会写进已经卸掉的 ul。 */
    api.on('route:changed', () => {
      init()
      if (shouldPoll() && !timer) scheduleNext()
    })
    api.on('spa:view-restored', () => {
      init()
      const token = captureContext()
      void (async () => {
        const wait = inflight
        if (wait) await wait
        if (!contextActive(token)) return
        void cycle()
      })()
    })
    api.on('topic:posts-added', (posts) => {
      if (mode !== 'topic') return
      for (const p of posts) ackLivePost(p.postId)
      pending = pending.filter((p) => p.postId && !ctx.seenPosts.has(p.postId) && !document.getElementById('post-' + p.postId))
      if (!pending.length) hideBanner()
    })
    api.dom.each('li.post-entry', (li) => {
      if (mode !== 'topic') return
      const id = Number((li.id || '').match(/^post-(\d+)/)?.[1] || 0)
      if (id) ackLivePost(id)
    })

    /* 无限滚动新增条目计入已见集合，避免误报。只认当前列表，换页插进来的节点不算。 */
    api.dom.each(api.sel?.listItems || 'ul.post-list > li.post-item', (li) => {
      if (mode !== 'list' || !ctx.seen || !ctx.ul?.contains(li)) return
      const it = api.parse.listItem(li)
      if (it?.id) ctx.seen.set(it.id, freshnessOf(it))
    })

    /* ── 调试接口 ── */
    api.handle('live-feed:debug', () => ({
      role: () => election.role,
      election: () => election.state(),
      mode: () => mode,
      pending: () => pending.length,
      baseline: () => ({ ...ctx, seen: ctx.seen ? ctx.seen.size : undefined }),
      autoInsert: () => !!cfg.autoInsert,
      lastErr: () => lastErr,
      lastFresh: () => lastFresh,
      lastBumped: () => lastBumped,
      nextAt: () => nextAt,
      intervalFor: (hidden) => (hidden ? cfg.bgSec : cfg.pollSec) * 1000,
      pollOnce: () => cycle(),
      demote: () => election.demote(),
      load: () => {
        const token = captureContext()
        return token.mode === 'topic' ? insertFloors(false, token) : insertPending(false, token)
      },
      bannerVisible: () => !!banner && banner.style.display !== 'none',
      bannerText: () => banner?.querySelector('.lsb-live-txt')?.textContent || '',
      clickBanner: () => bannerAction?.(),
      typing: () => isTyping(),
      canFlush: () => canFlushNow(),
      tryFlush,
      anchorFrames: () => anchorFrames,
      freshness: (id) => ctx.seen?.get(Number(id)),
    }))

    return {}
  }

  const w = typeof unsafeWindow !== 'undefined' ? unsafeWindow : window
  if (w.LSB && w.LSB.register) w.LSB.register(manifest, setup)
  else ;(w.LSB_PLUGINS = w.LSB_PLUGINS || []).push({ manifest, setup })
})()


;
/* ══════════════ LSB·性能探针 v1.0.0 (perf-probe) ══════════════ */
(function () {
  'use strict'

  const manifest = {
    id: 'perf-probe',
    name: '性能探针',
    version: '1.0.0',
    description: '本机记录软跳 / 巡检 / 时间轴慢帧耗时，默认关闭',
    author: 'you',
    requires: { base: '^0.1.0' },
    permissions: ['ui', 'storage', 'events'],
    config: {
      enabled: { type: 'switch', label: '记录卡顿', default: false },
    },
  }

  function setup(api) {
    const buf = []
    let timelineSec = -1
    let timelineN = 0
    let offRecord = () => {}
    let offSpan = () => {}

    function acceptSpan(span) {
      if (!span || typeof span.ms !== 'number' || !span.name) return false
      if (span.name !== 'timeline.update') return true
      if (span.ms < 8) return false
      const sec = Math.floor(Number(span.t || Date.now()) / 1000)
      if (sec !== timelineSec) {
        timelineSec = sec
        timelineN = 0
      }
      if (timelineN >= 2) return false
      timelineN += 1
      return true
    }

    function unbindRecording() {
      offRecord()
      offRecord = () => {}
      offSpan()
      offSpan = () => {}
    }

    function bindRecording() {
      unbindRecording()
      if (!api.config().enabled) return
      offRecord = api.handle('perf-probe:record', () => {})
      offSpan = api.on('perf:span', (span) => {
        if (!acceptSpan(span)) return
        buf.push({
          name: span.name,
          plugin: span.plugin,
          ms: span.ms,
          href: span.href,
          t: span.t,
        })
        if (buf.length > 200) buf.shift()
      })
    }

    function dump() {
      return buf.map((x) => ({ ...x }))
    }

    bindRecording()
    api.on('config:changed:perf-probe', () => {
      bindRecording()
    })
    api.onDispose(() => unbindRecording())

    api.ui.configTab({
      name: '性能探针',
      order: 90,
      render(host) {
        const on = !!api.config().enabled
        const rows = dump().slice().reverse()
        const slow = rows.reduce((a, b) => (!a || b.ms > a.ms ? b : a), null)
        const summary = document.createElement('div')
        summary.className = 'lsb-row-desc'
        summary.style.margin = '10px 0'
        if (!on) summary.textContent = '未开记录'
        else if (!rows.length) summary.textContent = '暂无'
        else summary.textContent = `最慢 ${slow.name} ${slow.ms}ms · 共 ${rows.length} 条`
        host.appendChild(summary)

        const table = document.createElement('div')
        table.className = 'lsb-row-desc'
        table.style.maxHeight = '240px'
        table.style.overflow = 'auto'
        for (const row of rows) {
          const line = document.createElement('div')
          line.className = 'lsb-row'
          line.textContent = `${Math.round(row.ms)}ms  ${row.name}  ${row.plugin || ''}  ${row.href || ''}`
          table.appendChild(line)
        }
        host.appendChild(table)

        const copy = document.createElement('button')
        copy.className = 'lsb-btn'
        copy.style.marginTop = '8px'
        copy.textContent = '复制 JSON'
        copy.onclick = async () => {
          const text = JSON.stringify(dump(), null, 2)
          try {
            if (navigator.clipboard?.writeText) await navigator.clipboard.writeText(text)
            else {
              const ta = document.createElement('textarea')
              ta.value = text
              document.body.append(ta)
              ta.select()
              document.execCommand('copy')
              ta.remove()
            }
            api.ui.toast('已复制', { type: 'success' })
          } catch (e) {
            api.ui.toast('复制失败：' + ((e && e.message) || e), { type: 'error' })
          }
        }
        host.appendChild(copy)

        const clearBtn = document.createElement('button')
        clearBtn.className = 'lsb-btn'
        clearBtn.style.marginLeft = '8px'
        clearBtn.textContent = '清空'
        clearBtn.onclick = () => {
          buf.length = 0
          api.ui.showTab('perf-probe')
        }
        host.appendChild(clearBtn)
      },
    })

    api.handle('perf-probe:debug', () => ({
      dump,
      clear: () => {
        buf.length = 0
      },
      recording: () => api.hasHandler('perf-probe:record'),
      slowest: () => buf.reduce((a, b) => (!a || b.ms > a.ms ? b : a), null),
    }))

    return {}
  }

  const w = typeof unsafeWindow !== 'undefined' ? unsafeWindow : window
  if (w.LSB && w.LSB.register) w.LSB.register(manifest, setup)
  else (w.LSB_PLUGINS = w.LSB_PLUGINS || []).push({ manifest, setup })
})()

/* ══════════════ 套件中心（suite-core） ══════════════ */
;(function () {
  'use strict'
  const manifest = {
    id: 'suite',
    name: '重装套件',
    version: '2.0.64',
    description: '全家桶总览：各模块状态卡片、快捷开关、跨模块关键指标',
    author: 'you',
    requires: { base: '^2.4.1' },
    permissions: ['read', 'ui', 'events'],
  }

  const MEMBERS = ["floor-stats","hot-floor-badge","resume-reading","reading-center","read-mark","topic-marks","home-return","topic-preview","unread-sentinel","forum-watch","checkin-calendar","points-ledger","title-quotes","title-forge-planner","points-title-workbench","data-migration","my-archive","annual-report","skin","live-feed","perf-probe"]

  /** 基座错误日志的四类条目（module-error=主动上报，其余为自动捕获） */
  const ERROR_KINDS = ['module-error', 'plugin-error', 'uncaught', 'rejection']

  function setup(api) {
    const W = typeof unsafeWindow !== 'undefined' ? unsafeWindow : window

    function today() {
      const x = new Date()
      const p = (n) => String(n).padStart(2, '0')
      return x.getFullYear() + '-' + p(x.getMonth() + 1) + '-' + p(x.getDate())
    }

    async function statLines() {
      const jobs = [
        ['⚠ 错误(7天)', () => {
          const n = (W.LSB.errors ? W.LSB.errors() : [])
            .filter((e) => ERROR_KINDS.includes(e.kind) && Date.now() - e.t < 7 * 864e5)
            .reduce((s, e) => s + (e.n || 1), 0)
          return Promise.resolve(n + ' 条')
        }],
        ['📖 阅读记录', () => api.request('resume-reading:debug').then((d) => Object.keys(d.all()).length + ' 帖'), 'resume-reading'],
        ['✅ 今日签到', () =>
          api.request('checkin-calendar:debug').then((d) => {
            const s = d.recs()[today()]?.s
            return s === 'ok' ? '已签 · 连击 ' + d.streak() : d.streak() + ' 天连击待续'
          }), 'checkin-calendar'],
        ['📈 积分快照', () =>
          api.request('points-ledger:series', { days: 7 }).then((s) =>
            s.length ? '最新 ' + s[s.length - 1].p + ' 分 / ' + s.length + ' 点' : '暂无',
          ), 'points-ledger'],
        ['🔔 消息箱', () => api.request('unread-sentinel:debug').then((d) => d.inbox().length + ' 条动态'), 'unread-sentinel'],
        ['🎯 机会命中', () => api.request('forum-watch:debug').then((d) => d.hits().length + ' 条'), 'forum-watch'],
        ['卡顿记录', () =>
          api.request('perf-probe:debug').then((d) => {
            const s = d.slowest()
            return s ? `最慢 ${s.ms}ms ${s.name}` : '未开记录'
          }).catch(() => '未开记录'), 'perf-probe'],
      ]
      return Promise.all(
        jobs
          .filter((job) => !job[2] || MEMBERS.includes(job[2]))
          .map(async ([label, fn]) => {
            try {
              return { label, value: await fn() }
            } catch {
              return { label, value: '—' } // 模块被停用或尚无数据
            }
          }),
      )
    }

    api.ui.tab({
      name: '套件总览',
      order: -1,
      render(host) {
        host.innerHTML =
          '<div class="lsb-row-desc" style="margin-bottom:6px">开关即时改写注册表，刷新页面后完全应用。</div>'
        const grid = document.createElement('div')
        grid.style.cssText =
          'display:grid;grid-template-columns:repeat(auto-fill,minmax(210px,1fr));gap:8px;margin-bottom:14px'
        host.appendChild(grid)

        function renderCards() {
          const info = W.LSB.info()
          // 近 7 天错误计数（来自基座持久化错误日志）：
          // module-error / plugin-error 带 e.id（插件 id），可归因到具体模块卡片；
          // uncaught / rejection 无归属，只进顶部「错误」指标行。
          let errBy = {}
          try {
            for (const e of W.LSB.errors ? W.LSB.errors() : []) {
              if (e.kind !== 'module-error' && e.kind !== 'plugin-error') continue
              if (Date.now() - e.t > 7 * 864e5) continue
              errBy[e.id] = (errBy[e.id] || 0) + (e.n || 1)
            }
          } catch {
            /* ignore */
          }
          grid.innerHTML = ''
          for (const id of MEMBERS) {
            const p = info.plugins.find((x) => x.id === id)
            if (!p) continue
            const cls = p.state === 'active' ? ' is-on' : p.state === 'error' ? ' is-err' : ''
            const label = {
              active: '运行中',
              disabled: '已停用',
              error: '出错',
              skipped: '本页不适用',
              registered: '等待依赖',
            }[p.state]
            const card = document.createElement('div')
            card.className = 'lsb-suite-card'
            card.innerHTML =
              '<div class="lsb-row-name">' +
              api.util.esc(p.name) +
              '<span class="lsb-badge">v' +
              api.util.esc(p.version) +
              '</span>' +
              (errBy[id] ? '<span class="lsb-badge is-err">⚠' + errBy[id] + '</span>' : '') +
              '<span class="lsb-badge' +
              cls +
              '">' +
              label +
              '</span></div><div class="lsb-row-desc">' +
              api.util.esc(p.description || p.id) +
              '</div>'
            const btn = document.createElement('button')
            btn.className = 'lsb-btn'
            btn.textContent = p.state === 'disabled' ? '启用' : '停用'
            btn.onclick = () => {
              if (p.state === 'disabled') W.LSB.enable(id)
              else W.LSB.disable(id)
              renderCards()
            }
            card.appendChild(btn)
            grid.appendChild(card)
          }
        }
        renderCards()

        const statBox = document.createElement('div')
        statBox.className = 'lsb-row-desc'
        statBox.textContent = '指标汇总中…'
        host.appendChild(statBox)
        statLines().then((rows) => {
          statBox.innerHTML =
            '<div style="margin:4px 0 6px;font-weight:600">关键指标</div>' +
            rows
              .map(
                (r) =>
                  '<div class="lsb-row"><span>' +
                  r.label +
                  '</span><strong style="margin-left:auto">' +
                  api.util.esc(String(r.value)) +
                  '</strong></div>',
              )
              .join('')
        })
      },
    })

    api.ui.style([
      '.lsb-suite-card{border:1px solid var(--line,#ddd);border-radius:8px;padding:9px 11px;',
      'display:flex;flex-direction:column;gap:6px;background:var(--bg,#fafafa)}',
      '.lsb-suite-card .lsb-btn{align-self:flex-start}',
    ].join(''))

    return {}
  }

  const w0 = typeof unsafeWindow !== 'undefined' ? unsafeWindow : window
  if (w0.LSB && w0.LSB.register) w0.LSB.register(manifest, setup)
  else {
    w0.LSB_PLUGINS = w0.LSB_PLUGINS || []
    w0.LSB_PLUGINS.push({ manifest, setup })
  }
})()
