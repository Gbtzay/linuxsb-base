# AI 工作台右栏 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox syntax for tracking.

**Goal:** 在氢壳桌面宽屏右栏增加可切换的 AI 工作台，聚合操作台、当前帖子副驾和追踪摘要，同时保留站点侧栏状态与现有 AI 入口。

**Architecture:** 基座 `UI` 增加通用侧栏视图注册协议；`skin` 只负责右栏宿主、站点视图、断点和生命周期；新增 `ai-workbench` 插件注册 AI 顶层视图并渲染三个子段；`ai-copilot` 把现有只读查询、帖子动作和追踪只读数据整理成稳定插件导出，工作台不调用调试 RPC。

**Tech Stack:** 原生 JavaScript userscript、LSB plugin API、CSS media queries、`api.store` 本地存储、JSDOM/Node `node:test`、esbuild 构建脚本。

## Global Constraints

- 氢壳开启、桌面宽屏 `>=1100px` 且 `ai-workbench` 已激活时，右栏顶部显示“站点 / AI”；默认“站点”。
- 站点侧栏卡片节点不克隆、不销毁；站点视图和 AI 视图各自拥有滚动容器，切换仅改变可见性。
- AI 页内固定三个子段：操作台、当前帖子、追踪；默认操作台；切换子段不自动请求模型。
- 非帖子页当前帖子段显示不可用提示；操作台默认只查活动追踪项，明确询问归档后才纳入。
- 右栏只完成显式用户操作；不自动发帖、回帖、确认解决、批量接受建议或改变追踪状态。
- 两阶段操作台继续使用现有“受限计划 → 本地执行 → 答案”流程；引用必须经过本地校验。
- 异步回调必须检查工作台已挂载、路由代次和插件未停用；旧请求不得回写新路由。
- 氢壳关闭、窄屏、移动端、skin 停用或 AI 工作台未安装时，保留现有顶栏、楼层按钮和浮层入口。
- Oxygen 收录 `ai-workbench`；LTS 不收录 AI 工作台；`dist/` 只能由构建命令生成。

---

## Preflight：线上 DOM / BBS1ORG 版本兼容性（2026-09-30）

执行功能任务前先固定这次兼容性结论：

- 目标站点 `https://linux.sb/` 的页脚和静态资源显示 **BBS1ORG v99.0**：
  `index.css?v=v99.0-stats-card-20260929-v2`、
  `index.js?v=v99.0-topic-types-20260907-2`，页脚运行信息也是 `v99.0`。
- 直接访问 `https://bbs1.org/` 得到的是另一套公开实例，资源显示 **v10.3**。
  它不能作为 `linux.sb` 的版本判断依据，但其公开帖子页仍保留同一组核心结构，作为交叉兼容样本。
- `linux.sb` v99.0 首页 / 版块 / 用户页仍有 `body > .top`、`.top .bar`、
  `main.wrap`、`.forum-layout.forum-layout-has-sidebar` 和
  `aside.sidebar[data-slot="sidebar.stack"]`；帖子页仍有
  `ul.post-list.topic-post-list`、`li.post-item.post-entry#post-{id}`、`.post-content`、
  `.post-ops`、`.breadcrumb`、`h1.post-content-title` 与 canonical 链接。
- 未登录帖子页会显示 `.replies-login-visible`，回复内容通常不在首屏返回；主楼通常没有
  `data-floor`。置顶回复副本带 `.reply-pin-duplicate` 和 `data-reply-pin="top-copy"`，
  现有 `SEL.topicPosts` 已正确排除它。

适配决定：右栏宿主继续以 `aside.sidebar[data-slot="sidebar.stack"]` / 现有 `skin`
迁移逻辑为基础，不依赖版本号分支；帖子上下文沿用 `parseTopic().loginRequired`，
工作台必须把受限回复区显示为上下文提示，不把 `floor: 0` 当成可跳转引用，也不能根据
帖子 ID 推算楼层。新增的 v99.0 / v10.3 DOM 回归断言放在 `test/site.test.js`，先于 Task 1
执行。

