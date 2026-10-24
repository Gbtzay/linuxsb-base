/**
 * AI 总结 v1.1 回归：预算封顶 / 缓存分槽 / 主楼判定 / 不占限速队列 / 超时可配。
 *
 * 这五条对应五个会实际烧钱或让功能失效的缺陷，务必保留。
 */
import { test } from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { JSDOM } from 'jsdom'

const baseCode = readFileSync(new URL('../dist-dev/linuxsb-base.user.js', import.meta.url), 'utf8')
const PLUG = readFileSync(new URL('../plugins/ai-summary.user.js', import.meta.url), 'utf8')
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
    const cur = JSON.parse(w.localStorage.getItem('lsb_base:ai-summary:__config'))
    w.localStorage.setItem('lsb_base:ai-summary:__config', JSON.stringify({ ...cur, ...patch }))
    w.LSB.bus.emit('config:changed:ai-summary', {}, { source: 'core' })
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
    } catch { /* keep polling */ }
    if (Date.now() > end) return false
    await sleep(15)
  }
}

async function load(ctx) {
  ctx.w.eval(baseCode)
  ctx.w.eval(PLUG)
  await sleep(80)
  return ctx.w.LSB.bus.request('ai-summary:debug')
}

test('M12 provider 流式回答逐步回调，JSON 规划仍不流式', async () => {
  const ctx = makeSite(topicHtml, 'https://linux.sb/topic/1')
  await load(ctx)
  const bodies = []
  ctx.w.TextDecoder = TextDecoder
  ctx.w.fetch = async (url, init) => {
    const body = JSON.parse(init.body)
    bodies.push(body)
    const text = body.stream ? 'data: {"choices":[{"delta":{"content":"中文"}}]}\n\ndata: {"choices":[{"delta":{"content":"回答"},"finish_reason":"stop"}]}\n\ndata: [DONE]\n\n' : JSON.stringify({ choices: [{ message: { content: '{"plan":1}' } }] })
    const bytes = new TextEncoder().encode(text)
    return { status: 200, ok: true, url: String(url), body: new ReadableStream({ start(controller) {
      for (let i = 0; i < bytes.length; i += 7) controller.enqueue(bytes.slice(i, i + 7))
      controller.close()
    } }), text: async () => text }
  }
  const provider = ctx.w.LSB.__core.plugins.get('ai-summary').exports
  const deltas = []
  const out = await provider.generate({ system: '回答', user: '问题', onDelta: (delta) => deltas.push(delta) })
  assert.equal(out.text, '中文回答')
  assert.deepEqual(deltas, ['中文', '回答'])
  assert.equal(bodies[0].stream, true)
  await provider.generate({ system: 'JSON 规划', user: '请求' })
  assert.equal(bodies[1].stream, false)
})

test('M12 provider 明确不支持 stream 时仅降级一次，并兼容直接 JSON', async () => {
  const ctx = makeSite(topicHtml, 'https://linux.sb/topic/1')
  await load(ctx)
  const bodies = []
  ctx.w.fetch = async (url, init) => {
    bodies.push(JSON.parse(init.body))
    const rejected = bodies.length === 1
    return { status: rejected ? 400 : 200, ok: !rejected, url: String(url), text: async () => rejected ? '{"error":{"message":"stream is not supported"}}' : '{"choices":[{"message":{"content":"完整答案"}}]}' }
  }
  const provider = ctx.w.LSB.__core.plugins.get('ai-summary').exports
  const deltas = []
  const out = await provider.generate({ system: '回答', user: '问题', onDelta: (delta) => deltas.push(delta) })
  assert.equal(out.text, '完整答案')
  assert.deepEqual(bodies.map((body) => body.stream), [true, false])
  assert.deepEqual(deltas, ['完整答案'])
  bodies.length = 0
  ctx.setCfg({ streamAnswers: false })
  ctx.w.fetch = async (url, init) => {
    bodies.push(JSON.parse(init.body))
    return { status: 200, ok: true, url: String(url), text: async () => '{"choices":[{"message":{"content":"非流式"}}]}' }
  }
  await provider.generate({ user: '问题', onDelta: () => {} })
  assert.equal(bodies[0].stream, false)
})

test('HTTP 403 HTML 响应显示短诊断，不展示 Cloudflare 原文', async () => {
  const ctx = makeSite(topicHtml, 'https://linux.sb/topic/1')
  const cloudflare = '<!DOCTYPE html><html><head><title>Just a moment...</title></head><body>cf-ray=secret-token</body></html>'
  await load(ctx)
  ctx.w.fetch = async (url) => {
    const target = String(url)
    if (/linux\.sb/.test(target)) return { status: 200, ok: true, url: target, text: async () => topicHtml }
    return { status: 403, ok: false, url: target, text: async () => cloudflare }
  }
  const dbg = await ctx.w.LSB.bus.request('ai-summary:debug')
  await dbg.run({ force: true, flowId: 'summary-403-html' })
  assert.equal(await until(() => Boolean(ctx.w.document.querySelector('.lsb-summary-panel'))), true)
  const message = ctx.w.document.querySelector('.lsb-summary-panel .lsb-empty')?.textContent || ''
  assert.match(message, /HTTP 403/)
  assert.match(message, /端点|API Key|拒绝/)
  assert.doesNotMatch(message, /<!DOCTYPE|<html|cf-ray=secret-token/i)
  assert.ok(message.length < 220, `403 诊断文本过长：${message.length}`)
})


