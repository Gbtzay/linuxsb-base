# 称号行情全站浮层 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 称号行情（含大盘）做成全站可拖浮层；打开时选主巡检加快到最多 10 秒；氧面板改回设置；氢壳左栏改为 RPC 开浮层。

**Architecture:** 浮层、右下角钮、在看心跳都由 `title-quotes` 自己挂。`pollMs()` 读 store 里未过期的 `watchBeat`。交易页折叠仍走现有 `render`。皮肤只改左栏工具项和点击接线。氢核心不改。

**Tech Stack:** `plugins/title-quotes.user.js`、`plugins/skin.user.js`、jsdom `node:test`、`node build-suite.mjs`。

## Global Constraints

- Spec：`docs/superpowers/specs/2026-08-27-title-quotes-float-design.md`
- 插件 `1.0.10` → `1.0.11`（Task 6 才改号）；皮肤 `1.1.42` → `1.1.43`（Task 5/6）；氧 `SUITE_VERSION` / `suite-center` `1.0.84` → `1.0.85`（Task 6）；氢 `0.1.33` 不动；不改 `ORDER`
- 不写购买、不拉成交、不新插件、不新网址、不改采集 / `MERGE_MS` / 快照 / 大盘纯函数、不把配置默认 30 秒改成 10、不用 `configTab`、不测拖拽像素、不测真站
- 源文件 UTF-8 无 BOM、LF；Windows PowerShell 不要用 `&&`（分号或两条命令）
- 用户未明确要求则不要 `git commit`；各 Task 末步标 Skip
- 文案锁定：钮 **行情**（`title`/`aria-label` **称号行情**）；浮层标题 **称号行情**；收起 / 关闭（×）；面板按钮 **打开浮层**；RPC `title-quotes:open`
- 测试走 `plugins/*.user.js`（不是 dist）。Windows 上 `node --test` 若沙箱失败，用全权限再跑

## Files

- Modify: `plugins/title-quotes.user.js`（常量、`pollMs`、浮层/钮、心跳、面板 Tab、debug、CSS、dispose）
- Modify: `plugins/skin.user.js`（`collectTools` / `renderLinks` / 左栏点击；Task 5 改号）
- Modify: `test/title-quotes.test.js`、`test/skin.test.js`
- Modify: `build-suite.mjs` `SUITE_VERSION`、`suite/suite-center.js`（Task 6）
- Modify: `README.md` 称号行情一行；`docs/CONVENTIONS.md`、`docs/已知问题-rc.md`、`docs/测试招募-氢氧-beta.md`、`docs/功能征集-rc-ga.md`（Task 6）
- Run: `node build-suite.mjs`（不要为这个功能跑 `build.mjs`）

## 心跳重排（所有 Task 必须遵守）

`WATCH_MS = 10000`，`WATCH_TTL_MS = 15000`，`WATCH_BEAT_MS = 5000`。

每 5 秒写 `watchBeat` **只续期 TTL**。若每次都 `scheduleNext()`，10 秒定时器会被重置，巡检永远不会跑。

规则：记 `armedMs`（上次 `scheduleNext` 用的间隔）。收到 `watch` / 本地心跳变化时，**仅当** `pollMs() !== armedMs` 才 `scheduleNext()`。打开、关闭（把 `t` 置 0）、从后台回到可见、配置变更：间隔会变，要重排。5 秒续期：间隔仍是 10 秒，不重排。

`pollMs()`：配置间隔 `max(250, intervalSec×1000)` 缺省 30000；若 `watchBeat.t > 0` 且 `now - t < 15000`，返回 `min(10000, 配置间隔)`。

---

### Task 1: `pollMs` 读在看心跳

**Files:**
- Modify: `test/title-quotes.test.js`（追加用例）
- Modify: `plugins/title-quotes.user.js`（常量、`watching`、`pollMs`、debug）

**Interfaces:**
- Consumes: 现有 `cfg.intervalSec`、`api.store`、debug handle `intervalMs: pollMs`
- Produces:
  - 模块常量 `WATCH_MS = 10000`、`WATCH_TTL_MS = 15000`、`WATCH_BEAT_MS = 5000`（与 `FORCE_DEBOUNCE_MS` 同层）
  - `watching()` → `boolean`（读 `api.store.get('watchBeat')`：`t` 为有限且 `> 0` 且 `Date.now() - t < WATCH_TTL_MS`）
  - `pollMs()` → `number`（见上文公式）
  - debug：`watching`、`watchBeat: () => api.store.get('watchBeat', null)`、`setWatchBeat: (v) => api.store.set('watchBeat', v)`

- [ ] **Step 1: Write the failing test**

Append to `test/title-quotes.test.js` after the existing `默认巡检 30 秒` test:

