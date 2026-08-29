# 氢壳主栏存档 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:executing-plans (inline; user said 做A). Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 同一次生命周期里点回已打开过的列表页立刻还回主栏，不再等 `spa.fetch`；实时流在还回后巡检一轮。

**Architecture:** 皮肤 LRU 5 份 `DocumentFragment`（挪节点）。`spaViewKey` 与地址栏分离。命中则搬回并 `spa:view-restored`；未命中仍 GET。非首页 setup 预取 `/`。氢不改。

**Tech Stack:** `plugins/skin.user.js`、`plugins/live-feed.user.js`、jsdom `node:test`。

## Global Constraints

- Spec：`docs/superpowers/specs/2026-08-28-spa-view-cache-design.md`
- 氢 `0.1.33` 不动；不改 `src/` / `build.mjs` / `package.json`
- 不改 `ORDER`；不软跳 `/topic/`；不把邀请中心/排行榜改成软跳
- `skin` `1.1.45` → `1.1.46`；`live-feed` `1.2.14` → `1.2.15`；氧 `1.0.98` → `1.0.99`（Task 4 才改号）
- 源文件 UTF-8 无 BOM、LF；Windows 上不要用 `&&`
- 用户未明确要求则不要 `git commit`

## Files

- Modify: `test/skin.test.js`
- Modify: `plugins/skin.user.js`
- Modify: `test/live-feed.test.js`
- Modify: `plugins/live-feed.user.js`
- Modify: `build-suite.mjs`、`suite/suite-center.js`、RC 文档（Task 4）
- Run: `node build-suite.mjs`

---

### Task 1: 回首页命中存档，不 GET `/`

**Files:**
- Modify: `test/skin.test.js`（文末追加）
- Modify: `plugins/skin.user.js`

**Interfaces:**
- Consumes: 现有 `navigateSpa` / `commitRoute` / `stubHtmlFetch` / `.lsb-shell-brand`
- Produces: `viewCacheKey`、`spaViewKey`、`stashView` / `takeView` / `applyView`；命中存档不调用 `api.net.raw`

- [ ] **Step 1: Write the failing tests**

`test/skin.test.js` 文末追加：

```js
function homeGets(calls) {
  return calls.filter((u) => {
    try {
      const x = new URL(String(u), 'https://linux.sb')
      const path = x.pathname.replace(/\/{2,}/g, '/') || '/'
      if (path !== '/' && path !== '/index.php') return false
      return !x.searchParams.get('p')
    } catch {
      return false
    }
  })
}

test('壳内跳转：版块再回首页不 GET，列表行是同一节点', async () => {
  const { w, tick } = makeHome()
  const calls = stubHtmlFetch(w, homeHtml)
  await loadBase(w, PLUG('skin.user.js'))
  const row = w.document.querySelector('ul.post-list > li.post-item')
  assert.ok(row)
  row.setAttribute('data-lsb-stash', '1')
  const toForum = w.document.createElement('a')
  toForum.href = 'https://linux.sb/forum/4'
  w.document.querySelector('main.wrap').append(toForum)
  toForum.click()
  await tick(80)
  assert.equal(w.location.pathname, '/forum/4')
  const n = homeGets(calls).length
  w.document.querySelector('.lsb-shell-brand')?.click()
  await tick(80)
  assert.equal(w.location.pathname, '/')
  assert.equal(homeGets(calls).length, n, '回首页不得再拉 /')
  const same = w.document.querySelector('[data-lsb-stash="1"]')
  assert.equal(same, row, '必须是挪回来的原节点，不能 importNode 一份新的')
})

test('壳内跳转：后退回首页也不 GET /', async () => {
  const { w, tick } = makeHome()
  const calls = stubHtmlFetch(w, homeHtml)
  await loadBase(w, PLUG('skin.user.js'))
  const toForum = w.document.createElement('a')
  toForum.href = 'https://linux.sb/forum/4'
  w.document.querySelector('main.wrap').append(toForum)
  toForum.click()
  await tick(80)
  const n = homeGets(calls).length
  w.history.back()
  await tick(80)
  assert.equal(w.location.pathname, '/')
  assert.equal(homeGets(calls).length, n)
})
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `node --test --test-force-exit --test-name-pattern "不 GET" test/skin.test.js`

Expected: FAIL（回首页仍 GET `/`，标记节点不是同一引用）。

- [ ] **Step 3: Write minimal implementation**

在 `setup` 里、`spaIgnorePop` 附近增加：

```js
    const VIEW_CACHE_MAX = 5
    const viewCache = new Map()
    let spaViewKey = viewCacheKey(location.href)

    function viewCacheKey(href) {
      const u = new URL(href, location.href)
      let path = u.pathname.replace(/\/{2,}/g, '/') || '/'
      if (path === '/index.php') path = '/'
      return path + u.search
    }

    function rememberView(key, entry) {
      if (viewCache.has(key)) viewCache.delete(key)
      viewCache.set(key, entry)
      while (viewCache.size > VIEW_CACHE_MAX) {
        const oldest = viewCache.keys().next().value
        viewCache.delete(oldest)
      }
    }

    function snapshotOutletAttrs(el) {
      return [...el.attributes].map((a) => [a.name, a.value])
    }

    function stashView(key) {
      if (!key) return
      try {
        if (!isSpaUrl(new URL(key, location.origin).href)) return
      } catch {
        return
      }
      const outlet = findRouteOutlet()
      if (!outlet?.firstChild) return
      const frag = document.createDocumentFragment()
      while (outlet.firstChild) frag.appendChild(outlet.firstChild)
      rememberView(key, {
        frag,
        title: document.title,
        scrollY: window.scrollY || 0,
        live: true,
        attrs: snapshotOutletAttrs(outlet),
      })
    }

    function takeView(key) {
      const entry = viewCache.get(key)
      if (!entry) return null
      viewCache.delete(key)
      return entry
    }

    function applyView(entry, outlet) {
      if (entry.attrs) {
        for (const name of [...outlet.getAttributeNames()]) outlet.removeAttribute(name)
        for (const [name, value] of entry.attrs) {
          if (name.startsWith('data-lsb-')) continue
          outlet.setAttribute(name, value)
        }
      }
      outlet.append(entry.frag)
      if (entry.title) document.title = entry.title
      outlet.removeAttribute('aria-busy')
      markNative(true)
    }
