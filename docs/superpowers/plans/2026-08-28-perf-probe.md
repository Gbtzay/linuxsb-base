# 氧性能探针 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 氧里加「性能探针」：打开开关后，本机记下氢壳软跳各段、实时流 `cycle()`、时间轴慢帧的耗时，面板能看、能复制。

**Architecture:** 新模块 `perf-probe` 默认不记录。打开后注册门闩 RPC `perf-probe:record` 并监听 `perf:span`。皮肤与实时流在 `hasHandler('perf-probe:record')` 为真时才 `performance.now()` 并 `emitGlobal`。环形缓冲 200 条，不写 localStorage。氢不改。

**Tech Stack:** `plugins/perf-probe.user.js`、`plugins/skin.user.js`、`plugins/live-feed.user.js`、jsdom `node:test`。

## Global Constraints

- Spec：`docs/superpowers/specs/2026-08-28-perf-probe-design.md`
- 氢 `0.1.33` 不动；不改 `src/core.js` / `build.mjs` / `package.json`
- 本功能允许改 `ORDER`（用户明确要氧新模块）
- `perf-probe` `1.0.0`；`skin` `1.1.44` → `1.1.45`；`live-feed` `1.2.13` → `1.2.14`；氧 `1.0.97` → `1.0.98`（Task 4 才改号）
- 不 GET 通知页、不软跳进 `/topic/`、不用 `PerformanceObserver`、默认关记录
- 源文件 UTF-8 无 BOM、LF；Windows 上不要用 `&&`（PowerShell 用分号或两条命令）
- 用户未明确要求则不要 `git commit`

## Files

- Create: `plugins/perf-probe.user.js`
- Create: `test/perf-probe.test.js`
- Modify: `plugins/skin.user.js`（软跳与时间轴打点）
- Modify: `test/skin.test.js`
- Modify: `plugins/live-feed.user.js`（`cycle()` 打点）
- Modify: `test/live-feed.test.js`
- Modify: `suite/order.js`（`ORDER` 末尾 `perf-probe`）
- Modify: `suite/suite-center.js`（指标行 + Task 4 版本）
- Modify: `build-suite.mjs`、`README.md`、RC 文档（Task 4）
- Run: `node build-suite.mjs`（不要为这个功能改氢 `build.mjs`）

---

### Task 1: 探针模块（门闩、缓冲、面板、debug）

**Files:**
- Create: `test/perf-probe.test.js`
- Create: `plugins/perf-probe.user.js`
- Modify: `suite/order.js`（末尾追加 `'perf-probe'`，否则 `test/suite.test.js` 的「plugins/ 下每个模块都在 ORDER」会红。本任务只加 id，不改版本号）

**Interfaces:**
- Consumes: 基座 `api.handle` / `api.on` / `api.emit` 不需要；测试用 `LSB.bus.emit('perf:span', payload)`
- Produces: `perf-probe:record`（门闩，空函数）；`api.on('perf:span')` 入库；`perf-probe:debug` → `{ dump, clear, recording, slowest }`；配置 `enabled` 默认 `false`

- [ ] **Step 1: Write the failing tests**

新建 `test/perf-probe.test.js`（UTF-8 无 BOM、LF）。helpers 抄 `test/live-feed.test.js` 的 `makeSite` / `loadBase` / `PLUG`（用 `homeHtml` 即可）：

