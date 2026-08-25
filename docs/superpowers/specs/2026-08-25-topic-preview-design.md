# 主楼预览设计

日期：2026-08-25  
范围：`linuxsb-base/plugins/topic-preview.user.js`；套件版本。  
非目标：预拉列表、跨刷新缓存、浮窗回帖、照抄 lsb-preview 扩展（胶囊钮 / Shadow DOM / 独立 crop.js / postMessage）、改皮肤 SPA、改基座。

## 问题

列表没有正文。点进帖子是整页打开（讨论串靠整页脚本）。扫列表要先看帖、且讨论串得能挂上。拉 HTML 只渲主楼做不到这一点。站点允许同源 iframe 嵌帖。

## 方法

还是套件模块 `topic-preview`（显示名「主楼预览」）。外壳仍是饼铛的蒙层浮窗和标题旁「预览」按钮。卡身改为同源 iframe 嵌 `/topic/N`，`load` 后往 `contentDocument` 注入裁剪样式，藏顶栏/导航/侧栏/页脚/移动端抽屉，只留正文区。站点脚本在 iframe 里自己跑。

不搬 `lsb-preview` 的 UI 和通信协议。套件 `@noframes`，iframe 里不会再套饼铛壳。

## 出现位置

不设 `pages`。`api.sel.listItems` 挂按钮。`api.page.type` 为 `topic` 或 `user` 时不挂。`api.dom.each` 覆盖现有和实时流新条目。按钮幂等。

## 交互

- 按钮「预览」，`type="button"`，在 `.post-title-row` 标题锚点之后。`preventDefault` + `stopPropagation`。
- 同一时间一扇窗。点另一条则换 iframe 的 `src`，再出「加载中」。
- 浮窗：`.lsb-mask` + `#lsb-topic-preview`。卡头：列表标题（文本）+ 关闭。卡身：加载层 + iframe。卡底：「打开帖子」链到 `/topic/N`。
- 关闭：×、蒙层、Esc（含 iframe 内焦点：`contentWindow` 上监听）、`route:changed`、停用。
- 点标题：模块不监听，整页进帖。

## 数据流

1. 从标题 `href` 取帖号。
2. 立刻开窗，加载层显示「加载中」，iframe `src` 设为 `/topic/N`。
3. `load` 且 `src` 已是帖子 URL 时（忽略 about:blank 首次 load）：注入裁剪样式、绑 iframe Esc、收起加载层。
4. 不 `api.net.doc`、不消毒、不缓存主楼 HTML。权限仍要 `read`（`api.dom.each` 看列表）以及 `ui` / `events`。
5. 翻页等导致 iframe 再 `load`：裁剪再注一遍。

裁剪选择器：`.top`、`nav.forum-nav`、`aside.sidebar`、`aside.mobile-menu-drawer`、`footer.footer`、`.mobile-menu-backdrop`、`.mobile-menu-trigger`。`body { overflow-y: auto }`。样式节点 id `lsb-topic-preview-crop`。

## 错误

浮窗不关、不 toast。404 / 登录墙由站点页面在 iframe 里自己表现。

## 生命周期

`api.on('route:changed')` 关窗。`onDispose` 关窗、摘按钮、去样式。`api.handle('topic-preview:debug')`：按钮数、是否开窗、activeId、iframe src。类名只用 `lsb-topic-preview*`。不往 `#lsb-shell` 塞节点。禁止 `discourse`。

## 测试

`test/topic-preview.test.js`：

- 首页每条有「预览」；帖子页 / `/user/1` 没有。
- 点标题不开窗；点预览出现 iframe，`src` 含 `/topic/N`。
- 开窗先「加载中」；模拟 iframe `load` 后写入裁剪样式、加载层收起；卡底有打开帖子。
- 点另一条，iframe `src` 换成对应帖号。
- 新 `li.post-item` 也有按钮；停用后按钮和浮窗消失。

不测：真浏览器讨论串、站点错误页文案、扩展 UI。

## 版本

`topic-preview` `@version` 与 `manifest.version` 为 `1.1.0`。套件 `SUITE_VERSION` / `suite-center` 为 `1.0.20`。不改基座、不改皮肤。
