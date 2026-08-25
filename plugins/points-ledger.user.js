// ==UserScript==
// @name         LSB·积分趋势
// @namespace    https://linux.sb/
// @version      1.0.2
// @description  定期快照你的积分余额，绘制趋势折线与每日增减；纯读实现，不解析易碎结构。需要 LINUX.SB 基座。
// @author       you
// @match        https://linux.sb/*
// @grant        none
// @run-at       document-end
// @noframes
// ==/UserScript==

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
