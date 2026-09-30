import { test } from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { JSDOM } from 'jsdom'

const baseCode = readFileSync(new URL('../dist/linuxsb-base.user.js', import.meta.url), 'utf8')
const PLUG = (name) => readFileSync(new URL(`../plugins/${name}`, import.meta.url), 'utf8')
const topicHtml = readFileSync(new URL('./fixtures/topic1.html', import.meta.url), 'utf8')

function makeSite(width = 1200) {
  const dom = new JSDOM(topicHtml, { url: 'https://linux.sb/topic/1', runScripts: 'outside-only' })
  const w = dom.window
  w.unsafeWindow = w
  Object.defineProperty(w, 'innerWidth', { value: width, configurable: true })
  w.requestAnimationFrame = (fn) => setTimeout(() => fn(Date.now()), 1)
  w.localStorage.setItem('lsb_base:__core:rate', JSON.stringify(5))
  w.localStorage.setItem('lsb_base:__core:urlPoll', JSON.stringify(0))
  w.localStorage.setItem(
    'lsb_base:ai-summary:__config',
    JSON.stringify({ apiUrl: 'https://api.example.com/v1/chat/completions', apiKey: 'k', model: 'test-model' }),
  )
  w.localStorage.setItem(
    'lsb_base:ai-copilot:__config',
    JSON.stringify({ fetchAll: false, maxPages: 15, maxChars: 12000, sessionTurns: 6 }),
  )
  w.fetch = async (url) => ({
    status: 200,
    ok: true,
    url: String(url),
    text: async () => JSON.stringify({ choices: [{ message: { content: '回答' } }] }),
  })
  return w
}

async function load(w) {
  w.eval(baseCode)
  w.eval(PLUG('skin.user.js'))
  w.eval(PLUG('ai-summary.user.js'))
  w.eval(PLUG('ai-actions.user.js'))
  w.eval(PLUG('ai-copilot.user.js'))
  w.eval(PLUG('ai-workbench.user.js'))
  await new Promise((resolve) => setTimeout(resolve, 100))
}

async function until(fn, ms = 2000) {
  const end = Date.now() + ms
  while (Date.now() < end) {
    if (fn()) return true
    await new Promise((resolve) => setTimeout(resolve, 15))
  }
  return Boolean(fn())
}

test('AI 工作台：右栏默认操作台，包含三段且可切换', async () => {
  const w = makeSite()
  await load(w)
  w.dispatchEvent(new w.Event('resize'))
  assert.equal(await until(() => w.document.querySelector('[data-lsb-shell-aside-tab="ai-workbench"]')), true)
  const workbench = w.document.querySelector('[data-ai-workbench]')
  assert.ok(workbench)
  assert.ok(workbench.querySelector('[data-ai-section="console"]'))
  assert.ok(workbench.querySelector('[data-ai-section="topic"]'))
  assert.ok(workbench.querySelector('[data-ai-section="tracking"]'))
  assert.equal(workbench.querySelector('[data-ai-section="console"]').hidden, false)
  assert.match(workbench.textContent, /受限计划|运行查询/)

  workbench.querySelector('[data-ai-section-tab="topic"]').click()
  assert.equal(workbench.querySelector('[data-ai-section="topic"]').hidden, false)
  assert.equal(workbench.querySelector('[data-ai-section="console"]').hidden, true)
  assert.match(workbench.textContent, /当前帖子|问答|讨论分析/)

  workbench.querySelector('[data-ai-section-tab="tracking"]').click()
  assert.equal(workbench.querySelector('[data-ai-section="tracking"]').hidden, false)
  assert.match(workbench.textContent, /追踪|活动追踪/)
})

test('AI 工作台：窄屏不注册右栏 AI 标签，保留旧入口能力', async () => {
  const w = makeSite(900)
  await load(w)
  w.dispatchEvent(new w.Event('resize'))
  assert.equal(w.document.querySelector('[data-lsb-shell-aside-tab="ai-workbench"]'), null)
  assert.ok(w.document.querySelector('a.lsb-ai-copilot-top'), '帖子页旧顶栏副驾入口仍存在')
})

