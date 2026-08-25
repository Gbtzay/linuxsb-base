# 开发规范

> 本文件是项目约定的事实来源。与 README 冲突时以这里为准。

## 1. 套件收录规则（核心规定）

**所有新写的功能模块一律归入重型套件**（`dist/linuxsb-suite.user.js`）。
单文件全家桶是默认分发形态；「装了套件但缺一角」视为 bug，不是可选项。

具体义务：

1. 插件文件放 `plugins/<id>.user.js`；
2. **必须登记**进 `build-suite.mjs` 的 `ORDER` 数组——构建期会强制校验，
   `plugins/` 下存在未登记的 `.user.js` 时打包直接失败（反向校验 ORDER 引用不存在的文件同样失败）；
3. 确实要独立发布、不进套件的，必须显式写入同文件的 `SUITE_EXCLUDE` 豁免名单并注明理由；
4. 登记后同步更新：
   - `test/suite.test.js` 的 `MEMBERS`（保证套件 e2e 覆盖到新模块）；
   - `README.md` 官方插件表；
5. 若新模块依赖其它插件，在 ORDER 里保持被依赖者在前。

### 模块自身质量要求

- manifest 完整：`id` / `name` / `version` / `requires: { base: '^0.1.0' }` / `permissions` / 可配置项走 `config` schema；
- 对外提供 `<id>:debug` RPC（测试与年度报告等聚合模块的统一挂点）；
- 至少一个测试用例（优先用 `test/fixtures/` 的真实页面快照）；
- 遵循现有模式：正/负缓存 + in-flight 去重、水位线 diff、单键存储 + 容量/时效修剪、
  巡检类并发用「在途 Promise 复用」而非 busy 布尔丢弃。

## 2. 版本约定

- 基座版本真源：`src/core.js` 的 `VERSION`；`package.json` 与其保持同步；
- 套件版本：`build-suite.mjs` 的 `SUITE_VERSION`；
- 模块版本：**userscript 头部 `@version` 与 manifest 的 `version` 必须一致**。
  两处各有读者——套件 banner 读头部、套件总览卡片读 manifest（经 `LSB.info()`），
  漂移会让同一模块在两个地方显示不同版本，排障时对不上号。
  构建期强制校验（`build-suite.mjs`），不一致直接打包失败。
- 模块 `manifest.id` 必须等于文件名（`plugins/<id>.user.js`）：
  ORDER 登记、停用键 `disabled:<id>`、套件卡片查找全部以此为准。同样构建期校验。

## 2.1 源码卫生（构建/测试双重把关）

- 插件源文件**不得带 UTF-8 BOM**：套件是多个源文件字符串拼接，BOM 会落在产物中段，
  破坏该模块的 userscript 头部解析，且报错位置离真正原因很远；
- 统一 **LF 行尾**，避免 diff 噪音；
- 编辑插件时用 UTF-8 无 BOM 保存。在 Windows 上尤其注意：
  PowerShell 的 `Set-Content -Encoding utf8` 会写入 BOM，`Out-File` 默认可能用 UTF-16，
  都会损坏中文内容——**改插件请用编辑器或 Node 写入，不要用 shell 重定向**；
- `test/suite.test.js` 有对应用例（无 BOM / 无 CRLF / 两个产物均可被 `new Function` 解析）。

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

- **站内**请求一律走全局串行闸门（保护 linux.sb 不被众插件刷成 429）；
- **站外**请求（`external:true`）默认**不进**闸门。理由：闸门保护的是站点，
  而一次 LLM/外部 API 调用可能挂 60s+，占住闸门会让实时流、悬浮卡、哨兵的
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

- `setInterval` / `setTimeout` → `clearInterval` / `clearTimeout`；
- `window` / `document` 上的 `addEventListener` → 对应 `removeEventListener`
  （**包括 `pagehide`、`visibilitychange` 这类容易漏的**）；
- 自己 `appendChild` 到 `body` 的浮层/浮卡/提示条 → `remove()`；
- 长轮询 while 循环 → 用 generation 令牌或 flag 让在途循环醒来即退，并防重入；
- 改过的全局状态（如 `document.title` 角标）→ 还原。

`api.on` / `api.dom.each` / `api.ui.tab` / `api.election` 由基座托管，无需手动清理。
新增模块请顺带在 `test/hardening.test.js` 补一条「停用即收摊」用例。

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
