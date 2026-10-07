# 积分-称号工作台 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 在 Oxygen 中新增一个可拖动的“积分-称号工作台”，统一展示积分、称号行情和 UR 合成规划，并在数据不完整、超时或市场分页失败时给出可验证的局部结果。

**Architecture:** 新增 `points-title-workbench.user.js` 作为窗口、缓存和刷新协调器；`points-ledger` 提供积分快照，`title-quotes` 提供带覆盖信息的市场快照，`title-forge-planner` 提供配方/抽取/库存刷新和纯路线计算。工作台只依赖这些插件的正式只读 RPC，不读取 debug RPC，也不发送站内写请求。

**Tech Stack:** 浏览器 userscript、现有 LSB 基座 bus/store/ui API、Node.js `node:test`、JSDOM、现有 Oxygen/LTS 构建脚本。

## Global Constraints

- 在当前已有修改的 `D:\test\linuxsb-base` 工作区实施；不执行 `reset`、`clean`、宽泛 `git add` 或删除用户现有文件。
- 每个生产行为先写一个会因功能缺失而失败的测试，运行并确认正确失败，再写最小实现。
- 只使用读请求；不得新增购买、抽奖、合成或其它站内写请求。
- 工作台每次打开自动刷新；首屏先使用工作台自己的最近成功缓存，来源逐项更新。
- 每个来源的最长等待时间为 10 秒；单来源失败只停用依赖它的路线，其他来源继续显示。
- 最低挂单按真实 `qty` 逐单取货；中位价只显示估算；抽取路线只显示完整概率池的期望值。
- 错误文案固定使用：`页面格式无法识别`、`无法确认库存数据`、`合成表数据不足`；不得用空数组、零库存或零成本掩盖来源失败。
- Oxygen 顺序为 `points-ledger` → `title-quotes` → `title-forge-planner` → `points-title-workbench`；新工作台不进入 LTS。
- 新工作台版本为 `0.1.0`；现有基座、Oxygen、LTS 和既有插件版本不因本功能随意变更。
- `dist` 文件只能由构建脚本生成；不手工编辑 `dist/linuxsb-base.user.js`、`dist/linuxsb-lts.user.js` 或 `dist/linuxsb-suite.user.js`。
- 每个阶段用精确路径运行测试；由于现有文件已有未提交修改，阶段检查使用 `git diff -- <paths>`，不自动提交包含旧改动的整文件。

---

## File Map

- Create: `plugins/points-title-workbench.user.js` — 聚合工作台、窗口、缓存、刷新状态、四个视图和正式 `open` RPC。
- Create: `test/points-title-workbench.test.js` — 工作台 bus、缓存、刷新、局部失败、错误文案、路线摘要和窗口边界测试。
- Modify: `plugins/title-quotes.user.js` — 市场快照覆盖信息、分页失败保护、按需刷新 RPC；移除全局独立入口但保留交易页嵌入。
- Modify: `test/title-quotes.test.js` — 完整/不完整快照和刷新 RPC 回归测试。
- Modify: `plugins/title-forge-planner.user.js` — 正式刷新/计算 RPC、每源超时和服务化；保留纯解析/计算 debug 接口供测试，移除独立 UI tab。
- Modify: `test/title-forge-planner.test.js` — 正式 RPC、超时、局部失败和无独立入口测试，同时保留现有计算回归。
- Modify: `plugins/points-ledger.user.js` — 移除独立积分趋势功能入口，保留快照采样、配置和 `points-ledger:series`。
- Modify: `test/points-ledger.test.js` 或当前覆盖积分趋势的测试文件 — 验证序列 RPC 和入口迁移后的行为；若文件不存在，在 `test/points-title-workbench.test.js` 覆盖该契约。
- Modify: `plugins/skin.user.js` — 将积分趋势和称号行情合并为“积分-称号” RPC 入口。
- Modify: `test/skin.test.js` — 验证唯一入口、点击后打开工作台、旧入口不再出现。
- Modify: `suite/order.js` — 在 `title-forge-planner` 后加入 `points-title-workbench`，不改 `ORDER_LTS`。
- Modify: `test/suite.test.js`、`test/lts.test.js` — 验证 Oxygen 收录、LTS 排除、版本双处一致和构建产物。
- Modify: `README.md`、`docs/CONVENTIONS.md` — 更新 Oxygen 模块清单与数量，保留旧插件作为后台提供者的说明。
- Generated: `dist/linuxsb-suite.user.js`、`dist/linuxsb-lts.user.js` — 仅通过 `npm run build` 生成并校验。

