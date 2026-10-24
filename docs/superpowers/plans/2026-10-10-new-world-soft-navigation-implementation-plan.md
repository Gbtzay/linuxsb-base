# 新大陆式软跳迁移 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 让氢壳软跳采用新大陆参考脚本的事务、反馈与历史行为，同时保留站点现有路由白名单和单一氢壳。

**Architecture:** `plugins/skin.user.js` 继续负责路由集成，`api.net.raw()` 负责同源读取；导航请求期间保留当前正文和壳，仅使用壳顶端的 3px 进度线反馈。通过带序号的可取消事务完成验证、历史写入、元信息更新、正文替换、滚动/焦点恢复和播报；页面缓存沿用原容量与淘汰策略。

**Tech Stack:** Userscript JavaScript、基座 `api.net.raw()`、Node.js `node:test`、JSDOM、Playwright Chromium、多配置构建脚本。

## Global Constraints

- 保留单一 `#lsb-shell`、现有插件/基座集成、正文出口、路由通知、帖子增强和站点侧栏恢复路径。
- 仅对本站同源且明确允许的只读路由执行软跳；`/topic_collection/<id>`、写操作和事务页面继续使用整页生命周期；不新增 `/latest`。
- 帖子软跳默认开启；使用一次性存储键 `topicSpaNewWorldDefaultMigrationV1` 提升旧配置，后续尊重用户关闭设置。
- 继续通过 `api.net.raw()` 发请求，传入 `signal`、`queue: false`、15 秒超时和零重试；不直接绕过基座网络层。只有验证证明响应元数据不足时才改 `src/net.js`。
- 皮肤插件当前版本为 `2.0.24`；行为修改时按 `docs/CONVENTIONS.md` 将头部与 manifest 一起升至 `2.0.25`。
- 不修改参考脚本或设计说明；不清理、覆盖或回退无关未提交改动；不提交。

---

### Task 1：帖子软跳默认启用并一次性迁移旧配置

**文件：**
- 修改：`test/skin.test.js`，配置辅助函数与现有帖子导航迁移测试
- 修改：`plugins/skin.user.js`，`manifest.config.topicSpa` 与启动迁移键

**接口：**
- 新存储键：`topicSpaNewWorldDefaultMigrationV1`
- 首次运行时把 `topicSpa` 保存为 `true` 并写入新标记；标记已存在时不覆盖用户当前值。

- [ ] **步骤 1：编写失败测试**

添加测试，使用旧存储 `topicSpa: false` 且没有新迁移标记启动插件；断言保存配置变为 `true`、新标记变为 `true`，并且点击 `/topic/1` 会发起同源请求。另加一例预先写入新标记且 `topicSpa: false`，断言链接允许原生导航且不发请求。

```js
test('帖子软跳首次迁移默认开启，之后保留用户关闭选择', async () => {
  const { w, tick } = makeHome({
    'lsb_base:skin:__config': { topicSpa: false },
  })
  const calls = stubHtmlFetch(w, topicHtml)
  await loadBase(w, PLUG('skin.user.js'))
  const saved = JSON.parse(w.localStorage.getItem('lsb_base:skin:__config'))
  assert.equal(saved.topicSpa, true)
  assert.equal(JSON.parse(w.localStorage.getItem(
    'lsb_base:skin:topicSpaNewWorldDefaultMigrationV1',
  )), true)
  const link = w.document.createElement('a')
  link.href = 'https://linux.sb/topic/1'
  w.document.querySelector('main.wrap').append(link)
  link.click()
  await tick(100)
  assert.ok(calls.some((url) => /\/topic\/1/.test(url)))
})
```

- [ ] **步骤 2：运行测试确认失败**

运行：`node --test --test-name-pattern="帖子软跳首次迁移默认开启" test/skin.test.js`
预期：失败；当前版本会迁移为关闭，并且没有新迁移键。

- [ ] **步骤 3：实现默认值和迁移**

把 `topicSpa` 的默认值与设置说明改为默认开启；用新键替换强制关闭迁移。首次成功读取标记时保存开启值，再写迁移标记；标记已存在时不保存配置。同步把测试 helper 使用的新键和原默认原生导航测试改为默认开启/用户退出场景。

