# AI 工作台已选主题深读 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 让用户能对已选主题手动逐页深读，并用实际读取的楼层继续回答和引用。

**Architecture:** 扩展 `ai-copilot` 的内存研究会话，保存每个用户已选主题的逐页读取状态和受字符预算限制的证据。`ai-workbench` 为每个已选主题呈现下一页按钮；每次点击只请求一篇主题的一页，并以当前会话已读页面重新生成回答。

**Tech Stack:** JavaScript、linux.sb Userscript 插件、基座 `api.net.doc` / `api.parse.topic` / `api.routes.topic`、Node.js `node:test`、JSDOM。

## Global Constraints

- 每次点击只读取一篇主题的一页，页码由本地页面解析器提供；固定的本站主题路由由本地生成。
- 已读取页面共同使用 18,000 字符预算。超出预算时保留截断状态，不声称分析了未读取内容。
- 页面正文仅保存在当前研究会话内存中，不写入本地对话历史。刷新后不自动重新抓取；用户可以重新手动读取。
- 引用只能指向本次实际读取的楼层。
- 工作区已有未提交改动和已修改的发行产物。只编辑本计划列出的源文件与测试；构建前检查现有 dist 差异，不重置或清理它们。

---

## File Structure

- `src/site.js`：为主题文档解析实际当前页码，继续使用固定分页路由。
- `test/site.test.js`：校验主题页码解析，不触及站点请求。
- `plugins/ai-copilot.user.js`：保存研究会话逐页证据、验证页序与预算、生成实际楼层引用。
- `plugins/ai-workbench.user.js`：显示每个主题的逐页读取状态和用户触发的后续页按钮。
- `test/ai-copilot.test.js`、`test/ai-workbench.test.js`：验证单页读取、预算、引用、手动交互、刷新不重读。

### Task 1: 解析主题实际页码

**Files:**
- Modify: `src/site.js`
- Test: `test/site.test.js`

**Interfaces:**
- `parseTopic(doc)` 增加 `currentPage: number`，第一页为 `1`；优先读取该 `Document` 的同源 URL `p` 参数；无有效 `p` 时读取活动分页链接中的同源 `p` 参数；缺失或非法时为 `1`。
- `ROUTES.topic(topicId, page)` 继续负责生成第一页和后续页的固定站内路径；调用方不得直接使用模型或 DOM 给出的 URL。

- [ ] **Step 1: 写页码解析失败测试**

```js
test('parseTopic 返回文档当前页，不把最大页数当作当前页', () => {
  const first = load('topic1.html', 'https://linux.sb/topic/1')
  const second = load('topic1.html', 'https://linux.sb/topic/1?p=2')
  assert.equal(parseTopic(first.document).currentPage, 1)
  assert.equal(parseTopic(second.document).currentPage, 2)
  assert.equal(parseTopic(second.document).pages, 8)
})
```

- [ ] **Step 2: 运行新测试并确认失败**

运行：`node --test --test-name-pattern="parseTopic 返回文档当前页" test/site.test.js`  
预期：失败，现有解析结果没有 `currentPage`。

- [ ] **Step 3: 在主题解析器中增加安全的 `currentPage`**

在 `parseTopic()` 中优先读取 `doc.location` 或 `doc.defaultView.location` 的 `p` 参数，仅接受唯一的正安全整数；没有 URL `p` 时，只从 `.pagination li.active a[href]` 读取同源 `p` 参数。两处都没有有效页码时回退为 `1`。保持 `pages` 仍表示最大可见页，不改 `ROUTES.topic()` 的输出。

- [ ] **Step 4: 运行站点解析测试**

运行：`node --test --test-name-pattern="parseTopic 返回文档当前页|帖子页：整体元数据与楼层" test/site.test.js`  
预期：两个测试通过，原有 `pages` 断言不变。

### Task 2: 给研究会话加入已读页账本和单页读取接口

**Files:**
- Modify: `plugins/ai-copilot.user.js`
- Test: `test/ai-copilot.test.js`

**Interfaces:**
- `readResearchSelection({ researchId, topicIds, question, onProgress })` 保留现有最多 3 篇主题、每篇第一页读取入口，并把实际解析页放入对应内存研究会话。
- 首次读取结果的 `meta.pageStates` 为每个已选主题返回 `{ topicId, currentPage, nextPage, hasNext, truncated }`；工作台保留这些主题的选择状态，供用户继续读取。
- 新增 `loadResearchTopicPage({ researchId, topicId, page, question, onProgress })`。只能读取已选主题的下一页，且一次仅读取这一篇主题的一页。
- 已读页账本在 `researchSessions` 内存 Map 中按 `{ topicId, page }` 存放白名单楼层；不得写 `api.store` 或会话历史。
- 新读取成功后，用账本内所有已读页面调用 `budgetResearchTopics()` 和回答生成逻辑；总上下文不超过 `CONSOLE_MAX_CHARS`（18,000 字符）。

- [ ] **Step 1: 写单页读取和页序失败测试**

测试读取主题 #4321 首页后逐次加载第 2 页；用 `_sitePages` 为 `/topic/4321?p=2` 提供文档，并断言只出现一次该 GET。对未选主题、重复页、跳过下一页、无分页页码和跨研究会话 ID 分别断言拒绝且网络调用数不增加。

