// ==UserScript==
// @name         LSB·个人存档
// @namespace    https://linux.sb/
// @version      1.0.0
// @description  抓取自己的全部主题与回复，本地累积存档，导出 JSON / Markdown。站点内容会丢，数据主权自己握。需要 LINUX.SB 基座。
// @author       you
// @match        https://linux.sb/*
// @grant        none
// @run-at       document-end
// @noframes
// ==/UserScript==

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
