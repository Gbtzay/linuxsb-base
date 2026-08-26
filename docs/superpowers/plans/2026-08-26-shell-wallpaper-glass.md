# 氢壳墙纸与液态玻璃 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 整页自定义墙纸（本地压缩图优先，否则 URL），氢壳顶栏 / 左栏 / 右栏改成一层液态玻璃；主栏保持实底可读。

**Architecture:** 全部做在 `plugins/skin.user.js`。墙纸用 `html` 上的 `--lsb-wallpaper` + class `lsb-skin-wallpaper-on` / `lsb-skin-glass-on`。本地 JPEG 进 IndexedDB `lsb_skin_wallpaper`（jsdom 无 IDB 时用内存 Map 同 API）。首屏 URL 闪底由 `src/shell-boot.js` 补。经 `skin:debug` 的 `op` 给测试调用压缩 / 本地图。

**Tech Stack:** Tampermonkey 油猴、CSS `backdrop-filter`、IndexedDB、JSDOM `node:test`、基座 `api.ui.configTab` / `api.store`（只存 URL）。

## Global Constraints

- 规格：`docs/superpowers/specs/2026-08-26-shell-wallpaper-glass-design.md`（逐条覆盖，禁止跑偏）
- 皮肤 `@version` = `manifest.version` = `1.1.36`；氧 `SUITE_VERSION` / `suite-center` = `1.0.56`；壳占位改了则氢 `src/core.js` `VERSION` 与 `package.json` = `0.1.18`
- UTF-8 无 BOM、LF；Windows PowerShell 不要用 `&&`，测试常需完整权限
- 类名只用已有 `lsb-skin-*` / `lsb-shell-*`；禁止 `discourse`、禁止 `animation: … infinite`、禁止视差
- 不把 Blob / data URL 写入 `lsb_base:*` 或配置迁移 JSON
- 不改 `site.js`；不新插件
- 未经用户明确要求不要 `git commit`
- 默认关：空 URL 且无本地图 = 现在的壳
- 插件文件与测试里的文案用中文

## Files

- Modify: `plugins/skin.user.js`（schema、CSS、applyWallpaper、IDB、设置页选图、debug、版本）
- Modify: `test/skin.test.js`（墙纸 / 玻璃 / 压缩 / 拆壳）
- Modify: `src/shell-boot.js`（宽屏首屏铺 URL）
- Modify: `src/core.js`、`package.json`（氢 0.1.18，仅当 boot 改了）
- Modify: `test/skin.test.js` 里壳占位用例（boot CSS 含 wallpaperUrl）
- Modify: `test/batch4.test.js` 或皮肤测试（导出不含 JPEG 二进制）
- Modify: `build-suite.mjs`、`suite/suite-center.js`（1.0.56）
- Modify: `README.md` 界面精修行补「可选墙纸 + 壳玻璃」

---

### Task 1: URL 墙纸 + 玻璃 class / CSS

**Files:** `test/skin.test.js`, `plugins/skin.user.js`

**Interfaces:**

- Consumes: 现有 `makeSite` / `loadBase` / `skinCss` / `PLUG`；`cfg.shell` 默认 true
- Produces: schema `wallpaperUrl`（text，默认 `''`，label `墙纸 URL`）；`html.lsb-skin-wallpaper-on` / `html.lsb-skin-glass-on`；`--lsb-wallpaper`；`applyWallpaper()`；`cssUrl(u)` → `url(${JSON.stringify(u)})`

墙纸 URL 测试里要 stub `Image`，避免 jsdom 对假地址 `onerror` 把玻璃拆掉：

```js
function quietImage(w) {
  w.Image = class {
    set src(_v) {}
    addEventListener() {}
  }
}
```

- [ ] **Step 1: 写失败测试**（接在 `test/skin.test.js` 氢壳 z-index / 灯箱用例附近）

