# LINUX.SB UI 设置与布局重构设计

日期：2026-10-05  
状态：设计已确认，真实 DOM 锚定补充后等待书面规格审阅
范围：统一设置中心、全局玻璃阅读画布、Surface/布局、正文卡片、媒体背景。

## 决策摘要

本轮把 UI 设置和布局作为一次架构级重构处理。首个交付同时覆盖四层：

1. 统一设置中心；
2. Surface 生命周期与响应式布局；
3. 首页、版块、帖子、用户和设置等内容的卡片化阅读界面；
4. 图片、视频、字体和可读性遮罩的媒体分层。

设置中心从工具胶囊直达，按“布局、外观、背景与字体、阅读”分组。插件配置面板不再提供第二套皮肤入口；AI 和其它插件的业务设置仍保留在各自插件中。

布局以自动适配为主。宽屏允许用户微调浮层的位置和尺寸；中屏把辅助内容变成底部 Sheet；窄屏使用单一全屏 Sheet。所有断点只使用 `wide (>=1100px)`、`mid (700–1099px)` 和 `narrow (<700px)`。

视觉材料采用全局玻璃化，但正文不直接暴露给背景纹理：玻璃壳层承载页面表面，可读性遮罩负责背景与文字之间的对比度，内容内层保持稳定的高对比度和阅读行宽。背景媒体永远位于内容底层，不能拦截点击或键盘输入。

## 目标与非目标

### 目标

- 用一个可发现的设置中心替换画布内外观入口和插件面板之间的重复配置。
- 把旧窗口布局和新画布 Surface 布局合并为一份版本化状态，消除 `mid`/`medium` 断点分叉。
- 让正文、楼层、列表、资料和设置都遵循相同的卡片材料、可读性和焦点规则。
- 让背景图片、视频和字体通过受控描述符工作；Blob 仍保存在 IndexedDB，不进入配置 JSON、日志或导出。
- 在解析、渲染、Surface、媒体或插件挂点失败时恢复原生页面，不留下半渲染画布。
- 保留现有站点端点、认证和 CSRF 语义；只重写本地 UI 状态边界和 Surface 生命周期。
- 每次修改 userscript 或其 manifest 都递增受影响版本并重建 Hydrogen/Oxygen/LTS 产物。

### 非目标

- 不在这一轮重写 linux.sb 服务端接口或站点 HTML 协议。
- 不把 AI、实时流、未读等插件的业务设置搬入皮肤设置中心。
- 不允许用户输入任意 CSS、脚本、事件属性或未经验证的 URL 来改变页面。
- 不以清空用户配置的方式规避迁移问题。
- 不在只读卡片稳定前接入新的写操作；写操作仍回到现有 ActionBroker/原生兼容链。

## 当前问题与边界

当前 `plugins/skin.user.js` 同时承担 manifest、旧配置迁移、CSS、画布状态、媒体背景、Surface、软跳、拖拽窗口和插件挂点，形成单体边界。它还保留旧 manifest 字段（颜色、URL、视频开关）与 `canvas-state:v2` 两套设置入口。

`src/shell-canvas.js` 以 `wide/mid/narrow` 保存画布状态，而 `src/shell-layout.js` 以 `wide/medium/narrow` 保存旧窗口布局；两者可能对同一屏宽生成不同的持久化键和恢复结果。当前 Surface DOM、样式和事件也仍由皮肤脚本内联管理，难以在不触碰站点原生节点的情况下测试。

重构因此采用模块化 Reader UI 层。`plugins/skin.user.js` 最终只保留 manifest、bootstrap 和兼容注册；设置、材料令牌、Surface、布局和内容 renderer 由独立模块提供。因为 Read Model 和 Reader Runtime 尚未全部落地，实施顺序必须先完成它们的只读前置，再接入本设计的可见 UI 层。

## 架构方案与选择

### 方案 A：继续扩展单体皮肤

在 `plugins/skin.user.js` 内增加设置分组、更多 CSS 和布局分支。改动初期较快，但会继续保留两套状态、旧窗口 API、站点 DOM 依赖和难以隔离的回退路径。放弃。

### 方案 B：一次替换所有可见 UI

直接删除现有可见壳并同时切换所有路由、卡片和 Surface。结构最整齐，但一旦某个路由适配器或插件挂点失败，整站缺乏安全的过渡和原生回退。放弃。

### 方案 C：双轨 Reader UI 模块化迁移（采用）

