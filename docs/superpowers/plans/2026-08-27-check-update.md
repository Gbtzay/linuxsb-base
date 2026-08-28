# 检查更新 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 氢面板增加「检查更新」页：点按钮对照 Greasy Fork 上的氢/氧版本，落后则给出商店安装链接。

**Architecture:** `src/check-update.js` 纯函数负责商店 URL、JSON 解析与 semver 分类；`core._renderUpdateTab` 画页并在点击时 `this.net.json(..., { external: true })`。氧是否安装看插件 `suite`。油猴负责真正安装。

**Tech Stack:** 现有氢 `src/` + jsdom `node:test`。不新建氧模块。

## Global Constraints

- Spec：`docs/superpowers/specs/2026-08-27-check-update-design.md`
- 氢 `VERSION` / `package.json` → `0.1.33`（Task 4 才改号）；氧 `1.0.83` 与 `ORDER` 不动
- 不写 `@updateURL`；不打开 `.user.js`；安装链是 Greasy Fork 商店页
- 点按钮才联网；无定时器、无油猴菜单、无氢壳左栏入口、无 store 缓存
- 源文件 UTF-8 无 BOM、LF；Windows 上不要用 `&&`（PowerShell 用分号或两条命令）
- 用户未明确要求则不要 `git commit`
- 文案锁定：按钮 `对照 Greasy Fork` / `查询中…`；徽章 `有更新` `已是最新` `比商店新` `未安装` `查询失败` `版本号无效`；安装 `打开安装页`；页脚 `安装仍由油猴接管；两个都要装，先氢后氧。`

## Files

- Create: `src/check-update.js`
- Create: `test/check-update.test.js`
- Modify: `src/core.js`（import、注册 `__core_updates`、`_renderUpdateTab`）
- Modify: `test/core.test.js`（四页断言 + 面板用例）
- Modify: `package.json`、`src/core.js` 的 `VERSION`（Task 4）
- Modify: `docs/CONVENTIONS.md`、`docs/已知问题-rc.md`、`docs/测试招募-氢氧-beta.md`、`docs/功能征集-rc-ga.md`
- Run: `node build.mjs`（氢产物；不要为这个功能跑 `build-suite.mjs`）

---

### Task 1: 纯函数 `src/check-update.js`

**Files:**
- Create: `test/check-update.test.js`
- Create: `src/check-update.js`

**Interfaces:**
- Consumes: `parseVersion` / `compareVersion` from `src/util.js`
- Produces: `SCRIPTS`, `gfJsonUrl`, `parseStoreScript`, `classifyVersion`, `localOxygenVersion`, `installHref`（签名与 spec 中代码块一致）

- [ ] **Step 1: Write the failing test**

Create `test/check-update.test.js`（UTF-8 无 BOM、LF）：

```js
import { test } from 'node:test'
import assert from 'node:assert/strict'
import {
  SCRIPTS,
  gfJsonUrl,
  parseStoreScript,
  classifyVersion,
  localOxygenVersion,
  installHref,
} from '../src/check-update.js'

test('检查更新：Greasy Fork JSON 地址与安装页', () => {
  const h = SCRIPTS.find((s) => s.id === 'hydrogen')
  const o = SCRIPTS.find((s) => s.id === 'oxygen')
  assert.equal(h.gfId, 592914)
  assert.equal(o.gfId, 592915)
  assert.equal(gfJsonUrl(592914), 'https://greasyfork.org/zh-CN/scripts/592914.json')
  assert.equal(gfJsonUrl(592915), 'https://greasyfork.org/zh-CN/scripts/592915.json')
  assert.equal(h.installUrl, 'https://greasyfork.org/zh-CN/scripts/592914-linux-sb-%E6%B0%A2-beta')
  assert.equal(o.installUrl, 'https://greasyfork.org/zh-CN/scripts/592915-linux-sb-%E6%B0%A7-beta')
})

test('检查更新：parseStoreScript 抽出 version / url；缺 version 为 null', () => {
  assert.deepEqual(parseStoreScript({ version: '0.1.32', url: 'https://greasyfork.org/zh-CN/scripts/592914' }), {
    version: '0.1.32',
    url: 'https://greasyfork.org/zh-CN/scripts/592914',
  })
  assert.equal(parseStoreScript({ url: 'https://x' }), null)
  assert.equal(parseStoreScript(null), null)
  assert.equal(parseStoreScript('0.1.32'), null)
})

test('检查更新：classifyVersion 落后 / 相同 / 比商店新 / 无效', () => {
  assert.equal(classifyVersion('0.1.31', '0.1.32'), 'behind')
  assert.equal(classifyVersion('0.1.32', '0.1.32'), 'equal')
  assert.equal(classifyVersion('0.1.33', '0.1.32'), 'ahead')
  assert.equal(classifyVersion('foo', '0.1.32'), 'invalid')
  assert.equal(classifyVersion('0.1.32', 'bar'), 'invalid')
})

test('检查更新：localOxygenVersion 看 suite，停用也算已装', () => {
  assert.equal(localOxygenVersion([{ id: 'suite', version: '1.0.83' }]), '1.0.83')
  assert.equal(localOxygenVersion([{ id: 'suite', version: '1.0.83', state: 'disabled' }]), '1.0.83')
  assert.equal(localOxygenVersion([{ id: 'title-quotes', version: '1.0.9' }]), null)
  assert.equal(localOxygenVersion([]), null)
})

test('检查更新：installHref 空 url 回退', () => {
  assert.equal(installHref({ version: '1', url: 'https://store/h' }, 'https://fallback'), 'https://store/h')
  assert.equal(installHref({ version: '1', url: '' }, 'https://fallback'), 'https://fallback')
  assert.equal(installHref(null, 'https://fallback'), 'https://fallback')
})
```

