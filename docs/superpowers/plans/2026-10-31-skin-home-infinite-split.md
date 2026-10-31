# Skin Home Infinite Scroll Implementation Plan

> **For agentic workers:** Use the implementation steps below in this session. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 完成第十三阶段：首页无限滚动及其路由感知清理的控制器拆分。

**Architecture:** 控制器拥有当前绑定与按真实列表保存的 WeakMap 记录；文档规则、网络、配置和滚动根通过依赖传入。模板沿用原调用位置，仅保存 `sync` / `unbind` 别名。

**Tech Stack:** JavaScript ES modules、Node.js 24、现有 JSDOM 与 Chromium 冒烟。

**Spec:** [首页无限滚动设计](../specs/2026-10-31-skin-home-infinite-split-design.md)

## Global Constraints

- 在 `codex/integrate-origin-main` 保留全部既有未提交改动，不移动、提交或推送。
- skin 2.0.48，Oxygen/LTS 2.0.53，Hydrogen 2.4.2；18 个 skin 模块，正式 21、开发 26 个套件模块。
- 无新增依赖、配置、持久化字段或事件，UTF-8 无 BOM、LF；前十七模块与 Hydrogen 不变。
- 保留 timeout 15000、retry 0、queue false、80ms 滚动节流及 100px 触发阈值，保持去重、分页提示和事件顺序。
- 复用既有行为用例；Node 单 worker、512 MiB 堆上限，浏览器顺序执行、384 MiB 堆上限，不跑全量或无关 AI。

---

### Task 1: 构建契约与控制器提取

**Files:** 新增 `plugins/skin/home-infinite-controller.js`；修改 `plugins/skin/skin.template.js`、`scripts/build-skin.mjs`、`test/skin-source.test.js`。

**Interfaces:** `createSkinHomeInfiniteController({ window, document, getConfig, request, cacheKey, containsTopicPostContent, getScrollRoot })` 返回 `{ sync, unbind }`；唯一注入点 `@LSB_SKIN_HOME_INFINITE`。

- [x] 保存 363 个基线哈希及模板快照；运行双模式计时器跨路由/迟到响应 4 项基线：

```powershell
node artifacts/skin-home-infinite-split/run.mjs baseline.log --max-old-space-size=512 --test --test-force-exit --test-concurrency=1 --test-name-pattern='首页无限滚动计时器|首页无限滚动响应晚返回' test/skin.test.js
```

- [x] 扩展生成器 fixture，确认旧生成器执行结果为 `missing-home-infinite` 而非期望值：

```js
assert.equal(context.result.homeInfinite, 'home-infinite-ready')
```

- [x] 连续提取 `isHomeInfPath` 至 `syncHomeInfiniteScroll` 的全部函数与 `homeInf` / `homeInfRecords` 状态，使用注入 window 的 DOM 构造器。
- [x] 在文档控制器初始化之后、SPA 事务控制器之前接线；配置和滚动根保持实时读取：

```js
const { sync: syncHomeInfiniteScroll, unbind: unbindHomeInfiniteScroll } = createSkinHomeInfiniteController({
  window, document, getConfig: () => configController.config,
  request: (path, options) => api.net.raw(path, options), cacheKey: viewCacheKey,
  containsTopicPostContent, getScrollRoot: canvasHomeScrollRoot,
})
```

### Task 2: 版本与定向验证

**Files:** `suite/version.js`、`suite/suite-center.js`、独立/dev/release/LTS 产物与本阶段证据。

- [x] 同步版本并生成 skin，执行 `test/skin-source.test.js`；保留上一阶段完整行标记匹配和精确错误断言。
- [x] 执行现有首页加载、原生隐藏分页、取消导航、计时器/迟到响应、缓存返回和停用专项；按实际输出记录数量，不重复增加行为测试。
- [x] 顺序执行 `npm run build:dev`、`npm run build`，检查正式/开发分发、skin 新鲜度与零跳过预算。
- [x] 顺序执行 `scripts/legacy-home-scroll-smoke.mjs`、`scripts/ios27-canvas-smoke.mjs`、`scripts/reading-browser-smoke.mjs`，保存日志和结果，不并行启动浏览器。

### Task 3: 审查与阶段记录

**Files:** `README.md`、`docs/CONVENTIONS.md`、`docs/README.md`、`plugins/skin/README.md`、设计和本计划。

