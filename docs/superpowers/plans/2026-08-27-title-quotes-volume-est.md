# 成交估量 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 用挂单剩余变化大略估计成交笔数与件数，按时间窗加总，写在各称号行和大盘冷热榜上，并标明含下架/撤单。

**Architecture:** 顶层纯函数 `bookFromListings` / `diffBook` / `estimateFlow` / `sumFlow`。`setup` 把上一份柜台存在 store 键 `book`；每轮把增量 `flow` 写进快照。`snapSig` 不看 `sold`/`fills`；有成交增量时禁止 12 小时同价合并。

**Tech Stack:** `plugins/title-quotes.user.js`、jsdom `node:test`、`node build-suite.mjs`。

## Global Constraints

- Spec：`docs/superpowers/specs/2026-08-27-title-quotes-volume-est-design.md`
- 插件 `1.0.16` → `1.0.17`（Task 3 才改号）；氧 `SUITE_VERSION` / `suite-center` `1.0.94` → `1.0.95`（Task 3）；氢 `0.1.33` 不动；不改 `ORDER`
- 不画 K 量柱；不改采集 URL；不改 `MERGE_MS` 的 12 小时同价窗口本身；氧面板不加字段；不写购买；不新插件
- 源文件 UTF-8 无 BOM、LF；Windows PowerShell 不要用 `&&`
- 用户未明确要求则不要 `git commit`；各 Task 末步标 Skip
- 文案锁定：行上 **估 F 笔 · S 件**；榜上 **估 F笔 S件**；说明 **成交为挂单剩余变化的估计，含下架/撤单，不是真成交**
- store 键 `book`：`{ t, rows: { [listing_id]: { key, qty } } }`；过期 **3 小时**整轮不估
- 测试走 `plugins/*.user.js`。Windows 上 `node --test` 若沙箱失败，用全权限再跑

---

### Task 1: `diffBook` / `estimateFlow` / `sumFlow`

**Files:**
- Modify: `test/title-quotes.test.js`
- Modify: `plugins/title-quotes.user.js`（`foldTitles` 之后、`snapSig` 之前插入纯函数；debug 导出）

**Interfaces:**
- Consumes: 现有 `titleKey`、`rangeCutoff`、listing 形状 `{ id, name, rarity, qty }`
- Produces:
  - `BOOK_STALE_MS = 3 * 3600e3`
  - `bookFromListings(listings) => { [id]: { key, qty } }`
  - `diffBook(prevRows, listings) => { [key]: { sold, fills } }`
  - `estimateFlow(prevBook, listings, now) =>` 同上或 `{}`（无 book / 超 3 小时）
  - `sumFlow(series, key, { rangeDays, now }) => { sold, fills }`
  - `flowTraded(flow) => boolean`

- [ ] **Step 1: Write the failing tests**

插在 `test('称号行情：同称号多单价 → lo / hi / mid')` **之后**：

```js
test('称号行情：diffBook 按挂单剩余估笔数和件数', async () => {
  const { dbg } = await boot()
  const key = '全站偶像@SSR'
  const L = (id, qty) => ({ id, name: '全站偶像', rarity: 'SSR', price: 260, qty })
  const drop = dbg.diffBook(dbg.bookFromListings([L('1', 5)]), [L('1', 3)])
  assert.equal(drop[key].fills, 1)
  assert.equal(drop[key].sold, 2)
  const gone = dbg.diffBook(dbg.bookFromListings([L('1', 4)]), [])
  assert.equal(gone[key].fills, 1)
  assert.equal(gone[key].sold, 4)
  const born = dbg.diffBook({}, [L('9', 8)])
  assert.equal(born[key], undefined)
  const two = dbg.diffBook(dbg.bookFromListings([L('a', 2), L('b', 2)]), [L('a', 1), L('b', 1)])
  assert.equal(two[key].fills, 2)
  assert.equal(two[key].sold, 2)
  const chunk = dbg.diffBook(dbg.bookFromListings([L('1', 9)]), [L('1', 4)])
  assert.equal(chunk[key].fills, 1, '同一挂单少 5 件仍是 1 笔')
  assert.equal(chunk[key].sold, 5)
})

test('称号行情：无柜台或隔了 3 小时不把积压差异算进现在', async () => {
  const { dbg } = await boot()
  const L = (id, qty) => ({ id, name: 'A', rarity: 'N', price: 10, qty })
  const now = 1_700_000_000_000
  assert.deepEqual(dbg.estimateFlow(null, [L('1', 1)], now), {})
  const stale = { t: now - 3 * 3600e3 - 1, rows: dbg.bookFromListings([L('1', 5)]) }
  assert.deepEqual(dbg.estimateFlow(stale, [L('1', 1)], now), {})
  const fresh = { t: now - 60e3, rows: dbg.bookFromListings([L('1', 5)]) }
  assert.equal(dbg.estimateFlow(fresh, [L('1', 1)], now)['A@N'].sold, 4)
})

test('称号行情：sumFlow 只加总时间窗内快照的估量', async () => {
  const { dbg } = await boot()
  const now = new Date()
  now.setHours(15, 0, 0, 0)
  const n = now.getTime()
  const key = 'A@N'
  const series = [
    { t: n - 864e5, titles: { [key]: { mid: 1 } }, flow: { [key]: { sold: 9, fills: 9 } } },
    { t: n - 3600e3, titles: { [key]: { mid: 1, sold: 2, fills: 1 } } },
    { t: n - 60e3, flow: { [key]: { sold: 3, fills: 2 } } },
  ]
  const today = dbg.sumFlow(series, key, { rangeDays: 0, now: n })
  assert.equal(today.sold, 5)
  assert.equal(today.fills, 3)
  const week = dbg.sumFlow(series, key, { rangeDays: 7, now: n })
  assert.equal(week.sold, 14)
  assert.equal(week.fills, 12)
})
```