- [ ] **Step 2: Run test to verify it fails**

Run: `node --test --test-force-exit test/check-update.test.js`  
Expected: `ERR_MODULE_NOT_FOUND` for `../src/check-update.js`

- [ ] **Step 3: Write minimal implementation**

Create `src/check-update.js`（UTF-8 无 BOM、LF）。内容必须与 spec 代码块一致：

```js
import { parseVersion, compareVersion } from './util.js'

export const SCRIPTS = [
  {
    id: 'hydrogen',
    gfId: 592914,
    label: '氢',
    installUrl: 'https://greasyfork.org/zh-CN/scripts/592914-linux-sb-%E6%B0%A2-beta',
  },
  {
    id: 'oxygen',
    gfId: 592915,
    label: '氧',
    installUrl: 'https://greasyfork.org/zh-CN/scripts/592915-linux-sb-%E6%B0%A7-beta',
  },
]

export function gfJsonUrl(gfId) {
  return `https://greasyfork.org/zh-CN/scripts/${gfId}.json`
}

export function parseStoreScript(json) {
  if (!json || typeof json !== 'object') return null
  const version = typeof json.version === 'string' ? json.version.trim() : ''
  if (!version) return null
  const url = typeof json.url === 'string' ? json.url.trim() : ''
  return { version, url }
}

export function classifyVersion(local, store) {
  if (!parseVersion(local) || !parseVersion(store)) return 'invalid'
  const cmp = compareVersion(local, store)
  if (cmp < 0) return 'behind'
  if (cmp > 0) return 'ahead'
  return 'equal'
}

export function localOxygenVersion(plugins) {
  const suite = (plugins || []).find((p) => p.id === 'suite')
  return suite && suite.version ? String(suite.version) : null
}

export function installHref(parsed, fallback) {
  return (parsed && parsed.url) || fallback
}
```

- [ ] **Step 4: Run tests and make sure they pass**

Run: `node --test --test-force-exit test/check-update.test.js`  
Expected: 5 pass / 0 fail

- [ ] **Step 5: Commit**

Skip unless the user asked to commit.

---

### Task 2: 核心 tab 静态页（不联网）

**Files:**
- Modify: `test/core.test.js`
- Modify: `src/core.js`

**Interfaces:**
- Consumes: `SCRIPTS`, `localOxygenVersion` from `./check-update.js`；`VERSION`；`this.plugins`
- Produces: tab `{ id: '__core_updates', name: '检查更新', order: 3 }`；打开后两行 `data-script` + 按钮 `data-check`；此时不调用 `net.json`

- [ ] **Step 1: Write the failing tests**

In `test/core.test.js`，把启动用例里的三页断言改成四页（这一步会让现有用例先红，因为还没有第四页）：

```js
  assert.deepEqual(
    core.ui._tabs.map((t) => t.id),
    ['__core_plugins', '__core_settings', '__core_logs', '__core_updates'],
  )
