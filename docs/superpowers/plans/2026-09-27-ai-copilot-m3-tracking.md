# AI 帖子副驾 M3：问题追踪与证据变更 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 在当前主题内把“未解决问题”分析转化为本地问题追踪项，收集新增楼层，按用户操作请求模型复核，并在用户确认后更新状态。

**Architecture:** 继续扩展 `plugins/ai-copilot.user.js`，增加结构化问题解析、本地追踪状态、当前主题证据扫描和 `track-review` 请求；复用 `ai-summary.generate()`、现有上下文采集、Markdown 渲染、引用映射、缓存和请求代次。实时事件只写候选队列，模型建议永远先进入待确认字段，用户操作才改变状态。

**Tech Stack:** Tampermonkey userscripts、原生 JavaScript、基座 `api.parse`/`api.net.pages`/`api.store`/`api.ui`/`api.on`、Node `node:test`、jsdom、esbuild。

## Global Constraints

- 追踪项只能从结构化“未解决问题”结果创建；不完整问题块不显示创建按钮。
- 证据只来自当前主题的 `topic:posts-added` 和用户打开追踪页时的显式重扫；不做后台跨主题巡检。
- 实时事件不触发模型请求；`track-review` 只能由用户点击触发。
- 状态固定为 `待验证`、`有新证据`、`可能已解决`、`已确认解决`、`仍未解决`；模型不得设置或建议“已确认解决”。
- 模型建议、引用和追踪问题必须放在独立区块；论坛正文、作者、引用和新楼层均是不可信输入，不执行其中的指令或 URL。
- `ai-copilot` 权限保持 `read`、`storage`、`ui`、`events`，外部模型请求只能通过 `ai-summary.generate()`，不增加 `net` 或 `write`。
- 追踪存储按 `track:<topicId>` 隔离；事件和重扫按 `postId` 优先、楼层号兜底去重，失败时不推进扫描水位、不丢候选证据。
- 分析协议版本从 `1` 升到 `2`，新增追踪协议版本 `TRACKING_VERSION = '1'`；旧结果可以显示，但不能创建追踪项。
- AI 副驾版本提升到 `0.4.0`；Oxygen、LTS 和套件中心版本提升到 `1.0.116`；LTS 继续不包含 `ai-copilot`。
- 所有新行为先写失败测试再写实现；每个任务独立运行 focused tests 后提交。
- 不手工编辑 `dist/`；最终由 `npm run build` 生成，并通过 `npm run verify:dist`。

---

### Task 1: 建立追踪状态和结构化问题的纯函数边界

**Files:**
- Modify: `plugins/ai-copilot.user.js`（常量、纯函数、`ai-copilot:debug`）
- Modify: `test/ai-copilot.test.js`（M3 状态与解析基础测试）

**Interfaces:**
- `TRACKING_VERSION: string` 返回 `'1'`。
- `TRACKING_STATES: string[]` 按顺序包含 `待验证`、`有新证据`、`可能已解决`、`已确认解决`、`仍未解决`。
- `REVIEW_STATES: string[]` 只包含模型可建议的 `待验证`、`有新证据`、`可能已解决`、`仍未解决`。
- `trackingKey(topicId): string` 返回 `track:<topicId>`。
- `loadTrackingState(topicId): TrackingState` 对缺失、旧版本或损坏数据返回可保存的空状态。
- `saveTrackingState(topicId, state): TrackingState` 规范化状态、裁剪固定上限并回读存储值。
- `stableIssueId(question, floors): string` 对相同问题和排序后的基线楼层产生相同 ID。
- `parseUnresolvedIssues(text, citations): IssueSeed[]` 只接受固定问题块，返回 `{ id, title, question, floors, excerpt }`；缺问题文本或无已知本地楼层的块被忽略。
- `createTrackingIssue(topicId, seed, source): TrackingItem` 幂等创建初始状态为“待验证”的追踪项。

- [ ] **Step 1: 写状态失败测试**

在 `test/ai-copilot.test.js` 增加：

