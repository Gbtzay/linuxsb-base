# 文档索引

当前文档于 2026-10-31 按本地源码、构建脚本和测试配置核对；不代表对线上站点或商店发布状态的实时验证。

## 当前维护的文档

- [项目 README](../README.md)：安装方式、正式版与开发版差异、功能清单、插件模板和公共 API。
- [开发规范](CONVENTIONS.md)：套件收录、版本同步、请求权限、资源清理、构建与验证要求。
- [当前行为、限制与反馈](已知问题.md)：界面行为、LTS 范围、数据与权限边界，以及反馈需要的信息。
- [双界面阅读验收](reading-acceptance.md)：阅读路径、浏览器覆盖、旧跳过项的处置和复验命令。
- [skin 最终集中验收](skin-acceptance.md)：第 25 阶段的集成路径、产物一致性、低负载复验命令和限制；既定路线已完成。
- [统一阅读中心](reading-center.md)：最近阅读、稍后阅读、续读入口、本地数据规则和正式查询接口。
- [skin 源码入口](../plugins/skin/README.md)：画布状态、样式生成、媒体控制器、插件目录、原生搜索、导航信息、正文/历史/资料卡/站点卡片/在线状态/旧三栏右侧栏/配置控制器、SPA 文档/缓存/导航事务、首页无限滚动、原生正文增强、资源设置与菜单、顶栏入口与原生外观控件、帖子时间轴、文本选择与操作胶囊、画布外观交互、浮层布局与拖拽缩放、画布滚动与窗口监听、共享窗口兼容实现、画布宿主与面板事件、入口生命周期与清理、装配模板、只读校验流程，以及最终维护边界和清理责任。

## 核对事实的代码入口

- 基座版本：[src/core/core-version.js](../src/core/core-version.js)；套件版本：[suite/version.js](../suite/version.js)。
- 完整、正式与 LTS 模块清单：[suite/order.js](../suite/order.js)。
- 公共插件 API：[src/core/api-factory.js](../src/core/api-factory.js)；站点适配：[src/site/index.js](../src/site/index.js)。
- 开发命令：[package.json](../package.json)；测试集合：[scripts/run-tests.mjs](../scripts/run-tests.mjs)；CI 顺序：[ci.yml](../.github/workflows/ci.yml)。

产品版本仅在当前 README 与开发规范中同步，历史记录保留当时的版本。发现当前文档与实现不一致时，应核实并修正，不从旧公告推断当前限制。

## 历史资料

三份旧公告已从 `docs/` 根目录移入 `docs/archive/`，不再承担当前安装、反馈或开发规范的作用：

- [旧版测试招募](archive/测试招募-氢氧-beta.md)
- [旧版功能征集](archive/功能征集-rc-ga.md)
- [旧版已知问题](archive/已知问题-rc.md)

[阶段设计与实施记录](superpowers/README.md) 保留在原路径。计划中的旧文件名、命令、版本和任务勾选状态按当时语境阅读；是否已经实现，以代码、测试和执行记录核对为准。
