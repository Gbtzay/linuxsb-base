// @skin-part: F2 collectTools/invalidateTools: 工具菜单
// · F2 collectTools/invalidateTools: 工具菜单（入口与失效） ──
    function collectTools() {
      if (toolsCache) return toolsCache
      const w = typeof unsafeWindow !== 'undefined' ? unsafeWindow : window
      const active = new Set(
        (w.LSB?.info?.().plugins || []).filter((p) => p.state === 'active').map((p) => p.id),
      )
      toolsCache = PLUGIN_FEATURES
        .filter((tool) => active.has(tool.plugin))
        .map(({ panel, rpc, label }) => (rpc ? { rpc, label } : { panel, label }))
      return toolsCache
    }

    function invalidateTools() {
      toolsCache = null
    }
