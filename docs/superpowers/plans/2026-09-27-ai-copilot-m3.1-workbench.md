# AI 帖子副驾 M3.1 追踪数据工作台 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 在当前主题内为 AI 副驾追踪项加入 v2 数据迁移、归档/恢复、JSON/Markdown/双 CSV 导出、预览式 JSON 合并导入和批量管理，并保持本地人工确认边界。

**Architecture:** 继续扩展 `plugins/ai-copilot.user.js` 的主题级 `track:<topicId>` 存储，不引入全局追踪索引或新插件。把状态迁移、序列化、导入合并和批量变更做成无 DOM 的函数，再由追踪页绑定筛选、选择、导入预览和批量按钮；所有下载使用浏览器 `Blob`，所有导入先生成不可变预览再一次写入。

**Tech Stack:** 原生 JavaScript userscript、LSB plugin API、`Blob`/`File.text()`、JSDOM、Node built-in test runner、现有 `npm run build`/`npm run verify:dist` 构建链。

## Global Constraints

- 追踪、导出和导入范围只限当前主题；不建立跨主题索引。
- 归档项停止接收实时新证据和显式重扫证据；恢复后从恢复时点继续观察，不回补归档期间楼层。
- 批量操作只包含归档、恢复和接受有效模型建议；“已确认解决”必须逐项显式确认。
- 模型只提供建议；接受建议前不改变追踪状态；不自动发帖、编辑、点赞、收藏或通知。
- 数据只保存在本机脚本存储；继续使用 `read`、`storage`、`ui`、`events`，不增加 `net` 或 `write`。
- v2 继续最多 50 个追踪项、每项 100 条证据、2000 个已见帖子键；每项最多 100 条历史记录；JSON 导入最大 5 MB。
- JSON 导入必须校验导出协议、版本、当前主题 ID 和字段类型；预览阶段不得写入本地存储。
- AI 副驾目标版本为 `0.5.0`；Oxygen 从当前 `1.0.116` 提升到下一补丁版本 `1.0.117`；LTS 继续不收录 `ai-copilot`，Hydrogen `0.1.41` 不因本功能单独改动。
- `dist/` 只由构建命令生成，不手工编辑。

---

## File Map

- **Modify:** `plugins/ai-copilot.user.js`
  - v1→v2 追踪状态规范化和迁移
  - 归档/恢复/批量接受建议
  - JSON、Markdown、问题 CSV、证据 CSV 序列化
  - JSON 校验、预览、合并
  - 追踪页筛选、选择、批量工具栏、导入预览和下载绑定
- **Test:** `test/ai-copilot.test.js`
  - 状态迁移、生命周期、序列化、导入合并和追踪页行为
- **Test:** `test/hardening.test.js`
  - 停用、路由变化、异步重扫、导入预览和临时下载资源清理
- **Modify:** `build-suite.mjs`
  - Oxygen 版本从 `1.0.116` 提升到 `1.0.117`
- **Modify:** `plugins/ai-copilot.user.js`
  - userscript `@version` 和 manifest `version` 从 `0.4.0` 提升到 `0.5.0`
- **Generate:** `dist/linuxsb-suite.user.js`, `dist/linuxsb-lts.user.js`, 以及构建链生成的其他 `dist/` 文件

不新增运行时文件；现有大文件按职责在同一文件内分区，避免本次功能引入不相关重构。

## Public Internal Interfaces

实现过程中保持以下 debug 接口，供测试验证纯逻辑和结果；它们不作为用户 API 暴露：

```js
trackingState(topicId = api.page.id)
archiveTrackingItems(topicId, issueIds)
restoreTrackingItems(topicId, issueIds)
acceptTrackingSuggestions(topicId, issueIds)
trackingExport(topicId = api.page.id)
serializeTracking(topicId, format)
previewTrackingImport(topicId, text)
applyTrackingImport(topicId, preview)
```

约定：`serializeTracking` 的 `format` 为 `json`、`markdown`、`issues-csv` 或 `evidence-csv`；`previewTrackingImport` 返回不写入的预览对象；`applyTrackingImport` 只接受同一插件实例生成且 `valid === true` 的预览，并返回 `{ added, updated, evidenceMerged, conflicts, skipped }`。

---

### Task 1: 追踪状态 v2 迁移与归档生命周期

**Files:**
- Modify: `plugins/ai-copilot.user.js:42-45,329-468,585-640,708-780,1735-1755`
- Test: `test/ai-copilot.test.js` 在现有 M3 状态/证据测试之后新增生命周期测试

**Interfaces:**
- Consumes: 现有 `loadTrackingState`、`saveTrackingState`、`mergeTrackingEvidence`、`scanTrackingContext`、`acceptTrackingSuggestion`。
- Produces: `TRACKING_VERSION = '2'`、`TRACKING_MAX_HISTORY = 100`、`archivedAt`/`history` 规范化、`archiveTrackingItems`、`restoreTrackingItems`、`acceptTrackingSuggestions`，以及上述 debug 接口。