```js
test('称号行情：新鲜在看心跳时 pollMs 为 min(10秒, 配置)', async () => {
  const { dbg } = await boot()
  assert.equal(dbg.intervalMs(), 30000)
  assert.equal(dbg.watching(), false)
  dbg.setWatchBeat({ t: Date.now(), id: 'a' })
  assert.equal(dbg.watching(), true)
  assert.equal(dbg.intervalMs(), 10000)
  dbg.setWatchBeat({ t: 0, id: 'a' })
  assert.equal(dbg.watching(), false)
  assert.equal(dbg.intervalMs(), 30000)
  dbg.setWatchBeat({ t: Date.now() - 20000, id: 'a' })
  assert.equal(dbg.watching(), false)
  assert.equal(dbg.intervalMs(), 30000)
})

test('称号行情：配置已是 5 秒时心跳不把间隔拉到 10 秒', async () => {
  const { dbg } = await boot('https://linux.sb/', {
    'lsb_base:title-quotes:__config': { intervalSec: 5 },
  })
  assert.equal(dbg.intervalMs(), 5000)
  dbg.setWatchBeat({ t: Date.now(), id: 'a' })
  assert.equal(dbg.intervalMs(), 5000)
})
```

- [ ] **Step 2: Run test to verify it fails**

Run: `node --test --test-force-exit test/title-quotes.test.js`  
Expected: 新用例 FAIL（`dbg.watching` / `setWatchBeat` 不是函数，或 `intervalMs` 仍忽略 store）。旧用例仍绿。

- [ ] **Step 3: Write minimal implementation**

Near `FORCE_DEBOUNCE_MS`:

```js
  const WATCH_MS = 10000
  const WATCH_TTL_MS = 15000
  const WATCH_BEAT_MS = 5000
```

Inside `setup`, replace `pollMs` and add helpers (after `cfg` exists):

```js
    function watching() {
      const beat = api.store.get('watchBeat', null)
      const t = Number(beat && beat.t)
      return Number.isFinite(t) && t > 0 && Date.now() - t < WATCH_TTL_MS
    }
    function configMs() {
      const n = Number(cfg.intervalSec)
      return Math.max(250, (Number.isFinite(n) && n > 0 ? n : 30) * 1000)
    }
    function pollMs() {
      const ms = configMs()
      return watching() ? Math.min(WATCH_MS, ms) : ms
    }
```

Add to `title-quotes:debug` return object:

```js
      watching,
      watchBeat: () => api.store.get('watchBeat', null),
      setWatchBeat: (v) => api.store.set('watchBeat', v),
```

Keep `intervalMs: pollMs`.

- [ ] **Step 4: Run test to verify it passes**

Run: `node --test --test-force-exit test/title-quotes.test.js`  
Expected: 全绿。

- [ ] **Step 5: Commit**

Skip unless the user asked to commit.

---

### Task 2: 浮层、右下角钮、RPC、持久化

**Files:**
- Modify: `test/title-quotes.test.js`
- Modify: `plugins/title-quotes.user.js`（`setup` 内挂载、样式、handle、dispose；`render` 对浮层内容区去掉重复标题）

**Interfaces:**
- Consumes: Task 1 `watching` / `pollMs` / `WATCH_*`；现有 `render(host)`、`election`、`scheduleNext`
- Produces:
  - `tabId`：setup 时 `Math.random().toString(36).slice(2, 10)`
  - `openFloat()`：幂等；挂载 chrome；`store.floatOpen = true`；取消收起；可见则 `writeWatchBeat`；`render(body)`；选主且 `pollMs() !== armedMs` 则 `scheduleNext`
  - `closeFloat()`：停心跳定时器；若 `watchBeat.id === tabId` 则 `setWatchBeat({ t: 0, id: tabId })` 并 `api.tabs.post('watch', { t: 0, id: tabId })`；`floatOpen = false`；卸浮层 DOM（钮留下）；按 `armedMs` 规则重排
  - `writeWatchBeat()`：仅当 `floatOpen` 且 `document.visibilityState === 'visible'` 且 `!document.hidden` 时写入 `{ t: Date.now(), id: tabId }` 并 `tabs.post`；然后若选主且间隔变了才 `scheduleNext`
  - `mountFab()`：始终一颗 `.lsb-title-quotes-fab`，文案 `行情`
  - `api.handle('title-quotes:open', openFloat)`
  - `armedMs`：`scheduleNext` 开头 `armedMs = pollMs()` 再 `setTimeout(cycle, armedMs)`
  - `api.tabs.on('watch', () => { if (election.isLeader && pollMs() !== armedMs) scheduleNext() })`
  - debug 增补：`openFloat`、`closeFloat`、`writeWatchBeat`、`tabId: () => tabId`
  - DOM：`.lsb-title-quotes-float` > `.lsb-title-quotes-float-head` + `.lsb-title-quotes-float-body` + `.lsb-title-quotes-float-resize`；内容画在 `float-body`（class 含 `lsb-title-quotes-float-body`）
  - store：`floatOpen` boolean、`floatCollapsed` boolean、`floatRect` `{ left, top, width, height }` 或缺省用 CSS `right:16px;bottom:130px;width:480px;height:520px`

- [ ] **Step 1: Write the failing test**

Add helper near `boot` in `test/title-quotes.test.js`:

```js
async function quotesView(w, dbg) {
  await dbg.openFloat()
  return w.document.querySelector('.lsb-title-quotes-float-body')
}
```

Append:

