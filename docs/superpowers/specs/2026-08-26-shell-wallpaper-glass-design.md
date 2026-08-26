# 氢壳墙纸与液态玻璃设计

日期：2026-08-26  
范围：`plugins/skin.user.js`（界面精修）配置、CSS、设置页选图；IndexedDB 存压缩后的本地墙纸；必要时 `src/shell-boot.js` 在首屏用已保存的 URL 铺背景，避免闪底。套件 `SUITE_VERSION` / README 同步。  
非目标：新独立插件、视差滚动、位移贴图 / 折射动画、玻璃叠玻璃、主栏也做成玻璃、把图写进 `localStorage` / 配置迁移 JSON、改 `site.js`、改配色变量去抢主题脚本、循环动画、窄屏（&lt;900px）开壳。

## 问题

氢壳顶栏已有一层弱模糊，左栏 / 右栏是实底。用户要整页自定义墙纸，并从顶栏、左栏、右栏透出来，主栏帖子仍要能扫。

帖子在 html padding 里排版，不会钻到左栏底下。玻璃透的是墙纸，不是滚动的帖。

## 方法

仍在界面精修里做，默认关。没有墙纸时壳维持现在的面貌。

有墙纸时：

1. 视口铺一张固定墙纸（`cover` / 居中 / `fixed`）。
2. 主栏、`.forum-main`、`.home-shell`、楼层列表实底 `--panel`，不透墙纸。
3. 顶栏、左栏、右栏改成一层玻璃材料。左栏改为 `top: var(--lsb-shell-header)`，不再伸进顶栏下面，避免两层 `backdrop-filter` 叠在一起。
4. 本地图优先于 URL；两者都空则关玻璃、撤墙纸。

## 材料（玻璃）

只加在 `#lsb-shell-header`、`#lsb-shell-rail`、`#lsb-shell-aside`：

- 底：`color-mix(in srgb, var(--panel) 58%, transparent)`
- 滤镜：`backdrop-filter: blur(22px) saturate(160%)`（含 `-webkit-`）
- 边：`1px solid color-mix(in srgb, var(--text) 12%, transparent)`
- 高光：`inset 0 1px 0 color-mix(in srgb, var(--panel) 70%, #fff)`

配色继续用站点变量。禁止第二层模糊、滚动雾、`animation: … infinite`、discourse 类名。

## 配置

`skin` schema 增：

- `wallpaperUrl`：`text`，默认 `''`，文案「墙纸 URL」

本地图不进 schema。设置页在自动表单下用 `configTab` 的额外 `render` 挂：选文件、清除本地图、一句说明（本地优先于 URL；图只存在本机 IndexedDB）。

判定：

1. IndexedDB 有图 → 用本地图，开玻璃。
2. 否则 `wallpaperUrl` 非空 → CSS `background-image: url(...)`，开玻璃。
3. 否则关玻璃、无墙纸层。

开关不必另做：空 URL 且无本地图即关。

## 存储与压缩

IndexedDB：库名 `lsb_skin_wallpaper`，store `files`，键 `wallpaper`，值是 JPEG `Blob`。不进 `lsb_base:*`，配置迁移导出不含此图。换机只带走 URL。

选文件：

- `accept`：`image/jpeg,image/png,image/webp,image/gif`
- 原文件 &gt; 8MB：拒绝，toast，不写库
- `createImageBitmap` / `Image` 解码失败：拒绝，toast
- 画到 canvas，最长边 1920，另一边按比例；`toBlob('image/jpeg', 0.72)`
- 压缩失败：拒绝，toast
- 成功则写入 IndexedDB，revoke 上一张 object URL，换新的 `blob:` 铺背景

GIF 压成静帧 JPEG，不保留动画。

## 叠层与生命周期

状态类挂在 `html`：

- `lsb-skin-wallpaper-on`：已铺墙纸
- `lsb-skin-glass-on`：壳走玻璃材料（仅宽屏且壳开且有墙纸）

墙纸只铺在 `html.lsb-skin-wallpaper-on`：`background-image: var(--lsb-wallpaper)`，`background-size: cover`，`background-position: center`，`background-attachment: fixed`。URL 与 `blob:` 都写成 `--lsb-wallpaper: url("…")`，不另挂 DOM 节点。

`config:changed:skin`、开壳、关壳、停用插件：重算。关壳 / 停用 / dispose：去掉两个 class、去掉 html 背景和 CSS 变量、revoke object URL。IndexedDB 里的图保留，除非用户点「清除本地图」。

宽屏壳占位（`src/shell-boot.js`）：若壳开且 `skin.__config.wallpaperUrl` 非空，首屏给 html 写上该 URL 的背景，减少闪底。本地图仍等皮肤 setup 读 IndexedDB，允许先闪站点底。

## 错误与降级

- URL 图 `onerror`（用不可见 `Image` 探测，或背景加载失败时降级）：toast 一次，去掉玻璃 class，壳回实底；URL 留在配置里。
- IndexedDB 读失败：当没有本地图，走 URL 分支。
- `prefers-reduced-transparency: reduce`：不挂 `lsb-skin-glass-on`（实底、无 blur）；墙纸 class 可留。
- `prefers-reduced-motion: reduce`：墙纸固定，不加视差或位移。
- `&lt;900px`：不挂墙纸 / 玻璃 class（本来就无壳）。
- 主题脚本仍管明暗；玻璃只 mix `--panel` / `--text`。

## 测试

`test/skin.test.js`。现有「不是逛吧 Discourse 玻璃秀」继续过（无 `discourse`、无 `infinite` 动画、仍含 reduced-motion / reduced-transparency）。

新用例：

- 默认：无墙纸 class、无玻璃 class，顶栏/左栏 CSS 与现在同实底策略
- 只设 `wallpaperUrl`：有 `lsb-skin-wallpaper-on` 与 `lsb-skin-glass-on`；CSS 含该 URL、三块壳的 `backdrop-filter`；`main.wrap` / `.forum-main` 不含 `backdrop-filter`
- 玻璃开启时左栏 `top: var(--lsb-shell-header)`
- 本地图优先：测试注入假 Blob 后即使用本地，不把 URL 写上 html 背景
- 关壳、停用皮肤：class 与背景拆净
- 压缩：&gt;8MB 的假文件被拒；小 PNG 得到 `image/jpeg` 且最长边 ≤1920
- 导出备份的 JSON 字符串不含 JPEG 二进制

## 版本

`skin` `@version` 与 `manifest.version` 同号上调。`SUITE_VERSION` / `suite-center` 同号上调。壳占位若改了，氢 `src/core.js` 的 `VERSION` 与 `package.json` 同号上调。