test('M12 provider Anthropic 流和部分失败不降级重发', async () => {
  const ctx = makeSite(topicHtml, 'https://linux.sb/topic/1', { apiStyle: 'Anthropic', apiUrl: 'https://api.example.test/v1/messages' })
  await load(ctx)
  let requests = 0
  const deltas = []
  ctx.w.fetch = async (url, init) => {
    requests++
    assert.equal(JSON.parse(init.body).stream, true)
    assert.equal(init.headers['x-api-key'], 'k')
    return { status: 200, ok: true, url: String(url), text: async () => 'event: content_block_delta\ndata: {"type":"content_block_delta","delta":{"type":"text_delta","text":"中文答案"}}\n\nevent: message_stop\ndata: {"type":"message_stop"}\n\n' }
  }
  const provider = ctx.w.LSB.__core.plugins.get('ai-summary').exports
  assert.equal((await provider.generate({ user: '问题', onDelta: (delta) => deltas.push(delta) })).text, '中文答案')
  assert.deepEqual(deltas, ['中文答案'])
  ctx.w.fetch = async (url) => {
    requests++
    return { status: 200, ok: true, url: String(url), text: async () => 'data: {"type":"content_block_delta","delta":{"type":"text_delta","text":"部分答案"}}\n\n' }
  }
  await assert.rejects(provider.generate({ user: '问题', onDelta: () => {} }), /中断/)
  assert.equal(requests, 2, '不完整的流只发出一次请求')
})

test('provider export：公开 configured 和 generate，但不附加总结风格', async () => {
  const ctx = makeSite(topicHtml, 'https://linux.sb/topic/1', {
    style: '立场地图',
    customPrompt: '只总结旧功能',
  })
  await load(ctx)
  const provider = ctx.w.LSB.__core.plugins.get('ai-summary').exports
  assert.equal(provider.configured(), true)
  assert.equal(provider.model(), 'deepseek-chat')
  assert.match(provider.renderMarkdown('<img src=x>'), /&lt;img/)
  const out = await provider.generate({
    system: '你是帖子副驾。',
    user: '<forum-content>正文</forum-content>',
    timeout: 45000,
  })
  assert.equal(out.text, '【模型输出】')
  const body = JSON.parse(ctx.lastLlm().body)
  assert.equal(body.messages[0].content, '你是帖子副驾。')
  assert.equal(body.messages[1].content, '<forum-content>正文</forum-content>')
  assert.doesNotMatch(body.messages[0].content, /立场地图|旧功能/)
})

test('provider export：未配置端点或 Key 时 configured 返回 false', async () => {
  const ctx = makeSite(topicHtml, 'https://linux.sb/topic/1', { apiUrl: '', apiKey: '' })
  await load(ctx)
  const provider = ctx.w.LSB.__core.plugins.get('ai-summary').exports
  assert.equal(provider.configured(), false)
})

test('M16 provider probe 读取流式能力并按端点和模型缓存', async () => {
  const ctx = makeSite(topicHtml, 'https://linux.sb/topic/1')
  await load(ctx)
  let calls = 0
  ctx.w.TextDecoder = TextDecoder
  ctx.w.fetch = async (url, init) => {
    calls++
    const body = JSON.parse(init.body)
    assert.equal(body.stream, true)
    assert.equal(body.messages[1].content, '连接自检：只返回 OK')
    const payload = 'data: {"choices":[{"delta":{"content":"OK"},"finish_reason":"stop"}]}\n\ndata: [DONE]\n\n'
    const bytes = new TextEncoder().encode(payload)
    return {
      status: 200,
      ok: true,
      url: String(url),
      body: new ReadableStream({ start(controller) { controller.enqueue(bytes); controller.close() } }),
      text: async () => payload,
    }
  }
  const provider = ctx.w.LSB.__core.plugins.get('ai-summary').exports
  const first = await provider.probe({ force: true })
  assert.equal(calls, 1)
  assert.equal(first.result.text, 'OK')
  assert.equal(first.result.capabilities.stream, true)
  assert.equal(first.diagnostic.reasonCode, 'ok')
  const second = await provider.probe()
  assert.equal(calls, 1, '有效能力应在缓存命中时不重复请求')
  assert.equal(second.cached, true)
  assert.equal(provider.providerState().capabilities.stream, true)
})