```js
/** 性能探针：开关门闩、环形缓冲、时间轴入库规则 */
import { test } from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { JSDOM } from 'jsdom'

const baseCode = readFileSync(new URL('../dist/linuxsb-base.user.js', import.meta.url), 'utf8')
const PLUG = (n) => readFileSync(new URL(`../plugins/${n}`, import.meta.url), 'utf8')
const homeHtml = readFileSync(new URL('./fixtures/home.html', import.meta.url), 'utf8')

function makeSite(preload = {}) {
  const dom = new JSDOM(homeHtml, { url: 'https://linux.sb/', runScripts: 'outside-only' })
  const w = dom.window
  w.unsafeWindow = w
  w.requestAnimationFrame = (fn) => setTimeout(() => fn(Date.now()), 0)
  w.localStorage.setItem('lsb_base:__core:rate', JSON.stringify(10))
  for (const [k, v] of Object.entries(preload)) w.localStorage.setItem(k, JSON.stringify(v))
  const tick = (ms) => new Promise((r) => setTimeout(r, ms))
  return { w, tick }
}

async function loadBase(w, ...plugins) {
  w.eval(baseCode)
  for (const code of plugins) w.eval(code)
  await new Promise((r) => setTimeout(r, 30))
}

function span(partial) {
  return {
    name: 'spa.fetch',
    plugin: 'skin',
    ms: 10,
    href: '/',
    t: Date.now(),
    ...partial,
  }
}

test('性能探针：默认关着，没有门闩，emit 也不入库', async () => {
  const { w } = makeSite()
  await loadBase(w, PLUG('perf-probe.user.js'))
  const dbg = await w.LSB.bus.request('perf-probe:debug')
  assert.equal(dbg.recording(), false)
  assert.equal(w.LSB.bus.hasHandler('perf-probe:record'), false)
  w.LSB.bus.emit('perf:span', span(), { source: 'test' })
  assert.equal(dbg.dump().length, 0)
})

test('性能探针：打开后入库，dump/clear/slowest 可用', async () => {
  const { w } = makeSite({ 'lsb_base:perf-probe:__config': { enabled: true } })
  await loadBase(w, PLUG('perf-probe.user.js'))
  const dbg = await w.LSB.bus.request('perf-probe:debug')
  assert.equal(dbg.recording(), true)
  assert.equal(w.LSB.bus.hasHandler('perf-probe:record'), true)
  w.LSB.bus.emit('perf:span', span({ name: 'spa.parse', ms: 4 }), { source: 'test' })
  w.LSB.bus.emit('perf:span', span({ name: 'spa.fetch', ms: 40 }), { source: 'test' })
  const all = dbg.dump()
  assert.equal(all.length, 2)
  assert.equal(dbg.slowest().name, 'spa.fetch')
  assert.equal(dbg.slowest().ms, 40)
  dbg.clear()
  assert.equal(dbg.dump().length, 0)
  assert.equal(dbg.slowest(), null)
})

test('性能探针：超过 200 条挤掉最旧的', async () => {
  const { w } = makeSite({ 'lsb_base:perf-probe:__config': { enabled: true } })
  await loadBase(w, PLUG('perf-probe.user.js'))
  const dbg = await w.LSB.bus.request('perf-probe:debug')
  for (let i = 0; i < 201; i++) {
    w.LSB.bus.emit('perf:span', span({ name: 'spa.total', ms: i, t: i }), { source: 'test' })
  }
  const all = dbg.dump()
  assert.equal(all.length, 200)
  assert.equal(all[0].ms, 1, '最旧的 0 被挤掉，留下 1…200')
  assert.equal(all[199].ms, 200)
})

test('性能探针：关上开关后门闩消失，再 emit 不入库', async () => {
  const { w } = makeSite({ 'lsb_base:perf-probe:__config': { enabled: true } })
  await loadBase(w, PLUG('perf-probe.user.js'))
  const dbg = await w.LSB.bus.request('perf-probe:debug')
  w.LSB.bus.emit('perf:span', span({ ms: 9 }), { source: 'test' })
  assert.equal(dbg.dump().length, 1)
  w.eval(`localStorage.setItem('lsb_base:perf-probe:__config', JSON.stringify({ enabled: false }))`)
  w.LSB.bus.emit('config:changed:perf-probe', { enabled: false }, { source: 'core' })
  assert.equal(dbg.recording(), false)
  assert.equal(w.LSB.bus.hasHandler('perf-probe:record'), false)
  w.LSB.bus.emit('perf:span', span({ ms: 99, name: 'spa.commit' }), { source: 'test' })
  assert.equal(dbg.dump().length, 1, '关记录后缓冲冻结，不清空也不再涨')
})

test('性能探针：timeline.update 低于 8ms 丢弃，同一秒最多 2 条', async () => {
  const { w } = makeSite({ 'lsb_base:perf-probe:__config': { enabled: true } })
  await loadBase(w, PLUG('perf-probe.user.js'))
  const dbg = await w.LSB.bus.request('perf-probe:debug')
  const t = 1_700_000_000_000
  w.LSB.bus.emit('perf:span', span({ name: 'timeline.update', ms: 7, t }), { source: 'test' })
  w.LSB.bus.emit('perf:span', span({ name: 'timeline.update', ms: 8, t }), { source: 'test' })
  w.LSB.bus.emit('perf:span', span({ name: 'timeline.update', ms: 9, t }), { source: 'test' })
  w.LSB.bus.emit('perf:span', span({ name: 'timeline.update', ms: 10, t }), { source: 'test' })
  const tl = dbg.dump().filter((x) => x.name === 'timeline.update')
  assert.equal(tl.length, 2)
  assert.deepEqual(tl.map((x) => x.ms), [8, 9])
  w.LSB.bus.emit('perf:span', span({ name: 'timeline.update', ms: 12, t: t + 1000 }), { source: 'test' })
  assert.equal(dbg.dump().filter((x) => x.name === 'timeline.update').length, 3)
})
```

