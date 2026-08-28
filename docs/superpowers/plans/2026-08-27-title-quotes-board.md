# 称号行情分析大盘 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 在称号行情同一插件里增加「大盘」视图：稀有度/总指数 K、5/20 均线与布林、短线/区间冷热榜；行情页四锚点与各称号图保持原样。

**Architecture:** 指数、均线、涨跌全从现有 `series` 当场重算，不另存。纯函数与 `foldCandles` 同层，经 `title-quotes:debug` 导出。`render` 用内存 `boardView` / `boardRarity` / `boardMove` 切换折叠内部。氧升到 1.0.84，氢不动。

**Tech Stack:** `plugins/title-quotes.user.js` + jsdom `node:test`；`node build-suite.mjs` 打氧。

## Global Constraints

- Spec：`docs/superpowers/specs/2026-08-27-title-quotes-board-design.md`
- 插件 `1.0.9` → `1.0.10`（Task 6 才改号）；氧 `SUITE_VERSION` / `suite-center` `1.0.83` → `1.0.84`；氢 `0.1.33` 不动；不改 `ORDER`
- 不写购买、不拉成交、不新插件、不记「上次停在大盘」、不按挂单条数 `n` 加权、不改采集 / `MERGE_MS` / 快照格式 / 各称号图
- 源文件 UTF-8 无 BOM、LF；Windows PowerShell 不要用 `&&`（分号或两条命令）
- 用户未明确要求则不要 `git commit`
- 文案锁定：视图 `行情` / `大盘`；芯片 `总指数`；空档芯片 `未知`；榜 `短线` / `区间` / `涨幅 Top 10` / `跌幅 Top 10`；图空 `这个时间窗还不够画指数`；榜空 `没有可比的涨跌`；图例与脚注 `挂单中位 · 非成交`；悬停叠加 `均5` `均20` `上轨` `下轨`
- 测试走 `plugins/title-quotes.user.js`（不是 dist）。Windows 上 `node --test` 若沙箱失败，用全权限再跑

## Files

- Modify: `plugins/title-quotes.user.js`（纯函数、`render`、debug 导出、版本、描述、CSS）
- Modify: `test/title-quotes.test.js`
- Modify: `build-suite.mjs` `SUITE_VERSION`、`suite/suite-center.js`（Task 6）
- Modify: `README.md` 称号行情一行；`docs/CONVENTIONS.md`、`docs/已知问题-rc.md`、`docs/测试招募-氢氧-beta.md`、`docs/功能征集-rc-ga.md`（Task 6）
- Run: `node build-suite.mjs`（不要为这个功能跑 `build.mjs`）

---

### Task 1: 指数纯函数

**Files:**
- Modify: `test/title-quotes.test.js`（追加用例）
- Modify: `plugins/title-quotes.user.js`（`foldCandles` 之后、`niceTicks` 之前插入；debug handle 导出）

**Interfaces:**
- Consumes: 现有 `foldCandles` / `median` 模式；快照 `titles` 为 `{ [key]: { rarity, lo, hi, mid, n? } }`
- Produces:
  - `mean(nums: number[]) => number | null`（非有限值丢掉；空 → `null`）
  - `snapshotIndex(titles) => { overall: number | null, byRarity: { [rarity: string]: { mean: number, n: number } } }`
  - `indexPoints(series, rarity) => { t: number, mid: number }[]`；`rarity === null` 为总指数；`rarity === ''` 是「未知」档，禁止用 `''` 表示总指数
  - `foldIndexCandles(points, { rangeDays, now }) => { t, o, h, l, c }[]`（内部把点收成假 `series` 再调 `foldCandles`）

- [ ] **Step 1: Write the failing test**

Append to `test/title-quotes.test.js`:

```js
test('称号行情：档指数平均、总指数等于全场等权', async () => {
  const { dbg } = await boot()
  const titles = {
    'a@R': { rarity: 'R', mid: 10, lo: 10, hi: 10 },
    'b@R': { rarity: 'R', mid: 10, lo: 10, hi: 10 },
    'c@SSR': { rarity: 'SSR', mid: 100, lo: 100, hi: 100 },
  }
  const idx = dbg.snapshotIndex(titles)
  assert.equal(idx.byRarity.R.mean, 10)
  assert.equal(idx.byRarity.R.n, 2)
  assert.equal(idx.byRarity.SSR.mean, 100)
  assert.equal(idx.overall, 40)
  assert.equal(dbg.mean([]), null)
  assert.equal(dbg.snapshotIndex({}).overall, null)
})

test('称号行情：空档该时点无指数点；空稀有度是未知档不是总指数', async () => {
  const { dbg } = await boot()
  const series = [
    { t: 1, titles: { 'a@R': { rarity: 'R', mid: 10 } } },
    { t: 2, titles: { 'u@': { rarity: '', mid: 5 } } },
  ]
  assert.deepEqual(
    dbg.indexPoints(series, 'SSR'),
    [],
    '从未出现的档没有点',
  )
  assert.equal(dbg.indexPoints(series, 'R').length, 1)
  assert.equal(dbg.indexPoints(series, 'R')[0].mid, 10)
  assert.equal(dbg.indexPoints(series, null).length, 2)
  assert.equal(dbg.indexPoints(series, '').length, 1)
  assert.equal(dbg.indexPoints(series, '')[0].mid, 5)
})

test('称号行情：本日空窗指数 K 不回退到昨天', async () => {
  const { dbg } = await boot()
  const now = new Date()
  now.setHours(15, 0, 0, 0)
  const start = new Date(now)
  start.setHours(0, 0, 0, 0)
  const points = [
    { t: start.getTime() - 3600e3, mid: 9 },
    { t: start.getTime() + 2 * 3600e3, mid: 20 },
  ]
  const bars = dbg.foldIndexCandles(points, { rangeDays: 0, now: now.getTime() })
  assert.ok(bars.length >= 1)
  assert.ok(bars.every((b) => b.t >= start.getTime()))
  const yesterdayOnly = dbg.foldIndexCandles([{ t: start.getTime() - 3600e3, mid: 9 }], {
    rangeDays: 0,
    now: now.getTime(),
  })
  assert.equal(yesterdayOnly.length, 0)
})
```

