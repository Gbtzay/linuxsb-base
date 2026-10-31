# Skin Window Implementation Plan

> **For agentic workers:** Use executing-plans to execute these steps in this session. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 完成第二十二阶段：共享窗口布局与交互拆分，保持原窗口化入口关闭。

**Architecture:** 共享窗口控制器拥有原连续 38 个函数、10 处变量和外部视图 Map。模板保留公共注册与总生命周期，读取状态 getter，并在原状态位置初始化控制器。

**Tech Stack:** JavaScript ES modules、Node.js 24、现有 JSDOM 与纯函数测试。

**Spec:** [共享窗口设计](../specs/2026-10-31-skin-window-split-design.md)

## Global Constraints

- 在 `codex/integrate-origin-main` 保留既有改动，不移动、提交或推送。
- skin 2.0.57、Oxygen/LTS 2.0.62、Hydrogen 2.4.2；27 个 skin 模块，正式 21、开发 26 个套件模块。
- 前二十六个模块与 Hydrogen 不变；无新增依赖、配置、文案或功能，UTF-8 无 BOM、LF。
- `shellWindowEnabled()` 仍固定返回 false，不重新启用窗口化界面。
- 单 worker、512 MiB Node 堆上限，不新增行为测试，不跑全量、浏览器、无关 AI 或压力测试。

### Task 1: 构建契约与提取

**Files:** 新增 `plugins/skin/window-controller.js`；修改 `plugins/skin/skin.template.js`、`scripts/build-skin.mjs`、`test/skin-source.test.js`。

- [x] 保存 390 文件基线与模板快照，3 项现有基线通过：

```powershell
$env:NODE_OPTIONS='--max-old-space-size=512'
node artifacts/skin-window-split/run.mjs baseline.log --max-old-space-size=512 --test --test-force-exit --test-concurrency=1 --test-name-pattern='旧三栏只在 1100px|M15 skin controller|氢壳右栏：注册外部视图' test/skin.test.js
```

- [x] 在已有 fixture 加入 `@LSB_SKIN_WINDOWS`、`createSkinWindowController().mount()` 假实现及独立/dev/release 结果断言，期待 `window-ready`；旧生成器应得到 `missing-window`。
- [x] 原样提取连续 38 个函数和其专属变量、Map、常量、内建清单；仅替换依赖读取，保持原函数内部控制流与调用先后。
- [x] 原状态位置初始化并保留方法别名，后续侧栏依赖通过 getter/回调延迟解析：

```js
const windowController = createSkinWindowController({
  window, document, ui: api.ui, store: api.store, configController, contentController,
  layoutApi: shellLayoutApi, styleApi: shellStyleApi, getLocation: () => location,
  getAsideContext: asideContext, getAsidePreferredId: () => asideViewsController.preferredId,
  getAsideActiveId: () => asideViewsController.activeId,
  setAsideActive: (id, host, persist) => asideSetActive(id, host, persist),
  findOutlet: findRouteOutlet, clone: structuredCloneSafe,
})
const { enabled: shellWindowEnabled, workspace: shellWorkspace, viewport: shellViewport,
  host: shellHost, focus: focusShellWindow, arrange: arrangeShellWindows, reset: resetShellWindow,
  unbind: unbindWindowInteractions, mount: mountShellWindows, unmount: unmountShellWindows } = windowController
```

- [x] 模板中原布局、窗口清单、外部视图 Map 的读取分别改为 `windowController.layout`、`.registry`、`.externalViews`，公共 API/侧栏/debug 逻辑保持。
- [x] 新增唯一注入点、显式模块和模块内标记禁用枚举，同步版本并生成独立 skin。

### Task 2: 低负载验证与构建

**Files:** `suite/version.js`、`suite/suite-center.js`、独立/dev/release/LTS 产物和证据日志。

- [x] 运行完整 `test/skin-source.test.js`；复用现有布局与样式 10 项纯函数检查：

```powershell
node artifacts/skin-window-split/run.mjs layout-style.log --max-old-space-size=512 --test --test-force-exit --test-concurrency=1 test/shell-layout.test.js test/shell-style.test.js
```

- [x] 执行 7 项现有双界面、断点、公开 API、侧栏视图与停用检查：

```powershell
node artifacts/skin-window-split/run.mjs integration.log --max-old-space-size=512 --test --test-force-exit --test-concurrency=1 --test-name-pattern='旧三栏只在 1100px|M15 skin controller|氢壳右栏：注册外部视图|氢壳右栏偏好|界面模式双向切换|旧三栏断点跨越时卸载并重新挂载|停用皮肤还原正文父节点' test/skin.test.js
```

