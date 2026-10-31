# skin 源码入口与维护边界

前二十四步已提取画布状态、样式生成、媒体控制器、插件目录、原生搜索、导航信息、正文接管、历史生命周期、资料卡、单画布站点卡片、双模式在线状态、旧三栏右侧栏卡片/页签、配置适配、SPA 文档/视图缓存/导航事务、首页无限滚动、原生正文增强、资源设置/油猴菜单、顶栏入口/原生外观控件、帖子时间轴、文本选择/上下文操作胶囊、画布外观交互、浮层布局/拖拽缩放、画布滚动/窗口监听、共享窗口兼容实现、画布宿主/面板/通用事件及入口生命周期/清理。构建、模块测试与独立插件共用这些源码，旧章节参考副本已移除；模块装配、公共控制器注册、旧三栏渲染与必要的视图/路由适配保存在模板中。

第 25 阶段已完成集中验收与文档收尾，既定路线剩余 **0** 个阶段。当前边界为 **29 个显式模块 + 1110 行装配模板**；验证证据和限制见 [最终集中验收](../../docs/skin-acceptance.md)。

## 编辑与生成

- [`canvas-state.js`](canvas-state.js)：原生 ES 模块，包含状态默认值、深复制/合并、宽度分类、站点键、浮层矩形约束、旧配置迁移与表面模式；不访问 DOM 或存储。
- [`styles.js`](styles.js)：固定字体栈、旧三段式 `shellCss()`、单画布 `canvasCss()` 与正文组合 `skinCss(cfg, { shellActive, uiMode })`。只生成 CSS，五项正文配置与实际壳状态由调用方传入，不缓存配置；字体/玻璃等外观覆盖继续使用 CSS 变量。
- [`media-controller.js`](media-controller.js)：通过 `createSkinMediaController({ window, document, media, style, getContext, toast })` 管理背景、字体、对象 URL 和 IndexedDB 连接，复用基座媒体 API。背景和字体的异步请求各自隔离，相同请求去重；本地键重新上传后触发资源替换。
- [`plugin-catalog.js`](plugin-catalog.js)：`createSkinPluginCatalog({ getInfo, ui, request })` 统一定义插件功能目录，按当前插件状态、面板/RPC 和设置清单生成入口；两种界面点击时都会再次验证。AI 历史只保留在开发构建。
- [`search-controller.js`](search-controller.js)：`createSkinSearchController({ document })` 接管原生搜索表单或链接，管理原节点和还原位置，保留表单字段与事件，并提供单画布搜索展开/焦点控制。
- [`navigation.js`](navigation.js)：`createSkinNavigation({ document, getPage, getForums, getLocation, parseTopic, store, homeSorted })` 生成版块目录、页面文案、活动链接判断、画布页面类型和导航列表。getter 每次读取当前上下文，保留版块计数缓存、原生导航回退、入口顺序和去重；不迁移节点、不绑定事件或请求页面。
- [`content-controller.js`](content-controller.js)：`createSkinContentController({ window, document, isChallengeDocument, findLeftRails, createScrollBridge })` 管理正文出口、原生侧栏节点和滚动桥，保持真实节点、表单状态、事件与还原位置；重复挂载不覆盖原位置，出口更换不复活旧页面。
- [`history-controller.js`](history-controller.js)：`createSkinHistoryController({ window, document, getScrollRoot, readScroll, scrollTo })` 管理历史字段、双轴位置、索引回滚与浏览器滚动恢复模式。历史恢复只写一次坐标，短暂禁用当前滚动根的锚定；250ms或用户滚动输入、离页、新导航、停用时归还原样式。
- [`profile-controller.js`](profile-controller.js)：管理双界面真实资料节点、原位置、临时 ID/通知属性、展开事件与用户页资料槽。身份按同源完整用户路径匹配；重复/跨宿主挂载不覆盖原位置，归还只操作自身持有的节点并保留外部更新。
- [`site-cards-controller.js`](site-cards-controller.js)：管理单画布普通站点卡片占位与广告/每日热帖的持久节点。`sync(host, { persistentOnly })` 只负责节点接管；`stageOrigins`/`rebindOrigins` 接入现有软跳提交，`restore` 支持临时归还或完全释放。
- [`online-controller.js`](online-controller.js)：`createSkinOnlineController({ window, document, request, isEnabled, isChallengeDocument })` 管理双模式在线清单、头像绿点、周期刷新和头像观察器；在途请求去重，隐藏时延后，停止后使响应失效，重启后恢复刷新，路由新清单优先于旧响应。
- [`legacy-aside-cards.js`](legacy-aside-cards.js)：`createSkinAsideCardsController({ window, document, store, getSidebars, getPage, isSelfUserCard, isEnabled, syncOnlineDots })` 管理旧三栏卡片原位置、广告/每日热帖持久节点、缓存补位和晚到在线卡观察。真实卡到达时替换缓存并进入站点 pane；观察器跟随当前侧栏重绑，归还或拆壳时停止。
- [`legacy-aside-views.js`](legacy-aside-views.js)：`createSkinAsideViewsController({ window, document, store, getContext, getViews, isEnabled, onSelect })` 管理右栏页签、渲染清理、ARIA 选择态、偏好和 resize 监听；模板通过选择回调桥接外部窗口聚焦。
- [`config-controller.js`](config-controller.js)：`createSkinConfigController({ getConfig, saveConfig, store, getLocation, getViewport, stateApi, sanitizeTokenValue, isHttpsUrl })` 集中配置读取、一次性软跳迁移、画布状态存取、外观校验/预设、媒体键、布局覆盖和令牌输入。`stateApi` 显式使用已有纯函数；通过 getter 暴露最新状态，不访问 DOM 或创建后台资源。首次迁移与后续保存均写状态副本，暂缓保存的编辑不会改动存储缓存。
- [`spa-document.js`](spa-document.js)：`createSkinSpaDocumentController` 管理同源路由白名单、帖子 canonical/正文校验、已有 head 节点同步、脚本剥离、正文提交和真实缓存节点恢复。侧栏归还、持久卡片标记及在线状态同步由显式生命周期依赖接入，提交顺序保持一致。
- [`view-cache.js`](view-cache.js)：`createSkinViewCache` 持有最多五项视图片段，以及首页预取和 30 秒后台刷新。帖子正文不命中缓存；`stop()` 取消后台请求并清理计时器，后续可重启，旧响应和 finally 不能覆盖新请求；`clear()` 释放片段。模板以实时上下文提供绑定状态和当前路由。
- [`spa-controller.js`](spa-controller.js)：`createSkinSpaController` 统一持有导航请求、点击/GET 表单/历史/BFCache 事件、取消、进度及绘制后通知。调用已有文档、缓存和历史控制器；通过 `bound/viewKey/filled` getter、`isCurrent/markFilled` 与模板协作，`clear()` 取消当前事务，`unbind()` 解绑事件并停止缓存刷新。
- [`home-infinite-controller.js`](home-infinite-controller.js)：`createSkinHomeInfiniteController` 管理首页分页请求、去重、当前绑定和按列表节点保存的加载记录；`sync()` 根据路由、节点及滚动根决定重绑，`unbind()` 保存记录、解绑监听、清理计时器/提示并取消请求。响应写入前核对当前路由和真实节点身份，避免污染后续页面。
- [`native-enhancements-controller.js`](native-enhancements-controller.js)：`createSkinNativeEnhancementsController` 集中原生对话树、回复父楼层记录、引用链接、折叠交互和正文验证控件；`refresh()` 重建当前路由增强并接入在线刷新，`clear()` 依次停止线程观察、解绑回复生命周期、使验证任务失效并清理观察器/计时器，保留既有节点交互策略。
- [`settings-controller.js`](settings-controller.js)：`createSkinSettingsController` 渲染资源导入与布局按钮，复用媒体/配置控制器；`syncMenu()` 先注销旧菜单再按实时配置重建，点击时再次读取配置，`clearMenu()` 在原 dispose 位置注销菜单。设置页注册与配置事件仍由模板编排。
- [`topbar-controller.js`](topbar-controller.js)：`createSkinTopbarController({ window, document, store, isEnabled, getWidthClass, getTopStatus })` 管理 legacy 附加入口与 canvas 状态链接、原生明暗控件/色系入口/弹层以及对应原位和顶栏观察器；通过 getter 读取当前壳状态、宽度与宿主。模板保留原调用点，先 `stopExtrasWatch()` 再按原顺序归还节点。
- [`timeline-controller.js`](timeline-controller.js)：`createSkinTimelineController({ window, document, getPage, getPostSelector, isEnabled, hasPerfProbe, emitPerf })` 管理 legacy 帖子楼层显示/跳转、滚动/缩放监听、合并帧调度和性能上报限频。`ensure()` 挂载或隐藏，`schedule()` 合并更新，`bind()`/`unbind()` 管理监听；`cancelPending()` 在原拆壳位置取消帧，新增楼层订阅和清理编排保留在模板。
- [`selection-controller.js`](selection-controller.js)：`createSkinSelectionController` 管理帖子选择、回复/引用/收藏/复制委托、胶囊位置和关闭计时器；`bind()`/`unbind()` 管理选择事件，`act()` 委托原生操作，`close()` 清除选择与计时器。模板通过 getter 和回调保留共享焦点、活动面板、视口及递增层级，维持原点击和卸载顺序。
- [`appearance-controller.js`](appearance-controller.js)：`createSkinAppearanceController` 通过 `sync()` 同步画布预设、背景与输入状态，`bind()` 绑定外观/布局恢复、保存及媒体导入控件；实时查询当前宿主和配置，保留未触发事件值的批量提交及异步媒体保存顺序。绑定标记仍在真实节点上，复用原配置和媒体控制器，不新增自有可变状态或清理协议。
- [`surface-layout-controller.js`](surface-layout-controller.js)：`createSkinSurfaceLayoutController` 管理浮层模式、几何约束应用、指针拖动/缩放和键盘移动，持有拖动状态与待执行帧。通过 `applyModes()`、`beginDrag()`、`beginResize()`、`keyboardMove()`、`endDrag()` 和只读 `dragging` 接入原调用点；实时查询宿主、表面、视口及配置，保留取消还原、最终提交和共享层级递增顺序。
- [`canvas-scroll-controller.js`](canvas-scroll-controller.js)：`createSkinCanvasScrollController` 管理双模式首页/正文滚动根、初始双轴位置承接、目标监听迁移、状态栏/资料卡同步及 scroll/resize 帧调度。`homeRoot()`、`syncTarget()`、`schedule()`、`bind()`、`unbind()` 保留原调用点，`bound`/`target` getter 暴露实时状态；在首页加载器之前初始化，后续模块操作通过延迟回调连接，卸载归还监听并取消待执行帧。
- [`window-controller.js`](window-controller.js)：`createSkinWindowController` 管理共享窗口兼容实现的布局保存/迁移、外部视图、局部检查器、指针/键盘交互、响应式切换和正文归还。`enabled()` 继续返回 false，保持旧窗口化入口关闭；模板保留公开 API、侧栏选择和 debug 接线，以 `layout`/`registry`/`externalViews` getter 读取原状态，原卸载顺序分别调用 `unbind()` 与 `unmount()`。
- [`canvas-host-controller.js`](canvas-host-controller.js)：`createSkinCanvasHostController` 管理画布 DOM、面板/遮罩/焦点、插件菜单/导航、站点信息栏展示与通用事件。`mount()`/`unmount()` 保留画布局部接管和释放顺序，真实节点由原控制器持有；`surface()`、`syncText()`、`applyPageClass()` 和站点栏方法接入现有调用点。通过 `shell`/`surfaceHost`/`activeSheet` getter、`nextZIndex()`/`restoreFocus()` 共享实时状态；工厂不调用后置依赖，搜索外部监听及侧栏观察器在原顺序清理。
- [`runtime-controller.js`](runtime-controller.js)：`createSkinRuntimeController` 管理入口的模式切换、50ms 刷新防抖、断点/挑战页监听、临时拆壳和最终停用。`applyAll()`、`scheduleRefresh()`、`cancelRefresh()` 保留原触发方式；`onConfigChanged()`、`onNativeNode()`、`dispose()` 接入原注册点。工厂不执行依赖，SPA 回调和设置 getter 延迟解析；清理顺序与原 Set/节点所有权不变，公共 UI 注册仍由基座 API 归还。
- [`skin.template.js`](skin.template.js)：1110 行，保留 userscript 头、manifest、挑战页检测、AI markup、模块装配、设置/公共控制器注册、旧三栏渲染及视图/路由适配。29 个模块分别通过唯一 `// @LSB_SKIN_*` 标记注入，清单以生成器为准；模板通过 getter 和回调提供当前滚动根、挂载位置与跨模块调用。
- [`../skin.user.js`](../skin.user.js)：可独立安装的生成文件。修改上述源文件后生成并一同提交，不直接编辑生成文件。版本号在模板的 `@version` 和 manifest 两处同步提升。
- [`../../src/shell/canvas.js`](../../src/shell/canvas.js) 与 `src/shell-canvas.js`：兼容转出口，无第二份实现，也未被 Hydrogen 运行时引用。