```js
test('称号行情：默认有行情钮；RPC 打开浮层且含行情大盘', async () => {
  const { w, dbg } = await boot()
  const fab = w.document.querySelector('.lsb-title-quotes-fab')
  assert.ok(fab)
  assert.equal(fab.textContent.trim(), '行情')
  assert.equal(fab.getAttribute('aria-label'), '称号行情')
  assert.equal(w.document.querySelector('.lsb-title-quotes-float'), null)
  await w.LSB.bus.request('title-quotes:open')
  const floatEl = w.document.querySelector('.lsb-title-quotes-float')
  assert.ok(floatEl)
  const body = floatEl.querySelector('.lsb-title-quotes-float-body')
  assert.ok(body)
  assert.ok(body.querySelector('[data-board-view="quotes"]'))
  assert.ok(body.querySelector('[data-board-view="board"]'))
  assert.match(floatEl.querySelector('.lsb-title-quotes-float-head')?.textContent || '', /称号行情/)
  assert.equal(dbg.watching(), true)
  assert.equal(dbg.intervalMs(), 10000)
  assert.equal(JSON.parse(w.localStorage.getItem('lsb_base:title-quotes:floatOpen')), true)
})

test('称号行情：关闭浮层后间隔回到配置；收起仍算在看', async () => {
  const { w, dbg } = await boot()
  await dbg.openFloat()
  w.document.querySelector('[data-float-collapse]').click()
  assert.ok(w.document.querySelector('.lsb-title-quotes-float')?.classList.contains('is-collapsed'))
  assert.equal(dbg.watching(), true)
  w.document.querySelector('[data-float-close]').click()
  assert.equal(w.document.querySelector('.lsb-title-quotes-float'), null)
  assert.ok(w.document.querySelector('.lsb-title-quotes-fab'))
  assert.equal(JSON.parse(w.localStorage.getItem('lsb_base:title-quotes:floatOpen')), false)
  assert.equal(dbg.watching(), false)
  assert.equal(dbg.intervalMs(), 30000)
})

test('称号行情：floatOpen 预载则启动即打开', async () => {
  const { w } = await boot('https://linux.sb/', {
    'lsb_base:title-quotes:floatOpen': true,
  })
  assert.ok(w.document.querySelector('.lsb-title-quotes-float'))
})

test('称号行情：氢面板存在时 Esc 不关浮层', async () => {
  const { w, dbg } = await boot()
  await dbg.openFloat()
  const panel = w.document.createElement('div')
  panel.className = 'lsb-panel'
  w.document.body.append(panel)
  w.document.dispatchEvent(new w.KeyboardEvent('keydown', { key: 'Escape', bubbles: true }))
  assert.ok(w.document.querySelector('.lsb-title-quotes-float'))
  panel.remove()
  w.document.dispatchEvent(new w.KeyboardEvent('keydown', { key: 'Escape', bubbles: true }))
  assert.equal(w.document.querySelector('.lsb-title-quotes-float'), null)
})
```

Esc 处理函数开头必须 `if (document.querySelector('.lsb-panel')) return`。测试用手动插入的 `.lsb-panel`，不要 `LSB.open()`（氢自己的 Esc 会先拆掉面板，断言会抢跑）。

- [ ] **Step 2: Run test to verify it fails**

Run: `node --test --test-force-exit test/title-quotes.test.js`  
Expected: 新用例 FAIL（无 FAB / `openFloat`）。Task 1 用例仍绿。

- [ ] **Step 3: Write minimal implementation**

Inside `setup` after `set`/`get`/`cfg`:

```js
    const tabId = Math.random().toString(36).slice(2, 10)
    let beatTimer = null
    let armedMs = null
    let drag = null
```

Replace `scheduleNext`:

```js
    function scheduleNext() {
      if (timer) clearTimeout(timer)
      armedMs = pollMs()
      timer = setTimeout(() => cycle(), armedMs)
      timer.unref?.()
    }
```

`config:changed` 仍 `if (election.isLeader) scheduleNext()`（配置变了必须重排，即使数值碰巧相同也没关系）。

Add:

```js
    function pageVisible() {
      return document.visibilityState === 'visible' && !document.hidden
    }
    function stopBeatTimer() {
      if (beatTimer) clearInterval(beatTimer)
      beatTimer = null
    }
    function maybeReschedule() {
      if (election.isLeader && pollMs() !== armedMs) scheduleNext()
    }
    function writeWatchBeat() {
      if (!api.store.get('floatOpen')) return
      if (!pageVisible()) return
      const beat = { t: Date.now(), id: tabId }
      api.store.set('watchBeat', beat)
      api.tabs.post('watch', beat)
      maybeReschedule()
    }
    function startBeatTimer() {
      stopBeatTimer()
      writeWatchBeat()
      beatTimer = setInterval(writeWatchBeat, WATCH_BEAT_MS)
      beatTimer.unref?.()
    }
```

`api.tabs.on('watch', () => maybeReschedule())`

Chrome + FAB (place **before** `election` / first `scheduleNext` is not required; place before `api.onDispose`):

