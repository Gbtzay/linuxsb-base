/** 未读哨兵（原三连里的悬浮引用已卸，改由 topic-preview 覆盖预览） */
import { test } from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { JSDOM } from 'jsdom'

const baseCode = readFileSync(new URL('../dist/linuxsb-base.user.js', import.meta.url), 'utf8')
const PLUG = (n) => readFileSync(new URL(`../plugins/${n}`, import.meta.url), 'utf8')
const FX = {
  topic: readFileSync(new URL('./fixtures/topic1.html', import.meta.url), 'utf8'),
  home: readFileSync(new URL('./fixtures/home.html', import.meta.url), 'utf8'),
  notifications: readFileSync(new URL('./fixtures/notifications.html', import.meta.url), 'utf8'),
}

function makeSite(name = 'topic', url = 'https://linux.sb/topic/1', preload = {}) {
  const dom = new JSDOM(FX[name], { url, runScripts: 'outside-only' })
  const w = dom.window
  w.unsafeWindow = w
  w.requestAnimationFrame = (fn) => setTimeout(() => fn(Date.now()), 0)
  w.localStorage.setItem('lsb_base:__core:rate', JSON.stringify(10))
  for (const [k, v] of Object.entries(preload)) w.localStorage.setItem(k, JSON.stringify(v))
  const tick = (ms) => new Promise((r) => setTimeout(r, ms))
  async function until(fn, ms = 1500, step = 20) {
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

/* ─────────── 未读哨兵 ─────────── */

function homeStub(calls) {
  return async (url) => {
    calls.push(String(url))
    return { status: 200, ok: true, url: String(url), text: async () => FX.home }
  }
}

const SENTINEL_PRELOAD = {
  'lsb_base:unread-sentinel:__config': {
    intervalMin: 1,
    jitterMs: 0,
    badgeInTitle: true,
    notifyDesktop: false,
  },
}

test('哨兵：单标签成为主节点；巡检产出消息箱与标题角标', async () => {
  const calls = []
  const { w, until } = makeSite('home', 'https://linux.sb/', SENTINEL_PRELOAD)
  await loadBase(w, PLUG('unread-sentinel.user.js'))
  w.fetch = homeStub(calls)

  const dbg = await w.LSB.bus.request('unread-sentinel:debug')
  await until(() => dbg.role() === 'leader', 3000)
  assert.equal(dbg.role(), 'leader')

  await dbg.tick()
  console.error('DIAG:', JSON.stringify(dbg.diag()))
    if (!dbg.inbox().length) {
    console.error('SENTINEL probe:', JSON.stringify(dbg.probe()), 'err:', dbg.lastError())
    console.error('CORE LOGS:', JSON.stringify(w.LSB.logs().slice(-6)))
  }
  assert.ok(dbg.inbox().length >= 20, `消息箱条目 ${dbg.inbox().length}；lastError=${dbg.lastError()}`)
  assert.match(dbg.title(), /^\([0-9]+\)/, `标题角标：${dbg.title()}`)

  const before = dbg.inbox().length
  await dbg.tick()
  assert.equal(dbg.inbox().length, before, '同水位线幂等')
})

test('哨兵：水位回退模拟新回复 → 合并计数', async () => {
  const { w, until } = makeSite('home', 'https://linux.sb/', SENTINEL_PRELOAD)
  await loadBase(w, PLUG('unread-sentinel.user.js'))
  w.fetch = homeStub([])

  const dbg = await w.LSB.bus.request('unread-sentinel:debug')
  await until(() => dbg.role() === 'leader', 3000)
  await dbg.tick()

  const first = dbg.inbox()[0]
  const n0 = dbg.inbox().length
  dbg.setSeenEntry(first.id, first.lastTs - 60000)
  await dbg.tick()
  assert.equal(dbg.inbox().length, n0, '同帖更新合并进原条目而非新增')
  const merged = dbg.inbox().find((x) => x.id === first.id)
  assert.equal(merged.count, 2, '同一帖合并计数')
  assert.match(dbg.title(), /^\([0-9]+\)/, '角标仍在')
})

function listPage(rows) {
  const lis = rows
    .map((r) => {
      const badge = r.pinned ? '<span class="topic-badge pinned">置顶</span>' : ''
      const cls = r.pinned ? 'post-item topic-pinned' : 'post-item'
      return `<li class="${cls}"><div class="post-body"><div class="post-title-row">${badge}<a class="post-title" href="/topic/${r.id}">${r.title}</a></div><div class="post-meta"><span data-performance-time="${r.ts}"></span><span>${r.replies ?? 0}</span></div></div></li>`
    })
    .join('')
  return `<!DOCTYPE html><html><body><ul class="post-list">${lis}</ul></body></html>`
}

function pageStub(htmlFn) {
  return async (url) => {
    const u = String(url)
    const html = /tab=notifications/.test(u) ? '<html><body></body></html>' : htmlFn()
    return { status: 200, ok: true, url: u, text: async () => html }
  }
}

test('哨兵：置顶帖不进消息箱，水位再新也不抢新动态入口', async () => {
  let html = listPage([
    { id: 9001, title: '置顶公告', pinned: true, ts: 9000, replies: 50 },
    { id: 9002, title: '普通帖', pinned: false, ts: 1000, replies: 1 },
  ])
  const { w, until } = makeSite('home', 'https://linux.sb/', SENTINEL_PRELOAD)
  w.fetch = pageStub(() => html)
  await loadBase(w, PLUG('unread-sentinel.user.js'))

  const dbg = await w.LSB.bus.request('unread-sentinel:debug')
  await until(() => dbg.role() === 'leader', 3000)
  await dbg.tick()

  const ids = () => [...dbg.inbox()].map((x) => Number(x.id))
  assert.deepEqual(ids(), [9002], `首轮不应收录置顶，实际 ${JSON.stringify(dbg.inbox())}`)
  assert.equal(dbg.seen()[9001], 9000, '置顶仍记账水位，避免解置顶后被当成全新帖')
  assert.equal(dbg.seen()[9002], 1000)

  html = listPage([
    { id: 9001, title: '置顶公告', pinned: true, ts: 9999, replies: 51 },
    { id: 9002, title: '普通帖', pinned: false, ts: 1000, replies: 1 },
  ])
  await dbg.tick()
  assert.deepEqual(ids(), [9002], '置顶再活跃也不进消息箱')
  assert.equal(dbg.inbox().find((x) => x.id === 9002).count, 1, '普通帖不应被置顶更新带着加计数')
  assert.equal(dbg.seen()[9001], 9999, '置顶水位仍推进')

  html = listPage([
    { id: 9001, title: '置顶公告', pinned: true, ts: 9999, replies: 51 },
    { id: 9003, title: '新帖', pinned: false, ts: 10000, replies: 0 },
    { id: 9002, title: '普通帖', pinned: false, ts: 1000, replies: 1 },
  ])
  await dbg.tick()
  assert.deepEqual(ids(), [9003, 9002], `新帖应排在消息箱前，实际 ${JSON.stringify(dbg.inbox())}`)
  assert.equal(dbg.inbox()[0].title, '新帖')
})

test('哨兵：消息箱里已有的置顶帖，下一轮巡检清掉', async () => {
  const { w, until } = makeSite('home', 'https://linux.sb/', {
    ...SENTINEL_PRELOAD,
    'lsb_base:unread-sentinel:inbox': [
      { id: 14259, title: '卡住的置顶', lastTs: 9999999999, count: 9, firstTs: 1 },
      { id: 888, title: '普通旧条目', lastTs: 1, count: 1, firstTs: 1 },
    ],
    'lsb_base:unread-sentinel:seen': { 14259: 1, 888: 1 },
  })
  await loadBase(w, PLUG('unread-sentinel.user.js'))
  w.fetch = homeStub([])

  const dbg = await w.LSB.bus.request('unread-sentinel:debug')
  await until(() => dbg.role() === 'leader', 3000)
  await dbg.tick()
  assert.ok(
    !dbg.inbox().some((x) => x.id === 14259),
    `置顶应从消息箱清掉，实际 ${JSON.stringify(dbg.inbox().slice(0, 3))}`,
  )
  assert.ok(
    dbg.inbox().some((x) => x.id === 888),
    '非置顶旧条目保留',
  )
})

function cardNotifyLink(root) {
  return [...root.querySelectorAll('.sidebar-card.user-card a[href*="tab=notifications"]')][0]
}

function putCardBadge(root, n) {
  const a = cardNotifyLink(root)
  if (!a) return null
  a.querySelectorAll('.notify-badge, .notification-unread').forEach((el) => el.remove())
  if (n > 0) {
    const label = n > 9 ? '9+' : String(n)
    a.insertAdjacentHTML('beforeend', `<span class="notify-badge">${label}</span>`)
  }
  return a
}

function homeWithBadge(n) {
  const dom = new JSDOM(FX.home, { url: 'https://linux.sb/' })
  putCardBadge(dom.window.document, n)
  return '<!DOCTYPE html>' + dom.window.document.documentElement.outerHTML
}

function homeBadgeStub(calls, n) {
  return async (url) => {
    const u = String(url)
    calls.push(u)
    return { status: 200, ok: true, url: u, text: async () => homeWithBadge(n) }
  }
}

function stripLogin(doc) {
  for (const el of [...doc.querySelectorAll('.sidebar-card.user-card, a[href="/profile"], a[href="/daily_checkin"], a.btn-post')]) {
    el.remove()
  }
  for (const a of [...doc.querySelectorAll('a')]) {
    const t = (a.textContent || '').replace(/\s+/g, '')
    if (/^我的/.test(t)) a.remove()
  }
}

function notifyLinks(w) {
  return [...w.document.querySelectorAll('a[href*="tab=notifications"]')].filter((a) => {
    if (a.classList.contains('nav-mine') || a.classList.contains('tab')) return false
    const href = a.getAttribute('href') || ''
    return !/[?&]p=/.test(href)
  })
}

function nativeLabel(a) {
  const el = a.querySelector('.notify-badge, .notification-unread, .mobile-nav-unread')
  if (!el || el.hasAttribute('data-lsb-notify-hid')) return ''
  return (el.textContent || '').trim()
}

function badgeLabels(w) {
  return notifyLinks(w).map((a) => nativeLabel(a))
}

test('哨兵：登录用户从首页个人卡抄红点；标题仍是消息箱', async () => {
  const calls = []
  const { w, until } = makeSite('home', 'https://linux.sb/', SENTINEL_PRELOAD)
  putCardBadge(w.document, 2)
  w.fetch = homeBadgeStub(calls, 2)
  await loadBase(w, PLUG('unread-sentinel.user.js'))

  const dbg = await w.LSB.bus.request('unread-sentinel:debug')
  await until(() => dbg.role() === 'leader', 3000)
  await dbg.tick()

  assert.ok(!calls.some((u) => /tab=notifications/.test(u)), `不应打开通知页：${JSON.stringify(calls)}`)
  assert.ok(notifyLinks(w).length >= 1, '首页有「我的通知」')
  assert.ok(
    badgeLabels(w).every((t) => t === '2') && badgeLabels(w).length === notifyLinks(w).length,
    `每条「我的通知」都应是 2，实际 ${JSON.stringify(badgeLabels(w))}`,
  )
  const inboxN = dbg.diag().unread
  assert.ok(inboxN >= 20, `消息箱未读 ${inboxN}`)
  assert.match(dbg.title(), new RegExp(`^\\(${inboxN}\\)`), '标题角标只反映首页水位，不含站点通知数')
})

test('哨兵：未读超过 9 展示 9+；下一轮个人卡没红点则卸掉', async () => {
  const calls = []
  let n = 12
  const { w, until } = makeSite('home', 'https://linux.sb/', SENTINEL_PRELOAD)
  putCardBadge(w.document, 12)
  w.fetch = async (url) => {
    calls.push(String(url))
    return { status: 200, ok: true, url: String(url), text: async () => homeWithBadge(n) }
  }
  await loadBase(w, PLUG('unread-sentinel.user.js'))

  const dbg = await w.LSB.bus.request('unread-sentinel:debug')
  await until(() => dbg.role() === 'leader', 3000)
  await dbg.tick()
  assert.deepEqual([...new Set(badgeLabels(w))], ['9+'])

  n = 0
  await dbg.tick()
  assert.ok(
    badgeLabels(w).every((t) => t === ''),
    '首页个人卡没红点后应卸掉角标',
  )
})

test('哨兵：访客不请求通知页', async () => {
  const calls = []
  const { w, until } = makeSite('home', 'https://linux.sb/', SENTINEL_PRELOAD)
  stripLogin(w.document)
  w.fetch = homeStub(calls)
  await loadBase(w, PLUG('unread-sentinel.user.js'))

  assert.equal(w.LSB.__core.snapshot.me.guest, true, '去掉登录锚点后快照是访客')
  const dbg = await w.LSB.bus.request('unread-sentinel:debug')
  await until(() => dbg.role() === 'leader', 3000)
  await dbg.tick()
  assert.ok(!calls.some((u) => /tab=notifications/.test(u)), `访客不应打通知页：${JSON.stringify(calls)}`)
  assert.deepEqual(badgeLabels(w), [])
})

test('哨兵：氢壳迁入个人卡后角标仍在「我的通知」上；停用卸掉', async () => {
  const calls = []
  const { w, until } = makeSite('home', 'https://linux.sb/', SENTINEL_PRELOAD)
  putCardBadge(w.document, 2)
  w.fetch = homeBadgeStub(calls, 2)
  await loadBase(w, PLUG('skin.user.js'), PLUG('unread-sentinel.user.js'))

  const dbg = await w.LSB.bus.request('unread-sentinel:debug')
  await until(() => dbg.role() === 'leader', 3000)
  await dbg.tick()

  const meLink = w.document.querySelector('[data-lsb-shell-me] a[href*="tab=notifications"]')
  assert.ok(meLink, '个人卡在左栏')
  assert.equal(w.document.querySelector('.lsb-notify-badge'), null, '不再叠壳自己的红点')
  assert.equal(nativeLabel(meLink), '2')

  w.LSB.disable('unread-sentinel')
  assert.equal(w.document.querySelector('.lsb-notify-badge'), null, '停用不留壳角标')
  assert.equal(w.document.querySelector('[data-lsb-notify]'), null, '停用卸掉我们补上的原生点')
})

test('哨兵：写回原生未读点，不叠壳红点；站点 display 也盖不掉', async () => {
  const { w, until } = makeSite('home', 'https://linux.sb/', SENTINEL_PRELOAD)
  w.document.head.insertAdjacentHTML(
    'beforeend',
    '<style>.notification-unread{display:inline-flex!important}</style>',
  )
  let mine = w.document.querySelector('a.nav-mine')
  if (mine) {
    if (!mine.querySelector('.online-users-dot')) {
      mine.insertAdjacentHTML('beforeend', '<span class="online-users-dot" title="在线"></span>')
    }
    if (!mine.querySelector('.notification-unread, .mobile-nav-unread')) {
      mine.insertAdjacentHTML('beforeend', '<span class="notification-unread">3</span>')
    }
  } else {
    const bar = w.document.querySelector('.bar') || w.document.body
    bar.insertAdjacentHTML(
      'beforeend',
      '<a class="nav-mine" href="/user/5372?tab=notifications" aria-label="通知">' +
        '<img class="avatar-img" alt="me">' +
        '<span class="online-users-dot" title="在线"></span>' +
        '<span class="notification-unread">3</span></a>',
    )
    mine = w.document.querySelector('a.nav-mine')
  }
  const main = w.document.querySelector('.tab-bar') || w.document.body
  main.insertAdjacentHTML(
    'afterbegin',
    '<a class="tab" href="/user/5372?tab=notifications">通知<span class="notification-unread">3</span></a>' +
      '<a href="/user/5372?tab=notifications&p=2">2</a>',
  )
  const cardLink = [...w.document.querySelectorAll('.sidebar-card.user-card a[href*="tab=notifications"]')][0]
  assert.ok(cardLink, '夹具个人卡要有我的通知')
  cardLink.insertAdjacentHTML('beforeend', '<span class="notify-badge">3</span>')

  w.fetch = homeBadgeStub([], 2)
  await loadBase(w, PLUG('unread-sentinel.user.js'))
  const dbg = await w.LSB.bus.request('unread-sentinel:debug')
  await until(() => dbg.role() === 'leader', 3000)
  await dbg.tick()

  mine = w.document.querySelector('a.nav-mine')
  const tab = w.document.querySelector('a.tab[href*="tab=notifications"]')
  const page = w.document.querySelector('a[href*="tab=notifications"][href*="p=2"]')
  assert.equal(w.document.querySelector('.lsb-notify-badge'), null, '不再画壳红点')
  assert.equal(cardLink.querySelector('.notify-badge')?.textContent, '2', '个人卡走原生 notify-badge')
  assert.equal(cardLink.querySelector('.notification-unread'), null, '不能再叠浅色胶囊，那是白点')
  assert.equal(nativeLabel(mine), '2', '顶栏头像上的原生点跟着实时变')
  assert.ok(mine.querySelector('.online-users-dot'), '在线绿点还在')
  assert.equal(nativeLabel(tab), '2', '资料页通知 tab 也只改原生点')
  assert.equal(page.querySelector('.notification-unread, .notify-badge, .lsb-notify-badge'), null, '翻页链不是通知入口')
})

test('哨兵：个人卡已有红底 notify-badge 时，卸掉叠上去的浅色 notification-unread', async () => {
  const { w, until } = makeSite('home', 'https://linux.sb/', SENTINEL_PRELOAD)
  const cardLink = [...w.document.querySelectorAll('.sidebar-card.user-card a[href*="tab=notifications"]')][0]
  assert.ok(cardLink)
  cardLink.insertAdjacentHTML(
    'beforeend',
    '<span class="notify-badge">3</span><span class="notification-unread">3</span>',
  )
  await loadBase(w, PLUG('unread-sentinel.user.js'))
  w.fetch = homeBadgeStub([], 2)
  const dbg = await w.LSB.bus.request('unread-sentinel:debug')
  await until(() => dbg.role() === 'leader', 3000)
  await dbg.tick()
  assert.equal(cardLink.querySelectorAll('.notify-badge').length, 1)
  assert.equal(cardLink.querySelector('.notify-badge')?.textContent, '2')
  assert.equal(cardLink.querySelector('.notification-unread'), null, '白点来自 notification-unread，要卸掉')
})

test('哨兵：库存还是 0 时不把站点红点先藏掉', async () => {
  const { w } = makeSite('home', 'https://linux.sb/', SENTINEL_PRELOAD)
  const cardLink = [...w.document.querySelectorAll('.sidebar-card.user-card a[href*="tab=notifications"]')][0]
  assert.ok(cardLink)
  cardLink.insertAdjacentHTML(
    'beforeend',
    '<span class="notify-badge">3</span><span class="notification-unread">3</span>',
  )
  w.fetch = async () => {
    throw new Error('offline')
  }
  await loadBase(w, PLUG('unread-sentinel.user.js'))
  assert.equal(nativeLabel(cardLink), '3', '刷新后站点红点应立刻还在，不能等巡检失败/库存 0 先藏掉')
  assert.equal(cardLink.querySelector('.notification-unread'), null, '浅色胶囊仍要卸，不然叠成白点')
})

test('哨兵：个人卡已有红点时立刻沿用，不等首页巡检', async () => {
  const { w } = makeSite('home', 'https://linux.sb/', SENTINEL_PRELOAD)
  putCardBadge(w.document, 2)
  const calls = []
  let releaseHome
  const homeHold = new Promise((r) => {
    releaseHome = r
  })
  w.fetch = async (url) => {
    const u = String(url)
    calls.push(u)
    if (/tab=notifications/.test(u)) {
      throw new Error('must not open notifications')
    }
    await homeHold
    return { status: 200, ok: true, url: u, text: async () => homeWithBadge(2) }
  }
  await loadBase(w, PLUG('unread-sentinel.user.js'))
  assert.equal(nativeLabel(notifyLinks(w)[0]), '2', '红点应立刻抄个人卡，不等首页巡检')
  assert.ok(!calls.some((u) => /tab=notifications/.test(u)), `不应打开通知页：${JSON.stringify(calls)}`)
  releaseHome()
})

test('哨兵：屏蔽设置上的 notify-badge 不是通知未读', async () => {
  const { w, until } = makeSite('home', 'https://linux.sb/', SENTINEL_PRELOAD)
  w.document.body.insertAdjacentHTML(
    'afterbegin',
    '<div id="lsb-kw-probe"><button type="button" class="home-keyword-filter-button">屏蔽设置' +
      '<span class="notify-badge home-keyword-filter-count">4</span></button></div>',
  )
  await loadBase(w, PLUG('unread-sentinel.user.js'))
  w.fetch = homeStub([])
  const dbg = await w.LSB.bus.request('unread-sentinel:debug')
  await until(() => dbg.role() === 'leader', 3000)
  await dbg.tick()
  const count = w.document.querySelector('#lsb-kw-probe .home-keyword-filter-count')
  assert.equal(count?.textContent, '4', '屏蔽条数不能被通知未读覆盖')
  assert.equal(count.hasAttribute('data-lsb-notify-hid'), false)
})

test('哨兵：不得打开通知页清未读；左栏红点跟首页个人卡走', async () => {
  const { w, until } = makeSite('home', 'https://linux.sb/', SENTINEL_PRELOAD)
  const cardLink = putCardBadge(w.document, 3)
  const calls = []
  const markedRead = FX.notifications.replace(/\sunread\b/g, '')
  w.fetch = async (url) => {
    const u = String(url)
    calls.push(u)
    if (/tab=notifications/.test(u)) {
      return { status: 200, ok: true, url: u, text: async () => markedRead }
    }
    const home = new w.DOMParser().parseFromString(FX.home, 'text/html')
    putCardBadge(home, 3)
    return { status: 200, ok: true, url: u, text: async () => '<!DOCTYPE html>' + home.documentElement.outerHTML }
  }
  await loadBase(w, PLUG('unread-sentinel.user.js'))
  const dbg = await w.LSB.bus.request('unread-sentinel:debug')
  await until(() => dbg.role() === 'leader', 3000)
  await dbg.tick()
  assert.ok(
    !calls.some((u) => /tab=notifications/.test(u)),
    `后台打开通知页会把未读标掉：${JSON.stringify(calls)}`,
  )
  assert.equal(nativeLabel(cardLink), '3', '左栏我的通知红点应仍是首页个人卡的数字')
})

test('哨兵：进自己的通知页后红点立刻掉，不把库存再画回去', async () => {
  const { w } = makeSite('home', 'https://linux.sb/user/5372?tab=notifications', {
    ...SENTINEL_PRELOAD,
    'lsb_base:unread-sentinel:notifyCount': 3,
  })
  const cardLink = putCardBadge(w.document, 0)
  assert.ok(cardLink, '通知页也有个人卡「我的通知」')
  w.fetch = async () => new Promise(() => {})
  await loadBase(w, PLUG('unread-sentinel.user.js'))
  assert.equal(w.LSB.__core.snapshot.page.tab, 'notifications')
  assert.equal(nativeLabel(cardLink), '', '站点已标已读时不能用库存 3 再造一颗红点')
  assert.equal(cardLink.querySelector('[data-lsb-notify]'), null)
})

test('哨兵：软跳后不要把补上的红点当成原生 0', async () => {
  const { w, until } = makeSite('home', 'https://linux.sb/', SENTINEL_PRELOAD)
  putCardBadge(w.document, 0)
  w.fetch = homeBadgeStub([], 3)
  await loadBase(w, PLUG('unread-sentinel.user.js'))
  const dbg = await w.LSB.bus.request('unread-sentinel:debug')
  await until(() => dbg.role() === 'leader', 3000)
  await dbg.tick()
  const card = cardNotifyLink(w.document)
  assert.equal(nativeLabel(card), '3', '巡检抄到首页个人卡后应补上红点')
  assert.ok(card.querySelector('[data-lsb-notify]'), '活页没有原生点时由哨兵补上')
  w.LSB.bus.emit('route:changed', { href: w.location.href, page: { ...w.LSB.__core.snapshot.page } }, { source: 'core' })
  assert.equal(nativeLabel(card), '3', '软跳后不能把补上的点当成 0 清掉')
  assert.equal(dbg.diag().notifyCount, 3)
})

test('哨兵：人还在自己的通知页时，首页巡检不能把红点画回来', async () => {
  const { w, until } = makeSite('home', 'https://linux.sb/user/5372?tab=notifications', SENTINEL_PRELOAD)
  const cardLink = putCardBadge(w.document, 0)
  const calls = []
  let releaseHome
  const homeHold = new Promise((r) => {
    releaseHome = r
  })
  w.fetch = async (url) => {
    const u = String(url)
    calls.push(u)
    await homeHold
    return { status: 200, ok: true, url: u, text: async () => homeWithBadge(3) }
  }
  await loadBase(w, PLUG('unread-sentinel.user.js'))
  assert.equal(nativeLabel(cardLink), '', '进页时红点应立刻掉')
  const dbg = await w.LSB.bus.request('unread-sentinel:debug')
  await until(() => dbg.role() === 'leader', 3000)
  const inflight = dbg.tick()
  releaseHome()
  await inflight
  assert.ok(!calls.some((u) => /tab=notifications/.test(u)), `不应打开通知页：${JSON.stringify(calls)}`)
  assert.equal(nativeLabel(cardLink), '', '巡检抄到首页个人卡也不能在通知页把点画回来')
  assert.equal(cardLink.querySelector('[data-lsb-notify]'), null)
  w.LSB.bus.emit('tab:unread-sentinel:notify', { count: 3 }, { source: 'tab:other' })
  assert.equal(nativeLabel(cardLink), '', '别的标签传来的数字也不能在通知页画回去')
})

