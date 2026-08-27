# 称号行情：全站浮层与打开时加速

日期：2026-08-27  
范围：`plugins/title-quotes.user.js` 增加全站浮层与右下角钮；浮层打开时选主巡检加快；氧面板 Tab 改回设置 +「打开浮层」。皮肤左栏「称号行情」改为 RPC 开浮层。插件 `1.0.10` → `1.0.11`；皮肤 `1.1.42` → `1.1.43`；氧 `SUITE_VERSION` / `suite-center` `1.0.84` → `1.0.85`。氢、`ORDER`、采集解析、大盘算法不动。  
非目标：新插件、新网址、`/gacha_market_buy`、成交 K、改交易页折叠内部的行情/大盘逻辑、把配置默认 30 秒改成 10、氢核心通用浮层宿主、新开浏览器窗口、后台不可见标签也写「在看」心跳。

本规格覆盖「分析大盘」规格里「氧面板 Tab 也画行情 | 大盘」这一条：图只出现在交易页折叠和本浮层。

## 问题

行情和大盘现在绑在 `/gacha_market` 折叠和氧面板里，逛帖时看不见。巡检默认 30 秒，看盘时不够快。面板 Tab 被图占满，间隔设置实际进不去。

## 方法

仍由 `title-quotes` 自己挂浮层，不进氢、不拆新插件。任意 `https://linux.sb/*` 顶层页（`@noframes`）可开同一套行情 | 大盘。交易页折叠保留，与浮层共用 `series`、同一套 `render`、同一组内存视图状态（`boardView` / `boardRarity` / `boardMove` / `rangeDays` / `focusKey`）。只开折叠、不开浮层时，间隔仍是配置值。

多标签仍只有选主页发 GET。打开时加速靠「在看」心跳，不靠一个会被别的标签关掉的全局布尔。

## 入口

三处都是打开或聚焦**本页**已有的那一块浮层，不跳转、不 `openPanel('title-quotes')`：

1. 右下角圆钮，文案 **行情**，`aria-label` / `title` 为 **称号行情**。类名 `.lsb-title-quotes-fab`。贴在氢 `.lsb-launcher`（H）**左侧**：`right: 62px`（16 + 38 + 8）、`bottom: 74px`、边长 38，与 H 同高。不挡住 H。未开过浮层时默认关着（`floatOpen` 缺省 `false`），只显示这颗钮。
2. 氢壳左栏工具「称号行情」。皮肤 `collectTools` 对该项改发 RPC，不再带 `panel: 'title-quotes'`。
3. 氧面板 Tab「称号行情」：自动配置表单（巡检间隔、保留天数）下方一颗主按钮 **打开浮层**。Tab 里不再画锚点、K、大盘。

插件 `active` 且顶层窗口才画钮。氢壳关着（`shell: false`）或皮肤停用：左栏没有入口，钮和面板按钮仍可用。

已打开时再点任一入口：浮层提到前面；若当时是收起成标题条，则展开。不切换成关闭。

## 浮层

类名 `.lsb-title-quotes-float`。页面内 `position: fixed` 面板，不是 `<dialog>`、不是新窗口。

- 标题栏文案 **称号行情**。可拖标题栏（点不到收起/关闭钮）移动。
- 右侧：**收起**（只留标题栏）和 **关闭**（×）。Esc：若氢设置面板（`.lsb-panel`）没开着，关闭浮层；氢面板开着时不抢 Esc。
- 点页面空白不关（无遮罩）。
- 右下角一条拖动手柄改大小。最小 **360×280**，最大不超过 `94vw` × `90vh`。默认 **480×520**，初次出现在右下、底边在钮上方（`bottom: 130px; right: 16px`），避免盖住 H 和行情钮。
- 实底：`background: var(--panel)`，不透明、不做毛玻璃、不跟皮肤墙纸走。
- `z-index: 99990`（高于帖文和氢壳 ~8000，低于悬停卡 99996、H/遮罩 99998、氢面板 99999）。钮与 H 同层 `99998`。
- 内容区就是现在的 `render`（无交易页那种 `<details>` 折叠）。收起只 `display:none` 内容区，不卸 DOM，展开不必重画。
- 窗口缩小后把面板夹回视口，保证标题栏仍能点到。

`api.store` 记住：

| 键 | 值 |
|---|---|
| `floatOpen` | 是否打开（含收起成标题条） |
| `floatCollapsed` | 是否只留标题条 |
| `floatRect` | `{ left, top, width, height }` CSS 像素 |

换页、软跳、刷新后按这三项还原。`boardView` 等视图状态仍只在内存，重挂载回到行情（与大盘规格一致）。

关闭后只剩右下角钮。`floatOpen === false`。

## 氧面板

`api.ui.tab({ render: 画图 })` 现在盖掉了注册时的配置表。仍用会随插件卸掉的 `api.ui.tab`（不要用 `configTab`：那一项不进 disposers，停用后按钮会指向已卸的 `openFloat`）。`render` 里先 `api.ui.buildForm` 画出间隔/保留天数，再追加主按钮 **打开浮层**（与 RPC 同一函数）。`LSB.open('title-quotes')` 仍进这一页，不再出现 `.lsb-title-quotes-anchors`。

## 皮肤

