# 开发规范

> 本文件维护当前开发约定，与 README 冲突时以这里为准。历史公告与阶段计划只记录当时的决策，不能覆盖本文件；代码与文档不一致时，应结合实现和测试核实后更新。文档分工见 [文档索引](README.md)。

## 1. 套件收录规则（核心规定）

**所有新写的功能模块一律归入完整套件清单**（`suite/order.js` 的 `ORDER`）。本地开发 Oxygen 使用全部模块；正式 Oxygen 从完整清单中排除 5 个 AI 模块，并保留 21 个非 AI 模块。

具体义务：

1. 插件文件放 `plugins/<id>.user.js`；
2. **必须登记**进 `suite/order.js` 的完整 `ORDER` 数组——构建期会强制校验，
   `plugins/` 下存在未登记的 `.user.js` 时打包直接失败（反向校验 ORDER 引用不存在的文件同样失败）；
   AI 模块登记在完整 ORDER 中，但正式 Oxygen 通过 `AI_MODULES` 明确排除；
3. 确实要独立发布、不进套件的，必须显式写入同文件的 `SUITE_EXCLUDE` 豁免名单并注明理由；
4. 登记后更新 `README.md` 插件表和该模块的测试；`test/suite.test.js` 的 `MEMBERS` 已直接导入 `ORDER`，不要再维护第二份成员数组；
5. 若新模块依赖其它插件，在 ORDER 里保持被依赖者在前。

### 模块自身质量要求

- manifest 完整：`id` / `name` / `version` / `requires: { base: '^2.4.2' }` / `permissions` / 可配置项走 `config` schema；仍声明旧 `^0.1.x` / `^0.2.x` 的插件由 2.x 兼容桥继续运行。
- 对外提供 `<id>:debug` RPC（测试与年度报告等聚合模块的统一挂点）；
- 至少一个测试用例（优先用 `test/fixtures/` 的真实页面快照）；
- 遵循现有模式：正/负缓存 + in-flight 去重、水位线 diff、单键存储 + 容量/时效修剪、
  巡检类并发用「在途 Promise 复用」而非 busy 布尔丢弃。

## 2. 版本约定

- 基座版本真源：`src/core/core-version.js` 的 `VERSION`（由 `src/core.js` 转出口）；`package.json` 与 `package-lock.json` 的项目版本同步；
- 套件版本：`suite/version.js` 的 `SUITE_VERSION`（被 `scripts/build-common.mjs` 与 `build-suite.mjs` 共享）；`suite/suite-center.js` 的 manifest 版本同步，构建和分发检查会校验一致性；
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
  Windows PowerShell 5.1 的 `Set-Content -Encoding utf8` 会写入 BOM，`Out-File` 默认使用 UTF-16，
  都会损坏中文内容——**改插件请用编辑器或 Node 写入，不要用 shell 重定向**；
- `build-suite.mjs` 与两个分发检查器会拒绝 BOM/CRLF；`test/suite.test.js` 另有源码检查和五份产物的解析用例。

## 2.1.1 测试命令边界

- `npm test` 与 `npm run test:quick` 运行 `scripts/run-tests.mjs` 中固定列出的日常快速回归：基础通信、检查更新、基座、DOM、选主、错误隔离、首页回位、网络、路由、运行时能力、壳布局/媒体/滚动/令牌、站点解析、存储和测试调度器；快速集合当前不加载 `test/ai-*.test.js`，也不包含实时流、完整 skin、构建与套件契约等重型文件；
- `npm run test:core` 运行所有 `test/*.test.js` 中除 `test/ai-*.test.js` 外的文件，是完整非 AI 文件回归；`npm run test:all` 运行所有测试文件，是发布前的完整 Node 回归；
- `npm run test:ai` 只运行 AI 测试；`npm run test:live-feed` 运行实时流与已读专项；`npm run test:skin` 运行 skin 生成契约、单画布状态、样式生成、媒体生命周期、插件目录/搜索/导航、正文/历史生命周期、资料卡/站点卡片、在线状态、旧三栏右侧栏、配置适配、SPA 文档/缓存/事务和双界面阅读专项；
- 常规测试入口先只读校验生成的 `plugins/skin.user.js`。修改 skin 源文件后先运行 `npm run build:skin`，或由正常套件构建自动生成；不能用过期独立插件验证新源码。
- 新增非 AI 测试文件会自动进入 `test:core`，但只有在明确加入 `QUICK_FILES` 后才进入日常快速回归；新增 AI 测试必须通过 `npm run test:ai` 或 `npm run test:all` 验证。

### 开发环境与验证顺序

