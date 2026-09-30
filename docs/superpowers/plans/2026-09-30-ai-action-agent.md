# AI 站内只读操作代理 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 在现有氢壳右栏 AI 工作台中加入自然语言只读操作代理，让用户预览并执行导航、站内搜索、列表筛选和打开面板等受限站内动作。

**Architecture:** 基座新增 `ActionRegistry`，负责动作登记、页面过滤、动态参数目录、严格 schema 校验、计划校验和提供方生命周期清理。每个规范化步骤都绑定动作版本与提供方；导航、搜索、筛选等离开当前页的终止动作只能位于计划末尾。独立的 `ai-actions` 插件登记首批站点动作，`skin` 登记当前列表筛选；`ai-copilot` 只负责把用户命令转换成版本化 JSON 计划，`ai-workbench` 负责预览、串行执行、失败重试、过期检测和本地历史。任何模型输出都不能直接访问 DOM、发任意请求或调用未登记动作。

**Tech Stack:** 原生 JavaScript userscript、ES modules、LSB 插件 API、JSDOM/Node `node:test`、`api.store` 本地存储、esbuild 构建脚本。

## Global Constraints

- 首版只读：不申请或调用 `write`、外部 `net`、`admin`；不回复、点赞、收藏、签到、发帖或改变追踪状态。
- 模型只能返回 `version / summary / steps` 计划；未知字段、未知动作、外部 URL、脚本协议、任意 DOM 选择器和任意 HTTP 请求一律拒绝。
- 计划至少 1 步、最多 5 步；步骤按顺序执行，某步失败立即停止，只能重试失败步骤。
- 计划预览阶段不执行动作；必须由用户点击一次“执行计划”后才产生导航、搜索、筛选或打开面板副作用。
- 路由、页面类型、动作提供方或工作台代次变化后，旧计划过期，旧异步回调不得回写新页面。
- 路由上下文和历史只保留 `type/id/page/sort/tab` 白名单字段，不传递或持久化原始 URL 查询参数；加载旧历史时也要清除已保存的查询参数。
- 默认只发送最小路由、页面摘要、可见状态和动作目录；只有用户以肯定指令明确要求读取或分析当前帖子时才发送受预算限制的帖子内容，任何否定词都会关闭帖子正文上下文。
- `site.navigate`、`site.search`、`site.filter` 会离开当前页，必须是计划的最后一步；注册表拒绝提前放置，执行器还会检查动作实际结果。
- 模型计划步骤只能含 `action/args`；本地校验后才附加 `actionVersion/actionProvider` 绑定，执行前必须匹配当前动作。
- `api.net.search(query, field)` 是基座提供的固定站内语义 API；通用 `api.actions.search` 继续受 `write` 权限保护。
- 动作执行结果必须是可序列化对象，不能包含 API Key、Cookie、CSRF、完整私密页面正文或函数引用。
- 氢壳宽屏右栏继续显示“站点 / AI”；窄屏、氢壳关闭、skin 停用或工作台未安装时保留现有入口。
- `dist/` 只由构建命令生成；LTS 不收录 `ai-copilot`、`ai-actions` 或 `ai-workbench`。
- 兼容目标保持已审计结论：linux.sb BBS1ORG v99.0，bbs1.org 公开实例 v10.3；不根据版本号分支，沿用现有 `src/site.js` 解析器和 skin 宿主。

---

## Preflight：现有代码与兼容边界

执行实现前复核以下事实，不新增第二套 DOM 选择器：

- `src/core.js` 已有按插件隔离的 `need()` 权限门、`own()` 生命周期清理、`_dispose()` 停用路径和 `api.onDispose()`。
- `src/ui.js` 已有分页注册表；右栏外部视图协议 `registerShellAsideView()` / `shellAsideViews()` 已存在，工作台只需增加操作台子模式。
- `src/net.js` 的 `Actions.search()` 已验证 linux.sb 搜索协议为 `POST /search`，JSON 返回站内 redirect，再抓取 redirect 文档；新语义 API 必须复用这个协议但独立走 `read` 权限。
- `plugins/ai-workbench.user.js` 当前操作台调用 `ai-copilot.runConsoleQuery()`；新命令模式必须与现有“查询”模式并列，不能破坏帖子副驾、追踪和旧顶栏入口。
- `.tmp-live-dom/` 为本地审计快照，不进版本库；帖子页未登录时回复区可能只有 `.replies-login-visible`，主楼常无 `data-floor`，不得推算楼层。

## 文件结构与职责

- **Create:** `src/ai-actions.js`
  - `ActionRegistry`、动作 schema 解析、动作目录、计划和步骤校验、序列化结果检查、提供方注销。
- **Modify:** `src/core.js`
  - 创建 `core.ai`，向插件暴露 `api.ai.registerAction()`、`actions()`、`describe()`、`validate()`、`validatePlan()`、`preview()`、`execute()`；停用插件时清理其动作。
- **Modify:** `src/net.js`
  - 增加固定站内 `Net.search()` 语义实现；只接受允许字段和站内 redirect。
- **Modify:** `src/ui.js`
  - 增加只读 `panelCatalog()`，为 `ui.openPanel` 提供当前已注册面板目录。
- **Modify:** `test/core.test.js`, `test/net.test.js`
  - 覆盖 API 门、生命周期、语义搜索协议和现有写动作权限不回退。
- **Create:** `test/ai-actions.test.js`
  - 覆盖 registry 排序、页面过滤、动态 enum、schema/计划拒绝、注销和结果序列化。
- **Create:** `plugins/ai-actions.user.js`
  - 登记 `site.navigate`、`site.search`、`ui.openPanel` 三个首批动作；不保存数据、不申请 write/net/admin。
- **Modify:** `plugins/skin.user.js`
  - 登记当前首页/版块可用的 `site.filter`，筛选值为固定排序枚举，执行只改变站内导航 URL。
- **Modify:** `test/skin.test.js`
  - 验证 skin 激活时动作目录包含筛选，离开列表页后动作隐藏，停用后动作注销。
- **Modify:** `plugins/ai-copilot.user.js`
  - 增加最小操作上下文、严格动作计划生成/解析/本地校验和公开 `planActions()` 导出；保留现有查询协议和 debug RPC。
- **Modify:** `test/ai-copilot.test.js`
  - 覆盖合法/非法计划、上下文最小化、明确要求帖子内容时的预算、模型输出不可信。
- **Modify:** `plugins/ai-workbench.user.js`
  - 在操作台内增加“查询 / 站内操作”子模式、计划预览、串行执行状态、失败重试、过期处理和本地历史；manifest 增加 `storage`。
- **Modify:** `test/ai-workbench.test.js`
  - 覆盖预览无副作用、顺序执行、失败停止、单步重试、路由过期、手动动作目录和历史裁剪。
