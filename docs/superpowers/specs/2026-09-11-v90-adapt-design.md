# 站点 v9.0：氢认广告路由、氢壳迁入广告卡

日期：2026-09-11  
范围：`src/site.js`、`plugins/skin.user.js`。氢 `0.1.38` → `0.1.39`；皮肤 `1.1.53` → `1.1.54`；氧 / LTS `1.0.109` → `1.0.110`。  
非目标：`/promotions` 软跳；`/topic/` 软跳；整份夹具换成 v9.0；申精 tab（站点已撤）；发 Release。

## 线上相对 8.9.2 的差

- 页脚 / `index.css?v=v9.0` / `index.js?v=v9.0-topic-types-20260907-2`
- 列表仍是 `ul.post-list > li.post-item`，帖内仍是 `li.post-item.post-entry`
- 工具条去掉申精；个人卡多「我的广告」`/promotions`；侧栏多 `.sidebar-promotions-card`
- 标题旁多 `.red-packet-title-status`、`.virtual-card-title-status`

## 方法

`detectPage` / `ROUTES` / `locationText` 认 `/promotions` → 「我的广告」，整页打开。氢壳 `pickAsideCards` 把 `.sidebar-promotions-card` 迁入右栏（开壳会藏原生侧栏，不迁等于广告消失）。`parseListItem.badges` 兼收红包 / 发卡状态。不改 `isSpaUrl`。
