# 顶下横幅通知 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 氢顶下三块可点芯片（私信 / 回复 / 别处新帖），未读哨兵顺路巡检站点通知与私信；桌面通知只在后台弹出，且只在打开开关的点击里向 Chrome 要权限。

**Architecture:** 氢 `UI.banner` / `notifyDesktop` / `requestDesktopPermission` 为唯一 DOM 与 Notification 入口。`site.js` 解析通知页和私信页。未读哨兵选主后每轮 `GET /` + 通知 + 私信，广播 `{ pm, reply, list }`，各标签按当前页类型画芯片。不加 ORDER 模块。实时流列表横幅不改。

**Tech Stack:** userscript、JSDOM `node:test`、基座 `api.net.doc` / `api.store` / `api.tabs` / `api.election`。

## Global Constraints

- 氢 `src/core.js` `VERSION` = `package.json` = `0.1.23`
- 氧 `SUITE_VERSION` / `suite-center` = `1.0.61`；`unread-sentinel` `@version` = `manifest.version` = `1.0.3`
- `kind` 只能是 `'pm' | 'reply' | 'list'`；类名只用 `lsb-banner-*`
- UTF-8 无 BOM、LF；全部站内请求走 `api.net`；Windows 上不要用 `&&`，测试常需非沙箱
- RC 冻新功能：本计划在 **GA** 执行。不要往 ORDER 加模块
- 操作反馈仍走 toast；实时流 `toastOnNew` 与机会监控 `notifyDesktop` 不改

## Files

- Create: `test/fixtures/notifications.html`
- Create: `test/fixtures/messages.html`
- Create: `test/fixtures/guest.html`
- Modify: `src/site.js`（`ROUTES`、`parseNotifications`、`parseMessages`）
- Modify: `src/ui.js`（banner + desktop）
- Modify: `src/core.js`（VERSION、把 banner / notifyDesktop / requestDesktopPermission 挂到 `api.ui`）
- Modify: `package.json`（`0.1.23`）
- Modify: `plugins/unread-sentinel.user.js`
- Modify: `test/site.test.js`
- Modify: `test/core.test.js`
- Modify: `test/trio.test.js`（或 Create `test/banner-sentinel.test.js` 若 trio 已过长）
- Modify: `build-suite.mjs`、`suite/suite-center.js`
- Modify: `README.md`、`docs/CONVENTIONS.md` §2.2、`docs/已知问题-rc.md`、`docs/测试招募-氢氧-beta.md`、`docs/功能征集-rc-ga.md`

---

### Task 1: 通知 / 私信夹具与 `site.js` 解析

**Files:**
- Create: `test/fixtures/notifications.html`
- Create: `test/fixtures/messages.html`
- Modify: `src/site.js`
- Modify: `test/site.test.js`
- Modify: `src/core.js` 的 `api.parse`（只加两个函数引用）

**Interfaces:**
- Consumes: 现有 `idFrom`、`text`、`ROUTES.user`
- Produces:
  - `ROUTES.messages` → `'/messages'`（若活站路径不同，本任务内改这一处并同步夹具）
  - `parseNotifications(root = document) => { id: number, title: string, href: string, unread: boolean }[]`
  - `parseMessages(root = document)` 同上
  - `api.parse.notifications` / `api.parse.messages`

- [ ] **Step 1: 写夹具**

已登录浏览器打开「我的通知」和私信收件箱，把列表那截 HTML 另存。选择器对不上就改夹具和下面模板，直到解析测试绿。若暂时拿不到活页，先写入下面最小夹具（结构即契约）。

`test/fixtures/notifications.html`：

```html
<!DOCTYPE html><html><body>
<ul class="notify-list">
  <li class="notify-item is-unread"><a href="/notify/101">阿某 回复了你的主题 测试帖</a></li>
  <li class="notify-item"><a href="/notify/100">已读的一条</a></li>
</ul>
</body></html>
```

`test/fixtures/messages.html`：

```html
<!DOCTYPE html><html><body>
<ul class="pm-list">
  <li class="pm-item is-unread"><a href="/messages/7">阿某：你好</a></li>
  <li class="pm-item"><a href="/messages/6">旧会话</a></li>
</ul>
</body></html>
```

- [ ] **Step 2: 写失败测试**

