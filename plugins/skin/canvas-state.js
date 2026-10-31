export const CANVAS_STATE_VERSION = 2
export const CANVAS_STATE_KEY = 'canvas-state:v2'
export const CANVAS_WIDTH_CLASSES = ['wide', 'mid', 'narrow']

export const CANVAS_DEFAULT_APPEARANCE = Object.freeze({
  background: 'static', backgroundVideoUrl: '', backgroundVideoLocalKey: '', backgroundImageUrl: '', backgroundImageLocalKey: '',
  opacity: 0.72, blur: 18, fontFamily: '', fontUrl: '', fontLocalKey: '',
  fontSize: 14, textColor: '', panelColor: '', accentColor: '', radius: 16,
  motion: 'auto', transparency: 'auto',
})
export const CANVAS_DEFAULT_SURFACES = Object.freeze({
  // @LSB_DEV_AI_START
  aiCard: { width: 420, height: 560 },
  // @LSB_DEV_AI_END
  siteCard: { width: 360, height: 560 }, evidenceCard: { width: 420, height: 320 },
})

export function canvasFinite(value, fallback = 0) {
  const n = Number(value)
  return Number.isFinite(n) ? n : fallback
}

export function canvasCopy(value) {
  if (value === null || typeof value !== 'object') return value
  if (Array.isArray(value)) return value.map(canvasCopy)
  const out = {}
  for (const [key, item] of Object.entries(value)) out[key] = canvasCopy(item)
  return out
}

export function canvasMerge(left, right) {
  const a = left && typeof left === 'object' ? left : {}
  const b = right && typeof right === 'object' ? right : {}
  const out = canvasCopy(a)
  for (const [key, value] of Object.entries(b)) {
    if (value && typeof value === 'object' && !Array.isArray(value) && a[key] && typeof a[key] === 'object' && !Array.isArray(a[key])) out[key] = canvasMerge(a[key], value)
    else out[key] = canvasCopy(value)
  }
  return out
}

export function widthClass(width) {
  const n = canvasFinite(width, 0)
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
      appearance: canvasCopy(CANVAS_DEFAULT_APPEARANCE),
      surfaceDefaults: canvasCopy(CANVAS_DEFAULT_SURFACES),
      layout: { wide: {}, mid: {}, narrow: {} },
    },
    sites: {},
    legacyLayoutSnapshot: null,
  }
}

export function mergeCanvasState(globalState, siteOverride = {}) {
  const source = globalState && typeof globalState === 'object' ? globalState : {}
  const base = source.global && typeof source.global === 'object' ? source.global : source
  const overrideSource = siteOverride && typeof siteOverride === 'object' ? siteOverride : {}
  const override = overrideSource.global && typeof overrideSource.global === 'object' ? overrideSource.global : overrideSource
  const merged = canvasMerge(base, override)
  if (!merged.preset) merged.preset = 'balanced-glass'
  merged.appearance = canvasMerge(CANVAS_DEFAULT_APPEARANCE, merged.appearance)
  merged.surfaceDefaults = canvasMerge(CANVAS_DEFAULT_SURFACES, merged.surfaceDefaults)
  merged.layout = canvasMerge({ wide: {}, mid: {}, narrow: {} }, merged.layout)
  return merged
}

export function clampSurfaceRect(rect = {}, viewport = {}, minimum = {}) {
  const vw = Math.max(1, Math.round(canvasFinite(viewport.width, 1)))
  const vh = Math.max(1, Math.round(canvasFinite(viewport.height, 1)))
  const minWidth = Math.max(1, Math.round(canvasFinite(minimum.width, 240)))
  const minHeight = Math.max(1, Math.round(canvasFinite(minimum.height, 160)))
  const width = Math.min(vw, Math.max(minWidth, Math.round(canvasFinite(rect.width, minWidth))))
  const height = Math.min(vh, Math.max(minHeight, Math.round(canvasFinite(rect.height, minHeight))))
  const x = Math.min(Math.max(0, Math.round(canvasFinite(rect.x, 0))), Math.max(0, vw - width))
  const y = Math.min(Math.max(0, Math.round(canvasFinite(rect.y, 0))), Math.max(0, vh - height))
  return { x, y, width, height }
}

export function migrateLegacySkinState(rawConfig = {}, mediaMeta = {}) {
  const raw = rawConfig && typeof rawConfig === 'object' ? rawConfig : {}
  const next = defaultCanvasState()
  next.enabled = raw.shell !== false
  const appearance = {}
  for (const [source, target] of [['backgroundVideoUrl', 'backgroundVideoUrl'], ['backgroundVideoLocalKey', 'backgroundVideoLocalKey'], ['backgroundImageUrl', 'backgroundImageUrl'], ['backgroundImageLocalKey', 'backgroundImageLocalKey'], ['fontUrl', 'fontUrl'], ['fontLocalKey', 'fontLocalKey'], ['fontFamily', 'fontFamily'], ['textColor', 'textColor'], ['panelColor', 'panelColor'], ['accentColor', 'accentColor']]) {
    if (raw[source]) appearance[target] = String(raw[source])
  }
  if (raw.baseFontSize != null) appearance.fontSize = canvasFinite(raw.baseFontSize, 14)
  if (raw.glassOpacity != null) appearance.opacity = canvasFinite(raw.glassOpacity, 0.72)
  if (raw.glassBlur != null) appearance.blur = canvasFinite(raw.glassBlur, 18)
  if (raw.backgroundVideoEnabled === true) appearance.background = 'video'
  else if (raw.backgroundImageUrl || raw.backgroundImageLocalKey) appearance.background = 'image'
  if (Object.keys(appearance).length) next.global.appearance = canvasMerge(next.global.appearance, appearance)
  if (mediaMeta && typeof mediaMeta === 'object') next.global.appearance = canvasMerge(next.global.appearance, {
    ...(mediaMeta.videoId || mediaMeta.videoKey ? { backgroundVideoLocalKey: mediaMeta.videoId || mediaMeta.videoKey } : {}),
    ...(mediaMeta.fontId || mediaMeta.fontKey ? { fontLocalKey: mediaMeta.fontId || mediaMeta.fontKey } : {}),
  })
  next.legacyLayoutSnapshot = {
    version: 1, shell: raw.shell, layoutMode: raw.layoutMode, header: raw.header, rail: raw.rail, aside: raw.aside,
    wallpaperUrl: raw.wallpaperUrl, backgroundVideoUrl: raw.backgroundVideoUrl, backgroundVideoLocalKey: raw.backgroundVideoLocalKey,
    backgroundImageUrl: raw.backgroundImageUrl, backgroundImageLocalKey: raw.backgroundImageLocalKey,
    fontFamily: raw.fontFamily, fontUrl: raw.fontUrl, fontLocalKey: raw.fontLocalKey, glassOpacity: raw.glassOpacity, glassBlur: raw.glassBlur,
  }
  return next
}

export function resolveSurfaceMode(widthValue, surfaceKind = '') {
  const bucket = CANVAS_WIDTH_CLASSES.includes(widthValue) ? widthValue : 'wide'
  const kind = String(surfaceKind || '')
  if (kind === 'top-status' || kind === 'tool-capsule') return 'fixed'
  if (bucket === 'wide') {
    if (kind === 'site-card') return 'rail'
    return kind.endsWith('sheet') ? 'sheet' : 'floating'
  }
  return bucket === 'mid' ? 'sheet' : 'fullscreen'
}