- [ ] **Step 2: Run tests to verify they fail**

Run:

```
node --test --test-force-exit --test-concurrency=1 --test-name-pattern "diffBook 按挂单|无柜台或隔了|sumFlow 只加总" test/title-quotes.test.js
```

Expected: `dbg.diffBook` / `bookFromListings` / `estimateFlow` / `sumFlow` 不是函数。

- [ ] **Step 3: Minimal implementation**

In `plugins/title-quotes.user.js` after `foldTitles` (before `pickAnchors`):

```js
  const BOOK_STALE_MS = 3 * 3600e3

  function bookFromListings(listings) {
    const rows = {}
    for (const x of listings || []) {
      if (!x || !x.id) continue
      const qty = Number(x.qty) > 0 ? Number(x.qty) : 1
      rows[String(x.id)] = { key: titleKey(x.name, x.rarity), qty }
    }
    return rows
  }

  function diffBook(prevRows, listings) {
    const curr = bookFromListings(listings)
    const prev = prevRows || {}
    const out = {}
    const add = (key, sold, fills) => {
      if (!key || (!(sold > 0) && !(fills > 0))) return
      if (!out[key]) out[key] = { sold: 0, fills: 0 }
      out[key].sold += sold
      out[key].fills += fills
    }
    for (const [id, row] of Object.entries(prev)) {
      const now = curr[id]
      if (!now) {
        add(row.key, Number(row.qty) > 0 ? Number(row.qty) : 0, 1)
        continue
      }
      const before = Number(row.qty) > 0 ? Number(row.qty) : 0
      const after = Number(now.qty) > 0 ? Number(now.qty) : 0
      if (after < before) add(now.key || row.key, before - after, 1)
    }
    return out
  }

  function estimateFlow(prevBook, listings, now = Date.now()) {
    if (!prevBook || !prevBook.rows || !Number.isFinite(prevBook.t)) return {}
    if (now - prevBook.t > BOOK_STALE_MS) return {}
    return diffBook(prevBook.rows, listings)
  }

  function flowTraded(flow) {
    return Object.values(flow || {}).some((d) => Number(d?.sold) > 0 || Number(d?.fills) > 0)
  }

  function sumFlow(series, key, { rangeDays = 7, now = Date.now() } = {}) {
    const cutoff = rangeCutoff(rangeDays, now)
    let sold = 0
    let fills = 0
    for (const s of series || []) {
      if (!s || s.t < cutoff) continue
      const d = (s.flow && s.flow[key]) || (s.titles && s.titles[key])
      if (!d) continue
      const ds = Number(d.sold)
      const df = Number(d.fills)
      if (ds > 0) sold += ds
      if (df > 0) fills += df
    }
    return { sold, fills }
  }
```

`rangeCutoff` 目前在 `snapSig` **下面**。`sumFlow` 不能放在 `foldTitles` 后立刻调用尚未声明的 `rangeCutoff`——函数声明会提升，但这些是 `function` 声明，整个 IIFE 内都会提升。`rangeCutoff` 也是 `function`，提升有效。可以放在 `foldTitles` 后。

Debug handle 增加：`bookFromListings`、`diffBook`、`estimateFlow`、`sumFlow`、`flowTraded`、`BOOK_STALE_MS`。

- [ ] **Step 4: Run tests to verify they pass**

