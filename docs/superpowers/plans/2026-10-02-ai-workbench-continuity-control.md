# AI 工作台 M12 实施计划

> **执行方式：** 用户已批准规格与开发；在当前会话直接实施，禁止派发子代理。不提交或推送现有混合工作树。

**Goal:** 连续追问使用当前对话背景，用户能停止并手动重试生成，模型回答逐步显示。

**Architecture:** 基座提供纯函数历史整理与 SSE 解码；统一网络出口支持 AbortSignal 和文本增量；ai-summary 提供完整/流式模型响应；ai-copilot 负责范围和证据；ai-workbench 管理每次请求生命周期与展示。

**Tech Stack:** 原生 JavaScript、Tampermonkey GM 请求/fetch、Node test、jsdom、esbuild。

**Baseline:** 最新副本 `D:/test/linuxsb-base`，氢 0.1.49 / 氧 1.0.129，上一轮完整验证 646 个测试通过。工作树已有未提交功能；所有新增验证重新执行，不以旧快照代替。

**执行结果（2026-10-02）：** 四项任务均已完成，当前会话执行，未派发子代理。最终全量测试 673/673 通过（新增 M12 测试 27 个），三份构建与产物校验通过，Edge 本地模拟交互验证通过。氢 0.1.50 / 氧与 LTS 1.0.130；AI 总结 1.3.0 / 副驾 0.9.0 / 工作台 0.5.0。详见 [M12 验证记录](D:/test/linuxsb-base/docs/superpowers/plans/2026-10-02-ai-workbench-m12-verification.md)。

### Task 1: 有界历史与连续追问（M12.1）

- 新建 `src/ai-conversation.js` 与 `test/ai-conversation.test.js`；纯函数 `prepareConversation(rows, { maxChars, maxTurns })` 返回规范化角色/正文及文本块，预算按 Unicode 字符计，丢弃不完整问答。
- 在 `src/core.js` 的 `api.ai` 暴露该纯函数。
- 工作台选择当前 conversation 的已完成只读轮次，要求上下文 kind、routeType、topicId 与页面范围相同，版块、排序及分页变化会隔离背景，传入 `conversation: [] | rows`；操作计划不使用它。
- 副驾 topic/console/research 回答与只读规划加入规范化历史及缓存指纹。显式 conversation 不写回独立副驾主题 session。
- 先写失败测试，再实现，`node build.mjs` 后运行纯函数、copilot 和 workbench 测试。

### Task 2: 中断链与工作台请求生命周期（M12.2）

- 新建共享取消辅助函数 `src/abort.js`，网络入口接收 `signal`；队列、fetch、GM、退避与分页支持取消；带 signal 的 doc 不共享其它调用的生命周期。
- 扩展模型 `generate({ system, user, signal })` 及副驾公共只读/规划接口，所有异步结果在保存前检查 signal。
- 工作台以每次请求独立 controller/token 管理结果；停止、切换、路由和 dispose 中断活动只读请求。停止保留原问题和状态，立即释放输入；重试强制生成。
- 站内写操作执行继续使用现有结果检查，不将用户取消控制器传给已发送写入。
- 先写网络取消、停止/迟到响应与重试测试，再实现，验证旧写动作和研究入口回归。

### Task 3: SSE 与渐进展示（M12.3）

- 新建 `src/ai-stream.js` / `test/ai-stream.test.js`，提供 `createAnswerStream({ protocol, onDelta, maxChars })`、`push(chunk)`、`finish()`。协议解析只提取回答正文，必须确认完成事件。
- 网络 raw 扩展 `onChunk`，fetch 逐字节解码，GM 累计 responseText 仅转发新增文本，守住取消与响应限额。
- 模型提供方按 `onDelta` + `streamAnswers` 启用 SSE，JSON 兼容、明确拒绝 stream 时仅一次降级；计划默认不流式。
- 工作台增量使用临时内存正文和纯文本 DOM，最终成功才保存/渲染安全 Markdown 与本地引用，失败/停止显示部分内容和状态并允许重试。
- 覆盖分片/中文/CRLF/终止/错误/未知事件/双协议/JSON 降级，验证中途界面与完成后的引用。

### Task 4: 交付验证

- 更新氢/插件/氧版本及相关 requires、README。构建三份分发脚本并 `npm run verify:dist`。
- 运行全部 `npm test` 并记录当前结果；仅在新更改或失败时重复针对性测试。
- 用本机浏览器打开本地受控 fixture，验证连续追问、新对话、实时文本、停止、重试及最终引用。
- 本会话自查 diff、权限与写操作边界；记录具体证据和浏览器验证范围，交付改动文件与实际测试结果。