在 `test/site.test.js` 末尾追加（`fx` / `load` 已有）：

```js
test('parseNotifications：未读与 id/href/标题', () => {
  const w = load('notifications.html', 'https://linux.sb/user/5372?tab=notifications')
  const rows = parseNotifications(w.document)
  assert.equal(rows.length, 2)
  assert.deepEqual(rows[0], {
    id: 101,
    title: '阿某 回复了你的主题 测试帖',
    href: '/notify/101',
    unread: true,
  })
  assert.equal(rows[1].unread, false)
  assert.equal(rows[1].id, 100)
})

test('parseMessages：未读私信', () => {
  const w = load('messages.html', 'https://linux.sb/messages')
  const rows = parseMessages(w.document)
  assert.equal(rows.length, 2)
  assert.equal(rows[0].id, 7)
  assert.equal(rows[0].unread, true)
  assert.equal(rows[0].href, '/messages/7')
  assert.equal(rows[1].unread, false)
})

test('ROUTES.user 通知 tab 与 ROUTES.messages', () => {
  assert.equal(ROUTES.user(5372, 'notifications'), '/user/5372?tab=notifications')
  assert.equal(ROUTES.messages, '/messages')
})
```

顶部 import 加上 `parseNotifications, parseMessages`。

- [ ] **Step 3: 跑测试确认失败**

```
node --test --test-force-exit test/site.test.js
```

Expected: FAIL（`parseNotifications` 未导出或夹具未进 `load` 的 `fx` 映射——`load` 用文件名，把新夹具放进 `test/fixtures/` 即可，`fx(n)` 已按文件名读）。

- [ ] **Step 4: 最小实现**

`src/site.js` 的 `ROUTES` 增加 `messages: '/messages'`。

```js
function parseInbox(root, itemSel, unreadSel, idKind) {
  return [...root.querySelectorAll(itemSel)].map((li) => {
    const a = li.querySelector('a[href]')
    const href = a ? a.getAttribute('href') : ''
    return {
      id: idFrom(href, idKind),
      title: a ? text(a) : '',
      href,
      unread: li.matches(unreadSel) || !!li.querySelector(unreadSel),
    }
  }).filter((x) => x.id != null)
}

export function parseNotifications(root = document) {
  return parseInbox(root, 'li.notify-item', '.is-unread', 'notify')
}

export function parseMessages(root = document) {
  return parseInbox(root, 'li.pm-item', '.is-unread', 'messages')
}
```

`idFrom('/notify/101', 'notify')` 与 `idFrom('/messages/7', 'messages')` 现有实现已能提取数字，不必改 `util.js`。

`src/core.js` `api.parse` 增加：

```js
notifications: site.parseNotifications,
messages: site.parseMessages,
```

- [ ] **Step 5: 再跑 `test/site.test.js`，应 PASS**

- [ ] **Step 6: Commit**

```
git add test/fixtures/notifications.html test/fixtures/messages.html src/site.js src/core.js test/site.test.js
git commit -m "Parse site notification and private-message lists for the in-view banner."
```

---

### Task 2: 氢 `api.ui.banner` 与桌面通知入口

**Files:**
- Modify: `src/ui.js`
- Modify: `src/core.js`（`api.ui` 包装 + `VERSION = '0.1.23'`）
- Modify: `package.json`（`0.1.23`）
- Modify: `test/core.test.js`

**Interfaces:**
- Consumes: 现有 `esc`、`ensureBase`、`injectStyle`
- Produces:
  - `UI.banner.set(kind, { count, href })`
  - `UI.banner.clear(kind)`
  - `UI.notifyDesktop(title, body) => boolean`
  - `UI.requestDesktopPermission() => Promise<string>`
  - 插件侧同名，均 `need('ui', …)`

- [ ] **Step 1: 写失败测试**（`test/core.test.js`，`boot()` 已有；`installDom` 默认 topic 夹具含 `.top`）

