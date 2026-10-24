/** 受限的氢壳令牌模型；不接受任意 CSS 文本。 */

const COLOR_RE = /^(?:#[0-9a-f]{3,8}|(?:rgb|hsl)a?\(\s*[\d.%\s,+-]+\))$/i
const FONT_RE = /^(?=[^;\r\n]*[\p{L}\p{N}])[\p{L}\p{N}\s"'_,.+-]{1,160}$/u
const DENSITIES = new Set(['舒适', '紧凑'])

export const TOKEN_SCHEMA = Object.freeze({
  baseFontSize: { css: '--lsb-shell-font-size', kind: 'length', min: 12, max: 32 },
  fontFamily: { css: '--lsb-shell-font-family', kind: 'font' },
  textColor: { css: '--lsb-shell-text', kind: 'color' },
  panelColor: { css: '--lsb-shell-panel', kind: 'color' },
  accentColor: { css: '--lsb-shell-accent', kind: 'color' },
  glassOpacity: { css: '--lsb-shell-glass-opacity', kind: 'number', min: 0.35, max: 1 },
  glassBlur: { css: '--lsb-shell-glass-blur', kind: 'length', min: 0, max: 32 },
  density: { css: '--lsb-shell-density', kind: 'density' },
})

function number(value) {
  const n = Number(value)
  return Number.isFinite(n) ? n : null
}

function clamp(value, min, max) {
  return Math.min(Math.max(value, min), max)
}

function cleanString(value, max = 160) {
  const text = String(value ?? '').trim()
  return text && text.length <= max ? text : null
}

export function sanitizeTokenValue(name, value) {
  const spec = TOKEN_SCHEMA[name]
  if (!spec || value == null || value === '') return null
  if (spec.kind === 'length') {
    const parsed = number(String(value).replace(/px$/i, ''))
    return parsed == null ? null : `${Math.round(clamp(parsed, spec.min, spec.max) * 10) / 10}px`
  }
  if (spec.kind === 'number') {
    const parsed = number(value)
    return parsed == null ? null : String(Math.round(clamp(parsed, spec.min, spec.max) * 100) / 100)
  }
  if (spec.kind === 'color') {
    const text = cleanString(value, 80)
    return text && COLOR_RE.test(text) ? text : null
  }
  if (spec.kind === 'font') {
    const text = cleanString(value)
    return text && FONT_RE.test(text) && !/(?:url|expression|var\s*\()/i.test(text) ? text : null
  }
  if (spec.kind === 'density') {
    const text = String(value)
    return DENSITIES.has(text) ? text : null
  }
  return null
}

export function mergeShellTokens(globalTokens = {}, overrides = {}) {
  const result = {}
  for (const name of Object.keys(TOKEN_SCHEMA)) {
    const local = sanitizeTokenValue(name, overrides?.[name])
    const global = sanitizeTokenValue(name, globalTokens?.[name])
    result[name] = local ?? global ?? null
  }
  return result
}

export function tokenCss(tokens = {}) {
  const declarations = []
  for (const [name, spec] of Object.entries(TOKEN_SCHEMA)) {
    const value = sanitizeTokenValue(name, tokens?.[name])
    if (value == null) continue
    declarations.push(`${spec.css}:${value}`)
  }
  return declarations.join(';')
}

export function moduleInspectorModel(layout = {}, id = '') {
  const state = layout?.windows?.[id] && typeof layout.windows[id] === 'object'
    ? layout.windows[id]
    : {}
  const overrides = state.overrides && typeof state.overrides === 'object' ? state.overrides : {}
  const values = {}
  const inherited = {}
  for (const name of Object.keys(TOKEN_SCHEMA)) {
    const value = sanitizeTokenValue(name, overrides[name])
    values[name] = value
    inherited[name] = value == null
  }
  return {
    id: String(id || ''),
    values,
    inherited,
    visible: state.visible !== false,
    collapsed: state.collapsed === true,
    rect: {
      x: Number(state.x) || 0,
      y: Number(state.y) || 0,
      width: Number(state.width) || 0,
      height: Number(state.height) || 0,
    },
  }
}

