# AI 工作台站内互动写操作 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [x]`) syntax for tracking.

**Goal:** 在独立写权限插件中增加安全的主题/回帖点赞、收藏和投币操作。

**Architecture:** 基座解析器对互动状态使用 `true/false/unknown`，提供同源页面状态与可用档位；`ai-copilot` 只把用户手动选中的本地目标转换成不含实体 ID 的短期目标引用；`ai-write-actions` 校验目标、状态和参数，完成第二次确认后只发送一次本站动作请求。工作台让用户在确认卡中手动选定回帖目标及未指定的投币档位。

**Tech Stack:** JavaScript、`src/ai-actions.js` 动态 schema 校验、基座 `api.actions.likeCoin` / `toggleFavorite`、`api.net.doc`、Node.js `node:test`、JSDOM。

## Global Constraints

- 用户需要明确要求执行写动作。分析、起草、建议或引用站点正文中的操作语句都不能触发写入。
- 每个写计划仅包含一个目标和一个写动作。多目标操作需要逐个生成计划并逐个确认；首版不提供批量写入。
- 主题目标限当前打开主题，或用户从本地已显示的候选中手动选定的主题。候选可来自站内搜索以及用户明确启用的个人数据源。模型不能自行创造主题 ID。
- 模型可以根据已读内容推荐楼层，但必须由用户在确认卡中逐项选定。楼层 ID 由本地楼层映射解析，模型输出的任意回帖 ID 不可直接用于写请求。
- 投币金额只能取目标页面给出的有效档位。用户未指定金额时，必须由用户在确认卡选择；模型不能自行替用户挑选金额。
- 超时、页面刷新或响应无法证明成功时标记为结果未知，不自动重试。
- `ai-write-actions` 保持独立 `write` 权限；不为本站互动新增站外 `net` 权限，不把写权限授予只读检索插件。
- 工作区已有未提交改动和已修改的发行产物。只编辑本计划列出的源文件与测试；构建前检查现有 dist 差异，不重置或清理它们。

---

## File Structure

- `src/site.js`、`src/core.js`：解析收藏、点赞和投币状态/档位，并经 `api.parse` 暴露。
- `test/site.test.js`、`test/core.test.js`：验证三态状态、档位与 API 暴露。
- `plugins/ai-copilot.user.js`：建立本地目标引用，增强写计划提示和校验，不向模型暴露 topic/post ID。
- `plugins/ai-workbench.user.js`：展示写目标、状态和交互式选择器；排除本功能待确认的目标和金额出现在持久化 action payload。
- `plugins/ai-write-actions.user.js`：新增 `site.write-favorite-state`、`site.write-like-state` 和 `site.write-coin`。
- `test/ai-copilot.test.js`、`test/ai-workbench.test.js`、`test/ai-write-actions.test.js`、`test/net.test.js`：覆盖本地目标、权限、二次确认、重验证和单次提交。
- `scripts/check-dist.mjs`：确认 `ai-write-actions` 不进入 LTS。
- `package.json` 与 `dist/*`：基座新增解析 API 时更新版本并重新构建。

### Task 1: 让站点解析明确表达互动状态

**Files:**
- Modify: `src/site.js`
- Modify: `src/core.js`
- Test: `test/site.test.js`
- Test: `test/core.test.js`

**Interfaces:**
- `parseLikeTargets(doc)` 的 `liked` 只返回 `true`、`false` 或 `null`；缺少/未知属性时不默认成未点赞。
- 新增 `parseTopicFavoriteState(doc)` 返回 `true`（页面明确显示已收藏/取消收藏动作）、`false`（明确可收藏）或 `null`（无法判定）。
- `api.parse.topicFavoriteState` 暴露纯解析器；coin tiers 只保留唯一正整数档位。

- [x] **Step 1: 写三态和档位解析失败测试**

```js
assert.equal(parseLikeTargets(docWithLike('data-like-coin-liked="1"'))[0].liked, true)
assert.equal(parseLikeTargets(docWithLike('data-like-coin-liked="0"'))[0].liked, false)
assert.equal(parseLikeTargets(docWithLike(''))[0].liked, null)
assert.equal(parseTopicFavoriteState(docWithFavorite('取消收藏')), true)
assert.equal(parseTopicFavoriteState(docWithFavorite('收藏')), false)
assert.equal(parseTopicFavoriteState(docWithFavorite('')), null)
```

测试档位接受 `[1, 5, 10]`，移除 `0`、负数、非数字和重复值。

运行：`node --test --test-name-pattern="互动状态使用三态|收藏状态解析|投币档位过滤" test/site.test.js`  
预期：当前 parser 将缺失点赞属性错误地归为 `false`，也没有收藏状态解析器。

- [x] **Step 2: 实现安全状态解析并暴露 API**