```

在文件末尾追加（`boot` / `assert` / `VERSION` 已存在）：

```js
test('检查更新：打开面板不联网；氧未装显示未安装', () => {
  const core = boot()
  let n = 0
  core.net.json = async () => {
    n++
    return { version: '9.9.9', url: 'https://example.invalid' }
  }
  core.ui.openPanel('__core_updates')
  const view = document.querySelector('.lsb-view')
  assert.match(view.textContent, /对照 Greasy Fork/)
  assert.match(view.textContent, /安装仍由油猴接管；两个都要装，先氢后氧/)
  const h = view.querySelector('[data-script="hydrogen"]')
  const o = view.querySelector('[data-script="oxygen"]')
  assert.ok(h)
  assert.ok(o)
  assert.match(h.textContent, new RegExp(VERSION.replace(/\./g, '\\.')))
  assert.match(o.textContent, /未安装/)
  const inst = o.querySelector('[data-install]')
  assert.ok(inst)
  assert.equal(inst.getAttribute('href'), 'https://greasyfork.org/zh-CN/scripts/592915-linux-sb-%E6%B0%A7-beta')
  assert.equal(inst.getAttribute('target'), '_blank')
  assert.equal(n, 0)
})
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `node --test --test-force-exit test/core.test.js`  
Expected: 启动用例 deepEqual 失败（仍是三页），或「检查更新：打开面板」找不到 tab / 找不到 `data-script`。

- [ ] **Step 3: Write minimal implementation**

In `src/core.js`：

1. 增加 import：

```js
import {
  SCRIPTS,
  gfJsonUrl,
  parseStoreScript,
  classifyVersion,
  localOxygenVersion,
  installHref,
} from './check-update.js'
```

（`gfJsonUrl` 等 Task 3 才用；本任务可以先只 import `SCRIPTS` 与 `localOxygenVersion`，Task 3 再补其余。不要留未使用 import 若 lint 会吵——本仓库测试不跑 eslint，Task 2 可一次 import 全部。）

2. In `_registerCoreTabs`，在 `__core_settings` 块之后追加：

```js
    this.ui.registerTab({
      id: '__core_updates',
      name: '检查更新',
      order: 3,
      render: (host) => this._renderUpdateTab(host),
    })
```

3. 在 `_renderPluginList` 之前增加静态 `_renderUpdateTab`（Task 3 会替换成带查询的完整版；本任务必须已经画出行、按钮、页脚、氧未安装链接）：

```js
  _renderUpdateTab(host) {
    const oxVer = localOxygenVersion([...this.plugins.values()])
    const h = SCRIPTS.find((s) => s.id === 'hydrogen')
    const o = SCRIPTS.find((s) => s.id === 'oxygen')
    host.innerHTML =
      '<div class="lsb-actions" style="border:0;padding:0 0 8px;justify-content:flex-start">' +
      '<button class="lsb-btn is-primary" type="button" data-check>对照 Greasy Fork</button></div>' +
      rowHtml(h, VERSION, oxVer ? null : null) +
      rowHtml(o, oxVer, oxVer ? null : 'missing') +
      '<div class="lsb-row-desc">安装仍由油猴接管；两个都要装，先氢后氧。</div>'

    function rowHtml(script, local, status) {
      const badge =
        status === 'missing'
          ? '<span class="lsb-badge">未安装</span>'
          : ''
      const inst =
        status === 'missing'
          ? `<a class="lsb-btn is-primary" data-install href="${esc(script.installUrl)}" target="_blank" rel="noopener noreferrer">打开安装页</a>`
          : ''
      const ver = local ? `v${esc(local)}` : ''
      return `<div class="lsb-row" data-script="${esc(script.id)}">
        <div class="lsb-row-main">
          <div class="lsb-row-name">${esc(script.label)} ${ver ? `<span class="lsb-badge">${ver}</span>` : ''}${badge}</div>
        </div>${inst}</div>`
    }
  }
```

不要把 `rowHtml` 做成文件级函数；放在方法内即可。`esc` 已从 `./util.js` 导入。

- [ ] **Step 4: Run tests and make sure they pass**

Run: `node --test --test-force-exit test/core.test.js`  
Expected: 原有用例 + 新静态页用例全绿。

- [ ] **Step 5: Commit**

Skip unless the user asked to commit.

---

### Task 3: 点按钮查询、分类、失败隔离、in-flight

