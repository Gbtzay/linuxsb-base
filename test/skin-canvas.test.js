import test from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { JSDOM } from 'jsdom'
import {
  clampSurfaceRect,
  defaultCanvasState,
  mergeCanvasState,
  migrateLegacySkinState,
  resolveSurfaceMode,
  siteKeyFromLocation,
  widthClass,
} from '../src/shell-canvas.js'

const baseCode = readFileSync(new URL('../dist-dev/linuxsb-base.user.js', import.meta.url), 'utf8')
const skinCode = readFileSync(new URL('../plugins/skin.user.js', import.meta.url), 'utf8')
const fixtures = {
  home: readFileSync(new URL('./fixtures/home.html', import.meta.url), 'utf8'),
  forum: readFileSync(new URL('./fixtures/home.html', import.meta.url), 'utf8'),
  topic: readFileSync(new URL('./fixtures/topic1.html', import.meta.url), 'utf8'),
  user: readFileSync(new URL('./fixtures/user1.html', import.meta.url), 'utf8'),
  settings: readFileSync(new URL('./fixtures/settings.html', import.meta.url), 'utf8'),
}

function makeDom(kind, width = 1200, skinConfig = null, canvasState = null, prepare = null) {
  const path = kind === 'home' ? '/' : kind === 'forum' ? '/forum/1' : kind === 'topic' ? '/topic/1' : kind === 'user' ? '/user/1' : '/settings'
  const dom = new JSDOM(fixtures[kind], { url: `https://linux.sb${path}`, runScripts: 'outside-only' })
  const w = dom.window
  w.unsafeWindow = w
  Object.defineProperty(w, 'innerWidth', { configurable: true, value: width })
  Object.defineProperty(w, 'innerHeight', { configurable: true, value: 800 })
  w.requestAnimationFrame = (fn) => setTimeout(() => fn(Date.now()), 0)
  w.scrollTo = () => {}
  w.localStorage.setItem('lsb_base:skin:__config', JSON.stringify({ uiMode: 'ios27', ...(skinConfig || {}) }))
  if (canvasState) w.localStorage.setItem('lsb_base:skin:canvas-state:v2', JSON.stringify(canvasState))
  prepare?.(w)
  w.eval(baseCode)
  w.eval(skinCode)
  return { w, wait: (ms = 80) => new Promise((resolve) => setTimeout(resolve, ms)) }
}

test('单画布状态边界、站点隔离和预设默认值', () => {
  assert.equal(widthClass(1100), 'wide')
  assert.equal(widthClass(1099), 'mid')
  assert.equal(widthClass(699), 'narrow')
  assert.equal(siteKeyFromLocation(new URL('https://linux.sb/topic/1')), 'https://linux.sb')
  const state = defaultCanvasState()
  assert.equal(state.version, 2)
  assert.equal(state.global.preset, 'balanced-glass')
  assert.equal(mergeCanvasState(state, { appearance: { fontSize: 18 } }).appearance.fontSize, 18)
  assert.equal(mergeCanvasState(state, { appearance: { fontSize: 18 } }).preset, 'balanced-glass')
  assert.deepEqual(clampSurfaceRect({ x: -10, y: 900, width: 999, height: 999 }, { width: 500, height: 400 }), { x: 0, y: 0, width: 500, height: 400 })
  assert.equal(resolveSurfaceMode('wide', 'ai-card'), 'floating')
  assert.equal(resolveSurfaceMode('wide', 'site-card'), 'rail')
  assert.equal(resolveSurfaceMode('mid', 'ai-card'), 'sheet')
  assert.equal(resolveSurfaceMode('mid', 'site-card'), 'sheet')
  assert.equal(resolveSurfaceMode('narrow', 'ai-card'), 'fullscreen')
  assert.equal(resolveSurfaceMode('narrow', 'site-card'), 'fullscreen')
  assert.equal(migrateLegacySkinState({ shell: false }).enabled, false)
})

test('旧皮肤配置只迁移一次并保留关闭壳选择', async () => {
  const { w, wait } = makeDom('topic', 1200, { shell: false, glassOpacity: 0.44, glassBlur: 6, baseFontSize: 17 })
  await wait()
  const stored = JSON.parse(w.localStorage.getItem('lsb_base:skin:canvas-state:v2'))
  assert.equal(stored.version, 2)
  assert.equal(stored.enabled, false)
  assert.equal(stored.global.appearance.opacity, 0.44)
  assert.equal(stored.global.appearance.blur, 6)
  assert.equal(stored.legacyLayoutSnapshot.shell, false)
  assert.equal(w.document.querySelector('#lsb-shell'), null)
})

test('五类页面挂载单画布宿主，正文和原生侧栏保持原 DOM', async (t) => {
  for (const kind of Object.keys(fixtures)) {
    await t.test(kind, async () => {
      const { w, wait } = makeDom(kind)
      await wait()
      assert.ok(w.document.querySelector('#lsb-shell[data-lsb-canvas-shell="true"]'))
      assert.ok(w.document.getElementById('lsb-shell-surfaces'))
      assert.equal(w.document.querySelector('#lsb-shell aside.sidebar'), null)
      assert.ok(w.document.querySelector('main.wrap'))
      assert.equal(w.document.getElementById('lsb-shell-boot-frame'), null)
      assert.equal(w.document.documentElement.classList.contains('lsb-canvas-boot'), false)
      const native = w.document.querySelector('aside.sidebar')
      if (native) assert.notEqual(native.closest('#lsb-shell'), native)
      const debug = await w.LSB.bus.request('skin:debug')
      assert.equal(debug.canvas.version, 2)
      assert.equal(debug.canvas.siteKey, 'https://linux.sb')
      w.LSB.disable('skin')
      await wait(20)
      assert.equal(w.document.getElementById('lsb-shell'), null)
    })
  }
})

test('统一工具 Sheet 互斥且不渲染旧模式选项卡', async () => {
  const { w, wait } = makeDom('topic')
  await wait()
  const open = (selector) => w.document.querySelector(selector).dispatchEvent(new w.MouseEvent('click', { bubbles: true }))
  open('[data-canvas-open="tool-sheet"]')
  assert.equal(w.document.querySelector('[data-surface="tool-sheet"]').hidden, false)
  assert.equal(w.document.querySelector('[data-surface="tool-sheet"]').textContent.includes('@当前页面'), false)
  assert.equal(w.document.querySelector('[data-surface="tool-sheet"]').textContent.includes('/提问类'), false)
  open('[data-tool-action="site-card"]')
  assert.equal(w.document.querySelector('[data-surface="tool-sheet"]').hidden, true)
  assert.equal(w.document.querySelector('[data-surface="site-card"]').hidden, true)
  assert.equal(w.document.querySelector('[data-canvas-site-status-host]').dataset.expanded, 'true')
})

test('画布浮层使用统一遮罩并隐藏旧版 H 入口', async () => {
  const { w, wait } = makeDom('topic', 1200)
  await wait()
  const style = w.document.getElementById('lsb-skin-style')?.textContent || ''
  assert.match(style, /html\.lsb-skin-shell-on \.lsb-launcher\{display:none!important\}/)
  const open = w.document.querySelector('[data-canvas-open="tool-sheet"]')
  open.click()
  const backdrop = w.document.querySelector('[data-canvas-backdrop]')
  assert.ok(backdrop)
  assert.equal(backdrop.hidden, false)
  w.document.querySelector('[data-canvas-close]').click()
  assert.equal(backdrop.hidden, true)
})

test('Liquid Glass 导航与过渡令牌', async () => {
  const { w, wait } = makeDom('home', 1200)
  await wait()
  const style = w.document.getElementById('lsb-skin-style')?.textContent || ''
  assert.match(style, /--lsb-glass-fill/, '应声明统一玻璃填充令牌')
  assert.match(style, /--lsb-glass-highlight/, '应声明玻璃边缘高光令牌')
  assert.match(style, /data-surface="top-status"[^}]*backdrop-filter/, '顶部状态栏应使用玻璃层')
  assert.match(style, /data-surface="tool-capsule"[^}]*backdrop-filter/, '底部工具胶囊应使用玻璃层')
  assert.match(style, /lsb-canvas-content-root[^}]*background/, '正文区域应保持不透明阅读背景')
  assert.match(style, /data-canvas-sheet-grabber/, 'Sheet 应提供拖拽指示条')
  const progressRule = style.match(/#lsb-shell-progress\{([^}]*)\}/)?.[1] || ''
  assert.match(progressRule, /height:3px/, '导航进度线高 3px')
  assert.match(progressRule, /pointer-events:none/, '进度线不得拦截正文交互')
  assert.doesNotMatch(style, /lsb-shell-route-transition/, '正文区域不再生成过渡胶囊')
  assert.match(style, /prefers-reduced-transparency/, '应支持减少透明度降级')
  assert.match(style, /prefers-reduced-motion/, '应支持减少动效降级')
  assert.match(style, /\[data-lsb-route-content-enter\]\{animation:lsb-route-content-in 180ms/)
  assert.match(style, /@keyframes lsb-route-content-in/)
  assert.match(style, /html\.lsb-canvas-reduced-motion \[data-lsb-route-content-enter\]\{animation:none!important;transform:none!important\}/)
  assert.match(style, /prefers-reduced-motion:reduce\)[\s\S]*?\[data-lsb-route-content-enter\]\{animation:none!important;transform:none!important\}/)
  assert.match(
    style,
    /html\.lsb-canvas-reduced-motion #lsb-shell-progress \[data-lsb-shell-progress-bar\]\{transition:none!important\}/,
    '用户的减少动效设置也应关闭进度条内层变换动画',
  )
})

