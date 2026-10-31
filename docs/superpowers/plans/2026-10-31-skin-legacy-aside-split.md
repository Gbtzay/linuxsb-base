# Skin Legacy Aside Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [x]`) syntax for tracking.

**Goal:** 完成第九阶段，将旧三栏右侧栏卡片与页签职责移出模板，保留真实节点和既有交互。

**Architecture:** 两个控制器分别持有卡片与视图生命周期；模板使用实时 getter 和选择回调接线。共享布局判定与 SPA 事务继续留在模板，生成器显式注入两模块。

**Tech Stack:** JavaScript ES modules、Node.js 24、JSDOM、现有 Chromium 冒烟。

**Spec:** [第九步设计](../specs/2026-10-31-skin-legacy-aside-split-design.md)

## Global Constraints

- 保留当前工作区既有改动，在 `codex/integrate-origin-main` 上续做，不迁移未提交的前八阶段源码。
- 无新增依赖和运行时模块加载器；UTF-8 无 BOM、LF。
- skin 2.0.44，Oxygen/LTS 2.0.49，Hydrogen 2.4.2；正式 21、开发 26 模块。
- 用户要求灵活、低负载测试：单 worker、512 MiB V8 堆上限，不重复全量或无关 AI 测试，不增加无行为价值的测试。

---

### Task 1: 卡片接管与缓存

**Files:** 新增 `plugins/skin/legacy-aside-cards.js`、`test/skin-legacy-aside.test.js`；修改 `test/skin.test.js`、`plugins/skin/skin.template.js`。

**Interfaces:** 消费设计中的 DOM/store/getter；产出 `adopt/restore/restorePersistent/pruneDetached/watch/stop`。模板在 fillShell 接管并观察，stashView 归还普通卡片，拆壳时停止观察并释放持久卡片。

- [x] 记录工作区文件哈希与模板快照；运行已有右栏专项作为基线。
- [x] 扩展现有晚到在线卡断言，验证节点进入 `[data-lsb-shell-site]`，复核旧实现与新实现的最终挂载位置：

```js
assert.equal(online.parentElement, aside.querySelector('[data-lsb-shell-site]'))
```

- [x] 写最小控制器回归，覆盖缓存在线卡不挡真实节点、停止/重绑不再处理旧侧栏。真实节点到达后的关键断言：

```js
assert.equal(host.querySelector('.online-users-card'), online)
assert.equal(host.querySelector('[data-lsb-aside-keep="online"]'), null)
```

- [x] 从模板连续提取卡片块，以注入的依赖替代闭包访问；晚到观察调用 `adopt(document.querySelector('[data-lsb-shell-site]'))`，只把非缓存在线卡当作观察完成条件。保留普通与持久节点不同的还原语义。

### Task 2: 页签控制器、构建与接线

**Files:** 新增 `plugins/skin/legacy-aside-views.js`；修改 `plugins/skin/skin.template.js`、`scripts/build-skin.mjs`、`scripts/run-tests.mjs`、`test/skin-source.test.js`、`test/test-runner.test.js`。

**Interfaces:** 产出 `setActive/sync/destroy/bindResize/unbindResize` 以及 `activeId/preferredId`；模板 `onSelect(id, view)` 保留窗口聚焦和开关状态更新。

- [x] 扩展既有生成器 fixture 的模块清单、注入点和运行结果断言，验证拆分模块真正进入独立/dev/release 产物；旧生成器应因缺少运行结果失败。
- [x] 连续提取页签与 resize 块，保留注册视图清理、偏好校验、异常隔离和顺序；所有存储访问使用传入 store，宽度通过 `getContext().wide` 读取。
- [x] 接线采用真实调用方使用的实例，并将两处共享状态读取改为 getter：

```js
const { setActive: asideSetActive, sync: syncAsideViews,
  destroy: destroyAsideViews, bindResize: bindAsideResize,
  unbindResize: unbindAsideResize } = asideViewsController
// 布局偏好读取 asideViewsController.preferredId；外部窗口读取 activeId。
```

- [x] 新模块加入显式生成清单与注入标记检查，专项入口加入 `skin-legacy-aside.test.js`，生成独立插件。
- [x] 运行生成器、测试选择、新控制器及受影响独立插件测试。命令以单 worker 执行，日志写入证据目录。

### Task 3: 版本、构建与验收

**Files:** 修改 `suite/version.js`、`suite/suite-center.js`、`README.md`、`docs/CONVENTIONS.md`、`plugins/skin/README.md`、文档索引与生成产物。

