// @skin-part: D1 applyMarkers: 逐容器打点与兴趣节点标记 — 闭包：cfg / canvasEffective / api / shell*Api 等。侧车仅用于 review，聚合需注入。
// · D1 applyMarkers: 逐容器打点与兴趣节点标记 ──
    function applyMarkers() {
      const root = document.documentElement
      const shellOn = shellUiActive()
      const canvasOn = !!cfg.shell && effectiveUiMode() === 'ios27'
      const shellHome = shellOn && (pagePath() === '/' || pagePath() === '/index.php')
      root.classList.toggle('lsb-skin-type-on', !!cfg.typography)
      root.classList.toggle('lsb-skin-density-compact', cfg.density === '紧凑')
      root.classList.toggle('lsb-skin-code-on', !!cfg.codeblock)
      root.classList.toggle('lsb-skin-floors-on', !!cfg.floors)
      root.classList.toggle('lsb-skin-measure-on', !!cfg.measure)
      root.classList.toggle('lsb-skin-shell-on', shellOn)
      root.classList.toggle('lsb-skin-shell-home', shellHome)
      root.classList.toggle('lsb-canvas-mode', canvasOn)
      root.classList.toggle('lsb-skin-shell-topic', shellOn && api.page?.type === 'topic')
      root.classList.toggle('lsb-skin-shell-user', shellOn && api.page?.type === 'user')
      /* 旧模式始终为固定三栏；窗口化布局已不再是可选模式。 */
      root.classList.remove('lsb-skin-shell-windowed')
      root.removeAttribute('data-lsb-shell-mode')
    }