- [ ] **Step 2: Run test to verify it fails**

Run: `node --test --test-force-exit test/title-quotes.test.js`  
Expected: 新用例 FAIL（`dbg.snapshotIndex` / `mean` / `indexPoints` / `foldIndexCandles` 不是函数）。旧用例仍绿。

- [ ] **Step 3: Write minimal implementation**

In `plugins/title-quotes.user.js` after `foldCandles`:

```js
  function mean(nums) {
    const a = (nums || []).filter((n) => Number.isFinite(n))
    if (!a.length) return null
    return a.reduce((s, x) => s + x, 0) / a.length
  }

  function snapshotIndex(titles) {
    const buckets = {}
    const all = []
    for (const v of Object.values(titles || {})) {
      if (!v || !Number.isFinite(v.mid)) continue
      const r = typeof v.rarity === 'string' ? v.rarity : ''
      if (!buckets[r]) buckets[r] = []
      buckets[r].push(v.mid)
      all.push(v.mid)
    }
    const byRarity = {}
    for (const [r, mids] of Object.entries(buckets)) {
      byRarity[r] = { mean: mean(mids), n: mids.length }
    }
    return { overall: mean(all), byRarity }
  }

  function indexPoints(series, rarity) {
    const out = []
    for (const s of series || []) {
      const idx = snapshotIndex(s.titles || {})
      const mid = rarity === null ? idx.overall : idx.byRarity[rarity]?.mean
      if (Number.isFinite(mid)) out.push({ t: s.t, mid })
    }
    return out
  }

  function foldIndexCandles(points, opts) {
    const key = '__idx'
    const series = (points || [])
      .filter((p) => p && Number.isFinite(p.t) && Number.isFinite(p.mid))
      .map((p) => ({ t: p.t, titles: { [key]: { mid: p.mid } } }))
    return foldCandles(series, key, opts)
  }
```

Export on `title-quotes:debug`: `mean`, `snapshotIndex`, `indexPoints`, `foldIndexCandles`.

- [ ] **Step 4: Run test to verify it passes**

Run: `node --test --test-force-exit test/title-quotes.test.js`  
Expected: 全绿。

- [ ] **Step 5: Commit**

Skip unless the user asked to commit.

---

### Task 2: 均线、布林、悬停字段

**Files:**
- Modify: `test/title-quotes.test.js`
- Modify: `plugins/title-quotes.user.js`（`fmtBarTip`、新函数、debug 导出）

**Interfaces:**
- Consumes: Task 1 的 `mean`
- Produces:
  - `sma(values: number[], n: number) => (number | null)[]`（与 `values` 等长；根数不足为 `null`）
  - `stdevPop(values: number[]) => number | null`（总体标准差，除以 `n` 不是 `n-1`）
  - `bollinger(closes, n = 20, k = 2) => { mid, upper, lower }`（三数组等长，不足为 `null`）
  - `overlays(bars) => { sma5?, sma20?, bbMid?, bbUpper?, bbLower? }[]`
  - `fmtBarTip`：若对象上有有限的 `sma5` / `sma20` / `bbUpper` / `bbLower`，在原 OHLC 行后面追加 `均5` `均20` `上轨` `下轨`；没有则与现在完全一致

- [ ] **Step 1: Write the failing test**

