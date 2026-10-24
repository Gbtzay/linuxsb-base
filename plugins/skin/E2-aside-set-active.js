// @skin-part: E2 asideSetActive/removeAsideView: 侧栏视图激活与销毁
// · E2 asideSetActive/removeAsideView: 侧栏视图激活与销毁 ──
    function asideSetActive(id, aside = document.querySelector('#lsb-shell-aside'), persist = false) {
      if (!(aside instanceof Element)) return 'site'
      const registered = api.ui.shellAsideViews(asideContext()).find((view) => view.id === id)
      const exists = id === 'site' || asideViews.has(id) || !!registered
      asideActiveId = exists ? id : 'site'
      if (persist && exists) {
        asidePreferredId = asideActiveId
        try {
          api.store.set(ASIDE_ACTIVE_KEY, asidePreferredId)
        } catch {
          /* A storage failure must not block the current tab selection. */
        }
      }
      for (const tab of aside.querySelectorAll('[data-lsb-shell-aside-tab]')) {
        const active = tab.getAttribute('data-lsb-shell-aside-tab') === asideActiveId
        tab.setAttribute('aria-selected', active ? 'true' : 'false')
        tab.tabIndex = active ? 0 : -1
      }
      for (const pane of aside.querySelectorAll('[data-lsb-shell-aside-pane]')) {
        pane.hidden = pane.getAttribute('data-lsb-shell-aside-pane') !== asideActiveId
      }
      const selectedView = asideViews.get(asideActiveId)?.view
        || api.ui.shellAsideViews(asideContext()).find((view) => view.id === asideActiveId)
      const windowId = selectedView?.windowId || 'site'
      if (windowId !== 'site' && shellWindowLayout?.windows?.[windowId]) focusShellWindow(windowId)
      for (const current of externalWindowViews.values()) {
        if (current.view?.windowId) current.host.dataset.lsbShellOpen = current.view.id === asideActiveId ? 'true' : 'false'
      }
      return asideActiveId
    }

    function removeAsideView(id) {
      const rec = asideViews.get(id)
      if (!rec) return
      try {
        rec.dispose?.()
      } catch (e) {
        console.error('[LSB skin] 右栏视图清理失败', id, e)
      }
      rec.tab?.remove()
      rec.pane?.remove()
      asideViews.delete(id)
      if (asideActiveId === id) asideActiveId = 'site'
    }

    function destroyAsideViews() {
      for (const id of [...asideViews.keys()]) removeAsideView(id)
      asideActiveId = 'site'
    }