```js
    function applyRect(el) {
      const r = api.store.get('floatRect', null)
      el.style.position = 'fixed'
      el.style.zIndex = '99990'
      el.style.minWidth = '360px'
      el.style.minHeight = '280px'
      el.style.maxWidth = '94vw'
      el.style.maxHeight = '90vh'
      if (r && Number.isFinite(r.left) && Number.isFinite(r.top) && Number.isFinite(r.width) && Number.isFinite(r.height)) {
        el.style.left = `${r.left}px`
        el.style.top = `${r.top}px`
        el.style.width = `${Math.max(360, r.width)}px`
        el.style.height = `${Math.max(280, r.height)}px`
        el.style.right = 'auto'
        el.style.bottom = 'auto'
      } else {
        el.style.left = 'auto'
        el.style.top = 'auto'
        el.style.right = '16px'
        el.style.bottom = '130px'
        el.style.width = '480px'
        el.style.height = '520px'
      }
    }
    function persistRect(el) {
      const box = el.getBoundingClientRect()
      if (!box.width || !box.height) return
      api.store.set('floatRect', { left: box.left, top: box.top, width: box.width, height: box.height })
    }
    function clamp(el) {
      const box = el.getBoundingClientRect()
      const vw = window.innerWidth || 800
      const vh = window.innerHeight || 600
      let left = box.left
      let top = box.top
      if (box.right < 40) left = 0
      if (box.left > vw - 40) left = Math.max(0, vw - 40)
      if (box.bottom < 28) top = 0
      if (box.top > vh - 28) top = Math.max(0, vh - 28)
      el.style.left = `${left}px`
      el.style.top = `${top}px`
      el.style.right = 'auto'
      el.style.bottom = 'auto'
    }
    function setCollapsed(on) {
      const el = document.querySelector('.lsb-title-quotes-float')
      if (!el) return
      el.classList.toggle('is-collapsed', !!on)
      api.store.set('floatCollapsed', !!on)
      const btn = el.querySelector('[data-float-collapse]')
      if (btn) btn.textContent = on ? '展开' : '收起'
    }
    function unmountFloat() {
      document.querySelectorAll('.lsb-title-quotes-float').forEach((n) => n.remove())
    }
    function unmountFab() {
      document.querySelectorAll('.lsb-title-quotes-fab').forEach((n) => n.remove())
    }
    function bindChrome(el) {
      const head = el.querySelector('.lsb-title-quotes-float-head')
      head.addEventListener('pointerdown', (e) => {
        if (e.target.closest('button')) return
        const box = el.getBoundingClientRect()
        drag = { kind: 'move', dx: e.clientX - box.left, dy: e.clientY - box.top }
        e.preventDefault()
      })
      el.querySelector('.lsb-title-quotes-float-resize').addEventListener('pointerdown', (e) => {
        const box = el.getBoundingClientRect()
        drag = { kind: 'resize', x: e.clientX, y: e.clientY, w: box.width, h: box.height, l: box.left, t: box.top }
        e.preventDefault()
        e.stopPropagation()
      })
      el.querySelector('[data-float-close]').addEventListener('click', () => closeFloat())
      el.querySelector('[data-float-collapse]').addEventListener('click', () => {
        setCollapsed(!el.classList.contains('is-collapsed'))
      })
    }
    function onPointerMove(e) {
      const el = document.querySelector('.lsb-title-quotes-float')
      if (!drag || !el) return
      if (drag.kind === 'move') {
        el.style.left = `${e.clientX - drag.dx}px`
        el.style.top = `${e.clientY - drag.dy}px`
        el.style.right = 'auto'
        el.style.bottom = 'auto'
      } else {
        el.style.left = `${drag.l}px`
        el.style.top = `${drag.t}px`
        el.style.width = `${Math.max(360, drag.w + (e.clientX - drag.x))}px`
        el.style.height = `${Math.max(280, drag.h + (e.clientY - drag.y))}px`
        el.style.right = 'auto'
        el.style.bottom = 'auto'
      }
    }
    function onPointerUp() {
      const el = document.querySelector('.lsb-title-quotes-float')
      if (drag && el) {
        clamp(el)
        persistRect(el)
      }
      drag = null
    }
    function onWinResize() {
      const el = document.querySelector('.lsb-title-quotes-float')
      if (el) clamp(el)
    }
    function onKey(e) {
      if (e.key !== 'Escape') return
      if (document.querySelector('.lsb-panel')) return
      if (!api.store.get('floatOpen')) return
      closeFloat()
    }
    function mountFab() {
      let btn = document.querySelector('.lsb-title-quotes-fab')
      if (!btn) {
        btn = document.createElement('button')
        btn.className = 'lsb-title-quotes-fab'
        btn.type = 'button'
        btn.textContent = '行情'
        btn.title = '称号行情'
        btn.setAttribute('aria-label', '称号行情')
        document.body.append(btn)
        btn.addEventListener('click', () => openFloat())
      }
    }
    function mountFloat() {
      let el = document.querySelector('.lsb-title-quotes-float')
      if (!el) {
        el = document.createElement('div')
        el.className = 'lsb-title-quotes-float'
        el.innerHTML =
          `<div class="lsb-title-quotes-float-head"><strong>称号行情</strong>` +
          `<button type="button" class="lsb-btn" data-float-collapse>收起</button>` +
          `<button type="button" class="lsb-panel-close" data-float-close title="关闭">×</button></div>` +
          `<div class="lsb-title-quotes-float-body"></div>` +
          `<div class="lsb-title-quotes-float-resize"></div>`
        document.body.append(el)
        bindChrome(el)
      }
      applyRect(el)
      setCollapsed(!!api.store.get('floatCollapsed', false))
      return el
    }
    function closeFloat() {
      stopBeatTimer()
      const beat = api.store.get('watchBeat', null)
      if (beat && beat.id === tabId) {
        const off = { t: 0, id: tabId }
        api.store.set('watchBeat', off)
        api.tabs.post('watch', off)
      }
      api.store.set('floatOpen', false)
      unmountFloat()
      maybeReschedule()
    }
    function openFloat() {
      api.store.set('floatOpen', true)
      api.store.set('floatCollapsed', false)
      const el = mountFloat()
      setCollapsed(false)
      const body = el.querySelector('.lsb-title-quotes-float-body')
      render(body)
      startBeatTimer()
      maybeReschedule()
    }
```

