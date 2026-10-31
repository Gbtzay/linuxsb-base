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
  market = fixtureDataWithPoints(points).market,
  fetchRecipes = fixture('gacha-recipes.html'),
  fetchGacha = fixture('gacha.html'),
  fetchProfile = fixture('gacha-profile.html'),
} = {}) {
  const { w, tick } = makeDom(loggedInHome(points), 'https://linux.sb/', {
    'lsb_base:title-quotes:market': market,
  })
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

function forgePageHtml() {
  return `<html><body>
    <main class="gacha-forge-page" data-gacha-forge-page>
      <form class="gacha-forge-form" action="/gacha_forge">
        <div class="gacha-forge-select" data-gacha-forge-title-id="ssr-1" data-name="传说之龙" data-rarity="SSR">
          <label><input type="checkbox" data-gacha-forge-rarity="SSR" data-gacha-forge-quantity="3" value="ssr-1">传说之龙 SSR</label>
          <input type="number" data-gacha-forge-material-input data-gacha-forge-material-rarity="SSR" min="1" max="3" value="3">
        </div>
        <div class="gacha-forge-select" data-gacha-forge-title-id="sr-1" data-name="万人迷" data-rarity="SR">
          <label><input type="checkbox" data-gacha-forge-rarity="SR" data-gacha-forge-quantity="2" value="sr-1">万人迷 SR</label>
          <input type="number" data-gacha-forge-material-input data-gacha-forge-material-rarity="SR" min="1" max="2" value="2">
        </div>
        <button type="submit" data-gacha-forge-button="SR">熔炼</button>
      </form>
    </main>
  </body></html>`
}

async function bootForge({ preload = {}, html = forgePageHtml() } = {}) {
  const { w, tick } = makeDom(html, 'https://linux.sb/gacha_forge_center', preload)
  w.fetch = async (url) => {
    const path = new URL(String(url), 'https://linux.sb/').pathname
    const body = path === '/gacha_recipes' ? fixture('gacha-recipes.html') : path === '/gacha' ? fixture('gacha.html') : path === '/gacha_profile' ? fixture('gacha-profile.html') : ''
    return { status: 200, ok: true, url: String(url), text: async () => body }
  }
  await loadBase(w, PLUG('title-quotes.user.js'), PLUG('title-forge-planner.user.js'))
  const dbg = await w.LSB.bus.request('title-forge-planner:debug')
  return { w, tick, dbg }
}

test('UR 规划器：保留正式 RPC，不注册独立 UI 页签', async () => {
  const { w, tick } = await bootPlanner()
  w.LSB.open('title-forge-planner')
  await tick(10)
  assert.equal(
    [...w.document.querySelectorAll('.lsb-tabs .lsb-tab')].some((tab) => /UR 合成规划/.test(tab.textContent || '')),
    false,
  )
  assert.equal(w.document.querySelector('[data-title-forge-planner]'), null)
  assert.equal(await w.LSB.bus.hasHandler('title-forge-planner:refresh'), true)
  assert.equal(await w.LSB.bus.hasHandler('title-forge-planner:calculate'), true)
})

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

test('UR 规划器：抽取路线处理重复结果并计算共享奖池期望值', async () => {
  const { dbg } = await bootPlanner()
  const req = [
    { key: '蓝色火花@SSR', name: '蓝色火花', rarity: 'SSR', qty: 1 },
    { key: '旧齿轮@SR', name: '旧齿轮', rarity: 'SR', qty: 1 },
  ]
  const pool = {
    id: 'pool-1', label: '测试池', drawCost: 100,
    outcomes: [
      { key: '蓝色火花@SSR', probability: 0.5 },
      { key: '旧齿轮@SR', probability: 0.25 },
      { key: '其它@N', probability: 0.25 },
    ],
  }
  const plan = dbg.expectedGachaCost(req, [pool], 0)
  assert.equal(plan.status, 'ok')
  assert.equal(plan.expected, true)
  assert.equal(plan.expectedDraws, 4.666666666666667)
  assert.equal(plan.cost, 466.6666666666667)
})

test('UR 规划器：有积分足够的方案时优先返回可行最低路线，否则返回最小缺口', async () => {
  const { dbg } = await bootPlanner()
  const input = fixtureDataWithPoints(500)
  const result = dbg.calculatePlans(input)
  assert.equal(result.modes.noInventory.summary.state, 'feasible')
  assert.equal(result.modes.noInventory.summary.bestFeasible.target.key, '夜航灯塔@UR')
  assert.equal(result.modes.inventory.summary.state, 'feasible')
  assert.ok(result.modes.inventory.summary.bestFeasible.route.cost < result.modes.noInventory.summary.bestFeasible.route.cost)

  const short = dbg.calculatePlans(fixtureDataWithPoints(1))
  assert.equal(short.modes.noInventory.summary.state, 'insufficient')
  assert.ok(short.modes.noInventory.summary.nearest.shortfall > 0)
})

test('UR 规划器：大配方抽取期望值以有界近似计算', async () => {
  const { dbg } = await bootPlanner()
  const required = [
    ['传说之龙', 'SSR', 20],
    ['全站偶像', 'SSR', 100],
    ['富可敌国', 'SSR', 5],
    ['欧皇', 'SSR', 20],
    ['氪金大佬', 'SSR', 100],
    ['管理员之友', 'SSR', 20],
    ['隐藏大佬', 'SSR', 20],
    ['路人甲', 'N', 1],
  ].map(([name, rarity, qty]) => ({ key: `${name}@${rarity}`, name, rarity, qty }))
  const outcomes = required.map((item) => ({
    key: item.key,
    probability: item.rarity === 'SSR' ? 0.01 / 7 : 0.53 / 5,
  }))
  outcomes.push(
    ...Array.from({ length: 5 }, (_, i) => ({ key: `其它SR${i}@SR`, probability: 0.16 / 5 })),
    ...Array.from({ length: 6 }, (_, i) => ({ key: `其它R${i}@R`, probability: 0.30 / 6 })),
    ...Array.from({ length: 4 }, (_, i) => ({ key: `其它N${i}@N`, probability: 0.53 / 5 })),
  )
  const plan = dbg.expectedGachaCost(required, [{
    id: 'standard',
    label: '标准抽取',
    drawCost: 8,
    outcomes,
    probabilityComplete: true,
  }], 0)
  assert.equal(plan.status, 'ok')
  assert.equal(plan.approximate, true)
  assert.ok(plan.expectedDraws > 0)
  assert.equal(plan.expectedCost, plan.expectedDraws * 8)
  const calculated = dbg.calculatePlans({
    recipes: [{ id: 'large-ur', target: { key: '大型@UR', name: '大型', rarity: 'UR' }, inputs: required, fee: 0 }],
    market: {},
    gachaPools: [{ id: 'standard', label: '标准抽取', drawCost: 8, outcomes, probabilityComplete: true }],
  })
  assert.equal(calculated.modes.noInventory.targets[0].routes.gacha.approximate, true)
})

test('UR 规划器：真实大盘三张 UR 配方可完成面板计算', async () => {
  const { dbg } = await bootPlanner()
  const names = [
    ['传说之龙', 'SSR'], ['全站偶像', 'SSR'], ['富可敌国', 'SSR'], ['欧皇', 'SSR'],
    ['氪金大佬', 'SSR'], ['管理员之友', 'SSR'], ['隐藏大佬', 'SSR'], ['路人甲', 'N'],
    ['反贼', 'R'],
  ]
  const probabilityByRarity = { SSR: 0.01 / 7, SR: 0.16 / 5, R: 0.30 / 6, N: 0.53 / 5 }
  const outcomes = names.map(([name, rarity]) => ({ key: `${name}@${rarity}`, probability: probabilityByRarity[rarity] }))
  outcomes.push(
    ...[['萌新', 'N'], ['潜水员', 'N'], ['吃瓜群众', 'N'], ['打酱油的', 'N']].map(([name, rarity]) => ({ key: `${name}@${rarity}`, probability: probabilityByRarity[rarity] })),
    ...[['常客', 'R'], ['话题王', 'R'], ['回复达人', 'R'], ['夜猫子', 'R'], ['表情包大户', 'R']].map(([name, rarity]) => ({ key: `${name}@${rarity}`, probability: probabilityByRarity[rarity] })),
    ...[['论坛之星', 'SR'], ['万人迷', 'SR'], ['键盘侠', 'SR'], ['精华收割机', 'SR'], ['社交达人', 'SR']].map(([name, rarity]) => ({ key: `${name}@${rarity}`, probability: probabilityByRarity[rarity] })),
  )
  const recipes = [
    [['传说之龙', 1], ['全站偶像', 1], ['富可敌国', 1], ['欧皇', 1], ['氪金大佬', 1], ['管理员之友', 1], ['隐藏大佬', 1], ['路人甲', 100]],
    [['传说之龙', 1], ['全站偶像', 10], ['富可敌国', 1], ['欧皇', 1], ['氪金大佬', 10], ['管理员之友', 1], ['隐藏大佬', 1], ['反贼', 1]],
    [['传说之龙', 20], ['全站偶像', 100], ['富可敌国', 5], ['欧皇', 20], ['氪金大佬', 100], ['管理员之友', 20], ['隐藏大佬', 20], ['反贼', 1]],
  ].map((materials, index) => ({
    id: String(index + 3),
    target: { key: `目标${index}@UR`, name: `目标${index}`, rarity: 'UR' },
    inputs: materials.map(([name, qty]) => {
      const rarity = name === '路人甲' ? 'N' : name === '反贼' ? 'R' : 'SSR'
      return { key: `${name}@${rarity}`, name, rarity, qty }
    }),
    fee: 0,
  }))
  assert.doesNotThrow(() => dbg.calculatePlans({
    recipes,
    market: { listings: [], titles: {} },
    gachaPools: [{ id: 'standard', label: '标准抽取', drawCost: 8, outcomes, probabilityComplete: true }],
    inventory: {},
    points: 1364,
  }))
})

test('UR 规划器：不完整抽取概率不产生期望路线', async () => {
  const { dbg } = await bootPlanner()
  const plan = dbg.expectedGachaCost(
    [{ key: '蓝色火花@SSR', name: '蓝色火花', rarity: 'SSR', qty: 1 }],
    [{ id: 'bad', drawCost: 100, outcomes: [{ key: '蓝色火花@SSR', probability: 0.2 }] }],
    0,
  )
  assert.equal(plan.status, 'unavailable')
  assert.equal(plan.reason, 'probability-incomplete')
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

test('UR 规划器：兼容站点真实的配方、抽取和库存页面结构', async () => {
  const { dbg } = await bootPlanner()
  const recipes = dbg.parseRecipes(`<div class="gacha-center-page">
    <section class="gacha-recipe-panel"><div class="gacha-recipe-grid">
      <article class="gacha-recipe-card">
        <div class="gacha-recipe-target">
          <span class="gacha-title-badge gacha-title-ur"><span class="gacha-title-icon">🎲</span><span class="gacha-title-name">非必要不抽奖</span><span class="gacha-title-rarity">UR</span></span>
          <strong>路人甲逆袭</strong>
        </div>
        <div class="gacha-recipe-materials">
          <span class="is-missing">传说之龙 0/1</span><span class="is-missing">路人甲 0/100</span>
        </div>
        <form action="/gacha_recipe_craft"><input name="recipe_id" value="3"></form>
      </article>
    </div></section>
  </div>`)
  const gacha = dbg.parseGacha(`<div class="gacha-center-page">
    <div class="gacha-pool-section"><div class="gacha-pool-grid">
      <div class="gacha-pool-rarity gacha-pool-rarity-ssr"><div class="gacha-pool-rarity-label">SSR</div><div class="gacha-pool-rarity-count">7 种</div><div class="gacha-pool-rarity-rate">1%</div></div>
      <div class="gacha-pool-rarity gacha-pool-rarity-n"><div class="gacha-pool-rarity-label">N</div><div class="gacha-pool-rarity-count">5 种</div><div class="gacha-pool-rarity-rate">53%</div></div>
    </div></div>
    <button class="gacha-pull-btn gacha-pull-10" data-cost="90">十连抽 (90 积分)</button>
    <button class="gacha-pull-btn gacha-pull-100" data-cost="800">百连抽 (800 积分)</button>
    <div class="gacha-all-titles"><div class="gacha-all-item"><span class="gacha-title-badge gacha-title-ssr"><span class="gacha-title-name">传说之龙</span><span class="gacha-title-rarity">SSR</span></span></div><div class="gacha-all-item"><span class="gacha-title-badge gacha-title-n"><span class="gacha-title-name">路人甲</span><span class="gacha-title-rarity">N</span></span></div></div>
  </div>`)
  const profile = dbg.parseInventory(`<div class="gacha-profile-page"><div class="gacha-profile-titles"><div class="gacha-profile-grid">
    <div class="gacha-profile-item"><span class="gacha-title-name">万人迷</span><span class="gacha-title-rarity">SR</span><span class="gacha-status-tag">× 7</span></div>
    <div class="gacha-profile-item"><span class="gacha-title-name">常客</span><span class="gacha-title-rarity">R</span><span class="gacha-status-tag">× 1</span></div>
  </div></div></div>`)

  assert.equal(recipes.recipes.length, 1)
  assert.equal(recipes.recipes[0].id, '3')
  assert.equal(recipes.recipes[0].target.key, '非必要不抽奖@UR')
  assert.deepEqual(plain(recipes.recipes[0].inputs), [
    { key: '传说之龙@', name: '传说之龙', rarity: '', qty: 1 },
    { key: '路人甲@', name: '路人甲', rarity: '', qty: 100 },
  ])
  const normalized = dbg.resolveRecipeRarities(recipes.recipes, gacha.titleCatalog)
  assert.deepEqual(plain(normalized[0].inputs), [
    { key: '传说之龙@SSR', name: '传说之龙', rarity: 'SSR', qty: 1 },
    { key: '路人甲@N', name: '路人甲', rarity: 'N', qty: 100 },
  ])
  assert.equal(recipes.recipes[0].fee, 0)
  assert.equal(gacha.pools.length, 1)
  assert.equal(gacha.pools[0].drawCost, 8)
  assert.equal(gacha.pools[0].outcomes.find((item) => item.key === '传说之龙@SSR').probability, 0.01 / 7)
  assert.deepEqual(plain(profile.inventory), { '万人迷@SR': 7, '常客@R': 1 })
  assert.equal(profile.recognized, true)
})

test('UR 规划器：真实来源加载后不再显示格式、库存或合成表错误', async () => {
  const actualRecipes = `<div class="gacha-recipe-card"><div class="gacha-recipe-target"><span class="gacha-title-badge gacha-title-ur"><span class="gacha-title-name">非必要不抽奖</span><span class="gacha-title-rarity">UR</span></span><strong>路人甲逆袭</strong></div><div class="gacha-recipe-materials"><span>传说之龙 0/1</span><span>路人甲 0/100</span></div><form action="/gacha_recipe_craft"><input name="recipe_id" value="3"></form></div>`
  const actualGacha = `<div class="gacha-pool-section"><div class="gacha-pool-grid">
    <div class="gacha-pool-rarity"><div class="gacha-pool-rarity-label">SSR</div><div class="gacha-pool-rarity-count">7 种</div><div class="gacha-pool-rarity-rate">1%</div></div>
    <div class="gacha-pool-rarity"><div class="gacha-pool-rarity-label">SR</div><div class="gacha-pool-rarity-count">5 种</div><div class="gacha-pool-rarity-rate">16%</div></div>
    <div class="gacha-pool-rarity"><div class="gacha-pool-rarity-label">R</div><div class="gacha-pool-rarity-count">6 种</div><div class="gacha-pool-rarity-rate">30%</div></div>
    <div class="gacha-pool-rarity"><div class="gacha-pool-rarity-label">N</div><div class="gacha-pool-rarity-count">5 种</div><div class="gacha-pool-rarity-rate">53%</div></div>
  </div></div><button class="gacha-pull-btn gacha-pull-100" data-cost="800">百连抽</button><div class="gacha-all-item"><span class="gacha-title-name">传说之龙</span><span class="gacha-title-rarity">SSR</span></div><div class="gacha-all-item"><span class="gacha-title-name">万人迷</span><span class="gacha-title-rarity">SR</span></div><div class="gacha-all-item"><span class="gacha-title-name">常客</span><span class="gacha-title-rarity">R</span></div><div class="gacha-all-item"><span class="gacha-title-name">路人甲</span><span class="gacha-title-rarity">N</span></div>`
  const actualProfile = `<div class="gacha-profile-page"><div class="gacha-profile-item"><div class="gacha-profile-badge"><span class="gacha-title-badge"><span class="gacha-title-name">万人迷</span><span class="gacha-title-rarity">SR</span></span></div><div class="gacha-profile-meta"><span class="gacha-status-tag">× 7</span></div></div></div>`
  const { w, dbg } = await bootPlanner({ fetchRecipes: actualRecipes, fetchGacha: actualGacha, fetchProfile: actualProfile })
  await w.LSB.bus.request('title-forge-planner:refresh')
  const state = dbg.state()
  assert.notEqual(state.sourceState.recipes.status, 'unavailable')
  assert.notEqual(state.sourceState.gacha.status, 'unavailable')
  assert.notEqual(state.sourceState.inventory.status, 'unavailable')
  assert.equal(state.data.inventoryAvailable, true)
  assert.equal(state.data.recipes[0].inputs[0].key, '传说之龙@SSR')
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

test('UR 规划器：市场挂单不足时保留具体材料缺口', async () => {
  const { dbg } = await bootPlanner()
  const req = [{ key: '隐藏大佬@SSR', name: '隐藏大佬', rarity: 'SSR', qty: 20 }]
  const low = dbg.marketCost(req, [{ key: '隐藏大佬@SSR', price: 4588, qty: 10 }], 0)
  assert.equal(low.status, 'unavailable')
  assert.equal(low.reason, 'market-insufficient')
  assert.deepEqual(plain(low.missing), [{ key: '隐藏大佬@SSR', name: '隐藏大佬', rarity: 'SSR', qty: 10 }])
})

test('UR 规划器：正式刷新接口返回来源状态和规范化数据', async () => {
  const { w } = await bootPlanner({ points: 500 })
  const result = await w.LSB.bus.request('title-forge-planner:refresh')
  assert.deepEqual(Object.keys(result.sources).sort(), ['gacha', 'inventory', 'recipes'])
  assert.equal(result.sources.recipes.status, 'ok')
  assert.equal(result.sources.gacha.status, 'ok')
  assert.equal(result.sources.inventory.status, 'ok')
  assert.ok(result.data.recipes.length > 0)
  assert.ok(result.data.gachaPools.length > 0)
  assert.equal(result.data.inventoryAvailable, true)
})

test('UR 规划器：正式计算接口不发起网络请求', async () => {
  const { w, calls } = await bootPlanner({ points: 500 })
  const before = calls.length
  const result = await w.LSB.bus.request('title-forge-planner:calculate', fixtureDataWithPoints(500))
  assert.equal(calls.length, before)
  assert.equal(result.modes.noInventory.summary.state, 'feasible')
  assert.equal(result.modes.inventory.summary.state, 'feasible')
})

test('UR 规划器：来源失败时只标记受影响来源且不产生空成功数据', async () => {
  const { w } = await bootPlanner({ fetchGacha: '<html><body>Cloudflare challenge</body></html>' })
  const result = await w.LSB.bus.request('title-forge-planner:refresh')
  assert.notEqual(result.sources.recipes.status, 'unavailable')
  assert.equal(result.sources.gacha.status, 'unavailable')
  assert.equal(result.data.gachaPools.length, 0)
  assert.match(result.sources.gacha.error, /页面格式无法识别|挑战未完成|数据不足/)
})

test('称号熔炼页：一键全选材料时排除 SSR，并保存选择和排除称号', async () => {
  const { w, dbg } = await bootForge()
  const controls = w.document.querySelector('[data-lsb-forge-controls]')
  assert.ok(controls)
  const exclude = controls.querySelector('[data-lsb-forge-exclude-ssr]')
  const selectAll = controls.querySelector('[data-lsb-forge-select-all]')
  assert.ok(exclude)
  assert.ok(selectAll)
  const forgeStyle = w.document.querySelector('#lsb-title-forge-planner-forge-style')
  assert.ok(forgeStyle)
  assert.match(forgeStyle.textContent, /background:var\(--panel,var\(--bg,#fafafa\)\)/)
  assert.doesNotMatch(forgeStyle.textContent, /var\(--card,#fff\)/)

  exclude.click()
  selectAll.click()

  const boxes = [...w.document.querySelectorAll('[data-gacha-forge-rarity]')]
  assert.equal(boxes.find((box) => box.dataset.gachaForgeRarity === 'SSR').checked, false)
  assert.equal(boxes.find((box) => box.dataset.gachaForgeRarity === 'SR').checked, true)

  const saved = JSON.parse(w.localStorage.getItem('lsb_base:title-forge-planner:forge-preferences'))
  assert.equal(saved.excludeSsr, true)
  assert.equal(saved.selection['传说之龙@SSR'], false)
  assert.equal(saved.selection['万人迷@SR'], true)
  assert.ok(saved.excludedTitles.includes('传说之龙@SSR'))
  assert.equal(typeof dbg.normalizeForgePreferences, 'function')
})

test('称号熔炼页：全选默认排除 R 级反贼', async () => {
  const { w } = await bootForge({
    html: `<html><body><main class="gacha-forge-page">
      <form class="gacha-forge-form">
        <div class="gacha-forge-select" data-gacha-forge-title-id="rogue-r" data-name="反贼" data-rarity="R">
          <label><input type="checkbox" data-gacha-forge-rarity="R" value="rogue-r">反贼 R</label>
        </div>
        <div class="gacha-forge-select" data-gacha-forge-title-id="normal-r" data-name="普通称号" data-rarity="R">
          <label><input type="checkbox" data-gacha-forge-rarity="R" value="normal-r">普通称号 R</label>
        </div>
      </form>
    </main></body></html>`,
  })
  const controls = w.document.querySelector('[data-lsb-forge-controls]')
  const excludeRogue = controls?.querySelector('[data-lsb-forge-exclude-rogue-r]')
  assert.ok(excludeRogue)
  assert.equal(excludeRogue.checked, true)

  controls.querySelector('[data-lsb-forge-select-all]').click()

  const boxes = [...w.document.querySelectorAll('[data-gacha-forge-rarity]')]
  assert.equal(boxes.find((box) => box.value === 'rogue-r').checked, false)
  assert.equal(boxes.find((box) => box.value === 'normal-r').checked, true)
  const saved = JSON.parse(w.localStorage.getItem('lsb_base:title-forge-planner:forge-preferences'))
  assert.equal(saved.excludeRogueR, true)
})

test('称号熔炼页：刷新后恢复勾选状态与排除 SSR 状态', async () => {
  const preferences = {
    version: 1,
    selection: { '传说之龙@SSR': true, '万人迷@SR': true },
    excludeSsr: true,
    excludedTitles: ['传说之龙@SSR'],
  }
  const { w } = await bootForge({
    preload: { 'lsb_base:title-forge-planner:forge-preferences': preferences },
  })
  const boxes = [...w.document.querySelectorAll('[data-gacha-forge-rarity]')]
  assert.equal(boxes.find((box) => box.dataset.gachaForgeRarity === 'SSR').checked, false)
  assert.equal(boxes.find((box) => box.dataset.gachaForgeRarity === 'SR').checked, true)
  assert.equal(w.document.querySelector('[data-lsb-forge-exclude-ssr]').checked, true)
})

test('称号熔炼页：缺少标题 data 属性时仍按可见文字识别稀有度', async () => {
  const { w, dbg } = await bootForge({
    html: `<html><body><main class="gacha-forge-page">
      <form><div class="gacha-forge-select">
        <label><input type="checkbox" data-gacha-forge-rarity="ssr" value="title-1">传说之龙 SSR</label>
        <input data-gacha-forge-material-input value="1">
      </div></form>
    </main></body></html>`,
  })
  assert.equal(typeof dbg.forgeMaterialMeta, 'function')
  const inputs = dbg.findForgeMaterialInputs(w.document)
  assert.equal(inputs.length, 1)
  assert.deepEqual(plain(dbg.forgeMaterialMeta(inputs[0])), {
    key: '传说之龙@SSR',
    name: '传说之龙',
    rarity: 'SSR',
    id: '',
  })
})

test('称号熔炼页：离开熔炼路由时移除增强控件，返回后重新挂载', async () => {
  const { w, tick } = await bootForge()
  assert.ok(w.document.querySelector('[data-lsb-forge-controls]'))

  w.history.pushState({}, '', '/')
  w.dispatchEvent(new w.PopStateEvent('popstate'))
  await tick(20)
  assert.equal(w.document.querySelector('[data-lsb-forge-controls]'), null)

  w.history.pushState({}, '', '/gacha_forge_center')
  w.dispatchEvent(new w.PopStateEvent('popstate'))
  await tick(20)
  assert.ok(w.document.querySelector('[data-lsb-forge-controls]'))
})