- [ ] **Step 1: 写 v1 迁移和归档行为的失败测试**

在 `test/ai-copilot.test.js` 增加以下行为：

```js
test('M3.1 状态：v1 追踪项迁移到 v2 且保留问题、证据和建议', async () => {
  const ctx = makeSite(topicHtml, 'https://linux.sb/topic/1')
  ctx.w.localStorage.setItem('lsb_base:ai-copilot:track:1', JSON.stringify({
    version: '1', topicId: 1,
    scan: { seenKeys: ['id:12'], lastFloor: 12, ts: 10 },
    items: [{ id: 'issue-old', question: '旧问题', status: '有新证据',
      source: { floors: [12], excerpt: '旧依据' },
      evidence: [{ key: 'id:12', postId: 12, floor: 12, excerpt: '旧证据' }],
      pendingEvidence: [], suggestion: null, createdAt: 10, updatedAt: 20 }],
  }))
  const dbg = await load(ctx)
  const state = dbg.trackingState(1)
  assert.equal(dbg.trackingVersion, '2')
  assert.equal(state.version, '2')
  assert.equal(state.items[0].archivedAt, 0)
  assert.deepEqual(state.items[0].evidence.map((row) => row.key), ['id:12'])
})

test('M3.1 生命周期：归档停止收集，恢复后继续收集新证据', async () => {
  const ctx = makeSite(topicHtml, 'https://linux.sb/topic/1')
  const dbg = await load(ctx)
  const issue = dbg.createTrackingIssue(1, { question: '问题', floors: [12], excerpt: '依据' })
  dbg.archiveTrackingItems(1, [issue.id])
  ctx.w.LSB.bus.emit('topic:posts-added', [{ postId: 9001, floor: 51, content: '归档期间证据' }])
  assert.equal(dbg.trackingState(1).items[0].pendingEvidence.length, 0)
  dbg.restoreTrackingItems(1, [issue.id])
  ctx.w.LSB.bus.emit('topic:posts-added', [{ postId: 9002, floor: 52, content: '恢复后证据' }])
  const current = dbg.trackingState(1).items[0]
  assert.deepEqual(current.pendingEvidence.map((row) => row.floor), [52])
  assert.deepEqual(current.history.map((row) => row.type).slice(-2), ['archived', 'restored'])
})

test('M3.1 状态：未知追踪版本不被覆盖并显示重新建立提示', async () => {
  const ctx = makeSite(topicHtml, 'https://linux.sb/topic/1')
  ctx.w.localStorage.setItem('lsb_base:ai-copilot:track:1', JSON.stringify({ version: '99', topicId: 1, items: [{ question: '不要丢失' }] }))
  const dbg = await load(ctx)
  assert.equal(dbg.trackingState(1).items.length, 0)
  ctx.w.document.querySelector('.lsb-ai-copilot-top').click()
  const panel = ctx.w.document.querySelector('.lsb-copilot-panel')
  panel.querySelector('[data-mode="track"]').click()
  assert.ok(await until(() => /重新建立追踪项/.test(panel.textContent)))
  assert.match(ctx.w.localStorage.getItem('lsb_base:ai-copilot:track:1'), /"version":99/)
})
```

- [ ] **Step 2: 运行定向测试确认失败**

Run: `node --test --test-force-exit test/ai-copilot.test.js`

Expected: 现有 M3 测试继续通过，但新增测试因没有 v2 字段、迁移和批量函数而失败。

- [ ] **Step 3: 实现 v2 规范化和有界历史**

在追踪常量处增加 `TRACKING_MAX_HISTORY = 100`，将 `TRACKING_VERSION` 改为 `'2'`。增加以下纯函数并让 `loadTrackingState` 使用它们：

```js
function normalizeTrackingHistory(rows) {
  return (Array.isArray(rows) ? rows : [])
    .filter((row) => row && typeof row === 'object')
    .map((row) => ({
      type: String(row.type || 'unknown').slice(0, 40),
      status: TRACKING_STATES.includes(row.status) ? row.status : '',
      evidenceKeys: Array.isArray(row.evidenceKeys) ? row.evidenceKeys.map(String).filter(Boolean).slice(-TRACKING_MAX_EVIDENCE) : [],
      ts: Math.max(0, asNumber(row.ts, 0)),
    }))
    .slice(-TRACKING_MAX_HISTORY)
}

function trackingEvent(type, item, patch = {}) {
  return { type, status: item?.status || '', evidenceKeys: patch.evidenceKeys || [], ts: Date.now() }
}
```