```js
test('banner：只渲染有数的块，点掉一类，全空卸宿主', () => {
  const core = boot()
  core.ui.banner.set('pm', { count: 1, href: '/messages/7' })
  core.ui.banner.set('reply', { count: 2, href: '/notify/101' })
  core.ui.banner.set('list', { count: 12, href: '/' })
  const host = document.getElementById('lsb-banner-host')
  assert.ok(host)
  assert.equal(host.parentElement, document.querySelector('.top').parentElement)
  const chips = [...host.querySelectorAll('[data-kind]')]
  assert.deepEqual(chips.map((c) => c.getAttribute('data-kind')), ['pm', 'reply', 'list'])
  assert.match(chips.find((c) => c.dataset.kind === 'list').textContent, /9\+/)
  chips.find((c) => c.dataset.kind === 'pm').click()
  assert.equal(host.querySelector('[data-kind="pm"]'), null)
  core.ui.banner.clear('reply')
  core.ui.banner.clear('list')
  assert.equal(document.getElementById('lsb-banner-host'), null)
})

test('banner.set 空 count 不占位', () => {
  const core = boot()
  core.ui.banner.set('pm', { count: 0, href: '/messages' })
  assert.equal(document.getElementById('lsb-banner-host'), null)
})

test('notifyDesktop：未授权或前台不构造', () => {
  const core = boot()
  const made = []
  globalThis.Notification = function (title, opts) {
    made.push({ title, ...opts })
  }
  Notification.permission = 'denied'
  Object.defineProperty(document, 'hidden', { configurable: true, get: () => true })
  assert.equal(core.ui.notifyDesktop('t', 'b'), false)
  Notification.permission = 'granted'
  Object.defineProperty(document, 'hidden', { configurable: true, get: () => false })
  assert.equal(core.ui.notifyDesktop('t', 'b'), false)
  Object.defineProperty(document, 'hidden', { configurable: true, get: () => true })
  assert.equal(core.ui.notifyDesktop('linux.sb · 1 封私信', '阿某'), true)
  assert.equal(made.length, 1)
})

test('无 ui 权限不能 banner', () => {
  const core = boot()
  core.register({ id: 'noui', version: '1.0.0', permissions: ['read'] }, (api) => {
    assert.throws(() => api.ui.banner.set('pm', { count: 1, href: '/' }))
  })
})
```

- [ ] **Step 2: 跑 `node --test --test-force-exit test/core.test.js`，确认新用例 FAIL**

- [ ] **Step 3: 实现**

`src/ui.js` 的 `CSS` 追加：

```css
.lsb-banner-host{position:sticky;top:var(--lsb-shell-header,0);z-index:8003;display:flex;gap:6px;padding:8px 10px;background:var(--panel,#fff);border-bottom:1px solid var(--line-soft,#eee)}
.lsb-banner-chip{flex:1;cursor:pointer;padding:7px 8px;border:1px solid var(--brand,#5eaaa0);border-radius:8px;background:var(--brand-soft,#eef7f5);color:var(--brand-hover,#3d7a72);font-size:12px;font-weight:600;text-align:center}
.lsb-banner-chip:active{transform:scale(0.97)}
@media (prefers-reduced-motion:reduce){.lsb-banner-chip:active{transform:none}}
```

`UI` 增加 `_banner = { pm: null, reply: null, list: null }`。

```js
banner = {
  set: (kind, { count, href } = {}) => this._bannerSet(kind, count, href),
  clear: (kind) => this._bannerClear(kind),
}

_bannerSet(kind, count, href) {
  if (!['pm', 'reply', 'list'].includes(kind)) return
  const n = Number(count) || 0
  if (n <= 0) return this._bannerClear(kind)
  this._banner[kind] = { count: n, href: href || '#' }
  this._bannerRender()
}

_bannerClear(kind) {
  if (kind) this._banner[kind] = null
  this._bannerRender()
}

_bannerMount() {
  if (this._bannerHost && this._bannerHost.isConnected) return this._bannerHost
  this.ensureBase()
  const header = document.getElementById('lsb-shell-header') || document.querySelector('.top')
  if (!header || !header.parentElement) return null
  const host = document.createElement('div')
  host.id = 'lsb-banner-host'
  host.className = 'lsb-banner-host'
  header.insertAdjacentElement('afterend', host)
  this._bannerHost = host
  return host
}

_bannerRender() {
  const labels = { pm: '私信', reply: '回复', list: '新帖' }
  const kinds = ['pm', 'reply', 'list'].filter((k) => this._banner[k])
  if (!kinds.length) {
    this._bannerHost?.remove()
    this._bannerHost = null
    return
  }
  const host = this._bannerMount()
  if (!host) return
  host.innerHTML = kinds.map((k) => {
    const rec = this._banner[k]
    const n = rec.count > 9 ? '9+' : String(rec.count)
    return `<button type="button" class="lsb-banner-chip" data-kind="${k}" data-href="${esc(rec.href)}">${labels[k]} ${n}</button>`
  }).join('')
  for (const btn of host.querySelectorAll('[data-kind]')) {
    btn.addEventListener('click', () => {
      const href = btn.getAttribute('data-href')
      this._bannerClear(btn.getAttribute('data-kind'))
      if (href && href !== '#') location.assign(href)
    })
  }
}

notifyDesktop(title, body) {
  try {
    if (typeof Notification === 'undefined') return false
    if (Notification.permission !== 'granted') return false
    if (!document.hidden) return false
    new Notification(String(title || ''), { body: String(body || '') })
    return true
  } catch {
    return false
  }
}

requestDesktopPermission() {
  try {
    if (typeof Notification === 'undefined') return Promise.resolve('unsupported')
    if (Notification.permission !== 'default') return Promise.resolve(Notification.permission)
    return Notification.requestPermission()
  } catch {
    return Promise.resolve('denied')
  }
}
```

