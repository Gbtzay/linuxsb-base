import { num, text, idFrom } from '../util.js'

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
  topicReply: (topicId, postId) => {
    const topic = Number(topicId)
    const post = Number(postId)
    if (!Number.isSafeInteger(topic) || topic <= 0 || !Number.isSafeInteger(post) || post <= 0) {
      throw new Error('主题或回帖路由 ID 无效')
    }
    return `/topic/${topic}?replyid=${post}`
  },
  user: (id, tab, p = 1) => {
    const uid = Number(id)
    const page = Number(p)
    if (!Number.isSafeInteger(uid) || uid <= 0 || !Number.isSafeInteger(page) || page < 1) {
      throw new Error('用户路由 ID 或页码无效')
    }
    if (tab != null && !USER_TABS.includes(String(tab))) throw new Error('用户路由 tab 无效')
    const q = new URLSearchParams()
    if (tab) q.set('tab', String(tab))
    if (page > 1) q.set('p', String(page))
    const suffix = q.toString()
    return `/user/${uid}${suffix ? `?${suffix}` : ''}`
  },
  forumList: '/forum_list',
  profile: '/profile',
  topicEdit: '/topic_edit',
  search: '/search',
  searchResults: (query, field, p = 1) => {
    const q = String(query || '').trim()
    const page = Number(p)
    if (!q || !['title', 'body', 'reply'].includes(String(field))) throw new Error('搜索结果路由参数无效')
    if (!Number.isSafeInteger(page) || page < 1) throw new Error('搜索结果页码无效')
    const params = new URLSearchParams({ q, field: String(field) })
    if (page > 1) params.set('p', String(page))
    return `/index.php?${params.toString()}`
  },
  checkin: '/daily_checkin',
  leaderboard: (type = 'points') => `/leaderboard?type=${type}`,
  invite: '/invite_center',
  inviteLegacy: '/invite_code',
  gacha: '/gacha',
  gachaMarket: '/gacha_market',
  gachaProfile: '/gacha_profile',
  gachaForge: '/gacha_forge_center',
  gachaRecycle: '/gacha_recycle_center',
  gachaRecipes: '/gacha_recipes',
  wallet: '/community_wallet',
  featured: '/topic_featured',
  hotDiscussions: '/hot_discussions',
  footprint: '/unread_topic_notice_footprint',
  collections: '/topic_collections',
  collection: (id) => `/topic_collection/${id}`,
  identity: '/identity_center',
  promotions: '/promotions',
  essenceReview: '/topic_essence_review_list',
  colorScheme: '/color_scheme',
  keywordFilter: '/home_keyword_filter_settings',
  messages: '/direct_messages',
  userBlock: '/user_block',
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


export const USER_TABS = ['topics', 'replies', 'attachments', 'notifications', 'points_rewards', 'favorites']


export function listPages(root = document) {
  const doc = root?.nodeType === 9 ? root : root?.ownerDocument
  const baseHref = doc?.location?.href || doc?.defaultView?.location?.href || 'https://linux.sb/'
  const origin = (() => {
    try {
      return new URL(baseHref).origin
    } catch {
      return 'https://linux.sb'
    }
  })()
  const pages = new Set([1])
  for (const anchor of root?.querySelectorAll?.('.pagination a[href]') || []) {
    const href = anchor.getAttribute('href')
    try {
      const url = new URL(href, baseHref)
      if (url.origin !== origin) continue
      const page = Number(url.searchParams.get('p'))
      if (Number.isSafeInteger(page) && page > 0) pages.add(page)
    } catch {
      // 忽略不能解析的分页链接。
    }
  }
  return [...pages].sort((a, b) => a - b)
}

