import { test } from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { JSDOM } from 'jsdom'

const baseCode = readFileSync(new URL('../dist/linuxsb-base.user.js', import.meta.url), 'utf8')
const PLUG = (name) => readFileSync(new URL(`../plugins/${name}`, import.meta.url), 'utf8')

function loggedInHome(points = 500, rankText = null) {
  return `<html><body>
    <a href="/user/42">我的主页</a>
    <aside class="sidebar-card user-card">
      <a class="user-name" href="/user/42">测试用户</a>
      <span class="user-rank">${rankText ?? `普通用户 · ${points}`}</span>
    </aside>
  </body></html>`
}

function makeDom(html, url = 'https://linux.sb/', preload = {}) {
  const dom = new JSDOM(html, { url, runScripts: 'outside-only' })
  const w = dom.window
  w.unsafeWindow = w
  w.requestAnimationFrame = (fn) => setTimeout(() => fn(Date.now()), 0)
  w.localStorage.setItem('lsb_base:__core:rate', JSON.stringify(10))
  w.localStorage.setItem('lsb_base:__core:urlPoll', JSON.stringify(0))
  for (const [key, value] of Object.entries(preload)) w.localStorage.setItem(key, JSON.stringify(value))
  return { w, tick: (ms) => new Promise((resolve) => setTimeout(resolve, ms)) }
}

async function loadBase(w, ...plugins) {
  w.eval(baseCode)
  for (const code of plugins) w.eval(code)
  await new Promise((resolve) => setTimeout(resolve, 40))
}

async function bootProviders({ points = 500 } = {}) {
  const { w, tick } = makeDom(loggedInHome(points))
  w.fetch = async (url) => ({
    ok: true,
    status: 200,
    url: String(url),
    text: async () => '<html><body></body></html>',
  })
  await loadBase(w, PLUG('points-ledger.user.js'))
  return { w, tick }
}

test('积分提供者：保留序列 RPC 但不注册独立积分趋势入口', async () => {
  const { w } = await bootProviders()
  const series = await w.LSB.bus.request('points-ledger:series', { days: 90 })
  assert.ok(Array.isArray(series))
  w.LSB.open('points-ledger')
  const labels = [...w.document.querySelectorAll('.lsb-tabs .lsb-tab')].map((el) => el.textContent.trim())
  assert.equal(labels.includes('积分趋势'), true)
  assert.equal(w.document.querySelector('.lsb-panel .lsb-chart-host'), null)
  assert.match(w.document.querySelector('.lsb-panel')?.textContent || '', /自动快照间隔|保留天数/)
})

function fixture(name) {
  return readFileSync(new URL(`./fixtures/${name}`, import.meta.url), 'utf8')
}

function marketPage() {
  return `<html><body><div class="gacha-center-page"><section class="gacha-market-section"><h2>在售交易</h2><div class="gacha-market-grid"><article class="gacha-market-card"><div class="gacha-market-title"><span class="gacha-title-badge"><span class="gacha-title-name">蓝色火花</span><span class="gacha-title-rarity">SSR</span></span></div><div class="gacha-market-meta">剩余 <strong>10</strong> 个</div><form data-gacha-market-price="100"><input name="listing_id" value="market-1"><input name="quantity" max="10"></form></article></div></section></div></body></html>`
}

function marketPageWithPriceTiers() {
  const listing = (price, id, quantity) => `<article class="gacha-market-card"><div class="gacha-market-title"><span class="gacha-title-badge"><span class="gacha-title-name">蓝色火花</span><span class="gacha-title-rarity">SSR</span></span></div><div class="gacha-market-meta">剩余 <strong>${quantity}</strong> 个</div><form data-gacha-market-price="${price}"><input name="listing_id" value="${id}"><input name="quantity" max="${quantity}"></form></article>`
  return `<html><body><div class="gacha-center-page"><section class="gacha-market-section"><h2>在售交易</h2><div class="gacha-market-grid">${listing(100, 'market-1', 1)}${listing(120, 'market-2', 10)}</div></section></div></body></html>`
}

function fixtureDataWithPoints(points = 500) {
  return {
    recipes: [{
      id: 'ur-a',
      target: { key: '夜航灯塔@UR', name: '夜航灯塔', rarity: 'UR' },
      inputs: [{ key: '蓝色火花@SSR', name: '蓝色火花', rarity: 'SSR', qty: 2 }],
      fee: 100,
    }],
    market: {
      schema: 2,
      fetchedAt: 1_700_000_000_000,
      coverage: { complete: true, expectedPages: 1, fetchedPages: 1, failedPages: 0, challengePages: 0 },
      listings: [{ key: '蓝色火花@SSR', price: 100, qty: 10 }],
      titles: { '蓝色火花@SSR': { rarity: 'SSR', lo: 100, hi: 100, mid: 100, n: 10 } },
    },
    gachaPools: [{ id: 'pool-1', label: '测试池', drawCost: 120, probabilityComplete: true, outcomes: [{ key: '蓝色火花@SSR', probability: 1 }] }],
    inventory: { '蓝色火花@SSR': 1 },
    inventoryAvailable: true,
    titleCatalog: [{ name: '蓝色火花', rarity: 'SSR' }],
    points,
  }
}

