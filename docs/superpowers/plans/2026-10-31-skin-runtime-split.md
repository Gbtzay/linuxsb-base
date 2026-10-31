# 第二十四阶段：入口生命周期与清理逻辑整理 Implementation Plan

> **For agentic workers:** 使用 executing-plans 在当前会话执行，保留现有工作区与低负载验证约束；完成后按 requesting-code-review 做一次独立只读审查。

**Goal:** 集中入口刷新、双模式生命周期及清理，保留行为、资源所有权和注册顺序。

**Architecture:** 迁移十个现有具名函数、六个状态及三个回调体；为原取消刷新操作提供命名接口。工厂在运行模块就绪后创建，设置依赖和先创建的 SPA 回调通过延迟引用接线。

**Tech Stack:** 原生 JavaScript、userscript 生成器、Node test、JSDOM。

**设计：** [阶段设计](../specs/2026-10-31-skin-runtime-split-design.md)。完成后只剩第 25 阶段集中验收与文档收尾。

## Task 1：基线与生成器契约

- [x] 保存 396 个文件哈希及模板、生成器 fixture 快照，确认当前分支和 API/历史清理所有权。
- [x] 复用三项基线：生成器主契约、双模式切换、挂载失败恢复：

```powershell
$env:NODE_OPTIONS='--max-old-space-size=512'
node artifacts/skin-runtime-split/run.mjs baseline.log --max-old-space-size=512 --test --test-force-exit --test-concurrency=1 --test-name-pattern='skin 构建从拆分源读取变更|界面模式双向切换|模式挂载失败时清理壳标记' test/skin-source.test.js test/skin.test.js
```

- [x] 在已有 `test/skin-source.test.js` 参数化 fixture 增加五行：`@LSB_SKIN_RUNTIME`、`createSkinRuntimeController().applyAll()`、`runtime-ready` 模块实现及独立/dev/release 断言。先执行主契约，确认旧生成器返回 `missing-runtime`：

```js
globalThis.result.runtime = typeof createSkinRuntimeController === 'function'
  ? createSkinRuntimeController().applyAll() : 'missing-runtime'
// fixture module
export function createSkinRuntimeController() {
  return { applyAll() { return 'runtime-ready' } }
}
```

## Task 2：运行时控制器与接线

Files: `plugins/skin/runtime-controller.js`、`plugins/skin/skin.template.js`、`scripts/build-skin.mjs`、`suite/version.js`、`suite/suite-center.js`。

- [x] 原样提取 `onUiModeResize` 到 `unbindCloudflareChallengeWatch` 五个函数，`unmountShellLayer` 到 `applyAll` 五个函数及六个生命周期变量。
- [x] 原配置、DOM each 和 dispose 回调分别迁移为 `onConfigChanged`、`onNativeNode`、`dispose`；设置调用替换为 `getSettingsController()`，取消刷新只保留原两步操作：

```js
function cancelRefresh() {
  window.clearTimeout(refreshTimer)
  refreshTimer = 0
}
return { applyAll, scheduleRefresh, cancelRefresh, onConfigChanged, onNativeNode, dispose }
```

- [x] 在原总生命周期函数区间替换为工厂初始化，传入已初始化控制器/方法和原 `shellTokenProps`。工厂内按原别名读取配置与 SPA 方法，DOM 构造器从 window 取得。
- [x] SPA 使用 `cancelRefresh: () => runtimeController.cancelRefresh()`；设置继续使用 `applyAll` 别名；原注册点变为：

```js
api.on('config:changed:skin', runtimeController.onConfigChanged)
// route/plugin/topic 订阅及 DOM 选择器保持原样
api.dom.each(originalSelector, runtimeController.onNativeNode)
api.onDispose(runtimeController.dispose)
// debug 注册后仍执行 applyAll()
```

- [x] 删除无用途的 `canvasStatusObserver` 声明，添加 API 自主管理注销的说明；保留原公共注册与全部清理顺序。
- [x] 登记唯一 `@LSB_SKIN_RUNTIME` 注入点及禁用枚举，skin 提升至 2.0.59、Oxygen/LTS 提升至 2.0.64，Hydrogen 2.4.2 不变；生成独立插件。

## Task 3：定向验证与构建

- [x] 完整生成器现有测试；复用阶段设计所列生命周期用例，包含软跳聚焦/播报完成路径及晚到原生节点，实际数量记录到验收。
- [x] 逐函数、三个回调体与模板余部对比冻结快照；检查所有迁移函数的剩余模板引用均已导出/绑定。验证无新行为测试和全量测试运行。
- [x] 顺序执行开发、正式/LTS 构建，再验证正式/开发分发、skin 新鲜度、零跳过预算。

## Task 4：审查与收尾

