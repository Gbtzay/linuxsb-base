# 饼铛壳 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 在界面精修里用逛吧的换壳方法叠一层饼铛自己的浏览壳（顶栏 + 左栏 + 帖内时间轴），默认开启、可关、可拆净。

**Architecture:** 仍是单一 `skin.user.js`。CSS + 轻 DOM：`#lsb-shell` 挂 `body`，原生 `.top` / `aside.sidebar` 用 class 隐藏（仅 ≥900px）。导航从 `api.forums` 与当前 DOM 快照。刷新走 `route:changed` / `topic:posts-added`。搜索表单迁入迁出，不克隆、不 fetch 首页。

**Tech Stack:** 油猴插件 + JSDOM 测试（`node --test`）+ 现有 `api.on` / `api.ui` / `api.sel`。

## Global Constraints

- 类名禁止 `discourse`；不搬逛吧玻璃雾 / 循环动画。
- 不改 linux.sb 服务端；配色只使用站点 CSS 变量。
- `skin` 版本 1.1.0（头部 `@version` = manifest）；套件 `SUITE_VERSION` 1.0.2。
- 不 commit，除非用户要求。
- 插件源文件 UTF-8 无 BOM、LF。

## Files

- Modify: `plugins/skin.user.js` — 配置、壳 DOM、壳 CSS、生命周期
- Modify: `test/skin.test.js` — 更新默认断言 + 新壳用例
- Modify: `build-suite.mjs` — `SUITE_VERSION`
- Modify: `suite/suite-center.js` — 套件中心 version 与套件版本对齐（若该文件写死 1.0.1）
- Modify: `README.md` — 官方插件表一行
- Create: 本 spec/plan 已写在 `docs/superpowers/`

---

### Task 1: 失败测试（壳行为）

**Files:**
- Modify: `test/skin.test.js`

**Produces:** 断言默认 `lsb-skin-shell-on`、`#lsb-shell`、迁入搜索、版块与签到、帖内时间轴、关壳/停用拆净、CSS 无 discourse 无 infinite。

- [ ] **Step 1: 改现有默认/全关断言并追加壳用例**
- [ ] **Step 2: 跑 `node --test test/skin.test.js`，确认因缺少壳实现而失败**

---

### Task 2: 实现壳并让测试变绿

**Files:**
- Modify: `plugins/skin.user.js`（`@version` / `manifest.version` → `1.1.0`）
- Modify: `build-suite.mjs` `SUITE_VERSION` → `1.0.2`
- Modify: `suite/suite-center.js` version → `1.0.2`（与套件版本一致）
- Modify: `README.md` skin 行

**Consumes:** Task 1 的断言与 spec 的结构/配置/降级规则。

- [ ] **Step 1: 实现 `shell` 开关、ensure/teardown、CSS、时间轴、事件**
- [ ] **Step 2: `npm test` 全绿，`npm run build` 通过**