- 使用 Node.js 24，与 `.github/workflows/ci.yml` 一致；用 `npm ci` 安装锁定依赖。运行入口以 `package.json` 为准。
- 修改源码后，先运行相关专项测试；发布前依次构建开发版与正式版，再校验产物、跳过基线、完整 Node 回归和浏览器冒烟。完整测试中的套件、LTS 与构建配置用例会读取产物，不要用旧产物验证新源码。
- 发布验证顺序：`npm run build:dev` → `npm run build` → `npm run verify:profiles` → `npm run verify:test-skips` → `npm run test:all` → `npm run smoke:browser`。本地首次运行冒烟前用 `npx playwright install chromium` 安装浏览器；Linux CI 使用 `--with-deps` 安装系统依赖。
- `scripts/check-test-skips.mjs` 当前跳过预算为 0；旧 skin 用例已逐项恢复或归并，处置见 [双界面阅读验收](reading-acceptance.md)。不通过增加 skip 隐藏失败。
- `npm run smoke:reading` 使用 Chromium 和离线站点快照验证两种桌面界面、触屏视口及同上下文多标签；已接入 `smoke:browser`。截图、失败 trace 和结果保存在 `artifacts/reading-acceptance/`，可用 `READING_SCREEN_DIR` 改变输出目录。
- 正式产物与生成的独立 skin 随源码提交；CI 重建后用 `git diff --exit-code -- plugins/skin.user.js dist` 检查是否遗漏更新。开发产物留在 `dist-dev/`，不作为正式分发文件。
- 日常定向验证按风险选择现有用例；资源受限时使用 `node --max-old-space-size=512 --test --test-force-exit --test-concurrency=1 --test-name-pattern='用例名称' test/skin.test.js`，按组串行执行。`--test-force-exit` 只限制测试进程退出，不证明资源已释放；清理仍须由断言验证。轻量验证不替代上面的发布验证。
- 仅修改文档时核对链接、命令与源码事实，并运行 `npm run verify:profiles` 检查版本和模块说明；无需为文档改动升版本或重建脚本。

## 2.2 正式版（当前）

氢 **2.4.2** / 正式氧 **2.0.64** / LTS **2.0.64**。正式 Oxygen 收录 **21** 个非 AI 模块；开发版 Hydrogen + Oxygen 位于 `dist-dev/`，保留完整 AI API、skin AI 入口和 **26** 个套件模块，不构建开发版 LTS。正式 Hydrogen、Oxygen 与 LTS 均不含 AI 专用基座 API、AI 模块或 skin AI 卡片/快捷入口/事件桥接。Platform v2 已启用能力上下文、RequestBroker 与 ActionBroker；仍声明旧 `^0.1.x` / `^0.2.x` 的插件通过 2.x legacy facade 兼容桥继续运行。不得改对外产品名隐喻（H₂O 等）。

Oxygen 中的 `title-quotes` 是只读称号行情数据源，交易页保留行情内嵌；`title-forge-planner` 提供只读 UR 合成规划及熔炼页材料选择增强。熔炼页可全选材料、排除 SSR，默认排除 R 级“反贼”，并恢复本地保存的选择；这些控件不提交熔炼操作。统一入口由 `points-title-workbench` 的「积分-称号」承接。工作台只读取配方、抽取概率、库存、积分和称号行情，不发送购买、抽取或合成请求；这三个模块都不进入 LTS。

`title-quotes:market-data` 向工作台提供市场快照；`title-forge-planner:refresh` 与 `title-forge-planner:calculate` 保留正式 RPC，不注册独立 UI 页签。需要打开统一工作台时使用 `points-title-workbench:open`。

`reading-center` 1.0.0 提供双界面统一阅读入口（`reading-center:open`），只消费 `resume-reading` 1.0.6 的 `resume-reading:list` / `resume-reading:get` 正式只读 RPC；历史唯一来源仍是 `positions`，全页查询与帖子追踪会话分离。稍后阅读由中心独立保存，最多 500 帖，无自动过期；不使用调试接口或 admin 跨模块存储，也不发起站内抓取或收藏写操作。新模块不进入 LTS，详见 [阅读中心](reading-center.md)。

- 油猴显示名为「氢」「氧」。Greasy Fork 列表 URL 仍可能带 `-beta` slug，以脚本头 `@version` 与油猴里的名为准。
- 基座推进：改了 `src/` 的运行时代码则氢补丁号 +1；插件推进：改了套件或模块则氧补丁号 +1；
  LTS `@version` 与当时氧号对齐。版本提升发生在本次推进中，不等到最后集中补号。
