/** 界面精修：分项开关产出对应 CSS / 状态类；氢壳叠层；配置变更即时生效；themes 共存检测 */
import { test, afterEach } from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { JSDOM } from 'jsdom'

const baseCode = readFileSync(new URL('../dist-dev/linuxsb-base.user.js', import.meta.url), 'utf8')
const PLUG = (n) => readFileSync(new URL(`../plugins/${n}`, import.meta.url), 'utf8')
const topicHtml = readFileSync(new URL('./fixtures/topic1.html', import.meta.url), 'utf8')
const homeHtml = readFileSync(new URL('./fixtures/home.html', import.meta.url), 'utf8')
const userHtml = readFileSync(new URL('./fixtures/user1.html', import.meta.url), 'utf8')
const cloudflareChallengeHtml = readFileSync(new URL('./fixtures/cloudflare-challenge.html', import.meta.url), 'utf8')
const fixtureWindows = new Set()

afterEach(async () => {
  // Keep old fixtures' polling/observers out of later navigation assertions.
  const windows = [...fixtureWindows]
  fixtureWindows.clear()
  for (const w of windows) if (w.document) w.LSB?.disable('skin')
  await new Promise((resolve) => setTimeout(resolve, 0))
  for (const w of windows) if (w.document) w.close()
})

function makeDom(html, url, preload = {}) {
  const dom = new JSDOM(html, { url, runScripts: 'outside-only' })
  const w = dom.window
  fixtureWindows.add(w)
  w.unsafeWindow = w
  w.requestAnimationFrame = (fn) => w.setTimeout(() => fn(Date.now()), 0)
  w.cancelAnimationFrame = (id) => w.clearTimeout(id)
  w.scrollTo = () => {}
  // A zero-height jsdom list looks as if it is already at the bottom. Model a
  // long untouched homepage; infinite-scroll tests explicitly move its edge.
  const list = w.document.querySelector('.main-panel > ul.post-list:not(.topic-post-list)')
  if (list) list.getBoundingClientRect = () => ({ top: 0, bottom: 100000 })
  w.localStorage.setItem('lsb_base:__core:rate', JSON.stringify(10))
  for (const [k, v] of Object.entries(preload)) w.localStorage.setItem(k, JSON.stringify(v))
  const tick = (ms) => new Promise((r) => setTimeout(r, ms))
  async function until(fn, ms = 2500, step = 20) {
    const end = Date.now() + ms
    for (;;) {
      let ok = false
      try {
        ok = fn()
      } catch {
        /* keep polling */
      }
      if (ok) return true
      if (Date.now() > end) return false
      await tick(step)
    }
  }
  return { w, tick, until }
}

function withSkinConfig(preload = {}, patch = {}) {
  const configKey = 'lsb_base:skin:__config'
  const prior = preload[configKey] && typeof preload[configKey] === 'object' ? preload[configKey] : {}
  return { ...preload, [configKey]: { ...prior, ...patch } }
}

function withIos27Mode(preload = {}) {
  const config = preload['lsb_base:skin:__config']
  if (config?.uiMode != null) return preload
  return withSkinConfig(preload, { uiMode: 'ios27' })
}

function makeSite(preload = {}) {
  return makeDom(topicHtml, 'https://linux.sb/topic/1', withIos27Mode(preload))
}

function makeHome(preload = {}) {
  return makeDom(homeHtml, 'https://linux.sb/', withIos27Mode(preload))
}

function topicSpaPreload(preload = {}) {
  const configKey = 'lsb_base:skin:__config'
  const config = preload[configKey] && typeof preload[configKey] === 'object' ? preload[configKey] : {}
  return withSkinConfig({
    ...preload,
    'lsb_base:skin:topicSpaNewWorldDefaultMigrationV1': true,
  }, { topicSpa: true, uiMode: config.uiMode ?? 'ios27' })
}

function makeTopicSpaHome(preload = {}) {
  return makeHome(topicSpaPreload(preload))
}

function makeReadingHome(uiMode, preload = {}) {
  const result = makeTopicSpaHome(withSkinConfig(preload, { uiMode }))
  Object.defineProperty(result.w, 'innerWidth', { configurable: true, value: 1440 })
  return result
}

function testReadingModes(title, run) {
  for (const mode of ['legacy', 'ios27']) test(`${mode} 阅读路由：${title}`, () => run(mode))
}

function makeTopicSpaSite(preload = {}) {
  return makeDom(topicHtml, 'https://linux.sb/topic/1', topicSpaPreload(preload))
}

function makeUser(preload = {}) {
  return makeDom(userHtml, 'https://linux.sb/user/1', withIos27Mode(preload))
}

function makeLegacyDom(html, url, preload = {}) {
  const dom = makeDom(html, url, withSkinConfig(preload, { uiMode: 'legacy' }))
  Object.defineProperty(dom.w, 'innerWidth', { configurable: true, value: 1200 })
  return dom
}

function makeLegacySite(preload = {}) {
  return makeLegacyDom(topicHtml, 'https://linux.sb/topic/1', preload)
}

function makeLegacyHome(preload = {}) {
  return makeLegacyDom(homeHtml, 'https://linux.sb/', preload)
}

function makeLegacyUser(preload = {}) {
  return makeLegacyDom(userHtml, 'https://linux.sb/user/1', preload)
}

for (const mode of ['legacy', 'ios27']) {
  test(`${mode} 资料所有权：停用归还实际卡片，不误认同类节点`, async (t) => {
    const { w, tick } = makeReadingHome(mode)
    t.after(async () => { if (w.document) w.LSB?.disable('skin'); await tick(30); w.close() })
    const card = w.document.querySelector('.sidebar-card.user-card')
    const parent = card.parentNode
    await loadBase(w, PLUG('skin.user.js'))
    const decoy = w.document.createElement('div')
    decoy.className = mode === 'legacy' ? 'lsb-shell-user-card' : 'lsb-canvas-self-user-card'
    w.document.body.prepend(decoy)
    w.LSB.disable('skin')
    await tick(30)
    assert.equal(card.parentNode, parent)
    assert.equal(card.isConnected, true)
    assert.equal(decoy.parentNode, w.document.body)
  })

  test(`${mode} 资料所有权：用户 ID 前缀相同不能作为本人接管`, async (t) => {
    const { w, tick } = makeReadingHome(mode)
    t.after(async () => { if (w.document) w.LSB?.disable('skin'); await tick(30); w.close() })
    const card = w.document.querySelector('.sidebar-card.user-card')
    const link = card.querySelector('a.user-name')
    link.setAttribute('href', link.getAttribute('href') + '0')
    await loadBase(w, PLUG('skin.user.js'))
    const host = w.document.querySelector(mode === 'legacy' ? '#lsb-shell [data-lsb-shell-me]' : '[data-canvas-profile-host]')
    assert.equal(host?.contains(card), false)
  })
}

test('ios27 资料所有权：停用还原个人卡 ID 和通知属性', async (t) => {
  const { w, tick } = makeReadingHome('ios27')
  t.after(async () => { if (w.document) w.LSB?.disable('skin'); await tick(30); w.close() })
  const card = w.document.querySelector('.sidebar-card.user-card')
  card.id = 'native-user-card'
  const bell = [...card.querySelectorAll('a')].find((a) => a.getAttribute('href')?.includes('tab=notifications'))
  assert.ok(bell)
  bell.setAttribute('title', '原通知')
  bell.setAttribute('aria-label', '原标签')
  await loadBase(w, PLUG('skin.user.js'))
  w.LSB.disable('skin')
  await tick(30)
  assert.equal(card.id, 'native-user-card')
  assert.equal(bell.getAttribute('title'), '原通知')
  assert.equal(bell.getAttribute('aria-label'), '原标签')
  assert.equal(bell.hasAttribute('data-canvas-profile-bell'), false)
})

function makeMeilisearchTopForm(w) {
  const form = w.document.createElement('form')
  form.className = 'meilisearch-search-top-form'
  form.setAttribute('role', 'search')
  form.setAttribute('aria-label', '站内搜索')
  form.setAttribute('method', 'post')
  form.setAttribute('action', '/meilisearch_search')
  form.setAttribute('data-no-ajax', '1')
  form.setAttribute('data-search-cost', '0')
  form.setAttribute('data-search-balance', '0')
  form.setAttribute('title', '搜索标题、主题内容和回帖')
  form.innerHTML = `
    <input type="hidden" name="_csrf" value="site-token">
    <input type="search" name="q" aria-label="搜索关键词" placeholder="搜索" minlength="2" maxlength="120" required>
    <input type="hidden" name="scope" value="all">
    <input type="hidden" name="charge_confirmed" value="0">
    <button type="submit" aria-label="搜索">搜索</button>
  `
  return form
}

async function loadBase(w, ...plugins) {
  w.eval(baseCode)
  for (const code of plugins) w.eval(code)
  await new Promise((r) => setTimeout(r, 30))
}

const skinCss = (w) => w.document.getElementById('lsb-skin-style')?.textContent || ''
const shell = (w) => w.document.getElementById('lsb-shell')
const bootStyle = (w) => w.document.getElementById('lsb-shell-boot-style')
const bootCss = (w) => bootStyle(w)?.textContent || ''
const bootFrame = (w) => w.document.getElementById('lsb-shell-boot-frame')

async function changeSkinConfig(w, patch, wait = 140) {
  const key = 'lsb_base:skin:__config'
  const current = JSON.parse(w.localStorage.getItem(key) || '{}')
  w.localStorage.setItem(key, JSON.stringify({ ...current, ...patch }))
  w.LSB.bus.emit('config:changed:skin', patch, { source: 'core' })
  await new Promise((resolve) => setTimeout(resolve, wait))
}

function pointer(w, type, { x = 0, y = 0, button = 0, pointerId = 1 } = {}) {
  const event = new w.Event(type, { bubbles: true, cancelable: true })
  for (const [key, value] of Object.entries({ clientX: x, clientY: y, button, pointerId })) {
    Object.defineProperty(event, key, { configurable: true, value })
  }
  return event
}

function keydown(w, key, { shiftKey = false } = {}) {
  return new w.KeyboardEvent('keydown', { key, shiftKey, bubbles: true, cancelable: true })
}

test('旧三栏品牌区固定站名并过滤 AI 操作台', async () => {
  const { w, tick } = makeHome({
    'lsb_base:skin:__config': { uiMode: 'legacy' },
    'lsb_base:skin:topExtras': [
      { href: '/ai-console', label: '✨ AI 操作台' },
      { href: '/invite', label: '邀请中心' },
    ],
  })
  Object.defineProperty(w, 'innerWidth', { configurable: true, value: 1200 })
  const bar = w.document.querySelector('body > .top .bar')
  const nativeBrand = bar.querySelector('a.brand')
  nativeBrand.innerHTML = '<img src="/assets/site-logo.svg" alt=""><span>宣传标语</span>'
  const aiLink = w.document.createElement('a')
  aiLink.className = 'plugin-top-menu-link lsb-ai-console-top'
  aiLink.href = '/ai-console'
  aiLink.textContent = '✨ AI 操作台'
  bar.append(aiLink)
  const ordinaryLink = w.document.createElement('a')
  ordinaryLink.className = 'plugin-top-menu-link'
  ordinaryLink.href = '/plugin-entry'
  ordinaryLink.textContent = '普通插件入口'
  bar.append(ordinaryLink)

  await loadBase(w, PLUG('skin.user.js'))

  const shellBrand = shell(w).querySelector('.lsb-shell-brand')
  assert.equal(shellBrand.querySelector('img')?.getAttribute('src'), '/assets/site-logo.svg')
  assert.equal(shellBrand.textContent.trim(), 'LINUX SB')
  const extras = [...shell(w).querySelectorAll('.lsb-shell-extras a')]
  assert.equal(extras.some((link) => /AI 操作台/.test(link.textContent)), false)
  assert.ok(extras.some((link) => link.textContent.trim() === '普通插件入口'))
  assert.ok(extras.some((link) => link.textContent.trim() === '邀请中心'))
  assert.equal(aiLink.parentNode, bar, '实时 AI 操作台入口留在原站顶栏，不进入旧壳')

  w.LSB.disable('skin')
  await tick(30)
  assert.equal(nativeBrand.textContent.trim(), '宣传标语')
  assert.equal(aiLink.parentNode, bar, '停用后实时入口仍在原站顶栏')
})

test('Cloudflare 整页挑战保持原生可见并在同文档恢复画布', async () => {
  const { w, tick, until } = makeDom(cloudflareChallengeHtml, 'https://linux.sb/', {
    'lsb_base:skin:__config': { uiMode: 'ios27' },
  })
  const main = w.document.querySelector('main.wrap')
  const top = w.document.querySelector('body > .top')
  w.eval(baseCode)
  await tick(30)

  assert.equal(w.document.documentElement.getAttribute('data-lsb-cloudflare-challenge'), 'true')
  assert.equal(w.document.documentElement.classList.contains('lsb-canvas-boot'), false)
  assert.equal(bootFrame(w), null)
  assert.match(bootCss(w), /lsb-canvas-navigating/)
  assert.notEqual(w.getComputedStyle(top).display, 'none')

  w.eval(PLUG('skin.user.js'))
  await tick(100)
  assert.equal(shell(w), null)
  assert.equal(w.document.getElementById('lsb-shell-surfaces'), null)
  assert.equal(w.document.documentElement.classList.contains('lsb-canvas-mode'), false)
  assert.equal(w.document.querySelector('main.wrap'), main, '挑战 main 节点不被替换或迁移')
  assert.equal(main.textContent.includes('Verify you are human'), true)
  assert.equal(w.getComputedStyle(top).display, 'block')
  assert.equal(top.classList.contains('lsb-native-header-hidden'), false)
  assert.equal(w.document.querySelector('aside.sidebar').classList.contains('lsb-native-sidebar-hidden'), false)

  main.replaceChildren(Object.assign(w.document.createElement('p'), { textContent: 'Normal forum content' }))
  w.document.title = 'Forum | LINUX SB'
  w.document.getElementById('challenge-stage')?.remove()
  assert.equal(await until(() => !!w.document.querySelector('#lsb-shell-surfaces'), 1800), true)
  assert.equal(w.document.documentElement.hasAttribute('data-lsb-cloudflare-challenge'), false)
  assert.equal(w.document.documentElement.classList.contains('lsb-canvas-mode'), true)
  assert.equal(w.document.querySelector('main.wrap'), main, '恢复画布时保留同一个正文节点')
  assert.match(main.textContent, /Normal forum content/)
})

test('普通 Turnstile 控件和 Cloudflare 资源不触发挑战旁路', async () => {
  const { w } = makeHome({ 'lsb_base:skin:__config': { uiMode: 'ios27' } })
  const resource = w.document.createElement('script')
  resource.src = 'https://challenges.cloudflare.com/turnstile/v0/api.js'
  w.document.head.append(resource)
  const widget = w.document.createElement('div')
  widget.className = 'cf-turnstile'
  widget.innerHTML = '<iframe title="Widget containing a Cloudflare security challenge"></iframe>'
  w.document.querySelector('main.wrap').prepend(widget)

  await loadBase(w, PLUG('skin.user.js'))

  assert.equal(w.document.documentElement.hasAttribute('data-lsb-cloudflare-challenge'), false)
  assert.ok(w.document.querySelector('#lsb-shell[data-lsb-canvas-shell="true"]'))
  assert.ok(w.document.getElementById('lsb-shell-surfaces'))
  assert.equal(widget.isConnected, true)
})