`dump()` 按时间从旧到新（`push` + `shift` 淘汰）。「关上开关」不断缓冲，只是不再收。

- [ ] **Step 2: Run tests to verify they fail**

Run: `node --test --test-force-exit test/perf-probe.test.js`

Expected: FAIL（还没有 `plugins/perf-probe.user.js`，`readFileSync` 抛错或 eval 失败）。

- [ ] **Step 3: Write minimal implementation**

`suite/order.js` 的 `ORDER` 数组末尾、`'live-feed'` 之后加 `'perf-probe'`。

新建 `plugins/perf-probe.user.js`（UTF-8 无 BOM、LF）。结构与其它插件相同：`LSB.register` / `LSB_PLUGINS` 排队。要点：

```js
// ==UserScript==
// @name         LSB·性能探针
// @namespace    https://linux.sb/
// @version      1.0.0
// @description  本机记录氢壳软跳、实时流巡检、时间轴慢帧的耗时。默认关闭。需要 LINUX.SB 基座。
// @author       you
// @match        https://linux.sb/*
// @grant        none
// @run-at       document-end
// @noframes
// ==/UserScript==

(function () {
  'use strict'

  const manifest = {
    id: 'perf-probe',
    name: '性能探针',
    version: '1.0.0',
    description: '本机记录软跳 / 巡检 / 时间轴慢帧耗时，默认关闭',
    author: 'you',
    requires: { base: '^0.1.0' },
    permissions: ['ui', 'storage', 'events'],
    config: {
      enabled: { type: 'switch', label: '记录卡顿', default: false },
    },
  }

  function setup(api) {
    const buf = []
    let timelineSec = -1
    let timelineN = 0
    let offRecord = () => {}
    let offSpan = () => {}

    function acceptSpan(span) {
      if (!span || typeof span.ms !== 'number' || !span.name) return false
      if (span.name !== 'timeline.update') return true
      if (span.ms < 8) return false
      const sec = Math.floor(Number(span.t || Date.now()) / 1000)
      if (sec !== timelineSec) {
        timelineSec = sec
        timelineN = 0
      }
      if (timelineN >= 2) return false
      timelineN += 1
      return true
    }

    function unbindRecording() {
      offRecord()
      offRecord = () => {}
      offSpan()
      offSpan = () => {}
    }

    function bindRecording() {
      unbindRecording()
      if (!api.config().enabled) return
      offRecord = api.handle('perf-probe:record', () => {})
      offSpan = api.on('perf:span', (span) => {
        if (!acceptSpan(span)) return
        buf.push({
          name: span.name,
          plugin: span.plugin,
          ms: span.ms,
          href: span.href,
          t: span.t,
        })
        if (buf.length > 200) buf.shift()
      })
    }

    function dump() {
      return buf.map((x) => ({ ...x }))
    }

    bindRecording()
    api.on('config:changed:perf-probe', () => {
      bindRecording()
    })
    api.onDispose(() => unbindRecording())

    api.ui.configTab({
      name: '性能探针',
      order: 90,
      render(host) {
        const on = !!api.config().enabled
        const rows = dump().slice().reverse()
        const slow = rows.reduce((a, b) => (!a || b.ms > a.ms ? b : a), null)
        const summary = document.createElement('div')
        summary.className = 'lsb-row-desc'
        summary.style.margin = '10px 0'
        if (!on) summary.textContent = '未开记录'
        else if (!rows.length) summary.textContent = '暂无'
        else summary.textContent = `最慢 ${slow.name} ${slow.ms}ms · 共 ${rows.length} 条`
        host.appendChild(summary)

        const table = document.createElement('div')
        table.className = 'lsb-row-desc'
        table.style.maxHeight = '240px'
        table.style.overflow = 'auto'
        for (const row of rows) {
          const line = document.createElement('div')
          line.className = 'lsb-row'
          line.textContent = `${Math.round(row.ms)}ms  ${row.name}  ${row.plugin || ''}  ${row.href || ''}`
          table.appendChild(line)
        }
        host.appendChild(table)

        const copy = document.createElement('button')
        copy.className = 'lsb-btn'
        copy.style.marginTop = '8px'
        copy.textContent = '复制 JSON'
        copy.onclick = async () => {
          const text = JSON.stringify(dump(), null, 2)
          try {
            if (navigator.clipboard?.writeText) await navigator.clipboard.writeText(text)
            else {
              const ta = document.createElement('textarea')
              ta.value = text
              document.body.append(ta)
              ta.select()
              document.execCommand('copy')
              ta.remove()
            }
            api.ui.toast('已复制', { type: 'success' })
          } catch (e) {
            api.ui.toast('复制失败：' + ((e && e.message) || e), { type: 'error' })
          }
        }
        host.appendChild(copy)

        const clearBtn = document.createElement('button')
        clearBtn.className = 'lsb-btn'
        clearBtn.style.marginLeft = '8px'
        clearBtn.textContent = '清空'
        clearBtn.onclick = () => {
          buf.length = 0
          api.ui.showTab('perf-probe')
        }
        host.appendChild(clearBtn)
      },
    })

    api.handle('perf-probe:debug', () => ({
      dump,
      clear: () => {
        buf.length = 0
      },
      recording: () => !!w.LSB?.bus?.hasHandler('perf-probe:record') || api.hasHandler('perf-probe:record'),
      slowest: () => buf.reduce((a, b) => (!a || b.ms > a.ms ? b : a), null),
    }))

    return {}
  }

  const w = typeof unsafeWindow !== 'undefined' ? unsafeWindow : window
  if (w.LSB && w.LSB.register) w.LSB.register(manifest, setup)
  else (w.LSB_PLUGINS = w.LSB_PLUGINS || []).push({ manifest, setup })
})()
```