- **Modify:** `suite/order.js`, `build-suite.mjs`, `suite/suite-center.js`, `README.md`
  - Oxygen 收录 `ai-actions`，AI 模块版本和说明同步；LTS 保持排除。
- **Modify:** `test/suite.test.js`, `test/lts.test.js`
  - 覆盖套件顺序、版本标记、LTS 排除和生成产物内容。
- **Generated:** `dist/linuxsb-base.user.js`, `dist/linuxsb-suite.user.js`, `dist/linuxsb-lts.user.js`
  - 只通过 `npm run build` 生成，随后执行 `npm run verify:dist`。

## Interfaces between tasks

### 基座动作 API

```js
api.ai.registerAction({
  id: 'site.search',
  version: 1,
  label: '站内搜索',
  description: '按关键词和字段搜索站内内容',
  permission: 'read',
  pages: ['home', 'forum', 'topic', 'user'],
  args: {
    query: { type: 'string', minLength: 1, maxLength: 120 },
    field: { type: 'enum', values: ['title', 'body', 'reply'] },
  },
  preview: (args) => `搜索“${args.query}”`,
  execute: async (args, context) => ({ kind: 'navigation', url: '/search', label: '已打开搜索结果' }),
}) // -> () => void

api.ai.actions(context)
// -> [{ id, version, label, description, permission, terminal, pages, args }]

api.ai.validatePlan(plan, context, { requireActionBinding })
// -> { ok: true, plan, steps } | { ok: false, errors: [{ code, path, message }] }

api.ai.preview(step, context)
// -> { ok: true, text } | { ok: false, error }

api.ai.execute(step, context)
// -> Promise<serializableResult>; revalidates before invoking execute()
```

`args.<key>.values` 可以是函数，但只有调用 `actions()` / `describe()` 时才解析为有限字符串数组；函数本身不会暴露给模型。动作提供方的 `validateArgs(args, context)` 用于 `target` 与 `id` 等条件约束。

### 计划协议

```json
{
  "version": 1,
  "summary": "搜索标题中的缓存",
  "steps": [
    { "action": "site.search", "args": { "query": "缓存", "field": "title" } }
  ]
}
```

模型计划允许的顶层字段只有 `version`、`summary`、`steps`；每个步骤只有 `action`、`args`。本地校验后的步骤增加 `actionVersion` 与 `actionProvider` 绑定，模型不能提供或覆盖这些字段。状态为 `draft`、`ready`、`running`、`completed`、`partial`、`failed`、`expired`、`cancelled`。工作台历史最多保留 20 条，单条只存命令、绑定后的计划、白名单路由指纹、步骤状态和错误摘要。

### 首批动作

- `site.navigate`：`target` 为 `home/forum/topic/user/feature`；数字 ID 必须为正整数；`feature` 只能来自固定键（如 `profile`、`forum_list`、`featured`、`collections`、`checkin`、`leaderboard`、`gacha`、`wallet`）。路径通过 `api.routes` 构造，不接受 URL 字符串。
- `site.search`：`query` 1–120 个字符且不含控制字符；`field` 只能为 `title/body/reply`；调用 `api.net.search()` 后只导航到站内 redirect。
- `ui.openPanel`：`id` 为 `api.ui.panelCatalog()` 当前返回的已注册面板 ID；不接受新建或任意 DOM ID。
- `site.filter`：仅由 skin 在 `home/forum` 页面登记；排序值为固定枚举，按当前页面构造 `/index.php?sort=...` 或 `/forum/:id?sort=...`。

---

## Task 1: 基座动作注册表、权限 API 与只读搜索

**Files:**
- Create: `src/ai-actions.js`
- Modify: `src/core.js`
- Modify: `src/net.js`
- Modify: `src/ui.js`
- Test: `test/ai-actions.test.js`, `test/core.test.js`, `test/net.test.js`

**Interfaces:**
- Consumes: `PluginRecord.disposers`, `Core._dispose()`, `Net.form()/doc()`, `UI._tabs`。
- Produces: 本计划“基座动作 API”全部方法；`api.net.search(query, field)`；`api.ui.panelCatalog()`。

- [x] **Step 1: 写 registry 和 API 的失败测试。**

在 `test/ai-actions.test.js` 增加以下断言，先验证缺少 `api.ai`：

```js
test('动作注册表：按 order 排序、页面过滤并拒绝重复 id', () => {
  const registry = new ActionRegistry()
  registry.register({ id: 'z.last', version: 1, order: 20, label: 'Z', permission: 'read', execute: () => ({ ok: true }) }, 'p')
  registry.register({ id: 'a.first', version: 1, order: 10, label: 'A', permission: 'read', pages: ['home'], execute: () => ({ ok: true }) }, 'p')
  assert.deepEqual(registry.actions({ route: { type: 'home' } }).map((x) => x.id), ['a.first', 'z.last'])
  assert.deepEqual(registry.actions({ route: { type: 'topic' } }).map((x) => x.id), ['z.last'])
  assert.throws(() => registry.register({ id: 'z.last', version: 1, permission: 'read', execute: () => ({}) }, 'q'), /重复/) 
})

test('计划校验：未知字段、未知动作、外部 URL 和超过五步都拒绝', () => {
  const registry = new ActionRegistry()
  registry.register({ id: 'site.navigate', version: 1, permission: 'read', args: { target: { type: 'enum', values: ['home'] } }, execute: () => ({ kind: 'navigation', url: '/' }) }, 'p')
  const base = { version: 1, summary: '回首页', steps: [{ action: 'site.navigate', args: { target: 'home' } }] }
  assert.equal(registry.validatePlan(base, { route: { type: 'topic' } }).ok, true)
  assert.equal(registry.validatePlan({ ...base, extra: 1 }, {}).ok, false)
  assert.equal(registry.validatePlan({ ...base, steps: [{ action: 'site.missing', args: {} }] }, {}).ok, false)
  assert.equal(registry.validatePlan({ ...base, steps: [{ action: 'site.navigate', args: { target: 'home', url: 'https://evil.example' } }] }, {}).ok, false)
  assert.equal(registry.validatePlan({ ...base, steps: Array.from({ length: 6 }, () => base.steps[0]) }, {}).ok, false)
})
```

在 `test/core.test.js` 增加：

```js
test('动作提供方停用后注销，未声明 read/ui 权限不能登记对应动作', () => {
  const core = boot()
  let api
  core.register({ id: 'action-provider', version: '1.0.0', permissions: ['events'] }, (a) => { api = a })
  assert.throws(() => api.ai.registerAction({ id: 'x.read', version: 1, permission: 'read', execute: () => ({}) }), /未声明 'read'/)
  core.register({ id: 'good-provider', version: '1.0.0', permissions: ['read', 'ui', 'events'] }, (a) => {
    a.ai.registerAction({ id: 'ui.test', version: 1, permission: 'ui', execute: () => ({ ok: true }) })
  })
  assert.equal(core.ai.actions({}).some((x) => x.id === 'ui.test'), true)
  core.disable('good-provider')
  assert.equal(core.ai.actions({}).some((x) => x.id === 'ui.test'), false)
})
```