test('导航中的新帖子入口使用站点实际排序路由', async () => {
  const { w, wait } = makeDom('home', 1200)
  await wait()
  w.document.querySelector('[data-canvas-navigation-trigger]').click()

  const links = [...w.document.querySelectorAll('[data-canvas-navigation-link]')]
  const newest = links.find((link) => link.textContent.trim() === '新帖子')
  assert.ok(newest, '导航提供站点首页的真实新帖子入口')
  assert.equal(newest.getAttribute('href'), '/index.php?sort=post')
  assert.equal(links.some((link) => link.getAttribute('href') === '/latest'), false, '不再生成不存在的 /latest 路由')
})

test('顶部导航固定在快捷链接滚动区之外，帖子页不会因状态标题变宽而裁切', async () => {
  for (const kind of ['home', 'topic']) {
    const { w, wait } = makeDom(kind, 1200, null, null, (window) => {
      const bar = window.document.querySelector('body > .top .bar')
      const identity = window.document.createElement('a')
      identity.className = 'forum-enhancements-custom-top-link'
      identity.href = '/identity_center'
      identity.textContent = '认证中心'
      bar.append(identity)
    })
    await wait()

    const top = w.document.querySelector('[data-surface="top-status"]')
    const identity = top?.querySelector('a[href="/identity_center"]')
    const navigation = top?.querySelector('[data-canvas-navigation-trigger]')
    const pinnedLinks = top?.querySelector('[data-canvas-pinned-links]')
    const scrollableLinks = top?.querySelector('[data-canvas-status-links]')

    assert.ok(top && identity && navigation && pinnedLinks && scrollableLinks, `${kind} 应挂载认证、导航和快捷链接区`)
    assert.equal(navigation.closest('[data-canvas-status-links]'), null, `${kind} 导航不能处于会裁切它的横向滚动区`)
    assert.strictEqual(identity.parentElement, pinnedLinks, `${kind} 认证入口应与导航固定在一起`)
    assert.strictEqual(navigation.parentElement, pinnedLinks, `${kind} 导航应固定在状态胶囊中`)
    assert.strictEqual(navigation.previousElementSibling, identity, `${kind} 导航应紧跟认证中心`)
  }
})

test('顶栏搜索仅占放大镜尺寸，原生表单以视口内浮层打开并可关闭', async () => {
  const { w, wait } = makeDom('home', 1200, null, null, (window) => {
    const bar = window.document.querySelector('body > .top .bar')
    bar.querySelectorAll('form.search-form').forEach((form) => form.remove())
    const identity = window.document.createElement('a')
    identity.className = 'forum-enhancements-custom-top-link'
    identity.href = '/identity_center'
    identity.textContent = '认证中心'
    const later = window.document.createElement('a')
    later.className = 'forum-enhancements-custom-top-link'
    later.href = '/topic_essence_review_list'
    later.textContent = '申精'
    const search = window.document.createElement('form')
    search.className = 'search-form'
    search.action = '/search'
    search.method = 'get'
    search.innerHTML = '<input type="search" name="q" aria-label="搜索关键词"><button type="submit">搜索</button>'
    bar.append(identity, later, search)
    window.__nativeSearchForm = search
    window.__nativeSearchHome = bar
  })
  await wait()
  const top = w.document.querySelector('[data-surface="top-status"]')
  const links = top?.querySelector('[data-canvas-status-links]')
  const pinnedLinks = top?.querySelector('[data-canvas-pinned-links]')
  const identity = pinnedLinks?.querySelector('a[href="/identity_center"]')
  const navigation = pinnedLinks?.querySelector('[data-canvas-navigation-trigger]')
  const searchHost = top?.querySelector('[data-canvas-search-host]')
  const searchTrigger = searchHost?.querySelector('[data-canvas-search-trigger]')
  const searchPanel = searchHost?.querySelector('[data-canvas-search-panel]')
  const search = w.__nativeSearchForm
  const toolCapsule = w.document.querySelector('[data-surface="tool-capsule"]')
  const toolSheet = w.document.querySelector('[data-surface="tool-sheet"]')
  const style = w.document.getElementById('lsb-skin-style')?.textContent || ''

  assert.ok(top && links && pinnedLinks && identity && navigation && searchHost && searchTrigger && searchPanel && search)
  assert.strictEqual(navigation.previousElementSibling, identity, '导航按钮紧接认证中心')
  assert.strictEqual(navigation.closest('[data-canvas-status-links]'), null, '导航按钮不在横向滚动快捷链接中')
  assert.strictEqual(searchHost.previousElementSibling, pinnedLinks, '放大镜位于顶栏认证与导航组右侧')
  assert.strictEqual(search.parentElement, searchPanel, '迁移原生搜索表单，不创建副本')
  assert.equal(searchPanel.hidden, true, '搜索浮层默认收起')
  assert.equal(searchTrigger.getAttribute('aria-label'), '打开站点搜索')
  assert.equal(searchTrigger.getAttribute('aria-expanded'), 'false')
  assert.equal(w.document.querySelectorAll('form.search-form').length, 1)
  assert.equal(toolCapsule?.querySelector('[data-canvas-open="navigation-sheet"]'), null)
  assert.equal(toolSheet?.querySelector('[data-tool-action="navigation-sheet"]'), null)
  assert.match(style, /\[data-canvas-search-host\]\{[^}]*flex:0 0 34px[^}]*width:34px/)
  assert.match(style, /\[data-canvas-search-panel\]\{[^}]*position:absolute[^}]*top:calc\(100% \+ 8px\)[^}]*right:0[^}]*width:min\(320px,calc\(100vw - 24px\)\)/)

  searchTrigger.click()
  assert.equal(searchPanel.hidden, false, '放大镜点击后打开搜索')
  assert.equal(searchTrigger.getAttribute('aria-expanded'), 'true')
  search.querySelector('input[type="search"]').dispatchEvent(new w.KeyboardEvent('keydown', { key: 'Escape', bubbles: true, cancelable: true }))
  assert.equal(searchPanel.hidden, true, 'Escape 收起搜索浮层')
  searchTrigger.click()
  w.document.querySelector('main.wrap').dispatchEvent(new w.MouseEvent('click', { bubbles: true, cancelable: true }))
  assert.equal(searchPanel.hidden, true, '点击浮层外收起搜索')

  navigation.click()
  assert.equal(w.document.querySelector('[data-surface="navigation-sheet"]').hidden, false)
  w.LSB.disable('skin')
  await wait(20)
  assert.equal(w.document.querySelector('#lsb-shell'), null, '停用皮肤应卸载画布')
  assert.strictEqual(search.parentElement, w.__nativeSearchHome, '停用后搜索表单回到原生顶栏')
  assert.equal(search.classList.contains('lsb-shell-search'), false)
})

test('窄屏用户页保留资料卡吸顶并收缩状态入口', async () => {
  const { w, wait } = makeDom('user', 390)
  await wait()
  const style = w.document.getElementById('lsb-skin-style')?.textContent || ''
  assert.match(style, /lsb-canvas-page-user \[data-lsb-canvas-profile\]\{position:sticky!important;top:calc\(6px \+ var\(--lsb-canvas-safe-top\) \+ var\(--lsb-canvas-chrome-height\)\)!important/)
  assert.equal(w.document.querySelectorAll('[data-canvas-status-links] a').length, 4)
})

test('窄屏外观控件改为单列并扩大底部操作热区', async () => {
  const { w, wait } = makeDom('home', 390)
  await wait()
  const style = w.document.getElementById('lsb-skin-style')?.textContent || ''
  assert.match(style, /\[data-surface="appearance-sheet"\] \[data-canvas-appearance-controls\]\{grid-template-columns:1fr!important\}/)
  assert.match(style, /\[data-surface="appearance-sheet"\] \[data-canvas-appearance-actions\]\{flex-direction:column!important;align-items:stretch!important\}/)
})

test('桌面首页滚动条属于中间首页面板，窄屏保留页面滚动', async () => {
  const wide = makeDom('home', 1200)
  await wide.wait()
  const wideStyle = wide.w.document.getElementById('lsb-skin-style')?.textContent || ''
  assert.match(
    wideStyle,
    /lsb-canvas-page-home \.lsb-canvas-content-root\{[^}]*height:100vh!important[^}]*overflow:hidden!important/,
    '桌面首页正文根应锁定视口，避免滚动条落在浏览器最右侧',
  )
  assert.match(
    wideStyle,
    /lsb-canvas-page-home [^{]*\.main-panel\{[^}]*overflow-y:auto!important[^}]*overflow-x:hidden!important[^}]*scrollbar-gutter:stable/,
    '桌面首页应由中间面板承载纵向滚动',
  )

  const narrow = makeDom('home', 390)
  await narrow.wait()
  const narrowStyle = narrow.w.document.getElementById('lsb-skin-style')?.textContent || ''
  assert.match(
    narrowStyle,
    /@media\(max-width:699px\)[\s\S]*lsb-canvas-page-home \.lsb-canvas-content-root\{[^}]*overflow:visible!important/,
    '窄屏首页正文根应恢复页面滚动',
  )
  assert.match(
    narrowStyle,
    /@media\(max-width:699px\)[\s\S]*lsb-canvas-page-home \.main-panel\{[^}]*overflow:visible!important/,
    '窄屏首页面板不应截取页面滚动',
  )
})

