# M13：AI 工作台长对话上下文压缩实施计划

> **执行方式：** 在当前会话直接实施，禁止派发子代理。现有工作树包含前几轮未提交改动；实施时只增量编辑本计划列出的文件，不重置、清理或提交混合工作树。

**Goal:** 让 AI 工作台在超过 M12 的有限原始历史后继续理解早期只读结论，同时保持当前材料优先、写操作隔离、引用必须重新验证和停止可取消。

**Architecture:** 工作台按页面范围为每个会话维护版本化压缩记录；每次回答保留最近三组完整只读问答，更早轮次由副驾使用不可作为证据的模型摘要表示。摘要请求使用与回答相同的取消信号，失败或停止时退回本地摘录并继续回答；摘要和回答缓存分别按来源指纹失效。站内写计划永远不携带历史摘要。

**Tech Stack:** 原生 JavaScript、Tampermonkey fetch/GM 网络层、Node test、jsdom、esbuild、本地 Chromium 验收脚本。

## Global Constraints

- 只读上下文最多保留最近三组完整问答；早期内容只能通过压缩摘要或本地摘录进入模型。
- 摘要是不可信背景，不是事实证据、引用账本或站内动作授权；引用必须由本轮本地材料重新验证。
- `site-action` 计划、执行、重试和结果检查不得接收历史问答、压缩摘要或摘要生成结果。
- 摘要只允许来自当前 `context.kind`、`routeType`、`topicId` 和 `routeScope` 相同的已完成只读轮次；失败、取消、待处理和结果未知轮次排除。
- 摘要正文经过现有 URL/凭据脱敏，单个范围最多 1,600 Unicode 字符；持久化摘要最多保留 3 个范围、总大小 16 KiB。
- 摘要生成不使用流式回答协议，不进入回答成功缓存；停止、网络失败或解析失败不得写入摘要。
- 当前页面材料优先，历史上下文占用当前材料预算的四分之一以内；无法压缩时宁可丢弃旧历史。
- 每个阶段先写失败测试并观察失败，再写最小实现；结束后跑全量测试、三份构建、产物校验和真实浏览器验收。

---

### Task 1: 定义有界压缩上下文纯函数

**Files:**
- Modify: `src/ai-conversation.js`
- Modify: `src/core.js`
- Test: `test/ai-conversation.test.js`

**Interfaces:**
- Consumes: M12 的 `{ role: 'user'|'assistant', content }` 只读问答数组。
- Produces: `buildConversationContext(input, options)`，返回 `{ recentRows, summaryInput, text, chars, omittedPairs, fingerprint }`。输入行可带 `capability`、`state` 和 `scope` 元数据；函数只把 `state === 'complete'`、非 `site-action` 且范围匹配的 user/assistant 成对行纳入。`recentRows` 保留最近三组问答；`summaryInput` 只包含更早的完整问答；`text` 为可直接嵌入提示词的转义文本；`fingerprint` 由规范化后的范围和正文生成，不包含 URL 或凭据。

- [ ] **Step 1: 写失败测试**

增加以下行为测试：

```js
test('M13 压缩上下文保留最近三组并把更早完整问答交给摘要层', () => {
  const rows = []
  for (let index = 0; index < 6; index += 1) {
    rows.push({ role: 'user', content: `问题${index}` })
    rows.push({ role: 'assistant', content: `答案${index}` })
  }
  const result = buildConversationContext(rows, { maxChars: 4000, recentPairs: 3 })
  assert.deepEqual(result.recentRows.map((row) => row.content), ['问题3', '答案3', '问题4', '答案4', '问题5', '答案5'])
  assert.deepEqual(result.summaryInput.map((row) => row.content), ['问题0', '答案0', '问题1', '答案1', '问题2', '答案2'])
  assert.equal(result.omittedPairs, 0)
})

test('M13 压缩上下文只接受同一范围的只读轮次并排除写操作与未完成轮次', () => {
  const result = buildConversationContext([
    { role: 'user', content: '写入请求', capability: 'site-action', state: 'complete' },
    { role: 'assistant', content: '不应成为背景', capability: 'site-action', state: 'complete' },
    { role: 'user', content: '未完成', capability: 'ask', state: 'pending' },
    { role: 'assistant', content: '不完整', capability: 'ask', state: 'pending' },
    { role: 'user', content: '可继承', capability: 'ask', state: 'complete', scope: 'topic:1' },
    { role: 'assistant', content: '答案', capability: 'ask', state: 'complete', scope: 'topic:1' },
  ], { scope: 'topic:1' })
  assert.doesNotMatch(result.text, /写入请求|不应成为背景|未完成/)
  assert.match(result.text, /可继承/)
})

test('M13 压缩上下文在预算不足时丢弃旧历史且指纹随内容变化', () => {
  const first = buildConversationContext([
    { role: 'user', content: '旧问题' }, { role: 'assistant', content: '旧答案' },
    { role: 'user', content: '新问题' }, { role: 'assistant', content: '新答案' },
  ], { maxChars: 12, recentPairs: 1 })
  const second = buildConversationContext([
    { role: 'user', content: '旧问题' }, { role: 'assistant', content: '旧答案' },
    { role: 'user', content: '新问题变化' }, { role: 'assistant', content: '新答案' },
  ], { maxChars: 12, recentPairs: 1 })
  assert.ok(first.chars <= 12)
  assert.notEqual(first.fingerprint, second.fingerprint)
})
```

