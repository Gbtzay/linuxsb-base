# 开发规范

> 本文件是项目约定的事实来源。与 README 冲突时以这里为准。

## 1. 套件收录规则（核心规定）

**所有新写的功能模块一律归入完整套件清单**（`suite/order.js` 的 `ORDER`）。本地开发 Oxygen 使用全部模块；正式 Oxygen 从完整清单中排除 5 个 AI 模块，并保留 21 个非 AI 模块。

具体义务：

1. 插件文件放 `plugins/<id>.user.js`；
2. **必须登记**进 `suite/order.js` 的完整 `ORDER` 数组——构建期会强制校验，
   `plugins/` 下存在未登记的 `.user.js` 时打包直接失败（反向校验 ORDER 引用不存在的文件同样失败）；
   AI 模块登记在完整 ORDER 中，但正式 Oxygen 通过 `AI_MODULES` 明确排除；
3. 确实要独立发布、不进套件的，必须显式写入同文件的 `SUITE_EXCLUDE` 豁免名单并注明理由；
4. 登记后同步更新：
   - `test/suite.test.js` 的 `MEMBERS`（保证套件 e2e 覆盖到新模块）；
   - `README.md` 官方插件表；
5. 若新模块依赖其它插件，在 ORDER 里保持被依赖者在前。

### 模块自身质量要求

- manifest 完整：`id` / `name` / `version` / `requires: { base: '^2.4.1' }` / `permissions` / 可配置项走 `config` schema；仍声明旧 `^0.1.x` / `^0.2.x` 的插件由 2.x 兼容桥继续运行。
- 对外提供 `<id>:debug` RPC（测试与年度报告等聚合模块的统一挂点）；
- 至少一个测试用例（优先用 `test/fixtures/` 的真实页面快照）；
- 遵循现有模式：正/负缓存 + in-flight 去重、水位线 diff、单键存储 + 容量/时效修剪、
  巡检类并发用「在途 Promise 复用」而非 busy 布尔丢弃。

## 2. 版本约定

- 基座版本真源：`src/core/core-version.js` 的 `VERSION`（由 `src/core.js` 转出口）；`package.json` 与其保持同步；
- 套件版本：`suite/version.js` 的 `SUITE_VERSION`（被 `scripts/build-common.mjs` 与 `build-suite.mjs` 共享）；
- 模块版本：**userscript 头部 `@version` 与 manifest 的 `version` 必须一致**。
  两处各有读者——套件 banner 读头部、套件总览卡片读 manifest（经 `LSB.info()`），
  漂移会让同一模块在两个地方显示不同版本，排障时对不上号。
  构建期强制校验（`build-suite.mjs`），不一致直接打包失败。
- **每一次插件开发推进都必须升版本**：只要修改 `plugins/<id>.user.js` 的行为、界面、权限、配置或对外协议，
  就必须把该插件的 `@version` 与 manifest `version` 同步提升，至少递增补丁号；不得用原版本号继续迭代。
  仅修改测试、文档或构建脚本不算插件开发推进，不要求伪造插件版本。
- 模块 `manifest.id` 必须等于文件名（`plugins/<id>.user.js`）：
  ORDER 登记、停用键 `disabled:<id>`、套件卡片查找全部以此为准。同样构建期校验。

## 2.1 源码卫生（构建/测试双重把关）

- 插件源文件**不得带 UTF-8 BOM**：套件是多个源文件字符串拼接，BOM 会落在产物中段，
  破坏该模块的 userscript 头部解析，且报错位置离真正原因很远；
- 统一 **LF 行尾**，避免 diff 噪音；
- 编辑插件时用 UTF-8 无 BOM 保存。在 Windows 上尤其注意：
  PowerShell 的 `Set-Content -Encoding utf8` 会写入 BOM，`Out-File` 默认可能用 UTF-16，
  都会损坏中文内容——**改插件请用编辑器或 Node 写入，不要用 shell 重定向**；
- `build-suite.mjs` 与两个分发检查器会拒绝 BOM/CRLF；`test/suite.test.js` 另有源码检查和五份产物的解析用例。

