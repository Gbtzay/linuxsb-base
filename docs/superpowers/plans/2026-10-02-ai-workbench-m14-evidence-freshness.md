# M14：AI 工作台证据新鲜度与回答复核实施计划

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task. 本计划在当前工作区内联执行；用户明确禁止派发子代理。每个任务完成后保留可审阅的工作树 diff，不执行 git commit 或 git push，也不重置、清理或覆盖前几轮未提交改动。

**Goal:** 为 AI 工作台加入材料快照、回答缓存失效、引用按需复核、旧回答版本对照和安全迁移，同时保持引用本地验证、取消传播和站内写操作隔离。

**Architecture:** 基座新增无副作用的证据快照纯函数，统一生成材料指纹、引用指纹和差异状态；ai-copilot 将语义指纹与材料指纹分开保存，材料变化只使回答缓存失效，引用复核通过有限的站内 GET 重新解析引用涉及的页面，不调用回答模型。ai-workbench 在当前 turn 内保存最多两版脱敏回答与复核状态，渲染差异和手动重生成入口；旧记录缺少快照时迁移为 legacy，站内写计划、执行、重试和结果检查始终不携带历史、复核或旧回答数据。

**Tech Stack:** 原生 JavaScript userscript、基座 ESM 模块、Tampermonkey fetch/GM 网络层、Node test、jsdom、esbuild、本地 Chromium/Edge CDP 验收脚本。

## Global Constraints

- 实际仓库为 D:\test\linuxsb-base；现有工作树包含 M12/M13 及更早改动，只增量编辑本计划列出的文件。
- 直接携带有限历史的 M12/M13 语义保持不变；M14 不把摘要、旧回答或旧引用当成本轮证据。
- 每次复核最多处理 40 条引用、8 个主题页面和一个共享字符预算 12000；所有读取接受同一个 AbortSignal。
- 复核只使用站内 GET 和本地解析；失败、取消、范围变化和楼层消失不会变成已验证，也不会触发写动作。
- 旧 turn 缺少 evidenceSnapshot 或 freshness 时迁移为 legacy，不自动联网重放、不删除回答。
- 旧回答最多保留 2 个版本，会话总大小仍受 1 MiB 限制；持久化字段只接受白名单类型、长度和正整数 ID。
- 写计划、执行、重试和结果检查显式使用空历史、空摘要、空引用复核上下文。
- 每个 M14 子交付先写失败测试、确认失败，再写最小实现并确认通过；不提交或推送。
- 版本目标固定为：基座/package 0.1.52、ai-copilot 0.11.0、ai-workbench 0.7.0、Oxygen/LTS 1.0.132。
- 交付前运行 npm test、npm run build、npm run verify:dist、git diff --check 和 node scripts/check-ai-workbench-browser.mjs；只使用本地 fixture 和模拟模型。

---

### Task 1: 证据快照纯函数和基座 API（M14.1）

**Files:**
- Create: src/ai-evidence.js
- Modify: src/core.js
- Create: test/ai-evidence.test.js
- Modify: test/core.test.js

**Interfaces:**
- buildEvidenceSnapshot(posts, scope, options = {}) → { version: 1, scope, materialFingerprint, citations }。
- diffEvidenceSnapshots(previous, current) → { status, rows, counts }。
- mergeCitationReview(previousRows, review) → 白名单化引用行数组。
- api.ai.evidence 只暴露以上三个函数，不访问 DOM、网络或存储。

- [ ] **Step 1: 写失败测试**

在 test/ai-evidence.test.js 导入三个函数并加入：

~~~js
const scope = { kind: 'topic', routeType: 'topic', topicId: 7, routeScope: 'topic:7:1' }
const posts = [
  { topicId: 7, postId: 702, floor: 2, page: 1, authorName: '乙', content: '第二层正文' },
  { topicId: 7, postId: 701, floor: 1, page: 1, authorName: '甲', content: '第一层正文' },
  { topicId: 7, postId: 702, floor: 2, page: 1, authorName: '乙', content: '第二层正文' },
]

