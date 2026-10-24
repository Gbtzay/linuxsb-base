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
  USER_TABS,
  listPages,
} from '../src/site.js'
import * as site from '../src/site.js'

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
  assert.deepEqual(detectPage(mk('https://linux.sb/hot_discussions')), { type: 'hot_discussions' })
  assert.deepEqual(detectPage(mk('https://linux.sb/topic_collections')), { type: 'collections', tab: 'mine' })
  assert.deepEqual(detectPage(mk('https://linux.sb/topic_collections?tab=everyone')), {
    type: 'collections',
    tab: 'everyone',
  })
  assert.deepEqual(detectPage(mk('https://linux.sb/topic_collection/153')), { type: 'collection', id: 153 })
  assert.equal(detectPage(mk('https://linux.sb/identity_center')).type, 'identity')
  assert.equal(detectPage(mk('https://linux.sb/promotions')).type, 'promotions')
  assert.equal(detectPage(mk('https://linux.sb/topic_essence_review_list')).type, 'essence_review')
  assert.equal(detectPage(mk('https://linux.sb/topic/14055')).type, 'topic', '不得把淘帖路径认成帖子')
  assert.equal(detectPage(mk('https://linux.sb/index.php?sort=lucky')).sort, 'lucky')
  assert.equal(detectPage(mk('https://linux.sb/index.php?sort=card')).sort, 'card')
  assert.equal(detectPage(mk('https://linux.sb/index.php?sort=red_packet')).sort, 'red_packet')
  assert.equal(detectPage(mk('https://linux.sb/direct_messages')).type, 'messages')
  assert.equal(detectPage(mk('https://linux.sb/user_block')).type, 'user_block')
  assert.equal(detectPage(mk('https://linux.sb/user/1?tab=attachments')).tab, 'attachments')
  assert.ok(USER_TABS.includes('attachments'))
  assert.equal(detectPage(mk('https://linux.sb/nope')).type, 'unknown')
})

test('ROUTES 生成正确 URL', () => {
  assert.equal(ROUTES.topic(1, 3), '/topic/1?p=3')
  assert.equal(ROUTES.topic(1), '/topic/1')
  assert.equal(ROUTES.forum(7, { sort: 'post', p: 2 }), '/forum/7?sort=post&p=2')
  assert.equal(ROUTES.user(5372, 'favorites'), '/user/5372?tab=favorites')
  assert.equal(ROUTES.user(5372, 'favorites', 3), '/user/5372?tab=favorites&p=3')
  assert.equal(ROUTES.user(5372, 'notifications'), '/user/5372?tab=notifications')
  assert.equal(ROUTES.searchResults('内核 更新', 'title', 2), '/index.php?q=%E5%86%85%E6%A0%B8+%E6%9B%B4%E6%96%B0&field=title&p=2')
  assert.throws(() => ROUTES.user(0, 'favorites', 2), /用户|页码|路由/)
  assert.throws(() => ROUTES.user(5372, 'unknown', 2), /用户|页码|路由/)
  assert.throws(() => ROUTES.user(5372, 'favorites', 0), /用户|页码|路由/)
  assert.throws(() => ROUTES.searchResults('topic', 'url', 2), /搜索|字段|路由/)
  assert.equal(ROUTES.homeSorted('comment', 2), '/index.php?sort=comment&p=2')
  assert.equal(ROUTES.invite, '/invite_center')
  assert.equal(ROUTES.gacha, '/gacha')
  assert.equal(ROUTES.gachaMarket, '/gacha_market')
  assert.equal(ROUTES.featured, '/topic_featured')
  assert.equal(ROUTES.footprint, '/unread_topic_notice_footprint')
  assert.equal(ROUTES.hotDiscussions, '/hot_discussions')
  assert.equal(ROUTES.wallet, '/community_wallet')
  assert.equal(ROUTES.collections, '/topic_collections')
  assert.equal(ROUTES.collection(153), '/topic_collection/153')
  assert.equal(ROUTES.identity, '/identity_center')
  assert.equal(ROUTES.promotions, '/promotions')
  assert.equal(ROUTES.essenceReview, '/topic_essence_review_list')
  assert.equal(ROUTES.messages, '/direct_messages')
  assert.equal(ROUTES.userBlock, '/user_block')
})

test('ROUTES.topicReply 只生成校验过的本站回帖目标路由', () => {
  assert.equal(ROUTES.topicReply(4321, 8102), '/topic/4321?replyid=8102')
  assert.throws(() => ROUTES.topicReply(0, 8102), /主题|回帖|路由/)
  assert.throws(() => ROUTES.topicReply(4321, -1), /主题|回帖|路由/)
  assert.throws(() => ROUTES.topicReply(4321, 1.5), /主题|回帖|路由/)
})

