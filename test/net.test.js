/** 网络层：统一出口的限速、CSRF、去重、重试与跨域约束 */
import { test, before } from 'node:test'
import assert from 'node:assert/strict'
import { JSDOM } from 'jsdom'
import { Net, Actions, classifyWriteResponse } from '../src/net.js'

before(() => {
  // DOMParser / document 最小环境
  const dom = new JSDOM('<!doctype html><html><body></body></html>', { url: 'https://linux.sb/' })
  globalThis.DOMParser = dom.window.DOMParser
  globalThis.document = dom.window.document
})

function makeNet({ rate = 15, responses = [], origin = 'https://linux.sb' } = {}) {
  const calls = []
  const queue = [...responses]
  const fetchStub = async (url, init = {}) => {
    calls.push({ url: String(url), method: init.method || 'GET', body: init.body, headers: init.headers || {}, ts: Date.now() })
    const r = queue.length ? queue.shift() : { status: 200, text: '' }
    if (typeof r === 'number') return { status: r, ok: r < 400, url: String(url), text: async () => '' }
    return { status: r.status ?? 200, ok: (r.status ?? 200) < 400, url: String(url), text: async () => r.text ?? '' }
  }
  globalThis.fetch = fetchStub
  const net = new Net({ rate, log: () => {}, origin })
  return { net, calls }
}

test('Platform v2 transport 委托保持 raw 的传输语义', async () => {
  const { net, calls } = makeNet({ rate: 0, responses: [{ status: 200, text: 'transport' }] })
  const response = await net.transport('/transport', { queue: false })
  assert.equal(response.text, 'transport')
  assert.equal(calls.length, 1)
})

test('M12 取消排队的请求立即返回且不会发出网络请求', async () => {
  let release
  const held = new Promise((resolve) => { release = resolve })
  const calls = []
  globalThis.fetch = async (url) => {
    calls.push(String(url))
    await held
    return { status: 200, ok: true, url: String(url), text: async () => '' }
  }
  const net = new Net({ rate: 0, origin: 'https://linux.sb' })
  const first = net.raw('/held')
  const ctrl = new AbortController()
  const second = net.raw('/cancelled', { signal: ctrl.signal })
  const rejection = assert.rejects(second, { name: 'AbortError' })
  ctrl.abort()
  release()
  await rejection
  await first
  assert.deepEqual(calls, ['https://linux.sb/held'])
})

test('M12 fetch 取消不等待忽略 signal 的迟到响应，也不重试', async () => {
  let calls = 0
  let release
  globalThis.fetch = async () => { calls++; return new Promise((resolve) => { release = resolve }) }
  const net = new Net({ rate: 0, origin: 'https://linux.sb' })
  const ctrl = new AbortController()
  const request = net.raw('/cancel', { signal: ctrl.signal, retry: 2, queue: false })
  const rejection = assert.rejects(request, { name: 'AbortError' })
  ctrl.abort()
  release({ status: 200, ok: true, text: async () => 'late' })
  await rejection
  assert.equal(calls, 1)
})

test('M12 GM 取消调用 abort 并忽略迟到 onload', async () => {
  let callbacks
  let aborted = 0
  const net = new Net({ origin: 'https://linux.sb', gmRequest: (options) => {
    callbacks = options
    return { abort: () => { aborted++; options.onabort?.() } }
  } })
  const ctrl = new AbortController()
  const request = net.raw('https://api.example.test', { external: true, method: 'POST', signal: ctrl.signal })
  const rejection = assert.rejects(request, { name: 'AbortError' })
  ctrl.abort()
  callbacks.onload({ status: 200, responseText: 'late' })
  await rejection
  assert.equal(aborted, 1)
})

test('M12 doc 带 signal 的读取不取消其它同 URL 请求', async () => {
  let calls = 0
  let release
  const held = new Promise((resolve) => { release = resolve })
  globalThis.fetch = async (url) => { calls++; await held; return { status: 200, ok: true, url: String(url), text: async () => '<h1>ok</h1>' } }
  const net = new Net({ origin: 'https://linux.sb', rate: 0 })
  const ordinary = net.doc('/topic/1', { queue: false })
  const ctrl = new AbortController()
  const cancellable = net.doc('/topic/1', { queue: false, signal: ctrl.signal })
  const rejection = assert.rejects(cancellable, { name: 'AbortError' })
  ctrl.abort()
  release()
  await rejection
  assert.equal((await ordinary).querySelector('h1').textContent, 'ok')
  assert.equal(calls, 2)
})

