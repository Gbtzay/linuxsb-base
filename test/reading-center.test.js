import { test } from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync, existsSync } from 'node:fs'
import { makeDom, tick, until } from './helpers/setup.js'

const read = (path) => readFileSync(new URL(path, import.meta.url), 'utf8')
const base = read('../dist-dev/linuxsb-base.user.js')
const resume = read('../plugins/resume-reading.user.js')
const home = read('./fixtures/home.html')
const topic = read('./fixtures/topic1.html')
const key = 'lsb_base:resume-reading:positions'
const laterKey = 'lsb_base:reading-center:later'
const center = existsSync(new URL('../plugins/reading-center.user.js', import.meta.url)) ? read('../plugins/reading-center.user.js') : ''
const skin = read('../plugins/skin.user.js')

async function openCenter(w) {
  assert.ok(w.LSB.bus.hasHandler('reading-center:open'), '阅读中心应提供统一入口')
  await w.LSB.bus.request('reading-center:open')
  assert.ok(await until(() => w.document.querySelector('[data-reading-center]')?.dataset.ready === 'true'))
  return w.document.querySelector('[data-reading-center]')
}

async function boot(t, { html = home, path = '/', preload = {}, plugins = [resume], prepare = () => {} } = {}) {
  const { w } = makeDom(html, `https://linux.sb${path}`, preload)
  Object.defineProperty(w, 'innerWidth', { configurable: true, value: 1440 })
  // jsdom has no layout: a zero-height list otherwise looks scrolled to its end.
  const list = w.document.querySelector('.main-panel > ul.post-list:not(.topic-post-list)')
  if (list) list.getBoundingClientRect = () => ({ top: 0, bottom: 100000 })
  const requests = []
  w.fetch = async (url) => {
    requests.push(String(url))
    return { ok: true, status: 200, url: String(url), text: async () => topic }
  }
  t.after(() => {
    for (const plugin of w.LSB?.info().plugins || []) w.LSB.disable(plugin.id)
    w.close()
  })
  prepare(w)
  w.eval(base)
  for (const code of plugins) w.eval(code)
  await tick(40)
  return { w, requests }
}

test('阅读数据：首页直接读取旧断点，排序/过期过滤/安全链接且不改原存储', async (t) => {
  const now = Date.now()
  const positions = {
    12: { f: 82, p: 3, title: '多页主题', ts: now },
    9: { f: 2, p: 1, title: '较早主题', ts: now - 1000 },
    8: { f: 4, p: 1, title: '过期主题', ts: now - 121 * 864e5 },
    7: null,
    6: { f: -4, p: 'NaN', ts: now },
    evil: { f: 4, p: 1, title: '无效 ID', ts: now },
  }
  const { w, requests } = await boot(t, { preload: { [key]: positions } })
  assert.ok(w.LSB.bus.hasHandler('resume-reading:list'), '正式只读接口必须在首页可用')
  const records = await w.LSB.bus.request('resume-reading:list')
  assert.deepEqual(Array.from(records, (r) => r.topicId), [12, 9])
  assert.equal(records[0].href, '/topic/12?p=3&floor=82')
  assert.equal(records[0].source, 'resume-reading')
  records[0].floor = 999
  assert.equal((await w.LSB.bus.request('resume-reading:get', { topicId: 12 })).floor, 82)
  assert.equal(await w.LSB.bus.request('resume-reading:get', { topicId: '../oops' }), null)
  assert.deepEqual(JSON.parse(w.localStorage.getItem(key)), positions)
  assert.equal(w.document.querySelector('.lsb-resume-bar'), null)
  assert.equal(requests.length, 0)
})

test('阅读数据：软跳后记录属于新帖子，首页保留查询且停用取消延迟写入', async (t) => {
  const { w } = await boot(t, { html: topic, path: '/topic/1' })
  const dbg = await w.LSB.bus.request('resume-reading:debug')
  dbg.saveFloor(18)
  w.document.querySelector('.post-content-title').textContent = '第二篇的第三页'
  w.history.pushState({}, '', '/topic/2?p=3')
  w.dispatchEvent(new w.PopStateEvent('popstate'))
  await tick(30)
  const next = await w.LSB.bus.request('resume-reading:debug')
  next.saveFloor(82)
  assert.ok(w.LSB.bus.hasHandler('resume-reading:get'), '路由切换保留查询接口')
  const first = await w.LSB.bus.request('resume-reading:get', { topicId: 1 })
  const second = await w.LSB.bus.request('resume-reading:get', { topicId: 2 })
  assert.equal(first.floor, 18)
  assert.equal(first.page, 1)
  assert.equal(second.page, 3)
  assert.equal(second.title, '第二篇的第三页')
  w.history.pushState({}, '', '/')
  w.dispatchEvent(new w.PopStateEvent('popstate'))
  assert.ok(w.LSB.bus.hasHandler('resume-reading:list'))
  assert.equal(w.document.querySelector('.lsb-resume-bar'), null)
  w.LSB.disable('resume-reading')
  const saved = w.localStorage.getItem(key)
  w.dispatchEvent(new w.Event('scroll'))
  w.dispatchEvent(new w.Event('pagehide'))
  await tick(1250)
  assert.equal(w.localStorage.getItem(key), saved)
  assert.equal(w.LSB.bus.hasHandler('resume-reading:list'), false)
})

