# skin 导航信息拆分设计

第五阶段将版块目录、页面文案、活动链接判断、画布页面分类与导航列表数据提取为 `plugins/skin/navigation.js`。沿用前四步生成链路；模板继续负责渲染、点击事件、浮层关闭、原生节点接管与 SPA 提交。

## 接口与职责

`createSkinNavigation({ document, getPage, getForums, getLocation, parseTopic, store, homeSorted })` 返回 `collectBoards()`、`pagePath()`、`locationText()`、`isActiveHref(href)`、`canvasPageType()`、`navigationEntries()`。

- getter 每次调用时读取当前基座页面、版块清单和地址，不在创建模块时捕获路由快照。
- `collectBoards()` 保留完整基座版块清单优先、原生 `.forum-nav` 回退与去重；合并实时有限数值和 `boardCounts` 缓存，保留无实时主题数页面的历史数值及真实的零。
- `pagePath()`、`locationText()`、`isActiveHref()` 和 `canvasPageType()` 保持原分支及回退顺序。帖子标题继续优先使用基座解析器，失败后读取原生标题；活动链接保持旧三段式现有语义。
- `navigationEntries()` 返回 `{ href, label, group }[]`，保留全部主题、新帖子、当前页面、收藏、搜索、最多 80 个版块的顺序和原始 href 去重规则。排序地址由 `homeSorted('post')` 提供；当前页保留 query/hash；收藏和搜索入口在每次调用时读取当前 DOM。
- 模块只读取 DOM、生成数据并沿用版块计数存储，不绑定事件、不持有 DOM 所有权、不请求页面，不增加清理接口。渲染仍通过现有转义或 `textContent` 完成。

## 生成与验收

生成器新增唯一 `@LSB_SKIN_NAVIGATION` 注入点，所有输入继续拒绝模块伪造注入点、坏编码、语法错误和未配对 AI 标记。独立插件、开发、正式、LTS 使用同一导航实现。

测试覆盖动态路由/版块/DOM、计数缓存和回退、标题解析失败、导航顺序/去重/上限、query/hash，以及双界面软跳后的标题和活动状态。先记录旧运行时行为与生成器失败，再提取；保存提取前快照和剩余模板比较，确认 SPA 生命周期没有变化。完整开发/正式构建、产物校验、零跳过校验、Node 回归及浏览器冒烟均需本轮执行。

skin 2.0.40、Oxygen/LTS 2.0.45、Hydrogen 2.4.2；正式 21 / 开发 26 个模块。无新依赖，UTF-8 无 BOM、LF。继续当前工作区，保留既有改动；本轮不提交或推送。窄屏原生脚本滚动协作问题留在后续 DOM/SPA 生命周期阶段。
