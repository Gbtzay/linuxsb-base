# 本日 K 柱宽 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 本日挂单合成 K（行情柱 + 大盘指数 K）可在 1 / 5 / 15 / 30 / 60 分钟里选柱宽；7 / 30 / 90 天与折线不动。

**Architecture:** 顶层纯函数 `periodMs(rangeDays, barMin)` 决定桶宽。`foldCandles` / `fmtBarTip` 经 opts 传入 `barMin`，不读 store。`setup` 里 `barMin` 存 `api.store`，`render` 画钮并把当前值传进收柱与悬停。浮层与交易页嵌入共用 `render`。

**Tech Stack:** `plugins/title-quotes.user.js`、jsdom `node:test`、`node build-suite.mjs`。

## Global Constraints

- Spec：`docs/superpowers/specs/2026-08-27-title-quotes-bar-min-design.md`
- 插件 `1.0.15` → `1.0.16`（Task 3 才改号）；氧 `SUITE_VERSION` / `suite-center` `1.0.93` → `1.0.94`（Task 3）；氢 `0.1.33` 不动；不改 `ORDER`
- 不改 7 / 30 / 90 天柱宽；折线仍按快照连；氧面板不加柱宽字段；不改采集 / `series` / `MERGE_MS`；不写购买；不新插件
- 源文件 UTF-8 无 BOM、LF；Windows PowerShell 不要用 `&&`（分号或两条命令）
- 用户未明确要求则不要 `git commit`；各 Task 末步标 Skip
- 文案锁定：钮 **1分** **5分** **15分** **30分** **60分**；`data-bar-min="1"` 等；store 键 `barMin`（数字，默认 30）
- 测试走 `plugins/*.user.js`（不是 dist）。Windows 上 `node --test` 若沙箱失败，用全权限再跑

---

### Task 1: `periodMs` / `foldCandles` / `fmtBarTip` 吃 `barMin`

**Files:**
- Modify: `test/title-quotes.test.js`（扩现有 `periodMs` 用例；新增本日 5 分收柱与悬停跨度）
- Modify: `plugins/title-quotes.user.js`（顶层 `periodMs`、`foldCandles`、`fmtBarTip`）

**Interfaces:**
- Consumes: 现有 `periodMs(rangeDays)`、`foldCandles(series, key, { rangeDays, now })`、`fmtBarTip(bar, rangeDays)`
- Produces:
  - `periodMs(rangeDays, barMin?) => number`
  - `foldCandles(series, key, { rangeDays, now, barMin } = {})`
  - `fmtBarTip(bar, rangeDays, barMin?)`
  - 本日非法 / 缺省 `barMin` → 30 分钟；7 / 30 / 90 忽略 `barMin`

- [ ] **Step 1: Write the failing tests**

在 `test('称号行情：periodMs 随 7/30/90 天切换')` 里**追加**断言（保留原四行）：

```js
  assert.equal(dbg.periodMs(0, 1), 60e3)
  assert.equal(dbg.periodMs(0, 5), 5 * 60e3)
  assert.equal(dbg.periodMs(0, 15), 15 * 60e3)
  assert.equal(dbg.periodMs(0, 30), 30 * 60e3)
  assert.equal(dbg.periodMs(0, 60), 60 * 60e3)
  assert.equal(dbg.periodMs(0, 7), 30 * 60e3, '非法分钟回落 30')
  assert.equal(dbg.periodMs(0, 'nope'), 30 * 60e3)
  assert.equal(dbg.periodMs(7, 1), 4 * 3600e3, '7 天忽略 barMin')
  assert.equal(dbg.periodMs(30, 5), 864e5)
  assert.equal(dbg.periodMs(90, 60), 3 * 864e5)
```

紧挨该测试之后插入：

