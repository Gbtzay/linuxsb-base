# 帖子返回首页路由隔离实施计划

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 阻止帖子页实时流的迟到响应在返回缓存首页后写入错误的正文出口，同时保持首页缓存命中。

**Architecture:** 在实时流插件中为每轮处理保存不可复用的路由上下文令牌，令牌由导航代数、模式、出口节点和帖子 ID 组成。网络等待、消息等待、横幅动作和最终 DOM 插入都必须通过同一套上下文校验；路由初始化清空旧代数的暂存，但旧异步任务不能触碰新代数状态。皮肤缓存逻辑保持不变，集成测试通过真实的软跳缓存往返验证出口隔离。

**Tech Stack:** Node.js 端到端测试、`node:test`、JSDOM、现有 `deferredHtmlFetch()` 夹具、原生 JavaScript userscript。

## Global Constraints

- 必须保留工作区所有已有未提交改动，不执行 `reset`、`clean` 或覆盖无关文件。
- 不禁用首页 `viewCache`，不把帖子正文加入缓存。
- 生产修改只针对 `plugins/live-feed.user.js` 的路由上下文隔离；只有回归测试证明缓存片段本身被污染时才修改 `plugins/skin.user.js`。
- 新行为必须先有当前实现会失败的回归测试，再写生产代码。
- 报告测试结果时单独标记已有的淘帖详情请求数失败。

---

### Task 1: 添加最小的首页污染回归测试

**Files:**
- Modify: `test/skin.test.js`，放在现有“软跳进帖子时实时流首页响应晚返回不写入帖子楼层”测试之后。
- Read: `plugins/skin.user.js` 的 `stashView()` / `takeView()` / 缓存命中导航流程。
- Read: `plugins/live-feed.user.js` 的 `cycleTopic()` / `insertFloors()`。

**Interfaces:**
- Consumes: `makeTopicSpaHome()`, `deferredHtmlFetch()`, `topicHtml`, `homeHtml`, `PLUG('skin.user.js')`, `PLUG('live-feed.user.js')`。
- Produces: 一个只断言用户可见出口的集成回归测试，不暴露或依赖插件私有实现。

- [ ] **Step 1: 写失败测试**

在 `test/skin.test.js` 增加以下测试骨架。测试先让首页建立实时流列表基线，再进入帖子；让帖子实时流的新增楼层响应完成解析后停在消息增量等待边界，返回首页后显式释放该等待，再检查首页出口。断言只检查用户可见 DOM，不依赖实时流的 `pending` 数组：

```js
test('看过帖子返回缓存首页时，迟到的帖子响应不能污染首页', async () => {
  const lateTopic = topicHtml.replace(
    '</ul>',
    '<li class="post-item post-entry" id="post-999991" data-floor="401">' +
      '<div class="post-content"><p>迟到的帖子评论</p></div></li></ul>',
  )
  const { w, tick, until } = makeTopicSpaHome({
    'lsb_base:__core:urlPoll': 25,
    'lsb_base:live-feed:__config': {
      jitterMs: 0,
      pollSec: 30,
      bgSec: 30,
      autoInsert: true,
      trackTopicReplies: true,
    },
  })
  const flow = deferredHtmlFetch(w, (url) =>
    /\/topic\/1(?:\?|$)/.test(String(url)) ? lateTopic : homeHtml,
  )
  await loadBase(w, PLUG('skin.user.js'), PLUG('live-feed.user.js'))
  const feed = await w.LSB.bus.request('live-feed:debug')
  assert.equal(await until(() => feed.mode() === 'list', 1200), true)

  void feed.pollOnce()
  assert.equal(await until(() => homeGets(flow.calls).length > 0, 1200), true)
  assert.equal(flow.resolveWhere((url) => homeGets([url]).length > 0), true)
  await tick(20)

  const toTopic = w.document.createElement('a')
  toTopic.href = 'https://linux.sb/topic/1'
  w.document.querySelector('main.wrap').append(toTopic)
  toTopic.click()
  assert.equal(await until(() => flow.calls.some((url) => /\/topic\/1(?:\?|$)/.test(url)), 1000), true)
  assert.equal(flow.resolveMatching(/\/topic\/1(?:\?|$)/), true)
  assert.equal(await until(() => w.location.pathname === '/topic/1' && !!w.document.querySelector('.topic-post-list')), true)

  void feed.pollOnce()
  assert.equal(await until(() => flow.pending() > 0, 1000), true)
  const toHome = w.document.querySelector('.breadcrumb a[href="/"]')
  assert.ok(toHome, '帖子页应有返回首页入口')
  toHome.click()
  assert.equal(await until(() => w.location.pathname === '/' && !!w.document.querySelector('.post-list')), true)
  assert.equal(flow.resolveMatching(/\/topic\/1(?:\?|$)/), true)

  await tick(60)
  assert.equal(await until(() => w.document.querySelector('.post-content-title') === null, 400), true)
  assert.equal(w.document.querySelector('ul.topic-post-list'), null)
  assert.equal(w.document.querySelector('li.post-entry'), null)
  assert.equal(w.document.querySelector('main.wrap')?.textContent.includes('迟到的帖子评论'), false)
})
```

