# M15：Gemini 式 AI 工作台侧栏重构 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task. 本计划在 `D:\test\linuxsb-base` 当前工作树内联执行；用户明确禁止派发子代理。每个任务保留可审阅的未提交 diff，不执行 `git commit`、`git push`、`reset` 或 `clean`。

**Goal:** 将现有 AI 工作台重构为固定深色、Gemini 风格的欢迎态/消息态侧栏，并通过自然语言意图路由和材料附加范围隔离保留 M12–M14 的连续对话、停止、流式、引用复核和写操作安全链。

**Architecture:** 基座 UI 提供受控的 `shellAsideSelect(id)` 选择接口，skin 负责把它映射到内部侧栏 tab；ai-workbench 只通过公开 API 管理侧栏视图，不查询 skin DOM。工作台把欢迎区、消息流、底部 composer 和菜单收进一个固定深色外壳，当前 turn 增加 `materialMode` 与本地意图结果；detached turn 使用独立对话范围并从请求、引用账本和缓存指纹中排除页面材料。

**Tech Stack:** 原生 JavaScript userscript、基座 ESM 模块、Tampermonkey fetch/GM 网络层、Node `node:test`、jsdom、esbuild、本地 Chromium/Edge CDP 验收脚本。

## Global Constraints

- 实际仓库为 `D:\test\linuxsb-base`；已有 M12–M14 及更早未提交修改只能增量编辑，不能用整体 diff 推断本轮范围。
- 每项生产代码修改先写一个能证明缺失行为的失败测试并运行确认失败，再写最小实现；测试通过后才能重构。
- 对话存储继续使用 `version: 1`；旧 turn 缺少 `materialMode` 时读取为 `attached`，旧字段和引用继续可显示。
- detached 请求只携带问题和协议字段，不携带页面正文、主题列表、追踪项、帖子 ID、楼层、原始 URL 或引用账本，也不生成当前页面引用。
- attached 与 detached 的对话范围、请求缓存指纹和压缩指纹必须不同；重新附加材料只恢复范围，不自动发请求。
- 历史中的写操作、提示注入文本和旧引用不能授权当前 turn 的写能力；写操作继续经过现有 plan/confirm/execute/result-check 链。
- 旧 `data-ai-chat-context`、`data-ai-chat-mode`、`data-ai-chat-mode-options` 选择器保留一个版本周期，仅用于兼容测试和内部调用，不恢复为可见选项卡或 Smart 选择器。
- 工作台版本由 `0.7.1` 升至 `0.8.0`；若基座公开 API 发生版本变化，基座同步升一个补丁版本，Hydrogen/Oxygen/LTS 产物由构建脚本同步。
- 不实现语音输入、多模型账户管理、端点协议变更、对话导入导出或私有推理展示。
- 交付前必须运行 `npm test`、`npm run build`、`npm run verify:dist`、`git diff --check` 和 `node scripts/check-ai-workbench-browser.mjs`，再进行真实浏览器验收。

---

### Task 1: 受控侧栏选择 API（M15.1 基座边界）

**Files:**
- Modify: `src/ui.js`（侧栏视图注册与 controller）
- Modify: `src/core.js`（插件 API 暴露）
- Modify: `plugins/skin.user.js`（注册内部选择 controller）
- Modify: `test/core.test.js`
- Modify: `test/skin.test.js`

**Interfaces:**
- `UI.registerShellAsideController(fn) -> ()` 注册一个内部选择回调，重复注册时替换旧回调，注销后恢复安全空操作。
- `UI.shellAsideSelect(id) -> string` 只接受 `site` 或已注册侧栏视图 ID，未知 ID 返回并选中 `site`。
- 插件 API `api.ui.shellAsideSelect(id) -> string` 需要 `ui` 权限；`api.ui.shellAsideView` 及 `api.ui.shellAsideViews` 保持原签名。
- skin 在初始化时注册 controller，controller 调用现有 `asideSetActive(id, aside, true)`，工作台不直接访问 `#lsb-shell-aside`。

- [ ] **Step 1: 写失败测试**

在 `test/core.test.js` 增加：

```js
test('M15 shellAsideSelect 只选择已注册视图并对未知 ID 回退 site', () => {
  const core = boot()
  let api
  core.register({ id: 'aside-probe', version: '1.0.0', permissions: ['ui'] }, (a) => {
    api = a
  })
  assert.equal(api.ui.shellAsideSelect('unknown'), 'site')
  assert.equal(api.ui.shellAsideSelect('site'), 'site')
})
```

在 `test/skin.test.js` 增加：

