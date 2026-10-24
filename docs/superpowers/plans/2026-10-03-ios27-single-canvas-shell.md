# M17 iOS 27 Single Canvas Shell Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task. This workspace explicitly forbids subagents, so execute the plan inline with a verification checkpoint after every task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Replace the fixed left/main/right shell with a single reading canvas and on-demand iOS 27-style surfaces across all managed pages, while preserving native DOM, M12/M14 safety behavior, and existing site write flows.

**Architecture:** Keep `plugins/skin.user.js` as the suite module and add focused internal layers for state, page adaptation, surface management, media, and lifecycle cleanup. `src/shell-boot.js` will reserve only a neutral single-canvas bootstrap state at document-start; it will no longer paint rail/aside placeholders. Native page nodes remain the source of truth and surface elements are mounted as siblings under a dedicated host.

**Tech Stack:** Existing userscript plugin API, DOM/CSS, Pointer Events, `requestAnimationFrame`, IndexedDB, JSDOM tests, Node `node:test`, esbuild build, and the existing suite concatenation script.

## Global Constraints

- Execute inline; do not dispatch subagents.
- All new behavior stays in the existing `skin` module; do not add a new plugin or change `suite/order.js`.
- Use one continuous main scroll surface; do not render a fixed left rail, main column, or right rail.
- Keep the native sidebar in its original DOM position and hide it in place; never clone or append it under `#lsb-shell`.
- Preserve base network, CSRF, confirmation, non-idempotent retry, and write-result-checking rules.
- AI history remains limited and read-only; historical write requests must never execute.
- M14 citation checks reread only cited floors locally and report `fresh`, `changed`, or `unavailable`.
- Default appearance is A (balanced glass); B (immersive video) and C (static readable) remain selectable.
- Appearance state uses global defaults with per-origin overrides; layouts use `wide (>=1100)`, `mid (700-1099)`, and `narrow (<700)` buckets.
- HTTPS remote video/font URLs are allowed; local video is limited to 50 MB and local font files to 10 MB.
- Video is muted and looping; failed media falls back to static background or the site font.
- `prefers-reduced-motion`, `prefers-reduced-transparency`, missing `backdrop-filter`, CSP errors, and unavailable IndexedDB must degrade to usable opaque controls.
- Use LF and UTF-8 without BOM for plugin sources; do not use PowerShell redirection to write plugin files.
- Run `npm test`, `npm run build`, the suite/production synchronization check available in the repository, and `git diff --check` before claiming completion.

## File Map

- Modify `src/shell-boot.js`: document-start neutral canvas bootstrap and cleanup.
- Modify `plugins/skin.user.js`: state model, migration, page adapter, surface host/manager, appearance/media controls, and lifecycle cleanup.
- Modify `test/skin.test.js`: update old rail/aside assumptions and retain typography, plugin lifecycle, and native-node restoration coverage.
- Create `test/skin-canvas.test.js`: state, page adapter, surface state machine, responsive rules, pointer/keyboard interaction, and focus restoration.
- Create `test/skin-media.test.js`: URL/file validation, IndexedDB adapter, preset merging, and media failure fallback.
- Create `test/fixtures/settings.html`: minimal settings-page DOM containing the same native top bar/sidebar markers used by the adapter.
- Update `test/fixtures/home.html`, `test/fixtures/topic1.html`, and `test/fixtures/user1.html` only when a missing marker is required for the five-page adapter matrix; do not alter unrelated fixture content.
- Update `src/core.js` and `package.json` base version only if `src/shell-boot.js` changes require the repository’s base version bump; keep both values equal.
- Update `plugins/skin.user.js` header and manifest versions together, and update `build-suite.mjs` `SUITE_VERSION` according to the current patch-release convention.
- Update the M17 plan/spec changelog references only after implementation validation; do not add unrelated documentation.

## Interfaces Used Across Tasks

Keep these internal function names stable so later tasks can be implemented independently:

```js
widthClass(viewportWidth)
siteKeyFromLocation(locationLike)
defaultCanvasState()
mergeCanvasState(globalState, siteOverride)
clampSurfaceRect(rect, viewport)
migrateLegacySkinState(rawConfig, mediaMeta)
validateMediaDescriptor(kind, descriptor)
resolveSurfaceMode(widthClassValue, surfaceKind)
```

