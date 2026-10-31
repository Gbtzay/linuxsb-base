# skin 最终集中验收

2026-10-31，第 25 阶段对完成拆分后的 skin 进行集成复验和文档收尾。既定 25 阶段路线至此完成，剩余 **0** 个阶段；模板保留必要装配，不再按行数继续拆分。当前使用与开发约定仍以 [项目 README](../README.md)、[开发规范](CONVENTIONS.md) 和 [skin 源码入口](../plugins/skin/README.md) 为准。

## 最终源码边界

生成器 [build-skin.mjs](../scripts/build-skin.mjs) 显式列出 **29 个模块**，每个模块对应一个唯一注入点；完整文件清单和接口说明在 [skin 源码入口](../plugins/skin/README.md)。模块按职责组织为：

- 状态与资源：画布状态、样式、配置、媒体，以及外观和资源设置。
- 原生节点与入口：正文、搜索、导航、资料卡、站点卡片、在线状态、旧三栏卡片/页签、顶栏和插件目录。
- 路由与阅读：SPA 文档、视图缓存、导航事务、历史恢复、首页加载、正文增强、时间轴和文本选择。
- 宿主与生命周期：浮层布局、画布滚动、共享窗口兼容实现、画布宿主和总运行时。

[skin.template.js](../plugins/skin/skin.template.js) 保留 **1110 行**：userscript 头和 manifest、挑战页检测、AI markup、模块装配、公共注册、旧三栏渲染，以及视图/路由、滚动根和性能探针适配。运行时工厂在直接依赖之后初始化，SPA 取消刷新与设置引用通过延迟回调/getter 接入，setup 最后才执行首次 `applyAll()`。

清理责任保持明确：运行时编排总卸载，画布宿主管理局部挂载；原生节点仍由接管它们的控制器归还。SPA `unbind()` 调用历史控制器 `dispose()`，公共 UI、设置页、事件及 DOM 订阅由 API `own()` 登记并按顺序释放，媒体区分可重用 `reset()` 与永久 `dispose()`。接口细节见源码入口的“最终边界与清理责任”。

## 本轮复验

使用 Node.js 24，四组现有用例顺序执行：单 worker、512 MiB Node 堆上限和 `--test-force-exit`。没有新增或修改测试、夹具及测试入口。Node 共报告 **86 项检查通过**：

- 生成器 **61/61**：每个模块的源变更进入产物，过期检查只读，拒绝坏输入与注入点错误，独立 skin 与当前源码一致。
- 生命周期/导航 **9/9**：双向模式切换，挂载失败恢复，停用归还正文和状态，油猴菜单开关；实际软跳完成后的页面元信息、正文聚焦和播报；双界面版块导航/后退复用壳；缓存双轴滚动恢复；关壳和停用归还浏览器历史滚动模式。
- 单画布 **10/10**：5 个顶层用例，其中五类页面挂载另含 home/forum/topic/user/settings 共 5 个子用例。覆盖真实正文和侧栏、工具面板互斥、原生搜索展开/关闭、中屏与窄屏站点信息关闭后归还原节点，以及插件停用后旧入口复核。
- 双界面阅读 **6/6**：两种模式各检查输入法/草稿期间延迟插入、编辑器与选区保留、切换界面保留真实节点和回复去重，以及中止在途实时流、拒绝迟到响应/旧按钮写回、重新启用可用。

四组均无失败、取消、跳过或 todo。名称筛选之外的用例未运行，不计入覆盖数。挂载失败用例主动移除正文出口，日志保留一次 `shell mount failed; restored native page`，其恢复断言通过；这是预期诊断。

开发构建、正式/LTS 构建，以及正式/开发分发校验、skin 新鲜度和零跳过预算检查全部通过。独立 `plugins/skin.user.js`、正式 Hydrogen/Oxygen/LTS 三份产物和开发 Hydrogen/Oxygen 两份产物，共六个文件的 SHA-256 均与本阶段开始时一致。本次没有修改实现，因此没有提升版本；核对快照为 skin **2.0.59**、Hydrogen **2.4.2**、Oxygen/LTS **2.0.64**，正式 **21**、开发 **26** 个套件模块。

