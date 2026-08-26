import { num, text, idFrom } from './util.js'

/**
 * 站点适配层：把 bbs1org（linux.sb v8.6.x）的 HTML 结构收敛成结构化对象。
 *
 * 只有这一个文件知道选择器。站点改版时只改这里，依附插件不受影响。
 * 选择器依据 linux.sb 实测页面（/topic/:id、/、/user/:id）。
 */

export const ROUTES = {
  home: '/',
  homeSorted: (sort = 'post', p = 1) => `/index.php?sort=${sort}${p > 1 ? `&p=${p}` : ''}`,
  forum: (id, { sort, p } = {}) => {
    const q = []
    if (sort) q.push(`sort=${sort}`)
    if (p && p > 1) q.push(`p=${p}`)
    return `/forum/${id}${q.length ? `?${q.join('&')}` : ''}`
  },
  topic: (id, p = 1) => `/topic/${id}${p > 1 ? `?p=${p}` : ''}`,
  user: (id, tab) => `/user/${id}${tab ? `?tab=${tab}` : ''}`,
  forumList: '/forum_list',
  profile: '/profile',
  topicEdit: '/topic_edit',
  search: '/search',
  checkin: '/daily_checkin',
  leaderboard: (type = 'points') => `/leaderboard?type=${type}`,
  invite: '/invite_code',
  donate: (topicId) => `/donate${topicId ? `?topic_id=${topicId}` : ''}`,
  donateFeed: '/donate_feed',
  notify: (id) => `/notify/${id}`,
  report: (id) => `/content_report/${id}`,
  // POST 端点
  post: {
    reply: '/reply_edit',
    topic: '/topic_edit',
    favorite: '/topic_favorite',
    likeCoin: '/lsb_like_coin',
    attachment: '/attachment_upload',
    preview: '/nb_editor_preview',
    featured: '/topic_featured',
    search: '/search',
  },
}

export const USER_TABS = ['topics', 'replies', 'notifications', 'points_rewards', 'favorites']

/** 站点 DOM 选择器单点。插件通过 api.sel 使用，禁止再手写 ul.post-list / topic-post-list。 */
export const SEL = {
  topicPosts: 'ul.topic-post-list > li.post-entry, ul.post-list > li.post-entry',
  topicUl: 'ul.topic-post-list, ul.post-list',
  listItems: 'ul.post-list > li.post-item',
  listUl: 'ul.post-list',
  postEntry: 'li.post-entry',
}

/** 当前页面类型 */
export function detectPage(loc = location) {
  const path = loc.pathname.replace(/\/+$/, '') || '/'
  const q = new URLSearchParams(loc.search)
  const mTopic = path.match(/^\/topic\/(\d+)$/)
  if (mTopic) return { type: 'topic', id: Number(mTopic[1]), page: Number(q.get('p') || 1) }
  const mForum = path.match(/^\/forum\/(\d+)$/)
  if (mForum) {
    return {
      type: 'forum',
      id: Number(mForum[1]),
      page: Number(q.get('p') || 1),
      sort: q.get('sort') || 'comment',
    }
  }
  const mUser = path.match(/^\/user\/(\d+)$/)
  if (mUser) return { type: 'user', id: Number(mUser[1]), tab: q.get('tab') || 'topics' }
  if (path === '/' || path === '/index.php') {
    return { type: 'home', page: Number(q.get('p') || 1), sort: q.get('sort') || 'post' }
  }
  const known = {
    '/profile': 'profile',
    '/topic_edit': 'topic_edit',
    '/daily_checkin': 'checkin',
    '/leaderboard': 'leaderboard',
    '/invite_code': 'invite',
    '/forum_list': 'forum_list',
    '/search': 'search',
    '/donate': 'donate',
  }
  if (known[path]) return { type: known[path] }
  if (/^\/notify\/\d+$/.test(path)) return { type: 'notify', id: num(path) }
  if (/^\/content_report\/\d+$/.test(path)) return { type: 'report', id: num(path) }
  return { type: 'unknown', path }
}

/** CSRF token：页面内每个表单都带 _csrf 隐藏域，取第一个即可 */
export function readCsrf(doc = document) {
  const el = doc.querySelector('input[name="_csrf"]')
  return el ? el.value : null
}

/**
 * 当前登录用户。侧栏 user-card 在他人主页显示的是「被访问者」，
 * 因此登录身份以移动端抽屉里的「我的主页」链接为准，它总是当前用户。
 */
