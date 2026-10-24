// ==UserScript==
// @name         LSB·已读置灰
// @namespace    https://linux.sb/
// @version      1.0.5
// @description  列表里看过的帖子整行变灰。已读到当前评论数时清理站点未读提示。需要 LINUX.SB 基座。
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
