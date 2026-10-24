import { num, text, idFrom } from '../util.js'
import { SEL } from './selectors.js'
import { ROUTES } from './routes.js'

export function parseListItem(li) {
  if (li.classList.contains('post-entry')) return null
  if (li.classList.contains('topic-collections-collection-row')) return null
  const titleA = li.querySelector('a.post-title:not(.post-author)')
  if (!titleA) return null
  if (/\/topic_collection\//.test(titleA.getAttribute('href') || '')) return null
  const authorA = li.querySelector('.post-avatar a[href^="/user/"]') || li.querySelector('.post-meta a[href^="/user/"]')
  const forumA = li.querySelector('.post-forum-meta a[href^="/forum/"], .post-meta a[href^="/forum/"]')
  const stamp = li.querySelector('span[data-performance-time]')
  const counts = [...li.querySelectorAll('.post-meta span')]
    .map((s) => text(s))
    .filter((t) => /^\d[\d,]*$/.test(t))
    .map(num)
  const redEl = li.querySelector('.red-packet-title-status')
  const cardEl = li.querySelector('.virtual-card-title-status')
  const blob = (el) => (el ? `${el.className} ${text(el)}` : '')
  const redPacket = !redEl
    ? null
    : /结束|已抢|抢完|已领|ended|expired/i.test(blob(redEl))
      ? 'ended'
      : 'live'
  const cardBlob = blob(cardEl)
  const virtualCard = !cardEl
    ? null
    : cardEl.classList.contains('finished') || /结束|已结束|已发完|ended|expired/i.test(cardBlob)
      ? 'ended'
      : cardEl.classList.contains('active') || /发卡中|发放中/.test(text(cardEl))
        ? 'live'
        : 'ended'
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
    badges: [...li.querySelectorAll('.topic-stamp-badge, .red-packet-title-status, .virtual-card-title-status')].map(
      (b) => text(b),
    ),
    marks: { redPacket, virtualCard },
    el: li,
  }
}

export function parseList(root = document) {
  return [...root.querySelectorAll(SEL.listItems)]
    .map(parseListItem)
    .filter((x) => x && x.id)
}

