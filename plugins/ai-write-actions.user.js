// ==UserScript==
// @name         LSB·AI 内容写入动作
// @namespace    https://linux.sb/
// @version      0.1.4
// @description  为 AI 工作台提供需二次确认的已选目标回复、发帖、签到、点赞、收藏和投币动作。
// @author       you
// @match        https://linux.sb/*
// @grant        none
// @run-at       document-end
// @noframes
// ==/UserScript==

(function () {
  'use strict'

  const manifest = {
    id: 'ai-write-actions',
    name: 'AI 内容写入动作',
    version: '0.1.4',
    description: '为 AI 工作台提供需二次确认的当前/已选目标回复、发帖、签到、点赞、收藏和投币动作',
    author: 'you',
    requires: { base: '^0.1.49' },
    permissions: ['read', 'write', 'ui', 'events'],
  }

  function setup(api) {
    const REPLY_PATH = '/reply_edit'
    const TOPIC_PATH = '/topic_edit'
    const CHECKIN_RPC = 'checkin-calendar:ai-checkin'
    const REACTION_SCOPE_RPC = 'ai-copilot:reaction-scope-valid'
    const ACTION_SCOPE_RPC = 'ai-copilot:action-scope-valid'
    const RESULT_CHECK_RPC = 'ai-write-actions:check-result'
    const RECEIPT_TTL = 10 * 60 * 1000
    const receipts = new Map()
    let traceSequence = 0

    /*
     * M11 trace records describe only the local write lifecycle.  Keep flow IDs
     * deliberately narrow so a caller cannot smuggle a body, URL or credential
     * into the trace payload.  Receipt entries may retain the flow ID in memory,
     * but it is never returned as part of the receipt or persisted by this plugin.
     */
    function traceFlowId(value) {
      const candidate = typeof value === 'string' ? value.trim() : ''
      return /^[A-Za-z0-9][A-Za-z0-9._:-]{0,99}$/.test(candidate) ? candidate : ''
    }

    function newWriteTrace(context = {}) {
      const supplied = traceFlowId(context?.flowId)
      return {
        flowId: supplied || `write-${Date.now().toString(36)}-${(++traceSequence).toString(36)}`,
        ids: Object.create(null),
        limited: false,
      }
    }

    function emitWriteTrace(trace, stage, state, summary, { evidence = 'partial', reasonCode } = {}) {
      if (!trace || !api.ai?.trace?.emit) return
      const id = trace.ids[stage] || `write-${stage}-${(++traceSequence).toString(36)}`
      trace.ids[stage] = id
      try {
        api.ai.trace.emit({
          id,
          flowId: trace.flowId,
          stage,
          state,
          title: stage === 'execute' ? '站内写入' : stage === 'check' ? '只读结果检查' : '安全限制',
          summary,
          evidence,
          counts: { selected: 1, read: 0, matched: 0, citations: 0 },
          citations: [],
          ...(reasonCode ? { reasonCode } : {}),
          ...(state === 'active' ? { startedAt: Date.now() } : { finishedAt: Date.now() }),
        })
      } catch {
        // Trace reporting must never alter the write or check result.
      }
    }

    function beginWriteTrace(context) {
      const trace = newWriteTrace(context)
      emitWriteTrace(trace, 'execute', 'active', '等待用户二次确认；尚未发送站点请求')
      return trace
    }

    function finishWriteTrace(trace, outcome) {
      if (!trace) return
      if (outcome === 'success') {
        emitWriteTrace(trace, 'execute', 'complete', '站点已明确返回成功', { evidence: 'verified' })
        return
      }
      if (outcome === 'failure') {
        emitWriteTrace(trace, 'execute', 'failed', '站点已明确返回失败', { evidence: 'verified' })
        return
      }
      if (outcome === 'cancelled') {
        emitWriteTrace(trace, 'execute', 'skipped', '用户取消二次确认，未发送站点请求', { evidence: 'verified' })
        return
      }
      emitWriteTrace(trace, 'execute', 'unknown', '站点写入结果未知，未确认是否已完成', { evidence: 'unverified', reasonCode: 'write-unknown' })
      if (!trace.limited) {
        trace.limited = true
        emitWriteTrace(trace, 'limit', 'complete', '结果未知；仅允许一次只读检查，禁止自动重发', { evidence: 'verified', reasonCode: 'write-unknown' })
      }
    }

    function finishCheckTrace(trace, result) {
      if (!trace) return
      const outcome = String(result?.outcome || '')
      if (outcome === 'success') {
        emitWriteTrace(trace, 'check', 'complete', '只读检查已确认站点结果', { evidence: 'verified' })
      } else if (outcome === 'failure') {
        emitWriteTrace(trace, 'check', 'failed', '只读检查确认站点结果未达到预期', { evidence: 'verified' })
      } else {
        emitWriteTrace(trace, 'check', 'unknown', '只读检查仍无法确认站点结果', { evidence: 'unverified', reasonCode: 'write-unknown' })
      }
    }

    function beginCheckTrace(entry) {
      const trace = traceFlowId(entry?.flowId) ? newWriteTrace({ flowId: entry.flowId }) : null
      if (trace) emitWriteTrace(trace, 'check', 'active', '正在只读检查站点结果；不会重新发送写请求')
      return trace
    }

    function shortHash(value) {
      let hash = 2166136261
      for (const ch of String(value || '').replace(/\s+/g, ' ').trim()) {
        hash ^= ch.charCodeAt(0)
        hash = Math.imul(hash, 16777619)
      }
      return (hash >>> 0).toString(36)
    }

    function receiptToken() {
      const bytes = new Uint8Array(18)
      try {
        if (globalThis.crypto?.getRandomValues) globalThis.crypto.getRandomValues(bytes)
        else throw new Error('crypto unavailable')
        return [...bytes].map((value) => value.toString(16).padStart(2, '0')).join('')
      } catch {
        return `${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 18)}`
      }
    }

    function rememberReceipt(entry) {
      const now = Date.now()
      for (const [token, row] of receipts) if (now - row.createdAt > RECEIPT_TTL) receipts.delete(token)
      const token = receiptToken()
      receipts.set(token, { ...entry, createdAt: now })
      return { token }
    }

    function postIdsForDocument(doc, topicId) {
      try {
        const topic = api.parse.topic(doc)
        if (Number(topic?.id) !== Number(topicId)) return []
        return (Array.isArray(topic.posts) ? topic.posts : [])
          .map((post) => Number(post.postId))
          .filter((id) => Number.isSafeInteger(id) && id > 0)
          .slice(0, 300)
      } catch {
        return []
      }
    }

    function replyReceipt({ flowId, topicId, page = 1, body, doc }) {
      return rememberReceipt({
        type: 'reply',
        flowId,
        topicId: Number(topicId),
        page: Number(page),
        bodyHash: shortHash(body),
        authorId: Number(api.me?.uid) > 0 ? Number(api.me.uid) : 0,
        prePostIds: postIdsForDocument(doc, topicId),
      })
    }

    function topicReadOptions() {
      return { retry: 0, headers: { 'cache-control': 'no-cache' } }
    }

    async function readTopicForReceipt(entry) {
      const topicId = Number(entry?.topicId)
      const page = Number(entry?.page)
      if (!Number.isSafeInteger(topicId) || topicId <= 0 || !Number.isSafeInteger(page) || page < 1) return null
      const doc = await api.net.doc(api.routes.topic(topicId, page), topicReadOptions())
      const topic = api.parse.topic(doc)
      if (!topic || Number(topic.id) !== topicId || Number(topic.currentPage) !== page) return null
      return { doc, topic }
    }

    async function checkReplyReceipt(entry) {
      const loaded = await readTopicForReceipt(entry)
      if (!loaded) return { outcome: 'unknown', status: 'check-unknown', message: '无法确认回复所在主题或页码' }
      const before = new Set((Array.isArray(entry.prePostIds) ? entry.prePostIds : []).map(Number))
      const authorId = Number(entry.authorId) || 0
      const matches = (Array.isArray(loaded.topic.posts) ? loaded.topic.posts : []).filter((post) => {
        const postId = Number(post.postId)
        if (!Number.isSafeInteger(postId) || postId <= 0 || before.has(postId)) return false
        if (authorId > 0 && Number(post.authorId) !== authorId) return false
        return shortHash(post.content) === String(entry.bodyHash || '')
      })
      if (matches.length === 1) return { outcome: 'success', status: 'checked-success', message: `已在主题 #${Number(entry.topicId)} 找到匹配回复` }
      if (matches.length > 1) return { outcome: 'unknown', status: 'check-ambiguous', message: '找到多条相同回复，无法安全确认是哪一次提交' }
      return { outcome: 'failure', status: 'checked-failure', message: '尚未在主题中找到匹配回复' }
    }

    async function checkReactionReceipt(entry) {
      const loaded = await readTopicForReceipt(entry)
      if (!loaded) return { outcome: 'unknown', status: 'check-unknown', message: '无法确认互动目标所在主题或页码' }
      const targetType = entry.targetType === 'reply' ? 'reply' : entry.targetType === 'topic' ? 'topic' : ''
      const targetId = Number(entry.targetId)
      if (!targetType || !Number.isSafeInteger(targetId) || targetId <= 0) return { outcome: 'unknown', status: 'check-unknown', message: '互动目标凭据无效' }
      if (targetType === 'reply') {
        const post = (Array.isArray(loaded.topic.posts) ? loaded.topic.posts : []).find((row) => Number(row.postId) === targetId)
        if (!post || Number(post.floor) !== Number(entry.floor)) return { outcome: 'unknown', status: 'check-unknown', message: '目标回帖未出现在重新读取的主题页中' }
      }
      const likeTarget = (api.parse.likeTargets(loaded.doc) || []).find((row) => row.type === targetType && Number(row.id) === targetId)
      if (entry.mode === 'favorite') {
        const state = api.parse.topicFavoriteState(loaded.doc)
        if (state === entry.desired) return { outcome: 'success', status: 'checked-success', message: entry.desired ? '已确认主题处于收藏状态' : '已确认主题未收藏' }
        if (state === true || state === false) return { outcome: 'failure', status: 'checked-failure', message: '重新读取的收藏状态与预期不符' }
        return { outcome: 'unknown', status: 'check-unknown', message: '站点页面没有明确的收藏状态' }
      }
      if (!likeTarget) return { outcome: 'unknown', status: 'check-unknown', message: '站点页面没有明确的互动目标' }
      if (entry.mode === 'like') {
        if (likeTarget.liked === entry.desired) return { outcome: 'success', status: 'checked-success', message: entry.desired ? '已确认目标处于点赞状态' : '已确认目标未点赞' }
        if (likeTarget.liked === true || likeTarget.liked === false) return { outcome: 'failure', status: 'checked-failure', message: '重新读取的点赞状态与预期不符' }
        return { outcome: 'unknown', status: 'check-unknown', message: '站点页面没有明确的点赞状态' }
      }
      const currentCoined = Number(likeTarget.coined)
      const baseline = Number(entry.baselineCoined)
      const coin = Number(entry.coin)
      if (Number.isSafeInteger(currentCoined) && Number.isSafeInteger(baseline) && Number.isSafeInteger(coin) && currentCoined >= baseline + coin) {
        return { outcome: 'success', status: 'checked-success', message: `已确认目标累计投币增加至少 ${coin}` }
      }
      if (Number.isSafeInteger(currentCoined) && Number.isSafeInteger(baseline) && currentCoined < baseline + coin) {
        return { outcome: 'failure', status: 'checked-failure', message: '重新读取的累计投币数尚未达到预期' }
      }
      return { outcome: 'unknown', status: 'check-unknown', message: '站点页面没有可比较的累计投币数' }
    }

    async function checkReceipt(entry) {
      try {
        if (entry?.type === 'reply') return await checkReplyReceipt(entry)
        if (entry?.type === 'reaction') return await checkReactionReceipt(entry)
        if (entry?.type === 'checkin') {
          const doc = await api.net.doc('/daily_checkin', topicReadOptions())
          const text = String(doc.body?.textContent || '')
          if (/已签到|今日已签/.test(text)) return { outcome: 'success', status: 'checked-success', message: '已确认今天已经签到' }
          const form = [...(doc.querySelectorAll('form[action]') || [])].find((item) => {
            try { return new URL(item.getAttribute('action') || '', location.href).origin === location.origin && new URL(item.getAttribute('action') || '', location.href).pathname === '/daily_checkin' && String(item.method || '').toLowerCase() === 'post' } catch { return false }
          })
          if (form) return { outcome: 'failure', status: 'checked-failure', message: '重新读取后显示今天尚未签到' }
          return { outcome: 'unknown', status: 'check-unknown', message: '无法从签到页确认状态' }
        }
        if (entry?.type === 'topic') return { outcome: 'unknown', status: 'check-unknown', message: '新主题缺少可安全确认的站点证据' }
      } catch {
        return { outcome: 'unknown', status: 'check-failed', message: '读取站点结果失败，请稍后从页面手动核对' }
      }
      return { outcome: 'unknown', status: 'check-unknown', message: '检查凭据类型不受支持' }
    }

    function one(form, selector) {
      const matches = form?.querySelectorAll(selector) || []
      return matches.length === 1 ? matches[0] : null
    }

    function formActionMatches(form, expectedPath) {
      if (!form?.isConnected || String(form.method || '').toLowerCase() !== 'post') return false
      if (form.target && form.target.toLowerCase() !== '_self') return false
      try {
        const action = new URL(form.getAttribute('action') || location.href, location.href)
        return action.origin === location.origin && action.pathname === expectedPath && !action.search && !action.hash
      } catch {
        return false
      }
    }

    function csrfFor(form) {
      const csrf = one(form, 'input[type="hidden"][name="_csrf"]')
      const value = String(csrf?.value || '').trim()
      return value && value.length <= 512 && !/[\u0000-\u001f\u007f]/.test(value) ? { field: csrf, value } : null
    }

    function replyFormForDocument(doc, expectedTopicId) {
      const forms = [...(doc?.querySelectorAll?.('form.ajax-reply-form') || [])]
        .filter((form) => formActionMatches(form, REPLY_PATH))
      if (forms.length !== 1) return null
      const form = forms[0]
      const csrf = csrfFor(form)
      const topic = one(form, 'input[type="hidden"][name="topic_id"]')
      const body = one(form, 'textarea[name="body"]')
      if (!csrf || !topic || String(topic.value) !== String(expectedTopicId) || !body || body.disabled) return null
      return { form, csrf: csrf.value, targetId: Number(expectedTopicId), body }
    }

    function replyTarget(context = {}) {
      const routeId = Number(context.route?.id)
      const pathMatch = location.pathname.match(/^\/topic\/(\d+)\/?$/)
      const pageId = Number(api.page.id)
      if (context.route?.type !== 'topic' || api.page.type !== 'topic' || !pathMatch ||
        !Number.isSafeInteger(routeId) || routeId < 1 || routeId !== Number(pathMatch[1]) || pageId !== routeId) return null
      return replyFormForDocument(document, routeId)
    }

    function topicTarget(context = {}) {
      if (context.route?.type !== 'topic_edit' || api.page.type !== 'topic_edit' ||
        !/^\/topic_edit\/?$/.test(location.pathname)) return null
      const forms = [...document.querySelectorAll('form')].filter((form) => formActionMatches(form, TOPIC_PATH))
      if (forms.length !== 1) return null
      const form = forms[0]
      const csrf = csrfFor(form)
      const forum = one(form, 'input[type="hidden"][name="forum_id"]')
      const title = one(form, 'input[name="title"]:not([type="hidden"])')
      const body = one(form, 'textarea[name="body"]')
      const forumId = Number(forum?.value)
      if (!csrf || !forum || !Number.isSafeInteger(forumId) || forumId < 1 || !title || title.disabled || !body || body.disabled) return null
      return { form, csrf: csrf.value, targetId: forumId, title, body }
    }

    function nonEmpty(value) {
      return typeof value === 'string' && value.trim().length > 0
    }

    function customError(code, message, path = 'args') {
      return { code, message, path }
    }

    async function confirmWrite({ title, target, content }) {
      return api.ui.confirm(`即将${title}\n目标：${target}\n\n拟提交内容：\n${content}\n\n确认提交？`, { title: '确认站点写入' })
    }

    function writeResult(result, { success, failure, unknown, extra = {}, receipt = null, trace = null } = {}) {
      const outcome = String(result?.outcome || '')
      if (outcome === 'success') {
        finishWriteTrace(trace, 'success')
        if (receipt?.token) receipts.delete(receipt.token)
        return {
          ...extra,
          kind: 'completed',
          label: result.message ? `${success}：${result.message}` : success,
          status: Number(result.status) || 0,
          ...(result.redirect ? { redirect: result.redirect } : {}),
        }
      }
      if (outcome === 'failure') {
        finishWriteTrace(trace, 'failure')
        if (receipt?.token) receipts.delete(receipt.token)
        return {
          ...extra,
          kind: 'failed',
          label: result.message ? `${failure}：${result.message}` : failure,
          status: Number(result.status) || 0,
        }
      }
      finishWriteTrace(trace, 'unknown')
      return {
        ...extra,
        kind: 'unknown',
        label: unknown,
        status: Number(result?.status) || 0,
        ...(receipt ? { receipt } : {}),
      }
    }

    async function writeReply(args, context) {
      const trace = beginWriteTrace(context)
      const initial = replyTarget(context)
      if (!initial) throw new Error('当前帖子回复表单校验失败，已停止提交')
      const accepted = await confirmWrite({
        title: '回复当前帖子',
        target: `帖子 #${initial.targetId}`,
        content: args.body,
      })
      if (!accepted) {
        finishWriteTrace(trace, 'cancelled')
        return { kind: 'cancelled', label: '已取消回复' }
      }
      const current = replyTarget(context)
      if (!current || current.form !== initial.form || current.targetId !== initial.targetId || current.csrf !== initial.csrf) {
        throw new Error('确认期间帖子或表单已变化，已停止提交')
      }
      const receipt = replyReceipt({ flowId: trace.flowId, topicId: current.targetId, page: Number(api.page.page) || 1, body: args.body, doc: document })
      try {
        const result = await api.actions.reply(current.targetId, args.body, { _csrf: current.csrf })
        return writeResult(result, {
          success: `已回复主题 #${current.targetId}`,
          failure: '回复失败',
          unknown: '回复请求结果未知；请检查站点状态后再决定是否重新操作',
          extra: { topicId: current.targetId },
          receipt,
          trace,
        })
      } catch {
        finishWriteTrace(trace, 'unknown')
        return { kind: 'unknown', label: '回复请求结果未知；请检查站点状态后再决定是否重新操作', topicId: current.targetId, receipt }
      }
    }

    function selectedReplyTargets(context = {}) {
      return Array.isArray(context.replyTargets) ? context.replyTargets : []
    }

    function findSelectedReplyTarget(context, targetKey) {
      return selectedReplyTargets(context).find((target) => String(target.targetKey || '') === String(targetKey || '')) || null
    }

    function replyTargetKeySchema() {
      return {
        type: 'enum',
        values: (context) => selectedReplyTargets(context).map((target) => String(target.targetKey || '')).filter(Boolean),
      }
    }

    function replyEvidenceHash(topic, post = null) {
      const source = post
        ? `${post.postId}|${post.floor}|${post.authorName || '?'}|${post.content || ''}`
        : `${topic.id}|${topic.title || ''}|${(topic.posts || []).map((row) => `${row.postId}|${row.floor}|${row.authorName || '?'}|${row.content || ''}`).join('\n')}`
      let hash = 2166136261
      for (const ch of source) {
        hash ^= ch.charCodeAt(0)
        hash = Math.imul(hash, 16777619)
      }
      return (hash >>> 0).toString(36)
    }

    async function assertActionScopeCurrent(context) {
      const nonce = String(context?.reactionScopeNonce || '')
      if (!nonce) throw new Error('回复目标会话引用缺失，请重新选择目标')
      let current = false
      try {
        current = await api.request(ACTION_SCOPE_RPC, { nonce }) === true
      } catch {
        current = false
      }
      if (!current) throw new Error('回复目标选择已失效或过期，请重新生成计划')
    }

    async function readSelectedReplyTarget(target) {
      const topicId = Number(target?.topicId)
      const page = Number(target?.page)
      const postId = target?.type === 'reply' ? Number(target.postId) : 0
      const floor = target?.type === 'reply' ? Number(target.floor) : 0
      if (!Number.isSafeInteger(topicId) || topicId <= 0 || !Number.isSafeInteger(page) || page < 1 ||
        !['topic', 'reply'].includes(target?.type) || (target.type === 'reply' &&
          (!Number.isSafeInteger(postId) || postId <= 0 || !Number.isSafeInteger(floor) || floor <= 0)) ||
        !/^[a-z0-9]+$/.test(String(target?.evidenceHash || ''))) {
        throw new Error('已选回复目标标识无效')
      }
      let doc
      if (api.page.type === 'topic' && Number(api.page.id) === topicId && Number(api.page.page || 1) === page &&
        location.pathname === `/topic/${topicId}`) {
        doc = document
      } else {
        doc = await api.net.doc(api.routes.topic(topicId, page))
      }
      const topic = api.parse.topic(doc)
      if (!topic || Number(topic.id) !== topicId || Number(topic.currentPage) !== page) {
        throw new Error('重新读取的主题或页码与所选回复目标不匹配')
      }
      const form = replyFormForDocument(doc, topicId)
      if (!form) throw new Error('目标主题没有通过验证的本站回复表单')
      let post = null
      if (target.type === 'reply') {
        post = (Array.isArray(topic.posts) ? topic.posts : []).find((row) => Number(row.postId) === postId) || null
        if (!post || Number(post.floor) !== floor) throw new Error('所选回帖或楼层已变化')
      }
      if (replyEvidenceHash(topic, post) !== String(target.evidenceHash)) {
        throw new Error('所选主题或回帖正文已变化，请重新读取后生成回复')
      }
      return {
        ...form,
        topicId,
        page,
        type: target.type,
        floor: post ? Number(post.floor) : 0,
        authorName: post ? String(post.authorName || '?').slice(0, 100) : '',
        title: String(topic.title || target.title || `主题 #${topicId}`).slice(0, 240),
      }
    }

    async function writeSelectedReply(args, context) {
      const trace = beginWriteTrace(context)
      await assertActionScopeCurrent(context)
      const planned = findSelectedReplyTarget(context, args.targetKey)
      if (!planned) throw new Error('已选回复目标已失效，请重新生成计划并选择目标')
      const initial = await readSelectedReplyTarget(planned)
      const targetLabel = `主题 #${initial.topicId}：${initial.title}` +
        (initial.floor ? `\n参考回帖 #${initial.floor} · ${initial.authorName}` : '') +
        '\n楼层只用于回复草稿上下文；站点协议会把回复发到所属主题。'
      const accepted = await confirmWrite({ title: '回复已选目标', target: targetLabel, content: args.body })
      if (!accepted) {
        finishWriteTrace(trace, 'cancelled')
        return { kind: 'cancelled', label: '已取消回复' }
      }

      await assertActionScopeCurrent(context)
      const current = await readSelectedReplyTarget(planned)
      if (current.targetId !== initial.targetId || current.topicId !== initial.topicId || current.type !== initial.type ||
        current.floor !== initial.floor || current.title !== initial.title) {
        throw new Error('确认期间回复目标或表单已变化，已停止提交')
      }
      await assertActionScopeCurrent(context)
      const receipt = replyReceipt({ flowId: trace.flowId, topicId: current.topicId, page: current.page, body: args.body, doc: current.form.ownerDocument })
      try {
        const result = await api.actions.reply(current.topicId, args.body, { _csrf: current.csrf })
        return writeResult(result, {
          success: `已回复主题 #${current.topicId}`,
          failure: '回复失败',
          unknown: '回复请求结果未知；请检查站点状态后再决定是否重新操作',
          extra: { topicId: current.topicId, floor: current.floor },
          receipt,
          trace,
        })
      } catch {
        // The POST may have reached the site before its response was lost.
      }
      finishWriteTrace(trace, 'unknown')
      return { kind: 'unknown', label: '回复请求结果未知；请检查站点状态后再决定是否重新操作', topicId: current.topicId, floor: current.floor, receipt }
    }


    async function writeTopic(args, context) {
      const trace = beginWriteTrace(context)
      const initial = topicTarget(context)
      if (!initial) throw new Error('新主题表单校验失败，已停止提交')
      const accepted = await confirmWrite({
        title: '发布新主题',
        target: `版块 #${initial.targetId}`,
        content: `标题：${args.title}\n\n${args.body}`,
      })
      if (!accepted) {
        finishWriteTrace(trace, 'cancelled')
        return { kind: 'cancelled', label: '已取消发帖' }
      }
      const current = topicTarget(context)
      if (!current || current.form !== initial.form || current.targetId !== initial.targetId || current.csrf !== initial.csrf) {
        throw new Error('确认期间发帖目标或表单已变化，已停止提交')
      }
      const receipt = rememberReceipt({
        type: 'topic',
        flowId: trace.flowId,
        forumId: Number(current.targetId),
        titleHash: shortHash(args.title),
        bodyHash: shortHash(args.body),
      })
      try {
        const result = await api.actions.topic(current.targetId, args.title, args.body, { _csrf: current.csrf })
        return writeResult(result, {
          success: '新主题已发布',
          failure: '发帖失败',
          unknown: '发帖请求结果未知；请检查站点状态后再决定是否重新操作',
          extra: { forumId: current.targetId },
          receipt,
          trace,
        })
      } catch {
        finishWriteTrace(trace, 'unknown')
        return { kind: 'unknown', label: '发帖请求结果未知；请检查站点状态后再决定是否重新操作', forumId: current.targetId, receipt }
      }
    }

    function reactionTargets(context = {}) {
      return Array.isArray(context.reactionTargets) ? context.reactionTargets : []
    }

    function findReactionTarget(context, targetKey) {
      return reactionTargets(context).find((target) => target.targetKey === targetKey) || null
    }

    function targetTitle(target) {
      const title = String(target?.title || `主题 #${target?.topicId || '?'}`).slice(0, 160)
      return target?.type === 'reply' ? `${title} · 回帖 #${target.floor}` : title
    }

    function targetHasLike(target) {
      return Boolean(target && ['topic', 'reply'].includes(target.type) && target.liked !== null && target.liked !== undefined)
    }

    function targetHasFavorite(target) {
      return Boolean(target?.type === 'topic' && typeof target.favorited === 'boolean')
    }

    function targetHasCoin(target) {
      return Boolean(target && ['topic', 'reply'].includes(target.type) && Array.isArray(target.tiers) && target.tiers.some((coin) => Number.isSafeInteger(Number(coin)) && Number(coin) > 0))
    }

    async function assertReactionScopeCurrent(context) {
      const nonce = String(context?.reactionScopeNonce || '')
      if (!nonce) throw new Error('互动目标会话引用缺失，请重新生成计划并选择目标')
      let current = false
      try {
        current = await api.request(REACTION_SCOPE_RPC, { nonce }) === true
      } catch {
        current = false
      }
      if (!current) throw new Error('互动目标选择已失效或过期，请重新生成计划')
    }

    function oneValue(root, selector) {
      const matches = root?.querySelectorAll(selector) || []
      return matches.length === 1 ? matches[0] : null
    }

    function favoriteFormFor(doc, topicId) {
      const forms = [...doc.querySelectorAll('form.topic-favorites-action')]
        .filter((form) => formActionMatches(form, '/topic_favorite'))
      if (forms.length !== 1) return null
      const form = forms[0]
      const topic = oneValue(form, 'input[type="hidden"][name="topic_id"]')
      if (!topic || String(topic.value) !== String(topicId)) return null
      return form
    }

    async function readReactionTarget(target, context) {
      const topicId = Number(target?.topicId)
      const page = Number(target?.page)
      const expectedPostId = target?.type === 'reply' ? Number(target.postId) : null
      if (!Number.isSafeInteger(topicId) || topicId <= 0 || !Number.isSafeInteger(page) || page < 1 ||
        (target?.type === 'reply' && (!Number.isSafeInteger(expectedPostId) || expectedPostId <= 0))) {
        throw new Error('互动目标标识无效')
      }
      let doc
      if (api.page.type === 'topic' && Number(api.page.id) === topicId && Number(api.page.page || 1) === page) doc = document
      else doc = await api.net.doc(api.routes.topic(topicId, page))
      const topic = api.parse.topic(doc)
      if (!topic || Number(topic.id) !== topicId || Number(topic.currentPage) !== page) throw new Error('重新读取的主题或页码与目标不匹配')

      let post = null
      if (target.type === 'reply') {
        post = (Array.isArray(topic.posts) ? topic.posts : []).find((row) => Number(row.postId) === expectedPostId)
        if (!post) throw new Error('目标回帖已不在重新读取的主题页中')
        if (Number(post.floor) !== Number(target.floor)) throw new Error('目标回帖楼层已变化')
      } else if (target.type !== 'topic') {
        throw new Error('互动目标类型无效')
      }

      const likeTarget = (api.parse.likeTargets(doc) || []).find((row) =>
        row.type === target.type && Number(row.id) === (target.type === 'topic' ? topicId : expectedPostId))
      const favoriteState = target.type === 'topic' && favoriteFormFor(doc, topicId)
        ? api.parse.topicFavoriteState(doc)
        : null
      return {
        targetKey: target.targetKey,
        type: target.type,
        topicId,
        postId: expectedPostId,
        page,
        floor: target.type === 'reply' ? Number(post.floor) : 0,
        title: String(topic.title || target.title || '').slice(0, 160),
        liked: likeTarget?.liked === true || likeTarget?.liked === false ? likeTarget.liked : null,
        coined: Number.isSafeInteger(Number(likeTarget?.coined)) ? Number(likeTarget.coined) : null,
        favorited: favoriteState === true || favoriteState === false ? favoriteState : null,
        tiers: [...new Set((likeTarget?.tiers || []).map(Number).filter((coin) => Number.isSafeInteger(coin) && coin > 0))],
      }
    }

    function reactionSnapshotMatches(planned, current) {
      if (!planned || !current || planned.type !== current.type || planned.topicId !== current.topicId ||
        planned.postId !== current.postId || planned.page !== current.page || planned.floor !== current.floor) return false
      if (planned.liked !== null && planned.liked !== undefined && planned.liked !== current.liked) return false
      if (planned.favorited !== null && planned.favorited !== undefined && planned.favorited !== current.favorited) return false
      if (!Array.isArray(planned.tiers) || !Array.isArray(current.tiers)) return false
      const normalizeTiers = (tiers) => [...new Set(tiers.map(Number).filter((coin) => Number.isSafeInteger(coin) && coin > 0))].sort((a, b) => a - b)
      const plannedTiers = normalizeTiers(planned.tiers)
      const currentTiers = normalizeTiers(current.tiers)
      return plannedTiers.length === currentTiers.length && plannedTiers.every((coin, index) => coin === currentTiers[index])
    }

    function reactionStateText(target) {
      return [
        target.liked == null ? '点赞状态未知' : target.liked ? '已点赞' : '未点赞',
        target.favorited == null ? '' : target.favorited ? '已收藏' : '未收藏',
        target.tiers.length ? `可投币档位：${target.tiers.join('、')}` : '',
      ].filter(Boolean).join('；')
    }

    async function runReactionWrite({ targetKey, mode, desired, coin } = {}, context = {}) {
      const trace = beginWriteTrace(context)
      await assertReactionScopeCurrent(context)
      const target = findReactionTarget(context, targetKey)
      if (!target) throw new Error('互动目标已失效，请重新生成计划并选择目标')
      if (mode === 'favorite' && !targetHasFavorite(target)) throw new Error('目标没有可验证的收藏状态')
      if (mode === 'like' && !targetHasLike(target)) throw new Error('目标没有可验证的点赞状态')
      if (mode === 'coin' && !targetHasCoin(target)) throw new Error('目标没有站点提供的有效投币档位')

      const initial = await readReactionTarget(target, context)
      if (!reactionSnapshotMatches(target, initial)) throw new Error('目标状态、档位或楼层已变化；请重新生成确认卡')
      if (mode === 'favorite' && initial.favorited === desired) {
        finishWriteTrace(trace, 'success')
        return { kind: 'completed', label: desired ? '目标已收藏，无需重复切换' : '目标已取消收藏，无需重复切换' }
      }
      if (mode === 'like' && initial.liked === desired) {
        finishWriteTrace(trace, 'success')
        return { kind: 'completed', label: desired ? '目标已点赞，无需重复切换' : '目标已取消点赞，无需重复切换' }
      }
      if (mode === 'coin' && (!Number.isSafeInteger(Number(coin)) || !initial.tiers.includes(Number(coin)))) throw new Error('请从目标页面显示的投币档位中选择金额')
      if (!api.snapshot?.csrf) throw new Error('当前页面没有有效的 _csrf，已停止操作')

      const actionLabel = mode === 'favorite' ? (desired ? '收藏' : '取消收藏') : mode === 'like' ? (desired ? '点赞' : '取消点赞') : `投币 ${Number(coin)}`
      const targetLabel = `${target.type === 'topic' ? '主题' : '回帖'}：${targetTitle(target)}`
      const expectedState = mode === 'favorite' ? (desired ? '已收藏' : '未收藏') : mode === 'like' ? (desired ? '已点赞' : '未点赞') : `将投币 ${Number(coin)}`
      const accepted = await api.ui.confirm(
        `即将${actionLabel}\n目标：${targetLabel}\n当前状态：${reactionStateText(initial)}\n执行后：${expectedState}${mode === 'coin' ? `\n站点档位：${initial.tiers.join('、')}` : ''}\n\n确认执行？`,
        { title: '确认站内互动' },
      )
      if (!accepted) {
        finishWriteTrace(trace, 'cancelled')
        return { kind: 'cancelled', label: `已取消${actionLabel}` }
      }

      await assertReactionScopeCurrent(context)
      const current = await readReactionTarget(target, context)
      if (!reactionSnapshotMatches(initial, current)) throw new Error('确认期间目标、状态或投币档位已变化，未发送请求')
      if (mode === 'favorite' && current.favorited === desired) throw new Error('确认期间目标已达到预期收藏状态，未发送切换请求')
      if (mode === 'like' && current.liked === desired) throw new Error('确认期间目标已达到预期点赞状态，未发送切换请求')
      if (mode === 'coin' && !current.tiers.includes(Number(coin))) throw new Error('确认期间站点投币档位已变化，未发送请求')

      await assertReactionScopeCurrent(context)
      const receipt = rememberReceipt({
        type: 'reaction',
        flowId: trace.flowId,
        mode,
        topicId: current.topicId,
        page: current.page,
        targetType: current.type,
        targetId: current.type === 'topic' ? current.topicId : current.postId,
        floor: current.floor,
        desired: mode === 'coin' ? null : Boolean(desired),
        coin: mode === 'coin' ? Number(coin) : 0,
        baselineCoined: Number.isSafeInteger(Number(current.coined)) ? Number(current.coined) : null,
      })

      try {
        const result = mode === 'favorite'
          ? await api.actions.toggleFavorite(current.topicId)
          : await api.actions.likeCoin({
              type: current.type,
              id: current.type === 'topic' ? current.topicId : current.postId,
              coin: mode === 'coin' ? Number(coin) : 0,
            })
        if (result?.outcome === 'success') {
          finishWriteTrace(trace, 'success')
          receipts.delete(receipt.token)
          return { kind: 'completed', label: result.message ? `${actionLabel}成功：${result.message}` : `已${actionLabel}`, status: result.status }
        }
        if (result?.outcome === 'failure') {
          finishWriteTrace(trace, 'failure')
          receipts.delete(receipt.token)
          return { kind: 'failed', label: result.message ? `${actionLabel}失败：${result.message}` : `${actionLabel}失败`, status: result.status }
        }
      } catch {
        // A request may have reached the server before the response was lost.
      }
      finishWriteTrace(trace, 'unknown')
      return { kind: 'unknown', label: `${actionLabel}请求结果未知；请检查站点状态后再决定是否重新操作`, receipt }
    }

    function reactionTargetKeySchema(predicate) {
      return {
        type: 'enum',
        values: (context) => reactionTargets(context).filter(predicate).map((target) => String(target.targetKey || '')).filter(Boolean),
      }
    }

    api.ai.registerAction({
      id: 'site.write-favorite-state',
      version: 1,
      order: 43,
      label: '收藏/取消收藏主题',
      description: '对本地验证的主题收藏状态执行一次切换，并在提交前再次确认状态',
      permission: 'write',
      args: {
        targetKey: reactionTargetKeySchema(targetHasFavorite),
        favorited: { type: 'boolean' },
      },
      available: (context) => reactionTargets(context).some(targetHasFavorite),
      validateArgs: (args, context) => !targetHasFavorite(findReactionTarget(context, args.targetKey))
        ? customError('write.favorite-target', '请选择具有明确收藏状态的主题目标', 'args.targetKey')
        : null,
      preview: (args, context) => {
        const target = findReactionTarget(context, args.targetKey)
        return `${args.favorited ? '收藏' : '取消收藏'} ${targetTitle(target)}（当前：${target.favorited ? '已收藏' : '未收藏'}，提交前再次确认）`
      },
      execute: (args, context) => runReactionWrite({ ...args, desired: args.favorited, mode: 'favorite' }, context),
    })

    api.ai.registerAction({
      id: 'site.write-like-state',
      version: 1,
      order: 44,
      label: '点赞/取消点赞',
      description: '对本地验证的主题或回帖点赞状态执行一次切换，并在提交前再次确认状态',
      permission: 'write',
      args: {
        targetKey: reactionTargetKeySchema(targetHasLike),
        liked: { type: 'boolean' },
      },
      available: (context) => reactionTargets(context).some(targetHasLike),
      validateArgs: (args, context) => !targetHasLike(findReactionTarget(context, args.targetKey))
        ? customError('write.like-target', '请选择具有明确点赞状态的主题或回帖目标', 'args.targetKey')
        : null,
      preview: (args, context) => {
        const target = findReactionTarget(context, args.targetKey)
        return `${args.liked ? '点赞' : '取消点赞'} ${targetTitle(target)}（当前：${target.liked ? '已点赞' : '未点赞'}，提交前再次确认）`
      },
      execute: (args, context) => runReactionWrite({ ...args, desired: args.liked, mode: 'like' }, context),
    })

    api.ai.registerAction({
      id: 'site.write-coin',
      version: 1,
      order: 45,
      label: '投币',
      description: '对本地验证的主题或回帖使用站点允许的投币档位；金额必须由用户在确认卡选择',
      permission: 'write',
      args: {
        targetKey: reactionTargetKeySchema(targetHasCoin),
        coin: { type: 'number', optional: true, integer: true, min: 1, max: 100000 },
      },
      available: (context) => reactionTargets(context).some(targetHasCoin),
      validateArgs: (args, context) => {
        const target = findReactionTarget(context, args.targetKey)
        if (!targetHasCoin(target)) return customError('write.coin-target', '请选择具有站点有效投币档位的主题或回帖目标', 'args.targetKey')
        if (args.coin !== undefined && !target.tiers.includes(Number(args.coin))) return customError('write.coin-tier', '投币金额不在该目标的站点档位中', 'args.coin')
        return null
      },
      preview: (args, context) => {
        const target = findReactionTarget(context, args.targetKey)
        return `投币 ${targetTitle(target)}；请在确认卡选择档位（${target.tiers.join('、')}）`
      },
      execute: (args, context) => runReactionWrite({ ...args, mode: 'coin' }, context),
    })

    api.ai.registerAction({
      id: 'site.write-reply',
      version: 1,
      order: 40,
      label: '回复当前帖子',
      description: '在当前帖子原生回复表单填写正文；预览后需再次确认提交',
      permission: 'write',
      pages: ['topic'],
      args: { body: { type: 'string', minLength: 1, maxLength: 4000 } },
      available: (context) => Boolean(replyTarget(context)),
      validateArgs: (args, context) => !nonEmpty(args.body)
        ? customError('write.body-empty', '回复正文不能为空', 'args.body')
        : !replyTarget(context)
          ? customError('write.reply-form-invalid', '当前帖子回复表单校验失败', 'args.body')
          : null,
      preview: (args, context) => `回复帖子 #${context.route.id}（${Array.from(args.body).length} 字，提交前再次确认）`,
      execute: writeReply,
    })

    api.ai.registerAction({
      id: 'site.write-selected-reply',
      version: 1,
      order: 40.5,
      label: '回复已选主题或楼层',
      description: '依据用户明确选中的主题或回帖生成回复正文；楼层只作上下文，发送仍针对其所属主题，并需再次确认',
      permission: 'write',
      args: {
        targetKey: replyTargetKeySchema(),
        body: { type: 'string', minLength: 1, maxLength: 4000 },
      },
      available: (context) => selectedReplyTargets(context).length > 0,
      validateArgs: (args, context) => !findSelectedReplyTarget(context, args.targetKey)
        ? customError('write.reply-target', '请选择本次检索会话中的已验证回复目标', 'args.targetKey')
        : !nonEmpty(args.body)
          ? customError('write.body-empty', '回复正文不能为空', 'args.body')
          : !context?.reactionScopeNonce
            ? customError('write.reply-scope', '回复目标会话已失效，请重新选择目标', 'args.targetKey')
            : null,
      preview: (args, context) => {
        const target = findSelectedReplyTarget(context, args.targetKey)
        const reference = target?.type === 'reply' ? `；参考回帖 #${Number(target.floor)}` : ''
        return `回复主题「${String(target?.title || '已选主题').slice(0, 100)}」${reference}（站点将回复到主题，提交前再次确认）`
      },
      execute: writeSelectedReply,
    })

    api.ai.registerAction({
      id: 'site.write-topic',
      version: 1,
      order: 41,
      label: '发布新主题',
      description: '在本站新主题原生表单填写标题和正文；预览后需再次确认提交',
      permission: 'write',
      pages: ['topic_edit'],
      args: {
        title: { type: 'string', minLength: 1, maxLength: 160 },
        body: { type: 'string', minLength: 1, maxLength: 4000 },
      },
      available: (context) => Boolean(topicTarget(context)),
      validateArgs: (args, context) => !nonEmpty(args.title)
        ? customError('write.title-empty', '主题标题不能为空', 'args.title')
        : !nonEmpty(args.body)
          ? customError('write.body-empty', '主题正文不能为空', 'args.body')
          : !topicTarget(context)
            ? customError('write.topic-form-invalid', '新主题表单校验失败', 'args.title')
            : null,
      preview: (args, context) => `发布到版块 #${topicTarget(context)?.targetId}：${args.title}`,
      execute: writeTopic,
    })

    api.ai.registerAction({
      id: 'site.write-checkin',
      version: 1,
      order: 42,
      label: '今日签到',
      description: '通过签到日历的原生确认流程完成今日签到',
      permission: 'write',
      pages: ['checkin'],
      args: {},
      available: () => api.hasHandler(CHECKIN_RPC),
      preview: () => '提交今日签到（签到日历会再次向你确认）',
      execute: async (args, context) => {
        const trace = beginWriteTrace(context)
        const result = await api.request(CHECKIN_RPC)
        if (result === false) {
          finishWriteTrace(trace, 'cancelled')
          return { kind: 'cancelled', label: '已取消签到' }
        }
        if (result?.done === false && result.reason === 'already-signed') {
          finishWriteTrace(trace, 'success')
          return { kind: 'completed', label: '今日已经签到' }
        }
        if (result?.outcome === 'failure') {
          finishWriteTrace(trace, 'failure')
          return { kind: 'failed', label: result.message || '签到失败', status: result.status }
        }
        if (result?.outcome === 'unknown') {
          finishWriteTrace(trace, 'unknown')
          return {
            kind: 'unknown',
            label: '签到请求结果未知；请检查站点状态后再决定是否重新操作',
            status: result.status,
            receipt: rememberReceipt({ type: 'checkin', flowId: trace.flowId }),
          }
        }
        finishWriteTrace(trace, 'success')
        return { kind: 'completed', label: result === true || result?.outcome === 'success' ? '签到完成' : '签到结果已返回', status: Number(result?.status) || 0 }
      },
    })

    api.handle(RESULT_CHECK_RPC, async ({ receipt } = {}) => {
      const token = String(receipt?.token || '')
      if (!/^[a-z0-9-]{16,128}$/i.test(token)) return { outcome: 'unknown', status: 'receipt-invalid', message: '检查凭据无效或已失效' }
      const entry = receipts.get(token)
      if (!entry || Date.now() - entry.createdAt > RECEIPT_TTL) {
        receipts.delete(token)
        return { outcome: 'unknown', status: 'receipt-expired', message: '检查凭据已失效，请从当前结果重新发起操作' }
      }
      receipts.delete(token)
      const trace = beginCheckTrace(entry)
      const result = await checkReceipt(entry)
      finishCheckTrace(trace, result)
      return result
    })

    return {}
  }

  const w = typeof unsafeWindow !== 'undefined' ? unsafeWindow : window
  if (w.LSB && w.LSB.register) w.LSB.register(manifest, setup)
  else ;(w.LSB_PLUGINS = w.LSB_PLUGINS || []).push({ manifest, setup })
})()