The existing `skin:debug` RPC must expose a serializable snapshot with this shape after Task 2:

```js
{
  canvas: {
    enabled: true,
    version: 2,
    siteKey: 'https://linux.sb',
    widthClass: 'wide',
    preset: 'balanced-glass',
    surfaces: []
  }
}
```

Later tasks may add fields, but must not rename these keys. No debug field may contain a DOM node, Blob, Promise, or function.

## M17.1 — Canvas and Surface Host

### Task 1: Replace the document-start rail/aside bootstrap with a neutral canvas bootstrap

**Files:**
- Modify: `src/shell-boot.js`
- Modify: `test/skin.test.js` bootstrap tests around `bootStyle`, `bootFrame`, and `applyShellBoot`

**Interfaces:**
- Consumes: `rawGet`, `clearShellBoot`, `applyShellBoot`, `watchShellBoot`.
- Produces: `SHELL_BOOT_CLASS = 'lsb-canvas-boot'`, the existing style/frame IDs for compatibility, and a frame containing only `data-boot="canvas"`.

- [ ] **Step 1: Write failing bootstrap assertions.**

Add tests that assert the boot frame has exactly one `data-boot="canvas"` child, has no `data-boot="rail"` or `data-boot="aside"`, adds no left/right padding, and hides the native sidebar without moving it.

```js
assert.equal(bootFrame(w).querySelectorAll('[data-boot]').length, 1)
assert.ok(bootFrame(w).querySelector('[data-boot="canvas"]'))
assert.equal(bootFrame(w).querySelector('[data-boot="rail"]'), null)
assert.equal(w.document.documentElement.style.paddingLeft, '')
```

- [ ] **Step 2: Run the focused test and verify it fails.**

Run: `node --test test/skin.test.js --test-name-pattern="document-start|首屏|占位"`

Expected: FAIL because the current bootstrap creates header/rail/aside placeholders and rail padding.

- [ ] **Step 3: Implement the neutral bootstrap.**

Change `BOOT_CSS` so `html.lsb-canvas-boot` hides the native top and non-mobile `aside.sidebar` at desktop widths, leaves `main.wrap` without rail/aside padding, and gives the single canvas a neutral background. Keep `clearShellBoot()` and the bus listeners idempotent. Do not remove the existing boot IDs because tests and cleanup use them.

- [ ] **Step 4: Run focused and legacy bootstrap tests.**

Run: `node --test test/skin.test.js --test-name-pattern="document-start|首屏|占位|iframe|关壳|停用"`

Expected: PASS, with no boot frame after `clearShellBoot()` and no bootstrap in iframes.

- [ ] **Step 5: Commit the bootstrap change.**

```bash
git add src/shell-boot.js test/skin.test.js
git commit -m "refactor: bootstrap single canvas shell"
```

### Task 2: Add the versioned canvas state model and migration helpers

**Files:**
- Modify: `plugins/skin.user.js` near the manifest/config and setup state declarations
- Create: `test/skin-canvas.test.js`

**Interfaces:**
- Consumes: existing `api.config()`, `localStorage`/base storage conventions, and `location`.
- Produces: `widthClass`, `siteKeyFromLocation`, `defaultCanvasState`, `mergeCanvasState`, `clampSurfaceRect`, `migrateLegacySkinState`, and the `skin:debug().canvas` snapshot.

- [ ] **Step 1: Write failing state tests.**

Create a JSDOM helper that loads the base bundle and `plugins/skin.user.js`. Add tests for width boundaries, origin isolation, A defaults, sparse site overrides, clamping, and legacy `shell:false` preservation.

```js
assert.equal(widthClass(1100), 'wide')
assert.equal(widthClass(1099), 'mid')
assert.equal(widthClass(699), 'narrow')
assert.equal(siteKeyFromLocation(new URL('https://linux.sb/topic/1')), 'https://linux.sb')
const merged = mergeCanvasState(defaultCanvasState(), { appearance: { fontSize: 18 } })
assert.equal(merged.appearance.fontSize, 18)
assert.equal(merged.preset, 'balanced-glass')
```