`recording()` **不要**用上面那行 `w.LSB` 三元。写成：

```js
recording: () => api.hasHandler('perf-probe:record'),
```

`api.handle('perf-probe:debug')` 与门闩 `perf-probe:record` 是两个 handler。`hasHandler('perf-probe:record')` 只在 `bindRecording` 且 `enabled` 时为真。

面板表用纯文本行即可，不必真 `<table>`。摘要里 `slow.ms` 可原样数字，不必强行 `round`（复制 JSON 保留原 `ms`）。

- [ ] **Step 4: Run tests to verify they pass**

Run: `node --test --test-force-exit test/perf-probe.test.js`

Expected: 5 则 PASS。

若「超过 200 条」的 `all[0].ms` 不是 1：检查是 `push`/`shift` 还是 `unshift`。必须 `push` 新条目、`shift` 最旧。

---

### Task 2: 皮肤软跳与时间轴打点

**Files:**
- Modify: `test/skin.test.js`（文末追加）
- Modify: `plugins/skin.user.js`（`setup` 内辅助函数 + `navigateSpa` + `updateTimeline`）

**Interfaces:**
- Consumes: Task 1 的 `perf-probe:record` 门闩与 `perf:span`
- Produces: `spa.fetch` / `spa.parse` / `spa.commit` / `spa.fillShell` / `spa.total` / `spa.notify` / `timeline.update`（皮肤侧 ≥8ms 且同一日历秒最多 2 次 emit）