先由 Read Model/Reader Runtime 解析并验证页面，再由独立的 CardRenderer、AppearanceController、LayoutController 和 SurfaceHost 生成新 UI。新树通过原子提交接管；未知路由、模型失败、渲染异常和不兼容插件保留原生页面。皮肤脚本只负责启动和 compatibility facade。这套方案与已经确认的双轨绞杀式运行时、只读优先和安全回退相容。

## 设置中心与状态模型

### 入口和信息架构

工具胶囊、顶部更多菜单和站点快捷入口都指向同一个 `settings-center` Surface。设置中心包含四个主分组：

- **布局**：阅读列宽、卡片密度、宽屏浮层位置/尺寸、恢复当前布局和恢复全部布局。
- **外观**：平衡玻璃、沉浸玻璃、静态可读等预设；圆角、字号、透明度、模糊和动效策略。
- **背景与字体**：原站背景、静态图片、视频、本地资源、字体选项和失败回退状态。
- **阅读**：正文排版、代码块、楼层分隔、减少动态、减少透明度和可读性遮罩强度。

设置中心不要求用户输入颜色编号或 CSS。颜色使用色板/原生 color input，尺寸使用有单位的滑杆或选项卡，字体使用受限选择列表。本地文件通过文件选择器进入 IndexedDB；高级 URL 选项显示校验结果和安全协议提示。

修改即时预览并自动保存。每次修改生成一条短暂的撤销记录，用户可撤销本次修改或恢复默认；保存失败只显示脱敏状态，不把存储异常原文写进页面。

### 已确认的 A2 设置交互

设置中心采用 **A2：底部 Sheet**，并合并 A2-2 与 A2-3：

- 首层是连续列表总览，显示“布局、外观、背景与字体、阅读”四组的当前摘要和进入箭头；用户可以一眼检查状态，不必先打开多个面板。
- 点击分组进入两步详情页，顶部提供返回设置中心的路径；详情页才显示滑杆、色板、字体、媒体选择、可读性预览和恢复默认操作。
- wide 屏底部 Sheet 居中且有最大阅读宽度，mid 屏底部吸附并避开安全区，narrow 屏接近全屏但保留拖拽指示条、标题和返回路径。三档只改变几何，不改变信息架构。
- 总览行、返回、关闭和主要操作保持至少 44px 触摸热区；详情修改即时预览并自动保存，返回总览时保留焦点和滚动位置。

### 统一状态

统一状态使用新的版本号，例如：

```text
CanvasSettings {
  version,
  enabled,
  appearance: AppearanceTokens,
  background: MediaDescriptor,
  reading: ReadingPreferences,
  layout: { wide: { surfaces }, mid: { sheets }, narrow: { fullscreen } },
  legacySnapshot,
}
```

`wide/mid/narrow` 是唯一断点键。中屏和窄屏的几何由规则计算，用户只保存可访问性、排序和打开状态；宽屏可保存浮层的已校验位置和尺寸。布局状态按 origin 和当前站点作用域隔离。

迁移顺序为：旧 manifest 字段 → 旧 canvas 状态 → 旧窗口布局 → 新语义状态。每一步都保留 `legacySnapshot`，迁移是幂等的；不完整、过期或非法值回落到安全默认值，不删除原始配置。

## 全局玻璃与卡片材料

所有可见 Surface 和正文卡片使用同一组语义令牌，至少包括：

- glass fill、边框、高光、阴影、模糊和饱和度；
- content background、scrim 和 panel fallback；
- primary/secondary/muted text、link、focus 和 accent；
- radius、density、readable measure 和 motion/transparency mode。

每个内容表面由三层组成：

1. **glass shell**：提供全局玻璃质感和边缘层次；
2. **readability scrim**：根据背景媒体和文字对比度计算遮罩，不接收指针事件；
3. **content inner**：承载正文、代码、表单和状态文字，保持稳定行宽、高对比度和可见焦点。

列表项目使用 `content-card`，帖子楼层使用 `post-card`，用户资料和设置分组使用相应的语义卡片。卡片由 DOM API 创建，正文来自 PageDocument/RichText AST，不直接执行原始 HTML。

滤镜不支持、用户启用 `prefers-reduced-transparency`、设备低性能或卡片密度过高时，令牌自动切换到实底/轻透明；DOM 语义、操作顺序和内容模型不变。

## Surface 与响应式布局

### SurfaceHost/SheetHost

