# Skin Settings Implementation Plan

> **For agentic workers:** Execute these steps in this session. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 完成第十五阶段：设置面板渲染与油猴菜单同步的控制器拆分。

**Architecture:** 控制器接收 UI、实时配置与已有媒体/配置控制器，持有菜单注销函数。设置注册、配置订阅和 dispose 编排仍在模板。

**Tech Stack:** JavaScript ES modules、Node.js 24、现有 JSDOM 集成测试。

**Spec:** [设置面板与菜单设计](../specs/2026-10-31-skin-settings-split-design.md)

## Global Constraints

- 在 `codex/integrate-origin-main` 保留既有改动，不移动、提交或推送。
- skin 2.0.50，Oxygen/LTS 2.0.55，Hydrogen 2.4.2；20 个 skin 模块，正式 21、开发 26 个套件模块。
- 前十九模块与 Hydrogen 不变；无新增依赖、配置、文案或行为，UTF-8 无 BOM、LF。
- 复用现有测试，单 worker、512 MiB Node 堆上限；本阶段不重跑路由/阅读浏览器冒烟、全量 Node、无关 AI 或压力测试。

### Task 1: 构建契约与提取

**Files:** 新增 `plugins/skin/settings-controller.js`；修改模板、`scripts/build-skin.mjs`、`test/skin-source.test.js`。

**Interfaces:** `createSkinSettingsController({ document, ui, getConfig, saveConfig, configController, mediaController, applyAll })` 返回 `{ render, syncMenu, clearMenu }`；注入点 `@LSB_SKIN_SETTINGS`。

- [x] 保存 369 个基线哈希及模板快照；运行 4 项基线：

```powershell
node artifacts/skin-settings-split/run.mjs baseline.log --max-old-space-size=512 --test --test-force-exit --test-concurrency=1 --test-name-pattern='设置面板导入本地视频|油猴菜单可切换|停用后上传完成不能修改外观配置' test/skin.test.js
```

- [x] 扩展已有构建 fixture，确认旧生成器实际结果为 `missing-settings`：

```js
assert.equal(context.result.settings, 'settings-ready')
```

- [x] 提取 `renderSkinSettings`、`syncGmMenu` 和 `unregMenu`，只替换外部依赖。模板在原位置初始化并注册：

```js
const settingsController = createSkinSettingsController({
  document, ui: api.ui, getConfig: () => api.config(), saveConfig: (patch) => api.saveConfig(patch),
  configController, mediaController, applyAll,
})
api.ui.configTab({ name: '界面精修', order: 80, render: settingsController.render })
settingsController.syncMenu()
```

- [x] 配置事件中的菜单同步和 dispose 中的注销改用 `settingsController.syncMenu()` / `settingsController.clearMenu()`，保留原位置与顺序。

### Task 2: 版本与定向验证

**Files:** 版本源、独立/dev/release/LTS 产物和本阶段证据。

- [x] 同步版本、生成 skin，运行 `test/skin-source.test.js`；保留完整行标记匹配。
- [x] 运行设置 schema、双模式切换、配置生效、本地媒体替换/停用、设置导入与菜单开关专项：

```powershell
node artifacts/skin-settings-split/run.mjs integration.log --max-old-space-size=512 --test --test-force-exit --test-concurrency=1 --test-name-pattern='界面模式设置位于|界面模式双向切换|关闭项不产生任何规则|相同本地键再次上传替换视频|停用后上传完成不能修改外观配置|设置面板导入本地视频|设置按钮打开氢面板|油猴菜单可切换' test/skin.test.js
```

- [x] 顺序执行 `npm run build:dev`、`npm run build`，检查正式/开发分发、skin 新鲜度与零跳过预算。

### Task 3: 审查与记录

**Files:** README、开发规范、文档索引、skin 源码入口、设计和本计划。

- [x] 按 requesting-code-review 技能进行一次独立只读审查，核对实时配置读取、异步保存、菜单注销和初始化/注册顺序；不增加测试运行。
- [x] 对照基线核对两个函数及模板余部，确认前十九模块、Hydrogen、既有行为测试与选择器不变。
- [x] 更新入口、版本、下一阶段边界和实际验收结果，检查编码、本地链接及 `git diff --check`，保留未提交状态。

## 执行与验收记录

第十五阶段已完成，证据目录为 `artifacts/skin-settings-split/`。在 `codex/integrate-origin-main` 保留全部既有未提交改动，本轮未提交、推送或移动分支。

### 实现与验证

- 新增 `settings-controller.js`（78 行），提取设置渲染、菜单同步两个函数和菜单注销状态；显式模块从 19 个增至 20 个，模板从 3774 行缩至 3706 行，减少 68 行。
- 媒体校验/保存、配置更新、刷新和提示顺序保持，AbortError 仍静默退出。菜单先注销再按实时配置注册，点击时重新读取配置；模板保留设置页注册、配置事件和 dispose 编排。没有新增产品行为。
- 4 项现有基线通过（`baseline.log`）。新构建 fixture 在旧生成器上 **1 项按预期失败**，实际 `missing-settings`、期望 `settings-ready`（`red-contract.log`）。最终生成器 **43/43 通过**（`targeted.log`）、设置/媒体/菜单/模式切换集成 **10/10 通过**（`integration.log`），共 **53 项不同专项**；基线不重复计数。
- 没有新增行为测试或修改已有夹具/选择器；仅扩展生成器参数化 fixture，自然增加 2 项检查。Node 单 worker、512 MiB 堆上限，无最终失败、取消或跳过。本阶段依改动范围收敛验证，没有重跑路由/阅读浏览器冒烟、全量 Node、无关 AI 或压力测试；不将此前浏览器结果计为本轮验收。
- 开发构建通过（`build-dev.log`）。首次正式构建在写入 `dist/linuxsb-suite.user.js` 时遇到 Windows `UNKNOWN` 文件访问错误（`build-release.log`）；文件并非只读，随后可正常以读写方式打开且未截断。未修改构建代码，重试正式构建通过（`build-release-retry.log`）；具体占用原因未确认，未因此重复测试。
- 正式/开发分发、skin 新鲜度及零跳过预算通过（`verify-release.log`、`verify-dev.log`、`verify-skin.log`、`verify-skips.log`）。skin **2.0.50**、Oxygen/LTS **2.0.55**，Hydrogen **2.4.2**；正式 21、开发 26 个套件模块。

### 审查与范围核对

独立只读审查 Critical、Important、Minor 均无发现；审查者未修改文件或执行测试/构建/浏览器，结论为 `review.json`。

`audit.mjs` 对照 369 个基线哈希确认本轮仅 16 个预定文件变更，前十九模块、57 个 Hydrogen 源文件、两份 Hydrogen 产物、既有行为测试、专项选择器和冒烟脚本不变。两个函数经明确依赖替换后与原逻辑逐字一致；除提取、初始化与调用接线、注入点、版本和边界注释外，模板余部逐字一致。

变更文件均为 UTF-8 无 BOM、LF，91 个本地文档链接有效，`git diff --check` 通过。详细证据为 `audit.json`，汇总为 `validation-summary.json`。

下一阶段为顶栏附加入口与原生控件接管，本轮未开始该阶段。
