import { test } from 'node:test'
import assert from 'node:assert/strict'
import { createCapabilityContext } from '../src/runtime/capabilities.js'
import { RequestBroker } from '../src/runtime/request-broker.js'
import { routeFingerprint, snapshotValue } from '../src/runtime/route-utils.js'

function context(id, permissions) {
  return createCapabilityContext({ id, permissions })
}

function response(text = '{"ok":1}', status = 200) {
  return { status, ok: status >= 200 && status < 300, url: 'https://linux.sb/current', headers: { 'x-test': 'ok' }, text }
}

function heldTransport() {
  const calls = []
  const transport = (url, options) => new Promise((resolve, reject) => {
    calls.push({ url, options, resolve, reject })
  })
  return { calls, transport }
}

test('相同 owner 的并发 GET 合并传输，各调用方独立解析且完成后不缓存', async () => {
  const { calls, transport } = heldTransport()
  const broker = new RequestBroker({ origin: 'https://linux.sb', transport })
  const owner = context('reader', ['read'])
  const first = broker.request({ owner, path: '/topic/1', response: ['json'], headers: { Accept: 'application/json' } })
  const second = broker.request({ owner, path: 'https://linux.sb/topic/1', response: ['json', 'text'], headers: { accept: 'application/json' } })
  calls.forEach((call) => call.resolve(response('{"n":1}')))
  const [a, b] = await Promise.all([first, second])
  assert.equal(calls.length, 1)
  assert.deepEqual(a.json, { n: 1 })
  assert.equal(a.text, undefined)
  assert.equal(b.text, '{"n":1}')
  a.json.n = 5
  assert.equal(b.json.n, 1)
  const later = broker.request({ owner, path: '/topic/1', response: ['json'] })
  assert.equal(calls.length, 2)
  calls[1].resolve(response('{"n":2}'))
  assert.deepEqual((await later).json, { n: 2 })
})

test('取消一个共享 GET 不取消另一个消费者', async () => {
  const { calls, transport } = heldTransport()
  const broker = new RequestBroker({ origin: 'https://linux.sb', transport })
  const owner = context('reader', ['read'])
  const controller = new AbortController()
  const first = broker.request({ owner, path: '/shared', signal: controller.signal })
  const second = broker.request({ owner, path: '/shared' })
  const cancelled = assert.rejects(first, (error) => error.code === 'request.aborted')
  controller.abort()
  const transportCancelled = calls[0].options.signal.aborted
  calls.forEach((call) => call.resolve(response('survivor')))
  await cancelled
  assert.equal((await second).text, 'survivor')
  assert.equal(transportCancelled, false)
  assert.equal(calls.length, 1)
})

test('所有消费者取消后立即中止共享 GET，新请求不复用迟到结果', async () => {
  const { calls, transport } = heldTransport()
  const broker = new RequestBroker({ origin: 'https://linux.sb', transport })
  const owner = context('reader', ['read'])
  const a = new AbortController()
  const b = new AbortController()
  const first = broker.request({ owner, path: '/shared', signal: a.signal })
  const second = broker.request({ owner, path: '/shared', signal: b.signal })
  const cancellations = [first, second].map((call) => assert.rejects(call, (error) => error.code === 'request.aborted'))
  a.abort()
  b.abort()
  const cancelledCalls = calls.slice()
  const fresh = broker.request({ owner, path: '/shared' })
  cancelledCalls.forEach((call) => call.resolve(response('stale')))
  calls.at(-1).resolve(response('fresh'))
  await Promise.all(cancellations)
  assert.equal((await fresh).text, 'fresh')
  assert.equal(cancelledCalls.length, 1)
  assert.ok(cancelledCalls.every((call) => call.options.signal.aborted))
  assert.equal(calls.length, 2)
})