test('站点原生返回顶部跟随两种氢首页模式的面板滚动', async (t) => {
  for (const uiMode of ['legacy', 'ios27']) {
    await t.test(uiMode, async () => {
      let originalScrollTo
      const { w, wait } = makeDom('home', 1200, { uiMode }, null, (window) => {
        const button = window.document.querySelector('[data-back-to-top]')
        originalScrollTo = window.scrollTo
        window.addEventListener('scroll', () => {
          button.hidden = Number(window.scrollY || 0) < 120
        })
        button.addEventListener('click', () => window.scrollTo(0, 0))
      })

      await wait()
      const button = w.document.querySelector('[data-back-to-top]')
      const panel = w.document.querySelector('.home-shell .main-panel')
      assert.ok(button && panel, '原生返回顶部按钮和首页面板应保留')

      try {
        panel.scrollTop = 240
        panel.dispatchEvent(new w.Event('scroll'))
        assert.equal(w.scrollY, 240, 'window.scrollY 应反映氢首页面板位置')
        assert.equal(button.hidden, false, '原生 window 滚动监听应显示返回顶部按钮')

        button.click()
        assert.equal(panel.scrollTop, 0, '原生按钮的 window.scrollTo 应滚回面板顶部')
        assert.equal(button.hidden, true, '回到顶部后原生滚动监听应隐藏按钮')
      } finally {
        w.LSB.disable('skin')
        await wait(20)
      }

      assert.strictEqual(w.scrollTo, originalScrollTo, '停用氢 UI 后应恢复 window.scrollTo')
    })
  }
})

test('legacy 宽屏首页滚动条归属中间面板，窄屏不锁页面滚动', async () => {
  const wide = makeDom('home', 1200, { uiMode: 'legacy', measure: true })
  await wide.wait()
  const wideStyle = wide.w.document.getElementById('lsb-skin-style')?.textContent || ''
  assert.match(
    wideStyle,
    /html\.lsb-skin-shell-on\.lsb-skin-shell-home:not\(\.lsb-canvas-mode\)\{[^}]*height:100vh!important[^}]*overflow:hidden!important/,
    'legacy 宽屏首页根页面应锁定视口，避免浏览器最右侧出现整页滚动条',
  )
  assert.match(
    wideStyle,
    /html\.lsb-skin-shell-on\.lsb-skin-shell-home:not\(\.lsb-canvas-mode\) body > main\.wrap\{[^}]*display:flex!important[^}]*min-height:0!important/,
    'legacy 首页正文壳应允许中间面板取得有限高度',
  )
  assert.match(
    wideStyle,
    /html\.lsb-skin-shell-on\.lsb-skin-shell-home:not\(\.lsb-canvas-mode\) body > main\.wrap\{[^}]*max-width:none!important[^}]*margin-left:0!important[^}]*margin-right:0!important/,
    'legacy 首页应覆盖宽屏限宽阅读，避免中间滚动条与右栏之间出现大段空白',
  )
  assert.match(
    wideStyle,
    /html\.lsb-skin-shell-on\.lsb-skin-shell-home:not\(\.lsb-canvas-mode\) body > main\.wrap \.home-shell > \.forum-layout\.forum-layout-has-sidebar > \.forum-main\{[^}]*width:100%!important[^}]*max-width:none!important/,
    'legacy 首页中间列应填满隐藏原生侧栏后留下的可用宽度',
  )
  assert.match(
    wideStyle,
    /html\.lsb-skin-shell-on\.lsb-skin-shell-home:not\(\.lsb-canvas-mode\) [^{]*\.main-panel\{[^}]*overflow-y:auto!important[^}]*overflow-x:hidden!important[^}]*scrollbar-gutter:stable/,
    'legacy 宽屏首页应由中间面板承载纵向滚动',
  )
  assert.equal(wide.w.document.documentElement.classList.contains('lsb-skin-shell-home'), true, '首页应有明确页面标记')

  const topic = makeDom('topic', 1200, { uiMode: 'legacy', measure: true })
  await topic.wait()
  assert.equal(topic.w.document.documentElement.classList.contains('lsb-skin-shell-home'), false, '帖子页不能误用首页布局标记')

  const narrow = makeDom('home', 800, { uiMode: 'legacy' })
  await narrow.wait()
  const narrowStyle = narrow.w.document.getElementById('lsb-skin-style')?.textContent || ''
  assert.doesNotMatch(narrowStyle, /html\.lsb-skin-shell-on\.lsb-skin-shell-home:not\(\.lsb-canvas-mode\)/, '窄屏不应启用 legacy 宽屏锁定规则')
  assert.equal(narrow.w.document.documentElement.classList.contains('lsb-skin-shell-on'), false, '窄屏应恢复原生页面流')
})

test('宽屏 AI 卡可拖动并按宽度降级为 Sheet/全屏', async () => {
  const wide = makeDom('topic', 1200)
  await wide.wait()
  const open = wide.w.document.querySelector('[data-canvas-open="ai-card"]')
  open.click()
  const card = wide.w.document.querySelector('[data-surface="ai-card"]')
  assert.equal(card.dataset.surfaceMode, 'floating')
  const head = card.querySelector('[data-canvas-sheet-head]')
  const pointer = (type, x, y) => {
    const event = new wide.w.Event(type, { bubbles: true, cancelable: true })
    Object.defineProperties(event, { clientX: { value: x }, clientY: { value: y }, pointerId: { value: 1 }, button: { value: 0 } })
    return event
  }
  head.dispatchEvent(pointer('pointerdown', 100, 100))
  const initialLeft = Number.parseFloat(card.style.left)
  wide.w.dispatchEvent(pointer('pointermove', 140, 130))
  await wide.wait(10)
  assert.match(card.style.transform, /translate3d\(40px,30px,0\)/)
  wide.w.dispatchEvent(pointer('pointerup', 140, 130))
  assert.equal(card.style.left, `${Math.min(initialLeft + 40, 1200 - 420)}px`)

  const mid = makeDom('topic', 800)
  await mid.wait()
  mid.w.document.querySelector('[data-canvas-open="ai-card"]').click()
  assert.equal(mid.w.document.querySelector('[data-surface="ai-card"]').dataset.surfaceMode, 'sheet')
  const narrow = makeDom('topic', 699)
  await narrow.wait()
  narrow.w.document.querySelector('[data-canvas-open="ai-card"]').click()
  assert.equal(narrow.w.document.querySelector('[data-surface="ai-card"]').dataset.surfaceMode, 'fullscreen')
})

test('选中文本显示上下文胶囊并委托原生操作', async () => {
  const { w, wait } = makeDom('topic', 1200)
  await wait()
  const post = w.document.querySelector('.post-entry, .post-item')
  const content = post?.querySelector('.post-content')
  assert.ok(post && content)
  const textNode = content.firstChild?.firstChild || content.firstChild
  assert.ok(textNode)
  const selection = w.getSelection()
  const range = w.document.createRange()
  range.selectNodeContents(textNode.parentElement || textNode)
  selection.removeAllRanges()
  selection.addRange(range)
  w.document.dispatchEvent(new w.Event('selectionchange'))
  await wait(20)
  const pill = w.document.querySelector('[data-surface="context-pill"]')
  assert.ok(pill)
  assert.equal(pill.hidden, false)
  assert.equal(pill.querySelectorAll('[data-context-action]').length, 4)
  const favorite = w.document.querySelector('.topic-favorites-action .fav-btn')
  let clicked = 0
  favorite?.addEventListener('click', () => { clicked += 1 })
  pill.querySelector('[data-context-action="favorite"]').click()
  assert.equal(pill.hidden, true)
  assert.equal(clicked, favorite ? 1 : 0)
})

test('外观 Sheet 提供预设、令牌覆盖和恢复默认', async () => {
  const { w, wait } = makeDom('topic', 1200)
  await wait()
  w.document.querySelector('[data-canvas-open="tool-sheet"]').click()
  w.document.querySelector('[data-tool-action="appearance-sheet"]').click()
  const sheet = w.document.querySelector('[data-surface="appearance-sheet"]')
  assert.equal(sheet.hidden, false)
  sheet.querySelector('[data-canvas-preset="immersive-video"]').click()
  const opacity = sheet.querySelector('[data-canvas-appearance="opacity"]')
  opacity.value = '0.48'
  opacity.dispatchEvent(new w.Event('input', { bubbles: true }))
  let debug = await w.LSB.bus.request('skin:debug')
  assert.equal(debug.canvas.preset, 'immersive-video')
  assert.equal(w.document.documentElement.style.getPropertyValue('--lsb-shell-glass-opacity'), '0.48')
  sheet.querySelector('[data-canvas-reset-appearance]').click()
  debug = await w.LSB.bus.request('skin:debug')
  assert.equal(debug.canvas.preset, 'balanced-glass')
  assert.equal(w.document.documentElement.style.getPropertyValue('--lsb-shell-glass-opacity'), '0.72')
})