- [x] 顺序执行开发/正式/LTS 构建，再校验正式/开发产物、skin 新鲜度和零跳过预算。所有 Node 进程设置 512 MiB 堆上限。

### Task 3: 审查与验收

**Files:** README、开发规范、文档索引、skin 源码入口、本设计与计划；证据目录 `artifacts/skin-window-split/`。

- [x] 按 requesting-code-review 技能做一次只读审查，核对初始化、早期公开 API、侧栏 getter、状态归属、原关闭开关和清理顺序，不额外运行测试/构建/浏览器。
- [x] 对照快照逐函数及完整块比较，核对模板余部与 390 文件基线，保护前二十六个模块、Hydrogen、既有行为测试及冒烟脚本。
- [x] 更新文档版本/入口及剩余三阶段，记录实际动态覆盖和静态审查边界，核对编码、本地链接与 `git diff --check`，保留未提交状态。

## 执行与验收记录

第二十二阶段已完成，证据目录为 `artifacts/skin-window-split/`。在 `codex/integrate-origin-main` 保留全部既有未提交改动，本轮未提交、推送或移动分支。

### 实现与验证

- 新增 `window-controller.js`（861 行），提取 38 个既有函数、10 处可变变量、1 个外部视图 Map、3 个布局常量及内建窗口清单。显式模块从 26 个增至 27 个，模板从 2720 行缩至 1886 行，减少 834 行。
- 控制器在原布局状态位置初始化，先于公开控制器注册；构造时不执行依赖，侧栏 getter/选择回调延迟解析。模板保留方法别名、公开 API、侧栏 onSelect、媒体 workspace 与 debug 逻辑，原状态读取改用 getter，并保持原内部对象身份。
- 原 `shellWindowEnabled()` 固定返回 false 的行为保持。布局迁移/防抖/立即保存、外部视图 render/dispose、局部检查器、指针/键盘/响应式分支均按原逻辑提取；原解绑交互与卸载窗口顺序保持，正文释放及状态清空位置不变。
- 3 项现有基线通过（`baseline.log`）。扩展既有 fixture 后，旧生成器 **1 项按预期失败**，实际 `missing-window`、期望 `window-ready`（`red-contract.log`），随后才修改生产代码。
- 最终生成器 **57/57 通过**（`targeted.log`），现有布局/样式纯函数 **10/10 通过**（`layout-style.log`），双界面/断点/公开侧栏 API/外部视图/偏好恢复/停用集成 **7/7 通过**（`integration.log`），共 **74 项检查**；基线不重复计数。
- 没有新增行为测试或修改现有行为夹具/选择器，仅扩展生成器参数化 fixture，自然增加 2 项检查。Node 单 worker、512 MiB 堆上限，最终无失败、取消或跳过。本轮未跑全量、浏览器、无关 AI 或压力测试。旧窗口化界面保持关闭，未启用的交互/检查器分支以快照逐字比较与只读审查验证，不将纯函数及当前双界面测试等同于窗口化运行验收。
- 开发构建、正式构建/LTS 均通过（`build-dev.log`、`build-release.log`）。正式/开发分发、skin 新鲜度和零跳过预算通过（`verify-release.log`、`verify-dev.log`、`verify-skin.log`、`verify-skips.log`）。skin **2.0.57**、Oxygen/LTS **2.0.62**，Hydrogen **2.4.2**；正式 21、开发 26 个套件模块。

### 审查与范围核对

独立只读审查 Critical、Important、Minor 均无发现；审查者未修改文件或执行测试/构建/浏览器，结论为 `review.json`。

`audit.mjs` 对照 390 个基线哈希确认本轮仅 16 个预定文件变更，前二十六个模块、57 个 Hydrogen 源文件、两份 Hydrogen 产物、既有行为测试、专项选择器和冒烟脚本不变。38 个函数经显式依赖替换后与原逻辑逐字一致，内建清单仅移动/缩进；除提取、状态归属、接线、注入点、版本和边界说明外，模板余部逐字一致。

变更文件均为 UTF-8 无 BOM、LF，112 个本地文档链接有效，`git diff --check` 通过。详细证据为 `audit.json`，汇总为 `validation-summary.json`。

本阶段后剩余三阶段：23 画布宿主/面板/通用事件；24 入口生命周期/清理；25 集中验收与文档收尾。本轮未开始第 23 阶段。