`normalizeTrackingIssue` 将 `archivedAt` 规范为非负时间戳、`history` 规范为有限数组。v1 记录默认 `archivedAt: 0`，并补一个 `created` 历史事件；未知版本返回带 `unsupportedVersion` 标记的空状态而不覆盖原始值，追踪页显示“追踪数据版本不兼容，请重新建立追踪项”，直到用户重新建立追踪项或导入合法数据。

- [ ] **Step 4: 实现归档、恢复和批量接受建议**

增加三个状态函数：

```js
function archiveTrackingItems(topicId = api.page.id, issueIds = [])
function restoreTrackingItems(topicId = api.page.id, issueIds = [])
function acceptTrackingSuggestions(topicId = api.page.id, issueIds = [])
```

每个函数只处理传入 ID，重新读取状态后一次保存，并把操作追加到对应 `history`。`acceptTrackingSuggestions` 复用单项接受逻辑的证据合并规则，只处理 `suggestion.valid` 且状态在 `REVIEW_STATES` 内的项目，返回 `{ items, skipped }`；它不得生成“已确认解决”。

让 `mergeTrackingEvidence` 和 `scanTrackingContext` 跳过 `archivedAt > 0` 的项目；实时事件仍更新主题去重水位，避免同一帖子反复进入队列。恢复只影响后续事件，不回补归档期间楼层。

- [ ] **Step 5: 暴露 debug 接口并运行定向测试**

在 `api.handle('ai-copilot:debug', ...)` 返回 v2 版本号、三个批量函数和现有单项函数。运行：

```bash
node --test --test-force-exit test/ai-copilot.test.js
```

Expected: v1 迁移、归档停止收集、恢复继续收集和既有 M3 测试全部通过。

- [ ] **Step 6: 提交状态层变更**

```bash
git add plugins/ai-copilot.user.js test/ai-copilot.test.js
git commit -m "feat: add tracking archive lifecycle"
```

### Task 2: 导出序列化器和下载数据层

**Files:**
- Modify: `plugins/ai-copilot.user.js` 在追踪状态函数之后增加纯序列化区，在 `renderTrackingList` 附近绑定下载动作
- Test: `test/ai-copilot.test.js` 增加导出协议、CSV 转义和归档数据覆盖测试

**Interfaces:**
- Consumes: `loadTrackingState`、`normalizeTrackingIssue`、`trackingEvidencePosts`、`api.routes.topic`。
- Produces: `trackingExport`、`serializeTracking(topicId, format)`、`downloadText(name, text, mime)`。

- [ ] **Step 1: 写四种导出格式的失败测试**

新增测试应建立一条活动项和一条已归档项，分别包含基线证据、待复核证据、建议和历史，然后断言：

```js
test('M3.1 导出：JSON、Markdown、问题 CSV 和证据 CSV 包含活动与归档数据', async () => {
  const ctx = makeSite(topicHtml, 'https://linux.sb/topic/1')
  const dbg = await load(ctx)
  const issue = dbg.createTrackingIssue(1, { title: '缓存', question: '缓存会过期吗？', floors: [12], excerpt: '依据' })
  dbg.archiveTrackingItems(1, [issue.id])

  const payload = dbg.trackingExport(1)
  assert.equal(payload.schema, 'lsb-ai-copilot-tracking-export')
  assert.equal(payload.tracking.version, '2')
  assert.equal(JSON.parse(dbg.serializeTracking(1, 'json')).tracking.items.length, 1)
  assert.match(dbg.serializeTracking(1, 'markdown'), /缓存会过期吗？/)
  assert.match(dbg.serializeTracking(1, 'issues-csv'), /^\uFEFF/)
  assert.match(dbg.serializeTracking(1, 'evidence-csv'), /稳定证据键|key|id:12/)
})

test('M3.1 导出：CSV 正确转义引号、逗号和换行，不泄露配置', async () => {
  const ctx = makeSite(topicHtml, 'https://linux.sb/topic/1')
  const dbg = await load(ctx)
  dbg.createTrackingIssue(1, { title: '含,逗号', question: '含"引号\n换行', floors: [12], excerpt: '摘要' })
  const csv = dbg.serializeTracking(1, 'issues-csv')
  assert.match(csv, /"含,逗号"/)
  assert.match(csv, /""引号/)
  assert.doesNotMatch(csv, /apiKey|api\.example\.com/)
})
```

- [ ] **Step 2: 运行定向测试确认失败**

Run: `node --test --test-force-exit test/ai-copilot.test.js`

Expected: 新增测试提示 `trackingExport` 或 `serializeTracking` 未定义。

- [ ] **Step 3: 实现版本化 JSON 载荷**

实现：