- [ ] **Step 1: Write the failing tests**

`test/skin.test.js` 文末追加：

```js
function spanNames(w) {
  return w.LSB.bus.request('perf-probe:debug').then((d) => d.dump().map((x) => x.name))
}

test('壳内跳转：探针开着时软跳记下 fetch/parse/commit/fillShell/total/notify', async () => {
  const { w, tick } = makeHome({ 'lsb_base:perf-probe:__config': { enabled: true } })
  stubHtmlFetch(w, () => homeHtml)
  await loadBase(w, PLUG('perf-probe.user.js'), PLUG('skin.user.js'))
  const link = w.document.createElement('a')
  link.href = 'https://linux.sb/forum/4'
  w.document.querySelector('main.wrap').append(link)
  link.click()
  await tick(40)
  const beforeNotify = await spanNames(w)
  for (const name of ['spa.fetch', 'spa.parse', 'spa.commit', 'spa.fillShell', 'spa.total']) {
    assert.ok(beforeNotify.includes(name), `软跳同步段要有 ${name}，实际 ${beforeNotify.join(',')}`)
  }
  await tick(120)
  const after = await spanNames(w)
  assert.ok(after.includes('spa.notify'), `下一帧要有 spa.notify，实际 ${after.join(',')}`)
})

test('壳内跳转：探针关着时点版块不记 span', async () => {
  const { w, tick } = makeHome()
  stubHtmlFetch(w, () => homeHtml)
  await loadBase(w, PLUG('perf-probe.user.js'), PLUG('skin.user.js'))
  const dbg = await w.LSB.bus.request('perf-probe:debug')
  assert.equal(dbg.recording(), false)
  const link = w.document.createElement('a')
  link.href = 'https://linux.sb/forum/4'
  w.document.querySelector('main.wrap').append(link)
  link.click()
  await tick(120)
  assert.equal(dbg.dump().length, 0)
  assert.equal(w.location.pathname, '/forum/4')
})
```

先加载 `perf-probe` 再加载 `skin`，门闩在软跳前已在。

- [ ] **Step 2: Run tests to verify they fail**

Run: `node --test --test-force-exit --test-name-pattern "探针开着时软跳|探针关着时点版块" test/skin.test.js`

Expected: FAIL，缓冲没有 `spa.fetch` 等。

- [ ] **Step 3: Write minimal implementation**

在 `plugins/skin.user.js` 的 `setup` 里、`navigateSpa` 之前加入（不要改氢）：

