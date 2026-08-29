# 氢壳软跳点击 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 点版块 / 回首页软跳后，主栏换完就能用：不再第二次 `fillShell`，实时流不再立刻 GET 同一页。

**Architecture:** 软跳成功后记下 `spaSerial`，`route:changed` 触发的 `scheduleRefresh` 若 serial 相同则跳过。`notifyRoute` 挪到下一帧，让列表先画。实时流 `route:changed` 只 `init()`，巡检留给选主和定时器。`collectTools` 缓存到插件启停 / 皮肤配置变更。

**Tech Stack:** `plugins/skin.user.js`、`plugins/live-feed.user.js`、jsdom `node:test`。氢核心不改。

## Global Constraints

- Spec：`docs/superpowers/specs/2026-08-28-shell-spa-click-design.md`
- 软跳仍只覆盖现有 `isSpaUrl`；`/topic/` 仍整页跳
- 不改时间轴、毛玻璃、`#lsb-shell` 铺满、不取消软跳、不 GET 通知页、不改 `ORDER`、不改氢
- `skin` `1.1.43` → `1.1.44`；`live-feed` `1.2.12` → `1.2.13`；氧 `1.0.96` → `1.0.97`（Task 4 才改号）
- 源文件 UTF-8 无 BOM、LF；Windows 上不要用 `&&`（PowerShell 用分号或两条命令）
- 用户未明确要求则不要 `git commit`

## Files

- Modify: `plugins/live-feed.user.js`（`route:changed`）
- Modify: `test/live-feed.test.js`
- Modify: `plugins/skin.user.js`（`navigateSpa` 顺序、`scheduleRefresh` 跳过、`collectTools` 缓存）
- Modify: `test/skin.test.js`
- Modify: `build-suite.mjs`、`suite/suite-center.js`（Task 4）
- Modify: `docs/CONVENTIONS.md`、`docs/已知问题-rc.md`、`docs/测试招募-氢氧-beta.md`、`docs/功能征集-rc-ga.md`（Task 4）
- Run: `node build-suite.mjs`（氧产物；不要为这个功能改氢 `build.mjs`）

---

### Task 1: 实时流换页只建基线

**Files:**
- Modify: `test/live-feed.test.js`（文末追加）
- Modify: `plugins/live-feed.user.js`（`route:changed` 监听，约 L704–707）

**Interfaces:**
- Consumes: 现有 `init()`、`shouldPoll()`、`scheduleNext()`、`cycle()` / debug `pollOnce`
- Produces: `route:changed` 只 `init()`；若 `shouldPoll()` 且 `timer == null` 则 `scheduleNext()`；不调用 `cycle()`

- [ ] **Step 1: Write the failing test**

在 `test/live-feed.test.js` 末尾追加（UTF-8 无 BOM、LF）：

```js
test('实时流：route:changed 只重建基线，不立刻再 GET', async () => {
  const { w, tick, until } = makeSite(homeHtml, '/', {
    'lsb_base:live-feed:__config': { jitterMs: 0, pollSec: 30, autoInsert: false },
  })
  const calls = feedStub(w, () => homeHtml)
  await loadBase(w, PLUG('live-feed.user.js'))
  const dbg = await w.LSB.bus.request('live-feed:debug')
  await until(() => dbg.role() === 'leader', 3000)
  await tick(80)
  const n = calls.length
  assert.ok(n >= 1, '选主后首轮巡检至少 GET 一次')
  w.LSB.bus.emit('route:changed', { href: w.location.href, page: { ...w.LSB.__core.snapshot.page } }, { source: 'core' })
  await tick(80)
  assert.equal(calls.length, n, '换页广播后不能马上再拉当前列表')
  assert.equal(dbg.mode(), 'list')
  await dbg.pollOnce()
  assert.ok(calls.length > n, '手动 tick / 定时器仍要能巡检')
})
```

- [ ] **Step 2: Run test to verify it fails**

Run: `node --test --test-force-exit --test-name-pattern "route:changed 只重建基线" test/live-feed.test.js`