---

### Task 1: 为称号行情增加完整覆盖和按需刷新

**Files:**
- Modify: `plugins/title-quotes.user.js`
- Modify: `test/title-quotes.test.js`
- Create: `test/fixtures/gacha-market-page.html`（仅在现有行情夹具不足时）

**Interfaces:**
- Produces `title-quotes:market-data -> MarketSnapshot`。
- Produces `title-quotes:refresh() -> Promise<MarketSnapshot>`。
- `MarketSnapshot.coverage.complete === true` 仅在所有声明分页成功、没有挑战页且至少解析出有效挂单时成立。

#### Step 1: 写完整覆盖和刷新 RPC 的失败测试

在 `test/title-quotes.test.js` 增加以下行为测试，使用现有 `boot()` 和 debug 采集入口；测试只断言公开数据，不断言站点内部 listing id：

```js
test('称号行情：市场快照公开完整分页覆盖', async () => {
  const { w, dbg } = await boot()
  dbg.reset()
  dbg.ingestListings([
    { id: 'a', name: '路人甲', rarity: 'N', price: 10, qty: 36 },
    { id: 'b', name: '路人甲', rarity: 'N', price: 12, qty: 64 },
  ], 1_700_000_000_000, {
    expectedPages: 9,
    fetchedPages: 9,
    failedPages: 0,
    challengePages: 0,
  })
  const market = await w.LSB.bus.request('title-quotes:market-data')
  assert.equal(market.coverage.complete, true)
  assert.equal(market.coverage.expectedPages, 9)
  assert.deepEqual(market.listings, [
    { key: '路人甲@N', price: 10, qty: 36 },
    { key: '路人甲@N', price: 12, qty: 64 },
  ])
})

test('称号行情：分页缺失时不把部分快照标记为完整', async () => {
  const { w, dbg } = await boot()
  dbg.reset()
  dbg.ingestListings([{ id: 'a', name: '路人甲', rarity: 'N', price: 10, qty: 36 }], 1_700_000_000_000, {
    expectedPages: 9,
    fetchedPages: 8,
    failedPages: 1,
    challengePages: 0,
  })
  const market = await w.LSB.bus.request('title-quotes:market-data')
  assert.equal(market.coverage.complete, false)
  assert.equal(market.coverage.failedPages, 1)
})

test('称号行情：按需刷新复用进行中的采集请求', async () => {
  const { w, dbg } = await boot()
  dbg.reset()
  const first = w.LSB.bus.request('title-quotes:refresh')
  const second = w.LSB.bus.request('title-quotes:refresh')
  assert.equal(first, second)
  await assert.rejects(first, /market|coverage|data/i)
})
```

如果现有 `ingestListings` 尚未接受覆盖参数，测试第一次运行必须因参数被忽略或 RPC 缺失而失败；先修正测试夹具/boot 误差，再保留正确的 RED 结果。

#### Step 2: 运行 RED 测试

Run:

```text
node --test --test-force-exit test/title-quotes.test.js --test-name-pattern="完整分页覆盖|分页缺失|按需刷新"
```

Expected: FAIL because the snapshot has no `coverage` contract and no `title-quotes:refresh` handler.

#### Step 3: 实现市场覆盖状态和刷新接口

在行情采集器中：

1. 给 `ingestListings(listings, now, coverage)` 增加默认安全覆盖对象；直接 debug 注入数据默认视为单次完整采集，真实分页采集必须传入实际分页统计。
2. 采集前把页数限制为有限正整数，例如 `1 <= pages <= 100`；页数解析失败时抛出来源错误，不创建 `new Array(NaN)` 或超大数组。
3. 每一页成功解析后增加 `fetchedPages`；遇到挑战页、网络错误或解析失败时记录 `failedPages`/`challengePages`，中止本轮写入。
4. 只有全部页完成且 `listings.length > 0` 时写入新的完整 `market` 快照；失败轮次保留上一份快照并记录最近错误，不能覆盖成空数据。
5. 在 `market` 中写入 `schema: 2` 和 `coverage`，保留现有 `fetchedAt`、`listings` 和 `titles` 字段。
6. 把现有 `cycle(force)` 包成单飞的 `refreshMarket()`；`title-quotes:refresh` 返回正在进行的同一个 Promise，成功返回完整快照，失败抛出可识别的来源错误。
7. `title-quotes:market-data` 始终只返回可序列化存储快照，不返回 DOM、listing id 或表单字段。

