import { test } from 'node:test'
import assert from 'node:assert/strict'
import { createCapabilityContext } from '../src/runtime/capabilities.js'
import { sanitizeDiagnostic } from '../src/runtime/redaction.js'

test('能力上下文规范化权限并拒绝未声明能力', () => {
  const ctx = createCapabilityContext(
    { id: 'reader', permissions: ['read', 'read', 'storage', 'unknown'] },
    { signal: new AbortController().signal },
  )

  assert.equal(ctx.owner, 'reader')
  assert.deepEqual(ctx.capabilities, ['read', 'storage'])
  assert.equal(Object.isFrozen(ctx.capabilities), true)
  assert.doesNotThrow(() => ctx.require('read', '读取当前页'))
  for (const capability of ['write', 'net', 'admin']) {
    assert.throws(
      () => ctx.require(capability, '测试用途'),
      (error) => error.code === 'capability.denied' && error.owner === 'reader' && error.capability === capability,
    )
  }
})

test('子上下文只能收窄能力，生命周期清理只执行一次', () => {
  const ctx = createCapabilityContext({ id: 'parent', permissions: ['read', 'write', 'storage'] })
  const child = ctx.child('read-only', ['read'])
  const calls = []
  child.own(() => calls.push('child'))
  ctx.own(() => calls.push('parent'))

  assert.equal(child.owner, 'parent/read-only')
  assert.deepEqual(child.capabilities, ['read'])
  assert.throws(() => ctx.child('escalate', ['admin']), (error) => error.code === 'capability.escalation')

  ctx.dispose()
  ctx.dispose()
  assert.deepEqual(calls, ['child', 'parent'])
  assert.throws(() => child.require('read', 'after dispose'), (error) => error.code === 'capability.disposed')
})

test('诊断递归脱敏保留稳定原因码但移除凭据、正文和查询值', () => {
  const safe = sanitizeDiagnostic({
    code: 'request.timeout',
    reason: 'timeout',
    headers: { authorization: 'Bearer secret', cookie: 'sid=secret' },
    csrf: 'csrf-secret',
    apiKey: 'key-secret',
    body: { password: 'pw', content: 'private body' },
    url: 'https://linux.sb/topic/1?token=secret&name=alice',
    nested: [{ ok: true, token: 'nested-secret' }],
  })

  assert.equal(safe.code, 'request.timeout')
  assert.equal(safe.reason, 'timeout')
  assert.equal(safe.headers.authorization, '[redacted]')
  assert.equal(safe.headers.cookie, '[redacted]')
  assert.equal(safe.csrf, '[redacted]')
  assert.equal(safe.apiKey, '[redacted]')
  assert.equal(safe.body, '[redacted]')
  assert.equal(safe.nested[0].token, '[redacted]')
  assert.equal(safe.url, 'https://linux.sb/topic/1')
})
