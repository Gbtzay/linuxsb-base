import test from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { JSDOM } from 'jsdom'
import { applyPluginBuildProfile } from '../scripts/build-profile.mjs'

import { createSkinPluginCatalog } from '../plugins/skin/plugin-catalog.js'
import { createSkinSearchController } from '../plugins/skin/search-controller.js'

async function catalogFixture() {
  const state = {
    plugins: [{ id: 'reading-center', state: 'active' }, { id: 'checkin-calendar', state: 'active' }],
    handlers: [{ name: 'reading-center:open' }],
    panels: [{ id: 'checkin-calendar' }],
    settings: [{ id: 'checkin-calendar', name: '签到', state: 'active' }],
  }
  const effects = []
  const ui = {
    panels: () => state.panels,
    settingsPlugins: () => state.settings,
    openPanel: (id) => effects.push(['panel', id]),
    openPluginSettings: (id) => effects.push(['settings', id]),
    toast: (message, options) => effects.push(['toast', options.type]),
  }
  const request = (name) => { effects.push(['rpc', name]); return Promise.resolve() }
  const catalog = createSkinPluginCatalog({ getInfo: () => state, ui, request })
  return { catalog, state, effects, ui, createSkinPluginCatalog }
}

test('插件目录按真实能力排序功能，设置入口与功能入口分离', async () => {
  const { catalog, state } = await catalogFixture()
  const before = JSON.stringify(state)
  assert.deepEqual(catalog.features(), [
    { plugin: 'reading-center', rpc: 'reading-center:open', label: '阅读中心', hasSettings: false },
    { plugin: 'checkin-calendar', panel: 'checkin-calendar', label: '签到日历', hasSettings: true },
  ])
  assert.deepEqual(catalog.tools(), [
    { plugin: 'reading-center', rpc: 'reading-center:open', label: '阅读中心' },
    { plugin: 'checkin-calendar', panel: 'checkin-calendar', label: '签到日历' },
  ])
  assert.equal(JSON.stringify(state), before)
})

test('目录实时反映能力注册、撤销及插件停用，不保留旧工具快照', async () => {
  const { catalog, state } = await catalogFixture()
  state.handlers = []
  assert.deepEqual(catalog.tools().map((x) => x.plugin), ['checkin-calendar'])
  state.handlers = [{ name: 'reading-center:open' }]
  state.panels = []
  assert.deepEqual(catalog.tools().map((x) => x.plugin), ['reading-center'])
  state.plugins[0].state = 'disabled'
  assert.deepEqual(catalog.features(), [])
  state.plugins[0].state = 'active'
  assert.equal(catalog.features()[0].plugin, 'reading-center')
})

test('功能打开重新核对状态，精确调用 RPC 或面板', async () => {
  const { catalog, state, effects } = await catalogFixture()
  await catalog.openFeature('reading-center')
  await catalog.openFeature('checkin-calendar')
  state.plugins[1].state = 'disabled'
  await catalog.openFeature('checkin-calendar')
  await catalog.openFeature('unlisted')
  assert.deepEqual(effects, [['rpc', 'reading-center:open'], ['panel', 'checkin-calendar'], ['toast', 'info'], ['toast', 'info']])
})

test('已停用的配置插件仍可打开设置，无设置项时拒绝打开', async () => {
  const { catalog, state, effects } = await catalogFixture()
  state.plugins[1].state = 'disabled'
  state.settings[0].state = 'disabled'
  assert.deepEqual(catalog.settings().map((x) => [x.id, x.state]), [['checkin-calendar', 'disabled']])
  catalog.openSettings('checkin-calendar')
  state.settings = []
  catalog.openSettings('checkin-calendar')
  assert.deepEqual(effects, [['settings', 'checkin-calendar'], ['toast', 'info']])
})

test('面板异常和同步/异步 RPC 异常转成错误提示，不泄漏拒绝', async () => {
  const { state, ui, effects, createSkinPluginCatalog } = await catalogFixture()
  ui.openPanel = () => { throw new Error('panel unavailable') }
  ui.openPluginSettings = () => { throw new Error('settings unavailable') }
  for (const request of [() => { throw new Error('sync') }, () => Promise.reject(new Error('async'))]) {
    const catalog = createSkinPluginCatalog({ getInfo: () => state, ui, request })
    await catalog.openFeature('reading-center')
  }
  const catalog = createSkinPluginCatalog({ getInfo: () => state, ui, request: () => {} })
  await catalog.openFeature('checkin-calendar')
  catalog.openSettings('checkin-calendar')
  assert.deepEqual(effects, Array.from({ length: 4 }, () => ['toast', 'error']))
})