**Interfaces:** 独立与套件产物保持版本一致；文档链接指向本阶段设计、计划和源码。

- [x] 同步 skin 两处版本与 Oxygen 两处真源；更新当前文档，历史记录不改写。
- [x] 顺序执行 `npm run build:dev`、`npm run build`、`npm run verify:profiles`、`npm run verify:skin`、`npm run verify:test-skips`。
- [x] 受影响 Node 专项通过后，顺序运行 `node --max-old-space-size=384 scripts/legacy-home-scroll-smoke.mjs` 和 `node --max-old-space-size=384 scripts/reading-browser-smoke.mjs`。
- [x] 对照基线复核前十一模块和 Hydrogen 未变，核对实际改动范围、编码和文档链接；运行 `git diff --check`。
- [x] 记录真实通过数、失败修复和验证边界，不将专项通过描述为全量通过。完成后保留未提交状态供用户继续开发。

## 执行与验收记录

第九阶段已完成，证据目录为 `artifacts/skin-legacy-aside-split/`。当前工作区继续保留未提交改动；未提交、未推送或移动分支。

### 提取和修正

- 新增 `legacy-aside-cards.js`（236 行）和 `legacy-aside-views.js`（151 行），显式源码模块从 11 个增至 13 个，模板现为 5401 行。
- 卡片控制器保持普通节点与广告/每日热帖不同的还原规则。模板仅保留依赖接线及窗口选择回调；页签存储、ARIA、顺序、窗口代理和清理语义保持原样。
- 两个最小控制器用例在机械提取的旧实现上均失败（`red-behavior.log`）：缓存在线卡使真实节点不能替换，路由后观察器仍绑定旧侧栏。修正将缓存排除于真实卡选择之外，观察器按当前侧栏重绑；真实在线卡出现、归还或拆壳时断开。
- 晚到在线卡直接进入站点 pane。扩展的旧集成用例在修正前也通过，因为外围刷新会再次迁移节点；因此它只作为最终挂载位置回归，未将其误报为失败复现。控制器用例隔离外围刷新后覆盖缓存替换与正确挂载。
- 仅新增 2 项行为测试，并增强 2 个已有集成用例；生成器沿用参数化契约，增加两模块后自然增加 4 项构建检查。未新增无关产品功能或依赖。

### 低负载验证

- 修改前，既有右栏基线 **11/11 通过**（`baseline-tests.log`）。
- 旧生成器/专项选择未接入新模块时，契约验证 **2 失败、1 通过**（`red-contract.log`），失败点为缺少模块执行结果与专项文件。
- 修正后模块、生成器及测试集合 **36/36 通过**（`targeted.log`）；独立插件受影响用例 **23/23 通过**（`integration.log`），覆盖资料节点、页签清理/偏好、窄屏、模式切换、缓存补位和持久广告软跳。
- 两次 Node 专项均使用 `--max-old-space-size=512 --test --test-force-exit --test-concurrency=1`，无失败、取消或跳过；未重复执行全量 Node、无关 AI 测试或完整 iOS 27 冒烟。
- 顺序完成 `npm run build:dev` 与 `npm run build`；正式/开发分发、skin 新鲜度与零跳过预算均通过（`verify-release.log`、`verify-dev.log`、`verify-skin.log`、`verify-skips.log`）。skin **2.0.44**、Oxygen/LTS **2.0.49**，Hydrogen **2.4.2**；正式 21、开发 26 模块。
- 浏览器分开运行，Node 堆上限 384 MiB：legacy 首页滚动与无限加载通过（`browser-legacy.log`）；阅读专项 **9 场景通过**（`browser-reading.log`、`reading/results.json`），包括双模式桌面/触屏阅读与真实同上下文多标签接管。使用固定 HTML 和 Chromium，不代表真实手机、线上认证或油猴安装验收。

### 审查与范围核对

独立只读审查未发现本轮重要问题；审查者未运行额外测试或修改文件。复核了延迟回调初始化、SPA 到 fillShell 的同步时序、观察器重绑、视图清理和窗口桥接，记录为 `review.json`。

`node artifacts/skin-legacy-aside-split/audit.mjs` 通过：除提取、接线与版本外，模板余部与基线逐字一致；前十一模块、Hydrogen 版本源及正式 Hydrogen 产物未变，修改文件均为 UTF-8 无 BOM、LF，72 个本地文档链接有效。`git diff --check` 通过。汇总为 `validation-summary.json`。

下一阶段为配置适配拆分，其后再处理 SPA 请求事务、缓存和正文/head 提交。