- [x] 一次独立只读审查，重点检查初始化、延迟设置依赖、API 回调顺序、监听/计时器/媒体/缓存/历史/原生节点的清理链；审查者不运行测试或构建。
- [x] 更新 README、开发规范、文档索引和 skin 源码入口，明确拆分已结束，仅余第 25 阶段集中验收与文档收尾。
- [x] 396 文件哈希范围、前 28 模块、Hydrogen、原测试/夹具/冒烟脚本保护，核对 UTF-8 无 BOM、LF、本地链接和 `git diff --check`。
- [x] 填写实际结果及限制，保留未提交状态。

## 执行与验收记录

第二十四阶段已完成，工作区仍为 `codex/integrate-origin-main`。本轮未提交、推送、移动分支或创建工作树，保留此前全部未提交改动。证据目录为 `artifacts/skin-runtime-split/`。

### 实现与责任

- 新增 `runtime-controller.js`（265 行），迁移 10 个具名函数、3 个现有回调体及 6 个生命周期状态；把原两行取消刷新操作命名为 `cancelRefresh()`，模块共有 14 个函数。
- 主模板由 1266 行缩至 1110 行，减少 156 行；显式 skin 模块增至 29 个。删除唯一无用途的 `canvasStatusObserver` 声明，没有删除兼容行为或扩大功能范围。
- 运行时在直接依赖初始化后创建，构造不启动监听或执行依赖；SPA 取消刷新和设置控制器引用延迟解析。配置变更、晚到原生节点和停用处理改为命名方法，API 注册点、选择器、注册顺序和 setup 末尾首次 `applyAll()` 保持。
- 模式切换/关壳/停用、50ms 防抖、断点监听、挑战页恢复、挂载失败降级及原节点/媒体/菜单/缓存/样式清理顺序保持。`shellTokenProps` 继续共享原 Set。公共 UI 控制器由 API `own()` 注销，历史恢复由 SPA `unbind()` 调用历史控制器释放，不重复清理。
- skin **2.0.59**、Oxygen/LTS **2.0.64**，Hydrogen **2.4.2**；正式 21、开发 26 个套件模块。原窗口化开关保持关闭。

### 低负载验证

- 3 项现有基线通过（`baseline.log`）；fixture 扩展后旧生成器按预期返回 `missing-runtime`（`red-contract.log`），随后实施源码迁移。
- 生成器 **61/61**（`generator.log`），生命周期定向用例 **12/12**（`lifecycle.log`），共 **73 项检查**。基线不重复计数；最终无失败、取消或跳过。
- 定向覆盖挑战恢复/普通 Turnstile、模式双向切换、断点重挂、挂载失败回退、正文/状态类还原、晚到个人卡、动态搜索替换、菜单开关、软跳聚焦播报以及关壳/停用归还历史滚动模式。
- 沿用一个 worker、512 MiB Node 堆上限、`--test-force-exit`。只扩展已有生成器 fixture 五行，自然增加两项参数化检查；没有新增行为测试、修改行为夹具或测试选择器，也没有全量/浏览器/压力测试或无关 AI 测试。
- 挂载失败用例主动移除正文，基线与迁移后均输出一次 `shell mount failed; restored native page`，随后验证清理与原生页面恢复通过；这是该失败恢复用例的预期警告，未屏蔽输出。
- 开发、正式/LTS 构建通过；正式/开发分发、skin 新鲜度及零跳过预算通过（各 build/verify 日志）。正式 AI 剥离与开发 AI 完整校验通过，不将此视为浏览器全交互验收。

### 审查与范围核对

一次独立只读审查 Critical、Important、Minor 均无发现；核对了冻结模板、十个函数/三个回调体、依赖初始化、延迟引用、API 所有权与 core 顺序注销、SPA 历史恢复及清理顺序。审查者未运行测试、构建或浏览器，也未改文件；结果记录于 `review.json`。

396 文件基线核对确认本轮只改变 16 个预定文件。前 28 个 skin 模块、57 个 Hydrogen 源文件、两份 Hydrogen 产物、76 个原测试/夹具文件和测试入口/三份冒烟脚本均未变。两个函数区间及三个回调体在显式依赖替换后与原文一致；模板余部只包含状态迁移、接口接线、无用途声明删除、所有权说明、注入点与版本调整。所有仍由模板使用的迁移函数均已导出和绑定。

变更文件 UTF-8 无 BOM、LF，118 个本地文档链接有效，`git diff --check` 通过。详细证据为 `audit.json`，汇总为 `validation-summary.json`。

既定源码拆分至此结束，模板保留必要模块装配和视图/路由适配。只剩 **第 25 阶段：集中验收、文档与最终收尾**；本轮未开始第 25 阶段。