`src/core.js`：

```js
export const VERSION = '0.1.23'
```

`api.ui` 增加：

```js
banner: {
  set: (kind, opts) => (need('ui', '顶下横幅'), core.ui.banner.set(kind, opts)),
  clear: (kind) => (need('ui', '顶下横幅'), core.ui.banner.clear(kind)),
},
notifyDesktop: (title, body) => (need('ui', '桌面通知'), core.ui.notifyDesktop(title, body)),
requestDesktopPermission: () => (need('ui', '桌面通知'), core.ui.requestDesktopPermission()),
```

`package.json` 的 `version` 改为 `0.1.23`。

- [ ] **Step 4: `node --test --test-force-exit test/core.test.js` 应 PASS**

- [ ] **Step 5: Commit**

```
git add src/ui.js src/core.js package.json test/core.test.js
git commit -m "Add hydrogen in-view banner host and gated desktop notifications."
```

---

### Task 3: 未读哨兵巡检三类并驱动横幅

**Files:**
- Modify: `plugins/unread-sentinel.user.js`（`@version` 与 `manifest.version` → `1.0.3`）
- Create: `test/fixtures/guest.html`
- Modify: `test/trio.test.js`（追加用例；夹具映射 notifications/messages/guest）

**Interfaces:**
- Consumes: `api.parse.notifications` / `api.parse.messages`、`api.routes.user` / `api.routes.messages`、`api.ui.banner` / `notifyDesktop` / `requestDesktopPermission`
- Produces: store 键 `notifySeen`、`pmSeen`（string[] id）；`tabs` 事件 `'banner'` 载荷 `{ pm, reply, list }`，每项 `{ count, href, title } | null`；debug 增加 `lastBanner`、`fetchPaths`、`asFollower`

现有 `announce` 的 toast **删掉**。`cycle(true)` 也要 `paint`（测试走 `dbg.tick()`）。`requestPermission` 不得出现在 `cycle` 里。

- [ ] **Step 1: 写失败测试**

`test/trio.test.js` 的 `FX` 增加 `guest`、`notifications`、`messages`。`guest.html`：

```html
<!DOCTYPE html><html><body><div class="top"></div></body></html>
```

```js
const FXN = {
  ...FX,
  notifications: readFileSync(new URL('./fixtures/notifications.html', import.meta.url), 'utf8'),
  messages: readFileSync(new URL('./fixtures/messages.html', import.meta.url), 'utf8'),
}

function routedStub(calls) {
  return async (url) => {
    const u = String(url)
    calls.push(u)
    let html = FXN.home
    if (/tab=notifications/.test(u)) html = FXN.notifications
    else if (/\/messages/.test(u) && !/tab=/.test(u)) html = FXN.messages
    return { status: 200, ok: true, url: u, text: async () => html }
  }
}
```

用例（`loadBase` + `SENTINEL_PRELOAD` 已有；首页 `makeSite('home', 'https://linux.sb/', …)`）：

