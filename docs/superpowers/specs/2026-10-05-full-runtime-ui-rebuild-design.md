# LINUX.SB 全栈阅读运行时与 iOS 27 卡片画布重建设计

日期：2026-10-05  
状态：设计已确认，等待书面规格审阅  
范围：基座运行时、站点内容模型与渲染、皮肤画布、插件挂点、只读迁移与写操作适配。

## 决策摘要

本轮不是继续扩展现有三栏皮肤，而是建立新的客户端运行时。最终由新运行时负责路由、站点页面模型、内容渲染、卡片化画布、Surface 生命周期和能力安全链；现有站点服务器、端点路径和 CSRF 语义保持不变。

迁移采用双轨绞杀式路线。新运行时先以 shadow 模式解析当前页面，再渲染自己的只读页面；只有模型完整、渲染成功并通过提交校验后才隐藏原生页面。未知路由、解析失败、渲染异常或新运行时停用时保留并恢复原生页面。只读运行时稳定后，再逐项接入回复、发帖、收藏、点赞、投币、上传和签到等写操作。

用户可见的最终界面是全站卡片化阅读画布：首页、版块、帖子、用户、设置和社区功能页均由新 renderer 生成卡片；顶部状态条、底部工具胶囊、导航、外观、AI、站点信息和引用都复用统一 SurfaceHost。玻璃效果用于卡片表面、导航和 Sheet，正文文字保持可读，媒体背景不能遮挡或拦截内容。

## 目标与非目标

### 目标

1. 建立独立于站点原生布局的客户端运行时，覆盖当前站点路由目录，并为未迁移路由提供安全原生回退。
2. 先交付只读内容运行时，再用同一模型和 action adapter 接入写操作。
3. 把页面 HTML 转换为版本化、结构化、可测试的页面模型；renderer 不直接依赖站点选择器。
4. 用新的 Core v2、RequestBroker 和 ActionBroker 重写本地能力与安全链，保持服务器端点和 CSRF 协议不变。
5. 实现 iOS 27 风格的卡片化玻璃阅读画布、响应式 Sheet、可读背景媒体和统一外观控制。
6. 保留旧插件兼容 facade，使 AI、实时流、未读、统计等模块能够分批迁移，而不是在一次发布中全部失效。
7. 每个推进版本都显式递增受影响的 userscript 版本，并同步生成 Hydrogen、Oxygen 与 LTS 产物。

### 非目标

- 不修改 linux.sb 服务端接口、CSRF 字段语义、响应协议或认证方式。
- 不绕过基座权限、用户确认、幂等、防重复提交和写入结果检查。
- 不把不可信原始 HTML 直接作为新模板执行，也不允许模型文本声明已执行站内操作。
- 不通过第二套脚本或隐藏的后台脚本绕过现有油猴安装和停用模型。
- 不在只读阶段复制一套写入逻辑；写操作只通过明确的 action adapter 迁移。
- 不把本地视频、字体或图片 Blob 放进配置 JSON、localStorage、模型、日志或迁移导出。

## 当前架构问题

当前 `plugins/skin.user.js` 同时承担 manifest、配置迁移、CSS、画布状态、原生节点搬运、SPA 软跳、背景媒体、拖拽窗口、用户/站点卡、AI/插件挂点和停用清理，形成约 250 个函数的单文件边界。`src/site.js` 主要负责选择器解析，缺少供 renderer 使用的完整页面模型；`src/core.js` 与 `src/ui.js` 将插件能力、网络、原生 DOM 和旧壳窗口 API 绑定在一起。

重建不能继续在该单文件上增加 CSS 或页面分支。新实现必须把站点选择器、内容模型、渲染器、画布表面、能力安全和兼容层拆开，每层可以单独测试和回退。

## 总体架构

### 浏览器数据流

```text
用户点击站内 GET
  → RouteCoordinator 创建可取消事务
  → RequestBroker 获取当前或目标 HTML
  → SiteAdapter 解析为 PageDocument
  → ModelValidator 校验版本、路由和必需字段
  → PageRenderer 生成新内容树
  → SurfaceHost 同步导航/工具/卡片状态
  → 原子提交新 outlet
  → 隐藏原生页面并恢复焦点/滚动
```