如果响应排序在当前测试夹具中不能稳定形成竞态，保留相同断言和请求边界，只调整 `resolveWhere()` / `resolveMatching()` 的释放顺序；实际测试还应使用一个延迟的 `unread-sentinel:debug` 测试处理器稳定卡住 `msgDelta()`，并额外断言首页没有 `.lsb-live-banner.is-topic`，这样才能覆盖消息等待返回后的旧上下文横幅路径。不得删除出口断言或改成直接检查实时流内部暂存。

- [ ] **Step 2: 运行测试确认红灯**

运行：

```powershell
npm run test:skin -- --test-name-pattern="^看过帖子返回缓存首页时，迟到的帖子响应不能污染首页$"
```

预期：测试失败，失败原因必须是首页出现 `.lsb-live-banner.is-topic`、帖子结构或迟到评论文本；如果测试因请求顺序、选择器或夹具错误而异常，先修正测试本身并重新运行，不能改生产代码。

- [ ] **Step 3: 保留红灯证据**

记录失败断言和实际 DOM 结构，确认失败发生在当前实现的路由边界，而不是 `deferredHtmlFetch()` 未释放请求或测试超时。

---

### Task 2: 建立实时流上下文令牌和出口校验

**Files:**
- Modify: `plugins/live-feed.user.js:65-205`，上下文捕获和初始化。
- Modify: `plugins/live-feed.user.js:476-690`，轮询、等待和插入路径。
- Test: Task 1 的集成回归测试。

**Interfaces:**
- Consumes: 当前 `navGen`、`mode`、`ctx`、`pending`、`api.page` 和 `api.sel`。
- Produces: `captureContext()` 与 `contextActive(token)` 两个内部函数；所有异步写入路径通过它们复核当前出口。

- [ ] **Step 1: 增加上下文捕获函数**

在 `navGen` 和 `teardown()` 附近增加以下结构，函数只读取当前插件状态，不修改状态：

```js
function captureContext() {
  return {
    gen: navGen,
    mode,
    ul: ctx.ul || null,
    tid: mode === 'topic' ? Number(ctx.tid) || 0 : 0,
  }
}

function currentListUl() {
  return document.querySelector(api.sel?.listUl || 'ul.post-list')
}

function currentTopicUl() {
  return document.querySelector(api.sel?.topicUl || 'ul.topic-post-list, ul.post-list')
}

function contextActive(token) {
  if (!token || token.gen !== navGen || token.mode !== mode) return false
  if (!(token.ul instanceof Element) || !token.ul.isConnected || ctx.ul !== token.ul) return false
  if (token.mode === 'topic') {
    return api.page?.type === 'topic'
      && Number(api.page.id) === token.tid
      && Number(ctx.tid) === token.tid
      && currentTopicUl() === token.ul
  }
  if (token.mode !== 'list') return false
  const pageType = api.page?.type
  const listPage = pageType === 'home'
    || pageType === 'forum'
    || pageType === 'featured'
    || pageType === 'footprint'
    || isUserTopicList()
  return listPage && currentListUl() === token.ul
}
```

`Element` 不可用的测试/沙箱环境必须通过当前全局 DOM 类型判断；如果项目现有代码使用 `instanceof Element` 的方式不兼容，则改为 `token.ul?.nodeType === 1`，但不能省略 `isConnected` 和当前选择器身份检查。

- [ ] **Step 2: 让路由初始化成为旧暂存的唯一清理点**

保留 `teardown()` 的 `pending = []`，并确保 `init()` 在 `navGen += 1` 前后都不会调用会重新使用旧 token 的插入函数。旧异步任务发现 token 无效时直接返回，不清空新代数的 `pending`、banner 或 `ctx`。

- [ ] **Step 3: 给列表轮询和异步横幅加 token**

在 `cycleList()` 开头捕获 `const token = captureContext()`，网络响应后使用 `contextActive(token)` 替代仅比较 `gen` / `ctx.ul` 的检查，并将 token 传入 `flushOrOffer(token)`。

