# Skin Surface Layout Controller Design

第二十阶段将画布浮层模式、矩形应用、拖动、缩放和键盘移动移入 `plugins/skin/surface-layout-controller.js`，保持既有几何计算、配置存储与事件语义。

## 边界与接口

`createSkinSurfaceLayoutController` 接收 window、配置控制器、当前宿主/表面/视口 getter、纯状态工具、布局保存、站点信息展开/同步、共享层级递增和关闭面板回调。返回 `{ applyModes, endDrag, beginDrag, beginResize, keyboardMove, get dragging() }`。

提取连续的六个原函数：`canvasSurfaceRect`、`canvasApplySurfaceModes`、`canvasEndDrag`、`canvasBeginDrag`、`canvasBeginResize`、`canvasKeyboardMove`。控制器拥有原来的 `canvasDragState` 和 `canvasDragRaf` 两处状态；模板通过只读布尔 getter 判断 Escape 是否应取消拖动。共享 `canvasZIndex` 仍由模板拥有，通过 `nextZIndex()` 在原 Home 分支位置递增。

纯工具通过 `stateApi: { CANVAS_DEFAULT_SURFACES, resolveSurfaceMode, clampSurfaceRect }` 显式传入，配置及实际 DOM 每次读取。模板在原函数块位置创建控制器，保留原函数别名与调用点。挂载/窗口 resize/路由刷新/恢复布局继续应用模式；卸载首先 `endDrag(false)`，随后解绑窗口、选择与其他事件。

## 保持的行为

- 宽屏浮动、中屏 Sheet、窄屏全屏以及站点信息 rail 的规则、ARIA、隐藏状态、默认尺寸与视口约束不变。
- 拖动只接受浮动卡、主按钮和非交互控件；保留 pointerId 过滤、pointer capture、移动帧合并及 timeout 回退。
- 指针释放时提交最终矩形；取消时撤销位移，缩放恢复原始内联宽高，不持久化临时尺寸。取消待执行帧、移除三类窗口监听、释放 capture、清空状态的次序不变。
- 键盘方向键、Shift 调整、Home/End 层级和 Escape 关闭继续按原顺序处理；不改变矩形算法或补充新交互行为。
- 站点侧栏节点归属、配置存储、共享层级、窗口滚动、宿主事件委托与 CSS 继续由现有模块或模板管理。

## 构建与验收

显式 skin 模块增至 25 个，新增唯一 `@LSB_SKIN_SURFACE_LAYOUT` 注入点。skin 2.0.55、Oxygen/LTS 2.0.60、Hydrogen 2.4.2；套件正式 21、开发 26 个模块。

扩展已有生成器 fixture，先确认旧生成器未注入 surface-layout 的预期失败，再运行生成器与既有几何边界、拖动、缩放取消、宽度降级、布局隔离、挂载/卸载专项。单 worker、512 MiB Node 堆上限；不新增行为测试，不跑全量、无关 AI 或压力测试。本轮不改样式、布局算法或浏览器 API 用法，不重跑浏览器套件。

只读审查对照真实模板快照核对六个函数、两处状态、依赖接线及初始化/清理顺序；基线审计保护前十九阶段改动。下一阶段为画布滚动同步与窗口监听。
