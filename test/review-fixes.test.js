/**
 * 审查修复回归：软导航快照、pages 启停、日志面板不堆叠、
 * 粘性事件隔离、循环依赖、shutdown、选择器常量。
 */
import { test, before, beforeEach, afterEach } from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { JSDOM } from 'jsdom'
import { Bus } from '../src/bus.js'
import { SEL } from '../src/site.js'

const FX = {
  topic: readFileSync(new URL('./fixtures/topic1.html', import.meta.url), 'utf8'),
  home: readFileSync(new URL('./fixtures/home.html', import.meta.url), 'utf8'),
}

let Core
const cores = []

function installDom(html, url) {
  const dom = new JSDOM(html, { url })
  const w = dom.window
  globalThis.window = w
  globalThis.document = w.document
  globalThis.location = w.location
  globalThis.localStorage = w.localStorage
  globalThis.MutationObserver = w.MutationObserver
  globalThis.DOMParser = w.DOMParser
  globalThis.FormData = w.FormData
  globalThis.requestAnimationFrame = (fn) => setTimeout(() => fn(Date.now()), 0)
  globalThis.CustomEvent = w.CustomEvent
  w.localStorage.clear()
  return w
}

before(async () => {
  installDom(FX.topic, 'https://linux.sb/topic/1')
  ;({ Core } = await import('../src/core.js'))
})

beforeEach(() => {
  installDom(FX.topic, 'https://linux.sb/topic/1')
})

afterEach(() => {
  for (const c of cores.splice(0)) {
    try {
      c.shutdown()
    } catch {
      /* ignore */
    }
  }
})

function adoptHtml(html) {
  const src = new JSDOM(html).window.document
  document.head.innerHTML = src.head.innerHTML
  document.body.innerHTML = src.body.innerHTML
}

function boot() {
  const core = new Core()
  core.boot()
  cores.push(core)
  return core
}

test('SEL 覆盖帖子楼层的两种 ul 类名', () => {
  assert.match(SEL.topicPosts, /topic-post-list/)
  assert.match(SEL.topicPosts, /post-list/)
  assert.match(SEL.topicUl, /topic-post-list/)
  assert.equal(SEL.listItems, 'ul.post-list > li.post-item:not(.post-entry)')
})

test('软导航后 snapshot 与 CSRF 跟随当前文档，不再残留旧帖', async () => {
  localStorage.setItem('lsb_base:__core:urlPoll', JSON.stringify(20))
  const core = boot()
  assert.equal(core.snapshot.page.type, 'topic')
  assert.ok(core.snapshot.topic, '启动时有帖子快照')
  const oldTid = core.snapshot.topic.id
  const oldCsrf = core.net.csrf()
  assert.ok(oldCsrf, '帖子页应有 CSRF')

  adoptHtml(FX.home)
  for (const el of document.querySelectorAll('input[name="_csrf"]')) el.value = 'csrf-after-nav'
  window.history.pushState({}, '', '/')
  await new Promise((r) => setTimeout(r, 150))

  assert.equal(core.snapshot.page.type, 'home')
  assert.equal(core.snapshot.topic, undefined, '离开帖子页后旧 topic 不得残留')
  assert.ok(Array.isArray(core.snapshot.list), '首页应解析列表')
  assert.notEqual(oldTid, undefined)
  assert.equal(core.snapshot.csrf, 'csrf-after-nav')
  assert.equal(core.net.csrf(), 'csrf-after-nav', '文档已换，CSRF 必须跟随当前页而非沿用旧 token')
  assert.notEqual(oldCsrf, 'csrf-after-nav')
})

test('同帖翻页不重解析 snapshot.topic', async () => {
  localStorage.setItem('lsb_base:__core:urlPoll', JSON.stringify(20))
  const core = boot()
  const topicRef = core.snapshot.topic
  assert.ok(topicRef)
  window.history.replaceState({}, '', '/topic/1?p=2')
  await new Promise((r) => setTimeout(r, 150))
  assert.equal(core.snapshot.page.page, 2)
  assert.equal(core.snapshot.topic, topicRef, '只刷新 page，不整页 parseTopic')
})

test('pages 限定插件：离页停用、回页重激活', async () => {
  localStorage.setItem('lsb_base:__core:urlPoll', JSON.stringify(20))
  const core = boot()
  let setups = 0
  let live = false
  core.register({ id: 'topiconly', version: '1.0.0', pages: ['topic'] }, (api) => {
    setups++
    live = true
    api.onDispose(() => {
      live = false
    })
  })
  assert.equal(core.plugins.get('topiconly').state, 'active')
  assert.equal(live, true)

  window.history.pushState({}, '', '/forum/7')
  await new Promise((r) => setTimeout(r, 80))
  assert.equal(core.plugins.get('topiconly').state, 'skipped')
  assert.equal(live, false, '离页必须 dispose')

  window.history.pushState({}, '', '/topic/1')
  await new Promise((r) => setTimeout(r, 80))
  assert.equal(core.plugins.get('topiconly').state, 'active')
  assert.equal(setups, 2)
  assert.equal(live, true)
})

test('日志面板重复渲染不堆叠 DOM', () => {
  const core = boot()
  const host = document.createElement('div')
  document.body.appendChild(host)
  core._renderLogTab(host)
  core._pushErr({ kind: 'uncaught', msg: 'boom-1' })
  core._renderLogTab(host)
  core._pushErr({ kind: 'uncaught', msg: 'boom-2' })
  core._renderLogTab(host)
  assert.equal(host.children.length, 1, 'host 下只应有一套日志视图')
})

test('循环依赖标记为 error 而不是永远 registered', () => {
  const core = boot()
  core.register({ id: 'aa', version: '1.0.0', requires: { plugins: { bb: '^1.0.0' } } }, () => {})
  core.register({ id: 'bb', version: '1.0.0', requires: { plugins: { aa: '^1.0.0' } } }, () => {})
  assert.equal(core.plugins.get('aa').state, 'error')
  assert.equal(core.plugins.get('bb').state, 'error')
  assert.match(core.plugins.get('aa').error, /循环/)
})

test('shutdown 拆除 boot 挂上的全局监听', () => {
  const core = boot()
  core.shutdown()
  window.history.pushState({}, '', '/forum/7')
  window.dispatchEvent(new window.Event('popstate'))
  const n = core._logs.filter((l) => l.args.some((a) => String(a).includes('路由'))).length
  assert.equal(n, 0, 'shutdown 后 popstate 不得再记路由')
})

test('enable 对未注册插件返回 false', () => {
  const core = boot()
  assert.equal(core.enable('no-such-plugin'), false)
})

test('粘性事件补发时后到的监听者拿到独立副本', () => {
  const bus = new Bus({ onError: () => {} })
  bus.emit('site:ready', { page: 'topic', n: 1 }, { sticky: true })
  let a
  let b
  bus.on('site:ready', (p) => {
    a = p
    p.n = 99
  })
  bus.on('site:ready', (p) => {
    b = p
  })
  assert.equal(a.n, 99)
  assert.equal(b.n, 1, '第二位订阅者不得看到第一位的改写')
})
