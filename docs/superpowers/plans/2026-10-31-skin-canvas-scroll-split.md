# Skin Canvas Scroll Implementation Plan

> **For agentic workers:** Use executing-plans to execute these steps in this session. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 完成第二十一阶段：画布滚动同步与窗口监听拆分。

**Architecture:** 滚动控制器拥有八个既有函数与六处状态，模板通过方法别名及只读 getter 保留原调用点。在首页加载器之前初始化，后续模块操作通过延迟回调接入。

**Tech Stack:** JavaScript ES modules、Node.js 24、既有 JSDOM 集成测试。

**Spec:** [画布滚动设计](../specs/2026-10-31-skin-canvas-scroll-split-design.md)

## Global Constraints

- 在 `codex/integrate-origin-main` 保留既有改动，不移动、提交或推送。
- skin 2.0.56、Oxygen/LTS 2.0.61、Hydrogen 2.4.2；26 个 skin 模块，正式 21、开发 26 个套件模块。
- 前二十五个模块与 Hydrogen 不变；无新增依赖、配置、文案或行为，UTF-8 无 BOM、LF。
- 复用既有测试，单 worker、512 MiB Node 堆上限，不新增行为测试。不跑全量、浏览器、无关 AI 或压力测试。

### Task 1: 生成器契约与控制器提取

**Files:** 新增 `plugins/skin/canvas-scroll-controller.js`；修改 `plugins/skin/skin.template.js`、`scripts/build-skin.mjs`、`test/skin-source.test.js`。

- [x] 保存 387 个基线哈希及模板快照；3 项现有基线通过：

```powershell
$env:NODE_OPTIONS='--max-old-space-size=512'
node artifacts/skin-canvas-scroll-split/run.mjs baseline.log --max-old-space-size=512 --test --test-force-exit --test-concurrency=1 --test-name-pattern='legacy 首页无限滚动监听中间面板|历史项保存双轴滚动和地址|界面模式双向切换' test/skin.test.js
```

- [x] 扩展已有 fixture 的标记、模块输入、独立/dev/release 实际结果与参数化检查。新模块的假实现返回 `canvas-scroll-ready`，缺失分支返回 `missing-canvas-scroll`；运行原生成器用例确认按预期失败。
- [x] 从 `canvasScrollSync` 至 `canvasUnbindEvents` 前提取八个完整函数；移动六处状态，仅替换显式依赖，保留原计算、回退与清理顺序。
- [x] 在原 `canvasScrollBound` 声明处初始化控制器，删除其他五处旧状态；保持首页加载器直接取得方法别名：

```js
const canvasScrollController = createSkinCanvasScrollController({
  window, document, getSurface: canvasSurface, getViewport: canvasViewport,
  isAsideWide: asideWide, getContentScroller: () => contentController.scroller,
  syncScrollBridge: syncShellScrollBridge,
  updateProfileScroll: (y, previous) => canvasUpdateProfileScroll(y, previous),
  applyPageClass: canvasApplyPageClass, applySurfaceModes: () => canvasApplySurfaceModes(),
})
const { homeRoot: canvasHomeScrollRoot, syncTarget: canvasSyncScrollTarget,
  schedule: canvasScheduleScroll, bind: canvasBindWindow, unbind: canvasUnbindWindow } = canvasScrollController
```

- [x] 页面标记同步检查改为 `canvasScrollController.bound`；当前滚动根读取改为 `canvasScrollController.target`。保留挂载、卸载、路由、首页无限加载、历史滚动的原调用顺序。
- [x] 新增唯一 `@LSB_SKIN_CANVAS_SCROLL` 注入点、显式模块及模块内标记禁用规则。

### Task 2: 版本与定向验证

**Files:** `suite/version.js`、`suite/suite-center.js`、独立/dev/release/LTS 产物和本阶段证据。

- [x] 同步版本，运行 `node --max-old-space-size=512 scripts/build-skin.mjs` 和完整 `test/skin-source.test.js`。
- [x] 运行以下既有专项；返回顶部用例包含 legacy/ios27 两个子用例：

```powershell
$env:NODE_OPTIONS='--max-old-space-size=512'
node artifacts/skin-canvas-scroll-split/run.mjs integration.log --max-old-space-size=512 --test --test-force-exit --test-concurrency=1 --test-name-pattern='站点原生返回顶部跟随两种氢首页模式|桌面首页滚动条属于中间首页面板|legacy 宽屏首页滚动条归属中间面板|legacy 首页无限滚动监听中间面板|历史项保存双轴滚动和地址|界面模式双向切换|旧三栏断点跨越时卸载并重新挂载|停用皮肤还原正文父节点|路由刷新复用单画布宿主' test/skin-canvas.test.js test/skin.test.js
```