在 `test/net.test.js` 增加固定搜索协议夹具：

```js
test('Net.search：只 POST 固定 /search 并返回站内 redirect', async () => {
  const calls = []
  const net = new Net({ origin: 'https://linux.sb', rate: 0, log: () => {} })
  net._viaFetch = async (url, init) => {
    calls.push({ url, method: init.method, body: init.body })
    if (url.endsWith('/search')) return { status: 200, ok: true, url, text: JSON.stringify({ ok: 1, redirect: '/index.php?q=%E7%BC%93%E5%AD%98&field=title' }) }
    return { status: 200, ok: true, url, text: '<html></html>' }
  }
  const result = await net.search('缓存', 'title')
  assert.equal(result.url, '/index.php?q=%E7%BC%93%E5%AD%98&field=title')
  assert.equal(calls[0].method, 'POST')
  assert.equal(new URL(calls[0].url).pathname, '/search')
  await assert.rejects(() => net.search('\u0000', 'title'), /关键词/)
})
```

- [x] **Step 2: 运行失败测试。**

Run: `node --test test/ai-actions.test.js test/core.test.js --test-name-pattern "动作注册表|动作提供方停用"`  
Expected: FAIL，`ActionRegistry` 和 `api.ai` 尚未存在。  
Run: `node --test test/net.test.js --test-name-pattern "Net.search"`  
Expected: FAIL，`Net.search` 尚未存在。

- [x] **Step 3: 实现最小 `ActionRegistry`。**

在 `src/ai-actions.js` 实现以下边界。实现时保留这些错误码，测试按错误码而不是模糊文案断言：

```js
export const AI_PLAN_VERSION = 1
export const AI_MAX_STEPS = 5

export class ActionRegistry {
  constructor() { this._actions = new Map() }

  register(spec, owner) {
    if (!/^[a-z][a-z0-9-]*(?:\.[a-z0-9-]+)+$/.test(String(spec?.id || ''))) throw new Error('action.invalid-id')
    if (!Number.isInteger(spec.version) || spec.version < 1) throw new Error('action.invalid-version')
    if (!['read', 'ui'].includes(spec.permission)) throw new Error('action.invalid-permission')
    if (typeof spec.execute !== 'function' || typeof spec.preview !== 'function') throw new Error('action.missing-handler')
    if (this._actions.has(spec.id)) throw new Error(`action.duplicate:${spec.id}`)
    const record = { ...spec, id: String(spec.id), owner: String(owner || '__core'), order: Number(spec.order) || 100 }
    this._actions.set(record.id, record)
    return () => { if (this._actions.get(record.id) === record) this._actions.delete(record.id) }
  }

  dispose(owner) {
    for (const [id, record] of this._actions) if (record.owner === owner) this._actions.delete(id)
  }

  actions(context = {}) {
    return [...this._actions.values()]
      .filter((record) => !record.pages || record.pages.includes(context.route?.type))
      .filter((record) => record.available ? record.available(context) !== false : true)
      .sort((a, b) => a.order - b.order || a.label.localeCompare(b.label))
      .map((record) => ({ id: record.id, version: record.version, label: record.label, description: record.description, permission: record.permission, pages: record.pages || null, args: resolvePublicSchema(record.args || {}, context) }))
  }

  describe(context = {}) { return this.actions(context) }

  validate(step, context = {}) {
    if (!step || typeof step !== 'object' || Array.isArray(step)) return fail('step.invalid', '步骤必须是对象')
    if (Object.keys(step).some((key) => !['action', 'args'].includes(key))) return fail('step.unknown-field', '步骤包含未知字段')
    const record = this._actions.get(step.action)
    if (!record) return fail('action.unknown', `未知动作：${String(step.action || '')}`)
    const args = validateSchema(step.args || {}, record.args || {}, context)
    if (!args.ok) return args
    const custom = record.validateArgs?.(args.value, context)
    if (custom) return { ok: false, error: custom }
    return { ok: true, action: record, args: args.value }
  }

  validatePlan(plan, context = {}) {
    if (!plan || typeof plan !== 'object' || Array.isArray(plan)) return { ok: false, errors: [fail('plan.invalid', '计划必须是对象').error] }
    const errors = []
    if (Object.keys(plan).some((key) => !['version', 'summary', 'steps'].includes(key))) errors.push(fail('plan.unknown-field', '计划包含未知字段').error)
    if (plan.version !== AI_PLAN_VERSION) errors.push(fail('plan.version', '计划版本不支持').error)
    if (typeof plan.summary !== 'string' || plan.summary.length > 240) errors.push(fail('plan.summary', '计划摘要长度不合法').error)
    if (!Array.isArray(plan.steps) || plan.steps.length < 1 || plan.steps.length > AI_MAX_STEPS) errors.push(fail('plan.steps', '计划步骤数必须为 1 到 5').error)
    const steps = []
    for (let i = 0; i < (Array.isArray(plan.steps) ? plan.steps.length : 0); i++) {
      const result = this.validate(plan.steps[i], context)
      if (!result.ok) errors.push({ ...result.error, path: `steps[${i}].${result.error.path || ''}` })
      else steps.push({ action: plan.steps[i].action, args: result.args })
    }
    return errors.length ? { ok: false, errors } : { ok: true, plan: { version: AI_PLAN_VERSION, summary: plan.summary, steps }, steps }
  }

  preview(step, context = {}) {
    const result = this.validate(step, context)
    if (!result.ok) return result
    const text = String(result.action.preview(result.args, context) || '').trim()
    return text.length <= 240 ? { ok: true, text } : fail('preview.too-long', '预览文案过长')
  }

  async execute(step, context = {}) {
    const result = this.validate(step, context)
    if (!result.ok) throw new Error(result.error.code)
    const value = await result.action.execute(result.args, context)
    try { JSON.stringify(value) } catch { throw new Error('result.not-serializable') }
    if (value === undefined || typeof value === 'function') throw new Error('result.invalid')
    return value
  }
}
```

`fail()`、`resolvePublicSchema()` 和 `validateSchema()` 是同文件内的纯函数：`fail(code,message)` 返回 `{ ok:false, error:{ code, path:'', message } }`；`resolvePublicSchema()` 复制 schema 并把 `values` 函数解析为去重后的字符串数组；`validateSchema()` 检查字符串控制字符、长度、数字整数范围、enum 值、缺失必填键和未知键，并返回 `{ ok:true, value }` 或上述结构化错误。