```js
test('M15 skin controller 通过公开 API 关闭工作台并持久化站点 tab', async () => {
  const { w } = makeSite()
  await loadBase(w, PLUG('skin.user.js'))
  w.LSB.__core.ui.shellAsideSelect('site')
  assert.equal(w.document.querySelector('[data-lsb-shell-aside-tab="site"]')?.getAttribute('aria-selected'), 'true')
})
```

- [ ] **Step 2: 运行失败测试**

运行：

```text
node --test test/core.test.js test/skin.test.js --test-name-pattern="M15 shellAsideSelect|M15 skin controller"
```

预期：`api.ui.shellAsideSelect` 未定义，且 skin 没有 controller 入口。

- [ ] **Step 3: 写最小实现**

在 `UI` 构造函数增加 `this._shellAsideController = null`；实现注册、注销和选择方法。选择方法验证 `id === 'site' || this._shellAsideViews.some(view => view.id === id)`，无效时把 `site` 传给 controller；没有 controller 时只返回安全 ID，不抛异常。

在 `src/core.js` 的 `api.ui` 增加权限检查后的 `shellAsideSelect`，在 `src/ui.js` 保持返回值为规范化字符串。

在 skin 的 `setup` 中注册 controller，回调调用 `asideSetActive`；`syncAsideViews` 完成后再注册或重绑 controller，停用时注销 controller。controller 不读取或修改工作台节点。

- [ ] **Step 4: 运行通过测试**

运行定向测试和现有 UI 基座测试：

```text
node --test test/core.test.js test/skin.test.js --test-name-pattern="M15|侧栏|shell"
```

预期：新增断言和原有侧栏 tab、权限、停用清理测试全部通过。

---

### Task 2: Gemini 式深色工作台外壳（M15.1）

**Files:**
- Modify: `plugins/ai-workbench.user.js`（renderChat、renderWorkbench、消息/菜单/CSS）
- Modify: `test/ai-workbench.test.js`
- Modify: `scripts/check-ai-workbench-browser.mjs`

**Interfaces:**
- 可见根节点 `[data-ai-workbench]` 内固定包含 `[data-ai-workbench-topbar]`、`[data-ai-workbench-content]`、`[data-ai-workbench-composer-shell]`。
- 顶部按钮 `[data-ai-workbench-more]`、`[data-ai-workbench-close]`；菜单状态使用 `state.openMenu`。
- 欢迎节点 `[data-ai-workbench-welcome]`、`[data-ai-workbench-star]`、`[data-ai-workbench-suggestions]`，只有当前对话没有 turns 时可见。
- composer 节点继续使用 `[data-ai-chat-input]`、`[data-ai-chat-send]`、`[data-ai-chat-stop]`，并增加 `[data-ai-workbench-material]`、`[data-ai-workbench-material-remove]`、`[data-ai-workbench-attach]`、`[data-ai-workbench-model]`。
- 关闭按钮调用 `api.ui.shellAsideSelect('site')` 并停止当前只读请求；建议按钮只填充并聚焦输入框。

- [ ] **Step 1: 写失败 DOM 测试**

在 `test/ai-workbench.test.js` 增加：

```js
test('M15 空会话显示欢迎态和单一 Gemini composer，不显示旧能力选项卡', async () => {
  const w = makeSite()
  await load(w)
  const wb = w.document.querySelector('[data-ai-workbench]')
  assert.ok(wb.querySelector('[data-ai-workbench-welcome]'))
  assert.ok(wb.querySelector('[data-ai-workbench-star]'))
  assert.ok(wb.querySelector('[data-ai-workbench-composer-shell]'))
  assert.equal(wb.querySelector('[data-ai-chat-mode-options]'), null)
  assert.doesNotMatch(wb.textContent, /@ 当前页面|\/ 提问|Smart/)
})

test('M15 建议问题只填充输入框，首轮消息后欢迎态隐藏', async () => {
  const w = makeSite()
  await load(w)
  const wb = w.document.querySelector('[data-ai-workbench]')
  wb.querySelector('[data-ai-workbench-suggestion]').click()
  assert.ok(wb.querySelector('[data-ai-chat-input]').value.length > 0)
  assert.equal(wb.querySelector('[data-ai-chat-send]').dataset.busy, 'false')
  wb.querySelector('[data-ai-chat-send]').click()
  assert.equal(await until(() => wb.querySelector('[data-ai-workbench-welcome]')?.hidden === true), true)
})
```

- [ ] **Step 2: 运行失败测试**

运行：

```text
node --test test/ai-workbench.test.js --test-name-pattern="M15 空会话|M15 建议问题"
```

预期：现有工作台没有欢迎态、材料条和新结构，或仍渲染可见模式选项。