```js
    function perfHref() {
      try {
        return location.pathname + location.search
      } catch {
        return ''
      }
    }

    function perfEmit(name, ms) {
      try {
        if (!api.hasHandler('perf-probe:record')) return
        api.emitGlobal('perf:span', {
          name,
          plugin: 'skin',
          ms,
          href: perfHref(),
          t: Date.now(),
        })
      } catch {
        /* 探针失败不得打断壳 */
      }
    }

    function perfSpan(name, fn) {
      if (!api.hasHandler('perf-probe:record')) return fn()
      const t0 = performance.now()
      try {
        return fn()
      } finally {
        perfEmit(name, performance.now() - t0)
      }
    }

    async function perfSpanAsync(name, fn) {
      if (!api.hasHandler('perf-probe:record')) return fn()
      const t0 = performance.now()
      try {
        return await fn()
      } finally {
        perfEmit(name, performance.now() - t0)
      }
    }

    let timelineEmitSec = -1
    let timelineEmitN = 0
    function perfEmitTimeline(ms) {
      if (ms < 8) return
      const sec = Math.floor(Date.now() / 1000)
      if (sec !== timelineEmitSec) {
        timelineEmitSec = sec
        timelineEmitN = 0
      }
      if (timelineEmitN >= 2) return
      timelineEmitN += 1
      perfEmit('timeline.update', ms)
    }
```

`navigateSpa` 成功路径改成（`serial` 已加之后）。`spa.total` 从 `const tTotal = …` 起到 `scrollTo` 之后、`afterPaint` 之前；失败路径不要 `perfEmit('spa.total')`：

```js
      const serial = ++spaSerial
      const tTotal = api.hasHandler('perf-probe:record') ? performance.now() : 0
      const outlet = findRouteOutlet()
      outlet?.setAttribute('aria-busy', 'true')
      startProgress(serial)
      let committed = false
      try {
        const res = await perfSpanAsync('spa.fetch', () =>
          api.net.raw(`${target.pathname}${target.search}`, {
            queue: false,
            timeout: 15000,
            retry: 0,
          }),
        )
        if (serial !== spaSerial) return false
        if (!res.ok) throw new Error(`HTTP ${res.status}`)
        const finalUrl = new URL(res.url || target.href, target.href)
        if (!isSpaUrl(finalUrl.href)) {
          location.assign(finalUrl.href)
          return false
        }
        const pageDoc = perfSpan('spa.parse', () => new DOMParser().parseFromString(res.text, 'text/html'))
        const remoteOutlet = findRouteOutlet(pageDoc)
        if (!remoteOutlet) throw new Error('no remote outlet')
        applyHistory(finalUrl, settings.historyMode)
        perfSpan('spa.commit', () => {
          commitRoute(pageDoc, remoteOutlet)
        })
        committed = true
        perfSpan('spa.fillShell', () => {
          applyMarkers()
          fillShell()
        })
        spaFilledSerial = serial
        window.clearTimeout(refreshTimer)
        refreshTimer = 0
        finishProgress(serial)
        try {
          window.scrollTo(0, 0)
        } catch {
          /* jsdom 没有视口 */
        }
        if (tTotal) perfEmit('spa.total', performance.now() - tTotal)
        afterPaint(() => {
          if (serial !== spaSerial) return
          perfSpan('spa.notify', () => {
            notifyRoute()
            syncShellRoute()
          })
        })
        return true
      } catch (err) {
        if (serial !== spaSerial) return false
        finishProgress(serial)
        outlet?.removeAttribute('aria-busy')
        if (!committed && settings.historyMode !== 'none') location.assign(target.href)
        return false
      }
```

`updateTimeline` 包一层测量。现有函数体保持不动，只改入口：

```js
    function updateTimeline() {
      timelineRaf = 0
      if (!api.hasHandler('perf-probe:record')) {
        updateTimelineBody()
        return
      }
      const t0 = performance.now()
      try {
        updateTimelineBody()
      } finally {
        perfEmitTimeline(performance.now() - t0)
      }
    }

    function updateTimelineBody() {
      const timeline = document.querySelector('#lsb-shell-timeline')
      if (!timeline || !cfg.shell) return
      // …其余保持现在 updateTimeline 的函数体（从取 timeline 到 aria-valuenow）
    }
```

把原来 `updateTimeline` 里 `timelineRaf = 0` 之后的整段移进 `updateTimelineBody`。`scheduleTimeline` 仍调用 `updateTimeline`。