test('外观控件使用预设且不再暴露手动调色', async () => {
  const { w, wait } = makeDom('topic', 1200)
  await wait()
  w.document.querySelector('[data-canvas-open="tool-sheet"]').click()
  w.document.querySelector('[data-tool-action="appearance-sheet"]').click()
  const sheet = w.document.querySelector('[data-surface="appearance-sheet"]')
  for (const name of ['textColor', 'panelColor', 'accentColor']) {
    assert.equal(sheet.querySelector(`[data-canvas-appearance="${name}"]`), null, `${name} 不应再显示为手动控件`)
  }
  for (const preset of ['native-site', 'balanced-glass', 'immersive-video', 'static-readable']) {
    assert.ok(sheet.querySelector(`[data-canvas-preset="${preset}"]`), `缺少 ${preset} 预设`)
  }
  for (const mode of ['original', 'image', 'video']) assert.ok(sheet.querySelector(`[data-canvas-background="${mode}"]`))
  assert.ok(sheet.querySelector('[data-canvas-media-file="image"]'))
})

test('选择原始背景会清除视频和静态图片资源', async () => {
  const canvasState = {
    version: 2,
    enabled: true,
    global: { appearance: { background: 'video' } },
    sites: {
      'https://linux.sb': {
        appearance: {
          background: 'video',
          backgroundVideoUrl: 'https://cdn.example/video.mp4',
          backgroundVideoLocalKey: 'https://linux.sb:video',
          backgroundImageUrl: 'https://cdn.example/image.png',
          backgroundImageLocalKey: 'https://linux.sb:image',
        },
      },
    },
  }
  const { w, wait } = makeDom('topic', 1200, null, canvasState)
  await wait()
  w.document.querySelector('[data-canvas-open="tool-sheet"]').click()
  w.document.querySelector('[data-tool-action="appearance-sheet"]').click()
  w.document.querySelector('[data-canvas-background="original"]').click()
  const stored = JSON.parse(w.localStorage.getItem('lsb_base:skin:canvas-state:v2'))
  const appearance = stored.sites['https://linux.sb'].appearance
  assert.equal(appearance.background, 'static')
  assert.equal(appearance.backgroundVideoUrl, '')
  assert.equal(appearance.backgroundVideoLocalKey, '')
  assert.equal(appearance.backgroundImageUrl, '')
  assert.equal(appearance.backgroundImageLocalKey, '')
  assert.equal(w.document.querySelector('[data-lsb-shell-video]'), null)
})

test('选择外观预设会清除旧颜色覆盖并应用原生预设', async () => {
  const canvasState = {
    version: 2,
    enabled: true,
    global: {
      preset: 'balanced-glass',
      appearance: { textColor: '#123456', panelColor: '#ffffff', accentColor: '#e45b5b', fontFamily: 'system-ui', fontUrl: 'https://cdn.example/font.woff2', fontLocalKey: 'legacy-font', fontSize: 21, radius: 28 },
    },
    sites: {
      'https://linux.sb': {
        appearance: { textColor: '#abcdef', panelColor: '#fefefe', accentColor: '#224466' },
      },
    },
  }
  const { w, wait } = makeDom('topic', 1200, null, canvasState)
  await wait()
  w.document.querySelector('[data-canvas-open="tool-sheet"]').click()
  w.document.querySelector('[data-tool-action="appearance-sheet"]').click()
  const sheet = w.document.querySelector('[data-surface="appearance-sheet"]')
  sheet.querySelector('[data-canvas-preset="native-site"]').click()
  const stored = JSON.parse(w.localStorage.getItem('lsb_base:skin:canvas-state:v2'))
  assert.equal(stored.global.preset, 'native-site')
  assert.equal(stored.global.appearance.textColor, '')
  assert.equal(stored.global.appearance.panelColor, '')
  assert.equal(stored.global.appearance.accentColor, '')
  assert.equal(stored.global.appearance.fontFamily, '')
  assert.equal(stored.global.appearance.fontUrl, '')
  assert.equal(stored.global.appearance.fontLocalKey, '')
  assert.equal(stored.global.appearance.fontSize, 14)
  assert.equal(stored.global.appearance.radius, 16)
  assert.equal(stored.sites['https://linux.sb']?.appearance, undefined)
  assert.equal(w.document.documentElement.style.getPropertyValue('--lsb-shell-text'), '')
  assert.equal(w.document.documentElement.style.getPropertyValue('--lsb-shell-panel'), '')
  assert.equal(w.document.documentElement.style.getPropertyValue('--lsb-shell-accent'), '')
  assert.equal(w.document.querySelector('[data-canvas-appearance-status]').textContent, '当前预设：D 原生站点')
})

test('非首页画布页面使用统一的顶部内容起点', async () => {
  for (const kind of ['forum', 'topic', 'settings']) {
    const { w, wait } = makeDom(kind, 1200)
    await wait()
    const style = w.document.getElementById('lsb-skin-style').textContent
    assert.match(style, /lsb-canvas-content-root[^}]*padding-top:0!important/, `${kind} 未清除重复顶部间距`)
    assert.match(style, /lsb-canvas-content-root \.home-shell,html\.lsb-skin-shell-on\.lsb-canvas-mode \.lsb-canvas-content-root \.forum-main\{padding-top:0!important\}/, `${kind} 未清除嵌套正文容器的重复顶部内边距`)
  }
})

test('宽屏站点信息固定在顶部状态栏右侧的独立玻璃栏，不作为浮动卡拖动', async () => {
  const { w, wait } = makeDom('topic', 1200)
  await wait()
  const card = w.document.querySelector('[data-surface="site-card"]')
  const top = w.document.querySelector('[data-surface="top-status"]')
  const site = w.document.querySelector('[data-surface="site-status"]')
  const host = w.document.querySelector('[data-canvas-site-status-host]')
  const style = w.document.getElementById('lsb-skin-style').textContent
  assert.equal(card.dataset.surfaceMode, 'rail')
  assert.equal(card.hidden, true)
  assert.ok(top && site)
  assert.equal(top.querySelector('[data-canvas-site-status-host]'), null)
  assert.strictEqual(host.closest('[data-surface="site-status"]'), site)
  assert.equal(site.hidden, false)
  assert.equal(host.hidden, false)
  assert.match(style, /data-surface="site-status"\]\{[^}]*position:fixed/)
  assert.equal(card.querySelector('[data-canvas-resize-handle]').hidden, true)
})

test('取消 AI 浮动卡片缩放会还原起始尺寸且不保存临时几何', async () => {
  const { w, wait } = makeDom('topic', 1200)
  await wait()
  w.document.querySelector('[data-canvas-open="tool-sheet"]').click()
  w.document.querySelector('[data-tool-action="ai-card"]').click()
  const card = w.document.querySelector('[data-surface="ai-card"]')
  const handle = card.querySelector('[data-canvas-resize-handle]')
  const start = { width: card.style.width, height: card.style.height }
  const pointer = (type, x, y) => {
    const event = new w.Event(type, { bubbles: true, cancelable: true })
    Object.defineProperties(event, { clientX: { value: x }, clientY: { value: y }, pointerId: { value: 3 }, button: { value: 0 } })
    return event
  }
  handle.dispatchEvent(pointer('pointerdown', 300, 200))
  w.dispatchEvent(pointer('pointermove', 360, 250))
  await wait(10)
  assert.notEqual(card.style.width, start.width)
  w.dispatchEvent(pointer('pointercancel', 360, 250))
  assert.equal(card.style.width, start.width)
  assert.equal(card.style.height, start.height)
  const stored = JSON.parse(w.localStorage.getItem('lsb_base:skin:canvas-state:v2'))
  assert.equal(stored.sites['https://linux.sb']?.layout?.wide?.['ai-card'], undefined)
})

test('路由刷新复用单画布宿主而不重建旧三栏', async () => {
  const { w, wait } = makeDom('home', 1200)
  await wait()
  const shell = w.document.querySelector('#lsb-shell')
  w.history.pushState({}, '', '/forum/1')
  w.LSB.bus.emit('route:changed', { href: w.location.href })
  await wait(80)
  assert.strictEqual(w.document.querySelector('#lsb-shell'), shell)
  assert.equal(w.document.querySelector('#lsb-shell-rail'), null)
  assert.equal(w.document.querySelector('#lsb-shell-aside'), null)
  assert.ok(w.document.querySelector('#lsb-shell-surfaces'))
})

test('顶部状态栏不显示材料状态，帖子页也不显示帖子标题', async () => {
  const { w, wait } = makeDom('topic', 1200)
  await wait()
  const top = w.document.querySelector('[data-surface="top-status"]')
  assert.ok(top)
  assert.equal(top.querySelector('[data-canvas-material-count]'), null)
  assert.equal(top.querySelector('[data-canvas-site-key]'), null)
  assert.equal(top.querySelector('[data-canvas-status-title]')?.textContent.trim(), 'LINUX SB')
  assert.doesNotMatch(top.querySelector('[data-canvas-status-title]')?.textContent || '', /LINUX SB上线/)
})

test('宽屏站点信息栏与顶部状态栏并列且继续使用原生 DOM', async () => {
  const { w, wait } = makeDom('topic', 1200, null, null, (window) => {
    const card = window.document.querySelector('.sidebar-card.forum-enhancements-sidebar-card, .sidebar-card.daily-hot-topics-card')
    window.__nativeStatusSiteCard = card
    window.__nativeStatusSiteParent = card?.parentElement || null
  })
  await wait()
  const top = w.document.querySelector('[data-surface="top-status"]')
  const site = w.document.querySelector('[data-surface="site-status"]')
  const host = site?.querySelector('[data-canvas-site-status-host]')
  const body = host?.querySelector('[data-canvas-site-status-body]')
  const native = w.__nativeStatusSiteCard
  assert.ok(top && site && host && body && native)
  assert.equal(top.querySelector('[data-canvas-site-status-host]'), null)
  assert.equal(host.closest('[data-surface="top-status"]'), null)
  assert.strictEqual(host.closest('[data-surface="site-status"]'), site)
  assert.equal(site.hidden, false)
  assert.equal(host.hidden, false)
  assert.strictEqual(native.parentElement, body)
  assert.equal(w.document.querySelector('[data-surface="site-card"]').hidden, true)
  assert.equal(host.dataset.expanded, 'false')
  host.querySelector('[data-canvas-site-status-expand]').click()
  assert.equal(host.dataset.expanded, 'true')
  assert.strictEqual(native.parentElement, body)
  assert.equal(w.document.querySelectorAll('.lsb-canvas-site-card').length, body.querySelectorAll(':scope > .sidebar-card').length)
  w.LSB.disable('skin')
  await wait(20)
  assert.strictEqual(native.parentElement, w.__nativeStatusSiteParent)
})

