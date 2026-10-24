# 氢壳窗口化 UI 美化设计

日期：2026-10-03  
状态：设计已确认，实施计划已生成

## 背景

氢壳目前把导航、正文、站点信息和 AI 视图固定在三栏中。现有 `#lsb-shell`、`#lsb-shell-header`、`#lsb-shell-rail`、`#lsb-shell-aside` 以及右栏视图 API 已经被皮肤、AI 工作台和其它插件使用。下一轮 UI 美化需要把壳从“固定三栏 CSS”升级为桌面式窗口工作区，同时保留节点身份、SPA 软跳、缓存还原和现有插件挂点。

本设计沿用“克制原生、跟随站点主题”的默认外观。透明玻璃、视频背景、自定义字体、颜色和模块局部覆盖都属于可选设置；没有设置时，氢壳仍使用站点主题的实底和颜色。

## 目标

1. 顶部品牌与路由栏继续固定；导航、帖子/列表正文、站点信息、AI、统计和时间线等模块成为可独立移动、缩放、滚动和置顶的窗口。
2. 窗口使用 12px 网格吸附，允许临时重叠，点击窗口置顶，并提供“一键整理”和“恢复默认布局”。
3. 位置、尺寸、折叠状态、可见性和 z 序按站点与窗口宽度保存；旧三栏布局首次升级时自动迁移。
4. 支持全局字体、字号、颜色、密度和背景设置；模块检查器可以覆盖单个窗口，也可以恢复继承全局值。
5. 支持本地或 HTTPS URL 视频背景，以及系统字体、本地字体文件或 HTTPS 字体 URL；资源失败时可安全降级。
6. 在 1100px、700px 两个断点下提供确定的降级行为，移动端不出现横向溢出或不可操作的浮动窗口。
7. 不改变路由、AI 请求、引用校验、站内写操作确认、模型协议或其它业务语义。

## 非目标

- 本轮不改 AI 工作台的请求和安全链；AI 仅获得新的窗口宿主。
- 本轮不重新设计站点主题插件、帖子内容语义或原生表单提交。
- 不允许任意 CSS 文本直接写入页面；自定义 UI 通过经过校验的令牌和模块属性完成。
- 不把本地视频、字体 Blob 写入配置导出或 `localStorage`；布局和令牌可以作为普通 JSON 迁移。
- 不在窄屏强行保持多个同时可见的自由窗口。

## 视觉与窗口模型

### 固定层与工作区

`#lsb-shell-header` 是唯一固定的品牌/路由层，默认高度 48px。其下新增 `#lsb-shell-workspace`，工作区覆盖剩余视口并作为窗口的定位上下文。`#lsb-shell`、现有 header、rail、aside 的 ID 不变，供已有插件继续查找。

窗口使用以下统一结构，已有窗口的业务节点直接放入结构，不复制节点：

```html
<section data-lsb-shell-window="content" class="lsb-shell-window" role="region" aria-labelledby="..."></section>
```

窗口的标题栏、移动按钮、最小化/恢复按钮和 resize handle 由 skin 生成。正文、列表、导航和右栏的业务 DOM 保持原节点身份。正文窗口的内部滚动容器是窗口本身的内容区；导航、站点信息和 AI 也各自拥有独立滚动位置。

窗口元数据：

```text
id          稳定字符串：nav/content/site/ai/timeline/stats 或插件注册值
label       可见标题和无障碍名称
rect        x、y、width、height，均为工作区 CSS 像素
min         每个窗口的最小宽高
visible     是否显示
collapsed   是否只保留标题栏
z           当前置顶顺序
overrides   局部令牌；缺省字段表示继承全局值
```

正文窗口必须包含帖子、首页列表和分页的真实 DOM，并把滚动事件转发给原有需要 window scroll 的代码。窗口关闭或 skin 停用时，正文节点还原到原始 route outlet；不允许留下克隆节点或隐藏的孤儿表单。

### 移动、缩放和吸附

- 指针按下标题栏开始拖动，使用 `setPointerCapture`，移动过程中只更新 transform；pointerup 时提交 left/top 并保存。
- 四边和四角提供 resize handle，最小尺寸由窗口类型定义；触摸 handle 至少 44px，视觉尺寸可以更小。
- 坐标吸附到 12px 网格；距离视口边缘或其它窗口边缘不超过 12px 时吸附。吸附只改变落点，不禁止用户临时重叠。
- pointerdown、键盘聚焦和通过 API 选中视图都会把窗口置顶。z 序只在当前站点/宽度布局内保存。
- “一键整理”按窗口类型生成默认列/行，保留已注册窗口，跳过不可见窗口；布局损坏时也使用该算法。
- 移动窗口时不触发路由，不改变正文滚动位置；点击窗口内部的链接、表单和 AI composer 仍走原有事件链。