Expected: FAIL，`calls.length` 在 `emit` 后变大（旧实现会 `cycle()`）。

- [ ] **Step 3: Write minimal implementation**

把 `plugins/live-feed.user.js` 里：

```js
    api.on('route:changed', () => {
      init()
      if (shouldPoll()) cycle()
    })
```

改成：

```js
    api.on('route:changed', () => {
      init()
      if (shouldPoll() && !timer) scheduleNext()
    })
```

不要改 `election.onPromote` 的 `cycle()`，也不要改 `scheduleNext` 里的定时 `cycle()`。

- [ ] **Step 4: Run test to verify it passes**

Run: `node --test --test-force-exit test/live-feed.test.js`

Expected: 全部 PASS（含旧用例）。若 `shouldPoll` 在 `election` 声明前被引用：它是函数，调用发生在 setup 后，保持现有声明顺序即可。

---

### Task 2: 软跳只刷一次壳，先画再广播

**Files:**
- Modify: `test/skin.test.js`（文末追加）
- Modify: `plugins/skin.user.js`（`spaFilledSerial`、`scheduleRefresh`、`afterPaint`、`navigateSpa`、工具区缓存）

**Interfaces:**
- Consumes: 现有 `spaSerial`、`fillShell`、`notifyRoute`、`scheduleRefresh`、`collectTools`
- Produces: `spaFilledSerial`；`scheduleRefresh({ fromRoute })`；`afterPaint(fn)`；`invalidateTools()` + `toolsCache`

- [ ] **Step 1: Write the failing tests**

`test/skin.test.js` 已有 `stubHtmlFetch`（约 L955）。在文末追加：

```js
test('壳内跳转：软跳后超过 50ms 仍是同一颗壳，不因 route:changed 再拆', async () => {
  const { w, tick } = makeHome()
  stubHtmlFetch(w, (url) => (/\/forum\//.test(String(url)) ? homeHtml : homeHtml))
  await loadBase(w, PLUG('skin.user.js'))
  const shellNode = w.document.getElementById('lsb-shell')
  const me = w.document.querySelector('[data-lsb-shell-me] .sidebar-card.user-card')
  const link = w.document.createElement('a')
  link.href = 'https://linux.sb/forum/4'
  w.document.querySelector('main.wrap').append(link)
  link.click()
  await tick(120)
  assert.equal(w.location.pathname, '/forum/4')
  assert.equal(w.document.getElementById('lsb-shell'), shellNode)
  assert.equal(w.document.querySelector('[data-lsb-shell-me] .sidebar-card.user-card'), me)
})

test('壳内跳转：皮肤+实时流时版块 URL 只 GET 一次', async () => {
  const { w, tick, until } = makeHome({
    'lsb_base:live-feed:__config': { jitterMs: 0, pollSec: 30, autoInsert: false },
  })
  const calls = stubHtmlFetch(w, (url) => {
    const href = String(url)
    if (/\/forum\/4/.test(href)) return homeHtml
    return homeHtml
  })
  await loadBase(w, PLUG('skin.user.js'), PLUG('live-feed.user.js'))
  const dbg = await w.LSB.bus.request('live-feed:debug')
  await until(() => dbg.role() === 'leader', 3000)
  await tick(80)
  const before = calls.filter((u) => /\/forum\/4/.test(u)).length
  const link = w.document.createElement('a')
  link.href = 'https://linux.sb/forum/4'
  w.document.querySelector('main.wrap').append(link)
  link.click()
  await tick(120)
  assert.equal(w.location.pathname, '/forum/4')
  const forumGets = calls.filter((u) => /\/forum\/4/.test(u)).length
  assert.equal(forumGets, before + 1, `软跳后实时流不得再拉版块页，实际 ${forumGets} before=${before} ${JSON.stringify(calls)}`)
})
```

