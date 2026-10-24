// @skin-part: D2 restyle: 按兴趣重写布局骨架
// · D2 restyle: 按兴趣重写布局骨架（topic/suite 归一） ──
    function restyle() {
      applyMarkers()
      applyShellTokens()
      const id = 'lsb-skin-style'
      let el = document.getElementById(id)
      if (!el) {
        el = document.createElement('style')
        el.id = id
        document.head.appendChild(el)
      }
      el.textContent = css()
    }
