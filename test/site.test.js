/** 用真实抓取的 linux.sb 页面快照验证解析层 */
import { test } from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { JSDOM } from 'jsdom'
import {
  detectPage,
  readCsrf,
  readCurrentUser,
  readForums,
  parseTopic,
  parseList,
  parseUser,
  parseLikeTargets,
  snapshot,
  ROUTES,
  parseNotifications,
  parsePost,
  SEL,
} from '../src/site.js'

const fx = (n) => readFileSync(new URL(`./fixtures/${n}`, import.meta.url), 'utf8')

function load(name, url) {
  const dom = new JSDOM(fx(name), { url })
  return dom.window
}

test('detectPage 识别各类路由', () => {
  const mk = (href) => new URL(href)
  assert.deepEqual(detectPage(mk('https://linux.sb/topic/14055')), { type: 'topic', id: 14055, page: 1 })
  assert.deepEqual(detectPage(mk('https://linux.sb/topic/1?p=3')), { type: 'topic', id: 1, page: 3 })
  assert.deepEqual(detectPage(mk('https://linux.sb/forum/7?sort=post&p=2')), {
    type: 'forum',
    id: 7,
    page: 2,
    sort: 'post',
  })
  assert.deepEqual(detectPage(mk('https://linux.sb/user/5372?tab=replies')), { type: 'user', id: 5372, tab: 'replies' })
  assert.equal(detectPage(mk('https://linux.sb/')).type, 'home')
  assert.equal(detectPage(mk('https://linux.sb/index.php?sort=comment')).type, 'home')
  assert.equal(detectPage(mk('https://linux.sb/daily_checkin')).type, 'checkin')
  assert.equal(detectPage(mk('https://linux.sb/invite_center')).type, 'invite')
  assert.equal(detectPage(mk('https://linux.sb/invite_code')).type, 'invite', '旧邀请链仍识别')
  assert.equal(detectPage(mk('https://linux.sb/gacha')).type, 'gacha')
  assert.equal(detectPage(mk('https://linux.sb/gacha_market')).type, 'gacha_market')
  assert.equal(detectPage(mk('https://linux.sb/gacha_profile')).type, 'gacha_profile')
  assert.equal(detectPage(mk('https://linux.sb/community_wallet')).type, 'wallet')
  assert.equal(detectPage(mk('https://linux.sb/topic_featured')).type, 'featured')
  assert.equal(detectPage(mk('https://linux.sb/unread_topic_notice_footprint')).type, 'footprint')
  assert.equal(detectPage(mk('https://linux.sb/index.php?sort=lucky')).sort, 'lucky')
  assert.equal(detectPage(mk('https://linux.sb/index.php?sort=card')).sort, 'card')
  assert.equal(detectPage(mk('https://linux.sb/nope')).type, 'unknown')
})

test('ROUTES 生成正确 URL', () => {
  assert.equal(ROUTES.topic(1, 3), '/topic/1?p=3')
  assert.equal(ROUTES.topic(1), '/topic/1')
  assert.equal(ROUTES.forum(7, { sort: 'post', p: 2 }), '/forum/7?sort=post&p=2')
  assert.equal(ROUTES.user(5372, 'favorites'), '/user/5372?tab=favorites')
  assert.equal(ROUTES.user(5372, 'notifications'), '/user/5372?tab=notifications')
  assert.equal(ROUTES.homeSorted('comment', 2), '/index.php?sort=comment&p=2')
  assert.equal(ROUTES.invite, '/invite_center')
  assert.equal(ROUTES.gacha, '/gacha')
  assert.equal(ROUTES.gachaMarket, '/gacha_market')
  assert.equal(ROUTES.featured, '/topic_featured')
  assert.equal(ROUTES.footprint, '/unread_topic_notice_footprint')
  assert.equal(ROUTES.wallet, '/community_wallet')
})