任何阶段失败都进入 `fallback`：取消新树、恢复原生节点、撤销 `aria-busy`、恢复原滚动位置和焦点，并发布脱敏诊断。旧事务不能修改新事务的 DOM、地址栏、滚动、Surface 或存储。

### 代码边界

实施时按职责拆分为以下模块；具体文件名可以在实施计划中细化，但接口语义必须保持一致：

- **Platform v2**：能力声明、插件生命周期、RequestBroker、ActionBroker、存储、事件和 legacy facade。
- **Content model**：路由目录、PageDocument、列表/主题/用户/设置模型、RichText AST、模型校验。
- **Site adapters**：只包含 linux.sb 选择器和服务器 HTML 差异；不得创建 UI 节点或发起写操作。
- **Reader runtime**：RouteCoordinator、shadow 解析、renderer registry、native fallback、滚动/焦点和生命周期。
- **Renderers**：首页、版块、主题、用户、搜索、设置和社区功能页的结构化 renderer。
- **Surface runtime**：CardHost、SheetHost、TopStatus、ToolCapsule、AI/site/evidence/context surfaces。
- **Appearance/media**：语义令牌、A/B/C 预设、色板、字体、图片/视频 IndexedDB、可读性遮罩和降级。
- **Compatibility**：将旧 `shellAsideView`、`shellWindowRegister`、`shellScrollRoot`、`api.net` 和 `api.actions` 映射到新运行时，并记录 legacy 使用情况。

`plugins/skin.user.js` 在重建后只保留 manifest、bootstrap 和兼容注册；实现代码通过新的构建入口打包，避免再次形成不可拆分的单文件源代码。现有 Oxygen 单脚本安装方式保持不变。

## Core v2 与安全链

### 能力模型

插件 manifest 声明 capability，运行时为每个插件建立隔离的 `PluginContext`。能力包含 `read`、`write`、`net`、`storage`、`events`、`ui`、`admin` 等，但每次调用还必须带有短生命周期的 purpose/context。插件不能通过任意对象、原始 URL 或页面 HTML 获得额外能力。

### RequestBroker

所有网络读取和写入先归一化为 `RequestIntent`：

```text
RequestIntent {
  owner,
  purpose,
  origin,
  path,
  method,
  routeScope,
  sameOrigin,
  csrfMode,
  idempotency,
  signal,
  timeout,
  retryPolicy
}
```

RequestBroker 执行以下顺序：

1. 校验插件 capability、同源/跨域去向和允许的路由范围。
2. 对同源非幂等方法要求 `write` capability，并从当前快照或表单读取 CSRF；模型、日志和外部请求不携带 CSRF。
3. 统一处理取消、超时、限速、重试和响应分类。非幂等请求默认不自动重试。
4. 仅返回结构化响应或受控文本/文档；不把原始凭据、cookie、授权头和完整 URL 查询参数交给插件。
5. 记录固定字段 trace，错误只使用稳定 reason code，不把服务器原文直接显示为 UI 文案。

服务器端点、请求字段和 CSRF 语义保持现行协议；重写的是本地 broker、权限边界和生命周期。

### ActionBroker

站内写操作必须先构造 `ActionIntent`，其中包含 action id、用户可见摘要、短期目标 scope、当前路由指纹、确认 nonce 和幂等键。提交前再次验证目标仍在当前页面或由用户明确选中、CSRF 仍有效、参数符合本地白名单；提交后只读取结果确认，不因未知结果自动重放。

ActionBroker 统一覆盖回复、发帖、收藏、点赞、投币、附件、签到和设置保存。模型输出只能产生待审阅计划，不能产生已执行状态；写动作必须经过 UI 确认和本地 action registry。旧 `api.actions` 通过 facade 转为 ActionBroker 调用，旧插件可以迁移而不获得绕过能力。

### 威胁边界

