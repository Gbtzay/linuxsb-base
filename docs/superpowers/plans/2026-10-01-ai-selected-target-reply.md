# AI 已选目标回复实施计划

> **For agentic workers:** Execute inline in the current checkout. Use test-driven development for every behavior change. Keep existing uncommitted work; do not delegate, switch branches, commit, or merge.

**Goal:** 让 AI 工作台针对用户选中的主题或本人回帖生成回复草稿，并在用户审阅及二次确认后向所属主题发送。

**Architecture:** 复用现有 research `targetScope` 建立短期、内存中的回复目标；Copilot 只向模型发送随机目标 key、标签与有预算的已选证据；独立写动作重读目标页、验证原生回复表单并通过固定 `/reply_edit` API 单次提交。楼层仅作为上下文，发送仍以 `topic_id` 为目标。

**Tech Stack:** JavaScript userscripts, LSB plugin API, Node `node:test`, JSDOM, esbuild distribution scripts.

## 全局约束

- 只使用当前主题或本次研究中用户手动选中的主题/本人回帖；跨主题写入一次只允许一个目标。
- 选中主题读取第一页；选中回帖读取并验证其所在页；发给模型的论坛材料总量最多 8,000 字符。
- 回复请求只能提交 `_csrf`、`topic_id` 和 `body` 到本站固定 `/reply_edit`；不得猜测楼层字段。
- 回复楼层作为草稿上下文；确认卡必须说明回复实际发到所属主题。
- 目标计划最多一个写动作；工作台审阅后，写动作还要二次确认；取消不提交、未知结果不重试。
- 不把临时 target key、目标 ID、CSRF、原始帖子内容存进历史；不添加 `net`/`admin` 权限。
- 按当前分支及用户要求原位实现；保留现有未提交改动，不提交、不合并、不使用子代理。

## 文件职责

- Modify `plugins/ai-copilot.user.js`: 验证选中目标、准备回复证据、向模型计划器提供受限目标目录。
- Modify `plugins/ai-write-actions.user.js`: 验证及二次确认已选目标回复，单次调用固定回复 API。
- Modify `plugins/ai-workbench.user.js`: 显示所选目标和完整正文，选择目标并确保临时目标信息不持久化。
- Modify `test/ai-copilot.test.js`, `test/ai-write-actions.test.js`, `test/ai-workbench.test.js`: 行为回归测试。
- Modify README 与插件/套件版本；重建 `dist`。

---

### Task 1：把明确选中的回复目标交给计划器

**Files:**
- Modify `plugins/ai-copilot.user.js`
- Test `test/ai-copilot.test.js`

- [x] 先加失败测试：仅当前研究会话已选且可验证的主题/回帖进入回复目标目录；模型请求只含随机 key、标题/楼层与最多 8,000 字符的所选正文；缺选、重复/超过一个目标、失效候选在模型调用前拒绝。
- [x] 运行新增用例，确认失败原因是当前没有 selected reply target 目录或校验。
- [x] 实现独立 reply target scope：验证候选来源、当前用户身份、主题 ID、回帖 ID/楼层、页面与有效回复表单；不暴露真实 ID/CSRF给模型。
- [x] 将真实目标映射存入短期内存 scope；把匿名 key、标签和目标证据加入计划上下文；请求路由仍绑定当前页面，并校验 scope 未过期。
- [x] 运行 Copilot 测试并检查跨主题互动既有行为未回归。

### Task 2：添加已选目标回复写动作

**Files:**
- Modify `plugins/ai-write-actions.user.js`
- Test `test/ai-write-actions.test.js`

- [x] 先写失败用例：二次确认前无 POST；确认取消无 POST；确认后只向 `/reply_edit` 发一次且只含 `_csrf`、`topic_id`、`body`；主题或楼层目标不符、锁帖、CSRF 缺失、跨源表单、目标 scope 失效均拒绝。
- [x] 运行新增用例，确认新动作当前不存在。
- [x] 增加 `site.write-selected-reply`：仅可使用 Copilot scope 中目标 key；执行前与确认后都重读目标页；对回帖核验同一 postId 与 floor；对表单核验同源 POST action、唯一 CSRF、topic_id 和正文框。
- [x] 确认文本包含目标标题、楼层和“发到主题”提示；取消返回 cancelled；固定调用 `api.actions.reply(topicId, body, { _csrf })`；POST 失败或异常按未知结果处理，不自动重试。
- [x] 运行写动作集成测试及原有 current-topic reply 测试。

### Task 3：工作台目标审阅与短期状态

**Files:**
- Modify `plugins/ai-workbench.user.js`
- Test `test/ai-workbench.test.js`

- [x] 先写失败用例：选中目标回复计划显示主题/楼层和完整正文；无可用目标时禁止执行；写历史及刷新恢复数据没有 target key、topic/post ID、CSRF 或原文；执行或刷新中断不自动重放。
- [x] 运行新增用例，确认工作台当前不会显示已选回复目标或移除该目标的持久化引用。
- [x] 扩展计划卡，仅对新回复动作展示可验证目标；生成计划时用户最多必须选中一个操作目标；目标信息保持内存态，序列化历史将其处理为过期、不保留步骤目标字段。
- [x] 保留已有页面路由/目标 scope 变化即过期语义；运行工作台完整测试。

### Task 4：版本、发行文档和全量验证

**Files:**
- Modify `README.md`, relevant plugin/suite version sources
- Generated: `dist/linuxsb-base.user.js`, `dist/linuxsb-suite.user.js`, `dist/linuxsb-lts.user.js`

- [x] 更新 README 工作流和安全边界；按项目约定递增 ai-copilot、ai-workbench、ai-write-actions、Oxygen suite 版本；保持 LTS 不收录 AI 写动作。
- [x] 跑 `node --test --test-force-exit test/ai-copilot.test.js test/ai-write-actions.test.js test/ai-workbench.test.js`。
- [x] 跑 `npm test`、`npm run build`、`npm run verify:dist`、`git diff --check`。
- [x] 复核目标 ID/CSRF/帖子内容仅在必要的内存路径出现，动作历史无临时引用，并报告任何尚未验证的线上响应语义。