审计快照保存在本地 `.tmp-live-dom/`（不进版本库），包含首页、版块、用户页和多个帖子页。

---

## 文件结构与职责

- **Modify:** `src/ui.js`
  - 保存侧栏视图注册表，提供排序、可见性查询和注销；视图注册由插件生命周期托管。
- **Modify:** `src/core.js`
  - 暴露 `api.ui.shellAsideView` 和 `api.ui.shellAsideViews`，保持 ui 权限校验。
- **Modify:** `plugins/skin.user.js`
  - 把右栏拆成站点页和外部视图页；渲染通用标签、断点、滚动容器和视图生命周期，不识别 AI 业务。
- **Modify:** `plugins/ai-copilot.user.js`
  - 导出工作台需要的上下文、只读查询、帖子动作、追踪摘要、配置状态和渲染器；保留 `ai-copilot:debug` 兼容。
- **Create:** `plugins/ai-workbench.user.js`
  - 注册 AI 顶层视图，渲染操作台 / 当前帖子 / 追踪三个子段，并隔离路由竞态与插件停用。
- **Modify:** `suite/order.js`
  - 将 `ai-workbench` 放在 `ai-copilot` 之后，保持 LTS 排除。
- **Modify:** `build-suite.mjs`, `suite/suite-center.js`
  - Oxygen/套件中心版本提升到 `1.0.119`。
- **Modify:** `README.md`
  - 说明右栏 AI 工作台入口、回退入口和模块版本。
- **Modify:** `test/core.test.js`
  - 测试注册、排序、可见性、注销和插件停用时的侧栏视图清理。
- **Modify:** `test/skin.test.js`
  - 测试站点/AI 标签、节点保留、宽屏断点、路由刷新、skin 停用清理。
- **Create:** `test/ai-workbench.test.js`
  - 测试三段渲染、主要操作、配置缺失、当前帖子空态和旧请求隔离。
- **Modify:** `test/ai-copilot.test.js`
  - 测试稳定导出接口不依赖 `ai-copilot:debug`。
- **Modify:** `test/suite.test.js`
  - 测试 Oxygen 收录新插件、LTS 排除、版本和产物新鲜度。
- **Generated:** `dist/linuxsb-base.user.js`, `dist/linuxsb-suite.user.js`, `dist/linuxsb-lts.user.js`
  - 只通过 `npm run build` 生成。

## Interfaces between tasks

任务 1 产生基座接口：

```js
api.ui.shellAsideView({
  id: 'ai-workbench',
  label: 'AI',
  order: 20,
  visible: (context) => true,
  render: (host, context) => disposer,
}) // -> () => void

api.ui.shellAsideViews(context)
// -> Array<{ id, label, order, visible, render }>
```

任务 2 让 skin 调用 `shellAsideViews(context)`，每个注册视图最多挂载一个 host，并在注销或停用时调用其 disposer。

任务 3 产生 `ai-copilot` 的公开导出：

```js\n{
  context: () => ({ route, catalog, currentTopic, currentPosts }),
  configured: () => boolean,
  providerState: () => ({ configured, model }),
  renderMarkdown: (text) => string,
  runConsoleQuery: ({ question, force, onStage }) => Promise<Record>,
  runTopic: (mode, options) => Promise<Record>,
  trackingOverview: ({ includeArchived } = {}) => Record,
  openPanel: (mode = 'ask') => void
}
```

任务 4 的工作台只依赖任务 3 的导出，不访问 `ai-copilot:debug`，并向 skin 提供一个顶层视图 `id: 'ai-workbench'`。

---

## Task 1: 基座侧栏视图注册协议

**Files:**
- Modify: `src/ui.js`
- Modify: `src/core.js`
- Test: `test/core.test.js`

