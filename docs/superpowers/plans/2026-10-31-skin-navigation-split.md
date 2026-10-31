# skin 导航信息拆分 Implementation Plan

> **For agentic workers:** 沿用 writing-plans / TDD 流程，在当前工作区按顺序完成紧密耦合的提取与生成链路，执行独立代码审查和完整验证。

**Goal:** 提取导航信息模块，保持双界面路由文案、版块数据和导航行为一致。

**Architecture:** 显式 ES 模块接收实时 getter、站点解析与路由函数、存储和 document；模板保留渲染与生命周期。生成器注入单一实现，源码模块与可安装产物分别验证。

**Tech Stack:** Node 24、原生 ES 模块、node:test、jsdom、Chromium。

**Spec:** `docs/superpowers/specs/2026-10-31-skin-navigation-split-design.md`

## Global Constraints

- skin 2.0.40、Oxygen/LTS 2.0.45、Hydrogen 2.4.2；正式 21 / 开发 26 个模块。
- 无新依赖，UTF-8 无 BOM、LF；继续现有工作区，保留既有改动，不提交或推送。
- 保持 href、标签、排序、上限、存储键和原生搜索行为；不修改 DOM 接管、滚动和 SPA 提交。

### Task 1: 导航模块与行为回归

**Files:** 新增 `plugins/skin/navigation.js`、`test/skin-navigation.test.js`；修改 `plugins/skin/skin.template.js`、`test/skin.test.js`。

**Interfaces:** `createSkinNavigation({ document, getPage, getForums, getLocation, parseTopic, store, homeSorted })` 返回 `collectBoards()`、`pagePath()`、`locationText()`、`isActiveHref(href)`、`canvasPageType()`、`navigationEntries()`。

- [x] 保存旧模板、独立插件、待修改文件及 Git 状态到 `artifacts/skin-navigation-split/`。
- [x] 在提取前写并执行行为基线：动态计数/路由、解析回退、导航去重及双界面软跳文案；模块入口缺失时给出明确失败。

```js
assert.deepEqual(nav.collectBoards(), [{ href: '/forum/4', label: '技术交流', count: 0 }])
state.page = { type: 'forum', id: 4 }
state.location = new URL('https://linux.sb/forum/4?p=2#latest')
assert.equal(nav.locationText(), '技术交流')
assert.equal(nav.isActiveHref('/forum/4'), true)
assert.ok(nav.navigationEntries().some((item) => item.href === '/forum/4?p=2#latest'))
```

- [x] 提取既有函数，模板初始化实时依赖；导航渲染消费模块列表，继续使用 textContent/转义及原点击处理。
- [x] 执行 `node --test --test-force-exit test/skin-navigation.test.js`，确认模块行为通过；记录提取比较。

### Task 2: 生成契约、版本与完整验收

**Files:** 修改 `scripts/build-skin.mjs`、`test/skin-source.test.js`、`scripts/run-tests.mjs`、`test/test-runner.test.js`、`suite/version.js`、`suite/suite-center.js`、当前 README/开发规范/文档索引/skin 说明，以及生成产物。

**Interfaces:** 模板使用唯一 `// @LSB_SKIN_NAVIGATION`；`test:skin` 收录 `skin-navigation.test.js`。

- [x] 先扩展生成器夹具验证导航源进入独立/dev/release 产物、源变更使只读校验失败，以及坏输入/复制/冒充标记被拒绝；运行定向测试确认旧生成器失败。

```js
writeFileSync(navigationPath, source.replace('navigation-ready', 'navigation-updated'))
assert.throws(() => syncSkinSource({ root, check: true }), /build:skin/)
assert.equal(readFileSync(output, 'utf8'), before)
```

- [x] 扩展显式输入列表与标记校验，加入专项测试集合；升级 skin 和套件版本并更新当前文档。
- [x] 独立审查本轮差异、规范符合性和测试有效性，修复本轮具体问题后复核。
- [x] 顺序执行 `build:dev` → `build` → `verify:profiles` → `verify:skin` → `verify:test-skips` → `test:all` → `smoke:browser`。
- [x] 保存实际结果、编码/本地链接检查、剩余模板比较和本轮差异检查，勾选计划并记录下一阶段边界。

## 执行记录

- 开始时沿用 `codex/integrate-origin-main` 工作区，前四步未提交内容是本轮输入，不以 HEAD 替代当前源码。
- 本轮为导航提取；既有 `test/title-forge-planner.test.js` CRLF 告警与窄屏原生脚本滚动偏移单独保留，不扩大成其它功能修改。

### 本轮已执行（2026-10-31）

- 新增 141 行导航模块，通过实时 getter 提供六个导航数据接口；模板减少 120 行。除显式提取、依赖注入、列表消费、版本和注释以外，模板与原工作区快照逐字一致。
- 提取前新增测试在旧代码上确认 14 项预期失败（缺少模块、生成器未接入、测试集合未更新）；双界面软跳/后退基线 2 项通过。首次基线中的排序地址预期写错，核对站点适配层后修正为 `/index.php?sort=post`，产品代码未因此变化。
- 提取后模块、生成器、构建契约和测试调度专项 32 项通过；导航及版块集成专项 12 项通过。
- 独立审查以本轮前的工作区快照为基线，无需修复的问题；导航语义与渲染/路由生命周期保持一致。
- 开发/正式构建、分发/skin 新鲜度及零跳过预算校验通过；完整 Node 回归为 1108 通过、0 失败、0 取消、0 跳过，耗时约 355 秒。
- 本轮 17 个文件无 BOM/CRLF、无尾随空白，56 个本地文档链接有效；相对本轮前快照的差异检查通过。既有称号测试 CRLF 未调整。
- 完整 `smoke:browser` 通过：旧三段式、单画布宽/中/窄视口、历史/焦点/软跳、媒体/广告/错误回退，以及阅读中心桌面/触屏和多标签接管等 9 个阅读场景。沿用既有固定样本与远程脚本隔离边界，未将此结果视为线上原生脚本滚动冲突已修复。

第五步已完成。skin 2.0.40、Oxygen/LTS 2.0.45，Hydrogen 2.4.2；正式 21 / 开发 26 个模块。无新依赖，未提交或推送。下一步处理 DOM 接管与 SPA 生命周期，包含已记录的窄屏原生脚本滚动协作问题。

本轮证据位于忽略目录 `artifacts/skin-navigation-split/`：`before/`、`red-tests.log`、`baseline-integration.log`、`targeted-tests.log`、`navigation-integration.log`、`extraction-comparison.json`、`review-package.md`、`review.json`、`build-checks.json`、`node-tests.log`、`browser-smoke.log`、`reading/results.json`、`source-checks.json` 和 `validation-summary.json`。