- [ ] **Step 2: Run the focused state tests and verify failure.**

Run: `node --test test/skin-canvas.test.js --test-name-pattern="width|origin|preset|override|clamp|migration"`

Expected: FAIL because the canvas state API and debug snapshot do not exist.

- [ ] **Step 3: Implement pure state helpers inside `skin.user.js`.**

Use immutable return values. `defaultCanvasState()` must include A values, the three width buckets, empty site overrides, and `version: 2`. `clampSurfaceRect()` must enforce minimum dimensions and keep the close/submit edge inside the viewport. `migrateLegacySkinState()` must produce `legacyLayoutSnapshot`, map recognized wallpaper/font/opacity/blur fields, and preserve explicit `shell:false`.

- [ ] **Step 4: Add the serializable debug snapshot.**

Extend the existing `skin:debug` response with `canvas` and report the effective site state without media Blob contents. Keep all existing debug fields unchanged.

- [ ] **Step 5: Run the focused tests and the existing skin tests.**

Run: `node --test test/skin-canvas.test.js test/skin.test.js --test-name-pattern="width|origin|preset|override|clamp|migration|界面精修|氢壳|停用"`

Expected: PASS for the new state assertions and all retained legacy typography/lifecycle assertions that do not yet depend on the old three-column layout.

- [ ] **Step 6: Commit the state model.**

```bash
git add plugins/skin.user.js test/skin-canvas.test.js
git commit -m "feat: add versioned single canvas state"
```

### Task 3: Mount the PageAdapter and single-canvas surface host

**Files:**
- Modify: `plugins/skin.user.js` DOM mount/route refresh functions
- Modify: `test/skin-canvas.test.js`
- Create: `test/fixtures/settings.html`

**Interfaces:**
- Consumes: Task 2 state helpers, `api.page`, `api.on`, existing native node discovery helpers.
- Produces: `#lsb-shell`, `#lsb-shell-surfaces`, page classes, and idempotent `mountCanvas()`/`unmountCanvas()` lifecycle behavior.

- [ ] **Step 1: Add failing page matrix tests.**

Load home, topic, user, and the new settings fixture at their real route shapes. Assert that `#lsb-shell` and `#lsb-shell-surfaces` exist, the main content remains in its original parent, and no `aside.sidebar` is a descendant of `#lsb-shell`.

```js
assert.ok(w.document.getElementById('lsb-shell-surfaces'))
assert.equal(w.document.querySelector('#lsb-shell aside.sidebar'), null)
assert.ok(w.document.querySelector('main.wrap'))
```

- [ ] **Step 2: Run the page matrix and verify failure.**

Run: `node --test test/skin-canvas.test.js --test-name-pattern="page matrix|surface host|settings"`

Expected: FAIL because the current skin still creates rail/aside hosts and has no surface host.

- [ ] **Step 3: Implement PageAdapter and host mounting.**

Create the root once, add page-type classes to `html`, apply the single-canvas width/readability rules to existing `main.wrap`/`.forum-main`, hide native header/sidebar in place, and subscribe to route/DOM refresh events using the existing owner cleanup mechanism. Do not move or clone user cards, forum links, or sidebar cards.

- [ ] **Step 4: Implement unmount restoration.**

On config disable, plugin dispose, and route refresh, remove only classes/styles owned by skin, restore native hidden markers, remove surface children, cancel scheduled refresh work, and leave original nodes and order intact.

- [ ] **Step 5: Run page matrix, lifecycle, and diff checks.**

Run: `node --test test/skin-canvas.test.js test/skin.test.js --test-name-pattern="page matrix|surface host|settings|停用|关壳|路由"`; then `git diff --check`.

Expected: PASS; no native sidebar is inside the shell and no orphan surface host remains after disable.

- [ ] **Step 6: Commit the canvas host.**

```bash
git add plugins/skin.user.js test/skin-canvas.test.js test/fixtures/settings.html
git commit -m "feat: mount single canvas surface host"
```

### Task 4: Implement SurfaceManager, top status, capsule, and unified tool Sheet

