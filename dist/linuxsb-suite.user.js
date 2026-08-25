// ==UserScript==
// @name         LINUX.SB 氧（Beta）
// @name:en      LINUX.SB Oxygen (Beta)
// @namespace    https://linux.sb/
// @version      1.0.45
// @description  【Beta】linux.sb 功能套件：氢壳、实时流、未读哨兵、AI 总结、签到日历等 16 个模块。必须先安装「LINUX.SB 氢（Beta）」。
// @description:en  [Beta] Feature pack for linux.sb (shell, live feed, unread sentinel, AI summary, check-in, and more). Requires LINUX.SB Hydrogen (Beta).
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
// · LSB·断点续读 v1.0.2
// · LSB·已读置灰 v1.0.3
// · LSB·用户画像悬浮卡 v1.0.1
// · LSB·主楼预览 v1.1.3
// · LSB·未读哨兵 v1.0.2
// · LSB·机会监控 v1.0.1
// · LSB·签到日历 v1.0.3
// · LSB·积分趋势 v1.0.2
// · LSB·AI 总结 v1.1.5
// · LSB·配置迁移 v1.0.0
// · LSB·个人存档 v1.0.0
// · LSB·年度报告 v1.0.1
// · LSB·界面精修 v1.1.28
// · LSB·实时流 v1.2.5
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
/* ══════════════ LSB·断点续读 v1.0.2 (resume-reading) ══════════════ */
(function () {
  'use strict'

  const manifest = {
    id: 'resume-reading',
    name: '断点续读',
    version: '1.0.2',
    description: '记住每帖读到哪层，回来一键续读，未读楼层标 NEW',
    author: 'you',
    requires: { base: '^0.1.0' },
    permissions: ['read', 'storage', 'ui', 'events'],
    pages: ['topic'],
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
      return api.store.get('positions', {}) || {}
    }
    function prune(all) {
      const deadline = Date.now() - cfg.keepDays * 864e5
      let list = Object.entries(all).filter(([, r]) => r.ts > deadline)
      list.sort((a, b) => b[1].ts - a[1].ts)
      list = list.slice(0, Math.max(50, cfg.cap))
      return Object.fromEntries(list)
    }
    function saveRec(rec, tidArg) {
      const t = tidArg || tidOf()
      const all = loadAll()
      all[t] = { ...(all[t] || {}), ...rec, ts: rec.ts || Date.now() }
      api.store.set('positions', prune(all))
      return all[t]
    }
    function load() {
      return loadAll()[tidOf()] || null
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
      saveRec({ f: curFloor, p: pageOf(), title: api.snapshot?.topic?.title || '' })
    }
    const flushLater = api.util.throttle(flush, 1200)

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
    const onScroll = api.util.throttle(() => {
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
      const groups = [...li.querySelectorAll('.post-user-group')]
      const creator = groups.find((g) => {
        const t = (g.textContent || '').trim()
        return t && /创作者/.test(t) && !/^UID\b/i.test(t)
      })
      if (creator) return creator
      const uid = groups.find(
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
    api.dom.each('li.post-entry', (li) => {
      if (!valid) return
      const f = Number(li.getAttribute('data-floor') || 0)
      setUnread(li, f > saved.f)
    })
    let unreadCount = valid ? markUnread(saved.f) : 0
    window.addEventListener('scroll', onScroll, { passive: true })
    window.addEventListener('pagehide', flush)
    document.addEventListener('visibilitychange', onVisibility)
    api.onDispose(() => {
      // 三个监听都要摘：旧实现只摘了 scroll，pagehide/visibilitychange 会在
      // 插件停用后继续写存储。
      window.removeEventListener('scroll', onScroll)
      window.removeEventListener('pagehide', flush)
      document.removeEventListener('visibilitychange', onVisibility)
      for (const t of hideTimers) clearTimeout(t)
      hideTimers.clear()
      flush()
    })
    onScroll()

    /* ── 续读提示条 ── */
    function jump(floor) {
      const el = document.querySelector(`${api.sel.postEntry}[data-floor="${floor}"]`)
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
      setTimeout(() => el.classList.remove('lsb-flash'), 1800)
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
        api.onDispose(() => {
          clearTimeout(autoHide)
          dismissBar(bar)
        })
      }
    }

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
      saveFloor: (f) => {
        curFloor = f
        return saveRec({ f, p: pageOf(), title: api.snapshot?.topic?.title || '' })
      },
      barVisible: () => !!document.querySelector('.lsb-resume-bar'),
      markCount: () => markUnread(curFloor || (saved ? saved.f : 0)),
      unreadCount,
      jump,
    }))

    return {}
  }

  const w = typeof unsafeWindow !== 'undefined' ? unsafeWindow : window
  if (w.LSB && w.LSB.register) w.LSB.register(manifest, setup)
  else ;(w.LSB_PLUGINS = w.LSB_PLUGINS || []).push({ manifest, setup })
})()


