# AI 帖子副驾 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 在 linux.sb 帖子页新增只读 AI 副驾，支持当前主题问答、讨论分析和指定楼层回复草稿，并复用 `ai-summary` 的模型配置与协议适配。

**Architecture:** 新建 `ai-copilot` 插件，由它负责帖子采集、上下文预算、模式提示词、会话、缓存和 UI；`ai-summary` 暴露 `configured()` 与 `generate()` 两个窄导出，只负责模型配置和外部请求。`ai-copilot` 通过 manifest 依赖 `ai-summary`，不直接申请外部网络权限，也不申请 `write`。

**Tech Stack:** Tampermonkey userscripts、原生 JavaScript、基座 `api.parse`/`api.net`/`api.ui`/`api.store`、Node `node:test`、jsdom、esbuild。

## Global Constraints

- 新插件文件必须是 `plugins/ai-copilot.user.js`，并登记在 `suite/order.js` 的 `ORDER` 中，位置紧跟 `ai-summary`。
- `ai-summary` 的版本提升到 `1.2.0`；新插件版本为 `0.1.0`；套件版本从 `1.0.112` 提升到 `1.0.113`；基座版本保持 `0.1.41`；不加入 `ORDER_LTS`。
- `ai-copilot` 的权限只能是 `read`、`storage`、`ui`、`events`，不申请 `net` 或 `write`。
- 所有站内读取必须经过基座的 `api.parse` 或 `api.net.pages`；外部模型请求只能由 `ai-summary` 发起，并保持 `queue: false`。
- 论坛正文、用户名和引用是“不可信数据”；系统提示、用户问题和论坛正文必须使用独立区块分隔，模型不得执行正文内指令。
- 回复功能只生成和复制草稿，不填充或提交站内回复；任何站内写操作都不在首版范围内。
- 当前主题会话最多保留 6 轮；缓存最多保留 60 条；缓存键必须包含主题、内容、模式、问题/楼层、语气、长度、模型、范围和字符预算。
- 插件必须在 `api.onDispose()` 中清理浮层、计时器、监听器、按钮引用和在途状态；路由变化后的旧结果不得覆盖新主题。
- 插件源文件使用 UTF-8 无 BOM 和 LF；不得直接手工编辑 `dist/`，成品由 `npm run build` 生成。

## Files and Responsibilities

- Modify: `plugins/ai-summary.user.js` — 抽取通用模型调用，导出 `configured()` 和 `generate()`，保留现有总结 UI、缓存和历史页。
- Modify: `test/ai-summary.test.js` — 验证模型服务导出不泄漏总结风格/附加要求，并保留现有总结回归测试。
- Create: `plugins/ai-copilot.user.js` — manifest、上下文采集、预算、提示词、问答会话、缓存、三种模式 UI、路由代次和清理逻辑。
- Create: `test/ai-copilot.test.js` — 使用真实主题夹具测试采集、提示词、缓存、请求并发、UI 和草稿流程。
- Modify: `test/hardening.test.js` — 验证停用 `ai-copilot` 后面板、计时器、监听器和在途请求全部收摊。
- Modify: `suite/order.js` — 在 `ai-summary` 后登记 `ai-copilot`；保持 `ORDER_LTS` 不变。
- Modify: `test/suite.test.js` — 将 `ai-copilot` 加入套件成员、版本和产物完整性断言。
- Modify: `build-suite.mjs` — 将 `SUITE_VERSION` 更新为 `1.0.113`。
- Modify: `README.md` — 增加 AI 副驾插件说明、依赖和安全边界，更新版本/插件数量描述。
- Generated: `dist/linuxsb-base.user.js`, `dist/linuxsb-suite.user.js`, `dist/linuxsb-lts.user.js` — 由构建命令生成并在最终验证中检查。

---

### Task 1: 为 `ai-summary` 增加模型服务导出

**Files:**
- Modify: `plugins/ai-summary.user.js`
- Test: `test/ai-summary.test.js`