async function bootWorkbench({ preload = {}, fetchGacha = fixture('gacha.html'), fetchMarket = marketPage(), points = 500, rankText = null } = {}) {
  const { w, tick } = makeDom(loggedInHome(points, rankText), 'https://linux.sb/', preload)
  const calls = []
  w.fetch = async (url, init = {}) => {
    const href = String(url)
    calls.push({ href, method: (init.method || 'GET').toUpperCase() })
    const path = new URL(href, 'https://linux.sb/').pathname
    const body = path === '/gacha_recipes' ? fixture('gacha-recipes.html')
      : path === '/gacha' ? fetchGacha
      : path === '/gacha_profile' ? fixture('gacha-profile.html')
      : path === '/gacha_market' ? fetchMarket
      : ''
    return { ok: true, status: 200, url: href, text: async () => body }
  }
  await loadBase(w,
    PLUG('points-ledger.user.js'),
    PLUG('title-quotes.user.js'),
    PLUG('title-forge-planner.user.js'),
    PLUG('points-title-workbench.user.js'),
  )
  const until = async (fn, ms = 2000) => {
    const end = Date.now() + ms
    while (Date.now() <= end) {
      if (fn()) return true
      await tick(20)
    }
    return false
  }
  return { w, calls, tick, until }
}

test('工作台：打开后默认总览并复用缓存，同时启动单飞刷新', async () => {
  const cached = {
    savedAt: 1_700_000_000_000,
    sources: { recipes: { status: 'stale' }, gacha: { status: 'stale' }, inventory: { status: 'stale' }, market: { status: 'stale' } },
    data: { ...fixtureDataWithPoints(500), plans: null },
    plans: null,
  }
  const { w, calls } = await bootWorkbench({ preload: { 'lsb_base:points-title-workbench:snapshot': cached } })
  const opening = w.LSB.bus.request('points-title-workbench:open')
  await new Promise((resolve) => setTimeout(resolve, 0))
  const root = w.document.querySelector('[data-points-title-workbench]')
  assert.ok(root)
  assert.match(root.querySelector('[data-workbench-view="overview"]').textContent, /总览|当前积分/)
  assert.equal(root.querySelector('[data-workbench-tab].is-active')?.dataset.workbenchTab, 'overview')
  const dbg = await w.LSB.bus.request('points-title-workbench:debug')
  const first = dbg.refresh()
  const second = dbg.refresh()
  assert.equal(first, second)
  await Promise.all([opening, first])
  assert.ok(calls.length > 0)
})

test('工作台：关闭窗口会取消进行中的刷新并忽略迟到结果', async () => {
  const { w, tick } = await bootWorkbench()
  const originalFetch = w.fetch
  w.fetch = async (url, init = {}) => {
    await tick(80)
    return originalFetch(url, init)
  }
  const opening = w.LSB.bus.request('points-title-workbench:open')
  await tick(0)
  const close = w.document.querySelector('[data-workbench-close]')
  assert.ok(close)
  close.click()
  await assert.rejects(opening, /刷新已取消/)
  await tick(100)
  const dbg = await w.LSB.bus.request('points-title-workbench:debug')
  assert.equal(dbg.state().calculatedAt, null)
  assert.equal(w.document.querySelector('[data-points-title-workbench]'), null)
})

test('工作台：行情失败时保留其他来源并停用行情依赖路线', async () => {
  const { w, until } = await bootWorkbench({ fetchGacha: '<html><body>Cloudflare challenge</body></html>' })
  await w.LSB.bus.request('points-title-workbench:open')
  assert.equal(await until(() => !w.document.querySelector('[data-workbench-source="gacha"].is-loading')), true)
  const root = w.document.querySelector('[data-points-title-workbench]')
  assert.match(root.querySelector('[data-workbench-source="gacha"]').textContent, /页面格式无法识别|无法确认库存数据|数据不足/)
  assert.ok(root.querySelector('[data-workbench-mode="no-inventory"]'))
  assert.equal(root.querySelector('[data-workbench-route="gacha"]')?.dataset.status, 'unavailable')
  const dbg = await w.LSB.bus.request('points-title-workbench:debug')
  assert.equal(dbg.state().sourceState.gacha.fetchedAt, null)
})