test('帖子页：整体元数据与楼层', () => {
  const w = load('topic1.html', 'https://linux.sb/topic/1')
  const t = parseTopic(w.document)
  assert.equal(t.id, 1)
  assert.equal(t.title, 'LINUX SB上线 更新的理想型社区')
  assert.equal(t.forumId, 1)
  assert.equal(t.forumName, '错误地方')
  assert.equal(t.views, 14434)
  assert.equal(t.replies, 358)
  assert.equal(t.pages, 8)
  assert.equal(t.loginRequired, false)
  assert.equal(t.posts.length, 51) // 主楼 + 50 楼层

  const op = t.op
  assert.equal(op.postId, 1)
  assert.equal(op.authorId, 1)
  assert.equal(op.authorName, '痛失姓名的站长')
  assert.deepEqual(op.groups, ['社区主理人'])
  assert.equal(op.content, '打造更新的理想型社区')
  assert.equal(typeof op.ts, 'number')
  assert.ok(op.ts > 1_700_000_000)

  const second = t.posts[1]
  assert.equal(second.postId, 87)
  assert.equal(second.floor, 18)
  assert.equal(second.authorId, 127)
  assert.equal(second.authorName, 'lee')
  assert.equal(second.likes, 40)
  assert.equal(second.liked, false)
})

test('帖子页：点赞/投币目标', () => {
  const w = load('topic1.html', 'https://linux.sb/topic/1')
  const targets = parseLikeTargets(w.document)
  assert.equal(targets.length, 50)
  const t0 = targets[0]
  assert.equal(t0.type, 'reply')
  assert.equal(t0.id, 87)
  assert.deepEqual(t0.tiers, [1, 5, 10, 50, 100])
  assert.equal(t0.count, 40)
})

test('CSRF 与登录身份', () => {
  const w = load('topic1.html', 'https://linux.sb/topic/1')
  const csrf = readCsrf(w.document)
  assert.match(csrf, /^[0-9a-f]{64}$/)
  const me = readCurrentUser(w.document)
  assert.equal(me.guest, false)
  assert.equal(me.uid, 5372)
  assert.equal(me.name, 'xB70sR71')
  assert.equal(me.points, 4138)
  assert.equal(me.group, '创作者')
})

test('他人主页时不把被访问者当成自己', () => {
  const w = load('user1.html', 'https://linux.sb/user/1')
  const me = readCurrentUser(w.document)
  assert.equal(me.uid, 5372, '登录身份取自「我的主页」链接')
  assert.equal(me.name, null, '侧栏展示的是 uid 1，不能当作自己的昵称')

  const u = parseUser(w.document)
  assert.equal(u.uid, 1)
  assert.equal(u.name, '痛失姓名的站长')
  assert.equal(u.group, '社区主理人')
  assert.equal(u.points, 6238)
  assert.deepEqual(
    u.tabs.map((t) => t.key),
    ['topics', 'replies', 'points_rewards', 'favorites'],
  )
  assert.ok(u.items.length > 5)
  assert.equal(u.items[0].id, 14055)
})

test('版块清单', () => {
  const w = load('home.html', 'https://linux.sb/')
  const forums = readForums(w.document)
  assert.equal(forums.length, 9)
  assert.equal(forums.find((f) => f.id === 7)?.name, '深度思考')
  assert.equal(forums.find((f) => f.id === 9)?.name, '社区公告')
  assert.equal(forums.find((f) => f.id === 1)?.topics, 3862, '侧栏版块列表带主题数')
  assert.equal(forums.find((f) => f.id === 7)?.topics, 78)
  assert.equal(forums.find((f) => f.id === 9)?.topics, 7)
})

test('版块导航页也能读主题数', () => {
  const html =
    '<a class="forum-enhancements-link" href="/forum/1">' +
    '<span class="forum-enhancements-name">错误地方</span>' +
    '<span class="forum-enhancements-count">4079</span></a>'
  const w = new JSDOM(html, { url: 'https://linux.sb/forum_list' }).window
  const forums = readForums(w.document)
  assert.deepEqual(forums.find((f) => f.id === 1), { id: 1, name: '错误地方', topics: 4079 })
})