```js
test('称号行情：SMA 与布林根数不足不出力；总体标准差', async () => {
  const { dbg } = await boot()
  const closes = [10, 12, 11, 13, 14]
  const s5 = dbg.sma(closes, 5)
  assert.equal(s5[3], null)
  assert.equal(s5[4], dbg.mean(closes))
  assert.equal(dbg.stdevPop([10, 10, 10, 10]), 0)
  assert.equal(dbg.stdevPop([]), null)
  const bbShort = dbg.bollinger(closes, 20, 2)
  assert.equal(bbShort.mid[4], null)
  const twenty = Array.from({ length: 20 }, () => 10)
  twenty[19] = 10
  const bb = dbg.bollinger(twenty, 20, 2)
  assert.equal(bb.mid[19], 10)
  assert.equal(bb.upper[19], 10)
  assert.equal(bb.lower[19], 10)
  const bars = closes.map((c, i) => ({ t: i, o: c, h: c, l: c, c }))
  const ov = dbg.overlays(bars)
  assert.equal(ov[3].sma5, undefined)
  assert.equal(ov[4].sma5, dbg.mean(closes))
  assert.equal(ov[4].sma20, undefined)
})

test('称号行情：有叠加字段时悬停追加均线布林；没有则不变', async () => {
  const { dbg } = await boot()
  const bar = { t: 0, o: 10, h: 12, l: 9, c: 11 }
  const plain = dbg.fmtBarTip(bar, 7)
  assert.match(plain, /开/)
  assert.doesNotMatch(plain, /均5/)
  const withOv = dbg.fmtBarTip({ ...bar, sma5: 10.5, sma20: 10, bbUpper: 12, bbLower: 8 }, 7)
  assert.match(withOv, /均5/)
  assert.match(withOv, /均20/)
  assert.match(withOv, /上轨/)
  assert.match(withOv, /下轨/)
  assert.ok(withOv.startsWith(plain) || withOv.includes('开'))
})
```

- [ ] **Step 2: Run test to verify it fails**

Run: `node --test --test-force-exit test/title-quotes.test.js`  
Expected: `dbg.sma` 等不是函数；或 `fmtBarTip` 不含 `均5`。

- [ ] **Step 3: Write minimal implementation**

```js
  function sma(values, n) {
    const out = []
    const k = Number(n)
    for (let i = 0; i < (values || []).length; i++) {
      if (!Number.isFinite(k) || k < 1 || i + 1 < k) {
        out[i] = null
        continue
      }
      out[i] = mean(values.slice(i + 1 - k, i + 1))
    }
    return out
  }

  function stdevPop(values) {
    const a = (values || []).filter((n) => Number.isFinite(n))
    if (!a.length) return null
    const m = mean(a)
    let s = 0
    for (const x of a) s += (x - m) * (x - m)
    return Math.sqrt(s / a.length)
  }

  function bollinger(closes, n = 20, k = 2) {
    const mid = sma(closes, n)
    const upper = []
    const lower = []
    const kk = Number(k)
    for (let i = 0; i < (closes || []).length; i++) {
      if (mid[i] == null || !Number.isFinite(kk)) {
        upper[i] = null
        lower[i] = null
        continue
      }
      const sd = stdevPop(closes.slice(i + 1 - n, i + 1))
      upper[i] = mid[i] + kk * sd
      lower[i] = mid[i] - kk * sd
    }
    return { mid, upper, lower }
  }

  function overlays(bars) {
    const closes = (bars || []).map((b) => b.c)
    const sma5 = sma(closes, 5)
    const bb = bollinger(closes, 20, 2)
    return closes.map((_, i) => {
      const row = {}
      if (sma5[i] != null) row.sma5 = sma5[i]
      if (bb.mid[i] != null) {
        row.sma20 = bb.mid[i]
        row.bbMid = bb.mid[i]
        row.bbUpper = bb.upper[i]
        row.bbLower = bb.lower[i]
      }
      return row
    })
  }
```

Change `fmtBarTip` to append extras (do not add `bbMid` / 中轨):

```js
  function fmtBarTip(bar, rangeDays) {
    const t = Number(bar.t)
    const o = Number(bar.o)
    const h = Number(bar.h)
    const l = Number(bar.l)
    const c = Number(bar.c)
    const chg = c - o
    const sign = chg > 0 ? '+' : ''
    const when = `${fmtTime(t, rangeDays)}–${fmtTime(t + periodMs(rangeDays), rangeDays)}`
    let s = `${when}  开 ${fmtPrice(o)}  高 ${fmtPrice(h)}  低 ${fmtPrice(l)}  收 ${fmtPrice(c)}  ${sign}${fmtPrice(chg)}`
    const add = (label, raw) => {
      const v = Number(raw)
      if (!Number.isFinite(v)) return
      s += `  ${label} ${fmtPrice(v)}`
    }
    add('均5', bar.sma5)
    add('均20', bar.sma20)
    add('上轨', bar.bbUpper)
    add('下轨', bar.bbLower)
    return s
  }
```

Export: `sma`, `stdevPop`, `bollinger`, `overlays`. `fmtBarTip` already exported.

- [ ] **Step 4: Run test to verify it passes**

Run: `node --test --test-force-exit test/title-quotes.test.js`  
Expected: 全绿。原「K 线悬停给出开高低收」仍不出现 `均5`（各称号 K 的 `dataset` 没有这些字段）。

- [ ] **Step 5: Commit**

Skip unless the user asked to commit.

---

### Task 3: 冷热分类 `movers`

**Files:**
- Modify: `test/title-quotes.test.js`
- Modify: `plugins/title-quotes.user.js`

