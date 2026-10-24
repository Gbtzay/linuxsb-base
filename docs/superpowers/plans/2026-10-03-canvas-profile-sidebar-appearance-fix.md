# Canvas Profile, Sidebar and Appearance Fix Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task. This workspace explicitly forbids subagents. Steps use checkbox (`- [ ]`) syntax.

**Goal:** Fill the canvas gap with the real personal card, expose the real site sidebar inside the site information surface, and make appearance overrides survive reloads and route refreshes.

**Architecture:** Keep `aside.sidebar` in its native DOM and hidden. Temporarily move only its real `.user-card` into an inline profile slot and the remaining real `.sidebar-card` nodes into a scrollable site-information body; record each original parent/sibling and restore them on close, route replacement, disable, and dispose. Keep appearance state in versioned `canvas-state:v2`, with explicit site override cleanup and reload regression coverage.

**Tech Stack:** Existing userscript DOM lifecycle, JSDOM/node:test, canvas surface manager, current storage/media APIs.

## Global Constraints

- Do not clone or rebuild native profile/sidebar cards.
- Do not move `aside.sidebar` or any native left navigation container into `#lsb-shell`.
- Preserve native links, forms, CSRF, and existing write-action safety chains.
- Keep appearance values validated by the existing shell-style/media validators.
- Run focused tests, full `npm test`, build, `npm run verify:dist`, and `git diff --check`.

---

### Task 1: Add failing DOM and persistence tests

**Files:**
- Modify: `test/skin-canvas.test.js`
- Modify: `test/fixtures/topic1.html` only if a required marker is missing

- [x] Add a test that finds a visible `data-canvas-profile-slot` before the first post, contains the original `.sidebar-card.user-card` node, and leaves `aside.sidebar` outside `#lsb-shell`.
- [x] Add a test that opens `site-card`, verifies its scroll body contains the real non-profile sidebar cards, and verifies closing/disable restores their original parent.
- [x] Add a test that changes an appearance value, creates a fresh DOM from the saved `canvas-state:v2`, and verifies the control value, CSS variable, preset and site override are retained.
- [x] Run the focused tests and confirm the new assertions fail for the missing slot/sidebar body or lost state.

### Task 2: Mount and restore real profile/sidebar nodes

**Files:**
- Modify: `plugins/skin.user.js`

- [x] Add a profile slot in the reading outlet before the existing first content node, with compact glass/card CSS that reserves only the status-to-content gap.
- [x] Add `data-canvas-site-sidebar` inside `site-card` and move real sidebar cards into it on open; exclude `.user-card`, mobile drawers, and native left rails.
- [x] Reuse the existing parent/sibling restoration pattern and make it idempotent across SPA route refreshes, repeated opens, disable, and dispose.
- [x] Sync profile/sidebar content when the site DOM changes without cloning or duplicating cards.

### Task 3: Close the appearance persistence loop

**Files:**
- Modify: `plugins/skin.user.js`
- Modify: `test/skin-canvas.test.js`

- [x] Normalize appearance control values from the effective merged state, including empty site overrides and select/range controls.
- [x] Persist each validated edit under the current origin, keep global presets separate from site overrides, and remove only the current site override on reset.
- [x] Re-read state after config and route refresh, reapply CSS/media tokens, and expose a status message for saved/rejected values.
- [x] Run focused tests and confirm reload, reset, invalid URL, and media fallback behavior.

### Task 4: Full verification and generated artifacts

- [x] Run `node --check plugins/skin.user.js` and focused canvas/media/style tests.
- [x] Run `npm test`, `npm run build`, `npm run verify:dist`, and `git diff --check`.
- [x] Run browser acceptance scripts when available and report any unavailable dependency explicitly.