### 窄屏降级

- `width >= 1100px`：完整自由窗口模式，允许重叠和独立滚动。
- `700px <= width < 1100px`：窗口仍独立，但自动吸附到安全区域，限制最大重叠面积和最小可见标题栏；正文优先获得可用宽度。
- `width < 700px`：进入单窗口堆叠模式，只有当前模块显示内容区；顶部窗口切换器切换正文、导航、站点信息和 AI。窗口位置/尺寸设置仍保留，回到宽屏时恢复。
- 窄屏布局不依赖 hover；滚动、关闭、切换和恢复默认都可通过键盘和触摸完成。

## 既有 DOM、SPA 和滚动兼容

### 节点迁移

`ensureShell()` 仍只创建一个 `#lsb-shell`。实现新增 `ensureWorkspace()` 和 `mountShellWindows()`：

1. `#lsb-shell-rail` 标记为 `nav` 窗口，保留现有导航、用户卡、工具按钮和设置入口。
2. `#lsb-shell-aside` 标记为 `site` 窗口，保留 `#lsb-shell-aside-tabs`、`[data-lsb-shell-aside-pane]` 和各 pane 的滚动位置。
3. `findRouteOutlet()` 找到的 `main.wrap`/`main` 放进 `content` 窗口；只移动节点，不重建正文。
4. 时间线、统计和插件窗口通过窗口注册 API 创建。没有注册内容时不生成空白窗口。
5. AI 工作台注册 `windowId: 'ai'` 后使用独立 AI 窗口；未升级的旧 `shellAsideView` 默认仍挂在 `site` 窗口中。

每次 SPA 提交后重新执行 `mountShellWindows()`，但复用已有窗口容器和 layout manager。route outlet 的属性、事件监听和节点引用继续由现有 `stashView`/`applyView` 管理。

### 滚动桥

window 模式下 `body` 不再承担正文滚动，content 窗口是滚动根。skin 增加只在壳开启期间生效的 `shellScrollBridge`：

- `window.scrollY`/`pageYOffset` 读取 content scrollTop；`window.scrollTo()` 转发到 content scroller，并接受现有数字和 options 两种调用。
- content scroller 的 scroll 事件向 window 派发兼容事件，同时派发 `lsb:shell-scroll`，供新代码使用；停用壳时恢复原生 descriptor 和事件监听。
- 时间线、首页无限滚动、SPA 缓存和 `window.scrollTo` 的现有调用改用桥接 API；缓存记录同时保留 `scrollTop`，读取旧缓存时回退到 `scrollY`。
- `IntersectionObserver` 或第三方代码若需要明确根节点，可以从 `api.ui.shellScrollRoot()` 获取；不存在壳时返回 `null`。
- bridge 安装失败时不阻塞页面，回退为旧的整页滚动模式，并在 debug 快照中标记 `scrollBridge: false`。

### 右栏 API 兼容

现有 `shellAsideView`、`shellAsideViews`、`shellAsideController` 和 `shellAsideSelect` 签名保持不变。`registerShellAsideView` 增加可选 `windowId`：

- 缺省值为 `site`，旧插件无需修改。
- AI 工作台传入 `windowId: 'ai'` 后，skin 在 AI 窗口创建 pane，并让 `shellAsideSelect(id)` 同时选中 pane、显示 AI 窗口和置顶它。
- 站点 pane 的 active id、持久化键和现有未知 ID 回退到 `site` 的行为不变。
- 窗口管理器只负责宿主几何；业务视图的 render/dispose 生命周期仍由 UI 层管理。

新增给 skin 内部使用的 API：

```text
shellWindowRegister({ id, label, order, windowId, visible, render, defaultRect })
shellWindowFocus(id)
shellWindowArrange()
shellWindowReset()
shellWindowLayout()
shellScrollRoot()
```

外部插件只调用注册/聚焦 API，不直接修改窗口的 left/top/z-index。

## 布局数据、迁移与恢复

### 存储键和结构

布局使用 `api.store` 的 JSON 记录，不写入 CSS 或 DOM。键由以下部分组成：

```text
layout:v1:<site-key>:<width-bucket>
```

`site-key` 使用当前站点 origin 的稳定编码；`width-bucket` 为 `wide`、`medium` 或 `narrow`，分别对应上面的三个断点。记录包含保存时的 viewport 宽高，用于跨同一 bucket 的窗口缩放和 clamp。