test('首页列表条目', () => {
  const w = load('home.html', 'https://linux.sb/')
  const list = parseList(w.document)
  assert.ok(list.length >= 20, `实际 ${list.length}`)
  const first = list[0]
  assert.equal(first.id, 14259)
  assert.equal(first.pinned, true)
  assert.equal(first.authorId, 2093)
  assert.equal(first.authorName, 'Denia-bot')
  assert.ok(first.badges.includes('热'))
  const withTs = list.filter((x) => x.lastActiveTs)
  assert.ok(withTs.length > list.length * 0.8, '多数条目应有时间戳')
  assert.ok(list.every((x) => Number.isInteger(x.id)))
})

test('snapshot 汇总当前页信息', () => {
  const w = load('topic1.html', 'https://linux.sb/topic/1')
  const snap = snapshot(w.document, new URL('https://linux.sb/topic/1'))
  assert.equal(snap.page.type, 'topic')
  assert.equal(snap.page.id, 1)
  assert.equal(snap.version, '8.6.5')
  assert.equal(snap.me.uid, 5372)
  assert.equal(snap.forums.length, 9)
  assert.equal(snap.topic.title, 'LINUX SB上线 更新的理想型社区')
  assert.ok(snap.csrf)
})

test('snapshot：同帖翻页复用 topic/forums，不整页重解析楼层', () => {
  const w = load('topic1.html', 'https://linux.sb/topic/1')
  const a = snapshot(w.document, new URL('https://linux.sb/topic/1'))
  const b = snapshot(w.document, new URL('https://linux.sb/topic/1?p=2'), a)
  assert.equal(b.page.page, 2)
  assert.equal(b.topic, a.topic, '同帖 id 不换时复用 topic 对象')
  assert.equal(b.forums, a.forums, '版块清单一并复用')
  assert.notEqual(b.me, a.me, '身份每次重读（积分可能变）')
})

test('snapshot：换页类型时丢掉旧 topic，补上 list', () => {
  const topicWin = load('topic1.html', 'https://linux.sb/topic/1')
  const prev = snapshot(topicWin.document, new URL('https://linux.sb/topic/1'))
  const home = load('home.html', 'https://linux.sb/')
  const next = snapshot(home.document, new URL('https://linux.sb/'), prev)
  assert.equal(next.page.type, 'home')
  assert.equal(next.topic, undefined)
  assert.ok(Array.isArray(next.list))
  assert.ok(next.list.length > 0)
})

test('parseNotifications：未读类、主题链、无主题 id 的未读也计入', () => {
  const w = load('notifications.html', 'https://linux.sb/user/5372?tab=notifications')
  const rows = parseNotifications(w.document)
  assert.equal(rows.length, 3)
  assert.equal(rows[0].unread, true)
  assert.equal(rows[0].id, 15343)
  assert.equal(rows[0].href, '/topic/15343?replyid=90909')
  assert.match(rows[0].title, /提到你/)
  assert.equal(rows[1].unread, false)
  assert.equal(rows[1].id, 15085)
  assert.equal(rows[2].unread, true)
  assert.equal(rows[2].id, null, '没有 /topic/ 链时仍保留条目，角标按 unread 计数')
  assert.equal(rows.filter((x) => x.unread).length, 2)
})