#### Step 4: 运行 GREEN 行情测试

Run:

```text
node --test --test-force-exit test/title-quotes.test.js --test-name-pattern="完整分页覆盖|分页缺失|按需刷新|公开最近成功"
```

Expected: PASS；既有 `asc+desc 合并、listing_id 去重` 等行情测试继续通过。

#### Step 5: 阶段检查

Run:

```text
git -c core.whitespace=cr-at-eol diff --check -- plugins/title-quotes.user.js test/title-quotes.test.js test/fixtures/gacha-market-page.html
```

确认差异只涉及行情公开快照、覆盖状态和测试，不暂存或提交已有无关改动。

---

### Task 2: 将 UR 规划器整理为正式后台服务

**Files:**
- Modify: `plugins/title-forge-planner.user.js`
- Modify: `test/title-forge-planner.test.js`

**Interfaces:**
- Produces `title-forge-planner:refresh() -> { sources, data }`。
- Produces `title-forge-planner:calculate(input) -> { modes, points }`。
- Keeps `title-forge-planner:debug` for existing pure-function tests only。
- Does not register `api.ui.tab({ name: 'UR 合成规划' })`。

#### Step 1: 写正式服务接口的失败测试

在现有 `bootPlanner()` 后加入：

```js
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
```

把现有面板测试先改为调用正式 RPC 或移到工作台集成测试；第一次运行新测试应因 handler 不存在而失败。

#### Step 2: 运行 RED 测试

Run:

```text
node --test --test-force-exit test/title-forge-planner.test.js --test-name-pattern="正式刷新接口|正式计算接口|来源失败"
```

Expected: FAIL because only `title-forge-planner:debug` exists and the plugin still owns its standalone tab.

#### Step 3: 实现正式 RPC、每源超时和服务化

在规划器中：

1. 把当前 `loadSources()` 的结果规范化为 `{ sources, data }`；每个来源都保留 `status`、`fetchedAt`、`error`、`stale` 和 `issues`。
2. 加入 `withSourceTimeout(job, 10_000, signal)`；超时使用独立 `AbortController`，并将 `AbortError` 转换为用户可见的来源错误。
3. 刷新失败时恢复对应来源的上次成功缓存并标记 `stale`；没有缓存时标记 `unavailable`，不写入空配方、零概率或零库存成功状态。
4. 将 `calculatePlans` 的纯函数包装为 `title-forge-planner:calculate`，只读取传入对象，不调用 `fetch`、`api.net.doc` 或写入来源缓存。
5. 注册两个正式 handler；handler 返回深拷贝，不能让调用方修改插件内部状态。
6. 移除 `api.ui.tab` 注册和独立 UR 面板的 DOM 渲染，但保留纯函数 debug RPC，以免破坏现有单元测试和排障工具。
7. 删除规划器内部自动打开面板的路径；刷新只由正式 RPC 调用，避免与工作台重复发起。
8. 保持已有 `marketCost`、`medianCost`、`expectedGachaCost`、`calculatePlans` 的数值契约；补充对 `coverage.complete === false` 的市场输入标记最低挂单不可用。

#### Step 4: 运行 GREEN 规划器测试

Run:

```text
node --test --test-force-exit test/title-forge-planner.test.js --test-name-pattern="正式刷新接口|正式计算接口|来源失败|最低挂单按数量|市场挂单不足|抽取路线|积分足够"
```

Expected: PASS；旧的解析、路线、概率和库存测试也继续通过，且不再有独立 `UR 合成规划` tab。

#### Step 5: 阶段检查

Run:

```text
git -c core.whitespace=cr-at-eol diff --check -- plugins/title-forge-planner.user.js test/title-forge-planner.test.js
```

---

### Task 3: 隐藏旧积分入口并保持积分快照接口

**Files:**
- Modify: `plugins/points-ledger.user.js`
- Modify: `test/points-title-workbench.test.js`（在工作台测试中覆盖 provider 契约）

**Interfaces:**
- Keeps `points-ledger:series({ days = 90 }) -> [{ t, p }]` unchanged.
- Does not register a standalone “积分趋势” feature tab.
- Keeps manifest config for snapshot interval and retention days.

#### Step 1: 写入口迁移失败测试

在 `test/points-title-workbench.test.js` 的 provider boot helper 中加入：

