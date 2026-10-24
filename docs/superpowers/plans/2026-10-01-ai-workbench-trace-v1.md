# AI 工作台 M11 统一可信阶段 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:executing-plans (inline execution) to implement this plan task-by-task. Steps use checkbox (`- [x]`) syntax for tracking.

**Goal:** 为帖子副驾、追踪、研究、自然语言操作台和站内写动作接入统一的 `trace.v1` 可验证阶段协议，并在右栏以紧凑时间线和可展开证据详情呈现真实处理过程。

**Architecture:** 基座新增纯本地 `src/ai-trace.js`，提供事件校验、状态迁移、脱敏和计划版本归一化，并通过 `api.ai.trace` 暴露。AI 插件继续负责自己的业务读取和写入，仅在真实边界发出安全阶段事件；`ai-workbench` 聚合事件、兼容旧 `phases` 历史并负责时间线 UI。未知计划版本只能降级为普通只读查询；包含写动作或无法安全降级的计划必须拒绝执行。

**Tech Stack:** JavaScript userscripts, LSB plugin API, Node `node:test`, JSDOM, esbuild distribution scripts, localStorage-backed plugin history.

## Global Constraints

- 所有 AI 流程统一使用 `trace.v1`，阶段只能是 `plan|scope|read|validate|answer|execute|check|limit`。
- 状态只能从 `pending -> active -> complete|failed|unknown|skipped` 迁移；写结果不确定必须是 `unknown`，不能显示成功。
- 阶段摘要、数量和引用由本地代码生成；模型不能声明阶段完成或注入引用。
- 历史每轮最多保留 6 条阶段摘要，每条最多 200 字；正文、完整 DOM、CSRF、Cookie、完整原始 URL、临时目标映射、写凭据和模型隐藏推理不得持久化。
- 已知计划变体在本地归一化；未知版本降级为普通只读查询并明确显示限制；含写动作、任意 URL、未验证目标或未知权限的未知计划拒绝执行。
- 写动作继续沿用 M10.1 的二次确认、结果未知和一次性只读核验，不自动重发。
- 旧工作台历史中的 `understand|context|local|evidence|action` 阶段必须可读取；旧 UI 数据属性继续保留兼容映射，旧 `cancelled` 状态映射为 trace 的 `skipped`。
- 新增或修改 `src/`、AI 插件和测试时保持 UTF-8 无 BOM、LF 行尾；不重置现有未提交改动。
- 用户已要求当前会话内继续，不提交、不合并、不推送；计划中的提交步骤全部改为工作区验证。

---

## 文件结构与职责

- **Create:** `src/ai-trace.js` — `trace.v1` 常量、字段白名单、脱敏、状态迁移和计划版本归一化。
- **Modify:** `src/core.js` — 导入 trace 工具并通过 `api.ai.trace` 提供纯函数和安全全局事件发布。
- **Create:** `test/ai-trace.test.js` — 协议、迁移、脱敏和兼容降级的纯单元测试。
- **Modify:** `test/core.test.js` — 验证插件能读取 trace 工具、发布安全事件且不需要额外权限。
- **Modify:** `src/ai-actions.js` — 为计划兼容层提供动作目录权限和写动作识别所需的只读信息，不放宽严格执行校验。
- **Modify:** `plugins/ai-copilot.user.js` — 将已有 `onProgress` 阶段映射为 trace 事件，处理计划归一化/只读降级，并传递 `flowId`。
- **Modify:** `plugins/ai-summary.user.js` — 为独立 AI 总结的采集、模型请求、结果和失败阶段发布安全事件，并在现有等待/结果面板显示同一套阶段摘要。
- **Modify:** `plugins/ai-workbench.user.js` — 聚合事件、兼容旧历史、渲染紧凑时间线/证据详情并处理降级提示。
- **Modify:** `plugins/ai-write-actions.user.js` — 发布确认、提交、失败、未知和检查事件；不改变 M10.1 的写入安全边界。
- **Modify:** `test/ai-actions.test.js`, `test/ai-copilot.test.js`, `test/ai-summary.test.js`, `test/ai-workbench.test.js`, `test/ai-write-actions.test.js`, `test/hardening.test.js` — 覆盖协议接入、降级、UI、隐私和资源清理。
- **Modify:** `package.json`, `package-lock.json`, `README.md`, `suite/suite-center.js`, `test/suite.test.js`, `src/core.js` 版本号；构建生成 `dist/linuxsb-base.user.js`、`dist/linuxsb-suite.user.js`、`dist/linuxsb-lts.user.js`。

