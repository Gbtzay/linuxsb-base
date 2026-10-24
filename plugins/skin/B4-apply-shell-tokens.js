// @skin-part: B4 applyShellTokens — 玻璃/字号/字体令牌注入（闭包：cfg/canvasEffective/shellStyleApi）。
// · B4 applyShellTokens: 玻璃/字号/字体令牌注入 ──
    function applyShellTokens() {
      const root = document.documentElement
      const appearance = canvasEffective?.appearance || {}
      const canvasOn = !!cfg.shell && effectiveUiMode() === 'ios27'
      const shellOn = shellUiActive()
      root.classList.toggle('lsb-canvas-reduced-motion', canvasOn && appearance.motion === 'reduced')
      root.classList.toggle('lsb-canvas-reduced-transparency', canvasOn && appearance.transparency === 'reduced')
      if (!shellStyleApi) return
      if (!shellOn) {
        for (const prop of shellTokenProps) root.style.removeProperty(prop)
        shellTokenProps.clear()
        root.classList.remove('lsb-skin-glass-on', 'lsb-canvas-reduced-motion', 'lsb-canvas-reduced-transparency')
        return
      }
      const globalTokens = {
        baseFontSize: appearance.fontSize ?? cfg.baseFontSize,
        fontFamily: appearance.fontFamily || cfg.fontFamily,
        textColor: appearance.textColor,
        panelColor: appearance.panelColor,
        accentColor: appearance.accentColor,
        glassOpacity: appearance.opacity ?? (cfg.glass ? (cfg.glassOpacity ?? 0.72) : 0.72),
        glassBlur: appearance.blur ?? (cfg.glass ? (cfg.glassBlur ?? 18) : 18),
        density: cfg.density,
      }
      const tokens = shellStyleApi.mergeShellTokens(globalTokens, {})
      const cssText = shellStyleApi.tokenCss(tokens)
      const nextProps = new Set()
      for (const declaration of cssText.split(';')) {
        const index = declaration.indexOf(':')
        if (index <= 0) continue
        const prop = declaration.slice(0, index).trim()
        const value = declaration.slice(index + 1).trim()
        if (!prop.startsWith('--lsb-shell-') || !value) continue
        root.style.setProperty(prop, value)
        nextProps.add(prop)
      }
      for (const prop of shellTokenProps) if (!nextProps.has(prop)) root.style.removeProperty(prop)
      shellTokenProps.clear()
      for (const prop of nextProps) shellTokenProps.add(prop)
      const radius = canvasFinite(appearance.radius, 16)
      root.style.setProperty('--lsb-shell-radius', `${Math.max(8, Math.min(32, radius))}px`)
      shellTokenProps.add('--lsb-shell-radius')
      root.classList.toggle('lsb-skin-glass-on', shellOn)
    }
