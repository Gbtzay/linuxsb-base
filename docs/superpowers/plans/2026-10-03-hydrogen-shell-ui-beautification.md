# 氢壳窗口化 UI 美化实施计划

> **For agentic workers:** 使用 `superpowers:executing-plans` 在主会话内逐项执行本计划；当前用户明确禁止使用子代理。步骤使用复选框跟踪，所有改动保持未提交。

**Goal:** 将氢壳从固定三栏升级为可移动、可缩放、可滚动、可持久化的桌面式模块窗口，同时保留现有主题、SPA、右栏 API、AI 工作台和站内安全链。

**Architecture:** 把几何计算、布局迁移、令牌合并和媒体校验拆成可测试的纯函数模块；`plugins/skin.user.js` 继续负责 DOM 迁移、窗口生命周期和 CSS。`src/ui.js`/`src/core.js` 增加窗口注册与滚动根 API，旧 `shellAsideView` API 继续作为兼容层。正文节点只移动不克隆，content 窗口作为新的滚动根，并用 scroll bridge 兼容仍读取 `window.scrollY`/`window.scrollTo` 的现有插件。

**Tech Stack:** Userscript JavaScript、ES modules、CSS fixed/overflow/pointer events、IndexedDB、Node `node:test`、JSDOM、Chromium/Edge CDP fixture、现有 esbuild 构建脚本。

## Global Constraints

- 设计依据：[2026-10-03-hydrogen-shell-windowed-ui-design.md](../specs/2026-10-03-hydrogen-shell-windowed-ui-design.md)，每项实现都要能在该 spec 中找到对应验收条款。
- 当前仓库 `D:\test\linuxsb-base` 已有未提交修改；不得执行 `git reset`、`git clean`、`git commit` 或 `git push`，不得覆盖无关修改。
- 保留 `#lsb-shell`、`#lsb-shell-header`、`#lsb-shell-rail`、`#lsb-shell-aside`、`#lsb-shell-aside-tabs`、`[data-lsb-shell-aside-pane]` 及既有 `shellAsideView`/`shellAsideSelect` 行为。
- 顶栏默认固定；窗口坐标使用 12px 网格和 12px 吸附阈值；窗口注册上限 12 个；pointermove 不直接写存储，pointerup 或 150ms debounce 才保存。
- 宽度断点固定为 `>=1100px` 自由窗口、`700–1099px` 吸附窗口、`<700px` 单窗口堆叠；断点边界必须有测试。
- 本地视频单文件上限 50 MB，本地字体单文件上限 10 MB；远程媒体/字体只接受 HTTPS；本地二进制和 object URL 不进入配置导出。
- 默认外观继续继承 `--bg`、`--panel`、`--text`、`--text-muted`、`--line`、`--brand` 等站点令牌；不默认覆盖站点主题，不向页面注入任意 CSS 文本。
- `prefers-reduced-motion: reduce` 停止视频自动播放、拖动/缩放过渡；`prefers-reduced-transparency: reduce` 不使用 blur；降级不能阻塞正文。
- 每个任务完成后运行其定向测试和 `git diff --check`，保持改动未提交；最终才同步版本和发行产物。

## 文件职责

- Create: `src/shell-layout.js` — 宽度分桶、矩形校验/clamp、网格/边缘吸附、默认整理、旧三栏迁移和布局 schema。
- Create: `src/shell-scroll.js` — content scroll root 与 window scroll bridge 的安装、读取、转发和恢复。
- Create: `src/shell-style.js` — 全局/局部令牌校验、继承合并和 CSS 变量序列化。
- Create: `src/shell-media.js` — HTTPS 校验、文件大小/MIME 校验、IndexedDB 媒体读写和 FontFace 生命周期。
- Modify: `src/ui.js` — 窗口注册目录、窗口控制器和滚动根控制器。
- Modify: `src/core.js` — 将窗口/滚动 API 暴露给插件并维持权限检查。
- Modify: `plugins/skin.user.js` — 工作区 DOM、窗口管理、正文迁移/还原、布局存储、设置检查器、玻璃/视频/字体 CSS、窄屏和无障碍行为。
- Modify: `plugins/ai-workbench.user.js` — 右栏视图注册时声明 `windowId: 'ai'`，不改请求和安全逻辑。
- Modify: `src/shell-boot.js` — 首屏使用已保存的布局模式/媒体 URL 时只铺安全占位，不创建业务窗口。
- Create: `test/shell-layout.test.js`、`test/shell-scroll.test.js`、`test/shell-style.test.js`、`test/shell-media.test.js` — 纯函数和资源边界测试。
- Modify: `test/core.test.js` — API 注册、注销和权限测试（当前仓库没有独立 `test/ui.test.js`）。
- Modify: `test/skin.test.js` — DOM 迁移、SPA、布局、窄屏、桥接、右栏兼容和停用还原。
- Create/Modify: `scripts/check-skin-browser.mjs` — 五档宽度、拖拽/缩放、独立滚动、媒体降级和键盘验收。
- Modify: `README.md`、`build-suite.mjs`、`suite/suite-center.js`、`package.json`/`src/core.js`（只在版本同步阶段）和 `dist/*`（只由构建生成）。