**Interfaces:**
- Consumes: 现有 `splitKey(k) => { name, rarity }`
- Produces:
  - `fmtPct(ratio) => string`（`0.082` → `+8.2%`；`0` → `0.0%`）
  - `movers(latestTitles, baseTitles) => { up, down, listed, delisted }`
    - 每条 `up`/`down`：`{ key, name, rarity, mid, delta, pct }`（`pct` 为比例，如 `0.08`）
    - `listed`：`{ key, name, rarity, mid }`（现价）
    - `delisted`：`{ key, name, rarity }`（无现价）
    - 先新上/下架，再对交集算涨跌；基 `mid` 为 0 或不存在则该键不进涨跌；平盘不进两侧；涨幅降序 / 跌幅升序（跌得最多在前），并列 `localeCompare('zh-CN')` 比 `key`；各截断 10 条
  - `boardPair(series, { rangeDays, now, mode })`：`mode` 为 `'short' | 'range'`
    - short：`latest` = 全序列最后一份；`base` = 倒数第二或 `null`；`emptyWindow: false`
    - range：只看 `t >= rangeCutoff` 的快照（本日空不回退）。无点：`latest`/`base` 为 `null`，`emptyWindow: true`。有点：`base` = 窗内最早，`latest` = 窗内最晚

- [ ] **Step 1: Write the failing test**

```js
test('称号行情：movers 新上不下涨跌榜；下架只在摘要；基 0 剔除；Top 10', async () => {
  const { dbg } = await boot()
  const base = {
    '旧@R': { rarity: 'R', mid: 10 },
    '跌@R': { rarity: 'R', mid: 20 },
    '零@R': { rarity: 'R', mid: 0 },
    '平@R': { rarity: 'R', mid: 5 },
  }
  const latest = {
    '旧@R': { rarity: 'R', mid: 12 },
    '跌@R': { rarity: 'R', mid: 10 },
    '零@R': { rarity: 'R', mid: 8 },
    '平@R': { rarity: 'R', mid: 5 },
    '新@SSR': { rarity: 'SSR', mid: 3 },
  }
  const m = dbg.movers(latest, base)
  assert.equal(m.listed.length, 1)
  assert.equal(m.listed[0].key, '新@SSR')
  assert.equal(m.delisted.length, 0)
  assert.equal(m.up.some((x) => x.key === '新@SSR'), false)
  assert.equal(m.up[0].key, '旧@R')
  assert.equal(m.up[0].delta, 2)
  assert.ok(Math.abs(m.up[0].pct - 0.2) < 1e-9)
  assert.equal(m.down[0].key, '跌@R')
  assert.equal(m.up.some((x) => x.key === '平@R'), false)
  assert.equal(m.down.some((x) => x.key === '平@R'), false)
  assert.equal(m.up.some((x) => x.key === '零@R'), false)
  assert.equal(dbg.fmtPct(0.082), '+8.2%')

  const gone = dbg.movers({ '留@R': { rarity: 'R', mid: 1 } }, { '走@R': { rarity: 'R', mid: 2 }, '留@R': { rarity: 'R', mid: 1 } })
  assert.equal(gone.delisted[0].key, '走@R')
  assert.equal(gone.delisted[0].mid, undefined)

  const many = {}
  const nowT = {}
  for (let i = 0; i < 12; i++) {
    const k = `涨${String.fromCharCode(97 + i)}@R`
    many[k] = { rarity: 'R', mid: 10 }
    nowT[k] = { rarity: 'R', mid: 10 + i + 1 }
  }
  assert.equal(dbg.movers(nowT, many).up.length, 10)
})

test('称号行情：boardPair 短线用上一份；区间用窗起点；本日空窗 emptyWindow', async () => {
  const { dbg } = await boot()
  const now = new Date()
  now.setHours(15, 0, 0, 0)
  const start = new Date(now)
  start.setHours(0, 0, 0, 0)
  const series = [
    { t: start.getTime() - 3600e3, titles: { '昨@R': { rarity: 'R', mid: 1 } } },
    { t: start.getTime() + 3600e3, titles: { '今@R': { rarity: 'R', mid: 2 } } },
  ]
  const sh = dbg.boardPair(series, { rangeDays: 0, now: now.getTime(), mode: 'short' })
  assert.equal(Object.keys(sh.latest.titles)[0], '今@R')
  assert.equal(Object.keys(sh.base.titles)[0], '昨@R')
  assert.equal(sh.emptyWindow, false)
  const rg = dbg.boardPair(series, { rangeDays: 0, now: now.getTime(), mode: 'range' })
  assert.equal(Object.keys(rg.base.titles)[0], '今@R')
  assert.equal(rg.emptyWindow, false)
  const empty = dbg.boardPair(
    [{ t: start.getTime() - 3600e3, titles: { '昨@R': { rarity: 'R', mid: 1 } } }],
    { rangeDays: 0, now: now.getTime(), mode: 'range' },
  )
  assert.equal(empty.emptyWindow, true)
  assert.equal(empty.latest, null)
  const one = dbg.boardPair(
    [{ t: 1, titles: { 'a@R': { rarity: 'R', mid: 1 } } }],
    { rangeDays: 7, now: 10, mode: 'short' },
  )
  assert.equal(one.base, null)
})
```

- [ ] **Step 2: Run test to verify it fails**

Run: `node --test --test-force-exit test/title-quotes.test.js`  
Expected: `dbg.movers` 不是函数。

