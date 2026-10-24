import { num, text, idFrom } from '../util.js'
import { ROUTES } from './routes.js'
import { SEL } from './selectors.js'

export function detectPage(loc = location) {
  const path = loc.pathname.replace(/\/+$/, '') || '/'
  const q = new URLSearchParams(loc.search)
  const mTopic = path.match(/^\/topic\/(\d+)$/)
  if (mTopic) return { type: 'topic', id: Number(mTopic[1]), page: Number(q.get('p') || 1) }
  const mCollection = path.match(/^\/topic_collection\/(\d+)$/)
  if (mCollection) return { type: 'collection', id: Number(mCollection[1]) }
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
  if (path === '/topic_collections') return { type: 'collections', tab: q.get('tab') || 'mine' }
  const known = {
    '/profile': 'profile',
    '/topic_edit': 'topic_edit',
    '/daily_checkin': 'checkin',
    '/leaderboard': 'leaderboard',
    '/invite_center': 'invite',
    '/invite_code': 'invite',
    '/forum_list': 'forum_list',
    '/search': 'search',
    '/donate': 'donate',
    '/gacha': 'gacha',
    '/gacha_market': 'gacha_market',
    '/gacha_profile': 'gacha_profile',
    '/gacha_forge_center': 'gacha_forge',
    '/gacha_recycle_center': 'gacha_recycle',
    '/gacha_recipes': 'gacha_recipes',
    '/community_wallet': 'wallet',
    '/topic_featured': 'featured',
    '/hot_discussions': 'hot_discussions',
    '/unread_topic_notice_footprint': 'footprint',
    '/identity_center': 'identity',
    '/promotions': 'promotions',
    '/topic_essence_review_list': 'essence_review',
    '/color_scheme': 'color_scheme',
    '/home_keyword_filter_settings': 'keyword_filter',
    '/direct_messages': 'messages',
    '/user_block': 'user_block',
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

