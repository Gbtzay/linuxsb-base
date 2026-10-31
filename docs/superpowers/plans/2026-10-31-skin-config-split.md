# Skin Configuration Adapter Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 完成第十阶段配置适配拆分，集中状态存取与校验，保持界面、配置和媒体行为。

**Architecture:** 无 DOM 配置控制器使用已有状态纯函数，模板通过 getter 读取最新状态并保留渲染副作用。修改方法返回是否接受输入，保存和校验由控制器执行。

**Tech Stack:** JavaScript ES modules、Node.js 24、JSDOM、既有 Chromium 冒烟。

**Spec:** [配置适配设计](../specs/2026-10-31-skin-config-split-design.md)

## Global Constraints

- 保留当前分支与既有未提交改动；不移动源码或重置工作区。
- 无新依赖或运行时加载器；源码为 UTF-8 无 BOM、LF。
- skin 2.0.45，Oxygen/LTS 2.0.50，Hydrogen 2.4.2；正式 21、开发 26 模块。
- 不改变配置字段、默认值、`topicSpaNewWorldDefaultMigrationV1`、`canvas-state:v2` 或状态版本。
- 单 worker、512 MiB V8 堆上限，按影响验证，不重复全量 Node 或无关 AI 测试。

---

### Task 1: 配置和状态控制器

**Files:** 新增 `plugins/skin/config-controller.js`、`test/skin-config.test.js`；修改 `plugins/skin/skin.template.js`、`test/skin-source.test.js`、`test/skin-canvas.test.js`。

**Interfaces:** 使用设计中的 `createSkinConfigController` 与方法；`stateApi` 是现有 canvas-state 导出的显式集合。

- [x] 保存文件哈希和模板/夹具快照，执行既有配置基线。
- [x] 先将新模块加入生成器测试 fixture，运行既有构建用例，确认旧生成器返回缺少模块结果：

```js
assert.equal(context.result.config, 'config-ready')
```

- [x] 新增无 DOM 控制器回归，验证校验与上限、站点/宽度布局隔离、迁移及存储不可用时的内存状态。关键行为断言：

```js
assert.equal(controller.setAppearance('fontSize', 100), true)
assert.equal(controller.effective.appearance.fontSize, 32)
assert.equal(controller.setAppearance('backgroundVideoUrl', 'http://cdn.example/bg.mp4'), false)
```

- [x] 提取配置读取/迁移、状态存取和修改逻辑；模板中 `cfg`、`canvasState` 等读取统一使用控制器 getter，避免维护第二份状态。保留初始化和配置事件调用顺序。
- [x] 令牌输入改为 `shellStyleApi.mergeShellTokens(configController.tokenValues(), {})`，CSS 属性与资源清理继续留在模板。
- [x] 外观与布局事件保留原副作用顺序；控制器无效输入时退出，成功时刷新对应界面：

```js
if (!configController.choosePreset(preset)) return
applyShellTokens()
canvasSyncAppearance()
syncShellMedia()
```

- [x] `skin-canvas.test.js` 增加逐例停用 skin、等待已排队任务、关闭窗口；RAF 使用窗口计时器并提供对应取消方法，保持用例正文不变。

### Task 2: 构建接线与定向验证

**Files:** 修改 `scripts/build-skin.mjs`、`scripts/run-tests.mjs`、`test/test-runner.test.js`、版本真源和生成产物。

**Interfaces:** `@LSB_SKIN_CONFIG` 是唯一显式注入点，新测试加入 skin 专项。

- [x] 接入构建模块清单和标记检查；将 `skin-config.test.js` 加入专项及对应选择契约。
- [x] 同步 skin 两处版本与 Oxygen 两处版本，生成独立 skin。
- [x] 单 worker 运行配置控制器/生成器/集合检查，随后运行选定的既有配置、外观、媒体、布局及模式切换用例，分别保留日志。
- [x] 顺序构建开发版、正式版和 LTS，再执行产物校验、skin 新鲜度和跳过预算检查。
- [x] 顺序运行既有 legacy 与 iOS 27 冒烟，Node 堆上限 384 MiB；无新故障时不扩大到完整 Node/阅读专项。

### Task 3: 审查和阶段记录

**Files:** 更新 `plugins/skin/README.md`、`README.md`、`docs/CONVENTIONS.md`、`docs/README.md` 与本计划。

- [x] 对照快照审查初始化、配置事件、存储异常与延迟文件保存接线，进行只读代码审查，禁止额外并行测试。
- [x] 核对前十三模块和两份 Hydrogen 产物哈希，比较模板余部，确认只存在提取、接线和版本差异。
- [x] 更新当前版本、模块入口与后续 SPA 边界，检查本地链接、编码和 `git diff --check`。
- [x] 写入真实验证范围、通过数、限制和完成状态，保留未提交工作区。

