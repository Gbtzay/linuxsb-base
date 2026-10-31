# Skin SPA Transaction Implementation Plan

> **For agentic workers:** Use the implementation steps below in this session. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 完成第十二阶段 SPA 导航请求、取消、进度和事件收尾的控制器拆分。

**Architecture:** SPA 控制器持有全部事务状态，并调用既有文档、缓存、历史控制器；模板通过实时 getter 和回调接线，不复制状态。

**Tech Stack:** JavaScript ES modules、Node.js 24、现有 JSDOM 与 Chromium 冒烟。

**Spec:** [SPA 导航事务设计](../specs/2026-10-31-skin-spa-transaction-split-design.md)

## Global Constraints

- 在 `codex/integrate-origin-main` 保留既有未提交改动，不移动、提交或推送。
- skin 2.0.47，Oxygen/LTS 2.0.52，Hydrogen 2.4.2；17 个 skin 模块，正式 21、开发 26 个套件模块。
- 无新增依赖或运行时加载器，UTF-8 无 BOM、LF；前十六模块与 Hydrogen 保持不变。
- 复用现有行为测试，单 worker、512 MiB Node 堆上限；浏览器顺序执行、384 MiB Node 堆上限，不跑全量或无关 AI。

---

### Task 1: 构建契约与事务状态

**Files:** 新增 `plugins/skin/spa-controller.js`；修改 `plugins/skin/skin.template.js`、`scripts/build-skin.mjs`、`test/skin-source.test.js`。

**Interfaces:** 使用设计中的 `createSkinSpaController` 和方法；构建注入点 `@LSB_SKIN_SPA`。

- [x] 保存 360 个基线哈希及模板快照，运行 8 项连续导航/取消/缓存/绘制时序基线。
- [x] 扩展已有生成器 fixture，在旧生成器上确认缺少实际模块执行结果：

```js
assert.equal(context.result.spa, 'spa-ready')
```

- [x] 连续提取导航、事件处理、进度和收尾函数及其状态，按 window 提供 DOM 构造器；通过已有控制器与 hooks 注入全部依赖。
- [x] 使用单一状态源替换模板接线：

```js
getContext: () => ({ enabled: spaController.bound && configController.config.shell,
  viewKey: spaController.viewKey, href: location.href })
if (!spaController.isCurrent(serial)) return false
spaController.markFilled(serial)
```

- [x] `clear()`、`unbind()`、`resetView()` 接入原拆壳/停用位置；保持事件监听的函数身份、进度常数、请求参数及提交/通知顺序。

### Task 2: 版本与定向验证

**Files:** 版本源、独立/dev/release/LTS 产物与本阶段证据。

- [x] 同步版本并生成 skin，运行生成器专项；不重复创建已有行为测试或更改专项选择器。
- [x] 运行受影响的连续导航、取消/停用、历史、缓存、绘制时序、回退及探针集成用例，保存实际结果；失败先定位，按影响复验。
- [x] 顺序构建开发与正式/LTS，检查分发、skin 新鲜度及零跳过预算。
- [x] 顺序运行 legacy、iOS 27、reading 冒烟；不并行启动浏览器，不扩大到全量测试。

### Task 3: 审查与阶段记录

**Files:** `README.md`、`docs/CONVENTIONS.md`、`docs/README.md`、`plugins/skin/README.md`、设计和本计划。

- [x] 根据 requesting-code-review 技能进行一次独立只读审查，不额外运行测试；重点核对初始化、重入、旧请求收尾和缓存/历史配合。
- [x] 对照模板快照和哈希确认前十六模块、Hydrogen、既有行为测试未变；核对提取函数与模板余部。
- [x] 更新源码入口、版本、下一阶段边界和真实验收记录，检查链接、编码及 `git diff --check`，保留未提交状态。

## 执行与验收记录

第十二阶段已完成，证据目录为 `artifacts/skin-spa-transaction-split/`。继续在 `codex/integrate-origin-main` 保留全部既有未提交改动；本轮未提交、推送或移动分支。