---

### Task 1: 实现 `trace.v1` 纯本地协议

**Files:**
- Create: `src/ai-trace.js`
- Create: `test/ai-trace.test.js`
- Modify: `src/core.js`
- Test: `test/core.test.js`

**Interfaces:**
- `TRACE_STAGES`, `TRACE_STATES`, `TRACE_EVIDENCE`：冻结的字符串集合。
- `sanitizeTraceEvent(raw, options = {}) -> event`：只返回白名单字段；摘要最多 200 字，数组和数量有上限。
- `validateTraceEvent(raw, previous = null) -> { ok, event?, error? }`：检查类型、字段、状态迁移和引用结构。
- `transitionTrace(previous, next) -> { ok, event?, error? }`：拒绝结束状态回到活动状态。
- `normalizePlanVersion(raw, context = {}) -> { kind: 'plan'|'fallback'|'unsupported', plan?, question?, warnings, reasonCode? }`：已知变体返回当前 v1 计划，未知安全只读请求返回 fallback，写或不安全计划返回 unsupported。

- [x] **Step 1: 写协议失败测试**

在 `test/ai-trace.test.js` 添加以下断言：

```js
const event = sanitizeTraceEvent({
  id: '1', flowId: 'turn-1', stage: 'read', state: 'active',
  title: '读取', summary: 'x'.repeat(400), evidence: 'verified',
  counts: { selected: 1, read: 2, matched: 3, citations: 4 },
  citations: ['floor-1'], csrf: 'secret', html: '<body>',
})
assert.equal(event.summary.length, 200)
assert.equal('csrf' in event, false)
assert.equal(validateTraceEvent(event).ok, true)
assert.equal(transitionTrace({ ...event, state: 'complete' }, { ...event, state: 'active' }).ok, false)
```

同时覆盖空 `flowId`、未知 stage/state、负数 counts、非数组 citations、重复引用和敏感键清理。

- [x] **Step 2: 运行测试确认协议尚未实现**

运行：`node --test test/ai-trace.test.js`

预期：因 `src/ai-trace.js` 尚不存在而失败；不要修改生产代码来绕过失败。

- [x] **Step 3: 实现最小协议工具**

在 `src/ai-trace.js` 实现冻结集合、`isRecord`、字符串裁剪和固定错误码。`sanitizeTraceEvent` 只复制协议字段，`counts` 每项限制为 `0..9999`，`citations` 最多 40 条且每条不超过 120 字。`validateTraceEvent` 返回 `{ ok: false, error: { code, path, message } }`，不抛出用户输入错误。

`transitionTrace` 允许新事件从无前态开始；有前态时只接受 `pending -> active`、`active -> complete|failed|unknown|skipped`，同一终态的安全摘要更新只允许保持终态。

- [x] **Step 4: 实现计划版本归一化**

`normalizePlanVersion` 只接受以下已知变体：数字 `1`、字符串 `'1'`，以及缺失版本但拥有 `summary + steps` 的旧本地计划。对每个 step 只把 `id -> action`、`params -> args` 作为无冲突别名；其它未知字段删除并加入 `plan-normalized` 警告。返回的计划固定为 `{ version: 1, summary, steps }`，不补造动作或参数。

未知版本或结构无法安全归一化时，如果上下文动作目录中没有写动作候选，返回：

```js
{ kind: 'fallback', question: clippedQuestion, warnings: ['plan-downgraded'], reasonCode: 'plan-downgraded' }
```

若原始 steps 明示写动作、任意 URL、目标 ID、未知权限或不可验证字段，则返回 `kind: 'unsupported'` 和 `plan-unsupported`，不得返回 fallback。

- [x] **Step 5: 暴露到 `api.ai.trace` 并通过测试**

在 `src/core.js` 导入工具，给插件 API 增加：