test('M12 fetch 文本流逐字节解码中文，不重复增量', async () => {
  const bytes = new TextEncoder().encode('中文🙂答案')
  globalThis.fetch = async () => ({ status: 200, ok: true, url: '', body: new ReadableStream({
    start(controller) { for (const byte of bytes) controller.enqueue(new Uint8Array([byte])); controller.close() },
  }) })
  const chunks = []
  const net = new Net({ origin: 'https://linux.sb', rate: 0 })
  const response = await net.raw('/stream', { onChunk: (chunk) => chunks.push(chunk), queue: false })
  assert.equal(response.text, '中文🙂答案')
  assert.equal(chunks.join(''), '中文🙂答案')
})

test('M12 GM 进度为累计正文，重复进度和 onload 不重放文本', async () => {
  const chunks = []
  const net = new Net({ origin: 'https://linux.sb', gmRequest: (options) => {
    options.onprogress({ status: 200, responseText: '中' })
    options.onprogress({ status: 200, responseText: '中' })
    options.onprogress({ status: 200, responseText: '中文' })
    options.onload({ status: 200, responseText: '中文🙂' })
    return { abort() {} }
  } })
  const response = await net.raw('https://api.example.test', { external: true, method: 'POST', onChunk: (chunk) => chunks.push(chunk) })
  assert.deepEqual(chunks, ['中', '文', '🙂'])
  assert.equal(response.text, '中文🙂')
})

test('全局闸门：相邻请求强制按 rate 串行', async () => {
  const { net, calls } = makeNet({ rate: 40 })
  await Promise.all([net.raw('/a'), net.raw('/b'), net.raw('/c')])
  assert.equal(calls.length, 3)
  for (let i = 1; i < calls.length; i++) {
    const gap = calls[i].ts - calls[i - 1].ts
    assert.ok(gap >= 30, `第 ${i} 次间隔 ${gap}ms 应 >= 30ms`)
  }
})

test('form POST 自动注入 _csrf', async () => {
  const { net, calls } = makeNet()
  net.setCsrf('tok123')
  await net.form('/some_action', { topic_id: 7, body: '内容' })
  const fd = calls[0].body
  assert.ok(fd instanceof FormData)
  assert.equal(fd.get('_csrf'), 'tok123')
  assert.equal(fd.get('topic_id'), '7')
  assert.equal(fd.get('body'), '内容')
  assert.equal(calls[0].method, 'POST')
})

test('缺少 token 时拒绝写操作而不是裸发', async () => {
  const { net } = makeNet()
  net._csrf = null
  await assert.rejects(() => net.form('/x', {}), /缺少 _csrf/)
})

test('Net.search：只 POST 固定 /search 并返回站内 redirect', async () => {
  const { net, calls } = makeNet({
    rate: 0,
    responses: [
      { status: 200, text: JSON.stringify({ ok: 1, redirect: '/index.php?q=%E7%BC%93%E5%AD%98&field=title' }) },
      { status: 200, text: '<html><body><h1>搜索结果</h1></body></html>' },
    ],
  })
  net.setCsrf('search-token')
  const result = await net.search('缓存', 'title')
  assert.equal(result.url, '/index.php?q=%E7%BC%93%E5%AD%98&field=title')
  assert.equal(calls[0].method, 'POST')
  assert.equal(new URL(calls[0].url).pathname, '/search')
  await assert.rejects(() => net.search('\u0000', 'title'), /关键词/)
})

test('Net.search：HTTP 或业务 ok 失败时不跟随 redirect', async () => {
  const httpFailure = makeNet({
    rate: 0,
    responses: [{ status: 503, text: '{"ok":0,"redirect":"/index.php?q=bad"}' }],
  })
  httpFailure.net.setCsrf('search-token')
  await assert.rejects(() => httpFailure.net.search('失败', 'title'), /HTTP 503/)
  assert.equal(httpFailure.calls.length, 1)

  const businessFailure = makeNet({
    rate: 0,
    responses: [{ status: 200, text: '{"ok":0,"redirect":"/index.php?q=bad","message":"拒绝"}' }],
  })
  businessFailure.net.setCsrf('search-token')
  await assert.rejects(() => businessFailure.net.search('失败', 'title'), /拒绝|搜索接口返回异常/)
  assert.equal(businessFailure.calls.length, 1)
})

