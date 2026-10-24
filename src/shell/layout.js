/**
 * 氢壳窗口布局的纯函数。
 *
 * 该模块不读取 window/document，也不负责存储。skin 负责把 viewport、
 * 注册窗口和 api.store 传入这里，从而可以在 node 与浏览器中使用同一套
 * 校验、迁移、吸附和整理规则。
 */

export const GRID = 12
export const SNAP_THRESHOLD = 12
export const WINDOW_LIMIT = 12
export const LAYOUT_VERSION = 1

const DEFAULT_MIN = Object.freeze({ width: 240, height: 160 })
const WORKSPACE_MARGIN = 12
const WORKSPACE_GAP = 12
// Leave a small vertical travel area so a freshly-created window can be
// dragged before the user resizes it.  The old three-column layout used the
// entire workspace height, which made vertical dragging appear broken.
const FREE_DRAG_SPACE = 96

function finite(value, fallback = 0) {
  const n = Number(value)
  return Number.isFinite(n) ? n : fallback
}

function positive(value, fallback) {
  const n = finite(value, fallback)
  return n > 0 ? n : fallback
}

function integer(value, fallback = 0) {
  return Math.round(finite(value, fallback))
}

function clamp(value, low, high) {
  return Math.min(Math.max(value, low), Math.max(low, high))
}

function copy(value) {
  if (value === null || typeof value !== 'object') return value
  if (Array.isArray(value)) return value.map(copy)
  const out = {}
  for (const [key, item] of Object.entries(value)) out[key] = copy(item)
  return out
}

function validId(id) {
  return /^[a-z][a-z0-9-]{0,63}$/.test(String(id || ''))
}

function normalizeViewport(viewport = {}) {
  return {
    width: Math.max(1, integer(viewport.width, 1)),
    height: Math.max(1, integer(viewport.height, 1)),
  }
}

function normalizeMin(item = {}) {
  const source = item.min || item.defaultRect || {}
  return {
    width: Math.max(1, integer(source.width, DEFAULT_MIN.width)),
    height: Math.max(1, integer(source.height, DEFAULT_MIN.height)),
  }
}

function normalizeRegistry(registry = []) {
  const seen = new Set()
  return (Array.isArray(registry) ? registry : [])
    .map((item, index) => {
      const id = String(item?.id || '')
      if (!validId(id) || seen.has(id)) return null
      seen.add(id)
      const defaultRect = item?.defaultRect || {}
      return {
        ...item,
        id,
        order: finite(item?.order, index),
        min: normalizeMin(item),
        defaultRect: {
          x: finite(defaultRect.x, 0),
          y: finite(defaultRect.y, 0),
          width: positive(defaultRect.width, normalizeMin(item).width),
          height: positive(defaultRect.height, normalizeMin(item).height),
        },
      }
    })
    .filter(Boolean)
    .sort((a, b) => a.order - b.order || a.id.localeCompare(b.id))
    .slice(0, WINDOW_LIMIT)
}

function boundsFor(viewport) {
  const size = normalizeViewport(viewport)
  return { x: 0, y: 0, width: size.width, height: size.height }
}

function preferredWindowHeight(item, bounds) {
  const min = normalizeMin(item).height
  const configured = positive(item?.defaultRect?.height, bounds.height)
  const available = Math.max(min, bounds.height - WORKSPACE_MARGIN * 2 - FREE_DRAG_SPACE)
  return clamp(configured, min, available)
}

function rectFrom(raw, item, bounds) {
  const min = item?.min || DEFAULT_MIN
  const source = raw || item?.defaultRect || {}
  const width = clamp(
    integer(source.width, item?.defaultRect?.width || min.width),
    min.width,
    bounds.width,
  )
  const height = clamp(
    integer(source.height, item?.defaultRect?.height || min.height),
    min.height,
    bounds.height,
  )
  return {
    x: clamp(integer(source.x, item?.defaultRect?.x || 0), bounds.x, bounds.x + bounds.width - width),
    y: clamp(integer(source.y, item?.defaultRect?.y || 0), bounds.y, bounds.y + bounds.height - height),
    width,
    height,
  }
}

function windowState(raw, item, bounds) {
  const source = raw && typeof raw === 'object' ? raw : {}
  return {
    ...rectFrom(source, item, bounds),
    visible: source.visible !== false,
    collapsed: source.collapsed === true,
    overrides: source.overrides && typeof source.overrides === 'object' ? copy(source.overrides) : {},
  }
}

export function widthBucket(width) {
  const n = finite(width)
  return n >= 1100 ? 'wide' : n >= 700 ? 'medium' : 'narrow'
}

export function layoutStorageKey(origin, bucket) {
  const safeBucket = bucket === 'wide' || bucket === 'medium' || bucket === 'narrow' ? bucket : widthBucket(0)
  return `layout:v${LAYOUT_VERSION}:${encodeURIComponent(String(origin || ''))}:${safeBucket}`
}

