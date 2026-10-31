# skin 分步拆分 Implementation Plan

> **For agentic workers:** Use the writing-plans / TDD workflow to execute these checked steps in the current authorized workspace, with verification before completion.

**Goal:** 完成第一步真实源码拆分，打包与测试共用画布状态纯函数。

**Architecture:** 显式模板 + 原生 ES 状态模块，通过小型生成器得到兼容现有安装路径的单文件脚本，再复用已有 AI 构建裁剪。构建读取组合源码，校验拒绝生成文件滞后；其余 runtime 原样留在模板。

**Tech Stack:** Node 24、原生 JavaScript、node:test、jsdom、现有 Chromium 冒烟。

**Spec:** `docs/superpowers/specs/2026-10-30-skin-split-design.md`

## Global Constraints

- 延续当前 `codex/` 分支中的已授权工作，不提交/推送，不重置已有改动。
- 统一 UTF-8 无 BOM、LF；不新增运行时依赖，不改变基座 API 或数据格式。
- skin 升至 2.0.36，Oxygen/LTS 2.0.41；Hydrogen 2.4.2，正式 21 / 开发 26 个模块不变。
- 只在生成器中去除顶层声明的 `export` 前缀；AI 标记必须在各输入文件中独立配对。

### Task 1: 生成链路及失败保护

**Files:** 新增 `scripts/build-skin.mjs`、`test/skin-source.test.js`；修改 `scripts/build-common.mjs`、`build-suite.mjs`、`build-lts.mjs`、两个 dist 校验器、`scripts/run-tests.mjs`、`package.json`、CI。

**Interfaces:** `composeSkinSource({ root }) -> string` 从显式模板与状态文件组合；`syncSkinSource({ root, check })` 写入或只读验证生成文件。`readPluginSource(id)` 为构建统一入口。

- [x] 先写并运行失败测试：临时套件读取修改后的纯函数源码；dev/release 正确裁剪；过期输出只读失败；坏编码/标记/语法明确失败。

```js
const result = spawnSync(process.execPath, ['build-suite.mjs', '--profile=release'], { cwd: root, encoding: 'utf8' })
assert.equal(result.status, 0, result.stderr)
runInNewContext(readFileSync(join(root, 'dist/linuxsb-suite.user.js'), 'utf8'), context)
assert.equal(context.result.width, 'changed-at-source')
```

- [x] 实现小型生成器、构建消费与校验钩子；保留其他插件校验，更新临时构建夹具使其复制新增构建依赖。
- [x] `build:skin` 生成，`verify:skin` 只读校验；常规测试入口先校验；CI 检查生成文件与正式产物均已更新。
- [x] 运行 `node --test --test-force-exit test/skin-source.test.js test/build-suite-validation.test.js test/test-runner.test.js`。

### Task 2: 提取真正的状态模块，移除副本

**Files:** 新增 `plugins/skin/canvas-state.js`、`plugins/skin/skin.template.js`；生成 `plugins/skin.user.js`；将 `src/shell/canvas.js` 改为兼容转出口；删除旧章节副本；修改 `test/skin-canvas.test.js`、套件新鲜度测试与版本文件。

**Interfaces:** 保留 `defaultCanvasState`、`mergeCanvasState`、`migrateLegacySkinState`、`widthClass`、`siteKeyFromLocation`、`clampSurfaceRect`、`resolveSurfaceMode`；模块额外导出模板使用的常量与 canvas 前缀工具函数。

- [x] 保存提取前源码到忽略的 `artifacts/skin-split/`，记录纯函数和其余正文的对应边界。
- [x] 原样提取状态函数与默认常量，DOM 检测/AI markup 保留模板；提升两处模块版本及套件版本。
- [x] 删除旧参考副本，Node 直接测试新模块；以生成脚本运行既有 skin 和阅读中心验收。

```js
const first = defaultCanvasState()
const second = mergeCanvasState(first, { appearance: { fontSize: 18 } })
assert.equal(second.appearance.fontSize, 18)
assert.equal(first.global.appearance.fontSize, 14)
```

- [x] 归一比较移植前后的函数块和其余正文，确认除版本、章节说明与生成标记外无变化。
- [x] 运行构建、专项测试及 AI 分发测试。

### Task 3: 文档、完整验收和下一步边界

**Files:** 更新 `plugins/skin/README.md`、项目 README、开发规范和文档索引；更新本计划结果。

- [x] 说明真实编辑路径、生成命令、只读校验和后续拆分顺序，移除“章节仅参考”过时说明。
- [x] 按顺序执行 `build:dev` → `build` → `verify:profiles` → `verify:test-skips` → `test:all` → `smoke:browser`。
- [x] 检查最终增量与源文件编码；保留日志/归一比较证据，记录本轮真实结果。

## 执行记录（2026-10-30）

第一步已完成：新增画布状态模块和 runtime 模板，独立 skin 由显式生成器组合；构建、分发校验与测试入口共用同一源码。删除原目录中的 21 份章节 JS 副本与占位文件，旧 shell 状态入口改为兼容转出。skin 2.0.36、Oxygen/LTS 2.0.41；Hydrogen 2.4.2，正式 21 / 开发 26 个模块。

验证结果：

- TDD 红灯：实现前 3 项生成契约测试按预期失败，暴露套件读取旧生成文件及缺少组合/同步入口；实现后生成、构建校验与测试调度专项共 12 项通过。
- 提取保真：15 个状态声明仅改变导出与缩进；其余 runtime 归一比较一致；从 setup 到注册尾部与提取前逐字相同。
- 依次执行 build:dev、build、verify:profiles、verify:skin、verify:test-skips、test:all、smoke:browser，均通过。
- 完整 Node 回归：1032 项通过，0 失败、0 跳过；其中包括新的状态隔离、媒体迁移、兼容转出、生成漂移与 dev/release 构建契约。
- Chromium 浏览器冒烟：legacy 无限滚动、iOS 27 多视口/软跳/历史恢复，以及双界面阅读 9 个场景均通过；阅读覆盖桌面、触屏、阅读中心和同上下文多标签接管。仍使用离线站点快照，未扩展为线上账号验收。
- 本轮 26 个文件无 BOM/CRLF，26 个文档本地链接有效；本轮涉及的已跟踪文件通过 git diff --check。整仓差异检查另报告了既有 test/title-forge-planner.test.js 的 CRLF 行尾，本轮未修改该文件。

本地证据（artifacts/ 为忽略目录）：

- artifacts/skin-split/skin.before.user.js：提取前快照。
- artifacts/skin-split/verify-extraction.mjs 与 extraction-comparison.json：保真比较脚本、哈希与结果。
- artifacts/skin-split/node-tests.log、browser-smoke.log、reading-results.json：完整测试和浏览器证据。
- artifacts/skin-split/source-encoding.json、document-links.json、validation-summary.json：编码、链接与验收汇总。

后续顺序保持：样式生成 → 媒体生命周期 → 插件入口/导航 → DOM 接管/SPA。本轮没有继续提取后续模块，也未提交或推送。
