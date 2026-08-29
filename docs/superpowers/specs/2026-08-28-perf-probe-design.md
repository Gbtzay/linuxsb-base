# 氧性能探针：本机记录已知热点耗时

日期：2026-08-28  
范围：新模块 `plugins/perf-probe.user.js`；`plugins/skin.user.js` 与 `plugins/live-feed.user.js` 在已知热点上报耗时；氧 `ORDER` 末尾加一项。氧补丁号 +1。  
非目标：`PerformanceObserver` 长任务、刷新后仍保留记录、后台 GET 通知页、软跳进 `/topic/`、氢核心改 API、给其它模块打点、默认开记录。

## 问题

点版块、实时流巡检、长帖滚时间轴，静态评估分不清哪一段在真机上最贵。需要本机、可开关的耗时记录，对得上模块名。

## 方法

氧新模块 `perf-probe`（油猴名 LSB·性能探针，面板名「性能探针」）。氢不改。模块 **不** 声明 `requires.plugins`：探针关掉时皮肤和实时流行为不变。

`ORDER` 在 `live-feed` 之后追加 `perf-probe`。

### 1. 默认不记录

配置只有一项：`enabled`（开关，文案「记录卡顿」，默认 `false`）。

`enabled === true` 时注册 RPC `perf-probe:record`（空实现即可，只当门闩）并 `api.on('perf:span', …)`。关掉或停用插件时撤掉 handler 与监听。`config:changed:perf-probe` 后按新值重绑，不要留下关了还在听的监听。

皮肤 / 实时流在打点前：`api.hasHandler('perf-probe:record')` 为假则不调用 `performance.now()`、不 `emitGlobal`。

### 2. 上报

有门闩时，用 `performance.now()` 包住热点，然后：

```js
api.emitGlobal('perf:span', {
  name,      // 见下表
  plugin,    // 'skin' | 'live-feed'
  ms,        // 数字，performance.now 差值
  href,      // 以 emit 当下的 location.pathname + location.search 为准（spa.fetch 时尚是旧地址，spa.commit 之后是新地址）
  t,         // Date.now()
})
```

`emitGlobal` 与 handler 调用包在 `try/catch` 里，失败不得打断软跳、巡检或时间轴。

探针把条目推进内存环形缓冲，最多 **200** 条（新的挤掉最旧的）。不写 `localStorage`。刷新即空。

### 3. 打点名

| name | plugin | 测量区间 |
|---|---|---|
| `spa.fetch` | skin | 软跳 `api.net.raw` |
| `spa.parse` | skin | `DOMParser.parseFromString` |
| `spa.commit` | skin | `commitRoute`（深拷 + 换主栏） |
| `spa.fillShell` | skin | `applyMarkers` + `fillShell` |
| `spa.notify` | skin | 下一帧里的 `notifyRoute` + `syncShellRoute` |
| `spa.total` | skin | 从进入软跳成功路径（`serial` 已加）到 `fillShell` 与 `scrollTo` 之后；不含下一帧 |
| `timeline.update` | skin | `updateTimeline` 函数体 |
| `cycle` | live-feed | 一整轮 `cycle()`（含 GET） |

软跳失败（HTTP 错、非 SPA URL 而 `location.assign`）不记 `spa.total`；已经完成的 `spa.fetch` / `spa.parse` 仍记。

`timeline.update`：皮肤在 `ms < 8` 时不 emit；同一日历秒最多 emit 2 条。探针入库前对 `name === 'timeline.update'` 再执行同样规则（测试可直接 `emitGlobal`，不必走时间轴）。

`spa.*` 与 `cycle` 每次都记，不再设阈值。

### 4. 面板与套件

氢面板 `configTab`：`name` 「性能探针」，`order` **90**。自动表单（记录开关）之下：

- 摘要：`最慢 {name} {ms}ms · 共 {n} 条`。未开记录写「未开记录」；已开但缓冲空写「暂无」。
- 表：最新在上，列 **耗时 / 名称 / 模块 / 路径**（路径即条目 `href`）。
- 按钮「复制 JSON」（缓冲数组）、「清空」。

`perf-probe:debug` 提供：`dump`（缓冲副本）、`clear`、`recording`（当前是否有门闩）、`slowest`（`ms` 最大的一条或 `null`）。

套件总览 `statLines` 增加一行，走 debug：有 `slowest` 则 `最慢 {ms}ms {name}`；RPC 失败、未开或缓冲空则 `未开记录`。

## 外形

不改点版块 / 回首页 / 进帖的交互。不新增氢壳开关。测的人要记卡顿时，打开氧里「性能探针」的「记录卡顿」。

## 测试

现有壳内跳转与实时流用例必须仍过。

新增 `test/perf-probe.test.js`：

- 打开记录后 `emitGlobal('perf:span', …)` 进入缓冲。
- 第 201 条挤掉最旧的，长度保持 200。
- 关上开关后 `hasHandler('perf-probe:record')` 为假，再 emit 缓冲不涨。
- `debug.dump` / `debug.clear` 可用。
- 同一秒喂 3 条 `timeline.update` 且 `ms >= 8`，缓冲里该 name 最多 2 条；`ms < 8` 的 `timeline.update` 不入库。

`test/skin.test.js`：探针开着点 `/forum/4`，缓冲含 `spa.fetch`、`spa.parse`、`spa.commit`、`spa.fillShell`、`spa.total`；`tick(120)` 后含 `spa.notify`。探针关着点版块，缓冲为空。

`test/live-feed.test.js`：探针开着 `pollOnce()` 后缓冲含 `cycle`。

不要求 jsdom 里滚出 `timeline.update`（一帧通常 < 8ms）。

## 版本

- `perf-probe` `@version` = `manifest.version` = `1.0.0`
- `skin`：`1.1.44` → `1.1.45`
- `live-feed`：`1.2.13` → `1.2.14`
- 氧 `SUITE_VERSION` / `suite-center`：`1.0.97` → `1.0.98`
- 氢不改（`0.1.33`）
- README 插件表增加 `perf-probe`；CONVENTIONS / 招募 / 已知问题 / 功能征集里的氧版本改为 **1.0.98**
