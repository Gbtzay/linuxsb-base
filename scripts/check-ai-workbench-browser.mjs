/** Local browser QA: only fixture pages and a local simulated model; no production requests. */
import assert from 'node:assert/strict'
import { existsSync, readFileSync, writeFileSync, mkdirSync } from 'node:fs'
import { dirname, join, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'
import { createServer } from 'node:http'
import { spawn } from 'node:child_process'
import { JSDOM } from 'jsdom'

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..')
const browserPath = process.env.M13_BROWSER || process.env.M12_BROWSER || [
  'C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe',
  'C:/Program Files/Google/Chrome/Application/chrome.exe',
  '/usr/bin/chromium', '/usr/bin/google-chrome',
].find(existsSync)
if (!browserPath) throw new Error('Set M12_BROWSER to a Chromium browser executable.')
const profile = join(root, `.tmp-m14-browser-profile-${Date.now()}`)
mkdirSync(profile, { recursive: true })
const dom = new JSDOM(readFileSync(join(root, 'test/fixtures/topic1.html'), 'utf8'))
for (const element of dom.window.document.querySelectorAll('script,link,img,iframe,video,audio,source,object,embed')) element.remove()
for (const element of dom.window.document.querySelectorAll('*')) {
  for (const attribute of Array.from(element.attributes)) if (/^on/i.test(attribute.name)) element.removeAttribute(attribute.name)
}
const fixtureStyle = dom.window.document.createElement('style')
fixtureStyle.textContent = 'body{margin:8px;font:14px Arial,sans-serif}svg{width:20px;height:20px}'
dom.window.document.head.appendChild(fixtureStyle)
const fixture = dom.serialize()
dom.window.close()
const reviewDom = new JSDOM(fixture, { url: 'http://127.0.0.1/topic/1?p=2' })
reviewDom.window.document.querySelector('#post-21 .post-content').textContent = '浏览器复核后的正文变化'
reviewDom.window.document.querySelector('#post-24')?.remove()
const reviewFixture = reviewDom.serialize()
reviewDom.window.close()
const requests = []
let cancelledRequests = 0
let cancelledProbeRequests = 0
let reviewReads = 0
let cancelledReviewReads = 0
let delayReviewRead = false
const attempts = new Map()
const summaryAttempts = new Map()
let probeAttempts = 0
const server = createServer(async (request, response) => {
  response.setHeader('Access-Control-Allow-Origin', '*')
  response.setHeader('Access-Control-Allow-Headers', 'content-type,authorization')
  if (request.method === 'OPTIONS') { response.writeHead(204); response.end(); return }
  if (request.url === '/llm' || request.url === '/llm-alt') {
    let raw = ''
    for await (const chunk of request) raw += chunk
    const body = JSON.parse(raw)
    requests.push(body)
    const prompt = body.messages?.[1]?.content || ''
    if (prompt === '连接自检：只返回 OK') {
      probeAttempts += 1
      response.setHeader('Content-Type', 'text/event-stream; charset=utf-8')
      response.setHeader('Cache-Control', 'no-cache')
      let complete = false
      response.on('close', () => {
        if (!complete) cancelledProbeRequests += 1
      })
      if (probeAttempts === 1) {
        complete = true
        response.end('data: {"choices":[{"delta":{"content":"OK"}}]}\n\ndata: [DONE]\n\n')
        return
      }
      if (probeAttempts === 3) {
        complete = true
        response.writeHead(400, { 'Content-Type': 'application/json; charset=utf-8' })
        response.end('{"error":{"message":"stream is not supported"}}')
        return
      }
      if (probeAttempts >= 4) {
        complete = true
        response.setHeader('Content-Type', 'application/json; charset=utf-8')
        response.end('{"choices":[{"message":{"content":"OK"}}]}')
        return
      }
      const timer = setTimeout(() => {
        complete = true
        response.end('data: {"choices":[{"delta":{"content":"OK"}}]}\n\ndata: [DONE]\n\n')
      }, 2500)
      response.on('close', () => clearTimeout(timer))
      return
    }
    const summary = prompt.includes('<conversation-to-summarize>')
    if (summary) {
      const attempt = (summaryAttempts.get(prompt) || 0) + 1
      summaryAttempts.set(prompt, attempt)
      if (/摘要失败背景|失败历史/.test(prompt)) {
        response.writeHead(500, { 'Content-Type': 'application/json; charset=utf-8' })
        response.end(JSON.stringify({ error: { message: 'fixture summary failure' } }))
        return
      }
      response.setHeader('Content-Type', 'application/json; charset=utf-8')
      response.setHeader('Cache-Control', 'no-cache')
      let complete = false
      const finish = () => {
        complete = true
        response.end(JSON.stringify({ choices: [{ message: { content: '早期结论：方案甲在缓存刷新后更稳定。' } }] }))
      }
      const timer = setTimeout(finish, prompt.includes('请等待摘要') && attempt === 1 ? 2500 : 120)
      response.on('close', () => { clearTimeout(timer); if (!complete) cancelledRequests++ })
      return
    }
    const slow = prompt.includes('请慢慢解释')
    const question = prompt.match(/<task>\n([^\n]+)/)?.[1] || ''
    const attempt = (attempts.get(question) || 0) + 1
    attempts.set(question, attempt)
    response.setHeader('Content-Type', 'text/event-stream; charset=utf-8')
    response.setHeader('Cache-Control', 'no-cache')
    const refreshed = question.includes('浏览器引用复核') && attempt > 1
    const first = slow ? '逐步说明的部分回答 [#1]' : refreshed ? '刷新后的方案甲 [#1]' : '方案甲更适合 [#1]'
    const emit = (text) => response.write(`data: ${JSON.stringify({ choices: [{ index: 0, delta: { content: text } }] })}\n\n`)
    emit(first)
    let complete = false
    const timer = setTimeout(() => {
      complete = true
      emit('，需要控制缓存范围。')
      response.end('data: {"choices":[{"index":0,"delta":{},"finish_reason":"stop"}]}\n\ndata: [DONE]\n\n')
    }, slow && attempt === 1 ? 2500 : 450)
    response.on('close', () => { clearTimeout(timer); if (!complete) cancelledRequests++ })
    return
  }
  if (request.url === '/topic/1?p=2') {
    reviewReads += 1
    response.setHeader('Content-Type', 'text/html; charset=utf-8')
    response.setHeader('Content-Security-Policy', "default-src 'self' data:; script-src 'self' 'unsafe-inline' 'unsafe-eval'; style-src 'self' 'unsafe-inline'; img-src data:; connect-src 'self' http://localhost:*")
    let complete = false
    const finish = () => {
      complete = true
      response.end(reviewFixture)
    }
    const timer = setTimeout(finish, delayReviewRead ? 2500 : 100)
    response.on('close', () => {
      clearTimeout(timer)
      if (!complete) cancelledReviewReads += 1
    })
    return
  }
  response.setHeader('Content-Type', 'text/html; charset=utf-8')
  response.setHeader('Content-Security-Policy', "default-src 'self' data:; script-src 'self' 'unsafe-inline' 'unsafe-eval'; style-src 'self' 'unsafe-inline'; img-src data:; connect-src 'self' http://localhost:*")
  response.end(fixture)
})
await new Promise((resolve) => server.listen(0, '127.0.0.1', resolve))
const port = server.address().port
const child = spawn(browserPath, [
  '--headless=new', '--no-first-run', '--no-default-browser-check', '--disable-extensions',
  '--remote-debugging-port=0', `--user-data-dir=${profile}`, '--window-size=1440,1000', 'about:blank',
], { windowsHide: true, stdio: 'ignore' })
const delay = (ms) => new Promise((resolve) => setTimeout(resolve, ms))
async function waitFor(fn, label, timeout = 10000) {
  const deadline = Date.now() + timeout
  while (Date.now() < deadline) { if (await fn()) return; await delay(50) }
  throw new Error(`Timed out: ${label}`)
}
let socket
try {
  const activePort = join(profile, 'DevToolsActivePort')
  await waitFor(() => existsSync(activePort), 'browser startup')
  const debugPort = Number(readFileSync(activePort, 'utf8').split('\n')[0])
  const target = await (await fetch(`http://127.0.0.1:${debugPort}/json/new?about:blank`, { method: 'PUT' })).json()
  socket = new WebSocket(target.webSocketDebuggerUrl)
  await new Promise((resolve, reject) => { socket.addEventListener('open', resolve, { once: true }); socket.addEventListener('error', reject, { once: true }) })
  let sequence = 0
  const pending = new Map()
  const exceptions = []
  socket.addEventListener('message', ({ data }) => {
    const row = JSON.parse(String(data))
    if (row.method === 'Runtime.exceptionThrown') exceptions.push(row.params.exceptionDetails.text)
    if (!row.id || !pending.has(row.id)) return
    const { resolve, reject, timer } = pending.get(row.id)
    pending.delete(row.id)
    clearTimeout(timer)
    if (row.error) reject(new Error(`${row.error.message} :: ${pending.get(row.id)?.expression || ''}`))
    else resolve(row.result)
  })
  const call = (method, params = {}) => new Promise((resolve, reject) => {
    const id = ++sequence
    const timer = setTimeout(() => { pending.delete(id); reject(new Error(`CDP timeout: ${method}`)) }, 10000)
    pending.set(id, { resolve, reject, timer, expression: '' })
    socket.send(JSON.stringify({ id, method, params }))
  })
  const evaluate = async (expression) => {
    let result
    try {
      result = await call('Runtime.evaluate', { expression, awaitPromise: true, returnByValue: true })
    } catch (error) {
      throw new Error(`${error.message} :: ${expression.slice(0, 180)}`)
    }
    if (result.exceptionDetails) throw new Error(result.exceptionDetails.exception?.description || result.exceptionDetails.text)
    return result.result?.value
  }
  await call('Runtime.enable')
  await call('Page.enable')
  await call('Emulation.setDeviceMetricsOverride', { width: 1440, height: 1000, deviceScaleFactor: 1, mobile: false })
  await call('Page.navigate', { url: `http://127.0.0.1:${port}/topic/1` })
  await waitFor(() => evaluate('Boolean(document.body?.querySelector(".post-list"))'), 'fixture page')
  const pluginFiles = ['dist/linuxsb-base.user.js', 'plugins/skin.user.js', 'plugins/ai-summary.user.js', 'plugins/ai-actions.user.js', 'plugins/ai-copilot.user.js', 'plugins/ai-workbench.user.js']
  await evaluate(`window.unsafeWindow = window; localStorage.clear(); localStorage.setItem('lsb_base:__core:rate', '0'); localStorage.setItem('lsb_base:__core:urlPoll', '0'); localStorage.setItem('lsb_base:ai-summary:__config', JSON.stringify({apiUrl: 'http://localhost:${port}/llm', apiKey: 'fixture-only', model: 'fixture-model'})); localStorage.setItem('lsb_base:ai-copilot:__config', JSON.stringify({fetchAll:false}));`)
  const installPlugins = async () => {
    await evaluate('window.unsafeWindow = window; void 0')
    for (const file of pluginFiles) {
      await evaluate(`(0,eval)(${JSON.stringify(readFileSync(join(root, file), 'utf8'))})`)
    }
    await waitFor(() => evaluate('Boolean(document.querySelector("[data-canvas-open=ai-card]"))'), 'canvas AI entry')
    await evaluate('document.querySelector("[data-canvas-open=ai-card]")?.click()')
    await waitFor(() => evaluate('Boolean(document.querySelector("[data-surface=ai-card] [data-ai-chat-input]"))'), 'workbench mount')
  }
  await installPlugins()
  const query = (selector, property = 'textContent') => evaluate(`document.querySelector(${JSON.stringify(selector)})?.[${JSON.stringify(property)}]`)
  const has = (selector) => evaluate(`Boolean(document.querySelector(${JSON.stringify(selector)}))`)
  const click = (selector) => evaluate(`document.querySelector(${JSON.stringify(selector)}).click()`)
  const openPlus = async () => { if (!(await has('[data-ai-workbench-more-menu]:not([hidden])'))) { await click('[data-ai-workbench-more]'); await waitFor(() => has('[data-ai-workbench-more-menu]:not([hidden])'), 'more menu') } }
  const selectCapability = async (capability) => { if (!(await has('[data-ai-chat-menu]:not([hidden])'))) { await click('[data-ai-workbench-more]'); await waitFor(() => has('[data-ai-chat-menu]:not([hidden])'), 'capability menu') }; await click(`[data-ai-chat-capability="${capability}"]`) }
  const send = async (question) => { await evaluate(`document.querySelector('[data-ai-chat-input]').value = ${JSON.stringify(question)}`); await click('[data-ai-chat-send]') }
  const busy = () => evaluate("document.querySelector('[data-ai-chat-send]')?.dataset.busy || ''")
  const complete = () => waitFor(async () => await busy() === 'false', 'answer completion')
  const reloadWorkbench = async () => {
    await call('Page.reload', { ignoreCache: true })
    await waitFor(() => evaluate('Boolean(document.body?.querySelector(".post-list"))'), 'fixture reload')
    await installPlugins()
  }
  const screenshot = async (name) => {
    const result = await call('Page.captureScreenshot', { format: 'png' })
    const path = join(root, `.tmp-m14-browser-${name}.png`)
    writeFileSync(path, Buffer.from(result.data, 'base64'))
    return path
  }
  assert.equal(await has('[data-ai-chat-composer] [data-ai-chat-context]'), false)
  assert.equal(await has('[data-ai-chat-composer] [data-ai-chat-mode]'), false)
  assert.equal(await has('[data-ai-workbench-material]'), true)
  await click('[data-ai-workbench-material-remove]')
  assert.equal(await evaluate("document.querySelector('[data-ai-workbench-material]')?.hidden"), true)
  await click('[data-ai-workbench-attach]')
  assert.equal(await evaluate("document.querySelector('[data-ai-workbench-material]')?.hidden"), false)
  await click('[data-ai-workbench-more]')
  assert.equal(await has('[data-ai-chat-menu]:not([hidden])'), true)

  // M16.2：连接自检只发送固定最小文本，报告协议/能力并支持取消底层请求。
  await evaluate('LSB.open("ai-summary")')
  await waitFor(() => has('[data-ai-summary-probe]'), 'AI summary settings')
  await click('[data-ai-summary-probe]')
  await waitFor(async () => String((await query('[data-ai-summary-probe-status]')) || '').includes('流式 可用'), 'stream capability status')
  const probeRequest = requests.find((body) => body.messages?.[1]?.content === '连接自检：只返回 OK')
  assert.ok(probeRequest, 'probe request exists')
  assert.equal(probeRequest.stream, true)
  assert.doesNotMatch(JSON.stringify(probeRequest), /标题：|楼层|历史|引用|Authorization|fixture-only/)
  await click('[data-ai-summary-probe]')
  await waitFor(async () => (await query('[data-ai-summary-probe-cancel]', 'hidden')) === false, 'probe cancel button')
  await click('[data-ai-summary-probe-cancel]')
  await waitFor(async () => (await query('[data-ai-summary-probe]', 'disabled')) === false, 'probe cancel completion')
  await waitFor(() => cancelledProbeRequests === 1, 'probe transport cancellation')
  assert.match(await query('[data-ai-summary-probe-status]'), /已取消|失败|连接失败/)
  const simulatedProbeRequests = requests.length
  requests.length = 0
  await evaluate(`(() => {
    const key = 'lsb_base:ai-summary:__config'
    const cfg = JSON.parse(localStorage.getItem(key))
    cfg.apiUrl = 'http://localhost:${port}/llm-alt'
    localStorage.setItem(key, JSON.stringify(cfg))
    LSB.bus.emit('config:changed:ai-summary', cfg, { source: 'browser' })
    return true
  })()`)
  assert.equal(await evaluate('LSB.__core.plugins.get("ai-summary").exports.providerState().capabilities'), null, '端点切换后旧能力失效')
  await click('[data-ai-summary-probe]')
  await waitFor(async () => String((await query('[data-ai-summary-probe-status]')) || '').includes('流式不可用，已降级'), 'stream fallback status')
  const fallbackProbeRequests = requests.filter((body) => body.messages?.[1]?.content === '连接自检：只返回 OK')
  assert.deepEqual(fallbackProbeRequests.map((body) => body.stream), [true, false])
  assert.equal(fallbackProbeRequests.length, 2, '流式拒绝只补发一次 JSON')
  assert.doesNotMatch(await query('[data-ai-summary-probe-status]'), /fixture-only|localhost/)
  requests.length = 0
  await click('[data-canvas-open="ai-card"]')
  await waitFor(() => has('[data-surface="ai-card"] [data-ai-chat-input]'), 'workbench after settings')
  await click('[data-ai-chat-capability="ask"]')
  await openPlus()
  assert.equal(await has('[data-ai-chat-plus-menu]:not([hidden])'), true)
  assert.equal(await evaluate(`(() => {
    const menu = document.querySelector('[data-ai-chat-plus-menu]')?.getBoundingClientRect()
    const composer = document.querySelector('[data-ai-chat-composer]')?.getBoundingClientRect()
    return Boolean(menu && composer && menu.bottom <= composer.top + 1)
  })()`), true, 'plus menu stays above the composer')
  await send('哪个方案更好？')
  await waitFor(async () => (await query('[data-ai-chat-stream]'))?.includes('方案甲'), 'visible streaming text')
  assert.equal(await has('[data-ai-chat-stream] a'), false)
  const partialImage = await screenshot('partial')
  await complete()
  assert.equal(await has('[data-ai-chat-assistant] a[href*="floor=1"]'), true)
  assert.equal(await query('[data-ai-chat-process]', 'open'), false, 'completed answer keeps the phase panel collapsed')
  await send('它有什么限制？')
  await complete()
  assert.equal(requests.length, 2)
  assert.match(requests[1].messages[1].content, /哪个方案更好？/)
  await openPlus()
  await click('[data-ai-new-conversation]')
  await send('它有什么限制？')
  await complete()
  assert.equal(requests.length, 3)
  assert.doesNotMatch(requests[2].messages[1].content, /哪个方案更好？/)
  await send('请慢慢解释')
  await waitFor(async () => (await query('[data-ai-chat-stream]'))?.includes('部分回答'), 'partial answer before stop')
  await click('[data-ai-chat-send]')
  assert.equal(await query('[data-ai-chat-input]', 'disabled'), false)
  assert.match(await query('[data-ai-chat-messages]'), /已停止/)
  await click('[data-ai-chat-retry]')
  await complete()
  const history = await evaluate("JSON.parse(localStorage.getItem('lsb_base:ai-workbench:conversations'))")
  const active = history.conversations.find((row) => row.id === history.activeId)
  assert.equal(active.turns.length, 2)
  assert.equal(active.turns[1].state, 'complete')
  assert.equal(active.turns[1].question, '请慢慢解释')
  assert.equal(requests.length, 5)
  assert.equal(await evaluate("Array.from(document.querySelectorAll('[data-ai-chat-process]')).every(row => !row.open)"), true)
  await waitFor(() => cancelledRequests === 1, 'underlying request cancellation')
  const summaryCountBeforeLongChat = requests.filter((body) => body.messages?.[1]?.content?.includes('<conversation-to-summarize>')).length
  for (const question of ['请等待摘要', '长对话第二轮', '长对话第三轮', '长对话第四轮']) {
    await send(question)
    await complete()
  }
  await send('长对话第五轮')
  await waitFor(() => requests.filter((body) => body.messages?.[1]?.content?.includes('<conversation-to-summarize>')).length > summaryCountBeforeLongChat, 'conversation summary request')
  await click('[data-ai-chat-send]')
  assert.equal(await query('[data-ai-chat-input]', 'disabled'), false)
  await evaluate(`Array.from(document.querySelectorAll('[data-ai-chat-retry]')).at(-1)?.click()`)
  await complete()
  await send('长对话第六轮')
  await complete()
  assert.match(await query('[data-ai-compaction-status]'), /已压缩/)
  const summaryCountAfterLongChat = requests.filter((body) => body.messages?.[1]?.content?.includes('<conversation-to-summarize>')).length
  assert.ok(summaryCountAfterLongChat > summaryCountBeforeLongChat)
  await send('结合早期结论继续解释')
  await complete()
  assert.ok(requests.filter((body) => body.messages?.[1]?.content?.includes('<conversation-summary>')).length > 0)

  await openPlus()
  await click('[data-ai-new-conversation]')
  await send('摘要失败背景')
  await complete()
  for (const question of ['失败历史二', '失败历史三', '失败历史四', '失败历史五']) {
    await send(question)
    await complete()
  }
  const failedSummaryHistory = await evaluate("JSON.parse(localStorage.getItem('lsb_base:ai-workbench:conversations'))")
  const failedSummaryConversation = failedSummaryHistory.conversations.find((row) => row.id === failedSummaryHistory.activeId)
  assert.equal(failedSummaryConversation.compactions?.length || 0, 0)
  await waitFor(async () => (await query('[data-ai-chat-messages]'))?.includes('历史已收窄'), 'summary failure fallback stage')

  await evaluate(`window.__siteActionCalls = []; const action = LSB.__core.plugins.get('ai-copilot').exports; action.planActions = async (options) => { window.__siteActionCalls.push(options); return { plan: { version: 1, summary: '只读测试计划', steps: [] }, previews: [] } }`)
  await selectCapability('site-action')
  await send('生成站内计划')
  await complete()
  assert.equal(await evaluate('window.__siteActionCalls.length'), 1)
  assert.equal(await evaluate("Object.prototype.hasOwnProperty.call(window.__siteActionCalls[0], 'conversation')"), false)
  assert.equal(await evaluate("Object.prototype.hasOwnProperty.call(window.__siteActionCalls[0], 'conversationSummary')"), false)

  await openPlus()
  await click('[data-ai-new-conversation]')
  await selectCapability('ask')
  await send('浏览器引用复核')
  await complete()
  const modelRequestsBeforeReview = requests.length
  const mutateM14Turn = async (clearReview = false) => evaluate(`(() => {
    const key = 'lsb_base:ai-workbench:conversations'
    const data = JSON.parse(localStorage.getItem(key))
    const conversation = data.conversations.find((row) => row.id === data.activeId)
    const turn = conversation.turns.at(-1)
    const source = (turn.evidenceSnapshot?.citations || []).filter((row) => Number(row.floor) === 1 || Number(row.floor) === 2)
    const rows = source.length >= 2 ? source : (turn.evidenceSnapshot?.citations || []).slice(0, 2)
    turn.citations = rows.map((row) => ({ ...row, page: 2 }))
    turn.evidenceSnapshot = { ...turn.evidenceSnapshot, citations: rows.map((row) => ({ ...row, page: 2 })) }
    turn.freshness = { ...(turn.freshness || {}), status: 'material-stale' }
    if (${clearReview ? 'true' : 'false'}) turn.citationReview = null
    localStorage.setItem(key, JSON.stringify(data))
    return { reviewedAt: turn.citationReview?.reviewedAt || 0, id: turn.id }
  })()`)
  await mutateM14Turn(true)
  await reloadWorkbench()
  assert.equal(await has('[data-ai-citation-review]'), true)
  const reviewReadsBefore = reviewReads
  await click('[data-ai-citation-review]')
  await waitFor(() => reviewReads > reviewReadsBefore, 'citation review page read')
  await waitFor(() => has('[data-ai-citation-diff]'), 'citation diff')
  assert.equal(requests.length, modelRequestsBeforeReview)
  assert.match(await query('[data-ai-citation-diff]'), /内容变化|楼层消失/)
  const reviewedAt = await evaluate("JSON.parse(localStorage.getItem('lsb_base:ai-workbench:conversations')).conversations.find((row) => row.id === JSON.parse(localStorage.getItem('lsb_base:ai-workbench:conversations')).activeId).turns.at(-1).citationReview.reviewedAt")

  await mutateM14Turn(false)
  delayReviewRead = true
  await reloadWorkbench()
  const delayedReviewReads = reviewReads
  await click('[data-ai-citation-review]')
  await waitFor(() => reviewReads > delayedReviewReads, 'delayed citation review')
  await waitFor(() => evaluate("document.querySelector('[data-ai-chat-stop]')?.hidden === false"), 'citation review stop button')
  await click('[data-ai-chat-send]')
  assert.equal(await query('[data-ai-chat-input]', 'disabled'), false)
  await waitFor(() => cancelledReviewReads >= 1, 'citation review transport cancellation')
  const afterCancelReview = await evaluate("JSON.parse(localStorage.getItem('lsb_base:ai-workbench:conversations')).conversations.find((row) => row.id === JSON.parse(localStorage.getItem('lsb_base:ai-workbench:conversations')).activeId).turns.at(-1).citationReview.reviewedAt")
  assert.equal(afterCancelReview, reviewedAt)
  delayReviewRead = false

  await mutateM14Turn(false)
  await reloadWorkbench()
  const modelRequestsBeforeRegenerate = requests.length
  await click('[data-ai-regenerate-fresh]')
  await complete()
  assert.equal(requests.length, modelRequestsBeforeRegenerate + 1)
  assert.equal(await has('[data-ai-revision]'), true)
  assert.equal(await evaluate("JSON.parse(localStorage.getItem('lsb_base:ai-workbench:conversations')).conversations.find((row) => row.id === JSON.parse(localStorage.getItem('lsb_base:ai-workbench:conversations')).activeId).turns.at(-1).revisions.length >= 1"), true)

  assert.deepEqual(exceptions, [])
  assert.deepEqual(await evaluate('LSB.info().plugins.filter(p => p.state === "error").map(p => p.id)'), [])
  const finalImage = await screenshot('final')
  const version = await evaluate('LSB.version')
  const report = { passed: true, browser: (await call('Browser.getVersion')).product, version, simulatedModelRequests: requests.length, simulatedProbeRequests, cancelledRequests, probeAttempts, cancelledProbeRequests, reviewReads, cancelledReviewReads, checks: ['single composer hides @ and / selectors', 'Gemini more menu and capability fallback', 'material remove and reattach', 'M16 connection probe sends fixed minimal request', 'M16 stream capability status and probe cancellation', 'M16 endpoint change invalidates capability cache and stream fallback retries JSON once', 'conversation menu stays above composer', 'visible partial text', 'verified final citations', 'follow-up continuity', 'new conversation isolation', 'stop releases composer and transport', 'retry preserves same turn', 'bounded history compaction', 'summary cancellation', 'summary failure fallback', 'summary scope isolation', 'site-action history isolation', 'citation review without model call', 'citation diff for changed and removed floors', 'citation review cancellation preserves previous review', 'fresh regeneration keeps revision'], images: [partialImage, finalImage] }
  writeFileSync(join(root, '.tmp-m14-browser-report.json'), JSON.stringify(report, null, 2) + '\n')
  console.log(JSON.stringify(report, null, 2))
} finally {
  socket?.close()
  child.kill()
  const closed = new Promise((resolve) => server.close(resolve))
  server.closeAllConnections()
  await closed
}