test('失败的共享 GET 不保留，后续读取可以重新请求', async () => {
  const { calls, transport } = heldTransport()
  const broker = new RequestBroker({ origin: 'https://linux.sb', transport })
  const owner = context('reader', ['read'])
  const pending = [broker.request({ owner, path: '/retry' }), broker.request({ owner, path: '/retry' })]
  const failures = pending.map((call) => assert.rejects(call, (error) => error.code === 'request.failed'))
  calls.forEach((call) => call.reject(new Error('offline')))
  await Promise.all(failures)
  assert.equal(calls.length, 1)
  const fresh = broker.request({ owner, path: '/retry' })
  calls[1].resolve(response('recovered'))
  assert.equal((await fresh).text, 'recovered')
})

test('GET 合并仍逐个检查权限与路由，且不混合 owner、请求头和传输策略', async () => {
  const { calls, transport } = heldTransport()
  let route = 'topic:1'
  const broker = new RequestBroker({ origin: 'https://linux.sb', transport, snapshot: () => ({ routeFingerprint: route }) })
  const owner = context('reader', ['read', 'net', 'write'])
  const defaults = { owner, path: '/topic/1' }
  const intents = [
    {}, { owner: context('another', ['read']) },
    { headers: { accept: 'application/json' } },
    { retry: 0 }, { timeout: 1000 }, { queue: false }, { backoff: { rate: 42 } },
    { method: 'POST', body: { _csrf: 'test' } }, { method: 'POST', body: { _csrf: 'test' } },
    { onChunk() {} }, { onChunk() {} },
    { path: 'https://api.example.test/data', external: true }, { path: 'https://api.example.test/data', external: true },
  ]
  const pending = intents.map((intent) => broker.request({ ...defaults, ...intent }))
  await assert.rejects(broker.request({ ...defaults, owner: context('denied', []) }), (error) => error.code === 'capability.denied')
  await assert.rejects(broker.request({ ...defaults, routeScope: 'topic:2' }), (error) => error.code === 'route.scope-mismatch')
  route = 'topic:2'
  pending.push(broker.request(defaults))
  calls.forEach((call) => call.resolve(response()))
  await Promise.all(pending)
  assert.equal(calls.length, 14)
})

test('共享 GET 的短超时消费者退出后仍可完成较晚加入的读取', async () => {
  const { calls, transport } = heldTransport()
  const broker = new RequestBroker({ origin: 'https://linux.sb', transport })
  const owner = context('reader', ['read'])
  const first = broker.request({ owner, path: '/timeout', timeout: 15 })
  const timedOut = assert.rejects(first, (error) => error.code === 'request.timeout')
  const second = broker.request({ owner, path: '/timeout', timeout: 200 })
  await timedOut
  calls.at(-1).resolve(response('completed'))
  assert.equal((await second).text, 'completed')
  assert.equal(calls.length, 2, '不同传输超时策略不合并')
})

test('runtime 路由上下文辅助函数统一快照读取和指纹回退', () => {
  assert.deepEqual(snapshotValue(() => ({ routeFingerprint: 'home' })), { routeFingerprint: 'home' })
  assert.deepEqual(snapshotValue(null), {})
  assert.deepEqual(snapshotValue(() => { throw new Error('snapshot failed') }), {})
  assert.equal(routeFingerprint({ routeFingerprint: 'direct', route: { fingerprint: 'nested' } }), 'direct')
  assert.equal(routeFingerprint({ route: { fingerprint: 'nested' } }), 'nested')
  assert.equal(routeFingerprint({ page: { fingerprint: 'page' } }), 'page')
  assert.equal(routeFingerprint({ page: { type: 'home' } }), 'home')
  assert.equal(routeFingerprint({}), undefined)
})