test('listPages 只解析同源分页数字，不暴露链接', () => {
  const dom = new JSDOM(`
    <nav class="pagination">
      <a href="/index.php?q=kernel&amp;field=title&amp;p=3">3</a>
      <a href="?q=kernel&amp;field=title&amp;p=2">2</a>
      <a href="/index.php?q=kernel&amp;field=title&amp;p=3">3</a>
      <a href="https://evil.example/index.php?p=99">99</a>
      <a href="/index.php?p=0">0</a>
    </nav>`, { url: 'https://linux.sb/index.php?q=kernel&field=title' })
  assert.deepEqual(listPages(dom.window.document), [1, 2, 3])
  const empty = new JSDOM('<main>没有分页</main>', { url: 'https://linux.sb/search' })
  assert.deepEqual(listPages(empty.window.document), [1])
})

test('parseTopic 返回文档当前页，不把最大页数当作当前页', () => {
  const first = load('topic1.html', 'https://linux.sb/topic/1')
  const second = load('topic1.html', 'https://linux.sb/topic/1?p=2')
  assert.equal(parseTopic(first.document).currentPage, 1)
  assert.equal(parseTopic(second.document).currentPage, 2)
  assert.equal(parseTopic(second.document).pages, 8)

  const replyTarget = new JSDOM(`
    <link rel="canonical" href="/topic/1">
    <nav class="pagination"><ul>
      <li><a href="/topic/1?p=1">1</a></li>
      <li class="active"><a href="/topic/1?p=3">3</a></li>
    </ul></nav>`, { url: 'https://linux.sb/topic/1?replyid=9003' })
  assert.equal(parseTopic(replyTarget.window.document).currentPage, 3)
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

test('v9.0：列表徽章含热/红包帖/发卡状态', () => {
  const html =
    '<ul class="post-list">' +
    '<li class="post-item"><div class="post-title-row">' +
    '<a class="post-title" href="/topic/10">红包</a>' +
    '<span class="topic-stamp-badge topic-stamp-hot">热</span>' +
    '<span class="red-packet-title-status">红包帖</span>' +
    '</div></li>' +
    '<li class="post-item"><div class="post-title-row">' +
    '<a class="post-title" href="/topic/11">发卡</a>' +
    '<span class="virtual-card-title-status active">发卡中</span>' +
    '</div></li>' +
    '</ul>'
  const list = parseList(new JSDOM(html, { url: 'https://linux.sb/' }).window.document)
  assert.deepEqual(list[0].badges, ['热', '红包帖'])
  assert.deepEqual(list[1].badges, ['发卡中'])
  assert.deepEqual(list[0].marks, { redPacket: 'live', virtualCard: null })
  assert.deepEqual(list[1].marks, { redPacket: null, virtualCard: 'live' })

  const disc =
    '<ul class="post-list"><li class="post-item"><div class="post-title-row">' +
    '<a class="post-title" href="/topic/17">讨论</a>' +
    '<span class="red-packet-title-status is-discussion">讨论红包</span>' +
    '</div></li></ul>'
  const discList = parseList(new JSDOM(disc, { url: 'https://linux.sb/' }).window.document)
  assert.deepEqual(discList[0].badges, ['讨论红包'])
  assert.equal(discList[0].marks.redPacket, 'live', '讨论红包还活着，不当成结束')
})

test('v9.0：红包/发卡结束态与空标记', () => {
  const html =
    '<ul class="post-list">' +
    '<li class="post-item"><div class="post-title-row">' +
    '<a class="post-title" href="/topic/12">抢完</a>' +
    '<span class="red-packet-title-status">已抢完</span>' +
    '</div></li>' +
    '<li class="post-item"><div class="post-title-row">' +
    '<a class="post-title" href="/topic/13">结束</a>' +
    '<span class="virtual-card-title-status">结束</span>' +
    '</div></li>' +
    '<li class="post-item"><div class="post-title-row">' +
    '<a class="post-title" href="/topic/14">双标</a>' +
    '<span class="virtual-card-title-status active">结束</span>' +
    '</div></li>' +
    '<li class="post-item"><div class="post-title-row">' +
    '<a class="post-title" href="/topic/15">认不出</a>' +
    '<span class="virtual-card-title-status finished">发卡中</span>' +
    '</div></li>' +
    '<li class="post-item"><div class="post-title-row">' +
    '<a class="post-title" href="/topic/16">普通</a>' +
    '</div></li>' +
    '</ul>'
  const list = parseList(new JSDOM(html, { url: 'https://linux.sb/' }).window.document)
  assert.equal(list[0].marks.redPacket, 'ended')
  assert.equal(list[1].marks.virtualCard, 'ended')
  assert.equal(list[2].marks.virtualCard, 'ended', '结束优先于 active')
  assert.equal(list[3].marks.virtualCard, 'ended', 'finished class 优先于发卡中文案')
  assert.deepEqual(list[4].marks, { redPacket: null, virtualCard: null })
})

test('置顶回帖副本不算楼层', () => {
  const html =
    '<html><head><link rel="canonical" href="https://linux.sb/topic/22651"></head><body>' +
    '<h1 class="post-content-title">置顶回帖</h1>' +
    '<ul class="post-list topic-post-list">' +
    '<li class="post-item post-entry" id="post-22651">' +
    '<a class="post-title post-author" href="/user/1">楼主</a><div class="post-content">op</div></li>' +
    '<li class="post-entry reply-pin-pinned reply-pin-duplicate" data-reply-pin="top-copy" id="reply-pin-top-194477">' +
    '<a class="post-title post-author" href="/user/2">甲</a><div class="post-content">副本</div></li>' +
    '<li class="post-item post-entry reply-pin-original" id="post-194477" data-floor="11">' +
    '<a class="post-title post-author" href="/user/2">甲</a><div class="post-content">原楼</div></li>' +
    '</ul></body></html>'
  const t = parseTopic(new JSDOM(html, { url: 'https://linux.sb/topic/22651' }).window.document)
  assert.equal(t.posts.length, 2, '副本不能进 posts')
  assert.equal(t.op.postId, 22651)
  assert.equal(t.posts[1].postId, 194477)
  assert.equal(t.posts[1].floor, 11)
  assert.ok(!t.posts.some((p) => p.el.classList.contains('reply-pin-duplicate')))
})

test('v8.9.2：淘帖专辑行不是主题列表', () => {
  const html =
    '<ul class="post-list topic-collections-collection-list">' +
    '<li class="post-item topic-collections-collection-row"><div class="post-title-row">' +
    '<a class="post-title" href="/topic_collection/153">MARK</a></div></li>' +
    '<li class="post-item"><div class="post-title-row"><a class="post-title" href="/topic/10">真帖</a></div></li>' +
    '</ul>'
  const doc = new JSDOM(html, { url: 'https://linux.sb/topic_collections?tab=everyone' }).window.document
  assert.equal(doc.querySelectorAll(SEL.listItems).length, 1)
  const list = parseList(doc)
  assert.equal(list.length, 1)
  assert.equal(list[0].id, 10)
})

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

test('热议路由快照包含主题列表', () => {
  const html =
    '<ul class="post-list"><li class="post-item"><div class="post-title-row">' +
    '<a class="post-title" href="/topic/88">热议帖</a></div></li></ul>'
  const w = new JSDOM(html, { url: 'https://linux.sb/hot_discussions' }).window
  const snap = snapshot(w.document, new URL('https://linux.sb/hot_discussions'))

  assert.deepEqual(snap.page, { type: 'hot_discussions' })
  assert.equal(snap.list.length, 1)
  assert.equal(snap.list[0].id, 88)
})

test('v8.7.5：快照能读到 index.css 版本', () => {
  const w = new JSDOM(V875_TOPIC, { url: 'https://linux.sb/topic/42' }).window
  const snap = snapshot(w.document, new URL('https://linux.sb/topic/42'))
  assert.equal(snap.version, '8.7.5')
})

test('parseUserReplies 只返回本人回帖页中可定位的主题和回帖 ID', () => {
  const w = load('user-replies.html', 'https://linux.sb/user/5372?tab=replies')
  assert.deepEqual(site.parseUserReplies(w.document), [{ postId: 8102, topicId: 4321, topicTitle: '主题标题' }])
  assert.deepEqual(site.parseUserReplies(load('user-replies.html', 'https://linux.sb/user/5372?tab=topics').document), [])
  const parsedDoc = new JSDOM('').window.DOMParser.prototype
    ? new JSDOM('').window.DOMParser
    : null
  const networkDoc = new parsedDoc().parseFromString(fx('user-replies.html'), 'text/html')
  assert.deepEqual(site.parseUserReplies(networkDoc, 5372), [{ postId: 8102, topicId: 4321, topicTitle: '主题标题' }])
  assert.deepEqual(site.parseUserReplies(networkDoc, 9001), [], '请求身份与回帖页身份不同则丢弃')
})

test('互动状态使用三态，收藏状态未知时不推断，投币档位只保留有效整数', () => {
  const likeDoc = (attributes) => new JSDOM(`<li class="post-entry"><form class="like-coin-form" method="post" action="/lsb_like_coin"><button data-like-coin-action data-like-coin-type="reply" data-like-coin-id="87" ${attributes}></button></form></li>`).window.document
  assert.equal(site.parseLikeTargets(likeDoc('data-like-coin-liked="1"'))[0].liked, true)
  assert.equal(site.parseLikeTargets(likeDoc('data-like-coin-liked="0"'))[0].liked, false)
  assert.equal(site.parseLikeTargets(likeDoc(''))[0].liked, null)
  assert.deepEqual(site.parseLikeTargets(likeDoc('data-like-coin-liked="1" data-like-coin-tiers="1,5,5,0,-2,word,10,1"'))[0].tiers, [1, 5, 10])

  const favoriteDoc = (label, extra = '') => new JSDOM(`<form class="topic-favorites-action" method="post" action="/topic_favorite"><button class="fav-btn" aria-label="${label}" ${extra}><span>${label}</span></button></form>`).window.document
  assert.equal(site.parseTopicFavoriteState(favoriteDoc('收藏')), false)
  assert.equal(site.parseTopicFavoriteState(favoriteDoc('取消收藏')), true)
  assert.equal(site.parseTopicFavoriteState(favoriteDoc('收藏', 'aria-pressed="true"')), true)
  assert.equal(site.parseTopicFavoriteState(favoriteDoc('未知状态')), null)
  assert.equal(site.parseTopicFavoriteState(new JSDOM('<form action="https://evil.example/topic_favorite"><button class="fav-btn">收藏</button></form>').window.document), null)
})

test('线上 BBS1ORG v99.0 / v10.3：右栏与帖子选择器保持兼容', () => {
  const v99 = new JSDOM(
    '<!doctype html><html><head>' +
      '<link rel="canonical" href="https://linux.sb/topic/24563">' +
      '<link rel="stylesheet" href="/app/assets/index.css?v=v99.0-stats-card-20260929-v2">' +
      '</head><body>' +
      '<div class="forum-layout forum-layout-has-sidebar"><aside class="sidebar" data-slot="sidebar.stack"><div class="sidebar-card">站点</div></aside>' +
      '<main><h1 class="post-content-title">主题</h1><div class="breadcrumb"><a href="/forum/9">社区公告</a></div>' +
      '<ul class="post-list topic-post-list">' +
      '<li class="post-item post-entry" id="post-24563"><a class="post-title post-author" href="/user/1">楼主</a><div class="post-content">主楼</div></li>' +
      '<li class="post-entry reply-pin-pinned reply-pin-duplicate" data-reply-pin="top-copy" id="reply-pin-top-219152"><div class="post-content">置顶副本</div></li>' +
      '<li class="post-item post-entry reply-pin-original" id="post-219152" data-floor="1"><a class="post-title post-author" href="/user/2">甲</a><div class="post-content">原楼</div></li>' +
      '</ul><div class="replies-login-visible">登录后查看回复</div></main></div></body></html>',
    { url: 'https://linux.sb/topic/24563' },
  ).window
  assert.ok(v99.document.querySelector('aside.sidebar[data-slot="sidebar.stack"]'))
  const live = snapshot(v99.document, new URL('https://linux.sb/topic/24563'))
  assert.equal(live.version, '99.0')
  assert.equal(live.topic.posts.length, 2, 'v99.0 置顶副本不能进入帖子上下文')
  assert.equal(live.topic.op.floor, 0, 'v99.0 未标楼层的主楼保持未知')
  assert.equal(live.topic.posts[1].floor, 1)
  assert.equal(live.topic.loginRequired, true, '未登录回复区由页面状态标记为受限')

  const v10 = new JSDOM(
    '<!doctype html><html><head>' +
      '<link rel="canonical" href="https://bbs1.org/topic/21">' +
      '<link rel="stylesheet" href="/app/assets/index.css?v=v10.3">' +
      '</head><body><aside class="sidebar" data-slot="sidebar.stack"></aside>' +
      '<main><h1 class="post-content-title">主题</h1><div class="breadcrumb"><a href="/forum/1">程序</a></div>' +
      '<ul class="post-list topic-post-list"><li class="post-item post-entry" id="post-21"><div class="post-content">主楼</div></li>' +
      '<li class="post-item post-entry" id="post-87" data-floor="1"><div class="post-content">回帖</div></li></ul>' +
      '<form class="ajax-reply-form"></form></main></body></html>',
    { url: 'https://bbs1.org/topic/21' },
  ).window
  assert.ok(v10.document.querySelector('aside.sidebar[data-slot="sidebar.stack"]'))
  const upstream = snapshot(v10.document, new URL('https://bbs1.org/topic/21'))
  assert.equal(upstream.version, '10.3')
  assert.equal(upstream.topic.posts.length, 2)
  assert.equal(upstream.topic.loginRequired, false)
})
