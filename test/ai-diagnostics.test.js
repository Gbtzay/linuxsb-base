import { test } from 'node:test'
import assert from 'node:assert/strict'
import {
  normalizeEndpoint,
  classifyProbeResponse,
  redactDiagnostic,
} from '../src/ai-diagnostics.js'

test('M16 端点归一化识别 OpenAI、Anthropic 和显式协议', () => {
  const openai = normalizeEndpoint({
    apiUrl: 'https://api.example.test/v1/chat/completions?tenant=private',
    apiStyle: '自动',
    model: 'deepseek-chat',
  })
  assert.equal(openai.valid, true)
  assert.equal(openai.protocol, 'openai')
  assert.equal(openai.origin, 'https://api.example.test')
  assert.equal(openai.path, '/v1/chat/completions')
  assert.doesNotMatch(openai.key, /tenant|private/)

  const anthropic = normalizeEndpoint({
    apiUrl: 'https://proxy.example.test/v1/messages',
    apiStyle: '自动',
    model: 'claude-sonnet',
  })
  assert.equal(anthropic.protocol, 'anthropic')

  const forced = normalizeEndpoint({
    apiUrl: 'https://proxy.example.test/custom',
    apiStyle: 'Anthropic',
    model: 'claude-sonnet',
  })
  assert.equal(forced.protocol, 'anthropic')
  assert.equal(forced.valid, true)

  const invalid = normalizeEndpoint({ apiUrl: 'javascript:alert(1)', model: 'x' })
  assert.equal(invalid.valid, false)
  assert.equal(invalid.reasonCode, 'endpoint-invalid')
})

test('M16 探测响应分类区分 JSON、SSE、取消和固定 HTTP 错误码', () => {
  const json = classifyProbeResponse({
    protocol: 'openai', status: 200, contentType: 'application/json', completed: true, elapsedMs: 42,
  })
  assert.equal(json.outcome, 'ok')
  assert.equal(json.capabilities.json, true)
  assert.equal(json.capabilities.stream, false)
  assert.equal(json.reasonCode, 'ok')

  const stream = classifyProbeResponse({
    protocol: 'anthropic', status: 200, contentType: 'text/event-stream', sawDelta: true, completed: true, elapsedMs: 88,
  })
  assert.equal(stream.outcome, 'ok')
  assert.equal(stream.capabilities.stream, true)

  const cancelled = classifyProbeResponse({ protocol: 'openai', aborted: true, elapsedMs: 10 })
  assert.equal(cancelled.outcome, 'cancelled')
  assert.equal(cancelled.capabilities.cancel, true)
  assert.equal(cancelled.reasonCode, 'cancelled')

  assert.equal(classifyProbeResponse({ status: 401 }).reasonCode, 'http-auth')
  assert.equal(classifyProbeResponse({ status: 429 }).reasonCode, 'http-rate-limit')
  assert.equal(classifyProbeResponse({ status: 503 }).reasonCode, 'http-server')
  assert.equal(classifyProbeResponse({ status: 200, contentType: 'text/event-stream', completed: false }).reasonCode, 'protocol-invalid')
})

test('M16 诊断脱敏只保留固定字段，不泄露端点查询和敏感正文', () => {
  const result = redactDiagnostic({
    version: 9,
    protocol: 'anthropic',
    outcome: 'ok',
    capabilities: { json: true, stream: true, cancel: false },
    statusClass: '2xx',
    elapsedMs: 123,
    reasonCode: 'ok',
    createdAt: 456,
    apiKey: 'sk-secret',
    url: 'https://api.example.test/v1/messages?token=secret',
    prompt: '页面正文和历史问题',
    response: '模型回答和引用',
  })
  assert.deepEqual(result, {
    version: 1,
    protocol: 'anthropic',
    outcome: 'ok',
    capabilities: { json: true, stream: true, cancel: false },
    statusClass: '2xx',
    elapsedMs: 123,
    reasonCode: 'ok',
    createdAt: 456,
  })
  assert.doesNotMatch(JSON.stringify(result), /secret|正文|历史|回答|引用/)
})
