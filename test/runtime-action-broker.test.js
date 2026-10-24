import { test } from 'node:test'
import assert from 'node:assert/strict'
import { createCapabilityContext } from '../src/runtime/capabilities.js'
import { ActionBroker } from '../src/runtime/action-broker.js'

function owner(id = 'writer', permissions = ['read', 'write']) {
  return createCapabilityContext({ id, permissions })
}

function makeBroker(overrides = {}) {
  const events = []
  const actions = new Map([
    [
      'topic.reply',
      {
        schema: (args) => typeof args?.body === 'string' && args.body.trim().length > 0,
        targetScope: (scope) => scope?.topicId === 1,
        execute: async () => ({ status: 200, ok: true, json: { ok: 1 } }),
        check: async () => ({ kind: 'confirmed' }),
      },
    ],
  ])
  const broker = new ActionBroker({
    actions,
    snapshot: () => ({ routeFingerprint: 'topic:1' }),
    scopeTtlMs: 50,
    trace: (event) => events.push(event),
    ...overrides,
  })
  return { broker, events, actions }
}

test('未知 action、非法参数、路由漂移和越权 target 在 prepare 阶段拒绝', () => {
  const { broker } = makeBroker()
  assert.throws(
    () => broker.prepare({ owner: owner(), actionId: 'missing', summary: 'x', targetScope: { topicId: 1 }, args: { body: 'x' } }),
    (error) => error.code === 'action.unknown',
  )
  assert.throws(
    () => broker.prepare({ owner: owner(), actionId: 'topic.reply', summary: 'x', targetScope: { topicId: 1 }, args: { body: '' } }),
    (error) => error.code === 'action.schema-invalid',
  )
  assert.throws(
    () => broker.prepare({ owner: owner(), actionId: 'topic.reply', summary: 'x', routeFingerprint: 'topic:2', targetScope: { topicId: 1 }, args: { body: 'x' } }),
    (error) => error.code === 'action.route-mismatch',
  )
  assert.throws(
    () => broker.prepare({ owner: owner(), actionId: 'topic.reply', summary: 'x', targetScope: { topicId: 2 }, args: { body: 'x' } }),
    (error) => error.code === 'action.target-denied',
  )
  assert.throws(
    () => broker.prepare({ owner: owner(), actionId: 'topic.reply', summary: 'x', targetScope: { topicId: 1 }, args: { body: 'x', fn: () => {} } }),
    (error) => error.code === 'action.args-invalid',
  )
})

test('confirm 需要单次 nonce、用户确认和未过期 scope', async () => {
  const { broker } = makeBroker()
  const pending = broker.prepare({ owner: owner(), actionId: 'topic.reply', summary: '回复', targetScope: { topicId: 1 }, args: { body: 'x' } })
  await assert.rejects(() => broker.confirm(pending, { nonce: 'wrong', userConfirmed: true }), (error) => error.code === 'action.nonce-invalid')
  await assert.rejects(() => broker.confirm(pending, { nonce: pending.nonce, userConfirmed: false }), (error) => error.code === 'action.confirmation-required')
  const confirmed = await broker.confirm(pending, { nonce: pending.nonce, userConfirmed: true })
  assert.ok(confirmed.idempotencyKey)
  await assert.rejects(() => broker.confirm(pending, { nonce: pending.nonce, userConfirmed: true }), (error) => error.code === 'action.nonce-used')

  const expired = broker.prepare({ owner: owner(), actionId: 'topic.reply', summary: '回复', targetScope: { topicId: 1 }, args: { body: 'x' } })
  await new Promise((resolve) => setTimeout(resolve, 60))
  await assert.rejects(() => broker.confirm(expired, { nonce: expired.nonce, userConfirmed: true }), (error) => error.code === 'action.scope-expired')
})

test('过期 scope 在下一次 prepare 前从记录表回收', () => {
  let now = 0
  const { broker } = makeBroker({ clock: () => now, scopeTtlMs: 50 })
  const expired = broker.prepare({ owner: owner(), actionId: 'topic.reply', summary: '旧回复', targetScope: { topicId: 1 }, args: { body: '旧内容' } })

  now = 51
  const active = broker.prepare({ owner: owner(), actionId: 'topic.reply', summary: '新回复', targetScope: { topicId: 1 }, args: { body: '新内容' } })

  assert.equal(broker._pending.has(expired.nonce), false)
  assert.equal(broker._idempotency.has(expired.idempotencyKey), false)
  assert.equal(broker._pending.has(active.nonce), true)
  assert.equal(broker._pending.size, 1)
})