`SurfaceHost` 管理 TopStatus、ToolCapsule、CardHost 和设置入口；`SheetHost` 管理导航、设置、站点、AI、引用和上下文卡片。Surface 统一经历 `hidden → opening → open → closing`，拥有 `aria-hidden`、焦点返回、Escape 关闭和可见标题。

路由切换只更新 TopStatus、计数和 Surface 状态，不重建可复用的导航节点。Surface 使用 route/surface ID，不根据站点 CSS 选择器寻找几何。

### 三档规则

- **wide (>=1100px)**：正文居中，辅助 Surface 可浮动；AI/站点/证据卡可拖动和缩放，保存经过边界校验的矩形。
- **mid (700–1099px)**：正文占据主要宽度；辅助 Surface 改为底部 Sheet，不能超出安全区或视口。
- **narrow (<700px)**：单一可滚动全屏 Sheet；触摸热区至少 44px，禁止依赖 hover 的操作。

窗口尺寸变化重新计算模式。宽屏保存的矩形迁移到新视口时重新 clamp；中窄屏不恢复过期的浮层几何。

## 真实站点 DOM 锚定与右侧栏映射

这套 UI 的几何和内容来源必须是站点当前存在的 DOM。玻璃壳、Sheet 和浮层只能包裹或搬运已解析的原生节点，不能用一个虚构的“当前上下文卡”替代站点右栏，也不能用重新拼接的摘要对象替代资料卡、帖子或站点信息卡。站点选择器继续只存在于 SiteAdapter；渲染层接收节点挂点和结构化模型，不再自行猜测站点布局。

真实 fixture 的基线测量如下，作为 wide/mid/narrow 的几何契约：

- 1440px 视口（浏览器内容区 1425px）时，`body > .top .bar` 和 `main.wrap` 都是 1200px；`.forum-main` 的左边缘为 149.5px，`aside.sidebar` 的左边缘为 1045.5px、宽度为 230px，中间间距为 24px。
- 860px 视口（内容区 845px）时，`.forum-layout` 仍保留 517px 的正文列、24px 间距和 230px 的原生右栏。这个断点可以把右栏转成 Sheet，但 Sheet 的内容仍来自同一个 `aside.sidebar`，不得改成另一个摘要数据源。
- 390px 视口（内容区 375px）时，原站把 `aside.sidebar` 改为单列：首页的 `home-mobile-sidebar` 将它放在正文之后，用户页的 `profile-mobile-sidebar` 将它放在正文之前，帖子页的右栏可能直接隐藏。三种情况都继续使用真实节点；没有节点时不生成空的替代栏。

挂点和来源固定为以下关系：

- 顶栏使用 `body > .top > .bar`；站点品牌、搜索和原生快捷入口都以此节点的实际布局为基准。资料卡的宽屏锚点必须与 `.forum-main` 的左边缘对齐，而不是与视口左边缘或一张概念卡对齐。
- 路由内容使用 `main.wrap > .home-shell.performance-render-root > .forum-layout`。正文容器是 `.forum-main > .main-panel`；首页/列表使用 `ul.post-list > li.post-item`，帖子页使用 `ul.topic-post-list > li.post-entry`（兼容旧版 `ul.post-list > li.post-entry`）。卡片化只改变材料和边框，不改变这些节点的语义顺序。
- 个人资料的唯一来源是 `aside.sidebar > .sidebar-card.user-card`。宽屏资料卡可通过 `[data-canvas-profile-slot]` 搬运到顶栏左侧，但必须搬运原节点、保存原父节点和相邻兄弟节点，并在销毁或原生回退时恢复；不能克隆一份资料卡造成链接、表单和未读状态分叉。
- 站点信息来源是同一个 `aside.sidebar` 的直接子节点 `.sidebar-card:not(.user-card)`，按原生顺序保留版块列表、快捷功能、邀请中心、每日热帖、签到、统计和 IP 等卡片。资料卡被顶栏接管时只排除这一张被搬运的 `.user-card`，其余卡片不得被归并成“上下文”摘要。

资料卡交互以真实节点为边界：wide 屏悬停只显示原生资料卡的预览层，点击箭头才锁定展开；mid/narrow 禁用 hover，使用明确的按钮打开。展开层用绝对定位锚定顶栏挂点，独立于文档流，因此 `.forum-main`、首个帖子节点和原生右栏的 `getBoundingClientRect()` 在展开前后必须保持不变。铃铛应复用资料卡中现有的通知链接（例如 `.user-links a[href*="/notify/"]` 或 `.notify-link`）；红点只绑定已读/未读状态，不创建第二个通知入口。

