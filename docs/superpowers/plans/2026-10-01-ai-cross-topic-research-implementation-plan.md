# AI 工作台跨主题资料检索实施计划

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 让 AI 工作台能先搜索并展示站内主题候选，由用户选择最多 3 篇后读取每篇第一页并给出本地可验证引用，同时支持显式查询本人主题和收藏。

**Architecture:** 在 `ai-copilot` 中实现独立、受限的资料检索会话：模型只生成搜索词和字段，本地选择数据源、身份、路由和主题 ID；候选在用户点击读取前不会请求主题正文。`ai-workbench` 负责搜索字段/来源选择、候选勾选、手动分页、读取确认和回答呈现；检索候选与正文只存在内存中，不进入会话存储或缓存。

**Tech Stack:** JavaScript ES modules、linux.sb userscript 插件、现有 `api.net.search` / `api.net.doc` / `api.parse.list` / `api.parse.topic` / `api.parse.user`、Node.js `node:test`、JSDOM。

## Global Constraints

- 站内搜索字段只允许 `title`、`body`、`reply`；模型不能提供 URL、HTTP 参数、用户 ID 或主题 ID。
- 先显示搜索候选；只有用户明确选择并点击读取后，才读取最多 3 篇主题的第一页。
- 每个所选来源和搜索结果默认仅读第一页；后续页只响应用户点击，每次读取一页，不自动翻页。
- 所选主题第一页正文共用最多 18,000 字符预算；部分读取失败时只根据成功读取的内容回答。
- 本人主题和收藏只在用户明确提及“我的”或用户显式选择数据源时访问；UID 只能来自本地登录状态 `api.me.uid`。
- 搜索候选和主题正文不写入工作台会话历史、本地存储或回答缓存；刷新不自动重放搜索、读取或回答请求。
- 候选按正整数主题 ID 去重；主题与楼层引用必须映射到本次实际读取的本地证据，链接由本地主题路由生成。
- 工作区含其它未提交改动；只修改本计划列出的功能文件，不清理、重置或混入其它改动。

---

### Task 1: 增加受限检索计划与候选来源适配器

**Files:**
- Modify: `src/site.js`
- Modify: `src/core.js`
- Modify: `package.json`
- Test: `test/site.test.js`
- Modify: `plugins/ai-copilot.user.js`
- Test: `test/ai-copilot.test.js`

**Interfaces:**
- `api.parse.listPages(doc)` 返回从站点分页 DOM 解析出的升序、去重正整数页码；不返回原始 href。无分页控件时返回 `[1]`。
- `api.routes.user(id, tab, page = 1)` 在 `page === 1` 时保持现有路由格式；后续页只生成固定 `/user/<id>?tab=<allowed USER_TABS>&p=<page>` 路由。检索适配器只用 `topics` 和 `favorites`。
- `api.routes.searchResults(query, field, page = 1)` 只生成固定 `/index.php?q=<encoded>&field=<title|body|reply>[&p=<page>]` 搜索结果路由；搜索第一页仍调用基座 `api.net.search()`，不接受模型或 DOM 提供的 href。
- `startResearch({ question, source = 'auto', onProgress })` 先生成并验证 `{ version: 1, query, field }` 计划，再由本地已授权数据源返回 `{ researchId, source, query, field, page, hasNext, candidates }`。候选只含 `{ id, title, authorName, forumName, replies, lastActiveTs, pinned, sourceFields }`。
- `loadResearchCandidates({ researchId, field?, page })` 只响应工作台显式触发的字段切换或单页加载；同一 ID 合并 `sourceFields`，每页最多保留 40 条。
- `auto` 数据源由本地用户原话决定：默认 `site-search`；明确提及本人发布的主题时为 `my-topics`，明确提及本人收藏时为 `my-favorites`。显式来源枚举只允许 `site-search`、`my-topics`、`my-favorites`。
- 检索会话保存在 `ai-copilot` 内存 Map，随机 ID 只关联本次候选，不写 `api.store`；会话数量和候选数量均有固定上限，过期或未知 ID 返回本地错误。
- 新增的站点 API 使基座版本升至 `0.1.45`；`ai-copilot` 最低基座依赖同步为 `^0.1.45`。