;
/* ══════════════ LSB·已读置灰 v1.0.3 (read-mark) ══════════════ */
(function () {
  'use strict'

  const manifest = {
    id: 'read-mark',
    name: '已读置灰',
    version: '1.0.3',
    description: '看过的帖子在列表中变灰；未读仍用站点自己的标记',
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

    /* ── 标记侧：帖子页打开即视为已读（壳内跳转也走 route:changed，不能只在 setup 时记一次） ── */
    function markOpenTopic() {
      if (api.page.type !== 'topic') return
      const tid = api.page.id
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
      const all = loadAll()
      const prev = all[tid]
      markSeen(
        tid,
        Math.max(0, ...posts.map((p) => p.ts || 0)),
        prev && prev.r != null ? prev.r + posts.length : null,
      )
    })

    /* ── 上色侧：列表页把看过的条目变灰 ── */
    const DIM = { 轻: 0.7, 中: 0.55, 重: 0.35 }

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
    }

    function paintAll() {
      for (const li of document.querySelectorAll('ul.post-list > li.post-item')) paint(li)
    }

    // 现有 + 无限滚动新增的条目各回调一次（幂等）
    api.dom.each('ul.post-list > li.post-item', paint)
    // 软导航后 DOM 可能被整段换掉：记账 + 全量重涂
    api.on('route:changed', () => {
      markOpenTopic()
      setTimeout(paintAll, 50)
    })

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
        info.textContent = `本地已记录 ${total} 帖。置灰只改外观，未读仍用站点自己的标记。`
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
/* ══════════════ LSB·用户画像悬浮卡 v1.0.1 (hover-profile) ══════════════ */
(function () {
  'use strict'

  const manifest = {
    id: 'hover-profile',
    name: '用户画像悬浮卡',
    version: '1.0.1',
    description: '悬停用户链接查看等级、积分与最近主题；结果缓存避免重复请求',
    author: 'you',
    requires: { base: '^0.1.0' },
    permissions: ['read', 'storage', 'ui', 'events'],
    config: {
      delayMs: { type: 'number', label: '悬停触发延迟 (ms)', default: 220 },
      ttlHours: { type: 'number', label: '缓存有效期 (小时)', default: 24 },
      negTtlMin: { type: 'number', label: '失败结果重试间隔 (分钟)', default: 5 },
      showTopics: { type: 'switch', label: '展示最近 3 个主题', default: true },
    },
  }

  function setup(api) {
    let cfg = api.config()
    api.on('config:changed:hover-profile', () => {
      cfg = api.config()
    })
    let card = null
    let hideTimer = null
    let showTimer = null
    let currentUid = null
    // 卡片、绑在页面链接上的监听、在飞的定时器都不属于基座托管范围，
    // 插件被停用时必须自己收摊，否则残留浮层与监听继续响应鼠标。
    const unbinds = []
    api.onDispose(() => {
      clearTimeout(hideTimer)
      clearTimeout(showTimer)
      for (const off of unbinds.splice(0)) {
        try {
          off()
        } catch {
          /* 元素已被站点移除 */
        }
      }
      card?.remove()
      card = null
    })

    /* ── 缓存 ── */
    function cacheGet(uid) {
      const c = api.store.get(`u:${uid}`, null)
      if (!c) return null
      const ttl = (c.err ? cfg.negTtlMin : cfg.ttlHours) * (c.err ? 6e4 : 36e5)
      if (Date.now() - c.ts > ttl) return null // 过期当无缓存
      return c
    }
    function cachePut(uid, data) {
      const all = api.store.get('__idx', []) // 简易容量控制
      let idx = all.filter((x) => x !== uid)
      idx.push(uid)
      if (idx.length > 600) {
        const drop = idx.splice(0, idx.length - 600)
        for (const d of drop) api.store.del(`u:${d}`)
      }
      api.store.set('__idx', idx)
      api.store.set(`u:${uid}`, data)
    }

    /** 拉取并解析用户资料（net.doc 自动去重 + 限速） */
    async function ensureData(uid) {
      const cached = cacheGet(uid)
      if (cached && !cached.err) return cached
      if (cached && cached.err) throw new Error('上次加载失败')
      try {
        const doc = await api.net.doc(api.routes.user(uid))
        const d = api.parse.user(doc)
        if (!d.uid) throw new Error('解析失败')
        const data = {
          uid: d.uid,
          name: d.name,
          group: d.group,
          rank: d.rank,
          points: d.points,
          avatar: d.avatar,
          topics: d.items.slice(0, 3).map((t) => ({
            id: t.id,
            title: t.title,
            forum: t.forumName,
            replies: t.replies,
          })),
          ts: Date.now(),
        }
        cachePut(uid, data)
        return data
      } catch (e) {
        cachePut(uid, { err: 1, message: String(e.message || e), ts: Date.now() })
        throw e
      }
    }

    /* ── 浮卡 UI ── */
    function ensureCard() {
      if (card) return card
      card = document.createElement('div')
      card.className = 'lsb-hover-card'
      card.addEventListener('mouseenter', () => clearTimeout(hideTimer))
      card.addEventListener('mouseleave', scheduleHide)
      document.body.appendChild(card)
      return card
    }
    function place(anchor) {
      const r = anchor.getBoundingClientRect()
      const el = ensureCard()
      const pad = 10
      let left = Math.min(r.right + 8, window.innerWidth - 340)
      let top = Math.min(r.bottom + 6, window.innerHeight - 260)
      left = Math.max(pad, left)
      top = Math.max(pad, top)
      el.style.left = `${left}px`
      el.style.top = `${top}px`
    }

    function renderLoading(el) {
      el.innerHTML = '<div class="lsb-hc-loading">加载中…</div>'
    }
    function renderError(el, message) {
      el.innerHTML = `<div class="lsb-hc-err">加载失败：${api.util.esc(message)}<div class="lsb-row-desc">稍后重试会自动重新请求</div></div>`
    }
    function renderData(el, d) {
      const rows =
        d.topics && cfg.showTopics
          ? d.topics
              .map(
                (t) => `
        <div class="lsb-hc-topic">
          <a href="${api.routes.topic(t.id)}">${api.util.esc(t.title)}</a>
          <span class="lsb-row-desc">${api.util.esc(t.forum || '')}${t.replies != null ? ` · ${t.replies} 回复` : ''}</span>
        </div>`,
              )
              .join('')
          : ''
      el.innerHTML = `
        <div class="lsb-hc-head">
          ${d.avatar ? `<img class="lsb-hc-avatar" src="${api.util.esc(d.avatar)}" alt="">` : ''}
          <div>
            <div class="lsb-hc-name">${api.util.esc(d.name || 'uid ' + d.uid)}</div>
            <div class="lsb-row-desc">${api.util.esc(d.rank || d.group || '')}</div>
          </div>
        </div>
        ${rows ? `<div class="lsb-hc-topics">${rows}</div>` : ''}
        <div class="lsb-hc-foot">
          <a href="${api.routes.user(d.uid)}">主页</a>
          <a href="${api.routes.user(d.uid, 'topics')}">主题</a>
          <a href="${api.routes.user(d.uid, 'replies')}">回帖</a>
        </div>`
    }

    function scheduleHide() {
      clearTimeout(hideTimer)
      hideTimer = setTimeout(() => {
        card?.classList.remove('is-on')
      }, 180)
    }

    function show(anchor, uid) {
      currentUid = uid
      const el = ensureCard()
      place(anchor)
      renderLoading(el)
      el.classList.add('is-on')
      ensureData(uid).then(
        (d) => {
          if (currentUid === uid) renderData(el, d)
        },
        (e) => {
          if (currentUid === uid) renderError(el, e.message || e)
        },
      )
    }

    function bind(a) {
      if (a.closest('.lsb-hover-card')) return // 卡内链接不再绑
      const m = (a.getAttribute('href') || '').match(/\/user\/(\d+)/)
      if (!m) return
      const uid = Number(m[1])
      const onEnter = () => {
        clearTimeout(hideTimer)
        clearTimeout(showTimer)
        showTimer = setTimeout(() => show(a, uid), Math.max(0, cfg.delayMs))
      }
      const onLeave = () => {
        clearTimeout(showTimer)
        scheduleHide()
      }
      a.addEventListener('mouseenter', onEnter)
      a.addEventListener('mouseleave', onLeave)
      unbinds.push(() => {
        a.removeEventListener('mouseenter', onEnter)
        a.removeEventListener('mouseleave', onLeave)
      })
    }
    api.dom.each('a[href^="/user/"]', bind)

    api.ui.style(`
      .lsb-hover-card{position:fixed;z-index:99996;width:320px;max-height:300px;overflow:auto;
        display:none;padding:12px;border-radius:10px;border:1px solid var(--line,#ddd);
        background:var(--panel,#fff);color:var(--text,#222);font-size:13px;
        box-shadow:0 10px 32px var(--shadow-medium,rgba(0,0,0,.25))}
      .lsb-hover-card.is-on{display:block}
      .lsb-hc-head{display:flex;gap:10px;align-items:center}
      .lsb-hc-avatar{width:40px;height:40px;border-radius:8px}
      .lsb-hc-name{font-weight:700;font-size:14px}
      .lsb-hc-topics{margin-top:10px;border-top:1px solid var(--line-soft,#eee);padding-top:8px}
      .lsb-hc-topic{margin-bottom:7px;display:flex;flex-direction:column;gap:2px}
      .lsb-hc-topic a{color:var(--brand,#5eaaa0);text-decoration:none;overflow:hidden;text-overflow:ellipsis;white-space:nowrap}
      .lsb-hc-topic a:hover{text-decoration:underline}
      .lsb-hc-foot{margin-top:8px;padding-top:8px;border-top:1px solid var(--line-soft,#eee);display:flex;gap:14px}
      .lsb-hc-foot a{color:var(--brand,#5eaaa0);text-decoration:none;font-size:12px}
      .lsb-hc-loading,.lsb-hc-err{padding:18px 4px;color:var(--text-muted,#888)}
    `)

    /* ── 设置页：配置表单 + 缓存管理 ── */
    api.ui.configTab({
      name: '画像悬浮卡',
      order: 61,
      render(host) {
        const keys = api.store.keys().filter((k) => k.startsWith('u:'))
        const info = document.createElement('div')
        info.className = 'lsb-row-desc'
        info.style.marginTop = '14px'
        info.textContent = `已缓存 ${keys.length} 位用户的资料。`
        const clear = document.createElement('button')
        clear.className = 'lsb-btn'
        clear.textContent = '清空资料缓存'
        clear.style.marginTop = '8px'
        clear.onclick = async () => {
          if (!(await api.ui.confirm('清空全部用户资料缓存？'))) return
          for (const k of keys) api.store.del(k)
          api.store.del('__idx')
          api.ui.toast('已清空', { type: 'success' })
          info.textContent = '已缓存 0 位用户的资料。'
        }
        host.append(info, clear)
      },
    })

    /* ── 调试/测试接口 ── */
    api.handle('hover-profile:debug', () => ({
      show: (uid) => ensureData(uid),
      cacheSize: () => api.store.keys().filter((k) => k.startsWith('u:')).length,
      cardVisible: () => !!document.querySelector('.lsb-hover-card.is-on'),
    }))

    return {}
  }

  const w = typeof unsafeWindow !== 'undefined' ? unsafeWindow : window
  if (w.LSB && w.LSB.register) w.LSB.register(manifest, setup)
  else ;(w.LSB_PLUGINS = w.LSB_PLUGINS || []).push({ manifest, setup })
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
/* ══════════════ LSB·未读哨兵 v1.0.2 (unread-sentinel) ══════════════ */
(function () {
  'use strict'

  const manifest = {
    id: 'unread-sentinel',
    name: '未读哨兵',
    version: '1.0.2',
    description: '低频巡检首页新动态；跨标签选主去重；标题角标 + 通知 + 消息箱面板',
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

    function unreadCount() {
      return inboxGet().filter((x) => x.lastTs > lastOpenTs()).length
    }
    function applyTitle() {
      if (!cfg.badgeInTitle) return
      const n = unreadCount()
      document.title = n > 0 ? `(${n}) ${origTitle}` : origTitle
    }

    api.tabs.on('events', ({ items }) => {
      mergeInbox(items)
      applyTitle()
    })

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
          const parsed = api.parse.list(doc)
          probe.parsed = parsed.length
          const items = parsed.filter((x) => x.id && x.lastActiveTs)
          probe.items = items.length
          probe.seenBefore = Object.keys(seenGet()).length
          const seen = seenGet()
          const fresh = []
          for (const it of items) {
            const prev = seen[it.id]
            if (prev == null || it.lastActiveTs > prev) {
              fresh.push({ id: it.id, title: it.title, lastTs: it.lastActiveTs, replies: it.replies })
            }
            seen[it.id] = Math.max(prev || 0, it.lastActiveTs)
          }
          // 容量修剪：保留最近 400 帖的水位线
          const entries = Object.entries(seen).sort((a, b) => b[1] - a[1]).slice(0, 400)
          seenSet(Object.fromEntries(entries))

          probe.fresh = fresh.length
          if (fresh.length) {
            mergeInbox(fresh)
            applyTitle()
            api.tabs.post('events', { items: fresh })
            if (!force) announce(fresh)
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
    applyTitle()

    /* ── 调试接口 ── */
    /* ── 设置页（由 manifest.config 自动生成） ── */
    api.ui.configTab({ name: "哨兵设置", order: 55 })

    api.handle('unread-sentinel:debug', () => ({
      role: () => election.role,
      election: () => election.state(), // id / leaderId / 距上次 leader 心跳，排查跨标签问题用
      lastError: () => lastErr,
      probe: () => probe,
      diag: () => ({ origTitle, badge: !!cfg.badgeInTitle, unread: unreadCount(), inboxLen: inboxGet().length, lastOpen: lastOpenTs(), firstTs: inboxGet()[0] && inboxGet()[0].lastTs }),
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
/* ══════════════ LSB·机会监控 v1.0.1 (forum-watch) ══════════════ */
/**
 * 未读哨兵的定向版：复用心跳选主思路，但按「版块 × 关键词」过滤，
 * 只把对你有价值的帖子送进「机会箱」。巡检走基座限速队列。
 */
(function () {
  'use strict'

  const manifest = {
    id: 'forum-watch',
    name: '机会监控',
    version: '1.0.1',
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
          if (!kws.length) return
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
              const kw = kws.find((k) => String(it.title).toLowerCase().includes(k))
              if (kw) {
                fresh.push({
                  tid: it.id,
                  title: it.title,
                  forumId: fid,
                  kw,
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
      probe: () => ({ forums: forumIds(), kws: keywords(), ...probeData }),
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
/* ══════════════ LSB·签到日历 v1.0.3 (checkin-calendar) ══════════════ */
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
    version: '1.0.3',
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
    async function doCheckin(skipConfirm = false) {
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
      const res = await api.net.raw(formInfo.action, {
        method: 'POST',
        body: fd,
        headers: { 'x-requested-with': 'XMLHttpRequest' },
      })
      if (!res.ok) {
        api.ui.toast('签到失败 HTTP ' + res.status, { type: 'error' })
        return { done: false, reason: 'http-' + res.status }
      }
      status = 'ok'
      setDay(today(), 'ok')
      api.ui.toast('签到完成', { type: 'success' })
      return true
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

    /* ── 面板 ── */
    api.ui.tab({
      name: '积分趋势',
      order: 65,
      render(host) {
        const all = get()
        const cutoff = Date.now() - rangeDays * 864e5
        const view = all.filter((x) => x.t >= cutoff)
        host.innerHTML = `
          <div class="lsb-cal-head">
            <strong>积分趋势</strong>
            <span class="lsb-row-desc">当前 ${api.me.points != null ? api.me.points : '?'} · 快照 ${all.length} 次</span>
            <span style="margin-left:auto;display:flex;gap:6px">
              ${[30, 90, 365].map(
                (d) =>
                  `<button class="lsb-btn${rangeDays === d ? ' is-primary' : ''}" data-range="${d}">${d}天</button>`,
              ).join('')}
              <button class="lsb-btn" data-refresh>立即快照</button>
            </span>
          </div>
          <div class="lsb-chart-host">${chart(view.length >= 2 ? view : all)}</div>`
        host.querySelectorAll('[data-range]').forEach((b) => {
          b.onclick = () => {
            rangeDays = Number(b.dataset.range)
            api.ui.showTab('points-ledger')
          }
        })
        const rf = host.querySelector('[data-refresh]')
        rf.onclick = () =>
          autoSnap(true)
            .then((added) => {
              api.ui.toast(added ? '已记录当前积分' : '数值未变化', { type: 'success' })
              api.ui.showTab('points-ledger')
            })
            .catch((e) => api.ui.toast(e.message, { type: 'error' }))
      },
    })

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
/* ══════════════ LSB·AI 总结 v1.1.5 (ai-summary) ══════════════ */
/**
 * 使用说明：
 *  1. 在基座面板「AI 总结」页填入 API 端点与 Key。
 *     OpenAI 兼容（DeepSeek / Kimi / Qwen / OpenRouter / Ollama）填到 /chat/completions；
 *     Anthropic（官方或 /v1/messages 代理）填到 /messages，协议可留「自动」。
 *  2. 氢脚本已声明 @connect *；更新后 Tampermonkey 会询问是否允许访问 API 域名，允许即可；
 *  3. Key 明文存于本脚本存储中，请勿在公用电脑开启此插件。
 */
(function () {
  'use strict'

  const manifest = {
    id: 'ai-summary',
    name: 'AI 总结',
    version: '1.1.5',
    description: '调用 OpenAI 或 Anthropic 接口总结当前帖子；氢面板「AI 历史」可回看全部记录',
    author: 'you',
    requires: { base: '^0.1.0' },
    permissions: ['read', 'storage', 'ui', 'events', 'net'],
    config: {
      apiUrl: { type: 'text', label: 'API 端点', default: '', desc: 'OpenAI：…/v1/chat/completions；Anthropic：…/v1/messages' },
      apiKey: { type: 'password', label: 'API Key', default: '', desc: '明文存于本机脚本存储，公用电脑慎用' },
      apiStyle: {
        type: 'select',
        label: '接口协议',
        default: '自动',
        options: ['自动', 'OpenAI', 'Anthropic'],
        desc: '自动按端点判断。Anthropic 用 x-api-key + /messages；OpenAI 用 Bearer + /chat/completions',
      },
      model: { type: 'text', label: '模型名', default: 'deepseek-chat' },
      style: {
        type: 'select',
        label: '总结风格',
        default: '要点速览',
        options: ['要点速览', '深度分析', '立场地图'],
      },
      maxChars: { type: 'number', label: '送入模型的正文上限 (字符)', default: 12000 },
      fetchAll: { type: 'switch', label: '汇总全部分页（慢，走基座限速队列）', default: false },
      maxPages: { type: 'number', label: '最多抓取页数', default: 15 },
      timeoutSec: {
        type: 'number',
        label: '请求超时 (秒)',
        default: 120,
        desc: '长帖总结常需 30~90s；过小会在模型答完前被掐断',
      },
      customPrompt: { type: 'textarea', label: '附加要求（追加在提示词后）', default: '', rows: 3 },
    },
  }

  const SYSTEM = {
    要点速览:
      '你是论坛帖子总结助手。用中文输出：①一句话主题 ②3~6 条要点（每条尽量标注楼层号如 #12）③值得注意的原话摘录 ≤2 条。不要客套话。',
    深度分析:
      '你是论坛帖子分析助手。用中文输出：①核心论点梳理 ②论证质量评价（证据是否充分、有无逻辑跳跃，标注楼层号）③被忽略的角度。保持批判性，不要奉承。',
    立场地图:
      '你是论坛讨论观察员。用中文归纳帖内各方的立场与分歧：按"立场 → 代表楼层 → 核心理由"列出；指出哪些分歧有事实可查证、哪些纯属价值冲突；最后一句点评整体讨论氛围。',
  }

  /** 主楼在总预算里的占比上限：留给回复的份额不能被一篇长主楼吃光 */
  const OP_BUDGET_RATIO = 0.5
  const MIN_TOTAL_CHARS = 500

  function escHtml(s) {
    return String(s ?? '').replace(/[&<>"'`]/g, (c) =>
      ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;', '`': '&#96;' }[c]),
    )
  }

  function safeHref(href) {
    const t = String(href || '').trim()
    if (/^https?:\/\//i.test(t)) return t
    if (/^\/(?!\/)/.test(t)) return t
    return ''
  }

  function isUl(line) {
    return /^[-*+] /.test(line)
  }
  function isOl(line) {
    return /^\d+[.)] /.test(line)
  }
  function isQuote(line) {
    return /^>/.test(line)
  }
  function isHr(line) {
    return /^\s*(-{3,}|\*{3,}|_{3,})\s*$/.test(line)
  }
  function headingLevel(line) {
    const m = /^(#{1,6}) (.+)/.exec(line)
    return m ? m[1].length : 0
  }
  function isTableSep(line) {
    return /^\|? *:?-{3,}:? *(?:\| *:?-{3,}:? *)+\|? *$/.test(line)
  }
  function splitRow(line) {
    return line.replace(/^\||\|$/g, '').split('|').map((c) => c.trim())
  }

  /**
   * 轻量 Markdown → 安全 HTML。先抽出代码再转义，模型输出不会变成可执行标签。
   * 标题必须是「# + 空格」，避免把楼层号 #12 当成标题。
   */
  function renderMarkdown(src) {
    const slots = []
    const stash = (html) => {
      const i = slots.length
      slots.push(html)
      return `\u0000MD${i}\u0000`
    }
    const unstash = (s) => s.replace(/\u0000MD(\d+)\u0000/g, (_, n) => slots[Number(n)] || '')

    const inline = (raw) => {
      let s = String(raw)
      s = s.replace(/`([^`\n]+)`/g, (_, c) => stash(`<code>${escHtml(c)}</code>`))
      s = s.replace(/\[([^\]]+)\]\(([^)]+)\)/g, (_, label, href) => {
        const u = safeHref(href)
        const lab = escHtml(label)
        if (!u) return lab
        return stash(
          `<a href="${escHtml(u)}" target="_blank" rel="noopener noreferrer">${lab}</a>`,
        )
      })
      s = escHtml(s)
      s = s.replace(/\*\*\*([^*\n]+)\*\*\*/g, '<strong><em>$1</em></strong>')
      s = s.replace(/\*\*([^*\n]+)\*\*/g, '<strong>$1</strong>')
      s = s.replace(/__([^_\n]+)__/g, '<strong>$1</strong>')
      s = s.replace(/(^|[^*])\*([^*\n]+)\*(?!\*)/g, '$1<em>$2</em>')
      return s
    }

    let text = String(src ?? '').replace(/\r\n/g, '\n')
    text = text.replace(/```[^\n]*\n([\s\S]*?)```/g, (_, code) =>
      stash(`<pre><code>${escHtml(code.replace(/\n$/, ''))}</code></pre>`),
    )

    const lines = text.split('\n')
    const out = []
    let i = 0
    const isFence = (line) => /^\u0000MD\d+\u0000$/.test(line)

    while (i < lines.length) {
      const line = lines[i]
      if (!line.trim()) {
        i += 1
        continue
      }
      if (isFence(line)) {
        out.push(line)
        i += 1
        continue
      }
      const h = headingLevel(line)
      if (h) {
        out.push(`<h${h}>${inline(line.replace(/^#{1,6} /, ''))}</h${h}>`)
        i += 1
        continue
      }
      if (isHr(line)) {
        out.push('<hr>')
        i += 1
        continue
      }
      if (/^\|/.test(line) && isTableSep(lines[i + 1] || '')) {
        const head = splitRow(line)
        i += 2
        const rows = []
        while (i < lines.length && /^\|/.test(lines[i]) && !isTableSep(lines[i])) {
          rows.push(splitRow(lines[i]))
          i += 1
        }
        out.push(
          '<table><thead><tr>' +
            head.map((c) => `<th>${inline(c)}</th>`).join('') +
            '</tr></thead><tbody>' +
            rows.map((r) => '<tr>' + r.map((c) => `<td>${inline(c)}</td>`).join('') + '</tr>').join('') +
            '</tbody></table>',
        )
        continue
      }
      if (isQuote(line)) {
        const buf = []
        while (i < lines.length && isQuote(lines[i])) {
          buf.push(lines[i].replace(/^> ?/, ''))
          i += 1
        }
        out.push(`<blockquote>${inline(buf.join('\n')).replace(/\n/g, '<br>')}</blockquote>`)
        continue
      }
      if (isUl(line)) {
        out.push('<ul>')
        while (i < lines.length && isUl(lines[i])) {
          out.push(`<li>${inline(lines[i].replace(/^[-*+] /, ''))}</li>`)
          i += 1
        }
        out.push('</ul>')
        continue
      }
      if (isOl(line)) {
        out.push('<ol>')
        while (i < lines.length && isOl(lines[i])) {
          out.push(`<li>${inline(lines[i].replace(/^\d+[.)] /, ''))}</li>`)
          i += 1
        }
        out.push('</ol>')
        continue
      }
      const buf = []
      while (i < lines.length) {
        const L = lines[i]
        if (!L.trim()) break
        if (isFence(L) || headingLevel(L) || isHr(L) || isQuote(L) || isUl(L) || isOl(L)) break
        if (/^\|/.test(L) && isTableSep(lines[i + 1] || '')) break
        buf.push(L)
        i += 1
      }
      if (buf.length) out.push(`<p>${inline(buf.join('\n')).replace(/\n/g, '<br>')}</p>`)
    }
    return unstash(out.join(''))
  }

  function setup(api) {
    let cfg = api.config()
    api.on('config:changed:ai-summary', () => {
      cfg = api.config()
      refreshButtons() // 换风格后按钮态要跟着变（新槽位可能还没有缓存）
    })

    /* ── 缓存键 ──
     * 同一帖的总结会因四件事而不同，任一变化都必须换槽，否则用户改了设置
     * 却拿到旧答案（旧实现只看 hash+model，改风格完全无效）：
     *   风格 / 附加要求 / 模型 / 采集范围（整帖 vs 仅本页）
     * 仅本页时还要带页码——第 1 页和第 5 页内容不同，不能共用一个槽。
     */
    function promptFingerprint() {
      const s = `${cfg.style || ''}|${cfg.customPrompt || ''}`
      let h = 0
      for (let i = 0; i < s.length; i++) h = (h * 31 + s.charCodeAt(i)) | 0
      return (h >>> 0).toString(36)
    }
    function scope() {
      return cfg.fetchAll ? 'all' : `p${api.page.page || 1}`
    }
    function cacheKey() {
      return `s:${api.page.id}:${scope()}:${cfg.model || ''}:${promptFingerprint()}`
    }
    const cached = () => api.store.get(cacheKey(), null)

    /* ── 内容收集 ── */
    async function collect() {
      // 站点是无限滚动：启动时的 snapshot 会过期，必须以当前实时 DOM 为准
      let topic = null
      try {
        const live = api.parse.topic(document)
        if (live && live.posts.length) topic = live
      } catch {
        /* 解析失败退回启动快照 */
      }
      if (!topic) topic = api.snapshot?.topic
      if (!topic || !topic.posts.length) throw new Error('本页没有帖子数据')

      let posts = [...topic.posts]
      let fetchedPages = 1

      if (cfg.fetchAll && topic.pages > 1) {
        // 走基座限速队列逐页补齐（net.pages 是异步生成器）；
        // 无限滚动下 DOM 里可能已加载了后几页，这里仍按页码全量补，保证未滚到的部分不缺
        const cap = Math.min(topic.pages, cfg.maxPages || 15)
        const seen = new Set(posts.map((p) => p.postId))
        for await (const { page, doc } of api.net.pages((p) => api.routes.topic(api.page.id, p), cap)) {
          if (page === 1) continue
          for (const post of api.parse.topic(doc).posts) {
            if (!seen.has(post.postId)) {
              seen.add(post.postId)
              posts.push(post)
            }
          }
          fetchedPages = Math.max(fetchedPages, page)
        }
      }
      posts.sort((a, b) => a.floor - b.floor)

      // 主楼只认 floor===0。分页页（?p=2）DOM 里没有主楼，旧实现直接取 posts[0]
      // 当楼主——把 #1 楼冒充成楼主，同一段内容还在提示词里出现两次（误导模型 + 多烧 token）。
      const op = posts.find((p) => p.floor === 0) || null
      const floors = posts.filter((p) => p.floor > 0 && p.content)

      /* ── 预算分配：主楼与回复都要受 maxChars 约束 ──
       * 旧实现只截 body，主楼原样拼进去 → maxChars=12000 时实际发出 3 万字，
       * 长帖直接超上下文或按 3 万 token 计费。
       */
      const total = Math.max(MIN_TOTAL_CHARS, Number(cfg.maxChars) || 12000)
      let opText = op?.content || ''
      let opTruncated = false
      const opCap = Math.floor(total * OP_BUDGET_RATIO)
      if (opText.length > opCap) {
        opText = opText.slice(0, opCap) + '…[主楼已截断]'
        opTruncated = true
      }
      const bodyBudget = Math.max(200, total - opText.length)
      let body = floors.map((p) => `[#${p.floor}] ${p.authorName || '?'}：${p.content}`).join('\n')
      let bodyTruncated = false
      if (body.length > bodyBudget) {
        body = body.slice(0, bodyBudget) + '\n…[后文已截断]'
        bodyTruncated = true
      }

      const floorNums = floors.map((p) => p.floor)
      const range = floorNums.length ? `#${Math.min(...floorNums)}–#${Math.max(...floorNums)}` : '无'
      const head =
        `标题：${topic.title}\n版块：${topic.forumName || '?'}\n` +
        `浏览 ${topic.views} · 回复 ${topic.replies} · ` +
        `本次采集 ${fetchedPages}/${topic.pages} 页 · 含楼层 ${range}\n` +
        // 没有主楼时如实说明，别让模型以为第一条就是主题
        (op ? '' : '注意：本次未包含主楼（当前为分页视图），请基于以下回复作答。\n') +
        '\n'
      const content =
        head + (op ? `[楼主] ${op.authorName || '?'}：${opText}\n\n` : '') + body

      return {
        content,
        meta: {
          floors: floors.length + (op ? 1 : 0),
          chars: content.length,
          pagesFetched: fetchedPages,
          pagesTotal: topic.pages,
          title: topic.title,
          hasOp: !!op,
          range,
          truncated: opTruncated || bodyTruncated,
          budget: total,
          // hash 只用于「同一槽内内容是否变化」，槽本身已含风格/模型/范围
          hash: `${floors.length}:${content.length}:${op ? 1 : 0}`,
        },
      }
    }

    function isAnthropic() {
      const pick = cfg.apiStyle || '自动'
      if (pick === 'Anthropic') return true
      if (pick === 'OpenAI') return false
      try {
        const u = new URL(cfg.apiUrl, location.href)
        if (/(?:^|\.)anthropic\.com$/i.test(u.hostname)) return true
        const path = u.pathname.replace(/\/+$/, '')
        if (path.endsWith('/messages') && !path.endsWith('/chat/completions')) return true
      } catch {
        /* 端点填坏时按 OpenAI 发，错误会在请求时报出来 */
      }
      return false
    }

    function extractText(j) {
      const openai = j?.choices?.[0]?.message?.content
      if (typeof openai === 'string' && openai) return openai
      if (Array.isArray(j?.content)) {
        const parts = j.content
          .filter((p) => p && (p.type === 'text' || (!p.type && p.text)))
          .map((p) => p.text)
          .filter(Boolean)
        if (parts.length) return parts.join('\n')
      }
      if (typeof j?.content === 'string' && j.content) return j.content
      return null
    }

    /* ── 调用 LLM ── */
    async function callLLM(content) {
      const sys = SYSTEM[cfg.style] || SYSTEM['要点速览']
      const user = cfg.customPrompt ? `${content}\n\n用户附加要求：${cfg.customPrompt}` : content
      const timeout = Math.max(5, Number(cfg.timeoutSec) || 120) * 1000
      const anthropic = isAnthropic()
      const headers = { 'content-type': 'application/json' }
      let body
      if (anthropic) {
        headers['x-api-key'] = cfg.apiKey
        headers['anthropic-version'] = '2023-06-01'
        body = {
          model: cfg.model,
          max_tokens: 4096,
          temperature: 0.4,
          stream: false,
          system: sys,
          messages: [{ role: 'user', content: user }],
        }
      } else {
        headers.authorization = `Bearer ${cfg.apiKey}`
        body = {
          model: cfg.model,
          temperature: 0.4,
          stream: false,
          messages: [
            { role: 'system', content: sys },
            { role: 'user', content: user },
          ],
        }
      }
      const res = await api.net.raw(cfg.apiUrl, {
        method: 'POST',
        external: true,
        // queue:false —— 不占用基座的站内限速队列。一次 LLM 调用可能挂 60s+，
        // 排队会让实时流/悬浮卡/哨兵的站内请求全部饿死。
        queue: false,
        timeout,
        headers,
        body: JSON.stringify(body),
      })
      if (!res.ok) {
        let extra = String(res.text).slice(0, 180)
        try {
          const err = JSON.parse(res.text)
          extra = err.error?.message || err.message || extra
        } catch {
          /* 原文切片即可 */
        }
        throw new Error(`HTTP ${res.status}：${extra}`)
      }
      let j
      try {
        j = JSON.parse(res.text)
      } catch {
        throw new Error('返回不是 JSON：' + String(res.text).slice(0, 180))
      }
      const text = extractText(j)
      if (!text) throw new Error('响应里没有找到文本：' + JSON.stringify(j).slice(0, 200))
      return text
    }

    /* ── 结果 / 进度展示 ── */
    let waitTimer = null
    let waitStarted = 0

    function stopWaitClock() {
      if (waitTimer) {
        clearInterval(waitTimer)
        waitTimer = null
      }
    }

    function closeSummary() {
      stopWaitClock()
      document.querySelector('.lsb-summary-panel')?.remove()
      document.querySelector('.lsb-mask.lsb-summary-mask')?.remove()
    }

    function openShell() {
      let mask = document.querySelector('.lsb-mask.lsb-summary-mask')
      let panel = document.querySelector('.lsb-summary-panel')
      if (mask && panel) return { mask, panel }
      closeSummary()
      mask = document.createElement('div')
      mask.className = 'lsb-mask lsb-summary-mask'
      panel = document.createElement('div')
      panel.className = 'lsb-panel lsb-summary-panel'
      document.body.append(mask, panel)
      return { mask, panel }
    }

    function showWait(status) {
      const { mask, panel } = openShell()
      waitStarted = Date.now()
      panel.innerHTML = `
        <div class="lsb-panel-head">
          <strong>AI 总结</strong>
          <span class="lsb-ver">${api.util.esc(cfg.model || '')}</span>
          <button class="lsb-panel-close" title="隐藏（总结仍会继续）">×</button>
        </div>
        <div class="lsb-view">
          <div class="lsb-summary-wait">
            <div class="lsb-sum-status"></div>
            <div class="lsb-row-desc lsb-sum-clock"></div>
            <div class="lsb-row-desc">长帖可能需要一两分钟。完成后结果会显示在这里；点 × 只是先收起窗口。</div>
          </div>
        </div>`
      const statusEl = panel.querySelector('.lsb-sum-status')
      const clockEl = panel.querySelector('.lsb-sum-clock')
      statusEl.textContent = status
      const tick = () => {
        const s = Math.max(0, Math.round((Date.now() - waitStarted) / 1000))
        clockEl.textContent = `已等待 ${s}s`
      }
      stopWaitClock()
      waitTimer = setInterval(tick, 250)
      tick()
      const hide = () => {
        stopWaitClock()
        mask.remove()
        panel.remove()
      }
      panel.querySelector('.lsb-panel-close').onclick = hide
      mask.onclick = (e) => {
        if (e.target === mask) hide()
      }
    }

    function setWait(status) {
      const el = document.querySelector('.lsb-summary-panel .lsb-sum-status')
      if (el) el.textContent = status
      else showWait(status)
    }

    function show(text, meta, { fromCache = false } = {}) {
      stopWaitClock()
      const { mask, panel } = openShell()
      const facts = [
        api.util.esc(meta.model || cfg.model),
        `${meta.floors} 楼`,
        `${meta.pagesFetched}/${meta.pagesTotal} 页`,
        `送入 ${meta.chars} 字`,
        meta.truncated ? '已截断' : null,
        meta.hasOp === false ? '不含主楼' : null,
        meta.ms ? `${(meta.ms / 1000).toFixed(1)}s` : null,
        fromCache ? '缓存' : null,
      ].filter(Boolean)
      panel.innerHTML = `
        <div class="lsb-panel-head">
          <strong>AI 总结 · ${api.util.esc(meta.title || '')}</strong>
          <span class="lsb-ver">${facts.join(' · ')}</span>
          <button class="lsb-panel-close">×</button>
        </div>
        <div class="lsb-view"><div class="lsb-sum-text lsb-md"></div></div>
        <div class="lsb-actions">
          <button class="lsb-btn" data-again>重新生成</button>
          <button class="lsb-btn" data-history>历史</button>
          <button class="lsb-btn" data-copy>复制</button>
          <button class="lsb-btn is-primary" data-close>关闭</button>
        </div>`
      const box = panel.querySelector('.lsb-sum-text')
      try {
        box.innerHTML = renderMarkdown(text)
      } catch {
        box.textContent = text
      }
      const close = () => {
        mask.remove()
        panel.remove()
      }
      panel.querySelector('.lsb-panel-close').onclick = close
      panel.querySelector('[data-close]').onclick = close
      mask.onclick = (e) => {
        if (e.target === mask) close()
      }
      panel.querySelector('[data-again]').onclick = () => {
        close()
        void run(null, { force: true })
      }
      panel.querySelector('[data-history]').onclick = () => {
        close()
        api.ui.openPanel('ai-summary-history')
      }
      panel.querySelector('[data-copy]').onclick = async () => {
        try {
          await navigator.clipboard.writeText(text)
          api.ui.toast('已复制', { type: 'success' })
        } catch {
          api.ui.toast('复制失败，请手动选择文本', { type: 'error' })
        }
      }
    }

    function showError(msg) {
      stopWaitClock()
      const { mask, panel } = openShell()
      panel.innerHTML = `
        <div class="lsb-panel-head">
          <strong>AI 总结失败</strong>
          <button class="lsb-panel-close">×</button>
        </div>
        <div class="lsb-view"><div class="lsb-empty"></div></div>
        <div class="lsb-actions">
          <button class="lsb-btn" data-again>重试</button>
          <button class="lsb-btn is-primary" data-close>关闭</button>
        </div>`
      panel.querySelector('.lsb-empty').textContent = msg
      const close = () => {
        mask.remove()
        panel.remove()
      }
      panel.querySelector('.lsb-panel-close').onclick = close
      panel.querySelector('[data-close]').onclick = close
      mask.onclick = (e) => {
        if (e.target === mask) close()
      }
      panel.querySelector('[data-again]').onclick = () => {
        close()
        void run(null, { force: true })
      }
    }

    /* ── 执行 ── */
    let running = false
    async function run(btn, { force = false } = {}) {
      if (!cfg.apiUrl || !cfg.apiKey) {
        api.ui.toast('请先在面板填写 API 端点与 Key', { type: 'error' })
        api.ui.openPanel('ai-summary')
        return
      }
      if (running) {
        setWait('仍在总结中…')
        api.ui.toast('正在总结中…', { type: 'info' })
        return
      }
      running = true
      const old = btn?.textContent
      if (btn) {
        btn.textContent = '⏳ 总结中…'
        btn.disabled = true
      }
      showWait('正在采集本帖…')
      try {
        const { content, meta } = await collect()
        const hit = cached()
        if (!force && hit && hit.meta.hash === meta.hash) {
          show(hit.text, hit.meta, { fromCache: true })
          return
        }
        setWait(`已采集 ${meta.floors} 楼 · 正在请求 ${cfg.model || '模型'}…`)
        const t0 = Date.now()
        const text = await callLLM(content)
        const record = {
          text,
          meta: { ...meta, model: cfg.model, style: cfg.style, ts: Date.now(), ms: Date.now() - t0 },
        }
        api.store.set(cacheKey(), record)
        const ck = api.store.keys().filter((k) => k.startsWith('s:'))
        if (ck.length > 80) {
          const rows = ck
            .map((k) => ({ k, ts: api.store.get(k)?.meta?.ts || 0 }))
            .sort((a, b) => a.ts - b.ts)
          for (const r of rows.slice(0, rows.length - 80)) api.store.del(r.k)
        }
        show(text, record.meta)
        api.ui.toast('总结完成', { type: 'success' })
      } catch (e) {
        const msg = String(e.message || e)
        api.ui.toast(msg, { type: 'error', title: 'AI 总结失败' })
        showError(msg)
      } finally {
        running = false
        if (btn) {
          btn.disabled = false
          btn.textContent = old && old !== '⏳ 总结中…' ? old : labelFor()
        }
        refreshButtons()
      }
    }

    /* ── 按钮 ── */
    function labelFor() {
      return cached() ? '✨ 已有总结' : '✨ AI 总结'
    }
    const buttons = new Set()
    function refreshButtons() {
      const label = labelFor()
      for (const b of buttons) {
        if (!b.isConnected) buttons.delete(b)
        else if (!b.disabled) b.textContent = label
      }
    }

    function injectOpButton(li) {
      if (api.page.type !== 'topic') return
      if (li.id !== `post-${api.page.id}`) return
      const btn = api.ui.postAction(li, {
        label: labelFor(),
        title: '调用 AI 总结本帖（可在基座面板配置）',
        onClick: () => run(btn),
      })
      if (btn) buttons.add(btn)
    }
    // 选择器不能写死当前帖 id：首页先激活时 id 还不是帖子，软跳进帖后新楼层才会进 each
    api.dom.each('li.post-entry', injectOpButton)

    function syncTopLink() {
      const existing = document.querySelector('a.lsb-ai-sum-top')
      if (api.page.type !== 'topic') {
        existing?.remove()
        return
      }
      if (document.querySelector(`li.post-entry#post-${api.page.id}`)) {
        existing?.remove()
        return
      }
      if (existing) return
      const el = api.ui.topLink({
        label: '✨ AI 总结',
        title: '调用 AI 总结本页楼层',
        onClick: () => run(null),
      })
      el?.classList.add('lsb-ai-sum-top')
    }
    syncTopLink()
    api.on('route:changed', () => setTimeout(syncTopLink, 50))

    function timeAgo(ts) {
      if (!ts) return ''
      const s = Math.max(1, (Date.now() - ts) / 1000)
      if (s < 60) return '刚刚'
      if (s < 3600) return `${Math.floor(s / 60)} 分钟前`
      if (s < 86400) return `${Math.floor(s / 3600)} 小时前`
      return `${Math.floor(s / 86400)} 天前`
    }
    function listRecords() {
      return api.store
        .keys()
        .filter((k) => k.startsWith('s:'))
        .map((k) => {
          const rec = api.store.get(k, null)
          if (!rec || !rec.text) return null
          const topicId = Number(String(k).split(':')[1])
          return { k, topicId, text: rec.text, meta: rec.meta || {} }
        })
        .filter(Boolean)
        .sort((a, b) => (b.meta.ts || 0) - (a.meta.ts || 0))
    }

    api.ui.tab({
      id: 'ai-summary-history',
      name: 'AI 历史',
      order: 53,
      render(host) {
        const rows = listRecords()
        if (!rows.length) {
          host.innerHTML = '<div class="lsb-empty">还没有总结记录。在帖子页点 AI 总结后会出现在这里。</div>'
          return
        }
        host.innerHTML = `
          <div class="lsb-row-desc" style="margin-bottom:8px">共 ${rows.length} 条（上限 80）</div>
          ${rows
            .map(
              (r, i) => `
            <div class="lsb-row">
              <div class="lsb-row-main">
                <a class="lsb-row-name" href="${api.util.esc(api.routes.topic(r.topicId) || '#')}">${api.util.esc(r.meta.title || '帖子 #' + r.topicId)}</a>
                <div class="lsb-row-desc">${api.util.esc([r.meta.style, r.meta.model, r.meta.floors != null ? r.meta.floors + ' 楼' : '', timeAgo(r.meta.ts)].filter(Boolean).join(' · '))}</div>
              </div>
              <button class="lsb-btn" data-view="${i}">查看</button>
            </div>`,
            )
            .join('')}`
        host.querySelectorAll('[data-view]').forEach((btn) => {
          btn.onclick = () => {
            const r = rows[Number(btn.getAttribute('data-view'))]
            if (r) show(r.text, r.meta, { fromCache: true })
          }
        })
        const clear = document.createElement('button')
        clear.className = 'lsb-btn'
        clear.textContent = '清空全部记录'
        clear.style.marginTop = '10px'
        clear.onclick = async () => {
          if (!(await api.ui.confirm('确定清空所有总结历史？不可恢复。'))) return
          for (const k of api.store.keys().filter((x) => x.startsWith('s:'))) api.store.del(k)
          refreshButtons()
          api.ui.toast('已清空', { type: 'success' })
          api.ui.showTab('ai-summary-history')
        }
        host.appendChild(clear)
      },
    })

    /* ── 设置页（由 manifest.config 自动生成） ── */
    api.ui.configTab({ name: 'AI 总结', order: 52 })
    api.ui.style(
      '.lsb-summary-wait{padding:8px 0 4px}.lsb-sum-status{font-weight:600;margin-bottom:8px}' +
        '.lsb-sum-text{line-height:1.7}' +
        '.lsb-sum-text h1,.lsb-sum-text h2,.lsb-sum-text h3,.lsb-sum-text h4,.lsb-sum-text h5,.lsb-sum-text h6{margin:.85em 0 .4em;font-weight:650;line-height:1.35}' +
        '.lsb-sum-text h1{font-size:1.32em}.lsb-sum-text h2{font-size:1.18em}.lsb-sum-text h3{font-size:1.06em}' +
        '.lsb-sum-text p{margin:.55em 0}' +
        '.lsb-sum-text ul,.lsb-sum-text ol{margin:.45em 0;padding-left:1.45em}' +
        '.lsb-sum-text li{margin:.18em 0}' +
        '.lsb-sum-text code{font-family:ui-monospace,SFMono-Regular,Menlo,Consolas,monospace;font-size:.92em;padding:.1em .35em;border-radius:4px;background:var(--bg,#f4f4f4);border:1px solid var(--line-soft,#eee)}' +
        '.lsb-sum-text pre{margin:.65em 0;padding:10px 12px;border-radius:8px;background:var(--bg,#f6f6f6);border:1px solid var(--line,#ddd);overflow:auto}' +
        '.lsb-sum-text pre code{padding:0;border:0;background:transparent;font-size:12px}' +
        '.lsb-sum-text blockquote{margin:.55em 0;padding:2px 12px;border-left:3px solid var(--brand,#5eaaa0);color:var(--text-muted,#888)}' +
        '.lsb-sum-text a{color:var(--brand,#5eaaa0)}' +
        '.lsb-sum-text hr{border:0;border-top:1px solid var(--line,#ddd);margin:.9em 0}' +
        '.lsb-sum-text table{border-collapse:collapse;width:100%;margin:.6em 0;font-size:12px}' +
        '.lsb-sum-text th,.lsb-sum-text td{border:1px solid var(--line,#ddd);padding:5px 8px;text-align:left}' +
        '.lsb-sum-text th{background:var(--bg,#f6f6f6);font-weight:600}',
    )
    api.onDispose(() => stopWaitClock())

    /* ── 调试/测试接口 ── */
    api.handle('ai-summary:debug', () => ({
      collect,
      cached,
      cacheKey,
      renderMarkdown,
      run: (opts) => run(null, opts || {}),
      buttons: () => [...document.querySelectorAll('.lsb-op')].map((b) => b.textContent),
    }))

    return {}
  }

  const w = typeof unsafeWindow !== 'undefined' ? unsafeWindow : window
  if (w.LSB && w.LSB.register) w.LSB.register(manifest, setup)
  else ;(w.LSB_PLUGINS = w.LSB_PLUGINS || []).push({ manifest, setup })
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
/* ══════════════ LSB·界面精修 v1.1.28 (skin) ══════════════ */
(function () {
  'use strict'

  const manifest = {
    id: 'skin',
    name: '界面精修',
    version: '1.1.28',
    description: '氢壳 + 正文排版/列表密度/代码块/楼层优化/限宽阅读，分项开关',
    author: 'you',
    requires: { base: '^0.1.0' },
    permissions: ['ui', 'storage', 'events', 'read'],
    config: {
      shell: { type: 'switch', label: '氢壳（左栏导航 + 顶栏）', default: true },
      typography: { type: 'switch', label: '正文排版（行高 1.75 · 中文字体栈）', default: true },
      density: {
        type: 'select',
        label: '列表密度',
        default: '舒适',
        options: ['紧凑', '舒适'],
      },
      codeblock: { type: 'switch', label: '代码块样式强化', default: true },
      floors: { type: 'switch', label: '楼层优化（分隔线 + OP 高亮）', default: true },
      measure: { type: 'switch', label: '宽屏限宽阅读（≥1280px 生效）', default: false },
    },
  }

  function setup(api) {
    let cfg = api.config()
    let searchHome = null
    let userCardHome = null
    const extrasHomes = new Map()
    const asideHomes = new Map()
    let themeToggleHome = null
    let onlineObs = null
    let extrasObs = null
    let timelineRaf = 0
    let refreshTimer = 0
    let windowListening = false
    let spaSerial = 0
    let spaProgressTimer = 0
    let spaIgnorePop = false
    let spaBound = false
    let homeInf = null

    /* ── 共存检测：色彩主题已由其它脚本负责，本模块只做排版层，天然无冲突。
       若未来加入色彩子项，须在此让位。 ── */
    const themesPresent = !!document.querySelector('style[data-themes-plugin]')

    const FONT_SANS =
      "system-ui,-apple-system,'Segoe UI','PingFang SC','Hiragino Sans GB','Microsoft YaHei','Noto Sans SC',sans-serif"
    const FONT_MONO =
      "ui-monospace,SFMono-Regular,'Cascadia Code',Consolas,'JetBrains Mono','Noto Sans Mono CJK SC',monospace"

    function esc(s) {
      return String(s ?? '').replace(/[&<>"']/g, (c) =>
        ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c],
      )
    }

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
        html[data-themes-color-mode="dark"]{color-scheme:dark}
        html[data-themes-color-mode="light"]{color-scheme:light}
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
        .lsb-shell-rail-scroll{flex:1;min-height:0;overflow:auto;padding:56px 12px 12px}
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
        .lsb-shell-theme{margin-left:8px;display:flex;align-items:center}
        .lsb-shell-theme [data-themes-mode-toggle]{
          border:0;background:transparent;color:var(--text,#222);cursor:pointer;
          width:32px;height:32px;padding:4px;border-radius:var(--lsb-radius-sm);
        }
        .lsb-shell-theme [data-themes-mode-toggle] svg{display:block;width:18px;height:18px}
        #lsb-shell-aside{
          display:none;position:fixed;top:var(--lsb-shell-header);right:0;bottom:0;
          width:var(--lsb-shell-aside);z-index:7999;overflow:auto;padding:12px 10px 16px;
          background:var(--bg,#f4f5f7);color:var(--text,#222);
          border-left:1px solid var(--line-soft,#e8e8e8);
          font-family:${FONT_SANS};
        }
        #lsb-shell-aside .sidebar-card{
          margin:0 0 10px;padding:10px 10px 8px;border-radius:var(--lsb-radius);
          background:color-mix(in srgb,var(--panel,#fff) 78%,transparent);
        }
        .lsb-shell-nav-section{margin:0 0 16px}
        .lsb-shell-nav-section h2{
          margin:0 8px 6px;font-size:11px;font-weight:600;color:var(--text-muted,#888);
          letter-spacing:.04em;
        }
        .lsb-shell-nav a{
          display:flex;align-items:center;justify-content:space-between;gap:8px;padding:6px 10px;border-radius:var(--lsb-radius-sm);
          color:var(--text,#222);text-decoration:none;font-size:13px;font-weight:500;
        }
        .lsb-shell-nav a .lsb-shell-link-label{
          min-width:0;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;
        }
        .lsb-shell-nav a .lsb-shell-count{
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
        .lsb-shell-settings:active,.lsb-shell-nav a:active{transform:scale(.98)}
        #lsb-shell-timeline{
          position:fixed;top:calc(var(--lsb-shell-header) + 20px);right:14px;bottom:28px;
          width:var(--lsb-shell-timeline);z-index:7998;
          display:flex;flex-direction:column;align-items:center;gap:8px;
          font-family:${FONT_SANS};font-size:11px;font-weight:600;color:var(--text-muted,#888);
        }
        #lsb-shell-timeline[hidden]{display:none!important}
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
        html.lsb-skin-shell-on li.post-item .meta-icon{display:none}
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
        html.lsb-skin-shell-on li.post-entry{
          border-radius:var(--lsb-radius);
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
          html.lsb-skin-shell-on .lsb-native-sidebar-hidden{display:none!important}
          html.lsb-skin-shell-on .forum-layout.forum-layout-has-sidebar{
            display:block!important;grid-template-columns:1fr!important;
          }
          html.lsb-skin-shell-on .lsb-launcher{display:none!important}
          html.lsb-skin-shell-user{padding-right:var(--lsb-shell-aside)}
          html.lsb-skin-shell-user #lsb-shell-aside{display:block}
        }
        @media(min-width:1100px){
          html.lsb-skin-shell-on{padding-right:var(--lsb-shell-aside)}
          html.lsb-skin-shell-topic{padding-right:var(--lsb-shell-aside)}
          html.lsb-skin-shell-on #lsb-shell-aside{display:block}
          html.lsb-skin-shell-on #lsb-shell-timeline{display:none!important}
        }
        @media(hover:hover) and (pointer:fine){
          .lsb-shell-nav a:hover{background:color-mix(in srgb,var(--bg,#fff) 40%,transparent)}
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
          position:fixed;top:0;left:0;right:0;z-index:8002;height:2px;
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
      `
    }

    function css() {
      const parts = []

      if (cfg.shell) parts.push(shellCss())

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
          html.lsb-skin-floors-on li.post-entry[data-floor='1']{border-left:3px solid var(--brand,#5eaaa0);border-radius:4px}
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

    /** 状态类挂 <html> 上：CSS 特异性干净，测试也容易断言 */
    function applyMarkers() {
      const root = document.documentElement
      root.classList.toggle('lsb-skin-type-on', !!cfg.typography)
      root.classList.toggle('lsb-skin-density-compact', cfg.density === '紧凑')
      root.classList.toggle('lsb-skin-code-on', !!cfg.codeblock)
      root.classList.toggle('lsb-skin-floors-on', !!cfg.floors)
      root.classList.toggle('lsb-skin-measure-on', !!cfg.measure)
      root.classList.toggle('lsb-skin-shell-on', !!cfg.shell)
      root.classList.toggle('lsb-skin-shell-topic', !!cfg.shell && api.page?.type === 'topic')
      root.classList.toggle('lsb-skin-shell-user', !!cfg.shell && api.page?.type === 'user')
    }

    function restyle() {
      applyMarkers()
      const id = 'lsb-skin-style'
      let el = document.getElementById(id)
      if (!el) {
        el = document.createElement('style')
        el.id = id
        document.head.appendChild(el)
      }
      el.textContent = css()
    }

    function nativeSidebars() {
      return [...document.querySelectorAll('aside.sidebar')].filter(
        (el) => el.id !== 'mobile-menu-drawer' && !el.classList.contains('mobile-menu-drawer'),
      )
    }

    function markNative(on) {
      document.querySelector('body > .top')?.classList.toggle('lsb-native-header-hidden', on)
      for (const el of nativeSidebars()) el.classList.toggle('lsb-native-sidebar-hidden', on)
    }

    function collectBoards() {
      const forums = api.forums || []
      const cached = api.store.get('boardCounts') || {}
      const live = {}
      for (const f of forums) {
        if (Number.isFinite(f.topics)) live[f.id] = f.topics
      }
      const counts = { ...cached, ...live }
      if (Object.keys(live).length) api.store.set('boardCounts', counts)
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

    function collectCheckin() {
      const a = [...document.querySelectorAll('a[href*="/daily_checkin"]')].find(
        (el) => !el.closest('#lsb-shell'),
      )
      return {
        href: a?.getAttribute('href') || api.routes.checkin,
        label: (a?.textContent || '').trim() || '每日签到',
      }
    }

    function locationText() {
      const p = api.page || {}
      if (p.type === 'home') return '全部主题'
      if (p.type === 'forum') {
        const f = (api.forums || []).find((x) => x.id === p.id)
        return f?.name || '版块'
      }
      if (p.type === 'topic') {
        try {
          const title = api.parse.topic(document)?.title
          if (title) return title
        } catch {
          /* 解析失败则读标题节点 */
        }
        return (document.querySelector('h1.post-content-title')?.textContent || '').trim() || '帖子'
      }
      if (p.type === 'user') return '用户'
      return 'LINUX SB'
    }

    function isActiveHref(href) {
      const p = api.page || {}
      if (href === '/' || href === '') return p.type === 'home'
      if (p.type === 'forum') return href === `/forum/${p.id}`
      return false
    }

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

    function adoptSearch(host) {
      if (!(host instanceof Element)) return
      const existing = host.querySelector('form')
      if (existing) return
      const form =
        document.querySelector('body > .top .search-form') || document.querySelector('.search-form')
      if (!(form instanceof HTMLFormElement) || host.contains(form)) return
      searchHome = { parent: form.parentNode, next: form.nextSibling }
      form.classList.add('lsb-shell-search')
      host.append(form)
    }

    function restoreSearch() {
      const form = document.querySelector('form.lsb-shell-search')
      if (!form || !searchHome?.parent?.isConnected) {
        form?.classList.remove('lsb-shell-search')
        searchHome = null
        return
      }
      if (searchHome.next?.parentNode === searchHome.parent) {
        searchHome.parent.insertBefore(form, searchHome.next)
      } else {
        searchHome.parent.append(form)
      }
      form.classList.remove('lsb-shell-search')
      searchHome = null
    }

    function findNativeUserCard() {
      const hosted = document.querySelector('#lsb-shell [data-lsb-shell-me] .sidebar-card.user-card')
      if (hosted) return hosted
      for (const side of nativeSidebars()) {
        const card = side.querySelector('.sidebar-card.user-card')
        if (card) return card
      }
      return document.querySelector('aside.sidebar .sidebar-card.user-card')
    }

    function isSelfUserCard(card) {
      if (!(card instanceof Element)) return false
      const uid = api.me?.uid
      if (uid == null) return true
      const href = card.querySelector('a.user-name')?.getAttribute('href') || ''
      return href.includes(`/user/${uid}`)
    }

    function findIncomingSelfCard(host) {
      for (const side of nativeSidebars()) {
        for (const card of side.querySelectorAll('.sidebar-card.user-card')) {
          if (host?.contains(card)) continue
          if (!isSelfUserCard(card)) continue
          return card
        }
      }
      return null
    }

    function adoptUserCard(host) {
      if (!(host instanceof Element)) return
      const incoming = findIncomingSelfCard(host)
      const hosted = host.querySelector('.sidebar-card.user-card')
      if (incoming && incoming !== hosted) {
        if (hosted) restoreUserCard()
        userCardHome = { parent: incoming.parentNode, next: incoming.nextSibling }
        incoming.classList.add('lsb-shell-user-card')
        host.append(incoming)
        return
      }
      if (hosted) return
      const card = findNativeUserCard()
      if (!(card instanceof Element) || host.contains(card) || !isSelfUserCard(card)) return
      userCardHome = { parent: card.parentNode, next: card.nextSibling }
      card.classList.add('lsb-shell-user-card')
      host.append(card)
    }

    function restoreUserCard() {
      const card = document.querySelector('.lsb-shell-user-card')
      restoreNode(card, userCardHome, 'lsb-shell-user-card')
      userCardHome = null
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

    function collectTopExtras() {
      const top = document.querySelector('body > .top')
      if (!top) return []
      return [...top.querySelectorAll('a.forum-enhancements-custom-top-link')].filter(
        (a) => a instanceof HTMLAnchorElement && extraLabel(a) && !isJunkExtra(a.href, extraLabel(a)),
      )
    }

    function adoptTopExtras(host) {
      if (!(host instanceof Element)) return
      for (const a of [...host.querySelectorAll('a[href]')]) {
        const label = extraLabel(a) || (a.textContent || '').trim()
        if (!isJunkExtra(a.href, label)) continue
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
        if (node.matches('a[href]') && isJunkExtra(node.getAttribute('href'), label)) {
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
        .filter((x) => x.href && x.label && !isJunkExtra(x.href, x.label))
      if (links.length) api.store.set('topExtras', links)
    }

    function hydrateTopExtras(host, have) {
      if (!(host instanceof Element)) return
      const known = have || new Set([...host.querySelectorAll('a[href]')].map((a) => a.href))
      for (const item of api.store.get('topExtras') || []) {
        if (!item?.href || !item.label || isJunkExtra(item.href, item.label)) continue
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
      if (!(host instanceof Element)) return
      const btn = document.querySelector('[data-themes-mode-toggle]')
      if (!btn || host.contains(btn)) return
      if (!themeToggleHome) themeToggleHome = { parent: btn.parentNode, next: btn.nextSibling }
      btn.classList.add('lsb-shell-theme-toggle')
      host.append(btn)
    }

    function restoreThemeToggle() {
      const btn = document.querySelector('[data-themes-mode-toggle]')
      restoreNode(btn, themeToggleHome, 'lsb-shell-theme-toggle')
      themeToggleHome = null
    }

    function nativeCards() {
      return nativeSidebars().flatMap((side) => [...side.querySelectorAll('.sidebar-card')])
    }

    function pickAsideCards() {
      const hosted = [...document.querySelectorAll('#lsb-shell-aside .sidebar-card')]
      const all = [...nativeCards(), ...hosted]
      const seen = new Set()
      const uniq = all.filter((el) => {
        if (seen.has(el)) return false
        seen.add(el)
        return true
      })
      const text = (el) => (el.textContent || '').replace(/\s+/g, ' ').trim()
      const onUser = api.page?.type === 'user'
      const profile = onUser
        ? uniq.find(
            (c) =>
              c.classList.contains('user-card')
              && !c.classList.contains('lsb-shell-user-card')
              && !isSelfUserCard(c),
          )
        : null
      const bio = onUser ? uniq.find((c) => c.classList.contains('bio-card')) : null
      const quick = uniq.find((c) => text(c).startsWith('快捷功能'))
      const hot = uniq.find((c) => c.classList.contains('daily-hot-topics-card'))
      const stats = uniq.find((c) => c.classList.contains('stats-card'))
      const online = uniq.find((c) => c.classList.contains('online-users-card'))
      return [profile, bio, quick, hot, stats, online].filter(Boolean)
    }

    function adoptAsideCards(host) {
      if (!(host instanceof Element)) return
      for (const card of pickAsideCards()) {
        if (host.contains(card) || card.classList.contains('lsb-shell-user-card')) continue
        asideHomes.set(card, { parent: card.parentNode, next: card.nextSibling })
        card.classList.add('lsb-shell-aside-card')
        host.append(card)
      }
      hydrateAsideKeep(host)
      snapshotAsideKeep(host)
    }

    function cardLabel(el) {
      return (el.textContent || '').replace(/\s+/g, ' ').trim()
    }

    function snapshotAsideKeep(host) {
      if (!(host instanceof Element)) return
      const keep = { ...(api.store.get('asideKeep') || {}) }
      const live = [...host.querySelectorAll('.sidebar-card')].filter(
        (el) => !el.hasAttribute('data-lsb-aside-keep'),
      )
      const quick = live.find((c) => cardLabel(c).startsWith('快捷功能'))
      const stats = live.find((c) => c.classList.contains('stats-card'))
      const online = live.find((c) => c.classList.contains('online-users-card'))
      let changed = false
      if (quick) {
        const node = quick.cloneNode(true)
        node.querySelectorAll('[data-themes-mode-toggle]').forEach((n) => n.remove())
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
      if (changed) api.store.set('asideKeep', keep)
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
      const keep = api.store.get('asideKeep') || {}
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
      if (onlineObs || document.querySelector('#lsb-shell-aside .online-users-card')) return
      const sides = nativeSidebars()
      if (!sides.length) return
      onlineObs = new MutationObserver(() => {
        const host = document.querySelector('#lsb-shell-aside')
        if (!host || !cfg.shell) return
        adoptAsideCards(host)
        if (host.querySelector('.online-users-card')) stopOnlineWatch()
      })
      for (const side of sides) onlineObs.observe(side, { childList: true, subtree: true })
    }

    function stopOnlineWatch() {
      onlineObs?.disconnect()
      onlineObs = null
    }

    function watchTopExtras() {
      if (extrasObs) return
      const top = document.querySelector('body > .top')
      if (!top) return
      extrasObs = new MutationObserver(() => {
        const host = document.querySelector('[data-lsb-shell-extras]')
        if (!host || !cfg.shell) return
        adoptTopExtras(host)
      })
      extrasObs.observe(top, { childList: true, subtree: true })
    }

    function stopExtrasWatch() {
      extrasObs?.disconnect()
      extrasObs = null
    }

    function renderLinks(links) {
      return links
        .map((link) => {
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

    function topicPosts() {
      const sel = api.sel?.topicPosts || 'ul.topic-post-list > li.post-entry, ul.post-list > li.post-entry'
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
        behavior: matchMedia('(prefers-reduced-motion: reduce)').matches ? 'auto' : 'smooth',
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
      const onTopic = api.page?.type === 'topic' && topicPosts().length > 0
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
      const timeline = document.querySelector('#lsb-shell-timeline')
      if (!timeline || !cfg.shell) return
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
      const time = post?.querySelector('time, span[data-performance-time]')
      timeline.querySelector('[data-timeline-date]').textContent = (time?.textContent || '').trim().slice(0, 24)
      timeline.querySelector('[data-timeline-total]').textContent = `${Math.max(0, posts.length - 1)} 条回复`
      const track = timeline.querySelector('.lsb-shell-track')
      track.setAttribute('aria-valuenow', String(Math.round(progress)))
    }

    function scheduleTimeline() {
      if (timelineRaf) return
      timelineRaf = window.requestAnimationFrame(updateTimeline)
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

    function ensureShell() {
      let el = document.getElementById('lsb-shell')
      if (el) {
        if (el.parentNode !== document.body) document.body.append(el)
        return el
      }
      el = document.createElement('div')
      el.id = 'lsb-shell'
      const nativeBrand = document.querySelector('body > .top a.brand')
      const brandName = (nativeBrand?.textContent || 'LINUX SB').trim()
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
        <aside id="lsb-shell-rail" aria-label="氢导航">
          <div class="lsb-shell-rail-scroll">
            <div class="lsb-shell-me" data-lsb-shell-me></div>
            <div data-lsb-shell-section="home"></div>
            <div data-lsb-shell-section="boards"></div>
            <div data-lsb-shell-section="checkin"></div>
          </div>
          <div class="lsb-shell-rail-foot">
            <button type="button" class="lsb-shell-settings" data-lsb-shell-settings>设置</button>
          </div>
        </aside>
        <aside id="lsb-shell-aside" aria-label="站点信息"></aside>`
      el.querySelector('[data-lsb-shell-settings]').addEventListener('click', () => api.ui.openPanel('skin'))
      document.body.append(el)
      return el
    }

    function fillShell() {
      const el = ensureShell()
      pruneDetachedAsideCards()
      adoptSearch(el.querySelector('.lsb-shell-search-host'))
      adoptTopExtras(el.querySelector('[data-lsb-shell-extras]'))
      adoptThemeToggle(el.querySelector('[data-lsb-shell-theme]'))
      adoptUserCard(el.querySelector('[data-lsb-shell-me]'))
      adoptAsideCards(el.querySelector('#lsb-shell-aside'))
      watchOnlineCard()
      watchTopExtras()
      const where = el.querySelector('[data-lsb-shell-where]')
      if (where) where.textContent = locationText()
      setSection(el.querySelector('[data-lsb-shell-section="home"]'), '', [
        { href: '/', label: '全部主题' },
      ])
      setSection(el.querySelector('[data-lsb-shell-section="boards"]'), '版块', collectBoards())
      const checkin = collectCheckin()
      setSection(el.querySelector('[data-lsb-shell-section="checkin"]'), '', [checkin])
      const timeline = ensureTimeline(el)
      if (timeline) {
        bindWindow()
        scheduleTimeline()
      } else {
        unbindWindow()
      }
      syncHomeInfiniteScroll()
    }

    function isHomeInfPath(urlLike = location.href) {
      try {
        const url = new URL(urlLike, location.href)
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

    function unbindHomeInfiniteScroll() {
      if (!homeInf) return
      window.removeEventListener('scroll', homeInf.onScroll)
      homeInf.status?.remove()
      homeInf = null
    }

    function hideHomePagination(pagination) {
      if (!(pagination instanceof Element)) return
      pagination.classList.add('sb-infinite-scroll-pagination-hidden')
      pagination.setAttribute('aria-hidden', 'true')
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
      if (!state || state.loading || !state.hasMore) return
      state.loading = true
      setHomeInfStatus('loading', '加载中...')
      let next = state.page + 1
      while (state.loaded[next]) next += 1
      const url = new URL(location.href)
      url.searchParams.set('p', String(next))
      try {
        const res = await api.net.raw(`${url.pathname}${url.search}`, {
          queue: false,
          timeout: 15000,
          retry: 0,
        })
        if (homeInf !== state) return
        if (!res.ok) throw new Error(`HTTP ${res.status}`)
        const doc = new DOMParser().parseFromString(res.text, 'text/html')
        const remoteList = doc.querySelector('.main-panel > ul.post-list, ul.post-list')
        const items = remoteList ? [...remoteList.children] : []
        if (!items.length) {
          state.hasMore = false
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
        document.dispatchEvent(new CustomEvent('sb:topic-list-updated', {
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
      const seen = {}
      for (const item of list.children) {
        if (item.matches?.('.post-item')) {
          const key = homeInfTopicKey(item)
          if (key) seen[key] = true
        }
      }
      const page = parseInt(new URL(location.href).searchParams.get('p'), 10) || 1
      const onScroll = () => {
        if (!homeInf || homeInf.loading || !homeInf.hasMore) return
        if (homeInf.scrollTimer) return
        homeInf.scrollTimer = window.setTimeout(() => {
          if (homeInf) homeInf.scrollTimer = 0
          const rect = list.getBoundingClientRect()
          const distance = rect.bottom - (window.innerHeight || 0)
          if (distance <= 100) void loadHomeInfPage()
        }, 200)
      }
      hideHomePagination(pagination)
      homeInf = {
        list,
        pagination,
        seen,
        loaded: { [page]: true },
        page,
        loading: false,
        hasMore: homeInfHasNext(document),
        onScroll,
        scrollTimer: 0,
        status: null,
      }
      if (!homeInf.hasMore) {
        setHomeInfStatus('end', '没有更多内容了')
        return
      }
      window.addEventListener('scroll', onScroll, { passive: true })
    }

    function syncHomeInfiniteScroll() {
      if (!cfg.shell || !isHomeInfPath() || !homeInfEnabled()) {
        unbindHomeInfiniteScroll()
        return
      }
      const list = document.querySelector('.main-panel > ul.post-list')
      const pagination = document.querySelector('.pagination-bar')
      if (!list || !pagination) {
        unbindHomeInfiniteScroll()
        return
      }
      if (homeInf?.list === list && homeInf.pagination === pagination) return
      unbindHomeInfiniteScroll()
      if (pagination.classList.contains('sb-infinite-scroll-pagination-hidden')) return
      bindHomeInfiniteScroll(list, pagination)
    }

    function findRouteOutlet(scope = document) {
      const candidates = [scope.querySelector?.('main.wrap'), scope.querySelector?.('main')]
      for (const el of candidates) {
        if (!el || el.id === 'lsb-shell' || el.querySelector?.('#lsb-shell')) continue
        return el
      }
      return null
    }

    function hideNativeSidebars(root) {
      if (!root?.querySelectorAll) return
      for (const el of root.querySelectorAll('aside.sidebar')) {
        if (el.id === 'mobile-menu-drawer' || el.classList.contains('mobile-menu-drawer')) continue
        el.classList.add('lsb-native-sidebar-hidden')
      }
    }

    function isSpaUrl(urlLike) {
      if (!cfg.shell) return false
      let url
      try {
        url = new URL(urlLike, location.href)
      } catch {
        return false
      }
      if (url.origin !== location.origin) return false
      const path = url.pathname.replace(/\/{2,}/g, '/') || '/'
      // 帖子页的讨论串靠站点脚本在整页生命周期里挂载；软跳进帖子会剥脚本，刷新才出现。
      if (/^\/topic\/\d+/.test(path)) return false
      return (
        path === '/'
        || path === '/index.php'
        || path === '/latest'
        || /^\/forum\/\d+/.test(path)
        || /^\/category\/\d+/.test(path)
      )
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
      }, 160)
    }

    function syncRouteHead(pageDoc) {
      if (pageDoc.title) document.title = pageDoc.title
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

    function commitRoute(pageDoc, remoteOutlet) {
      const outlet = findRouteOutlet()
      if (!outlet || !remoteOutlet) throw new Error('no outlet')
      remoteOutlet.querySelectorAll('script').forEach((node) => node.remove())
      hideNativeSidebars(remoteOutlet)
      const kids = [...remoteOutlet.childNodes].map((node) => document.importNode(node, true))
      syncOutletAttrs(outlet, remoteOutlet)
      outlet.replaceChildren(...kids)
      outlet.removeAttribute('aria-busy')
      syncRouteHead(pageDoc)
      markNative(true)
    }

    function notifyRoute() {
      spaIgnorePop = true
      try {
        const view = document.defaultView
        const Ev = view.PopStateEvent || view.Event
        view.dispatchEvent(new Ev('popstate'))
      } catch {
        try {
          window.dispatchEvent(new Event('popstate'))
        } catch {
          /* 基座还有 url 轮询兜底 */
        }
      } finally {
        spaIgnorePop = false
      }
    }

    function applyHistory(target, mode) {
      if (mode === 'none') return
      const state = { lsbShellSpa: true }
      try {
        if (mode === 'replace') history.replaceState(state, '', target.href)
        else history.pushState(state, '', target.href)
      } catch {
        /* history 不可用时仍换 DOM，地址栏可能落后 */
      }
    }

    async function navigateSpa(href, options = {}) {
      const settings = { historyMode: 'push', force: false, ...options }
      let target
      try {
        target = new URL(href, location.href)
      } catch {
        return false
      }
      if (!isSpaUrl(target.href)) return false
      if (!settings.force && hasUnsavedEditor() && !window.confirm('当前编辑内容尚未保存，确定离开吗？')) {
        return false
      }
      const same = target.pathname === location.pathname && target.search === location.search
      if (same && !settings.force) {
        if (target.hash) {
          const id = decodeURIComponent(target.hash.slice(1))
          document.getElementById(id)?.scrollIntoView()
        }
        return true
      }

      const serial = ++spaSerial
      const outlet = findRouteOutlet()
      outlet?.setAttribute('aria-busy', 'true')
      startProgress(serial)
      let committed = false
      try {
        const res = await api.net.raw(`${target.pathname}${target.search}`, {
          queue: false,
          timeout: 15000,
          retry: 0,
        })
        if (serial !== spaSerial) return false
        if (!res.ok) throw new Error(`HTTP ${res.status}`)
        const finalUrl = new URL(res.url || target.href, target.href)
        if (!isSpaUrl(finalUrl.href)) {
          location.assign(finalUrl.href)
          return false
        }
        const pageDoc = new DOMParser().parseFromString(res.text, 'text/html')
        const remoteOutlet = findRouteOutlet(pageDoc)
        if (!remoteOutlet) throw new Error('no remote outlet')
        applyHistory(finalUrl, settings.historyMode)
        commitRoute(pageDoc, remoteOutlet)
        committed = true
        notifyRoute()
        finishProgress(serial)
        applyMarkers()
        fillShell()
        window.clearTimeout(refreshTimer)
        refreshTimer = 0
        try {
          window.scrollTo(0, 0)
        } catch {
          /* jsdom 没有视口 */
        }
        return true
      } catch (err) {
        if (serial !== spaSerial) return false
        finishProgress(serial)
        outlet?.removeAttribute('aria-busy')
        if (!committed && settings.historyMode !== 'none') location.assign(target.href)
        return false
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
        || anchor.closest('.pagination-bar, .pagination')
      ) return
      if (!isSpaUrl(anchor.href)) return
      if (anchor.href === location.href) return
      event.preventDefault()
      void navigateSpa(anchor.href)
    }

    function onSpaSubmit(event) {
      if (event.defaultPrevented) return
      const form = event.target instanceof HTMLFormElement ? event.target : null
      if (!form || String(form.method || 'get').toLowerCase() !== 'get') return
      if (form.target && form.target !== '_self') return
      if (form.matches('[data-no-spa], [data-confirm]')) return
      let target
      try {
        target = new URL(form.action || location.href, location.href)
        const data = event.submitter ? new FormData(form, event.submitter) : new FormData(form)
        target.search = new URLSearchParams(data).toString()
      } catch {
        return
      }
      if (!isSpaUrl(target.href)) return
      event.preventDefault()
      void navigateSpa(target.href)
    }

    function onSpaPop() {
      if (spaIgnorePop || !cfg.shell) return
      if (!isSpaUrl(location.href)) {
        location.reload()
        return
      }
      void navigateSpa(location.href, { historyMode: 'none', force: true })
    }

    function bindSpa() {
      if (spaBound) return
      spaBound = true
      try {
        history.scrollRestoration = 'manual'
      } catch {
        /* ignore */
      }
      document.addEventListener('click', onSpaClick, true)
      document.addEventListener('submit', onSpaSubmit, true)
      window.addEventListener('popstate', onSpaPop)
    }

    function unbindSpa() {
      if (!spaBound) return
      spaBound = false
      spaSerial += 1
      window.clearTimeout(spaProgressTimer)
      spaProgressTimer = 0
      document.removeEventListener('click', onSpaClick, true)
      document.removeEventListener('submit', onSpaSubmit, true)
      window.removeEventListener('popstate', onSpaPop)
      document.getElementById('lsb-shell-progress')?.remove()
    }

    function teardownShell() {
      window.clearTimeout(refreshTimer)
      refreshTimer = 0
      if (timelineRaf) {
        window.cancelAnimationFrame(timelineRaf)
        timelineRaf = 0
      }
      unbindSpa()
      unbindHomeInfiniteScroll()
      unbindWindow()
      stopOnlineWatch()
      stopExtrasWatch()
      restoreAsideCards()
      restoreUserCard()
      restoreTopExtras()
      restoreThemeToggle()
      restoreSearch()
      document.getElementById('lsb-shell')?.remove()
      markNative(false)
      document.documentElement.classList.remove('lsb-skin-shell-on', 'lsb-skin-shell-topic', 'lsb-skin-shell-user')
      document.getElementById('lsb-shell-boot-style')?.remove()
      document.documentElement.classList.remove('lsb-shell-boot')
    }

    function refreshShell() {
      if (!cfg.shell) {
        teardownShell()
        return
      }
      markNative(true)
      applyMarkers()
      fillShell()
      bindSpa()
    }

    function scheduleRefresh() {
      window.clearTimeout(refreshTimer)
      refreshTimer = window.setTimeout(refreshShell, 50)
    }

    function applyAll() {
      restyle()
      refreshShell()
    }

    api.ui.configTab({ name: '界面精修', order: 80 })

    let unregMenu = () => {}
    function syncGmMenu() {
      unregMenu()
      const on = !!api.config().shell
      unregMenu = api.ui.menuCommand(on ? '氢壳：关闭，回到原版界面' : '氢壳：开启', () => {
        api.saveConfig({ shell: !api.config().shell })
      })
    }
    syncGmMenu()

    api.on('config:changed:skin', () => {
      cfg = api.config()
      applyAll()
      syncGmMenu()
    })
    api.on('route:changed', scheduleRefresh)
    api.on('topic:posts-added', scheduleTimeline)
    api.dom.each('[data-themes-mode-toggle]', () => {
      if (!cfg.shell) return
      adoptThemeToggle(document.querySelector('[data-lsb-shell-theme]'))
    })

    api.onDispose(() => {
      unregMenu()
      teardownShell()
      const root = document.documentElement
      for (const c of [...root.classList].filter((x) => x.startsWith('lsb-skin-'))) root.classList.remove(c)
      document.getElementById('lsb-skin-style')?.remove()
    })

    api.handle('skin:debug', () => ({
      active: { ...cfg },
      markers: [...document.documentElement.classList].filter((c) => c.startsWith('lsb-skin-')),
      styleBytes: (document.getElementById('lsb-skin-style')?.textContent || '').length,
      themesPluginDetected: themesPresent,
      shell: {
        on: !!cfg.shell,
        mounted: !!document.getElementById('lsb-shell'),
        boards: collectBoards().length,
        location: locationText(),
        timeline: !!document.getElementById('lsb-shell-timeline'),
        me: !!document.querySelector('#lsb-shell .sidebar-card.user-card'),
        extras: document.querySelectorAll('.lsb-shell-extras a').length,
        aside: document.querySelectorAll('#lsb-shell-aside .sidebar-card').length,
        spa: spaBound,
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
/* ══════════════ LSB·实时流 v1.2.5 (live-feed) ══════════════ */
(function () {
  'use strict'

  const manifest = {
    id: 'live-feed',
    name: '实时流',
    version: '1.2.5',
    description: '新帖/新回复免刷新送达：视口锚点无感插入 + 打字免打扰 + 新动态高亮',
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
      if (election.isLeader) scheduleNext()
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

    function captureList() {
      const ul = document.querySelector(api.sel?.listUl || 'ul.post-list')
      if (!ul) return false
      const seen = new Map()
      let maxId = 0
      let maxTs = 0
      for (const li of ul.querySelectorAll('li.post-item')) {
        const it = api.parse.listItem(li)
        if (it?.id) {
          seen.set(it.id, freshnessOf(it))
          maxId = Math.max(maxId, it.id)
          maxTs = Math.max(maxTs, it.lastActiveTs || 0)
        }
      }
      // 流类型：与当前视图同源判定。发布流用 id 序数判新；回复流用活跃时间戳判新。
      const sort = api.page.sort === 'post' || /([?&])sort=post/.test(location.search) ? 'post' : 'comment'
      ctx = { ul, seen, maxId, maxTs, sort }
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
      const maxPostId = posts.reduce((m, li) => {
        const id = Number((li.id || '').match(/^post-(\d+)/)?.[1] || 0)
        return Math.max(m, id)
      }, 0)
      ctx = { tid, ul, maxPostId, pages: t.pages || 1 }
      mode = 'topic'
      return true
    }

    function init() {
      teardown()
      navGen += 1
      const ok = api.page.type === 'topic' && cfg.trackTopicReplies ? captureTopic() : captureList()
      if (!ok) mode = null
    }

    function teardown() {
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
      li.post-item.lsb-live-bumped{animation:lsb-live-bump 2.4s ease-out}
      @keyframes lsb-live-bump{0%,22%{background:var(--brand-soft,#eef7f5)}100%{background:transparent}}
    `)

    function showBanner(text, onClick, { asTopic = false, quiet = false } = {}) {
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

    /* ── 轮询：列表模式 ── */
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
    function markBumped(items) {
      lastBumped = items.length
      if (!cfg.highlightBumped || !items.length || !ctx.ul) return
      for (const it of items) {
        const row = ctx.ul.querySelector(`:scope > li.post-item a.post-title[href*="/topic/${it.id}"]`)
          ?.closest('li.post-item')
        if (!row) continue
        row.classList.remove('lsb-live-bumped')
        void row.offsetWidth
        row.classList.add('lsb-live-bumped')
        const tid = setTimeout(() => row.classList.remove('lsb-live-bumped'), 2600)
        bumpTimers.push(tid)
      }
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
      const gen = navGen
      const ul = ctx.ul
      const seen = ctx.seen
      if (!seen) return 0
      const doc = await api.net.doc(listUrl())
      if (gen !== navGen || ctx.ul !== ul || ctx.seen !== seen) return 0
      const isPost = ctx.sort === 'post'
      const bumped = []
      for (const li of doc.querySelectorAll('li.post-item')) {
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
          if (isPost ? it.id > ctx.maxId : (it.lastActiveTs || 0) > ctx.maxTs) {
            pending.push(it)
            if (pending.length > 200) pending.shift()
          }
          ctx.seen.set(it.id, fp) // 无论是否计入，见过的都不再当新帖
        } else if (prev !== fp) {
          // 已在列表里、但回复数/活跃时间变了 → 老帖有新动态：原地高亮而非重复插入
          bumped.push(it)
          ctx.seen.set(it.id, fp)
        }
      }
      markBumped(bumped)

      if (!pending.length) {
        if (!bumped.length) hideBanner()
        return 0
      }
      announceNew('帖', pending.length)
      ctx.maxId = Math.max(ctx.maxId, ...pending.map((x) => x.id))
      ctx.maxTs = Math.max(ctx.maxTs, ...pending.map((x) => x.lastActiveTs || 0))
      const n = pending.length
      if (gen !== navGen || ctx.ul !== ul) return 0
      await flushOrOffer()
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

    async function flushOrOffer() {
      if (!pending.length) return
      if (canFlushNow()) {
        const away = !nearTop()
        const n = insertPending(true)
        // 在视口外静默插入后仍然告知一声，并给一键回顶——内容不过期，用户也不失去感知。
        // （逛吧只是静默插入，用户不知道上面多了东西）
        if (n && away) {
          showBanner(`▲ 已加载 ${n} 条新帖 — 点击回到顶部`, () => {
            hideBanner()
            window.scrollTo?.({ top: 0, behavior: 'smooth' })
          }, { quiet: true })
        }
        return
      }
      const m = await msgDelta()
      const why = isTyping() ? '（写完自动加载）' : ''
      showBanner(
        `▲ ${pending.length} 条新帖${m ? ` · ${m} 条新消息` : ''} — 点击加载${why}`,
        () => insertPending(),
      )
    }

    function insertPending(silent = false) {
      if (!pending.length || !ctx.ul) return 0
      const anchor = captureAnchor()
      hideBanner()
      const frag = document.createDocumentFragment()
      const batch = pending.splice(0, cfg.maxInsert)
      for (const it of batch) {
        frag.appendChild(document.importNode(it.el, true))
      }
      // 插入到置顶帖之后，保持置顶始终在最顶部
      const pos = pinnedCount()
      const ref = ctx.ul.children[pos]
      if (ref) ctx.ul.insertBefore(frag, ref)
      else ctx.ul.appendChild(frag)
      restoreAnchor(anchor)
      if (!silent) api.ui.toast(`已加载 ${batch.length} 条新帖`, { title: '实时流', type: 'success' })
      if (pending.length) showBanner(`▲ 还有 ${pending.length} 条新帖 — 继续加载`, () => insertPending())
      return batch.length
    }

    /* ── 轮询：帖子模式 ── */
    async function cycleTopic() {
      const gen = navGen
      const tid = ctx.tid
      if (!tid) return 0
      const fresh = new Map() // postId → post（跨页去重）
      const absorb = (t) => {
        for (const p of t.posts) {
          if (p.postId && p.postId > ctx.maxPostId && !fresh.has(p.postId)) {
            if (document.getElementById('post-' + p.postId)) ctx.maxPostId = Math.max(ctx.maxPostId, p.postId)
            else fresh.set(p.postId, p)
          }
        }
      }

      // 新回复总在最后一页
      let t = api.parse.topic(await api.net.doc(api.routes.topic(tid, Math.max(1, ctx.pages || 1))))
      if (gen !== navGen || ctx.tid !== tid) return 0
      absorb(t)
      // 回复把帖子顶到了新页：本轮立即追补，不必等下一个周期。
      // 否则每次翻页都会让新页的首批回复延迟一整个轮询间隔才出现。
      for (let i = 0; i < MAX_PAGE_CATCHUP && t.pages > ctx.pages; i++) {
        ctx.pages = t.pages
        t = api.parse.topic(await api.net.doc(api.routes.topic(tid, ctx.pages)))
        if (gen !== navGen || ctx.tid !== tid) return 0
        absorb(t)
      }
      if (t.pages > ctx.pages) ctx.pages = t.pages

      if (!fresh.size) return 0
      pending = [...fresh.values()].sort((a, b) => a.floor - b.floor)
      const n = pending.length
      announceNew('回复', n)
      if (cfg.autoInsert && !isTyping() && document.visibilityState !== 'hidden') {
        insertFloors(true)
        return n
      }
      const m = await msgDelta()
      const why = isTyping() ? '（写完自动加载）' : ''
      showBanner(
        `↓ ${n} 条新回复${m ? ` · ${m} 条新消息` : ''} — 点击加载${why}`,
        () => insertFloors(),
        { asTopic: true },
      )
      return n
    }

    function insertFloors(silent = false) {
      if (!pending.length || !ctx.ul) return 0
      const anchor = captureAnchor()
      let n = 0
      for (const p of pending) {
        if (p.postId && document.getElementById('post-' + p.postId)) {
          ctx.maxPostId = Math.max(ctx.maxPostId, p.postId)
          continue
        }
        ctx.ul.appendChild(document.importNode(p.el, true))
        if (p.postId) ctx.maxPostId = Math.max(ctx.maxPostId, p.postId)
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
      if (!pending.length) return false
      if (mode === 'topic') {
        if (!cfg.autoInsert || isTyping() || document.visibilityState === 'hidden') return false
        return insertFloors(true) > 0
      }
      if (!canFlushNow()) return false
      return insertPending(true) > 0
    }

    /* ── 巡检核心（在途 Promise 复用，并发不丢弃） ── */
    let inflight = null
    let lastErr = null
    let lastFresh = 0

    async function cycle() {
      if (!mode) init()
      if (!mode) return 0
      if (inflight) return inflight
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
          if (election.isLeader) scheduleNext()
        }
      })()
      return inflight
    }

    /* ── 跨标签：心跳选主（只有主标签发请求） ── */
    const JITTER = Number.isFinite(Number(cfg.jitterMs)) ? Math.max(0, Number(cfg.jitterMs)) : 800
    const election = api.election({
      onPromote: () => cycle(),
      onDemote: () => {
        if (timer) clearTimeout(timer)
        timer = null
        nextAt = null
        hideBanner()
      },
      jitter: JITTER,
    })
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
      for (const t of bumpTimers.splice(0)) clearTimeout(t)
      document.removeEventListener('focusout', onFocusOut)
      document.removeEventListener('visibilitychange', onVisible)
      teardown()
    })

    /* 消息基线尽早建立：此后每轮对比增量（哨兵缺席则静默，成功后不再重置） */
    msgDelta().catch(() => {})

    /* 软导航换页：立刻重建基线。旧实现延迟 80ms，换页窗口里巡检会写进已经卸掉的 ul。 */
    api.on('route:changed', () => {
      init()
      if (election.isLeader) cycle()
    })
    api.on('topic:posts-added', (posts) => {
      if (mode !== 'topic') return
      for (const p of posts) {
        if (p.postId) ctx.maxPostId = Math.max(ctx.maxPostId || 0, p.postId)
      }
      pending = pending.filter((p) => p.postId && p.postId > ctx.maxPostId && !document.getElementById('post-' + p.postId))
    })
    api.dom.each('li.post-entry', (li) => {
      if (mode !== 'topic') return
      const id = Number((li.id || '').match(/^post-(\d+)/)?.[1] || 0)
      if (id) ctx.maxPostId = Math.max(ctx.maxPostId || 0, id)
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
      load: () => (mode === 'topic' ? insertFloors() : insertPending()),
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

/* ══════════════ 套件中心（suite-core） ══════════════ */
;(function () {
  'use strict'
  const manifest = {
    id: 'suite',
    name: '重装套件',
    version: '1.0.45',
    description: '全家桶总览：各模块状态卡片、快捷开关、跨模块关键指标',
    author: 'you',
    requires: { base: '^0.1.0' },
    permissions: ['read', 'ui', 'events'],
  }

  const MEMBERS = ["floor-stats","hot-floor-badge","resume-reading","read-mark","hover-profile","topic-preview","unread-sentinel","forum-watch","checkin-calendar","points-ledger","ai-summary","data-migration","my-archive","annual-report","skin","live-feed"]

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
        ['📖 阅读记录', () => api.request('resume-reading:debug').then((d) => Object.keys(d.all()).length + ' 帖')],
        ['✅ 今日签到', () =>
          api.request('checkin-calendar:debug').then((d) => {
            const s = d.recs()[today()]?.s
            return s === 'ok' ? '已签 · 连击 ' + d.streak() : d.streak() + ' 天连击待续'
          })],
        ['📈 积分快照', () =>
          api.request('points-ledger:series', { days: 7 }).then((s) =>
            s.length ? '最新 ' + s[s.length - 1].p + ' 分 / ' + s.length + ' 点' : '暂无',
          )],
        ['🔔 消息箱', () => api.request('unread-sentinel:debug').then((d) => d.inbox().length + ' 条动态')],
        ['🎯 机会命中', () => api.request('forum-watch:debug').then((d) => d.hits().length + ' 条')],
      ]
      return Promise.all(
        jobs.map(async ([label, fn]) => {
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