在 `src/site.js` 为显式 `data-like-coin-liked` 值区分 true/false/null；实现收藏控件文本/aria-label 的有限白名单判定，未知状态返回 null；归一化档位。通过 `src/core.js` 暴露 `api.parse.topicFavoriteState`。更新 `test/core.test.js` 验证插件拿到的函数纯本地可用，无需增加权限。

- [x] **Step 3: 运行解析器测试并更新基座版本**

运行：`node --test --test-name-pattern="互动状态使用三态|收藏状态解析|投币档位过滤" test/site.test.js test/core.test.js`。基座与本人回帖解析能力合并更新至 `0.1.47`；`ai-write-actions` 要求 `^0.1.47`，以使用互动状态解析 API。

### Task 2: 为用户选择的主题/回帖建立短期目标引用

**Files:**
- Modify: `plugins/ai-copilot.user.js`
- Modify: `plugins/ai-workbench.user.js`
- Test: `test/ai-copilot.test.js`
- Test: `test/ai-workbench.test.js`

**Interfaces:**
- 扩展 `planActions({ command, force, targetScope })`；`targetScope` 只由 workbench 当前手动选择状态构造，形状固定为 `{ researchId: string|null, topicIds: number[], postIds: number[] }`。
- copilot 本地验证 topic IDs 属于当前主题或有效 research session 中候选；reply refs 必须属于已解析/已读页。
- 为每个可选实体生成短期 `targetKey` 并建立仅内存映射 `targetKey -> { type, topicId, postId, page, floor, title, excerpt, state, tiers }`。仅 `{ targetKey, type, title, floor, excerpt, state, tiers }` 可以进模型计划上下文；`excerpt` 只能来自用户已选择/读取的目标，且不超过 500 字；不序列化候选 topic/post ID、用户 ID、CSRF 或 URL。
- 新互动动作的 `args.targetKey` 使用 action schema 动态 `values(context)`，在计划解析、preview 与 execute 时都校验本地目标表。一次 plan 生成的 `targetKey` 映射必须通过内存 scope nonce 在每次重校验时复用；nonce 不持久化。

- [x] **Step 1: 写模型不可自造实体 ID 的失败测试**

构造当前主题、一个用户已选主题候选与一个已读回帖楼层。断言 action prompt 含可用短期 target keys 和已选择回帖的短摘录，但不含候选 topic ID、post ID、UID、href 或 CSRF。模型返回未知 key、未选主题 key 或未读楼层 key 时，`planActions()` 在写请求前拒绝。

```js
const prompt = dbg.buildActionPlanRequest('给选中回帖点赞', dbg.actionContext('给选中回帖点赞', targetScope))
assert.match(prompt.user, /targetKey/)
assert.doesNotMatch(prompt.user, /4321|8102|5372|_csrf|https?:\/\//)
```

运行：`node --test --test-name-pattern="M8 写计划：只接受本地目标引用" test/ai-copilot.test.js`  
预期：目前 action context 没有本地目标表与动态 key。

- [x] **Step 2: 实现短期目标表与计划提示约束**

新增异步 `prepareReactionScope(targetScope)`：只为当前主题或用户明确勾选的主题/回帖读取状态与档位，按需复用当前页面或研究账本；未选择的候选不发请求。它生成每个计划专用 `targetKey` 并将私有实体映射存入内存 Map。`actionContext(command, { targetScopeNonce })` 从同一个 nonce 恢复稳定 key；preview/execute 不能自行生成新 key。`actionPromptPayload()` 只序列化 key、必要标题/楼层和所选回帖最多 500 字摘录，不把候选 topic/post ID、当前用户 ID、CSRF 或 href 放进互动计划请求；既有个人导航计划的 `currentUserId` 行为保持不变。更新 system prompt：新增 like/favorite/coin 仅在用户直接明确要求时可选、单写动作计划约束保持不变、目标只能选本地给定 key、模型不得选择投币数。`planActions()` 返回不可持久化的 scope nonce；刷新后 nonce 无效，旧计划不得执行。

- [x] **Step 3: 从工作台将显式选择传给 copilot**

在研究候选/已读楼层卡增加独立的“作为操作目标”选择状态，不与“读取证据”复用同一个勾选标记。计划调用时只传当前明确勾选的 `researchId` 和本地候选 key；copilot 再次检查该 session、topic 与 page。`ai-workbench` 在执行计划时把内存中的 nonce 传给 `actionContext()`；`saveActionHistory()` 对本互动计划只保存中断/结果状态，不保存实体 ID、目标映射、coin tier 或待执行 args。自然语言用户消息继续按现有对话规则保留。测试未勾选候选不能进入目标目录，选择切换或 session 过期后原 action plan 失效。

- [x] **Step 4: 运行目标引用单元测试**

