/**
 * 单一阅读画布的纯状态函数。
 *
 * 这里不读取 window/document，也不写入存储，方便皮肤插件和 Node 测试
 * 使用同一套边界、合并与迁移规则。
 */

export const CANVAS_STATE_VERSION = 2

const WIDTH_CLASSES = Object.freeze(['wide', 'mid', 'narrow'])

const DEFAULT_APPEARANCE = Object.freeze({
  background: 'static',
  backgroundVideoUrl: '',
  backgroundVideoLocalKey: '',
  backgroundImageUrl: '',
  backgroundImageLocalKey: '',
  opacity: 0.72,
  blur: 18,
  fontFamily: '',
  fontUrl: '',
  fontLocalKey: '',
  fontSize: 14,
  textColor: '',
  panelColor: '',
  accentColor: '',
  radius: 16,
  motion: 'auto',
  transparency: 'auto',
})

const DEFAULT_SURFACE_DEFAULTS = Object.freeze({
  aiCard: { width: 420, height: 560 },
  siteCard: { width: 360, height: 560 },
  evidenceCard: { width: 420, height: 320 },
})

function finite(value, fallback = 0) {
  const n = Number(value)
  return Number.isFinite(n) ? n : fallback
}

function copy(value) {
  if (value === null || typeof value !== 'object') return value
  if (Array.isArray(value)) return value.map(copy)
  const out = {}
  for (const [key, item] of Object.entries(value)) out[key] = copy(item)
  return out
}

function merge(a, b) {
  const left = a && typeof a === 'object' ? a : {}
  const right = b && typeof b === 'object' ? b : {}
  const out = { ...copy(left) }
  for (const [key, value] of Object.entries(right)) {
    if (value && typeof value === 'object' && !Array.isArray(value) && left[key] && typeof left[key] === 'object' && !Array.isArray(left[key])) {
      out[key] = merge(left[key], value)
    } else {
      out[key] = copy(value)
    }
  }
  return out
}

export function widthClass(width) {
  const n = finite(width, 0)
  return n >= 1100 ? 'wide' : n >= 700 ? 'mid' : 'narrow'
}

export function siteKeyFromLocation(locationLike) {
  try {
    const url = locationLike instanceof URL
      ? locationLike
      : new URL(String(locationLike?.href || locationLike || ''), 'https://linux.sb/')
    return url.origin
  } catch {
    return ''
  }
}

export function defaultCanvasState() {
  return {
    version: CANVAS_STATE_VERSION,
    enabled: true,
    global: {
      preset: 'balanced-glass',
      appearance: copy(DEFAULT_APPEARANCE),
      surfaceDefaults: copy(DEFAULT_SURFACE_DEFAULTS),
      layout: { wide: {}, mid: {}, narrow: {} },
    },
    sites: {},
    legacyLayoutSnapshot: null,
  }
}

/**
 * 返回给当前页面使用的 immutable effective state。
 * 既接受完整 canvasState，也接受一个 global/effective 对象作为基底。
 */
export function mergeCanvasState(globalState, siteOverride = {}) {
  const source = globalState && typeof globalState === 'object' ? globalState : {}
  const base = source.global && typeof source.global === 'object' ? source.global : source
  const override = siteOverride && typeof siteOverride === 'object'
    ? (siteOverride.global && typeof siteOverride.global === 'object' ? siteOverride.global : siteOverride)
    : {}
  const merged = merge(base, override)
  if (!merged.preset) merged.preset = 'balanced-glass'
  merged.appearance = merge(DEFAULT_APPEARANCE, merged.appearance)
  merged.surfaceDefaults = merge(DEFAULT_SURFACE_DEFAULTS, merged.surfaceDefaults)
  merged.layout = merge({ wide: {}, mid: {}, narrow: {} }, merged.layout)
  return merged
}

