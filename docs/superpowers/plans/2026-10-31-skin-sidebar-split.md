# Skin Sidebar Split Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [x]`) syntax for tracking.

**Goal:** 提取资料卡与单画布站点卡片控制器，明确节点归属和可逆清理。

**Architecture:** 两个原生 ES 模块接收实时 getter 和 DOM 依赖，模板保留界面编排与路由事务。生成器显式组合十个模块，不引入运行时加载器。

**Tech Stack:** 原生 JavaScript ESM、Node 24、JSDOM、Playwright。

**Spec:** [设计](../specs/2026-10-31-skin-sidebar-split-design.md)

## Global Constraints

- 不增加依赖，不改请求或写入权限，保持正式 21 / 开发 26 模块。skin 升至 2.0.42，Oxygen/LTS 升至 2.0.47，Hydrogen 保持 2.4.2。
- 所有源码 UTF-8 无 BOM、LF；当前开发分支继续承接已有工作区改动，不提交、不推送。
- 相依模块在当前会话顺序实现，末尾独立只读审查；按现有节点行为划分边界，不扩展到配置或 SPA 请求事务。

## Task 1：资料卡所有权

Files: 新建 `plugins/skin/profile-controller.js`、`test/skin-sidebar.test.js`；修改 `skin.template.js`、`test/skin.test.js`、生成器与生成契约测试。

Interfaces: `createSkinProfileController({ window, document, getPage, getMe, getSidebars, getSelfHost, getViewport })` 返回设计中的六个方法。

- [x] 保存 `artifacts/skin-sidebar-split/before/` 快照，补齐第六阶段执行记录。
- [x] 在旧插件运行双模式归还错误节点、个人卡属性残留和用户身份前缀的失败回归；新模块测试缺失时明确失败。
- [x] 验证节点身份、输入事件、重复挂载、跨宿主移动、恢复原属性、原父节点失效、旧按钮失效和用户页列表保持。例如：

```js
controller.mount(outlet)
controller.restore()
assert.equal(card.parentNode, nativeSide)
assert.equal(card.id, 'native-profile')
card.querySelector('button').click()
assert.equal(nativeClicks, 1)
```

- [x] 提取资料卡代码，保存节点引用与属性快照，精确匹配同源用户路径，清理展开监听。模板通过当前 getter 调用，不继续保存第二份状态。

## Task 2：单画布站点卡片

Files: 新建 `plugins/skin/site-cards-controller.js`；扩展 `test/skin-sidebar.test.js`，修改模板与生成器。

Interfaces: `createSkinSiteCardsController({ document, getSidebars })` 返回 `sync`、`restore`、`stageOrigins`、`rebindOrigins`。

- [x] 先写实际节点、表单事件、连续卡片顺序、宿主切换、响应占位重绑定、未初始化广告拒绝与重新初始化节点接管测试。

```js
controller.sync(host)
controller.restore({ releasePersistent: true })
assert.deepEqual([...nativeSide.children], originalCards)
assert.equal(nativeSide.querySelector('form'), originalForm)
```

- [x] 提取持久节点算法，普通卡片保存占位，模板保留宽度/浮层状态。对照旧模板确认其余运行时保持不变。
- [x] 两模块纳入构建夹具与 `test:skin`；验证 dev/release/独立产物执行模块输入、源漂移只读失败，以及坏编码/语法/注入标记失败。

## Task 3：集成与完整验收

Files: `suite/version.js`、`suite/suite-center.js`、当前 README/开发规范/索引/skin 源码说明、生成 skin 与 dist、本计划。

- [x] 同步两处 skin 版本、套件版本和当前文档，不修改旧阶段版本记录。
- [x] 相对 before 快照独立审查节点丢失、错误身份、还原顺序与迟到事件；修复重要问题。
- [x] 顺序执行 build:dev → build → verify:profiles → verify:skin → verify:test-skips → test:all → smoke:browser，日志写入本阶段 artifacts。
- [x] 检查本轮源码编码/空白及本地链接，记录真实测试数量、模板缩减和剩余边界，完成本计划勾选。

## 执行记录（2026-10-31）

- 新增资料卡与单画布站点卡片两个模块，显式组合模块总数由 8 增至 10。模板由 6400 行减少到 5922 行；`source-comparison.json` 确认除提取、接线与版本外，其余运行时逐字一致，Hydrogen 产物保持一致。
- 原独立插件上复现 5 项集成失败：两种模式的全局 class 误认、两种模式的用户 ID 前缀误认，以及单画布停用属性残留。修正测试中旧三段式宿主选择器过宽后，再次在原插件上确认 5 项失败，证据为 `red-integration-final.log`。
- 先写模块与构建契约测试，确认旧生成器不消费新输入、缺失模块及专项集合遗漏；提取原实现后 12 项模块用例中 8 项失败，4 项原有持久卡行为通过。
- 独立审查确认 3 项 P2 问题：旧资料节点被复活、普通站点卡片未随宿主迁移，以及反复装饰丢失外部属性更新。逐项添加失败回归并修复，另验证移除卡片占位清理与被替换宿主中的实际节点保留。复核无剩余重要问题，17 项控制器测试通过，记录在 `review.json`。
- 最终模块、生成器和测试集合专项为 45 通过；新资料卡集成专项 5 通过。已中止首次完整 Node 运行，完整验收仅采用审查修复后的 `node-tests-final.log`，不混用中止日志。
- 实现阶段 build:dev、build、verify:profiles、verify:skin、verify:test-skips 已顺序通过，版本为 skin 2.0.42、Oxygen/LTS 2.0.47、Hydrogen 2.4.2。完整 Node 与浏览器最终结果在下方收尾记录。

证据目录：`artifacts/skin-sidebar-split/`（仓库忽略）。本阶段保留既有改动，不提交、不推送。下一边界为旧三段式右栏缓存/在线状态/页签编排、配置适配和 SPA 请求事务。

### 最终验收

- 审查修复后重新顺序运行开发/正式构建、分发/skin/跳过校验，全部成功，见 `build-final.log`。
- 完整 Node 回归：**1155 通过、0 失败、0 取消、0 跳过**，耗时约 397 秒，见 `node-tests-final.log`。
- 完整 `smoke:browser` 成功：legacy 滚动、ios27 三档视口、历史/焦点/广告/媒体/失败回退，以及 **9** 个阅读场景（含双模式桌面/触屏阅读中心和同上下文多标签接管），见 `browser-smoke.log`、`reading/results.json`。
- 本轮 21 个文件编码与空白检查、66 个本地文档链接通过；涉及的已跟踪文件 `git diff --check` 通过。模板余部比较和 Hydrogen 产物比较均一致，见 `source-checks.json`、`source-comparison.json`。
- 汇总为 `validation-summary.json`。浏览器验收沿用离线快照与 Chromium 触屏模拟，不代表线上账号、真实手机输入法或 Tampermonkey 安装验收。

第七阶段实现、审查、构建与验收全部完成；当前工作区保留全部源文件、生成产物及开发记录。
