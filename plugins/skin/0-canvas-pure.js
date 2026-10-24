// @skin-part: 0 canvas-pure — 画布状态纯函数与常量（约 189 行）
/* M17 单一画布状态契约：保持纯函数，DOM 与存储适配留在 setup。 */
  const CANVAS_STATE_VERSION = 2
  const CANVAS_STATE_KEY = 'canvas-state:v2'
  const CANVAS_WIDTH_CLASSES = ['wide', 'mid', 'narrow']
  const CLOUDFLARE_CHALLENGE_ATTR = 'data-lsb-cloudflare-challenge'
  const SPA_ROUTE_PENDING_CLASS = 'lsb-canvas-route-pending'
  const SPA_ROUTE_COMMITTED_EVENT = 'lsb:route-committed'
  const CLOUDFLARE_CHALLENGE_MARKERS = '#challenge-stage, #challenge-form, #challenge-running, #cf-challenge-running, .cf-browser-verification, [data-cf-challenge]'
  const CLOUDFLARE_CHALLENGE_TITLE_COPY = /(?:just a moment|attention required|checking your browser|checking if (?:the )?site connection is secure)/i
  const CLOUDFLARE_CHALLENGE_BODY_COPY = /(?:checking your browser|verify (?:that )?you are human|enable javascript and cookies to continue|performing (?:a )?security (?:check|verification)|complete (?:the )?security check|请完成.{0,12}验证|请进行.{0,12}验证|正在验证|人机验证)/i
  const CLOUDFLARE_CHALLENGE_COPY_SELECTOR = 'h1, h2, h3, p, [role="heading"], #challenge-error-text, #challenge-body-text, [data-cf-challenge-message]'
  const CANVAS_DEFAULT_APPEARANCE = Object.freeze({
    background: 'static', backgroundVideoUrl: '', backgroundVideoLocalKey: '', backgroundImageUrl: '', backgroundImageLocalKey: '',
    opacity: 0.72, blur: 18, fontFamily: '', fontUrl: '', fontLocalKey: '',
    fontSize: 14, textColor: '', panelColor: '', accentColor: '', radius: 16,
    motion: 'auto', transparency: 'auto',
  })
  const CANVAS_DEFAULT_SURFACES = Object.freeze({
    // @LSB_DEV_AI_START
    aiCard: { width: 420, height: 560 },
    // @LSB_DEV_AI_END
    siteCard: { width: 360, height: 560 }, evidenceCard: { width: 420, height: 320 },
  })
  const CANVAS_AI_MARKUP = { capsule: '', tool: '', query: '', card: '' }
  // @LSB_DEV_AI_START
  CANVAS_AI_MARKUP.capsule = '<button type="button" data-canvas-open="ai-card" aria-label="AI 助理">✦</button>'
  CANVAS_AI_MARKUP.tool = '<button type="button" data-tool-action="ai-card">AI 助理</button>'
  CANVAS_AI_MARKUP.query = '<div data-canvas-query><textarea data-canvas-query-input aria-label="自然语言工具请求" placeholder="直接说你想做什么"></textarea><button type="button" data-canvas-send>发送</button></div>'
  CANVAS_AI_MARKUP.card = `<section data-surface="ai-card" role="dialog" tabindex="-1" aria-hidden="true" aria-keyshortcuts="Arrow keys, Shift+Arrow keys, Home, End, Escape" aria-labelledby="lsb-canvas-ai-title" hidden>
              <div data-canvas-sheet-head><span data-canvas-sheet-grabber aria-hidden="true"></span><h2 id="lsb-canvas-ai-title">AI 助理</h2><button type="button" data-canvas-close aria-label="关闭">×</button></div>
              <div data-canvas-ai-host style="min-height:0;flex:1;display:flex;flex-direction:column">AI 工作台尚未启用</div>
              <span data-canvas-resize-handle role="separator" aria-label="调整 AI 卡片大小"></span>
            </section>`
  // @LSB_DEV_AI_END

  function isCloudflareChallengeDocument(doc) {
    if (!doc?.querySelector) return false
    if (doc.documentElement?.getAttribute(CLOUDFLARE_CHALLENGE_ATTR) === 'true') return true
    if (!doc.querySelector(CLOUDFLARE_CHALLENGE_MARKERS)) return false
    if (CLOUDFLARE_CHALLENGE_TITLE_COPY.test(String(doc.title || ''))) return true
    const view = doc.defaultView
    for (const node of doc.querySelectorAll(CLOUDFLARE_CHALLENGE_COPY_SELECTOR)) {
      if (!CLOUDFLARE_CHALLENGE_BODY_COPY.test(node.textContent || '')) continue
      let visible = true
      for (let current = node; current?.nodeType === 1; current = current.parentElement) {
        if (current.hidden || current.getAttribute('aria-hidden') === 'true') {
          visible = false
          break
        }
        const style = view?.getComputedStyle?.(current)
        if (style && (style.display === 'none' || style.visibility === 'hidden' || style.visibility === 'collapse' || style.opacity === '0')) {
          visible = false
          break
        }
        if (current === doc.body || !current.parentElement) break
      }
      if (visible) return true
    }
    return false
  }

  function canvasFinite(value, fallback = 0) {
    const n = Number(value)
    return Number.isFinite(n) ? n : fallback
  }

  function canvasCopy(value) {
    if (value === null || typeof value !== 'object') return value
    if (Array.isArray(value)) return value.map(canvasCopy)
    const out = {}
    for (const [key, item] of Object.entries(value)) out[key] = canvasCopy(item)
    return out
  }

  function canvasMerge(left, right) {
    const a = left && typeof left === 'object' ? left : {}
    const b = right && typeof right === 'object' ? right : {}
    const out = canvasCopy(a)
    for (const [key, value] of Object.entries(b)) {
      if (value && typeof value === 'object' && !Array.isArray(value) && a[key] && typeof a[key] === 'object' && !Array.isArray(a[key])) out[key] = canvasMerge(a[key], value)
      else out[key] = canvasCopy(value)
    }
    return out
  }

  function widthClass(width) {
    const n = canvasFinite(width, 0)
    return n >= 1100 ? 'wide' : n >= 700 ? 'mid' : 'narrow'
  }

  function siteKeyFromLocation(locationLike) {
    try {
      const url = locationLike instanceof URL
        ? locationLike
        : new URL(String(locationLike?.href || locationLike || ''), 'https://linux.sb/')
      return url.origin
    } catch {
      return ''
    }
  }

  function defaultCanvasState() {
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

  function mergeCanvasState(globalState, siteOverride = {}) {
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

  function clampSurfaceRect(rect = {}, viewport = {}, minimum = {}) {
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

  function migrateLegacySkinState(rawConfig = {}, mediaMeta = {}) {
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

  function resolveSurfaceMode(widthValue, surfaceKind = '') {
    const bucket = CANVAS_WIDTH_CLASSES.includes(widthValue) ? widthValue : 'wide'
    const kind = String(surfaceKind || '')
    if (kind === 'top-status' || kind === 'tool-capsule') return 'fixed'
    if (bucket === 'wide') {
      if (kind === 'site-card') return 'rail'
      return kind.endsWith('sheet') ? 'sheet' : 'floating'
    }
    return bucket === 'mid' ? 'sheet' : 'fullscreen'
  }