```js
test('称号行情：本日 barMin=5 时两笔相隔 6 分钟收成两根', async () => {
  const { dbg } = await boot()
  const now = new Date()
  now.setHours(15, 10, 0, 0)
  const n = now.getTime()
  const key = 'A@N'
  const q = { [key]: { lo: 1, hi: 3, mid: 2 } }
  const series = [
    { t: n - 6 * 60e3, titles: q },
    { t: n - 60e3, titles: q },
  ]
  const bars30 = dbg.foldCandles(series, key, { rangeDays: 0, now: n, barMin: 30 })
  const bars5 = dbg.foldCandles(series, key, { rangeDays: 0, now: n, barMin: 5 })
  assert.equal(bars30.length, 1, '默认 30 分仍收成一根')
  assert.ok(bars5.length >= 2, '5 分档应拆成至少两根')
  assert.equal(bars5[1].t - bars5[0].t, 5 * 60e3)
})

test('称号行情：本日悬停时段跟 barMin 走', async () => {
  const { dbg } = await boot()
  const t0 = Date.parse('2026-08-27T12:00:00')
  const tip = dbg.fmtBarTip({ t: t0, o: 1, h: 2, l: 1, c: 2 }, 0, 5)
  const m = tip.match(/(\d{2}):(\d{2})–(\d{2}):(\d{2})/)
  assert.ok(m, `应有本日时刻区间，实际：${tip.slice(0, 40)}`)
  const a = Number(m[1]) * 60 + Number(m[2])
  const b = Number(m[3]) * 60 + Number(m[4])
  let diff = b - a
  if (diff < 0) diff += 24 * 60
  assert.equal(diff, 5)
})
```

- [ ] **Step 2: Run tests to verify they fail**

Run:

```
node --test --test-force-exit --test-concurrency=1 --test-name-pattern "periodMs 随|本日 barMin=5|本日悬停时段" test/title-quotes.test.js
```

Expected: `periodMs(0, 5)` 仍是 30 分钟（第二参被忽略）故第一或第二用例红；`fmtBarTip(..., 0, 5)` 时段仍跨 30 分钟故第三用例红。不要在实现后才第一次跑。

- [ ] **Step 3: Minimal implementation**

In `plugins/title-quotes.user.js` replace `periodMs`:

```js
  function periodMs(rangeDays, barMin) {
    const d = Number(rangeDays)
    if (d === 0) {
      const m = Number(barMin)
      if (m === 1 || m === 5 || m === 15 || m === 30 || m === 60) return m * 60e3
      return 30 * 60e3
    }
    if (!Number.isFinite(d) || d < 0) return 4 * 3600e3
    if (d <= 7) return 4 * 3600e3
    if (d <= 30) return 864e5
    return 3 * 864e5
  }
```

`foldCandles` 的 opts 增加 `barMin`，桶宽改读它：

```js
  function foldCandles(series, key, { rangeDays = 7, now = Date.now(), barMin } = {}) {
    const period = periodMs(rangeDays, barMin)
```

其余 `foldCandles` 函数体不动。`foldIndexCandles(points, opts)` 已经 `return foldCandles(series, key, opts)`，opts 带 `barMin` 会自动往下传，本 Task 不要改它的签名。

`fmtBarTip` 增加第三参：

```js
  function fmtBarTip(bar, rangeDays, barMin) {
    const t = Number(bar.t)
    const o = Number(bar.o)
    const h = Number(bar.h)
    const l = Number(bar.l)
    const c = Number(bar.c)
    const chg = c - o
    const sign = chg > 0 ? '+' : ''
    const when = `${fmtTime(t, rangeDays)}–${fmtTime(t + periodMs(rangeDays, barMin), rangeDays)}`
```

后面拼行逻辑不动。已有 `fmtBarTip(bar, 7)` 不传第三参 → 本日才用到缺省 30 分；7 天忽略 `barMin`，旧用例继续绿。

- [ ] **Step 4: Run tests to verify they pass**

Run 与 Step 2 相同命令。Expected: 上述用例全绿。再跑：

```
node --test --test-force-exit --test-concurrency=1 --test-name-pattern "periodMs 随|同一小时三笔|下一根开|本日只收当天|有叠加字段时悬停" test/title-quotes.test.js
```

Expected: 全绿（7 天桶与旧悬停未改语义）。

- [ ] **Step 5: Commit**

Skip unless the user asked to commit.

---

### Task 2: 本日工具条 + store + 画图接线