- [ ] **Step 3: 写最小 DOM/CSS 实现**

重组 `renderChat` 外壳，保留现有消息渲染、阶段时间线、重试和停止绑定；将欢迎内容从 turns 判断生成，将消息容器放入独立可滚动内容区。composer 外壳内部放材料条和工具行；菜单相对 composer 外壳用 `bottom: calc(100% + 8px)` 及实际外壳高度定位，不覆盖输入卡。

使用工作台独立深色 CSS 变量，宽屏宽度 360–384px，并给 `html` 添加/移除 `lsb-ai-workbench-open`，让 skin 与 `--lsb-shell-aside` 使用同一宽度。保留旧隐藏 data 属性但不生成可见 `@`、`/`、Smart 文案。

顶部更多菜单提供新建、历史、清空、AI 设置和低频处理方式入口；关闭调用 `api.ui.shellAsideSelect('site')`。模型标签从 `copilot.providerState().model` 读取，没有模型时显示“配置模型”。

- [ ] **Step 4: 运行通过测试**

运行完整工作台回归：

```text
node --test test/ai-workbench.test.js
```

预期：M12/M13/M14 的请求、停止、流式、复核和写操作测试与新增 DOM 测试全部通过。

- [ ] **Step 5: 更新浏览器失败断言并确认失败**

在 `scripts/check-ai-workbench-browser.mjs` 加入侧栏宽度、深色状态、欢迎态、建议按钮、composer 底部几何和菜单不覆盖断言，先运行脚本确认旧实现无法满足至少一项新断言。

---

### Task 3: 自然语言意图路由（M15.2）

**Files:**
- Modify: `plugins/ai-workbench.user.js`
- Modify: `test/ai-workbench.test.js`

**Interfaces:**
- `detectChatIntent(question, options = {}) -> { capability, confidence, source: 'local', reason }`。
- `options` 支持 `route`、`materialMode`、`hasTopic`、`hasTracking`、`capabilities`；缺省值安全降级。
- 返回 capability 只允许 `ask`、`topic-ask`、`disagreement`、`comparison`、`unresolved`、`new-replies`、`draft`、`tracking`、`site-action`、`research`。
- 通过 setup exports 暴露 `detectChatIntent`，测试从 `w.LSB.__core.plugins.get('ai-workbench').exports` 调用。

- [ ] **Step 1: 写失败纯函数测试**

加入：

```js
test('M15 本地意图路由覆盖只读、检索、追踪、比较和写请求', async () => {
  const w = makeSite()
  await load(w)
  const detect = w.LSB.__core.plugins.get('ai-workbench').exports.detectChatIntent
  assert.equal(detect('分析这个帖子分歧', { hasTopic: true }).capability, 'disagreement')
  assert.equal(detect('搜索相关主题', { hasTopic: true }).capability, 'research')
  assert.equal(detect('追踪有没有新证据', { hasTracking: true }).capability, 'tracking')
  assert.equal(detect('请回复这条帖子', { hasTopic: true }).capability, 'site-action')
  assert.equal(detect('你好', {}).capability, 'ask')
})

test('M15 detached 材料不能让需要当前页面的能力读取材料', async () => {
  const w = makeSite()
  await load(w)
  const detect = w.LSB.__core.plugins.get('ai-workbench').exports.detectChatIntent
  const result = detect('分析这个帖子', { materialMode: 'detached', hasTopic: true })
  assert.equal(result.capability, 'ask')
  assert.equal(result.reason, 'fallback')
  assert.equal(result.source, 'local')
})
```

- [ ] **Step 2: 运行失败测试**

运行：

```text
node --test test/ai-workbench.test.js --test-name-pattern="M15 本地意图|M15 detached 材料"
```

预期：exports 没有函数或所有问题仍进入旧固定模式。

- [ ] **Step 3: 写最小实现并接入发送**

实现 Unicode 归一化后的关键词优先级：写动词和目标为 `site-action`；搜索/查找为 `research`；追踪、新证据、未解决为 `tracking`/`unresolved`；分歧/争议为 `disagreement`；比较/对比/方案为 `comparison`；帖子/楼层分析为 `topic-ask`；其余为 `ask`。能力不在 `capabilities` 或材料为 detached 时，返回 `ask`、低置信度和 `fallback`。

发送前调用该函数，把结果写入当前 turn 的 `intent` 和请求选项；旧历史只作为只读文本，不参与能力授权。低频能力菜单只作为本地兜底，不再作为普通输入框选项。

- [ ] **Step 4: 运行通过测试**

运行新增测试和完整工作台测试：