**Interfaces:**
- Produces `ai-summary` plugin exports:
  - `configured(): boolean` — 动态检查 `cfg.apiUrl` 和 `cfg.apiKey` 是否非空。
  - `generate({ system, user, timeout }): Promise<{ text: string, meta: { model: string, ms: number } }>` — 直接按调用方提示词请求模型；`timeout` 为毫秒，可省略并回退到 `cfg.timeoutSec`。
- Existing `run()` continues to use the same provider and existing summary behavior, including the old style and custom prompt settings.

- [ ] **Step 1: Write failing provider tests**

Append tests to `test/ai-summary.test.js` that load the base and plugin with a mocked LLM:

```js
test('provider export：公开 configured 和 generate，但不附加总结风格', async () => {
  const ctx = makeSite(topicHtml, 'https://linux.sb/topic/1', {
    style: '立场地图',
    customPrompt: '只总结旧功能',
  })
  await load(ctx)
  const provider = ctx.w.LSB.__core.plugins.get('ai-summary').exports
  assert.equal(provider.configured(), true)
  const out = await provider.generate({
    system: '你是帖子副驾。',
    user: '<forum-content>正文</forum-content>',
    timeout: 45000,
  })
  assert.equal(out.text, '【模型输出】')
  const body = JSON.parse(ctx.lastLlm().body)
  assert.equal(body.messages[0].content, '你是帖子副驾。')
  assert.equal(body.messages[1].content, '<forum-content>正文</forum-content>')
  assert.doesNotMatch(body.messages[0].content, /立场地图|旧功能/)
})

test('provider export：未配置端点或 Key 时 configured 返回 false', async () => {
  const ctx = makeSite(topicHtml, 'https://linux.sb/topic/1', { apiUrl: '', apiKey: '' })
  await load(ctx)
  const provider = ctx.w.LSB.__core.plugins.get('ai-summary').exports
  assert.equal(provider.configured(), false)
})
```

- [ ] **Step 2: Run the focused tests and verify they fail**

Run:

```bash
node --test test/ai-summary.test.js
```

Expected failure: `exports` is currently an empty object, so `provider.configured` is not a function.

- [ ] **Step 3: Extract a direct provider function**

Refactor the current `callLLM(content)` into an internal `generateModel({ system, user, timeout })` that:

1. keeps OpenAI/Anthropic detection and headers unchanged;
2. uses the passed `system` and `user` verbatim;
3. converts `timeout` to the existing `timeoutSec` fallback when omitted;
4. returns `{ text, meta: { model: cfg.model, ms } }`;
5. keeps `queue: false` and the current JSON/error parsing.

Keep `callLLM(content)` as a summary wrapper that builds the existing style prompt, appends `customPrompt`, calls `generateModel`, and returns only `.text`. This preserves the existing summary behavior.

At the end of `setup(api)`, return:

```js
return {
  configured: () => Boolean(String(cfg.apiUrl || '').trim() && String(cfg.apiKey || '').trim()),
  generate: ({ system, user, timeout } = {}) =>
    generateModel({ system: String(system || ''), user: String(user || ''), timeout }),
}
```

- [ ] **Step 4: Run the focused tests and verify they pass**

Run:

```bash
node --test test/ai-summary.test.js
```

Expected: all existing AI summary tests plus the two provider tests pass.

- [ ] **Step 5: Commit the provider boundary**

```bash
git add plugins/ai-summary.user.js test/ai-summary.test.js
git commit -m "feat: expose AI summary provider"
```

### Task 2: 建立副驾插件和主题上下文采集

**Files:**
- Create: `plugins/ai-copilot.user.js`
- Create: `test/ai-copilot.test.js`

**Interfaces:**
- `ai-copilot` manifest depends on `ai-summary` `^1.2.0`, runs on `topic`, and has permissions `read`, `storage`, `ui`, `events`.
- Internal `collectContext({ fetchAll, maxPages, maxChars }): Promise<Context>` returns:

```js
{
  topicId, title, forumName, views, replies,
  posts: [{ postId, floor, authorName, time, content }],
  meta: {
    floors, pagesFetched, pagesTotal, hasOp, range,
    chars, budget, truncated, hash,
  },
  text,
}
```

- `ai-copilot:debug` returns `{ collectContext, normalize, state, cacheKey }` for deterministic tests; this is a test/debug surface, not a user-facing API.