Run 与 Step 2 相同命令。Expected: 全绿。再跑：

```
node --test --test-force-exit --test-concurrency=1 --test-name-pattern "同称号多单价|12 小时内同价" test/title-quotes.test.js
```

Expected: 仍绿。

- [ ] **Step 5: Commit**

Skip unless the user asked to commit.

---

### Task 2: 写入快照、禁止吃掉估量、界面

**Files:**
- Modify: `test/title-quotes.test.js`
- Modify: `plugins/title-quotes.user.js`（`pushSnap`、`cycle`、`render` 行标题与冷热榜、说明句）

**Interfaces:**
- Consumes: Task 1 函数；现有 `pushSnap` / `snapSig` / `cycle` / `movers` 行
- Produces: 快照可带 `flow`；`titles[k].sold`/`fills` 仅给本轮仍在售的称号；整称号消失只写 `flow`（避免 `n:0` 被当成在售）；`pushSnap` 在 `flowTraded` 时不合并；store `book`；debug `ingestListings(listings, now)`

- [ ] **Step 1: Write the failing tests**

```js
test('称号行情：n 不变但有买卖时快照仍要留下估量', async () => {
  const { dbg } = await boot()
  dbg.reset()
  const t0 = 1_700_000_000_000
  const key = '全站偶像@SSR'
  const L = (id, qty, price = 260) => ({ id, name: '全站偶像', rarity: 'SSR', price, qty })
  dbg.ingestListings([L('old', 1)], t0)
  const added = dbg.ingestListings([L('new', 1)], t0 + 60e3)
  assert.equal(added, true, 'sig 相同（n 仍为 1）也必须 push')
  const snaps = dbg.series()
  assert.ok(snaps.length >= 2)
  const last = snaps[snaps.length - 1]
  assert.equal(last.flow[key].fills, 1)
  assert.equal(last.flow[key].sold, 1)
})

test('称号行情：称号行与大盘榜展示估量并标明含撤单', async () => {
  const { w, dbg } = await boot()
  dbg.reset()
  const now = Date.now()
  const key = '隐藏大佬@SSR'
  const listings = dbg.parseCards(card('隐藏大佬', 'SSR', 666, 'e', 3) + card('吃瓜群众', 'N', 20, 'a'))
  const titles = dbg.foldTitles(listings)
  const anchors = dbg.pickAnchors(listings, titles)
  dbg.pushSnap(
    { anchors, titles: { ...titles, [key]: { ...titles[key], sold: 5, fills: 2 } }, flow: { [key]: { sold: 5, fills: 2 } } },
    now - 1800e3,
  )
  dbg.pushSnap({ anchors, titles }, now - 60e3)
  const view = await quotesView(w, dbg)
  const row = [...view.querySelectorAll('.lsb-title-quotes-row')].find((el) => /隐藏大佬/.test(el.textContent))
  assert.ok(row)
  assert.match(row.textContent, /估\s*2\s*笔/)
  assert.match(row.textContent, /5\s*件/)
  assert.match(view.textContent, /含下架\/撤单/)
  view.querySelector('[data-board-view="board"]').click()
  assert.match(view.textContent, /估\s*2\s*笔/)
})
```

`ingestListings` 此刻不存在，第一用例红。

- [ ] **Step 2: Run tests to verify they fail**

Run:

```
node --test --test-force-exit --test-concurrency=1 --test-name-pattern "n 不变但有买卖|称号行与大盘榜展示估量" test/title-quotes.test.js
```

Expected: `ingestListings` 不是函数，或行上没有「估 2 笔」。

- [ ] **Step 3: Minimal implementation**

Replace `pushSnap` with:

```js
    function pushSnap(snap, now = Date.now()) {
      const arr = get()
      const last = arr[arr.length - 1]
      const traded = flowTraded(snap.flow)
      if (last && snapSig(last) === snapSig(snap) && now - last.t < MERGE_MS && !traded) {
        last.t = Math.max(last.t, now)
        set(arr)
        return false
      }
      arr.push({ t: now, anchors: snap.anchors, titles: snap.titles, flow: snap.flow || {} })
      const deadline = now - cfg.keepDays * 864e5
      set(arr.filter((x) => x.t >= deadline))
      return true
    }

    function ingestListings(listings, now = Date.now()) {
      const prev = api.store.get('book', null)
      const flow = estimateFlow(prev, listings, now)
      api.store.set('book', { t: now, rows: bookFromListings(listings) })
      const titles = foldTitles(listings)
      for (const k of Object.keys(titles)) {
        titles[k].sold = flow[k]?.sold ?? 0
        titles[k].fills = flow[k]?.fills ?? 0
      }
      const anchors = pickAnchors(listings, titles)
      return pushSnap({ anchors, titles, flow }, now)
    }
```

