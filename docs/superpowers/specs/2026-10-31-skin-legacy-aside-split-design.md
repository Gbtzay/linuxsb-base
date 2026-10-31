# skin 第九步：旧三栏右侧栏拆分

日期：2026-10-31。基线为第八步已完成的当前工作区，保留已有未提交改动。

## 范围与结构

提取两个 ES 模块，通过显式构建注入到独立插件、开发/正式 Oxygen 和 LTS；不增加依赖或运行时加载器。

- `legacy-aside-cards.js`：`createSkinAsideCardsController({ window, document, store, getSidebars, getPage, isSelfUserCard, isEnabled, syncOnlineDots })`。管理普通卡片原位置、广告/每日热帖持久节点、`asideKeep` 缓存和晚到在线卡片观察器。公开 `adopt(host)`、`restore()`、`restorePersistent()`、`pruneDetached()`、`watch()`、`stop()`。
- `legacy-aside-views.js`：`createSkinAsideViewsController({ window, document, store, getContext, getViews, isEnabled, onSelect })`。管理注册页签、挂载/清理、`aside-active` 偏好和 resize 监听。公开 `setActive(id, aside, persist)`、`sync(shell)`、`destroy()`、`bindResize()`、`unbindResize()`，以及只读 `activeId`、`preferredId`。`onSelect(id, view)` 由模板桥接已有窗口聚焦。
- 模板保留共享宽度判定、页面上下文、外部窗口编排、配置适配、SPA 请求与提交。前十一模块保持不变。

## 行为与生命周期

1. 卡片迁移保持真实节点及监听；普通卡片在缓存页面前归还，失效原位置不复活旧页面；广告和每日热帖跨软跳保留，拆壳时归还当前原生侧栏。
2. 缓存只补缺失的快捷功能、统计和在线卡；快捷功能缓存移除明暗切换控件，真实卡到达后替换缓存。晚到卡进入站点 pane，切换其它页签时一起隐藏。
3. 在线卡缓存不能阻止观察真实在线卡到达。观察器只绑定当前原生侧栏，重绑或停止释放旧观察器；拆壳后不再迁移。在线清单请求仍由第八步控制器负责。
4. 页签保持站点在首位、ARIA 选择态、键盘 tabindex、持久偏好。注册记录变化时清理旧视图，窄屏回退保留偏好，重新挂载继续可用。窗口代理不重复渲染原视图。
5. skin 升至 2.0.44，Oxygen/LTS 升至 2.0.49，Hydrogen 保持 2.4.2；正式 21 模块、开发 26 模块。

## 验证策略

遵循用户要求，复用已有受影响测试；只补晚到在线卡/缓存与观察器清理等关键缺口。单 worker、512 MiB V8 堆上限，浏览器逐项运行；不重复全量 Node 测试或 AI 工作台测试。构建契约验证模块确实进入产物，复核源码差异、产物新鲜度、零跳过预算和文档链接。浏览器使用既有 legacy 与阅读冒烟；只有出现单画布回归证据时才扩大范围。证据保存在 `artifacts/skin-legacy-aside-split/`。
