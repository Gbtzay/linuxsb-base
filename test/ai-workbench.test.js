import { test, afterEach } from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { JSDOM } from 'jsdom'

const baseCode = readFileSync(new URL('../dist-dev/linuxsb-base.user.js', import.meta.url), 'utf8')
const PLUG = (name) => readFileSync(new URL(`../plugins/${name}`, import.meta.url), 'utf8')
const topicHtml = readFileSync(new URL('./fixtures/topic1.html', import.meta.url), 'utf8')
const fixtureWindows = new Set()

afterEach(async () => {
  const windows = [...fixtureWindows]
  fixtureWindows.clear()
  try {
    for (const w of windows) if (w.document) w.LSB?.__core?.shutdown()
  } finally {
    await new Promise((resolve) => setTimeout(resolve, 0))
    for (const w of windows) if (w.document) w.close()
  }
})

function makeSite(width = 1200) {
  const dom = new JSDOM(topicHtml, { url: 'https://linux.sb/topic/1', runScripts: 'outside-only' })
  const w = dom.window
  fixtureWindows.add(w)
  w.unsafeWindow = w
  w.scrollTo = () => {}
  Object.defineProperty(w, 'innerWidth', { value: width, configurable: true })
  w.requestAnimationFrame = (fn) => w.setTimeout(() => fn(Date.now()), 1)
  w.cancelAnimationFrame = (timer) => w.clearTimeout(timer)
  w.localStorage.setItem('lsb_base:__core:rate', JSON.stringify(5))
  w.localStorage.setItem('lsb_base:__core:urlPoll', JSON.stringify(0))
  w.localStorage.setItem('lsb_base:skin:__config', JSON.stringify({ uiMode: 'ios27' }))
  w.localStorage.setItem(
    'lsb_base:ai-summary:__config',
    JSON.stringify({ apiUrl: 'https://api.example.com/v1/chat/completions', apiKey: 'k', model: 'test-model' }),
  )
  w.localStorage.setItem(
    'lsb_base:ai-copilot:__config',
    JSON.stringify({ fetchAll: false, maxPages: 15, maxChars: 12000, sessionTurns: 6 }),
  )
  w.fetch = async (url) => ({
    status: 200,
    ok: true,
    url: String(url),
    text: async () => JSON.stringify({ choices: [{ message: { content: '回答' } }] }),
  })
  return w
}

async function load(w) {
  w.eval(baseCode)
  w.eval(PLUG('skin.user.js'))
  w.eval(PLUG('ai-summary.user.js'))
  w.eval(PLUG('ai-actions.user.js'))
  w.eval(PLUG('ai-copilot.user.js'))
  w.eval(PLUG('ai-workbench.user.js'))
  await new Promise((resolve) => setTimeout(resolve, 100))
  const entry = w.document.querySelector('[data-canvas-open="ai-card"]')
  if (entry) {
    entry.click()
    await until(() => Boolean(w.document.querySelector('[data-surface="ai-card"] [data-ai-chat-input]')))
  }
}

async function until(fn, ms = 2000) {
  const end = Date.now() + ms
  while (Date.now() < end) {
    if (fn()) return true
    await new Promise((resolve) => setTimeout(resolve, 15))
  }
  return Boolean(fn())
}

test('旧三栏右栏选择 AI 后在栏内挂载工作台', async () => {
  const w = makeSite()
  w.localStorage.setItem('lsb_base:skin:__config', JSON.stringify({ uiMode: 'legacy' }))
  await load(w)

  const tab = w.document.querySelector('[data-lsb-shell-aside-tab="ai-workbench"]')
  assert.ok(tab, '旧三栏右栏提供 AI 标签')
  tab.click()
  const pane = w.document.querySelector('[data-lsb-shell-aside-pane="ai-workbench"]')
  assert.equal(pane?.querySelector('[data-ai-workbench]') != null, true, '工作台内容应由右栏视图渲染器直接挂载')
  assert.equal(pane?.querySelector('[data-lsb-shell-window-proxy]'), null, '旧三栏不显示独立窗口代理提示')
})
test('M15 空会话显示欢迎态和单一 Gemini composer，不显示旧能力选项卡', async () => {
  const w = makeSite()
  await load(w)
  const wb = w.document.querySelector('[data-ai-workbench]')
  assert.ok(wb.querySelector('[data-ai-workbench-welcome]'))
  assert.ok(wb.querySelector('[data-ai-workbench-star]'))
  assert.ok(wb.querySelector('[data-ai-workbench-composer-shell]'))
  assert.equal(wb.querySelector('[data-ai-chat-mode-options]')?.hidden, true)
  assert.doesNotMatch(wb.querySelector('[data-ai-workbench-topbar]').textContent, /@ 当前页面|\/ 提问|Smart/)
})