```js
test('M3 状态：缺失存储返回空集合，保存后按主题隔离', async () => {
  const ctx = makeSite(topicHtml, 'https://linux.sb/topic/1')
  const dbg = await load(ctx)
  assert.deepEqual(dbg.trackingState(1).items, [])
  const saved = dbg.createTrackingIssue(1, {
    title: '缓存问题',
    question: '缓存是否会过期？',
    floors: [12],
    excerpt: '依据 [#12]',
  }, { fingerprint: 'f1', analysisVersion: '2' })
  assert.equal(saved.status, '待验证')
  assert.equal(dbg.trackingState(1).items.length, 1)
  assert.deepEqual(dbg.trackingState(2).items, [])
})

test('M3 状态：相同问题和基线楼层幂等，不重复建立追踪项', async () => {
  const ctx = makeSite(topicHtml, 'https://linux.sb/topic/1')
  const dbg = await load(ctx)
  const seed = { title: '问题', question: '同一个问题', floors: [12, 18], excerpt: '依据' }
  const a = dbg.createTrackingIssue(1, seed, { fingerprint: 'f1', analysisVersion: '2' })
  const b = dbg.createTrackingIssue(1, seed, { fingerprint: 'f2', analysisVersion: '2' })
  assert.equal(a.id, b.id)
  assert.equal(dbg.trackingState(1).items.length, 1)
})
```

- [ ] **Step 2: 运行失败测试**

运行 `node --test --test-name-pattern="M3 状态" test/ai-copilot.test.js`。

预期失败原因是 `trackingState` 和 `createTrackingIssue` 尚未暴露，不能用测试错误替代功能缺失。

- [ ] **Step 3: 实现最小状态边界**

在插件中加入状态常量和以下规范化规则：

```js
function emptyTrackingState(topicId) {
  return { version: TRACKING_VERSION, topicId, scan: { seenKeys: [], lastFloor: 0, ts: 0 }, items: [] }
}

function trackingKey(topicId) {
  return `track:${topicId}`
}
```

`loadTrackingState()` 只保留合法状态、对象字段和数组字段；`saveTrackingState()` 对 `seenKeys`、每项的 `evidence` 和 `pendingEvidence` 去重，保留最多 2000 个主题已见键、50 个追踪项和每项 100 条证据。`createTrackingIssue()` 把 `floors` 映射成 `source.floors` 与 `evidence` 基线，并在已有相同 ID 时直接返回已有项。

- [ ] **Step 4: 写问题块解析失败测试**

增加固定格式和不完整格式断言：

```js
test('M3 解析：只接受有问题文本和本地楼层的固定问题块', async () => {
  const ctx = makeSite(topicHtml, 'https://linux.sb/topic/1')
  const dbg = await load(ctx)
  const citations = [{ floor: 12, postId: 12, excerpt: '已知证据', known: true }]
  const out = dbg.parseUnresolvedIssues(
    '## 未解决问题\n### 问题 1：缓存\n- 问题：缓存是否会过期？\n- 相关楼层：[#12]\n- 当前已知：有缓存\n- 缺少信息：过期策略\n' +
      '### 问题 2：无引用\n- 问题：没有本地依据\n- 相关楼层：[#999]\n',
    citations,
  )
  assert.equal(out.length, 1)
  assert.equal(out[0].question, '缓存是否会过期？')
  assert.deepEqual(out[0].floors, [12])
})
```

- [ ] **Step 5: 实现并验证解析边界**

实现 `parseUnresolvedIssues()` 只匹配 `### 问题 N：` 块，读取 `- 问题：` 与 `- 相关楼层：`，通过传入的本地引用表过滤未知楼层；问题块中含有 URL 或模型指令时只作为文本，不产生 DOM 或请求动作。运行：

```text
node --test --test-name-pattern="M3 解析" test/ai-copilot.test.js
```

预期该 focused suite 全部通过。

- [ ] **Step 6: 暴露调试接口并提交**

在 `ai-copilot:debug` 返回 `trackingState`、`createTrackingIssue`、`parseUnresolvedIssues`、`trackingVersion`，提交：

```text
git add plugins/ai-copilot.user.js test/ai-copilot.test.js
git commit -m "feat: add copilot tracking state"
```

### Task 2: 固定“未解决问题”协议并接入创建入口

**Files:**
- Modify: `plugins/ai-copilot.user.js`（分析预设、请求元数据、结果动作）
- Modify: `test/ai-copilot.test.js`（协议、缓存和创建 UI）