- [ ] **Step 3: Write minimal implementation**

Constants next to `MERGE_MS`:

```js
  const MOVER_TOP = 10
```

```js
  function fmtPct(ratio) {
    if (!Number.isFinite(ratio)) return ''
    const p = ratio * 100
    const sign = p > 0 ? '+' : ''
    return `${sign}${(Math.round(p * 10) / 10).toFixed(1)}%`
  }

  function movers(latestTitles, baseTitles) {
    const latest = latestTitles || {}
    const base = baseTitles || {}
    const listed = []
    const delisted = []
    const up = []
    const down = []
    for (const key of Object.keys(latest)) {
      if (!base[key]) {
        const meta = splitKey(key)
        listed.push({ key, name: meta.name, rarity: latest[key].rarity ?? meta.rarity, mid: latest[key].mid })
      }
    }
    for (const key of Object.keys(base)) {
      if (!latest[key]) {
        const meta = splitKey(key)
        delisted.push({ key, name: meta.name, rarity: base[key].rarity ?? meta.rarity })
      }
    }
    for (const key of Object.keys(latest)) {
      if (!base[key]) continue
      const cur = Number(latest[key].mid)
      const prev = Number(base[key].mid)
      if (!Number.isFinite(cur) || !Number.isFinite(prev) || prev === 0) continue
      const delta = cur - prev
      const pct = delta / prev
      if (pct === 0) continue
      const meta = splitKey(key)
      const row = {
        key,
        name: meta.name,
        rarity: latest[key].rarity ?? meta.rarity,
        mid: cur,
        delta,
        pct,
      }
      if (pct > 0) up.push(row)
      else down.push(row)
    }
    const byKey = (a, b) => a.key.localeCompare(b.key, 'zh-CN')
    up.sort((a, b) => b.pct - a.pct || byKey(a, b))
    down.sort((a, b) => a.pct - b.pct || byKey(a, b))
    return {
      up: up.slice(0, MOVER_TOP),
      down: down.slice(0, MOVER_TOP),
      listed,
      delisted,
    }
  }

  function boardPair(series, { rangeDays = 7, now = Date.now(), mode = 'short' } = {}) {
    const all = (series || []).slice().sort((a, b) => a.t - b.t)
    if (mode === 'short') {
      return {
        latest: all[all.length - 1] || null,
        base: all.length >= 2 ? all[all.length - 2] : null,
        emptyWindow: false,
      }
    }
    const cutoff = rangeCutoff(rangeDays, now)
    const view = all.filter((s) => s.t >= cutoff)
    if (!view.length) return { latest: null, base: null, emptyWindow: true }
    return { latest: view[view.length - 1], base: view[0], emptyWindow: false }
  }
```

Export: `fmtPct`, `movers`, `boardPair`.

Render 侧（Task 5）约定：short 且 `base === null` 时 `movers(latest.titles, {})`；range 且 `emptyWindow` 时不调用、榜空；range 且 `latest === base`（同一对象、窗内仅一份）时 `movers(titles, titles)` → 无新上/下架/涨跌。

- [ ] **Step 4: Run test to verify it passes**

Run: `node --test --test-force-exit test/title-quotes.test.js`  
Expected: 全绿。

- [ ] **Step 5: Commit**

Skip unless the user asked to commit.

---

### Task 4: 大盘视图 · 指数图

**Files:**
- Modify: `test/title-quotes.test.js`
- Modify: `plugins/title-quotes.user.js`（`setup` 内存状态、`render` 工具条与大盘主体、`candles` 叠加、CSS）

**Interfaces:**
- Consumes: Task 1–2
- Produces: `boardView`: `'quotes' | 'board'`，默认 `'quotes'`；`boardRarity`: `null | string`，默认 `null`；不写 store。大盘页无 `.lsb-title-quotes-anchors`、无 `.lsb-title-quotes-row`；有 `[data-board-view]`、总指数芯片、指数 K、图例。`K线`/`折线` 在大盘隐藏。时间窗按钮两页都在。

- [ ] **Step 1: Write the failing test**