运行：`node --test --test-force-exit test/ai-copilot.test.js test/ai-workbench.test.js`。预期所有模型可见目标引用都可由本地 registry 解析，任何模型提供的实体 ID 都不被使用。

### Task 3: 注册互动动作并实现确认卡上的人工选择

**Files:**
- Modify: `plugins/ai-write-actions.user.js`
- Modify: `plugins/ai-workbench.user.js`
- Test: `test/ai-write-actions.test.js`
- Test: `test/ai-workbench.test.js`

**Interfaces:**
- `site.write-favorite-state` 参数为 `{ targetKey: string, favorited: boolean }`，只接受 topic 类型目标。
- `site.write-like-state` 参数为 `{ targetKey: string, liked: boolean }`，接受 topic/reply 目标。
- 模型的 `site.write-coin` 计划只包含推荐 `targetKey`，不含 coin 字段；运行时 action args 为 `{ targetKey: string, coin?: number }`，其中 `targetKey` 必须由用户选择器覆盖，`coin` 只能来自原话中的明确有效档位或用户档位选择。
- 执行前的确认卡显示目标标题、主题/回帖类型、楼层、动作、当前状态、期望状态或投币数量。
- 保留现有 `site.write-reply`、`site.write-topic` 和 `site.write-checkin` 的行为与确认流程。

- [x] **Step 1: 写动作注册和人工选择失败测试**

测试当前页动作目录仅在有有效目标时列出互动 action；favorite 不接受 reply、coin 不接受无档位或目标不支持档位。UI 对 AI 推荐楼层显示建议但要求用户主动从确认卡目标 select 选择；用户原话未明确金额时默认未选 coin 档位且“执行计划”禁用，只有用户从站点有效档位选择后才启用。模型输出任何投币金额字段均拒绝。

运行：`node --test --test-name-pattern="AI 写动作：收藏/点赞/投币目录|AI 写动作：确认卡要求选择目标和档位" test/ai-write-actions.test.js test/ai-workbench.test.js`  
预期：当前插件没有互动 action 与相应选择器。

- [x] **Step 2: 注册三类受限 action 并渲染确认信息**

在 `plugins/ai-write-actions.user.js` 注册上述 action ID，全部标记 `permission: 'write'`，使用动态 target key schema 与自定义 coin 档位验证。复用 `confirmWrite()` 的第二次确认机制，但改为针对目标和期望状态/币数的文案。`renderActionPlan()` 对互动 action 渲染可访问的本地 select；模型的 `targetKey` 只作为建议，执行选择器初始为空并要求用户亲自选定。用户选项保存于 `record.userChoices[index]` 内存对象；执行器先以用户选项覆盖模型建议，再重新校验最终 step。coin 选择器只渲染本地 target tiers，金额必须从用户原话明确数字中匹配一档，或由用户手动选择，再写入仅内存请求参数。`planActions()` 拒绝模型输出 coin 字段。成功或未知状态通过现有 `submission`/`failed` 生命周期呈现。

- [x] **Step 3: 验证执行取消、目标过期和选择状态**

测试取消第二次确认无任何 `POST`；执行前若用户选择的目标已过期、跨主题、或 target key 不再存在，标记过期且不发送；没有手动目标选择或有效 coin tier 时动作执行按钮保持 disabled。

运行：`node --test --test-name-pattern="AI 写动作：确认卡要求选择目标和档位|AI 写动作：目标过期" test/ai-write-actions.test.js test/ai-workbench.test.js`

### Task 4: 二次状态校验与本站动作提交

**Files:**
- Modify: `plugins/ai-write-actions.user.js`
- Test: `test/ai-write-actions.test.js`
- Test: `test/net.test.js`

**Interfaces:**
- `readReactionTarget(targetKey, context)` 仅从短期目标表读取解析好的目标；若非当前主题，使用 `api.net.doc(api.routes.topic(topicId, page))` 重新读取同源页，并检查 `parseTopic().id/currentPage`。
- 点赞/收藏基于 `true/false/null` 目标状态；null 必须停止。目标已处于期望状态则返回 `kind: 'completed'` 且不 POST。
- 执行前记录当前目标状态；用户二次确认后再次 GET 并比较 topic/post/floor、当前状态和有效档位。任意变化均停止。
- 只通过 `api.actions.toggleFavorite(topicId)` 和 `api.actions.likeCoin({ type, id, coin })` 发送一次本站写请求。

- [x] **Step 1: 写未知状态、重复切换和状态变化失败测试**

分别测试：unknown 收藏/点赞状态无 POST；已满足期望状态不 POST；取消确认不 POST；确认期间状态变化不 POST；状态稳定时恰好一条 POST。对未登录/缺 CSRF 的动作按基座动作 API 的既有错误处理显示失败，不请求外域。

