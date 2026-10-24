# AI Sidebar Conversation Workbench Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Replace the AI sidebar's separate console/topic/tracking pages with one local conversation stream that dispatches existing AI capabilities and shows verifiable processing summaries.

**Architecture:** Keep the sidebar host and `ai-copilot` as the owners of existing model, evidence, and action logic. Extend `ai-copilot` with sanitized progress events; make `ai-workbench` own one chat stream, safe capability/context selection, and bounded local conversation history. Keep site-action plans reviewable and explicitly confirmed before execution.

**Tech Stack:** Standalone JavaScript userscripts, LSB plugin API, `api.store` local storage, CSS, JSDOM, Node `node:test`, and the existing esbuild suite pipeline.

## Global Constraints

- Keep the existing Hydrogen right sidebar entry and its narrow-screen/top-bar fallback.
- The AI sidebar uses one message stream and a bottom composer; model calls and results stay in that stream.
- Show only actual processing stages, safe local scope summaries, validation outcomes, and verified evidence. Never display or persist private model chain-of-thought.
- Persist at most 20 conversations, 10 turns per conversation, and 1 MiB total. Limit input to 500 characters, persisted answers to 4,000 characters, and processing summaries to 6 entries of at most 200 characters each.
- Persist only local conversation data, capability, allowlisted context fingerprints, safe stage summaries, and verified reference IDs. Never persist API keys, cookies, CSRF values, raw URL query strings, full DOM, or unapproved full post text.
- Keep existing `read`, `storage`, `ui`, and `events` permissions. Do not add `write`, external `net`, or `admin` permissions.
- Natural-language site actions remain preview-first and require an explicit user confirmation. They cannot reply, like, favorite, check in, post, or change tracking state.
- Route changes, session switches, and plugin disposal must prevent stale asynchronous results from updating the visible conversation.
- Keep `ai-workbench` in Oxygen and out of LTS. Generate `dist/` only with `npm run build`.

## File Structure and Responsibilities

- **Modify:** `plugins/ai-copilot.user.js`
  - Emit bounded, allowlisted `onProgress` events from topic and console flows; preserve existing `onStage` compatibility and all existing model, query, citation, and action validation logic.
- **Modify:** `plugins/ai-workbench.user.js`
  - Own conversation normalization/storage, conversation switching and clearing, capability/context menus, composer, message stream, progress summaries, and async result isolation. Retain safe site-action preview/execute behavior.
- **Modify:** `test/ai-copilot.test.js`
  - Verify progress callbacks reflect actual topic/query work and contain no model prompt, credential, or full page content.
- **Modify:** `test/ai-workbench.test.js`
  - Verify one-stream rendering, capability routing, local history, safety boundaries, bounds, and stale-response isolation through the real userscript and local storage.
- **Modify:** `docs/superpowers/specs/2026-10-01-ai-sidebar-conversation-workbench-design.md`
  - Change the document status from awaiting review to confirmed/in implementation, then record any implementation detail that changes without changing the approved UX or safety boundary.
- **Modify:** `plugins/ai-copilot.user.js`, `plugins/ai-workbench.user.js`, `build-suite.mjs`, `suite/suite-center.js`
  - Align userscript and manifest versions; bump the Oxygen suite version for the release.
- **Modify:** `README.md`
  - Describe the single-stream sidebar, local history controls, available capabilities, and safe processing timeline.
- **Generated:** `dist/linuxsb-base.user.js`, `dist/linuxsb-suite.user.js`, `dist/linuxsb-lts.user.js`
  - Regenerate and validate after source and version updates.

---

### Task 1: Add Safe Processing Events to Existing AI Flows

**Files:**
- Modify: `plugins/ai-copilot.user.js`
- Test: `test/ai-copilot.test.js`

**Interfaces:**
- Consumes: Existing `runConsoleQuery({ question, force, onStage })` and `runTopic(mode, options)`.
- Produces: Optional `onProgress(event)` callback where `event` is `{ stage, state, summary }`; `stage` is one of `understand`, `context`, `plan`, `local`, `answer`, or `evidence`, `state` is one of `active`, `complete`, or `failed`, and `summary` is a local string capped at 200 characters. Keep existing `onStage(stage)` behavior unchanged.

- [x] **Step 1: Add failing behavior tests.**

Add a topic-query test that calls the real `runTopic('ask', { question, onProgress })` against the fixture topic and a controlled model response containing a real floor citation. Assert the events show context reading before answer generation, then citation validation after the response; assert the citation summary distinguishes verified and unverified floors. Add a console-query test with controlled plan/answer JSON and assert only the fixed stages and bounded local summaries are emitted. Assert no event contains the API key, request prompt, or full post body.

