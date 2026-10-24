# AI 工作台统一对话框 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 将 AI 工作台输入区改成参考 Smart 输入框的单一紧凑 composer，移除 `@ 当前页面` 和 `/ 提问类` 可见选项，同时保留现有能力和安全边界。

**Architecture:** 只改 `ai-workbench` 的呈现层和交互入口：内部继续保存 `capability` 与 `contextKind`，但由当前路由自动决定上下文，由 Smart 菜单选择能力。低频会话操作放进 `＋` 菜单，模型设置放进 Smart 菜单；请求分发、停止、历史和写操作执行逻辑保持不变。

**Tech Stack:** 原生 JavaScript、DOM、Node.js `node:test`、现有浏览器验收脚本。

## Global Constraints

- 不提交、不推送、不 reset/clean 工作树。
- 不引入新依赖，不改变 AI 权限和写操作确认流程。
- composer 不展示 `@ 当前页面`、`@ 当前帖子`、`@ 活动追踪` 或 `/ 提问类` 控件。
- 现有只读能力、上下文自动选择、连续对话、停止、重试和引用验证必须保持可用。

### Task 1: 锁定新的 composer DOM 契约

**Files:**
- Modify: `test/ai-workbench.test.js`
- Test: `test/ai-workbench.test.js`

**Interfaces:**
- Consumes: `makeSite()` and `load()` workbench fixtures.
- Produces: assertions for `data-ai-chat-composer`, `data-ai-chat-plus`, `data-ai-chat-smart`, `data-ai-chat-send`, and absence of context/mode selects.

- [ ] **Step 1: Write the failing test**

Add a test after the existing unified workbench UI tests:

```js
test('AI 工作台：统一 composer 移除 @ 和 / 选项', async () => {
  const w = makeSite()
  await load(w)
  const composer = w.document.querySelector('[data-ai-chat-composer]')
  assert.ok(composer)
  assert.ok(composer.querySelector('[data-ai-chat-plus]'))
  assert.ok(composer.querySelector('[data-ai-chat-smart]'))
  assert.ok(composer.querySelector('[data-ai-chat-send]'))
  assert.equal(composer.querySelector('[data-ai-chat-context]'), null)
  assert.equal(composer.querySelector('[data-ai-chat-mode]'), null)
  assert.equal(composer.querySelector('[data-ai-chat-mode-options]'), null)
  assert.doesNotMatch(composer.textContent, /@ 当前页面|\/ 提问/)
})
```

- [ ] **Step 2: Run test to verify it fails**

Run: `node --test test/ai-workbench.test.js --test-name-pattern="统一 composer 移除"`

Expected: FAIL because the current composer still renders the context and capability selects and has no `data-ai-chat-plus` or `data-ai-chat-smart` controls.

### Task 2: Implement the compact composer and menus

**Files:**
- Modify: `plugins/ai-workbench.user.js:1870-1888, 2470-2740, 3260-3335, 3360-3380`
- Modify: `test/ai-workbench.test.js`

**Interfaces:**
- Consumes: `state.capability`, `state.contextKind`, `renderConversationControls`, `submitChatTurn`, `stopReadRequest`.
- Produces: `data-ai-chat-plus` menu, `data-ai-chat-smart` menu, `data-ai-chat-send`, and automatic context selection.

- [ ] **Step 1: Write the failing behavior tests**

Add tests for Smart selection and automatic context:

```js
test('AI 工作台：Smart 菜单选择能力，当前路由自动选择上下文', async () => {
  const w = makeSite()
  await load(w)
  const composer = w.document.querySelector('[data-ai-chat-composer]')
  composer.querySelector('[data-ai-chat-smart]').click()
  const menu = w.document.querySelector('[data-ai-chat-menu]')
  assert.ok(menu)
  assert.ok(menu.querySelector('[data-ai-chat-capability="comparison"]'))
  menu.querySelector('[data-ai-chat-capability="comparison"]').click()
  assert.match(composer.querySelector('[data-ai-chat-smart]').textContent, /方案对比/)
  assert.equal(composer.querySelector('[data-ai-chat-context]'), null)
})
```

- [ ] **Step 2: Run test to verify it fails**

Run: `node --test test/ai-workbench.test.js --test-name-pattern="Smart 菜单选择能力"`

Expected: FAIL because no Smart menu or capability menu items exist.

- [ ] **Step 3: Implement minimal composer markup**

Replace the composer toolbar with a single input and control row:

```html
<textarea class="ai-workbench-chat-input" data-ai-chat-input rows="2" maxlength="1000" placeholder="问问 linux.sb……"></textarea>
<div class="ai-workbench-chat-toolbar">
  <button type="button" class="ai-workbench-round-btn" data-ai-chat-plus aria-label="更多对话操作">＋</button>
  <button type="button" class="ai-workbench-chat-smart" data-ai-chat-smart aria-haspopup="menu" aria-expanded="false">Smart⌄</button>
  <button type="button" class="ai-workbench-send-btn ai-workbench-primary" data-ai-chat-send aria-label="发送">↑</button>
</div>
```

Create one transient `[data-ai-chat-menu]` menu at composer level. Its capability items set `state.capability`, call `renderChatModeOptions(state)` for capability-specific draft/research fields, update the Smart label, and close the menu. Add an “AI 设置” item that invokes `api.ui.openPanel('ai-summary')`.

Move the conversation controls behind the plus menu. Keep `data-ai-new-conversation`, `data-ai-conversation-list`, `data-ai-clear-history`, and compaction controls in the menu so existing history behavior remains available.

- [ ] **Step 4: Implement automatic context selection**

Remove context select creation and onchange handling. In `renderChat()` and route refreshes, set `state.contextKind = routeContextKind()` unless the selected capability forces `active-tracking` or `current-topic`. Keep `contextBanner` as the only visible context explanation.

- [ ] **Step 5: Implement send/stop button state**

Keep `data-ai-chat-send` as the stable selector. Update its text/content and aria label in `setChatBusy()` so idle state is `↑` and busy state is `×`; its click handler calls `stopReadRequest(state)` while busy and `submitChatTurn(state)` while idle.

- [ ] **Step 6: Run focused tests to verify they pass**

Run: `node --test test/ai-workbench.test.js --test-name-pattern="统一 composer 移除|Smart 菜单选择能力|右栏默认显示统一会话|只呈现统一消息流|观点比较|追踪能力|停止"`

Expected: PASS, with no context or mode select required by the new UI tests.

### Task 3: Update browser acceptance and styles

**Files:**
- Modify: `scripts/check-ai-workbench-browser.mjs`
- Modify: `plugins/ai-workbench.user.js`

**Interfaces:**
- Consumes: stable `data-ai-chat-input`, `data-ai-chat-send`, `data-ai-chat-stop`, `data-ai-chat-smart` selectors.
- Produces: browser assertions for hidden legacy controls, Smart menu operation, plus menu operation, and circular send/stop styling.

- [ ] **Step 1: Add browser assertions**

Assert that the composer has no `[data-ai-chat-context]` or `[data-ai-chat-mode]`, that clicking Smart exposes a capability menu, and that clicking send during a pending request changes the same button to stop behavior.

- [ ] **Step 2: Update CSS**

Add compact composer styles:

```css
.ai-workbench-chat-composer{border:1px solid var(--line,#ddd);border-radius:22px;padding:9px 10px 7px;background:var(--panel,#fff)}
.ai-workbench-chat-toolbar{align-items:center;margin-top:5px}
.ai-workbench-round-btn,.ai-workbench-send-btn{width:34px;height:34px;border-radius:50%;display:inline-grid;place-items:center;padding:0;font-size:20px}
.ai-workbench-chat-smart{border:1px solid var(--line,#ddd);border-radius:999px;padding:7px 11px;background:transparent;color:inherit}
.ai-workbench-chat-menu{position:absolute;bottom:52px;left:8px;z-index:3}
```

- [ ] **Step 3: Run browser acceptance**

Run: `node scripts/check-ai-workbench-browser.mjs`

Expected: JSON output with `passed: true` and checks including unified composer, Smart menu, plus menu, stop and retry.

### Task 4: Full verification and artifact sync

**Files:**
- Modify: `README.md` only if the UI entry description needs updating.
- Generated: `dist/linuxsb-base.user.js`, `dist/linuxsb-suite.user.js`, `dist/linuxsb-lts.user.js`

- [ ] **Step 1: Run targeted tests**

Run: `node --test test/ai-workbench.test.js`

Expected: all AI workbench tests pass.

- [ ] **Step 2: Build and verify distribution**

Run: `npm run build`

Run: `npm run verify:dist`

Expected: all three artifacts build and freshness checks pass.

- [ ] **Step 3: Run full regression**

Run: `npm test`

Expected: zero failed tests.

- [ ] **Step 4: Check the working tree**

Run: `git diff --check` and `git status --short`

Expected: no whitespace errors; changes remain uncommitted and no temporary browser artifacts remain.
