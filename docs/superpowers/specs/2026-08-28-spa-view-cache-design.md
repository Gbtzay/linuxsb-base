# 氢壳软跳：主栏存档（离开时挪走，回来不再等 GET）

日期：2026-08-28  
范围：`plugins/skin.user.js` 软跳主栏 LRU；`plugins/live-feed.user.js` 在还回存档后立刻巡检一轮。氧补丁号 +1。  
非目标：改氢 API / `net.raw` 通用缓存、软跳进 `/topic/`、把邀请中心/排行榜改成软跳、后台 GET 整页换掉已存档的主栏、`PerformanceObserver`。

## 问题

探针显示点回首页时壳只要约 15ms，`spa.fetch` 要 0.7–1.7s（整页 HTML）。同一次页面生命周期里首页 → 版块 → 首页仍会再 GET `/`。整页打开邀请中心 / 排行榜再点首页，内存里没有首页 DOM，也只能 GET。

## 方法

皮肤按 `pathname + search` 记住最近 **5** 份主栏（LRU）。`/index.php` 与 `/` 视为同一路径键（search 仍区分）。只对现有 `isSpaUrl` 地址存、取。

离开可软跳列表、下一面已经能上屏时：把当前 `main` 子节点**挪进** `DocumentFragment`（不 `clone`）。点回来把片段搬回去，再 `fillShell`。个人卡仍在壳上，不进存档。

自己记 `spaViewKey`（屏幕上这份 DOM 对应的键）。点击软跳：用当前地址存、目标地址取。`popstate` 时地址栏已是目标，用 `spaViewKey` 存、新 `location` 取。

命中存档：**不等 GET**，不把后台 HTML 整页换进主栏。假 `popstate` 之后 `emitGlobal('spa:view-restored', { href, live })`。`live === true` 表示还回的是挪走的原节点。实时流听到后 `init()` 并立刻 `cycle()` 一轮补新帖（不论是否主标签；后续间隔仍只主标签）。离开首页后皮肤会按 30s 后台刷新 LRU 里的 `/`，见 `2026-08-28-home-stash-refresh-design.md`。实时流默认不走任何 HTML 缓存。

未命中：仍 GET，成功后再把离开页挪进存档并 `importNode` 新页（获取期间旧主栏留在屏幕上）。

当前页不是首页（键不是 `/`）且存档还没有 `/` 时，setup 后后台 `api.net.raw('/', { queue: false, retry: 0 })`，剥 script、藏原生侧栏，把主栏放进同一 LRU（`live: false`）。点首页若尚无活档则用这份种子。预取失败则行为与现在相同。用户已经在首页或已有 `/` 存档则不要写入。

无限滚动：壳自己藏过的分页条打 `data-lsb-shell-inf`。还回首页时即使仍有 `sb-infinite-scroll-pagination-hidden`，有该标记也要重新 bind。站点先藏分页、壳从未 bind 的，仍不重复拉页。

点击进新页 `scrollTo(0,0)`；浏览器后退还回存档时恢复当时的 `scrollY`。

关壳 / 停用皮肤时清空 LRU。

## 外形

点版块 / 回首页仍软跳。帖子、排行榜、邀请中心仍整页。不新增开关。命中存档时顶栏进度条可以几乎立刻走完。

## 测试

- 首页点版块再点站名回首页：回程不得再 GET `/`（不含 `?p=`）；离开前打在列表行上的标记仍是**同一节点**。
- 上述回首页后滚到底仍能拉 `?p=2`（存档还回后无限滚动要能重新 bind）。
- 首页 → 版块 → `history.back()`：回首页不得 GET `/`。
- 以非首页 URL 打开（如 `/invite_center` 套首页夹具），等预取后点站名回 `/`：对 `/` 的 GET 只有预取那一次。
- 实时流开着：存档还回后 `cycle` 条数增加（催巡检）。
- 现有壳内跳转与「站点已接手无限滚动则不重复拉」必须仍过。

## 版本

- `skin`：`1.1.45` → `1.1.46`
- `live-feed`：`1.2.14` → `1.2.15`
- 氧 `SUITE_VERSION` / `suite-center`：`1.0.98` → `1.0.99`
- 氢不改（`0.1.33`）
