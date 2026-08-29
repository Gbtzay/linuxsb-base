# linuxsb-base — LINUX.SB 脚本基座

> 为 linux.sb（烧饼社区 / bbs1org v8.6.x–v8.7.5）编写的油猴脚本**基座**。
> 它自己不做业务功能，而是给其它依附脚本提供四样东西：
>
> 1. **站点接口** —— 页面识别、DOM 解析、CSRF、登录身份、语义化动作（回复/点赞…）
> 2. **脚本间通信** —— 事件总线、RPC、依赖解析、跨标签页广播
> 3. **公共设施** —— 按插件隔离的存储、限速网络出口、设置面板、toast、楼层按钮挂点
> 4. **秩序** —— 权限声明、错误隔离、启停管理、版本协商

---

## 架构

```
┌─────────────────────────────────────────────────────────┐
│ 依附脚本 A        依附脚本 B        依附脚本 C           │
│  (生产者)          (消费者,声明依赖)   (独立功能)           │
└──────┬────────────────┬──────────────────┬──────────────┘
       │  window.LSB.register(manifest, setup)             │
       ▼                ▼                  ▼              ← 基座未就绪时进 LSB_PLUGINS 队列
┌─────────────────────────────────────────────────────────┐
│ window.LSB（unsafeWindow，全站唯一实例）                  │
│                                                         │
│  core.js    注册表·生命周期·权限门·依赖拓扑               │
│  bus.js     事件总线(通配/sticky) + RPC(request/handle)  │
│  site.js    站点适配：路由/DOM选择器/解析器（唯一知情人） │
│  net.js     全局限速串行队列·_csrf 注入·重试·同源约束     │
│  store.js   ls b_base:<plugin>:key 命名空间存储          │
│  ui.js      设置面板·toast·确认框·楼层/顶栏挂点          │
│  dom.js     MutationObserver 收敛为事件 + onEach 幂等    │
│  channel.js BroadcastChannel 跨标签页                    │
│  election.js 跨标签选主：心跳 + id 仲裁，恰好一个 leader  │
└───────────────────────────┬─────────────────────────────┘
                            ▼
                 linux.sb（bbs1org，服务端渲染 HTML）
```

**设计原则**

- **站点知识单点化**：所有选择器/端点集中在 `src/site.js`。站点改版只改一个文件，依附插件零改动。
- **加载顺序无关**：插件可能先于基座执行 → 排进 `window.LSB_PLUGINS`，基座就绪后按依赖拓扑补激活。
- **最小权限**：插件在 manifest 里声明权限，越权调用直接抛错（见「权限模型」）。
- **故障隔离**：任何插件 setup 抛错 / 监听器抛错只影响自身，基座与其它插件照常。

## 安装

1. 浏览器装 Tampermonkey；
2. 新建脚本，粘贴 `dist/linuxsb-base.user.js` 全部内容并保存；
3. 打开 linux.sb，右下角出现 `H` 圆钮即成功（面板里可看插件列表、日志与全局设置）。

### 方式 A：一键全家桶（推荐）

安装 `dist/linuxsb-base.user.js`（氢 · 基座）+ `dist/linuxsb-suite.user.js`（氧 · 重型套件，内含
19 个模块）。套件额外提供「套件总览」仪表盘：模块状态卡片、快捷启停、跨模块关键指标聚合。每个模块仍是独立注册的插件——可单独停用、各自配置页保留。

只要一份脚本、精简功能：装 LINUX.SB（LTS）https://greasyfork.org/zh-CN/scripts/593319-linux-sb-lts 。与氢+氧二选一；请先卸掉氢和氧。LTS 冻新功能，只修站点断裂。


### 方式 B：按需单装

