# Skin Topbar Implementation Plan

> **For agentic workers:** Execute these steps in this session. Steps use checkbox (`- [x]`) syntax for tracking.

**Goal:** 完成第十六阶段：顶栏附加入口与原生控件接管拆分。

**Architecture:** 顶栏控制器集中节点原位、入口渲染及观察器；通过 getter 读取当前开关、宽度和 canvas 宿主。模板保留原调用点和生命周期编排。

**Tech Stack:** JavaScript ES modules、Node.js 24、既有 JSDOM 与 Playwright 冒烟。

**Spec:** [顶栏接管设计](../specs/2026-10-31-skin-topbar-split-design.md)

## Global Constraints

- 在 `codex/integrate-origin-main` 保留既有改动，不移动、提交或推送。
- skin 2.0.51，Oxygen/LTS 2.0.56，Hydrogen 2.4.2；21 个 skin 模块，正式 21、开发 26 个套件模块。
- 前二十模块与 Hydrogen 不变；无新增依赖、配置、文案或行为，UTF-8 无 BOM、LF。
- 复用现有行为测试，Node 单 worker、512 MiB 堆上限；浏览器仅 iOS27 canvas 一条，384 MiB Node 堆上限、顺序执行。不跑全量、其他浏览器套件、无关 AI 或压力测试。

### Task 1: 构建契约与提取

**Files:** 新增 `plugins/skin/topbar-controller.js`；修改模板、`scripts/build-skin.mjs`、`test/skin-source.test.js`。

- [x] 保存 372 个基线哈希及模板快照；4 项现有基线通过（入口过滤、控件补回、canvas 固定导航、弹层归还）：

```powershell
node artifacts/skin-topbar-split/run.mjs baseline.log --max-old-space-size=512 --test --test-force-exit --test-concurrency=1 --test-name-pattern='顶栏不回放|站点把外观控件补回|顶部导航固定|色系弹层脱离' test/skin.test.js test/skin-canvas.test.js
```

- [x] 扩展已有构建 fixture，确认旧生成器返回 `missing-topbar`，期望 `topbar-ready`；保留完整行标记匹配与准确模块名断言。
- [x] 机械提取 18 个函数和 6 处状态；仅替换外部依赖，模板在原位置初始化并保留全部调用点。
- [x] 增加唯一 `@LSB_SKIN_TOPBAR` 注入点与模块内标记禁用检查。

### Task 2: 版本与定向验证

**Files:** 版本源、独立/dev/release/LTS 产物和本阶段证据。

- [x] 同步版本、生成 skin，运行 `test/skin-source.test.js`。
- [x] 运行既有 legacy 入口/外观/归还/软跳去重和模式切换专项，以及 canvas 顶部固定入口、窄屏状态、弹层归还和 AI 入口过滤专项：

```powershell
node artifacts/skin-topbar-split/run.mjs integration.log --max-old-space-size=512 --test --test-force-exit --test-concurrency=1 --test-name-pattern='界面模式双向切换|旧三栏断点跨越|停用皮肤还原正文父节点|顶栏搜索在站名右侧|顶栏不回放|顶栏不挂|站点明暗切换钮迁入|新外观菜单迁入|站点把外观控件补回|顶栏迁入用户榜单|关壳后右栏卡片与顶栏入口|顶栏入口不重复迁入|论坛导航淘帖进顶栏|顶部导航固定|窄屏用户页保留资料卡|色系弹层脱离|帖子页顶部状态栏不显示|AI 操作台不出现在底部' test/skin.test.js test/skin-canvas.test.js
```

- [x] 顺序执行 `npm run build:dev`、`npm run build`，检查正式/开发分发、skin 新鲜度与零跳过预算。
- [x] 用新生成独立 skin 和 release 裁剪运行一次现有 iOS27 canvas 冒烟，日志及截图留在本阶段证据目录。

### Task 3: 审查与记录

**Files:** README、开发规范、文档索引、skin 源码入口、设计和本计划。

- [x] 按 requesting-code-review 技能进行一次独立只读审查；核对 DOM 身份、实时依赖、观察器、原位归还和调用顺序，不额外执行测试/构建。
- [x] 对照基线核对提取函数和模板余部，确认前二十模块、Hydrogen、行为测试、选择器和冒烟脚本不变。
- [x] 更新入口、版本、下一阶段边界和真实验收结果，检查编码、本地链接及 `git diff --check`，保留未提交状态。

## 执行与验收记录

第十六阶段已完成，证据目录为 `artifacts/skin-topbar-split/`。在 `codex/integrate-origin-main` 保留全部既有未提交改动，本轮未提交、推送或移动分支。

### 实现与验证

- 新增 `topbar-controller.js`（322 行），提取 17 个顶栏函数和仅供它们使用的 `restoreNode`，共 18 个函数与 6 处状态；显式模块从 20 个增至 21 个，模板从 3706 行缩至 3402 行，减少 304 行。
- legacy/canvas 的入口过滤、缓存读取、URL 去重、窄屏限制、认证/导航固定位置和原生外观控件/弹层接管顺序保持。开关、宽度及顶部宿主通过 getter 实时读取；模板原调用点、先停止观察再归还节点的顺序不变。原有重复查询与缓存字段约定保留，没有新增产品行为。
- 4 项现有基线通过（`baseline.log`）。新构建 fixture 在旧生成器上 **1 项按预期失败**，实际 `missing-topbar`、期望 `topbar-ready`（`red-contract.log`）。最终生成器 **45/45 通过**（`targeted.log`），既有入口/外观/切换/归还集成 **18/18 通过**（`integration.log`），共 **63 项不同专项**；基线不重复计数。
- 没有新增行为测试或修改已有行为夹具/选择器；仅扩展生成器参数化 fixture，自然增加 2 项检查。Node 单 worker、512 MiB 堆上限，无最终失败、取消或跳过。
- 顺序复用现有 iOS27 canvas 冒烟一次，Node 堆上限 384 MiB，**21 个检查组通过**（`browser-ios27.log`）；包含宽/中/窄屏状态栏、导航、原生节点及脚本既有软跳/归还链路。截图位于 `ios27-canvas/`。未重跑 legacy/阅读浏览器套件、全量 Node、无关 AI 或压力测试；不将此前浏览器结果计为本轮验收。
- 开发构建、正式构建/LTS 均首次通过（`build-dev.log`、`build-release.log`）；正式/开发分发、skin 新鲜度及零跳过预算通过（`verify-release.log`、`verify-dev.log`、`verify-skin.log`、`verify-skips.log`）。skin **2.0.51**、Oxygen/LTS **2.0.56**，Hydrogen **2.4.2**；正式 21、开发 26 个套件模块。

### 审查与范围核对

独立只读审查 Critical、Important、Minor 均无发现；审查者未修改文件或执行测试/构建/浏览器，结论为 `review.json`。

`audit.mjs` 对照 372 个基线哈希确认本轮仅 16 个预定文件变更，前二十模块、57 个 Hydrogen 源文件、两份 Hydrogen 产物、既有行为测试、专项选择器和冒烟脚本不变。18 个函数经明确依赖替换后与原逻辑逐字一致；除提取、初始化接线、注入点、版本和边界注释外，模板余部逐字一致，调用点不变。

变更文件均为 UTF-8 无 BOM、LF，94 个本地文档链接有效，`git diff --check` 通过。详细证据为 `audit.json`，汇总为 `validation-summary.json`。

下一阶段为帖子时间轴与滚动联动，本轮未开始该阶段。
