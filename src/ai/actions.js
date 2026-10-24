export const AI_PLAN_VERSION = 1
export const AI_MAX_STEPS = 5

const ACTION_ID = /^[a-z][a-z0-9-]*(?:\.[A-Za-z0-9-]+)+$/
const ACTION_PERMISSIONS = new Set(['read', 'ui', 'write'])
const ARG_TYPES = new Set(['string', 'number', 'enum', 'boolean'])
const PUBLIC_SCHEMA_KEYS = new Set(['type', 'optional', 'minLength', 'maxLength', 'min', 'max', 'integer', 'values'])

function fail(code, message, path = '') {
  return { ok: false, error: { code, path, message } }
}

function isRecord(value) {
  return !!value && typeof value === 'object' && !Array.isArray(value)
}

// 只供严格计划校验内部使用。未知动作没有本地权限记录，不能被当成安全只读动作。
function containsWriteAction(steps, registry) {
  return (Array.isArray(steps) ? steps : []).some((step) => {
    const record = registry?.get(String(step?.action || ''))
    return record?.permission === 'write'
  })
}

function resolveValues(spec, context) {
  const raw = typeof spec.values === 'function' ? spec.values(context) : spec.values
  if (!Array.isArray(raw)) return []
  return [...new Set(raw.filter((value) => typeof value === 'string').map((value) => value.slice(0, 120)))]
}

function resolvePublicSchema(schema, context) {
  const output = {}
  for (const [key, rawSpec] of Object.entries(schema || {})) {
    const spec = isRecord(rawSpec) ? rawSpec : { type: String(rawSpec || 'string') }
    const publicSpec = {}
    for (const name of PUBLIC_SCHEMA_KEYS) {
      if (name === 'values' || spec[name] === undefined) continue
      publicSpec[name] = spec[name]
    }
    if (spec.values !== undefined) {
      try {
        publicSpec.values = resolveValues(spec, context)
      } catch {
        publicSpec.values = []
      }
    }
    output[key] = publicSpec
  }
  return output
}

function validateSchema(value, schema, context) {
  if (!isRecord(value)) return fail('args.invalid', '动作参数必须是对象', 'args')
  const entries = Object.entries(schema || {})
  const known = new Set(entries.map(([key]) => key))
  for (const key of Object.keys(value)) {
    if (!known.has(key)) return fail('args.unknown-field', `未知参数：${key}`, `args.${key}`)
  }
  const output = {}
  for (const [key, rawSpec] of entries) {
    const spec = isRecord(rawSpec) ? rawSpec : { type: String(rawSpec || 'string') }
    const present = Object.prototype.hasOwnProperty.call(value, key)
    if (!present) {
      if (spec.optional) continue
      return fail('args.missing', `缺少参数：${key}`, `args.${key}`)
    }
    const current = value[key]
    const type = String(spec.type || '')
    if (!ARG_TYPES.has(type)) return fail('schema.type', `不支持参数类型：${type}`, `args.${key}`)
    if (type === 'string') {
      if (typeof current !== 'string') return fail('args.type', `${key} 必须是字符串`, `args.${key}`)
      if (/[\u0000-\u0008\u000b\u000c\u000e-\u001f\u007f]/.test(current)) return fail('args.control-character', `${key} 包含控制字符`, `args.${key}`)
      if (spec.minLength != null && current.length < Number(spec.minLength)) return fail('args.min-length', `${key} 太短`, `args.${key}`)
      if (spec.maxLength != null && current.length > Number(spec.maxLength)) return fail('args.max-length', `${key} 太长`, `args.${key}`)
    } else if (type === 'number') {
      if (typeof current !== 'number' || !Number.isFinite(current)) return fail('args.type', `${key} 必须是有限数字`, `args.${key}`)
      if (spec.integer && !Number.isInteger(current)) return fail('args.integer', `${key} 必须是整数`, `args.${key}`)
      if (spec.min != null && current < Number(spec.min)) return fail('args.min', `${key} 小于最小值`, `args.${key}`)
      if (spec.max != null && current > Number(spec.max)) return fail('args.max', `${key} 大于最大值`, `args.${key}`)
    } else if (type === 'boolean') {
      if (typeof current !== 'boolean') return fail('args.type', `${key} 必须是布尔值`, `args.${key}`)
    } else {
      if (typeof current !== 'string') return fail('args.type', `${key} 必须是枚举值`, `args.${key}`)
      let values
      try {
        values = resolveValues(spec, context)
      } catch {
        return fail('schema.values-unavailable', `${key} 的允许值暂不可用`, `args.${key}`)
      }
      if (!values.includes(current)) return fail('args.enum', `${key} 不在允许值内`, `args.${key}`)
    }
    output[key] = current
  }
  return { ok: true, value: output }
}

