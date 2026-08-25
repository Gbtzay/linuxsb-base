// ==UserScript==
// @name         LSB·机会监控
// @namespace    https://linux.sb/
// @version      1.0.1
// @description  监听指定版块的新主题，标题命中关键词立即提醒（如「求助问答」里出现 k8s/tauri）。跨标签自动选主，只有一个标签在巡检。需要 LINUX.SB 基座。
// @author       you
// @match        https://linux.sb/*
// @grant        none
// @run-at       document-end
// @noframes
// ==/UserScript==

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
