# 顶下横幅通知设计

日期：2026-08-26  
范围：氢 `src/ui.js` / `src/core.js` 增加 `api.ui.banner` 与桌面通知入口；`src/site.js` 增加通知/私信解析；未读哨兵顺路巡检并驱动横幅。实时流列表内横幅保留。  
非目标：新 `ORDER` 模块；机会监控改横幅；把复制/签到等操作反馈改成横幅；RC 期间落地本功能（桌面权限框可另作补丁）。

## 问题

视线在列表中间，氢 toast 钉在右下角（还跟 H 按钮叠在一起），新动态容易漏。桌面通知默认关，且在定时器里调 `Notification.requestPermission()`，Chrome 不弹框。套件也不读站点「回你的」和私信。

## 方法

氢提供一条顶下横幅通道。外形是一条里最多三块可点芯片（私信 / 回复 / 新帖）。未读哨兵继续跨标签选主，每轮除首页外再读通知页和私信页，增量广播到各标签画横幅。实时流继续用列表里那条「点击加载」。操作反馈仍走 `api.ui.toast`。

## 外形与点击

贴在氢壳 `#lsb-shell-header` 或站点 `.top` 下面，横跨主列。空类不渲染、不留空位；三类都空则卸掉宿主。

| 块 | 何时出现 | 点下去 |
|---|---|---|
| 私信 | 巡检发现未读私信 | 该会话；没有单条链接则进收件箱 |
| 回复 | 巡检发现未读「回你的」 | `/notify/:id`；没有则 `?tab=notifications` |
| 新帖 | 首页水位上涨，且当前页**不是** home/forum | 回 `/` |

home/forum 的新帖只由实时流列表横幅负责，顶上不出现「新帖」块。桌面通知不受这层过滤：标签在后台时，三类增量只要有就发（含人正在首页但窗口已切走）。每张标签自己根据 `api.page.type` 决定要不要画出 `'list'` 块。

点过的那一类从本机横幅拿掉。站点上若仍未读，下一轮巡检再出现。

## API

权限 `ui`（哨兵已有）。

```
api.ui.banner.set(kind, { count, href })
api.ui.banner.clear(kind)
```

`kind` 为 `'pm' | 'reply' | 'list'`。`count` 展示封顶 `9+`。氢不解析站点 HTML。

桌面：`api.ui.notifyDesktop(title, body)`。仅当 `Notification.permission === 'granted'` 且 `document.hidden` 时构造。保存「桌面通知」为开的那次点击里调用 `requestPermission()`；巡检路径不得再要权限。拒绝后设置页留一句「浏览器拒绝了，到站点通知设置里打开」，巡检静默。

未读哨兵现有的发现 toast 改为走横幅，不再右下角报「N 个帖子有新动态」。实时流 `toastOnNew`、机会监控 toast、各自的 `notifyDesktop` 不在本范围。

## 数据流

仅 leader 每 `intervalMin`（默认 3 分钟）经 `api.net` 串行：

1. `GET /`（已有）→ 首页水位，供 `'list'`
2. `GET` 当前用户通知页 → `'reply'`
3. `GET` 私信页 → `'pm'`

通知/私信的 URL 与选择器实现前用活页做夹具，写入 `site.js`（`parseNotifications` / `parseMessages`）。本 spec 不锁选择器。访客或没有 uid：跳过 2、3。

水位键仍用哨兵 `store`：主题 `seen`；另增已见表 `notifySeen`、`pmSeen`。增量经已有跨标签通道广播 `{ pm, reply, list }`；每个 linux.sb 标签自己 `banner.set`。实时流不走这条广播。

## 错误

任一步失败：已有块不拆；失败的那一类保持上一轮；写入现有 `lastErr`；不弹 toast。两处顶栏都找不到：本轮不挂宿主。`new Notification` 抛错吞掉。

## 测试

夹具：`test/fixtures/` 增加通知页、私信页（活站抓取）。

- `site.js` 解析条数、id、href、标题。
- 横幅：只渲染有数的块；点掉一类；全空卸宿主；home/forum 无 `'list'` 块，topic 有。
- 哨兵：leader 一轮 3 个 GET 且走 `api.net`；follower 0 次；广播后另一标签出现同样的块；解析失败块仍在；访客跳过 2、3。
- `document.hidden === true` 才构造 `Notification`；配置保存且开关变为开时才 `requestPermission`；`cycle` 内不调用。
- 实时流列表横幅现有用例保持绿。

## 版本与时机

氢补丁号 +1（`core.js` / `package.json` 与 `@version` 对齐）。氧补丁号 +1。changelog 只写：顶下横幅覆盖私信/回复/别处新帖；桌面通知改为开关点击要权限。

GA 才合入。RC 若只修桌面权限框，不带横幅与额外 GET。