**Files:**
- Modify: `test/title-quotes.test.js`（浮层点本日 / 折线 / 7 天 / 大盘 / 关再开）
- Modify: `plugins/title-quotes.user.js`（`getBarMin` / `setBarMin`、chips、`render` / `candles` / `timeWindow` / 悬停传 `barMin`）

**Interfaces:**
- Consumes: Task 1 的 `periodMs(rangeDays, barMin)`、`foldCandles(..., { barMin })`、`fmtBarTip(bar, rangeDays, barMin)`
- Produces: store 键 `barMin`；`getBarMin()` → `1|5|15|30|60`（非法回 30）；`setBarMin(n)` 只写入合法档；本日且（大盘 **或** 行情 K 线）时工具条出现 `data-bar-min`；debug 增加 `barMin: getBarMin`

- [ ] **Step 1: Write the failing tests**

插在 `test('称号行情：可选本日；K 线悬停给出开高低收')` 之后：

```js
test('称号行情：本日 K 才出现柱宽钮；5 分会记住', async () => {
  const { w, dbg } = await boot()
  const view = await quotesView(w, dbg)
  assert.equal(view.querySelector('[data-bar-min]'), null, '默认 7 天不应有柱宽钮')
  view.querySelector('[data-range="0"]').click()
  const mins = [...view.querySelectorAll('[data-bar-min]')].map((b) => b.getAttribute('data-bar-min'))
  assert.deepEqual(mins, ['1', '5', '15', '30', '60'])
  assert.equal(view.querySelector('[data-bar-min="30"]')?.textContent.trim(), '30分')
  assert.ok(view.querySelector('[data-bar-min="30"]')?.classList.contains('is-primary'))
  assert.equal(view.querySelector('[data-bar-min="1"]')?.textContent.trim(), '1分')
  assert.equal(view.querySelector('[data-bar-min="5"]')?.textContent.trim(), '5分')
  assert.equal(view.querySelector('[data-bar-min="15"]')?.textContent.trim(), '15分')
  assert.equal(view.querySelector('[data-bar-min="60"]')?.textContent.trim(), '60分')
  view.querySelector('[data-bar-min="5"]').click()
  assert.ok(view.querySelector('[data-bar-min="5"]')?.classList.contains('is-primary'))
  assert.equal(dbg.barMin(), 5)
  assert.equal(JSON.parse(w.localStorage.getItem('lsb_base:title-quotes:barMin')), 5)

  view.querySelector('[data-chart="line"]').click()
  assert.equal(view.querySelector('[data-bar-min]'), null, '折线不按档收点')
  view.querySelector('[data-chart="candle"]').click()
  assert.ok(view.querySelector('[data-bar-min="5"]')?.classList.contains('is-primary'), '切回 K 仍是 5 分')

  view.querySelector('[data-range="7"]').click()
  assert.equal(view.querySelector('[data-bar-min]'), null, '7 天不应有柱宽钮')
  view.querySelector('[data-range="0"]').click()
  assert.ok(view.querySelector('[data-bar-min="5"]')?.classList.contains('is-primary'), '回本日仍是 5 分')

  view.querySelector('[data-board-view="board"]').click()
  assert.ok(view.querySelector('[data-bar-min="5"]'), '大盘本日也有柱宽钮')
  assert.ok(view.querySelector('[data-bar-min="5"]')?.classList.contains('is-primary'))

  dbg.closeFloat()
  await dbg.openFloat()
  const again = w.document.querySelector('.lsb-title-quotes-float-body')
  again.querySelector('[data-range="0"]').click()
  assert.ok(again.querySelector('[data-bar-min="5"]')?.classList.contains('is-primary'), '关掉再打开仍是 5 分')
})
```

`dbg.barMin` 此刻不存在，用例会红。不要先改插件再写测试。

- [ ] **Step 2: Run test to verify it fails**

Run:

```
node --test --test-force-exit --test-concurrency=1 --test-name-pattern "本日 K 才出现柱宽钮" test/title-quotes.test.js
```

Expected: 点本日后找不到 `[data-bar-min]`（或 `dbg.barMin` 不是函数）。

- [ ] **Step 3: Minimal implementation**