- [x] **Step 2: Run the focused tests and verify they fail for the missing callback behavior.**

Run: `node --test --test-name-pattern="处理记录|进度事件" test/ai-copilot.test.js`

Expected: the tests fail because topic flows do not emit `onProgress`, and console flows emit only the legacy stage string.

- [x] **Step 3: Add the smallest progress-event helper and emit events at real boundaries.**

Add a local `emitProgress(options, stage, state, summary)` helper that validates stage/state, truncates summaries to 200 characters, and ignores callback exceptions. Emit context completion only after `collectContext` or `consoleContext` returns; emit local filtering only after `executeConsolePlan`; emit evidence completion only after citation matching. Keep summaries limited to counts, page/floor scope, and validation counts. Call the old `onStage` at the same plan/local/answer boundaries it uses today.

- [x] **Step 4: Run the focused tests and relevant copilot suite.**

Run: `node --test --test-name-pattern="处理记录|进度事件" test/ai-copilot.test.js`

Expected: the new tests pass and report no private prompt or page body in progress events.

Run: `node --test test/ai-copilot.test.js`

Expected: 0 failures; existing `onStage` consumers remain compatible.

---

### Task 2: Add Bounded Local Conversation History

**Files:**
- Modify: `plugins/ai-workbench.user.js`
- Test: `test/ai-workbench.test.js`

**Interfaces:**
- Consumes: `api.store` and the existing `action-history` store key.
- Produces: A versioned `conversations` store record shaped as `{ version: 1, activeId, conversations }`; each conversation is `{ id, title, createdAt, updatedAt, turns }`; each turn is `{ id, createdAt, capability, context: { kind, routeType, topicId }, question, answer, state, phases, citations, truncation }`. `phases` contains only `{ stage, state, summary }`, and citations contain only verified `{ topicId, floor, issueId, postId }` IDs. The existing action history remains separate.

- [x] **Step 1: Add failing integration tests for history controls and normalization.**

Test that the AI view offers create, recent-conversation selection, and clear-history controls; creating a conversation persists locally and switching updates the persisted active conversation; clearing removes conversation history but preserves the separate action history. Seed malformed history and assert unknown fields are discarded. Task 3 verifies that switching also restores the saved message stream; Task 4 covers all numeric bounds.

- [x] **Step 2: Run the focused tests and verify they fail on the current segmented view.**

Run: `node --test --test-name-pattern="对话历史|新对话|清空历史" test/ai-workbench.test.js`

Expected: FAIL because the current view has no conversation controls or conversation store.

- [x] **Step 3: Implement storage normalization and bounded history operations.**

Add `normalizeConversationHistory`, `loadConversationHistory`, `saveConversationHistory`, `createConversation`, and `clearConversationHistory` inside `ai-workbench`. Normalize capability IDs against the fixed capability list; allow context kinds `current-page`, `current-topic`, and `active-tracking`; allow only known route types; keep `topicId` a positive integer or zero; keep citations to verified numeric IDs; strip all unknown fields. Apply per-input, per-answer, per-summary, per-conversation, and total-storage limits before writing. Use the existing namespaced `api.store`; do not read or write browser-wide storage directly.

- [x] **Step 4: Run focused history tests and the workbench test file.**

Run: `node --test --test-name-pattern="对话历史|新对话|清空历史" test/ai-workbench.test.js`

Expected: history opens, switches, clears, and normalizes within all stated limits.

Run: `node --test test/ai-workbench.test.js`

Expected: 0 failures; existing action-history behavior remains intact.

---

### Task 3: Replace Segmented Views with One Conversation Stream

**Files:**
- Modify: `plugins/ai-workbench.user.js`
- Test: `test/ai-workbench.test.js`

**Interfaces:**
- Consumes: Task 1 `onProgress`, Task 2 conversation history operations, and current `copilot.runConsoleQuery`, `copilot.runTopic`, `copilot.planActions`, `copilot.trackingOverview`, and `copilot.openPanel` APIs.
- Produces: A single `[data-ai-chat-messages]` list and fixed `[data-ai-chat-composer]` containing `[data-ai-chat-input]`, `[data-ai-chat-mode]`, `[data-ai-chat-context]`, `[data-ai-chat-send]`, a visible read-only status, and current-model/settings link. Capability IDs are `ask`, `topic-ask`, `disagreement`, `comparison`, `unresolved`, `new-replies`, `draft`, `tracking`, and `site-action`. Context IDs are `current-page`, `current-topic`, and `active-tracking`.