**Interfaces:**
- `ANALYSIS_VERSION` 改为 `'2'`。
- `ANALYZE_PRESETS['未解决问题'].format` 输出结论、问题块和无法判断字段。
- `buildRequest('analyze', context, { preset: '未解决问题' })` 的 `meta.analysisVersion` 为 `'2'`，且 fingerprint 包含版本。
- 分析记录 `meta.analysisFingerprint` 保存请求 fingerprint，使追踪项能记录来源。
- `renderIssueActions(host, record)` 在结构化结果下生成 `data-track-issue-id` 操作并调用 `createTrackingIssue()`。

- [ ] **Step 1: 先更新协议测试并确认失败**

把现有 M2 分析断言的协议版本期望从 `1` 改为 `2`，并增加：

```js
test('M3 协议：未解决问题输出可追踪字段并带分析版本', async () => {
  const ctx = makeSite(topicHtml, 'https://linux.sb/topic/1')
  const dbg = await load(ctx)
  const req = dbg.buildRequest('analyze', await dbg.collectContext({}), { preset: '未解决问题' })
  assert.equal(req.meta.analysisVersion, '2')
  assert.match(req.system, /## 未解决问题/)
  assert.match(req.system, /相关楼层|当前已知|缺少信息/)
  assert.match(req.fingerprint, /.+/)
})
```

运行 `node --test --test-name-pattern="M3 协议|M2 提示词|M2 缓存" test/ai-copilot.test.js`，预期因版本和 format 尚未更新而失败。

- [ ] **Step 2: 实现固定提示词和 fingerprint 版本**

给“未解决问题”加入以下 format，并把 `ANALYSIS_VERSION` 改为 `'2'`：

```text
## 结论
## 未解决问题
### 问题 1：<简短名称>
- 问题：<完整问题>
- 相关楼层：[#N]
- 当前已知：
- 缺少信息：
## 无法判断
```

`buildRequest()` 将 `analysisVersion` 放入分析 fingerprint；所有分析记录增加 `analysisFingerprint: request.fingerprint`。旧缓存因 fingerprint 改变而不会复用，但 `showResult()` 仍能渲染旧原文。

- [ ] **Step 3: 写创建按钮失败测试**

新增 UI 测试：

```js
test('M3 UI：结构化未解决问题结果显示开始追踪并写入本地状态', async () => {
  const ctx = makeSite(topicHtml, 'https://linux.sb/topic/1', {
    _llmReply: { choices: [{ message: { content:
      '## 未解决问题\n### 问题 1：缓存\n- 问题：缓存是否会过期？\n- 相关楼层：[#12]\n- 当前已知：有缓存\n- 缺少信息：过期策略',
    } }] },
  })
  await load(ctx)
  ctx.w.document.querySelector('.lsb-ai-copilot-top').click()
  const panel = ctx.w.document.querySelector('.lsb-copilot-panel')
  panel.querySelector('[data-mode="analyze"]').click()
  panel.querySelector('[data-preset="未解决问题"]').click()
  assert.ok(await until(() => panel.querySelector('[data-track-issue-id]')))
  panel.querySelector('[data-track-issue-id]').click()
  const dbg = await ctx.w.LSB.bus.request('ai-copilot:debug')
  assert.equal(dbg.trackingState(1).items.length, 1)
})
```

- [ ] **Step 4: 实现结果解析和幂等入口**

在 `showResult()` 完成 Markdown 渲染后，仅当 `record.meta.mode === 'analyze'` 且 `record.meta.analysisKind === '未解决问题'` 时调用 `renderIssueActions()`；按钮使用 DOM 创建和 `textContent`，不把模型 Markdown 拼入 HTML。点击后调用 `createTrackingIssue(api.page.id, seed, { analysisVersion, fingerprint, citations })`，成功时把按钮替换为“已在追踪”并显示 toast。

- [ ] **Step 5: 运行 focused suite 并提交**

运行：

```text
node --test --test-name-pattern="M3 协议|M3 UI|M2 提示词|M2 缓存" test/ai-copilot.test.js
```

预期通过后提交：

```text
git add plugins/ai-copilot.user.js test/ai-copilot.test.js
git commit -m "feat: make unresolved issues trackable"
```

### Task 3: 接入实时楼层和显式主题重扫

**Files:**
- Modify: `plugins/ai-copilot.user.js`（证据合并、路由和事件）
- Modify: `test/ai-copilot.test.js`（新增楼层、分页重扫和失败保留）