**Interfaces:**
- Consumes: 现有 `UI.registerTab` 的排序与注销模式、插件 `own()` 生命周期。
- Produces: `registerShellAsideView`、`shellAsideViews`、`api.ui.shellAsideView`、`api.ui.shellAsideViews`。

- [x] **Step 1: 写失败测试，锁定注册表排序、可见性和注销。**

```js
test('侧栏视图：按 order 排序，visible 过滤，注销后不再提供', () => {
  const core = boot()
  let api
  core.register({ id: 'aside-provider', version: '1.0.0' }, (a) => {
    api = a
    a.ui.shellAsideView({ id: 'late', label: '晚', order: 20, visible: () => true, render: () => {} })
    a.ui.shellAsideView({ id: 'early', label: '早', order: 10, visible: () => false, render: () => {} })
  })
  assert.deepEqual(core.ui.shellAsideViews({}).map((view) => view.id), ['late'])
  assert.equal(core.ui.shellAsideViews({})[0].label, '晚')
  api.ui.shellAsideView({ id: 'second', label: '第二', order: 20, render: () => {} })
  assert.deepEqual(core.ui.shellAsideViews({}).map((view) => view.id), ['late', 'second'])
})
```

- [x] **Step 2: 运行测试确认失败。**

Run: `node --test test/core.test.js --test-name-pattern "侧栏视图"`

Expected: FAIL，`api.ui.shellAsideView` 未定义。

- [x] **Step 3: 实现最小注册表。**

在 `UI` 构造函数增加 `_shellAsideViews = []`，实现：

```js
registerShellAsideView({ id, label, order = 100, visible, render }) {
  if (!id || typeof render !== 'function') throw new Error('侧栏视图需要 id/render')
  const record = { id, label: String(label || id), order: Number(order) || 100,
    visible: typeof visible === 'function' ? visible : () => true, render }
  const old = this._shellAsideViews.find((item) => item.id === id)
  if (old) this._shellAsideViews = this._shellAsideViews.filter((item) => item !== old)
  this._shellAsideViews.push(record)
  this._shellAsideViews.sort((a, b) => a.order - b.order || a.label.localeCompare(b.label))
  return () => { this._shellAsideViews = this._shellAsideViews.filter((item) => item !== record) }
}
shellAsideViews(context = {}) {
  return this._shellAsideViews.filter((item) => {
    try { return item.visible(context) !== false } catch { return false }
  })
}
```

在 `src/core.js` 的 `api.ui` 增加：

```js
shellAsideView: (opt) => (need('ui', '注册侧栏视图'), own(core.ui.registerShellAsideView(opt))),
shellAsideViews: (context) => (need('ui', '读取侧栏视图'), core.ui.shellAsideViews(context)),
```

- [x] **Step 4: 运行测试确认通过，并复跑基座测试。**

Run: `node --test test/core.test.js --test-name-pattern "侧栏视图"`  
Expected: PASS。  
Run: `node --test test/core.test.js`  
Expected: 0 failures。

- [x] **Step 5: 提交。**

```bash
git add src/ui.js src/core.js test/core.test.js
git commit -m "feat: add shell aside view registry"
```

---

## Task 2: 氢壳右栏宿主和断点

**Files:**
- Modify: `plugins/skin.user.js`
- Test: `test/skin.test.js`

**Interfaces:**
- Consumes: `api.ui.shellAsideViews(context)`。
- Produces: DOM `#lsb-shell-aside-tabs`, `[data-lsb-shell-aside-tab]`, `[data-lsb-shell-aside-pane]`，并把原生卡片放进 `data-lsb-shell-site`。

- [x] **Step 1: 写失败测试，锁定站点 / AI 标签和站点节点保留。**

