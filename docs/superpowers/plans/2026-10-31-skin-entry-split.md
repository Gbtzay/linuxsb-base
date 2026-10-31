# skin 插件入口与搜索拆分 Implementation Plan

> **For agentic workers:** 沿用 writing-plans / TDD 流程，在当前已授权工作区实现，完成独立审查与验证。

**Goal:** 提取统一插件目录和原生搜索控制器，使双界面的入口校验与资源还原一致。

**Architecture:** 两个显式 ES 模块由现有生成器注入；模板负责渲染与事件绑定，目录接收实时基座能力，搜索控制器拥有原节点和还原位置。

**Tech Stack:** Node 24、原生 ES 模块、node:test、jsdom、Chromium。

**Spec:** `docs/superpowers/specs/2026-10-31-skin-entry-split-design.md`

## Global Constraints

- skin 2.0.39、Oxygen/LTS 2.0.44、Hydrogen 2.4.2；正式 21 / 开发 26 个模块。
- UTF-8 无 BOM、LF；无新依赖；保留已有改动，不提交或推送。
- 保留原生搜索表单、DOM 事件与字段；路由、SPA 和阅读流程留在模板。

### Task 1: 目录和搜索模块

**Files:** 新增 `plugins/skin/plugin-catalog.js`、`plugins/skin/search-controller.js`、`test/skin-entry.test.js`；修改 `plugins/skin/skin.template.js`、`test/skin.test.js`。

**Interfaces:** 工厂与方法同设计文档。模板调用 `pluginCatalog.features()/tools()/settings()`，打开前关闭浮层并调用目录；搜索通过 `searchController.adopt()/restore()/setOpen()`。

- [x] 保存旧模板、独立插件到 `artifacts/skin-entry-split/`。
- [x] 先写双界面失败回归：无实际能力的插件隐藏、停用后的旧入口拒绝打开、搜索清理不误认其它同类节点。
- [x] 先写模块行为测试，再实现目录与搜索控制器。

```js
const catalog = createSkinPluginCatalog({ getInfo, ui, request })
assert.deepEqual(catalog.tools(), [{ plugin: 'reading-center', rpc: 'reading-center:open', label: '阅读中心' }])
const search = createSkinSearchController({ document })
search.adopt(host)
search.restore()
assert.equal(form.parentNode, originalParent)
assert.equal(form.nextSibling, originalNext)
```

- [x] 模板替换函数及状态所有权，旧三段式点击按插件身份重新验证；通过定向模块和集成测试。

### Task 2: 生成契约与完整验证

**Files:** `scripts/build-skin.mjs`、`test/skin-source.test.js`、`scripts/run-tests.mjs`、`test/test-runner.test.js`、版本文件、当前文档和产物。

- [x] 先写两个模块注入、源漂移及坏输入测试，再扩展生成器与专项测试入口。
- [x] 更新版本、源码说明、规范与索引；保留历史阶段记录。
- [x] 对比剩余模板，确认除列明的目录/搜索适配、版本、注释外一致；独立审查并修复具体问题。
- [x] 顺序执行 build:dev → build → verify:profiles → verify:skin → verify:test-skips → test:all → smoke:browser。
- [x] 检查编码、链接和本轮 diff，记录实际验证结果。

## 执行记录（2026-10-31）

第四步已实现。插件目录按实时插件状态和面板/RPC 能力统一生成双界面入口，点击时再次校验；已停用但可配置的插件仍能打开设置。原生搜索控制器管理实际节点及原 parent/next，保留字段和事件，支持链接替换为表单、跨宿主迁移、焦点及重复还原。

验证结果：

- 原代码上复现 4 项集成失败：旧三段式显示缺失能力的入口、已停用入口误开其它面板，以及两种模式误认同类搜索节点。6 项新增双界面回归通过。
- 16 项模块测试覆盖动态能力、RPC/面板错误、搜索资源所有权和焦点；模块、生成器、测试调度与构建校验专项合计 36 项通过。
- 独立审查发现跨宿主迁移时，替换表单或更早出现的无关表单可能使控制器丢失原节点/原位置；先补两项失败回归，再优先协调并选用已管理节点，复核通过。
- 模板由 6822 行缩至 6698 行。除目录/搜索适配、旧工具缓存、版本、注释与注入标记外，其余运行时逐字一致，归一后 287101 字节；SPA 提交和生命周期未调整。
- build:dev、build、verify:profiles、verify:skin、verify:test-skips 顺序成功。完整 Node 回归为 1094 项通过，0 失败、0 取消、0 跳过。
- 首次 smoke:browser 在 390px 帖子历史后退时失败：已保存 280px，实际为 292px。分别用拆分前后脚本复现相同结果；逐帧记录显示线上原生脚本重新添加 tab-wrapped/tab-line-*，工具栏从 64px 变为 70px，触发滚动锚定偏移。分别排除远程脚本后，两版立即及 500ms 后均为 280px。
- 固定样本的 ios27 冒烟现对远程 JavaScript 返回空响应，保留显式注入的待测脚本、原滚动断言及容差；CSS/图片仍依赖网络。变更经独立复核。原生脚本兼容问题尚未修复，已记入 [当前限制](../../已知问题.md)，留待 SPA 生命周期阶段；测试环境边界见 [阅读验收](../../reading-acceptance.md)。
- 调整后完整 smoke:browser 成功：旧三段式、单画布宽/中/窄、历史/焦点、广告、媒体、错误回退，以及阅读中心桌面/触屏与多标签接管等 9 个阅读场景全部通过。生产源码未再修改，因此沿用上述完整 Node 验证，不重复构建。
- skin 2.0.39、Oxygen/LTS 2.0.44；Hydrogen 2.4.2，正式 21 / 开发 26 个模块。无新依赖，保留已有工作区改动，未提交或推送。

证据位于忽略目录 artifacts/skin-entry-split/：拆分前模板与独立插件、失败/通过测试日志、template.diff、extraction-comparison.json、review.json、build-checks.json、node-tests.log；首次失败 browser-smoke.log 保留，成功日志为 browser-smoke-isolated.log；滚动对照在 probe-* 与 browser-investigation.json，阅读结果在 reading/results.json，最终编码/链接检查和验证汇总分别为 source-checks.json 与 validation-summary.json。

下一步分离版块目录、页面文案、活动链接判断与导航列表；随后处理 DOM 接管和 SPA 生命周期，包括本次发现的原生脚本滚动协作问题。
