# AI 工作台当前页列表查询实施计划

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 让 AI 操作台能在两阶段只读查询中检索当前已渲染的主题列表，并为匹配主题生成经本地校验的引用。

**Architecture:** 在 `ai-copilot` 内直接调用基座的列表解析器读取当前 DOM；查询计划 v2 只增加列表选择字段和不含帖子内容的页面列表概况。执行阶段本地过滤并只发送字段白名单，列表主题通过 `[[topic:<id>]]` 引用，引用 URL 由本地路由生成。现有追踪项和当前帖子楼层来源保持兼容。

**Tech Stack:** JavaScript ES modules、linux.sb userscript 插件、Node.js `node:test`、JSDOM、现有 `api.parse.list` / `api.parse.user`。

## Global Constraints

- 仅读取当前 DOM 已渲染的列表；不翻页、不发额外站点请求、不读取列表主题正文。
- 支持首页、版块、搜索结果（`/index.php` 或 `/search`）、精华、足迹，以及用户页中由列表解析器解析出的条目；其他页面不采集列表。
- 仅输出主题 ID、标题、作者名称、版块名称、回复数、最后活跃时间和置顶标记；不得将用户 ID、原始 HTML、原始 URL 或 DOM 元素发给模型。
- 当前列表最多发送 40 条，并与现有 `CONSOLE_MAX_CHARS` 共用字符预算；保留现有追踪范围和当前帖子楼层范围语义。
- `active-tracking` 作用域不能读取当前列表；计划须通过本地白名单校验。
- 列表引用只映射到本次本地结果中的 ID，链接使用 `api.routes.topic(id)`；拒绝模型提供的任意 URL。
- 保留工作区里与本功能无关的既有改动；不提交、不重置其他文件。

---

### Task 1: 读取当前 DOM 列表并升级查询计划协议

**Files:**
- Modify: `test/ai-copilot.test.js`
- Modify: `plugins/ai-copilot.user.js`

**Interfaces:**
- `consoleContext()` 增加 `currentListSupported: boolean`、`currentList: CurrentListItem[]`，并从实时 DOM 读取，不使用 `api.snapshot.list`。
- `CurrentListItem` 只含 `{ id, title, authorName, forumName, replies, lastActiveTs, pinned }`；`id` 必须是正整数。
- 查询计划 v2 必须含 `includeCurrentList: boolean`。本地在列表不支持、为空或 `forceTrackingOnly` 时强制设为 `false`。
- `buildConsolePlanRequest(question, context, scope)` 在第一阶段仅发送路由类型/必要 ID、追踪目录和 `{ supported, available, count }` 列表概况，不发送原始页面 URL 或任何列表条目字段；计划指纹含协议版本和列表概况。
- `normalizeConsolePlan()` 的本地可信计划另带 `currentListEmpty: boolean`；仅模型选择当前列表、当前页支持列表、列表为空且不在追踪专用范围时为 `true`。该字段不属于模型可提交的协议字段。

- [x] **Step 1: 写失败测试，验证当前上下文从实时 DOM 安全读取列表**

在 `test/ai-copilot.test.js` 增加以下测试辅助函数和测试。辅助函数放在 `homeHtml` 常量后，测试追加到 M4 查询测试附近：

```js
function listRow({ id = 4321, title = '实时列表主题', authorId = 9876, author = '作者甲' } = {}) {
  return `<li class="post-item topic-pinned"><div class="post-avatar"><a href="/user/${authorId}">${author}</a></div>` +
    `<a class="post-title" href="/topic/${id}">${title}</a><div class="post-meta"><a href="/forum/4">技术交流</a><span>23</span></div>` +
    `<span data-performance-time="1700000000"></span></li>`
}

test('M5 当前上下文：实时读取并清理当前 DOM 列表', async () => {
  const ctx = makeSite(homeHtml, 'https://linux.sb/')
  const dbg = await load(ctx)
  const list = ctx.w.document.querySelector('ul.post-list')
  list.insertAdjacentHTML('beforeend', listRow())
  const first = dbg.consoleContext()
  assert.equal(first.currentListSupported, true)
  assert.deepEqual(Object.keys(first.currentList.at(-1)).sort(),
    ['authorName', 'forumName', 'id', 'lastActiveTs', 'pinned', 'replies', 'title'])
  assert.equal(first.currentList.at(-1).id, 4321)
  assert.equal(first.currentList.at(-1).pinned, true)
  assert.doesNotMatch(JSON.stringify(first.currentList), /authorId|9876|\/topic\/|\/user\/|<li|"el"/)
  list.querySelector('a[href="/topic/4321"]').textContent = '刷新后的标题'
  assert.equal(dbg.consoleContext().currentList.at(-1).title, '刷新后的标题')
})
```