```js
test('哨兵：leader 一轮打首页+通知+私信；首页不出现新帖块；有私信/回复块', async () => {
  const calls = []
  const { w, until } = makeSite('home', 'https://linux.sb/', SENTINEL_PRELOAD)
  await loadBase(w, PLUG('unread-sentinel.user.js'))
  w.fetch = routedStub(calls)
  const dbg = await w.LSB.bus.request('unread-sentinel:debug')
  await until(() => dbg.role() === 'leader', 3000)
  await dbg.tick()
  const paths = calls.map((u) => new URL(u, 'https://linux.sb').pathname + new URL(u, 'https://linux.sb').search)
  assert.ok(paths.some((p) => p === '/' || p.startsWith('/index')))
  assert.ok(paths.some((p) => /tab=notifications/.test(p)))
  assert.ok(paths.some((p) => p === '/messages' || p.startsWith('/messages')))
  const host = w.document.getElementById('lsb-banner-host')
  assert.ok(host)
  assert.ok(host.querySelector('[data-kind="pm"]'))
  assert.ok(host.querySelector('[data-kind="reply"]'))
  assert.equal(host.querySelector('[data-kind="list"]'), null, 'home 不画新帖块')
  assert.ok(![...w.document.querySelectorAll('.lsb-toast')].some((t) => /未读哨兵|新动态/.test(t.textContent)))
})

test('哨兵：帖子页画出新帖块', async () => {
  const calls = []
  const { w, until } = makeSite('topic', 'https://linux.sb/topic/1', SENTINEL_PRELOAD)
  await loadBase(w, PLUG('unread-sentinel.user.js'))
  w.fetch = routedStub(calls)
  const dbg = await w.LSB.bus.request('unread-sentinel:debug')
  await until(() => dbg.role() === 'leader', 3000)
  await dbg.tick()
  assert.ok(w.document.querySelector('#lsb-banner-host [data-kind="list"]'))
})

test('哨兵：follower 的 cycle(false) 不打请求', async () => {
  const calls = []
  const { w, until } = makeSite('home', 'https://linux.sb/', SENTINEL_PRELOAD)
  await loadBase(w, PLUG('unread-sentinel.user.js'))
  w.fetch = routedStub(calls)
  const dbg = await w.LSB.bus.request('unread-sentinel:debug')
  await until(() => dbg.role() === 'leader', 3000)
  calls.length = 0
  dbg.asFollower()
  await dbg.cycleSoft()
  assert.equal(calls.length, 0)
})

test('哨兵：通知页失败时已有私信块保留', async () => {
  const calls = []
  const { w, until } = makeSite('home', 'https://linux.sb/', SENTINEL_PRELOAD)
  await loadBase(w, PLUG('unread-sentinel.user.js'))
  w.fetch = async (url) => {
    const u = String(url)
    calls.push(u)
    if (/tab=notifications/.test(u)) return { status: 500, ok: false, url: u, text: async () => '' }
    return routedStub(calls)(url)
  }
  const dbg = await w.LSB.bus.request('unread-sentinel:debug')
  await until(() => dbg.role() === 'leader', 3000)
  await dbg.tick()
  assert.ok(w.document.querySelector('[data-kind="pm"]'))
  assert.ok(dbg.lastError())
})

test('哨兵：访客不请求通知和私信', async () => {
  const calls = []
  const { w, until } = makeSite('guest', 'https://linux.sb/', SENTINEL_PRELOAD)
  await loadBase(w, PLUG('unread-sentinel.user.js'))
  w.fetch = routedStub(calls)
  const dbg = await w.LSB.bus.request('unread-sentinel:debug')
  await until(() => dbg.role() === 'leader', 3000)
  await dbg.tick()
  assert.ok(!calls.some((u) => /tab=notifications|\/messages/.test(String(u))))
})

test('哨兵：前台不发桌面通知；cycle 不 requestPermission', async () => {
  const calls = []
  const { w, until } = makeSite('home', 'https://linux.sb/', SENTINEL_PRELOAD)
  await loadBase(w, PLUG('unread-sentinel.user.js'))
  const perm = []
  const made = []
  w.Notification = function (title, opts) { made.push({ title, ...opts }) }
  w.Notification.permission = 'default'
  w.Notification.requestPermission = () => { perm.push(1); return Promise.resolve('granted') }
  Object.defineProperty(w.document, 'hidden', { configurable: true, get: () => false })
  w.fetch = routedStub(calls)
  const dbg = await w.LSB.bus.request('unread-sentinel:debug')
  await until(() => dbg.role() === 'leader', 3000)
  await dbg.tick()
  assert.equal(perm.length, 0)
  assert.equal(made.length, 0)
})

test('哨兵：保存桌面开才 requestPermission；hidden 才 new Notification', async () => {
  const { w, until } = makeSite('home', 'https://linux.sb/', {
    ...SENTINEL_PRELOAD,
    'lsb_base:unread-sentinel:__config': { ...SENTINEL_PRELOAD['lsb_base:unread-sentinel:__config'], notifyDesktop: false },
  })
  await loadBase(w, PLUG('unread-sentinel.user.js'))
  const perm = []
  const made = []
  w.Notification = function (title, opts) { made.push({ title, ...opts }) }
  w.Notification.permission = 'default'
  w.Notification.requestPermission = () => { perm.push(1); w.Notification.permission = 'granted'; return Promise.resolve('granted') }
  Object.defineProperty(w.document, 'hidden', { configurable: true, get: () => true })
  w.fetch = routedStub([])
  const dbg = await w.LSB.bus.request('unread-sentinel:debug')
  await until(() => dbg.role() === 'leader', 3000)
  w.LSB.__core.ui.openPanel('unread-sentinel')
  const box = [...w.document.querySelectorAll('label')].find((l) => /桌面通知/.test(l.textContent))
  const input = box.querySelector('input[type=checkbox]')
  input.checked = true
  w.document.querySelector('.lsb-btn.is-primary').click()
  assert.ok(perm.length >= 1)
  await dbg.tick()
  assert.ok(made.length >= 1)
})
```