test('M16 provider probe 流式拒绝后只降级一次 JSON，并保存脱敏状态', async () => {
  const ctx = makeSite(topicHtml, 'https://linux.sb/topic/1')
  await load(ctx)
  const bodies = []
  ctx.w.fetch = async (url, init) => {
    const body = JSON.parse(init.body)
    bodies.push(body)
    if (bodies.length === 1) {
      return { status: 400, ok: false, url: String(url), text: async () => '{"error":{"message":"stream is not supported; token=secret"}}' }
    }
    return { status: 200, ok: true, url: String(url), text: async () => '{"choices":[{"message":{"content":"OK"}}]}' }
  }
  const provider = ctx.w.LSB.__core.plugins.get('ai-summary').exports
  const out = await provider.probe({ force: true })
  assert.deepEqual(bodies.map((body) => body.stream), [true, false])
  assert.equal(out.result.text, 'OK')
  assert.equal(out.result.capabilities.json, true)
  assert.equal(out.result.capabilities.stream, false)
  assert.equal(out.diagnostic.reasonCode, 'stream-unsupported')
  assert.doesNotMatch(JSON.stringify(provider.providerState()), /secret|token=/)
})

test('M16 设置页连接自检可取消且不携带页面或历史内容', async () => {
  const ctx = makeSite(topicHtml, 'https://linux.sb/topic/1')
  await load(ctx)
  let seenInit
  let rejectFetch
  ctx.w.fetch = async (url, init) => {
    seenInit = init
    return new Promise((_, reject) => { rejectFetch = reject })
  }
  ctx.w.LSB.open('ai-summary')
  const button = ctx.w.document.querySelector('[data-ai-summary-probe]')
  const cancel = ctx.w.document.querySelector('[data-ai-summary-probe-cancel]')
  assert.ok(button)
  button.click()
  assert.equal(await until(() => Boolean(seenInit)), true)
  assert.equal(cancel.hidden, false)
  const requestBody = JSON.parse(seenInit.body)
  assert.doesNotMatch(JSON.stringify(requestBody), /标题：|楼层|历史|引用|写操作/)
  cancel.click()
  assert.equal(await until(() => button.disabled === false), true)
  assert.equal(seenInit.signal.aborted, true)
  rejectFetch?.(new DOMException('Aborted', 'AbortError'))
})

/** 造一个主楼超长的帖子页 */
function hugeOpHtml(len = 30000) {
  return topicHtml.replace(/<div class="post-content">/, `<div class="post-content"><p>${'啊'.repeat(len)}</p>`)
}
/** 去掉 floor=0 的主楼，模拟 ?p=2 视图 */
function noOpHtml() {
  return topicHtml.replace(
    /<li class="post-item post-entry" id="post-1">[\s\S]*?(?=<li class="post-item post-entry")/,
    '',
  )
}

/* ═══════════ 预算封顶 ═══════════ */

test('预算：超长主楼也受 maxChars 约束（旧实现只截回复，主楼原样发出）', async () => {
  const ctx = makeSite(hugeOpHtml(), 'https://linux.sb/topic/1', { maxChars: 8000 })
  const dbg = await load(ctx)
  const { content, meta } = await dbg.collect()
  assert.ok(
    content.length <= 8000 * 1.15,
    `送入长度应受控于 maxChars=8000，实际 ${content.length}`,
  )
  assert.equal(meta.truncated, true, '截断事实要如实上报，让用户知道结论基于部分内容')
  assert.match(content, /主楼已截断/)
})