**Files:**
- Modify: `plugins/skin.user.js` surface CSS and event handlers
- Modify: `test/skin-canvas.test.js`

**Interfaces:**
- Consumes: `#lsb-shell-surfaces`, PageAdapter metadata, `resolveSurfaceMode`.
- Produces: `openSurface(id)`, `closeSurface(id)`, `activeSurface()`, `focusReturn()`, and the `top-status`, `tool-capsule`, and `tool-sheet` surfaces.

- [ ] **Step 1: Write failing interaction tests.**

Assert that the top status has back/site/material/more labels, scroll direction toggles its compact class, capsule opens the tool Sheet, and selecting a tool action closes the Sheet before opening the target surface. Assert there are no `@当前页面` or `/提问类` controls.

- [ ] **Step 2: Run the focused tests and verify failure.**

Run: `node --test test/skin-canvas.test.js --test-name-pattern="status|capsule|tool Sheet|surface mutex|focus"`

Expected: FAIL because none of the new surfaces exist.

- [ ] **Step 3: Implement the surface state machine.**

Keep one `activeSheetId`, a `floatingSurfaces` map, a trigger element for focus return, and a monotonically increasing `z` counter. Render semantic buttons with labels and a close control. On `openSurface`, close the previous main Sheet, save the trigger, update `aria-expanded`, and focus the first meaningful control.

- [ ] **Step 4: Implement compact status and capsule behavior.**

Use a passive scroll listener scheduled through `requestAnimationFrame`; add/remove a compact class based on scroll direction without changing content position. Keep the capsule fixed within the safe-area inset and make it keyboard reachable.

- [ ] **Step 5: Run focused tests and inspect generated CSS.**

Run: `node --test test/skin-canvas.test.js --test-name-pattern="status|capsule|tool Sheet|surface mutex|focus"`; assert CSS contains no fixed rail/aside columns and no infinite animation.

- [ ] **Step 6: Commit M17.1 surface entry points.**

```bash
git add plugins/skin.user.js test/skin-canvas.test.js
git commit -m "feat: add single canvas status and tool surfaces"
```

## M17.2 — Appearance, Media, Responsive Cards, and Migration

### Task 5: Add responsive surface modes and desktop drag/resize

**Files:**
- Modify: `plugins/skin.user.js` SurfaceManager pointer/keyboard code
- Modify: `test/skin-canvas.test.js`

**Interfaces:**
- Consumes: `resolveSurfaceMode`, `clampSurfaceRect`, layout persistence from Task 2.
- Produces: `beginSurfaceDrag(event)`, `resizeSurface(surfaceId, delta)`, `moveSurfaceByKeyboard(surfaceId, direction)`, and persisted `layout[widthClass]` records.

- [ ] **Step 1: Write failing pointer and keyboard tests.**

Stub `requestAnimationFrame` and pointer capture. Assert drag movement uses one transform update per frame, does not snap during movement, clamps at the viewport edge on release, and keyboard arrows move the card by 8px while `Shift+Arrow` resizes it. Assert mid/narrow resolve to Sheet/fullscreen modes.

```js
assert.equal(resolveSurfaceMode('wide', 'ai-card'), 'floating')
assert.equal(resolveSurfaceMode('mid', 'ai-card'), 'sheet')
assert.equal(resolveSurfaceMode('narrow', 'ai-card'), 'fullscreen')
```

- [ ] **Step 2: Run the interaction tests and verify failure.**

Run: `node --test test/skin-canvas.test.js --test-name-pattern="drag|resize|keyboard|wide|mid|narrow"`

Expected: FAIL because SurfaceManager has no pointer/keyboard implementation.

- [ ] **Step 3: Implement pointer-captured drag and resize.**

Track the pointer id and starting rect, schedule a single RAF writer, apply `translate3d` while moving, and persist only on `pointerup`/`pointercancel`. Use `clampSurfaceRect()` at release and never place the close or submit edge outside the viewport.

- [ ] **Step 4: Implement keyboard equivalents and responsive mode switching.**

Add `aria-keyshortcuts` text to the surface help label. Use 8px movement, 16px resize, `Home/End` for front/back layer, and `Escape` for close. On resize, convert a floating card to a Sheet/fullscreen surface without losing content or focus.