- [ ] **Step 1: Write failing context tests**

Create `test/ai-copilot.test.js` with helpers that load `dist/linuxsb-base.user.js`, `plugins/ai-summary.user.js`, and the new plugin against `test/fixtures/topic1.html`. Configure both plugin stores and mock external LLM responses.

Add tests for the live DOM and pagination rules:

```js
test('上下文：主楼使用 floor=0，回复保留楼层和作者', async () => {
  const ctx = makeSite(topicHtml, 'https://linux.sb/topic/1')
  const dbg = await load(ctx)
  const out = await dbg.collectContext({ fetchAll: false, maxPages: 15, maxChars: 12000 })
  assert.equal(out.meta.hasOp, true)
  assert.equal(out.posts.find((p) => p.floor === 0).postId, 1)
  assert.match(out.text, /\[楼主\]/)
  assert.match(out.text, /\[#\d+\]/)
})

test('上下文：分页视图没有主楼时不把第一条回复冒充主楼', async () => {
  const ctx = makeSite(noOpHtml(), 'https://linux.sb/topic/1?p=2')
  const dbg = await load(ctx)
  const out = await dbg.collectContext({ fetchAll: false, maxPages: 15, maxChars: 12000 })
  assert.equal(out.meta.hasOp, false)
  assert.doesNotMatch(out.text, /\[楼主\]/)
  assert.match(out.text, /未包含主楼/)
})

test('上下文：超长主楼和回复共同受预算约束', async () => {
  const ctx = makeSite(hugeOpHtml(), 'https://linux.sb/topic/1')
  const dbg = await load(ctx)
  const out = await dbg.collectContext({ fetchAll: false, maxPages: 15, maxChars: 6000 })
  assert.ok(out.text.length <= 6900)
  assert.equal(out.meta.truncated, true)
})
```

- [ ] **Step 2: Run the new tests and verify they fail**

Run:

```bash
node --test test/ai-copilot.test.js
```

Expected failure: the plugin file and `ai-copilot:debug` handler do not yet exist.

- [ ] **Step 3: Add the plugin manifest, configuration, and context collector**

Use a userscript header with `@version 0.1.0`. The manifest must declare:

```js
config: {
  fetchAll: { type: 'switch', label: '采集全部分页', default: false },
  maxPages: { type: 'number', label: '最多抓取页数', default: 15 },
  maxChars: { type: 'number', label: '送入模型的正文上限 (字符)', default: 12000 },
  sessionTurns: { type: 'number', label: '每帖会话轮数', default: 6 },
}
```

Implement `normalize(topic)` by copying only the fields above and sorting posts by `floor`. Implement `collectContext` using the current live `api.parse.topic(document)` first, then `api.net.pages` when `fetchAll` is true. Deduplicate by `postId`, identify only `floor === 0` as the OP, and allocate at most half of the budget to the OP as `ai-summary` does. Always include an explicit no-OP marker for page 2+ views.

For `hash`, use a deterministic 32-bit string over `topicId`, post IDs, floors, and content lengths/content prefixes. Include `meta.hash` in all later cache keys.

Register `ai-copilot:debug` and return the collector functions. Do not add UI or model calls in this task.

- [ ] **Step 4: Run the context tests and verify they pass**

Run:

```bash
node --test test/ai-copilot.test.js
```

Expected: all three context tests pass.

- [ ] **Step 5: Commit the collector foundation**

```bash
git add plugins/ai-copilot.user.js test/ai-copilot.test.js
git commit -m "feat: add AI copilot topic context"
```

### Task 3: 实现提示词、会话、缓存和模型请求

**Files:**
- Modify: `plugins/ai-copilot.user.js`
- Modify: `test/ai-copilot.test.js`

**Interfaces:**
- `buildRequest(mode, context, options): { system, user, fingerprint, meta }`
- `cacheKey(fingerprint, topicId): string`
- `run(mode, options): Promise<{ text, meta }>`
- `sessionFor(topicId): Array<{ role: 'user'|'assistant', content: string }>`

- [ ] **Step 1: Write failing prompt and request tests**