```bash
npm run build:skin   # 生成独立插件
npm run verify:skin  # 只读校验生成文件与源码一致
npm run test:skin    # 构建契约、状态/样式/媒体/入口/导航/生命周期/资料卡/站点卡片/在线状态/旧三栏右侧栏/配置适配/SPA 文档/缓存/事务、首页无限滚动/原生正文增强/资源设置与菜单/顶栏接管/时间轴/文本选择/画布外观/浮层布局/画布滚动/共享窗口兼容接线/画布宿主与面板事件/入口生命周期与清理、双界面与阅读专项
```

[`scripts/build-skin.mjs`](../../scripts/build-skin.mjs) 只读取模板与显式列出的二十九个模块，剥离模块顶层声明的 `export` 前缀后按模板组合。每个注入点都必须在模板中唯一存在，模块不能复制或代替它。生成器拒绝 BOM、CRLF、每个文件内未配对的 AI 标记与生成脚本语法错误，不引入运行时加载器或新增依赖。

`build-suite.mjs` 和 `build-lts.mjs` 自动刷新独立插件；`scripts/build-common.mjs` 的 `readPluginSource('skin')` 直接读取组合源码。正式与开发套件再执行现有 AI 裁剪，独立插件保留开发 AI 代码。`verify:skin`、两个分发校验器和常规测试入口只读检查新鲜度，发现过期会要求执行 `build:skin`。CI 重建后同时检查 `plugins/skin.user.js` 与 `dist/` 的提交内容。

