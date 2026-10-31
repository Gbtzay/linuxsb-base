/** Owns legacy sidebar tabs, selection preference and view lifecycles. */
export function createSkinAsideViewsController({ window, document, store, getContext, getViews, isEnabled, onSelect }) {
  const { Element } = document.defaultView
  const asideViews = new Map()
  const ASIDE_ACTIVE_KEY = 'aside-active'
  const storedAsideId = store.get(ASIDE_ACTIVE_KEY, 'site')
  let asidePreferredId = storedAsideId === 'site' || /^[a-z][a-z0-9-]{0,63}$/.test(String(storedAsideId || ''))
    ? String(storedAsideId || 'site')
    : 'site'
  let asideActiveId = 'site'
  let asideResizeBound = false

  // · E2 asideSetActive/removeAsideView: 侧栏视图激活与销毁 ──
  function asideSetActive(id, aside = document.querySelector('#lsb-shell-aside'), persist = false) {
    if (!(aside instanceof Element)) return 'site'
    const registered = getViews(getContext()).find((view) => view.id === id)
    const exists = id === 'site' || asideViews.has(id) || !!registered
    asideActiveId = exists ? id : 'site'
    if (persist && exists) {
      asidePreferredId = asideActiveId
      try {
        store.set(ASIDE_ACTIVE_KEY, asidePreferredId)
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
      || getViews(getContext()).find((view) => view.id === asideActiveId)
    onSelect(asideActiveId, selectedView)
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

  // · E3 syncAsideViews/bindAsideResize: 侧栏视图同步与自适应 ──
  function syncAsideViews(el = document.getElementById('lsb-shell')) {
    const aside = el?.querySelector?.('#lsb-shell-aside') || document.querySelector('#lsb-shell-aside')
    if (!(aside instanceof Element)) return
    const tabs = aside.querySelector('#lsb-shell-aside-tabs')
    const panes = aside.querySelector('.lsb-shell-aside-panes')
    const site = panes?.querySelector('[data-lsb-shell-aside-pane="site"]')
    if (!(tabs instanceof Element) || !(panes instanceof Element) || !(site instanceof Element)) return

    const wide = getContext().wide
    const context = getContext()
    const visible = wide ? getViews(context) : []
    const next = new Map(visible.map((view) => [view.id, view]))

    for (const id of [...asideViews.keys()]) {
      const view = next.get(id)
      const current = asideViews.get(id)
      if (!view || current.view !== view) removeAsideView(id)
    }

    let siteTab = tabs.querySelector('[data-lsb-shell-aside-tab="site"]')
    if (!siteTab) {
      siteTab = document.createElement('button')
      siteTab.type = 'button'
      siteTab.setAttribute('role', 'tab')
      siteTab.setAttribute('data-lsb-shell-aside-tab', 'site')
      siteTab.textContent = '站点'
      siteTab.addEventListener('click', () => asideSetActive('site', aside, true))
      tabs.append(siteTab)
    }

    for (const view of visible) {
      let rec = asideViews.get(view.id)
      if (!rec) {
        const tab = document.createElement('button')
        tab.type = 'button'
        tab.setAttribute('role', 'tab')
        tab.setAttribute('data-lsb-shell-aside-tab', view.id)
        tab.textContent = view.label
        const pane = document.createElement('section')
        pane.setAttribute('role', 'tabpanel')
        pane.setAttribute('data-lsb-shell-aside-pane', view.id)
        pane.setAttribute('aria-label', view.label)
        pane.tabIndex = 0
        tab.addEventListener('click', () => asideSetActive(view.id, aside, true))
        panes.append(pane)
        let dispose = null
        if (view.windowId && view.windowId !== 'site') {
          pane.textContent = `${view.label}已在独立窗口打开`
          pane.setAttribute('data-lsb-shell-window-proxy', view.windowId)
        } else {
          try {
            dispose = view.render(pane, context)
          } catch (e) {
            pane.textContent = 'AI 视图加载失败'
            console.error('[LSB skin] 右栏视图渲染失败', view.id, e)
          }
        }
        rec = { view, tab, pane, dispose: typeof dispose === 'function' ? dispose : null }
        asideViews.set(view.id, rec)
      }
      tabs.append(rec.tab)
      panes.append(rec.pane)
    }
    tabs.append(siteTab)
    // 站点页固定在首位；append 顺序用于浏览器键盘和读屏顺序。
    tabs.insertBefore(siteTab, tabs.firstChild)
    panes.insertBefore(site, panes.firstChild)
    tabs.hidden = !wide || visible.length === 0
    asideSetActive(wide ? asidePreferredId : 'site', aside)
  }

  function bindAsideResize() {
    if (asideResizeBound) return
    asideResizeBound = true
    window.addEventListener('resize', onAsideResize)
  }

  function unbindAsideResize() {
    if (!asideResizeBound) return
    window.removeEventListener('resize', onAsideResize)
    asideResizeBound = false
  }

  function onAsideResize() {
    if (isEnabled()) syncAsideViews()
  }

  return { setActive: asideSetActive, sync: syncAsideViews, destroy: destroyAsideViews,
    bindResize: bindAsideResize, unbindResize: unbindAsideResize,
    get activeId() { return asideActiveId }, get preferredId() { return asidePreferredId } }
}