test('AI 工作台：命令先显示计划，点击执行后才按顺序调用动作', async () => {
  const w = makeSite()
  await load(w)
  const calls = []
  w.LSB.register({ id: 'test-actions', version: '1.0.0', permissions: ['read', 'events'] }, (api) => {
    api.ai.registerAction({
      id: 'test.first', version: 1, permission: 'read', label: '第一步', args: {},
      preview: () => '先做第一步',
      execute: async () => { calls.push('first'); return { ok: true } },
    })
    api.ai.registerAction({
      id: 'test.second', version: 1, permission: 'read', label: '第二步', args: {},
      preview: () => '再做第二步',
      execute: async () => { calls.push('second'); return { ok: true } },
    })
  })
  await new Promise((resolve) => setTimeout(resolve, 30))
  const exported = w.LSB.__core.plugins.get('ai-copilot').exports
  exported.planActions = async () => ({
    plan: {
      version: 1,
      summary: '测试',
      steps: [
        { action: 'test.first', args: {}, actionVersion: 1, actionProvider: 'test-actions' },
        { action: 'test.second', args: {}, actionVersion: 1, actionProvider: 'test-actions' },
      ],
    },
    previews: [{ ok: true, text: '先做第一步' }, { ok: true, text: '再做第二步' }],
    context: { route: { type: 'topic', id: 1, href: '/topic/1' } },
  })
  const wb = w.document.querySelector('[data-ai-workbench]')
  wb.querySelector('[data-ai-command-mode="action"]').click()
  wb.querySelector('[data-ai-action-command]').value = '执行两步'
  wb.querySelector('[data-ai-action-run]').click()
  assert.deepEqual(calls, [], '预览阶段不能调用 execute')
  assert.equal(await until(() => wb.querySelector('[data-ai-action-execute]')), true)
  assert.ok(wb.querySelector('[data-ai-action-regenerate]'))
  wb.querySelector('[data-ai-action-execute]').click()
  assert.equal(await until(() => calls.length === 2), true)
  assert.deepEqual(calls, ['first', 'second'])
  assert.match(wb.querySelector('[data-ai-action-status]').textContent, /已完成|completed/)
})

test('AI 工作台：步骤失败停止后续，重试只调用失败步骤；路由变化使计划过期', async () => {
  const w = makeSite()
  await load(w)
  const calls = []
  let attempts = 0
  w.LSB.register({ id: 'retry-actions', version: '1.0.0', permissions: ['read', 'events'] }, (api) => {
    api.ai.registerAction({
      id: 'test.ok', version: 1, permission: 'read', label: '成功', args: {},
      preview: () => '成功', execute: async () => { calls.push('ok'); return { ok: true } },
    })
    api.ai.registerAction({
      id: 'test.retry', version: 1, permission: 'read', label: '可重试', args: {},
      preview: () => '可重试',
      execute: async () => { attempts += 1; calls.push(`retry-${attempts}`); if (attempts === 1) throw new Error('模拟失败'); return { ok: true } },
    })
    api.ai.registerAction({
      id: 'test.never', version: 1, permission: 'read', label: '不应执行', args: {},
      preview: () => '不应执行', execute: async () => { calls.push('never'); return { ok: true } },
    })
  })
  await new Promise((resolve) => setTimeout(resolve, 30))
  const exported = w.LSB.__core.plugins.get('ai-copilot').exports
  exported.planActions = async () => ({
    plan: {
      version: 1,
      summary: '测试',
      steps: [
        { action: 'test.ok', args: {}, actionVersion: 1, actionProvider: 'retry-actions' },
        { action: 'test.retry', args: {}, actionVersion: 1, actionProvider: 'retry-actions' },
        { action: 'test.never', args: {}, actionVersion: 1, actionProvider: 'retry-actions' },
      ],
    },
    previews: [{ ok: true, text: '成功' }, { ok: true, text: '可重试' }, { ok: true, text: '不应执行' }],
    context: { route: { type: 'topic', id: 1, href: '/topic/1' } },
  })
  const wb = w.document.querySelector('[data-ai-workbench]')
  wb.querySelector('[data-ai-command-mode="action"]').click()
  wb.querySelector('[data-ai-action-command]').value = '测试失败'
  wb.querySelector('[data-ai-action-run]').click()
  assert.equal(await until(() => wb.querySelector('[data-ai-action-execute]')), true)
  wb.querySelector('[data-ai-action-execute]').click()
  assert.equal(await until(() => wb.querySelector('[data-ai-action-status]').textContent.includes('partial')), true)
  assert.deepEqual(calls, ['ok', 'retry-1'])
  wb.querySelector('[data-ai-action-retry-failed]').click()
  assert.equal(await until(() => attempts === 2), true)
  assert.deepEqual(calls, ['ok', 'retry-1', 'retry-2'])
  assert.equal(await until(() => w.document.querySelector('[data-ai-action-step="2"]')?.dataset.state === 'completed'), true)
  assert.equal(w.document.querySelector('[data-ai-action-step="2"]').dataset.state, 'completed')
  w.LSB.bus.emit('route:changed', { href: '/topic/2', page: { type: 'topic', id: 2 } }, { source: 'test' })
  const currentWorkbench = w.document.querySelector('[data-ai-workbench]')
  assert.match(currentWorkbench.querySelector('[data-ai-action-status]').textContent, /expired|过期/)
})