function postLikeCount(li) {
  const likeBtn = li.querySelector('[data-like-coin-action]')
  if (likeBtn) return num(text(li.querySelector('.like-coin-count')))
  const donate = li.querySelector('.donate-topic-reaction-count, [data-donate-topic-like-count]')
  if (donate) {
    const n = num(text(donate))
    if (Number.isFinite(n)) return n
    return num(donate.getAttribute('data-donate-topic-like-count'))
  }
  return null
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
      .filter((g) => !g.classList.contains('gacha-title-post-badge') && !g.classList.contains('user-uid-badge'))
      .map((g) => text(g))
      .filter((t) => t && !/^UID/.test(t)),
    ts: stamp ? num(stamp.getAttribute('data-performance-time')) : null,
    html: li.querySelector('.post-content')?.innerHTML ?? '',
    content: text(li.querySelector('.post-content')),
    likes: postLikeCount(li),
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
  const docHref = doc.location?.href || doc.defaultView?.location?.href || 'https://linux.sb/'
  const parsePage = (href) => {
    try {
      const base = new URL(docHref)
      const url = new URL(href, base)
      if (url.origin !== base.origin) return null
      const values = url.searchParams.getAll('p')
      if (values.length !== 1 || !/^\d+$/.test(values[0])) return null
      const page = Number(values[0])
      return Number.isSafeInteger(page) && page > 0 ? page : null
    } catch {
      return null
    }
  }
  const currentPage =
    parsePage(docHref) ?? parsePage(doc.querySelector('.pagination li.active a[href]')?.getAttribute('href') || '') ?? 1
  const idFromCanonical = idFrom(doc.querySelector('link[rel="canonical"]')?.getAttribute('href') || '', 'topic')
  return {
    id: idFromCanonical ?? (posts[0] ? posts[0].postId : null),
    title: text(doc.querySelector('h1.post-content-title')),
    forumId: crumbForum ? idFrom(crumbForum.getAttribute('href'), 'forum') : null,
    forumName: crumbForum ? text(crumbForum) : null,
    views: stats[0] ?? null,
    replies: stats[1] ?? null,
    pages,
    currentPage,
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

/** 本人回帖 tab 的候选主题与回帖 ID；正文和楼层需经选中后的主题解析取得。 */
export function parseUserReplies(root = document, expectedUserId = null) {
  const doc = root?.nodeType === 9 ? root : root?.ownerDocument
  if (!doc) return []
  const activeTab = root.querySelector('.tab-bar a.tab.active[href]')
  if (!activeTab) return []
  const activeHref = activeTab.getAttribute('href') || ''
  let pageUrl
  try {
    const href = doc.location?.href || doc.defaultView?.location?.href
    if (href && /^https?:\/\//i.test(href)) {
      pageUrl = new URL(href)
    } else {
      // Documents parsed from an HTTP response have no browsing-context URL.
      // Derive the route from the active local tab and reject absolute URLs so
      // page markup cannot choose an arbitrary origin as its own trust anchor.
      if (!/^\/(?!\/)/.test(activeHref)) return []
      pageUrl = new URL(activeHref, 'https://linux.sb/')
    }
  } catch {
    return []
  }
  const userPath = pageUrl.pathname.match(/^\/user\/(\d+)$/)
  if (expectedUserId != null) {
    const expectedId = Number(expectedUserId)
    if (!Number.isSafeInteger(expectedId) || expectedId <= 0 || Number(userPath?.[1]) !== expectedId) return []
  }
  if (!userPath || pageUrl.searchParams.getAll('tab').length !== 1 || pageUrl.searchParams.get('tab') !== 'replies') return []
  try {
    const activeUrl = new URL(activeHref, pageUrl)
    if (
      activeUrl.origin !== pageUrl.origin ||
      activeUrl.pathname !== pageUrl.pathname ||
      activeUrl.searchParams.getAll('tab').length !== 1 ||
      activeUrl.searchParams.get('tab') !== 'replies'
    ) return []
  } catch {
    return []
  }

  const replies = []
  const seen = new Set()
  for (const row of root.querySelectorAll('.forum-main ul.post-list > li.post-item')) {
    const anchor = row.querySelector('a.post-title[href]')
    if (!anchor) continue
    try {
      const url = new URL(anchor.getAttribute('href'), pageUrl)
      const topicMatch = url.pathname.match(/^\/topic\/(\d+)$/)
      const postValues = url.searchParams.getAll('replyid')
      const topicId = Number(topicMatch?.[1])
      const postId = Number(postValues[0])
      if (
        url.origin !== pageUrl.origin ||
        !topicMatch ||
        url.searchParams.size !== 1 ||
        postValues.length !== 1 ||
        !Number.isSafeInteger(topicId) || topicId <= 0 ||
        !Number.isSafeInteger(postId) || postId <= 0
      ) continue
      const key = `${topicId}:${postId}`
      const topicTitle = text(anchor).slice(0, 240)
      if (!topicTitle || seen.has(key)) continue
      seen.add(key)
      replies.push({ postId, topicId, topicTitle })
    } catch {
      // Invalid or external list links are not candidate replies.
    }
  }
  return replies
}

/** 用户页「通知」tab：li.notification-item；未读靠自身 unread 类。链接进主题，不是 /notify/:id。 */
export function parseNotifications(root = document) {
  return [...root.querySelectorAll('li.notification-item')].map((el) => {
    const topicA = el.querySelector('a[href*="/topic/"]')
    const href = topicA ? topicA.getAttribute('href') : ''
    const content = el.querySelector('.notification-content')
    return {
      id: href ? idFrom(href, 'topic') : null,
      title: content ? text(content) : text(el),
      href,
      unread: el.classList.contains('unread'),
    }
  })
}

/** 帖子页里的点赞/打赏元数据，供插件做批量操作 */
export function parseLikeTargets(doc = document) {
  const coins = [...doc.querySelectorAll('[data-like-coin-action]')].map((btn) => {
    const tiers = [...new Set((btn.getAttribute('data-like-coin-tiers') || '').split(',')
      .map((value) => value.trim())
      .filter((value) => /^\d+$/.test(value))
      .map(Number)
      .filter((value) => Number.isSafeInteger(value) && value > 0))]
    const likedValue = btn.getAttribute('data-like-coin-liked')
    return {
      type: btn.getAttribute('data-like-coin-type'),
      id: num(btn.getAttribute('data-like-coin-id')),
      tiers,
      liked: likedValue === '1' ? true : likedValue === '0' ? false : null,
      coined: num(btn.getAttribute('data-like-coin-coined')),
      count: num(text(btn.parentElement?.querySelector('.like-coin-count'))),
      el: btn,
    }
  })
  if (coins.length) return coins
  return [...doc.querySelectorAll('[data-donate-btn]')].map((btn) => {
    const replyRaw = btn.getAttribute('data-donate-reply-id')
    const topicRaw = btn.getAttribute('data-donate-topic-id')
    const id = replyRaw != null && replyRaw !== '' ? num(replyRaw) : num(topicRaw)
    const countEl = btn.querySelector('.donate-topic-reaction-count') || btn
    return {
      type: 'donate',
      id,
      tiers: [],
      liked: null,
      coined: null,
      count: num(text(countEl)),
      el: btn,
    }
  })
}

/** 主题收藏状态。只在本站收藏表单明确表达已收藏/可收藏时返回布尔值。 */
export function parseTopicFavoriteState(doc = document) {
  if (!doc?.querySelectorAll) return null
  const currentHref = doc.location?.href || doc.defaultView?.location?.href || ''
  let base
  try {
    base = /^https?:\/\//i.test(currentHref) ? new URL(currentHref) : new URL('https://linux.sb/')
  } catch {
    base = new URL('https://linux.sb/')
  }
  const forms = [...doc.querySelectorAll('form.topic-favorites-action, form[action]')].filter((form) => {
    if (String(form.method || '').toLowerCase() !== 'post') return false
    try {
      const action = new URL(form.getAttribute('action') || base.href, base)
      return action.origin === base.origin && action.pathname === ROUTES.post.favorite && !action.search && !action.hash
    } catch {
      return false
    }
  })
  if (forms.length !== 1) return null
  const buttons = forms[0].querySelectorAll('button.fav-btn, input[type="submit"].fav-btn')
  if (buttons.length !== 1 || buttons[0].disabled) return null
  const button = buttons[0]
  const state = String(button.getAttribute('data-favorite-state') || button.getAttribute('data-favorited') || '').trim().toLowerCase()
  if (['1', 'true', 'favorited', 'saved'].includes(state)) return true
  if (['0', 'false', 'not-favorited', 'unsaved'].includes(state)) return false
  const pressed = button.getAttribute('aria-pressed')
  if (pressed === 'true') return true
  if (pressed === 'false') return false
  if (button.classList.contains('active') || button.classList.contains('is-favorited')) return true
  const label = `${button.getAttribute('aria-label') || ''} ${button.getAttribute('title') || ''} ${text(button)}`.trim()
  if (/取消收藏|已收藏/.test(label)) return true
  if (/^收藏(?:主题)?(?:\s+收藏(?:主题)?)?$/.test(label)) return false
  return null
}