```js
test('墙纸：默认不开 class，壳仍是现在的实底策略', async () => {
  const { w } = makeSite()
  await loadBase(w, PLUG('skin.user.js'))
  const markers = [...w.document.documentElement.classList]
  assert.ok(!markers.includes('lsb-skin-wallpaper-on'))
  assert.ok(!markers.includes('lsb-skin-glass-on'))
  const compact = skinCss(w).replace(/\s+/g, '')
  assert.match(compact, /#lsb-shell-rail\{[^}]*background:var\(--bg/)
})

test('墙纸：只填 URL 则开墙纸与玻璃，主栏不 blur', async () => {
  const { w } = makeSite({ 'lsb_base:skin:__config': { wallpaperUrl: 'https://example.com/w.jpg' } })
  quietImage(w)
  await loadBase(w, PLUG('skin.user.js'))
  const root = w.document.documentElement
  assert.ok(root.classList.contains('lsb-skin-wallpaper-on'))
  assert.ok(root.classList.contains('lsb-skin-glass-on'))
  assert.match(root.style.getPropertyValue('--lsb-wallpaper'), /example\.com\/w\.jpg/)
  const compact = skinCss(w).replace(/\s+/g, '')
  assert.match(compact, /html\.lsb-skin-wallpaper-on\{[^}]*background-image:var\(--lsb-wallpaper\)/)
  assert.match(compact, /html\.lsb-skin-glass-on#lsb-shell-header\{[^}]*backdrop-filter:blur\(22px\)/)
  assert.match(compact, /html\.lsb-skin-glass-on#lsb-shell-rail\{[^}]*backdrop-filter:blur\(22px\)/)
  assert.match(compact, /html\.lsb-skin-glass-on#lsb-shell-aside\{[^}]*backdrop-filter:blur\(22px\)/)
  assert.doesNotMatch(compact, /main\.wrap\{[^}]*backdrop-filter/)
  assert.match(compact, /html\.lsb-skin-wallpaper-onmain\.wrap\{[^}]*background:var\(--panel/)
  assert.match(compact, /html\.lsb-skin-glass-on#lsb-shell-rail\{[^}]*top:var\(--lsb-shell-header\)/)
})
```

注意 compact 会吃掉选择器空格：`html.lsb-skin-glass-on #lsb-shell-header` → `html.lsb-skin-glass-on#lsb-shell-header`。正则按 compact 后写。

- [ ] **Step 2: 跑测试确认红**

Run: `node --test --test-force-exit --test-name-pattern "墙纸：" test/skin.test.js`  
Expected: FAIL，没有 `lsb-skin-wallpaper-on` / 新 CSS

- [ ] **Step 3: 最小实现**

`manifest.config` 增加：

```js
wallpaperUrl: { type: 'text', label: '墙纸 URL', default: '' },
```

`applyMarkers` 末尾不要在这里塞墙纸 class。另写 `applyWallpaper()`，由 `restyle()` / `refreshShell()` / `applyAll()` 调用。

```js
const WALLPAPER_MAX_BYTES = 8 * 1024 * 1024
const WALLPAPER_MAX_EDGE = 1920
let localBlobUrl = ''

function cssUrl(u) {
  const s = String(u || '').trim()
  return s ? `url(${JSON.stringify(s)})` : ''
}

function wideShellOn() {
  return !!cfg.shell && window.matchMedia('(min-width: 900px)').matches
}

function reduceTransparency() {
  return window.matchMedia('(prefers-reduced-transparency: reduce)').matches
}

function applyWallpaper() {
  const root = document.documentElement
  const fromLocal = localBlobUrl
  const fromUrl = String(cfg.wallpaperUrl || '').trim()
  const src = fromLocal || (fromUrl ? cssUrl(fromUrl) : '')
  const on = !!(wideShellOn() && src)
  root.classList.toggle('lsb-skin-wallpaper-on', on)
  root.classList.toggle('lsb-skin-glass-on', on && !reduceTransparency())
  if (on) root.style.setProperty('--lsb-wallpaper', fromLocal ? `url(${JSON.stringify(fromLocal)})` : cssUrl(fromUrl))
  else root.style.removeProperty('--lsb-wallpaper')
}
```

`shellCss()` 追加（玻璃规则必须带 `html.lsb-skin-glass-on` 前缀，默认壳不变）：

