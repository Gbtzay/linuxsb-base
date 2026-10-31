# Skin Selection Controller Design

第十八阶段将画布文本选择与上下文操作胶囊移入 `plugins/skin/selection-controller.js`，保持原有原生操作委托、定位及关闭行为。

## 边界与接口

`createSkinSelectionController({ window, document, ui, getPill, getSurfaceHost, getActiveSheet, restoreFocus, getViewport, nextZIndex })` 持有选择监听状态、事件处理函数、当前帖子、选中文本及关闭计时器，共 5 处状态；提取关闭、原生操作、显示、选择同步、绑定和解绑共 6 个函数。

返回 `{ close, act, bind, unbind }`。模板保持 `canvasCloseContextPill`、`canvasNativeAction`、`canvasBindSelection`、`canvasUnbindSelection` 名称和原调用点。点击委托仍先调用原生操作再关闭胶囊；卸载仍在移除宿主前解绑和关闭。

共享焦点、活动面板和 z-index 继续留在模板。控制器以 getter 查询当前胶囊、宿主、活动面板与视口，通过 `restoreFocus()` 恢复共享焦点；`nextZIndex()` 在原递增位置更新共享层级。DOM 构造器及 clipboard 所在 navigator 来自 window，提示使用注入的 ui。

## 保持的行为

- 选择仍限制为文档中的帖子节点；空选择在胶囊未持有焦点时关闭，保存文本最多 2000 字符。
- 回复、引用、收藏按原选择器先查当前帖子再查文档，委托真实节点 click/focus；复制保持 clipboard API 与 textarea/execCommand 回退、提示和异常处理语义。
- 胶囊保持视口边界限制、共享层级递增、8 秒关闭计时器和 focus-within 保护。
- 保留 selectionchange/pointerup 订阅、原 rAF/timeout 调度方式、解绑/关闭顺序；本次不改变异步复制错误处理或选择事件调度策略。

## 构建与验证

新增唯一 `@LSB_SKIN_SELECTION` 注入点，显式 skin 模块增至 23 个。skin 2.0.53、Oxygen/LTS 2.0.58；Hydrogen 2.4.2，套件正式 21/开发 26 个模块不变。

扩展已有生成器 fixture，先观察旧生成器的缺失模块失败，再复用文本选择/原生操作、浮层互斥/遮罩、模式切换及停用恢复专项。单 worker、512 MiB Node 堆上限，不新增重复行为测试。现有浏览器套件没有直接文本选择检查，本阶段不重复运行；不将历史浏览器结果计入验收。

基线原生收藏点击用例会输出 JSDOM 未实现 requestSubmit 的诊断，但委托点击和胶囊关闭断言通过；保留该既有诊断，不通过修改夹具或实现掩盖。独立只读审查和函数/模板逐字核对检查共享状态桥接、计时器与监听清理。下一阶段候选为画布外观面板与配置交互。