```js
const topicSpaMigrationKey = 'topicSpaNewWorldDefaultMigrationV1'
try {
  if (api.store.get(topicSpaMigrationKey) !== true) {
    api.saveConfig({ topicSpa: true })
    cfg = { ...cfg, topicSpa: true }
    api.store.set(topicSpaMigrationKey, true)
  }
} catch {
  // Keep the resolved config; never force the old native-only default.
}
```

- [ ] **步骤 4：运行迁移与原生退出开关测试**

运行：`node --test --test-name-pattern="帖子软跳首次迁移默认开启|帖子软跳.*用户关闭|旧版已保存的帖子软跳配置" test/skin.test.js`
预期：迁移启用测试和迁移后手动关闭测试通过；删除或改写断言仍要求默认帖子导航整页打开的旧测试。

---

### Task 2：为路由事务加入请求取消和生命周期清理

**文件：**
- 修改：`plugins/skin.user.js`，SPA 状态、`navigateSpa()`、`bindSpa()`、`unbindSpa()` 和壳卸载路径
- 修改：`test/skin.test.js`，延迟请求辅助函数及取消测试

**接口：**
- 新状态：`spaAbortController`，始终只指向当前事务的 `AbortController`
- 取消旧事务时先递增事务序号，再中止旧 controller；旧事务不得执行回退导航或清理新事务状态。

- [ ] **步骤 1：扩展延迟请求测试辅助函数并写失败测试**

让 `deferredHtmlFetch()` 保存 `fetch` 的 `init.signal`。新建快速连续导航测试：第二个帖子请求开始后，第一个 signal 已中止；即使随后释放第一个响应，地址、正文、进度及原生 UI 隐藏状态仍由第二个事务控制。另加停用皮肤和 `pageshow`（`persisted: true`）两例，断言 signal 中止且 `aria-busy`、事务阶段、页面隐藏类和进度计时器被清理。

```js
w.fetch = async (url, init = {}) => {
  const href = String(url)
  const html = typeof htmlFor === 'function' ? htmlFor(href) : htmlFor
  return await new Promise((resolve) => pending.push({
    resolve, html, href, signal: init.signal,
  }))
}
```

- [ ] **步骤 2：运行取消测试确认失败**

运行：`node --test --test-name-pattern="新导航中止旧帖子请求|停用皮肤会取消挂起软跳|缓存恢复时取消挂起软跳" test/skin.test.js`
预期：至少“新导航中止旧帖子请求”失败，因为请求尚未传入 `signal`；缓存恢复测试按 `pageshow.persisted` 失败。

- [ ] **步骤 3：实现当前请求 controller 和 signal 传递**

在通过未保存编辑确认及同 URL 短路后启动新事务；序号变化后中止旧 controller，再建立并保存新 controller。将 signal 传给现有 `api.net.raw()`。只有当前事务可以清理当前 UI；生命周期清理先废弃序号再中止请求。

```js
const serial = ++spaSerial
spaAbortController?.abort()
const controller = new AbortController()
spaAbortController = controller
const res = await api.net.raw(`${target.pathname}${target.search}`, {
  queue: false, timeout: 15000, retry: 0, signal: controller.signal,
})
```

当前事务捕获 `AbortError` 或发现自己的 signal 已中止时只清理本事务状态，不执行 `assign`、`reload`；旧事务不得释放新事务状态。

- [ ] **步骤 4：实现停用和页面缓存恢复清理**

增加单一清理函数，先递增 `spaSerial` 以废弃挂起回调，再中止当前请求、清除 `spaProgressTimer`、清除 `aria-busy`、`data-lsb-route-phase` 与页面级隐藏类，并复位进度线。`unbindSpa()` 和 `unmountShellLayer()` 调用此函数；`bindSpa()` 注册 `pageshow`，仅在 `event.persisted` 为真时取消旧请求并清理挂起 UI；`unbindSpa()` 移除该监听器。

```js
function onSpaPageShow(event) {
  if (!event.persisted) return
  clearSpaTransaction({ invalidate: true, abort: true })
}
```