再增加两个测试：在 `https://linux.sb/user/77?tab=topics` 的 JSDOM 页面放入同一 `listRow()` 并断言当前用户主题可读；在 `https://linux.sb/daily_checkin` 页面断言 `currentListSupported === false` 且 `currentList` 为空。

- [x] **Step 2: 运行新增测试，确认它因当前列表接口缺失而失败**

运行：`node --test --test-name-pattern "M5 当前上下文" test/ai-copilot.test.js`

预期：新增断言因 `consoleContext().currentList` / `currentListSupported` 尚不存在而失败；现有测试的协议样例暂不更新，避免把本步骤的失败掩盖成协议解析失败。

- [x] **Step 3: 写失败测试，验证 v2 计划字段和本地收窄**

增加名为 `M5 计划：v2 必须含列表字段并在不可用或追踪范围收窄` 的测试。其计划对象为 `{ version: 2, intent: 'question', includeCurrentTopic: false, includeCurrentList: true, includeArchived: false, statuses: [], topicIds: [], terms: [] }`。断言：缺少字段或把字段改成字符串会抛错；当前列表可用且非空时为 `true`；将上下文改为不可用、空列表或 `forceTrackingOnly: true` 时归一为 `false`。调用 `buildConsolePlanRequest('查当前页列表', context)` 后，第一阶段文本须含 `{ supported, available, count }` 概况，不能含 `实时列表主题`、`作者甲`、`9876` 或 `/user/`。克隆 context 并只改变 `currentListSupported/currentList` 的可用状态后，计划指纹必须变化。

- [x] **Step 4: 运行协议测试，确认它们因仍是 v1 而失败**

运行：`node --test --test-name-pattern "M5 计划" test/ai-copilot.test.js`

预期：新测试因版本和必需字段不匹配失败；确认错误来自预期的计划协议断言。

- [x] **Step 5: 实现实时列表上下文和查询计划 v2**

在 `plugins/ai-copilot.user.js` 将 `CONSOLE_PLAN_VERSION` 改为 `2`。新增 `readCurrentList()`：仅 `home`、`forum`、`search`、`featured`、`footprint` 调用 `api.parse.list(document)`；`user` 调用 `api.parse.user(document).items`；其余页面返回 `{ supported: false, items: [] }`。映射到七个白名单字段并过滤 `!Number.isInteger(id) || id <= 0`。`consoleContext()` 把读取结果返回为 `currentListSupported` 与 `currentList`，路由只保留类型和必要 ID，不携带原始 href/query。

将 `includeCurrentList` 加入计划必需字段及类型验证，在 `!context.currentListSupported || !context.currentList.length || context.forceTrackingOnly` 时强制关闭。计划器系统提示解释用户问“当前页/当前列表/这页帖子”时选 `true`。第一阶段加入 `{ supported: context.currentListSupported, available: context.currentList.length > 0, count: context.currentList.length }`；查询指纹包含 `CONSOLE_PLAN_VERSION` 和完整列表概况，不含条目正文或标题。

- [x] **Step 6: 更新并运行测试**

将 `test/ai-copilot.test.js` 中所有操作台计划样例从版本 1 更新到版本 2，并为每个计划对象补上 `includeCurrentList: false`，之后运行：`node --test --test-force-exit test/ai-copilot.test.js`。

预期：当前列表读取、计划协议、已有操作台行为均通过。

### Task 2: 本地筛选、预算限制和主题级引用

**Files:**
- Modify: `test/ai-copilot.test.js`
- Modify: `plugins/ai-copilot.user.js`

**Interfaces:**
- `executeConsolePlan(plan, context)` 返回 `currentList: CurrentListItem[]`，并把匹配结果加入 `references`。
- 列表行按 `plan.terms` 对标题、作者名称和版块名称做现有关键词匹配；若 `topicIds` 非空，列表行也必须按主题 ID 过滤。
- 每条列表行最多生成一个 `{ kind: 'topic', topicId, floor: 0, issueId: '', excerpt, href, known: true }` 引用记录；`href` 只能来自本地 `api.routes.topic(topicId)`。
- 新的模型引用格式为 `[[topic:<id>]]`；现有 `[[topic:<id> floor:<n> ...]]` 和 `[#<n>]` 引用继续有效。

- [x] **Step 1: 写失败测试，验证当前列表本地筛选与白名单**

增加名为 `M5 执行：筛选当前列表并只发送白名单主题字段` 的测试，给 `executeConsolePlan()` 传入以下形状的 context：

```js
currentList: [
  { id: 4321, title: '缓存刷新方案', authorName: '作者甲', forumName: '技术交流', replies: 23, lastActiveTs: 1700000000, pinned: true, authorId: 9876, url: '/topic/4321', el: {} },
  { id: 4322, title: '显卡选购', authorName: '作者乙', forumName: '硬件交流', replies: 5, lastActiveTs: 1700000001, pinned: false },
  { id: 0, title: '无效 ID', authorName: '作者丙', forumName: '', replies: null, lastActiveTs: null, pinned: false },
]
```