test('M17 单画布 AI 卡挂载工作台后隐藏重复外层标题', async () => {
  const w = makeSite()
  await load(w)
  const style = w.document.getElementById('lsb-skin-style')?.textContent || ''
  const card = w.document.querySelector('[data-surface="ai-card"]')
  assert.ok(card?.querySelector('[data-ai-workbench]'))
  assert.equal(card.hasAttribute('data-ai-workbench-mounted'), true)
  assert.ok(style.includes('[data-surface="ai-card"][data-ai-workbench-mounted] > [data-canvas-sheet-head]{display:none!important}'))
  assert.doesNotMatch(style, /:has\(/)

  const host = card.querySelector('[data-canvas-ai-host]')
  w.document.dispatchEvent(new w.CustomEvent('lsb:canvas-ai-close', { detail: { host } }))
  assert.equal(card.hasAttribute('data-ai-workbench-mounted'), false)
})

test('M15 生成期间复用发送按钮停止，不渲染额外空白控件', async () => {
  const w = makeSite()
  await load(w)
  const wb = w.document.querySelector('[data-ai-workbench]')
  const copilot = w.LSB.__core.plugins.get('ai-copilot').exports
  let signal
  copilot.runTopic = async (_mode, options) => {
    signal = options.signal
    return new Promise(() => {})
  }
  wb.querySelector('[data-ai-chat-input]').value = '测试停止控件'
  wb.querySelector('[data-ai-chat-send]').click()
  assert.equal(await until(() => Boolean(signal)), true)
  const send = wb.querySelector('[data-ai-chat-send]')
  assert.equal(wb.querySelector('[data-ai-chat-stop]'), send)
  assert.equal(wb.querySelectorAll('[data-ai-chat-stop]').length, 1)
  send.click()
  assert.equal(signal.aborted, true)
  assert.equal(wb.querySelector('[data-ai-chat-stop]'), null)
})

test('M15 建议问题只填充输入框，首轮消息后欢迎态隐藏', async () => {
  const w = makeSite()
  await load(w)
  const wb = w.document.querySelector('[data-ai-workbench]')
  const suggestion = wb.querySelector('[data-ai-workbench-suggestion]')
  assert.ok(suggestion)
  suggestion.click()
  assert.ok(wb.querySelector('[data-ai-chat-input]').value.length > 0)
  assert.equal(wb.querySelector('[data-ai-chat-send]').dataset.busy, 'false')
  wb.querySelector('[data-ai-chat-send]').click()
  assert.equal(await until(() => wb.querySelector('[data-ai-workbench-welcome]')?.hidden === true), true)
})

test('M15 本地意图路由覆盖只读、检索、追踪、比较和写请求', async () => {
  const w = makeSite()
  await load(w)
  const detect = w.LSB.__core.plugins.get('ai-workbench').exports.detectChatIntent
  assert.equal(detect('分析这个帖子分歧', { hasTopic: true }).capability, 'disagreement')
  assert.equal(detect('搜索相关主题', { hasTopic: true }).capability, 'research')
  assert.equal(detect('追踪有没有新证据', { hasTracking: true }).capability, 'tracking')
  assert.equal(detect('请回复这条帖子', { hasTopic: true }).capability, 'site-action')
  assert.equal(detect('你好', {}).capability, 'ask')
})

test('M15 detached 材料不能让需要当前页面的能力读取材料', async () => {
  const w = makeSite()
  await load(w)
  const detect = w.LSB.__core.plugins.get('ai-workbench').exports.detectChatIntent
  const result = detect('分析这个帖子', { materialMode: 'detached', hasTopic: true })
  assert.equal(result.capability, 'ask')
  assert.equal(result.reason, 'fallback')
  assert.equal(result.source, 'local')
})

test('M15 取消材料后请求不含页面材料和引用，重新附加后恢复', async () => {
  const w = makeSite()
  const bodies = []
  w.fetch = async (url, init = {}) => {
    if (init.body) bodies.push(JSON.parse(init.body))
    return { status: 200, ok: true, url: String(url), text: async () => JSON.stringify({ choices: [{ message: { content: '无材料回答' } }] }) }
  }
  await load(w)
  const wb = w.document.querySelector('[data-ai-workbench]')
  wb.querySelector('[data-ai-workbench-material-remove]').click()
  wb.querySelector('[data-ai-chat-input]').value = '只回答问题'
  wb.querySelector('[data-ai-chat-send]').click()
  assert.equal(await until(() => bodies.length === 1 && wb.querySelector('[data-ai-chat-send]').dataset.busy === 'false'), true)
  assert.doesNotMatch(JSON.stringify(bodies[0]), /当前帖子|forum-content|LINUX SB上线/)
  assert.equal(wb.querySelector('.ai-workbench-citations'), null)
  wb.querySelector('[data-ai-workbench-attach]').click()
  assert.equal(wb.querySelector('[data-ai-workbench-material]').hidden, false)
})

test('M15 detached turn 保持材料范围、意图和副驾请求隔离', async () => {
  const w = makeSite()
  await load(w)
  const copilot = w.LSB.__core.plugins.get('ai-copilot').exports
  let received
  copilot.runTopic = async (_mode, options) => {
    received = options
    return { text: '只基于问题回答', meta: { citations: [] } }
  }
  const wb = w.document.querySelector('[data-ai-workbench]')
  wb.querySelector('[data-ai-workbench-material-remove]').click()
  wb.querySelector('[data-ai-chat-input]').value = '只回答问题'
  wb.querySelector('[data-ai-chat-send]').click()
  assert.equal(await until(() => Boolean(received) && wb.querySelector('[data-ai-chat-send]').dataset.busy === 'false'), true, wb.textContent)
  assert.equal(received.materialMode, 'detached')
  const saved = JSON.parse(w.localStorage.getItem('lsb_base:ai-workbench:conversations'))
  const turn = saved.conversations[0].turns[0]
  assert.equal(turn.materialMode, 'detached')
  assert.equal(turn.context.materialMode, 'detached')
  assert.deepEqual(turn.intent, { capability: 'ask', confidence: 'low', source: 'local', reason: 'fallback' })
  assert.equal(turn.citations.length, 0)
})

test('M15 旧历史缺省附加材料并拒绝未白名单意图', async () => {
  const w = makeSite()
  w.localStorage.setItem('lsb_base:ai-workbench:conversations', JSON.stringify({
    version: 1,
    activeId: 'm15-migration',
    conversations: [{
      id: 'm15-migration', title: '旧历史', createdAt: 1, updatedAt: 1,
      turns: [{
        id: 'legacy-turn', capability: 'ask', question: '旧问题', answer: '旧回答', state: 'complete', citations: [],
        context: { kind: 'current-topic', routeType: 'topic', topicId: 1 },
        intent: { capability: 'ask', confidence: 'high', source: 'local', reason: '授权执行' },
      }],
    }],
  }))
  await load(w)
  const saved = JSON.parse(w.localStorage.getItem('lsb_base:ai-workbench:conversations'))
  const turn = saved.conversations[0].turns[0]
  assert.equal(turn.materialMode, 'attached')
  assert.equal(turn.context.materialMode, 'attached')
  assert.equal(turn.intent, null)
})

test('M12 工作台实际请求：连续追问使用当前历史，新对话为空', async () => {
  const w = makeSite()
  const requests = []
  w.fetch = async (url, init) => {
    const body = JSON.parse(init.body)
    if (body.messages?.[0]?.content.includes('帖子副驾')) requests.push(body)
    return { status: 200, ok: true, url: String(url), text: async () => JSON.stringify({ choices: [{ message: { content: '选方案甲 [#1]' } }] }) }
  }
  await load(w)
  const wb = w.document.querySelector('[data-ai-workbench]')
  const send = async (question) => {
    wb.querySelector('[data-ai-chat-input]').value = question
    wb.querySelector('[data-ai-chat-send]').click()
    assert.equal(await until(() => wb.querySelector('[data-ai-chat-send]').dataset.busy === 'false'), true)
  }
  await send('哪个方案更好？')
  await send('它有什么限制？')
  assert.match(requests[1].messages[1].content, /哪个方案更好？/)
  assert.match(requests[1].messages[1].content, /选方案甲/)
  wb.querySelector('[data-ai-new-conversation]').click()
  await send('它有什么限制？')
  assert.equal(requests.length, 3, '有历史和空历史的同一句追问不共用缓存')
  assert.doesNotMatch(requests[2].messages[1].content, /哪个方案更好？|选方案甲/)
})

test('M12 停止立即释放输入，同轮重试不被迟到回答或 finally 覆盖', async () => {
  const w = makeSite()
  await load(w)
  const wb = w.document.querySelector('[data-ai-workbench]')
  const pending = []
  const options = []
  w.LSB.__core.plugins.get('ai-copilot').exports.runTopic = async (_mode, opts) => {
    options.push(opts)
    return new Promise((resolve) => pending.push(resolve))
  }
  wb.querySelector('[data-ai-chat-input]').value = '原始问题'
  wb.querySelector('[data-ai-chat-send]').click()
  assert.equal(await until(() => pending.length === 1), true)
  const original = JSON.parse(w.localStorage.getItem('lsb_base:ai-workbench:conversations')).conversations[0].turns[0].id
  const stop = wb.querySelector('[data-ai-chat-stop]')
  assert.ok(stop)
  assert.equal(stop, wb.querySelector('[data-ai-chat-send]'))
  assert.equal(stop.hidden, false)
  stop.click()
  assert.equal(options[0].signal.aborted, true)
  assert.equal(wb.querySelector('[data-ai-chat-input]').disabled, false)
  assert.match(wb.querySelector('[data-ai-chat-messages]').textContent, /已停止/)
  wb.querySelector('[data-ai-chat-retry]').click()
  assert.equal(await until(() => pending.length === 2), true)
  assert.equal(options[1].force, true)
  pending[0]({ text: '迟到旧回答', meta: {} })
  await new Promise((resolve) => setTimeout(resolve, 30))
  assert.equal(wb.querySelector('[data-ai-chat-send]').dataset.busy, 'true')
  assert.doesNotMatch(wb.querySelector('[data-ai-chat-messages]').textContent, /迟到旧回答/)
  pending[1]({ text: '重试成功', meta: {} })
  assert.equal(await until(() => wb.querySelector('[data-ai-chat-messages]').textContent.includes('重试成功')), true)
  const turns = JSON.parse(w.localStorage.getItem('lsb_base:ai-workbench:conversations')).conversations[0].turns
  assert.equal(turns.length, 1)
  assert.equal(turns[0].id, original)
  assert.equal(turns[0].question, '原始问题')
})

test('M12 实际流式 UI：完成前纯文本，完成后验证引用并持久化', async () => {
  const w = makeSite()
  await load(w)
  w.TextDecoder = TextDecoder
  let stream
  w.fetch = async (url) => ({ status: 200, ok: true, url: String(url), body: new ReadableStream({ start(controller) { stream = controller } }) })
  const wb = w.document.querySelector('[data-ai-workbench]')
  wb.querySelector('[data-ai-chat-input]').value = '流式回答测试'
  wb.querySelector('[data-ai-chat-send]').click()
  assert.equal(await until(() => Boolean(stream)), true)
  const encoder = new TextEncoder()
  stream.enqueue(encoder.encode('data: {"choices":[{"delta":{"content":"<img src=x onerror=alert(1)> 依据 [#1]"}}]}\n\n'))
  assert.equal(await until(() => wb.querySelector('[data-ai-chat-stream]')?.textContent.includes('依据 [#1]')), true)
  assert.equal(wb.querySelector('[data-ai-chat-stream] img'), null)
  assert.equal(wb.querySelector('[data-ai-chat-stream] a'), null)
  const before = JSON.parse(w.localStorage.getItem('lsb_base:ai-workbench:conversations')).conversations[0].turns[0]
  assert.equal(before.state, 'pending')
  assert.equal(before.answer, '')
  stream.enqueue(encoder.encode('data: {"choices":[{"delta":{},"finish_reason":"stop"}]}\n\ndata: [DONE]\n\n'))
  stream.close()
  assert.equal(await until(() => !wb.querySelector('[data-ai-chat-stop]')), true)
  assert.equal(wb.querySelector('[data-ai-chat-stream]'), null)
  assert.ok(wb.querySelector('[data-ai-chat-assistant] a[href*="floor=1"]'), wb.querySelector('[data-ai-chat-assistant]').outerHTML)
  const process = wb.querySelector('[data-ai-chat-process]')
  assert.equal(process.open, false, '真实流式请求完成后收起阶段，保留回答可见')
  assert.doesNotMatch(process.querySelector('summary').textContent, /正在处理/)
  const after = JSON.parse(w.localStorage.getItem('lsb_base:ai-workbench:conversations')).conversations[0].turns[0]
  assert.equal(after.state, 'complete')
  assert.equal(after.citations[0].floor, 1)
})

test('M12 流中停止保留部分展示但不进入历史或成功缓存', async () => {
  const w = makeSite()
  await load(w)
  w.TextDecoder = TextDecoder
  let stream
  w.fetch = async (url) => ({ status: 200, ok: true, url: String(url), body: new ReadableStream({ start(controller) { stream = controller } }) })
  const wb = w.document.querySelector('[data-ai-workbench]')
  wb.querySelector('[data-ai-chat-input]').value = '停止流测试'
  wb.querySelector('[data-ai-chat-send]').click()
  assert.equal(await until(() => Boolean(stream)), true)
  stream.enqueue(new TextEncoder().encode('data: {"choices":[{"delta":{"content":"未完成的部分回答 [#1]"}}]}\n\n'))
  assert.equal(await until(() => wb.querySelector('[data-ai-chat-stream]')), true)
  assert.equal(wb.querySelector('[data-ai-chat-stop]'), wb.querySelector('[data-ai-chat-send]'))
  wb.querySelector('[data-ai-chat-stop]').click()
  assert.match(wb.querySelector('[data-ai-chat-stream]').textContent, /未完成的部分回答/)
  assert.ok(wb.querySelector('[data-ai-chat-retry]'))
  const saved = w.localStorage.getItem('lsb_base:ai-workbench:conversations')
  assert.doesNotMatch(saved, /未完成的部分回答/)
  assert.equal(JSON.parse(saved).conversations[0].turns[0].state, 'cancelled')
  await new Promise((resolve) => setTimeout(resolve, 20))
  assert.equal(Object.keys(w.localStorage).filter((key) => key.includes('ai-copilot:c:')).length, 0)
})

test('M12 同一对话切换版块后不携带上一版块问答', async () => {
  const w = makeSite()
  w.history.replaceState({}, '', '/forum/1')
  await load(w)
  const histories = []
  w.LSB.__core.plugins.get('ai-copilot').exports.runConsoleQuery = async (options) => {
    histories.push(Array.from(options.conversation))
    return { text: '版块一的回答', meta: {} }
  }
  let wb = w.document.querySelector('[data-ai-workbench]')
  wb.querySelector('[data-ai-chat-input]').value = '当前有哪些主题？'
  wb.querySelector('[data-ai-chat-send]').click()
  assert.equal(await until(() => histories.length === 1 && wb.querySelector('[data-ai-chat-send]').dataset.busy === 'false'), true)
  w.history.replaceState({}, '', '/forum/2')
  w.LSB.__core.snapshot.page = { type: 'forum', id: 2, page: 1 }
  w.LSB.bus.emit('route:changed', { page: { type: 'forum', id: 2, page: 1 } }, { source: 'test' })
  wb = w.document.querySelector('[data-ai-workbench]')
  wb.querySelector('[data-ai-chat-input]').value = '这些是什么？'
  wb.querySelector('[data-ai-chat-send]').click()
  assert.equal(await until(() => histories.length === 2), true)
  assert.equal(histories[1].length, 0)
})

test('M12 已发送站内写入期间不显示停止生成', async () => {
  let resolveWrite
  const { wb } = await createWriteActionTurn({ execute: () => new Promise((resolve) => { resolveWrite = resolve }) })
  wb.querySelector('[data-ai-action-execute]').click()
  assert.equal(await until(() => Boolean(resolveWrite)), true)
  assert.equal(wb.querySelector('[data-ai-chat-stop]'), null)
  resolveWrite({ kind: 'submission', label: '已提交，请检查结果' })
  assert.equal(await until(() => wb.querySelector('[data-ai-chat-send]').dataset.busy === 'false'), true)
})

test('M13 工作台把早期同范围只读轮次压缩一次并携带最近原文', async () => {
  const w = makeSite()
  const scope = JSON.stringify({ type: 'topic', id: 1, page: 1, sort: null, tab: null })
  const turns = Array.from({ length: 6 }, (_, index) => ({
    id: `seed-${index}`,
    createdAt: index + 1,
    capability: 'ask',
    context: { kind: 'current-topic', routeType: 'topic', topicId: 1, routeScope: scope },
    title: `早期问题${index}`,
    question: `早期问题${index}`,
    answer: `早期回答${index}`,
    state: 'complete',
    phases: [],
    trace: [],
    traceFlowId: `seed-flow-${index}`,
    citations: [],
  }))
  w.localStorage.setItem('lsb_base:ai-workbench:conversations', JSON.stringify({
    version: 1,
    activeId: 'm13-conversation',
    conversations: [{ id: 'm13-conversation', title: 'M13', createdAt: 1, updatedAt: 10, turns }],
  }))
  await load(w)
  const copilot = w.LSB.__core.plugins.get('ai-copilot').exports
  const summaries = []
  const requests = []
  copilot.summarizeConversation = async (options) => {
    summaries.push(options)
    return { text: '早期结论：方案甲在缓存刷新后更稳定。', sourceFingerprint: 'm13-source-1', model: 'test-model', version: 1 }
  }
  copilot.runTopic = async (_mode, options) => {
    requests.push(options)
    return { text: '当前回答', meta: { citations: [] } }
  }
  const wb = w.document.querySelector('[data-ai-workbench]')
  wb.querySelector('[data-ai-chat-input]').value = '结合早期结论继续解释'
  wb.querySelector('[data-ai-chat-send]').click()
  assert.equal(await until(() => wb.querySelectorAll('[data-ai-chat-assistant]')?.item(6)?.textContent.includes('当前回答')), true, wb.textContent)
  assert.equal(summaries.length, 1)
  assert.equal(requests.length, 1)
  assert.match(String(requests[0].conversationSummary || ''), /早期结论/)
  assert.deepEqual(Array.from(requests[0].conversation, (row) => row.content), ['早期问题3', '早期回答3', '早期问题4', '早期回答4', '早期问题5', '早期回答5'])
  const saved = JSON.parse(w.localStorage.getItem('lsb_base:ai-workbench:conversations'))
  assert.equal(saved.conversations[0].compactions.length, 1)
})

test('M13 摘要请求停止时取消底层信号且不落盘，输入可立即重试', async () => {
  const w = makeSite()
  const scope = JSON.stringify({ type: 'topic', id: 1, page: 1, sort: null, tab: null })
  const turns = Array.from({ length: 6 }, (_, index) => ({
    id: `stop-seed-${index}`,
    createdAt: index + 1,
    capability: 'ask',
    context: { kind: 'current-topic', routeType: 'topic', topicId: 1, routeScope: scope },
    title: `问题${index}`,
    question: `问题${index}`,
    answer: `回答${index}`,
    state: 'complete',
    phases: [],
    trace: [],
    traceFlowId: `stop-flow-${index}`,
    citations: [],
  }))
  w.localStorage.setItem('lsb_base:ai-workbench:conversations', JSON.stringify({ version: 1, activeId: 'stop-conversation', conversations: [{ id: 'stop-conversation', title: '停止', createdAt: 1, updatedAt: 10, turns }] }))
  await load(w)
  const copilot = w.LSB.__core.plugins.get('ai-copilot').exports
  let seenSignal
  copilot.summarizeConversation = ({ signal }) => {
    seenSignal = signal
    return new Promise(() => {})
  }
  const wb = w.document.querySelector('[data-ai-workbench]')
  wb.querySelector('[data-ai-chat-input]').value = '停止摘要'
  wb.querySelector('[data-ai-chat-send]').click()
  assert.equal(await until(() => Boolean(seenSignal)), true)
  assert.equal(wb.querySelector('[data-ai-chat-stop]'), wb.querySelector('[data-ai-chat-send]'))
  wb.querySelector('[data-ai-chat-stop]').click()
  assert.equal(seenSignal.aborted, true)
  assert.equal(wb.querySelector('[data-ai-chat-input]').disabled, false)
  const saved = JSON.parse(w.localStorage.getItem('lsb_base:ai-workbench:conversations'))
  assert.equal(saved.conversations[0].compactions?.length || 0, 0)
})

test('M13 摘要失败时使用脱敏本地摘录并完成当前回答', async () => {
  const w = makeSite()
  const scope = JSON.stringify({ type: 'topic', id: 1, page: 1, sort: null, tab: null })
  const turns = Array.from({ length: 6 }, (_, index) => ({
    id: `fallback-seed-${index}`,
    createdAt: index + 1,
    capability: 'ask',
    context: { kind: 'current-topic', routeType: 'topic', topicId: 1, routeScope: scope },
    title: `问题${index}`,
    question: `问题${index} https://private.example/topic?token=secret`,
    answer: `回答${index}`,
    state: 'complete',
    phases: [],
    trace: [],
    traceFlowId: `fallback-flow-${index}`,
    citations: [],
  }))
  w.localStorage.setItem('lsb_base:ai-workbench:conversations', JSON.stringify({ version: 1, activeId: 'fallback-conversation', conversations: [{ id: 'fallback-conversation', title: '降级', createdAt: 1, updatedAt: 10, turns }] }))
  await load(w)
  const copilot = w.LSB.__core.plugins.get('ai-copilot').exports
  let received
  copilot.summarizeConversation = async () => { throw new Error('摘要端点失败') }
  copilot.runTopic = async (_mode, options) => { received = options; return { text: '仍可回答', meta: { citations: [] } } }
  const wb = w.document.querySelector('[data-ai-workbench]')
  wb.querySelector('[data-ai-chat-input]').value = '摘要失败仍继续'
  wb.querySelector('[data-ai-chat-send]').click()
  assert.equal(await until(() => wb.querySelectorAll('[data-ai-chat-assistant]')?.item(6)?.textContent.includes('仍可回答')), true, wb.textContent)
  assert.match(String(received?.conversationSummary || ''), /\[问题\]/)
  assert.doesNotMatch(String(received?.conversationSummary || ''), /private\.example|token=secret/)
  assert.match(wb.textContent, /历史已收窄/)
  const saved = JSON.parse(w.localStorage.getItem('lsb_base:ai-workbench:conversations'))
  assert.equal(saved.conversations[0].compactions?.length || 0, 0)
})

test('M13 切换主题范围后不复用摘要，站内写计划不读取历史摘要', async () => {
  const w = makeSite()
  const scope = JSON.stringify({ type: 'topic', id: 1, page: 1, sort: null, tab: null })
  const turns = Array.from({ length: 6 }, (_, index) => ({
    id: `scope-seed-${index}`,
    createdAt: index + 1,
    capability: 'ask',
    context: { kind: 'current-topic', routeType: 'topic', topicId: 1, routeScope: scope },
    title: `问题${index}`,
    question: `问题${index}`,
    answer: `回答${index}`,
    state: 'complete',
    phases: [],
    trace: [],
    traceFlowId: `scope-flow-${index}`,
    citations: [],
  }))
  w.localStorage.setItem('lsb_base:ai-workbench:conversations', JSON.stringify({ version: 1, activeId: 'scope-conversation', conversations: [{ id: 'scope-conversation', title: '范围', createdAt: 1, updatedAt: 10, turns }] }))
  await load(w)
  const copilot = w.LSB.__core.plugins.get('ai-copilot').exports
  let summaryCalls = 0
  let queryOptions
  copilot.summarizeConversation = async () => { summaryCalls += 1; return { text: '旧摘要', sourceFingerprint: 'scope-source', model: 'test-model', version: 1 } }
  copilot.runTopic = async (_mode, options) => { queryOptions = options; return { text: '新主题回答', meta: { citations: [] } } }
  w.history.replaceState({}, '', '/topic/2')
  w.LSB.__core.snapshot.page = { type: 'topic', id: 2, page: 1 }
  w.LSB.bus.emit('route:changed', { page: { type: 'topic', id: 2, page: 1 } }, { source: 'test' })
  const wb = w.document.querySelector('[data-ai-workbench]')
  wb.querySelector('[data-ai-chat-input]').value = '新主题追问'
  wb.querySelector('[data-ai-chat-send]').click()
  assert.equal(await until(() => wb.querySelectorAll('[data-ai-chat-assistant]')?.item(6)?.textContent.includes('新主题回答')), true, wb.textContent)
  assert.equal(summaryCalls, 0)
  assert.equal(Array.from(queryOptions?.conversation || []).length, 0)

  const actionCalls = []
  copilot.planActions = async (options) => {
    actionCalls.push(options)
    return { plan: { version: 1, summary: '只读测试计划', steps: [] }, previews: [] }
  }
  wb.querySelector('[data-ai-chat-mode]').value = 'site-action'
  wb.querySelector('[data-ai-chat-mode]').dispatchEvent(new w.Event('change'))
  wb.querySelector('[data-ai-chat-input]').value = '生成计划'
  wb.querySelector('[data-ai-chat-send]').click()
  assert.equal(await until(() => actionCalls.length === 1), true, wb.textContent)
  assert.equal(Object.prototype.hasOwnProperty.call(actionCalls[0], 'conversation'), false)
  assert.equal(Object.prototype.hasOwnProperty.call(actionCalls[0], 'conversationSummary'), false)
})

test('M13 对话栏显示当前范围压缩状态，清除只删除摘要并让下次请求重建', async () => {
  const w = makeSite()
  const scope = JSON.stringify({ type: 'topic', id: 1, page: 1, sort: null, tab: null })
  const turns = Array.from({ length: 6 }, (_, index) => ({
    id: `ui-seed-${index}`,
    createdAt: index + 1,
    capability: 'ask',
    context: { kind: 'current-topic', routeType: 'topic', topicId: 1, routeScope: scope },
    title: `问题${index}`,
    question: `问题${index}`,
    answer: `回答${index}`,
    state: 'complete',
    phases: [],
    trace: [],
    traceFlowId: `ui-flow-${index}`,
    citations: [],
  }))
  w.localStorage.setItem('lsb_base:ai-workbench:conversations', JSON.stringify({ version: 1, activeId: 'ui-conversation', conversations: [{ id: 'ui-conversation', title: '压缩状态', createdAt: 1, updatedAt: 10, turns }] }))
  await load(w)
  const copilot = w.LSB.__core.plugins.get('ai-copilot').exports
  let summaryCalls = 0
  copilot.summarizeConversation = async () => ({ text: `早期摘要 ${++summaryCalls}`, sourceFingerprint: `ui-source-${summaryCalls}`, model: 'test-model', version: 1 })
  copilot.runTopic = async () => ({ text: 'UI 回答', meta: { citations: [] } })
  const wb = w.document.querySelector('[data-ai-workbench]')
  const send = async (question, index) => {
    wb.querySelector('[data-ai-chat-input]').value = question
    wb.querySelector('[data-ai-chat-send]').click()
    assert.equal(await until(() => wb.querySelectorAll('[data-ai-chat-assistant]')?.item(index)?.textContent.includes('UI 回答')), true, wb.textContent)
  }
  await send('第一次触发压缩', 6)
  assert.match(wb.querySelector('[data-ai-compaction-status]').textContent, /已压缩 3 轮/)
  assert.ok(wb.querySelector('[data-ai-clear-compaction]'))
  wb.querySelector('[data-ai-clear-compaction]').click()
  const afterClear = JSON.parse(w.localStorage.getItem('lsb_base:ai-workbench:conversations'))
  assert.equal(afterClear.conversations[0].compactions?.length || 0, 0)
  assert.equal(afterClear.conversations[0].turns.length, 7)
  await send('清除后重新压缩', 7)
  assert.equal(summaryCalls, 2)
})

function m14Snapshot(materialFingerprint = 'mat-old', contentFingerprint = 'content-old') {
  return {
    version: 1,
    scope: { kind: 'topic', routeType: 'topic', topicId: 1, routeScope: 'topic:1:1' },
    materialFingerprint,
    citations: [{ key: 'topic:1:post:21', topicId: 1, postId: 21, floor: 1, page: 1, authorName: '作者', excerpt: '正文', contentFingerprint }],
  }
}

function m14SeedTurn(overrides = {}) {
  const snapshot = overrides.evidenceSnapshot || m14Snapshot()
  return {
    id: overrides.id || 'm14-turn',
    createdAt: 1,
    capability: 'topic-ask',
    context: { kind: 'current-topic', routeType: 'topic', topicId: 1, routeScope: JSON.stringify({ type: 'topic', id: 1, page: 1, sort: null, tab: null }) },
    title: 'M14',
    question: overrides.question || '旧问题',
    answer: overrides.answer || '旧回答',
    state: 'complete',
    phases: [],
    trace: [],
    traceFlowId: 'm14-flow',
    citations: [{ topicId: 1, floor: 1, postId: '21', page: 1, authorName: '作者', known: true }],
    evidenceSnapshot: snapshot,
    freshness: { status: overrides.freshness || 'fresh', reviewedAt: 0, materialFingerprint: snapshot.materialFingerprint, counts: { unchanged: 0, changed: 0, removed: 0, unverifiable: 0 } },
  }
}

test('M14 缺少快照的旧 turn 迁移为 legacy 且不自动联网', async () => {
  const w = makeSite()
  w.localStorage.setItem('lsb_base:ai-workbench:conversations', JSON.stringify({
    version: 1,
    activeId: 'legacy-conversation',
    conversations: [{ id: 'legacy-conversation', title: '旧', createdAt: 1, updatedAt: 1, turns: [{
      id: 'legacy-1', capability: 'ask', question: '旧问题', answer: '旧回答', state: 'complete', citations: [],
    }] }],
  }))
  await load(w)
  const saved = JSON.parse(w.localStorage.getItem('lsb_base:ai-workbench:conversations'))
  const turn = saved.conversations[0].turns[0]
  assert.equal(turn.freshness.status, 'legacy')
  assert.equal(turn.answer, '旧回答')
  assert.equal(w.document.querySelector('[data-ai-citation-review]'), null)
})

test('M14 复核按钮不重新调用回答模型并显示差异', async () => {
  const w = makeSite()
  const snapshot = m14Snapshot()
  const turn = m14SeedTurn({ evidenceSnapshot: snapshot })
  w.localStorage.setItem('lsb_base:ai-workbench:conversations', JSON.stringify({ version: 1, activeId: 'm14-conversation', conversations: [{ id: 'm14-conversation', title: 'M14', createdAt: 1, updatedAt: 1, turns: [turn] }] }))
  await load(w)
  const copilot = w.LSB.__core.plugins.get('ai-copilot').exports
  let generateCalls = 0
  copilot.runTopic = async () => { generateCalls += 1; return { text: '不应调用', meta: {} } }
  copilot.revalidateCitations = async () => ({
    version: 1,
    status: 'changed',
    reviewedAt: Date.now(),
    materialFingerprint: 'mat-new',
    counts: { unchanged: 0, changed: 1, removed: 0, unverifiable: 0 },
    rows: [{ key: 'topic:1:post:21', topicId: 1, postId: 21, floor: 1, page: 1, contentFingerprint: 'content-new', status: 'changed', freshness: 'changed', reason: 'content' }],
  })
  const wb = w.document.querySelector('[data-ai-workbench]')
  wb.querySelector('[data-ai-citation-review]').click()
  assert.equal(await until(() => Boolean(wb.querySelector('[data-ai-citation-diff]'))), true, wb.textContent)
  assert.equal(generateCalls, 0)
  assert.match(wb.querySelector('[data-ai-citation-diff]').textContent, /内容变化/)
})

test('M14 新材料回答保留旧版本，失败不覆盖旧回答', async () => {
  const w = makeSite()
  const oldSnapshot = m14Snapshot('mat-old', 'content-old')
  const turn = m14SeedTurn({ evidenceSnapshot: oldSnapshot, freshness: 'material-stale' })
  w.localStorage.setItem('lsb_base:ai-workbench:conversations', JSON.stringify({ version: 1, activeId: 'm14-conversation', conversations: [{ id: 'm14-conversation', title: 'M14', createdAt: 1, updatedAt: 1, turns: [turn] }] }))
  await load(w)
  const copilot = w.LSB.__core.plugins.get('ai-copilot').exports
  let regenerateCalls = 0
  copilot.runTopic = async () => { regenerateCalls += 1; return { text: '新材料回答', meta: { evidenceSnapshot: m14Snapshot('mat-new', 'content-new'), citations: turn.citations } } }
  const wb = w.document.querySelector('[data-ai-workbench]')
  wb.querySelector('[data-ai-regenerate-fresh]').click()
  assert.equal(await until(() => wb.textContent.includes('新材料回答')), true, wb.textContent)
  let saved = JSON.parse(w.localStorage.getItem('lsb_base:ai-workbench:conversations'))
  let current = saved.conversations[0].turns[0]
  assert.equal(current.revisions.length, 1)
  assert.equal(current.revisions[0].answer, '旧回答')
  assert.equal(current.answer, '新材料回答')
})

test('M14 重新生成失败保留旧回答并记录失败状态', async () => {
  const w = makeSite()
  const turn = m14SeedTurn({ evidenceSnapshot: m14Snapshot('mat-failure', 'content-failure'), freshness: 'material-stale' })
  w.localStorage.setItem('lsb_base:ai-workbench:conversations', JSON.stringify({ version: 1, activeId: 'm14-failure', conversations: [{ id: 'm14-failure', title: 'M14 failure', createdAt: 1, updatedAt: 1, turns: [turn] }] }))
  await load(w)
  const copilot = w.LSB.__core.plugins.get('ai-copilot').exports
  let regenerateCalls = 0
  copilot.runTopic = async () => { regenerateCalls += 1; throw new Error('fixture failure') }
  const wb = w.document.querySelector('[data-ai-workbench]')
  wb.querySelector('[data-ai-regenerate-fresh]').click()
  assert.equal(await until(() => regenerateCalls === 1), true, wb.textContent)
  assert.equal(await until(() => JSON.parse(w.localStorage.getItem('lsb_base:ai-workbench:conversations')).conversations[0].turns[0].state === 'failed'), true, wb.textContent)
  const saved = JSON.parse(w.localStorage.getItem('lsb_base:ai-workbench:conversations'))
  assert.equal(saved.conversations[0].turns[0].answer, '旧回答')
})

async function createWriteActionTurn({ body = '回复正文', execute = async () => ({ kind: 'submission', label: '已提交' }) } = {}) {
  const w = makeSite()
  await load(w)
  w.LSB.register({ id: 'write-turn-test', version: '1.0.0', permissions: ['read', 'write'] }, (api) => {
    api.ai.registerAction({
      id: 'site.write-test', version: 1, permission: 'write', label: '测试写动作', args: { body: { type: 'string', minLength: 1 } },
      preview: () => '写入测试正文', execute,
    })
  })
  await new Promise((resolve) => setTimeout(resolve, 30))
  w.LSB.__core.plugins.get('ai-copilot').exports.planActions = async () => ({
    plan: {
      version: 1, summary: '测试写计划',
      steps: [{ action: 'site.write-test', args: { body }, actionVersion: 1, actionProvider: 'write-turn-test' }],
    },
    previews: [{ ok: true, text: '写入测试正文' }],
    context: { route: { type: 'topic', id: 1, href: '/topic/1' } },
  })
  const wb = w.document.querySelector('[data-ai-workbench]')
  wb.querySelector('[data-ai-chat-mode]').value = 'site-action'
  wb.querySelector('[data-ai-chat-mode]').dispatchEvent(new w.Event('change'))
  wb.querySelector('[data-ai-chat-input]').value = '回复当前帖子'
  wb.querySelector('[data-ai-chat-send]').click()
  assert.equal(await until(() => wb.querySelector('[data-ai-action-execute]')), true)
  return { w, wb, body }
}

test('AI 工作台：单画布 AI 卡显示统一会话和当前上下文', async () => {
  const w = makeSite()
  await load(w)
  w.dispatchEvent(new w.Event('resize'))
  assert.equal(await until(() => w.document.querySelector('[data-surface="ai-card"]')), true)
  const workbench = w.document.querySelector('[data-ai-workbench]')
  assert.ok(workbench)
  assert.ok(workbench.querySelector('[data-ai-chat-messages]'))
  assert.ok(workbench.querySelector('[data-ai-chat-composer]'))
  assert.equal(workbench.querySelector('[data-ai-workbench-material]').hidden, false)
  assert.match(workbench.querySelector('[data-ai-workbench-material-label]').textContent, /当前帖子/)
  assert.equal(workbench.querySelector('[data-ai-chat-mode]')?.closest('[aria-hidden="true"]') != null, true)
  assert.equal(workbench.querySelector('[data-ai-chat-context]')?.closest('[aria-hidden="true"]') != null, true)
  assert.equal(workbench.querySelector('[data-ai-section-tab]'), null)
  assert.match(workbench.querySelector('[data-ai-chat-context-hint]').textContent, /当前帖子/)
})

test('AI 工作台对话：只呈现统一消息流和固定输入框', async () => {
  const w = makeSite()
  await load(w)
  const wb = w.document.querySelector('[data-ai-workbench]')

  assert.ok(wb.querySelector('[data-ai-chat-messages]'))
  assert.ok(wb.querySelector('[data-ai-chat-composer]'))
  assert.ok(wb.querySelector('[data-ai-chat-input]'))
  assert.ok(wb.querySelector('[data-ai-workbench-attach]'))
  assert.ok(wb.querySelector('[data-ai-workbench-model]'))
  assert.ok(wb.querySelector('[data-ai-chat-mode]'))
  assert.ok(wb.querySelector('[data-ai-chat-context]'))
  assert.ok(wb.querySelector('[data-ai-chat-send]'))
  assert.equal(wb.querySelector('[data-ai-section-tab]'), null, '不再把操作台、帖子和追踪拆成互斥页面')
  assert.equal(wb.querySelector('[data-ai-chat-context]').value, 'current-topic', '帖子路由默认绑定当前帖子')
  assert.match(wb.querySelector('[data-ai-model]').textContent, /test-model/)
})

test('AI 工作台：统一 composer 移除 @ 和 / 选项', async () => {
  const w = makeSite()
  await load(w)
  const composer = w.document.querySelector('[data-ai-chat-composer]')
  assert.ok(composer)
  assert.ok(composer.querySelector('[data-ai-workbench-attach]'))
  assert.ok(composer.querySelector('[data-ai-chat-send]'))
  assert.equal(composer.querySelector('[data-ai-chat-smart]'), null)
  assert.equal(composer.querySelector('[data-ai-chat-context]'), null)
  assert.equal(composer.querySelector('[data-ai-chat-mode]'), null)
  assert.equal(composer.querySelector('[data-ai-chat-mode-options]'), null)
  assert.doesNotMatch(composer.textContent, /@ 当前页面|\/ 提问/)
})

test('AI 工作台：更多菜单的二级处理方式可切换兼容能力', async () => {
  const w = makeSite()
  await load(w)
  const wb = w.document.querySelector('[data-ai-workbench]')
  wb.querySelector('[data-ai-workbench-more]').click()
  const fallback = wb.querySelector('[data-ai-capability-fallback]')
  assert.ok(fallback)
  fallback.open = true
  const menu = w.document.querySelector('[data-ai-chat-menu]')
  assert.ok(menu)
  assert.ok(menu.querySelector('[data-ai-chat-capability="comparison"]'))
  menu.querySelector('[data-ai-chat-capability="comparison"]').click()
  assert.equal(menu.querySelector('[data-ai-chat-capability="comparison"]').getAttribute('data-selected'), '')
  assert.equal(wb.querySelector('[data-ai-chat-context]')?.closest('[hidden]') != null, true)
  assert.equal(wbContextKind(w), 'current-topic')
})

function wbContextKind(window) {
  return window.document.querySelector('[data-ai-workbench] [data-ai-chat-context]').value
}

test('AI 工作台对话：写动作插件缺席时仍能使用现有只读能力', async () => {
  const w = makeSite()
  await load(w)
  const exported = w.LSB.__core.plugins.get('ai-copilot').exports
  const calls = []
  exported.runTopic = async (mode, options) => {
    calls.push({ mode, options })
    return { text: `已处理 ${calls.length}`, meta: { citations: [] } }
  }
  const wb = w.document.querySelector('[data-ai-workbench]')
  const mode = wb.querySelector('[data-ai-chat-mode]')
  const expectedModes = ['ask', 'topic-ask', 'disagreement', 'comparison', 'unresolved', 'new-replies', 'draft', 'tracking', 'site-action', 'research']
  assert.deepEqual(Array.from(mode.options, (option) => option.value), expectedModes)
  assert.match(wb.querySelector('[data-ai-chat-readonly]').textContent, /写入前再次确认/)

  const cases = [
    { capability: 'topic-ask', mode: 'ask', hasQuestion: true },
    { capability: 'disagreement', mode: 'analyze', preset: '观点分歧' },
    { capability: 'comparison', mode: 'analyze', preset: '方案对比' },
    { capability: 'unresolved', mode: 'analyze', preset: '未解决问题' },
    { capability: 'new-replies', mode: 'digest' },
    { capability: 'draft', mode: 'draft', tone: '客观', length: '中' },
  ]
  for (const item of cases) {
    mode.value = item.capability
    mode.dispatchEvent(new w.Event('change'))
    wb.querySelector('[data-ai-chat-input]').value = `测试 ${item.capability}`
    const callIndex = calls.length + 1
    wb.querySelector('[data-ai-chat-send]').click()
    const reply = `已处理 ${callIndex}`
    assert.equal(await until(() => {
      const assistants = wb.querySelectorAll('[data-ai-chat-assistant]')
      return assistants.length === callIndex && assistants[assistants.length - 1]?.textContent.includes(reply)
    }), true, wb.textContent)
    const received = calls.at(-1)
    assert.equal(received.mode, item.mode)
    if (item.hasQuestion) assert.equal(received.options.question, `测试 ${item.capability}`)
    if (item.preset) assert.equal(received.options.preset, item.preset)
    if (item.tone) assert.equal(received.options.tone, item.tone)
    if (item.length) assert.equal(received.options.length, item.length)
  }
})

test('AI 工作台：未知动作计划只读降级，不创建执行卡片', async () => {
  const w = makeSite()
  await load(w)
  const exported = w.LSB.__core.plugins.get('ai-copilot').exports
  let consoleCalls = 0
  let executeCalls = 0
  exported.planActions = async () => ({
    fallback: true,
    warning: '已降级为普通只读查询',
    question: '当前列表有哪些主题？',
    reasonCode: 'plan-downgraded',
  })
  exported.runConsoleQuery = async () => {
    consoleCalls += 1
    return { text: '当前列表有 2 个主题。', meta: { citations: [] } }
  }
  w.LSB.__core.ai.execute = async () => {
    executeCalls += 1
    return { ok: true }
  }
  const wb = w.document.querySelector('[data-ai-workbench]')
  wb.querySelector('[data-ai-chat-mode]').value = 'site-action'
  wb.querySelector('[data-ai-chat-mode]').dispatchEvent(new w.Event('change'))
  wb.querySelector('[data-ai-chat-input]').value = '执行未知版本计划'
  wb.querySelector('[data-ai-chat-send]').click()
  assert.equal(await until(() => wb.textContent.includes('当前列表有 2 个主题。')), true)
  assert.equal(consoleCalls, 1)
  assert.equal(executeCalls, 0)
  assert.match(wb.textContent, /已降级为普通只读查询/)
  assert.equal(wb.querySelector('[data-ai-action-execute]'), null)
})

test('AI 工作台：已确认动作执行时把当前轮次 flowId 传给动作提供方', async () => {
  let seenContext = null
  const { w, wb } = await createWriteActionTurn({
    execute: async (_args, context) => {
      seenContext = context
      return { kind: 'completed', label: '已完成' }
    },
  })
  wb.querySelector('[data-ai-action-execute]').click()
  assert.equal(await until(() => wb.querySelector('[data-ai-action-status]')?.textContent.includes('已完成')), true)
  const history = JSON.parse(w.localStorage.getItem('lsb_base:ai-workbench:conversations'))
  const turn = history.conversations.flatMap((conversation) => conversation.turns).at(-1)
  assert.ok(turn?.traceFlowId)
  assert.equal(seenContext?.flowId, turn.traceFlowId)
})

test('AI 工作台对话：当前列表主题引用显示并在刷新后恢复', async () => {
  const w = makeSite()
  w.history.replaceState({}, '', '/')
  await load(w)
  const exported = w.LSB.__core.plugins.get('ai-copilot').exports
  exported.runConsoleQuery = async () => ({
    text: '当前页找到一个主题。',
    meta: {
      citations: [{ kind: 'topic', topicId: 4321, floor: 0, issueId: '', excerpt: '当前页列表主题', known: true, href: '/topic/4321' }],
    },
  })
  const wb = w.document.querySelector('[data-ai-workbench]')
  wb.querySelector('[data-ai-chat-input]').value = '当前页有哪些主题？'
  wb.querySelector('[data-ai-chat-send]').click()

  assert.equal(await until(() => wb.querySelector('[data-ai-chat-assistant] a[href="/topic/4321"]')), true, wb.textContent)
  assert.equal(wb.querySelector('[data-ai-chat-assistant] a[href="/topic/4321"]').textContent, '主题 #4321')
  const saved = JSON.parse(w.localStorage.getItem('lsb_base:ai-workbench:conversations'))
  assert.deepEqual(saved.conversations[0].turns[0].citations, [{ kind: 'topic', topicId: 4321, floor: 0 }])

  const restored = makeSite()
  restored.history.replaceState({}, '', '/')
  restored.localStorage.setItem('lsb_base:ai-workbench:conversations', JSON.stringify(saved))
  await load(restored)
  const restoredLink = restored.document.querySelector('[data-ai-chat-assistant] a[href="/topic/4321"]')
  assert.equal(restoredLink?.textContent, '主题 #4321')
})

test('AI 工作台对话：模型入口读取当前模型并打开 AI 总结设置', async () => {
  const w = makeSite()
  await load(w)
  const wb = w.document.querySelector('[data-ai-workbench]')
  const provider = w.LSB.__core.plugins.get('ai-copilot').exports.providerState()
  const model = wb.querySelector('[data-ai-model]')
  assert.match(model.textContent, new RegExp(provider.model))
  assert.equal(w.document.querySelector('.lsb-panel'), null)
  model.click()
  assert.equal(await until(() => Boolean(w.document.querySelector('.lsb-panel .lsb-tab.is-active'))), true)
  assert.match(w.document.querySelector('.lsb-panel .lsb-tab.is-active').textContent, /AI 总结/)
})

test('AI 工作台对话：观点比较在同一消息流内调用帖子分析并保存阶段摘要', async () => {
  const w = makeSite()
  await load(w)
  const exported = w.LSB.__core.plugins.get('ai-copilot').exports
  let received = null
  exported.runTopic = async (mode, options) => {
    received = { mode, options }
    options.onProgress({ stage: 'context', state: 'complete', summary: '读取主题 #1 的 4 个楼层' })
    options.onProgress({ stage: 'answer', state: 'active', summary: '正在生成分析' })
    options.onProgress({ stage: 'answer', state: 'complete', summary: '收到分析文本' })
    options.onProgress({ stage: 'evidence', state: 'complete', summary: '本地验证引用 1/1 条' })
    return {
      text: '两个方案的成本不同，证据见 [#12]。',
      meta: { model: 'test-model', citations: [{ floor: 12, topicId: 1, issueId: '', known: true, href: '/topic/1?floor=12#post-12' }] },
    }
  }
  const wb = w.document.querySelector('[data-ai-workbench]')
  const mode = wb.querySelector('[data-ai-chat-mode]')
  mode.value = 'comparison'
  mode.dispatchEvent(new w.Event('change'))
  wb.querySelector('[data-ai-chat-input]').value = '比较方案甲和乙'
  wb.querySelector('[data-ai-chat-send]').click()

  assert.equal(await until(() => wb.querySelector('[data-ai-chat-assistant]')?.textContent.includes('两个方案的成本不同')), true, wb.textContent)
  assert.equal(received.mode, 'analyze')
  assert.equal(received.options.preset, '方案对比')
  assert.equal(wb.querySelectorAll('[data-ai-chat-user]').length, 1)
  assert.equal(wb.querySelectorAll('[data-ai-chat-assistant]').length, 1)
  assert.equal(wb.querySelector('[data-ai-chat-phase="context"]').dataset.state, 'complete')
  const process = wb.querySelector('[data-ai-chat-process]')
  assert.equal(process.open, false, '完成后收起详细阶段记录')
  assert.match(process.querySelector('summary').textContent, /验证证据.*1\/1/, '完成后仍在消息流显示最近的可验证阶段摘要')
  const history = JSON.parse(w.localStorage.getItem('lsb_base:ai-workbench:conversations'))
  assert.equal(history.conversations[0].turns[0].capability, 'comparison')
  assert.equal(history.conversations[0].turns[0].phases.find((phase) => phase.stage === 'evidence').state, 'complete')
})

test('AI 工作台对话：追踪能力强制使用活动追踪范围并在当前流显示答案', async () => {
  const w = makeSite()
  await load(w)
  const exported = w.LSB.__core.plugins.get('ai-copilot').exports
  let received = null
  exported.runConsoleQuery = async (options) => {
    received = options
    options.onProgress({ stage: 'understand', state: 'complete', summary: '识别为活动追踪只读查询' })
    options.onProgress({ stage: 'local', state: 'complete', summary: '筛出 2 个追踪项' })
    options.onProgress({ stage: 'answer', state: 'complete', summary: '已整理回答' })
    return { text: '两个追踪项有新证据。', meta: { model: 'test-model', citations: [] } }
  }
  const wb = w.document.querySelector('[data-ai-workbench]')
  wb.querySelector('[data-ai-chat-mode]').value = 'tracking'
  wb.querySelector('[data-ai-chat-mode]').dispatchEvent(new w.Event('change'))
  wb.querySelector('[data-ai-chat-input]').value = '最近有哪些追踪变化？'
  wb.querySelector('[data-ai-chat-send]').click()

  assert.equal(await until(() => wb.querySelector('[data-ai-chat-assistant]')?.textContent.includes('两个追踪项有新证据')), true, wb.textContent)
  assert.equal(received.scope, 'active-tracking')
  assert.equal(wb.querySelector('[data-ai-chat-assistant]').closest('[data-ai-chat-turn]').querySelector('[data-ai-chat-phase="local"]').dataset.state, 'complete')
})

test('AI 工作台对话：Enter 发送，Shift+Enter 不发送，超过 500 字符在本地拒绝', async () => {
  const w = makeSite()
  await load(w)
  const exported = w.LSB.__core.plugins.get('ai-copilot').exports
  let calls = 0
  exported.runTopic = async () => {
    calls += 1
    return { text: '收到', meta: { citations: [] } }
  }
  const wb = w.document.querySelector('[data-ai-workbench]')
  const input = wb.querySelector('[data-ai-chat-input]')
  input.value = '先换行'
  const shifted = new w.KeyboardEvent('keydown', { key: 'Enter', shiftKey: true, bubbles: true, cancelable: true })
  input.dispatchEvent(shifted)
  assert.equal(shifted.defaultPrevented, false)
  assert.equal(calls, 0)

  input.value = '通过回车发送'
  const enter = new w.KeyboardEvent('keydown', { key: 'Enter', bubbles: true, cancelable: true })
  input.dispatchEvent(enter)
  assert.equal(enter.defaultPrevented, true)
  assert.equal(await until(() => calls === 1), true)
  assert.equal(await until(() => wb.querySelector('[data-ai-chat-assistant]')?.textContent.includes('收到')), true)

  input.value = '🙂'.repeat(501)
  wb.querySelector('[data-ai-chat-send]').click()
  assert.match(wb.querySelector('[data-ai-chat-validation]').textContent, /最多 500 个字符/)
  assert.equal(calls, 1)
  assert.equal(wb.querySelectorAll('[data-ai-chat-user]').length, 1)
})

test('AI 工作台对话：切换会话时取消原请求并丢弃迟到结果', async () => {
  const w = makeSite()
  await load(w)
  let resolveAnswer
  w.LSB.__core.plugins.get('ai-copilot').exports.runTopic = () => new Promise((resolve) => { resolveAnswer = resolve })
  const wb = w.document.querySelector('[data-ai-workbench]')
  wb.querySelector('[data-ai-chat-input]').value = '第一段对话'
  wb.querySelector('[data-ai-chat-send]').click()
  assert.equal(await until(() => Boolean(resolveAnswer)), true)
  const original = JSON.parse(w.localStorage.getItem('lsb_base:ai-workbench:conversations'))
  const originalId = original.activeId
  const originalTurnId = original.conversations.find((item) => item.id === originalId).turns[0].id

  wb.querySelector('[data-ai-new-conversation]').click()
  const secondId = JSON.parse(w.localStorage.getItem('lsb_base:ai-workbench:conversations')).activeId
  assert.notEqual(secondId, originalId)
  resolveAnswer({ text: '第一段的迟到回答', meta: { citations: [] } })
  assert.equal(await until(() => {
    const saved = JSON.parse(w.localStorage.getItem('lsb_base:ai-workbench:conversations'))
    return saved.conversations.find((item) => item.id === originalId)?.turns.find((turn) => turn.id === originalTurnId)?.state === 'cancelled'
  }), true)
  assert.equal(wb.querySelector('[data-ai-chat-assistant]'), null, '不能把旧会话结果渲染到当前的新会话')

  const select = wb.querySelector('[data-ai-conversation-list]')
  select.value = originalId
  select.dispatchEvent(new w.Event('change'))
  assert.match(wb.querySelector('[data-ai-chat-assistant]').textContent, /已因新建对话停止/)
  assert.doesNotMatch(wb.querySelector('[data-ai-chat-assistant]').textContent, /第一段的迟到回答/)
})

test('AI 工作台对话：路由变化后旧请求被标记停止且晚到答案不覆盖', async () => {
  const w = makeSite()
  await load(w)
  let resolveAnswer
  w.LSB.__core.plugins.get('ai-copilot').exports.runTopic = () => new Promise((resolve) => { resolveAnswer = resolve })
  const wb = w.document.querySelector('[data-ai-workbench]')
  wb.querySelector('[data-ai-chat-input]').value = '页面变化时的请求'
  wb.querySelector('[data-ai-chat-send]').click()
  assert.equal(await until(() => Boolean(resolveAnswer)), true)
  const before = JSON.parse(w.localStorage.getItem('lsb_base:ai-workbench:conversations'))
  const turnId = before.conversations.find((item) => item.id === before.activeId).turns[0].id

  w.LSB.bus.emit('route:changed', { href: '/topic/2', page: { type: 'topic', id: 2 } }, { source: 'test' })
  assert.equal(await until(() => w.document.querySelector('[data-ai-chat-turn]')?.querySelector('[data-ai-chat-process]')?.textContent.includes('已因页面切换停止')), true)
  resolveAnswer({ text: '不应写入的新页面答案', meta: { citations: [] } })
  await new Promise((resolve) => setTimeout(resolve, 30))
  const after = JSON.parse(w.localStorage.getItem('lsb_base:ai-workbench:conversations'))
  const saved = after.conversations.flatMap((item) => item.turns).find((turn) => turn.id === turnId)
  assert.equal(saved.state, 'stale')
  assert.doesNotMatch(saved.answer, /不应写入的新页面答案/)
})

test('AI 工作台对话历史：持久化裁剪敏感 URL 参数和凭据样式文本', async () => {
  const w = makeSite()
  w.history.replaceState({}, '', '/topic/1?session-secret=url-hidden')
  await load(w)
  const exported = w.LSB.__core.plugins.get('ai-copilot').exports
  exported.runTopic = async (_mode, options) => {
    options.onProgress({ stage: 'context', state: 'complete', summary: '/topic/1?csrf=phase-hidden cookie=phase-cookie' })
    return {
      text: 'https://linux.sb/topic/1?answer-secret=hidden api_key=key-hidden Cookie=answer-cookie _csrf=token-hidden',
      meta: { citations: [] },
    }
  }
  const wb = w.document.querySelector('[data-ai-workbench]')
  wb.querySelector('[data-ai-chat-input]').value = '读取 https://linux.sb/topic/1?question-secret=hidden cookie=question-cookie'
  wb.querySelector('[data-ai-chat-send]').click()
  assert.equal(await until(() => {
    const raw = w.localStorage.getItem('lsb_base:ai-workbench:conversations')
    return raw && JSON.parse(raw).conversations[0]?.turns[0]?.state === 'complete'
  }), true)
  const history = w.localStorage.getItem('lsb_base:ai-workbench:conversations')
  assert.doesNotMatch(history, /url-hidden|phase-hidden|phase-cookie|answer-secret|key-hidden|answer-cookie|token-hidden|question-secret|question-cookie/)
  assert.match(history, /已隐藏/)
})

test('AI 工作台对话历史：加载超限记录后遵守会话、轮次、文本、阶段和 1 MiB 上限', async () => {
  const w = makeSite()
  const conversations = Array.from({ length: 22 }, (_, conversationIndex) => ({
    id: `conversation-${conversationIndex}`,
    title: `对话 ${conversationIndex}`,
    createdAt: conversationIndex + 1,
    updatedAt: conversationIndex + 1,
    turns: Array.from({ length: 12 }, (_, turnIndex) => ({
      id: `turn-${conversationIndex}-${turnIndex}`,
      createdAt: turnIndex + 1,
      capability: 'ask',
      context: { kind: 'current-topic', routeType: 'topic', topicId: 1, secret: 'discard-me' },
      question: '🙂'.repeat(501),
      answer: '🙂'.repeat(4001),
      state: 'complete',
      phases: Array.from({ length: 8 }, (_, phaseIndex) => ({ stage: ['understand', 'context', 'plan', 'local', 'answer', 'evidence', 'action', 'unknown'][phaseIndex], state: 'complete', summary: '阶段🙂'.repeat(80) })),
      citations: [],
      secret: 'discard-me-too',
    })),
  }))
  const seeded = { version: 99, activeId: 'conversation-21', conversations }
  w.localStorage.setItem('lsb_base:ai-workbench:conversations', JSON.stringify(seeded))
  await load(w)

  const serialized = w.localStorage.getItem('lsb_base:ai-workbench:conversations')
  const history = JSON.parse(serialized)
  assert.equal(history.version, 1)
  assert.ok(history.conversations.length <= 20)
  assert.ok(history.conversations.every((conversation) => conversation.turns.length <= 10))
  assert.ok(history.conversations.every((conversation) => conversation.turns.every((turn) => Array.from(turn.question).length <= 500 && Array.from(turn.answer).length <= 4000 && turn.phases.length <= 6)))
  assert.ok(new TextEncoder().encode(serialized).length <= 1024 * 1024)
  assert.equal(history.activeId, 'conversation-21')
  assert.doesNotMatch(serialized, /discard-me|unknown/)
})

test('AI 工作台对话历史：创建、切换和清空只影响会话记录', async () => {
  const w = makeSite()
  w.localStorage.setItem('lsb_base:ai-workbench:action-history', JSON.stringify([{
    id: 'kept-action',
    command: '回首页',
    plan: { version: 1, summary: '回首页', steps: [{ action: 'site.navigate', args: { target: 'home' } }] },
    routeFingerprint: JSON.stringify({ type: 'topic', id: 1 }),
    status: 'completed',
    steps: [{ state: 'completed', error: '' }],
    ts: 1,
  }]))
  await load(w)
  const wb = w.document.querySelector('[data-ai-workbench]')
  const list = wb.querySelector('[data-ai-conversation-list]')
  const create = wb.querySelector('[data-ai-new-conversation]')
  const clear = wb.querySelector('[data-ai-clear-history]')
  assert.ok(list, '显示本地最近对话选择器')
  assert.ok(create, '提供新对话入口')
  assert.ok(clear, '提供清空历史入口')

  create.click()
  const saved = JSON.parse(w.localStorage.getItem('lsb_base:ai-workbench:conversations'))
  assert.equal(saved.version, 1)
  assert.equal(saved.conversations.length, 1)
  const firstId = saved.activeId
  w.document.querySelector('[data-ai-new-conversation]').click()
  const twoSessions = JSON.parse(w.localStorage.getItem('lsb_base:ai-workbench:conversations'))
  assert.equal(twoSessions.conversations.length, 2)
  assert.notEqual(twoSessions.activeId, firstId)

  const selectedId = twoSessions.conversations[0].id
  const currentList = w.document.querySelector('[data-ai-conversation-list]')
  currentList.value = selectedId
  currentList.dispatchEvent(new w.Event('change'))
  const switched = JSON.parse(w.localStorage.getItem('lsb_base:ai-workbench:conversations'))
  assert.equal(switched.activeId, selectedId)

  w.document.querySelector('[data-ai-clear-history]').click()
  assert.equal(await until(() => w.document.querySelector('.lsb-panel [data-yes]')), true)
  w.document.querySelector('.lsb-panel [data-yes]').click()
  assert.equal(await until(() => w.localStorage.getItem('lsb_base:ai-workbench:conversations') === null), true)
  assert.match(w.localStorage.getItem('lsb_base:ai-workbench:action-history'), /kept-action|site\.navigate/)
})

test('AI 工作台：窄屏不注册右栏 AI 标签，保留旧入口能力', async () => {
  const w = makeSite(900)
  await load(w)
  w.dispatchEvent(new w.Event('resize'))
  assert.equal(w.document.querySelector('[data-lsb-shell-aside-tab="ai-workbench"]'), null)
  assert.ok(w.document.querySelector('a.lsb-ai-copilot-top'), '帖子页旧顶栏副驾入口仍存在')
})

test('AI 工作台：命令先显示计划，点击执行后才按顺序调用动作', async () => {
  const w = makeSite()
  await load(w)
  const calls = []
  w.LSB.register({ id: 'test-actions', version: '1.0.0', permissions: ['read', 'events'] }, (api) => {
    api.ai.registerAction({
      id: 'test.first', version: 1, permission: 'read', label: '第一步', args: {},
      preview: () => '先做第一步',
      execute: async () => { calls.push('first'); return { ok: true } },
    })
    api.ai.registerAction({
      id: 'test.second', version: 1, permission: 'read', label: '第二步', args: {},
      preview: () => '再做第二步',
      execute: async () => { calls.push('second'); return { ok: true } },
    })
  })
  await new Promise((resolve) => setTimeout(resolve, 30))
  const exported = w.LSB.__core.plugins.get('ai-copilot').exports
  exported.planActions = async () => ({
    plan: {
      version: 1,
      summary: '测试',
      steps: [
        { action: 'test.first', args: {}, actionVersion: 1, actionProvider: 'test-actions' },
        { action: 'test.second', args: {}, actionVersion: 1, actionProvider: 'test-actions' },
      ],
    },
    previews: [{ ok: true, text: '先做第一步' }, { ok: true, text: '再做第二步' }],
    context: { route: { type: 'topic', id: 1, href: '/topic/1' } },
  })
  const wb = w.document.querySelector('[data-ai-workbench]')
  wb.querySelector('[data-ai-chat-mode]').value = 'site-action'
  wb.querySelector('[data-ai-chat-mode]').dispatchEvent(new w.Event('change'))
  wb.querySelector('[data-ai-chat-input]').value = '执行两步'
  wb.querySelector('[data-ai-chat-send]').click()
  assert.deepEqual(calls, [], '预览阶段不能调用 execute')
  assert.equal(await until(() => wb.querySelector('[data-ai-action-execute]')), true)
  assert.ok(wb.querySelector('[data-ai-action-regenerate]'))
  wb.querySelector('[data-ai-action-execute]').click()
  assert.equal(await until(() => calls.length === 2), true)
  assert.deepEqual(calls, ['first', 'second'])
  assert.match(wb.querySelector('[data-ai-action-status]').textContent, /已完成|completed/)
})

test('AI 工作台：重新生成只替换对话中的计划预览，不执行站内动作', async () => {
  const w = makeSite()
  await load(w)
  const copilot = w.LSB.__core.plugins.get('ai-copilot').exports
  const generated = []
  copilot.planActions = async ({ command, force }) => {
    generated.push({ command, force })
    const revision = generated.length
    return {
      plan: { version: 1, summary: `计划版本 ${revision}`, steps: [{ action: 'site.navigate', args: { target: 'home' } }] },
      previews: [{ ok: true, text: `预览版本 ${revision}` }],
    }
  }
  const wb = w.document.querySelector('[data-ai-workbench]')
  wb.querySelector('[data-ai-chat-mode]').value = 'site-action'
  wb.querySelector('[data-ai-chat-mode]').dispatchEvent(new w.Event('change'))
  wb.querySelector('[data-ai-chat-input]').value = '打开首页'
  wb.querySelector('[data-ai-chat-send]').click()
  assert.equal(await until(() => wb.querySelector('[data-ai-action-regenerate]')), true)
  assert.deepEqual(generated, [{ command: '打开首页', force: undefined }])
  assert.match(wb.querySelector('[data-ai-chat-assistant]').textContent, /计划版本 1/)

  wb.querySelector('[data-ai-action-regenerate]').click()
  assert.equal(await until(() => generated.length === 2), true)
  assert.deepEqual(generated[1], { command: '打开首页', force: true })
  assert.equal(await until(() => wb.querySelector('[data-ai-chat-assistant]').textContent.includes('计划版本 2')), true)
  assert.equal(w.document.querySelector('[data-ai-action-execute]') != null, true, '重新生成后仍需用户明确执行')
  assert.equal(w.location.pathname, '/topic/1')
})

test('AI 工作台：步骤失败停止后续，重试只调用失败步骤；路由变化使计划过期', async () => {
  const w = makeSite()
  await load(w)
  const calls = []
  let attempts = 0
  w.LSB.register({ id: 'retry-actions', version: '1.0.0', permissions: ['read', 'events'] }, (api) => {
    api.ai.registerAction({
      id: 'test.ok', version: 1, permission: 'read', label: '成功', args: {},
      preview: () => '成功', execute: async () => { calls.push('ok'); return { ok: true } },
    })
    api.ai.registerAction({
      id: 'test.retry', version: 1, permission: 'read', label: '可重试', args: {},
      preview: () => '可重试',
      execute: async () => { attempts += 1; calls.push(`retry-${attempts}`); if (attempts === 1) throw new Error('模拟失败'); return { ok: true } },
    })
    api.ai.registerAction({
      id: 'test.never', version: 1, permission: 'read', label: '不应执行', args: {},
      preview: () => '不应执行', execute: async () => { calls.push('never'); return { ok: true } },
    })
  })
  await new Promise((resolve) => setTimeout(resolve, 30))
  const exported = w.LSB.__core.plugins.get('ai-copilot').exports
  exported.planActions = async () => ({
    plan: {
      version: 1,
      summary: '测试',
      steps: [
        { action: 'test.ok', args: {}, actionVersion: 1, actionProvider: 'retry-actions' },
        { action: 'test.retry', args: {}, actionVersion: 1, actionProvider: 'retry-actions' },
        { action: 'test.never', args: {}, actionVersion: 1, actionProvider: 'retry-actions' },
      ],
    },
    previews: [{ ok: true, text: '成功' }, { ok: true, text: '可重试' }, { ok: true, text: '不应执行' }],
    context: { route: { type: 'topic', id: 1, href: '/topic/1' } },
  })
  const wb = w.document.querySelector('[data-ai-workbench]')
  wb.querySelector('[data-ai-chat-mode]').value = 'site-action'
  wb.querySelector('[data-ai-chat-mode]').dispatchEvent(new w.Event('change'))
  wb.querySelector('[data-ai-chat-input]').value = '测试失败'
  wb.querySelector('[data-ai-chat-send]').click()
  assert.equal(await until(() => wb.querySelector('[data-ai-action-execute]')), true)
  wb.querySelector('[data-ai-action-execute]').click()
  assert.equal(await until(() => wb.querySelector('[data-ai-action-status]').textContent.includes('partial')), true)
  assert.deepEqual(calls, ['ok', 'retry-1'])
  wb.querySelector('[data-ai-action-retry-failed]').click()
  assert.equal(await until(() => attempts === 2), true)
  assert.deepEqual(calls, ['ok', 'retry-1', 'retry-2'])
  assert.equal(await until(() => w.document.querySelector('[data-ai-action-step="2"]')?.dataset.state === 'completed'), true)
  assert.equal(w.document.querySelector('[data-ai-action-step="2"]').dataset.state, 'completed')
  w.LSB.bus.emit('route:changed', { href: '/topic/2', page: { type: 'topic', id: 2 } }, { source: 'test' })
  const currentWorkbench = w.document.querySelector('[data-ai-workbench]')
  assert.match(currentWorkbench.querySelector('[data-ai-action-status]').textContent, /expired|过期/)
})

test('AI 工作台：未声明终止属性的导航结果也不能跳过后续步骤', async () => {
  const w = makeSite()
  await load(w)
  let laterCalls = 0
  w.LSB.register({ id: 'navigation-guard', version: '1.0.0', permissions: ['read', 'events'] }, (api) => {
    api.ai.registerAction({
      id: 'test.navigation', version: 1, permission: 'read', label: '导航', args: {},
      preview: () => '导航', execute: () => ({ kind: 'navigation', url: '/next' }),
    })
    api.ai.registerAction({
      id: 'test.afterNavigation', version: 1, permission: 'read', label: '后续', args: {},
      preview: () => '后续', execute: () => { laterCalls += 1; return { ok: true } },
    })
  })
  await new Promise((resolve) => setTimeout(resolve, 30))
  const exported = w.LSB.__core.plugins.get('ai-copilot').exports
  exported.planActions = async () => ({
    plan: {
      version: 1,
      summary: '导航后执行后续动作',
      steps: [
        { action: 'test.navigation', args: {}, actionVersion: 1, actionProvider: 'navigation-guard' },
        { action: 'test.afterNavigation', args: {}, actionVersion: 1, actionProvider: 'navigation-guard' },
      ],
    },
    previews: [{ ok: true, text: '导航' }, { ok: true, text: '后续' }],
    context: { route: { type: 'topic', id: 1, page: 1 } },
  })
  const wb = w.document.querySelector('[data-ai-workbench]')
  wb.querySelector('[data-ai-chat-mode]').value = 'site-action'
  wb.querySelector('[data-ai-chat-mode]').dispatchEvent(new w.Event('change'))
  wb.querySelector('[data-ai-chat-input]').value = '执行计划'
  wb.querySelector('[data-ai-chat-send]').click()
  assert.equal(await until(() => wb.querySelector('[data-ai-action-execute]')), true)
  wb.querySelector('[data-ai-action-execute]').click()
  assert.equal(await until(() => /执行失败|failed/.test(wb.querySelector('[data-ai-action-status]').textContent)), true)
  assert.equal(w.document.querySelector('[data-ai-action-step="1"]').dataset.state, 'failed')
  assert.equal(w.document.querySelector('[data-ai-action-step="2"]').dataset.state, 'skipped')
  assert.equal(laterCalls, 0)
  assert.equal(w.location.pathname, '/topic/1')
})

test('AI 工作台：模型不可用时仍可从本地动作目录建立计划并保存本地历史', async () => {
  const w = makeSite()
  w.history.replaceState({}, '', '/topic/1?auth=history-secret')
  w.localStorage.setItem('lsb_base:ai-summary:__config', JSON.stringify({ apiUrl: '', apiKey: '' }))
  await load(w)
  const wb = w.document.querySelector('[data-ai-workbench]')
  wb.querySelector('[data-ai-chat-mode]').value = 'site-action'
  wb.querySelector('[data-ai-chat-mode]').dispatchEvent(new w.Event('change'))
  wb.querySelector('[data-ai-chat-input]').value = '打开首页'
  wb.querySelector('[data-ai-chat-send]').click()
  assert.equal(await until(() => w.document.querySelector('[data-ai-action-local-plan]')), true)
  const action = wb.querySelector('[data-ai-action-select]')
  action.value = 'site.navigate'
  action.dispatchEvent(new w.Event('change'))
  const target = wb.querySelector('[data-ai-action-arg="target"]')
  target.value = 'home'
  wb.querySelector('[data-ai-action-local-plan]').click()
  assert.ok(wb.querySelector('[data-ai-action-execute]'))
  assert.ok(wb.querySelector('[data-ai-action-regenerate]') === null)
  assert.match(wb.querySelector('[data-ai-action-plan]').textContent, /打开首页/)
  assert.match(wb.querySelector('[data-ai-chat-assistant]').textContent, /已建立本地操作计划/)
  const history = JSON.parse(w.localStorage.getItem('lsb_base:ai-workbench:action-history'))
  assert.equal(history.length, 1)
  assert.equal(history[0].plan.steps[0].action, 'site.navigate')
  assert.doesNotMatch(JSON.stringify(history), /apiKey|_csrf|Cookie|完整 DOM/i)
  assert.doesNotMatch(JSON.stringify(history), /history-secret/)
  for (let index = 0; index < 22; index += 1) {
    wb.querySelector('[data-ai-chat-mode]').value = 'site-action'
    wb.querySelector('[data-ai-chat-mode]').dispatchEvent(new w.Event('change'))
    wb.querySelector('[data-ai-chat-input]').value = `本地计划 ${index}`
    wb.querySelector('[data-ai-chat-send]').click()
    assert.equal(await until(() => [...w.document.querySelectorAll('[data-ai-chat-turn]')].at(-1)?.querySelector('[data-ai-action-local-plan]')), true)
    const latestTurn = [...w.document.querySelectorAll('[data-ai-chat-turn]')].at(-1)
    latestTurn.querySelector('[data-ai-action-select]').value = 'site.navigate'
    latestTurn.querySelector('[data-ai-action-select]').dispatchEvent(new w.Event('change'))
    latestTurn.querySelector('[data-ai-action-arg="target"]').value = 'home'
    latestTurn.querySelector('[data-ai-action-local-plan]').click()
  }
  const boundedHistory = JSON.parse(w.localStorage.getItem('lsb_base:ai-workbench:action-history'))
  assert.equal(boundedHistory.length, 20)
})

test('AI 工作台：加载旧历史时清除已持久化的 URL 查询参数', async () => {
  const w = makeSite()
  w.localStorage.setItem('lsb_base:ai-workbench:action-history', JSON.stringify([{
    id: 'legacy-plan',
    command: '回首页',
    plan: { version: 1, summary: '回首页', steps: [{ action: 'site.navigate', args: { target: 'home' } }] },
    routeFingerprint: JSON.stringify({ type: 'topic', id: 1, href: '/topic/1?token=legacy-secret' }),
    status: 'completed',
    steps: [{ state: 'completed', error: '' }],
    ts: 1,
  }]))
  await load(w)
  const saved = w.localStorage.getItem('lsb_base:ai-workbench:action-history')
  assert.doesNotMatch(saved, /legacy-secret/)
  const route = JSON.parse(JSON.parse(saved)[0].routeFingerprint)
  assert.equal(route.type, 'topic')
  assert.equal('href' in route, false)
})

test('AI 工作台：动作提供方停用后现有计划过期且不能执行', async () => {
  const w = makeSite()
  await load(w)
  w.LSB.register({ id: 'temporary-actions', version: '1.0.0', permissions: ['read', 'events'] }, (api) => {
    api.ai.registerAction({
      id: 'test.temporary', version: 1, permission: 'read', label: '临时动作', args: {},
      preview: () => '执行临时动作', execute: () => ({ ok: true }),
    })
  })
  await new Promise((resolve) => setTimeout(resolve, 30))
  const exported = w.LSB.__core.plugins.get('ai-copilot').exports
  exported.planActions = async () => ({
    plan: { version: 1, summary: '临时计划', steps: [{ action: 'test.temporary', args: {}, actionVersion: 1, actionProvider: 'temporary-actions' }] },
    previews: [{ ok: true, text: '执行临时动作' }],
    context: { route: { type: 'topic', id: 1, href: '/topic/1' } },
  })
  const wb = w.document.querySelector('[data-ai-workbench]')
  wb.querySelector('[data-ai-chat-mode]').value = 'site-action'
  wb.querySelector('[data-ai-chat-mode]').dispatchEvent(new w.Event('change'))
  wb.querySelector('[data-ai-chat-input]').value = '临时动作'
  wb.querySelector('[data-ai-chat-send]').click()
  assert.equal(await until(() => wb.querySelector('[data-ai-action-execute]')), true)
  w.LSB.disable('temporary-actions')
  const current = w.document.querySelector('[data-ai-workbench]')
  assert.match(current.querySelector('[data-ai-action-status]').textContent, /过期/)
  assert.equal(current.querySelector('[data-ai-action-execute]'), null)
  assert.equal(w.LSB.__core.ai.actions({ route: { type: 'topic' } }).some((item) => item.id === 'test.temporary'), false)
})

test('AI 工作台刷新恢复：遗留请求转为可手动重试的 stale 状态', async () => {
  const w = makeSite()
  w.localStorage.setItem('lsb_base:ai-workbench:conversations', JSON.stringify({
    version: 1,
    activeId: 'refresh-conversation',
    conversations: [{
      id: 'refresh-conversation', title: '刷新恢复', createdAt: 1, updatedAt: 2,
      turns: [{
        id: 'interrupted-request', createdAt: 2, capability: 'ask',
        context: { kind: 'current-topic', routeType: 'topic', topicId: 1 },
        title: '中断的问题', question: '当前帖子在讨论什么？', answer: '', state: 'pending',
        phases: [{ stage: 'answer', state: 'active', summary: '正在等待模型' }], citations: [],
      }],
    }],
  }))

  await load(w)
  const saved = JSON.parse(w.localStorage.getItem('lsb_base:ai-workbench:conversations'))
  const turn = saved.conversations[0].turns[0]
  assert.equal(turn.state, 'stale')
  assert.match(turn.answer, /刷新|中断/)
  assert.equal(turn.phases[0].state, 'cancelled')
  assert.ok(w.document.querySelector('[data-ai-chat-retry]'), '提供手动重试按钮')
  assert.equal(w.document.querySelector('.ai-workbench-wait'), null, '不再显示一直处理中的等待态')
})

test('AI 工作台刷新恢复：执行中的写动作标为结果未知且绝不自动重放', async () => {
  const w = makeSite()
  w.localStorage.setItem('lsb_base:ai-workbench:conversations', JSON.stringify({
    version: 1,
    activeId: 'write-conversation',
    conversations: [{
      id: 'write-conversation', title: '写动作恢复', createdAt: 1, updatedAt: 2,
      turns: [{
        id: 'uncertain-write', createdAt: 2, capability: 'site-action',
        context: { kind: 'current-topic', routeType: 'topic', topicId: 1 },
        title: '回复', question: '回复当前帖子', answer: '已生成待确认计划', state: 'complete',
        phases: [{ stage: 'action', state: 'active', summary: '正在提交' }], citations: [],
      }],
    }],
  }))
  w.localStorage.setItem('lsb_base:ai-workbench:action-history', JSON.stringify([{
    id: 'uncertain-write', command: '回复当前帖子',
    plan: { version: 1, summary: '回复当前帖子', steps: [{
      action: 'site.write-reply', args: { body: '待提交的内容' }, actionVersion: 1, actionProvider: 'ai-write-actions',
    }] },
    routeFingerprint: JSON.stringify({ type: 'topic', id: 1, page: 1 }),
    source: 'model', status: 'running', write: true,
    steps: [{ state: 'running', error: '' }], ts: 2,
  }]))

  await load(w)
  const actionHistory = JSON.parse(w.localStorage.getItem('lsb_base:ai-workbench:action-history'))
  assert.equal(actionHistory[0].status, 'interrupted')
  assert.equal(actionHistory[0].steps[0].state, 'interrupted')
  assert.equal(actionHistory[0].write, true)
  const status = w.document.querySelector('[data-ai-action-status]')
  assert.match(status.textContent, /未知|检查.*站点|可能已提交/)
  assert.equal(w.document.querySelector('[data-ai-action-execute]'), null)
  assert.equal(w.document.querySelector('[data-ai-action-retry-failed]'), null)
  assert.equal(w.document.querySelector('[data-ai-action-plan] code')?.textContent.includes('待提交的内容'), true)
})

test('AI 工作台写计划：完整呈现正文并保存在本地历史供刷新恢复', async () => {
  const body = '完整回复正文😀\n'.repeat(90)
  const { w, wb } = await createWriteActionTurn({ body })
  assert.equal(wb.querySelector('[data-ai-write-content]')?.textContent, body)
  const saved = JSON.parse(w.localStorage.getItem('lsb_base:ai-workbench:action-history'))
  assert.equal(saved[0].write, true)
  assert.equal(saved[0].plan.steps[0].args.body, body)
})

test('AI 工作台写计划：动作提供方取消确认后记录 cancelled 且不出现重试', async () => {
  let called = 0
  const { w, wb } = await createWriteActionTurn({ execute: async () => { called += 1; return { kind: 'cancelled', label: '已取消' } } })
  wb.querySelector('[data-ai-action-execute]').click()
  assert.equal(await until(() => wb.querySelector('[data-ai-action-status]')?.textContent.includes('已取消')), true)
  assert.equal(called, 1)
  assert.equal(wb.querySelector('[data-ai-action-retry-failed]'), null)
  const saved = JSON.parse(w.localStorage.getItem('lsb_base:ai-workbench:action-history'))
  assert.equal(saved[0].status, 'cancelled')
})

test('AI 工作台写计划：站点明确失败时停止后续步骤且不自动重放', async () => {
  let called = 0
  const { w, wb } = await createWriteActionTurn({ execute: async () => {
    called += 1
    return { kind: 'failed', label: 'CSRF 失效' }
  } })
  wb.querySelector('[data-ai-action-execute]').click()
  assert.equal(await until(() => wb.querySelector('[data-ai-action-status]')?.textContent.includes('执行失败')), true)
  assert.equal(called, 1)
  assert.equal(wb.querySelector('[data-ai-action-execute]'), null)
  assert.equal(wb.querySelector('[data-ai-action-retry-failed]'), null)
  const saved = JSON.parse(w.localStorage.getItem('lsb_base:ai-workbench:action-history'))
  assert.equal(saved[0].status, 'failed')
  assert.equal(saved[0].steps[0].state, 'failed')
  assert.match(saved[0].steps[0].error, /CSRF|站点|失效/)
})

test('AI 工作台写计划：提交请求标记为待检查，不提供自动重放', async () => {
  const { w, wb } = await createWriteActionTurn({ execute: async () => ({ kind: 'submission', label: '已发出提交请求，请检查站点结果' }) })
  wb.querySelector('[data-ai-action-execute]').click()
  assert.equal(await until(() => wb.querySelector('[data-ai-action-status]')?.textContent.includes('检查站点')), true)
  assert.equal(wb.querySelector('[data-ai-action-retry-failed]'), null)
  const saved = JSON.parse(w.localStorage.getItem('lsb_base:ai-workbench:action-history'))
  assert.equal(saved[0].status, 'submitted')
  assert.equal(saved[0].steps[0].state, 'submitted')
})

test('AI 工作台互动写计划：目标引用和投币档位不进入持久化历史', async () => {
  const w = makeSite()
  await load(w)
  const copilot = w.LSB.__core.plugins.get('ai-copilot').exports
  copilot.planActions = async () => ({
    targetScopeNonce: 'scope-private-nonce',
    plan: {
      version: 1,
      summary: '给已选回帖投币',
      steps: [{ action: 'site.write-coin', args: { targetKey: 'target-private-key', coin: 5 } }],
    },
    previews: [{ ok: true, text: '投币并等待再次确认' }],
  })
  const wb = w.document.querySelector('[data-ai-workbench]')
  wb.querySelector('[data-ai-chat-mode]').value = 'site-action'
  wb.querySelector('[data-ai-chat-mode]').dispatchEvent(new w.Event('change'))
  wb.querySelector('[data-ai-chat-input]').value = '给我选中的回帖投币'
  wb.querySelector('[data-ai-chat-send]').click()
  assert.equal(await until(() => wb.querySelector('[data-ai-action-execute]')), true)

  const stored = Array.from({ length: w.localStorage.length }, (_, index) => {
    const key = w.localStorage.key(index)
    return `${key} ${w.localStorage.getItem(key)}`
  }).join('\n')
  assert.doesNotMatch(stored, /target-private-key|scope-private-nonce|"coin":5/)
})

test('AI 工作台互动写计划：确认卡要求重新选择目标和有效投币档位', async () => {
  const w = makeSite()
  await load(w)
  w.eval(PLUG('ai-write-actions.user.js'))
  await new Promise((resolve) => setTimeout(resolve, 30))
  const copilot = w.LSB.__core.plugins.get('ai-copilot').exports
  const targets = [
    { targetKey: 'target-topic-a', type: 'topic', topicId: 1, postId: null, page: 1, floor: 0, title: '当前主题', liked: null, favorited: false, tiers: [1, 5] },
    { targetKey: 'target-reply-b', type: 'reply', topicId: 1, postId: 87, page: 1, floor: 18, title: '当前主题', liked: false, favorited: null, tiers: [1, 5, 10] },
  ]
  copilot.actionContext = () => ({ route: { type: 'topic', id: 1, page: 1 }, reactionTargets: targets })
  copilot.planActions = async () => ({
    targetScopeNonce: 'memory-only-scope',
    plan: {
      version: 1,
      summary: '给回帖投币',
      steps: [{ action: 'site.write-coin', args: { targetKey: 'target-topic-a' }, actionVersion: 1, actionProvider: 'ai-write-actions' }],
    },
    previews: [{ ok: true, text: '投币；档位由你选择' }],
  })
  let executed = null
  w.LSB.__core.ai.execute = async (step) => { executed = step; return { kind: 'completed', label: '已发出投币请求' } }
  const wb = w.document.querySelector('[data-ai-workbench]')
  wb.querySelector('[data-ai-chat-mode]').value = 'site-action'
  wb.querySelector('[data-ai-chat-mode]').dispatchEvent(new w.Event('change'))
  wb.querySelector('[data-ai-chat-input]').value = '给已选回帖投币'
  wb.querySelector('[data-ai-chat-send]').click()
  assert.equal(await until(() => wb.querySelector('[data-ai-action-target]')), true)

  const target = wb.querySelector('[data-ai-action-target]')
  const coin = wb.querySelector('[data-ai-action-coin]')
  const execute = wb.querySelector('[data-ai-action-execute]')
  assert.ok(coin)
  assert.equal(target.value, '', '模型推荐目标不得直接代替用户确认')
  assert.deepEqual(Array.from(coin.options, (option) => option.value), [''])
  assert.equal(coin.disabled, true, '先选目标后才展示该目标的有效档位')
  assert.equal(execute.disabled, true)
  target.value = 'target-reply-b'
  target.dispatchEvent(new w.Event('change'))
  assert.equal(wb.querySelector('[data-ai-action-execute]').disabled, true, '选择目标后仍需选择投币档位')
  const selectedCoin = wb.querySelector('[data-ai-action-coin]')
  assert.deepEqual(Array.from(selectedCoin.options, (option) => option.value), ['', '1', '5', '10'])
  selectedCoin.value = '5'
  selectedCoin.dispatchEvent(new w.Event('change'))
  assert.equal(wb.querySelector('[data-ai-action-execute]').disabled, false)
  wb.querySelector('[data-ai-action-execute]').click()
  assert.equal(await until(() => Boolean(executed)), true)
  assert.equal(executed.args.targetKey, 'target-reply-b', '执行参数使用用户选择，覆盖模型推荐')
  assert.equal(executed.args.coin, 5)
})

test('AI 工作台互动写计划：目标档位失效时安全过期且不执行', async () => {
  const w = makeSite()
  await load(w)
  w.eval(PLUG('ai-write-actions.user.js'))
  await new Promise((resolve) => setTimeout(resolve, 30))
  const copilot = w.LSB.__core.plugins.get('ai-copilot').exports
  const targets = [
    { targetKey: 'target-reply-a', type: 'reply', topicId: 1, postId: 87, page: 1, floor: 18, title: '当前主题', liked: false, favorited: null, tiers: [1, 5] },
  ]
  copilot.actionContext = () => ({ route: { type: 'topic', id: 1, page: 1 }, reactionTargets: targets })
  copilot.planActions = async () => ({
    plan: {
      version: 1,
      summary: '给回帖投币',
      steps: [{ action: 'site.write-coin', args: { targetKey: 'target-reply-a' }, actionVersion: 1, actionProvider: 'ai-write-actions' }],
    },
    previews: [{ ok: true, text: '投币；档位由你选择' }],
  })
  let executed = 0
  w.LSB.__core.ai.execute = async () => { executed += 1; return { kind: 'completed' } }
  const wb = w.document.querySelector('[data-ai-workbench]')
  wb.querySelector('[data-ai-chat-mode]').value = 'site-action'
  wb.querySelector('[data-ai-chat-mode]').dispatchEvent(new w.Event('change'))
  wb.querySelector('[data-ai-chat-input]').value = '给已选回帖投币'
  wb.querySelector('[data-ai-chat-send]').click()
  assert.equal(await until(() => wb.querySelector('[data-ai-action-target]')), true)
  const target = wb.querySelector('[data-ai-action-target]')
  target.value = 'target-reply-a'
  target.dispatchEvent(new w.Event('change'))
  const coin = wb.querySelector('[data-ai-action-coin]')
  coin.value = '5'
  coin.dispatchEvent(new w.Event('change'))

  targets[0].tiers = undefined
  wb.querySelector('[data-ai-action-execute]').click()
  assert.equal(await until(() => /过期|失效/.test(wb.querySelector('[data-ai-action-status]')?.textContent || '')), true)
  assert.equal(executed, 0)
  assert.equal(wb.querySelector('[data-ai-action-execute]'), null)
})

test('AI 工作台互动写计划：用户原话的有效投币金额匹配目标档位', async () => {
  const w = makeSite()
  await load(w)
  w.eval(PLUG('ai-write-actions.user.js'))
  await new Promise((resolve) => setTimeout(resolve, 30))
  const copilot = w.LSB.__core.plugins.get('ai-copilot').exports
  const targets = [
    { targetKey: 'target-reply-a', type: 'reply', topicId: 1, postId: 87, page: 1, floor: 18, title: '当前主题', liked: false, favorited: null, tiers: [1, 5, 10] },
  ]
  copilot.actionContext = () => ({ route: { type: 'topic', id: 1, page: 1 }, reactionTargets: targets })
  copilot.planActions = async () => ({
    plan: {
      version: 1,
      summary: '给回帖投 5 个币',
      steps: [{ action: 'site.write-coin', args: { targetKey: 'target-reply-a' }, actionVersion: 1, actionProvider: 'ai-write-actions' }],
    },
    previews: [{ ok: true, text: '投币；金额由用户原话确认' }],
  })
  let executed = null
  w.LSB.__core.ai.execute = async (step) => { executed = step; return { kind: 'completed' } }
  const wb = w.document.querySelector('[data-ai-workbench]')
  wb.querySelector('[data-ai-chat-mode]').value = 'site-action'
  wb.querySelector('[data-ai-chat-mode]').dispatchEvent(new w.Event('change'))
  wb.querySelector('[data-ai-chat-input]').value = '给选中回帖投 5 个币'
  wb.querySelector('[data-ai-chat-send]').click()
  assert.equal(await until(() => wb.querySelector('[data-ai-action-target]')), true)
  const target = wb.querySelector('[data-ai-action-target]')
  assert.equal(wb.querySelector('[data-ai-action-execute]').disabled, true, '目标仍必须由用户确认')
  target.value = 'target-reply-a'
  target.dispatchEvent(new w.Event('change'))

  assert.equal(wb.querySelector('[data-ai-action-coin]').value, '5')
  assert.deepEqual(Array.from(wb.querySelector('[data-ai-action-coin]').options, (option) => option.value), ['', '1', '5', '10'])
  assert.equal(wb.querySelector('[data-ai-action-execute]').disabled, false)
  wb.querySelector('[data-ai-action-execute]').click()
  assert.equal(await until(() => Boolean(executed)), true)
  assert.equal(executed.args.coin, 5)
})

test('AI 工作台互动写计划：用户原话存在多个金额时不预选投币档位', async () => {
  const w = makeSite()
  await load(w)
  w.eval(PLUG('ai-write-actions.user.js'))
  await new Promise((resolve) => setTimeout(resolve, 30))
  const copilot = w.LSB.__core.plugins.get('ai-copilot').exports
  const targets = [
    { targetKey: 'target-reply-a', type: 'reply', topicId: 1, postId: 87, page: 1, floor: 18, title: '当前主题', liked: false, favorited: null, tiers: [1, 5, 10] },
  ]
  copilot.actionContext = () => ({ route: { type: 'topic', id: 1, page: 1 }, reactionTargets: targets })
  copilot.planActions = async () => ({
    plan: {
      version: 1,
      summary: '给回帖投币',
      steps: [{ action: 'site.write-coin', args: { targetKey: 'target-reply-a' }, actionVersion: 1, actionProvider: 'ai-write-actions' }],
    },
    previews: [{ ok: true, text: '投币；金额由用户确认' }],
  })
  const wb = w.document.querySelector('[data-ai-workbench]')
  wb.querySelector('[data-ai-chat-mode]').value = 'site-action'
  wb.querySelector('[data-ai-chat-mode]').dispatchEvent(new w.Event('change'))
  wb.querySelector('[data-ai-chat-input]').value = '给选中回帖投 5 或 10 个币'
  wb.querySelector('[data-ai-chat-send]').click()
  assert.equal(await until(() => wb.querySelector('[data-ai-action-target]')), true)
  const target = wb.querySelector('[data-ai-action-target]')
  target.value = 'target-reply-a'
  target.dispatchEvent(new w.Event('change'))

  assert.equal(wb.querySelector('[data-ai-action-coin]').value, '')
  assert.equal(wb.querySelector('[data-ai-action-execute]').disabled, true, '多个候选金额必须由用户明确选择')
})

test('AI 工作台互动写计划：结果未知时明确提示检查站点且不提供重试', async () => {
  let called = 0
  const { wb } = await createWriteActionTurn({ execute: async () => {
    called += 1
    return { kind: 'unknown', label: '点赞请求结果未知，请检查站点状态' }
  } })
  wb.querySelector('[data-ai-action-execute]').click()
  assert.equal(await until(() => /未知|检查.*站点/.test(wb.querySelector('[data-ai-action-status]')?.textContent || '')), true)
  assert.equal(wb.querySelector('[data-ai-action-execute]'), null)
  assert.equal(wb.querySelector('[data-ai-action-retry-failed]'), null)
  assert.equal(called, 1)
  const saved = JSON.parse(wb.ownerDocument.defaultView.localStorage.getItem('lsb_base:ai-workbench:action-history'))
  assert.equal(saved[0].status, 'unknown')
  assert.equal(saved[0].steps[0].state, 'unknown')
})

test('AI 工作台写计划：结果未知时提供一次只读检查并收敛为已确认结果', async () => {
  let checkedReceipt = null
  const { w, wb } = await createWriteActionTurn({ execute: async () => ({
    kind: 'unknown',
    label: '回复请求结果未知，请检查站点状态',
    receipt: { token: 'receipt-workbench-test' },
  }) })
  w.LSB.bus.handle('ai-write-actions:check-result', async ({ receipt }) => {
    checkedReceipt = receipt
    return { outcome: 'success', status: 'checked-success', message: '已在站点找到匹配回复' }
  })
  wb.querySelector('[data-ai-action-execute]').click()
  assert.equal(await until(() => wb.querySelector('[data-ai-action-check]')), true)
  wb.querySelector('[data-ai-action-check]').click()
  assert.equal(await until(() => wb.querySelector('[data-ai-action-status]')?.textContent.includes('已完成')), true)
  assert.equal(checkedReceipt?.token, 'receipt-workbench-test')
  assert.equal(wb.querySelector('[data-ai-action-check]'), null)
  assert.equal(wb.querySelector('[data-ai-action-retry-failed]'), null)
  const saved = JSON.parse(w.localStorage.getItem('lsb_base:ai-workbench:action-history'))
  assert.equal(saved[0].status, 'completed')
  assert.equal(saved[0].steps[0].state, 'completed')
  assert.doesNotMatch(w.localStorage.getItem('lsb_base:ai-workbench:action-history'), /receipt-workbench-test/)
})

test('AI 工作台跨主题检索：候选、手动扩展和正文读取均由用户操作触发', async () => {
  const w = makeSite()
  await load(w)
  const copilot = w.LSB.__core.plugins.get('ai-copilot').exports
  const starts = []
  const candidateLoads = []
  const reads = []
  const pageReads = []
  const candidates = [
    { id: 9101, title: '候选主题 A', authorName: '作者甲', forumName: '交流', replies: 5, lastActiveTs: 10, pinned: false, sourceFields: ['body'], href: 'https://evil.example/a' },
    { id: 9102, title: '<img src=x onerror=alert(1)> 候选 B', authorName: '作者乙', forumName: '交流', replies: 2, lastActiveTs: 9, pinned: false, sourceFields: ['body'] },
    { id: 9103, title: '候选主题 C', authorName: '作者丙', forumName: '资源', replies: 1, lastActiveTs: 8, pinned: false, sourceFields: ['title'] },
    { id: 9104, title: '候选主题 D', authorName: '作者丁', forumName: '资源', replies: 0, lastActiveTs: 7, pinned: false, sourceFields: ['title'] },
  ]
  copilot.startResearch = async (options) => {
    starts.push(options)
    options.onProgress?.({ stage: 'plan', state: 'complete', summary: '查询字段已验证' })
    return {
      researchId: 'research-ui-1', source: 'site-search', query: 'kernel', field: 'body', page: 1,
      hasNext: true, nextPage: 2, candidates: candidates.slice(0, 2),
    }
  }
  copilot.loadResearchCandidates = async (options) => {
    candidateLoads.push(options)
    return {
      researchId: 'research-ui-1', source: 'site-search', query: 'kernel', field: options.field,
      page: options.page, hasNext: options.page === 1, nextPage: options.page === 1 ? 2 : null,
      candidates: options.page === 1 ? candidates.slice(0, 3) : candidates,
    }
  }
  copilot.readResearchSelection = async (options) => {
    reads.push(options)
    return {
      text: 'ANSWER_BODY_SENTINEL 依据已选主题回答 [[topic:9101 floor:4]]。',
      meta: {
        pageStates: [
          { topicId: 9101, currentPage: 1, nextPage: 2, hasNext: true, truncated: false, failedPage: null },
          { topicId: 9102, currentPage: 1, nextPage: 2, hasNext: true, truncated: false, failedPage: null },
          { topicId: 9103, currentPage: 1, nextPage: 2, hasNext: false, truncated: false, failedPage: null },
        ],
        citations: [
        { kind: 'topic', topicId: 9101, floor: 0, known: true, href: 'https://evil.example/fake' },
        { topicId: 9101, floor: 4, postId: '777', authorName: 'AUTHOR_SENTINEL', excerpt: 'EXCERPT_SENTINEL', known: true, href: 'https://evil.example/citation-sentinel' },
        ],
      },
    }
  }
  copilot.loadResearchTopicPage = async (options) => {
    pageReads.push(options)
    if (options.topicId === 9102) throw new Error('分页读取失败')
    return {
      text: 'PAGE_TWO_ANSWER [[topic:9101 floor:5]]。',
      meta: {
        pageStates: [
          { topicId: 9101, currentPage: 2, nextPage: 3, hasNext: false, truncated: true, failedPage: null },
          { topicId: 9102, currentPage: 1, nextPage: 2, hasNext: true, truncated: false, failedPage: null },
          { topicId: 9103, currentPage: 1, nextPage: 2, hasNext: false, truncated: false, failedPage: null },
        ],
        citations: [
          { topicId: 9101, page: 2, floor: 5, postId: '778', authorName: 'PAGE_TWO_AUTHOR', excerpt: 'PAGE_TWO_EXCERPT', known: true, href: 'https://evil.example/page-two' },
        ],
      },
    }
  }

  const wb = w.document.querySelector('[data-ai-workbench]')
  const mode = wb.querySelector('[data-ai-chat-mode]')
  mode.value = 'research'
  mode.dispatchEvent(new w.Event('change'))
  const source = wb.querySelector('[data-ai-research-source]')
  assert.ok(source, '检索能力显示来源选择')
  wb.querySelector('[data-ai-chat-input]').value = '搜索站内 kernel 主题'
  wb.querySelector('[data-ai-chat-send]').click()
  assert.equal(await until(() => wb.querySelectorAll('[data-ai-research-candidate]').length === 2), true)
  assert.equal(starts.length, 1)
  assert.equal(starts[0].source, 'auto')
  assert.equal(reads.length, 0, '展示候选阶段不读取主题正文')
  const firstCard = wb.querySelector('[data-ai-research-candidate="9101"]')
  assert.equal(firstCard.querySelector('a')?.getAttribute('href'), '/topic/9101', '链接由本地 ID 生成')
  assert.equal(firstCard.querySelector('img'), null, '候选标题按文本呈现，不解析 HTML')
  assert.match(firstCard.textContent, /正文/)

  const field = wb.querySelector('[data-ai-research-field]')
  field.value = 'title'
  field.dispatchEvent(new w.Event('change'))
  assert.equal(await until(() => candidateLoads.length === 1 && wb.querySelectorAll('[data-ai-research-candidate]').length === 3), true)
  assert.equal(candidateLoads[0].field, 'title')
  assert.equal(candidateLoads[0].page, 1)
  wb.querySelector('[data-ai-research-next]').click()
  assert.equal(await until(() => candidateLoads.length === 2 && wb.querySelectorAll('[data-ai-research-candidate]').length === 4), true)
  assert.equal(candidateLoads[1].page, 2, '分页只在用户点击后加载一页')
  assert.equal(wb.querySelectorAll('[data-ai-research-candidate="9101"]').length, 1, '重复 ID 合并成一张卡片')

  for (const card of wb.querySelectorAll('[data-ai-research-candidate]')) {
    const checkbox = card.querySelector('[data-ai-research-select]')
    checkbox.checked = true
    checkbox.dispatchEvent(new w.Event('change'))
  }
  assert.equal(wb.querySelectorAll('[data-ai-research-select]:checked').length, 3, '最多保留 3 个选中主题')
  wb.querySelector('[data-ai-research-read]').click()
  assert.equal(await until(() => reads.length === 1 && wb.querySelector('[data-ai-chat-assistant]')?.textContent.includes('ANSWER_BODY_SENTINEL')), true)
  assert.deepEqual(Array.from(reads[0].topicIds), [9101, 9102, 9103])
  assert.equal(wb.querySelectorAll('[data-ai-research-read-page]').length, 2, '只为有后续页的已选主题显示按钮')
  assert.equal(wb.querySelector('[data-ai-research-read-page="9104"]'), null, '未选主题不能深读')
  assert.equal(wb.querySelectorAll('[data-ai-research-select]:checked').length, 3, '首读后保留已选主题')
  wb.querySelector('[data-ai-research-read-page="9101"]').click()
  assert.equal(await until(() => pageReads.length === 1 && wb.querySelector('[data-ai-chat-assistant]')?.textContent.includes('PAGE_TWO_ANSWER')), true)
  assert.deepEqual({ researchId: pageReads[0].researchId, topicId: pageReads[0].topicId, page: pageReads[0].page, question: pageReads[0].question }, {
    researchId: 'research-ui-1', topicId: 9101, page: 2, question: '搜索站内 kernel 主题',
  })
  assert.equal(typeof pageReads[0].onProgress, 'function')
  assert.equal(wb.querySelector('[data-ai-research-read-page="9101"]'), null)
  const pageTwoCitation = wb.querySelector('.ai-workbench-citations a[href*="post-778"]')
  assert.equal(pageTwoCitation?.getAttribute('href'), '/topic/9101?floor=5#post-778')
  wb.querySelector('[data-ai-research-read-page="9102"]').click()
  assert.equal(await until(() => wb.querySelector('[data-ai-research-page-status="9102"]')?.textContent.includes('分页读取失败')), true)
  assert.equal(pageReads.length, 2, '失败后仍然只向被点击的主题请求')
  const citation = wb.querySelector('.ai-workbench-citations a')
  assert.equal(citation?.getAttribute('href'), '/topic/9101?floor=5#post-778', '渲染引用由本地主题和楼层生成')
  assert.match(wb.querySelector('[data-ai-chat-assistant]').textContent, /PAGE_TWO_EXCERPT/)
  assert.match(wb.querySelector('[data-ai-chat-assistant]').textContent, /PAGE_TWO_AUTHOR/)
  assert.equal(wb.querySelector('.ai-workbench-citations a[href*="evil.example"]'), null)
  const floorCitation = wb.querySelector('.ai-workbench-citations a[href*="post-778"]')
  assert.equal(floorCitation?.getAttribute('href'), '/topic/9101?floor=5#post-778')
  const stored = w.localStorage.getItem('lsb_base:ai-workbench:conversations')
  assert.doesNotMatch(stored, /候选主题|candidate|https:\/\/evil\.example|帖子正文|ANSWER_BODY_SENTINEL|EXCERPT_SENTINEL|AUTHOR_SENTINEL|post-777|citation-sentinel/)
  const storedTurn = JSON.parse(stored).conversations[0].turns[0]
  assert.match(storedTurn.answer, /已读取所选主题/)
  assert.doesNotMatch(storedTurn.answer, /ANSWER_BODY_SENTINEL|PAGE_TWO_ANSWER/)
  assert.deepEqual(storedTurn.citations, [
    { kind: 'floor', topicId: 9101, floor: 5, known: true },
  ])

  const refreshed = makeSite()
  refreshed.localStorage.setItem('lsb_base:ai-workbench:conversations', stored)
  await load(refreshed)
  const refreshedAnswer = refreshed.document.querySelector('[data-ai-chat-assistant]')
  assert.match(refreshedAnswer.textContent, /已读取所选主题/)
  assert.match(refreshedAnswer.textContent, /候选.*失效|刷新.*重新检索/)
  assert.doesNotMatch(refreshedAnswer.textContent, /ANSWER_BODY_SENTINEL|EXCERPT_SENTINEL|AUTHOR_SENTINEL/)
})

test('AI 工作台跨主题检索：问题 URL 只用于实时检索，不写入或恢复到本地历史', async () => {
  const question = '查这个 https://example.test/private/topic?token=secret'
  const urlParts = [/https?:\/\//i, /example\.test/i, /private\/topic/i, /token=secret/i]
  const w = makeSite()
  await load(w)
  const copilot = w.LSB.__core.plugins.get('ai-copilot').exports
  const starts = []
  copilot.startResearch = async (options) => {
    starts.push(options)
    return { researchId: 'privacy-research', source: 'site-search', query: 'private topic', field: 'title', page: 1, hasNext: false, candidates: [] }
  }
  const wb = w.document.querySelector('[data-ai-workbench]')
  wb.querySelector('[data-ai-chat-mode]').value = 'research'
  wb.querySelector('[data-ai-chat-mode]').dispatchEvent(new w.Event('change'))
  wb.querySelector('[data-ai-chat-input]').value = question
  wb.querySelector('[data-ai-chat-send]').click()
  assert.equal(await until(() => starts.length === 1 && !wb.querySelector('.ai-workbench-wait')), true)

  const stored = w.localStorage.getItem('lsb_base:ai-workbench:conversations')
  for (const part of urlParts) assert.doesNotMatch(stored, part, `研究历史不得保存 URL 片段 ${part}`)
  const savedHistory = JSON.parse(stored)
  assert.doesNotMatch(savedHistory.conversations[0].title, /https?:\/\/|example\.test|private\/topic|token=secret/i)
  assert.doesNotMatch(savedHistory.conversations[0].turns[0].question, /https?:\/\/|example\.test|private\/topic|token=secret/i)
  assert.equal(starts[0].question, question, '完整问题及 URL 必须到达实时检索')

  const refreshed = makeSite()
  refreshed.localStorage.setItem('lsb_base:ai-workbench:conversations', stored)
  await load(refreshed)
  const refreshedHistory = refreshed.localStorage.getItem('lsb_base:ai-workbench:conversations')
  for (const part of urlParts) assert.doesNotMatch(refreshedHistory, part, `刷新后不得恢复 URL 片段 ${part}`)

  const migrated = makeSite()
  migrated.localStorage.setItem('lsb_base:ai-workbench:conversations', JSON.stringify({
    version: 1,
    activeId: 'legacy-research',
    conversations: [{
      id: 'legacy-research', title: question, createdAt: 1, updatedAt: 2,
      turns: [{
        id: 'legacy-turn', createdAt: 2, capability: 'research',
        context: { kind: 'current-page', routeType: 'home', topicId: 0 },
        title: question, question, answer: '已找到候选。', state: 'complete', phases: [], citations: [],
      }],
    }],
  }))
  await load(migrated)
  const migratedHistory = migrated.localStorage.getItem('lsb_base:ai-workbench:conversations')
  for (const part of urlParts) assert.doesNotMatch(migratedHistory, part, `旧研究历史迁移时应移除 URL 片段 ${part}`)

  const ordinary = makeSite()
  ordinary.history.replaceState({}, '', '/')
  await load(ordinary)
  const ordinaryCopilot = ordinary.LSB.__core.plugins.get('ai-copilot').exports
  ordinaryCopilot.runConsoleQuery = async () => ({ text: '已处理。', meta: { citations: [] } })
  const ordinaryWorkbench = ordinary.document.querySelector('[data-ai-workbench]')
  ordinaryWorkbench.querySelector('[data-ai-chat-input]').value = question
  ordinaryWorkbench.querySelector('[data-ai-chat-send]').click()
  assert.equal(await until(() => Boolean(ordinary.localStorage.getItem('lsb_base:ai-workbench:conversations')?.includes('已处理。'))), true)
  assert.match(ordinary.localStorage.getItem('lsb_base:ai-workbench:conversations'), /https:\/\/example\.test\/private\/topic/, 'URL redaction remains scoped to research history')
})

test('AI 工作台：本人回帖仅展示候选，用户选择后读取并验证引用', async () => {
  const w = makeSite()
  await load(w)
  const copilot = w.LSB.__core.plugins.get('ai-copilot').exports
  const starts = []
  const candidatePages = []
  const reads = []
  copilot.startResearch = async (options) => {
    starts.push(options)
    return {
      researchId: 'my-replies-ui', source: 'my-replies', query: '内核', field: 'reply',
      page: 1, hasNext: true, nextPage: 2,
      replyCandidates: [{ postId: 8101, topicId: 9101, topicTitle: '内核讨论一' }],
    }
  }
  copilot.loadResearchCandidates = async (options) => {
    candidatePages.push(options)
    return {
      researchId: 'my-replies-ui', source: 'my-replies', query: '内核', field: 'reply',
      page: options.page, hasNext: false, nextPage: null,
      replyCandidates: [
        { postId: 8102, topicId: 9102, topicTitle: '内核讨论二' },
        { postId: 8103, topicId: 9103, topicTitle: '内核讨论三' },
        { postId: 8104, topicId: 9104, topicTitle: '内核讨论四' },
      ],
    }
  }
  copilot.readResearchReplySelection = async (options) => {
    reads.push(options)
    return {
      text: '根据所选回帖，关键依据在此 [[topic:9101 floor:4]]。',
      meta: {
        partial: false,
        readReplies: [{ postId: 8101, topicId: 9101, floor: 4, page: 2, authorName: '本人' }],
        citations: [{ topicId: 9101, floor: 4, page: 2, postId: '8101', known: true, href: 'https://evil.example/forged' }],
      },
    }
  }

  const wb = w.document.querySelector('[data-ai-workbench]')
  const mode = wb.querySelector('[data-ai-chat-mode]')
  mode.value = 'research'
  mode.dispatchEvent(new w.Event('change'))
  wb.querySelector('[data-ai-research-source]').value = 'my-replies'
  wb.querySelector('[data-ai-research-source]').dispatchEvent(new w.Event('change'))
  wb.querySelector('[data-ai-chat-input]').value = '找我的回帖：内核'
  wb.querySelector('[data-ai-chat-send]').click()
  assert.equal(await until(() => wb.querySelector('[data-ai-research-reply-candidate="8101"]')), true)
  assert.equal(starts[0].source, 'my-replies')
  assert.match(wb.querySelector('[data-ai-research-source-label]').textContent, /本人回帖列表/)
  assert.match(wb.querySelector('[data-ai-research-selection-status]').textContent, /候选页不含正文/)
  assert.equal(reads.length, 0, '候选展示期间不读取主题正文')
  assert.equal(wb.querySelector('[data-ai-research-reply-candidate="8101"] a').getAttribute('href'), '/topic/9101?replyid=8101')

  wb.querySelector('[data-ai-research-next]').click()
  assert.equal(await until(() => candidatePages.length === 1 && wb.querySelector('[data-ai-research-reply-candidate="8104"]')), true)
  assert.deepEqual({ field: candidatePages[0].field, page: candidatePages[0].page }, { field: 'reply', page: 2 })
  assert.equal(wb.querySelectorAll('[data-ai-research-reply-candidate]').length, 4)

  for (const id of [8101, 8102, 8103, 8104]) {
    const checkbox = wb.querySelector(`[data-ai-research-reply-candidate="${id}"] [data-ai-research-reply-select]`)
    checkbox.checked = true
    checkbox.dispatchEvent(new w.Event('change'))
    if (id === 8104) {
      assert.equal(checkbox.checked, false)
      assert.match(wb.querySelector('[data-ai-research-status]').textContent, /最多选择 3 条/)
    }
  }
  for (const id of [8102, 8103]) {
    const checkbox = wb.querySelector(`[data-ai-research-reply-candidate="${id}"] [data-ai-research-reply-select]`)
    checkbox.checked = false
    checkbox.dispatchEvent(new w.Event('change'))
  }
  wb.querySelector('[data-ai-research-reply-read]').click()
  assert.equal(await until(() => reads.length === 1 && wb.querySelector('.ai-workbench-citations a')), true)
  assert.deepEqual(Array.from(reads[0].postIds), [8101])
  assert.equal(wb.querySelector('.ai-workbench-citations a').getAttribute('href'), '/topic/9101?floor=4#post-8101')
  assert.equal(wb.querySelector('.ai-workbench-citations a[href*="evil.example"]'), null)
  const stored = w.localStorage.getItem('lsb_base:ai-workbench:conversations')
  assert.doesNotMatch(stored, /内核讨论一|本人回帖候选|\/user\/5372|SELECTED_REPLY_SECRET/)
})

test('AI 工作台互动目标：主题操作选择与正文读取选择相互独立', async () => {
  const w = makeSite()
  await load(w)
  const copilot = w.LSB.__core.plugins.get('ai-copilot').exports
  const plans = []
  copilot.startResearch = async () => ({
    researchId: 'action-target-topics', source: 'site-search', query: 'kernel', field: 'title', page: 1,
    hasNext: false, candidates: [
      { id: 9101, title: '待读取主题', authorName: '甲', forumName: '技术交流', sourceFields: ['title'] },
      { id: 9102, title: '仅操作主题', authorName: '乙', forumName: '技术交流', sourceFields: ['title'] },
    ],
  })
  copilot.planActions = async (options) => {
    plans.push(options)
    return {
      targetScopeNonce: 'ephemeral-target-scope',
      plan: { version: 1, summary: '只读计划', steps: [{ action: 'site.navigate', args: { target: 'home' } }] },
      previews: [{ ok: true, text: '打开首页' }],
    }
  }
  const wb = w.document.querySelector('[data-ai-workbench]')
  const mode = wb.querySelector('[data-ai-chat-mode]')
  mode.value = 'research'
  mode.dispatchEvent(new w.Event('change'))
  wb.querySelector('[data-ai-chat-input]').value = '搜索 kernel 主题'
  wb.querySelector('[data-ai-chat-send]').click()
  assert.equal(await until(() => wb.querySelector('[data-ai-research-candidate="9102"]')), true)

  const readChoice = wb.querySelector('[data-ai-research-candidate="9101"] [data-ai-research-select]')
  const actionChoice = wb.querySelector('[data-ai-research-candidate="9102"] [data-ai-research-target-topic]')
  assert.ok(actionChoice, '每个候选主题应有独立的互动目标勾选项')
  readChoice.checked = true
  readChoice.dispatchEvent(new w.Event('change'))
  actionChoice.checked = true
  actionChoice.dispatchEvent(new w.Event('change'))
  assert.equal(wb.querySelector('[data-ai-research-candidate="9101"] [data-ai-research-target-topic]').checked, false)

  mode.value = 'site-action'
  mode.dispatchEvent(new w.Event('change'))
  wb.querySelector('[data-ai-chat-input]').value = '收藏我选中的主题'
  wb.querySelector('[data-ai-chat-send]').click()
  assert.equal(await until(() => plans.length === 1), true)
  assert.equal(JSON.stringify(plans[0].targetScope), JSON.stringify({ researchId: 'action-target-topics', topicIds: [9102], postIds: [] }))
})

test('AI 工作台互动目标：本人回帖必须单独标为操作目标后才可进入写计划', async () => {
  const w = makeSite()
  await load(w)
  const copilot = w.LSB.__core.plugins.get('ai-copilot').exports
  const plans = []
  copilot.startResearch = async () => ({
    researchId: 'action-target-replies', source: 'my-replies', query: 'kernel', field: 'reply', page: 1,
    hasNext: false, candidates: [], replyCandidates: [
      { postId: 8101, topicId: 9101, topicTitle: '待读取回帖主题' },
      { postId: 8102, topicId: 9102, topicTitle: '仅操作回帖主题' },
    ],
  })
  copilot.planActions = async (options) => {
    plans.push(options)
    return {
      targetScopeNonce: 'ephemeral-reply-scope',
      plan: { version: 1, summary: '只读计划', steps: [{ action: 'site.navigate', args: { target: 'home' } }] },
      previews: [{ ok: true, text: '打开首页' }],
    }
  }
  const wb = w.document.querySelector('[data-ai-workbench]')
  const mode = wb.querySelector('[data-ai-chat-mode]')
  mode.value = 'research'
  mode.dispatchEvent(new w.Event('change'))
  wb.querySelector('[data-ai-research-source]').value = 'my-replies'
  wb.querySelector('[data-ai-research-source]').dispatchEvent(new w.Event('change'))
  wb.querySelector('[data-ai-chat-input]').value = '搜索我的 kernel 回帖'
  wb.querySelector('[data-ai-chat-send]').click()
  assert.equal(await until(() => wb.querySelector('[data-ai-research-reply-candidate="8102"]')), true)

  const readChoice = wb.querySelector('[data-ai-research-reply-candidate="8101"] [data-ai-research-reply-select]')
  const actionChoice = wb.querySelector('[data-ai-research-reply-candidate="8102"] [data-ai-research-target-reply]')
  assert.ok(actionChoice, '本人回帖候选应提供与正文读取分开的操作目标选择')
  readChoice.checked = true
  readChoice.dispatchEvent(new w.Event('change'))
  actionChoice.checked = true
  actionChoice.dispatchEvent(new w.Event('change'))
  assert.equal(wb.querySelector('[data-ai-research-reply-candidate="8101"] [data-ai-research-target-reply]').checked, false)

  mode.value = 'site-action'
  mode.dispatchEvent(new w.Event('change'))
  wb.querySelector('[data-ai-chat-input]').value = '给我选中的回帖点赞'
  wb.querySelector('[data-ai-chat-send]').click()
  assert.equal(await until(() => plans.length === 1), true)
  assert.equal(JSON.stringify(plans[0].targetScope), JSON.stringify({ researchId: 'action-target-replies', topicIds: [], postIds: [8102] }))
})

test('M9 工作台：选中目标与完整草稿可审阅，临时回复目标不会进入本地历史', async () => {
  const w = makeSite()
  await load(w)
  w.eval(PLUG('ai-write-actions.user.js'))
  await new Promise((resolve) => setTimeout(resolve, 30))
  const copilot = w.LSB.__core.plugins.get('ai-copilot').exports
  const originalActionContext = copilot.actionContext
  const target = {
    targetKey: 'target-key-secret', type: 'reply', topicId: 9101, postId: 91014, page: 2,
    floor: 4, title: '跨主题目标', authorName: '目标作者', evidenceHash: 'abc123', evidence: '不应存储的目标正文',
  }
  copilot.startResearch = async () => ({
    researchId: 'm9-research', source: 'my-replies', query: '内核', field: 'reply', page: 1,
    hasNext: false, candidates: [], replyCandidates: [
      { postId: 91014, topicId: 9101, topicTitle: '跨主题目标' },
    ],
  })
  copilot.actionContext = (command, options) => ({
    ...originalActionContext(command, options),
    reactionScopeNonce: 'm9-scope-private',
    replyTargets: [{ ...target }],
  })
  const plans = []
  copilot.planActions = async (options) => {
    plans.push(options)
    return {
      targetScopeNonce: 'm9-scope-private',
      plan: {
        version: 1,
        summary: '回复所选回帖',
        steps: [{
          action: 'site.write-selected-reply',
          args: { targetKey: target.targetKey, body: '完整且可审阅的回复草稿。' },
          actionVersion: 1,
          actionProvider: 'ai-write-actions',
        }],
      },
      previews: [{ ok: true, text: '回复「跨主题目标」 · 回帖 #4' }],
    }
  }
  const wb = w.document.querySelector('[data-ai-workbench]')
  const mode = wb.querySelector('[data-ai-chat-mode]')
  mode.value = 'research'
  mode.dispatchEvent(new w.Event('change'))
  wb.querySelector('[data-ai-research-source]').value = 'my-replies'
  wb.querySelector('[data-ai-research-source]').dispatchEvent(new w.Event('change'))
  wb.querySelector('[data-ai-chat-input]').value = '搜索我的内核回帖'
  wb.querySelector('[data-ai-chat-send]').click()
  assert.equal(await until(() => wb.querySelector('[data-ai-research-reply-candidate="91014"]')), true)
  const targetChoice = wb.querySelector('[data-ai-research-reply-candidate="91014"] [data-ai-research-target-reply]')
  targetChoice.checked = true
  targetChoice.dispatchEvent(new w.Event('change'))
  assert.match(wb.querySelector('[data-ai-research-selection-status]').textContent, /回复目标.*只选一个/)

  mode.value = 'site-action'
  mode.dispatchEvent(new w.Event('change'))
  wb.querySelector('[data-ai-chat-input]').value = '请回复我选中的楼层'
  wb.querySelector('[data-ai-chat-send]').click()
  assert.equal(await until(() => wb.querySelector('[data-ai-action-execute]')), true, wb.textContent)
  assert.equal(JSON.stringify(plans[0].targetScope), JSON.stringify({ researchId: 'm9-research', topicIds: [], postIds: [91014] }))
  assert.match(wb.querySelector('[data-ai-action-plan]').textContent, /跨主题目标/)
  assert.match(wb.querySelector('[data-ai-action-plan]').textContent, /回帖 #4/)
  assert.match(wb.querySelector('[data-ai-action-plan]').textContent, /完整且可审阅的回复草稿。/)
  assert.doesNotMatch(wb.querySelector('[data-ai-action-plan]').textContent, /target-key-secret/)
  const actionHistory = w.localStorage.getItem('lsb_base:ai-workbench:action-history')
  assert.doesNotMatch(actionHistory, /target-key-secret|abc123|不应存储的目标正文/)
  assert.deepEqual(JSON.parse(actionHistory).map((row) => row.plan?.steps || []), [[]])
})

test('AI 工作台对话历史：研究轮次已淘汰时仍清理遗留对话标题 URL', async () => {
  const w = makeSite()
  const title = '查看 https://example.test/private/topic?token=secret'
  const turns = Array.from({ length: 10 }, (_, index) => ({
    id: `ordinary-${index}`,
    createdAt: index + 2,
    capability: 'ask',
    context: { kind: 'current-page', routeType: 'home', topicId: 0 },
    title: `普通对话 ${index}`,
    question: `普通问题 ${index}`,
    answer: '已处理。',
    state: 'complete',
    phases: [],
    citations: [],
  }))
  w.localStorage.setItem('lsb_base:ai-workbench:conversations', JSON.stringify({
    version: 1,
    activeId: 'legacy-title',
    conversations: [{ id: 'legacy-title', title, createdAt: 1, updatedAt: 20, turns }],
  }))
  await load(w)

  const stored = w.localStorage.getItem('lsb_base:ai-workbench:conversations')
  assert.doesNotMatch(stored, /https?:\/\//i)
  assert.doesNotMatch(stored, /example\.test|private\/topic|token=secret/i)
  const migrated = JSON.parse(stored).conversations[0]
  assert.equal(migrated.turns.length, 10)
  assert.ok(migrated.turns.every((turn) => turn.capability === 'ask'))
  assert.doesNotMatch(migrated.title, /https?:\/\/|example\.test|private\/topic|token=secret/i)
})

test('AI 工作台跨主题检索来源校验：自动查询拒绝个人结果并接受对应的本人收藏请求', async () => {
  const w = makeSite()
  await load(w)
  const copilot = w.LSB.__core.plugins.get('ai-copilot').exports
  const starts = []
  copilot.startResearch = async (options) => {
    starts.push(options)
    const personalFavorites = /(?:我的|我自己的|本人|我发布|我发过|我发的|自己发布|自己发的)/.test(options.question) && /收藏/.test(options.question)
    return {
      researchId: `source-check-${starts.length}`,
      source: personalFavorites ? 'my-favorites' : 'my-topics',
      query: 'personal sentinel query', field: 'title', page: 1, hasNext: false,
      candidates: [{ id: 9200 + starts.length, title: `来源候选 ${starts.length}`, authorName: '作者', forumName: '交流', replies: 1, lastActiveTs: 1, pinned: false, sourceFields: ['title'] }],
    }
  }
  const wb = w.document.querySelector('[data-ai-workbench]')
  const mode = wb.querySelector('[data-ai-chat-mode]')
  mode.value = 'research'
  mode.dispatchEvent(new w.Event('change'))
  const input = wb.querySelector('[data-ai-chat-input]')
  input.value = '搜索缓存方案'
  wb.querySelector('[data-ai-chat-send]').click()
  assert.equal(await until(() => starts.length === 1 && !wb.querySelector('.ai-workbench-wait')), true)
  assert.equal(starts[0].source, 'auto')
  assert.equal(wb.querySelector('[data-ai-research-candidate]'), null, '自动站内搜索不能展示服务端返回的个人候选')
  assert.match(wb.querySelector('[data-ai-chat-assistant]').textContent, /来源.*不匹配|无法验证.*来源/)

  input.value = '搜索我自己的收藏主题'
  wb.querySelector('[data-ai-chat-send]').click()
  assert.equal(await until(() => starts.length === 2 && wb.querySelector('[data-ai-research-candidate]')), true)
  assert.equal(starts[1].source, 'auto')
  assert.match(wb.querySelector('[data-ai-research-candidate]').textContent, /来源候选 2/)
})

test('AI 工作台跨主题检索：本人数据源需显式选择，刷新不恢复候选或自动重放', async () => {
  const w = makeSite()
  await load(w)
  const copilot = w.LSB.__core.plugins.get('ai-copilot').exports
  const starts = []
  copilot.startResearch = async (options) => {
    starts.push(options)
    return { researchId: 'personal-research', source: options.source, query: '', field: 'title', page: 1, hasNext: false, candidates: [] }
  }
  const wb = w.document.querySelector('[data-ai-workbench]')
  const mode = wb.querySelector('[data-ai-chat-mode]')
  mode.value = 'research'
  mode.dispatchEvent(new w.Event('change'))
  const source = wb.querySelector('[data-ai-research-source]')
  source.value = 'my-favorites'
  wb.querySelector('[data-ai-chat-input]').value = '列出我收藏的主题'
  wb.querySelector('[data-ai-chat-send]').click()
  assert.equal(await until(() => starts.length === 1), true)
  assert.equal(starts[0].source, 'my-favorites')

  const saved = JSON.parse(w.localStorage.getItem('lsb_base:ai-workbench:conversations'))
  assert.equal(saved.conversations[0].turns[0].capability, 'research')
  assert.doesNotMatch(JSON.stringify(saved), /personal-research|候选主题标题|主题正文|\/user\/5372/)

  const refreshed = makeSite()
  refreshed.localStorage.setItem('lsb_base:ai-workbench:conversations', JSON.stringify({
    version: 1,
    activeId: 'research-refresh',
    conversations: [{
      id: 'research-refresh', title: '临时候选', createdAt: 1, updatedAt: 2,
      turns: [{
        id: 'research-turn', createdAt: 2, capability: 'research',
        context: { kind: 'current-topic', routeType: 'topic', topicId: 1 },
        title: '搜索帖子', question: '比较站内相关主题', answer: '找到 2 个候选；请选择主题后读取正文。', state: 'complete',
        phases: [{ stage: 'local', state: 'complete', summary: '找到 2 个候选' }], citations: [],
      }],
    }],
  }))
  await load(refreshed)
  assert.equal(refreshed.document.querySelector('[data-ai-chat-retry]'), null)
  assert.match(refreshed.document.querySelector('[data-ai-chat-assistant]').textContent, /候选.*失效|刷新.*重新检索/)
  assert.equal(refreshed.document.querySelector('[data-ai-research-candidate]'), null)
  assert.doesNotMatch(refreshed.localStorage.getItem('lsb_base:ai-workbench:conversations'), /候选主题标题|楼层正文|https:\/\//)
})