```js
test('氢壳右栏：注册外部视图后显示站点/AI，切换不销毁站点卡片', async () => {
  const { w, until } = makeSite()
  await loadBase(w, PLUG('skin.user.js'))
  const card = w.document.querySelector('#lsb-shell-aside .sidebar-card')
  w.LSB.register(
    { id: 'aside-demo', version: '1.0.0', permissions: ['ui', 'events', 'read'] },
    (api) => {
      api.ui.shellAsideView({ id: 'demo', label: 'AI', render(host) {
        host.innerHTML = '<div data-demo>AI 内容</div>'
        return () => { host.textContent = '' }
      } })
    },
  )
  await until(() => w.document.querySelector('[data-lsb-shell-aside-tab="demo"]'))
  const siteCard = w.document.querySelector('#lsb-shell-aside .sidebar-card')
  assert.equal(siteCard, card)
  const aiTab = w.document.querySelector('[data-lsb-shell-aside-tab="demo"]')
  aiTab.click()
  assert.equal(w.document.querySelector('[data-lsb-shell-aside-pane="site"]').hidden, true)
  assert.match(w.document.querySelector('[data-demo]').textContent, /AI 内容/)
  w.document.querySelector('[data-lsb-shell-aside-tab="site"]').click()
  assert.equal(w.document.querySelector('[data-lsb-shell-aside-pane="site"]').hidden, false)
  assert.equal(w.document.querySelector('#lsb-shell-aside .sidebar-card'), card)
})
```

- [x] **Step 2: 运行测试确认失败。**

Run: `node --test test/skin.test.js --test-name-pattern "右栏：注册外部视图"`  
Expected: FAIL，因为右栏仍没有标签宿主。

- [x] **Step 3: 实现站点页宿主和外部视图挂载。**

在 `ensureShell()` 创建以下结构：

```html
<aside id="lsb-shell-aside" aria-label="站点信息">
  <nav id="lsb-shell-aside-tabs" role="tablist"></nav>
  <div class="lsb-shell-aside-panes">
    <section data-lsb-shell-aside-pane="site" data-lsb-shell-site aria-label="站点" tabindex="0"></section>
  </div>
</aside>
```

新增 `asideSiteHost`、`asideViewContext`、`asideWide`、`syncAsideViews`。站点卡片迁移和恢复始终传入 `data-lsb-shell-site`；所有站点卡片保持原节点引用。`syncAsideViews` 按 `api.ui.shellAsideViews(context)` 过滤视图：

1. 不满足 `window.matchMedia('(min-width: 1100px)')` 时，只保留站点 pane，不创建 AI 标签或调用外部 render。
2. 满足断点时为每个注册视图创建 pane、tab 和一次性 render；切换只设置 `hidden` 与 `aria-selected`。
3. 外部视图注销、插件停用或不再可见时调用保存的 disposer，移除 pane/tab。
4. 每次 route 刷新让当前标签回到 site；不会跨页面记住 AI 子页。
5. 点击标签只切换 pane，不请求模型。

外层 `#lsb-shell-aside` 改为 `overflow:hidden`；站点 pane 和外部 pane 使用 `overflow:auto; min-height:0`。仅在 `@media (min-width:1100px)` 显示 tabs；`@media (max-width:1099px)` 不显示外部视图。resize 事件调用已有刷新调度，skin 停用时清理所有外部 disposer、监听器和新增节点。

- [x] **Step 4: 运行测试确认通过及回归。**

Run: `node --test test/skin.test.js --test-name-pattern "右栏：注册外部视图"`  
Expected: PASS。  
Run: `node --test test/skin.test.js`  
Expected: 0 failures。

- [x] **Step 5: 提交。**

```bash
git add plugins/skin.user.js test/skin.test.js
git commit -m "feat: add hydrogen shell aside host"
```

---

## Task 3: 整理 AI 副驾稳定业务接口

**Files:**
- Modify: `plugins/ai-copilot.user.js`
- Test: `test/ai-copilot.test.js`

**Interfaces:**
- Consumes: 现有 `consoleContext`、`runConsoleQuery`、`run`、`trackingTopicCatalog`、`loadTrackingState`、`provider`。
- Produces: 计划中定义的七个公开导出；`debug` RPC 继续存在且原有断言不变。

