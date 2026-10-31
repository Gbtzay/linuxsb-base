# skin 第十二步：SPA 导航事务拆分

日期：2026-10-31。以第十一阶段完成后的工作区为基线，保留既有未提交改动。

## 结构与职责

新增 `spa-controller.js`，入口为 `createSkinSpaController({ window, document, getConfig, request, routeDocument, viewCacheController, historyController, hooks, perf, pendingClass })`。控制器集中持有导航序号、已填充序号、AbortController、进度计时器、路由隐藏状态、通知重入保护、事件绑定状态和当前视图键。模板不再保存第二份事务状态。

- `navigate(href, options)` 保留路由判断、离页确认、缓存消费、请求/响应验证、提交、历史滚动和绘制后通知的顺序；`options` 仍为 `{ historyMode: 'push', force: false, source: 'user' }`。
- `bind()`/`unbind()` 管理点击、GET 表单、popstate、pageshow 和缓存可见性监听，配合已有历史与缓存控制器。`clear()` 使当前事务失效、取消请求并清除忙碌/进度/页面级隐藏状态。
- `cancelPending()` 保留点击当前地址中断导航后的页面恢复行为；`clearChrome()` 用于共享拆壳清理；`resetView()` 仅在完整 teardown 后清空当前视图键。
- `bound`、`viewKey`、`filled` 是实时 getter；`isCurrent(serial)` 与 `markFilled(serial)` 供模板路由增强回调核对和记录事务序号。

`routeDocument`、`viewCacheController`、`historyController` 使用已有实例与公开方法；不复制其实现。`hooks` 显式提供正文出口、真实节点存档、壳渲染、原生增强、楼层定位、首页无限滚动的暂停/恢复和刷新计时器取消。`perf` 提供 `enabled/now/span/spanAsync/emit/emitGlobal`，保持现有探针事件。所有依赖初始化时仅保存，回调在 setup 完成后的导航中执行。

模板保留真实节点存档、原生正文增强、楼层定位、共享窗口和设置渲染；缓存通过延迟 `getContext()` 读取 SPA 控制器状态，避免构造顺序循环。原来的两次 requestAnimationFrame 或隐藏页 microtask 策略保留，旧序号不得收尾新事务。请求等待时保留旧正文，取消不触发整页回退，验证失败保留原 fallback 语义。

## 不变约束

1. skin **2.0.47**，Oxygen/LTS **2.0.52**，Hydrogen **2.4.2**；17 个显式 skin 模块，正式 21、开发 26 个套件模块。
2. 无新增依赖、配置、路由、持久化字段或事件名；保留请求超时 15 秒、retry 0、进度延迟 90ms 与完成显示 220ms。
3. 前十六模块、Hydrogen 源码和两份产物保持不变；UTF-8 无 BOM、LF；保留当前分支和既有改动，不提交或推送。

## 验证

用户要求灵活、低负载测试。复用连续导航、停用、BFCache、历史/缓存、响应失败、焦点与绘制后通知的现有行为测试，不为拆分重复增加行为用例；仅扩展既有生成器 fixture，证明新模块进入独立/dev/release 产物。

先保存哈希和模板快照并运行 8 项基线；构建契约先观察缺少模块的失败，再提取并运行受影响专项。Node 单 worker、512 MiB V8 堆上限；浏览器按 legacy、iOS 27、reading 顺序执行，Node 堆上限 384 MiB。禁止全量 Node、无关 AI 和额外压力测试。独立审查只读，不运行额外测试。证据目录为 `artifacts/skin-spa-transaction-split/`。