```js
test('积分提供者：保留序列 RPC 但不注册独立积分趋势入口', async () => {
  const { w } = await bootProviders()
  const series = await w.LSB.bus.request('points-ledger:series', { days: 90 })
  assert.ok(Array.isArray(series))
  assert.equal(w.LSB.ui.tabs().some((tab) => tab.id === 'points-ledger' || tab.name === '积分趋势'), false)
})
```

如果当前基座没有公开 `ui.tabs()`，使用 `w.LSB.info().panels` 或 DOM 中的已注册入口作为断言，并在测试 helper 中固定一个可观察的行为；测试不能只检查源码字符串。

#### Step 2: 运行 RED 测试

Run:

```text
node --test --test-force-exit test/points-title-workbench.test.js --test-name-pattern="积分提供者"
```

Expected: FAIL because `points-ledger` currently registers the independent UI tab.

#### Step 3: 实现最小入口迁移

删除 `api.ui.tab({ name: '积分趋势', ... })` 的独立功能注册和只服务该面板的事件绑定；保留：

- `autoSnap` 和定时器；
- `points-ledger:series`；
- `points-ledger:debug`；
- manifest `config`，使设置系统仍能修改采样间隔和保留天数。

#### Step 4: 运行 GREEN provider 测试

Run:

```text
node --test --test-force-exit test/points-title-workbench.test.js --test-name-pattern="积分提供者"
```

Expected: PASS；序列 RPC 返回值不变。

---

### Task 4: 创建工作台数据层和刷新协调器

**Files:**
- Create: `plugins/points-title-workbench.user.js`
- Create: `test/points-title-workbench.test.js`
- Reuse: `test/fixtures/gacha.html`, `test/fixtures/gacha-recipes.html`, `test/fixtures/gacha-profile.html`

**Interfaces:**
- Manifest id: `points-title-workbench`。
- Manifest version: `0.1.0`。
- Produces `points-title-workbench:open()`。
- Internal `refresh()` is single-flight and returns the same Promise for concurrent callers.
- Internal snapshot shape: `{ savedAt, sources, data, plans, calculatedAt }`。

#### Step 1: 写缓存、刷新和局部失败的失败测试

在 `test/points-title-workbench.test.js` 写独立 helper：

```js
const BASE = readFileSync(new URL('../dist/linuxsb-base.user.js', import.meta.url), 'utf8')
const PLUG = (name) => readFileSync(new URL(`../plugins/${name}`, import.meta.url), 'utf8')

async function bootWorkbench({ preload = {}, fetchGacha = fixture('gacha.html') } = {}) {
  const { w, tick } = makeDom(loggedInHome(500), 'https://linux.sb/', preload)
  const calls = []
  w.fetch = async (url, init = {}) => {
    const href = String(url)
    calls.push({ href, method: (init.method || 'GET').toUpperCase() })
    const path = new URL(href, 'https://linux.sb/').pathname
    const body = path === '/gacha_recipes' ? fixture('gacha-recipes.html')
      : path === '/gacha' ? fetchGacha
      : path === '/gacha_profile' ? fixture('gacha-profile.html')
      : ''
    return { ok: true, status: 200, url: href, text: async () => body }
  }
  await loadBase(w,
    PLUG('points-ledger.user.js'),
    PLUG('title-quotes.user.js'),
    PLUG('title-forge-planner.user.js'),
    PLUG('points-title-workbench.user.js'),
  )
  return { w, calls, tick }
}

test('工作台：打开后默认总览并复用缓存，同时启动单飞刷新', async () => {
  const cached = {
    savedAt: 1_700_000_000_000,
    sources: { recipes: { status: 'stale' }, gacha: { status: 'stale' }, inventory: { status: 'stale' }, market: { status: 'stale' } },
    data: fixtureDataWithPoints(500),
    plans: null,
  }
  const { w, calls } = await bootWorkbench({ preload: { 'lsb_base:points-title-workbench:snapshot': cached } })
  const first = w.LSB.bus.request('points-title-workbench:open')
  const second = w.LSB.bus.request('points-title-workbench:open')
  assert.equal(first, second)
  await new Promise((resolve) => setTimeout(resolve, 0))
  const root = w.document.querySelector('[data-points-title-workbench]')
  assert.ok(root)
  assert.match(root.querySelector('[data-workbench-view="overview"]').textContent, /总览|当前积分/)
  assert.equal(root.querySelector('[data-workbench-tab].is-active')?.dataset.workbenchTab, 'overview')
  assert.ok(calls.length > 0)
})

test('工作台：行情失败时保留其他来源并停用行情依赖路线', async () => {
  const { w } = await bootWorkbench({ fetchGacha: '<html><body>Cloudflare challenge</body></html>' })
  await w.LSB.bus.request('points-title-workbench:open')
  const until = async (fn) => { const end = Date.now() + 1000; while (Date.now() < end) { if (fn()) return true; await new Promise((r) => setTimeout(r, 10)) } return false }
  assert.equal(await until(() => !w.document.querySelector('[data-workbench-source="gacha"] .is-loading')), true)
  const root = w.document.querySelector('[data-points-title-workbench]')
  assert.match(root.querySelector('[data-workbench-source="gacha"]').textContent, /页面格式无法识别|无法确认库存数据|数据不足/)
  assert.ok(root.querySelector('[data-workbench-mode="no-inventory"]'))
  assert.equal(root.querySelector('[data-workbench-route="gacha"]')?.dataset.status, 'unavailable')
})

test('工作台：刷新不产生站内写请求', async () => {
  const { w, calls } = await bootWorkbench()
  await w.LSB.bus.request('points-title-workbench:open')
  await new Promise((resolve) => setTimeout(resolve, 40))
  assert.equal(calls.some((x) => x.method !== 'GET' || /_buy|_forge|draw|compose/i.test(x.href)), false)
})
```

