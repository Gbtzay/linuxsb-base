# 红包 / 发卡 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 列表上用左侧色条标出还活着的红包 / 发卡；机会监控可按这两个标记盯，默认关。

**Architecture:** 氢 `parseListItem` 增加 `marks`。氧新模块 `topic-marks` 只涂 `live` 行。机会监控加两个开关，命中条件为标题关键词或 `live` 标记。LTS 不加该模块。

**Tech Stack:** 现有氢 `src/site.js`、氧 userscript、jsdom `node:test`。不新协议、不进帖核对。

## Global Constraints

- Spec：`docs/superpowers/specs/2026-09-12-topic-marks-design.md`
- 氢 `0.1.39` → `0.1.40`（Task 1）；`topic-marks` `1.0.0`（Task 2）；机会监控 `1.0.1` → `1.0.2`（Task 3）；氧 / LTS `1.0.110` → `1.0.111`（Task 4）
- 选择器只写在 `src/site.js`：`.red-packet-title-status`、`.virtual-card-title-status`
- 不 POST 领红包 / 领卡；不 GET `?tab=notifications`；不改 `isSpaUrl`；不改产品名；氢不抬到 `1.0.0`；不发 Release
- `ORDER_LTS` 不进 `topic-marks`；皮肤左栏不加工具按钮
- 插件源 UTF-8 无 BOM、LF；Windows 不要用 `Set-Content` / `&&`（PowerShell 用分号或两条命令）
- 用户未明确要求则不要 `git commit`（下面 commit 步可跳过）

## Files

- Modify: `src/site.js`（`parseListItem.marks`）
- Modify: `src/core.js` `VERSION`、`package.json`、`test/core.test.js`、`test/site.test.js`
- Create: `plugins/topic-marks.user.js`、`test/topic-marks.test.js`
- Modify: `plugins/forum-watch.user.js`、`test/batch3.test.js`
- Modify: `suite/order.js`（`ORDER` 在 `read-mark` 后插入 `topic-marks`；`ORDER_LTS` 不动）
- Modify: `test/suite.test.js`、`test/lts.test.js`（LTS 禁名单加 `topic-marks`）
- Modify: `build-suite.mjs`、`suite/suite-center.js` → `1.0.111`
- Modify: `README.md`、`docs/CONVENTIONS.md` §2.2、`docs/功能征集-rc-ga.md`、`docs/已知问题-rc.md`、`docs/测试招募-氢氧-beta.md`（版本钉）
- Run: Task 1 后 `node build.mjs`（后续插件测试读 `dist/linuxsb-base.user.js`）；Task 4 `npm run build` 再 `npm test`

---

### Task 1: 氢 `marks`

**Files:**
- Modify: `test/site.test.js`（扩展 v9.0 徽章用例，并加结束 / 空标记用例）
- Modify: `src/site.js` `parseListItem`
- Modify: `src/core.js` `VERSION`、`package.json`、`test/core.test.js`
- Run: `node build.mjs`

**Interfaces:**
- Consumes: 现有 `parseListItem(li)`、`text()`、`badges` 选取范围
- Produces: `parseListItem` 返回值增加 `marks: { redPacket: 'live'|'ended'|null, virtualCard: 'live'|'ended'|null }`。`api.parse.list` / `listItem` 原样带出。`badges` 不变。

- [ ] **Step 1: Write the failing test**

在 `test/site.test.js` 里把现有 `v9.0：列表徽章含热/红包帖/发卡状态` **补上 marks 断言**（不要删 badges 断言），并在它后面加一个结束 / 空标记用例：

