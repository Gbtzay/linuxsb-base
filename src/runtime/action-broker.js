import { sanitizeDiagnostic } from './redaction.js'
import { routeFingerprint, snapshotValue } from './route-utils.js'

function actionError(code, message, fields = {}) {
  const error = new Error(message || code)
  error.code = code
  Object.assign(error, fields)
  return error
}

function contextOf(owner) {
  return owner?.require ? owner : owner?.context?.require ? owner.context : null
}

function assertSerializable(value, seen = new WeakSet()) {
  if (value == null || typeof value === 'string' || typeof value === 'number' || typeof value === 'boolean') return
  if (typeof value === 'bigint' || typeof value === 'function' || typeof value === 'symbol' || value instanceof WeakMap || value instanceof WeakSet) {
    throw actionError('action.args-invalid', '动作参数不可序列化')
  }
  if (typeof value === 'object') {
    if (seen.has(value)) throw actionError('action.args-invalid', '动作参数不能包含循环引用')
    seen.add(value)
    if (Array.isArray(value)) for (const item of value) assertSerializable(item, seen)
    else for (const [key, item] of Object.entries(value)) {
      if (!/^[\w.-]{1,80}$/.test(key)) throw actionError('action.args-invalid', '动作参数字段名不合法')
      assertSerializable(item, seen)
    }
    seen.delete(value)
  }
}

function copy(value) {
  try { return structuredClone(value) } catch { return JSON.parse(JSON.stringify(value)) }
}

function randomPart() {
  try { return crypto.randomUUID() } catch { return `${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 10)}` }
}

function getAction(actions, id) {
  if (actions instanceof Map) return actions.get(id)
  if (actions && typeof actions === 'object') return actions[id]
  return null
}

function validateSchema(schema, args) {
  if (!schema) return true
  if (typeof schema === 'function') return schema(args) !== false
  if (typeof schema.validate === 'function') return schema.validate(args) !== false
  if (schema.type && schema.type !== 'object') return false
  if (schema.required && Array.isArray(schema.required)) {
    for (const key of schema.required) if (args?.[key] == null || args[key] === '') return false
  }
  if (schema.properties && args && typeof args === 'object') {
    for (const [key, rule] of Object.entries(schema.properties)) {
      if (args[key] == null || !rule) continue
      if (rule.type === 'string' && typeof args[key] !== 'string') return false
      if (rule.type === 'number' && (typeof args[key] !== 'number' || !Number.isFinite(args[key]))) return false
      if (rule.enum && !rule.enum.includes(args[key])) return false
    }
  }
  return true
}

function targetAllowed(provider, targetScope, allowlist) {
  const rule = provider?.targetScope ?? allowlist
  if (!rule) return true
  if (typeof rule === 'function') return rule(targetScope) !== false
  if (Array.isArray(rule)) return rule.some((item) => JSON.stringify(item) === JSON.stringify(targetScope))
  if (typeof rule === 'object' && targetScope && typeof targetScope === 'object') {
    return Object.entries(rule).every(([key, value]) => targetScope[key] === value)
  }
  return false
}

function classifyExecution(result) {
  if (result && ['success', 'failure', 'unknown'].includes(result.kind)) return result.kind
  const status = Number(result?.status)
  if (Number.isFinite(status) && status >= 500) return 'unknown'
  if (Number.isFinite(status) && (status < 200 || status >= 300)) return 'failure'
  const json = result?.json ?? result?.data
  if (json && (json.ok === false || json.ok === 0 || json.ok === '0')) return 'failure'
  if (json && (json.ok === true || json.ok === 1 || json.ok === '1')) return 'success'
  if (result?.ok === true) return 'success'
  return 'unknown'
}

function classifyCheck(result) {
  if (result && ['confirmed', 'not-confirmed', 'unknown'].includes(result.kind)) return result.kind
  if (result?.ok === true) return 'confirmed'
  if (result?.ok === false) return 'not-confirmed'
  return 'unknown'
}

/**
 * Platform v2 站内动作状态机：prepare → confirm → execute → check。
 * 写端点只会在 execute 中调用一次；网络/HTTP 不确定时，check 只能走
 * provider 提供的只读核验函数，绝不自动重放写请求。
 */
export class ActionBroker {
  constructor({ actions = new Map(), providers, snapshot = () => ({}), request = null, trace = () => {}, scopeTtlMs = 60000, clock = () => Date.now(), targetAllowlist = null, maxRecords = 256 } = {}) {
    this.actions = providers || actions
    this.snapshot = snapshot
    this.request = request
    this.trace = typeof trace === 'function' ? trace : () => {}
    this.scopeTtlMs = Math.max(1, Number(scopeTtlMs) || 60000)
    this.clock = typeof clock === 'function' ? clock : () => Date.now()
    const limit = Number(maxRecords)
    this.maxRecords = Number.isFinite(limit) && limit >= 1 ? Math.floor(limit) : 256
    this.targetAllowlist = targetAllowlist
    this._counter = 0
    this._pending = new Map()
    this._confirmed = new WeakMap()
    this._idempotency = new Map()
  }