- [ ] **步骤 5：运行事务取消测试**

运行：`node --test --test-name-pattern="新导航中止旧帖子请求|停用皮肤会取消挂起软跳|缓存恢复时取消挂起软跳|快速连续帖子软跳" test/skin.test.js`
预期：取消、快速导航及停用测试通过；过期事务释放响应不会触发整页回退。

---

### Task 3：只保留壳顶端 3px 进度线

**文件：**
- 修改：`plugins/skin.user.js`，shell CSS、`#lsb-shell-progress` 与路由状态函数
- 修改：`test/skin.test.js`，延迟正文期间的视觉/交互断言
- 修改：`test/skin-canvas.test.js`，生成 CSS 契约

**接口：**
- `#lsb-shell-progress` 是唯一软跳加载视觉反馈，固定在 viewport 顶边、高 3px、`pointer-events: none`。
- 保留 `data-lsb-route-phase`、`aria-busy` 和 `lsb-canvas-route-pending`；移除 `#lsb-shell-route-transition` 正文覆盖层及其状态函数。

- [ ] **步骤 1：写失败的加载状态测试**

用未完成的 `deferredHtmlFetch()` 点击版块链接，断言同一个旧正文出口仍连接、正文链接不会被过渡层拦截、`#lsb-shell-route-transition` 不存在、顶部进度线在 90ms 前不可见，等待超过 90ms 后显示且高度为 3px、`pointer-events` 为 `none`。

```js
const outlet = w.document.querySelector('main.wrap')
const oldList = outlet.querySelector('ul.post-list')
link.click()
await tick(0)
assert.strictEqual(w.document.querySelector('main.wrap'), outlet)
assert.ok(oldList.isConnected)
assert.equal(w.document.getElementById('lsb-shell-route-transition'), null)
assert.equal(w.getComputedStyle(w.document.getElementById('lsb-shell-progress')).height, '3px')
```

- [ ] **步骤 2：运行 CSS 与软跳测试确认失败**

运行：`node --test --test-name-pattern="软跳仅显示顶部进度线|Liquid Glass 导航与过渡令牌" test/skin.test.js test/skin-canvas.test.js`
预期：失败；当前 2px 顶线之外仍渲染正文过渡节点，且其 CSS 可接收指针事件。

- [ ] **步骤 3：移除正文过渡胶囊**

删除 shell 模板里的 `#lsb-shell-route-transition`、对应 CSS 和 `showRouteTransition()`/`hideRouteTransition()`/`routeTransition` 引用；让路由阶段只更新根节点 `data-lsb-route-phase`。保留旧正文直到响应验证和提交完成，并在提交收尾时释放 `aria-busy`、原生 UI 隐藏类与阶段标记。

- [ ] **步骤 4：调整顶部进度时序和减少动效规则**

把 `#lsb-shell-progress` 高度改为 3px，保留 90ms 防闪现；有效提交后进度走满并在 220ms 后收起。缓存快速命中清除尚未触发的 90ms 计时器并直接隐藏进度，避免短暂闪现。`prefers-reduced-motion` 与皮肤减少动效设置下取消进度动画。

```css
#lsb-shell-progress { height: 3px; pointer-events: none; }
#lsb-shell-progress[data-phase="loading"],
#lsb-shell-progress[data-phase="done"] { opacity: 1; }
@media (prefers-reduced-motion: reduce) {
  #lsb-shell-progress,
  #lsb-shell-progress [data-lsb-shell-progress-bar] { transition: none !important; }
}
```

- [ ] **步骤 5：运行聚焦 UI 测试**

运行：`node --test --test-name-pattern="软跳仅显示顶部进度线|Liquid Glass 导航与过渡令牌|帖子请求期间保留旧正文" test/skin.test.js test/skin-canvas.test.js`
预期：所选测试通过；旧正文可交互，顶栏和工具胶囊保持原节点。

---

### Task 4：按历史项保存双轴滚动，并安全回滚取消的后退

