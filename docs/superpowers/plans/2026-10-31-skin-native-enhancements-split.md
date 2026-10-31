# Skin Native Enhancements Implementation Plan

> **For agentic workers:** Execute these steps in this session. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 完成第十四阶段：原生正文增强及其事件清理的控制器拆分。

**Architecture:** 控制器拥有对话树与验证控件的九项状态，使用既有帖子 URL 判断和在线刷新依赖。模板只保留刷新/清理方法别名，调用位置与顺序保持。

**Tech Stack:** JavaScript ES modules、Node.js 24、现有 JSDOM 与 Chromium 冒烟。

**Spec:** [原生正文增强设计](../specs/2026-10-31-skin-native-enhancements-split-design.md)

## Global Constraints

- 在 `codex/integrate-origin-main` 保留全部既有未提交改动，不移动、提交或推送。
- skin 2.0.49，Oxygen/LTS 2.0.54，Hydrogen 2.4.2；19 个 skin 模块，正式 21、开发 26 个套件模块。
- 无新增依赖、配置、持久化字段或事件；UTF-8 无 BOM、LF，前十八模块与 Hydrogen 不变。
- 保持原有五条可见阈值、引用/楼层链接、节点交互及验证任务策略；只合并原有三项清理调用，不扩展产品行为。
- 复用既有行为用例；Node 单 worker、512 MiB 堆上限，浏览器顺序执行、384 MiB 堆上限，不跑全量、无关 AI、高成本 PoW 或压力测试。

---

### Task 1: 构建契约与控制器提取

**Files:** 新增 `plugins/skin/native-enhancements-controller.js`；修改 `plugins/skin/skin.template.js`、`scripts/build-skin.mjs`、`test/skin-source.test.js`。

**Interfaces:** `createSkinNativeEnhancementsController({ window, document, topicUrl, startOnline })` 返回 `{ refresh, clear }`；唯一注入点 `@LSB_SKIN_NATIVE_ENHANCEMENTS`。

- [x] 保存 366 个基线哈希与模板快照，运行 4 项现有基线：

```powershell
node artifacts/skin-native-enhancements-split/run.mjs baseline.log --max-old-space-size=512 --test --test-force-exit --test-concurrency=1 --test-name-pattern='软跳后重建原生评论对话树|软跳后发卡和抽奖帖|软跳后延迟插入的人机验证|原生回复保存事件' test/skin.test.js
```

- [x] 扩展构建 fixture，确认旧生成器返回 `missing-native-enhancements` 而非以下期望：

```js
assert.equal(context.result.nativeEnhancements, 'native-enhancements-ready')
```

- [x] 连续提取 `NATIVE_THREAD_VISIBLE_LIMIT` 至 `refreshNativeRouteEnhancements` 的常量/函数及九项状态，显式使用注入 window 的 DOM 构造器。
- [x] 在文档控制器之后、SPA 控制器之前接线：

```js
const { refresh: refreshNativeRouteEnhancements, clear: clearNativeRouteEnhancements } = createSkinNativeEnhancementsController({
  window, document, topicUrl: topicSpaUrl, startOnline: () => onlineController.start(),
})
```

- [x] 将拆壳中原三项清理替换为 `clearNativeRouteEnhancements()`；控制器内按相同顺序执行：

```js
clear() {
  clearNativeThreadObserver()
  unbindNativeThreadLifecycle()
  clearNativeCaptchaObserver()
}
```

### Task 2: 版本与定向验证

**Files:** `suite/version.js`、`suite/suite-center.js`、独立/dev/release/LTS 产物与本阶段证据。

- [x] 同步版本并生成 skin，执行 `test/skin-source.test.js`；保留完整行注入标记与精确错误断言。
- [x] 运行既有对话树、回复保存/引用、验证控件、路由提交、模式切换、停用和楼层定位专项，按实际输出记录数量；不修改既有行为测试或选择器。
- [x] 顺序执行 `npm run build:dev`、`npm run build`，检查正式/开发分发、skin 新鲜度和零跳过预算。
- [x] 顺序运行 `scripts/legacy-home-scroll-smoke.mjs`、`scripts/ios27-canvas-smoke.mjs`、`scripts/reading-browser-smoke.mjs`，保存结果。

### Task 3: 审查与记录

**Files:** `README.md`、`docs/CONVENTIONS.md`、`docs/README.md`、`plugins/skin/README.md`、本设计和计划。