```js
api.ai.trace = {
  sanitize: sanitizeTraceEvent,
  validate: validateTraceEvent,
  transition: transitionTrace,
  normalizePlanVersion,
  emit: (event) => safeGlobalTraceEvent(event),
}
```

`emit` 先脱敏和校验，再通过 `api.emitGlobal('ai:trace', safeEvent)` 发布；纯函数不要求权限，`emit` 只要求现有 `events` 权限。加入 core 测试，断言事件不会包含 CSRF/HTML，停用插件后监听器会被清理。

运行：`node --test test/ai-trace.test.js test/core.test.js`

---

### Task 2: 让动作计划兼容层安全降级

**Files:**
- Modify: `src/ai-actions.js`
- Modify: `plugins/ai-copilot.user.js`
- Modify: `plugins/ai-workbench.user.js`
- Test: `test/ai-actions.test.js`
- Test: `test/ai-copilot.test.js`
- Test: `test/ai-workbench.test.js`

**Interfaces:**
- `api.ai.validatePlan()` 继续严格拒绝未知版本，保证执行入口不放宽。
- `ai-copilot.planActions()` 在严格校验前调用 `api.ai.trace.normalizePlanVersion()`，返回 `{ plan, previews, normalizedWarnings }` 或 `{ fallback: true, warning, question }`。
- `ai-workbench` 收到 fallback 后调用现有 `runConsoleQuery({ question, onProgress })`，只读执行，并在该轮时间线加入 `plan-downgraded` 限制；不得调用 `api.ai.execute()`。

- [x] **Step 1: 添加计划兼容失败测试**

在动作测试中覆盖：字符串版本 `'1'`、缺失版本的本地计划和 `id/params` 别名能够归一；`version: 99` 的只读步骤返回 fallback；包含 `site.write-reply`、任意 URL 或未知权限的 `version: 99` 返回 unsupported；严格 `validatePlan()` 对 `version: 99` 仍返回 `plan.version`。

在工作台测试中 mock `runConsoleQuery` 和 `api.ai.execute`，输入未知版本计划后断言只读查询被调用一次、execute 调用数为 0、界面显示“已降级为普通只读查询”。

- [x] **Step 2: 扩展动作目录只读识别**

在 `src/ai-actions.js` 增加不暴露内部函数的 `hasWriteAction(steps, context)` 或等价内部判断，只根据已注册动作的 `permission` 和固定动作 ID 判断写候选。未知动作不能被当成安全只读动作；`validatePlan` 原有未知动作、写隔离、动作绑定和导航末尾规则保持不变。

- [x] **Step 3: 接入 `planActions` 归一化和 fallback**

在 `ai-copilot.user.js` 解析模型 JSON 后先调用 trace normalizer，再把 `kind: 'plan'` 交给现有 `api.ai.validatePlan`。保存缓存时只保存归一后的安全计划和警告，不保存模型原始对象。`kind: 'fallback'` 不建立 action history，返回一个只读 fallback 描述；`kind: 'unsupported'` 返回可显示的固定错误，不触发动作。

- [x] **Step 4: 在工作台增加降级分支**

在 action-mode 执行入口识别 `fallback`，创建普通问答轮次，追加一个 `limit` 事件（`reasonCode: 'plan-downgraded'`），再调用 `runConsoleQuery`。降级查询只能使用当前允许的本地范围，不能自动导航、筛选或写入。兼容已有 action history，旧记录仍按原严格校验逻辑恢复。

- [x] **Step 5: 运行聚焦测试**

运行：`node --test --test-force-exit test/ai-actions.test.js test/ai-copilot.test.js test/ai-workbench.test.js`

预期：原有动作执行、缓存、刷新恢复和研究测试保持通过；新增未知版本用例通过。

---

### Task 3: 将副驾、研究、总结和写动作接入 trace 生产端

**Files:**
- Modify: `plugins/ai-copilot.user.js`
- Modify: `plugins/ai-summary.user.js`
- Modify: `plugins/ai-write-actions.user.js`
- Test: `test/ai-copilot.test.js`
- Test: `test/ai-summary.test.js`
- Test: `test/ai-write-actions.test.js`

