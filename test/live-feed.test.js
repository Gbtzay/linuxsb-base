/** 实时流：列表新帖横幅→免刷新插入；帖子新回复→追加楼层并联动事件；自适应间隔；消息增量聚合 */
import { test } from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { JSDOM } from 'jsdom'

const baseCode = readFileSync(new URL('../dist/linuxsb-base.user.js', import.meta.url), 'utf8')
const PLUG = (n) => readFileSync(new URL(`../plugins/${n}`, import.meta.url), 'utf8')
const homeHtml = readFileSync(new URL('./fixtures/home.html', import.meta.url), 'utf8')
const topicHtml = readFileSync(new URL('./fixtures/topic1.html', import.meta.url), 'utf8')

const EXTRA_TOPIC =
  '<li class="post-item"><div class="post-body"><div class="post-title-row">' +
  '<a class="post-title" href="/topic/99999999">实时流插入的新帖</a></div>' +
  '<div class="post-meta"><span data-performance-time="1893456000"></span><span>0</span></div></div></li>'
const EXTRA_FLOOR =
  '<li class="post-entry" id="post-999999" data-floor="200">' +
  '<a class="post-title post-author" href="/user/9">新人</a>' +
  '<span data-performance-time="1893456000"></span>' +
  '<div class="post-content"><p>这是实时加载的新楼层</p></div></li>'

