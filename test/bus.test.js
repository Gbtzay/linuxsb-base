import { test } from 'node:test'
import assert from 'node:assert/strict'
import { Bus } from '../src/bus.js'
import { satisfies, compareVersion, clone } from '../src/util.js'

test('基本订阅与广播', () => {
  const bus = new Bus({ onError: () => {} })
  const got = []
  bus.on('a:b', (p) => got.push(['exact', p]))
  bus.on('a:*', (p) => got.push(['ns', p]))
  bus.on('*', (p) => got.push(['all', p]))
  bus.on('other', () => got.push(['nope']))
  const n = bus.emit('a:b', 1)
  assert.equal(n, 3)
  assert.deepEqual(got.map((g) => g[0]).sort(), ['all', 'exact', 'ns'])
})

test('payload 深拷贝，插件之间改不到对方的对象', () => {
  const bus = new Bus({ onError: () => {} })
  const src = { list: [1, 2] }
  let received
  bus.on('x', (p) => {
    received = p
    p.list.push(3)
  })
  bus.emit('x', src)
  assert.deepEqual(src.list, [1, 2], '源对象未被监听者污染')
  assert.deepEqual(received.list, [1, 2, 3])
})

test('raw 模式传引用（DOM 场景）', () => {
  const bus = new Bus({ onError: () => {} })
  const node = { tagName: 'LI' }
  let same = false
  bus.on('dom', (p) => {
    same = p === node
  })
  bus.emit('dom', node, { raw: true })
  assert.equal(same, true)
})

test('监听器异常被隔离，后续监听器仍执行', () => {
  const errs = []
  const bus = new Bus({ onError: (e, info) => errs.push(info.owner) })
  let reached = false
  bus.on('boom', () => {
    throw new Error('bad plugin')
  }, { owner: 'bad' })
  bus.on('boom', () => {
    reached = true
  }, { owner: 'good' })
  bus.emit('boom', null)
  assert.equal(reached, true)
  assert.deepEqual(errs, ['bad'])
})

test('sticky 事件补发给后注册者', () => {
  const bus = new Bus({ onError: () => {} })
  bus.emit('site:ready', { page: 'topic' }, { sticky: true })
  let seen = null
  bus.on('site:ready', (p) => {
    seen = p
  })
  assert.deepEqual(seen, { page: 'topic' })
})

test('once 只触发一次', () => {
  const bus = new Bus({ onError: () => {} })
  let n = 0
  bus.once('e', () => n++)
  bus.emit('e')
  bus.emit('e')
  assert.equal(n, 1)
})

test('off 与 offOwner 清理', () => {
  const bus = new Bus({ onError: () => {} })
  const fn = () => {}
  bus.on('e', fn, { owner: 'p1' })
  bus.on('e2', () => {}, { owner: 'p1' })
  bus.handle('cap', () => 1, { owner: 'p1' })
  assert.equal(bus.off('e', fn), true)
  bus.offOwner('p1')
  assert.deepEqual(bus.listEvents(), [])
  assert.equal(bus.hasHandler('cap'), false)
})

test('RPC：request / handle / 同名冲突 / 超时', async () => {
  const bus = new Bus({ onError: () => {} })
  bus.handle('score', async ({ uid }) => ({ uid, score: uid * 2 }), { owner: 'p1' })
  assert.deepEqual(await bus.request('score', { uid: 21 }), { uid: 21, score: 42 })
  await assert.rejects(() => bus.request('missing'), /no handler/)
  assert.throws(() => bus.handle('score', () => {}, { owner: 'p2' }), /已被 p1 占用/)

  bus.handle('slow', () => new Promise((r) => setTimeout(r, 50)), { owner: 'p1' })
  await assert.rejects(() => bus.request('slow', null, { timeout: 10 }), /超时/)
})

test('semver 范围判断', () => {
  assert.equal(satisfies('0.1.0', '^0.1.0'), true)
  assert.equal(satisfies('0.2.0', '^0.1.0'), false, '0.x 下次版本号视为破坏性')
  assert.equal(satisfies('1.5.2', '^1.2.0'), true)
  assert.equal(satisfies('2.0.0', '^1.2.0'), false)
  assert.equal(satisfies('1.2.9', '~1.2.0'), true)
  assert.equal(satisfies('1.3.0', '~1.2.0'), false)
  assert.equal(satisfies('1.0.0', '>=1.0.0 <2.0.0'), true)
  assert.equal(satisfies('2.0.0', '>=1.0.0 <2.0.0'), false)
  assert.equal(satisfies('3.1.4', '*'), true)
  assert.equal(satisfies('bad', '^1.0.0'), false)
  assert.equal(compareVersion('1.2.3', '1.10.0'), -1)
})

test('clone 处理循环引用不崩', () => {
  const a = { n: 1 }
  a.self = a
  const c = clone(a)
  assert.equal(c.n, 1)
})
