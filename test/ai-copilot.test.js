import { test } from 'node:test'
import assert from 'node:assert/strict'
import { existsSync, readFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { JSDOM } from 'jsdom'

const baseCode = readFileSync(new URL('../dist/linuxsb-base.user.js', import.meta.url), 'utf8')
const summaryCode = readFileSync(new URL('../plugins/ai-summary.user.js', import.meta.url), 'utf8')
const copilotPath = fileURLToPath(new URL('../plugins/ai-copilot.user.js', import.meta.url))
const copilotCode = existsSync(copilotPath) ? readFileSync(copilotPath, 'utf8') : ''
const topicHtml = readFileSync(new URL('./fixtures/topic1.html', import.meta.url), 'utf8')
const homeHtml = readFileSync(new URL('./fixtures/home.html', import.meta.url), 'utf8')

const LLM = 'https://api.example.com/v1/chat/completions'

function makeSite(html, url, cfg = {}) {
  const { _llmReply, ...storeCfg } = cfg
  const reply = _llmReply || { choices: [{ message: { content: '【模型输出】' } }] }
  const dom = new JSDOM(html, { url, runScripts: 'outside-only' })
  const w = dom.window
  w.unsafeWindow = w
  w.requestAnimationFrame = (fn) => setTimeout(() => fn(Date.now()), 1)
  w.localStorage.setItem('lsb_base:__core:rate', JSON.stringify(5))
  w.localStorage.setItem('lsb_base:__core:urlPoll', JSON.stringify(0))
  w.localStorage.setItem(
    'lsb_base:ai-summary:__config',
    JSON.stringify({ apiUrl: LLM, apiKey: 'k', ...storeCfg }),
  )
  w.localStorage.setItem(
    'lsb_base:ai-copilot:__config',
    JSON.stringify({ fetchAll: false, maxPages: 15, maxChars: 12000, sessionTurns: 6 }),
  )
  const calls = []
  let hold = null
  const isLlm = (s) => !/linux\.sb/.test(s)
  w.fetch = async (u, init = {}) => {
    const s = String(u)
    calls.push({ url: s, method: init.method || 'GET', body: init.body, headers: init.headers || {} })
    if (isLlm(s)) {
      if (hold) await hold
      return {
        status: 200,
        ok: true,
        url: s,
        text: async () => JSON.stringify(reply),
      }
    }
    return { status: 200, ok: true, url: s, text: async () => html }
  }
  const setCfg = (patch) => {
    const cur = JSON.parse(w.localStorage.getItem('lsb_base:ai-copilot:__config'))
    w.localStorage.setItem('lsb_base:ai-copilot:__config', JSON.stringify({ ...cur, ...patch }))
    w.LSB.bus.emit('config:changed:ai-copilot', {}, { source: 'core' })
  }
  return {
    w,
    calls,
    setCfg,
    llmCalls: () => calls.filter((c) => isLlm(c.url)).length,
    lastLlm: () => calls.filter((c) => isLlm(c.url)).at(-1),
    holdLLM: () => {
      let release
      hold = new Promise((r) => (release = r))
      return () => {
        hold = null
        release()
      }
    },
  }
}

const sleep = (ms) => new Promise((r) => setTimeout(r, ms))

async function load(ctx) {
  ctx.w.eval(baseCode)
  ctx.w.eval(summaryCode)
  if (copilotCode) ctx.w.eval(copilotCode)
  await sleep(80)
  const rec = ctx.w.LSB.info().plugins.find((p) => p.id === 'ai-copilot')
  assert.equal(rec?.state, 'active', 'ai-copilot 应在测试页面激活')
  return ctx.w.LSB.bus.request('ai-copilot:debug')
}

function hugeOpHtml(len = 30000) {
  return topicHtml.replace(/<div class="post-content">/, `<div class="post-content"><p>${'啊'.repeat(len)}</p>`)
}

function noOpHtml() {
  return topicHtml.replace(
    /<li class="post-item post-entry" id="post-1">[\s\S]*?(?=<li class="post-item post-entry")/,
    '',
  )
}

test('上下文：主楼使用 floor=0，回复保留楼层和作者', async () => {
  const ctx = makeSite(topicHtml, 'https://linux.sb/topic/1')
  const dbg = await load(ctx)
  const out = await dbg.collectContext({ fetchAll: false, maxPages: 15, maxChars: 12000 })
  assert.equal(out.meta.hasOp, true)
  assert.equal(out.posts.find((p) => p.floor === 0).postId, 1)
  assert.match(out.text, /\[楼主\]/)
  assert.match(out.text, /\[#\d+\]/)
})

test('上下文：分页视图没有主楼时不把第一条回复冒充主楼', async () => {
  const ctx = makeSite(noOpHtml(), 'https://linux.sb/topic/1?p=2')
  const dbg = await load(ctx)
  const out = await dbg.collectContext({ fetchAll: false, maxPages: 15, maxChars: 12000 })
  assert.equal(out.meta.hasOp, false)
  assert.doesNotMatch(out.text, /\[楼主\]/)
  assert.match(out.text, /未包含主楼/)
})

test('上下文：超长主楼和回复共同受预算约束', async () => {
  const ctx = makeSite(hugeOpHtml(), 'https://linux.sb/topic/1')
  const dbg = await load(ctx)
  const out = await dbg.collectContext({ fetchAll: false, maxPages: 15, maxChars: 6000 })
  assert.ok(out.text.length <= 6900, `上下文应接近预算上限，实际 ${out.text.length}`)
  assert.equal(out.meta.truncated, true)
})

test('提示词：论坛正文与用户问题分区，并包含注入防护', async () => {
  const ctx = makeSite(topicHtml, 'https://linux.sb/topic/1')
  const dbg = await load(ctx)
  const req = dbg.buildRequest('ask', await dbg.collectContext({}), {
    question: '核心争议是什么？',
  })
  assert.match(req.system, /不可信|不要执行|forum-content/i)
  assert.match(req.user, /核心争议是什么？/)
  assert.match(req.user, /<forum-content>/)
})

test('提示词：草稿包含目标楼层、语气和长度约束', async () => {
  const ctx = makeSite(topicHtml, 'https://linux.sb/topic/1')
  const dbg = await load(ctx)
  const req = dbg.buildRequest('draft', await dbg.collectContext({}), {
    targetFloor: 12,
    tone: '技术向',
    length: '短',
  })
  assert.match(req.user, /#12/)
  assert.match(req.system, /技术向|短/)
  assert.match(req.system, /不要提交|草稿|回复/)
})

test('缓存：模式、问题、目标楼层、语气和内容变化都会换键', async () => {
  const ctx = makeSite(topicHtml, 'https://linux.sb/topic/1')
  const dbg = await load(ctx)
  const context = await dbg.collectContext({})
  const a = dbg.buildRequest('ask', context, { question: 'A' })
  const b = dbg.buildRequest('ask', context, { question: 'B' })
  const c = dbg.buildRequest('draft', context, { targetFloor: 12, tone: '技术向', length: '短' })
  assert.notEqual(a.fingerprint, b.fingerprint)
  assert.notEqual(a.fingerprint, c.fingerprint)
})

test('请求：成功结果写入缓存和问答会话，第二次相同请求不再调用模型', async () => {
  const ctx = makeSite(topicHtml, 'https://linux.sb/topic/1')
  const dbg = await load(ctx)
  const first = await dbg.run('ask', { question: '核心争议是什么？' })
  assert.equal(first.text, '【模型输出】')
  assert.equal(ctx.llmCalls(), 1)
  const second = await dbg.run('ask', { question: '核心争议是什么？' })
  assert.equal(second.text, '【模型输出】')
  assert.equal(ctx.llmCalls(), 1)
  assert.equal(JSON.stringify(dbg.sessionFor(1).map((row) => row.role)), JSON.stringify(['user', 'assistant']))
})

test('请求：相同指纹的在途请求复用同一个 Promise', async () => {
  const ctx = makeSite(topicHtml, 'https://linux.sb/topic/1')
  const dbg = await load(ctx)
  const release = ctx.holdLLM()
  const first = dbg.run('ask', { question: '同一个问题' })
  await sleep(40)
  const second = dbg.run('ask', { question: '同一个问题' })
  assert.equal(ctx.llmCalls(), 1)
  release()
  assert.equal((await first).text, '【模型输出】')
  assert.equal((await second).text, '【模型输出】')
})