function arrangeRects(registry, viewport) {
  const bounds = boundsFor(viewport)
  const visible = registry.filter((item) => item.visible !== false)
  const result = {}
  if (!visible.length) return result

  const byId = new Map(visible.map((item) => [item.id, item]))
  const nav = byId.get('nav')
  const content = byId.get('content')
  const site = byId.get('site')
  const fallback = visible.filter((item) => !['nav', 'content', 'site'].includes(item.id))

  const navWidth = nav ? clamp(integer(nav.defaultRect.width, 240), nav.min.width, bounds.width) : 0
  const siteWidth = site ? clamp(integer(site.defaultRect.width, 280), site.min.width, bounds.width) : 0
  const fullHeight = Math.max(1, bounds.height - WORKSPACE_MARGIN * 2)
  const baseY = bounds.y + WORKSPACE_MARGIN
  const baseX = bounds.x + WORKSPACE_MARGIN
  const right = bounds.x + bounds.width - WORKSPACE_MARGIN

  if (nav) {
    result.nav = {
      x: baseX,
      y: baseY,
      width: navWidth,
      height: preferredWindowHeight(nav, bounds),
    }
  }

  const contentX = nav ? baseX + navWidth + WORKSPACE_GAP : baseX
  const siteX = site ? right - siteWidth : right
  const availableContentWidth = Math.max(
    content?.min.width || DEFAULT_MIN.width,
    site ? siteX - WORKSPACE_GAP - contentX : right - contentX,
  )
  if (content) {
    result.content = {
      x: contentX,
      y: baseY,
      width: Math.min(availableContentWidth, Math.max(content.min.width, site ? siteX - WORKSPACE_GAP - contentX : availableContentWidth)),
      height: preferredWindowHeight(content, bounds),
    }
  }
  if (site) {
    result.site = {
      x: siteX,
      y: baseY,
      width: siteWidth,
      height: preferredWindowHeight(site, bounds),
    }
  }

  let nextY = baseY + Math.min(fullHeight, 240) + WORKSPACE_GAP
  for (const item of fallback) {
    const width = clamp(integer(item.defaultRect.width, Math.min(360, bounds.width - WORKSPACE_MARGIN * 2)), item.min.width, bounds.width)
    const height = clamp(integer(item.defaultRect.height, 240), item.min.height, bounds.height)
    const x = clamp(integer(item.defaultRect.x, baseX), bounds.x, bounds.x + bounds.width - width)
    const y = clamp(integer(item.defaultRect.y, nextY), bounds.y, bounds.y + bounds.height - height)
    result[item.id] = { x, y, width, height }
    nextY = y + height + WORKSPACE_GAP
  }
  return result
}

export function defaultShellLayout({ width, height, registry = [] } = {}) {
  const viewport = normalizeViewport({ width, height })
  const normalized = normalizeRegistry(registry)
  const rects = arrangeRects(normalized, viewport)
  const windows = {}
  for (const item of normalized) {
    if (item.visible === false || !rects[item.id]) continue
    windows[item.id] = {
      ...rectFrom(rects[item.id], item, boundsFor(viewport)),
      visible: true,
      collapsed: false,
      overrides: {},
    }
  }
  return {
    version: LAYOUT_VERSION,
    viewport,
    windows,
    zOrder: Object.keys(windows),
    updatedAt: 0,
  }
}

export function sanitizeShellLayout(raw, { width, height, registry = [] } = {}) {
  const viewport = normalizeViewport({ width, height })
  const normalized = normalizeRegistry(registry)
  const byId = new Map(normalized.map((item) => [item.id, item]))
  const bounds = boundsFor(viewport)
  const windows = {}
  const sourceWindows = raw && typeof raw.windows === 'object' ? raw.windows : {}
  for (const [id, state] of Object.entries(sourceWindows)) {
    const item = byId.get(id)
    if (!item || item.visible === false) continue
    windows[id] = windowState(state, item, bounds)
  }
  const zOrder = []
  for (const id of Array.isArray(raw?.zOrder) ? raw.zOrder : []) {
    if (Object.prototype.hasOwnProperty.call(windows, id) && !zOrder.includes(id)) zOrder.push(id)
  }
  for (const id of Object.keys(windows)) if (!zOrder.includes(id) && windows[id].visible) zOrder.push(id)
  return {
    version: LAYOUT_VERSION,
    viewport,
    windows,
    zOrder,
    updatedAt: finite(raw?.updatedAt, 0),
    ...(raw?.compat && typeof raw.compat === 'object' ? { compat: copy(raw.compat) } : {}),
  }
}