## 2.1.1 测试命令边界

- `npm test` 与 `npm run test:quick` 运行 `scripts/run-tests.mjs` 中固定列出的日常快速回归：基础通信、检查更新、基座、DOM、选主、错误隔离、首页回位、网络、路由、运行时能力、壳布局/媒体/滚动/令牌、站点解析、存储和测试调度器；快速集合当前不加载 `test/ai-*.test.js`，也不包含实时流、完整 skin、构建与套件契约等重型文件；
- `npm run test:core` 运行所有 `test/*.test.js` 中除 `test/ai-*.test.js` 外的文件，是完整非 AI 文件回归；`npm run test:all` 运行所有测试文件，是发布前的完整 Node 回归；
- `npm run test:ai` 只运行 AI 测试；`npm run test:live-feed` 运行实时流与已读专项；`npm run test:skin` 运行 skin 与单画布壳专项；
- 新增非 AI 测试文件会自动进入 `test:core`，但只有在明确加入 `QUICK_FILES` 后才进入日常快速回归；新增 AI 测试必须通过 `npm run test:ai` 或 `npm run test:all` 验证。

## 2.2 正式版（当前）

氢 **2.4.1** / 正式氧 **2.0.36** / LTS **2.0.36**。正式 Oxygen 收录 **20** 个非 AI 模块；开发版 Hydrogen + Oxygen 位于 `dist-dev/`，保留完整 AI API、skin AI 入口和 **25** 个套件模块，不构建开发版 LTS。正式 Hydrogen、Oxygen 与 LTS 均不含 AI 专用基座 API、AI 模块或 skin AI 卡片/快捷入口/事件桥接。Platform v2 已启用能力上下文、RequestBroker 与 ActionBroker；仍声明旧 `^0.1.x` / `^0.2.x` 的插件通过 2.x legacy facade 兼容桥继续运行。不得改对外产品名隐喻（H₂O 等）。

Oxygen 中的 `title-quotes` 是只读称号行情数据源，交易页保留行情内嵌；`title-forge-planner` 是只读 UR 合成规划数据源，独立页签由 `points-title-workbench` 的统一「积分-称号」入口承接。工作台只读取配方、抽取概率、库存、积分和称号行情，不发送购买、抽取或合成请求；这三个模块都不进入 LTS。

- 油猴显示名为「氢」「氧」。Greasy Fork 列表 URL 仍可能带 `-beta` slug，以脚本头 `@version` 与油猴里的名为准。
- 基座推进：改了 `src/` 的运行时代码则氢补丁号 +1；插件推进：改了套件或模块则氧补丁号 +1；
  LTS `@version` 与当时氧号对齐。版本提升发生在本次推进中，不等到最后集中补号。
- 当前 `skin` 模块版本为 **2.0.33**。正式 Oxygen / LTS 会在构建时移除其 AI 卡片、快捷入口和事件桥接，开发 Oxygen 保留完整 AI 界面。软跳等待响应时保留旧正文与单一画布，仅显示顶端 3px、`pointer-events:none` 的进度线；验证后原子更新已有标题与 head 元信息并替换正文，通过正文聚焦和独立播报节点提供无障碍反馈。帖子页软跳默认开启，使用一次性键 `topicSpaNewWorldDefaultMigrationV1` 提升旧配置，之后尊重用户关闭选择；后退/前进恢复每个历史项的双轴滚动位置。窗口滚动桥会在首次挂接时将原窗口位置迁到空的正文滚动根，并代理窗口滚动事件，让站点原生“返回顶部”继续可用。`/topic_collection/<id>`、写操作、事务页面及未通过同源/路由/响应验证的目标仍使用整页生命周期；旧正文过渡遮罩不再使用。整页导航必须在 document-start 进入离开态并隐藏原生首屏 UI；玻璃令牌只用于导航、工具与 Sheet，正文内容保持不透明，并提供减少透明度/动效的降级规则。外观设置使用 D 原生站点、A 平衡玻璃、B 沉浸视频、C 静态可读预设，移除文字/面板/强调色手动输入；旧颜色字段只保留迁移和令牌兼容，不再作为新设置入口。宽屏站点信息栏与状态栏并列，收起时显示「站点信息」，只在点击后展开；收起控件与状态栏共用同一套液态玻璃胶囊，不用方形底块。

