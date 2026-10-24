# 站点 v8.9.2：氢认路由、氢壳入口去重

日期：2026-09-04  
范围：`src/site.js`、`plugins/skin.user.js`、`plugins/live-feed.user.js`。氢 `0.1.36` → `0.1.37`；皮肤 `1.1.51` → `1.1.52`；实时流 `1.2.17` → `1.2.18`；氧 / LTS `1.0.107` → `1.0.108`。  
非目标：软跳扩到淘帖 / 认证 / 申精；改 `isSpaUrl`；`/topic/` 改软跳；左栏版块布局；夹具升到 v8.9.2；发 Release。

## 问题

线上 bbs1org 已到 v8.9.2。骨架没换，但多了淘帖、认证中心、申精，论坛导航里还有一条 `plugin-top-menu-link`「淘帖」。氢不认识这些路由，地点掉成「LINUX SB」；顶栏只收增强菜单，没有增强插件时「淘帖」进不了壳。实时流见着 `ul.post-list` 就挂，会误跟淘帖专辑列表。

## 方法

### 1. 氢认路由

`detectPage` / `ROUTES` 增加：

| 路径 | type | 字段 |
|---|---|---|
| `/topic_collections` | `collections` | `tab`：有 `?tab=` 用它，没有当 `mine` |
| `/topic_collection/:id` | `collection` | `id` |
| `/identity_center` | `identity` | — |
| `/topic_essence_review_list` | `essence_review` | — |

`/^\/topic\/(\d+)$/` 不变，不会误伤 `topic_collections`。`SEL` 不改。

### 2. 氢壳地点

`locationText`：

- 首页 `sort=post`（含裸 `/`）→ 新帖子
- `collections` + `mine` → 我的淘帖；其余 → 淘帖中心
- `collection` → 页标题，没有则「淘帖」
- `identity` → 认证中心
- `essence_review` → 申精

左栏 `{ href: '/', label: '全部主题' }` 不改名。

地点也可看 `location.pathname`，避免氢产物尚未跟上时仍显示「LINUX SB」。

### 3. 顶栏入口

`collectTopExtras` 先收 `a.forum-enhancements-custom-top-link`，再收 `a.plugin-top-menu-link`。按绝对 href 去重，同一地址留下增强菜单文案（「淘帖中心」优先于「淘帖」）。`我的*` 仍丢掉。这些链整页跳。

### 4. 实时流

列表模式只挂：`home` / `forum` / `featured` / `footprint` / 用户主题·回帖。淘帖、认证、申精、未知页不建基线、不巡检。

### 5. 软跳

`isSpaUrl` 不动。`/topic/` 仍整页。
