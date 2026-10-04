# Read Model and SiteAdapter Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use `superpowers:executing-plans` to execute this plan task-by-task. The user prohibits subagents; execute inline. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Convert current and fetched linux.sb HTML into a versioned PageDocument and safe RichText AST for the first read-only route family.

**Architecture:** Keep selectors in the site adapter boundary. Pure model builders receive a document and route, normalize text/links/media/actions, validate schema and return either a complete PageDocument or a structured fallback reason. No renderer or write request is allowed in this unit.

**Tech Stack:** JavaScript ES modules, JSDOM fixtures, node:test, existing `src/site.js` parsers and route builders.

**Spec:** `docs/superpowers/specs/2026-10-05-full-runtime-ui-rebuild-design.md`

## Global Constraints

- First route family: home, forum, topic, user and search.
- Preserve existing `src/site.js` route semantics and server HTML selectors while moving selector knowledge behind adapters.
- RichText output is structured data; dangerous URLs, styles, event attributes and raw HTML are rejected.
- Models never contain CSRF values, cookies, authorization, arbitrary query secrets or executable HTML.
- No userscript version bump until source code or manifests change; Read Model API release floor is base `0.2.1` and skin `2.0.1`.

---

### Task 1: Define model and AST contracts with failing fixtures

**Files:**
- Create: `src/reader/model.js`
- Create: `src/reader/rich-text.js`
- Create: `test/reader-model.test.js`
- Create: `test/reader-rich-text.test.js`
- Reuse: `test/fixtures/home.html`, `test/fixtures/topic1.html`, `test/fixtures/user1.html`

**Interfaces:**
```js
buildPageDocument({ doc, location, source, requestId }) -> PageDocument | ModelError
validatePageDocument(model) -> { ok: true, value } | { ok: false, code, path }
parseRichText(root, options) -> RichTextNode[]
```

- [ ] **Step 1: Add home/forum/topic/user/search expected model snapshots.** Assert route, title, IDs, pagination, viewer capability flags and list/post counts without storing DOM nodes.
- [ ] **Step 2: Add RichText safety tests.** Feed script elements, `javascript:` links, event attributes, CSS URLs, images and code blocks; assert only safe AST nodes remain.
- [ ] **Step 3: Add model validator tests.** Reject missing schemaVersion, route mismatch, duplicate IDs, unknown content type and action payloads containing secrets.
- [ ] **Step 4: Run the red suite.** Run `node --test test/reader-model.test.js test/reader-rich-text.test.js`; record missing implementation failures.

### Task 2: Implement RichText AST and safe primitives

**Files:**
- Modify: `src/reader/rich-text.js`
- Modify: `src/site.js` only to expose selector-scoped rich-text roots
- Test: `test/reader-rich-text.test.js`

- [ ] **Step 1: Implement text normalization.** Collapse non-semantic whitespace, preserve intentional line breaks, cap node text lengths and mark truncation in metadata.
- [ ] **Step 2: Implement allowlisted node parsing.** Support paragraph, heading, link, image, code, quote, list, listItem, lineBreak and emoji; ignore unknown tags while retaining safe text.
- [ ] **Step 3: Implement URL validation.** Allow same-origin paths and HTTPS media links; reject `javascript:`, `data:` except validated image data if the existing site uses it, `vbscript:`, credentials and cross-origin form actions.
- [ ] **Step 4: Implement media descriptors.** Return `{ src, alt, width, height, kind }` without loading or fetching media in the parser.
- [ ] **Step 5: Run the AST tests.** Run `node --test test/reader-rich-text.test.js` and verify all dangerous input assertions pass.

### Task 3: Implement PageDocument model builders

**Files:**
- Modify: `src/reader/model.js`
- Create: `src/reader/model-validate.js`
- Modify: `src/site.js` to delegate current pure parsers where possible
- Test: `test/reader-model.test.js`

**Interfaces:**
```js
const PAGE_SCHEMA_VERSION = 1
const PAGE_TYPES = ['home','forum','topic','user','search','unknown']
```

- [ ] **Step 1: Build the common envelope.** Read origin, route, title, current user identity and capability booleans; expose only `csrfPresent`.
- [ ] **Step 2: Build `ListPage`.** Normalize topic id/title/author/forum/stats/badges/time, stable href and pagination from existing `site.parseList` results.
- [ ] **Step 3: Build `TopicPage`.** Normalize topic metadata, main post, replies, floor, author, quote/media AST, pagination and reply/favorite/interaction descriptors.
- [ ] **Step 4: Build `UserPage`.** Normalize profile identity, active tab, user list items, pagination and self/guest capability flags.
- [ ] **Step 5: Build `SearchPage`.** Normalize query, field, list items, pagination and source route without retaining raw query credentials.
- [ ] **Step 6: Validate each result before returning.** A missing required field returns `ModelError` with a safe path and fallback reason.
- [ ] **Step 7: Run model tests.** Run `node --test test/reader-model.test.js test/site.test.js`.

### Task 4: Add network/document parity and route catalog

**Files:**
- Create: `src/reader/route-catalog.js`
- Modify: `src/site.js`
- Modify: `src/core.js` parse exports
- Test: `test/reader-route-catalog.test.js`, `test/site.test.js`

- [ ] **Step 1: Define route records.** Map every current `detectPage()` type to `{ type, pathPattern, adapter, readOnly, fallback }`; unknown paths are explicit fallback records.
- [ ] **Step 2: Add `parseDocument` API.** Expose `api.reader.parseDocument(doc, location, options)` through Core v2 without granting network or write access.
- [ ] **Step 3: Compare initial DOM and fetched HTML.** Parse each fixture both as current document and as a DOMParser result; assert stable JSON after removing provenance timestamps.
- [ ] **Step 4: Add route mismatch rejection.** A `/topic/1` document parsed for `/topic/2` must fail closed instead of rendering the wrong page.
- [ ] **Step 5: Run route/model parity tests.** Run `node --test test/reader-route-catalog.test.js test/reader-model.test.js`.

### Task 5: Add fixtures for fallback and hostile content

**Files:**
- Create: `test/fixtures/search.html`
- Create: `test/fixtures/malformed-topic.html`
- Create: `test/fixtures/hostile-rich-text.html`
- Modify: `test/reader-model.test.js`

- [ ] **Step 1: Add a valid search fixture.** Include query, field, rows, pagination and user identity markers used by the adapter.
- [ ] **Step 2: Add malformed and hostile fixtures.** Include missing post IDs, mismatched canonical links, dangerous URLs and nested unknown markup.
- [ ] **Step 3: Assert safe fallback reasons.** The model returns a stable code such as `model.required-field` or `model.route-mismatch`; no raw HTML appears in the reason.
- [ ] **Step 4: Run all reader model tests.** Run `node --test test/reader-model.test.js test/reader-rich-text.test.js test/reader-route-catalog.test.js`.

### Task 6: Version and expose the Read Model gate

**Files:**
- Modify: `src/core.js` version to `0.2.1`
- Modify: `package.json`, `package-lock.json`
- Modify: `test/core.test.js`, `test/suite.test.js`
- Modify: `README.md`, `docs/CONVENTIONS.md`

- [ ] **Step 1: Update base version assertions.** Keep `@version`, package version and runtime `VERSION` synchronized.
- [ ] **Step 2: Document the PageDocument schema.** Link the model contract and state that it excludes CSRF and raw HTML.
- [ ] **Step 3: Build and verify.** Run `npm run build`, `npm run verify:dist` and the focused reader tests.
- [ ] **Step 4: Run the full suite.** Run `npm test`; do not begin Reader Runtime until all existing and new model tests pass.