In `cycle`，把

```js
          const titles = foldTitles(listings)
          const anchors = pickAnchors(listings, titles)
          pushSnap({ anchors, titles })
```

换成 `ingestListings(listings)`。

`render` 行情行：在算 `price` 处：

```js
            const flow = sumFlow(chartSrc.length ? chartSrc : all, k, { rangeDays })
            const est = `估 ${flow.fills} 笔 · ${flow.sold} 件`
            const price = off
              ? `已下架 · ${est}`
              : `最低 ${lo} · 最高 ${hi} · 上架 ${cur.n ?? 0} 个 · ${est}`
```

`chartSrc` 在本日可能短于 `view`；求和必须用 **时间窗过滤后的快照**，不要用 `chartSrc` 回退到全部历史。应：

```js
            const flow = sumFlow(all, k, { rangeDays })
```

`sumFlow` 自己按 `rangeCutoff` 切。不要传 `chartSrc`。

大盘 `moverLine`：

```js
          const moverLine = (row) => {
            const dSign = row.delta > 0 ? '+' : ''
            const fl = sumFlow(all, row.key, { rangeDays })
            return `<div class="lsb-title-quotes-mover">${nameBtn(row)}<span>${dSign}${esc(fmtPrice(row.delta))} · ${esc(fmtPct(row.pct))} · 估 ${fl.fills}笔 ${fl.sold}件</span></div>`
          }
```

说明句：`tools` 所在 `lsb-cal-head` 下面、`bodyHtml` 里行情/大盘都要有。在 `inner` 拼接处 `head` 后立刻加：

```js
      const estNote = `<div class="lsb-row-desc">成交为挂单剩余变化的估计，含下架/撤单，不是真成交</div>`
      const inner = `
        ${head}
        ${estNote}
        ${bodyHtml}`
```

`reset` debug 现清 `series`。同步清柜台，避免用例互相污染：

```js
      reset: () => {
        set([])
        api.store.set('book', null)
      },
```

Debug 增加 `ingestListings`。

- [ ] **Step 4: Run tests to verify they pass**

Run:

```
node --test --test-force-exit --test-concurrency=1 --test-name-pattern "n 不变但有买卖|称号行与大盘榜展示估量|12 小时内同价|同称号多单价|氧面板是设置加打开浮层|冷热榜短线" test/title-quotes.test.js
```

Expected: 全绿。再跑整文件 `test/title-quotes.test.js`。Expected: 全绿。

- [ ] **Step 5: Commit**

Skip unless the user asked to commit.

---

### Task 3: 版本、RC 文档、打包

**Files:**
- Modify: `plugins/title-quotes.user.js`（`@version` 与 `manifest.version` = `1.0.17`）
- Modify: `build-suite.mjs`（`SUITE_VERSION = '1.0.95'`）
- Modify: `suite/suite-center.js`（`version: '1.0.95'`）
- Modify: `docs/CONVENTIONS.md`、`docs/功能征集-rc-ga.md`、`docs/测试招募-氢氧-beta.md`、`docs/已知问题-rc.md`（氧 **1.0.94** → **1.0.95**）

**Interfaces:**
- Consumes: Task 1–2 已绿行为
- Produces: `dist/linuxsb-suite.user.js` v1.0.95，banner 含称号行情 v1.0.17

- [ ] **Step 1: Bump versions and RC docs**

两处插件版本 `1.0.17`。套件与 suite-center `1.0.95`。RC 文档氧版本同步。氢、`ORDER` 不动。

- [ ] **Step 2: Build suite**

Run: `node build-suite.mjs`

Expected: `v1.0.95`、18 模块；产物含 `diffBook` 与「含下架/撤单」。

- [ ] **Step 3: Full test suite**

Run: `npm test`

Expected: 全绿（当前 367，本计划 +5）。失败则修插件或测试。

- [ ] **Step 4: Commit**

Skip unless the user asked to commit.

---

## Self-review

- Spec `diffBook` 规则与 3 小时 → Task 1
- Spec 快照增量、`n` 不变也要留下、不把消失称号写成在售 → Task 2 `flow` + ingest
- Spec 行 / 榜 / 说明文案 / 时间窗求和 → Task 2
- Spec 不画量柱、不改 MERGE 窗口、不买、氢不动 → Global Constraints
- 版本 1.0.17 / 氧 1.0.95 → Task 3
- 无 TBD；`ingestListings` / `sumFlow` 名称在测试与实现一致