先运行该测试，确保工作台文件不存在时因注册/handler 缺失而失败。

#### Step 2: 运行 RED 测试

Run:

```text
node --test --test-force-exit test/points-title-workbench.test.js --test-name-pattern="打开后默认总览|行情失败|不产生站内写"
```

Expected: FAIL because `points-title-workbench.user.js` has not been created.

#### Step 3: 实现 manifest、快照和刷新协调

创建 userscript 头和 manifest：

```js
// @name         LSB·积分-称号工作台
// @version      0.1.0
// @match        https://linux.sb/*
// @grant        none
// @run-at       document-end
// @noframes

const manifest = {
  id: 'points-title-workbench',
  name: '积分-称号工作台',
  version: '0.1.0',
  description: '统一查看积分、称号行情和 UR 合成规划',
  author: 'you',
  requires: {
    base: '^0.2.2',
    plugins: {
      'points-ledger': '^1.0.2',
      'title-quotes': '^1.0.19',
      'title-forge-planner': '^0.1.0',
    },
  },
  permissions: ['read', 'storage', 'ui', 'events'],
}
```

实现以下最小内部函数并优先用纯函数测试它们：

- `safeSnapshot(value)`：只保存 JSON 可序列化且有限长度的数据。
- `sourceState(status, fetchedAt, error, stale, issues)`：统一来源状态。
- `withTimeout(promiseFactory, 10_000, signal)`：超时返回来源错误并响应销毁信号。
- `clampRect(rect, viewport)`：把窗口矩形限制在视口内并修正非法宽高。
- `refresh()`：如果已有 `refreshPromise`，直接返回它；否则并行请求 `title-quotes:refresh`、`title-forge-planner:refresh`、`points-ledger:series` 和当前积分，逐来源更新内存快照，最后调用 `title-forge-planner:calculate`。

缓存读取必须在刷新开始前完成；刷新失败不能清空缓存。缓存不完整时只将相关来源标记 `unavailable`，不要用默认零值继续计算。窗口关闭和 `api.onDispose` 必须取消未完成刷新。

#### Step 4: 运行 GREEN 数据层测试

Run:

```text
node --test --test-force-exit test/points-title-workbench.test.js --test-name-pattern="打开后默认总览|行情失败|不产生站内写|积分提供者"
```

Expected: PASS；并确认 refresh 调用是单飞的，来源错误不会阻塞不依赖该来源的视图。

#### Step 5: 阶段检查

Run:

```text
git -c core.whitespace=cr-at-eol diff --check -- plugins/points-title-workbench.user.js test/points-title-workbench.test.js
```

---

### Task 5: 实现窗口和四个视图

**Files:**
- Modify: `plugins/points-title-workbench.user.js`
- Modify: `test/points-title-workbench.test.js`

**Interfaces:**
- Root: `[data-points-title-workbench]`。
- Window: `.lsb-points-title-workbench`。
- Tabs: `[data-workbench-tab="overview|points|market|forge"]`。
- Views: `[data-workbench-view="overview|points|market|forge"]`。
- Source rows: `[data-workbench-source="points|recipes|gacha|inventory|market"]`。
- Modes: `[data-workbench-mode="no-inventory|inventory"]`。
- Routes: `[data-workbench-route="market-low|market-median|gacha"]`。
- Refresh button: `[data-workbench-refresh]`。

