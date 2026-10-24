# UR 合成规划器 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 新增只读的 `UR 合成规划` Oxygen 插件，结合 UR 配方、称号市场挂单、抽取概率、当前积分和称号库存，指出当前可行的最低成本路线或最小积分缺口。

**Architecture:** `plugins/title-forge-planner.user.js` 自包含页面解析、路线计算和面板渲染，并通过 `title-forge-planner:debug` 暴露纯函数测试接口。`title-quotes.user.js` 只负责把最近成功采集的单个挂单摘要持久化并通过 `title-quotes:market-data` RPC 提供给规划器；不把路线逻辑加入行情插件。规划器依赖行情插件，按需读取 `/gacha_recipes`、`/gacha` 和 `/gacha_profile`，不发送任何写请求。

**Tech Stack:** 浏览器 userscript、现有 LSB plugin API、Node.js `node:test`、JSDOM、现有 Oxygen/LTS 打包脚本。

## Global Constraints

- 保留当前工作区全部既有修改和未跟踪文件；每次暂存只包含本任务列出的文件，不执行 reset、clean 或宽泛 `git add`。
- 生产代码必须遵循 TDD：先写一个针对真实行为的失败测试，运行并确认因功能缺失失败，再写最小实现。
- 不新增购买、抽取、合成或其它站内写请求；规划器只使用 `api.net.doc`、`api.request` 和 `api.me.points`。
- 不修改 `src/core.js`、`src/net.js`、`src/site.js`、`plugins/skin.user.js` 或 LTS 的功能行为。
- 新插件加入 Oxygen `ORDER`，不加入 `ORDER_LTS`；LTS 产物不出现 `title-forge-planner`。
- 新插件版本固定为 `0.1.0`，`title-quotes` 公共市场数据接口版本固定为 `1.0.19`，Oxygen/LTS 版本固定为 `2.0.23`，基座保持 `0.2.2`。
- 计算缺失数据必须返回不可用状态，不能把缺失价格、概率、库存或积分转换为零。
- 市场最低路线按单个挂单的价格和数量逐单取货；中位价路线只作为估算；抽取路线必须标注期望值且不保证实际结果。
- dist 文件只能由 `npm run build` 和现有 LTS 构建脚本生成，不手工编辑。
- 最终验证至少运行 `npm test`、`npm run build`、`npm run verify:dist` 和 `git -c core.whitespace=cr-at-eol diff --check`。

---

### Task 1: 为称号行情增加跨标签市场数据 RPC

**Files:**
- Modify: `plugins/title-quotes.user.js`（采集成功和 debug/RPC 注册区域）
- Modify: `test/title-quotes.test.js`（行情数据提供回归测试）

**Interfaces:**
- Produces: `title-quotes:market-data` RPC，返回 `{ fetchedAt, listings, titles }`。
- `listings` 的元素固定为 `{ key, price, qty }`，不包含站点 `listing_id`、表单字段或 DOM 节点。
- `titles` 复用现有 `foldTitles()` 的 `{ rarity, lo, hi, mid, n }` 聚合结果。

- [ ] **Step 1: 写 RPC 的失败测试**

在 `test/title-quotes.test.js` 的 `asc+desc 合并、listing_id 去重` 用例后加入：

```js
test('称号行情：公开最近成功采集的市场挂单给合成规划器', async () => {
  const { w, dbg } = await boot()
  const now = 1_700_000_000_000
  dbg.reset()
  dbg.ingestListings([
    { id: 'a', name: '全站偶像', rarity: 'SSR', price: 260, qty: 2 },
    { id: 'b', name: '全站偶像', rarity: 'SSR', price: 300, qty: 1 },
  ], now)

  const market = await w.LSB.bus.request('title-quotes:market-data')
  assert.equal(market.fetchedAt, now)
  assert.deepEqual(market.listings, [
    { key: '全站偶像@SSR', price: 260, qty: 2 },
    { key: '全站偶像@SSR', price: 300, qty: 1 },
  ])
  assert.deepEqual(market.titles['全站偶像@SSR'], {
    rarity: 'SSR', lo: 260, hi: 300, mid: 280, n: 3,
  })
  assert.equal(Object.hasOwn(market.listings[0], 'id'), false)
})
```

