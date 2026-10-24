import { esc } from '../../util.js'

export function renderPluginList(host, core) {
  if (!core.plugins.size) {
    host.innerHTML = '<div class="lsb-empty">尚未加载任何插件。安装依附脚本后会自动出现在这里。</div>'
    return
  }
  for (const rec of core.plugins.values()) {
    const row = document.createElement('div')
    row.className = 'lsb-row'
    const stateLabel = { active: '运行中', disabled: '已停用', error: '出错', skipped: '本页不适用', registered: '等待依赖' }[rec.state]
    const cls = rec.state === 'active' ? ' is-on' : rec.state === 'error' ? ' is-err' : ''
    row.innerHTML = `
        <div class="lsb-row-main">
          <div class="lsb-row-name">${esc(rec.name)} <span class="lsb-badge">v${esc(rec.version)}</span><span class="lsb-badge${cls}">${esc(stateLabel)}</span></div>
          <div class="lsb-row-desc">${esc(rec.description || rec.id)}${rec.error ? ` · ${esc(rec.error)}` : ''}</div>
          <div class="lsb-row-desc">权限：${esc(rec.permissions.join(' / '))}</div>
        </div>`
    const btn = document.createElement('button')
    btn.className = 'lsb-btn'
    btn.textContent = rec.state === 'disabled' ? '启用' : '停用'
    btn.onclick = () => {
      if (rec.state === 'disabled') core.enable(rec.id)
      else core.disable(rec.id)
      core.ui.toast('设置已生效，刷新页面后完全应用', { type: 'info' })
      host.innerHTML = ''
      renderPluginList(host, core)
    }
    row.appendChild(btn)
    host.appendChild(row)
  }
}
