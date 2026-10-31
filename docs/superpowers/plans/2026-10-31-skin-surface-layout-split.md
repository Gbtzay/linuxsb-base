# Skin Surface Layout Implementation Plan

> **For agentic workers:** Use executing-plans to execute these steps in this session. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 完成第二十阶段：画布浮层布局与拖拽缩放拆分。

**Architecture:** 布局控制器拥有六个既有函数和拖动/动画帧两处状态；模板保留宿主事件委托，通过 getter 与回调连接当前 DOM、配置、共享层级和站点侧栏。

**Tech Stack:** JavaScript ES modules、Node.js 24、既有 JSDOM 集成测试。

**Spec:** [浮层布局设计](../specs/2026-10-31-skin-surface-layout-split-design.md)

## Global Constraints

- 在 `codex/integrate-origin-main` 保留既有改动，不移动、提交或推送。
- skin 2.0.55、Oxygen/LTS 2.0.60、Hydrogen 2.4.2；25 个 skin 模块，正式 21、开发 26 个套件模块。
- 前二十四个模块与 Hydrogen 不变；无新增依赖、配置、文案或行为，UTF-8 无 BOM、LF。
- 复用现有测试，单 worker、512 MiB Node 堆上限，不新增行为测试。不跑全量、浏览器、无关 AI 或压力测试。

### Task 1: 生成器契约与控制器提取

**Files:** 新增 `plugins/skin/surface-layout-controller.js`；修改 `plugins/skin/skin.template.js`、`scripts/build-skin.mjs`、`test/skin-source.test.js`。

- [x] 保存 384 个基线哈希及模板快照；3 项现有基线通过：

```powershell
node artifacts/skin-surface-layout-split/run.mjs baseline.log --max-old-space-size=512 --test --test-force-exit --test-concurrency=1 --test-name-pattern='宽屏 AI 卡可拖动并按宽度降级|取消 AI 浮动卡片缩放|配置适配按站点和宽度保存布局' test/skin-canvas.test.js test/skin-config.test.js
```

- [x] 扩展已有生成器 fixture，捕获缺失模块会导致实际执行结果错误的构建回归：

```js
// @LSB_SKIN_SURFACE_LAYOUT
globalThis.result.surfaceLayout = typeof createSkinSurfaceLayoutController === 'function'
  ? createSkinSurfaceLayoutController().applyModes() : 'missing-surface-layout'
// entrySources 增加独立字面量期望 surface-layout-ready；运行原参数化检查。
```

- [x] 运行原构建集成用例，确认旧生成器实际为 `missing-surface-layout`、期望为 `surface-layout-ready`。
- [x] 从 `canvasSurfaceRect` 至 `canvasScrollSync` 前提取六个完整函数；原两处状态移入控制器。只替换显式依赖，Home 分支使用 `nextZIndex()`；函数返回与事件先后顺序保持。
- [x] 模板原函数位置创建控制器，原 Escape 状态检查改为 `surfaceLayoutController.dragging`，其他调用点保留别名：

```js
const surfaceLayoutController = createSkinSurfaceLayoutController({
  window, configController,
  getSurfaceHost: () => canvasSurfaceHost, getSurface: canvasSurface, getViewport: canvasViewport,
  stateApi: { CANVAS_DEFAULT_SURFACES, resolveSurfaceMode, clampSurfaceRect },
  persistRect: canvasPersistSurfaceRect, setSiteStatusExpanded: canvasSiteStatusSetExpanded,
  syncSiteSidebar: canvasSyncSiteSidebar, nextZIndex: () => ++canvasZIndex, closeSurface: canvasCloseSurface,
})
const { applyModes: canvasApplySurfaceModes, endDrag: canvasEndDrag,
  beginDrag: canvasBeginDrag, beginResize: canvasBeginResize, keyboardMove: canvasKeyboardMove } = surfaceLayoutController
```

- [x] 新增唯一 `@LSB_SKIN_SURFACE_LAYOUT` 注入点、显式模块及模块内注入标记禁用检查。

### Task 2: 版本与定向验证

**Files:** `suite/version.js`、`suite/suite-center.js`、独立/dev/release/LTS 产物和本阶段证据。

- [x] 同步版本并运行 `node --max-old-space-size=512 scripts/build-skin.mjs`，随后执行完整 `test/skin-source.test.js`。
- [x] 复用以下 10 项既有检查，覆盖几何/配置边界、指针提交与取消、宽度模式、侧栏、路由和卸载：

