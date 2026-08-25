// ==UserScript==
// @name         LSB·配置迁移
// @namespace    https://linux.sb/
// @version      1.0.0
// @description  一键导出/导入全部模块数据与配置（JSON 文件或剪贴板）——换机、重装浏览器、清缓存零损失。需要 LINUX.SB 基座 ≥0.1.1。
// @author       you
// @match        https://linux.sb/*
// @grant        none
// @run-at       document-end
// @noframes
// ==/UserScript==

(function () {
  'use strict'

  const manifest = {
    id: 'data-migration',
    name: '配置迁移',
    version: '1.0.0',
    description: '全库数据备份/恢复（JSON），支持文件下载、剪贴板、合并或覆盖导入',
    author: 'you',
    requires: { base: '^0.1.1' }, // 需要 admin API
    permissions: ['read', 'storage', 'ui', 'events', 'admin'],
  }

  function setup(api) {
    function download(name, text) {
      try {
        const blob = new Blob([text], { type: 'application/json' })
        const a = document.createElement('a')
        a.href = URL.createObjectURL(blob)
        a.download = name
        a.click()
        setTimeout(() => URL.revokeObjectURL(a.href), 4000)
        return true
      } catch (e) {
        api.log('下载失败', e)
        return false
      }
    }

    /* ── 面板 ── */
    api.ui.tab({
      name: '配置迁移',
      order: 68,
      render(host) {
        const dump = api.admin.exportAll()
        const kb = (JSON.stringify(dump).length / 1024).toFixed(1)

        // 按模块聚合统计
        const per = {}
        for (const k of Object.keys(dump.data)) {
          const m = k.match(/^lsb_base:([^:]+):/)
          const mod = m ? m[1] : '(其它)'
          per[mod] = (per[mod] || 0) + 1
        }
        const breakdown = Object.entries(per)
          .sort((a, b) => b[1] - a[1])
          .map(([m, n]) => `${api.util.esc(m)}(${n})`)
          .join(' · ')

        host.innerHTML = `
          <div class="lsb-row">
            <div class="lsb-row-main">
              <div class="lsb-row-name">当前库：${dump.count} 个键 · ${kb} KB</div>
              <div class="lsb-row-desc">${breakdown || '空库'}</div>
            </div>
          </div>
          <div class="lsb-actions" style="border:0;padding:8px 0">
            <button class="lsb-btn is-primary" data-export>⬇ 导出备份文件</button>
            <button class="lsb-btn" data-copy>复制到剪贴板</button>
          </div>
          <label class="lsb-field"><span>导入：选择备份文件或直接粘贴 JSON</span>
            <input type="file" accept=".json,application/json" data-file style="margin-bottom:6px">
            <textarea data-json rows="6" placeholder='{"app":"lsb", ...}'></textarea>
          </label>
          <div class="lsb-row" style="border:0">
            <label style="display:flex;gap:6px;align-items:center;font-size:12px">
              <input type="checkbox" data-merge> 合并模式（保留现有同名键，只补缺失）
            </label>
            <button class="lsb-btn is-primary" data-import style="margin-left:auto">⬆ 导入</button>
          </div>
          <div class="lsb-row-desc" style="margin-top:10px">
            ⚠️ 覆盖模式会替换同名键的全部现值；导入后建议刷新页面。备份包含各模块数据与配置，
            请勿分享给不信任的人（可能含 Cookie 以外的敏感本地数据）。
          </div>`

        host.querySelector('[data-export]').onclick = () => {
          const name = `lsb-backup-${today()}.json`
          if (download(name, JSON.stringify(dump))) {
            api.ui.toast(`已下载 ${name}`, { type: 'success' })
          } else {
            api.ui.toast('下载失败，请用「复制到剪贴板」', { type: 'error' })
          }
        }
        host.querySelector('[data-copy]').onclick = async () => {
          try {
            await navigator.clipboard.writeText(JSON.stringify(dump))
            api.ui.toast('已复制到剪贴板', { type: 'success' })
          } catch {
            api.ui.toast('剪贴板不可用', { type: 'error' })
          }
        }

        const ta = host.querySelector('[data-json]')
        host.querySelector('[data-file]').onchange = async (e) => {
          const f = e.target.files?.[0]
          if (!f) return
          ta.value = await f.text()
          api.ui.toast(`已读取 ${f.name}，点击「导入」确认`)
        }
        host.querySelector('[data-import]').onclick = async () => {
          let payload
          try {
            payload = JSON.parse(ta.value)
          } catch {
            api.ui.toast('JSON 解析失败', { type: 'error' })
            return
          }
          const merge = host.querySelector('[data-merge]').checked
          const ok = await api.ui.confirm(
            merge ? `以合并模式导入 ${payload.count ?? '?'} 键？现有同名键保留。` : '以覆盖模式导入？同名键将被替换！',
            { title: '导入确认' },
          )
          if (!ok) return
          try {
            const r = api.admin.importAll(payload, { merge })
            api.ui.toast(`导入完成：写入 ${r.imported}，跳过 ${r.skipped}；建议刷新页面`, { type: 'success', timeout: 5000 })
          } catch (e) {
            api.ui.toast(e.message, { type: 'error' })
          }
        }
      },
    })

    function today() {
      const x = new Date()
      const p = (n) => String(n).padStart(2, '0')
      return x.getFullYear() + p(x.getMonth() + 1) + p(x.getDate())
    }

    /* ── 调试接口 ── */
    api.handle('data-migration:debug', () => ({
      export: () => api.admin.exportAll(),
      import: (payload, opts) => api.admin.importAll(payload, opts),
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