---

## H2.1：窗口基础、正文迁移和布局持久化

### Task 1：建立可独立测试的布局模型

**Files:**

- Create: `src/shell-layout.js`
- Create: `test/shell-layout.test.js`

**Interfaces:**

- Produces `widthBucket(width) -> 'wide'|'medium'|'narrow'`。
- Produces `layoutStorageKey(origin, bucket) -> string`。
- Produces `defaultShellLayout({ width, height, registry }) -> LayoutRecord`。
- Produces `sanitizeShellLayout(raw, { width, height, registry }) -> LayoutRecord`。
- Produces `snapRect(rect, { bounds, others, grid = 12, threshold = 12, min }) -> Rect`。
- Produces `arrangeShellWindows(layout, registry, viewport) -> LayoutRecord`。
- Produces `migrateLegacyShellLayout({ viewport, legacy, registry }) -> LayoutRecord`。

- [ ] **Step 1: 写边界失败测试**

```js
import test from 'node:test'
import assert from 'node:assert/strict'
import {
  widthBucket, snapRect, sanitizeShellLayout,
  defaultShellLayout, arrangeShellWindows, migrateLegacyShellLayout,
} from '../src/shell-layout.js'

const registry = [
  { id: 'nav', order: 10, defaultRect: { width: 240, height: 480 } },
  { id: 'content', order: 20, defaultRect: { width: 720, height: 480 } },
  { id: 'site', order: 30, defaultRect: { width: 280, height: 480 } },
]

test('widthBucket keeps both breakpoint edges stable', () => {
  assert.equal(widthBucket(1100), 'wide')
  assert.equal(widthBucket(1099), 'medium')
  assert.equal(widthBucket(700), 'medium')
  assert.equal(widthBucket(699), 'narrow')
})

test('snapRect uses a 12px grid and edge/window threshold without removing overlap', () => {
  const next = snapRect(
    { x: 247, y: 73, width: 300, height: 240 },
    { bounds: { x: 0, y: 0, width: 1000, height: 700 }, others: [{ x: 560, y: 72, width: 200, height: 240 }] },
  )
  assert.equal(next.x % 12, 0)
  assert.equal(next.y % 12, 0)
  assert.equal(next.y, 72)
})

test('sanitizeShellLayout drops unknown windows and clamps invalid rectangles', () => {
  const out = sanitizeShellLayout({ version: 1, windows: { bad: { x: -99 }, content: { x: -99, width: 2, height: 2 } }, zOrder: ['bad', 'content'] }, { width: 900, height: 600, registry })
  assert.deepEqual(Object.keys(out.windows), ['content'])
  assert.ok(out.windows.content.width >= 240)
  assert.ok(out.windows.content.x >= 0)
  assert.deepEqual(out.zOrder, ['content'])
})

test('default layout and arrange include only registered visible windows', () => {
  const initial = defaultShellLayout({ width: 1440, height: 900, registry })
  const arranged = arrangeShellWindows(initial, registry, { width: 1440, height: 900 })
  assert.deepEqual(Object.keys(arranged.windows), ['nav', 'content', 'site'])
  assert.equal(arranged.viewport.width, 1440)
  assert.ok(arranged.windows.content.x >= arranged.windows.nav.x)
})

test('legacy three-column migration is idempotent in shape', () => {
  const out = migrateLegacyShellLayout({ viewport: { width: 1440, height: 900 }, legacy: { header: 48, rail: 240, aside: 280, asideActiveId: 'site' }, registry })
  assert.equal(out.version, 1)
  assert.deepEqual(Object.keys(out.windows), ['nav', 'content', 'site'])
  assert.equal(out.windows.nav.width, 240)
  assert.equal(out.windows.site.width, 280)
})
```

- [ ] **Step 2: 运行纯函数测试确认失败**

Run: `node --test --test-force-exit test/shell-layout.test.js`  
Expected: FAIL，因为模块和导出尚未存在。

- [ ] **Step 3: 实现布局数据类型和纯函数**

在 `src/shell-layout.js` 使用无 DOM 依赖的对象实现：

```js
export const GRID = 12
export const SNAP_THRESHOLD = 12
export const WINDOW_LIMIT = 12

export function widthBucket(width) {
  const n = Number(width) || 0
  return n >= 1100 ? 'wide' : n >= 700 ? 'medium' : 'narrow'
}

export function layoutStorageKey(origin, bucket) {
  return `layout:v1:${encodeURIComponent(String(origin || ''))}:${bucket}`
}
```

其余函数必须：复制输入而不原地修改；拒绝 `NaN`/无穷和未知 ID；把 `x/y` clamp 到工作区、把宽高 clamp 到 registry 的 min；zOrder 只保留 visible/registered ID；布局损坏时返回 `defaultShellLayout()`。`migrateLegacyShellLayout` 读取旧 header/rail/aside 尺寸，生成 nav/content/site 三个 rect，并把旧 active id 放入兼容字段。

