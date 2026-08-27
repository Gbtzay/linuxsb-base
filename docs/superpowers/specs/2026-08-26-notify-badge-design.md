# 「我的通知」角标

日期：2026-08-26  
范围：氢 `src/site.js` 增加通知页解析；未读哨兵顺路巡检并在左栏「我的通知」上画数字。  
非目标：顶下横幅、`api.ui.banner`、私信巡检、通知列表内插入、新 `ORDER` 模块、把标题角标改成站点通知数。

## 问题

氢壳把个人卡迁进左栏后，站点自己的未读数字不会跟着刷新。人要知道「有没有回我的」，只能整页重开通知页。

## 方法

未读哨兵 leader 本来就会 `GET /`。同一轮再 `GET /user/{uid}?tab=notifications`，解析 `li.notification-item.unread` 条数，画在「我的通知」链接旁。点击仍进站点通知页。访客 / 无 uid 不发这第二下。

标题角标继续只反映首页水位（消息箱），不和站点通知数相加。

## 外形

- 节点：`span.lsb-notify-badge`，贴在 `a[href*="tab=notifications"]` 里（壳内个人卡和原生侧栏都画）。
- 0 条：卸掉角标，不占位。
- 展示封顶 `9+`。
- 颜色跟站点 `--danger`。
- 若链上已有站点 `span.notification-unread`，先藏起来，避免双数字；停用哨兵时还原。

## 刷新与消数

- 数量写入 `api.store` 键 `notifyCount`，刷新后先画上次的数，等本轮巡检覆盖。
- leader 算完后 `api.tabs.post('notify', { count })`，follower 只画不请求。
- 打开通知页后，下一轮巡检拿到的列表若已无 `unread`，数字掉下去。

## 测试

- `parseNotifications`：活站结构（`li.notification-item.unread`，主题链进 `/topic/`，没有 id 的未读也计入）。
- 哨兵 leader 一轮请求含 `tab=notifications`；角标数字等于未读条数；标题仍是消息箱条数。
- 访客不请求通知页。
- 停用哨兵卸掉角标。

## 版本

氢 `0.1.31`。`unread-sentinel` `@version` = `manifest.version` = `1.0.8`。氧 `1.0.71`。
