/** DOM 观察：新增子树扫描成本、事件归一化与 onEach 幂等性 */
import { test, beforeEach } from 'node:test'
import assert from 'node:assert/strict'
import { JSDOM } from 'jsdom'
import { Bus } from '../src/bus.js'
import { DomWatcher } from '../src/dom.js'

beforeEach((t) => {
  const w = new JSDOM('<main class="wrap"><ul class="post-list"></ul></main>', {
    url: 'https://linux.sb/',
  }).window
  globalThis.window = w
  globalThis.document = w.document
  globalThis.MutationObserver = w.MutationObserver
  t.after(() => w.close())
})

function countCandidates(t, selector) {
  const prototype = window.Element.prototype
  const query = prototype.querySelectorAll
  const matches = prototype.matches
  let candidates = 0
  t.mock.method(prototype, 'querySelectorAll', function (value) {
    const result = query.call(this, value)
    if (value === selector) candidates += result.length
    return result
  })
  t.mock.method(prototype, 'matches', function (value) {
    const result = matches.call(this, value)
    if (value === selector && result) candidates++
    return result
  })
  return () => candidates
}

test('DomWatcher：长列表持续新增时，onEach 只检查新增项而不重扫旧列表', async (t) => {
  const bus = new Bus()
  const watcher = new DomWatcher(bus)
  const ul = document.querySelector('ul.post-list')
  ul.innerHTML = '<li class="post-item probe-target">old</li>'.repeat(1000)
  const seen = []
  watcher.onEach('.probe-target', (node) => seen.push(node), { owner: 'probe' })
  assert.equal(seen.length, 1000)
  seen.length = 0
  watcher.start(document.body)
  const checked = countCandidates(t, '.probe-target')
  t.after(() => watcher.stop())
  const announced = []
  bus.on('dom:list-added', (nodes) => announced.push(...nodes))
  for (let batch = 0; batch < 10; batch++) {
    const frag = document.createDocumentFragment()
    for (let i = 0; i < 20; i++) {
      const li = document.createElement('li')
      li.className = 'post-item probe-target'
      li.textContent = `${batch}:${i}`
      frag.appendChild(li)
    }
    ul.appendChild(frag)
    await new Promise((resolve) => setTimeout(resolve, 0))
  }
  assert.equal(seen.length, 200)
  assert.equal(new Set(seen).size, 200)
  assert.deepEqual(announced, seen)
  assert.ok(checked() <= 400, `只新增 200 项，实际检查了 ${checked()} 个匹配元素`)
})

test('DomWatcher：同批父子 mutation 只扫描最外层新增子树，保留后代匹配和事件', async (t) => {
  const bus = new Bus()
  const watcher = new DomWatcher(bus)
  const seen = []
  watcher.onEach('.probe-target', (node) => seen.push(node))
  watcher.start(document.body)
  t.after(() => watcher.stop())
  const checked = countCandidates(t, '.probe-target')
  const posts = []
  bus.on('dom:posts-added', (nodes) => posts.push(...nodes))
  const wrapper = document.createElement('section')
  const post = document.createElement('li')
  post.className = 'post-entry probe-target'
  const child = document.createElement('span')
  child.className = 'probe-target'
  document.querySelector('ul.post-list').append(wrapper)
  wrapper.append(post)
  post.append(child)
  await new Promise((resolve) => setTimeout(resolve, 0))
  assert.deepEqual(seen, [post, child])
  assert.deepEqual(posts, [post])
  assert.equal(checked(), 2, '重叠 mutation 不能反复查询同一后代')
  wrapper.append(post)
  await new Promise((resolve) => setTimeout(resolve, 0))
  assert.deepEqual(seen, [post, child], '移动已处理的元素不能重复执行 onEach')
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
