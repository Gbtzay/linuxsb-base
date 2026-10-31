import test from 'node:test'
import assert from 'node:assert/strict'
import { existsSync } from 'node:fs'
import { JSDOM } from 'jsdom'

const moduleUrl = new URL('../plugins/skin/navigation.js', import.meta.url)
const { createSkinNavigation } = existsSync(moduleUrl) ? await import(moduleUrl) : {}

function fixture(t, html = '') {
  assert.equal(typeof createSkinNavigation, 'function', '导航模块必须提供可单独验证的工厂')
  const dom = new JSDOM(html, { url: 'https://linux.sb/' })
  t.after(() => dom.window.close())
  const state = { page: { type: 'home' }, forums: [], location: new URL('https://linux.sb/'), parse: () => ({}) }
  const values = new Map()
  const writes = []
  const nav = createSkinNavigation({
    document: dom.window.document,
    getPage: () => state.page,
    getForums: () => state.forums,
    getLocation: () => state.location,
    parseTopic: (doc) => state.parse(doc),
    homeSorted: (sort) => { assert.equal(sort, 'post'); return '/?sort=post' },
    store: {
      get: (key) => values.get(key),
      set: (key, value) => { values.set(key, value); writes.push([key, value]) },
    },
  })
  return { nav, state, values, writes, document: dom.window.document }
}

test('导航版块优先使用完整站点目录，合并计数时保留真实零和未更新值', (t) => {
  const { nav, state, values, writes } = fixture(t, '<div class="forum-nav"><a href="/forum/99">局部目录</a></div>')
  const cached = { 4: 21, 7: 8, 9: 16 }
  values.set('boardCounts', cached)
  state.forums = [{ id: 4, name: '技术交流', topics: 0 }, { id: 7, name: '资源', topics: NaN }, { id: 11, name: '新板块' }]
  const input = structuredClone(state.forums)
  assert.deepEqual(nav.collectBoards(), [
    { href: '/forum/4', label: '技术交流', count: 0 },
    { href: '/forum/7', label: '资源', count: 8 },
    { href: '/forum/11', label: '新板块', count: undefined },
  ])
  assert.deepEqual(values.get('boardCounts'), { 4: 0, 7: 8, 9: 16 })
  assert.equal(writes[0][0], 'boardCounts')
  assert.deepEqual(cached, { 4: 21, 7: 8, 9: 16 })
  assert.deepEqual(state.forums, input)
  state.forums = [{ id: 4, name: '已改名' }]
  assert.deepEqual(nav.collectBoards(), [{ href: '/forum/4', label: '已改名', count: 0 }])
  assert.equal(writes.length, 1, '没有实时主题数时不重写缓存')
})

test('缺少基座版块目录时从原生导航去重，DOM 更新后重新读取', (t) => {
  const { nav, document, values, writes } = fixture(t, '<div class="forum-nav"><a href="/forum/4"> 技术交流 </a><a href="/forum/4">重复</a><a href="/forum/7">资源</a></div>')
  values.set('boardCounts', { 4: 12 })
  assert.deepEqual(nav.collectBoards(), [
    { href: '/forum/4', label: '技术交流', count: 12 },
    { href: '/forum/7', label: '资源', count: undefined },
  ])
  document.querySelector('.forum-nav').innerHTML = '<a href="/forum/9">新目录</a>'
  assert.deepEqual(nav.collectBoards(), [{ href: '/forum/9', label: '新目录', count: undefined }])
  assert.equal(writes.length, 0)
})