- [ ] **Step 5: Run the tests and commit.**

Run: `node --test test/skin-canvas.test.js --test-name-pattern="drag|resize|keyboard|wide|mid|narrow"`; then `git diff --check`.

```bash
git add plugins/skin.user.js test/skin-canvas.test.js
git commit -m "feat: add responsive draggable surfaces"
```

### Task 6: Implement appearance presets, settings Sheet, and media validation

**Files:**
- Modify: `plugins/skin.user.js` config, IndexedDB adapter, and appearance surface
- Create: `test/skin-media.test.js`
- Modify: `test/skin-canvas.test.js`

**Interfaces:**
- Consumes: state model and SurfaceManager from Tasks 2 and 4.
- Produces: `validateMediaDescriptor(kind, descriptor)`, `loadMediaRecord(id)`, `saveMediaRecord(kind, file)`, `applyAppearance(state)`, and the A/B/C appearance Sheet.

- [ ] **Step 1: Write failing media and preset tests.**

Cover HTTPS-only remote URLs, reject `http:` and non-URL values, reject video files over 50 MB, reject font files over 10 MB, merge a sparse override without erasing global fields, and fall back to the site font/static background after a simulated load error.

```js
assert.equal(validateMediaDescriptor('video', { source: 'https://cdn.example/video.mp4' }).ok, true)
assert.equal(validateMediaDescriptor('video', { source: 'http://cdn.example/video.mp4' }).ok, false)
assert.equal(validateMediaDescriptor('font', { size: 10 * 1024 * 1024 + 1 }).ok, false)
```

- [ ] **Step 2: Run media tests and verify failure.**

Run: `node --test test/skin-media.test.js --test-name-pattern="HTTPS|size|preset|fallback"`

Expected: FAIL because the IndexedDB adapter, validators, and presets do not exist.

- [ ] **Step 3: Implement the IndexedDB media store.**

Use a dedicated database/store and a single record per uploaded media id. Revoke object URLs when replacing/removing a record. Return a typed result `{ ok, id, reason }` instead of throwing user-facing validation errors.

- [ ] **Step 4: Implement A/B/C presets and the unified appearance Sheet.**

Render preset buttons first, then controls for background source, opacity, blur, font, font size, text/accent color, radius, and motion. Use one scroll container, realtime preview, debounced persistence, and explicit “恢复默认外观/布局” buttons. Keep default state A.

- [ ] **Step 5: Implement fallback and accessibility labels.**

On failed video load set the effective background to static and show a toast; on failed font load remove the custom face and retain the site font. Add labels, current values, keyboard range controls, and `aria-live` status for failed media.

- [ ] **Step 6: Run focused tests and commit.**

Run: `node --test test/skin-media.test.js test/skin-canvas.test.js --test-name-pattern="HTTPS|size|preset|fallback|appearance"`; then `git diff --check`.

```bash
git add plugins/skin.user.js test/skin-media.test.js test/skin-canvas.test.js
git commit -m "feat: add customizable glass appearance"
```

### Task 7: Migrate old three-column settings and implement lifecycle cleanup

**Files:**
- Modify: `plugins/skin.user.js` migration/dispose code
- Modify: `src/shell-boot.js` config watcher if the new canvas enable flag changes document-start behavior
- Modify: `test/skin-canvas.test.js`
- Modify: `test/skin.test.js`

**Interfaces:**
- Consumes: `migrateLegacySkinState`, media store, `mountCanvas`, `unmountCanvas`.
- Produces: one-time `legacyLayoutSnapshot`, new canvas state version 2, restore-default actions, and complete `api.onDispose()` cleanup.

- [ ] **Step 1: Write failing migration and cleanup tests.**

Preload old `shell`, wallpaper, opacity, blur, and layout values. Assert the new state has A defaults plus recognized overrides, a snapshot is written once, old positions are not rendered as fixed columns, and `LSB.disable('skin')` removes classes, surfaces, listeners, and object URLs.

- [ ] **Step 2: Run migration tests and verify failure.**

