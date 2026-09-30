// ==UserScript==
// @name         LSB·AI 站内动作
// @namespace    https://linux.sb/
// @version      0.1.0
// @description  为 AI 工作台登记受限的站内只读动作：导航、搜索和打开面板。
// @author       you
// @match        https://linux.sb/*
// @grant        none
// @run-at       document-end
// @noframes
// ==/UserScript==

(function () {
  'use strict'

  const manifest = {
    id: 'ai-actions',
    name: 'AI 站内动作',
    version: '0.1.0',
    description: '为 AI 工作台提供导航、搜索、打开面板等只读站内动作',
    author: 'you',
    requires: { base: '^0.1.43' },
    permissions: ['read', 'ui', 'events'],
  }

  function setup(api) {
    const FEATURE_ROUTES = Object.freeze({
      profile: () => api.routes.profile,
      forum_list: () => api.routes.forumList,
      featured: () => api.routes.featured,
      collections: () => api.routes.collections,
      checkin: () => api.routes.checkin,
      leaderboard: () => api.routes.leaderboard('points'),
      gacha: () => api.routes.gacha,
      wallet: () => api.routes.wallet,
      identity: () => api.routes.identity,
      promotions: () => api.routes.promotions,
      essence_review: () => api.routes.essenceReview,
    })
    const TARGETS = ['home', 'forum', 'topic', 'user', 'feature']
    const USER_TABS = ['topics', 'replies', 'attachments', 'notifications', 'points_rewards', 'favorites']
    const SEARCH_FIELDS = ['title', 'body', 'reply']
    const internalUrl = (url) => {
      const value = String(url || '')
      if (!/^\/(?!\/)/.test(value) || /^(?:javascript|data|blob|file):/i.test(value)) throw new Error('action.external-url')
      return value
    }
    const customError = (code, message, path = 'args') => ({ code, message, path })

    api.ai.registerAction({
      id: 'site.navigate',
      version: 1,
      terminal: true,
      order: 10,
      label: '站内导航',
      description: '打开首页、版块、帖子、用户页或固定功能页',
      permission: 'read',
      args: {
        target: { type: 'enum', values: TARGETS },
        id: { type: 'number', optional: true, integer: true, min: 1 },
        tab: { type: 'enum', optional: true, values: USER_TABS },
        feature: { type: 'enum', optional: true, values: Object.keys(FEATURE_ROUTES) },
      },
      validateArgs: (args) => {
        if (args.target === 'home') {
          if (args.id != null || args.tab != null || args.feature != null) return customError('args.target-fields', '首页导航不接受 id/tab/feature')
        } else if (args.target === 'forum' || args.target === 'topic') {
          if (args.id == null) return customError('args.id-required', '版块或帖子导航需要正整数 id', 'args.id')
          if (args.tab != null || args.feature != null) return customError('args.target-fields', '版块或帖子导航不接受 tab/feature')
        } else if (args.target === 'user') {
          if (args.id == null) return customError('args.id-required', '用户导航需要正整数 id', 'args.id')
          if (args.feature != null) return customError('args.target-fields', '用户导航不接受 feature')
        } else if (args.target === 'feature') {
          if (!args.feature) return customError('args.feature-required', '功能页导航需要固定 feature', 'args.feature')
          if (args.id != null || args.tab != null) return customError('args.target-fields', '功能页导航不接受 id/tab')
        }
        return null
      },
      preview: (args) => {
        if (args.target === 'home') return '打开首页'
        if (args.target === 'forum') return `打开版块 #${args.id}`
        if (args.target === 'topic') return `打开帖子 #${args.id}`
        if (args.target === 'user') return `打开用户 #${args.id}${args.tab ? `的${args.tab}页` : ''}`
        return `打开功能页：${args.feature}`
      },
      execute: (args) => {
        let url
        let label
        if (args.target === 'home') {
          url = api.routes.home
          label = '已打开首页'
        } else if (args.target === 'forum') {
          url = api.routes.forum(args.id)
          label = '已打开版块'
        } else if (args.target === 'topic') {
          url = api.routes.topic(args.id)
          label = '已打开帖子'
        } else if (args.target === 'user') {
          url = api.routes.user(args.id, args.tab)
          label = '已打开用户页'
        } else {
          url = FEATURE_ROUTES[args.feature]()
          label = '已打开功能页'
        }
        return { kind: 'navigation', url: internalUrl(url), label }
      },
    })

    api.ai.registerAction({
      id: 'site.search',
      version: 1,
      terminal: true,
      order: 20,
      label: '站内搜索',
      description: '按关键词和字段搜索站内内容',
      permission: 'read',
      pages: ['home', 'forum', 'topic', 'user', 'search'],
      args: {
        query: { type: 'string', minLength: 1, maxLength: 120 },
        field: { type: 'enum', values: SEARCH_FIELDS },
      },
      preview: (args) => `搜索“${args.query}”（${args.field}）`,
      execute: async (args) => {
        const result = await api.net.search(args.query, args.field)
        return { kind: 'navigation', url: internalUrl(result.url), label: '已打开搜索结果' }
      },
    })

    api.ai.registerAction({
      id: 'ui.openPanel',
      version: 1,
      order: 30,
      label: '打开面板',
      description: '打开基座或已注册插件面板',
      permission: 'ui',
      args: {
        id: { type: 'enum', values: () => api.ui.panels().map((item) => item.id) },
      },
      preview: (args) => {
        const panel = api.ui.panels().find((item) => item.id === args.id)
        return `打开面板：${panel?.label || args.id}`
      },
      execute: (args) => {
        const panel = api.ui.panels().find((item) => item.id === args.id)
        if (!panel) throw new Error('action.panel-unavailable')
        api.ui.openPanel(args.id)
        return { kind: 'panel', id: panel.id, label: `已打开面板：${panel.label}` }
      },
    })

    return {}
  }

  const w = typeof unsafeWindow !== 'undefined' ? unsafeWindow : window
  if (w.LSB && w.LSB.register) w.LSB.register(manifest, setup)
  else ;(w.LSB_PLUGINS = w.LSB_PLUGINS || []).push({ manifest, setup })
})()
