# 第二十四阶段：入口生命周期与清理逻辑整理

本阶段完成既定拆分工作，下一阶段仅做集中验收、文档与最终收尾，仍以第 25 阶段结束，不继续拆分必要的模板编排。

## 责任与时序

新增 `plugins/skin/runtime-controller.js`，导出 `createSkinRuntimeController`。迁移入口的模式挂载/卸载、50ms 刷新防抖、宽度断点监听、挑战页属性观察和插件停用清理；持有原来的六个可变状态。三个现有回调（配置变更、晚到原生节点、停用）改为命名方法，注册点与顺序留在模板。

控制器在所有所需运行模块创建后、设置控制器创建前初始化。大部分方法直接传入，SPA 的 `cancelRefresh` 回调延迟引用运行时，运行时通过 `getSettingsController` 延迟取得随后创建的设置控制器。工厂不启动监听或执行依赖，首次 `applyAll()` 仍在 setup 的末尾。

模板继续负责 manifest、模块装配、挑战页识别、旧三栏渲染、样式令牌、路由提交适配、公共 API/事件/设置注册与 debug。公共 UI 控制器注册由基座 `api-factory.js` 的 `own()` 管理注销；SPA `unbind()` 已调用历史控制器的 `dispose()`。保留这两条清理链，避免重复归还或改变总清理顺序。

`shellTokenProps` 是样式适配层与拆壳共享的原 Set，按原对象传入；媒体 `reset` 和 `dispose`、缓存 `clear`、各类真实节点还原、启动占位样式在挑战页中的保留分支，以及失败挂载后恢复原生页面的顺序均不改变。仅移除已无读取/赋值用途的 `canvasStatusObserver` 声明，不做额外行为修复或删除兼容路径。

## 接口

```js
createSkinRuntimeController({
  window, document, configController, timelineController, mediaController,
  onlineController, viewCacheController, spaController, canvasHostController,
  shellTokenProps, getSettingsController, challengeAttr, isChallengeDocument, hooks,
})
// 返回 applyAll、scheduleRefresh、cancelRefresh、onConfigChanged、onNativeNode、dispose。
```

`hooks` 只包含原编排调用的挂载、还原、宽度、样式、滚动和原生节点适配方法。配置与 SPA 的原方法别名在运行时内部从原控制器取得；settings 在操作发生时读取。三个回调体除设置 getter 以外原样迁移，取消刷新继续先 clearTimeout 再将句柄归零。

## 验证边界

沿用低负载定向验证：现有生成器参数化 fixture 增加模块登记，先验证缺少模块的预期失败；复用配置切换、断点重挂、挑战恢复、失败挂载、停用、菜单、历史模式、软跳焦点及晚到原生节点用例。失败挂载用例本来就会输出恢复原生页面的警告，先在基线确认，不修改测试来屏蔽提示。

不新增行为测试，不跑全量、压力、无关 AI 套件或浏览器冒烟。所有 Node 进程限制 512 MiB，测试使用一个 worker 和 `--test-force-exit`。顺序构建 dev/release/LTS，验证分发、生成新鲜度及零跳过预算。一次独立只读审查核对每条依赖和清理时序；哈希/原文审计保护先前 28 个模块与所有既有行为测试。

工作区 `codex/integrate-origin-main` 保持未提交状态，不提交、推送、移动分支或新建工作树。396 文件基线及日志保存在 `artifacts/skin-runtime-split/`。