`document.addEventListener('pointermove', onPointerMove)`  
`document.addEventListener('pointerup', onPointerUp)`  
`window.addEventListener('resize', onWinResize)`  
`document.addEventListener('keydown', onKey)`

At end of setup, after `mountEmbed()`:

```js
    mountFab()
    if (api.store.get('floatOpen')) openFloat()
    api.handle('title-quotes:open', () => openFloat())
```

`onDispose`: also `stopBeatTimer()`, `unmountFloat()`, `unmountFab()`, remove the four listeners above.

In `render`, skip the extra `<strong>称号行情</strong>` when the host is the float body (chrome already has the title):

```js
      const isFloat = host.classList.contains('lsb-title-quotes-float-body')
      const head = isEmbed
        ? `<div class="lsb-cal-head">${tools}</div>`
        : `<div class="lsb-cal-head">
          ${isFloat ? '' : '<strong>称号行情</strong>'}
          <span class="lsb-row-desc">${esc(statusLine())}</span>
          ${tools}
        </div>`
```

Append CSS to `api.ui.style(...)` (keep existing rules, add):

```css
.lsb-title-quotes-fab{position:fixed;right:62px;bottom:74px;z-index:99998;width:38px;height:38px;border-radius:50%;border:1px solid var(--line,#ddd);background:var(--panel,#fff);color:var(--brand,#5eaaa0);cursor:pointer;font-size:13px;font-weight:700;box-shadow:0 4px 12px var(--shadow-base,rgba(0,0,0,.15))}
.lsb-title-quotes-float{position:fixed;z-index:99990;display:flex;flex-direction:column;background:var(--panel,#fff);color:var(--text,#222);border:1px solid var(--line,#ddd);border-radius:10px;box-shadow:0 18px 48px var(--shadow-medium,rgba(0,0,0,.3));overflow:hidden}
.lsb-title-quotes-float-head{display:flex;align-items:center;gap:8px;padding:8px 10px;border-bottom:1px solid var(--line-soft,#eee);cursor:move;flex:0 0 auto}
.lsb-title-quotes-float-head strong{font-size:14px;margin-right:auto}
.lsb-title-quotes-float-body{flex:1;min-height:0;overflow:auto;padding:8px 12px}
.lsb-title-quotes-float-resize{position:absolute;right:0;bottom:0;width:14px;height:14px;cursor:nwse-resize}
.lsb-title-quotes-float{position:fixed}
.lsb-title-quotes-float.is-collapsed{height:auto !important;min-height:0}
.lsb-title-quotes-float.is-collapsed .lsb-title-quotes-float-body,
.lsb-title-quotes-float.is-collapsed .lsb-title-quotes-float-resize{display:none}
```

Float needs `position:relative` for the resize handle — set `el.style.position = 'fixed'` in `applyRect` is enough if resize is `position:absolute` inside a `position:fixed` box (fixed establishes containing block). Good.

Debug handle add `openFloat`, `closeFloat`, `writeWatchBeat`, `tabId: () => tabId`.

`election` is used in `maybeReschedule` — declare `let election` earlier or define open/close **after** `const election = api.election(...)`. In current file `election` is `const` below `scheduleNext`. Put `openFloat`/`writeWatchBeat` **after** `const election = ...` to avoid TDZ. `scheduleNext` already references `election` today and sits above it — that works because `scheduleNext` is only *called* after election exists. Same pattern: define functions anywhere, call `mountFab`/`openFloat` only after `election`.

- [ ] **Step 4: Run test to verify it passes**

Run: `node --test --test-force-exit test/title-quotes.test.js`  
Expected: 全绿。旧的 `LSB.open('title-quotes')` 画图用例本 Task **不要改**，应仍绿。

- [ ] **Step 5: Commit**

Skip unless the user asked to commit.

---

### Task 3: 氧面板改设置；图的测试改走浮层

**Files:**
- Modify: `test/title-quotes.test.js`（`quotesView` 替换画图用例的 host；新增面板用例）
- Modify: `plugins/title-quotes.user.js`（`api.ui.tab` render；`refreshViews`）

