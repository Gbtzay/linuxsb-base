# skin 样式生成拆分 Implementation Plan

> **For agentic workers:** Use the writing-plans / TDD workflow to execute these checked steps in the current authorized workspace, with verification before completion.

**Goal:** 完成第二步真实源码拆分，让样式生成成为构建与测试共用的纯模块。

**Architecture:** 在既有显式模板生成器中增加样式模块。模板只做环境判定和 DOM/令牌适配，`skinCss` 每次接收最新配置；不引入通用打包器或运行时依赖。

**Tech Stack:** Node 24、原生 ES 模块、node:test、jsdom、Chromium 冒烟。

**Spec:** `docs/superpowers/specs/2026-10-30-skin-style-split-design.md`

## Global Constraints

- 延续当前工作区，保留已有改动，不提交或推送；UTF-8 无 BOM、LF；不新增依赖。
- skin 2.0.37，Oxygen/LTS 2.0.42；Hydrogen 2.4.2，正式 21 / 开发 26 个模块。
- 仅提取样式生成，允许行首缩进变化，CSS 规则与顺序、令牌注入、DOM/媒体/导航行为不变。

### Task 1: 样式模块和生成契约

**Files:** 新增 `plugins/skin/styles.js`、`test/skin-styles.test.js`；修改 `plugins/skin/skin.template.js`、`scripts/build-skin.mjs`、`test/skin-source.test.js`。

**Interfaces:** `shellCss()`、`canvasCss()` 返回各自壳样式；`skinCss(cfg = {}, { shellActive = false, uiMode = 'legacy' } = {})` 返回当前配置的 CSS；生成器读取两个显式模块，每个对应唯一模板标记。

- [x] 保存提取前模板、独立脚本与样式输出到 `artifacts/skin-style-split/`。
- [x] 先写失败测试：样式模块可调用；界面选择及配置生效；样式源修改进入实际套件构建；坏编码/注入点和输出漂移失败。

```js
const compact = skinCss({ density: '紧凑' })
const dom = new JSDOM(`<style>${compact}</style><html class="lsb-skin-density-compact"><body><ul class="post-list"><li class="post-item">帖子</li></ul></body></html>`)
assert.equal(dom.window.getComputedStyle(dom.window.document.querySelector('li')).paddingBlock, '3px')
```

- [x] 原样提取固定字体栈和三组样式，仅显式化配置、壳启用与模式参数；模板中改为：

```js
el.textContent = skinCss(cfg, { shellActive: shellUiActive(), uiMode: effectiveUiMode() })
```

- [x] 生成器新增显式样式输入与注入点校验；坏输入检查先于写盘，校验模式保持只读。
- [x] 运行 `node --test --test-force-exit test/skin-source.test.js test/skin-styles.test.js test/build-suite-validation.test.js`。
- [x] 比较提取前后 128 组 CSS 输出和其余 runtime，除行首缩进及已列出的适配/版本/注释外一致。

### Task 2: 构建、文档与完整验收

**Files:** 修改 `scripts/run-tests.mjs`、`test/test-runner.test.js`、版本文件、README、开发规范、skin 说明和文档索引；生成独立脚本与正式产物。

- [x] 将样式测试纳入 `test:skin`，同步模块/套件版本、编辑入口、生成约定和后续边界。
- [x] 依次执行 `build:dev` → `build` → `verify:profiles` → `verify:skin` → `verify:test-skips` → `test:all` → `smoke:browser`，失败时定位具体回退后修复。
- [x] 核对本轮差异、编码和链接，记录测试数量、浏览器结果和提取比较证据。

## 执行记录（2026-10-30）

第二步已完成：将约 1024 行固定字体栈、旧三段式/单画布样式及正文样式组合提取到 plugins/skin/styles.js。restyle 每次传入当前配置、实际壳状态和界面模式；令牌注入、DOM、媒体和导航生命周期保留在模板。

验证结果：

- 实现前 6 项失败用例确认样式入口缺失、构建未消费样式源、漂移/坏输入未被拦截；实现后生成、样式、构建与测试调度专项 17 项通过。另以失败测试补齐模块复制或冒充模板注入点的拒绝行为。
- CSS 保真比较：128 组配置、界面模式和实际壳状态组合，模块和生成脚本均与提取前一致；仅归一行首空格/制表符，CSS 规则与顺序不变。剩余 runtime 除明确的函数调用适配、注释和版本外逐字一致。
- Node 纯函数测试验证界面选择、排版/密度/代码块/楼层/限宽，以及配置更新和输入不可变。楼层边框中的 CSS 变量在 jsdom 无法计算 shorthand，经拆分前后对照确认后改用 CSSOM 校验；产品 CSS 未因此调整。
- 按顺序完成 build:dev、build、verify:profiles、verify:skin、verify:test-skips、test:all、smoke:browser，均成功。
- 完整 Node 回归：1037 项通过，0 失败、0 跳过。
- Chromium 冒烟通过：旧三段式、单画布宽/中/窄视口、减少动效、软跳与历史恢复，以及阅读中心桌面/触屏、多标签接管等 9 个阅读场景。验收使用离线站点快照。
- 本轮 16 个文件编码检查及 28 个文档本地链接通过；本轮已跟踪文件通过 git diff --check。已有 title-forge-planner 测试文件的 CRLF 未在本轮改动。
- skin 2.0.37、Oxygen/LTS 2.0.42；Hydrogen 2.4.2，正式 21 / 开发 26 个模块。无新依赖，未提交或推送。

本地证据保存在忽略目录 artifacts/skin-style-split/：

- skin.before.template.js、skin.before.user.js、style-output-baseline.json：提取前基线。
- verify-extraction.mjs、extraction-comparison.json：128 组输出及剩余 runtime 比较。
- red-tests.log、node-tests.log、browser-smoke.log、reading-results.json：本轮测试证据。
- build-checks.json、source-checks.json、validation-summary.json：构建、源码及验收汇总。

下一步：媒体资源生命周期，明确 IndexedDB、对象 URL、视频/图片/字体在加载、替换、停用时的释放责任。
