# Reader Runtime Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use `superpowers:executing-plans` to execute this plan task-by-task. The user prohibits subagents; execute inline. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Render the first five read-only route families through a cancellable dual-track runtime with atomic commit and native fallback.

**Architecture:** `RouteCoordinator` owns the transaction state and history. `RendererRegistry` selects a model renderer. `NativeFallback` retains the original outlet until commit and restores it on any failure. The generated skin bootstrap starts the runtime while the legacy skin remains available behind an explicit fallback flag.

**Tech Stack:** JavaScript ES modules, esbuild, JSDOM, node:test, Playwright.

**Spec:** `docs/superpowers/specs/2026-10-05-full-runtime-ui-rebuild-design.md`

## Global Constraints

- Read-only only in this unit; forms and writes continue through native/legacy paths.
- New runtime must not directly query site selectors; it consumes PageDocument from the Read Model unit.
- A stale transaction cannot update DOM, history, scroll, focus, Surface state or storage.
- Unknown/failed routes restore native DOM and report a safe fallback reason.
- Skin phase floor is `2.1.0`; generated userscript and manifest versions must match.

---

### Task 1: Create the generated skin build entry

**Files:**
- Create: `src/skin-entry.js`
- Create: `src/reader/bootstrap.js`
- Create: `scripts/build-skin.mjs`
- Modify: `build.mjs`, `build-suite.mjs`, `package.json`
- Test: `test/build-skin.test.js`

- [ ] **Step 1: Add build contract tests.** Assert the generated userscript has one header, `@run-at document-end`, version `2.1.0` (or the current phase patch), and contains the Reader Runtime bootstrap.
- [ ] **Step 2: Implement `src/skin-entry.js`.** Export the skin manifest, import runtime modules, register the plugin through the existing base API and keep the old configuration key readable.
- [ ] **Step 3: Implement `scripts/build-skin.mjs`.** Use esbuild to bundle `src/skin-entry.js` into `plugins/skin.user.js` with the skin userscript header; fail if the generated header/manifest versions differ.
- [ ] **Step 4: Update build order.** Run `build-skin.mjs` before Oxygen/LTS concatenation, and make `npm test` regenerate the skin before tests consume it.
- [ ] **Step 5: Run the build contract.** Run `node --test test/build-skin.test.js` and `node scripts/build-skin.mjs`.

### Task 2: Add RouteCoordinator state and fallback tests

**Files:**
- Create: `src/reader/route-coordinator.js`
- Create: `src/reader/native-fallback.js`
- Create: `test/reader-runtime.test.js`

**Interfaces:**
```js
createRouteCoordinator({ window, document, broker, model, registry, fallback })
  -> { start, cancel, handlePopState, state, destroy }
```

- [ ] **Step 1: Add transaction tests.** Cover `idle → shadow → fetching → parsing → rendering → committing → settled`, cancellation, stale serial and fallback paths.
- [ ] **Step 2: Add native snapshot tests.** Capture outlet children, attributes, title, scroll and focus; restore them exactly once on fallback.
- [ ] **Step 3: Add atomic commit tests.** Assert the old outlet remains until renderer success and that no partial new nodes remain after a thrown renderer.
- [ ] **Step 4: Run the red runtime tests.** Run `node --test test/reader-runtime.test.js --test-name-pattern="transaction|fallback|commit"`.

### Task 3: Implement coordinator and native fallback

**Files:**
- Modify: `src/reader/route-coordinator.js`
- Modify: `src/reader/native-fallback.js`
- Modify: `src/shell-boot.js` only for shared native cloak state names
- Test: `test/reader-runtime.test.js`

