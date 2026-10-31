# skin 第十步：配置适配拆分

日期：2026-10-31。基线为第九阶段完成后的工作区，保留全部既有未提交改动。

## 目标与结构

新增 `plugins/skin/config-controller.js`，集中插件配置读取/一次性软跳迁移、单画布状态存取、站点和宽度上下文、外观校验/预设、媒体键配置、布局覆盖与令牌输入适配。已有 `canvas-state.js` 保留纯状态算法，作为显式 `stateApi` 注入，不复制实现或引入模块加载器。

入口为 `createSkinConfigController({ getConfig, saveConfig, store, getLocation, getViewport, stateApi, sanitizeTokenValue, isHttpsUrl })`。控制器不访问 DOM，不发请求或创建计时器。

- 读取：`config`、`state`、`effective`、`siteKey`、`widthClass` getter，`effectiveUiMode()`、`tokenValues()`。
- 生命周期：`reload()` 重新读取插件配置；`read()` 从存储读取/迁移画布状态；`save()` 写状态副本；`refreshContext()` 重算站点、宽度和有效覆盖。
- 修改：`setAppearance(name, value, { defer })`、`setBackgroundMode(mode)`、`setMediaKey(kind, key)`、`choosePreset(preset)`、`resetAppearance()`、`persistSurfaceRect(id, rect)`、`resetLayout()`；有效修改返回 `true`，无效输入返回 `false`，供模板决定是否更新界面。`defer` 只暂缓保存。
- 旧设置：`saveLegacyMedia(kind, key)` 使用原有字段组合保存插件配置并重新读取配置。

模板保留 manifest schema、设置面板/菜单和文件读取交互、CSS 属性写入、媒体控制器调用、滚动位置保护及 SPA 编排。配置事件仍先记录旧模式与滚动位置，再重读配置和画布状态并刷新界面。旧窗口注册/布局迁移属于共享窗口编排，本阶段保留。

## 不变约束

1. 不改变配置字段、默认值、存储键和状态版本。帖子软跳迁移沿用 `topicSpaNewWorldDefaultMigrationV1`，迁移后尊重用户关闭；画布沿用 `canvas-state:v2`。
2. 外观数值边界、颜色/字体清洗、HTTPS 校验和视频/图片互斥保持一致。本地媒体成功保存后才写配置；文件存储与取消继续由媒体控制器管理。
3. 外观预设清除当前站点的外观覆盖，保留布局；布局重置不删除外观，站点与宽度桶保持隔离。保存复制数据，避免调用方后续修改污染存储。
4. 存储异常维持已有非致命行为；不引入新的持久化格式、资源或依赖。前十三个模块和 Hydrogen 实现保持不变。
5. skin 2.0.45，Oxygen/LTS 2.0.50，Hydrogen 2.4.2；正式 21、开发 26 模块。

## 验证

用户要求低负载、灵活测试：先运行少量现有配置专项，再复用外观、媒体、布局、模式切换及迁移用例；只补少量无 DOM 的控制器边界检查。给 `skin-canvas.test.js` 夹具加入与现有 skin 测试一致的逐例关闭，避免遗留窗口和定时器。单 worker、512 MiB V8 堆上限；浏览器按影响范围运行既有 iOS 27 冒烟，旧三栏由现有配置专项与 legacy 冒烟覆盖，不重复全量 Node 和无关 AI 测试。

证据目录：`artifacts/skin-config-split/`。最终核对独立/dev/release/LTS 新鲜度、零跳过预算、编码和链接，进行只读审查并记录实际运行范围。
