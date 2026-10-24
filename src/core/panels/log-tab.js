import { esc } from '../../util.js'

export function renderLogTab(host, core) {
  host.replaceChildren()
  if (!core._logViewState) core._logViewState = { showErr: true, showRun: false, q: '' }
  const st = core._logViewState
  const fmtT = (t) => new Date(t).toLocaleTimeString('zh-CN')

  const render = () => {
    const errs = core.errors()
    let rows = []
    if (st.showErr)
      rows.push(
        ...errs.map((e) => ({
          t: e.t,
          lvl: 'err',
          who: e.id || e.kind,
          txt: `[${e.kind}${e.phase ? '/' + e.phase : ''}] ${e.msg}${e.n > 1 ? ' ×' + e.n : ''} · ${e.page}`,
          tip: [e.stack, e.where].filter(Boolean).join('\n'),
        })),
      )
    if (st.showRun)
      rows.push(
        ...core.logs()
          .slice(-200)
          .reverse()
          .map((l) => ({ t: l.ts, lvl: 'run', who: l.scope, txt: l.args.join(' '), tip: '' })),
      )
    if (st.q) rows = rows.filter((r) => (r.who + ' ' + r.txt).toLowerCase().includes(st.q))
    rows.sort((a, b) => b.t - a.t)

    wrap.innerHTML =
      '<div style="display:flex;gap:8px;align-items:center;margin-bottom:8px;flex-wrap:wrap">' +
      '<label style="font-size:12px;display:flex;gap:4px;align-items:center"><input type="checkbox" data-e' +
      (st.showErr ? ' checked' : '') + '> 错误 (' + errs.length + ')</label>' +
      '<label style="font-size:12px;display:flex;gap:4px;align-items:center"><input type="checkbox" data-r' +
      (st.showRun ? ' checked' : '') + '> 运行日志</label>' +
      '<input type="search" placeholder="过滤…" data-q value="' +
      esc(st.q).replace(/"/g, '&quot;') + '" style="flex:1;min-width:120px;padding:4px 7px;border:1px solid var(--line,#ddd);border-radius:6px;background:var(--bg,#fff);color:var(--text,#222)">' +
      '<button class="lsb-btn" data-export>导出</button>' +
      '<button class="lsb-btn" data-clear>清空错误</button></div>' +
      '<div style="max-height:52vh;overflow:auto;border-top:1px solid var(--line-soft,#eee)">' +
      (rows.length
        ? rows
            .map(
              (r) =>
                '<div class="lsb-row"' + (r.tip ? ' title="' + esc(r.tip).replace(/"/g, '&quot;') + '"' : '') + '>' +
                '<span style="color:var(--text-muted,#888);font-size:11px;min-width:64px">' + fmtT(r.t) + '</span>' +
                '<span class="lsb-badge' + (r.lvl === 'err' ? ' is-err' : '') + '">' + esc(String(r.who)) + '</span>' +
                '<span style="margin-left:8px;font-size:12px;word-break:break-word">' + esc(r.txt) + '</span></div>',
            )
            .join('')
        : '<div class="lsb-empty">暂无记录。</div>') +
      '</div>'

    wrap.querySelector('[data-e]').onchange = (e) => {
      st.showErr = e.target.checked
      render()
    }
    wrap.querySelector('[data-r]').onchange = (e) => {
      st.showRun = e.target.checked
      render()
    }
    wrap.querySelector('[data-q]').oninput = (e) => {
      st.q = e.target.value.toLowerCase()
      render()
    }
    wrap.querySelector('[data-clear]').onclick = async () => {
      if (await core.ui.confirm('清空全部错误记录？')) {
        core.clearErrors()
        render()
      }
    }
    wrap.querySelector('[data-export]').onclick = () => {
      try {
        const blob = new Blob([JSON.stringify({ errors: core.errors(), runLog: core.logs() }, null, 2)], {
          type: 'application/json',
        })
        const a = document.createElement('a')
        a.href = URL.createObjectURL(blob)
        a.download = 'lsb-logs-' + Date.now() + '.json'
        a.click()
        setTimeout(() => URL.revokeObjectURL(a.href), 4000)
      } catch (e) {
        core.ui.toast('导出失败：' + e.message, { type: 'error' })
      }
    }
  }

  const wrap = document.createElement('div')
  host.appendChild(wrap)
  render()
}
