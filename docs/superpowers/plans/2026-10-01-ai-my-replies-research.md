# AI 工作台本人回帖检索 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 允许用户明确检索本人回帖，并在选定最多 3 条后以真实主题楼层为证据回答。

**Architecture:** 在用户页解析层增加回帖候选解析器；`ai-copilot` 将 `my-replies` 作为受限个人来源，UID 仅由本地登录状态构造路由。工作台逐页显示候选，用户选择回帖后 copilot 才读取相应主题页并把选中的楼层交给回答模型。

**Tech Stack:** JavaScript、linux.sb Userscript 插件、`src/site.js` 站点解析器、`api.routes.user` / `api.routes.topic` / `api.net.doc`、Node.js `node:test`、JSDOM。

## Global Constraints

- 仅当用户明确提到“我的回帖”等本人回帖请求，或在工作台主动选择本人回帖数据源时读取。
- 本人身份只能取自当前本地登录状态。计划器不得提交用户 ID；身份缺失或无法验证时停止请求。
- 候选页由用户逐页手动加载，不遍历后续页面。
- 用户最多选择 3 条回帖。仅所选回帖进入正文读取和回答请求。
- 候选、正文和原始个人页 URL 不持久化。
- 工作区已有未提交改动和已修改的发行产物。只编辑本计划列出的源文件与测试；构建前检查现有 dist 差异，不重置或清理它们。

---

## File Structure

- `src/site.js`：新增 profile replies 列表的只读白名单解析器。
- `src/core.js`：只暴露新解析器，不增加网络权限。
- `test/fixtures/user-replies.html`：经过脱敏的回帖 tab 最小 DOM fixture。
- `test/site.test.js`：校验主题、页码、楼层和正文来源。
- `plugins/ai-copilot.user.js`：新增 `my-replies` 来源、内存候选和选择后主题页读取。
- `plugins/ai-workbench.user.js`：提供明确个人来源、逐页候选、最多 3 条选择和引用展示。
- `test/ai-copilot.test.js`、`test/ai-workbench.test.js`：验证隐私边界和交互。

计划依赖主题深读计划中的已读页账本和共享字符预算；按“主题深读 → 本人回帖 → 站内互动”的顺序执行，三项仍属于同一轮交付。

### Task 1: 建立本人回帖解析契约

**Files:**
- Create: `test/fixtures/user-replies.html`
- Modify: `src/site.js`
- Modify: `src/core.js`
- Test: `test/site.test.js`

**Interfaces:**
- 新增 `parseUserReplies(root)`，每条仅返回 `{ postId, topicId, topicTitle }`。
- 仅解析活动用户页 `tab=replies` 中 `a.post-title` 的 `/topic/<topicId>?replyid=<postId>` 同源本站链接；`postId`、`topicId` 必须是正安全整数。楼层、实际页码和正文要在用户选中后读取主题页时解析。
- 解析结果不返回 DOM 节点、原始 href、用户 ID 或原始 HTML。
- `src/core.js` 在 `api.parse.userReplies` 下暴露此纯函数。

- [ ] **Step 1: 用脱敏 fixture 写回帖列表解析失败测试**

```js
const replies = parseUserReplies(load('user-replies.html').document)
assert.deepEqual(replies[0], { postId: 8102, topicId: 4321, topicTitle: '主题标题' })
assert.equal(JSON.stringify(replies).includes('user/5372'), false)
```

fixture 包含一条有效的 `/topic/4321?replyid=8102` 同源回帖、一条缺 reply ID、一条外域链接和一条非 `tab=replies` 内容；后 3 条不得成为候选。

运行：`node --test --test-name-pattern="parseUserReplies 只返回可定位的回帖" test/site.test.js`  
预期：因解析器未导出而失败。

- [ ] **Step 2: 实现只读回帖列表解析器**

基于脱敏 fixture 与已检查的 linux.sb `tab=replies` DOM，解析活动用户页 `.forum-main ul.post-list > li.post-item a.post-title`。只接受同源本站 `/topic/<id>?replyid=<postId>`，候选只提供主题标题和两个本地数字 ID，不读取或推断主题作者、主题时间、回帖作者、楼层、页码或正文。新增 `api.parse.userReplies` 暴露，不改 `parseList()` 的主题列表语义。

- [ ] **Step 3: 运行解析测试**

运行：`node --test --test-name-pattern="parseUserReplies 只返回可定位的回帖|他人主页时不把被访问者当成自己" test/site.test.js`  
预期：仅有效回帖保留；作者身份与本地 `api.me` 身份区分不回归。