```js
test('称号行情：大盘视图无四锚点与称号行；指数 K 可悬停均线', async () => {
  const { w, dbg } = await boot()
  dbg.reset()
  const now = Date.now()
  const mk = (midR, midS) => ({
    '吃瓜群众@N': { rarity: 'N', lo: midR, hi: midR, mid: midR, n: 1 },
    '隐藏大佬@SSR': { rarity: 'SSR', lo: midS, hi: midS, mid: midS, n: 1 },
  })
  const listings = dbg.parseCards(card('吃瓜群众', 'N', 20, 'a') + card('隐藏大佬', 'SSR', 666, 'e'))
  const anchors = dbg.pickAnchors(listings, dbg.foldTitles(listings))
  for (let i = 0; i < 6; i++) {
    dbg.pushSnap({ anchors, titles: mk(20 + i, 666 + i * 2) }, now - (6 - i) * 5 * 3600e3)
  }
  w.LSB.open('title-quotes')
  const view = w.document.querySelector('.lsb-view')
  const quotesBtn = [...view.querySelectorAll('[data-board-view]')].find((b) => b.dataset.boardView === 'quotes')
  const boardBtn = [...view.querySelectorAll('[data-board-view]')].find((b) => b.dataset.boardView === 'board')
  assert.ok(quotesBtn && boardBtn)
  assert.equal(quotesBtn.textContent.trim(), '行情')
  assert.equal(boardBtn.textContent.trim(), '大盘')
  assert.ok(view.querySelector('.lsb-title-quotes-anchors'))
  assert.ok(view.querySelector('.lsb-title-quotes-row'))
  assert.ok(view.querySelector('[data-chart]'))
  boardBtn.click()
  assert.equal(view.querySelector('.lsb-title-quotes-anchors'), null)
  assert.equal(view.querySelector('.lsb-title-quotes-row'), null)
  assert.equal(view.querySelector('[data-chart]'), null)
  assert.ok(view.querySelector('[data-range]'))
  assert.match(view.textContent, /总指数/)
  assert.match(view.textContent, /挂单中位 · 非成交/)
  assert.ok(view.querySelector('svg.lsb-title-quotes-k'))
  const kBars = view.querySelectorAll('.lsb-title-quotes-bar')
  assert.ok(kBars.length >= 5, '要有足够 K 才画得出均5')
  const bar = kBars[kBars.length - 1]
  bar.dispatchEvent(new w.MouseEvent('mousemove', { bubbles: true, clientX: 48, clientY: 40 }))
  const tip = view.querySelector('.lsb-title-quotes-tip')
  assert.ok(tip?.classList.contains('is-on'))
  assert.match(tip.textContent, /开/)
  assert.match(tip.textContent, /均5/)
  quotesBtn.click()
  assert.ok(view.querySelector('.lsb-title-quotes-anchors'))
  assert.ok(view.querySelector('[data-chart]'))
})
```

- [ ] **Step 2: Run test to verify it fails**

Run: `node --test --test-force-exit test/title-quotes.test.js`  
Expected: 找不到 `[data-board-view]`。

- [ ] **Step 3: Write minimal implementation**

In `setup` next to `rangeDays`:

```js
    let boardView = 'quotes'
    let boardRarity = null
```

**`candles`:** 增加第 4 参 `overlayRows`（默认 `null`）。`vals` 并入 overlay 里所有有限数字。每根 `<g>` 在有叠加时写 `data-sma5` `data-sma20` `data-bb-upper` `data-bb-lower`（只写有限值）。在 clip 组里、K 柱之后画叠加 path：

颜色：SMA5 `#6b8afd`；SMA20 `#c9892e`；布林上/下 `#8b8d9a` dashed。`vector-effect="non-scaling-stroke"`。

断线：`bars[i].t - bars[i-1].t > period` 则新开 `M`，不要一条 path 跨空档。`pick` 不到有限值也断开。

```js
    function overlayPaths(bars, overlayRows, X, Y, period) {
      if (!overlayRows) return ''
      const draw = (key, stroke, dash) => {
        const segs = []
        let d = ''
        const flush = () => {
          if (d) segs.push(d)
          d = ''
        }
        for (let i = 0; i < bars.length; i++) {
          if (i > 0 && bars[i].t - bars[i - 1].t > period) flush()
          const v = Number(overlayRows[i]?.[key])
          if (!Number.isFinite(v)) {
            flush()
            continue
          }
          const x = X(bars[i].t + period / 2).toFixed(1)
          const y = Y(v).toFixed(1)
          d += d ? ` L${x} ${y}` : `M${x} ${y}`
        }
        flush()
        const dashAttr = dash ? ' stroke-dasharray="4 3"' : ''
        return segs
          .map(
            (p) =>
              `<path fill="none" stroke="${stroke}" stroke-width="1.4"${dashAttr} vector-effect="non-scaling-stroke" d="${p}"></path>`,
          )
          .join('')
      }
      return (
        draw('sma5', '#6b8afd', false) +
        draw('sma20', '#c9892e', false) +
        draw('bbUpper', '#8b8d9a', true) +
        draw('bbLower', '#8b8d9a', true)
      )
    }
```

`bindCandleTips` 继续 `fmtBarTip(g.dataset, rangeDays)`（dataset 会带上 `sma5` / `bbUpper`）。

**`render` 工具条：** 左侧

```html
<button class="lsb-btn${boardView === 'quotes' ? ' is-primary' : ''}" data-board-view="quotes">行情</button>
<button class="lsb-btn${boardView === 'board' ? ' is-primary' : ''}" data-board-view="board">大盘</button>
```

`chartBtns` 仅 `boardView === 'quotes'` 时输出。`onclick`：`boardView = b.dataset.boardView`；`render(host)`。

**大盘主体**（`boardView === 'board'` 时不要 anchors / rows）：

