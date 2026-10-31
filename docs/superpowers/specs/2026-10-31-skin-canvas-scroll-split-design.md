# Skin Canvas Scroll Controller Design

第二十一阶段提取画布滚动同步与窗口监听，保持双模式首页滚动根、原生窗口桥、初始双轴滚动迁移和清理行为。

## 边界与接口

新增 `plugins/skin/canvas-scroll-controller.js`，提供 `createSkinCanvasScrollController({ window, document, getSurface, getViewport, isAsideWide, getContentScroller, syncScrollBridge, updateProfileScroll, applyPageClass, applySurfaceModes })`。返回 `{ homeRoot, syncTarget, schedule, bind, unbind, get bound(), get target() }`。

提取 `canvasScrollSync`、`canvasHomeScrollRoot`、`canvasScrollRoot`、`canvasSyncScrollTarget`、`canvasScrollY`、`canvasScheduleScroll`、`canvasBindWindow`、`canvasUnbindWindow` 八个完整函数。原有绑定标志、上次位置、待执行帧、滚动处理函数、resize 处理函数和当前滚动目标六处状态归控制器所有；模板通过只读 getter 获取绑定状态与当前目标。

控制器在原状态声明位置初始化，先于首页无限滚动控制器。构造时只声明状态和函数，不查询宿主或调用依赖；资料卡更新和浮层模式使用延迟回调，保留后续控制器初始化顺序。模板沿用原方法别名，首页加载器继续直接取得 `canvasHomeScrollRoot`，不改变该依赖的调用契约。

## 保持的行为

- 首页滚动根继续检查壳状态、首页标记、画布模式与 700px 宽度边界；legacy 使用原 `asideWide()`。首页面板不可用时回退至当前正文 scroller。
- 切换目标先同步窗口滚动桥；同节点直接返回。旧节点解绑，新节点只在当前位置为零时承接正向窗口双轴滚动，随后绑定 passive scroll 并更新基准位置。
- 状态栏继续使用 2px 方向阈值与 48px 收缩阈值，资料卡继续接收当前及上次滚动位置。
- 绑定幂等，scroll 更新合并为一帧；没有 RAF 时保留 timeout 回退。resize 依次更新页面标记、浮层模式与滚动调度。
- 卸载依次移除窗口 scroll/resize 和目标 scroll 监听，清空处理函数/目标并取消待执行帧；拖拽取消和选择监听清理的位置不变。
- 原生滚动桥、历史存储、正文/资料卡生命周期、样式与几何算法继续由现有模块负责。

## 构建与验收

新增唯一 `@LSB_SKIN_CANVAS_SCROLL` 注入点，显式 skin 模块增至 26 个。skin 2.0.56、Oxygen/LTS 2.0.61、Hydrogen 2.4.2；套件正式 21、开发 26 个模块不变。

扩展已有生成器 fixture，先观察缺失模块的实际执行结果失败，再运行完整生成器检查和已有滚动/双轴历史/模式切换/宽度变化/卸载专项。Node 单 worker、512 MiB 堆上限；不新增行为测试，不跑全量、无关 AI、压力测试或浏览器套件。待执行帧取消与初始化接线另通过逐字比较和一次只读代码审查核对。

本阶段后保留四个收尾阶段：22 共享窗口布局与交互；23 画布宿主、面板开关与通用事件；24 入口生命周期与清理；25 集中验收、文档与最终收尾。模板保留必要编排，以职责清晰、行为稳定为结束标准。
