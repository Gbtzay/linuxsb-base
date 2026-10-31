import test from 'node:test'
import assert from 'node:assert/strict'
import { existsSync } from 'node:fs'
import { JSDOM } from 'jsdom'
import { installShellScrollBridge } from '../src/shell/scroll.js'

const contentUrl = new URL('../plugins/skin/content-controller.js', import.meta.url)
const historyUrl = new URL('../plugins/skin/history-controller.js', import.meta.url)
const { createSkinContentController } = existsSync(contentUrl) ? await import(contentUrl) : {}
const { createSkinHistoryController } = existsSync(historyUrl) ? await import(historyUrl) : {}

function contentFixture(t) {
  assert.equal(typeof createSkinContentController, 'function', '正文控制器须可独立验证')
  const dom = new JSDOM('<section id="home"><main class="wrap"><input value="draft"><aside class="sidebar" id="a"></aside><aside class="sidebar" id="b"></aside><div class="rail"></div><aside class="sidebar mobile-menu-drawer"></aside><footer></footer></main><nav></nav></section><div id="host"></div>', { url: 'https://linux.sb/' })
  const { window } = dom
  const { document } = window
  const nativeScrollTo = window.scrollTo
  const controller = createSkinContentController({
    window, document,
    isChallengeDocument: (scope) => !!scope.querySelector('[data-challenge]'),
    findLeftRails: (scope) => [...scope.querySelectorAll('.rail')],
    createScrollBridge: installShellScrollBridge,
  })
  t.after(() => { controller.release(); window.close() })
  return { window, document, controller, outlet: document.querySelector('main'), host: document.getElementById('host'), nativeScrollTo }
}

test('正文重复挂载保留输入事件与原位置，侧栏按原顺序还原', (t) => {
  const { window, document, controller, outlet, host, nativeScrollTo } = contentFixture(t)
  const children = [...outlet.children]
  const input = outlet.querySelector('input')
  input.value = 'unsaved draft'
  let changes = 0
  input.addEventListener('input', () => changes++)
  controller.mount(outlet, host)
  controller.mount(outlet, host)
  assert.equal(document.getElementById('a').parentNode, document.body)
  assert.equal(outlet.querySelector('.mobile-menu-drawer'), children[4])
  window.scrollTo(17, 290)
  assert.equal(host.scrollTop, 290)
  assert.equal(host.scrollLeft, 17)
  controller.release()
  controller.release()
  assert.equal(outlet.parentNode.id, 'home')
  assert.equal(outlet.nextSibling.tagName, 'NAV')
  assert.deepEqual([...outlet.children], children)
  assert.equal(outlet.querySelector('input'), input)
  assert.equal(input.value, 'unsaved draft')
  input.dispatchEvent(new window.Event('input'))
  assert.equal(changes, 1)
  assert.equal(outlet.querySelector('.rail').classList.contains('lsb-native-left-hidden'), false)
  assert.equal(window.scrollTo, nativeScrollTo)
  assert.equal(controller.scroller, null)
})

test('正文出口更换后记住新的还原位置，旧的已移除子树不复活', (t) => {
  const { document, controller, outlet, host } = contentFixture(t)
  const oldSide = document.getElementById('a')
  controller.mount(outlet, host)
  outlet.remove()
  const nextHome = document.createElement('section')
  nextHome.innerHTML = '<header></header><main>new route</main><footer></footer>'
  document.body.append(nextHome)
  const nextOutlet = nextHome.querySelector('main')
  controller.mount(nextOutlet, host)
  controller.release()
  assert.equal(outlet.isConnected, false)
  assert.equal(oldSide.parentNode, outlet)
  assert.equal(oldSide.isConnected, false, '旧侧栏不能滞留在body')
  assert.equal(nextOutlet.parentNode, nextHome)
  assert.equal(nextOutlet.nextSibling.tagName, 'FOOTER')
})

test('正文的原父节点已移除时，停用仍保留可见正文', (t) => {
  const { document, controller, outlet, host } = contentFixture(t)
  controller.mount(outlet, host)
  document.getElementById('home').remove()
  controller.release()
  assert.equal(outlet.parentNode, document.body)
  assert.equal(outlet.querySelector('#a').isConnected, true)
})