- [x] **Step 1: Add failing tests for the unified message stream and capability routing.**

Assert the view no longer presents separate console/topic/tracking tabs; the message list and composer remain in one AI view; `Enter` submits while `Shift+Enter` inserts a newline; selecting `comparison` calls the existing topic analysis with preset `方案对比`; selecting `tracking` uses the existing read-only console query with `scope: 'active-tracking'`; and every result appears as an assistant message in the same conversation. Add a failing copilot test proving `scope: 'active-tracking'` drops current-topic posts even when a model plan requests them. Add a site-action test proving plan generation adds a reviewable assistant message but does not execute any action until the existing explicit execute button is clicked. Verify the visible model label comes from `providerState()` and opens `ai-summary` settings, and that the active read-only scope never displays site-write capabilities.

- [x] **Step 2: Run the focused tests and verify the segmented UI fails them.**

Run: `node --test --test-name-pattern="统一消息流|能力菜单|同一会话|只读动作" test/ai-workbench.test.js`

Expected: FAIL because the current UI exposes section tabs and per-section forms.

- [x] **Step 3: Implement the shared composer, capability dispatcher, and message renderer.**

Replace `mountState`, `renderConsole`, `renderTopic`, and `renderTracking` as primary navigation with one message list and a bottom composer. Add an `@` context selector with only currently available options and a `/` capability selector. Default `@` to `current-topic` on topic routes and `current-page` on other routes. `ask` with `active-tracking` context calls `runConsoleQuery({ scope: 'active-tracking' })`; `ask` with `current-topic` calls `runTopic('ask')`; `ask` with `current-page` uses the current topic flow when the route is a topic and otherwise uses `runConsoleQuery`. `topic-ask`, `disagreement`, `comparison`, `unresolved`, `new-replies`, and `draft` require the current topic and dispatch to `runTopic` with modes `ask`, `analyze`, `analyze`, `analyze`, `digest`, and `draft`; map analysis presets to `观点分歧`, `方案对比`, and `未解决问题`. `tracking` always uses `runConsoleQuery({ scope: 'active-tracking' })`; `site-action` uses `planActions`. Preserve copy, verified citation links, retry, and explicit action-confirmation controls in message cards. Show the current model from `providerState()` and open the existing AI settings panel when its label is clicked. Reject text over 500 Unicode characters with a visible local validation message.

Extend `runConsoleQuery` to accept `scope: 'active-tracking'`. Include this scope in the plan fingerprint, and force `includeCurrentTopic` to false in local plan normalization so a model plan cannot widen the selected context. Keep the default scope behavior unchanged.

Render progress events as an expandable per-message timeline while a request is running. For site actions show intent recognition, plan generation, local validation, confirmation waiting, and action execution from actual local states. Once complete, keep a short stage summary visible and place scope, validation, and verified references behind a details disclosure. Never label an event complete before its callback confirms the local step completed. Keep the composer fixed below the scrollable message list. Show the route-specific context hint without exposing URL query parameters.

- [x] **Step 4: Run focused routing and stream tests, then the workbench suite.**

Run: `node --test --test-name-pattern="统一消息流|能力菜单|同一会话|只读动作" test/ai-workbench.test.js`

Expected: all capabilities render in one stream and site-action execution still waits for explicit confirmation.

Run: `node --test test/ai-workbench.test.js`

Expected: 0 failures.

---

### Task 4: Enforce Limits, Privacy, and Request Isolation

**Files:**
- Modify: `plugins/ai-workbench.user.js`
- Test: `test/ai-workbench.test.js`

**Interfaces:**
- Consumes: Task 2 normalized conversations and Task 3 request/session IDs.
- Produces: Each request bound to its source conversation, assistant message, route fingerprint, and render generation; stale completions cannot update another conversation or route.

- [x] **Step 1: Add failing tests for exact storage ceilings and stale completions.**

Submit text containing a URL query secret, then complete an answer with a floor citation; assert the persisted JSON contains no query secret, credentials, cookies, CSRF values, or raw post body. Seed more than 20 sessions, more than 10 turns, a response over 4,000 characters, more than six progress events, and enough data to exceed 1 MiB; assert the normalized stored result respects every cap and retains the latest submitted turn. Use a deferred model promise, switch conversation and then route before it resolves, and assert the old response is absent from the newly visible conversation.