- [ ] **Step 2: 运行测试确认失败**

运行：`node --test test/ai-conversation.test.js`

预期：因 `buildConversationContext` 尚未导出而失败；不得用修改断言的方式消除失败。

- [ ] **Step 3: 实现最小纯函数**

在 `src/ai-conversation.js` 中复用 M12 的脱敏与 Unicode 截断逻辑，先规范化完整问答，再按范围和状态过滤，按时间顺序拆出最近三组与旧轮次。旧轮次按预算从最新的旧轮开始保留；预算不足时清空旧轮次并将 `omittedPairs` 增加。使用固定版本前缀和规范化行生成稳定指纹。通过 `src/core.js` 的 `api.ai` 暴露函数，不让插件直接导入基座源码。

- [ ] **Step 4: 运行测试确认通过**

运行：`node --test test/ai-conversation.test.js`

预期：M12 原有三项测试与新增 M13 测试全部通过。

### Task 2: 建立范围化摘要记录和缓存契约

**Files:**
- Modify: `plugins/ai-workbench.user.js`
- Modify: `plugins/ai-copilot.user.js`
- Test: `test/ai-workbench.test.js`
- Test: `test/ai-copilot.test.js`

**Interfaces:**
- Consumes: Task 1 的 `buildConversationContext()`；已有 `api.store`、`provider.generate()` 和 `signal`。
- Produces: `conversationContextForTurn({ conversationId, turn, signal })`，返回 `{ rows, summary, text, fingerprint, compactedPairs, summaryStatus }`；副驾公开 `summarizeConversation({ rows, previousSummary, scope, signal })`。后者返回 `{ text, sourceFingerprint, model, version }`，不返回 citations 或 action data。

- [ ] **Step 1: 写失败测试**

增加测试覆盖：

```js
test('M13 早期只读轮次触发一次摘要，后续回答携带摘要和最近原文', async () => {
  // 构造 6 个同范围只读轮次；模拟摘要模型和回答模型分别返回固定文本。
  // 断言摘要请求只发生一次，回答请求含 <conversation-summary> 与最近三组原文，
  // 不含写操作历史；新回答完成后摘要 sourceFingerprint 变为过期。
})

test('M13 摘要模型失败时退回本地摘录，当前回答仍可完成', async () => {
  // 摘要端点抛错；回答端点仍返回答案。
  // 断言工作台保存答案但不保存失败摘要，并显示“历史已收窄”阶段说明。
})

test('M13 摘要停止时不写入摘要且可立即重试', async () => {
  // 摘要请求等待期间点击停止；断言底层连接取消、摘要存储为空、输入框立即可用。
})

test('M13 同一会话切换主题范围不会复用旧摘要，站内写计划不读取摘要', async () => {
  // 切换 topicId/routeScope 后断言摘要指纹不同；site-action 计划请求中没有 conversation 字段。
})
```

- [ ] **Step 2: 运行相关测试确认失败**

运行：`node --test --test-name-pattern="M13" test/ai-workbench.test.js test/ai-copilot.test.js`

预期：摘要 API、摘要存储和范围化请求尚未存在，测试按预期失败。

- [ ] **Step 3: 实现范围化摘要状态**

在工作台会话记录中增加受限字段：

```js
conversation.compactions = [{
  version: 1,
  scope: { kind, routeType, topicId, routeScope },
  sourceFingerprint: '...',
  text: '...',
  sourceTurnIds: ['...'],
  updatedAt: 0,
}]
```

加载、保存和迁移时只接受上述白名单，限制 3 个范围和 16 KiB；摘要文本沿用历史脱敏，禁止保存 citations、URLs、CSRF、action args 或原始模型响应。新完成的同范围只读轮次会使对应 `sourceFingerprint` 失效；切换范围只查找同范围记录。写操作、失败、取消、未知结果和研究候选未完成轮次不进入摘要源。

- [ ] **Step 4: 实现摘要模型调用与缓存**

在 `ai-copilot` 中新增 `summarizeConversation()`：

