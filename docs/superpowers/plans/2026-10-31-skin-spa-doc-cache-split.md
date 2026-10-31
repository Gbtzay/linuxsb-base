# Skin SPA Document and Cache Implementation Plan

> **For agentic workers:** Use the implementation steps below in this session. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 完成第十一阶段 SPA 文档与缓存拆分，并修正可复现的后台请求失效问题。

**Architecture:** 文档控制器负责路由验证、解析与提交；缓存控制器负责视图片段和后台请求生命周期。模板保留存档、事件绑定及导航事务，下一阶段再处理事务编排。

**Tech Stack:** JavaScript ES modules、Node.js 24、既有 JSDOM 集成和 Chromium 冒烟。

**Spec:** [SPA 文档与缓存设计](../specs/2026-10-31-skin-spa-doc-cache-split-design.md)

## Global Constraints

- 当前分支 `codex/integrate-origin-main`，保留既有未提交改动，不提交、推送或迁移工作区。
- skin 2.0.46，Oxygen/LTS 2.0.51，Hydrogen 2.4.2；16 个源码模块，正式 21、开发 26 个套件模块。
- 无新增依赖、加载器、配置字段、路由或存储版本；UTF-8 无 BOM、LF。
- 单 worker、512 MiB Node 堆上限；浏览器顺序运行，Node 堆上限 384 MiB。按影响验证，不跑全量或无关 AI。

---

### Task 1: 路由文档边界与构建契约

**Files:** 新增 `plugins/skin/spa-document.js`；修改 `plugins/skin/skin.template.js`、`scripts/build-skin.mjs`、`test/skin-source.test.js`。

**Interfaces:** 使用设计中的 `createSkinSpaDocumentController`；模板解构为原函数名，`getConfig: () => configController.config` 始终取最新配置。

- [x] 保存 355 个文件哈希和模板快照；单 worker 运行已有 canonical/head/缓存消费/模式切换/BFCache 基线。
- [x] 先增加两模块 fixture 和运行结果，旧生成器应缺少执行结果：

```js
assert.equal(context.result.spaDocument, 'document-ready')
assert.equal(context.result.viewCache, 'cache-ready')
```

- [x] 按连续函数块提取路由判定、属性/head、缓存解析/恢复与正文提交，使用 window.DOMParser/window.Element；除依赖替换外保留原顺序。
- [x] 显式接入 `@LSB_SKIN_SPA_DOCUMENT` 和 `@LSB_SKIN_VIEW_CACHE`；保留模板 `stashView`、导航事务和历史/焦点编排。

### Task 2: 缓存与后台请求生命周期

**Files:** 新增 `plugins/skin/view-cache.js`、`test/skin-spa.test.js`；修改模板、`scripts/run-tests.mjs` 与 `test/test-runner.test.js`。

**Interfaces:** `remember/take/seed/schedule/onVisible/stop/clear`；注入 `request` 和实时 `getContext`。stop 可重启，旧响应不影响新代次。

- [x] 先写 3 项无 DOM 行为测试。关键预取失效断言：

```js
const pending = cache.seed()
cache.stop()
cache.clear()
resolveOldResponse({ ok: true, text: 'old-home' })
await pending
assert.equal(cache.take('/'), null)
```

- [x] 从原模板提取缓存实现，运行这 3 项用例，记录旧实现是否复现预取晚到和刷新重启问题；不将已经通过的保护行为标作红灯。
- [x] 仅针对实际失败补请求代次/身份与 AbortController；请求完成清理须确认仍持有当前请求，停用后失效，重启可发新请求。保持 5 项缓存和 30 秒刷新规则。
- [x] 模板 `unbindSpa` 调用 `stop()`，`teardownShell` 调用 `clear()`，可见性事件仍绑定同一个 `onVisible` 回调；新测试接入 skin 专项。

### Task 3: 版本、回归与阶段记录

**Files:** 版本源、生成产物、`README.md`、`docs/CONVENTIONS.md`、`docs/README.md`、`plugins/skin/README.md` 与本计划。

- [x] 同步版本并生成 skin；运行缓存/生成器/选择契约专项，再运行已有受影响集成。命令使用 `--test-force-exit --test-concurrency=1 --max-old-space-size=512`。
- [x] 顺序构建开发与正式/LTS，执行分发校验、skin 新鲜度和零跳过预算检查。
- [x] 顺序运行 legacy、iOS 27 与 reading 浏览器冒烟，Node 堆上限 384 MiB，记录实际结果。
- [x] 使用 requesting-code-review 的独立只读审查，禁止审查者额外测试；核对前十四模块、Hydrogen 与模板余部，修正确实相关的问题。
- [x] 更新源码入口、版本、下一阶段事务边界及真实验收结果；检查本地链接、编码和 `git diff --check`，保留未提交工作区。