Run: `node --test test/skin-canvas.test.js test/skin.test.js --test-name-pattern="legacy|迁移|dispose|收摊|restore"`

Expected: FAIL because the old shell migration currently creates the rail/aside layout and does not save a canvas snapshot.

- [ ] **Step 3: Implement one-time migration and defaults reset.**

Guard by `canvasState.version`. On first run write `legacyLayoutSnapshot`, migrate recognized media/theme values, create default surface positions for the current width bucket, and never overwrite an existing version 2 site override. Reset actions replace only the selected global/site layout or appearance scope.

- [ ] **Step 4: Implement complete cleanup.**

Use one owner token for listeners and observers. In `onDispose`, clear timers/RAF, abort media loads, revoke object URLs, remove injected style and host, restore hidden native nodes, and restore focus/scroll state.

- [ ] **Step 5: Run focused lifecycle tests and commit.**

Run: `node --test test/skin-canvas.test.js test/skin.test.js --test-name-pattern="legacy|迁移|dispose|收摊|restore"`; then `git diff --check`.

```bash
git add plugins/skin.user.js src/shell-boot.js test/skin-canvas.test.js test/skin.test.js
git commit -m "feat: migrate legacy shell and clean up canvas"
```

## M17.3 — Content Context, AI, Citations, and Regression

### Task 8: Add navigation Sheet, site card, and contextual post actions

**Files:**
- Modify: `plugins/skin.user.js` surface renderers and action delegates
- Modify: `test/skin-canvas.test.js`
- Modify: `test/skin.test.js` native action preservation cases

**Interfaces:**
- Consumes: SurfaceManager, PageAdapter metadata, `api.forums`, native post action nodes.
- Produces: `navigation-sheet`, `site-card`, `context-pill`, and native action delegation without cloned write controls.

- [ ] **Step 1: Write failing surface tests.**

Assert navigation lists current site/recent/favorites/search, site card shows site identity and a settings link, selecting a text range opens the context pill, and clicking a delegated reply/quote/favorite action activates the native control.

- [ ] **Step 2: Run focused tests and verify failure.**

Run: `node --test test/skin-canvas.test.js test/skin.test.js --test-name-pattern="导航|站点卡|context|回复|引用|收藏"`

Expected: FAIL because these surfaces do not exist.

- [ ] **Step 3: Implement navigation and site renderers.**

Read current page/forum data only; do not fetch the home page or clone sidebars. Keep links as real anchors. Restore the saved scroll anchor after a navigation item is chosen.

- [ ] **Step 4: Implement contextual action delegation.**

Use `Selection`/pointer target to position the pill near the current content. Delegate to the existing native reply/quote/favorite controls; do not create a second form or POST path. Return focus to the selected post after closing.

- [ ] **Step 5: Run focused tests and commit.**

Run: `node --test test/skin-canvas.test.js test/skin.test.js --test-name-pattern="导航|站点卡|context|回复|引用|收藏"`.

```bash
git add plugins/skin.user.js test/skin-canvas.test.js test/skin.test.js
git commit -m "feat: add on-demand navigation and content actions"
```

### Task 9: Connect the floating AI card to M12 and M14 contracts

**Files:**
- Modify: `plugins/skin.user.js` AI surface/context bridge
- Modify: existing AI integration module only where its public RPC contract requires a surface target
- Modify: `test/skin-canvas.test.js`
- Modify: the existing AI tests covering history, cancellation, streaming, and citations

**Interfaces:**
- Consumes: `ContextController`, existing AI request/cancel/stream RPC, M12 history fingerprint, M14 citation reread/diff RPC.
- Produces: `ai-card` with material cancel, stop, retry, stream rendering, and citation status display.

- [ ] **Step 1: Write failing integration assertions.**

Cover new-session isolation, limited read-only history, material `×` scope, stop/late-response discard, manual retry, stream/whole-response rendering, and citation statuses inside the card.

- [ ] **Step 2: Run the AI-focused tests and verify failure.**

Run the existing AI test files with `--test-name-pattern="历史|取消|停止|重试|流式|引用|新鲜|差异|写操作"`.

Expected: FAIL only on the new surface assertions; existing M12/M14 behavior must remain green.

