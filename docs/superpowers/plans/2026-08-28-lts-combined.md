# LTS Combined Script Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 打出一份精简 `dist/linuxsb-lts.user.js`（基座 + `ORDER_LTS`），装这一个即可顶氢+氧的日常浏览；已有 LSB 时整段停住并提示先卸氢和氧。

**Architecture:** `suite/order.js` 增加 `ORDER_LTS`。`build-lts.mjs` 剥氢头后包进 LTS 头与包装 IIFE，模块按 `ORDER_LTS` 从 `plugins/` 拼接（不要整份氧全家桶），套件中心注入 `ORDER_LTS`。包装层在跑基座之前设 `W.__LSB_CHANNEL__='lts'` 与 `W.__LSB_LTS_VERSION__`。`src/check-update.js` / `src/core.js` 读这两个键：LTS 面板标题与检查更新只一行；未设时开发线行为不变。

**Tech Stack:** Node ESM 构建、jsdom `node:test`、现有氢油猴头（grant / connect / document-start）。

## Global Constraints

- 氢不抬到 `1.0.0`；`LSB.version` 仍是氢 `VERSION`；改了 `src/` 则氢 `0.1.33` → `0.1.34`
- 氧 `SUITE_VERSION` 不因「会打进 LTS」单独加号；LTS `@version` = 当时氧头 `@version`
- 不要水/H₂O；开发线氢/氧仍名「（RC）」；不要 `@updateURL`
- LTS **不收录**：`title-quotes`、`forum-watch`、`ai-summary`、`my-archive`、`hot-floor-badge`、`perf-probe`、`hover-profile`、`local-bridge`（源码不进包）
- LTS **收录** `ORDER_LTS`：`floor-stats`、`resume-reading`、`read-mark`、`home-return`、`topic-preview`、`unread-sentinel`、`checkin-calendar`、`points-ledger`、`data-migration`、`annual-report`、`skin`、`live-feed`
- 撞车文案固定：`请先在油猴里关掉或卸掉「LINUX.SB 氢」和「LINUX.SB 氧」，只留 LINUX.SB（LTS）。`
- 插件 UTF-8 无 BOM、LF；Windows 终端不要用 `&&`（npm scripts 里的 `&&` 可以留）
- 不要 git commit，除非用户在对话里明确要求提交

---

### Task 1: 频道探测与 LTS 商店条目

**Files:**
- Modify: `src/check-update.js`
- Test: `test/check-update.test.js`

**Interfaces:**
- Consumes: 现有 `SCRIPTS` 氢/氧两条
- Produces:
  - `SCRIPTS` 增加 `{ id: 'lts', gfId: null, label: 'LTS', installUrl: '' }`
  - `hostWindow()` → `unsafeWindow` 或 `window` 或 `globalThis`
  - `isLtsChannel(win = hostWindow())` → `win.__LSB_CHANNEL__ === 'lts'`
  - `ltsDisplayVersion(win = hostWindow())` → 非空字符串或 `''`

- [ ] **Step 1: Write the failing test**

在 `test/check-update.test.js` 追加：

```javascript
test('检查更新：LTS 条目默认无商店号', () => {
  const l = SCRIPTS.find((s) => s.id === 'lts')
  assert.equal(l.gfId, null)
  assert.equal(l.label, 'LTS')
  assert.equal(l.installUrl, '')
})

test('检查更新：isLtsChannel 只认 __LSB_CHANNEL__ === lts', async () => {
  const { isLtsChannel, ltsDisplayVersion, hostWindow } = await import('../src/check-update.js')
  const w = hostWindow()
  const prevC = w.__LSB_CHANNEL__
  const prevV = w.__LSB_LTS_VERSION__
  try {
    w.__LSB_CHANNEL__ = undefined
    assert.equal(isLtsChannel(w), false)
    w.__LSB_CHANNEL__ = 'lts'
    w.__LSB_LTS_VERSION__ = '1.0.100'
    assert.equal(isLtsChannel(w), true)
    assert.equal(ltsDisplayVersion(w), '1.0.100')
    w.__LSB_LTS_VERSION__ = ''
    assert.equal(ltsDisplayVersion(w), '')
  } finally {
    w.__LSB_CHANNEL__ = prevC
    w.__LSB_LTS_VERSION__ = prevV
  }
})
```