export function clampSurfaceRect(rect = {}, viewport = {}, minimum = {}) {
  const vw = Math.max(1, Math.round(finite(viewport.width, 1)))
  const vh = Math.max(1, Math.round(finite(viewport.height, 1)))
  const minWidth = Math.max(1, Math.round(finite(minimum.width, 240)))
  const minHeight = Math.max(1, Math.round(finite(minimum.height, 160)))
  const width = Math.min(vw, Math.max(minWidth, Math.round(finite(rect.width, minWidth))))
  const height = Math.min(vh, Math.max(minHeight, Math.round(finite(rect.height, minHeight))))
  const x = Math.min(Math.max(0, Math.round(finite(rect.x, 0))), Math.max(0, vw - width))
  const y = Math.min(Math.max(0, Math.round(finite(rect.y, 0))), Math.max(0, vh - height))
  return { x, y, width, height }
}

export function migrateLegacySkinState(rawConfig = {}, mediaMeta = {}) {
  const raw = rawConfig && typeof rawConfig === 'object' ? rawConfig : {}
  const next = defaultCanvasState()
  next.enabled = raw.shell !== false
  const appearance = {}
  if (raw.backgroundVideoUrl) appearance.backgroundVideoUrl = String(raw.backgroundVideoUrl)
  if (raw.backgroundVideoLocalKey) appearance.backgroundVideoLocalKey = String(raw.backgroundVideoLocalKey)
  if (raw.backgroundImageUrl) appearance.backgroundImageUrl = String(raw.backgroundImageUrl)
  if (raw.backgroundImageLocalKey) appearance.backgroundImageLocalKey = String(raw.backgroundImageLocalKey)
  if (raw.fontUrl) appearance.fontUrl = String(raw.fontUrl)
  if (raw.fontLocalKey) appearance.fontLocalKey = String(raw.fontLocalKey)
  if (raw.fontFamily) appearance.fontFamily = String(raw.fontFamily)
  if (raw.baseFontSize != null) appearance.fontSize = finite(raw.baseFontSize, 14)
  if (raw.glassOpacity != null) appearance.opacity = finite(raw.glassOpacity, 0.72)
  if (raw.glassBlur != null) appearance.blur = finite(raw.glassBlur, 18)
  if (raw.textColor) appearance.textColor = String(raw.textColor)
  if (raw.panelColor) appearance.panelColor = String(raw.panelColor)
  if (raw.accentColor) appearance.accentColor = String(raw.accentColor)
  if (raw.backgroundVideoEnabled === true) appearance.background = 'video'
  else if (raw.backgroundImageUrl || raw.backgroundImageLocalKey) appearance.background = 'image'
  if (Object.keys(appearance).length) next.global.appearance = merge(next.global.appearance, appearance)
  if (mediaMeta && typeof mediaMeta === 'object') {
    next.global.appearance = merge(next.global.appearance, {
      ...(mediaMeta.videoId || mediaMeta.videoKey ? { backgroundVideoLocalKey: mediaMeta.videoId || mediaMeta.videoKey } : {}),
      ...(mediaMeta.fontId || mediaMeta.fontKey ? { fontLocalKey: mediaMeta.fontId || mediaMeta.fontKey } : {}),
    })
  }
  next.legacyLayoutSnapshot = {
    version: 1,
    shell: raw.shell,
    layoutMode: raw.layoutMode,
    header: raw.header,
    rail: raw.rail,
    aside: raw.aside,
    wallpaperUrl: raw.wallpaperUrl,
    backgroundVideoUrl: raw.backgroundVideoUrl,
    backgroundVideoLocalKey: raw.backgroundVideoLocalKey,
    backgroundImageUrl: raw.backgroundImageUrl,
    backgroundImageLocalKey: raw.backgroundImageLocalKey,
    fontFamily: raw.fontFamily,
    fontUrl: raw.fontUrl,
    fontLocalKey: raw.fontLocalKey,
    glassOpacity: raw.glassOpacity,
    glassBlur: raw.glassBlur,
  }
  return next
}

export function resolveSurfaceMode(widthClassValue, surfaceKind = '') {
  const bucket = WIDTH_CLASSES.includes(widthClassValue) ? widthClassValue : 'wide'
  const kind = String(surfaceKind || '')
  if (kind === 'top-status' || kind === 'tool-capsule') return 'fixed'
  if (bucket === 'wide') {
    if (kind === 'site-card') return 'rail'
    return kind.endsWith('sheet') ? 'sheet' : 'floating'
  }
  return bucket === 'mid' ? 'sheet' : 'fullscreen'
}
