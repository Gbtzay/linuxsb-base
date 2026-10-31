# skin 第六步：正文接管与历史生命周期

日期：2026-10-31。接续导航拆分，基线是当前未提交工作区的 skin 2.0.40 / Oxygen 2.0.45；不得用旧 HEAD 覆盖前五步工作。

## 范围与边界

新增 `content-controller.js`，统一正文出口发现、正文/原生侧栏迁移、原位置还原和滚动桥释放。接口为 `createSkinContentController({ window, document, isChallengeDocument, findLeftRails, createScrollBridge })`，返回 `findOutlet(scope)`、`mount(outlet, host)`、`restoreSidebars()`、`syncScrollBridge(root)`、`release()` 以及只读 `scroller` / `bridge`。保留真实节点、表单状态和事件；重复挂载不覆盖原位置。出口替换时旧的已脱离文档的正文不得复活，仍挂载的正文若原父节点失效则回到 body。侧栏按反向迁移顺序还原，允许归还给旧的已脱离页面子树，避免残留在 body。

新增 `history-controller.js`，接口为 `createSkinHistoryController({ window, document, getScrollRoot, readScroll, scrollTo })`，返回 `bind()`、`rememberScroll()`、`apply(target, mode)`、`acceptPop(canLeave)`、`restoreScroll(mode)`、`cancelRestore()`、`cancel()`、`dispose()`。管理既有历史字段、索引、草稿拒绝后的回退，以及 `history.scrollRestoration` 的接管/还原。外部 history.state 字段保留；push 增索引，replace 保持索引，none 不改历史。确认文案、路由合法性、缓存、请求、响应验证和原子提交留在模板。

## 已复现的修复

390px 单画布首页 → 帖子 → 第二页 → 后退两次：保存 280px，skin 2.0.40 恢复瞬间 286px，500ms 后 292px。帧记录显示原生工具栏由 64px 增到 70px。只在恢复写入时对实际滚动根设置 `overflow-anchor:none`，250ms 后归还原样式的独立实验，恢复瞬间及500ms 后均为280px。证据在 `artifacts/skin-lifecycle-split/probe-before/` 与 `probe-anchor-hypothesis/`。

历史恢复仅写入一次坐标；在写入前对当前滚动根暂时关闭锚定，250ms 后恢复此前 inline 值和优先级。该时窗覆盖已观测的原生重排和180ms正文进入动画。wheel、touchstart、pointerdown、滚动键、离页、再次导航、取消和卸载提前结束保护；不定时强制拉回坐标，不全局关闭锚定，不承诺抑制任意晚到的布局变化。若其它代码在保护期改写该属性，清理不得覆盖它。

## 验证及约束

- UTF-8 无 BOM、LF；不新增依赖，不改 Hydrogen 运行时。
- skin 提升到2.0.41；Oxygen/LTS到2.0.46；Hydrogen保持2.4.2；release21模块、dev26模块。
- 生成器显式注入八个模块，独立插件只能由生成器写入。
- Node 模块测试使用真实 JSDOM、真实滚动桥和受控计时器；完整插件回归验证历史拒绝回退、清理和两种界面。
- 浏览器保留原生脚本进行修复前后对照；固定快照冒烟另注入确定性的工具栏重排，检查恢复瞬间与延后结果，不能放宽滚动断言。
- 全部定向测试、dev/release/LTS构建、生成新鲜度、跳过预算、完整Node、浏览器冒烟及独立审查完成后记录验收。
- 当前工作区继续开发；不提交或推送，不重置既有改动。远程脚本探针是补充证据，不作为联网稳定性依赖加入CI。

## 后续边界

侧栏卡片/资料区接管、配置适配、SPA请求事务与正文/head提交仍在模板中，后续按各自资源所有权继续提取；本步不宣称完成整个SPA拆分。
