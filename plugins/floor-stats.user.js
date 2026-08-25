// ==UserScript==
// @name         LSB·楼层统计（示例插件：服务提供方）
// @namespace    https://linux.sb/
// @version      1.0.1
// @description  统计当前帖各作者楼层数；提供 RPC「floorstats:summary」给其它脚本，支持只看TA。需要先安装 LINUX.SB 基座。
// @author       linuxsb-base
// @match        https://linux.sb/*
// @grant        none
// @run-at       document-end
// @noframes
// ==/UserScript==

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