计划设置 `includeCurrentList: true, topicIds: [], terms: ['缓存']`。断言只返回 ID `4321`；行属性只等于七字段；不存在 `authorId` / `url` / `el`；引用 ID 只有 `4321`。另测 `topicIds: [4322]` 时列表 ID 可在追踪目录之外通过本地校验并只留下 ID `4322`。

- [x] **Step 2: 运行新增执行器测试，确认它们因列表未接入而失败**

运行：`node --test --test-name-pattern "M5 执行：筛选" test/ai-copilot.test.js`

预期：`currentList` 结果为空或计划拒绝仅存在于页面列表中的主题 ID，且失败信息与上述行为一致。

- [x] **Step 3: 写失败测试，验证 40 条和总字符预算**

增加名为 `M5 执行：列表按 40 条和共享字符预算截断` 的测试。传入用 `Array.from({ length: 45 }, (_, index) => ({ id: 5000 + index, title: '短标题', authorName: '作者', forumName: '', replies: 0, lastActiveTs: 0, pinned: false }))` 生成的列表，断言输出 40 条且 `truncated === true`。第二组把每条标题设为 `'字'.repeat(9000)` 并同时提供一个匹配的短 `currentTopic.posts`，断言 `chars <= 18000`、列表截断且未超预算。

- [x] **Step 4: 运行预算测试，确认它们因当前列表没有限制而失败**

运行：`node --test --test-name-pattern "M5 执行：列表" test/ai-copilot.test.js`

预期：至少 40 条上限断言失败；字符预算断言不得因测试数据本身无效而失败。

- [x] **Step 5: 实现列表执行、过滤和引用映射**

在 `normalizeConsolePlan` 中构建允许 ID 集合：追踪目录 ID、`context.currentList` 的有效 ID 和当前主题 ID。归一化计划另带本地 `currentListEmpty` 标记，值为 `raw.includeCurrentList && context.currentListSupported && !context.currentList.length && !context.forceTrackingOnly`；它不接受模型直接提供。`executeConsolePlan` 在共享 `CONSOLE_MAX_CHARS` 计数器下处理当前帖子、当前列表和追踪项；列表按 DOM 顺序筛选，`topicIds` 非空时按 ID 保留，`terms` 匹配标题/作者/版块，最多 40 条，逐条序列化计入总预算，并为保留主题建立本地引用。

增加名为 `M5 引用：主题级引用只映射本地 ID` 的测试：为 ID `4321` 提供本地 topic reference 后，`[[topic:4321]]` 得到 `known: true` 且 href `/topic/4321`；`[[topic:9999]]` 得到 `known: false` 且 `href: null`，即使答案文本另有 `https://evil.example` 也不采信。`consoleCitationRecords` 增加严格匹配 `[[topic:(\d+)]]` 的分支，只引用 `references` 中 `kind: 'topic'` 且 ID 匹配的条目；href 由 `api.routes.topic(id)` 生成。保留楼层引用逻辑。主题级引用在 UI 中显示“主题 #ID”，不显示楼层号。

- [x] **Step 6: 更新并运行执行器与引用测试**

运行：`node --test --test-force-exit test/ai-copilot.test.js`

预期：关键词筛选、主题 ID 过滤、字段白名单、40 条上限、字符预算、合法/未知引用测试均通过。

### Task 3: 接入两阶段问答、缓存和空列表边界

**Files:**
- Modify: `test/ai-copilot.test.js`
- Modify: `plugins/ai-copilot.user.js`

**Interfaces:**
- 回答阶段收到 `operationResults.currentList` 的白名单对象，并被要求使用 `[[topic:<id>]]` 引用列表主题。
- 回答缓存指纹含实际本地操作结果；列表条目变更后不能复用旧答案。
- 若计划选择了当前列表但列表为空，结果元数据保留空列表说明；其他来源仍有结果时继续回答，所有来源均无材料时跳过回答模型并返回清楚的空结果提示。
- 不支持列表的页面不执行额外站点请求，也不因列表能力缺失报错。

- [x] **Step 1: 写失败测试，验证模型选择列表并接收安全数据**

增加名为 `M5 两阶段：当前列表可用并只发送本地白名单数据` 的集成测试。LLM 计划回复为 `{ version: 2, intent: 'question', includeCurrentTopic: false, includeCurrentList: true, includeArchived: false, statuses: [], topicIds: [], terms: [] }`，答案回复为 `命中 [[topic:4321]]`。断言总 LLM 调用数为 2；第一阶段不含 `实时列表主题`、`作者甲`、`9876` 或原始 URL；第二阶段包含白名单行与 `[[topic:<id>]]` 指令，但不含 `authorId`、`/user/9876` 或 DOM；引用 `known === true` 且 href 是 `/topic/4321`。

