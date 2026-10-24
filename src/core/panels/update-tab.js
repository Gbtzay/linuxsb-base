import { VERSION } from '../core-version.js'
import { esc } from '../../util.js'
import { SCRIPTS, gfJsonUrl, parseStoreScript, classifyVersion, localOxygenVersion, installHref, isLtsChannel, ltsDisplayVersion } from '../../check-update.js'

export function renderUpdateTab(host, core) {
  const wrap = document.createElement('div')
  host.appendChild(wrap)
  let gen = 0
  let inflight = null
  const lts = isLtsChannel()

  const scripts = lts
    ? { lts: SCRIPTS.find((s) => s.id === 'lts') }
    : {
        hydrogen: SCRIPTS.find((s) => s.id === 'hydrogen'),
        oxygen: SCRIPTS.find((s) => s.id === 'oxygen'),
      }

  const snapshot = () => {
    if (lts) {
      return { lts: { local: ltsDisplayVersion() || VERSION, missing: false } }
    }
    const ox = localOxygenVersion([...core.plugins.values()])
    return {
      hydrogen: { local: VERSION, missing: false },
      oxygen: { local: ox, missing: !ox },
    }
  }

  const paint = (states, { busy = false } = {}) => {
    const loc = snapshot()
    const badgeClass = (status) => {
      if (status === 'behind' || status === 'fail' || status === 'invalid') return 'lsb-badge is-err'
      if (status === 'equal') return 'lsb-badge is-on'
      return 'lsb-badge'
    }
    const badgeText = (st) => {
      if (!st || !st.status) return ''
      return {
        behind: '有更新',
        equal: '已是最新',
        ahead: '比商店新',
        missing: '未安装',
        invalid: '版本号无效',
        fail: '查询失败',
        unlisted: '',
      }[st.status] || ''
    }
    const desc = (id, st) => {
      const local = loc[id].local
      if (!st || !st.status) return local ? `本地 ${local}` : ''
      if (st.status === 'missing') return ''
      if (st.status === 'unlisted') return 'LTS 商店页公布后即可对照'
      if (st.status === 'behind' || st.status === 'ahead') return `本地 ${local} · 商店 ${st.store}`
      if (st.status === 'equal') return `本地与商店同为 ${local}`
      if (st.status === 'invalid') return [local, st.store].filter(Boolean).join(' · ')
      if (st.status === 'fail') {
        if (!st.connect) return '无法读取 Greasy Fork'
        return id === 'lts' ? 'LTS 需要允许 greasyfork.org 跨域' : '氢需要允许 greasyfork.org 跨域'
      }
      return ''
    }
    const install = (id, st) => {
      const script = scripts[id]
      const show = st && (st.status === 'behind' || st.status === 'missing')
      if (!show) return ''
      const href = st.status === 'missing' ? script.installUrl : installHref(st.parsed, script.installUrl)
      return `<a class="lsb-btn is-primary" data-install href="${esc(href)}" target="_blank" rel="noopener noreferrer">打开安装页</a>`
    }
    const row = (id) => {
      const st = states[id] || (loc[id].missing ? { status: 'missing' } : null)
      const local = loc[id].local
      const bt = badgeText(st)
      const ver = local ? `<span class="lsb-badge">v${esc(local)}</span>` : ''
      const bd = bt ? `<span class="${badgeClass(st.status)}">${esc(bt)}</span>` : ''
      const d = desc(id, st)
      return `<div class="lsb-row" data-script="${id}">
          <div class="lsb-row-main">
            <div class="lsb-row-name">${esc(scripts[id].label)} ${ver}${bd}</div>
            ${d ? `<div class="lsb-row-desc">${esc(d)}</div>` : ''}
          </div>${install(id, st)}</div>`
    }
    const rows = lts ? row('lts') : row('hydrogen') + row('oxygen')
    const footer = lts
      ? '安装仍由油猴接管。请只留 LINUX.SB（LTS），不要同时开氢或氧。'
      : '安装仍由油猴接管；两个都要装，先氢后氧。'
    wrap.innerHTML =
      '<div class="lsb-actions" style="border:0;padding:0 0 8px;justify-content:flex-start">' +
      `<button class="lsb-btn is-primary" type="button" data-check${busy ? ' disabled' : ''}>${busy ? '查询中…' : '对照 Greasy Fork'}</button></div>` +
      rows +
      `<div class="lsb-row-desc">${footer}</div>`
    const btn = wrap.querySelector('[data-check]')
    if (btn && !busy) btn.onclick = () => run()
  }

  const loadOne = async (script) => {
    try {
      const json = await core.net.json(gfJsonUrl(script.gfId), { external: true })
      const parsed = parseStoreScript(json)
      if (!parsed) return { error: 'read' }
      return { parsed }
    } catch (e) {
      const msg = String((e && e.message) || e)
      return { error: /域名未放行|跨域请求被拒绝/.test(msg) ? 'connect' : 'read' }
    }
  }

  const fromLoad = (res, local) => {
    if (res.status !== 'fulfilled') {
      return { status: 'fail', connect: false }
    }
    const v = res.value
    if (v.error === 'connect') return { status: 'fail', connect: true }
    if (v.error) return { status: 'fail', connect: false }
    const status = classifyVersion(local, v.parsed.version)
    return { status, store: v.parsed.version, parsed: v.parsed }
  }

  const run = () => {
    if (lts) {
      const script = scripts.lts
      if (!script.gfId) {
        paint({ lts: { status: 'unlisted' } })
        return
      }
      if (inflight) return inflight
      const my = ++gen
      inflight = (async () => {
        paint({}, { busy: true })
        const loc = snapshot()
        const settled = await Promise.allSettled([loadOne(script)])
        if (my !== gen || !wrap.isConnected) return
        const states = { lts: fromLoad(settled[0], loc.lts.local) }
        if (states.lts.status === 'fail') core.log('core', '检查更新查询失败')
        paint(states)
      })().finally(() => {
        if (inflight && my === gen) inflight = null
      })
      return inflight
    }
    if (inflight) return inflight
    const my = ++gen
    inflight = (async () => {
      paint({ oxygen: snapshot().oxygen.missing ? { status: 'missing' } : null }, { busy: true })
      const loc = snapshot()
      const jobs = [loadOne(scripts.hydrogen)]
      if (!loc.oxygen.missing) jobs.push(loadOne(scripts.oxygen))
      const settled = await Promise.allSettled(jobs)
      if (my !== gen || !wrap.isConnected) return
      const hRes = settled[0]
      const states = { hydrogen: fromLoad(hRes, loc.hydrogen.local) }
      if (loc.oxygen.missing) states.oxygen = { status: 'missing' }
      else states.oxygen = fromLoad(settled[1], loc.oxygen.local)
      if (states.hydrogen.status === 'fail' || states.oxygen.status === 'fail') {
        core.log('core', '检查更新查询失败')
      }
      paint(states)
    })().finally(() => {
      if (inflight && my === gen) inflight = null
    })
    return inflight
  }

  if (lts) {
    paint(scripts.lts.gfId ? {} : { lts: { status: 'unlisted' } })
  } else {
    paint({ oxygen: snapshot().oxygen.missing ? { status: 'missing' } : null })
  }
}