test('doc() 解析 HTML 并顺带续期 CSRF；并发同 URL 去重', async () => {
  const html = '<html><body><input name="_csrf" value="fresh"></body></html>'
  const { net, calls } = makeNet({ responses: [{ status: 200, text: html }] })
  const [d1, d2] = await Promise.all([net.doc('/topic/5'), net.doc('/topic/5')])
  assert.equal(d1.querySelector('input[name="_csrf"]').value, 'fresh')
  assert.equal(d2, d1, 'in-flight 去重返回同一个 promise')
  assert.equal(calls.length, 1)
  assert.equal(net.csrf(), 'fresh')
})

test('非 2xx 的 doc 抛错', async () => {
  const { net } = makeNet({ responses: [{ status: 404, text: '' }] })
  await assert.rejects(() => net.doc('/topic/999999'), /HTTP 404/)
})

test('跨域默认拒绝，external:true 才放行', async () => {
  const { net } = makeNet()
  await assert.rejects(() => net.raw('https://evil.example.com/steal'), /跨域请求被拒绝/)
  await net.raw('https://evil.example.com/api', { external: true })
})

test('站外 URL 仅允许 HTTP(S)，拒绝凭据和 fragment', async () => {
  const { net, calls } = makeNet()
  await assert.rejects(() => net.raw('javascript:alert(1)', { external: true }), /协议不受支持/)
  await assert.rejects(() => net.raw('https://user:pass@example.com/api', { external: true }), /用户名或密码/)
  await assert.rejects(() => net.raw('https://example.com/api#token', { external: true }), /hash fragment/)
  assert.equal(calls.length, 0, '无效 URL 不得触发 fetch')
})

test('站外请求走 GM；失败时点明 @connect / 网络问题', async () => {
  const gmCalls = []
  const net = new Net({
    origin: 'https://linux.sb',
    gmRequest: (opt) => {
      gmCalls.push(opt)
      opt.onerror({ status: 0, error: 'Refused to connect' })
    },
  })
  await assert.rejects(
    () =>
      net.raw('https://api.deepseek.com/v1/chat/completions', {
        method: 'POST',
        external: true,
        body: '{"model":"x"}',
        headers: { 'content-type': 'application/json' },
        retry: 0,
      }),
    /GM 请求失败[\s\S]*@connect/,
  )
  assert.equal(gmCalls.length, 1)
  assert.equal(gmCalls[0].url, 'https://api.deepseek.com/v1/chat/completions')
  assert.equal(gmCalls[0].method, 'POST')
  assert.equal(gmCalls[0].anonymous, true, '站外请求不携带站点 cookie')
  assert.equal(gmCalls[0].data, '{"model":"x"}')
})

test('氢脚本声明 @connect *，用户配置的 LLM 域名才能出站', async () => {
  const { readFileSync } = await import('node:fs')
  const banner = readFileSync(new URL('../build.mjs', import.meta.url), 'utf8')
  assert.match(banner, /@connect\s+\*/)
})

test('429 按退避重试后成功', async () => {
  const { net, calls } = makeNet({
    responses: [429, { status: 200, text: 'ok' }],
  })
  const res = await net.raw('/busy', { retry: 2, backoff: { rate: 1, err: 1 } })
  assert.equal(res.status, 200)
  assert.equal(calls.length, 2)
})

test('raw 对 5xx 不抛错（返回响应由调用方判断 ok），doc 会抛', async () => {
  const { net } = makeNet({ responses: [{ status: 500, text: '' }] })
  const res = await net.raw('/bad', { retry: 0 })
  assert.equal(res.status, 500)
  assert.equal(res.ok, false)

  const { net: net2 } = makeNet({ responses: [{ status: 500, text: '' }] })
  await assert.rejects(() => net2.doc('/bad', { retry: 0 }), /HTTP 500/)
})

test('json() 返回解析结果，非 JSON 明确报错', async () => {
  const a = makeNet({ responses: [{ status: 200, text: '{"ok":1}' }] })
  assert.deepEqual(await a.net.json('/feed'), { ok: 1 })

  const b = makeNet({ responses: [{ status: 200, text: '<html>不是JSON</html>' }] })
  await assert.rejects(() => b.net.json('/feed'), /非 JSON/)
})

