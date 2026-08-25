// ==UserScript==
// @name         LSB·高频发言标记（示例插件：服务消费方）
// @namespace    https://linux.sb/
// @version      1.0.1
// @description  依赖「楼层统计」插件，给刷屏作者加标记。演示插件间依赖与 RPC 调用。需要先安装 LINUX.SB 基座。
// @author       linuxsb-base
// @match        https://linux.sb/*
// @grant        none
// @run-at       document-end
// @noframes
// ==/UserScript==

/**
 * 示例要点：
 *  1. requires.plugins 声明依赖 —— 基座会等「floor-stats」激活后再激活本插件，
 *     且版本不满足（^1.0.0）时拒绝运行并面板提示
 *  2. api.request('floorstats:summary') 跨脚本 RPC
 *  3. api.plugin('floor-stats') 直接读取对方的 exports（countOf）
 */
(function () {
  'use strict'

  const manifest = {
    id: 'hot-floor-badge',
    name: '高频发言标记',
    version: '1.0.1',
    description: '给楼层数达到阈值的作者在每层加 🔥 标记',
    author: 'you',
    requires: { base: '^0.1.0', plugins: { 'floor-stats': '^1.0.0' } },
    permissions: ['read', 'storage', 'ui', 'events'],
    pages: ['topic'],
    config: {
      threshold: { type: 'number', label: '多少楼以上算高频', default: 5 },
    },
  }

  function setup(api) {
    const hot = new Set()

    async function refresh() {
      const threshold = api.config().threshold || 5
      // 跨脚本 RPC：由 floor-stats 提供
      const summary = await api.request('floorstats:summary')
      hot.clear()
      for (const a of summary.authors) {
        if (a.n >= threshold) hot.add(a.uid)
      }
      apply()
      api.log(`高频作者 ${hot.size} 人（阈值 ${threshold}）`)
    }

    function isHot(li) {
      const a = li.querySelector('a[href^="/user/"]')
      if (!a) return false
      const uid = Number((a.getAttribute('href').match(/\/user\/(\d+)/) || [])[1])
      return hot.has(uid)
    }

    function apply() {
      api.dom.posts().forEach((li) => {
        let badge = li.querySelector('.lsb-hot-badge')
        if (isHot(li)) {
          if (!badge) {
            badge = document.createElement('span')
            badge.className = 'lsb-badge lsb-hot-badge'
            badge.title = `该作者在本帖发言 ≥ 阈值（共 ${api.plugin('floor-stats').countOf(
              Number((li.querySelector('a[href^="/user/"]')?.getAttribute('href') || '').match(/\/user\/(\d+)/)?.[1] || 0),
            )} 楼）`
            badge.textContent = '🔥 高频'
            const nameEl = li.querySelector('.post-user-group')
            ;(nameEl && nameEl.parentElement ? nameEl.parentElement : li).appendChild(badge)
          }
        } else if (badge) {
          badge.remove()
        }
      })
    }

    api.ui.style('.lsb-hot-badge{background:var(--warning-soft,#3a2a14)!important;color:var(--warning,#d4a05a)!important}')

    // site:ready 是 sticky 事件；这里其实已就绪，直接刷新一次即可
    refresh()
    // 新楼层到达也重算（floor-stats 的计数是增量的，这里只需重贴标记）
    api.on('topic:posts-added', () => refresh())

    /* ── 设置页（由 manifest.config 自动生成） ── */
    api.ui.configTab({ name: "高频标记", order: 54 })

    return {}
  }

  /* ── 标准引导 ── */
  const w = typeof unsafeWindow !== 'undefined' ? unsafeWindow : window
  if (w.LSB && w.LSB.register) {
    w.LSB.register(manifest, setup)
  } else {
    ;(w.LSB_PLUGINS = w.LSB_PLUGINS || []).push({ manifest, setup })
  }
})()