test('同源 GET 返回安全 envelope，并将请求交给 transport', async () => {
  const calls = []
  const broker = new RequestBroker({
    origin: 'https://linux.sb',
    snapshot: () => ({ csrf: 'csrf-secret', routeFingerprint: 'home' }),
    transport: async (url, opts) => {
      calls.push({ url, opts })
      return response()
    },
  })

  const out = await broker.request({
    owner: context('reader', ['read']),
    purpose: '读取首页',
    path: '/index.php',
    method: 'GET',
    routeScope: 'home',
    response: ['text', 'json'],
  })

  assert.equal(out.ok, true)
  assert.equal(out.status, 200)
  assert.equal(out.text, '{"ok":1}')
  assert.deepEqual(out.json, { ok: 1 })
  assert.deepEqual(out.headers, { 'x-test': 'ok' })
  assert.equal(out.url, undefined, '不向调用方返回原始 URL')
  assert.equal(calls.length, 1)
  assert.equal(calls[0].opts.method, 'GET')
})

test('安全 envelope 仅保留同源重定向的校验后最终地址', async () => {
  const broker = new RequestBroker({
    origin: 'https://linux.sb',
    transport: async (url) => ({ ...response('redirected'), url: 'https://linux.sb/login' }),
  })
  const redirected = await broker.request({
    owner: context('reader', ['read']),
    purpose: '检查页面重定向',
    path: '/forum/4',
    response: ['text'],
  })
  assert.equal(redirected.finalUrl, 'https://linux.sb/login')
  assert.equal(redirected.url, undefined, '最终地址只通过专用字段返回，避免覆盖请求地址语义')

  const crossOrigin = new RequestBroker({
    origin: 'https://linux.sb',
    transport: async () => ({ ...response('external'), url: 'https://other.example/login' }),
  })
  const external = await crossOrigin.request({
    owner: context('reader', ['read']),
    purpose: '同源页面请求',
    path: '/forum/4',
    response: ['text'],
  })
  assert.equal(external.finalUrl, undefined, '跨域最终地址不得从安全 envelope 暴露')
})

test('同源 mutation 注入当前 CSRF；缺少 write 时在 transport 前拒绝', async () => {
  const calls = []
  const broker = new RequestBroker({
    origin: 'https://linux.sb',
    snapshot: () => ({ csrf: 'csrf-secret', routeFingerprint: 'topic:1' }),
    transport: async (_url, opts) => {
      calls.push(opts)
      return response('{"ok":1}')
    },
  })

  await assert.rejects(
    () => broker.request({ owner: context('reader', ['read']), purpose: '回复', path: '/reply', method: 'POST', body: { body: 'hello' } }),
    (error) => error.code === 'capability.denied' && error.capability === 'write',
  )
  assert.equal(calls.length, 0)

  await broker.request({
    owner: context('writer', ['write']),
    purpose: '回复',
    path: '/reply',
    method: 'POST',
    body: { body: 'hello' },
    response: ['json'],
  })
  assert.equal(calls.length, 1)
  assert.equal(calls[0].body._csrf, 'csrf-secret')
})

test('同源请求即使标记 external 也不能绕过 write 与 CSRF', async () => {
  const calls = []
  const broker = new RequestBroker({
    origin: 'https://linux.sb',
    snapshot: () => ({ csrf: 'csrf-secret' }),
    transport: async (_url, opts) => {
      calls.push(opts)
      return response('{"ok":1}')
    },
  })

  await assert.rejects(
    () => broker.request({
      owner: context('net-only', ['net']),
      purpose: '伪装站内写入',
      path: '/reply',
      method: 'POST',
      external: true,
      body: { body: 'hello' },
    }),
    (error) => error.code === 'capability.denied' && error.capability === 'write',
  )
  assert.equal(calls.length, 0)

  await broker.request({
    owner: context('writer', ['write']),
    purpose: '站内写入',
    path: '/reply',
    method: 'POST',
    external: true,
    body: { body: 'hello' },
  })
  assert.equal(calls[0].external, false)
  assert.equal(calls[0].body._csrf, 'csrf-secret')
})