test('Actions.reply 组包：端点、字段、CSRF', async () => {
  const { net, calls } = makeNet({ responses: [{ status: 200, text: '{"ok":1,"message":"已回复"}' }] })
  net.setCsrf('ctok')
  const actions = new Actions(net)
  const out = await actions.reply(42, '支持一下')
  assert.equal(out.ok, true)
  const c = calls[0]
  assert.match(c.url, /\/reply_edit$/)
  assert.equal(c.body.get('topic_id'), '42')
  assert.equal(c.body.get('body'), '支持一下')
  assert.equal(c.body.get('_csrf'), 'ctok')
  assert.equal(out.outcome, 'success')
  assert.equal(Object.hasOwn(out, 'raw'), false, '写回执不暴露原始响应正文')
})

test('写操作回执：按站点 JSON ok 字段区分成功、业务失败和未知', () => {
  const success = classifyWriteResponse({ status: 200, ok: true, url: 'https://linux.sb/reply_edit', text: '{"ok":1,"message":"已回复","redirect":"/topic/9?replyid=10"}' }, { actionPath: '/reply_edit' })
  assert.equal(success.outcome, 'success')
  assert.equal(success.message, '已回复')
  assert.equal(success.redirect, '/topic/9?replyid=10')

  const failure = classifyWriteResponse({ status: 200, ok: true, url: 'https://linux.sb/reply_edit', text: '{"ok":false,"message":"CSRF 失效"}' }, { actionPath: '/reply_edit' })
  assert.equal(failure.outcome, 'failure')
  assert.equal(failure.message, 'CSRF 失效')

  const unknown = classifyWriteResponse({ status: 200, ok: true, url: 'https://linux.sb/reply_edit', text: '<html><body>页面</body></html>' }, { actionPath: '/reply_edit' })
  assert.equal(unknown.outcome, 'unknown')

  const serverError = classifyWriteResponse({ status: 503, ok: false, url: 'https://linux.sb/reply_edit', text: '暂时不可用' }, { actionPath: '/reply_edit' })
  assert.equal(serverError.outcome, 'unknown', '5xx 可能已到达站点，不能提示用户安全重发')

  const noContent = classifyWriteResponse({ status: 204, ok: true, url: 'https://linux.sb/reply_edit', text: '' }, { actionPath: '/reply_edit' })
  assert.equal(noContent.outcome, 'unknown', '没有站点语义的 204 不能直接宣称成功')

  const unsupportedSuccessField = classifyWriteResponse({ status: 200, ok: true, url: 'https://linux.sb/reply_edit', text: '{"success":true}' }, { actionPath: '/reply_edit' })
  assert.equal(unsupportedSuccessField.outcome, 'unknown', '本站协议只信任 ok 字段')
})

test('Actions 写端点保留业务失败，不把 HTTP 200 误报成功', async () => {
  const { net } = makeNet({
    responses: [
      { status: 200, text: '{"ok":false,"message":"CSRF 失效"}' },
      { status: 200, text: '{"ok":false,"message":"没有权限"}' },
      { status: 200, text: '{"ok":false,"message":"投币失败"}' },
    ],
  })
  net.setCsrf('ctok')
  const actions = new Actions(net)
  const reply = await actions.reply(42, '测试')
  const topic = await actions.topic(7, '标题', '正文')
  const coin = await actions.likeCoin({ type: 'reply', id: 87, coin: 5 })
  assert.equal(reply.ok, false)
  assert.equal(reply.outcome, 'failure')
  assert.equal(reply.message, 'CSRF 失效')
  assert.equal(topic.outcome, 'failure')
  assert.equal(topic.message, '没有权限')
  assert.equal(coin.outcome, 'failure')
  assert.equal(coin.message, '投币失败')
})

test('Actions.reply 空内容直接拒绝（不发请求）', async () => {
  const { net, calls } = makeNet()
  net.setCsrf('t')
  const actions = new Actions(net)
  await assert.rejects(() => actions.reply(1, '   '), /不能为空/)
  assert.equal(calls.length, 0)
})

test('Actions.likeCoin / toggleFavorite 端点正确', async () => {
  const { net, calls } = makeNet({ responses: [{ status: 200, text: '{}' }, { status: 200, text: '' }] })
  net.setCsrf('t')
  const actions = new Actions(net)
  await actions.likeCoin({ type: 'reply', id: 87, coin: 5 })
  assert.match(calls[0].url, /\/lsb_like_coin$/)
  assert.equal(calls[0].body.get('like_coin_type'), 'reply')
  assert.equal(calls[0].body.get('like_coin_id'), '87')

  await actions.toggleFavorite(14055)
  assert.match(calls[1].url, /\/topic_favorite$/)
  assert.equal(calls[1].body.get('topic_id'), '14055')
})