  register(actionId, provider) {
    const id = String(actionId || '')
    if (!id || !provider || typeof provider.execute !== 'function') throw actionError('action.invalid-provider', '动作提供方无效')
    if (!(this.actions instanceof Map)) throw actionError('action.registry-immutable', '当前动作目录不可注册')
    if (this.actions.has(id)) throw actionError('action.duplicate', '动作已注册')
    this.actions.set(id, provider)
    return () => {
      if (this.actions.get(id) === provider) this.actions.delete(id)
    }
  }

  _emit(event) {
    try { this.trace(sanitizeDiagnostic(event)) } catch { /* trace 不能影响动作安全链 */ }
  }

  _retireRecord(record) {
    if (!record) return
    this._pending.delete(record.nonce)
    this._idempotency.delete(record.idempotencyKey)
    record.owner = null
    record.provider = null
    record.targetScope = null
    record.args = null
  }

  _pruneRecords(now = this.clock()) {
    for (const record of this._idempotency.values()) {
      if (now >= record.expiresAt) this._retireRecord(record)
    }
    while (this._idempotency.size > this.maxRecords) {
      this._retireRecord(this._idempotency.values().next().value)
    }
  }

  _getRecord(pendingOrConfirmed) {
    if (!pendingOrConfirmed || typeof pendingOrConfirmed !== 'object') return null
    if (pendingOrConfirmed.__actionBroker === this) return pendingOrConfirmed
    return this._pending.get(pendingOrConfirmed.nonce) || this._idempotency.get(pendingOrConfirmed.idempotencyKey) || null
  }

  _routeCheck(record, phase) {
    const current = routeFingerprint(snapshotValue(this.snapshot))
    if (String(current ?? '') !== String(record.routeFingerprint ?? '')) {
      throw actionError('action.route-mismatch', `动作在 ${phase} 阶段离开了原路由`)
    }
  }

  _targetCheck(record) {
    if (!targetAllowed(record.provider, record.targetScope, this.targetAllowlist)) throw actionError('action.target-denied', '动作目标不在本地允许范围')
  }

  prepare({ owner, actionId, summary = '', targetScope = null, routeFingerprint: requestedRoute, args = {}, schema } = {}) {
    this._pruneRecords()
    const id = String(actionId || '')
    const provider = getAction(this.actions, id)
    if (!provider || typeof provider.execute !== 'function') throw actionError('action.unknown', '动作不存在')
    assertSerializable(args)
    const checked = schema || provider.schema
    if (!validateSchema(checked, args)) throw actionError('action.schema-invalid', '动作参数不符合 schema')
    const snapshot = snapshotValue(this.snapshot)
    const currentRoute = routeFingerprint(snapshot)
    if (requestedRoute != null && String(requestedRoute) !== String(currentRoute ?? '')) throw actionError('action.route-mismatch', '动作目标已离开原路由')
    if (!targetAllowed(provider, targetScope, this.targetAllowlist)) throw actionError('action.target-denied', '动作目标不在本地允许范围')
    const createdAt = this.clock()
    const nonce = `scope-${++this._counter}-${randomPart()}`
    const idempotencyKey = `action-${id}-${this._counter}-${randomPart()}`
    const record = {
      __actionBroker: this,
      owner,
      provider,
      actionId: id,
      summary: String(summary || '').slice(0, 240),
      targetScope: copy(targetScope),
      routeFingerprint: currentRoute,
      args: copy(args),
      nonce,
      idempotencyKey,
      createdAt,
      expiresAt: createdAt + this.scopeTtlMs,
      nonceUsed: false,
      confirmed: false,
      executed: false,
    }
    this._pending.set(nonce, record)
    this._idempotency.set(idempotencyKey, record)
    this._pruneRecords(createdAt)
    return Object.freeze({
      actionId: id,
      summary: record.summary,
      targetScope: copy(record.targetScope),
      routeFingerprint: record.routeFingerprint,
      args: copy(record.args),
      nonce,
      idempotencyKey,
      createdAt,
      expiresAt: record.expiresAt,
    })
  }

  async confirm(pending, { nonce, userConfirmed = false } = {}) {
    const record = this._pending.get(pending?.nonce)
    if (!record || record !== this._getRecord(pending)) throw actionError('action.pending-invalid', '动作 scope 无效')
    if (record.nonceUsed) throw actionError('action.nonce-used', '动作确认 nonce 已使用')
    if (String(nonce || '') !== record.nonce) throw actionError('action.nonce-invalid', '动作确认 nonce 无效')
    if (this.clock() > record.expiresAt) {
      record.nonceUsed = true
      this._retireRecord(record)
      throw actionError('action.scope-expired', '动作确认 scope 已过期')
    }
    if (!userConfirmed) throw actionError('action.confirmation-required', '动作需要用户明确确认')
    const context = contextOf(record.owner)
    if (!context) throw actionError('capability.denied', '动作没有能力上下文', { capability: 'write' })
    context.require('write', `确认动作 ${record.actionId}`)
    this._routeCheck(record, 'confirm')
    this._targetCheck(record)
    record.nonceUsed = true
    record.confirmed = true
    const confirmedAt = this.clock()
    record.expiresAt = confirmedAt + this.scopeTtlMs
    const confirmed = Object.freeze({
      actionId: record.actionId,
      summary: record.summary,
      targetScope: copy(record.targetScope),
      routeFingerprint: record.routeFingerprint,
      args: copy(record.args),
      nonce: record.nonce,
      idempotencyKey: record.idempotencyKey,
      confirmedAt,
    })
    this._confirmed.set(confirmed, record)
    this._emit({ kind: 'confirm', owner: context.owner, actionId: record.actionId, idempotencyKey: record.idempotencyKey })
    return confirmed
  }

