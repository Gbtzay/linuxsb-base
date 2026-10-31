# Skin Timeline Controller Design

第十七阶段将 legacy 帖子时间轴、楼层滚动联动和相关调度状态移入 `plugins/skin/timeline-controller.js`。保留已有 UI、滚动行为和生命周期顺序。

## 边界与接口

`createSkinTimelineController({ window, document, getPage, getPostSelector, isEnabled, hasPerfProbe, emitPerf })` 持有待执行帧、窗口监听状态及性能上报秒桶/计数，共 4 处状态。提取 10 个时间轴函数和 `perfEmitTimeline`，并将原拆壳路径的取消帧代码包装为 `cancelPending()`，共 12 个函数。

返回 `{ ensure, schedule, bind, unbind, cancelPending }`。模板保留 `ensureTimeline`、`scheduleTimeline`、`bindWindow`、`unbindWindow` 调用名称与位置；在原取消帧位置调用 `timelineController.cancelPending()`。`topic:posts-added` 订阅及其他壳清理编排仍在模板。

通过 getter 实时读取页面、楼层选择器、壳开关和探针能力；复用模板通用 `perfEmit`，不将通用性能上报、SPA、滚动根、历史恢复或共享窗口代码并入时间轴控制器。

## 保持的行为

- 楼层仍按 `data-floor` 稳定排序；主帖、最新和轨道点击仍使用 `scrollIntoView`，尊重减少动效偏好。
- 非帖子路由隐藏而不销毁时间轴；楼层、日期、回复总数、进度和 ARIA 值按原规则更新。
- 一帧内多次调度合并；缺少 rAF 时保持 16ms timeout 回退。`unbind()` 只解绑监听；`cancelPending()` 只取消帧。拆壳路径中两者之间的原清理操作保留。
- 仅探针存在时测量；不足 8ms 不上报、每秒至多两条 `timeline.update`。限频计数不因路由或临时卸载重置。

## 构建与验收

新增唯一 `@LSB_SKIN_TIMELINE` 注入点，skin 显式模块增至 22 个。skin 2.0.52、Oxygen/LTS 2.0.57；Hydrogen 2.4.2，套件正式 21/开发 26 个模块不变。

扩展已有生成器 fixture，先观察缺失模块的预期失败，再运行生成器及现有时间轴/模式切换/停用/新增楼层事件专项。单 worker、512 MiB Node 堆上限，不新增重复行为测试。本阶段未改样式、布局或滚动根，不重跑上一阶段画布浏览器套件，也不把历史结果计为本轮验收。

独立只读审查检查调度回调身份、实时依赖、限频和取消/解绑顺序；基线逐字核对函数与剩余模板，保护前十六阶段改动。下一阶段候选为画布文本选择与上下文操作胶囊。