**Files:**
- Modify: `test/core.test.js`
- Modify: `src/core.js`（`_renderUpdateTab`）

**Interfaces:**
- Consumes: `this.net.json(url, { external: true })` → JSON 对象；`gfJsonUrl` / `parseStoreScript` / `classifyVersion` / `installHref`
- Produces: 氢始终请求；仅当 `localOxygenVersion` 非 null 时请求氧；结果徽章与安装链按 spec 表；`Promise.allSettled` 一行失败不影响另一行；连点复用 in-flight；换 tab 后丢弃过期结果（`wrap.isConnected` + generation）

- [ ] **Step 1: Write the failing tests**

Append to `test/core.test.js`：

```js
function bumpPatch(v) {
  const m = String(v).match(/^(\d+)\.(\d+)\.(\d+)/)
  return `${m[1]}.${m[2]}.${Number(m[3]) + 1}`
}

test('检查更新：有 suite 时两条 JSON 都带 external；氢落后给出安装链', async () => {
  const core = boot()
  core.register({ id: 'suite', name: '重装套件', version: '1.0.80' }, () => ({}))
  const calls = []
  const storeH = bumpPatch(VERSION)
  core.net.json = async (url, opts) => {
    calls.push({ url, external: opts?.external })
    if (String(url).includes('592914')) return { version: storeH, url: 'https://greasyfork.org/zh-CN/scripts/592914-h' }
    if (String(url).includes('592915')) return { version: '1.0.83', url: 'https://greasyfork.org/zh-CN/scripts/592915-o' }
    throw new Error('unexpected ' + url)
  }
  core.ui.openPanel('__core_updates')
  const view = document.querySelector('.lsb-view')
  await view.querySelector('[data-check]').onclick()
  assert.equal(calls.length, 2)
  assert.ok(calls.every((c) => c.external === true))
  assert.ok(calls.some((c) => c.url.includes('592914.json')))
  assert.ok(calls.some((c) => c.url.includes('592915.json')))
  const h = view.querySelector('[data-script="hydrogen"]')
  assert.match(h.textContent, /有更新/)
  const a = h.querySelector('[data-install]')
  assert.equal(a.getAttribute('href'), 'https://greasyfork.org/zh-CN/scripts/592914-h')
  const o = view.querySelector('[data-script="oxygen"]')
  assert.match(o.textContent, /有更新/)
})

test('检查更新：无 suite 不请求氧 JSON', async () => {
  const core = boot()
  const urls = []
  core.net.json = async (url) => {
    urls.push(url)
    return { version: VERSION, url: 'https://greasyfork.org/zh-CN/scripts/592914' }
  }
  core.ui.openPanel('__core_updates')
  await document.querySelector('[data-check]').onclick()
  assert.equal(urls.length, 1)
  assert.match(String(urls[0]), /592914\.json/)
  assert.doesNotMatch(urls.join(' '), /592915/)
})

test('检查更新：氢失败氧成功只脏氢这一行', async () => {
  const core = boot()
  core.register({ id: 'suite', name: '重装套件', version: '1.0.83' }, () => ({}))
  core.net.json = async (url) => {
    if (String(url).includes('592914')) throw new Error('HTTP 500')
    return { version: '1.0.83', url: 'https://greasyfork.org/zh-CN/scripts/592915' }
  }
  core.ui.openPanel('__core_updates')
  const view = document.querySelector('.lsb-view')
  await view.querySelector('[data-check]').onclick()
  assert.match(view.querySelector('[data-script="hydrogen"]').textContent, /查询失败/)
  assert.match(view.querySelector('[data-script="hydrogen"]').textContent, /无法读取 Greasy Fork/)
  assert.match(view.querySelector('[data-script="oxygen"]').textContent, /已是最新/)
})

test('检查更新：连点不重复请求', async () => {
  const core = boot()
  let n = 0
  let release
  const gate = new Promise((r) => {
    release = r
  })
  core.net.json = async () => {
    n++
    await gate
    return { version: VERSION, url: 'https://greasyfork.org/zh-CN/scripts/592914' }
  }
  core.ui.openPanel('__core_updates')
  const btn = document.querySelector('[data-check]')
  btn.click()
  btn.click()
  assert.equal(n, 1)
  release()
  await new Promise((r) => setTimeout(r, 0))
  await new Promise((r) => setTimeout(r, 0))
})
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `node --test --test-force-exit test/core.test.js`  
Expected: 点按钮后 `calls.length` 仍为 0（静态页还没接线）。

- [ ] **Step 3: Replace `_renderUpdateTab` with the full implementation**

Replace the Task 2 method body in `src/core.js` with:

```js
  _renderUpdateTab(host) {
    const wrap = document.createElement('div')
    host.appendChild(wrap)
    let gen = 0
    let inflight = null

    const scripts = {
      hydrogen: SCRIPTS.find((s) => s.id === 'hydrogen'),
      oxygen: SCRIPTS.find((s) => s.id === 'oxygen'),
    }

    const snapshot = () => {
      const ox = localOxygenVersion([...this.plugins.values()])
      return {
        hydrogen: { local: VERSION, missing: false },
        oxygen: { local: ox, missing: !ox },
      }
    }

    const paint = (states, { busy = false } = {}) => {
      const loc = snapshot()
      const badgeClass = (status) => {
        if (status === 'behind' || status === 'fail' || status === 'invalid') return 'lsb-badge is-err'
        if (status === 'equal') return 'lsb-badge is-on'
        return 'lsb-badge'
      }
      const badgeText = (st) => {
        if (!st || !st.status) return ''
        return {
          behind: '有更新',
          equal: '已是最新',
          ahead: '比商店新',
          missing: '未安装',
          invalid: '版本号无效',
          fail: '查询失败',
        }[st.status] || ''
      }
      const desc = (id, st) => {
        const local = loc[id].local
        if (!st || !st.status) return local ? `本地 ${local}` : ''
        if (st.status === 'missing') return ''
        if (st.status === 'behind' || st.status === 'ahead') return `本地 ${local} · 商店 ${st.store}`
        if (st.status === 'equal') return `本地与商店同为 ${local}`
        if (st.status === 'invalid') return [local, st.store].filter(Boolean).join(' · ')
        if (st.status === 'fail') return st.connect ? '氢需要允许 greasyfork.org 跨域' : '无法读取 Greasy Fork'
        return ''
      }
      const install = (id, st) => {
        const script = scripts[id]
        const show = st && (st.status === 'behind' || st.status === 'missing')
        if (!show) return ''
        const href = st.status === 'missing' ? script.installUrl : installHref(st.parsed, script.installUrl)
        return `<a class="lsb-btn is-primary" data-install href="${esc(href)}" target="_blank" rel="noopener noreferrer">打开安装页</a>`
      }
      const row = (id) => {
        const st = states[id] || (loc[id].missing ? { status: 'missing' } : null)
        const local = loc[id].local
        const bt = badgeText(st)
        const ver = local ? `<span class="lsb-badge">v${esc(local)}</span>` : ''
        const bd = bt ? `<span class="${badgeClass(st.status)}">${esc(bt)}</span>` : ''
        const d = desc(id, st)
        return `<div class="lsb-row" data-script="${id}">
          <div class="lsb-row-main">
            <div class="lsb-row-name">${esc(scripts[id].label)} ${ver}${bd}</div>
            ${d ? `<div class="lsb-row-desc">${esc(d)}</div>` : ''}
          </div>${install(id, st)}</div>`
      }
      wrap.innerHTML =
        '<div class="lsb-actions" style="border:0;padding:0 0 8px;justify-content:flex-start">' +
        `<button class="lsb-btn is-primary" type="button" data-check${busy ? ' disabled' : ''}>${busy ? '查询中…' : '对照 Greasy Fork'}</button></div>` +
        row('hydrogen') +
        row('oxygen') +
        '<div class="lsb-row-desc">安装仍由油猴接管；两个都要装，先氢后氧。</div>'
      const btn = wrap.querySelector('[data-check]')
      if (btn && !busy) btn.onclick = () => run()
    }

    const loadOne = async (script) => {
      try {
        const json = await this.net.json(gfJsonUrl(script.gfId), { external: true })
        const parsed = parseStoreScript(json)
        if (!parsed) return { error: 'read' }
        return { parsed }
      } catch (e) {
        const msg = String((e && e.message) || e)
        return { error: /@connect|跨域/.test(msg) ? 'connect' : 'read' }
      }
    }

    const run = () => {
      if (inflight) return inflight
      const my = ++gen
      inflight = (async () => {
        paint({ oxygen: snapshot().oxygen.missing ? { status: 'missing' } : null }, { busy: true })
        const loc = snapshot()
        const jobs = [loadOne(scripts.hydrogen)]
        if (!loc.oxygen.missing) jobs.push(loadOne(scripts.oxygen))
        const settled = await Promise.allSettled(jobs)
        if (my !== gen || !wrap.isConnected) return
        const fromLoad = (res, local) => {
          if (res.status !== 'fulfilled') {
            return { status: 'fail', connect: false }
          }
          const v = res.value
          if (v.error === 'connect') return { status: 'fail', connect: true }
          if (v.error) return { status: 'fail', connect: false }
          const status = classifyVersion(local, v.parsed.version)
          return { status, store: v.parsed.version, parsed: v.parsed }
        }
        const hRes = settled[0]
        const states = { hydrogen: fromLoad(hRes, loc.hydrogen.local) }
        if (loc.oxygen.missing) states.oxygen = { status: 'missing' }
        else states.oxygen = fromLoad(settled[1], loc.oxygen.local)
        if (states.hydrogen.status === 'fail' || states.oxygen.status === 'fail') {
          this.log('core', '检查更新查询失败')
        }
        paint(states)
      })().finally(() => {
        if (inflight && my === gen) inflight = null
      })
      return inflight
    }

    paint({ oxygen: snapshot().oxygen.missing ? { status: 'missing' } : null })
  }