并从 `src/check-update.js` 增加 import：`hostWindow, isLtsChannel, ltsDisplayVersion`（若 Step 1 因未导出而 error，先让测试写上，Step 2 确认失败原因）。

- [ ] **Step 2: Run test to verify it fails**

Run: `node --test --test-force-exit test/check-update.test.js`

Expected: FAIL（没有 `lts` 条目或未导出函数）。

- [ ] **Step 3: Write minimal implementation**

`src/check-update.js` 的 `SCRIPTS` 末尾增加 LTS 对象。文件末尾：

```javascript
export function hostWindow() {
  if (typeof unsafeWindow !== 'undefined') return unsafeWindow
  if (typeof window !== 'undefined') return window
  return globalThis
}

export function isLtsChannel(win = hostWindow()) {
  return !!win && win.__LSB_CHANNEL__ === 'lts'
}

export function ltsDisplayVersion(win = hostWindow()) {
  const v = win && win.__LSB_LTS_VERSION__
  return typeof v === 'string' && v.trim() ? v.trim() : ''
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `node --test --test-force-exit test/check-update.test.js`

Expected: PASS。

---

### Task 2: LTS 面板标题与检查更新一行

**Files:**
- Modify: `src/core.js`（构造 UI 的 title/version；`_renderUpdateTab`）
- Test: `test/core.test.js`

**Interfaces:**
- Consumes: `isLtsChannel`、`ltsDisplayVersion`、`SCRIPTS` 的 `lts`
- Produces: channel 为 lts 时面板标题 `LINUX.SB · LTS`、`.lsb-ver` 为 `ltsDisplayVersion()`；检查更新只有 `[data-script="lts"]`；`gfId == null` 点按钮不调用 `net.json`

- [ ] **Step 1: Write the failing tests**

`test/core.test.js` 的 `beforeEach` 在 `installDom()` 之后加上：

```javascript
delete globalThis.__LSB_CHANNEL__
delete globalThis.__LSB_LTS_VERSION__
if (globalThis.window) {
  delete globalThis.window.__LSB_CHANNEL__
  delete globalThis.window.__LSB_LTS_VERSION__
}
```

追加：

```javascript
test('检查更新：LTS 频道只一行且 gfId 为空不请求', async () => {
  window.__LSB_CHANNEL__ = 'lts'
  window.__LSB_LTS_VERSION__ = '1.0.100'
  const core = boot()
  let n = 0
  core.net.json = async () => {
    n++
    return { version: '9.9.9', url: 'https://example.invalid' }
  }
  assert.match(core.ui._launcher.title, /LTS/)
  assert.match(document.querySelector('.lsb-ver') ? '' : core.ui.version, /1\.0\.100/)
  core.ui.openPanel()
  assert.match(document.querySelector('.lsb-panel-head').textContent, /LINUX\.SB · LTS/)
  assert.match(document.querySelector('.lsb-ver').textContent, /1\.0\.100/)
  core.ui.openPanel('__core_updates')
  const view = document.querySelector('.lsb-view')
  assert.ok(view.querySelector('[data-script="lts"]'))
  assert.equal(view.querySelector('[data-script="hydrogen"]'), null)
  assert.equal(view.querySelector('[data-script="oxygen"]'), null)
  assert.doesNotMatch(view.textContent, /两个都要装/)
  assert.match(view.textContent, /LTS 商店页公布后即可对照/)
  await view.querySelector('[data-check]').onclick()
  assert.equal(n, 0)
})
```

打开面板后 `.lsb-ver` 才进 DOM；断言标题用 `openPanel()` 后的 `.lsb-panel-head`，不要依赖启动时不存在的节点。删掉上面那行对空 `.lsb-ver` 的拙劣断言，只保留 `openPanel` 之后的检查。

现有「打开面板不联网；氧未装显示未安装」必须仍过（channel 已清）。

- [ ] **Step 2: Run test to verify it fails**

Run: `node --test --test-force-exit --test-name-pattern "LTS 频道只一行" test/core.test.js`

Expected: FAIL，面板仍是「氢（RC）」或检查更新仍两行。

- [ ] **Step 3: Write minimal implementation**

`src/core.js` 从 `check-update.js` 再导入 `isLtsChannel, ltsDisplayVersion`。

构造 UI：

```javascript
this.ui = new UI({
  title: isLtsChannel() ? 'LINUX.SB · LTS' : 'LINUX.SB · 氢（RC）',
  version: isLtsChannel() ? ltsDisplayVersion() || VERSION : VERSION,
})
```

`_renderUpdateTab`：若 `isLtsChannel()`，`scripts` 只用 `lts`；`snapshot` 为 `{ lts: { local: ltsDisplayVersion() || VERSION, missing: false } }`；`paint` 只 `row('lts')`；页脚 `'安装仍由油猴接管。请只留 LINUX.SB（LTS），不要同时开氢或氧。'`；`badgeText` 增加 `unlisted: ''`；`desc` 在 `st.status === 'unlisted'` 时返回 `'LTS 商店页公布后即可对照'`。

`run` 在 LTS 时：`const script = scripts.lts`；若 `!script.gfId` 则 `paint({ lts: { status: 'unlisted' } })` 且 **不要** `loadOne`；否则只 `loadOne(script)` 一次。

非 LTS 路径保持现有氢+氧逻辑（含氧 missing 不请求 592915）。

- [ ] **Step 4: Run tests to verify they pass**

Run: `node --test --test-force-exit test/core.test.js test/check-update.test.js`

Expected: PASS。

---

### Task 3: 氢补丁号 0.1.34

**Files:**
- Modify: `src/core.js` `VERSION = '0.1.34'`
- Modify: `package.json` `"version": "0.1.34"`
- Modify: `docs/CONVENTIONS.md`、`docs/已知问题-rc.md` 标题、`docs/测试招募-氢氧-beta.md`、`docs/功能征集-rc-ga.md` 里的氢 **0.1.33** → **0.1.34**（氧号不动）

**Interfaces:**
- Consumes: Task 2 已改 `src/`
- Produces: 氢冻本号 0.1.34

- [ ] **Step 1: Bump and rebuild hydrogen**

改上述版本字符串。Run: `node build.mjs`

Expected: `dist/linuxsb-base.user.js` `@version 0.1.34`。

- [ ] **Step 2: Run core tests**

Run: `node --test --test-force-exit test/core.test.js`

Expected: PASS（检查更新用例用 `VERSION` 常量，会跟到 0.1.34）。

---

### Task 4: `build-lts.mjs` 与产物卫生

**Files:**
- Create: `build-lts.mjs`
- Modify: `suite/order.js`（导出 `ORDER_LTS`，顺序与 `ORDER` 相同，不含砍掉的 id）
- Modify: `package.json` `"build": "node build.mjs && node build-suite.mjs && node build-lts.mjs"`
- Test: `test/suite.test.js`

**Interfaces:**
- Consumes: `dist/linuxsb-base.user.js`、`dist/linuxsb-suite.user.js`（须先打氢和氧）
- Produces: `dist/linuxsb-lts.user.js`；包装内设置 `__LSB_CHANNEL__` / `__LSB_LTS_VERSION__`；撞车则 return

- [ ] **Step 1: Write the failing tests**

`test/suite.test.js` 顶部增加：

```javascript
const ltsCode = readFileSync(new URL('../dist/linuxsb-lts.user.js', import.meta.url), 'utf8')
```

若文件不存在，测试在 load 阶段 throw，即 RED。

追加（可与现有 Greasy Fork 用例放一起）：

```javascript
const LTS_COLLISION =
  '请先在油猴里关掉或卸掉「LINUX.SB 氢」和「LINUX.SB 氧」，只留 LINUX.SB（LTS）。'