test('宽屏站点信息栏点击才展开，收起时显示站点信息', async () => {
  const { w, wait } = makeDom('topic', 1200)
  await wait()
  const host = w.document.querySelector('[data-canvas-site-status-host]')
  const label = host?.querySelector('[data-canvas-site-status-label]')
  const style = w.document.getElementById('lsb-skin-style').textContent
  assert.ok(host && label)
  assert.equal(label.textContent.trim(), '站点信息')
  assert.equal(host.dataset.expanded, 'false')
  assert.match(style, /data-canvas-site-status-host\]::before\{[^}]*border-radius:inherit[^}]*--lsb-glass-fill[^}]*backdrop-filter:blur\(var\(--lsb-glass-blur\)\) saturate\(var\(--lsb-glass-saturation\)\)[^}]*--lsb-glass-highlight/)
  assert.match(style, /data-canvas-site-status-host\]\{[^}]*border-radius:999px/)
  assert.match(style, /data-canvas-site-status-label\]\{[^}]*font-size:12px;font-weight:550/)
  assert.match(style, /lsb-skin-glass-on #lsb-shell-surfaces \[data-surface="site-status"\]\{[^}]*background:transparent/)
  assert.match(style, /data-expanded="true"\] \[data-canvas-site-status-body\]\{[^}]*border-radius:34px[^}]*--lsb-glass-fill/)
  assert.match(style, /data-canvas-site-status-host\]:not\(\[data-expanded="true"\]\) \[data-canvas-site-status-body\]\{display:none!important\}/)
  host.dispatchEvent(new w.MouseEvent('mouseenter', { bubbles: true }))
  assert.equal(host.dataset.expanded, 'false', '悬停不得展开站点信息')
  label.click()
  assert.equal(host.dataset.expanded, 'true')
  assert.equal(host.dataset.locked, 'true')
  host.dispatchEvent(new w.MouseEvent('mouseleave', { bubbles: true }))
  assert.equal(host.dataset.expanded, 'true', '移开指针不得收起已点击展开的站点信息')
  label.click()
  assert.equal(host.dataset.expanded, 'false')
  assert.equal(host.dataset.locked, 'false')
})

test('连续画布在氢顶栏展示当前用户信息且不搬动原生侧栏', async () => {
  const { w, wait } = makeDom('topic', 1200)
  await wait()
  const host = w.document.querySelector('[data-canvas-profile-host]')
  const profile = host?.querySelector('.sidebar-card.user-card')
  const native = w.document.querySelector('aside.sidebar')
  const firstPost = w.document.querySelector('.post-entry, .post-item')
  assert.ok(host)
  assert.ok(profile)
  assert.ok(firstPost)
  assert.strictEqual(profile.parentElement, host)
  assert.equal(native?.closest('#lsb-shell'), null)
})

