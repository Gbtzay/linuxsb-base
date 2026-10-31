# 第二十三阶段：画布宿主、面板开关与通用事件

本阶段延续已确认的第 25 阶段收尾范围。提取现有画布宿主及其局部挂载/卸载、面板开关、站点信息栏展示、菜单/导航渲染和通用事件，不改变界面行为。下一阶段整理 setup 的入口生命周期与总清理，最后集中验收和文档收尾。

## 边界

- 新增 `plugins/skin/canvas-host-controller.js`，导出 `createSkinCanvasHostController`。持有宿主、表面容器、活动面板、焦点返回目标、文档外部点击监听、递增层级、站点信息栏状态和侧栏观察器。保留原始 DOM 模板、ARIA、事件委托分支、异步调度和清理先后。
- 复用已有配置、插件目录、站点卡片、搜索、资料卡、顶栏、选择、外观、浮层布局和滚动模块。通过显式回调延迟读取后续初始化的控制器，工厂构造期间不调用依赖。
- 站点卡片的真实节点及原位置仍归原 `site-cards-controller.js`；宿主只负责展示位置、展开/锁定状态、侧栏观察和原挂载调用顺序。旧三栏功能入口继续调用同一个菜单操作方法。
- 工厂在原画布状态声明位置初始化，以 `shell`、`surfaceHost`、`activeSheet` getter 暴露当前状态，`nextZIndex()` 和 `restoreFocus()` 保留选择/浮层控制器对共享状态的操作。
- 模板保留 setup 注册、模式切换、路由/挑战页编排、总清理及公共 debug。仅画布自己的 `mountCanvas`/`unmountCanvas` 随宿主迁移，调用点与内部清理顺序不变。
- 开发版 AI markup 仍由模板提供，各个条件块完整保留在单个源文件内。正式版继续剥离 AI 入口与事件桥接。旧窗口化模式保持关闭。

## 接口

```js
createSkinCanvasHostController({
  window, document, configController, aiMarkup, getPage,
  pluginCatalog, siteCardsController, hooks,
})
// 返回 mount/unmount、surface、applyPageClass、syncText、openPluginFeature，
// restoreSiteSidebar/syncSiteSidebar/syncPersistentSiteCards/setSiteStatusExpanded，
// watchSidebar/stopSidebarWatch、nextZIndex/restoreFocus，及 shell/surfaceHost/activeSheet getter。
```

`pluginCatalog`、`siteCardsController` 为保留原方法接收对象的延迟转发器；`hooks` 逐项声明所需操作，不传入整个 setup/API。模块只做显式依赖替换，逐函数与冻结快照对比。

## 验证与约束

复用现有生成器参数化 fixture，增加唯一 `@LSB_SKIN_CANVAS_HOST` 注入模块。先确认旧生成器因缺少该模块得到 `missing-canvas-host`，再实施提取。复用现有画布/双界面行为测试，覆盖宿主复用与停用、面板/遮罩、搜索 Escape/外部关闭、站点信息栏、插件入口、选择及拖拽取消。不新增行为测试，不修改行为夹具或测试选择器。

所有 Node 进程限制 512 MiB，测试单 worker 和 `--test-force-exit`。顺序运行构建与产物校验，不运行全量、压力测试或浏览器冒烟。由一次独立只读审查核对源码、初始化/延迟依赖及清理顺序；未动态覆盖的分支按静态核对记录，不扩大测试结论。

本阶段基于 `codex/integrate-origin-main` 的现有工作区与 393 个文件哈希基线；保留既有未提交改动，不提交、推送、移动分支或创建工作树。证据位于 `artifacts/skin-canvas-host-split/`。