test('工作台：刷新不产生站内写请求', async () => {
  const { w, calls } = await bootWorkbench()
  await w.LSB.bus.request('points-title-workbench:open')
  await new Promise((resolve) => setTimeout(resolve, 80))
  assert.equal(calls.some((x) => x.method !== 'GET' || /_buy|_forge|draw|compose/i.test(x.href)), false)
})

test('工作台：标题栏拖动和右下角缩放后保存窗口矩形', async () => {
  const { w } = await bootWorkbench()
  await w.LSB.bus.request('points-title-workbench:open')
  const root = w.document.querySelector('[data-points-title-workbench]')
  const head = root.querySelector('.lsb-points-title-workbench-head')
  head.dispatchEvent(new w.MouseEvent('pointerdown', { bubbles: true, clientX: 50, clientY: 60 }))
  w.document.dispatchEvent(new w.MouseEvent('pointermove', { bubbles: true, clientX: 150, clientY: 160 }))
  w.document.dispatchEvent(new w.MouseEvent('pointerup', { bubbles: true, clientX: 150, clientY: 160 }))
  const resize = root.querySelector('.lsb-points-title-workbench-resize')
  resize.dispatchEvent(new w.MouseEvent('pointerdown', { bubbles: true, clientX: 860, clientY: 700 }))
  w.document.dispatchEvent(new w.MouseEvent('pointermove', { bubbles: true, clientX: 920, clientY: 760 }))
  w.document.dispatchEvent(new w.MouseEvent('pointerup', { bubbles: true, clientX: 920, clientY: 760 }))
  const dbg = await w.LSB.bus.request('points-title-workbench:debug')
  const state = dbg.state()
  assert.ok(state.rect.left >= 100)
  assert.ok(state.rect.width > 820)
  assert.deepEqual(JSON.parse(w.localStorage.getItem('lsb_base:points-title-workbench:rect')), JSON.parse(JSON.stringify(state.rect)))
})

test('工作台：合成表无法识别时显示固定错误文案', async () => {
  const { w, until } = await bootWorkbench({ fetchGacha: fixture('gacha.html') })
  const originalFetch = w.fetch
  w.fetch = async (url, init = {}) => {
    const href = String(url)
    if (/gacha_recipes/.test(href)) return { ok: true, status: 200, url: href, text: async () => '<html><body>空页面</body></html>' }
    return originalFetch(url, init)
  }
  await w.LSB.bus.request('points-title-workbench:open')
  assert.equal(await until(() => !w.document.querySelector('[data-workbench-source="recipes"].is-loading')), true)
  assert.match(w.document.querySelector('[data-points-title-workbench]').textContent, /页面格式无法识别|合成表数据不足/)
})

test('工作台：总览同时显示两种库存模式和三类路线', async () => {
  const { w, until } = await bootWorkbench()
  await w.LSB.bus.request('points-title-workbench:open')
  assert.equal(await until(() => w.document.querySelector('[data-workbench-route="market-low"]')), true)
  const root = w.document.querySelector('[data-points-title-workbench]')
  assert.ok(root.querySelector('[data-workbench-mode="no-inventory"]'))
  assert.ok(root.querySelector('[data-workbench-mode="inventory"]'))
  assert.ok(root.querySelector('[data-workbench-route="market-low"]'))
  assert.ok(root.querySelector('[data-workbench-route="market-median"]'))
  assert.ok(root.querySelector('[data-workbench-route="gacha"]'))
  assert.ok(root.querySelector('[data-workbench-route="market-low"] details'))
  assert.ok(root.querySelector('[data-workbench-route="gacha"] details'))
  assert.match(root.textContent, /期望值，不保证实际结果/)
})

test('工作台：窄屏矩形保持在视口内并使用单列规则', async () => {
  const { w } = await bootWorkbench()
  Object.defineProperty(w, 'innerWidth', { configurable: true, value: 360 })
  Object.defineProperty(w, 'innerHeight', { configurable: true, value: 640 })
  await w.LSB.bus.request('points-title-workbench:open')
  const root = w.document.querySelector('[data-points-title-workbench]')
  const styles = [...w.document.querySelectorAll('style')].map((node) => node.textContent).join('\n')
  assert.match(styles, /max-width|grid-template-columns|@media/)
  const dbg = await w.LSB.bus.request('points-title-workbench:debug')
  const rect = dbg.state().rect
  assert.ok(rect.left >= 0 && rect.top >= 0)
  assert.ok(rect.left + rect.width <= 360)
  assert.ok(rect.top + rect.height <= 640)
  assert.ok(root.querySelector('[data-workbench-tab="overview"].is-active'))
})

