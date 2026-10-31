# skin 媒体生命周期拆分 Implementation Plan

> **For agentic workers:** 沿用 writing-plans / TDD 流程，在当前已授权工作区逐项实现并完成验证。

**Goal:** 提取媒体控制器并修复可复现的资源生命周期竞态。

**Architecture:** 独立控制器持有资源、请求代次和 DB 连接，模板提供实时上下文并负责配置/UI；显式生成器组合为独立 userscript。

**Tech Stack:** Node 24、原生 ES 模块、node:test、jsdom、Chromium。

**Spec:** `docs/superpowers/specs/2026-10-30-skin-media-split-design.md`

## Global Constraints

- UTF-8 无 BOM、LF；无新依赖，保留先前改动，不提交或推送。
- skin 2.0.38、Oxygen/LTS 2.0.43、Hydrogen 2.4.2；正式 21 / 开发 26 个模块。
- 保留媒体来源优先级、背景挂载位置、动效/错误回退；不拆路由或 DOM 接管。

### Task 1: 控制器与真实生命周期回归

**Files:** 新增 `plugins/skin/media-controller.js`、`test/skin-media.test.js`；修改 `plugins/skin/skin.template.js`、`test/skin.test.js`。

**Interfaces:** 设计中的工厂与四个方法；模板上传通过 `saveFile()`，卸载调用 `dispose()`，界面重挂载调用 `reset()`。

- [x] 保存提取前模板和独立脚本到 `artifacts/skin-media-split/`。
- [x] 在旧代码上复现字体竞态、本地文件替换及上传晚到写配置问题；另覆盖令牌恢复，保存失败日志。
- [x] 补齐模块测试，覆盖资源替换/释放、加载去重、DB 生命周期和保存取消。
- [x] 实现控制器及模板适配，保留其余运行时，定向测试通过。

### Task 2: 构建契约、文档与完整验收

**Files:** `scripts/build-skin.mjs`、`test/skin-source.test.js`、`scripts/run-tests.mjs`、`test/test-runner.test.js`、版本文件、源码说明与文档索引、生成产物。

- [x] 先增加媒体注入、源变更及坏输入失败测试，再扩展生成器并纳入 test:skin。
- [x] 更新版本与当前文档，保留历史记录。
- [x] 比较提取前后其余模板，除媒体适配、注入标记和版本外一致。
- [x] 顺序执行 build:dev → build → verify:profiles → verify:skin → verify:test-skips → test:all → smoke:browser。
- [x] 核对变更、编码、链接，记录实际验证结果。

## 执行记录（2026-10-30）

第三步已完成。媒体控制器管理背景节点、监听器、对象 URL、字体与数据库连接；模板通过实时上下文提供配置和宿主。背景与字体独立判断请求身份，重复在途请求去重，过期结果清理后退出。reset 可重用，dispose 永久停用；本地资源同键覆盖会触发替换。

验证结果：

- 在原模板快照上复现 8 项失败回归：双界面停用后字体残留、旧字体晚到、同键视频替换，以及上传晚到改写配置。更新后 10 项双界面生命周期回归全部通过，包含原本正常的字体令牌保持场景。
- 19 项控制器测试覆盖资源优先级、同键视频/图片/字体替换、过期结果和错误隔离、宿主迁移、在途去重、失败重试、数据库晚到关闭及保存取消。复用真实共享媒体 API，在浏览器平台边界控制异步加载。
- 独立代码审查发现初版去重会缓存已失败请求，阻止后续重试；新增两项失败测试后修复，审查复核通过。控制器、构建和测试调度专项共 33 项通过。
- 原模板 7053 行，拆分后 6822 行；除明确列出的媒体声明/函数、两处上传适配、reset/dispose、注入标记、版本与注释外，其余运行时逐字一致（归一后 292914 字节）。
- 顺序完成 build:dev、build、verify:profiles、verify:skin、verify:test-skips、test:all、smoke:browser，均成功。
- 完整 Node 回归：1068 项通过，0 失败、0 取消、0 跳过。日志包含已有 jsdom 导航/表单/媒体平台未实现提示；实际浏览器行为另由 Chromium 冒烟验证。
- Chromium 冒烟通过：旧三段式、单画布宽/中/窄视口、视频背景层级、减少动效、快速导航、软跳、焦点与历史恢复，以及阅读中心桌面/触屏、多标签接管等 9 个阅读场景。使用离线站点快照。
- 本轮 17 个源文件和文档通过 UTF-8 无 BOM / LF 检查，49 个本地文档链接有效；本轮已跟踪文件通过 git diff --check。
- skin 2.0.38、Oxygen/LTS 2.0.43；Hydrogen 2.4.2，正式 21 / 开发 26 个模块。无新依赖，未提交或推送。

证据位于忽略目录 artifacts/skin-media-split/：原模板/独立脚本快照、失败及通过测试日志、verify-extraction.mjs 与 template.diff、构建/源码/审查汇总、完整 Node/浏览器日志、reading/results.json 与界面截图。

下一步：分离工具目录、插件入口和原生搜索，继续使用现有阅读及导航验收；DOM 接管与 SPA 提交生命周期留待最后阶段。