基座 + 只装你需要的 plugins/*.user.js。

## 写一个依附脚本（模板）

```js
// ==UserScript==
// @name         LSB·我的插件
// @match        https://linux.sb/*
// @grant        none
// @run-at       document-end
// @noframes
// ==/UserScript==
(function () {
  const manifest = {
    id: 'my-plugin',              // 全局唯一，存储/事件命名都基于它
    name: '我的插件',
    version: '1.0.0',
    description: '一句话说明',
    requires: { base: '^0.1.0' }, // 基座 semver 范围；依赖别的插件写 plugins: { id: '^1.0.0' }
    permissions: ['read', 'ui'],  // 见权限模型
    pages: ['topic'],             // 可选：只在帖子页激活（home/forum/user/topic/checkin/...）
    config: {                     // 可选：声明后自动生成设置页表单
      threshold: { type: 'number', label: '阈值', default: 5 },
    },
  }

  function setup(api) {
    api.log('启动于', api.page.type)
    api.on('topic:posts-added', (posts) => console.log('新楼层', posts.length))
    return {} // 返回值即 exports，被依赖方可通过 api.plugin('my-plugin') 读取
  }

  // ★ 标准引导：无论本脚本和基座谁先执行都能工作
  const w = typeof unsafeWindow !== 'undefined' ? unsafeWindow : window
  if (w.LSB?.register) w.LSB.register(manifest, setup)
  else (w.LSB_PLUGINS = w.LSB_PLUGINS || []).push({ manifest, setup })
})()
```

可运行的完整示例见 [`plugins/floor-stats.user.js`](plugins/floor-stats.user.js)（服务提供方）与
[`plugins/hot-floor-badge.user.js`](plugins/hot-floor-badge.user.js)（消费方，演示依赖 + RPC）。

## 官方插件套件（plugins/，均可直接安装）

| 脚本 | 功能 | 权限 |
|---|---|---|
| `resume-reading` | **断点续读**：记住每帖读到哪层，回来弹「接着看」，未读楼层标 NEW；面板含阅读历史与容量管理 | read/storage/ui/events |
| `read-mark` | **已读置灰**：看过的帖子在列表中整行变灰；未读仍用站点自己的标记，不再另挂角标；无限滚动新增条目同样生效 | read/storage/ui/events |
| `home-return` | **首页回位**：首页点进帖子时记下位置；后退、点站名或「全部主题」等回到首页时滚回那条；成功一次后丢掉记录，刷新不再跳；不在第一页则继续加载直到找到 | read/storage/ui/events |
| `hover-profile` | **用户画像悬浮卡**：悬停用户链接显示等级/积分/最近主题；TTL 缓存 + 失败负缓存，绝不重复请求 | read/storage/ui/events |
| `topic-preview` | **主楼预览**：列表标题旁「预览」按钮，点开蒙层浮窗用同源 iframe 嵌原帖并裁掉顶栏/侧栏/页脚；点标题仍整页进帖 | read/ui/events |
| `unread-sentinel` | **未读哨兵**：低频巡检首页新动态；跨标签心跳选主（只有一个标签发请求）；标题角标 + 桌面通知 + 消息箱；左栏「我的通知」红点抄个人卡，不打开通知页 | read/storage/ui/events |
| `live-feed` | **实时流**：免刷新获取新帖/新回复。同流序数判定（发布流看 id、回复流看时间戳）杜绝串台误报；**视口锚点补偿**让任意滚动位置都能无感插入；**写回复期间只暂存不打扰**，失焦/切回前台自动补上；老帖被顶起来时原地高亮而非重复插入（置灰行高亮期间拉回不透明并加左边线）；站点 AJAX 已插入的楼层不再复制到列表末尾（自己刚发出的回复也不会冲掉暂存的别人新楼）；帖子页回复顶到新页时当轮追补 | read/storage/ui/events |
| `perf-probe` | **性能探针**：本机记录氢壳软跳各段、实时流巡检、时间轴慢帧耗时；默认关；面板可复制 JSON | ui/storage/events |
| `checkin-calendar` | **签到日历**：自动探测每日状态、月视图 + 连击统计 + 一键签今天（原生无补签，历史自安装日起） | read/storage/ui/events/**write** |
| `points-ledger` | **积分趋势**：余额快照序列 → SVG 折线 + 每日增减清单；对外 RPC `points-ledger:series` | read/storage/ui/events |
| `title-quotes` | **称号行情**：采集挂单高低与中位；全场折线 + 各称号 K/折线；交易页折叠与全站浮层可切分析大盘；图可拖高、悬停详情竖排；氢壳开着走左栏，关壳才留右下「行情」钮；浮层打开时选主最多 10 秒一轮；氧面板为间隔设置 | read/storage/ui/events |
| `forum-watch` | **机会监控**：监听指定版块新帖标题命中关键词即提醒；复用哨兵选主机制；「机会箱」面板 | read/storage/ui/events |
| `local-bridge` | **本地联动**（独立插件，本版氧不收录）：对接本机 workbench(7788)——浏览预热缓存、主楼一键触发 /api/analyze、健康监视与服务端摘要面板；RPC 供其它插件复用 | read/storage/ui/events/**net** |
| `data-migration` | **配置迁移**：全库数据导出/导入（JSON 文件/剪贴板），覆盖或合并模式；需要基座 ≥0.1.1 的 admin 权限 | read/storage/ui/events/**admin** |
| `my-archive` | **个人存档**：抓自己的全部主题/回帖本地累积（分页参数自动发现），导出 JSON/Markdown | read/storage/ui/events |
| `annual-report` | **年度报告**：聚合积分/签到/阅读/消息箱等 RPC 出图文报告，可导出 Markdown；模块缺失自动降级 | read/storage/ui/events |
| `skin` | **界面精修**：氢壳（左栏导航 + 顶栏 + 个人卡迁入左栏 + 帖内时间轴，默认可关；氢面板开关 + 油猴图标菜单均可切换）与排版层——正文行高/中文字体栈、列表密度、代码块、楼层分隔 + OP 左边线高亮、宽屏限宽阅读；只动结构与排版，不碰配色。进帖子走整页，避免软跳剥脚本导致讨论串不出现。站点明暗切换钮迁入壳顶栏 | ui/storage/events |
| `ai-summary` | **AI 总结**：调用 OpenAI 兼容端点总结全帖（实时采集 DOM，兼容无限滚动），三种风格提示词；主楼与回复共同受 `maxChars` 约束，按「风格×附加要求×模型×采集范围」分槽缓存，长请求不占用站内限速队列（默认 120s 超时） | read/storage/ui/events/**net** |
| `floor-stats` | 示例：楼层统计 + 只看TA，对外提供 RPC | read/storage/ui/events |
| `hot-floor-badge` | 示例：依赖 floor-stats 的高频发言标记 | read/storage/ui/events |

AI 总结注意：首次请求新域名时 Tampermonkey 会弹跨域确认；API Key 明文存在本机脚本存储里，公用电脑慎用。
成本可控性：`maxChars` 同时约束主楼与回复（主楼最多占一半份额），结果面板会显示实际送入字符数、
是否截断、是否包含主楼与耗时。分页视图（`?p=2`）里没有主楼时不会拿 #1 楼冒充，而是如实告知模型。

## API 一览（`setup(api)` 的 `api`）

### 页面上下文（只读）

| 成员 | 说明 |
|---|---|
| `api.page` | `{ type:'topic', id, page }` / `{type:'forum'\|'user'\|'home'\|...}` |
| `api.me` | `{ guest, uid, name, group, points }`，取自「我的主页」链接（他人主页不会误判） |
| `api.forums` | `[{id,name}]` 全部版块 |
| `api.snapshot` | 启动时整页快照（含已解析的 topic/list/user 数据） |

### 解析器（纯函数，传 Document 即可用）

`api.parse.topic(doc)` / `parse.list(doc)` / `parse.post(li)` / `parse.user(doc)` /
`parse.notifications(doc)` / `parse.likeTargets(doc)` / `parse.detectPage(url)` — 输出结构化对象（id/标题/作者/时间戳/楼层数组…）。

### 网络与站点动作

| 成员 | 权限 | 说明 |
|---|---|---|
| `api.net.doc(path)` | read | GET 并解析为 Document；并发去重；自动续期 `_csrf` |
| `api.net.json(path)` | read | GET JSON |
| `api.net.raw(path,{external})` | read / **write** / net | 底层请求；站内非幂等方法需 `write`，跨域必须 `external:true` 且需 `net` |
| `api.net.pages(fn,N)` | read | 异步生成器逐页抓取 |
| `api.actions.reply(tid, body)` | write | 回复（自动带 CSRF） |
| `api.actions.likeCoin({type,id,coin})` | write | 点赞/投币 |
| `api.actions.toggleFavorite(tid)` | write | 收藏切换 |
| `api.actions.search(q, field)` | write | 站内搜索（POST /search），返回 Document |

所有**站内**请求经过**全局串行限速队列**（默认 ≥900ms/次，面板可调），多插件同时抓页面也不会触发站点限流。
**站外**请求（`external:true`）默认绕过该队列——限速的意义是保护 linux.sb，而一次 LLM 调用可能挂 60s+，
让它占住闸门会饿死其它插件的站内请求。需要排队的站外调用可显式传 `queue:true`；
`timeout` 也可按需放宽（默认 20s，`ai-summary` 用 120s）。

### 通信

```js
// 事件（支持通配 'topic:*'；emit 默认深拷贝 payload）
const off = api.on('topic:posts-added', fn)     // 自动清理
api.emitGlobal('my-plugin:scored', {...})       // 公共约定事件
api.emit('done', {...})                         // 私有事件 → plugin:my-plugin:done

// RPC：一对一能力调用
api.handle('my-plugin:summary', () => data)     // 提供方
const s = await api.request('my-plugin:summary')// 调用方（同名 handle 冲突会报错）

// 读依赖插件的返回值
const other = api.plugin('floor-stats')         // 必须先在 requires.plugins 声明

// 跨标签页
api.tabs.post('refresh', {}) ; api.tabs.on('refresh', fn)
```

内置公共事件：`site:ready`(sticky)、`route:changed`（无限滚动/软导航时 URL 变化，`api.page` 已同步刷新）、
`dom:changed`、`dom:posts-added`、`dom:list-added`、`topic:posts-added`(归一化的新楼层)、
`plugin:registered/activated/disabled/error`、`config:changed:<id>`。

### UI

| 成员 | 说明 |
|---|---|
| `api.ui.toast(msg,{type,title})` | 右下角提示 |
| `api.ui.confirm(msg)` | Promise<boolean> 确认框 |
| `api.ui.tab({name,render})` | 注册基座面板分页 |
| `api.ui.configTab()` | 按 manifest.config 自动生成设置表单 |
| `api.ui.style(css)` | 注入样式（幂等） |
| `api.ui.postAction(li,{label,onClick})` | 往楼层操作区加按钮 |
| `api.ui.openPanel(id)` | 打开氢设置面板（可指定插件分页） |
| `api.ui.topLink({label,onClick})` | 往顶栏加入口 |
| `api.ui.menuCommand(title, fn)` | 油猴扩展图标菜单；无 `GM_registerMenuCommand` 时为空操作，返回注销函数 |

样式沿用站点 CSS 变量（`--brand/--panel/--line…`），明暗主题自动跟随。

### 其它

`api.store.get/set/update/watch/clear`（键自动加插件前缀）、`api.config()/saveConfig(patch)`、
`api.dom.each(selector, fn)`（现有+未来元素各回调一次，幂等）、`api.onDispose(fn)`、`api.log(...)`、
`api.routes`（URL 构造器）、`api.util`（esc/num/text/sleep/throttle/satisfies）。

## 权限模型

| 权限 | 授予的能力 | 默认 |
|---|---|---|
| `read` | 页面解析、站内 GET/HEAD | ✔ 默认授予 |
| `events` | 订阅/广播/RPC | ✔ |
| `storage` | 自己命名空间的存储 | ✔ |
| `ui` | toast/面板/注入按钮 | ✔ |
| `write` | **代表用户发帖回帖点赞收藏**，以及**任何站内非幂等请求**（POST/PUT/PATCH/DELETE） | ✘ 必须显式声明 |
| `net` | 跨域请求（氢已声明 `@connect *`，首次访问新域名时 Tampermonkey 仍可能询问） | ✘ |
| `admin` | 全库导出/导入（仅迁移类工具应申请） | ✘ |

未声明即调用会**同步抛错**并在控制台给出清晰信息——这是刻意的：让权限缺失在开发期暴露，
而不是在用户浏览时静默失败或做出意外行为。

**`write` 覆盖 `net.raw` 的方法维度**：`api.net.raw()` 的权限判定按「去向 + 方法」双轴——
站外走 `net`，站内 GET/HEAD 走 `read`，**站内非幂等方法走 `write`**。
否则只声明 `read` 的插件可以 `net.raw('/reply_edit', { method:'POST' })`
绕开 `api.actions.*` 的权限门代替用户发言。

**非幂等请求默认不重试**：`raw()` 的 `retry` 默认值依方法而定（GET/HEAD 为 2，其余为 0）。
POST 自动重发会造成重复回复、重复签到这类无法撤销的副作用；需要重试的调用方必须显式传 `retry`。

## 站点适配备忘（site.js 依据）

以下均经 linux.sb 实测快照核验（`test/fixtures/` 即真实页面）：

| 事实 | 值 |
|---|---|
| 程序 | bbs1org v8.6.5–v8.7.5，PHP 服务端渲染，无 JSON API（`/index.php?a=api` 404） |
| 路由 | `/topic/:id?p=` `/forum/:id?sort=&p=` `/user/:id?tab=` `/index.php?sort=` `/topic_featured` `/invite_center` `/gacha` `/gacha_market` `/community_wallet` |
| 写端点 | POST `/reply_edit` `/topic_favorite` `/lsb_like_coin` `/search` `/nb_editor_preview` … |
| CSRF | 每个表单的 `input[name="_csrf"]`（64 位 hex），Cookie 名 `bbs_csrf` |
| 登录态 | Cookie `bbs_auth`；页面内以抽屉「我的主页」链接最可靠 |
| 时间戳 | `span[data-performance-time]`（Unix 秒）；v8.7.5 帖内常只剩 `.post-time` 相对文案 |
| 楼层 | `li.post-entry#post-{id}`；主楼可能没有 `data-floor`，回复仍带 |
| 无限滚动 | 列表/帖子页原生无限加载。**插件禁止依赖启动快照的条数**：增量走 `dom:list-added` / `topic:posts-added`，URL 变化走 `route:changed`（基座轮询 + popstate 双保险，`api.page` 自动保持新鲜） |

**推断项（未经真实写操作验证，使用前请自行确认）**：
`likeCoin` 的投币数字段名（表单里只有 type/id，数量疑似由站点 JS 动态附加）；
`/daily_checkin` 的签到表单字段。

## 开发

> **规定**：所有新功能模块一律归入套件（登记 `build-suite.mjs` 的 ORDER，构建期强制校验）。详见 [`docs/CONVENTIONS.md`](docs/CONVENTIONS.md)。

```bash
npm i            # jsdom + esbuild
npm test         # 408 用例 ≈ 36s（真实页面夹具 + e2e 加载 dist 产物 + 加固回归）
npm run build    # src/*.js → dist/linuxsb-base.user.js；plugins/* → dist/linuxsb-suite.user.js；精简集 → dist/linuxsb-lts.user.js
```

构建期强制校验（任一不过直接打包失败）：ORDER 与 `plugins/` 双向一致 ·
头部 `@version` 与 `manifest.version` 对齐 · `manifest.id` 与文件名对齐。

测试策略：
- **site.test** 用抓取的真实 HTML 快照验证解析层（防站点改版静默失败——改版时这里最先红）；
- **bus/core/net.test** 验证通信、生命周期、权限门、限速与 CSRF；
- **e2e.test** 在 jsdom 里 eval 构建产物 + 两个示例插件，验证乱序握手、依赖等待、RPC 与 UI 真实生效；
- **hardening.test** 守两条底线：权限模型不被 `net.raw` 击穿、插件停用后不留后台活动
  （定时器/监听器/浮层/轮询循环全部收摊）。改动权限层或资源清理逻辑时这里最先红；
- **live-feed-v2.test** 装一层「虚拟布局」（给 jsdom 的 `getBoundingClientRect` 按序号×行高造位置），
  于是「在视线上方插入 N 条 → 观测条目位移」这一因果可被真实断言——锚点补偿是否生效有据可查，
  而不是只验函数被调用过；
- **suite.test** 除了套件 e2e，还复核收录完整性、版本号双处对齐、源码无 BOM/CRLF，
  以及两个 dist 产物均可被解析（拼接式打包下，源文件的编码问题只在这里暴露）；
- **election.test** 用内存版跨标签总线直测选主协议，把 10s/30s 的窗口压到毫秒级。
  守「恰好一个 leader」这条不变式——0 个则三个巡检模块全停摆、≥2 个则请求翻倍通知重复。
  含双主强制冲突收敛、leader 掉线接管、在任者不被后来者挤掉等用例；
- **ai-summary.test** 守「花钱的功能不能悄悄失效」：预算封顶（含超长主楼）、
  缓存按风格/附加要求/模型/采集范围分槽、分页页不冒充主楼、长请求不占站内限速队列。

## 已知限制

1. **非沙箱**：依附脚本是普通油猴脚本，与基座同处页面 JS 环境，权限是「约定 + 抛错」而非硬隔离。
   只安装你信任来源的脚本。
2. `write` 类动作直接对站点生效，请遵守站点规则；基座只提供限速与 CSRF 正确性，不替你判断内容。
3. 站点升级（v9+/改版）可能导致 `site.js` 选择器失效——届时跑一次 `npm test` 即可精确定位失配点。
