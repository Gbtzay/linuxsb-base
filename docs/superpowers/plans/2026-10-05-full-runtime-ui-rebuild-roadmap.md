# LINUX.SB 全栈阅读运行时与 iOS 27 卡片画布重建实施路线图

> **For agentic workers:** REQUIRED SUB-SKILL: Use `superpowers:executing-plans` to execute this roadmap task-by-task. The user prohibits subagents; execute every task inline in the current session. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Replace the current native-DOM-driven shell with a dual-track client runtime that renders the whole site as a card-based iOS 27 reading canvas, while retaining a safe native fallback and the existing server protocol.

**Architecture:** Build Platform v2 first, then a versioned page-model/read-only pipeline, then the Reader Runtime and SurfaceHost, then write adapters and plugin migration. The new runtime owns route transactions, model validation, rendering, cards and surfaces; SiteAdapters alone know site selectors; RequestBroker and ActionBroker alone can perform network and write operations.

**Tech Stack:** JavaScript ES modules, esbuild userscript bundles, JSDOM/node:test unit tests, Playwright browser smoke tests, IndexedDB media storage, existing Hydrogen/Oxygen/LTS build pipeline.

**Spec:** `docs/superpowers/specs/2026-10-05-full-runtime-ui-rebuild-design.md`

## Global Constraints

- Do not use subagents; run all work inline and keep each checkpoint reviewable.
- Keep linux.sb server endpoints, request fields, authentication and CSRF semantics unchanged.
- New renderer failures, unknown routes and unsupported plugin mounts must restore the native page; never leave a half-rendered route.
- Read-only content runtime ships before write adapters; write operations always go through ActionBroker confirmation, scope validation, idempotency and result checks.
- Treat page HTML, rich text, model output and plugin output as untrusted; render through structured nodes and a fixed URL/style allowlist.
- Media Blob data stays in IndexedDB; configuration, models, logs and exports store only validated descriptors/keys.
- Every commit that changes a userscript or its manifest increments the affected version; generated Hydrogen/Oxygen/LTS artifacts are rebuilt after changes.
- Preserve unrelated existing worktree changes; never reset, clean or normalize the whole worktree.
- Keep current plugin installation shape: one Hydrogen userscript, one Oxygen userscript and one LTS userscript.

## Current Source Map

- `src/core.js`: plugin registry, lifecycle, permissions, public API and current base version `0.1.57`.
- `src/net.js`: GM/fetch transport, same-origin checks, CSRF, rate limiting, cancellation and retry behavior.
- `src/ui.js`: settings tabs, toasts, confirms, shell view/window registries and scroll-root bridges.
- `src/site.js`: route detection, selector constants, current HTML parsers, route builders and CSRF discovery.
- `src/shell-boot.js`: document-start native UI cloak and navigation guard.
- `src/shell-canvas.js`, `src/shell-layout.js`, `src/shell-media.js`, `src/shell-scroll.js`, `src/shell-style.js`: existing pure canvas/layout/media/scroll/style helpers to reuse or replace behind new contracts.
- `plugins/skin.user.js`: current monolithic skin implementation; it becomes a generated bootstrap after the Reader Runtime is ready.
- `build.mjs`, `build-suite.mjs`, `build-lts.mjs`: artifact generation and module/version checks.
- `test/skin.test.js`, `test/skin-canvas.test.js`, `test/core.test.js`, `test/site.test.js`, `test/suite.test.js`, `scripts/ios27-canvas-smoke.mjs`: existing UI, parser, lifecycle, artifact and browser verification.

## Execution Units

Each unit has its own plan and test gate. Do not begin the next unit until its gate passes.

1. [Platform v2](2026-10-05-platform-v2.md): capabilities, RequestBroker, ActionBroker, lifecycle and legacy facade.
2. [Read Model](2026-10-05-read-model.md): PageDocument, RichText AST, SiteAdapters and first route models.
3. [Reader Runtime](2026-10-05-reader-runtime.md): generated skin entry, route coordinator, renderers, shadow mode and native fallback.
4. [iOS 27 Surface](2026-10-05-ios27-surface.md): card renderer, SurfaceHost, SheetHost, appearance, media and responsive layout.
5. [Extended Routes and Write Adapters](2026-10-05-write-adapters.md): remaining read-only pages and controlled site actions.
6. [Plugin Migration and Closeout](2026-10-05-migration-closeout.md): AI/stream/unread/plugin migration, legacy removal and final release.

## Roadmap Tasks

### Task 1: Execute Platform v2 before any new renderer

**Files:**
- Read and execute: `docs/superpowers/plans/2026-10-05-platform-v2.md`
- Gate: `test/runtime-capabilities.test.js`, `test/runtime-request-broker.test.js`, `test/runtime-action-broker.test.js`

- [ ] **Step 1:** Complete every checked step in the Platform v2 plan in order.
- [ ] **Step 2:** Run `npm test`, `npm run build` and `npm run verify:dist`.
- [ ] **Step 3:** Record the `0.2.0` base release and compatibility counters before moving on.

### Task 2: Execute Read Model and freeze PageDocument schema

**Files:**
- Read and execute: `docs/superpowers/plans/2026-10-05-read-model.md`
- Gate: `test/reader-model.test.js`, `test/reader-rich-text.test.js`, `test/reader-route-catalog.test.js`