#### Step 1: 写视图和窗口行为的失败测试

加入：

```js
test('工作台：总览显示两种模式和三类路线', async () => {
  const { w } = await bootWorkbench()
  await w.LSB.bus.request('points-title-workbench:open')
  await until(() => w.document.querySelector('[data-workbench-route="market-low"]'))
  const root = w.document.querySelector('[data-points-title-workbench]')
  assert.ok(root.querySelector('[data-workbench-mode="no-inventory"]'))
  assert.ok(root.querySelector('[data-workbench-mode="inventory"]'))
  assert.ok(root.querySelector('[data-workbench-route="market-low"]'))
  assert.ok(root.querySelector('[data-workbench-route="market-median"]'))
  assert.ok(root.querySelector('[data-workbench-route="gacha"]'))
  assert.match(root.textContent, /期望值，不保证实际结果/)
})

test('工作台：窄屏使用单列且窗口矩形保持在视口内', async () => {
  const { w } = await bootWorkbench()
  Object.defineProperty(w, 'innerWidth', { configurable: true, value: 360 })
  Object.defineProperty(w, 'innerHeight', { configurable: true, value: 640 })
  await w.LSB.bus.request('points-title-workbench:open')
  const root = w.document.querySelector('[data-points-title-workbench]')
  assert.match(root.querySelector('style')?.textContent || '', /max-width|grid-template-columns|@media/)
  const dbg = await w.LSB.bus.request('points-title-workbench:debug')
  const rect = dbg.state().rect
  assert.ok(rect.left >= 0 && rect.top >= 0)
  assert.ok(rect.left + rect.width <= 360)
  assert.ok(rect.top + rect.height <= 640)
})

test('工作台：无完整来源时显示固定错误文案而不是无限读取', async () => {
  const { w } = await bootWorkbench({ fetchGacha: '<html><body>登录</body></html>' })
  await w.LSB.bus.request('points-title-workbench:open')
  await until(() => !w.document.querySelector('[data-workbench-source="gacha"] .is-loading'))
  const text = w.document.querySelector('[data-points-title-workbench]').textContent
  assert.match(text, /页面格式无法识别|无法确认库存数据|合成表数据不足|数据不足/)
  assert.doesNotMatch(text, /读取数据读取数据读取数据/)
})
```

#### Step 2: 运行 RED 测试

Run:

```text
node --test --test-force-exit test/points-title-workbench.test.js --test-name-pattern="两种模式|窄屏|固定错误文案"
```

Expected: FAIL because the window renderer and view selectors do not exist.

#### Step 3: 实现浮层和视图渲染

在工作台中实现：

1. `openWindow()`：创建唯一浮层，默认激活 `overview`；重复打开只将现有窗口带回并触发单飞刷新。
2. 标题栏：显示“积分-称号工作台”，绑定 pointer drag；实现右下角 resize；每次 pointerup 使用 `clampRect` 后持久化。
3. 控件：收起、关闭、刷新按钮。关闭只卸载窗口，不删除缓存；重新打开仍自动刷新。
4. 标签：总览、积分、行情、UR 规划。切换只更换内部视图，不重新创建来源请求；默认每次新打开为总览。
5. 总览：积分摘要、行情覆盖、趋势/行情双栏、两种库存模式摘要。
6. 积分：用 `points-ledger:series` 绘制有限点数的 SVG 趋势；点数不足时显示空状态，不调用 `Math.min(...[])`。
7. 行情：列出完整性、页数、更新时间、最低挂单步骤和中位价估算。
8. UR：按目标渲染两种模式，固定渲染 `market-low`、`market-median`、`gacha`；路线不可用时显示来源错误和具体市场缺口。
9. 所有动态内容使用 `api.util.esc`；所有 `map` 前确认是有限数组；所有成本、数量和页数先用 `Number.isFinite` 检查。
10. CSS 使用工作台专属前缀；宽屏使用摘要卡片 + 趋势/行情双栏；`max-width: 760px` 以下改为单列并允许标签横向滚动。

新增 `points-title-workbench:debug` 仅返回测试需要的 `clampRect`、`state`、`refresh` 和当前视图，不让生产入口依赖 debug。

#### Step 4: 运行 GREEN 视图测试

Run:

```text
node --test --test-force-exit test/points-title-workbench.test.js --test-name-pattern="总览显示|窄屏|固定错误文案"
```

Expected: PASS；同时确认 JSDOM 下没有 `Invalid array length` 或未处理 Promise rejection。