```

`isSpaUrl` 必须定义在这些函数之前，或把存档函数放在 `isSpaUrl` 之后。

`navigateSpa` 在 `same && !force` 判断之后、`++spaSerial` 之前读取 `fromKey = spaViewKey`、`destKey = viewCacheKey(target.href)`。若 `takeView(destKey)` 有值：`++spaSerial`、进度条、`stashView(fromKey)`、`applyHistory`、`applyView`、`spaViewKey = destKey`、`fillShell`、点击则 `scrollTo(0,0)`、`historyMode === 'none'` 则 `scrollTo(0, entry.scrollY)`、`afterPaint` 里 `notifyRoute` + `syncShellRoute` + `api.emitGlobal('spa:view-restored', { href: destKey, live: entry.live })`。不要 GET。

未命中：现有 fetch 路径，在 `applyHistory` 之前 `stashView(fromKey)`，成功后 `spaViewKey = viewCacheKey(finalUrl.href)`。`serial` 不匹配时不要 stash。

`teardownShell` 里 `viewCache.clear()`。

`hideHomePagination` 里 `pagination.setAttribute('data-lsb-shell-inf', '1')`。`syncHomeInfiniteScroll` 里「已藏分页则 return」改为：没有 `data-lsb-shell-inf` 才 return。

- [ ] **Step 4: Run tests to verify they pass**

Run: `node --test --test-force-exit --test-name-pattern "不 GET|从版块回首页后无限滚动|站点自己的无限滚动" test/skin.test.js`

Expected: 全部 PASS。

---

### Task 2: 非首页预取 `/`

**Files:**
- Modify: `test/skin.test.js`
- Modify: `plugins/skin.user.js`

**Interfaces:**
- Consumes: Task 1 LRU；`api.net.raw('/', { queue: false, retry: 0 })`
- Produces: `seedHomeView()`；`live: false` 种子

- [ ] **Step 1: Write the failing test**

```js
test('壳内跳转：落在邀请中心时预取首页，点站名不再 GET', async () => {
  const { w, tick } = makeDom(homeHtml, 'https://linux.sb/invite_center')
  const calls = stubHtmlFetch(w, homeHtml)
  await loadBase(w, PLUG('skin.user.js'))
  await tick(80)
  assert.ok(homeGets(calls).length >= 1, 'setup 后要预取 /')
  const n = homeGets(calls).length
  w.document.querySelector('.lsb-shell-brand')?.click()
  await tick(80)
  assert.equal(w.location.pathname, '/')
  assert.equal(homeGets(calls).length, n, '点回首页用种子，不得再拉 /')
})
```

`stubHtmlFetch` 必须在 `loadBase` 之前。

- [ ] **Step 2: Run test to verify it fails**

Run: `node --test --test-force-exit --test-name-pattern "预取首页" test/skin.test.js`

Expected: FAIL。

- [ ] **Step 3: Write minimal implementation**

`bindSpa` 成功后（或 `refreshShell` 末尾，只调用一次）`seedHomeView()`：

```js
    function seedHomeView() {
      const here = viewCacheKey(location.href)
      if (here === '/' || viewCache.has('/')) return
      void (async () => {
        try {
          const res = await api.net.raw('/', { queue: false, timeout: 15000, retry: 0 })
          if (!res.ok || viewCache.has('/') || spaViewKey === '/') return
          const pageDoc = new DOMParser().parseFromString(res.text, 'text/html')
          const remote = findRouteOutlet(pageDoc)
          if (!remote) return
          remote.querySelectorAll('script').forEach((node) => node.remove())
          hideNativeSidebars(remote)
          const frag = document.createDocumentFragment()
          for (const node of [...remote.childNodes]) frag.appendChild(document.importNode(node, true))
          if (viewCache.has('/') || spaViewKey === '/') return
          rememberView('/', {
            frag,
            title: pageDoc.title || '',
            scrollY: 0,
            live: false,
            attrs: snapshotOutletAttrs(remote),
          })
        } catch {
          /* 预取失败则点首页仍 GET */
        }
      })()
    }