- [ ] **Step 2: 运行失败测试，确认失败原因正确**

Run:

```text
node --test --test-force-exit test/title-quotes.test.js --test-name-pattern="公开最近成功采集的市场挂单"
```

Expected: FAIL because `title-quotes:market-data` has no handler or no persisted market snapshot.

- [ ] **Step 3: 实现最小市场快照和 RPC**

在 `ingestListings(listings, now)` 中完成 `const titles = foldTitles(listings)` 和现有 `sold`/`fills` 字段补齐后、调用 `pickAnchors` 前生成：

```js
const market = {
  fetchedAt: now,
  listings: (listings || [])
    .filter((x) => x && x.name && x.rarity != null && Number.isFinite(Number(x.price)))
    .map((x) => ({
      key: titleKey(x.name, x.rarity),
      price: Number(x.price),
      qty: Number(x.qty) > 0 ? Number(x.qty) : 1,
    })),
  titles: Object.fromEntries(Object.entries(titles).map(([key, value]) => [key, {
    rarity: value.rarity,
    lo: value.lo,
    hi: value.hi,
    mid: value.mid,
    n: value.n,
  }])),
}
api.store.set('market', market)
```

其中 `titles` 使用当前 `foldTitles(listings)` 结果的可序列化副本；`reset()` 同时删除 `market`。在 `api.handle('title-quotes:debug', ...)` 之前注册：

```js
api.handle('title-quotes:market-data', () => api.store.get('market', null))
```

将 userscript 头部和 manifest 版本从 `1.0.18` 改为 `1.0.19`。RPC 只返回存储数据，不复用或暴露 `listing_id`。

- [ ] **Step 4: 运行测试确认通过**

Run:

```text
node --test --test-force-exit test/title-quotes.test.js --test-name-pattern="公开最近成功采集的市场挂单|asc\+desc 合并"
```

Expected: PASS，且既有行情合并测试仍通过。

- [ ] **Step 5: 只提交本任务文件**

```text
git add -- plugins/title-quotes.user.js test/title-quotes.test.js
git commit -m "feat: expose title market data rpc"
```

---

### Task 2: 建立规划器页面解析器和测试夹具

**Files:**
- Create: `plugins/title-forge-planner.user.js`
- Create: `test/title-forge-planner.test.js`
- Create: `test/fixtures/gacha-recipes.html`
- Create: `test/fixtures/gacha.html`
- Create: `test/fixtures/gacha-profile.html`

**Interfaces:**
- Produces: `parseRecipes(input) -> { recipes, issues }`。
- Produces: `parseGacha(input) -> { pools, issues }`。
- Produces: `parseInventory(input) -> { inventory, issues }`。
- `input` 可以是 HTML 字符串或 `Document`。
- `keyOf(name, rarity) -> string` 返回 `${name}@${rarity}`。
- 页面解析器优先读取带 `data-*` 的结构化节点，并支持同一节点上的可见文字 fallback；不读取表单 action，不提交表单。

- [ ] **Step 1: 创建最小夹具和失败解析测试**

创建三份最小夹具，固定使用下面的结构化字段，后续解析器同时保留这些字段和可见文本 fallback：

```html
<!-- gacha-recipes.html -->
<section data-gacha-recipes>
  <article data-gacha-recipe data-recipe-id="ur-a" data-target-name="夜航灯塔" data-target-rarity="UR" data-fee="100">
    <div data-gacha-material data-name="蓝色火花" data-rarity="SSR" data-qty="2">蓝色火花 SSR ×2</div>
    <div data-gacha-material data-name="旧齿轮" data-rarity="SR" data-qty="3">旧齿轮 SR ×3</div>
  </article>
  <article data-gacha-recipe data-recipe-id="ur-b" data-target-name="深空回声" data-target-rarity="UR" data-fee="80">
    <div data-gacha-material data-name="蓝色火花" data-rarity="SSR" data-qty="4">蓝色火花 SSR ×4</div>
  </article>
</section>
```

