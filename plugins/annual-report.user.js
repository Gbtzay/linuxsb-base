// ==UserScript==
// @name         LSB·年度报告
// @namespace    https://linux.sb/
// @version      1.0.1
// @description  聚合积分趋势/签到日历/阅读记录/消息箱等本地数据，生成近一年图文报告，可导出 Markdown。各数据模块缺失时自动降级。需要 LINUX.SB 基座。
// @author       you
// @match        https://linux.sb/*
// @grant        none
// @run-at       document-end
// @noframes
// ==/UserScript==

(function () {
  'use strict'

  const manifest = {
    id: 'annual-report',
    name: '年度报告',
    version: '1.0.1',
    description: '聚合全部本地数据出一份「我的 linux.sb 这一年」',
    author: 'you',
    requires: { base: '^0.1.0' },
    permissions: ['read', 'storage', 'ui', 'events'],
  }

  const DAYS = 365

  function setup(api) {
    let lastMd = null

    async function collect() {
      const since = Date.now() - DAYS * 864e5
      const safe = async (label, fn) => {
        try {
          return { label, value: await fn() }
        } catch {
          return { label, value: null } // 模块未安装 / 被停用
        }
      }

      const [points, checkin, reading, inbox, hits, archive] = await Promise.all([
        safe('积分趋势', () => api.request('points-ledger:series', { days: DAYS })),
        safe('签到日历', () => api.request('checkin-calendar:debug')),
        safe('断点续读', () => api.request('resume-reading:debug')),
        safe('未读哨兵', () => api.request('unread-sentinel:debug')),
        safe('机会监控', () => api.request('forum-watch:debug')),
        safe('个人存档', () => api.request('my-archive:summary')),
      ])

      /* 积分 */
      let pointsStats = null
      if (points.value && points.value.length >= 2) {
        const s = points.value
        const first = s[0]
        const lastP = s[s.length - 1]
        const peak = s.reduce((m, x) => (x.p > m.p ? x : m), s[0])
        pointsStats = {
          start: first.p,
          end: lastP.p,
          delta: lastP.p - first.p,
          peak: peak.p,
          snapshots: s.length,
          spark: s.map((x) => x.p),
        }
      }

      /* 签到 */
      let checkinStats = null
      if (checkin.value) {
        const recs = checkin.value.recs()
        const okDays = Object.keys(recs).filter((k) => recs[k].s === 'ok')
        const inWindow = okDays.filter((k) => new Date(k + 'T12:00:00').getTime() >= since)
        checkinStats = { totalOk: okDays.length, windowOk: inWindow.length, streak: checkin.value.streak() }
      }

      /* 阅读 */
      let readingStats = null
      if (reading.value) {
        const all = reading.value.all()
        const list = Object.entries(all)
          .map(([id, r]) => ({ id: Number(id), title: r.title, f: r.f, ts: r.ts }))
          .sort((a, b) => b.ts - a.ts)
        readingStats = { count: list.length, recent: list.slice(0, 3) }
      }

      return {
        since,
        sections: [
          { key: 'points', label: '📈 积分轨迹', ok: !!pointsStats, stats: pointsStats, raw: null },
          {
            key: 'checkin',
            label: '✅ 签到',
            ok: !!checkinStats,
            stats: checkinStats,
            raw: null,
          },
          { key: 'reading', label: '📖 阅读足迹', ok: !!readingStats, stats: readingStats, raw: null },
          {
            key: 'inbox',
            label: '🔔 消息箱动态',
            ok: !!inbox.value,
            stats: inbox.value ? { count: inbox.value.inbox().length } : null,
            raw: null,
          },
          {
            key: 'hits',
            label: '🎯 机会命中',
            ok: !!hits.value,
            stats: hits.value ? { count: hits.value.hits().length } : null,
            raw: null,
          },
          {
            key: 'archive',
            label: '🗄 个人存档',
            ok: !!archive.value,
            stats: archive.value,
            raw: null,
          },
        ],
      }
    }

    /* ── 渲染 ── */
    function verdict(points, checkin) {
      const out = []
      if (points && points.delta !== 0) {
        out.push(points.delta > 0 ? `这一年净赚 ${points.delta} 分，攒饼能力在线。` : `这一年净亏 ${Math.abs(points.delta)} 分，消费需节制。`)
      }
      if (checkin && checkin.streak >= 7) out.push(`连续签到 ${checkin.streak} 天，毅力可嘉。`)
      return out
    }

    function renderHtml(data) {
      const sec = data.sections
      const row = (label, val, muted) =>
        `<div class="lsb-row"><span>${label}</span><strong style="margin-left:auto;${muted ? 'color:var(--text-muted,#888);font-weight:400' : ''}">${val}</strong></div>`
      let html = ''

      // 积分
      const p = sec.find((s) => s.key === 'points')
      html += `<h3 style="margin:10px 0 4px">📈 积分轨迹</h3>`
      if (p.ok) {
        const st = p.stats
        html +=
          row('区间变化', `${st.start} → ${st.end}`) +
          row('净增减', `${st.delta > 0 ? '+' : ''}${st.delta}`, false) +
          row('期间峰值', String(st.peak)) +
          row('快照次数', String(st.snapshots))
        // sparkline
        if (st.spark.length > 1) {
          const min = Math.min(...st.spark)
          const max = Math.max(...st.spark)
          const span = max - min || 1
          const pts = st.spark.map((v, i) => `${(i / (st.spark.length - 1)) * 300},${30 - ((v - min) / span) * 26}`).join(' ')
          html += `<svg width="300" height="34" style="margin-top:4px"><polyline points="${pts}" fill="none" stroke="var(--brand,#5eaaa0)" stroke-width="2"/></svg>`
        }
      } else {
        html += `<div class="lsb-empty">安装「积分趋势」并产生快照后解锁。</div>`
      }

      // 签到
      const c = sec.find((s) => s.key === 'checkin')
      html += `<h3 style="margin:14px 0 4px">✅ 签到</h3>`
      html += c.ok
        ? row('累计签到', `${c.stats.totalOk} 天`) + row('近一年', `${c.stats.windowOk} 天`) + row('当前连击', `${c.stats.streak} 天`)
        : `<div class="lsb-empty">安装「签到日历」后解锁。</div>`

      // 阅读
      const r = sec.find((s) => s.key === 'reading')
      html += `<h3 style="margin:14px 0 4px">📖 阅读足迹</h3>`
      html += r.ok
        ? row('追踪帖子', `${r.stats.count} 帖`) +
          (r.stats.recent.length
            ? `<div class="lsb-row-desc" style="margin-top:4px">最近在读：${r.stats.recent.map((x) => api.util.esc(x.title || '#' + x.id)).join('、')}</div>`
            : '')
        : `<div class="lsb-empty">安装「断点续读」后解锁。</div>`

      // 其余计数行
      for (const key of ['inbox', 'hits']) {
        const s = sec.find((x) => x.key === key)
        html += `<h3 style="margin:14px 0 4px">${s.label}</h3>`
        html += s.ok ? row('数值', String(s.stats.count ?? (s.stats.online ? '在线' : '离线'))) : `<div class="lsb-empty">对应模块未安装或无数据。</div>`
      }

      // 存档
      const a = sec.find((x) => x.key === 'archive')
      html += `<h3 style="margin:14px 0 4px">🗄 个人存档</h3>`
      html += a.ok
        ? row('主题 / 回帖', `${a.stats.topicCount} / ${a.stats.replyCount}`)
        : `<div class="lsb-empty">安装「个人存档」后解锁。</div>`

      // 判词
      const v = verdict(p.ok ? p.stats : null, c.ok ? c.stats : null)
      if (v.length) {
        html += `<div class="lsb-row" style="border:0;margin-top:10px"><em>${v.map(api.util.esc).join(' ')}</em></div>`
      }
      return html
    }

    function buildMd(data) {
      const L = [`# 我的 linux.sb 这一年`, '', `- 统计窗口：近 ${DAYS} 天`, `- 生成时间：${new Date().toLocaleString('zh-CN')}`, '']
      const s = Object.fromEntries(data.sections.map((x) => [x.key, x]))
      L.push(`## 📈 积分轨迹`)
      if (s.points.ok) {
        L.push(`- ${s.points.stats.start} → ${s.points.stats.end}（净增减 **${s.points.stats.delta > 0 ? '+' : ''}${s.points.stats.delta}**）`)
        L.push(`- 期间峰值 ${s.points.stats.peak} · 快照 ${s.points.stats.snapshots} 次`)
      } else L.push('- （无数据）')
      L.push('', `## ✅ 签到`)
      L.push(s.checkin.ok ? `- 累计 ${s.checkin.stats.totalOk} 天 · 近一年 ${s.checkin.stats.windowOk} 天 · 连击 ${s.checkin.stats.streak} 天` : '- （无数据）')
      L.push('', `## 📖 阅读足迹`)
      if (s.reading.ok) {
        L.push(`- 追踪 ${s.reading.stats.count} 帖`)
        for (const x of s.reading.stats.recent) L.push(`  - [${x.title || '#' + x.id}](${api.routes.topic(x.id)})`)
      } else L.push('- （无数据）')
      for (const [key, label] of [['inbox', '消息箱'], ['hits', '机会命中']]) {
        const x = s[key]
        L.push('', `## ${label}`)
        L.push(x.ok ? '- 有记录' : '- （无数据）')
      }
      L.push('', `## 🗄 个人存档`)
      L.push(s.archive.ok ? `- 主题 ${s.archive.stats.topicCount} · 回帖 ${s.archive.stats.replyCount}` : '- （无数据）')
      return L.join('\n')
    }

    /* ── 面板 ── */
    api.ui.tab({
      name: '年度报告',
      order: 70,
      render(host) {
        host.innerHTML = '<div class="lsb-empty">汇总中…</div>'
        collect().then((data) => {
          host.innerHTML =
            `<div class="lsb-cal-head"><strong>我的 linux.sb 这一年</strong>` +
            `<span class="lsb-row-desc">窗口：近 ${DAYS} 天</span></div>` +
            renderHtml(data)
          const bar = document.createElement('div')
          bar.className = 'lsb-actions'
          bar.style.border = '0'
          const md = document.createElement('button')
          md.className = 'lsb-btn is-primary'
          md.textContent = '⬇ 导出 Markdown'
          md.onclick = () => {
            lastMd = buildMd(data)
            try {
              const blob = new Blob([lastMd], { type: 'text/markdown' })
              const a = document.createElement('a')
              a.href = URL.createObjectURL(blob)
              a.download = `linuxsb-year-report-${today()}.md`
              a.click()
              setTimeout(() => URL.revokeObjectURL(a.href), 4000)
            } catch {
              api.ui.toast('下载失败，可用调试接口取文本', { type: 'error' })
            }
          }
          bar.appendChild(md)
          host.appendChild(bar)
        })
      },
    })

    function today() {
      const x = new Date()
      const p = (n) => String(n).padStart(2, '0')
      return x.getFullYear() + p(x.getMonth() + 1) + p(x.getDate())
    }

    /* ── 调试 ── */
    api.handle('annual-report:debug', () => ({
      collect,
      buildMd: async () => {
        lastMd = buildMd(await collect())
        return lastMd
      },
      lastMd: () => lastMd,
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