test('预算：主楼不得吃光份额，回复仍有可见占比', async () => {
  const ctx = makeSite(hugeOpHtml(), 'https://linux.sb/topic/1', { maxChars: 6000 })
  const dbg = await load(ctx)
  const { content } = await dbg.collect()
  const floorLines = content.split('\n').filter((l) => /^\[#\d+\]/.test(l))
  assert.ok(floorLines.length > 0, '主楼再长也要留出回复的位置')
})

test('预算：极端小 maxChars 不会产出空提示词', async () => {
  const ctx = makeSite(topicHtml, 'https://linux.sb/topic/1', { maxChars: 1 })
  const dbg = await load(ctx)
  const { content } = await dbg.collect()
  assert.ok(content.length >= 200, `应有下限兜底，实际 ${content.length}`)
  assert.match(content, /标题：/, '元信息头必须保留')
})

/* ═══════════ 缓存分槽 ═══════════ */

test('缓存：改风格后重新请求，而不是回放旧答案', async () => {
  const ctx = makeSite(topicHtml, 'https://linux.sb/topic/1', { style: '要点速览' })
  const dbg = await load(ctx)

  await dbg.run()
  await until(() => ctx.llmCalls() === 1)
  const sys1 = JSON.parse(ctx.calls.at(-1).body).messages[0].content
  assert.match(sys1, /总结助手/)

  ctx.setCfg({ style: '深度分析' })
  await sleep(30)
  await dbg.run()
  assert.ok(await until(() => ctx.llmCalls() === 2), '换风格必须重算')
  const sys2 = JSON.parse(ctx.calls.at(-1).body).messages[0].content
  assert.match(sys2, /分析助手/, '系统提示词确实换了')

  // 切回原风格：命中旧槽，不再请求（分槽而非失效）
  ctx.setCfg({ style: '要点速览' })
  await sleep(30)
  await dbg.run()
  await sleep(120)
  assert.equal(ctx.llmCalls(), 2, '切回已算过的风格应命中该槽的缓存')
})

test('缓存：改附加要求 / 换模型都会换槽', async () => {
  const ctx = makeSite(topicHtml, 'https://linux.sb/topic/1')
  const dbg = await load(ctx)
  await dbg.run()
  await until(() => ctx.llmCalls() === 1)

  ctx.setCfg({ customPrompt: '重点讲成本' })
  await sleep(30)
  await dbg.run()
  assert.ok(await until(() => ctx.llmCalls() === 2), '附加要求变化必须重算')

  ctx.setCfg({ model: 'other-model' })
  await sleep(30)
  await dbg.run()
  assert.ok(await until(() => ctx.llmCalls() === 3), '换模型必须重算')
})

test('缓存：仅采本页时，不同页码使用不同槽', async () => {
  const c1 = makeSite(topicHtml, 'https://linux.sb/topic/1', { fetchAll: false })
  const d1 = await load(c1)
  const c2 = makeSite(topicHtml, 'https://linux.sb/topic/1?p=5', { fetchAll: false })
  const d2 = await load(c2)
  assert.notEqual(d1.cacheKey(), d2.cacheKey(), '第 1 页与第 5 页内容不同，不能共用缓存槽')
})

test('缓存：整帖模式的槽与页码无关', async () => {
  const c1 = makeSite(topicHtml, 'https://linux.sb/topic/1', { fetchAll: true })
  const d1 = await load(c1)
  const c2 = makeSite(topicHtml, 'https://linux.sb/topic/1?p=5', { fetchAll: true })
  const d2 = await load(c2)
  assert.equal(d1.cacheKey(), d2.cacheKey(), '整帖总结在哪一页触发都是同一结果')
})

test('缓存：重新生成按钮强制绕过缓存', async () => {
  const ctx = makeSite(topicHtml, 'https://linux.sb/topic/1')
  const dbg = await load(ctx)
  await dbg.run()
  await until(() => ctx.llmCalls() === 1)
  await dbg.run() // 无 force：命中缓存
  await sleep(100)
  assert.equal(ctx.llmCalls(), 1)
  await dbg.run({ force: true })
  assert.ok(await until(() => ctx.llmCalls() === 2), 'force 必须重算')
})

test('trace.v1：总结按采集、读取、回答边界发布安全阶段', async () => {
  const ctx = makeSite(topicHtml, 'https://linux.sb/topic/1')
  const dbg = await load(ctx)
  const events = []
  ctx.w.LSB.bus.on('ai:trace', (event) => events.push(event))

  await dbg.run({ flowId: 'summary-flow-1' })
  assert.ok(await until(() => events.some((event) => event.stage === 'answer' && event.state === 'complete')))
  assert.ok(events.length >= 4)
  assert.equal(new Set(events.map((event) => event.flowId)).size, 1)
  assert.equal(events[0].flowId, 'summary-flow-1')
  const stages = events.map((event) => event.stage)
  assert.ok(stages.indexOf('scope') < stages.indexOf('read'))
  assert.ok(stages.indexOf('read') < stages.indexOf('answer'))
  assert.ok(events.some((event) => event.stage === 'read' && event.state === 'complete' && event.counts.read > 0))
  const serialized = JSON.stringify(events)
  assert.doesNotMatch(serialized, /81459cee62|<body>|Bearer|思维链/)
  assert.match(ctx.w.document.querySelector('[data-ai-summary-trace]')?.textContent || '', /读取帖子|生成总结/)
})

test('trace.v1：缓存命中只发布回答完成并标记缓存来源', async () => {
  const ctx = makeSite(topicHtml, 'https://linux.sb/topic/1')
  const dbg = await load(ctx)
  const events = []
  ctx.w.LSB.bus.on('ai:trace', (event) => events.push(event))
  await dbg.run()
  assert.ok(await until(() => ctx.llmCalls() === 1))
  events.length = 0

  await dbg.run()
  assert.equal(ctx.llmCalls(), 1)
  assert.ok(await until(() => events.some((event) => event.stage === 'answer' && event.state === 'complete')))
  assert.equal(events.some((event) => event.stage === 'answer' && event.state === 'active'), false)
  assert.match(events.find((event) => event.stage === 'answer')?.summary || '', /缓存/)
})

test('trace.v1：模型失败发布固定原因码且不泄露原始错误', async () => {
  const ctx = makeSite(topicHtml, 'https://linux.sb/topic/1')
  const dbg = await load(ctx)
  const events = []
  ctx.w.LSB.bus.on('ai:trace', (event) => events.push(event))
  const originalRaw = ctx.w.LSB.__core.net.raw.bind(ctx.w.LSB.__core.net)
  ctx.w.LSB.__core.net.raw = async (path, options) => {
    if (options?.external) throw new Error('CSRF=secret-token <body> hidden chain')
    return originalRaw(path, options)
  }

  await dbg.run({ flowId: 'summary-failure-1' })
  assert.ok(await until(() => events.some((event) => event.stage === 'answer' && event.state === 'failed')))
  const failure = events.find((event) => event.stage === 'answer' && event.state === 'failed')
  assert.ok(failure.reasonCode)
  assert.doesNotMatch(JSON.stringify(failure), /secret-token|hidden chain|CSRF/)
})

/* ═══════════ 主楼判定 ═══════════ */

test('主楼：分页页没有主楼时不冒充，也不重复计费', async () => {
  const ctx = makeSite(noOpHtml(), 'https://linux.sb/topic/1?p=2')
  const dbg = await load(ctx)
  const { content, meta } = await dbg.collect()

  assert.equal(meta.hasOp, false, '本页确实没有主楼')
  assert.ok(!content.includes('[楼主]'), '不得把 #1 楼冒充成楼主')
  assert.match(content, /未包含主楼/, '要如实告知模型，避免它把首条当成主题')

  // 同一段内容不应出现两次
  const first = content.split('\n').find((l) => /^\[#1\]/.test(l))
  assert.ok(first, '有 #1 楼')
  const body = first.replace(/^\[#1\] /, '').slice(0, 30)
  assert.equal(content.split(body).length - 1, 1, '同一楼层内容只出现一次')
})

test('主楼：第一页正常识别 floor===0 为主楼', async () => {
  const ctx = makeSite(topicHtml, 'https://linux.sb/topic/1')
  const dbg = await load(ctx)
  const { content, meta } = await dbg.collect()
  assert.equal(meta.hasOp, true)
  assert.match(content, /\[楼主\]/)
  assert.ok(!content.includes('未包含主楼'))
})

test('元信息：提示词标明采集范围（页数 + 楼层区间）', async () => {
  const ctx = makeSite(topicHtml, 'https://linux.sb/topic/1')
  const dbg = await load(ctx)
  const { content, meta } = await dbg.collect()
  assert.match(content, /含楼层 #\d+–#\d+/, '让模型知道自己看到的是哪一段')
  assert.match(meta.range, /^#\d+–#\d+$/)
})

/* ═══════════ 不占限速队列 ═══════════ */

test('LLM 长请求不阻塞站内请求（旧实现会饿死其它插件）', async () => {
  const ctx = makeSite(topicHtml, 'https://linux.sb/topic/1')
  const dbg = await load(ctx)
  const release = ctx.holdLLM()

  void dbg.run() // LLM 挂起中
  await sleep(80)

  let siteDone = false
  ctx.w.LSB.__core.net.doc('/topic/2').then(
    () => (siteDone = true),
    () => (siteDone = true),
  )
  assert.ok(await until(() => siteDone, 1200), '站内请求不应排在 LLM 之后等待')
  release()
})

test('站外请求默认不进限速闸门，站内请求仍然串行限速', async () => {
  const ctx = makeSite(topicHtml, 'https://linux.sb/topic/1')
  await load(ctx)
  const net = ctx.w.LSB.__core.net
  net.rate = 200

  // 两个站内 GET：必须被 rate 拉开
  const t0 = Date.now()
  await Promise.all([net.raw('/a'), net.raw('/b')])
  const siteSpan = Date.now() - t0
  assert.ok(siteSpan >= 180, `站内请求应受限速约束，实测跨度 ${siteSpan}ms`)

  // 两个站外请求：不应被 rate 串起来
  const t1 = Date.now()
  await Promise.all([
    net.raw('https://api.example.com/x', { external: true }),
    net.raw('https://api.example.com/y', { external: true }),
  ])
  const extSpan = Date.now() - t1
  assert.ok(extSpan < 180, `站外请求应并发放行，实测跨度 ${extSpan}ms`)
})

test('显式 queue:true 时站外请求也可要求排队', async () => {
  const ctx = makeSite(topicHtml, 'https://linux.sb/topic/1')
  await load(ctx)
  const net = ctx.w.LSB.__core.net
  net.rate = 200
  const t = Date.now()
  await Promise.all([
    net.raw('https://api.example.com/x', { external: true, queue: true }),
    net.raw('https://api.example.com/y', { external: true, queue: true }),
  ])
  assert.ok(Date.now() - t >= 180, '显式要求排队时应遵守限速')
})

/* ═══════════ 超时可配 ═══════════ */

test('超时：默认 120s 而非基座的 20s（长帖来不及答完）', async () => {
  const ctx = makeSite(topicHtml, 'https://linux.sb/topic/1')
  const dbg = await load(ctx)
  // 探针：拦下 net.raw 观察实际传入的 timeout
  let seen = null
  const core = ctx.w.LSB.__core
  const orig = core.net.raw.bind(core.net)
  core.net.raw = (path, opts) => {
    if (String(path).startsWith('https://api.example.com')) seen = opts
    return orig(path, opts)
  }
  await dbg.run()
  await until(() => !!seen)
  assert.equal(seen.timeout, 120000)
  assert.equal(seen.queue, false, '并且明确声明不占用限速队列')
})

test('超时：可通过配置调整', async () => {
  const ctx = makeSite(topicHtml, 'https://linux.sb/topic/1', { timeoutSec: 45 })
  const dbg = await load(ctx)
  let seen = null
  const core = ctx.w.LSB.__core
  const orig = core.net.raw.bind(core.net)
  core.net.raw = (path, opts) => {
    if (String(path).startsWith('https://api.example.com')) seen = opts
    return orig(path, opts)
  }
  await dbg.run()
  await until(() => !!seen)
  assert.equal(seen.timeout, 45000)
})

/* ═══════════ 并发与按钮态 ═══════════ */

test('并发：总结中再次点击不会发起第二次请求', async () => {
  const ctx = makeSite(topicHtml, 'https://linux.sb/topic/1')
  const dbg = await load(ctx)
  const release = ctx.holdLLM()
  void dbg.run()
  await sleep(60)
  void dbg.run()
  void dbg.run()
  await sleep(80)
  assert.equal(ctx.llmCalls(), 1, '同一时刻只允许一次在飞请求')
  release()
})

test('请求进行中弹出进度面板，不只改按钮文案', async () => {
  const ctx = makeSite(topicHtml, 'https://linux.sb/topic/1')
  const dbg = await load(ctx)
  const release = ctx.holdLLM()
  void dbg.run()
  assert.ok(
    await until(() => {
      const t = ctx.w.document.querySelector('.lsb-summary-panel')?.textContent || ''
      return /采集|请求/.test(t)
    }),
    '等待期间应有进度面板',
  )
  assert.ok(ctx.w.document.querySelector('.lsb-summary-wait'), '进度态有独立标记')
  assert.match(ctx.w.document.querySelector('.lsb-summary-panel').textContent, /已等待/)
  release()
  assert.ok(
    await until(() => ctx.w.document.querySelector('.lsb-sum-text')?.textContent.includes('【模型输出】')),
    '完成后进度面板换成结果',
  )
  assert.equal(ctx.w.document.querySelector('.lsb-summary-wait'), null)
})

test('等待中点 × 只收起窗口，完成后仍弹出结果', async () => {
  const ctx = makeSite(topicHtml, 'https://linux.sb/topic/1')
  const dbg = await load(ctx)
  const release = ctx.holdLLM()
  void dbg.run()
  assert.ok(await until(() => ctx.w.document.querySelector('.lsb-summary-wait')))
  ctx.w.document.querySelector('.lsb-summary-panel .lsb-panel-close').click()
  assert.equal(ctx.w.document.querySelector('.lsb-summary-panel'), null)
  release()
  assert.ok(
    await until(() => ctx.w.document.querySelector('.lsb-sum-text')?.textContent.includes('【模型输出】')),
    '收起后请求完成仍应弹出结果',
  )
})

test('按钮：算完变「已有总结」；换风格后回落为「AI 总结」', async () => {
  const ctx = makeSite(topicHtml, 'https://linux.sb/topic/1')
  const dbg = await load(ctx)
  const label = () => dbg.buttons().find((t) => /总结/.test(t)) || ''
  assert.match(label(), /AI 总结/)

  await dbg.run()
  assert.ok(await until(() => /已有总结/.test(label())), `算完应提示已有缓存，实际「${label()}」`)

  ctx.setCfg({ style: '立场地图' })
  assert.ok(
    await until(() => /AI 总结/.test(label())),
    `换到未算过的风格应回落，实际「${label()}」`,
  )
})

function tabNames(w) {
  return [...w.document.querySelectorAll('.lsb-tab')].map((b) => b.textContent)
}

test('历史页：总结完成后能列出本帖，点查看回看全文', async () => {
  const ctx = makeSite(topicHtml, 'https://linux.sb/topic/1')
  const dbg = await load(ctx)
  await dbg.run()
  ctx.w.document.querySelector('.lsb-summary-panel .lsb-panel-close')?.click()
  ctx.w.LSB.open('ai-summary-history')
  const view = ctx.w.document.querySelector('.lsb-panel-settings .lsb-view')
  assert.match(view.textContent, /LINUX SB上线/, '历史列表应出现帖子标题')
  const look = [...view.querySelectorAll('button, a')].find((b) => /查看/.test(b.textContent))
  assert.ok(look, '应有查看按钮')
  look.click()
  assert.ok(
    await until(() => ctx.w.document.querySelector('.lsb-sum-text')?.textContent.includes('【模型输出】')),
    '点查看应弹出原总结浮层',
  )
})

test('历史页：同一帖两种风格各占一行', async () => {
  const ctx = makeSite(topicHtml, 'https://linux.sb/topic/1')
  const dbg = await load(ctx)
  await dbg.run()
  ctx.setCfg({ style: '立场地图' })
  await dbg.run()
  ctx.w.document.querySelector('.lsb-summary-panel .lsb-panel-close')?.click()
  ctx.w.LSB.open('ai-summary-history')
  const text = ctx.w.document.querySelector('.lsb-panel-settings .lsb-view').textContent
  assert.match(text, /要点速览/)
  assert.match(text, /立场地图/)
})

test('历史页：清空后回到空状态', async () => {
  const ctx = makeSite(topicHtml, 'https://linux.sb/topic/1')
  const dbg = await load(ctx)
  await dbg.run()
  ctx.w.document.querySelector('.lsb-summary-panel .lsb-panel-close')?.click()
  ctx.w.LSB.open('ai-summary-history')
  const panel = ctx.w.document.querySelector('.lsb-panel-settings')
  const clear = [...panel.querySelectorAll('button')].find((b) => /清空/.test(b.textContent))
  assert.ok(clear, '应有清空按钮')
  clear.click()
  await until(() => ctx.w.document.querySelector('[data-yes]'))
  ctx.w.document.querySelector('[data-yes]').click()
  assert.ok(
    await until(() => /还没有总结记录/.test(ctx.w.document.querySelector('.lsb-panel-settings .lsb-view')?.textContent || '')),
    '清空后应显示空状态',
  )
})

test('结果浮层「历史」打开历史页', async () => {
  const ctx = makeSite(topicHtml, 'https://linux.sb/topic/1')
  const dbg = await load(ctx)
  await dbg.run()
  const histBtn = [...ctx.w.document.querySelectorAll('.lsb-summary-panel button')].find((b) => b.textContent === '历史')
  assert.ok(histBtn, '结果浮层应有历史按钮')
  histBtn.click()
  assert.equal(ctx.w.document.querySelector('.lsb-summary-panel'), null, '应先收起总结浮层')
  assert.ok(
    await until(() => tabNames(ctx.w).includes('AI 历史')),
    `应打开氢面板历史页，侧栏：${tabNames(ctx.w).join('/')}`,
  )
  const active = [...ctx.w.document.querySelectorAll('.lsb-tab')].find((t) => t.classList.contains('is-active'))
  assert.equal(active?.textContent, 'AI 历史')
  assert.match(ctx.w.document.querySelector('.lsb-panel-settings .lsb-view').textContent, /LINUX SB上线/)
})

test('历史页：首页也能打开；空列表有说明；不注入总结入口', async () => {
  const ctx = makeSite(homeHtml, 'https://linux.sb/')
  ctx.w.eval(baseCode)
  ctx.w.eval(PLUG)
  await sleep(80)
  const rec = ctx.w.LSB.info().plugins.find((p) => p.id === 'ai-summary')
  assert.equal(rec?.state, 'active', '首页不再 skip，否则历史页会被卸掉')
  ctx.w.LSB.open('ai-summary-history')
  assert.ok(tabNames(ctx.w).includes('AI 历史'), `侧栏应有 AI 历史，实际：${tabNames(ctx.w).join('/')}`)
  assert.ok(tabNames(ctx.w).includes('AI 总结'))
  assert.match(ctx.w.document.querySelector('.lsb-view')?.textContent || '', /还没有总结记录/)
  assert.equal(
    [...ctx.w.document.querySelectorAll('.lsb-op, .lsb-top-link')].some((el) => /AI 总结/.test(el.textContent)),
    false,
    '首页不应出现总结按钮或顶栏入口',
  )
})

test('Anthropic：官方 /v1/messages 走 x-api-key，系统提示在顶层', async () => {
  const ctx = makeSite(topicHtml, 'https://linux.sb/topic/1', {
    apiUrl: 'https://api.anthropic.com/v1/messages',
    model: 'claude-sonnet-4-5',
    _llmReply: { content: [{ type: 'text', text: '【克劳德输出】' }] },
  })
  const dbg = await load(ctx)
  await dbg.run()
  assert.ok(await until(() => ctx.llmCalls() === 1))
  const call = ctx.lastLlm()
  assert.equal(call.headers['x-api-key'], 'k')
  assert.equal(call.headers['anthropic-version'], '2023-06-01')
  assert.equal(call.headers.authorization, undefined)
  const body = JSON.parse(call.body)
  assert.match(body.system, /总结助手/)
  assert.equal(body.messages.length, 1)
  assert.equal(body.messages[0].role, 'user')
  assert.match(body.messages[0].content, /标题：/)
  assert.ok(body.max_tokens >= 1, 'Anthropic 要求 max_tokens')
  assert.ok(
    await until(() => ctx.w.document.querySelector('.lsb-sum-text')?.textContent.includes('【克劳德输出】')),
    '要能解开 content[].text',
  )
})

test('Anthropic：路径以 /messages 结尾的代理也自动识别', async () => {
  const ctx = makeSite(topicHtml, 'https://linux.sb/topic/1', {
    apiUrl: 'https://openrouter.ai/api/v1/messages',
    _llmReply: { content: [{ type: 'text', text: '代理' }] },
  })
  const dbg = await load(ctx)
  await dbg.run()
  assert.ok(await until(() => ctx.llmCalls() === 1))
  const body = JSON.parse(ctx.lastLlm().body)
  assert.equal(typeof body.system, 'string')
  assert.equal(ctx.lastLlm().headers['x-api-key'], 'k')
})

test('Anthropic：设置里强制协议，即使 URL 不像官方', async () => {
  const ctx = makeSite(topicHtml, 'https://linux.sb/topic/1', {
    apiUrl: 'https://proxy.example.com/custom',
    apiStyle: 'Anthropic',
    _llmReply: { content: [{ type: 'text', text: '强制' }] },
  })
  const dbg = await load(ctx)
  await dbg.run()
  assert.ok(await until(() => ctx.llmCalls() === 1))
  const body = JSON.parse(ctx.lastLlm().body)
  assert.match(body.system, /总结助手/)
  assert.equal(ctx.lastLlm().headers.authorization, undefined)
})

test('OpenAI：强制协议时即使 URL 带 /messages 仍走 chat/completions 体', async () => {
  const ctx = makeSite(topicHtml, 'https://linux.sb/topic/1', {
    apiUrl: 'https://proxy.example.com/v1/messages',
    apiStyle: 'OpenAI',
  })
  const dbg = await load(ctx)
  await dbg.run()
  assert.ok(await until(() => ctx.llmCalls() === 1))
  const call = ctx.lastLlm()
  assert.match(call.headers.authorization, /^Bearer k$/)
  const body = JSON.parse(call.body)
  assert.equal(body.system, undefined)
  assert.equal(body.messages[0].role, 'system')
})

/* ═══════════ Markdown 渲染 ═══════════ */

test('Markdown：标题、列表、加粗渲染成 HTML，不是原文符号', async () => {
  const ctx = makeSite(topicHtml, 'https://linux.sb/topic/1', {
    _llmReply: {
      choices: [{ message: { content: '## 主题\n\n- 第一点 **重要**\n- 第二点' } }],
    },
  })
  const dbg = await load(ctx)
  await dbg.run()
  assert.ok(await until(() => ctx.w.document.querySelector('.lsb-sum-text h2')))
  const box = ctx.w.document.querySelector('.lsb-sum-text')
  assert.equal(box.querySelector('h2')?.textContent.trim(), '主题')
  assert.equal(box.querySelectorAll('li').length, 2)
  assert.equal(box.querySelector('strong')?.textContent, '重要')
  assert.ok(!box.textContent.includes('## '), '标题符不应原样露出')
})

test('Markdown：模型输出的 HTML 与 javascript 链接不能执行', async () => {
  const ctx = makeSite(topicHtml, 'https://linux.sb/topic/1', {
    _llmReply: {
      choices: [{
        message: {
          content: '<script>alert(1)</script>\n[点我](javascript:alert(1))\n**安全**',
        },
      }],
    },
  })
  const dbg = await load(ctx)
  await dbg.run()
  assert.ok(await until(() => ctx.w.document.querySelector('.lsb-sum-text strong')))
  const box = ctx.w.document.querySelector('.lsb-sum-text')
  assert.equal(box.querySelectorAll('script').length, 0)
  assert.match(box.innerHTML, /&lt;script/)
  assert.equal(box.querySelector('a'), null)
  assert.equal(box.querySelector('strong')?.textContent, '安全')
})

test('Markdown：复制按钮给出原文而不是 HTML', async () => {
  const raw = '## 主题\n\n**加粗**'
  const ctx = makeSite(topicHtml, 'https://linux.sb/topic/1', {
    _llmReply: { choices: [{ message: { content: raw } }] },
  })
  let copied = null
  Object.defineProperty(ctx.w.navigator, 'clipboard', {
    configurable: true,
    value: { writeText: async (t) => { copied = t } },
  })
  const dbg = await load(ctx)
  await dbg.run()
  assert.ok(await until(() => ctx.w.document.querySelector('[data-copy]')))
  ctx.w.document.querySelector('[data-copy]').click()
  assert.ok(await until(() => copied === raw), `复制应为 Markdown 原文，实际：${copied}`)
  assert.equal(copied, raw)
})

test('Markdown：围栏代码、表格、http 链接；#12 不是标题', async () => {
  const ctx = makeSite(topicHtml, 'https://linux.sb/topic/1')
  const dbg = await load(ctx)
  const md = dbg.renderMarkdown
  assert.equal(typeof md, 'function')
  const code = md('前言\n\n```\nalert(1)\n```\n')
  assert.match(code, /<pre/)
  assert.match(code, /alert\(1\)/)
  const table = md('| 派 | 立场 |\n| --- | --- |\n| 甲 | 支持 |')
  assert.match(table, /<table/)
  assert.match(table, /<th>派<\/th>/)
  assert.match(table, /<td>支持<\/td>/)
  const link = md('[官网](https://linux.sb/about)')
  assert.match(link, /href="https:\/\/linux\.sb\/about"/)
  assert.match(link, /rel="noopener noreferrer"/)
  const bad = md('[x](data:text/html,hi)')
  assert.ok(!/href=/.test(bad), 'data: 不得成为链接')
  const floor = md('见 #12 楼')
  assert.ok(!/<h[1-6]>/.test(floor), '楼层号 #12 不能当成标题')
})