test('正式目录不提供 AI 入口，开发目录保留 AI 历史', async () => {
  const source = readFileSync(new URL('../plugins/skin/plugin-catalog.js', import.meta.url), 'utf8')
  for (const profile of ['release', 'dev']) {
    const module = await import(`data:text/javascript,${encodeURIComponent(applyPluginBuildProfile('skin', source, profile))}`)
    const catalog = module.createSkinPluginCatalog({
      getInfo: () => ({ plugins: [{ id: 'ai-summary', state: 'active' }], handlers: [] }),
      ui: { panels: () => [{ id: 'ai-summary-history' }], settingsPlugins: () => [] },
    })
    assert.deepEqual(catalog.tools().map((x) => x.panel), profile === 'dev' ? ['ai-summary-history'] : [])
  }
})

async function searchFixture(t, native = '<form class="search-form" action="/search"><input name="q" value="草稿"><input type="hidden" name="_csrf" value="token"></form>') {
  const dom = new JSDOM(`<body><header class="top"><div id="original"><i id="before"></i>${native}<b id="after"></b></div></header><div id="legacy" class="lsb-shell-search-host"></div><div id="lsb-shell"><div data-canvas-search-host hidden><button data-canvas-search-trigger></button><div data-canvas-search-panel hidden></div></div></div></body>`, { url: 'https://linux.sb/' })
  t.after(() => dom.window.close())
  const document = dom.window.document
  return { w: dom.window, document, controller: createSkinSearchController({ document }), legacy: document.querySelector('#legacy'), canvas: document.querySelector('[data-canvas-search-host]'), home: document.querySelector('#original'), next: document.querySelector('#after') }
}

for (const native of [
  '<form class="search-form" action="/search"><input name="q" value="草稿"><input type="hidden" name="_csrf" value="token"></form>',
  '<form class="meilisearch-search-top-form" action="/meilisearch_search"><input name="q" value="草稿" required minlength="2"><input type="hidden" name="_csrf" value="token"></form>',
  '<form role="search" aria-label="站内搜索" action="/site-search"><input name="q" value="草稿"><input type="hidden" name="_csrf" value="token"></form>',
]) test(`原生搜索跨宿主迁移保留身份、事件和字段：${native.match(/action="([^"]+)"/)[1]}`, async (t) => {
  const f = await searchFixture(t, native)
  const form = f.home.querySelector('form'), original = form.getAttribute('action')
  let submissions = 0
  form.addEventListener('submit', (event) => { event.preventDefault(); submissions++ })
  f.controller.adopt(f.legacy)
  f.controller.adopt(f.legacy)
  f.controller.adopt(f.canvas)
  assert.equal(form.parentNode, f.canvas.querySelector('[data-canvas-search-panel]'))
  form.dispatchEvent(new f.w.Event('submit', { cancelable: true }))
  assert.equal(submissions, 1)
  f.controller.restore()
  f.controller.restore()
  assert.equal(form.parentNode, f.home)
  assert.equal(form.nextSibling, f.next)
  assert.equal(form.getAttribute('action'), original)
  assert.deepEqual([...new f.w.FormData(form)], [['q', '草稿'], ['_csrf', 'token']])
  assert.equal(f.document.querySelectorAll('form').length, 1)
})

test('替换已迁入占位链接的新表单继承原位，原始链接不复活', async (t) => {
  const f = await searchFixture(t, '<a class="search-page-link" href="/search">搜索</a>')
  const link = f.home.querySelector('a')
  f.controller.adopt(f.canvas)
  const form = f.document.createElement('form')
  form.className = 'meilisearch-search-top-form'
  form.action = '/meilisearch_search'
  link.replaceWith(form)
  f.controller.adopt(f.canvas)
  f.controller.restore()
  assert.equal(form.parentNode, f.home)
  assert.equal(form.nextSibling, f.next)
  assert.equal(link.isConnected, false)
  assert.equal(link.classList.contains('lsb-shell-search'), false)
})

