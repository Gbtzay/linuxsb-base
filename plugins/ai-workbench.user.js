// ==UserScript==
// @name         LSB·AI 工作台
// @namespace    https://linux.sb/
// @version      0.2.0
// @description  氢壳右栏 AI 工作台：操作台、当前帖子副驾与追踪摘要。只读，不自动提交站内动作。
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
    version: '0.2.0',
    description: '氢壳右栏的 AI 操作台、当前帖子副驾与追踪摘要；只读，不自动发帖或改变追踪状态',
    author: 'you',
    requires: {
      base: '^0.1.43',
      plugins: { 'ai-copilot': '^0.7.0', 'ai-actions': '^0.1.0' },
    },
    permissions: ['read', 'storage', 'ui', 'events'],
  }

  const SECTION_LABELS = [
    ['console', '操作台'],
    ['topic', '当前帖子'],
    ['tracking', '追踪'],
  ]
  const TOPIC_MODES = [
    ['ask', '问答'],
    ['analyze', '讨论分析'],
    ['digest', '新回复'],
    ['draft', '回复草稿'],
  ]
  const ACTION_HISTORY_KEY = 'action-history'
  const ACTION_HISTORY_LIMIT = 20
  const ROUTE_SORTS = new Set(['post', 'comment', 'lucky', 'card', 'red_packet'])
  const ROUTE_TABS = new Set(['topics', 'replies', 'attachments', 'notifications', 'points_rewards', 'favorites', 'mine', 'followed'])

  function setup(api) {
    const copilot = api.plugin('ai-copilot')
    let disposed = false
    let generation = 0
    let mounted = null
    let commandMode = 'query'
    let actionSession = { record: null, history: loadActionHistory() }
    let actionSequence = 0

    const esc = (value) => api.util.esc(String(value ?? ''))
    const safeHref = (value) => {
      const href = String(value || '').trim()
      return /^https?:\/\//i.test(href) || /^\/(?!\/)/.test(href) ? href : ''
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

    function cleanStoredRouteFingerprint(value) {
      try {
        return routeFingerprint(JSON.parse(String(value || '')))
      } catch {
        return routeFingerprint({})
      }
    }

    function actionHistoryRecord(record) {
      if (!record?.plan) return null
      const cleanArgs = (args) => {
        const output = {}
        for (const [key, value] of Object.entries(args || {}).slice(0, 12)) {
          if (typeof value === 'string') output[String(key).slice(0, 80)] = value.slice(0, 240)
          else if (typeof value === 'number' && Number.isFinite(value)) output[String(key).slice(0, 80)] = value
          else if (typeof value === 'boolean') output[String(key).slice(0, 80)] = value
        }
        return output
      }
      return {
        id: String(record.id || `${Number(record.ts || 0)}-${String(record.plan.summary || '').slice(0, 40)}`).slice(0, 120),
        command: String(record.command || '').slice(0, 500),
        plan: {
          version: 1,
          summary: String(record.plan.summary || '').slice(0, 240),
          steps: (Array.isArray(record.plan.steps) ? record.plan.steps : []).slice(0, 5).map((step) => ({
            action: String(step.action || '').slice(0, 120),
            args: step.args && typeof step.args === 'object' && !Array.isArray(step.args) ? cleanArgs(step.args) : {},
            actionVersion: Number.isInteger(step.actionVersion) ? step.actionVersion : null,
            actionProvider: String(step.actionProvider || '').slice(0, 120),
          })),
        },
        routeFingerprint: cleanStoredRouteFingerprint(record.routeFingerprint),
        status: String(record.status || 'ready').slice(0, 20),
        steps: (Array.isArray(record.steps) ? record.steps : []).slice(0, 5).map((step) => ({
          state: String(step.state || 'pending').slice(0, 20),
          error: String(step.error || '').slice(0, 240),
        })),
        ts: Number(record.ts || Date.now()),
      }
    }

    function loadActionHistory() {
      try {
        const raw = api.store.get(ACTION_HISTORY_KEY, [])
        const rows = (Array.isArray(raw) ? raw : []).map(actionHistoryRecord).filter(Boolean).slice(-ACTION_HISTORY_LIMIT)
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
        /* history is useful but does not block a read-only action */
      }
    }

    function settingHint(host, message = '请先在「AI 总结」设置页填写 API 端点与 Key。') {
      host.innerHTML = `<div class="ai-workbench-empty"><p>${esc(message)}</p><button type="button" class="ai-workbench-btn ai-workbench-primary" data-ai-open-settings>打开 AI 总结设置</button></div>`
      host.querySelector('[data-ai-open-settings]').onclick = () => api.ui.openPanel('ai-summary')
    }

    function renderCitations(host, rows) {
      const citations = (Array.isArray(rows) ? rows : []).filter((row) => Number(row?.floor) > 0)
      if (!citations.length) return
      const box = document.createElement('div')
      box.className = 'ai-workbench-citations'
      const title = document.createElement('strong')
      title.textContent = '引用楼层'
      box.appendChild(title)
      for (const row of citations) {
        const line = document.createElement('div')
        const href = row.known ? safeHref(row.href) : ''
        if (href) {
          const link = document.createElement('a')
          link.href = href
          link.textContent = `[#${row.floor}] ${row.authorName || '楼层'}`
          line.appendChild(link)
          if (row.excerpt) line.append(`：${row.excerpt}`)
        } else {
          line.textContent = `[#${row.floor}] 当前采集范围没有此楼层`
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

    function renderError(host, error) {
      host.innerHTML = `<div class="ai-workbench-empty ai-workbench-error"></div><button type="button" class="ai-workbench-btn" data-ai-retry>重试</button>`
      host.querySelector('.ai-workbench-error').textContent = String(error?.message || error || 'AI 请求失败')
      return host.querySelector('[data-ai-retry]')
    }

    function renderConsoleQuery(state, host) {
      if (!copilot?.configured?.()) {
        settingHint(host)
        return
      }
      host.innerHTML = `
        <div class="ai-workbench-desc">自由提问当前帖子和所有活动追踪项；模型先生成受限计划，再由本地执行。</div>
        <div class="ai-workbench-quick" data-ai-console-quick-list></div>
        <textarea class="ai-workbench-input" data-ai-console-question rows="3" placeholder="例如：哪些追踪项最近有新证据？"></textarea>
        <ol class="ai-workbench-stages" data-ai-console-stages>
          <li data-stage="plan">计划</li><li data-stage="local">本地查询</li><li data-stage="answer">回答</li>
        </ol>
        <div class="ai-workbench-actions"><button type="button" class="ai-workbench-btn ai-workbench-primary" data-ai-console-run>运行查询</button></div>
        <div data-ai-console-result></div>`
      const quick = ['当前帖子有哪些未解决问题？', '哪些追踪项最近有新证据？', '哪些问题可能已经解决？', '给我汇总所有活动追踪项。']
      const quickHost = host.querySelector('[data-ai-console-quick-list]')
      for (const question of quick) {
        const button = document.createElement('button')
        button.type = 'button'
        button.className = 'ai-workbench-btn'
        button.setAttribute('data-ai-console-quick', '')
        button.textContent = question
        button.onclick = () => {
          host.querySelector('[data-ai-console-question]').value = question
        }
        quickHost.appendChild(button)
      }
      const run = async () => {
        const question = host.querySelector('[data-ai-console-question]').value.trim()
        if (!question) return
        const button = host.querySelector('[data-ai-console-run]')
        const resultHost = host.querySelector('[data-ai-console-result]')
        const token = generation
        button.disabled = true
        const setStage = (stage) => {
          if (!isAlive(state, host, token)) return
          for (const item of host.querySelectorAll('[data-stage]')) {
            const order = ['plan', 'local', 'answer'].indexOf(item.getAttribute('data-stage'))
            const current = ['plan', 'local', 'answer'].indexOf(stage)
            item.dataset.state = order === current ? 'active' : order < current ? 'done' : ''
          }
        }
        setStage('plan')
        try {
          const record = await copilot.runConsoleQuery({ question, onStage: setStage })
          if (!isAlive(state, host, token)) return
          renderRecord(resultHost, record, state, token)
        } catch (error) {
          if (!isAlive(state, host, token)) return
          const retry = renderError(resultHost, error)
          retry.onclick = () => void run()
        } finally {
          if (isAlive(state, host, token)) button.disabled = false
        }
      }
      host.querySelector('[data-ai-console-run]').onclick = () => void run()
    }

    function renderActionPlan(host, state, token) {
      host.replaceChildren()
      const record = actionSession.record
      if (!record) return
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
        const action = api.ai.actions({ route: copilot.actionContext(record.command).route }).find((item) => item.id === step.action)
        const title = document.createElement('strong')
        title.textContent = `${index + 1}. ${action?.label || step.action}`
        const preview = document.createElement('div')
        preview.className = 'ai-workbench-action-preview'
        preview.textContent = record.previews[index]?.text || '动作预览不可用'
        const args = document.createElement('code')
        args.textContent = JSON.stringify(step.args)
        const status = document.createElement('small')
        status.textContent = record.steps[index]?.error
          ? `失败：${record.steps[index].error}`
          : ({ pending: '待执行', running: '执行中', completed: '已完成', failed: '失败', skipped: '未执行' }[row.dataset.state] || row.dataset.state)
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
        }
        list.appendChild(row)
      })
      host.appendChild(list)

      const status = document.createElement('div')
      status.setAttribute('data-ai-action-status', '')
      status.textContent = ({
        ready: '计划已生成，尚未执行。',
        running: '正在按顺序执行…',
        completed: '已完成。',
        partial: '部分完成 partial；后续步骤已停止。',
        failed: '执行失败，后续步骤已停止。',
        expired: '计划已过期，请重新生成。',
        cancelled: '计划已取消。',
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
        execute.onclick = () => void executeActionIndexes(state, host, token, record.steps.map((step, index) => step.state === 'pending' ? index : -1).filter((index) => index >= 0))
        actions.appendChild(execute)
        if (record.source === 'model') {
          const regenerate = document.createElement('button')
          regenerate.type = 'button'
          regenerate.className = 'ai-workbench-btn'
          regenerate.setAttribute('data-ai-action-regenerate', '')
          regenerate.textContent = '重新生成'
          regenerate.onclick = () => void actionSession.regenerate?.(record.command)
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
          renderActionPlan(host, state, generation)
        }
        actions.appendChild(cancel)
      }
      if (record.status === 'partial' || record.status === 'failed') {
        const retry = document.createElement('button')
        retry.type = 'button'
        retry.className = 'ai-workbench-btn ai-workbench-primary'
        retry.setAttribute('data-ai-action-retry-failed', '')
        retry.textContent = '仅重试失败步骤'
        retry.onclick = () => void executeActionIndexes(state, host, token, record.steps.map((step, index) => step.state === 'failed' ? index : -1).filter((index) => index >= 0))
        actions.appendChild(retry)
      }
      if (record.status === 'expired' && record.source === 'model') {
        const regenerate = document.createElement('button')
        regenerate.type = 'button'
        regenerate.className = 'ai-workbench-btn ai-workbench-primary'
        regenerate.setAttribute('data-ai-action-regenerate', '')
        regenerate.textContent = '重新生成计划'
        regenerate.onclick = () => void actionSession.regenerate?.(record.command)
        actions.appendChild(regenerate)
      }
      if (actions.childElementCount) host.appendChild(actions)
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

    async function executeActionIndexes(state, host, token, indexes) {
      const record = actionSession.record
      if (!record || !indexes.length || record.status === 'running') return
      const currentContext = copilot.actionContext(record.command)
      if (routeFingerprint(currentContext.route) !== record.routeFingerprint) {
        record.status = 'expired'
        saveActionHistory(record)
        renderActionPlan(host, state, generation)
        return
      }
      const validated = api.ai.validatePlan(record.plan, currentContext, { requireActionBinding: true })
      if (!validated.ok) {
        record.status = 'expired'
        record.steps.forEach((step) => { if (step.state === 'pending') step.state = 'skipped' })
        saveActionHistory(record)
        renderActionPlan(host, state, generation)
        return
      }
      const runToken = generation
      record.status = 'running'
      for (const index of indexes) {
        if (!isAlive(state, host, runToken) || actionSession.record !== record) return
        const step = record.plan.steps[index]
        const freshContext = copilot.actionContext(record.command)
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
        renderActionPlan(host, state, runToken)
        try {
          const result = await api.ai.execute(step, freshContext)
          if (!isAlive(state, host, runToken) || actionSession.record !== record) return
          const navigationHref = result?.kind === 'navigation' ? internalActionPath(result.url) : ''
          if (result?.kind === 'navigation' && (index !== record.steps.length - 1 || !navigationHref)) {
            throw new Error(index !== record.steps.length - 1 ? '导航动作必须位于计划末尾' : '动作返回了不安全的站内路径')
          }
          record.steps[index].state = 'completed'
          record.results[index] = result
          record.steps[index].error = ''
          saveActionHistory(record)
          renderActionPlan(host, state, runToken)
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
          if (!isAlive(state, host, runToken) || actionSession.record !== record) return
          record.steps[index].state = 'failed'
          record.steps[index].error = String(error?.message || error || '动作执行失败').slice(0, 240)
          for (const later of indexes) {
            if (later > index && record.steps[later].state === 'pending') record.steps[later].state = 'skipped'
          }
          record.status = record.steps.some((item) => item.state === 'completed') ? 'partial' : 'failed'
          saveActionHistory(record)
          renderActionPlan(host, state, runToken)
          return
        }
      }
      if (record.status !== 'expired') {
        record.status = record.steps.every((step) => step.state === 'completed') ? 'completed' : 'partial'
      }
      saveActionHistory(record)
      if (isAlive(state, host, runToken)) renderActionPlan(host, state, runToken)
    }

    function renderActionMode(state, host) {
      const availableContext = copilot.actionContext('')
      const catalog = api.ai.actions(availableContext)
      host.innerHTML = `
        <div class="ai-workbench-desc">站内操作只使用已登记的只读动作。AI 生成计划后需由你确认执行；未配置模型时也可从动作目录手动建立单步计划。</div>
        <div class="ai-workbench-quick" data-ai-action-quick-list></div>
        <textarea class="ai-workbench-input" data-ai-action-command rows="3" placeholder="例如：搜索标题中的缓存，或打开插件设置"></textarea>
        <div class="ai-workbench-actions"><button type="button" class="ai-workbench-btn ai-workbench-primary" data-ai-action-run>生成操作计划</button></div>
        <div data-ai-action-message></div>
        <fieldset class="ai-workbench-local-action"><legend>本地动作目录</legend><label class="ai-workbench-field">动作<select data-ai-action-select></select></label><div data-ai-action-fields></div><button type="button" class="ai-workbench-btn" data-ai-action-local-plan>建立单步计划</button></fieldset>
        <div data-ai-action-plan></div>
        <div class="ai-workbench-action-history" data-ai-action-history></div>`
      const input = host.querySelector('[data-ai-action-command]')
      const quickHost = host.querySelector('[data-ai-action-quick-list]')
      for (const command of ['搜索标题中的缓存', '打开插件设置']) {
        const button = document.createElement('button')
        button.type = 'button'
        button.className = 'ai-workbench-btn'
        button.textContent = command
        button.onclick = () => { input.value = command }
        quickHost.appendChild(button)
      }
      const message = host.querySelector('[data-ai-action-message]')
      const planHost = host.querySelector('[data-ai-action-plan]')
      const token = generation
      const installRecord = (command, plan, previews, source = 'model') => {
        const route = copilot.actionContext(command).route
        actionSession.record = {
          id: `${Date.now()}-${++actionSequence}`,
          command: String(command || '').slice(0, 500),
          plan,
          previews,
          source,
          routeFingerprint: routeFingerprint(route),
          status: 'ready',
          steps: plan.steps.map(() => ({ state: 'pending', error: '' })),
          results: [],
          ts: Date.now(),
        }
        saveActionHistory(actionSession.record)
        renderActionPlan(planHost, state, generation)
      }
      const runButton = host.querySelector('[data-ai-action-run]')
      runButton.onclick = async () => {
        const command = input.value.trim()
        if (!command) return
        const force = runButton.dataset.force === 'true'
        delete runButton.dataset.force
        runButton.disabled = true
        message.textContent = ''
        try {
          if (!copilot.configured()) throw new Error('模型未配置；可从本地动作目录建立单步计划。')
          const record = await copilot.planActions({ command, force })
          if (!isAlive(state, host, token)) return
          installRecord(command, record.plan, record.previews, 'model')
        } catch (error) {
          if (isAlive(state, host, token)) message.textContent = String(error?.message || error || '无法生成操作计划')
        } finally {
          if (isAlive(state, host, token)) runButton.disabled = false
        }
      }
      actionSession.regenerate = (command) => {
        input.value = command
        runButton.dataset.force = 'true'
        runButton.click()
      }

      const select = host.querySelector('[data-ai-action-select]')
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
      const fieldsHost = host.querySelector('[data-ai-action-fields]')
      const renderFields = () => {
        fieldsHost.replaceChildren()
        const action = catalog.find((item) => item.id === select.value)
        for (const [key, schema] of Object.entries(action?.args || {})) {
          const label = document.createElement('label')
          label.className = 'ai-workbench-field'
          label.append(document.createTextNode(key))
          let inputNode
          if (schema.type === 'enum') {
            inputNode = document.createElement('select')
            if (schema.optional) {
              const empty = document.createElement('option')
              empty.value = ''
              empty.textContent = '不指定'
              inputNode.appendChild(empty)
            }
            for (const value of schema.values || []) {
              const option = document.createElement('option')
              option.value = value
              option.textContent = value
              inputNode.appendChild(option)
            }
          } else {
            inputNode = document.createElement('input')
            inputNode.type = schema.type === 'number' ? 'number' : schema.type === 'boolean' ? 'checkbox' : 'text'
            if (schema.min != null) inputNode.min = String(schema.min)
            if (schema.max != null) inputNode.max = String(schema.max)
            if (schema.maxLength != null) inputNode.maxLength = Number(schema.maxLength)
          }
          inputNode.setAttribute('data-ai-action-arg', key)
          if (schema.optional) inputNode.dataset.optional = 'true'
          label.appendChild(inputNode)
          fieldsHost.appendChild(label)
        }
      }
      select.onchange = renderFields
      renderFields()
      host.querySelector('[data-ai-action-local-plan]').onclick = () => {
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
        const localContext = copilot.actionContext(input.value.trim())
        const preview = api.ai.preview(step, localContext)
        if (!preview.ok) {
          message.textContent = `参数无效：${preview.error?.message || preview.error?.code || '校验失败'}`
          return
        }
        const plan = { version: 1, summary: preview.text, steps: [step] }
        const checked = api.ai.validatePlan(plan, localContext)
        if (!checked.ok) {
          message.textContent = `计划无效：${checked.errors[0]?.message || checked.errors[0]?.code}`
          return
        }
        installRecord(input.value.trim() || preview.text, checked.plan, [preview], 'local')
        message.textContent = '已建立本地计划。'
      }
      renderActionPlan(planHost, state, token)
      const historyHost = host.querySelector('[data-ai-action-history]')
      const history = actionSession.history
      if (history.length) {
        const title = document.createElement('strong')
        title.textContent = `最近计划（${history.length}）`
        historyHost.appendChild(title)
        for (const item of history.slice(0, 5)) {
          const row = document.createElement('div')
          row.textContent = `${item.command || item.plan.summary} · ${item.status}`
          historyHost.appendChild(row)
        }
      }
    }

    function renderConsole(state, host) {
      host.innerHTML = `
        <div class="ai-workbench-command-modes" role="tablist">
          <button type="button" class="ai-workbench-btn" data-ai-command-mode="query">查询</button>
          <button type="button" class="ai-workbench-btn" data-ai-command-mode="action">站内操作</button>
        </div>
        <section data-ai-command-pane="query"></section>
        <section data-ai-command-pane="action" hidden></section>`
      const queryPane = host.querySelector('[data-ai-command-pane="query"]')
      const actionPane = host.querySelector('[data-ai-command-pane="action"]')
      const select = (mode) => {
        commandMode = mode
        for (const button of host.querySelectorAll('[data-ai-command-mode]')) {
          const active = button.getAttribute('data-ai-command-mode') === mode
          button.classList.toggle('ai-workbench-primary', active)
          button.setAttribute('aria-selected', active ? 'true' : 'false')
        }
        queryPane.hidden = mode !== 'query'
        actionPane.hidden = mode !== 'action'
        if (mode === 'query') renderConsoleQuery(state, queryPane)
        else renderActionMode(state, actionPane)
      }
      host.querySelector('[data-ai-command-mode="query"]').onclick = () => select('query')
      host.querySelector('[data-ai-command-mode="action"]').onclick = () => select('action')
      select(commandMode)
    }

    function renderTopic(state, host) {
      const ctx = context()
      const topic = ctx.currentTopic
      const route = ctx.route || {}
      if (route.type !== 'topic' || !topic) {
        host.innerHTML = '<div class="ai-workbench-empty">当前页面不是帖子页，帖子副驾暂不可用。</div>'
        return
      }
      host.innerHTML = `
        <div class="ai-workbench-topic-head"><strong data-ai-topic-title></strong><span data-ai-topic-meta></span></div>
        <div class="ai-workbench-topic-nav" data-ai-topic-nav></div>
        <div class="ai-workbench-topic-context" data-ai-topic-context></div>
        <div data-ai-topic-controls></div>
        <div data-ai-topic-result></div>`
      host.querySelector('[data-ai-topic-title]').textContent = topic.title || `主题 #${route.id}`
      host.querySelector('[data-ai-topic-meta]').textContent = ` · ${ctx.currentPosts?.length || topic.posts?.length || 0} 个可见楼层`
      if (topic.loginRequired || topic.repliesLocked) {
        host.querySelector('[data-ai-topic-context]').textContent = '当前页面只返回可见主楼，回复区需要登录；未知楼层不会被当作引用。'
      } else {
        host.querySelector('[data-ai-topic-context]').textContent = '结果只基于当前页面和已采集楼层。'
      }
      const nav = host.querySelector('[data-ai-topic-nav]')
      const controls = host.querySelector('[data-ai-topic-controls]')
      const resultHost = host.querySelector('[data-ai-topic-result]')
      const selectMode = (mode) => {
        for (const button of nav.querySelectorAll('[data-ai-topic-mode]')) {
          button.classList.toggle('ai-workbench-primary', button.getAttribute('data-ai-topic-mode') === mode)
        }
        controls.innerHTML = ''
        if (mode === 'ask') {
          controls.innerHTML = '<textarea class="ai-workbench-input" data-ai-topic-question rows="3" placeholder="问问这篇帖子……"></textarea><div class="ai-workbench-actions"><button type="button" class="ai-workbench-btn ai-workbench-primary" data-ai-topic-run>询问</button></div>'
        } else if (mode === 'analyze') {
          controls.innerHTML = '<label class="ai-workbench-field">分析角度<select data-ai-topic-preset><option>观点分歧</option><option>方案对比</option><option>未解决问题</option></select></label><div class="ai-workbench-actions"><button type="button" class="ai-workbench-btn ai-workbench-primary" data-ai-topic-run>开始分析</button></div>'
        } else if (mode === 'digest') {
          controls.innerHTML = '<div class="ai-workbench-desc">只处理上次起点之后的新回复。</div><div class="ai-workbench-actions"><button type="button" class="ai-workbench-btn ai-workbench-primary" data-ai-topic-run>总结新回复</button></div>'
        } else {
          const posts = (ctx.currentPosts || []).filter((post) => post.content || post.floor === 0)
          const options = posts.map((post) => `<option value="${esc(post.floor)}">${post.floor > 0 ? `#${post.floor}` : '主楼（楼层未知）'} · ${esc(post.authorName || '?')}</option>`).join('')
          controls.innerHTML = `<div class="ai-workbench-desc">只生成草稿，复制后由你决定是否使用。</div><label class="ai-workbench-field">回应楼层<select data-ai-topic-floor>${options}</select></label><label class="ai-workbench-field">语气<select data-ai-topic-tone><option>客观</option><option>简洁</option><option>友好</option><option>技术向</option></select></label><div class="ai-workbench-actions"><button type="button" class="ai-workbench-btn ai-workbench-primary" data-ai-topic-run>生成草稿</button></div>`
        }
        controls.querySelector('[data-ai-topic-run]')?.addEventListener('click', () => {
          const token = generation
          const button = controls.querySelector('[data-ai-topic-run]')
          button.disabled = true
          resultHost.innerHTML = '<div class="ai-workbench-wait">正在处理…</div>'
          const options = mode === 'ask'
            ? { question: controls.querySelector('[data-ai-topic-question]').value.trim() }
            : mode === 'analyze'
              ? { preset: controls.querySelector('[data-ai-topic-preset]').value }
              : mode === 'draft'
                ? { targetFloor: Number(controls.querySelector('[data-ai-topic-floor]').value || 0), tone: controls.querySelector('[data-ai-topic-tone]').value, length: '中' }
                : {}
          void copilot.runTopic(mode, options)
            .then((record) => {
              if (!isAlive(state, host, token)) return
              renderRecord(resultHost, record, state, token)
            })
            .catch((error) => {
              if (!isAlive(state, host, token)) return
              const retry = renderError(resultHost, error)
              retry.onclick = () => controls.querySelector('[data-ai-topic-run]')?.click()
            })
            .finally(() => {
              if (isAlive(state, host, token)) button.disabled = false
            })
        })
      }
      for (const [mode, label] of TOPIC_MODES) {
        const button = document.createElement('button')
        button.type = 'button'
        button.className = 'ai-workbench-btn'
        button.setAttribute('data-ai-topic-mode', mode)
        button.textContent = label
        button.onclick = () => selectMode(mode)
        nav.appendChild(button)
      }
      selectMode('ask')
    }

    function renderTracking(state, host) {
      const overview = copilot.trackingOverview()
      host.innerHTML = `
        <div class="ai-workbench-track-summary"><strong>${overview.activeCount} 个活动问题</strong><span>${overview.pendingCount} 项待处理新证据</span></div>
        <div class="ai-workbench-actions"><button type="button" class="ai-workbench-btn" data-ai-track-refresh>刷新摘要</button><button type="button" class="ai-workbench-btn ai-workbench-primary" data-ai-track-open>查看完整追踪面板</button></div>
        <div data-ai-track-list></div>`
      const list = host.querySelector('[data-ai-track-list]')
      if (!overview.items.length) {
        list.innerHTML = '<div class="ai-workbench-empty">暂无活动追踪项。</div>'
      } else {
        for (const item of overview.items.slice(0, 8)) {
          const row = document.createElement('article')
          row.className = 'ai-workbench-track-item'
          const title = item.title ? `${item.title}：${item.question}` : item.question
          row.innerHTML = `<strong></strong><span></span><small></small>`
          row.querySelector('strong').textContent = title
          row.querySelector('span').textContent = `状态：${item.status}`
          row.querySelector('small').textContent = `${item.topicTitle} · 待处理新证据 ${item.pendingEvidence?.length || 0}`
          list.appendChild(row)
        }
      }
      host.querySelector('[data-ai-track-refresh]').onclick = () => renderTracking(state, host)
      host.querySelector('[data-ai-track-open]').onclick = () => {
        if (api.page.type === 'topic') copilot.openPanel('track')
        else api.ui.toast('请进入帖子页打开完整追踪面板', { type: 'info' })
      }
    }

    function mountState(state) {
      const host = state.host
      host.replaceChildren()
      const root = document.createElement('div')
      root.setAttribute('data-ai-workbench', '')
      const nav = document.createElement('nav')
      nav.className = 'ai-workbench-sections'
      nav.setAttribute('role', 'tablist')
      const panes = document.createElement('div')
      panes.className = 'ai-workbench-panes'
      state.sections = {}
      for (const [id, label] of SECTION_LABELS) {
        const button = document.createElement('button')
        button.type = 'button'
        button.className = 'ai-workbench-section-tab'
        button.setAttribute('role', 'tab')
        button.setAttribute('data-ai-section-tab', id)
        button.textContent = label
        nav.appendChild(button)
        const pane = document.createElement('section')
        pane.setAttribute('data-ai-section', id)
        pane.setAttribute('role', 'tabpanel')
        pane.hidden = true
        state.sections[id] = pane
        panes.appendChild(pane)
        button.onclick = () => select(id)
      }
      root.append(nav, panes)
      host.appendChild(root)
      state.root = root
      function select(id) {
        state.section = id
        for (const button of nav.querySelectorAll('[data-ai-section-tab]')) {
          const active = button.getAttribute('data-ai-section-tab') === id
          button.setAttribute('aria-selected', active ? 'true' : 'false')
          button.classList.toggle('ai-workbench-primary', active)
        }
        for (const [name, pane] of Object.entries(state.sections)) pane.hidden = name !== id
        if (id === 'console') renderConsole(state, state.sections.console)
        else if (id === 'topic') renderTopic(state, state.sections.topic)
        else renderTracking(state, state.sections.tracking)
      }
      state.select = select
      select('console')
    }

    function renderWorkbench(host, viewContext) {
      const state = { host, viewContext, section: 'console', disposed: false, sections: {} }
      mounted = state
      mountState(state)
      return () => {
        state.disposed = true
        if (mounted === state) mounted = null
        host.replaceChildren()
      }
    }

    api.ui.style(
      '.ai-workbench-sections{display:flex;gap:4px;padding:8px 0;border-bottom:1px solid var(--line-soft,#eee)}' +
        '.ai-workbench-section-tab,.ai-workbench-btn{border:1px solid var(--line,#ddd);border-radius:7px;background:var(--panel,#fff);color:inherit;font:inherit;font-size:12px;cursor:pointer;padding:5px 8px}' +
        '.ai-workbench-section-tab{flex:1;min-width:0;border-color:transparent;background:transparent;color:var(--text-muted,#777)}' +
        '.ai-workbench-primary{background:var(--brand-soft,#e8f4f2)!important;border-color:var(--brand,#5eaaa0)!important;color:var(--brand,#5eaaa0)!important;font-weight:600}' +
        '.ai-workbench-panes{padding-top:10px}.ai-workbench-panes>section[hidden]{display:none!important}' +
        '.ai-workbench-desc,.ai-workbench-topic-context,.ai-workbench-empty,.ai-workbench-wait{padding:7px 0;color:var(--text-muted,#777);font-size:12px;line-height:1.55}' +
        '.ai-workbench-quick,.ai-workbench-topic-nav,.ai-workbench-actions{display:flex;flex-wrap:wrap;gap:6px;margin:8px 0}' +
        '.ai-workbench-input{display:block;width:100%;box-sizing:border-box;resize:vertical;min-height:72px;padding:7px;border:1px solid var(--line,#ddd);border-radius:7px;background:var(--panel,#fff);color:inherit;font:inherit}' +
        '.ai-workbench-stages{display:flex;gap:14px;margin:8px 0;padding:0;list-style:none;font-size:11px;color:var(--text-muted,#888)}' +
        '.ai-workbench-stages li[data-state="active"]{color:var(--brand,#5eaaa0);font-weight:600}.ai-workbench-stages li[data-state="done"]{color:var(--success,#3aa08f)}' +
        '.ai-workbench-command-modes{display:flex;gap:6px;margin-bottom:8px}.ai-workbench-command-modes [aria-selected="true"]{font-weight:600}' +
        '.ai-workbench-action-steps{padding-left:22px}.ai-workbench-action-steps li{padding:7px 0;border-bottom:1px solid var(--line-soft,#eee)}.ai-workbench-action-steps li[data-state="failed"]{color:var(--danger,#c44)}.ai-workbench-action-steps li[data-state="completed"]{color:var(--success,#398a7a)}.ai-workbench-action-steps strong,.ai-workbench-action-steps small{display:block}.ai-workbench-action-preview{margin:3px 0}.ai-workbench-action-steps code{display:block;overflow-wrap:anywhere;color:var(--text-muted,#777);font-size:10px}.ai-workbench-action-result{margin-top:4px;font-size:11px}.ai-workbench-action-result a{margin-left:5px;color:var(--brand,#5eaaa0)}' +
        '.ai-workbench-local-action{margin:10px 0;padding:8px;border:1px solid var(--line-soft,#eee);border-radius:7px}.ai-workbench-local-action legend{font-size:11px;color:var(--text-muted,#777)}.ai-workbench-local-action input,.ai-workbench-local-action select{max-width:62%;box-sizing:border-box}.ai-workbench-action-history{margin-top:12px;font-size:11px;color:var(--text-muted,#777)}.ai-workbench-action-history>div{padding:3px 0}' +
        '.ai-workbench-facts{margin:8px 0;color:var(--text-muted,#777);font-size:11px}.ai-workbench-result{max-height:48vh;overflow:auto;line-height:1.65}' +
        '.ai-workbench-result h1,.ai-workbench-result h2,.ai-workbench-result h3{font-size:14px}.ai-workbench-citations{margin-top:10px;padding-top:7px;border-top:1px solid var(--line-soft,#eee);font-size:11px}.ai-workbench-citations strong{display:block;margin-bottom:4px}.ai-workbench-citations a{color:var(--brand,#5eaaa0)}' +
        '.ai-workbench-topic-head{display:flex;align-items:baseline;gap:4px;flex-wrap:wrap}.ai-workbench-topic-head strong{font-size:13px}.ai-workbench-topic-head span{font-size:11px;color:var(--text-muted,#777)}' +
        '.ai-workbench-field{display:flex;align-items:center;justify-content:space-between;gap:7px;margin:8px 0;font-size:12px}.ai-workbench-field select{max-width:65%;padding:4px 6px;border:1px solid var(--line,#ddd);border-radius:6px;background:var(--panel,#fff);color:inherit}' +
        '.ai-workbench-track-summary{display:flex;justify-content:space-between;gap:8px;align-items:baseline}.ai-workbench-track-summary span{font-size:11px;color:var(--text-muted,#777)}' +
        '.ai-workbench-track-item{padding:8px 0;border-bottom:1px solid var(--line-soft,#eee)}.ai-workbench-track-item strong{display:block;font-size:12px;line-height:1.45}.ai-workbench-track-item span,.ai-workbench-track-item small{display:block;margin-top:3px;color:var(--text-muted,#777);font-size:11px}' +
        '.ai-workbench-error{color:var(--danger,#c44)}',
    )

    api.ui.shellAsideView({
      id: 'ai-workbench',
      label: 'AI',
      order: 20,
      visible: (viewContext) => Boolean(viewContext?.wide),
      render: renderWorkbench,
    })

    api.on('route:changed', () => {
      if (actionSession.record && ['ready', 'running', 'partial', 'failed'].includes(actionSession.record.status)) {
        actionSession.record.status = 'expired'
        for (const step of actionSession.record.steps) {
          if (step.state === 'pending' || step.state === 'running') step.state = 'skipped'
        }
        saveActionHistory(actionSession.record)
      }
      generation += 1
      if (!mounted || mounted.disposed) return
      mounted.viewContext = context()
      mounted.section = 'console'
      mountState(mounted)
    })

    api.on('plugin:disabled', () => {
      const record = actionSession.record
      if (!record || !['ready', 'running', 'partial', 'failed'].includes(record.status)) return
      const actionContext = copilot.actionContext(record.command)
      const invalid = record.plan.steps.some((step) => !api.ai.validate(step, actionContext, { requireActionBinding: true }).ok)
      if (!invalid) return
      record.status = 'expired'
      record.steps.forEach((step) => { if (step.state === 'pending' || step.state === 'running') step.state = 'skipped' })
      saveActionHistory(record)
      generation += 1
      if (mounted?.section === 'console' && commandMode === 'action') mountState(mounted)
    })

    api.onDispose(() => {
      disposed = true
      generation += 1
      if (mounted) {
        mounted.disposed = true
        mounted.host.replaceChildren()
        mounted = null
      }
    })

    return {}
  }

  const w = typeof unsafeWindow !== 'undefined' ? unsafeWindow : window
  if (w.LSB && w.LSB.register) w.LSB.register(manifest, setup)
  else ;(w.LSB_PLUGINS = w.LSB_PLUGINS || []).push({ manifest, setup })
})()
