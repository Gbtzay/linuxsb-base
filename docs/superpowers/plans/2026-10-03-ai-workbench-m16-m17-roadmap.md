# M16–M17 AI 工作台后续路线实施计划

> **For agentic workers:** Use `superpowers:executing-plans` to执行本计划；当前会话约束为禁止使用子代理，只能在主会话内按任务推进。

> **Scope update (2026-10-03):** 当前只执行 M16.1 和 M16.2。M16.3 与 M17 暂缓，后续另行确认；活动实施清单见 `2026-10-03-ai-workbench-m16-1-m16-2.md`。
>
> 本文件后面的 M16.3/M17 内容仅作历史路线参考，不属于当前交付范围。

**Goal:** 在 M15 Gemini 式侧栏稳定后，先补齐模型端点能力探测与可诊断性，再提供脱敏对话导出和可移植导入，同时不改变现有证据校验、停止/重试和站内写操作安全链。

**Architecture:** M16 把端点协议识别、探测结果和诊断脱敏做成基座提供的纯函数，AI 总结插件负责实际探测、缓存和设置页交互，工作台只读取已经脱敏的状态。M17 将对话导出/导入做成独立的纯数据转换层，工作台负责预览和用户确认；导出的数据不含动作计划、短期目标凭据、API Key、原始 URL 或未验证正文。

**Tech Stack:** 现有 Userscript + LSB 基座、ESM 源码、esbuild、Node `node:test`、jsdom、Chromium/Edge CDP 浏览器验收。

## Global Constraints

- 先完成 M15.3 质量收口，再开始 M16；不把无关行情模块改动混入 AI 交付。
- 现有 M12–M15 的取消信号、迟到响应隔离、材料范围、引用复核和写操作结果检查必须保持不变。
- 诊断和自检只能调用用户主动触发的模型请求；不得发送站内写请求、当前页面正文、对话历史或 API Key 以外的额外数据。
- 诊断只保存脱敏的协议、状态分类、延迟、取消、降级和固定错误码；不得保存 API Key、Authorization、Cookie、CSRF、完整 URL 查询、提示词或回答正文。
- 导入只产生待确认的本地数据；不得恢复动作计划、执行状态、短期目标引用或任何可重放写请求。
- 不执行 `reset`、`clean`、`commit` 或 `push`；保留工作区已有修改和验证产物。

## 基线与质量门槛

当前 M15 已完成统一 composer、材料取消、自然语言路由和单一发送/停止控件；灰色空白控件的回归测试位于 `test/ai-workbench.test.js`。最近完整回归为 712/713 通过，唯一失败是未改动的 `test/title-quotes.test.js:658` 悬停断言。进入 M16 前先重复该失败三次并判断是稳定缺陷还是测试时序问题；只有在确认不影响 AI 代码后，才将它作为独立修复或独立已知失败记录。

---

## M16.1：端点能力契约与纯函数

**Files:**

- Create: `src/ai-diagnostics.js`
- Modify: `src/core.js:1-15, 575-590`，暴露 `api.ai.diagnostics`
- Modify: `package.json`、`src/core.js`、`build-suite.mjs`，同步基座/套件版本
- Test: `test/ai-diagnostics.test.js`、`test/core.test.js`

**Interfaces:**

- `normalizeEndpoint({ apiUrl, apiStyle, model }, baseHref) -> { protocol, origin, path, modelKey }`
- `classifyProbeResponse({ protocol, status, contentType, sawDelta, completed, aborted, elapsedMs }) -> { outcome, capabilities, reasonCode, elapsedMs }`
- `redactDiagnostic(raw) -> { version, protocol, outcome, capabilities, statusClass, elapsedMs, reasonCode, createdAt }`

- [ ] **Step 1: 写失败测试**

  覆盖自动识别 `/chat/completions` 和 `/messages`、显式协议覆盖 URL、非法端点降级为 `invalid`、只保留 origin/path 的 endpoint key、成功 JSON、成功 SSE、流式拒绝、超时、AbortError 和非 2xx 的固定分类；断言任何输入中的 key、token、cookie、查询参数、提示词和回答正文都不出现在 `redactDiagnostic()` 返回值。

- [ ] **Step 2: 运行纯函数和基座 API 测试确认失败**

  Run: `node --test --test-force-exit test/ai-diagnostics.test.js test/core.test.js --test-name-pattern="M16"`

  Expected: 新增接口未定义或断言失败。

- [ ] **Step 3: 实现最小诊断模块并接入基座**

  在 `src/ai-diagnostics.js` 中只实现无副作用函数；在 `src/core.js` 的 `api.ai` 下以冻结对象暴露它们。禁止模块读取 DOM、localStorage、网络或 API Key。协议判断复用现有 AI 总结的 Anthropic/OpenAI 规则，但不得复制一套会产生不同结果的字符串判断。

