# Skin Window Controller Design

第二十二阶段整理共享窗口布局与交互，将既有窗口兼容实现移入 `plugins/skin/window-controller.js`，保持双界面、公开控制器、外部视图和卸载行为。

## 当前行为与边界

`shellWindowEnabled()` 当前固定返回 false，旧窗口化界面不启用。本阶段保留该条件，不新增入口或打开未启用功能。原公开 focus/arrange/reset/layout 接口、正文归还、侧栏选择和 debug 结构保持。

提取从 `shellWindowEnabled` 到 `unmountShellWindows` 的连续 38 个完整函数，包括布局存取/迁移、窗口结构、外部视图、局部样式检查器、指针/键盘操作、响应式处理和挂载/卸载。移动 10 处可变变量、1 个外部视图 Map、3 个布局常量和内建窗口清单。它们共同管理同一套窗口状态，保留在一个控制器中，避免额外引入跨控制器状态协议。

`createSkinWindowController` 接收 window/document、ui/store、既有配置/正文控制器、布局/样式 API、实时位置和侧栏 getter，以及侧栏选择、正文查找、深复制函数。返回 `{ enabled, workspace, viewport, host, focus, arrange, reset, unbind, mount, unmount, get layout(), get registry(), get externalViews() }`。

控制器在原布局状态声明位置初始化，先于公开控制器注册及侧栏控制器。构造时只创建状态和函数，不调用依赖；侧栏 getter 和选择回调延迟解析后续别名。模板保留原方法别名和调用点，状态读访问改用 getter；返回的布局/清单/Map 是原内部对象，getter 本身没有 setter，不新增复制语义。

## 保持的行为

- 布局按 origin 和宽度桶隔离，保留 150ms 保存防抖、立即保存、迁移标记与存储异常回退。
- 保留内建/外部窗口去重顺序、真实宿主、render/dispose 调用、节点绑定标记、局部令牌、检查器保存和焦点操作。
- 保留拖动/八方向缩放、吸附、键盘步骤、帧合并、pointer capture 和交互结束时的保存顺序；Escape/pointercancel 沿用现有结束语义。
- 保留响应式布局切换、外部视图侧栏选择和可见性处理。解绑交互和卸载窗口仍为两个方法，按模板原顺序执行；正文释放、布局保存与状态清空顺序不变。
- 原窗口化开关、共享布局/样式 API、画布浮层、媒体、滚动、侧栏控制器及生命周期总编排保持原样。

## 构建与验证

新增唯一 `@LSB_SKIN_WINDOWS` 注入点，显式 skin 模块增至 27 个。skin 2.0.57、Oxygen/LTS 2.0.62、Hydrogen 2.4.2；套件正式 21、开发 26 个模块。

扩展已有生成器 fixture，先确认旧生成器漏注入的执行结果失败，再运行生成器、已有布局/样式纯函数与双界面/外部侧栏专项。保持 Node 单 worker、512 MiB 堆上限，不新增行为测试、不跑全量、浏览器、无关 AI 或压力测试。未启用的交互分支以真实快照逐字比较及一次独立只读审查核对，不宣称经过运行时交互验收。

本阶段后剩余第 23 阶段画布宿主/面板/通用事件、第 24 阶段入口生命周期/清理、第 25 阶段集中验收与文档收尾。
