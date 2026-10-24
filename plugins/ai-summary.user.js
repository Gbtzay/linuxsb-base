// ==UserScript==
// @name         LSB·AI 总结
// @namespace    https://linux.sb/
// @version      1.4.0
// @description  帖子页一键调用 OpenAI 或 Anthropic 接口总结全帖（可选汇总所有分页，结果按风格/范围分槽缓存）。需要 LINUX.SB 基座。
// @author       you
// @match        https://linux.sb/*
// @grant        none
// @run-at       document-end
// @noframes
// ==/UserScript==

/**
 * 使用说明：
 *  1. 在基座面板「AI 总结」页填入 API 端点与 Key。
 *     OpenAI 兼容（DeepSeek / Kimi / Qwen / OpenRouter / Ollama）填到 /chat/completions；
 *     Anthropic（官方或 /v1/messages 代理）填到 /messages，协议可留「自动」。
 *  2. 氢脚本已声明 @connect *；更新后 Tampermonkey 会询问是否允许访问 API 域名，允许即可；
 *  3. Key 明文存于本脚本存储中，请勿在公用电脑开启此插件。
 */
(function () {
  'use strict'

  const manifest = {
    id: 'ai-summary',
    name: 'AI 总结',
    version: '1.4.0',
    description: '调用 OpenAI 或 Anthropic 接口总结当前帖子；氢面板「AI 历史」可回看全部记录',
    author: 'you',
    requires: { base: '^0.1.53' },
    permissions: ['read', 'storage', 'ui', 'events', 'net'],
    config: {
      apiUrl: { type: 'text', label: 'API 端点', default: '', desc: 'OpenAI：…/v1/chat/completions；Anthropic：…/v1/messages' },
      apiKey: { type: 'password', label: 'API Key', default: '', desc: '明文存于本机脚本存储，公用电脑慎用' },
      apiStyle: {
        type: 'select',
        label: '接口协议',
        default: '自动',
        options: ['自动', 'OpenAI', 'Anthropic'],
        desc: '自动按端点判断。Anthropic 用 x-api-key + /messages；OpenAI 用 Bearer + /chat/completions',
      },
      model: { type: 'text', label: '模型名', default: 'deepseek-chat' },
      style: {
        type: 'select',
        label: '总结风格',
        default: '要点速览',
        options: ['要点速览', '深度分析', '立场地图'],
      },
      maxChars: { type: 'number', label: '送入模型的正文上限 (字符)', default: 12000 },
      fetchAll: { type: 'switch', label: '汇总全部分页（慢，走基座限速队列）', default: false },
      maxPages: { type: 'number', label: '最多抓取页数', default: 15 },
      timeoutSec: {
        type: 'number',
        label: '请求超时 (秒)',
        default: 120,
        desc: '长帖总结常需 30~90s；过小会在模型答完前被掐断',
      },
      streamAnswers: { type: 'switch', label: '工作台流式回答', default: true, desc: '回答逐步显示；规划使用完整 JSON。端点不支持时可关闭。' },
      customPrompt: { type: 'textarea', label: '附加要求（追加在提示词后）', default: '', rows: 3 },
    },
  }

  const SYSTEM = {
    要点速览:
      '你是论坛帖子总结助手。用中文输出：①一句话主题 ②3~6 条要点（每条尽量标注楼层号如 #12）③值得注意的原话摘录 ≤2 条。不要客套话。',
    深度分析:
      '你是论坛帖子分析助手。用中文输出：①核心论点梳理 ②论证质量评价（证据是否充分、有无逻辑跳跃，标注楼层号）③被忽略的角度。保持批判性，不要奉承。',
    立场地图:
      '你是论坛讨论观察员。用中文归纳帖内各方的立场与分歧：按"立场 → 代表楼层 → 核心理由"列出；指出哪些分歧有事实可查证、哪些纯属价值冲突；最后一句点评整体讨论氛围。',
  }

  /** 主楼在总预算里的占比上限：留给回复的份额不能被一篇长主楼吃光 */
  const OP_BUDGET_RATIO = 0.5
  const MIN_TOTAL_CHARS = 500

  function escHtml(s) {
    return String(s ?? '').replace(/[&<>"'`]/g, (c) =>
      ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;', '`': '&#96;' }[c]),
    )
  }

  function safeHref(href) {
    const t = String(href || '').trim()
    if (/^https?:\/\//i.test(t)) return t
    if (/^\/(?!\/)/.test(t)) return t
    return ''
  }

  function isUl(line) {
    return /^[-*+] /.test(line)
  }
  function isOl(line) {
    return /^\d+[.)] /.test(line)
  }
  function isQuote(line) {
    return /^>/.test(line)
  }
  function isHr(line) {
    return /^\s*(-{3,}|\*{3,}|_{3,})\s*$/.test(line)
  }
  function headingLevel(line) {
    const m = /^(#{1,6}) (.+)/.exec(line)
    return m ? m[1].length : 0
  }
  function isTableSep(line) {
    return /^\|? *:?-{3,}:? *(?:\| *:?-{3,}:? *)+\|? *$/.test(line)
  }
  function splitRow(line) {
    return line.replace(/^\||\|$/g, '').split('|').map((c) => c.trim())
  }

  /**
   * 轻量 Markdown → 安全 HTML。先抽出代码再转义，模型输出不会变成可执行标签。
   * 标题必须是「# + 空格」，避免把楼层号 #12 当成标题。
   */
  function renderMarkdown(src) {
    const slots = []
    const stash = (html) => {
      const i = slots.length
      slots.push(html)
      return `\u0000MD${i}\u0000`
    }
    const unstash = (s) => s.replace(/\u0000MD(\d+)\u0000/g, (_, n) => slots[Number(n)] || '')

    const inline = (raw) => {
      let s = String(raw)
      s = s.replace(/`([^`\n]+)`/g, (_, c) => stash(`<code>${escHtml(c)}</code>`))
      s = s.replace(/\[([^\]]+)\]\(([^)]+)\)/g, (_, label, href) => {
        const u = safeHref(href)
        const lab = escHtml(label)
        if (!u) return lab
        return stash(
          `<a href="${escHtml(u)}" target="_blank" rel="noopener noreferrer">${lab}</a>`,
        )
      })
      s = escHtml(s)
      s = s.replace(/\*\*\*([^*\n]+)\*\*\*/g, '<strong><em>$1</em></strong>')
      s = s.replace(/\*\*([^*\n]+)\*\*/g, '<strong>$1</strong>')
      s = s.replace(/__([^_\n]+)__/g, '<strong>$1</strong>')
      s = s.replace(/(^|[^*])\*([^*\n]+)\*(?!\*)/g, '$1<em>$2</em>')
      return s
    }

    let text = String(src ?? '').replace(/\r\n/g, '\n')
    text = text.replace(/```[^\n]*\n([\s\S]*?)```/g, (_, code) =>
      stash(`<pre><code>${escHtml(code.replace(/\n$/, ''))}</code></pre>`),
    )

    const lines = text.split('\n')
    const out = []
    let i = 0
    const isFence = (line) => /^\u0000MD\d+\u0000$/.test(line)

    while (i < lines.length) {
      const line = lines[i]
      if (!line.trim()) {
        i += 1
        continue
      }
      if (isFence(line)) {
        out.push(line)
        i += 1
        continue
      }
      const h = headingLevel(line)
      if (h) {
        out.push(`<h${h}>${inline(line.replace(/^#{1,6} /, ''))}</h${h}>`)
        i += 1
        continue
      }
      if (isHr(line)) {
        out.push('<hr>')
        i += 1
        continue
      }
      if (/^\|/.test(line) && isTableSep(lines[i + 1] || '')) {
        const head = splitRow(line)
        i += 2
        const rows = []
        while (i < lines.length && /^\|/.test(lines[i]) && !isTableSep(lines[i])) {
          rows.push(splitRow(lines[i]))
          i += 1
        }
        out.push(
          '<table><thead><tr>' +
            head.map((c) => `<th>${inline(c)}</th>`).join('') +
            '</tr></thead><tbody>' +
            rows.map((r) => '<tr>' + r.map((c) => `<td>${inline(c)}</td>`).join('') + '</tr>').join('') +
            '</tbody></table>',
        )
        continue
      }
      if (isQuote(line)) {
        const buf = []
        while (i < lines.length && isQuote(lines[i])) {
          buf.push(lines[i].replace(/^> ?/, ''))
          i += 1
        }
        out.push(`<blockquote>${inline(buf.join('\n')).replace(/\n/g, '<br>')}</blockquote>`)
        continue
      }
      if (isUl(line)) {
        out.push('<ul>')
        while (i < lines.length && isUl(lines[i])) {
          out.push(`<li>${inline(lines[i].replace(/^[-*+] /, ''))}</li>`)
          i += 1
        }
        out.push('</ul>')
        continue
      }
      if (isOl(line)) {
        out.push('<ol>')
        while (i < lines.length && isOl(lines[i])) {
          out.push(`<li>${inline(lines[i].replace(/^\d+[.)] /, ''))}</li>`)
          i += 1
        }
        out.push('</ol>')
        continue
      }
      const buf = []
      while (i < lines.length) {
        const L = lines[i]
        if (!L.trim()) break
        if (isFence(L) || headingLevel(L) || isHr(L) || isQuote(L) || isUl(L) || isOl(L)) break
        if (/^\|/.test(L) && isTableSep(lines[i + 1] || '')) break
        buf.push(L)
        i += 1
      }
      if (buf.length) out.push(`<p>${inline(buf.join('\n')).replace(/\n/g, '<br>')}</p>`)
    }
    return unstash(out.join(''))
  }

  function setup(api) {
    let cfg = api.config()
    const diagnostics = api.ai.diagnostics
    const CAPABILITY_CACHE_KEY = 'capabilities'
    const CAPABILITY_CACHE_TTL = 24 * 60 * 60 * 1000
    let probeInFlight = null
    let providerCapabilities = null
    let lastDiagnostic = null
    let flowSequence = 0
    let traceFlow = ''
    let traceEvents = []

    function newFlowId() {
      flowSequence = (flowSequence + 1) % 1000000
      const now = Date.now().toString(36)
      const random = Math.random().toString(36).slice(2, 8)
      return `summary-${now}-${flowSequence.toString(36)}-${random}`.slice(0, 100)
    }

    function flowIdFor(value) {
      const candidate = String(value || '').trim()
      return /^[A-Za-z0-9][A-Za-z0-9._:-]{0,99}$/.test(candidate) ? candidate : newFlowId()
    }

    function renderTracePanel() {
      const host = document.querySelector('[data-ai-summary-trace]')
      if (!host) return
      host.replaceChildren()
      for (const event of traceEvents) {
        const row = document.createElement('div')
        row.className = 'lsb-summary-trace-event'
        row.dataset.stage = event.stage
        row.dataset.state = event.state
        row.textContent = `${event.title}：${event.summary}`
        host.appendChild(row)
      }
    }

    function beginTrace(flowId) {
      traceFlow = flowId
      traceEvents = []
      renderTracePanel()
    }

    function emitTrace(flowId, stage, state, {
      title,
      summary,
      evidence = 'unverified',
      counts = {},
      citations = [],
      reasonCode,
    } = {}) {
      const emit = api.ai?.trace?.emit
      if (typeof emit !== 'function') return
      const event = {
        id: `${flowId}:${stage}`,
        flowId,
        stage,
        state,
        title: String(title || stage),
        summary: String(summary || ''),
        evidence,
        counts: {
          selected: Number(counts.selected) || 0,
          read: Number(counts.read) || 0,
          matched: Number(counts.matched) || 0,
          citations: Number(counts.citations) || 0,
        },
        citations: Array.isArray(citations) ? citations : [],
      }
      if (reasonCode) event.reasonCode = reasonCode
      try {
        const safe = api.ai?.trace?.sanitize ? api.ai.trace.sanitize(event) : event
        if (traceFlow === flowId) {
          traceEvents.push(safe)
          if (traceEvents.length > 8) traceEvents.splice(0, traceEvents.length - 8)
          renderTracePanel()
        }
        emit(event)
      } catch {
        // Trace must never change the summary result or error path.
      }
    }

    function collectTraceCounts(meta) {
      const floors = Math.max(0, Number(meta?.floors) || 0)
      const pages = Math.max(0, Number(meta?.pagesFetched) || 0)
      return { selected: floors, read: floors, matched: pages, citations: 0 }
    }

    api.on('config:changed:ai-summary', () => {
      cfg = api.config()
      providerCapabilities = null
      lastDiagnostic = null
      refreshButtons() // 换风格后按钮态要跟着变（新槽位可能还没有缓存）
    })

    /* ── 缓存键 ──
     * 同一帖的总结会因四件事而不同，任一变化都必须换槽，否则用户改了设置
     * 却拿到旧答案（旧实现只看 hash+model，改风格完全无效）：
     *   风格 / 附加要求 / 模型 / 采集范围（整帖 vs 仅本页）
     * 仅本页时还要带页码——第 1 页和第 5 页内容不同，不能共用一个槽。
     */
    function promptFingerprint() {
      const s = `${cfg.style || ''}|${cfg.customPrompt || ''}`
      let h = 0
      for (let i = 0; i < s.length; i++) h = (h * 31 + s.charCodeAt(i)) | 0
      return (h >>> 0).toString(36)
    }
    function scope() {
      return cfg.fetchAll ? 'all' : `p${api.page.page || 1}`
    }
    function cacheKey() {
      return `s:${api.page.id}:${scope()}:${cfg.model || ''}:${promptFingerprint()}`
    }
    const cached = () => api.store.get(cacheKey(), null)

    /* ── 内容收集 ── */
    async function collect() {
      // 站点是无限滚动：启动时的 snapshot 会过期，必须以当前实时 DOM 为准
      let topic = null
      try {
        const live = api.parse.topic(document)
        if (live && live.posts.length) topic = live
      } catch {
        /* 解析失败退回启动快照 */
      }
      if (!topic) topic = api.snapshot?.topic
      if (!topic || !topic.posts.length) throw new Error('本页没有帖子数据')

      let posts = [...topic.posts]
      let fetchedPages = 1

      if (cfg.fetchAll && topic.pages > 1) {
        // 走基座限速队列逐页补齐（net.pages 是异步生成器）；
        // 无限滚动下 DOM 里可能已加载了后几页，这里仍按页码全量补，保证未滚到的部分不缺
        const cap = Math.min(topic.pages, cfg.maxPages || 15)
        const seen = new Set(posts.map((p) => p.postId))
        for await (const { page, doc } of api.net.pages((p) => api.routes.topic(api.page.id, p), cap)) {
          if (page === 1) continue
          for (const post of api.parse.topic(doc).posts) {
            if (!seen.has(post.postId)) {
              seen.add(post.postId)
              posts.push(post)
            }
          }
          fetchedPages = Math.max(fetchedPages, page)
        }
      }
      posts.sort((a, b) => a.floor - b.floor)

      // 主楼只认 floor===0。分页页（?p=2）DOM 里没有主楼，旧实现直接取 posts[0]
      // 当楼主——把 #1 楼冒充成楼主，同一段内容还在提示词里出现两次（误导模型 + 多烧 token）。
      const op = posts.find((p) => p.floor === 0) || null
      const floors = posts.filter((p) => p.floor > 0 && p.content)

      /* ── 预算分配：主楼与回复都要受 maxChars 约束 ──
       * 旧实现只截 body，主楼原样拼进去 → maxChars=12000 时实际发出 3 万字，
       * 长帖直接超上下文或按 3 万 token 计费。
       */
      const total = Math.max(MIN_TOTAL_CHARS, Number(cfg.maxChars) || 12000)
      let opText = op?.content || ''
      let opTruncated = false
      const opCap = Math.floor(total * OP_BUDGET_RATIO)
      if (opText.length > opCap) {
        opText = opText.slice(0, opCap) + '…[主楼已截断]'
        opTruncated = true
      }
      const bodyBudget = Math.max(200, total - opText.length)
      let body = floors.map((p) => `[#${p.floor}] ${p.authorName || '?'}：${p.content}`).join('\n')
      let bodyTruncated = false
      if (body.length > bodyBudget) {
        body = body.slice(0, bodyBudget) + '\n…[后文已截断]'
        bodyTruncated = true
      }

      const floorNums = floors.map((p) => p.floor)
      const range = floorNums.length ? `#${Math.min(...floorNums)}–#${Math.max(...floorNums)}` : '无'
      const head =
        `标题：${topic.title}\n版块：${topic.forumName || '?'}\n` +
        `浏览 ${topic.views} · 回复 ${topic.replies} · ` +
        `本次采集 ${fetchedPages}/${topic.pages} 页 · 含楼层 ${range}\n` +
        // 没有主楼时如实说明，别让模型以为第一条就是主题
        (op ? '' : '注意：本次未包含主楼（当前为分页视图），请基于以下回复作答。\n') +
        '\n'
      const content =
        head + (op ? `[楼主] ${op.authorName || '?'}：${opText}\n\n` : '') + body

      return {
        content,
        meta: {
          floors: floors.length + (op ? 1 : 0),
          chars: content.length,
          pagesFetched: fetchedPages,
          pagesTotal: topic.pages,
          title: topic.title,
          hasOp: !!op,
          range,
          truncated: opTruncated || bodyTruncated,
          budget: total,
          // hash 只用于「同一槽内内容是否变化」，槽本身已含风格/模型/范围
          hash: `${floors.length}:${content.length}:${op ? 1 : 0}`,
        },
      }
    }

    function isAnthropic() {
      return diagnostics.normalizeEndpoint({
        apiUrl: cfg.apiUrl,
        apiStyle: cfg.apiStyle,
        model: cfg.model,
      }, location.href).protocol === 'anthropic'
    }

    function extractText(j) {
      const openai = j?.choices?.[0]?.message?.content
      if (typeof openai === 'string' && openai) return openai
      if (Array.isArray(j?.content)) {
        const parts = j.content
          .filter((p) => p && (p.type === 'text' || (!p.type && p.text)))
          .map((p) => p.text)
          .filter(Boolean)
        if (parts.length) return parts.join('\n')
      }
      if (typeof j?.content === 'string' && j.content) return j.content
      return null
    }

    function httpFailureMessage(status, body) {
      const code = Number(status)
      const raw = String(body ?? '').trim()
      const htmlLike = /<!doctype\s+html|<html[\s>]|cloudflare|just a moment|cf-ray/i.test(raw)
      const common = code === 401 || code === 403
        ? '端点或 API Key 被拒绝'
        : code === 429
          ? '请求过于频繁，请稍后重试'
          : '服务端拒绝了请求'
      if (htmlLike) return `HTTP ${code}：${common}；响应疑似是 Cloudflare 或网关页面，请检查 API 端点、代理和 Key`
      let detail = ''
      try {
        const parsed = JSON.parse(raw)
        detail = parsed?.error?.message || parsed?.message || ''
      } catch {
        /* 非 JSON 响应只保留有限的可读文本 */
      }
      detail = String(detail || raw)
        .replace(/<[^>]*>/g, ' ')
        .replace(/(?:bearer\s+|api[_ -]?key\s*[:=]?|authorization\s*[:=]?|cookie\s*[:=]?|token\s*[:=]?|secret\s*[:=]?)[^\s,;]*/gi, '[已隐藏]')
        .replace(/\s+/g, ' ')
        .trim()
        .slice(0, 160)
      return `HTTP ${code}：${detail || common}`
    }

    /* ── 调用 LLM ── */
    async function generateModel({ system, user, timeout, signal, onDelta } = {}) {
      api.ai.throwIfAborted(signal)
      const sys = String(system || '')
      const usr = String(user || '')
      const timeoutMs =
        timeout == null
          ? Math.max(5, Number(cfg.timeoutSec) || 120) * 1000
          : Math.max(5000, Number(timeout) || 0)
      const anthropic = isAnthropic()
      const streaming = typeof onDelta === 'function' && cfg.streamAnswers !== false
      const headers = { 'content-type': 'application/json' }
      let body
      if (anthropic) {
        headers['x-api-key'] = cfg.apiKey
        headers['anthropic-version'] = '2023-06-01'
        body = {
          model: cfg.model,
          max_tokens: 4096,
          temperature: 0.4,
          stream: streaming,
          system: sys,
          messages: [{ role: 'user', content: usr }],
        }
      } else {
        headers.authorization = `Bearer ${cfg.apiKey}`
        body = {
          model: cfg.model,
          temperature: 0.4,
          stream: streaming,
          messages: [
            { role: 'system', content: sys },
            { role: 'user', content: usr },
          ],
        }
      }
      const startedAt = Date.now()
      let streamMode = ''
      let prefix = ''
      let decoder = null
      const receive = (chunk) => {
        api.ai.throwIfAborted(signal)
        if (streamMode === 'json') return
        if (!streamMode) {
          prefix += chunk
          const start = prefix.replace(/^\uFEFF/, '').trimStart()
          if (/^[\[{]/.test(start)) { streamMode = 'json'; prefix = ''; return }
          if (!/^(?:data:|event:|id:|retry:|:)/.test(start)) return
          streamMode = 'sse'
          decoder = api.ai.createAnswerStream({ protocol: anthropic ? 'anthropic' : 'openai', onDelta })
          decoder.push(prefix)
          prefix = ''
          return
        }
        decoder.push(chunk)
      }
      const request = (stream) => api.net.raw(cfg.apiUrl, {
        method: 'POST',
        external: true,
        // queue:false —— 不占用基座的站内限速队列。一次 LLM 调用可能挂 60s+，
        // 排队会让实时流/悬浮卡/哨兵的站内请求全部饿死。
        queue: false,
        timeout: timeoutMs,
        signal,
        onChunk: stream ? receive : undefined,
        headers,
        body: JSON.stringify({ ...body, stream }),
      })
      let res = await request(streaming)
      api.ai.throwIfAborted(signal)
      if (streaming && !streamMode && [400, 422].includes(res.status) && /(?:stream[\s\S]{0,100}(?:not supported|unsupported|not allowed|unknown|unrecognized)|(?:unsupported|unknown|unrecognized|not supported)[\s\S]{0,100}stream)/i.test(String(res.text))) {
        res = await request(false)
        api.ai.throwIfAborted(signal)
      }
      if (!res.ok) throw new Error(httpFailureMessage(res.status, res.text))
      if (streamMode === 'sse') {
        const text = decoder.finish()
        api.ai.throwIfAborted(signal)
        return { text, meta: { model: cfg.model, ms: Date.now() - startedAt, streamed: true } }
      }
      let j
      try {
        j = JSON.parse(res.text)
      } catch {
        throw new Error('返回不是 JSON：' + String(res.text).slice(0, 180))
      }
      const text = extractText(j)
      if (!text) throw new Error('响应里没有找到文本：' + JSON.stringify(j).slice(0, 200))
      if (typeof onDelta === 'function') onDelta(text, text)
      return { text, meta: { model: cfg.model, ms: Date.now() - startedAt } }
    }

    function capabilityFlags(value = {}) {
      return {
        json: Boolean(value.json),
        stream: Boolean(value.stream),
        cancel: Boolean(value.cancel),
      }
    }

    function capabilityCache() {
      const raw = api.store.get(CAPABILITY_CACHE_KEY, { version: 1, entries: {} })
      if (!raw || typeof raw !== 'object' || raw.version !== 1 || !raw.entries || typeof raw.entries !== 'object') {
        return { version: 1, entries: {} }
      }
      return raw
    }

    function saveCapability(key, result, diagnostic) {
      const cache = capabilityCache()
      cache.entries[key] = {
        savedAt: Date.now(),
        result: { capabilities: capabilityFlags(result?.capabilities), protocol: String(result?.protocol || '') },
        diagnostic,
      }
      const keys = Object.keys(cache.entries)
      for (const oldKey of keys.slice(0, Math.max(0, keys.length - 12))) delete cache.entries[oldKey]
      api.store.set(CAPABILITY_CACHE_KEY, cache)
    }

    function cachedCapability(key, force) {
      if (force) return null
      const entry = capabilityCache().entries[key]
      if (!entry || !Number.isFinite(Number(entry.savedAt)) || Date.now() - Number(entry.savedAt) > CAPABILITY_CACHE_TTL) return null
      const diagnostic = diagnostics.redactDiagnostic(entry.diagnostic)
      const result = {
        protocol: String(entry.result?.protocol || diagnostic.protocol || ''),
        capabilities: capabilityFlags(entry.result?.capabilities),
      }
      providerCapabilities = result.capabilities
      lastDiagnostic = diagnostic
      return { result, diagnostic, cached: true }
    }

    function probeHeaders() {
      const anthropic = isAnthropic()
      const headers = { 'content-type': 'application/json' }
      if (anthropic) {
        headers['x-api-key'] = cfg.apiKey
        headers['anthropic-version'] = '2023-06-01'
      } else {
        headers.authorization = `Bearer ${cfg.apiKey}`
      }
      return headers
    }

    function probeBody(stream) {
      const question = '连接自检：只返回 OK'
      if (isAnthropic()) {
        return {
          model: cfg.model,
          max_tokens: 16,
          temperature: 0,
          stream,
          system: '只输出 OK，不要解释。',
          messages: [{ role: 'user', content: question }],
        }
      }
      return {
        model: cfg.model,
        temperature: 0,
        stream,
        messages: [
          { role: 'system', content: '只输出 OK，不要解释。' },
          { role: 'user', content: question },
        ],
      }
    }

    async function probeAttempt({ stream, signal }) {
      let mode = ''
      let prefix = ''
      let jsonText = ''
      let decoder = null
      let sawDelta = false
      const protocol = isAnthropic() ? 'anthropic' : 'openai'
      const receive = (chunk) => {
        api.ai.throwIfAborted(signal)
        const text = String(chunk || '')
        if (!text) return
        if (mode === 'json') {
          jsonText += text
          return
        }
        prefix += text
        const start = prefix.replace(/^\uFEFF/, '').trimStart()
        if (/^[\[{]/.test(start)) {
          mode = 'json'
          jsonText = prefix
          prefix = ''
          return
        }
        if (!/^(?:data:|event:|id:|retry:|:)/.test(start)) return
        mode = 'sse'
        decoder = api.ai.createAnswerStream({
          protocol,
          onDelta: () => { sawDelta = true },
          maxChars: 200,
        })
        decoder.push(prefix)
        prefix = ''
      }
      const response = await api.net.raw(cfg.apiUrl, {
        method: 'POST',
        external: true,
        queue: false,
        timeout: Math.max(5000, Number(cfg.timeoutSec) || 120) * 1000,
        signal,
        onChunk: stream ? receive : undefined,
        headers: probeHeaders(),
        body: JSON.stringify(probeBody(stream)),
      })
      const unsupported = stream && !mode && [400, 422].includes(Number(response.status)) && /(?:stream[\s\S]{0,100}(?:not supported|unsupported|not allowed|unknown|unrecognized)|(?:unsupported|unknown|unrecognized|not supported)[\s\S]{0,100}stream)/i.test(String(response.text || ''))
      if (unsupported) return { response, unsupported: true, mode: '', text: '' }
      let text = ''
      if (mode === 'sse') {
        if (prefix) decoder.push(prefix)
        text = decoder.finish()
      } else {
        text = jsonText || String(response.text || '')
        let parsed
        try { parsed = JSON.parse(text) } catch { throw new Error('probe-protocol-invalid') }
        text = extractText(parsed) || ''
        if (!text) throw new Error('probe-protocol-invalid')
        mode = 'json'
      }
      return {
        response,
        unsupported: false,
        mode,
        sawDelta,
        completed: true,
        text,
      }
    }

    async function probe({ signal, force = false } = {}) {
      if (probeInFlight) return probeInFlight
      const endpoint = diagnostics.normalizeEndpoint({
        apiUrl: cfg.apiUrl,
        apiStyle: cfg.apiStyle,
        model: cfg.model,
      }, location.href)
      if (!String(cfg.apiKey || '').trim()) {
        const diagnostic = diagnostics.redactDiagnostic({
          protocol: endpoint.protocol,
          outcome: 'invalid',
          reasonCode: 'configured-missing',
          statusClass: 'unknown',
        })
        lastDiagnostic = diagnostic
        providerCapabilities = null
        return { result: null, diagnostic, cached: false }
      }
      if (!endpoint.valid) {
        const diagnostic = diagnostics.redactDiagnostic({
          protocol: endpoint.protocol,
          outcome: 'invalid',
          reasonCode: 'endpoint-invalid',
          statusClass: 'unknown',
        })
        lastDiagnostic = diagnostic
        providerCapabilities = null
        return { result: null, diagnostic, cached: false }
      }
      const cached = cachedCapability(endpoint.key, force)
      if (cached) return cached
      const run = (async () => {
        const startedAt = Date.now()
        const streamRequested = cfg.streamAnswers !== false
        try {
          api.ai.throwIfAborted(signal)
          let attempt = await probeAttempt({ stream: streamRequested, signal })
          let fallback = false
          if (streamRequested && attempt.unsupported) {
            fallback = true
            attempt = await probeAttempt({ stream: false, signal })
          }
          api.ai.throwIfAborted(signal)
          const classified = diagnostics.classifyProbeResponse({
            protocol: endpoint.protocol,
            status: attempt.response?.status,
            contentType: attempt.mode === 'sse' ? 'text/event-stream' : 'application/json',
            sawDelta: attempt.sawDelta,
            completed: attempt.completed,
            elapsedMs: Date.now() - startedAt,
          })
          const diagnostic = diagnostics.redactDiagnostic({
            ...classified,
            reasonCode: fallback ? 'stream-unsupported' : classified.reasonCode,
          })
          const result = {
            text: attempt.text,
            protocol: endpoint.protocol,
            capabilities: capabilityFlags({
              json: attempt.mode === 'json',
              stream: attempt.mode === 'sse',
              cancel: false,
            }),
          }
          providerCapabilities = result.capabilities
          lastDiagnostic = diagnostic
          saveCapability(endpoint.key, result, diagnostic)
          return { result, diagnostic, cached: false }
        } catch (error) {
          const aborted = Boolean(signal?.aborted) || error?.name === 'AbortError' || /abort|取消/i.test(String(error?.message || error))
          const timeout = /timeout|超时/i.test(String(error?.message || error))
          const diagnostic = diagnostics.redactDiagnostic({
            protocol: endpoint.protocol,
            outcome: aborted ? 'cancelled' : 'error',
            reasonCode: aborted ? 'cancelled' : timeout ? 'timeout' : String(error?.message || '').includes('probe-protocol-invalid') ? 'protocol-invalid' : 'network',
            statusClass: 'network',
            elapsedMs: Date.now() - startedAt,
          })
          lastDiagnostic = diagnostic
          providerCapabilities = aborted ? { json: false, stream: false, cancel: true } : null
          return { result: null, diagnostic, cached: false }
        }
      })()
      probeInFlight = run.finally(() => { probeInFlight = null })
      return probeInFlight
    }

    async function callLLM(content) {
      const sys = SYSTEM[cfg.style] || SYSTEM['要点速览']
      const user = cfg.customPrompt ? `${content}\n\n用户附加要求：${cfg.customPrompt}` : content
      const result = await generateModel({ system: sys, user })
      return result.text
    }

    /* ── 结果 / 进度展示 ── */
    let waitTimer = null
    let waitStarted = 0

    function stopWaitClock() {
      if (waitTimer) {
        clearInterval(waitTimer)
        waitTimer = null
      }
    }

    function closeSummary() {
      stopWaitClock()
      document.querySelector('.lsb-summary-panel')?.remove()
      document.querySelector('.lsb-mask.lsb-summary-mask')?.remove()
    }

    function openShell() {
      let mask = document.querySelector('.lsb-mask.lsb-summary-mask')
      let panel = document.querySelector('.lsb-summary-panel')
      if (mask && panel) return { mask, panel }
      closeSummary()
      mask = document.createElement('div')
      mask.className = 'lsb-mask lsb-summary-mask'
      panel = document.createElement('div')
      panel.className = 'lsb-panel lsb-summary-panel'
      document.body.append(mask, panel)
      return { mask, panel }
    }

    function showWait(status) {
      const { mask, panel } = openShell()
      waitStarted = Date.now()
      panel.innerHTML = `
        <div class="lsb-panel-head">
          <strong>AI 总结</strong>
          <span class="lsb-ver">${api.util.esc(cfg.model || '')}</span>
          <button class="lsb-panel-close" title="隐藏（总结仍会继续）">×</button>
        </div>
        <div class="lsb-view">
          <div class="lsb-summary-wait">
            <div class="lsb-sum-status"></div>
            <div class="lsb-row-desc lsb-sum-clock"></div>
            <div class="lsb-summary-trace" data-ai-summary-trace aria-live="polite"></div>
            <div class="lsb-row-desc">长帖可能需要一两分钟。完成后结果会显示在这里；点 × 只是先收起窗口。</div>
          </div>
        </div>`
      const statusEl = panel.querySelector('.lsb-sum-status')
      const clockEl = panel.querySelector('.lsb-sum-clock')
      statusEl.textContent = status
      const tick = () => {
        const s = Math.max(0, Math.round((Date.now() - waitStarted) / 1000))
        clockEl.textContent = `已等待 ${s}s`
      }
      stopWaitClock()
      waitTimer = setInterval(tick, 250)
      tick()
      const hide = () => {
        stopWaitClock()
        mask.remove()
        panel.remove()
      }
      panel.querySelector('.lsb-panel-close').onclick = hide
      mask.onclick = (e) => {
        if (e.target === mask) hide()
      }
      renderTracePanel()
    }

    function setWait(status) {
      const el = document.querySelector('.lsb-summary-panel .lsb-sum-status')
      if (el) el.textContent = status
      else showWait(status)
    }

    function show(text, meta, { fromCache = false, flowId = '' } = {}) {
      stopWaitClock()
      const { mask, panel } = openShell()
      const facts = [
        api.util.esc(meta.model || cfg.model),
        `${meta.floors} 楼`,
        `${meta.pagesFetched}/${meta.pagesTotal} 页`,
        `送入 ${meta.chars} 字`,
        meta.truncated ? '已截断' : null,
        meta.hasOp === false ? '不含主楼' : null,
        meta.ms ? `${(meta.ms / 1000).toFixed(1)}s` : null,
        fromCache ? '缓存' : null,
      ].filter(Boolean)
      panel.innerHTML = `
        <div class="lsb-panel-head">
          <strong>AI 总结 · ${api.util.esc(meta.title || '')}</strong>
          <span class="lsb-ver">${facts.join(' · ')}</span>
          <button class="lsb-panel-close">×</button>
        </div>
        <div class="lsb-view">
          <div class="lsb-sum-text lsb-md"></div>
          <div class="lsb-summary-trace" data-ai-summary-trace aria-live="polite"></div>
        </div>
        <div class="lsb-actions">
          <button class="lsb-btn" data-again>重新生成</button>
          <button class="lsb-btn" data-history>历史</button>
          <button class="lsb-btn" data-copy>复制</button>
          <button class="lsb-btn is-primary" data-close>关闭</button>
        </div>`
      const box = panel.querySelector('.lsb-sum-text')
      try {
        box.innerHTML = renderMarkdown(text)
      } catch {
        box.textContent = text
      }
      if (flowId) traceFlow = flowId
      else {
        traceFlow = ''
        traceEvents = []
      }
      renderTracePanel()
      const close = () => {
        mask.remove()
        panel.remove()
      }
      panel.querySelector('.lsb-panel-close').onclick = close
      panel.querySelector('[data-close]').onclick = close
      mask.onclick = (e) => {
        if (e.target === mask) close()
      }
      panel.querySelector('[data-again]').onclick = () => {
        close()
        void run(null, { force: true })
      }
      panel.querySelector('[data-history]').onclick = () => {
        close()
        api.ui.openPanel('ai-summary-history')
      }
      panel.querySelector('[data-copy]').onclick = async () => {
        try {
          await navigator.clipboard.writeText(text)
          api.ui.toast('已复制', { type: 'success' })
        } catch {
          api.ui.toast('复制失败，请手动选择文本', { type: 'error' })
        }
      }
    }

    function showError(msg) {
      stopWaitClock()
      const { mask, panel } = openShell()
      panel.innerHTML = `
        <div class="lsb-panel-head">
          <strong>AI 总结失败</strong>
          <button class="lsb-panel-close">×</button>
        </div>
        <div class="lsb-view">
          <div class="lsb-empty"></div>
          <div class="lsb-summary-trace" data-ai-summary-trace aria-live="polite"></div>
        </div>
        <div class="lsb-actions">
          <button class="lsb-btn" data-again>重试</button>
          <button class="lsb-btn is-primary" data-close>关闭</button>
        </div>`
      panel.querySelector('.lsb-empty').textContent = msg
      const close = () => {
        mask.remove()
        panel.remove()
      }
      panel.querySelector('.lsb-panel-close').onclick = close
      panel.querySelector('[data-close]').onclick = close
      mask.onclick = (e) => {
        if (e.target === mask) close()
      }
      panel.querySelector('[data-again]').onclick = () => {
        close()
        void run(null, { force: true })
      }
      renderTracePanel()
    }

    /* ── 执行 ── */
    let running = false
    async function run(btn, { force = false, flowId = '' } = {}) {
      if (!cfg.apiUrl || !cfg.apiKey) {
        api.ui.toast('请先在面板填写 API 端点与 Key', { type: 'error' })
        api.ui.openPanel('ai-summary')
        return
      }
      if (running) {
        setWait('仍在总结中…')
        api.ui.toast('正在总结中…', { type: 'info' })
        return
      }
      running = true
      const flow = flowIdFor(flowId)
      beginTrace(flow)
      const old = btn?.textContent
      if (btn) {
        btn.textContent = '⏳ 总结中…'
        btn.disabled = true
      }
      showWait('正在采集本帖…')
      let traceStage = 'scope'
      emitTrace(flow, 'scope', 'active', {
        title: '读取范围',
        summary: cfg.fetchAll ? '已选择当前主题的全部分页' : `已选择当前主题第 ${api.page.page || 1} 页`,
        evidence: 'verified',
      })
      emitTrace(flow, 'scope', 'complete', {
        title: '读取范围',
        summary: cfg.fetchAll ? '读取范围为当前主题的全部分页' : `读取范围为当前主题第 ${api.page.page || 1} 页`,
        evidence: 'verified',
      })
      try {
        traceStage = 'read'
        emitTrace(flow, 'read', 'active', {
          title: '读取帖子',
          summary: '正在从本地页面整理帖子内容',
        })
        const { content, meta } = await collect()
        const counts = collectTraceCounts(meta)
        emitTrace(flow, 'read', 'complete', {
          title: '读取帖子',
          summary: `已读取 ${counts.read} 个楼层，覆盖 ${counts.matched} 页`,
          evidence: 'verified',
          counts,
        })
        traceStage = 'answer'
        const hit = cached()
        if (!force && hit && hit.meta.hash === meta.hash) {
          emitTrace(flow, 'answer', 'complete', {
            title: '生成总结',
            summary: '已使用缓存的总结结果',
            evidence: 'verified',
            counts,
          })
          show(hit.text, { ...hit.meta, cached: true, source: 'cache' }, { fromCache: true, flowId: flow })
          return
        }
        setWait(`已采集 ${meta.floors} 楼 · 正在请求 ${cfg.model || '模型'}…`)
        emitTrace(flow, 'answer', 'active', {
          title: '生成总结',
          summary: '正在请求模型生成总结',
          evidence: 'unverified',
          counts,
        })
        const t0 = Date.now()
        const text = await callLLM(content)
        const record = {
          text,
          meta: { ...meta, model: cfg.model, style: cfg.style, ts: Date.now(), ms: Date.now() - t0 },
        }
        emitTrace(flow, 'answer', 'complete', {
          title: '生成总结',
          summary: '模型已返回总结文本',
          evidence: 'partial',
          counts,
        })
        api.store.set(cacheKey(), record)
        const ck = api.store.keys().filter((k) => k.startsWith('s:'))
        if (ck.length > 80) {
          const rows = ck
            .map((k) => ({ k, ts: api.store.get(k)?.meta?.ts || 0 }))
            .sort((a, b) => a.ts - b.ts)
          for (const r of rows.slice(0, rows.length - 80)) api.store.del(r.k)
        }
        show(text, record.meta, { flowId: flow })
        api.ui.toast('总结完成', { type: 'success' })
      } catch (e) {
        emitTrace(flow, traceStage, 'failed', {
          title: traceStage === 'read' ? '读取帖子' : '生成总结',
          summary: traceStage === 'read' ? '帖子读取失败' : '总结请求失败',
          evidence: 'unverified',
          reasonCode: traceStage === 'read' ? 'read-failed' : 'trace-invalid',
        })
        const msg = String(e.message || e)
        api.ui.toast(msg, { type: 'error', title: 'AI 总结失败' })
        showError(msg)
      } finally {
        running = false
        if (btn) {
          btn.disabled = false
          btn.textContent = old && old !== '⏳ 总结中…' ? old : labelFor()
        }
        refreshButtons()
      }
    }

    /* ── 按钮 ── */
    function labelFor() {
      return cached() ? '✨ 已有总结' : '✨ AI 总结'
    }
    const buttons = new Set()
    function refreshButtons() {
      const label = labelFor()
      for (const b of buttons) {
        if (!b.isConnected) buttons.delete(b)
        else if (!b.disabled) b.textContent = label
      }
    }

    function injectOpButton(li) {
      if (api.page.type !== 'topic') return
      if (li.id !== `post-${api.page.id}`) return
      const btn = api.ui.postAction(li, {
        label: labelFor(),
        title: '调用 AI 总结本帖（可在基座面板配置）',
        onClick: () => run(btn),
      })
      if (btn) buttons.add(btn)
    }
    // 选择器不能写死当前帖 id：首页先激活时 id 还不是帖子，软跳进帖后新楼层才会进 each
    api.dom.each('li.post-entry', injectOpButton)

    function syncTopLink() {
      const existing = document.querySelector('a.lsb-ai-sum-top')
      if (api.page.type !== 'topic') {
        existing?.remove()
        return
      }
      if (document.querySelector(`li.post-entry#post-${api.page.id}`)) {
        existing?.remove()
        return
      }
      if (existing) return
      const el = api.ui.topLink({
        label: '✨ AI 总结',
        title: '调用 AI 总结本页楼层',
        onClick: () => run(null),
      })
      el?.classList.add('lsb-ai-sum-top')
    }
    syncTopLink()
    api.on('route:changed', () => setTimeout(syncTopLink, 50))

    function timeAgo(ts) {
      if (!ts) return ''
      const s = Math.max(1, (Date.now() - ts) / 1000)
      if (s < 60) return '刚刚'
      if (s < 3600) return `${Math.floor(s / 60)} 分钟前`
      if (s < 86400) return `${Math.floor(s / 3600)} 小时前`
      return `${Math.floor(s / 86400)} 天前`
    }
    function listRecords() {
      return api.store
        .keys()
        .filter((k) => k.startsWith('s:'))
        .map((k) => {
          const rec = api.store.get(k, null)
          if (!rec || !rec.text) return null
          const topicId = Number(String(k).split(':')[1])
          return { k, topicId, text: rec.text, meta: rec.meta || {} }
        })
        .filter(Boolean)
        .sort((a, b) => (b.meta.ts || 0) - (a.meta.ts || 0))
    }

    api.ui.tab({
      id: 'ai-summary-history',
      name: 'AI 历史',
      order: 53,
      render(host) {
        const rows = listRecords()
        if (!rows.length) {
          host.innerHTML = '<div class="lsb-empty">还没有总结记录。在帖子页点 AI 总结后会出现在这里。</div>'
          return
        }
        host.innerHTML = `
          <div class="lsb-row-desc" style="margin-bottom:8px">共 ${rows.length} 条（上限 80）</div>
          ${rows
            .map(
              (r, i) => `
            <div class="lsb-row">
              <div class="lsb-row-main">
                <a class="lsb-row-name" href="${api.util.esc(api.routes.topic(r.topicId) || '#')}">${api.util.esc(r.meta.title || '帖子 #' + r.topicId)}</a>
                <div class="lsb-row-desc">${api.util.esc([r.meta.style, r.meta.model, r.meta.floors != null ? r.meta.floors + ' 楼' : '', timeAgo(r.meta.ts)].filter(Boolean).join(' · '))}</div>
              </div>
              <button class="lsb-btn" data-view="${i}">查看</button>
            </div>`,
            )
            .join('')}`
        host.querySelectorAll('[data-view]').forEach((btn) => {
          btn.onclick = () => {
            const r = rows[Number(btn.getAttribute('data-view'))]
            if (r) show(r.text, r.meta, { fromCache: true })
          }
        })
        const clear = document.createElement('button')
        clear.className = 'lsb-btn'
        clear.textContent = '清空全部记录'
        clear.style.marginTop = '10px'
        clear.onclick = async () => {
          if (!(await api.ui.confirm('确定清空所有总结历史？不可恢复。'))) return
          for (const k of api.store.keys().filter((x) => x.startsWith('s:'))) api.store.del(k)
          refreshButtons()
          api.ui.toast('已清空', { type: 'success' })
          api.ui.showTab('ai-summary-history')
        }
        host.appendChild(clear)
      },
    })

    /* ── 设置页（由 manifest.config 自动生成） ── */
    function diagnosticLabel(diagnostic) {
      const labels = {
        ok: '连接正常',
        'configured-missing': '未配置端点或 Key',
        'endpoint-invalid': '端点地址无效',
        'protocol-invalid': '返回协议无法识别',
        'http-auth': '认证失败（检查 API Key）',
        'http-rate-limit': '请求被限流',
        'http-server': '模型服务端错误',
        'http-error': '模型端点返回错误',
        'stream-unsupported': '流式不可用，已降级为整段回答',
        timeout: '连接超时',
        cancelled: '自检已取消',
        network: '网络连接失败',
      }
      return labels[String(diagnostic?.reasonCode || '')] || '尚未自检'
    }

    function renderProbeSettings(host) {
      const wrap = document.createElement('section')
      wrap.className = 'lsb-summary-probe'
      wrap.setAttribute('data-ai-summary-probe-panel', '')
      const title = document.createElement('strong')
      title.textContent = '连接自检'
      const desc = document.createElement('div')
      desc.className = 'lsb-row-desc'
      desc.textContent = '只发送固定的最小测试文本，不读取当前页面、对话历史或引用。'
      const actions = document.createElement('div')
      actions.className = 'lsb-summary-probe-actions'
      const button = document.createElement('button')
      button.type = 'button'
      button.className = 'lsb-btn'
      button.setAttribute('data-ai-summary-probe', '')
      button.textContent = '连接自检'
      const cancel = document.createElement('button')
      cancel.type = 'button'
      cancel.className = 'lsb-btn'
      cancel.setAttribute('data-ai-summary-probe-cancel', '')
      cancel.textContent = '取消自检'
      cancel.hidden = true
      const status = document.createElement('div')
      status.className = 'lsb-summary-probe-status'
      status.setAttribute('data-ai-summary-probe-status', '')
      status.setAttribute('role', 'status')
      status.textContent = diagnosticLabel(lastDiagnostic)
      actions.append(button, cancel)
      wrap.append(title, desc, actions, status)
      host.appendChild(wrap)

      let controller = null
      button.onclick = async () => {
        if (controller) return
        controller = new AbortController()
        button.disabled = true
        cancel.hidden = false
        status.textContent = '正在连接…'
        try {
          const outcome = await probe({ signal: controller.signal, force: true })
          const diagnostic = outcome?.diagnostic || lastDiagnostic
          const capabilities = outcome?.result?.capabilities || providerCapabilities
          const suffix = capabilities
            ? ` · JSON ${capabilities.json ? '可用' : '未验证'} · 流式 ${capabilities.stream ? '可用' : '未验证'} · ${diagnostic?.elapsedMs || 0} ms`
            : ''
          status.textContent = `${diagnosticLabel(diagnostic)}${suffix}`
        } catch {
          status.textContent = '连接失败，请检查配置后重试'
        } finally {
          controller = null
          button.disabled = false
          cancel.hidden = true
        }
      }
      cancel.onclick = () => controller?.abort()
    }

    api.ui.configTab({ name: 'AI 总结', order: 52, render: renderProbeSettings })
    api.ui.style(
      '.lsb-summary-probe{margin-top:14px;padding-top:12px;border-top:1px solid var(--line-soft,#eee)}.lsb-summary-probe-actions{display:flex;gap:8px;margin-top:8px}.lsb-summary-probe-status{margin-top:8px;color:var(--text-muted,#777);font-size:12px;line-height:1.5}' +
        '.lsb-summary-wait{padding:8px 0 4px}.lsb-sum-status{font-weight:600;margin-bottom:8px}' +
        '.lsb-summary-trace{margin:8px 0;color:var(--text-muted,#777);font-size:12px}.lsb-summary-trace-event{margin:3px 0}.lsb-summary-trace-event[data-state="failed"]{color:var(--danger,#b44)}' +
        '.lsb-sum-text{line-height:1.7}' +
        '.lsb-sum-text h1,.lsb-sum-text h2,.lsb-sum-text h3,.lsb-sum-text h4,.lsb-sum-text h5,.lsb-sum-text h6{margin:.85em 0 .4em;font-weight:650;line-height:1.35}' +
        '.lsb-sum-text h1{font-size:1.32em}.lsb-sum-text h2{font-size:1.18em}.lsb-sum-text h3{font-size:1.06em}' +
        '.lsb-sum-text p{margin:.55em 0}' +
        '.lsb-sum-text ul,.lsb-sum-text ol{margin:.45em 0;padding-left:1.45em}' +
        '.lsb-sum-text li{margin:.18em 0}' +
        '.lsb-sum-text code{font-family:ui-monospace,SFMono-Regular,Menlo,Consolas,monospace;font-size:.92em;padding:.1em .35em;border-radius:4px;background:var(--bg,#f4f4f4);border:1px solid var(--line-soft,#eee)}' +
        '.lsb-sum-text pre{margin:.65em 0;padding:10px 12px;border-radius:8px;background:var(--bg,#f6f6f6);border:1px solid var(--line,#ddd);overflow:auto}' +
        '.lsb-sum-text pre code{padding:0;border:0;background:transparent;font-size:12px}' +
        '.lsb-sum-text blockquote{margin:.55em 0;padding:2px 12px;border-left:3px solid var(--brand,#5eaaa0);color:var(--text-muted,#888)}' +
        '.lsb-sum-text a{color:var(--brand,#5eaaa0)}' +
        '.lsb-sum-text hr{border:0;border-top:1px solid var(--line,#ddd);margin:.9em 0}' +
        '.lsb-sum-text table{border-collapse:collapse;width:100%;margin:.6em 0;font-size:12px}' +
        '.lsb-sum-text th,.lsb-sum-text td{border:1px solid var(--line,#ddd);padding:5px 8px;text-align:left}' +
        '.lsb-sum-text th{background:var(--bg,#f6f6f6);font-weight:600}',
    )
    api.onDispose(() => stopWaitClock())

    /* ── 调试/测试接口 ── */
    api.handle('ai-summary:debug', () => ({
      collect,
      cached,
      cacheKey,
      probe,
      renderMarkdown,
      run: (opts) => run(null, opts || {}),
      buttons: () => [...document.querySelectorAll('.lsb-op')].map((b) => b.textContent),
    }))

    return {
      configured: () => Boolean(String(cfg.apiUrl || '').trim() && String(cfg.apiKey || '').trim()),
      model: () => String(cfg.model || ''),
      providerState: () => ({
        configured: Boolean(String(cfg.apiUrl || '').trim() && String(cfg.apiKey || '').trim()),
        model: String(cfg.model || ''),
        protocol: diagnostics.normalizeEndpoint({ apiUrl: cfg.apiUrl, apiStyle: cfg.apiStyle, model: cfg.model }, location.href).protocol,
        capabilities: providerCapabilities ? capabilityFlags(providerCapabilities) : null,
        lastDiagnostic: lastDiagnostic ? diagnostics.redactDiagnostic(lastDiagnostic) : null,
      }),
      probe,
      renderMarkdown,
      generate: ({ system, user, timeout, signal, onDelta } = {}) =>
        generateModel({ system: String(system || ''), user: String(user || ''), timeout, signal, onDelta }),
    }
  }

  const w = typeof unsafeWindow !== 'undefined' ? unsafeWindow : window
  if (w.LSB && w.LSB.register) w.LSB.register(manifest, setup)
  else ;(w.LSB_PLUGINS = w.LSB_PLUGINS || []).push({ manifest, setup })
})()