**Interfaces:**
- `onProgress` 旧回调继续收到原阶段名，兼容既有 tests/UI；同时按以下映射发出 trace：`understand/context -> scope`、`local -> read`、`evidence -> validate`、`answer -> answer`、`action -> execute`。
- 所有公共入口接受可选 `flowId`；缺失时由插件生成一次性内存 ID，不能写入用户输入或站点正文。
- `api.ai.trace.emit()` 只发布安全事件；调用方只传本地生成的 counts/citations/reasonCode。

- [x] **Step 1: 写阶段顺序和脱敏测试**

给 `runTopic`、`runConsoleQuery`、`startResearch`、`readResearchSelection`、`loadResearchTopicPage` 和 `readResearchReplySelection` 传入 `flowId` 与 mock `onProgress`，监听 `ai:trace`，断言实际顺序包含 scope/read/answer/validate，旧回调仍包含 context/local/evidence。向摘要和阶段摘要注入 URL、CSRF、正文标记，断言事件和持久化载荷均不包含这些值。

在写动作测试中断言确认、提交、明确失败、未知结果和一次性检查分别产生 execute/check/limit 事件，unknown 不被转换为 complete。

- [x] **Step 2: 实现副驾 trace 适配器**

重构现有 `emitProgress` 为“先保留旧回调，再调用 trace emitter”的小函数。完成/失败状态以真实函数边界为准：本地读取成功后才发 read complete，引用映射完成后才发 validate complete，模型请求异常发 answer failed。研究页数、已选数、引用数从本地结果计算，不解析模型摘要来填充 counts。

- [x] **Step 3: 为独立 AI 总结发布阶段**

在 `ai-summary.user.js` 的 `run()` 中创建 flowId，采集前发布 scope active，采集完成发布 read complete，请求模型发布 answer active/complete，缓存命中也发布 answer complete 并标记摘要来源为缓存；异常发布固定 reasonCode。继续保持现有 120 秒超时、缓存和站内限速边界。

- [x] **Step 4: 为写动作发布真实回执阶段**

在 `ai-write-actions.user.js` 的确认和执行路径发布 execute active；`classifyWrite` 返回 success/failure/unknown 后分别发布 complete/failed/unknown；短期凭据只在内存中传给 check-result，检查结果发布 check complete/failed/unknown。禁止把 receipt、CSRF、表单正文或原始响应放进事件。

- [x] **Step 5: 运行生产端聚焦测试**

运行：`node --test --test-force-exit test/ai-copilot.test.js test/ai-summary.test.js test/ai-write-actions.test.js`

预期：旧阶段回调兼容，新增 trace 事件顺序和敏感字段测试通过。

---

### Task 4: 工作台聚合、历史迁移与紧凑时间线

**Files:**
- Modify: `plugins/ai-workbench.user.js`
- Modify: `plugins/ai-summary.user.js`
- Test: `test/ai-workbench.test.js`
- Test: `test/ai-summary.test.js`
- Test: `test/hardening.test.js`

**Interfaces:**
- `normalizedConversationTurn(raw)` 读取 `raw.trace`；没有 trace 时将旧 `phases` 映射为 trace：`understand/context -> scope`、`local -> read`、`evidence -> validate`、`action -> execute`；旧 `cancelled` 映射为 `skipped`。
- `appendTurnTrace(conversationId, turnId, event)` 使用 `api.ai.trace.sanitize/transition`，历史只保留最多 6 条安全摘要；`appendTurnPhase` 保留为旧 UI 兼容适配器。
- `renderTrace(host, trace, { compact })` 输出 `[data-ai-trace]`、`[data-ai-trace-event]`、`[data-ai-trace-details]`，旧 `[data-ai-chat-process]` 和 `[data-ai-chat-phase]` 继续存在。

- [x] **Step 1: 写历史迁移和渲染失败测试**

预置旧 `phases` 历史，加载后断言生成 trace 映射且不改变问题/回答/引用；预置含敏感字段的 trace，断言历史仅保留安全摘要。测试时间线默认折叠、点击 details 可展开，显示限制和引用；阶段完成前不能出现 complete。

- [x] **Step 2: 实现 trace 聚合和兼容迁移**