Add tests for all three modes:

```js
test('提示词：论坛正文与用户问题分区，并包含注入防护', async () => {
  const ctx = makeSite(topicHtml, 'https://linux.sb/topic/1')
  const dbg = await load(ctx)
  const req = dbg.buildRequest('ask', await dbg.collectContext({}), {
    question: '核心争议是什么？',
  })
  assert.match(req.system, /不可信|不要执行|forum-content/i)
  assert.match(req.user, /核心争议是什么？/)
  assert.match(req.user, /<forum-content>/)
})

test('提示词：草稿包含目标楼层、语气和长度约束', async () => {
  const ctx = makeSite(topicHtml, 'https://linux.sb/topic/1')
  const dbg = await load(ctx)
  const req = dbg.buildRequest('draft', await dbg.collectContext({}), {
    targetFloor: 12,
    tone: '技术向',
    length: '短',
  })
  assert.match(req.user, /#12/)
  assert.match(req.system, /技术向|短/)
  assert.match(req.system, /不要提交|草稿|回复/)
})

test('缓存：模式、问题、目标楼层、语气和内容变化都会换键', async () => {
  const ctx = makeSite(topicHtml, 'https://linux.sb/topic/1')
  const dbg = await load(ctx)
  const context = await dbg.collectContext({})
  const a = dbg.buildRequest('ask', context, { question: 'A' })
  const b = dbg.buildRequest('ask', context, { question: 'B' })
  const c = dbg.buildRequest('draft', context, { targetFloor: 12, tone: '技术向', length: '短' })
  assert.notEqual(a.fingerprint, b.fingerprint)
  assert.notEqual(a.fingerprint, c.fingerprint)
})
```

- [ ] **Step 2: Run the prompt tests and verify they fail**

Run:

```bash
node --test test/ai-copilot.test.js
```

Expected failure: `buildRequest` is not yet defined.

- [ ] **Step 3: Implement mode-specific prompt builders and cache/session state**

Implement three system prompt templates:

- `ask`: answer only from supplied context, cite floors when possible, state when the context is insufficient;
- `analyze`: obey the selected preset and return structured Markdown with floor citations;
- `draft`: write a reply draft to the selected floor, do not claim unverified facts, do not include meta commentary, and never submit it.

Every system prompt must include the same injection boundary instruction. Build the user content as:

```text
<task>
{question or preset instructions}
</task>
<forum-content>
{context.text}
</forum-content>
<conversation>
{last six session messages, only for ask mode}
</conversation>
```

For draft mode, include the selected target post in a separate `<target-post>` block and include the surrounding topic context in `<forum-content>`.

Compute `fingerprint` from a stable serialized object containing `topicId`, `meta.hash`, `mode`, `preset`, `question`, `targetFloor`, `tone`, `length`, `model`, `fetchAll`, `maxPages`, and `maxChars`. Store successful results at `c:<topicId>:<fingerprint>`, prune oldest records after 60. Store ask turns at `session:<topicId>`, prune to `cfg.sessionTurns` pairs.

- [ ] **Step 4: Implement request dedupe and provider delegation**

Obtain the dependency with `const provider = api.plugin('ai-summary')`. Before a request, check `provider.configured()` and show a configuration toast/open `ai-summary` if false. Use a `running` boolean plus request fingerprint to prevent a second in-flight call for the same topic. Call:

```js
const result = await provider.generate({
  system: request.system,
  user: request.user,
  timeout: undefined,
})
```

Write a cache record only after a non-empty response. Update the ask session only after success. Return `{ text, meta: { ...context.meta, ...result.meta, mode, preset, targetFloor, ts } }`.

- [ ] **Step 5: Run the prompt/request tests and verify they pass**

Run:

```bash
node --test test/ai-copilot.test.js
```

Expected: prompt boundary, mode-specific instructions, cache-key and provider request tests pass.

- [ ] **Step 6: Commit the model request layer**

```bash
git add plugins/ai-copilot.user.js test/ai-copilot.test.js
git commit -m "feat: add AI copilot prompts and cache"
```

### Task 4: 实现三模式副驾 UI