- 使用独立 `CONVERSATION_SUMMARY_VERSION` 和输入指纹缓存；模型提示明确“只整理对话背景，不证明事实、不保留引用、不执行动作”。
- 输入只包含 Task 1 的 `summaryInput` 与可选旧摘要；请求强制 `stream: false`，沿用 `signal`。
- 结果通过本地长度、凭据/URL 脱敏和禁止动作词字段校验；异常、取消、空文本和超限均返回失败，不写缓存。
- `conversationContextForTurn()` 在必要时先请求摘要；摘要失败时返回旧摘要或本地摘录，并在阶段时间线写入可复核的降级状态。
- 本地摘录固定为按原顺序拼接的 `[问题] …\n[回答] …` 块，先做凭据/URL 脱敏，再按 1,600 字符截断；它只作为背景，不伪装成模型摘要或证据。
- `dispatchChatTurn()` 仅为只读能力构造摘要上下文；`site-action` 分支显式传 `conversation: []`，包括未知计划降级后的第一次请求。

- [ ] **Step 5: 运行测试确认通过**

运行：`node --test --test-name-pattern="M13|M12" test/ai-workbench.test.js test/ai-copilot.test.js test/ai-conversation.test.js`

预期：摘要调用、缓存失效、范围隔离、停止降级和写操作隔离测试通过，M12 原有行为不变。

### Task 3: 增加压缩状态展示和手动恢复入口

**Files:**
- Modify: `plugins/ai-workbench.user.js`
- Test: `test/ai-workbench.test.js`
- Modify: `scripts/check-ai-workbench-browser.mjs`

**Interfaces:**
- Consumes: Task 2 的摘要记录和阶段事件。
- Produces: 对话栏中的“已压缩 N 轮”状态、当前范围摘要计数、清除当前范围摘要按钮；清除只删除摘要，不删除原始本地问答记录。

- [ ] **Step 1: 写失败测试**

断言摘要存在时显示压缩轮数和范围；点击清除后下次请求重新生成摘要；展开历史仍只能看到脱敏后的本地记录；摘要生成期间停止按钮可用且输入可立即继续。

- [ ] **Step 2: 实现 UI 与生命周期**

在会话栏显示当前范围的摘要状态，不展开模型原始摘要全文；点击清除只清理对应 `compactions` 条目。摘要请求复用当前请求 token，路由、切换会话、关闭工作台和卸载时统一取消。迟到摘要不能覆盖新会话、不能在停止后写存储，也不能让旧 `finally` 改写输入状态。

- [ ] **Step 3: 扩展真实浏览器验收**

在本地模型 fixture 中加入摘要端点和 6 轮对话脚本，验证：旧轮次被压缩、早期结论可被追问、新轮次使摘要失效、摘要失败仍能回答、摘要期间停止、切换主题不复用摘要、站内写计划没有历史字段。不得调用真实站点写接口或付费模型。

- [ ] **Step 4: 运行浏览器脚本确认通过**

运行：`node scripts/check-ai-workbench-browser.mjs`

预期：Edge 本地 fixture 报告 `passed: true`，摘要请求按指纹去重，停止产生一次底层取消，且无页面异常。

### Task 4: 交付验证和文档

**Files:**
- Modify: `plugins/ai-workbench.user.js`（版本提升至 0.6.0）
- Modify: `plugins/ai-copilot.user.js`（版本提升至 0.10.0）
- Modify: `src/core.js`（基座版本按依赖变更提升）
- Modify: `README.md`
- Modify: `suite/order.js`, `suite/suite-center.js`
- Create: `docs/superpowers/specs/2026-10-02-ai-workbench-m13-context-compaction-design.md`
- Test: 所有受影响测试与完整回归

- [ ] **Step 1: 更新设计与使用说明**

记录摘要的范围边界、失败降级、清除入口、写操作隔离和存储字段；README 的版本、模块表和“历史只读背景”说明保持一致。不要把摘要宣称为证据或可恢复的站内事实。

- [ ] **Step 2: 构建并校验产物**

运行：

```text
npm test
npm run build
npm run verify:dist
git diff --check
```

预期：全量测试通过，Hydrogen/Oxygen/LTS 产物与源码版本和模块清单一致，补丁无空白错误。

- [ ] **Step 3: 做最终需求核对**

逐项确认：超过 M12 的历史能继续追问；摘要不越范围、不成为证据、不授权写入；停止后输入和网络立即释放；失败可重试；新对话、换主题、换分页和切换排序不串摘要；引用只来自本轮材料；摘要缓存按模型、版本、范围和来源指纹失效。

## M13 之后的排期建议

完成 M13 并稳定一轮后再排 M14，避免在上下文语义未固定时继续扩展功能：

1. **M14：证据新鲜度与回答复核**：材料变化时区分回答缓存失效和引用失效；提供本地重新读取引用、保留旧回答对照和引用差异提示。
2. **M15：模型端点能力与诊断**：探测流式/JSON/Anthropic/OpenAI 能力，记录脱敏的延迟、取消、降级和失败原因；设置页提供连接自检，不发送站内写请求。
3. **M16：对话导出与可移植性**：仅导出脱敏问答、摘要和验证过的引用 ID；导入先预览、按范围合并，不恢复动作计划或短期目标凭据。
