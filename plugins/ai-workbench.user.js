// ==UserScript==
// @name         LSB·AI 工作台
// @namespace    https://linux.sb/
// @version      0.8.1
// @description  氢壳右栏 AI 对话工作台：帖子副驾、追踪查询与需二次确认的站内操作。
// @author       you
// @match        https://linux.sb/*
// @grant        none
// @run-at       document-end
// @noframes
// ==/UserScript==
(function () {
  'use strict'

  const manifest = {
    id: 'ai-workbench',
    name: 'AI 工作台',
    version: '0.8.1',
    description: '氢壳右栏的 AI 对话工作台；写操作仅由独立动作插件提供并需二次确认',
    author: 'you',
    requires: {
      base: '^0.1.52',
      plugins: { 'ai-copilot': '^0.11.0', 'ai-actions': '^0.1.0' },
    },
    permissions: ['read', 'storage', 'ui', 'events'],
  }

  const ACTION_HISTORY_KEY = 'action-history'
  const ACTION_HISTORY_LIMIT = 20
  const REACTION_WRITE_ACTIONS = new Set(['site.write-favorite-state', 'site.write-like-state', 'site.write-coin'])
  const SELECTED_REPLY_WRITE_ACTION = 'site.write-selected-reply'
  const SCOPED_TARGET_WRITE_ACTIONS = new Set([...REACTION_WRITE_ACTIONS, SELECTED_REPLY_WRITE_ACTION])
  const CONVERSATION_HISTORY_KEY = 'conversations'
  const CONVERSATION_LIMIT = 20
  const CONVERSATION_TURN_LIMIT = 10
  const CONVERSATION_MAX_BYTES = 1024 * 1024
  const CONVERSATION_CONTEXT_CHARS = 3000
  const CONVERSATION_SUMMARY_MAX_CHARS = 1600
  const CONVERSATION_COMPACTION_LIMIT = 3
  const CONVERSATION_COMPACTION_BYTES = 16 * 1024
  const INPUT_MAX_CHARS = 500
  const ANSWER_MAX_CHARS = 4000
  const EVIDENCE_SNAPSHOT_VERSION = 1
  const FRESHNESS_STATES = new Set(['fresh', 'material-stale', 'citation-stale', 'unverifiable', 'legacy'])
  const CITATION_REVIEW_STATES = new Set(['unchanged', 'changed', 'removed', 'unverifiable'])
  const REVISION_REASONS = new Set(['material-changed', 'manual-regenerate'])
  const PHASE_LIMIT = 6
  const PHASE_MAX_CHARS = 200
  const TRACE_LIMIT = 6
  const TRACE_STAGES = new Set(['plan', 'scope', 'read', 'validate', 'answer', 'execute', 'check', 'limit'])
  const TRACE_STATES = new Set(['pending', 'active', 'complete', 'failed', 'unknown', 'skipped'])
  const TRACE_EVIDENCE = new Set(['verified', 'partial', 'unverified'])
  const TRACE_STAGE_MAP = Object.freeze({
    understand: 'scope',
    context: 'scope',
    plan: 'plan',
    local: 'read',
    evidence: 'validate',
    answer: 'answer',
    action: 'execute',
  })
  const TRACE_STATE_MAP = Object.freeze({ cancelled: 'skipped' })
  const CAPABILITIES = new Set(['ask', 'topic-ask', 'disagreement', 'comparison', 'unresolved', 'new-replies', 'draft', 'tracking', 'site-action', 'research'])
  const CAPABILITY_LABELS = Object.freeze({
    ask: '普通问答',
    'topic-ask': '帖子问答',
    disagreement: '观点分歧',
    comparison: '方案对比',
    unresolved: '未解决问题',
    'new-replies': '新回复摘要',
    draft: '回复草稿',
    tracking: '追踪查询',
    'site-action': '站内操作',
    research: '跨主题检索',
  })
  const RESEARCH_SOURCES = new Set(['auto', 'site-search', 'my-topics', 'my-favorites', 'my-replies'])
  const RESEARCH_FIELDS = new Set(['title', 'body', 'reply'])
  const CONTEXT_KINDS = new Set(['current-page', 'current-topic', 'active-tracking'])
  const ROUTE_TYPES = new Set(['home', 'forum', 'topic', 'user', 'search', 'notifications', 'favorites', 'unknown'])
  const PHASE_IDS = new Set(['understand', 'context', 'plan', 'local', 'answer', 'evidence', 'action'])
  const PHASE_STATES = new Set(['active', 'complete', 'failed', 'cancelled'])
  const ROUTE_SORTS = new Set(['post', 'comment', 'lucky', 'card', 'red_packet'])
  const ROUTE_TABS = new Set(['topics', 'replies', 'attachments', 'notifications', 'points_rewards', 'favorites', 'mine', 'followed'])

  // ═══════════════════════════════════════════════════════════
  // 章节索引（3851 行，挂载位置在 skin 的 AI 卡；依赖 ai-copilot 的检索/引用）：
  //   A: 欢迎态与消息流 — Gemini 风格欢迎 / composer / 统一消息流
  //   B: 候选与引用 UI — researchCandidates / citation 复核渲染
  //   C: 站内动作计划 — 受限动作目录 / 写操作确认 / 结果检查
  //   D: 连续历史与追踪查询（M12/M13/M14 侧）
  // 拆分建议：与 ai-copilot 同步，按 A–D 提 plugins/ai-workbench/*.js。
  // ═══════════════════════════════════════════════════════════
  function setup(api) {
    const copilot = api.plugin('ai-copilot')
    let disposed = false
    let generation = 0
    let mounted = null
    let actionSession = { record: null, history: loadActionHistory(), records: new Map() }
    let conversationHistory = { version: 1, activeId: '', conversations: [] }
    let conversationSequence = 0
    const researchViews = new Map()
    const answerDrafts = new Map()
    const liveResearchQuestions = new Map()
    const traceFlows = new Map()

    function detectChatIntent(question, options = {}) {
      const text = String(question || '').normalize('NFKC').replace(/\s+/g, ' ').trim()
      const lower = text.toLocaleLowerCase('zh-CN')
      const route = options.route && typeof options.route === 'object' ? options.route : {}
      const materialMode = options.materialMode === 'detached' ? 'detached' : 'attached'
      const hasTopic = options.hasTopic === true || route.type === 'topic'
      const hasTracking = options.hasTracking === true
      const available = options.capabilities == null
        ? CAPABILITIES
        : new Set(Array.isArray(options.capabilities) || options.capabilities instanceof Set
          ? [...options.capabilities].map((item) => String(item))
          : [])
      const canUse = (capability) => available.has(capability)
      const result = (capability, confidence, reason) => ({ capability, confidence, source: 'local', reason })
      const fallback = () => result('ask', 'low', 'fallback')
      const needsMaterial = new Set(['topic-ask', 'disagreement', 'comparison', 'unresolved', 'new-replies', 'draft', 'tracking'])

      if (!text) return fallback()
      const asksForResearch = /(?:搜索|查找|检索|相关主题|跨主题|找一下|搜一下)/.test(lower)
      if (!asksForResearch && /(?:回复|发帖|发布|签到|点赞|收藏|投币|编辑|删除|关注|取消关注)/.test(lower)) {
        if (!hasTopic || !canUse('site-action')) return fallback()
        return result('site-action', 'high', 'explicit-action')
      }
      let candidate = null
      let reason = 'fallback'
      let confidence = 'medium'
      if (/(搜索|查找|检索|相关主题|跨主题|找一下|搜一下)/.test(lower)) {
        candidate = 'research'
        reason = 'research'
        confidence = 'high'
      } else if (/(追踪|新证据|状态汇总|状态变化|最近变化)/.test(lower)) {
        candidate = 'tracking'
        reason = 'tracking'
        confidence = 'high'
      } else if (/(未解决|悬而未决|没有结论)/.test(lower)) {
        candidate = 'unresolved'
        reason = 'topic-analysis'
      } else if (/(分歧|争议|不同观点|冲突)/.test(lower)) {
        candidate = 'disagreement'
        reason = 'topic-analysis'
        confidence = 'high'
      } else if (/(比较|对比|方案|优劣|哪个好)/.test(lower)) {
        candidate = 'comparison'
        reason = 'topic-analysis'
        confidence = 'high'
      } else if (/(新回复|回复摘要|有哪些回复)/.test(lower)) {
        candidate = 'new-replies'
        reason = 'topic-analysis'
      } else if (/(草稿|帮我写回复|拟一段回复)/.test(lower)) {
        candidate = 'draft'
        reason = 'topic-analysis'
      } else if (/(帖子|楼层|这篇|当前主题|正文|作者)/.test(lower)) {
        candidate = 'topic-ask'
        reason = 'topic-analysis'
      }
      if (!candidate) return result('ask', 'low', 'fallback')
      if (materialMode === 'detached' && needsMaterial.has(candidate)) return fallback()
      if (candidate === 'tracking' && !hasTracking) return fallback()
      if (['topic-ask', 'disagreement', 'comparison', 'unresolved', 'new-replies', 'draft'].includes(candidate) && !hasTopic) return fallback()
      if (!canUse(candidate)) return fallback()
      return result(candidate, confidence, reason)
    }

    const safeHref = (value) => {
      const href = String(value || '').trim()
      return /^https?:\/\//i.test(href) || /^\/(?!\/)/.test(href) ? href : ''
    }

    function clipText(value, limit) {
      const chars = Array.from(String(value ?? ''))
      return { text: chars.slice(0, limit).join(''), truncated: chars.length > limit }
    }

    function hashText(value) {
      let hash = 2166136261
      for (const char of String(value ?? '')) {
        hash ^= char.codePointAt(0)
        hash = Math.imul(hash, 16777619)
      }
      return `m13-${(hash >>> 0).toString(16).padStart(8, '0')}`
    }

    function safeHistoryText(value, limit) {
      const original = String(value ?? '')
      const sanitized = original
        .replace(/(https?:\/\/[^\s?#]+|\/[A-Za-z0-9._~!$&'()*+,;=%@:-]+(?:\/[A-Za-z0-9._~!$&'()*+,;=%@:-]+)*)\?[^\s#]*/gi, '$1')
        .replace(/\b(api[_ -]?key|x[_-]?csrf[_-]?token|_?csrf|cookie|authorization)\s*[:=]\s*[^\s,;]+/gi, '$1=[已隐藏]')
        .replace(/\bBearer\s+[A-Za-z0-9._~+/=-]+/gi, 'Bearer [已隐藏]')
      const clipped = clipText(sanitized, limit)
      return { text: clipped.text, truncated: clipped.truncated }
    }

    function safeResearchHistoryText(value, limit) {
      const withoutUrls = String(value ?? '').replace(/https?:\/\/[^\s<>"'`]+/gi, '[链接已隐藏]')
      return safeHistoryText(withoutUrls, limit)
    }

    function normalizedConversationScope(raw) {
      const source = raw && typeof raw === 'object' ? raw : {}
      return {
        kind: CONTEXT_KINDS.has(String(source.kind || '')) ? String(source.kind) : 'current-page',
        routeType: ROUTE_TYPES.has(String(source.routeType || '')) ? String(source.routeType) : 'unknown',
        topicId: Number.isInteger(Number(source.topicId)) && Number(source.topicId) > 0 ? Number(source.topicId) : 0,
        routeScope: source.routeScope ? cleanStoredRouteFingerprint(source.routeScope) : '',
        materialMode: source.materialMode === 'detached' ? 'detached' : 'attached',
      }
    }

    function normalizedCompaction(raw) {
      if (!raw || typeof raw !== 'object' || Number(raw.version) !== 1 || !raw.text) return null
      const text = safeHistoryText(raw.text, CONVERSATION_SUMMARY_MAX_CHARS).text
      if (!text) return null
      const sourceFingerprint = String(raw.sourceFingerprint || '').replace(/[^a-z0-9_-]/gi, '').slice(0, 120)
      if (!sourceFingerprint) return null
      const sourceTurnIds = Array.isArray(raw.sourceTurnIds)
        ? raw.sourceTurnIds.map((id) => String(id).replace(/[^a-z0-9_-]/gi, '').slice(0, 80)).filter(Boolean).slice(-CONVERSATION_TURN_LIMIT * 2)
        : []
      const updatedAt = Number.isFinite(Number(raw.updatedAt)) && Number(raw.updatedAt) > 0 ? Number(raw.updatedAt) : Date.now()
      return { version: 1, scope: normalizedConversationScope(raw.scope), sourceFingerprint, text, sourceTurnIds, updatedAt }
    }

    function normalizedPhase(raw) {
      if (!raw || typeof raw !== 'object' || !PHASE_IDS.has(String(raw.stage || ''))) return null
      const stage = String(raw.stage)
      const state = PHASE_STATES.has(String(raw.state || '')) ? String(raw.state) : 'complete'
      const summary = safeHistoryText(raw.summary, PHASE_MAX_CHARS).text
      return { stage, state, summary }
    }

    function normalizedTraceEvent(raw, flowId, fallbackId = '') {
      if (!raw || typeof raw !== 'object') return null
      const stage = TRACE_STAGES.has(String(raw.stage || '')) ? String(raw.stage) : ''
      if (!stage) return null
      const rawState = TRACE_STATES.has(String(raw.state || '')) ? String(raw.state) : 'complete'
      const state = TRACE_STATE_MAP[rawState] || rawState
      const counts = {}
      for (const key of ['selected', 'read', 'matched', 'citations']) {
        const value = Number(raw.counts?.[key])
        counts[key] = Number.isFinite(value) ? Math.max(0, Math.min(9999, Math.trunc(value))) : 0
      }
      const base = {
        id: String(raw.id || fallbackId || `${flowId}:${stage}:${Date.now().toString(36)}`).slice(0, 80),
        flowId: String(raw.flowId || flowId || 'history').slice(0, 100),
        stage,
        state,
        title: safeHistoryText(raw.title || stage, 80).text,
        summary: safeHistoryText(raw.summary || '', PHASE_MAX_CHARS).text,
        evidence: TRACE_EVIDENCE.has(String(raw.evidence || '')) ? String(raw.evidence) : state === 'complete' ? 'verified' : 'partial',
        counts,
        citations: [...new Set((Array.isArray(raw.citations) ? raw.citations : [])
          .map((value) => safeHistoryText(value, 120).text)
          .filter((value) => value && !/https?:\/\/|javascript:|^\/\//i.test(value)))].slice(0, 40),
      }
      const safe = api.ai.trace?.sanitize ? api.ai.trace.sanitize(base) : base
      const checked = api.ai.trace?.validate ? api.ai.trace.validate(safe) : { ok: true }
      return checked?.ok === false ? null : safe
    }

    function traceFromLegacyPhase(phase, flowId, index) {
      const normalized = normalizedPhase(phase)
      if (!normalized) return null
      const stage = TRACE_STAGE_MAP[normalized.stage]
      const id = String(index || '').includes(':') ? String(index) : `${flowId}:legacy:${index}`
      if (!stage) return null
      return normalizedTraceEvent({
        id,
        flowId,
        stage,
        state: TRACE_STATE_MAP[normalized.state] || normalized.state,
        title: normalized.stage,
        summary: normalized.summary,
        evidence: normalized.state === 'complete' ? 'verified' : 'partial',
      }, flowId, id)
    }

    function normalizedEvidenceScope(raw) {
      const source = raw && typeof raw === 'object' ? raw : {}
      const topicId = Number(source.topicId)
      return {
        kind: safeHistoryText(source.kind || 'topic', 40).text || 'topic',
        routeType: safeHistoryText(source.routeType || 'topic', 40).text || 'topic',
        topicId: Number.isSafeInteger(topicId) && topicId > 0 ? topicId : 0,
        routeScope: safeHistoryText(source.routeScope || '', 160).text,
      }
    }

    function normalizedEvidenceCitation(raw) {
      if (!raw || typeof raw !== 'object') return null
      const topicId = Number(raw.topicId)
      const postId = Number(raw.postId)
      const floor = Number(raw.floor)
      const page = Number(raw.page)
      const key = safeHistoryText(raw.key || '', 120).text
      if (!key || !Number.isSafeInteger(topicId) || topicId <= 0 || !Number.isSafeInteger(floor) || floor <= 0 || !Number.isSafeInteger(page) || page <= 0) return null
      const contentFingerprint = safeHistoryText(raw.contentFingerprint || '', 40).text.replace(/[^a-z0-9_-]/gi, '').slice(0, 40)
      if (!contentFingerprint) return null
      return {
        key,
        topicId,
        postId: Number.isSafeInteger(postId) && postId > 0 ? postId : null,
        floor,
        page,
        authorName: safeHistoryText(raw.authorName || '', 80).text,
        excerpt: safeHistoryText(raw.excerpt || '', 240).text,
        contentFingerprint,
        known: raw.known !== false,
      }
    }

    function normalizedEvidenceSnapshot(raw) {
      if (!raw || typeof raw !== 'object' || Number(raw.version) !== EVIDENCE_SNAPSHOT_VERSION) return null
      const scope = normalizedEvidenceScope(raw.scope)
      if (!scope.topicId) return null
      const materialFingerprint = safeHistoryText(raw.materialFingerprint || '', 40).text.replace(/[^a-z0-9_-]/gi, '').slice(0, 40)
      if (!materialFingerprint) return null
      const citations = (Array.isArray(raw.citations) ? raw.citations : [])
        .map(normalizedEvidenceCitation)
        .filter(Boolean)
        .slice(0, 40)
      return { version: EVIDENCE_SNAPSHOT_VERSION, scope, materialFingerprint, citations }
    }

    function normalizedCitationReview(raw) {
      if (!raw || typeof raw !== 'object' || Number(raw.version) !== 1) return null
      const status = CITATION_REVIEW_STATES.has(String(raw.status || '')) ? String(raw.status) : 'unverifiable'
      const reviewedAt = Number(raw.reviewedAt)
      const counts = {}
      for (const key of ['unchanged', 'changed', 'removed', 'unverifiable']) {
        const value = Number(raw.counts?.[key])
        counts[key] = Number.isFinite(value) ? Math.max(0, Math.min(40, Math.trunc(value))) : 0
      }
      const rows = (Array.isArray(raw.rows) ? raw.rows : []).map((row) => {
        const citation = normalizedEvidenceCitation({ ...row, key: row?.key || `topic:${row?.topicId}:post:${row?.postId}` })
        if (!citation) return null
        const rowStatus = CITATION_REVIEW_STATES.has(String(row.status || '')) ? String(row.status) : status
        return { ...citation, status: rowStatus, freshness: rowStatus === 'unchanged' ? 'fresh' : rowStatus, reason: safeHistoryText(row.reason || '', 80).text }
      }).filter(Boolean).slice(0, 40)
      return {
        version: 1,
        reviewedAt: Number.isFinite(reviewedAt) && reviewedAt > 0 ? reviewedAt : 0,
        status,
        materialFingerprint: safeHistoryText(raw.materialFingerprint || '', 40).text.replace(/[^a-z0-9_-]/gi, '').slice(0, 40),
        counts,
        rows,
      }
    }

    function normalizedFreshness(raw, evidenceSnapshot, legacy = false) {
      const source = raw && typeof raw === 'object' ? raw : {}
      const status = FRESHNESS_STATES.has(String(source.status || '')) ? String(source.status) : legacy ? 'legacy' : 'unverifiable'
      const reviewedAt = Number(source.reviewedAt)
      const counts = {}
      for (const key of ['unchanged', 'changed', 'removed', 'unverifiable']) {
        const value = Number(source.counts?.[key])
        counts[key] = Number.isFinite(value) ? Math.max(0, Math.min(40, Math.trunc(value))) : 0
      }
      return {
        status,
        reviewedAt: Number.isFinite(reviewedAt) && reviewedAt > 0 ? reviewedAt : 0,
        materialFingerprint: safeHistoryText(source.materialFingerprint || evidenceSnapshot?.materialFingerprint || '', 40).text.replace(/[^a-z0-9_-]/gi, '').slice(0, 40),
        counts,
      }
    }

    function normalizedRevision(raw) {
      if (!raw || typeof raw !== 'object') return null
      const createdAt = Number(raw.createdAt)
      const answer = safeHistoryText(raw.answer || '', ANSWER_MAX_CHARS).text
      const id = String(raw.id || '').replace(/[^a-z0-9_-]/gi, '').slice(0, 80)
      const reason = REVISION_REASONS.has(String(raw.reason || '')) ? String(raw.reason) : 'manual-regenerate'
      if (!answer || !id) return null
      const citations = (Array.isArray(raw.citations) ? raw.citations : []).filter((row) => {
        const topicId = Number(row?.topicId)
        const floor = Number(row?.floor)
        const postId = Number(row?.postId)
        return Number.isSafeInteger(topicId) && topicId > 0 && Number.isSafeInteger(floor) && floor > 0 && Number.isSafeInteger(postId) && postId > 0
      }).slice(0, 40).map((row) => ({
        topicId: Number(row.topicId), floor: Number(row.floor), postId: Number(row.postId),
        page: Number.isSafeInteger(Number(row.page)) && Number(row.page) > 0 ? Number(row.page) : 1,
        authorName: safeHistoryText(row.authorName || '', 80).text,
        known: true,
      }))
      return {
        id,
        answer,
        citations,
        materialFingerprint: safeHistoryText(raw.materialFingerprint || '', 40).text.replace(/[^a-z0-9_-]/gi, '').slice(0, 40),
        createdAt: Number.isFinite(createdAt) && createdAt > 0 ? createdAt : Date.now(),
        reason,
      }
    }

    function normalizedIntent(raw) {
      if (!raw || typeof raw !== 'object' || !CAPABILITIES.has(String(raw.capability || ''))) return null
      const confidence = ['high', 'medium', 'low'].includes(String(raw.confidence || '')) ? String(raw.confidence) : 'low'
      if (String(raw.source || '') !== 'local') return null
      const reason = ['topic-analysis', 'research', 'tracking', 'explicit-action', 'fallback'].includes(String(raw.reason || ''))
        ? String(raw.reason)
        : ''
      if (!reason) return null
      return { capability: String(raw.capability), confidence, source: 'local', reason }
    }

    function normalizedConversationTurn(raw) {
      if (!raw || typeof raw !== 'object' || !CAPABILITIES.has(String(raw.capability || ''))) return null
      const isResearch = raw.capability === 'research'
      const sanitizeTurnText = isResearch ? safeResearchHistoryText : safeHistoryText
      const question = sanitizeTurnText(raw.question, INPUT_MAX_CHARS)
      const answer = safeHistoryText(raw.answer, ANSWER_MAX_CHARS)
      const createdAt = Number.isFinite(Number(raw.createdAt)) && Number(raw.createdAt) > 0 ? Number(raw.createdAt) : Date.now()
      const id = String(raw.id || `${createdAt.toString(36)}-${Math.random().toString(36).slice(2, 8)}`).replace(/[^a-z0-9_-]/gi, '').slice(0, 80)
      const traceFlowId = String(raw.traceFlowId || id).replace(/[^a-z0-9_:-]/gi, '').slice(0, 100) || id
      const phasesByStage = new Map()
      const rawPhases = Array.isArray(raw.phases) ? raw.phases : []
      for (const row of rawPhases) {
        const phase = normalizedPhase(row)
        if (phase) phasesByStage.set(phase.stage, phase)
      }
      const traceById = new Map()
      for (const row of Array.isArray(raw.trace) ? raw.trace : []) {
        const event = normalizedTraceEvent(row, traceFlowId)
        if (event) traceById.set(event.id, event)
      }
      if (!traceById.size) {
        rawPhases.forEach((phase, index) => {
          const event = traceFromLegacyPhase(phase, traceFlowId, index)
          if (event) traceById.set(event.id, event)
        })
      }
      const citations = (Array.isArray(raw.citations) ? raw.citations : [])
        .filter((row) => {
          const topicId = Number(row?.topicId)
          const floor = Number(row?.floor)
          return Number.isSafeInteger(topicId) && topicId > 0 &&
            (row.kind === 'topic' ? floor === 0 : Number.isInteger(floor) && floor > 0)
        })
        .slice(0, 40)
        .map((row) => raw.capability === 'research'
          ? { kind: row.kind === 'topic' ? 'topic' : 'floor', topicId: Number(row.topicId), floor: Number(row.floor), known: true }
          : row.kind === 'topic'
            ? { kind: 'topic', topicId: Number(row.topicId), floor: 0 }
            : {
                topicId: Number(row.topicId),
                floor: Number(row.floor),
                issueId: String(row.issueId || '').replace(/[^a-z0-9_-]/gi, '').slice(0, 100),
                postId: String(row.postId || '').replace(/[^0-9]/g, '').slice(0, 24),
              })
      const context = raw.context && typeof raw.context === 'object' ? raw.context : {}
      const kind = CONTEXT_KINDS.has(String(context.kind || '')) ? String(context.kind) : 'current-page'
      const routeType = ROUTE_TYPES.has(String(context.routeType || '')) ? String(context.routeType) : 'unknown'
      const topicId = Number.isInteger(Number(context.topicId)) && Number(context.topicId) > 0 ? Number(context.topicId) : 0
      const materialMode = raw.materialMode === 'detached' || context.materialMode === 'detached' ? 'detached' : 'attached'
      const titleSource = raw.title ? sanitizeTurnText(raw.title, 64).text : question.text
      const state = ['pending', 'complete', 'failed', 'stale', 'cancelled'].includes(String(raw.state || '')) ? String(raw.state) : 'complete'
      const evidenceSnapshot = normalizedEvidenceSnapshot(raw.evidenceSnapshot)
      const citationReview = normalizedCitationReview(raw.citationReview)
      const isWriteAction = raw.capability === 'site-action'
      const legacy = !isWriteAction && (!evidenceSnapshot || !raw.freshness)
      const revisions = isWriteAction ? [] : (Array.isArray(raw.revisions) ? raw.revisions : [])
        .map(normalizedRevision)
        .filter(Boolean)
        .sort((a, b) => a.createdAt - b.createdAt)
        .slice(-2)
      const turn = {
        id,
        createdAt,
        capability: String(raw.capability),
        context: { kind, routeType, topicId, routeScope: context.routeScope ? cleanStoredRouteFingerprint(context.routeScope) : '', materialMode },
        title: titleSource || '新对话',
        question: question.text,
        answer: answer.text,
        state,
        phases: [...phasesByStage.values()].slice(-PHASE_LIMIT),
        trace: [...traceById.values()].slice(-TRACE_LIMIT),
        traceFlowId,
        citations,
        intent: normalizedIntent(raw.intent),
        materialMode,
        truncation: {
          question: Boolean(raw.truncation?.question || question.truncated),
          answer: Boolean(raw.truncation?.answer || answer.truncated),
        },
      }
      if (!isWriteAction) {
        turn.freshness = normalizedFreshness(raw.freshness, evidenceSnapshot, legacy)
        if (evidenceSnapshot) turn.evidenceSnapshot = evidenceSnapshot
        if (citationReview) turn.citationReview = citationReview
        if (revisions.length) turn.revisions = revisions
      }
      return turn
    }

    function conversationHistoryBytes(value) {
      const serialized = JSON.stringify(value)
      try {
        return new TextEncoder().encode(serialized).length
      } catch {
        try {
          return new Blob([serialized]).size
        } catch {
          return serialized.length * 3
        }
      }
    }

    function normalizeConversationHistory(raw, { keepConversationId = '', keepTurnId = '' } = {}) {
      const source = raw && typeof raw === 'object' && !Array.isArray(raw) ? raw : {}
      const conversations = (Array.isArray(source.conversations) ? source.conversations : [])
        .map((item) => {
          if (!item || typeof item !== 'object') return null
          const createdAt = Number.isFinite(Number(item.createdAt)) && Number(item.createdAt) > 0 ? Number(item.createdAt) : Date.now()
          const updatedAt = Number.isFinite(Number(item.updatedAt)) && Number(item.updatedAt) > 0 ? Number(item.updatedAt) : createdAt
          const id = String(item.id || '').replace(/[^a-z0-9_-]/gi, '').slice(0, 80)
          if (!id) return null
          const turns = (Array.isArray(item.turns) ? item.turns : [])
            .map(normalizedConversationTurn)
            .filter(Boolean)
            .slice(-CONVERSATION_TURN_LIMIT)
          const compactions = (Array.isArray(item.compactions) ? item.compactions : [])
            .map(normalizedCompaction)
            .filter(Boolean)
            .sort((a, b) => a.updatedAt - b.updatedAt)
            .slice(-CONVERSATION_COMPACTION_LIMIT)
          while (conversationHistoryBytes(compactions) > CONVERSATION_COMPACTION_BYTES && compactions.length) compactions.shift()
          const titleSource = item.title || turns.at(-1)?.title || '新对话'
          const title = safeResearchHistoryText(titleSource, 64).text || '新对话'
          return { id, title, createdAt, updatedAt, turns, compactions }
        })
        .filter(Boolean)
        .sort((a, b) => b.updatedAt - a.updatedAt || b.createdAt - a.createdAt)
        .slice(0, CONVERSATION_LIMIT)
      const history = { version: 1, activeId: '', conversations }
      history.activeId = conversations.some((item) => item.id === source.activeId) ? String(source.activeId) : conversations[0]?.id || ''

      while (conversationHistoryBytes(history) > CONVERSATION_MAX_BYTES) {
        let removed = false
        for (const conversation of [...history.conversations].reverse()) {
          const turn = [...conversation.turns].reverse().find((item) => item.id !== keepTurnId && Array.isArray(item.revisions) && item.revisions.length)
          if (turn) {
            turn.revisions = []
            removed = true
            break
          }
        }
        if (removed) continue
        for (const conversation of [...history.conversations].reverse()) {
          const index = conversation.turns.findIndex((turn) => turn.id !== keepTurnId)
          if (index >= 0) {
            conversation.turns.splice(index, 1)
            removed = true
            break
          }
        }
        if (!removed) {
          const index = [...history.conversations].reverse().findIndex((item) => item.id !== keepConversationId && item.id !== history.activeId)
          if (index >= 0) {
            history.conversations.splice(history.conversations.length - 1 - index, 1)
            removed = true
          }
        }
        if (!removed) break
      }
      if (!history.conversations.some((item) => item.id === history.activeId)) history.activeId = history.conversations[0]?.id || ''
      return history
    }

    function loadConversationHistory() {
      let raw = null
      try {
        raw = api.store.get(CONVERSATION_HISTORY_KEY, null)
      } catch {
        return { version: 1, activeId: '', conversations: [] }
      }
      const normalized = normalizeConversationHistory(raw)
      const savedActions = new Map(actionSession.history.map((record) => [record.id, record]))
      for (const conversation of normalized.conversations) {
        for (const turn of conversation.turns) {
          if (turn.state === 'pending') {
            turn.state = 'stale'
            turn.answer = turn.answer || '此请求因页面刷新而中断，未自动重放。'
            turn.phases = turn.phases.map((phase) => phase.state === 'active'
              ? { ...phase, state: 'cancelled', summary: '页面刷新时请求中断' }
              : phase)
            turn.trace = turn.trace.map((event) => event.state === 'active'
              ? { ...event, state: 'skipped', summary: '页面刷新时请求中断', evidence: 'partial' }
              : event)
          }
          const action = savedActions.get(turn.id)
          if (!action || !['interrupted', 'submitted', 'cancelled'].includes(action.status)) continue
          const phaseState = action.status === 'submitted' ? 'complete' : 'cancelled'
          const summary = action.status === 'submitted'
            ? '提交请求已发出，请检查站点结果'
            : action.write
              ? '写操作结果未知，请先检查站点'
              : '动作因刷新中断，未自动重放'
          turn.phases = turn.phases.map((phase) => phase.stage === 'action' && phase.state === 'active'
            ? { ...phase, state: phaseState, summary }
            : phase)
          turn.trace = turn.trace.map((event) => event.stage === 'execute' && event.state === 'active'
            ? { ...event, state: phaseState === 'complete' ? 'complete' : 'unknown', summary, evidence: phaseState === 'complete' ? 'verified' : 'partial' }
            : event)
        }
      }
      if (raw != null && JSON.stringify(raw) !== JSON.stringify(normalized)) {
        try {
          if (normalized.conversations.length) api.store.set(CONVERSATION_HISTORY_KEY, normalized)
          else api.store.del(CONVERSATION_HISTORY_KEY)
        } catch {
          /* Invalid stored history must not block the workbench. */
        }
      }
      return normalized
    }

    function saveConversationHistory({ keepConversationId = conversationHistory.activeId, keepTurnId = '' } = {}) {
      conversationHistory = normalizeConversationHistory(conversationHistory, { keepConversationId, keepTurnId })
      try {
        if (conversationHistory.conversations.length) api.store.set(CONVERSATION_HISTORY_KEY, conversationHistory)
        else api.store.del(CONVERSATION_HISTORY_KEY)
      } catch {
        /* Local history is useful but must not block the current answer. */
      }
      return conversationHistory
    }

    function createConversation() {
      const now = Date.now()
      const id = `${now.toString(36)}-${(++conversationSequence).toString(36)}`
      const conversation = { id, title: '新对话', createdAt: now, updatedAt: now, turns: [], compactions: [] }
      conversationHistory = normalizeConversationHistory({
        version: 1,
        activeId: id,
        conversations: [conversation, ...conversationHistory.conversations],
      }, { keepConversationId: id })
      saveConversationHistory({ keepConversationId: id })
      return conversationHistory.conversations.find((item) => item.id === conversationHistory.activeId) || conversation
    }

    function clearConversationHistory() {
      answerDrafts.clear()
      conversationHistory = { version: 1, activeId: '', conversations: [] }
      try {
        api.store.del(CONVERSATION_HISTORY_KEY)
      } catch {
        /* Clearing in-memory state still succeeds if storage is unavailable. */
      }
    }

    function activeConversation() {
      return conversationHistory.conversations.find((item) => item.id === conversationHistory.activeId) || null
    }

    function findTurn(conversationId, turnId) {
      return conversationHistory.conversations.find((item) => item.id === conversationId)?.turns.find((item) => item.id === turnId) || null
    }

    function updateConversationTurn(conversationId, turnId, patch) {
      const conversation = conversationHistory.conversations.find((item) => item.id === conversationId)
      const turn = conversation?.turns.find((item) => item.id === turnId)
      if (!conversation || !turn) return null
      Object.assign(turn, patch)
      conversation.updatedAt = Date.now()
      saveConversationHistory({ keepConversationId: conversationId, keepTurnId: turnId })
      return findTurn(conversationId, turnId)
    }

    function appendTurnPhase(conversationId, turnId, event) {
      const phase = normalizedPhase(event)
      if (!phase) return null
      const turn = findTurn(conversationId, turnId)
      if (!turn) return null
      const phases = new Map(turn.phases.map((item) => [item.stage, item]))
      phases.set(phase.stage, phase)
      const next = [...phases.values()].slice(-PHASE_LIMIT)
      const failed = phase.state === 'failed'
      const updated = updateConversationTurn(conversationId, turnId, {
        phases: next,
        state: failed ? 'failed' : turn.state,
      })
      const flowId = turn.traceFlowId || turn.id
      const traceStage = TRACE_STAGE_MAP[phase.stage] || phase.stage
      const previousTrace = (Array.isArray(turn.trace) ? turn.trace : []).find((item) => item.stage === traceStage)
      const traceEvent = traceFromLegacyPhase(phase, flowId, previousTrace?.id || `${flowId}:legacy:${traceStage}`)
      if (traceEvent) appendTurnTrace(conversationId, turnId, traceEvent)
      return updated
    }

    function appendTurnTrace(conversationId, turnId, event) {
      const turn = findTurn(conversationId, turnId)
      if (!turn) return null
      let normalized = normalizedTraceEvent(event, turn.traceFlowId || turn.id)
      if (!normalized) return null
      const sameStage = (Array.isArray(turn.trace) ? turn.trace : []).find((item) => item.stage === normalized.stage && item.flowId === normalized.flowId)
      if (sameStage && sameStage.id !== normalized.id && (sameStage.state === normalized.state || sameStage.state === 'pending' || normalized.state !== 'active')) {
        normalized = { ...normalized, id: sameStage.id }
      }
      const existing = (turn.trace || []).find((item) => item.id === normalized.id)
      if (existing && api.ai.trace?.transition) {
        const transition = api.ai.trace.transition(existing, normalized)
        if (!transition?.ok) return null
      }
      const traces = new Map((Array.isArray(turn.trace) ? turn.trace : []).map((item) => [item.id, item]))
      traces.set(normalized.id, normalized)
      const failed = normalized.state === 'failed'
      const next = [...traces.values()].slice(-TRACE_LIMIT)
      return updateConversationTurn(conversationId, turnId, {
        trace: next,
        state: failed ? 'failed' : turn.state,
      })
    }

    function newConversationTurn(question, capability, contextKind, materialMode = 'attached', intent = null) {
      let conversation = activeConversation()
      if (!conversation) {
        createConversation()
        conversation = activeConversation()
      }
      const route = safeRouteSnapshot(context()?.route || api.page)
      const historySanitizer = capability === 'research' ? safeResearchHistoryText : safeHistoryText
      const safeQuestion = historySanitizer(question, INPUT_MAX_CHARS).text
      const now = Date.now()
      const id = `turn-${now.toString(36)}-${(++conversationSequence).toString(36)}`
      const turn = {
        id,
        createdAt: now,
        capability,
        context: {
          kind: CONTEXT_KINDS.has(contextKind) ? contextKind : 'current-page',
          routeType: ROUTE_TYPES.has(route.type) ? route.type : 'unknown',
          topicId: route.type === 'topic' ? route.id : 0,
          routeScope: routeFingerprint(api.page),
          materialMode: materialMode === 'detached' ? 'detached' : 'attached',
        },
        title: clipText(safeQuestion || '新对话', 64).text,
        question: safeQuestion,
        answer: '',
        state: 'pending',
        phases: [],
        trace: [],
        traceFlowId: id,
        citations: [],
        materialMode: materialMode === 'detached' ? 'detached' : 'attached',
        intent: intent && typeof intent === 'object' ? { ...intent } : null,
        truncation: { question: Array.from(String(question || '')).length > INPUT_MAX_CHARS, answer: false },
      }
      conversation.turns.push(turn)
      conversation.turns = conversation.turns.slice(-CONVERSATION_TURN_LIMIT)
      traceFlows.set(turn.traceFlowId, { conversationId: conversation.id, turnId: id })
      if (conversation.turns.length === 1) conversation.title = turn.title
      conversation.updatedAt = now
      saveConversationHistory({ keepConversationId: conversation.id, keepTurnId: id })
      return findTurn(conversation.id, id)
    }

    function saveTurnAnswer(conversationId, turnId, answer, state, citations = [], evidenceMeta = {}) {
      if (state === 'complete') answerDrafts.delete(turnId)
      const current = findTurn(conversationId, turnId)
      const safeAnswer = safeHistoryText(answer, ANSWER_MAX_CHARS)
      const safeCitations = (Array.isArray(citations) ? citations : [])
        .filter((row) => row?.known)
        .map((row) => ({
          ...row,
          topicId: Number(row.topicId),
          floor: Number(row.floor),
          postId: row.postId ? String(row.postId).replace(/[^0-9]/g, '').slice(0, 24) : undefined,
          known: true,
        }))
      const isReadOnly = current?.capability !== 'site-action'
      const snapshot = isReadOnly ? normalizedEvidenceSnapshot(evidenceMeta?.evidenceSnapshot) : null
      const review = isReadOnly ? normalizedCitationReview(evidenceMeta?.citationReview) : null
      const materialFingerprint = snapshot?.materialFingerprint || safeHistoryText(evidenceMeta?.materialFingerprint || '', 40).text.replace(/[^a-z0-9_-]/gi, '').slice(0, 40)
      const revisions = isReadOnly ? [...(current?.revisions || [])] : []
      const previousMaterial = current?.evidenceSnapshot?.materialFingerprint || current?.freshness?.materialFingerprint || ''
      const reason = REVISION_REASONS.has(String(evidenceMeta?.revisionReason || '')) ? String(evidenceMeta.revisionReason) : previousMaterial && materialFingerprint && previousMaterial !== materialFingerprint ? 'material-changed' : ''
      if (state === 'complete' && isReadOnly && current?.answer && current.answer !== safeAnswer.text && reason) {
        const revision = normalizedRevision({
          id: `revision-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 7)}`,
          answer: current.answer,
          citations: current.citations,
          materialFingerprint: previousMaterial,
          createdAt: Date.now(),
          reason,
        })
        if (revision) revisions.push(revision)
      }
      const patch = {
        answer: safeAnswer.text,
        state,
        citations: safeCitations,
        truncation: {
          question: Boolean(current?.truncation?.question),
          answer: safeAnswer.truncated,
        },
      }
      if (isReadOnly && snapshot && state === 'complete') {
        const reviewStatus = review?.status || ''
        patch.evidenceSnapshot = snapshot
        patch.citationReview = review
        patch.freshness = {
          status: reviewStatus === 'unchanged' || !reviewStatus ? 'fresh' : reviewStatus === 'unverifiable' ? 'unverifiable' : 'citation-stale',
          reviewedAt: review?.reviewedAt || 0,
          materialFingerprint,
          counts: review?.counts || { unchanged: 0, changed: 0, removed: 0, unverifiable: 0 },
        }
        patch.revisions = revisions.sort((a, b) => a.createdAt - b.createdAt).slice(-2)
      }
      return updateConversationTurn(conversationId, turnId, patch)
    }

    function context() {
      try {
        return copilot?.context?.() || { route: api.page, currentTopic: null, currentPosts: [], catalog: [] }
      } catch {
        return { route: api.page, currentTopic: null, currentPosts: [], catalog: [] }
      }
    }

    function isAlive(state, node, token) {
      return !disposed && !state.disposed && mounted === state && generation === token && node?.isConnected
    }

    function safeRouteSnapshot(route = {}) {
      const page = Number(route?.page || 1)
      const rawSort = String(route?.sort || '')
      const rawTab = String(route?.tab || '')
      return {
        type: String(route?.type || ''),
        id: Number(route?.id || 0) || 0,
        page: Number.isInteger(page) && page > 0 && page <= 10000 ? page : 1,
        sort: ROUTE_SORTS.has(rawSort) ? rawSort : null,
        tab: ROUTE_TABS.has(rawTab) ? rawTab : null,
      }
    }

    function routeFingerprint(route = copilot?.actionContext?.('')?.route || api.page) {
      return JSON.stringify(safeRouteSnapshot(route))
    }

    function explicitCoinFromCommand(command) {
      const source = String(command || '')
      if (/(?:不要|别|无需|不必|不需要|不想|不应|禁止|避免|拒绝|勿)/.test(source)) return null
      if ((source.match(/\d+/gu) || []).length !== 1) return null
      const match = source.match(/(?:投(?:币)?|打赏)\s*(\d+)\s*(?:个)?(?:币)?/u)
      const coin = match ? Number(match[1]) : NaN
      return Number.isSafeInteger(coin) && coin > 0 ? coin : null
    }

    function cleanStoredRouteFingerprint(value) {
      try {
        return routeFingerprint(JSON.parse(String(value || '')))
      } catch {
        return routeFingerprint({})
      }
    }

    function actionHistoryRecord(record) {
      if (!record?.plan) return null
      const ephemeralTargets = Boolean(record.ephemeralTargets || record.plan.steps?.some((step) => SCOPED_TARGET_WRITE_ACTIONS.has(String(step.action || ''))))
      const persistedStatus = ephemeralTargets && record.status === 'ready' ? 'expired'
        : ephemeralTargets && record.status === 'regenerating' ? 'interrupted'
          : String(record.status || 'ready').slice(0, 20)
      const cleanArgs = (args) => {
        const output = {}
        for (const [key, value] of Object.entries(args || {}).slice(0, 12)) {
          if (typeof value === 'string') {
            const limit = key === 'body' ? ANSWER_MAX_CHARS : key === 'title' ? 160 : 240
            output[String(key).slice(0, 80)] = safeHistoryText(value, limit).text
          }
          else if (typeof value === 'number' && Number.isFinite(value)) output[String(key).slice(0, 80)] = value
          else if (typeof value === 'boolean') output[String(key).slice(0, 80)] = value
        }
        return output
      }
      return {
        id: String(record.id || `${Number(record.ts || 0)}-${String(record.plan.summary || '').slice(0, 40)}`).slice(0, 120),
        command: safeHistoryText(record.command, INPUT_MAX_CHARS).text,
        plan: {
          version: 1,
          summary: ephemeralTargets ? '站内互动计划（目标仅在本次页面有效）' : safeHistoryText(record.plan.summary, 240).text,
          steps: (ephemeralTargets ? [] : (Array.isArray(record.plan.steps) ? record.plan.steps : []).slice(0, 5)).map((step) => ({
            action: String(step.action || '').slice(0, 120),
            args: step.args && typeof step.args === 'object' && !Array.isArray(step.args) ? cleanArgs(step.args) : {},
            actionVersion: Number.isInteger(step.actionVersion) ? step.actionVersion : null,
            actionProvider: String(step.actionProvider || '').slice(0, 120),
          })),
        },
        routeFingerprint: ephemeralTargets ? '{}' : cleanStoredRouteFingerprint(record.routeFingerprint),
        source: record.source === 'local' ? 'local' : 'model',
        write: Boolean(record.write || ephemeralTargets || record.plan.steps.some((step) => /^site\.write-/.test(String(step.action || '')))),
        ephemeralTargets,
        status: persistedStatus,
        steps: (Array.isArray(record.steps) ? record.steps : []).slice(0, 5).map((step) => ({
          state: ephemeralTargets && persistedStatus === 'expired' && step.state === 'pending' ? 'skipped' : String(step.state || 'pending').slice(0, 20),
          error: ephemeralTargets ? '' : safeHistoryText(step.error, 240).text,
        })),
        ts: Number(record.ts || Date.now()),
      }
    }

    function loadActionHistory() {
      try {
        const raw = api.store.get(ACTION_HISTORY_KEY, [])
        const rows = (Array.isArray(raw) ? raw : []).map(actionHistoryRecord).filter(Boolean).slice(-ACTION_HISTORY_LIMIT)
        for (const row of rows) {
          if (!['running', 'regenerating'].includes(row.status)) continue
          row.status = 'interrupted'
          for (const step of row.steps) {
            if (step.state === 'running') step.state = 'interrupted'
          }
        }
        if (JSON.stringify(raw) !== JSON.stringify(rows)) api.store.set(ACTION_HISTORY_KEY, rows)
        return rows
      } catch {
        return []
      }
    }

    function saveActionHistory(record) {
      const row = actionHistoryRecord(record)
      if (!row) return
      actionSession.history = [row, ...actionSession.history.filter((item) => item.id !== row.id)].slice(0, ACTION_HISTORY_LIMIT)
      try {
        api.store.set(ACTION_HISTORY_KEY, actionSession.history)
      } catch {
        /* history is useful but does not block the current action */
      }
    }

    function renderCitations(host, rows) {
      const citations = (Array.isArray(rows) ? rows : []).filter((row) => {
        const topicId = Number(row?.topicId)
        return row?.kind === 'topic'
          ? Number.isSafeInteger(topicId) && topicId > 0
          : Number(row?.floor) > 0
      })
      if (!citations.length) return
      const box = document.createElement('div')
      box.className = 'ai-workbench-citations'
      const title = document.createElement('strong')
      title.textContent = '引用主题与楼层'
      box.appendChild(title)
      for (const row of citations) {
        const line = document.createElement('div')
        const topicReference = row.kind === 'topic'
        const topicId = Number(row.topicId)
        const label = topicReference ? `主题 #${topicId}` : `[#${row.floor}] ${row.authorName || '楼层'}`
        const href = row.known
          ? topicReference && Number.isSafeInteger(topicId) && topicId > 0
            ? safeHref(api.routes.topic(topicId))
            : safeHref(row.href)
          : ''
        if (href) {
          const link = document.createElement('a')
          link.href = href
          link.textContent = label
          line.appendChild(link)
          if (row.excerpt) line.append(`：${row.excerpt}`)
        } else {
          line.textContent = topicReference ? `${label}：未验证引用` : `[#${row.floor}] 当前采集范围没有此楼层`
        }
        box.appendChild(line)
      }
      host.appendChild(box)
    }

    function renderRecord(host, record, state, token) {
      if (!isAlive(state, host, token)) return
      host.innerHTML = `
        <div class="ai-workbench-facts"></div>
        <div class="ai-workbench-result" data-ai-result></div>
        <div class="ai-workbench-actions">
          <button type="button" class="ai-workbench-btn" data-ai-copy>复制结果</button>
        </div>`
      const facts = [
        record?.meta?.model,
        record?.meta?.floors != null ? `${record.meta.floors} 楼` : null,
        record?.meta?.pagesFetched != null ? `${record.meta.pagesFetched}/${record.meta.pagesTotal} 页` : null,
        record?.meta?.analysisKind,
        record?.meta?.empty ? '无匹配数据' : null,
      ].filter(Boolean)
      host.querySelector('.ai-workbench-facts').textContent = facts.join(' · ')
      const result = host.querySelector('[data-ai-result]')
      try {
        result.innerHTML = copilot.renderMarkdown(String(record?.text || ''))
      } catch {
        result.textContent = String(record?.text || '')
      }
      renderCitations(host, record?.meta?.citations)
      host.querySelector('[data-ai-copy]').onclick = async () => {
        try {
          await navigator.clipboard.writeText(String(record?.text || ''))
          api.ui.toast('结果已复制', { type: 'success' })
        } catch {
          api.ui.toast('复制失败，请手动选择文本', { type: 'error' })
        }
      }
    }

    function freshnessLabel(status) {
      return ({
        fresh: '材料新鲜',
        'material-stale': '材料已变化',
        'citation-stale': '引用需复核',
        unverifiable: '引用无法读取',
        legacy: '旧回答待复核',
      })[status] || '证据状态未知'
    }

    function renderCitationDiff(host, review) {
      const rows = Array.isArray(review?.rows) ? review.rows : []
      if (!rows.length) return
      const details = document.createElement('details')
      details.setAttribute('data-ai-citation-diff', '')
      details.className = 'ai-workbench-citation-diff'
      const summary = document.createElement('summary')
      summary.textContent = review.status === 'unchanged' ? '引用复核完成：未发现变化' : '查看引用差异'
      details.appendChild(summary)
      const groups = new Map([
        ['unchanged', '未变化'],
        ['changed', '内容变化'],
        ['removed', '楼层消失'],
        ['unverifiable', '无法读取'],
      ])
      for (const [status, label] of groups) {
        const members = rows.filter((row) => row.status === status)
        if (!members.length) continue
        const section = document.createElement('section')
        const title = document.createElement('strong')
        title.textContent = `${label}（${members.length}）`
        section.appendChild(title)
        for (const row of members) {
          const line = document.createElement('div')
          const floor = Number(row.floor) > 0 ? `#${Number(row.floor)}` : '引用'
          line.textContent = `${floor}${row.reason ? ` · ${row.reason}` : ''}`
          section.appendChild(line)
        }
        details.appendChild(section)
      }
      host.appendChild(details)
    }

    function renderTurnFreshness(host, state, turn) {
      if (turn.capability === 'site-action' || !turn.freshness) return
      const box = document.createElement('div')
      box.className = 'ai-workbench-freshness'
      box.setAttribute('data-ai-freshness', turn.freshness.status)
      box.setAttribute('data-citation-status', turn.freshness.status === 'fresh' ? 'fresh' : ['material-stale', 'citation-stale'].includes(turn.freshness.status) ? 'changed' : 'unavailable')
      const label = document.createElement('span')
      label.textContent = freshnessLabel(turn.freshness.status)
      box.appendChild(label)
      if (turn.freshness.reviewedAt) {
        const time = document.createElement('small')
        time.textContent = ` · ${new Date(turn.freshness.reviewedAt).toLocaleString()}`
        box.appendChild(time)
      }
      const actions = document.createElement('span')
      actions.className = 'ai-workbench-actions'
      if (turn.evidenceSnapshot && turn.citations.length) {
        const reviewButton = document.createElement('button')
        reviewButton.type = 'button'
        reviewButton.className = 'ai-workbench-btn'
        reviewButton.setAttribute('data-ai-citation-review', '')
        reviewButton.textContent = '重新校验引用'
        reviewButton.disabled = Boolean(state.busy)
        reviewButton.onclick = () => void reviewTurnCitations(state, turn)
        actions.appendChild(reviewButton)
      }
      if (['material-stale', 'legacy', 'unverifiable'].includes(turn.freshness.status)) {
        const regenerate = document.createElement('button')
        regenerate.type = 'button'
        regenerate.className = 'ai-workbench-btn'
        regenerate.setAttribute('data-ai-regenerate-fresh', '')
        regenerate.textContent = '用新材料重新生成'
        regenerate.disabled = Boolean(state.busy)
        regenerate.onclick = () => chatRetry(state, turn, 'manual-regenerate').click()
        actions.appendChild(regenerate)
      }
      if (actions.childNodes.length) box.appendChild(actions)
      host.appendChild(box)
      if (turn.citationReview) renderCitationDiff(host, turn.citationReview)
      if (Array.isArray(turn.revisions) && turn.revisions.length) {
        const revisions = document.createElement('details')
        revisions.setAttribute('data-ai-revision', '')
        revisions.className = 'ai-workbench-revisions'
        const summary = document.createElement('summary')
        summary.textContent = `上一版回答（${turn.revisions.length}）`
        revisions.appendChild(summary)
        for (const revision of [...turn.revisions].reverse()) {
          const item = document.createElement('article')
          item.className = 'ai-workbench-revision'
          const title = document.createElement('strong')
          title.textContent = revision.reason === 'material-changed' ? '材料变化前' : '手动重新生成前'
          const text = document.createElement('div')
          text.textContent = revision.answer
          item.append(title, text)
          revisions.appendChild(item)
        }
        host.appendChild(revisions)
      }
    }

    async function reviewTurnCitations(state, turn) {
      const conversationId = conversationIdForTurn(turn.id)
      const current = findTurn(conversationId, turn.id)
      if (state.busy || !current?.evidenceSnapshot || !current.citations.length) return
      const token = beginReadRequest(state, conversationId, current, false, 'citation-review')
      if (conversationHistory.activeId === conversationId) renderChatMessages(state)
      try {
        const result = await copilot.revalidateCitations({
          snapshot: current.evidenceSnapshot,
          citations: current.citations,
          scope: current.evidenceSnapshot.scope,
          signal: token.controller.signal,
          onProgress: (event) => {
            if (!requestCanPersist(state, conversationId, turn.id, token)) return
            appendTurnPhase(conversationId, turn.id, { stage: 'evidence', state: 'active', summary: `正在复核第 ${Number(event?.page || 1)} 页引用` })
          },
        })
        if (!requestCanPersist(state, conversationId, turn.id, token)) return
        const review = normalizedCitationReview({ ...result, version: result?.version || 1 })
        if (!review) throw new Error('引用复核结果无效')
        const status = review.status === 'unchanged' ? 'fresh' : review.status === 'unverifiable' ? 'unverifiable' : 'citation-stale'
        updateConversationTurn(conversationId, turn.id, {
          citationReview: review,
          freshness: { ...findTurn(conversationId, turn.id).freshness, status, reviewedAt: review.reviewedAt, counts: review.counts },
        })
        appendTurnPhase(conversationId, turn.id, { stage: 'evidence', state: 'complete', summary: `引用复核完成：${review.status}` })
      } catch (error) {
        if (!requestCanPersist(state, conversationId, turn.id, token)) return
        appendTurnPhase(conversationId, turn.id, { stage: 'evidence', state: 'failed', summary: safeHistoryText(error?.message || error || '引用复核失败', 200).text })
      } finally {
        finishReadRequest(state, token)
        if (conversationHistory.activeId === conversationId) renderChatMessages(state)
      }
    }

    function renderActionPlan(host, state, token, suppliedRecord = actionSession.record, onRegenerate = null) {
      host.replaceChildren()
      const record = suppliedRecord
      if (!record) return
      const scopeOptions = record.targetScopeNonce ? { targetScopeNonce: record.targetScopeNonce } : {}
      const actionContext = copilot.actionContext(record.command, scopeOptions)
      const summary = document.createElement('div')
      summary.className = 'ai-workbench-action-summary'
      summary.textContent = record.plan.summary
      host.appendChild(summary)
      const list = document.createElement('ol')
      list.className = 'ai-workbench-action-steps'
      record.plan.steps.forEach((step, index) => {
        const row = document.createElement('li')
        row.setAttribute('data-ai-action-step', String(index + 1))
        row.dataset.state = record.steps[index]?.state || 'pending'
        const action = api.ai.actions(actionContext).find((item) => item.id === step.action)
        const title = document.createElement('strong')
        title.textContent = `${index + 1}. ${action?.label || step.action}`
        const preview = document.createElement('div')
        preview.className = 'ai-workbench-action-preview'
        preview.textContent = record.previews[index]?.text || '动作预览不可用'
        const args = document.createElement('code')
        const reactionAction = REACTION_WRITE_ACTIONS.has(step.action)
        const selectedReplyAction = step.action === SELECTED_REPLY_WRITE_ACTION
        const choice = record.userChoices?.[index] || {}
        const selectedTarget = reactionAction
          ? (actionContext.reactionTargets || []).find((target) => target.targetKey === choice.targetKey)
          : null
        const selectedReplyTarget = selectedReplyAction
          ? (actionContext.replyTargets || []).find((target) => target.targetKey === step.args?.targetKey)
          : null
        if (reactionAction) {
          const displayedArgs = { ...step.args }
          delete displayedArgs.targetKey
          delete displayedArgs.coin
          if (selectedTarget) {
            displayedArgs.target = `${selectedTarget.type === 'reply' ? '回帖' : '主题'} · ${String(selectedTarget.title || '').slice(0, 120)}${Number(selectedTarget.floor) > 0 ? ` · #${Number(selectedTarget.floor)}` : ''}`
          }
          if (step.action === 'site.write-coin' && Number.isSafeInteger(Number(choice.coin))) displayedArgs.coin = Number(choice.coin)
          args.textContent = JSON.stringify(displayedArgs)
        } else if (selectedReplyAction) {
          args.textContent = JSON.stringify({
            target: selectedReplyTarget
              ? `${selectedReplyTarget.type === 'reply' ? '回帖' : '主题'} · ${String(selectedReplyTarget.title || '').slice(0, 120)}${Number(selectedReplyTarget.floor) > 0 ? ` · #${Number(selectedReplyTarget.floor)}` : ''}`
              : '已选回复目标已失效',
          })
        } else {
          args.textContent = JSON.stringify(step.args)
        }
        if (reactionAction && record.status === 'ready') {
          const targetLabel = document.createElement('label')
          targetLabel.className = 'ai-workbench-field'
          targetLabel.append(document.createTextNode('确认操作目标'))
          const targetSelect = document.createElement('select')
          targetSelect.setAttribute('data-ai-action-target', String(index))
          targetSelect.setAttribute('aria-label', '确认互动操作目标')
          const targetPlaceholder = document.createElement('option')
          targetPlaceholder.value = ''
          targetPlaceholder.textContent = '请选择目标'
          targetSelect.appendChild(targetPlaceholder)
          const availableTargets = (actionContext.reactionTargets || []).filter((target) => {
            if (step.action === 'site.write-favorite-state') return target.type === 'topic' && typeof target.favorited === 'boolean'
            if (step.action === 'site.write-like-state') return target.liked === true || target.liked === false
            return Array.isArray(target.tiers) && target.tiers.some((coin) => Number.isSafeInteger(Number(coin)) && Number(coin) > 0)
          })
          for (const target of availableTargets) {
            const option = document.createElement('option')
            option.value = target.targetKey
            option.textContent = `${target.type === 'reply' ? '回帖' : '主题'} · ${String(target.title || '').slice(0, 120)}${Number(target.floor) > 0 ? ` · #${Number(target.floor)}` : ''}`
            targetSelect.appendChild(option)
          }
          targetSelect.value = String(choice.targetKey || '')
          targetSelect.onchange = () => {
            const previousTarget = String(record.userChoices?.[index]?.targetKey || '')
            record.userChoices ||= {}
            record.userChoices[index] = { ...(record.userChoices[index] || {}), targetKey: targetSelect.value }
            if (targetSelect.value !== previousTarget) {
              delete record.userChoices[index].coin
              if (step.action === 'site.write-coin') {
                const chosenTarget = availableTargets.find((target) => target.targetKey === targetSelect.value)
                const requestedCoin = explicitCoinFromCommand(record.command)
                if (chosenTarget && requestedCoin !== null && Array.isArray(chosenTarget.tiers) && chosenTarget.tiers.map(Number).includes(requestedCoin)) {
                  record.userChoices[index].coin = requestedCoin
                }
              }
            }
            renderActionPlan(host, state, generation, record, onRegenerate)
          }
          targetLabel.appendChild(targetSelect)
          row.appendChild(targetLabel)
          if (step.action === 'site.write-coin') {
            const coinLabel = document.createElement('label')
            coinLabel.className = 'ai-workbench-field'
            coinLabel.append(document.createTextNode('确认投币档位'))
            const coinSelect = document.createElement('select')
            coinSelect.setAttribute('data-ai-action-coin', String(index))
            coinSelect.setAttribute('aria-label', '选择站点提供的投币档位')
            const coinPlaceholder = document.createElement('option')
            coinPlaceholder.value = ''
            coinPlaceholder.textContent = '请选择档位'
            coinSelect.appendChild(coinPlaceholder)
            const selectedTiers = Array.isArray(selectedTarget?.tiers) ? selectedTarget.tiers : []
            for (const tier of [...new Set(selectedTiers.map(Number).filter((coin) => Number.isSafeInteger(coin) && coin > 0))]) {
              const option = document.createElement('option')
              option.value = String(tier)
              option.textContent = `${tier} 币`
              coinSelect.appendChild(option)
            }
            coinSelect.value = selectedTarget && selectedTiers.map(Number).includes(Number(choice.coin)) ? String(choice.coin) : ''
            coinSelect.disabled = !selectedTarget || coinSelect.options.length <= 1
            coinSelect.onchange = () => {
              record.userChoices ||= {}
              const selected = (actionContext.reactionTargets || []).find((target) => target.targetKey === record.userChoices[index]?.targetKey)
              const amount = Number(coinSelect.value)
              if (selected && Array.isArray(selected.tiers) && Number.isSafeInteger(amount) && selected.tiers.map(Number).includes(amount)) record.userChoices[index].coin = amount
              else delete record.userChoices[index].coin
              renderActionPlan(host, state, generation, record, onRegenerate)
            }
            coinLabel.appendChild(coinSelect)
            row.appendChild(coinLabel)
            const requestedCoin = explicitCoinFromCommand(record.command)
            if (selectedTarget && requestedCoin !== null && !selectedTiers.map(Number).includes(requestedCoin)) {
              const note = document.createElement('small')
              note.textContent = `你指定的 ${requestedCoin} 币不在此目标的站点档位中，请选择一个有效档位。`
              row.appendChild(note)
            }
          }
        }
        if (action?.permission === 'write') {
          const content = document.createElement('pre')
          content.setAttribute('data-ai-write-content', '')
          const parts = []
          if (typeof step.args.title === 'string') parts.push(`标题：${step.args.title}`)
          if (typeof step.args.body === 'string') parts.push(step.args.body)
          content.textContent = parts.join('\n\n')
          row.appendChild(content)
        }
        const status = document.createElement('small')
        status.textContent = record.steps[index]?.error
          ? `失败：${record.steps[index].error}`
          : ({ pending: '待执行', running: '执行中', checking: '正在检查站点…', interrupted: '结果未知', unknown: '结果未知', submitted: '已提交请求', cancelled: '已取消', completed: '已完成', failed: '失败', skipped: '未执行' }[row.dataset.state] || row.dataset.state)
        row.append(title, preview, args, status)
        if (record.results?.[index]) {
          const result = document.createElement('div')
          result.className = 'ai-workbench-action-result'
          result.textContent = String(record.results[index]?.label || record.results[index]?.kind || '动作已完成').slice(0, 180)
          row.appendChild(result)
          if (record.results[index]?.kind === 'navigation') {
            const href = internalActionPath(record.results[index].url)
            if (href) {
              const link = document.createElement('a')
              link.href = href
              link.textContent = '打开站内页面'
              row.appendChild(link)
            }
          }
          if (record.results[index]?.receipt && ['unknown', 'submission'].includes(record.results[index]?.kind) && record.steps[index]?.state !== 'checking') {
            const check = document.createElement('button')
            check.type = 'button'
            check.className = 'ai-workbench-btn'
            check.setAttribute('data-ai-action-check', String(index))
            check.textContent = '检查站点结果'
            check.onclick = () => void checkActionResult(state, host, generation, record, index)
            row.appendChild(check)
          }
        }
        list.appendChild(row)
      })
      host.appendChild(list)

      const status = document.createElement('div')
      status.setAttribute('data-ai-action-status', '')
      status.textContent = ({
        ready: '计划已生成，尚未执行。',
        regenerating: '正在重新生成计划…',
        running: '正在按顺序执行…',
        completed: '已完成。',
        partial: '部分完成 partial；后续步骤已停止。',
        failed: '执行失败，后续步骤已停止。',
        expired: '计划已过期，请重新生成。',
        cancelled: '计划已取消。',
        interrupted: record.write
          ? '写操作因刷新而中断，结果未知。请先检查站点是否已提交；不会自动重放。'
          : '动作因刷新而中断，不会自动重放。',
        unknown: '站点请求结果未知。请检查站点状态后再决定是否重新操作；工作台不会自动重试。',
        submitted: '已发出提交请求，请检查站点结果后再继续；不会自动重放。',
        checking: '正在读取站点结果…',
      }[record.status] || record.status)
      host.appendChild(status)

      const actions = document.createElement('div')
      actions.className = 'ai-workbench-actions'
      if (record.status === 'ready') {
        const execute = document.createElement('button')
        execute.type = 'button'
        execute.className = 'ai-workbench-btn ai-workbench-primary'
        execute.setAttribute('data-ai-action-execute', '')
        execute.textContent = '执行计划'
        execute.disabled = record.plan.steps.some((step, index) => {
          if (!REACTION_WRITE_ACTIONS.has(step.action)) return false
          const choice = record.userChoices?.[index] || {}
          const target = (actionContext.reactionTargets || []).find((item) => item.targetKey === choice.targetKey)
          if (!target) return true
          if (step.action === 'site.write-favorite-state') return target.type !== 'topic' || typeof target.favorited !== 'boolean'
          if (step.action === 'site.write-like-state') return target.liked !== true && target.liked !== false
          return !Array.isArray(target.tiers) || !target.tiers.map(Number).includes(Number(choice.coin))
        })
        execute.onclick = () => void executeActionIndexes(state, host, token, record.steps.map((step, index) => step.state === 'pending' ? index : -1).filter((index) => index >= 0), record, onRegenerate)
        actions.appendChild(execute)
        if (record.source === 'model') {
          const regenerate = document.createElement('button')
          regenerate.type = 'button'
          regenerate.className = 'ai-workbench-btn'
          regenerate.setAttribute('data-ai-action-regenerate', '')
          regenerate.textContent = '重新生成'
          regenerate.onclick = () => void onRegenerate?.(record.command)
          actions.appendChild(regenerate)
        }
        const cancel = document.createElement('button')
        cancel.type = 'button'
        cancel.className = 'ai-workbench-btn'
        cancel.setAttribute('data-ai-action-cancel', '')
        cancel.textContent = '取消'
        cancel.onclick = () => {
          record.status = 'cancelled'
          saveActionHistory(record)
          renderActionPlan(host, state, generation, record)
        }
        actions.appendChild(cancel)
      }
      if ((record.status === 'partial' || record.status === 'failed') && !record.write) {
        const retry = document.createElement('button')
        retry.type = 'button'
        retry.className = 'ai-workbench-btn ai-workbench-primary'
        retry.setAttribute('data-ai-action-retry-failed', '')
        retry.textContent = '仅重试失败步骤'
        retry.onclick = () => void executeActionIndexes(state, host, token, record.steps.map((step, index) => step.state === 'failed' ? index : -1).filter((index) => index >= 0), record)
        actions.appendChild(retry)
      }
      if (record.status === 'expired' && record.source === 'model') {
        const regenerate = document.createElement('button')
        regenerate.type = 'button'
        regenerate.className = 'ai-workbench-btn ai-workbench-primary'
        regenerate.setAttribute('data-ai-action-regenerate', '')
        regenerate.textContent = '重新生成计划'
        regenerate.onclick = () => void onRegenerate?.(record.command)
        actions.appendChild(regenerate)
      }
      if (actions.childElementCount) host.appendChild(actions)
    }

    function actionRecordCurrent(record) {
      return Boolean(record && (actionSession.records.get(record.id) === record || actionSession.record === record))
    }

    async function checkActionResult(state, host, token, record, index) {
      if (!record || !Number.isInteger(index) || !record.results?.[index]?.receipt || record.steps?.[index]?.state === 'checking') return
      if (!isAlive(state, host, token) || !actionRecordCurrent(record)) return
      const receipt = record.results[index].receipt
      record.steps[index].state = 'checking'
      recordActionPhase(record, { stage: 'action', state: 'active', summary: '正在只读读取站点结果；不会重发写请求' })
      renderActionPlan(host, state, token, record)
      let checked
      try {
        checked = await api.request('ai-write-actions:check-result', { receipt })
      } catch {
        checked = { outcome: 'unknown', status: 'check-failed', message: '检查站点结果失败；不会自动重试或重发写请求' }
      }
      if (!isAlive(state, host, token) || !actionRecordCurrent(record)) return
      const message = String(checked?.message || '').slice(0, 240)
      const result = { ...record.results[index] }
      delete result.receipt
      if (checked?.outcome === 'success') {
        record.steps[index].state = 'completed'
        record.steps[index].error = ''
        record.results[index] = { ...result, kind: 'completed', label: message || '已通过站点读取确认结果' }
        record.status = record.steps.every((step) => step.state === 'completed') ? 'completed' : 'partial'
        recordActionPhase(record, { stage: 'action', state: 'complete', summary: message || '已通过站点读取确认结果' })
      } else if (checked?.outcome === 'failure') {
        record.steps[index].state = 'failed'
        record.steps[index].error = message || '站点读取结果与预期不符'
        record.results[index] = { ...result, kind: 'failed', label: message || '站点读取结果与预期不符' }
        record.status = record.steps.some((step) => step.state === 'completed') ? 'partial' : 'failed'
        recordActionPhase(record, { stage: 'action', state: 'failed', summary: message || '站点读取结果与预期不符' })
      } else {
        record.steps[index].state = 'unknown'
        record.steps[index].error = ''
        record.results[index] = { ...result, kind: 'unknown', label: message || '仍无法确认站点结果；不会自动重试' }
        record.status = 'unknown'
        recordActionPhase(record, { stage: 'action', state: 'failed', summary: message || '仍无法确认站点结果；不会自动重试' })
      }
      saveActionHistory(record)
      renderActionPlan(host, state, token, record)
    }

    function actionPlanWithUserChoices(record) {
      const plan = api.util.clone(record?.plan)
      if (!plan || !Array.isArray(plan.steps)) return null
      for (let index = 0; index < plan.steps.length; index += 1) {
        const step = plan.steps[index]
        if (!REACTION_WRITE_ACTIONS.has(step.action)) continue
        const choice = record.userChoices?.[index] || {}
        const context = copilot.actionContext(record.command, record.targetScopeNonce ? { targetScopeNonce: record.targetScopeNonce } : {})
        const target = (context.reactionTargets || []).find((item) => item.targetKey === choice.targetKey)
        if (!target) return null
        step.args = { ...(step.args || {}), targetKey: String(choice.targetKey) }
        if (step.action === 'site.write-favorite-state' && (target.type !== 'topic' || typeof target.favorited !== 'boolean')) return null
        if (step.action === 'site.write-like-state' && target.liked !== true && target.liked !== false) return null
        if (step.action === 'site.write-coin') {
          const coin = Number(choice.coin)
          if (!Number.isSafeInteger(coin) || !Array.isArray(target.tiers) || !target.tiers.map(Number).includes(coin)) return null
          step.args.coin = coin
        } else {
          delete step.args.coin
        }
      }
      return plan
    }

    function recordActionPhase(record, event) {
      if (!record?.conversationId || !record?.turnId) return
      appendTurnPhase(record.conversationId, record.turnId, event)
    }

    function conversationIdForTurn(turnId) {
      return conversationHistory.conversations.find((item) => item.turns.some((turn) => turn.id === turnId))?.id || ''
    }

    function selectedActionTargetScope() {
      const turns = activeConversation()?.turns || []
      for (let index = turns.length - 1; index >= 0; index -= 1) {
        const turn = turns[index]
        if (turn.capability !== 'research') continue
        const view = researchViews.get(turn.id)
        if (!view) return { researchId: null, topicIds: [], postIds: [] }
        return {
          researchId: view.researchId || null,
          topicIds: [...view.actionTopicIds].filter((id) => view.candidates.has(id)).slice(0, 3),
          postIds: [...view.actionReplyIds].filter((id) => view.replyCandidates.has(id)).slice(0, 3),
        }
      }
      return { researchId: null, topicIds: [], postIds: [] }
    }

    function actionTargetScopeSignature(scope = {}) {
      return JSON.stringify({
        researchId: String(scope.researchId || ''),
        topicIds: [...new Set((scope.topicIds || []).map(Number))].sort((a, b) => a - b),
        postIds: [...new Set((scope.postIds || []).map(Number))].sort((a, b) => a - b),
      })
    }

    function createChatActionRecord(turn, plan, previews, source, { targetScopeNonce = '', targetScope = { researchId: null, topicIds: [], postIds: [] } } = {}) {
      const conversationId = conversationIdForTurn(turn.id)
      const command = String(turn.question || '').slice(0, INPUT_MAX_CHARS)
      const scopeOptions = targetScopeNonce ? { targetScopeNonce } : {}
      const context = copilot.actionContext(command, scopeOptions)
      const route = context.route
      return {
        id: turn.id,
        conversationId,
        turnId: turn.id,
        traceFlowId: turn.traceFlowId || turn.id,
        command,
        plan,
        previews,
        source,
        write: plan.steps.some((step) => {
          const checked = api.ai.validate(step, context, { requireActionBinding: true })
          return checked.ok && checked.action.permission === 'write'
        }),
        targetScopeNonce,
        targetScope,
        targetScopeSignature: actionTargetScopeSignature(targetScope),
        userChoices: {},
        routeFingerprint: routeFingerprint(route),
        status: 'ready',
        steps: plan.steps.map(() => ({ state: 'pending', error: '' })),
        results: [],
        ts: Date.now(),
      }
    }

    function restoredChatActionRecord(turn) {
      const existing = actionSession.records.get(turn.id)
      if (existing) return existing
      const saved = actionSession.history.find((item) => item.id === turn.id)
      if (!saved) return null
      const command = String(saved.command || turn.question || '').slice(0, INPUT_MAX_CHARS)
      const actionContext = copilot.actionContext(command)
      const isExpired = routeFingerprint(actionContext.route) !== saved.routeFingerprint
      const validation = api.ai.validatePlan(saved.plan, actionContext, { requireActionBinding: true })
      const expired = saved.status === 'ready' && (isExpired || !validation.ok)
      const plan = validation.ok ? validation.plan : saved.plan
      const record = {
        ...saved,
        conversationId: conversationIdForTurn(turn.id),
        turnId: turn.id,
        command,
        plan,
        previews: plan.steps.map((step) => api.ai.preview(step, actionContext)),
        source: saved.source || 'model',
        results: [],
        status: expired ? 'expired' : saved.status,
        steps: saved.steps.map((step) => ({ ...step })),
      }
      if (expired) {
        record.steps.forEach((step) => { if (step.state === 'pending' || step.state === 'running') step.state = 'skipped' })
        saveActionHistory(record)
      }
      actionSession.records.set(record.id, record)
      actionSession.record = record
      return record
    }

    function renderTurnActionControls(host, state, turn, token) {
      host.replaceChildren()
      const planHost = document.createElement('div')
      planHost.setAttribute('data-ai-action-plan', '')
      host.appendChild(planHost)
      const record = restoredChatActionRecord(turn)
      if (record) renderActionPlan(planHost, state, token, record, () => regenerateChatAction(state, turn, record))

      const details = document.createElement('details')
      details.className = 'ai-workbench-local-action-details'
      const summary = document.createElement('summary')
      summary.textContent = '本地动作目录'
      details.appendChild(summary)
      const description = document.createElement('p')
      description.className = 'ai-workbench-desc'
      description.textContent = '计划只使用当前页面已登记的动作。写操作会显示完整内容，并在执行计划后由动作提供方再次确认。'
      details.appendChild(description)
      const catalogHost = document.createElement('div')
      catalogHost.innerHTML = '<label class="ai-workbench-field">动作<select data-ai-action-select></select></label><div data-ai-action-fields></div><button type="button" class="ai-workbench-btn" data-ai-action-local-plan>建立单步计划</button><div data-ai-action-message></div>'
      details.appendChild(catalogHost)
      const historyHost = document.createElement('div')
      historyHost.className = 'ai-workbench-action-history'
      historyHost.setAttribute('data-ai-action-history', '')
      if (actionSession.history.length) {
        const title = document.createElement('strong')
        title.textContent = `最近计划（${actionSession.history.length}）`
        historyHost.appendChild(title)
        for (const item of actionSession.history.slice(0, 5)) {
          const row = document.createElement('div')
          row.textContent = `${item.command || item.plan.summary} · ${item.status}`
          historyHost.appendChild(row)
        }
      }
      details.appendChild(historyHost)
      host.appendChild(details)

      const catalog = api.ai.actions({ route: copilot.actionContext(turn.question).route })
      const select = catalogHost.querySelector('[data-ai-action-select]')
      for (const action of catalog) {
        const option = document.createElement('option')
        option.value = action.id
        option.textContent = `${action.label} · ${action.id}`
        select.appendChild(option)
      }
      if (!catalog.length) {
        const option = document.createElement('option')
        option.value = ''
        option.textContent = '当前页面没有可用动作'
        select.appendChild(option)
      }
      const fieldsHost = catalogHost.querySelector('[data-ai-action-fields]')
      const renderFields = () => {
        fieldsHost.replaceChildren()
        const action = catalog.find((item) => item.id === select.value)
        for (const [key, schema] of Object.entries(action?.args || {})) {
          const label = document.createElement('label')
          label.className = 'ai-workbench-field'
          label.append(document.createTextNode(key))
          let control
          if (schema.type === 'enum') {
            control = document.createElement('select')
            if (schema.optional) {
              const empty = document.createElement('option')
              empty.value = ''
              empty.textContent = '不指定'
              control.appendChild(empty)
            }
            for (const value of schema.values || []) {
              const option = document.createElement('option')
              option.value = value
              option.textContent = value
              control.appendChild(option)
            }
          } else {
            control = document.createElement('input')
            control.type = schema.type === 'number' ? 'number' : schema.type === 'boolean' ? 'checkbox' : 'text'
            if (schema.min != null) control.min = String(schema.min)
            if (schema.max != null) control.max = String(schema.max)
            if (schema.maxLength != null) control.maxLength = Number(schema.maxLength)
          }
          control.setAttribute('data-ai-action-arg', key)
          if (schema.optional) control.dataset.optional = 'true'
          label.appendChild(control)
          fieldsHost.appendChild(label)
        }
      }
      select.onchange = renderFields
      renderFields()
      catalogHost.querySelector('[data-ai-action-local-plan]').onclick = () => {
        const action = catalog.find((item) => item.id === select.value)
        if (!action) return
        const args = {}
        for (const control of fieldsHost.querySelectorAll('[data-ai-action-arg]')) {
          const key = control.getAttribute('data-ai-action-arg')
          if (control.dataset.optional === 'true' && !control.value) continue
          const schema = action.args[key]
          args[key] = schema.type === 'number' ? Number(control.value) : schema.type === 'boolean' ? control.checked : control.value
        }
        const step = { action: action.id, args }
        const actionContext = copilot.actionContext(turn.question)
        const preview = api.ai.preview(step, actionContext)
        const message = catalogHost.querySelector('[data-ai-action-message]')
        if (!preview.ok) {
          message.textContent = `参数无效：${preview.error?.message || preview.error?.code || '校验失败'}`
          return
        }
        const checked = api.ai.validatePlan({ version: 1, summary: preview.text, steps: [step] }, actionContext)
        if (!checked.ok) {
          message.textContent = `计划无效：${checked.errors[0]?.message || checked.errors[0]?.code}`
          return
        }
        const record = createChatActionRecord(turn, checked.plan, [preview], 'local')
        actionSession.record = record
        actionSession.records.set(record.id, record)
        saveActionHistory(record)
        saveTurnAnswer(record.conversationId, record.turnId, `已建立本地操作计划：${preview.text}。请检查后确认执行。`, 'complete')
        recordActionPhase(record, { stage: 'action', state: 'active', summary: '本地计划等待确认' })
        if (conversationHistory.activeId === record.conversationId) renderChatMessages(state)
      }
    }

    function internalActionPath(value) {
      const path = String(value || '')
      if (!/^\/(?!\/)/.test(path) || /[\u0000-\u001f\u007f]/.test(path)) return ''
      try {
        const url = new URL(path, location.origin)
        return url.origin === location.origin ? `${url.pathname}${url.search}${url.hash}` : ''
      } catch {
        return ''
      }
    }

    async function executeActionIndexes(state, host, token, indexes, suppliedRecord = actionSession.record, regenerate = null) {
      const record = suppliedRecord
      if (!record || !indexes.length || ['running', 'regenerating'].includes(record.status)) return
      const targetScopeNow = selectedActionTargetScope()
      if (record.targetScopeNonce && actionTargetScopeSignature(targetScopeNow) !== record.targetScopeSignature) {
        record.status = 'expired'
        record.steps.forEach((step) => { if (step.state === 'pending') step.state = 'skipped' })
        saveActionHistory(record)
        recordActionPhase(record, { stage: 'action', state: 'failed', summary: '互动目标选择已变化，计划已过期' })
        renderActionPlan(host, state, generation, record, regenerate)
        return
      }
      const scopeOptions = record.targetScopeNonce ? { targetScopeNonce: record.targetScopeNonce } : {}
      const currentContext = copilot.actionContext(record.command, scopeOptions)
      if (routeFingerprint(currentContext.route) !== record.routeFingerprint) {
        record.status = 'expired'
        saveActionHistory(record)
        recordActionPhase(record, { stage: 'action', state: 'failed', summary: '页面已变化，计划已过期' })
        renderActionPlan(host, state, generation, record, regenerate)
        return
      }
      const selectedPlan = actionPlanWithUserChoices(record)
      if (!selectedPlan) {
        record.status = 'expired'
        record.steps.forEach((step) => { if (step.state === 'pending') step.state = 'skipped' })
        saveActionHistory(record)
        recordActionPhase(record, { stage: 'action', state: 'failed', summary: '互动目标或投币档位未确认或已失效' })
        renderActionPlan(host, state, generation, record, regenerate)
        return
      }
      const validated = api.ai.validatePlan(selectedPlan, currentContext, { requireActionBinding: true })
      if (!validated.ok) {
        record.status = 'expired'
        record.steps.forEach((step) => { if (step.state === 'pending') step.state = 'skipped' })
        saveActionHistory(record)
        recordActionPhase(record, { stage: 'action', state: 'failed', summary: '本地动作校验未通过' })
        renderActionPlan(host, state, generation, record, regenerate)
        return
      }
      const runToken = generation
      record.status = 'running'
      recordActionPhase(record, {
        stage: 'action', state: 'active',
        summary: record.write ? '正在执行已确认的写动作；动作提供方仍会再次确认' : '正在执行已确认的只读计划',
      })
      for (const index of indexes) {
        if (!isAlive(state, host, runToken) || !actionRecordCurrent(record)) return
        const step = validated.plan.steps[index]
        const freshContext = copilot.actionContext(record.command, scopeOptions)
        // Bind the action provider's trace to the conversation turn. This value is
        // ephemeral context only and is never written to action history.
        freshContext.flowId = String(record.traceFlowId || record.turnId || record.id || '').slice(0, 100)
        if (routeFingerprint(freshContext.route) !== record.routeFingerprint) {
          record.status = 'expired'
          record.steps[index].state = 'skipped'
          break
        }
        const checked = api.ai.validate(step, freshContext, { requireActionBinding: true })
        if (!checked.ok) {
          record.status = 'expired'
          record.steps[index].state = 'skipped'
          record.steps[index].error = String(checked.error?.message || checked.error?.code || '动作已不可用').slice(0, 240)
          break
        }
        record.steps[index].state = 'running'
        record.steps[index].error = ''
        saveActionHistory(record)
        renderActionPlan(host, state, runToken, record, regenerate)
        try {
          const result = await api.ai.execute(step, freshContext)
          if (!isAlive(state, host, runToken) || !actionRecordCurrent(record)) return
          if (result?.kind === 'cancelled') {
            record.steps[index].state = 'cancelled'
            record.results[index] = result
            record.status = 'cancelled'
            saveActionHistory(record)
            recordActionPhase(record, { stage: 'action', state: 'cancelled', summary: '你取消了第二次确认，没有提交写入' })
            renderActionPlan(host, state, runToken, record, regenerate)
            return
          }
          if (result?.kind === 'failed') {
            record.steps[index].state = 'failed'
            record.steps[index].error = String(result.label || result.message || '站点明确拒绝了本次操作').slice(0, 240)
            record.results[index] = result
            for (const later of indexes) {
              if (later > index && record.steps[later].state === 'pending') record.steps[later].state = 'skipped'
            }
            record.status = record.steps.some((item) => item.state === 'completed') ? 'partial' : 'failed'
            saveActionHistory(record)
            recordActionPhase(record, { stage: 'action', state: 'failed', summary: '站点拒绝了操作，后续步骤已停止' })
            renderActionPlan(host, state, runToken, record, regenerate)
            return
          }
          if (result?.kind === 'submission') {
            record.steps[index].state = 'submitted'
            record.results[index] = result
            record.status = 'submitted'
            saveActionHistory(record)
            recordActionPhase(record, { stage: 'action', state: 'complete', summary: '提交请求已发出，结果需在站点确认' })
            renderActionPlan(host, state, runToken, record, regenerate)
            return
          }
          if (result?.kind === 'unknown') {
            record.steps[index].state = 'unknown'
            record.results[index] = result
            record.status = 'unknown'
            saveActionHistory(record)
            recordActionPhase(record, { stage: 'action', state: 'failed', summary: '站点请求结果未知，请检查站点；不会自动重试' })
            renderActionPlan(host, state, runToken, record, regenerate)
            return
          }
          const navigationHref = result?.kind === 'navigation' ? internalActionPath(result.url) : ''
          if (result?.kind === 'navigation' && (index !== record.steps.length - 1 || !navigationHref)) {
            throw new Error(index !== record.steps.length - 1 ? '导航动作必须位于计划末尾' : '动作返回了不安全的站内路径')
          }
          record.steps[index].state = 'completed'
          record.results[index] = result
          record.steps[index].error = ''
          saveActionHistory(record)
          recordActionPhase(record, { stage: 'action', state: 'active', summary: `第 ${index + 1} 步已完成` })
          renderActionPlan(host, state, runToken, record, regenerate)
          if (result?.kind === 'navigation') {
            record.status = 'completed'
            saveActionHistory(record)
            try {
              location.assign(navigationHref)
            } catch {
              /* browsers navigate; test DOMs may not implement navigation */
            }
            return
          }
        } catch (error) {
          if (!isAlive(state, host, runToken) || !actionRecordCurrent(record)) return
          record.steps[index].state = 'failed'
          record.steps[index].error = String(error?.message || error || '动作执行失败').slice(0, 240)
          for (const later of indexes) {
            if (later > index && record.steps[later].state === 'pending') record.steps[later].state = 'skipped'
          }
          record.status = record.steps.some((item) => item.state === 'completed') ? 'partial' : 'failed'
          saveActionHistory(record)
          recordActionPhase(record, { stage: 'action', state: 'failed', summary: '操作失败，后续步骤已停止' })
          renderActionPlan(host, state, runToken, record, regenerate)
          return
        }
      }
      if (record.status !== 'expired') {
        record.status = record.steps.every((step) => step.state === 'completed') ? 'completed' : 'partial'
      }
      saveActionHistory(record)
      if (record.status === 'completed') recordActionPhase(record, { stage: 'action', state: 'complete', summary: record.write ? '写动作已完成' : '只读计划已执行完成' })
      if (isAlive(state, host, runToken)) renderActionPlan(host, state, runToken, record, regenerate)
    }

    function routeContextKind() {
      return api.page.type === 'topic' ? 'current-topic' : 'current-page'
    }

    function contextHint(kind = mounted?.contextKind || routeContextKind()) {
      const ctx = context()
      if (kind === 'active-tracking') return '范围：所有主题的活动追踪项；归档项不包含在内。'
      if (ctx.route?.type === 'topic' && ctx.currentTopic) {
        return `当前帖子：${String(ctx.currentTopic.title || `主题 #${ctx.route.id}`).slice(0, 120)} · ${ctx.currentPosts?.length || 0} 个可见楼层`
      }
      return `当前页面：${String(ctx.route?.type || '普通页面')} · 可查询所有主题的活动追踪项。`
    }

    function phaseLabel(stage) {
      return ({
        understand: '理解请求',
        context: '读取上下文',
        plan: '生成受限计划',
        local: '本地筛选与校验',
        answer: '整理回答',
        evidence: '验证证据',
        action: '站内操作',
      }[stage] || '处理阶段')
    }

    function conversationCitationHref(citation) {
      const topicId = Number(citation?.topicId)
      const floor = Number(citation?.floor)
      const postId = String(citation?.postId || '').replace(/[^0-9]/g, '')
      if (citation?.kind === 'topic') return Number.isSafeInteger(topicId) && topicId > 0 ? api.routes.topic(topicId) : ''
      if (!citation || topicId <= 0 || floor <= 0 || !postId) return ''
      return safeHref(`/topic/${topicId}?floor=${floor}#post-${postId}`)
    }

    function setChatCapability(state, capability) {
      state.capability = CAPABILITIES.has(capability) ? capability : 'ask'
      if (state.capability === 'tracking') state.contextKind = 'active-tracking'
      else if (['topic-ask', 'disagreement', 'comparison', 'unresolved', 'new-replies', 'draft'].includes(state.capability)) state.contextKind = 'current-topic'
      else state.contextKind = routeContextKind()
      const label = state.root?.querySelector('[data-ai-chat-smart]')
      if (label) {
        label.textContent = 'Smart⌄'
        label.setAttribute('aria-label', `选择能力，当前为${CAPABILITY_LABELS[state.capability] || CAPABILITY_LABELS.ask}`)
      }
      for (const item of state.root?.querySelectorAll('[data-ai-chat-capability]') || []) {
        item.toggleAttribute('data-selected', item.getAttribute('data-ai-chat-capability') === state.capability)
        item.setAttribute('aria-checked', String(item.getAttribute('data-ai-chat-capability') === state.capability))
      }
      const mode = state.root?.querySelector('[data-ai-chat-mode]')
      if (mode && mode.value !== state.capability) {
        mode.value = state.capability
        mode.dispatchEvent(new Event('change'))
      }
      const contextSelect = state.root?.querySelector('[data-ai-chat-context]')
      if (contextSelect) contextSelect.value = state.contextKind
      const banner = state.root?.querySelector('[data-ai-chat-context-hint]')
      if (banner) banner.textContent = contextHint(state.contextKind)
      renderChatModeOptions(state)
    }

    function setChatBusy(state, busy) {
      state.busy = Boolean(busy)
      const button = state.root?.querySelector('[data-ai-chat-send]')
      const input = state.root?.querySelector('[data-ai-chat-input]')
      if (button) {
        button.disabled = false
        button.textContent = state.busy ? '×' : '↑'
        button.setAttribute('aria-label', state.busy ? '停止生成' : '发送')
        button.dataset.busy = state.busy ? 'true' : 'false'
        if (state.busy && state.request) button.setAttribute('data-ai-chat-stop', '')
        else button.removeAttribute('data-ai-chat-stop')
      }
      if (input) input.disabled = state.busy
    }

    function traceStageLabel(stage) {
      return ({
        plan: '生成受限计划',
        scope: '读取上下文',
        read: '本地筛选与校验',
        validate: '验证证据',
        answer: '整理回答',
        execute: '站内操作',
        check: '核验结果',
        limit: '范围限制',
      }[stage] || '处理阶段')
    }

    function traceLegacyStage(stage) {
      return ({ plan: 'plan', scope: 'context', read: 'local', validate: 'evidence', answer: 'answer', execute: 'action' }[stage] || stage)
    }

    function renderTrace(host, trace, { compact = false } = {}) {
      const rows = Array.isArray(trace) ? trace : []
      const details = document.createElement('details')
      details.className = 'ai-workbench-chat-process'
      details.setAttribute('data-ai-chat-process', '')
      details.setAttribute('data-ai-trace', '')
      const active = !compact && rows.some((event) => ['pending', 'active'].includes(event.state))
      details.open = active
      const summary = document.createElement('summary')
      const doneCount = rows.filter((event) => event.state === 'complete').length
      const latest = [...rows].reverse().find((event) => ['active', 'complete', 'failed', 'unknown', 'skipped'].includes(event.state))
      const latestSummary = latest
        ? clipText(`${traceStageLabel(latest.stage)}：${latest.summary}`, 96).text
        : '等待开始'
      const readCount = rows.reduce((sum, event) => sum + Number(event.counts?.read || 0), 0)
      const citationCount = rows.reduce((sum, event) => sum + Number(event.counts?.citations || 0), 0)
      summary.textContent = active
        ? `正在处理 · ${latest ? latestSummary : `${doneCount} 步已完成`}`
        : `处理过程 · ${latestSummary}${readCount || citationCount ? ` · 读取 ${readCount} · 引用 ${citationCount}` : ''}`
      details.appendChild(summary)
      const list = document.createElement('ol')
      list.className = 'ai-workbench-chat-phases'
      for (const event of rows) {
        const item = document.createElement('li')
        item.setAttribute('data-ai-trace-event', event.id)
        item.setAttribute('data-ai-chat-phase', traceLegacyStage(event.stage))
        item.dataset.state = event.state
        const label = document.createElement('strong')
        label.textContent = traceStageLabel(event.stage)
        const description = document.createElement('span')
        description.textContent = event.summary
        item.append(label, description)
        const evidence = document.createElement('details')
        evidence.setAttribute('data-ai-trace-details', '')
        evidence.open = !compact && (active || event.state === 'active' || event.state === 'pending')
        const evidenceSummary = document.createElement('summary')
        evidenceSummary.textContent = event.state === 'unknown' ? '结果未知' : event.evidence === 'verified' ? '已验证详情' : '查看阶段详情'
        evidence.appendChild(evidenceSummary)
        const evidenceBody = document.createElement('div')
        evidenceBody.textContent = `${event.summary} · 状态：${event.state} · 读取 ${event.counts?.read || 0} · 引用 ${event.counts?.citations || 0}`
        if (event.reasonCode) evidenceBody.textContent += ` · ${event.reasonCode}`
        if (event.citations?.length) evidenceBody.textContent += ` · ${event.citations.join('、')}`
        evidence.appendChild(evidenceBody)
        item.appendChild(evidence)
        list.appendChild(item)
      }
      if (!rows.length) {
        const item = document.createElement('li')
        item.dataset.state = 'active'
        item.textContent = '等待开始'
        list.appendChild(item)
      }
      details.appendChild(list)
      host.appendChild(details)
      return details
    }

    function renderChatPhaseTimeline(host, turn) {
      const trace = Array.isArray(turn.trace) && turn.trace.length
        ? turn.trace
        : (turn.phases || []).map((phase, index) => traceFromLegacyPhase(phase, turn.traceFlowId || turn.id, `${turn.id}:render:${index}`)).filter(Boolean)
      renderTrace(host, trace, { compact: turn.state !== 'pending' })
    }

    function chatRetry(state, turn, revisionReason = '') {
      const button = document.createElement('button')
      button.type = 'button'
      button.className = 'ai-workbench-btn'
      button.setAttribute('data-ai-chat-retry', '')
      button.textContent = '重试'
      button.onclick = () => {
        if (state.busy) return
        const input = state.root.querySelector('[data-ai-chat-input]')
        setChatCapability(state, turn.capability)
        state.contextKind = turn.context.kind
        const contextSelect = state.root.querySelector('[data-ai-chat-context]')
        if (contextSelect) contextSelect.value = state.contextKind
        input.value = turn.question
        updateConversationTurn(conversationIdForTurn(turn.id), turn.id, { state: 'pending', phases: [], trace: [] })
        input.value = ''
        const conversationId = conversationIdForTurn(turn.id)
        const token = beginReadRequest(state, conversationId, findTurn(conversationId, turn.id), true)
        token.revisionReason = REVISION_REASONS.has(revisionReason) ? revisionReason : ''
        renderChatModeOptions(state)
        renderChatMessages(state)
        void dispatchChatTurn(state, conversationId, turn.id, token)
      }
      return button
    }

    function researchCandidate(raw) {
      const id = Number(raw?.id)
      if (!Number.isSafeInteger(id) || id <= 0) return null
      return {
        id,
        title: String(raw?.title || ''),
        authorName: String(raw?.authorName || ''),
        forumName: String(raw?.forumName || ''),
        replies: raw?.replies != null && Number.isFinite(Number(raw.replies)) ? Math.max(0, Number(raw.replies)) : null,
        lastActiveTs: Number.isFinite(Number(raw?.lastActiveTs)) ? Number(raw.lastActiveTs) : 0,
        pinned: Boolean(raw?.pinned),
        sourceFields: [...new Set((Array.isArray(raw?.sourceFields) ? raw.sourceFields : []).filter((field) => RESEARCH_FIELDS.has(field)))],
      }
    }

    function researchReplyCandidate(raw) {
      const postId = Number(raw?.postId)
      const topicId = Number(raw?.topicId)
      const topicTitle = String(raw?.topicTitle || '').trim().slice(0, 240)
      if (!Number.isSafeInteger(postId) || postId <= 0 || !Number.isSafeInteger(topicId) || topicId <= 0 || !topicTitle) return null
      return { postId, topicId, topicTitle }
    }

    function mergeResearchReplyCandidates(view, rows) {
      for (const raw of Array.isArray(rows) ? rows : []) {
        const candidate = researchReplyCandidate(raw)
        if (!candidate) continue
        const previous = view.replyCandidates.get(candidate.postId)
        if (!previous) view.replyCandidates.set(candidate.postId, candidate)
        else if (previous.topicId !== candidate.topicId) view.statusMessage = '站点返回了冲突的回帖目标；冲突项已忽略。'
      }
    }

    function mergeResearchCandidates(view, rows) {
      for (const raw of Array.isArray(rows) ? rows : []) {
        const candidate = researchCandidate(raw)
        if (!candidate) continue
        const previous = view.candidates.get(candidate.id)
        if (previous) {
          previous.sourceFields = [...new Set([...previous.sourceFields, ...candidate.sourceFields])]
          if (!previous.title && candidate.title) previous.title = candidate.title
          if (!previous.authorName && candidate.authorName) previous.authorName = candidate.authorName
          if (!previous.forumName && candidate.forumName) previous.forumName = candidate.forumName
          previous.replies = Math.max(previous.replies, candidate.replies)
          previous.lastActiveTs = Math.max(previous.lastActiveTs, candidate.lastActiveTs)
          previous.pinned ||= candidate.pinned
        } else view.candidates.set(candidate.id, candidate)
      }
    }

    function mergeResearchPageStates(view, rows) {
      for (const raw of Array.isArray(rows) ? rows : []) {
        const topicId = Number(raw?.topicId)
        if (!Number.isSafeInteger(topicId) || topicId <= 0 || !view.candidates.has(topicId)) continue
        const currentPage = Number(raw.currentPage)
        const nextPage = Number(raw.nextPage)
        view.pageStates.set(topicId, {
          topicId,
          currentPage: Number.isSafeInteger(currentPage) && currentPage >= 0 ? currentPage : 0,
          nextPage: Number.isSafeInteger(nextPage) && nextPage > 0 ? nextPage : 1,
          hasNext: Boolean(raw.hasNext),
          truncated: Boolean(raw.truncated),
          failedPage: Number.isSafeInteger(Number(raw.failedPage)) && Number(raw.failedPage) > 0 ? Number(raw.failedPage) : null,
        })
      }
    }

    function expectedResearchSource(question, requestedSource) {
      if (requestedSource !== 'auto') return requestedSource
      const asksForOwnData = /(?:我的|我自己的|本人|我发布|我发过|我发的|自己发布|自己发的)/.test(String(question || ''))
      if (!asksForOwnData) return 'site-search'
      if (/回帖/.test(String(question || ''))) return 'my-replies'
      return /收藏/.test(String(question || '')) ? 'my-favorites' : 'my-topics'
    }

    function renderResearchView(host, state, turn, view) {
      host.replaceChildren()
      if (view.answer) {
        if (turn.state !== 'complete') {
          const previous = document.createElement('small')
          previous.textContent = '此前已验证的回答：'
          host.appendChild(previous)
        }
        const recordHost = document.createElement('div')
        host.appendChild(recordHost)
        renderRecord(recordHost, { text: view.answer.text, meta: { citations: view.answer.citations } }, state, generation)
        const status = document.createElement('div')
        status.className = 'ai-workbench-desc'
        status.textContent = view.status === 'partial'
          ? view.answerKind === 'replies' ? '部分回帖读取失败；回答仅基于成功读取的所选回帖。' : '部分主题读取失败；回答仅基于已成功读取的主题。'
          : view.status === 'empty'
            ? view.answerKind === 'replies' ? '所选回帖均未能读取，已跳过 AI 回答。' : '所选主题均未能读取，已跳过 AI 回答。'
            : view.answerKind === 'replies' ? '已读取所选回帖。' : '已读取所选主题。'
        host.appendChild(status)
      }
      if (view.statusMessage) {
        const message = document.createElement('div')
        message.className = 'ai-workbench-desc'
        message.setAttribute('data-ai-research-status', '')
        message.textContent = view.statusMessage
        host.appendChild(message)
      }
      if (view.loading) {
        const loading = document.createElement('div')
        loading.className = 'ai-workbench-wait'
        loading.textContent = '正在检索…'
        host.appendChild(loading)
        return
      }
      if (view.source === 'my-replies') {
        renderResearchReplyCandidates(host, state, turn, view)
        return
      }
      const toolbar = document.createElement('div')
      toolbar.className = 'ai-workbench-actions'
      const fieldLabel = document.createElement('label')
      fieldLabel.className = 'ai-workbench-field'
      fieldLabel.append('搜索字段')
      const field = document.createElement('select')
      field.setAttribute('data-ai-research-field', '')
      for (const [value, label] of [['title', '标题'], ['body', '正文'], ['reply', '回帖']]) {
        const option = document.createElement('option')
        option.value = value
        option.textContent = label
        option.disabled = view.source === 'my-topics' || view.source === 'my-favorites' ? value !== 'title' : false
        field.appendChild(option)
      }
      field.value = RESEARCH_FIELDS.has(view.field) ? view.field : 'title'
      if (field.selectedOptions[0]?.disabled) field.value = 'title'
      field.disabled = view.source === 'my-topics' || view.source === 'my-favorites'
      field.onchange = () => {
        const selectedField = RESEARCH_FIELDS.has(field.value) ? field.value : 'title'
        void loadResearchPage(state, turn, view, selectedField, 1)
      }
      fieldLabel.appendChild(field)
      toolbar.appendChild(fieldLabel)
      const next = document.createElement('button')
      next.type = 'button'
      next.className = 'ai-workbench-btn'
      next.setAttribute('data-ai-research-next', '')
      next.textContent = '下一页'
      next.disabled = !view.hasNext
      next.onclick = () => {
        const page = Number.isInteger(view.nextPage) && view.nextPage > view.page ? view.nextPage : view.page + 1
        void loadResearchPage(state, turn, view, view.field, page)
      }
      toolbar.appendChild(next)
      const read = document.createElement('button')
      read.type = 'button'
      read.className = 'ai-workbench-btn ai-workbench-primary'
      read.setAttribute('data-ai-research-read', '')
      read.textContent = '读取所选主题'
      read.disabled = view.selectedIds.size === 0 || Boolean(view.reading)
      read.onclick = () => void readResearchSelection(state, turn, view)
      toolbar.appendChild(read)
      host.appendChild(toolbar)

      const selected = document.createElement('div')
      selected.className = 'ai-workbench-desc'
      selected.setAttribute('data-ai-research-selection-status', '')
      selected.textContent = `已选择 ${view.selectedIds.size}/3 篇正文来源；操作目标 ${view.actionTopicIds.size}/3 篇。回复计划只选一个目标；选中楼层只作草稿上下文，实际回复发到所属主题。`
      host.appendChild(selected)
      if (view.pageStates.size) {
        const pagesHost = document.createElement('div')
        pagesHost.setAttribute('data-ai-research-pages', '')
        for (const topicId of view.selectedIds) {
          const pageState = view.pageStates.get(topicId)
          const candidate = view.candidates.get(topicId)
          if (!pageState || !candidate) continue
          const row = document.createElement('div')
          row.className = 'ai-workbench-local-action-details'
          row.setAttribute('data-ai-research-page', String(topicId))
          const label = document.createElement('div')
          label.textContent = `${candidate.title || `主题 #${topicId}`} · 已读取到第 ${pageState.currentPage} 页${pageState.truncated ? ' · 部分内容已截断' : ''}`
          row.appendChild(label)
          const pageError = view.pageErrors.get(topicId)
          if (pageError) {
            const error = document.createElement('div')
            error.className = 'ai-workbench-desc'
            error.setAttribute('data-ai-research-page-status', String(topicId))
            error.textContent = `第 ${pageState.failedPage || pageState.nextPage} 页读取失败：${pageError}`
            row.appendChild(error)
          } else if (pageState.failedPage) {
            const error = document.createElement('div')
            error.className = 'ai-workbench-desc'
            error.setAttribute('data-ai-research-page-status', String(topicId))
            error.textContent = `第 ${pageState.failedPage} 页读取失败，可手动重试。`
            row.appendChild(error)
          }
          if (pageState.hasNext) {
            const readPage = document.createElement('button')
            readPage.type = 'button'
            readPage.className = 'ai-workbench-btn'
            readPage.setAttribute('data-ai-research-read-page', String(topicId))
            readPage.textContent = `读取主题 #${topicId} 第 ${pageState.nextPage} 页`
            readPage.disabled = view.loadingPages.has(topicId) || view.reading
            readPage.onclick = () => void readResearchTopicPage(state, turn, view, topicId)
            row.appendChild(readPage)
          }
          pagesHost.appendChild(row)
        }
        host.appendChild(pagesHost)
      }
      const list = document.createElement('div')
      list.setAttribute('data-ai-research-candidates', '')
      for (const candidate of view.candidates.values()) {
        const card = document.createElement('article')
        card.className = 'ai-workbench-local-action-details'
        card.setAttribute('data-ai-research-candidate', String(candidate.id))
        const title = document.createElement('a')
        title.href = safeHref(api.routes.topic(candidate.id))
        title.textContent = candidate.title || `主题 #${candidate.id}`
        const meta = document.createElement('div')
        meta.className = 'ai-workbench-desc'
        meta.textContent = [candidate.authorName, candidate.forumName, `${candidate.replies ?? '?'} 回复`, candidate.pinned ? '置顶' : '', candidate.lastActiveTs ? `活跃时间 ${new Date(candidate.lastActiveTs * 1000).toLocaleDateString()}` : ''].filter(Boolean).join(' · ')
        const sourceFields = document.createElement('small')
        sourceFields.textContent = `命中字段：${candidate.sourceFields.map((item) => ({ title: '标题', body: '正文', reply: '回帖' })[item]).join('、') || '未知'}`
        const chooseLabel = document.createElement('label')
        chooseLabel.className = 'ai-workbench-chat-option'
        const checkbox = document.createElement('input')
        checkbox.type = 'checkbox'
        checkbox.setAttribute('data-ai-research-select', '')
        checkbox.checked = view.selectedIds.has(candidate.id)
        checkbox.onchange = () => {
          if (checkbox.checked && !view.selectedIds.has(candidate.id) && view.selectedIds.size >= 3) {
            checkbox.checked = false
            view.statusMessage = '最多选择 3 篇主题；请先取消一篇已选主题。'
          } else {
            if (checkbox.checked) view.selectedIds.add(candidate.id)
            else view.selectedIds.delete(candidate.id)
            view.statusMessage = ''
          }
          if (conversationHistory.activeId === conversationIdForTurn(turn.id)) renderChatMessages(state)
        }
        chooseLabel.append(checkbox, '选择')
        const actionLabel = document.createElement('label')
        actionLabel.className = 'ai-workbench-chat-option'
        const actionCheckbox = document.createElement('input')
        actionCheckbox.type = 'checkbox'
        actionCheckbox.setAttribute('data-ai-research-target-topic', '')
        actionCheckbox.checked = view.actionTopicIds.has(candidate.id)
        actionCheckbox.onchange = () => {
          if (actionCheckbox.checked && !view.actionTopicIds.has(candidate.id) && view.actionTopicIds.size >= 3) {
            actionCheckbox.checked = false
            view.statusMessage = '最多选择 3 篇互动目标；请先取消一篇已选目标。'
          } else {
            if (actionCheckbox.checked) view.actionTopicIds.add(candidate.id)
            else view.actionTopicIds.delete(candidate.id)
            view.statusMessage = ''
          }
          if (conversationHistory.activeId === conversationIdForTurn(turn.id)) renderChatMessages(state)
        }
        actionLabel.append(actionCheckbox, '作为操作目标（回复只选一个）')
        card.append(title, meta, sourceFields, chooseLabel, actionLabel)
        list.appendChild(card)
      }
      if (!view.candidates.size) {
        const empty = document.createElement('div')
        empty.className = 'ai-workbench-desc'
        empty.textContent = '没有找到候选主题。'
        list.appendChild(empty)
      }
      host.appendChild(list)
    }

    function renderResearchReplyCandidates(host, state, turn, view) {
      const source = document.createElement('div')
      source.className = 'ai-workbench-desc'
      source.setAttribute('data-ai-research-source-label', '')
      source.textContent = '来源：本人回帖列表；每次只读取当前页的候选。'
      host.appendChild(source)

      const toolbar = document.createElement('div')
      toolbar.className = 'ai-workbench-actions'
      const fieldLabel = document.createElement('label')
      fieldLabel.className = 'ai-workbench-field'
      fieldLabel.append('来源字段')
      const field = document.createElement('select')
      field.setAttribute('data-ai-research-field', '')
      field.setAttribute('aria-label', '本人回帖检索字段')
      const option = document.createElement('option')
      option.value = 'reply'
      option.textContent = '回帖'
      field.appendChild(option)
      field.value = 'reply'
      field.disabled = true
      fieldLabel.appendChild(field)
      toolbar.appendChild(fieldLabel)

      const next = document.createElement('button')
      next.type = 'button'
      next.className = 'ai-workbench-btn'
      next.setAttribute('data-ai-research-next', '')
      next.textContent = `加载第 ${view.nextPage || view.page + 1} 页`
      next.disabled = !view.hasNext || view.loading
      next.onclick = () => {
        const page = Number.isInteger(view.nextPage) && view.nextPage > view.page ? view.nextPage : view.page + 1
        void loadResearchPage(state, turn, view, 'reply', page)
      }
      toolbar.appendChild(next)

      const read = document.createElement('button')
      read.type = 'button'
      read.className = 'ai-workbench-btn ai-workbench-primary'
      read.setAttribute('data-ai-research-reply-read', '')
      read.textContent = '读取所选回帖'
      read.disabled = view.selectedReplyIds.size === 0 || Boolean(view.reading)
      read.onclick = () => void readResearchReplySelection(state, turn, view)
      toolbar.appendChild(read)
      host.appendChild(toolbar)

      const selected = document.createElement('div')
      selected.className = 'ai-workbench-desc'
      selected.setAttribute('data-ai-research-selection-status', '')
      selected.textContent = `已选择 ${view.selectedReplyIds.size}/3 条正文来源；操作目标 ${view.actionReplyIds.size}/3 条。候选页不含正文，目标选择与正文读取相互独立。回复目标只选一个；选中楼层只作草稿上下文，实际回复发到所属主题。`
      host.appendChild(selected)

      const list = document.createElement('div')
      list.setAttribute('data-ai-research-reply-candidates', '')
      for (const candidate of view.replyCandidates.values()) {
        const card = document.createElement('article')
        card.className = 'ai-workbench-local-action-details'
        card.setAttribute('data-ai-research-reply-candidate', String(candidate.postId))
        const title = document.createElement('a')
        title.href = safeHref(api.routes.topicReply(candidate.topicId, candidate.postId))
        title.textContent = candidate.topicTitle
        const detail = document.createElement('div')
        detail.className = 'ai-workbench-desc'
        detail.textContent = `主题 #${candidate.topicId} · 回帖正文将在选中后读取；楼层由主题页验证`
        const label = document.createElement('label')
        label.className = 'ai-workbench-chat-option'
        const checkbox = document.createElement('input')
        checkbox.type = 'checkbox'
        checkbox.setAttribute('data-ai-research-reply-select', '')
        checkbox.value = String(candidate.postId)
        checkbox.checked = view.selectedReplyIds.has(candidate.postId)
        checkbox.onchange = () => {
          if (checkbox.checked && !view.selectedReplyIds.has(candidate.postId) && view.selectedReplyIds.size >= 3) {
            checkbox.checked = false
            view.statusMessage = '最多选择 3 条回帖；请先取消一条已选回帖。'
          } else {
            if (checkbox.checked) view.selectedReplyIds.add(candidate.postId)
            else view.selectedReplyIds.delete(candidate.postId)
            view.statusMessage = ''
          }
          if (conversationHistory.activeId === conversationIdForTurn(turn.id)) renderChatMessages(state)
        }
        label.append(checkbox, '选择')
        const actionLabel = document.createElement('label')
        actionLabel.className = 'ai-workbench-chat-option'
        const actionCheckbox = document.createElement('input')
        actionCheckbox.type = 'checkbox'
        actionCheckbox.setAttribute('data-ai-research-target-reply', '')
        actionCheckbox.value = String(candidate.postId)
        actionCheckbox.checked = view.actionReplyIds.has(candidate.postId)
        actionCheckbox.onchange = () => {
          if (actionCheckbox.checked && !view.actionReplyIds.has(candidate.postId) && view.actionReplyIds.size >= 3) {
            actionCheckbox.checked = false
            view.statusMessage = '最多选择 3 条互动回帖；请先取消一条已选目标。'
          } else {
            if (actionCheckbox.checked) view.actionReplyIds.add(candidate.postId)
            else view.actionReplyIds.delete(candidate.postId)
            view.statusMessage = ''
          }
          if (conversationHistory.activeId === conversationIdForTurn(turn.id)) renderChatMessages(state)
        }
        actionLabel.append(actionCheckbox, '作为操作目标（回复只选一个）')
        card.append(title, detail, label, actionLabel)
        list.appendChild(card)
      }
      if (!view.replyCandidates.size) {
        const empty = document.createElement('div')
        empty.className = 'ai-workbench-desc'
        empty.textContent = '当前页没有匹配的本人回帖。'
        list.appendChild(empty)
      }
      host.appendChild(list)
    }

    async function loadResearchPage(state, turn, view, field, page) {
      if (state.busy || view.loading || !RESEARCH_FIELDS.has(field)) return
      if ((view.source === 'my-replies' && field !== 'reply') || ((view.source === 'my-topics' || view.source === 'my-favorites') && field !== 'title')) return
      view.loading = true
      view.statusMessage = ''
      const conversationId = conversationIdForTurn(turn.id)
      const token = beginReadRequest(state, conversationId, turn)
      if (conversationHistory.activeId === conversationId) renderChatMessages(state)
      try {
        const result = await copilot.loadResearchCandidates({ researchId: view.researchId, field, page, signal: token.controller.signal })
        if (!requestCanPersist(state, conversationId, turn.id, token) || researchViews.get(turn.id) !== view) return
        view.field = RESEARCH_FIELDS.has(result?.field) ? result.field : field
        view.page = Number.isInteger(Number(result?.page)) ? Number(result.page) : page
        view.hasNext = Boolean(result?.hasNext)
        view.nextPage = Number.isInteger(Number(result?.nextPage)) ? Number(result.nextPage) : null
        mergeResearchCandidates(view, result?.candidates)
        mergeResearchReplyCandidates(view, result?.replyCandidates)
        view.statusMessage = ''
        saveTurnAnswer(conversationId, turn.id, token.previousAnswer || '候选已加载，请选择后读取正文。', 'complete', token.previousCitations || [])
      } catch (error) {
        if (!requestCanPersist(state, conversationId, turn.id, token)) return
        view.statusMessage = safeHistoryText(error?.message || error || '无法加载候选主题', 240).text
        researchRequestFailed(state, conversationId, turn.id, token, view.statusMessage)
      } finally {
        if (state.request === token) view.loading = false
        finishReadRequest(state, token)
        if (conversationHistory.activeId === conversationId) renderChatMessages(state)
      }
    }

    async function readResearchSelection(state, turn, view) {
      const topicIds = [...view.selectedIds].filter((id) => view.candidates.has(id)).slice(0, 3)
      if (state.busy || !topicIds.length || view.reading) return
      view.reading = true
      view.statusMessage = ''
      const conversationId = conversationIdForTurn(turn.id)
      const token = beginReadRequest(state, conversationId, turn)
      if (conversationHistory.activeId === conversationId) renderChatMessages(state)
      try {
        const result = await copilot.readResearchSelection({ researchId: view.researchId, topicIds, question: view.question || turn.question, flowId: token.flowId, signal: token.controller.signal, onProgress: (event) => renderRequestProgress(state, conversationId, turn.id, token, event), onDelta: (delta) => receiveAnswerDelta(state, conversationId, turn.id, token, delta) })
        if (!requestCanPersist(state, conversationId, turn.id, token) || researchViews.get(turn.id) !== view) return
        mergeResearchPageStates(view, result?.meta?.pageStates)
        const citations = (Array.isArray(result?.meta?.citations) ? result.meta.citations : []).filter((row) => {
          const id = Number(row?.topicId)
          return row?.known === true && topicIds.includes(id) && (row.kind === 'topic' || Number.isInteger(Number(row.floor)) && Number(row.floor) > 0)
        }).map((row) => row.kind === 'topic'
          ? { kind: 'topic', topicId: Number(row.topicId), floor: 0, known: true }
          : {
              kind: 'floor',
              topicId: Number(row.topicId),
              floor: Number(row.floor),
              issueId: String(row.issueId || ''),
              postId: String(row.postId || '').replace(/[^0-9]/g, '').slice(0, 24),
              authorName: String(row.authorName || ''),
              excerpt: String(row.excerpt || ''),
              href: Number(row.floor) > 0 && /^\d+$/.test(String(row.postId || ''))
                ? `${api.routes.topic(Number(row.topicId))}?floor=${Number(row.floor)}#post-${String(row.postId)}`
                : api.routes.topic(Number(row.topicId)),
              known: true,
            })
        view.answer = { text: String(result?.text || ''), citations }
        view.status = result?.meta?.partial ? 'partial' : result?.meta?.empty ? 'empty' : 'complete'
        view.pageErrors.clear()
        saveTurnAnswer(conversationId, turn.id, '已读取所选主题；回答和引用只保留在当前页面内存中。', 'complete', citations)
        appendTurnPhase(conversationId, turn.id, { stage: 'answer', state: 'complete', summary: '已读取所选主题并验证引用' })
      } catch (error) {
        if (!requestCanPersist(state, conversationId, turn.id, token)) return
        view.statusMessage = safeHistoryText(error?.message || error || '读取所选主题失败', 240).text
        researchRequestFailed(state, conversationId, turn.id, token, view.statusMessage)
      } finally {
        if (state.request === token) view.reading = false
        finishReadRequest(state, token)
        if (conversationHistory.activeId === conversationId) renderChatMessages(state)
      }
    }

    async function readResearchReplySelection(state, turn, view) {
      const postIds = [...view.selectedReplyIds].filter((id) => view.replyCandidates.has(id)).slice(0, 3)
      if (state.busy || !postIds.length || view.reading) return
      view.reading = true
      view.statusMessage = ''
      const conversationId = conversationIdForTurn(turn.id)
      const token = beginReadRequest(state, conversationId, turn)
      if (conversationHistory.activeId === conversationId) renderChatMessages(state)
      try {
        const result = await copilot.readResearchReplySelection({
          researchId: view.researchId,
          postIds,
          question: view.question || turn.question,
          flowId: token.flowId,
          signal: token.controller.signal,
          onProgress: (event) => renderRequestProgress(state, conversationId, turn.id, token, event),
          onDelta: (delta) => receiveAnswerDelta(state, conversationId, turn.id, token, delta),
        })
        if (!requestCanPersist(state, conversationId, turn.id, token) || researchViews.get(turn.id) !== view) return
        const verified = new Map()
        for (const raw of Array.isArray(result?.meta?.readReplies) ? result.meta.readReplies : []) {
          const postId = Number(raw?.postId)
          const candidate = view.replyCandidates.get(postId)
          const topicId = Number(raw?.topicId)
          const floor = Number(raw?.floor)
          const page = Number(raw?.page)
          if (!candidate || !postIds.includes(postId) || candidate.topicId !== topicId || !Number.isSafeInteger(floor) || floor <= 0 || !Number.isSafeInteger(page) || page < 1) continue
          verified.set(`${topicId}:${floor}`, { postId, topicId, floor, page, authorName: String(raw?.authorName || '').slice(0, 100) })
        }
        const citations = (Array.isArray(result?.meta?.citations) ? result.meta.citations : []).flatMap((row) => {
          const topicId = Number(row?.topicId)
          const floor = Number(row?.floor)
          if (row?.known !== true || !Number.isSafeInteger(topicId) || !Number.isSafeInteger(floor)) return []
          const evidence = verified.get(`${topicId}:${floor}`)
          if (!evidence) return []
          return [{
            kind: 'floor', topicId, floor, postId: String(evidence.postId), page: evidence.page,
            authorName: evidence.authorName,
            href: `${api.routes.topic(topicId)}?floor=${floor}#post-${evidence.postId}`,
            known: true,
          }]
        })
        view.answer = { text: String(result?.text || ''), citations }
        view.answerKind = 'replies'
        view.status = result?.meta?.partial ? 'partial' : citations.length || result?.meta?.readReplies?.length ? 'complete' : 'empty'
        saveTurnAnswer(conversationId, turn.id, '已读取所选回帖；回答和引用只保留在当前页面内存中。', 'complete', citations)
        appendTurnPhase(conversationId, turn.id, { stage: 'answer', state: 'complete', summary: '已读取所选回帖并验证引用' })
      } catch (error) {
        if (!requestCanPersist(state, conversationId, turn.id, token)) return
        view.statusMessage = safeHistoryText(error?.message || error || '读取所选回帖失败', 240).text
        researchRequestFailed(state, conversationId, turn.id, token, view.statusMessage)
      } finally {
        if (state.request === token) view.reading = false
        finishReadRequest(state, token)
        if (conversationHistory.activeId === conversationId) renderChatMessages(state)
      }
    }

    async function readResearchTopicPage(state, turn, view, topicId) {
      const id = Number(topicId)
      const pageState = view.pageStates.get(id)
      if (state.busy || !Number.isSafeInteger(id) || !view.selectedIds.has(id) || !view.candidates.has(id) || !pageState?.hasNext || view.loadingPages.has(id)) return
      const page = pageState.nextPage
      const conversationId = conversationIdForTurn(turn.id)
      const token = beginReadRequest(state, conversationId, turn)
      view.loadingPages.add(id)
      view.pageErrors.delete(id)
      if (conversationHistory.activeId === conversationId) renderChatMessages(state)
      try {
        const result = await copilot.loadResearchTopicPage({
          researchId: view.researchId,
          topicId: id,
          page,
          question: view.question || turn.question,
          flowId: token.flowId,
          signal: token.controller.signal,
          onProgress: (event) => renderRequestProgress(state, conversationId, turn.id, token, event),
          onDelta: (delta) => receiveAnswerDelta(state, conversationId, turn.id, token, delta),
        })
        if (!requestCanPersist(state, conversationId, turn.id, token) || researchViews.get(turn.id) !== view) return
        mergeResearchPageStates(view, result?.meta?.pageStates)
        const citations = (Array.isArray(result?.meta?.citations) ? result.meta.citations : []).filter((row) => {
          const rowTopicId = Number(row?.topicId)
          return row?.known === true && rowTopicId === id && (row.kind === 'topic' || Number.isInteger(Number(row.floor)) && Number(row.floor) > 0)
        }).map((row) => row.kind === 'topic'
          ? { kind: 'topic', topicId: id, floor: 0, known: true }
          : {
              kind: 'floor',
              topicId: id,
              floor: Number(row.floor),
              issueId: String(row.issueId || ''),
              postId: String(row.postId || '').replace(/[^0-9]/g, '').slice(0, 24),
              authorName: String(row.authorName || ''),
              excerpt: String(row.excerpt || ''),
              href: Number(row.floor) > 0 && /^\d+$/.test(String(row.postId || ''))
                ? `${api.routes.topic(id)}?floor=${Number(row.floor)}#post-${String(row.postId)}`
                : api.routes.topic(id),
              known: true,
            })
        view.answer = { text: String(result?.text || ''), citations }
        view.status = result?.meta?.partial ? 'partial' : result?.meta?.empty ? 'empty' : 'complete'
        view.pageErrors.delete(id)
        saveTurnAnswer(conversationId, turn.id, `已读取所选主题第 ${page} 页；回答和引用只保留在当前页面内存中。`, 'complete', citations)
        appendTurnPhase(conversationId, turn.id, { stage: 'answer', state: 'complete', summary: `已读取主题 #${id} 第 ${page} 页并验证引用` })
      } catch (error) {
        if (!requestCanPersist(state, conversationId, turn.id, token) || researchViews.get(turn.id) !== view) return
        view.pageErrors.set(id, safeHistoryText(error?.message || error || '读取主题分页失败', 240).text)
        researchRequestFailed(state, conversationId, turn.id, token, view.pageErrors.get(id))
      } finally {
        if (state.request === token) view.loadingPages.delete(id)
        finishReadRequest(state, token)
        if (conversationHistory.activeId === conversationId) renderChatMessages(state)
      }
    }

    function renderChatMessages(state) {
      const host = state.messages
      if (!host?.isConnected) return
      state.renderConversationList?.()
      host.replaceChildren()
      const conversation = activeConversation()
      if (!conversation?.turns.length) {
        if (state.welcome) state.welcome.hidden = false
        host.hidden = true
        return
      }
      if (state.welcome) state.welcome.hidden = true
      host.hidden = false

      for (const turn of conversation.turns) {
        const article = document.createElement('article')
        article.className = 'ai-workbench-chat-turn'
        article.setAttribute('data-ai-chat-turn', turn.id)
        host.appendChild(article)
        const question = document.createElement('div')
        question.className = 'ai-workbench-chat-user'
        question.setAttribute('data-ai-chat-user', '')
        question.textContent = turn.question
        const answer = document.createElement('div')
        answer.className = 'ai-workbench-chat-assistant'
        answer.setAttribute('data-ai-chat-assistant', '')
        article.append(question, answer)
        const draft = answerDrafts.get(turn.id)
        if (draft) {
          const partial = document.createElement('div')
          partial.setAttribute('data-ai-chat-stream', '')
          partial.style.whiteSpace = 'pre-wrap'
          partial.textContent = draft
          const status = document.createElement('small')
          status.className = 'ai-workbench-desc'
          status.textContent = turn.state === 'pending' ? '正在生成，引用待校验…' : '未完成的部分回答，引用尚未校验。'
          answer.append(partial, status)
          if (turn.answer && turn.capability !== 'research') {
            const message = document.createElement('div')
            message.textContent = turn.answer
            answer.appendChild(message)
          }
        }
        if (draft && turn.capability !== 'research') {
          // Partial text is deliberately rendered without Markdown or citation links.
        } else if (turn.state === 'pending' && !turn.answer && !researchViews.has(turn.id)) {
          const waiting = document.createElement('div')
          waiting.className = 'ai-workbench-wait'
          waiting.textContent = '正在处理…'
          answer.appendChild(waiting)
        } else if (turn.capability === 'research') {
          const view = researchViews.get(turn.id)
          if (view) {
            const researchHost = document.createElement('div')
            answer.appendChild(researchHost)
            renderResearchView(researchHost, state, turn, view)
          }
          else {
            if (turn.answer) {
              const summary = document.createElement('div')
              summary.textContent = turn.answer
              answer.appendChild(summary)
            }
            const expired = document.createElement('div')
            expired.className = 'ai-workbench-desc'
            expired.textContent = '候选已失效，请重新检索。刷新后不会自动搜索或读取主题正文。'
            expired.setAttribute('data-ai-research-expired', '')
            answer.appendChild(expired)
          }
        } else if (turn.answer) {
          if (turn.capability === 'site-action') {
            const message = document.createElement('div')
            message.textContent = turn.answer
            answer.appendChild(message)
            const actionHost = document.createElement('div')
            actionHost.setAttribute('data-ai-chat-action-host', '')
            answer.appendChild(actionHost)
            renderTurnActionControls(actionHost, state, turn, generation)
          } else {
            const citations = turn.citations.map((citation) => ({
              ...citation,
              known: true,
              href: conversationCitationHref(citation),
            }))
            renderRecord(answer, { text: turn.answer, meta: { model: copilot?.providerState?.().model || '', citations } }, state, generation)
            renderTurnFreshness(answer, state, turn)
          }
          if (turn.truncation.answer) {
            const clipped = document.createElement('small')
            clipped.className = 'ai-workbench-chat-truncated'
            clipped.textContent = '本地历史只保存回答前 4,000 字。'
            answer.appendChild(clipped)
          }
        }
        if (['failed', 'stale', 'cancelled'].includes(turn.state) && (turn.capability !== 'research' || !researchViews.has(turn.id))) answer.appendChild(chatRetry(state, turn))
        renderChatPhaseTimeline(article, turn)
      }
      host.scrollTop = host.scrollHeight
    }

    function renderChatModeOptions(state) {
      const host = state.root.querySelector('[data-ai-chat-mode-options]')
      if (!host) return
      host.replaceChildren()
      if (state.capability === 'research') {
        const sourceLabel = document.createElement('label')
        sourceLabel.className = 'ai-workbench-chat-option'
        sourceLabel.append('来源')
        const source = document.createElement('select')
        source.setAttribute('data-ai-research-source', '')
        source.setAttribute('aria-label', '跨主题检索来源')
        for (const [value, label] of [['auto', '自动'], ['site-search', '站内搜索'], ['my-topics', '我的主题'], ['my-favorites', '我的收藏'], ['my-replies', '我的回帖']]) {
          const option = document.createElement('option')
          option.value = value
          option.textContent = label
          source.appendChild(option)
        }
        source.value = RESEARCH_SOURCES.has(state.researchSource) ? state.researchSource : 'auto'
        source.onchange = () => { state.researchSource = RESEARCH_SOURCES.has(source.value) ? source.value : 'auto' }
        sourceLabel.appendChild(source)
        host.appendChild(sourceLabel)
        return
      }
      if (state.capability !== 'draft') return
      const ctx = context()
      const posts = (ctx.currentPosts || []).filter((post) => post.content || post.floor === 0)
      const floor = document.createElement('label')
      floor.className = 'ai-workbench-chat-option'
      floor.append('回应楼层')
      const floorSelect = document.createElement('select')
      floorSelect.setAttribute('data-ai-chat-draft-floor', '')
      for (const post of posts) {
        const option = document.createElement('option')
        option.value = String(post.floor)
        option.textContent = post.floor > 0 ? `#${post.floor} · ${post.authorName || '?'}` : `主楼 · ${post.authorName || '?'}`
        floorSelect.appendChild(option)
      }
      floor.appendChild(floorSelect)
      const tone = document.createElement('label')
      tone.className = 'ai-workbench-chat-option'
      tone.append('语气')
      const toneSelect = document.createElement('select')
      toneSelect.setAttribute('data-ai-chat-draft-tone', '')
      for (const value of ['客观', '简洁', '友好', '技术向']) {
        const option = document.createElement('option')
        option.value = value
        option.textContent = value
        toneSelect.appendChild(option)
      }
      tone.appendChild(toneSelect)
      host.append(floor, tone)
    }

    function renderChat(host, state) {
      host.replaceChildren()
      const root = document.createElement('div')
      root.className = 'ai-workbench-chat'
      root.setAttribute('data-ai-workbench', '')
      const conversationBar = renderConversationControls(state)
      conversationBar.setAttribute('data-ai-workbench-more-menu', '')
      const topbar = document.createElement('header')
      topbar.className = 'ai-workbench-topbar'
      topbar.setAttribute('data-ai-workbench-topbar', '')
      topbar.innerHTML = `
        <strong class="ai-workbench-title">AI 工作台</strong>
        <button type="button" class="ai-workbench-icon-btn" data-ai-workbench-more data-ai-chat-plus aria-label="更多操作" aria-expanded="false">⋮</button>
        <button type="button" class="ai-workbench-icon-btn" data-ai-workbench-close aria-label="关闭工作台">×</button>`
      const contextBanner = document.createElement('div')
      contextBanner.className = 'ai-workbench-chat-context-hint'
      contextBanner.setAttribute('data-ai-chat-context-hint', '')
      contextBanner.textContent = contextHint(state.contextKind)
      contextBanner.hidden = true
      const content = document.createElement('main')
      content.className = 'ai-workbench-chat-content'
      content.setAttribute('data-ai-workbench-content', '')
      const welcome = document.createElement('section')
      welcome.className = 'ai-workbench-chat-welcome'
      welcome.setAttribute('data-ai-workbench-welcome', '')
      const greetingName = String(api.me?.name || '').trim()
      const star = document.createElement('span')
      star.className = 'ai-workbench-star'
      star.setAttribute('data-ai-workbench-star', '')
      star.setAttribute('aria-hidden', 'true')
      star.textContent = '✦'
      const greeting = document.createElement('strong')
      greeting.textContent = greetingName ? `你好，${greetingName}` : '你好！想聊点什么？'
      const greetingHint = document.createElement('p')
      greetingHint.textContent = '可以直接用自然语言提问，工作台会按当前内容判断处理方式。'
      welcome.append(star, greeting, greetingHint)
      const suggestions = document.createElement('div')
      suggestions.className = 'ai-workbench-chat-suggestions'
      suggestions.setAttribute('data-ai-workbench-suggestions', '')
      const suggestionRows = api.page.type === 'topic'
        ? [
            ['分析主要观点和分歧', '这篇帖子有哪些主要观点和分歧？'],
            ['整理关键证据', '作者提出了哪些关键证据？'],
            ['总结帖子内容', '帮我总结这篇帖子的核心内容。'],
          ]
        : [
            ['查看当前主题', '当前页面有哪些主题？'],
            ['搜索相关主题', '搜索标题中的缓存'],
            ['检查追踪变化', '最近哪些追踪项有新证据？'],
          ]
      for (const [label, question] of suggestionRows) {
        const button = document.createElement('button')
        button.type = 'button'
        button.className = 'ai-workbench-suggestion'
        button.textContent = label
        button.setAttribute('data-ai-workbench-suggestion', '')
        button.onclick = () => {
          const input = root.querySelector('[data-ai-chat-input]')
          input.value = question
          input.focus()
        }
        suggestions.appendChild(button)
      }
      welcome.appendChild(suggestions)
      const messages = document.createElement('div')
      messages.className = 'ai-workbench-chat-messages'
      messages.setAttribute('data-ai-chat-messages', '')
      content.append(welcome, messages)
      const material = document.createElement('div')
      material.className = 'ai-workbench-material'
      material.setAttribute('data-ai-workbench-material', '')
      material.innerHTML = `
        <span class="ai-workbench-material-label" data-ai-workbench-material-label></span>
        <button type="button" class="ai-workbench-material-remove" data-ai-workbench-material-remove aria-label="取消当前材料">×</button>`
      const composer = document.createElement('div')
      composer.className = 'ai-workbench-chat-composer'
      composer.setAttribute('data-ai-chat-composer', '')
      composer.innerHTML = `
        <textarea class="ai-workbench-chat-input" data-ai-chat-input rows="2" maxlength="1000" placeholder="问问 linux.sb……"></textarea>
        <div class="ai-workbench-chat-toolbar">
          <button type="button" class="ai-workbench-round-btn ai-workbench-attach" data-ai-workbench-attach aria-label="附加材料" aria-expanded="false">＋</button>
          <button type="button" class="ai-workbench-model" data-ai-workbench-model data-ai-model aria-label="打开 AI 设置"></button>
          <button type="button" class="ai-workbench-send-btn ai-workbench-primary" data-ai-chat-send aria-label="发送">↑</button>
        </div>
        <div class="ai-workbench-chat-validation" data-ai-chat-validation role="status"></div>`
      const smartMenu = document.createElement('div')
      smartMenu.className = 'ai-workbench-chat-menu ai-workbench-smart-menu'
      smartMenu.setAttribute('data-ai-chat-menu', '')
      smartMenu.hidden = true
      smartMenu.setAttribute('role', 'menu')
      smartMenu.innerHTML = '<div class="ai-workbench-chat-menu-title">选择处理方式</div><div class="ai-workbench-chat-capabilities"></div>'
      const capabilityHost = smartMenu.querySelector('.ai-workbench-chat-capabilities')
      const ctx = context()
      for (const capability of CAPABILITIES) {
        const item = document.createElement('button')
        item.type = 'button'
        item.className = 'ai-workbench-chat-menu-item'
        item.setAttribute('role', 'menuitem')
        item.setAttribute('data-ai-chat-capability', capability)
        item.textContent = CAPABILITY_LABELS[capability]
        if (['topic-ask', 'disagreement', 'comparison', 'unresolved', 'new-replies', 'draft'].includes(capability)) item.disabled = !(ctx.route?.type === 'topic' && ctx.currentTopic)
        item.onclick = () => {
          setChatCapability(state, capability)
          smartMenu.hidden = false
          fallback.open = true
          smartMenu.hidden = false
        }
        capabilityHost.appendChild(item)
      }
      const settings = document.createElement('button')
      settings.type = 'button'
      settings.className = 'ai-workbench-chat-menu-item'
      settings.setAttribute('role', 'menuitem')
      settings.setAttribute('data-ai-model', '')
      settings.textContent = `AI 设置 · ${copilot?.providerState?.().model || '配置模型'}`
      settings.onclick = () => api.ui.openPanel('ai-summary')
      capabilityHost.appendChild(settings)

      const fallback = document.createElement('details')
      fallback.className = 'ai-workbench-fallback'
      fallback.setAttribute('data-ai-capability-fallback', '')
      const fallbackSummary = document.createElement('summary')
      fallbackSummary.textContent = '处理方式（高级）'
      fallback.append(fallbackSummary, smartMenu)

      const attachMenu = document.createElement('div')
      attachMenu.className = 'ai-workbench-chat-menu ai-workbench-material-menu'
      attachMenu.setAttribute('data-ai-workbench-material-menu', '')
      attachMenu.hidden = true
      attachMenu.innerHTML = '<div class="ai-workbench-chat-menu-title">附加材料</div>'
      for (const [kind, label] of [['current-page', '当前页面'], ['current-topic', '当前帖子'], ['active-tracking', '活动追踪']]) {
        const option = document.createElement('button')
        option.type = 'button'
        option.className = 'ai-workbench-chat-menu-item'
        option.textContent = label
        option.setAttribute('data-ai-workbench-material-kind', kind)
        if (kind === 'current-topic' && !(ctx.route?.type === 'topic' && ctx.currentTopic)) option.disabled = true
        option.onclick = () => {
          state.contextKind = kind
          state.materialMode = 'attached'
          contextBanner.textContent = contextHint(kind)
          renderMaterial()
          attachMenu.hidden = true
          root.querySelector('[data-ai-workbench-attach]').setAttribute('aria-expanded', 'false')
        }
        attachMenu.appendChild(option)
      }

      const legacyControls = document.createElement('div')
      legacyControls.hidden = true
      legacyControls.setAttribute('aria-hidden', 'true')
      legacyControls.innerHTML = `
        <select data-ai-chat-context aria-label="当前上下文"><option value="current-page">当前页面</option><option value="current-topic">当前帖子</option><option value="active-tracking">活动追踪</option></select>
        <select data-ai-chat-mode aria-label="当前能力">${[...CAPABILITIES].map((capability) => `<option value="${capability}">${CAPABILITY_LABELS[capability]}</option>`).join('')}</select>
        <div data-ai-chat-mode-options hidden></div>
        <span data-ai-chat-readonly>写入前再次确认</span>`
      const modeSelect = legacyControls.querySelector('[data-ai-chat-mode]')
      const contextSelect = legacyControls.querySelector('[data-ai-chat-context]')
      const composerShell = document.createElement('div')
      composerShell.className = 'ai-workbench-chat-composer-shell'
      composerShell.setAttribute('data-ai-workbench-composer-shell', '')
      composerShell.append(attachMenu, material, composer, fallback, conversationBar)
      root.append(topbar, content, contextBanner, composerShell, legacyControls)
      host.appendChild(root)
      state.host = host
      state.root = root
      state.messages = messages
      state.welcome = welcome
      state.content = content
      const moreButton = root.querySelector('[data-ai-workbench-more]')
      const attachButton = root.querySelector('[data-ai-workbench-attach]')
      const sendButton = root.querySelector('[data-ai-chat-send]')
      const materialLabel = root.querySelector('[data-ai-workbench-material-label]')
      const materialRemove = root.querySelector('[data-ai-workbench-material-remove]')
      const modelButton = root.querySelector('[data-ai-workbench-model]')
      const canvasHosted = host.closest?.('[data-surface="ai-card"]')
      if (canvasHosted) {
        /* 单画布采用自然语言意图判断；材料仍保留一条可取消的状态条，
           不再把“当前页面/提问类”渲染成对话框下方的模式控件。 */
        attachButton.hidden = true
        attachMenu.hidden = true
        fallback.hidden = true
        smartMenu.hidden = true
        legacyControls.hidden = true
      }
      const providerState = copilot?.providerState?.() || {}
      const diagnosticReason = String(providerState.lastDiagnostic?.reasonCode || '')
      const providerStatus = !providerState.configured
        ? '未配置'
        : diagnosticReason === 'stream-unsupported'
          ? '流式已降级'
          : diagnosticReason && diagnosticReason !== 'ok'
            ? '自检失败'
            : ''
      modelButton.textContent = `${providerState.model || '配置模型'}${providerStatus ? ` · ${providerStatus}` : ''}`
      modelButton.setAttribute('data-ai-workbench-model-status', providerStatus || 'unknown')
      modelButton.title = providerStatus ? `AI 设置 · ${providerStatus}` : '打开 AI 设置'
      modelButton.onclick = () => api.ui.openPanel('ai-summary')
      const renderMaterial = () => {
        const attached = state.materialMode !== 'detached'
        material.hidden = !attached
        material.dataset.materialMode = attached ? 'attached' : 'detached'
        materialLabel.textContent = attached ? contextHint(state.contextKind) : '未附加页面材料'
        materialRemove.hidden = !attached
      }
      moreButton.onclick = () => {
        attachMenu.hidden = true
        attachButton.setAttribute('aria-expanded', 'false')
        conversationBar.hidden = !conversationBar.hidden
        moreButton.setAttribute('aria-expanded', String(!conversationBar.hidden))
        state.openMenu = conversationBar.hidden ? '' : 'more'
        if (!conversationBar.hidden) {
          fallback.open = true
          smartMenu.hidden = false
        }
      }
      root.querySelector('[data-ai-workbench-close]').onclick = () => {
        stopReadRequest(state, '已关闭工作台并停止生成，可重试。')
        api.ui.shellAsideSelect('site')
      }
      root.querySelector('[data-ai-workbench-attach]').onclick = () => {
        if (state.materialMode === 'detached') {
          state.materialMode = 'attached'
          if (!CONTEXT_KINDS.has(state.contextKind)) state.contextKind = routeContextKind()
          renderMaterial()
        }
        conversationBar.hidden = true
        moreButton.setAttribute('aria-expanded', 'false')
        attachMenu.hidden = !attachMenu.hidden
        state.openMenu = attachMenu.hidden ? '' : 'materials'
        attachButton.setAttribute('aria-expanded', String(!attachMenu.hidden))
      }
      materialRemove.onclick = () => {
        state.materialMode = 'detached'
        renderMaterial()
      }
      fallback.addEventListener('toggle', () => {
        smartMenu.hidden = !fallback.open
      })
      root.querySelector('[data-ai-chat-input]').addEventListener('focus', () => {
        attachMenu.hidden = true
        attachButton.setAttribute('aria-expanded', 'false')
      })
      root.querySelector('[data-ai-chat-input]').addEventListener('keydown', (event) => {
        if (event.key !== 'Enter' || event.shiftKey || event.isComposing) return
        event.preventDefault()
        void submitChatTurn(state)
      })
      const modeOptions = legacyControls.querySelector('[data-ai-chat-mode-options]')
      modeOptions.hidden = true
      state.capability = state.capability || 'ask'
      state.contextKind = CONTEXT_KINDS.has(state.contextKind) ? state.contextKind : routeContextKind()
      contextSelect.value = state.contextKind
      if (!contextSelect.value) {
        state.contextKind = routeContextKind()
        contextSelect.value = state.contextKind
      }
      modeSelect.value = state.capability
      modeSelect.onchange = () => {
        state.manualCapability = true
        state.capability = CAPABILITIES.has(modeSelect.value) ? modeSelect.value : 'ask'
        if (state.capability === 'tracking') state.contextKind = 'active-tracking'
        else if (['topic-ask', 'disagreement', 'comparison', 'unresolved', 'new-replies', 'draft'].includes(state.capability)) state.contextKind = 'current-topic'
        else state.contextKind = routeContextKind()
        contextSelect.value = state.contextKind
        contextBanner.textContent = contextHint(state.contextKind)
        renderChatModeOptions(state)
      }
      contextSelect.onchange = () => {
        state.contextKind = CONTEXT_KINDS.has(contextSelect.value) ? contextSelect.value : routeContextKind()
        contextBanner.textContent = contextHint(state.contextKind)
        renderMaterial()
      }
      modeSelect.value = state.capability
      setChatCapability(state, state.capability)
      renderMaterial()
      setChatBusy(state, false)
      sendButton.onclick = () => state.busy ? stopReadRequest(state) : void submitChatTurn(state)
      state.renderConversationList = () => conversationBar.querySelector('[data-ai-conversation-list]') && (() => {
        const select = conversationBar.querySelector('[data-ai-conversation-list]')
        select.replaceChildren()
        for (const conversation of conversationHistory.conversations) {
          const option = document.createElement('option')
          option.value = conversation.id
          option.textContent = conversation.title || '新对话'
          select.appendChild(option)
        }
        if (!conversationHistory.conversations.length) {
          const option = document.createElement('option')
          option.value = ''
          option.textContent = '暂无对话'
          select.appendChild(option)
        }
        select.value = conversationHistory.activeId
        const status = conversationBar.querySelector('[data-ai-compaction-status]')
        const clearCompaction = conversationBar.querySelector('[data-ai-clear-compaction]')
        const current = currentCompactions(state)
        const latest = current.rows.at(-1)
        const count = latest?.sourceTurnIds?.length || 0
        if (status) status.textContent = latest ? `已压缩 ${count} 轮 · 当前范围` : '历史未压缩'
        if (clearCompaction) clearCompaction.hidden = !latest
      })()
      state.renderConversation = () => {
        const active = activeConversation()
        const latest = active?.turns?.at(-1)
        if (latest) {
          state.materialMode = latest.materialMode === 'detached' ? 'detached' : 'attached'
          state.contextKind = CONTEXT_KINDS.has(latest.context?.kind) ? latest.context.kind : state.contextKind
          state.intent = latest.intent || null
        }
        state.renderConversationList?.()
        contextBanner.textContent = contextHint(state.contextKind)
        renderMaterial()
        renderChatMessages(state)
      }
      state.renderConversation()
    }

    function requestCanPersist(state, conversationId, turnId, token) {
      const checkpoint = typeof token === 'object' ? token.generation : token
      const active = typeof token !== 'object' || state.request === token && !token.controller.signal.aborted
      return active && !disposed && mounted === state && !state.disposed && generation === checkpoint && Boolean(findTurn(conversationId, turnId))
    }

    let requestSequence = 0
    function beginReadRequest(state, conversationId, turn, force = false, kind = 'answer') {
      turn = findTurn(conversationId, turn.id) || turn
      const token = { generation, controller: new AbortController(), conversationId, turnId: turn.id, force, kind }
      token.previousAnswer = turn.answer
      token.previousCitations = turn.citations
      const visibleIds = new Set(conversationHistory.conversations.flatMap((item) => item.turns.map((row) => row.id)))
      for (const id of answerDrafts.keys()) if (!visibleIds.has(id)) answerDrafts.delete(id)
      traceFlows.delete(turn.traceFlowId || turn.id)
      turn.traceFlowId = `${turn.id}:request:${++requestSequence}`
      token.flowId = turn.traceFlowId
      traceFlows.set(turn.traceFlowId, { conversationId, turnId: turn.id })
      updateConversationTurn(conversationId, turn.id, { traceFlowId: turn.traceFlowId })
      answerDrafts.delete(turn.id)
      if (kind === 'answer') updateConversationTurn(conversationId, turn.id, { state: 'pending', phases: [], trace: [] })
      state.request = token
      state.activeRequestId = turn.id
      setChatBusy(state, true)
      return token
    }

    function finishReadRequest(state, token) {
      if (token?.renderTimer) clearTimeout(token.renderTimer)
      if (state.request !== token) return
      state.request = null
      state.activeRequestId = ''
      setChatBusy(state, false)
    }

    function stopReadRequest(state, message = '已停止生成，可重试。') {
      const token = state?.request
      if (!token) return
      let turn = findTurn(token.conversationId, token.turnId)
      if (token.kind === 'citation-review') {
        token.controller.abort()
        finishReadRequest(state, token)
        state.renderConversation?.()
        return
      }
      if (turn) {
        traceFlows.delete(turn.traceFlowId || turn.id)
        const preservedAnswer = token.previousAnswer || message
        const preservedCitations = token.previousCitations || []
        turn = saveTurnAnswer(token.conversationId, token.turnId, preservedAnswer, 'cancelled', preservedCitations)
        turn.phases = turn.phases.map((phase) => phase.state === 'active' ? { ...phase, state: 'cancelled', summary: message } : phase)
        turn.trace = turn.trace.map((event) => event.state === 'active' ? { ...event, state: 'skipped', summary: message, evidence: 'partial' } : event)
        appendTurnPhase(token.conversationId, token.turnId, { stage: 'answer', state: 'cancelled', summary: message })
        const view = researchViews.get(turn.id)
        if (view) { view.reading = false; view.loading = false; view.loadingPages.clear(); view.statusMessage = message }
      }
      token.controller.abort()
      finishReadRequest(state, token)
      state.renderConversation?.()
    }

    function receiveAnswerDelta(state, conversationId, turnId, token, delta) {
      if (!requestCanPersist(state, conversationId, turnId, token)) return
      const next = (answerDrafts.get(turnId) || '') + String(delta || '')
      answerDrafts.set(turnId, next.slice(0, 100000))
      if (token.renderTimer) return
      token.renderTimer = setTimeout(() => {
        token.renderTimer = null
        if (requestCanPersist(state, conversationId, turnId, token) && conversationHistory.activeId === conversationId) renderChatMessages(state)
      }, 50)
    }

    function researchRequestFailed(state, conversationId, turnId, token, message) {
      if (!requestCanPersist(state, conversationId, turnId, token)) return
      saveTurnAnswer(conversationId, turnId, token.previousAnswer || message, 'failed', token.previousCitations || [])
      appendTurnPhase(conversationId, turnId, { stage: 'answer', state: 'failed', summary: message })
    }

    function conversationRowsForTurn(conversationId, turn) {
      const conversation = conversationHistory.conversations.find((item) => item.id === conversationId)
      const rows = []
      for (const previous of conversation?.turns || []) {
        if (previous.id === turn.id) break
        if (previous.state !== 'complete' || previous.capability === 'site-action' || !previous.answer) continue
        if (previous.context.kind !== turn.context.kind || previous.context.routeType !== turn.context.routeType || previous.context.topicId !== turn.context.topicId) continue
        if (previous.context.routeScope ? previous.context.routeScope !== turn.context.routeScope : previous.context.routeType !== 'topic') continue
        if (previous.context.materialMode !== turn.context.materialMode) continue
        const view = researchViews.get(previous.id)
        const answer = previous.capability === 'research' ? ['complete', 'partial'].includes(view?.status) ? view.answer?.text : '' : previous.answer
        if (answer) {
          const scope = previous.context
          rows.push(
            { role: 'user', content: previous.question, capability: previous.capability, state: previous.state, scope, turnId: previous.id },
            { role: 'assistant', content: answer, capability: previous.capability, state: previous.state, scope, turnId: previous.id },
          )
        }
      }
      return rows
    }

    function sameConversationScope(left, right) {
      const a = normalizedConversationScope(left)
      const b = normalizedConversationScope(right)
      return a.kind === b.kind && a.routeType === b.routeType && a.topicId === b.topicId && a.routeScope === b.routeScope && a.materialMode === b.materialMode
    }

    function localConversationSummary(rows) {
      const blocks = []
      for (let index = 0; index + 1 < rows.length; index += 2) {
        if (rows[index]?.role !== 'user' || rows[index + 1]?.role !== 'assistant') continue
        const question = safeHistoryText(rows[index].content, 500).text
        const answer = safeHistoryText(rows[index + 1].content, ANSWER_MAX_CHARS).text
        if (question || answer) blocks.push(`[问题] ${question}\n[回答] ${answer}`)
      }
      return clipText(blocks.join('\n'), CONVERSATION_SUMMARY_MAX_CHARS).text
    }

    async function conversationContextForTurn({ conversationId, turn, signal, onProgress } = {}) {
      if (!turn || turn.capability === 'site-action') return { rows: [], summary: '', text: '', fingerprint: '', compactedPairs: 0, summaryStatus: 'none' }
      const rawRows = conversationRowsForTurn(conversationId, turn)
      const scope = normalizedConversationScope(turn.context)
      const built = typeof api.ai.buildConversationContext === 'function'
        ? api.ai.buildConversationContext(rawRows, { maxChars: CONVERSATION_CONTEXT_CHARS, recentPairs: 3, summaryChars: CONVERSATION_SUMMARY_MAX_CHARS, scope })
        : (() => {
            const fallback = api.ai.prepareConversation(rawRows, { maxChars: CONVERSATION_CONTEXT_CHARS, maxTurns: 3 })
            return { recentRows: fallback.rows, summaryInput: [], text: fallback.text, chars: fallback.chars, omittedPairs: 0, fingerprint: hashText(fallback.text) }
          })()
      const conversation = conversationHistory.conversations.find((item) => item.id === conversationId)
      const summaryRows = Array.isArray(built.summaryInput) ? built.summaryInput : []
      const sourceFingerprint = hashText(JSON.stringify({ version: 1, scope, rows: summaryRows }))
      let summary = ''
      let summaryStatus = summaryRows.length ? 'missing' : 'none'
      if (summaryRows.length) {
        const matching = (conversation?.compactions || []).find((item) => sameConversationScope(item.scope, scope) && item.sourceFingerprint === sourceFingerprint)
        if (matching?.text) {
          summary = matching.text
          summaryStatus = 'cached'
        } else {
          const previous = [...(conversation?.compactions || [])].reverse().find((item) => sameConversationScope(item.scope, scope))
          try {
            api.ai.throwIfAborted(signal)
            if (typeof copilot.summarizeConversation !== 'function') throw new Error('当前副驾不支持历史压缩')
            const result = await copilot.summarizeConversation({ rows: summaryRows, previousSummary: previous?.text || '', scope, signal })
            api.ai.throwIfAborted(signal)
            summary = safeHistoryText(result?.text, CONVERSATION_SUMMARY_MAX_CHARS).text
            if (!summary) throw new Error('历史摘要为空')
            conversation.compactions = [
              ...(conversation.compactions || []).filter((item) => !(sameConversationScope(item.scope, scope) && item.sourceFingerprint === sourceFingerprint)),
              {
                version: 1,
                scope,
                sourceFingerprint,
                text: summary,
                sourceTurnIds: rawRows.filter((row) => row.role === 'user').slice(0, Math.floor(summaryRows.length / 2)).map((row) => row.turnId).filter(Boolean),
                updatedAt: Date.now(),
              },
            ].sort((a, b) => a.updatedAt - b.updatedAt).slice(-CONVERSATION_COMPACTION_LIMIT)
            saveConversationHistory({ keepConversationId: conversationId, keepTurnId: turn.id })
            summaryStatus = 'generated'
          } catch (error) {
            api.ai.throwIfAborted(signal)
            summary = localConversationSummary(summaryRows)
            summaryStatus = 'fallback'
            try { onProgress?.({ stage: 'local', state: 'complete', summary: '历史摘要不可用，已收窄为本地脱敏摘录' }) } catch { /* progress is best effort */ }
          }
        }
      }
      const summaryBlock = summary ? `<conversation-summary>\n${summary}\n</conversation-summary>` : ''
      const text = `${summaryBlock}${built.text ? `${summaryBlock ? '\n' : ''}<conversation>\n${built.text}\n</conversation>` : ''}`
      return {
        rows: built.recentRows || [],
        summary,
        text,
        fingerprint: hashText(JSON.stringify({ base: built.fingerprint, summary, sourceFingerprint })),
        compactedPairs: Math.floor(summaryRows.length / 2),
        summaryStatus,
      }
    }

    function renderRequestProgress(state, conversationId, turnId, token, event) {
      if (!requestCanPersist(state, conversationId, turnId, token)) return
      appendTurnPhase(conversationId, turnId, event)
      if (conversationHistory.activeId === conversationId) renderChatMessages(state)
    }

    async function regenerateChatAction(state, turn, record) {
      const conversationId = conversationIdForTurn(turn.id)
      if (state.busy || !requestCanPersist(state, conversationId, turn.id, generation)) return
      const token = beginReadRequest(state, conversationId, findTurn(conversationId, turn.id), true)
      turn = findTurn(conversationId, turn.id)
      if (record) record.status = 'regenerating'
      state.activeRequestId = turn.id
      setChatBusy(state, true)
      updateConversationTurn(conversationId, turn.id, { answer: '正在重新生成操作计划…', state: 'pending' })
      appendTurnPhase(conversationId, turn.id, { stage: 'action', state: 'cancelled', summary: '开始替换当前计划' })
      appendTurnPhase(conversationId, turn.id, { stage: 'plan', state: 'active', summary: '重新生成受限操作计划' })
      if (conversationHistory.activeId === conversationId) renderChatMessages(state)
      try {
        const targetScope = selectedActionTargetScope()
        const result = await copilot.planActions({ command: turn.question, force: true, targetScope, flowId: turn.traceFlowId || turn.id, signal: token.controller.signal })
        if (!requestCanPersist(state, conversationId, turn.id, token)) return
        const currentTurn = findTurn(conversationId, turn.id)
        const replacement = createChatActionRecord(currentTurn, result.plan, result.previews, 'model', {
          targetScopeNonce: result.targetScopeNonce,
          targetScope,
        })
        const planType = replacement.write ? '写入' : '只读'
        const hasReaction = result.plan.steps.some((step) => REACTION_WRITE_ACTIONS.has(step.action))
        const safePlanSummary = hasReaction ? '互动操作（目标与档位仅保留在当前页面）' : safeHistoryText(result.plan.summary, 240).text
        actionSession.record = replacement
        actionSession.records.set(replacement.id, replacement)
        saveActionHistory(replacement)
        updateConversationTurn(conversationId, turn.id, {
          answer: `已重新生成${planType}计划：${safePlanSummary}。请检查步骤和完整内容，再明确确认执行；写操作还会再次确认。`,
          state: 'complete',
        })
        appendTurnPhase(conversationId, turn.id, { stage: 'plan', state: 'complete', summary: '计划已重新生成' })
        appendTurnPhase(conversationId, turn.id, { stage: 'local', state: 'complete', summary: `${result.plan.steps.length} 个步骤已通过本地校验` })
        appendTurnPhase(conversationId, turn.id, { stage: 'action', state: 'active', summary: '等待你确认执行' })
        if (conversationHistory.activeId === conversationId) renderChatMessages(state)
      } catch (error) {
        if (!requestCanPersist(state, conversationId, turn.id, token)) return
        if (record?.status === 'regenerating') record.status = 'ready'
        const message = safeHistoryText(error?.message || error || '无法重新生成操作计划', ANSWER_MAX_CHARS).text
        saveTurnAnswer(conversationId, turn.id, token.previousAnswer || message, 'failed', token.previousCitations || [])
        appendTurnPhase(conversationId, turn.id, { stage: 'plan', state: 'failed', summary: '重新生成计划失败，原计划仍可查看' })
        appendTurnPhase(conversationId, turn.id, { stage: 'action', state: 'active', summary: '原计划仍需你确认后执行' })
        if (conversationHistory.activeId === conversationId) renderChatMessages(state)
      } finally {
        finishReadRequest(state, token)
      }
    }

    async function dispatchChatTurn(state, conversationId, turnId, token) {
      const turn = findTurn(conversationId, turnId)
      if (!turn) return
      const signal = token?.controller?.signal
      const force = Boolean(token?.force)
      const onProgress = (event) => renderRequestProgress(state, conversationId, turnId, token, event)
      const onDelta = (delta) => receiveAnswerDelta(state, conversationId, turnId, token, delta)
      try {
        let conversation = []
        let conversationSummary = ''
        let conversationFingerprint = ''
        let preparedConversation = null
        if (turn.capability !== 'site-action') {
          const prepared = await conversationContextForTurn({ conversationId, turn, signal, onProgress })
          preparedConversation = prepared
          if (!requestCanPersist(state, conversationId, turnId, token)) return
          conversation = prepared.rows
          conversationSummary = prepared.summary
          conversationFingerprint = prepared.fingerprint
          if (prepared.compactedPairs > 0) {
            appendTurnPhase(conversationId, turnId, {
              stage: 'local',
              state: 'complete',
              summary: prepared.summaryStatus === 'fallback' ? `历史已收窄：${prepared.compactedPairs} 轮使用本地脱敏摘录` : `已压缩 ${prepared.compactedPairs} 轮历史`,
            })
          }
        }
        let record
        if (turn.capability === 'research') {
          appendTurnPhase(conversationId, turnId, { stage: 'plan', state: 'active', summary: '搜索结果准备中；不会读取正文' })
          if (conversationHistory.activeId === conversationId) renderChatMessages(state)
          const selectedSource = state.root.querySelector('[data-ai-research-source]')?.value || state.researchSource
          const requestedSource = RESEARCH_SOURCES.has(selectedSource) ? selectedSource : 'auto'
          const liveQuestion = liveResearchQuestions.get(turnId) || turn.question
          const result = await copilot.startResearch({ question: liveQuestion, source: requestedSource, flowId: turn.traceFlowId || turn.id, onProgress, signal, conversation, conversationSummary, conversationFingerprint, materialMode: turn.materialMode })
          if (!requestCanPersist(state, conversationId, turnId, token)) return
          const expectedSource = expectedResearchSource(liveQuestion, requestedSource)
          if (!RESEARCH_SOURCES.has(result?.source) || result.source !== expectedSource) {
            throw new Error('检索来源与请求不匹配，请重新检索。')
          }
          const source = result.source
          const field = RESEARCH_FIELDS.has(result?.field) ? result.field : 'title'
          const view = {
            researchId: result?.researchId,
            question: liveQuestion,
            source,
            query: String(result?.query || ''),
            field: source === 'my-replies' ? 'reply' : source === 'my-topics' || source === 'my-favorites' ? 'title' : field,
            page: Number.isInteger(Number(result?.page)) && Number(result.page) > 0 ? Number(result.page) : 1,
            hasNext: Boolean(result?.hasNext),
            nextPage: Number.isInteger(Number(result?.nextPage)) ? Number(result.nextPage) : null,
            candidates: new Map(),
            replyCandidates: new Map(),
            selectedIds: new Set(),
            selectedReplyIds: new Set(),
            actionTopicIds: new Set(),
            actionReplyIds: new Set(),
            pageStates: new Map(),
            loadingPages: new Set(),
            pageErrors: new Map(),
            loading: false,
            reading: false,
            status: '',
            statusMessage: '',
            answer: null,
          }
          mergeResearchCandidates(view, result?.candidates)
          mergeResearchReplyCandidates(view, result?.replyCandidates)
          researchViews.set(turnId, view)
          const sourceLabel = ({ auto: '自动', 'site-search': '站内搜索', 'my-topics': '我的主题', 'my-favorites': '我的收藏', 'my-replies': '我的回帖' })[source]
          const fieldLabel = ({ title: '标题', body: '正文', reply: '回帖' })[view.field]
          updateConversationTurn(conversationId, turnId, {
            answer: source === 'my-replies'
              ? `找到 ${view.replyCandidates.size} 条候选回帖；来源：${sourceLabel}；字段：${fieldLabel}。请选择不超过 3 条回帖后再读取正文。`
              : `找到 ${view.candidates.size} 个检索结果；来源：${sourceLabel}；字段：${fieldLabel}。请选择不超过 3 篇主题后再读取正文。`,
            state: 'complete',
          })
          appendTurnPhase(conversationId, turnId, { stage: 'plan', state: 'complete', summary: '检索结果已就绪，等待手动选择' })
          appendTurnPhase(conversationId, turnId, { stage: 'local', state: 'complete', summary: `${view.candidates.size} 个检索结果；正文尚未读取` })
          if (preparedConversation?.summaryStatus === 'fallback') appendTurnPhase(conversationId, turnId, { stage: 'local', state: 'complete', summary: `历史已收窄：${preparedConversation.compactedPairs} 轮使用本地脱敏摘录` })
          if (conversationHistory.activeId === conversationId) renderChatMessages(state)
          return
        } else if (turn.capability === 'site-action') {
          appendTurnPhase(conversationId, turnId, { stage: 'understand', state: 'complete', summary: '识别为受限站内操作' })
          appendTurnPhase(conversationId, turnId, { stage: 'plan', state: 'active', summary: '生成受限操作计划' })
          if (conversationHistory.activeId === conversationId) renderChatMessages(state)
          const targetScope = selectedActionTargetScope()
          const result = await copilot.planActions({ command: turn.question, targetScope, flowId: turn.traceFlowId || turn.id, signal, ...(force ? { force: true } : {}) })
          if (!requestCanPersist(state, conversationId, turnId, token)) return
          if (result?.fallback) {
            // 未知计划只允许收窄为普通只读查询；不建立 action history，也不触发执行入口。
            const traceFlowId = String(turn.traceFlowId || turn.id || '').slice(0, 100)
            api.ai.trace?.emit?.({
              id: `${traceFlowId}:limit:plan-downgraded`,
              flowId: traceFlowId,
              stage: 'limit',
              state: 'complete',
              title: '执行限制',
              summary: '已降级为普通只读查询；原计划中的站内动作未执行',
              evidence: 'partial',
              counts: { selected: 0, read: 0, matched: 0, citations: 0 },
              citations: [],
              reasonCode: 'plan-downgraded',
            })
            appendTurnPhase(conversationId, turnId, {
              stage: 'plan',
              state: 'complete',
              summary: '原操作计划版本未知，未执行其中的站内动作',
            })
            appendTurnPhase(conversationId, turnId, {
              stage: 'local',
              state: 'complete',
              summary: '已降级为普通只读查询',
            })
            record = await copilot.runConsoleQuery({
              question: result.question || turn.question,
              flowId: turn.traceFlowId || turn.id,
              onProgress,
              signal, force, materialMode: turn.materialMode,
            })
            if (!requestCanPersist(state, conversationId, turnId, token)) return
            const warning = '已降级为普通只读查询；原计划中的站内动作未执行。'
            saveTurnAnswer(
              conversationId,
              turnId,
              `${warning}\n\n${record?.text || ''}`,
              'complete',
              record?.meta?.citations || [],
            )
            if (conversationHistory.activeId === conversationId) renderChatMessages(state)
            return
          }
          const actionRecord = createChatActionRecord(turn, result.plan, result.previews, 'model', {
            targetScopeNonce: result.targetScopeNonce,
            targetScope,
          })
          actionSession.record = actionRecord
          actionSession.records.set(turnId, actionRecord)
          saveActionHistory(actionRecord)
          const hasWrite = actionRecord.write
          const hasReaction = result.plan.steps.some((step) => REACTION_WRITE_ACTIONS.has(step.action))
          const safePlanSummary = hasReaction ? '互动操作（目标与档位仅保留在当前页面）' : safeHistoryText(result.plan.summary, 240).text
          updateConversationTurn(conversationId, turnId, {
            answer: `已生成${hasWrite ? '写入' : '只读'}计划：${safePlanSummary}。请检查步骤和完整内容，再明确执行；写操作还会再次确认。`,
            state: 'complete',
          })
          appendTurnPhase(conversationId, turnId, { stage: 'plan', state: 'complete', summary: '计划已生成' })
          appendTurnPhase(conversationId, turnId, { stage: 'local', state: 'complete', summary: `${result.plan.steps.length} 个步骤已通过本地校验` })
          appendTurnPhase(conversationId, turnId, { stage: 'action', state: 'active', summary: '等待你确认执行' })
          if (conversationHistory.activeId === conversationId) renderChatMessages(state)
          return
        }

        const isTopicCapability = ['topic-ask', 'disagreement', 'comparison', 'unresolved', 'new-replies', 'draft'].includes(turn.capability)
        if (isTopicCapability && (api.page.type !== 'topic' || !context()?.currentTopic)) {
          throw new Error('当前页面没有可用的帖子上下文。')
        }
        if (turn.capability === 'ask' && turn.context.kind === 'active-tracking' || turn.capability === 'tracking') {
          record = await copilot.runConsoleQuery({ question: turn.question, scope: 'active-tracking', flowId: turn.traceFlowId || turn.id, onProgress, conversation, conversationSummary, conversationFingerprint, signal, force, onDelta, materialMode: turn.materialMode })
        } else if (isTopicCapability || (turn.capability === 'ask' && api.page.type === 'topic' && turn.context.kind !== 'active-tracking')) {
          const mode = ['disagreement', 'comparison', 'unresolved'].includes(turn.capability) ? 'analyze'
            : turn.capability === 'new-replies' ? 'digest'
              : turn.capability === 'draft' ? 'draft' : 'ask'
          const options = { onProgress, conversation, conversationSummary, conversationFingerprint, signal, force, onDelta, materialMode: turn.materialMode }
          options.flowId = turn.traceFlowId || turn.id
          if (mode === 'ask') options.question = turn.question
          if (turn.capability === 'disagreement') options.preset = '观点分歧'
          if (turn.capability === 'comparison') options.preset = '方案对比'
          if (turn.capability === 'unresolved') options.preset = '未解决问题'
          if (turn.capability === 'draft') {
            const floor = Number(state.root.querySelector('[data-ai-chat-draft-floor]')?.value || 0)
            options.targetFloor = floor
            options.tone = state.root.querySelector('[data-ai-chat-draft-tone]')?.value || '客观'
            options.length = '中'
          }
          record = await copilot.runTopic(mode, options)
        } else {
          record = await copilot.runConsoleQuery({ question: turn.question, flowId: turn.traceFlowId || turn.id, onProgress, conversation, conversationSummary, conversationFingerprint, signal, force, onDelta, materialMode: turn.materialMode })
        }
        if (preparedConversation?.summaryStatus === 'fallback' && preparedConversation.compactedPairs > 0) {
          appendTurnPhase(conversationId, turnId, { stage: 'local', state: 'complete', summary: `历史已收窄：${preparedConversation.compactedPairs} 轮使用本地脱敏摘录` })
        }
        if (!requestCanPersist(state, conversationId, turnId, token)) return
        saveTurnAnswer(
          conversationId,
          turnId,
          record?.text || '',
          'complete',
          record?.meta?.citations || [],
          record?.meta ? { ...record.meta, revisionReason: token.revisionReason || (force ? 'manual-regenerate' : '') } : {},
        )
        if (conversationHistory.activeId === conversationId) renderChatMessages(state)
      } catch (error) {
        if (!requestCanPersist(state, conversationId, turnId, token)) return
        const message = safeHistoryText(error?.message || error || 'AI 请求失败', ANSWER_MAX_CHARS).text
        saveTurnAnswer(conversationId, turnId, token.previousAnswer || message, 'failed', token.previousCitations || [])
        appendTurnPhase(conversationId, turnId, { stage: 'answer', state: 'failed', summary: '请求失败，可重试或检查 AI 设置' })
        if (conversationHistory.activeId === conversationId) renderChatMessages(state)
      } finally {
        if (turn.capability === 'research' && findTurn(conversationId, turnId)?.state === 'complete') liveResearchQuestions.delete(turnId)
        finishReadRequest(state, token)
      }
    }

    async function submitChatTurn(state) {
      if (state.busy || mounted !== state) return
      const input = state.root.querySelector('[data-ai-chat-input]')
      const question = String(input.value || '').trim()
      const validation = state.root.querySelector('[data-ai-chat-validation]')
      validation.textContent = ''
      if (!question) return
      if (Array.from(question).length > INPUT_MAX_CHARS) {
        validation.textContent = `每条消息最多 ${INPUT_MAX_CHARS} 个字符。`
        return
      }
      const route = safeRouteSnapshot(context()?.route || api.page)
      const autoIntent = detectChatIntent(question, {
        route,
        materialMode: state.materialMode,
        hasTopic: Boolean(context()?.currentTopic),
        hasTracking: Boolean(context()?.tracking?.length || context()?.activeTracking?.length),
        capabilities: CAPABILITIES,
      })
      const capability = state.manualCapability && CAPABILITIES.has(state.capability) && state.capability !== 'ask'
        ? state.capability
        : autoIntent.capability
      state.intent = state.manualCapability && capability !== autoIntent.capability
        ? { capability, confidence: 'high', source: 'local', reason: 'explicit-action' }
        : autoIntent
      const contextKind = state.contextKind
      state.capability = CAPABILITIES.has(capability) ? capability : 'ask'
      state.contextKind = CONTEXT_KINDS.has(contextKind) ? contextKind : routeContextKind()
      if (state.capability === 'tracking') state.contextKind = 'active-tracking'
      if (['topic-ask', 'disagreement', 'comparison', 'unresolved', 'new-replies', 'draft'].includes(state.capability)) state.contextKind = 'current-topic'
      const turn = newConversationTurn(question, state.capability, state.contextKind, state.materialMode, state.intent)
      state.manualCapability = false
      if (state.capability === 'research') liveResearchQuestions.set(turn.id, question)
      const conversationId = conversationHistory.activeId
      input.value = ''
      const token = beginReadRequest(state, conversationId, turn)
      state.renderConversationList?.()
      renderChatMessages(state)
      await dispatchChatTurn(state, conversationId, turn.id, token)
    }

    function currentConversationScope(state) {
      const route = safeRouteSnapshot(context()?.route || api.page)
      return normalizedConversationScope({
        kind: state?.contextKind || routeContextKind(),
        routeType: route.type,
        topicId: route.type === 'topic' ? route.id : 0,
        routeScope: routeFingerprint(route),
        materialMode: state?.materialMode,
      })
    }

    function currentCompactions(state) {
      const conversation = activeConversation()
      const scope = currentConversationScope(state)
      return {
        conversation,
        scope,
        rows: (conversation?.compactions || []).filter((item) => sameConversationScope(item.scope, scope)),
      }
    }

    function clearCurrentCompaction(state) {
      const current = currentCompactions(state)
      if (!current.conversation || !current.rows.length) return
      const removed = new Set(current.rows)
      current.conversation.compactions = (current.conversation.compactions || []).filter((item) => !removed.has(item))
      saveConversationHistory({ keepConversationId: current.conversation.id })
      state.renderConversation?.()
    }

    function renderConversationControls(state) {
      const header = document.createElement('div')
      header.className = 'ai-workbench-chat-menu ai-workbench-conversation-menu'
      header.setAttribute('data-ai-chat-plus-menu', '')
      header.hidden = true
      header.innerHTML = `
        <button type="button" class="ai-workbench-btn" data-ai-new-conversation>＋ 新对话</button>
        <select class="ai-workbench-conversation-list" data-ai-conversation-list aria-label="最近对话"></select>
        <button type="button" class="ai-workbench-btn" data-ai-clear-history>清空</button>
        <span class="ai-workbench-compaction-status" data-ai-compaction-status>历史未压缩</span>
        <button type="button" class="ai-workbench-btn" data-ai-clear-compaction hidden>清除压缩</button>`
      const select = header.querySelector('[data-ai-conversation-list]')
      const status = header.querySelector('[data-ai-compaction-status]')
      const clearCompaction = header.querySelector('[data-ai-clear-compaction]')
      const renderOptions = () => {
        select.replaceChildren()
        for (const conversation of conversationHistory.conversations) {
          const option = document.createElement('option')
          option.value = conversation.id
          option.textContent = conversation.title || '新对话'
          select.appendChild(option)
        }
        if (!conversationHistory.conversations.length) {
          const option = document.createElement('option')
          option.value = ''
          option.textContent = '暂无对话'
          select.appendChild(option)
        }
        select.value = conversationHistory.activeId
        const current = currentCompactions(state)
        const latest = current.rows.at(-1)
        const count = latest?.sourceTurnIds?.length || 0
        status.textContent = latest ? `已压缩 ${count} 轮 · 当前范围` : '历史未压缩'
        clearCompaction.hidden = !latest
      }
      renderOptions()
      state.renderConversationList = renderOptions
      clearCompaction.onclick = () => clearCurrentCompaction(state)
      header.querySelector('[data-ai-new-conversation]').onclick = () => {
        stopReadRequest(state, '已因新建对话停止生成，可重试。')
        createConversation()
        state.conversationHistory = conversationHistory
        if (state.renderConversation) state.renderConversation()
        else mountState(state)
      }
      select.onchange = () => {
        const id = select.value
        if (!conversationHistory.conversations.some((item) => item.id === id)) return
        stopReadRequest(state, '已因切换对话停止生成，可重试。')
        conversationHistory.activeId = id
        saveConversationHistory({ keepConversationId: id })
        state.conversationHistory = conversationHistory
        if (state.renderConversation) state.renderConversation()
      }
      header.querySelector('[data-ai-clear-history]').onclick = async () => {
        if (!(await api.ui.confirm('清空 AI 工作台的本地对话历史？不可恢复。'))) return
        stopReadRequest(state)
        clearConversationHistory()
        state.conversationHistory = conversationHistory
        if (state.renderConversation) state.renderConversation()
        else mountState(state)
      }
      return header
    }

    function mountState(state) {
      state.contextKind = CONTEXT_KINDS.has(state.contextKind) ? state.contextKind : routeContextKind()
      state.capability = CAPABILITIES.has(state.capability) ? state.capability : 'ask'
      renderChat(state.host, state)
    }

    function renderWorkbench(host, viewContext) {
      conversationHistory = loadConversationHistory()
      traceFlows.clear()
      answerDrafts.clear()
      for (const conversation of conversationHistory.conversations) {
        for (const turn of conversation.turns) traceFlows.set(turn.traceFlowId || turn.id, { conversationId: conversation.id, turnId: turn.id })
      }
      const state = {
        host,
        viewContext,
        disposed: false,
        conversationHistory,
        contextKind: routeContextKind(),
        capability: 'ask',
        manualCapability: false,
        materialMode: 'attached',
        openMenu: '',
        intent: null,
        busy: false,
        activeRequestId: '',
        messages: null,
      }
      mounted = state
      const canvasCard = host.closest('[data-surface="ai-card"]')
      canvasCard?.setAttribute('data-ai-workbench-mounted', '')
      document.documentElement.classList.add('lsb-ai-workbench-open')
      mountState(state)
      return () => {
        stopReadRequest(state, '已因关闭工作台停止生成，可重试。')
        state.disposed = true
        if (mounted === state) mounted = null
        canvasCard?.removeAttribute('data-ai-workbench-mounted')
        document.documentElement.classList.remove('lsb-ai-workbench-open')
        host.replaceChildren()
      }
    }

    /* M17：单画布 AI 卡片通过 DOM 事件请求同一套工作台渲染器，
       不复制会话、历史或写操作链。 */
    let canvasMountDisposer = null
    const onCanvasAiOpen = (event) => {
      const host = event?.detail?.host
      if (!(host instanceof Element)) return
      canvasMountDisposer?.()
      canvasMountDisposer = renderWorkbench(host, event.detail.viewContext || {})
    }
    const onCanvasAiClose = (event) => {
      const host = event?.detail?.host
      if (!canvasMountDisposer) return
      if (host && mounted?.host && mounted.host !== host) return
      canvasMountDisposer()
      canvasMountDisposer = null
    }
    document.addEventListener('lsb:canvas-ai-open', onCanvasAiOpen)
    document.addEventListener('lsb:canvas-ai-close', onCanvasAiClose)
    /* The skin may be installed before this module. If the user opened the
       card during that short ordering window, replay the request once the
       renderer has registered instead of leaving the card as a placeholder. */
    const pendingCanvasHost = document.querySelector('[data-surface="ai-card"] [data-canvas-ai-host]')
    if (pendingCanvasHost instanceof Element && !pendingCanvasHost.querySelector('[data-ai-workbench]')) {
      const pendingCard = pendingCanvasHost.closest('[data-surface="ai-card"]')
      if (pendingCard && !pendingCard.hidden) {
        canvasMountDisposer = renderWorkbench(pendingCanvasHost, { route: api.page, siteKey: location.origin })
      }
    }

    api.ui.style(
      '.ai-workbench-chat{height:100%;min-height:0;display:flex;flex-direction:column;gap:8px;position:relative}.ai-workbench-chat-context-hint{font-size:11px;color:var(--text-muted,#777);line-height:1.45;padding:0 2px}.ai-workbench-chat-messages{flex:1 1 auto;min-height:0;overflow-y:auto;overscroll-behavior:contain;padding:4px 2px 10px;scrollbar-gutter:stable}.ai-workbench-chat-composer{flex:0 0 auto;position:sticky;bottom:0;z-index:1;padding:9px 10px 7px;background:var(--panel,#fff);border:1px solid var(--line,#ddd);border-radius:22px;box-shadow:0 3px 14px rgba(20,28,45,.06)}' +
        '.ai-workbench-chat-input{display:block;width:100%;min-height:48px;max-height:160px;box-sizing:border-box;resize:vertical;padding:6px 8px;border:0;background:transparent;color:inherit;font:inherit;font-size:13px;line-height:1.5;outline:none}.ai-workbench-chat-toolbar{display:flex;align-items:center;gap:8px;margin-top:5px}.ai-workbench-round-btn,.ai-workbench-send-btn{width:34px;height:34px;flex:0 0 34px;display:inline-grid;place-items:center;padding:0;border:1px solid var(--line,#ddd);border-radius:50%;background:transparent;color:inherit;font:inherit;font-size:21px;line-height:1;cursor:pointer}.ai-workbench-send-btn{margin-left:auto;background:var(--brand-soft,#e8f4f2)!important;border-color:var(--brand,#5eaaa0)!important;color:var(--brand,#5eaaa0)!important;font-weight:700}.ai-workbench-chat-smart{padding:7px 11px;border:1px solid var(--line,#ddd);border-radius:999px;background:transparent;color:inherit;font:inherit;font-size:12px;cursor:pointer}.ai-workbench-chat-validation{min-height:15px;margin-top:3px;color:var(--danger,#c44);font-size:11px}' +
        '.ai-workbench-chat-turn{padding:8px 0 12px;border-bottom:1px solid var(--line-soft,#eee)}.ai-workbench-chat-user{margin-left:auto;max-width:92%;padding:8px 10px;border-radius:10px 10px 2px 10px;background:var(--brand-soft,#e8f4f2);overflow-wrap:anywhere;white-space:pre-wrap;font-size:13px;line-height:1.5}.ai-workbench-chat-assistant{padding:7px 2px 2px;overflow-wrap:anywhere;font-size:13px;line-height:1.6}.ai-workbench-chat-process{margin-top:7px;font-size:11px;color:var(--text-muted,#777)}.ai-workbench-chat-process summary{cursor:pointer;user-select:none}.ai-workbench-chat-phases{display:grid;gap:6px;margin:7px 0 0;padding:0;list-style:none}.ai-workbench-chat-phases li{display:grid;grid-template-columns:94px 1fr;gap:6px;line-height:1.45}.ai-workbench-chat-phases li[data-state="active"] strong{color:var(--brand,#5eaaa0)}.ai-workbench-chat-phases li[data-state="complete"] strong{color:var(--success,#398a7a)}.ai-workbench-chat-phases li[data-state="failed"],.ai-workbench-chat-phases li[data-state="cancelled"]{color:var(--danger,#c44)}.ai-workbench-chat-truncated{display:block;margin:5px 0;color:var(--text-muted,#777);font-size:10px}.ai-workbench-chat-welcome{padding:18px 5px 8px;text-align:left}.ai-workbench-chat-welcome>strong{font-size:16px}.ai-workbench-chat-welcome>p{font-size:12px;color:var(--text-muted,#777);line-height:1.5}.ai-workbench-chat-suggestions{display:flex;flex-wrap:wrap;gap:6px;margin-top:12px}.ai-workbench-chat-mode-options{display:flex;gap:8px;flex-wrap:wrap}.ai-workbench-chat-option{display:flex;align-items:center;gap:5px;font-size:11px;color:var(--text-muted,#777)}.ai-workbench-chat-option select{max-width:150px;padding:4px;border:1px solid var(--line,#ddd);border-radius:6px;background:var(--panel,#fff);color:inherit;font:inherit}' +
        '.ai-workbench-local-action-details{margin:8px 0;padding:7px;border:1px solid var(--line-soft,#eee);border-radius:7px}.ai-workbench-local-action-details>summary{cursor:pointer;font-size:11px;color:var(--text-muted,#777)}' +
        '.ai-workbench-chat-composer-shell{position:relative;z-index:2;flex:0 0 auto}.ai-workbench-chat-menu{position:absolute;bottom:calc(100% + 8px);left:8px;z-index:4;min-width:190px;max-width:calc(100% - 16px);padding:8px;border:1px solid var(--line,#ddd);border-radius:14px;background:var(--panel,#fff);box-shadow:0 8px 24px rgba(20,28,45,.16)}.ai-workbench-conversation-menu{display:flex;align-items:center;gap:5px;flex-wrap:wrap}.ai-workbench-chat-menu-title{padding:2px 5px 6px;color:var(--text-muted,#777);font-size:11px}.ai-workbench-chat-capabilities{display:grid;gap:3px}.ai-workbench-chat-menu-item{display:block;width:100%;padding:7px 8px;border:0;border-radius:8px;background:transparent;color:inherit;text-align:left;font:inherit;font-size:12px;cursor:pointer}.ai-workbench-chat-menu-item:hover,.ai-workbench-chat-menu-item:focus-visible,.ai-workbench-chat-menu-item[data-selected]{background:var(--brand-soft,#e8f4f2)}.ai-workbench-chat-menu-item:disabled{opacity:.45;cursor:not-allowed}.ai-workbench-chat-mode-options{display:flex;gap:8px;flex-wrap:wrap;margin-top:6px;padding-top:6px;border-top:1px solid var(--line-soft,#eee)}.ai-workbench-chat-option{display:flex;align-items:center;gap:5px;font-size:11px;color:var(--text-muted,#777)}.ai-workbench-chat-option select{max-width:150px;padding:4px;border:1px solid var(--line,#ddd);border-radius:6px;background:var(--panel,#fff);color:inherit;font:inherit}.ai-workbench-conversation-list{flex:1;min-width:0;max-width:100%;box-sizing:border-box;padding:5px 6px;border:1px solid var(--line,#ddd);border-radius:7px;background:var(--panel,#fff);color:inherit;font:inherit;font-size:12px}.ai-workbench-compaction-status{font-size:10px;color:var(--text-muted,#777);white-space:nowrap}' +
        '.ai-workbench-btn{border:1px solid var(--line,#ddd);border-radius:7px;background:var(--panel,#fff);color:inherit;font:inherit;font-size:12px;cursor:pointer;padding:5px 8px}' +
        '.ai-workbench-primary{background:var(--brand-soft,#e8f4f2)!important;border-color:var(--brand,#5eaaa0)!important;color:var(--brand,#5eaaa0)!important;font-weight:600}' +
        '.ai-workbench-desc,.ai-workbench-empty,.ai-workbench-wait{padding:7px 0;color:var(--text-muted,#777);font-size:12px;line-height:1.55}' +
        '.ai-workbench-actions{display:flex;flex-wrap:wrap;gap:6px;margin:8px 0}' +
        '.ai-workbench-action-steps{padding-left:22px}.ai-workbench-action-steps li{padding:7px 0;border-bottom:1px solid var(--line-soft,#eee)}.ai-workbench-action-steps li[data-state="failed"]{color:var(--danger,#c44)}.ai-workbench-action-steps li[data-state="completed"]{color:var(--success,#398a7a)}.ai-workbench-action-steps strong,.ai-workbench-action-steps small{display:block}.ai-workbench-action-preview{margin:3px 0}.ai-workbench-action-steps code{display:block;overflow-wrap:anywhere;color:var(--text-muted,#777);font-size:10px}.ai-workbench-action-result{margin-top:4px;font-size:11px}.ai-workbench-action-result a{margin-left:5px;color:var(--brand,#5eaaa0)}' +
        '.ai-workbench-action-history{margin-top:12px;font-size:11px;color:var(--text-muted,#777)}.ai-workbench-action-history>div{padding:3px 0}' +
        '.ai-workbench-facts{margin:8px 0;color:var(--text-muted,#777);font-size:11px}.ai-workbench-result{max-height:48vh;overflow:auto;line-height:1.65}' +
        '.ai-workbench-result h1,.ai-workbench-result h2,.ai-workbench-result h3{font-size:14px}.ai-workbench-citations{margin-top:10px;padding-top:7px;border-top:1px solid var(--line-soft,#eee);font-size:11px}.ai-workbench-citations strong{display:block;margin-bottom:4px}.ai-workbench-citations a{color:var(--brand,#5eaaa0)}' +
        '.ai-workbench-freshness{display:flex;align-items:center;gap:5px;flex-wrap:wrap;margin:7px 0;color:var(--text-muted,#777);font-size:11px}.ai-workbench-freshness[data-ai-freshness="fresh"]>span{color:var(--success,#398a7a)}.ai-workbench-freshness[data-ai-freshness="material-stale"],.ai-workbench-freshness[data-ai-freshness="citation-stale"],.ai-workbench-freshness[data-ai-freshness="unverifiable"],.ai-workbench-freshness[data-ai-freshness="legacy"]{color:var(--warning,#a66b00)}.ai-workbench-freshness .ai-workbench-actions{margin:0}.ai-workbench-citation-diff,.ai-workbench-revisions{margin:7px 0;padding:6px;border:1px solid var(--line-soft,#eee);border-radius:7px;font-size:11px;color:var(--text-muted,#777)}.ai-workbench-citation-diff summary,.ai-workbench-revisions summary{cursor:pointer}.ai-workbench-citation-diff section{margin-top:6px}.ai-workbench-citation-diff section strong{display:block;color:inherit}.ai-workbench-revision{padding:6px 0;border-top:1px solid var(--line-soft,#eee)}.ai-workbench-revision strong{display:block;margin-bottom:3px;color:var(--text,#333)}' +
      '.ai-workbench-field{display:flex;align-items:center;justify-content:space-between;gap:7px;margin:8px 0;font-size:12px}.ai-workbench-field select{max-width:65%;padding:4px 6px;border:1px solid var(--line,#ddd);border-radius:6px;background:var(--panel,#fff);color:inherit}' +
        '.ai-workbench-chat{background:#0d1118;color:#e7edf7;border:0;border-radius:0;padding:0 12px 14px;gap:0;--ai-line:rgba(190,210,235,.14);--ai-muted:#93a1b5;--ai-brand:#8ab4ff;--ai-card:#151c27;--ai-card-soft:#1b2635}.ai-workbench-topbar{display:flex;align-items:center;gap:6px;min-height:44px;padding:0 2px;color:#e7edf7}.ai-workbench-title{font-size:14px;font-weight:600;letter-spacing:.01em}.ai-workbench-icon-btn{width:30px;height:30px;margin-left:auto;border:0;border-radius:50%;background:transparent;color:#b5c0d2;font:inherit;font-size:20px;line-height:1;cursor:pointer}.ai-workbench-icon-btn+[data-ai-workbench-close]{margin-left:0;font-size:22px}.ai-workbench-icon-btn:hover{background:rgba(255,255,255,.08);color:#fff}.ai-workbench-chat-content{display:flex;flex:1 1 auto;min-height:0;flex-direction:column;position:relative}.ai-workbench-chat-messages{padding:4px 3px 12px;scrollbar-color:#334258 transparent}.ai-workbench-chat-messages[hidden]{display:none}.ai-workbench-chat-welcome{display:flex;flex:1 1 auto;min-height:260px;flex-direction:column;align-items:center;justify-content:center;gap:8px;padding:28px 12px 30px}.ai-workbench-chat-welcome[hidden]{display:none}.ai-workbench-chat-welcome>strong{font-size:18px;font-weight:600;color:#f2f6fd}.ai-workbench-chat-welcome>p{max-width:280px;margin:0;color:var(--ai-muted);font-size:12px;line-height:1.55}.ai-workbench-star{display:grid;place-items:center;width:56px;height:56px;margin-bottom:4px;color:#8ab4ff;font-size:48px;line-height:1;text-shadow:12px -9px 0 #f8c45b,-12px 7px 0 #6ed6a0}.ai-workbench-chat-suggestions{display:grid;grid-template-columns:1fr;gap:8px;width:100%;max-width:310px;margin-top:14px}.ai-workbench-suggestion{min-height:38px;padding:8px 12px;border:1px solid var(--ai-line);border-radius:14px;background:var(--ai-card);color:#d8e1ee;text-align:left;font:inherit;font-size:12px;cursor:pointer}.ai-workbench-suggestion:hover{border-color:rgba(138,180,255,.7);background:var(--ai-card-soft)}.ai-workbench-chat-composer-shell{position:relative;z-index:2;flex:0 0 auto;margin-top:8px;padding:8px;border:1px solid var(--ai-line);border-radius:20px;background:linear-gradient(155deg,#182334,#101722 68%);box-shadow:0 10px 28px rgba(0,0,0,.28)}.ai-workbench-material{display:flex;align-items:center;gap:6px;min-height:24px;margin:0 2px 4px;padding:3px 7px;border-radius:8px;background:rgba(138,180,255,.12);color:#bdd2ef;font-size:10px}.ai-workbench-material[hidden]{display:none}.ai-workbench-material-label{min-width:0;overflow:hidden;text-overflow:ellipsis;white-space:nowrap}.ai-workbench-material-remove{flex:0 0 auto;border:0;background:transparent;color:#9db2cf;font:inherit;font-size:16px;line-height:1;cursor:pointer}.ai-workbench-chat-composer{border:0;background:transparent;box-shadow:none;padding:2px 2px 0}.ai-workbench-chat-input{min-height:52px;color:#f0f4fb;font-size:13px}.ai-workbench-chat-input::placeholder{color:#76859a}.ai-workbench-chat-toolbar{margin-top:4px}.ai-workbench-round-btn,.ai-workbench-send-btn{border-color:var(--ai-line);color:#c6d4e8}.ai-workbench-send-btn{background:#8ab4ff!important;border-color:#8ab4ff!important;color:#0c1420!important}.ai-workbench-model{max-width:150px;margin-left:auto;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;padding:6px 9px;border:1px solid var(--ai-line);border-radius:999px;background:transparent;color:#aebdd0;font:inherit;font-size:11px;cursor:pointer}.ai-workbench-chat-menu{border-color:var(--ai-line);background:#172131;color:#e7edf7;box-shadow:0 12px 28px rgba(0,0,0,.34)}.ai-workbench-chat-menu-title{color:#9aabc0}.ai-workbench-chat-menu-item:hover,.ai-workbench-chat-menu-item:focus-visible,.ai-workbench-chat-menu-item[data-selected]{background:rgba(138,180,255,.15)}.ai-workbench-conversation-menu{right:4px;left:4px;display:flex;align-items:center;gap:5px;flex-wrap:wrap}.ai-workbench-conversation-menu[hidden]{display:none}.ai-workbench-fallback{margin:4px 2px 0;color:#aebdd0;font-size:11px}.ai-workbench-fallback>summary{cursor:pointer;user-select:none}.ai-workbench-fallback[open] .ai-workbench-chat-menu{position:relative;left:auto;bottom:auto;min-width:0;max-width:none;margin-top:5px;box-shadow:none}.ai-workbench-chat-validation{color:#ff9c9c}.ai-workbench-chat-context-hint{color:var(--ai-muted)}.ai-workbench-chat-user{background:#263854;color:#eef4ff}.ai-workbench-chat-assistant{color:#e4ebf5}.ai-workbench-chat-turn{border-bottom-color:var(--ai-line)}.ai-workbench-chat-process{color:var(--ai-muted)}.ai-workbench-chat-suggestions .ai-workbench-btn{background:var(--ai-card);border-color:var(--ai-line);color:#d8e1ee}.ai-workbench-btn{border-color:var(--ai-line);background:var(--ai-card);color:#d8e1ee}',
    )

    api.ui.shellAsideView({
      id: 'ai-workbench',
      label: 'AI',
      order: 20,
      visible: () => true,
      render: renderWorkbench,
    })

    api.on('ai:trace', (event) => {
      if (disposed || !event || typeof event !== 'object') return
      const flowId = String(event.flowId || '')
      const target = traceFlows.get(flowId)
      if (!target) return
      const updated = appendTurnTrace(target.conversationId, target.turnId, event)
      if (updated && mounted && conversationHistory.activeId === target.conversationId) mounted.renderConversation?.()
    })

    api.on('route:changed', () => {
      stopReadRequest(mounted, '已因页面切换停止此请求。')
      for (const conversation of conversationHistory.conversations) {
        for (const turn of conversation.turns) {
          if (turn.state === 'cancelled' && turn.answer === '已因页面切换停止此请求。') turn.state = 'stale'
        }
      }
      for (const record of actionSession.records.values()) {
        if (!['ready', 'regenerating', 'running', 'partial', 'failed'].includes(record.status)) continue
        const writeInterrupted = record.write && record.status === 'running'
        record.status = writeInterrupted ? 'interrupted' : 'expired'
        for (const step of record.steps) {
          if (step.state === 'pending') step.state = 'skipped'
          else if (step.state === 'running') step.state = writeInterrupted ? 'interrupted' : 'skipped'
        }
        saveActionHistory(record)
        recordActionPhase(record, {
          stage: 'action', state: 'failed',
          summary: writeInterrupted ? '页面已变化，写操作结果未知；请先检查站点' : '页面已变化，计划已过期',
        })
      }
      generation += 1
      if (!mounted || mounted.disposed) return
      for (const conversation of conversationHistory.conversations) {
        for (const turn of conversation.turns) {
          if (turn.state !== 'pending') continue
          turn.state = 'stale'
          if (!turn.answer) turn.answer = '已因页面切换停止此请求。'
          const stopSummary = '已因页面切换停止更新此请求'
          const hadActivePhase = turn.phases.some((phase) => phase.state === 'active')
          turn.phases = turn.phases.map((phase) => phase.state === 'active'
            ? { ...phase, state: 'cancelled', summary: stopSummary }
            : phase)
          turn.trace = turn.trace.map((event) => event.state === 'active'
            ? { ...event, state: 'skipped', summary: stopSummary, evidence: 'partial' }
            : event)
          if (!hadActivePhase && !turn.phases.some((phase) => phase.state === 'cancelled')) {
            turn.phases.push({ stage: 'context', state: 'cancelled', summary: stopSummary })
          }
          if (!turn.trace.some((event) => event.state === 'skipped')) {
            const flowId = turn.traceFlowId || turn.id
            const trace = normalizedTraceEvent({
              id: `${flowId}:route-stopped`,
              flowId,
              stage: 'scope',
              state: 'skipped',
              title: '读取范围',
              summary: stopSummary,
              evidence: 'partial',
            }, flowId, `${flowId}:route-stopped`)
            if (trace) turn.trace.push(trace)
          turn.trace = turn.trace.slice(-TRACE_LIMIT)
          turn.phases = turn.phases.slice(-PHASE_LIMIT)
          }
        }
      }
      saveConversationHistory()
      mounted.viewContext = context()
      mounted.contextKind = routeContextKind()
      mounted.capability = 'ask'
      mounted.busy = false
      mounted.activeRequestId = ''
      mountState(mounted)
    })

    api.on('plugin:disabled', () => {
      let changed = false
      for (const record of actionSession.records.values()) {
        if (!['ready', 'regenerating', 'running', 'partial', 'failed'].includes(record.status)) continue
        const actionContext = copilot.actionContext(record.command)
        const invalid = record.plan.steps.some((step) => !api.ai.validate(step, actionContext, { requireActionBinding: true }).ok)
        if (!invalid) continue
        const writeInterrupted = record.write && record.status === 'running'
        record.status = writeInterrupted ? 'interrupted' : 'expired'
        record.steps.forEach((step) => {
          if (step.state === 'pending') step.state = 'skipped'
          else if (step.state === 'running') step.state = writeInterrupted ? 'interrupted' : 'skipped'
        })
        saveActionHistory(record)
        recordActionPhase(record, {
          stage: 'action', state: 'failed',
          summary: writeInterrupted ? '写操作提供方已变化，结果未知；请检查站点' : '动作提供方已变化，计划已过期',
        })
        changed = true
      }
      if (changed && mounted?.renderConversation) mounted.renderConversation()
    })

    api.onDispose(() => {
      stopReadRequest(mounted, '已因关闭工作台停止生成，可重试。')
      disposed = true
      generation += 1
      if (mounted) {
        mounted.disposed = true
        mounted.host.replaceChildren()
        mounted = null
      }
      document.documentElement.classList.remove('lsb-ai-workbench-open')
      traceFlows.clear()
      answerDrafts.clear()
      document.removeEventListener('lsb:canvas-ai-open', onCanvasAiOpen)
      document.removeEventListener('lsb:canvas-ai-close', onCanvasAiClose)
      canvasMountDisposer?.()
      canvasMountDisposer = null
    })

    return { conversationContextForTurn, detectChatIntent }
  }

  const w = typeof unsafeWindow !== 'undefined' ? unsafeWindow : window
  if (w.LSB && w.LSB.register) w.LSB.register(manifest, setup)
  else ;(w.LSB_PLUGINS = w.LSB_PLUGINS || []).push({ manifest, setup })
})()