test('动作记录数量有上限，淘汰最旧的未执行 scope', async () => {
  const { broker } = makeBroker({ maxRecords: 2 })
  const records = Array.from({ length: 3 }, (_, index) => broker.prepare({
    owner: owner(),
    actionId: 'topic.reply',
    summary: `回复 ${index}`,
    targetScope: { topicId: 1 },
    args: { body: `内容 ${index}` },
  }))

  assert.equal(broker._pending.size, 2)
  assert.equal(broker._idempotency.size, 2)
  await assert.rejects(
    () => broker.confirm(records[0], { nonce: records[0].nonce, userConfirmed: true }),
    (error) => error.code === 'action.pending-invalid',
  )
})

test('写入只执行一次，未知结果只能走只读 check 并收敛回执', async () => {
  let writes = 0
  let checks = 0
  const { broker, events } = makeBroker({
    actions: new Map([
      [
        'topic.reply',
        {
          schema: () => true,
          targetScope: () => true,
          execute: async () => {
            writes++
            throw Object.assign(new Error('network lost'), { code: 'network.error' })
          },
          check: async () => {
            checks++
            return { kind: 'confirmed' }
          },
        },
      ],
    ]),
  })
  const pending = broker.prepare({ owner: owner(), actionId: 'topic.reply', summary: '回复', targetScope: { topicId: 1 }, args: { body: 'x' } })
  const confirmed = await broker.confirm(pending, { nonce: pending.nonce, userConfirmed: true })
  const first = await broker.execute(confirmed)
  assert.equal(first.kind, 'unknown')
  assert.equal(writes, 1)
  assert.equal(broker._pending.size, 0)
  assert.equal(broker._idempotency.has(first.receipt.idempotencyKey), true)
  assert.equal(broker._idempotency.get(first.receipt.idempotencyKey).args, null)
  await assert.rejects(() => broker.execute(confirmed), (error) => error.code === 'action.duplicate')
  const checked = await broker.check(first.receipt)
  assert.deepEqual(checked, { kind: 'confirmed' })
  assert.equal(checks, 1)
  assert.equal(broker._idempotency.has(first.receipt.idempotencyKey), false)
  assert.equal(events.some((event) => event.kind === 'execute' && event.idempotencyKey), true)
})

test('结果返回后清除动作参数，并保留短期只读检查能力', async () => {
  const { broker } = makeBroker()
  const pending = broker.prepare({ owner: owner(), actionId: 'topic.reply', summary: '回复', targetScope: { topicId: 1 }, args: { body: '内容' } })
  const confirmed = await broker.confirm(pending, { nonce: pending.nonce, userConfirmed: true })
  const result = await broker.execute(confirmed)

  assert.equal(result.kind, 'success')
  assert.equal(broker._pending.size, 0)
  assert.equal(broker._idempotency.size, 1)
  assert.equal(broker._idempotency.get(result.receipt.idempotencyKey).args, null)
  await broker.check(result.receipt)
  assert.equal(broker._idempotency.size, 0)
  await assert.rejects(() => broker.execute(confirmed), (error) => error.code === 'action.duplicate')
})

test('执行前的路由校验失败不应消耗动作，恢复路由后可重试', async () => {
  let route = 'topic:1'
  const { broker } = makeBroker({ snapshot: () => ({ routeFingerprint: route }) })
  const pending = broker.prepare({
    owner: owner(),
    actionId: 'topic.reply',
    summary: '回复',
    targetScope: { topicId: 1 },
    args: { body: 'x' },
  })
  const confirmed = await broker.confirm(pending, { nonce: pending.nonce, userConfirmed: true })
  route = 'topic:2'
  await assert.rejects(() => broker.execute(confirmed), (error) => error.code === 'action.route-mismatch')
  route = 'topic:1'
  const result = await broker.execute(confirmed)
  assert.equal(result.kind, 'success')
})

test('action owner 没有 write/read 能力时 fail closed', async () => {
  const { broker } = makeBroker()
  const pending = broker.prepare({ owner: owner('reader', ['read']), actionId: 'topic.reply', summary: '回复', targetScope: { topicId: 1 }, args: { body: 'x' } })
  await assert.rejects(() => broker.confirm(pending, { nonce: pending.nonce, userConfirmed: true }), (error) => error.code === 'capability.denied' && error.capability === 'write')

  const pending2 = broker.prepare({ owner: owner(), actionId: 'topic.reply', summary: '回复', targetScope: { topicId: 1 }, args: { body: 'x' } })
  const confirmed = await broker.confirm(pending2, { nonce: pending2.nonce, userConfirmed: true })
  const result = await broker.execute(confirmed)
  assert.equal(result.kind, 'success')
  const readless = createCapabilityContext({ id: 'write-only', permissions: ['write'] })
  const pending3 = broker.prepare({ owner: readless, actionId: 'topic.reply', summary: '回复', targetScope: { topicId: 1 }, args: { body: 'x' } })
  const confirmed3 = await broker.confirm(pending3, { nonce: pending3.nonce, userConfirmed: true })
  const result3 = await broker.execute(confirmed3)
  await assert.rejects(() => broker.check(result3.receipt), (error) => error.code === 'capability.denied' && error.capability === 'read')
})