- [ ] **Step 4: 运行测试确认通过并检查无浏览器依赖**

Run: `node --test --test-force-exit test/shell-layout.test.js`  
Expected: 全部 PASS；`node -e "import('./src/shell-layout.js')"` 不访问 `window` 或 `document`。

- [ ] **Step 5: 运行格式检查并保留未提交改动**

Run: `git -C D:\test\linuxsb-base diff --check -- src/shell-layout.js test/shell-layout.test.js`  
Expected: 无输出；不执行 commit。

### Task 2：扩展 UI 窗口注册与核心 API

**Files:**

- Modify: `src/ui.js`
- Modify: `src/core.js`
- Modify: `test/core.test.js`（或现有 UI 测试文件）

**Interfaces:**

- `UI.registerShellWindow(record) -> dispose`，record 必须包含 `id` 和 `render` 或 `host`，可选 `label/order/visible/defaultRect/windowId`。
- `UI.shellWindows(context = {}) -> WindowRecord[]` 返回排序后的只读快照。
- `UI.registerShellWindowController(fn) -> dispose`，skin 用它接管 focus/arrange/reset/layout。
- `UI.shellWindowFocus(id) -> string`、`shellWindowArrange() -> LayoutRecord`、`shellWindowReset(id?) -> LayoutRecord`、`shellWindowLayout() -> LayoutRecord`。
- `UI.registerShellScrollRoot(fn) -> dispose`、`UI.shellScrollRoot() -> Element|null`。
- `src/core.js` 的 `api.ui` 暴露同名方法，所有入口走现有 `need('ui', ...)` 权限。

- [ ] **Step 1: 写 API 失败测试**

断言注册相同 ID 会替换旧记录并注销旧 render；`visible(context)` 抛异常时隐藏；未知 focus id 安全返回空字符串或当前有效 ID；没有 skin controller 时 arrange/reset 不抛异常；`shellScrollRoot()` 没有控制器时返回 `null`。

- [ ] **Step 2: 运行定向测试确认失败**

Run: `node --test --test-force-exit test/core.test.js --test-name-pattern="窗口|滚动根|侧栏视图"`  
Expected: 新增 API 的断言失败，既有侧栏断言继续通过。

- [ ] **Step 3: 在 UI 类中添加窗口目录和控制器**

沿用 `_shellAsideViews` 的注销模式，增加 `_shellWindows`、`_shellWindowController` 和 `_shellScrollRootController`。`registerShellWindow` 对 id 做 `/^[a-z][a-z0-9-]{0,63}$/` 校验，`shellWindows` 返回新数组和浅拷贝 record，不把内部 `render` 状态暴露给调用方修改。

- [ ] **Step 4: 在 core API 添加权限包装**

在 `src/core.js` 的 `ui` 对象中加入：

```js
shellWindowRegister: (opt) => (need('ui', '注册氢壳窗口'), own(core.ui.registerShellWindow(opt))),
shellWindows: (context) => (need('ui', '读取氢壳窗口'), core.ui.shellWindows(context)),
shellWindowController: (fn) => (need('ui', '注册氢壳窗口控制器'), own(core.ui.registerShellWindowController(fn))),
shellWindowFocus: (id) => (need('ui', '聚焦氢壳窗口'), core.ui.shellWindowFocus(id)),
shellWindowArrange: () => (need('ui', '整理氢壳窗口'), core.ui.shellWindowArrange()),
shellWindowReset: (id) => (need('ui', '重置氢壳窗口'), core.ui.shellWindowReset(id)),
shellWindowLayout: () => (need('ui', '读取氢壳布局'), core.ui.shellWindowLayout()),
shellScrollRoot: () => (need('ui', '读取氢壳滚动根'), core.ui.shellScrollRoot()),
```

保留旧 `shellAsideView` API 原样；未安装 skin 时这些方法返回安全空值。

- [ ] **Step 5: 运行 API、完整 core 定向测试**

Run: `node --test --test-force-exit test/core.test.js --test-name-pattern="窗口|滚动根|侧栏视图"`  
Expected: 新增和既有测试 PASS。

### Task 3：挂载 workspace、窗口 chrome 和正文节点

**Files:**

- Modify: `plugins/skin.user.js` 的 `shellCss()`、`ensureShell()`、`fillShell()`、`teardownShell()`、`refreshShell()`
- Modify: `test/skin.test.js`

**Interfaces:**

- 新增内部 `ensureWorkspace(shell) -> Element`、`mountShellWindows()`、`unmountShellWindows()`。
- `#lsb-shell-rail` 对应 `nav`，`#lsb-shell-aside` 对应 `site`，路由 outlet 对应 `content`。
- `skin:debug` 增加 `windows: [{ id, rect, visible, scrollTop }]`、`layoutKey` 和 `scrollBridge`。

- [ ] **Step 1: 写正文节点身份和窗口结构失败测试**