test('M14 evidence snapshot 对重复输入产生稳定指纹', () => {
  const first = buildEvidenceSnapshot(posts, scope)
  const second = buildEvidenceSnapshot([...posts].reverse(), scope)
  assert.equal(first.version, 1)
  assert.equal(first.materialFingerprint, second.materialFingerprint)
  assert.deepEqual(first.citations.map(row => row.floor), [1, 2])
})

test('M14 evidence diff 识别正文、作者、楼层和分页变化', () => {
  const before = buildEvidenceSnapshot(posts, scope)
  const after = buildEvidenceSnapshot([
    { ...posts[0], content: '正文变化' },
    { ...posts[1], authorName: '新作者' },
    { ...posts[1], postId: 799, floor: 3, page: 2 },
  ], scope)
  const result = diffEvidenceSnapshots(before, after)
  assert.ok(result.counts.changed >= 1)
  assert.ok(result.counts.removed >= 1)
  assert.ok(result.rows.some(row => row.status === 'changed' && row.reason === 'content'))
})

test('M14 evidence 无效输入和复核失败不会变为 fresh', () => {
  const empty = buildEvidenceSnapshot([{ topicId: 7, floor: -1, page: 0, content: 'token=secret https://evil.example' }], scope)
  assert.equal(empty.citations.length, 0)
  const rows = mergeCitationReview(
    [{ key: 'topic:7:post:701', topicId: 7, postId: 701, floor: 1, freshness: 'fresh', contentFingerprint: 'old' }],
    { status: 'unverifiable', rows: [{ key: 'topic:7:post:701', reason: 'page-error' }] },
  )
  assert.equal(rows[0].freshness, 'unverifiable')
})

test('M14 evidence 范围缺失或变化采用 unverifiable', () => {
  const before = buildEvidenceSnapshot(posts, scope)
  const other = buildEvidenceSnapshot(posts, { ...scope, topicId: 8 })
  assert.equal(diffEvidenceSnapshots(before, other).status, 'unverifiable')
  assert.equal(diffEvidenceSnapshots(null, other).status, 'unverifiable')
})
~~~

在 test/core.test.js 注册带 read 权限的探针，断言 api.ai.evidence 三个成员都是函数，且调用不会改变输入数组。

- [ ] **Step 2: 运行失败测试**

运行：
~~~text
node --test test/ai-evidence.test.js test/core.test.js --test-name-pattern="M14 evidence|ai\.evidence"
~~~
预期：模块或 API 尚不存在而失败。

- [ ] **Step 3: 实现 src/ai-evidence.js**

实现规范化 scope、帖子和引用 key；采用 Unicode NFKC、连续空白折叠、长度上限和正整数校验。重复 key 保留确定性最优行，按 topicId/page/floor/postId 排序。用模块内稳定短哈希生成 contentFingerprint 和 materialFingerprint，不保存原始 HTML、URL、CSRF、令牌或模型文本。

diff 时先校验版本和 scope；同 key 且指纹相同为 unchanged，字段变化为 changed，旧行消失为 removed，缺失/非法为 unverifiable。整体状态按 unverifiable、removed、changed、unchanged 聚合。mergeCitationReview 只接受安全状态和 reason，只有指纹匹配且明确 unchanged 才能写 fresh。

- [ ] **Step 4: 暴露基座 API**

在 src/core.js 导入三个函数，并在 _makeApi 的 ai 对象增加：

~~~js
evidence: Object.freeze({
  buildEvidenceSnapshot,
  diffEvidenceSnapshots,
  mergeCitationReview,
}),
~~~

不改变现有 conversation、abort、stream、trace 接口。

- [ ] **Step 5: 运行通过测试**

运行同一条定向命令和 git diff --check，确认纯函数、API 和已有 core 测试通过，不提交。

---

### Task 2: ai-copilot 材料快照和缓存失效（M14.1）

**Files:**
- Modify: plugins/ai-copilot.user.js
- Modify: test/ai-copilot.test.js

**Interfaces:**
- run() 的成功只读记录在 meta 中保存 semanticFingerprint、materialFingerprint、evidenceSnapshot、citationReview。
- semanticFingerprint 包含问题、模式、模型、配置、对话/摘要来源指纹和协议版本，但不含正文；materialFingerprint 来自当前本地快照。
- 只有两种指纹都匹配时命中缓存；只匹配语义时保留旧记录并重新生成。缺少 semanticFingerprint 的 M12/M13 旧缓存不参加候选查找。