In `setup`，紧挨 `getKind` / `setKind` 加上：

```js
    const getBarMin = () => {
      const m = Number(api.store.get('barMin', 30))
      return m === 1 || m === 5 || m === 15 || m === 30 || m === 60 ? m : 30
    }
    const setBarMin = (n) => api.store.set('barMin', getBarMin.call && (Number(n) === 1 || Number(n) === 5 || Number(n) === 15 || Number(n) === 30 || Number(n) === 60) ? Number(n) : 30)
```

不要用上面那行自调用糊弄。写成：

```js
    const getBarMin = () => {
      const m = Number(api.store.get('barMin', 30))
      return m === 1 || m === 5 || m === 15 || m === 30 || m === 60 ? m : 30
    }
    const setBarMin = (n) => {
      const m = Number(n)
      api.store.set('barMin', m === 1 || m === 5 || m === 15 || m === 30 || m === 60 ? m : 30)
    }
```

`timeWindow` 增加第四参并传给 `periodMs`（本日最短跨度公式不变：`max(当前周期, 30min)`，60 分档自然变成至少 60 分）：

```js
    function timeWindow(times, rangeDays, now, barMin) {
      const tMax = now
      const rangeMin = rangeCutoff(rangeDays, now)
      const nums = (times || []).filter((t) => Number.isFinite(t) && t <= tMax)
      const inRange = nums.filter((t) => t >= rangeMin)
      const src = inRange.length ? inRange : rangeDays === 0 ? nums.filter((t) => t >= rangeMin) : nums
      const dataMin = src.length ? Math.min(...src) : rangeMin
      let tMin = Math.max(rangeMin, Math.min(dataMin, tMax))
      const period = periodMs(rangeDays, barMin)
      const minSpan = Math.max(period, rangeDays === 0 ? 30 * 60e3 : 3600e3)
      if (tMax - tMin < minSpan) tMin = Math.max(rangeMin, tMax - minSpan)
      const pad = Math.max((tMax - tMin) * 0.05, period * 0.35)
      tMin = Math.max(rangeMin, tMin - pad)
      return { tMin, tMax: tMax + pad * 0.12 }
    }
```

`lines(...)` 里现有 `timeWindow(times, rangeDays, now)` 改成 `timeWindow(times, rangeDays, now, getBarMin())`。

`candles` 签名保持 `(bars, rangeDays, now, overlayRows)`，函数体内：

```js
      const barMin = getBarMin()
      const period = periodMs(rangeDays, barMin)
```

并把 `timeWindow(bars.map(...), rangeDays, now)` 改成带 `barMin` 的四参调用。不要给 `candles` 再加第五参。

`render` 里：

1. 在 `rangeBtns` 之后、`tools` 之前构造柱宽钮。只在 `rangeDays === 0` 且（`boardView === 'board'` 或 `kind !== 'line'`）时输出，否则空串：

```js
      const barMin = getBarMin()
      const showBarMin = rangeDays === 0 && (boardView === 'board' || kind !== 'line')
      const barMinBtns = showBarMin
        ? [1, 5, 15, 30, 60]
            .map(
              (m) =>
                `<button type="button" class="lsb-btn${barMin === m ? ' is-primary' : ''}" data-bar-min="${m}">${m}分</button>`,
            )
            .join('')
        : ''
```

2. `tools` 里时间窗 span 右侧接上柱宽（有才渲染）：

```js
      const tools = `<span style="display:flex;gap:6px;align-items:center">${viewBtns}</span>
        <span style="margin-left:auto;display:flex;gap:8px;align-items:center">
          ${chartBtns ? `<span style="display:flex;gap:6px">${chartBtns}</span>` : ''}
          <span style="display:flex;gap:6px">${rangeBtns}</span>
          ${barMinBtns ? `<span style="display:flex;gap:6px">${barMinBtns}</span>` : ''}
        </span>`
```

3. 所有 `foldCandles(all, k, { rangeDays })` 改成 `{ rangeDays, barMin }`（`barMin` 即本轮 `getBarMin()`）。`foldIndexCandles(indexPoints(all, boardRarity), { rangeDays })` 同样加上 `barMin`。