test('AI 工作台：未声明终止属性的导航结果也不能跳过后续步骤', async () => {
  const w = makeSite()
  await load(w)
  let laterCalls = 0
  w.LSB.register({ id: 'navigation-guard', version: '1.0.0', permissions: ['read', 'events'] }, (api) => {
    api.ai.registerAction({
      id: 'test.navigation', version: 1, permission: 'read', label: '导航', args: {},
      preview: () => '导航', execute: () => ({ kind: 'navigation', url: '/next' }),
    })
    api.ai.registerAction({
      id: 'test.afterNavigation', version: 1, permission: 'read', label: '后续', args: {},
      preview: () => '后续', execute: () => { laterCalls += 1; return { ok: true } },
    })
  })
  await new Promise((resolve) => setTimeout(resolve, 30))
  const exported = w.LSB.__core.plugins.get('ai-copilot').exports
  exported.planActions = async () => ({
    plan: {
      version: 1,
      summary: '导航后执行后续动作',
      steps: [
        { action: 'test.navigation', args: {}, actionVersion: 1, actionProvider: 'navigation-guard' },
        { action: 'test.afterNavigation', args: {}, actionVersion: 1, actionProvider: 'navigation-guard' },
      ],
    },
    previews: [{ ok: true, text: '导航' }, { ok: true, text: '后续' }],
    context: { route: { type: 'topic', id: 1, page: 1 } },
  })
  const wb = w.document.querySelector('[data-ai-workbench]')
  wb.querySelector('[data-ai-command-mode="action"]').click()
  wb.querySelector('[data-ai-action-command]').value = '执行计划'
  wb.querySelector('[data-ai-action-run]').click()
  assert.equal(await until(() => wb.querySelector('[data-ai-action-execute]')), true)
  wb.querySelector('[data-ai-action-execute]').click()
  assert.equal(await until(() => /执行失败|failed/.test(wb.querySelector('[data-ai-action-status]').textContent)), true)
  assert.equal(w.document.querySelector('[data-ai-action-step="1"]').dataset.state, 'failed')
  assert.equal(w.document.querySelector('[data-ai-action-step="2"]').dataset.state, 'skipped')
  assert.equal(laterCalls, 0)
  assert.equal(w.location.pathname, '/topic/1')
})