- 当前 `skin` 模块版本为 **2.0.59**，默认使用旧三段式，可切换为 iOS 27 单画布。正式 Oxygen / LTS 会在构建时移除其 AI 卡片、快捷入口和事件桥接，开发 Oxygen 保留完整 AI 界面。iOS 27 单画布软跳等待响应时保留旧正文与单一画布，仅显示顶端 3px、`pointer-events:none` 的进度线；验证后原子更新已有标题与 head 元信息并替换正文，通过正文聚焦和独立播报节点提供无障碍反馈。帖子页软跳默认开启，使用一次性键 `topicSpaNewWorldDefaultMigrationV1` 提升旧配置，之后尊重用户关闭选择；后退/前进恢复每个历史项的双轴滚动位置；恢复后的250ms内临时关闭当前滚动根的锚定，用户滚动输入、离页或新导航会提前归还原样式。关闭氢壳或停用插件会归还其接管前的浏览器滚动恢复模式。窗口滚动桥会在首次挂接时将原窗口位置迁到空的正文滚动根，并代理窗口滚动事件，让站点原生“返回顶部”继续可用。`/topic_collection/<id>`、写操作、事务页面及未通过同源/路由/响应验证的目标仍使用整页生命周期；旧正文过渡遮罩不再使用。整页导航必须在 document-start 进入离开态并隐藏原生首屏 UI；玻璃令牌只用于导航、工具与 Sheet，正文内容保持不透明，并提供减少透明度/动效的降级规则。外观设置使用 D 原生站点、A 平衡玻璃、B 沉浸视频、C 静态可读预设，移除文字/面板/强调色手动输入；旧颜色字段只保留迁移和令牌兼容，不再作为新设置入口。宽屏站点信息栏与状态栏并列，收起时显示「站点信息」，只在点击后展开；收起控件与状态栏共用同一套液态玻璃胶囊，不用方形底块。

LTS 是另一条线，产物 `dist/linuxsb-lts.user.js`，油猴名 **LINUX.SB（LTS）**。一份脚本含基座与精简功能包（`ORDER_LTS`：楼层统计、断点续读、已读、首页回位、主楼预览、未读哨兵、签到日历、积分、配置迁移、年度报告、氢壳、实时流）。装 LTS 前必须先卸掉氢和氧。商店页：https://greasyfork.org/zh-CN/scripts/593319-linux-sb-lts 。LTS 仍冻新功能，只修装不上、页面花、请求打爆、数据丢。

面向使用者的当前行为、限制与反馈说明见 [已知问题.md](已知问题.md)。旧版招募和功能征集公告已归档，不能用来判断当前功能范围。

## 3. 已知约束（勿踩）

- 站点无限滚动下启动快照会过期 → 增量一律走 `dom:list-added` / `topic:posts-added` / `route:changed`；
- 所有站内请求必须走基座网络层（限速队列 + CSRF），禁止裸 fetch 同源页面；
- 写操作（write 权限）提交前必须有确认弹窗；Agent 类工具再加显式开关双重门。

### 运行时缓存与增量处理

- GM 存储只有在键变更监听可用时才使用内存缓存；跨标签写入使对应键失效，监听不可用时直接读取持久值。`api.store.watch` 是本地 Store 通知，不等于跨标签变更订阅。
- RequestBroker 只合并同一插件上下文、路由和请求选项下的并发站内 GET；写请求、站外请求、带正文或流式请求不参与合并。每个调用方独立取消、解析响应，已完成请求不留作响应缓存。
- DOM 增量扫描只处理最外层新增子树；保持 `api.dom.each` 的每元素一次语义，不因兄弟节点批量加入而重扫整个旧列表。

### 3.1 写权限的边界（不可绕过）

通用站内请求的权限按**方法**判定；固定语义适配器的权限需要单独说明：

- `api.actions.*` 需要 `write`；
- `api.net.raw()` 对**站内非幂等方法**（POST/PUT/PATCH/DELETE）同样需要 `write`——
  不要试图用 `net.raw` 代替 `actions` 来规避声明；
- 直接发起站内 POST 的模块必须在 manifest 里如实写上 `write`（如 `checkin-calendar` 的一键签到）；
- `api.net.search(q, field)` 是固定的只读搜索适配器，要求 `read`，内部使用 POST 获取并验证结果页；这是适配器的受限查询语义，不允许只声明 `read` 的插件直接发任意站内 POST。旧 `api.actions.search` 仍要求 `write`；
- 非幂等请求默认 **不重试**。要重试必须显式传 `retry`，并确认该端点幂等
  （重复回复/重复签到不可撤销）。

