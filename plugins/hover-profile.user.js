// ==UserScript==
// @name         LSB·用户画像悬浮卡
// @namespace    https://linux.sb/
// @version      1.0.1
// @description  鼠标悬停任意用户链接，浮卡展示其等级/积分/最近主题（带缓存，不重复请求）。需要 LINUX.SB 基座。
// @author       you
// @match        https://linux.sb/*
// @grant        none
// @run-at       document-end
// @noframes
// ==/UserScript==

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
