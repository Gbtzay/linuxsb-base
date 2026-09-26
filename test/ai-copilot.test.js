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
async function until(fn, ms = 2000) {
  const end = Date.now() + ms
  for (;;) {
    try {
      if (fn()) return true
    } catch {
      /* keep polling */
    }
    if (Date.now() > end) return false
    await sleep(15)
  }
}

async function load(ctx, { active = true } = {}) {
  ctx.w.eval(baseCode)
  ctx.w.eval(summaryCode)
  if (copilotCode) ctx.w.eval(copilotCode)
  await sleep(80)
  const rec = ctx.w.LSB.info().plugins.find((p) => p.id === 'ai-copilot')
  if (active) assert.equal(rec?.state, 'active', 'ai-copilot 应在测试页面激活')
  return active ? ctx.w.LSB.bus.request('ai-copilot:debug') : rec
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

test('UI：帖子页显示副驾入口，首页不显示', async () => {
  const topic = makeSite(topicHtml, 'https://linux.sb/topic/1')
  await load(topic)
  assert.ok(topic.w.document.querySelector('.lsb-ai-copilot-top'))
  assert.ok([...topic.w.document.querySelectorAll('.lsb-op')].some((b) => /AI 副驾/.test(b.textContent)))

  const home = makeSite(homeHtml, 'https://linux.sb/')
  await load(home, { active: false })
  assert.equal(home.w.document.querySelector('.lsb-ai-copilot-top'), null)
})

test('UI：问答发送后显示结果并保留复制按钮', async () => {
  const ctx = makeSite(topicHtml, 'https://linux.sb/topic/1')
  await load(ctx)
  ctx.w.document.querySelector('.lsb-ai-copilot-top').click()
  const panel = ctx.w.document.querySelector('.lsb-copilot-panel')
  panel.querySelector('[data-mode="ask"]').click()
  panel.querySelector('[data-question]').value = '核心争议是什么？'
  panel.querySelector('[data-send]').click()
  assert.ok(await until(() => ctx.w.document.querySelector('.lsb-copilot-result')))
  assert.ok(ctx.w.document.querySelector('[data-copy]'))
})

test('UI：重新生成会绕过相同缓存再次请求模型', async () => {
  const ctx = makeSite(topicHtml, 'https://linux.sb/topic/1')
  await load(ctx)
  ctx.w.document.querySelector('.lsb-ai-copilot-top').click()
  let panel = ctx.w.document.querySelector('.lsb-copilot-panel')
  panel.querySelector('[data-question]').value = '核心争议是什么？'
  panel.querySelector('[data-send]').click()
  assert.ok(await until(() => ctx.w.document.querySelector('.lsb-copilot-result')))
  assert.equal(ctx.llmCalls(), 1)

  ctx.w.document.querySelector('[data-again]').click()
  assert.ok(await until(() => ctx.w.document.querySelector('.lsb-copilot-wait')))
  assert.ok(await until(() => ctx.w.document.querySelector('.lsb-copilot-result')))
  assert.equal(ctx.llmCalls(), 2)
})

test('UI：错误面板的重试会再次发起模型请求', async () => {
  const ctx = makeSite(topicHtml, 'https://linux.sb/topic/1', { _llmReply: { choices: [] } })
  await load(ctx)
  ctx.w.document.querySelector('.lsb-ai-copilot-top').click()
  const panel = ctx.w.document.querySelector('.lsb-copilot-panel')
  panel.querySelector('[data-question]').value = '核心争议是什么？'
  panel.querySelector('[data-send]').click()
  assert.ok(await until(() => ctx.w.document.querySelector('.lsb-copilot-error')))
  assert.equal(ctx.llmCalls(), 1)

  ctx.w.document.querySelector('[data-retry]').click()
  assert.ok(await until(() => ctx.w.document.querySelector('.lsb-copilot-wait')))
  assert.ok(await until(() => ctx.w.document.querySelector('.lsb-copilot-error') && ctx.llmCalls() === 2))
})

test('证据：模型引用的已知楼层渲染为站内链接，并保留原文复制', async () => {
  const ctx = makeSite(topicHtml, 'https://linux.sb/topic/1', {
    _llmReply: { choices: [{ message: { content: '结论来自 [#12]。' } }] },
  })
  const dbg = await load(ctx)
  const context = await dbg.collectContext({})
  const floor12 = context.posts.find((post) => post.floor === 12)
  assert.ok(floor12, '夹具应包含 #12 楼')
  const record = await dbg.run('ask', { question: '依据是什么？' })
  assert.equal(record.meta.citations[0].floor, 12)
  ctx.w.document.querySelector('.lsb-ai-copilot-top').click()
  const panel = ctx.w.document.querySelector('.lsb-copilot-panel')
  panel.querySelector('[data-question]').value = '依据是什么？'
  panel.querySelector('[data-send]').click()
  assert.ok(await until(() => ctx.w.document.querySelector('.lsb-copilot-result')))
  const citation = ctx.w.document.querySelector('[data-citation-floor="12"]')
  assert.equal(citation?.tagName, 'A')
  assert.match(citation.getAttribute('href'), new RegExp(`#post-${floor12.postId}$`))
  assert.match(ctx.w.document.querySelector('.lsb-copilot-result').textContent, /结论来自/)
})

test('证据：未知楼层显示范围外提示，不信任模型提供的链接', async () => {
  const ctx = makeSite(topicHtml, 'https://linux.sb/topic/1', {
    _llmReply: { choices: [{ message: { content: '请看 [#999]。' } }] },
  })
  const dbg = await load(ctx)
  await dbg.run('ask', { question: '有没有引用？' })
  ctx.w.document.querySelector('.lsb-ai-copilot-top').click()
  const panel = ctx.w.document.querySelector('.lsb-copilot-panel')
  panel.querySelector('[data-question]').value = '有没有引用？'
  panel.querySelector('[data-send]').click()
  assert.ok(await until(() => ctx.w.document.querySelector('[data-citation-floor="999"]')))
  const citation = ctx.w.document.querySelector('[data-citation-floor="999"]')
  assert.notEqual(citation.tagName, 'A')
  assert.match(citation.textContent, /当前采集范围没有此楼层/)
  assert.equal(citation.querySelector('a'), null)
})

test('新回复：首次建立当前楼层起点，实时新增楼层进入待摘要队列', async () => {
  const ctx = makeSite(topicHtml, 'https://linux.sb/topic/1')
  const dbg = await load(ctx)
  assert.equal(JSON.stringify(dbg.digestState(1).pending), '[]')
  ctx.w.LSB.bus.emit(
    'topic:posts-added',
    [{ postId: 9999, floor: 51, authorName: '新用户', content: '最新回复', ts: 1787000000 }],
    { source: 'test', raw: true },
  )
  assert.deepEqual([...dbg.digestState(1).pending.map((post) => post.floor)], [51])
  const context = await dbg.collectContext({})
  const req = dbg.buildRequest('digest', context, { newPosts: dbg.digestState(1).pending })
  assert.match(req.user, /<new-replies>/)
  assert.match(req.user, /最新回复/)
  assert.doesNotMatch(req.user, /打造更新的理想型社区/)
})

test('新回复：成功摘要后清空队列，模型失败则保留队列', async () => {
  const ctx = makeSite(topicHtml, 'https://linux.sb/topic/1', {
    _llmReply: { choices: [{ message: { content: '新回复已处理 [#51]' } }] },
  })
  const dbg = await load(ctx)
  ctx.w.LSB.bus.emit(
    'topic:posts-added',
    [{ postId: 9999, floor: 51, authorName: '新用户', content: '最新回复', ts: 1787000000 }],
    { source: 'test', raw: true },
  )
  const record = await dbg.run('digest')
  assert.match(record.text, /新回复已处理/)
  assert.equal(JSON.stringify(dbg.digestState(1).pending), '[]')

  const bad = makeSite(topicHtml, 'https://linux.sb/topic/1', { _llmReply: { choices: [] } })
  const badDbg = await load(bad)
  bad.w.LSB.bus.emit(
    'topic:posts-added',
    [{ postId: 9999, floor: 51, authorName: '新用户', content: '最新回复', ts: 1787000000 }],
    { source: 'test', raw: true },
  )
  await assert.rejects(() => badDbg.run('digest'))
  assert.deepEqual([...badDbg.digestState(1).pending.map((post) => post.floor)], [51])
})

test('UI：新回复模式显示待处理数量，可手动设为新起点', async () => {
  const ctx = makeSite(topicHtml, 'https://linux.sb/topic/1')
  const dbg = await load(ctx)
  ctx.w.LSB.bus.emit(
    'topic:posts-added',
    [{ postId: 9999, floor: 51, authorName: '新用户', content: '最新回复', ts: 1787000000 }],
    { source: 'test', raw: true },
  )
  ctx.w.document.querySelector('.lsb-ai-copilot-top').click()
  const panel = ctx.w.document.querySelector('.lsb-copilot-panel')
  panel.querySelector('[data-mode="digest"]').click()
  assert.match(panel.textContent, /待处理 1 条|1 条新回复/)
  panel.querySelector('[data-new-mark]').click()
  assert.equal(JSON.stringify(dbg.digestState(1).pending), '[]')
  assert.equal(ctx.llmCalls(), 0)
})

test('UI：草稿模式只提供复制，不提供发送站内回复动作', async () => {
  const ctx = makeSite(topicHtml, 'https://linux.sb/topic/1')
  await load(ctx)
  ctx.w.document.querySelector('.lsb-ai-copilot-top').click()
  const panel = ctx.w.document.querySelector('.lsb-copilot-panel')
  panel.querySelector('[data-mode="draft"]').click()
  assert.ok(panel.querySelector('[data-target-floor]'))
  assert.equal([...panel.querySelectorAll('button')].some((b) => /发送回复|提交回复/.test(b.textContent)), false)
})

test('路由：旧主题请求完成后不覆盖新主题面板', async () => {
  const ctx = makeSite(topicHtml, 'https://linux.sb/topic/1')
  await load(ctx)
  ctx.w.document.querySelector('.lsb-ai-copilot-top').click()
  const panel = ctx.w.document.querySelector('.lsb-copilot-panel')
  panel.querySelector('[data-question]').value = '旧主题'
  const release = ctx.holdLLM()
  panel.querySelector('[data-send]').click()
  assert.ok(await until(() => ctx.w.document.querySelector('.lsb-copilot-wait')))
  ctx.w.LSB.bus.emit(
    'route:changed',
    { href: 'https://linux.sb/topic/2', page: { type: 'topic', id: 2 } },
    { source: 'core' },
  )
  release()
  await sleep(100)
  assert.equal(ctx.w.document.querySelector('.lsb-copilot-result'), null)
})

test('M2 提示词：观点分歧包含观点字段、引用和未知项约束', async () => {
  const ctx = makeSite(topicHtml, 'https://linux.sb/topic/1')
  const dbg = await load(ctx)
  const req = dbg.buildRequest('analyze', await dbg.collectContext({}), { preset: '观点分歧' })
  assert.equal(req.meta.analysisKind, '观点分歧')
  assert.equal(req.meta.analysisVersion, '1')
  assert.match(req.system, /## 主要观点/)
  assert.match(req.system, /反驳或限制/)
  assert.match(req.system, /[#]N/)
  assert.match(req.system, /未知|未验证/)
  assert.match(req.user, /<forum-content>/)
})

test('M2 提示词：方案对比包含证据、风险、条件和选择建议', async () => {
  const ctx = makeSite(topicHtml, 'https://linux.sb/topic/1')
  const dbg = await load(ctx)
  const req = dbg.buildRequest('analyze', await dbg.collectContext({}), { preset: '方案对比' })
  assert.equal(req.meta.analysisKind, '方案对比')
  assert.match(req.system, /## 方案对比/)
  assert.match(req.system, /已验证/)
  assert.match(req.system, /风险或限制/)
  assert.match(req.system, /适用条件/)
  assert.match(req.system, /## 选择建议/)
  assert.match(req.system, /无法判断|未知|未验证/)
  assert.match(req.user, /<forum-content>/)
})

test('M2 缓存：分析预设与分析协议版本参与指纹', async () => {
  const ctx = makeSite(topicHtml, 'https://linux.sb/topic/1')
  const dbg = await load(ctx)
  const context = await dbg.collectContext({})
  const a = dbg.buildRequest('analyze', context, { preset: '观点分歧' })
  const b = dbg.buildRequest('analyze', context, { preset: '方案对比' })
  assert.notEqual(a.fingerprint, b.fingerprint)
  assert.equal(dbg.analysisVersion, '1')
  assert.equal(a.meta.analysisVersion, '1')
})

test('M2 记录：保存分析类型、协议版本和引用数量', async () => {
  const ctx = makeSite(topicHtml, 'https://linux.sb/topic/1', {
    _llmReply: { choices: [{ message: { content: '## 结论\n依据 [#12]' } }] },
  })
  const dbg = await load(ctx)
  const record = await dbg.run('analyze', { preset: '观点分歧' })
  assert.equal(record.meta.analysisKind, '观点分歧')
  assert.equal(record.meta.analysisVersion, '1')
  assert.equal(record.meta.citationCount, 1)
  assert.equal(record.meta.citations[0].floor, 12)
})

test('M2 UI：观点分歧和方案对比按钮存在并显示结构化结果', async () => {
  const ctx = makeSite(topicHtml, 'https://linux.sb/topic/1', {
    _llmReply: { choices: [{ message: { content: '## 结论\n采用方案 A，依据 [#12]' } }] },
  })
  await load(ctx)
  ctx.w.document.querySelector('.lsb-ai-copilot-top').click()
  const panel = ctx.w.document.querySelector('.lsb-copilot-panel')
  panel.querySelector('[data-mode="analyze"]').click()
  assert.ok(panel.querySelector('[data-preset="观点分歧"]'))
  assert.ok(panel.querySelector('[data-preset="方案对比"]'))
  panel.querySelector('[data-preset="观点分歧"]').click()
  assert.ok(await until(() => ctx.w.document.querySelector('.lsb-copilot-result')))
  assert.match(ctx.w.document.querySelector('.lsb-copilot-result').textContent, /采用方案 A/)
  assert.match(ctx.w.document.querySelector('.lsb-copilot-facts').textContent, /观点分歧|引用 1/)
  assert.ok(ctx.w.document.querySelector('[data-citation-floor="12"]'))
})

test('M2 UI：模型未遵循标题格式时仍显示原文和引用', async () => {
  const ctx = makeSite(topicHtml, 'https://linux.sb/topic/1', {
    _llmReply: { choices: [{ message: { content: '只有一句普通文本，依据 [#12]' } }] },
  })
  const dbg = await load(ctx)
  const record = await dbg.run('analyze', { preset: '方案对比' })
  assert.match(record.text, /只有一句普通文本/)
  assert.equal(record.meta.citations[0].known, true)
})
