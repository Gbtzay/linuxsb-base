import test from 'node:test'
import assert from 'node:assert/strict'
import { createSkinViewCache } from '../plugins/skin/view-cache.js'

function fixture() {
  let nextTimer = 0
  const timers = new Map()
  const requests = []
  const context = { enabled: true, viewKey: '/forum/4', href: 'https://linux.sb/forum/4' }
  const window = {
    AbortController,
    setTimeout(fn, delay) { const id = ++nextTimer; timers.set(id, { fn, delay }); return id },
    clearTimeout(id) { timers.delete(id) },
  }
  const cache = createSkinViewCache({
    window, document: { visibilityState: 'visible' }, getContext: () => context,
    request(path, options) {
      assert.equal(path, '/')
      assert.equal(options.timeout, 15000)
      assert.equal(options.retry, 0)
      return new Promise((resolve) => requests.push({ resolve, options }))
    },
    parse: (text) => ({ frag: text, title: text, head: { title: text }, attrs: [] }),
    isTopic: (key) => key.startsWith('/topic/'),
    cacheKey: (href) => new URL(href).pathname,
  })
  function fire() {
    const entry = timers.entries().next().value
    if (!entry) return
    const [id, timer] = entry
    timers.delete(id)
    assert.equal(timer.delay, 30000)
    timer.fn()
  }
  return { cache, requests, timers, fire }
}
const flush = () => new Promise((resolve) => setImmediate(resolve))
const response = (text) => ({ ok: true, status: 200, url: 'https://linux.sb/', text })

// Without generation invalidation, a stopped prefetch can repopulate a cleared cache.
test('首页预取停用后晚到响应不回填，重启只保留新响应', async () => {
  const { cache, requests } = fixture()
  const old = cache.seed()
  cache.schedule() // bindSpa schedules immediately, before the seed has created a cache entry.
  cache.stop()
  cache.clear()
  const fresh = cache.seed()
  cache.schedule()
  requests[0].resolve(response('old-home'))
  await old
  assert.equal(cache.take('/'), null, '停用前的预取不得复活缓存')
  requests[1].resolve(response('fresh-home'))
  await fresh
  assert.equal(cache.take('/').frag, 'fresh-home')
  assert.equal(requests[0].options.signal?.aborted, true)
  cache.stop()
})

// Retaining the old in-flight slot blocks restart; its finally must not clear a newer request.
test('首页刷新停止后可重启，旧请求收尾不覆盖新请求生命周期', async () => {
  const { cache, requests, timers, fire } = fixture()
  cache.remember('/', { frag: 'cached-home' })
  cache.schedule()
  fire()
  cache.stop()
  cache.schedule()
  fire()
  assert.equal(requests.length, 2, '重启须能发起当前代次刷新')
  requests[0].resolve(response('old-home'))
  await flush()
  cache.schedule()
  assert.equal(timers.size, 0, '新刷新在途时不能重复安排刷新')
  requests[1].resolve(response('fresh-home'))
  await flush()
  assert.equal(cache.take('/').frag, 'fresh-home')
  assert.equal(requests[0].options.signal?.aborted, true)
  cache.stop()
})

// Unbounded retention or non-consuming reads would retain stale live DOM fragments.
test('视图缓存限五项，更新顺序并消费命中，帖子正文不复用', () => {
  const { cache } = fixture()
  for (let id = 1; id <= 5; id++) cache.remember(`/forum/${id}`, { frag: `view-${id}` })
  const live = { frag: { node: 'retained-live-node' } }
  cache.remember('/forum/1', live)
  cache.remember('/forum/6', { frag: 'view-6' })
  assert.equal(cache.take('/forum/2'), null)
  assert.equal(cache.take('/forum/1'), live)
  assert.equal(cache.take('/forum/1'), null)
  cache.remember('/topic/1', { frag: 'topic-must-not-be-reused' })
  assert.equal(cache.take('/topic/1'), null)
  cache.clear()
  assert.equal(cache.take('/forum/6'), null)
})
