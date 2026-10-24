import { test } from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { JSDOM } from 'jsdom'
import { ActionRegistry } from '../src/ai-actions.js'

const baseCode = readFileSync(new URL('../dist-dev/linuxsb-base.user.js', import.meta.url), 'utf8')
const pluginCode = () => readFileSync(new URL('../plugins/ai-actions.user.js', import.meta.url), 'utf8')
const homeHtml = readFileSync(new URL('./fixtures/home.html', import.meta.url), 'utf8')

async function loadHome() {
  const dom = new JSDOM(homeHtml, { url: 'https://linux.sb/', runScripts: 'outside-only' })
  const w = dom.window
  w.unsafeWindow = w
  w.requestAnimationFrame = (fn) => setTimeout(() => fn(Date.now()), 0)
  w.localStorage.setItem('lsb_base:__core:rate', JSON.stringify(0))
  w.localStorage.setItem('lsb_base:__core:urlPoll', JSON.stringify(0))
  w.eval(baseCode)
  w.eval(pluginCode())
  await new Promise((resolve) => setTimeout(resolve, 30))
  return w
}

test('动作注册表：按 order 排序、页面过滤并拒绝重复 id', () => {
  const registry = new ActionRegistry()
  registry.register({ id: 'z.last', version: 1, order: 20, label: 'Z', permission: 'read', execute: () => ({ ok: true }), preview: () => 'Z' }, 'p')
  registry.register({ id: 'a.first', version: 1, order: 10, label: 'A', permission: 'read', pages: ['home'], execute: () => ({ ok: true }), preview: () => 'A' }, 'p')
  assert.deepEqual(registry.actions({ route: { type: 'home' } }).map((x) => x.id), ['a.first', 'z.last'])
  assert.deepEqual(registry.actions({ route: { type: 'topic' } }).map((x) => x.id), ['z.last'])
  assert.throws(
    () => registry.register({ id: 'z.last', version: 1, permission: 'read', execute: () => ({}), preview: () => '' }, 'q'),
    /action\.duplicate/,
  )
})

test('计划校验：未知字段、未知动作、外部 URL 和超过五步都拒绝', () => {
  const registry = new ActionRegistry()
  registry.register({
    id: 'site.navigate',
    version: 1,
    permission: 'read',
    args: { target: { type: 'enum', values: ['home'] } },
    execute: () => ({ kind: 'navigation', url: '/' }),
    preview: () => '回首页',
  }, 'p')
  const base = { version: 1, summary: '回首页', steps: [{ action: 'site.navigate', args: { target: 'home' } }] }
  assert.equal(registry.validatePlan(base, { route: { type: 'topic' } }).ok, true)
  assert.equal(registry.validatePlan({ ...base, extra: 1 }, {}).ok, false)
  assert.equal(
    registry.validatePlan({ ...base, steps: [{ ...base.steps[0], actionVersion: 1, actionProvider: 'p' }] }, {}).ok,
    false,
  )
  assert.equal(registry.validatePlan({ ...base, steps: [{ action: 'site.missing', args: {} }] }, {}).ok, false)
  assert.equal(
    registry.validatePlan({ ...base, steps: [{ action: 'site.navigate', args: { target: 'home', url: 'https://evil.example' } }] }, {}).ok,
    false,
  )
  assert.equal(registry.validatePlan({ ...base, steps: Array.from({ length: 6 }, () => base.steps[0]) }, {}).ok, false)
})

test('写动作计划隔离：写动作必须独占计划步骤', () => {
  const registry = new ActionRegistry()
  registry.register({
    id: 'site.reply', version: 1, permission: 'write',
    args: { body: { type: 'string', minLength: 1 } },
    execute: () => ({ ok: true }), preview: () => '回复当前帖子',
  }, 'ai-write-actions')
  registry.register({
    id: 'site.navigate', version: 1, permission: 'read',
    args: {}, execute: () => ({ ok: true }), preview: () => '打开首页',
  }, 'ai-actions')

  const write = { action: 'site.reply', args: { body: '回复内容' } }
  const read = { action: 'site.navigate', args: {} }
  const plan = (steps) => ({ version: 1, summary: '测试', steps })
  assert.equal(registry.validatePlan(plan([write]), {}).ok, true)
  assert.ok(registry.validatePlan(plan([write, read]), {}).errors.some((error) => error.code === 'plan.write-isolation'))
  assert.ok(registry.validatePlan(plan([write, write]), {}).errors.some((error) => error.code === 'plan.write-isolation'))
})

test('计划绑定动作版本与提供方；旧绑定和缺少绑定的待执行计划会失效', () => {
  const registry = new ActionRegistry()
  const action = (version) => ({
    id: 'site.navigate', version, permission: 'read', args: { target: { type: 'enum', values: ['home'] } },
    execute: () => ({ kind: 'navigation', url: '/' }), preview: () => '回首页',
  })
  registry.register(action(1), 'actions-v1')
  const raw = { version: 1, summary: '回首页', steps: [{ action: 'site.navigate', args: { target: 'home' } }] }
  const planned = registry.validatePlan(raw, {})
  assert.equal(planned.ok, true)
  assert.equal(planned.plan.steps[0].actionVersion, 1)
  assert.equal(planned.plan.steps[0].actionProvider, 'actions-v1')
  assert.equal(registry.validatePlan(raw, {}, { requireActionBinding: true }).ok, false)
  registry.dispose('actions-v1')
  registry.register(action(2), 'actions-v1')
  assert.equal(registry.validatePlan(planned.plan, {}, { requireActionBinding: true }).ok, false)
  const versionTwoPlan = registry.validatePlan(raw, {}).plan
  registry.dispose('actions-v1')
  registry.register(action(2), 'actions-v2')
  assert.equal(registry.validatePlan(versionTwoPlan, {}, { requireActionBinding: true }).ok, false)
})