**Interfaces:**
- `mergeTrackingEvidence(topicId, posts): TrackingState` 合并当前主题的新楼层并给每个追踪项填入 `pendingEvidence`。
- `scanTrackingContext(topicId): Promise<{ context, state, added }>` 使用 `collectContext({ fetchAll: true })` 和当前 `maxPages`，只有采集成功才保存 `scan`。
- `pendingTracking(topicId): TrackingItem[]` 返回有候选证据的追踪项。

- [ ] **Step 1: 写事件和重扫失败测试**

新增测试：

```js
test('M3 证据：实时楼层和重扫结果合并去重，只进入候选队列', async () => {
  const ctx = makeSite(topicHtml, 'https://linux.sb/topic/1')
  const dbg = await load(ctx)
  dbg.createTrackingIssue(1, { title: '问题', question: '问题文本', floors: [12], excerpt: '依据' }, { fingerprint: 'f', analysisVersion: '2' })
  const post = { postId: 9001, floor: 51, authorName: '新用户', content: '新增证据', ts: 1787000000 }
  ctx.w.LSB.bus.emit('topic:posts-added', [post], { source: 'test', raw: true })
  ctx.w.LSB.bus.emit('topic:posts-added', [post], { source: 'test', raw: true })
  const after = dbg.trackingState(1).items[0]
  assert.deepEqual(after.pendingEvidence.map((p) => p.floor), [51])
  assert.equal(after.status, '有新证据')
})

test('M3 证据：重扫失败不推进水位也不清空候选', async () => {
  const ctx = makeSite(topicHtml, 'https://linux.sb/topic/1')
  const dbg = await load(ctx)
  dbg.createTrackingIssue(1, { title: '问题', question: '问题文本', floors: [12], excerpt: '依据' }, { fingerprint: 'f', analysisVersion: '2' })
  ctx.w.LSB.bus.emit('topic:posts-added', [{ postId: 9002, floor: 52, authorName: '新用户', content: '候选', ts: 1 }], { source: 'test', raw: true })
  const before = dbg.trackingState(1).scan.lastFloor
  ctx.failTopicPages = true
  await assert.rejects(() => dbg.scanTrackingContext(1))
  assert.equal(dbg.trackingState(1).scan.lastFloor, before)
  assert.equal(dbg.trackingState(1).items[0].pendingEvidence.length, 1)
})
```

测试夹具的 `fetch` stub 增加 `failTopicPages` 分支，只让 linux.sb 分页请求失败，不能影响模型请求。

- [ ] **Step 2: 运行失败测试**

运行 `node --test --test-name-pattern="M3 证据" test/ai-copilot.test.js`，确认失败来自尚未实现的合并和扫描接口。

- [ ] **Step 3: 实现稳定键和候选队列**

复用现有 `normalizePost()` 与 `postKey()`；`mergeTrackingEvidence()` 先更新主题 `scan.seenKeys`，再把新楼层追加到每个追踪项的 `pendingEvidence`。创建时已经存在于基线证据的楼层不得再次进入候选。每次合并都把追踪项状态设为“有新证据”，但如果原状态是“已确认解决”，只增加候选并保留状态。

- [ ] **Step 4: 实现显式重扫**

`scanTrackingContext()` 调用 `collectContext({ fetchAll: true, maxPages: cfg.maxPages })`；比较 `context.posts` 与保存的 `seenKeys`，调用 `mergeTrackingEvidence()` 后再把 `scan.lastFloor` 和 `scan.ts` 写入存储。任何 `collectContext()` 异常都在写入前抛出，确保水位和候选保持原样。

- [ ] **Step 5: 接入事件和路由**

将现有 `topic:posts-added` 处理器从只更新 digest 扩展为同时调用 `mergeTrackingEvidence()`；路由切换调用 `syncTrackingRoute()` 初始化当前主题水位，不在非 topic 页面扫描。把扫描接口加入 debug 返回值。

- [ ] **Step 6: 验证并提交**

运行：

```text
node --test --test-name-pattern="M3 证据|新回复" test/ai-copilot.test.js
```

确认原有“新回复”用例和 M3 证据用例同时通过后提交：

```text
git add plugins/ai-copilot.user.js test/ai-copilot.test.js
git commit -m "feat: track new copilot evidence"
```

### Task 4: 增加 `track-review` 提示词、解析和确认操作

**Files:**
- Modify: `plugins/ai-copilot.user.js`（请求构造、运行、建议解析和本地确认）
- Modify: `test/ai-copilot.test.js`（请求、缓存、建议和错误测试）