---

### Task 6: 合并氢壳入口并移除旧全局浮层

**Files:**
- Modify: `plugins/skin.user.js`
- Modify: `plugins/title-quotes.user.js`
- Modify: `plugins/title-forge-planner.user.js`
- Modify: `test/skin.test.js`
- Modify: `test/title-quotes.test.js`
- Modify: `test/title-forge-planner.test.js`

**Interfaces:**
- `PLUGIN_FEATURES` only exposes `{ plugin: 'points-title-workbench', rpc: 'points-title-workbench:open', label: '积分-称号' }` for the three merged features.
- `title-quotes` keeps market-page embed but does not expose a skin feature for its old global float.
- `title-forge-planner` has no standalone UI tab.

#### Step 1: 写入口迁移失败测试

在 `test/skin.test.js` 增加真实插件 boot 测试：

```js
test('氢壳：积分和称号功能合并为一个工作台入口', async () => {
  const { w } = makeHome()
  await loadBase(w,
    PLUG('points-ledger.user.js'),
    PLUG('title-quotes.user.js'),
    PLUG('title-forge-planner.user.js'),
    PLUG('points-title-workbench.user.js'),
    PLUG('skin.user.js'),
  )
  const tools = shell(w).querySelector('[data-lsb-shell-section="tools"]')
  const labels = [...tools.querySelectorAll('.lsb-shell-link')].map((el) => el.textContent.trim())
  assert.equal(labels.filter((x) => x === '积分-称号').length, 1)
  assert.equal(labels.includes('积分趋势'), false)
  assert.equal(labels.includes('称号行情'), false)
  assert.equal(labels.includes('UR 合成规划'), false)
  const button = [...tools.querySelectorAll('.lsb-shell-link')].find((el) => /积分-称号/.test(el.textContent))
  button.click()
  await new Promise((resolve) => setTimeout(resolve, 0))
  assert.ok(w.document.querySelector('[data-points-title-workbench]'))
})
```

在交易页测试中保留对 `.lsb-title-quotes-embed` 的断言；单独浮层/FAB 断言改为不存在。

#### Step 2: 运行 RED 测试

Run:

```text
node --test --test-force-exit test/skin.test.js test/title-quotes.test.js test/title-forge-planner.test.js --test-name-pattern="合并为一个工作台|独立浮层|独立 UR"
```

Expected: FAIL because `skin` still lists the two old providers and provider UI registrations still exist.

#### Step 3: 实现入口迁移

1. 将 `PLUGIN_FEATURES` 中 `points-ledger`、`title-quotes` 两项替换为单个 workbench RPC 项。
2. 删除 `title-quotes` 的全局 FAB、独立 float 的用户入口和 `title-quotes:open` skin 依赖；保留采集器、市场页嵌入、配置和正式数据 RPC。
3. 删除 `title-forge-planner` 的 `api.ui.tab`；保留配置、解析/计算函数和正式 RPC。
4. 确保 provider 被停用时，skin 会过滤掉 workbench 入口；workbench 的依赖状态不应在 skin 中显示成旧入口。
5. 不修改 AI、三段式 UI、iOS 27 或主页资料卡相关逻辑。

#### Step 4: 运行 GREEN 入口测试

Run:

```text
node --test --test-force-exit test/skin.test.js test/title-quotes.test.js test/title-forge-planner.test.js --test-name-pattern="合并为一个工作台|独立浮层|独立 UR|交易页行情"
```

Expected: PASS；交易页行情仍存在，旧全局入口不再出现。

---

### Task 7: 加入 Oxygen、更新文档并重建产物

**Files:**
- Modify: `suite/order.js`
- Modify: `test/suite.test.js`
- Modify: `test/lts.test.js`
- Modify: `README.md`
- Modify: `docs/CONVENTIONS.md`
- Generated by build: `dist/linuxsb-suite.user.js`, `dist/linuxsb-lts.user.js`

**Interfaces:**
- `ORDER` contains `points-title-workbench` immediately after `title-forge-planner`。
- `ORDER_LTS` does not contain `title-forge-planner` or `points-title-workbench`。
- Oxygen module count becomes current count plus one; with the current 25-module baseline this is 26。
- LTS remains unchanged in module membership.

#### Step 1: 写收录失败测试

在 `test/suite.test.js` 增加：