- [ ] **Step 4: 运行测试并同步版本**

  Run: `node --test --test-force-exit test/ai-diagnostics.test.js test/core.test.js --test-name-pattern="M16"`

  Expected: PASS；再运行 `npm run build`，确认 Hydrogen、Oxygen、LTS 产物都能解析。基座版本和套件版本按仓库现行递增规则同步，并更新 `README.md` 的版本和 API 一览。

## M16.2：主动连接自检与能力缓存

**Files:**

- Modify: `plugins/ai-summary.user.js:430-530, 967-1006`
- Modify: `plugins/ai-workbench.user.js:2840-2860`（仅增加打开设置/自检入口，不改变 composer 布局）
- Test: `test/ai-summary.test.js`、`test/ai-workbench.test.js`

**Interfaces:**

- `provider.probe({ signal, force = false }) -> Promise<{ result, diagnostic }>`
- `provider.providerState() -> { configured, model, protocol, capabilities, lastDiagnostic }`
- 本地存储键：`lsb_base:ai-summary:diagnostics`，最多 50 条且序列化后不超过 64 KiB；能力结果按脱敏 endpoint key + model 缓存 24 小时。

- [ ] **Step 1: 写失败测试**

  用本地 fixture 分别返回完整 JSON、OpenAI SSE、Anthropic SSE、明确拒绝 stream、无效 JSON、401/429/5xx 和延迟响应。测试断言自检只在点击后发送常量最小请求，不携带当前页面、历史、引用或站内动作字段；AbortSignal 会中止底层读取；流式拒绝最多补发一次整段 JSON 请求；重复点击不会并发发起第二组探测；配置端点或模型变化会使旧缓存失效。

- [ ] **Step 2: 运行测试确认失败**

  Run: `node --test --test-force-exit test/ai-summary.test.js test/ai-workbench.test.js --test-name-pattern="M16 自检|M16 能力"`

  Expected: `probe`、能力状态或自检控件尚未存在。

- [ ] **Step 3: 实现主动自检**

  在 AI 总结设置页加入一个“连接自检”按钮和状态区域。点击后调用 `provider.probe()`，使用已有 `api.net.raw`、现有超时和 AbortSignal；请求正文只包含配置模型和固定的短测试文本。成功显示协议、JSON/流式支持、耗时和是否发生降级；失败显示固定中文错误码和手动重试，不展示服务端原文。

- [ ] **Step 4: 接入工作台状态**

  `providerState()` 只返回脱敏状态；工作台模型标签仍是可点击的设置入口，必要时在设置入口旁显示“未配置 / 最近自检失败 / 流式已降级”三种短状态。不得在消息流中插入 API URL、HTTP 原文或诊断堆栈。

- [ ] **Step 5: 运行定向测试**

  Run: `node --test --test-force-exit test/ai-summary.test.js test/ai-workbench.test.js --test-name-pattern="M16 自检|M16 能力"`

  Expected: 全部 PASS；同时确认 M12 流式、停止、重试测试仍通过。

## M16.3：诊断持久化、降级记录与浏览器验收

**Files:**

- Modify: `plugins/ai-summary.user.js`（统一记录调用结果、取消、超时和一次性降级）
- Modify: `plugins/ai-workbench.user.js`（设置入口状态渲染）
- Modify: `README.md`
- Modify/Create: `scripts/check-ai-workbench-browser.mjs`
- Test: `test/ai-summary.test.js`、`test/ai-workbench.test.js`

- [ ] **Step 1: 写诊断记录测试**

  断言成功、取消、网络中断、HTTP 非 2xx、协议错误和 stream→JSON 降级各生成一个固定 `reasonCode`；只读请求的迟到响应不会写入新记录；保存达到 50 条或 64 KiB 时从最旧记录开始裁剪；配置变化后旧 endpoint key 的结果不显示为当前状态。

- [ ] **Step 2: 实现固定错误码和裁剪**

  只把 `redactDiagnostic()` 的结果写入存储；错误码限定为 `configured-missing`、`endpoint-invalid`、`http-auth`、`http-rate-limit`、`http-server`、`protocol-invalid`、`stream-unsupported`、`timeout`、`cancelled`、`network`、`ok`。保留状态分类，不保存错误消息原文。

- [ ] **Step 3: 扩展本地浏览器 fixture**

  在 `scripts/check-ai-workbench-browser.mjs` 增加设置页自检、取消自检、流式拒绝后单次 JSON 降级和诊断不泄露检查；使用本地模拟端点，不访问生产站点模型。