LTS 是另一条线，产物 `dist/linuxsb-lts.user.js`，油猴名 **LINUX.SB（LTS）**。一份脚本含基座与精简功能包（`ORDER_LTS`：楼层统计、断点续读、已读、首页回位、主楼预览、未读哨兵、签到日历、积分、配置迁移、年度报告、氢壳、实时流）。装 LTS 前必须先卸掉氢和氧。商店页：https://greasyfork.org/zh-CN/scripts/593319-linux-sb-lts 。LTS 仍冻新功能，只修装不上、页面花、请求打爆、数据丢。

已知问题见 [`docs/已知问题-rc.md`](已知问题-rc.md)。

## 3. 已知约束（勿踩）

- 站点无限滚动下启动快照会过期 → 增量一律走 `dom:list-added` / `topic:posts-added` / `route:changed`；
- 所有站内请求必须走基座网络层（限速队列 + CSRF），禁止裸 fetch 同源页面；
- 写操作（write 权限）提交前必须有确认弹窗；Agent 类工具再加显式开关双重门。

### 3.1 写权限的边界（不可绕过）

「写」的判定看**方法**，不看走的是哪个 API：

- `api.actions.*` 需要 `write`；
- `api.net.raw()` 对**站内非幂等方法**（POST/PUT/PATCH/DELETE）同样需要 `write`——
  不要试图用 `net.raw` 代替 `actions` 来规避声明；
- 会 POST 的模块必须在 manifest 里如实写上 `write`（如 `checkin-calendar` 的一键签到）；
- 非幂等请求默认 **不重试**。要重试必须显式传 `retry`，并确认该端点幂等
  （重复回复/重复签到不可撤销）。

### 3.1.1 限速队列的边界

- `title-quotes` 的市场快照仅通过 `title-quotes:market-data` 提供给统一工作台；全局入口迁移后，交易页内嵌行情仍保留。
- `title-forge-planner` 保留 `title-forge-planner:refresh` 与 `title-forge-planner:calculate` 正式 RPC，但不再注册独立 UI 页签；独立功能入口统一由 `points-title-workbench:open` 承接。
- **站外**请求（`external:true`）默认**不进**闸门。理由：闸门保护的是站点，
  而一次 LLM/外部 API 调用可能挂 60s+，占住闸门会让实时流、哨兵等站内功能的
  站内请求全部饿死。需要排队时显式传 `queue:true`；
- 外部调用记得放宽 `timeout`（默认 20s 是按站内页面定的），并把超时值做成配置项——
  用户的模型和网络差异很大。

### 3.1.2 调用付费接口的模块

- **提示词长度必须有真实上限**：所有拼进提示词的部分都要计入预算，
  不能只截其中一段（`ai-summary` 曾只截回复、主楼原样发出，`maxChars=12000` 时实际发出 3 万字）；
- **缓存键必须覆盖一切影响输出的因素**：提示词风格、用户附加要求、模型名、采集范围/页码。
  漏一项就会「改了设置却拿到旧答案」，且界面上看不出错；
- **成本要可见**：结果里显示实际送入字符数、是否截断、耗时；
- 并发要挡住：请求在飞时重复点击不得发起第二次。

### 3.2 资源必须自己收摊

插件持有的一切「基座不知道」的资源，都要在 `api.onDispose()` 里释放。停用插件后不得留下任何活动：

- 基座托管的 `api.net.*` 请求自动绑定插件 `api.signal`；停用、离页或 `shutdown()` 时会先 abort 在途请求，再执行 disposer；
- 需要把自己的异步流程接到生命周期时，传入 `api.signal`，并在捕获 abort 后安静退出，不要把停用当成业务错误上报；

- `setInterval` / `setTimeout` → `clearInterval` / `clearTimeout`；
- `window` / `document` 上的 `addEventListener` → 对应 `removeEventListener`
  （**包括 `pagehide`、`visibilitychange` 这类容易漏的**）；