- [x] **Step 1: 写站点分页路由与分页解析的失败测试**

在 `test/site.test.js` 增加测试：`ROUTES.user(5372, 'topics')` 与旧格式一致；`ROUTES.user(5372, 'favorites', 3)` 得到 `/user/5372?tab=favorites&p=3`；非法 tab、非正整数 UID 或页码不会生成个人主题路由。`ROUTES.searchResults('内核 更新', 'title', 2)` 得到固定站内路由 `/index.php?q=%E5%86%85%E6%A0%B8%20%E6%9B%B4%E6%96%B0&field=title&p=2`，非法字段被拒绝。为有多个分页链接、重复页码、无分页 DOM、带外域名 href 的 DOM 分别断言 `listPages()` 只返回安全的页码数组。

运行：`node --test --test-name-pattern="用户分页路由|列表分页解析" test/site.test.js`

预期：新增 API 尚不存在，测试以缺失成员或格式断言失败。

- [x] **Step 2: 增加固定路由构造与分页解析**

在 `src/site.js` 扩展 `ROUTES.user(id, tab, page = 1)`，只接受允许的个人主题 tab 和正整数 ID/page；新增 `ROUTES.searchResults(query, field, page = 1)`，只接受白名单 field 和有效页码；新增 `listPages(root)`，只从分页锚点的 `p` 参数读取页码，丢弃无效值、排序去重并确保第一页存在。通过 `src/core.js` 的 `api.parse` 暴露 `listPages`。运行 Task 1 的站点测试并确认通过。

- [x] **Step 3: 写检索计划、来源授权与候选白名单的失败测试**

在 `test/ai-copilot.test.js` 新增 `M6 检索计划：字段、查询词和个人来源由本地约束`：有效计划只接受 `version: 1`、不超过 120 个字符的非空 `query` 和 `title|body|reply` 字段；拒绝未知字段、超长查询、无效字段及错误版本。测试无“我的”请求时只用 `api.net.search(query, field)`；明确“我的收藏”时从本地 `api.me.uid` 读取 favorites 页面，并断言模型计划和路由都不能指定 UID。另测访客查询本人来源时在发请求前失败。断言候选严格只有八个白名单字段，包含原始 HTML、用户 ID、URL、DOM 的源数据都不进入结果或 `api.store`。

运行：`node --test --test-name-pattern="M6 检索计划|M6 候选来源" test/ai-copilot.test.js`

预期：测试因 `startResearch` 和候选来源适配器不存在而失败。

- [x] **Step 4: 实现检索计划验证与第一页候选发现**

在 `plugins/ai-copilot.user.js` 增加 `RESEARCH_PLAN_VERSION = 1`、来源/字段白名单、个人来源原话判定、`normalizeResearchPlan(raw, source)`、`startResearch()` 和内存会话表。模型请求只收到用户问题和不含账号身份/候选正文的固定指令；解析后丢弃任何未定义字段。站内搜索第一页用 `api.net.search(query, field)`，个人来源在 UID 有效且非 guest 时用 `api.routes.user(api.me.uid, tab, 1)` 和 `api.net.doc()`；两者均调用 `api.parse.list(doc)` 并重新映射白名单。个人列表只在显式选择或本地识别到明确本人请求时读取，个人来源的搜索字段固定为 `title`。候选上限 40，按正整数 ID 去重，不把原始链接传给工作台。

- [x] **Step 5: 实现手动字段切换、来源翻页和检索会话限额**