schema 只实现本版需要的 `string`、`number`、`enum`、`boolean`、`optional`、`minLength`、`maxLength`、`min`、`max`、`integer`、`values`；默认拒绝未知参数。`values` 函数解析失败时返回 `schema.values-unavailable`。所有错误使用 `{ code, path, message }`，不把动作闭包或 provider 细节返回给插件。

在 `src/core.js` 构造 `this.ai = new ActionRegistry()`；`_makeApi()` 增加：

```js
ai: {
  registerAction: (spec) => {
    const permission = spec?.permission || 'read'
    need(permission, '注册 AI 动作')
    return own(core.ai.register(spec, rec.id))
  },
  actions: (context) => (need('read', '读取 AI 动作目录'), core.ai.actions(context)),
  describe: (context) => (need('read', '读取 AI 动作目录'), core.ai.describe(context)),
  validate: (step, context) => (need('read', '校验 AI 动作'), core.ai.validate(step, context)),
  validatePlan: (plan, context) => (need('read', '校验 AI 计划'), core.ai.validatePlan(plan, context)),
  preview: (step, context) => (need('read', '预览 AI 动作'), core.ai.preview(step, context)),
  execute: (step, context) => (need('read', '执行 AI 动作'), core.ai.execute(step, context)),
},
```

`Core._dispose(rec)` 在清理 disposers 后调用 `core.ai.dispose(rec.id)`，防止 provider 停用后旧计划继续持有动作闭包。

在 `src/ui.js` 增加：

```js
panelCatalog() {
  return this._tabs.map((tab) => ({ id: String(tab.id), label: String(tab.name || tab.id) }))
}
```

并在 `api.ui` 暴露 `panels()`，只返回上述副本。这个方法只读，不开放 `_tabs` 引用。

在 `src/net.js` 增加：

```js
async search(query, field = 'title') {
  const q = String(query || '').trim()
  if (!q || q.length > 120 || /[\u0000-\u001f\u007f]/.test(q)) throw new Error('关键词长度或字符不合法')
  if (!['title', 'body', 'reply'].includes(field)) throw new Error('搜索字段不合法')
  const res = await this.form(ROUTES.post.search, { q, field })
  const parsed = JSON.parse(res.text || '{}')
  const url = new URL(parsed.redirect || '', this.origin)
  if (url.origin !== this.origin || !/^\/(?:index\.php|search)(?:$|\?)/.test(url.pathname + url.search)) {
    throw new Error('搜索接口返回了站外或未知 redirect')
  }
  return { url: url.pathname + url.search, doc: await this.doc(url.pathname + url.search) }
}
```

`Actions.search()` 暂不改权限和公开行为，继续由 `api.actions` 的 `write` 门保护。

- [x] **Step 4: 运行通过测试并补充回归。**

Run: `node --test test/ai-actions.test.js test/core.test.js --test-name-pattern "动作注册表|动作提供方停用|权限"`  
Expected: PASS。  
Run: `node --test test/net.test.js`  
Expected: 所有网络和写动作测试 PASS。

- [x] **Step 5: 提交基座切片。**

```bash
git add src/ai-actions.js src/core.js src/net.js src/ui.js test/ai-actions.test.js test/core.test.js test/net.test.js
git commit -m "feat: add readonly ai action registry"
```

---

## Task 2: 首批动作提供方与列表筛选

**Files:**
- Create: `plugins/ai-actions.user.js`
- Modify: `plugins/skin.user.js`
- Test: `test/ai-actions.test.js`, `test/skin.test.js`

**Interfaces:**
- Consumes: Task 1 的 `api.ai.*`、`api.net.search()`、`api.ui.panels()`、`api.routes`、`api.page`。
- Produces: 当前页面可用的 `site.navigate`、`site.search`、`ui.openPanel`、`site.filter` 动作。

- [x] **Step 1: 写动作提供方失败测试。**

在 `test/ai-actions.test.js` 使用现有 `baseCode + eval` 夹具加载新插件，锁定：

```js
test('首批动作：目录只暴露固定目标，执行不接受任意 URL', async () => {
  const w = makeSite('home')
  await load(w, PLUG('ai-actions.user.js'))
  const actions = w.LSB.__core.ai.actions({ route: { type: 'home' } })
  assert.deepEqual(actions.map((item) => item.id), ['site.navigate', 'site.search', 'ui.openPanel'])
  const navigate = actions.find((item) => item.id === 'site.navigate')
  assert.ok(navigate.args.target.values.includes('forum'))
  const bad = w.LSB.__core.ai.validate({ action: 'site.navigate', args: { target: 'feature', feature: 'javascript:alert(1)' } }, { route: { type: 'home' } })
  assert.equal(bad.ok, false)
})

test('站内搜索动作：只调用语义 API，并返回站内导航结果', async () => {
  const w = makeSite('home')
  await load(w, PLUG('ai-actions.user.js'))
  let called = null
  w.LSB.__core.net.search = async (q, field) => { called = [q, field]; return { url: '/index.php?q=x&field=title' } }
  const result = await w.LSB.__core.ai.execute({ action: 'site.search', args: { query: '缓存', field: 'title' } }, { route: { type: 'home' } })
  assert.deepEqual(called, ['缓存', 'title'])
  assert.equal(result.kind, 'navigation')
  assert.match(result.url, /^\/index\.php\?/) 
})
```

在 `test/skin.test.js` 增加：

```js
test('skin 登记列表筛选：只在首页/版块可见，停用后注销', async () => {
  const { w } = makeHome()
  await loadBase(w, PLUG('skin.user.js'))
  const ids = w.LSB.__core.ai.actions({ route: { type: 'home' } }).map((x) => x.id)
  assert.ok(ids.includes('site.filter'))
  assert.equal(w.LSB.__core.ai.actions({ route: { type: 'topic' } }).some((x) => x.id === 'site.filter'), false)
  w.LSB.disable('skin')
  assert.equal(w.LSB.__core.ai.actions({ route: { type: 'home' } }).some((x) => x.id === 'site.filter'), false)
})
```

- [x] **Step 2: 运行失败测试。**

Run: `node --test test/ai-actions.test.js test/skin.test.js --test-name-pattern "首批动作|站内搜索动作|列表筛选"`  
Expected: FAIL，因为动作提供方尚未登记。

- [x] **Step 3: 实现 `ai-actions.user.js`。**

manifest 固定为：`id: 'ai-actions'`、版本 `0.1.0`、`requires.base: '^0.1.43'`、权限 `['read', 'ui', 'events']`。

`site.navigate` 的 route 表只能由本地常量构造：

```js
const FEATURES = Object.freeze({
  profile: () => api.routes.profile,
  forum_list: () => api.routes.forumList,
  featured: () => api.routes.featured,
  collections: () => api.routes.collections,
  checkin: () => api.routes.checkin,
  leaderboard: () => api.routes.leaderboard('points'),
  gacha: () => api.routes.gacha,
  wallet: () => api.routes.wallet,
  identity: () => api.routes.identity,
  promotions: () => api.routes.promotions,
  essence_review: () => api.routes.essenceReview,
})
```

