# Home Stash Refresh Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 存档还回时非主标签也立刻巡检一轮；离开首页后每 30s 后台刷新 LRU 里的 `/`，点回来不再干等整页 GET 才看到较新的首页。

**Architecture:** 实时流 `spa:view-restored` 去掉 `shouldPoll()` 门闩，在途巡检结束后再 `cycle()` 一次。皮肤在 `spaViewKey !== '/' && viewCache.has('/')` 时用 30s 定时器 `net.raw('/')` 替换存档片段，永不 `commitRoute` 到当前 outlet。

**Tech Stack:** 油猴插件 + jsdom `node:test`；请求走 `api.net.raw` / `api.net.doc`。

## Global Constraints

- 氢不改（`0.1.33`）；氧 `1.0.99` → `1.0.100`
- 插件 UTF-8 无 BOM、LF
- 无新开关、不改选主协议、不后台换掉屏幕上的主栏
- 不 commit，除非用户要求

---

### Task 1: 非主标签还回也 cycle

**Files:**
- Modify: `plugins/live-feed.user.js` `spa:view-restored` 监听
- Test: `test/live-feed.test.js`

**Interfaces:**
- Consumes: `init()`、`cycle()`、`inflight`、`election.demote`
- Produces: 还回后无条件一轮 `cycle()`；`finally` 仍只在 `shouldPoll()` 时 `scheduleNext()`

- [ ] **Step 1: Write the failing test**

在 `test/live-feed.test.js` 现有「存档还回首页后立刻巡检」之后追加：

```javascript
test('实时流：非主标签还回存档也立刻巡检', async () => {
  const { w, tick, until } = makeSite(homeHtml, '/', {
    'lsb_base:live-feed:__config': { jitterMs: 0, pollSec: 30, autoInsert: false },
  })
  w.scrollTo = () => {}
  const calls = feedStub(w, () => homeHtml)
  await loadBase(w, PLUG('skin.user.js'), PLUG('live-feed.user.js'))
  const feed = await w.LSB.bus.request('live-feed:debug')
  await until(() => feed.role() === 'leader', 3000)
  await tick(80)
  const toForum = w.document.createElement('a')
  toForum.href = 'https://linux.sb/forum/4'
  w.document.querySelector('main.wrap').append(toForum)
  toForum.click()
  await tick(120)
  feed.demote()
  assert.equal(feed.role(), 'follower')
  const n = calls.length
  w.document.querySelector('.lsb-shell-brand')?.click()
  await tick(120)
  assert.equal(w.location.pathname, '/')
  assert.ok(calls.length > n, 'follower 还回存档也要立刻 cycle，不能因为 shouldPoll 为假而跳过')
})
```

- [ ] **Step 2: Run test to verify it fails**

Run: `node --test test/live-feed.test.js`

Expected: FAIL，还回后 `calls.length` 不变。

- [ ] **Step 3: Write minimal implementation**

`plugins/live-feed.user.js`：

```javascript
api.on('spa:view-restored', () => {
  init()
  void (async () => {
    const wait = inflight
    if (wait) await wait
    void cycle()
  })()
})
```

- [ ] **Step 4: Run test to verify it passes**

Run: `node --test test/live-feed.test.js`

Expected: PASS（含「route:changed 不立刻 GET」）。

---

### Task 2: 离开首页后后台刷新 `/` 存档

**Files:**
- Modify: `plugins/skin.user.js`（`seedHomeView` 旁、`navigateSpa` 成功后、`teardownShell`）
- Test: `test/skin.test.js`

**Interfaces:**
- Consumes: `viewCache`、`spaViewKey`、`rememberView`、`api.net.raw('/', { queue: false, timeout: 15000, retry: 0 })`
- Produces: `HOME_STASH_REFRESH_MS = 30000`；隐藏跳过、可见补刷；晚到的 GET 不得改当前 outlet

- [ ] **Step 1: Write the failing tests**

在 `test/skin.test.js` 存档用例后追加。`holdLongTimers(w)` 必须在 `loadBase` 之前包住 `setTimeout`，只拦住 `delay >= 25000` 的回调（避免真等 30s）。

