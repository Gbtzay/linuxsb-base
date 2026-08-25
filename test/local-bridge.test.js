/** 本地联动：与 workbench (127.0.0.1:7788) 的健康/预热/分析触发 */
import { test } from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { JSDOM } from 'jsdom'

const baseCode = readFileSync(new URL('../dist/linuxsb-base.user.js', import.meta.url), 'utf8')
const plugCode = readFileSync(new URL('../plugins/local-bridge.user.js', import.meta.url), 'utf8')
const topicHtml = readFileSync(new URL('./fixtures/topic1.html', import.meta.url), 'utf8')

const WB = 'http://127.0.0.1:7788'

const PRELOAD = {
  'lsb_base:local-bridge:__config': {
    apiUrl: WB,
    mode: 'llm',
    warmCache: true,
    healthSec: 0, // 测试里手动调 health()
    showLink: false,
  },
  'lsb_base:__core:rate': 10,
  'lsb_base:__core:urlPoll': 0,
}

function makeSite(preload = PRELOAD, { failExternal = false } = {}) {
  const calls = []
  const dom = new JSDOM(topicHtml, { url: 'https://linux.sb/topic/1', runScripts: 'outside-only' })
  const w = dom.window
  w.unsafeWindow = w
  w.requestAnimationFrame = (fn) => setTimeout(() => fn(Date.now()), 0)
  for (const [k, v] of Object.entries(preload)) w.localStorage.setItem(k, JSON.stringify(v))
  const tick = (ms) => new Promise((r) => setTimeout(r, ms))
  async function until(fn, ms = 2000, step = 20) {
    const end = Date.now() + ms
    for (;;) {
      let ok = false
      try {
        ok = fn()
      } catch {
        /* keep polling */
      }
      if (ok) return true
      if (Date.now() > end) return false
      await tick(step)
    }
  }
  return { w, tick, until, untilTrue: until, setStub(stub) { w.fetch = stub }, calls }
}

function workbenchStub(calls, opts = {}) {
  return async (url, init = {}) => {
    const u = String(url)
    calls.push({ u, method: init.method || 'GET', body: init.body })
    if (opts.failExternal) throw new TypeError('Failed to fetch')
    if (u === `${WB}/api/state`) {
      return {
        status: 200,
        ok: true,
        url: u,
        text: async () =>
          JSON.stringify({
            ok: true,
            topics: [{ id: 1 }, { id: 2 }],
            config: { llmConfigured: true, llmModel: 'mock', cookieSet: true },
          }),
      }
    }
    if (u.startsWith(`${WB}/api/topic?`)) {
      return { status: 200, ok: true, url: u, text: async () => JSON.stringify({ ok: true, topic: { id: 1 } }) }
    }
    if (u === `${WB}/api/analyze`) {
      const body = JSON.parse(init.body || '{}')
      if (body.topicIds?.[0] === 999) {
        return { status: 500, ok: false, url: u, text: async () => JSON.stringify({ ok: false, error: 'topic not found' }) }
      }
      return {
        status: 200,
        ok: true,
        url: u,
        text: async () => JSON.stringify({ ok: true, llm: { text: 'MOCK 分析结果' } }),
      }
    }
    return { status: 404, ok: false, url: u, text: async () => 'not found' }
  }
}

test('联动：健康探测上线提示 + 面板显示服务端摘要', async () => {
  const calls = []
  const { w, until } = makeSite()
  const stub = workbenchStub(calls)
  w.fetch = stub
  await load(w)

  assert.ok(await until(() => String(w.document.querySelector('.lsb-toast')?.textContent || '').includes('在线')), '上线 toast')

  const dbg = await w.LSB.bus.request('local-bridge:debug')
  const h = await dbg.health()
  assert.equal(h.online, true)
  assert.equal(h.state.config.llmModel, 'mock')

  // 面板渲染摘要
  w.LSB.open('local-bridge')
  const view = w.document.querySelector('.lsb-view').textContent
  assert.match(view, /在线/)
  assert.match(view, /LLM 已配置 \(mock\)/)
})

test('联动：浏览即预热 /api/topic；主楼按钮触发 analyze 且历史入账', async () => {
  const calls = []
  const { w, tick, until } = makeSite()
  w.fetch = workbenchStub(calls)
  await load(w)
  await tick(60)

  // 预热：当前帖 id=1
  assert.ok(calls.some((c) => c.u === `${WB}/api/topic?id=1` && c.method === 'GET'), '自动预热当前帖')

  const dbg = await w.LSB.bus.request('local-bridge:debug')
  assert.ok(dbg.buttons().some((b) => b.includes('本地分析')), '主楼按钮已注入')

  ;[...w.document.querySelectorAll('.lsb-op')].find((b) => b.textContent.includes('本地分析')).click()
  await until(() => dbg.history().length === 1 && dbg.history()[0].ok)

  const analyzeCall = calls.find((c) => c.u === `${WB}/api/analyze`)
  assert.ok(analyzeCall, 'analyze 已调用')
  assert.equal(analyzeCall.method, 'POST')
  assert.deepEqual(JSON.parse(analyzeCall.body).topicIds, [1])

  // RPC 复用入口
  await w.LSB.bus.request('local-bridge:analyze', { topicId: 42, mode: 'local' })
  const second = calls.filter((c) => c.u === `${WB}/api/analyze`).pop()
  assert.deepEqual(JSON.parse(second.body), { mode: 'local', topicIds: [42] })
  assert.equal(dbg.history().length, 2)
})

test('联动：离线时按钮失败入账且给出错误信息', async () => {
  const { w } = makeSite()
  // 显式离线 stub：模拟浏览器拒绝连接本机端口
  w.fetch = async () => {
    throw new TypeError('Failed to fetch')
  }
  await load(w)
  const dbg = await w.LSB.bus.request('local-bridge:debug')
  const h = await dbg.health()
  assert.equal(h.online, false)
  assert.match(h.error, /Failed to fetch|fetch failed|HTTP|ECONN/i)

  await assert.rejects(() => dbg.analyze(1))
  const hist = dbg.history()
  assert.equal(hist.length, 1)
  assert.equal(hist[0].ok, false)
})

async function load(w) {
  w.eval(baseCode)
  w.eval(plugCode)
  await new Promise((r) => setTimeout(r, 40))
}
