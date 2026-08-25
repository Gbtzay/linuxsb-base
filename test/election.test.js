/**
 * 选主协议：单标签上位 / 双标签唯一 / 在任者不被挤掉 / 三标签唯一 /
 * 双主冲突收敛 / leader 消失后接管 / 心跳不再制造活锁。
 *
 * 直接测 src/election.js（纯逻辑，无需 DOM），用内存版 tabs 通道模拟跨标签广播。
 * 守的是「恰好一个 leader」这条不变式——破了就是两种后果：
 * 0 个 → 巡检模块全停摆；≥2 个 → 请求翻倍、通知重复。
 *
 * 注意语义边界：id 仲裁只用于「同时上位」的平局，不是全局排序。
 * 已在任者一律留任（避免无谓易主），所以除强制冲突用例外，
 * 断言只针对「有几个 leader」，不假定是哪一个。
 */
import { test } from 'node:test'
import assert from 'node:assert/strict'
import { Election } from '../src/election.js'

/** 内存版跨标签总线：post 广播给除自己以外的所有订阅者（与 Channel 语义一致） */
function makeWire() {
  const peers = []
  return {
    tabsFor(name) {
      const holder = { name, handlers: [] }
      peers.push(holder)
      return {
        post: (event, payload) => {
          for (const p of peers) {
            if (p === holder) continue
            for (const fn of p.handlers) fn(payload, { event })
          }
        },
        on: (event, fn) => {
          holder.handlers.push(fn)
          return () => {
            const i = holder.handlers.indexOf(fn)
            if (i >= 0) holder.handlers.splice(i, 1)
          }
        },
      }
    },
    /** 模拟标签关闭：从总线摘除，其心跳再也传不出去 */
    drop(name) {
      const i = peers.findIndex((p) => p.name === name)
      if (i >= 0) peers.splice(i, 1)
    },
  }
}

const sleep = (ms) => new Promise((r) => setTimeout(r, ms))
async function until(fn, ms = 2000, step = 10) {
  const end = Date.now() + ms
  for (;;) {
    if (fn()) return true
    if (Date.now() > end) return false
    await sleep(step)
  }
}

/** 快节奏参数：把 10s/30s 压到毫秒级，让用例秒级完成 */
const FAST = { jitter: 20, beatMs: 60, leaderTimeoutMs: 200 }

function spawn(wire, name, opts = {}) {
  const events = []
  const el = new Election(wire.tabsFor(name), {
    ...FAST,
    ...opts,
    id: name,
    onPromote: () => events.push('promote'),
    onDemote: () => events.push('demote'),
  })
  el.start()
  return { el, events, name }
}

const leaders = (nodes) => nodes.filter((n) => n.el.isLeader)
const settled = (nodes) => leaders(nodes).length === 1 && nodes.every((n) => n.el.role !== 'pending')

test('单标签：抖动后自动上位', async () => {
  const wire = makeWire()
  const a = spawn(wire, 'a')
  assert.ok(await until(() => a.el.isLeader), '无竞争时应上位')
  assert.deepEqual(a.events, ['promote'])
  a.el.stop()
})

test('双标签：恰好一个 leader，另一个是 follower（不停在 pending）', async () => {
  const wire = makeWire()
  const a = spawn(wire, 'aaa')
  const b = spawn(wire, 'bbb')
  assert.ok(await until(() => settled([a, b])), '应收敛为 1 主 1 从')

  const [lead] = leaders([a, b])
  const foll = [a, b].find((n) => n !== lead)
  assert.equal(foll.el.role, 'follower', 'pending 不是终态——面板要显示"由其它标签巡检"')
  assert.equal(foll.el.leaderId, lead.name, 'follower 知道谁是主')
  a.el.stop()
  b.el.stop()
})

test('在任者留任：后启动的标签不会把它挤掉（id 更大或更小都一样）', async () => {
  for (const newcomerId of ['zzz', 'aaa']) {
    const wire = makeWire()
    const inOffice = spawn(wire, 'mmm')
    assert.ok(await until(() => inOffice.el.isLeader), '先启动者上位')

    const newcomer = spawn(wire, newcomerId)
    await sleep(300) // 跨过数个心跳周期
    assert.equal(inOffice.el.isLeader, true, `新标签 ${newcomerId} 不应挤掉在任者`)
    assert.equal(newcomer.el.role, 'follower')
    assert.deepEqual(inOffice.events, ['promote'], '在任者不应经历无谓的降级/复位')
    inOffice.el.stop()
    newcomer.el.stop()
  }
})

