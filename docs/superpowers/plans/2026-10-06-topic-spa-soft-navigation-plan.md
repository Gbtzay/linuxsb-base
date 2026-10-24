# 帖子 SPA 无感软跳实施计划

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 将同源 `/topic/<id>` 帖子路由纳入现有氢壳 SPA 事务，在请求和提交期间保持同一颗画布与旧正文可见，并支持帖子分页和目标楼层定位。

**Architecture:** 复用 `plugins/skin.user.js` 当前的 `navigateSpa()`、`commitRoute()`、内容范围 `#lsb-shell-route-transition` 和 `spaSerial` 事务保护，只扩展严格的帖子路由白名单和帖子分页点击例外。远端 HTML 只解析 route outlet 子节点、移除脚本并在提交前隐藏原生侧栏；提交后通过现有受控 `popstate` 让基座更新页面快照和帖子插件。站点原生交互继续依靠 document 级委托，皮肤只补充帖子目标楼层定位和路由后的画布同步。

**Tech Stack:** Userscript JavaScript, Node.js `node:test`, JSDOM 26, Playwright browser smoke, existing build/dist scripts.

## Global Constraints

- 不重建 `#lsb-shell`、顶部状态栏、右侧站点信息栏或底部工具胶囊。
- 请求未完成时保留当前 route outlet 和旧帖子内容；不得创建全屏 `#lsb-shell-route-shield`。
- 同源帖子路径只接受 `/topic/<正整数>`，保留查询参数用于 `p`、`replyid`、`floor`；淘帖详情继续整页打开。
- 列表页分页仍由现有无限滚动或整页导航处理；只有帖子当前页或帖子目标页的分页链接进入 SPA。
- 远端 `<script>` 永不执行；远端原生侧栏在连接到当前文档前加隐藏标记。
- 每个异步回调同时校验 `serial === spaSerial` 和当前过渡节点身份。
- 不重置、覆盖或格式化工作区中与本功能无关的既有改动。
- 不升级插件版本或生成 dist 产物，除非当前实现确实修改了需要发布的生产源；若构建产物必须更新，使用项目现有构建命令并只检查相关产物。

---

### Task 1: 为帖子软跳建立失败的 DOM 回归契约

**Files:**
- Modify: `test/skin.test.js:1756-1873` 附近现有 SPA 测试
- Use: `test/fixtures/home.html`, `test/fixtures/topic1.html`

**Interfaces:**
- Consumes: 现有 `makeHome()`, `loadBase()`, `stubHtmlFetch()`, `topicHtml`。
- Produces: 覆盖帖子初始导航、延迟提交、帖子分页、列表分页保留旧行为的可重复测试。

- [ ] **Step 1: 将“帖子不软跳”测试改为帖子软跳测试**

  把现有测试改成如下行为：点击 `/topic/1` 后必须向帖子 URL 发起 GET，地址最终变成 `/topic/1`，`main.wrap` 仍是同一个 outlet 节点，`#lsb-shell` 仍是同一个节点，并且当前页面出现 `.topic-post-list`。

  在测试中保留一个 `window.__spa_leaked` 脚本标记，确认换入的 `topicHtml` 中的脚本没有执行。

- [ ] **Step 2: 添加延迟请求中的连续画布测试**

  使用一个不会立即 resolve 的 `w.fetch`，点击帖子链接后断言：

  ```js
  assert.equal(document.documentElement.dataset.lsbRoutePhase, 'fetching')
  assert.equal(document.querySelector('main.wrap').getAttribute('aria-busy'), 'true')
  assert.strictEqual(document.querySelector('#lsb-shell'), shell)
  assert.strictEqual(document.querySelector('[data-surface="top-status"]'), topStatus)
  assert.strictEqual(document.querySelector('[data-surface="tool-capsule"]'), toolCapsule)
  assert.strictEqual(document.querySelector('main.wrap'), outlet)
  assert.ok(oldPostList.isConnected)
  assert.equal(document.querySelector('#lsb-shell-route-shield'), null)
  ```

  resolve 后断言 phase 被清除、过渡层隐藏、地址为 `/topic/1`、帖子列表已提交。

- [ ] **Step 3: 添加帖子分页与列表分页边界测试**

  从 `topicHtml` 中点击 `/topic/1?p=2`，断言请求被拦截并最终保留帖子路由；从首页点击 `.pagination-bar a[href*="p=2"]`，断言仍不被皮肤 SPA 拦截。分页测试用 `stubHtmlFetch()` 返回 `topicHtml`，不依赖站点真实网络。

- [ ] **Step 4: 添加楼层定位契约**

  为 `HTMLElement.prototype.scrollIntoView` 安装测试记录器，使用 `/topic/1?replyid=123` 或 `/topic/1?floor=2` 的远端返回页面，断言提交后只对匹配的 `#post-123` 或 `[data-floor="2"]` 调用定位；没有匹配节点时不抛错。

