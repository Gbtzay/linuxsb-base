# AI 副驾 0.2 与产物发布完整性实施计划

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:executing-plans (recommended) to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 固化 Oxygen/LTS 产物与源码的一致性，并为 AI 帖子副驾增加楼层证据和新回复摘要。

**Architecture:** `ai-copilot` 继续通过 `ai-summary` 的窄 provider 调用模型。楼层证据由本地上下文映射生成，不信任模型 URL；新回复由 `topic:posts-added` 与本地主题游标维护，只有用户主动点击时才调用模型。发布检查独立于构建器，读取源码、产物和套件成员清单做一致性校验。

**Tech Stack:** Tampermonkey userscripts、原生 JavaScript、Node `node:test`、jsdom、esbuild、PowerShell/Node 文件校验。

## Global Constraints

- `ai-copilot` 权限保持 `read`、`storage`、`ui`、`events`，不增加 `net` 或 `write`。
- `ai-copilot` 版本为 `0.2.0`；Oxygen/LTS 版本为 `1.0.114`；Hydrogen 保持 `0.1.41`。
- `dist/` 只能由 `npm run build` 生成；不得手工修改生成内容。
- 首访主题建立新回复起点，不把已有历史楼层误报为新回复。
- 模型失败时不推进新回复游标、不清空待处理队列。
- 引用链接只能由本地主题/楼层解析结果构造；模型输出 URL 不得直接进入 DOM。

## Task 1: 建立产物新鲜度检查

**Files:**
- Create: `scripts/check-dist.mjs`
- Modify: `package.json`
- Test: `test/suite.test.js`

**Interfaces:**
- `npm run verify:dist` exits 0 only when source versions, ORDER, Oxygen and LTS dist contents agree.
- `scripts/check-dist.mjs` accepts no arguments and prints each checked artifact.

- [ ] **Step 1: Write the failing freshness test**

Add a suite test that extracts each ordered plugin body after its userscript header and asserts that the exact body occurs in `dist/linuxsb-suite.user.js`. Also assert the generated banner version equals the `suite-center.js` version and that `dist/linuxsb-lts.user.js` excludes `id: 'ai-copilot'`.

- [ ] **Step 2: Run the focused test and verify the failure**

Run:

```bash
node --test test/suite.test.js
```

Expected: the new test fails because the current suite test only checks a marker and does not prove the complete plugin body is present.

- [ ] **Step 3: Implement the check script**

Read `suite/order.js` by importing it, strip each plugin header with the same regular expression used by `build-suite.mjs`, and check:

```js
if (!suiteCode.includes(body.trim())) fail(`${id} source body missing from Oxygen`)
if (suiteVersion !== centerVersion) fail('suite banner and suite center differ')
if (ltsCode.includes("id: 'ai-copilot'")) fail('LTS contains ai-copilot')
```

Also compare Hydrogen `@version` to the `VERSION = '…'` literal in `src/core.js` and LTS `@version` to Oxygen `@version`.

- [ ] **Step 4: Add the npm entry**

Add:

```json
"verify:dist": "node scripts/check-dist.mjs"
```

- [ ] **Step 5: Run the test and command**

Run:

```bash
node --test test/suite.test.js
npm run verify:dist
```

Expected: both exit 0 and list Hydrogen, Oxygen and LTS checks.

## Task 2: 引用楼层映射

**Files:**
- Modify: `plugins/ai-copilot.user.js`
- Modify: `test/ai-copilot.test.js`

**Interfaces:**
- `citations(text, posts, topicId)` returns citation records with `floor`, `postId`, `authorName`, `excerpt`, `href`, and `known`.
- `buildRequest()` adds the citation format rule and a `citationVersion` field to its fingerprint.
- Cached records store `meta.citations`.

- [ ] **Step 1: Write failing citation tests**

Add tests for a model answer containing `[#0]` and `[#12]`: the result panel must render a `data-citation-floor="12"` link whose href ends in `#post-13`, and the original text copied by `[data-copy]` must still contain the literal `[#12]`. Add a second test for `[#999]` that renders an unknown citation label without creating an external link.

- [ ] **Step 2: Run focused tests and confirm failure**

Run:

```bash
node --test test/ai-copilot.test.js
```

Expected: no citation block is rendered and `citations` is not exposed by the debug surface.

- [ ] **Step 3: Implement citation extraction**

Use a strict regular expression for `[#N]`, deduplicate floors in first-seen order, find matching posts by numeric floor, and construct the href from `api.routes.topic(topicId)` plus `#post-${postId}`. Limit excerpts to 120 characters and pass them through `esc` only at render time.

- [ ] **Step 4: Store and render citations**

When `run()` receives model text, attach `citations(result.text, context.posts, context.topicId)` to `record.meta`. Render a “引用楼层” section below the Markdown result. For `known: false`, use a text span instead of an anchor. Keep `[data-copy]` wired to `record.text`.

- [ ] **Step 5: Run the focused tests**

Run:

```bash
node --test test/ai-copilot.test.js
```

Expected: citation links, unknown-floor handling, copied raw text, and all existing copilot tests pass.

## Task 3: 新回复状态与摘要请求

**Files:**
- Modify: `plugins/ai-copilot.user.js`
- Modify: `test/ai-copilot.test.js`