```js
function trackingExport(topicId = api.page.id) {
  const state = loadTrackingState(topicId)
  return {
    schema: 'lsb-ai-copilot-tracking-export',
    version: 1,
    exportedAt: Date.now(),
    topic: {
      id: asNumber(topicId, topicId),
      title: String(api.parse.topic(document)?.title || api.snapshot?.topic?.title || ''),
      forumName: String(api.parse.topic(document)?.forumName || api.snapshot?.topic?.forumName || ''),
    },
    tracking: state,
  }
}
```

`serializeTracking(topicId, 'json')` 使用 `JSON.stringify(payload, null, 2)`；不包含 `api.config()`、API key、模型配置或站外网络响应。

- [ ] **Step 4: 实现 Markdown 和双 CSV 序列化**

Markdown 必须先按活动/归档分组，再输出问题、状态、楼层、证据、建议和历史；所有导入或存储文本先经过现有 `esc`/纯文本路径，不将原始 HTML 插入 DOM。

CSV 使用固定列顺序和以下转义函数：

```js
function csvCell(value) {
  return `"${String(value ?? '').replaceAll('"', '""')}"`
}

function csvDocument(headers, rows) {
  return `\uFEFF${[headers, ...rows].map((row) => row.map(csvCell).join(',')).join('\n')}`
}
```

`issues-csv` 每个追踪项一行；`evidence-csv` 每条 `evidence` 和 `pendingEvidence` 一行，并用 `kind` 区分 `initial`、`reviewed`、`new` 等类型。

- [ ] **Step 5: 实现浏览器下载适配器并运行测试**

实现 `downloadText(name, text, mime)`：创建 `Blob`、创建 `<a>`、设置 `download`、触发 `click()`，4 秒后 `URL.revokeObjectURL()`；异常时返回 `false` 并由 UI 显示错误。不要使用 `GM_download` 或新增权限。

运行：

```bash
node --test --test-force-exit test/ai-copilot.test.js
```

Expected: 所有既有测试和导出测试通过。

- [ ] **Step 6: 提交导出数据层**

```bash
git add plugins/ai-copilot.user.js test/ai-copilot.test.js
git commit -m "feat: add tracking export formats"
```

### Task 3: JSON 导入校验、预览与合并

**Files:**
- Modify: `plugins/ai-copilot.user.js` 在导出序列化区之后增加导入校验/合并函数
- Test: `test/ai-copilot.test.js` 增加导入预览、冲突、上限和失败不写入测试

**Interfaces:**
- Consumes: `trackingExport`、`normalizeTrackingIssue`、`dedupeEvidence`、`saveTrackingState`。
- Produces: `previewTrackingImport(topicId, text)`、`applyTrackingImport(topicId, preview)`。

- [ ] **Step 1: 写导入预览和冲突合并的失败测试**

覆盖以下场景：

```js
test('M3.1 导入：预览不写入，确认后合并证据并保留本地较新状态', async () => {
  const ctx = makeSite(topicHtml, 'https://linux.sb/topic/1')
  const dbg = await load(ctx)
  const local = dbg.createTrackingIssue(1, { question: '问题', floors: [12], excerpt: '本地' })
  const incoming = {
    schema: 'lsb-ai-copilot-tracking-export', version: 1,
    topic: { id: 1, title: '当前主题', forumName: '版块' },
    tracking: { version: '2', topicId: 1, scan: { seenKeys: ['id:999'], lastFloor: 999 },
      items: [{ ...local, status: '可能已解决', updatedAt: 1,
        evidence: [...local.evidence, { key: 'id:9001', postId: 9001, floor: 51, excerpt: '导入证据' }] }] },
  }
  const before = dbg.trackingState(1)
  const preview = dbg.previewTrackingImport(1, JSON.stringify(incoming))
  assert.equal(preview.valid, true)
  assert.equal(dbg.trackingState(1).items[0].evidence.length, before.items[0].evidence.length)
  const result = dbg.applyTrackingImport(1, preview)
  assert.equal(result.evidenceMerged, 1)
  assert.equal(dbg.trackingState(1).items[0].status, '待验证')
  assert.equal(dbg.trackingState(1).scan.lastFloor, before.scan.lastFloor)
})

