// Coordinates canvas appearance controls with the existing config and media controllers.
export function createSkinAppearanceController({
  window, document, ui, configController, mediaController,
  getSurfaceHost, getSurface, getShell, locationText,
  saveState, applyTokens, syncMedia, applySurfaceModes,
}) {
  const { Element } = window

  function canvasSyncAppearance(feedback = '') {
    if (!(getSurfaceHost() instanceof Element)) return
    const appearance = configController.effective?.appearance || {}
    const status = getSurface('appearance-sheet')?.querySelector('[data-canvas-appearance-status]')
    const presetLabels = {
      'native-site': 'D 原生站点',
      'balanced-glass': 'A 平衡玻璃',
      'immersive-video': 'B 沉浸视频',
      'static-readable': 'C 静态可读',
    }
    if (status) status.textContent = feedback || `当前预设：${presetLabels[configController.effective?.preset] || presetLabels['balanced-glass']}`
    for (const button of getSurface('appearance-sheet')?.querySelectorAll('[data-canvas-preset]') || []) {
      button.setAttribute('aria-pressed', button.getAttribute('data-canvas-preset') === (configController.effective?.preset || 'balanced-glass') ? 'true' : 'false')
    }
    const backgroundMode = String(appearance.background || 'static') === 'image'
      ? 'image'
      : String(appearance.background || 'static') === 'video' ? 'video' : 'original'
    for (const button of getSurface('appearance-sheet')?.querySelectorAll('[data-canvas-background]') || []) {
      button.setAttribute('aria-pressed', button.getAttribute('data-canvas-background') === backgroundMode ? 'true' : 'false')
    }
    for (const input of getSurface('appearance-sheet')?.querySelectorAll('[data-canvas-appearance]') || []) {
      const key = input.getAttribute('data-canvas-appearance')
      if (!key || document.activeElement === input) continue
      if (appearance[key] != null) input.value = String(appearance[key])
    }
    const siteSummary = getSurface('site-card')?.querySelector('[data-canvas-site-summary]')
    if (siteSummary) siteSummary.textContent = `${configController.siteKey.replace(/^https?:\/\//, '')} · ${locationText()}`
    getShell()?.style.setProperty('--lsb-canvas-current-opacity', String(appearance.opacity ?? .72))
  }

  function canvasCommitAppearanceControls() {
    const controls = getSurface('appearance-sheet')?.querySelectorAll('[data-canvas-appearance]') || []
    const values = [...controls].map((input) => [input.getAttribute('data-canvas-appearance'), input.value])
    for (const [key, value] of values) {
      const input = [...controls].find((node) => node.getAttribute('data-canvas-appearance') === key)
      if (!key || String(configController.effective?.appearance?.[key] ?? '') === String(value ?? '')) continue
      canvasSetAppearance(key, value, { defer: true })
    }
    saveState()
    applyTokens()
    canvasSyncAppearance()
    syncMedia()
  }

  function canvasSaveAppearance() {
    if (!configController.state) return
    canvasCommitAppearanceControls()
    canvasSyncAppearance('\u5916\u89c2\u5df2\u4fdd\u5b58')
  }

  function canvasSetAppearance(name, value, options = {}) {
    if (!configController.setAppearance(name, value, options) || options.defer) return
    applyTokens()
    canvasSyncAppearance()
    syncMedia()
  }

  function canvasSetBackgroundMode(mode) {
    if (!configController.setBackgroundMode(mode)) return
    canvasSyncAppearance()
    syncMedia()
  }

  async function canvasSaveMediaFile(kind, file) {
    if (!file || !ui.shellMedia?.validateMediaFile) return
    const check = ui.shellMedia.validateMediaFile(file, { kind })
    if (!check.ok) {
      ui.toast?.(kind === 'video' ? '视频文件超过 50MB 或类型不受支持' : kind === 'image' ? '图片文件超过 20MB 或类型不受支持' : '字体文件超过 10MB 或类型不受支持', { type: 'error' })
      return
    }
    try {
      const key = await mediaController.saveFile(kind, file)
      if (!configController.setMediaKey(kind, key)) return
      canvasSyncAppearance()
      syncMedia()
      ui.toast?.('本地资源已保存并应用', { type: 'success' })
    } catch (error) {
      if (error?.name === 'AbortError') return
      ui.toast?.('本地资源保存失败，已保留当前外观', { type: 'error' })
    }
  }

  function canvasChoosePreset(preset) {
    if (!configController.choosePreset(preset)) return
    applyTokens()
    canvasSyncAppearance()
    syncMedia()
  }

  function canvasResetAppearance() {
    if (!configController.resetAppearance()) return
    applyTokens()
    canvasSyncAppearance()
    syncMedia()
  }

  function canvasResetLayout() {
    if (!configController.resetLayout()) return
    applySurfaceModes()
  }

  function bindAppearanceControls() {
    const presets = getSurface('appearance-sheet')?.querySelectorAll('[data-canvas-preset]') || []
    for (const button of presets) {
      if (button.dataset.canvasBound === '1') continue
      button.dataset.canvasBound = '1'
      button.addEventListener('click', () => canvasChoosePreset(button.getAttribute('data-canvas-preset')))
    }
    const backgroundButtons = getSurface('appearance-sheet')?.querySelectorAll('[data-canvas-background]') || []
    for (const button of backgroundButtons) {
      if (button.dataset.canvasBound === '1') continue
      button.dataset.canvasBound = '1'
      button.addEventListener('click', () => canvasSetBackgroundMode(button.getAttribute('data-canvas-background')))
    }
    const controls = getSurface('appearance-sheet')?.querySelectorAll('[data-canvas-appearance]') || []
    for (const input of controls) {
      if (input.dataset.canvasBound === '1') continue
      input.dataset.canvasBound = '1'
      const update = () => {
        canvasSetAppearance(input.getAttribute('data-canvas-appearance'), input.value)
      }
      input.addEventListener(input.type === 'range' ? 'input' : 'change', update)
    }
    const mediaInputs = getSurface('appearance-sheet')?.querySelectorAll('[data-canvas-media-file]') || []
    for (const input of mediaInputs) {
      if (input.dataset.canvasBound === '1') continue
      input.dataset.canvasBound = '1'
      input.addEventListener('change', () => {
        const file = input.files?.[0]
        void canvasSaveMediaFile(input.getAttribute('data-canvas-media-file'), file).finally(() => { input.value = '' })
      })
    }
    const resetAppearance = getSurface('appearance-sheet')?.querySelector('[data-canvas-reset-appearance]')
    const resetLayout = getSurface('appearance-sheet')?.querySelector('[data-canvas-reset-layout]')
    const saveAppearance = getSurface('appearance-sheet')?.querySelector('[data-canvas-save-appearance]')
    if (saveAppearance && saveAppearance.dataset.canvasBound !== '1') {
      saveAppearance.dataset.canvasBound = '1'
      saveAppearance.addEventListener('click', canvasSaveAppearance)
    }
    if (resetAppearance && resetAppearance.dataset.canvasBound !== '1') {
      resetAppearance.dataset.canvasBound = '1'
      resetAppearance.addEventListener('click', canvasResetAppearance)
    }
    if (resetLayout && resetLayout.dataset.canvasBound !== '1') {
      resetLayout.dataset.canvasBound = '1'
      resetLayout.addEventListener('click', canvasResetLayout)
    }
  }

  return { sync: canvasSyncAppearance, bind: bindAppearanceControls }
}