```

`bindSpa` 里若已经 `spaBound` 提前 return，不要漏掉首次的 `seedHomeView`。在 `bindSpa` 设完 `spaBound = true` 之后调用。

- [ ] **Step 4: Run tests to verify they pass**

Run: `node --test --test-force-exit --test-name-pattern "预取首页|不 GET|从版块回首页后无限滚动" test/skin.test.js`

Expected: PASS。

---

### Task 3: 实时流还回后立刻 cycle

**Files:**
- Modify: `test/live-feed.test.js`
- Modify: `plugins/live-feed.user.js`

**Interfaces:**
- Consumes: `spa:view-restored`；现有 `cycle` / `init` / `shouldPoll`
- Produces: 监听后 `init()` + 有条件 `cycle()`

- [ ] **Step 1: Write the failing test**

`test/live-feed.test.js` 文末追加（需 `stubHtmlFetch` 行为：用本文件已有 `feedStub`，并对皮肤软跳把 `w.fetch` 接到同一计数器）。若 `feedStub` 已替换 `fetch`，先 `loadBase(perf-probe 可选, skin, live-feed)`：

```js
test('实时流：存档还回首页后立刻巡检', async () => {
  const { w, tick, until } = makeSite(homeHtml, '/', {
    'lsb_base:live-feed:__config': { jitterMs: 0, pollSec: 30, autoInsert: false },
  })
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
  const n = calls.length
  w.document.querySelector('.lsb-shell-brand')?.click()
  await tick(120)
  assert.equal(w.location.pathname, '/')
  assert.ok(calls.length > n, '还回存档后要立刻 cycle 拉一页，不能干等到下一轮定时器')
})
```

- [ ] **Step 2: Run test to verify it fails**

Run: `node --test --test-force-exit --test-name-pattern "存档还回首页后立刻巡检" test/live-feed.test.js`

Expected: FAIL（`route:changed` 只 init，不 cycle）。

- [ ] **Step 3: Write minimal implementation**

在 `route:changed` 监听旁：

```js
    api.on('spa:view-restored', () => {
      init()
      if (shouldPoll()) void cycle()
    })
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `node --test --test-force-exit test/live-feed.test.js`

Expected: 全部 PASS。

---

### Task 4: 版本、文档、产物

**Files:**
- Modify: `plugins/skin.user.js` `@version` 与 `manifest.version` → `1.1.46`
- Modify: `plugins/live-feed.user.js` → `1.2.15`
- Modify: `build-suite.mjs` `SUITE_VERSION = '1.0.99'`
- Modify: `suite/suite-center.js` `version: '1.0.99'`
- Modify: `docs/CONVENTIONS.md`、`docs/已知问题-rc.md`、`docs/测试招募-氢氧-beta.md`、`docs/功能征集-rc-ga.md` 氧 **1.0.99**
- Run: `node build-suite.mjs`

- [ ] **Step 1: Bump versions**（两处相同；不要改氢）

- [ ] **Step 2: Build oxygen**

Run: `node build-suite.mjs`

Expected: `v1.0.99`、19 模块。

- [ ] **Step 3: Full test suite**

Run: `node --test --test-force-exit --test-concurrency=4`

Expected: 0 fail。