```js
test('v9.0：列表徽章含热/红包帖/发卡状态', () => {
  const html =
    '<ul class="post-list">' +
    '<li class="post-item"><div class="post-title-row">' +
    '<a class="post-title" href="/topic/10">红包</a>' +
    '<span class="topic-stamp-badge topic-stamp-hot">热</span>' +
    '<span class="red-packet-title-status">红包帖</span>' +
    '</div></li>' +
    '<li class="post-item"><div class="post-title-row">' +
    '<a class="post-title" href="/topic/11">发卡</a>' +
    '<span class="virtual-card-title-status active">发卡中</span>' +
    '</div></li>' +
    '</ul>'
  const list = parseList(new JSDOM(html, { url: 'https://linux.sb/' }).window.document)
  assert.deepEqual(list[0].badges, ['热', '红包帖'])
  assert.deepEqual(list[1].badges, ['发卡中'])
  assert.deepEqual(list[0].marks, { redPacket: 'live', virtualCard: null })
  assert.deepEqual(list[1].marks, { redPacket: null, virtualCard: 'live' })
})

test('v9.0：红包/发卡结束态与空标记', () => {
  const html =
    '<ul class="post-list">' +
    '<li class="post-item"><div class="post-title-row">' +
    '<a class="post-title" href="/topic/12">抢完</a>' +
    '<span class="red-packet-title-status">已抢完</span>' +
    '</div></li>' +
    '<li class="post-item"><div class="post-title-row">' +
    '<a class="post-title" href="/topic/13">结束</a>' +
    '<span class="virtual-card-title-status">结束</span>' +
    '</div></li>' +
    '<li class="post-item"><div class="post-title-row">' +
    '<a class="post-title" href="/topic/14">双标</a>' +
    '<span class="virtual-card-title-status active">结束</span>' +
    '</div></li>' +
    '<li class="post-item"><div class="post-title-row">' +
    '<a class="post-title" href="/topic/15">认不出</a>' +
    '<span class="virtual-card-title-status">发卡</span>' +
    '</div></li>' +
    '<li class="post-item"><div class="post-title-row">' +
    '<a class="post-title" href="/topic/16">普通</a>' +
    '</div></li>' +
    '</ul>'
  const list = parseList(new JSDOM(html, { url: 'https://linux.sb/' }).window.document)
  assert.equal(list[0].marks.redPacket, 'ended')
  assert.equal(list[1].marks.virtualCard, 'ended')
  assert.equal(list[2].marks.virtualCard, 'ended', '结束优先于 active')
  assert.equal(list[3].marks.virtualCard, 'ended')
  assert.deepEqual(list[4].marks, { redPacket: null, virtualCard: null })
})
```

同时改 `test/core.test.js`：

```js
test('正式版氢号是 0.1.40，面板标题不带 RC', () => {
  assert.equal(VERSION, '0.1.40')
```

- [ ] **Step 2: Run test to verify it fails**

```
node --test --test-force-exit test/site.test.js test/core.test.js
```

Expected: FAIL。`list[0].marks` 为 `undefined`；`VERSION` 仍是 `0.1.39`。不得在本步改 `src/site.js`。

- [ ] **Step 3: Write minimal implementation**

`src/core.js` 与 `package.json` 的版本改为 `0.1.40`。

在 `src/site.js` 的 `parseListItem` 里、`return {` 之前加入判定（`active` 必须用 `classList.contains`，禁止用 `className.includes('active')`，以免误伤 `inactive`）：

```js
  const redEl = li.querySelector('.red-packet-title-status')
  const cardEl = li.querySelector('.virtual-card-title-status')
  const blob = (el) => (el ? `${el.className} ${text(el)}` : '')
  const redPacket = !redEl
    ? null
    : /结束|已抢|抢完|已领|ended|expired/i.test(blob(redEl))
      ? 'ended'
      : 'live'
  const cardBlob = blob(cardEl)
  const virtualCard = !cardEl
    ? null
    : /结束|已结束|已发完|ended|expired/i.test(cardBlob)
      ? 'ended'
      : cardEl.classList.contains('active') || /发卡中|发放中/.test(text(cardEl))
        ? 'live'
        : 'ended'
```

在 `return` 对象里 `badges` 旁边加 `marks: { redPacket, virtualCard }`。`badges` 的 querySelector 列表不要改。淘帖 / `post-entry` 的提前 `return null` 不要动。

- [ ] **Step 4: Run test to verify it passes**

```
node --test --test-force-exit test/site.test.js test/core.test.js
```

Expected: PASS。然后重建氢（Task 2 / 3 的插件测试读产物）：

```
node build.mjs
```

Expected: 控制台打印氢 `v0.1.40`。

- [ ] **Step 5: Commit**

跳过，除非用户明确要求提交。若提交：

```
git add src/site.js src/core.js package.json test/site.test.js test/core.test.js dist/linuxsb-base.user.js
git commit -m "feat: parse list red-packet and card marks"
```

---

### Task 2: 氧模块 `topic-marks`

