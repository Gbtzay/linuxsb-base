# 第二十三阶段：画布宿主、面板开关与通用事件 Implementation Plan

> **For agentic workers:** 按 executing-plans 在当前会话执行；沿用已授权的低负载验证及未提交工作区策略。一次 requesting-code-review 独立只读审查即可。

**Goal:** 将画布局部宿主、面板开关、站点信息栏展示与通用事件提取为一个控制器，保留行为和调用时序。

**Architecture:** 原样迁移函数与其拥有的状态，在原状态位置初始化工厂。依赖逐项延迟转发，模板保留调用点与实时状态 getter。复用已有控制器，不新增后台任务或全局监听。

**Tech Stack:** 原生 JavaScript ES 模块、userscript 生成器、Node test、JSDOM。

**设计：** [阶段设计](../specs/2026-10-31-skin-canvas-host-split-design.md)。本阶段后只剩第 24 阶段入口生命周期/总清理，以及第 25 阶段集中验收/文档收尾。

## Task 1：快照与现有基线

- [x] 保存 393 个文件哈希、模板和生成器 fixture 原文，确认当前分支及既有改动。
- [x] 执行生成器主契约、工具 Sheet 互斥、原生搜索关闭三项基线：

```powershell
$env:NODE_OPTIONS='--max-old-space-size=512'
node artifacts/skin-canvas-host-split/run.mjs baseline.log --max-old-space-size=512 --test --test-force-exit --test-concurrency=1 --test-name-pattern='skin 构建从拆分源读取变更|统一工具 Sheet 互斥|顶栏搜索仅占放大镜' test/skin-source.test.js test/skin-canvas.test.js
```

## Task 2：生成器契约与控制器提取

Files: `test/skin-source.test.js`、`plugins/skin/canvas-host-controller.js`、`plugins/skin/skin.template.js`、`scripts/build-skin.mjs`、`suite/version.js`、`suite/suite-center.js`。

- [x] 在已有 fixture 增加注入点、模块定义和独立/dev/release 结果检查：

```js
// @LSB_SKIN_CANVAS_HOST
globalThis.result.canvasHost = typeof createSkinCanvasHostController === 'function'
  ? createSkinCanvasHostController().mount() : 'missing-canvas-host'
// fixture module
export function createSkinCanvasHostController() {
  return { mount() { return 'canvas-host-ready' } }
}
```

- [x] 仅运行主构建契约，确认旧生成器返回 `missing-canvas-host` 的预期失败。
- [x] 按六个原文区间提取：插件菜单渲染；站点信息栏/侧栏观察；页面 class/表面查找/关闭与菜单操作；打开/导航/文字同步；通用事件与宿主 DOM；画布局部挂载/卸载。移动 9 个对应状态；其余 setup 状态留给下一阶段。
- [x] 工厂显式接收 `window/document/configController/aiMarkup/getPage/pluginCatalog/siteCardsController/hooks`。仅将 `api.page`、滚动 bound、拖拽 dragging 和外观 bind 改为延迟调用，局部 DOM 构造器从 window 获取。返回以下接口：

```js
return {
  mount: mountCanvas, unmount: unmountCanvas, surface: canvasSurface,
  applyPageClass: canvasApplyPageClass, syncText: canvasSyncText, closeSurface: canvasCloseSurface, openPluginFeature,
  restoreSiteSidebar: canvasRestoreSiteSidebar, syncSiteSidebar: canvasSyncSiteSidebar,
  syncPersistentSiteCards: canvasSyncPersistentSiteCards,
  setSiteStatusExpanded: canvasSiteStatusSetExpanded, stopSidebarWatch: canvasStopSidebarWatch,
  watchSidebar: canvasWatchSidebar,
  nextZIndex: () => ++canvasZIndex,
  restoreFocus: () => { if (canvasFocusReturn?.isConnected) canvasFocusReturn.focus?.() },
  get shell() { return canvasShell },
  get surfaceHost() { return canvasSurfaceHost },
  get activeSheet() { return canvasActiveSheet },
}
```

- [x] 在原状态声明位置初始化；模板原方法别名、媒体/资料卡/选择/外观/布局和订阅读取改为接口调用。保持原调用点和共享层级语义，后置 const 依赖一律通过回调读取。
- [x] 新增唯一注入登记及模块注入点禁用枚举。skin 提升至 2.0.58、Oxygen/LTS 提升至 2.0.63，Hydrogen 2.4.2 不变；生成独立 skin。

## Task 3：低负载验证及产物

- [x] 完整运行已有生成器测试 `test/skin-source.test.js`，保留单 worker、512 MiB 和强制退出。
- [x] 定向复用画布用例：五类页面宿主、Sheet 互斥、遮罩、搜索、路由复用、宽屏站点栏点击、中窄屏归还、插件菜单/停用后校验、选择委托、缩放取消。再复用双模式切换、断点重挂和停用三项集成用例。验证数量以日志实际值为准。
- [x] 顺序执行开发、正式及 LTS 构建；校验正式/开发产物、skin 新鲜度、零跳过预算。可复用前阶段日志包装器；不添加行为用例，不运行浏览器或全套测试。

