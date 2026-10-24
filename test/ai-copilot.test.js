import { test } from 'node:test'
import assert from 'node:assert/strict'
import { existsSync, readFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { JSDOM } from 'jsdom'

const baseCode = readFileSync(new URL('../dist-dev/linuxsb-base.user.js', import.meta.url), 'utf8')
const summaryCode = readFileSync(new URL('../plugins/ai-summary.user.js', import.meta.url), 'utf8')
const actionCode = readFileSync(new URL('../plugins/ai-actions.user.js', import.meta.url), 'utf8')
const writeActionsCode = readFileSync(new URL('../plugins/ai-write-actions.user.js', import.meta.url), 'utf8')
const copilotPath = fileURLToPath(new URL('../plugins/ai-copilot.user.js', import.meta.url))
const copilotCode = existsSync(copilotPath) ? readFileSync(copilotPath, 'utf8') : ''
const topicHtml = readFileSync(new URL('./fixtures/topic1.html', import.meta.url), 'utf8')
const homeHtml = readFileSync(new URL('./fixtures/home.html', import.meta.url), 'utf8')

const LLM = 'https://api.example.com/v1/chat/completions'

function listRow({ id = 4321, title = '实时列表主题', authorId = 9876, author = '作者甲' } = {}) {
  return `<li class="post-item topic-pinned"><div class="post-avatar"><a href="/user/${authorId}">${author}</a></div>` +
    `<a class="post-title" href="/topic/${id}">${title}</a><div class="post-meta"><a href="/forum/4">技术交流</a><span>23</span></div>` +
    `<span data-performance-time="1700000000"></span></li>`
}

function makeSite(html, url, cfg = {}) {
  const { _llmReply, _llmReplies, _sitePages = {}, _siteFailures = [], ...storeCfg } = cfg
  const reply = _llmReply || { choices: [{ message: { content: '【模型输出】' } }] }
  const replies = Array.isArray(_llmReplies) && _llmReplies.length ? _llmReplies : [reply]
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
  let replyIndex = 0
  let hold = null
  const controls = { failTopicPages: false }
  const isLlm = (s) => !/linux\.sb/.test(s)
  w.fetch = async (u, init = {}) => {
    const s = String(u)
    calls.push({ url: s, method: init.method || 'GET', body: init.body, headers: init.headers || {} })
    if (isLlm(s)) {
      if (hold) await hold
      const selected = replies[Math.min(replyIndex++, replies.length - 1)]
      return {
        status: 200,
        ok: true,
        url: s,
        text: async () => JSON.stringify(selected),
      }
    }
    const requestUrl = new URL(s)
    if (requestUrl.pathname === '/search' && (init.method || 'GET').toUpperCase() === 'POST') {
      const q = init.body?.get?.('q') || ''
      const field = init.body?.get?.('field') || 'title'
      const params = new URLSearchParams({ q, field })
      return {
        status: 200,
        ok: true,
        url: s,
        text: async () => JSON.stringify({ ok: 1, redirect: `/index.php?${params.toString()}` }),
      }
    }
    if (_siteFailures.includes(`${requestUrl.pathname}${requestUrl.search}`)) {
      return { status: 500, ok: false, url: s, text: async () => '站点读取失败' }
    }
    if (controls.failTopicPages && /\/topic\/[^?]+\?p=/.test(s)) {
      return { status: 500, ok: false, url: s, text: async () => '分页失败' }
    }
    const responseHtml = _sitePages[`${requestUrl.pathname}${requestUrl.search}`] || html
    return { status: 200, ok: true, url: s, text: async () => responseHtml }
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
    llmCallsAt: (index) => calls.filter((c) => isLlm(c.url))[index],
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

test('M12 当前对话显式覆盖共享主题 session，历史影响缓存', async () => {
  const ctx = makeSite(topicHtml, 'https://linux.sb/topic/1')
  const debug = await load(ctx)
  await debug.run('ask', { question: '独立副驾历史' })
  const context = await debug.collectContext()
  const empty = debug.buildRequest('ask', context, { question: '它有什么限制？', conversation: [] })
  assert.doesNotMatch(empty.user, /独立副驾历史/)
  const history = [{ role: 'user', content: '选方案甲' }, { role: 'assistant', content: '方案甲适合缓存' }]
  const followup = debug.buildRequest('ask', context, { question: '它有什么限制？', conversation: history })
  assert.match(followup.user, /方案甲适合缓存/)
  assert.notEqual(followup.fingerprint, empty.fingerprint)
  await debug.run('ask', { question: '它有什么限制？', conversation: history })
  await debug.run('ask', { question: '它有什么限制？', conversation: [] })
  assert.equal(ctx.llmCalls(), 3)
  assert.equal(debug.sessionFor(1).length, 2, '工作台显式历史不写回独立副驾 session')
})
test('M12 只读 console 计划和回答都包含历史且隔离缓存', async () => {
  const ctx = makeSite(topicHtml, 'https://linux.sb/topic/1')
  const debug = await load(ctx)
  const context = debug.consoleContext()
  context.conversation = [{ role: 'user', content: '比较缓存方案' }, { role: 'assistant', content: '先考虑方案乙' }]
  const withHistory = debug.buildConsolePlanRequest('它有哪些限制？', context)
  const answer = debug.buildConsoleAnswerRequest('它有哪些限制？', {}, { items: [] }, context)
  assert.match(withHistory.user, /先考虑方案乙/)
  assert.match(answer.user, /先考虑方案乙/)
  context.conversation = []
  assert.notEqual(withHistory.fingerprint, debug.buildConsolePlanRequest('它有哪些限制？', context).fingerprint)
  assert.notEqual(answer.fingerprint, debug.buildConsoleAnswerRequest('它有哪些限制？', {}, { items: [] }, context).fingerprint)
})

test('M12 副驾停止模型请求后不写缓存或 session，并立即允许新请求', async () => {
  const ctx = makeSite(topicHtml, 'https://linux.sb/topic/1')
  const debug = await load(ctx)
  const release = ctx.holdLLM()
  const ctrl = new ctx.w.AbortController()
  const pending = debug.run('ask', { question: '停止的原问题', conversation: [], signal: ctrl.signal })
  const rejection = assert.rejects(pending, { name: 'AbortError' })
  assert.equal(await until(() => ctx.llmCalls() === 1), true)
  ctrl.abort()
  setTimeout(release, 100)
  await rejection
  await debug.run('ask', { question: '新的问题', conversation: [] })
  assert.equal(ctx.llmCalls(), 2)
  assert.equal(debug.sessionFor(1).length, 0)
  const records = Object.keys(ctx.w.localStorage).filter((key) => key.includes('ai-copilot:c:'))
  assert.equal(records.length, 1)
})

test('M12 停止研究读取不继续下一篇，也不请求回答模型', async () => {
  const ctx = makeSite(homeHtml, 'https://linux.sb/', {
    _llmReply: { choices: [{ message: { content: '{"version":1,"query":"kernel","field":"title"}' } }] },
    _sitePages: { '/index.php?q=kernel&field=title': researchResultsHtml([{ id: 9101, title: 'kernel 甲' }, { id: 9102, title: 'kernel 乙' }]) },
  })
  await load(ctx)
  const copilot = ctx.w.LSB.__core.plugins.get('ai-copilot').exports
  const found = await copilot.startResearch({ question: '搜索 kernel 主题' })
  const calls = []
  let release
  ctx.w.fetch = async (url) => {
    calls.push(String(url))
    return new Promise((resolve) => { release = () => resolve({ status: 200, ok: true, url: String(url), text: async () => topicHtml }) })
  }
  const ctrl = new ctx.w.AbortController()
  const pending = copilot.readResearchSelection({ researchId: found.researchId, topicIds: [9101, 9102], question: '比较 kernel', signal: ctrl.signal })
  const rejected = assert.rejects(pending, { name: 'AbortError' })
  assert.equal(await until(() => calls.length === 1), true)
  ctrl.abort()
  release()
  await rejected
  assert.equal(calls.length, 1)
  assert.match(calls[0], /\/topic\/9101/)
})

test('M12 转义膨胀的历史与本次材料仍共享预算，旧引用不能成为证据', async () => {
  const ctx = makeSite(topicHtml, 'https://linux.sb/topic/1')
  const debug = await load(ctx)
  const conversation = [{ role: 'user', content: '继续' }, { role: 'assistant', content: '<'.repeat(4000) + '[#99999]' }]
  const context = await debug.collectContext({ maxChars: 12000, conversation })
  const request = debug.buildRequest('ask', context, { question: '继续解释', conversation })
  const block = request.user.match(/<conversation>\n([\s\S]*?)\n<\/conversation>/)?.[1] || ''
  assert.ok(block.length <= 3000)
  assert.ok(block.length + context.text.length <= 12400)
  assert.equal(debug.citations('历史说见 [#99999]', context.posts, 1)[0].known, false)
})

test('M13 摘要请求按范围指纹去重且强制使用整段协议', async () => {
  const ctx = makeSite(topicHtml, 'https://linux.sb/topic/1', {
    _llmReply: { choices: [{ message: { content: '已知方案甲；早期限制是缓存刷新。' } }] },
  })
  const debug = await load(ctx)
  const rows = [
    { role: 'user', content: '早期问题', state: 'complete', capability: 'ask', scope: 'topic:1' },
    { role: 'assistant', content: '早期回答', state: 'complete', capability: 'ask', scope: 'topic:1' },
  ]
  const scope = { kind: 'current-topic', routeType: 'topic', topicId: 1, routeScope: 'topic:1' }
  const first = await debug.summarizeConversation({ rows, scope })
  const second = await debug.summarizeConversation({ rows, scope })
  assert.equal(ctx.llmCalls(), 1)
  assert.equal(first.text, second.text)
  assert.ok(first.sourceFingerprint)
  const body = JSON.parse(ctx.lastLlm().body)
  assert.equal(body.stream, false)
  assert.doesNotMatch(JSON.stringify(body), /site-action|citation|执行动作/)
})
test('M14 材料变化使同语义回答失效并保留旧缓存', async () => {
  const ctx = makeSite(topicHtml, 'https://linux.sb/topic/1')
  const debug = await load(ctx)
  const first = await debug.run('ask', { question: '缓存问题', conversation: [] })
  assert.equal(typeof first.meta.semanticFingerprint, 'string')
  assert.equal(typeof first.meta.materialFingerprint, 'string')
  assert.equal(first.meta.evidenceSnapshot.version, 1)
  const oldKey = Object.keys(ctx.w.localStorage).find((key) => key.includes('ai-copilot:c:') && JSON.parse(ctx.w.localStorage.getItem(key)).meta.semanticFingerprint === first.meta.semanticFingerprint)
  assert.ok(oldKey)
  ctx.w.document.querySelector('.post-content').textContent = '同一楼层的新正文'
  const second = await debug.run('ask', { question: '缓存问题', conversation: [] })
  assert.equal(ctx.llmCalls(), 2)
  assert.notEqual(second.meta.materialFingerprint, first.meta.materialFingerprint)
  assert.equal(JSON.parse(ctx.w.localStorage.getItem(oldKey)).text, first.text)
})

test('M14 同材料同语义只生成一次并保存 citationReview 空值', async () => {
  const ctx = makeSite(topicHtml, 'https://linux.sb/topic/1')
  const debug = await load(ctx)
  const first = await debug.run('ask', { question: '相同问题', conversation: [] })
  const second = await debug.run('ask', { question: '相同问题', conversation: [] })
  assert.equal(ctx.llmCalls(), 1)
  assert.equal(second.meta.semanticFingerprint, first.meta.semanticFingerprint)
  assert.equal(second.meta.materialFingerprint, first.meta.materialFingerprint)
  assert.equal(second.meta.citationReview, null)
})

test('M14 缺少 semanticFingerprint 的旧缓存不作为语义候选', async () => {
  const ctx = makeSite(topicHtml, 'https://linux.sb/topic/1')
  const debug = await load(ctx)
  const first = await debug.run('ask', { question: '旧缓存问题', conversation: [] })
  const key = Object.keys(ctx.w.localStorage).find((item) => item.includes('ai-copilot:c:'))
  const cached = JSON.parse(ctx.w.localStorage.getItem(key))
  delete cached.meta.semanticFingerprint
  delete cached.meta.materialFingerprint
  ctx.w.localStorage.setItem(key, JSON.stringify(cached))
  ctx.w.document.querySelector('.post-content').textContent = '旧缓存测试的新材料'
  const result = await debug.run('ask', { question: '旧缓存问题', conversation: [] })
  assert.equal(ctx.llmCalls(), 2)
  assert.equal(typeof result.meta.semanticFingerprint, 'string')
  assert.equal(typeof result.meta.materialFingerprint, 'string')
})

test('M15 detached 请求不读取当前帖子正文且与 attached 缓存隔离', async () => {
  const ctx = makeSite(topicHtml, 'https://linux.sb/topic/1')
  const debug = await load(ctx)
  const attached = await debug.run('ask', { question: '相同问题', conversation: [], materialMode: 'attached' })
  const detached = await debug.run('ask', { question: '相同问题', conversation: [], materialMode: 'detached' })
  assert.equal(ctx.llmCalls(), 2)
  assert.notEqual(attached.meta.cacheFingerprint, detached.meta.cacheFingerprint)
  assert.notEqual(attached.meta.scopeFingerprint, detached.meta.scopeFingerprint)
  assert.doesNotMatch(ctx.lastLlm().body, /<forum-content>|LINUX SB上线/)
  assert.equal(detached.meta.citations.length, 0)
})

test('M15 detached 普通页面查询不读取页面材料、不生成引用并隔离缓存', async () => {
  const plan = { choices: [{ message: { content: JSON.stringify({
    version: 2,
    intent: 'question',
    includeCurrentTopic: false,
    includeCurrentList: false,
    includeArchived: false,
    statuses: [],
    topicIds: [],
    terms: [],
  }) } }] }
  const ctx = makeSite(homeHtml, 'https://linux.sb/?session-secret=hidden', {
    _llmReplies: [plan, { choices: [{ message: { content: '脱离页面材料也能回答' } }] }],
  })
  const debug = await load(ctx)
  const result = await debug.runConsoleQuery({ question: '解释缓存是什么', materialMode: 'detached' })
  assert.equal(ctx.llmCalls(), 2)
  const bodies = ctx.calls.filter((call) => !/linux\.sb/.test(call.url)).map((call) => JSON.parse(call.body))
  assert.equal(bodies.length, 2)
  for (const body of bodies) {
    const userText = body.messages.filter((message) => message.role === 'user').map((message) => message.content).join('\n')
    assert.doesNotMatch(userText, /LINUX SB上线|实时列表主题|作者甲|post-content|<forum-content>|session-secret|\/topic\/\d+|postId|floor|references/i)
  }
  assert.equal(result.meta.materialMode, 'detached')
  assert.equal(result.meta.citations.length, 0)
  const cached = await debug.runConsoleQuery({ question: '解释缓存是什么', materialMode: 'detached' })
  assert.equal(ctx.llmCalls(), 2)
  assert.equal(cached.meta.materialMode, 'detached')
})

test('M14 引用惰性复核只读取当前材料且不调用模型', async () => {
  const ctx = makeSite(topicHtml, 'https://linux.sb/topic/1')
  const debug = await load(ctx)
  const record = await debug.run('ask', { question: '引用复核', conversation: [] })
  const beforeLlm = ctx.llmCalls()
  const citations = record.meta.evidenceSnapshot.citations.slice(0, 2)
  const review = await debug.revalidateCitations({
    snapshot: record.meta.evidenceSnapshot,
    citations,
    scope: record.meta.evidenceSnapshot.scope,
  })
  assert.equal(review.counts.unchanged, 2)
  assert.equal(ctx.llmCalls(), beforeLlm)
  assert.equal(review.rows.every((row) => row.freshness === 'fresh'), true)
})

test('M14 引用复核分页目标去重并沿用 AbortSignal', async () => {
  const ctx = makeSite(topicHtml, 'https://linux.sb/topic/1')
  const debug = await load(ctx)
  const record = await debug.run('ask', { question: '分页复核', conversation: [] })
  const base = record.meta.evidenceSnapshot
  const citations = base.citations.slice(0, 2).map((row) => ({ ...row, page: 2 }))
  const review = await debug.revalidateCitations({ snapshot: { ...base, citations }, citations, scope: base.scope })
  assert.equal(review.counts.changed, 2)
  assert.equal(ctx.calls.filter((call) => call.url.includes('/topic/1?p=2')).length, 1)
})

test('M14 共享字符预算用尽后停止后续页面读取并标记剩余引用', async () => {
  const pageHtml = (page, citation, content) => '<!doctype html><html><head>' +
    '<link rel="canonical" href="https://linux.sb/topic/1?p=' + page + '">' +
    '</head><body><h1 class="post-content-title">预算测试</h1><ul class="post-list">' +
    '<li class="post-item post-entry" id="post-' + citation.postId + '" data-floor="' + citation.floor + '">' +
    '<div class="post-head"><a class="post-title post-author" href="/user/99">测试作者</a></div>' +
    '<div class="post-content">' + content + '</div></li></ul></body></html>'
  const ctx = makeSite(topicHtml, 'https://linux.sb/topic/1')
  const debug = await load(ctx)
  const record = await debug.run('ask', { question: '共享字符预算', conversation: [] })
  const base = record.meta.evidenceSnapshot
  const citations = base.citations.slice(0, 2).map((row, index) => ({ ...row, page: index + 2 }))
  ctx.w.fetch = async (url, init = {}) => {
    const target = new URL(String(url))
    ctx.calls.push({ url: String(url), method: init.method || 'GET' })
    const page = Number(target.searchParams.get('p'))
    return { status: 200, ok: true, url: String(url), text: async () => pageHtml(page, citations[page - 2], page === 2 ? 'x'.repeat(12001) : '后续页面') }
  }
  const review = await debug.revalidateCitations({ snapshot: { ...base, citations }, citations, scope: base.scope })
  const reads = ctx.calls.filter((call) => /\/topic\/1\?p=/.test(call.url)).map((call) => new URL(call.url).searchParams.get('p'))
  assert.equal(reads.join(','), '2')
  assert.equal(review.counts.unverifiable, 2)
  assert.equal(review.rows.map((row) => row.reason).join(','), 'char-budget,char-budget')
})

test('M14 复核中止后不落盘也不继续读取', async () => {
  const ctx = makeSite(topicHtml, 'https://linux.sb/topic/1')
  const debug = await load(ctx)
  const record = await debug.run('ask', { question: '取消复核', conversation: [] })
  const base = record.meta.evidenceSnapshot
  const citations = base.citations.slice(0, 1).map((row) => ({ ...row, page: 2 }))
  let release
  let reads = 0
  ctx.w.fetch = async (url) => {
    reads += 1
    return new Promise((resolve) => { release = () => resolve({ status: 200, ok: true, url: String(url), text: async () => topicHtml }) })
  }
  const controller = new ctx.w.AbortController()
  const pending = debug.revalidateCitations({ snapshot: { ...base, citations }, citations, scope: base.scope, signal: controller.signal })
  assert.equal(await until(() => reads === 1), true)
  controller.abort()
  release?.()
  await assert.rejects(pending, { name: 'AbortError' })
  const saved = Object.keys(ctx.w.localStorage).filter((key) => key.includes('ai-copilot:c:')).map((key) => JSON.parse(ctx.w.localStorage.getItem(key)))
  assert.equal(saved.every((row) => row.meta.citationReview === null), true)
})
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

test('AI 副驾：公开工作台接口不依赖 debug RPC', async () => {
  const ctx = makeSite(topicHtml, 'https://linux.sb/topic/1')
  await load(ctx)
  const rec = ctx.w.LSB.info().plugins.find((item) => item.id === 'ai-copilot')
  const exported = rec?.state === 'active' ? ctx.w.LSB.__core.plugins.get('ai-copilot').exports : null
  assert.equal(typeof exported?.context, 'function')
  assert.equal(typeof exported?.runConsoleQuery, 'function')
  assert.equal(typeof exported?.runTopic, 'function')
  assert.equal(typeof exported?.trackingOverview, 'function')
  assert.equal(typeof exported?.providerState, 'function')
  assert.equal(typeof exported?.renderMarkdown, 'function')
  assert.equal(exported.providerState().configured, true)
  assert.equal(exported.context().route.type, 'topic')
  const overview = exported.trackingOverview()
  assert.equal(Array.isArray(overview.items), true)
  assert.equal(typeof overview.activeCount, 'number')
  assert.equal(ctx.w.LSB.bus.hasHandler('ai-copilot:debug'), true)
})

test('M16 provider 状态向工作台转发脱敏协议、能力和诊断', async () => {
  const ctx = makeSite(topicHtml, 'https://linux.sb/topic/1')
  await load(ctx)
  const summary = ctx.w.LSB.__core.plugins.get('ai-summary').exports
  ctx.w.fetch = async (url, init) => ({
    status: 200,
    ok: true,
    url: String(url),
    text: async () => JSON.stringify({ choices: [{ message: { content: 'OK' } }] }),
  })
  await summary.probe({ force: true })
  const exported = ctx.w.LSB.__core.plugins.get('ai-copilot').exports
  const state = exported.providerState()
  assert.equal(state.protocol, 'openai')
  assert.equal(state.capabilities.json, true)
  assert.equal(state.lastDiagnostic.reasonCode, 'ok')
  assert.doesNotMatch(JSON.stringify(state), /apiKey|authorization|token=|正文|引用/)
})

test('动作计划：解析 fenced JSON，目录和预览来自本地，模型不能声明已执行', async () => {
  const ctx = makeSite(topicHtml, 'https://linux.sb/topic/1', {
    _llmReply: {
      choices: [{
        message: {
          content: '```json\n{"version":1,"summary":"回首页","steps":[{"action":"site.navigate","args":{"target":"home"}}]}\n```',
        },
      }],
    },
  })
  await load(ctx)
  ctx.w.eval(actionCode)
  await sleep(30)
  const exported = ctx.w.LSB.__core.plugins.get('ai-copilot').exports
  const record = await exported.planActions({ command: '回到首页' })
  assert.equal(record.plan.version, 1)
  assert.equal(record.plan.steps[0].action, 'site.navigate')
  assert.match(record.previews[0].text, /首页/)
  assert.equal(record.plan.executed, undefined)
  assert.doesNotMatch(JSON.stringify(ctx.lastLlm()), /apiKey|_csrf|cookie/i)
  assert.doesNotMatch(JSON.stringify(ctx.lastLlm().body), /帖子正文|楼层内容/)
})

test('动作计划：未知版本的安全只读计划返回降级结果，不建立动作计划', async () => {
  const ctx = makeSite(topicHtml, 'https://linux.sb/topic/1', {
    _llmReply: {
      choices: [{
        message: {
          content: '{"version":99,"summary":"搜索当前站内列表","steps":[{"action":"site.search","args":{"query":"内核","field":"title"}}]}',
        },
      }],
    },
  })
  await load(ctx)
  ctx.w.eval(actionCode)
  await sleep(30)
  const exported = ctx.w.LSB.__core.plugins.get('ai-copilot').exports
  const result = await exported.planActions({ command: '搜索当前站内列表' })
  assert.equal(result.fallback, true)
  assert.equal(result.reasonCode, 'plan-downgraded')
  assert.match(result.warning, /普通只读查询/)
  assert.equal(result.plan, undefined)
})

test('动作计划：生成阶段发布与请求绑定的 plan trace', async () => {
  const ctx = makeSite(topicHtml, 'https://linux.sb/topic/1', {
    _llmReply: {
      choices: [{
        message: {
          content: '{"version":1,"summary":"回首页","steps":[{"action":"site.navigate","args":{"target":"home"}}]}',
        },
      }],
    },
  })
  await load(ctx)
  ctx.w.eval(actionCode)
  await sleep(30)
  const events = []
  ctx.w.LSB.bus.on('ai:trace', (event) => events.push(event))
  const exported = ctx.w.LSB.__core.plugins.get('ai-copilot').exports
  await exported.planActions({ command: '回到首页', flowId: 'action-plan-flow-1' })
  const planEvents = events.filter((event) => event.flowId === 'action-plan-flow-1' && event.stage === 'plan')
  assert.deepEqual(planEvents.map((event) => event.state), ['active', 'complete'])
})

test('动作计划：未知版本降级时发布固定限制 trace', async () => {
  const ctx = makeSite(topicHtml, 'https://linux.sb/topic/1', {
    _llmReply: {
      choices: [{
        message: {
          content: '{"version":99,"summary":"搜索当前站内列表","steps":[{"action":"site.search","args":{"query":"内核","field":"title"}}]}',
        },
      }],
    },
  })
  await load(ctx)
  ctx.w.eval(actionCode)
  await sleep(30)
  const events = []
  ctx.w.LSB.bus.on('ai:trace', (event) => events.push(event))
  const exported = ctx.w.LSB.__core.plugins.get('ai-copilot').exports
  const result = await exported.planActions({ command: '搜索当前站内列表', flowId: 'action-fallback-flow-1' })
  assert.equal(result.fallback, true)
  assert.ok(events.some((event) => event.flowId === 'action-fallback-flow-1' && event.stage === 'limit' && event.reasonCode === 'plan-downgraded'))
})

test('动作计划：只在明确询问帖子时附加限额上下文', async () => {
  const reply = { choices: [{ message: { content: '{"version":1,"summary":"回首页","steps":[{"action":"site.navigate","args":{"target":"home"}}]}' } }] }
  const ctx = makeSite(topicHtml, 'https://linux.sb/topic/1', { _llmReplies: [reply, reply] })
  await load(ctx)
  ctx.w.eval(actionCode)
  await sleep(30)
  const exported = ctx.w.LSB.__core.plugins.get('ai-copilot').exports
  assert.equal(exported.actionContext('打开插件设置').currentTopic, undefined)
  const actionContext = exported.actionContext('根据当前帖子打开相关面板')
  assert.ok(actionContext.currentTopic)
  assert.ok(actionContext.currentTopic.posts.length <= 40)
  assert.ok(actionContext.currentTopic.posts.every((post) => post.content.length <= 500))
  assert.equal(exported.actionContext('不要读取当前帖子内容，只打开插件设置').currentTopic, undefined)
  await exported.planActions({ command: '根据当前帖子打开相关面板' })
  const request = ctx.llmCallsAt(0)
  const body = JSON.parse(request.body)
  const user = body.messages?.[1]?.content || ''
  assert.ok(user.length <= 12000, `request chars: ${user.length}`)
  assert.match(user, /<current-topic>/)
  await exported.planActions({ command: '不要读取当前帖子内容，只打开插件设置' })
  const negatedUser = JSON.parse(ctx.llmCallsAt(1).body).messages?.[1]?.content || ''
  assert.doesNotMatch(negatedUser, /<current-topic>/)
})

test('动作计划：模型上下文只包含白名单路由字段，不带原始 URL 查询参数', async () => {
  const reply = { choices: [{ message: { content: '{"version":1,"summary":"回首页","steps":[{"action":"site.navigate","args":{"target":"home"}}]}' } }] }
  const ctx = makeSite(topicHtml, 'https://linux.sb/topic/1?p=3&token=route-secret', { _llmReply: reply })
  await load(ctx)
  ctx.w.eval(actionCode)
  await sleep(30)
  const exported = ctx.w.LSB.__core.plugins.get('ai-copilot').exports
  const actionContext = exported.actionContext('打开插件设置')
  assert.equal(actionContext.route.type, 'topic')
  assert.equal(actionContext.route.id, 1)
  assert.equal(actionContext.route.page, 3)
  assert.equal(actionContext.route.sort, null)
  assert.equal(actionContext.route.tab, null)
  assert.equal('href' in actionContext.route, false)
  await exported.planActions({ command: '打开插件设置' })
  assert.doesNotMatch(JSON.stringify(ctx.lastLlm()), /route-secret/)
})

test('动作计划：非法 JSON、未知动作和额外执行字段都被本地拒绝', async () => {
  const ctx = makeSite(topicHtml, 'https://linux.sb/topic/1', {
    _llmReplies: [
      { choices: [{ message: { content: '{"version":1,"summary":"x","steps":[{"action":"site.missing","args":{}}]}' } }] },
      { choices: [{ message: { content: '不是 JSON' } }] },
      { choices: [{ message: { content: '{"version":1,"summary":"x","executed":true,"steps":[{"action":"site.navigate","args":{"target":"home"}}]}' } }] },
    ],
  })
  await load(ctx)
  ctx.w.eval(actionCode)
  await sleep(30)
  const exported = ctx.w.LSB.__core.plugins.get('ai-copilot').exports
  await assert.rejects(() => exported.planActions({ command: '执行未知动作' }), /未知动作|计划/)
  await assert.rejects(() => exported.planActions({ command: '根据这篇帖子打开相关面板' }), /JSON|计划/)
  await assert.rejects(() => exported.planActions({ command: '声明已经执行' }), /未知字段|计划/)
})

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

test('动作计划：只允许目录内写动作响应用户直接请求，且计划单步并隔离论坛正文', async () => {
  const ctx = makeSite(topicHtml, 'https://linux.sb/topic/1')
  ctx.w.eval(baseCode)
  ctx.w.eval(summaryCode)
  ctx.w.eval(actionCode)
  ctx.w.eval(writeActionsCode)
  ctx.w.eval(copilotCode)
  await sleep(80)
  const dbg = await ctx.w.LSB.bus.request('ai-copilot:debug')
  const command = '请回复当前帖子，内容是：我会继续排查这个问题。'
  const actionContext = dbg.actionContext(command)
  const reply = actionContext.availableActions.find((item) => item.id === 'site.write-reply')
  assert.equal(reply?.permission, 'write', '动作目录应向计划器标明写权限')

  const request = dbg.buildActionPlanRequest(command, actionContext)
  assert.match(request.system, /写动作.*用户.*明确|用户.*明确.*写动作/)
  assert.match(request.system, /write 动作.*只有一个步骤/)
  assert.match(request.system, /帖子内容.*不可信|页面正文.*不可信/)
  assert.match(request.system, /计划.*提案|不执行动作/)
  assert.match(request.user, /site\.write-reply/)
})

test('动作计划：只在用户明确请求本人页面时提供当前用户 ID', async () => {
  const ctx = makeSite(homeHtml, 'https://linux.sb/')
  const dbg = await load(ctx)
  ctx.w.eval(actionCode)
  await sleep(30)
  const command = '打开当前页面的“我的帖子”'
  const ownPage = dbg.actionContext(command)
  assert.equal(ownPage.currentUserId, 5372)
  assert.equal(ownPage.availableActions.find((item) => item.id === 'site.navigate')?.permission, 'read')
  const ownRequest = dbg.buildActionPlanRequest(command, ownPage)
  assert.match(ownRequest.user, /<current-user>[\s\S]*5372[\s\S]*<\/current-user>/)

  const genericPage = dbg.actionContext('打开首页')
  assert.equal(genericPage.currentUserId, undefined)
  assert.doesNotMatch(dbg.buildActionPlanRequest('打开首页', genericPage).user, /<current-user>/)

  const guest = makeSite('<!doctype html><html><body><main>访客</main></body></html>', 'https://linux.sb/')
  const guestDebug = await load(guest)
  assert.equal(guest.w.LSB.__core.snapshot.me.guest, true)
  assert.equal(guestDebug.actionContext('打开我的帖子').currentUserId, undefined)
})

test('动作计划：互动目标只暴露短期 key，动作请求不持久化目标引用', async () => {
  const ctx = makeSite(topicHtml, 'https://linux.sb/topic/1')
  await load(ctx)
  ctx.w.eval(actionCode)
  ctx.w.eval(writeActionsCode)
  await sleep(30)
  const calls = []
  const siteFetch = ctx.w.fetch.bind(ctx.w)
  ctx.w.fetch = async (url, init = {}) => {
    const value = String(url)
    if (/linux\.sb/.test(value)) return siteFetch(url, init)
    const request = JSON.parse(init.body)
    const user = request.messages?.[1]?.content || ''
    calls.push(user)
    const catalogText = user.match(/<action-catalog>\n([\s\S]*?)\n<\/action-catalog>/)?.[1] || '[]'
    const catalog = JSON.parse(catalogText)
    const like = catalog.find((item) => item.id === 'site.write-like-state')
    const targetKey = like?.args?.targetKey?.values?.[0]
    return {
      status: 200,
      ok: true,
      url: value,
      text: async () => JSON.stringify({
        choices: [{ message: { content: JSON.stringify({
          version: 1,
          summary: '给当前回帖点赞',
          steps: [{ action: 'site.write-like-state', args: { targetKey, liked: true } }],
        }) } }],
      }),
    }
  }

  const exported = ctx.w.LSB.__core.plugins.get('ai-copilot').exports
  const result = await exported.planActions({ command: '给当前帖子中的回帖点赞' })
  assert.equal(result.plan.steps[0].action, 'site.write-like-state')
  assert.match(result.plan.steps[0].args.targetKey, /^target-/)
  assert.equal(typeof result.targetScopeNonce, 'string')
  assert.match(calls[0], /target-/)
  assert.doesNotMatch(calls[0], /"topicId"|"postId"|"currentUser"|5372|81459cee|scope-|https?:\/\/|\/topic\/1/)
  assert.equal(await ctx.w.LSB.bus.request('ai-copilot:reaction-scope-valid', { nonce: result.targetScopeNonce }), true)
  const stored = Array.from({ length: ctx.w.localStorage.length }, (_, index) => {
    const key = ctx.w.localStorage.key(index)
    return `${key} ${ctx.w.localStorage.getItem(key)}`
  }).join('\n')
  assert.doesNotMatch(stored, /target-|"postId":87|81459cee/)
})

test('动作计划：未选跨主题候选不能成为互动目标，失效候选不触发读取', async () => {
  const ctx = makeSite(homeHtml, 'https://linux.sb/', {
    _llmReplies: [
      { choices: [{ message: { content: JSON.stringify({ version: 1, query: 'kernel', field: 'title' }) } }] },
      { choices: [{ message: { content: JSON.stringify({
        version: 1,
        summary: '给候选主题点赞',
        steps: [{ action: 'site.write-like-state', args: { targetKey: 'target-guessed', liked: true } }],
      }) } }] },
    ],
    _sitePages: {
      '/index.php?q=kernel&field=title': researchResultsHtml([
        { id: 7701, title: '未选择候选主题甲' },
        { id: 7702, title: '未选择候选主题乙' },
      ]),
    },
  })
  await load(ctx)
  ctx.w.eval(actionCode)
  ctx.w.eval(writeActionsCode)
  await sleep(30)
  const copilot = ctx.w.LSB.__core.plugins.get('ai-copilot').exports
  const found = await copilot.startResearch({ question: '搜索 kernel 主题' })
  assert.deepEqual(Array.from(found.candidates, (row) => row.id), [7701, 7702])

  await assert.rejects(
    () => copilot.planActions({
      command: '给未选择的搜索结果主题点个赞',
      targetScope: { researchId: found.researchId, topicIds: [], postIds: [] },
    }),
    /action\.unavailable|动作计划校验失败/,
  )
  const planPrompt = JSON.parse(ctx.llmCallsAt(1).body).messages[1].content
  assert.doesNotMatch(planPrompt, /7701|7702|未选择候选主题/)
  await assert.rejects(
    () => copilot.planActions({
      command: '给已选主题点赞',
      targetScope: { researchId: found.researchId, topicIds: [9999], postIds: [] },
    }),
    /所选互动主题已不在当前检索候选中/,
  )
  assert.equal(ctx.calls.some((call) => /\/topic\/(7701|7702|9999)/.test(call.url)), false)
  assert.equal(ctx.llmCalls(), 2, '无效候选在调用模型之前被拒绝')
})

test('动作计划：跨主题互动会话超过时限后失效', async () => {
  const ctx = makeSite(topicHtml, 'https://linux.sb/topic/1')
  await load(ctx)
  ctx.w.eval(actionCode)
  ctx.w.eval(writeActionsCode)
  await sleep(30)
  let now = Date.now()
  ctx.w.Date.now = () => now
  const siteFetch = ctx.w.fetch.bind(ctx.w)
  ctx.w.fetch = async (url, init = {}) => {
    const value = String(url)
    if (/linux\.sb/.test(value)) return siteFetch(url, init)
    const request = JSON.parse(init.body)
    const user = request.messages?.[1]?.content || ''
    const catalogText = user.match(/<action-catalog>\n([\s\S]*?)\n<\/action-catalog>/)?.[1] || '[]'
    const targetKey = JSON.parse(catalogText).find((item) => item.id === 'site.write-like-state')?.args?.targetKey?.values?.[0]
    return {
      status: 200,
      ok: true,
      url: value,
      text: async () => JSON.stringify({ choices: [{ message: { content: JSON.stringify({
        version: 1,
        summary: '给当前回帖点赞',
        steps: [{ action: 'site.write-like-state', args: { targetKey, liked: true } }],
      }) } }] }),
    }
  }

  const copilot = ctx.w.LSB.__core.plugins.get('ai-copilot').exports
  const result = await copilot.planActions({ command: '给当前回帖点赞' })
  assert.equal(await ctx.w.LSB.bus.request('ai-copilot:reaction-scope-valid', { nonce: result.targetScopeNonce }), true)
  now += 10 * 60 * 1000 + 1
  assert.equal(await ctx.w.LSB.bus.request('ai-copilot:reaction-scope-valid', { nonce: result.targetScopeNonce }), false)
})

test('动作计划：用户说“点个赞”时也准备当前互动目标', async () => {
  const ctx = makeSite(topicHtml, 'https://linux.sb/topic/1')
  await load(ctx)
  ctx.w.eval(actionCode)
  ctx.w.eval(writeActionsCode)
  await sleep(30)
  let prompt = ''
  const siteFetch = ctx.w.fetch.bind(ctx.w)
  ctx.w.fetch = async (url, init = {}) => {
    const value = String(url)
    if (/linux\.sb/.test(value)) return siteFetch(url, init)
    const request = JSON.parse(init.body)
    prompt = request.messages?.[1]?.content || ''
    const catalogText = prompt.match(/<action-catalog>\n([\s\S]*?)\n<\/action-catalog>/)?.[1] || '[]'
    const catalog = JSON.parse(catalogText)
    const targetKey = catalog.find((item) => item.id === 'site.write-like-state')?.args?.targetKey?.values?.[0]
    return {
      status: 200,
      ok: true,
      url: value,
      text: async () => JSON.stringify({
        choices: [{ message: { content: JSON.stringify({
          version: 1,
          summary: '给当前回帖点赞',
          steps: [{ action: 'site.write-like-state', args: { targetKey, liked: true } }],
        }) } }],
      }),
    }
  }

  const copilot = ctx.w.LSB.__core.plugins.get('ai-copilot').exports
  const result = await copilot.planActions({ command: '给当前回帖点个赞' })
  assert.equal(result.plan.steps[0].action, 'site.write-like-state')
  assert.match(result.plan.steps[0].args.targetKey, /^target-/)
  assert.match(prompt, /<available-reaction-targets>/)
  assert.doesNotMatch(prompt, /"topicId"|"postId"|https?:\/\/|\/topic\/1/)
})

test('动作计划：模型提供的投币金额会被拒绝', async () => {
  const ctx = makeSite(topicHtml, 'https://linux.sb/topic/1')
  await load(ctx)
  ctx.w.eval(actionCode)
  ctx.w.eval(writeActionsCode)
  await sleep(30)
  const siteFetch = ctx.w.fetch.bind(ctx.w)
  ctx.w.fetch = async (url, init = {}) => {
    const value = String(url)
    if (/linux\.sb/.test(value)) return siteFetch(url, init)
    const request = JSON.parse(init.body)
    const user = request.messages?.[1]?.content || ''
    const catalogText = user.match(/<action-catalog>\n([\s\S]*?)\n<\/action-catalog>/)?.[1] || '[]'
    const targetKey = JSON.parse(catalogText).find((item) => item.id === 'site.write-coin')?.args?.targetKey?.values?.[0]
    return {
      status: 200,
      ok: true,
      url: value,
      text: async () => JSON.stringify({ choices: [{ message: { content: JSON.stringify({
        version: 1,
        summary: '给当前回帖投币',
        steps: [{ action: 'site.write-coin', args: { targetKey, coin: 5 } }],
      }) } }] }),
    }
  }

  const copilot = ctx.w.LSB.__core.plugins.get('ai-copilot').exports
  await assert.rejects(
    () => copilot.planActions({ command: '给当前回帖投币' }),
    /金额必须由你在工作台确认卡中选择|不能指定金额/,
  )
  const stored = [...Array(ctx.w.localStorage.length).keys()]
    .map((index) => ctx.w.localStorage.getItem(ctx.w.localStorage.key(index)))
    .join('\n')
  assert.doesNotMatch(stored, /"coin":5|target-/)
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

test('请求：成功结果写入缓存和问答会话，更新历史后相同问题重新生成', async () => {
  const ctx = makeSite(topicHtml, 'https://linux.sb/topic/1')
  const dbg = await load(ctx)
  const first = await dbg.run('ask', { question: '核心争议是什么？' })
  assert.equal(first.text, '【模型输出】')
  assert.equal(ctx.llmCalls(), 1)
  const second = await dbg.run('ask', { question: '核心争议是什么？' })
  assert.equal(second.text, '【模型输出】')
  assert.equal(ctx.llmCalls(), 2)
  assert.equal(JSON.stringify(dbg.sessionFor(1).map((row) => row.role)), JSON.stringify(['user', 'assistant', 'user', 'assistant']))
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
  await load(home)
  assert.equal(home.w.document.querySelector('.lsb-ai-copilot-top'), null)
  assert.ok(home.w.document.querySelector('.lsb-ai-console-top'))
})

test('M4 UI：普通页显示操作台入口，帖子页同时保留副驾入口', async () => {
  const topic = makeSite(topicHtml, 'https://linux.sb/topic/1')
  await load(topic)
  assert.ok(topic.w.document.querySelector('a.lsb-ai-console-top'))
  assert.ok(topic.w.document.querySelector('a.lsb-ai-copilot-top'))

  const home = makeSite(homeHtml, 'https://linux.sb/')
  const dbg = await load(home)
  assert.equal(home.w.document.querySelector('a.lsb-ai-copilot-top'), null)
  assert.ok(home.w.document.querySelector('a.lsb-ai-console-top'))
  assert.equal(dbg.state().page, 'home')
})

test('M4 UI：操作台顶栏入口应被站点首屏样式放行并可见', async () => {
  const home = makeSite(homeHtml, 'https://linux.sb/')
  await load(home)
  const link = home.w.document.querySelector('a.lsb-ai-console-top')
  assert.ok(link)
  assert.ok(link.classList.contains('forum-enhancements-custom-top-link'))
  assert.notEqual(home.w.getComputedStyle(link).display, 'none')
})

test('M4 UI：快捷问题填充输入框，面板显示范围提示且没有写操作按钮', async () => {
  const ctx = makeSite(topicHtml, 'https://linux.sb/topic/1')
  await load(ctx)
  ctx.w.document.querySelector('a.lsb-ai-console-top').click()
  const panel = ctx.w.document.querySelector('.lsb-ai-console-panel')
  assert.ok(panel.querySelector('[data-console-question]'))
  assert.ok(panel.querySelector('[data-console-run]'))
  assert.match(panel.textContent, /本地追踪项|活动追踪项/)
  panel.querySelector('[data-console-quick]').click()
  assert.equal(panel.querySelector('[data-console-question]').value, '当前帖子有哪些未解决问题？')
  assert.equal([...panel.querySelectorAll('button')].some((b) => /归档|接受|确认解决|发帖|发送/.test(b.textContent)), false)
})

test('M4 UI：查询显示两阶段进度、答案和结构化引用', async () => {
  const ctx = makeSite(topicHtml, 'https://linux.sb/topic/1', {
    _llmReplies: [
      { choices: [{ message: { content: '{"version":2,"intent":"question","includeCurrentTopic":true,"includeCurrentList":false,"includeArchived":false,"statuses":[],"topicIds":[],"terms":[]}' } }] },
      { choices: [{ message: { content: '结论见 [[topic:1 floor:12]]。' } }] },
    ],
  })
  await load(ctx)
  ctx.w.document.querySelector('a.lsb-ai-console-top').click()
  const panel = ctx.w.document.querySelector('.lsb-ai-console-panel')
  panel.querySelector('[data-console-question]').value = '依据是什么？'
  panel.querySelector('[data-console-run]').click()
  assert.ok(await until(() => panel.querySelector('[data-console-result]')))
  assert.match(panel.textContent, /结论见/)
  assert.ok(panel.querySelector('[data-console-citation="1:12"]'))
})

test('M4 生命周期：路由切换或停用后旧操作台请求不能回写', async () => {
  const ctx = makeSite(topicHtml, 'https://linux.sb/topic/1')
  await load(ctx)
  const release = ctx.holdLLM()
  ctx.w.document.querySelector('a.lsb-ai-console-top').click()
  const panel = ctx.w.document.querySelector('.lsb-ai-console-panel')
  panel.querySelector('[data-console-question]').value = '旧页面'
  panel.querySelector('[data-console-run]').click()
  assert.ok(await until(() => panel.querySelector('[data-console-stage]')))
  ctx.w.LSB.bus.emit('route:changed', { href: 'https://linux.sb/', page: { type: 'home' } }, { source: 'core' })
  release()
  await sleep(100)
  assert.equal(ctx.w.document.querySelector('.lsb-ai-console-panel'), null)
  ctx.w.LSB.disable('ai-copilot')
  assert.equal(ctx.w.document.querySelector('a.lsb-ai-console-top'), null)
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
    version: 2, intent: 'status-summary', includeCurrentTopic: true, includeCurrentList: false,
    includeArchived: true, statuses: [], topicIds: [], terms: [],
  }, { question: '汇总活动追踪项', catalog, currentTopicId: 1 })
  assert.equal(plan.includeArchived, false)
  assert.throws(() => dbg.normalizeConsolePlan({ version: 2, intent: 'question', includeCurrentTopic: false, includeCurrentList: false, includeArchived: false, statuses: [], topicIds: [], terms: [], write: true },
    { question: '查问题', catalog, currentTopicId: 1 }), /计划字段|未知字段/)
  assert.throws(() => dbg.normalizeConsolePlan({ version: 2, intent: 'question', includeCurrentTopic: true, includeCurrentList: false,
    includeArchived: false, statuses: ['未知状态'], topicIds: [], terms: [] },
    { question: '查问题', catalog, currentTopicId: 1 }), /状态/)
  const archived = dbg.normalizeConsolePlan({ version: 2, intent: 'question', includeCurrentTopic: false, includeCurrentList: false,
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
  const result = dbg.executeConsolePlan({ version: 2, intent: 'unresolved', includeCurrentTopic: false, includeCurrentList: false,
    includeArchived: false, statuses: [], topicIds: [2], terms: ['刷新'] }, {
    catalog: dbg.trackingTopicCatalog(), currentTopic: null, currentPosts: [],
  })
  assert.deepEqual(Array.from(result.items.map((item) => item.id)), ['active'])
  assert.equal(result.includedArchived, false)
  assert.equal(result.truncated, false)
})

test('M4 两阶段：阶段一只发送路由和主题目录，不发送追踪正文', async () => {
  const ctx = makeSite(topicHtml, 'https://linux.sb/topic/1', {
    _llmReplies: [
      { choices: [{ message: { content: '```json\n{"version":2,"intent":"unresolved","includeCurrentTopic":true,"includeCurrentList":false,"includeArchived":false,"statuses":[],"topicIds":[],"terms":[]}\n```' } }] },
      { choices: [{ message: { content: '当前有一个未解决问题 [[topic:1 floor:12]]' } }] },
    ],
  })
  const dbg = await load(ctx)
  const result = await dbg.runConsoleQuery({ question: '当前帖子有哪些未解决问题？' })
  assert.equal(ctx.llmCalls(), 2)
  const first = ctx.llmCallsAt(0)
  assert.match(first.body, /主题目录|topic-catalog/)
  assert.doesNotMatch(first.body, /追踪问题正文|来源摘要|证据摘录/)
  assert.match(result.text, /未解决问题/)
})

test('M4 查询计划：模型返回通用意图时按用户请求容错，不中断只读查询', async () => {
  const ctx = makeSite(topicHtml, 'https://linux.sb/topic/1', {
    _llmReplies: [
      { choices: [{ message: { content: JSON.stringify({ version: 2, intent: 'search', includeCurrentTopic: true, includeCurrentList: false, includeArchived: false, statuses: [], topicIds: [], terms: [] }) } }] },
      { choices: [{ message: { content: '当前主题的未解决问题需要逐项核对。' } }] },
    ],
  })
  const dbg = await load(ctx)

  const result = await dbg.runConsoleQuery({ question: '这篇帖子的未解决问题有哪些？' })

  assert.equal(result.plan.intent, 'unresolved')
  assert.match(result.text, /未解决问题/)
  assert.equal(ctx.llmCalls(), 2)
  const plannerRequest = ctx.llmCallsAt(0).body
  assert.match(plannerRequest, /unresolved、new-evidence、possibly-resolved、status-summary、question/)
  assert.match(plannerRequest, /不确定时用 question/)
})

test('操作台上下文：活动追踪范围会在本地拒绝模型加入当前帖子', async () => {
  const ctx = makeSite(topicHtml, 'https://linux.sb/topic/1', {
    _llmReply: { choices: [{ message: { content: JSON.stringify({ version: 2, intent: 'question', includeCurrentTopic: true, includeCurrentList: true, includeArchived: false, statuses: [], topicIds: [], terms: [] }) } }] },
  })
  const dbg = await load(ctx)
  const exported = ctx.w.LSB.__core.plugins.get('ai-copilot').exports

  const result = await exported.runConsoleQuery({ question: '汇总活动追踪项', scope: 'active-tracking' })

  assert.equal(result.plan.includeCurrentTopic, false)
  assert.equal(result.operationResults.currentTopic, null)
  assert.equal(ctx.llmCalls(), 1)
  assert.ok(dbg.state())
})

test('M5 当前上下文：实时读取并清理当前 DOM 列表', async () => {
  const ctx = makeSite(homeHtml, 'https://linux.sb/')
  const dbg = await load(ctx)
  const list = ctx.w.document.querySelector('ul.post-list')
  list.insertAdjacentHTML('beforeend', listRow())

  const first = dbg.consoleContext()

  assert.equal(first.currentListSupported, true)
  assert.deepEqual(Object.keys(first.currentList.at(-1)).sort(), [
    'authorName',
    'forumName',
    'id',
    'lastActiveTs',
    'pinned',
    'replies',
    'title',
  ])
  assert.equal(first.currentList.at(-1).id, 4321)
  assert.equal(first.currentList.at(-1).title, '实时列表主题')
  assert.equal(first.currentList.at(-1).authorName, '作者甲')
  assert.equal(first.currentList.at(-1).forumName, '技术交流')
  assert.equal(first.currentList.at(-1).replies, 23)
  assert.equal(first.currentList.at(-1).lastActiveTs, 1700000000)
  assert.equal(first.currentList.at(-1).pinned, true)
  assert.doesNotMatch(JSON.stringify(first.currentList), /authorId|9876|\/topic\/|\/user\/|<li|"el"/)

  list.querySelector('a[href="/topic/4321"]').textContent = '刷新后的标题'
  assert.equal(dbg.consoleContext().currentList.at(-1).title, '刷新后的标题')
})

test('M5 当前上下文：用户页只解析当前选项卡的主题列表', async () => {
  const ctx = makeSite('<!doctype html><html><body></body></html>', 'https://linux.sb/user/77?tab=topics')
  const dbg = await load(ctx)
  const list = ctx.w.document.createElement('ul')
  list.className = 'post-list'
  list.innerHTML = listRow({ id: 7777, title: '用户发表的主题' })
  ctx.w.document.body.append(list)

  const context = dbg.consoleContext()

  assert.equal(context.currentListSupported, true)
  assert.equal(context.currentList.length, 1)
  assert.equal(context.currentList[0].id, 7777)
  assert.equal(context.currentList[0].title, '用户发表的主题')
})

test('M5 当前上下文：首页、版块、搜索结果、精华和足迹页都解析已渲染列表', async () => {
  for (const path of ['/', '/forum/4', '/index.php?keyword=ai', '/search?keyword=ai', '/topic_featured', '/unread_topic_notice_footprint']) {
    const ctx = makeSite('<!doctype html><html><body></body></html>', `https://linux.sb${path}`)
    const dbg = await load(ctx)
    const list = ctx.w.document.createElement('ul')
    list.className = 'post-list'
    list.innerHTML = listRow({ id: 6001, title: '当前页主题' })
    ctx.w.document.body.append(list)

    const context = dbg.consoleContext()

    assert.equal(context.currentListSupported, true, path)
    assert.equal(context.currentList[0].id, 6001, path)
  }
})

test('M5 当前上下文：不支持列表的页面返回空结果', async () => {
  const ctx = makeSite(homeHtml, 'https://linux.sb/daily_checkin')
  const dbg = await load(ctx)

  const context = dbg.consoleContext()

  assert.equal(context.currentListSupported, false)
  assert.deepEqual(Array.from(context.currentList), [])
})

test('M5 计划：v2 必须含列表字段并在不可用或追踪范围收窄', async () => {
  const ctx = makeSite(homeHtml, 'https://linux.sb/')
  const dbg = await load(ctx)
  const context = dbg.consoleContext()
  context.currentListSupported = true
  context.currentList = [{ id: 4321, title: '实时列表主题', authorName: '作者甲', forumName: '技术交流', replies: 23, lastActiveTs: 1700000000, pinned: true }]
  const raw = {
    version: 2,
    intent: 'question',
    includeCurrentTopic: false,
    includeCurrentList: true,
    includeArchived: false,
    statuses: [],
    topicIds: [],
    terms: [],
  }

  assert.equal(dbg.normalizeConsolePlan(raw, { ...context, question: '查当前页列表' }).includeCurrentList, true)
  assert.throws(() => {
    const { includeCurrentList, ...incomplete } = raw
    return dbg.normalizeConsolePlan(incomplete, { ...context, question: '查当前页列表' })
  }, /字段/)
  assert.throws(() => dbg.normalizeConsolePlan({ ...raw, version: 1 }, { ...context, question: '查当前页列表' }), /版本/)
  assert.throws(() => dbg.normalizeConsolePlan({ ...raw, includeCurrentList: 'yes' }, { ...context, question: '查当前页列表' }), /布尔/)
  assert.equal(dbg.normalizeConsolePlan(raw, { ...context, question: '查当前页列表', currentListSupported: false }).includeCurrentList, false)
  assert.equal(dbg.normalizeConsolePlan(raw, { ...context, question: '查当前页列表', currentList: [] }).includeCurrentList, false)
  assert.equal(dbg.normalizeConsolePlan(raw, { ...context, question: '查当前页列表', forceTrackingOnly: true }).includeCurrentList, false)

  const request = dbg.buildConsolePlanRequest('查当前页列表', context)
  assert.match(request.system, new RegExp(`version 必须精确使用 ${dbg.consolePlanVersion}`))
  assert.match(request.user, /supported.*available.*count/)
  assert.doesNotMatch(request.user, /实时列表主题|作者甲|9876|\/user\//)
  const unavailable = { ...context, currentListSupported: false, currentList: [] }
  assert.notEqual(request.fingerprint, dbg.buildConsolePlanRequest('查当前页列表', unavailable).fingerprint)
})

test('M5 范围：活动追踪查询跳过当前列表读取', async () => {
  const ctx = makeSite(homeHtml, 'https://linux.sb/', {
    _llmReply: { choices: [{ message: { content: JSON.stringify({
      version: 2,
      intent: 'status-summary',
      includeCurrentTopic: false,
      includeCurrentList: true,
      includeArchived: false,
      statuses: [],
      topicIds: [],
      terms: [],
    }) } }] },
  })
  const dbg = await load(ctx)
  const context = dbg.consoleContext({ forceTrackingOnly: true })

  assert.equal(context.currentListSupported, false)
  assert.deepEqual(Array.from(context.currentList), [])

  const result = await dbg.runConsoleQuery({ question: '汇总活动追踪项', scope: 'active-tracking' })
  assert.equal(result.plan.includeCurrentList, false)
  assert.deepEqual(Array.from(result.operationResults.currentList), [])
  const planner = JSON.parse(ctx.llmCallsAt(0).body)
  assert.match(planner.messages.find((message) => message.role === 'user').content, /"count":0/)
})

test('M5 执行：筛选当前列表并只发送白名单主题字段', async () => {
  const ctx = makeSite(topicHtml, 'https://linux.sb/topic/1')
  const dbg = await load(ctx)
  const currentList = [
    { id: 4321, title: '缓存刷新方案', authorName: '作者甲', forumName: '技术交流', replies: 23, lastActiveTs: 1700000000, pinned: true, authorId: 9876, url: '/topic/4321', el: {} },
    { id: 4322, title: '显卡选购', authorName: '作者乙', forumName: '硬件交流', replies: 5, lastActiveTs: 1700000001, pinned: false },
    { id: 0, title: '无效 ID', authorName: '作者丙', forumName: '', replies: null, lastActiveTs: null, pinned: false },
  ]
  const context = { catalog: [], currentTopic: null, currentPosts: [], currentListSupported: true, currentList }
  const raw = {
    version: 2,
    intent: 'question',
    includeCurrentTopic: false,
    includeCurrentList: true,
    includeArchived: false,
    statuses: [],
    topicIds: [],
    terms: ['缓存'],
  }
  const plan = dbg.normalizeConsolePlan(raw, { ...context, question: '查缓存主题', currentTopicId: 0 })
  const result = dbg.executeConsolePlan(plan, context)

  assert.deepEqual(Array.from(result.currentList.map((row) => row.id)), [4321])
  assert.deepEqual(Object.keys(result.currentList[0]).sort(), [
    'authorName',
    'forumName',
    'id',
    'lastActiveTs',
    'pinned',
    'replies',
    'title',
  ])
  assert.doesNotMatch(JSON.stringify(result.currentList), /authorId|9876|"url"|\/topic\/4321|"el"/)
  assert.equal(result.references[0].href, '/topic/4321')
  assert.deepEqual(Array.from(result.references.map((row) => row.topicId)), [4321])

  const selected = dbg.normalizeConsolePlan({ ...raw, terms: [], topicIds: [4322] }, {
    ...context,
    question: '查指定主题',
    currentTopicId: 0,
  })
  assert.deepEqual(Array.from(dbg.executeConsolePlan(selected, context).currentList.map((row) => row.id)), [4322])
})

test('M5 执行：列表按 40 条和共享字符预算截断', async () => {
  const ctx = makeSite(topicHtml, 'https://linux.sb/topic/1')
  const dbg = await load(ctx)
  const currentList = Array.from({ length: 45 }, (_, index) => ({
    id: 5000 + index,
    title: '短标题',
    authorName: '作者',
    forumName: '',
    replies: 0,
    lastActiveTs: 0,
    pinned: false,
  }))
  const plan = {
    version: 2,
    intent: 'question',
    includeCurrentTopic: false,
    includeCurrentList: true,
    includeArchived: false,
    statuses: [],
    topicIds: [],
    terms: [],
  }
  const capped = dbg.executeConsolePlan(plan, { currentListSupported: true, currentList, catalog: [] })
  assert.equal(capped.currentList.length, 40)
  assert.equal(capped.truncated, true)

  const budgetLimited = dbg.executeConsolePlan({ ...plan, includeCurrentTopic: true }, {
    currentListSupported: true,
    currentList: [{ ...currentList[0], title: '列表'.repeat(1000) }],
    catalog: [],
    currentTopic: { id: 1, title: '当前主题' },
    currentPosts: [{ postId: 11, floor: 1, authorName: '作者', content: '楼层'.repeat(8500) }],
  })
  assert.ok(budgetLimited.chars <= 18000)
  assert.equal(budgetLimited.truncated, true)
  assert.equal(budgetLimited.currentList.length, 0)
})

test('M5 引用：主题级引用只映射本地 ID', async () => {
  const ctx = makeSite(topicHtml, 'https://linux.sb/topic/1')
  const dbg = await load(ctx)
  const references = [{ kind: 'topic', topicId: 4321, floor: 0, issueId: '', excerpt: '缓存刷新方案', href: '/topic/4321', known: true }]

  const citations = dbg.consoleCitationRecords('命中 [[topic:4321]]，另有 [[topic:9999]] https://evil.example', references)

  assert.equal(citations.find((row) => row.topicId === 4321).known, true)
  assert.equal(citations.find((row) => row.topicId === 4321).href, '/topic/4321')
  assert.equal(citations.find((row) => row.topicId === 9999).known, false)
  assert.equal(citations.find((row) => row.topicId === 9999).href, null)
})

test('M5 两阶段：当前列表可用并只发送本地白名单数据', async () => {
  const ctx = makeSite(homeHtml, 'https://linux.sb/?session-secret=hidden', {
    _llmReplies: [
      { choices: [{ message: { content: JSON.stringify({ version: 2, intent: 'question', includeCurrentTopic: false, includeCurrentList: true, includeArchived: false, statuses: [], topicIds: [], terms: [] }) } }] },
      { choices: [{ message: { content: '命中 [[topic:4321]]' } }] },
    ],
  })
  const dbg = await load(ctx)
  const list = ctx.w.document.querySelector('ul.post-list')
  list.querySelectorAll('li.post-item').forEach((row) => row.remove())
  list.insertAdjacentHTML('beforeend', listRow())

  const result = await dbg.runConsoleQuery({ question: '当前页有哪些主题？' })

  assert.equal(ctx.llmCalls(), 2)
  const plannerBody = JSON.stringify(ctx.llmCallsAt(0).body)
  const answerBody = JSON.stringify(ctx.llmCallsAt(1).body)

  assert.match(plannerBody, /includeCurrentList/)
  assert.doesNotMatch(plannerBody, /session-secret|hidden/)
  assert.doesNotMatch(plannerBody, /实时列表主题|作者甲|9876|\/topic\/4321/)
  assert.match(answerBody, /实时列表主题/)
  assert.match(answerBody, /作者甲/)
  assert.match(answerBody, /\[\[topic:<id>\]\]/)
  assert.doesNotMatch(answerBody, /authorId|\/user\/9876|"references"|\/topic\/4321|<li/)
  assert.doesNotMatch(answerBody, /session-secret|hidden/)
  assert.deepEqual(Object.keys(result.operationResults.currentList[0]).sort(), [
    'authorName',
    'forumName',
    'id',
    'lastActiveTs',
    'pinned',
    'replies',
    'title',
  ])
  assert.equal(result.meta.citations.find((row) => row.topicId === 4321).known, true)
  assert.equal(result.meta.citations.find((row) => row.topicId === 4321).href, '/topic/4321')
})

test('M5 UI：当前列表引用显示可点击的主题级链接', async () => {
  const ctx = makeSite(homeHtml, 'https://linux.sb/', {
    _llmReplies: [
      { choices: [{ message: { content: JSON.stringify({ version: 2, intent: 'question', includeCurrentTopic: false, includeCurrentList: true, includeArchived: false, statuses: [], topicIds: [], terms: [] }) } }] },
      { choices: [{ message: { content: '找到主题 [[topic:4321]]' } }] },
    ],
  })
  await load(ctx)
  const list = ctx.w.document.querySelector('ul.post-list')
  list.querySelectorAll('li.post-item').forEach((row) => row.remove())
  list.insertAdjacentHTML('beforeend', listRow())
  ctx.w.document.querySelector('a.lsb-ai-console-top').click()
  const panel = ctx.w.document.querySelector('.lsb-ai-console-panel')
  panel.querySelector('[data-console-question]').value = '当前页有哪些主题？'
  panel.querySelector('[data-console-run]').click()

  assert.ok(await until(() => panel.querySelector('[data-console-result]')))
  const citation = panel.querySelector('[data-console-citation="4321:0"] a')
  assert.equal(citation?.textContent, '主题 #4321')
  assert.equal(citation?.getAttribute('href'), '/topic/4321')
  assert.match(panel.textContent, /1 个当前列表主题/)
  assert.doesNotMatch(panel.textContent, /主题 #4321 · #0/)
})

test('M5 边界：空/不支持的列表正确说明且不请求站点', async () => {
  const planReply = { choices: [{ message: { content: JSON.stringify({
    version: 2,
    intent: 'question',
    includeCurrentTopic: false,
    includeCurrentList: true,
    includeArchived: false,
    statuses: [],
    topicIds: [],
    terms: [],
  }) } }] }

  const empty = makeSite(homeHtml, 'https://linux.sb/', { _llmReply: planReply })
  const emptyDbg = await load(empty)
  empty.w.document.querySelectorAll('li.post-item').forEach((row) => row.remove())
  const emptyResult = await emptyDbg.runConsoleQuery({ question: '当前页有哪些主题？' })
  assert.equal(empty.llmCalls(), 1)
  assert.match(emptyResult.text, /当前列表为空/)
  assert.equal(emptyResult.operationResults.currentListEmpty, true)

  const withTracking = makeSite(homeHtml, 'https://linux.sb/', {
    _llmReplies: [planReply, { choices: [{ message: { content: '本地追踪项仍可供回答。' } }] }],
  })
  const trackingDbg = await load(withTracking)
  withTracking.w.document.querySelectorAll('li.post-item').forEach((row) => row.remove())
  trackingDbg.createTrackingIssue(4321, { title: '本地问题', question: '追踪问题内容', floors: [1], excerpt: '本地追踪证据' })
  const trackingResult = await trackingDbg.runConsoleQuery({ question: '当前页列表和追踪问题' })
  assert.equal(withTracking.llmCalls(), 2)
  assert.match(trackingResult.text, /本地追踪项仍可供回答/)
  assert.equal(trackingResult.operationResults.currentListEmpty, true)
  assert.equal(trackingResult.operationResults.items.length, 1)

  const unsupported = makeSite(homeHtml, 'https://linux.sb/daily_checkin', { _llmReply: planReply })
  const unsupportedDbg = await load(unsupported)
  const unsupportedResult = await unsupportedDbg.runConsoleQuery({ question: '当前页有哪些主题？' })
  assert.equal(unsupported.llmCalls(), 1)
  assert.equal(unsupportedResult.plan.includeCurrentList, false)
  assert.equal(unsupported.calls.filter((call) => /linux\.sb/.test(call.url)).length, 0)
})

test('M5 缓存：列表变化只使答案缓存失效，列表可用状态变化使计划指纹失效', async () => {
  const planReply = { choices: [{ message: { content: JSON.stringify({
    version: 2,
    intent: 'question',
    includeCurrentTopic: false,
    includeCurrentList: true,
    includeArchived: false,
    statuses: [],
    topicIds: [],
    terms: [],
  }) } }] }
  const ctx = makeSite(homeHtml, 'https://linux.sb/', {
    _llmReplies: [
      planReply,
      { choices: [{ message: { content: '第一次回答 [[topic:4321]]' } }] },
      { choices: [{ message: { content: '更新后回答 [[topic:4321]]' } }] },
    ],
  })
  const dbg = await load(ctx)
  const list = ctx.w.document.querySelector('ul.post-list')
  list.querySelectorAll('li.post-item').forEach((row) => row.remove())
  list.insertAdjacentHTML('beforeend', listRow())

  const first = await dbg.runConsoleQuery({ question: '当前页有哪些主题？' })
  assert.equal(first.text, '第一次回答 [[topic:4321]]')
  list.querySelector('a[href="/topic/4321"]').textContent = '修改后的列表标题'
  const second = await dbg.runConsoleQuery({ question: '当前页有哪些主题？' })

  assert.equal(ctx.llmCalls(), 3)
  assert.equal(second.text, '更新后回答 [[topic:4321]]')
  assert.match(JSON.stringify(ctx.llmCallsAt(2).body), /修改后的列表标题/)

  const context = dbg.consoleContext()
  const availableRequest = dbg.buildConsolePlanRequest('查当前页列表', context)
  const unavailableRequest = dbg.buildConsolePlanRequest('查当前页列表', {
    ...context,
    currentListSupported: false,
    currentList: [],
  })
  assert.notEqual(availableRequest.fingerprint, unavailableRequest.fingerprint)
})

test('AI 副驾进度事件：帖子问答按实际读取和引用校验顺序报告', async () => {
  const ctx = makeSite(topicHtml, 'https://linux.sb/topic/1?session-secret=hidden', {
    _llmReply: { choices: [{ message: { content: '依据当前回复 [#12] 作答。' } }] },
  })
  const dbg = await load(ctx)
  const exported = ctx.w.LSB.__core.plugins.get('ai-copilot').exports
  const events = []

  await exported.runTopic('ask', {
    question: '解释缓存策略 private-user-question',
    onProgress: (event) => events.push(event),
  })

  assert.ok(events.length >= 4, 'context、answer 和 evidence 都应有可观察阶段')
  assert.deepEqual(Object.keys(events[0]).sort(), ['stage', 'state', 'summary'])
  assert.equal(events[0].stage, 'understand')
  assert.equal(events[0].state, 'complete')
  assert.equal(events.find((event) => event.stage === 'context' && event.state === 'complete')?.summary.includes('主题 #1'), true)
  assert.ok(events.findIndex((event) => event.stage === 'context' && event.state === 'complete') < events.findIndex((event) => event.stage === 'answer' && event.state === 'active'))
  assert.match(events.find((event) => event.stage === 'evidence' && event.state === 'complete')?.summary || '', /1.*验证|验证.*1/)
  assert.ok(events.every((event) => event.summary.length <= 200))
  assert.doesNotMatch(JSON.stringify(events), /private-user-question|session-secret|API Key|cookie/i)
  assert.equal(dbg.state().page, 'topic')
})

test('AI 副驾进度事件：操作台只报告计划、本地筛选和验证摘要并兼容旧阶段回调', async () => {
  const ctx = makeSite(topicHtml, 'https://linux.sb/topic/1', {
    _llmReplies: [
      { choices: [{ message: { content: JSON.stringify({ version: 2, intent: 'question', includeCurrentTopic: false, includeCurrentList: false, includeArchived: false, statuses: [], topicIds: [1], terms: [] }) } }] },
      { choices: [{ message: { content: '依据 [[topic:1 floor:12]] 可继续观察。' } }] },
    ],
  })
  const dbg = await load(ctx)
  dbg.createTrackingIssue(1, { question: '缓存是否会更新？', floors: [12], excerpt: '秘密楼层正文不可进入阶段摘要' }, {
    citations: [{ floor: 12, postId: '90012', excerpt: '秘密楼层正文不可进入阶段摘要' }],
  })
  const exported = ctx.w.LSB.__core.plugins.get('ai-copilot').exports
  const events = []
  const legacyStages = []

  const result = await exported.runConsoleQuery({
    question: 'private-user-question',
    onProgress: (event) => events.push(event),
    onStage: (stage) => legacyStages.push(stage),
  })

  assert.match(result.text, /继续观察/)
  assert.deepEqual(legacyStages, ['plan', 'local', 'answer'])
  assert.equal(events[0].stage, 'understand')
  assert.ok(events.findIndex((event) => event.stage === 'local' && event.state === 'complete') < events.findIndex((event) => event.stage === 'answer' && event.state === 'active'))
  assert.match(events.find((event) => event.stage === 'local' && event.state === 'complete')?.summary || '', /1/)
  assert.match(events.find((event) => event.stage === 'evidence' && event.state === 'complete')?.summary || '', /1.*验证|验证.*1/)
  assert.ok(events.every((event) => event.summary.length <= 200))
  assert.doesNotMatch(JSON.stringify(events), /private-user-question|秘密楼层正文不可进入阶段摘要|90012|API Key|cookie/i)
})

test('M4 两阶段：模型越权包含归档会被收窄，空结果不调用答案阶段', async () => {
  const ctx = makeSite(topicHtml, 'https://linux.sb/topic/1', {
    _llmReplies: [{ choices: [{ message: { content: JSON.stringify({ version: 2, intent: 'question', includeCurrentTopic: false, includeCurrentList: false, includeArchived: true, statuses: [], topicIds: [], terms: ['绝不存在'] }) } }] }],
  })
  const dbg = await load(ctx)
  const result = await dbg.runConsoleQuery({ question: '查找绝不存在的问题' })
  assert.equal(ctx.llmCalls(), 1)
  assert.equal(result.plan.includeArchived, false)
  assert.equal(result.operationResults.items.length, 0)
})

test('M4 答案：只接受本地存在的结构化引用，未知引用标记未验证', async () => {
  const ctx = makeSite(topicHtml, 'https://linux.sb/topic/1', {
    _llmReplies: [
      { choices: [{ message: { content: '{"version":2,"intent":"question","includeCurrentTopic":true,"includeCurrentList":false,"includeArchived":false,"statuses":[],"topicIds":[],"terms":[]}' } }] },
      { choices: [{ message: { content: '依据 [[topic:1 floor:12]] 和 [[topic:999 floor:1]]' } }] },
    ],
  })
  const dbg = await load(ctx)
  const result = await dbg.runConsoleQuery({ question: '依据是什么？' })
  assert.equal(result.meta.citations.find((row) => row.topicId === 1 && row.floor === 12).known, true)
  assert.equal(result.meta.citations.find((row) => row.topicId === 999).known, false)
})

test('M4 缓存：相同操作台问题复用计划和答案，强制查询才再次调用模型', async () => {
  const ctx = makeSite(topicHtml, 'https://linux.sb/topic/1', {
    _llmReplies: [
      { choices: [{ message: { content: '{"version":2,"intent":"question","includeCurrentTopic":true,"includeCurrentList":false,"includeArchived":false,"statuses":[],"topicIds":[],"terms":[]}' } }] },
      { choices: [{ message: { content: '缓存答案 [[topic:1 floor:12]]' } }] },
      { choices: [{ message: { content: '{"version":2,"intent":"question","includeCurrentTopic":true,"includeCurrentList":false,"includeArchived":false,"statuses":[],"topicIds":[],"terms":[]}' } }] },
      { choices: [{ message: { content: '强制答案 [[topic:1 floor:12]]' } }] },
    ],
  })
  const dbg = await load(ctx)
  await dbg.runConsoleQuery({ question: '缓存问题' })
  assert.equal(ctx.llmCalls(), 2)
  await dbg.runConsoleQuery({ question: '缓存问题' })
  assert.equal(ctx.llmCalls(), 2)
  await dbg.runConsoleQuery({ question: '缓存问题', force: true })
  assert.equal(ctx.llmCalls(), 4)
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

function researchResultsHtml(rows, pages = [1]) {
  const pageLinks = pages.map((page) => `<a href="/index.php?q=kernel&amp;field=title&amp;p=${page}">${page}</a>`).join('')
  return `<!doctype html><html><body><ul class="post-list">${rows.map((row) => listRow(row)).join('')}</ul>` +
    `<nav class="pagination">${pageLinks}</nav></body></html>`
}

function researchUserRepliesHtml(rows, uid = 5372, pages = [1]) {
  const pageLinks = pages.map((page) => `<a href="/user/${uid}?tab=replies&amp;p=${page}">${page}</a>`).join('')
  return `<!doctype html><html><body><div class="forum-main"><div class="tab-bar">` +
    `<a class="tab active" href="/user/${uid}?tab=replies">回帖</a></div><ul class="post-list">` +
    rows.map((row) => `<li class="post-item"><a class="post-title" href="/topic/${row.topicId}?replyid=${row.postId}">${row.topicTitle}</a></li>`).join('') +
    `</ul><nav class="pagination">${pageLinks}</nav></div></body></html>`
}

function researchTopicHtml({ id, title, posts, page = 1, maxPage = 2 }) {
  const entries = posts.map((post) => `<li class="post-entry" id="post-${post.postId}" data-floor="${post.floor}">` +
    `<a class="post-title post-author" href="/user/900">${post.authorName || '作者'}</a>` +
    `<div class="post-content">${post.content}</div></li>`).join('')
  const pageLinks = Array.from({ length: maxPage }, (_, index) => {
    const number = index + 1
    return `<li${number === page ? ' class="active"' : ''}><a href="/topic/${id}?p=${number}">${number}</a></li>`
  }).join('')
  return `<!doctype html><html><head><link rel="canonical" href="https://linux.sb/topic/${id}"></head><body>` +
    `<h1 class="post-content-title">${title}</h1><nav class="breadcrumb"><a href="/forum/4">技术交流</a></nav>` +
    `<ul class="topic-post-list">${entries}</ul><nav class="pagination"><ul>${pageLinks}</ul></nav></body></html>`
}

function replyableResearchTopicHtml(options, csrf = 'target-csrf-token') {
  const html = researchTopicHtml(options)
  const form = `<form class="ajax-reply-form" method="post" action="/reply_edit">` +
    `<input type="hidden" name="_csrf" value="${csrf}"><input type="hidden" name="topic_id" value="${options.id}">` +
    '<textarea name="body"></textarea></form>'
  return html.replace('</body>', `${form}</body>`)
}

test('M9 已选目标回复：仅暴露一个已验证候选及其正文，不暴露站点 ID 或 CSRF', async () => {
  const ctx = makeSite(homeHtml, 'https://linux.sb/', {
    _llmReplies: [
      { choices: [{ message: { content: JSON.stringify({ version: 1, query: 'kernel', field: 'title' }) } }] },
      { choices: [{ message: { content: JSON.stringify({
        version: 1, summary: '打开首页', steps: [{ action: 'site.navigate', args: { target: 'home' } }],
      }) } }] },
    ],
    _sitePages: {
      '/index.php?q=kernel&field=title': researchResultsHtml([
        { id: 7901, title: '已选回复主题' },
        { id: 7902, title: '未选回复主题' },
      ]),
      '/topic/7901': replyableResearchTopicHtml({
        id: 7901,
        title: '已选回复主题',
        posts: [
          { postId: 79010, floor: 0, authorName: '楼主', content: 'M9_SELECTED_THREAD_CONTEXT' },
          { postId: 79011, floor: 4, authorName: '回帖作者', content: 'M9_SELECTED_FLOOR_CONTEXT' },
        ],
      }),
      '/topic/7902': replyableResearchTopicHtml({
        id: 7902,
        title: '未选回复主题',
        posts: [{ postId: 79020, floor: 0, authorName: '楼主', content: 'M9_UNSELECTED_CONTEXT' }],
      }),
    },
  })
  await load(ctx)
  ctx.w.eval(actionCode)
  ctx.w.eval(writeActionsCode)
  await sleep(30)
  const copilot = ctx.w.LSB.__core.plugins.get('ai-copilot').exports
  const found = await copilot.startResearch({ question: '搜索 kernel' })
  const topicRequestsBeforePlan = ctx.calls.filter((call) => new URL(call.url).pathname === '/topic/7901')
  await assert.rejects(() => copilot.planActions({
    command: '回复我选中的主题',
    targetScope: { researchId: found.researchId, topicIds: [], postIds: [] },
  }), /只选择一个|选择一个回复目标/)
  await assert.rejects(() => copilot.planActions({
    command: '回复我选中的主题',
    targetScope: { researchId: found.researchId, topicIds: [7901, 7902], postIds: [] },
  }), /只选择一个|选择一个回复目标/)
  assert.equal(ctx.calls.filter((call) => new URL(call.url).pathname === '/topic/7901').length, topicRequestsBeforePlan.length)

  let prompt = ''
  let selectedKey = ''
  const siteFetch = ctx.w.fetch.bind(ctx.w)
  ctx.w.fetch = async (url, init = {}) => {
    if (String(url) === LLM) {
      const request = JSON.parse(init.body)
      prompt = request.messages.find((message) => message.role === 'user')?.content || ''
      const catalog = JSON.parse(prompt.match(/<action-catalog>\n([\s\S]*?)\n<\/action-catalog>/)?.[1] || '[]')
      const replyAction = catalog.find((action) => action.id === 'site.write-selected-reply')
      selectedKey = replyAction?.args?.targetKey?.values?.[0] || ''
      return {
        status: 200,
        ok: true,
        url: String(url),
        text: async () => JSON.stringify({ choices: [{ message: { content: JSON.stringify({
          version: 1,
          summary: '回复已选主题',
          steps: [{ action: 'site.write-selected-reply', args: { targetKey: selectedKey, body: '根据已选讨论整理的回复草稿。' } }],
        }) } }] }),
      }
    }
    return siteFetch(url, init)
  }

  const planned = await copilot.planActions({
    command: '请回复我选中的主题，基于楼层讨论说明下一步验证方式。',
    targetScope: { researchId: found.researchId, topicIds: [7901], postIds: [] },
  })
  assert.equal(planned.plan.steps[0].action, 'site.write-selected-reply')
  assert.equal(planned.plan.steps[0].args.targetKey, selectedKey)
  assert.match(prompt, /M9_SELECTED_THREAD_CONTEXT/)
  assert.doesNotMatch(prompt, /M9_UNSELECTED_CONTEXT/)
  assert.doesNotMatch(prompt, /7901|79010|target-csrf-token/)
  assert.match(prompt, /已选回复主题/)
  assert.ok(selectedKey.startsWith('target-'))
  const stored = [...Array(ctx.w.localStorage.length).keys()]
    .map((index) => ctx.w.localStorage.getItem(ctx.w.localStorage.key(index))).join('\n')
  assert.doesNotMatch(stored, /target-|7901|79010|target-csrf-token|根据已选讨论整理的回复草稿/)
})

test('M9 已选本人回帖回复：目标楼层由原帖验证，模型只获得该回帖上下文', async () => {
  const ctx = makeSite(homeHtml, 'https://linux.sb/', {
    _llmReply: { choices: [{ message: { content: JSON.stringify({ version: 1, query: '内核', field: 'reply' }) } }] },
    _sitePages: {
      '/user/5372?tab=replies': researchUserRepliesHtml([
        { postId: 8101, topicId: 7901, topicTitle: '内核本人回帖目标' },
      ]),
      '/topic/7901?replyid=8101': replyableResearchTopicHtml({
        id: 7901,
        title: '内核本人回帖目标',
        page: 2,
        posts: [
          { postId: 79010, floor: 0, authorName: '楼主', content: '不应进入选中楼层上下文' },
          { postId: 8101, floor: 7, authorName: '本人作者', content: 'M9_SELECTED_REPLY_ONLY' },
          { postId: 8102, floor: 8, authorName: '其他作者', content: 'M9_OTHER_FLOOR' },
        ],
      }),
    },
  })
  await load(ctx)
  ctx.w.eval(actionCode)
  ctx.w.eval(writeActionsCode)
  await sleep(30)
  const copilot = ctx.w.LSB.__core.plugins.get('ai-copilot').exports
  const found = await copilot.startResearch({ question: '搜索我的内核回帖', source: 'my-replies' })
  assert.deepEqual(Array.from(found.replyCandidates, (row) => row.postId), [8101])

  let prompt = ''
  let key = ''
  const siteFetch = ctx.w.fetch.bind(ctx.w)
  ctx.w.fetch = async (url, init = {}) => {
    if (String(url) === LLM) {
      const request = JSON.parse(init.body)
      prompt = request.messages.find((message) => message.role === 'user')?.content || ''
      const catalog = JSON.parse(prompt.match(/<action-catalog>\n([\s\S]*?)\n<\/action-catalog>/)?.[1] || '[]')
      key = catalog.find((action) => action.id === 'site.write-selected-reply')?.args?.targetKey?.values?.[0] || ''
      return {
        status: 200,
        ok: true,
        url: String(url),
        text: async () => JSON.stringify({ choices: [{ message: { content: JSON.stringify({
          version: 1,
          summary: '回复已选楼层',
          steps: [{ action: 'site.write-selected-reply', args: { targetKey: key, body: '围绕该楼层整理的回复。' } }],
        }) } }] }),
      }
    }
    return siteFetch(url, init)
  }

  const plan = await copilot.planActions({
    command: '请回复我选中的楼层，说明你对这个观点的看法。',
    targetScope: { researchId: found.researchId, topicIds: [], postIds: [8101] },
  })
  assert.equal(plan.plan.steps[0].action, 'site.write-selected-reply')
  const available = JSON.parse(prompt.match(/<available-reply-targets>\n([\s\S]*?)\n<\/available-reply-targets>/)?.[1] || '[]')
  assert.equal(available.length, 1)
  assert.equal(available[0].type, 'reply')
  assert.equal(available[0].floor, 7)
  assert.match(available[0].context, /M9_SELECTED_REPLY_ONLY/)
  assert.doesNotMatch(available[0].context, /不应进入选中楼层上下文|M9_OTHER_FLOOR/)
  assert.doesNotMatch(prompt, /7901|8101|target-csrf-token/)
  assert.ok(key.startsWith('target-'))
})

test('M6 检索计划：字段、查询词和个人来源由本地约束', async () => {
  const resultHtml = researchResultsHtml([{ id: 7601, title: '跨主题候选标题', authorId: 9876, author: '候选作者' }], [1, 2])
  const ctx = makeSite(homeHtml, 'https://linux.sb/', {
    _llmReply: { choices: [{ message: { content: JSON.stringify({ version: 1, query: 'cache refresh', field: 'body' }) } }] },
    _sitePages: { '/index.php?q=cache+refresh&field=body': resultHtml },
  })
  const dbg = await load(ctx)
  const copilot = ctx.w.LSB.__core.plugins.get('ai-copilot').exports
  assert.equal(typeof copilot.startResearch, 'function')
  assert.equal(dbg.resolveResearchSource('我想看我的收藏', 'auto'), 'my-favorites')
  assert.equal(dbg.resolveResearchSource('查找站内主题', 'auto'), 'site-search')
  assert.throws(() => dbg.normalizeResearchPlan({ version: 1, query: 'keyword', field: 'external' }, 'site-search'), /字段/)
  assert.throws(() => dbg.normalizeResearchPlan({ version: 1, query: 'https://evil.example', field: 'title' }, 'site-search'), /关键词/)
  assert.throws(() => dbg.normalizeResearchPlan({ version: 1, query: 'keyword', field: 'title', uid: 5372 }, 'site-search'), /字段/)
  const result = await copilot.startResearch({ question: '搜索站内缓存刷新的讨论' })
  assert.equal(result.source, 'site-search')
  assert.equal(result.query, 'cache refresh')
  assert.equal(result.field, 'body')
  assert.deepEqual(Array.from(result.candidates, (row) => row.id), [7601])
  assert.deepEqual(Object.keys(result.candidates[0]).sort(), [
    'authorName', 'forumName', 'id', 'lastActiveTs', 'pinned', 'replies', 'sourceFields', 'title',
  ])
  assert.deepEqual(Array.from(result.candidates[0].sourceFields), ['body'])
  assert.doesNotMatch(JSON.stringify(result.candidates), /9876|\/user\/|\/topic\/|<li|"el"|authorId/)
  assert.match(JSON.stringify(ctx.llmCallsAt(0).body), /query.*field|field.*query/)
  assert.doesNotMatch(JSON.stringify(ctx.llmCallsAt(0).body), /9876|跨主题候选标题|候选作者/)
  assert.equal(ctx.calls.some((call) => new URL(call.url).pathname === '/search' && call.method === 'POST'), true)
  const storeText = [...Array(ctx.w.localStorage.length).keys()].map((index) => ctx.w.localStorage.getItem(ctx.w.localStorage.key(index))).join('\n')
  assert.doesNotMatch(storeText, /跨主题候选标题|候选作者|cache refresh/)

  const personal = makeSite(homeHtml, 'https://linux.sb/', {
    _llmReply: { choices: [{ message: { content: JSON.stringify({ version: 1, query: '内核', field: 'title' }) } }] },
    _sitePages: {
      '/user/5372?tab=favorites': researchResultsHtml([{ id: 7602, title: '内核收藏', author: '作者乙' }], [1, 2]),
      '/user/5372?tab=favorites&p=2': researchResultsHtml([{ id: 7603, title: '内核收藏续页', author: '作者丙' }], [1, 2]),
    },
  })
  await load(personal)
  const personalCopilot = personal.w.LSB.__core.plugins.get('ai-copilot').exports
  const personalResult = await personalCopilot.startResearch({ question: '找我的收藏里的内核主题' })
  assert.equal(personalResult.source, 'my-favorites')
  assert.equal(personalResult.field, 'title')
  assert.deepEqual(Array.from(personalResult.candidates, (row) => row.id), [7602])
  assert.equal(personalResult.hasNext, true)
  assert.equal(personal.calls.some((call) => call.url.includes('/user/5372?tab=favorites&p=2')), false)
  const personalNext = await personalCopilot.loadResearchCandidates({ researchId: personalResult.researchId, field: 'title', page: 2 })
  assert.deepEqual(Array.from(personalNext.candidates, (row) => row.id), [7602, 7603])
  assert.equal(personal.calls.some((call) => call.url.includes('/user/5372?tab=favorites')), true)
  assert.equal(personal.calls.some((call) => call.url.includes('/user/5372?tab=favorites&p=2')), true)
  assert.equal(personal.calls.some((call) => new URL(call.url).pathname === '/search'), false)
  assert.doesNotMatch(JSON.stringify(personal.llmCallsAt(0).body), /5372|\/user\//)

  const unauthorized = makeSite(homeHtml, 'https://linux.sb/', {
    _llmReply: { choices: [{ message: { content: JSON.stringify({ version: 1, query: 'topic', field: 'title', source: 'my-favorites', uid: 5372 }) } }] },
  })
  await load(unauthorized)
  const unauthorizedCopilot = unauthorized.w.LSB.__core.plugins.get('ai-copilot').exports
  await assert.rejects(() => unauthorizedCopilot.startResearch({ question: '搜索普通主题' }), /字段|计划/)
  assert.equal(unauthorized.calls.some((call) => new URL(call.url).pathname === '/search' || /\/user\//.test(call.url)), false)
})

test('M6 候选来源：访客不能读取本人列表', async () => {
  const guest = makeSite('<!doctype html><html><body><main>访客页面</main></body></html>', 'https://linux.sb/', {
    _llmReply: { choices: [{ message: { content: JSON.stringify({ version: 1, query: '', field: 'title' }) } }] },
  })
  await load(guest)
  const copilot = guest.w.LSB.__core.plugins.get('ai-copilot').exports
  assert.equal(typeof copilot.startResearch, 'function')
  await assert.rejects(() => copilot.startResearch({ question: '显示我的主题' }), /登录|身份|本人/)
  assert.equal(guest.calls.some((call) => /\/user\//.test(call.url)), false)
})

test('M7 本人回帖来源：明确选择后才逐页加载候选并按回帖 ID 去重', async () => {
  const ctx = makeSite(homeHtml, 'https://linux.sb/', {
    _llmReplies: [
      { choices: [{ message: { content: JSON.stringify({ version: 1, query: '内核', field: 'reply' }) } }] },
    ],
    _sitePages: {
      '/user/5372?tab=replies': researchUserRepliesHtml([
        { postId: 8102, topicId: 4321, topicTitle: '内核讨论' },
        { postId: 8104, topicId: 4322, topicTitle: '不相关主题' },
      ], 5372, [1, 2]),
      '/user/5372?tab=replies&p=2': researchUserRepliesHtml([
        { postId: 8102, topicId: 4321, topicTitle: '内核讨论' },
        { postId: 8103, topicId: 4323, topicTitle: '内核续帖' },
      ], 5372, [1, 2]),
    },
  })
  const dbg = await load(ctx)
  const copilot = ctx.w.LSB.__core.plugins.get('ai-copilot').exports
  assert.equal(dbg.resolveResearchSource('找我的回帖', 'auto'), 'my-replies')
  assert.equal(dbg.resolveResearchSource('搜索站内回帖', 'auto'), 'site-search')

  const found = await copilot.startResearch({ question: '找我的回帖：内核' })
  assert.equal(found.source, 'my-replies')
  assert.equal(found.field, 'reply')
  assert.deepEqual(JSON.parse(JSON.stringify(found.replyCandidates)), [
    { postId: 8102, topicId: 4321, topicTitle: '内核讨论' },
  ])
  assert.equal(found.hasNext, true)
  assert.equal(ctx.calls.some((call) => call.url === 'https://linux.sb/user/5372?tab=replies&p=2'), false)
  assert.equal(ctx.calls.some((call) => new URL(call.url).pathname === '/search'), false)
  assert.equal(ctx.calls.some((call) => new URL(call.url).pathname.startsWith('/topic/')), false)
  assert.doesNotMatch(JSON.stringify(ctx.llmCallsAt(0).body), /5372|\/user\//)

  const next = await copilot.loadResearchCandidates({ researchId: found.researchId, field: 'reply', page: 2 })
  assert.deepEqual(JSON.parse(JSON.stringify(next.replyCandidates)), [
    { postId: 8102, topicId: 4321, topicTitle: '内核讨论' },
    { postId: 8103, topicId: 4323, topicTitle: '内核续帖' },
  ])
  assert.equal(ctx.calls.some((call) => call.url === 'https://linux.sb/user/5372?tab=replies&p=2'), true)
  assert.equal(ctx.calls.some((call) => call.url === 'https://linux.sb/user/5372?tab=replies&p=3'), false)
  await assert.rejects(() => copilot.loadResearchCandidates({ researchId: found.researchId, field: 'title', page: 1 }), /字段|回帖|个人/)
  assert.equal(ctx.llmCalls(), 1)
})

test('M7 回帖读取：只读取所选回帖并把楼层引用映射到本地证据', async () => {
  const ctx = makeSite(homeHtml, 'https://linux.sb/', {
    _llmReplies: [
      { choices: [{ message: { content: JSON.stringify({ version: 1, query: '内核', field: 'reply' }) } }] },
      { choices: [{ message: { content: '这条回帖提出了关键原因 [[topic:4321 floor:8]]。' } }] },
    ],
    _sitePages: {
      '/user/5372?tab=replies': researchUserRepliesHtml([
        { postId: 8102, topicId: 4321, topicTitle: '内核讨论' },
        { postId: 8103, topicId: 4322, topicTitle: '内核方案' },
      ]),
      '/topic/4321?replyid=8102': researchTopicHtml({
        id: 4321,
        title: '内核讨论',
        page: 2,
        maxPage: 3,
        posts: [
          { postId: 8101, floor: 7, content: 'UNSELECTED_REPLY_SECRET' },
          { postId: 8102, floor: 8, authorName: '本人', content: 'SELECTED_REPLY_SECRET 这里是已选择回帖的证据。' },
        ],
      }),
      '/topic/4322?replyid=8103': researchTopicHtml({
        id: 4322,
        title: '内核方案',
        posts: [{ postId: 8103, floor: 3, content: 'OTHER_SELECTED_REPLY_SECRET' }],
      }),
    },
  })
  const dbg = await load(ctx)
  const copilot = ctx.w.LSB.__core.plugins.get('ai-copilot').exports
  assert.equal(typeof copilot.readResearchReplySelection, 'function')
  const found = await copilot.startResearch({ question: '找我的回帖：内核' })
  await assert.rejects(() => copilot.readResearchReplySelection({ researchId: found.researchId, postIds: [9999], question: '解释证据' }), /候选|回帖/)
  await assert.rejects(() => copilot.readResearchReplySelection({ researchId: found.researchId, postIds: [8102, 8102, 8103, 8104], question: '解释证据' }), /最多|重复|回帖/)
  assert.equal(ctx.calls.some((call) => new URL(call.url).pathname.startsWith('/topic/')), false)

  const result = await copilot.readResearchReplySelection({
    researchId: found.researchId,
    postIds: [8102],
    question: '解释这条回帖的依据',
  })
  assert.equal(ctx.calls.some((call) => call.url === 'https://linux.sb/topic/4321?replyid=8102'), true)
  assert.equal(ctx.calls.some((call) => call.url === 'https://linux.sb/topic/4322?replyid=8103'), false)
  assert.equal(ctx.llmCalls(), 2)
  const answerPrompt = JSON.parse(ctx.llmCallsAt(1).body).messages.find((message) => message.role === 'user').content
  assert.match(answerPrompt, /SELECTED_REPLY_SECRET/)
  assert.doesNotMatch(answerPrompt, /UNSELECTED_REPLY_SECRET|OTHER_SELECTED_REPLY_SECRET|5372|\/user\//)
  assert.equal(result.meta.readReplies[0].topicId, 4321)
  assert.equal(result.meta.readReplies[0].floor, 8)
  assert.equal(result.meta.readReplies[0].page, 2)
  assert.equal(result.meta.citations.find((citation) => citation.known).href, '/topic/4321?floor=8#post-8102')
  const storedText = [...Array(ctx.w.localStorage.length).keys()].map((index) => ctx.w.localStorage.getItem(ctx.w.localStorage.key(index))).join('\n')
  assert.doesNotMatch(storedText, /SELECTED_REPLY_SECRET|内核讨论/)
})

test('M6 候选来源：字段切换和加载下一页由用户显式触发并按 ID 合并', async () => {
  const bodyPage = researchResultsHtml([
    { id: 7701, title: '主题甲', author: '作者甲' },
    { id: 7702, title: '主题乙', author: '作者乙' },
  ], [1, 2])
  const titlePage = researchResultsHtml([
    { id: 7701, title: '主题甲', author: '作者甲' },
    { id: 7703, title: '主题丙', author: '作者丙' },
  ], [1, 2])
  const titlePage2 = researchResultsHtml([{ id: 7704, title: '主题丁', author: '作者丁' }], [1, 2])
  const ctx = makeSite(homeHtml, 'https://linux.sb/', {
    _llmReply: { choices: [{ message: { content: JSON.stringify({ version: 1, query: 'kernel', field: 'body' }) } }] },
    _sitePages: {
      '/index.php?q=kernel&field=body': bodyPage,
      '/index.php?q=kernel&field=title': titlePage,
      '/index.php?q=kernel&field=title&p=2': titlePage2,
    },
  })
  await load(ctx)
  const copilot = ctx.w.LSB.__core.plugins.get('ai-copilot').exports
  assert.equal(typeof copilot.loadResearchCandidates, 'function')
  const first = await copilot.startResearch({ question: '搜索 kernel 主题' })
  assert.deepEqual(Array.from(first.candidates, (row) => row.id), [7701, 7702])
  const beforeExpansion = ctx.calls.filter((call) => new URL(call.url).pathname === '/search').length
  const expanded = await copilot.loadResearchCandidates({ researchId: first.researchId, field: 'title', page: 1 })
  assert.equal(ctx.calls.filter((call) => new URL(call.url).pathname === '/search').length, beforeExpansion + 1)
  assert.deepEqual(Array.from(expanded.candidates, (row) => row.id), [7701, 7702, 7703])
  assert.deepEqual(Array.from(expanded.candidates.find((row) => row.id === 7701).sourceFields), ['body', 'title'])
  const next = await copilot.loadResearchCandidates({ researchId: first.researchId, field: 'title', page: 2 })
  assert.deepEqual(Array.from(next.candidates, (row) => row.id), [7701, 7702, 7703, 7704])
  assert.equal(ctx.calls.some((call) => call.url.includes('/index.php?q=kernel&field=title&p=2')), true)
  const pageCallsBefore = ctx.calls.filter((call) => call.url.includes('/index.php?q=kernel&field=title&p=3')).length
  await assert.rejects(() => copilot.loadResearchCandidates({ researchId: first.researchId, field: 'title', page: 3 }), /页|候选|范围/)
  await assert.rejects(() => copilot.loadResearchCandidates({ researchId: first.researchId, field: 'external', page: 1 }), /字段/)
  assert.equal(ctx.calls.filter((call) => call.url.includes('/index.php?q=kernel&field=title&p=3')).length, pageCallsBefore)
})

test('M6 候选来源：每页最多 40 条且检索会话最多保留 10 组', async () => {
  const rowsForPage = (start) => Array.from({ length: 40 }, (_, index) => ({
    id: start + index,
    title: `分页主题 ${start + index}`,
    author: '作者',
  }))
  const pages = [1, 2, 3, 4, 5, 6]
  const sitePages = {}
  for (let page = 1; page <= 6; page += 1) {
    const route = `/index.php?q=kernel&field=title${page > 1 ? `&p=${page}` : ''}`
    sitePages[route] = researchResultsHtml(rowsForPage(8000 + (page - 1) * 40), pages)
  }
  const ctx = makeSite(homeHtml, 'https://linux.sb/', {
    _llmReply: { choices: [{ message: { content: JSON.stringify({ version: 1, query: 'kernel', field: 'title' }) } }] },
    _sitePages: sitePages,
  })
  await load(ctx)
  const copilot = ctx.w.LSB.__core.plugins.get('ai-copilot').exports
  const first = await copilot.startResearch({ question: '搜索 kernel' })
  assert.equal(first.candidates.length, 40)
  assert.equal(first.truncated, false)
  let latest = first
  for (let page = 2; page <= 6; page += 1) {
    latest = await copilot.loadResearchCandidates({ researchId: first.researchId, field: 'title', page })
  }
  assert.equal(latest.candidates.length, 200)
  assert.equal(latest.truncated, true)

  const sessionIds = [first.researchId]
  for (let index = 1; index < 11; index += 1) {
    const session = await copilot.startResearch({ question: `搜索 kernel ${index}` })
    sessionIds.push(session.researchId)
  }
  const callsBeforeExpiredSession = ctx.calls.filter((call) => new URL(call.url).pathname === '/search').length
  await assert.rejects(() => copilot.loadResearchCandidates({ researchId: sessionIds[0], field: 'title', page: 1 }), /失效|重新搜索/)
  assert.equal(ctx.calls.filter((call) => new URL(call.url).pathname === '/search').length, callsBeforeExpiredSession)
})

test('M6 读取：只能读取当前候选中最多 3 篇主题的第一页', async () => {
  const candidates = [7601, 7602, 7603, 7604].map((id) => ({ id, title: `选读主题 ${id}`, author: '作者' }))
  const ctx = makeSite(homeHtml, 'https://linux.sb/', {
    _llmReplies: [
      { choices: [{ message: { content: JSON.stringify({ version: 1, query: 'kernel', field: 'title' }) } }] },
      { choices: [{ message: { content: '已读取选中主题 [[topic:7601 floor:1]]，另有未验证楼层 [[topic:7601 floor:9]] 和未知主题 [[topic:9999 floor:1]]。https://evil.example' } }] },
    ],
    _sitePages: {
      '/index.php?q=kernel&field=title': researchResultsHtml(candidates),
      '/topic/7601': researchTopicHtml({
        id: 7601,
        title: '选读主题 7601',
        posts: [
          { postId: 76010, floor: 0, authorName: '主楼作者', content: '未选择前不得发送的帖子正文' },
          { postId: 76011, floor: 1, authorName: '回帖作者', content: 'FIRST_PAGE_SECRET 主楼回复证据' },
        ],
      }),
    },
  })
  await load(ctx)
  const copilot = ctx.w.LSB.__core.plugins.get('ai-copilot').exports
  assert.equal(typeof copilot.readResearchSelection, 'function')
  const found = await copilot.startResearch({ question: '搜索 kernel' })
  const topicRequestsBefore = ctx.calls.filter((call) => /\/topic\//.test(new URL(call.url).pathname))
  assert.equal(topicRequestsBefore.length, 0)
  await assert.rejects(() => copilot.readResearchSelection({ researchId: found.researchId, topicIds: [] }), /选择|主题/)
  await assert.rejects(() => copilot.readResearchSelection({ researchId: found.researchId, topicIds: [7601, 7602, 7603, 7604] }), /最多|3/)
  await assert.rejects(() => copilot.readResearchSelection({ researchId: found.researchId, topicIds: [7601, 9999] }), /候选|范围/)
  assert.equal(ctx.calls.filter((call) => /\/topic\//.test(new URL(call.url).pathname)).length, 0)

  const record = await copilot.readResearchSelection({ researchId: found.researchId, topicIds: [7601], question: '解释这个主题' })
  assert.equal(ctx.calls.filter((call) => new URL(call.url).pathname === '/topic/7601').length, 1)
  assert.equal(ctx.calls.some((call) => call.url.includes('/topic/7601?p=2')), false)
  assert.equal(ctx.llmCalls(), 2)
  const plannerBody = JSON.stringify(ctx.llmCallsAt(0).body)
  assert.doesNotMatch(plannerBody, /FIRST_PAGE_SECRET|选读主题 7601|主楼作者/)
  const answerRequest = JSON.parse(ctx.llmCallsAt(1).body)
  const answerPrompt = answerRequest.messages.find((message) => message.role === 'user').content
  assert.match(answerPrompt, /FIRST_PAGE_SECRET/)
  assert.doesNotMatch(answerPrompt, /未选择主题|evil\.example/)
  assert.equal(record.meta.citations.find((row) => row.topicId === 7601 && row.floor === 1).known, true)
  assert.equal(record.meta.citations.find((row) => row.topicId === 7601 && row.floor === 1).href, '/topic/7601?floor=1#post-76011')
  assert.equal(record.meta.citations.find((row) => row.topicId === 7601 && row.floor === 9).known, false)
  assert.equal(record.meta.citations.find((row) => row.topicId === 9999 && row.floor === 1).href, null)
  const storedText = [...Array(ctx.w.localStorage.length).keys()].map((index) => ctx.w.localStorage.getItem(ctx.w.localStorage.key(index))).join('\n')
  assert.doesNotMatch(storedText, /FIRST_PAGE_SECRET|选读主题 7601/)
})

test('M7 深读：仅逐页读取已选主题并在所有页面间共享预算', async () => {
  const ctx = makeSite(homeHtml, 'https://linux.sb/', {
    _llmReplies: [
      { choices: [{ message: { content: JSON.stringify({ version: 1, query: 'kernel', field: 'title' }) } }] },
      { choices: [{ message: { content: '第一页已读。' } }] },
      { choices: [{ message: { content: '第二页依据 [[topic:7631 floor:2]]。' } }] },
    ],
    _sitePages: {
      '/index.php?q=kernel&field=title': researchResultsHtml([
        { id: 7631, title: '深读主题' },
        { id: 7632, title: '未选主题' },
      ]),
      '/topic/7631': researchTopicHtml({
        id: 7631,
        title: '深读主题',
        posts: [{ postId: 76310, floor: 0, content: `FIRST_PAGE_SECRET ${'甲'.repeat(11000)}` }],
      }),
      '/topic/7631?p=2': researchTopicHtml({
        id: 7631,
        title: '深读主题',
        page: 2,
        posts: [{ postId: 76312, floor: 2, content: `PAGE_TWO_SECRET ${'乙'.repeat(11000)}` }],
      }),
    },
  })
  await load(ctx)
  const copilot = ctx.w.LSB.__core.plugins.get('ai-copilot').exports
  const found = await copilot.startResearch({ question: '搜索 kernel' })
  await assert.rejects(() => copilot.loadResearchTopicPage({
    researchId: found.researchId, topicId: 7631, page: 2, question: '继续读',
  }), /选择|已选|主题/)

  const first = await copilot.readResearchSelection({ researchId: found.researchId, topicIds: [7631], question: '总结主题' })
  assert.deepEqual(JSON.parse(JSON.stringify(first.meta.pageStates)), [{
    topicId: 7631, currentPage: 1, nextPage: 2, hasNext: true, truncated: false, failedPage: null, title: '深读主题',
  }])
  const topicGetsBeforeInvalid = ctx.calls.filter((call) => new URL(call.url).pathname === '/topic/7631').length
  await assert.rejects(() => copilot.loadResearchTopicPage({
    researchId: found.researchId, topicId: 7632, page: 2, question: '读未选主题',
  }), /选择|已选|范围/)
  await assert.rejects(() => copilot.loadResearchTopicPage({
    researchId: found.researchId, topicId: 7631, page: 3, question: '跳页',
  }), /下一页|页码/)
  assert.equal(ctx.calls.filter((call) => new URL(call.url).pathname === '/topic/7631').length, topicGetsBeforeInvalid)

  ctx.failTopicPages = true
  await assert.rejects(() => copilot.loadResearchTopicPage({
    researchId: found.researchId, topicId: 7631, page: 2, question: '继续读',
  }), /HTTP 500/)
  ctx.failTopicPages = false
  const second = await copilot.loadResearchTopicPage({
    researchId: found.researchId, topicId: 7631, page: 2, question: '继续读',
  })
  assert.equal(second.meta.pageStates[0].currentPage, 2)
  assert.equal(second.meta.pageStates[0].hasNext, false)
  assert.equal(second.meta.truncated, true)
  assert.ok(second.meta.chars <= 18000)
  assert.equal(ctx.calls.filter((call) => new URL(call.url).pathname === '/topic/7631' && new URL(call.url).searchParams.get('p') === '2').length, 2)
  await assert.rejects(() => copilot.loadResearchTopicPage({
    researchId: found.researchId, topicId: 7631, page: 2, question: '重复读取',
  }), /下一页|已读取/)
  assert.equal(ctx.llmCalls(), 3)
  const answerPrompt = JSON.parse(ctx.llmCallsAt(2).body).messages.find((message) => message.role === 'user').content
  assert.match(answerPrompt, /PAGE_TWO_SECRET/)
  const pagePayload = answerPrompt.match(/<selected-topic-pages>\n([\s\S]*?)\n<\/selected-topic-pages>/)?.[1]
  assert.ok(pagePayload)
  assert.ok(pagePayload.length <= 18000)
  assert.equal(second.meta.citations.find((row) => row.topicId === 7631 && row.floor === 2)?.page, 2)
  const storedText = [...Array(ctx.w.localStorage.length).keys()].map((index) => ctx.w.localStorage.getItem(ctx.w.localStorage.key(index))).join('\n')
  assert.doesNotMatch(storedText, /PAGE_TWO_SECRET|FIRST_PAGE_SECRET/)
})

test('M6 读取：共用 18000 字符预算并把小主题余量让给长主题', async () => {
  const ids = [7611, 7612, 7613]
  const ctx = makeSite(homeHtml, 'https://linux.sb/', {
    _llmReplies: [
      { choices: [{ message: { content: JSON.stringify({ version: 1, query: 'kernel', field: 'title' }) } }] },
      { choices: [{ message: { content: '基于所选主题回答。' } }] },
    ],
    _sitePages: {
      '/index.php?q=kernel&field=title': researchResultsHtml(ids.map((id) => ({ id, title: `预算主题 ${id}` }))),
      '/topic/7611': researchTopicHtml({ id: 7611, title: '预算主题 7611', posts: [{ postId: 76110, floor: 0, content: '短内容'.repeat(4) }] }),
      '/topic/7612': researchTopicHtml({ id: 7612, title: '预算主题 7612', posts: [{ postId: 76120, floor: 0, content: '甲'.repeat(13000) }] }),
      '/topic/7613': researchTopicHtml({ id: 7613, title: '预算主题 7613', posts: [{ postId: 76130, floor: 0, content: '乙'.repeat(13000) }] }),
    },
  })
  await load(ctx)
  const copilot = ctx.w.LSB.__core.plugins.get('ai-copilot').exports
  const found = await copilot.startResearch({ question: '搜索 kernel' })
  const record = await copilot.readResearchSelection({ researchId: found.researchId, topicIds: ids, question: '比较三个主题的讨论' })
  assert.ok(record.meta.chars <= 18000)
  assert.ok(record.meta.chars > 17000, `应把短主题未用预算重新分配，实际 ${record.meta.chars}`)
  assert.equal(record.meta.truncated, true)
  const answerRequest = JSON.parse(ctx.llmCallsAt(1).body)
  const answerPrompt = answerRequest.messages.find((message) => message.role === 'user').content
  const pages = JSON.parse(answerPrompt.match(/<selected-topic-pages>\n([\s\S]*?)\n<\/selected-topic-pages>/)[1])
  assert.ok(pages.find((topic) => topic.topicId === 7611).posts[0].content.length < 100)
  assert.ok(pages.find((topic) => topic.topicId === 7612).posts[0].content.length > 7000)
  assert.ok(pages.find((topic) => topic.topicId === 7613).posts[0].content.length > 7000)
})

test('M6 读取：部分失败可回答，全失败跳过回答模型', async () => {
  const candidates = [7621, 7622].map((id) => ({ id, title: `部分失败主题 ${id}` }))
  const config = {
    _llmReplies: [
      { choices: [{ message: { content: JSON.stringify({ version: 1, query: 'kernel', field: 'title' }) } }] },
      { choices: [{ message: { content: '成功主题依据 [[topic:7621 floor:1]]。' } }] },
    ],
    _sitePages: {
      '/index.php?q=kernel&field=title': researchResultsHtml(candidates),
      '/topic/7621': researchTopicHtml({ id: 7621, title: '部分失败主题 7621', posts: [{ postId: 76211, floor: 1, content: '可用证据' }] }),
    },
    _siteFailures: ['/topic/7622'],
  }
  const partial = makeSite(homeHtml, 'https://linux.sb/', config)
  await load(partial)
  const partialCopilot = partial.w.LSB.__core.plugins.get('ai-copilot').exports
  const partialFound = await partialCopilot.startResearch({ question: '搜索 kernel' })
  const partialRecord = await partialCopilot.readResearchSelection({ researchId: partialFound.researchId, topicIds: [7621, 7622], question: '归纳所选主题证据' })
  assert.equal(partialRecord.meta.partial, true)
  assert.deepEqual(Array.from(partialRecord.meta.failedTopicIds), [7622])
  assert.equal(partialRecord.meta.citations.find((row) => row.topicId === 7621 && row.floor === 1).known, true)
  assert.doesNotMatch(JSON.stringify(partial.llmCallsAt(1).body), /部分失败主题 7622|站点读取失败/)
  assert.equal(partial.llmCalls(), 2)

  const allFailed = makeSite(homeHtml, 'https://linux.sb/', {
    _llmReply: config._llmReplies[0],
    _sitePages: config._sitePages,
    _siteFailures: ['/topic/7621', '/topic/7622'],
  })
  await load(allFailed)
  const failedCopilot = allFailed.w.LSB.__core.plugins.get('ai-copilot').exports
  const failedFound = await failedCopilot.startResearch({ question: '搜索 kernel' })
  const failedRecord = await failedCopilot.readResearchSelection({ researchId: failedFound.researchId, topicIds: [7621, 7622], question: '归纳所选主题证据' })
  assert.equal(failedRecord.meta.empty, true)
  assert.equal(failedRecord.meta.citations.length, 0)
  assert.equal(allFailed.llmCalls(), 1)
})