把 `flushOrOffer()` 改为接收 token，并在 `await msgDelta()` 返回后再次执行：

```js
if (!contextActive(token) || !pending.length) return
```

横幅动作必须闭包捕获同一个 token：

```js
() => insertPending(false, token)
```

- [ ] **Step 4: 给帖子轮询和异步横幅加 token**

在 `cycleTopic()` 开头捕获 token；首次请求和追补分页的每次 `await liveDoc()` 返回后都用 `contextActive(token)` 检查。只有检查成功时才允许把 `fresh` 赋给全局 `pending`。

`await msgDelta()` 返回后再次检查 token；帖子横幅动作使用 `() => insertFloors(false, token)`，避免旧帖子动作在首页模式下调用当前出口。

- [ ] **Step 5: 保护两个最终插入函数**

将签名改为：

```js
function insertPending(silent = false, token = captureContext())
function insertFloors(silent = false, token = captureContext())
```

函数第一行在读取/消费 `pending` 前执行 `contextActive(token)`；失败返回 `0`，不得从新上下文的 `pending` 中 `splice` 或清空。同步修改 `tryFlush()` 和调试 RPC `load()`，让当前调用捕获 token 后传入对应插入函数。

- [ ] **Step 6: 运行回归测试确认绿灯**

运行：

```powershell
npm run test:skin -- --test-name-pattern="^看过帖子返回缓存首页时，迟到的帖子响应不能污染首页$"
```

预期：Task 1 的失败测试通过，首页缓存仍被命中，且 DOM 中没有帖子结构。

---

### Task 3: 验证实时流现有行为不回归

**Files:**
- Modify: `plugins/live-feed.user.js`（仅在 Task 2 必要范围内）。
- Test: `test/live-feed-v2.test.js`、`test/skin.test.js`。

**Interfaces:**
- Consumes: Task 2 的上下文令牌校验。
- Produces: 原有列表新帖插入、帖子新回复追加、横幅点击、打字保护和路由重建行为保持不变。

- [ ] **Step 1: 运行实时流套件**

运行：

```powershell
npm run test:live-feed
```

预期：全部实时流测试通过，且测试数量不低于当前的 45 个。

- [ ] **Step 2: 运行皮肤套件**

运行：

```powershell
npm run test:skin
```

预期：本次新增回归通过。若仍只有开始时已有的淘帖详情请求数失败，记录该失败并不得为了本任务修改淘帖路由。

- [ ] **Step 3: 检查变更边界**

运行：

```powershell
git diff --check
git diff --stat -- plugins/live-feed.user.js test/skin.test.js
```

预期：只有实时流生产文件和皮肤集成测试包含本次功能改动；不修改 `plugins/skin.user.js`，除非 Task 1 明确证明缓存片段自身被污染。

---

### Task 4: 构建与最终验证

**Files:**
- Modify only generated artifacts if the project build commands regenerate them: `dist-dev/linuxsb-base.user.js`, `dist-dev/linuxsb-suite.user.js`, `dist/linuxsb-base.user.js`, `dist/linuxsb-suite.user.js`, `dist/linuxsb-lts.user.js`。

**Interfaces:**
- Consumes: 已通过 Task 2/3 的源文件和测试。
- Produces: 可发布的 userscript 产物与验证结果。

- [ ] **Step 1: 构建开发产物**

运行：

```powershell
npm run build:dev
```

预期：命令退出码为 0，并只按现有构建规则更新开发产物。

- [ ] **Step 2: 构建发布产物**

运行：

```powershell
npm run build
```

预期：命令退出码为 0。

- [ ] **Step 3: 校验产物和核心测试**

运行：

```powershell
npm run verify:profiles
npm run test:core
```

预期：产物配置校验通过；核心测试保持 0 失败。开始时已经存在的失败只在最终报告中列为基线问题。

- [ ] **Step 4: 检查最终差异**

运行：

```powershell
git diff --check
git status --short
```

预期：没有空白错误；所有原有未提交文件仍保留，本次变更集中在回归测试、实时流源文件及构建生成物。

- [ ] **Step 5: 提交本次实现**

只添加本次变更涉及的源文件、测试文件和构建产物：

```powershell
git add -- plugins/live-feed.user.js test/skin.test.js dist-dev/linuxsb-base.user.js dist-dev/linuxsb-suite.user.js dist/linuxsb-base.user.js dist/linuxsb-suite.user.js dist/linuxsb-lts.user.js
git commit -m "fix: isolate live feed across topic navigation"
```

不得使用 `git add .`，不得提交工作区其它既有文件。
