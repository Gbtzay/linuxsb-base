import { test } from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { JSDOM } from 'jsdom'
import { ActionRegistry } from '../src/ai-actions.js'

const baseCode = readFileSync(new URL('../dist/linuxsb-base.user.js', import.meta.url), 'utf8')
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
  assert.equal(registry.validatePlan({ ...base, steps: [{ action: 'site.missing', args: {} }] }, {}).ok, false)
  assert.equal(
    registry.validatePlan({ ...base, steps: [{ action: 'site.navigate', args: { target: 'home', url: 'https://evil.example' } }] }, {}).ok,
    false,
  )
  assert.equal(registry.validatePlan({ ...base, steps: Array.from({ length: 6 }, () => base.steps[0]) }, {}).ok, false)
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
  assert.ok(navigate.args.target.values.includes('forum'))
  const bad = w.LSB.__core.ai.validate(
    { action: 'site.navigate', args: { target: 'feature', feature: 'javascript:alert(1)' } },
    { route: { type: 'home' } },
  )
  assert.equal(bad.ok, false)
  const result = await w.LSB.__core.ai.execute(
    { action: 'site.navigate', args: { target: 'forum', id: 7 } },
    { route: { type: 'home' } },
  )
  assert.equal(result.kind, 'navigation')
  assert.equal(result.url, '/forum/7')
  assert.equal(result.label, '已打开版块')
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