```html
<!-- gacha.html -->
<section data-gacha-pool data-pool-id="pool-1" data-pool-label="SSR 池" data-draw-cost="120">
  <div data-gacha-outcome data-name="蓝色火花" data-rarity="SSR" data-probability="0.5">蓝色火花 50%</div>
  <div data-gacha-outcome data-name="旧齿轮" data-rarity="SR" data-probability="0.25">旧齿轮 25%</div>
  <div data-gacha-outcome data-name="其它" data-rarity="SR" data-probability="0.25">其它 25%</div>
</section>
```

```html
<!-- gacha-profile.html -->
<section data-gacha-profile>
  <div data-gacha-owned data-name="蓝色火花" data-rarity="SSR" data-qty="1">蓝色火花 SSR ×1</div>
  <div data-gacha-owned data-name="旧齿轮" data-rarity="SR" data-qty="4">旧齿轮 SR ×4</div>
</section>
```

在新测试文件中加入：

```js
test('UR 规划器：解析 UR 配方、抽取池和称号库存', async () => {
  const { dbg } = await bootPlanner()
  const recipes = dbg.parseRecipes(fixture('gacha-recipes.html'))
  const gacha = dbg.parseGacha(fixture('gacha.html'))
  const profile = dbg.parseInventory(fixture('gacha-profile.html'))

  assert.deepEqual(recipes.recipes[0].inputs, [
    { key: '蓝色火花@SSR', name: '蓝色火花', rarity: 'SSR', qty: 2 },
    { key: '旧齿轮@SR', name: '旧齿轮', rarity: 'SR', qty: 3 },
  ])
  assert.equal(recipes.recipes[0].target.key, '夜航灯塔@UR')
  assert.equal(recipes.recipes[0].fee, 100)
  assert.equal(gacha.pools[0].outcomes[0].probability, 0.5)
  assert.deepEqual(profile.inventory, { '蓝色火花@SSR': 1, '旧齿轮@SR': 4 })
  assert.deepEqual(recipes.issues, [])
  assert.deepEqual(gacha.issues, [])
  assert.deepEqual(profile.issues, [])
})
```

`bootPlanner()` 使用独立的 `makeDom`、`stubFetch` 和 `loadBase` helper；下面的测试 helper 作为 `test/title-forge-planner.test.js` 顶部固定实现，确保 `points` 能从现有基座身份解析器读取：

```js
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

async function bootPlanner({ points = 500, fetchRecipes = fixture('gacha-recipes.html'), fetchGacha = fixture('gacha.html'), fetchProfile = fixture('gacha-profile.html') } = {}) {
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
```

- [ ] **Step 2: 运行失败测试，确认插件缺失导致失败**

Run:

```text
node --test --test-force-exit test/title-forge-planner.test.js --test-name-pattern="解析 UR 配方"
```

Expected: FAIL because the plugin file and parser debug RPC do not exist.

- [ ] **Step 3: 实现 manifest、规范化键和三个解析器**

创建 userscript 头和 manifest：

```js
// @name         LSB·UR 合成规划
// @version      0.1.0
// @match        https://linux.sb/*
// @grant        none
// @run-at       document-end
// @noframes

const manifest = {
  id: 'title-forge-planner',
  name: 'UR 合成规划',
  version: '0.1.0',
  description: '根据配方、行情、抽取概率、积分和库存规划 UR 合成路径',
  author: 'you',
  requires: { base: '^0.2.2', plugins: { 'title-quotes': '^1.0.19' } },
  permissions: ['read', 'storage', 'ui', 'events'],
}
```

实现 `toDocument`、`keyOf` 和三个纯解析器：

- `parseRecipes` 只收录 `target-rarity === 'UR'` 且 target name、每个材料 name/rarity/qty、fee 都可确认的配方；不完整配方进入 `issues` 并不进入 `recipes`；
- `parseGacha` 只返回 draw cost 为正数、概率为 `[0, 1]` 且结果称号可确认的池；概率总和不完整时设置 pool issue，不能在计算中当作完整分布；
- `parseInventory` 合并相同 `key` 的数量，数量缺失或负数视为 issue，不写入库存；登录页或空 profile 返回 `issues`，不返回零库存的成功状态。

