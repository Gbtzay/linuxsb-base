/** 基础工具：无依赖，可在 jsdom / 浏览器 / node 下运行 */

export const noop = () => {}

export function isPlainObject(v) {
  return Object.prototype.toString.call(v) === '[object Object]'
}

export function sleep(ms) {
  return new Promise((r) => setTimeout(r, ms))
}

/** 结构化深拷贝，跨插件传数据时切断引用，防止 A 改到 B 的对象 */
export function clone(v) {
  if (v === null || typeof v !== 'object') return v
  if (typeof structuredClone === 'function') {
    try {
      return structuredClone(v)
    } catch {
      /* DOM 节点等不可克隆对象，退回原值 */
      return v
    }
  }
  try {
    return JSON.parse(JSON.stringify(v))
  } catch {
    return v
  }
}

export function deepFreeze(v) {
  if (v && typeof v === 'object' && !Object.isFrozen(v)) {
    Object.freeze(v)
    for (const k of Object.getOwnPropertyNames(v)) deepFreeze(v[k])
  }
  return v
}

/* ───────────── semver（只支持 x.y.z 与 ^ ~ >= > <= < = 范围） ───────────── */

export function parseVersion(v) {
  const m = String(v || '').trim().match(/^v?(\d+)\.(\d+)\.(\d+)(?:[-+].*)?$/)
  if (!m) return null
  return [Number(m[1]), Number(m[2]), Number(m[3])]
}

export function compareVersion(a, b) {
  const pa = parseVersion(a) || [0, 0, 0]
  const pb = parseVersion(b) || [0, 0, 0]
  for (let i = 0; i < 3; i++) {
    if (pa[i] !== pb[i]) return pa[i] < pb[i] ? -1 : 1
  }
  return 0
}

/** satisfies('1.2.3', '^1.1.0') → true */
export function satisfies(version, range) {
  const r = String(range || '*').trim()
  if (!r || r === '*' || r === 'latest') return true
  const v = parseVersion(version)
  if (!v) return false
  for (const part of r.split('||')) {
    if (part.split(/\s+/).filter(Boolean).every((c) => satisfiesOne(v, c))) return true
  }
  return false
}

function satisfiesOne(v, comparator) {
  const m = comparator.match(/^(\^|~|>=|<=|>|<|=)?\s*v?(\d+)(?:\.(\d+))?(?:\.(\d+))?/)
  if (!m) return false
  const op = m[1] || '='
  const t = [Number(m[2]), m[3] === undefined ? 0 : Number(m[3]), m[4] === undefined ? 0 : Number(m[4])]
  const cmp = cmpArr(v, t)
  switch (op) {
    case '=':
      return cmp === 0
    case '>':
      return cmp > 0
    case '>=':
      return cmp >= 0
    case '<':
      return cmp < 0
    case '<=':
      return cmp <= 0
    case '^':
      // ^1.2.3 → >=1.2.3 <2.0.0；^0.2.3 → >=0.2.3 <0.3.0
      if (cmp < 0) return false
      return t[0] === 0 ? v[0] === 0 && v[1] === t[1] : v[0] === t[0]
    case '~':
      if (cmp < 0) return false
      return v[0] === t[0] && v[1] === t[1]
    default:
      return false
  }
}

function cmpArr(a, b) {
  for (let i = 0; i < 3; i++) if (a[i] !== b[i]) return a[i] < b[i] ? -1 : 1
  return 0
}

/* ───────────── 其它 ───────────── */

export function num(s) {
  const m = String(s ?? '').replace(/[,\s]/g, '').match(/-?\d+/)
  return m ? Number(m[0]) : 0
}

export function text(el) {
  return el ? String(el.textContent || '').replace(/\s+/g, ' ').trim() : ''
}

export function idFrom(href, prefix) {
  const m = String(href || '').match(new RegExp(`/${prefix}/(\\d+)`))
  return m ? Number(m[1]) : null
}

export function uid(prefix = 'lsb') {
  return `${prefix}-${Math.random().toString(36).slice(2, 9)}`
}

export function throttle(fn, wait) {
  let last = 0
  let timer = null
  let pending = null
  return function throttled(...args) {
    pending = args
    const now = Date.now()
    const rest = wait - (now - last)
    if (rest <= 0) {
      last = now
      fn.apply(this, pending)
    } else if (!timer) {
      timer = setTimeout(() => {
        timer = null
        last = Date.now()
        fn.apply(this, pending)
      }, rest)
    }
  }
}

/** 简易 HTML 转义，UI 层拼串时必须用它，避免站内昵称/标题里的尖括号注入。
 *  反引号一并转义：拼串场景里它可能落进未加引号的属性值或模板上下文。 */
export function esc(s) {
  return String(s ?? '').replace(/[&<>"'`]/g, (c) => ({
    '&': '&amp;',
    '<': '&lt;',
    '>': '&gt;',
    '"': '&quot;',
    "'": '&#39;',
    '`': '&#96;',
  }[c]))
}