cycle 里用已有的 `api.me.guest` / `api.me.uid`。访客用例改用 `test/fixtures/guest.html`（只有 `<div class="top"></div>`，无登录链），`makeSite` 增加 `guest` 键，`url` 为 `https://linux.sb/`。

- [ ] **Step 2: 跑新用例，确认 FAIL**

```
node --test --test-force-exit test/trio.test.js
```

- [ ] **Step 3: 实现哨兵**

`cycle` 在现有首页逻辑之后（同一 try，分步 catch 单类）：

```js
const pageType = api.page.type
const guest = !!api.me.guest
const uid = api.me.uid

let replyPayload = lastBanner.reply
let pmPayload = lastBanner.pm
let listPayload = null
if (fresh.length) {
  listPayload = { count: fresh.length, href: '/', title: fresh[0].title }
}

if (!guest && uid) {
  try {
    const ndoc = await api.net.doc(api.routes.user(uid, 'notifications'))
    const rows = (api.parse.notifications(ndoc) || []).filter((x) => x.unread)
    const seen = new Set(api.store.get('notifySeen', []) || [])
    const neu = rows.filter((x) => !seen.has(String(x.id)))
    api.store.set('notifySeen', rows.map((x) => String(x.id)).slice(0, 400))
    if (neu.length) {
      replyPayload = { count: neu.length, href: neu[0].href || api.routes.user(uid, 'notifications'), title: neu[0].title }
    }
  } catch (e) {
    lastErr = String((e && e.message) || e)
  }
  try {
    const mdoc = await api.net.doc(api.routes.messages)
    const rows = (api.parse.messages(mdoc) || []).filter((x) => x.unread)
    const seen = new Set(api.store.get('pmSeen', []) || [])
    const neu = rows.filter((x) => !seen.has(String(x.id)))
    api.store.set('pmSeen', rows.map((x) => String(x.id)).slice(0, 400))
    if (neu.length) {
      pmPayload = { count: neu.length, href: neu[0].href || api.routes.messages, title: neu[0].title }
    }
  } catch (e) {
    lastErr = String((e && e.message) || e)
  }
}

function paint(local) {
  const showList = local.list && pageType !== 'home' && pageType !== 'forum'
  if (local.pm) api.ui.banner.set('pm', local.pm)
  if (local.reply) api.ui.banner.set('reply', local.reply)
  if (showList) api.ui.banner.set('list', local.list)
  else api.ui.banner.clear('list')
}

lastBanner = { pm: pmPayload, reply: replyPayload, list: listPayload }
paint(lastBanner)
api.tabs.post('banner', lastBanner)

if (cfg.notifyDesktop) {
  if (pmPayload) api.ui.notifyDesktop('linux.sb · 私信', pmPayload.title)
  if (replyPayload) api.ui.notifyDesktop('linux.sb · 回复', replyPayload.title)
  if (listPayload) api.ui.notifyDesktop('linux.sb · 新帖', listPayload.title)
}
```