```powershell
node artifacts/skin-surface-layout-split/run.mjs integration.log --max-old-space-size=512 --test --test-force-exit --test-concurrency=1 --test-name-pattern='单画布状态边界|宽屏 AI 卡可拖动并按宽度降级|取消 AI 浮动卡片缩放|宽屏站点信息固定|中屏站点信息使用 Sheet|配置适配按站点和宽度保存布局|外观 Sheet 提供预设|界面模式双向切换|停用皮肤还原正文父节点|路由刷新复用单画布宿主' test/skin-canvas.test.js test/skin-config.test.js test/skin.test.js
```

- [x] 顺序执行 `npm run build:dev`、`npm run build`，再运行 `scripts/check-dist.mjs`、`scripts/check-dev-dist.mjs`、`scripts/build-skin.mjs --check`、`scripts/check-test-skips.mjs`，均限制 Node 堆为 512 MiB。

### Task 3: 审查、范围审计与验收记录

**Files:** README、开发规范、文档索引、skin 源码入口、本设计与计划；证据位于 `artifacts/skin-surface-layout-split/`。

- [x] 按 requesting-code-review 技能进行一次独立只读审查，核对六个函数/两处状态、实时依赖、Home 层级、Escape 和卸载顺序，不追加测试、构建或浏览器。
- [x] 对照基线比较原函数与模板余部，确认前二十四个模块、Hydrogen、行为测试、选择器和冒烟脚本不变。
- [x] 更新文档入口、版本和下一阶段边界；记录实际验证结果，检查编码、本地链接与 `git diff --check`，保留未提交状态。

## 执行与验收记录

第二十阶段已完成，证据目录为 `artifacts/skin-surface-layout-split/`。在 `codex/integrate-origin-main` 保留全部既有未提交改动，本轮未提交、推送或移动分支。

### 实现与验证

- 新增 `surface-layout-controller.js`（210 行），提取 6 个既有函数及拖动/动画帧 2 处状态。显式模块从 24 个增至 25 个，模板从 3002 行缩至 2816 行，减少 186 行。
- 浮动/Sheet/全屏/rail 的判定、默认矩形、视口约束、ARIA 与站点侧栏同步保持；配置、实际宿主/表面和视口仍实时读取。纯状态工具显式传入，布局存储与侧栏节点归属由原模块管理。
- 指针过滤、capture、合并帧、提交与取消恢复保持；取消帧、解绑监听、恢复样式、释放 capture、清空状态的次序不变。Home 分支经回调递增共享层级，Escape 经只读 `dragging` 判断当前交互；模板在原位置创建控制器，并在卸载最先调用 `endDrag(false)`。没有新增产品行为。
- 3 项现有基线通过（`baseline.log`）。夹具扩展先有 1 次预检通过（`red-precheck.log`）；补齐独立/套件执行结果断言后，旧生成器 **1 项按预期失败**，实际 `missing-surface-layout`、期望 `surface-layout-ready`（`red-contract.log`），随后才修改生产代码。
- 最终生成器 **53/53 通过**（`targeted.log`），几何边界/拖动/缩放取消/宽度降级/布局隔离/路由/模式切换/停用集成 **10/10 通过**（`integration.log`），共 **63 项不同专项**；基线与夹具预检不重复计数。
- 没有新增行为测试或修改既有行为夹具/选择器，仅扩展生成器参数化 fixture，自然增加 2 项检查。Node 单 worker、512 MiB 堆上限，无最终失败、取消或跳过。本轮未改样式、几何算法或浏览器 API 用法，没有重跑浏览器套件、全量 Node、无关 AI 或压力测试；此前浏览器结果不计入本阶段验收。键盘分支和拖动中卸载的顺序通过逐字比较及只读审查核对，不额外宣称动态覆盖。
- 开发构建、正式构建/LTS 均通过（`build-dev.log`、`build-release.log`）。正式/开发分发、skin 新鲜度和零跳过预算通过（`verify-release.log`、`verify-dev.log`、`verify-skin.log`、`verify-skips.log`）。skin **2.0.55**、Oxygen/LTS **2.0.60**，Hydrogen **2.4.2**；正式 21、开发 26 个套件模块。

### 审查与范围核对

独立只读审查 Critical、Important、Minor 均无发现；审查者未修改文件或执行测试/构建/浏览器，结论为 `review.json`。

`audit.mjs` 对照 384 个基线哈希确认本轮仅 16 个预定文件变更，前二十四个模块、57 个 Hydrogen 源文件、两份 Hydrogen 产物、既有行为测试、专项选择器和冒烟脚本不变。6 个函数经明确依赖及共享层级回调替换后与原逻辑逐字一致；除提取、状态归属、接线、注入点、版本和边界注释外，模板余部逐字一致。

变更文件均为 UTF-8 无 BOM、LF，106 个本地文档链接有效，`git diff --check` 通过。详细证据为 `audit.json`，汇总为 `validation-summary.json`。

下一阶段为画布滚动同步与窗口监听，本轮未开始该阶段。
