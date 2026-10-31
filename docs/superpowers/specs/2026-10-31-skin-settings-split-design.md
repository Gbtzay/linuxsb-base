# skin 第十五步：设置面板与菜单拆分

日期：2026-10-31。以第十四阶段完成后的工作区为基线，保留既有未提交改动。

新增 `settings-controller.js`，入口为 `createSkinSettingsController({ document, ui, getConfig, saveConfig, configController, mediaController, applyAll })`，提供 `render(host)`、`syncMenu()`、`clearMenu()`。

`render()` 保留本地视频/图片/字体选择、文件验证、保存、配置更新、刷新与提示的原顺序；布局按钮仍调用现有 UI API。`syncMenu()` 先注销旧菜单，再读取实时配置生成开关菜单；点击时重新读取配置。控制器持有唯一注销函数，`clearMenu()` 在插件 dispose 的原位置调用它。

设置页的 `api.ui.configTab` 注册、配置变化订阅和插件 dispose 编排保留在模板。控制器在原设置渲染函数位置构造，初始化时仅保存依赖，不注册菜单或写配置。媒体生命周期与配置状态继续由原控制器负责，取消上传仍静默退出。

## 不变约束

- skin **2.0.50**，Oxygen/LTS **2.0.55**，Hydrogen **2.4.2**；20 个显式 skin 模块，正式 21、开发 26 个套件模块。
- 不新增依赖、配置、文案、事件、持久化字段或运行时加载器；保持文件验证规则、设置布局和菜单行为。
- 前十九模块、Hydrogen 源码及两份产物保持不变；UTF-8 无 BOM、LF；保留当前分支与既有改动，不提交或推送。

## 验证范围

先保存 369 个哈希与模板快照，复用设置资源导入、菜单切换及双模式停用后上传 4 项基线。构建 fixture 先检测缺失模块，再接入实现；最终复用设置 schema、配置变化、媒体替换/停用和界面切换等相关测试。Node 单 worker、512 MiB 堆上限，不新增重复行为测试。

本阶段仅移动两段已有逻辑；用函数/模板归一化审计、现有设置/菜单交互测试及产物检查验证，不重复运行路由与阅读浏览器冒烟、全量 Node、无关 AI 或压力测试。独立审查只读，不运行额外测试。证据目录为 `artifacts/skin-settings-split/`。