动作的 `validateArgs` 按 target 检查：`home` 不需要 ID；`forum/topic/user` 需要正整数 ID；`user` 的 tab 只能来自 `topics/replies/attachments/notifications/points_rewards/favorites`；`feature` 只能来自 `FEATURES`。`execute` 只返回 `{ kind: 'navigation', url, label }`，通过 `location.assign(url)` 发起站内导航；所有 URL 由 `api.routes` 产生。

`site.search` 使用 `await api.net.search(args.query, args.field)`，只把返回的 `url` 交给 `location.assign()`，不把 `Document` 放进动作结果。

`ui.openPanel` 的 `id` schema 使用动态 `values: () => api.ui.panels().map(({ id }) => id)`；`execute` 调用 `api.ui.openPanel(id)`，返回 `{ kind: 'panel', id, label }`。

在 `plugins/skin.user.js` setup 激活时登记 `site.filter`：

```js
const SORTS = Object.freeze(['post', 'comment', 'lucky', 'card', 'red_packet'])
api.ai.registerAction({
  id: 'site.filter', version: 1, label: '列表筛选', permission: 'read',
  pages: ['home', 'forum'],
  args: { sort: { type: 'enum', values: SORTS } },
  validateArgs: (args, ctx) => ctx.route?.type === 'forum' && !Number.isInteger(Number(ctx.route.id))
    ? { code: 'route.invalid', message: '当前版块路由无效' } : null,
  preview: (args, ctx) => `按“${args.sort}”排序当前${ctx.route.type === 'forum' ? '版块' : '首页'}列表`,
  execute: (args, ctx) => ({ kind: 'navigation', url: ctx.route.type === 'forum' ? `/forum/${ctx.route.id}?sort=${args.sort}` : `/index.php?sort=${args.sort}`, label: '已应用列表筛选' }),
})
```

`skin` 仍通过现有 `api.onDispose` 自动注销；动作执行只导航，不修改 DOM 或站点数据。

- [x] **Step 4: 运行通过测试并检查动作目录。**

Run: `node --test test/ai-actions.test.js test/skin.test.js --test-name-pattern "首批动作|站内搜索动作|列表筛选"`  
Expected: PASS；动作目录不含 execute 函数、不含外部 URL。

- [x] **Step 5: 提交动作提供方切片。**

```bash
git add plugins/ai-actions.user.js plugins/skin.user.js test/ai-actions.test.js test/skin.test.js
git commit -m "feat: register readonly site actions"
```

---

## Task 3: AI 副驾生成严格动作计划

**Files:**
- Modify: `plugins/ai-copilot.user.js`
- Test: `test/ai-copilot.test.js`

**Interfaces:**
- Consumes: Task 1 的 `api.ai.describe()` / `validatePlan()`、`ai-summary` provider、`api.page` / `api.snapshot`。
- Produces: `planActions({ command, force }) -> Promise<{ plan, context, previews, meta }>`；工作台不读取 debug RPC。

- [x] **Step 1: 写失败测试，先锁定协议和隐私边界。**

在 `test/ai-copilot.test.js` 增加两阶段模型回复夹具：

```js
test('动作计划：解析 fenced JSON，目录和预览来自本地，模型不能声明已执行', async () => {
  const ctx = makeSite(topicHtml, 'https://linux.sb/topic/1', {
    _llmReply: { choices: [{ message: { content: '```json\n{"version":1,"summary":"回首页","steps":[{"action":"site.navigate","args":{"target":"home"} }]}\n```' } }] },
  })
  await load(ctx)
  const exported = ctx.w.LSB.__core.plugins.get('ai-copilot').exports
  const record = await exported.planActions({ command: '回到首页' })
  assert.equal(record.plan.version, 1)
  assert.equal(record.plan.steps[0].action, 'site.navigate')
  assert.match(record.previews[0].text, /首页/)
  assert.equal(record.plan.executed, undefined)
  assert.doesNotMatch(JSON.stringify(ctx.lastLlm?.() || {}), /apiKey|_csrf|cookie/i)
})

test('动作计划：非法 JSON、未知动作和非当前帖子请求都被本地拒绝', async () => {
  const ctx = makeSite(topicHtml, 'https://linux.sb/topic/1', {
    _llmReplies: [
      { choices: [{ message: { content: '{"version":1,"summary":"x","steps":[{"action":"site.missing","args":{}}]}' } }] },
      { choices: [{ message: { content: '不是 JSON' } }] },
    ],
  })
  await load(ctx)
  const exported = ctx.w.LSB.__core.plugins.get('ai-copilot').exports
  await assert.rejects(() => exported.planActions({ command: '执行未知动作' }), /未知动作|计划/) 
  await assert.rejects(() => exported.planActions({ command: '根据这篇帖子打开相关面板' }), /JSON|计划/) 
})
```

- [x] **Step 2: 运行失败测试。**

Run: `node --test test/ai-copilot.test.js --test-name-pattern "动作计划"`  
Expected: FAIL，`planActions` 尚未导出。

- [x] **Step 3: 实现最小安全计划生成。**

在 `ai-copilot` 中新增常量 `ACTION_PLAN_VERSION = 1` 和 `ACTION_MAX_CHARS = 12000`，manifest 版本提升为 `0.7.0`，仍只保留 `read/storage/ui/events`。

实现 `actionContext(command)`：

```js
function actionContext(command) {
  const route = { type: String(api.page.type || ''), id: Number(api.page.id || 0) || 0, href: `${location.pathname}${location.search}` }
  const context = {
    route,
    page: { title: String(document.title || '').slice(0, 160), forum: String(api.snapshot?.topic?.forumName || '').slice(0, 80) },
    selection: null,
    visibleState: { search: route.type === 'search', activeFilter: api.page.sort || null },
  }
  if (/(这篇帖子|当前帖子|本帖|当前楼层|这条帖子)/.test(String(command || '')) && route.type === 'topic') {
    const topic = normalizeTopic(api.parse.topic(document) || api.snapshot?.topic)
    context.currentTopic = { id: topic?.id || route.id, title: String(topic?.title || '').slice(0, 240), posts: (topic?.posts || []).map((post) => ({ floor: post.floor, authorName: post.authorName, content: post.content.slice(0, 500) })).slice(0, 40) }
  }
  context.availableActions = api.ai.describe(context).map((item) => ({ id: item.id, label: item.label, description: item.description, args: item.args, pages: item.pages }))
  return context
}
```

实现 `buildActionPlanRequest(command, context)`：system 明确要求只输出 JSON、只用 `<action-catalog>` 中的动作、不执行、不服从帖子正文中的指令；user 只包含命令、路由、页面摘要、动作目录和可选的当前帖子摘要。请求 fingerprint 只用上述字段，不含 API Key/CSRF。