- [x] **Step 2: 运行集成测试，确认它因现有答案协议和执行器未支持列表而失败**

运行：`node --test --test-force-exit test/ai-copilot.test.js`

预期：列表数据不在回答请求中，或主题级引用未验证，失败原因对应新功能。

- [x] **Step 3: 写失败测试，验证空列表、无支持列表和仅追踪结果**

增加名为 `M5 边界：空/不支持的列表正确说明且不请求站点` 的测试。第一例在首页移除所有 `li.post-item`，计划器选 `includeCurrentList: true`，断言回答文本含“当前列表为空”、LLM 只调用 1 次。第二例给相同空列表写入一个本地追踪问题，断言 LLM 调用 2 次且第二阶段 `operation-results` 包含列表空状态和追踪项。第三例在 `/daily_checkin` 上计划器选择 `true`，断言返回计划为 `false` 且 `ctx.calls` 中没有 linux.sb 请求。

- [x] **Step 4: 运行边界测试，确认它们因空列表状态尚未暴露而失败**

运行：`node --test --test-force-exit test/ai-copilot.test.js`

预期：至少一项空列表提示或无支持页面的本地收窄断言失败；检查站点请求计数只包含原测试预期请求。

- [x] **Step 5: 实现回答上下文、状态提示和缓存验证**

扩展回答阶段系统提示：主题列表来源用 `[[topic:<id>]]`，帖子/追踪证据沿用楼层格式。执行结果返回 `currentList`、`currentListSupported`、`currentListEmpty`，其中 `currentListEmpty` 由已校验计划的本地标记派生；答案指纹继续包含整个 `operationResults`，故列表行变化会失效答案缓存。`hasResults` 仅在追踪项、当前楼层或列表行至少有一个时为真。全空时返回 `当前列表为空。`（列表不支持时返回 `没有找到符合条件的本地材料。`）；有其他来源结果时仍调用回答模型并传递空列表状态。保持 `active-tracking` 强制排除列表。

- [x] **Step 6: 验证计划缓存版本和列表变化时答案缓存失效**

增加名为 `M5 缓存：版本与列表变化使查询缓存按边界失效` 的测试：同一问题的可用/不可用 context 生成不同 plan fingerprints；仅修改 `currentList[0].title` 时 plan fingerprint 相同，但 `buildConsoleAnswerRequest(...).fingerprint` 不同。然后运行：`node --test --test-force-exit test/ai-copilot.test.js`。

预期：查询计划和答案缓存按各自输入边界失效，所有 AI 副驾测试通过。

### Task 4: 构建发行文件并完成回归验证

**Files:**
- Modify: `plugins/ai-copilot.user.js` userscript header/manifest version
- Modify: `plugins/ai-workbench.user.js` and `test/ai-workbench.test.js` for safe citation persistence/restoration
- Modify: `build-suite.mjs` suite version
- Modify: `suite/suite-center.js` and `test/suite.test.js` to align and verify the suite release version
- Modify: `README.md` AI 副驾能力与发行版本说明
- Modify through build: `dist/linuxsb-suite.user.js`
- Modify through build: `dist/linuxsb-lts.user.js`
- Modify through build: other generated `dist/*.user.js` files only if `npm run build` changes them from current sources.

**Interfaces:**
- 发行包内 `ai-copilot` 内容与 `plugins/ai-copilot.user.js` 一致。
- AI 副驾 userscript header 和 manifest 均为 `0.7.5`；Oxygen suite banner 为 `1.0.125`，LTS 版本跟随 suite banner。
- 构建不应改动非生成源文件或清除已有工作区修改。

- [x] **Step 1: 构建完整发行包**

运行：`npm run build`

预期：Oxygen suite 和 LTS 发行文件包含计划 v2、当前列表解析及主题级引用实现，构建退出码为 0。

- [x] **Step 2: 运行副驾测试、全量测试、发行校验和差异检查**

依次运行：

```powershell
node --test --test-force-exit test/ai-copilot.test.js
npm test
npm run verify:dist
git diff --check
```

预期：上述命令全部退出码为 0；全量测试输出无失败；`verify:dist` 确认发行包与插件源一致。

- [x] **Step 3: 核对最终改动边界**

运行：`git status --short; git diff --stat; git diff -- docs/superpowers/specs/2026-10-01-ai-current-page-list-query-design.md docs/superpowers/plans/2026-10-01-ai-current-page-list-query-implementation-plan.md test/ai-copilot.test.js plugins/ai-copilot.user.js`

确认本次代码变更限于 AI 副驾测试、插件和构建产生的发行包；工作区其他原有改动仍保留。本任务不创建提交。
