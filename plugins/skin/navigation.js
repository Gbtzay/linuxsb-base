/** 双界面的导航数据；每次读取当前路由、站点目录与 DOM，渲染和生命周期由调用方管理。 */
export function createSkinNavigation({ document, getPage, getForums, getLocation, parseTopic, store, homeSorted }) {
  function collectBoards() {
    const forums = getForums() || []
    const cached = store.get('boardCounts') || {}
    const live = {}
    for (const f of forums) {
      if (Number.isFinite(f.topics)) live[f.id] = f.topics
    }
    const counts = { ...cached, ...live }
    if (Object.keys(live).length) store.set('boardCounts', counts)
    if (forums.length) {
      return forums.map((f) => ({
        href: `/forum/${f.id}`,
        label: f.name,
        count: counts[f.id],
      }))
    }
    const seen = new Set()
    const out = []
    for (const a of document.querySelectorAll('.forum-nav a[href^="/forum/"]')) {
      const href = a.getAttribute('href')
      const label = (a.textContent || '').trim()
      if (!href || seen.has(href)) continue
      seen.add(href)
      const id = Number((href.match(/\/forum\/(\d+)/) || [])[1])
      out.push({ href, label, count: counts[id] })
    }
    return out
  }

  function pagePath() {
    try {
      return getLocation().pathname.replace(/\/+$/, '') || '/'
    } catch {
      return ''
    }
  }

  function locationText() {
    const p = getPage() || {}
    const path = pagePath()
    const type = p.type
    if (type === 'collections' || path === '/topic_collections') {
      let tab = type === 'collections' ? p.tab : null
      if (tab == null) {
        try {
          tab = new URL(getLocation().href).searchParams.get('tab')
        } catch {
          tab = null
        }
      }
      return tab === 'mine' || !tab ? '我的淘帖' : '淘帖中心'
    }
    if (type === 'collection' || /^\/topic_collection\/\d+$/.test(path)) {
      const title = (document.querySelector('h1.post-content-title, h1')?.textContent || '').trim()
      return title || '淘帖'
    }
    if (type === 'identity' || path === '/identity_center') return '认证中心'
    if (type === 'promotions' || path === '/promotions') return '我的广告'
    if (type === 'messages' || path === '/direct_messages') return '我的私信'
    if (type === 'user_block' || path === '/user_block') return '屏蔽名单'
    if (type === 'essence_review' || path === '/topic_essence_review_list') return '申精'
    if (type === 'home' || path === '/' || path === '/index.php') {
      if (path === '/' || path === '/index.php') {
        if (p.sort === 'lucky') return '抽奖'
        if (p.sort === 'card') return '发卡'
        if (p.sort === 'red_packet') return '红包'
        if (p.sort === 'comment') return '新评论'
        return '新帖子'
      }
    }
    if (type === 'forum') {
      const f = (getForums() || []).find((x) => x.id === p.id)
      return f?.name || '版块'
    }
    if (type === 'topic') {
      try {
        const title = parseTopic(document)?.title
        if (title) return title
      } catch {
        /* 解析失败则读标题节点 */
      }
      return (document.querySelector('h1.post-content-title')?.textContent || '').trim() || '帖子'
    }
    if (type === 'user') return '用户'
    if (type === 'featured') return '精华'
    if (type === 'hot_discussions' || path === '/hot_discussions') return '热议'
    if (type === 'footprint') return '足迹'
    if (type === 'gacha') return '称号抽取'
    if (type === 'gacha_market') return '称号交易'
    if (type === 'gacha_profile') return '我的称号'
    if (type === 'wallet') return '我的烧饼'
    if (type === 'invite') return '邀请中心'
    return 'LINUX SB'
  }

  function isActiveHref(href) {
    const p = getPage() || {}
    if (href === '/' || href === '') return p.type === 'home'
    if (p.type === 'forum') return href === `/forum/${p.id}`
    return false
  }

  function canvasPageType() {
    const type = String(getPage()?.type || '')
    if (['home', 'forum', 'topic', 'user', 'settings'].includes(type)) return type
    const path = pagePath()
    if (path === '/' || path === '/index.php') return 'home'
    if (/^\/forum\/\d+/.test(path) || /^\/category\/\d+/.test(path)) return 'forum'
    if (/^\/topic\/\d+/.test(path)) return 'topic'
    if (/^\/user(?:\/|$)/.test(path)) return 'user'
    if (/settings|preferences|config/i.test(path)) return 'settings'
    return 'page'
  }

  function navigationEntries() {
    const location = getLocation()
    const currentHref = `${location.pathname}${location.search}${location.hash}`
    const favorite = document.querySelector('a[href*="tab=favorites"], a[href*="favorites"]')
    const search = document.querySelector('form.search-form')
    const entries = [
      { href: '/', label: '全部主题', group: '站点' },
      { href: homeSorted('post'), label: '新帖子', group: '站点' },
      ...(currentHref !== '/' ? [{ href: currentHref, label: '当前页面', group: '最近访问' }] : []),
      ...(favorite?.getAttribute('href') ? [{ href: favorite.getAttribute('href'), label: '我的收藏', group: '收藏' }] : []),
      ...(search?.getAttribute('action') ? [{ href: search.getAttribute('action'), label: '站内搜索', group: '搜索' }] : [{ href: '/search', label: '站内搜索', group: '搜索' }]),
      ...collectBoards().slice(0, 80).map((item) => ({ href: item.href, label: item.label, group: '版块' })),
    ]
    const out = []
    const seen = new Set()
    for (const item of entries) {
      if (!item?.href || !item.label || seen.has(item.href)) continue
      seen.add(item.href)
      out.push(item)
    }
    return out
  }

  return { collectBoards, pagePath, locationText, isActiveHref, canvasPageType, navigationEntries }
}