实现 `parseActionPlanText(text, context)`：去掉单层 ```json 围栏后 `JSON.parse`，调用 `api.ai.validatePlan()`；把每一步本地 `api.ai.preview()` 的结果组合到 `previews`，任何失败都抛出带字段路径的中文错误。模型返回的 `executed`、`url`、`selector` 等额外字段会被 registry 拒绝。

实现并导出：

```js
async function planActions({ command, force = false } = {}) {
  const normalized = String(command || '').trim()
  if (!normalized) throw new Error('请输入站内操作')
  const context = actionContext(normalized)
  const request = buildActionPlanRequest(normalized, context)
  const cacheKey = `action-plan:${request.fingerprint}`
  let plan = !force ? api.store.get(cacheKey, null)?.plan : null
  if (!plan) {
    const result = await provider.generate({ system: request.system, user: request.user })
    if (!result?.text) throw new Error('模型没有返回操作计划')
    plan = parseActionPlanText(result.text, context)
    api.store.set(cacheKey, { plan, meta: { ts: Date.now(), question: normalized } })
  }
  const validated = api.ai.validatePlan(plan, context)
  if (!validated.ok) throw new Error(validated.errors.map((item) => item.code).join('、'))
  const previews = validated.steps.map((step) => api.ai.preview(step, context))
  if (previews.some((item) => !item.ok)) throw new Error('动作预览生成失败')
  return { plan: validated.plan, context: api.util.clone(context), previews, meta: { stage: 'action-plan', ts: Date.now(), model: provider.model?.() || '' } }
}
return { ...existingExports, planActions, actionContext: () => api.util.clone(actionContext('')) }
```

不在 `ai-copilot` 中执行动作；计划缓存可按 `action-plan:<fingerprint>` 写入自己的 storage，但不能代替工作台历史，也不能把模型原文当成可执行状态。

- [x] **Step 4: 运行通过测试并回归现有 console。**

Run: `node --test test/ai-copilot.test.js --test-name-pattern "动作计划|公开工作台接口"`  
Expected: PASS。  
Run: `node --test test/ai-copilot.test.js`  
Expected: 原有帖子问答、分析、追踪、导出和自然语言查询测试全部 PASS。

- [x] **Step 5: 提交计划生成切片。**

```bash
git add plugins/ai-copilot.user.js test/ai-copilot.test.js
git commit -m "feat: add readonly action plan generation"
```

---

## Task 4: 工作台命令模式、计划预览与执行器

**Files:**
- Modify: `plugins/ai-workbench.user.js`
- Test: `test/ai-workbench.test.js`

**Interfaces:**
- Consumes: Task 1 的 `api.ai.validatePlan/preview/execute`、Task 2 的动作目录、Task 3 的 `copilot.planActions()`。
- Produces: 右栏操作台内的“查询 / 站内操作”子模式、计划状态 UI、失败重试按钮、本地 20 条历史。

- [x] **Step 1: 写失败测试，锁定预览不执行和顺序执行。**

在现有 `test/ai-workbench.test.js` 扩展夹具，注册两个测试动作并记录调用：

```js
test('AI 工作台：命令先显示计划，点击执行后才按顺序调用动作', async () => {
  const w = makeSite()
  await load(w)
  const calls = []
  w.LSB.register({ id: 'test-actions', version: '1.0.0', permissions: ['read', 'events'] }, (api) => {
    api.ai.registerAction({ id: 'test.first', version: 1, permission: 'read', label: '第一步', args: {}, preview: () => '先做第一步', execute: async () => { calls.push('first'); return { ok: true } } })
    api.ai.registerAction({ id: 'test.second', version: 1, permission: 'read', label: '第二步', args: {}, preview: () => '再做第二步', execute: async () => { calls.push('second'); return { ok: true } } })
  })
  const wb = w.document.querySelector('[data-ai-workbench]')
  wb.querySelector('[data-ai-command-mode="action"]').click()
  wb.querySelector('[data-ai-action-command]').value = '执行两步'
  wb.querySelector('[data-ai-action-run]').click()
  assert.deepEqual(calls, [], '预览阶段不能调用 execute')
  assert.equal(await until(() => wb.querySelector('[data-ai-action-plan]')), true)
  wb.querySelector('[data-ai-action-execute]').click()
  assert.equal(await until(() => calls.length === 2), true)
  assert.deepEqual(calls, ['first', 'second'])
  assert.match(wb.querySelector('[data-ai-action-status]').textContent, /已完成/)
})
```

再增加失败、重试、过期和历史断言：

```js
test('AI 工作台：步骤失败停止后续，重试只调用失败步骤；路由变化使计划过期', async () => {
  const w = makeSite()
  await load(w)
  const calls = []
  let attempts = 0
  w.LSB.register({ id: 'retry-actions', version: '1.0.0', permissions: ['read', 'events'] }, (api) => {
    api.ai.registerAction({ id: 'test.ok', version: 1, permission: 'read', label: '成功', args: {}, preview: () => '成功', execute: async () => { calls.push('ok'); return { ok: true } } })
    api.ai.registerAction({ id: 'test.retry', version: 1, permission: 'read', label: '可重试', args: {}, preview: () => '可重试', execute: async () => { attempts++; calls.push(`retry-${attempts}`); if (attempts === 1) throw new Error('模拟失败'); return { ok: true } } })
    api.ai.registerAction({ id: 'test.never', version: 1, permission: 'read', label: '不应执行', args: {}, preview: () => '不应执行', execute: async () => { calls.push('never'); return { ok: true } } })
  })
  const exported = w.LSB.__core.plugins.get('ai-copilot').exports
  exported.planActions = async () => ({ plan: { version: 1, summary: '测试', steps: [{ action: 'test.ok', args: {} }, { action: 'test.retry', args: {} }, { action: 'test.never', args: {} }] }, previews: [{ ok: true, text: '成功' }, { ok: true, text: '可重试' }, { ok: true, text: '不应执行' }], context: {} })
  const wb = w.document.querySelector('[data-ai-workbench]')
  wb.querySelector('[data-ai-command-mode="action"]').click()
  wb.querySelector('[data-ai-action-command]').value = '测试失败'
  wb.querySelector('[data-ai-action-run]').click()
  assert.equal(await until(() => wb.querySelector('[data-ai-action-execute]')), true)
  wb.querySelector('[data-ai-action-execute]').click()
  assert.equal(await until(() => wb.querySelector('[data-ai-action-status]').textContent.includes('partial')), true)
  assert.deepEqual(calls, ['ok', 'retry-1'])
  wb.querySelector('[data-ai-action-retry-failed]').click()
  assert.equal(await until(() => attempts === 2), true)
  assert.deepEqual(calls, ['ok', 'retry-1', 'retry-2'])
  assert.equal(w.document.querySelector('[data-ai-action-step="2"]').dataset.state, 'completed')
  w.LSB.bus.emit('route:changed', { href: '/topic/2', page: { type: 'topic', id: 2 } }, { source: 'test' })
  assert.match(wb.querySelector('[data-ai-action-status]').textContent, /expired|过期/)
})
```

- [x] **Step 2: 运行失败测试。**

Run: `node --test test/ai-workbench.test.js --test-name-pattern "命令先显示计划|步骤失败"`  
Expected: FAIL，工作台尚无命令模式和执行按钮。

- [x] **Step 3: 实现命令模式 UI 和串行执行。**

将 `renderConsole()` 拆成查询/操作两个 pane，默认仍为查询，新增稳定选择器：

```html
<div class="ai-workbench-command-modes">
  <button data-ai-command-mode="query">查询</button>
  <button data-ai-command-mode="action">站内操作</button>
