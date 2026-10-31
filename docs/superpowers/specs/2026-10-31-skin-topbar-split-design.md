# Skin Topbar Controller Design

第十六阶段将顶栏附加入口、单画布状态链接及原生外观控件接管移入 `plugins/skin/topbar-controller.js`，继续缩小运行时模板，不改变产品行为。

## 边界

`createSkinTopbarController({ window, document, store, isEnabled, getWidthClass, getTopStatus })` 持有两份节点原位 Map、明暗控件/色系入口/色系弹层原位和顶栏观察器，共 6 处状态。提取 17 个顶栏函数及只供它们使用的 `restoreNode`，共 18 个函数。DOM 构造器、URL 和 location 来自注入的 window；壳开关、宽度及顶部宿主通过 getter 实时读取。

返回 `renderCanvasTopLinks`、`restoreCanvasTopLinks`、`adoptTopExtras`、`restoreTopExtras`、`adoptThemeToggle`、`restoreThemeToggle`、`watchTopExtras`、`stopExtrasWatch`。模板在原顶栏函数块位置初始化并解构，原调用点、先停止观察再归还节点的清理顺序保持。搜索、资料卡、站点侧栏及壳窗口编排仍由已有控制器/模板负责。

## 保持的行为

- legacy 入口仍迁入真实节点，记录原父节点与 nextSibling；过滤个人、纯数字、AI 操作台入口，按原字段保存/回放缓存。
- canvas 仍从原生顶栏、增强配置、功能/移动菜单及已有缓存收集，按绝对 URL 去重；窄屏最多四项，认证入口固定于导航按钮之前。
- 保留原有重复顶栏查询和两种缓存读取字段约定；本次提取不调整其语义。
- 外观控件与色系弹层按原顺序迁入、归还；原生站点补回控件时不重复搬走，避免观察器循环。
- 观察器只在原生顶栏存在时建立，并在每次回调核对当前壳开关；停止后释放引用，可在后续挂载重建。

## 构建与验证

新增唯一 `@LSB_SKIN_TOPBAR` 注入点，生成器显式模块增至 21 个。skin 2.0.51、Oxygen/LTS 2.0.56；Hydrogen 2.4.2，套件正式 21/开发 26 个模块不变。

扩展既有生成器 fixture，先观察旧生成器的缺失模块失败，再复用入口过滤/迁入归还、外观控件补回、模式切换、canvas 固定入口与弹层归还等专项。Node 单 worker、512 MiB 堆上限；浏览器仅顺序复用 iOS27 canvas 冒烟，Node 堆 384 MiB，不重跑其他浏览器套件。保留前十五阶段所有改动，不新增行为测试、依赖或测试选择器，不运行全量、无关 AI 或压力测试。

一次独立只读审查核对提取、接线与生命周期；哈希基线保护旧模块、Hydrogen 和行为测试，另检查构建、分发、新鲜度、编码与文档链接。下一阶段候选为帖子时间轴与滚动联动，待本阶段完成后继续。
