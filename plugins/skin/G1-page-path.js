// @skin-part: G1 pagePath/locationText/isActiveHref: 当前路径与站点文案
// · G1 pagePath/locationText/isActiveHref: 当前路径与站点文案 ──
    function pagePath() {
      try {
        return location.pathname.replace(/\/+$/, '') || '/'
      } catch {
        return ''
      }
    }

    function locationText() {
      const p = api.page || {}
      const path = pagePath()
      const type = p.type
      if (type === 'collections' || path === '/topic_collections') {
        let tab = type === 'collections' ? p.tab : null
        if (tab == null) {
          try {
            tab = new URL(location.href).searchParams.get('tab')
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
        const f = (api.forums || []).find((x) => x.id === p.id)
        return f?.name || '版块'
      }
      if (type === 'topic') {
        try {
          const title = api.parse.topic(document)?.title
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
      const p = api.page || {}
      if (href === '/' || href === '') return p.type === 'home'
      if (p.type === 'forum') return href === `/forum/${p.id}`
      return false
    }

    function restoreNode(el, home, cls) {
      if (!el) return
      el.classList.remove(cls)
      if (!home?.parent?.isConnected) {
        el.remove()
        return
      }
      if (home.next?.parentNode === home.parent) {
        home.parent.insertBefore(el, home.next)
      } else {
        home.parent.append(el)
      }
    }