</div>
<section data-ai-command-pane="action" hidden>
  <div data-ai-action-catalog></div>
  <textarea data-ai-action-command></textarea>
  <button data-ai-action-run>生成操作计划</button>
  <div data-ai-action-plan></div>
  <div data-ai-action-status></div>
</section>
```

`renderActionMode()` 的流程：

1. 读取 `copilot.configured()`；未配置时复用现有设置提示。
2. 快捷项提供“打开深度思考版块”“搜索标题中的缓存”“打开插件设置”；点击只填入输入框。
3. 点击生成调用 `copilot.planActions({ command })`，显示命令理解、每步动作 ID/label/args/preview、上下文摘要和“执行计划 / 重新生成 / 取消”；此阶段不得调用 `api.ai.execute`，也不得改变 location。
4. 同时渲染本地动作目录下拉框；模型不可用时用户可选一个动作和合法参数生成单步本地计划，不发起 LLM 请求。
5. “执行计划”先用当前 `actionContext` 重新调用 `api.ai.validatePlan()`，保存 `routeFingerprint = location.pathname + location.search + page.type + page.id`，然后按 `for (const index of indexes)` 串行调用 `await api.ai.execute(step, context)`。每步状态依次为 `pending/running/completed/failed/skipped`。
6. 动作结果仅渲染 `kind/label/url/id` 等白名单字段；URL 只用 `<a href>` 且再次通过 `/^\/(?!\/)/` 检查，不把对象交给 `innerHTML`。
7. 返回 `kind:'navigation'` 时等待一次 `route:changed`（3 秒超时）；收到新路由后刷新 context 并对剩余步骤重新校验，路由指纹不匹配则 `expired`。
8. 异常时停止后续步骤；零步完成为 `failed`，已完成部分为 `partial`；只显示“仅重试失败步骤”，重试前重新校验且只传失败索引。

增加 `saveHistory(record)` / `loadHistory()`：使用 `api.store` 的 `action-history` 键，过滤掉函数、模型原文、密钥和正文，只保留最近 20 条；插件停用和 route 变化时用 `generation` 与 `state.disposed` 双重检查，旧 promise 不得写入 host。

manifest 版本提升为 `0.2.0`，权限改为 `['read', 'storage', 'ui', 'events']`，依赖 `ai-copilot: '^0.7.0'` 和 `ai-actions: '^0.1.0'`。保留现有操作台查询、当前帖子和追踪三段，命令模式只是操作台子模式。

- [x] **Step 4: 运行通过测试并回归右栏。**

Run: `node --test test/ai-workbench.test.js --test-name-pattern "命令先显示计划|步骤失败|窄屏"`  
Expected: PASS；窄屏仍无右栏 AI 标签，旧顶栏入口仍存在。  
Run: `node --test test/ai-workbench.test.js`  
Expected: 所有现有三段工作台测试和新增动作测试 PASS。

- [x] **Step 5: 提交工作台切片。**

```bash
git add plugins/ai-workbench.user.js test/ai-workbench.test.js
git commit -m "feat: add ai workbench action mode"
```

---

## Task 5: 安全、生命周期和兼容性验收

**Files:**
- Modify: `test/core.test.js`, `test/ai-actions.test.js`, `test/ai-copilot.test.js`, `test/ai-workbench.test.js`, `test/hardening.test.js`, `test/site.test.js`
- Modify: `plugins/ai-actions.user.js`, `plugins/ai-copilot.user.js`, `plugins/ai-workbench.user.js` only when a test exposes a defect

**Interfaces:**
- Consumes: Tasks 1–4 全部 API 和 DOM 夹具。
- Produces: 可重复的安全回归证据，确认不能通过动作代理绕过权限或站点适配层。

- [x] **Step 1: 增加失败/边界测试。**

必须覆盖以下具体案例：

```js
test('动作安全边界：拒绝 javascript/data/protocol-relative URL、selector、任意请求体', () => {
  const registry = new ActionRegistry()
  registry.register({ id: 'site.navigate', version: 1, permission: 'read', args: { target: { type: 'enum', values: ['home'] } }, execute: () => ({ kind: 'navigation', url: '/' }), preview: () => '回首页' }, 'test')
  for (const args of [{ target: 'home', url: 'javascript:alert(1)' }, { target: 'home', selector: '.post' }, { target: 'home', body: { method: 'POST' } }]) assert.equal(registry.validate({ action: 'site.navigate', args }, {}).ok, false)
})

test('动作权限边界：read-only 工作台不能调用写动作或站内 POST', () => {
  const core = boot()
  let api
  core.register({ id: 'readonly', version: '1.0.0', permissions: ['read'] }, (value) => { api = value })
  assert.throws(() => api.actions.reply(1, 'x'), /未声明 'write'/)
  assert.throws(() => api.net.raw('/reply_edit', { method: 'POST', body: 'x' }), /未声明 'write'/)
})

test('生命周期：停用动作提供方后计划执行返回未知动作，工作台标记 expired', async () => {
  const core = boot()
  core.register({ id: 'temporary', version: '1.0.0', permissions: ['read'] }, (api) => api.ai.registerAction({ id: 'test.temp', version: 1, permission: 'read', args: {}, preview: () => '临时', execute: () => ({ ok: true }) }))
  assert.equal(core.ai.actions({}).some((item) => item.id === 'test.temp'), true)
  core.disable('temporary')
  assert.equal(core.ai.actions({}).some((item) => item.id === 'test.temp'), false)
})

test('模型不可用：本地动作目录仍能创建单步计划', () => {
  const registry = new ActionRegistry()
  registry.register({ id: 'ui.local', version: 1, permission: 'ui', args: { id: { type: 'enum', values: ['__core_plugins'] } }, preview: (args) => `打开 ${args.id}`, execute: () => ({ kind: 'panel', id: '__core_plugins' }) }, 'local')
  const plan = registry.validatePlan({ version: 1, summary: '打开插件面板', steps: [{ action: 'ui.local', args: { id: '__core_plugins' } }] }, {})
  assert.equal(plan.ok, true)
})