实现 `loadResearchCandidates({ researchId, field, page })`：字段只能为 `title|body|reply`，个人来源只允许 `title`；页码必须是当前 DOM 分页解析出的后续页之一，且函数每次只请求该页。站内搜索继续使用本地受限搜索路由；个人来源使用 `api.routes.user()`。追加结果按 ID 合并并保存各自来源字段标签；未知/过期 `researchId`、模型 ID、非当前候选页和任意 URL 均拒绝。限制内存检索会话最多 10 个、每会话最多 200 个候选；超限清理最旧会话。新增测试覆盖手动单页、字段切换去重、分页上限和非法会话拒绝，运行 `node --test --test-force-exit test/ai-copilot.test.js`。

---

### Task 2: 读取用户选中的主题并生成受验证引用

**Files:**
- Modify: `plugins/ai-copilot.user.js`
- Test: `test/ai-copilot.test.js`

**Interfaces:**
- `readResearchSelection({ researchId, topicIds, question, onProgress })` 接受最多 3 个正整数；每个 ID 必须存在于指定内存检索会话的当前候选集合，否则在发请求前拒绝。
- 正文仅通过 `api.net.doc(api.routes.topic(id, 1))` 读取；每篇只请求第一页并用 `api.parse.topic(doc)` 提取帖子。
- 成功楼层映射为 `{ topicId, topicTitle, floor, postId, authorName, excerpt, known, href }`；href 只能由 `api.routes.topic(topicId)` 和本地已解析的楼层信息生成。
- 回答只接收成功读取主题的楼层白名单和用户问题；未选候选不发送，任意模型 ID/URL 不产生可点击引用。
- 全部来源共用 18,000 个字符预算；每个主题先获得均等预算，未用预算再分配给仍有正文的主题。读取错误逐主题保留状态；全失败时跳过回答模型。
- 该流程绕过操作台持久化计划/答案缓存；候选、完整正文和原始 URL 不写 `api.store`。

- [x] **Step 1: 写失败测试，证明未选、越限和伪造 ID 不会读取正文**

新增 `M6 读取：未选主题、超出 3 篇和未知 ID 均在请求前拒绝`：准备 4 个本地候选，记录 `api.net.doc` 调用；传 4 个 ID、一个外部 ID、一个不属于会话的 ID 和空选择，断言均拒绝且正文请求计数为 0。仅对本地候选勾选 1 个后，断言只请求 `/topic/<候选 ID>` 第一页路由。

运行：`node --test --test-name-pattern="M6 读取：未选主题" test/ai-copilot.test.js`

预期：测试因 `readResearchSelection` 不存在而失败。

- [x] **Step 2: 写预算、失败隔离、引用映射与不持久化测试**

新增测试选择 3 个主题并为每篇返回不同长度楼层，断言总发送字符不超过 18,000、短主题的未用预算可以分给长主题、被截断主题明确标记。再测一个主题请求失败时成功主题仍可回答并只生成已读楼层引用；全部失败时 AI 回答调用数为 0。回答中写入真实 `[[topic:<id> floor:<n>]]`、未读楼层编号和外部 URL，断言只有真实本地楼层生成链接。最后断言 `api.store` 中没有候选标题、帖子正文、原始 href 或检索会话数据。

运行：`node --test --test-name-pattern="M6 读取：预算|M6 引用：检索|M6 隐私：检索" test/ai-copilot.test.js`

预期：以上用例因选择读取、全局预算和跨主题本地引用尚未实现而失败。

- [x] **Step 3: 实现受限读取、动态字符预算、部分失败与引用生成**

增加 `readResearchSelection()`：先完整校验会话 ID、候选 ID、唯一性和 3 篇上限，再按固定主题路由读取第一页。对 `api.parse.topic()` 的楼层仅提取 topic ID、楼层、post ID、作者名和正文；拒绝缺少有效主题 ID 的响应。以 `CONSOLE_MAX_CHARS` 为总预算：每个成功主题先按成功选择数均分，保留未用字符；完成首轮后按所选顺序把剩余字符交给仍未读完的主题，直到预算耗尽。引用集合只由最终实际保留的楼层生成，未知楼层链接为 null。逐主题记录失败原因，但不把正文写进错误、阶段摘要、会话、日志或存储。所有读取失败时返回明确的无材料结果并跳过回答模型。