**Files:**
- Create: `test/topic-marks.test.js`
- Create: `plugins/topic-marks.user.js`（UTF-8 无 BOM、LF）
- Modify: `suite/order.js`（必须与新文件同一任务，否则 `SUITE_EXCLUDE` / `ORDER` 校验失败）

**Interfaces:**
- Consumes: Task 1 的 `it.marks?.redPacket === 'live'` / `it.marks?.virtualCard === 'live'`；`api.parse.listItem`；`api.sel.listItems`；`api.dom.each`；`route:changed`
- Produces: 模块 id `topic-marks`；class `lsb-topic-mark-red` / `lsb-topic-mark-card`；style id `lsb-topic-marks-style`；RPC `topic-marks:debug` → `{ painted(), liveRed(), liveCard() }`

- [ ] **Step 1: Write the failing test**

创建 `test/topic-marks.test.js`（UTF-8 无 BOM、LF）。夹具 `home.html` 没有红包节点，本文件自造列表，不要改夹具。

```js
/** 红包发卡：只给 live 行画左侧色条 */
import { test } from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { JSDOM } from 'jsdom'

const baseCode = readFileSync(new URL('../dist/linuxsb-base.user.js', import.meta.url), 'utf8')
const plug = readFileSync(new URL('../plugins/topic-marks.user.js', import.meta.url), 'utf8')

function listPage(rows) {
  return (
    '<html><body><ul class="post-list">' +
    rows
      .map(
        (r) =>
          `<li class="post-item"><div class="post-title-row">` +
          `<a class="post-title" href="/topic/${r.id}">${r.title}</a>${r.extra || ''}` +
          `</div></li>`,
      )
      .join('') +
    '</ul></body></html>'
  )
}

function makeSite(html) {
  const dom = new JSDOM(html, { url: 'https://linux.sb/', runScripts: 'outside-only' })
  const w = dom.window
  w.unsafeWindow = w
  w.requestAnimationFrame = (fn) => setTimeout(() => fn(Date.now()), 0)
  w.localStorage.setItem('lsb_base:__core:rate', JSON.stringify(10))
  w.localStorage.setItem('lsb_base:__core:urlPoll', JSON.stringify(0))
  return w
}

async function boot(html) {
  const w = makeSite(html)
  w.eval(baseCode)
  w.eval(plug)
  await new Promise((r) => setTimeout(r, 40))
  const dbg = await w.LSB.bus.request('topic-marks:debug')
  return { w, dbg }
}

const LIVE =
  '<span class="red-packet-title-status">红包帖</span>' +
  '<span class="virtual-card-title-status active">发卡中</span>'
const ENDED_RED = '<span class="red-packet-title-status">已抢完</span>'
const ENDED_CARD = '<span class="virtual-card-title-status">结束</span>'

test('红包发卡：只给 live 加 class，结束态不加', async () => {
  const { w, dbg } = await boot(
    listPage([
      { id: 1, title: '双活', extra: LIVE },
      { id: 2, title: '抢完', extra: ENDED_RED },
      { id: 3, title: '结束', extra: ENDED_CARD },
      { id: 4, title: '普通' },
    ]),
  )
  const items = [...w.document.querySelectorAll('ul.post-list > li.post-item')]
  assert.ok(items[0].classList.contains('lsb-topic-mark-red'))
  assert.ok(items[0].classList.contains('lsb-topic-mark-card'))
  assert.equal(items[1].classList.contains('lsb-topic-mark-red'), false)
  assert.equal(items[2].classList.contains('lsb-topic-mark-card'), false)
  assert.equal(items[3].classList.contains('lsb-topic-mark-red'), false)
  assert.equal(dbg.painted(), 1)
  assert.equal(dbg.liveRed(), 1)
  assert.equal(dbg.liveCard(), 1)
  const css = w.document.getElementById('lsb-topic-marks-style').textContent
  assert.match(css, /lsb-topic-mark-red\.lsb-topic-mark-card/)
  assert.match(css, /#e11d48.*#d97706/)
})

test('红包发卡：route:changed 后能摘能补', async () => {
  const { w, dbg } = await boot(listPage([{ id: 1, title: '活', extra: '<span class="red-packet-title-status">红包帖</span>' }]))
  assert.equal(dbg.liveRed(), 1)
  w.document.querySelector('ul.post-list').innerHTML = listPage([
    { id: 1, title: '死', extra: ENDED_RED },
    { id: 2, title: '卡', extra: '<span class="virtual-card-title-status active">发卡中</span>' },
  ]).match(/<ul class="post-list">([\s\S]*)<\/ul>/)[1]
  w.LSB.bus.emit('route:changed', { href: w.location.href, page: { type: 'home' } }, { source: 'core' })
  await new Promise((r) => setTimeout(r, 80))
  const items = [...w.document.querySelectorAll('ul.post-list > li.post-item')]
  assert.equal(items[0].classList.contains('lsb-topic-mark-red'), false)
  assert.ok(items[1].classList.contains('lsb-topic-mark-card'))
  assert.equal(dbg.liveRed(), 0)
  assert.equal(dbg.liveCard(), 1)
})

test('红包发卡：disable 去掉 style 与 class', async () => {
  const { w } = await boot(listPage([{ id: 1, title: '活', extra: '<span class="red-packet-title-status">红包帖</span>' }]))
  assert.ok(w.document.querySelector('.lsb-topic-mark-red'))
  w.LSB.disable('topic-marks')
  assert.equal(w.document.getElementById('lsb-topic-marks-style'), null)
  assert.equal(w.document.querySelector('.lsb-topic-mark-red'), null)
})
```