```js
assert.deepEqual(result.meta.pageStates, [{ topicId: 4321, currentPage: 1, nextPage: 2, hasNext: true }])
await copilot.loadResearchTopicPage({ researchId, topicId: 4321, page: 2, question })
assert.equal(calls.filter((call) => call.url.endsWith('/topic/4321?p=2')).length, 1)
await assert.rejects(() => copilot.loadResearchTopicPage({ researchId, topicId: 4321, page: 4, question }), /下一页|页码/)
```

运行：`node --test --test-name-pattern="深读：只加载所选主题的下一页" test/ai-copilot.test.js`  
预期：新接口不存在或页序断言失败。

- [ ] **Step 2: 写累计预算、引用和请求不持久化测试**

让第一页和后续页返回带唯一标记的楼层文本。累计读取前后断言回答请求中的序列化主题不超过 18,000 字符；答案只可链接账本内实际出现的 `{ topicId, floor, postId }`。读到预算上限后再尝试加载必须在请求前停止。检查 `api.store.keys()` 和工作台历史序列化内容不含楼层正文、候选标题和原始分页 URL。

运行：`node --test --test-name-pattern="深读：共享字符预算|深读：引用仅来自已读页|深读：正文留在内存" test/ai-copilot.test.js`

- [ ] **Step 3: 先实现第一页证据入账，再实现单页后续 API**

扩展 research session：

```js
session.selectedTopicIds = new Set()
session.loadedTopicPages = new Map() // topicId -> Map(page -> { posts, truncated })
session.readChars = 0
```

对 `readResearchSelection()` 完成所有候选 ID 验证后才发请求；每篇仅请求第一页，把验证过的当前页、主题 ID 和楼层加入账本。新增 `loadResearchTopicPage()`：验证 session 未过期、目标仍被选中、请求 `page` 等于该主题可见分页中尚未读取的下一页，然后仅调用一次 `api.net.doc(api.routes.topic(topicId, page))`。解析结果主题 ID 和 `currentPage` 必须与请求一致，否则不入账。

把页面正文按 `CONSOLE_MAX_CHARS - session.readChars` 截断后再存入内存账本，更新预算和截断标志；零预算、已读页、跳页、未知主题、身份变化和页面错误都返回明确错误且不重试。提取 `answerResearchSession(session, question)` 作为共享回答路径：从账本构建主题材料和引用集合，应用现有公平预算器，调用回答模型，并把模型引用限制到实际已读页。

- [ ] **Step 4: 运行深读 API 测试和原有研究回归**

运行：`node --test --test-force-exit test/ai-copilot.test.js`  
预期：新深读测试与现有候选、预算、引用测试通过；无写请求或自动翻页。

### Task 3: 为后续页加入明确的工作台控件

**Files:**
- Modify: `plugins/ai-workbench.user.js`
- Test: `test/ai-workbench.test.js`

**Interfaces:**
- `renderResearchView()` 为每个已选择且 `hasNext` 的主题显示独立的“读取主题 #N 下一页”按钮与当前页/截断状态。
- 点击按钮调用 `copilot.loadResearchTopicPage({ researchId, topicId, page, question, onProgress })`，其中 `topicId` 必须来自该 view 保留的本地已选集合。
- 成功结果更新当前内存 view 的答案、引用和页状态；刷新后不重新执行请求。

- [ ] **Step 1: 写工作台单页交互失败测试**

```js
assert.equal(wb.querySelectorAll('[data-ai-research-read-page]').length, 2)
wb.querySelector('[data-ai-research-read-page="4321"]').click()
assert.equal(await until(() => requestedPages.length === 1), true)
assert.deepEqual(requestedPages, [{ topicId: 4321, page: 2 }])
```

测试同时验证没有“读取全部后续页”按钮、预算耗尽时该主题按钮禁用、失败状态显示在对应主题下、切换会话后迟到的结果不覆盖新消息。

运行：`node --test --test-name-pattern="深读控件：每次只读一主题一页" test/ai-workbench.test.js`  
预期：失败，当前界面只有读取第一页入口。

- [ ] **Step 2: 实现逐主题后续页状态和按钮**

在 `renderResearchView()` 用安全创建的 DOM 节点渲染每个保留选择的主题的页码、下一页按钮和剩余预算提示；不把标题、楼层或 URL 拼进 HTML。首次读取完成后不清空 `view.selectedIds`，因为用户需要在同一研究会话继续读取这些已选主题；用户取消勾选只影响后续操作，不删除账本内已读证据。新增 `readResearchTopicPage()` 作为 UI 事件处理：设置该主题 loading 状态、调用 copilot 接口、只在 `researchViews.get(turn.id) === view` 且 view 仍挂载时合并答案与已验证引用。

- [ ] **Step 3: 运行工作台深读测试**

运行：`node --test --test-force-exit test/ai-workbench.test.js`  
预期：每次点击产生恰好一条一页请求；刷新恢复只显示中断状态，不自动请求。

### Task 4: 全量验证与发行产物检查

**Files:**
- Verify: `dist/linuxsb-base.user.js`、`dist/linuxsb-suite.user.js`、`dist/linuxsb-lts.user.js`

- [ ] **Step 1: 运行全量测试**

运行：`npm test`  
预期：完整测试通过。

- [ ] **Step 2: 构建并核对既有 dist 改动**

先记录 `git diff -- dist/`，运行 `npm run build`，再查看 `git diff -- dist/`。构建产物必须含深读接口与 UI 事件，不得删除构建前已有的有效插件内容。

- [ ] **Step 3: 验证发行产物**

运行：`npm run verify:dist`  
预期：Oxygen 与 LTS 版本一致，LTS 排除规则通过；只读深读能力不增加写权限。