test('缺少能力上下文时保留结构化 capability.denied 字段', async () => {
  const broker = new RequestBroker({
    origin: 'https://linux.sb',
    transport: async () => response(),
  })
  await assert.rejects(
    () => broker.request({ owner: null, purpose: '无上下文', path: '/' }),
    (error) => error.code === 'capability.denied'
      && error.owner === 'unknown'
      && error.capability === 'read'
      && error.purpose === '无上下文',
  )
})

test('限速队列请求完成后移除 abort listener', async () => {
  const listeners = new Set()
  const signal = {
    aborted: false,
    addEventListener(_type, fn) { listeners.add(fn) },
    removeEventListener(_type, fn) { listeners.delete(fn) },
  }
  const owner = {
    owner: 'reader',
    signal,
    require() {},
  }
  const broker = new RequestBroker({
    origin: 'https://linux.sb',
    rate: 5,
    transport: async () => response(),
  })
  await broker.request({ owner, purpose: '第一条', path: '/one' })
  await broker.request({ owner, purpose: '第二条', path: '/two' })
  assert.equal(listeners.size, 0)
})

test('外部请求必须显式 external 且声明 net；绝对 URL、协议和方法都经过校验', async () => {
  const calls = []
  const broker = new RequestBroker({
    origin: 'https://linux.sb',
    snapshot: () => ({ csrf: 'csrf-secret' }),
    transport: async (url, opts) => {
      calls.push({ url, opts })
      return response('external')
    },
  })

  await assert.rejects(
    () => broker.request({ owner: context('reader', ['read']), purpose: '外部读取', path: 'https://api.example.test/data' }),
    (error) => error.code === 'request.cross-origin',
  )
  await assert.rejects(
    () => broker.request({ owner: context('reader', ['read']), purpose: '非法协议', path: 'javascript:alert(1)', external: true }),
    (error) => error.code === 'request.invalid-url',
  )
  await assert.rejects(
    () => broker.request({ owner: context('reader', ['read']), purpose: '非法方法', path: '/x', method: 'TRACE' }),
    (error) => error.code === 'request.invalid-method',
  )
  await assert.rejects(
    () => broker.request({ owner: context('reader', ['read']), purpose: '外部读取', path: 'https://api.example.test/data', external: true }),
    (error) => error.code === 'capability.denied' && error.capability === 'net',
  )

  await broker.request({
    owner: context('net-reader', ['net']),
    purpose: '外部读取',
    path: 'https://api.example.test/data',
    external: true,
    response: ['text'],
  })
  assert.equal(calls.length, 1)
  assert.equal(calls[0].opts.external, true)
})

test('请求在 abort、超时或路由 scope 失效时不泄露凭据', async () => {
  let calls = 0
  const broker = new RequestBroker({
    origin: 'https://linux.sb',
    snapshot: () => ({ csrf: 'csrf-secret', routeFingerprint: 'topic:1' }),
    timeout: 10,
    transport: async () => {
      calls++
      await new Promise(() => {})
    },
    trace: (event) => {
      assert.equal(JSON.stringify(event).includes('csrf-secret'), false)
      assert.equal(JSON.stringify(event).includes('private-body'), false)
    },
  })

  await assert.rejects(
    () => broker.request({ owner: context('reader', ['read']), purpose: '旧路由', path: '/topic/1', routeScope: 'topic:2' }),
    (error) => error.code === 'route.scope-mismatch',
  )
  const controller = new AbortController()
  controller.abort()
  await assert.rejects(
    () => broker.request({ owner: context('reader', ['read']), purpose: '已取消', path: '/topic/1', signal: controller.signal }),
    (error) => error.code === 'request.aborted',
  )
  await assert.rejects(
    () => broker.request({ owner: context('reader', ['read']), purpose: '超时', path: '/topic/1', timeout: 1 }),
    (error) => error.code === 'request.timeout',
  )
  assert.equal(calls, 1)
})