在 setup 中注册 `api.handle('title-forge-planner:debug', () => ({ ... }))`，先暴露 `keyOf`、三个解析器和静态 `issues`，面板留到 Task 5。

- [ ] **Step 4: 运行解析测试确认通过**

Run:

```text
node --test --test-force-exit test/title-forge-planner.test.js --test-name-pattern="解析 UR 配方"
```

Expected: PASS，且缺字段、非 UR 配方和未登录空页的 issue 测试也通过。

- [ ] **Step 5: 只提交本任务文件**

```text
git add -- plugins/title-forge-planner.user.js test/title-forge-planner.test.js test/fixtures/gacha-recipes.html test/fixtures/gacha.html test/fixtures/gacha-profile.html
git commit -m "feat: add forge planner parsers"
```

---

### Task 3: 实现库存抵扣、配方展开和市场路线

**Files:**
- Modify: `plugins/title-forge-planner.user.js`（纯计算函数）
- Modify: `test/title-forge-planner.test.js`（计算器失败测试）

**Interfaces:**
- `missingInputs(inputs, inventory) -> [{ key, name, rarity, qty }]`。
- `marketCost(requirements, listings, fee) -> plan`。
- `medianCost(requirements, titles, fee) -> plan`。
- `expandRequirements(targetRecipe, recipes, inventory, seen) -> { requirements, fee, steps, issue }`。
- `planMarket({ recipes, market, inventory, points }) -> [{ target, route }]`。
- `plan` 统一含 `{ status, cost, fee, steps, reason, currentPoints, remaining, shortfall }`；`status` 只能是 `ok`、`insufficient`、`unavailable`。

- [ ] **Step 1: 写市场成本和库存的失败测试**

加入以下测试：

```js
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
  assert.deepEqual(low.steps.filter((s) => s.kind === 'market'), [
    { kind: 'market', key: '蓝色火花@SSR', price: 10, qty: 1, cost: 10 },
    { kind: 'market', key: '蓝色火花@SSR', price: 15, qty: 3, cost: 45 },
  ])
  assert.deepEqual(dbg.missingInputs(req, { '蓝色火花@SSR': 1 }), [
    { key: '蓝色火花@SSR', name: '蓝色火花', rarity: 'SSR', qty: 3 },
  ])
})

test('UR 规划器：挂单不足或中位价缺失时路线不可用', async () => {
  const { dbg } = await bootPlanner()
  const req = [{ key: '缺货称号@SR', name: '缺货称号', rarity: 'SR', qty: 2 }]
  assert.equal(dbg.marketCost(req, [{ key: '缺货称号@SR', price: 20, qty: 1 }], 0).status, 'unavailable')
  assert.equal(dbg.medianCost(req, {}, 0).status, 'unavailable')
})
```

- [ ] **Step 2: 运行失败测试，确认计算函数不存在**

Run:

```text
node --test --test-force-exit test/title-forge-planner.test.js --test-name-pattern="最低挂单按数量|挂单不足"
```

Expected: FAIL because `marketCost`、`medianCost` 和 `missingInputs` are not exposed.

- [ ] **Step 3: 实现市场和配方纯函数**

实现规则：

- `missingInputs` 对每个 key 使用 `Math.max(0, required - owned)`，数量为零的项不返回；
- `marketCost` 先按 key 分组，再按价格升序、原输入顺序稳定取货；总量不足时返回 `{ status: 'unavailable', reason: 'market-insufficient' }`；
- `medianCost` 对每个 requirement 读取 `titles[key].mid`，任一缺失即返回 `{ status: 'unavailable', reason: 'median-missing' }`；
- 两种市场路线都把 `fee` 加入 cost，并在 steps 中记录材料和费用；
- `expandRequirements` 递归展开下级配方，`seen` 中再次遇到 key 返回 `reason: 'recipe-cycle'`；同时保留直接取得候选，不能用递归失败覆盖可用的直接路线；
- `planMarket` 对每个 UR 的每条配方分别计算不计库存和计入库存候选，并稳定按 cost、target key、recipe id 排序。

把新函数加入 debug RPC，供测试直接调用。

- [ ] **Step 4: 运行市场和递归测试确认通过**

Run:

```text
node --test --test-force-exit test/title-forge-planner.test.js --test-name-pattern="最低挂单按数量|挂单不足|下级配方|配方循环"
```

Expected: PASS，路线步骤包含库存抵扣、挂单单价和配方费用，循环路线为 unavailable。

- [ ] **Step 5: 只提交本任务文件**

```text
git add -- plugins/title-forge-planner.user.js test/title-forge-planner.test.js
git commit -m "feat: calculate market forge routes"
```

---

### Task 4: 实现抽取期望值计算和综合路线结果

**Files:**
- Modify: `plugins/title-forge-planner.user.js`（抽取 DP、统一规划器和摘要）
- Modify: `test/title-forge-planner.test.js`（期望值和积分判断测试）

**Interfaces:**
- `expectedGachaCost(requirements, pools, fee) -> plan`。
- `calculatePlans({ recipes, market, gachaPools, inventory, points }) -> { modes, summary }`。
- `summarizeMode(plans, points) -> { bestFeasible, nearest, state }`。
- `modes.noInventory` 和 `modes.inventory` 都含 `{ targets, summary }`。
- `targets` 的每项含 `{ target, recipe, routes: { marketLow, marketMedian, gacha }, best }`。

- [ ] **Step 1: 写抽取 DP 和积分摘要的失败测试**

加入：

```js
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
```

- [ ] **Step 2: 运行失败测试，确认期望值接口尚未存在**

Run:

```text
node --test --test-force-exit test/title-forge-planner.test.js --test-name-pattern="抽取路线处理|积分足够|不完整抽取概率"
```

Expected: FAIL because `expectedGachaCost` and `calculatePlans` are not exposed.

- [ ] **Step 3: 实现有限状态期望值和综合规划器**

实现 `expectedGachaCost`：

1. 把 requirements 转成稳定的 `{ key -> remaining }` 状态；
2. 从总缺口较小的状态向总缺口较大的状态反向计算；
3. 对每个抽取池计算本动作的进展概率、下一状态期望值和自循环概率；
4. 使用 `(drawCost + progressNextCost) / (1 - noProgressProbability)` 得到动作候选；
5. 选择当前状态候选中的最小值，并同步记录 `expectedDraws`、选择的 pool 和每一步材料；
6. 概率总和不在允许误差范围内时返回 `probability-incomplete`，不能把未知质量归入 no-progress。

实现 `calculatePlans`：

- 分别用空库存和传入库存调用同一套 recipe expansion；
- 对每条完整 UR 配方生成 `marketLow`、`marketMedian`、`gacha` 三类路线；
- 把 recipe fee 传给三类路线，避免费用漏算或重复相加；
- 对每个 target 选择有效路线中 cost 最低的 `best`；
- `summarizeMode` 先筛 `status === 'ok' && cost <= points`，再按 cost、target key、recipe id 排序；没有可行方案时从 `ok` 或 `insufficient` 方案中选择 shortfall 最小者；没有任何有效方案时返回 `state: 'unknown'`；
- `points === null` 时所有路线保留 cost，但 summary 不返回 feasible/shortfall 判断。

- [ ] **Step 4: 运行抽取和摘要测试确认通过**

Run:

```text
node --test --test-force-exit test/title-forge-planner.test.js --test-name-pattern="抽取路线处理|积分足够|不完整抽取概率|市场|解析 UR 配方"
```

Expected: PASS，期望抽取次数和成本与 DP 测试一致，库存模式能展示扣除库存后的更低路线。

- [ ] **Step 5: 只提交本任务文件**

```text
git add -- plugins/title-forge-planner.user.js test/title-forge-planner.test.js
git commit -m "feat: optimize forge routes by gacha expectation"
```

---

### Task 5: 接入按需刷新、来源状态和 UR 合成面板

**Files:**
- Modify: `plugins/title-forge-planner.user.js`（setup、刷新、渲染和样式）
- Modify: `test/title-forge-planner.test.js`（面板和错误状态）