- [ ] **Step 2: Run test to verify it fails**

```
node --test --test-force-exit test/topic-marks.test.js
```

Expected: FAIL（读不到 `plugins/topic-marks.user.js` 或没有 `topic-marks:debug`）。不得在本步写插件。

- [ ] **Step 3: Write minimal implementation**

`suite/order.js` 的 `ORDER` 在 `'read-mark'` 后插入 `'topic-marks'`。`ORDER_LTS` 一行都不要动。

创建 `plugins/topic-marks.user.js`（编辑器存 UTF-8 无 BOM、LF）：

```js
// ==UserScript==
// @name         LSB·红包发卡
// @namespace    https://linux.sb/
// @version      1.0.0
// @description  列表左侧色条标出还活着的红包 / 发卡。需要 LINUX.SB 基座。
// @author       you
// @match        https://linux.sb/*
// @grant        none
// @run-at       document-end
// @noframes
// ==/UserScript==

(function () {
  'use strict'

  const manifest = {
    id: 'topic-marks',
    name: '红包发卡',
    version: '1.0.0',
    description: '列表左侧色条标出还活着的红包 / 发卡',
    author: 'you',
    requires: { base: '^0.1.0' },
    permissions: ['read', 'ui', 'events'],
  }

  function setup(api) {
    const STYLE_ID = 'lsb-topic-marks-style'
    const RED = 'lsb-topic-mark-red'
    const CARD = 'lsb-topic-mark-card'
    const listSel =
      api.sel?.listItems || 'ul.post-list > li.post-item:not(.post-entry):not(.topic-collections-collection-row)'

    const el = document.createElement('style')
    el.id = STYLE_ID
    el.textContent =
      `li.post-item.${RED}{box-shadow:inset 3px 0 0 #e11d48}` +
      `li.post-item.${CARD}{box-shadow:inset 3px 0 0 #d97706}` +
      `li.post-item.${RED}.${CARD}{box-shadow:inset 3px 0 0 #e11d48,inset 6px 0 0 #d97706}`
    document.head.appendChild(el)

    function paint(li) {
      const it = api.parse.listItem(li)
      li.classList.toggle(RED, it?.marks?.redPacket === 'live')
      li.classList.toggle(CARD, it?.marks?.virtualCard === 'live')
    }

    function paintAll() {
      for (const li of document.querySelectorAll(listSel)) paint(li)
    }

    api.dom.each(listSel, paint)
    api.on('route:changed', () => {
      setTimeout(paintAll, 50)
    })
    api.onDispose(() => {
      document.getElementById(STYLE_ID)?.remove()
      for (const li of document.querySelectorAll(`li.post-item.${RED}, li.post-item.${CARD}`)) {
        li.classList.remove(RED, CARD)
      }
    })

    api.ui.configTab({
      name: '红包发卡',
      order: 41,
      render(host) {
        const p = document.createElement('div')
        p.className = 'lsb-row-desc'
        p.textContent =
          '列表左侧色条标出还活着的红包（红）和发卡（琥珀）。结束态不画。盯红包 / 盯发卡在机会监控里，默认关。'
        host.appendChild(p)
      },
    })

    api.handle('topic-marks:debug', () => ({
      painted: () => document.querySelectorAll(`li.post-item.${RED}, li.post-item.${CARD}`).length,
      liveRed: () => document.querySelectorAll(`li.post-item.${RED}`).length,
      liveCard: () => document.querySelectorAll(`li.post-item.${CARD}`).length,
    }))

    return {}
  }

  const w = typeof unsafeWindow !== 'undefined' ? unsafeWindow : window
  if (w.LSB && w.LSB.register) w.LSB.register(manifest, setup)
  else {
    w.LSB_PLUGINS = w.LSB_PLUGINS || []
    w.LSB_PLUGINS.push({ manifest, setup })
  }
})()
```

不要改 `plugins/skin.user.js`。不要把选择器字符串写进本插件（`listSel` 只复用 `api.sel.listItems`，回退串与已读置灰相同，属于调用约定不是第二份站点选择器）。

- [ ] **Step 4: Run test to verify it passes**

```
node --test --test-force-exit test/topic-marks.test.js
```

Expected: PASS。本任务不要跑 `test/suite.test.js`（氧产物还没重建，会缺模块）。

- [ ] **Step 5: Commit**

跳过，除非用户明确要求。若提交：

```
git add plugins/topic-marks.user.js test/topic-marks.test.js suite/order.js
git commit -m "feat: highlight live red-packet and card rows"
```

---

### Task 3: 机会监控开关

**Files:**
- Modify: `test/batch3.test.js`
- Modify: `plugins/forum-watch.user.js`（`@version` 与 `manifest.version` 都改 `1.0.2`）

**Interfaces:**
- Consumes: Task 1 的 `it.marks`；现有 `hits` 对象字段 `tid` `title` `forumId` `author` `ts`
- Produces: 配置 `watchRedPacket` / `watchVirtualCard`（switch，默认 `false`，标签分别为 `盯红包（列表标记为活着）` / `盯发卡（列表标记为活着）`）；命中增加 `reasons: string[]`；`kw` 为 `reasons.join(' · ')`；`probe()` 增加这两个开关的布尔值

- [ ] **Step 1: Write the failing test**

在 `test/batch3.test.js` 现有两个机会监控用例后面追加（不要改旧用例的 `FORUM_HTML` / `WATCH_PRELOAD`）：

```js
const FORUM_HTML_MARKS =
  '<html><body><ul class="post-list">' +
  '<li class="post-item"><a class="post-title" href="/topic/8001">发红包啦</a>' +
  '<span class="red-packet-title-status">红包帖</span>' +
  '<span data-performance-time="1787216186"></span></li>' +
  '<li class="post-item"><a class="post-title" href="/topic/8002">发卡结束</a>' +
  '<span class="virtual-card-title-status">结束</span>' +
  '<span data-performance-time="1787216000"></span></li>' +
  '<li class="post-item"><a class="post-title" href="/topic/8003">普通帖</a>' +
  '<span data-performance-time="1787215900"></span></li>' +
  '</ul></body></html>'

