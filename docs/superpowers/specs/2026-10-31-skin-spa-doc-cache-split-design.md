# skin 第十一步：SPA 文档与缓存拆分

日期：2026-10-31。基线为第十阶段完成后的工作区，保留全部既有未提交改动。

## 目标与边界

将上一阶段预告的 SPA 工作按生命周期细分，本阶段提取路由文档和首页视图缓存，下一阶段再提取导航请求事务。`navigateSpa` 继续串联用户离页确认、取消请求、历史恢复、进度、焦点及路由通知；不在本轮扩展路由白名单或修改提交顺序。

新增 `spa-document.js`，入口 `createSkinSpaDocumentController({ window, document, getConfig, findRouteOutlet, nativeLeftRails, lifecycle, applyHistory })`。`lifecycle` 显式提供已有侧栏/资料归还、持久卡片标记与重绑、原生标记和在线状态同步函数。控制器不绑定事件、计时器或发请求：

- `topicUrl`、`accepts`、`cacheKey` 保留同源与路由判断、首页别名、查询参数及帖子 canonical 校验。
- `containsTopicPostContent`、`snapshotOutletAttrs`、`captureHead` 为真实节点存档提供信息。
- `parse(html)` 解析缓存页面，移除脚本并保留侧栏隐藏/持久卡片接线。
- `matchesTopic(pageDoc, url)` 校验帖子 canonical 和有效正文；`commit(pageDoc, remote, url, historyMode)` 沿用历史、head、正文、在线状态的提交顺序。
- `applyView(entry, outlet)` 恢复真实节点片段、属性与已有 head 节点。不得执行远端脚本或创建额外 head 元信息节点。

新增 `view-cache.js`，入口 `createSkinViewCache({ window, document, request, getContext, parse, isTopic, cacheKey })`。`getContext()` 返回 `{ enabled, viewKey, href }`，每次读取当前绑定/壳状态及页面。控制器持有五项上限的 Map、首页预取与刷新请求、30 秒刷新计时器和失效代次：

- `remember(key, entry)` 更新插入顺序并淘汰最旧项；`take(key)` 消费缓存，帖子正文不使用缓存。
- `seed()` 为非首页预取首页，`schedule()` 安排后台刷新，`onVisible()` 恢复隐藏期间延期的刷新。
- `stop()` 清计时器、使旧请求失效并取消可取消请求；随后可重新 seed/schedule。旧请求晚到不得写缓存、触发解析或清掉重启后的在途状态。
- `clear()` 释放片段缓存，在壳拆除时调用。

模板保留真实节点的 `stashView` 编排、可见性监听的绑定/解绑，以及导航事务。两个控制器使用已有源码及明确依赖，不引入第二份算法或运行时加载器。

## 不变约束与验证

skin **2.0.46**，Oxygen/LTS **2.0.51**，Hydrogen **2.4.2**；源码模块 16 个，正式 21、开发 26 个套件模块。前十四源码模块、Hydrogen 源码与两份产物保持不变；UTF-8 无 BOM、LF，无新依赖。

先保存基线并运行 7 项已有软跳/head/缓存/模式恢复用例。沿用生成器参数化契约，只新增 3 项无 DOM 缓存行为测试，验证停用后的预取失效、刷新重启隔离和缓存消费/淘汰；对暴露的问题按 systematic-debugging 查明原因后修正。模板提交逻辑使用既有集成用例验证，避免重复创建相同测试。

所有 Node 测试单 worker、512 MiB V8 堆上限；浏览器逐套运行，Node 堆上限 384 MiB。最终运行受影响的软跳集成、legacy/iOS 27/双模式阅读冒烟及构建校验，不跑全量 Node、无关 AI 或额外压力测试。证据目录为 `artifacts/skin-spa-doc-cache-split/`，独立只读审查不额外运行测试。