若专项测试涉及 Hydrogen 或 Oxygen 产物，先构建开发版和正式版。完整验证顺序见 [开发规范](../../docs/CONVENTIONS.md)。

## 媒体控制器约定

- `sync()` 获取最新配置、外观、工作区和界面模式，返回可等待的 Promise。背景本地优先，字体 HTTPS 优先；源或宿主变化释放旧背景后加载新资源。
- `saveFile(kind, file)` 校验并保存站点资源，返回原有站点/类型键；修订号保证同键覆盖可以刷新。UI 写配置前必须等待成功，遇到 `AbortError` 静默结束。
- `reset()` 使请求失效，释放节点、监听器、对象 URL、字体及已开/晚到的媒体库连接；用于界面切换和临时卸载，随后可重新同步。
- `dispose()` 永久停用，供插件卸载调用。共享 FontFace API 无取消接口，已启动的字体加载在返回后立即释放过期结果，不再写页面样式或提示。

## 最终边界与清理责任

既定源码拆分结束。模板保留需要了解多个控制器的装配、旧三栏渲染和路由/视图适配；不以清空模板为目标，后续改动依据实际需求或缺陷确定。

- 运行时控制器统一编排刷新、模式切换、临时卸载和彻底停用；画布宿主负责画布局部 DOM、面板、焦点及事件。初始化顺序和延迟 getter 保证运行时、SPA、设置和宿主之间的后置依赖只在初始化后执行。
- 正文、搜索、资料卡、顶栏、站点卡片和旧三栏控制器分别归还自己持有的真实节点与可逆属性。持久卡片遵循原暂存/释放顺序，不能通过复制 DOM 或重复保存原位替代恢复。
- SPA 管理导航事务和事件；`unbind()` 停止视图缓存刷新并调用历史控制器 `dispose()`，归还浏览器滚动模式。首页加载、在线刷新、时间轴、选择和布局控制器在各自清理点取消请求、监听或待执行帧；晚到响应不得写回已失效的页面。
- 媒体 `reset()` 用于可重用卸载，`dispose()` 用于永久停用；油猴菜单由设置控制器注销。公共 UI 控制器、设置页、事件和 DOM 订阅由基座 API 的 `own()` 登记，core 按登记顺序释放，不因模板中的注销返回值未被显式调用而重复注册清理。
- 原共享窗口 `enabled()` 仍返回 false。保留兼容接线；本次验收不包含启用后的旧窗口拖拽、缩放等交互，也不将其视为待完成阶段。