- 自己 `appendChild` 到 `body` 的浮层/浮卡/提示条 → `remove()`；
- 长轮询 while 循环 → 用 generation 令牌或 flag 让在途循环醒来即退，并防重入；
- 改过的全局状态（如 `document.title` 角标）→ 还原。

`api.on` / `api.dom.each` / `api.ui.tab` / `api.election` 由基座托管，无需手动清理。
新增模块请顺带在 `test/hardening.test.js` 补一条「停用即收摊」用例。

### 3.2.1 非沙箱与外部请求

权限检查是基座 API 的调用约定，不是浏览器沙箱。独立油猴脚本与基座共享页面 JavaScript 上下文，
因此只能安装可信来源的模块，不能把 `permissions` 当作恶意插件隔离边界。

- `api.net.raw()` 的站外请求必须同时满足插件声明 `net`、传入 `external:true`，并使用 HTTP(S) URL；基座拒绝非 HTTP(S)、用户信息和 fragment；
- `GM_xmlhttpRequest` 以匿名模式发出站外请求，不携带 linux.sb Cookie；`@connect *` 只为用户自定义 LLM/本地桥接端点保留，不能替代 `net` 权限；
- API Key 只能放脚本存储，禁止进入日志、错误条目、诊断摘要、事件 payload 或 URL 查询参数；
- 需要更窄的出站范围时，拆成独立脚本并在该脚本的 userscript 头中收窄 `@connect`，不要把限制寄托在插件自报权限上。

### 3.3 跨标签单例（选主）

需要「多标签只让一个干活」的模块（巡检、轮询、通知）一律用 `api.election({...})`，
不要自己写心跳。基座保证的不变式是 **恰好一个 leader**：

- 破成 0 个 → 该模块在所有标签上都停摆，且界面无任何异常表现（最难发现的一类故障）；
- 破成 ≥2 个 → 请求翻倍、通知重复、可能触发站点限流。

协议要点（改 `src/election.js` 前先读懂）：

- 心跳带 `{ id, role }`。**冲突只在「双方都自称 leader」时存在**，由 id 较大者让位，
  确定性且无环（双方独立计算得到同一结论）；已在任者一律留任，避免无谓易主。
- 补位条件是「多久没收到 **leader** 的心跳」，不是「多久没收到任何心跳」。
  后者会活锁：双方都退位成 follower 后仍在互发心跳，超时条件永不成立。
- 上位/让位立即广播一次（跳过节流），让冲突在毫秒级暴露而非等一个心跳周期。
- `leaderTimeoutMs` 会被抬到至少 `2 × beatMs`，防止正常抖动被误判成「leader 已死」。

模块侧惯例：门禁写 `election.role === 'follower'`；调试接口暴露
`election: () => election.state()`（含 id/leaderId/距上次 leader 心跳）。
协议改动必须同步 `test/election.test.js`。

## 4. 目录约定（重构后）

- `src/core/`：`core.js` 仅保留注册/生命周期，其它按职责分布在 `core/panels/*`、`core/api-factory.js`、`core/permissions.js`、`core/core-version.js`。
- `src/shell/` 与 `src/ai/`：各 6 文件的目录化，旧 `src/shell-*.js` / `src/ai-*.js` 为兼容垫片（薄 re-export），新增代码请走 `src/shell/*` / `src/ai/*`。
- `src/site/`：`routes / selectors / chrome / parsers / snapshot` 五件套，`src/site.js` 为 `export * from './site/index.js'` 垫片。
- `suite/version.js`：套件 `SUITE_VERSION` 单点真理；`scripts/build-common.mjs` 收敛构建公共逻辑。
- `test/helpers/setup.js`：共享 `makeDom / tick / until`，减少测试前言重复。
- `plugins/skin.user.js` 等大文件已加章节索引注释，物理拆分为 `plugins/<id>/*.js` 时应由 `scripts/build-common.mjs` 扩展聚合规则，避免改 `build-suite.mjs` 的核心校验。