test('阅读数据：再次打开主楼刷新最近访问时间，但保留后面页的断点', async (t) => {
  const previous = Date.now() - 864e5
  const { w } = await boot(t, { html: topic, path: '/topic/1', preload: { [key]: {
    1: { f: 82, p: 3, title: '旧标题', ts: previous },
  } }, prepare(w) {
    for (const post of w.document.querySelectorAll('li.post-entry')) {
      const top = Number(post.dataset.floor || 0) <= 18 ? 100 : 1500
      post.getBoundingClientRect = () => ({ top, bottom: top + 100, width: 600, height: 100 })
    }
  } })
  const item = await w.LSB.bus.request('resume-reading:get', { topicId: 1 })
  assert.equal(item.floor, 82)
  assert.equal(item.page, 3)
  assert.ok(item.updatedAt > previous, '最近阅读应按此次访问排序')
  assert.match(item.title, /LINUX SB上线/)
})

test('阅读中心：历史搜索、标题转义和续读地址只依赖本地数据', async (t) => {
  const { w, requests } = await boot(t, { plugins: [resume, center], preload: { [key]: {
    12: { f: 82, p: 3, title: '<img src=x onerror=alert(1)>多页主题', ts: Date.now() },
    9: { f: 2, p: 1, title: '另一篇', ts: Date.now() - 1 },
  } } })
  const view = await openCenter(w)
  assert.equal(view.querySelector('[data-reading-topic="12"] a').getAttribute('href'), '/topic/12?p=3&floor=82')
  assert.equal(view.querySelector('img'), null)
  const search = view.querySelector('input[type="search"]')
  search.value = '另一篇'
  search.dispatchEvent(new w.Event('input', { bubbles: true }))
  assert.equal(view.querySelectorAll('[data-reading-topic]').length, 1)
  assert.equal(view.querySelector('[data-reading-topic]').dataset.readingTopic, '9')
  search.value = '12'
  search.dispatchEvent(new w.Event('input', { bubbles: true }))
  assert.equal(view.querySelector('[data-reading-topic]').dataset.readingTopic, '12')
  assert.equal(requests.length, 0)
})

test('阅读中心：从历史加入稍后阅读、重开持久化、移除不删除断点', async (t) => {
  const { w, requests } = await boot(t, { plugins: [resume, center], preload: { [key]: {
    12: { f: 82, p: 3, title: '值得读', ts: Date.now() },
  } } })
  let view = await openCenter(w)
  view.querySelector('[data-reading-topic="12"] [data-reading-save]').click()
  assert.ok(await until(() => !!JSON.parse(w.localStorage.getItem(laterKey) || '{}')['12']))
  view.querySelector('[data-reading-tab="later"]').click()
  assert.equal(view.querySelectorAll('[data-reading-topic]').length, 1)
  assert.equal(view.querySelector('[data-reading-topic="12"] a').getAttribute('href'), '/topic/12?p=3&floor=82')
  w.document.querySelector('.lsb-panel-close').click()
  view = await openCenter(w)
  view.querySelector('[data-reading-tab="later"]').click()
  assert.equal(view.querySelectorAll('[data-reading-topic]').length, 1)
  view.querySelector('[data-reading-topic="12"] [data-reading-remove]').click()
  assert.ok(await until(() => view.querySelectorAll('[data-reading-topic]').length === 0))
  assert.equal((await w.LSB.bus.request('resume-reading:get', { topicId: 12 })).floor, 82)
  assert.equal(requests.length, 0)
})

test('阅读中心：帖子/增量列表开关去重，来源停用降级，停用后旧按钮无效', async (t) => {
  const { w } = await boot(t, { html: topic, path: '/topic/1', plugins: [resume, center] })
  assert.ok(await until(() => w.document.querySelector('[data-reading-toggle="1"]')), '正文提供稍后阅读开关')
  const toggle = w.document.querySelector('[data-reading-toggle="1"]')
  toggle.click()
  assert.equal(toggle.getAttribute('aria-pressed'), 'true')
  toggle.click()
  assert.equal(toggle.getAttribute('aria-pressed'), 'false')
  toggle.click()
  assert.equal(Object.keys(JSON.parse(w.localStorage.getItem(laterKey))).length, 1)
  const view = await openCenter(w)
  w.LSB.disable('resume-reading')
  assert.ok(await until(() => /未启用断点续读/.test(view.textContent)))
  view.querySelector('[data-reading-tab="later"]').click()
  assert.equal(view.querySelector('[data-reading-topic="1"] a').getAttribute('href'), '/topic/1')
  const list = w.document.createElement('ul')
  list.className = 'post-list'
  list.innerHTML = '<li class="post-item"><div class="post-title-row"><a class="post-title" href="/topic/44">增量主题</a></div></li>'
  w.document.body.append(list)
  assert.ok(await until(() => w.document.querySelector('[data-reading-toggle="44"]')))
  w.LSB.disable('reading-center')
  assert.equal(w.document.querySelector('[data-reading-toggle]'), null)
  assert.equal(w.document.querySelector('[data-reading-center]'), null)
  const saved = w.localStorage.getItem(laterKey)
  toggle.click()
  assert.equal(w.localStorage.getItem(laterKey), saved)
  assert.equal(w.LSB.bus.hasHandler('reading-center:open'), false)
})