test('占位链接被替换后直接跨宿主迁移仍还原到原生位置', async (t) => {
  const f = await searchFixture(t, '<a class="search-page-link" href="/search">搜索</a>')
  const link = f.home.querySelector('a')
  f.controller.adopt(f.legacy)
  const form = f.document.createElement('form')
  form.className = 'meilisearch-search-top-form'
  link.replaceWith(form)
  f.controller.adopt(f.canvas)
  f.legacy.remove()
  f.controller.restore()
  assert.equal(form.parentNode, f.home)
  assert.equal(form.nextSibling, f.next)
  assert.equal(link.classList.contains('lsb-shell-search'), false)
})

test('跨宿主时优先迁移已接管表单，不窃取页面其它搜索表单', async (t) => {
  const f = await searchFixture(t)
  const form = f.home.querySelector('form')
  f.controller.adopt(f.legacy)
  const unrelated = f.document.createElement('form')
  unrelated.className = 'search-form'
  unrelated.action = '/page-search'
  f.document.body.prepend(unrelated)
  f.controller.adopt(f.canvas)
  assert.ok(f.canvas.contains(form))
  assert.equal(unrelated.parentNode, f.document.body)
  f.legacy.remove()
  f.controller.restore()
  assert.equal(form.parentNode, f.home)
  assert.equal(form.nextSibling, f.next)
  assert.equal(unrelated.parentNode, f.document.body)
})

test('搜索还原不依赖全局同名 class，且可再次接管', async (t) => {
  const f = await searchFixture(t)
  const form = f.home.querySelector('form')
  const foreign = f.document.createElement('p')
  foreign.className = 'lsb-shell-search'
  f.document.body.prepend(foreign)
  f.controller.adopt(f.legacy)
  f.controller.restore()
  assert.equal(form.parentNode, f.home)
  assert.equal(foreign.parentNode, f.document.body)
  assert.equal(foreign.className, 'lsb-shell-search')
  f.controller.adopt(f.canvas)
  assert.ok(f.canvas.contains(form))
  f.controller.restore()
  assert.equal(form.parentNode, f.home)
})

test('搜索原父节点脱离时移除所接管节点，原 next 消失时追加到原父节点', async (t) => {
  const f = await searchFixture(t)
  const form = f.home.querySelector('form')
  f.controller.adopt(f.legacy)
  f.next.remove()
  f.controller.restore()
  assert.equal(f.home.lastChild, form)
  f.controller.adopt(f.legacy)
  f.home.remove()
  f.controller.restore()
  assert.equal(form.parentNode, null)
  assert.equal(form.classList.contains('lsb-shell-search'), false)
})

test('搜索展开/收起保留焦点与 aria，无原生搜索时隐藏入口', async (t) => {
  const f = await searchFixture(t)
  const form = f.home.querySelector('form')
  const trigger = f.canvas.querySelector('button'), panel = f.canvas.querySelector('[data-canvas-search-panel]')
  assert.equal(f.controller.host(), f.canvas)
  f.controller.adopt(f.canvas)
  assert.equal(f.canvas.hidden, false)
  assert.equal(f.controller.setOpen(f.canvas, true), true)
  assert.equal(panel.hidden, false)
  assert.equal(trigger.getAttribute('aria-expanded'), 'true')
  assert.equal(f.document.activeElement, form.querySelector('input'))
  f.controller.setOpen(f.canvas, false, true)
  assert.equal(f.document.activeElement, trigger)
  assert.equal(panel.hidden, true)
  f.controller.restore()
  form.remove()
  f.controller.adopt(f.canvas)
  assert.equal(f.canvas.hidden, true)
  assert.equal(f.controller.setOpen(f.canvas, true), false)
})

test('顶栏表单优先于页面表单，占位链接在后出现真实表单时移除', async (t) => {
  const f = await searchFixture(t, '<a class="search-page-link" href="/search">搜索</a>')
  const link = f.home.querySelector('a')
  f.controller.adopt(f.legacy)
  const pageForm = f.document.createElement('form')
  pageForm.className = 'search-form'
  f.document.body.prepend(pageForm)
  const topForm = f.document.createElement('form')
  topForm.className = 'meilisearch-search-top-form'
  f.home.insertBefore(topForm, f.next)
  f.controller.adopt(f.legacy)
  assert.equal(topForm.parentNode, f.legacy)
  assert.equal(pageForm.parentNode, f.document.body)
  assert.equal(link.isConnected, false)
  f.controller.restore()
  assert.equal(topForm.parentNode, f.home)
  assert.equal(topForm.nextSibling, f.next)
})
