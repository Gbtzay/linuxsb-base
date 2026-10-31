# 统一阅读中心 Implementation Plan

> **For agentic workers:** Use superpowers:executing-plans to implement this plan task-by-task in the current authorized workspace. Steps use checkbox syntax for tracking.

**Goal:** 统一最近阅读、稍后阅读和按楼层继续阅读，覆盖 legacy 与 ios27。

**Architecture:** 断点模块持有唯一历史数据并提供全页只读 RPC。新阅读中心持有本地稍后阅读队列，通过基座面板和 skin 插件入口显示；不依赖调试接口或 admin 存储。

**Tech Stack:** 原生 JavaScript userscript、基座事件/存储/UI、Node test + jsdom、Playwright Chromium。

**Spec:** `docs/superpowers/specs/2026-10-30-reading-center-design.md`

## Global Constraints

- 新模块要求 `base: '^2.4.2'`；不增加第三方依赖或站点写权限。
- 保留现有未提交工作，不提交或推送；原地执行已授权功能。
- UTF-8 无 BOM、LF；变更模块同步提升两个版本号，Oxygen/LTS 版本同步。
- 历史保留原存储，稍后阅读最多 500 条，无自动过期；LTS 不收录新模块。

### Task 1: 全页阅读数据接口与路由生命周期

**Files:** 修改 `plugins/resume-reading.user.js`；新建 `test/reading-center.test.js`。

**Interfaces:** `resume-reading:list` 无参返回倒序记录数组；`resume-reading:get({ topicId })` 返回记录或 null。链接包含 `p`（大于 1 时）和 `floor`（大于 0 时）。

- [x] 写并运行失败测试：从首页读旧记录、过滤过期/损坏记录、只读副本、软跳捕获正确帖子和页码。

```js
const records = await w.LSB.bus.request('resume-reading:list')
assert.equal(records[0].href, '/topic/12?p=3&floor=82')
assert.equal((await w.LSB.bus.request('resume-reading:get', { topicId: 12 })).floor, 82)
```

- [x] 去掉全插件 topic 限制，将追踪封装为每个帖子/页码独立 session；进入主页保留 RPC，清理旧 session 的监听/定时器/NEW/提示条。
- [x] 运行 `node --test --test-force-exit test/reading-center.test.js test/features.test.js`，确认旧断点行为及新接口通过。

### Task 2: 阅读中心与本地队列

**Files:** 新建 `plugins/reading-center.user.js`，扩充 `test/reading-center.test.js`；修改 `suite/order.js`、`plugins/skin.user.js`。

**Interfaces:** 消费 Task 1 的只读 RPC；提供 `reading-center:open`、`reading-center:debug`；存储 `later` 为主题 ID 到 `{title, addedAt}` 的映射。

- [x] 先运行失败测试：历史渲染与搜索、去重/移除/持久化、队列容量、无历史源、标题转义、停用清理、两个 skin 入口与续读目标。

```js
w.LSB.open('reading-center')
assert.equal(w.document.querySelector('[data-reading-topic="12"] a').getAttribute('href'), '/topic/12?p=3&floor=82')
assert.equal(requests.length, 0)
```

- [x] 基座面板实现两个视图、本地搜索、逐项加入/移除、当前帖子与列表开关；使用最新断点生成继续阅读链接，缺失来源时说明并打开主楼。
- [x] 用 `api.on` 和可取消监听管理更新；面板重开/焦点恢复重读，不轮询/抓取；停用时清理 DOM 和迟到渲染。
- [x] 将新模块放在 resume-reading 后、加入 skin 两种入口，升级模块与套件版本。
- [x] 运行专项回归，确认失败测试转绿。

### Task 3: 双界面浏览器验收与文档

**Files:** 扩充 `scripts/reading-browser-smoke.mjs`、`docs/reading-acceptance.md`；更新 `README.md`、`docs/README.md`、`docs/CONVENTIONS.md`，新增 `docs/reading-center.md`。

- [x] 浏览器分别在 legacy / ios27 桌面及 390px 触屏执行：入口 → 历史 → 稍后阅读 → 搜索 → 继续阅读 → 后退 → 停用。
- [x] 断言实际滚动目标、无额外请求、无溢出，保留截图与结果。
- [x] 文档解释入口、唯一历史源、保留/清理规则、无源降级及本地队列与站点收藏的区别；更新模块数为完整 26 / 正式 21。
- [x] 执行发布验证顺序：`npm run build:dev` → `npm run build` → `npm run verify:profiles` → `npm run verify:test-skips` → `npm run test:all` → `npm run smoke:browser`。
- [x] 审阅最终增量与验收结果，记录真实验证数量和限制。

## 执行结果（2026-10-30）

- 已完成阅读中心 1.0.0、断点续读 1.0.6、skin 2.0.35，Oxygen/LTS 产物升至 2.0.40，Hydrogen 保持 2.4.2。
- 首轮全量测试揭示分发测试写死 20/25 个模块；现改为核对产物实际注册成员与 `ORDER_RELEASE` 一致，两个文档校验器的模块数也从 ORDER 派生。
- 回访测试使用可见楼层几何后复现后页断点被首屏覆盖，已修复为保留较远楼层；旧页会话在路由切换时独立保存并清理。
- 触屏截图发现基座左侧页签挤占阅读内容；阅读中心在窄屏改用横向页签。浏览器断言内容宽度至少 300px、无横向溢出。
- 最终 `build:dev`、`build`、`verify:profiles`、`verify:test-skips` 全部通过；完整 `test:all` 为 **1025 通过、0 失败、0 跳过**。
- 最终 `smoke:browser` 全部通过；阅读专项共 **9** 个场景通过，其中 **4** 个为阅读中心的双模式桌面/触屏链路，验证无额外抓取、按页码/楼层定位和队列操作。
- 日志：`artifacts/reading-center/node-tests.log`、`artifacts/reading-center/browser-smoke.log`；结果及截图：`artifacts/reading-acceptance/results.json`、`*-reading-center-*.png`。
- 验收使用离线站点快照及 Chromium 触屏模拟；未将其视为真实手机、线上站点或 Tampermonkey 沙箱验收。未提交或推送，原有工作区改动保留。
