# Skin Timeline Implementation Plan

> **For agentic workers:** Execute these steps in this session. Steps use checkbox (`- [x]`) syntax for tracking.

**Goal:** 完成第十七阶段：帖子时间轴与滚动联动拆分。

**Architecture:** 时间轴控制器集中楼层 UI、窗口监听、待执行帧与性能限频状态；模板保留原路由、新增楼层事件和取消/解绑编排。

**Tech Stack:** JavaScript ES modules、Node.js 24、既有 JSDOM 集成测试。

**Spec:** [时间轴与滚动联动设计](../specs/2026-10-31-skin-timeline-split-design.md)

## Global Constraints

- 在 `codex/integrate-origin-main` 保留既有改动，不移动、提交或推送。
- skin 2.0.52，Oxygen/LTS 2.0.57，Hydrogen 2.4.2；22 个 skin 模块，正式 21、开发 26 个套件模块。
- 前二十一个模块与 Hydrogen 不变；无新增依赖、配置、文案或行为，UTF-8 无 BOM、LF。
- 按范围复用现有测试，单 worker、512 MiB Node 堆上限，不新增行为测试。不跑全量、浏览器、无关 AI 或压力测试。

### Task 1: 构建契约与提取

**Files:** 新增 `plugins/skin/timeline-controller.js`；修改模板、`scripts/build-skin.mjs`、`test/skin-source.test.js`。

- [x] 保存 375 个基线哈希和模板快照；3 项现有时间轴基线通过：

```powershell
node artifacts/skin-timeline-split/run.mjs baseline.log --max-old-space-size=512 --test --test-force-exit --test-concurrency=1 --test-name-pattern='帖子页有时间轴|从帖子回首页只藏时间轴|帖内时间轴能读' test/skin.test.js
```

- [x] 扩展已有构建 fixture，观察旧生成器返回 `missing-timeline`，期望 `timeline-ready`；保留完整行标记匹配与准确模块名断言。
- [x] 提取 11 个既有函数、4 处状态并包装原取消帧代码为 `cancelPending()`；通过 getter 注入当前页面、选择器、壳开关和探针能力，复用通用 `perfEmit`。
- [x] 保留原调用点；取消帧和解绑监听保持分开，在原清理位置执行，新增唯一 `@LSB_SKIN_TIMELINE` 注入点及模块内标记禁用检查。

### Task 2: 版本与定向验证

**Files:** 版本源、独立/dev/release/LTS 产物和本阶段证据。

- [x] 同步版本、生成 skin，运行完整 `test/skin-source.test.js`。
- [x] 运行既有时间轴挂载/显隐/日期、模式切换、断点卸载、停用恢复与新增楼层事件专项：

```powershell
node artifacts/skin-timeline-split/run.mjs integration.log --max-old-space-size=512 --test --test-force-exit --test-concurrency=1 --test-name-pattern='帖子页有时间轴|从帖子回首页只藏时间轴|帖内时间轴能读|界面模式双向切换|旧三栏断点跨越|停用皮肤还原正文父节点|帖子软跳提交后同步基座 CSRF' test/skin.test.js
```

- [x] 顺序执行 `npm run build:dev`、`npm run build`，检查正式/开发分发、skin 新鲜度与零跳过预算。

### Task 3: 审查与记录

**Files:** README、开发规范、文档索引、skin 源码入口、设计和本计划。

- [x] 按 requesting-code-review 技能进行一次独立只读审查，检查调度、getter、性能限频、取消/解绑顺序和生成器接线；不额外运行测试/构建/浏览器。
- [x] 对照基线逐字核对函数、取消帧片段与模板余部，确认前二十一个模块、Hydrogen、行为测试、选择器和冒烟脚本不变。
- [x] 更新入口、版本、下一阶段边界和实际验收记录，检查编码、本地链接及 `git diff --check`，保留未提交状态。

## 执行与验收记录

第十七阶段已完成，证据目录为 `artifacts/skin-timeline-split/`。在 `codex/integrate-origin-main` 保留全部既有未提交改动，本轮未提交、推送或移动分支。

### 实现与验证

- 新增 `timeline-controller.js`（164 行），提取 11 个既有函数、4 处状态，将原取消帧片段包装为 `cancelPending()`，模块共 12 个函数。显式模块从 21 个增至 22 个，模板从 3402 行缩至 3256 行，减少 146 行。
- 楼层稳定排序、主帖/最新/轨道跳转、减少动效偏好、日期/回复总数/进度/ARIA 更新保持。非帖子页隐藏而不销毁时间轴；窗口监听、帧合并与 16ms 回退保持；探针存在时测量，不足 8ms 不上报，每秒最多两条。
- 页面、选择器、壳开关和探针能力通过 getter 实时读取。模板原调用点、新增楼层事件订阅与取消帧/解绑顺序不变；通用性能上报与滚动根仍由原模块/模板负责。没有新增产品行为。
- 3 项现有基线通过（`baseline.log`）。新构建 fixture 在旧生成器上 **1 项按预期失败**，实际 `missing-timeline`、期望 `timeline-ready`（`red-contract.log`）。最终生成器 **47/47 通过**（`targeted.log`）、时间轴/模式切换/停用/新增楼层事件集成 **7/7 通过**（`integration.log`），共 **54 项不同专项**；基线不重复计数。
- 没有新增行为测试或修改已有夹具/选择器，仅扩展生成器参数化 fixture，自然增加 2 项检查。Node 单 worker、512 MiB 堆上限，无最终失败、取消或跳过。本轮未改布局、样式或滚动根，没有重跑浏览器套件、全量 Node、无关 AI 或压力测试；此前浏览器结果不计入本阶段验收。
- 开发构建、正式构建/LTS 均首次通过（`build-dev.log`、`build-release.log`）。正式/开发分发、skin 新鲜度和零跳过预算通过（`verify-release.log`、`verify-dev.log`、`verify-skin.log`、`verify-skips.log`）。skin **2.0.52**、Oxygen/LTS **2.0.57**，Hydrogen **2.4.2**；正式 21、开发 26 个套件模块。

### 审查与范围核对

独立只读审查 Critical、Important、Minor 均无发现；审查者未修改文件或执行测试/构建/浏览器，结论为 `review.json`。

`audit.mjs` 对照 375 个基线哈希确认本轮仅 16 个预定文件变更，前二十一个模块、57 个 Hydrogen 源文件、两份 Hydrogen 产物、既有行为测试、专项选择器和冒烟脚本不变。11 个函数经明确依赖替换后与原逻辑逐字一致，取消帧片段只增加方法包装；除提取、初始化/清理接线、注入点、版本和边界注释外，模板余部逐字一致。

变更文件均为 UTF-8 无 BOM、LF，97 个本地文档链接有效，`git diff --check` 通过。详细证据为 `audit.json`，汇总为 `validation-summary.json`。

下一阶段为画布文本选择与上下文操作胶囊，本轮未开始该阶段。