```css
html.lsb-skin-wallpaper-on{
  background-image:var(--lsb-wallpaper);
  background-size:cover;
  background-position:center;
  background-attachment:fixed;
}
html.lsb-skin-wallpaper-on main.wrap,
html.lsb-skin-wallpaper-on .forum-main,
html.lsb-skin-wallpaper-on .home-shell,
html.lsb-skin-wallpaper-on ul.post-list{
  background:var(--panel,#fff);
}
html.lsb-skin-glass-on #lsb-shell-header,
html.lsb-skin-glass-on #lsb-shell-rail,
html.lsb-skin-glass-on #lsb-shell-aside{
  background:color-mix(in srgb,var(--panel,#fff) 58%,transparent);
  backdrop-filter:blur(22px) saturate(160%);
  -webkit-backdrop-filter:blur(22px) saturate(160%);
  border:1px solid color-mix(in srgb,var(--text,#222) 12%,transparent);
  box-shadow:inset 0 1px 0 color-mix(in srgb,var(--panel,#fff) 70%,#fff);
}
html.lsb-skin-glass-on #lsb-shell-rail{
  top:var(--lsb-shell-header);
}
html.lsb-skin-glass-on .lsb-shell-rail-scroll{padding-top:12px}
```

版本先改皮肤头与 manifest 到 `1.1.36`。

- [ ] **Step 4: 跑墙纸测试确认绿；顺带跑默认 markers 那条，确认没多 class**

Run: `node --test --test-force-exit --test-name-pattern "墙纸：|默认配置产出" test/skin.test.js`  
Expected: PASS

- [ ] **Step 5: Commit** — 跳过（用户未要求）

---

### Task 2: 关壳 / 停用 / 窄屏 / 减少透明度

**Files:** `test/skin.test.js`, `plugins/skin.user.js`

**Consumes:** Task 1 的 `applyWallpaper`、`wideShellOn`、`reduceTransparency`  
**Produces:** `teardownWallpaper()`：去两个 class、`removeProperty('--lsb-wallpaper')`、revoke `localBlobUrl`（变量清空，IDB 仍留到 Task 4）

- [ ] **Step 1: 写失败测试**

关壳不要乱 emit。preload 里带 `shell: false`，或照现有「停用后去掉 html 状态类」那样 `disable`。

```js
test('墙纸：关壳不挂墙纸 class', async () => {
  const { w } = makeSite({ 'lsb_base:skin:__config': { shell: false, wallpaperUrl: 'https://example.com/w.jpg' } })
  quietImage(w)
  await loadBase(w, PLUG('skin.user.js'))
  const root = w.document.documentElement
  assert.ok(!root.classList.contains('lsb-skin-wallpaper-on'))
  assert.ok(!root.classList.contains('lsb-skin-glass-on'))
  assert.equal(root.style.getPropertyValue('--lsb-wallpaper'), '')
})

test('墙纸：停用皮肤拆净 class 与变量', async () => {
  const { w, tick } = makeSite({ 'lsb_base:skin:__config': { wallpaperUrl: 'https://example.com/w.jpg' } })
  quietImage(w)
  await loadBase(w, PLUG('skin.user.js'))
  w.LSB.disable('skin')
  await tick(30)
  const root = w.document.documentElement
  assert.ok(![...root.classList].some((c) => c === 'lsb-skin-wallpaper-on' || c === 'lsb-skin-glass-on'))
  assert.equal(root.style.getPropertyValue('--lsb-wallpaper'), '')
})

test('墙纸：窄于 900 不挂 class', async () => {
  const { w } = makeSite({ 'lsb_base:skin:__config': { wallpaperUrl: 'https://example.com/w.jpg' } })
  quietImage(w)
  w.matchMedia = (q) => ({
    matches: String(q).includes('min-width: 900px') ? false : false,
    media: q,
    addEventListener() {},
    removeEventListener() {},
    addListener() {},
    removeListener() {},
  })
  await loadBase(w, PLUG('skin.user.js'))
  assert.ok(!w.document.documentElement.classList.contains('lsb-skin-wallpaper-on'))
})

test('墙纸：减少透明度时有墙纸无玻璃', async () => {
  const { w } = makeSite({ 'lsb_base:skin:__config': { wallpaperUrl: 'https://example.com/w.jpg' } })
  quietImage(w)
  const orig = w.matchMedia.bind(w)
  w.matchMedia = (q) => {
    const s = String(q)
    if (s.includes('prefers-reduced-transparency')) {
      return { matches: true, media: q, addEventListener() {}, removeEventListener() {}, addListener() {}, removeListener() {} }
    }
    if (s.includes('min-width: 900px')) {
      return { matches: true, media: q, addEventListener() {}, removeEventListener() {}, addListener() {}, removeListener() {} }
    }
    return orig(q)
  }
  await loadBase(w, PLUG('skin.user.js'))
  const root = w.document.documentElement
  assert.ok(root.classList.contains('lsb-skin-wallpaper-on'))
  assert.ok(!root.classList.contains('lsb-skin-glass-on'))
})
```

