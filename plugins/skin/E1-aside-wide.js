// @skin-part: E1 asideWide: 侧栏宽度与可见性判定
// · E1 asideWide: 侧栏宽度与可见性判定 ──
    function asideWide() {
      try {
        if (typeof window.matchMedia === 'function') return !!window.matchMedia('(min-width: 1100px)').matches
      } catch {
        /* jsdom and older embedded browsers may not implement matchMedia */
      }
      const width = Number(window.innerWidth || document.documentElement?.clientWidth || 0)
      return width >= 1100
    }

    function onUiModeResize() {
      const wide = asideWide()
      if (wide === uiModeWideSnapshot) return
      uiModeWideSnapshot = wide
      scheduleRefresh(false)
    }

    function bindUiModeResize() {
      if (uiModeResizeBound) return
      uiModeResizeBound = true
      uiModeWideSnapshot = asideWide()
      window.addEventListener('resize', onUiModeResize)
    }

    function unbindUiModeResize() {
      if (!uiModeResizeBound) return
      window.removeEventListener('resize', onUiModeResize)
      uiModeResizeBound = false
      uiModeWideSnapshot = null
    }

    function bindCloudflareChallengeWatch() {
      if (cloudflareChallengeObserver || typeof MutationObserver !== 'function') return
      const root = document.documentElement
      if (!root) return
      cloudflareChallengeObserver = new MutationObserver(() => scheduleRefresh(false))
      cloudflareChallengeObserver.observe(root, {
        attributes: true,
        attributeFilter: [CLOUDFLARE_CHALLENGE_ATTR],
      })
    }

    function unbindCloudflareChallengeWatch() {
      cloudflareChallengeObserver?.disconnect?.()
      cloudflareChallengeObserver = null
    }

    function shellUiActive() {
      return !!cfg.shell && (effectiveUiMode() === 'ios27' || asideWide())
    }

    function asideContext() {
      return {
        page: api.page,
        route: api.page,
        snapshot: api.snapshot,
        wide: asideWide(),
      }
    }
