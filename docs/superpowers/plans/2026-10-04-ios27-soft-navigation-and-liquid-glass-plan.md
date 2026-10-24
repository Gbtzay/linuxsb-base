# iOS 27 Soft Navigation And Liquid Glass Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Keep the single canvas continuous during soft navigation and bring its navigation, sheets, background layering, and motion behavior in line with the confirmed iOS 27 Liquid Glass design.

**Architecture:** `plugins/skin.user.js` remains the integration boundary. The SPA transaction keeps the existing shell and replaces only the route outlet, while a content-scoped transition layer communicates loading and prevents native UI exposure. CSS tokens and data attributes provide one glass navigation/sheet model with reduced-motion and reduced-transparency fallbacks.

**Tech Stack:** Userscript JavaScript, CSS custom properties, JSDOM tests, Playwright browser smoke tests, existing build scripts.

**Spec:** `docs/superpowers/specs/2026-10-04-ios27-soft-navigation-and-liquid-glass-design.md`

## Global Constraints

- Do not use subagents; execute every task in this session.
- Every plugin development push increments the affected userscript version; skin starts at `1.1.73` and the new revision is `1.1.74`.
- Preserve the current media safety contract: body-level image/video layers use `z-index:0` and `pointer-events:none`.
- Keep the current supported SPA routes and full-page topic/transaction routes unchanged.
- Respect `prefers-reduced-motion` and `prefers-reduced-transparency`.
- Use `apply_patch` for manual edits and do not reset unrelated worktree changes.

---

### Task 1: Add failing soft-navigation and glass contracts

**Files:**
- Modify: `test/skin.test.js` near the existing SPA navigation tests
- Modify: `test/skin-canvas.test.js` near the existing canvas surface tests
- Modify: `scripts/ios27-canvas-smoke.mjs` to cover a real browser soft hop

**Interfaces:**
- Consumes the current `loadBase`, `makeHome`, fixture HTML, and Playwright smoke server.
- Produces assertions for the content-scoped transition layer, stable navigation chrome, route transaction state, and glass token fallbacks.

- [ ] **Step 1: Write the failing JSDOM soft-hop test**

  Add a test that starts from the home fixture, clicks a `/forum/4` link, and asserts immediately after the click that `#lsb-shell-route-transition` exists, `#lsb-shell-route-shield` is absent or not full viewport, the top status and tool capsule remain connected, and the old route outlet is still present while the fetch is pending.

- [ ] **Step 2: Run the focused test to verify it fails**

  Run `node --test test/skin.test.js --test-name-pattern="软跳过渡层保持画布连续"`. It must fail because the current code creates the full-screen `#lsb-shell-route-shield` and has no content-scoped transition element.

- [ ] **Step 3: Write the failing visual contract test**

  Add a canvas test that reads `#lsb-skin-style` and asserts the navigation/sheet rules contain the glass token variables, a content-opaque rule, a drag indicator, and reduced-transparency fallback. Assert the route transition has a bounded content inset rather than `inset:0`.

- [ ] **Step 4: Run the focused canvas test to verify it fails**

  Run `node --test test/skin-canvas.test.js --test-name-pattern="Liquid Glass 导航与过渡令牌"`. It must fail against the current style text.

- [ ] **Step 5: Extend the Playwright smoke test**

  Add a fixture response for `/forum/4`, click a same-origin forum link, sample the DOM before the response resolves, and verify the original top status node remains the same node, native header/sidebar computed display is `none`, and the transition layer is scoped below the top status bar. Capture a screenshot under `artifacts/ios27-canvas/soft-hop-wide.png`.

### Task 2: Replace the full-screen route shield with a content transaction layer

**Files:**
- Modify: `plugins/skin.user.js:1289-1315, 5075-5305`
- Modify: `test/skin.test.js` with the Task 1 assertions

**Interfaces:**
- `showRouteShield()` becomes `showRouteTransition()` and returns the transition element.
- `hideRouteShield()` becomes `hideRouteTransition(serial)` and only settles the matching transaction.
- `navigateSpa()` owns `data-lsb-route-phase` values and keeps the existing `spaSerial` cancellation guard.

- [ ] **Step 1: Implement the content-scoped transition element**

  Create `#lsb-shell-route-transition` inside the canvas surface layer. Give it `aria-hidden="true"`, a progress element, and CSS variables for the content inset. Keep the old route outlet visible until `commitRoute()` succeeds.

- [ ] **Step 2: Mark native elements hidden before replacement**

  Call `markNative(true)` before importing and replacing the remote outlet, and run `hideNativeSidebars(remoteOutlet)` before any nodes become connected. The transition layer must cover only the content region.

- [ ] **Step 3: Add transaction phases and stale guards**

  Set `document.documentElement.dataset.lsbRoutePhase` to `preparing`, `fetching`, `committing`, and `settled`; clear it on error. Every delayed callback checks both `serial === spaSerial` and the transition element identity before changing opacity or `hidden`.

- [ ] **Step 4: Fade the committed outlet without hiding chrome**

  After `fillShell()` and `notifyRoute()`, set the transition element to `settling`, wait one animation frame, then remove the phase and hide the transition. The top status and tool capsule retain their DOM identity throughout.

- [ ] **Step 5: Run the focused SPA tests**

  Run `node --test test/skin.test.js --test-name-pattern="软跳过渡层保持画布连续|软跳后超过 50ms 仍是同一颗壳|探针开着时软跳"` and confirm all selected tests pass.