```json
{
  "version": 1,
  "viewport": { "width": 1440, "height": 900 },
  "windows": {
    "nav": { "x": 12, "y": 60, "width": 240, "height": 828, "visible": true, "collapsed": false, "overrides": {} },
    "content": { "x": 264, "y": 60, "width": 760, "height": 828, "visible": true, "collapsed": false, "overrides": {} },
    "site": { "x": 1036, "y": 60, "width": 392, "height": 828, "visible": true, "collapsed": false, "overrides": {} }
  },
  "zOrder": ["content", "nav", "site"],
  "updatedAt": 0
}
```

保存前做 schema 校验、数值 clamp 和窗口 ID 过滤；记录超过 12 个窗口或字段异常时丢弃异常项，不阻塞壳。拖动/缩放只在 pointerup 或 150ms debounce 后写入，避免每个 pointermove 写存储。

### 旧三栏迁移

首次发现旧布局且不存在 `layout:v1` 时运行一次幂等迁移：

- rail 默认映射为 `nav`，aside 映射为 `site`，主 route outlet 映射为 `content`。
- 使用旧 `--lsb-shell-header`、`--lsb-shell-rail`、`--lsb-shell-aside` 的默认尺寸生成三窗口；现有右栏 active id、`asideKeep` 和可见性继续有效。
- 已注册的 AI、统计和时间线窗口从默认布局追加；没有注册内容则不创建窗口。
- 迁移记录 `layoutMigrationVersion: 1`，重复加载或 SPA 切换不得再次覆盖用户位置。
- “恢复默认布局”只清除当前站点/当前 width bucket，随后重新运行默认布局，不影响其它站点、其它 bucket、主题设置或媒体资源。

布局和令牌随普通 JSON 迁移导出；本地视频、字体 Blob 和 object URL 不导出。HTTPS URL 可以导出，但导入时仍重新校验协议。

## 主题令牌和模块检查器

### 全局令牌

默认值全部继承站点 CSS 变量：`--bg`、`--panel`、`--text`、`--text-muted`、`--line`、`--brand`、`--shadow-*`。全局设置提供：

- 字体族、正文/界面/等宽字体
- 基准字号和可访问的字号缩放（不小于浏览器默认 12px）
- 行高、间距密度、圆角和边界强度
- 背景材料模式：实底、静态玻璃、视频玻璃
- 可选文本、面板、强调色覆盖；空值表示继续跟随站点主题

颜色输入在写入前转成受限的 hex/rgb/hsl 形式；不接受 `url()`、`expression`、`@import` 或任意 CSS 声明。

### 模块检查器

设置面板新增“窗口布局”和“外观”页；每个窗口标题栏的 `⋮` 菜单可打开该窗口检查器。检查器可以修改：

- 显示/隐藏、折叠、默认布局、置顶
- 宽高、透明度、材料强度、阴影和局部密度
- 局部字体/字号/颜色；每项有“继承全局”选项
- 正文窗口的内容宽度和滚动条样式；AI 窗口的内部颜色仍由 AI 工作台自有样式控制

局部覆盖只存非空字段，删除覆盖后立即回到全局令牌。检查器与拖动操作共享同一个 layout record，route 切换不重置它。

## 玻璃、视频和字体资源

### 玻璃层

默认不开启玻璃。开启后导航和空白区使用较轻透明度，正文卡片增加不透明度以保证可读性；`backdrop-filter` 只应用于窗口表面，不应用于正文文字层。`prefers-reduced-transparency: reduce` 时自动切换实底。

### 视频背景

- 本地视频接受常见 `video/*` 文件，压缩/转码不在浏览器内进行；单文件上限 50 MB，保存到 IndexedDB `lsb_skin_media` 的 `videos` store。
- URL 仅接受 HTTPS，由 `<video>` 直接播放，不做代理和下载；协议、大小提示和加载失败均有可见错误状态。
- 视频固定在窗口工作区最底层，`muted loop autoplay playsinline`；用户关闭视频或浏览器拒绝自动播放时使用静态颜色/图片层。
- `prefers-reduced-motion: reduce` 默认暂停视频并使用静态降级；用户可以手动重新播放，但页面不得自动恢复运动。
- 关闭壳、停用皮肤和路由切换只释放 object URL/播放器引用，IndexedDB 中的本地资源保留，直到用户清除。

### 字体资源

- 系统字体列表直接使用 CSS font-family；不产生网络请求。
- 本地字体支持 `woff2`、`woff`、`ttf`、`otf`，单文件上限 10 MB，保存到 IndexedDB `fonts` store。
- 远程字体只接受 HTTPS URL，通过 `FontFace` 加载；失败时回退站点默认字体并提示一次。
- object URL、`FontFace` 和旧样式在替换/停用时释放；字体二进制不进入配置和迁移导出。
- 自定义字体只影响氢壳令牌，不覆盖 AI 工作台内部固定深色字体，除非 AI 工作台显式选择继承。