**Interfaces:**
- 面板根节点：`[data-title-forge-planner]`。
- 刷新按钮：`[data-title-forge-planner-refresh]`。
- 来源状态：`[data-title-forge-planner-source="recipes|gacha|inventory|market"]`。
- 库存区块：`[data-title-forge-planner-mode="no-inventory"]` 和 `[data-title-forge-planner-mode="inventory"]`。
- UR 行：`[data-title-forge-planner-target]`；路线：`[data-title-forge-planner-plan="market-low|market-median|gacha"]`。
- setup 产生的 tab：`id: 'title-forge-planner'`、`name: 'UR 合成规划'`、`order: 67`。

- [ ] **Step 1: 写面板失败测试**

在 `test/title-forge-planner.test.js` 加入一个本地 fetch 路由返回三份夹具和已有市场快照的集成测试：

```js
test('UR 规划器面板：刷新后同时显示两种库存和三类路线', async () => {
  const { w, calls, until } = await bootPlanner({ points: 500 })
  w.LSB.open('title-forge-planner')
  assert.ok(w.document.querySelector('[data-title-forge-planner]'))
  await until(() => w.document.querySelector('[data-title-forge-planner-target]'))

  const root = w.document.querySelector('[data-title-forge-planner]')
  assert.ok(root.querySelector('[data-title-forge-planner-mode="no-inventory"]'))
  assert.ok(root.querySelector('[data-title-forge-planner-mode="inventory"]'))
  assert.ok(root.querySelector('[data-title-forge-planner-plan="market-low"]'))
  assert.ok(root.querySelector('[data-title-forge-planner-plan="market-median"]'))
  assert.ok(root.querySelector('[data-title-forge-planner-plan="gacha"]'))
  assert.match(root.textContent, /当前积分/) 
  assert.equal(calls.some((x) => x.method === 'POST' || /_buy|_forge|gacha.*draw/i.test(x.href)), false)
})

test('UR 规划器面板：单个来源失败只禁用相关路线并显示状态', async () => {
  const { w, until } = await bootPlanner({ fetchGacha: '<html><body>Cloudflare challenge</body></html>' })
  w.LSB.open('title-forge-planner')
  await until(() => w.document.querySelector('[data-title-forge-planner-source="gacha"]'))
  const root = w.document.querySelector('[data-title-forge-planner]')
  assert.match(root.querySelector('[data-title-forge-planner-source="gacha"]').textContent, /无法识别|数据不足|挑战未完成/)
  assert.ok(root.querySelector('[data-title-forge-planner-plan="market-low"]'))
  assert.match(root.textContent, /抽取路线.*数据不足|抽取.*不可用/)
})
```

- [ ] **Step 2: 运行失败测试，确认面板尚未注册**

Run:

```text
node --test --test-force-exit test/title-forge-planner.test.js --test-name-pattern="面板：刷新后|单个来源失败"
```

Expected: FAIL because `title-forge-planner` has no UI tab or refresh workflow.

- [ ] **Step 3: 实现按需刷新和 source 状态**

在 setup 中增加：

- `sourceState`，每项保存 `status`, `fetchedAt`, `error`, `stale`；
- `loadSources()`，通过 `Promise.allSettled` 读取三个站内文档、`api.me.points` 和 `api.request('title-quotes:market-data')`；
- 每个来源成功后把规范化数据与 `fetchedAt` 写入规划器自己的 store；失败时读取上次成功快照并设置 `stale: true`；没有旧快照则设置 `status: 'unavailable'`；
- `refresh()` 使用 `api.signal`，重复点击时复用当前 Promise，完成后重新渲染；
- 对 login 页面、Cloudflare 挑战文案和空文档返回不同的可见状态，不创建空配方、零库存或零概率。

只在 tab render 首次打开时启动一次刷新，点击按钮再次刷新；不要注册 interval、POST listener 或购买表单 handler。

- [ ] **Step 4: 实现面板渲染**

`render(host)` 先绘制状态和 loading，再绘制：

- 当前积分和最后计算时间；
- 刷新按钮；
- 四个数据源状态行；
- 不计库存/计入库存两个区块；
- 每个 UR 的三类路线、成本、剩余/缺口和可展开步骤；
- `state: 'unknown'` 时显示“无法判断”，`status: 'unavailable'` 时显示路线数据不足，不显示“还差 0 积分”；
- 抽取路线文案固定含“期望值，不保证实际结果”；
- 对所有动态称号名、来源文案和错误文案使用 `api.util.esc`，不把站点正文原样写入 `innerHTML`。