**文件：**
- 修改：`plugins/skin.user.js`，`rememberHistoryScroll()`、`historyScrollY()`、`applyHistory()`、`onSpaPop()`、`stashView()` 与 `applyView()`
- 修改：`test/skin.test.js`，历史和滚动测试

**接口：**
- `history.state` 保留现有字段，并维护 `lsbShellSpa: true`、`lsbShellSpaIndex`、`lsbShellSpaUrl`、`lsbScrollX`、`lsbScrollY`。
- 新路由使用当前索引加一；replace 不递增；后退/前进的 `historyMode: 'none'` 不写入新地址。

- [ ] **步骤 1：写双轴历史状态失败测试**

为 JSDOM 设置可写的 `scrollX`/`scrollY`，另在 `history.state` 放入 `siteState: 'preserve-me'`。执行一次软跳后断言前一项保存 X/Y、新项保存 URL 与递增索引、其它 state 字段保留；执行后退/前进时断言 `scrollTo(x, y)` 恢复对应两轴，显式 `replyid`/`floor` 定位优先于默认恢复。

```js
assert.equal(w.history.state.siteState, 'preserve-me')
assert.equal(w.history.state.lsbShellSpa, true)
assert.equal(w.history.state.lsbShellSpaIndex, 1)
assert.equal(w.history.state.lsbShellSpaUrl, 'https://linux.sb/topic/1')
assert.equal(w.history.state.lsbScrollX, 0)
assert.equal(w.history.state.lsbScrollY, 0)
assert.ok(scrolls.some(([x, y]) => x === 31 && y === 318))
```

- [ ] **步骤 2：运行历史测试确认失败**

运行：`node --test --test-name-pattern="帖子软跳后退恢复历史滚动位置|历史项保存双轴滚动和地址" test/skin.test.js`
预期：失败；现实现仅保存 `lsbScrollY`，且没有索引、目标 URL 或 `scrollX`。

- [ ] **步骤 3：初始化并读写带命名空间的历史字段**

绑定软跳时以 `replaceState()` 给当前历史项写入索引、绝对 URL 和当前双轴滚动，不丢弃第三方 state 字段。离开当前项前先写回其双轴滚动；push 创建新索引，replace 保持索引；只读记录异常时仍允许正文导航。

```js
function historyEntryState(url, index, x, y) {
  const prior = history.state && typeof history.state === 'object' ? history.state : {}
  return {
    ...prior,
    lsbShellSpa: true,
    lsbShellSpaIndex: index,
    lsbShellSpaUrl: url,
    lsbScrollX: Number(x) || 0,
    lsbScrollY: Number(y) || 0,
  }
}
```

- [ ] **步骤 4：实现 popstate 的焦点和未保存编辑回滚规则**

后退/前进时读取目标历史索引。若编辑器有未保存内容且用户取消，调用 `history.go(currentIndex - targetIndex)` 回到原项，并用独立的回滚标记忽略该次 `popstate`，不发起正文请求。若确认，则用目标历史项 URL 导航；成功提交后按该项恢复双轴滚动。定位顺序为 `replyid`、`floor`、目标 URL 的 hash，最后才应用历史坐标或默认回顶；历史导航不主动移动焦点。

```js
if (hasUnsavedEditor() && !window.confirm('当前编辑内容尚未保存，确定离开吗？')) {
  spaHistoryRollbackIndex = previousHistoryIndex
  history.go(previousHistoryIndex - targetHistoryIndex)
  return
}
void navigateSpa(historyEntryUrl, {
  historyMode: 'none', force: true, source: 'history',
})
```

- [ ] **步骤 5：运行历史与滚动聚焦测试**

运行：`node --test --test-name-pattern="历史项保存双轴滚动和地址|取消后退会恢复原历史项|帖子软跳后退恢复历史滚动位置|回复和楼层定位" test/skin.test.js`
预期：双轴坐标、索引、回滚 delta 和显式定位优先测试通过。

---

### Task 5：验证后原子提交页面元信息，并提供正文进入、焦点和播报

**文件：**
- 修改：`plugins/skin.user.js`，`syncRouteHead()`、`commitRoute()`、正文出口属性、shell 播报节点和进入动画
- 修改：`test/skin.test.js`，提交顺序、元信息、焦点和播报测试
- 修改：`test/skin-canvas.test.js`，减少动效 CSS 契约