**Files:**
- Modify: `plugins/ai-copilot.user.js`
- Modify: `test/ai-copilot.test.js`

**Interfaces:**
- `openPanel()` creates/reuses `.lsb-copilot-panel` and `.lsb-copilot-mask`.
- `showResult(text, meta)` renders sanitized Markdown and metadata.
- `showError(message)` renders retry and close actions.
- `syncEntries()` owns the top link and OP action button.

- [ ] **Step 1: Write failing UI tests**

Add jsdom tests for entry points and mode switching:

```js
test('UI：帖子页显示副驾入口，首页不显示', async () => {
  const topic = makeSite(topicHtml, 'https://linux.sb/topic/1')
  await load(topic)
  assert.ok(topic.w.document.querySelector('.lsb-ai-copilot-top'))
  assert.ok([...topic.w.document.querySelectorAll('.lsb-op')].some((b) => /AI 副驾/.test(b.textContent)))

  const home = makeSite(homeHtml, 'https://linux.sb/')
  await load(home)
  assert.equal(home.w.document.querySelector('.lsb-ai-copilot-top'), null)
})

test('UI：问答发送后显示结果并保留复制按钮', async () => {
  const ctx = makeSite(topicHtml, 'https://linux.sb/topic/1')
  await load(ctx)
  ctx.w.document.querySelector('.lsb-ai-copilot-top').click()
  const panel = ctx.w.document.querySelector('.lsb-copilot-panel')
  panel.querySelector('[data-mode="ask"]').click()
  panel.querySelector('[data-question]').value = '核心争议是什么？'
  panel.querySelector('[data-send]').click()
  assert.ok(await until(() => ctx.w.document.querySelector('.lsb-copilot-result')))
  assert.ok(ctx.w.document.querySelector('[data-copy]'))
})

test('UI：草稿模式只提供复制，不提供发送站内回复动作', async () => {
  const ctx = makeSite(topicHtml, 'https://linux.sb/topic/1')
  await load(ctx)
  ctx.w.document.querySelector('.lsb-ai-copilot-top').click()
  const panel = ctx.w.document.querySelector('.lsb-copilot-panel')
  panel.querySelector('[data-mode="draft"]').click()
  assert.ok(panel.querySelector('[data-target-floor]'))
  assert.equal([...panel.querySelectorAll('button')].some((b) => /发送回复|提交回复/.test(b.textContent)), false)
})
```

- [ ] **Step 2: Run the UI tests and verify they fail**

Run:

```bash
node --test test/ai-copilot.test.js
```

Expected failure: the entry classes and panel do not yet exist.

- [ ] **Step 3: Implement the panel shell and entry points**

Use base UI classes already used by `ai-summary`: create one mask and one panel, close on `×` or mask click, and use `api.ui.postAction` only for the main post (`post-${api.page.id}`). Add the top link with `api.ui.topLink`, class `lsb-ai-copilot-top`, and remove it when `api.page.type !== 'topic'`.

The panel header must contain mode buttons with `data-mode="ask"`, `data-mode="analyze"`, and `data-mode="draft"`. Keep one active mode and redraw only the body when switching.

- [ ] **Step 4: Implement the ask and analyze forms**

Ask mode contains:

- a textarea with `data-question`;
- four quick-question buttons;
- a `data-send` button;
- a result container with `lsb-copilot-result`;
- a `data-copy` button after a result.

Analyze mode contains preset buttons for the six analysis prompts. Clicking a preset immediately calls `run('analyze', { preset })` after showing the collection/wait state.

Show context metadata in every result header. Use `renderMarkdown` from the existing plugin pattern or a local copy with the same escaping rules; never assign model text directly to `innerHTML`.

- [ ] **Step 5: Implement the draft form**

Draft mode contains:

- a `select[data-target-floor]` populated from normalized posts, with floor 0 labelled “主楼”;
- tone controls for `客观`, `简洁`, `友好`, `技术向`;
- length controls for `短`, `中`, `长`;
- generate, regenerate, copy and close actions.

The result view must not contain a reply-submit button or call any `api.actions.*` method. Clipboard failures show an error toast and leave the draft visible for manual selection.