### 实现范围与审查修正

- 新增 `spa-controller.js`（470 行），集中八项事务状态及 24 个函数，管理请求、点击/GET 表单/历史/BFCache 事件、离页确认、取消、进度、焦点播报、通知重入保护和绘制后收尾。显式模块从 16 个增至 17 个，模板从 4934 行缩至 4494 行。
- 模板通过实时 getter、`isCurrent`、`markFilled` 和 hooks 接线，保留节点存档、楼层定位、原生正文增强、首页无限滚动、共享窗口与 UI。缓存的 `getContext` 延迟读取控制器状态，两处刷新计时器清理使用 `cancelRefresh` hook。提取后没有生产逻辑修正，`markFilled` 保留原直接赋值语义。
- 独立审查发现并修正一项测试精度问题：`@LSB_SKIN_SPA` 的前缀替换误伤更早的 `@LSB_SKIN_SPA_DOCUMENT`。参数化 fixture 改为完整标记行替换，并精确断言当前模块错误；生产生成器已按整行匹配，无此缺陷。审查者确认修正，受影响的 14 项契约复验全部通过（`fixture-final.log`）。

### 低负载验证

- 修改前 8 项既有基线通过（`baseline.log`）。旧生成器未接入事务模块时，构建契约 **1 项按预期失败**：实际为 `missing-spa`、期望为 `spa-ready`（`red-contract.log`）。
- 最终生成器专项 **37/37 通过**（`targeted.log`），连续导航、迟到响应、取消/停用、历史/缓存、失败清理及绘制后通知等集成 **22/22 通过**（`integration.log`），原生写表单和带原生标记的 GET 表单边界 **2/2 通过**（`forms.log`），共 **61 项不同专项**。修正 fixture 后的 14 项为同组复验，不重复计数。
- 没有新增行为测试文件或修改已有行为测试正文、夹具与专项选择器；只扩展既有生成器参数化 fixture，自然增加 2 项检查。Node 测试单 worker、512 MiB V8 堆上限，无最终失败、取消或跳过；未运行全量 Node、无关 AI 或额外压力测试。
- 顺序完成 `npm run build:dev`、`npm run build`；正式/开发分发、skin 新鲜度和零跳过预算检查通过（`verify-release.log`、`verify-dev.log`、`verify-skin.log`、`verify-skips.log`）。skin **2.0.47**、Oxygen/LTS **2.0.52**，Hydrogen **2.4.2**；正式 21、开发 26 个套件模块。
- 浏览器逐套执行，Node 堆上限 384 MiB：legacy 首页滚动与无限加载通过；iOS 27 **21 组通过**，覆盖多宽度、软跳/head/历史、持久卡片、快速导航、原生回退及媒体背景；reading **9 场景通过**，覆盖双模式桌面/触屏阅读及同上下文真实多标签接管。日志为 `browser-legacy.log`、`browser-ios27.log`、`browser-reading.log`，阅读结果为 `reading/results.json`。固定 HTML 与 Chromium 的结果不代表真实手机、线上认证或油猴安装验收。

### 审查与范围核对

独立只读审查最终 Critical、Important、Minor 均为 0；审查者未修改文件或运行额外测试，结论为 `review.json`。`audit.mjs` 对照 360 个基线哈希确认本轮仅 16 个预定文件变更，前十六模块、57 个 Hydrogen 源文件、两份 Hydrogen 产物以及原有 skin/画布/SPA 行为测试和专项选择器不变。

24 个提取函数经明确的依赖和 DOM realm 替换后与原模板逐字一致；八项状态统一移入控制器。除提取、初始化接线、getter/hook 调用、版本与源码边界注释外，模板余部逐字一致。变更文件均为 UTF-8 无 BOM、LF，82 个本地文档链接有效，`git diff --check` 通过。详细证据为 `audit.json`，汇总为 `validation-summary.json`。

下一阶段为首页无限滚动及其路由感知清理，本轮未开始该阶段。