test('Greasy Fork：LTS 产物一段头、document-start、含氢 grant、不含 local-bridge', () => {
  assert.equal([...ltsCode.matchAll(/\/\/ ==UserScript==/g)].length, 1)
  assert.match(ltsCode, /@name\s+LINUX\.SB（LTS）/)
  assert.match(ltsCode, /@name:en\s+LINUX\.SB \(LTS\)/)
  assert.match(ltsCode, /@run-at\s+document-start/)
  assert.match(ltsCode, /@grant\s+unsafeWindow/)
  assert.match(ltsCode, /@grant\s+GM_xmlhttpRequest/)
  assert.doesNotMatch(ltsCode, /@updateURL/)
  assert.match(ltsCode, /id: 'skin'/)
  assert.match(ltsCode, /id: 'live-feed'/)
  for (const id of ['local-bridge', 'title-quotes', 'forum-watch', 'ai-summary', 'my-archive', 'hot-floor-badge', 'perf-probe', 'hover-profile']) {
    assert.doesNotMatch(ltsCode, new RegExp(`id: '${id}'`))
  }
  assert.match(ltsCode, /__LSB_CHANNEL__\s*=\s*'lts'/)
  assert.match(ltsCode, LTS_COLLISION.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'))
})

test('产物可解析：LTS 也是合法 JS', () => {
  assert.doesNotThrow(() => new Function(ltsCode))
})
```

把现有「两个 dist 产物」用例扩成三个，或单独一条如上。

- [ ] **Step 2: Run test to verify it fails**

Run: `node --test --test-force-exit --test-name-pattern "LTS 产物" test/suite.test.js`

Expected: FAIL（没有 `linuxsb-lts.user.js`）。

- [ ] **Step 3: Write `ORDER_LTS` and `build-lts.mjs`**

`suite/order.js` 在 `ORDER` 之后增加：

```javascript
export const ORDER_LTS = [
  'floor-stats',
  'resume-reading',
  'read-mark',
  'home-return',
  'topic-preview',
  'unread-sentinel',
  'checkin-calendar',
  'points-ledger',
  'data-migration',
  'annual-report',
  'skin',
  'live-feed',
]
```

`build-lts.mjs`：

```javascript
#!/usr/bin/env node
import { readFileSync, writeFileSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { ORDER, ORDER_LTS } from './suite/order.js'

const __dirname = dirname(fileURLToPath(import.meta.url))
const COLLISION =
  '请先在油猴里关掉或卸掉「LINUX.SB 氢」和「LINUX.SB 氧」，只留 LINUX.SB（LTS）。'

function stripHeader(src) {
  const header = src.match(/^\/\/ ==UserScript==\r?\n[\s\S]*?\/\/ ==\/UserScript==\r?\n*/)
  if (!header) throw new Error('missing userscript header')
  return { header: header[0], body: src.slice(header[0].length) }
}

function rewriteBaseHeader(header, version, description, descriptionEn) {
  return header
    .replace(/@name\s+.*/, '@name         LINUX.SB（LTS）')
    .replace(/@name:en\s+.*/, '@name:en      LINUX.SB (LTS)')
    .replace(/@version\s+.*/, `@version      ${version}`)
    .replace(/@description\s+.*/, `@description  ${description}`)
    .replace(/@description:en\s+.*/, `@description:en  ${descriptionEn}`)
}

const missing = ORDER_LTS.filter((id) => !ORDER.includes(id))
if (missing.length) throw new Error('ORDER_LTS 必须是 ORDER 的子集：' + missing.join(','))

const base = readFileSync(join(__dirname, 'dist/linuxsb-base.user.js'), 'utf8')
const suiteBanner = readFileSync(join(__dirname, 'dist/linuxsb-suite.user.js'), 'utf8')
const baseParts = stripHeader(base)
const version = suiteBanner.match(/@version\s+([\d.]+)/)?.[1]
if (!version) throw new Error('suite @version missing')
const mods = ORDER_LTS.map((id) => {
  const raw = readFileSync(join(__dirname, 'plugins', `${id}.user.js`), 'utf8')
  return stripHeader(raw).body
})
const suiteCenter = readFileSync(join(__dirname, 'suite', 'suite-center.js'), 'utf8').replace(
  '__SUITE_MEMBERS__',
  JSON.stringify(ORDER_LTS),
)
const description =
  '【LTS】一份脚本含基座与精简功能包。请先卸掉「LINUX.SB 氢」和「LINUX.SB 氧」。冻新功能，只修阻断。'
const descriptionEn =
  '[LTS] Base + feature pack in one script. Uninstall Hydrogen and Oxygen first. Feature-frozen.'
const banner = rewriteBaseHeader(baseParts.header, version, description, descriptionEn)
const wrap = `${banner}
(function () {
  'use strict'
  var W = typeof unsafeWindow !== 'undefined' ? unsafeWindow : window
  try { if (W.self !== W.top) return } catch (e) { return }
  if (W.LSB && W.LSB.__core) {
    var MSG = ${JSON.stringify(COLLISION)}
    var show = function () {
      var d = W.document
      if (!d || !d.documentElement) return
      var el = d.createElement('div')
      el.setAttribute('data-lsb-lts-collision', '1')
      el.textContent = MSG
      el.setAttribute('style', 'position:fixed;z-index:2147483647;right:16px;bottom:16px;max-width:320px;padding:9px 12px;border-radius:8px;background:#fff;color:#222;font-size:13px;box-shadow:0 6px 18px rgba(0,0,0,.18)')
      d.documentElement.appendChild(el)
      W.setTimeout(function () { el.remove() }, 8000)
    }
    if (W.document && W.document.documentElement) show()
    else W.addEventListener('DOMContentLoaded', show, { once: true })
    return
  }
  W.__LSB_CHANNEL__ = 'lts'
  W.__LSB_LTS_VERSION__ = ${JSON.stringify(version)}
${baseParts.body}
${mods.join('\n;\n')}
${suiteCenter}
})()
`
writeFileSync(join(__dirname, 'dist/linuxsb-lts.user.js'), wrap)
console.log('✔ dist/linuxsb-lts.user.js  v' + version)
```

`package.json` 的 `build` 脚本末尾加上 `&& node build-lts.mjs`。

- [ ] **Step 4: Build and pass tests**

Run: `node build.mjs`  
Run: `node build-suite.mjs`  
Run: `node build-lts.mjs`  
Run: `node --test --test-force-exit --test-name-pattern "LTS 产物|产物可解析" test/suite.test.js`

Expected: 打印 LTS 版本；测试 PASS。氢头里的 `@description` 若 `replace` 只替第一行，确认 `rewriteBaseHeader` 没有把 grant 行吃掉。

---

### Task 5: 撞车停住 + 单装 LTS 激活精简集

**Files:**
- Test: `test/lts.test.js`（新建）
- Modify: 仅当 Task 4 包装层漏了 return 才改 `build-lts.mjs`

**Interfaces:**
- Consumes: `dist/linuxsb-lts.user.js`、`dist/linuxsb-base.user.js`、`ORDER_LTS`
- Produces: 先氢后 LTS 时模块数不翻倍且出现撞车文案；只 eval LTS 时 `ORDER_LTS` 全 active，砍掉的 id 不在 `info().plugins`

- [ ] **Step 1: Write the failing tests**

`test/lts.test.js`：

```javascript
import { test } from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { JSDOM } from 'jsdom'
import { ORDER_LTS as MEMBERS } from '../suite/order.js'

const ltsCode = readFileSync(new URL('../dist/linuxsb-lts.user.js', import.meta.url), 'utf8')
const baseCode = readFileSync(new URL('../dist/linuxsb-base.user.js', import.meta.url), 'utf8')
const topicHtml = readFileSync(new URL('./fixtures/topic1.html', import.meta.url), 'utf8')
const COLLISION =
  '请先在油猴里关掉或卸掉「LINUX.SB 氢」和「LINUX.SB 氧」，只留 LINUX.SB（LTS）。'

function site() {
  const dom = new JSDOM(topicHtml, { url: 'https://linux.sb/topic/1', runScripts: 'outside-only' })
  const w = dom.window
  w.unsafeWindow = w
  w.requestAnimationFrame = (fn) => setTimeout(() => fn(Date.now()), 0)
  w.fetch = async (url) => ({ status: 200, ok: true, url: String(url), text: async () => '' })
  w.localStorage.setItem('lsb_base:__core:rate', JSON.stringify(10))
  w.localStorage.setItem('lsb_base:__core:urlPoll', JSON.stringify(0))
  return w
}

test('LTS：先装氢再装 LTS 不得再注册一套模块，并提示卸氢氧', async () => {
  const w = site()
  w.eval(baseCode)
  await new Promise((r) => setTimeout(r, 40))
  const n = w.LSB.info().plugins.length
  w.eval(ltsCode)
  await new Promise((r) => setTimeout(r, 80))
  assert.equal(w.LSB.info().plugins.length, n)
  assert.match(w.document.documentElement.textContent, COLLISION)
  assert.ok(w.document.querySelector('[data-lsb-lts-collision]'))
})

test('LTS：只装这一份则 ORDER_LTS 全部激活，砍掉的不在，面板为 LTS', async () => {
  const w = site()
  w.eval(ltsCode)
  await new Promise((r) => setTimeout(r, 80))
  const byId = Object.fromEntries(w.LSB.info().plugins.map((p) => [p.id, p.state]))
  for (const id of MEMBERS) {
    assert.equal(byId[id], 'active', id)
  }
  assert.equal(byId.suite, 'active')
  for (const id of ['title-quotes', 'forum-watch', 'ai-summary', 'my-archive', 'hot-floor-badge', 'perf-probe', 'hover-profile']) {
    assert.equal(byId[id], undefined, id)
  }
  assert.equal(byId.suite, 'active')
  assert.equal(w.__LSB_CHANNEL__, 'lts')
  w.LSB.open()
  assert.match(w.document.querySelector('.lsb-panel-head').textContent, /LINUX\.SB · LTS/)
  const suiteVer = readFileSync(new URL('../dist/linuxsb-suite.user.js', import.meta.url), 'utf8')
    .match(/@version\s+([\d.]+)/)[1]
  assert.match(w.document.querySelector('.lsb-ver').textContent, new RegExp(suiteVer.replace(/\./g, '\\.')))
  assert.equal(w.LSB.version, w.LSB.info().version)
})
```

- [ ] **Step 2: Run test to verify it fails**

Run: `node --test --test-force-exit test/lts.test.js`

Expected: 若包装层已正确，可能已 PASS；若 `eval` 氢后再 eval LTS 仍执行氧模块则 FAIL。FAIL 才改包装；已 PASS 则不要改行为。

- [ ] **Step 3: Fix wrapper only if needed**

保证撞车分支在插入基座/氧正文 **之前** `return`。不要靠 `entry.js` 的「已有 LSB 则 return」。

- [ ] **Step 4: Re-run**

Run: `node --test --test-force-exit test/lts.test.js`

Expected: PASS。

---

### Task 6: 文档与全量验证

**Files:**
- Modify: `docs/CONVENTIONS.md` 2.2 节：氢 **0.1.34**；补 LTS：产物 `dist/linuxsb-lts.user.js`、油猴名 LINUX.SB（LTS）、须先卸氢氧、精简集（不写被砍模块）；商店 URL 未建页则写「Greasy Fork 页尚未公布」
- Modify: `docs/测试招募-氢氧-beta.md` 冻本表增加 LTS 一行；安装节注明与氢+氧二选一，并列出 LTS 不含行情/机会监控/AI 总结/个人存档/高频标记/探针/悬停画像
- Modify: `docs/功能征集-rc-ga.md` 氢号 0.1.34；已经有的列表可加「LTS 合一包（未上架商店前用 dist 安装）」
- Modify: `docs/已知问题-rc.md` 标题氢号
- Modify: `README.md` 方式 A 下增加 LTS 单文件；`npm run build` 注释含 `linuxsb-lts.user.js`

**Interfaces:**
- Consumes: Task 3 氢号、Task 4 产物名
- Produces: 文档与代码一致

- [ ] **Step 1: Edit docs as listed**

LTS 商店 URL 保持空描述，不要编造 Greasy Fork 数字。

- [ ] **Step 2: Full build and test**

Run: `npm test`

Expected: 全绿（含新建 `test/lts.test.js`）。`npm test` 前若 dist 过期，先 `npm run build`。

---

## Spec coverage

| Spec | Task |
|---|---|
| 合成产物、氢头、无 updateURL、ORDER_LTS、不含砍掉的模块 | 4 |
| 包装层撞车 return + 固定文案 | 4、5 |
| `__LSB_CHANNEL__` / `__LSB_LTS_VERSION__` | 4 |
| 面板 LTS 标题与氧号 | 2、5 |
| 检查更新一行、gfId null 不请求 | 1、2 |
| 开发线 RC 名称与双行检查更新；氧仍含全家桶 | 2 回归 + suite 旧用例 |
| 氢 0.1.34 | 3 |
| 文档（含精简集） | 6 |
| 先氢后 LTS 不重复注册 | 5 |
| 只装 LTS 则 ORDER_LTS 全 active，砍掉的不在 | 5 |