**Interfaces:**
- `buildRequest('track-review', context, { trackingItem }): Request` 返回独立 `<tracked-evidence>`、`<new-evidence>` 区块，`meta.trackingVersion === '1'`。
- `parseTrackingSuggestion(text, posts, trackingItem): Suggestion` 返回 `{ valid, status, rationale, citations, raw }`，非法状态、未知引用或问题 ID 不匹配时 `valid === false`。
- `reviewTrackingIssue(topicId, issueId, options): Promise<Record>` 只保存待确认 `suggestion`，不改变 `status`。
- `acceptTrackingSuggestion(topicId, issueId): TrackingItem` 只接受 `REVIEW_STATES`，把候选转为已处理证据并更新状态。
- `dismissTrackingSuggestion(topicId, issueId): TrackingItem` 清除建议但保留候选证据和原状态。
- `confirmTrackingIssue(topicId, issueId): TrackingItem` 只由用户调用，把状态写为“已确认解决”。

- [ ] **Step 1: 写追踪请求和解析失败测试**

增加：

```js
test('M3 复核：请求隔离追踪问题和新证据，禁止模型设置已确认解决', async () => {
  const ctx = makeSite(topicHtml, 'https://linux.sb/topic/1')
  const dbg = await load(ctx)
  const issue = dbg.createTrackingIssue(1, { title: '缓存', question: '缓存是否会过期？', floors: [12], excerpt: '依据' }, { fingerprint: 'f', analysisVersion: '2' })
  ctx.w.LSB.bus.emit('topic:posts-added', [{ postId: 9001, floor: 51, authorName: '新用户', content: '缓存已清理', ts: 1 }], { source: 'test', raw: true })
  const req = dbg.buildRequest('track-review', await dbg.collectContext({}), { trackingItem: issue })
  assert.match(req.user, /<tracked-evidence>/)
  assert.match(req.user, /<new-evidence>/)
  assert.match(req.system, /已确认解决.*用户|不得.*已确认解决/)
  assert.equal(req.meta.trackingVersion, '1')
})

test('M3 复核：合法建议待确认，接受后才更新状态；非法建议不提供接受动作', async () => {
  const ctx = makeSite(topicHtml, 'https://linux.sb/topic/1', {
    _llmReply: { choices: [{ message: { content: '## 追踪复核\n- 状态建议：可能已解决\n- 判断依据：新回复说明已清理 [#51]\n- 新增证据：[#51]\n- 仍需确认：复现条件' } }] },
  })
  const dbg = await load(ctx)
  const issue = dbg.createTrackingIssue(1, { title: '缓存', question: '缓存是否会过期？', floors: [12], excerpt: '依据' }, { fingerprint: 'f', analysisVersion: '2' })
  ctx.w.LSB.bus.emit('topic:posts-added', [{ postId: 9001, floor: 51, authorName: '新用户', content: '缓存已清理', ts: 1 }], { source: 'test', raw: true })
  const record = await dbg.reviewTrackingIssue(1, issue.id)
  assert.equal(record.suggestion.status, '可能已解决')
  assert.equal(dbg.trackingState(1).items[0].status, '有新证据')
  dbg.acceptTrackingSuggestion(1, issue.id)
  assert.equal(dbg.trackingState(1).items[0].status, '可能已解决')
  const invalid = dbg.parseTrackingSuggestion('- 状态建议：已确认解决\n- 新增证据：[#51]', [], issue)
  assert.equal(invalid.valid, false)
})
```

- [ ] **Step 2: 运行失败测试**

运行 `node --test --test-name-pattern="M3 复核" test/ai-copilot.test.js`，确认失败来自未识别 `track-review` 和缺失确认操作。

- [ ] **Step 3: 实现请求和解析器**

把 `buildRequest()` 的合法模式列表扩展为 `track-review`，系统提示写明四个可建议状态和用户专属“已确认解决”规则；用户内容使用：

```text
<tracking-task>问题文本与当前状态</tracking-task>
<tracked-evidence>创建时和已确认楼层</tracked-evidence>
<new-evidence>待复核楼层</new-evidence>
```

加入 `TRACKING_VERSION`、问题 ID、候选内容和模型名到 fingerprint。`parseTrackingSuggestion()` 只从固定字段读取状态，使用现有 `citationRecords()` 映射引用，引用不在追踪上下文时标记 `known: false` 并令 `valid` 为 false。