`makeHome` 目前只返回 `{ w, tick }`。第二则用例需要 `until`：在 `makeDom` 里补上与 `test/live-feed.test.js` 相同的 `until`，并从 `makeDom` 返回它（`makeSite` / `makeHome` / `makeUser` 跟着透传）。不要另造一套 `makeHome`。

`makeDom` 现为：

```js
function makeDom(html, url, preload = {}) {
  const dom = new JSDOM(html, { url, runScripts: 'outside-only' })
  const w = dom.window
  w.unsafeWindow = w
  w.requestAnimationFrame = (fn) => setTimeout(() => fn(Date.now()), 0)
  w.scrollTo = () => {}
  w.localStorage.setItem('lsb_base:__core:rate', JSON.stringify(10))
  for (const [k, v] of Object.entries(preload)) w.localStorage.setItem(k, JSON.stringify(v))
  const tick = (ms) => new Promise((r) => setTimeout(r, ms))
  return { w, tick }
}
```

改成同样逻辑并增加：

```js
  async function until(fn, ms = 2500, step = 20) {
    const end = Date.now() + ms
    for (;;) {
      let ok = false
      try {
        ok = fn()
      } catch {
        /* keep polling */
      }
      if (ok) return true
      if (Date.now() > end) return false
      await tick(step)
    }
  }
  return { w, tick, until }
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `node --test --test-force-exit --test-name-pattern "软跳后超过 50ms|版块 URL 只 GET 一次" test/skin.test.js`

Expected: 「只 GET 一次」FAIL（实时流会再请求 `/forum/4`）。「同一颗壳」在只改实时流、未改氢壳时可能已经 PASS——若 PASS 不要改断言；热路径仍要做跳过第二次 `refreshShell` 和 `afterPaint`。

- [ ] **Step 3: Write minimal implementation**

在 `plugins/skin.user.js` 的 `setup` 里，`spaSerial` 旁增加：

```js
    let spaFilledSerial = 0
    let toolsCache = null
```

`collectTools` 开头：若 `toolsCache` 有值则 `return toolsCache`；算完后 `toolsCache =` 结果再 return。

```js
    function invalidateTools() {
      toolsCache = null
    }
```

`afterPaint`：

```js
    function afterPaint(fn) {
      const raf = window.requestAnimationFrame
      if (typeof raf === 'function') raf(() => fn())
      else setTimeout(fn, 0)
    }
```

把 `scheduleRefresh` 改成：

```js
    function scheduleRefresh(fromRoute) {
      if (fromRoute && spaFilledSerial && spaFilledSerial === spaSerial) return
      window.clearTimeout(refreshTimer)
      refreshTimer = window.setTimeout(refreshShell, 50)
    }
```

监听改为：

```js
    api.on('config:changed:skin', () => {
      cfg = api.config()
      invalidateTools()
      applyAll()
      syncGmMenu()
    })
    api.on('route:changed', () => scheduleRefresh(true))
    api.on('plugin:activated', () => {
      invalidateTools()
      scheduleRefresh(false)
    })
    api.on('plugin:disabled', () => {
      invalidateTools()
      scheduleRefresh(false)
    })
```

`navigateSpa` 成功路径（`committed` 之后）改成与 spec 一致。用本次 `serial`，不要闭包错乱：

```js
        applyHistory(finalUrl, settings.historyMode)
        commitRoute(pageDoc, remoteOutlet)
        committed = true
        applyMarkers()
        fillShell()
        spaFilledSerial = serial
        window.clearTimeout(refreshTimer)
        refreshTimer = 0
        finishProgress(serial)
        try {
          window.scrollTo(0, 0)
        } catch {
          /* jsdom 没有视口 */
        }
        afterPaint(() => {
          if (serial !== spaSerial) return
          notifyRoute()
        })
        return true
