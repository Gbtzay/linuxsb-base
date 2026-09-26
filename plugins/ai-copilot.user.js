// ==UserScript==
// @name         LSB·AI 帖子副驾
// @namespace    https://linux.sb/
// @version      0.1.0
// @description  帖子问答、讨论分析与回复草稿。复用 LSB·AI 总结的模型配置，不自动提交站内回复。
// @author       you
// @match        https://linux.sb/*
// @grant        none
// @run-at       document-end
// @noframes
// ==/UserScript==
(function () {
  'use strict'

  const CONFIG = {
    fetchAll: { type: 'switch', label: '采集全部分页', default: false },
    maxPages: { type: 'number', label: '最多抓取页数', default: 15 },
    maxChars: { type: 'number', label: '送入模型的正文上限 (字符)', default: 12000 },
    sessionTurns: { type: 'number', label: '每帖会话轮数', default: 6 },
  }

  const manifest = {
    id: 'ai-copilot',
    name: 'AI 帖子副驾',
    version: '0.1.0',
    description: '帖子问答、讨论分析与回复草稿；不自动提交站内回复',
    author: 'you',
    requires: {
      base: '^0.1.0',
      plugins: { 'ai-summary': '^1.2.0' },
    },
    permissions: ['read', 'storage', 'ui', 'events'],
    pages: ['topic'],
    config: CONFIG,
  }

  const OP_BUDGET_RATIO = 0.5
  const MIN_TOTAL_CHARS = 500

  function asNumber(value, fallback = 0) {
    const n = Number(value)
    return Number.isFinite(n) ? n : fallback
  }

  function hashText(value) {
    let h = 2166136261
    for (const ch of String(value || '')) {
      h ^= ch.charCodeAt(0)
      h = Math.imul(h, 16777619)
    }
    return (h >>> 0).toString(36)
  }

  function normalizePost(post) {
    const rawId = post?.postId ?? post?.id ?? ''
    const numericId = Number(rawId)
    return {
      postId: Number.isFinite(numericId) && numericId > 0 ? numericId : String(rawId),
      floor: asNumber(post?.floor, 0),
      authorName: String(post?.authorName || post?.author || '?'),
      time: String(post?.time || post?.timestamp || ''),
      content: String(post?.content || '').trim(),
    }
  }

  function normalizeTopic(topic) {
    if (!topic) return null
    return {
      id: asNumber(topic.id, 0),
      title: String(topic.title || ''),
      forumName: String(topic.forumName || ''),
      views: asNumber(topic.views, 0),
      replies: asNumber(topic.replies, 0),
      pages: Math.max(1, asNumber(topic.pages, 1)),
      posts: Array.isArray(topic.posts) ? topic.posts.map(normalizePost) : [],
    }
  }

  function dedupePosts(posts) {
    const seen = new Set()
    return posts.filter((post) => {
      const key = `${post.postId}:${post.floor}:${post.authorName}`
      if (seen.has(key)) return false
      seen.add(key)
      return true
    })
  }

  function cacheKey(topicId, fingerprint) {
    return `c:${topicId}:${fingerprint}`
  }

  function setup(api) {
    let cfg = api.config()
    api.on('config:changed:ai-copilot', () => {
      cfg = api.config()
    })

    async function collectContext(options = {}) {
      const fetchAll = options.fetchAll == null ? Boolean(cfg.fetchAll) : Boolean(options.fetchAll)
      const maxPages = Math.max(1, asNumber(options.maxPages == null ? cfg.maxPages : options.maxPages, 15))
      const totalBudget = Math.max(
        MIN_TOTAL_CHARS,
        asNumber(options.maxChars == null ? cfg.maxChars : options.maxChars, 12000),
      )

      let live = null
      try {
        live = normalizeTopic(api.parse.topic(document))
      } catch {
        live = null
      }
      const initial = live?.posts?.length ? live : normalizeTopic(api.snapshot?.topic)
      if (!initial || !initial.posts.length) throw new Error('本页没有帖子数据')

      const topic = {
        ...initial,
        posts: [...initial.posts],
      }
      let pagesFetched = 1
      if (fetchAll && topic.pages > 1) {
        const cap = Math.min(topic.pages, maxPages)
        const seen = new Set(topic.posts.map((post) => `${post.postId}:${post.floor}:${post.authorName}`))
        for await (const { page, doc } of api.net.pages((p) => api.routes.topic(api.page.id, p), cap)) {
          if (page === 1) continue
          const pageTopic = normalizeTopic(api.parse.topic(doc))
          for (const post of pageTopic?.posts || []) {
            const key = `${post.postId}:${post.floor}:${post.authorName}`
            if (!seen.has(key)) {
              seen.add(key)
              topic.posts.push(post)
            }
          }
          pagesFetched = Math.max(pagesFetched, page)
        }
      }

      const posts = dedupePosts(topic.posts).sort((a, b) => a.floor - b.floor || String(a.postId).localeCompare(String(b.postId)))
      const op = posts.find((post) => post.floor === 0) || null
      const replies = posts.filter((post) => post.floor > 0 && post.content)
      const opCap = Math.floor(totalBudget * OP_BUDGET_RATIO)
      let opText = op?.content || ''
      let opTruncated = false
      if (opText.length > opCap) {
        opText = opText.slice(0, opCap) + '…[主楼已截断]'
        opTruncated = true
      }
      const bodyBudget = Math.max(200, totalBudget - opText.length)
      let body = replies.map((post) => `[#${post.floor}] ${post.authorName}：${post.content}`).join('\n')
      let bodyTruncated = false
      if (body.length > bodyBudget) {
        body = body.slice(0, bodyBudget) + '\n…[后文已截断]'
        bodyTruncated = true
      }

      const floors = replies.map((post) => post.floor)
      const range = floors.length ? `#${Math.min(...floors)}–#${Math.max(...floors)}` : '无'
      const head =
        `标题：${topic.title}\n版块：${topic.forumName || '?'}\n` +
        `浏览 ${topic.views} · 回复 ${topic.replies} · ` +
        `本次采集 ${pagesFetched}/${topic.pages} 页 · 含楼层 ${range}\n` +
        (op ? '' : '注意：本次未包含主楼（当前为分页视图），请基于以下回复作答。\n') +
        '\n'
      const text = head + (op ? `[楼主] ${op.authorName}：${opText}\n\n` : '') + body
      const hash = hashText(
        posts.map((post) => `${post.postId}|${post.floor}|${post.authorName}|${post.content}`).join('\n'),
      )
      return {
        topicId: api.page.id || topic.id,
        title: topic.title,
        forumName: topic.forumName,
        views: topic.views,
        replies: topic.replies,
        posts,
        text,
        meta: {
          floors: replies.length + (op ? 1 : 0),
          pagesFetched,
          pagesTotal: topic.pages,
          hasOp: Boolean(op),
          range,
          chars: text.length,
          budget: totalBudget,
          truncated: opTruncated || bodyTruncated,
          hash,
        },
      }
    }

    api.handle('ai-copilot:debug', () => ({
      collectContext,
      normalize: normalizeTopic,
      cacheKey,
      state: () => ({ topicId: api.page.id, page: api.page.type }),
    }))

    return {}
  }

  const w = typeof unsafeWindow !== 'undefined' ? unsafeWindow : window
  if (w.LSB && w.LSB.register) w.LSB.register(manifest, setup)
  else ;(w.LSB_PLUGINS = w.LSB_PLUGINS || []).push({ manifest, setup })
})()