```javascript
function holdLongTimers(w) {
  const nativeSet = w.setTimeout.bind(w)
  const nativeClear = w.clearTimeout.bind(w)
  const held = new Map()
  let seq = 900000
  w.setTimeout = (fn, ms, ...args) => {
    const delay = Number(ms) || 0
    if (delay >= 25000) {
      const id = ++seq
      held.set(id, { fn, args })
      return id
    }
    return nativeSet(fn, ms, ...args)
  }
  w.clearTimeout = (id) => {
    if (held.has(id)) {
      held.delete(id)
      return
    }
    return nativeClear(id)
  }
  return {
    async flush() {
      const jobs = [...held.values()]
      held.clear()
      for (const { fn, args } of jobs) fn(...args)
      await new Promise((r) => nativeSet(r, 0))
    },
  }
}

test('壳内跳转：离开首页后后台刷新存档，回来用新主栏且不再 GET', async () => {
  const { w, tick } = makeHome()
  const timers = holdLongTimers(w)
  const refreshed = homeHtml.replace(
    '<ul class="post-list">',
    '<ul class="post-list"><li class="post-item"><div class="post-body"><a class="post-title" href="/topic/88001">存档后台刷新的帖</a></div></li>',
  )
  let homeBody = homeHtml
  const calls = stubHtmlFetch(w, (url) => (/\/forum\/4/.test(String(url)) ? homeHtml : homeBody))
  await loadBase(w, PLUG('skin.user.js'))
  const toForum = w.document.createElement('a')
  toForum.href = 'https://linux.sb/forum/4'
  w.document.querySelector('main.wrap').append(toForum)
  toForum.click()
  await tick(80)
  assert.equal(w.location.pathname, '/forum/4')
  const n = homeGets(calls).length
  homeBody = refreshed
  await timers.flush()
  await tick(80)
  assert.ok(homeGets(calls).length > n, '人在版块时要后台拉一次 / 刷新存档')
  const afterRefresh = homeGets(calls).length
  w.document.querySelector('.lsb-shell-brand')?.click()
  await tick(80)
  assert.equal(w.location.pathname, '/')
  assert.equal(homeGets(calls).length, afterRefresh, '点站名用已刷新的存档，不得再拉 /')
  assert.ok(w.document.body.textContent.includes('存档后台刷新的帖'))
})
```

现有「版块再回首页不 GET，列表行是同一节点」继续用 `tick(80)`、不 flush 长定时器，证明间隔未到不刷。

- [ ] **Step 2: Run test to verify it fails**

Run: `node --test test/skin.test.js`

Expected: FAIL，flush 后没有多一次 `/` GET。

- [ ] **Step 3: Write minimal implementation**

在 `plugins/skin.user.js`：

- 常量 `HOME_STASH_REFRESH_MS = 30000`
- `parseOutletFrag(html)`：与 `seedHomeView` 相同的剥 script / 藏侧栏 / `importNode`
- `wantsHomeStashRefresh()`：`spaBound && cfg.shell && spaViewKey !== '/' && viewCache.has('/')`
- `scheduleHomeStashRefresh()`：不需要时清定时器并 `homeStashGen++`；已有定时器或在途则不动；否则 30s 后 `refreshStashedHome`
- `refreshStashedHome()`：`document.hidden` 则 `homeStashPending = true` 并 return；否则 `net.raw('/')`，成功则 `rememberView('/', { live: false, scrollY: 0, ... })`；`finally` 里若 gen 仍有效再 `scheduleHomeStashRefresh`
- `visibilitychange`：可见且 pending 则刷
- `seedHomeView` 写入后、`navigateSpa` 两条成功路径设完 `spaViewKey` 后调用 `scheduleHomeStashRefresh`
- `teardownShell` / `unbindSpa`：清定时器、bump gen、卸监听

- [ ] **Step 4: Run test to verify it passes**

Run: `node --test test/skin.test.js`

Expected: PASS。

---

### Task 3: 版本与全量测试

**Files:**
- Modify: `plugins/skin.user.js` `@version` 与 `manifest.version` → `1.1.47`
- Modify: `plugins/live-feed.user.js` → `1.2.16`
- Modify: `build-suite.mjs` `SUITE_VERSION = '1.0.100'`
- Modify: `suite/suite-center.js` `version: '1.0.100'`
- Modify: `docs/CONVENTIONS.md`、`docs/已知问题-rc.md`、`docs/测试招募-氢氧-beta.md`、`docs/功能征集-rc-ga.md` 氧 **1.0.100**

- [ ] **Step 1: Bump versions and rebuild**

Run: `node build-suite.mjs`

Expected: `v1.0.100`、19 模块。

- [ ] **Step 2: Full test suite**

Run: `node --test`

Expected: 全绿。
