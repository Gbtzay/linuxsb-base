import { coreStore } from '../../store.js'

export function renderBaseSettings(host, core) {
  const schema = {
    rate: { type: 'number', label: '请求最小间隔 (ms)', desc: '所有插件共享同一队列，过低会触发站点限流', default: 900 },
    urlPoll: { type: 'number', label: 'URL 变化轮询 (ms)', desc: '无限滚动时追踪 ?p= 变化；0 = 只靠 popstate 事件', default: 700 },
    launcher: { type: 'switch', label: '显示右下角入口按钮', default: true },
    debug: { type: 'switch', label: '调试日志', default: false },
  }
  const cur = {
    rate: coreStore.get('rate', 900),
    urlPoll: coreStore.get('urlPoll', 700),
    launcher: coreStore.get('launcher', true),
    debug: coreStore.get('debug', false),
  }
  core.ui.buildForm(host, schema, cur, (v) => {
    coreStore.set('rate', Math.max(200, Number(v.rate) || 900))
    coreStore.set('urlPoll', Math.max(0, Number(v.urlPoll) || 0))
    coreStore.set('launcher', !!v.launcher)
    coreStore.set('debug', !!v.debug)
    core.net.rate = coreStore.get('rate', 900)
    core.debug = !!v.debug
  })
  const info = document.createElement('div')
  info.className = 'lsb-row-desc'
  info.style.marginTop = '12px'
  info.textContent = `页面：${core.snapshot.page.type} · 站点版本：${core.snapshot.version || '未知'} · 身份：${
    core.snapshot.me.guest ? '访客' : `${core.snapshot.me.name || 'uid ' + core.snapshot.me.uid}`
  } · CSRF：${core.snapshot.csrf ? '已获取' : '无'}`
  host.appendChild(info)
}