test('滚动根更换释放旧桥，重复同步与无效根不留下代理', (t) => {
  const { window, document, controller, host, nativeScrollTo } = contentFixture(t)
  const other = document.createElement('div')
  document.body.append(other)
  controller.syncScrollBridge(host)
  const firstBridge = window.scrollTo
  controller.syncScrollBridge(host)
  assert.equal(window.scrollTo, firstBridge)
  window.scrollTo(0, 99)
  controller.syncScrollBridge(other)
  window.scrollTo(0, 130)
  assert.equal(host.scrollTop, 99)
  assert.equal(other.scrollTop, 130)
  controller.syncScrollBridge(null)
  assert.equal(window.scrollTo, nativeScrollTo)
})

test('出口发现保留候选顺序并拒绝挑战页和包住壳的节点', (t) => {
  const { document, controller, outlet } = contentFixture(t)
  assert.equal(controller.findOutlet(), outlet)
  const remote = document.implementation.createHTMLDocument()
  remote.body.innerHTML = '<section data-slot="page.before_render"><div id="lsb-shell"></div></section><main>remote</main>'
  assert.equal(controller.findOutlet(remote), remote.querySelector('main'))
  remote.body.setAttribute('data-challenge', '')
  assert.equal(controller.findOutlet(remote), null)
})

function historyFixture(t, { clock = false } = {}) {
  assert.equal(typeof createSkinHistoryController, 'function', '历史控制器须可独立验证')
  const dom = new JSDOM('<main></main>', { url: 'https://linux.sb/' })
  const { window } = dom
  const { document, history } = window
  history.scrollRestoration = 'auto'
  const state = { x: 31, y: 318, root: null }
  const writes = []
  const timers = new Map()
  let timerId = 0
  if (clock) {
    window.setTimeout = (fn, ms) => { const id = ++timerId; timers.set(id, { fn, ms }); return id }
    window.clearTimeout = (id) => timers.delete(id)
  }
  const controller = createSkinHistoryController({
    window, document,
    getScrollRoot: () => state.root,
    readScroll: () => ({ x: state.x, y: state.y }),
    scrollTo: (x, y) => { writes.push([x, y]); state.x = x; state.y = y },
  })
  t.after(() => { controller.dispose(); window.close() })
  return { window, document, history, controller, state, writes, timers }
}

test('历史项保留站点字段和双轴位置，push/replace/none的索引语义一致', (t) => {
  const { controller, history, state } = historyFixture(t)
  history.replaceState({ site: { draft: 7 } }, '', '/')
  controller.bind()
  assert.deepEqual(history.state, { site: { draft: 7 }, lsbShellSpa: true, lsbShellSpaIndex: 0, lsbShellSpaUrl: 'https://linux.sb/', lsbScrollX: 31, lsbScrollY: 318 })
  controller.bind()
  controller.apply(new URL('https://linux.sb/topic/1'), 'push')
  assert.equal(history.length, 2)
  assert.equal(history.state.lsbShellSpaIndex, 1)
  assert.equal(history.state.lsbScrollY, 0)
  state.x = 9; state.y = 470
  controller.rememberScroll()
  assert.equal(history.state.lsbScrollX, 9)
  assert.equal(history.state.lsbScrollY, 470)
  controller.apply(new URL('https://linux.sb/topic/1?p=2'), 'replace')
  assert.equal(history.length, 2)
  assert.equal(history.state.lsbShellSpaIndex, 1)
  assert.deepEqual(history.state.site, { draft: 7 })
  const prior = history.state
  controller.apply(new URL('https://linux.sb/forum/4'), 'none')
  assert.equal(history.state, prior)
})

test('拒绝跨多个历史项的后退只确认一次，并回到原历史项', async (t) => {
  const { window, history, controller } = historyFixture(t)
  controller.bind()
  controller.apply(new URL('https://linux.sb/forum/4'), 'push')
  controller.apply(new URL('https://linux.sb/topic/1'), 'push')
  let confirms = 0
  const decisions = []
  await new Promise((resolve, reject) => {
    const timeout = setTimeout(() => reject(new Error('history rollback timed out')), 1000)
    window.addEventListener('popstate', () => {
      decisions.push(controller.acceptPop(() => { confirms++; return false }))
      if (decisions.length === 2) { clearTimeout(timeout); resolve() }
    })
    history.go(-2)
  })
  assert.deepEqual(decisions, [false, false])
  assert.equal(confirms, 1)
  assert.equal(window.location.pathname, '/topic/1')
  assert.equal(history.state.lsbShellSpaIndex, 2)
})

