/** Owns skin configuration and persisted canvas preferences; no DOM or resources. */
export function createSkinConfigController({ getConfig, saveConfig, store, getLocation, getViewport, stateApi, sanitizeTokenValue, isHttpsUrl }) {
  const { CANVAS_STATE_KEY, CANVAS_STATE_VERSION, CANVAS_WIDTH_CLASSES, CANVAS_DEFAULT_APPEARANCE, defaultCanvasState, migrateLegacySkinState, canvasMerge, canvasCopy, mergeCanvasState, siteKeyFromLocation, widthClass } = stateApi
  let cfg = getConfig()
  function effectiveUiMode() {
    return cfg?.uiMode === 'ios27' ? 'ios27' : 'legacy'
  }

  const topicSpaMigrationKey = 'topicSpaNewWorldDefaultMigrationV1'
  try {
    if (store.get(topicSpaMigrationKey) !== true) {
      saveConfig({ topicSpa: true })
      cfg = { ...cfg, topicSpa: true }
      store.set(topicSpaMigrationKey, true)
    }
  } catch {
    // Keep the resolved config when migration storage is unavailable.
  }
  let canvasState = null
  let canvasEffective = null
  let canvasSiteKey = siteKeyFromLocation(getLocation())
  let canvasWidthClass = widthClass(getViewport().width)

  function readCanvasState() {
    let stored = null
    try { stored = store.get(CANVAS_STATE_KEY, null) } catch { stored = null }
    if (!stored || typeof stored !== 'object' || Number(stored.version) !== CANVAS_STATE_VERSION) {
      canvasState = migrateLegacySkinState(cfg)
      try { store.set(CANVAS_STATE_KEY, canvasCopy(canvasState)) } catch { /* storage may be unavailable */ }
    } else {
      const base = defaultCanvasState()
      canvasState = canvasMerge(base, stored)
      canvasState.version = CANVAS_STATE_VERSION
      canvasState.sites = stored.sites && typeof stored.sites === 'object' ? canvasCopy(stored.sites) : {}
    }
    canvasSiteKey = siteKeyFromLocation(getLocation())
    canvasWidthClass = widthClass(getViewport().width)
    canvasEffective = mergeCanvasState(canvasState, canvasState.sites?.[canvasSiteKey] || {})
    return canvasEffective
  }

  function saveCanvasState() {
    if (!canvasState) return
    try { store.set(CANVAS_STATE_KEY, canvasCopy(canvasState)) } catch { /* storage failure is non-fatal */ }
  }

  function reload() {
    cfg = getConfig()
    return cfg
  }

  function refreshContext() {
    canvasSiteKey = siteKeyFromLocation(getLocation())
    canvasWidthClass = widthClass(getViewport().width)
    if (canvasState) canvasEffective = mergeCanvasState(canvasState, canvasState.sites?.[canvasSiteKey] || {})
  }

  function tokenValues() {
    const appearance = canvasEffective?.appearance || {}
    return {
      baseFontSize: appearance.fontSize ?? cfg.baseFontSize,
      fontFamily: appearance.fontFamily || cfg.fontFamily,
      textColor: appearance.textColor,
      panelColor: appearance.panelColor,
      accentColor: appearance.accentColor,
      glassOpacity: appearance.opacity ?? (cfg.glass ? (cfg.glassOpacity ?? 0.72) : 0.72),
      glassBlur: appearance.blur ?? (cfg.glass ? (cfg.glassBlur ?? 18) : 18),
      density: cfg.density,
    }
  }

  function canvasSetAppearance(name, value, options = {}) {
    const key = String(name || '')
    if (!CANVAS_DEFAULT_APPEARANCE.hasOwnProperty(key) || !canvasState) return false
    let next = value
    if (['opacity', 'blur', 'fontSize', 'radius'].includes(key)) {
      const n = Number(value)
      if (!Number.isFinite(n)) return false
      const bounds = { opacity: [.35, 1], blur: [0, 32], fontSize: [12, 32], radius: [8, 32] }[key]
      next = Math.min(bounds[1], Math.max(bounds[0], n))
    }
    if (['textColor', 'panelColor', 'accentColor'].includes(key)) {
      const text = String(value || '').trim()
      if (!text) next = ''
      else {
        const valid = sanitizeTokenValue(key, text)
        if (!valid) return false
        next = text
      }
    }
    if (key === 'fontFamily') {
      if (!value) next = ''
      else {
        const valid = sanitizeTokenValue('fontFamily', value)
        if (!valid) return false
        next = String(value)
      }
    }
    if (['backgroundVideoUrl', 'backgroundImageUrl', 'fontUrl'].includes(key)) {
      if (value && !isHttpsUrl(value)) return false
      next = String(value || '').trim()
    }
    const site = canvasState.sites[canvasSiteKey] || {}
    const appearancePatch = { [key]: next }
    if (key === 'backgroundVideoUrl' && next) {
      appearancePatch.background = 'video'
      appearancePatch.backgroundImageUrl = ''
      appearancePatch.backgroundImageLocalKey = ''
    }
    if (key === 'backgroundImageUrl' && next) {
      appearancePatch.background = 'image'
      appearancePatch.backgroundVideoUrl = ''
      appearancePatch.backgroundVideoLocalKey = ''
    }
    if (key === 'backgroundVideoUrl' && !next) appearancePatch.background = 'static'
    if (key === 'backgroundImageUrl' && !next) appearancePatch.background = 'static'
    canvasState.sites[canvasSiteKey] = canvasMerge(site, { appearance: appearancePatch })
    canvasEffective = mergeCanvasState(canvasState, canvasState.sites[canvasSiteKey])
    if (!options.defer) saveCanvasState()
    return true
  }

  function canvasSetBackgroundMode(mode) {
    if (!canvasState) return false
    const nextMode = ['image', 'video'].includes(String(mode)) ? String(mode) : 'static'
    const site = canvasState.sites[canvasSiteKey] || {}
    const appearancePatch = {
      background: nextMode,
      ...(nextMode === 'static' || nextMode === 'video' ? { backgroundImageUrl: '', backgroundImageLocalKey: '' } : {}),
      ...(nextMode === 'static' || nextMode === 'image' ? { backgroundVideoUrl: '', backgroundVideoLocalKey: '' } : {}),
    }
    canvasState.sites[canvasSiteKey] = canvasMerge(site, { appearance: appearancePatch })
    canvasEffective = mergeCanvasState(canvasState, canvasState.sites[canvasSiteKey])
    saveCanvasState()
    return true
  }

  function canvasChoosePreset(preset) {
    if (!canvasState || !['native-site', 'balanced-glass', 'immersive-video', 'static-readable'].includes(preset)) return false
    const values = {
      'native-site': { opacity: 1, blur: 0, background: 'static', backgroundVideoUrl: '', backgroundVideoLocalKey: '', backgroundImageUrl: '', backgroundImageLocalKey: '', fontFamily: '', fontUrl: '', fontLocalKey: '', fontSize: 14, textColor: '', panelColor: '', accentColor: '', radius: 16, motion: 'auto', transparency: 'reduced' },
      'balanced-glass': { opacity: .72, blur: 18, background: 'static', backgroundVideoUrl: '', backgroundVideoLocalKey: '', backgroundImageUrl: '', backgroundImageLocalKey: '', textColor: '', panelColor: '', accentColor: '', motion: 'auto', transparency: 'auto' },
      'immersive-video': { opacity: .56, blur: 22, background: 'video', backgroundVideoUrl: '', backgroundVideoLocalKey: '', backgroundImageUrl: '', backgroundImageLocalKey: '', textColor: '', panelColor: '', accentColor: '', motion: 'auto', transparency: 'auto' },
      'static-readable': { opacity: .94, blur: 0, background: 'static', backgroundVideoUrl: '', backgroundVideoLocalKey: '', backgroundImageUrl: '', backgroundImageLocalKey: '', textColor: '', panelColor: '', accentColor: '', motion: 'reduced', transparency: 'reduced' },
    }[preset]
    const site = canvasState.sites?.[canvasSiteKey]
    if (site?.appearance) {
      const next = { ...site }
      delete next.appearance
      canvasState.sites[canvasSiteKey] = next
    }
    canvasState.global = canvasMerge(canvasState.global, { preset, appearance: values })
    canvasEffective = mergeCanvasState(canvasState, canvasState.sites?.[canvasSiteKey] || {})
    saveCanvasState()
    return true
  }

  function canvasResetAppearance() {
    if (!canvasState) return false
    const site = canvasState.sites[canvasSiteKey]
    if (site?.appearance) {
      const next = { ...site }
      delete next.appearance
      canvasState.sites[canvasSiteKey] = next
    }
    canvasState.global = canvasMerge(canvasState.global, { preset: 'balanced-glass', appearance: canvasCopy(CANVAS_DEFAULT_APPEARANCE) })
    canvasEffective = mergeCanvasState(canvasState, canvasState.sites?.[canvasSiteKey] || {})
    saveCanvasState()
    return true
  }

  function canvasResetLayout() {
    if (!canvasState) return false
    const site = canvasState.sites[canvasSiteKey]
    if (site?.layout) {
      const next = { ...site }
      delete next.layout
      canvasState.sites[canvasSiteKey] = next
    }
    canvasEffective = mergeCanvasState(canvasState, canvasState.sites?.[canvasSiteKey] || {})
    saveCanvasState()
    return true
  }

  function canvasPersistSurfaceRect(id, rect) {
    if (!canvasState || !canvasSiteKey || !CANVAS_WIDTH_CLASSES.includes(canvasWidthClass)) return false
    const site = canvasState.sites[canvasSiteKey] || {}
    const layout = site.layout && typeof site.layout === 'object' ? site.layout : {}
    const bucket = layout[canvasWidthClass] && typeof layout[canvasWidthClass] === 'object' ? layout[canvasWidthClass] : {}
    canvasState.sites[canvasSiteKey] = canvasMerge(site, { layout: { [canvasWidthClass]: { ...bucket, [id]: canvasCopy(rect) } } })
    canvasEffective = mergeCanvasState(canvasState, canvasState.sites[canvasSiteKey])
    saveCanvasState()
    return true
  }

  function setMediaKey(kind, key) {
    if (!canvasState) return false
    const field = kind === 'video' ? 'backgroundVideoLocalKey' : kind === 'image' ? 'backgroundImageLocalKey' : 'fontLocalKey'
    const site = canvasState?.sites?.[canvasSiteKey] || {}
    const appearancePatch = {
      [field]: key,
      ...(kind === 'video' ? { background: 'video', backgroundVideoUrl: '', backgroundImageUrl: '', backgroundImageLocalKey: '' } : {}),
      ...(kind === 'image' ? { background: 'image', backgroundImageUrl: '', backgroundVideoUrl: '', backgroundVideoLocalKey: '' } : {}),
    }
    canvasState.sites[canvasSiteKey] = canvasMerge(site, { appearance: appearancePatch })
    canvasEffective = mergeCanvasState(canvasState, canvasState.sites[canvasSiteKey])
    saveCanvasState()
    return true
  }

  function saveLegacyMedia(kind, key) {
    const configKey = kind === 'video' ? 'backgroundVideoLocalKey' : kind === 'image' ? 'backgroundImageLocalKey' : 'fontLocalKey'
    const enabledKey = kind === 'video' ? 'backgroundVideoEnabled' : ''
    saveConfig({
      [configKey]: key,
      ...(enabledKey ? { [enabledKey]: true } : {}),
      ...(kind === 'video' ? { backgroundVideoUrl: '', backgroundImageUrl: '', backgroundImageLocalKey: '' } : {}),
      ...(kind === 'image' ? { backgroundVideoEnabled: false, backgroundVideoUrl: '', backgroundVideoLocalKey: '' } : {}),
    })
    cfg = getConfig()
    return cfg
  }

  return { reload, read: readCanvasState, save: saveCanvasState, refreshContext, effectiveUiMode, tokenValues,
    setAppearance: canvasSetAppearance, setBackgroundMode: canvasSetBackgroundMode, setMediaKey,
    choosePreset: canvasChoosePreset, resetAppearance: canvasResetAppearance,
    resetLayout: canvasResetLayout, persistSurfaceRect: canvasPersistSurfaceRect, saveLegacyMedia,
    get config() { return cfg }, get state() { return canvasState }, get effective() { return canvasEffective },
    get siteKey() { return canvasSiteKey }, get widthClass() { return canvasWidthClass } }
}
