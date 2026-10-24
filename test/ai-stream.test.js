import { test } from 'node:test'
import assert from 'node:assert/strict'
import { createAnswerStream } from '../src/ai-stream.js'

const frame = (data, event = '') => `${event ? `event: ${event}\n` : ''}data: ${JSON.stringify(data)}\n\n`

test('M12 OpenAI SSE 任意分片、CRLF 与多行 data 只提取回答', () => {
  const deltas = []
  const parser = createAnswerStream({ onDelta: (delta) => deltas.push(delta) })
  const stream = ': heartbeat\r\n\r\n' +
    'data: {"choices":[{\r\ndata: "delta":{"content":"中文🙂"}}]}\r\n\r\n' +
    frame({ choices: [{ delta: { reasoning_content: '不应显示', content: '答案 [#1]' } }] }) +
    frame({ choices: [{ delta: {}, finish_reason: 'stop' }] }) + 'data: [DONE]\n\n'
  for (let i = 0; i < stream.length; i += 3) parser.push(stream.slice(i, i + 3))
  assert.equal(parser.finish(), '中文🙂答案 [#1]')
  assert.deepEqual(deltas, ['中文🙂', '答案 [#1]'])
})

test('M12 Anthropic SSE 跳过 thinking 和工具事件，message_stop 后完成', () => {
  const parser = createAnswerStream({ protocol: 'anthropic' })
  parser.push(frame({ type: 'ping' }, 'ping'))
  parser.push(frame({ type: 'content_block_delta', delta: { type: 'thinking_delta', thinking: '私有推理' } }, 'content_block_delta'))
  parser.push(frame({ type: 'content_block_delta', delta: { type: 'input_json_delta', partial_json: '{"write":true}' } }))
  parser.push(frame({ type: 'content_block_delta', delta: { type: 'text_delta', text: '公开回答' } }))
  parser.push(frame({ type: 'message_delta', delta: { stop_reason: 'end_turn' } }))
  parser.push(frame({ type: 'message_stop' }, 'message_stop'))
  assert.equal(parser.finish(), '公开回答')
})

test('M12 未完成、服务端错误、无文本和长度截断均不能当成功回答', () => {
  const incomplete = createAnswerStream()
  incomplete.push(frame({ choices: [{ delta: { content: '部分' } }] }))
  assert.throws(() => incomplete.finish(), /中断|完成/)
  const missingDone = createAnswerStream()
  missingDone.push(frame({ choices: [{ delta: { content: '看似完整' } }] }))
  missingDone.push(frame({ choices: [{ delta: {}, finish_reason: 'stop' }] }))
  assert.throws(() => missingDone.finish(), /中断|完成/)
  const malformed = createAnswerStream()
  assert.throws(() => malformed.push('data: {invalid}\n\n'), /JSON|协议/)
  const error = createAnswerStream({ protocol: 'anthropic' })
  assert.throws(() => error.push(frame({ type: 'error', error: { type: 'overloaded_error', message: 'private' } }, 'error')), /错误/)
  const empty = createAnswerStream()
  empty.push('data: [DONE]\n\n')
  assert.throws(() => empty.finish(), /文本/)
  const clipped = createAnswerStream()
  assert.throws(() => clipped.push(frame({ choices: [{ delta: { content: 'partial' }, finish_reason: 'length' }] })), /长度|截断/)
})

test('M12 SSE 限制缓冲与回答大小，完成后拒绝新的正文', () => {
  const parser = createAnswerStream({ maxChars: 5 })
  assert.throws(() => parser.push(frame({ choices: [{ delta: { content: '123456' } }] })), /上限|过长/)
  const pending = createAnswerStream()
  assert.throws(() => pending.push('data: ' + 'x'.repeat(210000)), /上限|过长/)
  const done = createAnswerStream()
  done.push(frame({ choices: [{ delta: { content: '正确' } }] }) + 'data: [DONE]\n\n')
  assert.throws(() => done.push(frame({ choices: [{ delta: { content: '迟到' } }] })), /完成|协议/)
})