- [ ] **Step 6: Run the UI tests and verify they pass**

Run:

```bash
node --test test/ai-copilot.test.js
```

Expected: entry, mode switching, result rendering, and draft-copy tests pass.

- [ ] **Step 7: Commit the UI**

```bash
git add plugins/ai-copilot.user.js test/ai-copilot.test.js
git commit -m "feat: add AI copilot panel"
```

### Task 5: 处理路由、并发、错误和停用清理

**Files:**
- Modify: `plugins/ai-copilot.user.js`
- Modify: `test/ai-copilot.test.js`
- Modify: `test/hardening.test.js`

**Interfaces:**
- `generation` is a monotonically increasing number captured by each `run()`; only the current generation may update the visible panel.
- `dispose()` clears UI, timers, button sets, session request state, and invalidates the generation.

- [ ] **Step 1: Write failing lifecycle tests**

Add tests for one in-flight request and stale route results:

```js
test('并发：同一主题重复点击只产生一个模型请求', async () => {
  const ctx = makeSite(topicHtml, 'https://linux.sb/topic/1')
  const dbg = await load(ctx)
  const release = ctx.holdLLM()
  void dbg.run('ask', { question: '问题' })
  await sleep(50)
  void dbg.run('ask', { question: '问题' })
  await sleep(50)
  assert.equal(ctx.llmCalls(), 1)
  release()
})

test('路由：旧主题请求完成后不覆盖新主题面板', async () => {
  const ctx = makeSite(topicHtml, 'https://linux.sb/topic/1')
  const dbg = await load(ctx)
  const release = ctx.holdLLM()
  void dbg.run('ask', { question: '旧主题' })
  await sleep(30)
  ctx.w.history.pushState({}, '', '/topic/2')
  ctx.w.LSB.bus.emit('route:changed', { href: ctx.w.location.href, page: { type: 'topic', id: 2 } }, { source: 'core' })
  release()
  await sleep(80)
  assert.equal(ctx.w.document.querySelector('.lsb-copilot-panel'), null)
})
```

Add a hardening test that opens the panel, starts a held request, calls `w.LSB.disable('ai-copilot')`, releases the request, and asserts the panel and `.lsb-copilot-mask` are gone and no timer keeps updating the DOM.

- [ ] **Step 2: Run lifecycle tests and verify they fail**

Run:

```bash
node --test test/ai-copilot.test.js test/hardening.test.js
```

Expected failure: duplicate requests remain possible and no disposal hook exists.

- [ ] **Step 3: Implement generation and in-flight guards**

At plugin setup, define `let generation = 0`, `let running = null`, and `let waitTimer = null`. `run()` stores `{ topicId, fingerprint, promise }` in `running`; an identical active request returns the existing promise and shows “正在处理中…”. On completion, only render when `generation` still matches and `api.page.id` equals the captured topic ID. Cache writes are allowed for the original topic even when the route changed.

Subscribe to `route:changed` to increment `generation`, close a visible panel for the old topic, clear button references, and resync the top link.

- [ ] **Step 4: Implement errors and cleanup**

Wrap collection and provider calls in `try/catch`. Normalize errors to short user-facing messages for missing config, timeout, non-2xx response, invalid JSON, empty model text, and clipboard failure. Error panels provide retry and close only.

Register one `api.onDispose()` callback that increments `generation`, clears `waitTimer`, removes panel and mask nodes, removes any plugin-created top link, and resets `running`/button references. Do not leave a `setInterval`, `setTimeout`, window listener, or pending UI mutation after disposal.

- [ ] **Step 5: Run lifecycle tests and verify they pass**

Run:

```bash
node --test test/ai-copilot.test.js test/hardening.test.js
```

Expected: concurrency, stale-route, error and disposal tests pass.

- [ ] **Step 6: Commit lifecycle hardening**

```bash
git add plugins/ai-copilot.user.js test/ai-copilot.test.js test/hardening.test.js
git commit -m "fix: harden AI copilot lifecycle"
```

### Task 6: 接入套件、文档和版本校验

