# AI 工作台刷新恢复与内容写入实施计划

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [x]`) syntax for tracking.

**Goal:** 刷新或站内导航后恢复 AI 侧栏与会话，并以最小权限和双重确认支持回复、发帖、签到；M10.1 增加真实写回执分类和只读结果核验。

**Architecture:** `skin` 保存右栏偏好；`ai-workbench` 将持久化中的运行中状态恢复为中断并保留计划预览；核心动作注册表允许隔离的 `write` 单步计划；独立 `ai-write-actions` 只操作本站已验证的原生表单，签到通过签到日历的确认 RPC 完成。

**Tech Stack:** JavaScript userscripts, LSB plugin API, `api.store`, `api.ui.confirm`, Node `node:test`, JSDOM, esbuild distribution scripts.

## Global Constraints

- 首次仍默认“站点”；用户选择 AI 后，站内导航与完整刷新恢复该偏好。
- 启动时将遗留的 `pending` AI 请求标为 `stale` 并提供手动重试；动作绝不自动重放。
- 写操作最多每计划一步且不能与其他步骤混合，必须先审阅计划，再由写动作提供方二次确认。
- 回复和新主题发布必须匹配当前页面的本站 POST 原生表单、目标 ID、CSRF 字段和正文控件；校验失败即拒绝。
- 写动作提交仅允许白名单字段，不转发附件或未知字段，不申请站外 `net` 或 `admin` 权限。
- 签到只经签到日历保留原确认流程的安全 RPC；不得调用跳过确认的调试接口。
- `ai-actions` 保持只读，`ai-workbench` 不获得站点写权限；新 `ai-write-actions` 进入 Oxygen，不进入 LTS。

### M10.1 追加约束

- 站点写响应必须先解析 JSON `ok` 字段；HTTP 200、HTML、204、5xx 或缺少 `ok` 不能单独证明写入成功。
- 写动作明确失败与未知分流；未知状态只保留短期内存凭据，结果检查只读且单次消费，不重发任何 POST。
- 检查入口只在当前内存结果仍含凭据时显示；刷新恢复后的历史不恢复凭据。

---

## 文件结构与职责

- **Modify:** `plugins/skin.user.js` — 本地保存右栏选择；窄屏和视图暂缺只影响临时显示。
- **Modify:** `plugins/ai-workbench.user.js` — 恢复请求/动作中断态，显示完整写入内容与不确定结果，不自动重放。
- **Modify:** `src/ai-actions.js` — 增加 `write` 权限及计划级写动作隔离。
- **Modify:** `plugins/ai-copilot.user.js` — 计划器文案允许使用目录内受限读写动作，但不把帖子正文当指令。
- **Modify:** `plugins/checkin-calendar.user.js` — 提供调用 `doCheckin()`（不传 `skipConfirm`）的明确 RPC。
- **Create:** `plugins/ai-write-actions.user.js` — 登记当前主题回复、新主题发布和签到动作；仅声明本地 `write` 权限。
- **Modify:** `suite/order.js`, `build-suite.mjs`, `suite/suite-center.js`, `README.md` — 登记 Oxygen 插件、版本和能力说明；LTS 保持不含 AI。
- **Modify:** `test/skin.test.js`, `test/ai-workbench.test.js`, `test/ai-actions.test.js`, `test/fixes.test.js`, `test/suite.test.js`; **Create:** `test/ai-write-actions.test.js` — 覆盖状态恢复、权限边界、表单拒绝条件、确认与分发。
- **Generated:** `dist/linuxsb-base.user.js`, `dist/linuxsb-suite.user.js`, `dist/linuxsb-lts.user.js` — 只通过 `npm run build` 更新。

### Task 1: 注册 `write` 权限并隔离写计划

**Files:**
- Modify: `src/ai-actions.js`
- Test: `test/ai-actions.test.js`

**Interfaces:**
- Consumes: `ActionRegistry.register(spec, owner)` 和 `validatePlan(plan, context, options)`。
- Produces: `permission: 'write'` 动作目录项；包含写动作的计划必须恰好只有一个步骤，否则返回 `plan.write-isolation`。

- [x] **Step 1: 写失败测试。** 注册一个 `write` 动作和一个只读动作；断言单独写动作计划通过，读写混合计划与多写步骤计划失败。

```js
const plan = (steps) => ({ version: 1, summary: '测试', steps })
assert.equal(registry.validatePlan(plan([{ action: 'site.reply', args: {} }]), {}).ok, true)
assert.equal(registry.validatePlan(plan([{ action: 'site.reply', args: {} }, { action: 'site.navigate', args: {} }]), {}).errors[0].code, 'plan.write-isolation')
```

- [x] **Step 2: 运行目标测试并确认因权限不支持/隔离缺失而失败。**

Run: `node --test --test-name-pattern="写动作计划隔离" test/ai-actions.test.js`

- [x] **Step 3: 实现最小注册表校验。** 将 `write` 加入 `ACTION_PERMISSIONS`；`validatePlan` 收集已成功验证动作的权限，若任一动作为 `write` 且步骤总数不是 1，添加 `plan.write-isolation`。

```js
const hasWrite = steps.some((step) => this._actions.get(step.action)?.permission === 'write')
if (hasWrite && plan.steps.length !== 1) errors.push(fail('plan.write-isolation', '写操作必须单独组成一个计划', 'steps').error)
```

- [x] **Step 4: 重跑聚焦和动作目录测试。**

Run: `node --test --test-name-pattern="写动作计划隔离|计划校验|动作注册表" test/ai-actions.test.js`

### Task 2: 持久化氢壳右栏选择

**Files:**
- Modify: `plugins/skin.user.js`
- Test: `test/skin.test.js`

**Interfaces:**
- Consumes: `api.store.get('aside-active', 'site')` / `api.store.set('aside-active', id)`。
- Produces: 有效偏好只允许 `site` 或 `ai-workbench`；临时窄屏/插件未加载回退不得覆盖偏好。

- [x] **Step 1: 添加失败测试。** 首次无偏好仍激活 `site`；点击 AI 写入偏好；`route:changed` 后 AI 仍激活；第二个 JSDOM 实例共享 localStorage 后 AI 仍激活；窄屏只临时显示站点且存储仍是 AI。
- [x] **Step 2: 运行测试确认路由事件或新页面启动时失败。**

Run: `node --test --test-name-pattern="右栏.*偏好|AI 标签.*恢复" test/skin.test.js`

- [x] **Step 3: 分离持久偏好和临时激活态。** 初始化时容错读取白名单；仅标签点击调用存储；同步视图按已注册 view 恢复偏好，暂不可用时显示 site 而保留存储值；删除路由处理器的强制 `site` 重置。
- [x] **Step 4: 重跑右栏测试。**

Run: `node --test --test-name-pattern="右栏.*偏好|AI 标签.*恢复|右栏视图" test/skin.test.js`

### Task 3: 恢复刷新中断的对话和动作

**Files:**
- Modify: `plugins/ai-workbench.user.js`
- Test: `test/ai-workbench.test.js`

**Interfaces:**
- Consumes: `conversations` 与 `action-history` 的现有版本 1 本地结构。
- Produces: 从存储加载时 `pending` 轮次变为 `stale`，活跃阶段变为 `cancelled`；`running`/`regenerating` 动作变为 `interrupted`；执行中写动作展示“结果未知，请先检查站点”，且不出现自动重试按钮。

- [x] **Step 1: 添加刷新恢复回归测试。** 预置一条 pending 轮次和一条 running 写动作，挂载工作台；断言轮次显示停止文案和手动重试，动作显示不确定结果且不执行任何 provider。
- [x] **Step 2: 运行目标测试确认状态仍为 pending/running。**

Run: `node --test --test-name-pattern="刷新恢复.*中断|未知结果.*不重放" test/ai-workbench.test.js`

- [x] **Step 3: 只在读取存储时迁移状态。** `loadConversationHistory` 将旧 pending 恢复为 stale 并保存；`loadActionHistory` 将 running/regenerating 恢复为 interrupted、running step 改为 interrupted；不在常规保存路径改写仍运行中的内存状态。保留按 turn ID 找回 ready 计划的逻辑。
- [x] **Step 4: 补充明确状态标签并重跑工作台测试。**

Run: `node --test test/ai-workbench.test.js`

### Task 4: 给签到日历增加保留确认的安全入口

**Files:**
- Modify: `plugins/checkin-calendar.user.js`
- Test: `test/fixes.test.js`

**Interfaces:**
- Consumes: `doCheckin(false)` 与 `api.ui.confirm`。
- Produces: `checkin-calendar:ai-checkin` RPC；未接受确认时返回取消结果，不提交；不调用或导出 `doCheckin(true)`。

- [x] **Step 1: 添加失败测试。** RPC 调用后先显示签到确认；点取消时 mock 不收到 POST；点确定时最多发一次本站 POST。
- [x] **Step 2: 运行目标测试确认 handler 不存在。**

Run: `node --test --test-name-pattern="AI 签到安全入口" test/fixes.test.js`

- [x] **Step 3: 注册 handler。** 在 `checkin-calendar:debug` 附近添加 `api.handle('checkin-calendar:ai-checkin', () => doCheckin())`；不得向参数透传 `skipConfirm`。
- [x] **Step 4: 重跑签到日历回归测试。**

Run: `node --test --test-name-pattern="AI 签到安全入口|签到|checkin" test/fixes.test.js test/batch3.test.js`

### Task 5: 实现经验证的原生写动作

**Files:**
- Create: `plugins/ai-write-actions.user.js`
- Create: `test/ai-write-actions.test.js`
- Modify: `plugins/ai-workbench.user.js`

**Interfaces:**
- Consumes: 动作 ID `site.write-reply`, `site.write-topic`, `site.write-checkin`；参数分别为 `{ body }`、`{ title, body }` 和 `{}`；表单 action 只允许同源 `/reply_edit` 或 `/topic_edit`。
- Produces: 仅 `ai-write-actions` 声明 `write`；回复要求当前 `/topic/:id`、唯一 `_csrf`、`topic_id` 匹配和唯一正文 textarea；新主题要求 `/topic_edit`、唯一 `_csrf`、正整数 `forum_id`、唯一标题和正文控件；写表单外控件在 `requestSubmit()` 前禁用，完成后恢复。

- [x] **Step 1: 添加失败集成测试。** 加载 base、checkin-calendar、ai-write-actions；验证动作目录页过滤、缺 CSRF/目标不符/跨源 action 不调用 `requestSubmit`、未确认和取消不提交、确认后回复只提交一次、额外字段与附件被排除、新主题使用当前 form 的 forum ID、签到调用安全 RPC。
- [x] **Step 2: 运行目标测试并确认插件文件缺失导致失败。**

Run: `node --test test/ai-write-actions.test.js`

- [x] **Step 3: 写最小插件。** 用 `api.ai.registerAction` 登记 `permission: 'write'` 动作；回复/发帖在执行时重新查找并验证当前 form、调用 `api.ui.confirm` 显示目标与完整正文、确认后重新验证目标和 CSRF、禁用非白名单控件并调用 `form.requestSubmit()`；签到通过 `api.request('checkin-calendar:ai-checkin')`。
- [x] **Step 4: 呈现完整内容和未知提交状态。** 工作台计划行对 `permission: write` 使用 `textContent` 渲染 title/body 完整文本；识别 `{ kind: 'cancelled' }` 为取消且不提供失败重试；持久化 `write` 意图；启动发现正在执行的写动作时隐藏重放控件并显示需先检查站点。
- [x] **Step 5: 重跑写动作集成与工作台测试。**

Run: `node --test test/ai-write-actions.test.js test/ai-workbench.test.js`

### Task 6: 对齐自然语言计划器与 Oxygen 分发

**Files:**
- Modify: `plugins/ai-copilot.user.js`, `plugins/ai-workbench.user.js`, `suite/order.js`, `build-suite.mjs`, `suite/suite-center.js`, `README.md`, `test/suite.test.js`
- Generated: `dist/linuxsb-base.user.js`, `dist/linuxsb-suite.user.js`, `dist/linuxsb-lts.user.js`

**Interfaces:**
- Consumes: 新动作目录及刷新恢复行为。
- Produces: 计划器只允许目录中给定动作、禁止页面正文注入动作；操作模式不再宣称只读；Oxygen 含新插件，LTS 无 AI 写插件。

- [x] **Step 1: 添加失败分发测试。** 断言 `ORDER` 在 workbench 前含 `ai-write-actions`、`ORDER_LTS` 不含它；新插件声明 `write` 但无 `net/admin`；Oxygen 包含插件、LTS 不含插件。
- [x] **Step 2: 运行套件目标测试确认缺少插件成员时失败。**

Run: `node --test --test-name-pattern="AI 写动作分发" test/suite.test.js`

- [x] **Step 3: 修改计划器和工作台文案。** 系统提示允许使用动作目录中明示的读写动作；写计划必须单步；帖子内容一律视为不可信上下文；工作台文案说明回复/发帖/签到均需再次确认。
- [x] **Step 4: 登记 Oxygen-only 插件并更新版本说明。** 更新 `ORDER`、`SUITE_VERSION` 和 suite center 版本、README 插件权限和版本表；把新行为相应版本号对齐；不要将插件加入 `ORDER_LTS`。
- [x] **Step 5: 构建并运行分发测试。**

Run: `npm run build`

Run: `node --test --test-name-pattern="AI 写动作分发|插件版本" test/suite.test.js`

### Task 7: 完整验证与差异复核

**Files:**
- Modify: 本计划文件记录结果。

- [x] **Step 1: 跑完整测试、构建与产物校验。**

Run: `npm test`

Run: `npm run build`

Run: `npm run verify:dist`

Run: `git diff --check`

- [x] **Step 2: 逐项复核验收边界。** 确认没有动作自动重放；刷新后标签/会话/计划恢复；不确定写操作不给重试；所有写动作有二次确认；表单提交限制为同源和白名单；LTS 不含写动作。

## 执行结果

- 刷新恢复、右栏偏好保存、计划预览和不自动重放已完成。
- 回复、新主题、签到通过独立 ai-write-actions 插件提供；写动作计划单步隔离，执行前二次确认。
- M10.1 已完成：站点 JSON `ok` 回执分类为成功/业务失败/未知；未知写结果只保留约 10 分钟的一次性内存凭据，可通过固定只读 RPC 检查，不会重发 POST，也不会把原始响应、CSRF 或正文写入历史。
- `ai-write-actions` 覆盖回复、发帖、签到、点赞、收藏和投币的结果核验；工作台对明确失败停止后续步骤，对未知或已提交状态仅显示一次“检查站点结果”。
- Oxygen 1.0.128 收录 24 个模块；LTS 1.0.128 不含 AI 写动作。基座 0.1.48，ai-write-actions 0.1.3。
- 验证：`npm test` 631/631 通过；`npm run build`、`npm run verify:dist` 和 `git diff --check` 均通过。