function normalizeCustomError(error) {
  if (!error) return null
  if (error.error?.code) return error.error
  if (error.code) return { code: String(error.code), path: String(error.path || ''), message: String(error.message || error.code) }
  return { code: 'args.custom', path: '', message: String(error.message || error) }
}

function assertSerializable(value, seen = new WeakSet()) {
  if (value === null) return
  const type = typeof value
  if (type === 'string' || type === 'number' || type === 'boolean') {
    if (type === 'number' && !Number.isFinite(value)) throw new Error('result.not-serializable')
    return
  }
  if (type === 'undefined' || type === 'function' || type === 'symbol' || type === 'bigint') {
    throw new Error('result.not-serializable')
  }
  if (type !== 'object') throw new Error('result.not-serializable')
  if (seen.has(value)) throw new Error('result.not-serializable')
  seen.add(value)
  if (Array.isArray(value)) {
    for (const item of value) assertSerializable(item, seen)
  } else {
    for (const [key, item] of Object.entries(value)) {
      if (typeof key !== 'string') throw new Error('result.not-serializable')
      assertSerializable(item, seen)
    }
  }
  seen.delete(value)
}

export class ActionRegistry {
  constructor({ broker = null } = {}) {
    this._actions = new Map()
    this.broker = broker
  }

  attachBroker(broker) {
    this.broker = broker || null
    if (this.broker) {
      for (const record of this._actions.values()) this._attachBroker(record)
    }
    return this.broker
  }

  _attachBroker(record) {
    if (!this.broker || record._brokerOff) return
    try {
      record._brokerOff = this.broker.register(record.id, {
        schema: (args, context) => {
          const result = validateSchema(args || {}, record.args || {}, context || {})
          if (!result.ok) return false
          try { return !record.validateArgs || !normalizeCustomError(record.validateArgs(result.value, context || {})) } catch { return false }
        },
        targetScope: () => true,
        execute: (args, context) => {
          this._requireProvider(record)
          return record.execute(args, context)
        },
        check: typeof record.check === 'function' ? (receipt, context) => record.check(receipt, context) : undefined,
      })
    } catch {
      record._brokerOff = null
    }
  }

  register(spec, owner = '__core', ownerContext = null) {
    if (!isRecord(spec) || !ACTION_ID.test(String(spec.id || ''))) throw new Error('action.invalid-id')
    if (!Number.isInteger(spec.version) || spec.version < 1) throw new Error('action.invalid-version')
    if (!ACTION_PERMISSIONS.has(spec.permission)) throw new Error('action.invalid-permission')
    if (typeof spec.execute !== 'function' || typeof spec.preview !== 'function') throw new Error('action.missing-handler')
    if (spec.terminal != null && typeof spec.terminal !== 'boolean') throw new Error('action.invalid-terminal')
    if (this._actions.has(spec.id)) throw new Error(`action.duplicate:${spec.id}`)
    const record = {
      ...spec,
      id: String(spec.id),
      label: String(spec.label || spec.id),
      description: String(spec.description || ''),
      owner: String(owner || '__core'),
      ownerContext,
      order: Number.isFinite(Number(spec.order)) ? Number(spec.order) : 100,
    }
    this._actions.set(record.id, record)
    this._attachBroker(record)
    return () => {
      if (this._actions.get(record.id) === record) this._actions.delete(record.id)
      record._brokerOff?.()
      record._brokerOff = null
    }
  }

  _requireProvider(record) {
    if (!record?.ownerContext?.require) return
    record.ownerContext.require(record.permission, `执行 AI 动作 ${record.id}`)
  }

  dispose(owner) {
    for (const [id, record] of this._actions) {
      if (record.owner === owner) {
        this._actions.delete(id)
        record._brokerOff?.()
        record._brokerOff = null
      }
    }
  }

  _available(record, context) {
    if (record.pages && !record.pages.includes(context.route?.type)) return false
    if (typeof record.available !== 'function') return true
    try {
      return record.available(context) !== false
    } catch {
      return false
    }
  }

  actions(context = {}) {
    return [...this._actions.values()]
      .filter((record) => this._available(record, context))
      .sort((a, b) => a.order - b.order || a.label.localeCompare(b.label))
      .map((record) => ({
        id: record.id,
        version: record.version,
        label: record.label,
        description: record.description,
        permission: record.permission,
        terminal: Boolean(record.terminal),
        pages: record.pages ? [...record.pages] : null,
        args: resolvePublicSchema(record.args || {}, context),
      }))
  }

  describe(context = {}) {
    return this.actions(context)
  }

