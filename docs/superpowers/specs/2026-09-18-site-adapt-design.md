# 站点增量：红包 Tab、置顶回帖、私信/屏蔽、站务公告

日期：2026-09-18  
范围：`src/site.js`、`src/dom.js`、`plugins/skin.user.js`。氢 `0.1.40` → `0.1.41`；皮肤 `1.1.55` → `1.1.56`；氧 / LTS `1.0.111` → `1.0.112`。  
非目标：`/topic/` 软跳；私信 / 屏蔽名单 / 附件软跳；整份夹具换成现网 HTML；讨论红包单独色条；发 Release。

## 线上相对上次 v9.0 适配的差

- 页脚 / `index.css?v=v9.0` / `index.js?v=v9.0-topic-types-20260907-2` 未升主版本
- `plugins.js` / `plugins.css` 哈希变了；多 `reply_pin`、`direct_messages`
- 首页 sort tabs 增加 `/index.php?sort=red_packet`（红包）
- 列表红包常见 `.red-packet-title-status.is-discussion`「讨论红包」；发卡结束常见 `.virtual-card-title-status.finished`
- 帖内置顶回帖：主楼后插一份 `.reply-pin-duplicate`（`id="reply-pin-top-{id}"`，无 `data-floor`），原楼 `.reply-pin-original`
- 个人卡：我的附件 `?tab=attachments`；我的私信 `/direct_messages`；屏蔽名单 `/user_block`
- 侧栏多「站务公告」`.forum-enhancements-left-announcements`（开壳会藏原生侧栏）

## 方法

`detectPage` / `ROUTES` / `locationText` 认红包排序、私信、屏蔽名单；后两者整页打开，不改 `isSpaUrl`。`SEL.topicPosts` 与 `dom:posts-added` 排除 `.reply-pin-duplicate`。讨论红包仍 `marks.redPacket === 'live'`；发卡 `.finished` 当 ended。氢壳右栏迁入站务公告。`USER_TABS` 补 `attachments`（实时流仍只巡检主题/回帖 tab）。