test('同一个导航实例按当前路由刷新文案、页面类型和活动链接', (t) => {
  const { nav, state } = fixture(t)
  assert.equal(nav.isActiveHref('/'), true)
  state.page = { type: 'forum', id: 4 }
  state.location = new URL('https://linux.sb/forum/4///?p=2#latest')
  state.forums = [{ id: 4, name: '技术交流' }]
  assert.equal(nav.pagePath(), '/forum/4')
  assert.equal(nav.locationText(), '技术交流')
  assert.equal(nav.canvasPageType(), 'forum')
  assert.equal(nav.isActiveHref('/forum/4'), true)
  assert.equal(nav.isActiveHref('/'), false)
  assert.equal(nav.isActiveHref('/forum/40'), false)
  assert.equal(nav.isActiveHref('/forum/4?p=2'), false, '保留旧三段式按版块入口判断活动态的语义')
  state.page = { type: 'topic', id: 4 }
  state.location = new URL('https://linux.sb/topic/4')
  assert.equal(nav.isActiveHref('/forum/4'), false)
  assert.equal(nav.canvasPageType(), 'topic')
  state.page = { type: 'home', sort: 'comment' }
  state.location = new URL('https://linux.sb/index.php')
  assert.equal(nav.locationText(), '新评论')
  assert.equal(nav.isActiveHref(''), true)
})

test('页面文案保留排序、业务页面和未知页面回退', (t) => {
  const { nav, state } = fixture(t)
  const cases = [
    ['/', { type: 'home', sort: 'lucky' }, '抽奖'],
    ['/', { type: 'home', sort: 'card' }, '发卡'],
    ['/', { type: 'home', sort: 'red_packet' }, '红包'],
    ['/', { type: 'home', sort: 'post' }, '新帖子'],
    ['/forum/404', { type: 'forum', id: 404 }, '版块'],
    ['/identity_center', {}, '认证中心'], ['/promotions', {}, '我的广告'],
    ['/direct_messages', {}, '我的私信'], ['/user_block', {}, '屏蔽名单'],
    ['/topic_essence_review_list', {}, '申精'], ['/hot_discussions', {}, '热议'],
    ['/user/1', { type: 'user' }, '用户'], ['/featured', { type: 'featured' }, '精华'],
    ['/footprint', { type: 'footprint' }, '足迹'], ['/gacha', { type: 'gacha' }, '称号抽取'],
    ['/gacha_market', { type: 'gacha_market' }, '称号交易'], ['/gacha_profile', { type: 'gacha_profile' }, '我的称号'],
    ['/wallet', { type: 'wallet' }, '我的烧饼'], ['/invite', { type: 'invite' }, '邀请中心'],
    ['/unknown', {}, 'LINUX SB'],
  ]
  for (const [path, page, expected] of cases) {
    state.page = page
    state.location = new URL(path, 'https://linux.sb')
    assert.equal(nav.locationText(), expected, path)
  }
})

test('淘帖文案区分页面 tab 与地址回退，并从实时标题读取详情', (t) => {
  const { nav, state, document } = fixture(t, '<h1> 第一份淘帖 </h1>')
  state.location = new URL('https://linux.sb/topic_collections?tab=all')
  state.page = { type: 'collections', tab: 'mine' }
  assert.equal(nav.locationText(), '我的淘帖')
  state.page = {}
  assert.equal(nav.locationText(), '淘帖中心')
  state.location = new URL('https://linux.sb/topic_collections')
  assert.equal(nav.locationText(), '我的淘帖')
  state.location = new URL('https://linux.sb/topic_collection/12')
  assert.equal(nav.locationText(), '第一份淘帖')
  document.querySelector('h1').textContent = '第二份淘帖'
  assert.equal(nav.locationText(), '第二份淘帖')
  document.querySelector('h1').remove()
  assert.equal(nav.locationText(), '淘帖')
})

test('帖子文案优先用站点解析器，异常或无标题时回退原生节点', (t) => {
  const { nav, state, document } = fixture(t, '<h1 class="post-content-title"> 原生标题 </h1>')
  state.page = { type: 'topic' }
  state.location = new URL('https://linux.sb/topic/12')
  state.parse = (doc) => { assert.equal(doc, document); return { title: '解析标题' } }
  assert.equal(nav.locationText(), '解析标题')
  state.parse = () => { throw new Error('站点结构变化') }
  assert.equal(nav.locationText(), '原生标题')
  state.parse = () => ({})
  document.querySelector('h1').textContent = ' 新标题 '
  assert.equal(nav.locationText(), '新标题')
  document.querySelector('h1').remove()
  assert.equal(nav.locationText(), '帖子')
})