**Interfaces:**
- `digestState(topicId)` returns `{ floor, pending, ts }` or an empty state.
- `pendingReplies(topicId, posts)` synchronizes the local cursor with posts currently available and returns normalized pending posts.
- `markDigestRead(topicId, posts)` sets the cursor to the highest available floor and clears pending.
- `buildRequest('digest', context, { newPosts })` sends only a `<new-replies>` block for the new content.

- [ ] **Step 1: Write failing queue tests**

Add tests that verify:

1. first initialization with existing floors creates a cursor and zero pending posts;
2. `topic:posts-added` with floor 13 creates one pending item;
3. `buildRequest('digest', …)` contains `<new-replies>` and does not include an old reply body;
4. a successful digest clears pending items and advances the cursor;
5. a provider error leaves pending items intact.

- [ ] **Step 2: Run focused tests and confirm failure**

Run:

```bash
node --test test/ai-copilot.test.js
```

Expected: `digestState`/`pendingReplies` are missing and the digest mode is rejected.

- [ ] **Step 3: Implement local cursor storage**

Store one record under `digest:<topicId>`, cap `pending` at 100, deduplicate by `postId` then floor, and never advance `floor` while a request is failing. Seed the first cursor from the highest current floor.

- [ ] **Step 4: Subscribe to live topic additions**

Register `api.on('topic:posts-added', …)` and add only events whose page is the current topic. On `route:changed`, seed or synchronize the new topic. During `run('digest')`, synchronize again so fetched pages are included even when no live event was emitted.

- [ ] **Step 5: Add the digest prompt and success commit**

For `mode === 'digest'`, use a system instruction that says only the `<new-replies>` block is new and that every factual claim should cite `[#N]`. The user content includes topic title/forum metadata and the normalized pending posts, excluding the old `context.text`. After `provider.generate()` returns non-empty text, write the record, then call `markDigestRead()`.

- [ ] **Step 6: Run focused tests**

Run:

```bash
node --test test/ai-copilot.test.js
```

Expected: queue, prompt, success and failure retention tests pass.

## Task 4: 新回复模式界面

**Files:**
- Modify: `plugins/ai-copilot.user.js`
- Modify: `test/ai-copilot.test.js`

**Interfaces:**
- The panel has a `data-mode="digest"` tab labelled `新回复`.
- The mode displays pending count/range, a `data-new-send` button when pending exists, and a `data-new-mark` button to set the current floor as the new cursor.

- [ ] **Step 1: Write failing UI tests**

Add tests that open the panel, select `新回复`, assert the initial empty state, emit a new post, assert the pending count, click `data-new-send`, and verify the result contains the citation section. Add a test that clicks `data-new-mark` and verifies pending state is empty without an LLM call.

- [ ] **Step 2: Run focused tests and confirm failure**

Run:

```bash
node --test test/ai-copilot.test.js
```

Expected: the tab and controls do not exist.

- [ ] **Step 3: Implement the mode renderer**

Add the tab, `renderDigest()`, and the two actions. Keep the mode read-only; no reply form mutation or `api.actions.reply` call is allowed.

- [ ] **Step 4: Refresh the mode on live events**

When pending posts arrive while the panel is open in digest mode and no request is running, refresh only the digest view. Route changes still close the panel and increment the request generation.

- [ ] **Step 5: Run the focused tests**

Run:

```bash
node --test test/ai-copilot.test.js
```

Expected: all focused tests pass.

## Task 5: Version, docs, build and full verification

**Files:**
- Modify: `plugins/ai-copilot.user.js`
- Modify: `build-suite.mjs`
- Modify: `suite/suite-center.js`
- Modify: `suite/order.js`
- Modify: `test/suite.test.js`
- Modify: `README.md`
- Modify: `docs/CONVENTIONS.md`
- Modify: `docs/功能征集-rc-ga.md`
- Modify: `docs/已知问题-rc.md`
- Modify: `docs/测试招募-氢氧-beta.md`
- Generated: `dist/linuxsb-base.user.js`, `dist/linuxsb-suite.user.js`, `dist/linuxsb-lts.user.js`

- [ ] **Step 1: Bump versions and update descriptions**

Set `ai-copilot` header/manifest to `0.2.0`, `SUITE_VERSION` and suite manifest to `1.0.114`, and make all user-facing version references agree. Keep Hydrogen at `0.1.41` and keep `ORDER_LTS` unchanged.

- [ ] **Step 2: Build the three artifacts**

Run:

```bash
npm run build
```

Expected: Hydrogen `0.1.41`, Oxygen `1.0.114`, LTS `1.0.114`; Oxygen contains the new copilot code and LTS does not.

- [ ] **Step 3: Run release checks and focused tests**

Run:

```bash
npm run verify:dist
node --test test/ai-copilot.test.js test/suite.test.js
```

- [ ] **Step 4: Run the complete test suite**

Run:

```bash
npm test
git diff --check
```

Expected: all tests pass and diff check reports no errors.

- [ ] **Step 5: Review commit grouping**

Before committing, inspect `git diff --name-only` and keep the existing site/skin/topic-marks changes intact. Commit source changes separately from generated dist when possible, then commit the generated artifacts and release metadata together so the published tree contains the tested files.