```js
test('窗口化氢壳只移动正文节点，不复制节点', async () => {
  const { w } = makeSite()
  const outlet = w.document.querySelector('main.wrap')
  await loadBase(w, PLUG('skin.user.js'))
  const content = w.document.querySelector('[data-lsb-shell-window="content"]')
  assert.ok(content)
  assert.strictEqual(content.querySelector('main.wrap'), outlet)
  assert.equal(w.document.querySelectorAll('main.wrap').length, 1)
  const dbg = await w.LSB.bus.request('skin:debug')
  assert.ok(dbg.shell.windows.some((row) => row.id === 'content'))
})

test('停用皮肤还原正文父节点和原生壳状态', async () => {
  const { w, tick } = makeSite()
  const outlet = w.document.querySelector('main.wrap')
  const home = outlet.parentNode
  await loadBase(w, PLUG('skin.user.js'))
  w.LSB.disable('skin')
  await tick(30)
  assert.strictEqual(outlet.parentNode, home)
  assert.equal(w.document.querySelector('#lsb-shell'), null)
})
```

- [ ] **Step 2: 运行测试确认失败**

Run: `node --test --test-force-exit test/skin.test.js --test-name-pattern="窗口化|停用皮肤还原"`  
Expected: 当前固定三栏实现缺少 workspace/content 窗口断言。

- [ ] **Step 3: 添加 workspace 和可访问窗口 chrome**

`ensureShell()` 保留原 header/rail/aside 节点和事件监听；在 header 后创建 `#lsb-shell-workspace`。给 rail/aside 加 `data-lsb-shell-window`、`role="region"`、唯一标题 ID；content 使用新 section 包住现有 route outlet。标题栏必须通过 DOM API 创建文字和按钮，不能把用户可配置值拼进 `innerHTML`。

CSS 先保证内容可用：workspace `position:fixed; top:var(--lsb-shell-header); inset-inline:0; bottom:0; overflow:hidden`；window 使用 `position:absolute; display:flex; flex-direction:column; min-width/min-height`；window body `min-height:0; overflow:auto`。固定 header 的 z-index 高于普通窗口标题栏。

- [ ] **Step 4: 接入 layout controller 的最小挂载/还原路径**

`mountShellWindows()` 为 registry 中的窗口应用 rect 与 zOrder，route 更新后复用现有 section。`unmountShellWindows()` 先把 content outlet 插回记录的 anchor，再移除仅由 skin 创建的 title bar、workspace 和 data 属性；rail/aside 原节点继续由既有 restore 函数还原。

- [ ] **Step 5: 运行 skin 定向测试和 diff 检查**

Run: `node --test --test-force-exit test/skin.test.js --test-name-pattern="窗口化|壳开启|停用皮肤还原|侧栏"`  
Expected: 节点身份、既有侧栏和停用还原 PASS；`git diff --check` 无输出。

### Task 4：实现拖动、缩放、置顶、键盘操作和窄屏切换

**Files:**

- Modify: `plugins/skin.user.js`
- Modify: `test/skin.test.js`

**Interfaces:**

- 内部 `bindWindowInteractions(root)`、`beginWindowDrag(event, win)`、`beginWindowResize(event, win, edge)`、`focusShellWindow(id)`、`syncResponsiveMode()`。
- 交互层只调用 Task 1 的 `snapRect`/`sanitizeShellLayout`，不在事件处理中复制几何算法。

- [ ] **Step 1: 写交互失败测试**

用 JSDOM `PointerEvent`/普通 `Event` 模拟标题栏 pointerdown/move/up，断言 content 的 `left/top` 改变、zOrder 更新且拖动期间没有 `api.store.set`；pointerup 后只保存一次。用 `matchMedia` 分别模拟 1099、700、699 宽度，断言 `data-lsb-shell-mode` 为 `medium`/`narrow`，699px 时只有一个窗口内容区可见。

- [ ] **Step 2: 运行测试确认失败**

Run: `node --test --test-force-exit test/skin.test.js --test-name-pattern="拖动|缩放|窄屏|置顶"`  
Expected: 交互事件没有绑定，断言失败。

- [ ] **Step 3: 实现 pointer capture 和 RAF 几何更新**

标题栏 `pointerdown` 忽略按钮/链接目标，记录起点和原 rect，调用 `setPointerCapture`；`pointermove` 在一个 RAF 中更新 transform；`pointerup` 调用 `snapRect`、写回 left/top/width/height、更新 zOrder 并通过 150ms debounce 保存。resize handle 使用 `data-resize-edge="n|e|s|w|ne|..."`，最小尺寸由 registry 提供。

- [ ] **Step 4: 实现键盘与窄屏模式**

窗口获得焦点后，方向键每次移动 12px；`Shift + 方向键` 修改尺寸；`Escape` 结束拖动/缩放；标题栏按钮提供 focus、折叠、恢复本窗口默认。`syncResponsiveMode()` 使用 `widthBucket`：wide 允许重叠，medium 重新 clamp，narrow 隐藏非 active 内容并更新顶部切换器，回到宽屏只恢复 visible/rect 不删除布局。

- [ ] **Step 5: 运行交互测试和真实浏览器前置检查**

