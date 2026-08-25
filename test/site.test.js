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
  assert.equal(detectPage(mk('https://linux.sb/nope')).type, 'unknown')
})

test('ROUTES 生成正确 URL', () => {
  assert.equal(ROUTES.topic(1, 3), '/topic/1?p=3')
  assert.equal(ROUTES.topic(1), '/topic/1')
  assert.equal(ROUTES.forum(7, { sort: 'post', p: 2 }), '/forum/7?sort=post&p=2')
  assert.equal(ROUTES.user(5372, 'favorites'), '/user/5372?tab=favorites')
  assert.equal(ROUTES.homeSorted('comment', 2), '/index.php?sort=comment&p=2')
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
