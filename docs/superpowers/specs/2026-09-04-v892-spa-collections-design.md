# 站点 v8.9.2：淘帖 / 申精软跳

日期：2026-09-04  
范围：`plugins/skin.user.js` `isSpaUrl`；`src/site.js` `SEL.listItems` / `parseListItem`。氢 `0.1.37` → `0.1.38`；皮肤 `1.1.52` → `1.1.53`；氧 / LTS `1.0.108` → `1.0.109`。  
非目标：认证中心软跳；淘帖详情 `/topic_collection/:id` 软跳；`/topic/:id` 软跳；夹具整页升到 v8.9.2；发 Release。

## 方法

软跳白名单增加 `/topic_collections`、`/topic_essence_review_list`。`/topic_collection/:id` 与 `/topic/:id` 一样整页，站点脚本才能挂详情。`/identity_center` 仍整页。

`SEL.listItems` 排除 `.topic-collections-collection-row`。`parseListItem` 遇到该类或标题指向 `/topic_collection/` 时返回 `null`，避免读标记 / 实时流把专辑当帖。实时流列表模式仍只挂首页 / 版块 / 精华 / 足迹 / 用户主题·回帖。