```text
node --test test/ai-workbench.test.js
```

---

### Task 4: 材料附加/取消、范围与缓存隔离（M15.2）

**Files:**
- Modify: `plugins/ai-workbench.user.js`
- Modify: `test/ai-workbench.test.js`
- Modify: `plugins/ai-copilot.user.js`（请求体、缓存和范围字段）
- Modify: `test/ai-copilot.test.js`
- Modify: `src/ai-conversation.js`（仅在现有纯函数边界需要扩展时）
- Modify: `test/ai-conversation.test.js`

**Interfaces:**
- `normalizedConversationTurn(raw)` 默认 `materialMode: 'attached'`，接受 `attached|detached` 和可选 `intent`。
- `currentConversationScope(state)`、`conversationRowsForTurn`、`sameConversationScope` 和 `conversationContextForTurn` 将 `materialMode` 纳入比较与指纹。
- `buildRequest`/`runTopic`/`runConsoleQuery` 的现有选项增加 `materialMode`，detached 时构造空材料上下文和空引用账本。
- `[data-ai-workbench-material-remove]` 只改变当前内存状态和下一轮范围，不自动请求；`[data-ai-workbench-attach]` 重新附加当前可用材料但不自动请求。

- [ ] **Step 1: 写失败测试**

在 `test/ai-conversation.test.js` 加入：

```js
test('M15 materialMode 参与会话范围和历史指纹', () => {
  const attached = normalizedConversationTurn({ id: 'a', question: 'q', materialMode: 'attached' })
  const detached = normalizedConversationTurn({ id: 'b', question: 'q', materialMode: 'detached' })
  assert.equal(attached.materialMode, 'attached')
  assert.equal(detached.materialMode, 'detached')
  assert.equal(sameConversationScope({ materialMode: 'attached' }, { materialMode: 'detached' }), false)
})
```

在 `test/ai-workbench.test.js` 加入请求体和缓存隔离断言：

```js
test('M15 取消材料后请求不含页面材料和引用，重新附加后恢复', async () => {
  const w = makeSite()
  const bodies = []
  w.fetch = async (url, init) => {
    bodies.push(JSON.parse(init.body))
    return { status: 200, ok: true, url: String(url), text: async () => JSON.stringify({ choices: [{ message: { content: '无材料回答' } }] }) }
  }
  await load(w)
  const wb = w.document.querySelector('[data-ai-workbench]')
  wb.querySelector('[data-ai-workbench-material-remove]').click()
  wb.querySelector('[data-ai-chat-input]').value = '只回答问题'
  wb.querySelector('[data-ai-chat-send]').click()
  assert.equal(await until(() => bodies.length === 1), true)
  assert.equal(bodies[0].messages.some((m) => /当前页面|帖子正文|引用/.test(String(m.content))), false)
  assert.equal(wb.querySelector('[data-ai-chat-citations]'), null)
  wb.querySelector('[data-ai-workbench-attach]').click()
  assert.equal(wb.querySelector('[data-ai-workbench-material]').hidden, false)
})
```

在 `test/ai-copilot.test.js` 加入：

```js
test('M15 attached 与 detached 请求不共享缓存', async () => {
  const attached = await runTopicWith({ question: '相同问题', materialMode: 'attached' })
  const detached = await runTopicWith({ question: '相同问题', materialMode: 'detached' })
  assert.notEqual(attached.meta.cacheFingerprint, detached.meta.cacheFingerprint)
  assert.notEqual(attached.meta.scopeFingerprint, detached.meta.scopeFingerprint)
})
```

- [ ] **Step 2: 运行失败测试**

运行：

```text
node --test test/ai-conversation.test.js test/ai-workbench.test.js test/ai-copilot.test.js --test-name-pattern="M15 material|M15 取消材料|M15 attached"
```

预期：旧 turn 没有 materialMode，detached 请求仍会收集页面材料，两个模式可能命中相同缓存。

- [ ] **Step 3: 写最小规范化和范围实现**

在 conversation 纯函数中对旧记录补 `attached`；把 materialMode 放入 scope serialization、history fingerprint、compression fingerprint 和 turn cache key。detached 仅保留同一 detached scope 的合规只读 turns，切换 attached 后创建新 scope，不把 detached 历史当作当前材料证据。

在 `submitChatTurn` 发送前根据状态采集材料；detached 分支跳过页面/帖子/追踪采集、引用账本和 evidence meta，同时保留协议所需的 route-independent 字段。材料取消/附加只调用 render，不调用 submit。

- [ ] **Step 4: 写最小缓存和请求实现**