test('画布页面分类优先使用已识别页面，否则按当前路径回退', (t) => {
  const { nav, state } = fixture(t)
  for (const [path, expected] of [['/', 'home'], ['/index.php', 'home'], ['/category/4', 'forum'], ['/topic/8', 'topic'], ['/user/2', 'user'], ['/preferences', 'settings'], ['/unknown', 'page']]) {
    state.page = {}
    state.location = new URL(path, 'https://linux.sb')
    assert.equal(nav.canvasPageType(), expected)
  }
  state.page = { type: 'settings' }
  state.location = new URL('https://linux.sb/forum/4')
  assert.equal(nav.canvasPageType(), 'settings')
  state.location = { get pathname() { throw new Error('地址不可读') } }
  assert.equal(nav.pagePath(), '')
})

test('导航列表保留站点顺序、当前 query/hash，并按原始 href 去重', (t) => {
  const { nav, state } = fixture(t, '<a href="/user/1?tab=favorites">收藏</a><form class="search-form" action="/meilisearch_search"></form>')
  state.location = new URL('https://linux.sb/forum/4?p=2#latest')
  state.forums = [{ id: 4, name: '技术交流' }, { id: 7, name: '资源' }]
  assert.deepEqual(nav.navigationEntries(), [
    { href: '/', label: '全部主题', group: '站点' },
    { href: '/?sort=post', label: '新帖子', group: '站点' },
    { href: '/forum/4?p=2#latest', label: '当前页面', group: '最近访问' },
    { href: '/user/1?tab=favorites', label: '我的收藏', group: '收藏' },
    { href: '/meilisearch_search', label: '站内搜索', group: '搜索' },
    { href: '/forum/4', label: '技术交流', group: '版块' },
    { href: '/forum/7', label: '资源', group: '版块' },
  ])
  state.location = new URL('https://linux.sb/forum/4')
  const current = nav.navigationEntries().filter((item) => item.href === '/forum/4')
  assert.deepEqual(current, [{ href: '/forum/4', label: '当前页面', group: '最近访问' }])
})

test('导航重新读取收藏和搜索入口，空 label 被忽略且不修改 DOM', (t) => {
  const { nav, state, document } = fixture(t)
  state.forums = [{ id: 4, name: '' }, { id: 7, name: '<img src=x onerror=alert(1)>' }]
  const before = document.documentElement.outerHTML
  assert.deepEqual(nav.navigationEntries(), [
    { href: '/', label: '全部主题', group: '站点' },
    { href: '/?sort=post', label: '新帖子', group: '站点' },
    { href: '/search', label: '站内搜索', group: '搜索' },
    { href: '/forum/7', label: '<img src=x onerror=alert(1)>', group: '版块' },
  ])
  assert.equal(document.documentElement.outerHTML, before)
  document.body.innerHTML = '<a href="/favorites">收藏</a><form class="search-form" action="/"></form>'
  const updated = nav.navigationEntries()
  assert.deepEqual(updated.filter((item) => item.group === '收藏'), [{ href: '/favorites', label: '我的收藏', group: '收藏' }])
  assert.equal(updated.filter((item) => item.href === '/').length, 1)
  assert.equal(updated.some((item) => item.group === '搜索'), false)
})

test('画布导航保留 80 个版块上限，旧三段式目录仍完整', (t) => {
  const { nav, state } = fixture(t)
  state.forums = Array.from({ length: 85 }, (_, i) => ({ id: i + 1, name: `版块 ${i + 1}` }))
  const boards = nav.navigationEntries().filter((item) => item.group === '版块')
  assert.equal(boards.length, 80)
  assert.equal(boards.at(-1).href, '/forum/80')
  assert.equal(nav.collectBoards().length, 85)
})
