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
│  core.js    注册表·生命周期·权限门·依赖拓扑·停用中止      │
│  bus.js     事件总线(通配/sticky) + RPC(request/handle)  │
│  site.js    站点适配：路由/DOM选择器/解析器（唯一知情人） │
│  net.js     全局限速串行队列·_csrf 注入·重试·URL/同源约束 │
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
- **最小权限**：插件在 manifest 里声明权限，越权调用直接抛错（见「权限模型」）；这是一层 API 约束，不是沙箱隔离。
- **故障隔离**：任何插件 setup 抛错 / 监听器抛错只影响自身，基座与其它插件照常。

Platform v2 在兼容旧 facade 的同时，把插件请求和站内动作收敛到能力上下文、`RequestBroker` 与 `ActionBroker`。
同源读取需要 `read`，同源非幂等请求需要 `write`，站外请求需要 `net`；写入确认使用单次 scope nonce 与幂等键，
结果未知时只允许调用提供方的只读检查。`api.runtime.context()` 只返回插件自己的 owner 与能力名，不暴露 CSRF、授权头或请求正文。

## 安装

1. 浏览器装 Tampermonkey；
2. 新建脚本，粘贴 `dist/linuxsb-base.user.js` 全部内容并保存；
3. 打开 linux.sb，右下角出现 `H` 圆钮即成功（面板里可看插件列表、日志与全局设置）。

### 方式 A：一键全家桶（推荐）

安装 `dist/linuxsb-base.user.js`（正式氢 · 不含 AI 专用 API）+ `dist/linuxsb-suite.user.js`（正式氧 · 内含
20 个非 AI 模块）。套件额外提供「套件总览」仪表盘：模块状态卡片、快捷启停、跨模块关键指标聚合。每个模块仍是独立注册的插件——可单独停用、各自配置页保留。

### 开发版构建

运行 `npm run build:dev` 会在独立的 `dist-dev/` 生成带「开发版」标记的 Hydrogen 与 Oxygen 两个脚本，包含完整 25 个模块、AI 专用基座 API 和 skin 的 AI 界面入口；该目录不生成 LTS。开发版仅用于本地开发和测试，不要与正式版氢/氧同时安装，也不要作为正式发布产物分发。

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
    requires: { base: '^0.2.2' }, // 基座 semver 范围；依赖别的插件写 plugins: { id: '^1.0.0' }
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

## 插件源码目录与套件收录

本表按完整源码套件列出功能。正式 Oxygen 收录其中 20 个非 AI 模块；`ai-summary`、`ai-copilot`、`ai-actions`、`ai-write-actions` 和 `ai-workbench` 仅进入本地开发 Oxygen，开发套件总计 25 个模块。单个插件源码仍可在开发环境按需安装。