test('回归：互发心跳不再让双方同时退位（旧实现在此活锁）', async () => {
  const wire = makeWire()
  const a = spawn(wire, 'aaa')
  const b = spawn(wire, 'bbb')
  assert.ok(await until(() => settled([a, b])))
  await sleep(500) // 跨过多个心跳周期
  assert.equal(leaders([a, b]).length, 1, `持续心跳后仍应恰好一个 leader`)
  await sleep(500)
  assert.equal(leaders([a, b]).length, 1, '再等若干周期依然稳定（无活锁、无反复易主）')
  // 稳定意味着不该有反复的角色翻转
  assert.ok(a.events.length <= 2 && b.events.length <= 2, `角色事件应很少：a=${a.events} b=${b.events}`)
  a.el.stop()
  b.el.stop()
})

test('三标签：始终唯一 leader', async () => {
  const wire = makeWire()
  const nodes = [spawn(wire, 'n1'), spawn(wire, 'n2'), spawn(wire, 'n3')]
  assert.ok(await until(() => settled(nodes), 2000))
  await sleep(400)
  assert.equal(leaders(nodes).length, 1)
  for (const n of nodes) n.el.stop()
})

test('双主冲突：强制两者同时上位，按 id 仲裁收敛（小者留任）', async () => {
  const wire = makeWire()
  const a = spawn(wire, 'aaa', { jitter: 0 })
  const b = spawn(wire, 'bbb', { jitter: 0 })

  // 绕过抖动直接双双 promote，制造最坏起点。
  // 上位即广播，冲突在同一个 tick 内就被仲裁掉，所以这里不需要等待。
  a.el.promote()
  b.el.promote()

  assert.equal(leaders([a, b]).length, 1, '冲突应即时收敛，而非双主共存')
  assert.equal(a.el.isLeader, true, 'id 较小者留任（确定性仲裁，双方独立算出同一结论）')
  assert.equal(b.el.role, 'follower')
  await sleep(300)
  assert.equal(leaders([a, b]).length, 1, '后续心跳不再翻转')
  a.el.stop()
  b.el.stop()
})

test('故障转移：leader 掉线后由其余标签接管', async () => {
  const wire = makeWire()
  const a = spawn(wire, 'aaa')
  const b = spawn(wire, 'bbb')
  assert.ok(await until(() => settled([a, b])))

  const [lead] = leaders([a, b])
  const survivor = [a, b].find((n) => n !== lead)

  // 模拟标签关闭：停选主 + 从总线摘除（心跳彻底消失）
  lead.el.stop()
  wire.drop(lead.name)

  assert.ok(
    await until(() => survivor.el.isLeader, 2000),
    'leaderTimeout 后必须有人接管，否则巡检永久停摆',
  )
  assert.equal(survivor.events.filter((e) => e === 'promote').length, 1)
  survivor.el.stop()
})

test('leader 在任期间 follower 不会误判超时而抢位', async () => {
  const wire = makeWire()
  const a = spawn(wire, 'aaa')
  const b = spawn(wire, 'bbb')
  assert.ok(await until(() => settled([a, b])))
  const [lead] = leaders([a, b])
  const foll = [a, b].find((n) => n !== lead)

  // 跨过数倍 leaderTimeout：只要 leader 还在发心跳，follower 就必须安分
  await sleep(FAST.leaderTimeoutMs * 5)
  assert.equal(leaders([a, b]).length, 1)
  assert.equal(foll.el.isLeader, false, 'follower 不得抢位')
  a.el.stop()
  b.el.stop()
})

test('leaderTimeout 不会被设成短于两个心跳周期（防误判抢位）', () => {
  const wire = makeWire()
  const el = new Election(wire.tabsFor('x'), { beatMs: 1000, leaderTimeoutMs: 100 })
  assert.equal(el.leaderTimeoutMs, 2000, '过短的超时应被抬到 2×beatMs')
})

test('stop() 后不再改变角色', async () => {
  const wire = makeWire()
  const a = spawn(wire, 'aaa')
  assert.ok(await until(() => a.el.isLeader))
  a.el.stop()
  const before = a.events.length
  await sleep(300)
  assert.equal(a.events.length, before, 'stop 后无新的角色事件')
})

test('id 缺省时自动生成且互不相同', () => {
  const wire = makeWire()
  const ids = new Set()
  for (let i = 0; i < 100; i++) ids.add(new Election(wire.tabsFor('t' + i), {}).id)
  assert.equal(ids.size, 100, 'id 必须唯一——仲裁靠它比较大小')
})

test('state() 暴露排障所需字段', async () => {
  const wire = makeWire()
  const a = spawn(wire, 'aaa')
  const b = spawn(wire, 'bbb')
  assert.ok(await until(() => settled([a, b])))
  const [lead] = leaders([a, b])
  const foll = [a, b].find((n) => n !== lead)
  const s = foll.el.state()
  assert.equal(s.id, foll.name)
  assert.equal(s.role, 'follower')
  assert.equal(s.leaderId, lead.name)
  assert.ok(typeof s.sinceLeaderBeat === 'number')
  a.el.stop()
  b.el.stop()
})
