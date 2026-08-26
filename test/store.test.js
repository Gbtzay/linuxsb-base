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