`LSB.disable` 若不存在，用现有停用测试同样的写法（搜 `test/skin.test.js` 里 `plugin:disabled` / `disabled:skin`）。现有用例：

```js
test('界面精修：停用后去掉 html 状态类', ...)
```

照它的 disable 方式写「停用皮肤拆净」。

- [ ] **Step 2: 跑测试确认红**

Run: `node --test --test-force-exit --test-name-pattern "墙纸：关壳|墙纸：停用|墙纸：窄于|墙纸：减少" test/skin.test.js`

- [ ] **Step 3: 实现**

`teardownShell` 末尾调 `applyWallpaper()`（壳已关 → class 掉）。`api.onDispose` 已扫掉所有 `lsb-skin-*`，再 `removeProperty('--lsb-wallpaper')` 并 revoke blob URL。

`matchMedia` stub 必须在 `loadBase` 之前。jsdom 默认宽度通常 ≥900，所以窄屏测试一定要 stub。

- [ ] **Step 4: 测试绿**

Expected: PASS。再跑 `不是逛吧 Discourse 玻璃秀`，仍无 infinite。

- [ ] **Step 5: Commit** — 跳过

---

### Task 3: 压缩纯函数（超 8MB 拒绝、最长边 1920）

**Files:** `test/skin.test.js`, `plugins/skin.user.js`

**Produces:** `fileTooBig(file)`、`fitWithin(w, h, max = 1920)`、`compressWallpaper(file)` → `Promise<Blob>`；经 `skin:debug` 调用：

```js
api.handle('skin:debug', async (payload) => {
  const op = payload && payload.op
  if (op === 'fitWithin') return fitWithin(payload.w, payload.h, payload.max)
  if (op === 'fileTooBig') return fileTooBig(payload.file)
  if (op === 'compress') return compressWallpaper(payload.file)
  return snapshot() // 现有 debug 对象，并加 wallpaper: { hasLocal: !!localBlobUrl }
})
```

无 `op` 时保持旧测试 `dbg.markers` / `dbg.shell` 还能用（`request('skin:debug')` 的 payload 是 `null`/`undefined`）。

```js
function fileTooBig(file) {
  return !!(file && file.size > WALLPAPER_MAX_BYTES)
}

function fitWithin(width, height, max = WALLPAPER_MAX_EDGE) {
  const w = Number(width) || 0
  const h = Number(height) || 0
  if (w <= 0 || h <= 0) return { width: 0, height: 0 }
  if (w <= max && h <= max) return { width: w, height: h }
  if (w >= h) return { width: max, height: Math.max(1, Math.round((h * max) / w)) }
  return { width: Math.max(1, Math.round((w * max) / h)), height: max }
}

async function compressWallpaper(file) {
  if (!file) throw new Error('没有文件')
  if (fileTooBig(file)) throw new Error('图片超过 8MB')
  let bmp
  try {
    if (typeof createImageBitmap === 'function') bmp = await createImageBitmap(file)
    else throw new Error('no-bitmap')
  } catch {
    throw new Error('无法解码图片')
  }
  const { width, height } = fitWithin(bmp.width, bmp.height)
  const canvas = document.createElement('canvas')
  canvas.width = width
  canvas.height = height
  const ctx = canvas.getContext('2d')
  if (!ctx) {
    bmp.close?.()
    throw new Error('无法压缩图片')
  }
  ctx.drawImage(bmp, 0, 0, width, height)
  bmp.close?.()
  const blob = await new Promise((resolve, reject) => {
    canvas.toBlob((b) => (b ? resolve(b) : reject(new Error('无法压缩图片'))), 'image/jpeg', 0.72)
  })
  return blob
}
```

