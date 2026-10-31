# skin 插件入口与原生搜索拆分设计

第四阶段提取插件目录和原生搜索两个边界，沿用已提取的状态、样式、媒体模块。导航路由判定、SPA 提交、正文/侧栏接管仍由模板管理。

## 插件目录

`createSkinPluginCatalog({ getInfo, ui, request })` 返回 `features()`、`settings()`、`tools()`、`openFeature(pluginId)`、`openSettings(pluginId)`。

- 统一维护阅读中心、AI 历史（仅开发构建）、签到日历、积分-称号工作台和年度报告的入口定义。
- `features()` 每次读取最新插件状态、面板、RPC 与设置清单，要求插件 active 且实际入口存在。`tools()` 返回旧三段式所需的 plugin/panel/rpc/label，使用相同可用性规则，不再缓存旧快照。
- `settings()` 保留有配置 schema 的已停用插件。打开功能/设置前重新验证，错误统一反馈，不把失效面板回退成其它面板。
- 模板保留渲染、关闭浮层和事件代理。旧三段式保留原 data-lsb-panel/data-lsb-rpc 属性，并增加插件身份用于点击时复核。

## 原生搜索

`createSkinSearchController({ document })` 返回 `host()`、`adopt(host)`、`restore()`、`setOpen(host, open, restoreFocus)`。

- 支持旧搜索表单、新 Meilisearch/role 搜索表单及占位链接；迁移原节点，保留事件、输入值、隐藏字段和校验属性。
- 控制器记录所管理的节点及原 parent/next；原位置仍有效时还原，无效时移除自己管理的节点。其它元素偶然使用相同 CSS 类时不应被迁移或清理。
- 动态替换后的表单继承原位置；跨宿主迁移不改写原位置。重复 adopt/restore 幂等，restore 后可再次接管。
- 单画布的展开、aria、焦点语义保持一致。外部点击/Escape 事件仍由模板注册和解绑，调用控制器更新状态。

## 验收与约束

先用双界面回归验证旧三段式无效入口和失效点击，以及搜索清理误认同类元素的问题。独立模块覆盖实时能力变化、RPC/面板失败、设置独立性、搜索原位还原、动态替换、焦点和无资源状态。

生成器增加唯一 `@LSB_SKIN_PLUGIN_CATALOG` / `@LSB_SKIN_SEARCH` 注入点。独立、开发、正式及 LTS 产物共用源码；保持 AI 块配对、编码、语法和只读新鲜度校验。

skin 2.0.39、Oxygen/LTS 2.0.44、Hydrogen 2.4.2；正式 21 / 开发 26 个模块。无新依赖，UTF-8 无 BOM、LF。保留已有工作区改动，不提交或推送。