### Task 2: 增加受限 `my-replies` 来源和手动候选分页

**Files:**
- Modify: `plugins/ai-copilot.user.js`
- Test: `test/ai-copilot.test.js`

**Interfaces:**
- `resolveResearchSource(question, requested)` 只在明确本人回帖表达或 `requested === 'my-replies'` 时返回 `my-replies`。
- `buildResearchPlanRequest()` 对该来源要求 `field: 'reply'`；个人身份与 UID 不进入模型输入。
- `startResearch()` 记录本地 `api.me.uid` 到内存 session，第一页只请求固定 `api.routes.user(uid, 'replies', 1)`。
- `loadResearchCandidates({ researchId, field: 'reply', page })` 只加载解析器显示的当前下一页；回帖候选以 `postId` 去重，返回安全白名单字段。

- [ ] **Step 1: 写来源授权和身份隔离失败测试**

在 `test/ai-copilot.test.js` 覆盖：普通站内搜索不读取用户 replies 路由；“找我的回帖”进入 `my-replies`；明确 source 也仅从当前 `api.me.uid` 构造路由；访客、身份变化、模型输出用户 ID、`field !== 'reply'` 和未知 source 在请求前失败。对 `provider` 请求断言没有 UID、profile URL 或回复正文。

```js
const result = await copilot.startResearch({ question: '查找我的回帖：分页' })
assert.equal(result.source, 'my-replies')
assert.equal(calls.some((call) => call.url === '/user/5372?tab=replies'), true)
assert.doesNotMatch(JSON.stringify(llmCalls[0].body), /5372|\/user\//)
```

运行：`node --test --test-name-pattern="M7 本人回帖来源" test/ai-copilot.test.js`  
预期：当前 source resolver 会把请求误判为 `my-topics`。

- [ ] **Step 2: 实现来源识别、候选存储和单页加载**

把 `my-replies` 加入来源枚举；先检测明确“回帖”语义，再区分“主题/收藏”。个人回帖计划使用 `reply` 字段，只允许关键词文本，不允许用户 ID、主题 ID 或 URL。`fetchResearchPage()` 在身份仍等于创建 session 时，请求固定本人 replies 路由，解析 `api.parse.userReplies(doc)`，只保存 `{ postId, topicId, topicTitle, floor, page, authorName, excerpt, ts }`。修改 session view，使回帖候选不混入以 topic ID 为键的主题候选 Map。分页继续遵守 `researchPageList()` 已验证的下一页序列。

- [ ] **Step 3: 写并通过候选分页与结果白名单测试**

为 `?tab=replies&p=2` 准备第二页 fixture；验证启动只 GET 第 1 页，用户调用 `loadResearchCandidates()` 后只 GET 第 2 页，重复 `postId` 不重复展示。候选结果中不得有 `content` 完整正文、href、DOM、UID；完整正文只能通过下一任务读取。

运行：`node --test --test-name-pattern="M7 本人回帖来源|M7 本人回帖候选" test/ai-copilot.test.js`  
预期：通过，且不触发站内搜索或主题正文 GET。

### Task 3: 提供回帖来源与逐页候选选择 UI

**Files:**
- Modify: `plugins/ai-workbench.user.js`
- Test: `test/ai-workbench.test.js`

**Interfaces:**
- 来源枚举增加 `my-replies`；自动解析用户原话时，明确本人回帖请求优先于默认站内搜索。
- `renderResearchView()` 对回帖卡片显示主题标题与“读取后验证回帖楼层”的提示；选择键使用本地 `postId`，最多 3 条。列表页不把主题作者或主题时间标作回帖作者/时间。
- 下一页按钮每次仅调用 `loadResearchCandidates({ researchId, field: 'reply', page })` 一次。
- 未选回帖卡片只用于用户本地辨认，不把正文发送给回答模型。

- [ ] **Step 1: 写工作台回帖来源选择失败测试**

输入“找我的回帖”后等待候选卡片，断言来源 label 为“我的回帖”、每卡有主题/楼层和选择框、没有正文问题模型调用。勾选第 4 条时自动取消第 4 条并提示上限；点击下一页只产生一页读取。

运行：`node --test --test-name-pattern="M7 工作台：本人回帖候选" test/ai-workbench.test.js`  
预期：当前控件列表没有本人回帖来源和回帖候选 UI。

- [ ] **Step 2: 实现回帖候选卡片和选择状态**

扩展 `expectedResearchSource()`、来源选项与 `renderResearchView()`。使用 `textContent` 构建卡片；单独维护 `selectedReplyIds`，复用现有 loading/error/status 生命周期和会话 generation 检查；不覆盖主题 `selectedIds`。

