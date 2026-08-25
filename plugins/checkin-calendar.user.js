// ==UserScript==
// @name         LSB·签到日历
// @namespace    https://linux.sb/
// @version      1.0.3
// @description  本地签到日历：自动探测每日签到状态、连击统计、月视图；支持一键签今天（原生无法补签，历史仅从安装日起记录）。需要 LINUX.SB 基座。
// @author       you
// @match        https://linux.sb/*
// @grant        none
// @run-at       document-end
// @noframes
// ==/UserScript==

/**
 * 说明：
 *  - 每天首次浏览时访问 /daily_checkin 探测状态（已签/未签），写入本地日历；
 *  - 「立即签到」会解析该页的签到表单并代表你提交（提交前有确认弹窗）；
 *  - 原生不支持补签，本插件同样只记录、不伪造历史。
 */
(function () {
  'use strict'

  const manifest = {
    id: 'checkin-calendar',
    name: '签到日历',
    version: '1.0.3',
    description: '签到状态日历 + 连击统计 + 一键签今天',
    author: 'you',
    requires: { base: '^0.1.0' },
    // write：一键签到是代表用户提交表单的写操作（POST /daily_checkin）。
    // 基座已把「站内非幂等请求」纳入 write 权限门，此处如实声明。
    permissions: ['read', 'storage', 'ui', 'events', 'write'],
    config: {
      remind: { type: 'switch', label: '未签到时提醒', default: true },
      harvest: { type: 'switch', label: '从签到页收割历史日期', default: true },
      autoProbe: { type: 'switch', label: '每天首次浏览自动探测', default: true },
    },
  }

  function setup(api) {
    let cfg = api.config()
    api.on('config:changed:checkin-calendar', () => {
      cfg = api.config()
    })

    function dkey(d) {
      const x = d || new Date()
      const p = (n) => String(n).padStart(2, '0')
      return x.getFullYear() + '-' + p(x.getMonth() + 1) + '-' + p(x.getDate())
    }
    const today = () => dkey(new Date())

    const recsGet = () => api.store.get('recs', {}) || {}
    function setDay(key, s) {
      const r = recsGet()
      r[key] = { s, t: Date.now() }
      api.store.set('recs', r)
    }

    /* ── 状态探测 ── */
    let status = null // ok | open | unknown
    let formInfo = null // {action, fields:[{name,value}]}

    function detect(doc) {
      const txt = doc.body ? doc.body.textContent : ''
      if (/已签到|今日已签|明日再来/.test(txt)) return 'ok'
      const f = [...doc.querySelectorAll('form')].find((f) =>
        /checkin/i.test(f.getAttribute('action') || ''),
      )
      if (f) {
        formInfo = {
          action: f.getAttribute('action') || '/daily_checkin',
          fields: [...f.querySelectorAll('input[name]')].map((i) => ({
            name: i.getAttribute('name'),
            value: i.value,
          })),
        }
        return 'open'
      }
      return 'unknown'
    }

    /** 从页面文本里收割历史签到日期（通用正则，不依赖具体 DOM） */
    function harvestHistory(doc) {
      const txt = doc.body ? doc.body.textContent : ''
      const found = []
      const seen = new Set()
      for (const m of txt.matchAll(/(20\d{2})-(\d{2})-(\d{2})/g)) {
        const key = m[1] + '-' + m[2] + '-' + m[3]
        const t = new Date(key + 'T12:00:00').getTime()
        if (Number.isNaN(t) || t > Date.now()) continue
        if (Date.now() - t > 366 * 864e5) continue
        if (key === today() || seen.has(key)) continue
        seen.add(key)
        found.push(key)
      }
      return found
    }
    async function probe(force = false) {
      if (!force && status) return status
      const doc = await api.net.doc('/daily_checkin')
      status = detect(doc)
      setDay(today(), status)
      if (cfg.harvest !== false && cfg.harvest) {
        for (const k of harvestHistory(doc)) setDay(k, 'ok')
      }
      if (status === 'open' && cfg.remind) {
        api.ui.toast('今天还没签到', { title: '签到日历' })
      }
      return status
    }

    // 每天首次浏览自动探测一次
    if (cfg.autoProbe && api.store.get('probedDay', '') !== today()) {
      probe()
        .then(() => api.store.set('probedDay', today()))
        .catch(() => {})
    }

    /* ── 一键签今天 ── */
    async function doCheckin(skipConfirm = false) {
      if (!skipConfirm && !(await api.ui.confirm('提交今天的签到？'))) return false
      if (!formInfo) await probe(true)
      if (status === 'ok' || /已签到|今日已签/.test(document.body?.textContent || '')) {
        setDay(today(), 'ok')
        api.ui.toast('今天已经签过啦', { title: '签到日历' })
        return { done: false, reason: 'already-signed' }
      }
      if (!formInfo) throw new Error('未找到签到表单（页面结构可能变化）')
      const fd = new FormData()
      for (const f of formInfo.fields) fd.append(f.name, f.value)
      const res = await api.net.raw(formInfo.action, {
        method: 'POST',
        body: fd,
        headers: { 'x-requested-with': 'XMLHttpRequest' },
      })
      if (!res.ok) {
        api.ui.toast('签到失败 HTTP ' + res.status, { type: 'error' })
        return { done: false, reason: 'http-' + res.status }
      }
      status = 'ok'
      setDay(today(), 'ok')
      api.ui.toast('签到完成', { type: 'success' })
      return true
    }

    /* ── 连击统计 ── */
    function streak() {
      const r = recsGet()
      let n = 0
      const d = new Date()
      if (r[dkey(d)]?.s !== 'ok') d.setDate(d.getDate() - 1) // 今天还没签则从昨天起算
      while (r[dkey(d)]?.s === 'ok') {
        n++
        d.setDate(d.getDate() - 1)
      }
      return n
    }
    function monthCount(offset = 0) {
      const now = new Date()
      const m = new Date(now.getFullYear(), now.getMonth() + offset, 1)
      const pre = dkey(m).slice(0, 7)
      const r = recsGet()
      return Object.keys(r).filter((k) => k.startsWith(pre) && r[k].s === 'ok').length
    }

    /* ── 面板：月历 ── */
    let viewOffset = 0
    api.ui.tab({
      name: '签到日历',
      order: 64,
      render(host) {
        const base = new Date()
        const view = new Date(base.getFullYear(), base.getMonth() + viewOffset, 1)
        const ym = dkey(view).slice(0, 7)
        const firstDow = new Date(view.getFullYear(), view.getMonth(), 1).getDay()
        const daysIn = new Date(view.getFullYear(), view.getMonth() + 1, 0).getDate()
        const r = recsGet()

        let cells = ''
        for (let i = 0; i < firstDow; i++) cells += '<span class="lsb-cal-cell is-empty"></span>'
        for (let d = 1; d <= daysIn; d++) {
          const key = ym + '-' + String(d).padStart(2, '0')
          const st = r[key]?.s
          const cls = st === 'ok' ? ' is-ok' : st === 'open' ? ' is-miss' : ' is-none'
          cells += `<span class="lsb-cal-cell${cls}" title="${key}">${d}</span>`
        }

        host.innerHTML = `
          <div class="lsb-cal-head">
            <button class="lsb-btn" data-prev>‹</button>
            <strong>${ym}</strong>
            <button class="lsb-btn" data-next>›</button>
            <span class="lsb-row-desc" style="margin-left:auto">
              本月 ${monthCount(viewOffset)} 天 · 连击 ${streak()} 天 · 今日：${
                r[today()]?.s === 'ok' ? '已签' : r[today()]?.s === 'open' ? '未签' : '未知'
              }</span>
          </div>
          <div class="lsb-cal-grid">
            ${['日', '一', '二', '三', '四', '五', '六'].map((x) => `<span class="lsb-cal-dow">${x}</span>`).join('')}
            ${cells}
          </div>
          <div class="lsb-actions" style="border:0;padding:10px 0 0">
            <button class="lsb-btn" data-probe>重新探测</button>
            <button class="lsb-btn is-primary" data-go>${
              r[today()]?.s === 'ok' ? '今日已签' : '立即签到'
            }</button>
          </div>`

        host.querySelector('[data-prev]').onclick = () => {
          viewOffset--
          host.innerHTML = ''
          thisRender()
        }
        host.querySelector('[data-next]').onclick = () => {
          viewOffset++
          host.innerHTML = ''
          thisRender()
        }
        host.querySelector('[data-probe]').onclick = () =>
          probe(true).then(() => {
            host.innerHTML = ''
            thisRender()
          })
        const go = host.querySelector('[data-go]')
        go.disabled = r[today()]?.s === 'ok'
        go.onclick = () =>
          doCheckin().then(() => {
            host.innerHTML = ''
            thisRender()
          }).catch((e) => api.ui.toast(e.message, { type: 'error' }))
      },
    })
    function thisRender() {
      api.ui.showTab('checkin-calendar')
    }

    api.ui.style(`
      .lsb-cal-head{display:flex;align-items:center;gap:8px;margin-bottom:8px}
      .lsb-cal-grid{display:grid;grid-template-columns:repeat(7,34px);gap:4px}
      .lsb-cal-dow{font-size:11px;color:var(--text-muted,#888);text-align:center}
      .lsb-cal-cell{height:30px;display:flex;align-items:center;justify-content:center;
        border-radius:6px;font-size:12px;background:var(--bg,#f5f5f5);color:var(--text,#222)}
      .lsb-cal-cell.is-empty{background:transparent}
      .lsb-cal-cell.is-ok{background:var(--brand,#5eaaa0);color:#fff;font-weight:600}
      .lsb-cal-cell.is-miss{background:var(--warning-soft,#fff3d6);color:var(--warning,#b8860b)}
      .lsb-cal-cell.is-none{opacity:.45}
    `)

    /* ── 调试接口 ── */
    api.handle('checkin-calendar:debug', () => ({
      probe,
      doCheckin: () => doCheckin(true),
      status: () => status,
      setDay,
      recs: recsGet,
      streak,
      form: () => formInfo,
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
