# Extended Routes and Write Adapter Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use `superpowers:executing-plans` to execute this plan task-by-task. The user prohibits subagents; execute inline. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Extend the read-only runtime to remaining route families and migrate site writes one action at a time through ActionBroker without changing server protocols.

**Architecture:** Community/settings adapters first expose read-only models. Each write adapter declares a fixed action schema, reads the current native form or model target, asks the user for confirmation, submits once through ActionBroker and performs a read-only result check. The new renderer never constructs an arbitrary POST body.

**Tech Stack:** JavaScript ES modules, existing site routes and action providers, JSDOM fixtures, node:test, Playwright.

**Spec:** `docs/superpowers/specs/2026-10-05-full-runtime-ui-rebuild-design.md`

## Global Constraints

- Platform release floor is base `0.3.0`; skin/suite/LTS floor is `2.3.0`.
- Keep server endpoints, CSRF fields and response semantics unchanged.
- One explicit user confirmation and one non-idempotent request per write intent.
- Unknown results get a read-only check and never a POST retry.
- Do not persist raw CSRF, credentials, target scope nonces or full write bodies in history/export.

---

### Task 1: Add read-only adapters for remaining route families

**Files:**
- Create: `src/reader/renderers/community.js`
- Create: `src/reader/renderers/settings.js` extensions
- Modify: `src/reader/route-catalog.js`, `src/reader/model.js`
- Create: `test/reader-community-pages.test.js`

- [ ] **Step 1: Add route records.** Cover collections, featured, footprint, forum list, profile, notifications, messages, leaderboard, wallet, identity, promotions, check-in, gacha and settings paths listed in `src/site.js`.
- [ ] **Step 2: Add fixture models.** For each route family, include title, sections, links, pagination and read-only status; missing selectors must return a safe native fallback.
- [ ] **Step 3: Implement generic section/card renderer.** Render only validated headings, paragraphs, links, tables/lists and media descriptors; preserve original route links.
- [ ] **Step 4: Run community tests.** Run `node --test test/reader-community-pages.test.js test/reader-route-catalog.test.js`.

### Task 2: Define write action descriptors and confirmation UI

**Files:**
- Create: `src/reader/write-descriptors.js`
- Create: `src/reader/write-form.js`
- Create: `test/reader-write-descriptors.test.js`
- Modify: `src/reader/surface-host.js`

**Interfaces:**
```js
registerWriteDescriptor({ id, routeTypes, fields, target, summarize, submit, check })
prepareWrite(model, descriptorId, input) -> PendingAction
renderConfirmation(pending) -> HTMLElement
```

- [ ] **Step 1: Add descriptor tests.** Unknown fields, arbitrary URLs, missing target scope, invalid lengths and missing CSRF capability fail before confirmation.
- [ ] **Step 2: Implement schema descriptors.** Define reply, topic, favorite, like/coin, attachment and check-in fields using fixed site routes and local validators.
- [ ] **Step 3: Implement confirmation cards.** Show target, summary, side effects, pending/unknown/failure states and a single confirm button; never show raw token values.
- [ ] **Step 4: Add cancel/stop behavior.** Cancel removes pending intent; stopping the runtime aborts before submit and restores focus.
- [ ] **Step 5: Run descriptor tests.** Run `node --test test/reader-write-descriptors.test.js`.

### Task 3: Migrate reply and new-topic actions

**Files:**
- Create: `src/reader/write/reply.js`
- Create: `src/reader/write/topic.js`
- Modify: `src/site.js` only for fixed field extraction helpers
- Test: `test/reader-write-reply.test.js`, `test/reader-write-topic.test.js`

- [ ] **Step 1: Add native form extraction tests.** Verify topic ID, post ID, CSRF presence, action path and body field are read from the current page/form.
- [ ] **Step 2: Implement reply adapter.** Create a fixed `ActionIntent`, require current topic scope, confirm once, submit `/reply_edit` through ActionBroker and verify the new floor or server success response.
- [ ] **Step 3: Implement topic adapter.** Read `/topic_edit` form fields, enforce title/body limits, confirm once, submit through ActionBroker and route to the returned topic only after success.
- [ ] **Step 4: Add unknown-result checks.** Re-read the topic/list to determine whether the reply/topic exists; never submit a second time.
- [ ] **Step 5: Run write tests.** Run `node --test test/reader-write-reply.test.js test/reader-write-topic.test.js`.

### Task 4: Migrate favorite, like, coin, attachment and check-in actions

**Files:**
- Create: `src/reader/write/reactions.js`
- Create: `src/reader/write/attachment.js`
- Create: `src/reader/write/checkin.js`
- Modify: `plugins/ai-write-actions.user.js`, `plugins/checkin-calendar.user.js` through their new action registration path
- Test: `test/reader-write-reactions.test.js`, `test/reader-write-attachment.test.js`, `test/reader-write-checkin.test.js`

- [ ] **Step 1: Add target-state tests.** Re-read local topic/post state before confirmation; reject stale floor, changed target or unavailable coin tiers.
- [ ] **Step 2: Implement favorite adapter.** Submit once to the fixed favorite route and confirm state by GET/form state, not by trusting model text.
- [ ] **Step 3: Implement like/coin adapter.** Use only site-provided target key and coin tiers, submit once and compare returned/current counters.
- [ ] **Step 4: Implement attachment adapter.** Validate MIME/size, bind to the current topic form, require confirmation and classify upload result without persisting Blob or CSRF.
- [ ] **Step 5: Implement check-in adapter.** Reuse the calendar action provider and check today’s state after submit.
- [ ] **Step 6: Run write tests.** Run `node --test test/reader-write-reactions.test.js test/reader-write-attachment.test.js test/reader-write-checkin.test.js test/ai-write-actions.test.js`.

### Task 5: Integrate write forms into card renderers

**Files:**
- Modify: `src/reader/renderers/topic.js`, `src/reader/renderers/settings.js`
- Modify: `src/reader/surface-host.js`, `src/reader/write-form.js`
- Create: `test/reader-write-ui.test.js`

- [ ] **Step 1: Add UI tests.** Reply/topic/favorite controls appear only when model capabilities and descriptors allow them; guest/CSRF-missing pages show the correct disabled/login state.
- [ ] **Step 2: Render forms as controlled cards.** Keep draft state local, enforce limits, expose preview/confirm/cancel and never inject raw form HTML.
- [ ] **Step 3: Connect submit to ActionBroker.** On success update the model through a fresh GET/parse or route commit; on failure retain draft and show a safe reason.
- [ ] **Step 4: Add route/stop isolation tests.** A route change, plugin stop or second submit cancels/ignores stale results.
- [ ] **Step 5: Run UI write tests.** Run `node --test test/reader-write-ui.test.js test/ai-workbench.test.js`.

### Task 6: Version and release write adapters

**Files:**
- Modify: `src/core.js` version to `0.3.0`
- Modify: `src/skin-entry.js` manifest to `2.3.0`
- Modify: `plugins/ai-write-actions.user.js`, `plugins/checkin-calendar.user.js` versions when their source changes
- Modify: `README.md`, `docs/CONVENTIONS.md`, version assertions

- [ ] **Step 1: Update each affected manifest/header pair.** Increment every changed userscript, suite and LTS version; do not alter untouched plugin versions.
- [ ] **Step 2: Build artifacts.** Run `npm run build` and verify write adapters are present only in Oxygen/LTS according to the existing suite policy.
- [ ] **Step 3: Run the write gate.** Run `npm test`, `npm run verify:dist`, `npm run smoke:ios27` and the write-action browser checks.