使用 `api.ui.style` 添加只作用于 `.lsb-title-forge-planner` 的布局、状态色、折叠行和窄屏规则。debug RPC 增加 `parse*`、计算函数、`calculatePlans`、`refresh` 和当前状态读取函数。

- [ ] **Step 5: 运行面板测试确认通过**

Run:

```text
node --test --test-force-exit test/title-forge-planner.test.js --test-name-pattern="面板|路线|状态"
```

Expected: PASS；请求记录中无 POST、购买、抽取或合成 endpoint，错误来源不影响仍可用的市场路线。

- [ ] **Step 6: 只提交本任务文件**

```text
git add -- plugins/title-forge-planner.user.js test/title-forge-planner.test.js
git commit -m "feat: render forge planner panel"
```

---

### Task 6: 更新 Oxygen 收录、版本文档和套件回归

**Files:**
- Modify: `suite/order.js`
- Modify: `build-suite.mjs`
- Modify: `suite/suite-center.js`
- Modify: `README.md`
- Modify: `docs/CONVENTIONS.md`
- Modify: `test/suite.test.js`
- Test: `test/lts.test.js`

**Interfaces:**
- `ORDER` 在 `title-quotes` 后紧接 `title-forge-planner`。
- `ORDER_LTS` 不包含 `title-forge-planner`。
- `build-suite.mjs` 的 `SUITE_VERSION`、`suite/suite-center.js` 的 manifest.version 和 README/CONVENTIONS 版本文本统一为 `2.0.23`。
- Oxygen 套件模块数统一为 25；LTS 仍只构建原有模块。

- [ ] **Step 1: 写收录和版本失败测试**

在 `test/suite.test.js` 的收录测试附近加入：

```js
test('UR 合成规划：紧跟称号行情进入 Oxygen 且不进入 LTS', () => {
  const i = MEMBERS.indexOf('title-quotes')
  assert.equal(MEMBERS[i + 1], 'title-forge-planner')
  assert.equal(ORDER_LTS.includes('title-forge-planner'), false)
  const source = readFileSync(new URL('../plugins/title-forge-planner.user.js', import.meta.url), 'utf8')
  assert.match(source, /@version\s+0\.1\.0/)
  assert.match(source, /version:\s*'0\.1\.0'/)
  assert.match(source, /'title-quotes':\s*'\^1\.0\.19'/)
  assert.match(source, /permissions:\s*\['read',\s*'storage',\s*'ui',\s*'events'\]/)
  assert.doesNotMatch(ltsCode, /id:\s*'title-forge-planner'/)
})
```

把已有 suite 版本断言先改为期望 `2.0.23`，把 README/CONVENTIONS 模块数断言改为 25；在源码和构建产物尚未更新前运行该测试，确认失败来自收录、版本或产物缺失，而不是语法错误。

- [ ] **Step 2: 运行集成失败测试**

Run:

```text
node --test --test-force-exit test/suite.test.js test/lts.test.js --test-name-pattern="UR 合成规划|套件收录完整|版本号双处对齐|版本"
```

Expected: FAIL because `ORDER`, Oxygen version, README/CONVENTIONS and dist have not been updated.

- [ ] **Step 3: 更新源收录、版本和文档**

执行：

1. 在 `suite/order.js` 的 `title-quotes` 后加入 `title-forge-planner`，不改 `ORDER_LTS`；
2. 将 `build-suite.mjs` 的 `SUITE_VERSION` 和 `suite/suite-center.js` manifest.version 改为 `2.0.23`；
3. README 的安装说明、模块数量、模块表和当前版本行加入 `title-forge-planner`，并保留 title-quotes 原有说明；
4. `docs/CONVENTIONS.md` 把氢/氧/LTS 版本改为 `0.2.2 / 2.0.23 / 2.0.23`，模块数改为 25，并在 Oxygen 模块约束中说明新规划器是只读且不进入 LTS；
5. 更新 `test/suite.test.js` 中固定的 Oxygen/LTS 版本断言；
6. 运行 `npm run build`，让 Oxygen 和 LTS 产物自动包含正确模块和版本；
7. 不手工修改任何 dist 文件。