## 范围与收尾审计

以阶段开始时的 **399 文件**哈希为基线，本轮只更新五份当前文档，并新增本文和阶段计划，共 **7 个文档文件**。其余 **394 个基线文件**保持不变，包含全部 **30 个 skin 源文件**（29 模块与模板）、**57 个 Hydrogen 源文件**、**77 个测试/夹具文件**、构建/验证/冒烟入口及全部既有阶段记录。没有删除文件，原有未提交改动保留。

变更文档通过 UTF-8 无 BOM、LF、无尾随空白、**138 个本地链接**和 `git diff --check` 检查。一次独立只读审查无 Critical、Important 或 Minor 发现，复核了基线范围、测试主张、装配/清理责任和验收限制；审查者未改文件，也未运行测试、构建或浏览器。详细证据记录于 `artifacts/skin-final-acceptance/` 的 `baseline.json`、`audit.json`、`review.json` 和 `validation-summary.json`。

## 可重复的轻量验收

在仓库根目录按顺序运行，先重建测试实际读取的产物；每条命令成功后再执行下一条：

```powershell
$env:NODE_OPTIONS='--max-old-space-size=512'
npm run build:dev
npm run build

node --max-old-space-size=512 --test --test-force-exit --test-concurrency=1 test/skin-source.test.js
node --max-old-space-size=512 --test --test-force-exit --test-concurrency=1 --test-name-pattern='界面模式双向切换|模式挂载失败时清理壳标记|停用皮肤还原正文父节点|氢壳：油猴菜单可切换开关|软跳提交同步页面元信息并聚焦播报正文标题|关闭氢壳和停用插件归还原生history|缓存命中恢复双轴滚动和页面信息|导航拆分：版块软跳及后退更新导航和文案' test/skin.test.js
node --max-old-space-size=512 --test --test-force-exit --test-concurrency=1 --test-name-pattern='五类页面挂载单画布宿主|统一工具 Sheet 互斥|顶栏搜索仅占放大镜|中屏站点信息使用 Sheet|插件功能面板打开后若插件停用' test/skin-canvas.test.js
node --max-old-space-size=512 --test --test-force-exit --test-concurrency=1 test/reading-acceptance.test.js

node scripts/check-dist.mjs
node scripts/check-dev-dist.mjs
node scripts/build-skin.mjs --check
node scripts/check-test-skips.mjs
git diff --check
```

本轮通过日志封装器执行相同 Node/npm 命令，完整输出保存在 `artifacts/skin-final-acceptance/`：`generator.log`、`lifecycle.log`、`canvas.log`、`reading.log`、`build-dev.log`、`build-release.log` 和四份 `verify-*.log`。该目录被 Git 忽略；本文和 [阶段计划](superpowers/plans/2026-10-31-skin-final-acceptance.md) 保留可随仓库追溯的结果与命令。

## 验收限制

本次是本地源码和产物的定向集成验收。JSDOM 使用既有站点快照和受控传输，检查 DOM 身份、事件、状态及清理断言；不能据此推断真实布局、渲染帧率、线上请求或真人设备表现。`--test-force-exit` 控制测试进程退出，512 MiB 限制 Node 堆而非全部进程内存，二者都不构成泄漏或性能验收。

本轮未运行完整 Node 套件、浏览器冒烟、压力或无关 AI 测试，也未复测真实表单提交、线上 Cloudflare、远程媒体和视觉效果。既往浏览器覆盖见 [双界面阅读验收](reading-acceptance.md)，不算本轮证据。已知 JSDOM `requestSubmit` 缺失由此前选择用例记录，本次未选择该用例。

共享窗口 `enabled()` 继续返回 false；保留的兼容接线不代表已验证启用后的旧窗口交互。本轮无提交、推送或发布；发布前验证仍按开发规范执行，不能以本次路线完成替代发布验证。