- 页面 HTML、帖子正文、引用、搜索结果和模型文本均视为不可信输入。
- 富文本只允许结构化 AST 节点和固定协议链接；`javascript:`、事件属性、任意 style、外部表单动作和隐藏 iframe 被拒绝。
- 插件不能读取其它插件存储、CSRF 原文、cookie、完整 DOM 或未声明 capability。
- 诊断、历史和 trace 只保留白名单字段；敏感字段在进入内存持久化前脱敏。
- 路由切换、插件停用和用户停止会取消在途请求，迟到结果不能回写新页面或新会话。

## 页面模型与 SiteAdapter

### PageDocument

新 renderer 接收以下版本化信封，不直接接收站点节点：

```text
PageDocument {
  schemaVersion,
  route: { type, path, id, query },
  site: { origin, name, theme },
  viewer: { uid, guest, csrfPresent },
  capabilities: { canReply, canEdit, canFavorite, canPaginate },
  content,
  actions,
  provenance: { source, fetchedAt, requestId }
}
```

`viewer.csrfPresent` 只表达能力状态，不暴露 token。`actions` 只描述可用 action id、目标短 key、显示文案和参数 schema，不携带 cookie、CSRF、原始请求体或不可持久化目标。

### 内容族

- `ListPage`：首页、版块、搜索、精华、足迹、收藏集、用户主题/回帖等列表。
- `TopicPage`：主题信息、楼层、分页、引用、可用回复/收藏/互动能力。
- `UserPage`：用户资料、标签页、列表和分页。
- `SettingsPage`：分组字段、选项、校验提示和原生协议映射。
- `CommunityPage`：签到、消息、通知、钱包、称号/抽卡等社区页面的只读模型。
- `UnknownPage`：保留 route 与回退原因，只触发原生回退，不生成半成品 UI。

### RichText AST

正文、引用和描述统一为受限节点：`paragraph`、`heading`、`link`、`image`、`code`、`quote`、`list`、`listItem`、`lineBreak`、`emoji`。节点只携带已验证文本、同源/HTTPS 链接、尺寸和媒体描述；renderer 以 DOM API 创建节点，禁止把不可信 HTML 拼入 `innerHTML`。

### 首批适配器

第一批覆盖首页、版块、帖子、用户和搜索。适配器可从初始 document 或 broker 返回的 HTML 解析，输出相同 PageDocument；这保证首屏和软跳不使用两套规则。其余当前 `detectPage()` 已识别的社区/设置路由在扩展阶段加入，未知路径稳定走原生回退。

## Reader Runtime 与双轨切换

### 事务状态

RouteCoordinator 使用递增事务序号和显式阶段：`idle`、`shadow`、`fetching`、`parsing`、`rendering`、`committing`、`settled`、`fallback`、`cancelled`。每个异步回调必须同时验证事务序号、目标 href 和 runtime 实例身份。

### DOM 结构

新运行时在 body 下建立独立宿主：

```text
#lsb-reader-root
  #lsb-reader-surfaces
  #lsb-reader-scroll
    #lsb-reader-outlet
  #lsb-reader-fallback
```

初始页面先解析当前原生 outlet 形成模型，等待新树完成后再提交。软跳期间原生页面可见或处于受控隐藏状态，过渡层不能盖住正文造成整屏闪白；提交后保留可回退的原生节点快照，直到新路由稳定。

### 原子提交与回退

提交前验证模型路由、必需内容、页面标题、焦点目标和可用动作。提交操作一次性替换新 outlet 并同步标题、滚动和 Surface 状态；失败则移除新节点、恢复原生 outlet、清理 `aria-busy`、取消媒体和监听器。新 renderer 永远不替换原生表单节点，写操作迁移完成前由兼容层提供原生提交入口。

## 卡片化 iOS 27 视觉系统

### 层级

```text
背景媒体 z-index:0，pointer-events:none
可读性遮罩 z-index:1
阅读滚动面 z-index:2
正文/楼层/列表卡片 z-index:3
顶部状态与底部工具 z-index:20
Sheet、AI、引用、上下文卡片 z-index:30+
```

