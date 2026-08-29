/** 性能探针：开关门闩、环形缓冲、时间轴入库规则 */
import { test } from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { JSDOM } from 'jsdom'

const baseCode = readFileSync(new URL('../dist/linuxsb-base.user.js', import.meta.url), 'utf8')
const PLUG = (n) => readFileSync(new URL(`../plugins/${n}`, import.meta.url), 'utf8')
const homeHtml = readFileSync(new URL('./fixtures/home.html', import.meta.url), 'utf8')

function makeSite(preload = {}) {
  const dom = new JSDOM(homeHtml, { url: 'https://linux.sb/', runScripts: 'outside-only' })
  const w = dom.window
  w.unsafeWindow = w
  w.requestAnimationFrame = (fn) => setTimeout(() => fn(Date.now()), 0)
  w.localStorage.setItem('lsb_base:__core:rate', JSON.stringify(10))
  for (const [k, v] of Object.entries(preload)) w.localStorage.setItem(k, JSON.stringify(v))
  const tick = (ms) => new Promise((r) => setTimeout(r, ms))
  return { w, tick }
}

async function loadBase(w, ...plugins) {
  w.eval(baseCode)
  for (const code of plugins) w.eval(code)
  await new Promise((r) => setTimeout(r, 30))
}

function span(partial) {
  return {
    name: 'spa.fetch',
    plugin: 'skin',
    ms: 10,
    href: '/',
    t: Date.now(),
    ...partial,
  }
}

test('性能探针：默认关着，没有门闩，emit 也不入库', async () => {
  const { w } = makeSite()
  await loadBase(w, PLUG('perf-probe.user.js'))
  const dbg = await w.LSB.bus.request('perf-probe:debug')
  assert.equal(dbg.recording(), false)
  assert.equal(w.LSB.bus.hasHandler('perf-probe:record'), false)
  w.LSB.bus.emit('perf:span', span(), { source: 'test' })
  assert.equal(dbg.dump().length, 0)
})

test('性能探针：打开后入库，dump/clear/slowest 可用', async () => {
  const { w } = makeSite({ 'lsb_base:perf-probe:__config': { enabled: true } })
  await loadBase(w, PLUG('perf-probe.user.js'))
  const dbg = await w.LSB.bus.request('perf-probe:debug')
  assert.equal(dbg.recording(), true)
  assert.equal(w.LSB.bus.hasHandler('perf-probe:record'), true)
  w.LSB.bus.emit('perf:span', span({ name: 'spa.parse', ms: 4 }), { source: 'test' })
  w.LSB.bus.emit('perf:span', span({ name: 'spa.fetch', ms: 40 }), { source: 'test' })
  const all = dbg.dump()
  assert.equal(all.length, 2)
  assert.equal(dbg.slowest().name, 'spa.fetch')
  assert.equal(dbg.slowest().ms, 40)
  dbg.clear()
  assert.equal(dbg.dump().length, 0)
  assert.equal(dbg.slowest(), null)
})

test('性能探针：超过 200 条挤掉最旧的', async () => {
  const { w } = makeSite({ 'lsb_base:perf-probe:__config': { enabled: true } })
  await loadBase(w, PLUG('perf-probe.user.js'))
  const dbg = await w.LSB.bus.request('perf-probe:debug')
  for (let i = 0; i < 201; i++) {
    w.LSB.bus.emit('perf:span', span({ name: 'spa.total', ms: i, t: i }), { source: 'test' })
  }
  const all = dbg.dump()
  assert.equal(all.length, 200)
  assert.equal(all[0].ms, 1, '最旧的 0 被挤掉，留下 1…200')
  assert.equal(all[199].ms, 200)
})

test('性能探针：关上开关后门闩消失，再 emit 不入库', async () => {
  const { w } = makeSite({ 'lsb_base:perf-probe:__config': { enabled: true } })
  await loadBase(w, PLUG('perf-probe.user.js'))
  const dbg = await w.LSB.bus.request('perf-probe:debug')
  w.LSB.bus.emit('perf:span', span({ ms: 9 }), { source: 'test' })
  assert.equal(dbg.dump().length, 1)
  w.eval(`localStorage.setItem('lsb_base:perf-probe:__config', JSON.stringify({ enabled: false }))`)
  w.LSB.bus.emit('config:changed:perf-probe', { enabled: false }, { source: 'core' })
  assert.equal(dbg.recording(), false)
  assert.equal(w.LSB.bus.hasHandler('perf-probe:record'), false)
  w.LSB.bus.emit('perf:span', span({ ms: 99, name: 'spa.commit' }), { source: 'test' })
  assert.equal(dbg.dump().length, 1, '关记录后缓冲冻结，不清空也不再涨')
})

test('性能探针：timeline.update 低于 8ms 丢弃，同一秒最多 2 条', async () => {
  const { w } = makeSite({ 'lsb_base:perf-probe:__config': { enabled: true } })
  await loadBase(w, PLUG('perf-probe.user.js'))
  const dbg = await w.LSB.bus.request('perf-probe:debug')
  const t = 1_700_000_000_000
  w.LSB.bus.emit('perf:span', span({ name: 'timeline.update', ms: 7, t }), { source: 'test' })
  w.LSB.bus.emit('perf:span', span({ name: 'timeline.update', ms: 8, t }), { source: 'test' })
  w.LSB.bus.emit('perf:span', span({ name: 'timeline.update', ms: 9, t }), { source: 'test' })
  w.LSB.bus.emit('perf:span', span({ name: 'timeline.update', ms: 10, t }), { source: 'test' })
  const tl = dbg.dump().filter((x) => x.name === 'timeline.update')
  assert.equal(tl.length, 2)
  assert.equal(tl[0].ms, 8)
  assert.equal(tl[1].ms, 9)
  w.LSB.bus.emit('perf:span', span({ name: 'timeline.update', ms: 12, t: t + 1000 }), { source: 'test' })
  assert.equal(dbg.dump().filter((x) => x.name === 'timeline.update').length, 3)
})
