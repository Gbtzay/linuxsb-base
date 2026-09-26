// ==UserScript==
// @name         LSB·红包发卡
// @namespace    https://linux.sb/
// @version      1.0.0
// @description  列表左侧色条标出还活着的红包 / 发卡。需要 LINUX.SB 基座。
// @author       you
// @match        https://linux.sb/*
// @grant        none
// @run-at       document-end
// @noframes
// ==/UserScript==

(function () {
  'use strict'

  const manifest = {
    id: 'topic-marks',
    name: '红包发卡',
    version: '1.0.0',
    description: '列表左侧色条标出还活着的红包 / 发卡',
    author: 'you',
    requires: { base: '^0.1.0' },
    permissions: ['read', 'ui', 'events'],
  }

  function setup(api) {
    const STYLE_ID = 'lsb-topic-marks-style'
    const RED = 'lsb-topic-mark-red'
    const CARD = 'lsb-topic-mark-card'
    const listSel =
      api.sel?.listItems || 'ul.post-list > li.post-item:not(.post-entry):not(.topic-collections-collection-row)'

    const el = document.createElement('style')
    el.id = STYLE_ID
    el.textContent =
      `li.post-item.${RED}{box-shadow:inset 3px 0 0 #e11d48}` +
      `li.post-item.${CARD}{box-shadow:inset 3px 0 0 #d97706}` +
      `li.post-item.${RED}.${CARD}{box-shadow:inset 3px 0 0 #e11d48,inset 6px 0 0 #d97706}`
    document.head.appendChild(el)

    function paint(li) {
      const it = api.parse.listItem(li)
      li.classList.toggle(RED, it?.marks?.redPacket === 'live')
      li.classList.toggle(CARD, it?.marks?.virtualCard === 'live')
    }

    function paintAll() {
      for (const li of document.querySelectorAll(listSel)) paint(li)
    }

    api.dom.each(listSel, paint)
    api.on('route:changed', () => {
      setTimeout(paintAll, 50)
    })
    api.onDispose(() => {
      document.getElementById(STYLE_ID)?.remove()
      for (const li of document.querySelectorAll(`li.post-item.${RED}, li.post-item.${CARD}`)) {
        li.classList.remove(RED, CARD)
      }
    })

    api.ui.configTab({
      name: '红包发卡',
      order: 41,
      render(host) {
        const p = document.createElement('div')
        p.className = 'lsb-row-desc'
        p.textContent =
          '列表左侧色条标出还活着的红包（红）和发卡（琥珀）。结束态不画。盯红包 / 盯发卡在机会监控里，默认关。'
        host.appendChild(p)
      },
    })

    api.handle('topic-marks:debug', () => ({
      painted: () => document.querySelectorAll(`li.post-item.${RED}, li.post-item.${CARD}`).length,
      liveRed: () => document.querySelectorAll(`li.post-item.${RED}`).length,
      liveCard: () => document.querySelectorAll(`li.post-item.${CARD}`).length,
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