- [ ] **Step 4: 完成 M16 验收**

  Run:

  ```text
  npm run build
  npm run verify:dist
  git diff --check
  node --test --test-force-exit test/ai-diagnostics.test.js test/ai-summary.test.js test/ai-workbench.test.js
  node scripts/check-ai-workbench-browser.mjs
  npm test
  ```

  Expected: AI 定向测试和浏览器验收全通过；完整回归无新增失败，若行情基线仍失败则单独列明，不得把它归因于 M16。

---

## M17.1：脱敏导出格式与纯数据导入预览

**Files:**

- Create: `src/ai-portability.js`
- Modify: `src/core.js`，暴露 `api.ai.portability`
- Modify: `plugins/ai-workbench.user.js`，增加更多菜单中的导出/导入入口
- Test: `test/ai-portability.test.js`、`test/ai-workbench.test.js`

**Interfaces:**

- `exportConversations(history, { scope = 'all' } = {}) -> { schema: 'lsb-ai-conversations/v1', exportedAt, conversations }`
- `previewImport(payload, current, { scope = 'current' } = {}) -> { ok, counts, warnings, conversations }`
- `mergeImported(current, preview, { scope = 'current' } = {}) -> nextHistory`

- [ ] **Step 1: 写失败测试**

  建立包含普通只读问答、压缩摘要、已验证引用、研究候选、站内写计划、执行记录、短期目标和敏感 URL 的历史 fixture。断言导出只保留脱敏问题/回答、范围、摘要和验证过的引用 ID；不出现动作步骤、执行状态、目标凭据、CSRF、API Key、原始分页 URL、未验证正文或候选标题。

- [ ] **Step 2: 实现版本化导出**

  `exportConversations()` 生成有限大小的纯 JSON；导出 ID 使用新的随机导入标识，不复用本地正在运行的动作/目标 ID。保留 `scope` 和引用的 `{ topicId, floor, postId }` 白名单字段，引用正文只保留短脱敏摘要或省略。

- [ ] **Step 3: 实现导入预览和范围合并**

  `previewImport()` 先校验 schema、字符预算、会话/轮次上限和范围；无效记录进入 warnings 且不写入。`mergeImported()` 为导入记录重新生成本地会话/轮次 ID，只合并当前范围或用户明确选择的全部范围；绝不恢复 `site-action` 的可执行状态。

- [ ] **Step 4: 运行纯函数测试**

  Run: `node --test --test-force-exit test/ai-portability.test.js --test-name-pattern="M17"`

  Expected: PASS；非法 schema、超限、跨范围和敏感字段 fixture 均被拒绝或脱敏。

## M17.2：工作台导入/导出 UI 与浏览器验收

**Files:**

- Modify: `plugins/ai-workbench.user.js:3500-3605`（更多菜单）
- Modify: `scripts/check-ai-workbench-browser.mjs`
- Modify: `README.md`
- Test: `test/ai-workbench.test.js`

- [ ] **Step 1: 写 UI 失败测试**

  断言导出按钮生成下载而不发网络请求；导入文件先显示会话数、轮次数、丢弃数和警告；取消预览不改变 localStorage；确认后只新增脱敏会话；导入包含写计划时不会出现执行按钮，也不会调用 `ai-write-actions`。

- [ ] **Step 2: 实现 UI**

  在顶部更多菜单增加“导出对话”和“导入对话”。导出使用 Blob 下载；导入使用隐藏 file input，读取后只调用 `previewImport()`，以现有确认对话框/卡片呈现预览。确认后调用 `mergeImported()`、保存历史并重绘当前会话；读取或解析期间可取消且不阻塞 composer。

- [ ] **Step 3: 浏览器验收**

  在本地 fixture 中完成：导出 → 清空当前对话 → 导入预览 → 取消；再次导入并确认；切换范围检查隔离；检查 storage 和页面 DOM 不包含 Key、原始 URL、短期目标凭据或可执行写计划。

- [ ] **Step 4: M17 回归与交付**

  Run:

  ```text
  npm run build
  npm run verify:dist
  git diff --check
  node --test --test-force-exit test/ai-portability.test.js test/ai-workbench.test.js
  node scripts/check-ai-workbench-browser.mjs
  npm test
  ```

  Expected: 导出/导入测试、M12–M16 回归和浏览器验收通过；完整测试中的任何非 AI 失败单独追踪。

## 交付顺序与停止条件

1. 先收口 M15 基线失败，再按 M16.1 → M16.2 → M16.3 交付；每个小版本都先跑定向测试，再构建和浏览器验收。
2. M16 通过后才开始 M17；如果端点自检出现 API Key、页面材料、历史或写动作字段泄露，立即停止 M16，不进入导出功能。
3. M17 导入预览、范围隔离或写动作隔离任一失败时，只修复纯数据层和预览层，不增加自动迁移或自动执行行为。
4. 所有交付保留现有工作区改动，不提交、不推送；完成后由用户决定是否进入下一轮实现。
