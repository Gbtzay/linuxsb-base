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
  const controls = { failTopicPages: false }
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
    if (controls.failTopicPages && /\/topic\/[^?]+\?p=/.test(s)) {
      return { status: 500, ok: false, url: s, text: async () => '分页失败' }
    }
    return { status: 200, ok: true, url: s, text: async () => html }
  }
  const setCfg = (patch) => {
    const cur = JSON.parse(w.localStorage.getItem('lsb_base:ai-copilot:__config'))
    w.localStorage.setItem('lsb_base:ai-copilot:__config', JSON.stringify({ ...cur, ...patch }))
    w.LSB.bus.emit('config:changed:ai-copilot', {}, { source: 'core' })
  }
  const result = {
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
  Object.defineProperty(result, 'failTopicPages', {
    get: () => controls.failTopicPages,
    set: (value) => {
      controls.failTopicPages = Boolean(value)
    },
  })
  return result
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

test('路由：旧主题追踪重扫完成后不覆盖新主题面板', async () => {
  const ctx = makeSite(topicHtml, 'https://linux.sb/topic/1')
  const dbg = await load(ctx)
  const issue = dbg.createTrackingIssue(1, { title: '旧问题', question: '旧主题问题', floors: [12], excerpt: '依据' }, { fingerprint: 'f', analysisVersion: '2' })
  ctx.w.LSB.bus.emit('topic:posts-added', [{ postId: 9001, floor: 51, authorName: '新用户', content: '旧主题新证据', ts: 1 }], { source: 'test', raw: true })
  const originalFetch = ctx.w.fetch
  let release
  let resolveStarted
  const started = new Promise((resolve) => (resolveStarted = resolve))
  const held = new Promise((resolve) => (release = resolve))
  ctx.w.fetch = async (url, init = {}) => {
    if (/\/topic\/1\?p=2/.test(String(url))) {
      resolveStarted()
      await held
    }
    return originalFetch(url, init)
  }
  ctx.w.document.querySelector('.lsb-ai-copilot-top').click()
  const panel = ctx.w.document.querySelector('.lsb-copilot-panel')
  panel.querySelector('[data-mode="track"]').click()
  await started
  ctx.w.history.pushState({}, '', 'https://linux.sb/topic/2')
  ctx.w.dispatchEvent(new ctx.w.PopStateEvent('popstate'))
  await until(() => dbg.state().topicId === 2)
  release()
  await sleep(120)
  assert.equal(ctx.w.document.querySelector('.lsb-copilot-panel'), null)
  assert.equal(ctx.w.document.querySelector('[data-track-card]'), null)
  assert.notEqual(issue.id, '')
})

test('M2 提示词：观点分歧包含观点字段、引用和未知项约束', async () => {
  const ctx = makeSite(topicHtml, 'https://linux.sb/topic/1')
  const dbg = await load(ctx)
  const req = dbg.buildRequest('analyze', await dbg.collectContext({}), { preset: '观点分歧' })
  assert.equal(req.meta.analysisKind, '观点分歧')
  assert.equal(req.meta.analysisVersion, '2')
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
  assert.equal(dbg.analysisVersion, '2')
  assert.equal(a.meta.analysisVersion, '2')
})

test('M2 记录：保存分析类型、协议版本和引用数量', async () => {
  const ctx = makeSite(topicHtml, 'https://linux.sb/topic/1', {
    _llmReply: { choices: [{ message: { content: '## 结论\n依据 [#12]' } }] },
  })
  const dbg = await load(ctx)
  const record = await dbg.run('analyze', { preset: '观点分歧' })
  assert.equal(record.meta.analysisKind, '观点分歧')
  assert.equal(record.meta.analysisVersion, '2')
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

test('M3 协议：未解决问题输出可追踪字段并带分析版本', async () => {
  const ctx = makeSite(topicHtml, 'https://linux.sb/topic/1')
  const dbg = await load(ctx)
  const req = dbg.buildRequest('analyze', await dbg.collectContext({}), { preset: '未解决问题' })
  assert.equal(req.meta.analysisVersion, '2')
  assert.match(req.system, /## 未解决问题/)
  assert.match(req.system, /相关楼层|当前已知|缺少信息/)
  assert.match(req.fingerprint, /.+/)
})

test('M3 UI：结构化未解决问题结果显示开始追踪并写入本地状态', async () => {
  const ctx = makeSite(topicHtml, 'https://linux.sb/topic/1', {
    _llmReply: {
      choices: [{
        message: {
          content:
            '## 未解决问题\n### 问题 1：缓存\n- 问题：缓存是否会过期？\n- 相关楼层：[#12]\n- 当前已知：有缓存\n- 缺少信息：过期策略',
        },
      }],
    },
  })
  await load(ctx)
  ctx.w.document.querySelector('.lsb-ai-copilot-top').click()
  const panel = ctx.w.document.querySelector('.lsb-copilot-panel')
  panel.querySelector('[data-mode="analyze"]').click()
  panel.querySelector('[data-preset="未解决问题"]').click()
  assert.ok(await until(() => panel.querySelector('[data-track-issue-id]')))
  panel.querySelector('[data-track-issue-id]').click()
  const dbg = await ctx.w.LSB.bus.request('ai-copilot:debug')
  assert.equal(dbg.trackingState(1).items.length, 1)
})

test('M3 证据：实时楼层和重扫结果合并去重，只进入候选队列', async () => {
  const ctx = makeSite(topicHtml, 'https://linux.sb/topic/1')
  const dbg = await load(ctx)
  dbg.createTrackingIssue(1, { title: '问题', question: '问题文本', floors: [12], excerpt: '依据' }, { fingerprint: 'f', analysisVersion: '2' })
  const post = { postId: 9001, floor: 51, authorName: '新用户', content: '新增证据', ts: 1787000000 }
  ctx.w.LSB.bus.emit('topic:posts-added', [post], { source: 'test', raw: true })
  ctx.w.LSB.bus.emit('topic:posts-added', [post], { source: 'test', raw: true })
  const after = dbg.trackingState(1).items[0]
  assert.deepEqual(Array.from(after.pendingEvidence.map((item) => item.floor)), [51])
  assert.equal(after.status, '有新证据')
})

test('M3 证据：重扫失败不推进水位也不清空候选', async () => {
  const ctx = makeSite(topicHtml, 'https://linux.sb/topic/1')
  const dbg = await load(ctx)
  dbg.createTrackingIssue(1, { title: '问题', question: '问题文本', floors: [12], excerpt: '依据' }, { fingerprint: 'f', analysisVersion: '2' })
  ctx.w.LSB.bus.emit(
    'topic:posts-added',
    [{ postId: 9002, floor: 52, authorName: '新用户', content: '候选', ts: 1 }],
    { source: 'test', raw: true },
  )
  const before = dbg.trackingState(1).scan.lastFloor
  ctx.failTopicPages = true
  await assert.rejects(() => dbg.scanTrackingContext(1))
  assert.equal(dbg.trackingState(1).scan.lastFloor, before)
  assert.equal(dbg.trackingState(1).items[0].pendingEvidence.length, 1)
})

test('M3 复核：请求隔离追踪问题和新证据，禁止模型设置已确认解决', async () => {
  const ctx = makeSite(topicHtml, 'https://linux.sb/topic/1')
  const dbg = await load(ctx)
  dbg.createTrackingIssue(1, { title: '缓存', question: '缓存是否会过期？', floors: [12], excerpt: '依据' }, { fingerprint: 'f', analysisVersion: '2' })
  ctx.w.LSB.bus.emit(
    'topic:posts-added',
    [{ postId: 9001, floor: 51, authorName: '新用户', content: '缓存已清理', ts: 1 }],
    { source: 'test', raw: true },
  )
  const issue = dbg.trackingState(1).items[0]
  const req = dbg.buildRequest('track-review', await dbg.collectContext({}), { trackingItem: issue })
  assert.match(req.user, /<tracked-evidence>/)
  assert.match(req.user, /<new-evidence>/)
  assert.match(req.system, /已确认解决.*用户|不得.*已确认解决/)
  assert.equal(req.meta.trackingVersion, '2')
})

test('M3 复核：合法建议待确认，接受后才更新状态；非法建议不提供接受动作', async () => {
  const ctx = makeSite(topicHtml, 'https://linux.sb/topic/1', {
    _llmReply: {
      choices: [{
        message: {
          content:
            '## 追踪复核\n- 状态建议：可能已解决\n- 判断依据：新回复说明已清理 [#51]\n- 新增证据：[#51]\n- 仍需确认：复现条件',
        },
      }],
    },
  })
  const dbg = await load(ctx)
  const issue = dbg.createTrackingIssue(1, { title: '缓存', question: '缓存是否会过期？', floors: [12], excerpt: '依据' }, { fingerprint: 'f', analysisVersion: '2' })
  ctx.w.LSB.bus.emit(
    'topic:posts-added',
    [{ postId: 9001, floor: 51, authorName: '新用户', content: '缓存已清理', ts: 1 }],
    { source: 'test', raw: true },
  )
  const record = await dbg.reviewTrackingIssue(1, issue.id)
  assert.equal(record.suggestion.status, '可能已解决')
  assert.equal(dbg.trackingState(1).items[0].status, '有新证据')
  dbg.acceptTrackingSuggestion(1, issue.id)
  assert.equal(dbg.trackingState(1).items[0].status, '可能已解决')
  const invalid = dbg.parseTrackingSuggestion('- 状态建议：已确认解决\n- 新增证据：[#51]', [], issue)
  assert.equal(invalid.valid, false)
})

test('M3 复核：相同候选复用缓存，强制复核才再次请求；失败保留候选', async () => {
  const ctx = makeSite(topicHtml, 'https://linux.sb/topic/1', {
    _llmReply: {
      choices: [{
        message: {
          content: '## 追踪复核\n- 状态建议：仍未解决\n- 判断依据：仍缺少复现 [#51]\n- 新增证据：[#51]\n- 仍需确认：复现',
        },
      }],
    },
  })
  const dbg = await load(ctx)
  const issue = dbg.createTrackingIssue(1, { title: '缓存', question: '缓存是否会过期？', floors: [12], excerpt: '依据' }, { fingerprint: 'f', analysisVersion: '2' })
  ctx.w.LSB.bus.emit('topic:posts-added', [{ postId: 9001, floor: 51, authorName: '新用户', content: '缓存已清理', ts: 1 }], { source: 'test', raw: true })
  await dbg.reviewTrackingIssue(1, issue.id)
  await dbg.reviewTrackingIssue(1, issue.id)
  assert.equal(ctx.llmCalls(), 1)
  await dbg.reviewTrackingIssue(1, issue.id, { force: true })
  assert.equal(ctx.llmCalls(), 2)

  const bad = makeSite(topicHtml, 'https://linux.sb/topic/1', { _llmReply: { choices: [] } })
  const badDbg = await load(bad)
  const badIssue = badDbg.createTrackingIssue(1, { title: '缓存', question: '缓存是否会过期？', floors: [12], excerpt: '依据' }, { fingerprint: 'f', analysisVersion: '2' })
  bad.w.LSB.bus.emit('topic:posts-added', [{ postId: 9001, floor: 51, authorName: '新用户', content: '缓存已清理', ts: 1 }], { source: 'test', raw: true })
  await assert.rejects(() => badDbg.reviewTrackingIssue(1, badIssue.id))
  assert.equal(badDbg.trackingState(1).items[0].pendingEvidence.length, 1)
})

test('M3 UI：追踪页显式重扫不把历史楼层列为新证据，并可接受建议', async () => {
  const ctx = makeSite(topicHtml, 'https://linux.sb/topic/1', {
    _llmReply: {
      choices: [{
        message: {
          content: '## 追踪复核\n- 状态建议：可能已解决\n- 判断依据：新回复说明缓存已清理 [#51]\n- 新增证据：[#51]\n- 仍需确认：复现条件',
        },
      }],
    },
  })
  const dbg = await load(ctx)
  const issue = dbg.createTrackingIssue(1, { title: '缓存', question: '缓存是否会过期？', floors: [12], excerpt: '依据' }, { fingerprint: 'f', analysisVersion: '2' })
  ctx.w.LSB.bus.emit('topic:posts-added', [{ postId: 9001, floor: 51, authorName: '新用户', content: '缓存已清理', ts: 1 }], { source: 'test', raw: true })
  ctx.w.document.querySelector('.lsb-ai-copilot-top').click()
  const panel = ctx.w.document.querySelector('.lsb-copilot-panel')
  panel.querySelector('[data-mode="track"]').click()
  assert.ok(await until(() => panel.querySelector('[data-track-card]')))
  assert.ok(await until(() => !panel.querySelector('[data-track-scan-status]')?.textContent.includes('重扫中')))
  assert.match(panel.textContent, /有新证据/)
  assert.deepEqual(Array.from(dbg.trackingState(1).items[0].pendingEvidence.map((item) => item.floor)), [51])

  panel.querySelector('[data-track-review]').click()
  assert.ok(await until(() => panel.querySelector('[data-track-accept]')))
  assert.ok(panel.querySelector('[data-track-dismiss]'))
  assert.equal(ctx.llmCalls(), 1)
  panel.querySelector('[data-track-accept]').click()
  assert.ok(await until(() => dbg.trackingState(1).items[0].status === '可能已解决'))
  assert.equal(dbg.trackingState(1).items[0].pendingEvidence.length, 0)

  panel.querySelector('[data-track-confirm]').click()
  const confirm = await until(() => ctx.w.document.querySelector('.lsb-panel [data-yes]'))
  assert.ok(confirm)
  ctx.w.document.querySelector('.lsb-panel [data-yes]').click()
  assert.ok(await until(() => dbg.trackingState(1).items[0].status === '已确认解决'))
})

test('M3 状态：缺失存储返回空集合，保存后按主题隔离', async () => {
  const ctx = makeSite(topicHtml, 'https://linux.sb/topic/1')
  const dbg = await load(ctx)
  assert.equal(dbg.trackingState(1).items.length, 0)
  const saved = dbg.createTrackingIssue(1, {
    title: '缓存问题',
    question: '缓存是否会过期？',
    floors: [12],
    excerpt: '依据 [#12]',
  }, { fingerprint: 'f1', analysisVersion: '2' })
  assert.equal(saved.status, '待验证')
  assert.equal(dbg.trackingState(1).items.length, 1)
  assert.equal(dbg.trackingState(2).items.length, 0)
})

test('M3 状态：相同问题和基线楼层幂等，不重复建立追踪项', async () => {
  const ctx = makeSite(topicHtml, 'https://linux.sb/topic/1')
  const dbg = await load(ctx)
  const seed = { title: '问题', question: '同一个问题', floors: [12, 18], excerpt: '依据' }
  const a = dbg.createTrackingIssue(1, seed, { fingerprint: 'f1', analysisVersion: '2' })
  const b = dbg.createTrackingIssue(1, seed, { fingerprint: 'f2', analysisVersion: '2' })
  assert.equal(a.id, b.id)
  assert.equal(dbg.trackingState(1).items.length, 1)
})

test('M3 解析：只接受有问题文本和本地楼层的固定问题块', async () => {
  const ctx = makeSite(topicHtml, 'https://linux.sb/topic/1')
  const dbg = await load(ctx)
  const citations = [{ floor: 12, postId: 12, excerpt: '已知证据', known: true }]
  const out = dbg.parseUnresolvedIssues(
    '## 未解决问题\n### 问题 1：缓存\n- 问题：缓存是否会过期？\n- 相关楼层：[#12]\n- 当前已知：有缓存\n- 缺少信息：过期策略\n' +
      '### 问题 2：无引用\n- 问题：没有本地依据\n- 相关楼层：[#999]\n',
    citations,
  )
  assert.equal(out.length, 1)
  assert.equal(out[0].question, '缓存是否会过期？')
  assert.deepEqual(Array.from(out[0].floors), [12])
})

test('M3.1 状态：v1 追踪项迁移到 v2 且保留问题、证据和建议', async () => {
  const ctx = makeSite(topicHtml, 'https://linux.sb/topic/1')
  ctx.w.localStorage.setItem('lsb_base:ai-copilot:track:1', JSON.stringify({
    version: '1', topicId: 1,
    scan: { seenKeys: ['id:12'], lastFloor: 12, ts: 10 },
    items: [{ id: 'issue-old', question: '旧问题', status: '有新证据',
      source: { floors: [12], excerpt: '旧依据' },
      evidence: [{ key: 'id:12', postId: 12, floor: 12, excerpt: '旧证据' }],
      pendingEvidence: [], suggestion: null, createdAt: 10, updatedAt: 20 }],
  }))
  const dbg = await load(ctx)
  const state = dbg.trackingState(1)
  assert.equal(dbg.trackingVersion, '2')
  assert.equal(state.version, '2')
  assert.equal(state.items[0].archivedAt, 0)
  assert.deepEqual(Array.from(state.items[0].evidence.map((row) => row.key)), ['id:12'])
})

test('M4 协议：旧 v2 追踪状态可读，写入时补充 topicMeta 并进入主题目录', async () => {
  const ctx = makeSite(topicHtml, 'https://linux.sb/topic/1')
  const dbg = await load(ctx)
  ctx.w.localStorage.setItem('lsb_base:ai-copilot:track:7', JSON.stringify({
    version: '2', topicId: 7, scan: { seenKeys: [], lastFloor: 0, ts: 10 },
    items: [{ id: 'old', question: '旧问题', status: '待验证', source: { floors: [12] },
      evidence: [], pendingEvidence: [], suggestion: null, createdAt: 10, updatedAt: 20 }],
  }))
  const state = dbg.trackingState(7)
  assert.equal(state.items[0].question, '旧问题')
  assert.equal(state.topicMeta.id, 7)
  assert.equal(state.topicMeta.title, '主题 #7')
  assert.equal(state.topicMeta.forumName, '')
  const catalog = dbg.trackingTopicCatalog()
  assert.equal(catalog.find((row) => row.id === 7).activeCount, 1)
})

test('M4 计划：只接受白名单字段，非法值拒绝，未授权归档自动收窄', async () => {
  const ctx = makeSite(topicHtml, 'https://linux.sb/topic/1')
  const dbg = await load(ctx)
  const catalog = dbg.trackingTopicCatalog()
  const plan = dbg.normalizeConsolePlan({
    version: 1, intent: 'status-summary', includeCurrentTopic: true,
    includeArchived: true, statuses: [], topicIds: [], terms: [],
  }, { question: '汇总活动追踪项', catalog, currentTopicId: 1 })
  assert.equal(plan.includeArchived, false)
  assert.throws(() => dbg.normalizeConsolePlan({ version: 1, intent: 'question', write: true },
    { question: '查问题', catalog, currentTopicId: 1 }), /计划字段|未知字段/)
  assert.throws(() => dbg.normalizeConsolePlan({ version: 1, intent: 'question', includeCurrentTopic: true,
    includeArchived: false, statuses: ['未知状态'], topicIds: [], terms: [] },
    { question: '查问题', catalog, currentTopicId: 1 }), /状态/)
  const archived = dbg.normalizeConsolePlan({ version: 1, intent: 'question', includeCurrentTopic: false,
    includeArchived: true, statuses: [], topicIds: [], terms: [] },
    { question: '请包含已归档追踪项', catalog, currentTopicId: 1 })
  assert.equal(archived.includeArchived, true)
})

test('M4 执行器：组合筛选活动项、关键词、意图并稳定截断', async () => {
  const ctx = makeSite(topicHtml, 'https://linux.sb/topic/1')
  const dbg = await load(ctx)
  ctx.w.localStorage.setItem('lsb_base:ai-copilot:track:2', JSON.stringify({
    version: '2', topicId: 2,
    topicMeta: { id: 2, title: '第二主题', forumName: '技术' },
    scan: { seenKeys: [], lastFloor: 0, ts: 30 },
    items: [
      { id: 'active', question: '缓存刷新', status: '有新证据', updatedAt: 30, archivedAt: 0,
        source: { floors: [3], excerpt: '刷新' }, evidence: [], pendingEvidence: [] },
      { id: 'archived', question: '旧缓存', status: '仍未解决', updatedAt: 40, archivedAt: 40,
        source: { floors: [4], excerpt: '旧' }, evidence: [], pendingEvidence: [] },
    ],
  }))
  const result = dbg.executeConsolePlan({ version: 1, intent: 'unresolved', includeCurrentTopic: false,
    includeArchived: false, statuses: [], topicIds: [2], terms: ['刷新'] }, {
    catalog: dbg.trackingTopicCatalog(), currentTopic: null, currentPosts: [],
  })
  assert.deepEqual(Array.from(result.items.map((item) => item.id)), ['active'])
  assert.equal(result.includedArchived, false)
  assert.equal(result.truncated, false)
})

test('M3.1 生命周期：归档停止收集，恢复后继续收集新证据', async () => {
  const ctx = makeSite(topicHtml, 'https://linux.sb/topic/1')
  const dbg = await load(ctx)
  const issue = dbg.createTrackingIssue(1, { question: '问题', floors: [12], excerpt: '依据' })
  dbg.archiveTrackingItems(1, [issue.id])
  ctx.w.LSB.bus.emit('topic:posts-added', [{ postId: 9001, floor: 51, content: '归档期间证据' }])
  assert.equal(dbg.trackingState(1).items[0].pendingEvidence.length, 0)
  dbg.restoreTrackingItems(1, [issue.id])
  ctx.w.LSB.bus.emit('topic:posts-added', [{ postId: 9002, floor: 52, content: '恢复后证据' }])
  const current = dbg.trackingState(1).items[0]
  assert.deepEqual(Array.from(current.pendingEvidence.map((row) => row.floor)), [52])
  assert.ok(current.history.some((row) => row.type === 'archived'))
  assert.ok(current.history.some((row) => row.type === 'restored'))
})

test('M3.1 状态：未知追踪版本不被覆盖并显示重新建立提示', async () => {
  const ctx = makeSite(topicHtml, 'https://linux.sb/topic/1')
  ctx.w.localStorage.setItem('lsb_base:ai-copilot:track:1', JSON.stringify({ version: '99', topicId: 1, items: [{ question: '不要丢失' }] }))
  const dbg = await load(ctx)
  assert.equal(dbg.trackingState(1).items.length, 0)
  assert.equal(dbg.trackingState(1).unsupportedVersion, '99')
  ctx.w.document.querySelector('.lsb-ai-copilot-top').click()
  const panel = ctx.w.document.querySelector('.lsb-copilot-panel')
  panel.querySelector('[data-mode="track"]').click()
  assert.ok(await until(() => /重新建立追踪项/.test(panel.textContent)), panel.textContent)
  assert.match(ctx.w.localStorage.getItem('lsb_base:ai-copilot:track:1'), /"version":"99"/)
})

test('M3.1 导出：JSON、Markdown、问题 CSV 和证据 CSV 包含活动与归档数据', async () => {
  const ctx = makeSite(topicHtml, 'https://linux.sb/topic/1')
  const dbg = await load(ctx)
  const issue = dbg.createTrackingIssue(1, { title: '缓存', question: '缓存会过期吗？', floors: [12], excerpt: '依据' })
  dbg.archiveTrackingItems(1, [issue.id])

  const payload = dbg.trackingExport(1)
  assert.equal(payload.schema, 'lsb-ai-copilot-tracking-export')
  assert.equal(payload.tracking.version, '2')
  assert.equal(JSON.parse(dbg.serializeTracking(1, 'json')).tracking.items.length, 1)
  assert.match(dbg.serializeTracking(1, 'markdown'), /缓存会过期吗？/)
  assert.match(dbg.serializeTracking(1, 'issues-csv'), /^\uFEFF/)
  assert.match(dbg.serializeTracking(1, 'evidence-csv'), /key|id:12/)
  assert.match(dbg.serializeTracking(1, 'markdown'), /已归档|归档/)
})

test('M3.1 导出：CSV 正确转义引号、逗号和换行，不泄露配置', async () => {
  const ctx = makeSite(topicHtml, 'https://linux.sb/topic/1')
  const dbg = await load(ctx)
  dbg.createTrackingIssue(1, { title: '含,逗号', question: '含"引号\n换行', floors: [12], excerpt: '摘要' })
  const csv = dbg.serializeTracking(1, 'issues-csv')
  assert.match(csv, /"含,逗号"/)
  assert.match(csv, /""引号/)
  assert.doesNotMatch(csv, /apiKey|api\.example\.com/)
})

test('M3.1 导入：预览不写入，确认后合并证据并保留本地较新状态', async () => {
  const ctx = makeSite(topicHtml, 'https://linux.sb/topic/1')
  const dbg = await load(ctx)
  const local = dbg.createTrackingIssue(1, { question: '问题', floors: [12], excerpt: '本地' })
  const incoming = {
    schema: 'lsb-ai-copilot-tracking-export', version: 1,
    topic: { id: 1, title: '当前主题', forumName: '版块' },
    tracking: {
      version: '2', topicId: 1, scan: { seenKeys: ['id:999'], lastFloor: 999 },
      items: [{ ...local, status: '可能已解决', updatedAt: 1,
        evidence: [...local.evidence, { key: 'id:9001', postId: 9001, floor: 51, excerpt: '导入证据' }] }],
    },
  }
  const before = dbg.trackingState(1)
  const preview = dbg.previewTrackingImport(1, JSON.stringify(incoming))
  assert.equal(preview.valid, true)
  assert.equal(dbg.trackingState(1).items[0].evidence.length, before.items[0].evidence.length)
  const result = dbg.applyTrackingImport(1, preview)
  assert.equal(result.evidenceMerged, 1)
  assert.equal(dbg.trackingState(1).items[0].status, '待验证')
  assert.equal(dbg.trackingState(1).scan.lastFloor, before.scan.lastFloor)
  assert.deepEqual(Array.from(dbg.trackingState(1).items[0].evidence.map((row) => row.key)), ['floor:12', 'id:9001'])
})

test('M3.1 导入：跨主题、坏 JSON、超大文件和非法协议不写入', async () => {
  const ctx = makeSite(topicHtml, 'https://linux.sb/topic/1')
  const dbg = await load(ctx)
  const invalid = [
    '{坏 JSON',
    JSON.stringify({ schema: 'other', version: 1 }),
    JSON.stringify({ schema: 'lsb-ai-copilot-tracking-export', version: 1, topic: { id: 2 }, tracking: {} }),
    'x'.repeat(5 * 1024 * 1024 + 1),
  ]
  for (const text of invalid) {
    assert.equal(dbg.previewTrackingImport(1, text).valid, false)
    assert.equal(dbg.trackingState(1).items.length, 0)
  }
})

test('M3.1 UI：默认隐藏归档项，筛选和全选只作用于当前可见项', async () => {
  const ctx = makeSite(topicHtml, 'https://linux.sb/topic/1')
  const dbg = await load(ctx)
  const active = dbg.createTrackingIssue(1, { title: '活动', question: '活动问题', floors: [12], excerpt: '依据' })
  const archived = dbg.createTrackingIssue(1, { title: '归档', question: '归档问题', floors: [18], excerpt: '依据' })
  dbg.archiveTrackingItems(1, [archived.id])
  ctx.w.document.querySelector('.lsb-ai-copilot-top').click()
  const panel = ctx.w.document.querySelector('.lsb-copilot-panel')
  panel.querySelector('[data-mode="track"]').click()
  assert.ok(await until(() => panel.querySelector(`[data-track-id="${active.id}"]`)))
  assert.equal(panel.querySelector(`[data-track-id="${archived.id}"]`), null)
  panel.querySelector('[data-track-filter]').value = 'archived'
  panel.querySelector('[data-track-filter]').dispatchEvent(new ctx.w.Event('change'))
  assert.ok(panel.querySelector(`[data-track-id="${archived.id}"]`))
  panel.querySelector('[data-track-select-all]').click()
  assert.equal(panel.querySelector('[data-track-select]').getAttribute('data-track-select'), archived.id)
  assert.equal(panel.querySelector(`[data-track-select="${active.id}"]`), null)
  assert.equal(panel.querySelector('[data-track-bulk-restore]').disabled, false)
  panel.querySelector('[data-track-bulk-restore]').click()
  assert.ok(await until(() => ctx.w.document.querySelector('.lsb-panel [data-yes]')))
  ctx.w.document.querySelector('.lsb-panel [data-yes]').click()
  assert.ok(await until(() => !dbg.trackingState(1).items.find((item) => item.id === archived.id)?.archivedAt))
  panel.querySelector('[data-track-filter]').value = 'active'
  panel.querySelector('[data-track-filter]').dispatchEvent(new ctx.w.Event('change'))
  assert.ok(await until(() => panel.querySelector(`[data-track-id="${archived.id}"]`)))
  panel.querySelector('[data-track-select-all]').click()
  panel.querySelector('[data-track-bulk-archive]').click()
  assert.ok(await until(() => ctx.w.document.querySelector('.lsb-panel [data-yes]')))
  ctx.w.document.querySelector('.lsb-panel [data-yes]').click()
  assert.ok(await until(() => dbg.trackingState(1).items.every((item) => item.archivedAt)))
})

test('M3.1 UI：批量接受只处理有效建议，已确认解决仍只能单项确认', async () => {
  const ctx = makeSite(topicHtml, 'https://linux.sb/topic/1', {
    _llmReply: { choices: [{ message: { content: '- 状态建议：可能已解决\n- 判断依据：新回复说明已处理 [#51]\n- 新增证据：[#51]\n- 仍需确认：复现条件' } }] },
  })
  const dbg = await load(ctx)
  const accepted = dbg.createTrackingIssue(1, { title: '可接受', question: '问题 A', floors: [12], excerpt: '依据' })
  const untouched = dbg.createTrackingIssue(1, { title: '无建议', question: '问题 B', floors: [18], excerpt: '依据' })
  ctx.w.LSB.bus.emit('topic:posts-added', [{ postId: 9001, floor: 51, content: '新证据' }])
  await dbg.reviewTrackingIssue(1, accepted.id)
  ctx.w.document.querySelector('.lsb-ai-copilot-top').click()
  const panel = ctx.w.document.querySelector('.lsb-copilot-panel')
  panel.querySelector('[data-mode="track"]').click()
  assert.ok(await until(() => panel.querySelector(`[data-track-id="${accepted.id}"]`)))
  panel.querySelector(`[data-track-select="${accepted.id}"]`).click()
  panel.querySelector(`[data-track-select="${untouched.id}"]`).click()
  assert.equal(panel.querySelector('[data-track-bulk-accept]').disabled, false)
  panel.querySelector('[data-track-bulk-accept]').click()
  assert.ok(await until(() => ctx.w.document.querySelector('.lsb-panel [data-yes]')))
  ctx.w.document.querySelector('.lsb-panel [data-yes]').click()
  assert.ok(await until(() => dbg.trackingState(1).items.find((item) => item.id === accepted.id)?.status === '可能已解决'))
  assert.equal(dbg.trackingState(1).items.find((item) => item.id === untouched.id)?.status, '有新证据')
  assert.equal(panel.querySelectorAll(`[data-track-confirm]`).length, 2)
})

test('M3.1 UI：导出按钮分别下载 JSON、Markdown 和两份 CSV', async () => {
  const ctx = makeSite(topicHtml, 'https://linux.sb/topic/1')
  const dbg = await load(ctx)
  dbg.createTrackingIssue(1, { question: '导出问题', floors: [12], excerpt: '依据' })
  const downloads = []
  ctx.w.URL.createObjectURL = (blob) => {
    const url = `blob:${downloads.length + 1}`
    downloads.push({ blob, url })
    return url
  }
  ctx.w.URL.revokeObjectURL = () => {}
  const originalAnchorClick = ctx.w.HTMLAnchorElement.prototype.click
  ctx.w.HTMLAnchorElement.prototype.click = function () {
    if (!this.download) return originalAnchorClick.call(this)
    const record = downloads.find((row) => row.url === this.href)
    assert.ok(record, '下载锚点应对应已创建的 Blob URL')
    record.name = this.download
  }
  ctx.w.document.querySelector('.lsb-ai-copilot-top').click()
  const panel = ctx.w.document.querySelector('.lsb-copilot-panel')
  panel.querySelector('[data-mode="track"]').click()
  assert.ok(await until(() => panel.querySelector('[data-track-card]')))
  for (const attr of ['data-track-export-json', 'data-track-export-markdown', 'data-track-export-issues', 'data-track-export-evidence']) {
    panel.querySelector(`[${attr}]`).click()
  }
  assert.deepEqual(Array.from(downloads.map((row) => row.name.split('.').pop())), ['json', 'md', 'csv', 'csv'])
  assert.deepEqual(Array.from(downloads.map((row) => row.blob.type)), [
    'application/json;charset=utf-8',
    'text/markdown;charset=utf-8',
    'text/csv;charset=utf-8',
    'text/csv;charset=utf-8',
  ])
})

test('M3.1 UI：JSON 导入先显示预览，确认后才合并', async () => {
  const ctx = makeSite(topicHtml, 'https://linux.sb/topic/1')
  const dbg = await load(ctx)
  const incoming = {
    ...dbg.trackingExport(1),
    tracking: {
      ...dbg.trackingState(1),
      items: [{
        id: 'issue-imported', question: '导入问题', status: '待验证', source: { floors: [12] },
        evidence: [], pendingEvidence: [], suggestion: null, createdAt: 1, updatedAt: 1,
      }],
    },
  }
  ctx.w.document.querySelector('.lsb-ai-copilot-top').click()
  const panel = ctx.w.document.querySelector('.lsb-copilot-panel')
  panel.querySelector('[data-mode="track"]').click()
  assert.ok(await until(() => panel.querySelector('[data-track-import]')))
  const input = panel.querySelector('[data-track-import]')
  Object.defineProperty(input, 'files', {
    configurable: true,
    value: [new ctx.w.File([JSON.stringify(incoming)], 'tracking.json', { type: 'application/json' })],
  })
  input.dispatchEvent(new ctx.w.Event('change'))
  assert.ok(await until(() => panel.querySelector('[data-track-import-preview]')))
  assert.equal(dbg.trackingState(1).items.length, 0)
  panel.querySelector('[data-track-import-confirm]').click()
  assert.ok(await until(() => dbg.trackingState(1).items.some((item) => item.id === 'issue-imported')))
})

test('M3.1 UI：取消 JSON 导入预览不写入状态', async () => {
  const ctx = makeSite(topicHtml, 'https://linux.sb/topic/1')
  const dbg = await load(ctx)
  const incoming = {
    ...dbg.trackingExport(1),
    tracking: {
      ...dbg.trackingState(1),
      items: [{
        id: 'issue-cancelled', question: '取消的问题', status: '待验证', source: { floors: [12] },
        evidence: [], pendingEvidence: [], suggestion: null, createdAt: 1, updatedAt: 1,
      }],
    },
  }
  ctx.w.document.querySelector('.lsb-ai-copilot-top').click()
  const panel = ctx.w.document.querySelector('.lsb-copilot-panel')
  panel.querySelector('[data-mode="track"]').click()
  assert.ok(await until(() => panel.querySelector('[data-track-import]')))
  const input = panel.querySelector('[data-track-import]')
  Object.defineProperty(input, 'files', {
    configurable: true,
    value: [new ctx.w.File([JSON.stringify(incoming)], 'tracking.json', { type: 'application/json' })],
  })
  input.dispatchEvent(new ctx.w.Event('change'))
  assert.ok(await until(() => panel.querySelector('[data-track-import-preview]')))
  panel.querySelector('[data-track-import-cancel]').click()
  assert.equal(panel.querySelector('[data-track-import-preview]'), null)
  assert.equal(dbg.trackingState(1).items.length, 0)
})

test('M3.1 UI：路由切换后旧导入文件不能回写预览', async () => {
  const ctx = makeSite(topicHtml, 'https://linux.sb/topic/1')
  const dbg = await load(ctx)
  ctx.w.document.querySelector('.lsb-ai-copilot-top').click()
  const panel = ctx.w.document.querySelector('.lsb-copilot-panel')
  panel.querySelector('[data-mode="track"]').click()
  assert.ok(await until(() => panel.querySelector('[data-track-import]')))
  const input = panel.querySelector('[data-track-import]')
  let release
  const pending = new Promise((resolve) => {
    release = resolve
  })
  const file = new ctx.w.File(['{}'], 'tracking.json', { type: 'application/json' })
  Object.defineProperty(file, 'text', { configurable: true, value: () => pending })
  Object.defineProperty(input, 'files', { configurable: true, value: [file] })
  input.dispatchEvent(new ctx.w.Event('change'))
  ctx.w.LSB.bus.emit(
    'route:changed',
    { href: 'https://linux.sb/topic/2', page: { type: 'topic', id: 2 } },
    { source: 'core' },
  )
  assert.equal(ctx.w.document.querySelector('.lsb-copilot-panel'), null)
  release(JSON.stringify(dbg.trackingExport(1)))
  await sleep(80)
  assert.equal(ctx.w.document.querySelector('[data-track-import-preview]'), null)
  assert.equal(dbg.trackingState(1).items.length, 0)
})