- [ ] **Step 1: Implement initial shadow parse.** Parse the current document into a PageDocument without changing visible DOM.
- [ ] **Step 2: Implement cancellable fetch.** Use Platform v2 RequestBroker for same-origin GET and pass an AbortSignal to parser/render stages.
- [ ] **Step 3: Implement stale guards.** Check serial, target href and runtime instance before every DOM/history/scroll/focus update.
- [ ] **Step 4: Implement commit.** Insert the new reader root, replace only the new outlet, update title/history and hide native nodes after validation.
- [ ] **Step 5: Implement fallback.** Remove new nodes, restore native snapshot, clear `aria-busy` and report the safe reason through runtime diagnostics.
- [ ] **Step 6: Run runtime tests.** Run `node --test test/reader-runtime.test.js`.

### Task 4: Implement renderer registry and first page renderers

**Files:**
- Create: `src/reader/renderer-registry.js`
- Create: `src/reader/renderers/list.js`
- Create: `src/reader/renderers/topic.js`
- Create: `src/reader/renderers/user.js`
- Create: `test/reader-renderers.test.js`

- [ ] **Step 1: Define renderer interface.** `render(model, context) -> HTMLElement` and `destroy(root)`; renderers may only read model/context and use safe DOM builders.
- [ ] **Step 2: Implement list renderer.** Render home/forum/search list cards, pagination, sort/filter labels and same-origin anchors with stable `data-reader-id` attributes.
- [ ] **Step 3: Implement topic renderer.** Render topic header, post cards, floor markers, RichText AST, quote/media blocks and pagination; do not render write forms yet.
- [ ] **Step 4: Implement user renderer.** Render profile card, tabs, list cards and pagination with route links.
- [ ] **Step 5: Add renderer safety tests.** Assert no raw HTML, unsafe href, duplicate IDs or missing `aria` labels; verify model data appears once.
- [ ] **Step 6: Run renderer tests.** Run `node --test test/reader-renderers.test.js`.

### Task 5: Integrate route clicks, history and scroll

**Files:**
- Modify: `src/reader/bootstrap.js`, `src/reader/route-coordinator.js`
- Create: `src/reader/reader-scroll.js`
- Modify: `test/reader-runtime.test.js`, `scripts/ios27-canvas-smoke.mjs`

- [ ] **Step 1: Add delegated link handling.** Intercept only same-origin GET routes registered in the route catalog; preserve modified-click, download, external and write-form behavior.
- [ ] **Step 2: Add popstate handling.** Restore cached models only after validation; otherwise fetch and parse through the same pipeline.
- [ ] **Step 3: Add scroll/focus restoration.** Save the reader scroll root and focus target per route; restore after commit and abort restoration on stale serial.
- [ ] **Step 4: Add browser smoke route.** Serve fixtures for `/`, `/forum/4`, `/topic/1`, `/user/1` and assert the new outlet commits without native UI flash.
- [ ] **Step 5: Run focused browser checks.** Run `npm run smoke:ios27` and add `node scripts/check-reader-runtime.mjs` for route/fallback assertions.

### Task 6: Enable opt-in read-only runtime and fallback switch

**Files:**
- Modify: `src/skin-entry.js`, `src/reader/bootstrap.js`
- Modify: `plugins/skin.user.js` through `scripts/build-skin.mjs`
- Modify: `test/skin.test.js`, `test/reader-runtime.test.js`
- Modify: `README.md`, `docs/CONVENTIONS.md`

- [ ] **Step 1: Add the runtime switch.** Default the new renderer on for the five migrated route types, with a stored `readerRuntime:false` opt-out that immediately restores native layout.
- [ ] **Step 2: Add legacy coexistence tests.** Skin disabled, plugin stopped, unknown route and parser failure must show native content and remove reader nodes.
- [ ] **Step 3: Bump skin to `2.1.0`.** Synchronize header, manifest, base requirement and generated artifact; bump Oxygen/LTS release versions for the changed module.
- [ ] **Step 4: Run the Reader Runtime gate.** Run `npm test`, `npm run build`, `npm run verify:dist`, `npm run smoke:ios27` and `node scripts/check-skin-browser.mjs`.