test('M3.1 导入：跨主题、坏 JSON、超大文件和非法协议不写入', async () => {
  const ctx = makeSite(topicHtml, 'https://linux.sb/topic/1')
  const dbg = await load(ctx)
  for (const text of ['{坏 JSON', JSON.stringify({ schema: 'other', version: 1 }), JSON.stringify({ schema: 'lsb-ai-copilot-tracking-export', version: 1, topic: { id: 2 }, tracking: {} }), 'x'.repeat(5 * 1024 * 1024 + 1)]) {
    assert.equal(dbg.previewTrackingImport(1, text).valid, false)
    assert.equal(dbg.trackingState(1).items.length, 0)
  }
})
```

- [ ] **Step 2: 运行定向测试确认失败**

Run: `node --test --test-force-exit test/ai-copilot.test.js`

Expected: 新增测试因导入函数不存在而失败。

- [ ] **Step 3: 实现严格校验和不写入预览**

实现 `previewTrackingImport(topicId, text)`，按顺序执行：

1. 使用 `new Blob([text]).size` 计算字节数，超过 `5 * 1024 * 1024` 时返回 `{ valid: false, reason: '文件过大' }`。
2. `JSON.parse` 失败时返回明确原因。
3. 检查 `schema === 'lsb-ai-copilot-tracking-export'`、`version === 1`、`topic.id === topicId`、`tracking.version === '2'`。
4. 通过现有规范化函数清理追踪项、证据、建议和历史；非法记录放入 `rejected`，不让原始文本进入 DOM。
5. 计算 `added`、`merged`、`conflicts`、`skipped` 和证据变化，返回完整 incoming 快照，但不调用 `api.store.set`。

预览对象至少包含 `{ valid, topicId, incoming, summary, conflicts, rejected }`，并在 `applyTrackingImport` 中再次检查 `valid` 和 `topicId`，防止旧预览写入新主题。

- [ ] **Step 4: 实现稳定 ID 合并和本地扫描水位保护**

对相同 ID：

- 使用稳定键合并 `evidence`。
- 合并 `pendingEvidence`，再删除已进入 `evidence` 的键。
- 按 `updatedAt` 较新的快照选择状态、归档状态、建议、标题和来源；相同时间本地优先。
- 历史按 `type + ts + evidenceKeys` 去重后合并并裁剪到 100 条。
- 保留本地 `scan.seenKeys` 和 `scan.ts`，只把最终证据键加入本地去重集合；不使用导入文件的 `lastFloor` 覆盖本地值。

先构造完整 `next`，调用一次 `saveTrackingState`；写入失败时不清空预览，并通过异常让 UI 保留本地原状态。

- [ ] **Step 5: 暴露 debug 接口并运行测试**

把 `previewTrackingImport` 和 `applyTrackingImport` 加入 debug handler。运行：

```bash
node --test --test-force-exit test/ai-copilot.test.js
```

Expected: 预览无写入、合并规则、冲突统计和所有既有测试通过。

- [ ] **Step 6: 提交导入数据层**

```bash
git add plugins/ai-copilot.user.js test/ai-copilot.test.js
git commit -m "feat: add tracking import merge"
```

### Task 4: 追踪页筛选、选择和批量操作

**Files:**
- Modify: `plugins/ai-copilot.user.js:1241-1425` 的 `renderTrackingList`、`renderTrack` 和追踪样式区
- Test: `test/ai-copilot.test.js` 增加筛选、选择、批量归档/恢复/接受建议测试

**Interfaces:**
- Consumes: Task 1 的 `archiveTrackingItems`、`restoreTrackingItems`、`acceptTrackingSuggestions` 和 `loadTrackingState`。
- Produces: DOM 标记 `[data-track-filter]`、`[data-track-select]`、`[data-track-select-all]`、`[data-track-bulk-archive]`、`[data-track-bulk-restore]`、`[data-track-bulk-accept]`，以及可重复渲染的选择状态。

- [ ] **Step 1: 写追踪页交互失败测试**

新增 UI 测试：

```js
test('M3.1 UI：默认隐藏归档项，筛选和全选只作用于当前可见项', async () => {
  const ctx = makeSite(topicHtml, 'https://linux.sb/topic/1')
  const dbg = await load(ctx)
  const active = dbg.createTrackingIssue(1, { title: '活动', question: '活动问题', floors: [12], excerpt: '依据' })
  const archived = dbg.createTrackingIssue(1, { title: '归档', question: '归档问题', floors: [18], excerpt: '依据' })
  dbg.archiveTrackingItems(1, [archived.id])
  ctx.w.document.querySelector('.lsb-ai-copilot-top').click()
  const panel = ctx.w.document.querySelector('.lsb-copilot-panel')
  panel.querySelector('[data-mode="track"]').click()
  assert.ok(await until(() => panel.querySelector(`[data-track-id="${active.id}"]`)))
  assert.equal(panel.querySelector(`[data-track-id="${archived.id}"]`), null)
  panel.querySelector('[data-track-filter]').value = 'archived'
  panel.querySelector('[data-track-filter]').dispatchEvent(new ctx.w.Event('change'))
  assert.ok(panel.querySelector(`[data-track-id="${archived.id}"]`))
})