test('阅读中心：队列满额时保留已有条目并提示，损坏记录不生成链接', async (t) => {
  const later = Object.fromEntries(Array.from({ length: 500 }, (_, i) => [i + 2, { title: `主题 ${i + 2}`, addedAt: Date.now() - i }]))
  const { w } = await boot(t, { html: topic, path: '/topic/1', plugins: [center], preload: { [laterKey]: { ...later, evil: { title: '坏数据' }, 888: null } } })
  const view = await openCenter(w)
  const toggle = w.document.querySelector('[data-reading-toggle="1"]')
  assert.ok(toggle)
  toggle.click()
  assert.match(w.document.body.textContent, /500|已满/)
  assert.equal(JSON.parse(w.localStorage.getItem(laterKey))['1'], undefined)
  view.querySelector('[data-reading-tab="later"]').click()
  assert.equal(view.querySelector('[href*="evil"]'), null)
  const search = view.querySelector('input[type="search"]')
  search.value = '主题 501'
  search.dispatchEvent(new w.Event('input', { bubbles: true }))
  assert.equal(view.querySelector('[data-reading-topic="501"] a').getAttribute('href'), '/topic/501')
})

test('阅读中心：恢复焦点重读其他标签的数据，历史来源重启后可继续定位', async (t) => {
  const { w } = await boot(t, { plugins: [resume, center] })
  const view = await openCenter(w)
  w.localStorage.setItem(laterKey, JSON.stringify({ 12: { title: '其他标签保存', addedAt: Date.now() } }))
  w.localStorage.setItem(key, JSON.stringify({ 12: { title: '其他标签保存', f: 82, p: 3, ts: Date.now() } }))
  w.dispatchEvent(new w.Event('focus'))
  assert.ok(await until(() => view.querySelector('[data-reading-topic="12"]')))
  view.querySelector('[data-reading-tab="later"]').click()
  assert.equal(view.querySelector('[data-reading-topic="12"] a').getAttribute('href'), '/topic/12?p=3&floor=82')
  w.LSB.disable('resume-reading')
  assert.ok(await until(() => view.querySelector('[data-reading-topic="12"] a')?.getAttribute('href') === '/topic/12'))
  w.LSB.enable('resume-reading')
  assert.ok(await until(() => view.querySelector('[data-reading-topic="12"] a')?.getAttribute('href') === '/topic/12?p=3&floor=82'))
})

for (const uiMode of ['legacy', 'ios27']) {
  test(`${uiMode} 阅读中心：功能入口打开历史并软跳到保存楼层`, async (t) => {
    const { w, requests } = await boot(t, { plugins: [resume, center, skin], preload: {
      'lsb_base:skin:__config': { uiMode, topicSpa: true },
      'lsb_base:skin:topicSpaNewWorldDefaultMigrationV1': true,
      [key]: { 1: { title: '精确续读', f: 18, p: 2, ts: Date.now() } },
    } })
    const targets = []
    w.HTMLElement.prototype.scrollIntoView = function () { targets.push(this.getAttribute('data-floor')) }
    assert.ok(w.LSB.bus.hasHandler('reading-center:open'))
    const selector = uiMode === 'legacy' ? '[data-lsb-rpc="reading-center:open"]' : '[data-plugin-feature-action="reading-center"]'
    if (uiMode === 'ios27') {
      w.document.querySelector('[data-canvas-open="tool-sheet"]').click()
      w.document.querySelector('[data-tool-action="plugin-features-sheet"]').click()
    }
    assert.ok(await until(() => w.document.querySelector(selector)), '两个界面都有功能入口')
    w.document.querySelector(selector).click()
    assert.ok(await until(() => w.document.querySelector('[data-reading-topic="1"] a')))
    assert.equal(requests.length, 0)
    w.document.querySelector('[data-reading-topic="1"] a').click()
    assert.ok(await until(() => w.location.pathname === '/topic/1' && targets.includes('18')))
    assert.equal(w.location.search, '?p=2&floor=18')
    w.LSB.disable('reading-center')
    if (uiMode === 'ios27') {
      w.document.querySelector('[data-canvas-open="tool-sheet"]').click()
      w.document.querySelector('[data-tool-action="plugin-features-sheet"]').click()
    }
    assert.ok(await until(() => !w.document.querySelector(selector)))
  })
}