| 脚本 | 功能 | 权限 |
|---|---|---|
| `resume-reading` | **断点续读**：记住每帖读到哪层，回来弹「接着看」，未读楼层标 NEW；面板含阅读历史与容量管理 | read/storage/ui/events |
| `read-mark` | **已读置灰**：看过的帖子在列表中整行变灰；未读仍用站点自己的标记，不再另挂角标；无限滚动新增条目同样生效 | read/storage/ui/events |
| `topic-marks` | **红包发卡**：列表左侧色条标出还活着的红包 / 发卡；结束态不画；关掉模块即关高亮 | read/ui/events |
| `home-return` | **首页回位**：首页点进帖子时记下位置；后退、点站名或「全部主题」等回到首页时滚回那条；成功一次后丢掉记录，刷新不再跳；不在第一页则继续加载直到找到 | read/storage/ui/events |
| `topic-preview` | **主楼预览**：列表标题旁「预览」按钮，点开蒙层浮窗用同源 iframe 嵌原帖并裁掉顶栏/侧栏/页脚；点标题仍整页进帖 | read/ui/events |
| `unread-sentinel` | **未读哨兵**：低频巡检首页新动态；跨标签心跳选主（只有一个标签发请求）；标题角标 + 桌面通知 + 消息箱；左栏「我的通知」红点抄个人卡，不打开通知页 | read/storage/ui/events |
| `live-feed` | **实时流**：免刷新获取新帖/新回复。同流序数判定（发布流看 id、回复流看时间戳）杜绝串台误报；**视口锚点补偿**让任意滚动位置都能无感插入；**写回复期间只暂存不打扰**，失焦/切回前台自动补上；老帖被顶起来时原地高亮而非重复插入（置灰行高亮期间拉回不透明并加左边线）；站点 AJAX 已插入的楼层不再复制到列表末尾（自己刚发出的回复也不会冲掉暂存的别人新楼）；帖子页回复顶到新页时当轮追补 | read/storage/ui/events |
| `perf-probe` | **性能探针**：本机记录氢壳软跳各段、实时流巡检、时间轴慢帧耗时；默认关；面板可复制 JSON | ui/storage/events |
| `checkin-calendar` | **签到日历**：自动探测每日状态、月视图 + 连击统计 + 一键签今天（原生无补签，历史自安装日起） | read/storage/ui/events/**write** |
| `points-ledger` | **积分趋势**：余额快照序列 → SVG 折线 + 每日增减清单；对外 RPC `points-ledger:series` | read/storage/ui/events |
| `title-quotes` | **称号行情数据源**：采集挂单高低与中位；交易页内嵌折叠行情、全场折线和各称号 K/折线；通过 `title-quotes:market-data` 与 `title-quotes:refresh` 向工作台提供只读快照，不再挂全局浮层或右下「行情」钮 | read/storage/ui/events |
| `title-forge-planner` | **UR 合成规划数据源**：只读读取 UR 配方、抽取概率、积分、库存与称号行情，保留正式刷新和计算 RPC；独立 UI 页签迁移到积分-称号工作台，不发送购买、抽取或合成请求；仅进入 Oxygen，不进入 LTS | read/storage/ui/events |
| `points-title-workbench` | **积分-称号工作台**：统一查看积分、称号行情和 UR 合成规划；入口合并为氢壳中的唯一「积分-称号」，支持缓存首屏、自动刷新、来源状态、两种库存模式和三类只读路线 | read/storage/ui/events |
| `forum-watch` | **机会监控**：监听指定版块新帖标题命中关键词即提醒；也可按列表上还活着的红包 / 发卡盯（默认关）；复用哨兵选主；「机会箱」面板 | read/storage/ui/events |
| `local-bridge` | **本地联动**（独立插件，本版氧不收录）：对接本机 workbench(7788)——浏览预热缓存、主楼一键触发 /api/analyze、健康监视与服务端摘要面板；RPC 供其它插件复用 | read/storage/ui/events/**net** |
| `data-migration` | **配置迁移**：全库数据导出/导入（JSON 文件/剪贴板），覆盖或合并模式；需要基座 ≥0.1.1 的 admin 权限 | read/storage/ui/events/**admin** |
| `my-archive` | **个人存档**：抓自己的全部主题/回帖本地累积（分页参数自动发现），导出 JSON/Markdown | read/storage/ui/events |
| `annual-report` | **年度报告**：聚合积分/签到/阅读/消息箱等 RPC 出图文报告，可导出 Markdown；模块缺失自动降级 | read/storage/ui/events |
| `skin` | **界面精修**：iOS 27 风格单一阅读画布，导航、站点信息、外观和上下文操作按需从顶部状态条/底部胶囊打开；AI 卡片与快捷入口仅存在于开发版；软跳等待响应时保留旧正文和单一氢壳，以顶部 3px 进度线反馈，成功后同步页面信息并聚焦/播报新正文，后退/前进恢复双轴滚动；帖子页默认软跳，用户可关闭，站点事务页和不支持路由仍走整页生命周期；原生侧栏留在原 DOM 并隐藏，不迁入氢壳。导航与 Sheet 使用统一 Liquid Glass 令牌，支持减少透明度/动效降级；外观提供 D 原生站点、A 平衡玻璃、B 沉浸视频、C 静态可读四种预设，透明度/模糊/字号/字体、HTTPS 或本地视频与字体仍可细调，不要求输入颜色编号；支持宽屏卡片拖动缩放和按站点/宽度保存布局；继续提供正文排版、列表密度、代码块和楼层分隔。 | ui/storage/events |
| `ai-summary`（仅开发版） | **AI 总结**：调用 OpenAI 或 Anthropic 端点总结全帖（实时采集 DOM，兼容无限滚动），三种风格提示词；主楼与回复共同受 `maxChars` 约束，按「风格×附加要求×模型×采集范围」分槽缓存，提供用户主动触发的连接自检、流式能力探测与 24 小时脱敏缓存，长请求不占用站内限速队列（默认 120s 超时） | read/storage/ui/events/**net** |
| `ai-copilot`（仅开发版） | **AI 帖子副驾**：依赖 `ai-summary`，在帖子页提供问答、结构化的观点分歧/方案对比、未解决问题追踪、指定楼层回复草稿和新回复摘要；工作台可查询当前已渲染主题列表，不翻页或抓取主题正文；跨主题检索先展示候选，用户最多选 3 篇并确认后才读取，已选主题和本人回帖可逐页深读；本人主题、收藏和回帖只在用户提出本人资料请求或明确选择对应来源时检索；为工作台生成受限的站内操作计划，互动/回复目标只从当前主题或用户选中的候选生成短期引用；回复计划一次只使用一个用户选择的目标，并只向模型提供该主题第一页或指定回帖的有预算上下文；写计划只响应用户直接、明确的请求，帖子正文仅作为不可信讨论材料；提供按页面范围和来源指纹缓存的只读历史摘要，摘要不含证据、引用或动作授权 | read/storage/ui/events |
| `ai-actions`（仅开发版） | **AI 站内动作**：登记固定目标的导航、站内搜索、列表筛选和打开已注册面板；用户明确请求“我的”页面时使用已登录身份导航；不提供任意 URL、DOM 选择器、请求体或写操作 | read/ui/events |
| `ai-write-actions`（仅开发版） | **AI 内容写入动作**：独立 write 权限，提供当前/已选主题或回帖回复、发帖、签到、点赞/取消点赞、收藏/取消收藏和投币；目标限当前主题或用户手动选中的主题/回帖；发送前重读并验证本站原生回复表单和目标，再次确认完整内容；回帖楼层只作草稿上下文，站点请求仍回复所属主题；只提交 `_csrf`、`topic_id`、`body`，明确失败、成功和未知分开处理；未知结果提供一次只读站点检查，不自动重放 | read/write/ui/events |
| `ai-workbench`（仅开发版） | **AI 工作台**：由单画布 AI 卡按需挂载 Gemini 风格欢迎态和统一消息流，底部 composer 支持自然语言判断帖子问答/分析、跨主题候选检索、追踪查询及受限站内操作；当前页面材料可取消或重新附加，脱离材料的请求不读取页面正文、列表、追踪项或引用；保留 M12 连续历史、停止/重试/流式回答和 M14 引用惰性复核；站内写操作继续经过动作计划、确认和结果检查链。 | read/storage/ui/events |
| `floor-stats` | 示例：楼层统计 + 只看TA，对外提供 RPC | read/storage/ui/events |
| `hot-floor-badge` | 示例：依赖 floor-stats 的高频发言标记 | read/storage/ui/events |

后续 AI 功能说明仅适用于开发 Hydrogen + Oxygen（`dist-dev/`）及源码开发环境；正式 Hydrogen、Oxygen 和 LTS 不包含这些 AI 模块或基座 AI API。

AI 总结注意：首次请求新域名时 Tampermonkey 会弹跨域确认；API Key 明文存在本机脚本存储里，公用电脑慎用。
成本可控性：`maxChars` 同时约束主楼与回复（主楼最多占一半份额），结果面板会显示实际送入字符数、
是否截断、是否包含主楼与耗时。分页视图（`?p=2`）里没有主楼时不会拿 #1 楼冒充，而是如实告知模型。
AI 帖子副驾复用 AI 总结的端点、Key 和模型设置；副驾本身不申请 `write` 或 `net` 权限。普通“回复草稿”仍需用户自行复制、修改和提交；对研究面板里手动选中的单个主题或回帖，若用户明确要求实际回复，工作台会先生成可审阅计划，确认后再由写动作插件二次确认发送。选中楼层只提供上下文，linux.sb 目前的回复表单只接收主题 ID，不支持将服务端回复精确指向某楼层。
当前界面精修版本为 **2.0.33**；称号行情数据源版本为 **1.0.19**，UR 合成规划版本为 **0.1.0**，积分-称号工作台版本为 **0.1.0**；AI 总结版本为 **1.4.0**，AI 帖子副驾版本为 **0.11.0**，AI 站内动作版本为 **0.1.1**，AI 工作台版本为 **0.8.1**，AI 写动作版本为 **0.1.4**，基座版本为 **0.2.5**，随 Oxygen **2.0.35** 构建。正式 Oxygen 与 LTS 不包含 AI 模块、AI 写动作；正式 skin 不包含 AI 卡片、快捷入口或事件桥接。完整 AI 集成仅在开发 Oxygen 中提供。LTS 也不包含称号行情数据源、UR 合成规划或积分-称号工作台。
开启氢壳后，顶部状态条和底部胶囊提供导航、站点信息、AI 和外观入口；AI 卡使用统一消息流和底部输入框，顶部更多菜单负责新建、切换、清空对话及低频处理方式。输入框支持 `Enter` 发送、`Shift+Enter` 换行，材料条的 `×` 只取消本次请求的页面材料，模型标签打开现有 AI 设置。能力默认由自然语言本地判断，模糊问题安全降级；窄屏自动切换为底部 Sheet 或全屏卡片。
连续追问使用当前对话中相同页面范围的最近三组已完成只读问答，历史不超过 4,000 字符且占用至多四分之一的上下文预算；新对话、主题或版块切换不会继承其它范围的背景。历史只帮助理解追问，引用仍从本次材料校验，旧写操作不构成新的授权。
超过三组后，更早的同范围只读轮次会先脱敏并压缩为最多 1,600 字符的背景摘要；每个会话最多保存三个范围、总计 16 KiB。摘要失败时退回本地脱敏摘录，停止、切换范围或关闭工作台会取消摘要请求；摘要不会成为证据、引用或站内写操作授权，站内写计划始终不携带对话背景。
M14 会把当前材料保存为稳定指纹；材料变化只会使旧回答缓存失效并保留旧版本。回答卡可按引用惰性复核，最多读取 40 条引用、8 个页面和 12,000 个字符，差异与楼层消失在本地渲染；复核不调用回答模型。工作台最多保留两版只读回答，复核、重生成失败或取消不会覆盖已有回答，站内计划、执行、重试和结果检查继续隔离历史与证据字段。
回答默认逐步显示，生成期间可以点击「停止生成」，取消网络和后续分页，立即恢复输入；新建/切换对话、页面切换和关闭工作台也会取消只读生成。失败或停止后可以手动重试原问题，迟到响应不会覆盖新请求。部分回答仅在当前页面展示，不保存为成功记录；实际站内写入继续使用原有结果检查机制。
流式支持 OpenAI Chat Completions 和 Anthropic Messages；规划仍使用完整 JSON。返回 JSON 的端点可直接使用，明确拒绝 stream 的端点在收到正文前最多降级一次；AI 总结设置中的「工作台流式回答」可手动关闭。生成中的文字按纯文本展示，完成后才启用安全 Markdown 和已验证的引用。
处理过程只显示本地能够核验的实际阶段、查询范围、校验结果和证据引用，不展示模型的私有推理。追踪查询意图限定为未解决、新证据、可能已解决、状态汇总和普通查询；遇到模型输出同义词或意图不匹配时，按用户请求在本地归一，无法判断时继续作为普通只读查询。最近 20 个对话、每个最多 10 轮，总量不超过 1 MiB；单条输入最多 500 字，历史只保留每条回答前 4,000 字，用户可随时清空。
「站内操作」可以用自然语言生成计划，也可以在模型不可用时从本地动作目录手动建立单步计划。只读动作包括站内导航、站内搜索、列表筛选和打开已注册面板；写动作首批支持回复当前帖子、发布新主题和签到，互动动作支持点赞、收藏和投币，必须由用户直接、明确要求。工作台先显示完整计划和拟提交正文，执行时写动作插件会再弹一次确认；取消不写入，刷新中断不会自动重放；站点返回明确失败时停止后续步骤，网络异常、5xx、HTML 或缺少 `ok` 的响应标为未知，可在短期内通过一次只读检查确认，检查不会重发写请求。写插件只申请站内 write 权限，不申请跨域 net 或 admin；LTS 不包含相关 AI 模块。
「当前页列表」查询仅读取首页、版块、搜索结果、精华、足迹及用户页中已经渲染的主题条目；最多将 40 条白名单字段交给回答模型，并与现有上下文共用字符预算。主题引用由本地主题 ID 校验后生成站内链接，查询不会翻页、请求列表主题正文或发送原始页面 URL。
「跨主题检索」先从固定数据源搜索并展示主题候选，不会自动读取候选正文。用户最多勾选 3 篇并点选确认后，工作台才读取所选主题的第一页；读取更多页面或改用标题、正文、回复字段都需用户手动选择。默认来源是站内搜索；只有用户提出本人主题/收藏的请求，或明确选择「我的主题 / 我的收藏」来源时，才访问个人主题或收藏列表。
副驾要求模型用 `[#N]` 标记依据，已采集的楼层会渲染为站内锚点；超出当前采集范围的引用只显示提示，不采信模型提供的外部链接。「新回复」模式监听当前主题的新楼层，使用本地待处理队列只摘要尚未处理的内容；模型失败或超时不会丢失队列。
讨论分析中的「观点分歧」和「方案对比」要求固定 Markdown 字段，分别呈现立场/理由/限制和方案/证据/适用条件；材料不足时明确标为未知或未验证。
「未解决问题」可以从完整问题块创建当前主题的问题追踪项。追踪页只重扫当前主题，实时新楼层先进入候选证据；模型只能给出待确认的状态建议，接受建议或手动确认后才改变状态，不做跨主题后台巡检，也不会自动回复。

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
`api.dom.each(selector, fn)`（现有+未来元素各回调一次，幂等）、`api.signal`（停用时自动 abort）、
`api.onDispose(fn)`、`api.log(...)`、
`api.routes`（URL 构造器）、`api.util`（esc/num/text/sleep/throttle/satisfies）。
`api.runtime.context()` 可用于诊断当前插件的能力范围；返回值不含凭据或页面正文。

## 权限模型

| 权限 | 授予的能力 | 默认 |
|---|---|---|
| `read` | 页面解析、站内 GET/HEAD | ✔ 默认授予 |
| `events` | 订阅/广播/RPC | ✔ |
| `storage` | 自己命名空间的存储 | ✔ |
| `ui` | toast/面板/注入按钮 | ✔ |
| `write` | **代表用户发帖回帖点赞收藏**，以及**任何站内非幂等请求**（POST/PUT/PATCH/DELETE） | ✘ 必须显式声明 |
| `net` | 跨域 HTTP(S) 请求（氢已声明 `@connect *`，首次访问新域名时 Tampermonkey 仍可能询问） | ✘ |
| `admin` | 全库导出/导入（仅迁移类工具应申请） | ✘ |

未声明即调用会**同步抛错**并在控制台给出清晰信息——这是刻意的：让权限缺失在开发期暴露，
而不是在用户浏览时静默失败或做出意外行为。

**`write` 覆盖 `net.raw` 的方法维度**：`api.net.raw()` 的权限判定按「去向 + 方法」双轴——
站外走 `net`，站内 GET/HEAD 走 `read`，**站内非幂等方法走 `write`**。
否则只声明 `read` 的插件可以 `net.raw('/reply_edit', { method:'POST' })`
绕开 `api.actions.*` 的权限门代替用户发言。

**非幂等请求默认不重试**：`raw()` 的 `retry` 默认值依方法而定（GET/HEAD 为 2，其余为 0）。
POST 自动重发会造成重复回复、重复签到这类无法撤销的副作用；需要重试的调用方必须显式传 `retry`。

**外部请求的边界**：`external:true` 只接受 HTTP(S) URL，拒绝用户信息和 fragment；站外请求优先走 `GM_xmlhttpRequest` 的匿名模式，不携带站点 Cookie。
`@connect *` 是为了支持用户自定义 LLM 或本地桥接端点，并不等于插件自动拥有出站权限：插件仍需声明 `net`，调用仍需显式标记 `external:true`。
API Key 只保存在油猴脚本存储中，不得写入日志、错误上报或诊断正文。

**生命周期边界**：插件通过 `api.net.*` 发起的请求默认绑定当前插件的 `api.signal`；插件停用、离开适用页面或基座关闭时，基座会 abort 在途请求，再执行插件的 `api.onDispose()` 清理。插件自行创建的 `fetch`、定时器、DOM 节点和第三方对象仍必须由插件自己收摊。

## 站点适配备忘（site.js 依据）

以下均经 linux.sb 实测快照核验（`test/fixtures/` 即真实页面）：

| 事实 | 值 |
|---|---|
| 程序 | 插件目标部署 `linux.sb` 当前实测 BBS1ORG **v99.0**；直接 `bbs1.org` 根站为独立公开实例 **v10.3**。两者均为 PHP 服务端渲染，无 JSON API（`/index.php?a=api` 404） |
| 路由 | `/topic/:id?p=` `/forum/:id?sort=&p=` `/user/:id?tab=` `/index.php?sort=` `/topic_featured` `/invite_center` `/gacha` `/gacha_market` `/community_wallet` |
| 写端点 | POST `/reply_edit` `/topic_favorite` `/lsb_like_coin` `/search` `/nb_editor_preview` … |
| CSRF | 每个表单的 `input[name="_csrf"]`（64 位 hex），Cookie 名 `bbs_csrf` |
| 登录态 | Cookie `bbs_auth`；页面内以抽屉「我的主页」链接最可靠 |
| 时间戳 | `span[data-performance-time]`（Unix 秒）；v8.7.5 帖内常只剩 `.post-time` 相对文案 |
| 楼层 | `li.post-entry#post-{id}`；主楼可能没有 `data-floor`，回复仍带；置顶副本 `.reply-pin-duplicate` 不算楼层 |
| 无限滚动 | 列表/帖子页原生无限加载。**插件禁止依赖启动快照的条数**：增量走 `dom:list-added` / `topic:posts-added`，URL 变化走 `route:changed`（基座轮询 + popstate 双保险，`api.page` 自动保持新鲜） |

**推断项（未经真实写操作验证，使用前请自行确认）**：
`likeCoin` 的投币数字段名（表单里只有 type/id，数量疑似由站点 JS 动态附加）；
`/daily_checkin` 的签到表单字段。

## 开发

> **规定**：所有新功能模块一律登记到 `suite/order.js` 的完整 `ORDER`（构建期强制校验）。正式 Oxygen 从中排除 5 个 AI 模块并收录 21 项；开发 Oxygen 使用完整 26 项 `ORDER`。每次推进插件行为、界面、权限、配置或对外协议，都必须同步提升该插件的 `@version` 与 manifest `version`，至少递增补丁号。详见 [`docs/CONVENTIONS.md`](docs/CONVENTIONS.md)。

```bash
npm i               # jsdom + esbuild
npm test            # 日常快速回归（基础、站点、导航与运行时壳原语）
npm run test:quick   # 与 npm test 相同的显式入口
npm run test:core    # 完整非 AI 文件回归
npm run test:all     # 完整回归，包含 AI
npm run test:ai      # 只跑 AI 测试
npm run test:live-feed # 实时流 + 已读专项回归
npm run test:skin    # skin + skin-canvas 壳回归
npm run build       # 正式 Hydrogen + 21 模块 Oxygen + 正式 LTS → dist/
npm run build:dev  # AI 完整 Hydrogen + 26 模块 Oxygen → dist-dev/；不构建开发版 LTS
npm run verify:dist # 校验正式版本、21 个模块、文档事实与正式产物
npm run verify:dev-dist # 校验开发版 AI API/插件/界面和双文件产物
npm run verify:profiles # 连续校验正式版与开发版产物
npm run smoke:ios27 # 只读运行 iOS 27 画布 UI 烟测并输出截图/DOM 证据
```

构建期强制校验（任一不过直接打包失败）：ORDER 与 `plugins/` 双向一致 ·
头部 `@version` 与 `manifest.version` 对齐 · `manifest.id` 与文件名对齐 ·
插件源码无 BOM/CRLF。`verify:dist` 校验正式 Oxygen 的 21 个模块与 AI 排除；`verify:dev-dist` 校验 `dist-dev/` 的 Hydrogen/Oxygen、完整 AI 功能和无 LTS。

测试策略：
默认 `npm test`（或 `npm run test:quick`）运行固定的日常快速回归，不会加载 `test/ai-*.test.js`，也不把实时流、完整 skin、构建与套件契约等重型文件混入每次反馈。
快速集合由 `scripts/run-tests.mjs` 明确列出，当前包含 181 个用例；本机最新实测约 10.6 秒。完整非 AI 文件回归使用
`npm run test:core`，AI 改动使用 `npm run test:ai`，实时流或已读改动优先使用 `npm run test:live-feed`，修改 skin/软跳时优先使用
`npm run test:skin`。发布前使用 `npm run test:all`，再执行构建、产物校验和浏览器冒烟；本机最新测得 `test:core` 为 673 个测试条目（621 通过、52 跳过）、约 137.6 秒，耗时随环境变化。本次同环境测得 `test:all` 为 962 个条目（910 通过、52 跳过）、约 237.9 秒；`test:ai` 为 289/289、约 139.9 秒；实时流专项为 45/45、约 12.8 秒；skin 专项为 226 个条目（174 通过、52 跳过）、约 94.8 秒。

- **site.test** 用抓取的真实 HTML 快照验证解析层（防站点改版静默失败——改版时这里最先红）；
- **bus/core/net.test** 验证通信、生命周期、权限门、限速与 CSRF；
- **e2e.test** 在 jsdom 里 eval 构建产物 + 两个示例插件，验证乱序握手、依赖等待、RPC 与 UI 真实生效；
- **hardening.test** 守两条底线：权限模型不被 `net.raw` 击穿、插件停用后不留后台活动
  （定时器/监听器/浮层/轮询循环全部收摊）。改动权限层或资源清理逻辑时这里最先红；
- **live-feed-v2.test** 装一层「虚拟布局」（给 jsdom 的 `getBoundingClientRect` 按序号×行高造位置），
  于是「在视线上方插入 N 条 → 观测条目位移」这一因果可被真实断言——锚点补偿是否生效有据可查，
  而不是只验函数被调用过；
- **suite.test** 以开发产物运行完整 Oxygen e2e，并复核完整 ORDER、版本号双处对齐、源码无 BOM/CRLF；
- **build-profiles.test** 对比正式与开发 Hydrogen/Oxygen 的运行期行为，确认正式版缺少 AI API、AI 插件和 skin AI 入口，开发版保留完整 AI；
- 两个分发校验器复核正式三文件与开发双文件；产物解析测试覆盖正式 Hydrogen/Oxygen/LTS 和开发 Hydrogen/Oxygen。
- **election.test** 用内存版跨标签总线直测选主协议，把 10s/30s 的窗口压到毫秒级。
  守「恰好一个 leader」这条不变式——0 个则三个巡检模块全停摆、≥2 个则请求翻倍通知重复。
  含双主强制冲突收敛、leader 掉线接管、在任者不被后来者挤掉等用例；
- **ai-summary.test** 守「花钱的功能不能悄悄失效」：预算封顶（含超长主楼）、
  缓存按风格/附加要求/模型/采集范围分槽、分页页不冒充主楼、长请求不占站内限速队列。

## 已知限制

1. **非沙箱**：依附脚本是普通油猴脚本，与基座同处页面 JS 环境，权限是「约定 + 抛错」而非硬隔离；恶意或被篡改的插件仍可直接访问页面上下文。只安装你信任来源的脚本。
2. `write` 类动作直接对站点生效，请遵守站点规则；基座只提供限速与 CSRF 正确性，不替你判断内容。
3. `@connect *` 无法表达精细域名白名单；当前依靠 `net` 权限、`external:true`、HTTP(S) URL 校验和匿名 GM 请求降低外发风险。需要更强隔离时，应拆分独立脚本并收窄其 `@connect`。
4. 站点升级可能导致 `site.js` 选择器失效——届时先复跑线上 DOM 审计，再跑一次 `npm test` 定位失配点。