test('M3.1 UI：批量接受只处理有效建议，已确认解决仍只能单项确认', async () => {
  const ctx = makeSite(topicHtml, 'https://linux.sb/topic/1', {
    _llmReply: { choices: [{ message: { content: '- 状态建议：可能已解决\n- 判断依据：新回复说明已处理 [#51]\n- 新增证据：[#51]\n- 仍需确认：复现条件' } }] },
  })
  const dbg = await load(ctx)
  const accepted = dbg.createTrackingIssue(1, { title: '可接受', question: '问题 A', floors: [12], excerpt: '依据' })
  const untouched = dbg.createTrackingIssue(1, { title: '无建议', question: '问题 B', floors: [18], excerpt: '依据' })
  ctx.w.LSB.bus.emit('topic:posts-added', [{ postId: 9001, floor: 51, content: '新证据' }])
  await dbg.reviewTrackingIssue(1, accepted.id)
  ctx.w.document.querySelector('.lsb-ai-copilot-top').click()
  const panel = ctx.w.document.querySelector('.lsb-copilot-panel')
  panel.querySelector('[data-mode="track"]').click()
  assert.ok(await until(() => panel.querySelector('[data-track-card]')))
  panel.querySelector(`[data-track-select="${accepted.id}"]`).click()
  panel.querySelector(`[data-track-select="${untouched.id}"]`).click()
  panel.querySelector('[data-track-bulk-accept]').click()
  assert.ok(await until(() => dbg.trackingState(1).items.find((item) => item.id === accepted.id)?.status === '可能已解决'))
  assert.equal(dbg.trackingState(1).items.find((item) => item.id === untouched.id)?.status, '有新证据')
  assert.ok(panel.querySelectorAll('[data-track-confirm]').length >= 2)
})
```

第二个测试应通过 `reviewTrackingIssue` 产生有效建议，不直接改 DOM 或 localStorage；测试模型输出沿用现有 `makeSite` 的 `_llmReply` 机制。

- [ ] **Step 2: 运行定向测试确认失败**

Run: `node --test --test-force-exit test/ai-copilot.test.js`

Expected: 当前追踪页没有筛选器、选择框和批量按钮，新增测试失败。

- [ ] **Step 3: 增加活动/归档/全部筛选和选择状态**

在 `renderTrackingList` 内维护当前渲染作用域的 `filter` 和 `selectedIds`，默认 `active`。每次重新渲染时：

- 只对可见项目渲染选择框。
- “全选当前筛选结果”只操作当前可见 ID。
- 筛选变化清除不可见 ID，避免隐藏项目被误操作。
- 归档项显示归档标记，活动项保留现有复核和确认按钮。
- `unsupportedVersion` 状态显示“追踪数据版本不兼容，请重新建立追踪项”，不显示会误导用户的空列表提示。

所有问题标题、摘要和导入历史继续使用 `textContent`，不把存储文本拼接进 HTML。

- [ ] **Step 4: 增加批量工具栏和确认流程**

选中至少一项时显示批量栏：

- 批量归档：调用 `api.ui.confirm`，提示将停止收集新证据。
- 批量恢复：提示将重新接收后续新证据。
- 批量接受：只传入选中 ID，显示有效、无效和跳过统计；不得显示或执行“批量确认解决”。

完成后重新读取状态并渲染，不复用旧对象引用；任何异常通过 `api.ui.toast` 显示，选择保留到用户下一次刷新前或在操作完成后清空。

- [ ] **Step 5: 增加样式并运行测试**

在现有 `api.ui.style` 字符串中增加选择框、筛选器、批量栏和归档标记样式，保持当前变量和窄屏布局。运行：

```bash
node --test --test-force-exit test/ai-copilot.test.js
```

Expected: 筛选、批量归档、批量恢复、批量接受和既有追踪 UI 测试通过。

- [ ] **Step 6: 提交追踪页批量交互**

```bash
git add plugins/ai-copilot.user.js test/ai-copilot.test.js
git commit -m "feat: add tracking bulk actions"
```

### Task 5: 导出按钮、JSON 导入预览和停用清理

**Files:**
- Modify: `plugins/ai-copilot.user.js:1241-1425,1680-1735` 的追踪页渲染、事件和 `api.onDispose`
- Test: `test/ai-copilot.test.js` 增加导出/导入 UI；`test/hardening.test.js` 增加路由和停用清理

**Interfaces:**
- Consumes: Task 2 的 `serializeTracking`/`downloadText`，Task 3 的预览/应用函数，Task 4 的选择状态。
- Produces: `[data-track-export-json]`、`[data-track-export-markdown]`、`[data-track-export-issues]`、`[data-track-export-evidence]`、`[data-track-import]`、`[data-track-import-preview]`、`[data-track-import-confirm]`、`[data-track-import-cancel]`。

- [ ] **Step 1: 写下载和导入 UI 的失败测试**

测试应替换 `URL.createObjectURL`、`URL.revokeObjectURL` 和锚点 `click`，断言四个导出按钮使用正确扩展名和 MIME；导入测试使用 `new File([json], 'tracking.json', { type: 'application/json' })`，断言先出现预览，再点击确认后状态才变化。

```js
test('M3.1 UI：导出按钮分别下载 JSON、Markdown 和两份 CSV', async () => {
  const ctx = makeSite(topicHtml, 'https://linux.sb/topic/1')
  const dbg = await load(ctx)
  dbg.createTrackingIssue(1, { question: '导出问题', floors: [12], excerpt: '依据' })
  const downloads = []
  ctx.w.URL.createObjectURL = (blob) => {
    downloads.push({ blob })
    return `blob:${downloads.length}`
  }
  ctx.w.URL.revokeObjectURL = () => {}
  ctx.w.HTMLAnchorElement.prototype.click = function () {
    downloads.at(-1).name = this.download
  }
  ctx.w.document.querySelector('.lsb-ai-copilot-top').click()
  const panel = ctx.w.document.querySelector('.lsb-copilot-panel')
  panel.querySelector('[data-mode="track"]').click()
  assert.ok(await until(() => panel.querySelector('[data-track-card]')))
  for (const attr of ['data-track-export-json', 'data-track-export-markdown', 'data-track-export-issues', 'data-track-export-evidence']) {
    panel.querySelector(`[${attr}]`).click()
  }
  assert.deepEqual(downloads.map((row) => row.name.split('.').pop()), ['json', 'md', 'csv', 'csv'])
})