1. 芯片行：总指数（`data-board-idx="all"`，`boardRarity === null` 时 `is-primary`）+ 窗内出现过的稀有度。窗 = `t >= rangeCutoff(rangeDays)` 的快照（本日空不回退）。排序：最新一份快照里该档 `n` 降序，再 `localeCompare('zh-CN')`。空字符串文案「未知」，`data-rarity=""` + `data-board-idx="rarity"`。点击：`all` → `boardRarity = null`；否则 `boardRarity = el.getAttribute('data-rarity')`。
2. 图：`foldIndexCandles(indexPoints(all, boardRarity), { rangeDays })`。无柱：`.lsb-empty`「这个时间窗还不够画指数」。有柱：`overlays(bars)` 后 `candles(bars, rangeDays, Date.now(), ov)`。
3. 图例：`K · 5 · 20 · 布林` 与 `挂单中位 · 非成交`。

冷热榜 DOM 可先空着，Task 5 再填（测试本任务不点榜）。

CSS（追加到现有 style 字符串）：芯片横排换行；`.lsb-title-quotes-chip.is-primary` 与 `lsb-btn is-primary` 同语言。

- [ ] **Step 4: Run test to verify it passes**

Run: `node --test --test-force-exit test/title-quotes.test.js`  
Expected: 全绿。原总览折线 / 各称号 K 用例仍过。

- [ ] **Step 5: Commit**

Skip unless the user asked to commit.

---

### Task 5: 冷热榜 DOM 与点回行情

**Files:**
- Modify: `test/title-quotes.test.js`
- Modify: `plugins/title-quotes.user.js`

**Interfaces:**
- Consumes: Task 3–4（`boardPair` / `movers` / `fmtPct` / `fmtPrice`）
- Produces: 内存 `boardMove`: `'short' | 'range'`，默认 `'short'`。榜在指数图下。点 `[data-board-key]`：`boardView = 'quotes'`，展开该行；嵌入折叠一并打开。摘要名称最多 20 个，超出写「等」。

- [ ] **Step 1: Write the failing test**

```js
test('称号行情：冷热榜短线有涨跌；点名称回到行情并展开', async () => {
  const { w, dbg } = await boot()
  dbg.reset()
  const now = Date.now()
  const listings = dbg.parseCards(card('吃瓜群众', 'N', 20, 'a') + card('隐藏大佬', 'SSR', 666, 'e'))
  const titles = dbg.foldTitles(listings)
  const anchors = dbg.pickAnchors(listings, titles)
  dbg.pushSnap({ anchors, titles }, now - 3600e3)
  dbg.pushSnap(
    {
      anchors,
      titles: { ...titles, '隐藏大佬@SSR': { ...titles['隐藏大佬@SSR'], mid: 800, lo: 800, hi: 800 } },
    },
    now,
  )
  w.LSB.open('title-quotes')
  const view = w.document.querySelector('.lsb-view')
  view.querySelector('[data-board-view="board"]').click()
  assert.match(view.textContent, /涨幅 Top 10/)
  assert.match(view.textContent, /跌幅 Top 10/)
  assert.match(view.textContent, /短线/)
  assert.match(view.textContent, /区间/)
  const hit = [...view.querySelectorAll('[data-board-key]')].find((el) => el.getAttribute('data-board-key') === '隐藏大佬@SSR')
  assert.ok(hit)
  hit.click()
  assert.ok(view.querySelector('.lsb-title-quotes-anchors'), '应回到行情')
  const row = view.querySelector('.lsb-title-quotes-row[data-key="隐藏大佬@SSR"]')
  assert.ok(row)
  assert.equal(row.open, true)
})

test('称号行情：区间空窗榜文案；短线仅一份则全是新上', async () => {
  const { w, dbg } = await boot()
  dbg.reset()
  const now = new Date()
  now.setHours(15, 0, 0, 0)
  const start = new Date(now)
  start.setHours(0, 0, 0, 0)
  const listings = dbg.parseCards(card('吃瓜群众', 'N', 20, 'a'))
  const titles = dbg.foldTitles(listings)
  const anchors = dbg.pickAnchors(listings, titles)
  dbg.pushSnap({ anchors, titles }, start.getTime() - 3600e3)
  w.LSB.open('title-quotes')
  const view = w.document.querySelector('.lsb-view')
  view.querySelector('[data-board-view="board"]').click()
  view.querySelector('[data-range="0"]').click()
  view.querySelector('[data-board-move="range"]').click()
  assert.match(view.textContent, /没有可比的涨跌/)
  view.querySelector('[data-board-move="short"]').click()
  assert.match(view.textContent, /新上/)
  assert.match(view.textContent, /吃瓜群众/)
})
```

第二例依赖：只有昨天一份快照时，短线 `base === null` → `movers(titles, {})` 全部新上；切本日 + 区间 → `emptyWindow` → 空榜文案。若 `pushSnap` 的昨天时间被 `keepDays` 裁掉，改用 `now - 2*3600e3` 且 `rangeDays=0` 的「今天尚无点」：把 snap 时间设为 `start - 3600e3` 即可，`keepDays` 默认 90 天不会裁。

- [ ] **Step 2: Run test to verify it fails**

Run: `node --test --test-force-exit test/title-quotes.test.js`  
Expected: 无 `[data-board-key]` 或无「涨幅 Top 10」。

- [ ] **Step 3: Write minimal implementation**

`let boardMove = 'short'`  
`let focusKey = null`  
`let forceFoldOpen = false`

榜 HTML：