首页/版块每个主题为 `content-card`，帖子详情每个楼层为 `post-card`，用户资料/列表/设置分组使用对应卡片。卡片表面有可控透明度、细边框、内高光、阴影和圆角；正文文字位于高不透明度内容层，不能被视频纹理直接穿透。卡片密集、无 `backdrop-filter`、低性能或减少透明度时自动使用实底/轻透明。

### SurfaceHost

- `TopStatus`：品牌、当前路由、材料状态、返回和更多操作；路由切换只更新文本和状态，不重建节点。
- `ToolCapsule`：导航、AI、站点、外观和更多入口；固定在安全区内。
- `SheetHost`：导航、站点、外观和工具共享互斥主 Sheet；窄屏接近全屏，中屏底部吸附，宽屏居中/侧向浮层。
- `AICard`、`SiteCard`、`EvidenceCard`、`ContextPill`：作为当前 Surface 的子层，拥有独立焦点和关闭恢复逻辑。

所有 Surface 使用统一 `opening/open/closing/hidden` 状态、`aria-hidden`、焦点返回和 Escape 处理。插件只注册 Surface 描述和 renderer，不直接修改宿主几何。

### 响应式与无障碍

- `wide (>=1100px)`：居中阅读列，卡片可浮动，辅助卡片可拖动/缩放并保存布局。
- `mid (700-1099px)`：正文占据主要空间，辅助内容转为底部 Sheet。
- `narrow (<700px)`：单一可滚动全屏 Sheet，保留安全区和最小触摸热区。
- `prefers-reduced-motion`：关闭位移、弹簧、自动播放和非必要渐变。
- `prefers-reduced-transparency` 或不支持滤镜：关闭模糊并使用实底。
- 所有卡片和 Sheet 有可见标题、焦点环、键盘关闭/返回路径和 `aria-live` 状态。

### 外观模型

统一外观设置提供 A 平衡玻璃、B 沉浸视频、C 静态可读三个预设，并用色板、滑杆、字体选择、本地媒体选择和恢复默认控制细项。颜色、字号、圆角、透明度、模糊和 URL 在写入前经过 schema 校验；用户不需要输入 CSS 代码。

## 插件兼容与迁移

旧 `shellAsideView`、`shellWindowRegister`、`shellScrollRoot` 和设置面板 API 由 compatibility layer 映射到 SurfaceHost。旧插件依赖原生 DOM 时，在对应路由进入兼容观察模式；若其行为可能重复渲染或重复提交，该路由保留原生回退并在诊断中标记原因。

新挂点包括：

- `reader.route`：只读 PageDocument 和路由生命周期。
- `reader.context`：当前帖子/楼层/选中文本/引用快照的脱敏上下文。
- `surface.register`：卡片、Sheet、工具入口和焦点策略。
- `action.register`：经过 schema、权限和确认链的站内 action。

AI、实时流、未读、统计、画像、称号和其它模块先通过 facade 运行，再按模块迁移到新挂点。迁移时保留原有业务语义、缓存隔离、停止/取消、引用复核和结果检查。

## 迁移阶段与交付门

### P0：协议与威胁模型

冻结 PageDocument、RichText AST、RequestIntent、ActionIntent、回退状态和版本策略；建立路由覆盖表与插件迁移矩阵。此阶段不改变用户界面。

### P1：Platform v2

实现 Capability、PluginContext、RequestBroker、ActionBroker、存储/事件生命周期和 legacy facade。旧插件必须能在兼容层下通过现有全量测试，新增安全测试覆盖敏感字段、权限、取消、未知结果和重复提交。

### P2：Read Model

实现首页、版块、帖子、用户、搜索适配器、模型 validator、RichText AST 和 fixture。初始 document 与网络 HTML 必须生成同一模型；解析失败必须返回原生回退原因。

### P3：Reader Runtime

实现 shadow 解析、只读 renderer、原子提交、路由事务、单一滚动根和原生回退。首个用户可见交付在 P3 结束：首页、版块、帖子、用户和搜索可以由新 renderer 显示，写操作仍回到原生表单/兼容层。

### P4：iOS 27 Surface