在工作台中新增 `trace` 字段和 `normalizeTrace`。所有已有 `appendTurnPhase` 调用经过映射进入 trace；旧 stage 保留到 `phases` 以兼容当前测试和历史。保存前调用 trace sanitizer，最多保留最近 6 条事件，不保存 counts 之外的原始材料、完整链接或临时对象。

- [x] **Step 3: 实现紧凑时间线和证据详情**

用 `document.createElement` 创建时间线，不将模型摘要拼入 `innerHTML`。处理中 `<details open>`，结束后 `<details>` 默认折叠；摘要行显示读取数量、引用数量和 evidence 状态。`limit` 事件显示固定限制文案；`unknown` 使用醒目但非成功色；引用只复用当前 turn 的本地已验证 citation renderer。

- [x] **Step 4: 接收全局 trace 事件并隔离迟到结果**

工作台订阅 `ai:trace`，只接受当前内存中登记的 `flowId -> conversationId/turnId` 映射；会话切换、路由变化、插件停用后丢弃 UI 回写，但允许安全历史回写到原 turn。监听器通过 `api.on` 注册并由基座自动清理。

- [x] **Step 5: 运行工作台和停用清理测试**

运行：`node --test --test-force-exit test/ai-workbench.test.js test/hardening.test.js`

预期：统一时间线、折叠详情、历史迁移、路由/会话隔离和停用清理全部通过，旧 `[data-ai-chat-phase]` 断言不回归。

---

### Task 5: 隐私、未知计划和 M10.1 回归加固

**Files:**
- Modify: `test/ai-actions.test.js`
- Modify: `test/ai-copilot.test.js`
- Modify: `test/ai-workbench.test.js`
- Modify: `test/ai-write-actions.test.js`
- Modify: `test/hardening.test.js`

**Interfaces:**
- 任何 trace/history/action-history 写入前都经过同一个 sanitizer；测试通过存储原始 JSON 检查最终字符串。
- M10.1 的 receipt 只在当前内存存在，刷新后不出现 check 按钮；未知写结果仍不能重试。

- [x] **Step 1: 添加跨流程隐私断言**

让帖子正文、个人回帖、候选标题、CSRF、Cookie、查询 URL、目标 ID、receipt 和伪造的模型思维链分别进入各流程的摘要/结果，断言 `conversations`、`action-history` 和 trace 事件中均不存在这些值；保留已验证 citation ID 的最小映射。

- [x] **Step 2: 添加未知计划降级/拒绝回归**

测试未知只读版本会显示降级提示并只调用 `runConsoleQuery`；未知写版本、含任意 URL 或无法验证目标时不调用 `runConsoleQuery`、`api.ai.execute` 或站内网络请求，并显示 `plan-unsupported`。

- [x] **Step 3: 添加 M10.1 写回执回归**

覆盖 `{ ok: 1 }`、`{ ok: 0 }`、缺少 `ok`、HTML、204、5xx、超时和网络断开；断言 trace 与工作台状态分别为 complete、failed 或 unknown，检查按钮至多一次，POST 计数不会因检查增加。

- [x] **Step 4: 运行加固测试**

运行：`node --test --test-force-exit test/ai-actions.test.js test/ai-copilot.test.js test/ai-workbench.test.js test/ai-write-actions.test.js test/hardening.test.js`

---

### Task 6: 版本、文档和分发产物

**Files:**
- Modify: `src/core.js`, `package.json`, `package-lock.json`
- Modify: `plugins/ai-summary.user.js`, `plugins/ai-copilot.user.js`, `plugins/ai-workbench.user.js`, `plugins/ai-write-actions.user.js`
- Modify: `README.md`, `test/suite.test.js`, `suite/suite-center.js`
- Verify: `dist/linuxsb-base.user.js`, `dist/linuxsb-suite.user.js`, `dist/linuxsb-lts.user.js`

**Version targets:** 基座 `0.1.49`；`ai-summary` `1.2.1`；`ai-copilot` `0.8.0`；`ai-workbench` `0.4.0`；`ai-write-actions` `0.1.4`；Oxygen/LTS `1.0.129`。

- [x] **Step 1: 更新版本和依赖范围**

