/** 存储层：进程内缓存，避免每次 get 都打 GM / JSON.parse */
import { test, beforeEach } from 'node:test'
import assert from 'node:assert/strict'
import { JSDOM } from 'jsdom'
import { makeStore } from '../src/store.js'

beforeEach(() => {
  const w = new JSDOM('', { url: 'https://linux.sb/' }).window
  globalThis.localStorage = w.localStorage
  w.localStorage.clear()
})

test('store：同键连续 get 复用缓存对象，不反复 JSON.parse', () => {
  const s = makeStore('cache-probe')
  s.set('blob', { n: 1, nested: { x: 2 } })
  const a = s.get('blob')
  const b = s.get('blob')
  assert.equal(a, b)
  assert.equal(a.nested, b.nested)
})

test('store：外部改写 localStorage 后 get 看到新值', () => {
  const s = makeStore('cache-probe')
  s.set('blob', { n: 1 })
  localStorage.setItem('lsb_base:cache-probe:blob', JSON.stringify({ n: 2 }))
  assert.equal(s.get('blob').n, 2)
})

let gmCase = 0

async function gmStore(t, { listener = 'available' } = {}) {
  const names = ['GM_getValue', 'GM_setValue', 'GM_deleteValue', 'GM_addValueChangeListener', 'GM_removeValueChangeListener']
  const saved = names.map((name) => [name, Object.getOwnPropertyDescriptor(globalThis, name)])
  t.after(() => {
    for (const [name, descriptor] of saved) {
      if (descriptor) Object.defineProperty(globalThis, name, descriptor)
      else delete globalThis[name]
    }
  })
  const values = new Map([['lsb_base:gm-probe:blob', { n: 1 }]])
  const listeners = new Map()
  let reads = 0
  let nextId = 0
  let failWrites = false
  const write = (key, value, remote) => {
    const old = values.get(key)
    if (value === undefined) values.delete(key)
    else values.set(key, structuredClone(value))
    for (const { key: watched, fn } of [...listeners.values()]) {
      if (key === watched) fn(key, old, value, remote)
    }
  }
  globalThis.GM_getValue = (key, fallback) => {
    reads++
    return values.has(key) ? structuredClone(values.get(key)) : fallback
  }
  globalThis.GM_setValue = (key, value) => {
    if (failWrites) throw new Error('storage unavailable')
    write(key, value, false)
  }
  globalThis.GM_deleteValue = (key) => write(key, undefined, false)
  globalThis.GM_removeValueChangeListener = (id) => listeners.delete(id)
  if (listener === 'missing') delete globalThis.GM_addValueChangeListener
  else globalThis.GM_addValueChangeListener = (key, fn) => {
    if (listener === 'throws') throw new Error('listener unavailable')
    if (listener === 'invalid') return undefined
    const id = nextId++
    listeners.set(id, { key, fn })
    return id
  }
  // A fresh module models the backend belonging to one userscript instance.
  const { makeStore } = await import(`../src/store.js?gm-case=${++gmCase}`)
  return {
    store: makeStore('gm-probe'),
    remote: (value) => write('lsb_base:gm-probe:blob', value, true),
    failWrites: () => { failWrites = true },
    reads: () => reads,
    listenerCount: () => listeners.size,
  }
}

test('store：GM 缓存随其它标签改写失效', async (t) => {
  const { store, remote } = await gmStore(t)
  assert.equal(store.get('blob').n, 1)
  remote({ n: 2 })
  assert.equal(store.get('blob').n, 2)
  store.update('blob', (value) => ({ n: value.n + 1 }))
  assert.equal(store.get('blob').n, 3, '读改写必须基于外部更新后的值')
})

test('store：其它标签删除 GM 键后返回默认值，重新创建后可再读取', async (t) => {
  const { store, remote } = await gmStore(t)
  store.get('blob')
  remote(undefined)
  assert.equal(store.get('blob', 'missing'), 'missing')
  remote({ n: 4 })
  assert.equal(store.get('blob').n, 4)
})

test('store：GM 同键缓存和监听复用，监听 ID 为 0 仍有效', async (t) => {
  const { store, reads, listenerCount } = await gmStore(t)
  const first = store.get('blob')
  assert.equal(store.get('blob'), first)
  assert.equal(reads(), 1)
  assert.equal(listenerCount(), 1)
  store.set('blob', { n: 5 })
  assert.equal(store.get('blob').n, 5)
  assert.equal(listenerCount(), 1)
})

for (const listener of ['missing', 'throws', 'invalid']) {
  test(`store：GM 监听 ${listener} 时直接读取持久值`, async (t) => {
    const { store, remote } = await gmStore(t, { listener })
    assert.equal(store.get('blob').n, 1)
    remote({ n: 2 })
    assert.equal(store.get('blob').n, 2)
    store.set('blob', { n: 3 })
    remote({ n: 4 })
    assert.equal(store.get('blob').n, 4)
  })
}

test('store：GM 写入失败不能把未持久化的数据放进缓存', async (t) => {
  const { store, failWrites } = await gmStore(t)
  assert.equal(store.get('blob').n, 1)
  failWrites()
  assert.throws(() => store.set('blob', { n: 2 }), /storage unavailable/)
  assert.equal(store.get('blob').n, 1)
})