**Files:**
- Modify: `suite/order.js`
- Modify: `build-suite.mjs`
- Modify: `test/suite.test.js`
- Modify: `README.md`

**Interfaces:**
- `ORDER` contains `ai-summary` immediately followed by `ai-copilot`.
- `ORDER_LTS` remains byte-for-byte the same member list.
- `build-suite.mjs` reports `SUITE_VERSION = '1.0.113'`.

- [ ] **Step 1: Write the membership/version assertions**

Extend `test/suite.test.js` member expectations with `ai-copilot`, assert its `@version` and manifest `version` are both `0.1.0`, assert its `manifest.id` is `ai-copilot`, and assert `ORDER_LTS` does not contain it. Add an assertion that `ai-summary` is listed before `ai-copilot`.

- [ ] **Step 2: Run suite tests and verify they fail**

Run:

```bash
node --test test/suite.test.js
```

Expected failure: the plugin is not registered and the expected version/member list is missing.

- [ ] **Step 3: Update suite order and version**

Insert `'ai-copilot'` after `'ai-summary'` in `suite/order.js`; leave `ORDER_LTS` unchanged. Set `SUITE_VERSION` to `1.0.113` in `build-suite.mjs`.

- [ ] **Step 4: Update README**

Add an official plugin row describing “帖子问答、讨论分析、回复草稿”, state that it depends on `ai-summary`, uses no write permission, and never auto-submits replies. Update the current Oxygen/LTS version text and module count to match the build output without changing the Hydrogen/Oxygen product names.

- [ ] **Step 5: Run suite tests and verify they pass**

Run:

```bash
node --test test/suite.test.js
```

Expected: registration, version alignment, source hygiene, and generated-parse checks pass.

- [ ] **Step 6: Commit integration metadata**

```bash
git add suite/order.js build-suite.mjs test/suite.test.js README.md
git commit -m "feat: ship AI copilot in Oxygen"
```

### Task 7: 构建、全量验证和交付检查

**Files:**
- Modify: generated `dist/linuxsb-base.user.js`, `dist/linuxsb-suite.user.js`, `dist/linuxsb-lts.user.js`
- Test: all `test/*.test.js`

- [ ] **Step 1: Build all userscripts**

Run:

```bash
npm run build
```

Expected output includes Hydrogen v0.1.41, Oxygen v1.0.113 with one additional module, and LTS generated without `ai-copilot`.

- [ ] **Step 2: Run focused regression tests against generated output**

Run:

```bash
node --test test/ai-summary.test.js test/ai-copilot.test.js test/hardening.test.js test/suite.test.js
```

Expected: PASS with no unhandled rejection or pending timer warnings.

- [ ] **Step 3: Run the complete test suite**

Run:

```bash
npm test
```

Expected: all existing and new tests pass.

- [ ] **Step 4: Inspect the final diff**

Run:

```bash
git status --short
git diff --stat HEAD~7..HEAD
git diff --check HEAD~7..HEAD
```

Confirm that only the AI provider, AI copilot, tests, suite metadata, README, design/plan documents, and generated `dist` files changed in the feature commits. Confirm no API Key, fixture secrets, or `write` permission was added.

- [ ] **Step 5: Commit generated artifacts and verification result**

```bash
git add dist/linuxsb-base.user.js dist/linuxsb-suite.user.js dist/linuxsb-lts.user.js
git commit -m "build: generate AI copilot userscripts"
```

Report the exact `npm test` and `npm run build` results before claiming completion.

## Plan Self-Review

- Spec coverage: provider export is Task 1; context and budget are Task 2; prompts, cache and session are Task 3; all three UI modes are Task 4; routing, concurrency, errors and disposal are Task 5; suite/docs/version requirements are Task 6; build and full verification are Task 7.
- Placeholder scan: no placeholder marker or unspecified validation step is used in the tasks.
- Interface consistency: `generate({ system, user, timeout })` and its `{ text, meta }` result are defined in Task 1 and consumed unchanged in Task 3; `collectContext` and `buildRequest` signatures are defined before UI and lifecycle tasks consume them.
- Scope check: cross-topic memory, embedding, automation, external search and auto-posting remain explicitly outside this plan.