- [ ] **Step 1:** Complete model, AST, adapter and fixture tasks in order.
- [ ] **Step 2:** Run the focused reader tests and full `npm test`.
- [ ] **Step 3:** Record schema version `1` and base release `0.2.1`; do not change model field names during later renderer work.

### Task 3: Execute Reader Runtime and ship the first read-only route gate

**Files:**
- Read and execute: `docs/superpowers/plans/2026-10-05-reader-runtime.md`
- Gate: `test/reader-runtime.test.js`, `test/reader-renderers.test.js`, `scripts/check-reader-runtime.mjs`

- [ ] **Step 1:** Generate the skin entry before running tests that read `plugins/skin.user.js`.
- [ ] **Step 2:** Complete transaction, renderer, history, scroll and fallback tasks.
- [ ] **Step 3:** Run all artifact/browser checks and record that home/forum/topic/user/search can commit or fall back.

### Task 4: Execute the iOS 27 Surface plan after read-only commit is stable

**Files:**
- Read and execute: `docs/superpowers/plans/2026-10-05-ios27-surface.md`
- Gate: `test/reader-appearance.test.js`, `test/reader-card-renderers.test.js`, `test/reader-surfaces.test.js`, `test/reader-responsive.test.js`

- [ ] **Step 1:** Complete token, card, SurfaceHost, media and responsive tasks.
- [ ] **Step 2:** Run the browser smoke at 1440px, 860px and 390px, including media and reduced-preference checks.
- [ ] **Step 3:** Record the `2.2.0` skin/suite/LTS release before extending routes or writes.

### Task 5: Execute Extended Routes and Write Adapters

**Files:**
- Read and execute: `docs/superpowers/plans/2026-10-05-write-adapters.md`
- Gate: `test/reader-community-pages.test.js`, `test/reader-write-*.test.js`, existing AI write tests

- [ ] **Step 1:** Complete read-only community adapters before enabling any write card.
- [ ] **Step 2:** Migrate reply/topic actions, then reactions/attachments/check-in, one descriptor at a time.
- [ ] **Step 3:** Run the full write gate and record the `0.3.0`/`2.3.0` release versions.

### Task 6: Execute Plugin Migration and Closeout

**Files:**
- Read and execute: `docs/superpowers/plans/2026-10-05-migration-closeout.md`
- Gate: `docs/superpowers/migrations/2026-10-05-reader-closeout-report.md`, migration and full browser suites

- [ ] **Step 1:** Complete the plugin matrix and migrate AI, realtime, unread and data surfaces.
- [ ] **Step 2:** Confirm legacy usage counters are zero for every API slated for removal.
- [ ] **Step 3:** Remove only proven-obsolete shell paths, build the `3.0.0` release line and retain the legacy artifacts.

## Release Ledger

The phase floors below are the first release that can contain the phase. Intermediate commits that change the same userscript use the next patch version before the phase floor is released.

| Gate | Hydrogen/base | skin/Reader | Oxygen | LTS | Required result |
| --- | --- | --- | --- | --- | --- |
| Current | 0.1.57 | 1.1.75 | 1.0.149 | 1.0.149 | Existing shell and tests remain the rollback reference |
| Platform v2 | 0.2.0 | 2.0.0 | 2.0.0 | 2.0.0 | Legacy plugins run through the new brokers |
| Read Model | 0.2.1 | 2.0.1 | 2.0.1 | 2.0.1 | Five first route models validate from DOM and network HTML |
| Reader Runtime | 0.2.1 | 2.1.0 | 2.1.0 | 2.1.0 | Read-only home/forum/topic/user/search can commit or fall back |
| iOS 27 Surface | 0.2.1 | 2.2.0 | 2.2.0 | 2.2.0 | Card canvas, surfaces, media and responsive smoke pass |
| Write adapters | 0.3.0 | 2.3.0 | 2.3.0 | 2.3.0 | First write actions pass confirmation and result checks |
| Closeout | 0.3.1 | 3.0.0 | 3.0.0 | 3.0.0 | Legacy facade removal is explicit and migration matrix is green |

When a task touches a plugin source, update both its userscript header and manifest version in the same change. When a task only changes docs or tests, do not invent a plugin version bump.

## Cross-Unit Verification Gate

Run these commands at every unit boundary and read the exit code and final counts:

```powershell
npm test
npm run build
npm run verify:dist
npm run smoke:ios27
node scripts/check-skin-browser.mjs
```

The full browser pass must cover home, forum, topic, user and settings at 1440px, 860px and 390px. Include native fallback, route cancellation, reduced motion/transparency, cardized正文, background media, keyboard focus and plugin stop/unmount behavior.

## Rollback Rules

- Keep the current native route outlet and its snapshot until the new PageDocument is validated and the new outlet commits.
- A failed adapter, validator, renderer, surface mount or action check calls the unit's fallback function; it does not retry rendering with partially trusted data.
- A stale route transaction cannot update title, history, scroll, Surface state, storage or diagnostics for the current transaction.
- Legacy facade remains enabled until the migration-closeout matrix proves that every registered plugin has a new挂点 or an intentional native fallback.
- If a release gate fails, publish the previous artifact line and keep the new code behind its feature flag; do not silently mix base, skin and suite versions.