test('机会监控：开关关时红包标记不入箱', async () => {
  const calls = []
  const { w, until } = makeSite({
    'lsb_base:forum-watch:__config': {
      forums: '5',
      keywords: 'k8s',
      intervalMin: 5,
      jitterMs: 0,
      notifyDesktop: false,
      watchRedPacket: false,
      watchVirtualCard: false,
    },
  })
  w.fetch = async (url) => {
    calls.push(String(url))
    return { status: 200, ok: true, url: String(url), text: async () => FORUM_HTML_MARKS }
  }
  await loadBase(w, PLUG('forum-watch.user.js'))
  const dbg = await w.LSB.bus.request('forum-watch:debug')
  await until(() => dbg.role() === 'leader', 3000)
  await new Promise((r) => setTimeout(r, 200))
  assert.equal(dbg.hits().length, 0, '标题没有 k8s，标记开关关着')
  assert.ok(calls.some((u) => u.includes('/forum/5')))
})

test('机会监控：只开盯红包则 live 入箱，ended 不入；水位去重', async () => {
  const { w, until } = makeSite({
    'lsb_base:forum-watch:__config': {
      forums: '5',
      keywords: '',
      intervalMin: 5,
      jitterMs: 0,
      notifyDesktop: false,
      watchRedPacket: true,
      watchVirtualCard: false,
    },
  })
  w.fetch = async (url) => ({
    status: 200,
    ok: true,
    url: String(url),
    text: async () => FORUM_HTML_MARKS,
  })
  await loadBase(w, PLUG('forum-watch.user.js'))
  const dbg = await w.LSB.bus.request('forum-watch:debug')
  assert.equal(dbg.probe().watchRedPacket, true)
  assert.equal(dbg.probe().watchVirtualCard, false)
  await until(() => dbg.role() === 'leader', 3000)
  await until(() => dbg.hits().length === 1, 2000)
  assert.equal(dbg.hits()[0].tid, 8001)
  assert.equal(dbg.hits()[0].kw, '红包')
  assert.deepEqual(dbg.hits()[0].reasons, ['红包'])
  await dbg.tick()
  assert.equal(dbg.hits().length, 1)
})
```

- [ ] **Step 2: Run test to verify it fails**

```
node --test --test-force-exit test/batch3.test.js
```

Expected: FAIL。旧用例仍过；新用例里 `probe().watchRedPacket` 为 `undefined`，或关键词为空时整轮不巡检、`hits` 一直空。不得在本步改插件。

- [ ] **Step 3: Write minimal implementation**

`plugins/forum-watch.user.js`：

1. 头部 `@version` 与 `manifest.version` 改为 `1.0.2`。
2. `config` 增加（默认关）：

```js
      watchRedPacket: { type: 'switch', label: '盯红包（列表标记为活着）', default: false },
      watchVirtualCard: { type: 'switch', label: '盯发卡（列表标记为活着）', default: false },