- [x] **Step 2: Run the privacy and race tests and verify they fail against the current UI.**

Run: `node --test --test-name-pattern="历史上限|本地历史不保存|旧请求不能|路由变化" test/ai-workbench.test.js`

Expected: FAIL because there is no message-bound session history or unified-request generation guard.

- [x] **Step 3: Add request identity guards and enforce canonical persistence.**

Capture `conversationId`, `messageId`, safe route fingerprint, and generation at submit. Before every UI update, verify the plugin is active, the host is connected, the current conversation and message still match, and the route generation is unchanged. When the user switches conversations, a still-valid response may update only its original conversation and must not render into the selected one. When the route changes, mark the pending turn stale in its original conversation, ignore its later result, and expire any unexecuted site-action plan. Keep raw routes only in memory; serialize only the allowlisted fingerprint. Persist only bounded answer text, fixed stage summaries, mode/context IDs, and verified reference IDs; mark truncation in the UI.

- [x] **Step 4: Run privacy, boundary, race, and all workbench tests.**

Run: `node --test --test-name-pattern="历史上限|本地历史不保存|旧请求不能|路由变化" test/ai-workbench.test.js`

Expected: all size ceilings and stale-result checks pass.

Run: `node --test test/ai-workbench.test.js`

Expected: 0 failures.

---

### Task 5: Align Documentation, Versions, and Distribution

**Files:**
- Modify: `docs/superpowers/specs/2026-10-01-ai-sidebar-conversation-workbench-design.md`
- Modify: `plugins/ai-copilot.user.js`
- Modify: `plugins/ai-workbench.user.js`
- Modify: `build-suite.mjs`
- Modify: `suite/suite-center.js`
- Modify: `README.md`
- Modify: `test/suite.test.js`
- Generated: `dist/*.user.js`

**Interfaces:**
- Consumes: Tasks 1–4 source behavior.
- Produces: Version-aligned standalone plugins and Oxygen artifacts with the conversation workbench; LTS continues to omit all AI plugins.

- [x] **Step 1: Add a failing suite-level test for the new plugin versions and preserved distribution boundaries.**

Extend `test/suite.test.js` to assert the aligned userscript/manifest versions for the changed AI modules, Oxygen contains the single-stream workbench source, and LTS does not contain `ai-workbench` or `ai-copilot`.

- [x] **Step 2: Run the focused suite test and verify it fails before the version updates.**

Run: `node --test test/suite.test.js`

Expected: the version expectation fails against the current plugin and suite versions.

- [x] **Step 3: Update documentation and versions, then rebuild all distribution artifacts.**

Set `ai-copilot` to `0.7.1`, `ai-workbench` to `0.3.0`, and the Oxygen suite to `1.0.121` in both `build-suite.mjs` and `suite/suite-center.js`. Update the approved spec status and README feature description. Run `npm run build` to regenerate the three dist files.

- [x] **Step 4: Run the focused suite test and distribution freshness check.**

Run: `node --test test/suite.test.js`

Expected: 0 failures.

Run: `npm run verify:dist`

Expected: `dist 新鲜度通过` with the aligned Hydrogen/Oxygen/LTS versions.

---

### Task 6: Full Verification and Plan Review

**Files:**
- Modify: `docs/superpowers/plans/2026-10-01-ai-sidebar-conversation-workbench.md`

- [x] **Step 1: Run the complete test suite and production build.**

Run: `npm test`

Expected: 0 failures.

Run: `npm run build`

Expected: Hydrogen, Oxygen, and LTS artifacts build successfully.

Run: `npm run verify:dist`

Expected: `dist 新鲜度通过`.

- [x] **Step 2: Review spec coverage and the final diff.**

Check every acceptance criterion in `docs/superpowers/specs/2026-10-01-ai-sidebar-conversation-workbench-design.md` against the implementation and tests. Run `git diff --check` and scan this plan for placeholders. Record actual test/build results below; do not mark a task complete without fresh command output.

## Verification Record

Implemented on `feat/shell-spa-click`.

- `npm test`: 541 tests passed, 0 failed.
- `npm run build`: Hydrogen 0.1.43, Oxygen 1.0.121, and LTS 1.0.121 artifacts built.
- `npm run verify:dist`: passed for all 23 Oxygen modules.
- `git diff --check`: passed.
- Fixed a month-boundary assumption in the existing check-in calendar test: when yesterday falls in the prior month, the test navigates to that month before checking its recorded days. The check-in plugin itself was unchanged.