- [x] 依 requesting-code-review 技能安排一次独立只读审查，重点核对构造顺序、监听身份、列表重绑、回复关系、验证任务与清理顺序；审查者不运行额外测试。
- [x] 核对函数依赖替换与模板余部，确认前十八模块、Hydrogen、既有行为测试及专项选择器无本轮变化。
- [x] 更新入口、版本、下一阶段边界和真实验收记录；验证编码、链接及 `git diff --check`，保留未提交状态。

## 执行与验收记录

第十四阶段已完成，证据目录为 `artifacts/skin-native-enhancements-split/`。继续在 `codex/integrate-origin-main` 保留全部既有未提交改动；本轮未提交、推送或移动分支。

### 实现范围

- 新增 `native-enhancements-controller.js`（490 行），集中 23 个函数、原折叠常量和九项状态。显式模块从 18 个增至 19 个，模板从 4250 行缩至 3774 行，减少 476 行。
- 控制器接管原生评论对话树、回复父楼层记录、引用与楼层链接、折叠交互、正文验证控件和相关观察器/计时器/文档事件。`refresh()` 保持增强准备及在线刷新的顺序；`clear()` 按原顺序合并线程观察清理、回复生命周期解绑和原生校验清理。
- 模板在文档控制器之后、SPA 事务控制器之前接入方法别名，保留原渲染/提交调用位置。本轮没有功能性修正；原生 CAP 动态加载、节点监听策略、验证流程及线程展示规则保持不变。

### 低负载验证

- 修改前对话树、CAP 占位、延迟验证控件和回复保存事件 **4/4 基线通过**（`baseline.log`）。旧生成器未接入新模块时，契约 **1 项按预期失败**：实际 `missing-native-enhancements`，期望 `native-enhancements-ready`（`red-contract.log`）。
- 最终生成器专项 **41/41 通过**（`targeted.log`），现有正文增强/路由/模式切换/停用集成 **16/16 通过**（`integration.log`），共 **57 项不同专项**，基线不重复计数。覆盖对话树、引用链接、回复保存、验证控件、CSRF/路由/楼层事件、replyid 定位、双模式停用与断点切换。
- 没有新增行为测试文件或修改既有行为测试、夹具和专项选择器；仅扩展生成器参数化 fixture，自然增加 2 项构建检查。Node 单 worker、512 MiB V8 堆上限，无最终失败、取消或跳过；未运行全量 Node、无关 AI、高成本 PoW 或压力测试。
- 顺序完成 `npm run build:dev` 与 `npm run build`（`build-dev.log`、`build-release.log`）。正式/开发分发、skin 新鲜度及零跳过预算通过（`verify-release.log`、`verify-dev.log`、`verify-skin.log`、`verify-skips.log`）。skin **2.0.49**、Oxygen/LTS **2.0.54**，Hydrogen **2.4.2**；正式 21、开发 26 个套件模块。
- 浏览器逐套执行，Node 堆上限 384 MiB：legacy 首页滚动与无限加载通过；iOS 27 **21 组通过**；reading **9 场景通过**，包含双模式桌面/触屏阅读与同上下文真实多标签接管。日志为 `browser-legacy.log`、`browser-ios27.log`、`browser-reading.log`，阅读结果为 `reading/results.json`。固定 HTML 与 Chromium 检查不代表真实手机、线上认证或油猴安装验收。

### 审查与范围核对

独立只读审查未发现本轮引入的阻断项；审查者没有修改文件或运行额外测试，结论为 `review.json`。`audit.mjs` 对照 366 个基线哈希确认本轮仅 16 个预定文件变更，前十八模块、57 个 Hydrogen 源文件、两份 Hydrogen 产物、既有 skin/画布/SPA 行为测试、专项选择器及三个冒烟脚本不变。

23 个提取函数在明确的依赖与 DOM realm 替换后与原逻辑逐字一致；`clear()` 的三项清理顺序与原拆壳代码一致。除提取、初始化接线、清理别名、注入点、版本与源码边界注释外，模板余部逐字一致。变更文件均为 UTF-8 无 BOM、LF，88 个本地文档链接有效，`git diff --check` 通过。详细证据为 `audit.json`，汇总为 `validation-summary.json`。

下一阶段为设置面板渲染与菜单同步，本轮未开始该阶段。