export function readCurrentUser(doc = document) {
  /**
   * 分层探测当前登录用户：站点改版会挪动锚点，任一策略命中即可。
   * 顺序按可靠性排列，全部失败才判访客。
   */
  const uidOf = (a) => (a ? idFrom(a.getAttribute('href'), 'user') : null)
  const strategies = [
    // A. 「我的主页」直链（旧版移动端抽屉，改版后可能仍在别处）
    () => uidOf([...doc.querySelectorAll('a[href*="/user/"]')].find((a) => text(a) === '我的主页')),
    // B. 「我的主题/回帖/收藏/通知/积分」这类自指链接，措辞带「我的」即锁定本人
    () =>
      uidOf(
        [...doc.querySelectorAll('a[href*="/user/"]')].find((a) => {
          const s = text(a)
          return /^我的(主题|回帖|收藏|通知|积分|称号)/.test(s)
        }),
      ),
    // C. 侧栏用户卡 + 登录专属入口（/profile 个人设置、发帖按钮）同时存在 → 卡片即本人
    () => {
      const loggedIn =
        doc.querySelector('a[href="/profile"]') ||
        doc.querySelector('a.btn-post[href="/topic_edit"]') ||
        doc.querySelector('a[href="/daily_checkin"]')
      if (!loggedIn) return null
      return uidOf(doc.querySelector('.sidebar-card.user-card a.user-name'))
    },
  ]
  let myUid = null
  for (const fn of strategies) {
    try {
      myUid = fn()
    } catch {
      myUid = null
    }
    if (myUid != null) break
  }

  const card = doc.querySelector('.sidebar-card.user-card')
  const cardLink = card?.querySelector('a.user-name')
  const cardUid = uidOf(cardLink)
  const isSelfCard = myUid != null && cardUid === myUid
  const rank = text(card?.querySelector('.user-rank'))
  const guest = myUid == null
  return {
    guest,
    uid: myUid,
    name: isSelfCard ? text(cardLink) : null,
    rank: isSelfCard ? rank : null,
    points: isSelfCard ? num((rank.split('·')[1] || '')) : null,
    group: isSelfCard ? (rank.split('·')[0] || '').trim() || null : null,
    avatar: isSelfCard ? card?.querySelector('.avatar-img')?.getAttribute('src') || null : null,
  }
}

/** 顶部导航 + 抽屉里的版块清单（合并去重）；侧栏/导航页有主题数则带上 */
export function readForums(doc = document) {
  const out = new Map()
  const sel = '.forum-nav a[href^="/forum/"], #mobile-menu-drawer a[href^="/forum/"], .forum-more-region a[href^="/forum/"]'
  for (const a of doc.querySelectorAll(sel)) {
    const id = idFrom(a.getAttribute('href'), 'forum')
    if (id && !out.has(id)) out.set(id, { id, name: text(a) })
  }
  const counted =
    '.forum-enhancements-sidebar-list a[href^="/forum/"], a.forum-enhancements-link[href^="/forum/"]'
  for (const a of doc.querySelectorAll(counted)) {
    const id = idFrom(a.getAttribute('href'), 'forum')
    if (!id) continue
    const nameEl = a.querySelector('.forum-enhancements-sidebar-name, .forum-enhancements-name')
    const countEl = a.querySelector('.forum-enhancements-sidebar-count, .forum-enhancements-count')
    const rec = out.get(id) || { id, name: nameEl ? text(nameEl) : text(a) }
    if (nameEl) rec.name = text(nameEl)
    if (countEl) {
      const n = num(text(countEl))
      if (Number.isFinite(n)) rec.topics = n
    }
    out.set(id, rec)
  }
  return [...out.values()].sort((a, b) => a.id - b.id)
}

/** 列表页（首页 / 版块页 / 用户页）的一条条目 */
export function parseListItem(li) {
  const titleA = li.querySelector('a.post-title')
  if (!titleA) return null
  const authorA = li.querySelector('.post-avatar a[href^="/user/"]') || li.querySelector('.post-meta a[href^="/user/"]')
  const forumA = li.querySelector('.post-forum-meta a[href^="/forum/"], .post-meta a[href^="/forum/"]')
  const stamp = li.querySelector('span[data-performance-time]')
  const counts = [...li.querySelectorAll('.post-meta span')]
    .map((s) => text(s))
    .filter((t) => /^\d[\d,]*$/.test(t))
    .map(num)
  return {
    id: idFrom(titleA.getAttribute('href'), 'topic'),
    title: text(titleA),
    url: titleA.getAttribute('href'),
    authorId: authorA ? idFrom(authorA.getAttribute('href'), 'user') : null,
    authorName: authorA ? text(authorA) || authorA.querySelector('img')?.getAttribute('alt') || null : null,
    forumId: forumA ? idFrom(forumA.getAttribute('href'), 'forum') : null,
    forumName: forumA ? text(forumA) : null,
    replies: counts.length ? counts[counts.length - 1] : null,
    lastActiveTs: stamp ? num(stamp.getAttribute('data-performance-time')) : null,
    pinned: li.classList.contains('topic-pinned') || !!li.querySelector('.topic-badge.pinned'),
    badges: [...li.querySelectorAll('.topic-stamp-badge')].map((b) => text(b)),
    el: li,
  }
}

export function parseList(root = document) {
  return [...root.querySelectorAll(SEL.listItems)]
    .map(parseListItem)
    .filter((x) => x && x.id)
}