export function arrangeShellWindows(layout, registry = [], viewport = {}) {
  const normalized = normalizeRegistry(registry)
  const size = normalizeViewport(viewport)
  const clean = sanitizeShellLayout(layout, { ...size, registry: normalized })
  const defaults = defaultShellLayout({ ...size, registry: normalized })
  const windows = {}
  for (const item of normalized) {
    const previous = clean.windows[item.id]
    const fallback = defaults.windows[item.id]
    if (!fallback) continue
    windows[item.id] = {
      ...fallback,
      ...(previous ? {
        visible: previous.visible,
        collapsed: previous.collapsed,
        overrides: copy(previous.overrides),
      } : {}),
    }
  }
  return {
    ...defaults,
    windows,
    zOrder: Object.keys(windows),
    updatedAt: clean.updatedAt,
  }
}

function snapValue(value, grid) {
  return Math.round(value / grid) * grid
}

function candidatesFor(value, candidates, threshold) {
  let best = value
  let distance = threshold + 1
  for (const candidate of candidates) {
    const d = Math.abs(candidate - value)
    if (d <= threshold && d < distance) {
      best = candidate
      distance = d
    }
  }
  return best
}

export function snapRect(rect, { bounds, others = [], grid = GRID, threshold = SNAP_THRESHOLD, min = DEFAULT_MIN } = {}) {
  const safeBounds = {
    x: finite(bounds?.x, 0),
    y: finite(bounds?.y, 0),
    width: Math.max(1, finite(bounds?.width, 1)),
    height: Math.max(1, finite(bounds?.height, 1)),
  }
  const width = clamp(integer(rect?.width, min.width), Math.max(1, integer(min.width, DEFAULT_MIN.width)), safeBounds.width)
  const height = clamp(integer(rect?.height, min.height), Math.max(1, integer(min.height, DEFAULT_MIN.height)), safeBounds.height)
  const rawX = snapValue(finite(rect?.x, safeBounds.x), grid)
  const rawY = snapValue(finite(rect?.y, safeBounds.y), grid)
  const xCandidates = [
    safeBounds.x,
    safeBounds.x + safeBounds.width - width,
  ]
  const yCandidates = [
    safeBounds.y,
    safeBounds.y + safeBounds.height - height,
  ]
  for (const other of Array.isArray(others) ? others : []) {
    if (!other || typeof other !== 'object') continue
    xCandidates.push(finite(other.x, 0) - width, finite(other.x, 0) + finite(other.width, 0))
    yCandidates.push(finite(other.y, 0) - height, finite(other.y, 0) + finite(other.height, 0))
  }
  const snappedXCandidates = xCandidates.map((candidate) => snapValue(candidate, grid))
  const snappedYCandidates = yCandidates.map((candidate) => snapValue(candidate, grid))
  const x = clamp(candidatesFor(rawX, snappedXCandidates, threshold), safeBounds.x, safeBounds.x + safeBounds.width - width)
  const y = clamp(candidatesFor(rawY, snappedYCandidates, threshold), safeBounds.y, safeBounds.y + safeBounds.height - height)
  return { x, y, width, height }
}

export function migrateLegacyShellLayout({ viewport = {}, legacy = {}, registry = [] } = {}) {
  const size = normalizeViewport(viewport)
  const normalized = normalizeRegistry(registry)
  const initial = defaultShellLayout({ ...size, registry: normalized })
  const bounds = boundsFor(size)
  const byId = new Map(normalized.map((item) => [item.id, item]))
  const rail = Math.max(0, finite(legacy.rail, 240))
  const aside = Math.max(0, finite(legacy.aside, 280))
  if (byId.has('nav')) {
    initial.windows.nav = {
      ...initial.windows.nav,
      ...rectFrom({
        x: WORKSPACE_MARGIN,
        y: WORKSPACE_MARGIN,
        width: rail,
        height: preferredWindowHeight(byId.get('nav'), bounds),
      }, byId.get('nav'), bounds),
    }
  }
  if (byId.has('site')) {
    initial.windows.site = {
      ...initial.windows.site,
      ...rectFrom({
        x: bounds.width - aside - WORKSPACE_MARGIN,
        y: WORKSPACE_MARGIN,
        width: aside,
        height: preferredWindowHeight(byId.get('site'), bounds),
      }, byId.get('site'), bounds),
    }
  }
  if (byId.has('content')) {
    const left = initial.windows.nav?.x + initial.windows.nav?.width + WORKSPACE_GAP || WORKSPACE_MARGIN
    const right = initial.windows.site?.x - WORKSPACE_GAP || bounds.width - WORKSPACE_MARGIN
    initial.windows.content = {
      ...initial.windows.content,
      ...rectFrom({
        x: left,
        y: WORKSPACE_MARGIN,
        width: Math.max(1, right - left),
        height: preferredWindowHeight(byId.get('content'), bounds),
      }, byId.get('content'), bounds),
    }
  }
  initial.compat = {
    ...(initial.compat || {}),
    asideActiveId: validId(legacy.asideActiveId) ? String(legacy.asideActiveId) : 'site',
  }
  return initial
}