- [x] **Step 4: 实现无缓存的答案阶段并运行检索测试**

调用 `provider.generate()` 生成答案，不读取或写入 `console-answer` 缓存。提示模型只使用 `<selected-topic-pages>` 中的实际读取材料；每个主题用 `[[topic:<id> floor:<floor>]]` 引用。通过 `consoleCitationRecords()` 做本地映射；未知主题/楼层只保留为不可点击标记。返回 `text`、安全阶段摘要、截断/部分失败元数据和已验证 citation ID；不把候选集合或正文放进持久化 cache。运行所有 `M6` 检索与引用测试以及 `node --test --test-force-exit test/ai-copilot.test.js`，预期全部通过且原有操作台行为不变。

---

### Task 3: 在 AI 工作台加入候选选择与手动读取流程

**Files:**
- Modify: `plugins/ai-workbench.user.js`
- Test: `test/ai-workbench.test.js`

**Interfaces:**
- 新增能力 ID `research`；来源选择值为 `auto`、`site-search`、`my-topics`、`my-favorites`。默认 `auto`；仅该能力显示来源控件。
- 检索阶段调用 `copilot.startResearch()` 并把结果放在内存 `researchViews: Map<turnId, ResearchView>` 中；conversation turn 只保存用户问题、短摘要、进度状态和经过验证的 citation IDs。
- 候选卡片用 `textContent` 显示白名单元数据和本地生成的主题链接；复选框最多选 3 个；按钮只有用户点击后才调用 `readResearchSelection()`。
- 字段切换或下一页按钮每次只请求一页；重复 ID 合并字段来源，不重复显示主题。
- 刷新后候选内存失效；历史中的 research turn 显示“候选已失效，请重新检索”，不自动请求搜索或正文。

- [x] **Step 1: 写失败测试覆盖入口、分页/字段按钮与 3 篇选择上限**

在 `test/ai-workbench.test.js` 增加 `跨主题检索：展示字段和来源，先选候选再读取`：替换 copilot exports 为可记录调用的 stub，切换 `/ 跨主题检索` 并发送问题；断言调用 `startResearch`，展示候选及字段/来源，且 `readResearchSelection` 未被调用。勾选 4 篇后断言选择提示不超过 3 篇且读取按钮不会提交 4 个 ID；选择 2 篇并显式点击读取后，断言只提交这 2 个候选 ID。另测字段切换、加载下一页只在点击后触发一次，重复主题只渲染一个卡片。

运行：`node --test --test-name-pattern="跨主题检索：展示字段" test/ai-workbench.test.js`

预期：测试因能力选项与检索 UI 不存在而失败。

- [x] **Step 2: 实现检索能力选择、会话内存视图和安全候选卡片**

在 `CAPABILITIES` 增加 `research`，为该模式渲染来源选择；实现 `dispatchChatTurn()` 的检索分支，调用 `startResearch()` 并将候选存入只在内存中的 `researchViews`。候选卡片所有动态文案经 `textContent` 写入，href 用 `api.routes.topic(id)` 重建；`sourceFields` 显示搜索字段名。turn 的 answer 只保存计数/字段/来源摘要，不能保存候选标题、作者、帖子内容、URL 或 DOM。

- [x] **Step 3: 实现选择、显式读取、字段切换与手动分页交互**

为每个候选视图创建复选框、字段选择器、下一页和读取按钮。选择超过 3 个时保留已有 3 个选择并提示用户；读取按钮未点击时绝不调用正文接口。字段切换仅允许 `title|body|reply`，个人来源禁用正文/回帖字段。下一页只请求 `loadResearchCandidates({ researchId, page: currentPage + 1 })` 一次。按 ID 合并结果，并在重新渲染时保留此前已选 ID。读取后渲染部分失败状态和验证后的引用，移除原始正文对象引用。