/** 帖子页的一个楼层 */
export function parsePost(li) {
  const idm = (li.id || '').match(/^post-(\d+)$/)
  const authorA = li.querySelector('a.post-title.post-author') || li.querySelector('.post-avatar a[href^="/user/"]')
  const stamp = li.querySelector('span[data-performance-time]')
  const likeBtn = li.querySelector('[data-like-coin-action]')
  return {
    postId: idm ? Number(idm[1]) : null,
    floor: li.dataset?.floor ? Number(li.dataset.floor) : 0,
    authorId: authorA ? idFrom(authorA.getAttribute('href'), 'user') : null,
    authorName: authorA
      ? text(authorA) || authorA.querySelector('img')?.getAttribute('alt') || null
      : null,
    groups: [...li.querySelectorAll('.post-user-group')]
      .map((g) => text(g))
      .filter((t) => t && !/^UID/.test(t)),
    ts: stamp ? num(stamp.getAttribute('data-performance-time')) : null,
    html: li.querySelector('.post-content')?.innerHTML ?? '',
    content: text(li.querySelector('.post-content')),
    likes: likeBtn ? num(text(li.querySelector('.like-coin-count'))) : null,
    liked: likeBtn ? likeBtn.getAttribute('data-like-coin-liked') === '1' : null,
    coined: likeBtn ? num(likeBtn.getAttribute('data-like-coin-coined')) : null,
    el: li,
  }
}

/** 帖子页整体 */
export function parseTopic(doc = document) {
  const stats = [...doc.querySelectorAll('.post-content-stats span')].map((s) => num(text(s)))
  const crumbForum = [...doc.querySelectorAll('.breadcrumb a[href^="/forum/"]')].pop()
  const posts = [...doc.querySelectorAll(SEL.topicPosts)].map(parsePost)
  const pages = [...doc.querySelectorAll('.pagination a[href*="p="]')].reduce(
    (mx, a) => Math.max(mx, num((a.getAttribute('href').match(/[?&]p=(\d+)/) || [])[1])),
    1,
  )
  const idFromCanonical = idFrom(doc.querySelector('link[rel="canonical"]')?.getAttribute('href') || '', 'topic')
  return {
    id: idFromCanonical ?? (posts[0] ? posts[0].postId : null),
    title: text(doc.querySelector('h1.post-content-title')),
    forumId: crumbForum ? idFrom(crumbForum.getAttribute('href'), 'forum') : null,
    forumName: crumbForum ? text(crumbForum) : null,
    views: stats[0] ?? null,
    replies: stats[1] ?? null,
    pages,
    op: posts[0] || null,
    posts,
    replyForm: !!doc.querySelector('form.ajax-reply-form'),
    loginRequired: !doc.querySelector('form.ajax-reply-form'),
  }
}

/** 用户主页 */
export function parseUser(doc = document) {
  const card = doc.querySelector('.sidebar-card.user-card')
  const link = card?.querySelector('a.user-name')
  const rank = text(card?.querySelector('.user-rank'))
  return {
    uid: link ? idFrom(link.getAttribute('href'), 'user') : null,
    name: text(link),
    rank,
    group: (rank.split('·')[0] || '').trim() || null,
    points: num(rank.split('·')[1] || ''),
    avatar: card?.querySelector('.avatar-img')?.getAttribute('src') || null,
    tabs: [...doc.querySelectorAll('.tab[href*="tab="]')].map((a) => ({
      key: (a.getAttribute('href').match(/tab=(\w+)/) || [])[1],
      name: text(a),
      active: a.classList.contains('active'),
    })),
    items: parseList(doc),
  }
}

/** 帖子页里的点赞/打赏元数据，供插件做批量操作 */
export function parseLikeTargets(doc = document) {
  return [...doc.querySelectorAll('[data-like-coin-action]')].map((btn) => ({
    type: btn.getAttribute('data-like-coin-type'),
    id: num(btn.getAttribute('data-like-coin-id')),
    tiers: (btn.getAttribute('data-like-coin-tiers') || '').split(',').filter(Boolean).map(num),
    liked: btn.getAttribute('data-like-coin-liked') === '1',
    coined: num(btn.getAttribute('data-like-coin-coined')),
    count: num(text(btn.parentElement?.querySelector('.like-coin-count'))),
    el: btn,
  }))
}

/**
 * 页面级快照。page / csrf / me / version 每次重读；
 * 同页 type+id 时复用 topic / list / user / forums，避免软导航整页重解析楼层。
 */
export function snapshot(doc = document, loc = location, prev = null) {
  const page = detectPage(loc)
  const same =
    prev?.page?.type === page.type && (prev.page.id ?? null) === (page.id ?? null)
  const snap = {
    page,
    csrf: readCsrf(doc),
    me: readCurrentUser(doc),
    forums: same && prev.forums ? prev.forums : readForums(doc),
    version: doc.querySelector('link[href*="index.css?v="]')?.getAttribute('href')?.match(/v=v?([\d.]+)/)?.[1] || null,
  }
  if (page.type === 'topic') snap.topic = same && prev.topic ? prev.topic : parseTopic(doc)
  if (page.type === 'user') snap.user = same && prev.user ? prev.user : parseUser(doc)
  if (page.type === 'home' || page.type === 'forum') snap.list = same && prev.list ? prev.list : parseList(doc)
  return snap
}
