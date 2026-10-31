// Owns the existing shared-window compatibility layout and interaction state.
export function createSkinWindowController({
  window, document, ui, store, configController, contentController, layoutApi, styleApi,
  getLocation, getAsideContext, getAsidePreferredId, getAsideActiveId, setAsideActive, findOutlet, clone,
}) {
  const { Element } = window
  let shellWindowLayout = null
  let shellWindowRegistry = []
  let shellLayoutKey = ''
  let shellLayoutSaveTimer = 0
  let windowInteractionBound = false
  let windowInteractionState = null
  let windowInteractionRaf = 0
  let responsiveBound = false
  let responsiveHandler = null
  let narrowActiveWindow = 'content'
  const externalWindowViews = new Map()
  const LAYOUT_MIGRATION_KEY = 'layoutMigrationVersion'
  const LAYOUT_MIGRATION_VERSION = 1
  const LAYOUT_SAVE_DEBOUNCE = 150
  const BUILTIN_WINDOWS = Object.freeze([
    { id: 'nav', label: '导航', order: 10, min: { width: 200, height: 160 }, defaultRect: { width: 240, height: 640 } },
    { id: 'content', label: '正文', order: 20, min: { width: 320, height: 240 }, defaultRect: { width: 720, height: 640 } },
    { id: 'site', label: '站点', order: 30, min: { width: 240, height: 160 }, defaultRect: { width: 280, height: 640 } },
  ])

  function shellWindowEnabled() {
    return false
  }

  function shellWorkspace(el = document.getElementById('lsb-shell')) {
    return el?.querySelector?.('[data-lsb-shell-workspace]') || null
  }

  function shellViewport(workspace) {
    const width = Number(workspace?.clientWidth || window.innerWidth || document.documentElement?.clientWidth || 1)
    const height = Number(workspace?.clientHeight || (window.innerHeight || document.documentElement?.clientHeight || 1) - 48)
    return { width: Math.max(1, width), height: Math.max(1, height) }
  }

  function cssPixels(name, fallback) {
    try {
      const value = window.getComputedStyle(document.documentElement).getPropertyValue(name)
      const parsed = Number.parseFloat(value)
      return Number.isFinite(parsed) ? parsed : fallback
    } catch {
      return fallback
    }
  }

  function shellLayoutStorageKey(viewport = shellViewport(shellWorkspace())) {
    if (!layoutApi) return ''
    const bucket = layoutApi.widthBucket(viewport.width)
    return layoutApi.layoutStorageKey(getLocation().origin, bucket)
  }

  function readLegacyShellLayout() {
    return {
      header: cssPixels('--lsb-shell-header', 48),
      rail: cssPixels('--lsb-shell-rail', 240),
      aside: cssPixels('--lsb-shell-aside', 280),
      asideActiveId: getAsidePreferredId(),
    }
  }

  function saveShellLayout({ immediate = false } = {}) {
    if (!shellWindowLayout || !shellLayoutKey || !layoutApi) return null
    if (!immediate) {
      window.clearTimeout(shellLayoutSaveTimer)
      shellLayoutSaveTimer = window.setTimeout(() => {
        shellLayoutSaveTimer = 0
        saveShellLayout({ immediate: true })
      }, LAYOUT_SAVE_DEBOUNCE)
      return null
    }
    window.clearTimeout(shellLayoutSaveTimer)
    shellLayoutSaveTimer = 0
    const viewport = shellViewport(shellWorkspace())
    const clean = layoutApi.sanitizeShellLayout(shellWindowLayout, {
      ...viewport,
      registry: shellWindowRegistry,
    })
    clean.updatedAt = Date.now()
    shellWindowLayout = clean
    try {
      store.set(shellLayoutKey, clone(clean))
    } catch {
      /* 存储不可用时继续保留内存布局，不能阻塞壳。 */
    }
    return clone(clean)
  }

  function loadShellLayout(viewport = shellViewport(shellWorkspace())) {
    if (!layoutApi) return null
    const key = shellLayoutStorageKey(viewport)
    shellLayoutKey = key
    let stored = null
    try {
      stored = store.get(key, null)
    } catch {
      stored = null
    }
    if (stored && typeof stored === 'object' && stored.windows && typeof stored.windows === 'object') {
      const clean = layoutApi.sanitizeShellLayout(stored, {
        ...viewport,
        registry: shellWindowRegistry,
      })
      if (Object.keys(clean.windows).length) return clean
    }

    let migrationVersion = 0
    try { migrationVersion = Number(store.get(LAYOUT_MIGRATION_KEY, 0)) || 0 } catch { migrationVersion = 0 }
    if (!stored && migrationVersion < LAYOUT_MIGRATION_VERSION) {
      const migrated = layoutApi.migrateLegacyShellLayout({
        viewport,
        legacy: readLegacyShellLayout(),
        registry: shellWindowRegistry,
      })
      migrated.updatedAt = Date.now()
      try { store.set(LAYOUT_MIGRATION_KEY, LAYOUT_MIGRATION_VERSION) } catch { /* optional marker */ }
      return migrated
    }
    return layoutApi.defaultShellLayout({ ...viewport, registry: shellWindowRegistry })
  }

  function ensureRegisteredShellLayout(layout, viewport) {
    if (!layout || !layoutApi) return layout
    const defaults = layoutApi.defaultShellLayout({ ...viewport, registry: shellWindowRegistry })
    for (const [id, state] of Object.entries(defaults.windows || {})) {
      if (!layout.windows?.[id]) layout.windows[id] = state
      if (!layout.zOrder?.includes(id)) layout.zOrder.push(id)
    }
    return layout
  }

  function shellHost(id, el = document.getElementById('lsb-shell')) {
    if (id === 'nav') return el?.querySelector?.('#lsb-shell-rail') || null
    if (id === 'site') return el?.querySelector?.('#lsb-shell-aside') || null
    if (id === 'content') return el?.querySelector?.('#lsb-shell-window-content') || null
    const wanted = String(id || '')
    return [...(el?.querySelectorAll?.('[data-lsb-shell-window]') || [])]
      .find((node) => node.getAttribute('data-lsb-shell-window') === wanted) || null
  }

  function ensureWindowChrome(host, id, label) {
    if (!(host instanceof Element)) return null
    host.classList.add('lsb-shell-window')
    host.setAttribute('data-lsb-shell-window', id)
    host.setAttribute('role', 'region')
    if (!host.hasAttribute('tabindex')) host.tabIndex = 0
    const titleId = `lsb-shell-window-${id}-title`
    host.setAttribute('aria-labelledby', titleId)
    let bar = host.querySelector(':scope > [data-lsb-shell-window-bar]')
    if (!bar) {
      bar = document.createElement('div')
      bar.className = 'lsb-shell-window-bar'
      bar.setAttribute('data-lsb-shell-window-bar', '')
      const title = document.createElement('strong')
      title.className = 'lsb-shell-window-title'
      title.id = titleId
      title.textContent = label
      const drag = document.createElement('span')
      drag.className = 'lsb-shell-window-drag'
      drag.setAttribute('data-lsb-shell-window-drag', '')
      drag.setAttribute('aria-hidden', 'true')
      bar.append(title, drag)
      host.prepend(bar)
    } else {
      const title = bar.querySelector('.lsb-shell-window-title')
      if (title) title.textContent = label
    }
    const ensureAction = (kind, text, aria, titleText, handler) => {
      let button = bar.querySelector(`[data-lsb-shell-window-${kind}]`)
      if (!button) {
        button = document.createElement('button')
        button.type = 'button'
        button.className = 'lsb-shell-window-action'
        button.setAttribute(`data-lsb-shell-window-${kind}`, '')
        bar.append(button)
      }
      button.setAttribute('aria-label', aria)
      button.title = titleText
      button.textContent = text
      if (!button.dataset.lsbShellBound) {
        button.dataset.lsbShellBound = '1'
        button.addEventListener('click', (event) => {
          event.preventDefault()
          handler(button)
        })
      }
      return button
    }
    ensureAction('inspect', '⋮', `打开${label}窗口检查器`, '窗口检查器', () => {
      openWindowInspector(id)
    })
    ensureAction('focus', '◎', `聚焦${label}窗口`, '聚焦窗口', () => {
      focusShellWindow(id)
      host.focus?.()
    })
    ensureAction('collapse', '−', `折叠${label}窗口`, '折叠窗口', (button) => {
      toggleShellWindowCollapsed(id, button)
    })
    ensureAction('reset', '↺', `恢复${label}窗口布局`, '恢复布局', () => {
      resetShellWindow(id)
    })
    let body = host.querySelector(':scope > [data-lsb-shell-window-body]')
    if (!body) {
      body = document.createElement('div')
      body.className = 'lsb-shell-window-body'
      body.setAttribute('data-lsb-shell-window-body', '')
      while (bar.nextSibling) body.append(bar.nextSibling)
      host.append(body)
    }
    for (const edge of ['n', 'e', 's', 'w', 'ne', 'nw', 'se', 'sw']) {
      if (host.querySelector(`:scope > [data-lsb-shell-resize-edge="${edge}"]`)) continue
      const handle = document.createElement('span')
      handle.setAttribute('data-lsb-shell-resize-edge', edge)
      handle.setAttribute('aria-label', `调整${label}窗口${edge}边界`)
      handle.setAttribute('role', 'separator')
      host.append(handle)
    }
    return { host, bar, body }
  }

  function applyShellWindowState(id, state, host = shellHost(id)) {
    if (!(host instanceof Element) || !state) return
    host.style.left = `${Math.round(state.x || 0)}px`
    host.style.top = `${Math.round(state.y || 0)}px`
    host.style.width = `${Math.max(1, Math.round(state.width || 1))}px`
    host.style.height = `${Math.max(1, Math.round(state.height || 1))}px`
    host.style.zIndex = String(8000 + Math.max(0, shellWindowLayout?.zOrder?.indexOf(id) ?? 0))
    host.hidden = state.visible === false
    host.dataset.lsbShellActive = state.visible === false ? 'false' : 'true'
    host.dataset.lsbShellWindowId = id
    host.dataset.lsbShellCollapsed = state.collapsed === true ? 'true' : 'false'
    const localGlass = !!styleApi?.sanitizeTokenValue?.('glassOpacity', state.overrides?.glassOpacity)
      || !!styleApi?.sanitizeTokenValue?.('glassBlur', state.overrides?.glassBlur)
    host.dataset.lsbShellGlass = configController.config.glass || localGlass ? 'true' : 'false'
    const oldOverrideProps = host.__lsbShellOverrideProps || new Set()
    for (const prop of oldOverrideProps) host.style.removeProperty(prop)
    const nextOverrideProps = new Set()
    if (styleApi && state.overrides && typeof state.overrides === 'object') {
      const overrideCss = styleApi.tokenCss(state.overrides)
      for (const declaration of overrideCss.split(';')) {
        const index = declaration.indexOf(':')
        if (index <= 0) continue
        const prop = declaration.slice(0, index).trim()
        const value = declaration.slice(index + 1).trim()
        if (!prop.startsWith('--lsb-shell-') || !value) continue
        host.style.setProperty(prop, value)
        nextOverrideProps.add(prop)
      }
    }
    host.__lsbShellOverrideProps = nextOverrideProps
    const body = host.querySelector(':scope > [data-lsb-shell-window-body]')
    if (body) body.hidden = state.collapsed === true
    const collapse = host.querySelector(':scope > [data-lsb-shell-window-bar] [data-lsb-shell-window-collapse]')
    if (collapse) {
      collapse.textContent = state.collapsed === true ? '+' : '−'
      collapse.setAttribute('aria-label', state.collapsed === true ? '展开窗口' : '折叠窗口')
      collapse.title = state.collapsed === true ? '展开窗口' : '折叠窗口'
    }
  }

  function collectShellWindowRegistry(el = document.getElementById('lsb-shell')) {
    const externalViews = syncExternalShellWindows(el)
    const external = typeof ui.shellWindows === 'function'
      ? ui.shellWindows(getAsideContext())
      : []
    const records = [...BUILTIN_WINDOWS]
    for (const item of externalViews) {
      if (records.some((row) => row.id === item.id)) continue
      records.push({
        id: item.id,
        label: item.label || item.id,
        order: Number(item.order) || 100,
        min: item.min || { width: 320, height: 240 },
        defaultRect: item.defaultRect || { width: 376, height: 600 },
        view: item.view,
      })
    }
    for (const view of external) {
      const id = String(view.windowId || view.id || '')
      if (!id || records.some((row) => row.id === id)) continue
      records.push({
        id,
        label: view.label || id,
        order: Number(view.order) || 100,
        min: view.min || { width: 240, height: 160 },
        defaultRect: view.defaultRect || { width: 320, height: 480 },
        view,
      })
    }
    shellWindowRegistry = records.filter((row) => shellHost(row.id, el))
    return shellWindowRegistry
  }

  function applyShellWindowLayout(layout = shellWindowLayout) {
    if (!layout) return
    for (const [id, state] of Object.entries(layout.windows || {})) applyShellWindowState(id, state)
    const workspace = shellWorkspace()
    if (workspace) workspace.dataset.lsbShellBucket = layoutApi.widthBucket(shellViewport(workspace).width)
  }

  function syncExternalShellWindows(el = document.getElementById('lsb-shell')) {
    const workspace = shellWorkspace(el)
    if (!(workspace instanceof Element)) return []
    const context = getAsideContext()
    const asideRecords = ui.shellAsideViews(context)
      .filter((view) => view.windowId && view.windowId !== 'site')
      .map((view) => ({
        id: String(view.windowId),
        label: view.label || view.windowId,
        order: Number(view.order) || 100,
        min: view.min || { width: 320, height: 240 },
        defaultRect: view.defaultRect || { width: 376, height: 600 },
        view,
      }))
    const registered = typeof ui.shellWindows === 'function' ? ui.shellWindows(context) : []
    const records = [...asideRecords, ...registered.map((view) => ({
      id: String(view.windowId || view.id),
      label: view.label || view.id,
      order: Number(view.order) || 100,
      min: view.min || { width: 320, height: 240 },
      defaultRect: view.defaultRect || { width: 376, height: 600 },
      view,
    }))]
    const next = new Map()
    for (const record of records) {
      if (!record.id || next.has(record.id)) continue
      const host = shellHost(record.id, el) || (() => {
        const section = document.createElement('section')
        section.setAttribute('data-lsb-shell-window', record.id)
        workspace.append(section)
        return section
      })()
      ensureWindowChrome(host, record.id, record.label)
      const body = host.querySelector(':scope > [data-lsb-shell-window-body]')
      let current = externalWindowViews.get(record.id)
      if (!current || current.view !== record.view) {
        current?.dispose?.()
        body?.replaceChildren()
        let dispose = null
        try { dispose = record.view?.render?.(body, context) } catch (error) {
          if (body) body.textContent = '窗口加载失败'
          console.error('[LSB skin] 外部窗口渲染失败', record.id, error)
        }
        current = { ...record, host, body, dispose: typeof dispose === 'function' ? dispose : null }
      } else {
        current.host = host
        current.body = body
      }
      host.dataset.lsbShellExternal = 'true'
      host.dataset.lsbShellOpen = record.view?.windowId ? (record.view.id === getAsideActiveId() ? 'true' : 'false') : 'true'
      next.set(record.id, current)
    }
    for (const [id, current] of externalWindowViews) {
      if (next.has(id)) continue
      try { current.dispose?.() } catch (error) { console.error('[LSB skin] 外部窗口清理失败', id, error) }
      current.host?.remove?.()
    }
    externalWindowViews.clear()
    for (const [id, current] of next) externalWindowViews.set(id, current)
    return [...next.values()]
  }

  function focusShellWindow(id, { persist = true } = {}) {
    const wanted = String(id || '')
    if (!shellWindowLayout?.windows?.[wanted]) return ''
    shellWindowLayout.zOrder = [...(shellWindowLayout.zOrder || []).filter((item) => item !== wanted), wanted]
    applyShellWindowLayout(shellWindowLayout)
    if (persist) saveShellLayout()
    return wanted
  }

  function toggleShellWindowCollapsed(id, button = null) {
    const wanted = String(id || '')
    const current = shellWindowLayout?.windows?.[wanted]
    if (!current) return null
    current.collapsed = !current.collapsed
    applyShellWindowLayout(shellWindowLayout)
    if (button) button.focus?.()
    saveShellLayout({ immediate: true })
    return current.collapsed
  }

  function arrangeShellWindows() {
    if (!shellWindowLayout || !layoutApi) return null
    const workspace = shellWorkspace()
    shellWindowLayout = layoutApi.arrangeShellWindows(shellWindowLayout, shellWindowRegistry, shellViewport(workspace))
    applyShellWindowLayout(shellWindowLayout)
    saveShellLayout({ immediate: true })
    return clone(shellWindowLayout)
  }

  function resetShellWindow(id) {
    if (!shellWindowLayout || !layoutApi) return null
    const wanted = String(id || '')
    const workspace = shellWorkspace()
    const defaults = layoutApi.defaultShellLayout({ ...shellViewport(workspace), registry: shellWindowRegistry })
    if (wanted && shellWindowLayout.windows[wanted] && defaults.windows[wanted]) {
      shellWindowLayout.windows[wanted] = defaults.windows[wanted]
    } else if (!wanted) {
      shellWindowLayout = defaults
    }
    applyShellWindowLayout(shellWindowLayout)
    saveShellLayout({ immediate: true })
    return clone(shellWindowLayout)
  }

  function openWindowInspector(id) {
    const wanted = String(id || '')
    const current = shellWindowLayout?.windows?.[wanted]
    const host = shellHost(wanted)
    if (!current || !(host instanceof Element)) return null
    document.querySelector('[data-lsb-shell-window-inspector]')?.remove()
    const mask = document.createElement('div')
    mask.setAttribute('data-lsb-shell-window-inspector', '')
    mask.setAttribute('role', 'dialog')
    mask.setAttribute('aria-modal', 'true')
    mask.style.cssText = 'position:fixed;inset:0;z-index:9000;display:flex;align-items:center;justify-content:center;background:rgb(0 0 0 / 28%);padding:16px;'
    const panel = document.createElement('div')
    panel.style.cssText = 'width:min(360px,92vw);max-height:90vh;overflow:auto;background:var(--panel,#fff);color:var(--text,#222);border:1px solid var(--line,#ddd);border-radius:12px;padding:16px;box-shadow:0 18px 48px rgb(0 0 0 / 24%);'
    const title = document.createElement('h2')
    title.textContent = `${host.querySelector('.lsb-shell-window-title')?.textContent || wanted}窗口检查器`
    title.style.cssText = 'font-size:16px;margin:0 0 12px;'
    panel.append(title)
    const fields = new Map()
    const styleModel = styleApi?.moduleInspectorModel?.(shellWindowLayout, wanted) || { values: {}, inherited: {} }
    const overrideNames = ['fontFamily', 'baseFontSize', 'glassOpacity', 'glassBlur']
    const addField = (name, labelText, type = 'text', value = '', step = '') => {
      const label = document.createElement('label')
      label.style.cssText = 'display:flex;align-items:center;gap:8px;margin:8px 0;font-size:13px;'
      const text = document.createElement('span')
      text.textContent = labelText
      const input = document.createElement('input')
      input.type = type
      input.setAttribute('data-lsb-shell-inspector-field', name)
      if (type === 'number' && step) input.step = step
      input.value = value ?? ''
      input.style.cssText = 'flex:1;min-width:0;'
      label.append(text, input)
      panel.append(label)
      fields.set(name, input)
    }
    const visible = document.createElement('label')
    visible.style.cssText = 'display:flex;gap:8px;align-items:center;margin:8px 0;font-size:13px;'
    const visibleInput = document.createElement('input')
    visibleInput.type = 'checkbox'
    visibleInput.checked = current.visible !== false
    const visibleText = document.createElement('span')
    visibleText.textContent = '显示窗口'
    visible.append(visibleInput, visibleText)
    panel.append(visible)
    const collapsed = document.createElement('label')
    collapsed.style.cssText = visible.style.cssText
    const collapsedInput = document.createElement('input')
    collapsedInput.type = 'checkbox'
    collapsedInput.checked = current.collapsed === true
    const collapsedText = document.createElement('span')
    collapsedText.textContent = '折叠窗口'
    collapsed.append(collapsedInput, collapsedText)
    panel.append(collapsed)
    addField('width', '宽度', 'number', current.width)
    addField('height', '高度', 'number', current.height)
    const inspectorField = (name, labelText, type = 'text', step = '') => {
      const raw = current.overrides?.[name] ?? styleModel.values?.[name] ?? ''
      const value = type === 'number' ? String(raw).replace(/px$/i, '') : raw
      addField(name, labelText, type, value, step)
    }
    inspectorField('fontFamily', '局部字体')
    inspectorField('baseFontSize', '局部字号', 'number', '1')
    inspectorField('glassOpacity', '局部透明度', 'number', '0.01')
    inspectorField('glassBlur', '局部玻璃模糊', 'number', '1')
    const inherit = document.createElement('label')
    inherit.style.cssText = visible.style.cssText
    const inheritInput = document.createElement('input')
    inheritInput.type = 'checkbox'
    inheritInput.checked = overrideNames.every((name) => styleModel.inherited?.[name] !== false)
    const inheritText = document.createElement('span')
    inheritText.textContent = '局部样式继承全局'
    inherit.append(inheritInput, inheritText)
    panel.append(inherit)
    for (const name of overrideNames) {
      fields.get(name)?.addEventListener('input', () => {
        if (String(fields.get(name).value || '').trim()) inheritInput.checked = false
      })
    }
    const actions = document.createElement('div')
    actions.style.cssText = 'display:flex;justify-content:flex-end;gap:8px;margin-top:14px;'
    const cancel = document.createElement('button')
    cancel.type = 'button'
    cancel.textContent = '取消'
    const save = document.createElement('button')
    save.type = 'button'
    save.textContent = '保存'
    save.className = 'lsb-btn is-primary'
    actions.append(cancel, save)
    panel.append(actions)
    mask.append(panel)
    document.body.append(mask)
    const close = () => mask.remove()
    cancel.addEventListener('click', close)
    mask.addEventListener('click', (event) => { if (event.target === mask) close() })
    save.addEventListener('click', () => {
      const next = { ...current }
      next.visible = visibleInput.checked
      next.collapsed = collapsedInput.checked
      next.width = Number(fields.get('width').value)
      next.height = Number(fields.get('height').value)
      const overrides = { ...(current.overrides || {}) }
      for (const name of overrideNames) {
        if (inheritInput.checked || !String(fields.get(name).value || '').trim()) delete overrides[name]
        else overrides[name] = fields.get(name).value
      }
      next.overrides = overrides
      shellWindowLayout.windows[wanted] = next
      shellWindowLayout = layoutApi.sanitizeShellLayout(shellWindowLayout, {
        ...shellViewport(shellWorkspace()),
        registry: shellWindowRegistry,
      })
      applyShellWindowLayout(shellWindowLayout)
      saveShellLayout({ immediate: true })
      syncResponsiveMode()
      close()
    })
    panel.querySelector('input')?.focus?.()
    return mask
  }

  function windowBounds() {
    return layoutApi
      ? { x: 0, y: 0, ...shellViewport(shellWorkspace()) }
      : { x: 0, y: 0, width: Number(window.innerWidth || 1), height: Number(window.innerHeight || 1) }
  }

  function windowMin(id) {
    return shellWindowRegistry.find((item) => item.id === id)?.min || { width: 240, height: 160 }
  }

  function windowOthers(id) {
    return Object.entries(shellWindowLayout?.windows || {})
      .filter(([otherId, state]) => otherId !== id && state?.visible !== false)
      .map(([, state]) => state)
  }

  function interactionEventPosition(event) {
    return { x: Number(event.clientX || 0), y: Number(event.clientY || 0) }
  }

  function interactionNextRect(state, { snap = false } = {}) {
    const dx = state.last.x - state.start.x
    const dy = state.last.y - state.start.y
    const next = { ...state.origin }
    if (state.kind === 'drag') {
      next.x += dx
      next.y += dy
    } else {
      const edge = state.edge
      if (edge.includes('w')) {
        next.x += dx
        next.width -= dx
      }
      if (edge.includes('e')) next.width += dx
      if (edge.includes('n')) {
        next.y += dy
        next.height -= dy
      }
      if (edge.includes('s')) next.height += dy
    }
    return layoutApi.snapRect(next, {
      bounds: windowBounds(),
      others: windowOthers(state.id),
      min: windowMin(state.id),
      grid: snap ? undefined : 1,
      threshold: snap ? undefined : 0,
    })
  }

  function flushWindowInteraction() {
    const state = windowInteractionState
    windowInteractionRaf = 0
    if (!state || !shellWindowLayout?.windows?.[state.id]) return
    const next = interactionNextRect(state)
    state.pending = next
    if (state.kind === 'drag') {
      state.host.style.transform = `translate3d(${next.x - state.origin.x}px,${next.y - state.origin.y}px,0)`
    } else {
      state.host.style.left = `${next.x}px`
      state.host.style.top = `${next.y}px`
      state.host.style.width = `${next.width}px`
      state.host.style.height = `${next.height}px`
    }
  }

  function scheduleWindowInteraction() {
    if (windowInteractionRaf) return
    const raf = window.requestAnimationFrame || ((fn) => window.setTimeout(fn, 0))
    windowInteractionRaf = raf(flushWindowInteraction)
  }

  function endWindowInteraction(event) {
    const state = windowInteractionState
    if (!state) return
    if (event?.type === 'pointerup' && Number.isFinite(event.clientX) && Number.isFinite(event.clientY)) {
      state.last = interactionEventPosition(event)
    }
    if (windowInteractionRaf) {
      const cancel = window.cancelAnimationFrame || window.clearTimeout
      cancel(windowInteractionRaf)
      windowInteractionRaf = 0
    }
    flushWindowInteraction()
    const finalRect = state.pending ? interactionNextRect(state, { snap: true }) : state.origin
    const current = shellWindowLayout?.windows?.[state.id]
    if (current) shellWindowLayout.windows[state.id] = { ...current, ...finalRect }
    state.host.style.transform = ''
    delete state.host.dataset.lsbShellInteracting
    applyShellWindowLayout(shellWindowLayout)
    saveShellLayout({ immediate: true })
    window.removeEventListener('pointermove', onWindowPointerMove)
    window.removeEventListener('pointerup', endWindowInteraction)
    window.removeEventListener('pointercancel', endWindowInteraction)
    try { state.captureTarget?.releasePointerCapture?.(state.pointerId) } catch { /* jsdom/旧浏览器没有 pointer capture */ }
    windowInteractionState = null
  }

  function onWindowPointerMove(event) {
    if (!windowInteractionState) return
    windowInteractionState.last = interactionEventPosition(event)
    scheduleWindowInteraction()
  }

  function beginWindowInteraction(event, host, id, kind, edge = '') {
    if (event.button != null && event.button !== 0) return
    const current = shellWindowLayout?.windows?.[id]
    if (!current) return
    event.preventDefault()
    focusShellWindow(id, { persist: false })
    const point = interactionEventPosition(event)
    windowInteractionState = {
      id,
      host,
      kind,
      edge,
      start: point,
      last: point,
      origin: { x: current.x, y: current.y, width: current.width, height: current.height },
      pending: null,
      pointerId: event.pointerId,
      captureTarget: event.currentTarget,
    }
    host.dataset.lsbShellInteracting = kind
    try { event.currentTarget?.setPointerCapture?.(event.pointerId) } catch { /* jsdom/旧浏览器没有 pointer capture */ }
    window.addEventListener('pointermove', onWindowPointerMove)
    window.addEventListener('pointerup', endWindowInteraction, { once: false })
    window.addEventListener('pointercancel', endWindowInteraction, { once: false })
  }

  function keyWindowHost(event) {
    const target = event?.target
    if (target?.closest) {
      const fromTarget = target.closest('[data-lsb-shell-window]')
      if (fromTarget) return fromTarget
    }
    const active = document.activeElement
    return active?.closest?.('[data-lsb-shell-window]') || null
  }

  function onWindowKeyDown(event) {
    const host = keyWindowHost(event)
    if (!(host instanceof Element)) return
    const id = host.getAttribute('data-lsb-shell-window') || ''
    if (!shellWindowLayout?.windows?.[id]) return
    if (event.key === 'Escape') {
      if (windowInteractionState) {
        event.preventDefault()
        endWindowInteraction()
      }
      return
    }
    if (!['ArrowLeft', 'ArrowRight', 'ArrowUp', 'ArrowDown'].includes(event.key)) return
    const target = event.target
    if (target?.matches?.('input, textarea, select, button, a, [contenteditable="true"]')) return
    const current = shellWindowLayout.windows[id]
    const step = 12
    const next = { ...current }
    if (event.shiftKey) {
      if (event.key === 'ArrowLeft') { next.x += step; next.width -= step }
      if (event.key === 'ArrowRight') next.width += step
      if (event.key === 'ArrowUp') { next.y += step; next.height -= step }
      if (event.key === 'ArrowDown') next.height += step
    } else {
      if (event.key === 'ArrowLeft') next.x -= step
      if (event.key === 'ArrowRight') next.x += step
      if (event.key === 'ArrowUp') next.y -= step
      if (event.key === 'ArrowDown') next.y += step
    }
    const clean = layoutApi.snapRect(next, {
      bounds: windowBounds(),
      others: windowOthers(id),
      min: windowMin(id),
    })
    event.preventDefault()
    focusShellWindow(id)
    shellWindowLayout.windows[id] = { ...current, ...clean }
    applyShellWindowLayout(shellWindowLayout)
    saveShellLayout()
  }

  function syncResponsiveMode(el = document.getElementById('lsb-shell')) {
    if (!(el instanceof Element) || !shellWindowEnabled()) return
    const workspace = shellWorkspace(el)
    const viewport = shellViewport(workspace)
    const width = viewport.width
    const bucket = layoutApi.widthBucket(width)
    const key = shellLayoutStorageKey(viewport)
    if (shellWindowLayout && shellLayoutKey && key !== shellLayoutKey) {
      saveShellLayout({ immediate: true })
      shellWindowLayout = loadShellLayout(viewport)
      shellWindowLayout = ensureRegisteredShellLayout(shellWindowLayout, viewport)
      applyShellWindowLayout(shellWindowLayout)
    } else if (shellWindowLayout) {
      shellWindowLayout = layoutApi.sanitizeShellLayout(shellWindowLayout, {
        ...viewport,
        registry: shellWindowRegistry,
      })
      applyShellWindowLayout(shellWindowLayout)
    }
    el.dataset.lsbShellBucket = bucket
    const switcher = el.querySelector('[data-lsb-shell-window-switcher]')
    if (switcher) {
      switcher.replaceChildren()
      for (const item of shellWindowRegistry) {
        const button = document.createElement('button')
        button.type = 'button'
        button.setAttribute('role', 'tab')
        button.setAttribute('data-lsb-shell-window-switch', item.id)
        button.setAttribute('aria-controls', shellHost(item.id, el)?.id || `lsb-shell-window-${item.id}`)
        button.textContent = item.label
        button.addEventListener('click', () => {
          narrowActiveWindow = item.id
          const external = externalWindowViews.get(item.id)
          if (external?.view?.id) setAsideActive(external.view.id, el.querySelector('#lsb-shell-aside'), true)
          focusShellWindow(item.id)
          syncResponsiveMode(el)
        })
        switcher.append(button)
      }
    }
    const available = shellWindowRegistry.filter((item) => shellWindowLayout?.windows?.[item.id]?.visible !== false)
    if (!available.some((item) => item.id === narrowActiveWindow)) narrowActiveWindow = available[0]?.id || 'content'
    for (const item of shellWindowRegistry) {
      const host = shellHost(item.id, el)
      if (!(host instanceof Element)) continue
      const active = bucket !== 'narrow' || item.id === narrowActiveWindow
      host.dataset.lsbShellActive = active ? 'true' : 'false'
      const tab = switcher?.querySelector(`[data-lsb-shell-window-switch="${item.id}"]`)
      if (tab) tab.setAttribute('aria-selected', active ? 'true' : 'false')
    }
  }

  function bindWindowInteractions(el = document.getElementById('lsb-shell')) {
    if (!(el instanceof Element) || !shellWindowEnabled()) return
    for (const item of shellWindowRegistry) {
      const host = shellHost(item.id, el)
      if (!(host instanceof Element)) continue
      if (host.dataset.lsbShellWindowInteractionsBound !== '1') {
        host.dataset.lsbShellWindowInteractionsBound = '1'
        const bar = host.querySelector(':scope > [data-lsb-shell-window-bar]')
        bar?.addEventListener('pointerdown', (event) => {
          if (event.target.closest?.('[data-lsb-shell-window-action], [data-lsb-shell-resize-edge], input, textarea, select, button, a')) return
          beginWindowInteraction(event, host, item.id, 'drag')
        })
        host.addEventListener('pointerdown', (event) => {
          if (event.target.closest?.('[data-lsb-shell-window-action], [data-lsb-shell-window-bar], [data-lsb-shell-resize-edge], input, textarea, button, a')) return
          focusShellWindow(item.id)
          if (event.currentTarget === host && event.target === host) host.focus?.()
        })
        host.addEventListener('focus', () => focusShellWindow(item.id))
        for (const handle of host.querySelectorAll('[data-lsb-shell-resize-edge]')) {
          handle.addEventListener('pointerdown', (event) => beginWindowInteraction(event, host, item.id, 'resize', handle.getAttribute('data-lsb-shell-resize-edge') || 'se'))
        }
      }
    }
    if (!windowInteractionBound) {
      windowInteractionBound = true
      window.addEventListener('keydown', onWindowKeyDown)
      if (!responsiveBound) {
        responsiveBound = true
        responsiveHandler = () => syncResponsiveMode(el)
        window.addEventListener('resize', responsiveHandler)
      }
    }
  }

  function unbindWindowInteractions() {
    endWindowInteraction()
    windowInteractionBound = false
    window.removeEventListener('keydown', onWindowKeyDown)
    if (responsiveBound) {
      responsiveBound = false
      if (responsiveHandler) window.removeEventListener('resize', responsiveHandler)
      responsiveHandler = null
    }
  }

  function mountContentWindow(el = document.getElementById('lsb-shell')) {
    const content = shellHost('content', el)
    const body = content?.querySelector?.('[data-lsb-shell-window-body]')
    if (!(content instanceof Element) || !(body instanceof Element)) return
    contentController.mount(findOutlet(), body)
  }

  function mountShellWindows(el = document.getElementById('lsb-shell')) {
    if (!(el instanceof Element) || !shellWindowEnabled()) return
    const workspace = shellWorkspace(el)
    if (!(workspace instanceof Element)) return
    const nav = shellHost('nav', el)
    const site = shellHost('site', el)
    const content = shellHost('content', el)
    ensureWindowChrome(nav, 'nav', '导航')
    ensureWindowChrome(site, 'site', '站点')
    ensureWindowChrome(content, 'content', '正文')
    mountContentWindow(el)
    collectShellWindowRegistry(el)
    const viewport = shellViewport(workspace)
    const key = shellLayoutStorageKey(viewport)
    if (shellWindowLayout && shellLayoutKey === key) {
      shellWindowLayout = layoutApi.sanitizeShellLayout(shellWindowLayout, { ...viewport, registry: shellWindowRegistry })
    } else {
      if (shellWindowLayout && shellLayoutKey && shellLayoutKey !== key) saveShellLayout({ immediate: true })
      shellWindowLayout = loadShellLayout(viewport)
    }
    shellWindowLayout = ensureRegisteredShellLayout(shellWindowLayout, viewport)
    applyShellWindowLayout(shellWindowLayout)
    el.dataset.lsbShellMode = 'windowed'
    if (content) content.dataset.lsbShellActive = 'true'
    syncResponsiveMode(el)
    bindWindowInteractions(el)
  }

  function unmountShellWindows() {
    saveShellLayout({ immediate: true })
    window.clearTimeout(shellLayoutSaveTimer)
    shellLayoutSaveTimer = 0
    contentController.release()
    shellWindowLayout = null
    shellWindowRegistry = []
    shellLayoutKey = ''
  }

  return {
    enabled: shellWindowEnabled, workspace: shellWorkspace, viewport: shellViewport, host: shellHost,
    focus: focusShellWindow, arrange: arrangeShellWindows, reset: resetShellWindow,
    unbind: unbindWindowInteractions, mount: mountShellWindows, unmount: unmountShellWindows,
    get layout() { return shellWindowLayout },
    get registry() { return shellWindowRegistry },
    get externalViews() { return externalWindowViews },
  }
}