- [ ] **Step 4: 运行收录和 LTS 测试确认通过**

Run:

```text
node --test --test-force-exit test/suite.test.js test/lts.test.js --test-name-pattern="UR 合成规划|套件收录完整|版本号双处对齐|LTS"
npm run verify:dist
```

Expected: PASS；verify 输出 `Hydrogen 0.2.2 · Oxygen 2.0.23 · LTS 2.0.23 · 25 modules`，LTS 不包含新插件。

- [ ] **Step 5: 只提交本任务文件**

```text
git add -- suite/order.js build-suite.mjs suite/suite-center.js README.md docs/CONVENTIONS.md test/suite.test.js plugins/title-forge-planner.user.js plugins/title-quotes.user.js dist/linuxsb-suite.user.js dist/linuxsb-lts.user.js
git commit -m "build: include UR forge planner in Oxygen"
```

如果当前工作区在本任务前已经有这些文件的既有修改，只允许把本任务新增的行按路径精确暂存，不能使用 `git add -A` 或暂存整个目录。

---

### Task 7: 完整回归和交付前检查

**Files:**
- Test: `test/title-forge-planner.test.js`
- Test: `test/title-quotes.test.js`
- Test: repository-wide test/build/verification commands

**Interfaces:**
- 保持 Task 1–6 产生的 RPC、debug 函数、面板选择器和套件版本接口不变。
- 任何失败都必须先定位到本任务新增行为或既有诊断，不改测试去掩盖失败。

- [ ] **Step 1: 运行规划器和行情专项回归**

```text
node --test --test-force-exit test/title-forge-planner.test.js test/title-quotes.test.js
```

Expected: 新增规划器测试和既有称号行情测试全部通过；只允许出现仓库已有的 JSDOM `window.scrollTo` 等诊断，不允许出现新增未处理异常。

- [ ] **Step 2: 运行全量测试**

```text
npm test
```

Expected: 退出码 0，失败数为 0；记录总测试数、通过数和跳过数，并确认没有新的失败文件。

- [ ] **Step 3: 重建三个 dist 产物**

```text
npm run build
```

Expected: 生成 Hydrogen `0.2.2`、Oxygen `2.0.23` 和 LTS `2.0.23`，Oxygen 含 25 个模块，LTS 不含 `title-forge-planner`。

- [ ] **Step 4: 校验产物、行尾和差异**

```text
npm run verify:dist
git -c core.whitespace=cr-at-eol diff --check
```

Expected: dist 新鲜度通过；差异检查无输出。

- [ ] **Step 5: 检查本任务工作区范围**

```text
git status --short
git log --oneline --max-count=8
git diff --name-only HEAD~6..HEAD
```

确认规划器新增文件、行情 RPC、套件收录、文档和自动生成产物均在预期路径；确认 artifacts、既有 AI/皮肤修改和其它未跟踪文件没有被删除、重置或意外加入本任务提交。

- [ ] **Step 6: 生成交付摘要**

交付时报告：

- 新插件、行情 RPC 和版本号；
- 两种库存模式、三类成本路线和缺口判断；
- 专项测试、全量测试、构建、dist 校验和差异检查的实际结果；
- 当前工作区仍保留的非本任务脏修改不作清理。

---

## Self-Review Checklist

- [ ] 所有生产函数都有先失败后通过的测试：解析器、市场成本、库存抵扣、递归/环检测、抽取期望、摘要、刷新和面板。
- [ ] Task 1 的 `title-quotes:market-data` 返回值与 Task 5 的 `market` 输入字段完全一致。
- [ ] Task 4 的 `calculatePlans` 输出与 Task 5 的 `data-title-forge-planner-*` 渲染字段完全一致。
- [ ] Task 6 的版本 `2.0.23` 与 `build-suite.mjs`、`suite-center.js`、README、CONVENTIONS、测试和 dist 校验规则一致。
- [ ] 没有任务要求修改基座、skin、LTS 或站内写接口。
- [ ] 没有占位符、泛化的“写测试”步骤或未定义的跨任务函数名。