```

注意：`loadOne` 失败时 `Promise.allSettled` 仍是 `fulfilled`（因为 try/catch 在 `loadOne` 内）。`fromLoad` 看 `v.error`，不要指望 `rejected`。氢失败氧成功那条用例依赖这一点。

- [ ] **Step 4: Run tests and make sure they pass**

Run: `node --test --test-force-exit test/core.test.js`  
Expected: 全绿。`btn.onclick = () => run()` 必须返回 Promise，测试才能 `await onclick()`。连点用例在 `release()` 前断言 `n === 1`。

- [ ] **Step 5: Commit**

Skip unless the user asked to commit.

---

### Task 4: 氢 0.1.33、文档、打包、全量测试

**Files:**
- Modify: `src/core.js`（`export const VERSION = '0.1.33'`）
- Modify: `package.json`（`"version": "0.1.33"`）
- Modify: `docs/CONVENTIONS.md`、`docs/已知问题-rc.md`、`docs/测试招募-氢氧-beta.md`、`docs/功能征集-rc-ga.md`
- Run: `node build.mjs` → `dist/linuxsb-base.user.js` 头 `@version 0.1.33`

**Interfaces:**
- Consumes: Task 1–3 已绿的行为
- Produces: 氢冻本号 0.1.33；功能征集「已经有的」含检查更新；氧号仍 1.0.83

- [ ] **Step 1: Bump versions and docs**

- `src/core.js`：`VERSION = '0.1.33'`
- `package.json`：`"version": "0.1.33"`
- `docs/CONVENTIONS.md`：`氢 **0.1.33** / 氧 **1.0.83**`
- `docs/已知问题-rc.md`：标题里的氢号
- `docs/测试招募-氢氧-beta.md`：表格与正文里的氢 **0.1.33**
- `docs/功能征集-rc-ga.md`：RC 句、冻本句改为氢 0.1.33；「已经有的」列表加上 `- 检查更新`

不要改 `build-suite.mjs` / `suite/suite-center.js`。

- [ ] **Step 2: Build hydrogen**

Run: `node build.mjs`  
Expected: 退出码 0。抽查 `dist/linuxsb-base.user.js` 头部 `@version      0.1.33`。

- [ ] **Step 3: Run the full test suite**

Run: `node --test --test-force-exit --test-concurrency=4`  
Expected: 原 325 加上本功能新用例（约 +10）全绿、fail 0。不要在未跑通时声称完成。

- [ ] **Step 4: Commit**

Skip unless the user asked to commit.

---

## Self-review

1. Spec coverage：商店 id、三种结论 + 未安装、按钮才联网、失败隔离、in-flight、generation、氢 0.1.33、不做氧模块 / `@updateURL` / 菜单 / 左栏，均有对应步骤。
2. 无 TBD；Task 3 已写明 `allSettled` + 内部 catch 导致始终 `fulfilled`。
3. 名称一致：`classifyVersion` / `gfJsonUrl` / `__core_updates` / `data-check` / `data-script` / `data-install`。
