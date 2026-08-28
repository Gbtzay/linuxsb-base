# 「我的通知」角标

日期：2026-08-26  
范围：未读哨兵从首页个人卡抄原生红点，画在左栏「我的通知」上。  
非目标：顶下横幅、`api.ui.banner`、私信巡检、通知列表内插入、新 `ORDER` 模块、把标题角标改成站点通知数、后台 `GET ?tab=notifications`。

## 问题

氢壳把个人卡迁进左栏后，站点自己的未读数字不会跟着刷新。人要知道「有没有回我的」，只能整页重开通知页。站点把打开通知页当成已读，后台再 GET 通知页会把未读清掉。

## 方法

未读哨兵 leader 只 `GET /`，从首页个人卡 `a[href*="tab=notifications"]` 上的原生 `.notify-badge` 抄数字。访客 / 无 uid 不画。不请求 `/user/{uid}?tab=notifications`。

标题角标继续只反映首页水位（消息箱），不和站点通知数相加。屏蔽设置上的 `.home-keyword-filter-count` 不是通知未读。

## 外形

- 节点：站点原生 `span.notify-badge`。活页没有原生点时补一颗，带 `data-lsb-notify`，方便停用时卸掉。
- 不再画可见的 `.lsb-notify-badge`（样式里 `display:none`）。
- 0 条：卸掉我们补的点；站点自己的点藏起来（`data-lsb-notify-hid`）。
- 展示封顶 `9+`。
- 个人卡上的 `.notification-unread` 浅色胶囊要卸掉，避免叠成白点。

## 刷新与消数

- 数量写入 `api.store` 键 `notifyCount`。
- leader 算完后 `api.tabs.post('notify', { count })`，follower 只画不请求。
- `countNativeNotify` 忽略 `[data-lsb-notify]` / `[data-lsb-notify-hid]`。个人卡在、但只有这些标记时返回 `null`，不把库存写成 0（软跳 / `route:changed` 会走到活页，活页上的点往往是哨兵补的）。
- 进自己的通知页（`page.type === 'user'` 且 `tab === 'notifications'` 且 `page.id === me.uid`）立刻 `applyNotify(0)`。这一页上的首页巡检结果和其它标签传来的 `notify` 都忽略，不能把点画回来。
- 离开通知页后再按活页个人卡或下一轮 `GET /` 抄。

## 测试

- 登录用户从首页个人卡抄红点；标题仍是消息箱条数。
- 访客不请求通知页。
- 停用哨兵卸掉补上的点。
- 进自己的通知页后红点立刻掉，不把库存再画回去。
- 软跳后不要把补上的红点当成原生 0。
- 人还在自己的通知页时，首页巡检 / 跨标签 `notify` 不能把红点画回来。

## 版本

氢 `0.1.33`。`unread-sentinel` `@version` = `manifest.version` = `1.0.17`。氧 `1.0.96`。