test('AI 工作台：模型不可用时仍可从本地动作目录建立计划并保存本地历史', async () => {
  const w = makeSite()
  w.history.replaceState({}, '', '/topic/1?auth=history-secret')
  w.localStorage.setItem('lsb_base:ai-summary:__config', JSON.stringify({ apiUrl: '', apiKey: '' }))
  await load(w)
  const wb = w.document.querySelector('[data-ai-workbench]')
  wb.querySelector('[data-ai-command-mode="action"]').click()
  const action = wb.querySelector('[data-ai-action-select]')
  action.value = 'site.navigate'
  action.dispatchEvent(new w.Event('change'))
  const target = wb.querySelector('[data-ai-action-arg="target"]')
  target.value = 'home'
  wb.querySelector('[data-ai-action-local-plan]').click()
  assert.ok(wb.querySelector('[data-ai-action-execute]'))
  assert.ok(wb.querySelector('[data-ai-action-regenerate]') === null)
  assert.match(wb.querySelector('[data-ai-action-plan]').textContent, /打开首页/)
  assert.match(wb.querySelector('[data-ai-action-message]').textContent, /本地计划/)
  const history = JSON.parse(w.localStorage.getItem('lsb_base:ai-workbench:action-history'))
  assert.equal(history.length, 1)
  assert.equal(history[0].plan.steps[0].action, 'site.navigate')
  assert.doesNotMatch(JSON.stringify(history), /apiKey|_csrf|Cookie|完整 DOM/i)
  assert.doesNotMatch(JSON.stringify(history), /history-secret/)
  for (let index = 0; index < 22; index += 1) {
    wb.querySelector('[data-ai-action-command]').value = `本地计划 ${index}`
    wb.querySelector('[data-ai-action-local-plan]').click()
  }
  const boundedHistory = JSON.parse(w.localStorage.getItem('lsb_base:ai-workbench:action-history'))
  assert.equal(boundedHistory.length, 20)
})

test('AI 工作台：加载旧历史时清除已持久化的 URL 查询参数', async () => {
  const w = makeSite()
  w.localStorage.setItem('lsb_base:ai-workbench:action-history', JSON.stringify([{
    id: 'legacy-plan',
    command: '回首页',
    plan: { version: 1, summary: '回首页', steps: [{ action: 'site.navigate', args: { target: 'home' } }] },
    routeFingerprint: JSON.stringify({ type: 'topic', id: 1, href: '/topic/1?token=legacy-secret' }),
    status: 'completed',
    steps: [{ state: 'completed', error: '' }],
    ts: 1,
  }]))
  await load(w)
  const saved = w.localStorage.getItem('lsb_base:ai-workbench:action-history')
  assert.doesNotMatch(saved, /legacy-secret/)
  const route = JSON.parse(JSON.parse(saved)[0].routeFingerprint)
  assert.equal(route.type, 'topic')
  assert.equal('href' in route, false)
})

test('AI 工作台：动作提供方停用后现有计划过期且不能执行', async () => {
  const w = makeSite()
  await load(w)
  w.LSB.register({ id: 'temporary-actions', version: '1.0.0', permissions: ['read', 'events'] }, (api) => {
    api.ai.registerAction({
      id: 'test.temporary', version: 1, permission: 'read', label: '临时动作', args: {},
      preview: () => '执行临时动作', execute: () => ({ ok: true }),
    })
  })
  await new Promise((resolve) => setTimeout(resolve, 30))
  const exported = w.LSB.__core.plugins.get('ai-copilot').exports
  exported.planActions = async () => ({
    plan: { version: 1, summary: '临时计划', steps: [{ action: 'test.temporary', args: {}, actionVersion: 1, actionProvider: 'temporary-actions' }] },
    previews: [{ ok: true, text: '执行临时动作' }],
    context: { route: { type: 'topic', id: 1, href: '/topic/1' } },
  })
  const wb = w.document.querySelector('[data-ai-workbench]')
  wb.querySelector('[data-ai-command-mode="action"]').click()
  wb.querySelector('[data-ai-action-command]').value = '临时动作'
  wb.querySelector('[data-ai-action-run]').click()
  assert.equal(await until(() => wb.querySelector('[data-ai-action-execute]')), true)
  w.LSB.disable('temporary-actions')
  const current = w.document.querySelector('[data-ai-workbench]')
  assert.match(current.querySelector('[data-ai-action-status]').textContent, /过期/)
  assert.equal(current.querySelector('[data-ai-action-execute]'), null)
  assert.equal(w.LSB.__core.ai.actions({ route: { type: 'topic' } }).some((item) => item.id === 'test.temporary'), false)
})