test('界面精修：默认配置产出全部规则与状态类', async () => {
  const { w } = makeSite()
  await loadBase(w, PLUG('skin.user.js'))

  const css = skinCss(w)
  assert.ok(css.includes('line-height:1.75'), '排版：正文行高')
  assert.ok(css.includes('PingFang SC'), '排版：中文字体栈')
  assert.ok(css.includes('.post-content pre'), '代码块规则存在')
  assert.ok(!css.includes("[data-floor='1']"), '主楼不再左边高亮')
  assert.ok(!/:not\(\[data-floor\]\)/.test(css), 'v8.7.5 主楼也不高亮')
  assert.match(css, /li\.post-entry\{border-bottom/, '楼层分隔线还在')
  assert.ok(!css.includes("content:'楼主'"), '不再挂楼主徽标，和站点自己的身份标记重复')

  const dbg = await w.LSB.bus.request('skin:debug')
  assert.deepEqual(
    [...dbg.markers].sort(),
    ['lsb-skin-code-on', 'lsb-skin-floors-on', 'lsb-skin-glass-on', 'lsb-skin-shell-on', 'lsb-skin-shell-topic', 'lsb-skin-type-on'],
    '默认三项排版 + 氢壳开启；帖子页额外挂 topic 类',
  )
  assert.equal(dbg.active.density, '舒适')
  assert.equal(dbg.active.shell, true)
  assert.ok(dbg.styleBytes > 0)
})

test('界面模式缺失或未知时使用旧三段式', async () => {
  for (const config of [{}, { uiMode: '' }, { uiMode: 'future-mode' }]) {
    const { w } = makeDom(homeHtml, 'https://linux.sb/', {
      'lsb_base:skin:__config': config,
    })
    Object.defineProperty(w, 'innerWidth', { configurable: true, value: 1200 })
    await loadBase(w, PLUG('skin.user.js'))
    assert.equal(w.document.documentElement.classList.contains('lsb-canvas-mode'), false)
    assert.equal(w.document.getElementById('lsb-shell-surfaces'), null)
    assert.ok(w.document.getElementById('lsb-shell'))
  }
})

test('氢壳：积分和称号功能合并为一个工作台入口', async () => {
  const { w, tick } = makeHome()
  w.fetch = async (url) => ({
    status: 200,
    ok: true,
    url: String(url),
    text: async () => '<html><body></body></html>',
  })
  await loadBase(w,
    PLUG('points-ledger.user.js'),
    PLUG('title-quotes.user.js'),
    PLUG('title-forge-planner.user.js'),
    PLUG('points-title-workbench.user.js'),
    PLUG('skin.user.js'),
  )

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

  sheet.querySelector('[data-plugin-feature-action="points-title-workbench"]').click()
  await tick(0)
  assert.ok(w.document.querySelector('[data-points-title-workbench]'))
})

test('界面模式显式选择 iOS 27 时继续挂载画布', async () => {
  const { w } = makeDom(homeHtml, 'https://linux.sb/', {
    'lsb_base:skin:__config': { uiMode: 'ios27' },
  })
  await loadBase(w, PLUG('skin.user.js'))
  assert.equal(w.document.getElementById('lsb-shell')?.getAttribute('data-lsb-canvas-shell'), 'true')
  assert.ok(w.document.getElementById('lsb-shell-surfaces'))
})

test('界面模式设置位于皮肤插件 schema 且默认值为 legacy', async () => {
  const { w } = makeDom(homeHtml, 'https://linux.sb/', {
    'lsb_base:skin:__config': {},
  })
  Object.defineProperty(w, 'innerWidth', { configurable: true, value: 1200 })
  await loadBase(w, PLUG('skin.user.js'))
  w.LSB.open('skin')
  const label = [...w.document.querySelectorAll('.lsb-panel .lsb-field')]
    .find((field) => field.querySelector('span')?.textContent === '界面模式')
  const select = label?.querySelector('select')
  assert.ok(select, '皮肤插件的独立设置表单应显示界面模式选择器')
  assert.equal(select.value, 'legacy')
  assert.deepEqual([...select.options].map((option) => [option.value, option.textContent]), [
    ['legacy', '旧三段式'],
    ['ios27', 'iOS 27 单画布'],
  ])
})

test('旧三栏只在 1100px 及以上挂载，窄屏恢复原生页面', async () => {
  for (const [width, shouldMount] of [[1100, true], [1099, false]]) {
    const { w } = makeDom(homeHtml, 'https://linux.sb/', {
      'lsb_base:skin:__config': {},
    })
    Object.defineProperty(w, 'innerWidth', { configurable: true, value: width })
    await loadBase(w, PLUG('skin.user.js'))
    assert.equal(Boolean(w.document.getElementById('lsb-shell')), shouldMount, `${width}px shell state`)
    assert.equal(w.document.getElementById('lsb-shell-surfaces'), null)
    assert.equal(w.document.documentElement.classList.contains('lsb-canvas-mode'), false)
    assert.equal(w.document.querySelector('body > .top')?.classList.contains('lsb-native-header-hidden'), shouldMount)
    if (shouldMount) {
      assert.equal(w.document.querySelector('#lsb-shell[data-lsb-shell-mode="windowed"]'), null)
      assert.equal(w.document.querySelectorAll('[data-lsb-shell-window-drag]').length, 0)
    }
  }
})

test('界面模式双向切换保留路由、正文、滚动与原生节点', async () => {
  const canvasState = {
    version: 2,
    enabled: true,
    global: { appearance: { background: 'image', backgroundImageUrl: 'https://cdn.example/preserved.webp' } },
    sites: { 'https://linux.sb': { layout: { wide: { 'ai-card': { x: 31, y: 47 } } } } },
  }
  const { w } = makeDom(homeHtml, 'https://linux.sb/?sort=comment', {
    'lsb_base:skin:__config': {},
    'lsb_base:skin:canvas-state:v2': canvasState,
  })
  Object.defineProperty(w, 'innerWidth', { configurable: true, value: 1440 })
  let scrollX = 12
  let scrollY = 386
  Object.defineProperty(w, 'scrollX', { configurable: true, get: () => scrollX })
  Object.defineProperty(w, 'scrollY', { configurable: true, get: () => scrollY })
  w.scrollTo = (x, y) => { scrollX = Number(x); scrollY = Number(y) }
  const outlet = w.document.querySelector('main.wrap')
  const originalUrl = w.location.href
  const search = w.document.querySelector('form.search-form')
  const nativeCards = [...w.document.querySelectorAll('.sidebar-card')]
  const originalHomes = new Map([search, ...nativeCards].filter(Boolean).map((node) => [node, node.parentNode]))
  await loadBase(w, PLUG('skin.user.js'))

  const savedCanvasState = w.localStorage.getItem('lsb_base:skin:canvas-state:v2')
  assert.ok(w.document.getElementById('lsb-shell'))
  assert.equal(w.document.getElementById('lsb-shell-surfaces'), null)

  const assertMode = (mode) => {
    assert.equal(w.location.href, originalUrl, '切换不改变当前 URL')
    assert.strictEqual(w.document.querySelector('main.wrap'), outlet, '切换保留同一个正文出口')
    assert.equal(outlet.isConnected, true)
    assert.equal(scrollX, 12)
    assert.equal(scrollY, 386)
    assert.ok(w.document.querySelectorAll('#lsb-shell').length <= 1, '最多一个氢壳')
    assert.ok(w.document.querySelectorAll('#lsb-shell-surfaces').length <= 1, '最多一个画布 surfaces 宿主')
    assert.equal(w.document.documentElement.classList.contains('lsb-canvas-mode'), mode === 'ios27')
    assert.equal(Boolean(w.document.getElementById('lsb-shell-surfaces')), mode === 'ios27')
    for (const node of originalHomes.keys()) {
      assert.equal(node.isConnected, true, `原生节点 ${node.tagName}.${node.className} 仍连接`)
      const selector = node.matches('form.search-form') ? 'form.search-form' : '.sidebar-card'
      assert.equal([...w.document.querySelectorAll(selector)].filter((candidate) => candidate === node).length, 1, '原生节点不复制')
    }
    assert.equal(w.localStorage.getItem('lsb_base:skin:canvas-state:v2'), savedCanvasState, '切换保留画布外观与布局数据')
  }

  await changeSkinConfig(w, { uiMode: 'ios27' })
  assertMode('ios27')
  await changeSkinConfig(w, { uiMode: 'legacy' })
  assertMode('legacy')

  for (let cycle = 0; cycle < 3; cycle += 1) {
    await changeSkinConfig(w, { uiMode: 'ios27' })
    assertMode('ios27')
    await changeSkinConfig(w, { uiMode: 'legacy' })
    assertMode('legacy')
  }

  await changeSkinConfig(w, { shell: false })
  assert.equal(w.document.getElementById('lsb-shell'), null)
  for (const [node, parent] of originalHomes) assert.strictEqual(node.parentNode, parent, '停用后原生节点回到原父节点')
})

test('旧三栏断点跨越时卸载并重新挂载，原生节点不丢失', async () => {
  const { w } = makeDom(homeHtml, 'https://linux.sb/', { 'lsb_base:skin:__config': {} })
  Object.defineProperty(w, 'innerWidth', { configurable: true, value: 1100 })
  const outlet = w.document.querySelector('main.wrap')
  const search = w.document.querySelector('form.search-form')
  const searchHome = search.parentNode
  await loadBase(w, PLUG('skin.user.js'))
  assert.ok(w.document.getElementById('lsb-shell'))

  Object.defineProperty(w, 'innerWidth', { configurable: true, value: 1099 })
  w.dispatchEvent(new w.Event('resize'))
  assert.equal(await new Promise((resolve) => {
    const end = Date.now() + 1000
    const poll = () => {
      if (!w.document.getElementById('lsb-shell')) return resolve(true)
      if (Date.now() >= end) return resolve(false)
      setTimeout(poll, 20)
    }
    poll()
  }), true, '跨到 1099px 后应卸载旧壳')
  assert.equal(w.document.documentElement.classList.contains('lsb-skin-shell-on'), false)
  assert.equal(w.document.querySelector('body > .top')?.classList.contains('lsb-native-header-hidden'), false)
  assert.strictEqual(w.document.querySelector('main.wrap'), outlet)
  assert.strictEqual(search.parentNode, searchHome)

  Object.defineProperty(w, 'innerWidth', { configurable: true, value: 1100 })
  w.dispatchEvent(new w.Event('resize'))
  assert.equal(await new Promise((resolve) => {
    const end = Date.now() + 1000
    const poll = () => {
      if (w.document.getElementById('lsb-shell')) return resolve(true)
      if (Date.now() >= end) return resolve(false)
      setTimeout(poll, 20)
    }
    poll()
  }), true, '回到 1100px 后应重新挂载旧壳')
  assert.equal(w.document.getElementById('lsb-shell-surfaces'), null)
  assert.strictEqual(w.document.querySelector('main.wrap'), outlet)
  assert.equal(search.isConnected, true)
})

test('模式挂载失败时清理壳标记并恢复原生页面', async () => {
  const { w } = makeDom(homeHtml, 'https://linux.sb/', { 'lsb_base:skin:__config': {} })
  Object.defineProperty(w, 'innerWidth', { configurable: true, value: 1200 })
  await loadBase(w, PLUG('skin.user.js'))
  await new Promise((resolve) => setTimeout(resolve, 90))
  const outlet = w.document.querySelector('main.wrap')
  outlet.remove()

  assert.doesNotThrow(() => {
    const key = 'lsb_base:skin:__config'
    const config = JSON.parse(w.localStorage.getItem(key) || '{}')
    w.localStorage.setItem(key, JSON.stringify({ ...config, uiMode: 'ios27' }))
    w.LSB.bus.emit('config:changed:skin', { uiMode: 'ios27' }, { source: 'core' })
  })
  await new Promise((resolve) => setTimeout(resolve, 180))
  const root = w.document.documentElement
  assert.equal(w.document.getElementById('lsb-shell'), null)
  assert.equal(w.document.getElementById('lsb-shell-surfaces'), null)
  assert.equal(root.classList.contains('lsb-canvas-mode'), false)
  assert.equal(root.classList.contains('lsb-skin-shell-on'), false)
  assert.equal(root.classList.contains('lsb-canvas-boot'), false)
  assert.equal(w.document.getElementById('lsb-shell-boot-frame'), null)
  assert.equal(w.document.querySelector('body > .top')?.classList.contains('lsb-native-header-hidden'), false)
  assert.ok([...w.document.querySelectorAll('aside.sidebar')]
    .filter((node) => node.id !== 'mobile-menu-drawer')
    .every((node) => !node.classList.contains('lsb-native-sidebar-hidden')))
})

test('氢壳：帖子里的原生收藏按钮不能被藏掉', async () => {
  const { w } = makeSite()
  await loadBase(w, PLUG('skin.user.js'))
  const css = skinCss(w)
  assert.ok(
    !/li\.post-item \.meta-icon\{display:none\}/.test(css),
    '不能无差别藏掉所有 post-item 的 meta-icon：帖内楼层也是 post-item',
  )
  assert.match(css, /li\.post-item:not\(\.post-entry\) \.meta-icon/, '只藏首页列表装饰图标')
  const fav = w.document.querySelector('.topic-favorites-action .fav-btn')
  assert.ok(fav, '原生收藏按钮还在')
  assert.ok(fav.querySelector('.meta-icon'), '收藏星星还在')
})

test('停用皮肤还原正文父节点和原生壳状态', async () => {
  const { w, tick } = makeSite()
  const outlet = w.document.querySelector('main.wrap')
  const home = outlet.parentNode
  await loadBase(w, PLUG('skin.user.js'))
  w.LSB.disable('skin')
  await tick(30)
  assert.strictEqual(outlet.parentNode, home)
  assert.equal(w.document.querySelector('#lsb-shell'), null)
})

test('legacy 验收：M15 skin controller 通过公开 API 关闭工作台并持久化站点 tab', async () => {
  const { w } = makeLegacySite()
  await loadBase(w, PLUG('skin.user.js'))
  w.LSB.__core.ui.shellAsideSelect('site')
  assert.equal(w.document.querySelector('[data-lsb-shell-aside-tab="site"]')?.getAttribute('aria-selected'), 'true')
})


test('界面精修：紧凑密度挂状态类并输出压缩规则', async () => {
  const { w } = makeSite({ 'lsb_base:skin:__config': { density: '紧凑', measure: true } })
  await loadBase(w, PLUG('skin.user.js'))

  const dbg = await w.LSB.bus.request('skin:debug')
  assert.ok(dbg.markers.includes('lsb-skin-density-compact'), '紧凑状态类已挂')
  assert.ok(dbg.markers.includes('lsb-skin-measure-on'), '限宽开关状态类已挂')
  const css = skinCss(w)
  assert.ok(css.includes('lsb-skin-density-compact ul.post-list'), '密度规则作用域正确')
  assert.ok(css.includes('@media(min-width:1280px)'), '限宽仅在宽屏媒体查询内')
})

test('界面精修：关闭项不产生任何规则，变更经配置事件即时生效', async () => {
  const { w, tick } = makeSite({
    'lsb_base:skin:__config': {
      typography: false,
      codeblock: false,
      floors: false,
      measure: false,
      shell: false,
    },
  })
  await loadBase(w, PLUG('skin.user.js'))

  assert.equal(skinCss(w).trim(), '', '全关时样式为空')
  let dbg = await w.LSB.bus.request('skin:debug')
  assert.deepEqual([...dbg.markers], [], '无任何状态类')
  assert.equal(shell(w), null, '关壳时不挂 #lsb-shell')

  // 与设置表单同一通道：写存储 → 派发 config:changed:<id> → 监听器重读并重注入
  w.eval(`(() => {
    const cur = JSON.parse(localStorage.getItem('lsb_base:skin:__config'))
    cur.typography = true
    localStorage.setItem('lsb_base:skin:__config', JSON.stringify(cur))
  })()`)
  w.LSB.bus.emit('config:changed:skin', { typography: true }, { source: 'core' })
  await tick(10)

  dbg = await w.LSB.bus.request('skin:debug')
  assert.ok(dbg.markers.includes('lsb-skin-type-on'), '状态类即时更新')
  assert.ok(skinCss(w).includes('line-height:1.75'), '样式即时重注入')
  assert.ok(!skinCss(w).includes('.post-content pre'), '未开启的项保持无规则')
})

test('界面精修：检测到 themes 插件时在 debug 中如实上报（排版层与其无冲突）', async () => {
  const dom = new JSDOM(topicHtml, { url: 'https://linux.sb/topic/1', runScripts: 'outside-only' })
  const w = dom.window
  fixtureWindows.add(w)
  w.unsafeWindow = w
  w.requestAnimationFrame = (fn) => w.setTimeout(() => fn(Date.now()), 0)
  w.cancelAnimationFrame = (id) => w.clearTimeout(id)
  w.localStorage.setItem('lsb_base:__core:rate', JSON.stringify(10))

  const style = w.document.createElement('style')
  style.setAttribute('data-themes-plugin', '1')
  w.document.head.appendChild(style)

  await loadBase(w, PLUG('skin.user.js'))
  const dbg = await w.LSB.bus.request('skin:debug')
  assert.equal(dbg.themesPluginDetected, true)
})

test('界面精修：停用后去掉 html 状态类', async () => {
  const { w } = makeSite()
  await loadBase(w, PLUG('skin.user.js'))
  assert.ok([...w.document.documentElement.classList].some((c) => c.startsWith('lsb-skin-')))
  assert.ok(shell(w), '启用时有壳')
  w.LSB.disable('skin')
  assert.equal(
    [...w.document.documentElement.classList].filter((c) => c.startsWith('lsb-skin-')).length,
    0,
  )
  assert.equal(shell(w), null, '停用后拆掉壳')
  assert.ok(
    !w.document.querySelector('.lsb-native-header-hidden'),
    '停用后原生顶栏不再带隐藏类',
  )
  assert.ok(
    w.document.querySelector('aside.sidebar .sidebar-card.user-card'),
    '停用后用户卡回到原生右栏',
  )
})

test('skin 登记列表筛选：只在首页/版块可见，停用后注销', async () => {
  const { w } = makeHome()
  await loadBase(w, PLUG('skin.user.js'))
  const ids = w.LSB.__core.ai.actions({ route: { type: 'home' } }).map((x) => x.id)
  assert.ok(ids.includes('site.filter'))
  assert.equal(w.LSB.__core.ai.actions({ route: { type: 'home' } }).find((x) => x.id === 'site.filter').terminal, true)
  assert.equal(w.LSB.__core.ai.actions({ route: { type: 'topic' } }).some((x) => x.id === 'site.filter'), false)
  const result = await w.LSB.__core.ai.execute(
    { action: 'site.filter', args: { sort: 'comment' } },
    { route: { type: 'home' } },
  )
  assert.equal(result.kind, 'navigation')
  assert.equal(result.url, '/index.php?sort=comment')
  assert.equal(result.label, '已应用列表筛选')
  w.LSB.disable('skin')
  assert.equal(w.LSB.__core.ai.actions({ route: { type: 'home' } }).some((x) => x.id === 'site.filter'), false)
})

test('legacy 验收：氢壳右栏：注册外部视图后显示站点/AI，切换不销毁站点卡片', async () => {
  const { w, until } = makeLegacySite()
  await loadBase(w, PLUG('skin.user.js'))
  const card = w.document.querySelector('#lsb-shell-aside .sidebar-card')
  assert.ok(card, '夹具应有可迁移的站点卡片')
  Object.defineProperty(w, 'innerWidth', { value: 1200, configurable: true })
  w.dispatchEvent(new w.Event('resize'))
  w.LSB.register(
    { id: 'aside-demo', version: '1.0.0', permissions: ['ui', 'events', 'read'] },
    (api) => {
      api.ui.shellAsideView({
        id: 'demo',
        label: 'AI',
        render(host) {
          host.innerHTML = '<div data-demo>AI 内容</div>'
          return () => {
            host.textContent = ''
          }
        },
      })
    },
  )
  assert.equal(await until(() => w.document.querySelector('[data-lsb-shell-aside-tab="demo"]')), true)
  const siteCard = w.document.querySelector('#lsb-shell-aside .sidebar-card')
  assert.equal(siteCard, card)
  const aiTab = w.document.querySelector('[data-lsb-shell-aside-tab="demo"]')
  aiTab.click()
  assert.equal(w.document.querySelector('[data-lsb-shell-aside-pane="site"]').hidden, true)
  assert.match(w.document.querySelector('[data-demo]').textContent, /AI 内容/)
  w.document.querySelector('[data-lsb-shell-aside-tab="site"]').click()
  assert.equal(w.document.querySelector('[data-lsb-shell-aside-pane="site"]').hidden, false)
  assert.equal(w.document.querySelector('#lsb-shell-aside .sidebar-card'), card)
  w.LSB.disable('aside-demo')
  assert.equal(await until(() => !w.document.querySelector('[data-lsb-shell-aside-tab="demo"]')), true)
  assert.equal(w.document.querySelector('[data-demo]'), null, '停用外部视图后清理内容和 pane')
  assert.equal(w.document.querySelector('#lsb-shell-aside .sidebar-card'), card)
})

test('legacy 验收：氢壳右栏偏好：AI 标签在路由变化、窄屏回退和完整刷新后恢复', async () => {
  const { w, until } = makeLegacySite()
  await loadBase(w, PLUG('skin.user.js'))
  assert.equal(w.document.querySelector('[data-lsb-shell-aside-tab="site"]').getAttribute('aria-selected'), 'true')
  Object.defineProperty(w, 'innerWidth', { value: 1200, configurable: true })
  w.dispatchEvent(new w.Event('resize'))
  w.LSB.register({ id: 'aside-ai-test', version: '1.0.0', permissions: ['ui'] }, (api) => {
    api.ui.shellAsideView({ id: 'ai-workbench', label: 'AI', render: (host) => { host.textContent = 'AI' } })
  })
  assert.equal(await until(() => w.document.querySelector('[data-lsb-shell-aside-tab="ai-workbench"]')), true)
  w.document.querySelector('[data-lsb-shell-aside-tab="ai-workbench"]').click()
  assert.equal(w.localStorage.getItem('lsb_base:skin:aside-active'), '"ai-workbench"')

  w.LSB.bus.emit('route:changed', { href: '/topic/2', page: { type: 'topic', id: 2 } }, { source: 'test' })
  assert.equal(await until(() => w.document.querySelector('[data-lsb-shell-aside-tab="ai-workbench"]')?.getAttribute('aria-selected') === 'true'), true)
  Object.defineProperty(w, 'innerWidth', { value: 900, configurable: true })
  w.dispatchEvent(new w.Event('resize'))
  await new Promise((resolve) => setTimeout(resolve, 80))
  assert.equal(w.document.querySelector('#lsb-shell'), null, '900px 时恢复原生页面')
  Object.defineProperty(w, 'innerWidth', { value: 1200, configurable: true })
  w.dispatchEvent(new w.Event('resize'))
  assert.equal(await until(() => w.document.querySelector('[data-lsb-shell-aside-tab="ai-workbench"]')?.getAttribute('aria-selected') === 'true'), true, '恢复宽屏后沿用之前的页签')
  assert.equal(w.localStorage.getItem('lsb_base:skin:aside-active'), '"ai-workbench"')

  const restarted = makeLegacySite({ 'lsb_base:skin:aside-active': 'ai-workbench' })
  await loadBase(restarted.w, PLUG('skin.user.js'))
  Object.defineProperty(restarted.w, 'innerWidth', { value: 1200, configurable: true })
  restarted.w.dispatchEvent(new restarted.w.Event('resize'))
  restarted.w.LSB.register({ id: 'aside-ai-test-restart', version: '1.0.0', permissions: ['ui'] }, (api) => {
    api.ui.shellAsideView({ id: 'ai-workbench', label: 'AI', render: (host) => { host.textContent = 'AI' } })
  })
  assert.equal(await restarted.until(() => restarted.w.document.querySelector('[data-lsb-shell-aside-tab="ai-workbench"]')?.getAttribute('aria-selected') === 'true'), true)
})

test('legacy 验收：氢壳：个人卡晚于壳出现时仍迁入左栏', async () => {
  const { w, tick, until } = makeLegacyHome()
  const native = w.document.querySelector('aside.sidebar .sidebar-card.user-card')
  assert.ok(native, '夹具要有原生个人卡')
  const html = native.outerHTML
  native.remove()
  await loadBase(w, PLUG('skin.user.js'))
  await tick(80)
  assert.equal(
    w.document.querySelector('#lsb-shell [data-lsb-shell-me] .sidebar-card.user-card'),
    null,
    '卡还没进 DOM 时左栏应空，50ms 刷新也救不了',
  )
  const side = [...w.document.querySelectorAll('aside.sidebar')].find(
    (el) => el.id !== 'mobile-menu-drawer' && !el.classList.contains('mobile-menu-drawer'),
  )
  assert.ok(side, '原生侧栏还在，只是被壳藏着')
  side.insertAdjacentHTML('afterbegin', html)
  assert.ok(
    await until(() => w.document.querySelector('#lsb-shell [data-lsb-shell-me] .sidebar-card.user-card'), 1500),
    '个人卡晚出现后应迁入左栏，不能留在被藏掉的右栏',
  )
  assert.equal(
    w.document.querySelectorAll('.sidebar-card.user-card').length,
    1,
    '晚出现的卡是迁入不是克隆',
  )
})

test('legacy 验收：左栏收全部版块并保留积分-称号工作台入口', async () => {
  const { w } = makeLegacyHome()
  let more = w.document.querySelector('.forum-more-region')
  if (!more) {
    more = w.document.createElement('div')
    more.className = 'forum-more-region'
    w.document.body.append(more)
  }
  const extra = w.document.createElement('a')
  extra.className = 'forum-more-link'
  extra.href = '/forum/99'
  extra.textContent = '交流'
  more.append(extra)

  stubHtmlFetch(w, '')
  await loadBase(w, PLUG('points-ledger.user.js'), PLUG('title-quotes.user.js'),
    PLUG('title-forge-planner.user.js'), PLUG('points-title-workbench.user.js'), PLUG('skin.user.js'))
  const boards = [...shell(w).querySelectorAll('[data-lsb-shell-section="boards"] a')].map((a) =>
    (a.querySelector('.lsb-shell-link-label')?.textContent || a.textContent).trim(),
  )
  assert.ok(boards.includes('技术交流'))
  assert.ok(boards.includes('交流'), '全部版块里的交流也要进左栏')
  assert.ok(
    boards.length > w.document.querySelectorAll('.forum-nav a[href^="/forum/"]').length,
    '左栏不能只剩顶部导航那 6 个',
  )
  const tools = [...shell(w).querySelectorAll('[data-lsb-shell-section="tools"] .lsb-shell-link-label')].map(
    (el) => el.textContent,
  )
  assert.ok(tools.includes('积分-称号'), '版块再多，统一工作台仍留在工具区')
  const css = skinCss(w).replace(/\s+/g, '')
  assert.match(css, /\[data-lsb-shell-section="boards"\]\{[^}]*overflow:auto/)
  assert.match(css, /\[data-lsb-shell-section="tools"\]\{[^}]*flex:0/)
})

test('legacy 验收：氢壳：左栏版块显示原站主题数', async () => {
  const { w } = makeLegacyHome()
  await loadBase(w, PLUG('skin.user.js'))
  const boards = shell(w).querySelector('[data-lsb-shell-section="boards"]')
  const row = [...boards.querySelectorAll('a[href^="/forum/"]')].find((a) =>
    a.getAttribute('href') === '/forum/1',
  )
  assert.ok(row, '左栏有错误地方')
  assert.match(row.querySelector('.lsb-shell-link-label')?.textContent || '', /错误地方/)
  assert.equal(row.querySelector('.lsb-shell-count')?.textContent, '3862')
  const stored = JSON.parse(w.localStorage.getItem('lsb_base:skin:boardCounts') || 'null')
  assert.equal(stored?.[1], 3862)

  const { w: profile } = makeLegacyUser({ 'lsb_base:skin:boardCounts': { 1: 3862, 7: 78 } })
  await loadBase(profile, PLUG('skin.user.js'))
  const cached = [...shell(profile).querySelectorAll('[data-lsb-shell-section="boards"] a[href="/forum/1"]')][0]
  assert.equal(cached?.querySelector('.lsb-shell-count')?.textContent, '3862', '用户页没有侧栏版块卡，沿用首页记住的主题数')
})

test('legacy 验收：氢壳：顶栏站名盖过左栏，并带站点 logo', async () => {
  const { w } = makeLegacyHome()
  await loadBase(w, PLUG('skin.user.js'))
  const brand = shell(w).querySelector('.lsb-shell-brand')
  assert.ok(brand)
  assert.match(brand.textContent, /LINUX SB/)
  const logo = brand.querySelector('img')
  assert.ok(logo, '站名旁边要有 logo，不能只剩被左栏盖住的文字')
  assert.match(logo.getAttribute('src') || '', /index\.svg|favicon|icon/i)

  const compact = skinCss(w).replace(/\s+/g, '')
  const headerZ = Number(compact.match(/#lsb-shell-header\{[^}]*z-index:(\d+)/)?.[1] || 0)
  const railZ = Number(compact.match(/#lsb-shell-rail\{[^}]*z-index:(\d+)/)?.[1] || 0)
  assert.ok(headerZ > railZ, '顶栏必须叠在左栏上面，否则左上角的 logo 和站名会被左栏挡住')
})

test('legacy 验收：氢壳：站点大图灯箱落在左右栏之间，不藏壳', async () => {
  const { w } = makeLegacySite()
  await loadBase(w, PLUG('skin.user.js'))
  const compact = skinCss(w).replace(/\s+/g, '')
  assert.doesNotMatch(
    compact,
    /:has\(\.image-lightbox-overlay:not\(\[hidden\]\)\)[^}]*visibility:hidden/,
    '灯箱打开时不能把氢壳藏掉',
  )
  assert.doesNotMatch(
    compact,
    /:has\(\.image-lightbox-overlay:not\(\[hidden\]\)\)[^}]*display:none/,
    '灯箱打开时不能 display:none 氢壳',
  )
  assert.match(
    compact,
    /\.image-lightbox-overlay\{[^}]*left:var\(--lsb-shell-rail\)/,
    '灯箱左缘贴左栏，不要铺到栏底下',
  )
  assert.match(
    compact,
    /\.image-lightbox-overlay\{[^}]*top:var\(--lsb-shell-header\)/,
    '灯箱上缘贴顶栏',
  )
  assert.match(
    compact,
    /\.image-lightbox-overlay\{[^}]*right:var\(--lsb-shell-aside\)/,
    '宽屏灯箱右缘贴右栏',
  )
  assert.match(
    compact,
    /\.image-lightbox-image\{[^}]*max-width:100%/,
    '大图按灯箱栏宽缩放，不能再用 96vw 伸进左右栏',
  )
})

test('氢壳玻璃参数和配置字体实际写入 CSS 变量', async () => {
  const { w } = makeSite({
    'lsb_base:skin:__config': {
      glass: true,
      glassOpacity: 0.58,
      glassBlur: 7,
      fontFamily: "'Source Han Sans'",
    },
  })
  await loadBase(w, PLUG('skin.user.js'))
  const root = w.document.documentElement
  assert.equal(root.style.getPropertyValue('--lsb-shell-glass-opacity'), '0.58')
  assert.equal(root.style.getPropertyValue('--lsb-shell-glass-blur'), '7px')
  assert.equal(root.style.getPropertyValue('--lsb-shell-font-family'), "'Source Han Sans'")
})

test('视频背景只接受 HTTPS，自动播放失败时保持静态背景', async () => {
  const bad = makeSite({
    'lsb_base:skin:__config': { backgroundVideoEnabled: true, backgroundVideoUrl: 'http://cdn.example/bad.mp4' },
  })
  await loadBase(bad.w, PLUG('skin.user.js'))
  assert.equal(bad.w.document.querySelector('[data-lsb-shell-video]'), null)

  const good = makeSite({
    'lsb_base:skin:__config': { backgroundVideoEnabled: true, backgroundVideoUrl: 'https://cdn.example/good.mp4' },
  })
  good.w.HTMLMediaElement.prototype.load = () => {}
  good.w.HTMLMediaElement.prototype.play = () => Promise.resolve()
  await loadBase(good.w, PLUG('skin.user.js'))
  assert.ok(good.w.document.querySelector('[data-lsb-shell-video]'))
  assert.ok(good.w.document.documentElement.classList.contains('lsb-skin-video-on'))
})

test('视频自动播放被浏览器拦截时保持可见但不拦截阅读', async () => {
  const { w } = makeSite({
    'lsb_base:skin:__config': { backgroundVideoEnabled: true, backgroundVideoUrl: 'https://cdn.example/blocked.mp4' },
  })
  let loadCalls = 0
  w.HTMLMediaElement.prototype.load = () => { loadCalls += 1 }
  w.HTMLMediaElement.prototype.play = () => Promise.reject(new Error('NotAllowedError'))
  await loadBase(w, PLUG('skin.user.js'))

  const video = w.document.querySelector('[data-lsb-shell-video]')
  assert.ok(video)
  assert.equal(loadCalls, 1, '视频元素挂载后应显式启动资源加载')
  assert.equal(video.defaultMuted, true, '默认静音属性应同时覆盖自动播放策略')
  assert.equal(video.getAttribute('muted'), '', '静音属性应写入 DOM')
  assert.equal(video.controls, false, '背景视频不应显示原生控件')
  assert.equal(video.style.pointerEvents, 'none', '背景视频不得拦截正文阅读')
  assert.equal(w.document.documentElement.classList.contains('lsb-skin-video-on'), true, '已加载的视频仍应保持可见')
})

test('视频资源先报错再完成 play 时保持静态回退', async () => {
  const { w } = makeSite({
    'lsb_base:skin:__config': { backgroundVideoEnabled: true, backgroundVideoUrl: 'https://cdn.example/invalid.mp4' },
  })
  w.HTMLMediaElement.prototype.load = () => {}
  w.HTMLMediaElement.prototype.play = function () {
    this.dispatchEvent(new w.Event('error'))
    return Promise.resolve()
  }
  await loadBase(w, PLUG('skin.user.js'))

  const video = w.document.querySelector('[data-lsb-shell-video]')
  assert.ok(video)
  assert.equal(video.dataset.lsbShellVideoState, 'error')
  assert.equal(w.document.documentElement.classList.contains('lsb-skin-video-on'), false)
})

test('视频皮肤声明包含媒体 API 的最低基座版本', () => {
  const source = readFileSync(new URL('../plugins/skin.user.js', import.meta.url), 'utf8')
  assert.match(source, /requires:\s*\{\s*base:\s*'\^0\.2\.3'\s*\}/)
})

test('本地视频引用按画布保存的媒体键读取', async () => {
  const { w, tick } = makeSite()
  const stored = new w.Blob(['video'], { type: 'video/mp4' })
  const records = new Map([['videos:custom-video-id', stored]])
  const stores = new Set()
  w.indexedDB = {
    open() {
      const request = {}
      setTimeout(() => {
        const db = {
          objectStoreNames: { contains: (name) => stores.has(name) },
          createObjectStore(name) { stores.add(name) },
          transaction(name) {
            return {
              objectStore() {
                return {
                  get(key) {
                    const result = {}
                    queueMicrotask(() => {
                      result.result = records.get(`${name}:${String(key)}`) ?? null
                      result.onsuccess?.()
                    })
                    return result
                  },
                  put(value, key) {
                    const result = {}
                    records.set(`${name}:${String(key)}`, value)
                    queueMicrotask(() => result.onsuccess?.())
                    return result
                  },
                }
              },
            }
          },
        }
        request.result = db
        request.onupgradeneeded?.()
        request.onsuccess?.()
      }, 0)
      return request
    },
  }
  w.localStorage.setItem('lsb_base:skin:canvas-state:v2', JSON.stringify({
    version: 2,
    enabled: true,
    global: { appearance: { background: 'static' } },
    sites: { 'https://linux.sb': { appearance: { background: 'video', backgroundVideoLocalKey: 'custom-video-id' } } },
  }))
  w.URL.createObjectURL = () => 'blob:custom-video'
  w.URL.revokeObjectURL = () => {}
  w.HTMLMediaElement.prototype.load = () => {}
  w.HTMLMediaElement.prototype.play = () => Promise.resolve()
  await loadBase(w, PLUG('skin.user.js'))
  await tick(80)

  const video = w.document.querySelector('[data-lsb-shell-video]')
  assert.ok(video, '自定义媒体键对应的本地视频应挂载')
  assert.equal(video.src, 'blob:custom-video')
  assert.equal(w.document.documentElement.classList.contains('lsb-skin-video-on'), true)
})

test('HTTPS 字体加载成功后只覆盖氢壳字体变量', async () => {
  const { w } = makeSite({ 'lsb_base:skin:__config': { fontUrl: 'https://cdn.example/demo.woff2' } })
  w.document.fonts = { add() {}, delete() {} }
  w.FontFace = class {
    constructor(family, source) { this.family = family; this.source = source }
    async load() { return this }
  }
  await loadBase(w, PLUG('skin.user.js'))
  assert.equal(w.document.documentElement.style.getPropertyValue('--lsb-shell-font-family'), 'LSBShellUserFont')
})

function controlledFonts(w) {
  const faces = new Set()
  const pending = []
  w.document.fonts = { add: (face) => faces.add(face), delete: (face) => faces.delete(face) }
  w.FontFace = class {
    constructor(family, source) { this.family = family; this.source = source }
    load() {
      return new Promise((resolve, reject) => pending.push({ face: this, resolve: () => resolve(this), reject }))
    }
  }
  return { faces, pending }
}

for (const mode of ['legacy', 'ios27']) {
  test(`${mode} 媒体生命周期：停用后晚到字体必须释放`, async (t) => {
    const { w, tick } = makeReadingHome(mode, { 'lsb_base:skin:__config': { fontUrl: 'https://cdn.example/slow.woff2' } })
    t.after(async () => { if (w.document) w.LSB?.disable('skin'); await tick(80); w.close() })
    const { faces, pending } = controlledFonts(w)
    await loadBase(w, PLUG('skin.user.js'))
    assert.ok(pending.length)
    w.LSB.disable('skin')
    for (const item of pending) item.resolve()
    await tick(20)
    assert.equal(faces.size, 0, '停用后的字体不能留在 document.fonts')
    assert.equal(w.document.documentElement.style.getPropertyValue('--lsb-shell-font-family'), '')
  })

  test(`${mode} 媒体生命周期：旧字体晚到不能替换新字体`, async (t) => {
    const { w, tick } = makeReadingHome(mode, { 'lsb_base:skin:__config': { fontUrl: 'https://cdn.example/old.woff2' } })
    t.after(async () => { if (w.document) w.LSB?.disable('skin'); await tick(80); w.close() })
    const { faces, pending } = controlledFonts(w)
    await loadBase(w, PLUG('skin.user.js'))
    const stateKey = 'lsb_base:skin:canvas-state:v2'
    const state = JSON.parse(w.localStorage.getItem(stateKey))
    state.global.appearance.fontUrl = 'https://cdn.example/new.woff2'
    w.localStorage.setItem(stateKey, JSON.stringify(state))
    await changeSkinConfig(w, {}, 140)
    const newer = pending.filter((item) => item.face.source.includes('new.woff2'))
    assert.ok(newer.length)
    newer.forEach((item) => item.resolve())
    await tick(10)
    pending.filter((item) => item.face.source.includes('old.woff2')).forEach((item) => item.resolve())
    await tick(10)
    assert.equal(faces.size, 1)
    assert.match([...faces][0].source, /new\.woff2/)
  })

  test(`${mode} 媒体生命周期：无关外观更新保持已加载字体`, async (t) => {
    const { w, tick } = makeReadingHome(mode, { 'lsb_base:skin:__config': { fontUrl: 'https://cdn.example/stable.woff2' } })
    t.after(async () => { if (w.document) w.LSB?.disable('skin'); await tick(80); w.close() })
    const { pending } = controlledFonts(w)
    await loadBase(w, PLUG('skin.user.js'))
    pending.forEach((item) => item.resolve())
    await tick(10)
    await changeSkinConfig(w, { density: '紧凑' }, 20)
    assert.equal(w.document.documentElement.style.getPropertyValue('--lsb-shell-font-family'), 'LSBShellUserFont')
  })
}

for (const mode of ['legacy', 'ios27']) test(`${mode} 媒体生命周期：相同本地键再次上传替换视频`, async (t) => {
  const { w, tick } = makeReadingHome(mode)
  t.after(async () => { if (w.document) w.LSB?.disable('skin'); await tick(80); w.close() })
  w.HTMLMediaElement.prototype.load = () => {}
  w.HTMLMediaElement.prototype.pause = () => {}
  w.HTMLMediaElement.prototype.play = () => Promise.resolve()
  const revoked = []
  w.URL.createObjectURL = (file) => `blob:${file.name}`
  w.URL.revokeObjectURL = (url) => revoked.push(url)
  await loadBase(w, PLUG('skin.user.js'))
  if (mode === 'legacy') shell(w).querySelector('[data-lsb-shell-settings]').click()
  const input = w.document.querySelector(mode === 'legacy' ? '.lsb-view input[accept="video/*"]' : '[data-canvas-media-file="video"]')
  assert.ok(input)
  for (const name of ['first.mp4', 'second.mp4']) {
    Object.defineProperty(input, 'files', { configurable: true, value: [new w.File([name], name, { type: 'video/mp4' })] })
    input.dispatchEvent(new w.Event('change', { bubbles: true }))
    await tick(60)
  }
  assert.equal(w.document.querySelector('[data-lsb-shell-video]')?.src, 'blob:second.mp4')
  assert.deepEqual(revoked, ['blob:first.mp4'])
})

for (const mode of ['legacy', 'ios27']) test(`${mode} 媒体生命周期：停用后上传完成不能修改外观配置`, async (t) => {
  const { w, tick, until } = makeReadingHome(mode)
  t.after(async () => { if (w.document) w.LSB?.disable('skin'); await tick(80); w.close() })
  let writeRequest
  let closed = 0
  const db = {
    close() { closed++ },
    transaction() { return { objectStore() { return { put() { writeRequest = {}; return writeRequest } } } } },
  }
  w.indexedDB = { open() {
    const request = { result: db }
    queueMicrotask(() => request.onsuccess())
    return request
  } }
  await loadBase(w, PLUG('skin.user.js'))
  if (mode === 'legacy') shell(w).querySelector('[data-lsb-shell-settings]').click()
  const input = w.document.querySelector(mode === 'legacy' ? '.lsb-view input[accept="video/*"]' : '[data-canvas-media-file="video"]')
  assert.ok(input)
  Object.defineProperty(input, 'files', { configurable: true, value: [new w.File(['video'], 'slow.mp4', { type: 'video/mp4' })] })
  input.dispatchEvent(new w.Event('change', { bubbles: true }))
  assert.equal(await until(() => writeRequest), true)
  w.LSB.disable('skin')
  const configBefore = w.localStorage.getItem('lsb_base:skin:__config')
  const appearanceBefore = w.localStorage.getItem('lsb_base:skin:canvas-state:v2')
  writeRequest.onsuccess()
  await tick(80)
  assert.equal(w.localStorage.getItem('lsb_base:skin:__config'), configBefore)
  assert.equal(w.localStorage.getItem('lsb_base:skin:canvas-state:v2'), appearanceBefore)
  assert.equal(w.document.querySelector('[data-lsb-shell-video]'), null)
  assert.equal(closed, 1)
})

test('legacy 验收：设置面板导入本地视频和字体后实际挂载资源', async () => {
  const { w, tick } = makeLegacySite()
  w.HTMLMediaElement.prototype.load = () => {}
  w.HTMLMediaElement.prototype.play = () => Promise.resolve()
  w.HTMLMediaElement.prototype.pause = () => {}
  w.URL.createObjectURL = () => 'blob:lsb-local-media'
  w.document.fonts = { add() {}, delete() {} }
  w.FontFace = class {
    constructor(family, source) { this.family = family; this.source = source }
    async load() { return this }
  }
  await loadBase(w, PLUG('skin.user.js'))
  shell(w).querySelector('[data-lsb-shell-settings]').click()
  const inputs = [...w.document.querySelectorAll('.lsb-view input[type="file"]')]
  const videoInput = inputs.find((input) => /video/.test(input.accept))
  const fontInput = inputs.find((input) => /font|woff/.test(input.accept))
  assert.ok(videoInput && fontInput)
  const video = new w.File(['video'], 'background.mp4', { type: 'video/mp4' })
  Object.defineProperty(videoInput, 'files', { configurable: true, value: [video] })
  videoInput.dispatchEvent(new w.Event('change', { bubbles: true }))
  await tick(80)
  assert.ok(w.document.querySelector('[data-lsb-shell-video]'), '本地视频应挂载到工作区')

  const font = new w.File(['font'], 'custom.woff2', { type: 'font/woff2' })
  Object.defineProperty(fontInput, 'files', { configurable: true, value: [font] })
  fontInput.dispatchEvent(new w.Event('change', { bubbles: true }))
  await tick(80)
  assert.equal(w.document.documentElement.style.getPropertyValue('--lsb-shell-font-family'), 'LSBShellUserFont')
})

test('legacy 验收：氢壳：搜索贴住左栏与主栏交界，不额外缩进', async () => {
  const { w } = makeLegacyHome()
  await loadBase(w, PLUG('skin.user.js'))
  const compact = skinCss(w).replace(/\s+/g, '')
  assert.match(
    compact,
    /#lsb-shell-header\{[^}]*grid-template-columns:var\(--lsb-shell-rail\)/,
    '第一列就是左栏宽，搜索从主栏左缘开始',
  )
  assert.match(
    compact,
    /#lsb-shell-header\{[^}]*column-gap:0/,
    '站名列和搜索之间不能再塞 16px',
  )
  assert.match(
    compact,
    /\.lsb-shell-search-host\{[^}]*padding-left:var\(--lsb-shell-main-inset\)/,
    '搜索左缘跟主栏内容（头像）对齐，不是贴左栏缝',
  )
  assert.match(
    compact,
    /--lsb-shell-main-inset:calc\(var\(--lsb-shell-gutter\)\+var\(--lsb-shell-panel-pad\)\)/,
    '首页主栏是 wrap 12 + home-shell 24，搜索要让这么多',
  )
  assert.match(
    compact,
    /main\.wrap\{[^}]*padding-left:var\(--lsb-shell-gutter\)/,
    '主栏外层 gutter 保留，不能把帖子挤到左栏边上',
  )
  assert.ok(
    !/\.home-shell,[^}]*padding-left:0/.test(compact),
    'home-shell 左内边不能清零，否则头像贴缝',
  )
})

test('legacy 验收：氢壳：帖子页有时间轴并藏右栏', async () => {
  const { w } = makeLegacySite()
  await loadBase(w, PLUG('skin.user.js'))

  const root = shell(w)
  const timeline = root.querySelector('#lsb-shell-timeline')
  assert.ok(timeline, '帖内时间轴')
  assert.ok(timeline.querySelector('[data-timeline-edge="start"]'))
  assert.ok(timeline.querySelector('[data-timeline-edge="end"]'))
  assert.ok(timeline.querySelector('[data-timeline-track]'))
  assert.ok(w.document.documentElement.classList.contains('lsb-skin-shell-topic'))

  const side = [...w.document.querySelectorAll('aside.sidebar')].find(
    (el) => !el.classList.contains('mobile-menu-drawer'),
  )
  assert.ok(side?.classList.contains('lsb-native-sidebar-hidden'), '藏原生右栏')
  assert.ok(root.querySelector('.sidebar-card.user-card'), '帖内也保留个人卡')
})

test('legacy 验收：氢壳：他人主页右栏迁入资料、简介和私信，不当成自己', async () => {
  const { w } = makeLegacyUser()
  await loadBase(w, PLUG('skin.user.js'))

  const root = shell(w)
  const aside = root.querySelector('#lsb-shell-aside')
  assert.ok(aside, '有右栏')
  const card = aside.querySelector('.sidebar-card.user-card')
  assert.ok(card, '被访问者资料卡在右栏，不能留在被藏掉的原生侧栏')
  assert.match(card.textContent, /痛失姓名的站长/)
  assert.ok(
    [...card.querySelectorAll('a')].some((a) => /私信TA/.test(a.textContent || '')),
    '私信入口跟着资料卡走',
  )
  const bio = aside.querySelector('.bio-card')
  assert.ok(bio, '个人简介在右栏')
  assert.match(bio.textContent, /个人简介/)
  assert.equal(w.document.querySelectorAll('.bio-card').length, 1, '简介是迁入不是克隆')
  assert.equal(w.document.querySelectorAll('.sidebar-card.user-card').length, 1, '资料卡是迁入不是克隆')
  const meHost = root.querySelector('[data-lsb-shell-me]')
  assert.ok(!meHost?.querySelector('.sidebar-card.user-card'), '被访问者不能进左栏「我」')
  assert.ok(w.document.documentElement.classList.contains('lsb-skin-shell-user'))
  const css = skinCss(w).replace(/\s+/g, '')
  assert.match(css, /html\.lsb-skin-shell-user#lsb-shell-aside\{[^}]*display:block/)
})

test('旧三栏：从他人主页返回首页后个人资料卡留在左栏', async () => {
  const { w, tick } = makeDom(userHtml, 'https://linux.sb/user/1', withSkinConfig({}, { uiMode: 'legacy' }))
  Object.defineProperty(w, 'innerWidth', { configurable: true, value: 1440 })
  stubHtmlFetch(w, (url) => (/\/user\//.test(String(url)) ? userHtml : homeHtml))
  await loadBase(w, PLUG('skin.user.js'))

  assert.ok(shell(w), '三段式壳已挂载')
  assert.equal(w.document.documentElement.classList.contains('lsb-canvas-mode'), false)
  shell(w).querySelector('a[href="/"]')?.click()
  await tick(140)

  assert.equal(w.location.pathname, '/')
  const main = w.document.querySelector('main.wrap')
  assert.equal(main?.querySelector('[data-canvas-profile-slot]'), null, '旧三栏首页不能残留单画布个人信息槽')
  assert.equal(main?.querySelector('.sidebar-card.user-card'), null, '首页个人资料卡不能留在正文上方')
  const me = shell(w).querySelector('.lsb-shell-me .sidebar-card.user-card')
  assert.ok(me, '回到首页后自己的资料卡在左栏')
  assert.equal(me.querySelector('a.user-name')?.getAttribute('href'), '/user/5372')
  assert.equal(w.document.querySelectorAll('.sidebar-card.user-card').length, 1, '只保留一张个人资料卡')
})

test('legacy 验收：氢壳：帖子页右栏仍有快捷功能和统计，不只每日热帖', async () => {
  const { w } = makeLegacyHome()
  await loadBase(w, PLUG('skin.user.js'))
  const keep = JSON.parse(w.localStorage.getItem('lsb_base:skin:asideKeep') || 'null')
  assert.ok(keep?.quick && /快捷功能/.test(keep.quick), '首页要把快捷功能记住')
  assert.ok(keep?.stats && /站点统计/.test(keep.stats), '首页要把站点统计记住')

  const { w: topic } = makeLegacySite({ 'lsb_base:skin:asideKeep': keep })
  await loadBase(topic, PLUG('skin.user.js'))
  const aside = shell(topic).querySelector('#lsb-shell-aside')
  const text = aside?.textContent || ''
  assert.match(text, /快捷功能/, '进帖后右栏仍有快捷功能')
  assert.match(text, /每日热帖/, '帖子页自己的热帖还在')
  assert.match(text, /站点统计/, '进帖后右栏仍有站点统计')
  assert.equal(
    [...aside.querySelectorAll('.daily-hot-topics-card')].length,
    1,
    '热帖用当前帖子页的，不叠一份首页缓存',
  )
})

test('legacy 验收：氢壳：顶栏搜索在站名右侧，用户入口紧跟搜索；进帖子不丢', async () => {
  const { w } = makeLegacyHome()
  w.document.querySelector('.forum-nav').insertAdjacentHTML(
    'beforeend',
    '<a class="forum-link forum-enhancements-custom-top-link" href="/leaderboard?type=points">用户榜单</a>' +
      '<a class="forum-link forum-enhancements-custom-top-link" href="/invite_center">邀请中心</a>',
  )
  await loadBase(w, PLUG('skin.user.js'))

  const header = shell(w).querySelector('#lsb-shell-header')
  const kids = [...header.children]
  assert.ok(kids[0].classList.contains('lsb-shell-brand'), '站名在顶栏最左')
  assert.ok(kids[1].classList.contains('lsb-shell-search-host'), '搜索紧挨站名')
  assert.ok(kids[2].classList.contains('lsb-shell-extras'), '用户入口排在搜索后面')
  const extras = [...header.querySelectorAll('.lsb-shell-extras a')].map((a) => a.textContent.trim())
  assert.ok(extras.includes('用户榜单'))
  assert.ok(extras.includes('邀请中心'))
  assert.ok(!extras.some((t) => /我的/.test(t)), '个人入口在左栏，顶栏不要再挂「我的」')
  const stored = JSON.parse(w.localStorage.getItem('lsb_base:skin:topExtras') || 'null')
  assert.ok(Array.isArray(stored) && stored.some((x) => x.label === '用户榜单'))

  const { w: topic } = makeLegacySite({ 'lsb_base:skin:topExtras': stored })
  await loadBase(topic, PLUG('skin.user.js'))
  const topicHeader = shell(topic).querySelector('#lsb-shell-header')
  const topicKids = [...topicHeader.children]
  assert.ok(topicKids[1].classList.contains('lsb-shell-search-host'), '进帖后搜索仍在站名右侧')
  assert.ok(topicKids[2].classList.contains('lsb-shell-extras'), '进帖后用户入口仍紧跟搜索')
  const topicExtras = [...topicHeader.querySelectorAll('.lsb-shell-extras a')].map((a) => a.textContent.trim())
  assert.ok(topicExtras.includes('用户榜单'), '帖子页 SSR 没有这些入口，要从首页记住')
  assert.ok(topicExtras.includes('邀请中心'))
  assert.ok(!topicExtras.some((t) => /我的/.test(t)))
})

test('legacy 验收：氢壳：顶栏不回放「我的1」，也不把通知角标拼进入口', async () => {
  const { w } = makeLegacyHome({
    'lsb_base:skin:topExtras': [
      { href: '/gacha', label: '称号中心' },
      { href: '/user/5372', label: '我的1' },
      { href: '/user/5372/notices', label: '1' },
    ],
  })
  const mine = w.document.querySelector('a.nav-mine')
  assert.ok(mine)
  mine.innerHTML = '我的<span class="badge">1</span>'
  await loadBase(w, PLUG('skin.user.js'))
  const extras = [...shell(w).querySelectorAll('.lsb-shell-extras a')].map((a) =>
    (a.textContent || '').replace(/\s+/g, ''),
  )
  assert.ok(extras.includes('称号中心'))
  assert.ok(
    !extras.some((t) => /我的/.test(t) || /^[0-9]+$/.test(t)),
    '不要把原顶栏「我的」或缓存里的「我的1」/「1」挂到称号中心后面',
  )
})

test('legacy 验收：氢壳：顶栏不挂「我的烧饼」，留给右栏快捷功能', async () => {
  const { w } = makeLegacyHome({
    'lsb_base:skin:topExtras': [{ href: '/my', label: '我的烧饼' }, { href: '/gacha', label: '称号中心' }],
  })
  w.document.querySelector('.forum-nav').insertAdjacentHTML(
    'beforeend',
    '<a class="forum-link forum-enhancements-custom-top-link" href="/my">我的烧饼</a>' +
      '<a class="forum-link forum-enhancements-custom-top-link" href="/leaderboard?type=points">用户榜单</a>',
  )
  await loadBase(w, PLUG('skin.user.js'))
  const extras = [...shell(w).querySelectorAll('.lsb-shell-extras a')].map((a) => a.textContent.trim())
  assert.ok(extras.includes('用户榜单'))
  assert.ok(extras.includes('称号中心'))
  assert.ok(!extras.includes('我的烧饼'), '我的烧饼已在右栏快捷功能，顶栏不要再挂一份')
  const stored = JSON.parse(w.localStorage.getItem('lsb_base:skin:topExtras') || 'null')
  assert.ok(Array.isArray(stored))
  assert.ok(!stored.some((x) => /我的烧饼/.test(x.label)))
  const aside = shell(w).querySelector('#lsb-shell-aside')
  assert.match(aside.textContent, /快捷功能/)
})

test('legacy 验收：氢壳：站点明暗切换钮迁入顶栏，关壳迁回', async () => {
  const { w, tick } = makeLegacyHome()
  const bar = w.document.querySelector('body > .top .bar')
  const btn = w.document.createElement('button')
  btn.type = 'button'
  btn.className = 'themes-mode-toggle'
  btn.setAttribute('data-themes-mode-toggle', '')
  btn.setAttribute('aria-label', '当前为暗色，点击切换模式')
  bar.append(btn)
  w.document.documentElement.setAttribute('data-themes-color-mode', 'dark')
  await loadBase(w, PLUG('skin.user.js'))

  assert.equal(w.document.querySelectorAll('[data-themes-mode-toggle]').length, 1, '迁入不是克隆')
  assert.ok(
    w.document.querySelector('#lsb-shell [data-themes-mode-toggle]'),
    '切换钮在壳顶栏，不能留在被藏掉的原顶栏',
  )
  assert.ok(
    /html\.lsb-skin-shell-on\{[^}]*background:var\(--bg/.test(skinCss(w)),
    'html 垫站点 --bg，顶栏垫出的空隙不露白底',
  )

  w.LSB.disable('skin')
  await tick(20)
  assert.equal(w.document.querySelector('#lsb-shell'), null)
  assert.ok(
    w.document.querySelector('body > .top [data-themes-mode-toggle]'),
    '关壳后切换钮回到原顶栏',
  )
})

test('legacy 验收：氢壳：新顶栏搜索入口迁入，关壳迁回', async () => {
  const { w, tick } = makeLegacyHome()
  w.document.querySelectorAll('form.search-form').forEach((el) => el.remove())
  const bar = w.document.querySelector('body > .top .bar')
  const a = w.document.createElement('a')
  a.className = 'search-page-link'
  a.setAttribute('href', '/search')
  a.setAttribute('aria-label', '搜索')
  a.innerHTML = '<span class="search-page-fake-input">搜索关键词</span>'
  bar.append(a)
  await loadBase(w, PLUG('skin.user.js'))

  assert.equal(w.document.querySelectorAll('.search-page-link').length, 1, '迁入不是克隆')
  assert.ok(
    w.document.querySelector('#lsb-shell .lsb-shell-search-host .search-page-link'),
    '搜索入口在壳顶栏，不能留在被藏掉的原顶栏',
  )

  w.LSB.disable('skin')
  await tick(20)
  assert.ok(
    w.document.querySelector('body > .top .search-page-link'),
    '关壳后搜索入口回到原顶栏',
  )
})

test('legacy 验收：氢壳：新外观菜单迁入顶栏，关壳迁回', async () => {
  const { w, tick } = makeLegacyHome()
  const bar = w.document.querySelector('body > .top .bar')
  const scheme = w.document.createElement('a')
  scheme.className = 'color-scheme-top-link'
  scheme.setAttribute('href', '/color_scheme')
  scheme.setAttribute('aria-label', '切换色系')
  bar.append(scheme)
  const wrap = w.document.createElement('div')
  wrap.className = 'dark-mode-control'
  wrap.innerHTML =
    '<button class="dark-mode-toggle-btn" type="button" aria-label="外观：自动"></button>' +
    '<div class="dark-mode-menu" role="menu"></div>'
  bar.append(wrap)
  w.document.documentElement.setAttribute('data-dark-mode-theme', 'dark')
  await loadBase(w, PLUG('skin.user.js'))

  assert.equal(w.document.querySelectorAll('.dark-mode-control').length, 1, '迁入不是克隆')
  assert.ok(
    w.document.querySelector('#lsb-shell [data-lsb-shell-theme] .dark-mode-control'),
    '外观菜单在壳顶栏，不能留在被藏掉的原顶栏',
  )
  assert.ok(
    w.document.querySelector('#lsb-shell [data-lsb-shell-theme] .color-scheme-top-link'),
    '色系入口跟外观一起迁入，否则原顶栏藏掉后也找不到',
  )
  assert.ok(
    /html\[data-dark-mode-theme="dark"\]/.test(skinCss(w)),
    '站点改用 data-dark-mode-theme 后壳仍声明 dark color-scheme',
  )

  w.LSB.disable('skin')
  await tick(20)
  assert.ok(
    w.document.querySelector('body > .top .dark-mode-control'),
    '关壳后外观菜单回到原顶栏',
  )
  assert.ok(
    w.document.querySelector('body > .top .color-scheme-top-link'),
    '关壳后色系入口回到原顶栏',
  )
})

test('legacy 验收：氢壳：切换色系弹层要盖过右栏', async () => {
  const { w } = makeLegacyHome()
  await loadBase(w, PLUG('skin.user.js'))
  const compact = skinCss(w).replace(/\s+/g, '')
  const shellZ = Number(compact.match(/#lsb-shell\{[^}]*z-index:(\d+)/)?.[1] || 0)
  const modalZ = Number(compact.match(/#color-scheme-modal\{[^}]*z-index:(\d+)/)?.[1] || 0)
  assert.ok(shellZ >= 7999, '氢壳整层（含右栏）在 7999')
  assert.ok(
    modalZ > shellZ,
    '站点 #color-scheme-modal 只有 z-index:120，必须抬到整层氢壳之上，否则右上角点开会被右栏挡住',
  )
})


test('legacy 验收：氢壳：站点把外观控件补回原顶栏时不再搬走，避免死循环', async () => {
  const { w, tick } = makeLegacyHome()
  const bar = w.document.querySelector('body > .top .bar')
  const scheme = w.document.createElement('a')
  scheme.className = 'color-scheme-top-link'
  scheme.setAttribute('href', '/color_scheme')
  bar.append(scheme)
  const wrap = w.document.createElement('div')
  wrap.className = 'dark-mode-control'
  bar.append(wrap)

  let injected = 0
  const obs = new w.MutationObserver(() => {
    if (!bar.querySelector('.dark-mode-control')) {
      injected++
      if (injected > 40) return
      const n = w.document.createElement('div')
      n.className = 'dark-mode-control'
      bar.append(n)
    }
    if (!bar.querySelector('.color-scheme-top-link')) {
      injected++
      if (injected > 40) return
      const n = w.document.createElement('a')
      n.className = 'color-scheme-top-link'
      n.setAttribute('href', '/color_scheme')
      bar.append(n)
    }
  })
  obs.observe(w.document.body, { childList: true, subtree: true })

  await loadBase(w, PLUG('skin.user.js'))
  await tick(80)
  obs.disconnect()

  assert.ok(injected <= 4, `站点补种应收敛，实际 ${injected}`)
  assert.equal(
    w.document.querySelectorAll('#lsb-shell .dark-mode-control').length,
    1,
    '壳里只留第一次迁入的那份',
  )
  assert.equal(w.document.querySelectorAll('#lsb-shell .color-scheme-top-link').length, 1)
  assert.ok(bar.querySelector('.dark-mode-control'), '原顶栏留下一份，站点脚本才不会一直补')
  assert.ok(bar.querySelector('.color-scheme-top-link'))
})

test('legacy 验收：氢壳：开壳时隐藏右下角 H 按钮，关壳后显现', async () => {
  const { w, tick } = makeLegacyHome()
  await loadBase(w, PLUG('skin.user.js'))

  assert.ok(w.document.querySelector('.lsb-launcher'), '基座仍挂启动器节点')
  assert.ok(
    skinCss(w).includes('html.lsb-skin-shell-on .lsb-launcher'),
    '开壳用样式藏 H 按钮',
  )

  w.eval(`(() => {
    const cur = JSON.parse(localStorage.getItem('lsb_base:skin:__config') || '{}')
    cur.shell = false
    localStorage.setItem('lsb_base:skin:__config', JSON.stringify(cur))
  })()`)
  w.LSB.bus.emit('config:changed:skin', { shell: false }, { source: 'core' })
  await tick(20)

  assert.ok(!w.document.documentElement.classList.contains('lsb-skin-shell-on'), '关壳去掉状态类')
  assert.ok(!skinCss(w).includes('html.lsb-skin-shell-on .lsb-launcher'), '关壳后不再藏 H 按钮')
  assert.ok(w.document.querySelector('.lsb-launcher'), '关壳后 H 按钮节点仍在')
})


test('legacy 验收：氢壳：设置按钮打开氢面板', async () => {
  const { w } = makeLegacyHome()
  await loadBase(w, PLUG('skin.user.js'))
  const btn = shell(w).querySelector('[data-lsb-shell-settings]')
  assert.ok(btn)
  btn.click()
  assert.ok(w.document.querySelector('.lsb-panel'), '打开设置面板')
})

test('legacy 验收：氢壳：顶栏迁入用户榜单等入口，右栏迁入快捷功能/热帖/统计', async () => {
  const { w, tick } = makeLegacyHome()
  const nav = w.document.querySelector('.forum-nav')
  nav.insertAdjacentHTML(
    'beforeend',
    '<a class="forum-link forum-enhancements-custom-top-link" href="/leaderboard?type=points">用户榜单</a>' +
      '<a class="forum-link forum-enhancements-custom-top-link" href="https://lz.sb/">LZ.SB</a>' +
      '<a class="forum-link forum-enhancements-custom-top-link" href="/invite_center">邀请中心</a>' +
      '<a class="forum-link forum-enhancements-custom-top-link" href="/gacha">称号中心</a>',
  )
  await loadBase(w, PLUG('skin.user.js'))

  const root = shell(w)
  const extras = [...root.querySelectorAll('.lsb-shell-extras a, [data-lsb-shell-extras] a')].map((a) =>
    a.textContent.trim(),
  )
  assert.ok(extras.includes('用户榜单'), '顶栏有用户榜单')
  assert.ok(extras.includes('LZ.SB'))
  assert.ok(extras.includes('邀请中心'))
  assert.ok(extras.includes('称号中心'))
  assert.equal(
    w.document.querySelectorAll('a.forum-enhancements-custom-top-link').length,
    4,
    '顶栏入口是迁入不是克隆',
  )

  const aside = root.querySelector('#lsb-shell-aside')
  assert.ok(aside, '有右栏宿主')
  assert.match(aside.textContent, /快捷功能/)
  assert.match(aside.textContent, /每日热帖/)
  assert.match(aside.textContent, /站点统计/)
  assert.equal(w.document.querySelectorAll('.daily-hot-topics-card').length, 1, '热帖卡迁入')
  assert.equal(w.document.querySelectorAll('.stats-card').length, 1, '统计卡迁入')
  assert.ok(
    !aside.textContent.includes('最近浏览') || aside.querySelectorAll('.sidebar-card').length <= 4,
    '不把最近浏览整卡搬进右栏',
  )

  const css = skinCss(w)
  assert.ok(css.includes('--lsb-shell-rail:240px'), '左栏加宽，版块名和用户卡不再挤成一团')
  assert.ok(css.includes('--lsb-shell-aside:280px'), '右栏比主栏更宽一档，避免卡片挤成一列字')
  assert.ok(css.includes('min-width:1100px') || css.includes('min-width: 1100px'), '宽屏才显示右栏')
  assert.ok(/main\.wrap\{[^}]*max-width:\s*none/i.test(css.replace(/\s+/g, '')), '主栏取消 1100 居中，贴住左栏')

  const nativeSide = [...w.document.querySelectorAll('aside.sidebar')].find(
    (el) => !el.classList.contains('mobile-menu-drawer'),
  )
  const online = w.document.createElement('div')
  online.className = 'card sidebar-card online-users-card'
  online.innerHTML = '<div class="online-users-head"><span class="online-users-title">当前在线</span> 3 人</div>'
  nativeSide.append(online)
  await tick(80)
  assert.ok(aside.querySelector('.online-users-card'), '站点后插入的当前在线也迁入')
  assert.equal(w.document.querySelectorAll('.online-users-card').length, 1)
  assert.equal(online.parentElement, aside.querySelector('[data-lsb-shell-site]'), '晚到卡也应随站点页签隐藏')
})

test('legacy 验收：氢壳：右栏迁入站点广告卡，不跟原生侧栏一起藏掉', async () => {
  const { w } = makeLegacyHome()
  const nativeSide = [...w.document.querySelectorAll('aside.sidebar')].find(
    (el) => !el.classList.contains('mobile-menu-drawer'),
  )
  nativeSide.insertAdjacentHTML(
    'beforeend',
    '<div class="card sidebar-card sidebar-promotions-card"><a href="https://example.com/ad">广告位</a></div>',
  )
  await loadBase(w, PLUG('skin.user.js'))
  const aside = shell(w).querySelector('#lsb-shell-aside')
  assert.ok(aside.querySelector('.sidebar-promotions-card'), '广告卡进氢壳右栏')
  assert.match(aside.textContent, /广告位/)
})

test('legacy 验收：氢壳：右栏迁入站务公告，不跟原生侧栏一起藏掉', async () => {
  const { w } = makeLegacyHome()
  const nativeSide = [...w.document.querySelectorAll('aside.sidebar')].find(
    (el) => !el.classList.contains('mobile-menu-drawer'),
  )
  nativeSide.insertAdjacentHTML(
    'beforeend',
    '<div class="card sidebar-card quick-card forum-enhancements-left-announcements">' +
      '<div class="quick-title">站务公告</div><a href="/topic/20997">广告隐藏</a></div>',
  )
  await loadBase(w, PLUG('skin.user.js'))
  const aside = shell(w).querySelector('#lsb-shell-aside')
  assert.ok(aside.querySelector('.forum-enhancements-left-announcements'), '站务公告进氢壳右栏')
  assert.match(aside.textContent, /站务公告/)
})

test('legacy 验收：氢壳：关壳后右栏卡片与顶栏入口回到原位', async () => {
  const { w, tick } = makeLegacyHome()
  w.document
    .querySelector('.forum-nav')
    .insertAdjacentHTML('beforeend', '<a class="forum-link forum-enhancements-custom-top-link" href="/gacha">称号中心</a>')
  await loadBase(w, PLUG('skin.user.js'))
  assert.ok(shell(w).querySelector('#lsb-shell-aside .stats-card'))

  w.eval(`(() => {
    const cur = JSON.parse(localStorage.getItem('lsb_base:skin:__config') || '{}')
    cur.shell = false
    localStorage.setItem('lsb_base:skin:__config', JSON.stringify(cur))
  })()`)
  w.LSB.bus.emit('config:changed:skin', { shell: false }, { source: 'core' })
  await tick(30)

  assert.equal(shell(w), null)
  const nativeSide = [...w.document.querySelectorAll('aside.sidebar')].find(
    (el) => !el.classList.contains('mobile-menu-drawer'),
  )
  assert.ok(nativeSide.querySelector('.stats-card'), '统计卡回到原生侧栏')
  assert.ok(nativeSide.querySelector('.daily-hot-topics-card'))
  assert.ok(w.document.querySelector('body > .top a.forum-enhancements-custom-top-link'), '称号中心回到顶栏')
})

test('氢壳：油猴菜单可切换开关', async () => {
  const { w, tick } = makeHome()
  w.__gmMenus = []
  w.GM_registerMenuCommand = (title, fn) => {
    const id = w.__gmMenus.length + 1
    w.__gmMenus.push({ id, title, fn })
    return id
  }
  w.GM_unregisterMenuCommand = (id) => {
    w.__gmMenus = w.__gmMenus.filter((m) => m.id !== id)
  }
  await loadBase(w, PLUG('skin.user.js'))

  let item = w.__gmMenus.find((m) => /氢壳/.test(m.title))
  assert.ok(item, '油猴菜单登记了氢壳开关')
  assert.match(item.title, /关闭/)
  assert.ok(shell(w), '默认开壳')

  item.fn()
  await tick(30)
  assert.equal(shell(w), null, '菜单关掉壳')
  item = w.__gmMenus.find((m) => /氢壳/.test(m.title))
  assert.match(item.title, /开启/)

  item.fn()
  await tick(30)
  assert.ok(shell(w), '菜单再打开壳')
})

test('壳占位：iframe 内不注入基座与单画布占位', async () => {
  const dom = new JSDOM('<!doctype html><html><body><iframe id="f"></iframe></body></html>', {
    url: 'https://linux.sb/',
    runScripts: 'outside-only',
  })
  fixtureWindows.add(dom.window)
  const fw = dom.window.document.getElementById('f').contentWindow
  assert.notEqual(fw.self, fw.top, '夹具本身就是 iframe')
  fw.unsafeWindow = fw
  fw.requestAnimationFrame = (fn) => setTimeout(() => fn(Date.now()), 0)
  fw.eval(baseCode)
  assert.equal(fw.document.getElementById('lsb-shell-boot-style'), null, 'iframe 不占位')
  assert.equal(fw.document.getElementById('lsb-shell-boot-frame'), null, 'iframe 不画铬色块')
  assert.equal(fw.LSB, undefined, 'iframe 不安装 LSB')
  assert.ok(!fw.document.documentElement.classList.contains('lsb-canvas-boot'))
})

test('壳占位：配置缺少模式或选择 legacy 时保留原生首屏', async () => {
  const cases = [
    ['缺少 skin config', {}],
    ['空 skin config', { 'lsb_base:skin:__config': {} }],
    ['未知模式', { 'lsb_base:skin:__config': { uiMode: 'future-mode' } }],
    ['显式旧模式', { 'lsb_base:skin:__config': { uiMode: 'legacy' } }],
    ['关闭 shell', { 'lsb_base:skin:__config': { uiMode: 'ios27', shell: false } }],
    ['皮肤停用', { 'lsb_base:skin:__config': { uiMode: 'ios27' }, 'lsb_base:__core:disabled:skin': true }],
  ]
  for (const [label, preload] of cases) {
    const { w } = makeDom(homeHtml, 'https://linux.sb/', preload)
    w.eval(baseCode)
    assert.equal(bootStyle(w), null, `${label}: no boot stylesheet`)
    assert.equal(bootFrame(w), null, `${label}: no boot frame`)
    assert.equal(w.document.documentElement.classList.contains('lsb-canvas-boot'), false, `${label}: no canvas boot marker`)
  }
})

test('壳占位：仅显式选择 iOS 27 时基座在首屏注入单画布占位', async () => {
  const { w } = makeDom(homeHtml, 'https://linux.sb/', {
    'lsb_base:skin:__config': { uiMode: 'ios27' },
  })
  w.eval(baseCode)
  assert.ok(bootStyle(w), 'document-start 就该有 #lsb-shell-boot-style')
  assert.ok(w.document.documentElement.classList.contains('lsb-canvas-boot'))
  const css = bootCss(w).replace(/\s+/g, '')
  assert.doesNotMatch(css, /padding-(?:top|left|right):(?:48|240|280)px/)
  assert.doesNotMatch(css, /min-width:\s*900px/, '首屏遮蔽不应只在宽屏生效')
  assert.ok(css.includes('body>.top') || css.includes('body> .top'), '藏原顶栏')
  assert.ok(css.includes('aside.sidebar'), '藏原侧栏')
  assert.ok(css.includes('forum-enhancements-left-fixed'), '藏原生左侧导航')
  assert.ok(/main\.wrap\{[^}]*max-width:/.test(css), '单画布保留主内容宽度规则')
})

test('壳占位：帖子页首屏只画单画布色块，不等皮肤 setup', async () => {
  const { w } = makeSite()
  w.eval(baseCode)
  const frame = bootFrame(w)
  assert.ok(frame, '整页进帖时 document-start 就要有铬色块，不能等皮肤扫楼')
  assert.equal(frame.getAttribute('aria-hidden'), 'true')
  assert.equal(frame.querySelectorAll('[data-boot]').length, 1)
  assert.ok(frame.querySelector('[data-boot="canvas"]'), '单画布色块')
  assert.equal(frame.querySelector('[data-boot="rail"]'), null, '不再创建左栏占位')
  assert.equal(frame.querySelector('[data-boot="aside"]'), null, '不再创建右栏占位')
  const css = bootCss(w).replace(/\s+/g, '')
  assert.ok(css.includes('#lsb-shell-boot-frame'), '色块样式跟占位 CSS 一起注入')
  assert.ok(css.includes('pointer-events:none'), '色块不抢点击')
  assert.match(bootCss(w), /z-index:\s*79\d\d/, '叠在真壳（7999+）下面')
  assert.match(bootCss(w), /var\(--bg,\s*#f4f5f7\)/, '跟壳同一底色，避免先白后灰')
})

test('壳占位：真实画布接管前不撤掉首屏遮蔽', async () => {
  const { w, tick } = makeSite()
  w.eval(baseCode)
  const initialBootStyle = bootStyle(w)
  assert.ok(initialBootStyle, '皮肤启动前已有 document-start 导航样式')
  assert.ok(bootFrame(w), '皮肤启动前应已有首屏遮蔽层')

  const removals = []
  const nativeRemove = w.Element.prototype.remove
  w.Element.prototype.remove = function () {
    if (this.id === 'lsb-shell-boot-frame') {
      removals.push({
        shell: Boolean(w.document.getElementById('lsb-shell')),
        surfaces: Boolean(w.document.getElementById('lsb-shell-surfaces')),
        bootClass: w.document.documentElement.classList.contains('lsb-canvas-boot'),
      })
    }
    return nativeRemove.call(this)
  }
  try {
    w.eval(PLUG('skin.user.js'))
    await tick(60)
  } finally {
    w.Element.prototype.remove = nativeRemove
  }

  assert.equal(removals.length, 1, '真实画布接管后只应撤掉一次首屏遮蔽层')
  assert.equal(removals[0].shell, true, '撤遮蔽时氢壳宿主必须已存在')
  assert.equal(removals[0].surfaces, true, '撤遮蔽时氢壳浮层宿主必须已存在')
  assert.equal(removals[0].bootClass, false, '撤遮蔽时应已切换到真实画布状态')
  assert.strictEqual(bootStyle(w), initialBootStyle, '接管后保留原导航样式，后续整页跳转仍能隐藏原站 UI')
  assert.ok(bootCss(w).includes('lsb-canvas-navigating'), '已挂载画布仍保有 document-start 导航守卫样式')
})

test('壳占位：配置里残留墙纸 URL 也不铺背景', async () => {
  const { w } = makeHome({ 'lsb_base:skin:__config': { wallpaperUrl: 'https://example.com/w.jpg' } })
  w.eval(baseCode)
  assert.doesNotMatch(bootCss(w), /background-image/)
  assert.doesNotMatch(bootCss(w), /example\.com/)
})

test('壳占位：合法 HTTPS 视频 URL 只使用静态背景预铺', async () => {
  const { w } = makeHome({
    'lsb_base:skin:__config': { backgroundVideoEnabled: true, backgroundVideoUrl: 'https://cdn.example/bg.mp4' },
  })
  w.eval(baseCode)
  assert.match(bootCss(w), /cdn\.example\/bg\.mp4/)
  assert.doesNotMatch(bootCss(w), /<video/i)
})

test('壳占位：点击帖子立即进入离开态且不拦截整页导航', async () => {
  const { w } = makeHome()
  w.eval(baseCode)
  const link = w.document.createElement('a')
  link.href = 'https://linux.sb/topic/1'
  link.textContent = '去帖子'
  w.document.querySelector('main.wrap').append(link)

  let targetSawAllowed = false
  link.addEventListener('click', (event) => {
    targetSawAllowed = !event.defaultPrevented
    event.preventDefault()
  })
  const event = new w.MouseEvent('click', { bubbles: true, cancelable: true, button: 0 })
  const allowed = link.dispatchEvent(event)

  assert.equal(allowed, false, '测试监听器随后取消导航，避免 jsdom 真的尝试跳页')
  assert.equal(targetSawAllowed, true, '离开态守卫不能提前拦截浏览器整页导航')
  assert.equal(w.document.documentElement.dataset.lsbNavigation, 'leaving')
  assert.ok(w.document.documentElement.classList.contains('lsb-canvas-navigating'))
  assert.match(bootCss(w), /lsb-canvas-navigating/)
})

test('壳占位：配置关闭壳时不注入占位', async () => {
  const { w } = makeHome({ 'lsb_base:skin:__config': { shell: false } })
  w.eval(baseCode)
  assert.equal(bootStyle(w), null)
  assert.equal(bootFrame(w), null, '关壳不画铬色块')
  assert.ok(!w.document.documentElement.classList.contains('lsb-canvas-boot'))
})

test('壳占位：皮肤插件已停用时不注入占位', async () => {
  const { w } = makeHome({ 'lsb_base:__core:disabled:skin': true })
  w.eval(baseCode)
  assert.equal(bootStyle(w), null)
  assert.equal(bootFrame(w), null)
})

test('壳占位：关壳或停用皮肤后撤掉占位，原版顶栏能回来', async () => {
  const { w, tick } = makeHome()
  await loadBase(w, PLUG('skin.user.js'))
  assert.ok(bootStyle(w), '开壳时占位还在（与壳 CSS 叠着）')

  w.eval(`(() => {
    const cur = JSON.parse(localStorage.getItem('lsb_base:skin:__config') || '{}')
    cur.shell = false
    localStorage.setItem('lsb_base:skin:__config', JSON.stringify(cur))
  })()`)
  w.LSB.bus.emit('config:changed:skin', { shell: false }, { source: 'core' })
  await tick(20)
  assert.equal(bootStyle(w), null, '关壳撤占位')
  assert.equal(bootFrame(w), null, '关壳撤铬色块')
  assert.ok(!w.document.documentElement.classList.contains('lsb-canvas-boot'))

  w.LSB.disable('skin')
  assert.equal(bootStyle(w), null, '停用皮肤仍无占位')
  assert.equal(bootFrame(w), null, '停用皮肤仍无铬色块')
})

function stubHtmlFetch(w, htmlFor) {
  const calls = []
  calls.inits = []
  w.fetch = async (url, init = {}) => {
    const href = String(url)
    calls.push(href)
    calls.inits.push(init)
    const html = typeof htmlFor === 'function' ? htmlFor(href, init) : htmlFor
    return {
      status: 200,
      ok: true,
      url: href,
      text: async () => html,
    }
  }
  return calls
}

function deferredHtmlFetch(w, htmlFor) {
  const calls = []
  const pending = []
  w.fetch = async (url, init = {}) => {
    const href = String(url)
    calls.push(href)
    const html = typeof htmlFor === 'function' ? htmlFor(href) : htmlFor
    return await new Promise((resolve) => pending.push({ resolve, html, href, signal: init.signal }))
  }
  return {
    calls,
    resolveNext() {
      const next = pending.shift()
      next?.resolve({ status: 200, ok: true, url: next.href, text: async () => next.html })
    },
    resolveWhere(predicate) {
      const index = pending.findIndex((entry) => predicate(entry.href, entry))
      if (index < 0) return false
      const [next] = pending.splice(index, 1)
      next.resolve({ status: 200, ok: true, url: next.href, text: async () => next.html })
      return true
    },
    resolveMatching(pattern) {
      return this.resolveWhere((href) => pattern.test(href))
    },
    pending: () => pending.length,
    signals: () => pending.map(({ signal }) => signal),
  }
}

function headerValue(init, name) {
  const headers = init?.headers
  if (!headers) return ''
  if (typeof headers.get === 'function') return String(headers.get(name) || '')
  if (Array.isArray(headers)) {
    return String(headers.find(([key]) => String(key).toLowerCase() === name.toLowerCase())?.[1] || '')
  }
  return String(headers[name] ?? headers[name.toLowerCase()] ?? '')
}

function isOnlineUserRequest(url, init = {}) {
  try {
    const x = new URL(String(url), 'https://linux.sb')
    const path = x.pathname.replace(/\/{2,}/g, '/') || '/'
    return (path === '/' || path === '/index.php') && headerValue(init, 'cache-control').toLowerCase() === 'no-cache'
  } catch {
    return false
  }
}

function onlineUserGets(calls) {
  return calls.filter((url, index) => isOnlineUserRequest(url, calls.inits?.[index]))
}

function homeGets(calls) {
  return calls.filter((u, index) => {
    try {
      const x = new URL(String(u), 'https://linux.sb')
      const path = x.pathname.replace(/\/{2,}/g, '/') || '/'
      if (path !== '/' && path !== '/index.php') return false
      if (isOnlineUserRequest(u, calls.inits?.[index])) return false
      return !x.searchParams.get('p')
    } catch {
      return false
    }
  })
}

function stubReload(w) {
  let n = 0
  const loc = w.location
  const implSym = Object.getOwnPropertySymbols(loc).find((s) => {
    try {
      return loc[s] && typeof loc[s].reload === 'function'
    } catch {
      return false
    }
  })
  if (implSym) {
    loc[implSym].reload = () => {
      n += 1
    }
    return () => n
  }
  Object.defineProperty(w.Location.prototype, 'reload', {
    configurable: true,
    writable: true,
    value: () => {
      n += 1
    },
  })
  return () => n
}

function stubLocationAssign(w) {
  const urls = []
  const loc = w.location
  const implSym = Object.getOwnPropertySymbols(loc).find((s) => {
    try {
      return loc[s] && typeof loc[s].assign === 'function'
    } catch {
      return false
    }
  })
  if (implSym) {
    loc[implSym].assign = (url) => { urls.push(String(url)) }
    return () => urls
  }
  Object.defineProperty(w.Location.prototype, 'assign', {
    configurable: true,
    writable: true,
    value: (url) => { urls.push(String(url)) },
  })
  return () => urls
}

function holdLongTimers(w) {
  const nativeSet = w.setTimeout.bind(w)
  const nativeClear = w.clearTimeout.bind(w)
  const held = new Map()
  let seq = 900000
  w.setTimeout = (fn, ms, ...args) => {
    const delay = Number(ms) || 0
    if (delay >= 25000) {
      const id = ++seq
      held.set(id, { fn, args })
      return id
    }
    return nativeSet(fn, ms, ...args)
  }
  w.clearTimeout = (id) => {
    if (held.has(id)) {
      held.delete(id)
      return
    }
    return nativeClear(id)
  }
  return {
    async flush() {
      const jobs = [...held.values()]
      held.clear()
      for (const { fn, args } of jobs) fn(...args)
      await new Promise((r) => nativeSet(r, 0))
    },
  }
}

test('壳内跳转：列表进入帖子软跳并保持同一颗画布', async () => {
  const { w, tick } = makeTopicSpaHome()
  const poisoned = topicHtml.replace(/<main\b[^>]*>/i, (m) => `${m}<script>window.__spa_leaked=1</script>`)
  const calls = stubHtmlFetch(w, poisoned)
  await loadBase(w, PLUG('skin.user.js'))

  const shellNode = w.document.getElementById('lsb-shell')
  const outlet = w.document.querySelector('main.wrap')
  const topStatus = w.document.querySelector('[data-surface="top-status"]')
  const toolCapsule = w.document.querySelector('[data-surface="tool-capsule"]')
  const link = w.document.createElement('a')
  link.href = 'https://linux.sb/topic/1'
  link.textContent = '去帖子'
  outlet.append(link)
  link.click()
  await tick(120)

  assert.ok(calls.some((url) => /\/topic\/1/.test(url)), '帖子阅读链接应由壳发起 GET')
  assert.equal(w.location.pathname, '/topic/1')
  assert.equal(w.document.querySelector('main.wrap'), outlet, '正文出口节点保持不变')
  assert.equal(w.document.getElementById('lsb-shell'), shellNode, '壳是同一个节点')
  assert.equal(w.document.querySelector('[data-surface="top-status"]'), topStatus, '顶部状态栏保持不变')
  assert.equal(w.document.querySelector('[data-surface="tool-capsule"]'), toolCapsule, '底部工具胶囊保持不变')
  assert.ok(w.document.querySelector('.topic-post-list'), '帖子正文已提交')
  assert.equal(w.__spa_leaked, undefined, '远端 script 不得执行')
  assert.ok(!w.document.querySelector('main.wrap script'), '换入正文不能保留 script')
  assert.equal(w.document.documentElement.dataset.lsbRoutePhase, undefined, '事务完成后清理阶段')
})

test('legacy 首页无限滚动监听中间面板并加载下一页', async () => {
  const { w, tick, until } = makeTopicSpaHome({
    'lsb_base:skin:__config': { uiMode: 'legacy' },
  })
  Object.defineProperty(w, 'innerWidth', { configurable: true, value: 1200 })
  const calls = stubHtmlFetch(w, homeHtml)
  const pagination = w.document.querySelector('.pagination-bar')
  pagination?.classList.remove('sb-infinite-scroll-pagination-hidden')
  if (pagination) pagination.innerHTML = '<a href="/?p=2">下一页</a>'
  await loadBase(w, PLUG('skin.user.js'))

  const panel = w.document.querySelector('.main-panel')
  const list = w.document.querySelector('.main-panel > ul.post-list')
  assert.ok(panel, 'legacy 首页中间面板应存在')
  assert.ok(list, 'legacy 首页列表应存在')
  Object.defineProperty(panel, 'clientHeight', { configurable: true, value: 500 })
  panel.getBoundingClientRect = () => ({ top: 0, bottom: 500 })
  list.getBoundingClientRect = () => ({ top: 0, bottom: 100, left: 0, right: 0, width: 1, height: 100 })

  panel.dispatchEvent(new w.Event('scroll'))
  assert.equal(await until(() => calls.some((url) => /[?&]p=2(?:&|$)/.test(url)), 800), true,
    `legacy 中间面板滚动到底部应发起首页第 2 页请求: ${JSON.stringify(calls)}`)
  await tick(20)
})

test('legacy 首页原生隐藏分页时仍由面板滚动加载下一页', async () => {
  const { w, tick, until } = makeTopicSpaHome({
    'lsb_base:skin:__config': { uiMode: 'legacy' },
  })
  Object.defineProperty(w, 'innerWidth', { configurable: true, value: 1200 })
  const calls = stubHtmlFetch(w, homeHtml)
  const pagination = w.document.querySelector('.pagination-bar')
  assert.ok(pagination, '首页分页条应存在')
  pagination.classList.add('sb-infinite-scroll-pagination-hidden')
  pagination.removeAttribute('data-lsb-shell-inf')
  pagination.innerHTML = '<a href="/?p=2">下一页</a>'
  await loadBase(w, PLUG('skin.user.js'))

  const panel = w.document.querySelector('.main-panel')
  const list = w.document.querySelector('.main-panel > ul.post-list')
  assert.ok(panel, 'legacy 首页中间面板应存在')
  assert.ok(list, 'legacy 首页列表应存在')
  assert.equal(pagination.getAttribute('data-lsb-shell-inf'), '1', '壳应接管原生隐藏的分页条')
  Object.defineProperty(panel, 'clientHeight', { configurable: true, value: 500 })
  panel.getBoundingClientRect = () => ({ top: 0, bottom: 500 })
  list.getBoundingClientRect = () => ({ top: 0, bottom: 100, left: 0, right: 0, width: 1, height: 100 })

  panel.dispatchEvent(new w.Event('scroll'))
  assert.equal(await until(() => calls.some((url) => /[?&]p=2(?:&|$)/.test(url)), 800), true,
    `原生隐藏分页时旧三栏面板滚动仍应发起首页第 2 页请求: ${JSON.stringify(calls)}`)
  await tick(20)
})
test('legacy 旧三栏：高延迟帖子软跳期间回首页会恢复无限滚动', async () => {
  const { w, tick, until } = makeTopicSpaHome({
    'lsb_base:skin:__config': { uiMode: 'legacy' },
  })
  Object.defineProperty(w, 'innerWidth', { configurable: true, value: 1200 })
  const lateHome = homeHtml.replace(
    '<ul class="post-list">',
    '<ul class="post-list"><li class="post-item"><div class="post-body"><a class="post-title" href="/topic/998876">高延迟后仍可加载的旧帖</a></div></li>',
  )
  const flow = deferredHtmlFetch(w, (url) => {
    const href = String(url)
    if (/\/topic\/1(?:\?|$)/.test(href)) return topicHtml
    if (/[?&]p=2(?:&|$)/.test(href)) return lateHome
    return homeHtml
  })
  const initialPagination = w.document.querySelector('.pagination-bar')
  initialPagination?.classList.remove('sb-infinite-scroll-pagination-hidden')
  if (initialPagination) initialPagination.innerHTML = '<a href="/?p=2">下一页</a>'
  await loadBase(w, PLUG('skin.user.js'))

  const list = w.document.querySelector('.main-panel > ul.post-list')
  const panel = list?.closest('.main-panel')
  assert.ok(list, '旧三栏首页列表应存在')
  assert.ok(panel, '旧三栏首页滚动面板应存在')
  assert.equal(w.document.querySelector('.pagination-bar')?.getAttribute('data-lsb-shell-inf'), '1')

  const toTopic = w.document.createElement('a')
  toTopic.href = 'https://linux.sb/topic/1'
  w.document.querySelector('main.wrap').append(toTopic)
  toTopic.click()
  assert.equal(await until(() => flow.calls.some((url) => /\/topic\/1(?:\?|$)/.test(url)), 800), true,
    '应发起延迟帖子请求')

  const homeLink = w.document.querySelector('.lsb-shell-brand')
  assert.ok(homeLink, '旧三栏站名首页入口应存在')
  homeLink.click()
  await tick(30)

  assert.equal(w.location.pathname, '/', '取消未完成帖子导航后仍应停留在首页')
  assert.equal(await flow.resolveMatching(/\/topic\/1(?:\?|$)/), true, '应释放迟到帖子响应')
  await tick(80)
  assert.equal(w.location.pathname, '/', '迟到帖子响应不能改写首页地址')
  assert.equal(w.document.querySelector('.topic-post-list'), null, '首页不能显示迟到帖子的正文和评论区')
  assert.equal(w.document.querySelector('.main-panel > ul.post-list'), list, '首页列表应恢复同一颗节点')

  list.getBoundingClientRect = () => ({ top: 0, bottom: 0, left: 0, right: 0, width: 1, height: 0 })
  panel.dispatchEvent(new w.Event('scroll'))
  assert.equal(await until(() => flow.calls.some((url) => /[?&]p=2(?:&|$)/.test(url)), 800), true,
    '取消帖子导航后旧三栏无限滚动仍应请求下一页')
  assert.equal(await flow.resolveMatching(/[?&]p=2(?:&|$)/), true, '应释放首页下一页响应')
  await tick(40)
  assert.ok(list.querySelector('a[href*="/topic/998876"]'), '下一页旧帖应插入首页列表')
})

testReadingModes('首页无限滚动计时器在帖子路由切换窗口内不发起跨路由请求', async (uiMode) => {
  const { w, tick } = makeReadingHome(uiMode, {
    'lsb_base:skin:__config': { uiMode },
  })
  Object.defineProperty(w, 'innerWidth', { configurable: true, value: 1200 })
  const calls = stubHtmlFetch(w, topicHtml)
  const pagination = w.document.querySelector('.pagination-bar')
  pagination?.classList.remove('sb-infinite-scroll-pagination-hidden')
  if (pagination) pagination.innerHTML = '<a href="/?p=2">下一页</a>'
  await loadBase(w, PLUG('skin.user.js'))

  const list = w.document.querySelector('.main-panel > ul.post-list')
  assert.ok(list, '首页列表应存在')
  Object.defineProperty(list, 'getBoundingClientRect', {
    configurable: true,
    value: () => ({ top: -100, bottom: 0, left: 0, right: 0, width: 1, height: 100 }),
  })
  w.dispatchEvent(new w.Event('scroll'))
  await tick(100)
  w.history.pushState({}, '', '/topic/1')
  await tick(300)

  assert.equal(calls.some((url) => /\/topic\/1\?p=2(?:&|$)/.test(url)), false,
    `帖子路由切换后不应沿用首页无限滚动计时器发请求: ${JSON.stringify(calls)}`)
})

testReadingModes('首页无限滚动响应晚返回时不污染帖子正文', async (uiMode) => {
  const { w, tick, until } = makeReadingHome(uiMode, {
    'lsb_base:skin:__config': { uiMode },
  })
  Object.defineProperty(w, 'innerWidth', { configurable: true, value: 1200 })
  const lateHome = homeHtml.replace(
    '<ul class="post-list">',
    '<ul class="post-list"><li class="post-item"><div class="post-body"><a class="post-title" href="/topic/998877">首页晚到帖</a></div></li>',
  )
  const flow = deferredHtmlFetch(w, (url) => /[?&]p=2(?:&|$)/.test(String(url)) ? lateHome : topicHtml)
  const initialPagination = w.document.querySelector('.pagination-bar')
  initialPagination?.classList.remove('sb-infinite-scroll-pagination-hidden')
  if (initialPagination) initialPagination.innerHTML = '<a href="/?p=2">下一页</a>'
  await loadBase(w, PLUG('skin.user.js'))

  const list = w.document.querySelector('.main-panel > ul.post-list')
  const pagination = w.document.querySelector('.pagination-bar')
  assert.ok(list, '首页列表应存在')
  assert.ok(pagination, '首页分页条应存在')
  assert.ok(pagination.querySelector('a[href*="p=2"]'), '首页应有第 2 页链接')
  assert.equal(await until(() => pagination.getAttribute('data-lsb-shell-inf') === '1'), true,
    `皮肤应接管首页分页条: ${pagination.outerHTML}`)
  await tick(120)
  list.getBoundingClientRect = () => ({ bottom: 0 })
  w.dispatchEvent(new w.Event('scroll'))
  assert.equal(await until(() => flow.calls.some((url) => /[?&]p=2(?:&|$)/.test(url)), 800), true,
    `滚动到底部应发起首页第 2 页请求: ${pagination.outerHTML}`)

  const link = w.document.createElement('a')
  link.href = 'https://linux.sb/topic/1'
  w.document.querySelector('main.wrap').append(link)
  link.click()
  assert.equal(flow.resolveMatching(/\/topic\/1(?:\?|$)/), true, '应先释放帖子响应')
  assert.equal(await until(() => w.location.pathname === '/topic/1' && !!w.document.querySelector('.topic-post-list')), true,
    '帖子正文应先提交')

  assert.equal(flow.resolveMatching(/[?&]p=2(?:&|$)/), true, '再释放已过期的首页响应')
  await tick(40)
  const topic = w.document.querySelector('ul.topic-post-list')
  assert.ok(topic, '当前出口仍应是帖子列表')
  assert.equal(topic.textContent.includes('首页晚到帖'), false,
    '首页晚响应不得写入已经切换的帖子正文')
  assert.equal(topic.querySelectorAll('li.post-entry').length, topicHtml.match(/class="post-item post-entry/g)?.length || 0,
    '帖子正文楼层数量不能被首页列表项改变')
})

testReadingModes('软跳进帖子时实时流首页响应晚返回不写入帖子楼层', async (uiMode) => {
  const { w, tick, until } = makeReadingHome(uiMode, {
    'lsb_base:__core:urlPoll': 25,
    'lsb_base:live-feed:__config': {
      jitterMs: 0,
      pollSec: 30,
      bgSec: 30,
      autoInsert: true,
      trackTopicReplies: true,
    },
  })
  const lateHome = homeHtml.replace(
    '<ul class="post-list">',
    '<ul class="post-list"><li class="post-item"><div class="post-body"><a class="post-title" href="/topic/998878">实时流晚到首页帖</a></div></li>',
  )
  const flow = deferredHtmlFetch(w, (url) => /\/topic\/1(?:\?|$)/.test(String(url)) ? topicHtml : lateHome)
  await loadBase(w, PLUG('skin.user.js'), PLUG('live-feed.user.js'))
  const feed = await w.LSB.bus.request('live-feed:debug')
  assert.equal(await until(() => feed.mode() === 'list', 1200), true, '实时流应先建立首页列表基线')
  void feed.pollOnce()
  assert.equal(await until(() => homeGets(flow.calls).length > 0, 1200), true,
    '实时流应发起首页列表请求')

  const link = w.document.createElement('a')
  link.href = 'https://linux.sb/topic/1'
  w.document.querySelector('main.wrap').append(link)
  assert.ok(link.isConnected, `帖子链接应在文档中 shell=${!!w.document.getElementById('lsb-shell')}`)
  link.click()
  assert.equal(await until(() => flow.calls.some((url) => /\/topic\/1(?:\?|$)/.test(url)), 800), true,
    `软跳应发起帖子请求: ${JSON.stringify(flow.calls)} href=${w.location.href}`)
  assert.equal(flow.resolveMatching(/\/topic\/1(?:\?|$)/), true, '应先释放帖子响应')
  assert.equal(flow.resolveWhere((url) => homeGets([url]).length > 0), true, '随后释放已过期的首页响应')
  assert.equal(await until(() => w.location.pathname === '/topic/1' && !!w.document.querySelector('.topic-post-list')), true,
    '帖子正文应提交')
  await tick(40)

  const topic = w.document.querySelector('ul.topic-post-list')
  assert.ok(topic, '当前出口应是帖子楼层列表')
  assert.equal(topic.textContent.includes('实时流晚到首页帖'), false,
    '实时流的首页响应不得追加到帖子楼层')
  assert.equal(topic.querySelectorAll('li.post-item:not(.post-entry)').length, 0,
    '帖子楼层列表不能出现首页列表项')
})

testReadingModes('看过帖子返回缓存首页时，迟到的帖子响应不能污染首页', async (uiMode) => {
  const lateTopic = topicHtml.replace(
    '</ul>',
    '<li class="post-item post-entry" id="post-999991" data-floor="401">' +
      '<div class="post-content"><p>迟到的帖子评论</p></div></li></ul>',
  )
  const { w, tick, until } = makeReadingHome(uiMode, {
    'lsb_base:__core:urlPoll': 25,
    'lsb_base:live-feed:__config': {
      jitterMs: 0,
      pollSec: 30,
      bgSec: 30,
      autoInsert: true,
      trackTopicReplies: true,
    },
  })
  const initialPagination = w.document.querySelector('.pagination-bar')
  initialPagination?.classList.remove('sb-infinite-scroll-pagination-hidden')
  if (initialPagination) initialPagination.innerHTML = '<a href="/?p=2">下一页</a>'
  Object.defineProperty(w.document, 'visibilityState', { configurable: true, get: () => 'hidden' })
  const latePage = homeHtml.replace(
    '<ul class="post-list">',
    '<ul class="post-list"><li class="post-item"><div class="post-body"><a class="post-title" href="/topic/999992">返回后第二页帖子</a></div></li>',
  )
  let topicFetches = 0
  const flow = deferredHtmlFetch(w, (url) => {
    const href = String(url)
    if (/\/topic\/1(?:\?|$)/.test(href)) {
      topicFetches += 1
      return topicFetches === 1 ? topicHtml : lateTopic
    }
    return /[?&]p=2(?:&|$)/.test(href) ? latePage : homeHtml
  })
  await loadBase(w, PLUG('skin.user.js'))
  w.eval(`(() => {
    let release
    let calls = 0
    let resolveSecond
    const hold = new Promise((resolve) => { release = resolve })
    window.__releaseUnreadForTest = () => release()
    window.__secondUnreadCallForTest = new Promise((resolve) => { resolveSecond = resolve })
    window.LSB.register(
      { id: 'test-unread-sentinel', name: '测试消息箱', version: '1.0.0', permissions: ['events'] },
      (api) => api.handle('unread-sentinel:debug', async () => {
        calls += 1
        if (calls === 2) resolveSecond()
        await hold
        return { inbox: () => [] }
      }),
    )
  })()`)
  w.eval(PLUG('live-feed.user.js'))
  await tick(30)
  const feed = await w.LSB.bus.request('live-feed:debug')
  assert.equal(await until(() => feed.mode() === 'list', 1200), true)

  void feed.pollOnce()
  assert.equal(await until(() => homeGets(flow.calls).length > 0, 1200), true)
  assert.equal(flow.resolveWhere((url) => homeGets([url]).length > 0), true)
  await tick(20)

  const toTopic = w.document.createElement('a')
  toTopic.href = 'https://linux.sb/topic/1'
  w.document.querySelector('main.wrap').append(toTopic)
  toTopic.click()
  assert.equal(await until(() => flow.calls.some((url) => /\/topic\/1(?:\?|$)/.test(url)), 1000), true)
  assert.equal(flow.resolveMatching(/\/topic\/1(?:\?|$)/), true)
  assert.equal(await until(() => w.location.pathname === '/topic/1' && !!w.document.querySelector('.topic-post-list')), true)

  void feed.pollOnce()
  assert.equal(await until(() => flow.pending() > 0, 1000), true)
  assert.equal(flow.resolveMatching(/\/topic\/1(?:\?|$)/), true, '先让帖子实时流响应完成解析')
  const reachedMessageWait = await Promise.race([
    w.__secondUnreadCallForTest.then(() => true),
    tick(1200).then(() => false),
  ])
  assert.equal(reachedMessageWait, true, '帖子实时流应停在消息增量等待边界')
  const toHome = w.document.querySelector('.breadcrumb a[href="/"]')
  assert.ok(toHome, '帖子页应有返回首页入口')
  toHome.click()
  assert.equal(await until(() => w.location.pathname === '/' && !!w.document.querySelector('.post-list')), true)
  w.__releaseUnreadForTest()
  await tick(60)
  assert.equal(await until(() => w.document.querySelector('.post-content-title') === null, 400), true)
  assert.equal(
    w.document.querySelector('.lsb-live-banner.is-topic'),
    null,
    '迟到的帖子实时流任务不能在缓存首页显示帖子横幅',
  )
  assert.equal(w.document.querySelector('ul.topic-post-list'), null)
  assert.equal(w.document.querySelector('li.post-entry'), null)
  assert.equal(w.document.querySelector('main.wrap')?.textContent.includes('迟到的帖子评论'), false)

  const list = w.document.querySelector('.main-panel > ul.post-list')
  const pagination = w.document.querySelector('.pagination-bar')
  assert.ok(list, '返回首页后列表出口仍存在')
  assert.equal(pagination?.getAttribute('data-lsb-shell-inf'), '1', '返回首页后无限滚动仍接管分页')
  list.getBoundingClientRect = () => ({ bottom: 0 })
  const scrollRoot = list.closest('.main-panel')
  assert.ok(scrollRoot, '首页列表所在面板应承接滚动事件')
  scrollRoot.dispatchEvent(new w.Event('scroll'))
  assert.equal(await until(() => flow.calls.some((url) => /[?&]p=2(?:&|$)/.test(url)), 1000), true,
    '返回首页后在真实滚动面板继续下拉应发起下一页请求')
  assert.equal(flow.resolveMatching(/[?&]p=2(?:&|$)/), true)
  assert.ok(await until(() => list.querySelector('a[href*="/topic/999992"]')),
    `返回首页后下一页帖子仍能插入列表: ${JSON.stringify(flow.calls)}`)
})

test('首页原生右栏卡片在帖子软跳往返后仍保留', async () => {
  const { w, until } = makeTopicSpaHome()
  Object.defineProperty(w, 'innerWidth', { configurable: true, value: 1200 })
  stubHtmlFetch(w, topicHtml)
  const sidebar = w.document.querySelector('aside.sidebar')
  const hot = w.document.createElement('section')
  hot.className = 'sidebar-card daily-hot-topics-card'
  hot.textContent = '每日热帖：首页初始内容'
  const promotion = w.document.createElement('section')
  promotion.className = 'sidebar-card sidebar-promotions-card'
  promotion.textContent = '广告：首页初始内容'
  sidebar.append(hot, promotion)
  await loadBase(w, PLUG('skin.user.js'))

  const siteInfo = w.document.querySelector('[data-canvas-site-status-body]')
  assert.equal(await until(() => siteInfo?.contains(hot) && siteInfo?.contains(promotion)), true,
    '首页初始右栏卡片应迁入画布右栏')

  const link = w.document.createElement('a')
  link.href = 'https://linux.sb/topic/1'
  w.document.querySelector('main.wrap').append(link)
  link.click()
  assert.equal(await until(() => w.location.pathname === '/topic/1' && !!w.document.querySelector('.topic-post-list')), true)

  w.document.querySelector('[data-canvas-home]').click()
  assert.equal(await until(() => w.location.pathname === '/' && !!w.document.querySelector('.home-shell')), true,
    '帖子页应能软跳回首页')
  assert.equal(await until(() => siteInfo?.contains(hot) && siteInfo?.contains(promotion)), true,
    '返回首页后缓存的每日热帖和广告仍应回到画布右栏')
})

test('中等视口未打开右栏时帖子软跳往返仍保留首页卡片', async () => {
  const { w, until } = makeTopicSpaHome()
  Object.defineProperty(w, 'innerWidth', { configurable: true, value: 860 })
  stubHtmlFetch(w, topicHtml)
  const sidebar = w.document.querySelector('aside.sidebar')
  assert.ok(sidebar, '首页应有原生右栏宿主')
  const hot = sidebar.querySelector('.daily-hot-topics-card')
  assert.ok(hot, '首页应有原生每日热帖节点')
  const promotion = w.document.createElement('section')
  promotion.className = 'sidebar-card sidebar-promotions-card'
  promotion.innerHTML = '<a data-sidebar-promotions-ad-link="1" style="--sidebar-promotion-text:#fff;--sidebar-promotion-background:#2c72ce">领取奖励</a>'
  sidebar.append(promotion)

  await loadBase(w, PLUG('skin.user.js'))
  try {
    const siteInfo = w.document.querySelector('[data-surface="site-card"] [data-canvas-site-sidebar]')
    assert.strictEqual(siteInfo?.querySelector('.daily-hot-topics-card'), hot,
      '中等视口首次挂载也应登记首页原生每日热帖节点')
    assert.strictEqual(siteInfo?.querySelector('.sidebar-promotions-card'), promotion,
      '中等视口首次挂载也应登记首页原生广告节点')

    const link = w.document.createElement('a')
    link.href = 'https://linux.sb/topic/1'
    w.document.querySelector('main.wrap').append(link)
    link.click()
    assert.equal(await until(() => w.location.pathname === '/topic/1' && !!w.document.querySelector('.topic-post-list')), true)

    w.document.querySelector('[data-canvas-home]').click()
    assert.equal(await until(() => w.location.pathname === '/' && !!w.document.querySelector('.home-shell')), true,
      '帖子页应能软跳回首页')
    assert.strictEqual(siteInfo?.querySelector('.daily-hot-topics-card'), hot,
      '返回首页后应恢复同一个每日热帖节点')
    assert.strictEqual(siteInfo?.querySelector('.sidebar-promotions-card'), promotion,
      '返回首页后应恢复同一个广告节点')
  } finally {
    w.LSB.disable('skin')
    w.close()
  }
})

test('中等视口帖子软跳使用首页广告节点而非未初始化响应广告', async () => {
  const { w, tick, until } = makeTopicSpaHome()
  Object.defineProperty(w, 'innerWidth', { configurable: true, value: 860 })
  const sidebar = w.document.querySelector('aside.sidebar')
  assert.ok(sidebar, '首页应有原生右栏宿主')
  const promotion = w.document.createElement('section')
  promotion.className = 'sidebar-card sidebar-promotions-card'
  promotion.innerHTML = `
    <a href="#reward" data-sidebar-promotions-ad-link="1"
      style="--sidebar-promotion-text:#ffffff;--sidebar-promotion-background:#2c72ce">领取奖励</a>
    <form data-sidebar-promotions-click-form hidden></form>`
  const reward = promotion.querySelector('[data-sidebar-promotions-ad-link]')
  let clicks = 0
  reward.addEventListener('click', (event) => {
    event.preventDefault()
    clicks += 1
  })
  sidebar.append(promotion)
  const remotePromotion = `
    <section class="sidebar-card sidebar-promotions-card">
      <a href="#remote-reward" data-sidebar-promotions-ad-link="1">领取奖励</a>
      <form data-sidebar-promotions-click-form hidden></form>
    </section>`
  const remoteTopic = topicHtml.replace(/<\/main>/i, `<aside class="sidebar">${remotePromotion}</aside></main>`)
  stubHtmlFetch(w, (url) => /\/topic\/1/.test(String(url)) ? remoteTopic : homeHtml)
  await loadBase(w, PLUG('skin.user.js'))

  try {
    const link = w.document.createElement('a')
    link.href = 'https://linux.sb/topic/1'
    w.document.querySelector('main.wrap').append(link)
    link.click()
    assert.equal(await until(() => w.location.pathname === '/topic/1' && !!w.document.querySelector('.topic-post-list')), true)

    w.document.querySelector('[data-canvas-open="tool-sheet"]').click()
    w.document.querySelector('[data-tool-action="site-card"]').click()
    const site = w.document.querySelector('[data-surface="site-card"] [data-canvas-site-sidebar]')
    assert.equal(await until(() => site?.contains(promotion)), true,
      '打开帖子页站点信息时应迁入首页原生广告节点')
    assert.strictEqual(site?.querySelector('.sidebar-promotions-card'), promotion,
      '帖子页不能使用响应中未初始化的广告副本')
    assert.equal(reward.style.getPropertyValue('--sidebar-promotion-background'), '#2c72ce')
    reward.click()
    await tick(0)
    assert.equal(clicks, 1, '帖子页保留的首页广告领取监听必须继续生效')
  } finally {
    w.LSB.disable('skin')
    w.close()
  }
})

test('帖子软跳保留首页原生广告节点及其站点处理', async () => {
  const { w, tick, until } = makeTopicSpaHome()
  Object.defineProperty(w, 'innerWidth', { configurable: true, value: 1200 })
  const sidebar = w.document.querySelector('aside.sidebar')
  assert.ok(sidebar, '首页应有原生右栏宿主')

  const hot = sidebar.querySelector('.daily-hot-topics-card')
  assert.ok(hot, '首页应有原生每日热帖节点')
  hot.innerHTML = '<div class="quick-wrap"><div class="daily-hot-topics-head"><div class="quick-title">每日热帖</div></div></div>'

  const promotion = w.document.createElement('section')
  promotion.className = 'sidebar-card sidebar-promotions-card'
  promotion.dataset.sidebarPromotionsBoard = 'user_sidebar'
  promotion.innerHTML = `
    <div class="sidebar-promotions-wrap" data-sidebar-promotions-wrap>
      <a class="sidebar-promotions-slot sidebar-promotions-slot-text"
        href="#reward" data-sidebar-promotions-ad-link="1"
        data-sidebar-promotions-lottery-slot="1" data-promotion-id="home-reward"
        data-sidebar-promotions-order-id="7"
        data-sidebar-promotions-text-color="#ffffff"
        data-sidebar-promotions-text-background="#2c72ce"
        style="--sidebar-promotion-text:#ffffff;--sidebar-promotion-background:#2c72ce">领取奖励</a>
      <span data-sidebar-promotions-reward-status></span>
      <form method="post" action="/promotions_click" data-sidebar-promotions-click-form hidden>
        <input type="hidden" name="_csrf" value="csrf">
      </form>
    </div>`
  const reward = promotion.querySelector('[data-sidebar-promotions-ad-link]')
  let promotionClicks = 0
  reward.addEventListener('click', (event) => {
    event.preventDefault()
    promotionClicks += 1
  })
  sidebar.append(promotion)

  const remotePromotion = `
    <section class="sidebar-card sidebar-promotions-card" data-sidebar-promotions-board="user_sidebar">
      <div class="sidebar-promotions-wrap" data-sidebar-promotions-wrap>
        <a class="sidebar-promotions-slot sidebar-promotions-slot-text"
          href="#remote-reward" data-sidebar-promotions-ad-link="1"
          data-sidebar-promotions-lottery-slot="1" data-promotion-id="remote-reward"
          data-sidebar-promotions-order-id="7"
          data-sidebar-promotions-text-color="#ffffff"
          data-sidebar-promotions-text-background="#2c72ce">领取奖励</a>
        <span data-sidebar-promotions-reward-status></span>
        <form method="post" action="/promotions_click" data-sidebar-promotions-click-form hidden>
          <input type="hidden" name="_csrf" value="csrf">
        </form>
      </div>
    </section>`
  const remoteTopic = topicHtml.replace(/<\/main>/i, `<aside class="sidebar">${remotePromotion}</aside></main>`)
  stubHtmlFetch(w, (url) => /\/topic\/1/.test(String(url)) ? remoteTopic : homeHtml)
  await loadBase(w, PLUG('skin.user.js'))

  try {
    const siteInfo = w.document.querySelector('[data-canvas-site-status-body]')
    assert.equal(await until(() => siteInfo?.contains(promotion) && siteInfo?.contains(hot)), true,
      '初始首页应迁移真实广告和每日热帖节点')

  const link = w.document.createElement('a')
  link.href = 'https://linux.sb/topic/1'
  w.document.querySelector('main.wrap').append(link)
  link.click()
  assert.equal(await until(() => w.location.pathname === '/topic/1' && !!w.document.querySelector('.topic-post-list')), true)

  const topicPromotion = w.document.querySelector('[data-canvas-site-status-body] .sidebar-promotions-card')
  const topicHot = w.document.querySelector('[data-canvas-site-status-body] .daily-hot-topics-card')
  assert.strictEqual(topicPromotion, promotion, '帖子软跳应继续使用首页原生广告节点')
  assert.strictEqual(topicHot, hot, '帖子软跳应继续使用首页原生每日热帖节点')
  assert.equal(reward.style.getPropertyValue('--sidebar-promotion-text'), '#ffffff')
  assert.equal(reward.style.getPropertyValue('--sidebar-promotion-background'), '#2c72ce')
  topicPromotion.querySelector('[data-sidebar-promotions-ad-link]').click()
  await tick(0)
  assert.equal(promotionClicks, 1, '原生广告节点上的站点领取监听必须保留')
  assert.ok(topicPromotion.querySelector('[data-sidebar-promotions-click-form]'), '领取表单结构必须保留')

  w.document.querySelector('[data-canvas-home]').click()
  assert.equal(await until(() => w.location.pathname === '/' && !!w.document.querySelector('.home-shell')), true)
  assert.strictEqual(w.document.querySelector('[data-canvas-site-status-body] .sidebar-promotions-card'), promotion,
    '返回首页后应恢复同一个原生广告节点')
    assert.strictEqual(w.document.querySelector('[data-canvas-site-status-body] .daily-hot-topics-card'), hot,
      '返回首页后应恢复同一个原生每日热帖节点')
    w.LSB.disable('skin')
    assert.equal(promotion.parentElement?.matches('aside.sidebar'), true, '关闭界面精修后广告节点应回到原生右栏')
    assert.equal(hot.parentElement?.matches('aside.sidebar'), true, '关闭界面精修后每日热帖节点应回到原生右栏')
  } finally {
    w.LSB.disable('skin')
  }
})

test('中等视口关闭帖子站点信息后返回首页仍恢复持久右栏', async () => {
  const { w, until } = makeTopicSpaHome()
  Object.defineProperty(w, 'innerWidth', { configurable: true, value: 860 })
  stubHtmlFetch(w, topicHtml)
  const sidebar = w.document.querySelector('aside.sidebar')
  const hot = sidebar.querySelector('.daily-hot-topics-card')
  const promotion = w.document.createElement('section')
  promotion.className = 'sidebar-card sidebar-promotions-card'
  promotion.innerHTML = '<a data-sidebar-promotions-ad-link="1" style="--sidebar-promotion-text:#fff;--sidebar-promotion-background:#2c72ce">领取奖励</a>'
  sidebar.append(promotion)
  await loadBase(w, PLUG('skin.user.js'))

  try {
    const siteInfo = w.document.querySelector('[data-surface="site-card"] [data-canvas-site-sidebar]')
    assert.equal(await until(() => siteInfo?.contains(hot) && siteInfo?.contains(promotion)), true)
    const link = w.document.createElement('a')
    link.href = 'https://linux.sb/topic/1'
    w.document.querySelector('main.wrap').append(link)
    link.click()
    assert.equal(await until(() => w.location.pathname === '/topic/1' && !!w.document.querySelector('.topic-post-list')), true)

    w.document.querySelector('[data-canvas-open="tool-sheet"]')?.click()
    w.document.querySelector('[data-tool-action="site-card"]')?.click()
    assert.equal(await until(() => siteInfo?.contains(promotion)), true,
      '帖子页站点信息应继续显示首页原生广告')
    siteInfo.closest('[data-surface="site-card"]')?.querySelector('[data-canvas-close]')?.click()
    w.document.querySelector('[data-canvas-home]')?.click()
    assert.equal(await until(() => w.location.pathname === '/' && !!w.document.querySelector('.home-shell')), true,
      '帖子页关闭站点信息后仍应能软跳回首页')
    assert.equal(await until(() => siteInfo?.contains(hot) && siteInfo?.contains(promotion)), true,
      '关闭中等视口站点信息后返回首页不能丢失每日热帖和广告')
  } finally {
    w.LSB.disable('skin')
  }
})

test('浏览器后退回首页后仍恢复同一组每日热帖和广告节点', async () => {
  const { w, until } = makeTopicSpaHome()
  Object.defineProperty(w, 'innerWidth', { configurable: true, value: 1200 })
  stubHtmlFetch(w, topicHtml)
  const sidebar = w.document.querySelector('aside.sidebar')
  const hot = sidebar.querySelector('.daily-hot-topics-card')
  const promotion = w.document.createElement('section')
  promotion.className = 'sidebar-card sidebar-promotions-card'
  promotion.innerHTML = '<a data-sidebar-promotions-ad-link="1" style="--sidebar-promotion-text:#fff;--sidebar-promotion-background:#2c72ce">领取奖励</a>'
  sidebar.append(promotion)
  await loadBase(w, PLUG('skin.user.js'))

  try {
    const siteInfo = w.document.querySelector('[data-canvas-site-status-body]')
    assert.equal(await until(() => siteInfo?.contains(hot) && siteInfo?.contains(promotion)), true)
    const link = w.document.createElement('a')
    link.href = 'https://linux.sb/topic/1'
    w.document.querySelector('main.wrap').append(link)
    link.click()
    assert.equal(await until(() => w.location.pathname === '/topic/1' && !!w.document.querySelector('.topic-post-list')), true)

    w.history.back()
    assert.equal(await until(() => w.location.pathname === '/' && !!w.document.querySelector('.home-shell')), true,
      '浏览器后退应恢复首页正文')
    assert.equal(await until(() => siteInfo?.contains(hot) && siteInfo?.contains(promotion)), true,
      '浏览器后退回首页后应恢复持久右栏卡片')
  } finally {
    w.LSB.disable('skin')
  }
})
test('软跳前刚插入的混合广告卡片仍保留原生节点与领取处理', async () => {
  const { w, until, tick } = makeTopicSpaHome()
  Object.defineProperty(w, 'innerWidth', { configurable: true, value: 860 })
  const sidebar = w.document.querySelector('aside.sidebar')
  const promotion = w.document.createElement('section')
  promotion.className = 'sidebar-card sidebar-promotions-card'
  promotion.dataset.sidebarPromotionsBoard = 'user_sidebar'
  promotion.innerHTML = `
    <div class="sidebar-promotions-wrap" data-sidebar-promotions-wrap>
      <div class="sidebar-promotions-image-slots">
        <a class="sidebar-promotions-slot sidebar-promotions-slot-image"
          href="#image-reward" data-sidebar-promotions-ad-link="1" data-promotion-id="home-image">
          <img src="/image.jpg" alt="图片广告">
        </a>
      </div>
      <div class="sidebar-promotions-text-slots">
        <a class="sidebar-promotions-slot sidebar-promotions-slot-text"
          href="#reward" data-sidebar-promotions-ad-link="1" data-sidebar-promotions-lottery-slot="1"
          data-promotion-id="home-text" data-sidebar-promotions-text-color="#ffffff"
          data-sidebar-promotions-text-background="#2c72ce"
          style="--sidebar-promotion-text:#ffffff;--sidebar-promotion-background:#2c72ce">领取奖励</a>
      </div>
      <form data-sidebar-promotions-click-form hidden></form>
    </div>`
  const reward = promotion.querySelector('[data-promotion-id="home-text"]')
  let clicks = 0
  reward.addEventListener('click', (event) => {
    event.preventDefault()
    clicks += 1
  })

  const remotePromotion = `
    <section class="sidebar-card sidebar-promotions-card" data-sidebar-promotions-board="user_sidebar">
      <div class="sidebar-promotions-wrap" data-sidebar-promotions-wrap>
        <div class="sidebar-promotions-image-slots">
          <a class="sidebar-promotions-slot sidebar-promotions-slot-image"
            href="#remote-image" data-sidebar-promotions-ad-link="1" data-promotion-id="remote-image">
            <img src="/remote-image.jpg" alt="图片广告">
          </a>
        </div>
        <div class="sidebar-promotions-text-slots">
          <a class="sidebar-promotions-slot sidebar-promotions-slot-text"
            href="#remote-reward" data-sidebar-promotions-ad-link="1" data-sidebar-promotions-lottery-slot="1"
            data-promotion-id="remote-text" data-sidebar-promotions-text-color="#ffffff"
            data-sidebar-promotions-text-background="#2c72ce">领取奖励</a>
        </div>
        <form data-sidebar-promotions-click-form hidden></form>
      </div>
    </section>`
  const remoteTopic = topicHtml.replace(/<\/main>/i, `<aside class="sidebar">${remotePromotion}</aside></main>`)
  stubHtmlFetch(w, remoteTopic)
  await loadBase(w, PLUG('skin.user.js'))

  try {
    const siteInfo = w.document.querySelector('[data-surface="site-card"] [data-canvas-site-sidebar]')
    sidebar.append(promotion)
    w.document.querySelector('[data-canvas-open="tool-sheet"]')?.click()
    w.document.querySelector('[data-tool-action="site-card"]')?.click()
    assert.equal(await until(() => siteInfo?.contains(promotion)), true,
      '首页打开站点信息时应迁入原生混合广告卡片')
    w.document.querySelector('[data-surface="site-card"] [data-canvas-close]')?.click()
    const link = w.document.createElement('a')
    link.href = 'https://linux.sb/topic/1'
    w.document.querySelector('main.wrap').append(link)
    link.click()
    assert.equal(await until(() => w.location.pathname === '/topic/1' && !!w.document.querySelector('.topic-post-list')), true)
    w.document.querySelector('[data-canvas-open="tool-sheet"]')?.click()
    w.document.querySelector('[data-tool-action="site-card"]')?.click()
    assert.equal(await until(() => siteInfo?.querySelector('.sidebar-promotions-card')), true)

    assert.strictEqual(siteInfo?.querySelector('.sidebar-promotions-card'), promotion,
      '软跳应使用刚出现的首页原生混合广告卡片')
    assert.equal(w.document.querySelectorAll('.sidebar-promotions-card').length, 1,
      '软跳后不能把响应中的广告副本留在文档中')
    assert.equal(reward.style.getPropertyValue('--sidebar-promotion-background'), '#2c72ce',
      '图片广告缺少文字变量时不应误判并丢失文字广告样式')
    assert.ok(siteInfo?.querySelector('[data-sidebar-promotions-click-form]'), '原生领取表单必须保留')
    reward.click()
    await tick(0)
    assert.equal(clicks, 1, '首页原生广告领取监听必须保留')
  } finally {
    w.LSB.disable('skin')
  }
})

test('软跳期间原生侧栏重建后仍接管初始化广告与每日热帖', async () => {
  const { w, until, tick } = makeTopicSpaHome()
  Object.defineProperty(w, 'innerWidth', { configurable: true, value: 860 })
  const sidebar = w.document.querySelector('aside.sidebar')
  const hot = sidebar.querySelector('.daily-hot-topics-card')
  const promotion = w.document.createElement('section')
  promotion.className = 'sidebar-card sidebar-promotions-card'
  promotion.innerHTML = `
    <a class="sidebar-promotions-slot sidebar-promotions-slot-image"
      data-sidebar-promotions-ad-link="1" data-promotion-id="image-ad"><img src="/image.jpg" alt="图片广告"></a>
    <a class="sidebar-promotions-slot sidebar-promotions-slot-text"
      data-sidebar-promotions-ad-link="1" data-sidebar-promotions-lottery-slot="1"
      style="--sidebar-promotion-text:#fff;--sidebar-promotion-background:#2c72ce">领取奖励</a>`
  let clicks = 0
  promotion.querySelector('.sidebar-promotions-slot-text').addEventListener('click', (event) => {
    event.preventDefault()
    clicks += 1
  })
  sidebar.append(promotion)
  stubHtmlFetch(w, topicHtml)
  await loadBase(w, PLUG('skin.user.js'))

  try {
    const siteInfo = w.document.querySelector('[data-surface="site-card"] [data-canvas-site-sidebar]')
    assert.equal(await until(() => siteInfo?.contains(hot) && siteInfo?.contains(promotion)), true)
    const link = w.document.createElement('a')
    link.href = 'https://linux.sb/topic/1'
    w.document.querySelector('main.wrap').append(link)
    link.click()
    assert.equal(await until(() => w.location.pathname === '/topic/1' && !!w.document.querySelector('.topic-post-list')), true)

    hot.remove()
    promotion.remove()
    w.document.querySelector('[data-canvas-home]')?.click()
    assert.equal(await until(() => w.location.pathname === '/' && !!w.document.querySelector('.home-shell')), true)
    const replacementHot = hot.cloneNode(true)
    const replacementPromotion = promotion.cloneNode(true)
    const replacementReward = replacementPromotion.querySelector('.sidebar-promotions-slot-text')
    replacementReward.removeAttribute('style')
    sidebar.append(replacementHot, replacementPromotion)
    replacementReward.setAttribute('style', '--sidebar-promotion-text:#fff;--sidebar-promotion-background:#2c72ce')
    replacementReward.addEventListener('click', (event) => {
      event.preventDefault()
      clicks += 1
    })
    assert.equal(await until(() => siteInfo?.contains(replacementHot) && siteInfo?.contains(replacementPromotion)), true,
      '原生侧栏重建后新的每日热帖和混合广告仍应迁入画布')
    replacementReward.click()
    await tick(0)
    assert.equal(clicks, 1, '重建后的原生广告领取监听必须保留')

    const repeatLink = w.document.createElement('a')
    repeatLink.href = 'https://linux.sb/topic/1'
    w.document.querySelector('main.wrap').append(repeatLink)
    repeatLink.click()
    assert.equal(await until(() => w.location.pathname === '/topic/1' && !!w.document.querySelector('.topic-post-list')), true)
    replacementHot.remove()
    replacementPromotion.remove()
    w.document.querySelector('[data-canvas-home]')?.click()
    assert.equal(await until(() => w.location.pathname === '/' && !!w.document.querySelector('.home-shell')), true)
    const secondHot = replacementHot.cloneNode(true)
    const secondPromotion = replacementPromotion.cloneNode(true)
    const secondReward = secondPromotion.querySelector('.sidebar-promotions-slot-text')
    secondReward.addEventListener('click', (event) => {
      event.preventDefault()
      clicks += 1
    })
    sidebar.append(secondHot, secondPromotion)
    assert.equal(await until(() => siteInfo?.contains(secondHot) && siteInfo?.contains(secondPromotion)), true,
      '第二次软跳后重建的每日热帖和广告仍应回到画布')
    secondReward.click()
    await tick(0)
    assert.equal(clicks, 2, '第二次软跳后的广告领取监听必须保留')
  } finally {
    w.LSB.disable('skin')
  }
})

test('首页与帖子软跳后异步插入的每日热帖和广告卡片仍迁入右栏', async () => {
  const { w, until } = makeTopicSpaHome()
  Object.defineProperty(w, 'innerWidth', { configurable: true, value: 1200 })
  stubHtmlFetch(w, topicHtml)
  await loadBase(w, PLUG('skin.user.js'))

  try {
    const link = w.document.createElement('a')
    link.href = 'https://linux.sb/topic/1'
    w.document.querySelector('main.wrap').append(link)
    link.click()
    assert.equal(await until(() => w.location.pathname === '/topic/1' && !!w.document.querySelector('.topic-post-list')), true)

    const sidebar = w.document.querySelector('aside.sidebar')
    const hot = w.document.createElement('section')
    hot.className = 'sidebar-card daily-hot-topics-card'
    hot.textContent = '每日热帖：软跳后异步内容'
    const promotion = w.document.createElement('section')
    promotion.className = 'sidebar-card sidebar-promotions-card'
    promotion.textContent = '广告：软跳后异步内容'
    sidebar.append(hot, promotion)

    const siteInfo = w.document.querySelector('[data-canvas-site-status-body]')
    assert.equal(await until(() => siteInfo?.contains(hot) && siteInfo?.contains(promotion), 300), true,
      '软跳后新增的热帖和广告卡片应自动迁入界面精修右栏')

    w.document.querySelector('[data-canvas-home]').click()
    assert.equal(await until(() => w.location.pathname === '/' && !!w.document.querySelector('.home-shell')), true,
      '帖子页应能软跳回首页')
    const homeSidebar = w.document.querySelector('aside.sidebar')
    const homeHot = w.document.createElement('section')
    homeHot.className = 'sidebar-card daily-hot-topics-card'
    homeHot.textContent = '每日热帖：首页异步内容'
    const homePromotion = w.document.createElement('section')
    homePromotion.className = 'sidebar-card sidebar-promotions-card'
    homePromotion.textContent = '广告：首页异步内容'
    homeSidebar.append(homeHot, homePromotion)
    assert.equal(await until(() => siteInfo?.contains(homeHot) && siteInfo?.contains(homePromotion), 300), true,
      '软跳回首页后新增的热帖和广告卡片也应迁入界面精修右栏')
  } finally {
    w.LSB.disable('skin')
  }
})

test('软跳提交后重建正文原生控件生命周期', async () => {
  const { w, until } = makeTopicSpaHome()
  const remote = topicHtml.replace(
    /<main\b[^>]*>/i,
    (match) => `${match}<button type="button" data-native-route-control>原生操作</button>`,
  )
  stubHtmlFetch(w, remote)
  w.__nativeRouteControlClicks = 0
  const rebindNativeRouteControl = () => {
    const control = w.document.querySelector('[data-native-route-control]')
    if (!control || control.dataset.nativeRouteControlBound === '1') return
    control.dataset.nativeRouteControlBound = '1'
    control.addEventListener('click', () => { w.__nativeRouteControlClicks += 1 })
  }
  w.document.addEventListener('lsb:route-committed', rebindNativeRouteControl)
  const initialControl = w.document.createElement('button')
  initialControl.type = 'button'
  initialControl.dataset.nativeRouteControl = ''
  initialControl.textContent = '原生操作'
  const outlet = w.document.querySelector('main.wrap')
  outlet.prepend(initialControl)
  rebindNativeRouteControl()
  await loadBase(w, PLUG('skin.user.js'))

  const link = w.document.createElement('a')
  link.href = 'https://linux.sb/topic/1'
  outlet.append(link)
  link.click()
  assert.equal(await until(() => w.location.pathname === '/topic/1' && !!w.document.querySelector('[data-native-route-control]')), true)

  w.document.querySelector('[data-native-route-control]').click()
  assert.equal(w.__nativeRouteControlClicks, 1, '软跳换入的正文控件应在提交后重新绑定')
})

test('软跳提交后按新路由重建壳内路由增强', async () => {
  const { w, until } = makeTopicSpaHome()
  stubHtmlFetch(w, topicHtml)
  await loadBase(w, PLUG('skin.user.js'))

  const link = w.document.createElement('a')
  link.href = 'https://linux.sb/topic/1'
  w.document.querySelector('main.wrap').append(link)
  link.click()
  assert.equal(await until(() => w.location.pathname === '/topic/1' && !!w.document.querySelector('.topic-post-list')), true)

  const debug = await w.LSB.bus.request('skin:debug')
  assert.equal(debug.shell.location, 'LINUX SB上线 更新的理想型社区')
  assert.equal(w.document.documentElement.classList.contains('lsb-skin-shell-topic'), true)
  assert.equal(w.document.documentElement.classList.contains('lsb-canvas-page-topic'), true)
})

test('软跳后重建原生评论对话树', async () => {
  const { w, until } = makeTopicSpaHome()
  const remote = topicHtml
    .replace(
      '<ul class="post-list topic-post-list">',
      '<ul class="post-list topic-post-list" data-native-thread-source="1">',
    )
    .replace(
      '<li class="post-item post-entry" id="post-24" data-floor="2">',
      '<li class="post-item post-entry" id="post-24" data-floor="2" data-quote-threads-parent-floor="1">',
    )
    .replace(
      '<li class="post-item post-entry" id="post-32" data-floor="3">',
      '<li class="post-item post-entry" id="post-32" data-floor="3" data-quote-threads-parent-floor="2">',
    )
    .replace(
      '<li class="post-item post-entry" id="post-30" data-floor="4">',
      '<li class="post-item post-entry" id="post-30" data-floor="4" data-quote-threads-parent-floor="3">',
    )
  stubHtmlFetch(w, remote)
  await loadBase(w, PLUG('skin.user.js'))

  const link = w.document.createElement('a')
  link.href = 'https://linux.sb/topic/1'
  w.document.querySelector('main.wrap').append(link)
  link.click()
  assert.equal(await until(() => w.location.pathname === '/topic/1' && !!w.document.querySelector('[data-native-thread-source]')), true)

  const list = w.document.querySelector('ul.topic-post-list')
  assert.equal(list.dataset.quoteThreadsCollapseReady, '1', '软跳后应重建原生对话树标记')
  assert.equal(list.querySelectorAll('.quote-threads-thread-item').length >= 4, true, '软跳后应恢复原生讨论串节点')
  assert.equal(list.querySelector('.quote-threads-child[data-floor="2"]')?.getAttribute('data-quote-threads-parent-floor'), '1')
})

test('软跳后发卡和抽奖帖的人机验证占位完成初始化', async () => {
  const { w, until } = makeTopicSpaHome()
  const cap = (kind) => `
    <section class="${kind}-box">
      <form>
        <div class="cap-verification-widget" data-cap-verification
          data-cap-widget-script="https://c.linux.sb/assets/widget.js"
          data-cap-wasm-url="https://c.linux.sb/assets/cap_wasm_bg.wasm">
          <cap-widget required data-cap-api-endpoint="https://c.linux.sb/f741c09d00/" data-cap-hidden-field-name="cap_token"></cap-widget>
          <p data-cap-verification-status>正在加载人机验证…</p>
        </div>
      </form>
    </section>`
  const remote = topicHtml.replace('<form class="ajax-reply-form"', `${cap('virtual-card')}\n${cap('gacha')}\n<form class="ajax-reply-form"`)
  stubHtmlFetch(w, remote)
  if (!w.customElements.get('cap-widget')) w.customElements.define('cap-widget', class extends w.HTMLElement {})
  w.__capVerificationWidgetPromise = Promise.resolve()
  await loadBase(w, PLUG('skin.user.js'))

  const link = w.document.createElement('a')
  link.href = 'https://linux.sb/topic/1'
  w.document.querySelector('main.wrap').append(link)
  link.click()
  assert.equal(await until(() => w.location.pathname === '/topic/1' && !!w.document.querySelector('.virtual-card-box')), true)
  assert.equal(await until(() => [...w.document.querySelectorAll('[data-cap-verification]')].every((root) =>
    root.dataset.capVerificationBound === '1'
    && root.querySelector('[data-cap-verification-status]')?.textContent === '人机验证已加载，请完成验证。'
  )), true, '发卡和抽奖帖子软跳后都应结束人机验证加载占位')
})

test('软跳后重新准备正文人机验证控件', async () => {
  const { w, until } = makeTopicSpaHome()
  const captcha = '<div data-native-captcha data-pow-required="0" data-pow-generation="1"><span class="native-captcha-question">请输入验证答案</span><input type="hidden" name="native_captcha_token" value="token"><input type="hidden" name="native_captcha_pow"><input name="native_captcha_answer"><span data-native-captcha-status></span><button type="button" data-native-captcha-refresh data-url="/native-captcha">刷新</button></div>'
  const remote = topicHtml.replace('<form class="ajax-reply-form"', `${captcha}<form class="ajax-reply-form"`)
  stubHtmlFetch(w, remote)
  await loadBase(w, PLUG('skin.user.js'))

  const link = w.document.createElement('a')
  link.href = 'https://linux.sb/topic/1'
  w.document.querySelector('main.wrap').append(link)
  link.click()
  assert.equal(await until(() => w.location.pathname === '/topic/1' && !!w.document.querySelector('[data-native-captcha]')), true)

  const widget = w.document.querySelector('[data-native-captcha]')
  assert.equal(widget.hidden, false)
  assert.notEqual(w.getComputedStyle(widget).display, 'none')
  assert.equal(widget.querySelector('[data-native-captcha-status]').textContent, '微信浏览器已免除浏览器校验')
})

test('软跳后原生对话树补齐回复引用并规范化楼层链接', async () => {
  const { w, until } = makeTopicSpaHome()
  const remote = topicHtml
    .replace(
      '<li class="post-item post-entry" id="post-24" data-floor="2">',
      '<li class="post-item post-entry" id="post-24" data-floor="2" data-quote-threads-parent-floor="1">',
    )
    .replace(
      '<li class="post-item post-entry" id="post-32" data-floor="3">',
      '<li class="post-item post-entry" id="post-32" data-floor="3" data-quote-threads-parent-floor="2">',
    )
    .replace(
      '<li class="post-item post-entry" id="post-30" data-floor="4">',
      '<li class="post-item post-entry" id="post-30" data-floor="4" data-quote-threads-parent-floor="3">',
    )
    .replace(
      '<div class="post-content"><p>顶你个肺~</p></div>',
      '<div class="post-content"><p><a href="/topic/1?floor=1">@韩信 #1</a> 顶你个肺~</p></div>',
    )
  stubHtmlFetch(w, remote)
  await loadBase(w, PLUG('skin.user.js'))

  const link = w.document.createElement('a')
  link.href = 'https://linux.sb/topic/1'
  w.document.querySelector('main.wrap').append(link)
  link.click()
  assert.equal(await until(() => w.location.pathname === '/topic/1' && !!w.document.querySelector('[data-quote-threads-parent-floor]')), true)

  const child = w.document.querySelector('#post-24')
  assert.equal(child.querySelector('.quote-threads-reference')?.textContent, '回复 #1', '软跳后应补齐原生回复楼层标记')
  assert.equal(child.querySelector('.post-content a')?.getAttribute('href'), 'https://linux.sb/topic/1?replyid=21', '引用楼层链接应规范化为 replyid')
  assert.equal(child.querySelector('.post-floor')?.getAttribute('href'), 'https://linux.sb/topic/1?replyid=24', '自身楼层链接应规范化为当前回复 replyid')
})

test('软跳后延迟插入的人机验证自动准备', async () => {
  const { w, until } = makeTopicSpaHome()
  stubHtmlFetch(w, topicHtml)
  await loadBase(w, PLUG('skin.user.js'))

  const link = w.document.createElement('a')
  link.href = 'https://linux.sb/topic/1'
  w.document.querySelector('main.wrap').append(link)
  link.click()
  assert.equal(await until(() => w.location.pathname === '/topic/1' && !!w.document.querySelector('form.ajax-reply-form')), true)

  const form = w.document.querySelector('form.ajax-reply-form')
  const captcha = w.document.createElement('div')
  captcha.dataset.nativeCaptcha = ''
  captcha.dataset.powRequired = '0'
  captcha.dataset.powGeneration = '1'
  captcha.innerHTML = '<span class="native-captcha-question">请输入验证答案</span><input type="hidden" name="native_captcha_token" value="token"><input type="hidden" name="native_captcha_pow"><input name="native_captcha_answer"><span data-native-captcha-status></span><button type="button" data-native-captcha-refresh data-url="/native-captcha">刷新</button>'
  form.prepend(captcha)

  assert.equal(await until(() => captcha.querySelector('[data-native-captcha-status]')?.textContent === '微信浏览器已免除浏览器校验', 1000, 10), true, '软跳后晚于提交阶段插入的验证码也应自动准备')
})

test('原生回复保存事件在软跳正文中重建对话树关系', async () => {
  const { w, until } = makeTopicSpaHome()
  stubHtmlFetch(w, topicHtml)
  await loadBase(w, PLUG('skin.user.js'))

  const link = w.document.createElement('a')
  link.href = 'https://linux.sb/topic/1'
  w.document.querySelector('main.wrap').append(link)
  link.click()
  assert.equal(await until(() => w.location.pathname === '/topic/1' && !!w.document.querySelector('ul.topic-post-list')), true)

  const form = w.document.createElement('form')
  form.className = 'ajax-reply-form'
  form.method = 'post'
  form.innerHTML = '<textarea name="body">@韩信 #1 新回复</textarea>'
  w.document.body.append(form)
  form.dispatchEvent(new w.Event('submit', { bubbles: true, cancelable: true }))

  const reply = w.document.createElement('li')
  reply.className = 'post-item post-entry'
  reply.id = 'post-999'
  reply.dataset.floor = '99'
  reply.innerHTML = '<div class="post-meta"></div><div class="post-content"><p>新回复</p></div>'
  w.document.querySelector('ul.topic-post-list').append(reply)
  w.document.dispatchEvent(new w.CustomEvent('bbs1:reply-saved', { detail: { form, reply } }))

  assert.equal(await until(() => reply.dataset.quoteThreadsParentFloor === '1' && !!reply.querySelector('.quote-threads-reference')), true, '回复保存后应立即保留父楼层关系和引用标记')
})

test('帖子软跳首次迁移默认开启', async () => {
  const { w, tick } = makeHome()
  const calls = stubHtmlFetch(w, topicHtml)
  await loadBase(w, PLUG('skin.user.js'))
  const saved = JSON.parse(w.localStorage.getItem('lsb_base:skin:__config'))
  assert.equal(saved.topicSpa, true, '首次运行将旧默认升级为帖子软跳开启')
  assert.equal(JSON.parse(w.localStorage.getItem(
    'lsb_base:skin:topicSpaNewWorldDefaultMigrationV1',
  )), true, '首次升级只写入一次迁移标记')

  const link = w.document.createElement('a')
  link.href = 'https://linux.sb/topic/1'
  w.document.querySelector('main.wrap').append(link)
  link.click()
  await tick(40)
  assert.ok(calls.some((url) => /\/topic\/1/.test(url)), '默认帖子阅读通过同源软跳请求')
})

test('旧版已保存的帖子软跳配置经新迁移键升级为开启', async () => {
  const { w, tick } = makeHome({
    'lsb_base:skin:__config': { topicSpa: false },
    'lsb_base:skin:topicSpaNativeLifecycleMigration': true,
  })
  const calls = stubHtmlFetch(w, topicHtml)
  await loadBase(w, PLUG('skin.user.js'))
  const link = w.document.createElement('a')
  link.href = 'https://linux.sb/topic/1'
  w.document.querySelector('main.wrap').append(link)
  link.click()
  await tick(40)
  assert.equal(JSON.parse(w.localStorage.getItem('lsb_base:skin:__config')).topicSpa, true)
  assert.equal(JSON.parse(w.localStorage.getItem(
    'lsb_base:skin:topicSpaNewWorldDefaultMigrationV1',
  )), true)
  assert.ok(calls.some((url) => /\/topic\/1/.test(url)), '旧版关闭值不应覆盖新默认迁移')
})

test('软跳仅显示顶部进度线且不覆盖正文交互', async () => {
  const { w, tick, until } = makeTopicSpaHome()
  const flow = deferredHtmlFetch(w, topicHtml)
  const finishDelays = []
  const nativeSetTimeout = w.setTimeout.bind(w)
  w.setTimeout = (callback, delay, ...args) => {
    if (delay === 160 || delay === 220) finishDelays.push(delay)
    return nativeSetTimeout(callback, delay, ...args)
  }
  await loadBase(w, PLUG('skin.user.js'))
  const outlet = w.document.querySelector('main.wrap')
  const oldList = outlet.querySelector('ul.post-list')
  const link = w.document.createElement('a')
  link.href = 'https://linux.sb/topic/1'
  outlet.append(link)
  link.click()
  await tick(0)

  const progress = w.document.getElementById('lsb-shell-progress')
  assert.ok(progress)
  assert.strictEqual(w.document.querySelector('main.wrap'), outlet)
  assert.ok(oldList.isConnected, '请求等待期间旧正文仍连接')
  assert.equal(w.document.getElementById('lsb-shell-route-transition'), null)
  assert.equal(progress.dataset.phase, 'idle', '90ms 内不闪现进度线')
  assert.equal(w.getComputedStyle(progress).height, '3px')
  assert.equal(w.getComputedStyle(progress).pointerEvents, 'none')
  await tick(100)
  assert.equal(progress.dataset.phase, 'loading', '慢请求显示顶部进度线')
  assert.equal(w.getComputedStyle(progress).opacity, '1')

  flow.resolveNext()
  assert.equal(await until(() => progress.dataset.phase === 'done', 1000, 2), true)
  assert.ok(finishDelays.includes(220), '完成态应按 220ms 延迟收起')
  assert.equal(await until(() => progress.dataset.phase === 'idle', 1000, 10), true)
})

test('壳内跳转：帖子请求期间保留旧正文和画布节点', async () => {
  const { w, tick } = makeTopicSpaHome()
  const flow = deferredHtmlFetch(w, topicHtml)
  await loadBase(w, PLUG('skin.user.js'))

  const shellNode = w.document.getElementById('lsb-shell')
  const outlet = w.document.querySelector('main.wrap')
  const oldList = outlet.querySelector('ul.post-list')
  const topStatus = w.document.querySelector('[data-surface="top-status"]')
  const toolCapsule = w.document.querySelector('[data-surface="tool-capsule"]')
  const link = w.document.createElement('a')
  link.href = 'https://linux.sb/topic/1'
  outlet.append(link)
  link.click()
  await tick(0)

  assert.equal(w.document.documentElement.dataset.lsbRoutePhase, 'fetching')
  assert.equal(outlet.getAttribute('aria-busy'), 'true')
  assert.equal(w.document.getElementById('lsb-shell'), shellNode)
  assert.equal(w.document.querySelector('[data-surface="top-status"]'), topStatus)
  assert.equal(w.document.querySelector('[data-surface="tool-capsule"]'), toolCapsule)
  assert.equal(w.document.querySelector('main.wrap'), outlet)
  assert.ok(oldList.isConnected, '请求未完成时旧列表仍然可见')
  assert.equal(w.document.querySelector('#lsb-shell-route-shield'), null)
  assert.ok(w.document.getElementById('lsb-shell-progress'))
  assert.equal(w.document.getElementById('lsb-shell-route-transition'), null)

  flow.resolveNext()
  await tick(120)
  assert.equal(w.location.pathname, '/topic/1')
  assert.ok(w.document.querySelector('.topic-post-list'))
  assert.equal(w.document.documentElement.dataset.lsbRoutePhase, undefined)
})
test('软跳事务期间页面级隐藏状态覆盖新挂载的原生顶栏和移动菜单，并在提交后收尾', async () => {
  const { w, tick } = makeTopicSpaHome()
  const flow = deferredHtmlFetch(w, topicHtml)
  await loadBase(w, PLUG('skin.user.js'))

  const shellNode = w.document.getElementById('lsb-shell')
  const outlet = w.document.querySelector('main.wrap')
  const oldList = outlet.querySelector('ul.post-list')
  const link = w.document.createElement('a')
  link.href = 'https://linux.sb/topic/1'
  outlet.append(link)
  link.click()
  await tick(0)

  const replacementHeader = w.document.createElement('div')
  replacementHeader.className = 'top'
  w.document.body.append(replacementHeader)
  const nativeMobileMenu = w.document.createElement('div')
  nativeMobileMenu.id = 'mobile-menu'
  nativeMobileMenu.className = 'mobile-menu-backdrop'
  w.document.body.append(nativeMobileMenu)

  assert.equal(w.getComputedStyle(replacementHeader).display, 'none', '事务期间重新挂载的原生顶栏必须实际不可见')
  assert.equal(w.getComputedStyle(nativeMobileMenu).display, 'none', '事务期间原生移动浮层必须实际不可见')
  assert.ok(w.document.documentElement.classList.contains('lsb-canvas-route-pending'), '请求期间保留页面级原生 UI 隐藏状态')
  assert.strictEqual(w.document.getElementById('lsb-shell'), shellNode, '事务期间复用同一颗氢壳')
  assert.strictEqual(w.document.querySelector('main.wrap'), outlet, '远端正文就绪前保留正文出口')
  assert.ok(oldList.isConnected, '远端正文就绪前旧正文仍在')

  flow.resolveNext()
  await tick(120)
  assert.equal(w.document.documentElement.classList.contains('lsb-canvas-route-pending'), false, '提交收尾后清理页面级隐藏状态')
  assert.ok(replacementHeader.classList.contains('lsb-native-header-hidden'), '提交后把新顶栏纳入常规氢壳隐藏状态')
  assert.ok(w.document.querySelector('.topic-post-list'), '远端正文已提交')
})
testReadingModes('停用皮肤会取消挂起软跳并清理页面级隐藏状态', async (uiMode) => {
  const { w, tick } = makeReadingHome(uiMode)
  const flow = deferredHtmlFetch(w, topicHtml)
  await loadBase(w, PLUG('skin.user.js'))

  const shellNode = w.document.getElementById('lsb-shell')
  const outlet = w.document.querySelector('main.wrap')
  const oldList = outlet.querySelector('ul.post-list')
  const link = w.document.createElement('a')
  link.href = 'https://linux.sb/topic/1'
  outlet.append(link)
  link.click()
  await tick(0)
  assert.ok(w.document.documentElement.classList.contains('lsb-canvas-route-pending'))

  w.LSB.disable('skin')
  await tick(20)
  assert.equal(flow.signals()[0]?.aborted, true, '停用必须中止当前网络请求')
  assert.equal(w.document.documentElement.classList.contains('lsb-canvas-route-pending'), false, '停用时立即清理页面级隐藏状态')
  assert.equal(outlet.hasAttribute('aria-busy'), false, '停用时清理正文的忙碌状态')
  assert.equal(w.document.getElementById('lsb-shell'), null, '停用后卸载氢壳')
  assert.ok(oldList.isConnected, '停用时不清空仍在显示的旧正文')

  flow.resolveNext()
  await tick(20)
  assert.equal(w.document.querySelector('main.wrap'), outlet, '已取消的请求不能替换正文出口')
  assert.ok(oldList.isConnected, '已取消的请求不能提交远端正文')
  assert.notStrictEqual(w.document.getElementById('lsb-shell'), shellNode)
})


test('页面从 BFCache 恢复时中止挂起软跳并清理事务 UI', async () => {
  const { w, tick } = makeTopicSpaHome()
  const flow = deferredHtmlFetch(w, topicHtml)
  const assigned = stubLocationAssign(w)
  await loadBase(w, PLUG('skin.user.js'))
  const outlet = w.document.querySelector('main.wrap')
  const link = w.document.createElement('a')
  link.href = 'https://linux.sb/topic/1'
  outlet.append(link)
  link.click()
  await tick(0)
  const requestSignal = flow.signals()[0]
  assert.ok(requestSignal)
  assert.equal(outlet.getAttribute('aria-busy'), 'true')

  const pageshow = new w.Event('pageshow')
  Object.defineProperty(pageshow, 'persisted', { value: true })
  w.dispatchEvent(pageshow)
  assert.equal(requestSignal.aborted, true)
  assert.equal(outlet.hasAttribute('aria-busy'), false)
  assert.equal(w.document.documentElement.dataset.lsbRoutePhase, undefined)
  assert.equal(w.document.documentElement.classList.contains('lsb-canvas-route-pending'), false)
  await tick(120)
  assert.equal(w.document.getElementById('lsb-shell-progress')?.dataset.phase, 'idle')

  flow.resolveNext()
  await tick(20)
  assert.deepEqual(assigned(), [], 'BFCache 恢复后的旧事务不应触发整页回退')
  assert.equal(w.document.querySelector('.topic-post-list'), null)
})

test('帖子阅读路由严格限制正整数并尊重原生导航标记', async () => {
  const { w, tick } = makeHome()
  const calls = stubHtmlFetch(w, topicHtml)
  await loadBase(w, PLUG('skin.user.js'))
  const host = w.document.querySelector('main.wrap')
  const cases = [
    { href: '/topic/0', label: '零号帖子' },
    { href: '/topic/9007199254740992', label: '超出安全整数范围的帖子' },
    { href: '/topic/1/extra', label: '额外路径段' },
    { href: '/topic_collection/1', label: '淘帖详情' },
    { href: 'https://other.example/topic/1', label: '外链' },
    { href: '/topic/1?replyid=24', attr: ['download', ''], label: '下载链接' },
    { href: '/topic/1?replyid=24', attr: ['target', '_blank'], label: '新窗口' },
    { href: '/topic/1?replyid=24', attr: ['data-method', 'post'], label: '显式写操作' },
    { href: '/topic/1?replyid=24', attr: ['data-confirm', '确认'], label: '确认操作' },
    { href: '/topic/1?replyid=24', attr: ['data-no-spa', '1'], label: '禁止软跳' },
  ]
  for (const item of cases) {
    const link = w.document.createElement('a')
    link.href = item.href.startsWith('http') ? item.href : `https://linux.sb${item.href}`
    if (item.attr) link.setAttribute(item.attr[0], item.attr[1])
    link.textContent = item.label
    let nativeAllowed = false
    link.addEventListener('click', (event) => {
      nativeAllowed = !event.defaultPrevented
      event.preventDefault()
    }, { once: true })
    host.append(link)
    link.dispatchEvent(new w.MouseEvent('click', { bubbles: true, cancelable: true, button: 0 }))
    await tick(0)
    assert.equal(nativeAllowed, true, `${item.label} 应交给原生导航`)
  }
  assert.equal(calls.length, 0, '被排除的帖子链接不应发起软跳请求')
})

test('帖子软跳关闭设置经迁移后仍保留原生导航', async () => {
  const { w, tick } = makeHome({
    'lsb_base:skin:__config': { topicSpa: false },
    'lsb_base:skin:topicSpaNewWorldDefaultMigrationV1': true,
  })
  const calls = stubHtmlFetch(w, topicHtml)
  await loadBase(w, PLUG('skin.user.js'))
  const link = w.document.createElement('a')
  link.href = 'https://linux.sb/topic/1'
  let nativeAllowed = false
  link.addEventListener('click', (event) => {
    nativeAllowed = !event.defaultPrevented
    event.preventDefault()
  }, { once: true })
  w.document.querySelector('main.wrap').append(link)
  link.click()
  await tick(20)
  assert.equal(nativeAllowed, true, '关闭帖子软跳后链接应交给原生导航')
  assert.equal(calls.length, 0)
})

test('帖子软跳拒绝非帖子响应并保留旧正文', async () => {
  const { w, tick } = makeTopicSpaHome()
  const flow = deferredHtmlFetch(w, homeHtml)
  const assigned = stubLocationAssign(w)
  await loadBase(w, PLUG('skin.user.js'))
  const outlet = w.document.querySelector('main.wrap')
  const oldList = outlet.querySelector('ul.post-list')
  const link = w.document.createElement('a')
  link.href = 'https://linux.sb/topic/1'
  outlet.append(link)
  link.click()
  await tick(0)
  assert.ok(w.document.documentElement.classList.contains('lsb-canvas-route-pending'), '失败前事务隐藏状态保持生效')
  flow.resolveNext()
  await tick(100)
  assert.ok(flow.calls.some((url) => /\/topic\/1/.test(url)))
  assert.ok(oldList.isConnected, '错误响应不能替换旧正文')
  assert.equal(w.location.pathname, '/', '提交失败前地址不变')
  assert.deepEqual(assigned(), ['https://linux.sb/topic/1'], '非帖子响应回退整页导航')
  assert.equal(w.document.documentElement.classList.contains('lsb-canvas-route-pending'), false, '请求失败后清理页面级隐藏状态')
})

test('软跳响应失败清理忙碌、阶段和进度计时器', async () => {
  const { w, until, tick } = makeTopicSpaHome()
  const assigned = stubLocationAssign(w)
  let rejectFetch
  w.fetch = () => new Promise((_, reject) => { rejectFetch = reject })
  await loadBase(w, PLUG('skin.user.js'))
  const outlet = w.document.querySelector('main.wrap')
  const oldList = outlet.querySelector('ul.post-list')
  const oldTitle = w.document.title
  const link = w.document.createElement('a')
  link.href = 'https://linux.sb/forum/4'
  outlet.append(link)
  link.click()
  const progress = w.document.getElementById('lsb-shell-progress')
  assert.equal(await until(() => progress.dataset.phase === 'loading', 1000, 10), true)
  rejectFetch(new Error('offline'))
  assert.equal(await until(() => assigned().length === 1, 1000, 10), true)

  assert.equal(outlet.hasAttribute('aria-busy'), false)
  assert.equal(w.document.documentElement.dataset.lsbRoutePhase, undefined)
  assert.equal(w.document.documentElement.classList.contains('lsb-canvas-route-pending'), false)
  assert.equal(progress.dataset.phase, 'idle')
  assert.ok(oldList.isConnected)
  assert.equal(w.document.title, oldTitle)
  await tick(110)
  assert.equal(progress.dataset.phase, 'idle', '失败后已触发的旧计时器不得再次显示进度线')
})

test('软跳对登录跳转、挑战页和无正文响应整页回退且保留旧页面', async () => {
  const scenarios = [
    {
      name: 'login redirect',
      response: (url) => ({ status: 200, ok: true, url: 'https://linux.sb/login', text: async () => homeHtml }),
      fallback: 'https://linux.sb/login',
    },
    {
      name: 'challenge page',
      response: (url) => ({ status: 200, ok: true, url, text: async () => cloudflareChallengeHtml }),
      fallback: 'https://linux.sb/forum/4',
    },
    {
      name: 'missing outlet',
      response: (url) => ({ status: 200, ok: true, url, text: async () => '<!doctype html><title>empty</title>' }),
      fallback: 'https://linux.sb/forum/4',
    },
    {
      name: 'HTTP failure',
      response: (url) => ({ status: 503, ok: false, url, text: async () => 'offline' }),
      fallback: 'https://linux.sb/forum/4',
    },
  ]
  for (const scenario of scenarios) {
    const { w, until } = makeTopicSpaHome()
    const assigned = stubLocationAssign(w)
    const requests = []
    const responseUrls = []
    w.fetch = async (url) => {
      const href = String(url)
      requests.push(href)
      const response = scenario.response(href)
      responseUrls.push(response.url)
      return response
    }
    await loadBase(w, PLUG('skin.user.js'))
    const outlet = w.document.querySelector('main.wrap')
    const oldList = outlet.querySelector('ul.post-list')
    const oldTitle = w.document.title
    const link = w.document.createElement('a')
    link.href = 'https://linux.sb/forum/4'
    outlet.append(link)
    link.click()

    assert.equal(
      await until(() => assigned().length > 0, 1500, 10),
      true,
      `${scenario.name} 应回退整页导航 (requests=${requests.join(',')}, responseUrls=${responseUrls.join(',')}, path=${w.location.pathname}, phase=${w.document.documentElement.dataset.lsbRoutePhase})`,
    )
    assert.deepEqual(assigned(), [scenario.fallback], `${scenario.name} 使用正确回退地址`)
    assert.equal(w.location.pathname, '/', `${scenario.name} 回退前地址保持不变`)
    assert.equal(w.document.title, oldTitle, `${scenario.name} 不得提交响应元信息`)
    assert.equal(w.document.querySelector('main.wrap'), outlet)
    assert.ok(oldList.isConnected, `${scenario.name} 保留旧正文`)
    assert.equal(outlet.hasAttribute('aria-busy'), false)
    assert.equal(w.document.documentElement.dataset.lsbRoutePhase, undefined)
    assert.equal(w.document.documentElement.classList.contains('lsb-canvas-route-pending'), false)
    assert.equal(w.document.getElementById('lsb-shell-progress')?.dataset.phase, 'idle')
  }
})

test('帖子后退/前进软跳失败时执行整页 reload', async () => {
  const { w, tick } = makeTopicSpaHome()
  await loadBase(w, PLUG('skin.user.js'))
  const reloads = stubReload(w)
  const oldList = w.document.querySelector('ul.post-list')
  w.fetch = async () => {
    throw new Error('offline')
  }
  w.history.pushState({ lsbShellSpa: true }, '', 'https://linux.sb/topic/1')
  w.dispatchEvent(new w.Event('popstate'))
  await tick(100)
  assert.equal(reloads(), 1, '后退/前进恢复失败必须交给整页 reload')
  assert.ok(oldList.isConnected, '恢复失败不能先清空旧正文')
  assert.equal(w.document.documentElement.dataset.lsbRoutePhase, undefined)
})

test('帖子软跳提交后同步基座 CSRF、路由事件和新增楼层事件', async () => {
  const { w, tick } = makeTopicSpaHome()
  const oldToken = /name="_csrf" value="([^"]+)"/.exec(homeHtml)?.[1]
  const newToken = 'topic-token-for-spa-test'
  const remote = topicHtml.replaceAll(oldToken, newToken)
  const calls = stubHtmlFetch(w, remote)
  await loadBase(w, PLUG('skin.user.js'))
  const routes = []
  const posts = []
  w.LSB.bus.on('route:changed', (payload) => routes.push(payload))
  w.LSB.bus.on('topic:posts-added', (payload) => posts.push(payload))
  const link = w.document.createElement('a')
  link.href = 'https://linux.sb/topic/1'
  w.document.querySelector('main.wrap').append(link)
  link.click()
  await tick(180)
  assert.ok(calls.some((url) => /\/topic\/1/.test(url)))
  assert.ok(routes.some((payload) => payload?.page?.type === 'topic' && payload.page.id === 1), '基座应收到 topic 路由事件')
  assert.ok(posts.some((batch) => Array.isArray(batch) && batch.length > 0), '新导入正文应触发新增楼层事件')
  assert.equal(w.LSB.__core.net.csrf(), newToken, '基座网络层应切换到新正文的 CSRF')
})

test('软跳提交同步页面元信息并聚焦播报正文标题', async () => {
  const { w, tick } = makeTopicSpaHome()
  const remote = homeHtml
    .replace(/<meta name="description" content="[^"]*">/, '<meta name="description" content="目标描述">')
    .replace(/<title>[^<]*<\/title>/, '<title>目标页面标题</title>')
    .replace('</head>', '<link rel="canonical" href="https://linux.sb/forum/4"><meta property="og:title" content="目标页面标题"></head>')
  const calls = stubHtmlFetch(w, remote)
  const canonical = w.document.createElement('link')
  canonical.rel = 'canonical'
  canonical.href = 'https://linux.sb/'
  const description = w.document.querySelector('meta[name="description"]')
  const ogTitle = w.document.createElement('meta')
  ogTitle.setAttribute('property', 'og:title')
  ogTitle.content = '旧标题'
  w.document.head.append(canonical, ogTitle)
  await loadBase(w, PLUG('skin.user.js'))
  const outlet = w.document.querySelector('main.wrap')
  const link = w.document.createElement('a')
  link.href = 'https://linux.sb/forum/4'
  outlet.append(link)
  link.click()
  await tick(180)

  assert.ok(calls.some((url) => /\/forum\/4/.test(url)))
  assert.equal(w.location.pathname, '/forum/4')
  assert.equal(w.document.title, '目标页面标题')
  assert.equal(canonical.href, 'https://linux.sb/forum/4')
  assert.equal(w.document.querySelector('meta[name="description"]'), description)
  assert.equal(description.content, '目标描述')
  assert.equal(w.document.querySelector('meta[property="og:title"]'), ogTitle)
  assert.equal(ogTitle.content, '目标页面标题')
  assert.equal(outlet.getAttribute('tabindex'), '-1')
  assert.equal(w.document.activeElement, outlet)
  assert.ok(outlet.hasAttribute('data-lsb-route-content-enter'))
  const announcer = w.document.getElementById('lsb-route-announcer')
  assert.equal(announcer.getAttribute('role'), 'status')
  assert.equal(announcer.getAttribute('aria-live'), 'polite')
  assert.equal(announcer.textContent, '已打开：目标页面标题')
})

test('历史导航恢复正文时不抢焦点', async () => {
  const { w, tick, until } = makeTopicSpaHome()
  stubHtmlFetch(w, (url) => /\/topic\//.test(String(url)) ? topicHtml : homeHtml)
  await loadBase(w, PLUG('skin.user.js'))
  const link = w.document.createElement('a')
  link.href = 'https://linux.sb/topic/1'
  w.document.querySelector('main.wrap').append(link)
  link.click()
  await tick(160)
  assert.equal(w.document.activeElement, w.document.querySelector('main.wrap'), '用户导航提交后正文出口应获得焦点')
  const initialAnnouncer = w.document.getElementById('lsb-route-announcer')
  assert.equal(initialAnnouncer?.textContent, `已打开：${w.document.title}`)

  const persistentFocus = w.document.createElement('button')
  persistentFocus.type = 'button'
  w.document.getElementById('lsb-shell').append(persistentFocus)
  persistentFocus.focus()
  const priorAnnouncement = w.document.getElementById('lsb-route-announcer')?.textContent || ''
  w.history.back()
  assert.equal(await until(() => w.location.pathname === '/' && !!w.document.querySelector('.home-shell'), 2000, 10), true)

  assert.equal(w.location.pathname, '/')
  assert.equal(w.document.activeElement, persistentFocus, '浏览器历史导航不应把焦点移到正文')
  assert.equal(w.document.getElementById('lsb-route-announcer')?.textContent || '', priorAnnouncement)
})

test('软跳提交清除远端缺失的元信息值且不创建 head 节点', async () => {
  const { w, tick } = makeTopicSpaHome()
  const remote = homeHtml
    .replace(/<meta name="description" content="[^"]*">/, '')
    .replace('</head>', '<meta property="og:title" content="远端标题"></head>')
  stubHtmlFetch(w, remote)
  const canonical = w.document.createElement('link')
  canonical.rel = 'canonical'
  canonical.href = 'https://linux.sb/'
  w.document.head.append(canonical)
  await loadBase(w, PLUG('skin.user.js'))
  const link = w.document.createElement('a')
  link.href = 'https://linux.sb/forum/4'
  w.document.querySelector('main.wrap').append(link)
  link.click()
  await tick(160)

  assert.equal(w.document.querySelector('meta[name="description"]').hasAttribute('content'), false)
  assert.equal(w.document.querySelector('meta[property="og:title"]'), null, '远端新增字段不应凭空创建 head 节点')
  assert.equal(canonical.hasAttribute('href'), false, '远端缺少 canonical 时移除旧地址')
})

test('帖子软跳拒绝 canonical 与目标不一致的响应', async () => {
  const { w, tick } = makeTopicSpaHome()
  const wrongTopic = topicHtml
    .replace('https://linux.sb/topic/1', 'https://linux.sb/topic/2')
    .replace(/<title>[^<]*<\/title>/, '<title>无效响应标题</title>')
  const calls = stubHtmlFetch(w, wrongTopic)
  const oldTitle = w.document.title
  const canonical = w.document.createElement('link')
  canonical.rel = 'canonical'
  canonical.href = 'https://linux.sb/'
  w.document.head.append(canonical)
  const oldDescription = w.document.querySelector('meta[name="description"]').content
  await loadBase(w, PLUG('skin.user.js'))
  const oldList = w.document.querySelector('ul.post-list')
  const link = w.document.createElement('a')
  link.href = 'https://linux.sb/topic/1'
  w.document.querySelector('main.wrap').append(link)
  link.click()
  await tick(100)
  assert.ok(calls.some((url) => /\/topic\/1/.test(url)))
  assert.ok(oldList.isConnected, 'canonical 不一致不能提交远端正文')
  assert.equal(w.location.pathname, '/', 'canonical 校验失败前地址不变')
  assert.equal(w.document.title, oldTitle, 'canonical 校验失败时标题不得更新')
  assert.equal(canonical.href, 'https://linux.sb/', 'canonical 校验失败时现有值必须保留')
  assert.equal(w.document.querySelector('meta[name="description"]').content, oldDescription)
})

testReadingModes('快速连续帖子软跳只允许最后一个请求提交', async (uiMode) => {
  const { w, tick } = makeReadingHome(uiMode)
  const first = topicHtml.replace('LINUX SB上线', '第一主题')
  const second = topicHtml.replaceAll('/topic/1', '/topic/2').replaceAll('LINUX SB上线', '第二主题')
  const flow = deferredHtmlFetch(w, (url) => /\/topic\/1/.test(String(url)) ? first : second)
  await loadBase(w, PLUG('skin.user.js'))
  const outlet = w.document.querySelector('main.wrap')
  const a = w.document.createElement('a')
  a.href = 'https://linux.sb/topic/1'
  const b = w.document.createElement('a')
  b.href = 'https://linux.sb/topic/2'
  outlet.append(a, b)
  a.click()
  await tick(0)
  assert.ok(w.document.documentElement.classList.contains('lsb-canvas-route-pending'), '第一个事务建立页面级隐藏状态')
  const firstSignal = flow.signals()[0]
  b.click()
  await tick(0)
  assert.equal(firstSignal?.aborted, true, '开始新导航时应立即中止旧请求')
  assert.equal(flow.signals()[1]?.aborted, false, '新请求保持活动')
  assert.ok(w.document.documentElement.classList.contains('lsb-canvas-route-pending'), '新事务接管期间不能短暂露出原生 UI')
  assert.equal(flow.pending(), 2)
  flow.resolveNext()
  await tick(40)
  assert.ok(w.document.documentElement.classList.contains('lsb-canvas-route-pending'), '过期请求不得清理新事务的隐藏状态')
  assert.equal(w.location.pathname, '/')
  flow.resolveNext()
  await tick(120)
  assert.equal(w.document.documentElement.classList.contains('lsb-canvas-route-pending'), false, '最后一个事务完成后清理页面级隐藏状态')
  assert.equal(w.location.pathname, '/topic/2')
  assert.match(w.document.querySelector('.post-content-title')?.textContent || '', /第二主题/)
})

test('帖子软跳提交后基座快照切换到 topic 且离开时恢复列表页', async () => {
  const { w, tick } = makeTopicSpaHome()
  const calls = stubHtmlFetch(w, (url) => /\/topic\//.test(String(url)) ? topicHtml : homeHtml)
  await loadBase(w, PLUG('skin.user.js'))
  const shellNode = w.document.getElementById('lsb-shell')
  const toTopic = w.document.createElement('a')
  toTopic.href = 'https://linux.sb/topic/1'
  w.document.querySelector('main.wrap').append(toTopic)
  toTopic.click()
  await tick(120)
  assert.equal(w.LSB.info().page.type, 'topic')
  assert.equal(w.LSB.info().page.id, 1)
  assert.ok(w.LSB.__core.snapshot.topic)
  const back = w.document.querySelector('.breadcrumb a[href="/"]')
  back.click()
  await tick(120)
  assert.equal(w.LSB.info().page.type, 'home')
  assert.equal(w.document.getElementById('lsb-shell'), shellNode)
  assert.ok(calls.some((url) => /\/topic\/1/.test(url)))
})

test('帖子软跳沿用远端在线用户清单并给新头像补绿点', async () => {
  const { w, tick, until } = makeTopicSpaHome()
  const onlineId = '4242'
  w.document.body.insertAdjacentHTML(
    'beforeend',
    '<span class="online-users-boot" hidden data-online-users-ids="" data-online-users-label="在线"></span>',
  )
  const avatar = `<li class="post-item post-entry" id="post-online-probe"><div class="post-avatar"><a class="avatar-profile-link" href="/user/${onlineId}"><img class="avatar-img" alt="在线用户"></a></div></li>`
  const remote = topicHtml
    .replace(/(<ul\b[^>]*post-list[^>]*>)/, `$1${avatar}`)
    .replace('</footer>', `<span class="online-users-boot" hidden data-online-users-ids="${onlineId}" data-online-users-label="在线"></span></footer>`)
  const calls = stubHtmlFetch(w, remote)
  await loadBase(w, PLUG('skin.user.js'))

  const link = w.document.createElement('a')
  link.href = 'https://linux.sb/topic/1'
  w.document.querySelector('main.wrap').append(link)
  link.click()
  assert.equal(await until(() => w.location.pathname === '/topic/1' && !!w.document.querySelector('.topic-post-list')), true,
    `帖子正文应提交: ${JSON.stringify(calls)}`)

  const probe = w.document.querySelector(`a.avatar-profile-link[href="/user/${onlineId}"]`)
  assert.ok(probe, '远端帖子头像应进入当前正文')
  assert.ok(probe.classList.contains('online-users-host'), '软跳后应识别远端在线用户')
  assert.ok(probe.querySelector(':scope > .online-users-dot'), '软跳后应给在线头像追加绿点')

  const late = w.document.createElement('div')
  late.innerHTML = `<a class="avatar-profile-link" href="/user/${onlineId}"><img class="avatar-img" alt="延迟在线用户"></a>`
  w.document.querySelector('.topic-post-list').append(late.firstElementChild)
  assert.equal(await until(() => !!w.document.querySelector('.topic-post-list img[alt="延迟在线用户"] + .online-users-dot'), 800), true,
    '软跳后异步加入的头像也应自动补绿点')
  await tick(0)
})

for (const mode of ['legacy', 'ios27']) {
  test(`${mode} 在线生命周期：请求在途时关闭再开启仍能恢复周期刷新`, async (t) => {
    const { w, tick, until } = makeReadingHome(mode)
    const pending = []
    w.document.body.insertAdjacentHTML('beforeend',
      '<span hidden data-online-users-ids="4242" data-online-users-label="在线"></span>'
      + '<a href="/user/4343"><img class="avatar-img" alt="重启在线用户"></a>')
    w.fetch = async (url, init = {}) => {
      const response = (ids) => ({ status: 200, ok: true, url: String(url), text: async () =>
        `${homeHtml}<span hidden data-online-users-ids="${ids}" data-online-users-label="在线"></span>` })
      if (!isOnlineUserRequest(url, init)) return response('4242')
      return new Promise((resolve) => pending.push((ids) => resolve(response(ids))))
    }
    const held = holdLongTimers(w)
    t.after(async () => {
      if (w.document) w.LSB?.disable('skin')
      pending.forEach((resolve) => resolve('4242'))
      await tick(80)
      w.close()
    })
    await loadBase(w, PLUG('skin.user.js'))
    await held.flush()
    assert.equal(await until(() => pending.length === 1), true)
    await changeSkinConfig(w, { shell: false })
    await changeSkinConfig(w, { shell: true })
    pending[0]('4343')
    await tick(80)
    assert.equal(w.document.querySelector('[data-online-users-ids]').dataset.onlineUsersIds, '4242',
      '关闭前请求的结果不能应用到重启的氢壳')
    await held.flush()
    assert.equal(await until(() => pending.length === 2), true, '重新开启后应继续请求在线清单')
    pending[1]('4343')
    assert.equal(await until(() => !!w.document.querySelector('img[alt="重启在线用户"] + .online-users-dot')), true)
  })
}

test('在线状态变化后低频刷新清单并增删头像绿点', async () => {
  const { w, until } = makeHome()
  const becameOffline = '4242'
  const becameOnline = '4343'
  w.document.body.insertAdjacentHTML(
    'beforeend',
    `<span class="online-users-boot" hidden data-online-users-ids="${becameOffline}" data-online-users-label="在线"></span>`,
  )
  const probes = w.document.createElement('div')
  probes.innerHTML = `
    <a class="avatar-profile-link" href="/user/${becameOffline}"><img class="avatar-img" alt="将离线"></a>
    <a class="avatar-profile-link" href="/user/${becameOnline}"><img class="avatar-img" alt="将上线"></a>`
  w.document.body.append(probes)
  const refreshedHome = `${homeHtml}<span class="online-users-boot" hidden data-online-users-ids="${becameOnline}" data-online-users-label="在线"></span>`
  const calls = stubHtmlFetch(w, refreshedHome)
  const held = holdLongTimers(w)
  await loadBase(w, PLUG('skin.user.js'))

  try {
    const offlineProbe = w.document.querySelector(`a[href="/user/${becameOffline}"]`)
    const onlineProbe = w.document.querySelector(`a[href="/user/${becameOnline}"]`)
    assert.ok(offlineProbe?.querySelector(':scope > .online-users-dot'), '初始在线用户应有绿点')
    assert.equal(onlineProbe?.querySelector(':scope > .online-users-dot'), null, '初始离线用户不应有绿点')

    await held.flush()
    assert.equal(await until(() => {
      return onlineUserGets(calls).length > 0
        && !offlineProbe?.querySelector(':scope > .online-users-dot')
        && !!onlineProbe?.querySelector(':scope > .online-users-dot')
    }, 1500), true, `在线清单刷新后应同步增删绿点: ${JSON.stringify(calls)}`)
  } finally {
    w.LSB.disable('skin')
  }
})

test('新版 data-slot 顶栏可定位并隐藏其外层站点头部', async () => {
  const { w } = makeLegacyHome()
  const header = w.document.querySelector('body > .top')
  const menu = w.document.querySelector('.forum-nav')
  assert.ok(header)
  assert.ok(menu)

  header.classList.remove('top')
  menu.setAttribute('data-slot', 'top.menu_links')

  await loadBase(w, PLUG('skin.user.js'))

  assert.ok(header.classList.contains('lsb-native-header-hidden'),
    '顶栏菜单 slot 应让壳隐藏 body 直属的整个站点头部')
})

test('新版 Meilisearch 顶栏表单迁入旧三栏并停用后恢复原位', async () => {
  const { w } = makeLegacyHome()
  const oldForm = w.document.querySelector('form.search-form')
  const originalHome = oldForm.parentNode
  const form = makeMeilisearchTopForm(w)
  oldForm.replaceWith(form)

  await loadBase(w, PLUG('skin.user.js'))

  try {
    const host = shell(w).querySelector('.lsb-shell-search-host')
    assert.strictEqual(host.querySelector('form.meilisearch-search-top-form'), form,
      '新版搜索表单应迁入旧三栏顶栏，而不是留在被隐藏的原生顶栏')
    assert.equal(form.classList.contains('lsb-shell-search'), true)
    assert.equal(form.getAttribute('action'), '/meilisearch_search')
    assert.equal(form.querySelector('input[name="_csrf"]').value, 'site-token')
    assert.equal(form.querySelector('input[name="scope"]').value, 'all')
    assert.equal(w.document.querySelectorAll('form.meilisearch-search-top-form').length, 1,
      '站点表单应迁移而不是克隆')

    w.LSB.disable('skin')
    assert.strictEqual(form.parentNode, originalHome, '停用皮肤后表单回到站点原位置')
  } finally {
    w.LSB.disable('skin')
  }
})

test('站点动态替换顶栏搜索占位链接后仍迁入新版 Meilisearch 表单', async () => {
  const { w, tick, until } = makeLegacyHome()
  const oldForm = w.document.querySelector('form.search-form')
  const originalHome = oldForm.parentNode
  const placeholder = w.document.createElement('a')
  placeholder.className = 'search-page-link'
  placeholder.href = '/search'
  placeholder.textContent = '搜索'
  oldForm.replaceWith(placeholder)

  await loadBase(w, PLUG('skin.user.js'))

  try {
    const host = shell(w).querySelector('.lsb-shell-search-host')
    assert.strictEqual(placeholder.parentNode, host, '旧站点搜索占位先迁入壳顶栏')
    const form = makeMeilisearchTopForm(w)
    placeholder.replaceWith(form)

    assert.equal(await until(() => form.classList.contains('lsb-shell-search') && form.parentNode === host), true,
      '动态生成的新搜索表单应接管已迁移的占位链接')
    assert.equal(form.querySelector('input[name="q"]')?.type, 'search')
    assert.equal(form.querySelector('input[name="charge_confirmed"]')?.value, '0')
    assert.equal(w.document.querySelectorAll('form.meilisearch-search-top-form').length, 1)

    w.LSB.disable('skin')
    await tick(30)
    assert.strictEqual(form.parentNode, originalHome, '停用皮肤后新版表单回到原生顶栏位置')
  } finally {
    w.LSB.disable('skin')
  }
})

for (const mode of ['legacy', 'ios27']) {
  test(`${mode} 入口拆分：没有实际功能的活动插件不显示入口`, async (t) => {
    const { w, tick } = makeReadingHome(mode)
    t.after(async () => { if (w.document) w.LSB?.disable('skin'); await tick(80); w.close() })
    await loadBase(w, PLUG('skin.user.js'))
    w.LSB.register({ id: 'reading-center', name: '阅读中心', version: '1.0.0' }, () => {})
    await changeSkinConfig(w, {})
    if (mode === 'ios27') {
      w.document.querySelector('[data-canvas-open="tool-sheet"]').click()
      w.document.querySelector('[data-tool-action="plugin-features-sheet"]').click()
    }
    assert.equal(w.document.querySelector('[data-lsb-rpc="reading-center:open"], [data-plugin-feature-action="reading-center"]'), null)
  })

  test(`${mode} 入口拆分：停用后的旧工具按钮不能打开其它面板`, async (t) => {
    const { w, tick } = makeReadingHome(mode)
    t.after(async () => { if (w.document) w.LSB?.disable('skin'); await tick(80); w.close() })
    await loadBase(w, PLUG('skin.user.js'))
    w.LSB.register({ id: 'checkin-calendar', name: '签到', version: '1.0.0' }, (api) => {
      api.ui.tab({ name: '签到', render: (host) => { host.textContent = '签到功能' } })
    })
    await changeSkinConfig(w, {})
    if (mode === 'ios27') {
      w.document.querySelector('[data-canvas-open="tool-sheet"]').click()
      w.document.querySelector('[data-tool-action="plugin-features-sheet"]').click()
    }
    const action = w.document.querySelector('[data-lsb-panel="checkin-calendar"], [data-plugin-feature-action="checkin-calendar"]')
    assert.ok(action)
    w.LSB.disable('checkin-calendar')
    action.click()
    assert.equal(w.document.querySelector('.lsb-panel'), null)
    assert.match(w.document.querySelector('.lsb-toast')?.textContent || '', /当前不可用/)
  })

  test(`${mode} 入口拆分：搜索还原只处理自己接管的节点`, async (t) => {
    const { w, tick } = makeReadingHome(mode)
    t.after(async () => { if (w.document) w.LSB?.disable('skin'); await tick(80); w.close() })
    const form = w.document.querySelector('form.search-form')
    const home = form.parentNode, next = form.nextSibling
    await loadBase(w, PLUG('skin.user.js'))
    const foreign = w.document.createElement('div')
    foreign.className = 'lsb-shell-search'
    foreign.textContent = '其它插件内容'
    w.document.body.prepend(foreign)
    w.LSB.disable('skin')
    assert.equal(form.parentNode, home)
    assert.equal(form.nextSibling, next)
    assert.equal(foreign.parentNode, w.document.body)
    assert.equal(foreign.className, 'lsb-shell-search')
  })
}

test('新版 data-slot 侧栏不依赖旧 sidebar class', async () => {
  const { w } = makeLegacyHome()
  const sidebar = w.document.querySelector('aside.sidebar')
  assert.ok(sidebar)

  sidebar.classList.remove('sidebar')
  sidebar.setAttribute('data-slot', 'sidebar.stack')

  await loadBase(w, PLUG('skin.user.js'))

  assert.ok(sidebar.classList.contains('lsb-native-sidebar-hidden'),
    'sidebar.stack 应继续被迁移并隐藏')
})

test('软跳提交时隐藏新版 sidebar.stack slot-only 侧栏', async () => {
  const { w, until } = makeTopicSpaHome()
  const remote = homeHtml.replace('<aside class="sidebar"', '<aside data-slot="sidebar.stack"')
  stubHtmlFetch(w, remote)
  await loadBase(w, PLUG('skin.user.js'))

  const link = w.document.createElement('a')
  link.href = 'https://linux.sb/forum/4'
  w.document.querySelector('main.wrap').append(link)
  link.click()

  assert.equal(await until(() => w.location.pathname === '/forum/4' && !!w.document.querySelector('.home-shell')), true)
  const sidebar = w.document.querySelector('main.wrap [data-slot~="sidebar.stack"]')
  assert.ok(sidebar)
  assert.ok(sidebar.classList.contains('lsb-native-sidebar-hidden'),
    '导入远端页面时也必须按 sidebar.stack 隐藏站点原生侧栏')
})

test('新版 page.before_render slot 可作为主内容出口', async () => {
  const { w } = makeLegacyHome()
  const legacyOutlet = w.document.querySelector('main.wrap')
  assert.ok(legacyOutlet)
  const slotOutlet = w.document.createElement('div')
  slotOutlet.setAttribute('data-slot', 'page.before_render')
  slotOutlet.innerHTML = legacyOutlet.innerHTML
  legacyOutlet.replaceWith(slotOutlet)

  await loadBase(w, PLUG('skin.user.js'))

  assert.ok(w.document.getElementById('lsb-shell'),
    'skin 应通过 page.before_render 找到主内容并挂载旧三段式')
})

test('在线清单刷新保持站点显示的当前在线人数与卡片其他内容', async () => {
  const { w, until } = makeLegacyHome()
  const online = w.document.createElement('div')
  online.className = 'card sidebar-card online-users-card'
  online.innerHTML =
    '<div class="online-users-head"><span class="online-users-title">当前在线</span> 9 人</div>' +
    '<div class="online-users-members">保留成员列表</div>'

  const refreshedHome =
    `${homeHtml}<span class="online-users-boot" hidden data-online-users-ids="101,202,303" data-online-users-label="在线"></span>`
  const calls = stubHtmlFetch(w, refreshedHome)
  const held = holdLongTimers(w)
  await loadBase(w, PLUG('skin.user.js'))

  try {
    const sidebar = [...w.document.querySelectorAll('aside.sidebar')].find(
      (el) => !el.classList.contains('mobile-menu-drawer'),
    )
    sidebar.append(online)
    assert.equal(
      await until(() => online.closest('#lsb-shell-aside') != null),
      true,
      '在线卡应已迁入右栏',
    )
    await held.flush()
    assert.equal(
      await until(() => onlineUserGets(calls).length > 0
        && w.document.querySelector('.online-users-boot')?.dataset.onlineUsersIds === '101,202,303'),
      true,
      '在线 ID 清单仍应刷新，供头像在线状态使用',
    )
    assert.match(online.querySelector('.online-users-head').textContent, /9 人/,
      '当前在线人数应保持站点原生显示')
    assert.equal(online.querySelector('[data-online-users-count]'), null,
      '不得注入自有在线人数节点')
    assert.equal(online.querySelector('.online-users-title').textContent, '当前在线')
    assert.equal(online.querySelector('.online-users-members').textContent, '保留成员列表')
  } finally {
    held.flush()
    w.LSB.disable('skin')
  }
})

test('旧式 index.php 用户链接也能同步在线绿点', async () => {
  const { w, until } = makeLegacyHome()
  const online = w.document.createElement('div')
  online.className = 'card sidebar-card online-users-card'
  online.innerHTML =
    '<div class="online-users-head"><span class="online-users-title">当前在线</span> 1 人</div>' +
    '<a class="avatar-profile-link" href="/index.php?a=user&id=101"><img class="avatar-img" alt="旧链接用户"></a>'
  w.document.querySelector('aside.sidebar').append(online)
  w.document.body.insertAdjacentHTML(
    'beforeend',
    '<span class="online-users-boot" hidden data-online-users-ids="101" data-online-users-label="在线"></span>',
  )
  await loadBase(w, PLUG('skin.user.js'))
  assert.equal(await until(() => !!w.document.querySelector('img[alt="旧链接用户"]')?.parentElement?.querySelector('.online-users-dot')), true)
})

test('回到缓存首页后立即重新取在线清单并更新绿点', async () => {
  const { w, tick, until } = makeTopicSpaHome()
  const becameOffline = '4242'
  const becameOnline = '4343'
  const initialHome = `${homeHtml}<span class="online-users-boot" hidden data-online-users-ids="${becameOffline}" data-online-users-label="在线"></span>`
  let onlineHtml = initialHome
  const probes = w.document.createElement('div')
  probes.innerHTML = `
    <a class="avatar-profile-link" href="/user/${becameOffline}"><img class="avatar-img" alt="回首页后离线"></a>
    <a class="avatar-profile-link" href="/user/${becameOnline}"><img class="avatar-img" alt="回首页后上线"></a>`
  w.document.body.insertAdjacentHTML(
    'beforeend',
    `<span class="online-users-boot" hidden data-online-users-ids="${becameOffline}" data-online-users-label="在线"></span>`,
  )
  w.document.body.append(probes)
  const calls = stubHtmlFetch(w, (url, init) => {
    const href = String(url)
    if (isOnlineUserRequest(href, init)) return onlineHtml
    if (/\/topic\//.test(href)) return topicHtml
    return initialHome
  })
  const held = holdLongTimers(w)
  await loadBase(w, PLUG('skin.user.js'))

  try {
    const offlineProbe = w.document.querySelector(`a[href="/user/${becameOffline}"]`)
    const onlineProbe = w.document.querySelector(`a[href="/user/${becameOnline}"]`)
    assert.equal(await until(() => !!offlineProbe?.querySelector(':scope > .online-users-dot'), 1200), true,
      '首页首次清单应给初始在线用户加绿点')
    assert.equal(onlineProbe?.querySelector(':scope > .online-users-dot'), null, '初始离线用户不应有绿点')

    const topicLink = w.document.createElement('a')
    topicLink.href = 'https://linux.sb/topic/1'
    w.document.querySelector('main.wrap').append(topicLink)
    topicLink.click()
    assert.equal(await until(() => w.location.pathname === '/topic/1' && !!w.document.querySelector('.topic-post-list')), true)
    await tick(40)

    onlineHtml = `${homeHtml}<span class="online-users-boot" hidden data-online-users-ids="${becameOnline}" data-online-users-label="在线"></span>`
    w.document.querySelector('.breadcrumb a[href="/"]')?.click()
    assert.equal(await until(() => w.location.pathname === '/' && !!w.document.querySelector('.post-list')), true)
    assert.equal(await until(() => {
      return onlineUserGets(calls).length >= 2
        && !offlineProbe?.querySelector(':scope > .online-users-dot')
        && !!onlineProbe?.querySelector(':scope > .online-users-dot')
    }, 1200), true,
      `回到缓存首页后应立即重新取清单并同步绿点: ${JSON.stringify(calls)}`)
  } finally {
    held.flush()
    w.LSB.disable('skin')
  }
})

test('关闭氢壳和停用插件归还原生history滚动模式', async (t) => {
  const { w, tick } = makeTopicSpaHome()
  t.after(async () => { if (w.document) w.LSB?.disable('skin'); await tick(50); w.close() })
  w.history.scrollRestoration = 'auto'
  await loadBase(w, PLUG('skin.user.js'))
  assert.equal(w.history.scrollRestoration, 'manual')
  await changeSkinConfig(w, { shell: false })
  assert.equal(w.history.scrollRestoration, 'auto')
  await changeSkinConfig(w, { shell: true })
  assert.equal(w.history.scrollRestoration, 'manual')
  w.LSB.disable('skin')
  assert.equal(w.history.scrollRestoration, 'auto')
})

test('历史项保存双轴滚动和地址，并保留既有 state 字段', async () => {
  const { w, tick, until } = makeTopicSpaHome()
  const calls = stubHtmlFetch(w, (url) => /\/topic\//.test(String(url)) ? topicHtml : homeHtml)
  Object.defineProperty(w, 'scrollX', { configurable: true, value: 31, writable: true })
  Object.defineProperty(w, 'scrollY', { configurable: true, value: 318, writable: true })
  w.history.replaceState({ siteState: 'preserve-me' }, '', w.location.href)
  await loadBase(w, PLUG('skin.user.js'))

  assert.equal(w.history.state.siteState, 'preserve-me')
  assert.equal(w.history.state.lsbShellSpa, true)
  assert.equal(w.history.state.lsbShellSpaIndex, 0)
  assert.equal(w.history.state.lsbShellSpaUrl, 'https://linux.sb/')
  assert.equal(w.history.state.lsbScrollX, 31)
  assert.equal(w.history.state.lsbScrollY, 318)

  const link = w.document.createElement('a')
  link.href = 'https://linux.sb/topic/1'
  w.document.querySelector('main.wrap').append(link)
  link.click()
  await tick(140)

  assert.ok(calls.some((url) => /\/topic\/1/.test(url)))
  assert.equal(w.history.state.siteState, 'preserve-me')
  assert.equal(w.history.state.lsbShellSpa, true)
  assert.equal(w.history.state.lsbShellSpaIndex, 1)
  assert.equal(w.history.state.lsbShellSpaUrl, 'https://linux.sb/topic/1')
  assert.equal(w.history.state.lsbScrollX, 0)
  assert.equal(w.history.state.lsbScrollY, 0)

  w.history.back()
  assert.equal(await until(() => w.location.pathname === '/' && !!w.document.querySelector('.home-shell'), 2000), true)
  assert.equal(w.scrollX, 31, '后退应恢复历史项的横向滚动')
  assert.equal(w.scrollY, 318, '后退应恢复历史项的纵向滚动')
})

test('取消后退会恢复原历史项且不请求目标正文', async () => {
  const { w, until } = makeTopicSpaHome()
  const calls = stubHtmlFetch(w, (url) => /\/topic\//.test(String(url)) ? topicHtml : homeHtml)
  await loadBase(w, PLUG('skin.user.js'))
  const link = w.document.createElement('a')
  link.href = 'https://linux.sb/topic/1'
  w.document.querySelector('main.wrap').append(link)
  link.click()
  assert.equal(await until(() => w.location.pathname === '/topic/1' && !!w.document.querySelector('.topic-post-list'), 2000, 10), true)

  const editor = w.document.createElement('textarea')
  editor.value = '尚未保存的内容'
  w.document.querySelector('main.wrap').append(editor)
  w.confirm = () => false
  const deltas = []
  const nativeGo = w.history.go.bind(w.history)
  w.history.go = (delta) => {
    deltas.push(delta)
    nativeGo(delta)
  }
  const requestCount = calls.filter((url) => /\/topic\//.test(String(url))).length

  w.history.back()
  assert.equal(await until(() => deltas.length === 1 && w.location.pathname === '/topic/1' && w.history.state?.lsbShellSpaIndex === 1, 1000, 10), true)

  assert.deepEqual(deltas, [1], '取消后退应按历史索引差回滚到当前项')
  assert.equal(w.location.pathname, '/topic/1')
  assert.equal(w.history.state.lsbShellSpaIndex, 1)
  assert.equal(editor.isConnected, true)
  assert.equal(calls.filter((url) => /\/topic\//.test(String(url))).length, requestCount, '取消后退不得请求目标页面')
})

test('软跳目标 hash 在历史滚动恢复前优先定位', async () => {
  const { w, tick } = makeTopicSpaHome()
  const forumHtml = homeHtml.replace(/<\/main>/i, '<div id="route-anchor"></div></main>')
  const calls = stubHtmlFetch(w, forumHtml)
  const targets = []
  w.HTMLElement.prototype.scrollIntoView = function (options) {
    targets.push({ id: this.id, options })
  }
  await loadBase(w, PLUG('skin.user.js'))

  const link = w.document.createElement('a')
  link.href = 'https://linux.sb/forum/4#route-anchor'
  w.document.querySelector('main.wrap').append(link)
  link.click()
  await tick(140)

  assert.ok(calls.some((url) => /\/forum\/4/.test(url)))
  assert.ok(targets.some(({ id }) => id === 'route-anchor'), '目标 URL hash 应滚动到正文锚点')
})

test('帖子软跳后退恢复历史滚动位置，显式楼层定位优先', async () => {
  const { w, tick, until } = makeTopicSpaHome()
  const calls = stubHtmlFetch(w, (url) => /\/topic\//.test(String(url)) ? topicHtml : homeHtml)
  const scrolls = []
  w.scrollTo = (x, y) => scrolls.push([x, y])
  Object.defineProperty(w, 'scrollY', { configurable: true, value: 318, writable: true })
  const targets = []
  w.HTMLElement.prototype.scrollIntoView = function (options) {
    targets.push({ id: this.id, options })
  }
  await loadBase(w, PLUG('skin.user.js'))
  const toTopic = w.document.createElement('a')
  toTopic.href = 'https://linux.sb/topic/1'
  w.document.querySelector('main.wrap').append(toTopic)
  toTopic.click()
  await tick(120)
  assert.ok(calls.some((url) => /\/topic\/1$/.test(url)))
  assert.ok(scrolls.some(([, y]) => y === 0), '普通帖子进入应请求窗口回到顶部')
  w.history.back()
  assert.equal(await until(() => w.location.pathname === '/' && !!w.document.querySelector('.home-shell'), 2000), true)
  assert.equal(w.scrollY, 318, '后退回列表应恢复历史滚动位置')

  const explicit = w.document.createElement('a')
  explicit.href = 'https://linux.sb/topic/1?replyid=24'
  w.document.querySelector('main.wrap').append(explicit)
  explicit.click()
  await tick(120)
  assert.ok(targets.some((entry) => entry.id === 'post-24' && entry.options.block === 'center'), '显式 replyid 应覆盖普通滚动恢复')
})

test('帖子正文不进入壳内活 DOM 缓存，重复进入会重新请求', async () => {
  const { w, tick } = makeTopicSpaHome()
  const calls = stubHtmlFetch(w, (url) => /\/topic\//.test(String(url)) ? topicHtml : homeHtml)
  await loadBase(w, PLUG('skin.user.js'))
  const addTopicLink = () => {
    const link = w.document.createElement('a')
    link.href = 'https://linux.sb/topic/1'
    w.document.querySelector('main.wrap').append(link)
    return link
  }
  addTopicLink().click()
  await tick(120)
  w.document.querySelector('.breadcrumb a[href="/"]')?.click()
  await tick(120)
  const before = calls.filter((url) => /\/topic\/1/.test(url)).length
  addTopicLink().click()
  await tick(120)
  const after = calls.filter((url) => /\/topic\/1/.test(url)).length
  assert.equal(after, before + 1)
})

test('壳内跳转：点版块只换主栏，壳不卸、原顶栏不露馅', async () => {
  const { w, tick } = makeHome()
  const poisoned = homeHtml.replace(/<main\b[^>]*>/i, (m) => `${m}<script>window.__spa_leaked=1</script>`)
  const calls = stubHtmlFetch(w, poisoned)
  await loadBase(w, PLUG('skin.user.js'))

  const shellNode = w.document.getElementById('lsb-shell')
  const link = w.document.createElement('a')
  link.href = 'https://linux.sb/forum/4'
  link.textContent = '技术交流'
  w.document.querySelector('main.wrap').append(link)
  link.click()
  await tick(80)

  assert.ok(calls.some((u) => /\/forum\/4/.test(u)), '拦下点击去拉 HTML，不整页跳')
  assert.equal(w.document.getElementById('lsb-shell'), shellNode, '壳是同一个节点，没拆再建')
  assert.equal(w.location.pathname, '/forum/4')
  assert.ok(w.document.querySelector('body > .top')?.classList.contains('lsb-native-header-hidden'), '原顶栏仍藏着')
  assert.ok(w.document.documentElement.classList.contains('lsb-skin-shell-on'))
  assert.equal(w.__spa_leaked, undefined, '换入的 script 不得执行')
  assert.ok(!w.document.querySelector('main.wrap script'), '换入的内容剥掉 script，避免原站脚本把壳打乱')
})

test('壳内跳转：帖子返回列表也复用同一颗画布', async () => {
  const { w, tick } = makeSite()
  const calls = stubHtmlFetch(w, homeHtml)
  await loadBase(w, PLUG('skin.user.js'))
  await tick(60)
  const shellNode = w.document.getElementById('lsb-shell')

  const link = w.document.querySelector('.breadcrumb a[href="/"]')
  assert.ok(link, '帖子页应有返回首页的链接')
  link.click()
  await tick(100)

  assert.ok(calls.some((url) => /\/$/.test(String(url)) || /\/index\.php/.test(String(url))), '返回列表应发起阅读 GET')
  assert.equal(w.location.pathname, '/')
  assert.equal(w.document.getElementById('lsb-shell'), shellNode)
  assert.ok(w.document.querySelector('ul.post-list'))
})

test('帖子分页软跳，列表分页仍不由壳拦截', async () => {
  const topic = makeTopicSpaSite()
  const topicCalls = stubHtmlFetch(topic.w, (url) => (/[?&]p=2(?:&|$)/.test(String(url)) ? topicHtml : homeHtml))
  await loadBase(topic.w, PLUG('skin.user.js'))
  await topic.tick(60)
  const pagination = topic.w.document.createElement('nav')
  pagination.className = 'pagination-bar'
  pagination.innerHTML = '<a href="/topic/1?p=2">下一页</a>'
  topic.w.document.querySelector('main.wrap').append(pagination)
  pagination.querySelector('a').click()
  await topic.tick(120)

  assert.ok(topicCalls.some((url) => /\/topic\/1\?p=2/.test(url)), '帖子分页应由壳发起 GET')
  assert.equal(topic.w.location.pathname, '/topic/1')
  assert.equal(topic.w.location.search, '?p=2')
  assert.ok(topic.w.document.querySelector('.topic-post-list'))

  const list = makeHome()
  const listCalls = stubHtmlFetch(list.w, homeHtml)
  await loadBase(list.w, PLUG('skin.user.js'))
  const next = list.w.document.querySelector('.pagination-bar a[href*="p=2"]')
  assert.ok(next)
  next.classList.remove('sb-infinite-scroll-pagination-hidden')
  let listPageNavigationAllowed = false
  next.addEventListener('click', (event) => {
    listPageNavigationAllowed = !event.defaultPrevented
    event.preventDefault()
  }, { once: true })
  next.dispatchEvent(new list.w.MouseEvent('click', { bubbles: true, cancelable: true, button: 0 }))
  await list.tick(80)
  assert.equal(listPageNavigationAllowed, true, '列表分页由无限滚动或浏览器负责')
  assert.equal(listCalls.length, 0, '列表分页不应由壳 fetch')
})

test('帖子回复和楼层定位走软跳并优先使用 replyid', async () => {
  const reply = makeTopicSpaHome()
  const replyCalls = stubHtmlFetch(reply.w, topicHtml)
  const replyTargets = []
  reply.w.HTMLElement.prototype.scrollIntoView = function (options) {
    replyTargets.push({ id: this.id, options })
  }
  await loadBase(reply.w, PLUG('skin.user.js'))
  const replyLink = reply.w.document.createElement('a')
  replyLink.href = 'https://linux.sb/topic/1?replyid=24&floor=2'
  reply.w.document.querySelector('main.wrap').append(replyLink)
  replyLink.click()
  await reply.tick(120)
  assert.ok(replyCalls.some((url) => /\/topic\/1\?replyid=24&floor=2/.test(url)))
  assert.equal(replyTargets.length, 1)
  assert.equal(replyTargets[0].id, 'post-24')
  assert.equal(replyTargets[0].options.block, 'center')

  const floor = makeTopicSpaHome()
  const floorCalls = stubHtmlFetch(floor.w, topicHtml)
  const floorTargets = []
  floor.w.HTMLElement.prototype.scrollIntoView = function (options) {
    floorTargets.push({ id: this.id, options })
  }
  await loadBase(floor.w, PLUG('skin.user.js'))
  const floorLink = floor.w.document.createElement('a')
  floorLink.href = 'https://linux.sb/topic/1?floor=2'
  floor.w.document.querySelector('main.wrap').append(floorLink)
  floorLink.click()
  await floor.tick(120)
  assert.ok(floorCalls.some((url) => /\/topic\/1\?floor=2/.test(url)))
  assert.equal(floorTargets.length, 1)
  assert.equal(floorTargets[0].id, 'post-24')
  assert.equal(floorTargets[0].options.block, 'center')
})

test('帖子写操作表单仍交给原生提交', async () => {
  const { w, tick } = makeSite()
  const calls = stubHtmlFetch(w, homeHtml)
  await loadBase(w, PLUG('skin.user.js'))
  const before = calls.length
  const form = w.document.createElement('form')
  form.method = 'post'
  form.action = '/topic_favorite'
  form.innerHTML = '<button type="submit">收藏</button>'
  w.document.querySelector('main.wrap').append(form)
  let nativeSubmitAllowed = false
  form.addEventListener('submit', (event) => {
    nativeSubmitAllowed = !event.defaultPrevented
    event.preventDefault()
  }, { once: true })
  form.querySelector('button').click()
  await tick(20)
  assert.equal(nativeSubmitAllowed, true)
  assert.equal(calls.length, before)
})

test('帖子 GET 表单带原生标记时仍交给站点处理', async () => {
  const { w, tick } = makeSite()
  const calls = stubHtmlFetch(w, homeHtml)
  await loadBase(w, PLUG('skin.user.js'))
  const host = w.document.querySelector('main.wrap')
  const markers = [
    ['data-method', 'post'],
    ['data-confirm', '确认'],
    ['data-no-spa', '1'],
  ]
  for (const [name, value] of markers) {
    const form = w.document.createElement('form')
    form.method = 'get'
    form.action = '/topic/1'
    form.setAttribute(name, value)
    form.innerHTML = '<button type="submit">提交</button>'
    let nativeAllowed = false
    form.addEventListener('submit', (event) => {
      nativeAllowed = !event.defaultPrevented
      event.preventDefault()
    }, { once: true })
    host.append(form)
    form.querySelector('button').click()
    await tick(0)
    assert.equal(nativeAllowed, true, `${name} 表单应保留原生提交`)
  }
  assert.equal(calls.some((url) => /\/topic\/1/.test(url)), false, '原生标记表单不应发起壳的 topic GET')
})

test('氢壳：站点自己的无限滚动还在时不重复拉页', async () => {
  const { w, tick } = makeHome()
  w.document.querySelector('.pagination-bar')?.classList.add('sb-infinite-scroll-pagination-hidden')
  const calls = stubHtmlFetch(w, homeHtml)
  await loadBase(w, PLUG('skin.user.js'))
  w.dispatchEvent(new w.Event('scroll'))
  await tick(400)
  assert.equal(calls.length, 0, '原生 sb_infinite_scroll 已接手时，壳不要再发一发')
})

test('壳内跳转：分页链接不软跳，留给整页或无限滚动', async () => {
  const { w, tick } = makeHome()
  const calls = stubHtmlFetch(w, homeHtml)
  await loadBase(w, PLUG('skin.user.js'))
  const next = w.document.querySelector('.pagination-bar a[href*="p=2"]')
  assert.ok(next, '有下一页链接')
  next.classList.remove('sb-infinite-scroll-pagination-hidden')
  next.click()
  await tick(80)
  assert.equal(calls.length, 0, '点分页不能当成壳内换页，否则只会整页替换、滚不动')
  assert.equal(w.location.pathname, '/')
})

test('站点原生切到帖子后返回首页不恢复帖子正文，首页无限滚动仍可用', async () => {
  const { w, tick, until } = makeTopicSpaHome({
    'lsb_base:skin:__config': { uiMode: 'legacy' },
  })
  Object.defineProperty(w, 'innerWidth', { configurable: true, value: 1200 })
  const page2 = homeHtml.replace(
    '<ul class="post-list">',
    '<ul class="post-list"><li class="post-item"><div class="post-body"><a class="post-title" href="/topic/998878">原生路由返回后的下一页</a></div></li>',
  )
  const calls = stubHtmlFetch(w, (url) => (/[?&]p=2(?:&|$)/.test(String(url)) ? page2 : homeHtml))
  await loadBase(w, PLUG('skin.user.js'))

  const outlet = w.document.querySelector('main.wrap')
  const nativeTopic = new JSDOM(topicHtml).window.document.querySelector('main.wrap')
  w.history.pushState({}, '', '/topic/1')
  outlet.replaceChildren(...[...nativeTopic.childNodes].map((node) => w.document.importNode(node, true)))
  w.LSB.bus.emit('route:changed', { href: w.location.href })
  await tick(80)

  const forumLink = w.document.createElement('a')
  forumLink.href = 'https://linux.sb/forum/4'
  outlet.append(forumLink)
  forumLink.click()
  assert.equal(await until(() => w.location.pathname === '/forum/4' && !w.document.querySelector('ul.topic-post-list')), true,
    '站点帖子正文被替换后仍可继续使用皮肤软跳')
  const homeLink = w.document.querySelector('.lsb-shell-brand')
  assert.ok(homeLink, '软跳版块页仍显示返回首页入口')
  homeLink.click()

  assert.equal(await until(() => w.location.pathname === '/', 1500), true, '品牌入口应返回首页')
  assert.ok(w.document.querySelector('.main-panel > ul.post-list:not(.topic-post-list)'),
    `返回首页应呈现首页主题列表，实际页面含 topic=${!!w.document.querySelector('ul.topic-post-list')}`)
  assert.equal(w.document.querySelector('li.post-entry'), null, '首页不能恢复已读帖子的正文和评论楼层')

  const list = w.document.querySelector('.main-panel > ul.post-list')
  const panel = list.closest('.main-panel')
  Object.defineProperty(panel, 'clientHeight', { configurable: true, value: 500 })
  panel.getBoundingClientRect = () => ({ top: 0, bottom: 500 })
  list.getBoundingClientRect = () => ({ top: 0, bottom: 0, left: 0, right: 0, width: 1, height: 0 })
  panel.dispatchEvent(new w.Event('scroll'))
  assert.equal(await until(() => calls.some((url) => /[?&]p=2(?:&|$)/.test(url)), 800), true,
    '恢复首页后滚动仍应请求下一页')
  assert.ok(list.querySelector('a[href*="/topic/998878"]'), '首页下一页主题应插入列表')
  w.LSB.disable('skin')
})

test('首页无限滚动不接管原生帖子楼层分页', async () => {
  const { w, tick } = makeTopicSpaHome({
    'lsb_base:skin:__config': { uiMode: 'legacy' },
  })
  Object.defineProperty(w, 'innerWidth', { configurable: true, value: 1200 })
  stubHtmlFetch(w, homeHtml)
  await loadBase(w, PLUG('skin.user.js'))

  const outlet = w.document.querySelector('main.wrap')
  const nativeTopic = new JSDOM(topicHtml).window.document.querySelector('main.wrap')
  w.history.pushState({}, '', '/topic/1')
  outlet.replaceChildren(...[...nativeTopic.childNodes].map((node) => w.document.importNode(node, true)))
  w.LSB.bus.emit('route:changed', { href: w.location.href })
  await tick(80)
  w.history.pushState({}, '', '/')
  w.LSB.bus.emit('route:changed', { href: w.location.href })
  await tick(100)

  const pagination = outlet.querySelector('.pagination-bar')
  assert.ok(outlet.querySelector('ul.topic-post-list'), '模拟原生首页路由尚未完成的帖子正文')
  assert.equal(pagination?.hasAttribute('data-lsb-shell-inf'), false,
    '帖子楼层分页不能被首页无限滚动接管')
  assert.equal(pagination?.classList.contains('sb-infinite-scroll-pagination-hidden'), false,
    '帖子楼层分页必须保持原生可见状态')
  w.LSB.disable('skin')
})

test('壳内跳转：从版块回首页后无限滚动仍可用', async () => {
  const { w, tick } = makeHome()
  const page2 = homeHtml.replace(
    '<ul class="post-list">',
    '<ul class="post-list"><li class="post-item"><div class="post-body"><a class="post-title" href="/topic/99003">回首页后第二页</a></div></li>',
  )
  stubHtmlFetch(w, (url) => {
    const href = String(url)
    if (/[?&]p=2(?:&|$)/.test(href)) return page2
    return homeHtml
  })
  await loadBase(w, PLUG('skin.user.js'))
  const toForum = w.document.createElement('a')
  toForum.href = 'https://linux.sb/forum/4'
  w.document.querySelector('main.wrap').append(toForum)
  toForum.click()
  await tick(80)
  assert.equal(w.location.pathname, '/forum/4')
  w.document.querySelector('.lsb-shell-brand')?.click()
  await tick(80)
  assert.equal(w.location.pathname, '/')
  const restoredList = w.document.querySelector('.main-panel > ul.post-list')
  assert.ok(restoredList, '返回后仍有首页列表')
  restoredList.getBoundingClientRect = () => ({ bottom: 0 })
  w.dispatchEvent(new w.Event('scroll'))
  await tick(400)
  assert.ok(
    [...w.document.querySelectorAll('ul.post-list > li.post-item')].some((li) =>
      /回首页后第二页/.test(li.textContent || ''),
    ),
    '软跳回首页后，站点脚本不会重跑，要由壳接着滚',
  )
})

test('legacy 验收：壳内跳转：左栏不拆节点，换入的原生侧栏当帧藏住，离开帖子只藏时间轴', async () => {
  const { w, tick } = makeLegacyHome()
  const forumWithAside = homeHtml
    .replace(
      /<main class="wrap">/i,
      '<main class="wrap"><div class="forum-enhancements-left-fixed performance-render-root"><nav class="forum-enhancements-left-navigation"><a href="/">社区首页</a></nav></div>',
    )
    .replace(
      /<\/main>/i,
      '<aside class="sidebar"><div class="sidebar-card">闪回侧栏</div></aside></main>',
    )
  stubHtmlFetch(w, (url) => (/\/forum\//.test(String(url)) ? forumWithAside : homeHtml))
  await loadBase(w, PLUG('skin.user.js'))

  const rail = w.document.getElementById('lsb-shell-rail')
  const board = rail?.querySelector('a[href^="/forum/"]')
  assert.ok(rail && board, '首页左栏已有版块链')

  const toForum = w.document.createElement('a')
  toForum.href = 'https://linux.sb/forum/4'
  w.document.querySelector('main.wrap').append(toForum)
  toForum.click()
  await tick(25)

  assert.equal(w.document.getElementById('lsb-shell-rail'), rail, '左栏还是同一节点')
  assert.ok(board.isConnected, '版块链没被 innerHTML 重绘冲掉')
  const injected = [...w.document.querySelectorAll('aside.sidebar')].find((el) =>
    (el.textContent || '').includes('闪回侧栏'),
  )
  assert.ok(injected, '新主栏里带着原生侧栏')
  assert.ok(
    injected.classList.contains('lsb-native-sidebar-hidden'),
    '换入当帧就藏原生侧栏，不能等 50ms 刷新，否则左/右栏会闪回原站',
  )
  const injectedLeft = [...w.document.querySelectorAll('.forum-enhancements-left-fixed')][0]
  assert.ok(injectedLeft, '新主栏里带着原生左侧导航')
  assert.equal(injectedLeft.closest('#lsb-shell'), null, '换入的原生左栏不能进入正文窗口')
  assert.ok(injectedLeft.classList.contains('lsb-native-left-hidden'), '换入当帧就藏原生左栏')
})

test('legacy 验收：壳内跳转：从帖子回首页只藏时间轴，不拆壳', async () => {
  const { w, tick } = makeLegacySite()
  stubHtmlFetch(w, homeHtml)
  await loadBase(w, PLUG('skin.user.js'))
  const rail = w.document.getElementById('lsb-shell-rail')
  const timeline = w.document.getElementById('lsb-shell-timeline')
  assert.ok(rail && timeline && !timeline.hidden, '帖子页有时间轴')

  w.document.querySelector('.lsb-shell-brand')?.click()
  await tick(80)
  assert.equal(w.location.pathname, '/')
  assert.equal(w.document.getElementById('lsb-shell-rail'), rail)
  assert.ok(w.document.getElementById('lsb-shell-timeline'))
  assert.equal(w.document.getElementById('lsb-shell-timeline').hidden, true)
})

test('legacy 验收：氢壳：从帖子回首页，左栏个人卡从回帖改回发帖', async () => {
  const { w, tick } = makeLegacySite()
  stubHtmlFetch(w, homeHtml)
  await loadBase(w, PLUG('skin.user.js'))

  const meOf = () => shell(w).querySelector('[data-lsb-shell-me] .sidebar-card.user-card')
  const hrefs = (el) => [...(el?.querySelectorAll('a') || [])].map((a) => a.getAttribute('href'))
  assert.ok(hrefs(meOf()).includes('#reply'), '帖内个人卡是回帖')
  assert.ok(!hrefs(meOf()).includes('/topic_edit'), '帖内个人卡不是发帖')

  w.document.querySelector('.lsb-shell-brand')?.click()
  await tick(80)
  assert.equal(w.location.pathname, '/')
  const me = meOf()
  assert.ok(me, '回到首页后自己的卡仍在左栏')
  assert.ok(hrefs(me).includes('/topic_edit'), '回首页后应换成发帖')
  assert.ok(!hrefs(me).includes('#reply'), '帖内回帖按钮不能跟着留在首页左栏')
  assert.equal(
    w.document.querySelectorAll('.sidebar-card.user-card').length,
    1,
    '换卡是迁入不是叠两张',
  )
})

test('legacy 验收：壳内跳转：顶栏入口不重复迁入，左栏没有最近浏览', async () => {
  const { w, tick } = makeLegacyHome()
  const extrasHtml =
    '<a class="forum-link forum-enhancements-custom-top-link" href="/leaderboard?type=points">用户榜单</a>' +
    '<a class="forum-link forum-enhancements-custom-top-link" href="https://lz.sb/">LZ.SB</a>' +
    '<a class="forum-link forum-enhancements-custom-top-link" href="/invite_center">邀请中心</a>'
  w.document.querySelector('.forum-nav').insertAdjacentHTML('beforeend', extrasHtml)
  stubHtmlFetch(w, (url) => (/\/forum\//.test(String(url)) ? homeHtml : homeHtml))
  await loadBase(w, PLUG('skin.user.js'))

  const extraTexts = () =>
    [...w.document.querySelectorAll('.lsb-shell-extras a')].map((a) => a.textContent.trim())
  assert.deepEqual(
    extraTexts(),
    ['用户榜单', 'LZ.SB', '邀请中心'],
    '进帖子前顶栏入口各一份',
  )

  const rail = w.document.getElementById('lsb-shell-rail')
  assert.ok(rail)
  assert.equal(rail.querySelector('[data-lsb-shell-section="recent"]'), null, '左栏不挂最近浏览槽')
  assert.ok(!rail.textContent.includes('最近浏览'), '左栏文案里也没有最近浏览')
  assert.ok(
    [...rail.querySelectorAll('[data-lsb-shell-section="boards"] a')].length >= 6,
    '版块列表仍在',
  )

  const toForum = w.document.createElement('a')
  toForum.href = 'https://linux.sb/forum/4'
  w.document.querySelector('main.wrap').append(toForum)
  toForum.click()
  await tick(80)
  w.document.querySelector('body > .top .forum-nav')?.insertAdjacentHTML('beforeend', extrasHtml)
  w.document.querySelector('.lsb-shell-brand')?.click()
  await tick(80)

  assert.deepEqual(extraTexts(), ['用户榜单', 'LZ.SB', '邀请中心'], '站点脚本再注入同一批入口，壳里仍各一份')
  assert.equal(rail.querySelector('[data-lsb-shell-section="recent"]'), null)
  assert.ok(!rail.textContent.includes('最近浏览'), '进出帖子后左栏仍不出现最近浏览')
})


test('壳内跳转：不存在的 /latest 不进入软跳白名单', async () => {
  const { w, tick } = makeHome()
  const calls = stubHtmlFetch(w, topicHtml)
  await loadBase(w, PLUG('skin.user.js'))

  const link = w.document.createElement('a')
  link.href = 'https://linux.sb/latest'
  let nativeNavigationAllowed = false
  link.addEventListener('click', (event) => {
    nativeNavigationAllowed = !event.defaultPrevented
    event.preventDefault()
  }, { once: true })
  w.document.querySelector('main.wrap').append(link)
  link.click()
  await tick(20)

  assert.equal(nativeNavigationAllowed, true, '不存在的伪路由应交给浏览器，而非壳内软跳')
  assert.equal(calls.length, 0, '伪路由不应发起软跳请求')
})

test('壳内跳转：外链、新标签、非浏览页不拦截', async () => {
  const { w, tick } = makeHome()
  const calls = stubHtmlFetch(w, topicHtml)
  await loadBase(w, PLUG('skin.user.js'))

  const host = w.document.querySelector('main.wrap')
  const external = w.document.createElement('a')
  external.href = 'https://lz.sb/'
  external.textContent = 'LZ'
  const blank = w.document.createElement('a')
  blank.href = 'https://linux.sb/topic/1'
  blank.target = '_blank'
  blank.textContent = '新标签'
  const board = w.document.createElement('a')
  board.href = 'https://linux.sb/leaderboard?type=points'
  board.textContent = '榜单'
  host.append(external, blank, board)

  external.click()
  blank.click()
  board.click()
  await tick(40)
  assert.equal(calls.length, 0, '这三类都走浏览器自己的跳转')
})

test('壳内跳转：关壳后恢复整页跳转', async () => {
  const { w, tick } = makeHome({ 'lsb_base:skin:__config': { shell: false } })
  const calls = stubHtmlFetch(w, topicHtml)
  await loadBase(w, PLUG('skin.user.js'))

  const link = w.document.createElement('a')
  link.href = 'https://linux.sb/topic/1'
  w.document.querySelector('main.wrap').append(link)
  link.click()
  await tick(40)
  assert.equal(calls.length, 0)
})

test('氢壳：精华 / 抽奖 / 称号页顶栏文案跟路由走', async () => {
  const featured = makeDom(homeHtml, 'https://linux.sb/topic_featured', withIos27Mode())
  await loadBase(featured.w, PLUG('skin.user.js'))
  let dbg = await featured.w.LSB.bus.request('skin:debug')
  assert.equal(dbg.shell.location, '精华')

  const lucky = makeDom(homeHtml, 'https://linux.sb/index.php?sort=lucky', withIos27Mode())
  await loadBase(lucky.w, PLUG('skin.user.js'))
  dbg = await lucky.w.LSB.bus.request('skin:debug')
  assert.equal(dbg.shell.location, '抽奖')

  const red = makeDom(homeHtml, 'https://linux.sb/index.php?sort=red_packet', withIos27Mode())
  await loadBase(red.w, PLUG('skin.user.js'))
  dbg = await red.w.LSB.bus.request('skin:debug')
  assert.equal(dbg.shell.location, '红包')

  const gacha = makeDom(homeHtml, 'https://linux.sb/gacha', withIos27Mode())
  await loadBase(gacha.w, PLUG('skin.user.js'))
  dbg = await gacha.w.LSB.bus.request('skin:debug')
  assert.equal(dbg.shell.location, '称号抽取')

  const market = makeDom(homeHtml, 'https://linux.sb/gacha_market', withIos27Mode())
  await loadBase(market.w, PLUG('skin.user.js'))
  dbg = await market.w.LSB.bus.request('skin:debug')
  assert.equal(dbg.shell.location, '称号交易')
})

test('氢壳：热议路由显示对应地点文案', async () => {
  const hot = makeDom(homeHtml, 'https://linux.sb/hot_discussions', withIos27Mode())
  await loadBase(hot.w, PLUG('skin.user.js'))
  const dbg = await hot.w.LSB.bus.request('skin:debug')
  assert.equal(dbg.shell.location, '热议')
})

test('壳内跳转：热议路由走软跳', async () => {
  const { w, tick } = makeTopicSpaHome()
  const calls = stubHtmlFetch(w, homeHtml)
  await loadBase(w, PLUG('skin.user.js'))
  const link = w.document.createElement('a')
  link.href = 'https://linux.sb/hot_discussions'
  link.textContent = '热议'
  w.document.querySelector('main.wrap').append(link)
  link.click()
  await tick(100)
  assert.ok(calls.some((u) => /\/hot_discussions/.test(u)), '热议应由 SPA 拉取远端 HTML')
  assert.equal(w.location.pathname, '/hot_discussions')
})

test('legacy 验收：氢壳：帖内时间轴能读 .post-time', async () => {
  const { w, tick } = makeLegacySite()
  for (const post of w.document.querySelectorAll('li.post-entry')) {
    post.querySelectorAll('time, [data-performance-time]').forEach((el) => el.remove())
    if (!post.querySelector('.post-time')) {
      const stamp = w.document.createElement('span')
      stamp.className = 'post-time'
      stamp.textContent = '昨天 21:03'
      post.append(stamp)
    }
  }
  await loadBase(w, PLUG('skin.user.js'))
  await tick(40)
  assert.equal(w.document.querySelector('[data-timeline-date]')?.textContent, '昨天 21:03')
})


test('壳内跳转：淘帖中心和申精走软跳；淘帖详情和认证中心整页', async () => {
  const { w, tick } = makeHome()
  const calls = stubHtmlFetch(w, homeHtml)
  await loadBase(w, PLUG('skin.user.js'))
  const shellNode = w.document.getElementById('lsb-shell')

  const collections = w.document.createElement('a')
  collections.href = 'https://linux.sb/topic_collections?tab=everyone'
  collections.textContent = '淘帖中心'
  w.document.querySelector('main.wrap').append(collections)
  collections.click()
  await tick(80)
  assert.ok(calls.some((u) => /\/topic_collections/.test(u)), '淘帖中心拦点击去拉 HTML')
  assert.equal(w.location.pathname, '/topic_collections')
  assert.equal(w.document.getElementById('lsb-shell'), shellNode)
  assert.equal((await w.LSB.bus.request('skin:debug')).shell.location, '淘帖中心')

  const essence = w.document.createElement('a')
  essence.href = 'https://linux.sb/topic_essence_review_list'
  essence.textContent = '申精'
  w.document.querySelector('main.wrap').append(essence)
  essence.click()
  await tick(80)
  assert.ok(calls.some((u) => /\/topic_essence_review_list/.test(u)), '申精拦点击去拉 HTML')
  assert.equal(w.location.pathname, '/topic_essence_review_list')
  assert.equal((await w.LSB.bus.request('skin:debug')).shell.location, '申精')

  const navigationCalls = () => calls.filter((url, index) => !isOnlineUserRequest(url, calls.inits?.[index]))
  const before = navigationCalls().length
  const album = w.document.createElement('a')
  album.href = 'https://linux.sb/topic_collection/153'
  album.textContent = 'MARK'
  w.document.querySelector('main.wrap').append(album)
  album.click()
  await tick(40)
  assert.equal(navigationCalls().length, before, '淘帖详情整页，不换 main')
  assert.equal(w.location.pathname, '/topic_essence_review_list', '软跳没改到淘帖详情')

  const identity = w.document.createElement('a')
  identity.href = 'https://linux.sb/identity_center'
  identity.textContent = '认证中心'
  w.document.querySelector('main.wrap').append(identity)
  identity.click()
  await tick(40)
  assert.equal(navigationCalls().length, before, '认证中心整页')
  assert.equal(w.location.pathname, '/topic_essence_review_list')

  const ads = w.document.createElement('a')
  ads.href = 'https://linux.sb/promotions'
  ads.textContent = '我的广告'
  w.document.querySelector('main.wrap').append(ads)
  ads.click()
  await tick(40)
  assert.equal(navigationCalls().length, before, '我的广告整页')
  assert.equal(w.location.pathname, '/topic_essence_review_list')
})

test('壳内跳转：软跳进淘帖后实时流不得改挂专辑列表', async () => {
  const { w, tick } = makeHome({
    'lsb_base:live-feed:__config': { jitterMs: 0, pollSec: 30, autoInsert: false },
  })
  stubHtmlFetch(w, homeHtml)
  await loadBase(w, PLUG('skin.user.js'), PLUG('live-feed.user.js'))
  const link = w.document.createElement('a')
  link.href = 'https://linux.sb/topic_collections?tab=everyone'
  w.document.querySelector('main.wrap').append(link)
  link.click()
  await tick(120)
  assert.equal(w.location.pathname, '/topic_collections')
  const feed = await w.LSB.bus.request('live-feed:debug')
  assert.equal(feed.mode(), null, '软跳进淘帖后仍不进 list 模式')
})

test('壳内跳转：精华页走软跳', async () => {
  const { w, tick } = makeHome()
  const calls = stubHtmlFetch(w, homeHtml)
  await loadBase(w, PLUG('skin.user.js'))
  const link = w.document.createElement('a')
  link.href = 'https://linux.sb/topic_featured'
  link.textContent = '精华'
  w.document.querySelector('main.wrap').append(link)
  link.click()
  await tick(80)
  assert.ok(calls.some((u) => /\/topic_featured/.test(u)), '精华拦点击去拉 HTML')
  assert.equal(w.location.pathname, '/topic_featured')
})

test('壳内跳转：软跳后超过 50ms 仍是同一颗壳，不因 route:changed 再拆', async () => {
  const { w, tick } = makeHome()
  stubHtmlFetch(w, (url) => (/\/forum\//.test(String(url)) ? homeHtml : homeHtml))
  await loadBase(w, PLUG('skin.user.js'))
  const shellNode = w.document.getElementById('lsb-shell')
  const me = w.document.querySelector('[data-lsb-shell-me] .sidebar-card.user-card')
  const link = w.document.createElement('a')
  link.href = 'https://linux.sb/forum/4'
  w.document.querySelector('main.wrap').append(link)
  link.click()
  await tick(120)
  assert.equal(w.location.pathname, '/forum/4')
  assert.equal(w.document.getElementById('lsb-shell'), shellNode)
  assert.equal(w.document.querySelector('[data-lsb-shell-me] .sidebar-card.user-card'), me)
})

test('壳内跳转：皮肤+实时流时版块 URL 只 GET 一次', async () => {
  const { w, tick, until } = makeHome({
    'lsb_base:live-feed:__config': { jitterMs: 0, pollSec: 30, autoInsert: false },
  })
  const calls = stubHtmlFetch(w, (url) => {
    const href = String(url)
    if (/\/forum\/4/.test(href)) return homeHtml
    return homeHtml
  })
  await loadBase(w, PLUG('skin.user.js'), PLUG('live-feed.user.js'))
  const dbg = await w.LSB.bus.request('live-feed:debug')
  await until(() => dbg.role() === 'leader', 3000)
  await tick(80)
  const before = calls.filter((u) => /\/forum\/4/.test(u)).length
  const link = w.document.createElement('a')
  link.href = 'https://linux.sb/forum/4'
  w.document.querySelector('main.wrap').append(link)
  link.click()
  await tick(120)
  assert.equal(w.location.pathname, '/forum/4')
  const forumGets = calls.filter((u) => /\/forum\/4/.test(u)).length
  assert.equal(forumGets, before + 1, `软跳后实时流不得再拉版块页，实际 ${forumGets} before=${before} ${JSON.stringify(calls)}`)
})

function spanNames(w) {
  return w.LSB.bus.request('perf-probe:debug').then((d) => d.dump().map((x) => x.name))
}

test('壳内跳转：探针开着时软跳记下 fetch/parse/commit/fillShell/total/notify', async () => {
  const { w, tick } = makeHome({ 'lsb_base:perf-probe:__config': { enabled: true } })
  stubHtmlFetch(w, () => homeHtml)
  await loadBase(w, PLUG('perf-probe.user.js'), PLUG('skin.user.js'))
  const link = w.document.createElement('a')
  link.href = 'https://linux.sb/forum/4'
  w.document.querySelector('main.wrap').append(link)
  link.click()
  await tick(40)
  const beforeNotify = [...(await spanNames(w))]
  for (const name of ['spa.fetch', 'spa.parse', 'spa.commit', 'spa.fillShell', 'spa.total']) {
    assert.ok(beforeNotify.includes(name), `软跳同步段要有 ${name}，实际 ${beforeNotify.join(',')}`)
  }
  await tick(120)
  const after = [...(await spanNames(w))]
  assert.ok(after.includes('spa.notify'), `绘制后要有 spa.notify，实际 ${after.join(',')}`)
})

test('软跳路由通知等待内容经历一次绘制后再运行', async () => {
  const { w, tick } = makeHome()
  stubHtmlFetch(w, () => homeHtml)
  await loadBase(w, PLUG('skin.user.js'))
  await tick(80)
  Object.defineProperty(w.document, 'visibilityState', { configurable: true, value: 'visible' })

  const frames = []
  let frameId = 0
  w.requestAnimationFrame = (callback) => {
    frames.push(callback)
    return ++frameId
  }
  const notified = []
  w.addEventListener('popstate', () => notified.push(w.location.pathname))
  const link = w.document.createElement('a')
  link.href = 'https://linux.sb/forum/4'
  w.document.querySelector('main.wrap').append(link)
  link.click()
  await tick(40)

  assert.equal(w.location.pathname, '/forum/4', '软跳先提交目标页面')
  assert.deepEqual(notified, [], '提交后的路由通知不能在首次绘制前同步执行')
  assert.ok(frames.length > 0, '软跳应等待首个绘制时序')
  const firstFrame = frames.splice(0)
  firstFrame.forEach((callback) => callback(Date.now()))
  await tick(0)
  assert.deepEqual(notified, [], '首个 requestAnimationFrame 仍在绘制前，需再等一帧')
  assert.ok(frames.length > 0, '首帧后应排入下一帧通知')
  const secondFrame = frames.splice(0)
  secondFrame.forEach((callback) => callback(Date.now()))
  await tick(0)
  assert.deepEqual(notified, ['/forum/4'], '内容已有绘制机会后再通知路由订阅者')
})
test('壳内跳转：探针关着时点版块不记 span', async () => {
  const { w, tick } = makeHome()
  stubHtmlFetch(w, () => homeHtml)
  await loadBase(w, PLUG('perf-probe.user.js'), PLUG('skin.user.js'))
  const dbg = await w.LSB.bus.request('perf-probe:debug')
  assert.equal(dbg.recording(), false)
  const link = w.document.createElement('a')
  link.href = 'https://linux.sb/forum/4'
  w.document.querySelector('main.wrap').append(link)
  link.click()
  await tick(120)
  assert.equal(dbg.dump().length, 0)
  assert.equal(w.location.pathname, '/forum/4')
})

test('缓存命中恢复双轴滚动和页面信息且不闪加载线', async () => {
  const { w, until } = makeTopicSpaHome()
  const homeTitle = w.document.title
  const homeDescription = w.document.querySelector('meta[name="description"]')
  const homeDescriptionValue = homeDescription.content
  const canonical = w.document.createElement('link')
  canonical.rel = 'canonical'
  canonical.href = 'https://linux.sb/'
  const ogTitle = w.document.createElement('meta')
  ogTitle.setAttribute('property', 'og:title')
  ogTitle.content = homeTitle
  w.document.head.append(canonical, ogTitle)
  const forumHtml = homeHtml
    .replace(/<title>[^<]*<\/title>/, '<title>版块缓存测试标题</title>')
    .replace(/<meta name="description" content="[^"]*">/, '<meta name="description" content="版块缓存测试描述">')
    .replace('</head>', '<link rel="canonical" href="https://linux.sb/forum/4"><meta property="og:title" content="版块缓存测试标题"></head>')
  const calls = stubHtmlFetch(w, forumHtml)
  Object.defineProperty(w, 'scrollX', { configurable: true, value: 31, writable: true })
  Object.defineProperty(w, 'scrollY', { configurable: true, value: 318, writable: true })
  await loadBase(w, PLUG('skin.user.js'))
  const outlet = w.document.querySelector('main.wrap')
  const oldList = outlet.querySelector('ul.post-list')
  const link = w.document.createElement('a')
  link.href = 'https://linux.sb/forum/4'
  outlet.append(link)
  link.click()
  const progress = w.document.getElementById('lsb-shell-progress')
  assert.equal(await until(() => w.location.pathname === '/forum/4' && w.document.title === '版块缓存测试标题', 2000, 10), true)
  assert.equal(await until(() => progress.dataset.phase === 'done', 1000, 10), true)
  assert.equal(await until(() => progress.dataset.phase === 'idle', 1500, 10), true)
  const requestsBeforeBack = calls.length

  w.history.back()
  assert.equal(await until(() => w.location.pathname === '/' && w.document.title === homeTitle, 2000, 10), true)
  assert.equal(outlet.querySelector('ul.post-list'), oldList, '缓存恢复继续使用同一份正文节点')
  assert.equal(w.document.title, homeTitle)
  assert.equal(canonical.href, 'https://linux.sb/')
  assert.equal(homeDescription.content, homeDescriptionValue)
  assert.equal(ogTitle.content, homeTitle)
  assert.equal(w.scrollX, 31, '缓存历史项恢复横向位置')
  assert.equal(w.scrollY, 318, '缓存历史项恢复纵向位置')
  assert.equal(calls.length, requestsBeforeBack, '缓存命中不再请求正文')
  assert.equal(progress.dataset.phase, 'idle', '缓存命中不应短暂显示加载或完成状态')
  assert.equal(w.getComputedStyle(progress).opacity, '0')
})

test('旧壳首页进入帖子仍保留已初始化文字广告节点与每日奖励监听', async () => {
  const { w, until, tick } = makeTopicSpaHome({
    'lsb_base:skin:__config': { uiMode: 'legacy', topicSpa: true },
  })
  Object.defineProperty(w, 'innerWidth', { configurable: true, value: 1200 })
  const sidebar = w.document.querySelector('aside.sidebar')
  const promotion = w.document.createElement('section')
  promotion.className = 'sidebar-card sidebar-promotions-card'
  promotion.dataset.promotionBoard = 'user_sidebar'
  promotion.dataset.sidebarPromotionsBoard = 'user_sidebar'
  promotion.dataset.sidebarPromotionsReady = '1'
  promotion.innerHTML = `
    <div class="sidebar-promotions-wrap" data-sidebar-promotions-wrap>
      <a class="sidebar-promotions-slot sidebar-promotions-slot-text"
        data-sidebar-promotions-ad-link="1" data-promotion-id="home-text"
        style="--sidebar-promotion-text:#ffffff;--sidebar-promotion-background:#2c72ce">领取奖励</a>
      <form data-sidebar-promotions-click-form hidden></form>
    </div>`
  const reward = promotion.querySelector('[data-sidebar-promotions-ad-link]')
  let clicks = 0
  reward.addEventListener('click', (event) => {
    event.preventDefault()
    clicks += 1
  })
  sidebar.append(promotion)

  const remotePromotion = `
    <section class="sidebar-card sidebar-promotions-card"
      data-promotion-board="user_sidebar" data-sidebar-promotions-board="user_sidebar">
      <div class="sidebar-promotions-wrap" data-sidebar-promotions-wrap>
        <a class="sidebar-promotions-slot sidebar-promotions-slot-text"
          data-sidebar-promotions-ad-link="1" data-promotion-id="remote-text">远端广告</a>
        <form data-sidebar-promotions-click-form hidden></form>
      </div>
    </section>`
  const remoteTopic = topicHtml.replace(/<\/main>/i, `<aside class="sidebar">${remotePromotion}</aside></main>`)
  stubHtmlFetch(w, (url) => /\/topic\/1/.test(String(url)) ? remoteTopic : homeHtml)
  await loadBase(w, PLUG('skin.user.js'))

  try {
    const siteInfo = w.document.querySelector('[data-lsb-shell-site]')
    assert.equal(await until(() => siteInfo?.contains(promotion)), true,
      '首页已初始化广告应先迁入旧壳右栏')

    const link = w.document.createElement('a')
    link.href = 'https://linux.sb/topic/1'
    w.document.querySelector('main.wrap').append(link)
    link.click()
    assert.equal(await until(() => w.location.pathname === '/topic/1' && !!w.document.querySelector('.topic-post-list')), true)

    assert.strictEqual(siteInfo.querySelector('.sidebar-promotions-card'), promotion,
      '进入帖子后仍应使用首页已初始化广告节点')
    assert.equal(reward.style.getPropertyValue('--sidebar-promotion-text'), '#ffffff')
    assert.equal(reward.style.getPropertyValue('--sidebar-promotion-background'), '#2c72ce')
    reward.click()
    await tick(0)
    assert.equal(clicks, 1, '进入帖子后每日广告奖励监听必须保留')
  } finally {
    w.LSB.disable('skin')
  }
})

test('从其他页面点击左栏全部主题后仍恢复每日热帖和广告', async () => {
  const { w, until } = makeHome({
    'lsb_base:skin:__config': { uiMode: 'legacy', topicSpa: true },
  })
  Object.defineProperty(w, 'innerWidth', { configurable: true, value: 1200 })
  const calls = stubHtmlFetch(w, homeHtml)
  const sidebar = w.document.querySelector('aside.sidebar')
  const hot = sidebar.querySelector('.daily-hot-topics-card')
  const promotion = w.document.createElement('section')
  promotion.className = 'sidebar-card sidebar-promotions-card'
  promotion.innerHTML = '<a data-sidebar-promotions-ad-link="1" style="--sidebar-promotion-text:#fff;--sidebar-promotion-background:#2c72ce">领取奖励</a>'
  const reward = promotion.querySelector('[data-sidebar-promotions-ad-link]')
  let clicks = 0
  reward.addEventListener('click', (event) => {
    event.preventDefault()
    clicks += 1
  })
  sidebar.append(promotion)
  await loadBase(w, PLUG('skin.user.js'))

  try {
    const siteInfo = w.document.querySelector('[data-lsb-shell-site]')
    assert.equal(await until(() => siteInfo?.contains(hot) && siteInfo?.contains(promotion)), true)
    const toForum = w.document.createElement('a')
    toForum.href = 'https://linux.sb/forum/4'
    w.document.querySelector('main.wrap').append(toForum)
    toForum.click()
    assert.equal(await until(() => w.location.pathname === '/forum/4' && !!w.document.querySelector('.home-shell')), true,
      '应先进入其他壳内页面')
    const homeRailLink = w.document.querySelector('[data-lsb-shell-section="home"] a[href="/"]')
    assert.ok(homeRailLink, '其他页面应显示左栏全部主题')
    homeRailLink.click()
    assert.equal(await until(() => w.location.pathname === '/' && !!w.document.querySelector('.home-shell')), true,
      '左栏全部主题应返回首页')
    assert.equal(await until(() => siteInfo?.contains(hot) && siteInfo?.contains(promotion)), true,
      '从其他页面点击左栏全部主题后不能丢失右栏卡片')
    assert.strictEqual(siteInfo.querySelector('.sidebar-promotions-card'), promotion,
      '返回首页后应继续使用原生广告节点')
    reward.click()
    await new Promise((resolve) => setTimeout(resolve, 0))
    assert.equal(clicks, 1, '返回首页后原生广告领取监听必须保留')
    assert.equal(homeGets(calls).length, 0,
      '首页缓存命中时不应重新请求首页')
  } finally {
    w.LSB.disable('skin')
  }
})

test('壳内跳转：版块再回首页不 GET，列表行是同一节点', async () => {
  const { w, tick } = makeHome()
  const calls = stubHtmlFetch(w, homeHtml)
  await loadBase(w, PLUG('skin.user.js'))
  const row = w.document.querySelector('ul.post-list > li.post-item')
  assert.ok(row)
  row.setAttribute('data-lsb-stash', '1')
  const toForum = w.document.createElement('a')
  toForum.href = 'https://linux.sb/forum/4'
  w.document.querySelector('main.wrap').append(toForum)
  toForum.click()
  await tick(80)
  assert.equal(w.location.pathname, '/forum/4')
  const n = homeGets(calls).length
  w.document.querySelector('.lsb-shell-brand')?.click()
  await tick(80)
  assert.equal(w.location.pathname, '/')
  assert.equal(homeGets(calls).length, n, '回首页不得再拉 /')
  const same = w.document.querySelector('[data-lsb-stash="1"]')
  assert.equal(same, row, '必须是挪回来的原节点，不能 importNode 一份新的')
})

test('壳内跳转：后退回首页也不 GET /', async () => {
  const { w, until } = makeHome()
  const calls = stubHtmlFetch(w, homeHtml)
  await loadBase(w, PLUG('skin.user.js'))
  const toForum = w.document.createElement('a')
  toForum.href = 'https://linux.sb/forum/4'
  w.document.querySelector('main.wrap').append(toForum)
  toForum.click()
  assert.equal(await until(() => w.location.pathname === '/forum/4', 2000), true)
  const n = homeGets(calls).length
  w.history.back()
  assert.equal(await until(() => w.location.pathname === '/', 2000), true)
  assert.equal(homeGets(calls).length, n)
})

test('壳内跳转：落在邀请中心时预取首页，点站名不再 GET', async () => {
  const { w, tick } = makeDom(homeHtml, 'https://linux.sb/invite_center', withIos27Mode())
  const calls = stubHtmlFetch(w, homeHtml)
  await loadBase(w, PLUG('skin.user.js'))
  await tick(80)
  assert.ok(homeGets(calls).length >= 1, 'setup 后要预取 /')
  const n = homeGets(calls).length
  w.document.querySelector('.lsb-shell-brand')?.click()
  await tick(80)
  assert.equal(w.location.pathname, '/')
  assert.equal(homeGets(calls).length, n, '点回首页用种子，不得再拉 /')
})

test('壳内跳转：离开首页后后台刷新存档，回来用新主栏且不再 GET', async () => {
  const { w, tick } = makeHome()
  const timers = holdLongTimers(w)
  const refreshed = homeHtml.replace(
    '<ul class="post-list">',
    '<ul class="post-list"><li class="post-item"><div class="post-body"><a class="post-title" href="/topic/88001">存档后台刷新的帖</a></div></li>',
  )
  let homeBody = homeHtml
  const calls = stubHtmlFetch(w, (url) => (/\/forum\/4/.test(String(url)) ? homeHtml : homeBody))
  await loadBase(w, PLUG('skin.user.js'))
  const toForum = w.document.createElement('a')
  toForum.href = 'https://linux.sb/forum/4'
  w.document.querySelector('main.wrap').append(toForum)
  toForum.click()
  await tick(80)
  assert.equal(w.location.pathname, '/forum/4')
  const n = homeGets(calls).length
  homeBody = refreshed
  await timers.flush()
  await tick(80)
  assert.ok(homeGets(calls).length > n, '人在版块时要后台拉一次 / 刷新存档')
  const afterRefresh = homeGets(calls).length
  w.document.querySelector('.lsb-shell-brand')?.click()
  await tick(80)
  assert.equal(w.location.pathname, '/')
  assert.equal(homeGets(calls).length, afterRefresh, '点站名用已刷新的存档，不得再拉 /')
  assert.ok(w.document.body.textContent.includes('存档后台刷新的帖'))
})

test('壳内跳转：整页打开的称号交易遇到 popstate 不得 reload', async () => {
  const { w, tick } = makeDom(homeHtml, 'https://linux.sb/gacha_market', withIos27Mode())
  stubHtmlFetch(w, homeHtml)
  await loadBase(w, PLUG('skin.user.js'))
  const reloads = stubReload(w)
  w.dispatchEvent(new w.Event('popstate'))
  await tick(20)
  assert.equal(reloads(), 0, '交易页是整页打开的，不能当成软跳失败去 reload')
})

test('壳内跳转：软跳文档被后退到非软跳地址才整页重开', async () => {
  const { w, tick } = makeHome()
  stubHtmlFetch(w, homeHtml)
  await loadBase(w, PLUG('skin.user.js'))
  const link = w.document.createElement('a')
  link.href = 'https://linux.sb/forum/4'
  w.document.querySelector('main.wrap').append(link)
  link.click()
  await tick(80)
  assert.equal(w.location.pathname, '/forum/4')
  const reloads = stubReload(w)
  w.history.pushState({ lsbShellSpa: true }, '', 'https://linux.sb/gacha_market')
  w.dispatchEvent(new w.Event('popstate'))
  await tick(20)
  assert.equal(reloads(), 1, '软跳主栏还在、地址已是交易页时必须 reload 才能挂上站点脚本')
})

test('legacy 验收：氢壳：首页地点是新帖子；淘帖 / 申精 / 认证有对应文案', async () => {
  const home = makeLegacyHome()
  await loadBase(home.w, PLUG('skin.user.js'))
  const homeDbg = await home.w.LSB.bus.request('skin:debug')
  assert.equal(homeDbg.shell.location, '新帖子')
  assert.equal(shell(home.w).querySelector('[data-lsb-shell-where]')?.textContent, '新帖子')
  assert.ok(shell(home.w).querySelector('a[href="/"]'), '左栏全部主题入口还在')

  const comment = makeDom(homeHtml, 'https://linux.sb/index.php?sort=comment', withIos27Mode())
  await loadBase(comment.w, PLUG('skin.user.js'))
  assert.equal((await comment.w.LSB.bus.request('skin:debug')).shell.location, '新评论')

  const cases = [
    ['https://linux.sb/topic_collections', '我的淘帖'],
    ['https://linux.sb/topic_collections?tab=everyone', '淘帖中心'],
    ['https://linux.sb/identity_center', '认证中心'],
    ['https://linux.sb/promotions', '我的广告'],
    ['https://linux.sb/direct_messages', '我的私信'],
    ['https://linux.sb/user_block', '屏蔽名单'],
    ['https://linux.sb/topic_essence_review_list', '申精'],
  ]
  for (const [url, label] of cases) {
    const { w } = makeDom(homeHtml, url, withIos27Mode())
    await loadBase(w, PLUG('skin.user.js'))
    const dbg = await w.LSB.bus.request('skin:debug')
    assert.equal(dbg.shell.location, label, url)
  }
})

test('legacy 验收：氢壳：论坛导航淘帖进顶栏；与淘帖中心同址只留一份', async () => {
  const onlyPlugin = makeLegacyHome()
  onlyPlugin.w.document.querySelector('.forum-nav').insertAdjacentHTML(
    'beforeend',
    '<a class="forum-link plugin-top-menu-link" href="/topic_collections?tab=everyone">淘帖</a>',
  )
  await loadBase(onlyPlugin.w, PLUG('skin.user.js'))
  const pluginExtras = [...shell(onlyPlugin.w).querySelectorAll('.lsb-shell-extras a')].map((a) => ({
    href: a.getAttribute('href'),
    label: a.textContent.trim(),
  }))
  assert.ok(
    pluginExtras.some((x) => x.href === '/topic_collections?tab=everyone' && x.label === '淘帖'),
    '没有增强菜单时，导航里的淘帖也要进顶栏',
  )

  const both = makeLegacyHome()
  both.w.document.querySelector('.forum-nav').insertAdjacentHTML(
    'beforeend',
    '<a class="forum-link plugin-top-menu-link" href="/topic_collections?tab=everyone">淘帖</a>' +
      '<a class="forum-link forum-enhancements-custom-top-link" href="/topic_collections?tab=everyone">淘帖中心</a>' +
      '<a class="forum-link forum-enhancements-custom-top-link" href="/identity_center">认证中心</a>',
  )
  await loadBase(both.w, PLUG('skin.user.js'))
  const extras = [...shell(both.w).querySelectorAll('.lsb-shell-extras a')]
  const labels = extras.map((a) => a.textContent.trim())
  const sameHref = extras.filter((a) => /topic_collections/.test(a.getAttribute('href') || ''))
  assert.equal(sameHref.length, 1, '淘帖和淘帖中心同址只挂一条')
  assert.equal(sameHref[0].textContent.trim(), '淘帖中心', '同址留下增强菜单文案')
  assert.ok(labels.includes('认证中心'))
  assert.ok(!labels.includes('淘帖'))
})

for (const mode of ['legacy', 'ios27']) {
  test(mode + ' 导航拆分：版块软跳及后退更新导航和文案，复用已有壳', async (t) => {
    const { w, until } = makeReadingHome(mode)
    t.after(() => w.close())
    stubHtmlFetch(w, homeHtml)
    await loadBase(w, PLUG('skin.user.js'))
    const shellNode = shell(w)
    const title = () => w.document.querySelector(mode === 'legacy' ? '[data-lsb-shell-where]' : '[data-canvas-status-title]')?.textContent
    assert.equal(await until(() => title() === '新帖子'), true)
    const link = w.document.createElement('a')
    link.href = '/forum/4'
    link.textContent = '技术交流'
    w.document.querySelector('main.wrap').append(link)
    link.click()
    assert.equal(await until(() => w.location.pathname === '/forum/4' && title() === '技术交流'), true)
    assert.equal(shell(w), shellNode)
    if (mode === 'legacy') {
      assert.equal(shellNode.querySelector('[data-lsb-shell-section="boards"] a[href="/forum/4"]').classList.contains('is-active'), true)
      assert.equal(shellNode.querySelector('[data-lsb-shell-section="home"] a').classList.contains('is-active'), false)
    } else {
      const current = w.document.querySelectorAll('[data-canvas-navigation-list] a[href="/forum/4"]')
      assert.equal(current.length, 1)
      assert.equal(current[0].textContent, '当前页面')
      assert.ok(w.document.querySelector('[data-canvas-navigation-list] a[href="/index.php?sort=post"]'))
    }
    w.history.back()
    assert.equal(await until(() => w.location.pathname === '/' && title() === '新帖子'), true)
    assert.equal(shell(w), shellNode)
    if (mode === 'legacy') {
      assert.equal(shellNode.querySelector('[data-lsb-shell-section="home"] a').classList.contains('is-active'), true)
      assert.equal(shellNode.querySelector('[data-lsb-shell-section="boards"] a[href="/forum/4"]').classList.contains('is-active'), false)
    } else {
      assert.equal(w.document.querySelector('[data-canvas-navigation-list] a[href="/forum/4"]').textContent, '技术交流')
      assert.equal(w.document.querySelectorAll('[data-canvas-navigation-list] a[href="/"]').length, 1)
    }
  })
}
