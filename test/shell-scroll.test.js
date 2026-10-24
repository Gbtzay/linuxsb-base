import test from 'node:test'
import assert from 'node:assert/strict'
import { JSDOM } from 'jsdom'
import { installShellScrollBridge, readShellScroll, writeShellScroll } from '../src/shell-scroll.js'

function makeDom() {
  const dom = new JSDOM('<!doctype html><main></main>', { url: 'https://linux.sb/' })
  const root = dom.window.document.querySelector('main')
  Object.defineProperty(root, 'scrollHeight', { configurable: true, value: 1200 })
  Object.defineProperty(root, 'clientHeight', { configurable: true, value: 400 })
  return { dom, root }
}

test('shell scroll bridge reads and writes the content root', () => {
  const { dom, root } = makeDom()
  writeShellScroll(root, 6, 48)
  assert.deepEqual(readShellScroll(root), { x: 6, y: 48 })
  const bridge = installShellScrollBridge({ windowRef: dom.window, root })
  dom.window.scrollTo({ left: 12, top: 96 })
  assert.equal(dom.window.scrollX, 12)
  assert.equal(dom.window.scrollY, 96)
  assert.deepEqual(bridge.read(), { x: 12, y: 96 })
  bridge.dispose()
})

test('shell scroll bridge carries the existing window position into an empty content root', () => {
  const { dom, root } = makeDom()
  Object.defineProperty(dom.window, 'scrollX', { configurable: true, value: 31 })
  Object.defineProperty(dom.window, 'scrollY', { configurable: true, value: 318 })

  const bridge = installShellScrollBridge({ windowRef: dom.window, root })

  assert.deepEqual(readShellScroll(root), { x: 31, y: 318 })
  assert.equal(dom.window.scrollX, 31)
  assert.equal(dom.window.scrollY, 318)
  bridge.dispose()
})

test('root scroll emits one window scroll event and dispose restores descriptors', () => {
  const { dom, root } = makeDom()
  const originalTo = dom.window.scrollTo
  const originalY = dom.window.scrollY
  let events = 0
  dom.window.addEventListener('scroll', () => { events += 1 })
  const bridge = installShellScrollBridge({ windowRef: dom.window, root })
  root.scrollTop = 120
  root.dispatchEvent(new dom.window.Event('scroll'))
  assert.equal(dom.window.scrollY, 120)
  assert.equal(events, 1)
  bridge.scrollBy(0, 20)
  assert.equal(dom.window.scrollY, 140)
  assert.equal(events, 2)
  bridge.dispose()
  assert.equal(dom.window.scrollTo, originalTo)
  assert.equal(dom.window.scrollY, originalY)
  root.scrollTop = 200
  root.dispatchEvent(new dom.window.Event('scroll'))
  assert.equal(events, 2)
})

