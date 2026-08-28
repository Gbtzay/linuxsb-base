# 称号行情挂单合成 K Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 各称号展开图改为挂单合成蜡烛（开/收=中位，影线=挂单高低），总览四锚点仍折线。

**Architecture:** 插件顶层纯函数 `periodMs` / `foldCandles` 收桶；`candles()` 画 SVG。采集、`series`、`MERGE_MS`、购买接口不动。经 `title-quotes:debug` 测纯函数。

**Tech Stack:** 现有 userscript、JSDOM `node:test`、基座不改。

## Global Constraints

- `title-quotes` `@version` = `manifest.version` = `1.0.5`
- 氧 `SUITE_VERSION` / `suite-center` = `1.0.68`；氢不动（仍 0.1.29）
- 类名只用 `lsb-title-quotes*`；蜡烛根 `lsb-title-quotes-k`
- 涨 `c >= o` 用 `var(--danger,#d55)`，跌用 `var(--success,#3aa08f)`
- UTF-8 无 BOM、LF；不请求 `/gacha_market_buy`；不改 `ORDER`
- Windows 测试不要用 `&&`；用户未要求不要 git commit
- 文案必须含「挂单合成 · 非成交」

## Files

- Modify: `plugins/title-quotes.user.js`
- Modify: `test/title-quotes.test.js`
- Modify: `build-suite.mjs`、`suite/suite-center.js`
- Modify: `README.md`、冻本文档四份（氧 1.0.68）

---

### Task 1: `periodMs` / `foldCandles`

**Files:**
- Modify: `test/title-quotes.test.js`
- Modify: `plugins/title-quotes.user.js`（`snapSig` 后、`setup` 前加纯函数；debug 挂出）

**Interfaces:**
- Consumes: `series` 项 `{ t, titles: { [key]: { lo, hi, mid } } }`
- Produces:
  - `periodMs(rangeDays: number) => number`
  - `foldCandles(series, key, { rangeDays = 7, now = Date.now() } = {}) => { t, o, h, l, c }[]`（`t` 为桶起点）

- [ ] **Step 1: Write the failing tests**

在 `test/title-quotes.test.js` 现有用例之后追加：

```js
test('称号行情：periodMs 随 7/30/90 天切换', async () => {
  const { dbg } = await boot()
  assert.equal(dbg.periodMs(7), 3600e3)
  assert.equal(dbg.periodMs(30), 4 * 3600e3)
  assert.equal(dbg.periodMs(90), 864e5)
})

test('称号行情：同一小时三笔收成一根挂单 K', async () => {
  const { dbg } = await boot()
  const t0 = 20 * 3600e3
  const key = '全站偶像@SSR'
  const q = (lo, hi, mid) => ({ [key]: { rarity: 'SSR', lo, hi, mid } })
  const series = [
    { t: t0 + 100, titles: q(10, 30, 20) },
    { t: t0 + 1000, titles: q(8, 40, 25) },
    { t: t0 + 2000, titles: q(12, 28, 18) },
  ]
  const bars = dbg.foldCandles(series, key, { rangeDays: 7, now: t0 + 3600e3 - 1 })
  assert.equal(bars.length, 1)
  assert.equal(bars[0].t, t0)
  assert.equal(bars[0].o, 20)
  assert.equal(bars[0].h, 40)
  assert.equal(bars[0].l, 8)
  assert.equal(bars[0].c, 18)
})

test('称号行情：收大于开为涨', async () => {
  const { dbg } = await boot()
  const t0 = 8 * 3600e3
  const key = 'A@N'
  const series = [
    { t: t0 + 1, titles: { [key]: { lo: 1, hi: 3, mid: 2 } } },
    { t: t0 + 2, titles: { [key]: { lo: 1, hi: 9, mid: 8 } } },
  ]
  const [bar] = dbg.foldCandles(series, key, { rangeDays: 7, now: t0 + 10 })
  assert.ok(bar.c >= bar.o)
})

test('称号行情：两笔相隔 3 小时仍在售则空档补平线', async () => {
  const { dbg } = await boot()
  const t0 = 30 * 3600e3
  const key = 'A@N'
  const rec = { [key]: { lo: 10, hi: 20, mid: 15 } }
  const series = [
    { t: t0, titles: rec },
    { t: t0 + 3 * 3600e3, titles: rec },
  ]
  const bars = dbg.foldCandles(series, key, { rangeDays: 7, now: t0 + 3 * 3600e3 + 10 })
  assert.equal(bars.length, 4)
  assert.equal(bars[1].o, 15)
  assert.equal(bars[1].c, 15)
  assert.equal(bars[1].h, 20)
  assert.equal(bars[1].l, 10)
  assert.equal(bars[2].o, 15)
})

test('称号行情：全场快照里没有该称号则停止补 K', async () => {
  const { dbg } = await boot()
  const t0 = 40 * 3600e3
  const key = 'A@N'
  const series = [
    { t: t0, titles: { [key]: { lo: 10, hi: 20, mid: 15 } } },
    { t: t0 + 2 * 3600e3, titles: { 'B@N': { lo: 1, hi: 2, mid: 1 } } },
  ]
  const bars = dbg.foldCandles(series, key, { rangeDays: 7, now: t0 + 4 * 3600e3 })
  assert.equal(bars.some((b) => b.t >= t0 + 2 * 3600e3), false)
  assert.ok(bars.some((b) => b.t === t0))
})
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `node --test --test-force-exit test/title-quotes.test.js`  
Expected: `dbg.periodMs` / `dbg.foldCandles` 不是函数。

- [ ] **Step 3: Minimal implementation**

`snapSig` 之后：

```js
function periodMs(rangeDays) {
  const d = Number(rangeDays) || 7
  if (d <= 7) return 3600e3
  if (d <= 30) return 4 * 3600e3
  return 864e5
}