**接口：**
- 同源允许路由、帖子 canonical 与正文出口验证成功后才进入提交阶段。
- 壳内新增专用 `role="status" aria-live="polite"` 播报节点；正文出口设置可编程聚焦用 `tabindex="-1"`。
- 用户点击/提交成功后聚焦正文出口并播报新标题；浏览器后退/前进不抢焦点。

- [ ] **步骤 1：写失败的提交和可访问性测试**

构造带 `<title>`、canonical、description、`og:title` 的有效 HTML 响应。点击导航后断言 URL、现有 head 节点内容和正文在成功提交时一致；`main.wrap` 有 `tabindex="-1"` 且成为活动元素；专用 status 区只播报目标标题。另触发 `popstate`，断言焦点仍留在浏览器当前焦点节点。

```js
assert.equal(w.document.title, '目标页面标题')
assert.equal(w.document.querySelector('link[rel="canonical"]').href, 'https://linux.sb/forum/4')
assert.equal(w.document.querySelector('meta[name="description"]').content, '目标描述')
assert.equal(w.document.querySelector('meta[property="og:title"]').content, '目标页面标题')
assert.equal(w.document.getElementById('lsb-route-announcer').textContent, '已打开：目标页面标题')
assert.equal(w.document.activeElement, w.document.querySelector('main.wrap'))
```

- [ ] **步骤 2：运行新提交测试确认失败**

运行：`node --test --test-name-pattern="软跳提交同步页面元信息|用户导航聚焦并播报|历史导航不抢焦点" test/skin.test.js`
预期：失败；当前 `syncRouteHead()` 只更新 `document.title`，没有 meta 同步、专用 live region 或正文聚焦。

- [ ] **步骤 3：准备远端正文后执行单阶段提交**

在远端正文仍未连接时去除其脚本、标记应隐藏的侧栏并导入子节点。验证允许的最终同源路由后，还要使用现有 `isCloudflareChallengeDocument()` 拒绝验证页，并使用 `findRouteOutlet()` 确认正文出口存在。验证通过后在一个无 `await` 的提交阶段写入目标 URL、同步标题及现有 canonical、description、Open Graph 节点，再替换正文出口；现有节点匹配到远端值时原位更新，远端没有对应值时移除旧值，绝不保留与新正文不符的旧元信息，也不凭空新增 head 节点。提交前保留 `markNative(true)`，避免重新挂载的站点 UI 闪现。无效重定向、错误 canonical、挑战页或无正文出口不得改变地址、head 或旧正文。

- [ ] **步骤 4：添加正文进入动效及辅助技术播报**

正文出口替换后添加 `data-lsb-route-content-enter`，用 180ms opacity 与 5px 上移关键帧进入；减少动效媒体查询和用户设置同时生效时将动画及位移关闭。添加壳内专用 status live region；只在用户发起的成功导航结束后播报标题并聚焦正文，给正文出口补 `tabindex="-1"`。

```html
<span id="lsb-route-announcer" role="status" aria-live="polite"></span>
```

```css
#lsb-route-announcer {
  position: absolute; width: 1px; height: 1px; padding: 0; margin: -1px;
  overflow: hidden; clip-path: inset(50%); white-space: nowrap; border: 0;
}
[data-lsb-route-content-enter] { animation: lsb-route-content-in 180ms ease both; }
@keyframes lsb-route-content-in {
  from { opacity: 0; transform: translateY(5px); }
  to { opacity: 1; transform: translateY(0); }
}
@media (prefers-reduced-motion: reduce) {
  [data-lsb-route-content-enter] { animation: none !important; transform: none !important; }
}
```

成功提交后在同一绘制后的收尾回调中对用户导航执行 `outlet.focus({ preventScroll: true })` 并设置播报文本；popstate 只恢复滚动，不更改焦点。

- [ ] **步骤 5：运行提交聚焦测试**