Run: `node --test --test-force-exit test/skin.test.js --test-name-pattern="拖动|缩放|窄屏|置顶"`  
Expected: PASS；窗口 handle 均有 `aria-label`，触摸尺寸至少 44px。暂不运行完整浏览器脚本，媒体和 scroll bridge 尚未接入。

### Task 5：持久化、旧三栏迁移和恢复默认布局

**Files:**

- Modify: `plugins/skin.user.js`
- Modify: `test/skin.test.js`

**Interfaces:**

- 内部 `getLayoutKey()`、`loadShellLayout()`、`saveShellLayout()`、`migrateLegacyLayoutOnce()`、`resetShellLayout(id?)`。
- 使用 `api.store.get/set/del`，键必须由 `layoutStorageKey(location.origin, widthBucket(innerWidth))` 返回。

- [ ] **Step 1: 写隔离和迁移失败测试**

覆盖同一站点 wide/medium 两条键互不覆盖、两个 origin 互不读取；首次只有旧 rail/aside 尺寸时生成 nav/content/site，第二次加载保持用户改过的 rect；恢复默认只清当前 key。注入 `{ x: 999999, width: -1 }` 后断言安全 clamp，不抛异常。

- [ ] **Step 2: 运行测试确认失败**

Run: `node --test --test-force-exit test/skin.test.js --test-name-pattern="布局保存|旧三栏|恢复默认|站点隔离"`  
Expected: 当前没有 layout:v1 存储和 migration marker，断言失败。

- [ ] **Step 3: 接入读取、校验和幂等迁移**

启动顺序固定为：计算 bucket → 读取 layout:v1 → `sanitizeShellLayout` → 若缺失则读取旧 shell 尺寸/active id 并调用 `migrateLegacyShellLayout` → 写入 `layoutMigrationVersion: 1` → mount。读取记录失败只使用默认布局，不删除其它 bucket。

- [ ] **Step 4: 接入按钮和 API**

设置页“一键整理”调用 `arrangeShellWindows`；窗口菜单“恢复本窗口布局”只替换指定 window 的 defaultRect；“恢复默认布局”删除当前 key 并立即重新 mount。所有写入只保存 JSON rect、状态、zOrder、viewport 和 `updatedAt`，不保存 DOM、Blob 或 object URL。

- [ ] **Step 5: 运行布局、既有 SPA 和完整 skin 定向测试**

Run: `node --test --test-force-exit test/skin.test.js --test-name-pattern="布局|旧三栏|恢复默认|SPA|视图缓存|停用"`  
Expected: 新旧布局、route cache、右栏 active id 和停用还原全部 PASS。

### Task 6：安装 content scroll bridge 并保持旧插件语义

**Files:**

- Create: `src/shell-scroll.js`
- Create: `test/shell-scroll.test.js`
- Modify: `src/ui.js`、`src/core.js`
- Modify: `plugins/skin.user.js` 的 timeline/home infinite/SPA cache 路径
- Modify: `test/skin.test.js`

**Interfaces:**

- `installShellScrollBridge({ win, root, dispatch = true }) -> { getRoot, getTop, scrollTo, restore }`。
- `getTop()` 返回 root.scrollTop；`scrollTo(x, yOrOptions)` 支持现有数字和 `{ top, behavior }`；`restore()` 恢复原生 `scrollY`/`pageYOffset` descriptor、scrollTo 和监听器。

- [ ] **Step 1: 写 bridge 失败测试**

```js
test('scroll bridge mirrors scrollY and scrollTo, then restores descriptors', () => {
  const root = fakeScroller()
  const original = { scrollTo: window.scrollTo, scrollY: Object.getOwnPropertyDescriptor(window, 'scrollY') }
  const bridge = installShellScrollBridge({ win: window, root })
  root.scrollTop = 180
  root.dispatchEvent(new Event('scroll'))
  assert.equal(window.scrollY, 180)
  window.scrollTo(0, 42)
  assert.equal(root.scrollTop, 42)
  bridge.restore()
  assert.equal(window.scrollTo, original.scrollTo)
})
```

- [ ] **Step 2: 运行测试确认失败**

Run: `node --test --test-force-exit test/shell-scroll.test.js`  
Expected: 模块不存在或 scrollY 没有被桥接。

- [ ] **Step 3: 实现 bridge 并处理 descriptor 不可配置情况**

优先保存并替换可配置 descriptor；不可配置时只注册 `lsb:shell-scroll` 和 skin 内部 root API，不强行覆盖原生属性，并返回 `{ patched: false }`。content scroll 事件使用合成 `Event('scroll')` 派发到 window，避免修改事件对象的 `isTrusted`。

- [ ] **Step 4: 将 skin 的滚动调用切换为 bridge root**

`stashView` 保存 `shellScrollTop()`；`applyView` 恢复 `scrollTop`；SPA cached/remote commit 后调用 root.scrollTo(0, 0/oldTop)。时间线和首页无限滚动监听 root，同时保留 window 兼容监听；距离计算使用 `root.clientHeight`。`shellScrollRoot()` 由 UI controller 返回当前 content scroller。

