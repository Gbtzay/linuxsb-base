# Plugin Migration and Legacy Closeout Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use `superpowers:executing-plans` to execute this plan task-by-task. The user prohibits subagents; execute inline. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Move existing AI, realtime, unread, statistics, profile and community plugins to the new reader/surface/action挂点, then remove legacy shell paths only after the migration matrix is green.

**Architecture:** Compatibility facade remains the bridge during migration. Each plugin gets an explicit adapter that consumes PageDocument/context and registers a Surface or action; no plugin silently reaches into renderer internals. Legacy APIs report usage and are removed only at the closeout release.

**Tech Stack:** JavaScript ES modules, existing plugin manifests, node:test, JSDOM, Playwright, Oxygen/LTS build scripts.

**Spec:** `docs/superpowers/specs/2026-10-05-full-runtime-ui-rebuild-design.md`

## Global Constraints

- Base closeout floor is `0.3.1`; skin/Oxygen/LTS closeout floor is `3.0.0`.
- Preserve plugin business semantics, AI safety rules, evidence freshness, stop/cancel behavior and write result checks.
- Every changed plugin increments both `@version` and manifest `version`.
- No removal of a legacy API until its usage count is zero in the migration test matrix.
- Keep an explicit native fallback for any route or plugin that remains unsupported.

---

### Task 1: Build the plugin migration matrix

**Files:**
- Create: `docs/superpowers/migrations/2026-10-05-reader-plugin-matrix.md`
- Create: `test/reader-plugin-migration.test.js`
- Modify: `src/runtime/compat.js` to expose safe legacy usage counts

- [ ] **Step 1: Inventory plugin registrations.** List every module in `suite/order.js` and record current API calls (`shellAsideView`, `shellWindowRegister`, DOM watchers, direct selectors, actions).
- [ ] **Step 2: Assign a new挂点.** For each module choose `reader.route`, `reader.context`, `surface.register`, `action.register` or intentional native fallback; record the owner and disposal path.
- [ ] **Step 3: Add matrix assertions.** Every module has one owner, one migration state, an allowed fallback and no undeclared capability.
- [ ] **Step 4: Run the inventory test.** Run `node --test test/reader-plugin-migration.test.js` and keep failures until each module is migrated.

### Task 2: Migrate AI and evidence surfaces

**Files:**
- Modify: `plugins/ai-copilot.user.js`, `plugins/ai-workbench.user.js`, `plugins/ai-summary.user.js`
- Modify: `src/ai-conversation.js`, `src/ai-evidence.js`, `src/ai-trace.js` only for context/surface adapter calls
- Create: `test/reader-ai-migration.test.js`

- [ ] **Step 1: Add context adapter tests.** AI receives PageDocument/context snapshots, current material and route scope without full DOM, CSRF or raw URL secrets.
- [ ] **Step 2: Mount AI through SurfaceHost.** Register `AICard`/evidence surfaces and preserve streaming, stop, retry, history and citation freshness behavior.
- [ ] **Step 3: Migrate write plan handoff.** AI write plans call ActionBroker and preserve confirmation/result-check semantics.
- [ ] **Step 4: Run AI migration tests.** Run `node --test test/reader-ai-migration.test.js test/ai-workbench.test.js test/ai-copilot.test.js`.

### Task 3: Migrate realtime, unread and data surfaces

**Files:**
- Modify: `plugins/live-feed.user.js`, `plugins/unread-sentinel.user.js`, `plugins/resume-reading.user.js`, `plugins/read-mark.user.js`
- Modify: `plugins/hover-profile.user.js`, `plugins/title-quotes.user.js`, `plugins/topic-preview.user.js`
- Create: `test/reader-live-migration.test.js`

- [ ] **Step 1: Add route/context event tests.** New route events carry PageDocument IDs and cannot update stale routes.
- [ ] **Step 2: Mount realtime/unread indicators.** Use ToolCapsule/TopStatus/ContextPill surfaces without duplicating native badges or opening hidden native pages.
- [ ] **Step 3: Migrate profile/preview/quotes cards.** Register child cards with focus/close/dispose and keep existing data-cache and throttling rules.
- [ ] **Step 4: Run migration tests.** Run `node --test test/reader-live-migration.test.js test/live-feed.test.js test/home-return.test.js test/read-mark.test.js`.

### Task 4: Deprecate legacy shell API with an explicit compatibility period

**Files:**
- Modify: `src/ui.js`, `src/core.js`, `src/runtime/compat.js`
- Modify: `test/core.test.js`, `test/reader-plugin-migration.test.js`
- Modify: `README.md`, `docs/CONVENTIONS.md`

- [ ] **Step 1: Add deprecation diagnostics.** Legacy calls emit owner/id/count only, never arguments or DOM text; diagnostics are visible in the local runtime panel.
- [ ] **Step 2: Add stop and fallback tests.** A plugin stop removes new surfaces, aborts requests and restores native nodes; fallback does not leave legacy observers running.
- [ ] **Step 3: Freeze new legacy registrations.** New code must use reader/surface/action APIs; existing legacy calls remain accepted until the matrix reaches zero.
- [ ] **Step 4: Run all plugin lifecycle tests.** Run `node --test test/core.test.js test/errors.test.js test/reader-plugin-migration.test.js`.

### Task 5: Remove obsolete three-column and native-DOM renderer paths

**Files:**
- Modify: `src/ui.js`, `src/shell-layout.js`, `src/shell-scroll.js`, `src/shell-style.js`, `src/shell-boot.js`
- Modify: generated `plugins/skin.user.js` through `src/skin-entry.js`
- Modify: `test/skin.test.js`, `test/skin-canvas.test.js`, `test/shell-layout.test.js`, `test/shell-scroll.test.js`

- [ ] **Step 1: Verify zero legacy usage.** Run the migration matrix and compatibility counters; stop if any required plugin still calls a removed API.
- [ ] **Step 2: Remove only obsolete implementations.** Keep pure helpers still used by Reader Runtime; delete fixed rail/aside/workspace code only after replacement tests exist.
- [ ] **Step 3: Remove duplicate DOM observers.** Replace old selectors with PageDocument/context events and retain one fallback observer for unrecognized native routes.
- [ ] **Step 4: Run skin regressions.** Run `node --test test/skin.test.js test/skin-canvas.test.js test/shell-layout.test.js test/shell-scroll.test.js`.

### Task 6: Release closeout and legacy channel

**Files:**
- Modify: `src/core.js` version to `0.3.1`
- Modify: `src/skin-entry.js` manifest to `3.0.0`
- Modify: `build-suite.mjs`, `build-lts.mjs`, `suite/suite-center.js`
- Modify: `README.md`, `docs/CONVENTIONS.md`, all affected version assertions
- Create: `docs/superpowers/migrations/2026-10-05-reader-closeout-report.md`

- [ ] **Step 1: Record the migration report.** Include route coverage, plugin matrix, fallback counts, legacy counter zero state and known intentional native routes.
- [ ] **Step 2: Build both release lines.** Generate new 3.0.0 artifacts and preserve the previous legacy artifacts without mixing headers or dependency ranges.
- [ ] **Step 3: Run the full release suite.** Run `npm test`, `npm run build`, `npm run verify:dist`, `npm run smoke:ios27`, `node scripts/check-skin-browser.mjs` and the AI/write browser checks.
- [ ] **Step 4: Review generated output.** Confirm one userscript header per artifact, no stale `lsb-shell-rail`/`lsb-shell-aside` renderer references, no leaked secrets and all changed versions match manifests.

