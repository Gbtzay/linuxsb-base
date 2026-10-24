// @skin-part: C2 syncBackgroundMedia/syncShellFont: 背景/字体同步链 — 闭包：cfg / canvasEffective / api / shell*Api 等。侧车仅用于 review，聚合需注入。
// · C2 syncBackgroundMedia/syncShellFont: 背景/字体同步链 ──
    async function syncBackgroundMedia() {
      const root = document.documentElement
      const canvasMode = canvasShell instanceof Element && canvasShell.getAttribute('data-lsb-canvas-shell') === 'true'
      const workspace = canvasMode ? document.body : shellWorkspace()
      const appearance = canvasEffective?.appearance || {}
      const requestedMode = String(appearance.background || '').toLowerCase()
      const mode = requestedMode === 'video' || (requestedMode !== 'image' && cfg.backgroundVideoEnabled === true) ? 'video' : requestedMode === 'image' ? 'image' : 'static'
      const remoteVideo = String(appearance.backgroundVideoUrl || cfg.backgroundVideoUrl || '').trim()
      const localVideoKey = String(appearance.backgroundVideoLocalKey || cfg.backgroundVideoLocalKey || '').trim()
      const remoteImage = String(appearance.backgroundImageUrl || cfg.backgroundImageUrl || '').trim()
      const localImageKey = String(appearance.backgroundImageLocalKey || cfg.backgroundImageLocalKey || '').trim()
      const validVideo = !!api.ui.shellMedia?.isHttpsUrl?.(remoteVideo)
      const validImage = !!api.ui.shellMedia?.isHttpsUrl?.(remoteImage)
      const sourceKey = mode === 'video'
        ? `${validVideo ? remoteVideo : ''}|${localVideoKey}`
        : mode === 'image'
          ? `${validImage ? remoteImage : ''}|${localImageKey}`
          : ''
      const specKey = `${mode}|${appearance.motion || 'auto'}|${sourceKey}`
      if (specKey === backgroundSpecKey && (mode === 'video' ? backgroundVideo : mode === 'image' ? backgroundImage : !backgroundVideo && !backgroundImage)) return
      backgroundSpecKey = specKey
      mediaGeneration += 1
      const generation = mediaGeneration
      releaseBackgroundMedia()
      root.classList.remove('lsb-skin-video-on')
      root.classList.remove('lsb-skin-image-on')
      if (!cfg.shell || mode === 'static' || !(workspace instanceof Element)) return

      let source = ''
      const kind = mode === 'video' ? 'video' : 'image'
      const localKey = mode === 'video' ? localVideoKey : localImageKey
      const remote = mode === 'video' ? remoteVideo : remoteImage
      const validRemote = mode === 'video' ? validVideo : validImage
      if (localKey) {
        const file = await loadLocalMedia(kind, localKey)
        if (generation !== mediaGeneration) return
        if (file) {
          try {
            const objectUrl = URL.createObjectURL(file)
            if (mode === 'video') backgroundVideoObjectUrl = objectUrl
            else backgroundImageObjectUrl = objectUrl
            source = objectUrl
          } catch { source = '' }
        }
      }
      if (!source && validRemote) source = remote
      if (generation !== mediaGeneration || !source) return

      if (mode === 'image') {
        const image = document.createElement('img')
        image.setAttribute('data-lsb-shell-image', '')
        image.setAttribute('data-lsb-shell-image-layer', canvasMode ? 'canvas' : 'windowed')
        image.setAttribute('aria-hidden', 'true')
        image.alt = ''
        image.decoding = 'async'
        image.loading = 'eager'
        image.addEventListener('error', () => {
          if (generation !== mediaGeneration || backgroundImage !== image) return
          root.classList.remove('lsb-skin-image-on')
          image.dataset.lsbShellImageState = 'error'
          api.ui.toast?.('静态背景加载失败，已使用原始背景', { type: 'error' })
        })
        workspace.prepend(image)
        backgroundImage = image
        image.src = source
        if (generation === mediaGeneration && backgroundImage === image) {
          root.classList.add('lsb-skin-image-on')
          image.dataset.lsbShellImageState = 'loaded'
        }
        return
      }

      const video = document.createElement('video')
      video.setAttribute('data-lsb-shell-video', '')
      video.setAttribute('data-lsb-shell-video-layer', canvasMode ? 'canvas' : 'windowed')
      video.setAttribute('aria-hidden', 'true')
      video.setAttribute('muted', '')
      video.setAttribute('autoplay', '')
      video.setAttribute('loop', '')
      video.setAttribute('playsinline', '')
      video.defaultMuted = true
      video.muted = true
      video.loop = true
      video.autoplay = true
      video.playsInline = true
      video.preload = 'auto'
      const markVideoError = () => {
        if (generation !== mediaGeneration || backgroundVideo !== video) return
        if (video.dataset.lsbShellVideoState === 'error') return
        root.classList.remove('lsb-skin-video-on')
        video.controls = false
        video.style.pointerEvents = 'none'
        video.dataset.lsbShellVideoState = 'error'
        api.ui.toast?.('视频背景加载失败，已使用静态背景', { type: 'error' })
      }
      video.addEventListener('error', markVideoError)
      workspace.prepend(video)
      backgroundVideo = video
      video.src = source
      try { video.load?.() } catch { /* an older media element may not expose load */ }
      const exposeManualPlayback = (message) => {
        if (generation !== mediaGeneration || backgroundVideo !== video) return
        if (video.dataset.lsbShellVideoState === 'error' || video.error) return
        root.classList.add('lsb-skin-video-on')
        video.controls = false
        video.style.pointerEvents = 'none'
        video.dataset.lsbShellVideoState = 'manual'
        if (message) api.ui.toast?.(message, { type: 'info' })
      }
      if (appearance.motion === 'reduced' || window.matchMedia?.('(prefers-reduced-motion: reduce)')?.matches) {
        exposeManualPlayback('视频已暂停以减少动态')
        return
      }
      try {
        await video.play()
        if (generation === mediaGeneration && backgroundVideo === video) {
          if (video.dataset.lsbShellVideoState === 'error' || video.error) return
          root.classList.add('lsb-skin-video-on')
          video.controls = false
          video.style.pointerEvents = 'none'
          video.dataset.lsbShellVideoState = 'playing'
        }
      } catch {
        exposeManualPlayback('浏览器阻止自动播放，视频背景保持静止')
      }
    }

    async function syncBackgroundVideo() {
      return syncBackgroundMedia()
    }

    async function syncShellFont() {
      const root = document.documentElement
      const appearance = canvasEffective?.appearance || {}
      const remote = String(appearance.fontUrl || cfg.fontUrl || '').trim()
      const localKey = String(appearance.fontLocalKey || cfg.fontLocalKey || '').trim()
      const validRemote = !!api.ui.shellMedia?.isHttpsUrl?.(remote)
      const specKey = `${validRemote ? remote : ''}|${localKey}`
      if (specKey === fontSpecKey && (loadedFontFace || !remote && !localKey)) return
      fontSpecKey = specKey
      releaseFontFace()
      const configuredFamily = shellStyleApi?.sanitizeTokenValue?.('fontFamily', appearance.fontFamily || cfg.fontFamily)
      if (configuredFamily) root.style.setProperty('--lsb-shell-font-family', configuredFamily)
      else root.style.removeProperty('--lsb-shell-font-family')
      if (!validRemote && !localKey) return
      const generation = mediaGeneration
      let source = validRemote ? `url(${remote})` : null
      if (!source && localKey) source = await loadLocalMedia('font', localKey)
      if (generation !== mediaGeneration || !source || !api.ui.shellMedia?.loadFontFace) return
      try {
        loadedFontFace = await api.ui.shellMedia.loadFontFace({
          family: 'LSBShellUserFont',
          source,
          document,
          URLCtor: URL,
        })
        if (generation === mediaGeneration) root.style.setProperty('--lsb-shell-font-family', 'LSBShellUserFont')
      } catch {
        loadedFontFace = null
        if (!configuredFamily) root.style.removeProperty('--lsb-shell-font-family')
        api.ui.toast?.('字体加载失败，已回退站点字体', { type: 'error' })
      }
    }