站点信息 Surface 在 wide 屏可以表现为右侧玻璃栏，在 mid/narrow 屏可以变成底部或全屏 Sheet，但 Sheet 内仍直接挂载上述原生 `.sidebar-card` 节点，保留原有链接、按钮、统计和动态更新。`MutationObserver` 只负责在软跳或异步加载后重新同步真实 `aside.sidebar`；找不到右栏、关键卡片或身份不一致时隐藏新 Surface 并保留原生页面回退，不显示虚构占位文本。

视觉验收必须同时检查选择器命中和几何不漂移：资料卡、站点信息卡、正文首卡的节点数量与原生 fixture 一致；wide 的资料卡左边缘等于正文列左边缘；资料卡展开不改变正文和帖子坐标；站点卡片的原生顺序、链接目标和可访问名称保持不变。任何一项失败都走原生回退，而不是以复制节点或静态 mock 数据补齐。

## 媒体分层与失败回退

背景图片/视频位于画布底层（`z-index: 0`、`pointer-events: none`），可读性遮罩同样不拦截输入。视频默认静音、循环、inline；减少动态、页面隐藏、切换路由或插件停用时暂停并释放资源。旧 object URL、FontFace 和播放器引用在替换或销毁时释放。

媒体只接受 HTTPS 或受控 IndexedDB 描述符，校验 MIME、大小、同源范围和资源类型。加载错误、超时或不支持时，先回退到静态/原站背景，再回退到实底；错误原因只以稳定状态码提供给 UI。

## 路由数据流与回退

```text
route transaction
  → RequestBroker / current document
  → SiteAdapter / PageDocument
  → model validator / RichText AST
  → CardRenderer
  → SurfaceHost + AppearanceController + LayoutController
  → atomic commit
```

事务序号、目标 href、AbortSignal 和 runtime 实例必须同时匹配。新树未通过模型、必需内容、焦点目标和媒体契约校验前，不隐藏原生页面；提交失败清理新节点、媒体、监听器、`aria-busy` 和滚动状态，恢复原生 outlet 与焦点。旧事务不能写入新路由的 DOM、标题、滚动、Surface 或存储。

未知路由、解析失败、未迁移插件或渲染异常走原生回退并发布脱敏诊断。写操作在本轮仍通过 ActionBroker/兼容层，UI 只显示可用能力，不在卡片内复制服务器提交逻辑。

## 测试与发布门

新增/调整测试覆盖：

- 设置分组、色板/滑杆/字体选择、即时预览、撤销、恢复默认和自动保存；
- 旧配置到新状态的幂等迁移、非法值清理和 origin 隔离；
- `wide/mid/narrow` 边界、宽屏浮层 clamp、Sheet 安全区、44px 触摸热区；
- 全局玻璃令牌、可读性遮罩、无滤镜/减少透明度降级和正文不被媒体覆盖；
- 图片/视频/字体失败回退、资源释放、软跳期间原生 UI 不闪现；
- 卡片 renderer 的模型隔离、富文本 AST 安全、焦点与 Escape 路径；
- 新 UI 失败时原生页面可恢复，旧事务不能污染新页面。

实施前置顺序为：Read Model → Reader Runtime → 本设计的 iOS 27 Surface。每个会改变 userscript 的推进都先递增受影响版本，再运行 focused tests、`npm test`、`npm run build`、`npm run verify:dist`、`npm run smoke:ios27` 和浏览器 smoke；当前皮肤线从 `2.0.1` 递增，Surface 阶段目标为 `2.2.0`，中间推进使用下一个合法版本。

## 风险与控制

- **状态分叉**：只允许新的 `CanvasSettings` 作为写入口；旧字段只读迁移并保留快照。
- **玻璃影响可读性**：遮罩与内容内层强制对比度，偏好/能力检测触发实底降级。
- **站点 HTML 变化**：选择器只存在于 SiteAdapter；模型错误立即原生回退。
- **旧插件依赖 DOM**：compatibility facade 只提供明确挂点；不兼容模块留在原生回退路由。
- **软跳竞态**：事务序号、取消信号和原子提交共同隔离迟到结果。
- **媒体泄漏**：IndexedDB 描述符、object URL、FontFace 和播放器都有替换/停用清理路径。
- **版本混用**：每次 userscript 推进同步 header、manifest、依赖和生成产物，失败 gate 不发布新套件。
