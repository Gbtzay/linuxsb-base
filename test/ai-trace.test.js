import { test } from 'node:test'
import assert from 'node:assert/strict'
import {
  TRACE_STAGES,
  TRACE_STATES,
  sanitizeTraceEvent,
  validateTraceEvent,
  transitionTrace,
  normalizePlanVersion,
} from '../src/ai-trace.js'

test('trace.v1：只保留白名单字段并清理敏感值', () => {
  const event = sanitizeTraceEvent({
    id: '1',
    flowId: 'turn-1',
    stage: 'read',
    state: 'active',
    title: '读取',
    summary: 'x'.repeat(400),
    evidence: 'verified',
    counts: { selected: 1, read: 2, matched: 3, citations: 4, secret: 99 },
    citations: ['floor-1', 'floor-1', 'x'.repeat(300)],
    csrf: 'secret-token',
    html: '<body>private</body>',
    rawResponse: 'raw response',
  })

  assert.equal(event.summary.length, 200)
  assert.deepEqual(event.counts, { selected: 1, read: 2, matched: 3, citations: 4 })
  assert.deepEqual(event.citations, ['floor-1', 'x'.repeat(120)])
  assert.equal('csrf' in event, false)
  assert.equal('html' in event, false)
  assert.equal('rawResponse' in event, false)
  assert.deepEqual([...TRACE_STAGES], ['plan', 'scope', 'read', 'validate', 'answer', 'execute', 'check', 'limit'])
  assert.deepEqual([...TRACE_STATES], ['pending', 'active', 'complete', 'failed', 'unknown', 'skipped'])
})

test('trace.v1：校验事件字段和状态迁移', () => {
  const pending = sanitizeTraceEvent({
    id: '1', flowId: 'turn-1', stage: 'plan', state: 'pending',
    title: '计划', summary: '等待', evidence: 'unverified',
  })
  assert.equal(validateTraceEvent(pending).ok, true)
  assert.equal(transitionTrace(pending, { ...pending, state: 'active' }).ok, true)
  assert.equal(transitionTrace({ ...pending, state: 'complete' }, { ...pending, state: 'active' }).ok, false)
  assert.equal(validateTraceEvent({ ...pending, stage: 'unknown-stage' }).ok, false)
  assert.equal(validateTraceEvent({ ...pending, state: 'cancelled' }).ok, false)
  assert.equal(validateTraceEvent({ ...pending, counts: { read: -1 } }).ok, false)
})

test('trace.v1：兼容已知计划变体并固定输出当前版本', () => {
  const normalized = normalizePlanVersion({
    version: '1',
    summary: '打开首页',
    steps: [{ id: 'site.navigate', params: { target: 'home' } }],
  }, { question: '回首页', actions: [{ id: 'site.navigate', permission: 'read' }] })

  assert.equal(normalized.kind, 'plan')
  assert.deepEqual(normalized.plan, {
    version: 1,
    summary: '打开首页',
    steps: [{ action: 'site.navigate', args: { target: 'home' } }],
  })
  assert.deepEqual(normalized.warnings, ['plan-normalized'])
})

test('trace.v1：未知只读计划降级，未知写计划拒绝', () => {
  const fallback = normalizePlanVersion({
    version: 99,
    summary: '查询当前列表',
    steps: [{ action: 'site.search', args: { query: '内核' } }],
  }, {
    question: '查一下当前列表里的内核主题',
    actions: [{ id: 'site.search', permission: 'read' }],
  })
  assert.equal(fallback.kind, 'fallback')
  assert.equal(fallback.reasonCode, 'plan-downgraded')
  assert.equal(fallback.question, '查一下当前列表里的内核主题')

  const unsupported = normalizePlanVersion({
    version: 99,
    summary: '回复',
    steps: [{ action: 'site.write-reply', args: { body: '你好' } }],
  }, {
    question: '回复当前帖子',
    actions: [{ id: 'site.write-reply', permission: 'write' }],
  })
  assert.equal(unsupported.kind, 'unsupported')
  assert.equal(unsupported.reasonCode, 'plan-unsupported')
})