**Interfaces:**
- Consumes: Task 2 `openFloat`、`.lsb-title-quotes-float-body`
- Produces: 面板 Tab 只含 `buildForm` +「打开浮层」；`LSB.open('title-quotes')` 不再出现 `.lsb-title-quotes-anchors`；`refreshViews` 在浮层存在时 `render(float-body)`（含收起态，展开不必重挂）

- [ ] **Step 1: Write the failing test / migrate hosts**

Keep test `称号行情：氧面板不折叠` as-is (still `LSB.open`, still no fold).

Add:

```js
test('称号行情：氧面板是设置加打开浮层，不画行情图', async () => {
  const { w } = await boot()
  w.LSB.open('title-quotes')
  const view = w.document.querySelector('.lsb-view')
  assert.match(view.textContent, /巡检间隔/)
  assert.match(view.textContent, /打开浮层/)
  assert.equal(view.querySelector('.lsb-title-quotes-anchors'), null)
  assert.equal(view.querySelector('[data-board-view]'), null)
  const btn = [...view.querySelectorAll('button')].find((b) => b.textContent.trim() === '打开浮层')
  assert.ok(btn)
  btn.click()
  assert.ok(w.document.querySelector('.lsb-title-quotes-float'))
})
```

In every remaining test that does `w.LSB.open('title-quotes')` **and then asserts charts** (anchors / K / 大盘 / 空态文案 / 榜), replace the open+`.lsb-view` pair with:

```js
  const view = await quotesView(w, dbg)
```

Do **not** replace `称号行情：氧面板不折叠`.

Exact tests to migrate (search `LSB.open('title-quotes')`):

- `零快照空状态；一次有锚点无折线；两次出线` — 三处 open 都改 `quotesView`；空态仍匹配 `/打开交易页|巡检/`
- `可切到最低最高折线并记住` — 打开用 `quotesView`；末尾「关掉再打开」改为再 `await dbg.openFloat()` 后从 `.lsb-title-quotes-float-body` 取行（不要 `LSB.open`）
- `可选本日；K 线悬停给出开高低收`
- `大盘` 视图按钮那条（断言 `行情`/`大盘`、overlay `pointer-events=none`、点回行情）
- `大盘无系列时用行情空态文案`
- `冷热榜短线有涨跌；点名称回到行情并展开`
- `区间空窗榜文案；短线仅一份则全是新上`

- [ ] **Step 2: Run test to verify new panel test fails**

Run: `node --test --test-force-exit test/title-quotes.test.js`  
Expected: `氧面板是设置加打开浮层` FAIL（`.lsb-view` 里仍是图，无「打开浮层」）。已迁移的画图用例在 Task 2 浮层已存在时应仍能绿（`quotesView` 走 RPC）。

- [ ] **Step 3: Write minimal implementation**

Replace `api.ui.tab({ render(host) { render(host) } })` with:

```js
    api.ui.tab({
      name: '称号行情',
      order: 66,
      render(host) {
        api.ui.buildForm(host, manifest.config, api.config(), (v) => api.saveConfig(v))
        const row = document.createElement('div')
        row.className = 'lsb-actions'
        row.style.justifyContent = 'flex-start'
        row.style.borderTop = '0'
        const btn = document.createElement('button')
        btn.type = 'button'
        btn.className = 'lsb-btn is-primary'
        btn.textContent = '打开浮层'
        btn.addEventListener('click', () => openFloat())
        row.appendChild(btn)
        host.appendChild(row)
      },
    })
```

Do **not** use `api.ui.configTab`.

Replace `refreshViews`:

```js
    function refreshViews() {
      mountEmbed()
      const body = document.querySelector('.lsb-title-quotes-float-body')
      if (body) render(body)
    }
```

- [ ] **Step 4: Run test to verify it passes**

Run: `node --test --test-force-exit test/title-quotes.test.js`  
Expected: 全绿，包括交易页折叠用例。

- [ ] **Step 5: Commit**

Skip unless the user asked to commit.

---

### Task 4: 后台不写心跳；停用卸钮

**Files:**
- Modify: `test/title-quotes.test.js`
- Modify: `plugins/title-quotes.user.js`（`visibilitychange`；确认 `writeWatchBeat` 守门；dispose 已在 Task 2）

**Interfaces:**
- Consumes: Task 2 `writeWatchBeat`、`startBeatTimer`、`stopBeatTimer`、`closeFloat` 的 `id` 判断
- Produces: `document.addEventListener('visibilitychange', onVis)`：隐藏则 `stopBeatTimer()` 且不写 store；回到可见且 `floatOpen` 则 `startBeatTimer()`。关闭时别人的 `watchBeat.id` 不得被置 0。

- [ ] **Step 1: Write the failing test**