`collectTools` 里称号行情改为 `{ plugin: 'title-quotes', rpc: 'title-quotes:open', label: '称号行情' }`。`renderLinks`：有 `rpc` 的画 `button.lsb-shell-link[data-lsb-rpc]`，没有 `data-lsb-panel`。左栏点击：有 `data-lsb-rpc` 则 `api.request(该名)`，否则仍 `openPanel`。

其它工具入口不变。皮肤不声明 `requires.plugins['title-quotes']`（工具表本就按 `active` 过滤；RPC 走总线）。

## RPC 与刷新

`api.handle('title-quotes:open', openFloat)`。`openFloat`：挂载（若无）、`floatOpen=true`、取消收起、写心跳（本页可见时）、重排选主计时、`render` 内容区。幂等。

采集成功后的 `refreshViews`：除交易页嵌入外，若浮层开着则重绘内容区。

## 打开时 10 秒

常量：加速间隔 `WATCH_MS = 10000`；心跳 TTL `WATCH_TTL_MS = 15000`；心跳写入间隔 `WATCH_BEAT_MS = 5000`。

本页浮层打开（含收起成标题条）且 `document.visibilityState === 'visible'` 时：

- 立刻并每 5 秒把 `watchBeat = { t: Date.now(), id }` 写入本插件 store。`id` 为本标签会话随机串，不是选主 id（跟班页开着浮层也要写）。
- `api.tabs.post('watch', watchBeat)`。仅**选主**监听后按新 `pollMs()` 调用 `scheduleNext()`（跟班不排自己的 GET）。

不可见（切走、最小化、后台）：停心跳定时器，**不写** `watchBeat`，也不假装关闭。只留标题条仍算开着，但后台不续期。

本页关闭浮层：停心跳。若 store 里 `watchBeat.id` 仍是自己，把 `t` 置 `0` 并 `tabs.post`，以便立刻结束加速；否则不动别人的心跳。

`pollMs()`：

1. 配置间隔与现在相同：`max(250, intervalSec × 1000)`，缺省 30 秒。不改默认、不改下限。
2. 若 `watchBeat.t` 存在且 `now - t < 15000`：**采用 `min(WATCH_MS, 配置间隔)`**。配置已经 ≤10 秒时不被浮层拖慢；配置更慢时开着按 10 秒。
3. 过期或 `t === 0`：只用配置间隔。

只开交易页折叠、浮层全关：走配置间隔。交易页进页强制补采仍 `FORCE_DEBOUNCE_MS = 5000`，与心跳无关。仍只有 `election` 主页（及现有 `force`）发请求。

本标签打开浮层且自己是主：按新 `pollMs()` 重排下一轮，不额外立刻 GET。

## 停用

`onDispose`：卸 `.lsb-title-quotes-float` 和 `.lsb-title-quotes-fab`，清巡检/强制补采/心跳定时器。加速随心跳过期或置 0 结束。再启用按 `floatOpen` 决定是否自动打开。

## 结构

仍单文件。建议：

- `openFloat` / `closeFloat` / `mountChrome` / `applyRect`
- `writeWatchBeat` / `stopWatchBeat` / `watching()`（读 store TTL）
- `pollMs` 读 `watching()`
- debug 增补：`openFloat`、`closeFloat`、`watching`、`watchBeat`、浮层与钮的查询

不改 `pushSnap`、采集、`snapSig`、大盘纯函数。

## 错误

采集失败行为不变（toast 一轮、空状态文案）。RPC 在插件未激活时不会出现在左栏；其它调用方若打到未注册 handle，基座原样抛错，本插件不包一层。

## 版本

`title-quotes` `@version` = `manifest.version` = `1.0.11`。皮肤 `1.1.43`。套件 `1.0.85`。不改氢 `0.1.33`。

文档：`README.md` 称号行情一行改为含全站浮层；`docs/CONVENTIONS.md`、`docs/测试招募-氢氧-beta.md`、`docs/功能征集-rc-ga.md`、`docs/已知问题-rc.md` 氧版本提到 1.0.84 的改为 1.0.85。

## 测试

扩 `test/title-quotes.test.js` 与 `test/skin.test.js`（jsdom + debug handle）。至少：

- `title-quotes:open` 后出现 `.lsb-title-quotes-float`，内有行情 | 大盘
- 氧面板 `LSB.open('title-quotes')`：有间隔表单和「打开浮层」，无 `.lsb-title-quotes-anchors`
- 现有靠面板画图的用例改为对浮层或交易页嵌入断言（空状态、折线、K/折线切换、大盘切页、点榜回行情）
- 交易页折叠仍在、默认折起、不请求购买
- 打开且写入新鲜 `watchBeat` 时 `intervalMs() === 10000`（配置 30）；关掉并置 `t=0` 后回到 30000
- 配置已是 5 秒且心跳新鲜：`intervalMs() === 5000`（不被拉到 10 秒）
- 过期心跳不加速
- `document.hidden` 时调用写心跳的路径不更新 `t`（可见后再写）
- `LSB.disable('title-quotes')` 后钮和浮层不在
- 皮肤左栏「称号行情」是 `[data-lsb-rpc="title-quotes:open"]`，无 `[data-lsb-panel="title-quotes"]`；点击打开浮层，氢面板当前 Tab 不是「称号行情」

不测真站、不测拖拽像素、不提交购买。