## 可访问性与安全边界

- 每个窗口有可见标题、`role="region"` 和唯一 `aria-labelledby`；正文/导航/站点/AI 切换器使用 tablist 或按钮语义。
- 标题栏提供“聚焦窗口”“折叠/恢复”“恢复本窗口布局”；焦点可见，键盘方向键移动，`Shift + 方向键` 调整尺寸，`Esc` 结束操作。
- 窗口 resize handle 和关闭/恢复按钮保持足够触摸热区；不依赖颜色或 hover 表示 active。
- `prefers-reduced-motion` 关闭拖动动画、窗口过渡和视频自动播放；`prefers-reduced-transparency` 关闭模糊。
- URL 只允许 HTTPS；本地文件按 MIME 与大小限制；所有用户颜色/字号/尺寸写入前验证；网络媒体不使用 `innerHTML` 拼接。
- 任一窗口管理异常不得阻止正文渲染；发生异常时记录 `skin:debug`，恢复固定三栏或原生布局。

## 测试与验收

### 纯函数测试

新增 `src/shell-layout.js`（或等价的 skin 可测试模块），覆盖：

- `widthBucket()` 的 1100/700 边界
- rect 数值校验、最小尺寸和 viewport clamp
- 12px 网格吸附、边缘/窗口吸附和重叠保留
- 默认布局生成、一键整理、z 序和不可见窗口过滤
- 旧三栏到 v1 的幂等迁移
- 站点 key、布局 key 和坏 JSON 的安全回退
- 全局令牌与局部覆盖的继承/删除规则

### skin/基座集成测试

在 `test/skin.test.js`、`test/core.test.js` 和必要的 UI 测试中覆盖：

- 壳开启/关闭、停用和异常回退后节点完整还原
- 正文节点身份、SPA route cache、旧 `scrollY` 记录和 content scrollTop 还原
- `shellScrollBridge` 的 scrollY/scrollTo 转发、合成 scroll 事件以及 teardown 恢复原生 descriptor
- `shellAsideView` 旧调用、AI `windowId` 调用、未知 ID 回退和视图清理
- 迁移只执行一次，站点/宽度 bucket 互不串布局，恢复默认只清当前 bucket
- 宽屏、中屏、窄屏窗口数量、切换器和无横向溢出
- 材料/颜色/字体/视频配置的边界，IndexedDB 失败和资源失败降级
- 导出 JSON 不含视频或字体二进制，URL 仍通过 HTTPS 校验

### 真实浏览器验收

`scripts/check-skin-browser.mjs` 使用本地 fixture，在浅色/暗色主题和 1440、1280、768、640、360px 宽度执行：

1. 拖动、缩放、吸附、重叠、置顶和一键整理；刷新后几何位置保持。
2. 主帖/列表窗口独立滚动，导航、站点信息和 AI 的滚动位置互不影响；SPA 软跳、后退和恢复缓存不丢节点。
3. 700/1100 边界与单窗口切换器；键盘移动/缩放和触摸热区可用。
4. 视频本地/URL、关闭、自动播放失败、减少动效；字体本地/URL、失败回退；玻璃关闭后实底可读。
5. 右栏旧 API、AI 独立窗口、引用渲染和 AI composer 不发生遮挡。

截图只用于视觉复核；验收结果以 DOM、computed style、bounding box、scrollTop、事件计数和网络请求记录为准。

## 性能边界

- 拖动和缩放每帧最多一次 layout read/write，使用 RAF；保存布局不超过每 150ms 一次。
- 默认不加载视频/字体；资源只在用户选择或配置 URL 后加载。窗口数量超过 12 时拒绝注册并提示。
- 视频只保留一个活动播放器；切换到窄屏单窗口时暂停不可见视频。玻璃模糊只作用于可见窗口。
- SPA 切换不得重复创建 shell、窗口或 `route:changed`；调试快照记录窗口数量、scroll bridge、layout key 和媒体状态。

## 交付边界

此设计先拆为三个交付阶段，具体文件、测试顺序和版本号在用户审阅通过后写入实施计划：

1. **H2.1 窗口基础**：窗口容器、拖动/缩放/吸附、正文节点迁移、布局存储/旧三栏迁移、scroll bridge。
2. **H2.2 外观与资源**：全局令牌、模块检查器、玻璃/视频背景、字体资源、窄屏切换器和无障碍操作。
3. **H2.3 兼容与验收**：右栏/AI API 迁移、SPA/缓存/站内功能回归、构建产物同步、真实浏览器验收和性能收口。