test('兼容快照：现有帖子 DOM 仍由 parseTopic 和 SEL 识别', () => {
  const w = load('topic1.html', 'https://linux.sb/topic/1')
  const topic = parseTopic(w.document)
  assert.equal(topic.posts.length, 51)
  assert.equal(w.document.querySelectorAll(SEL.topicPosts).length, 51)
  assert.equal(w.document.querySelector('.reply-pin-duplicate'), null)
})
```

- [x] **Step 2: 运行失败测试。**

Run: `node --test test/hardening.test.js test/ai-actions.test.js test/ai-workbench.test.js --test-name-pattern "安全边界|权限边界|生命周期|模型不可用|兼容快照"`  
Expected: 新增断言在实现缺陷时明确失败，不接受仅检查字符串存在的假阳性。

- [x] **Step 3: 修复并收紧实现。**

检查点：动作目录不得泄漏 `execute`、动态 schema 函数或配置；计划历史不得包含 `apiKey`、`_csrf`、`Cookie`、私信或完整 DOM；`site.search` redirect 必须同源且为固定站内路径；执行器每步前后都检查 `generation`、插件状态和路由指纹；所有 UI 文本通过 `textContent` 或 `api.util.esc`。

- [x] **Step 4: 运行安全与站点回归。**

Run: `node --test test/core.test.js test/net.test.js test/hardening.test.js test/site.test.js test/ai-actions.test.js test/ai-copilot.test.js test/ai-workbench.test.js test/skin.test.js`  
Expected: 0 failures。

- [x] **Step 5: 提交安全验收切片。**

```bash
git add test/core.test.js test/net.test.js test/hardening.test.js test/site.test.js test/ai-actions.test.js test/ai-copilot.test.js test/ai-workbench.test.js test/skin.test.js plugins/ai-actions.user.js plugins/ai-copilot.user.js plugins/ai-workbench.user.js
git commit -m "test: harden readonly ai action flow"
```

---

## Task 6: 套件收录、文档、版本与产物

**Files:**
- Modify: `src/core.js` (`VERSION = '0.1.43'`)
- Modify: `suite/order.js`
- Modify: `build-suite.mjs`, `suite/suite-center.js`
- Modify: `README.md`
- Modify: `test/suite.test.js`, `test/lts.test.js`
- Generated: `dist/linuxsb-base.user.js`, `dist/linuxsb-suite.user.js`, `dist/linuxsb-lts.user.js`

**Interfaces:**
- Consumes: Tasks 1–5 的源码、manifest 版本和动作插件文件。
- Produces: Oxygen 含 `ai-summary → ai-copilot → ai-actions → ai-workbench`；LTS 不含三个 AI 模块；所有版本标记一致。

- [x] **Step 1: 写失败的收录和版本测试。**

在 `test/suite.test.js` 增加：

```js
test('AI 动作提供方位于副驾之后、工作台之前且不进入 LTS', () => {
  const copilot = MEMBERS.indexOf('ai-copilot')
  assert.equal(MEMBERS[copilot + 1], 'ai-actions')
  assert.equal(MEMBERS[copilot + 2], 'ai-workbench')
  assert.equal(ORDER_LTS.includes('ai-actions'), false)
  assert.equal(ORDER_LTS.includes('ai-workbench'), false)
  assert.match(readFileSync(new URL('../plugins/ai-actions.user.js', import.meta.url), 'utf8'), /id:\s*'ai-actions'/)
  assert.doesNotMatch(ltsCode, /id:\s*'ai-actions'/)
})

test('版本标记：基座、manifest、Oxygen 和套件中心同步', () => {
  assert.match(readFileSync(new URL('../src/core.js', import.meta.url), 'utf8'), /VERSION = '0\.1\.43'/)
  assert.match(readFileSync(new URL('../plugins/ai-copilot.user.js', import.meta.url), 'utf8'), /version:\s*'0\.7\.0'/)
  assert.match(readFileSync(new URL('../plugins/ai-workbench.user.js', import.meta.url), 'utf8'), /version:\s*'0\.2\.0'/)
})
```

- [x] **Step 2: 运行失败测试。**

Run: `node --test test/suite.test.js test/lts.test.js --test-name-pattern "AI 动作提供方|版本标记"`  
Expected: FAIL，ORDER、版本和产物尚未更新。

- [x] **Step 3: 更新收录、版本和 README。**

将 `suite/order.js` 中 AI 模块顺序改为：

```js
'ai-summary',
'ai-copilot',
'ai-actions',
'ai-workbench',
```

将 `build-suite.mjs` 与 `suite/suite-center.js` 的套件版本从 `1.0.119` 提升为 `1.0.120`；`src/core.js` 提升为 `0.1.43`；同步 README 的模块表、权限、版本和使用说明：右栏“AI → 操作台 → 站内操作”，生成计划后需点击“执行计划”，首版只读，窄屏仍使用旧入口。明确 `ai-workbench` 的权限为 `read/storage/ui/events`，`ai-actions` 为 `read/ui/events`。

- [x] **Step 4: 构建并验证产物。**

Run: `npm run build`  
Expected: 生成三个 dist 文件；Oxygen 包含 `ai-actions` 和 `ai-workbench`，LTS 不包含任何 AI 模块。  
Run: `npm run verify:dist`  
Expected: PASS，版本、模块顺序、头部和新鲜度一致。

- [x] **Step 5: 运行完整验收并提交。**

Run: `npm test`  
Expected: 全部测试通过。  
Run: `npm run verify:dist`  
Expected: PASS。  

```bash
git add src/core.js suite/order.js build-suite.mjs suite/suite-center.js README.md test/suite.test.js test/lts.test.js dist/linuxsb-base.user.js dist/linuxsb-suite.user.js dist/linuxsb-lts.user.js
git commit -m "feat: ship readonly ai action agent"
```

## Plan self-review

- **Spec coverage:** 注册表、动态动作目录、固定搜索 API、四个首批动作、严格计划协议、预览/执行/重试/过期、本地历史、权限和隐私、DOM 兼容、Oxygen/LTS 和三项构建验收均有对应任务。
- **Placeholder scan:** 计划没有 TBD、TODO、空测试体或“稍后实现”；失败测试、实现接口、状态断言、构建命令和提交边界均已写出。
- **Type consistency:** `api.ai` 方法、`planActions()` 返回结构、动作 ID、计划字段、状态名和 manifest 依赖在任务间保持一致；`ai-workbench` 依赖 `ai-copilot ^0.7.0` 与 `ai-actions ^0.1.0`，动作提供方依赖基座 `^0.1.43`。
- **Security consistency:** 搜索的底层 POST 只封装在 `api.net.search`，工作台没有 `write`；动作结果和历史均经过白名单/序列化检查；路由和插件生命周期都会使旧计划失效。