  validate(step, context = {}, { requireActionBinding = false, allowActionBinding = false } = {}) {
    if (!isRecord(step)) return fail('step.invalid', '步骤必须是对象', 'step')
    if (Object.keys(step).some((key) => !['action', 'args', 'actionVersion', 'actionProvider'].includes(key))) {
      return fail('step.unknown-field', '步骤包含未知字段', 'step')
    }
    if (typeof step.action !== 'string') return fail('action.invalid', '动作 ID 必须是字符串', 'action')
    const record = this._actions.get(step.action)
    if (!record) return fail('action.unknown', `未知动作：${step.action}`, 'action')
    const hasVersion = Object.prototype.hasOwnProperty.call(step, 'actionVersion')
    const hasProvider = Object.prototype.hasOwnProperty.call(step, 'actionProvider')
    if ((hasVersion || hasProvider) && !allowActionBinding && !requireActionBinding) {
      return fail('step.unknown-field', '模型步骤不能声明本地动作绑定', hasVersion ? 'actionVersion' : 'actionProvider')
    }
    if (requireActionBinding && (!hasVersion || !hasProvider)) {
      return fail('action.binding-required', '待执行步骤缺少本地动作绑定', 'actionVersion')
    }
    if (hasVersion && (!Number.isInteger(step.actionVersion) || step.actionVersion !== record.version)) {
      return fail('action.version-mismatch', '动作版本已变化，请重新生成计划', 'actionVersion')
    }
    if (hasProvider && (typeof step.actionProvider !== 'string' || step.actionProvider !== record.owner)) {
      return fail('action.provider-mismatch', '动作提供方已变化，请重新生成计划', 'actionProvider')
    }
    if (!this._available(record, context)) return fail('action.unavailable', '此动作不适用于当前页面', 'action')
    const args = validateSchema(step.args || {}, record.args || {}, context)
    if (!args.ok) return args
    try {
      const custom = normalizeCustomError(record.validateArgs?.(args.value, context))
      if (custom) return { ok: false, error: custom }
    } catch (error) {
      return fail('args.custom', error.message || '动作参数校验失败', 'args')
    }
    return { ok: true, action: record, args: args.value }
  }

  validatePlan(plan, context = {}, options = {}) {
    if (!isRecord(plan)) return { ok: false, errors: [fail('plan.invalid', '计划必须是对象', 'plan').error] }
    const errors = []
    if (Object.keys(plan).some((key) => !['version', 'summary', 'steps'].includes(key))) {
      errors.push(fail('plan.unknown-field', '计划包含未知字段', 'plan').error)
    }
    if (plan.version !== AI_PLAN_VERSION) errors.push(fail('plan.version', '计划版本不支持', 'version').error)
    if (typeof plan.summary !== 'string' || plan.summary.length > 240) errors.push(fail('plan.summary', '计划摘要长度不合法', 'summary').error)
    if (!Array.isArray(plan.steps) || plan.steps.length < 1 || plan.steps.length > AI_MAX_STEPS) {
      errors.push(fail('plan.steps', '计划步骤数必须为 1 到 5', 'steps').error)
    }
    const steps = []
    for (let index = 0; index < (Array.isArray(plan.steps) ? plan.steps.length : 0); index++) {
      const result = this.validate(plan.steps[index], context, options)
      if (!result.ok) errors.push({ ...result.error, path: `steps[${index}]${result.error.path ? `.${result.error.path}` : ''}` })
      else {
        if (result.action.terminal && index < plan.steps.length - 1) {
          errors.push(fail('plan.terminal-not-last', '会离开当前页面的动作必须位于计划末尾', `steps[${index}]`).error)
        }
        steps.push({
          action: plan.steps[index].action,
          args: result.args,
          actionVersion: result.action.version,
          actionProvider: result.action.owner,
        })
      }
    }
    const writeActions = containsWriteAction(steps, this._actions) ? 1 : 0
    if (writeActions > 0 && plan.steps.length !== 1) {
      errors.push(fail('plan.write-isolation', '写操作必须单独组成一个计划', 'steps').error)
    }
    if (errors.length) return { ok: false, errors }
    return { ok: true, plan: { version: AI_PLAN_VERSION, summary: plan.summary, steps }, steps }
  }

  preview(step, context = {}) {
    const result = this.validate(step, context, { allowActionBinding: true })
    if (!result.ok) return result
    try {
      const text = String(result.action.preview(result.args, context) || '').trim()
      if (!text || text.length > 240) return fail('preview.invalid', '预览文案长度不合法', 'preview')
      return { ok: true, text }
    } catch (error) {
      return fail('preview.error', error.message || '预览生成失败', 'preview')
    }
  }

  async execute(step, context = {}) {
    const result = this.validate(step, context, { allowActionBinding: true })
    if (!result.ok) throw new Error(result.error.code)
    this._requireProvider(result.action)
    const value = await result.action.execute(result.args, context)
    if (value === undefined || typeof value === 'function') throw new Error('result.invalid')
    assertSerializable(value)
    return value
  }
}