## 阶段记录

第二十五步记录：[计划与执行](../../docs/superpowers/plans/2026-10-31-skin-final-acceptance.md) · [最终集中验收](../../docs/skin-acceptance.md)。以下为迁移时的历史记录，其“下一步”不代表当前待办。

第二十四步记录：[设计](../../docs/superpowers/specs/2026-10-31-skin-runtime-split-design.md) · [计划与验收](../../docs/superpowers/plans/2026-10-31-skin-runtime-split.md)。

第二十三步记录：[设计](../../docs/superpowers/specs/2026-10-31-skin-canvas-host-split-design.md) · [计划与验收](../../docs/superpowers/plans/2026-10-31-skin-canvas-host-split.md)。

第二十二步记录：[设计](../../docs/superpowers/specs/2026-10-31-skin-window-split-design.md) · [计划与验收](../../docs/superpowers/plans/2026-10-31-skin-window-split.md)。

第二十一步记录：[设计](../../docs/superpowers/specs/2026-10-31-skin-canvas-scroll-split-design.md) · [计划与验收](../../docs/superpowers/plans/2026-10-31-skin-canvas-scroll-split.md)。

第二十步记录：[设计](../../docs/superpowers/specs/2026-10-31-skin-surface-layout-split-design.md) · [计划与验收](../../docs/superpowers/plans/2026-10-31-skin-surface-layout-split.md)。