test('色系弹层脱离页脚层叠上下文且停用后归还原位置', async () => {
  const { w, wait } = makeDom('topic', 1200, null, null, (window) => {
    const link = window.document.createElement('a')
    link.className = 'color-scheme-top-link'
    link.href = '#color-scheme-modal'
    link.textContent = '切换色系'
    window.document.querySelector('body > .top .bar').append(link)

    const footer = window.document.createElement('footer')
    footer.className = 'footer'
    footer.style.position = 'relative'
    footer.style.zIndex = '120'
    const modal = window.document.createElement('div')
    modal.id = 'color-scheme-modal'
    modal.innerHTML = '<div class="color-scheme-modal-dialog"><button type="button">浅色</button></div>'
    footer.append(modal)
    window.document.body.append(footer)
    window.__nativeColorSchemeModal = modal
    window.__nativeColorSchemeModalParent = footer
  })
  await wait()
  const modal = w.__nativeColorSchemeModal
  const style = w.document.getElementById('lsb-skin-style').textContent
  assert.ok(modal)
  assert.strictEqual(modal.parentElement, w.document.body, '色系弹层不能继续嵌套在低层叠上下文的页脚中')
  assert.ok(modal.classList.contains('lsb-shell-theme-modal'))
  assert.match(style, /#color-scheme-modal\{[^}]*z-index:8020!important/)
  assert.doesNotMatch(style, /body > :not\(\[data-lsb-shell-video\]\):not\(\[data-lsb-shell-image\]\):not\(#lsb-shell\):not\(\.lsb-shell-theme-modal\)/)
  w.LSB.disable('skin')
  await wait(30)
  assert.strictEqual(modal.parentElement, w.__nativeColorSchemeModalParent, '停用皮肤后弹层应回到原生位置')
  assert.equal(modal.classList.contains('lsb-shell-theme-modal'), false)
})

test('非首页正文的 main-panel 不重复叠加顶部间距', async () => {
  const { w, wait } = makeDom('settings', 1200)
  await wait()
  const style = w.document.getElementById('lsb-skin-style').textContent
  assert.match(
    style,
    /lsb-canvas-content-root \.main-panel\{padding-top:0!important\}/,
    '发帖、设置和称号类正文面板应复用统一正文起点',
  )
  assert.match(
    style,
    /lsb-canvas-mode:not\(\.lsb-canvas-page-home\) \.lsb-canvas-content-root\{margin-top:calc\(64px \+ var\(--lsb-canvas-safe-top\)\)!important\}/,
    '非首页只由画布根节点提供一次顶部间距',
  )
})

test('新版站点侧栏卡片全部复用原生节点并排除个人卡', async () => {
  const { w, wait } = makeDom('topic', 1200, null, null, (window) => {
    let sidebar = window.document.querySelector('aside.sidebar')
    if (!sidebar) {
      sidebar = window.document.createElement('aside')
      sidebar.className = 'sidebar'
      window.document.body.append(sidebar)
    }
    for (const card of [...sidebar.children]) {
      if (!card.classList.contains('user-card')) card.remove()
    }
    const classes = [
      'sidebar-promotions-card',
      'daily-hot-topics-card',
      'stats-card',
      'online-users-card',
      'forum-enhancements-sidebar-card forum-enhancements-left-fallback',
    ]
    window.__nativeSiteCards = classes.map((className, index) => {
      const card = window.document.createElement('section')
      card.className = `sidebar-card ${className}`
      card.innerHTML = `<strong>新侧栏卡片 ${index + 1}</strong>`
      sidebar.append(card)
      return card
    })
  })
  await wait()
  const body = w.document.querySelector('[data-canvas-site-status-body]')
  assert.ok(body)
  for (const card of w.__nativeSiteCards) {
    assert.strictEqual(card.parentElement, body, `应迁入 ${card.className}，且不能复制`)
    assert.equal(card.classList.contains('lsb-canvas-site-card'), true)
  }
  assert.equal(body.querySelector('.user-card'), null, '自己的个人卡不能混入站点信息栏')
  assert.equal(w.document.querySelectorAll('.sidebar-card').length, 1 + w.__nativeSiteCards.length)
})

test('本人资料卡复用原生节点并与用户页正文资料区隔离', async () => {
  const { w, wait } = makeDom('user', 1200, null, null, (window) => {
    for (const link of window.document.querySelectorAll('a[href="/user/5372"]')) link.setAttribute('href', '/user/1')
  })
  const native = w.document.querySelector('.sidebar-card.user-card')
  await wait()
  const topCard = w.document.querySelector('[data-canvas-profile-host] .lsb-canvas-self-user-card')
  const bodyCard = w.document.querySelector('[data-lsb-canvas-profile] .sidebar-card.user-card')
  assert.ok(native && topCard, '应能找到原生本人资料卡和顶部个人胶囊')
  assert.strictEqual(topCard, native, '顶部个人胶囊必须复用原生资料卡节点')
  assert.equal(bodyCard, null, '自己的资料卡不能继续出现在用户页正文资料区')
  assert.equal(topCard.closest('.main-panel'), null, '个人胶囊节点不能嵌入正文面板')
  assert.equal(w.document.querySelectorAll('.sidebar-card.user-card').length, 1)
})

test('站点信息栏直接挂载原生 DOM 节点且停用后恢复原位置', async () => {
  const { w, wait } = makeDom('topic', 1200, null, null, (window) => {
    const card = window.document.querySelector('.sidebar-card.forum-enhancements-sidebar-card, .sidebar-card.daily-hot-topics-card')
    window.__nativeSiteCard = card
    window.__nativeSiteParent = card?.parentElement || null
  })
  await wait()
  const sidebarCard = w.__nativeSiteCard
  const originalParent = w.__nativeSiteParent
  assert.ok(sidebarCard && originalParent)
  const card = w.document.querySelector('[data-surface="site-card"]')
  const status = w.document.querySelector('[data-surface="site-status"]')
  const body = status?.querySelector('[data-canvas-site-status-body]')
  assert.ok(body)
  assert.equal(w.document.querySelector('[data-surface="top-status"] [data-canvas-site-status-host]'), null)
  assert.strictEqual(sidebarCard.parentElement, body)
  assert.equal(w.document.querySelectorAll('.lsb-canvas-site-card').length, body.querySelectorAll(':scope > .sidebar-card').length)
  assert.equal(status.hidden, false)
  assert.equal(card.hidden, true)
  assert.equal(card.querySelector('[data-canvas-site-summary]'), null)
  assert.equal(card.querySelector('[data-canvas-site-settings]'), null)
  w.LSB.disable('skin')
  await wait(20)
  assert.strictEqual(sidebarCard.parentElement, originalParent)
})

test('没有原生侧栏卡片时显示说明空态，不伪造站点信息', async () => {
  const { w, wait } = makeDom('topic', 1200, null, null, (window) => {
    for (const card of [...window.document.querySelectorAll('aside.sidebar .sidebar-card:not(.user-card)')]) card.remove()
  })
  await wait()
  const surface = w.document.querySelector('[data-surface="site-card"]')
  const status = w.document.querySelector('[data-canvas-site-status-host]')
  const host = status?.querySelector('[data-canvas-site-status-body]')
  const empty = host?.querySelector('[data-canvas-site-empty-state]')
  assert.ok(host && empty)
  assert.equal(status.hidden, false)
  assert.equal(surface.hidden, true)
  assert.equal(empty.hidden, false)
  assert.match(empty.textContent, /当前页面没有原生站点信息栏内容/)
  assert.equal(host.querySelectorAll(':scope > .sidebar-card').length, 0)
})

test('中屏站点信息使用 Sheet，窄屏使用全屏 Sheet，并在关闭后归还原生节点', async () => {
  for (const [width, mode] of [[800, 'sheet'], [390, 'fullscreen']]) {
    const { w, wait } = makeDom('topic', width)
    await wait()
    const sidebarCard = w.document.querySelector('.sidebar-card.forum-enhancements-sidebar-card, .sidebar-card.daily-hot-topics-card')
    const originalParent = sidebarCard?.parentElement
    w.document.querySelector('[data-canvas-open="tool-sheet"]').click()
    w.document.querySelector('[data-tool-action="site-card"]').click()
    const surface = w.document.querySelector('[data-surface="site-card"]')
    assert.equal(surface.dataset.surfaceMode, mode)
    assert.equal(surface.hidden, false)
    assert.ok(surface.querySelector('[data-canvas-site-sidebar]').contains(sidebarCard))
    surface.querySelector('[data-canvas-close]').click()
    assert.strictEqual(sidebarCard.parentElement, originalParent)
  }
})

test('AI 操作台不出现在底部工具胶囊或更多工具中', async () => {
  const { w, wait } = makeDom('topic', 1200, null, null, (window) => {
    const link = window.document.createElement('a')
    link.className = 'plugin-top-menu-link lsb-ai-console-top'
    link.href = '/topic/1#ai-console'
    link.textContent = '✨ AI 操作台'
    window.document.querySelector('body > .top').append(link)
  })
  await wait()
  assert.equal(w.document.querySelector('[data-canvas-status-links] .lsb-ai-console-top'), null)
  const capsule = w.document.querySelector('[data-surface="tool-capsule"]')
  assert.ok(capsule?.querySelector('[data-canvas-open="ai-card"]'), '底部胶囊应保留 AI 助理')
  assert.equal(capsule?.querySelector('[data-canvas-ai-console]'), null, '底部胶囊不应显示 AI 操作台图标')
  w.document.querySelector('[data-canvas-open="tool-sheet"]').click()
  const sheet = w.document.querySelector('[data-surface="tool-sheet"]')
  assert.equal(sheet?.querySelector('[data-tool-action="ai-console"]'), null, '更多工具中不应显示 AI 操作台入口')
})

test('帖子页顶部状态栏不显示 AI 专用快捷入口', async () => {
  const { w, wait } = makeDom('topic', 1200, null, null, (window) => {
    const link = window.document.createElement('a')
    link.className = 'plugin-top-menu-link lsb-ai-copilot-top'
    link.href = '/topic/1#ai-copilot'
    link.textContent = '✨ AI 副驾'
    window.document.querySelector('body > .top').append(link)
  })
  await wait()
  const links = [...w.document.querySelectorAll('[data-canvas-status-links] a')]
  assert.equal(links.some((link) => link.classList.contains('lsb-ai-copilot-top')), false)
  assert.equal(links.some((link) => /AI\s*(副驾|操作台)/.test(link.textContent)), false)
  assert.ok(w.document.querySelector('[data-surface="tool-capsule"] [data-canvas-open="ai-card"]'), '底部 AI 助理入口保持不变')
})

test('插件功能菜单提供积分-称号工作台入口，设置齿轮与功能页分离', async () => {
  const { w, wait } = makeDom('topic', 1200)
  await wait()

  w.LSB.register({
    id: 'ai-summary', name: 'AI 总结', version: '1.0.0',
  }, (api) => api.ui.tab({ id: 'ai-summary-history', name: 'AI 历史', render: (host) => { host.textContent = 'AI 历史功能' } }))
  w.LSB.register({
    id: 'checkin-calendar', name: '签到日历', version: '1.0.0',
    config: { month: { type: 'number', label: '签到配置项', default: 6 } },
  }, (api) => api.ui.tab({ name: '签到日历功能', render: (host) => { host.innerHTML = '<div id="calendar-feature">签到日历功能内容</div>' } }))
  let workbenchOpens = 0
  w.LSB.register({ id: 'points-title-workbench', name: '积分-称号工作台', version: '0.1.0' }, (api) => {
    api.handle('points-title-workbench:open', () => { workbenchOpens++ })
  })
  w.LSB.register({
    id: 'annual-report', name: '年度报告', version: '1.0.0',
  }, (api) => api.ui.tab({ name: '年度报告', render: (host) => { host.textContent = '年度报告功能' } }))
  await wait(20)

  w.document.querySelector('[data-canvas-open="tool-sheet"]').click()
  const pluginFeaturesButton = w.document.querySelector('[data-tool-action="plugin-features-sheet"]')
  assert.ok(pluginFeaturesButton, '工具面板增加插件功能入口')
  pluginFeaturesButton.click()

  const featureSheet = w.document.querySelector('[data-surface="plugin-features-sheet"]')
  assert.equal(featureSheet.hidden, false)
  assert.deepEqual(
    [...featureSheet.querySelectorAll('[data-plugin-feature-action]')].map((button) => button.dataset.pluginFeatureAction),
    ['ai-summary', 'checkin-calendar', 'points-title-workbench', 'annual-report'],
  )
  assert.ok(featureSheet.querySelector('[data-plugin-settings-open="checkin-calendar"]'), '有 schema 的功能提供设置齿轮')
  assert.equal(featureSheet.querySelector('[data-plugin-settings-open="annual-report"]'), null, '无 schema 的功能不显示齿轮')

  featureSheet.querySelector('[data-plugin-settings-open="checkin-calendar"]').click()
  assert.equal(featureSheet.hidden, true, '打开设置前关闭氢壳面板')
  assert.match(w.document.querySelector('.lsb-panel-head strong').textContent, /签到日历.*设置/)
  assert.match(w.document.querySelector('.lsb-view').textContent, /签到配置项/)
  assert.doesNotMatch(w.document.querySelector('.lsb-view').textContent, /签到日历功能内容/)
  w.document.querySelector('.lsb-panel-close').click()

  w.document.querySelector('[data-canvas-open="tool-sheet"]').click()
  w.document.querySelector('[data-tool-action="plugin-features-sheet"]').click()
  w.document.querySelector('[data-plugin-feature-action="checkin-calendar"]').click()
  assert.ok(w.document.querySelector('#calendar-feature'), '原有插件 ID 仍打开功能面板')
  w.document.querySelector('.lsb-panel-close').click()

  w.document.querySelector('[data-canvas-open="tool-sheet"]').click()
  w.document.querySelector('[data-tool-action="plugin-features-sheet"]').click()
  w.document.querySelector('[data-plugin-feature-action="points-title-workbench"]').click()
  await wait(10)
  assert.equal(workbenchOpens, 1, '积分-称号入口应调用工作台 RPC')
})

test('插件功能菜单将积分和称号合并为唯一工作台入口', async () => {
  const { w, wait } = makeDom('topic', 1200)
  await wait()

  w.LSB.register({ id: 'points-ledger', name: '积分趋势', version: '1.0.0' }, (api) => {
    api.ui.tab({ name: '积分趋势', render: () => {} })
  })
  w.LSB.register({ id: 'title-quotes', name: '称号行情', version: '1.0.0' }, (api) => {
    api.handle('title-quotes:open', () => {})
  })
  w.LSB.register({ id: 'title-forge-planner', name: 'UR 合成规划', version: '0.1.0' }, (api) => {
    api.ui.tab({ name: 'UR 合成规划', render: () => {} })
  })
  w.LSB.register({ id: 'points-title-workbench', name: '积分-称号工作台', version: '0.1.0' }, (api) => {
    api.handle('points-title-workbench:open', () => {})
  })
  await wait(20)

  w.document.querySelector('[data-canvas-open="tool-sheet"]').click()
  w.document.querySelector('[data-tool-action="plugin-features-sheet"]').click()
  const sheet = w.document.querySelector('[data-surface="plugin-features-sheet"]')
  assert.deepEqual(
    [...sheet.querySelectorAll('[data-plugin-feature-action]')].map((button) => [button.dataset.pluginFeatureAction, button.textContent.trim()]),
    [['points-title-workbench', '积分-称号']],
  )
  assert.equal(sheet.querySelector('[data-plugin-feature-action="points-ledger"]'), null)
  assert.equal(sheet.querySelector('[data-plugin-feature-action="title-quotes"]'), null)
  assert.equal(sheet.querySelector('[data-plugin-feature-action="title-forge-planner"]'), null)
})

test('插件功能面板打开后若插件停用，旧入口点击会重新校验并拒绝跳转', async () => {
  const { w, wait } = makeDom('topic', 1200)
  await wait()
  w.LSB.register({ id: 'checkin-calendar', name: '签到日历', version: '1.0.0' }, (api) => {
    api.ui.tab({ name: '签到日历', render: (host) => { host.textContent = '签到功能面板' } })
  })
  await wait(15)
  w.document.querySelector('[data-canvas-open="tool-sheet"]').click()
  w.document.querySelector('[data-tool-action="plugin-features-sheet"]').click()
  const staleAction = w.document.querySelector('[data-plugin-feature-action="checkin-calendar"]')
  assert.ok(staleAction)

  w.LSB.disable('checkin-calendar')
  staleAction.click()
  assert.equal(w.document.querySelector('.lsb-panel'), null, '停用后的功能不可打开或回退到其他分页')
  assert.match(w.document.querySelector('.lsb-toast')?.textContent || '', /当前不可用/)
})

test('全部插件设置目录包含已停用配置插件且排除无 schema 插件', async () => {
  const { w, wait } = makeDom('topic', 390)
  await wait()
  w.LSB.register({
    id: 'disabled-settings', name: '停用配置项', version: '1.0.0',
    config: { enabled: { type: 'switch', label: '停用设置表单', default: false } },
  }, () => {})
  w.LSB.disable('disabled-settings')
  w.LSB.register({ id: 'unconfigured-plugin', name: '无设置插件', version: '1.0.0' }, () => {})
  await wait(20)

  w.document.querySelector('[data-canvas-open="tool-sheet"]').click()
  w.document.querySelector('[data-tool-action="plugin-features-sheet"]').click()
  w.document.querySelector('[data-plugin-settings-directory]').click()
  const settingsSheet = w.document.querySelector('[data-surface="plugin-settings-sheet"]')
  assert.equal(settingsSheet.hidden, false)
  assert.ok(settingsSheet.querySelector('[data-plugin-settings-entry="disabled-settings"]'), '已停用但有 schema 的插件仍可配置')
  assert.equal(settingsSheet.querySelector('[data-plugin-settings-entry="unconfigured-plugin"]'), null)

  settingsSheet.querySelector('[data-plugin-settings-entry="disabled-settings"]').click()
  assert.match(w.document.querySelector('.lsb-view').textContent, /停用设置表单/)
})

test('选择新外观预设会清除旧站点覆盖并在重载后保持', async () => {
  const { w, wait } = makeDom('topic', 1200)
  await wait()
  w.document.querySelector('[data-canvas-open="tool-sheet"]').click()
  w.document.querySelector('[data-tool-action="appearance-sheet"]').click()
  const sheet = w.document.querySelector('[data-surface="appearance-sheet"]')
  const opacity = sheet.querySelector('[data-canvas-appearance="opacity"]')
  opacity.value = '0.48'
  opacity.dispatchEvent(new w.Event('input', { bubbles: true }))
  sheet.querySelector('[data-canvas-preset="static-readable"]').click()
  assert.equal(w.document.documentElement.style.getPropertyValue('--lsb-shell-glass-opacity'), '0.94')
  const stored = JSON.parse(w.localStorage.getItem('lsb_base:skin:canvas-state:v2'))
  assert.equal(stored.sites['https://linux.sb']?.appearance, undefined)

  const fresh = makeDom('topic', 1200, null, stored)
  await fresh.wait()
  fresh.w.document.querySelector('[data-canvas-open="tool-sheet"]').click()
  fresh.w.document.querySelector('[data-tool-action="appearance-sheet"]').click()
  assert.equal(fresh.w.document.querySelector('[data-canvas-appearance="opacity"]').value, '0.94')
  assert.equal(fresh.w.document.documentElement.style.getPropertyValue('--lsb-shell-glass-opacity'), '0.94')
})

test('站点信息表面保持原生侧栏卡片的完整高度并提供明确保存入口', async () => {
  const { w, wait } = makeDom('topic', 1200)
  await wait()
  w.document.querySelector('[data-canvas-open="tool-sheet"]').click()
  w.document.querySelector('[data-tool-action="site-card"]').click()
  const style = w.document.getElementById('lsb-skin-style').textContent
  assert.match(style, /data-canvas-site-sidebar\] > \.sidebar-card\{[^}]*flex:0 0 auto!important/)
  assert.match(style, /data-canvas-site-sidebar\] > \.sidebar-card\{[^}]*overflow:visible!important/)
  assert.match(style, /data-canvas-site-sidebar\]\{[^}]*max-height:none!important[^}]*overflow:visible!important/)

  w.document.querySelector('[data-surface="site-card"] [data-canvas-close]').click()
  w.document.querySelector('[data-canvas-open="tool-sheet"]').click()
  w.document.querySelector('[data-tool-action="appearance-sheet"]').click()
  const save = w.document.querySelector('[data-canvas-save-appearance]')
  assert.ok(save)
  save.click()
  assert.match(w.document.querySelector('[data-canvas-appearance-status]').textContent, /已保存/)
})