- [ ] **Step 5: 运行 bridge、skin 和相关回归**

Run: `node --test --test-force-exit test/shell-scroll.test.js test/skin.test.js --test-name-pattern="scroll|滚动|SPA|无限|时间线|视图缓存"`  
Expected: 旧 `window.scrollY` 调用、content scrollTop、route back/forward 和停用恢复全部 PASS。

---

## H2.2：外观令牌、模块检查器和媒体资源

### Task 7：全局/局部令牌和模块检查器

**Files:**

- Create: `src/shell-style.js`
- Create: `test/shell-style.test.js`
- Modify: `plugins/skin.user.js` config schema、`configTab`、`shellCss()`
- Modify: `test/skin.test.js`

**Interfaces:**

- `sanitizeTokenValue(name, value) -> string|null`，只接受已定义令牌和值类型。
- `mergeShellTokens(globalTokens, overrides) -> ResolvedTokens`，`null`/空字符串表示继承。
- `tokenCss(tokens) -> string`，只输出白名单 CSS custom properties。
- `moduleInspectorModel(layout, id) -> { values, inherited }`。

- [ ] **Step 1: 写令牌和继承失败测试**

覆盖空覆盖回退站点变量、局部字号 clamp 到 12–32px、颜色拒绝 `url()`/`expression`/分号注入、局部删除后恢复继承；断言 `tokenCss()` 不输出未知 property 或任意 CSS 声明。

- [ ] **Step 2: 运行测试确认失败**

Run: `node --test --test-force-exit test/shell-style.test.js`  
Expected: 模块不存在或非法令牌未被拒绝。

- [ ] **Step 3: 实现 schema 和 token CSS**

皮肤 schema 增加以下稳定字段，默认值为空或站点继承：

```js
layoutMode: { type: 'select', label: '壳布局', default: 'windowed', options: ['windowed', 'fixed'] },
glass: { type: 'switch', label: '玻璃材料', default: false },
baseFontSize: { type: 'number', label: '基础字号', default: 14 },
fontFamily: { type: 'text', label: '界面字体', default: '' },
fontUrl: { type: 'text', label: '字体 URL（HTTPS）', default: '' },
textColor: { type: 'text', label: '文字颜色覆盖', default: '' },
panelColor: { type: 'text', label: '面板颜色覆盖', default: '' },
accentColor: { type: 'text', label: '强调色覆盖', default: '' },
```

`layoutMode: 'fixed'` 是故障回退和用户兼容入口，不删除旧三栏 CSS；默认 windowed。`glass` 只改变材料 class，不改变主题变量本身。

- [ ] **Step 4: 添加设置页和窗口检查器**

在 `api.ui.configTab` 的 skin 页增加“窗口布局/外观”分组，使用已有 `buildForm` 保存全局值；workspace 标题栏的 `⋮` 打开检查器，编辑 `visible/collapsed/width/height/opacity/material/density` 和局部字号/颜色，保存到当前 layout record 的 `overrides`。检查器中的“继承全局”删除字段而不是写入重复值。

- [ ] **Step 5: 接入 CSS token 和测试**

`restyle()` 将 token CSS 挂在 `html.lsb-skin-shell-on`；默认值仍引用站点变量。补充浅/暗主题、壳关闭、固定回退和检查器 DOM 断言。

Run: `node --test --test-force-exit test/shell-style.test.js test/skin.test.js --test-name-pattern="令牌|继承|检查器|主题|固定回退"`  
Expected: PASS；`git diff --check` 无输出。

### Task 8：玻璃材料、视频背景和字体生命周期

**Files:**

- Create: `src/shell-media.js`
- Create: `test/shell-media.test.js`
- Modify: `plugins/skin.user.js`
- Modify: `src/shell-boot.js`
- Modify: `test/skin.test.js`

**Interfaces:**

- `isHttpsUrl(value) -> boolean`。
- `validateMediaFile(file, { kind }) -> { ok, reason }`，video 上限 50 MB、font 上限 10 MB。
- `openMediaDb(indexedDB, name = 'lsb_skin_media') -> Promise<IDBDatabase>`，stores `videos` 和 `fonts`。
- `readMedia/writeMedia/clearMedia` 使用 `{ kind, key }`，IndexedDB 缺失时使用内存 Map 测试后端。
- `loadFontFace({ family, source, document }) -> Promise<FontFace>`，失败释放 object URL 并回退。

- [ ] **Step 1: 写资源边界失败测试**

```js
test('media validation enforces HTTPS and separate file caps', () => {
  assert.equal(isHttpsUrl('https://cdn.example/video.mp4'), true)
  assert.equal(isHttpsUrl('http://cdn.example/video.mp4'), false)
  assert.equal(validateMediaFile({ size: 50 * 1024 * 1024, type: 'video/mp4' }, { kind: 'video' }).ok, true)
  assert.equal(validateMediaFile({ size: 50 * 1024 * 1024 + 1, type: 'video/mp4' }, { kind: 'video' }).ok, false)
  assert.equal(validateMediaFile({ size: 10 * 1024 * 1024 + 1, type: 'font/woff2' }, { kind: 'font' }).ok, false)
})
```