```js
test('积分-称号工作台：紧跟 UR 规划进入 Oxygen 且不进入 LTS', () => {
  const planner = MEMBERS.indexOf('title-forge-planner')
  assert.equal(MEMBERS[planner + 1], 'points-title-workbench')
  assert.equal(ORDER_LTS.includes('points-title-workbench'), false)
  const source = readFileSync(new URL('../plugins/points-title-workbench.user.js', import.meta.url), 'utf8')
  assert.match(source, /@version\s+0\.1\.0/)
  assert.match(source, /version:\s*'0\.1\.0'/)
  assert.match(source, /id:\s*'points-title-workbench'/)
  assert.doesNotMatch(ltsCode, /id:\s*'points-title-workbench'/)
})
```

把模块数断言改成当前 `ORDER.length + 1` 或明确的 26，先运行确认失败原因来自收录/新插件/产物。

#### Step 2: 运行 RED 套件测试

Run:

```text
node --test --test-force-exit test/suite.test.js test/lts.test.js --test-name-pattern="积分-称号工作台|套件收录完整|LTS|版本号双处对齐"
```

Expected: FAIL because `ORDER` and the generated suite do not include the new plugin.

#### Step 3: 更新收录和文档

1. 在 `suite/order.js` 的 `title-forge-planner` 后加入 `points-title-workbench`；不改 `ORDER_LTS`。
2. 更新 README 的 Oxygen 模块数量、模块表和入口说明；说明三类 provider 不再显示独立功能入口。
3. 更新 `docs/CONVENTIONS.md` 的 Oxygen 模块数和入口约束；保留 Hydrogen/LTS 版本原值。
4. 运行 `npm run build`，让 suite 和 LTS 产物按 ORDER 自动生成；不要手工改 dist。
5. 用 `npm run verify:dist` 检查新插件进入 Oxygen、不进入 LTS、头部和 manifest 版本一致。

#### Step 4: 运行 GREEN 套件测试

Run:

```text
node --test --test-force-exit test/suite.test.js test/lts.test.js --test-name-pattern="积分-称号工作台|套件收录完整|LTS|版本号双处对齐"
npm run verify:dist
```

Expected: PASS；输出显示 Oxygen 模块数量为 26，LTS 不含 workbench。

#### Step 5: 阶段检查

Run:

```text
git -c core.whitespace=cr-at-eol diff --check -- suite/order.js test/suite.test.js test/lts.test.js README.md docs/CONVENTIONS.md
```

---

### Task 8: 全量回归和交付前验证

**Files:**
- Test: `test/title-quotes.test.js`
- Test: `test/title-forge-planner.test.js`
- Test: `test/points-title-workbench.test.js`
- Test: repository-wide build and verification commands

#### Step 1: 运行专项测试

```text
node --test --test-force-exit test/title-quotes.test.js test/title-forge-planner.test.js test/points-title-workbench.test.js
```

确认行情覆盖、路线计算、来源状态、窗口渲染和入口迁移都通过；JSDOM 已知的 `window.scrollTo` 日志可以存在，但不得有新增未处理异常。

#### Step 2: 运行全量测试

```text
npm test
```

记录实际测试总数、通过数、失败数和跳过数。任何失败先定位到本任务新增行为，不修改测试来掩盖失败。

#### Step 3: 重建并校验产物

```text
npm run build
npm run verify:dist
git -c core.whitespace=cr-at-eol diff --check
```

确认构建产物来自当前源码，Oxygen 包含工作台，LTS 不含工作台，且差异检查无输出。

#### Step 4: 检查工作区范围

```text
git status --short
git diff --name-only
```

确认工作台相关新文件和修改存在，用户已有的 AI、皮肤、iOS 27、artifacts 及其它未跟踪文件仍然保留；不执行清理。

#### Step 5: 交付前行为清单

- [ ] 氢壳工具栏只显示“积分-称号”。
- [ ] 打开后是可拖动悬浮窗口，默认“总览”。
- [ ] 打开先显示缓存，再自动刷新；10 秒后不会永久 loading。
- [ ] 两种库存模式和三类路线同时显示。
- [ ] `路人甲@N` 的 36 个挂单会继续累加后续挂单到 100 个。
- [ ] 中位价低于最低挂单时仍标注为估算，不改写最低挂单事实。
- [ ] 真·富可敌国的缺口显示具体材料数量，不笼统显示不可用。
- [ ] `页面格式无法识别`、`无法确认库存数据`、`合成表数据不足` 出现在对应来源状态。
- [ ] 任何请求记录中没有 POST、购买、抽奖或合成写请求。
- [ ] 窄屏无横向溢出，窗口位置/尺寸恢复后仍在视口内。