- [x] **Step 1: 写失败测试，验证公开导出和追踪摘要。**

```js
test('AI 副驾：公开工作台接口不依赖 debug RPC', async () => {
  const ctx = makeSite(topicHtml, 'https://linux.sb/topic/1', {
    _llmReply: { choices: [{ message: { content: 'answer' } }] },
  })
  const dbg = await load(ctx)
  const rec = ctx.w.LSB.info().plugins.find((item) => item.id === 'ai-copilot')
  const exported = rec?.state === 'active' ? ctx.w.LSB.__core.plugins.get('ai-copilot').exports : null
  assert.equal(typeof exported.context, 'function')
  assert.equal(typeof exported.runConsoleQuery, 'function')
  assert.equal(typeof exported.runTopic, 'function')
  assert.equal(typeof exported.trackingOverview, 'function')
  assert.equal(typeof exported.providerState, 'function')
  assert.equal(exported.providerState().configured, false)
  const overview = exported.trackingOverview()
  assert.equal(Array.isArray(overview.items), true)
  assert.equal(await ctx.w.LSB.bus.hasHandler('ai-copilot:debug'), true)
  assert.ok(dbg)
})
```

- [x] **Step 2: 运行测试确认失败。**

Run: `node --test test/ai-copilot.test.js --test-name-pattern "公开工作台接口"`  
Expected: FAIL，因为 `ai-copilot` 当前 `return {}` 且没有 `trackingOverview`。

- [x] **Step 3: 实现最小稳定导出。**

在 `setup` 中新增：

```js
function trackingOverview({ includeArchived = false } = {}) {
  const catalog = trackingTopicCatalog()
  const items = []
  for (const topic of catalog) {
    const state = loadTrackingState(topic.id)
    for (const item of state.items) {
      if (!includeArchived && item.archivedAt) continue
      items.push({
        ...item,
        topicId: topic.id,
        topicTitle: topic.title,
        forumName: topic.forumName,
      })
    }
  }
  return {
    catalog,
    items: items.sort((a, b) => b.updatedAt - a.updatedAt || a.topicId - b.topicId),
    activeCount: items.filter((item) => !item.archivedAt).length,
    pendingCount: items.filter((item) => item.pendingEvidence?.length).length,
  }
}
function providerState() {
  return { configured: Boolean(provider.configured()), model: String(provider.model?.() || '') }
}
```

将 `runTopic(mode, options = {})` 限定到 `ask/analyze/digest/draft` 后调用现有 `run`；`context` 返回 `api.util.clone(consoleContext())`；`openPanel` 设置 `currentMode` 后调用现有面板。把 `provider.renderMarkdown` 作为 `renderMarkdown` 导出。

- [x] **Step 4: 运行测试确认通过。**

Run: `node --test test/ai-copilot.test.js --test-name-pattern "公开工作台接口"`  
Expected: PASS。  
Run: `node --test test/ai-copilot.test.js`  
Expected: 0 failures。

- [x] **Step 5: 提交。**

```bash
git add plugins/ai-copilot.user.js test/ai-copilot.test.js
git commit -m "feat: expose copilot workbench API"
```

---

## Task 4: AI 工作台插件和右栏三段

**Files:**
- Create: `plugins/ai-workbench.user.js`
- Create: `test/ai-workbench.test.js`

**Interfaces:**
- Consumes: Task 1 的 `shellAsideView`、Task 3 的公开导出和 `api.page` / `api.on`。
- Produces: `ai-workbench` 顶层视图，三个 `data-ai-section` 子段和局部结果渲染。

- [x] **Step 1: 写失败测试，锁定三段结构、默认操作台和配置空态。**