- [ ] **Step 1: 写失败测试**

```js
test('墙纸：超 8MB 拒绝；最长边限制 1920', async () => {
  const { w } = makeSite()
  await loadBase(w, PLUG('skin.user.js'))
  const big = { size: 8 * 1024 * 1024 + 1 }
  assert.equal(await w.LSB.bus.request('skin:debug', { op: 'fileTooBig', file: big }), true)
  assert.equal(await w.LSB.bus.request('skin:debug', { op: 'fileTooBig', file: { size: 10 } }), false)
  const fit = await w.LSB.bus.request('skin:debug', { op: 'fitWithin', w: 4000, h: 2000 })
  assert.equal(fit.width, 1920)
  assert.equal(fit.height, 960)
})
```

`clone`/`structuredClone` 对 `{size: n}` 纯对象没问题。不要传真 `File` 给 fileTooBig 测试。

可选：1×1 PNG 调 `compress`。jsdom 常没有真 canvas，允许抛 `无法压缩图片` / `无法解码图片`。不要为了测试去装 node-canvas。成功路径在浏览器里靠选文件。

- [ ] **Step 2: 红** — 无 `op` 分支会忽略 payload，返回 snapshot 对象，`fileTooBig === true` 失败

- [ ] **Step 3: 实现上述函数 + debug 分支**

- [ ] **Step 4: 绿**；确认无 `op` 的 `skin:debug` 仍含 `markers` / `shell`

- [ ] **Step 5: Commit** — 跳过

---

### Task 4: IndexedDB 本地图优先 + 设置页选文件

**Files:** `plugins/skin.user.js`, `test/skin.test.js`

**Produces:**

```js
const IDB_NAME = 'lsb_skin_wallpaper'
const IDB_STORE = 'files'
const IDB_KEY = 'wallpaper'
const memFiles = new Map() // indexedDB 缺失时

async function idbOpen() { /* IDBOpenRequest, store files */ }
async function wallpaperGet() { /* Blob | null；失败当 null */ }
async function wallpaperSet(blob) {}
async function wallpaperClear() {}
```

`jsdom` 通常没有 `indexedDB`：`wallpaperGet/Set/Clear` 走 `memFiles`。生产走 IDB。测试与浏览器同一套函数名。

启动：`setup` 末尾 `wallpaperGet().then(blob => { if (blob) { localBlobUrl = URL.createObjectURL(blob); applyWallpaper() } })`。

debug：

- `op: 'putLocal'` payload `{ blob }`（structuredClone 支持 Blob）→ set + object URL + applyWallpaper
- `op: 'clearLocal'` → clear IDB/mem、revoke、applyWallpaper

设置页：把 `api.ui.configTab` 改成带 `render`：

```js
api.ui.configTab({
  name: '界面精修',
  order: 80,
  render: (host) => {
    const box = document.createElement('div')
    box.className = 'lsb-field'
    box.innerHTML = '<span>本地墙纸</span>'
    const hint = document.createElement('p')
    hint.style.cssText = 'margin:4px 0 8px;color:var(--text-muted,#888);font-size:12px'
    hint.textContent = '本地图优先于 URL。图存在本机 IndexedDB，配置迁移带不走。'
    const input = document.createElement('input')
    input.type = 'file'
    input.accept = 'image/jpeg,image/png,image/webp,image/gif'
    input.addEventListener('change', async () => {
      const file = input.files && input.files[0]
      input.value = ''
      if (!file) return
      try {
        const blob = await compressWallpaper(file)
        await wallpaperSet(blob)
        if (localBlobUrl) URL.revokeObjectURL(localBlobUrl)
        localBlobUrl = URL.createObjectURL(blob)
        applyWallpaper()
        api.ui.toast('已使用本地墙纸', { type: 'success' })
      } catch (err) {
        api.ui.toast(String(err.message || err), { type: 'error' })
      }
    })
    const clearBtn = document.createElement('button')
    clearBtn.type = 'button'
    clearBtn.className = 'lsb-btn'
    clearBtn.textContent = '清除本地图'
    clearBtn.addEventListener('click', async () => {
      await wallpaperClear()
      if (localBlobUrl) URL.revokeObjectURL(localBlobUrl)
      localBlobUrl = ''
      applyWallpaper()
      api.ui.toast('已清除本地墙纸')
    })
    box.append(hint, input, clearBtn)
    host.appendChild(box)
  },
})
```