- [ ] **Step 4: Run tests to verify they pass**

Run: `node --test --test-force-exit --test-name-pattern "探针开着时软跳|探针关着时点版块|壳内跳转" test/skin.test.js`

Expected: 新两则 + 原有「壳内跳转」全部 PASS。`tick(40)` 若还没有 `spa.total`，把该则里第一段等待改成 `tick(80)`，不要超过 `tick(120)`。

---

### Task 3: 实时流 `cycle()` 打点

**Files:**
- Modify: `test/live-feed.test.js`（文末追加）
- Modify: `plugins/live-feed.user.js`（`cycle`）

**Interfaces:**
- Consumes: Task 1 门闩；现有 `cycle()` / `pollOnce`
- Produces: `name: 'cycle'`，`plugin: 'live-feed'`

- [ ] **Step 1: Write the failing test**

`test/live-feed.test.js` 文末追加：

```js
test('实时流：探针开着时 pollOnce 记一条 cycle', async () => {
  const { w, tick, until } = makeSite(homeHtml, '/', {
    'lsb_base:live-feed:__config': { jitterMs: 0, pollSec: 30, autoInsert: false },
    'lsb_base:perf-probe:__config': { enabled: true },
  })
  feedStub(w, () => homeHtml)
  await loadBase(w, PLUG('perf-probe.user.js'), PLUG('live-feed.user.js'))
  const feed = await w.LSB.bus.request('live-feed:debug')
  await until(() => feed.role() === 'leader', 3000)
  const probe = await w.LSB.bus.request('perf-probe:debug')
  const before = probe.dump().filter((x) => x.name === 'cycle').length
  await feed.pollOnce()
  await tick(40)
  const cycles = probe.dump().filter((x) => x.name === 'cycle')
  assert.ok(cycles.length > before, '手动巡检要记 cycle')
  assert.equal(cycles.at(-1).plugin, 'live-feed')
})
```

选主 `onPromote` 已经会 `cycle()` 一次，所以用 `before` 差值，不要假设缓冲为空。

- [ ] **Step 2: Run test to verify it fails**

Run: `node --test --test-force-exit --test-name-pattern "pollOnce 记一条 cycle" test/live-feed.test.js`

Expected: FAIL，`cycles.length === before`。

- [ ] **Step 3: Write minimal implementation**

在 `plugins/live-feed.user.js` 的 `setup` 里、`cycle` 附近加：

```js
    function perfHref() {
      try {
        return location.pathname + location.search
      } catch {
        return ''
      }
    }

    function perfEmitCycle(ms) {
      try {
        if (!api.hasHandler('perf-probe:record')) return
        api.emitGlobal('perf:span', {
          name: 'cycle',
          plugin: 'live-feed',
          ms,
          href: perfHref(),
          t: Date.now(),
        })
      } catch {
        /* 探针失败不得打断巡检 */
      }
    }
```

把 `cycle` 改成（`inflight` 复用逻辑保留，只包住真正干活的那次）：

```js
    async function cycle() {
      if (!mode) init()
      if (!mode) return 0
      if (inflight) return inflight
      const timed = api.hasHandler('perf-probe:record')
      const t0 = timed ? performance.now() : 0
      inflight = (async () => {
        try {
          lastFresh = mode === 'list' ? await cycleList() : await cycleTopic()
          return lastFresh
        } catch (e) {
          lastErr = String((e && e.message) || e)
          api.log('实时流巡检失败', lastErr)
          return 0
        } finally {
          inflight = null
          if (timed) perfEmitCycle(performance.now() - t0)
          if (mode && shouldPoll()) scheduleNext()
        }
      })()
      return inflight
    }
```

`t0` 必须在启动 `inflight` 异步体之前取，`finally` 里用同一个 `t0`。并发复用已有 `inflight` 时不要再 emit。

- [ ] **Step 4: Run tests to verify they pass**

Run: `node --test --test-force-exit test/live-feed.test.js`