## 执行与验收记录

第十阶段已完成，证据目录为 `artifacts/skin-config-split/`。在 `codex/integrate-origin-main` 上保留全部既有未提交改动；本轮未提交、推送或移动分支。

### 提取与修正

- 新增 `config-controller.js`（230 行），显式模块从 13 个增至 14 个，模板从 5401 行缩至 5239 行。控制器集中插件配置、一次性迁移、画布状态存取、外观/媒体键/布局校验与令牌输入，纯状态算法继续使用 `canvas-state.js`。模板使用实时 getter，保留渲染、媒体操作、设置面板和 SPA 编排。
- 首次机械提取误选 `readCanvasState()` 中的同名上下文语句，将多余闭包代码带入控制器；初次专项为 36 通过、3 失败（`targeted.log`）。修正提取边界后，控制器专项为 2 通过、1 失败（`config-green.log`）；该文件名不代表全绿。
- 剩余失败暴露首次迁移直接保存状态对象的问题。真实 Store 会缓存传入对象引用，暂缓保存的外观编辑可能污染存储缓存。首次迁移改为保存 `canvasCopy(canvasState)`，与普通保存一致；新行为用例在修正前失败，修正后通过。配置字段、默认值和存储版本保持不变。
- 新增 3 项无 DOM 行为测试，覆盖输入校验与 defer、状态副本、站点/宽度布局隔离、外观和布局分别重置、一次性迁移及存储异常。生成器沿用参数化契约，自然增加 2 项模块检查，专项选择契约同步更新。
- 画布夹具逐例停用插件并关闭窗口，RAF 使用窗口计时器并配对取消，测试正文保持原样。为 JSDOM 不实现的媒体方法补可覆盖的默认桩，旧设置媒体用例补 `pause` 桩，清理时不再输出相关未实现噪声。无新增压力测试或依赖。

### 低负载验证

- 修改前既有配置基线 **9/9 通过**（`baseline.log`）；旧生成器/专项选择未接入时契约验证 **2 项按预期失败**（`red-contract.log`）。
- 最终配置控制器、生成器和测试选择专项 **39/39 通过**（`targeted-final.log`）。现有外观、媒体、布局、迁移及模式切换集成 **18/18 通过**（`integration.log`），其中 skin 与画布各 9 项。
- 补齐媒体桩后，受影响画布 **9/9 复验通过**，且无上述 JSDOM 媒体噪声（`canvas-final.log`）。最终覆盖 **57 项不同专项**，复验不重复计数；无失败、取消或跳过。Node 测试使用单 worker 和 512 MiB V8 堆上限，未运行全量 Node、无关 AI 测试或 reading 专项。
- 顺序完成 `npm run build:dev`、`npm run build`；`check-dist`、`check-dev-dist`、skin 新鲜度和零跳过预算校验通过，分别见 `verify-release.log`、`verify-dev.log`、`verify-skin.log`、`verify-skips.log`。skin **2.0.45**、Oxygen/LTS **2.0.50**，Hydrogen **2.4.2**；正式 21、开发 26 模块。
- 浏览器逐套执行，Node 堆上限 384 MiB：legacy 首页滚动根与无限加载通过（`browser-legacy.log`）；iOS 27 **21 组通过**（`browser-ios27.log`），覆盖宽/中/窄屏、首页与帖子软跳、历史与滚动、head、持久站点卡、快速导航、失败回退和视频背景。截图在 `ios27/`。使用固定 HTML 与 Chromium，仍不代表真实手机、线上认证或油猴安装验收。

### 审查与范围核对

独立只读审查未发现本轮重要问题，没有阻断项；审查者未运行额外测试或修改文件。已核对配置事件重入、延迟媒体保存、getter 接线、预设/布局隔离、首次迁移副本及构建 fixture，结果保存在 `review.json`。

`node artifacts/skin-config-split/audit.mjs` 对照 351 个基线哈希完成核对：本轮 21 个变更文件符合范围；前十三模块、57 个 Hydrogen 源文件及正式/开发两份 Hydrogen 产物不变。除已审查的提取、getter 接线、媒体参数收拢、重复宽度赋值移除和版本变化外，模板余部逐字一致；画布用例正文未变。变更文件均为 UTF-8 无 BOM、LF，75 个本地文档链接有效，`git diff --check` 通过。详细结果为 `audit.json`，验证汇总为 `validation-summary.json`。

下一阶段处理 SPA 请求事务、缓存及正文/head 提交，可按清理责任继续细分；本轮未开始该阶段。