- [ ] **Step 4: 实现运行与本地确认**

`run('track-review')` 要求追踪项存在且有 `pendingEvidence`，请求成功后把解析结果写入 `suggestion`；它不得调用接受或状态更新函数。`acceptTrackingSuggestion()` 校验 `suggestion.valid` 和 `REVIEW_STATES`，把 pending 转入 `evidence`、写入建议状态并清除 suggestion；`dismissTrackingSuggestion()` 只清除 suggestion；`confirmTrackingIssue()` 清空 pending 后写入“已确认解决”并保留已有证据。

- [ ] **Step 5: 验证缓存与失败保留**

增加同一候选指纹只调用一次模型、`force: true` 再调用一次、模型返回空文本或非法建议时 pending 仍在的断言。运行：

```text
node --test --test-name-pattern="M3 复核|请求：相同指纹|错误面板" test/ai-copilot.test.js
```

- [ ] **Step 6: 暴露 debug 并提交**

在 debug 返回 `reviewTrackingIssue`、`parseTrackingSuggestion`、`acceptTrackingSuggestion`、`dismissTrackingSuggestion`、`confirmTrackingIssue`、`trackingStates`。提交：

```text
git add plugins/ai-copilot.user.js test/ai-copilot.test.js
git commit -m "feat: add copilot evidence review"
```

### Task 5: 完成问题追踪页、生命周期和硬化回归

**Files:**
- Modify: `plugins/ai-copilot.user.js`（Tab、列表、按钮、样式）
- Modify: `test/ai-copilot.test.js`（页面交互）
- Modify: `test/hardening.test.js`（停用清理）

**Interfaces:**
- 新增 `data-mode="track"`，点击后渲染 `renderTrack(body)`，显式调用一次 `scanTrackingContext()`，不自动调用模型。
- 每个追踪项显示 `data-track-card`、状态、基线引用、候选数量；有候选时显示 `data-track-review`。
- 建议显示 `data-track-accept`、`data-track-dismiss`；所有项显示 `data-track-confirm`，点击前使用 `api.ui.confirm()`。
- `onDispose()` 必须清除重扫等待状态、面板节点、所有追踪按钮引用和在途 review 的 UI 写入。

- [ ] **Step 1: 写 UI 失败测试**

新增：

```js
test('M3 UI：问题追踪页显示状态、复核和确认按钮', async () => {
  const ctx = makeSite(topicHtml, 'https://linux.sb/topic/1', {
    _llmReply: { choices: [{ message: { content: '## 追踪复核\n- 状态建议：仍未解决\n- 判断依据：仍缺少复现 [#12]\n- 新增证据：[#12]\n- 仍需确认：复现' } }] },
  })
  const dbg = await load(ctx)
  const issue = dbg.createTrackingIssue(1, { title: '缓存', question: '缓存是否会过期？', floors: [12], excerpt: '依据' }, { fingerprint: 'f', analysisVersion: '2' })
  ctx.w.LSB.bus.emit('topic:posts-added', [{ postId: 9001, floor: 51, authorName: '新用户', content: '仍未复现', ts: 1 }], { source: 'test', raw: true })
  ctx.w.document.querySelector('.lsb-ai-copilot-top').click()
  const panel = ctx.w.document.querySelector('.lsb-copilot-panel')
  panel.querySelector('[data-mode="track"]').click()
  assert.ok(await until(() => panel.querySelector('[data-track-card]')))
  assert.match(panel.textContent, /待验证|有新证据/)
  panel.querySelector('[data-track-review]').click()
  assert.ok(await until(() => panel.querySelector('[data-track-accept]')))
  assert.ok(panel.querySelector('[data-track-dismiss]'))
})
```

- [ ] **Step 2: 运行失败测试**

运行 `node --test --test-name-pattern="M3 UI" test/ai-copilot.test.js`，确认失败来自缺少 `track` Tab 和追踪卡片。

- [ ] **Step 3: 实现追踪 Tab 和扫描状态**

在现有模式 Tab 中加入“问题追踪”；`renderTrack()` 先渲染已保存列表，再异步扫描并重新渲染。扫描错误只显示错误文本和重试按钮，不清空旧列表。卡片用 `textContent` 写问题、作者和摘要；引用复用 `renderCitations()`。