```js
function setPageHidden(w, hidden) {
  Object.defineProperty(w.document, 'hidden', { configurable: true, get: () => hidden })
  Object.defineProperty(w.document, 'visibilityState', {
    configurable: true,
    get: () => (hidden ? 'hidden' : 'visible'),
  })
}

test('称号行情：隐藏页不续写在看心跳', async () => {
  const { w, dbg } = await boot()
  await dbg.openFloat()
  const t1 = dbg.watchBeat().t
  assert.ok(t1 > 0)
  setPageHidden(w, true)
  w.document.dispatchEvent(new w.Event('visibilitychange'))
  const tFrozen = dbg.watchBeat().t
  dbg.writeWatchBeat()
  assert.equal(dbg.watchBeat().t, tFrozen)
  setPageHidden(w, false)
  w.document.dispatchEvent(new w.Event('visibilitychange'))
  assert.ok(dbg.watchBeat().t >= tFrozen)
  assert.equal(dbg.watching(), true)
})

test('称号行情：关闭只清自己的心跳', async () => {
  const { dbg } = await boot()
  await dbg.openFloat()
  dbg.setWatchBeat({ t: Date.now(), id: 'other-tab' })
  dbg.closeFloat()
  assert.equal(dbg.watchBeat().id, 'other-tab')
  assert.ok(dbg.watchBeat().t > 0)
})

test('称号行情：停用后卸浮层和钮', async () => {
  const { w, dbg } = await boot()
  await dbg.openFloat()
  w.LSB.disable('title-quotes')
  assert.equal(w.document.querySelector('.lsb-title-quotes-fab'), null)
  assert.equal(w.document.querySelector('.lsb-title-quotes-float'), null)
})
```

- [ ] **Step 2: Run test to verify it fails**

Run: `node --test --test-force-exit test/title-quotes.test.js`  
Expected: 隐藏/停用至少一条红（若 Task 2 的 dispose 已卸钮，停用可能已绿；隐藏续写必须红直到 `onVis`）。

- [ ] **Step 3: Write minimal implementation**

```js
    function onVis() {
      if (!api.store.get('floatOpen')) return
      if (pageVisible()) startBeatTimer()
      else stopBeatTimer()
    }
    document.addEventListener('visibilitychange', onVis)
```

`onDispose` 里 `document.removeEventListener('visibilitychange', onVis)`。

`writeWatchBeat` 已有 `pageVisible()` 早退。`closeFloat` 已有 `beat.id === tabId` 才置 0。

- [ ] **Step 4: Run test to verify it passes**

Run: `node --test --test-force-exit test/title-quotes.test.js`  
Expected: 全绿。

- [ ] **Step 5: Commit**

Skip unless the user asked to commit.

---

### Task 5: 氢壳左栏改 RPC

**Files:**
- Modify: `test/skin.test.js`（现有「左栏工具打开 … 称号行情」用例）
- Modify: `plugins/skin.user.js`（`collectTools`、`renderLinks`、rail click；`@version` 与 `manifest.version` → `1.1.43`）

**Interfaces:**
- Consumes: Task 2 `title-quotes:open`
- Produces: 工具项 `{ plugin: 'title-quotes', rpc: 'title-quotes:open', label: '称号行情' }`；按钮 `data-lsb-rpc`；点击 `api.request`；无 `data-lsb-panel="title-quotes"`

- [ ] **Step 1: Write the failing test**

In `test/skin.test.js` test `氢壳：左栏工具打开 AI 历史 / 签到日历 / 积分趋势 / 称号行情 / 年度报告` replace the labels collection and add quotes assertions. Keep calendar / AI 历史 clicks.

```js
  const tools = shell(w).querySelector('[data-lsb-shell-section="tools"]')
  const labels = [...tools.querySelectorAll('.lsb-shell-link')].map((b) => b.textContent.trim())
  assert.deepEqual(labels, ['AI 历史', '签到日历', '积分趋势', '称号行情', '年度报告'])
  assert.equal(tools.querySelector('[data-lsb-panel="title-quotes"]'), null)
  const quotes = tools.querySelector('[data-lsb-rpc="title-quotes:open"]')
  assert.ok(quotes)
  quotes.click()
  assert.ok(w.document.querySelector('.lsb-title-quotes-float'), '左栏应开浮层')
  assert.equal(w.document.querySelector('.lsb-panel-settings'), null, '不应打开氢设置面板')
```

Calendar click still uses `[data-lsb-panel="checkin-calendar"]`.

- [ ] **Step 2: Run test to verify it fails**

Run: `node --test --test-force-exit test/skin.test.js`  
Expected: 该用例 FAIL（仍是 `data-lsb-panel="title-quotes"`）。

- [ ] **Step 3: Write minimal implementation**

`collectTools` list item and map:

```js
        { plugin: 'title-quotes', rpc: 'title-quotes:open', label: '称号行情' },
```

```js
        .map(({ panel, rpc, label }) => (rpc ? { rpc, label } : { panel, label }))
```

`renderLinks` — **before** `if (link.panel)`:

```js
          if (link.rpc) {
            return `<button type="button" class="lsb-shell-link" data-lsb-rpc="${esc(link.rpc)}"><span class="lsb-shell-link-label">${esc(link.label)}</span></button>`
          }
```

Rail click in `ensureShell` (the listener is only bound when the shell is first created). Change handler to:

```js
      el.querySelector('#lsb-shell-rail').addEventListener('click', (e) => {
        const rpcBtn = e.target.closest('[data-lsb-rpc]')
        if (rpcBtn) {
          e.preventDefault()
          api.request(rpcBtn.getAttribute('data-lsb-rpc'))
          return
        }
        const btn = e.target.closest('[data-lsb-panel]')
        if (!btn) return
        e.preventDefault()
        api.ui.openPanel(btn.getAttribute('data-lsb-panel'))
      })
```

Bump skin `// @version` and `manifest.version` to `1.1.43`.

- [ ] **Step 4: Run tests to verify they pass**

Run: `node --test --test-force-exit test/skin.test.js`  
Then: `node --test --test-force-exit test/title-quotes.test.js`  
Expected: 全绿。

- [ ] **Step 5: Commit**

Skip unless the user asked to commit.

---

### Task 6: 版本、文档、氧包

**Files:**
- Modify: `plugins/title-quotes.user.js` `@version`、`manifest.version`、`@description` / `manifest.description`（提到全站浮层）
- Modify: `build-suite.mjs` `SUITE_VERSION = '1.0.85'`
- Modify: `suite/suite-center.js` `version: '1.0.85'`
- Modify: `README.md` 称号行情一行
- Modify: `docs/CONVENTIONS.md` 氧 **1.0.85**
- Modify: `docs/已知问题-rc.md` 标题与「称号行情」条（浮层 + 折叠）
- Modify: `docs/测试招募-氢氧-beta.md` 氧 **1.0.85**；检查项补浮层
- Modify: `docs/功能征集-rc-ga.md` 氧 1.0.85；「称号行情（含分析大盘）」改为含全站浮层
- Run: `node build-suite.mjs`（不要 `build.mjs`）

**Interfaces:**
- Consumes: Task 1–5 行为已在源插件里
- Produces: title-quotes `1.0.11`；皮肤已在 Task 5 为 `1.1.43`；氧 `1.0.85`；`dist/linuxsb-suite.user.js` 含上述版本；氢产物不改

- [ ] **Step 1: Bump plugin + suite + docs**

title-quotes header and manifest → `1.0.11`. Description include「全站浮层；打开时巡检加快」。

README 那一行改为（仍一行表格）：

`采集挂单高低与中位；全场折线 + 各称号 K/折线；交易页折叠与全站浮层可切分析大盘；浮层打开时选主最多 10 秒一轮；氧面板为间隔设置`

`docs/CONVENTIONS.md`：`氧 **1.0.84**` → `**1.0.85**`（§2.2 那句）。

`docs/已知问题-rc.md` 标题 `氧 1.0.84` → `1.0.85`。称号行情条补一句：图也在全站浮层（右下「行情」/左栏），氧面板不再画 K。

`docs/测试招募-氢氧-beta.md` 表内氧 **1.0.85**。检查项「称号行情」改为：右下「行情」打开浮层；`/gacha_market` 折叠仍在；大盘在浮层或折叠里能看到指数和榜。

`docs/功能征集-rc-ga.md`：`氧 1.0.84` → `1.0.85`；已有列表「称号行情（含分析大盘）」→「称号行情（含分析大盘与全站浮层）」。

- [ ] **Step 2: Build suite**

Run: `node build-suite.mjs`  
Expected: 打印含 `v1.0.85`；banner 含 `LSB·称号行情 v1.0.11` 与 `LSB·界面精修 v1.1.43`。

- [ ] **Step 3: Run full plugin tests**

Run: `node --test --test-force-exit test/title-quotes.test.js`  
Run: `node --test --test-force-exit test/skin.test.js`  
If the repo usually gates RC with the whole suite, also: `node --test --test-force-exit`  
Expected: 全绿。不要跑 `build.mjs`。

- [ ] **Step 4: Commit**

Skip unless the user asked to commit.

---

## Spec coverage (self-review)

| Spec | Task |
|---|---|
| 全站浮层 + 三入口（钮 / 左栏 / 面板按钮） | 2, 3, 5 |
| 交易页折叠保留、同 `render` / `series` | 3（不改 embed）；旧折叠测试 |
| 打开时 `min(10s, 配置)`；关着走配置 | 1, 2 |
| 心跳 TTL 15s、5s 续期、隐藏不写 | 1, 2, 4 |
| 关 B 不清 A 的 beat | 4 |
| `scheduleNext` 不因 5s 续期重置 | 2 `armedMs` |
| 收起仍在看；关闭才不算 | 2 |
| 持久化位置/大小/开着 | 2 |
| Esc 不抢氢面板 | 2 |
| 面板 buildForm + 打开浮层，不用 configTab | 3 |
| `title-quotes:open`；皮肤 `data-lsb-rpc` | 2, 5 |
| 停用卸钮/浮层 | 2 dispose + 4 测试 |
| z-index / FAB 在 H 左 / 实底 / 最小 360×280 | 2 CSS |
| 版本 1.0.11 / 皮肤 1.1.43 / 氧 1.0.85 / 氢不动 | 5, 6 |
| 现有画图测试改浮层 | 3 |
| 不测拖拽像素 | —（代码在 Task 2，无像素断言） |
