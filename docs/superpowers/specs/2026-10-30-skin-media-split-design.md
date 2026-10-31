# skin 媒体生命周期拆分设计

第三阶段将视频、图片、字体及媒体库的所有权收拢到 `plugins/skin/media-controller.js`。复用 `api.ui.shellMedia` 的校验、存储和 FontFace 加载；不调整 Hydrogen 的公共 API。

## 接口与责任

`createSkinMediaController({ window, document, media, style, getContext, toast })` 返回 `sync()`、`saveFile(kind, file)`、`reset()`、`dispose()`。

- `getContext()` 返回最新 `config`、`appearance`、`workspace`、`canvasMode`。模板判断实际挂载界面，并保留配置写入、提示文案、路由和 DOM 接管。
- `sync()` 同步背景和字体，返回可等待的 Promise。背景和字体分别记录请求代次；相同请求复用在途工作，已完成但没有资源的失败允许后续同步重试，工作区或本地资源修订变化触发替换。背景本地优先、字体 HTTPS 优先，维持现有规则。
- `saveFile()` 校验并保存当前站点资源，更新本地键的修订号。重置后的在途保存不得继续应用配置，使用 `AbortError` 表达取消。
- `reset()` 使异步请求失效，移除媒体节点和监听器，撤销对象 URL，释放字体，关闭已打开或晚到的媒体库连接。控制器可再次同步，支持界面重挂载。
- `dispose()` 在 reset 基础上永久停用，供插件卸载调用。

## 生命周期验收

先复现并修复字体晚到覆盖、停用后残留、相同本地键替换不刷新，以及上传晚到继续写配置的问题。控制器测试同时覆盖背景与字体请求隔离、重写令牌后的字体恢复、宿主替换、错误回调隔离、加载去重、失败重试、数据库晚到关闭和保存取消。

背景层位置、HTTPS 限制、减少动效、自动播放失败的静止展示、错误回退及双界面阅读交互沿用原行为。每个资源只释放一次；过期结果不修改 DOM、配置或提示。

## 构建与约束

生成器新增唯一 `@LSB_SKIN_MEDIA` 注入点，延续编码、语法、AI 标记和只读新鲜度校验。独立插件、dev/release/LTS 共用源码。无新依赖；skin 2.0.38、Oxygen/LTS 2.0.43、Hydrogen 2.4.2；正式 21 / 开发 26 个模块。保留现有工作区改动，不提交或推送。