test('主页资料卡按原生选项收窄且完整展示外观字体', async () => {
  const { w, wait } = makeDom('home', 1200)
  await wait()
  const style = w.document.getElementById('lsb-skin-style').textContent
  const profile = w.document.querySelector('[data-canvas-profile-host]')
  const firstLink = profile?.querySelector('.user-links a[href*="tab=topics"]')
  assert.ok(profile && firstLink)
  assert.match(style, /data-canvas-profile-host\]\{[^}]*position:fixed/)
  assert.match(style, /data-canvas-profile-host\]\[data-expanded="true"\] > \.sidebar-card\.user-card\{[^}]*position:absolute/)
  assert.match(style, /data-canvas-profile-host\] \.user-links a\[data-canvas-profile-bell\]/)
  assert.equal(firstLink.hidden, false)
  assert.match(style, /lsb-canvas-page-home \.main-panel\{[^}]*border-radius:var\(--lsb-canvas-radius\)/)
  assert.match(style, /font-family:var\(--lsb-shell-font-family/)
  assert.match(style, /--lsb-canvas-surface-bg:color-mix\([^;]*calc\(var\(--lsb-shell-glass-opacity/)
  assert.match(style, /lsb-canvas-mode body\{[^}]*overflow-x:clip!important;overflow-y:visible!important/)
})

test('当前用户资料卡挂入氢顶栏左侧且不会复制原生卡', async () => {
  const { w, wait } = makeDom('home', 1200)
  await wait()
  const host = w.document.querySelector('[data-canvas-profile-host]')
  const card = host?.querySelector('.sidebar-card.user-card')
  const native = w.document.querySelector('aside.sidebar .sidebar-card.user-card')
  assert.ok(host && card)
  assert.strictEqual(card.parentElement, host)
  assert.notEqual(native, card)
  assert.equal(w.document.querySelectorAll('.sidebar-card.user-card').length, 1)
  assert.ok(host.querySelector('[data-canvas-profile-expand]'))
  assert.ok(host.querySelector('[data-canvas-profile-bell]'))
  assert.equal(host.dataset.expanded, 'false')
  assert.equal(host.querySelector('[data-canvas-profile-expand]').getAttribute('aria-expanded'), 'false')
})

test('宽屏资料卡悬停预览、箭头锁定展开且展开不改变正文坐标', async () => {
  const { w, wait } = makeDom('home', 1200)
  await wait()
  const host = w.document.querySelector('[data-canvas-profile-host]')
  const arrow = host?.querySelector('[data-canvas-profile-expand]')
  const firstPost = w.document.querySelector('.post-entry, .post-item')
  assert.ok(host && arrow && firstPost)
  const before = firstPost.getBoundingClientRect().top
  host.dispatchEvent(new w.MouseEvent('mouseenter', { bubbles: true }))
  assert.equal(host.dataset.expanded, 'true')
  host.dispatchEvent(new w.MouseEvent('mouseleave', { bubbles: true }))
  assert.equal(host.dataset.expanded, 'false')
  arrow.click()
  assert.equal(host.dataset.expanded, 'true')
  assert.equal(host.dataset.locked, 'true')
  host.dispatchEvent(new w.MouseEvent('mouseleave', { bubbles: true }))
  assert.equal(host.dataset.expanded, 'true')
  assert.equal(firstPost.getBoundingClientRect().top, before)
  arrow.click()
  assert.equal(host.dataset.expanded, 'false')
  assert.equal(host.dataset.locked, 'false')
})

test('用户页的他人资料卡继续留在资料区，当前用户卡只在存在真实节点时挂顶栏', async () => {
  const { w, wait } = makeDom('user', 1200)
  await wait()
  const profile = w.document.querySelector('[data-lsb-canvas-profile]')
  const target = profile?.querySelector('.sidebar-card.user-card')
  assert.ok(profile && target)
  assert.strictEqual(target.parentElement, profile)
  assert.equal(w.document.querySelector('[data-canvas-profile-host]')?.hidden, true)
})



test('用户页本人和他人都不回退为旧单状态栏布局', async () => {
  const cases = [
    ['他人主页', null],
    ['自己的主页', (w) => {
      for (const link of w.document.querySelectorAll('a[href="/user/5372"]')) link.setAttribute('href', '/user/1')
    }],
  ]
  for (const [label, prepare] of cases) {
    const { w, wait } = makeDom('user', 1200, null, null, prepare)
    await wait()
    const top = w.document.querySelector('[data-surface="top-status"]')
    const site = w.document.querySelector('[data-surface="site-status"]')
    const capsule = w.document.querySelector('[data-surface="tool-capsule"]')
    assert.ok(top && site && capsule, `${label} 缺少新壳层表面`)
    assert.equal(top.hidden, false, `${label} 顶部状态胶囊不应隐藏`)
    assert.equal(site.hidden, false, `${label} 站点信息胶囊不应隐藏`)
    assert.equal(capsule.hidden, false, `${label} 底部工具胶囊不应隐藏`)
    assert.equal(w.getComputedStyle(top).borderRadius, '999px', `${label} 不应使用旧的矩形状态栏`)
  }
})

test('本人用户页资料卡进入顶部胶囊而非正文资料区', async () => {
  const { w, wait } = makeDom('user', 1200, null, null, (window) => {
    for (const link of window.document.querySelectorAll('a[href="/user/5372"]')) link.setAttribute('href', '/user/1')
  })
  await wait()
  const topCard = w.document.querySelector('[data-canvas-profile-host] .lsb-canvas-self-user-card')
  const bodyCard = w.document.querySelector('[data-lsb-canvas-profile] .sidebar-card.user-card')
  assert.ok(topCard, '本人资料卡应进入顶部胶囊')
  assert.equal(bodyCard, null, '本人资料卡不应继续留在正文资料区')
  assert.equal(w.document.querySelectorAll('.sidebar-card.user-card').length, 1, '本人资料卡不应被复制')
})

test('用户页 B 方案使用两张表面并提供原生状态入口', async () => {
  const { w, wait } = makeDom('user', 1200)
  await wait()
  const profile = w.document.querySelector('[data-lsb-canvas-profile]')
  const list = w.document.querySelector('[data-lsb-canvas-list]')
  const original = w.document.querySelector('.sidebar-card.user-card')
  assert.ok(profile)
  assert.ok(list)
  assert.ok(original)
  assert.strictEqual(original.parentElement, profile)
  assert.notEqual(profile, list)
  assert.match(w.document.getElementById('lsb-skin-style').textContent, /gap:12px/)
  const labels = [...w.document.querySelectorAll('[data-canvas-status-links] a')].map((a) => a.textContent.trim())
  for (const label of ['用户榜单', '每日签到', '邀请中心']) assert.ok(labels.includes(label), `缺少${label}`)
})

test('用户页资料卡按原生选项收窄并始终完整显示', async () => {
  const { w, wait } = makeDom('user', 1200)
  await wait()
  const profile = w.document.querySelector('[data-lsb-canvas-profile]')
  const card = profile?.querySelector('.sidebar-card.user-card')
  const firstLink = card?.querySelector('.user-links a[href*="tab=topics"]')
  const style = w.document.getElementById('lsb-skin-style')?.textContent || ''
  assert.ok(profile && card && firstLink)
  assert.equal(profile.querySelector('[data-lsb-profile-expand]'), null)
  assert.match(style, /lsb-canvas-page-user \[data-lsb-canvas-profile\]\{[^}]*width:fit-content!important/)
  assert.match(style, /lsb-canvas-page-user \[data-lsb-canvas-profile\]\{[^}]*max-width:min\(100%,760px\)!important/)
  assert.equal(profile.dataset.scrollMode, 'full')
  Object.defineProperty(w, 'scrollY', { configurable: true, value: 240, writable: true })
  w.dispatchEvent(new w.Event('scroll'))
  await wait(20)
  assert.equal(profile.dataset.scrollMode, 'full')
  assert.equal(firstLink.hidden, false)
})

test('save appearance commits unsignaled control values', async () => {
  const { w, wait } = makeDom('topic', 1200)
  await wait()
  w.HTMLMediaElement.prototype.load = () => {}
  w.HTMLMediaElement.prototype.play = () => Promise.resolve()
  w.HTMLMediaElement.prototype.pause = () => {}
  w.document.querySelector('[data-canvas-open="tool-sheet"]').click()
  w.document.querySelector('[data-tool-action="appearance-sheet"]').click()
  const sheet = w.document.querySelector('[data-surface="appearance-sheet"]')
  sheet.querySelector('[data-canvas-appearance="fontFamily"]').value = 'system-ui'
  sheet.querySelector('[data-canvas-appearance="backgroundVideoUrl"]').value = 'https://cdn.example/video.mp4'
  sheet.querySelector('[data-canvas-save-appearance]').click()
  const stored = JSON.parse(w.localStorage.getItem('lsb_base:skin:canvas-state:v2'))
  const appearance = stored.sites['https://linux.sb']?.appearance
  assert.equal(appearance?.fontFamily, 'system-ui')
  assert.equal(appearance?.backgroundVideoUrl, 'https://cdn.example/video.mp4')
})

test('local video selection takes precedence over an existing remote video', async () => {
  const canvasState = {
    version: 2,
    enabled: true,
    global: { appearance: { background: 'video' } },
    sites: { 'https://linux.sb': { appearance: { background: 'video', backgroundVideoUrl: 'https://cdn.example/remote.mp4' } } },
  }
  const { w, wait } = makeDom('topic', 1200, null, canvasState, (w) => {
    w.URL.createObjectURL = () => 'blob:local-preferred'
    w.URL.revokeObjectURL = () => {}
    w.HTMLMediaElement.prototype.load = () => {}
    w.HTMLMediaElement.prototype.play = () => Promise.resolve()
    w.HTMLMediaElement.prototype.pause = () => {}
  })
  await wait()
  w.document.querySelector('[data-canvas-open="tool-sheet"]').click()
  w.document.querySelector('[data-tool-action="appearance-sheet"]').click()
  const input = w.document.querySelector('[data-canvas-media-file="video"]')
  const file = new w.File(['video'], 'background.mp4', { type: 'video/mp4' })
  Object.defineProperty(input, 'files', { configurable: true, value: [file] })
  input.dispatchEvent(new w.Event('change', { bubbles: true }))
  await wait(100)
  assert.equal(w.document.querySelector('[data-lsb-shell-video]')?.src, 'blob:local-preferred')
  const stored = JSON.parse(w.localStorage.getItem('lsb_base:skin:canvas-state:v2'))
  assert.equal(stored.sites['https://linux.sb'].appearance.backgroundVideoUrl, '')
})

test('画布视频背景位于页面背景层，不覆盖主页正文', async () => {
  const canvasState = {
    version: 2,
    enabled: true,
    global: { appearance: { background: 'video' } },
    sites: { 'https://linux.sb': { appearance: { background: 'video', backgroundVideoUrl: 'https://cdn.example/home.mp4' } } },
  }
  const { w, wait } = makeDom('home', 1200, null, canvasState, (window) => {
    window.HTMLMediaElement.prototype.load = () => {}
    window.HTMLMediaElement.prototype.play = () => Promise.resolve()
    window.HTMLMediaElement.prototype.pause = () => {}
  })
  await wait()
  const video = w.document.querySelector('[data-lsb-shell-video]')
  assert.ok(video)
  assert.equal(video.parentElement, w.document.body, '画布视频不能放在高 z-index 的氢壳 stacking context 内')
  assert.equal(video.style.pointerEvents, 'none')
})

test('画布媒体只提升正文根节点，body 直属固定弹层保留 fixed 定位', async () => {
  const { w, wait } = makeDom('topic', 1200, null, null, (window) => {
    const nativeStyle = window.document.createElement('style')
    nativeStyle.textContent = '.native-fixed-overlay{position:fixed;top:12px;right:12px;z-index:50}'
    window.document.head.append(nativeStyle)
    const overlay = window.document.createElement('div')
    overlay.className = 'native-fixed-overlay'
    overlay.textContent = '原生弹层'
    window.document.body.append(overlay)
    window.__nativeFixedOverlay = overlay
  })
  await wait()
  const style = w.document.getElementById('lsb-skin-style').textContent
  assert.equal(w.getComputedStyle(w.__nativeFixedOverlay).position, 'fixed')
  assert.match(style, /html\.lsb-skin-shell-on\.lsb-canvas-mode \.lsb-canvas-content-root\{[^}]*position:relative;z-index:1/)
  assert.doesNotMatch(style, /body\s*>\s*:not\(\[data-lsb-shell-video\]\)[^}]*position:relative/)
})

test('site information surface grows to content height by default', async () => {
  const { w, wait } = makeDom('topic', 1200)
  await wait()
  const card = w.document.querySelector('[data-surface="site-card"]')
  const style = w.document.getElementById('lsb-skin-style').textContent
  assert.equal(card.style.height, '')
  assert.match(style, /data-surface="site-card"\]\[data-surface-mode="rail"\]\{[^}]*bottom:/)
  assert.match(style, /data-surface="site-card"\]\[data-surface-mode="rail"\]\{[^}]*overflow:auto/)
})