旧 `api.actions.*` 经 `ActionBroker.legacy` 执行能力和生命周期检查，确认界面仍由插件负责，不能假设兼容入口自动弹窗。新的动作提供方遵循 `prepare/confirm/execute` 流程；结果未知时只运行提供方的只读检查，不自动重放。

### 3.1.1 限速队列的边界

- 站内队列属于当前页面的基座实例，默认间隔 900ms；跨标签巡检用选主减少重复流量。队列不控制其它标签或站点原生请求，不能承诺绝不触发服务端限流。
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
不要自己写心跳。在心跳可达的稳定窗口内，协议应**收敛到一个 leader**；启动、掉线检测和冲突仲裁期间可能存在短暂无主或多主，不能把它当作分布式事务锁。需要防止的持续异常是：

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

## 4. 目录约定

- `src/core.js`：基座装配、注册、生命周期、导航与错误记录；`src/core/` 按职责提供 `panels/*`、`api-factory.js`、`permissions.js` 和 `core-version.js`。
- `src/runtime/`：能力上下文、RequestBroker、ActionBroker、路由指纹与诊断脱敏。
- `src/shell/` 与 `src/ai/`：分别存放壳原语与开发版 AI 公共设施；旧 `src/shell-*.js` / `src/ai-*.js` 为兼容转出口，新增代码请走子目录。
- `src/site/`：`routes / selectors / chrome / parsers / snapshot` 五件套，`src/site.js` 为 `export * from './site/index.js'` 垫片。
- `suite/version.js`：套件 `SUITE_VERSION` 单点真理；`scripts/build-common.mjs` 收敛构建公共逻辑。
- `test/helpers/setup.js`：共享 `makeDom / tick / until`，减少测试前言重复。
- `plugins/<id>.user.js`：除 skin 外的插件源码。skin 的唯一编辑入口是 `plugins/skin/` 内的 29 个显式模块与 `skin.template.js`；逐模块接口见 [skin 源码入口](../plugins/skin/README.md)。`scripts/build-skin.mjs` 决定模块清单和唯一注入点，`readPluginSource('skin')` 按模板组合，套件构建自动刷新生成的独立脚本 `plugins/skin.user.js`。`verify:skin`、分发校验和常规测试入口只读检查同步，不编辑生成文件；正式与开发套件按既有配置裁剪 AI。
- 模板保留 manifest、模块装配、公共注册、旧三栏渲染及视图/路由适配；状态/样式模块保持纯函数，持有资源的控制器负责释放自己的节点、监听、请求和媒体。运行时控制器编排临时卸载与彻底停用，画布宿主管理画布 DOM、面板事件及局部挂载/卸载。保留初始化次序、延迟 getter、真实节点身份和现有清理顺序；不得通过重复状态或重复注销补接线。
- 公共 UI 控制器、设置页、事件和 DOM 订阅由 `src/core/api-factory.js` 的 `own()` 登记，core 按登记顺序释放。SPA 的 `unbind()` 调用历史控制器 `dispose()`，归还浏览器滚动模式；媒体 `reset()` 可重用、`dispose()` 永久停用。原窗口化开关仍关闭。`src/shell/canvas.js` 仅作兼容转出，旧章节参考副本已移除。
- 既定 skin 25 阶段路线已完成，集中验收见 [第 25 阶段记录](skin-acceptance.md)。剩余模板是维护边界，后续工作由实际需求或缺陷驱动，不自动继续拆分阶段。

## 5. 文档维护

- `README.md` 负责安装、功能和公共 API；本文件负责开发约定；[已知问题.md](已知问题.md) 负责当前行为、限制与反馈。入口集中在 [docs/README.md](README.md)。
- 版本和模块数从 `src/core/core-version.js`、`suite/version.js`、`suite/order.js` 核对；只在当前 README 与规范中同步版本。历史公告和带日期的阶段记录保留原版本，不随发布批量改写。
- `docs/archive/` 保存已退出当前维护的公告；`docs/superpowers/specs/` 与 `plans/` 保存阶段设计和执行记录。旧计划中的约束、路径、版本、测试数量和未勾选清单不自动成为当前要求，继续相关工作前需核对代码、测试及执行记录。
- 功能已实现或策略已改变时，从当前文档删除相反的旧限制；仍需留存的决策写入归档并说明替代入口，不把历史“本轮不修”保留成长期禁令。
- 变更文档位置时更新当前入口和归档内的相对链接。历史计划中的代码块、旧路径和当时的命令作为记录保留，不据此执行旧发布流程。