`api.tabs.on('banner', (p) => { lastBanner = p; paint(p) })`

删掉 `announce` 里的 `api.ui.toast` 和 `Notification.requestPermission`。首页 `fresh` 仍 `mergeInbox` + `tabs.post('events')`。

`config:changed:unread-sentinel`：

```js
api.on('config:changed:unread-sentinel', () => {
  cfg = api.config()
  if (cfg.notifyDesktop) api.ui.requestDesktopPermission()
  if (election.isLeader) scheduleNext()
})
```

`configTab` 的 `render` 在表单后：若 `Notification.permission === 'denied'` 且 `cfg.notifyDesktop`，插入 `.lsb-row-desc` 文案「浏览器拒绝了，到站点通知设置里打开」。

debug：

```js
asFollower: () => { election.role = 'follower' },
cycleSoft: () => cycle(false),
lastBanner: () => lastBanner,
```

`api.snapshot` 补丁不要做。debug 不要 `setGuest`。

- [ ] **Step 4: `node --test --test-force-exit test/trio.test.js test/live-feed-v2.test.js` 应 PASS**

- [ ] **Step 5: Commit**

```
git add plugins/unread-sentinel.user.js test/trio.test.js src/core.js
git commit -m "Drive the in-view banner from unread-sentinel polls of notices and PMs."
```

---

### Task 4: 版本、文档、全量测试

**Files:** `build-suite.mjs`、`suite/suite-center.js`、`README.md`、`docs/CONVENTIONS.md`、`docs/已知问题-rc.md`、`docs/测试招募-氢氧-beta.md`、`docs/功能征集-rc-ga.md`

**Interfaces:** 无新 API。氢 0.1.23 / 氧 1.0.61。changelog 只写修复+本功能（GA 文案）。

- [ ] **Step 1:** `SUITE_VERSION = '1.0.61'`，`suite-center` `version: '1.0.61'`。RC 文档表与 Release 链接暂不改（GA 发版时再改）；`CONVENTIONS.md` 冻本行等发版再写新号。若本任务与发版同一 PR，再把文档 1.0.60 → 1.0.61、氢 0.1.22 → 0.1.23。

本任务按 **与代码同 PR 发 GA** 处理：文档冻本改为氢 **0.1.23** / 氧 **1.0.61**。README 插件表补一句顶下横幅；`api.ui.toast` 行旁注明新内容走 banner。

- [ ] **Step 2:**

```
node build.mjs
node build-suite.mjs
node --test --test-force-exit --test-concurrency=4
```

Expected: 全绿。

- [ ] **Step 3: Commit**

```
git add build-suite.mjs suite/suite-center.js dist/linuxsb-base.user.js dist/linuxsb-suite.user.js README.md docs
git commit -m "Ship hydrogen 0.1.23 and oxygen 1.0.61 with in-view banner notices."
```

---

## Spec coverage

| Spec | Task |
|---|---|
| `api.ui.banner.set/clear`、芯片外形、空不占位、点了卸一类 | 2 |
| home/forum 无「新帖」块；topic 有；点新帖回 `/` | 2+3 |
| 哨兵 3 GET、限速队列、选主、广播 | 3 |
| `parseNotifications` / `parseMessages`、夹具 | 1 |
| 访客跳过 2/3；失败保留块；不 toast | 3 |
| 桌面：granted+hidden；保存开关才 requestPermission；cycle 不要权 | 2+3 |
| 实时流列表横幅保留 | 3 回归 live-feed-v2 |
| 氢/氧补丁号、无新 ORDER | 4 |
| GA 才合入 | 执行时遵守；RC 不要跑本计划 |

## 执行前

GA 之前不要开工。若只要 RC 补「桌面权限框」，只做 Task 2 的 `requestDesktopPermission` + 把三处插件 `Notification.requestPermission` 从 `cycle` 挪到 config 保存，不要加横幅和额外 GET。
