# 氢壳软跳点击：去掉重复刷壳和重复 GET

日期：2026-08-28  
范围：`plugins/skin.user.js` 软跳成功后的刷壳；`plugins/live-feed.user.js` 在 `route:changed` 上的立刻巡检。氧补丁号 +1。  
非目标：帖内时间轴、顶栏毛玻璃、`#lsb-shell` 铺满视口、只换 `ul.post-list` 不换 `main`、取消软跳改回整页、进帖子改软跳、后台 GET 通知页、新 `ORDER` 模块、氢核心改 API。

## 问题

点左栏版块或回首页时，软跳已经 GET 整页并换掉主栏，却立刻又做两件重复的事：

1. `navigateSpa` 里 `fillShell()` 之后，假 `popstate` 触发 `route:changed`，氢壳 50ms 后再 `refreshShell` / `fillShell` 一遍。
2. 实时流在 `route:changed` 里 `init()` 之后马上 `cycle()`，再 GET 一次刚换上的那条列表 URL。

列表已经在眼前，这两步挡点击。

## 方法

软跳仍只覆盖现有 `isSpaUrl`（首页 / 版块 / 精华 / 足迹等）。`/topic/` 仍整页跳，站点脚本才能挂讨论串。

### 1. 刷壳只一次

`navigateSpa` 在 `commitRoute` 之后仍调用 `applyMarkers()` + `fillShell()`（软跳自己换的 DOM，必须当场把搜索/个人卡/右栏迁回壳）。

随后 `notifyRoute()` 引发的那一次 `route:changed`：**不要**再 `scheduleRefresh`。

做法：软跳成功并 `fillShell` 之后记下本次 `spaSerial`。`scheduleRefresh` 若是 `route:changed` 触发、且当前 `spaSerial` 就是这笔软跳，则直接 return。`config:changed:skin`、`plugin:activated`、`plugin:disabled` 仍走完整 `refreshShell`。

### 2. 先画再广播

`navigateSpa` 顺序改为：

1. `commitRoute`（换主栏、改 title）
2. `applyHistory`
3. `applyMarkers` + `fillShell`
4. `finishProgress` + `scrollTo(0, 0)`
5. **下一帧**（`requestAnimationFrame`，无 rAF 则 `setTimeout(0)`）再 `notifyRoute()`

这样浏览器有机会先画出新列表，再让基座重解析快照、其它插件跟路由。假 `popstate` 仍要发，回位 / 已读置灰 / 实时流基线不能丢。

`spaIgnorePop` 仍包住这发 `popstate`，避免 `onSpaPop` 再走一轮 `navigateSpa`。

### 3. 实时流：换页只建基线

`route:changed` 改为只 `init()`，**不** `cycle()`。

刚软跳（或整页）换进来的列表就是当前 DOM，不必马上再拉一页。选主 `onPromote` 和定时器 `scheduleNext` 仍按原间隔 `cycle()`。

若当时没有定时器且本页应当巡检（`shouldPoll()`），`init()` 之后 `scheduleNext()`，不要立刻 `cycle()`。

### 4. `fillShell` 减负

- **工具区：** `collectTools()` 的结果缓存。只在 `plugin:activated` / `plugin:disabled` / 皮肤配置变更时作废。软跳后的 `fillShell` 用缓存，不每次 `LSB.info()`。
- **迁入：** 搜索、个人卡、主题钮、顶栏入口、右栏卡片若已经在壳里对应宿主中，保持现有「已在宿主则 return」的短路径，不要先 restore 再 adopt。

`locationText` 在软跳路径上本来就不走 `parse.topic`（软跳不进帖）。不借这轮改时间轴或帖内标题解析。

## 外形

用户可见交互不变：点版块 / 回首页仍软跳，顶栏进度条仍在，帖子仍整页开。不新增开关。

## 测试

现有壳内跳转用例（点帖不软跳、版块软跳、分页不软跳、精华软跳、关壳恢复整页）必须仍过。

新增：

- 软跳首页 → 版块：对该次导航，列表 URL 的 `fetch` 只有壳这一次（实时流不得在 `route:changed` 后立刻再 GET 同一 URL）。可用挂起/计数的 `fetch` 断言。
- 软跳成功后等到超过 50ms：`#lsb-shell` 仍是同一个节点（没有卸掉重建）；左栏个人卡仍在。
- 实时流：在列表页触发 `route:changed` 后，`init` 基线跟上新 `ul`，在 `tick` 之前 `fetch` 次数不增加。

## 版本

- `skin` `@version` = `manifest.version`：`1.1.43` → `1.1.44`
- `live-feed` `@version` = `manifest.version`：`1.2.12` → `1.2.13`
- 氧 `SUITE_VERSION`：`1.0.96` → `1.0.97`
- 氢不改
