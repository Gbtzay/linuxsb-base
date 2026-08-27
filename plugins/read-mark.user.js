// ==UserScript==
// @name         LSB·已读置灰
// @namespace    https://linux.sb/
// @version      1.0.4
// @description  列表里看过的帖子整行变灰。未读标记沿用站点原样，不再另挂角标。需要 LINUX.SB 基座。
// @author       you
// @match        https://linux.sb/*
// @grant        none
// @run-at       document-end
// @noframes
// ==/UserScript==

(function () {
  'use strict'

  const manifest = {
    id: 'read-mark',
    name: '已读置灰',
    version: '1.0.4',
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
      for (const li of document.querySelectorAll(api.sel?.listItems || 'ul.post-list > li.post-item:not(.post-entry)')) {
        paint(li)
      }
    }

    // 现有 + 无限滚动新增的条目各回调一次（幂等）
    api.dom.each(api.sel?.listItems || 'ul.post-list > li.post-item:not(.post-entry)', paint)
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
