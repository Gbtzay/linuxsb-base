// ==UserScript==
// @name         LSB·性能探针
// @namespace    https://linux.sb/
// @version      1.0.0
// @description  本机记录氢壳软跳、实时流巡检、时间轴慢帧的耗时。默认关闭。需要 LINUX.SB 基座。
// @author       you
// @match        https://linux.sb/*
// @grant        none
// @run-at       document-end
// @noframes
// ==/UserScript==

(function () {
  'use strict'

  const manifest = {
    id: 'perf-probe',
    name: '性能探针',
    version: '1.0.0',
    description: '本机记录软跳 / 巡检 / 时间轴慢帧耗时，默认关闭',
    author: 'you',
    requires: { base: '^0.1.0' },
    permissions: ['ui', 'storage', 'events'],
    config: {
      enabled: { type: 'switch', label: '记录卡顿', default: false },
    },
  }

  function setup(api) {
    const buf = []
    let timelineSec = -1
    let timelineN = 0
    let offRecord = () => {}
    let offSpan = () => {}

    function acceptSpan(span) {
      if (!span || typeof span.ms !== 'number' || !span.name) return false
      if (span.name !== 'timeline.update') return true
      if (span.ms < 8) return false
      const sec = Math.floor(Number(span.t || Date.now()) / 1000)
      if (sec !== timelineSec) {
        timelineSec = sec
        timelineN = 0
      }
      if (timelineN >= 2) return false
      timelineN += 1
      return true
    }

    function unbindRecording() {
      offRecord()
      offRecord = () => {}
      offSpan()
      offSpan = () => {}
    }

    function bindRecording() {
      unbindRecording()
      if (!api.config().enabled) return
      offRecord = api.handle('perf-probe:record', () => {})
      offSpan = api.on('perf:span', (span) => {
        if (!acceptSpan(span)) return
        buf.push({
          name: span.name,
          plugin: span.plugin,
          ms: span.ms,
          href: span.href,
          t: span.t,
        })
        if (buf.length > 200) buf.shift()
      })
    }

    function dump() {
      return buf.map((x) => ({ ...x }))
    }

    bindRecording()
    api.on('config:changed:perf-probe', () => {
      bindRecording()
    })
    api.onDispose(() => unbindRecording())

    api.ui.configTab({
      name: '性能探针',
      order: 90,
      render(host) {
        const on = !!api.config().enabled
        const rows = dump().slice().reverse()
        const slow = rows.reduce((a, b) => (!a || b.ms > a.ms ? b : a), null)
        const summary = document.createElement('div')
        summary.className = 'lsb-row-desc'
        summary.style.margin = '10px 0'
        if (!on) summary.textContent = '未开记录'
        else if (!rows.length) summary.textContent = '暂无'
        else summary.textContent = `最慢 ${slow.name} ${slow.ms}ms · 共 ${rows.length} 条`
        host.appendChild(summary)

        const table = document.createElement('div')
        table.className = 'lsb-row-desc'
        table.style.maxHeight = '240px'
        table.style.overflow = 'auto'
        for (const row of rows) {
          const line = document.createElement('div')
          line.className = 'lsb-row'
          line.textContent = `${Math.round(row.ms)}ms  ${row.name}  ${row.plugin || ''}  ${row.href || ''}`
          table.appendChild(line)
        }
        host.appendChild(table)

        const copy = document.createElement('button')
        copy.className = 'lsb-btn'
        copy.style.marginTop = '8px'
        copy.textContent = '复制 JSON'
        copy.onclick = async () => {
          const text = JSON.stringify(dump(), null, 2)
          try {
            if (navigator.clipboard?.writeText) await navigator.clipboard.writeText(text)
            else {
              const ta = document.createElement('textarea')
              ta.value = text
              document.body.append(ta)
              ta.select()
              document.execCommand('copy')
              ta.remove()
            }
            api.ui.toast('已复制', { type: 'success' })
          } catch (e) {
            api.ui.toast('复制失败：' + ((e && e.message) || e), { type: 'error' })
          }
        }
        host.appendChild(copy)

        const clearBtn = document.createElement('button')
        clearBtn.className = 'lsb-btn'
        clearBtn.style.marginLeft = '8px'
        clearBtn.textContent = '清空'
        clearBtn.onclick = () => {
          buf.length = 0
          api.ui.showTab('perf-probe')
        }
        host.appendChild(clearBtn)
      },
    })

    api.handle('perf-probe:debug', () => ({
      dump,
      clear: () => {
        buf.length = 0
      },
      recording: () => api.hasHandler('perf-probe:record'),
      slowest: () => buf.reduce((a, b) => (!a || b.ms > a.ms ? b : a), null),
    }))

    return {}
  }

  const w = typeof unsafeWindow !== 'undefined' ? unsafeWindow : window
  if (w.LSB && w.LSB.register) w.LSB.register(manifest, setup)
  else (w.LSB_PLUGINS = w.LSB_PLUGINS || []).push({ manifest, setup })
})()