将 `src/core.js`、`package.json` 和 lockfile 对齐到 `0.1.49`；`ai-summary`、`ai-copilot`、`ai-workbench` 和 `ai-write-actions` 的 `requires.base` 更新为 `^0.1.49`，`ai-copilot` 的 `ai-summary` 依赖更新为 `^1.2.1`，`ai-workbench` 的 `ai-copilot` 依赖更新为 `^0.8.0`。各 userscript 头部 `@version` 与 manifest.version 分别更新到目标值；`build-suite.mjs` 和 suite center 更新到 `1.0.129`。

- [x] **Step 2: 更新 README 和套件测试**

README 的 AI 工作台条目加入统一阶段时间线、可展开证据、未知计划只读降级和写结果 unknown 检查说明；不承诺显示模型私有推理。`test/suite.test.js` 增加版本目标、基座包含 trace API、LTS 产物仍不含 AI 模块/写动作的断言。

- [x] **Step 3: 构建三种产物**

先记录 `git diff -- dist/`，运行：`npm run build`。确认 Hydrogen 含 `trace.v1` 与 `api.ai.trace`，Oxygen 含更新后的 AI 插件，LTS 没有 AI trace 代码或写动作模块。

- [x] **Step 4: 运行分发新鲜度检查**

运行：`npm run verify:dist`，检查版本、模块顺序、无 BOM/CRLF、产物可解析和 LTS 排除边界；不得清理或覆盖此前有效的 dist 改动。

---

### Task 7: 全量验证与工作区复核

**Files:**
- Verify: 所有测试、构建产物和当前工作区差异
- Modify: `docs/superpowers/plans/2026-10-01-ai-workbench-trace-v1.md`，记录最终结果

- [x] **Step 1: 运行完整测试**

运行：`npm test`

预期：所有现有测试和 M11 新增测试通过，`fail 0`，不得用聚焦测试替代全量结果。

- [x] **Step 2: 运行最终构建和差异检查**

依次运行：`npm run build`、`npm run verify:dist`、`git diff --check`。记录退出码和产物版本；换行提示不等于 whitespace error，但不能有真正的 diff check 错误。

- [x] **Step 3: 做需求逐项复核**

逐项确认：四类 AI 流程都发布 trace；时间线默认紧凑且可展开；已知计划变体兼容；未知只读计划降级；未知写计划拒绝；历史无敏感材料；M10.1 无自动重放；旧历史和旧数据属性可读；LTS 排除边界不变。

- [x] **Step 4: 更新执行结果，不提交**

在本计划“执行结果记录”段写入实际版本、测试数量和验证命令。运行 `git status --short --branch` 与 `git diff --stat`，确认保留工作区改动；不执行 `git commit`、`git merge` 或 `git push`。

## 执行结果记录

- 版本：基座 `0.1.49`；Oxygen/LTS `1.0.129`；AI 总结 `1.2.1`、副驾 `0.8.0`、工作台 `0.4.0`、写动作 `0.1.4`。
- 全量测试：`TZ=UTC npm test` 通过，646 项通过、0 失败。首次按本地 `Asia/Shanghai` 时区运行时，已有的“本日 K 线悬停”测试在午夜后失败；该测试固定使用 `now - 2h` 和 `now - 30m` 两个快照，在当地 00:00–01:00 会把两条快照都放到前一天。生产代码正确过滤前一天数据；固定 `TZ=UTC` 后同一测试及全量测试通过，因此未改动无关的行情逻辑。
- 构建：`npm run build` 成功，生成 Hydrogen `0.1.49`、Oxygen `1.0.129`、LTS `1.0.129`。
- 分发校验：`npm run verify:dist` 通过，确认 24 个模块和三份产物新鲜。
- 差异检查：`git diff --check` 退出码为 0；Git 仅提示工作区 LF 行尾未来可能转换为 CRLF。
- 需求复核：帖子副驾、研究、总结、写动作均发布安全 trace；工作台聚合阶段、引用和限制并兼容旧历史；计划版本降级/拒绝边界、脱敏、刷新中断和 M10.1 写动作边界均由聚焦与全量测试覆盖；LTS 不包含 AI trace 插件正文或写动作。
- 工作区仍在 `feat/shell-spa-click`，保留现有未提交改动；没有执行提交、合并或推送。