function makeSite(html, url, preload = {}) {
  const dom = new JSDOM(html, { url: 'https://linux.sb' + url, runScripts: 'outside-only' })
  const w = dom.window
  w.unsafeWindow = w
  w.requestAnimationFrame = (fn) => setTimeout(() => fn(Date.now()), 0)
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

async function loadBase(w, ...plugins) {
  w.eval(baseCode)
  for (const code of plugins) w.eval(code)
  await new Promise((r) => setTimeout(r, 30))
}

function feedStub(w, getHtml) {
  const calls = []
  w.fetch = async (url) => {
    calls.push(String(url))
    return { status: 200, ok: true, url: String(url), text: async () => getHtml() }
  }
  return calls
}

test('实时流（列表）：基线无横幅 → 出现新帖出横幅 → 点击原地插入且不重复报', async () => {
  let serve = homeHtml
  const { w, tick, until } = makeSite(homeHtml, '/', {
    'lsb_base:live-feed:__config': { jitterMs: 0, autoInsert: false },
  })
  const calls = feedStub(w, () => serve)
  await loadBase(w, PLUG('live-feed.user.js'))

  const dbg = await w.LSB.bus.request('live-feed:debug')
  await until(() => dbg.role() === 'leader', 3000)
  await tick(60)
  await dbg.pollOnce()
  assert.equal(dbg.mode(), 'list')
  assert.equal(dbg.bannerVisible(), false, '首屏内容无新帖：不出横幅')

  // 站点出现一条新帖
  serve = homeHtml.replace('</ul>', EXTRA_TOPIC + '</ul>')
  await dbg.pollOnce()
  assert.ok(await until(() => dbg.bannerVisible()), '检测到新帖后横幅可见')
  const txt = w.document.querySelector('.lsb-live-banner .lsb-live-txt').textContent
  assert.match(txt, /▲ 1 条新帖/)

  // 点击 → 原地插入（置顶帖之后，免刷新）
  const before = w.document.querySelectorAll('ul.post-list > li.post-item').length
  const pinnedBefore = w.document.querySelectorAll('li.topic-pinned').length
  dbg.load()
  await tick(20)
  assert.equal(w.document.querySelectorAll('ul.post-list > li.post-item').length, before + 1)
  const items = [...w.document.querySelectorAll('ul.post-list > li.post-item')]
  const newIdx = items.findIndex(li => li.querySelector('a[href*="99999999"]'))
  assert.ok(newIdx >= 0, '新帖已插入')
  assert.equal(newIdx, pinnedBefore, '新帖插到置顶之后、普通帖之前')
  // 置顶仍在最前
  for (let i = 0; i < pinnedBefore; i++) {
    assert.ok(items[i].classList.contains('topic-pinned') || items[i].querySelector('.topic-badge.pinned'), '置顶保持在最顶部')
  }
  assert.equal(dbg.bannerVisible(), false, '加载完横幅隐藏')

  // 同内容再轮询：已入已见集合，不再误报
  await dbg.pollOnce()
  assert.equal(dbg.pending(), 0)
  assert.equal(dbg.bannerVisible(), false)
})

test('实时流（帖子）：新回复横幅 → 点击追加楼层并自动触发 topic:posts-added', async () => {
  let serve = topicHtml
  const { w, tick, until } = makeSite(topicHtml, '/topic/1', {
    'lsb_base:live-feed:__config': { jitterMs: 0, autoInsert: false }, // 本用例专测横幅路径
  })
  feedStub(w, () => serve)
  await loadBase(w, PLUG('live-feed.user.js'))

  const fired = []
  w.LSB.bus.on(
    'topic:posts-added',
    (posts) => fired.push(posts.map((p) => p.postId)),
    { owner: 'test-observer' },
  )

  const dbg = await w.LSB.bus.request('live-feed:debug')
  await until(() => dbg.role() === 'leader', 3000)
  await tick(60)
  await dbg.pollOnce()
  assert.equal(dbg.mode(), 'topic')
  assert.equal(dbg.bannerVisible(), false)

  serve = topicHtml.replace('</ul>', EXTRA_FLOOR + '</ul>')
  await dbg.pollOnce()
  assert.ok(await until(() => dbg.bannerVisible()))
  assert.match(w.document.querySelector('.lsb-live-banner .lsb-live-txt').textContent, /1 条新回复/)

  const floorsBefore = w.document.querySelectorAll('li.post-entry').length
  dbg.load()
  await tick(20)
  assert.equal(w.document.querySelectorAll('li.post-entry').length, floorsBefore + 1, '楼层已追加')
  assert.ok(w.document.querySelector('li#post-999999'), '目标楼层在文档中')
  assert.ok(
    await until(() => fired.some((batch) => batch.includes(999999)), 1500),
    '追加真实节点 → 基座派发 topic:posts-added（断点续读等零改动联动）',
  )
  assert.equal(dbg.bannerVisible(), false)
})

test('实时流：前台/后台自适应间隔与配置一致', async () => {
  const { w } = makeSite(homeHtml, '/', {
    'lsb_base:live-feed:__config': { pollSec: 12, bgSec: 240 },
  })
  await loadBase(w, PLUG('live-feed.user.js'))
  const dbg = await w.LSB.bus.request('live-feed:debug')
  assert.equal(dbg.intervalFor(false), 12000)
  assert.equal(dbg.intervalFor(true), 240000)
})

test('实时流：消息增量聚合自未读哨兵（横幅合并显示）', async () => {
  let serve = homeHtml
  const { w, tick, until } = makeSite(homeHtml, '/', {
    'lsb_base:live-feed:__config': { jitterMs: 0, autoInsert: false }, // 本用例专测横幅文案
  })
  feedStub(w, () => serve)
  // 假哨兵先于插件注册，保证激活时消息基线可立即建立
  await loadBase(w)


  // 假哨兵：提供可变的消息箱长度
  w.eval(`(() => {
    let n = 5
    window.__setInbox = (x) => { n = x }
    window.LSB.register(
      { id: 'fake-sentinel', name: '假哨兵', version: '1.0.0', permissions: ['events'] },
      (api) => { api.handle('unread-sentinel:debug', () => ({ inbox: () => new Array(n).fill(0) })) },
    )
  })()`)
  await new Promise((r) => setTimeout(r, 20))
  w.eval(PLUG('live-feed.user.js'))
  await new Promise((r) => setTimeout(r, 30))

  const dbg = await w.LSB.bus.request('live-feed:debug')
  await until(() => dbg.role() === 'leader', 3000)
  await tick(60)
  await dbg.pollOnce() // 基线 msgBase=5

  serve = homeHtml.replace('</ul>', EXTRA_TOPIC + '</ul>')
  w.__setInbox(8)
  await dbg.pollOnce()
  assert.ok(await until(() => dbg.bannerVisible()))
  const txt = w.document.querySelector('.lsb-live-banner .lsb-live-txt').textContent
  assert.match(txt, /▲ 1 条新帖/, `实际：${txt}`)
  assert.match(txt, /3 条新消息/, `8-5=3，实际：${txt}`)
})

const DECOYS =
  '<li class="post-item"><div class="post-body"><div class="post-title-row">' +
  '<a class="post-title" href="/topic/100">对侧流旧帖A</a></div>' +
  '<div class="post-meta"><span data-performance-time="100"></span><span>0</span></div></div></li>' +
  '<li class="post-item"><div class="post-body"><div class="post-title-row">' +
  '<a class="post-title" href="/topic/101">对侧流旧帖B</a></div>' +
  '<div class="post-meta"><span data-performance-time="101"></span><span>0</span></div></div></li>'

test('实时流：同流序数守卫——对侧流旧帖不再被误报为新帖（1 就是 1）', async () => {
  let serve = homeHtml
  const { w } = makeSite(homeHtml, '/', {
    'lsb_base:live-feed:__config': { jitterMs: 0, autoInsert: false },
  })
  feedStub(w, () => serve)
  await loadBase(w, PLUG('live-feed.user.js'))

  const dbg = await w.LSB.bus.request('live-feed:debug')
  await new Promise((r) => setTimeout(r, 80))
  await dbg.pollOnce()

  // 新到达流 = 1 条真新帖(id 超过基线) + 3 条对侧流旧帖(id 远小于基线、不在集合里)
  serve = homeHtml
    .replace('</ul>', DECOYS + '</ul>')
    .replace('</ul>', EXTRA_TOPIC + '</ul>')
  await dbg.pollOnce()
  assert.equal(dbg.pending(), 1, `只认 id 创新高的 1 条，实际 ${dbg.pending()}`)
})

test('实时流：真·自动加载——顶部状态下免点击原地插入', async () => {
  let serve = homeHtml
  const { w, tick, until } = makeSite(homeHtml, '/', {
    'lsb_base:live-feed:__config': { jitterMs: 0 }, // autoInsert 默认开
  })
  feedStub(w, () => serve)
  await loadBase(w, PLUG('live-feed.user.js'))
  const dbg = await w.LSB.bus.request('live-feed:debug')
  await new Promise((r) => setTimeout(r, 80))

  serve = homeHtml.replace('</ul>', EXTRA_TOPIC + '</ul>')
  const before = w.document.querySelectorAll('ul.post-list > li.post-item').length

  // 模拟用户停在页面顶部（jsdom scrollY 默认 0）
  await dbg.pollOnce()
  assert.equal(dbg.autoInsert(), true)
  assert.ok(
    await until(() => w.document.querySelectorAll('ul.post-list > li.post-item').length === before + 1),
    '新帖已自动插入列表顶部',
  )
  const items2 = [...w.document.querySelectorAll('ul.post-list > li.post-item')]
  const newIdx2 = items2.findIndex(li => li.querySelector('a[href*="99999999"]'))
  const pinned2 = w.document.querySelectorAll('li.topic-pinned').length
  assert.equal(newIdx2, pinned2, '自动插入的新帖位于置顶之后')
  assert.equal(dbg.bannerVisible(), false, '自动插入无需横幅')
})

test('实时流：上位巡检结束后会排上下一轮', async () => {
  const { w, until } = makeSite(homeHtml, '/', {
    'lsb_base:live-feed:__config': { jitterMs: 0, autoInsert: false },
  })
  feedStub(w, () => homeHtml)
  await loadBase(w, PLUG('live-feed.user.js'))
  const dbg = await w.LSB.bus.request('live-feed:debug')
  await until(() => dbg.role() === 'leader', 3000)
  assert.ok(
    await until(() => dbg.nextAt() != null, 1500),
    `上位后应排上下一轮巡检，nextAt=${dbg.nextAt()} lastErr=${dbg.lastErr()} mode=${dbg.mode()}`,
  )
})

const userHtml = readFileSync(new URL('./fixtures/user1.html', import.meta.url), 'utf8')
const notifyHtml = readFileSync(new URL('./fixtures/notifications.html', import.meta.url), 'utf8')

test('实时流：个人资料页新主题免刷新插入，且不复制原生未读点', async () => {
  let serve = userHtml
  const { w, until } = makeSite(userHtml, '/user/1', {
    'lsb_base:live-feed:__config': { jitterMs: 0, autoInsert: true },
  })
  feedStub(w, () => serve)
  await loadBase(w, PLUG('live-feed.user.js'))
  const dbg = await w.LSB.bus.request('live-feed:debug')
  await until(() => dbg.role() === 'leader', 3000)
  await dbg.pollOnce()
  assert.equal(dbg.mode(), 'list', '资料页主题列表应进入 list 模式')

  const extra =
    '<li class="post-item"><div class="post-body"><div class="post-title-row">' +
    '<a class="post-title" href="/topic/99999999">资料页新帖</a>' +
    '<a class="unread-topic-notice" href="/topic/99999999">未读</a>' +
    '<a class="unread-topic-notice" href="/topic/99999999">未读</a></div>' +
    '<div class="post-meta"><span data-performance-time="1893456000"></span><span>0</span></div></div></li>'
  serve = userHtml.replace('</ul>', extra + '</ul>')
  const before = w.document.querySelectorAll('ul.post-list > li.post-item').length
  await dbg.pollOnce()
  assert.ok(
    await until(() => w.document.querySelectorAll('ul.post-list > li.post-item').length === before + 1),
    '资料页新帖应免刷新插入',
  )
  const row = [...w.document.querySelectorAll('li.post-item')].find((li) =>
    li.querySelector('a.post-title[href="/topic/99999999"]'),
  )
  assert.ok(row)
  assert.equal(
    row.querySelectorAll('a.unread-topic-notice').length,
    1,
    '插入后只留一颗原生未读点，不能实时流再叠一颗',
  )
})

test('实时流：通知 tab 不当成主题流，避免误报新帖', async () => {
  const { w, until } = makeSite(notifyHtml, '/user/5372?tab=notifications', {
    'lsb_base:live-feed:__config': { jitterMs: 0, autoInsert: false },
  })
  feedStub(w, () => notifyHtml)
  await loadBase(w, PLUG('live-feed.user.js'))
  const dbg = await w.LSB.bus.request('live-feed:debug')
  await until(() => dbg.role() === 'leader', 3000)
  await dbg.pollOnce()
  assert.equal(dbg.mode(), null, '通知列表不是主题流')
  assert.equal(dbg.pending(), 0)
  assert.equal(dbg.bannerVisible(), false)
  assert.equal(dbg.lastErr(), null, '通知页巡检失败会在运行日志里报实时流出错')
})

test('实时流：列表里是通知条目时不进入主题流', async () => {
  const { w, until } = makeSite(notifyHtml, '/user/5372', {
    'lsb_base:live-feed:__config': { jitterMs: 0, autoInsert: false },
  })
  const fetched = []
  w.fetch = async (url) => {
    fetched.push(String(url))
    return { status: 200, ok: true, url: String(url), text: async () => notifyHtml }
  }
  await loadBase(w, PLUG('live-feed.user.js'))
  const dbg = await w.LSB.bus.request('live-feed:debug')
  await until(() => dbg.role() === 'leader', 3000)
  await dbg.pollOnce()
  assert.equal(dbg.mode(), null, '通知条目不能当新帖流')
  assert.equal(dbg.lastErr(), null)
  assert.equal(dbg.pending(), 0)
})

test('实时流：资料页被首页抢走主标签后仍继续巡检', async () => {
  const { w, until } = makeSite(userHtml, '/user/1', {
    'lsb_base:live-feed:__config': { jitterMs: 0, autoInsert: true },
  })
  feedStub(w, () => userHtml)
  await loadBase(w, PLUG('live-feed.user.js'))
  const dbg = await w.LSB.bus.request('live-feed:debug')
  await until(() => dbg.role() === 'leader', 3000)
  await dbg.pollOnce()
  dbg.demote()
  assert.equal(dbg.role(), 'follower')
  assert.ok(dbg.nextAt() != null, '让位后资料页仍要排下一轮，不能被首页主标签饿死')
})

test('实时流：哨兵不得打开通知页，也不能堵住当前页巡检', async () => {
  let serve = homeHtml
  const { w, until } = makeSite(homeHtml, '/', {
    'lsb_base:live-feed:__config': { jitterMs: 0, autoInsert: true },
    'lsb_base:unread-sentinel:__config': { jitterMs: 0, intervalMin: 1, badgeInTitle: false },
  })
  const calls = []
  let releaseNotify
  const notifyHold = new Promise((r) => {
    releaseNotify = r
  })
  w.fetch = async (url) => {
    const u = String(url)
    calls.push(u)
    if (/tab=notifications/.test(u)) {
      await notifyHold
      return { status: 200, ok: true, url: u, text: async () => '<html><body></body></html>' }
    }
    return { status: 200, ok: true, url: u, text: async () => serve }
  }
  await loadBase(w, PLUG('unread-sentinel.user.js'), PLUG('live-feed.user.js'))
  const dbg = await w.LSB.bus.request('live-feed:debug')
  await until(() => dbg.role() === 'leader', 3000)
  const first = dbg.pollOnce()
  const firstDone = await Promise.race([
    first.then(() => true),
    new Promise((r) => setTimeout(() => r(false), 2000)),
  ])
  assert.equal(firstDone, true, '实时流首轮巡检仍要结束')
  assert.ok(!calls.some((u) => /tab=notifications/.test(u)), `后台打开通知页会清未读：${JSON.stringify(calls)}`)
  serve = homeHtml.replace('</ul>', EXTRA_TOPIC + '</ul>')
  const before = w.document.querySelectorAll('ul.post-list > li.post-item').length
  const second = dbg.pollOnce()
  assert.ok(
    await until(() => w.document.querySelectorAll('ul.post-list > li.post-item').length === before + 1, 2000),
    '哨兵巡检首页时，新帖仍应插进当前列表',
  )
  await second
  releaseNotify()
})

test('实时流：精华 / 抽奖按新帖序数巡检，不当成回复流', async () => {
  const { w, until } = makeSite(homeHtml, '/topic_featured', {
    'lsb_base:live-feed:__config': { jitterMs: 0, autoInsert: false },
  })
  feedStub(w, () => homeHtml)
  await loadBase(w, PLUG('live-feed.user.js'))
  const dbg = await w.LSB.bus.request('live-feed:debug')
  await until(() => dbg.role() === 'leader', 3000)
  assert.equal(dbg.mode(), 'list')
  assert.equal(dbg.baseline().sort, 'post', '精华没有 sort=comment，要用 id 判新')

  const lucky = makeSite(homeHtml, '/index.php?sort=lucky', {
    'lsb_base:live-feed:__config': { jitterMs: 0, autoInsert: false },
  })
  feedStub(lucky.w, () => homeHtml)
  await loadBase(lucky.w, PLUG('live-feed.user.js'))
  const luckyDbg = await lucky.w.LSB.bus.request('live-feed:debug')
  await lucky.until(() => luckyDbg.role() === 'leader', 3000)
  assert.equal(luckyDbg.baseline().sort, 'post', '抽奖流按帖 id，不能因缺时间戳整页漏报')
})

test('实时流：route:changed 只重建基线，不立刻再 GET', async () => {
  const { w, tick, until } = makeSite(homeHtml, '/', {
    'lsb_base:live-feed:__config': { jitterMs: 0, pollSec: 30, autoInsert: false },
  })
  const calls = feedStub(w, () => homeHtml)
  await loadBase(w, PLUG('live-feed.user.js'))
  const dbg = await w.LSB.bus.request('live-feed:debug')
  await until(() => dbg.role() === 'leader', 3000)
  await tick(80)
  const n = calls.length
  assert.ok(n >= 1, '选主后首轮巡检至少 GET 一次')
  w.LSB.bus.emit('route:changed', { href: w.location.href, page: { ...w.LSB.__core.snapshot.page } }, { source: 'core' })
  await tick(80)
  assert.equal(calls.length, n, '换页广播后不能马上再拉当前列表')
  assert.equal(dbg.mode(), 'list')
  await dbg.pollOnce()
  assert.ok(calls.length > n, '手动 tick / 定时器仍要能巡检')
})

test('实时流：探针开着时 pollOnce 记一条 cycle', async () => {
  const { w, tick, until } = makeSite(homeHtml, '/', {
    'lsb_base:live-feed:__config': { jitterMs: 0, pollSec: 30, autoInsert: false },
    'lsb_base:perf-probe:__config': { enabled: true },
  })
  feedStub(w, () => homeHtml)
  await loadBase(w, PLUG('perf-probe.user.js'), PLUG('live-feed.user.js'))
  const feed = await w.LSB.bus.request('live-feed:debug')
  await until(() => feed.role() === 'leader', 3000)
  const probe = await w.LSB.bus.request('perf-probe:debug')
  const before = probe.dump().filter((x) => x.name === 'cycle').length
  await feed.pollOnce()
  await tick(40)
  const cycles = [...probe.dump()].filter((x) => x.name === 'cycle')
  assert.ok(cycles.length > before, '手动巡检要记 cycle')
  assert.equal(cycles.at(-1).plugin, 'live-feed')
})

const feedItem = (id, title, ts) =>
  '<li class="post-item"><div class="post-body"><div class="post-title-row">' +
  `<a class="post-title" href="/topic/${id}">${title}</a></div>` +
  `<div class="post-meta"><span data-performance-time="${ts}"></span><span>0</span></div></div></li>`

function pageWithItems(items) {
  const next = homeHtml.replace(/<ul class="post-list">[\s\S]*?<\/ul>/, `<ul class="post-list">${items}</ul>`)
  assert.notEqual(next, homeHtml, '夹具 ul.post-list 必须能被换成测试条目')
  return next
}

test('实时流：切到新评论不得把回复流整页报成新帖', async () => {
  const staleItems = [10, 11, 12, 13].map((id, i) => feedItem(id, `旧评论${id}`, 1700000000 + i)).join('')
  const hotItems = Array.from({ length: 12 }, (_, i) => feedItem(200 + i, `热评论${200 + i}`, 1800000000 + i)).join('')
  const hotPage = pageWithItems(hotItems)
  let serve = homeHtml
  const { w, tick, until } = makeSite(homeHtml, '/?sort=post', {
    'lsb_base:live-feed:__config': { jitterMs: 0, pollSec: 30, autoInsert: false },
  })
  const calls = feedStub(w, () => serve)
  await loadBase(w, PLUG('live-feed.user.js'))
  const dbg = await w.LSB.bus.request('live-feed:debug')
  await until(() => dbg.role() === 'leader', 3000)
  await dbg.pollOnce()
  assert.equal(dbg.baseline().sort, 'post')
  assert.equal(dbg.pending(), 0)

  // 存档还回：屏幕上是过期的新评论页，巡检却拉到已轮转的热页
  w.document.querySelector('ul.post-list').innerHTML = staleItems
  serve = hotPage
  w.history.pushState({}, '', '/?sort=comment')
  w.dispatchEvent(new w.PopStateEvent('popstate'))
  await until(() => w.LSB.info().page.sort === 'comment', 800)
  const n = calls.length
  w.LSB.bus.emit('spa:view-restored', { href: '/?sort=comment', live: false })
  await dbg.pollOnce()
  assert.ok(calls.length > n, '还回新评论仍应立刻巡检一页')
  assert.equal(dbg.baseline().sort, 'comment')
  assert.equal(dbg.pending(), 0, `切到新评论不能把热页 ${dbg.pending()} 条整页报新`)
  assert.equal(dbg.bannerVisible(), false)

  serve = hotPage.replace('</ul>', feedItem(999, '真新评论', 1900000000) + '</ul>')
  await dbg.pollOnce()
  assert.equal(dbg.pending(), 1, '水位对齐后只报真正新于当前页的一条')
})

test('实时流：存档还回首页后立刻巡检', async () => {
  const { w, tick, until } = makeSite(homeHtml, '/', {
    'lsb_base:live-feed:__config': { jitterMs: 0, pollSec: 30, autoInsert: false },
  })
  w.scrollTo = () => {}
  const calls = feedStub(w, () => homeHtml)
  await loadBase(w, PLUG('skin.user.js'), PLUG('live-feed.user.js'))
  const feed = await w.LSB.bus.request('live-feed:debug')
  await until(() => feed.role() === 'leader', 3000)
  await tick(80)
  const toForum = w.document.createElement('a')
  toForum.href = 'https://linux.sb/forum/4'
  w.document.querySelector('main.wrap').append(toForum)
  toForum.click()
  await tick(120)
  const n = calls.length
  w.document.querySelector('.lsb-shell-brand')?.click()
  await tick(120)
  assert.equal(w.location.pathname, '/')
  assert.ok(calls.length > n, '还回存档后要立刻 cycle 拉一页，不能干等到下一轮定时器')
})

test('实时流：非主标签还回存档也立刻巡检', async () => {
  const { w, tick, until } = makeSite(homeHtml, '/', {
    'lsb_base:live-feed:__config': { jitterMs: 0, pollSec: 30, autoInsert: false },
  })
  w.scrollTo = () => {}
  const calls = feedStub(w, () => homeHtml)
  await loadBase(w, PLUG('skin.user.js'), PLUG('live-feed.user.js'))
  const feed = await w.LSB.bus.request('live-feed:debug')
  await until(() => feed.role() === 'leader', 3000)
  await tick(80)
  const toForum = w.document.createElement('a')
  toForum.href = 'https://linux.sb/forum/4'
  w.document.querySelector('main.wrap').append(toForum)
  toForum.click()
  await tick(120)
  feed.demote()
  assert.equal(feed.role(), 'follower')
  const n = calls.length
  w.document.querySelector('.lsb-shell-brand')?.click()
  await tick(120)
  assert.equal(w.location.pathname, '/')
  assert.ok(calls.length > n, 'follower 还回存档也要立刻 cycle，不能因为 shouldPoll 为假而跳过')
})