function foldCandles(series, key, { rangeDays = 7, now = Date.now() } = {}) {
  const period = periodMs(rangeDays)
  const cutoff = now - rangeDays * 864e5
  const raw = series || []
  const inRange = raw.filter((s) => s.t >= cutoff)
  const snaps = inRange.length ? inRange : raw
  const points = snaps
    .map((s) => ({
      t: s.t,
      q: s.titles && s.titles[key] ? s.titles[key] : null,
    }))
    .sort((a, b) => a.t - b.t)
  if (!points.length) return []
  const start = Math.floor(points[0].t / period) * period
  const end = Math.floor(now / period) * period + period
  let last = null
  let listed = false
  const bars = []
  for (let b = start; b < end; b += period) {
    const inB = points.filter((p) => p.t >= b && p.t < b + period)
    const quotes = inB.filter((p) => p.q).map((p) => p.q)
    const sawDelist = inB.some((p) => !p.q)
    if (quotes.length) {
      last = quotes[quotes.length - 1]
      listed = !sawDelist || inB.filter((p) => p.q).pop().t >= (inB.filter((p) => !p.q).pop()?.t || 0)
      if (sawDelist) {
        const lastQ = inB.filter((p) => p.q).reduce((a, p) => (p.t >= a.t ? p : a))
        const lastD = inB.filter((p) => !p.q).reduce((a, p) => (p.t >= a.t ? p : a))
        listed = lastQ.t >= lastD.t
      } else listed = true
      bars.push({
        t: b,
        o: quotes[0].mid,
        h: Math.max(...quotes.map((q) => q.hi)),
        l: Math.min(...quotes.map((q) => q.lo)),
        c: quotes[quotes.length - 1].mid,
      })
      last = quotes[quotes.length - 1]
    } else if (sawDelist) {
      listed = false
      last = null
    } else if (listed && last) {
      bars.push({ t: b, o: last.mid, h: last.hi, l: last.lo, c: last.mid })
    }
  }
  return bars
}
```

`listed` 在第一笔 quotes 之前为 false。第一笔 quotes 后 `listed = true`，除非同桶更晚的点是 delist。

更干净的同桶规则：按时间扫 `inB`，用最后状态。实现时先按 `t` 排序 `inB`，有 quotes 则用 quotes 合成 K；然后 `listed = inB[inB.length-1].q != null`；`last` 取最后一个有 `q` 的，若最后是 delist 则 `listed=false` 且可保留 last 但不再补后续。

debug：

```js
periodMs,
foldCandles,
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `node --test --test-force-exit test/title-quotes.test.js`  
Expected: 上述新用例 PASS，旧用例仍绿。

---

### Task 2: SVG 蜡烛接入各称号行

**Files:**
- Modify: `test/title-quotes.test.js`
- Modify: `plugins/title-quotes.user.js`（`lines` 旁加 `candles`；`render` 各称号 `body`）

**Interfaces:**
- Consumes: `foldCandles`、现有 `rangeDays` / `chartSrc` 的 cutoff 逻辑（`foldCandles` 自己按 `rangeDays`+`now` 切）
- Produces: 各称号行 SVG `.lsb-title-quotes-k`，含 `rect` 与影线 `line`；caption 文本

- [ ] **Step 1: Write the failing render test**

把「两次出线」里对总览的断言写清楚，并追加：

```js
test('称号行情：各称号展开为挂单 K，总览仍折线', async () => {
  const { w, dbg } = await boot()
  dbg.reset()
  const t0 = Date.now() - 864e5
  const listings = dbg.parseCards(
    card('吃瓜群众', 'N', 20, 'a') + card('隐藏大佬', 'SSR', 666, 'e'),
  )
  const titles = dbg.foldTitles(listings)
  const anchors = dbg.pickAnchors(listings, titles)
  dbg.pushSnap({ anchors, titles }, t0)
  dbg.pushSnap({ anchors, titles }, t0 + 13 * 3600e3)
  w.LSB.open('title-quotes')
  const view = w.document.querySelector('.lsb-view')
  const marketSvg = view.querySelector('.lsb-title-quotes-anchors + .lsb-title-quotes-host svg, .lsb-title-quotes-anchors + * svg')
  const marketHost = view.querySelector('.lsb-title-quotes-anchors')?.nextElementSibling
  assert.ok(marketHost?.querySelector('polyline'), '总览仍是折线')
  const row = [...view.querySelectorAll('.lsb-title-quotes-row')].find((el) =>
    /隐藏大佬/.test(el.textContent),
  )
  assert.ok(row)
  row.open = true
  assert.ok(row.querySelector('svg.lsb-title-quotes-k, .lsb-title-quotes-k svg, svg rect'))
  assert.ok(row.querySelector('rect'))
  assert.match(row.textContent, /挂单合成 · 非成交/)
  assert.equal(row.querySelectorAll('polyline').length, 0, '称号行不再用双折线')
})
```