Expected: 全部 PASS（含旧用例与本则）。

---

### Task 4: ORDER 已在 Task 1 加过；版本、套件指标、文档、产物

**Files:**
- Modify: `plugins/skin.user.js` 头部 `@version` 与 `manifest.version` → `1.1.45`
- Modify: `plugins/live-feed.user.js` 头部 `@version` 与 `manifest.version` → `1.2.14`
- Modify: `build-suite.mjs` `SUITE_VERSION = '1.0.98'`
- Modify: `suite/suite-center.js` `version: '1.0.98'`，`statLines` 加探针一行
- Modify: `README.md` 官方插件表增加 `perf-probe` 行
- Modify: `docs/CONVENTIONS.md` §2.2 氧 **1.0.98**
- Modify: `docs/已知问题-rc.md` 标题氧 **1.0.98**
- Modify: `docs/测试招募-氢氧-beta.md` 表内氧 **1.0.98**
- Modify: `docs/功能征集-rc-ga.md` 两处氧 **1.0.98**
- Run: `node build-suite.mjs`

**Interfaces:**
- Consumes: Task 1–3 行为已落地；`ORDER` 已含 `perf-probe`
- Produces: 氧 dist `@version` 1.0.98；banner 含探针 1.0.0、皮肤 1.1.45、实时流 1.2.14

- [ ] **Step 1: Suite stat line + README**

`suite/suite-center.js` 的 `statLines` 里 `jobs` 数组追加（RPC 失败当未开）：

```js
        ['卡顿记录', () =>
          api.request('perf-probe:debug').then((d) => {
            const s = d.slowest()
            return s ? `最慢 ${s.ms}ms ${s.name}` : '未开记录'
          }).catch(() => '未开记录')],
```

`README.md` 官方插件表在 `live-feed` 行后插入：

```md
| `perf-probe` | **性能探针**：本机记录氢壳软跳各段、实时流巡检、时间轴慢帧耗时；默认关；面板可复制 JSON | ui/storage/events |
```

- [ ] **Step 2: Bump versions**

两处版本号必须相同。不要改 `src/core.js` 的 `VERSION`。CONVENTIONS §2.2 仍写「冻新功能」，氧号改成 **1.0.98**（本功能是用户点名要加的模块）。不要造 git tag `v1.0.98`。

- [ ] **Step 3: Build oxygen**

Run: `node build-suite.mjs`

Expected: 打印含 `v1.0.98`、**19** 模块（原 18 + `perf-probe`）。

- [ ] **Step 4: Full test suite**

Run: `node --test --test-force-exit --test-concurrency=4`

Expected: 0 fail。基线约 379，本计划大约 +8（探针 5、皮肤 2、实时流 1）。以 0 fail 为准。

`test/suite.test.js` 的「套件收录完整」在 Task 1 加 `ORDER` 后就应覆盖新文件；本步确认产物卫生（无 BOM/CRLF）仍绿。

---

## Self-review

| Spec 条 | Task |
|---|---|
| 新模块 `perf-probe`、不 `requires.plugins`、ORDER 在 live-feed 后 | Task 1 |
| 默认 `enabled: false`；门闩 `perf-probe:record`；`config:changed` 重绑 | Task 1 |
| `perf:span` 字段 name/plugin/ms/href/t；缓冲 200；不写 localStorage | Task 1 |
| 面板摘要/表/复制/清空；debug dump/clear/recording/slowest | Task 1 |
| `timeline.update` 探针侧 ≥8ms、同一秒 2 条 | Task 1 |
| spa.* 打点；失败不记 spa.total | Task 2 |
| 皮肤侧时间轴节流后再 emit | Task 2 |
| live-feed `cycle` | Task 3 |
| 套件 statLines；版本 1.0.0 / 1.1.45 / 1.2.14 / 氧 1.0.98；氢不动 | Task 4 |
| 不 GET 通知、不长任务、不改氢 API | 全局约束 |
