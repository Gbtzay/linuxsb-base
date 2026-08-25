// ==UserScript==
// @name         LSB·断点续读
// @namespace    https://linux.sb/
// @version      1.0.1
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
    version: '1.0.1',
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
    const flush = () => {
      if (!dirty) return
      dirty = false
      saveRec({ f: curFloor, p: pageOf(), title: api.snapshot?.topic?.title || '' })
    }
    const flushLater = api.util.throttle(flush, 1200)

    function lastVisibleFloor() {
      let max = 0
      for (const li of document.querySelectorAll('li.post-entry')) {
        const top = li.getBoundingClientRect?.().top ?? 0
        if (top <= window.innerHeight * 0.72) {
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
    }, 600)

    const onVisibility = () => {
      if (document.hidden) flush()
    }
    window.addEventListener('scroll', onScroll, { passive: true })
    window.addEventListener('pagehide', flush)
    document.addEventListener('visibilitychange', onVisibility)
    api.onDispose(() => {
      // 三个监听都要摘：旧实现只摘了 scroll，pagehide/visibilitychange 会在
      // 插件停用后继续写存储。
      window.removeEventListener('scroll', onScroll)
      window.removeEventListener('pagehide', flush)
      document.removeEventListener('visibilitychange', onVisibility)
      flush()
    })

    /* ── 未读标记 ── */
    const saved = load()
    const valid = saved && saved.f >= (cfg.minAsk || 3)

    api.ui.style(`
      ul.post-list li.post-entry{position:relative}
      li.post-entry.lsb-unread::after{content:'NEW';position:absolute;top:10px;right:10px;
        font-size:10px;font-weight:700;color:#fff;background:var(--brand,#5eaaa0);
        border-radius:4px;padding:1px 5px;opacity:.85}
      li.post-entry.lsb-flash{background:var(--warning-soft,#fff3d6)!important;transition:background 1.4s ease}
      .lsb-resume-bar{position:fixed;left:50%;transform:translateX(-50%);bottom:64px;z-index:99997;
        display:flex;align-items:center;gap:10px;padding:8px 14px;border-radius:999px;
        background:var(--panel,#fff);border:1px solid var(--line,#ddd);color:var(--text,#222);
        font-size:13px;box-shadow:0 6px 20px var(--shadow-medium,rgba(0,0,0,.2))}
      .lsb-resume-bar .lsb-btn{white-space:nowrap}
    `)

    function markUnread(fromFloor) {
      let n = 0
      for (const li of document.querySelectorAll(api.sel.topicPosts)) {
        const f = Number(li.getAttribute('data-floor') || 0)
        const unread = f > fromFloor
        li.classList.toggle('lsb-unread', unread)
        if (unread) n++
      }
      return n
    }
    // 之后 AJAX 新增的楼层也按已读线标记
    api.dom.each('li.post-entry', (li) => {
      if (!valid) return
      const f = Number(li.getAttribute('data-floor') || 0)
      li.classList.toggle('lsb-unread', f > saved.f)
    })
    let unreadCount = valid ? markUnread(saved.f) : 0

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