- [x] 顺序执行 `npm run build:dev`、`npm run build`，再运行 `scripts/check-dist.mjs`、`scripts/check-dev-dist.mjs`、`scripts/build-skin.mjs --check`、`scripts/check-test-skips.mjs`，均限制 Node 堆为 512 MiB。

### Task 3: 审查、审计与收尾路线

**Files:** README、开发规范、文档索引、skin 源码入口、本设计与计划；证据位于 `artifacts/skin-canvas-scroll-split/`。

- [x] 按 requesting-code-review 技能做一次独立只读审查，核对初始化时序、实时依赖、六处状态、目标迁移、帧取消与监听清理，不追加测试、构建或浏览器。
- [x] 对照基线比较八个函数与模板余部，确认前二十五个模块、Hydrogen、行为测试、选择器和冒烟脚本不变。
- [x] 更新入口、版本和第 22–25 阶段收尾范围，记录实际验收结果；检查编码、本地链接和 `git diff --check`，保留未提交状态。

## 执行与验收记录

第二十一阶段已完成，证据目录为 `artifacts/skin-canvas-scroll-split/`。在 `codex/integrate-origin-main` 保留全部既有未提交改动，本轮未提交、推送或移动分支。

### 实现与验证

- 新增 `canvas-scroll-controller.js`（120 行），提取 8 个既有函数与 6 处状态。显式模块从 25 个增至 26 个，模板从 2816 行缩至 2720 行，减少 96 行。
- 控制器在原状态位置初始化，早于首页加载器；构造时不调用依赖，资料卡更新与浮层模式操作经延迟回调接入。模板保留方法别名，页面标记同步和当前滚动根分别读取 `bound`/`target` getter。
- 首页模式及 700px 宽度判定、正文 scroller 回退、窗口桥同步、同目标返回、双轴承接和 passive 监听保持。状态栏方向/收缩阈值、资料卡更新、帧合并/timeout 回退、resize 处理和卸载清理次序不变，没有新增产品行为。
- 3 项现有基线通过（`baseline.log`）。扩展既有 fixture 后，旧生成器 **1 项按预期失败**，实际 `missing-canvas-scroll`、期望 `canvas-scroll-ready`（`red-contract.log`），随后才修改生产代码。
- 最终生成器 **55/55 通过**（`targeted.log`），滚动根/原生返回顶部/首页加载/双轴历史/宽度变化/模式切换/停用集成 **11/11 通过**（`integration.log`），共 **66 项检查**；集成为 9 个顶层用例与 2 个模式子用例，基线不重复计数。
- 没有新增行为测试或修改既有行为夹具/选择器，仅扩展生成器参数化 fixture，自然增加 2 项检查。Node 单 worker、512 MiB 堆上限，最终无失败、取消或跳过。本轮没有重跑浏览器套件、全量 Node、无关 AI 或压力测试；此前浏览器结果不计入本阶段验收。帧取消等未单独动态覆盖的分支通过原逻辑逐字比较及只读审查核对。
- 开发构建、正式构建/LTS 均通过（`build-dev.log`、`build-release.log`）。正式/开发分发、skin 新鲜度和零跳过预算通过（`verify-release.log`、`verify-dev.log`、`verify-skin.log`、`verify-skips.log`）。skin **2.0.56**、Oxygen/LTS **2.0.61**，Hydrogen **2.4.2**；正式 21、开发 26 个套件模块。

### 审查与范围核对

独立只读审查 Critical、Important、Minor 均无发现；审查者未修改文件或执行测试/构建/浏览器，结论为 `review.json`。

`audit.mjs` 对照 387 个基线哈希确认本轮仅 16 个预定文件变更，前二十五个模块、57 个 Hydrogen 源文件、两份 Hydrogen 产物、既有行为测试、专项选择器和冒烟脚本不变。8 个函数经显式依赖替换后与原逻辑逐字一致；除提取、状态归属、接线、注入点、版本和边界注释外，模板余部逐字一致。

变更文件均为 UTF-8 无 BOM、LF，109 个本地文档链接有效，`git diff --check` 通过。详细证据为 `audit.json`，汇总为 `validation-summary.json`。

### 剩余收尾范围

第 22 阶段共享窗口布局与交互；第 23 阶段画布宿主、面板开关与通用事件；第 24 阶段入口生命周期与清理；第 25 阶段集中验收、文档与最终收尾。上述范围已写入源码入口说明，本轮未开始第 22 阶段。