- [ ] **Step 1: 写失败测试**

在 test/ai-copilot.test.js 使用现有 fixture 增加：

~~~js
test('M14 材料变化使同语义回答失效并保留旧缓存', async () => {
  const first = await runAsk('缓存问题')
  const oldKey = findStoredCopilotKey(row => row?.meta?.semanticFingerprint === first.meta.semanticFingerprint)
  mutateTopicPost(1, '同一楼层的新正文')
  const second = await runAsk('缓存问题')
  assert.equal(generateCalls, 2)
  assert.notEqual(second.meta.materialFingerprint, first.meta.materialFingerprint)
  assert.equal(readStored(oldKey).text, first.text)
  assert.equal(second.meta.evidenceSnapshot.version, 1)
})

test('M14 同材料同语义只生成一次', async () => {
  const first = await runAsk('相同问题')
  const second = await runAsk('相同问题')
  assert.equal(generateCalls, 1)
  assert.equal(second.meta.materialFingerprint, first.meta.materialFingerprint)
})

test('M14 旧缓存缺少 semanticFingerprint 时不复用', async () => {
  seedCache({ text: '旧结果', meta: { topicId: 1, citations: [] } })
  assert.notEqual((await runAsk('旧缓存问题')).text, '旧结果')
})
~~~

- [ ] **Step 2: 运行失败测试**

运行：
~~~text
node --test test/ai-copilot.test.js --test-name-pattern="M14"
~~~
预期：当前记录没有新字段且材料变化仍可能命中旧结果。

- [ ] **Step 3: 采集后构造 evidenceSnapshot**

在 run() 的 collectContext 成功后调用 api.ai.evidence.buildEvidenceSnapshot。每个帖子只传 topicId、postId、floor、page、authorName、content；scope 固定为当前 topic、routeType 和 routeFingerprint。buildRequest 返回语义指纹，计算输入显式包含问题、模式、模型、conversation rows、conversationSummary、conversationFingerprint、routeScope、citationVersion 和 analysisVersion，排除 context.meta.hash 与正文。

- [ ] **Step 4: 改造缓存查找和写入**

保留现有包含材料的请求 key，使不同材料版本共存；缓存命中前扫描最多 60 个 c: 记录，只接受 topicId、semanticFingerprint 和 version 1 evidenceSnapshot 类型正确的记录。两指纹相同才返回，并沿用 citationReview；材料不同则继续模型调用。成功回答写入快照和 citationReview: null；模型失败、取消或网络中断不得覆盖旧记录。pruneCache 仍按 meta.ts 保留上限。

- [ ] **Step 5: 运行定向回归**

运行：
~~~text
node --test test/ai-copilot.test.js --test-name-pattern="M14|M13|M12"
~~~
确认缓存失效、旧版本保留、历史上下文和取消行为均通过。

---

### Task 3: 引用惰性复核、差异和取消（M14.2）

**Files:**
- Modify: plugins/ai-copilot.user.js
- Modify: test/ai-copilot.test.js
- Modify: test/net.test.js

**Interface:**
revalidateCitations({ snapshot, citations, scope = {}, signal, onProgress }) 返回：

~~~js
{
  status: 'unchanged' | 'changed' | 'removed' | 'unverifiable',
  reviewedAt: 0,
  materialFingerprint: '...',
  rows: [{ key, topicId, postId, floor, page, authorName, contentFingerprint, freshness, reason }],
  counts: { unchanged: 0, changed: 0, removed: 0, unverifiable: 0 },
}
~~~

该接口不调用模型、不返回原始 HTML/URL/CSRF/动作参数。

- [ ] **Step 1: 写失败测试**

在 test/ai-copilot.test.js 加入：

~~~js
test('M14 惰性复核去重页面且不调用模型', async () => {
  const result = await copilot.revalidateCitations({ snapshot, citations: snapshot.citations, scope: snapshot.scope })
  assert.equal(providerGenerateCalls, 0)
  assert.equal(new Set(docReads.map(row => row.url)).size, 1)
  assert.equal(result.counts.unchanged, 2)
})