- [ ] **Step 2: 运行测试确认失败**

Run: `node --test --test-force-exit test/shell-media.test.js`  
Expected: 模块不存在或协议/大小校验缺失。

- [ ] **Step 3: 实现 IndexedDB 与生命周期**

IDB 数据库固定为 `lsb_skin_media`，object store 固定为 `videos`/`fonts`，记录键包含站点 origin 和用户选择的资源名。读取/写入失败返回明确错误并不阻塞壳；测试环境没有 IndexedDB 时使用内存 Map，生产不把 Blob 写入 `api.store`。

- [ ] **Step 4: 接入 skin 设置、玻璃 CSS 和视频层**

新增设置字段 `backgroundVideoUrl`、`backgroundVideoEnabled` 和本地文件选择器。远程 URL 只在 `isHttpsUrl` 为 true 时写入配置；本地选择先校验再写 IDB。视频层是 workspace 最底层的单个 `<video>`，设置 `muted/loop/autoplay/playsInline`，加载失败、用户关闭、`prefers-reduced-motion` 或自动播放拒绝时移除播放 class 并使用静态 `--lsb-shell-bg`。

玻璃规则只给可见窗口的表面，`prefers-reduced-transparency` 使用实底；正文卡片提高不透明度。退出/停用释放 player 和 object URL，IDB 资源仍保留，清除按钮才删除。

- [ ] **Step 5: 接入字体文件/URL和 FontFace**

设置页支持系统字体、本地 `woff2/woff/ttf/otf` 与 HTTPS 字体 URL。加载成功写入 `--lsb-shell-font-family`，失败 toast 一次并恢复站点字体；替换或停用调用 `FontFace`/object URL 的 dispose。AI 工作台没有选择继承时保留自身字体。

- [ ] **Step 6: 更新 shell boot 占位并测试媒体导出边界**

`src/shell-boot.js` 只读取合法 HTTPS URL，在宽屏首屏写静态背景占位；不在 boot 阶段读取 Blob 或创建视频。`test/skin.test.js` 断言迁移导出 JSON 不含二进制、停用清除 class/变量、URL 非 HTTPS 不播放。

Run: `node --test --test-force-exit test/shell-media.test.js test/skin.test.js --test-name-pattern="视频|字体|玻璃|媒体|导出|停用"`  
Expected: PASS。

---

## H2.3：API 迁移、可访问性、浏览器验收和交付

### Task 9：AI/右栏窗口兼容与窄屏切换器

**Files:**

- Modify: `plugins/ai-workbench.user.js` 的 `api.ui.shellAsideView` 注册点
- Modify: `plugins/skin.user.js` 的 `syncAsideViews`/窗口注册路径
- Modify: `test/ai-workbench.test.js`、`test/skin.test.js`

**Interfaces:**

- AI view record 增加 `windowId: 'ai'`，其它 view 缺省 `windowId: 'site'`。
- `shellAsideSelect(id)` 仍返回有效 view id，同时调用 `shellWindowFocus(windowId)`。
- narrow 模式切换器按钮使用 `data-lsb-shell-window-switch`，当前项设置 `aria-selected="true"`。

- [ ] **Step 1: 写兼容失败测试**

断言旧 view 不带 `windowId` 仍在 site 窗口；AI view 在存在 skin 时挂到 ai 窗口；调用 `shellAsideSelect('ai-workbench')` 会选中 view 并置顶 ai；skin 停用后 AI pane/render disposer 均清理。

- [ ] **Step 2: 运行定向测试确认失败**

Run: `node --test --test-force-exit test/ai-workbench.test.js test/skin.test.js --test-name-pattern="侧栏|AI.*窗口|窗口切换|停用"`  
Expected: AI 记录没有 windowId，兼容断言失败，既有 AI 业务测试应保持通过。

- [ ] **Step 3: 修改注册元数据而不改请求流程**

只在 AI workbench 的视图注册对象增加 `windowId: 'ai'`；skin 建立 ai host、渲染同一 view render 结果并复用 dispose。引用、流式回答、停止生成、重试、写操作预览/确认和结果检查路径不得改动。

- [ ] **Step 4: 实现窄屏切换器和键盘语义**

`<nav role="tablist">` 中每个窗口按钮用 `role="tab"`、`aria-controls`、`aria-selected`；切换只改变 active window，不删除 layout record。标题栏按钮有明确 `aria-label`，focus-visible 样式和 `Escape` 行为在 360px fixture 中可用。

- [ ] **Step 5: 运行兼容回归**

Run: `node --test --test-force-exit test/ai-workbench.test.js test/skin.test.js --test-name-pattern="侧栏|AI|窗口|焦点|窄屏"`  
Expected: PASS；没有重复 `route:changed`、网络请求或 AI render。

### Task 10：浏览器 fixture、性能探针和完整验收

**Files:**

- Create/Modify: `scripts/check-skin-browser.mjs`
- Modify: `test/skin.test.js`、`test/core.test.js`
- Modify: `README.md`

