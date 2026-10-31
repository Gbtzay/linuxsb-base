# Skin Appearance Implementation Plan

> **For agentic workers:** Execute these steps in this session. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 完成第十九阶段：画布外观面板与配置交互拆分。

**Architecture:** 外观控制器同步面板并绑定实际控件，调用既有配置/媒体控制器；模板通过 getter 与原函数桥接当前 DOM、状态保存和渲染效果。

**Tech Stack:** JavaScript ES modules、Node.js 24、既有 JSDOM 集成测试。

**Spec:** [画布外观面板设计](../specs/2026-10-31-skin-appearance-split-design.md)

## Global Constraints

- 在 `codex/integrate-origin-main` 保留既有改动，不移动、提交或推送。
- skin 2.0.54，Oxygen/LTS 2.0.59，Hydrogen 2.4.2；24 个 skin 模块，正式 21、开发 26 个套件模块。
- 前二十三个模块与 Hydrogen 不变；无新增依赖、配置、文案或行为，UTF-8 无 BOM、LF。
- 复用现有测试，单 worker、512 MiB Node 堆上限，不新增行为测试。不跑全量、浏览器、无关 AI 或压力测试。

### Task 1: 构建契约与提取

**Files:** 新增 `plugins/skin/appearance-controller.js`；修改模板、`scripts/build-skin.mjs`、`test/skin-source.test.js`。

- [x] 保存 381 个基线哈希及模板快照；3 项现有基线通过：

```powershell
node artifacts/skin-appearance-split/run.mjs baseline.log --max-old-space-size=512 --test --test-force-exit --test-concurrency=1 --test-name-pattern='外观 Sheet 提供预设|save appearance commits unsignaled|ios27 媒体生命周期：停用后上传完成不能修改外观配置' test/skin-canvas.test.js test/skin.test.js
```

- [x] 扩展已有构建 fixture，观察旧生成器 `missing-appearance`、期望 `appearance-ready`；保留完整行标记与准确模块名断言。
- [x] 提取 9 个既有函数，原控件绑定片段包装为 `bindAppearanceControls()`；保留实际 DOM 的绑定标记，不引入控制器自有状态。
- [x] 保留同步与挂载时的调用顺序；新增唯一 `@LSB_SKIN_APPEARANCE` 注入点及模块内标记禁用检查。

### Task 2: 版本与定向验证

**Files:** 版本源、独立/dev/release/LTS 产物和本阶段证据。

- [x] 同步版本、生成 skin，运行完整 `test/skin-source.test.js`。
- [x] 运行既有预设、背景、保存/重载、媒体与模式切换专项：

```powershell
node artifacts/skin-appearance-split/run.mjs integration.log --max-old-space-size=512 --test --test-force-exit --test-concurrency=1 --test-name-pattern='外观 Sheet 提供预设|选择原始背景会清除|选择外观预设会清除旧颜色|选择新外观预设会清除旧站点|save appearance commits unsignaled|local video selection takes precedence|ios27 媒体生命周期：相同本地键再次上传替换视频|ios27 媒体生命周期：停用后上传完成不能修改外观配置|界面模式双向切换|站点信息表面保持原生侧栏卡片的完整高度并提供明确保存入口' test/skin-canvas.test.js test/skin.test.js
```

- [x] 顺序执行 `npm run build:dev`、`npm run build`，检查正式/开发分发、skin 新鲜度及零跳过预算。

### Task 3: 审查与记录

**Files:** README、开发规范、文档索引、skin 源码入口、设计和本计划。

- [x] 按 requesting-code-review 技能进行一次独立只读审查，核对实时配置/宿主读取、控件绑定、异步保存及刷新顺序，不追加测试/构建。
- [x] 对照基线核对原函数、绑定片段和模板余部，确认前二十三个模块、Hydrogen、行为测试、选择器及冒烟脚本不变。
- [x] 更新入口、版本、下一阶段边界和实际验收记录，检查编码、本地链接及 `git diff --check`，保留未提交状态。

## 执行与验收记录

第十九阶段已完成，证据目录为 `artifacts/skin-appearance-split/`。在 `codex/integrate-origin-main` 保留全部既有未提交改动，本轮未提交、推送或移动分支。

### 实现与验证

- 新增 `appearance-controller.js`（159 行），提取 9 个既有函数，将原控件绑定片段包装为 `bindAppearanceControls()`，模块共 10 个函数，不引入控制器自有可变状态。显式模块从 23 个增至 24 个，模板从 3138 行缩至 3002 行，减少 136 行。
- 面板同步继续读取当前配置、宿主和表面，保留正在编辑的输入；保存先收集未触发事件的控件值，再按原顺序保存、应用令牌、同步界面与媒体，保留成功提示。预设、背景、外观与布局恢复继续使用既有配置控制器。
- 本地媒体保留校验、等待保存、写入引用、刷新与提示顺序，AbortError 静默退出，文件输入在 finally 中清空。实际 DOM 的绑定标记、事件类型和原处理函数引用不变；模板在原挂载位置调用 `bind()`，随后撤除首屏引导标记。没有新增产品行为。
- 3 项现有基线通过（`baseline.log`）。新构建 fixture 在旧生成器上 **1 项按预期失败**，实际 `missing-appearance`、期望 `appearance-ready`（`red-contract.log`）。最终生成器 **51/51 通过**（`targeted.log`），预设/背景/保存/重载/本地媒体/模式切换集成 **10/10 通过**（`integration.log`），共 **61 项不同专项**；基线不重复计数。
- 没有新增行为测试或修改既有行为夹具/选择器，仅扩展生成器参数化 fixture，自然增加 2 项检查。Node 单 worker、512 MiB 堆上限，无最终失败、取消或跳过。本轮未改布局、样式或滚动根，没有重跑浏览器套件、全量 Node、无关 AI 或压力测试；此前浏览器结果不计入本阶段验收。
- 开发构建、正式构建/LTS 均通过（`build-dev.log`、`build-release.log`）。正式/开发分发、skin 新鲜度和零跳过预算通过（`verify-release.log`、`verify-dev.log`、`verify-skin.log`、`verify-skips.log`）。skin **2.0.54**、Oxygen/LTS **2.0.59**，Hydrogen **2.4.2**；正式 21、开发 26 个套件模块。

### 审查与范围核对

独立只读审查 Critical、Important、Minor 均无发现；审查者未修改文件或执行测试/构建/浏览器，结论为 `review.json`。

`audit.mjs` 对照 381 个基线哈希确认本轮仅 16 个预定文件变更，前二十三个模块、57 个 Hydrogen 源文件、两份 Hydrogen 产物、既有行为测试、专项选择器和冒烟脚本不变。9 个函数经明确依赖替换后与原逻辑逐字一致，绑定片段只增加方法包装；除提取、接线、注入点、版本和边界注释外，模板余部逐字一致。

变更文件均为 UTF-8 无 BOM、LF，103 个本地文档链接有效，`git diff --check` 通过。详细证据为 `audit.json`，汇总为 `validation-summary.json`。

下一阶段为画布浮层布局与拖拽缩放，本轮未开始该阶段。
