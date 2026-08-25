# 饼铛壳设计

日期：2026-08-25  
范围：`linuxsb-base/plugins/skin.user.js`（界面精修）  
非目标：改 linux.sb 服务端、搬逛吧视觉、新独立插件、签到/屏蔽/自动载入功能。

## 问题

linux.sb 原生顶栏 + 右栏占掉扫帖和读帖的宽度。逛吧用「叠一层壳、藏原生铬、从 DOM 快照导航」换了界面，但视觉是 Discourse 玻璃雾。饼铛要同一套换壳方法，面貌自己定。

## 方法（学逛吧，不学外观）

1. 在 `body` 上叠 `#lsb-shell`（顶栏 + 左栏），不改帖子 HTML。
2. 给原生顶栏 / 右栏加 class 隐藏，不删节点；关掉即恢复。
3. 版块、最近浏览、搜索、签到入口从当前页 DOM / `api.forums` 快照，不写死版块表。
4. 不把签到卡整块拖进侧栏，不请求首页去克隆控件。搜索表单从原生顶栏**迁入**壳顶栏（同一表单，拆壳时迁回）。
5. 刷新主通道：`route:changed`、`topic:posts-added` + 短防抖。不把 `MutationObserver` 挂在整棵 `body` 上。

类名只用 `lsb-shell*` / `lsb-native-*` / 现有 `lsb-skin-*`。禁止 `discourse`。

## 饼铛面貌

系统字体、字重分层、一行一事。顶栏一层半透明结构层（`backdrop-filter`），左栏用更实的底（`--bg`），禁止玻璃叠玻璃、滚动雾、循环动画。配色继续走站点 CSS 变量，不抢主题脚本。

`prefers-reduced-motion: reduce`：壳内不做位移反馈，滚动用 `auto`。  
`prefers-reduced-transparency: reduce`：顶栏实底、关掉 blur。

窄屏（`<900px`）：不显示壳、不藏原生顶栏/右栏，避免把手机站切废。宽屏才进入壳布局。

## 结构

- **顶栏**：站名链回首页、迁入的搜索、当前位置（首页「全部主题」/ 版块名 / 帖标题）。
- **左栏**：全部主题、版块、最近浏览（有则显示）、签到（链到 `/daily_checkin` 或页内已有锚点）。底栏「设置」打开饼铛面板并切到本插件页。
- **帖内宽屏**：藏 `aside.sidebar`（不含移动端抽屉），右侧细时间轴：主帖 / 轨道 / 最新。点轨道按楼比例 `scrollIntoView`。无循环动画。
- **列表**：壳开启时标题 600 / 14px，meta 12px muted，头像 32px，藏 meta 内装饰 SVG。现有「紧凑」开关仍额外压 padding。

## 配置与生命周期

新开关 `shell`，默认开，文案「饼铛壳（左栏导航 + 顶栏）」。其余排版项不变。旧配置缺键时按 schema 默认开壳。

`config:changed:skin`：重读配置，开则刷新壳，关则拆掉并恢复原生节点。  
`api.onDispose`：拆壳、迁回搜索、去 html/body 标记、去样式。

注册 `api.ui.configTab`，便于底栏打开设置。

## 错误与降级

- 找不到顶栏/搜索/侧栏：该块跳过，不抛。
- 版块列表空：只留「全部主题」。
- 非帖子页不建时间轴。
- 不发站内 POST（搜索仍是用户提交原生表单）。

## 测试

`test/skin.test.js` + `fixtures/home.html` / `topic1.html`：默认有壳；关壳无壳；停用插件拆净；首页有版块/搜索/签到、无时间轴；帖页有时间轴；CSS 无 `discourse`、无 `animation: … infinite`；含 reduced-motion / reduced-transparency。现有排版用例继续过（关壳时样式可为空）。

## 版本

`skin` `@version` 与 `manifest.version` 同步为 `1.1.0`。套件 `SUITE_VERSION` 改为 `1.0.2`。不改基座 `0.1.5`。