  async execute(confirmed) {
    const record = this._confirmed.get(confirmed) || this._getRecord(confirmed)
    if (!record || !record.confirmed) throw actionError('action.confirmation-required', '动作尚未确认')
    if (record.executed) throw actionError('action.duplicate', '动作幂等键已执行')
    if (this.clock() > record.expiresAt) {
      this._retireRecord(record)
      throw actionError('action.scope-expired', '动作执行 scope 已过期')
    }
    if (this._idempotency.get(record.idempotencyKey) !== record) throw actionError('action.pending-invalid', '动作 scope 已失效')
    const context = contextOf(record.owner)
    if (!context) throw actionError('capability.denied', '动作没有能力上下文', { capability: 'write' })
    context.require('write', `执行动作 ${record.actionId}`)
    this._routeCheck(record, 'execute')
    this._targetCheck(record)
    // 只有通过执行前校验后才消耗幂等键，路由恢复后仍可重试。
    record.executed = true
    const meta = {
      actionId: record.actionId,
      idempotencyKey: record.idempotencyKey,
      targetScope: copy(record.targetScope),
      routeFingerprint: record.routeFingerprint,
      owner: context.owner,
      request: this.request,
      signal: context.signal,
    }
    let result
    let thrown = null
    try {
      result = await record.provider.execute(copy(record.args), meta)
    } catch (error) {
      thrown = error
    }
    let kind
    if (thrown) {
      const code = String(thrown.code || '')
      kind = /network|timeout|abort|unknown|fetch/i.test(code) ? 'unknown' : 'failure'
    } else kind = classifyExecution(result)
    const rawStatus = Number(result?.status)
    const receipt = Object.freeze({
      actionId: record.actionId,
      idempotencyKey: record.idempotencyKey,
      owner: context.owner,
      targetScope: sanitizeDiagnostic(record.targetScope),
      routeFingerprint: record.routeFingerprint,
      status: Number.isFinite(rawStatus) ? rawStatus : 0,
      kind,
      at: this.clock(),
    })
    this._emit({ kind: 'execute', owner: context.owner, actionId: record.actionId, idempotencyKey: record.idempotencyKey, outcome: kind })
    this._pending.delete(record.nonce)
    record.args = null
    record.expiresAt = this.clock() + this.scopeTtlMs
    return { kind, receipt }
  }

  async check(receipt) {
    this._pruneRecords()
    const record = this._idempotency.get(receipt?.idempotencyKey)
    if (!record || record.idempotencyKey !== receipt.idempotencyKey || !record.executed) {
      throw actionError('action.receipt-invalid', '动作回执无效')
    }
    const context = contextOf(record.owner)
    if (!context) throw actionError('capability.denied', '动作没有能力上下文', { capability: 'read' })
    context.require('read', `只读检查动作 ${record.actionId}`)
    if (typeof record.provider.check !== 'function') throw actionError('action.check-unavailable', '动作没有只读结果检查器')
    let result
    try {
      result = await record.provider.check({ ...receipt }, {
        actionId: record.actionId,
        targetScope: copy(record.targetScope),
        routeFingerprint: record.routeFingerprint,
        owner: context.owner,
        request: this.request,
        signal: context.signal,
        readOnly: true,
      })
    } catch {
      result = { kind: 'unknown' }
    }
    const kind = classifyCheck(result)
    this._emit({ kind: 'check', owner: context.owner, actionId: record.actionId, idempotencyKey: record.idempotencyKey, outcome: kind })
    if (kind !== 'unknown') this._retireRecord(record)
    return { kind }
  }

  /**
   * 旧 facade 的兼容入口。旧插件已经在自己的 UI/确认层完成确认，
   * 因此这里只统一执行 write 能力、生命周期和安全 trace，再把现有
   * Actions 的语义结果原样返回；新代码必须使用 prepare/confirm/execute。
   */
  async legacy(owner, actionId, execute) {
    const context = contextOf(owner)
    if (!context) throw actionError('capability.denied', '动作没有能力上下文', { capability: 'write' })
    context.require('write', `兼容动作 ${String(actionId || '')}`)
    if (typeof execute !== 'function') throw actionError('action.invalid-provider', '兼容动作没有执行器')
    this._emit({ kind: 'legacy-execute', owner: context.owner, actionId: String(actionId || '') })
    return execute()
  }
}