test('工作台：同种材料多档挂单合并为一条步骤并显示合计', async () => {
  const { w } = await bootWorkbench({ fetchMarket: marketPageWithPriceTiers() })
  await w.LSB.bus.request('points-title-workbench:open')
  const target = [...w.document.querySelectorAll('[data-workbench-target]')]
    .find((item) => item.querySelector('h4')?.textContent.includes('夜航灯塔'))
  const details = target?.querySelector('[data-workbench-route="market-low"] details')
  assert.ok(details)
  details.open = true
  const materialRows = [...details.querySelectorAll('li')]
    .filter((item) => item.textContent.includes('蓝色火花@SSR'))
  assert.equal(materialRows.length, 1)
  assert.match(materialRows[0].textContent, /1 个 × 100 \+ 1 个 × 120/)
  assert.match(materialRows[0].textContent, /合计 2 个，220 积分/)
})

test('工作台：积分视图复用序列绘制趋势和最近变化', async () => {
  const { w } = await bootWorkbench()
  const ledger = await w.LSB.bus.request('points-ledger:debug')
  ledger.reset()
  const now = Date.now()
  ledger.add(now - 2 * 864e5, 4100)
  ledger.add(now - 864e5, 4120)
  ledger.add(now, 4138)
  await w.LSB.bus.request('points-title-workbench:open')
  w.document.querySelector('[data-workbench-tab="points"]').click()
  await new Promise((resolve) => setTimeout(resolve, 40))
  const view = w.document.querySelector('[data-workbench-view="points"]')
  assert.ok(view.querySelector('.lsb-points-title-workbench-chart polyline'))
  assert.match(view.textContent, /\+20/)
  assert.match(view.textContent, /\+18/)
})

test('工作台：行情刷新失败后结束加载并保留其他来源', async () => {
  const { w, until } = await bootWorkbench({ fetchMarket: '<html><body>Cloudflare challenge</body></html>' })
  await w.LSB.bus.request('points-title-workbench:open')
  assert.equal(await until(() => !w.document.querySelector('[data-workbench-source="market"].is-loading')), true)
  const root = w.document.querySelector('[data-points-title-workbench]')
  assert.match(root.querySelector('[data-workbench-source="market"]').textContent, /行情|数据不足|页面格式无法识别/)
  assert.doesNotMatch(root.querySelector('[data-workbench-source="recipes"]').textContent, /读取中/)
  assert.doesNotMatch(root.textContent, /行情样本0/)
})

test('工作台：收起只保留标题栏并可重新展开', async () => {
  const { w } = await bootWorkbench()
  await w.LSB.bus.request('points-title-workbench:open')
  const root = w.document.querySelector('[data-points-title-workbench]')
  const collapse = root.querySelector('[data-workbench-collapse]')
  assert.ok(collapse)
  collapse.click()
  assert.equal(root.classList.contains('is-collapsed'), true)
  assert.match(root.querySelector('[data-workbench-collapse]').textContent, /展开/)
  root.querySelector('[data-workbench-collapse]').click()
  assert.equal(root.classList.contains('is-collapsed'), false)
  assert.match(root.querySelector('[data-workbench-collapse]').textContent, /收起/)
})

test('工作台：行情视图显示覆盖、最低挂单和中位价估算', async () => {
  const { w } = await bootWorkbench()
  await w.LSB.bus.request('points-title-workbench:open')
  w.document.querySelector('[data-workbench-tab="market"]').click()
  const view = w.document.querySelector('[data-workbench-view="market"]')
  assert.match(view.textContent, /完整 1\/1 页/)
  assert.match(view.textContent, /最低挂单 100/)
  assert.match(view.textContent, /中位价估算 100/)
})

test('工作台：等级数字不冒充解析失败的积分值', async () => {
  const { w } = await bootWorkbench({ rankText: '普通用户 Lv. 3' })
  await w.LSB.bus.request('points-title-workbench:open')
  const dbg = await w.LSB.bus.request('points-title-workbench:debug')
  assert.equal(dbg.state().data.points, null)
  assert.match(w.document.querySelector('[data-points-title-workbench]').textContent, /当前积分未知/)
})

test('工作台：真实零积分仍显示为零', async () => {
  const { w } = await bootWorkbench({ rankText: '普通用户 · 0' })
  await w.LSB.bus.request('points-title-workbench:open')
  const dbg = await w.LSB.bus.request('points-title-workbench:debug')
  assert.equal(dbg.state().data.points, 0)
  assert.match(w.document.querySelector('[data-points-title-workbench]').textContent, /当前积分0/)
})

test('工作台：缺失积分显示未知而不是零', async () => {
  const { w } = await bootWorkbench({ points: null })
  await w.LSB.bus.request('points-title-workbench:open')
  const dbg = await w.LSB.bus.request('points-title-workbench:debug')
  assert.equal(dbg.state().data.points, null)
  assert.match(w.document.querySelector('[data-points-title-workbench]').textContent, /当前积分未知/)
})
