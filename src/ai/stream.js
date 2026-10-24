/** Incremental SSE decoder for answer text. Does not expose reasoning or execute tool events. */
export function createAnswerStream({ protocol = 'openai', onDelta, maxChars = 100000 } = {}) {
  let buffer = ''
  let event = ''
  let data = []
  let text = ''
  let completed = false
  let stopped = false
  let failure = null
  const limit = Math.max(1, Math.min(100000, Number(maxChars) || 100000))
  const fail = (message) => { failure = new Error(message); throw failure }
  const append = (delta) => {
    if (typeof delta !== 'string' || !delta) return
    if (completed || stopped) fail('流式回答完成后收到新的正文，协议无效')
    if (text.length + delta.length > limit) fail('流式回答超过长度上限')
    text += delta
    onDelta?.(delta, text)
  }
  const dispatch = () => {
    const payload = data.join('\n')
    const eventName = event
    data = []
    event = ''
    if (!payload) return
    if (payload.trim() === '[DONE]') { completed = true; return }
    let row
    try { row = JSON.parse(payload) } catch { fail('流式回答包含无效 JSON 协议') }
    if (eventName === 'error' || row?.error || row?.type === 'error') fail('流式接口返回错误，请手动重试')
    if (protocol === 'anthropic') {
      if (row?.type === 'content_block_start' && row.content_block?.type === 'text') append(row.content_block.text)
      if (row?.type === 'content_block_delta' && row.delta?.type === 'text_delta') append(row.delta.text)
      if (row?.type === 'message_delta' && row.delta?.stop_reason) {
        if (!['end_turn', 'stop_sequence'].includes(row.delta.stop_reason)) fail('流式回答被截断或包含无法处理的工具调用')
        stopped = true
      }
      if (row?.type === 'message_stop') completed = true
    } else {
      for (const choice of Array.isArray(row?.choices) ? row.choices : []) {
        if (choice.index != null && choice.index !== 0) continue
        append(choice.delta?.content)
        if (choice.finish_reason) {
          if (choice.finish_reason !== 'stop') fail('流式回答被截断或超过输出长度限制')
          stopped = true
        }
      }
    }
  }
  const line = (value) => {
    if (!value) { dispatch(); return }
    if (value.startsWith(':')) return
    const colon = value.indexOf(':')
    const key = colon < 0 ? value : value.slice(0, colon)
    const raw = colon < 0 ? '' : value.slice(colon + 1)
    const valueText = raw.startsWith(' ') ? raw.slice(1) : raw
    if (key === 'data') data.push(valueText)
    else if (key === 'event') event = valueText
  }
  const consume = (final = false) => {
    for (;;) {
      const found = /[\r\n]/.exec(buffer)
      if (!found) break
      const index = found.index
      if (!final && buffer[index] === '\r' && index === buffer.length - 1) break
      const width = buffer[index] === '\r' && buffer[index + 1] === '\n' ? 2 : 1
      const value = buffer.slice(0, index)
      buffer = buffer.slice(index + width)
      line(value.replace(/^\uFEFF/, ''))
    }
  }
  return {
    push(chunk) {
      if (failure) throw failure
      buffer += String(chunk || '')
      if (buffer.length > 200000 || data.join('\n').length > 200000) fail('流式事件缓冲超过长度上限')
      consume()
    },
    finish() {
      if (failure) throw failure
      consume(true)
      if (buffer.trim()) { line(buffer); buffer = '' }
      if (data.length) dispatch()
      if (!completed) fail('流式回答中断，未收到完成标记，请手动重试')
      if (!text.trim()) fail('流式响应没有回答文本')
      return text
    },
  }
}
