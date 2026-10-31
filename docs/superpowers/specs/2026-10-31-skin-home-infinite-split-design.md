# skin 第十三步：首页无限滚动拆分

日期：2026-10-31。以第十二阶段完成后的工作区为基线，保留既有未提交改动。

## 结构与职责

新增 `home-infinite-controller.js`，入口为 `createSkinHomeInfiniteController({ window, document, getConfig, request, cacheKey, containsTopicPostContent, getScrollRoot })`。控制器拥有当前绑定状态 `homeInf` 和按真实列表节点保存的 `homeInfRecords` WeakMap，集中首页判定、站点开关、分页判断、去重、滚动监听、请求、状态提示和路由感知清理。

- `sync()` 按当前配置、URL、列表/分页节点身份和滚动根决定保留、重绑或停止；原生已接管分页的让行条件保持。
- `unbind()` 保存已加载页和去重记录，解绑原监听目标，清理滚动计时器与状态提示，取消请求并释放当前状态；WeakMap 记录保留供同一列表重挂载。
- 请求完成后仍先核对状态身份、首页路由键和当前连接的列表/分页节点；旧响应不能写入帖子正文或新列表。加载中不重复发请求，失败后保留重试能力。

模板只保留 `syncHomeInfiniteScroll` / `unbindHomeInfiniteScroll` 的方法别名，现有渲染、SPA hooks、界面切换和停用调用位置不变。控制器在 SPA 事务控制器之前构造；已有文档控制器提供 `cacheKey` 与 `containsTopicPostContent`，滚动根通过 `getScrollRoot` 实时读取。构造函数仅保存依赖和状态，不访问尚未初始化的渲染资源。

## 不变约束

1. skin **2.0.48**，Oxygen/LTS **2.0.53**，Hydrogen **2.4.2**；18 个显式 skin 模块，正式 21、开发 26 个套件模块。
2. 不新增依赖、配置、持久化字段、事件或运行时加载器；保留请求超时 15 秒、retry 0、queue false、80ms 滚动节流和距底部 100px 的触发条件。
3. 保留分页隐藏、结束/失败提示、去重键和 `sb:topic-list-updated` 事件语义及顺序；本阶段不扩展分页规则或改变产品行为。
4. 前十七模块、Hydrogen 源码和两份产物保持不变；UTF-8 无 BOM、LF；在当前分支保留全部既有改动，不提交或推送。

## 验证

用户要求灵活、低负载测试。先保存基线哈希和模板快照，复用双模式的计时器跨路由与迟到响应检查；生成器 fixture 先观察模块缺失，再提取实现。复用现有首页加载、原生隐藏分页、取消导航、缓存返回与停用检查，不新增重复行为测试或修改选择器。

Node 测试单 worker、512 MiB V8 堆上限。浏览器按 legacy、iOS 27、reading 顺序执行，Node 堆上限 384 MiB；不运行全量 Node、无关 AI 或压力测试。独立审查只读，不运行额外测试。证据目录为 `artifacts/skin-home-infinite-split/`。
