import { test } from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { JSDOM } from 'jsdom'

const baseCode = readFileSync(new URL('../dist/linuxsb-base.user.js', import.meta.url), 'utf8')
const PLUG = (name) => readFileSync(new URL(`../plugins/${name}`, import.meta.url), 'utf8')

function makeDom(html, url, preload = {}) {
  const dom = new JSDOM(html, { url, runScripts: 'outside-only' })
  const w = dom.window
  w.unsafeWindow = w
  w.requestAnimationFrame = (fn) => setTimeout(() => fn(Date.now()), 0)
  w.localStorage.setItem('lsb_base:__core:rate', JSON.stringify(10))
  w.localStorage.setItem('lsb_base:__core:urlPoll', JSON.stringify(0))
  for (const [k, v] of Object.entries(preload)) w.localStorage.setItem(k, JSON.stringify(v))
  return { w, tick: (ms) => new Promise((resolve) => setTimeout(resolve, ms)) }
}

async function loadBase(w, ...plugins) {
  w.eval(baseCode)
  for (const code of plugins) w.eval(code)
  await new Promise((resolve) => setTimeout(resolve, 40))
}

function fixture(name) {
  return readFileSync(new URL(`./fixtures/${name}`, import.meta.url), 'utf8')
}

function plain(value) {
  return JSON.parse(JSON.stringify(value))
}

function loggedInHome(points) {
  return `<html><body>
    <a href="/user/42">我的主页</a><a href="/profile">个人设置</a>
    <aside class="sidebar-card user-card">
      <a class="user-name" href="/user/42">测试用户</a>
      <span class="user-rank">普通用户 · ${points}</span>
    </aside>
  </body></html>`
}

function fixtureDataWithPoints(points, inventory = { '蓝色火花@SSR': 1, '旧齿轮@SR': 4 }) {
  return {
    recipes: [
      {
        id: 'ur-a',
        target: { key: '夜航灯塔@UR', name: '夜航灯塔', rarity: 'UR' },
        inputs: [
          { key: '蓝色火花@SSR', name: '蓝色火花', rarity: 'SSR', qty: 2 },
          { key: '旧齿轮@SR', name: '旧齿轮', rarity: 'SR', qty: 3 },
        ],
        fee: 100,
      },
      {
        id: 'ur-b',
        target: { key: '深空回声@UR', name: '深空回声', rarity: 'UR' },
        inputs: [{ key: '蓝色火花@SSR', name: '蓝色火花', rarity: 'SSR', qty: 4 }],
        fee: 80,
      },
    ],
    market: {
      fetchedAt: 1_700_000_000_000,
      listings: [
        { key: '蓝色火花@SSR', price: 100, qty: 10 },
        { key: '旧齿轮@SR', price: 50, qty: 10 },
      ],
      titles: {
        '蓝色火花@SSR': { rarity: 'SSR', lo: 100, mid: 100, n: 10 },
        '旧齿轮@SR': { rarity: 'SR', lo: 50, mid: 50, n: 10 },
      },
    },
    gachaPools: [{
      id: 'pool-1', label: '测试池', drawCost: 120,
      outcomes: [
        { key: '蓝色火花@SSR', probability: 0.5 },
        { key: '旧齿轮@SR', probability: 0.25 },
        { key: '其它@N', probability: 0.25 },
      ],
    }],
    inventory,
    points,
  }
}

async function bootPlanner({
  points = 500,
  fetchRecipes = fixture('gacha-recipes.html'),
  fetchGacha = fixture('gacha.html'),
  fetchProfile = fixture('gacha-profile.html'),
} = {}) {
  const { w, tick } = makeDom(loggedInHome(points), 'https://linux.sb/', {})
  const calls = []
  w.fetch = async (url, init = {}) => {
    const href = String(url)
    calls.push({ href, method: (init.method || 'GET').toUpperCase() })
    const path = new URL(href, 'https://linux.sb/').pathname
    const body = path === '/gacha_recipes' ? fetchRecipes : path === '/gacha' ? fetchGacha : path === '/gacha_profile' ? fetchProfile : ''
    return { status: 200, ok: true, url: href, text: async () => body }
  }
  await loadBase(w, PLUG('title-quotes.user.js'), PLUG('title-forge-planner.user.js'))
  const dbg = await w.LSB.bus.request('title-forge-planner:debug')
  const until = async (fn, ms = 2000) => {
    const end = Date.now() + ms
    while (Date.now() <= end) {
      if (fn()) return true
      await tick(20)
    }
    return false
  }
  return { w, tick, calls, dbg, until }
}

test('UR 规划器：解析 UR 配方、抽取池和称号库存', async () => {
  const { dbg } = await bootPlanner()
  const recipes = dbg.parseRecipes(fixture('gacha-recipes.html'))
  const gacha = dbg.parseGacha(fixture('gacha.html'))
  const profile = dbg.parseInventory(fixture('gacha-profile.html'))

  assert.deepEqual(plain(recipes.recipes[0].inputs), [
    { key: '蓝色火花@SSR', name: '蓝色火花', rarity: 'SSR', qty: 2 },
    { key: '旧齿轮@SR', name: '旧齿轮', rarity: 'SR', qty: 3 },
  ])
  assert.equal(recipes.recipes[0].target.key, '夜航灯塔@UR')
  assert.equal(recipes.recipes[0].fee, 100)
  assert.equal(gacha.pools[0].outcomes[0].probability, 0.5)
  assert.deepEqual(plain(profile.inventory), { '蓝色火花@SSR': 1, '旧齿轮@SR': 4 })
  assert.deepEqual(plain(recipes.issues), [])
  assert.deepEqual(plain(gacha.issues), [])
  assert.deepEqual(plain(profile.issues), [])
})

