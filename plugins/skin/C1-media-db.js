// @skin-part: C1 mediaOriginKey/ensureMediaDb — IndexedDB 媒体键与库（闭包：api/location）。
// · C1 mediaOriginKey/ensureMediaDb: IndexedDB 媒体键与库 ──
    function mediaOriginKey(kind) {
      return `${location.origin}:${kind}`
    }

    function ensureMediaDb() {
      if (!api.ui.shellMedia?.openMediaDb) return Promise.resolve(null)
      if (!mediaDbPromise) {
        mediaDbPromise = Promise.resolve(api.ui.shellMedia.openMediaDb(window.indexedDB, 'lsb_skin_media')).catch(() => null)
      }
      return mediaDbPromise
    }

    function releaseBackgroundVideo() {
      if (backgroundVideo) {
        backgroundVideo.pause?.()
        backgroundVideo.remove()
        backgroundVideo = null
      }
      if (backgroundVideoObjectUrl) {
        try { URL.revokeObjectURL(backgroundVideoObjectUrl) } catch { /* ignore */ }
        backgroundVideoObjectUrl = ''
      }
    }

    function releaseBackgroundImage() {
      backgroundImage?.remove?.()
      backgroundImage = null
      if (backgroundImageObjectUrl) {
        try { URL.revokeObjectURL(backgroundImageObjectUrl) } catch { /* ignore */ }
        backgroundImageObjectUrl = ''
      }
    }

    function releaseBackgroundMedia() {
      releaseBackgroundVideo()
      releaseBackgroundImage()
    }

    function holdSpaRouteChrome(serial) {
      if (serial !== spaSerial) return false
      spaRouteChromeSerial = serial
      document.documentElement.classList.add(SPA_ROUTE_PENDING_CLASS)
      return true
    }

    function releaseSpaRouteChrome(serial) {
      if (serial !== spaSerial || spaRouteChromeSerial !== serial) return false
      spaRouteChromeSerial = 0
      document.documentElement.classList.remove(SPA_ROUTE_PENDING_CLASS)
      return true
    }

    function clearSpaRouteChromeHold() {
      spaRouteChromeSerial = 0
      document.documentElement.classList.remove(SPA_ROUTE_PENDING_CLASS)
    }

    function setRoutePhase(serial, phase) {
      if (serial !== spaSerial) return false
      const root = document.documentElement
      if (phase) root.dataset.lsbRoutePhase = phase
      else delete root.dataset.lsbRoutePhase
      return true
    }

    function settleSpaRoute(serial) {
      if (serial !== spaSerial) return false
      delete document.documentElement.dataset.lsbRoutePhase
      releaseSpaRouteChrome(serial)
      return true
    }

    function releaseFontFace() {
      loadedFontFace?.dispose?.()
      loadedFontFace = null
      loadedFontObjectUrl = ''
    }

    async function loadLocalMedia(kind, key) {
      if (!key || !api.ui.shellMedia?.readMedia) return null
      const db = await ensureMediaDb()
      if (!db) return null
      try {
        const value = await api.ui.shellMedia.readMedia({ db, kind, key: String(key) })
        if (value && api.ui.shellMedia.validateMediaFile) {
          const check = api.ui.shellMedia.validateMediaFile(value, { kind })
          if (!check.ok) return null
        }
        return value
      } catch {
        return null
      }
    }
