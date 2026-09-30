import { test } from 'node:test'
import assert from 'node:assert/strict'
import { ActionRegistry } from '../src/ai-actions.js'

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