```js
test('AI 工作台：右栏默认操作台，包含三段且配置缺失时显示设置提示', async () => {
  const { w, until } = makeSite()
  await loadBase(w, PLUG('skin.user.js'), PLUG('ai-summary.user.js'), PLUG('ai-copilot.user.js'), PLUG('ai-workbench.user.js'))
  Object.defineProperty(w, 'innerWidth', { value: 1200, configurable: true })
  w.dispatchEvent(new w.Event('resize'))
  const ok = await until(() => w.document.querySelector('[data-lsb-shell-aside-tab="ai-workbench"]'))
  assert.equal(ok, true)
  const workbench = w.document.querySelector('[data-ai-workbench]')
  assert.ok(workbench)
  assert.ok(workbench.querySelector('[data-ai-section="console"]'))
  assert.ok(workbench.querySelector('[data-ai-section="topic"]'))
  assert.ok(workbench.querySelector('[data-ai-section="tracking"]'))
  assert.equal(workbench.querySelector('[data-ai-section="console"]').hidden, false)
  assert.match(workbench.textContent, /AI 总结|API|设置/)
})
```

- [x] **Step 2: 运行测试确认失败。**

Run: `node --test test/ai-workbench.test.js --test-name-pattern "默认操作台"`  
Expected: FAIL，因为插件文件和工作台视图尚不存在。

- [x] **Step 3: 实现 userscript 入口和工作台渲染。**

新增 `plugins/ai-workbench.user.js`，manifest 使用 `id: 'ai-workbench'`、版本 `0.1.0`、依赖 `ai-copilot: '^0.6.1'`、权限 `read/ui/events`。setup 中：

1. 取得 `const copilot = api.plugin('ai-copilot')`；注册 `api.ui.shellAsideView({ id: 'ai-workbench', label: 'AI', order: 20, render })`。
2. `render(host, context)` 创建 `[data-ai-workbench]`、顶层三按钮和三个 pane；默认选中 console。按钮只切换 hidden，不调用 copilot。
3. 操作台段包含四个快捷问题、textarea 和“运行查询”；提交调用 `copilot.runConsoleQuery`，阶段按 plan/local/answer 更新，成功后使用 `copilot.renderMarkdown` 显示答案和经过校验的引用，失败显示局部错误和重试。
4. 当前帖子段显示标题、帖子数量和上下文；非 topic 显示不可用提示。topic 页提供模式选择（问答/观点分歧/方案对比/讨论时间线/新回复摘要/回复草稿），问题或参数表单和提交按钮；调用 `copilot.runTopic`，结果渲染在同一 pane，草稿只提供复制按钮。
5. 追踪段调用 `copilot.trackingOverview()` 显示活动主题数、活动问题数、待处理新证据和前 8 个追踪项；提供“查看完整追踪面板”按钮调用 `copilot.openPanel('track')`，不自动接受或确认任何建议。
6. 每个异步操作保存 `routeGeneration`，只在 host 仍连接、generation 未变、未 disposed 时回写；`api.on('route:changed')` 递增代次并让宿主下次渲染回到 console；`api.onDispose` 调用视图 disposer、取消定时器并清空引用。
7. 通过 `api.ui.style` 注入右栏紧凑样式，结果超长在 pane 内滚动；没有 API Key 时显示“打开 AI 总结设置”按钮，调用 `api.ui.openPanel('ai-summary')`。

- [x] **Step 4: 运行工作台测试确认通过。**

Run: `node --test test/ai-workbench.test.js`  
Expected: 0 failures。

- [x] **Step 5: 提交。**

```bash
git add plugins/ai-workbench.user.js test/ai-workbench.test.js
git commit -m "feat: add ai workbench sidebar plugin"
```

---

## Task 5: 套件、文档和版本对齐

**Files:**
- Modify: `suite/order.js`
- Modify: `build-suite.mjs`
- Modify: `suite/suite-center.js`
- Modify: `README.md`
- Modify: `test/suite.test.js`
- Modify: `plugins/ai-copilot.user.js` userscript version to `0.6.1`
- Modify: `plugins/skin.user.js` userscript version to `1.1.57`
- Generated: `dist/*.user.js`