## 执行与验收记录

第十一阶段已完成，证据目录为 `artifacts/skin-spa-doc-cache-split/`。继续在 `codex/integrate-origin-main` 保留全部既有未提交改动；本轮未提交、推送或移动分支。

### 实现范围与修正

- 本阶段将 SPA 工作细分为文档与缓存边界。新增 `spa-document.js`（215 行）和 `view-cache.js`（145 行），显式模块从 14 个增至 16 个，模板从 5239 行缩至 4934 行。导航请求、进度、离页确认、历史恢复及焦点通知仍由模板编排，下一阶段再提取。
- 文档控制器接管同源白名单、帖子 canonical/正文验证、缓存解析/恢复、脚本剥离及已有 head/正文提交，保持原有副作用顺序。真实节点存档的 `stashView` 仍在模板。
- 3 项无 DOM 缓存测试在机械提取旧实现上为 **2 失败、1 通过**（`red-cache.log`）：停用前的首页预取晚到后会复活已清空缓存；旧刷新仍占据 inflight 槽，阻挡重启的新请求。修正采用请求身份/代次及 AbortController，先释放槽再取消，旧响应和 finally 不影响新请求。初次绑定的 `seed → schedule` 顺序不误取消预取，五项缓存和 30 秒刷新规则保持。
- 第一次集成因新接线提前读取资料卡和持久卡片的三个 const 别名而在 setup 触发 TDZ，**1 通过、17 失败**（`integration.log`）。改为延迟闭包后，同一组 **18/18 通过**（`integration-final.log`）。现有集成测试正文和夹具均未修改。
- 独立审查确认上述初始化修正，剩余一条过时的源码边界注释已更新。注释调整后仅重建受影响产物并校验，不重复行为测试。

### 低负载验证

- 修改前 7 项既有基线通过（`baseline.log`）；旧生成器和专项选择器未接入两模块时，契约 **2 项按预期失败**（`red-contract.log`）。
- 最终缓存/生成器/选择专项 **43/43 通过**（`targeted.log`），受影响集成 **18/18 通过**（`integration-final.log`），共 **61 项不同专项**。使用单 worker、512 MiB V8 堆上限，无最终失败、取消或跳过；仅新增 3 项缓存行为测试，生成器复用参数化契约自然增加 4 项检查。
- canonical 拒绝用例在基线和最终日志都输出 JSDOM 不实现整页导航的提示；断言通过，真实浏览器回退由冒烟覆盖。未为消除该提示修改已有测试，未运行全量 Node、无关 AI 或压力测试。
- 顺序完成 `npm run build:dev` 与 `npm run build`。源码注释修正后重建 dev/release Oxygen 和 LTS，日志为 `build-dev-suite-final.log`、`build-release-suite-final.log`、`build-lts-final.log`。正式/开发分发、skin 新鲜度和零跳过预算通过（`verify-release.log`、`verify-dev.log`、`verify-skin.log`、`verify-skips.log`）。skin **2.0.46**、Oxygen/LTS **2.0.51**，Hydrogen **2.4.2**；正式 21、开发 26 模块。
- 浏览器逐套执行，Node 堆上限 384 MiB：legacy 首页滚动与无限加载通过；iOS 27 **21 组通过**，覆盖三种宽度、软跳/head/历史、持久卡片、快速导航、原生回退及媒体背景；reading **9 场景通过**，覆盖双模式桌面/触屏阅读与同上下文真实多标签接管。分别记录于 `browser-legacy.log`、`browser-ios27.log`、`browser-reading.log` 和 `reading/results.json`。固定 HTML 与 Chromium 不代表真实手机、线上认证或油猴安装验收。

### 审查与范围核对

独立只读审查没有剩余 Critical/Important 阻断项；审查者未修改文件或运行额外测试，结果为 `review.json`。`audit.mjs` 对照 355 个基线哈希确认本轮 20 个变更文件符合范围，前十四源码模块、57 个 Hydrogen 源文件、两份 Hydrogen 产物及原有 skin/画布集成测试不变。

文档控制器的 16 个函数在依赖归一化后与模板原逻辑逐字一致；除提取、依赖接线、缓存 stop/clear 调用、版本和边界注释外，模板余部逐字一致。变更文件为 UTF-8 无 BOM、LF，79 个本地文档链接有效，`git diff --check` 通过。详细核对为 `audit.json`，汇总为 `validation-summary.json`。

下一阶段处理 SPA 导航请求事务、取消、进度及收尾编排，本轮未开始该阶段。