## Task 4：审查与文档收尾

- [x] 一次独立只读审查，覆盖原文对比、延迟初始化、真实 DOM/焦点、Escape 优先级、事件去重、AI 条件块和卸载顺序；审查者不运行测试/构建。
- [x] 按基线确认前 27 个 skin 模块、Hydrogen、行为测试和冒烟脚本保持不变，逐函数/模板余部验证机械提取。
- [x] 更新 README、开发规范、文档索引与 skin 源码入口，记录两个剩余阶段及实际验收边界。
- [x] 核对 UTF-8 无 BOM、LF、本地链接及 `git diff --check`，填写验收结果，保留未提交状态。

## 执行与验收记录

第二十三阶段已完成。工作区仍为 `codex/integrate-origin-main`，本轮未提交、推送、移动分支或创建工作树；保留此前全部未提交改动。证据目录为 `artifacts/skin-canvas-host-split/`。

### 实现

- 新增 `canvas-host-controller.js`（742 行），迁移六段共 29 个函数、9 个状态。主模板由 1886 行缩至 1266 行，减少 620 行，显式 skin 模块增至 28 个。
- 控制器持有画布宿主、表面容器、活动面板、焦点返回目标、共享层级、外部搜索监听、站点栏展示状态和侧栏观察器。原面板 DOM、菜单/导航渲染、事件优先级和画布局部挂载/卸载顺序保持；原节点接管仍复用已有控制器。
- 工厂在原状态声明位置初始化，不执行延迟依赖。模板保留公共注册、旧三栏渲染、模式切换、SPA/挑战页编排与总清理，通过方法别名及 getter 接线。`watchSidebar`/`stopSidebarWatch` 分别维持原路由同步与提交前停止观察的调用位置。
- skin **2.0.58**、Oxygen/LTS **2.0.63**，Hydrogen **2.4.2**；正式 21、开发 26 个套件模块。原窗口化模式保持关闭，正式产物继续剥离 AI 条件块。

### 低负载验证

- 基线三项通过（`baseline.log`）；生成器 fixture 扩展后，旧生成器按预期报 `missing-canvas-host`（`red-contract.log`）。只对原 fixture 增加五行，没有新增行为测试或修改已有行为用例/夹具/选择器。
- 生成器 **59/59**、画布定向检查 **16/16**（含五类页面子项）、双界面/断点/停用 **3/3** 通过。独立审查修复后再复用软跳聚焦/播报和导航后退 **2/2**，共 **80 项不同检查**；基线、重复执行及失败复现不重复计数。
- 使用单 worker、512 MiB Node 堆上限和 `--test-force-exit`。没有运行全量、浏览器冒烟、无关 AI 套件或压力测试；16 项画布检查中的一个既有 AI 卡缩放取消用例仅用于覆盖本次迁移的通用指针/Escape 委托。
- 选择操作用例输出一条 JSDOM 未实现 `HTMLFormElement.requestSubmit` 的提示。用哈希匹配基线的旧独立 skin 回放同一现有用例得到相同提示（`baseline-selection.log`）；断言通过。这不能作为真实浏览器表单提交验收，未修改测试以隐藏提示。
- 修复后重新生成独立插件，并重新执行开发、正式及 LTS 构建；正式/开发分发、skin 新鲜度、零跳过预算全部通过（各 build/verify 日志）。修复只补两行接口接线，29 个函数体未再改变，未重跑与修复无关的检查。

### 审查与修复

一次独立只读审查初次发现一项 Important：`syncShellRoute` 仍调用已迁出的 `canvasWatchSidebar`，但接口和别名遗漏。静态接线检查复现唯一未绑定引用（`red-binding.log`）；已有软跳元信息/聚焦/播报测试复现失败，焦点停在 body（`red-route-completion.log`）。

补齐控制器导出和模板别名两行后，同一测试通过，连同导航/后退共两项通过。此前导航/标题用例单独通过不足以排除此问题，已保留初次通过日志作覆盖边界记录。审查者对最终两行修复再次只读核对，剩余 Critical、Important、Minor 均无发现（`review.json`）。

### 范围核对

对照 393 文件基线，本轮仅 16 个预定文件改变。前 27 个 skin 模块、57 个 Hydrogen 源文件、两份 Hydrogen 产物、76 个原测试/夹具文件及测试入口/三份冒烟脚本未变。六个函数区间与原文在显式依赖替换后完全一致；模板余部仅为原状态迁移、接口接线、版本与边界说明。审计还逐项确认所有仍在模板使用的迁移函数均已导出和绑定。

变更文件 UTF-8 无 BOM、LF，115 个本地文档链接有效，`git diff --check` 通过。详细证据为 `audit.json`，汇总为 `validation-summary.json`。

本阶段后剩 **2 个阶段**：第 24 阶段入口生命周期与清理整理，第 25 阶段集中验收、文档与最终收尾。本轮未开始第 24 阶段。