- [ ] **Step 3: Implement ContextController bridge.**

At send time build a snapshot with route, selected text, current materials, session id, and limited history. Pass only read-only history to the model adapter. Keep the request abort signal connected to the card Stop control and discard any response whose generation token is stale.

- [ ] **Step 4: Implement card states.**

Render idle, sending, streaming, complete, failed, stopped, and citation-review states. Keep the failed question in the composer. On retry create a new model request without replaying any prior confirmed site write.

- [ ] **Step 5: Implement M14 evidence cards.**

When a citation badge is clicked, call the existing lazy reread/diff path for cited floors and render `fresh`, `changed`, or `unavailable` with the local material version.

- [ ] **Step 6: Run AI tests and commit.**

Run the focused AI test command, then `node --test test/skin-canvas.test.js`; expected result is all existing and new tests green.

```bash
git add plugins/skin.user.js test/skin-canvas.test.js
git commit -m "feat: connect canvas AI card to M12 and M14"
```

### Task 10: Update version metadata, suite output, and complete regression verification

**Files:**
- Modify: `plugins/skin.user.js` header and manifest version together
- Modify: `src/core.js` and `package.json` only when the base bootstrap changed version requirements
- Modify: `build-suite.mjs` `SUITE_VERSION`
- Modify: `test/suite.test.js` only if version assertions require the new synchronized values
- Modify: `README.md` only if the existing plugin table documents the changed skin behavior

**Interfaces:**
- Consumes: all completed M17 tasks and current version sources.
- Produces: synchronized source and distribution metadata with no new ORDER entry.

- [ ] **Step 1: Add failing version/suite assertions if the repository has no coverage for the new skin version.**

Assert that the plugin header version equals `manifest.version`, the suite banner contains the same skin version, and base `package.json` equals `src/core.js` when both were changed.

- [ ] **Step 2: Run the version check and verify the expected failure before bumping.**

Run: `node --test test/suite.test.js --test-name-pattern="version|skin|套件"`.

Expected: FAIL only if the new feature requires version changes and the source values are still old.

- [ ] **Step 3: Bump synchronized patch versions.**

Increment the skin header and manifest together; increment `build-suite.mjs` `SUITE_VERSION`; increment base `src/core.js` and `package.json` together only when `src/shell-boot.js` changes require a base release. Keep `suite/order.js` unchanged.

- [ ] **Step 4: Run the complete verification suite.**

Run:

```bash
npm test
npm run build
npm run verify:dist
git diff --check
```

Expected: all tests pass, both distributions build, suite membership/version checks pass, and the diff has no whitespace errors.

- [ ] **Step 5: Perform real-browser acceptance.**

Load the built scripts in a real browser at `https://linux.sb/` and verify each page type at wide, mid, and narrow viewport widths. Exercise: single canvas/no native left sidebar inside shell; status collapse; capsule/Sheet; navigation/site/AI/appearance surfaces; drag/resize; A/B/C presets; HTTPS/local media limits; reduced motion/transparency; AI stop/retry/stream; citation reread/diff; native reply/favorite/write confirmation; disable/reenable cleanup.

- [ ] **Step 6: Commit the release metadata and verification notes.**

```bash
git add plugins/skin.user.js src/core.js package.json build-suite.mjs test/suite.test.js README.md
git commit -m "release: ship M17 single canvas shell"
```

Do not include generated `dist/` files in the commit unless the repository’s existing release workflow tracks them; report the exact build artifacts and browser checks in the final handoff.

## Final Handoff Checklist

- [ ] M17.1 tasks 1–4 pass focused tests and leave no fixed rail/aside structure.
- [ ] M17.2 tasks 5–7 pass state, media, migration, drag/resize, and cleanup tests.
- [ ] M17.3 tasks 8–10 pass navigation, content actions, AI/M12, M14 citation, build, and browser tests.
- [ ] `skin:debug().canvas` contains only serializable state and reports the effective site/width/preset.
- [ ] Existing native DOM remains the source of truth for forms and writes.
- [ ] A is the default visual preset; B and C and all requested appearance controls are reachable from one Sheet.
- [ ] The written M17 spec and this plan remain committed before implementation begins.