test('manual滚动模式重复绑定不覆盖原值，停用后可重新接管', (t) => {
  const { controller, history } = historyFixture(t)
  controller.bind(); controller.bind()
  assert.equal(history.scrollRestoration, 'manual')
  controller.dispose(); controller.dispose()
  assert.equal(history.scrollRestoration, 'auto')
  history.scrollRestoration = 'manual'
  controller.bind(); controller.dispose()
  assert.equal(history.scrollRestoration, 'manual')
  controller.bind()
  history.scrollRestoration = 'auto'
  controller.dispose()
  assert.equal(history.scrollRestoration, 'auto')
})

test('历史恢复仅写一次坐标，短暂保护实际滚动根并归还inline优先级', (t) => {
  const { controller, history, document, state, writes, timers } = historyFixture(t, { clock: true })
  state.root = document.querySelector('main')
  state.root.style.setProperty('overflow-anchor', 'auto', 'important')
  history.replaceState({ lsbScrollX: 12, lsbScrollY: 280 }, '', '/')
  controller.restoreScroll('none')
  assert.deepEqual(writes, [[12, 280]])
  assert.equal(state.root.style.getPropertyValue('overflow-anchor'), 'none')
  assert.equal(document.documentElement.style.getPropertyValue('overflow-anchor'), '')
  assert.equal(timers.size, 1)
  const timer = [...timers.values()][0]
  assert.ok(timer.ms > 180 && timer.ms <= 500, '保护覆盖正文动画且有短暂上限')
  timer.fn()
  assert.equal(state.root.style.getPropertyValue('overflow-anchor'), 'auto')
  assert.equal(state.root.style.getPropertyPriority('overflow-anchor'), 'important')
  assert.deepEqual(writes, [[12, 280]], '清理不能再次拉回阅读坐标')
  assert.equal(timers.size, 0)
})

for (const type of ['wheel', 'touchstart', 'pointerdown', 'keydown', 'pagehide']) {
  test(`历史恢复遇到${type}提前释放保护且不覆盖用户滚动`, (t) => {
    const { controller, history, window, document, state, writes, timers } = historyFixture(t, { clock: true })
    history.replaceState({ lsbScrollY: 280 }, '', '/')
    controller.restoreScroll('none')
    const staleTimer = [...timers.values()][0].fn
    window.dispatchEvent(type === 'keydown' ? new window.KeyboardEvent(type, { key: 'PageDown' }) : new window.Event(type))
    state.y = 510
    staleTimer()
    assert.equal(document.documentElement.style.getPropertyValue('overflow-anchor'), '')
    assert.equal(state.y, 510)
    assert.equal(writes.length, 1)
    assert.equal(timers.size, 0)
  })
}

test('新导航和停用清理保护，过期回调不干扰后来恢复或他人的样式', (t) => {
  const { controller, history, document, timers, window } = historyFixture(t, { clock: true })
  const root = document.documentElement
  history.replaceState({ lsbScrollY: 280 }, '', '/')
  controller.restoreScroll('none')
  const staleTimer = [...timers.values()][0].fn
  controller.cancel()
  assert.equal(root.style.getPropertyValue('overflow-anchor'), '')
  controller.restoreScroll('none')
  staleTimer()
  assert.equal(root.style.getPropertyValue('overflow-anchor'), 'none')
  window.dispatchEvent(new window.KeyboardEvent('keydown', { key: 'a' }))
  assert.equal(timers.size, 1, '非滚动按键不结束保护')
  root.style.setProperty('overflow-anchor', 'auto')
  controller.dispose()
  assert.equal(root.style.getPropertyValue('overflow-anchor'), 'auto')
  assert.equal(timers.size, 0)
})

test('无效历史坐标归零，普通导航不临时关闭锚定', (t) => {
  const { controller, history, writes, timers, document } = historyFixture(t, { clock: true })
  history.replaceState({ lsbScrollX: Infinity, lsbScrollY: -4 }, '', '/')
  controller.restoreScroll('none')
  assert.deepEqual(writes, [[0, 0]])
  controller.restoreScroll('push')
  assert.deepEqual(writes, [[0, 0], [0, 0]])
  assert.equal(document.documentElement.style.getPropertyValue('overflow-anchor'), '')
  assert.equal(timers.size, 0)
})