- [x] **Step 4: 写刷新与会话隐私测试并实现候选失效提示**

测试序列化 `conversationHistory` 不含候选标题、作者或帖子正文，也不含原始 URL；模拟重新挂载工作台，断言 research turn 显示候选已失效、不调用 `startResearch()` / `loadResearchCandidates()` / `readResearchSelection()`，需用户重新提交问题才能开始新搜索。运行 `node --test test/ai-workbench.test.js`，预期检索 UI、显式读取、手动分页、失效恢复及原有聊天功能均通过。

---

### Task 4: 对齐版本、说明与发布产物

**Files:**
- Modify: `plugins/ai-copilot.user.js`
- Modify: `plugins/ai-workbench.user.js`
- Modify: `src/core.js`
- Modify: `package.json`
- Modify: `build-suite.mjs`
- Modify: `suite/suite-center.js`
- Modify: `README.md`
- Modify: `test/suite.test.js`
- Generated: `dist/*.user.js`

**Interfaces:**
- 基座与两个 AI 插件的 package/userscript/manifest 版本一致；`ai-copilot` 要求基座 `^0.1.45`，工作台依赖新 copilot 版本。
- 氢壳发行包包含候选检索与手动读取 UI；LTS 继续排除 AI 模块。
- README 描述候选先展示、用户最多选 3 篇并确认读取，以及本人主题/收藏只在明确请求时使用。

- [x] **Step 1: 写发行边界测试**

在 `test/suite.test.js` 断言两个 AI 插件的元数据/manifest 版本一致、工作台依赖新 copilot 版本、氢壳输出含新 research 能力和引用适配，LTS 包不含 `ai-workbench`、`ai-copilot` 或研究会话字段。

运行：`node --test test/suite.test.js`

预期：新增版本/构建断言在实现前失败。

- [x] **Step 2: 更新插件版本、README 并重建发行文件**

将 `src/core.js` 与 `package.json` 升至 `0.1.45`；按仓库版本惯例为 `ai-copilot`、`ai-workbench` 各提升一个 patch。保持 userscript `@version`、manifest `version`、`ai-copilot.requires.base`、`ai-workbench.requires.plugins['ai-copilot']` 和 suite 模块登记一致。更新 README 的 AI 工作台能力说明。运行 `npm run build`。

- [x] **Step 3: 运行发行边界与新鲜度校验**

运行 `node --test test/suite.test.js`，预期全部通过。运行 `npm run verify:dist`，预期三份发行文件都与源插件一致，且 LTS 无 AI 插件。

---

### Task 5: 全量验证与规格逐项复核

**Files:**
- Review: `docs/superpowers/specs/2026-10-01-ai-cross-topic-research-design.md`
- Review: `docs/superpowers/plans/2026-10-01-ai-cross-topic-research-implementation-plan.md`

- [x] **Step 1: 运行完整测试、构建和发行校验**

运行 `npm test`、`npm run build`、`npm run verify:dist` 和 `git diff --check`；记录实际退出码与测试计数。测试失败时先定位到本次改动再修复，不通过历史执行结果推断。

- [x] **Step 2: 按验收标准复核安全边界和范围**

逐项对照设计规格第 2–8 节，确认候选先于正文读取、最多 3 篇、每篇第一页、总预算 18,000、手动字段/分页、个人来源显式授权、本地 UID、跨主题引用、部分失败、刷新不重放以及对话历史/存储无候选正文。检查计划中没有 TODO/TBD 占位和相互矛盾的接口；结合任务开始前快照与定向复审，确认本任务差异符合计划范围。工作区原有的其它未提交修改予以保留，不以整体 `git diff` 误判或清理。