test('UR 规划器：最低挂单按数量逐单取货，库存先抵扣', async () => {
  const { dbg } = await bootPlanner()
  const req = [{ key: '蓝色火花@SSR', name: '蓝色火花', rarity: 'SSR', qty: 4 }]
  const listings = [
    { key: '蓝色火花@SSR', price: 10, qty: 1 },
    { key: '蓝色火花@SSR', price: 15, qty: 3 },
    { key: '蓝色火花@SSR', price: 99, qty: 4 },
  ]
  const low = dbg.marketCost(req, listings, 100)
  assert.equal(low.status, 'ok')
  assert.equal(low.cost, 155)
  assert.deepEqual(plain(low.steps.filter((s) => s.kind === 'market')), [
    { kind: 'market', key: '蓝色火花@SSR', price: 10, qty: 1, cost: 10 },
    { kind: 'market', key: '蓝色火花@SSR', price: 15, qty: 3, cost: 45 },
  ])
  assert.deepEqual(plain(dbg.missingInputs(req, { '蓝色火花@SSR': 1 })), [
    { key: '蓝色火花@SSR', name: '蓝色火花', rarity: 'SSR', qty: 3 },
  ])
})

test('UR 规划器：挂单不足或中位价缺失时路线不可用', async () => {
  const { dbg } = await bootPlanner()
  const req = [{ key: '缺货称号@SR', name: '缺货称号', rarity: 'SR', qty: 2 }]
  assert.equal(dbg.marketCost(req, [{ key: '缺货称号@SR', price: 20, qty: 1 }], 0).status, 'unavailable')
  assert.equal(dbg.medianCost(req, {}, 0).status, 'unavailable')
})

test('UR 规划器：下级配方可展开且循环不覆盖直接市场路线', async () => {
  const { dbg } = await bootPlanner()
  const root = {
    id: 'ur-root',
    target: { key: '终极@UR', name: '终极', rarity: 'UR' },
    inputs: [{ key: '中间@SR', name: '中间', rarity: 'SR', qty: 1 }],
    fee: 100,
  }
  const child = {
    id: 'sr-child',
    target: { key: '中间@SR', name: '中间', rarity: 'SR' },
    inputs: [{ key: '基础@N', name: '基础', rarity: 'N', qty: 2 }],
    fee: 20,
  }
  const expanded = dbg.expandRequirements(root, [root, child], {}, new Set())
  assert.deepEqual(plain(expanded.requirements), [{ key: '基础@N', name: '基础', rarity: 'N', qty: 2 }])
  assert.equal(expanded.fee, 120)

  const cycle = {
    ...child,
    inputs: [{ key: '中间@SR', name: '中间', rarity: 'SR', qty: 1 }],
  }
  const result = dbg.planMarket({
    recipes: [root, cycle],
    market: {
      listings: [{ key: '中间@SR', price: 30, qty: 1 }],
      titles: { '中间@SR': { rarity: 'SR', mid: 30 } },
    },
    inventory: {},
    points: 500,
  })
  assert.equal(result[0].route.status, 'ok')
  assert.equal(result[0].route.cost, 130)
  assert.equal(result[0].route.reason, 'market-low')
})

test('UR 规划器：结构化字段缺失时使用配方和概率的可见文字', async () => {
  const { dbg } = await bootPlanner()
  const recipes = dbg.parseRecipes(`<section data-gacha-recipes>
    <article data-gacha-recipe data-recipe-id="fallback">
      <h3>夜航灯塔 UR</h3>
      <p>费用 100</p>
      <div data-gacha-material>蓝色火花 SSR ×2</div>
    </article>
  </section>`)
  const gacha = dbg.parseGacha(`<section data-gacha-pool data-pool-label="SSR 池">
    抽取 120
    <div data-gacha-outcome>蓝色火花 SSR 50%</div>
    <div data-gacha-outcome>其它 N 50%</div>
  </section>`)

  assert.equal(recipes.recipes[0].target.key, '夜航灯塔@UR')
  assert.equal(recipes.recipes[0].fee, 100)
  assert.equal(gacha.pools[0].drawCost, 120)
  assert.equal(gacha.pools[0].outcomes[0].probability, 0.5)
})

test('UR 规划器：不完整页面和非 UR 数据进入 issues 而不是零值成功', async () => {
  const { dbg } = await bootPlanner()
  const recipes = dbg.parseRecipes(`<section data-gacha-recipes>
    <article data-gacha-recipe data-recipe-id="sr" data-target-name="普通称号" data-target-rarity="SR" data-fee="10">
      <div data-gacha-material data-name="材料" data-rarity="N" data-qty="1">材料 N ×1</div>
    </article>
    <article data-gacha-recipe data-recipe-id="bad" data-target-name="缺费" data-target-rarity="UR">
      <div data-gacha-material data-name="材料" data-rarity="N" data-qty="1">材料 N ×1</div>
    </article>
  </section>`)
  const gacha = dbg.parseGacha(`<section data-gacha-pool data-pool-id="bad" data-draw-cost="0">
    <div data-gacha-outcome data-name="材料" data-rarity="N" data-probability="1">材料 N</div>
  </section>`)
  const profile = dbg.parseInventory('<html><body><h1>登录</h1></body></html>')

  assert.deepEqual(plain(recipes.recipes), [])
  assert.equal(recipes.issues.length, 1)
  assert.deepEqual(plain(gacha.pools), [])
  assert.ok(gacha.issues.length >= 1)
  assert.deepEqual(plain(profile.inventory), {})
  assert.ok(profile.issues.length >= 1)
})