实现卡片化正文、SurfaceHost、顶部状态、工具胶囊、Sheet、背景/字体媒体、A/B/C 外观、软跳连续画布和 wide/mid/narrow 降级。

### P5：扩展路由与写操作

依次接入其余只读社区/设置路由，再为回复、发帖、收藏、点赞、投币、上传、签到建立 action adapter。每类写操作都必须通过确认、scope 再验证、幂等键和结果检查单独验收。

### P6：插件迁移与 legacy 收口

迁移 AI、实时流、未读、统计、画像、称号等模块；清理重复 DOM 观察器和旧窗口挂点；旧 facade 保留一个明确的兼容期，达到迁移清单后再删除。任何未迁移模块仍可触发原生回退，不得静默失效。

## 版本策略

平台契约重写进入大版本迁移线：

- Hydrogen/base：`0.1.57 → 0.2.0`。
- skin/Reader：`1.1.75 → 2.0.0`。
- Oxygen/LTS：与新平台发布线同步进入 `2.0.0`。

每个实际推进 userscript 的提交都递增受影响模块的 `@version` 与 manifest version；改变 base API、skin renderer、插件挂点或套件成员时同步更新依赖、构建 banner、文档、测试断言和产物。legacy channel 保留旧 Hydrogen/Oxygen/LTS，直到 P6 迁移完成。

## 测试与验收

### Platform v2

- capability 与插件隔离；legacy facade 权限不扩大；停用清理监听、请求和存储。
- RequestBroker 同源/跨域、CSRF、超时、取消、限速、幂等和非幂等重试策略。
- ActionBroker 双重确认、scope 失效、未知结果只读检查和重复提交拦截。
- trace/日志脱敏，不出现 cookie、CSRF、授权头、完整敏感 URL 或模型凭据。

### Content model 与 renderer

- 当前 fixture 的五类首批页面生成稳定模型；route/schema 错误安全拒绝。
- 富文本 AST 去除脚本、事件属性、危险链接和任意 CSS；图片/视频失败有占位降级。
- 新旧 HTML 输入一致；模型版本升级有明确拒绝/迁移行为。
- renderer 原子提交、旧事务隔离、焦点/滚动恢复、失败回退和停用收摊。

### Visual/runtime browser

- 首页、版块、帖子、用户、搜索、设置和扩展路由覆盖 wide/mid/narrow。
- 卡片玻璃不遮正文；媒体层 `z-index:0`、`pointer-events:none`；视频失败退回静态/实底。
- 软跳期间导航节点身份保持，原生 UI 不闪现，旧正文不会被整屏白层覆盖。
- Sheet 互斥、焦点返回、键盘操作、触摸热区、减少动效/透明度和无滤镜降级。
- AI/实时流/未读/引用/写操作在新挂点下不重复触发，旧模块 facade 仍可回退。

### 每个阶段的交付验证

每个版本推进都运行对应 focused tests、全量 `npm test`、`npm run build`、`npm run verify:dist`，并在真实浏览器执行首页、版块、帖子、用户和设置的 wide/mid/narrow 流程。声明完成前必须读取退出码和最终统计；不以代码存在或单次截图替代行为验证。

## 风险与控制

- **站点 HTML 改版**：选择器只存在于 SiteAdapter；解析器版本化，异常立即原生回退。
- **旧插件依赖 DOM**：compatibility facade 与迁移矩阵控制范围，禁止在新 renderer 内复制隐式节点。
- **写操作重复或结果未知**：ActionBroker 使用 scope nonce、幂等键、单次 POST 和只读检查。
- **卡片玻璃性能**：密集列表、低性能设备和减少透明度设置自动使用实底；先测量再决定是否虚拟化。
- **路由/滚动竞态**：事务序号、AbortSignal、单一滚动根和提交前校验共同收敛迟到结果。
- **媒体泄漏**：IndexedDB 只保存资源记录，停用/替换时释放 object URL、FontFace 和播放器引用。
- **大版本迁移冲突**：legacy channel 保留旧产物，新的 facade 先兼容旧插件，再按清单移除。