并改「零快照 / 一次 / 两次」：一次快照时 `assert.equal(w.document.querySelector('.lsb-title-quotes-anchors')?.nextElementSibling?.querySelector?.('.lsb-svg'), null)` 或总览仍匹配 `/再等/`；不要用「整页没有任何 svg」——称号行可以出一根 K。

- [ ] **Step 2: Run to verify fail**

Expected: 找不到 `rect` / 文案 / 称号行仍是 polyline。

- [ ] **Step 3: Implement `candles` + render**

```js
function candles(bars) {
  if (!bars.length) return ''
  const W = 620
  const H = 170
  const P = { l: 46, r: 12, t: 12, b: 22 }
  const vals = bars.flatMap((b) => [b.o, b.h, b.l, b.c])
  const min = Math.min(...vals)
  const max = Math.max(...vals)
  const span = max - min || 1
  const Y = (v) => P.t + (1 - (v - min) / span) * (H - P.t - P.b)
  const innerW = W - P.l - P.r
  const slot = innerW / bars.length
  const bodyW = Math.max(2, slot * 0.55)
  const parts = bars.map((bar, i) => {
    const x = P.l + (i + 0.5) * slot
    const yO = Y(bar.o)
    const yC = Y(bar.c)
    const up = bar.c >= bar.o
    const color = up ? 'var(--danger,#d55)' : 'var(--success,#3aa08f)'
    const yTop = Math.min(yO, yC)
    const bh = Math.max(1, Math.abs(yO - yC))
    return `<line class="lsb-title-quotes-wick" x1="${x.toFixed(1)}" x2="${x.toFixed(1)}" y1="${Y(bar.h).toFixed(1)}" y2="${Y(bar.l).toFixed(1)}" stroke="${color}" stroke-width="1"></line>
      <rect class="lsb-title-quotes-body" x="${(x - bodyW / 2).toFixed(1)}" y="${yTop.toFixed(1)}" width="${bodyW.toFixed(1)}" height="${bh.toFixed(1)}" fill="${color}"></rect>`
  })
  return `<svg class="lsb-svg lsb-title-quotes-k" viewBox="0 0 ${W} ${H}" preserveAspectRatio="xMidYMid meet" role="img" style="aspect-ratio:${W}/${H}">
    <rect x="${P.l}" y="${P.t}" width="${W - P.l - P.r}" height="${H - P.t - P.b}" fill="none" stroke="var(--line-soft,#eee)"></rect>
    ${parts.join('')}
    <text x="${P.l - 6}" y="${Y(max) + 4}" text-anchor="end" font-size="11" fill="var(--text-muted,#888)">${max}</text>
    <text x="${P.l - 6}" y="${Y(min) + 4}" text-anchor="end" font-size="11" fill="var(--text-muted,#888)">${min}</text>
    <text x="${P.l}" y="${H - 6}" font-size="11" fill="var(--text-muted,#888)">${new Date(bars[0].t).toLocaleDateString('zh-CN')}</text>
    <text x="${W - P.r}" y="${H - 6}" text-anchor="end" font-size="11" fill="var(--text-muted,#888)">${new Date(bars[bars.length - 1].t).toLocaleDateString('zh-CN')}</text>
  </svg>`
}
```

`render` 里各称号 `body`：

```js
const bars = foldCandles(all, k, { rangeDays, now: Date.now() })
const body = bars.length
  ? `<div class="lsb-title-quotes-host">${candles(bars)}</div>
     <div class="lsb-row-desc">挂单合成 · 非成交</div>`
  : ''
```

不要再用 `lines(..., titleKeys)`。

- [ ] **Step 4: Run `test/title-quotes.test.js`**

Expected: 全绿。

---

### Task 3: 版本与冻本

**Files:**
- Modify: `plugins/title-quotes.user.js` 头与 manifest `1.0.5`
- Modify: `build-suite.mjs` `SUITE_VERSION`、`suite/suite-center.js` → `1.0.68`
- Modify: `README.md` 插件表「各称号展开为挂单合成 K」；`npm test` 用例数以跑完为准
- Modify: `docs/CONVENTIONS.md`、`docs/已知问题-rc.md`、`docs/测试招募-氢氧-beta.md`、`docs/功能征集-rc-ga.md` 氧版本

- [ ] **Step 1: 改版本与文案**
- [ ] **Step 2: `node build.mjs` 然后 `node build-suite.mjs` 然后 `node --test --test-force-exit --test-concurrency=4`**

Expected: 氢仍 0.1.29；氧产物 1.0.68；fail 0。
