/** 网络层：统一出口的限速、CSRF、去重、重试与跨域约束 */
import { test, before } from 'node:test'
import assert from 'node:assert/strict'
import { JSDOM } from 'jsdom'
import { Net, Actions } from '../src/net.js'

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
  const { net, calls } = makeNet()
  net.setCsrf('ctok')
  const actions = new Actions(net)
  const out = await actions.reply(42, '支持一下')
  assert.equal(out.ok, true)
  const c = calls[0]
  assert.match(c.url, /\/reply_edit$/)
  assert.equal(c.body.get('topic_id'), '42')
  assert.equal(c.body.get('body'), '支持一下')
  assert.equal(c.body.get('_csrf'), 'ctok')
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