在 copilot 的请求语义指纹加入 `materialMode` 和路由版本；缓存候选必须同时匹配 scope 与 materialMode，旧缓存缺少字段时不复用。attached 保持既有 evidence/citation 流程，detached 写入空 citations 并禁止引用渲染。

- [ ] **Step 5: 运行通过定向和回归测试**

运行：

```text
node --test test/ai-conversation.test.js test/ai-copilot.test.js test/ai-workbench.test.js
```

预期：材料隔离测试通过，M12–M14 连续对话、停止、流式、压缩、复核和写操作测试保持通过。

---

### Task 5: 兼容迁移、版本同步和完整验收（M15.3）

**Files:**
- Modify: `plugins/ai-workbench.user.js`（版本、兼容字段、低频菜单）
- Modify: `plugins/skin.user.js`（宽度变量/关闭清理）
- Modify: `src/core.js`（若基座版本同步）
- Modify: `package.json`
- Modify: `package-lock.json`
- Modify: `README.md`
- Modify: `build-suite.mjs`
- Modify: `suite/suite-center.js`
- Modify: `dist/linuxsb-base.user.js`
- Modify: `dist/linuxsb-suite.user.js`
- Modify: `dist/linuxsb-lts.user.js`
- Modify: `scripts/check-ai-workbench-browser.mjs`
- Modify: `test/ai-workbench.test.js`
- Modify: `test/core.test.js`
- Modify: `test/skin.test.js`
- Modify: `test/suite.test.js`

**Interfaces:**
- 旧 version 1 conversation 可读；旧 turn 的 `materialMode` 缺失时显示 attached，旧 context/citations 不丢失。
- 关闭、路由切换和刷新不迁移或自动重放在途请求；只读请求可重试，站内写操作沿用结果检查，迟到响应不能覆盖新 turn。
- `scripts/check-ai-workbench-browser.mjs` 使用本地 fixture/模拟模型验证 UI、意图、材料取消、重新附加、停止、重试、网络中断、引用和写操作确认。

- [ ] **Step 1: 写失败兼容和浏览器断言**

在工作台测试加入旧 turn 迁移：

```js
test('M15 旧 turn 缺少 materialMode 时按 attached 显示且不丢引用', async () => {
  const w = makeSite()
  w.localStorage.setItem('lsb_base:ai-workbench:conversations', JSON.stringify({
    version: 1,
    activeId: 'legacy',
    conversations: [{ id: 'legacy', turns: [{ id: 't1', question: '旧问题', answer: '旧回答', citations: [{ topicId: 1, floor: 1 }] }] }],
  }))
  await load(w)
  const turn = JSON.parse(w.localStorage.getItem('lsb_base:ai-workbench:conversations')).conversations[0].turns[0]
  assert.equal(turn.materialMode, 'attached')
  assert.equal(turn.citations[0].floor, 1)
})
```

在浏览器脚本中先断言 `[data-ai-workbench]` 的宽度在 360–384px、`html.lsb-ai-workbench-open` 存在、更多/材料菜单的 bottom 小于 composer top，并断言 detached 请求没有页面材料与引用；运行确认缺失断言时失败。

- [ ] **Step 2: 实现兼容、版本和低频入口**

规范化旧 turn 时补 attached，保留 `contextKind`、citations、answer、state；不要自动重放请求。更多菜单的历史/清空/设置沿用既有 handlers，能力兜底放二级入口。停用工作台时移除 html 状态类、菜单和监听器，保留本地对话。

更新工作台版本到 `0.8.0`，package/base 版本按现有发布规则同步，README 的插件清单和行为描述加入固定深色侧栏、自然语言路由和材料取消规则；执行构建脚本生成三份产物，不手改产物中的单独逻辑。

- [ ] **Step 3: 运行完整自动化验证**

依次运行：

```text
npm test
npm run build
npm run verify:dist
git diff --check
node scripts/check-ai-workbench-browser.mjs
```

每条命令都必须成功；任一失败先补对应回归测试并修复，不能以跳过或删除断言代替。

- [ ] **Step 4: 真实浏览器验收**

使用 Edge/Chromium 打开本地 fixture 页面，逐项确认：固定深色 360–384px 侧栏、欢迎态/消息态切换、建议问题填充、composer 底部固定、更多/材料菜单不覆盖输入卡、关闭回到站点、自然语言路由、材料 `×` 后无页面材料与引用、重新附加恢复引用、停止后立即可提问、重试不重复写操作、网络中断与引用渲染可见。

- [ ] **Step 5: 交付前自审**

运行关键词扫描确认计划没有未完成标记，再检查计划中的字段名、函数名和测试选择器与实现一致。保留所有工作树修改，不执行提交或推送。

