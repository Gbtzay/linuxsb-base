# Skin Lifecycle Split Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [x]`) syntax for tracking.

**Goal:** 提取正文和历史资源所有权，修复已复现的窄屏历史恢复漂移。

**Architecture:** 两个显式依赖控制器管理节点/滚动桥及历史状态/临时锚定样式。模板继续编排页面请求、缓存和提交，独立插件由八个模块生成。

**Tech Stack:** 原生 JavaScript ESM、Node 24、JSDOM、Playwright；无新增依赖。

**Spec:** [设计](../specs/2026-10-31-skin-lifecycle-split-design.md)

## Global Constraints

- UTF-8 无 BOM、LF；不新增依赖，不改 Hydrogen 运行时。
- skin 2.0.41；Oxygen/LTS 2.0.46；Hydrogen 2.4.2；release21模块、dev26模块。
- 保留现有工作区改动；不提交、不推送。任务紧密依赖，当前会话顺序实现，结束时委托独立只读审查。
- 生成文件由构建器写入，历史文档不改版本。

## Task 1：正文节点所有权

Files: 新建 `plugins/skin/content-controller.js`、`test/skin-lifecycle.test.js`；修改 `skin.template.js` 和生成器/生成契约测试。

接口：`createSkinContentController({ window, document, isChallengeDocument, findLeftRails, createScrollBridge })` → `findOutlet, mount, restoreSidebars, syncScrollBridge, release, scroller, bridge`。

- [x] 保存 `artifacts/skin-lifecycle-split/before/` 工作区快照，复现原生脚本漂移和最小锚定对照。
- [x] 编写并运行红测试，验证原节点和输入事件、兄弟顺序、重复挂载、出口替换不复活旧节点、父节点失效与滚动桥释放。例如：

```js
controller.mount(outlet, host)
controller.mount(outlet, host)
controller.release()
assert.equal(document.querySelector('main'), outlet)
assert.deepEqual([...outlet.children], originalChildren)
assert.equal(window.scrollTo, originalScrollTo)
```

- [x] 实现控制器并替换模板中私有状态，生成器增加 `@LSB_SKIN_CONTENT` 注入点；运行 `node --test test/skin-lifecycle.test.js test/skin-source.test.js`。

## Task 2：历史状态与恢复窗口

Files: 新建 `plugins/skin/history-controller.js`；扩展 `test/skin-lifecycle.test.js`、`test/skin.test.js`、`scripts/ios27-canvas-smoke.mjs`；接入模板、生成器、测试运行器。

接口：`createSkinHistoryController({ window, document, getScrollRoot, readScroll, scrollTo })` → `bind, rememberScroll, apply, acceptPop, restoreScroll, cancelRestore, cancel, dispose`。使用任务1的动态正文滚动根；用户提示留在模板。

- [x] 红测试覆盖历史字段保留、push/replace/none、无效坐标、拒绝后退的回滚、scrollRestoration归还，以及样式/计时器的幂等清理。例如：

```js
historyController.bind()
historyController.rememberScroll()
historyController.apply(new URL('https://linux.sb/topic/1'), 'push')
assert.equal(window.history.state.lsbShellSpaIndex, 1)
historyController.dispose()
assert.equal(window.history.scrollRestoration, 'auto')
```

- [x] 固定浏览器回归在首页 `popstate` 的下一帧重建原生标签换行类，使工具栏高度增加6px，检查500ms后的坐标等于保存值（1px内）。先在2.0.40运行并记录失败。
- [x] 实现历史控制器；绑定时接管manual，卸载时仅归还自己仍持有的值；恢复写入前暂时禁用锚定，250ms清理，用户输入/离页/新导航提前结束。模板保留路由确认与提交，改用控制器方法：

```js
historyController.cancelRestore()
if (settings.historyMode !== 'none') historyController.rememberScroll()
// 已提交并填充正文之后
historyController.restoreScroll(settings.historyMode)
```

- [x] `@LSB_SKIN_HISTORY` 加入生成器和构建测试；`skin-lifecycle.test.js` 加入skin专项及运行器契约。生成并运行专项，检查两种界面和草稿拒绝的原行为。
- [x] 原生脚本探针验证修复后的实际坐标；保留前后JSON与日志。

## Task 3：验收与开发记录

Files: 版本真源、生成的skin和dist、当前README/开发规范/已知问题/文档索引、本计划与验收证据。

- [x] 模板头/manifest升到2.0.41；suite版本及suite-center升到2.0.46；当前文档说明八个模块与剩余边界。
- [x] 独立审查以 `before/` 为差异基线，针对节点丢失、历史回退和保护期清理；修复重要问题。
- [x] 顺序运行 `npm run build:dev` → `npm run build` → `npm run verify:profiles` → `npm run verify:skin` → `npm run verify:test-skips` → `npm run test:all` → `npm run smoke:browser`，日志存入本阶段artifacts。
- [x] 核对本轮文件的BOM/LF/空白和本地文档链接，填写结果摘要与计划勾选项，向用户报告实际完成范围与下一边界。

## 收尾核对（2026-10-31）

上一会话在最终报告前中断。现按已保存证据补齐记录，不把旧日志计作本次重跑：

- `artifacts/skin-lifecycle-split/build-checks.log`：开发与正式构建、分发、skin 新鲜度和零跳过检查成功。
- `node-tests.log`：1129 通过，0 失败、0 取消、0 跳过。
- `browser-smoke.log` 与 `reading/results.json`：完整浏览器冒烟成功，阅读专项 9 场景完成；离线快照和触屏模拟边界保持不变。
- `source-checks.json`：23 个文件编码/空白和 70 个本地链接通过；`review.json` 未报告待修问题。
- 本次进度复核另运行 76 项存储、DOM、请求代理、阅读中心、正文/历史及合成规划定向测试，全部通过；分发、skin 新鲜度及零跳过校验也通过。

第六阶段实现和验收已完成，下一步提取资料卡与站点卡片资源所有权，之后再处理配置适配和 SPA 请求事务。工作区未提交、未推送。