**Interfaces:**
- Consumes: Tasks 1–4 source modules and tests.
- Produces: Oxygen includes `ai-workbench`; LTS excludes both AI modules; all version markers agree.

- [x] **Step 1: 写失败产物断言。**

在 `test/suite.test.js` 增加：

```js
test('AI 工作台登记在 AI 副驾之后且不进入 LTS', () => {
  assert.equal(MEMBERS[MEMBERS.indexOf('ai-copilot') + 1], 'ai-workbench')
  assert.equal(ORDER_LTS.includes('ai-workbench'), false)
  const source = readFileSync(new URL('../plugins/ai-workbench.user.js', import.meta.url), 'utf8')
  assert.match(source, /@version\s+0\.1\.0/)
  assert.match(source, /id:\s*'ai-workbench'/)
  assert.match(suiteCode, /\(ai-workbench\)/)
  assert.doesNotMatch(ltsCode, /id:\s*'ai-workbench'/)
})
```

Run: `node --test test/suite.test.js --test-name-pattern "AI 工作台登记"`  
Expected: FAIL，因为新插件尚未登记和打包。

- [x] **Step 2: 更新登记、版本和 README。**

将 `suite/order.js` 的 `ORDER` 在 `ai-copilot` 后加入 `ai-workbench`，不加入 `ORDER_LTS`；将 `build-suite.mjs` 与 `suite/suite-center.js` 的版本设为 `1.0.119`。把 `ai-copilot` 版本提升为 `0.6.1`，skin 版本提升为 `1.1.57`，同步 README 的模块数量、AI 模块说明、版本和回退入口。严格保持 LTS 排除规则。

- [x] **Step 3: 生成并检查产物。**

Run: `npm run build`  
Expected: Hydrogen、Oxygen、LTS 三个产物均生成，Oxygen 模块段包含 `ai-workbench`，LTS 不包含 `ai-copilot` 或 `ai-workbench`。  
Run: `npm run verify:dist`  
Expected: `dist 新鲜度通过`。

- [x] **Step 4: 运行套件回归。**

Run: `node --test test/suite.test.js`  
Expected: 0 failures。

- [x] **Step 5: 提交。**

```bash
git add suite/order.js build-suite.mjs suite/suite-center.js README.md plugins/ai-copilot.user.js plugins/skin.user.js dist test/suite.test.js
git commit -m "feat: ship ai workbench in oxygen"
```

---

## Task 6: 全量验收和文档自检

**Files:**
- Modify: `docs/superpowers/plans/2026-09-27-ai-workbench-sidebar.md`

- [x] **Step 1: 运行新增与受影响测试。**

Run: `node --test test/core.test.js test/skin.test.js test/ai-copilot.test.js test/ai-workbench.test.js test/suite.test.js`  
Expected: 0 failures。

- [x] **Step 2: 运行完整测试与构建检查。**

Run: `npm test`  
Expected: 全部测试通过。  
Run: `npm run build`  
Expected: 三个 dist 产物生成成功。  
Run: `npm run verify:dist`  
Expected: dist 新鲜度检查通过。

- [x] **Step 3: 检查计划覆盖。**

用 `rg` 检查本计划没有 `TBD`、`TODO` 或“适当处理”等占位描述；逐项核对设计规格第 2、4、5、6、7、8、9 节，确保宿主、工作台、业务接口、兼容和验收都有任务覆盖。

- [x] **Step 4: 提交计划更新。**

```bash
git add docs/superpowers/plans/2026-09-27-ai-workbench-sidebar.md
git commit -m "docs: add ai workbench sidebar implementation plan"
```

## 验收记录

- `npm run build`：Hydrogen 0.1.42、Oxygen/LTS 1.0.119，Oxygen 22 个模块。
- `npm run verify:dist`：dist 新鲜度通过。
- `npm test`：504 项通过，0 失败。
- 线上兼容性：linux.sb BBS1ORG v99.0；bbs1.org 交叉样本 v10.3；核心帖子与右栏选择器回归通过。