- [ ] **Step 5: 运行测试确认红灯**

  Run: `node --test test/skin.test.js --test-name-pattern="帖子软跳|软跳过渡层保持画布连续|帖子分页|楼层定位"`

  Expected: 新增/修改的帖子测试失败，原因是当前 `isSpaUrl()` 排除了 `/topic/<id>`；现有列表软跳测试不得因测试改动以外的原因失败。

### Task 2: 扩展现有 SPA 路由白名单和帖子分页点击规则

**Files:**
- Modify: `plugins/skin.user.js:5250-5280, 5760-5780`
- Test: `test/skin.test.js` from Task 1

**Interfaces:**
- Consumes: `isSpaUrl(urlLike)`, `viewCacheKey()`, `navigateSpa()`, `api.page`。
- Produces: 同源严格帖子路由识别，以及只对帖子分页放行的点击判断。

- [ ] **Step 1: 添加单一帖子路由判断函数**

  在 `isSpaUrl()` 附近新增内部判断，使用 `new URL()` 后检查：

  ```js
  const isTopicPath = /^\/topic\/\d+\/?$/.test(url.pathname)
  ```

  同源、壳开启且 `isTopicPath` 命中时返回 `true`；保留原有列表页白名单和淘帖详情排除规则。不要把 `/topic_collection/<id>` 或任意额外路径段纳入帖子 SPA。

- [ ] **Step 2: 为点击事件区分帖子分页和列表分页**

  在 `onSpaClick()` 中先解析当前 URL 和 anchor URL。将原有：

  ```js
  anchor.closest('.pagination-bar, .pagination')
  ```

  改为仅在分页容器命中且当前路由与目标路由都不是 `topic` 时返回；帖子页到帖子页的分页链接继续调用 `navigateSpa()`。

- [ ] **Step 3: 运行 Task 1 的最小测试**

  Run: `node --test test/skin.test.js --test-name-pattern="帖子软跳|帖子分页|壳内跳转：分页链接不软跳"`

  Expected: 帖子请求和帖子分页测试仍可能因提交后的适配缺失失败，但点击不再触发 JSDOM 的整页导航；列表分页测试继续通过。

### Task 3: 补齐提交后的帖子路由同步和目标楼层定位

**Files:**
- Modify: `plugins/skin.user.js:4100-4160, 5600-5760`
- Test: `test/skin.test.js`

**Interfaces:**
- Consumes: `commitRoute()`, `applyView()`, `notifyRoute()`, `afterPaint()`, `canvasSyncText()`。
- Produces: `scrollToTopicTarget(urlLike)`, 提交/缓存恢复后的 topic 定位，以及与基座路由快照同步的稳定顺序。

- [ ] **Step 1: 实现安全的帖子目标解析**

  添加内部函数 `topicTargetId(urlLike)`，只读取同源帖子 URL 的 `replyid` 或 `floor`：

  - `replyid` 只接受正整数并映射 `#post-<id>`；
  - `floor` 只接受正整数并映射 `[data-floor="<floor>"]`；
  - 同时存在时优先 `replyid`；
  - 无效值、外源 URL 和非帖子路径返回空值。

- [ ] **Step 2: 实现提交后定位函数**

  添加 `scrollToTopicTarget(urlLike = location.href)`：先查目标节点，存在时调用 `scrollIntoView({ block: 'center' })`；不存在时静默返回。使用当前文档节点，不从远端 `pageDoc` 查询。

- [ ] **Step 3: 在网络提交和缓存恢复路径统一调用定位**

  在 `navigateSpa()` 的网络提交与 `applyView()` 分支中，在 `notifyRoute()`/`syncShellRoute()` 完成后、隐藏过渡层前调用定位；通过 `afterPaint()` 或一帧调度，确保新节点已经连接。`historyMode: 'none'` 恢复缓存时使用缓存目标 URL，不重置非目标路由的滚动逻辑。

- [ ] **Step 4: 确认 route snapshot 和帖子插件按新 DOM 激活**

  保持当前顺序：先提交 outlet，再 `notifyRoute()`，让基座读取新 DOM；再调用 `syncShellRoute()` 和定位。不要执行 `pageDoc` 中的脚本，也不要手动重新注册站点全局点击/提交监听器。

- [ ] **Step 5: 运行帖子 DOM 测试确认绿灯**

  Run: `node --test test/skin.test.js --test-name-pattern="帖子软跳|软跳过渡层保持画布连续|帖子分页|楼层定位|壳内跳转：分页链接不软跳"`

  Expected: 选定测试全部通过；现有 forum/home 软跳、列表分页和历史回退测试保持通过。

### Task 4: 添加浏览器延迟响应与帖子交互冒烟

**Files:**
- Modify: `scripts/ios27-canvas-smoke.mjs` 在已有 home→forum soft-hop 循环旁
- Test data: `test/fixtures/home.html`, `test/fixtures/topic1.html`（只在必要时扩展现有夹具）

**Interfaces:**
- Consumes: 本地线上模拟路由、`baseCode`, `skinCode`、Playwright 延迟 `page.route()`。
- Produces: `artifacts/ios27-canvas/topic-soft-hop-<width>.png` 和帖子提交后的交互存在性断言。

