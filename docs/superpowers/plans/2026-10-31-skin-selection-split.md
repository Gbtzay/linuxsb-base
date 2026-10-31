# Skin Selection Implementation Plan

> **For agentic workers:** Execute these steps in this session. Steps use checkbox (`- [x]`) syntax for tracking.

**Goal:** 完成第十八阶段：画布文本选择与上下文操作胶囊拆分。

**Architecture:** 选择控制器持有选择状态、监听与关闭计时器；模板通过 getter/回调桥接共享宿主、焦点、活动面板、视口和层级，保留原调用点。

**Tech Stack:** JavaScript ES modules、Node.js 24、既有 JSDOM 集成测试。

**Spec:** [文本选择与操作胶囊设计](../specs/2026-10-31-skin-selection-split-design.md)

## Global Constraints

- 在 `codex/integrate-origin-main` 保留既有改动，不移动、提交或推送。
- skin 2.0.53，Oxygen/LTS 2.0.58，Hydrogen 2.4.2；23 个 skin 模块，正式 21、开发 26 个套件模块。
- 前二十二个模块与 Hydrogen 不变；无新增依赖、配置、文案或行为，UTF-8 无 BOM、LF。
- 复用现有测试，单 worker、512 MiB Node 堆上限，不新增行为测试。不跑全量、浏览器、无关 AI 或压力测试。

### Task 1: 构建契约与提取

**Files:** 新增 `plugins/skin/selection-controller.js`；修改模板、`scripts/build-skin.mjs`、`test/skin-source.test.js`。

- [x] 保存 378 个基线哈希与模板快照；2 项现有基线通过，原生收藏点击出现既有 JSDOM requestSubmit 诊断，未影响点击/关闭断言：

```powershell
node artifacts/skin-selection-split/run.mjs baseline.log --max-old-space-size=512 --test --test-force-exit --test-concurrency=1 --test-name-pattern='选中文本显示上下文胶囊|统一工具 Sheet 互斥' test/skin-canvas.test.js
```

- [x] 扩展已有构建 fixture，观察旧生成器 `missing-selection`、期望 `selection-ready`；保留完整行标记和准确模块名断言。
- [x] 提取 6 个函数、5 处状态；显式注入当前宿主/胶囊/面板/视口，恢复焦点与递增共享层级由模板回调完成。
- [x] 保留原绑定、点击委托与关闭/卸载顺序；增加唯一 `@LSB_SKIN_SELECTION` 注入点与模块内标记禁用检查。

### Task 2: 版本与定向验证

**Files:** 版本源、独立/dev/release/LTS 产物和本阶段证据。

- [x] 同步版本、生成 skin，运行完整 `test/skin-source.test.js`。
- [x] 运行既有文本选择/原生操作、浮层互斥/遮罩、模式切换与停用恢复专项：

```powershell
node artifacts/skin-selection-split/run.mjs integration.log --max-old-space-size=512 --test --test-force-exit --test-concurrency=1 --test-name-pattern='选中文本显示上下文胶囊|统一工具 Sheet 互斥|画布浮层使用统一遮罩|界面模式双向切换|停用皮肤还原正文父节点' test/skin-canvas.test.js test/skin.test.js
```

- [x] 顺序执行 `npm run build:dev`、`npm run build`，检查正式/开发分发、skin 新鲜度及零跳过预算。

### Task 3: 审查与记录

**Files:** README、开发规范、文档索引、skin 源码入口、设计和本计划。

- [x] 按 requesting-code-review 技能进行一次独立只读审查，核对共享焦点/层级桥接、原生操作、监听/计时器和初始化/清理顺序；不追加测试或构建。
- [x] 对照基线核对函数和模板余部，确认前二十二个模块、Hydrogen、行为测试、选择器与冒烟脚本不变。
- [x] 更新入口、版本、下一阶段边界和实际验收记录，检查编码、本地链接及 `git diff --check`，保留未提交状态。

## 执行与验收记录

第十八阶段已完成，证据目录为 `artifacts/skin-selection-split/`。在 `codex/integrate-origin-main` 保留全部既有未提交改动，本轮未提交、推送或移动分支。

### 实现与验证

- 新增 `selection-controller.js`（134 行），提取 6 个函数和 5 处状态；显式模块从 22 个增至 23 个，模板从 3256 行缩至 3138 行，减少 118 行。
- 文本选择、原生回复/引用/收藏/复制委托、2000 字符限制、视口边界、8 秒关闭计时器和 focus-within 保护保持。宿主、活动面板与视口实时读取；共享焦点恢复和层级递增由模板回调接入，原执行位置和顺序不变。
- 模板保留原选择事件绑定、操作后关闭与卸载编排；异步复制错误处理和 rAF 调度策略沿用原逻辑，没有新增产品行为。
- 2 项现有基线通过（`baseline.log`）。新构建 fixture 在旧生成器上 **1 项按预期失败**，实际 `missing-selection`、期望 `selection-ready`（`red-contract.log`）。最终生成器 **49/49 通过**（`targeted.log`）、选择/原生委托/浮层/模式切换/停用集成 **5/5 通过**（`integration.log`），共 **54 项不同专项**；基线不重复计数。
- 收藏按钮夹具是原生 submit 按钮，JSDOM 的 requestSubmit 尚未实现；基线和最终集成各出现一次相同诊断，但原生点击次数、胶囊关闭及其余断言全部通过。该诊断保留在日志中，未修改测试夹具或抑制输出；本轮不将模拟环境的提交诊断计为产品回归，也不声称验证了实际表单提交。
- 没有新增行为测试或修改已有夹具/选择器，仅扩展生成器参数化 fixture，自然增加 2 项检查。Node 单 worker、512 MiB 堆上限，无最终失败、取消或跳过。已有浏览器脚本无直接文本选择检查，本轮未重跑浏览器、全量 Node、无关 AI 或压力测试；此前浏览器结果不计入本阶段验收。
- 开发构建、正式构建/LTS 均首次通过（`build-dev.log`、`build-release.log`）。正式/开发分发、skin 新鲜度和零跳过预算通过（`verify-release.log`、`verify-dev.log`、`verify-skin.log`、`verify-skips.log`）。skin **2.0.53**、Oxygen/LTS **2.0.58**，Hydrogen **2.4.2**；正式 21、开发 26 个套件模块。

### 审查与范围核对

独立只读审查 Critical、Important、Minor 均无发现；审查者未修改文件或执行测试/构建/浏览器，结论为 `review.json`。

`audit.mjs` 对照 378 个基线哈希确认本轮仅 16 个预定文件变更，前二十二个模块、57 个 Hydrogen 源文件、两份 Hydrogen 产物、既有行为测试、专项选择器和冒烟脚本不变。6 个函数经明确依赖替换和共享状态回调桥接后与原逻辑逐字一致；除提取、初始化接线、注入点、版本和边界注释外，模板余部逐字一致，原调用点不变。

变更文件均为 UTF-8 无 BOM、LF，100 个本地文档链接有效，`git diff --check` 通过。详细证据为 `audit.json`，汇总为 `validation-summary.json`。

下一阶段为画布外观面板与配置交互，本轮未开始该阶段。