- 按钮 `data-board-move="short|range"`
- 两表 grid：`minmax(0,1fr)` 双列，窄屏单列（CSS `@media` 可省略，用 `repeat(auto-fit,minmax(220px,1fr))`）
- 行：` <button type="button" class="lsb-title-quotes-name" data-board-key="...">`
- 涨跌列：`+2 · +20.0%`（用 `fmtPrice`+符号 与 `fmtPct`）
- 摘要：`listed`/`delisted` 各最多 20 个按钮，超了在该侧末尾文本「等」；`N` 仍是全量 length
- 无涨跌且无摘要：`没有可比的涨跌`
- 有摘要无涨跌：仍画摘要，涨跌表可以空表头或只留摘要

取数：

```js
    const pair = boardPair(all, { rangeDays, mode: boardMove })
    let pack = { up: [], down: [], listed: [], delisted: [] }
    if (pair.emptyWindow) pack = null
    else if (pair.latest && !pair.base && boardMove === 'short') pack = movers(pair.latest.titles, {})
    else if (pair.latest && pair.base) pack = movers(pair.latest.titles, pair.base.titles)
```

`pack === null` 或（无 up/down/listed/delisted）时用空文案。短线仅一份走 `!pair.base` 分支。

点击 `data-board-key`：

```js
    focusKey = el.getAttribute('data-board-key')
    boardView = 'quotes'
    forceFoldOpen = true
    render(host)
```

`render` 里 `openKeys` 加上 `focusKey`；`keepOpen = (isEmbed && fold.open) || forceFoldOpen`；渲染后 `forceFoldOpen = false`（`focusKey` 可留到下次以便重复 render，或清掉——行已 `open`，下次从 DOM 收集。**渲染后 `focusKey = null`**）。

嵌入 `details.lsb-title-quotes-fold` 的 `open` 在 `forceFoldOpen` 时强制加上。

- [ ] **Step 4: Run test to verify it passes**

Run: `node --test --test-force-exit test/title-quotes.test.js`  
Expected: 全绿。

- [ ] **Step 5: Commit**

Skip unless the user asked to commit.

---

### Task 6: 版本、文档、氧包、全量测试

**Files:**
- Modify: `plugins/title-quotes.user.js`（`@version`、`manifest.version`、`@description` / `manifest.description` 提到大盘）
- Modify: `build-suite.mjs` `SUITE_VERSION = '1.0.84'`
- Modify: `suite/suite-center.js` `version: '1.0.84'`
- Modify: `README.md` 称号行情单元格：补「交易页可切分析大盘（指数 K / 均线布林 / 冷热榜）」
- Modify: `docs/CONVENTIONS.md` 氧 **1.0.84**
- Modify: `docs/已知问题-rc.md` 标题氧号；称号行情条可补一句：大盘在同一折叠的「大盘」视图，不是 `/gacha`
- Modify: `docs/测试招募-氢氧-beta.md` 氧 **1.0.84**；检查项「称号行情」改为含大盘（`/gacha_market` 折叠里切大盘能看到指数和榜）
- Modify: `docs/功能征集-rc-ga.md` 氧 1.0.84；「称号行情」改为「称号行情（含分析大盘）」
- Run: `node build-suite.mjs`

**Interfaces:**
- Consumes: Task 1–5 已绿
- Produces: 氧 1.0.84；`dist/linuxsb-suite.user.js` 含 title-quotes 1.0.10；氢产物不改

- [ ] **Step 1: Bump versions and docs**

按上面文件改。不要改 `src/core.js` / `package.json` / `dist/linuxsb-base.user.js`。不要往 `ORDER` 加模块。

- [ ] **Step 2: Build suite**

Run: `node build-suite.mjs`  
Expected: 打印 v1.0.84；banner 里 `LSB·称号行情 v1.0.10`。

- [ ] **Step 3: Run title-quotes tests then full suite**

Run: `node --test --test-force-exit test/title-quotes.test.js`  
Run: `node --test --test-force-exit`  
Expected: 全绿（当前基线约 336，本功能会再多若干条）。

- [ ] **Step 4: Commit**

Skip unless the user asked to commit.

测试者：只重装 **氧 1.0.84**（先氢后氧若对方氢也过期则两都装）。打开 `/gacha_market` → 称号行情折叠 → **大盘**。

---

## Spec coverage

| Spec | Task |
|---|---|
| 行情 \| 大盘、默认行情、不持久化 | 4 |
| 共用时间窗；大盘藏 K/折线 | 4 |
| 大盘无四锚点/称号列表 | 4 |
| 档指数 / 总指数等权 / 空档不补 | 1 |
| fold 规则与本日不回退 | 1 |
| 芯片排序与未知档 | 4 |
| SMA5/20、布林 ±2σ 总体、不足不画、断线 | 2 + 4 |
| Y 轴含布林；悬停均5/20/上下轨 | 2 + 4 |
| 图例与非成交 | 4 |
| 短线/区间、Top 10、新上优先、基 0、点回行情 | 3 + 5 |
| 摘要 20 个 +「等」 | 5 |
| 空文案 | 4 + 5 |
| debug 导出 | 1–3 |
| 1.0.10 / 氧 1.0.84 / 氢不动 | 6 |