### Task 3: Establish the iOS 27 Liquid Glass token and surface system

**Files:**
- Modify: `plugins/skin.user.js:1000-1150, 4110-4170`
- Modify: `src/shell-style.js` only if a new validated token is required
- Modify: `test/skin-canvas.test.js`

**Interfaces:**
- CSS consumes `--lsb-glass-fill`, `--lsb-glass-border`, `--lsb-glass-highlight`, `--lsb-glass-shadow`, `--lsb-glass-blur`, and `--lsb-glass-saturation`.
- Surface markup keeps existing `data-surface` identifiers so AI and plugin integrations remain compatible.

- [ ] **Step 1: Add the failing token assertions**

  Assert the generated style declares the glass tokens, uses them for `top-status` and `tool-capsule`, keeps route content opaque, and provides `prefers-reduced-transparency` and `prefers-reduced-motion` fallbacks.

- [ ] **Step 2: Implement the shared glass CSS**

  Add one glass rule for fixed navigation/control surfaces with a translucent fill, `backdrop-filter: blur(...) saturate(...)`, inset highlight, one outer shadow, and a solid fallback. Keep `main.wrap`, post rows, and article bodies on opaque content tokens.

- [ ] **Step 3: Implement adaptive Sheet geometry**

  Add a drag indicator to every Sheet header, use a single surface background, and apply desktop floating geometry plus narrow-screen bottom-sheet geometry with safe-area variables. Preserve current resize handles for desktop AI/site cards.

- [ ] **Step 4: Implement stateful surface transitions**

  Replace abrupt `hidden` appearance with `data-canvas-surface-state="opening|open|closing"` while keeping `aria-hidden` authoritative. Use opacity and translate/scale transitions and make the close path remove the element only after the transition duration.

- [ ] **Step 5: Run the focused canvas tests**

  Run `node --test test/skin-canvas.test.js --test-name-pattern="Liquid Glass 导航与过渡令牌|Sheet|画布"` and verify the existing surface behavior still passes.

### Task 4: Refine route title continuity, background readability, and reduced-motion behavior

**Files:**
- Modify: `plugins/skin.user.js:1046-1148, 4116-4210, 4306-4488`
- Modify: `src/shell-boot.js` if the boot placeholder needs the same glass-safe background token
- Modify: `test/skin-canvas.test.js` and `scripts/ios27-canvas-smoke.mjs`

**Interfaces:**
- `canvasSyncText()` and `syncShellRoute()` update existing title/context nodes without recreating navigation surfaces.
- `syncBackgroundMedia()` keeps image/video layers behind content and applies readability classes.

- [ ] **Step 1: Add title and media regression assertions**

  Assert the top status node identity survives a route change, title updates once, media layers remain behind content, and reduced-motion disables transition durations.

- [ ] **Step 2: Implement title morph classes**

  Add a short `data-route-transition="in|out"` state to the title/context nodes, update text in place, and clear it after the same frame used to settle the route transition.

- [ ] **Step 3: Add readability layer tokens**

  Add a body-level `data-lsb-shell-media` class and a pseudo-element or dedicated layer with a configurable dark/light scrim. Do not change `pointer-events:none` or the existing media source validation.

- [ ] **Step 4: Add reduced-motion and reduced-transparency handling**

  Set zero transition duration and disable title transform, sheet spring, and media opacity animation when the user preference or stored appearance setting requests reduced motion/transparency.

- [ ] **Step 5: Run browser smoke checks**

  Run `npm run smoke:ios27` and `node scripts/check-skin-browser.mjs`. Verify the new soft-hop screenshot and content pixel checks.

### Task 5: Bump version, regenerate artifacts, update documentation, and run full verification

**Files:**
- Modify: `plugins/skin.user.js` userscript header and manifest version to `1.1.74`
- Modify: `README.md` and `docs/CONVENTIONS.md`
- Modify: `dist/linuxsb-base.user.js`, `dist/linuxsb-suite.user.js`, `dist/linuxsb-lts.user.js` through the existing build scripts
- Modify: version assertions in `test/core.test.js` and `test/suite.test.js` only if a shared base/suite version changes

**Interfaces:**
- Build artifacts must contain current plugin source and a single valid userscript header.
- Documentation must state the current skin version and the new soft-navigation/content-layer behavior.

- [ ] **Step 1: Update documentation and version assertions**

  Replace the skin version in the README and conventions document, and update tests that read the current skin version. Keep base/Oxygen versions unchanged unless production changes require a shared base export change.

- [ ] **Step 2: Build all artifacts**

  Run `npm run build` and inspect that the generated headers and embedded skin source report `1.1.74`.

- [ ] **Step 3: Run the full test suite**

  Run `npm test`; expected result is zero failures.

- [ ] **Step 4: Run artifact and browser verification**

  Run `npm run verify:dist`, `npm run smoke:ios27`, and `node scripts/check-skin-browser.mjs`. Keep any existing JSDOM navigation warnings documented as test-environment output only when the test exit code is zero.

- [ ] **Step 5: Review the final diff**

  Run `git diff --stat`, `git diff --check --ignore-space-at-eol`, and inspect the changed skin, tests, docs, and generated artifacts without reverting unrelated worktree changes.