test('导航动作只能位于计划末尾', () => {
  const registry = new ActionRegistry()
  registry.register({
    id: 'site.navigate', version: 1, permission: 'read', terminal: true,
    args: { target: { type: 'enum', values: ['home'] } }, execute: () => ({ kind: 'navigation', url: '/' }), preview: () => '回首页',
  }, 'actions')
  registry.register({
    id: 'ui.openPanel', version: 1, permission: 'ui', args: { id: { type: 'enum', values: ['core'] } },
    execute: () => ({ kind: 'panel', id: 'core' }), preview: () => '打开面板',
  }, 'actions')
  const plan = {
    version: 1,
    summary: '回首页后打开设置',
    steps: [
      { action: 'site.navigate', args: { target: 'home' } },
      { action: 'ui.openPanel', args: { id: 'core' } },
    ],
  }
  assert.equal(registry.validatePlan(plan, {}).ok, false)
  assert.equal(registry.validatePlan({ ...plan, steps: plan.steps.slice(0, 1) }, {}).ok, true)
})

test('动作结果必须可序列化，动态 enum 目录只暴露值数组', async () => {
  const registry = new ActionRegistry()
  registry.register({
    id: 'ui.open',
    version: 1,
    permission: 'ui',
    args: { id: { type: 'enum', values: (ctx) => ctx.panels } },
    preview: (args) => `打开 ${args.id}`,
    execute: () => ({ ok: true }),
  }, 'p')
  const descriptor = registry.actions({ panels: ['one', 'two'] })[0]
  assert.deepEqual(descriptor.args.id.values, ['one', 'two'])
  assert.equal(typeof descriptor.args.id.values, 'object')
  assert.deepEqual(await registry.execute({ action: 'ui.open', args: { id: 'one' } }, { panels: ['one'] }), { ok: true })
  registry.register({ id: 'bad.result', version: 1, permission: 'read', args: {}, preview: () => '坏结果', execute: () => ({ fn() {} }) }, 'p')
  await assert.rejects(() => registry.execute({ action: 'bad.result', args: {} }, {}), /result\.not-serializable/)
})

test('首批动作：目录只暴露固定目标，执行不接受任意 URL', async () => {
  const w = await loadHome()
  const actions = w.LSB.__core.ai.actions({ route: { type: 'home' } })
  assert.deepEqual([...actions.map((item) => item.id)], ['site.navigate', 'site.search', 'ui.openPanel'])
  const navigate = actions.find((item) => item.id === 'site.navigate')
  assert.equal(navigate.terminal, true)
  assert.equal(actions.find((item) => item.id === 'site.search').terminal, true)
  assert.equal(actions.find((item) => item.id === 'ui.openPanel').terminal, false)
  assert.ok(navigate.args.target.values.includes('forum'))
  const bad = w.LSB.__core.ai.validate(
    { action: 'site.navigate', args: { target: 'feature', feature: 'javascript:alert(1)' } },
    { route: { type: 'home' } },
  )
  assert.equal(bad.ok, false)
  for (const args of [
    { target: 'home', url: 'https://evil.example' },
    { target: 'home', url: 'javascript:alert(1)' },
    { target: 'home', url: '//evil.example/path' },
    { target: 'home', selector: '.post' },
    { target: 'home', request: { method: 'POST', body: 'x' } },
  ]) {
    assert.equal(w.LSB.__core.ai.validate({ action: 'site.navigate', args }, { route: { type: 'home' } }).ok, false)
  }
  const result = await w.LSB.__core.ai.execute(
    { action: 'site.navigate', args: { target: 'forum', id: 7 } },
    { route: { type: 'home' } },
  )
  assert.equal(result.kind, 'navigation')
  assert.equal(result.url, '/forum/7')
  assert.equal(result.label, '已打开版块')
})

test('AI 导航：明确请求我的帖子时用当前用户 ID 打开主题列表', async () => {
  const w = await loadHome()
  const context = { route: { type: 'home' }, currentUserId: 5372 }
  const step = { action: 'site.navigate', args: { target: 'user', tab: 'topics' } }
  const checked = w.LSB.__core.ai.validate(step, context)
  assert.equal(checked.ok, true)
  assert.equal(checked.args.target, 'user')
  assert.equal(checked.args.tab, 'topics')
  assert.equal(w.LSB.__core.ai.preview(step, context).text, '打开我的帖子')
  const result = await w.LSB.__core.ai.execute(step, context)
  assert.equal(result.url, '/user/5372?tab=topics')

  const missingIdentity = w.LSB.__core.ai.validate(step, { route: { type: 'home' } })
  assert.equal(missingIdentity.ok, false, '没有当前登录身份时不能猜测用户目标')
  assert.equal(missingIdentity.error.code, 'args.id-required')
})

test('站内搜索动作：只调用语义 API，并返回站内导航结果', async () => {
  const w = await loadHome()
  let called = null
  w.LSB.__core.net.search = async (query, field) => {
    called = [query, field]
    return { url: '/index.php?q=x&field=title' }
  }
  const result = await w.LSB.__core.ai.execute(
    { action: 'site.search', args: { query: '缓存', field: 'title' } },
    { route: { type: 'home' } },
  )
  assert.deepEqual(called, ['缓存', 'title'])
  assert.equal(result.kind, 'navigation')
  assert.equal(result.url, '/index.php?q=x&field=title')
  assert.equal(result.label, '已打开搜索结果')
})