```

不要在 `notifyRoute` 之前再 `fillShell`。`spaIgnorePop` 仍只包在 `notifyRoute` 内部。

迁入函数已有「宿主已有节点则 return」的保持不动，不要先 restore 再 adopt。

- [ ] **Step 4: Run tests to verify they pass**

Run: `node --test --test-force-exit test/skin.test.js`

Expected: 全部 PASS，含原有壳内跳转与本任务两则。

Run: `node --test --test-force-exit test/live-feed.test.js`

Expected: 仍全部 PASS。

---

### Task 3: 现有软跳回归（手工核对，不改产品）

**Files:**
- Test: `test/skin.test.js`（只跑，不改除非红）

**Interfaces:**
- Consumes: Task 2 的 `afterPaint`（jsdom 里 rAF 已是 `setTimeout(0)`，原 `tick(80)` 仍够等到 `notifyRoute`）
- Produces: 无新 API

- [ ] **Step 1: Run the existing SPA cases**

Run: `node --test --test-force-exit --test-name-pattern "壳内跳转" test/skin.test.js`

Expected: PASS。若「点版块」在 `tick(80)` 时 pathname 还没变：把该文件里软跳相关 `tick(80)` 改成 `tick(120)`（等 rAF + 假 popstate），不要加更长 sleep。

- [ ] **Step 2: Confirm topic still does not SPA**

`壳内跳转：点帖子不软跳` 仍要求 `calls.length === 0` 且 pathname 仍是 `/`。不要为了性能去软跳进帖。

---

### Task 4: 版本与氧产物

**Files:**
- Modify: `plugins/skin.user.js` 头部 `@version` 与 `manifest.version` → `1.1.44`
- Modify: `plugins/live-feed.user.js` 头部 `@version` 与 `manifest.version` → `1.2.13`
- Modify: `build-suite.mjs` `SUITE_VERSION = '1.0.97'`
- Modify: `suite/suite-center.js` `version: '1.0.97'`
- Modify: `docs/CONVENTIONS.md` §2.2 氧 **1.0.97**
- Modify: `docs/已知问题-rc.md` 标题氧 **1.0.97**
- Modify: `docs/测试招募-氢氧-beta.md` 表内氧 **1.0.97**
- Modify: `docs/功能征集-rc-ga.md` 两处氧 **1.0.97**
- Run: `node build-suite.mjs`

**Interfaces:**
- Consumes: Task 1–2 行为已落地
- Produces: 氧 dist `@version` 1.0.97；banner 含皮肤 1.1.44、实时流 1.2.13

- [ ] **Step 1: Bump versions**

两处版本号必须相同。不要改 `src/core.js` 的 `VERSION`、不要改 `package.json`、不要改 `ORDER`。

`docs/CONVENTIONS.md`：`氢 **0.1.33** / 氧 **1.0.96**` → 氧 **1.0.97**。  
`docs/已知问题-rc.md` 标题同步。  
`docs/测试招募-氢氧-beta.md` 表内氧 **1.0.97**。  
`docs/功能征集-rc-ga.md` 文内两处 1.0.96 改 1.0.97。

不要改招募帖里的 Greasy Fork URL。Release 链接若仍是 v1.0.96，这轮可以改成发布后再说，不要在本任务造 v1.0.97 tag。

- [ ] **Step 2: Build oxygen**

Run: `node build-suite.mjs`

Expected: 打印含 `v1.0.97`、18 模块。

- [ ] **Step 3: Full test suite**

Run: `npm test`

Expected: 全部 PASS（当前基线 376，本计划新增 3 则 → 379 pass / 0 fail）。若总数不同，以 0 fail 为准。

---

## Self-review

| Spec 条 | Task |
|---|---|
| 刷壳只一次（跳过 route 的 scheduleRefresh） | Task 2 `spaFilledSerial` |
| 先画再 `notifyRoute` | Task 2 `afterPaint` |
| 实时流 route 不 `cycle` | Task 1 |
| `collectTools` 缓存 | Task 2 `toolsCache` |
| 迁入短路径保持 | Task 2 明确不改 adopt |
| `/topic/` 不软跳 | Task 3 |
| 皮肤 1.1.44 / 实时流 1.2.13 / 氧 1.0.97 | Task 4 |
| 氢不改 | Task 4 禁止改 core VERSION |
