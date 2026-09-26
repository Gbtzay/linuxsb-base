/** DOM 观察：同批插入的兄弟节点只扫一次父节点 */
import { test, beforeEach } from 'node:test'
import assert from 'node:assert/strict'
import { JSDOM } from 'jsdom'
import { Bus } from '../src/bus.js'
import { DomWatcher } from '../src/dom.js'

beforeEach(() => {
  const w = new JSDOM('<main class="wrap"><ul class="post-list"></ul></main>', {
    url: 'https://linux.sb/',
  }).window
  globalThis.window = w
  globalThis.document = w.document
  globalThis.MutationObserver = w.MutationObserver
})

test('DomWatcher：一次插入多条兄弟时只对父节点扫一遍 onEach', async () => {
  const bus = new Bus()
  const watcher = new DomWatcher(bus)
  watcher.start(document.body)
  watcher.onEach('li.post-item', () => {}, { owner: 'probe' })
  const before = watcher.scanCount
  const ul = document.querySelector('ul.post-list')
  const frag = document.createDocumentFragment()
  for (let i = 0; i < 20; i++) {
    const li = document.createElement('li')
    li.className = 'post-item'
    li.textContent = String(i)
    frag.appendChild(li)
  }
  ul.appendChild(frag)
  await new Promise((r) => setTimeout(r, 30))
  assert.equal(watcher.scanCount - before, 1, '20 条兄弟插入只扫父节点一次，而不是 20 次')
})

test('DomWatcher：置顶回帖副本不进 posts-added', async () => {
  const bus = new Bus()
  const watcher = new DomWatcher(bus)
  watcher.start(document.body)
  const added = []
  bus.on('dom:posts-added', (posts) => added.push(...posts))
  const ul = document.querySelector('ul.post-list')
  const clone = document.createElement('li')
  clone.className = 'post-entry reply-pin-duplicate'
  clone.id = 'reply-pin-top-1'
  const real = document.createElement('li')
  real.className = 'post-item post-entry'
  real.id = 'post-1'
  ul.append(clone, real)
  await new Promise((r) => setTimeout(r, 30))
  assert.equal(added.length, 1)
  assert.equal(added[0].id, 'post-1')
})