- [ ] **Step 1: 添加首页到帖子延迟路由**

  对 `/topic/1` 路由先阻塞响应；首页点击 synthetic `/topic/1` anchor 后，等待请求开始并采样：

  - `document.documentElement.dataset.lsbRoutePhase === 'fetching'`；
  - 过渡层在顶部状态栏下方；
  - `#lsb-shell` 和 `[data-surface="top-status"]` 与点击前为同一节点；
  - `body > .top`、原生 `aside.sidebar` 的计算 `display` 为 `none`；
  - 原首页列表仍连接到文档。

- [ ] **Step 2: 完成帖子提交并验证页面类型**

  放行 `/topic/1`，等待过渡层隐藏，断言 URL 为 `/topic/1`、`.topic-post-list` 存在、帖子页标题已更新，且 `[data-surface="tool-capsule"]` 节点身份未变。

- [ ] **Step 3: 验证帖子分页和交互节点**

  将 `/topic/1?p=2` 路由返回 `topicFixture`，点击帖子分页后断言地址更新且仍有 `.ajax-reply-form`、`.topic-favorites-action .fav-btn`、`[data-donate-btn]` 或 `[data-like-coin-action]`。截图记录宽屏/中屏/窄屏中的一个过渡帧和一个提交后帧。

- [ ] **Step 4: 运行浏览器冒烟**

  Run: `npm run smoke:ios27`

  Expected: 既有画布/站点信息/背景/首屏测试和新增帖子 soft-hop 测试全部通过。

### Task 5: 处理 AI 总结 403 的可读错误信息并验证现有 UI 回归

**Files:**
- Modify: `plugins/ai-summary.user.js:535-550`
- Test: `test/ai-summary.test.js` near provider HTTP failure tests

**Interfaces:**
- Consumes: `api.net.raw()` response, existing diagnostics reason codes and toast path。
- Produces: 不把 Cloudflare HTML 整页直接展示给用户的有限错误文本；保留 HTTP 状态码和“检查端点/Key/代理”诊断方向。

- [ ] **Step 1: 添加 403 HTML 响应的失败测试**

  mock 一个 `status: 403`、`content-type` 缺失且正文以 `<!DOCTYPE html>` 开头的模型响应，运行总结并断言面板/错误消息包含 `HTTP 403` 和“端点或 API Key 被拒绝”之类的可读提示，不包含完整 HTML 标记或超过短上限的正文。

- [ ] **Step 2: 运行测试确认红灯**

  Run: `node --test test/ai-summary.test.js --test-name-pattern="403|HTTP"`

  Expected: 当前实现会把 `<!DOCTYPE html>` 原文切片拼到错误里，新增断言失败。

- [ ] **Step 3: 实现有限的 HTTP 诊断消息**

  在非 2xx 分支按状态码和正文特征生成短消息：403/401 显示认证或端点拒绝；检测到 Cloudflare 页面时追加“可能被 Cloudflare/网关拦截”；其他状态保留短 JSON message 或 `HTTP <status>`。不要保存或展示响应中的 token、Cookie 或完整 HTML。

- [ ] **Step 4: 运行 AI 总结测试**

  Run: `node --test test/ai-summary.test.js --test-name-pattern="403|HTTP|诊断|探针"`

  Expected: 新测试和既有诊断测试通过。

### Task 6: 全量验证和差异检查

**Files:**
- Inspect only: `plugins/skin.user.js`, `plugins/ai-summary.user.js`, `test/skin.test.js`, `test/ai-summary.test.js`, `scripts/ios27-canvas-smoke.mjs`, related docs

**Interfaces:**
- Consumes: Tasks 1–5 production and test changes。
- Produces: 可报告的全量测试、构建产物和浏览器验证结果。

- [ ] **Step 1: 运行相关测试**

  Run: `node --test test/skin.test.js test/skin-canvas.test.js test/ai-summary.test.js`

  Expected: 0 failures；允许既有显式 skipped tests，不把 JSDOM 的整页导航提示当成通过依据。

- [ ] **Step 2: 运行全量测试**

  Run: `npm test`

  Expected: 0 failures。

- [ ] **Step 3: 运行构建和产物校验**

  Run: `npm run build` followed by `npm run verify:dist`。

  Expected: 构建成功，userscript header 唯一且 dist 与源代码一致；若构建改动了无关产物，检查并保留工作区原有变更，不回滚它们。

- [ ] **Step 4: 运行浏览器验证**

  Run: `npm run smoke:ios27` and `node scripts/check-skin-browser.mjs`。

  Expected: 帖子延迟软跳、分页、画布稳定性、站点信息栏和现有背景层验证均通过。

- [ ] **Step 5: 检查最终差异**

  Run: `git diff --check --ignore-space-at-eol` and `git diff --stat -- <changed-files>`。

  检查内容：没有全屏遮罩回归、没有执行远端脚本、没有修改无关既有文件、测试名称与实际行为一致。