- [ ] **Step 3: 运行工作台分页、上限和过期响应测试**

运行：`node --test --test-force-exit test/ai-workbench.test.js`  
预期：普通站内搜索 UI 不变，回帖页按需单页加载，最多选 3 条。

### Task 4: 只读取用户选择的回帖并生成本地楼层引用

**Files:**
- Modify: `plugins/ai-copilot.user.js`
- Modify: `plugins/ai-workbench.user.js`
- Test: `test/ai-copilot.test.js`
- Test: `test/ai-workbench.test.js`

**Interfaces:**
- 新增 `readResearchReplySelection({ researchId, postIds, question, onProgress })`；接受 1–3 个当前 session 候选 `postId`，其余在网络请求前拒绝。
- 新增 `ROUTES.topicReply(topicId, postId)`，只接受正安全整数并生成固定本站 `/topic/<topicId>?replyid=<postId>`；禁止调用方自行拼接 URL。
- 对 session 已读页账本中尚未出现的每个选中 `postId`，最多发一条该固定路由 GET；验证返回主题 ID 与请求一致、解析楼层包含精确 `postId`，再用 `parseTopic()` 取得实际页码与楼层。只把已选回帖加入回答材料。
- 返回 `{ text, meta: { selectedCount, readReplies, failedReplyIds, citations, truncated, chars } }`；引用 href 本地由 `api.routes.topic(topicId, page)` 和已验证 post ID/floor 生成。
- 回答模型只接收所选回帖正文和必要的主题/楼层元数据；不接收 UID、用户页链接或其它回帖。

- [ ] **Step 1: 写未选回帖不读取的失败测试**

```js
await assert.rejects(() => copilot.readResearchReplySelection({ researchId, postIds: [9999], question }), /候选|回帖/)
assert.equal(calls.filter((call) => call.url.includes('/topic/')).length, 0)
```

另测 4 条、重复 post ID、候选 topic/post ID 不匹配、返回主题不匹配或页面不含选中 post ID、过期 session 和本人身份变化均在读取或模型调用前失败。

运行：`node --test --test-name-pattern="M7 回帖读取：只允许选中证据" test/ai-copilot.test.js`  
预期：失败，选择后读取接口尚不存在。

- [ ] **Step 2: 实现一页目标读取、预算和引用**

按 `postIds` 从 `session.replyCandidates` 取本地记录；session 已读页账本中存在目标 post ID 时直接复用，否则通过 `api.routes.topicReply(topicId, postId)` 读取一次。主题解析结果必须匹配 topic ID，且 `posts` 含精确 post ID；楼层和页码只取 `parseTopic()` 的实际结果，仅把已选回帖正文放入回答材料。使用同一 `CONSOLE_MAX_CHARS` 预算；过预算时截断内容并在 `meta.truncated` 标明。成功行由本地 `researchFloorReference()` 生成引用，模型输出的未知 floor 不生成链接。全部失败时跳过回答模型，部分失败时继续成功条目并标记失败项。

- [ ] **Step 3: 接入 UI，验证仅选中内容进入模型**

“读取所选回帖”按钮仅在 1–3 条已选回帖时启用。点击后由 workbench 调用 `readResearchReplySelection()` 并显示实际读取引用。测试模型请求包含所选正文标记、不包含未选正文标记、UID、个人页链接及原始 DOM；切换会话后的迟到结果不更新。

运行：`node --test --test-name-pattern="M7 回帖读取|M7 工作台：只读取已选回帖" test/ai-copilot.test.js test/ai-workbench.test.js`

### Task 5: 全量验证与发行产物检查

**Files:**
- Verify: `dist/linuxsb-base.user.js`、`dist/linuxsb-suite.user.js`、`dist/linuxsb-lts.user.js`

- [ ] **Step 1: 构建包含 `api.parse.userReplies` 的基座**

运行：`node build.mjs`，确认基座版本按插件依赖策略更新为 `0.1.46`，并核对 diff 未覆盖现有功能。

- [ ] **Step 2: 运行本人回帖相关和全量测试**

运行：`node --test --test-force-exit test/site.test.js test/ai-copilot.test.js test/ai-workbench.test.js`，再运行 `npm test`。预期全通过。

- [ ] **Step 3: 构建全渠道并验证**

运行：`npm run build` 和 `npm run verify:dist`。预期解析能力进入 Oxygen 基座；LTS 不新增 `ai-copilot` 或 `ai-workbench`。