- [x] 依 requesting-code-review 技能安排一次独立只读审查，核对状态身份、取消/迟到响应、列表恢复和初始化依赖；审查者不运行额外测试。
- [x] 对照冻结模板，按明确依赖替换核对函数和模板余部；确认前十七模块、Hydrogen、既有行为测试和专项选择器不变。
- [x] 更新入口、版本、下一阶段边界和真实验收记录；核对 UTF-8/LF、本地链接与 `git diff --check`，保留未提交状态。

## 执行与验收记录

第十三阶段已完成，证据目录为 `artifacts/skin-home-infinite-split/`。继续在 `codex/integrate-origin-main` 保留全部既有未提交改动；本轮未提交、推送或移动分支。

### 实现范围

- 新增 `home-infinite-controller.js`（255 行），集中当前绑定状态、按真实列表保存的 WeakMap 记录及 12 个函数。显式模块从 17 个增至 18 个，模板从 4494 行缩至 4250 行，减少 244 行。
- 控制器管理首页/站点开关判定、分页请求、去重、滚动监听、提示和路由感知清理。`sync()` 按当前路由、节点及滚动根决定重绑；`unbind()` 保存列表记录、解绑监听、清除计时器/提示并取消请求。旧响应仍须核对当前状态、路由和列表/分页节点身份。
- 模板在文档控制器之后、SPA 事务控制器之前接入两个方法别名；渲染、软跳、模式切换和停用的原调用位置不变。配置与滚动根实时读取，构造时只保存依赖与状态。本轮没有功能性修正，保持分页规则、请求选项、节流/触发阈值、提示和事件顺序。

### 低负载验证

- 修改前双模式计时器跨路由与迟到响应 **4/4 基线通过**（`baseline.log`）。旧生成器未接入新模块时，契约 **1 项按预期失败**：实际 `missing-home-infinite`、期望 `home-infinite-ready`（`red-contract.log`）。
- 最终生成器专项 **39/39 通过**（`targeted.log`），现有首页/路由/停用集成 **13/13 通过**（`integration.log`），共 **52 项不同专项**；基线不重复计数。覆盖中间面板滚动、原生隐藏分页、取消导航后的恢复、双模式跨路由计时器/迟到响应、缓存返回、停用及原生帖子分页边界。
- 没有新增行为测试文件或修改既有行为测试、夹具与专项选择器；仅扩展生成器参数化 fixture，自然增加 2 项构建检查，并保留完整行标记匹配。Node 单 worker、512 MiB V8 堆上限，无最终失败、取消或跳过；未运行全量 Node、无关 AI 或压力测试。
- 顺序完成 `npm run build:dev` 与 `npm run build`（`build-dev.log`、`build-release.log`）。正式/开发分发、skin 新鲜度及零跳过预算通过（`verify-release.log`、`verify-dev.log`、`verify-skin.log`、`verify-skips.log`）。skin **2.0.48**、Oxygen/LTS **2.0.53**，Hydrogen **2.4.2**；正式 21、开发 26 个套件模块。
- 浏览器逐套执行，Node 堆上限 384 MiB：legacy 首页滚动与无限加载通过；iOS 27 **21 组通过**；reading **9 场景通过**，覆盖双模式桌面/触屏阅读及同上下文真实多标签接管。日志为 `browser-legacy.log`、`browser-ios27.log`、`browser-reading.log`，阅读结果为 `reading/results.json`。这些固定 HTML 与 Chromium 检查不代表真实手机、线上认证或油猴安装验收。

### 审查与范围核对

独立只读审查未发现本轮引入的阻断项；审查者没有修改文件或运行额外测试，结论为 `review.json`。`audit.mjs` 对照 363 个基线哈希确认本轮仅 16 个预定文件变更，前十七模块、57 个 Hydrogen 源文件、两份 Hydrogen 产物、既有 skin/画布/SPA 行为测试及专项选择器不变。

12 个提取函数经明确的依赖和 DOM realm 替换后与原模板逐字一致；除提取、初始化接线、注入点、版本和源码边界注释外，模板余部逐字一致。变更文件均为 UTF-8 无 BOM、LF，85 个本地文档链接有效，`git diff --check` 通过。详细证据为 `audit.json`，汇总为 `validation-summary.json`。

下一阶段为原生正文增强及其事件清理，本轮未开始该阶段。
