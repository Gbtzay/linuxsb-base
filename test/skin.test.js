/** 界面精修：分项开关产出对应 CSS / 状态类；氢壳叠层；配置变更即时生效；themes 共存检测 */
import { test } from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { JSDOM } from 'jsdom'

const baseCode = readFileSync(new URL('../dist/linuxsb-base.user.js', import.meta.url), 'utf8')
const PLUG = (n) => readFileSync(new URL(`../plugins/${n}`, import.meta.url), 'utf8')
const topicHtml = readFileSync(new URL('./fixtures/topic1.html', import.meta.url), 'utf8')
const homeHtml = readFileSync(new URL('./fixtures/home.html', import.meta.url), 'utf8')
const userHtml = readFileSync(new URL('./fixtures/user1.html', import.meta.url), 'utf8')

function makeDom(html, url, preload = {}) {
  const dom = new JSDOM(html, { url, runScripts: 'outside-only' })
  const w = dom.window
  w.unsafeWindow = w
  w.requestAnimationFrame = (fn) => setTimeout(() => fn(Date.now()), 0)
  w.scrollTo = () => {}
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

function makeSite(preload = {}) {
  return makeDom(topicHtml, 'https://linux.sb/topic/1', preload)
}

function makeHome(preload = {}) {
  return makeDom(homeHtml, 'https://linux.sb/', preload)
}

function makeUser(preload = {}) {
  return makeDom(userHtml, 'https://linux.sb/user/1', preload)
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
    ['lsb-skin-code-on', 'lsb-skin-floors-on', 'lsb-skin-shell-on', 'lsb-skin-shell-topic', 'lsb-skin-type-on'],
    '默认三项排版 + 氢壳开启；帖子页额外挂 topic 类',
  )
  assert.equal(dbg.active.density, '舒适')
  assert.equal(dbg.active.shell, true)
  assert.ok(dbg.styleBytes > 0)
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
  w.unsafeWindow = w
  w.requestAnimationFrame = (fn) => setTimeout(() => fn(Date.now()), 0)
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

test('氢壳：首页叠壳、藏顶栏、迁入搜索、版块，无时间轴', async () => {
  const { w } = makeHome()
  await loadBase(w, PLUG('skin.user.js'))

  const root = shell(w)
  assert.ok(root, '默认挂 #lsb-shell')
  assert.ok(w.document.documentElement.classList.contains('lsb-skin-shell-on'))
  assert.ok(w.document.querySelector('body > .top')?.classList.contains('lsb-native-header-hidden'))

  const boards = [...root.querySelectorAll('a[href^="/forum/"]')].map((a) =>
    (a.querySelector('.lsb-shell-link-label')?.textContent || a.textContent).trim(),
  )
  assert.ok(boards.includes('错误地方'), '版块从导航快照')
  assert.ok(boards.includes('技术交流'))
  assert.ok(root.querySelector('a[href="/"]'), '全部主题回首页')

  const form = root.querySelector('form.search-form, form.lsb-shell-search')
  assert.ok(form, '搜索表单在壳内')
  assert.equal(form.getAttribute('action'), '/search')
  assert.ok(form.querySelector('input[name="q"], input[type="search"]'))
  assert.equal(w.document.querySelectorAll('form.search-form').length, 1, '搜索是迁入不是克隆')

  const checkin = root.querySelector('#lsb-shell-rail a[href*="daily_checkin"]')
  assert.equal(checkin, null, '左栏不再挂每日签到，避免和右栏快捷功能重复')
  assert.equal(root.querySelector('#lsb-shell-timeline'), null, '首页无时间轴')

  const me = root.querySelector('.sidebar-card.user-card, .lsb-shell-me .user-card')
  assert.ok(me, '登录用户卡迁入左栏，不随右栏一起藏掉')
  assert.ok(me.querySelector('a.user-name'), '用户卡仍有昵称入口')
  assert.equal(
    w.document.querySelectorAll('.sidebar-card.user-card').length,
    1,
    '用户卡是迁入不是克隆',
  )

  const dbg = await w.LSB.bus.request('skin:debug')
  assert.equal(dbg.shell.mounted, true)
  assert.ok(dbg.shell.boards >= 6)

  const railCss = skinCss(w).replace(/\s+/g, '')
  assert.match(
    railCss,
    /\.lsb-shell-rail-scroll\{[^}]*overflow:hidden/,
    '左栏不可滚，工具再多时再考虑要不要开滚动',
  )
  assert.doesNotMatch(railCss, /\.lsb-shell-rail-scroll\{[^}]*overflow:auto/)
})

test('氢壳：个人卡晚于壳出现时仍迁入左栏（LTS document-start 首屏竞态）', async () => {
  const { w, tick, until } = makeHome()
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

test('氢壳：左栏工具打开 AI 历史 / 签到日历 / 积分趋势 / 称号行情 / 年度报告', async () => {
  const { w } = makeHome()
  w.fetch = async (url) => ({
    status: 200,
    ok: true,
    url: String(url),
    text: async () => '<html><body></body></html>',
  })
  await loadBase(
    w,
    PLUG('ai-summary.user.js'),
    PLUG('checkin-calendar.user.js'),
    PLUG('points-ledger.user.js'),
    PLUG('title-quotes.user.js'),
    PLUG('annual-report.user.js'),
    PLUG('skin.user.js'),
  )
  const tools = shell(w).querySelector('[data-lsb-shell-section="tools"]')
  const labels = [...tools.querySelectorAll('.lsb-shell-link')].map((b) => b.textContent.trim())
  assert.deepEqual(labels, ['AI 历史', '签到日历', '积分趋势', '称号行情', '年度报告'])
  assert.equal(shell(w).querySelector('#lsb-shell-rail a[href*="daily_checkin"]'), null, '站点每日签到仍留给右栏快捷功能')
  assert.equal(tools.querySelector('[data-lsb-panel="title-quotes"]'), null)
  const quotes = tools.querySelector('[data-lsb-rpc="title-quotes:open"]')
  assert.ok(quotes)
  quotes.click()
  await new Promise((r) => setTimeout(r, 0))
  assert.ok(w.document.querySelector('.lsb-title-quotes-float'), '左栏应开浮层')
  assert.equal(w.document.querySelector('.lsb-panel-settings'), null, '不应打开氢设置面板')
  assert.equal(
    w.document.querySelector('.lsb-title-quotes-fab'),
    null,
    '氢壳开着不要右下行情钮',
  )

  const cal = tools.querySelector('[data-lsb-panel="checkin-calendar"]')
  cal.click()
  const active = [...w.document.querySelectorAll('.lsb-tab')].find((t) => t.classList.contains('is-active'))
  assert.equal(active?.textContent, '签到日历')
  assert.ok(w.document.querySelector('.lsb-panel-settings'))

  tools.querySelector('[data-lsb-panel="ai-summary-history"]').click()
  const hist = [...w.document.querySelectorAll('.lsb-tab')].find((t) => t.classList.contains('is-active'))
  assert.equal(hist?.textContent, 'AI 历史')
})

test('氢壳：左栏版块显示原站主题数', async () => {
  const { w } = makeHome()
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

  const { w: profile } = makeUser({ 'lsb_base:skin:boardCounts': { 1: 3862, 7: 78 } })
  await loadBase(profile, PLUG('skin.user.js'))
  const cached = [...shell(profile).querySelectorAll('[data-lsb-shell-section="boards"] a[href="/forum/1"]')][0]
  assert.equal(cached?.querySelector('.lsb-shell-count')?.textContent, '3862', '用户页没有侧栏版块卡，沿用首页记住的主题数')
})

test('氢壳：顶栏站名盖过左栏，并带站点 logo', async () => {
  const { w } = makeHome()
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

test('氢壳：站点大图灯箱落在左右栏之间，不藏壳', async () => {
  const { w } = makeSite()
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

test('界面精修：不再提供墙纸与液态玻璃', async () => {
  const { w } = makeSite({ 'lsb_base:skin:__config': { wallpaperUrl: 'https://example.com/w.jpg' } })
  await loadBase(w, PLUG('skin.user.js'))
  const root = w.document.documentElement
  assert.ok(!root.classList.contains('lsb-skin-wallpaper-on'))
  assert.ok(!root.classList.contains('lsb-skin-glass-on'))
  assert.equal(root.style.getPropertyValue('--lsb-wallpaper'), '')
  const dbg = await w.LSB.bus.request('skin:debug')
  assert.equal(dbg.active.wallpaperUrl, undefined)
  const compact = skinCss(w).replace(/\s+/g, '')
  assert.doesNotMatch(compact, /lsb-skin-wallpaper-on/)
  assert.doesNotMatch(compact, /lsb-skin-glass-on/)
  assert.doesNotMatch(compact, /blur\(22px\)/)
  assert.doesNotMatch(compact, /--lsb-wallpaper/)
  assert.match(compact, /#lsb-shell-rail\{[^}]*background:var\(--bg/)
  shell(w).querySelector('[data-lsb-shell-settings]').click()
  const view = w.document.querySelector('.lsb-view')
  assert.ok(!view.querySelector('input[type=file]'), '设置页不再选本地墙纸')
  assert.doesNotMatch(view.textContent, /墙纸|本地图/)
})

test('氢壳：搜索贴住左栏与主栏交界，不额外缩进', async () => {
  const { w } = makeHome()
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

test('氢壳：帖子页有时间轴并藏右栏', async () => {
  const { w } = makeSite()
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

test('氢壳：他人主页右栏迁入资料、简介和私信，不当成自己', async () => {
  const { w } = makeUser()
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

test('氢壳：从他人主页点回首页，右栏不再留着别人的资料和自己的卡', async () => {
  const { w, tick } = makeUser()
  stubHtmlFetch(w, (url) => (/\/user\//.test(String(url)) ? userHtml : homeHtml))
  await loadBase(w, PLUG('skin.user.js'))

  const asideBefore = shell(w).querySelector('#lsb-shell-aside')
  assert.match(asideBefore?.textContent || '', /痛失姓名的站长/, '进主页前右栏先有对方资料')

  shell(w).querySelector('a[href="/"]')?.click()
  await tick(120)

  assert.equal(w.location.pathname, '/')
  const aside = shell(w).querySelector('#lsb-shell-aside')
  const asideText = aside?.textContent || ''
  assert.ok(!/痛失姓名的站长/.test(asideText), '别人的资料不能跟着软跳留在首页右栏')
  assert.ok(!/私信TA/.test(asideText), '别人的私信入口也不能留')
  assert.equal(aside?.querySelector('.bio-card'), null, '别人的简介不能留')
  assert.equal(
    aside?.querySelectorAll('.sidebar-card.user-card').length,
    0,
    '首页右栏不放个人资料卡；自己的卡只在左栏',
  )
  const me = shell(w).querySelector('[data-lsb-shell-me] .sidebar-card.user-card')
  assert.ok(me, '回到首页后自己的卡在左栏')
  assert.ok(!/痛失姓名的站长/.test(me.textContent || ''))
  assert.ok(!w.document.documentElement.classList.contains('lsb-skin-shell-user'), '离开用户页要摘掉右栏用户页标记')
})

test('氢壳：帖子页右栏仍有快捷功能和统计，不只每日热帖', async () => {
  const { w } = makeHome()
  await loadBase(w, PLUG('skin.user.js'))
  const keep = JSON.parse(w.localStorage.getItem('lsb_base:skin:asideKeep') || 'null')
  assert.ok(keep?.quick && /快捷功能/.test(keep.quick), '首页要把快捷功能记住')
  assert.ok(keep?.stats && /站点统计/.test(keep.stats), '首页要把站点统计记住')

  const { w: topic } = makeSite({ 'lsb_base:skin:asideKeep': keep })
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

test('氢壳：顶栏搜索在站名右侧，用户入口紧跟搜索；进帖子不丢', async () => {
  const { w } = makeHome()
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

  const { w: topic } = makeSite({ 'lsb_base:skin:topExtras': stored })
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

test('氢壳：顶栏不回放「我的1」，也不把通知角标拼进入口', async () => {
  const { w } = makeHome({
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

test('氢壳：顶栏不挂「我的烧饼」，留给右栏快捷功能', async () => {
  const { w } = makeHome({
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

test('氢壳：样式是氢壳自己的，不是逛吧 Discourse 玻璃秀', async () => {
  const { w } = makeSite()
  await loadBase(w, PLUG('skin.user.js'))
  const css = skinCss(w)
  assert.ok(!/discourse/i.test(css), 'CSS 不含 discourse')
  assert.equal(w.document.querySelector('[id*="discourse"], [class*="discourse"]'), null)
  assert.ok(!/animation:[^;]*infinite/i.test(css), '无循环动画')
  assert.ok(css.includes('prefers-reduced-motion'))
  assert.ok(css.includes('prefers-reduced-transparency'))
  assert.ok(css.includes('#lsb-shell'))
  assert.ok(css.includes('lsb-skin-shell-on li.post-item'))
  assert.ok(css.includes('--lsb-radius:'), '圆角尺度变量')
  assert.ok(css.includes('html.lsb-skin-shell-on .forum-main'), '主栏圆角')
  assert.ok(css.includes('html.lsb-skin-shell-on li.post-entry'), '楼层圆角')
  assert.ok(
    !/html\.lsb-skin-shell-on li\.post-entry\{[^}]*overflow:hidden/.test(css),
    '楼层不能 overflow:hidden，否则楼中楼连线和移入的回复栏会被裁掉',
  )
})

test('氢壳：站点明暗切换钮迁入顶栏，关壳迁回', async () => {
  const { w, tick } = makeHome()
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

test('氢壳：新顶栏搜索入口迁入，关壳迁回', async () => {
  const { w, tick } = makeHome()
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

test('氢壳：新外观菜单迁入顶栏，关壳迁回', async () => {
  const { w, tick } = makeHome()
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

test('氢壳：站点把外观控件补回原顶栏时不再搬走，避免死循环', async () => {
  const { w, tick } = makeHome()
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

test('氢壳：开壳时隐藏右下角 H 按钮，关壳后显现', async () => {
  const { w, tick } = makeHome()
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

test('氢壳：设置按钮打开氢面板', async () => {
  const { w } = makeHome()
  await loadBase(w, PLUG('skin.user.js'))
  const btn = shell(w).querySelector('[data-lsb-shell-settings]')
  assert.ok(btn)
  btn.click()
  assert.ok(w.document.querySelector('.lsb-panel'), '打开设置面板')
})

test('氢壳：顶栏迁入用户榜单等入口，右栏迁入快捷功能/热帖/统计', async () => {
  const { w, tick } = makeHome()
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
})

test('氢壳：关壳后右栏卡片与顶栏入口回到原位', async () => {
  const { w, tick } = makeHome()
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

test('壳占位：iframe 内不注入基座与壳占位', async () => {
  const dom = new JSDOM('<!doctype html><html><body><iframe id="f"></iframe></body></html>', {
    url: 'https://linux.sb/',
    runScripts: 'outside-only',
  })
  const fw = dom.window.document.getElementById('f').contentWindow
  assert.notEqual(fw.self, fw.top, '夹具本身就是 iframe')
  fw.unsafeWindow = fw
  fw.requestAnimationFrame = (fn) => setTimeout(() => fn(Date.now()), 0)
  fw.eval(baseCode)
  assert.equal(fw.document.getElementById('lsb-shell-boot-style'), null, 'iframe 不占位')
  assert.equal(fw.document.getElementById('lsb-shell-boot-frame'), null, 'iframe 不画铬色块')
  assert.equal(fw.LSB, undefined, 'iframe 不安装 LSB')
  assert.ok(!fw.document.documentElement.classList.contains('lsb-shell-boot'))
})

test('壳占位：仅基座就在首屏注入与壳同尺寸的占位，不等皮肤 setup', async () => {
  const { w } = makeHome()
  w.eval(baseCode)
  assert.ok(bootStyle(w), 'document-start 就该有 #lsb-shell-boot-style')
  assert.ok(w.document.documentElement.classList.contains('lsb-shell-boot'))
  const css = bootCss(w).replace(/\s+/g, '')
  assert.ok(css.includes('padding-top:48px'), '顶栏 48')
  assert.ok(css.includes('padding-left:240px'), '左栏 240')
  assert.ok(css.includes('padding-right:280px'), '右栏 280')
  assert.ok(css.includes('min-width:900px'), '窄于 900 不占位')
  assert.ok(css.includes('min-width:1100px'), '宽屏才留右栏')
  assert.ok(css.includes('body>.top') || css.includes('body> .top'), '藏原顶栏')
  assert.ok(css.includes('aside.sidebar'), '藏原侧栏')
  assert.ok(/main\.wrap\{[^}]*max-width:none/.test(css), '主栏取消居中，避免先画 1100 再贴左')
})

test('壳占位：帖子页首屏就画出顶栏与左右栏色块，不等皮肤 setup', async () => {
  const { w } = makeSite()
  w.eval(baseCode)
  const frame = bootFrame(w)
  assert.ok(frame, '整页进帖时 document-start 就要有铬色块，不能等皮肤扫楼')
  assert.equal(frame.getAttribute('aria-hidden'), 'true')
  assert.ok(frame.querySelector('[data-boot="header"]'), '顶栏色块')
  assert.ok(frame.querySelector('[data-boot="rail"]'), '左栏色块')
  assert.ok(frame.querySelector('[data-boot="aside"]'), '右栏色块')
  const css = bootCss(w).replace(/\s+/g, '')
  assert.ok(css.includes('#lsb-shell-boot-frame'), '色块样式跟占位 CSS 一起注入')
  assert.ok(css.includes('pointer-events:none'), '色块不抢点击')
  assert.match(bootCss(w), /z-index:\s*79\d\d/, '叠在真壳（7999+）下面')
  assert.match(bootCss(w), /var\(--bg,\s*#f4f5f7\)/, '跟壳同一底色，避免先白后灰')
})

test('壳占位：配置里残留墙纸 URL 也不铺背景', async () => {
  const { w } = makeHome({ 'lsb_base:skin:__config': { wallpaperUrl: 'https://example.com/w.jpg' } })
  w.eval(baseCode)
  assert.doesNotMatch(bootCss(w), /background-image/)
  assert.doesNotMatch(bootCss(w), /example\.com/)
})

test('壳占位：配置关闭壳时不注入占位', async () => {
  const { w } = makeHome({ 'lsb_base:skin:__config': { shell: false } })
  w.eval(baseCode)
  assert.equal(bootStyle(w), null)
  assert.equal(bootFrame(w), null, '关壳不画铬色块')
  assert.ok(!w.document.documentElement.classList.contains('lsb-shell-boot'))
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
  assert.ok(!w.document.documentElement.classList.contains('lsb-shell-boot'))

  w.LSB.disable('skin')
  assert.equal(bootStyle(w), null, '停用皮肤仍无占位')
  assert.equal(bootFrame(w), null, '停用皮肤仍无铬色块')
})

function stubHtmlFetch(w, htmlFor) {
  const calls = []
  w.fetch = async (url) => {
    const href = String(url)
    calls.push(href)
    const html = typeof htmlFor === 'function' ? htmlFor(href) : htmlFor
    return {
      status: 200,
      ok: true,
      url: href,
      text: async () => html,
    }
  }
  return calls
}

function homeGets(calls) {
  return calls.filter((u) => {
    try {
      const x = new URL(String(u), 'https://linux.sb')
      const path = x.pathname.replace(/\/{2,}/g, '/') || '/'
      if (path !== '/' && path !== '/index.php') return false
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

test('壳内跳转：点帖子不软跳，讨论串留给站点脚本整页挂载', async () => {
  const { w, tick } = makeHome()
  const calls = stubHtmlFetch(w, topicHtml)
  await loadBase(w, PLUG('skin.user.js'))

  const shellNode = w.document.getElementById('lsb-shell')
  const link = w.document.createElement('a')
  link.href = 'https://linux.sb/topic/1'
  link.textContent = '去帖子'
  w.document.querySelector('main.wrap').append(link)
  link.click()
  await tick(80)

  assert.equal(calls.length, 0, '帖子走浏览器整页，不拦点击去换 main')
  assert.equal(w.document.getElementById('lsb-shell'), shellNode)
  assert.equal(w.location.pathname, '/', '软跳没改地址，整页跳转交给浏览器')
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

test('氢壳：首页无限滚动追加下一页，不必点分页', async () => {
  const { w, tick } = makeHome()
  const page2 = homeHtml.replace(
    '<ul class="post-list">',
    '<ul class="post-list"><li class="post-item"><div class="post-body"><a class="post-title" href="/topic/99002">壳补的第二页帖</a></div></li>',
  )
  await loadBase(w, PLUG('skin.user.js'))
  const pag = w.document.querySelector('.pagination-bar')
  assert.ok(pag, '首页有分页条')
  assert.ok(
    pag.classList.contains('sb-infinite-scroll-pagination-hidden'),
    '壳要把分页藏掉，改走滚到底加载',
  )
  const before = w.document.querySelectorAll('ul.post-list > li.post-item').length
  const calls = stubHtmlFetch(w, (url) => (/[?&]p=2(?:&|$)/.test(String(url)) ? page2 : homeHtml))
  w.dispatchEvent(new w.Event('scroll'))
  await tick(400)
  assert.ok(
    calls.some((u) => /[?&]p=2(?:&|$)/.test(u)),
    '滚到列表底部要去拉 ?p=2，而不是让用户点「下一页」',
  )
  assert.ok(
    [...w.document.querySelectorAll('ul.post-list > li.post-item')].some((li) =>
      /壳补的第二页帖/.test(li.textContent || ''),
    ),
    '下一页帖要追加进当前列表',
  )
  assert.ok(w.document.querySelectorAll('ul.post-list > li.post-item').length > before)
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
  w.dispatchEvent(new w.Event('scroll'))
  await tick(400)
  assert.ok(
    [...w.document.querySelectorAll('ul.post-list > li.post-item')].some((li) =>
      /回首页后第二页/.test(li.textContent || ''),
    ),
    '软跳回首页后，站点脚本不会重跑，要由壳接着滚',
  )
})

test('壳内跳转：左栏不拆节点，换入的原生侧栏当帧藏住，离开帖子只藏时间轴', async () => {
  const { w, tick } = makeHome()
  const forumWithAside = homeHtml.replace(
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
})

test('壳内跳转：从帖子回首页只藏时间轴，不拆壳', async () => {
  const { w, tick } = makeSite()
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

test('氢壳：从帖子回首页，左栏个人卡从回帖改回发帖', async () => {
  const { w, tick } = makeSite()
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

test('壳内跳转：顶栏入口不重复迁入，左栏没有最近浏览', async () => {
  const { w, tick } = makeHome()
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
  const featured = makeDom(homeHtml, 'https://linux.sb/topic_featured')
  await loadBase(featured.w, PLUG('skin.user.js'))
  let dbg = await featured.w.LSB.bus.request('skin:debug')
  assert.equal(dbg.shell.location, '精华')

  const lucky = makeDom(homeHtml, 'https://linux.sb/index.php?sort=lucky')
  await loadBase(lucky.w, PLUG('skin.user.js'))
  dbg = await lucky.w.LSB.bus.request('skin:debug')
  assert.equal(dbg.shell.location, '抽奖')

  const gacha = makeDom(homeHtml, 'https://linux.sb/gacha')
  await loadBase(gacha.w, PLUG('skin.user.js'))
  dbg = await gacha.w.LSB.bus.request('skin:debug')
  assert.equal(dbg.shell.location, '称号抽取')

  const market = makeDom(homeHtml, 'https://linux.sb/gacha_market')
  await loadBase(market.w, PLUG('skin.user.js'))
  dbg = await market.w.LSB.bus.request('skin:debug')
  assert.equal(dbg.shell.location, '称号交易')
})

test('氢壳：帖内时间轴能读 .post-time（v8.7.5 不再写 data-performance-time）', async () => {
  const { w, tick } = makeSite()
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
  assert.ok(after.includes('spa.notify'), `下一帧要有 spa.notify，实际 ${after.join(',')}`)
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
  const { w, tick } = makeHome()
  const calls = stubHtmlFetch(w, homeHtml)
  await loadBase(w, PLUG('skin.user.js'))
  const toForum = w.document.createElement('a')
  toForum.href = 'https://linux.sb/forum/4'
  w.document.querySelector('main.wrap').append(toForum)
  toForum.click()
  await tick(80)
  const n = homeGets(calls).length
  w.history.back()
  await tick(80)
  assert.equal(w.location.pathname, '/')
  assert.equal(homeGets(calls).length, n)
})

test('壳内跳转：落在邀请中心时预取首页，点站名不再 GET', async () => {
  const { w, tick } = makeDom(homeHtml, 'https://linux.sb/invite_center')
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
  const { w, tick } = makeDom(homeHtml, 'https://linux.sb/gacha_market')
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
