const SKIN_PLUGIN_FEATURES = [
  { plugin: 'reading-center', rpc: 'reading-center:open', label: '阅读中心' },
  // @LSB_DEV_AI_START
  { plugin: 'ai-summary', panel: 'ai-summary-history', label: 'AI 历史' },
  // @LSB_DEV_AI_END
  { plugin: 'checkin-calendar', panel: 'checkin-calendar', label: '签到日历' },
  { plugin: 'points-title-workbench', rpc: 'points-title-workbench:open', label: '积分-称号' },
  { plugin: 'annual-report', panel: 'annual-report', label: '年度报告' },
]

/** Both skins resolve live capabilities, including again at activation time. */
export function createSkinPluginCatalog({ getInfo, ui, request }) {
  function settings() {
    return ui.settingsPlugins()
  }

  function features() {
    const info = getInfo() || {}
    const states = new Map((info.plugins || []).map((plugin) => [plugin.id, plugin.state]))
    const panels = new Set(ui.panels().map((panel) => panel.id))
    const handlers = new Set((info.handlers || []).map((handler) => handler.name))
    const configured = new Set(settings().map((plugin) => plugin.id))
    return SKIN_PLUGIN_FEATURES
      .filter((item) => states.get(item.plugin) === 'active')
      .filter((item) => item.panel ? panels.has(item.panel) : handlers.has(item.rpc))
      .map((item) => ({ ...item, hasSettings: configured.has(item.plugin) }))
  }

  function tools() {
    return features().map(({ plugin, panel, rpc, label }) => rpc ? { plugin, rpc, label } : { plugin, panel, label })
  }

  async function openFeature(pluginId) {
    const entry = features().find((item) => item.plugin === pluginId)
    if (!entry) {
      ui.toast('这个插件功能当前不可用', { type: 'info' })
      return false
    }
    try {
      if (entry.panel) ui.openPanel(entry.panel)
      else await request(entry.rpc)
      return true
    } catch {
      ui.toast('插件功能打开失败', { type: 'error' })
      return false
    }
  }

  function openSettings(pluginId) {
    if (!settings().some((item) => item.id === pluginId)) {
      ui.toast('这个插件没有可用的设置表单', { type: 'info' })
      return false
    }
    try {
      ui.openPluginSettings(pluginId)
      return true
    } catch {
      ui.toast('插件设置当前不可用', { type: 'error' })
      return false
    }
  }

  return { features, settings, tools, openFeature, openSettings }
}