test('M14 分页复核识别正文变化和楼层消失', async () => {
  const result = await copilot.revalidateCitations({ snapshot, citations, scope })
  assert.equal(result.counts.changed, 1)
  assert.equal(result.counts.removed, 1)
})

test('M14 页面错误为 unverifiable', async () => {
  docReadsFailFor.add('topic:7:page:2')
  const result = await copilot.revalidateCitations({ snapshot, citations, scope })
  assert.equal(result.counts.unverifiable, 1)
  assert.notEqual(result.rows.find(row => row.page === 2).freshness, 'fresh')
})

test('M14 取消停止后续读取并不落盘', async () => {
  const controller = new AbortController()
  const pending = copilot.revalidateCitations({ snapshot, citations, scope, signal: controller.signal })
  controller.abort()
  await assert.rejects(pending, /Abort|取消|aborted/i)
  assert.equal(savedRecord.meta.citationReview, null)
})
~~~

在 test/net.test.js 加入响应未完成时 controller.abort() 的 net.doc 测试，断言底层请求停止且后续队列不启动。

- [ ] **Step 2: 运行失败测试**

运行：
~~~text
node --test test/ai-copilot.test.js test/net.test.js --test-name-pattern="M14"
~~~
预期：复核函数尚未导出或未传播 signal 而失败。

- [ ] **Step 3: 增加限制和引用目标**

定义 CITATION_REVIEW_VERSION=1、MAX_CITATIONS=40、MAX_PAGES=8、MAX_CHARS=12000、TTL=30*60*1000。引用按 key 去重，页面按 topicId:page 去重并稳定排序；超出页面/字符预算的行写 unverifiable 和 page-budget/char-budget。

- [ ] **Step 4: 当前 DOM 优先，分页 GET 补齐**

先用 api.parse.topic(document) 验证 scope.topicId 一致的当前楼层；未命中引用才调用 api.net.doc(api.routes.topic(topicId, page), { signal })，解析后只取引用涉及楼层。解析失败或范围错误为 unverifiable，缺失楼层为 removed，同一页面失败共享安全 reason。使用 Task 1 的快照/diff/merge 生成 freshness，只有本地指纹相同才能 fresh。每个阶段都调用 throwIfAborted，并通过 onProgress/trace 发送有限计数。

- [ ] **Step 5: 接入缓存和导出**

成功回答初始 citationReview 为 null。导出 revalidateCitations；成功复核只更新匹配缓存记录的 meta.citationReview 和 citation freshness，不调用 provider.generate。复核失败/取消保留旧 review；TTL 到期只显示 citation-stale，网络复核必须由用户按钮触发，不得进入 planActions/action history。

- [ ] **Step 6: 运行通过测试**

运行：
~~~text
node --test test/ai-copilot.test.js test/net.test.js --test-name-pattern="M14|Abort|取消"
~~~
确认去重、预算、当前 DOM、差异、部分失败、取消和无模型调用全部通过。

---

### Task 4: 工作台迁移、版本对照和复核 UI（M14.3）

**Files:**
- Modify: plugins/ai-workbench.user.js
- Modify: test/ai-workbench.test.js
- Modify: plugins/ai-write-actions.user.js
- Modify: test/ai-write-actions.test.js

**Interfaces:**
- normalizedConversationTurn(raw) 新增 freshness、evidenceSnapshot、revisions；freshness.status 只允许 fresh、material-stale、citation-stale、unverifiable、legacy；revisions 最多两项。
- saveTurnAnswer(conversationId, turnId, answer, state, citations, evidenceMeta = {}) 只为只读成功回答写快照和版本。
- 回答卡提供 data-ai-citation-review、data-ai-regenerate-fresh、data-ai-revision、data-ai-citation-diff。

- [ ] **Step 1: 写失败测试**

在 test/ai-workbench.test.js 加入：