运行：`node --test --test-name-pattern="软跳提交同步页面元信息|用户导航聚焦并播报|历史导航不抢焦点|响应校验失败保留旧地址和元信息|prefers-reduced-motion" test/skin.test.js test/skin-canvas.test.js`
预期：有效响应同步 head 与正文；无效响应保留旧页面；减少动效时正文无位移动画。

---

### Task 6：让缓存命中遵循同一提交与滚动规则，并统一失败收尾

**文件：**
- 修改：`plugins/skin.user.js`，页面缓存快照、缓存命中分支和事务收尾
- 修改：`test/skin.test.js`，缓存命中、失败响应和重定向测试

**接口：**
- 保持 `VIEW_CACHE_MAX` 和现有淘汰策略不变。
- 页面缓存记录增加 `scrollX`、head 元信息快照；缓存命中复用正文提交后的路由通知、标题更新与历史滚动恢复，但不闪烁加载线。

- [ ] **步骤 1：写缓存与失败收尾测试**

从首页软跳至版块，再返回首页缓存；记录两次进入期间的双轴位置、head 信息和 live region，断言缓存提交恢复同样状态且加载线未进入 `loading`/`done`。另分别模拟 HTTP 失败、登录重定向、挑战页、无正文出口和错误帖子 canonical；断言地址与旧正文保持到整页回退开始，并清掉忙碌状态、阶段、页面隐藏类和进度定时器。

- [ ] **步骤 2：运行缓存和失败测试确认差异**

运行：`node --test --test-name-pattern="缓存命中恢复双轴滚动和页面信息|缓存命中不闪加载线|软跳响应失败清理事务状态|帖子软跳拒绝非帖子响应|帖子软跳拒绝 canonical" test/skin.test.js`
预期：双轴/head 缓存断言失败；当前错误和缓存分支尚未共用完整提交状态。

- [ ] **步骤 3：扩展现有快照而不改缓存架构**

在现有 cache entry 中保存 X/Y、标题和现有 head 字段快照；恢复时通过同一条路由完成路径更新页面 head、壳上下文、通知、显式定位和滚动。缓存命中取消等待中的 90ms 进度计时器并保持进度线隐藏。

```js
rememberView(key, {
  frag, title: document.title, head: captureRouteHead(),
  scrollX: currentScrollX(), scrollY: currentScrollY(), live: true, attrs,
})
```

- [ ] **步骤 4：集中校验和清理异常事务**

让当前事务的失败路径统一复位进度、`aria-busy`、页面级隐藏类、路由阶段和 controller；仅当前事务可以执行整页回退。`historyMode: 'none'` 的网络/解析失败使用 `location.reload()`，`replace` 使用 `location.replace(target.href)`，`push` 使用 `location.assign(target.href)`；已验证但重定向到非允许路由时，push/replace 使用响应的最终 URL。被新导航替代的事务和 `AbortError` 不做整页回退，也不清理新事务状态。皮肤停用和 BFCache 恢复使用 Task 2 的清理函数。

```js
function fallbackRoute(mode, targetUrl) {
  if (mode === 'none') location.reload()
  else if (mode === 'replace') location.replace(targetUrl)
  else location.assign(targetUrl)
}
```

- [ ] **步骤 5：运行缓存和异常场景测试**

运行：`node --test --test-name-pattern="缓存命中恢复双轴滚动和页面信息|缓存命中不闪加载线|软跳响应失败清理事务状态|帖子软跳拒绝非帖子响应|帖子软跳拒绝 canonical|快速连续帖子软跳" test/skin.test.js`
预期：缓存和失败/失效响应测试通过，缓存淘汰上限不变。

---

### Task 7：更新 Chromium 多视口软跳冒烟覆盖

**文件：**
- 修改：`scripts/ios27-canvas-smoke.mjs`，首页版块软跳、帖子软跳、快速导航与后退流程

**接口：**
- 冒烟继续用三种 viewport（wide、mid、narrow），并验证同一 shell、原正文到响应前保持连接、原生 UI 隐藏和历史滚动恢复。
- 不再等待或截图 `#lsb-shell-route-transition`；改验顶部 `#lsb-shell-progress`、3px 高度、非拦截指针事件、正文进入状态及减少动效。