```js
const result = await ai.execute({ action: 'site.write-like-state', args: { targetKey, liked: true } }, context)
assert.equal(result.kind, 'completed')
assert.equal(posts.length, 0)
```

运行：`node --test --test-name-pattern="AI 互动写入：状态未知|AI 互动写入：状态已满足" test/ai-write-actions.test.js`  
预期：状态前后读取和 no-op 行为尚未实现。

- [x] **Step 2: 实现提交前重读及单次请求**

实现 `readReactionTarget()`，优先复用当前文档中匹配的目标；跨主题目标必须通过固定 route GET 后核对 ID 和页码。确认前保存状态快照；确认后重读并检查快照相同。点赞/收藏仅在当前状态与期望状态相反时调用对应 API；投币只用 confirmation args 中的页面有效 tier 调用 `api.actions.likeCoin()`。任何请求超时/断连均返回“结果未知”并禁止重试，不将 coin tier 写入 API 以外的数据持久化。

- [x] **Step 3: 校验 API endpoint 和请求 payload**

在 `test/net.test.js` 断言收藏 endpoint `/topic_favorite` 只带 `topic_id`，like/coin endpoint `/lsb_like_coin` 只带 `like_coin_type`、`like_coin_id` 和用户确认的 `coin`；未经确认的额外字段不能进入请求。

运行：`node --test --test-name-pattern="Actions.likeCoin / toggleFavorite 端点正确" test/net.test.js`，再运行 `node --test --test-name-pattern="AI 互动写入" test/ai-write-actions.test.js`。

### Task 5: 验证权限、刷新隐私和既有写操作不回归

**Files:**
- Modify: `plugins/ai-copilot.user.js`
- Modify: `plugins/ai-workbench.user.js`
- Test: `test/ai-copilot.test.js`
- Test: `test/ai-workbench.test.js`
- Test: `test/ai-write-actions.test.js`

- [x] **Step 1: 检查短期目标与金额不会持久化**

在测试中创建待执行的互动计划并检查 `localStorage`/`api.store`：自然语言消息可按现有会话规则保留，但新互动计划的目标实体 ID、reply ID、目标映射、coin tier、CSRF、完整 args 和页面正文不得进入 action history、计划缓存或会话记录。重载后显示中断/未知，不自动执行，旧短期 scope nonce 不能恢复；回复/发帖/签到既有历史行为不变。

- [x] **Step 2: 验证刷新和超时不自动重放**

模拟写 POST 已发送但未收到响应后完整刷新；断言启动时没有第二条 POST，状态显示“结果未知，请检查站点”，重新操作必须生成新计划、重读状态并重新确认。两次快速点击同一确认卡只产生至多一次 POST。

- [x] **Step 3: 运行现有写动作和动作计划全套测试**

运行：`node --test --test-force-exit test/ai-write-actions.test.js test/ai-copilot.test.js test/ai-workbench.test.js test/net.test.js`。预期既有回复/发帖/签到二次确认、右栏恢复和读动作计划均通过。

### Task 6: 构建并验证发行边界

**Files:**
- Modify: `scripts/check-dist.mjs`
- Verify: `dist/linuxsb-base.user.js`、`dist/linuxsb-suite.user.js`、`dist/linuxsb-lts.user.js`

- [x] **Step 1: 运行全量测试与完整构建**

运行：`npm test` 和 `npm run build`。在 build 前保存/查看已有 `git diff -- dist/`；检查新的 `0.1.47` 基座与 action 插件在 Oxygen 中，LTS 不新增写插件或 AI 工作台入口。

- [x] **Step 2: 核对权限和发行产物**

运行：`npm run verify:dist`。在 `scripts/check-dist.mjs` 的 LTS 排除列表中加入 `ai-write-actions`，使验证覆盖当前 `ORDER_LTS` 排除事实。检查 `ai-write-actions` 保持 `write` 权限，不新增 `net`/`admin`；只读插件不声明 `write`；确认收藏/like 未知状态与投币未知结果测试通过。

- [x] **Step 3: 审查并隔离提交内容**

使用 `git diff --` 和 `git diff --cached --` 逐一审查源文件、测试与 dist。该工作区中的相同文件已有其它未提交改动；只在可以明确隔离本计划改动时才提交，严禁用整文件 `git add` 把既有内容一并提交。


## 执行记录

- 发布版本：Hydrogen `0.1.47`；Oxygen/LTS `1.0.126`。
- 验证：`npm test` 616/616 通过；`npm run build` 成功；`npm run verify:dist` 成功；`git diff --check` 退出码为 0。
- 安全复核：投币原话包含多个数字时不预选档位；单一明确金额仍需匹配目标页面提供的档位。复核结论为已解决。
- 工作区：保留 `feat/shell-spa-click` 及未提交改动，不提交或合并。互动实现文件与当前其他 AI 工作共享修改，无法安全拆成单独提交。