test('M3.1 UI：JSON 导入先显示预览，确认后才合并', async () => {
  const ctx = makeSite(topicHtml, 'https://linux.sb/topic/1')
  const dbg = await load(ctx)
  const incoming = { ...dbg.trackingExport(1), tracking: { ...dbg.trackingState(1), items: [{
    id: 'issue-imported', question: '导入问题', status: '待验证', source: { floors: [12] },
    evidence: [], pendingEvidence: [], suggestion: null, createdAt: 1, updatedAt: 1,
  }] } }
  ctx.w.document.querySelector('.lsb-ai-copilot-top').click()
  const panel = ctx.w.document.querySelector('.lsb-copilot-panel')
  panel.querySelector('[data-mode="track"]').click()
  assert.ok(await until(() => panel.querySelector('[data-track-import]')))
  const input = panel.querySelector('[data-track-import]')
  Object.defineProperty(input, 'files', { configurable: true, value: [new ctx.w.File([JSON.stringify(incoming)], 'tracking.json', { type: 'application/json' })] })
  input.dispatchEvent(new ctx.w.Event('change'))
  assert.ok(await until(() => panel.querySelector('[data-track-import-preview]')))
  assert.equal(dbg.trackingState(1).items.length, 0)
  panel.querySelector('[data-track-import-confirm]').click()
  assert.ok(await until(() => dbg.trackingState(1).items.some((item) => item.id === 'issue-imported')))
})
```

在 `test/hardening.test.js` 增加：

```js
test('停用清理：追踪导入预览和临时下载对象全部收摊', async () => {
  const { w } = makeSite({
    'lsb_base:ai-summary:__config': { apiUrl: 'https://api.example.com/v1/chat/completions', apiKey: 'k' },
    'lsb_base:ai-copilot:__config': { fetchAll: false, maxPages: 15, maxChars: 12000, sessionTurns: 6 },
  })
  const revoked = []
  w.URL.revokeObjectURL = (url) => revoked.push(url)
  await loadBase(w, PLUG('ai-summary'), PLUG('ai-copilot'))
  w.document.querySelector('.lsb-ai-copilot-top').click()
  const panel = w.document.querySelector('.lsb-copilot-panel')
  panel.querySelector('[data-mode="track"]').click()
  assert.ok(await until(() => panel.querySelector('[data-track-import]')))
  w.LSB.disable('ai-copilot')
  assert.equal(w.document.querySelector('[data-track-import]'), null)
  assert.equal(w.document.querySelector('[data-track-import-preview]'), null)
  assert.ok(Array.isArray(revoked))
})
```

- [ ] **Step 2: 运行定向测试确认失败**

Run: `node --test --test-force-exit test/ai-copilot.test.js test/hardening.test.js`

Expected: 缺少导出按钮、文件输入、预览节点和清理逻辑，新增测试失败。

- [ ] **Step 3: 接入四个导出按钮**

在追踪工具栏加入四个独立动作；文件名使用当前主题 ID 和日期，例如：

```text
linuxsb-tracking-1-2026-09-27.json
linuxsb-tracking-1-2026-09-27.md
linuxsb-tracking-1-2026-09-27-issues.csv
linuxsb-tracking-1-2026-09-27-evidence.csv
```

点击后从当前状态重新生成文本，调用 `downloadText`；下载失败显示错误 toast，不改变状态。不要在一次点击中触发多次下载。

- [ ] **Step 4: 接入 JSON 文件选择和预览**

使用隐藏 `<input type="file" accept="application/json,.json">`。`change` 事件读取文本，调用 `previewTrackingImport`，将统计、冲突和拒绝记录用 `textContent` 渲染到预览区。预览中只显示“确认合并”和“取消”，无效预览禁用确认按钮。

确认按钮调用 `applyTrackingImport`，成功后清除文件输入、关闭预览、重新渲染追踪列表并显示统计；失败则保留预览并显示错误。取消只清理预览，不写入。

- [ ] **Step 5: 补齐路由、停用和在途状态清理**

新增 `trackingImportInput`、`trackingImportPreview` 和下载 URL 集合，在 `route:changed`、`closePanel` 和 `api.onDispose` 中清理：

- 移除临时文件输入和预览节点。
- 清除选中 ID 和待确认预览。
- 对尚未释放的对象 URL 调用 `URL.revokeObjectURL`。
- 递增现有 `generation`，使旧主题异步导入不能提交到新主题。

- [ ] **Step 6: 运行 UI/硬化测试并提交**

```bash
node --test --test-force-exit test/ai-copilot.test.js test/hardening.test.js
```

Expected: 导出、导入预览、确认合并、取消、路由切换、停用清理和全部既有测试通过。

```bash
git add plugins/ai-copilot.user.js test/ai-copilot.test.js test/hardening.test.js
git commit -m "feat: add tracking workbench ui"
```

### Task 6: 版本、构建产物和全量验收

**Files:**
- Modify: `plugins/ai-copilot.user.js:4,25`
- Modify: `build-suite.mjs:14`
- Generate: `dist/linuxsb-suite.user.js`, `dist/linuxsb-lts.user.js`, 以及构建链生成的其他 `dist/` 文件
- Test: `test/ai-copilot.test.js`, `test/hardening.test.js` 全量套件

**Interfaces:**
- Consumes: Tasks 1–5 的源码和测试。
- Produces: AI 副驾 `0.5.0`、Oxygen `1.0.117`、LTS 同步构建但不包含 `ai-copilot` 的最终产物。

- [ ] **Step 1: 写版本和产物断言**

在现有测试或 `test/hardening.test.js` 增加断言：

```js
test('M3.1 版本：源码和 Oxygen 产物包含新版本，LTS 不包含 ai-copilot', async () => {
  const copilot = readFileSync(new URL('../plugins/ai-copilot.user.js', import.meta.url), 'utf8')
  const suite = readFileSync(new URL('../dist/linuxsb-suite.user.js', import.meta.url), 'utf8')
  const lts = readFileSync(new URL('../dist/linuxsb-lts.user.js', import.meta.url), 'utf8')
  assert.match(copilot, /@version\s+0\.5\.0/)
  assert.match(copilot, /version:\s*'0\.5\.0'/)
  assert.match(suite, /@version\s+1\.0\.117/)
  assert.doesNotMatch(lts, /id:\s*'ai-copilot'/)
})
```

- [ ] **Step 2: 运行版本断言确认失败**

Run: `node --test --test-force-exit test/hardening.test.js`

Expected: 在版本尚未更新时只有新增版本断言失败，其他硬化测试保持通过。

- [ ] **Step 3: 更新源码版本**

同步修改 `plugins/ai-copilot.user.js` 的 userscript `@version` 和 manifest `version` 为 `0.5.0`，修改 `build-suite.mjs` 的 `SUITE_VERSION` 为 `1.0.117`。不要修改 `src/core.js` 的 Hydrogen `0.1.41`，不要把 `ai-copilot` 加入 `ORDER_LTS`。

- [ ] **Step 4: 构建并检查产物**

Run: `npm run build`

Expected: 生成 Oxygen `1.0.117` 和由 Oxygen 版本派生的 LTS，Oxygen 含 `ai-copilot` v0.5.0，LTS 不含该模块。

- [ ] **Step 5: 运行全量验证**

依次运行：

```bash
npm test
npm run verify:dist
git diff --check
```

Expected：全部测试通过，dist 新鲜度检查通过，`git diff --check` 无输出。若某一步失败，只修复导致该失败的具体问题后重复该步，不扩大测试范围。

- [ ] **Step 6: 检查最终差异并提交发布变更**

检查：

```bash
git status --short
git diff --stat HEAD~1
git diff -- plugins/ai-copilot.user.js build-suite.mjs test/ai-copilot.test.js test/hardening.test.js
```

确认没有手工修改生成的 dist 以外的无关文件后提交：

```bash
git add plugins/ai-copilot.user.js build-suite.mjs test/ai-copilot.test.js test/hardening.test.js dist
git commit -m "feat: ship ai copilot tracking workbench"
```

最终报告应包含：四种导出格式、JSON 预览合并、归档/恢复、批量操作、版本和产物、`npm test`/`verify:dist`/`git diff --check` 的实际结果。
