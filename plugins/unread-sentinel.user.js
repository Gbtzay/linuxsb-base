// ==UserScript==
// @name         LSB·未读哨兵
// @namespace    https://linux.sb/
// @version      1.0.2
// @description  后台低频巡检首页，发现新回复/新主题时标题栏角标 + 桌面通知 + 消息箱；多标签自动选主，只有一个标签真正发请求。需要 LINUX.SB 基座。
// @author       you
// @match        https://linux.sb/*
// @grant        none
// @run-at       document-end
// @noframes
// ==/UserScript==

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