第十九步记录：[设计](../../docs/superpowers/specs/2026-10-31-skin-appearance-split-design.md) · [计划与验收](../../docs/superpowers/plans/2026-10-31-skin-appearance-split.md)。

第十八步记录：[设计](../../docs/superpowers/specs/2026-10-31-skin-selection-split-design.md) · [计划与验收](../../docs/superpowers/plans/2026-10-31-skin-selection-split.md)。

第十七步记录：[设计](../../docs/superpowers/specs/2026-10-31-skin-timeline-split-design.md) · [计划与验收](../../docs/superpowers/plans/2026-10-31-skin-timeline-split.md)。

第十六步记录：[设计](../../docs/superpowers/specs/2026-10-31-skin-topbar-split-design.md) · [计划与验收](../../docs/superpowers/plans/2026-10-31-skin-topbar-split.md)。

第十五步记录：[设计](../../docs/superpowers/specs/2026-10-31-skin-settings-split-design.md) · [计划与验收](../../docs/superpowers/plans/2026-10-31-skin-settings-split.md)。

第十四步记录：[设计](../../docs/superpowers/specs/2026-10-31-skin-native-enhancements-split-design.md) · [计划与验收](../../docs/superpowers/plans/2026-10-31-skin-native-enhancements-split.md)。

第十三步记录：[设计](../../docs/superpowers/specs/2026-10-31-skin-home-infinite-split-design.md) · [计划与验收](../../docs/superpowers/plans/2026-10-31-skin-home-infinite-split.md)。

第十二步记录：[设计](../../docs/superpowers/specs/2026-10-31-skin-spa-transaction-split-design.md) · [计划与验收](../../docs/superpowers/plans/2026-10-31-skin-spa-transaction-split.md)。

第十一步记录：[设计](../../docs/superpowers/specs/2026-10-31-skin-spa-doc-cache-split-design.md) · [计划与验收](../../docs/superpowers/plans/2026-10-31-skin-spa-doc-cache-split.md)。

第十步记录：[设计](../../docs/superpowers/specs/2026-10-31-skin-config-split-design.md) · [计划与验收](../../docs/superpowers/plans/2026-10-31-skin-config-split.md)。

第九步记录：[设计](../../docs/superpowers/specs/2026-10-31-skin-legacy-aside-split-design.md) · [计划与验收](../../docs/superpowers/plans/2026-10-31-skin-legacy-aside-split.md)。

第八步记录：[设计](../../docs/superpowers/specs/2026-10-31-skin-online-split-design.md) · [计划与验收](../../docs/superpowers/plans/2026-10-31-skin-online-split.md)。

第七步记录：[设计](../../docs/superpowers/specs/2026-10-31-skin-sidebar-split-design.md) · [计划与验收](../../docs/superpowers/plans/2026-10-31-skin-sidebar-split.md)。

第六步记录：[设计](../../docs/superpowers/specs/2026-10-31-skin-lifecycle-split-design.md) · [计划与验收](../../docs/superpowers/plans/2026-10-31-skin-lifecycle-split.md)。

设计与执行记录：[第一步状态](../../docs/superpowers/plans/2026-10-30-skin-split.md) · [第二步样式设计](../../docs/superpowers/specs/2026-10-30-skin-style-split-design.md) · [第二步计划与验收](../../docs/superpowers/plans/2026-10-30-skin-style-split.md) · [第三步媒体设计](../../docs/superpowers/specs/2026-10-30-skin-media-split-design.md) · [第三步计划与验收](../../docs/superpowers/plans/2026-10-30-skin-media-split.md) · [第四步入口设计](../../docs/superpowers/specs/2026-10-31-skin-entry-split-design.md) · [第四步计划与验收](../../docs/superpowers/plans/2026-10-31-skin-entry-split.md) · [第五步导航设计](../../docs/superpowers/specs/2026-10-31-skin-navigation-split-design.md) · [第五步计划与验收](../../docs/superpowers/plans/2026-10-31-skin-navigation-split.md)。