~~~js
test('M14 缺少快照的旧 turn 迁移为 legacy 且不自动联网', async () => {
  seedConversation({ turns: [{ id: 'legacy-1', capability: 'ask', question: '旧问题', answer: '旧回答', state: 'complete', citations: [] }] })
  mountWorkbench()
  const turn = readConversation().conversations[0].turns[0]
  assert.equal(turn.freshness.status, 'legacy')
  assert.equal(revalidateCalls, 0)
  assert.equal(turn.answer, '旧回答')
})

test('M14 复核按钮不重新调用回答模型并显示差异', async () => {
  copilot.revalidateCitations = async () => reviewChanged()
  const wb = mountWorkbenchWithFreshTurn()
  await clickAndWait(wb, '[data-ai-citation-review]')
  assert.equal(generateCalls, 0)
  assert.ok(wb.querySelector('[data-ai-citation-diff]'))
})

test('M14 新材料回答保留旧版本，失败不覆盖旧回答', async () => {
  copilot.runTopic = async () => newMaterialAnswer()
  const wb = mountWorkbenchWithStaleTurn()
  await clickAndWait(wb, '[data-ai-regenerate-fresh]')
  let turn = readConversation().conversations[0].turns[0]
  assert.equal(turn.revisions.length, 1)
  assert.equal(turn.revisions[0].answer, '旧回答')
  copilot.runTopic = async () => { throw new Error('fixture failure') }
  await clickAndWait(wb, '[data-ai-regenerate-fresh]')
  turn = readConversation().conversations[0].turns[0]
  assert.equal(turn.answer, '新材料回答')
})

test('M14 写计划、执行和结果检查没有复核或历史字段', async () => {
  const calls = []
  copilot.planActions = async options => { calls.push(options); return readonlyPlan() }
  await runSiteActionFlow()
  for (const options of calls) {
    for (const key of ['freshness', 'revisions', 'evidenceSnapshot', 'citationReview', 'conversationSummary']) {
      assert.equal(Object.prototype.hasOwnProperty.call(options, key), false)
    }
  }
})
~~~

在 test/ai-write-actions.test.js 对 action context、提交和 result-check payload 加同样的字段否定断言。

- [ ] **Step 2: 运行失败测试**

运行：
~~~text
node --test test/ai-workbench.test.js test/ai-write-actions.test.js --test-name-pattern="M14"
~~~
预期：legacy、按钮、revision 和写操作隔离测试失败。

- [ ] **Step 3: 扩展白名单和迁移**

在 normalizedConversationTurn 中规范化 evidenceSnapshot（version 1、scope、最多 40 引用、安全指纹）；缺失 snapshot 或 freshness 的旧 turn 设置 legacy 并保留 answer/citations。规范化 reviewedAt、materialFingerprint、四类 counts 和 revision reason；revisions 只保留脱敏回答、正整数引用 ID、时间、指纹，排序后取最近两项。1 MiB 裁剪先丢非当前 turn 的旧 revisions，再丢旧 turn，绝不写半截结构。

- [ ] **Step 4: 保存新回答和引用复核**

新材料回答成功时先复制当前 answer/citations/materialFingerprint 到 revisions，再替换当前回答；原因只能是 material-changed 或 manual-regenerate。取消、失败、网络中断和迟到结果不改当前回答或旧版本。复核成功只更新 freshness、citationReview rows/counts/reviewedAt，不创建 revision。site-action/research 路径显式传空 evidenceMeta。

- [ ] **Step 5: 渲染 UI 并接入 token**

回答卡显示材料新鲜、材料已变化、引用需复核、引用无法读取或旧回答待复核。复核按钮使用 beginReadRequest 的 AbortSignal，只更新状态；差异按未变化、内容变化、楼层消失、无法读取分组，链接从本地 route 和正整数 ID 生成。重生成成功后显示 revision 展开区，失败/停止/路由切换/会话切换保留旧回答。所有异步落盘前检查 conversationId、turnId、generation 和 route fingerprint；旧 revision 不进入 action plan、execute、retry 或 result-check。

- [ ] **Step 6: 运行通过测试**

运行：
~~~text
node --test test/ai-workbench.test.js test/ai-write-actions.test.js --test-name-pattern="M14|fresh|legacy|citation|revision"
~~~
再运行两个测试文件不带 pattern，确认 M12/M13 停止、重试、摘要、引用和 receipt 检查未回归。