- [ ] **步骤 1：添加新的浏览器断言并确认旧行为失败**

在现有延迟版块请求和延迟帖子请求中，开始前保存 `#lsb-shell`、top status、tool capsule、`main.wrap` 与旧列表节点；等待 fetch 开始后断言节点身份不变、动态重挂的原生 UI `display: none`、没有正文遮罩、顶端进度线不接收指针事件。验证 release response 后正文完成进入、title/head 更新、焦点/live region 符合交互类型。

- [ ] **步骤 2：运行 Chromium 冒烟确认测试覆盖当前差异**

运行：`npm run smoke:ios27`
预期：更新后的断言因旧 transition 选择器/焦点/历史检查失败；不要通过删除断言或缩减 viewport 数量使测试通过。

- [ ] **步骤 3：重写冒烟测量与截图点**

把当前依赖 `#lsb-shell-route-transition` 的 wait、几何测量和截图改为顶端进度线与正文几何测量；更新 `enableExperimentalTopicSpa()` 让其用 `topicSpaNewWorldDefaultMigrationV1`，不再写旧迁移键。在 fetch 完成后检查 180ms 进入动画，并验证 reduced-motion 下动画时长为 `0s`。保留现有 home/topic soft-hop、failed-fetch、back/forward 和快速连续导航场景。

```js
const progress = page.locator('#lsb-shell-progress')
assert.equal(await progress.evaluate((el) => getComputedStyle(el).height), '3px')
assert.equal(await progress.evaluate((el) => getComputedStyle(el).pointerEvents), 'none')
assert.equal(await page.locator('#lsb-shell-route-transition').count(), 0)
```

- [ ] **步骤 4：运行多视口冒烟**

运行：`npm run smoke:ios27`
预期：wide、mid、narrow 的版块与帖子软跳、错误回退、后退/前进和快速导航场景通过；产物仍写入现有 `artifacts/ios27-canvas/` 路径。

---

### Task 8：更新版本与说明并完成构建和全量验证

**文件：**
- 修改：`plugins/skin.user.js`，头部 `@version` 和 manifest `version` 改为 `2.0.25`
- 修改：`README.md` 与 `docs/CONVENTIONS.md` 的 skin 版本和软跳行为说明
- 生成：现有 release/dev 构建产物及 `dist` 校验结果

**接口：**
- 不提升基座、Oxygen 或无关插件版本；生产版本和开发版本均从同一当前源码构建。
- 发布包只包含既有 profile 允许的代码；不因该功能引入新权限。

- [ ] **步骤 1：更新版本和文档描述**

把 plugin header 与 manifest 一起由 `2.0.24` 提升至 `2.0.25`。README 的 skin 描述改为“等待响应时保留旧正文和单一氢壳，以顶部 3px 进度线反馈；帖子页默认软跳、用户可关闭；后退/前进恢复双轴滚动”。`docs/CONVENTIONS.md` 更新同一版本、默认迁移键、页面遮罩移除与整页路由边界。

- [ ] **步骤 2：构建 release 与 dev 产物**

运行：`npm run build`，再运行 `npm run build:dev`。检查 `dist/linuxsb-base.user.js`、`dist/linuxsb-suite.user.js`、`dist/linuxsb-lts.user.js` 以及 `dist-dev` 对应产物的 skin manifest/header 版本均为 `2.0.25`，且打包源内没有正文过渡胶囊。

- [ ] **步骤 3：运行产物校验和全量测试**

运行：`npm run verify:profiles` 与 `npm test`。预期：release/dev 产物校验通过；全量 `node:test` 返回 0 个失败。

- [ ] **步骤 4：运行最终浏览器检查**

运行：`npm run smoke:ios27`。确认三种 viewport、默认帖子软跳、旧正文连续、顶端加载线、动效减少、未保存后退回滚和 focus/announcement 行为通过。

- [ ] **步骤 5：复查改动范围**

运行：`git diff --check --ignore-space-at-eol` 与 `git status --short`；检查 skin、测试、冒烟脚本、README、CONVENTIONS 和构建产物的差异。保留所有与本设计无关的既有改动，不提交。