- [ ] **Step 1: 建立本地浏览器场景**

脚本使用现有 topic/list fixture 和本地 HTTP server，注入 skin、base、AI stub 与测试媒体，不访问生产站点。每次创建新 context，设置 viewport `[1440, 1280, 768, 640, 360]` 和浅/暗主题，等待 `#lsb-shell-workspace` 与 content window 稳定。

- [ ] **Step 2: 加入几何和滚动验收**

脚本通过 DOM/`getBoundingClientRect()` 检查：header 固定、窗口不出安全边界、medium 吸附、narrow 仅一个内容区可见；拖动/resize 后刷新仍读到同一 layout key；content/site/AI 的 scrollTop 互不改变；SPA 软跳/后退保留正文节点身份。

- [ ] **Step 3: 加入媒体、无障碍和性能断言**

断言非法 HTTP URL 不创建 video/font request；本地/HTTPS 合法资源在测试 stub 中加载；reduced motion/transparency 使用静态实底；所有窗口有 label/focus-visible/44px handle。记录 `shell.mount`、`shell.layout`、`shell.scroll`、`spa.commit` 时间和 pointermove RAF 次数，pointermove 不产生重复存储写入。

- [ ] **Step 4: 运行完整验证**

```text
node --test --test-force-exit test/shell-layout.test.js test/shell-scroll.test.js test/shell-style.test.js test/shell-media.test.js
node --test --test-force-exit test/skin.test.js test/core.test.js test/ai-workbench.test.js
node scripts/check-skin-browser.mjs
npm test
npm run build
npm run verify:dist
git -C D:\test\linuxsb-base diff --check
```

Expected：定向测试、浏览器五档验收、完整回归、构建和产物校验全部通过；若浏览器环境缺失，保留源文件并报告未完成的真实浏览器项，不以截图代替测试。

### Task 11：版本、README 和发行产物同步

**Files:**

- Modify: `plugins/skin.user.js` 头部与 manifest version
- Modify: `src/core.js`、`package.json`（若 core API 或 shell-boot 改动需要同步）
- Modify: `build-suite.mjs`、`suite/suite-center.js`
- Modify: `README.md`
- Generated: `dist/linuxsb-base.user.js`、`dist/linuxsb-lts.user.js`、`dist/linuxsb-suite.user.js`

- [ ] **Step 1: 先确认所有测试绿再决定 patch 版本**

以当前版本为基线：skin `1.1.58`、base `0.1.53`、suite `1.0.133`。实现全部通过后各自递增一个 patch（skin `1.1.59`、base `0.1.54`、suite `1.0.134`），只有实际修改对应模块时才递增；userscript `@version` 与 manifest `version` 必须一致。

- [ ] **Step 2: 更新 README 功能说明**

在氢壳说明中写明：窗口化导航/正文/站点/AI、按站点和宽度保存布局、旧三栏自动迁移、可选玻璃/视频背景/字体覆盖、窄屏单窗口降级；说明本地二进制只存本机 IndexedDB，主题默认仍由站点变量控制。

- [ ] **Step 3: 重新构建并做产物同步校验**

Run: `npm run build`；确认三个 dist 文件的 banner、skin/base/suite 版本与源文件一致。Run: `npm run verify:dist`，Expected: 通过且不出现旧固定三栏标记缺失。

- [ ] **Step 4: 完成最终验收记录但不提交**

保留测试命令和输出摘要；再次运行 `git -C D:\test\linuxsb-base status --short` 确认没有意外生成的大型媒体、临时截图或 `.superpowers` 以外的未跟踪文件。不要执行 commit/push。

---

## Spec coverage checklist

| Spec 条款 | 计划任务 |
|---|---|
| 独立 nav/content/site/AI/stats/timeline 窗口、节点不克隆 | Task 3、Task 9 |
| 12px 网格/吸附、重叠、置顶、一键整理 | Task 1、Task 4 |
| 按站点与宽度保存、旧三栏迁移、恢复默认 | Task 1、Task 5 |
| SPA route cache、正文独立滚动、scroll bridge | Task 3、Task 5、Task 6 |
| 旧 aside API 与 AI windowId 兼容 | Task 2、Task 9 |
| 1100/700px 响应式降级和切换器 | Task 4、Task 9、Task 10 |
| 全局令牌、局部覆盖、检查器和站点主题继承 | Task 7 |
| 玻璃、50MB 视频、本地/HTTPS 视频和静态降级 | Task 8 |
| 系统/10MB 本地/HTTPS 字体和失败回退 | Task 8 |
| reduced motion/transparency、键盘、触摸和 focus-visible | Task 4、Task 9、Task 10 |
| 性能边界、构建、回归、真实浏览器验收 | Task 10、Task 11 |

## Execution handoff

计划已按用户选择的“正文也可独立拖动/缩放”和“按站点与窗口宽度保存”落地。执行时使用 `superpowers:executing-plans` 在本会话内逐项推进，每个任务完成后先跑定向测试再进入下一任务；不启用子代理，不提交分支，不清理既有未提交修改。