```

3. `cycle` 里把 `if (!kws.length) return` 换成：

```js
          const watchingMarks = !!(cfg.watchRedPacket || cfg.watchVirtualCard)
          if (!kws.length && !watchingMarks) return
```

4. 把标题命中那段换成（必须用 `it.marks?.`，旧氢不报错）：

```js
              const reasons = []
              const kw = kws.find((k) => String(it.title).toLowerCase().includes(k))
              if (kw) reasons.push(kw)
              if (cfg.watchRedPacket && it.marks?.redPacket === 'live') reasons.push('红包')
              if (cfg.watchVirtualCard && it.marks?.virtualCard === 'live') reasons.push('发卡')
              if (reasons.length) {
                fresh.push({
                  tid: it.id,
                  title: it.title,
                  forumId: fid,
                  reasons,
                  kw: reasons.join(' · '),
                  author: it.authorName,
                  ts: Date.now(),
                })
              }
```

不要再写一份「只 push kw」的旧分支。水位 `seen` / `per[it.id]` 逻辑不要改。

5. `probe` 改为：

```js
      probe: () => ({
        forums: forumIds(),
        kws: keywords(),
        watchRedPacket: !!cfg.watchRedPacket,
        watchVirtualCard: !!cfg.watchVirtualCard,
        ...probeData,
      }),
