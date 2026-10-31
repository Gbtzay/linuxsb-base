# Hydrogen Core Optimizations Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Correct cross-tab GM cache invalidation, restore concurrent page GET deduplication, and bound DOM scanning to newly added subtrees.

**Architecture:** Keep the existing Store, RequestBroker, and DomWatcher interfaces. Cache only when GM changes can be observed; share eligible in-flight reads after each caller's validation, with independent cancellation; remove overlapping mutation roots before querying rules.

**Tech Stack:** JavaScript ES modules, Node test runner, jsdom, esbuild, Playwright.

**Spec:** The three locally reproduced issues accepted in this conversation; project constraints in `docs/CONVENTIONS.md`.

## Global Constraints

- Preserve existing uncommitted work on `codex/integrate-origin-main`; perform this follow-up in the current workspace and leave changes reviewable without committing or publishing.
- Do not change the public Hydrogen/Oxygen names, plugin membership, site request rate, write confirmations, or AI release/developer split.
- Core behavior changes require Hydrogen 2.4.1 -> 2.4.2; synchronize package metadata, current documentation, tests, and generated distributions.
- Keep source files UTF-8 without BOM and LF terminated.
- Tests must exercise observable behavior. Network/GM mocks replace only external boundaries; DOM scanning checks use real jsdom nodes.

## Task 1: GM cache consistency

**Files:** `src/store.js`, `test/store.test.js`.
**Interface:** Preserve `Store.get/set/del/update/watch`; `watch` remains a local Store notification API.

- [ ] Add tests for externally replaced/deleted values, repeated same-key reads, unavailable/failed listener registration, local writes after remote updates, and failed persistence.
- [ ] Run `node --test --test-force-exit test/store.test.js` and confirm stale reads fail.
- [ ] Subscribe once per cached GM key and invalidate cached values on changes; bypass caching without a usable listener. Keep backend changes from mixing cached data between GM contexts.
- [ ] Re-run Store tests and core integration tests.

```js
assert.equal(store.get('value').n, 1)
gm.writeFromOtherTab(key, { n: 2 })
assert.equal(store.get('value').n, 2)
gm.deleteFromOtherTab(key)
assert.equal(store.get('value', 'missing'), 'missing')
```

## Task 2: Request deduplication

**Files:** `src/runtime/request-broker.js`, `test/runtime-request-broker.test.js`, `test/core.test.js`.
**Interface:** Keep `RequestBroker.request(intent)` and plugin `api.net.doc` unchanged; each response remains caller-owned.

- [ ] Add tests for concurrent identical plugin reads and broker reads, separate headers/owners/options, cancellation of one/all consumers, timeout, failure cleanup, and excluded writes/streams/external calls.
- [ ] Run the broker/core tests; confirm simultaneous identical reads issue two transports before the fix.
- [ ] Share only same-owner, same-route, same-options, non-streaming same-origin GETs without bodies, after permissions/URL/route validation. Use reference-counted consumers so cancelling one does not cancel another; discard completed/abandoned entries immediately.
- [ ] Keep transport retries/rate limits and per-caller response parsing/diagnostics. Verify a later fresh GET starts a new request and permission/route checks cannot be bypassed through a shared request.

```js
const results = await Promise.all([api.net.doc('/topic/1'), api.net.doc('/topic/1')])
assert.equal(networkCalls, 1)
assert.notEqual(results[0], results[1])
```

## Task 3: Incremental DOM scanning

**Files:** `src/dom.js`, `test/dom.test.js`.
**Interface:** Preserve onEach once-per-element behavior and posts/list events; scanCount is diagnostic, not a query-cost guarantee.

- [ ] Replace the parent-scan implementation assertion with a behavior/cost regression: 1,000 existing rows, ten batches of twenty additions, only 200 new callback targets.
- [ ] Add overlapping parent/child mutation roots, descendant rules, and callback/event deduplication cases.
- [ ] Confirm the old algorithm fails the candidate/query-volume budget.
- [ ] Keep only topmost added roots, then scan those subtrees instead of existing parent containers; reuse the roots for post/list extraction.
- [ ] Run DOM and dependent reader/skin regression tests.

```js
assert.equal(newCallbacks.length, 200)
assert.ok(checkedCandidates <= 400)
assert.equal(new Set(newCallbacks).size, 200)
```

## Task 4: Integration and verification

**Files:** `src/core/core-version.js`, `package.json`, `package-lock.json`, relevant current documentation/version assertions, `dist/*`.

- [ ] Bump Hydrogen to 2.4.2 without rewriting earlier historical plans or unrelated plugin versions.
- [ ] Build developer and release outputs, then run `npm run verify:profiles` and `npm run verify:test-skips`.
- [ ] Run `npm run test:all`, then `npm run smoke:browser` against rebuilt artifacts.
- [ ] Inspect diffs, check whitespace, verify unrelated existing changes were preserved, and report measured behavior and any remaining limitations.

## Execution record

- Baseline: 93 targeted tests passed before changes. Confirmed stale GM read (1 after external update to 2), duplicate plugin GETs (2 versus 1 through legacy Net.doc), and 11,100 candidate checks for 200 added rows over a 1,000-row initial list.
- Ruling: Continue in the existing feature checkout because the user authorized changes to the inspected working tree, which already contains integration work. Do not move or reset that work.
