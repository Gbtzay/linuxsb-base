// @skin-part: F1 collectBoards: 版块清单与插件特性聚合
// · F1 collectBoards: 版块清单与插件特性聚合 ──
    function collectBoards() {
      const forums = api.forums || []
      const cached = api.store.get('boardCounts') || {}
      const live = {}
      for (const f of forums) {
        if (Number.isFinite(f.topics)) live[f.id] = f.topics
      }
      const counts = { ...cached, ...live }
      if (Object.keys(live).length) api.store.set('boardCounts', counts)
      if (forums.length) {
        return forums.map((f) => ({
          href: `/forum/${f.id}`,
          label: f.name,
          count: counts[f.id],
        }))
      }
      const seen = new Set()
      const out = []
      for (const a of document.querySelectorAll('.forum-nav a[href^="/forum/"]')) {
        const href = a.getAttribute('href')
        const label = (a.textContent || '').trim()
        if (!href || seen.has(href)) continue
        seen.add(href)
        const id = Number((href.match(/\/forum\/(\d+)/) || [])[1])
        out.push({ href, label, count: counts[id] })
      }
      return out
    }

    const PLUGIN_FEATURES = [
      { plugin: 'ai-summary', panel: 'ai-summary-history', label: 'AI 历史' },
      { plugin: 'checkin-calendar', panel: 'checkin-calendar', label: '签到日历' },
      { plugin: 'points-title-workbench', rpc: 'points-title-workbench:open', label: '积分-称号' },
      { plugin: 'annual-report', panel: 'annual-report', label: '年度报告' },
    ]

    function collectPluginFeatureEntries() {
      const w = typeof unsafeWindow !== 'undefined' ? unsafeWindow : window
      const info = w.LSB?.info?.() || {}
      const states = new Map((info.plugins || []).map((plugin) => [plugin.id, plugin.state]))
      const panelIds = new Set(api.ui.panels().map((panel) => panel.id))
      const handlers = new Set((info.handlers || []).map((handler) => handler.name))
      const settings = new Set(api.ui.settingsPlugins().map((plugin) => plugin.id))
      return PLUGIN_FEATURES
        .filter((item) => states.get(item.plugin) === 'active')
        .filter((item) => item.panel ? panelIds.has(item.panel) : handlers.has(item.rpc))
        .map((item) => ({ ...item, hasSettings: settings.has(item.plugin) }))
    }

    function collectPluginSettingsEntries() {
      return api.ui.settingsPlugins()
    }

    function renderPluginFeatureEntries() {
      const host = canvasSurface('plugin-features-sheet')?.querySelector('[data-plugin-feature-list]')
      if (!(host instanceof Element)) return
      host.replaceChildren()
      const entries = collectPluginFeatureEntries()
      if (!entries.length) {
        const empty = document.createElement('p')
        empty.className = 'lsb-empty'
        empty.textContent = '目前没有可用的插件功能。'
        host.append(empty)
        return
      }
      for (const entry of entries) {
        const row = document.createElement('div')
        row.className = 'lsb-plugin-entry'
        row.setAttribute('data-plugin-feature-entry', entry.plugin)
        const action = document.createElement('button')
        action.type = 'button'
        action.className = 'lsb-plugin-entry-main'
        action.setAttribute('data-plugin-feature-action', entry.plugin)
        action.textContent = entry.label
        row.append(action)
        if (entry.hasSettings) {
          const settings = document.createElement('button')
          settings.type = 'button'
          settings.className = 'lsb-plugin-entry-settings'
          settings.setAttribute('data-plugin-settings-open', entry.plugin)
          settings.setAttribute('aria-label', `打开${entry.label}设置`)
          settings.title = `${entry.label}设置`
          settings.textContent = '⚙'
          row.append(settings)
        }
        host.append(row)
      }
    }

    function pluginStateLabel(state) {
      if (state === 'disabled') return '已停用'
      if (state === 'skipped') return '当前页面未启用'
      if (state === 'error') return '异常'
      if (state === 'registered') return '等待启用'
      return ''
    }

    function renderPluginSettingsEntries() {
      const host = canvasSurface('plugin-settings-sheet')?.querySelector('[data-plugin-settings-list]')
      if (!(host instanceof Element)) return
      host.replaceChildren()
      const entries = collectPluginSettingsEntries()
      if (!entries.length) {
        const empty = document.createElement('p')
        empty.className = 'lsb-empty'
        empty.textContent = '没有声明配置项的插件。'
        host.append(empty)
        return
      }
      for (const entry of entries) {
        const button = document.createElement('button')
        button.type = 'button'
        button.className = 'lsb-plugin-settings-entry'
        button.setAttribute('data-plugin-settings-entry', entry.id)
        const name = document.createElement('span')
        name.textContent = entry.name || entry.id
        button.append(name)
        const state = pluginStateLabel(entry.state)
        if (state) {
          const status = document.createElement('small')
          status.textContent = state
          button.append(status)
        }
        host.append(button)
      }
    }