查 `api.ui.toast` 签名：`toast(msg, { type: 'error'|'success' })`（见 `src/ui.js`）。没有的字段就只传字符串。

- [ ] **Step 1: 写失败测试**

```js
test('墙纸：本地图优先于 URL', async () => {
  const { w, tick } = makeSite({ 'lsb_base:skin:__config': { wallpaperUrl: 'https://example.com/w.jpg' } })
  quietImage(w)
  await loadBase(w, PLUG('skin.user.js'))
  const blob = new w.Blob([new Uint8Array([0xff, 0xd8, 0xff])], { type: 'image/jpeg' })
  await w.LSB.bus.request('skin:debug', { op: 'putLocal', blob })
  await tick(30)
  const cssVar = w.document.documentElement.style.getPropertyValue('--lsb-wallpaper')
  assert.match(cssVar, /^url\("blob:/)
  assert.doesNotMatch(cssVar, /example\.com/)
})
```

设置页：打开氢面板皮肤 tab（仿 `氢壳：设置按钮打开氢面板`），断言有 `input[type=file][accept*="image/jpeg"]` 和按钮「清除本地图」。

- [ ] **Step 2: 红**

- [ ] **Step 3: 实现 IDB/mem、putLocal、configTab render、启动时 get**

打开 DB：

```js
function wallpaperGet() {
  if (typeof indexedDB === 'undefined') return Promise.resolve(memFiles.get(IDB_KEY) || null)
  return new Promise((resolve) => {
    const req = indexedDB.open(IDB_NAME, 1)
    req.onupgradeneeded = () => req.result.createObjectStore(IDB_STORE)
    req.onerror = () => resolve(null)
    req.onsuccess = () => {
      const db = req.result
      const tx = db.transaction(IDB_STORE, 'readonly')
      const g = tx.objectStore(IDB_STORE).get(IDB_KEY)
      g.onsuccess = () => resolve(g.result || null)
      g.onerror = () => resolve(null)
    }
  })
}
```

`onupgradeneeded` 里 `if (!db.objectStoreNames.contains(IDB_STORE)) createObjectStore`。

- [ ] **Step 4: 绿**

- [ ] **Step 5: Commit** — 跳过

---

### Task 5: URL 加载失败 toast，玻璃关掉，URL 留在配置

**Files:** `plugins/skin.user.js`, `test/skin.test.js`

**Produces:** `probeWallpaperUrl(url)`：`new Image()`；`onerror` → 若当前仍是该 URL 且无本地图：去掉玻璃与墙纸 class、`removeProperty`、`api.ui.toast('墙纸无法加载', { type: 'error' })`。onload 什么都不做。全程只 toast 一次（用 `let wallpaperErrTold = false`，换 URL 时清零）。

测试：自定义 `Image`，在 `src` setter 里 `queueMicrotask(() => this.onerror?.())`。

```js
test('墙纸：URL 失败则关玻璃，配置仍留 URL', async () => {
  const { w, tick } = makeSite({ 'lsb_base:skin:__config': { wallpaperUrl: 'https://example.com/missing.jpg' } })
  w.Image = class {
    set src(_v) { queueMicrotask(() => { this.onerror && this.onerror() }) }
  }
  await loadBase(w, PLUG('skin.user.js'))
  await tick(30)
  const root = w.document.documentElement
  assert.ok(!root.classList.contains('lsb-skin-glass-on'))
  assert.ok(!root.classList.contains('lsb-skin-wallpaper-on'))
  const dbg = await w.LSB.bus.request('skin:debug')
  assert.equal(dbg.active.wallpaperUrl, 'https://example.com/missing.jpg')
})
```

