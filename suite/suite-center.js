/* ══════════════ 套件中心（suite-core） ══════════════ */
;(function () {
  'use strict'
  const manifest = {
    id: 'suite',
    name: '重装套件',
    version: '1.0.96',
    description: '全家桶总览：各模块状态卡片、快捷开关、跨模块关键指标',
    author: 'you',
    requires: { base: '^0.1.0' },
    permissions: ['read', 'ui', 'events'],
  }

  const MEMBERS = __SUITE_MEMBERS__

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