- [ ] **Step 4: 实现建议动作**

点击卡片的 `data-track-review` 后，在该卡片内显示等待状态并调用 `reviewTrackingIssue(topicId, issueId)`；成功后在同一卡片显示建议状态、理由、引用、`data-track-accept` 和 `data-track-dismiss`。接受/驳回后只重绘当前卡片，确认按钮必须先等待 `api.ui.confirm('确认把这个问题标为已确认解决？')`。追踪复核不复用普通结果的 `runAndShow()`，避免把接受/驳回动作丢到通用结果面板。

- [ ] **Step 5: 加入路由与停用清理回归**

补充 `route:changed` 后旧主题扫描完成不得更新新主题卡片的测试；在 `test/hardening.test.js` 增加停用时正在重扫或复核的用例，断言面板、mask、等待计时器和在途完成回调都不再出现。不要删除 `track:<topicId>` 本地存储。

- [ ] **Step 6: 验证并提交**

运行：

```text
node --test --test-name-pattern="M3 UI|路由|停用清理：AI 副驾" test/ai-copilot.test.js test/hardening.test.js
```

focused suite 全部通过后提交：

```text
git add plugins/ai-copilot.user.js test/ai-copilot.test.js test/hardening.test.js
git commit -m "feat: add copilot issue tracking UI"
```

### Task 6: 更新版本、文档、套件产物并完成全量验证

**Files:**
- Modify: `plugins/ai-copilot.user.js`（`@version` 和 manifest 版本 `0.4.0`）
- Modify: `build-suite.mjs`（`SUITE_VERSION = '1.0.116'`）
- Modify: `suite/suite-center.js`（manifest 版本 `1.0.116`）
- Modify: `test/suite.test.js`（副驾版本、套件版本和协议版本断言）
- Modify: `README.md`（插件能力、问题追踪和版本说明）
- Modify: `docs/CONVENTIONS.md`（正式版本号）
- Modify: `docs/功能征集-rc-ga.md`、`docs/已知问题-rc.md`、`docs/测试招募-氢氧-beta.md`（同步 Oxygen/LTS 版本与发布链接）
- Generated: `dist/linuxsb-base.user.js`, `dist/linuxsb-suite.user.js`, `dist/linuxsb-lts.user.js`

**Interfaces:**
- Oxygen 继续在 `ORDER` 中把 `ai-copilot` 放在 `ai-summary` 后；`ORDER_LTS` 不加入副驾。
- `npm run verify:dist` 能确认 `ai-copilot` 的当前源码正文进入 Oxygen、未进入 LTS，且版本为 `0.4.0`。

- [ ] **Step 1: 先更新版本断言并确认失败**

在 `test/suite.test.js` 把 AI 副驾期望改为 `0.4.0`、Oxygen/LTS 期望改为 `1.0.116`，增加 `ANALYSIS_VERSION` 为 `2` 的源码断言；运行 `node --test test/suite.test.js`，预期因源码和 dist 尚未更新而失败。

- [ ] **Step 2: 更新源码版本和公开文档**

同步修改插件头部/manifest、套件构建版本、套件中心 manifest、README 的插件描述和版本说明，以及四份版本文档。README 新描述必须明确：问题追踪只在当前主题内工作，模型只给建议，用户确认后才改变状态，不自动巡检或回复。

- [ ] **Step 3: 生成产物**

运行：

```text
npm run build
```

不得直接编辑 `dist/`；构建输出应包含 Hydrogen `0.1.41`、Oxygen/LTS `1.0.116`、21 个模块，LTS 不包含 `ai-copilot`。

- [ ] **Step 4: 运行全量门禁**

依次运行：

```text
npm test
npm run verify:dist
git diff --check
```

预期 `npm test` 全部通过，`verify:dist` 报告当前源码与 Oxygen 产物一致且 LTS 不含副驾，`git diff --check` 无输出。

- [ ] **Step 5: 检查最终树并提交**

运行：

```text
git status --short --branch
git log -6 --oneline --decorate
```

确认只有计划中列出的源文件、文档和构建产物变化后提交：

```text
git add plugins/ai-copilot.user.js build-suite.mjs suite/suite-center.js test/suite.test.js README.md docs dist
git commit -m "feat: ship AI copilot M3 issue tracking"
```

最终再运行 `npm run verify:dist`，把测试数量、构建版本和提交哈希记录在交付说明中。