有本地图时 URL 失败探测不要拆墙纸（探测仅当 `!localBlobUrl`）。

- [ ] 红 → 实现 probe → 绿。Commit 跳过。

---

### Task 6: 壳占位首屏铺 URL；氢版本

**Files:** `src/shell-boot.js`, `src/core.js`, `package.json`, `test/skin.test.js`

**Consumes:** `rawGet('lsb_base:skin:__config').wallpaperUrl`  
**Produces:** `applyShellBoot` 每次按当前 URL **重写** `#lsb-shell-boot-style` 文本（不能再「已有 style 就 return」导致 URL 改了不更新）。仅 `min-width:900px` 的 `html.lsb-shell-boot` 写 `background-image`。

```js
function wallpaperBootCss(cfg) {
  const url = String(cfg && cfg.wallpaperUrl ? cfg.wallpaperUrl : '').trim()
  if (!url) return ''
  return `@media (min-width:900px){html.lsb-shell-boot{background-image:url(${JSON.stringify(url)});background-size:cover;background-position:center;background-attachment:fixed}}`
}
```

`VERSION = '0.1.18'`，`package.json` 同步。然后 `node build.mjs`。

测试扩「壳占位：仅基座就在首屏注入」：preload wallpaperUrl，断言 `bootCss(w)` 含 `example.com` 或你用的 URL。关壳 / 空 URL 不含 `background-image`。

- [ ] 红 → 改 boot（刷新 textContent）→ `node build.mjs` → 绿。Commit 跳过。

---

### Task 7: 导出不含图、README、氧版本、全量测试

**Files:** `test/skin.test.js` 或 `test/batch4.test.js`, `README.md`, `build-suite.mjs`, `suite/suite-center.js`

- [ ] **导出测试：** 先 `putLocal` 一个 Blob，再 `data-migration:debug` 的 `export()` 或 `JSON.stringify(localStorage)`，断言字符串不含 `\xff\xd8` 长串、不含 `data:image/jpeg;base64`。`lsb_base:` 键数量不因本地墙纸增加。

- [ ] README 界面精修行：在「氢壳」句后加「可选整页墙纸，顶栏 / 左栏 / 右栏液态玻璃；主栏实底。」仍写不抢主题配色。

- [ ] `SUITE_VERSION = '1.0.56'`，`suite-center` `version: '1.0.56'`

- [ ] `node build-suite.mjs` 然后：

```
node --test --test-force-exit --test-concurrency=4
```

Expected: 全绿，fail 0。氧产物头是 1.0.56，皮肤 banner 1.1.36，氢 0.1.18。

- [ ] Commit — 跳过

---

## Spec coverage

| 规格 | 任务 |
|---|---|
| 整页墙纸 cover/center/fixed、`--lsb-wallpaper` | 1 |
| 主栏实底 `--panel`、三块壳玻璃数值、左栏 top 对齐顶栏 | 1 |
| 默认关、无墙纸保持旧壳 | 1 |
| 关壳 / 停用拆净、&lt;900、减少透明度无玻璃 | 2 |
| 8MB / 1920 / JPEG 0.72 | 3 |
| IndexedDB `lsb_skin_wallpaper` / files / wallpaper；本地优先；设置页选图与清除 | 4 |
| URL onerror toast、配置保留 | 5 |
| shell-boot URL 首屏 | 6 |
| 迁移 JSON 无图、版本、README | 7 |
| 无 discourse / infinite / 视差 | 1 的 CSS + 现有玻璃秀测试 |
| GIF 变静帧 JPEG | 3 的 canvas 路径（jsdom 不强制成功） |

无 TBD。函数名全程 `applyWallpaper` / `fitWithin` / `fileTooBig` / `compressWallpaper` / `wallpaperGet|Set|Clear`，debug `op` 为 `fitWithin` | `fileTooBig` | `compress` | `putLocal` | `clearLocal`。