```

巡检 URL 仍是 `api.routes.forum(fid, { sort: 'post' })`。不要 `api.net.doc` 帖页，不要 POST。

- [ ] **Step 4: Run test to verify it passes**

```
node --test --test-force-exit test/batch3.test.js
```

Expected: PASS（旧关键词用例 + 两个新用例）。

- [ ] **Step 5: Commit**

跳过，除非用户明确要求。若提交：

```
git add plugins/forum-watch.user.js test/batch3.test.js
git commit -m "feat: watch live red-packet and card marks"
```

---

### Task 4: 套件登记、LTS 禁入、版本与文档

**Files:**
- Modify: `test/suite.test.js` 约 249 行、`test/lts.test.js` 约 75 行（LTS 不得出现的 id 加上 `'topic-marks'`）
- Modify: `build-suite.mjs` `SUITE_VERSION = '1.0.111'`
- Modify: `suite/suite-center.js` `version: '1.0.111'`
- Modify: `README.md` 插件表
- Modify: `docs/CONVENTIONS.md` §2.2、`docs/功能征集-rc-ga.md`、`docs/已知问题-rc.md` 标题、`docs/测试招募-氢氧-beta.md` 版本表

**Interfaces:**
- Consumes: Task 2 的 `ORDER` 已含 `topic-marks`；Task 3 的机会监控 `1.0.2`
- Produces: 氧 / LTS 产物 `1.0.111`；LTS 运行时无 `topic-marks`；文档版本钉为氢 `0.1.40` / 氧与 LTS `1.0.111`

- [ ] **Step 1: Write the failing test**

`test/suite.test.js` 与 `test/lts.test.js` 里那两处「LTS 不得出现」数组都改成：

```js
  for (const id of ['local-bridge', 'title-quotes', 'forum-watch', 'ai-summary', 'my-archive', 'hot-floor-badge', 'perf-probe', 'hover-profile', 'topic-marks']) {
```

`test/lts.test.js` 的 `keep` 数组不要加 `topic-marks`。

README 在 `read-mark` 行后插入：

```
| `topic-marks` | **红包发卡**：列表左侧色条标出还活着的红包 / 发卡；结束态不画；关掉模块即关高亮 | read/ui/events |
```

`forum-watch` 行改成：

```
| `forum-watch` | **机会监控**：监听指定版块新帖标题命中关键词即提醒；也可按列表上还活着的红包 / 发卡盯（默认关）；复用哨兵选主；「机会箱」面板 | read/storage/ui/events |
```

`docs/功能征集-rc-ga.md`「已经有的」在「机会监控」下加一行 `- 红包发卡`。版本行改成：氢 **0.1.40**、氧 **1.0.111**、LTS **1.0.111**。

`docs/CONVENTIONS.md` §2.2：`氢 **0.1.40** / 氧 **1.0.111** / LTS **1.0.111**`。

`docs/已知问题-rc.md` 标题：`# 氢 0.1.40 / 氧 1.0.111 / LTS 1.0.111 · 已知问题与本轮不修`

`docs/测试招募-氢氧-beta.md` 表：氢 **0.1.40**、氧 **1.0.111**、LTS **1.0.111**。

- [ ] **Step 2: Run test to verify it fails**

```
node --test --test-force-exit test/suite.test.js test/lts.test.js
```

Expected: FAIL 或产物版本仍是 `1.0.110`。`build-suite.mjs` / `suite-center.js` 本步还没改号也可以先改测试，再在 Step 3 对齐号。

- [ ] **Step 3: Write minimal implementation**

```js
const SUITE_VERSION = '1.0.111'
```

```js
    version: '1.0.111',
```

然后：

```
npm run build
```

Expected: 氢 `v0.1.40`；氧 `v1.0.111`、模块数比改前多 1（现 `ORDER` 长度）；LTS `v1.0.111`。LTS banner 不得出现 `LSB·红包发卡`。

- [ ] **Step 4: Run test to verify it passes**

```
npm test
```

Expected: 全绿（当前基线 417，本计划约 +6：site 1、topic-marks 3、batch3 2；以实际打印为准，失败数为 0）。抽查：

- `dist/linuxsb-lts.user.js` 无 `id: 'topic-marks'`
- `dist/linuxsb-suite.user.js` 有 `id: 'topic-marks'` 且 `LSB·机会监控 v1.0.2`
- 产物与测试过程不得出现 `/gacha_market_buy` 或 `tab=notifications` 的新请求

- [ ] **Step 5: Commit**

跳过，除非用户明确要求。若提交：把本任务改过的文档、构建配置、测试禁名单和三个 `dist/` 一并纳入。不要发 GitHub Release，不要改 Greasy Fork。

---

## Self-review

1. **Spec coverage:** `marks` → Task 1；色条 / debug / Tab / dispose / `ORDER` → Task 2；开关 / `reasons` / `kw` / 空关键词仍巡检 / 水位 → Task 3；版本、README、征集、LTS 禁入 → Task 4。非目标（淘帖、筛选、进帖、POST、软跳、实时流、LTS 加模块）无对应实现步。
2. **Placeholders:** 无 TBD。插件与测试是完整源码，不是「按 Task 1 类似写」。
3. **Types:** `marks.redPacket` / `virtualCard` 取值 `'live'|'ended'|null`；命中 `reasons` 为字符串数组，`kw === reasons.join(' · ')`；debug 三个函数名与 spec 一致。