---

### Task 5: 浏览器验收、版本同步和完整交付（M14.3）

**Files:**
- Modify: scripts/check-ai-workbench-browser.mjs
- Modify: test/fixtures/topic1.html
- Modify: plugins/ai-copilot.user.js
- Modify: plugins/ai-workbench.user.js
- Modify: src/core.js
- Modify: package.json
- Modify: build-suite.mjs
- Modify: suite/suite-center.js
- Modify: README.md
- Test: test/core.test.js、test/suite.test.js、test/lts.test.js、test/ai-copilot.test.js、test/ai-workbench.test.js

**Interfaces:** 浏览器脚本继续使用本地 fixture 和模拟模型，报告新增材料新鲜度、引用复核、差异、取消、旧版本和写操作隔离检查；ORDER 保持 provider → copilot → actions → workbench，ORDER_LTS 不加入 AI。

- [ ] **Step 1: 先加入浏览器失败断言**

扩展 scripts/check-ai-workbench-browser.mjs 的本地 server：初始 topic 返回两条引用；分页返回正文变化和新楼层；第二次读取让一条引用消失；延迟页面响应支持中止；若复核路径请求 /llm 则立即失败。加入：

~~~js
await send('先回答引用问题')
await complete()
assert.equal(await has('[data-ai-citation-review]'), true)
await click('[data-ai-citation-review]')
await waitFor(() => query('[data-ai-citation-diff]'), 'citation diff')
assert.match(await query('[data-ai-citation-diff]'), /内容变化|楼层消失/)
assert.equal(modelRequestsAfterReview, modelRequestsBeforeReview)
await click('[data-ai-regenerate-fresh]')
await complete()
assert.equal(await has('[data-ai-revision]'), true)
~~~

- [ ] **Step 2: 运行失败浏览器测试**

运行：
~~~text
node scripts/check-ai-workbench-browser.mjs
~~~
预期：新 selector/状态尚未实现而失败；保留失败证据后再实现，不删除断言。

- [ ] **Step 3: 完成 fixture 和 report**

保留现有 M12/M13 的分段回答、引用链接、新对话隔离、停止释放输入框、重试复用 turn、摘要失败降级和 site-action 无历史检查。新增复核去重/差异、复核取消不落盘、网络中断手动重试、重生成保留旧回答、浏览器异常为空和插件 error 为空。报告保存为 .tmp-m14-browser-report.json，截图保存为 .tmp-m14-browser-*.png，临时文件不加入 git。

- [ ] **Step 4: 同步版本和说明**

将 plugins/ai-copilot.user.js 的 @version/manifest.version 改为 0.11.0、base 改为 ^0.1.52；ai-workbench 改为 0.7.0、base ^0.1.52、ai-copilot ^0.11.0；src/core.js VERSION 与 package.json 改为 0.1.52；build-suite.mjs SUITE_VERSION 与 suite/suite-center.js manifest.version 改为 1.0.132；README 更新模块表并说明缓存失效、按引用复核、最多两版旧回答和写操作隔离。dist 文件只由构建生成，不手改。

- [ ] **Step 5: 全量回归、构建和产物校验**

按顺序运行：

~~~text
node --test test/ai-evidence.test.js test/ai-copilot.test.js test/ai-workbench.test.js test/ai-write-actions.test.js test/net.test.js
npm test
npm run build
npm run verify:dist
git diff --check
node scripts/check-ai-workbench-browser.mjs
~~~

检查 Hydrogen/Oxygen/LTS 头部版本、模块清单和 api.ai.evidence 是否进入 dist；LTS 仍不包含 AI 模块。

- [ ] **Step 6: 完成验收清单**

确认相同语义/材料命中缓存；材料变化生成新回答并保留旧版本；复核最多 40 条/8 页/共享预算且不调用模型；复核失败/取消/网络中断不覆盖旧回答；新会话、主题、分页和路由不串快照；legacy 不自动重放；写计划、执行、重试、结果检查无 freshness、revisions、evidenceSnapshot、citationReview、conversation 或摘要字段。只报告测试、构建和工作树 diff，不执行 commit/push。