4. 绑点：与 `[data-range]` 并列：

```js
      host.querySelectorAll('[data-bar-min]').forEach((b) => {
        b.onclick = () => {
          setBarMin(Number(b.getAttribute('data-bar-min')))
          render(host)
        }
      })
```

点柱宽钮只改 `barMin` 并重画，不要改 `rangeDays` / `kind` / `boardView`。

5. 悬停：`fmtBarTip(g.dataset, rangeDays)` 改成 `fmtBarTip(g.dataset, rangeDays, getBarMin())`。

6. debug handle 增加一行：`barMin: getBarMin`（与 `openFloat` 同级）。

氧面板 `api.ui.tab` 的 `render` **不要**加柱宽字段。

- [ ] **Step 4: Run tests to verify they pass**

Run:

```
node --test --test-force-exit --test-concurrency=1 --test-name-pattern "本日 K 才出现柱宽钮|可选本日|氧面板是设置加打开浮层|氢壳开着时不挂|大盘视图无四锚点" test/title-quotes.test.js
```

Expected: 全绿。若「本日 K 才出现柱宽钮」里关浮层再开后 `rangeDays` 仍是 0，测试里仍 `click` 了本日，两种都可。`dbg.barMin` 必须是函数并返回 5。

再跑整文件：

```
node --test --test-force-exit --test-concurrency=1 test/title-quotes.test.js
```

Expected: 全绿。

- [ ] **Step 5: Commit**

Skip unless the user asked to commit.

---

### Task 3: 版本、RC 文档、打包

**Files:**
- Modify: `plugins/title-quotes.user.js`（`@version` 与 `manifest.version` 必须同号 `1.0.16`）
- Modify: `build-suite.mjs`（`SUITE_VERSION = '1.0.94'`）
- Modify: `suite/suite-center.js`（`version: '1.0.94'`）
- Modify: `docs/CONVENTIONS.md`、`docs/功能征集-rc-ga.md`、`docs/测试招募-氢氧-beta.md`、`docs/已知问题-rc.md`（氧 **1.0.93** → **1.0.94**；氢仍 0.1.33）

**Interfaces:**
- Consumes: Task 1–2 已绿的插件行为
- Produces: `dist/linuxsb-suite.user.js` v1.0.94，banner 含称号行情 v1.0.16

- [ ] **Step 1: Bump versions and RC docs**

`title-quotes.user.js` 头部 `@version` 与 `manifest.version` 都改成 `1.0.16`。`build-suite.mjs` / `suite-center.js` 改 `1.0.94`。四处 RC 文档里的氧版本与 `CONVENTIONS.md`「氢 0.1.33 / 氧 1.0.93」同步成氧 **1.0.94**。不要改氢、不要改 `ORDER`。

- [ ] **Step 2: Build suite**

Run: `node build-suite.mjs`

Expected: 打印 `v1.0.94`、18 模块。产物里称号行情块是 v1.0.16，且含 `data-bar-min` 与 `periodMs` 第二参。

- [ ] **Step 3: Full test suite**

Run: `npm test`

Expected: 全绿（当前基线 364，本计划约 +3 条）。失败则修插件或测试，不要改无关用例来「对齐」。

- [ ] **Step 4: Commit**

Skip unless the user asked to commit.

---

## Self-review

- Spec 本日 `periodMs` / 非法回落 → Task 1
- Spec `foldCandles`/`fmtBarTip` 传 `barMin`、不读 store → Task 1
- Spec 工具条出现规则、文案、store、大盘共用、折线/7 天隐藏、关掉再开 → Task 2
- Spec `timeWindow` 最短 30 分（60 分档跟周期）→ Task 2 `timeWindow`
- Spec 氧面板不加字段 → Task 2 不改 tab；Task 3 跑「氧面板是设置加打开浮层」
- Spec 不改 MERGE / 折线收点 / 7·30·90 柱宽 / 氢 / ORDER → Global Constraints
- 版本 1.0.16 / 氧 1.0.94 → Task 3
- 无 TBD；`getBarMin` / `setBarMin` / `data-bar-min` 在 Task 2 与测试一致