const V875_TOPIC = `<!DOCTYPE html><html><head>
<link rel="stylesheet" href="/app/assets/index.css?v=v8.7.5">
<link rel="canonical" href="https://linux.sb/topic/42">
</head><body>
<nav class="breadcrumb"><a href="/forum/4">技术交流</a></nav>
<h1 class="post-content-title">v875 帖</h1>
<div class="post-content-stats"><span>10</span><span>2</span></div>
<ul class="post-list topic-post-list">
  <li class="post-item post-entry" id="post-42">
    <a class="post-title post-author" href="/user/1">楼主</a>
    <span class="post-user-group">普通用户</span>
    <span class="post-user-group gacha-title-post-badge">非必要不抽奖005<span class="gacha-title-serial">N</span></span>
    <span class="post-user-group user-uid-badge">UID 1</span>
    <span class="post-time">昨天</span>
    <div class="post-content"><p>正文</p></div>
    <button type="button" data-donate-btn data-donate-topic-id="42">
      <span class="donate-topic-reaction-count">7</span>
    </button>
  </li>
  <li class="post-item post-entry" id="post-99" data-floor="1">
    <a class="post-title post-author" href="/user/2">回复者</a>
    <span class="post-time">今天</span>
    <div class="post-content"><p>回</p></div>
    <button type="button" data-donate-btn data-donate-reply-id="99">
      <span class="donate-topic-reaction-count">3</span>
    </button>
  </li>
</ul>
</body></html>`

test('v8.7.5：帖内楼层不是列表行；主楼无 data-floor / 时间戳走相对文案', () => {
  const mixed =
    '<ul class="post-list">' +
    '<li class="post-item"><div class="post-title-row"><a class="post-title" href="/topic/10">列表帖</a></div></li>' +
    '<li class="post-item post-entry" id="post-10"><a class="post-title post-author" href="/user/1">楼主</a>' +
    '<a class="post-title" href="/topic/10">不该进列表</a></li></ul>'
  const listDoc = new JSDOM(mixed, { url: 'https://linux.sb/' }).window.document
  const list = parseList(listDoc)
  assert.equal(list.length, 1)
  assert.equal(list[0].id, 10)
  assert.match(SEL.listItems, /:not\(\.post-entry\)/)

  const w = new JSDOM(V875_TOPIC, { url: 'https://linux.sb/topic/42' }).window
  const t = parseTopic(w.document)
  assert.equal(t.id, 42)
  assert.equal(t.op.floor, 0, '主楼没有 data-floor')
  assert.equal(t.op.ts, null, '只有「昨天」时不要编造 unix 秒')
  assert.equal(t.posts[1].floor, 1)
  assert.equal(t.op.likes, 7, '捐阶计数也要当成 likes')
  assert.deepEqual(t.op.groups, ['普通用户'], '称号徽标和 UID 不进用户组')
  const targets = parseLikeTargets(w.document)
  assert.equal(targets.length, 2)
  assert.equal(targets[0].type, 'donate')
  assert.equal(targets[0].id, 42)
  assert.equal(targets[0].count, 7)
  assert.equal(targets[1].id, 99)
  assert.equal(parsePost(t.posts[1].el).likes, 3)
})

test('v8.7.5：精华 / 足迹快照带 list', () => {
  const html =
    '<ul class="post-list"><li class="post-item"><div class="post-title-row">' +
    '<a class="post-title" href="/topic/88">精华帖</a></div></li></ul>'
  const featured = new JSDOM(html, { url: 'https://linux.sb/topic_featured' }).window
  const snap = snapshot(featured.document, new URL('https://linux.sb/topic_featured'))
  assert.equal(snap.page.type, 'featured')
  assert.equal(snap.list.length, 1)
  assert.equal(snap.list[0].id, 88)
  assert.equal(snap.version, null)

  const foot = snapshot(
    new JSDOM(html, { url: 'https://linux.sb/unread_topic_notice_footprint' }).window.document,
    new URL('https://linux.sb/unread_topic_notice_footprint'),
  )
  assert.equal(foot.page.type, 'footprint')
  assert.equal(foot.list[0].id, 88)
})

test('v8.7.5：快照能读到 index.css 版本', () => {
  const w = new JSDOM(V875_TOPIC, { url: 'https://linux.sb/topic/42' }).window
  const snap = snapshot(w.document, new URL('https://linux.sb/topic/42'))
  assert.equal(snap.version, '8.7.5')
})
