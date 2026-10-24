import { test } from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { JSDOM } from 'jsdom'

const baseCode = readFileSync(new URL('../dist-dev/linuxsb-base.user.js', import.meta.url), 'utf8')
const writeCode = readFileSync(new URL('../plugins/ai-write-actions.user.js', import.meta.url), 'utf8')
const checkinCode = readFileSync(new URL('../plugins/checkin-calendar.user.js', import.meta.url), 'utf8')
const topicHtml = readFileSync(new URL('./fixtures/topic1.html', import.meta.url), 'utf8')
const topicRoute = { route: { type: 'topic', id: 1, page: 1 } }

function reactionContext() {
  return {
    ...topicRoute,
    reactionScopeNonce: 'test-current-scope',
    reactionTargets: [
      { targetKey: 'target-topic-a', type: 'topic', topicId: 1, postId: null, page: 1, floor: 0, title: '当前主题', liked: null, favorited: false, tiers: [] },
      { targetKey: 'target-reply-b', type: 'reply', topicId: 1, postId: 87, page: 1, floor: 18, title: '当前主题', liked: false, favorited: null, tiers: [1, 5, 10, 50, 100] },
    ],
  }
}

function makePage(path = '/topic/1', html = topicHtml) {
  const dom = new JSDOM(html, { url: `https://linux.sb${path}`, runScripts: 'outside-only' })
  const w = dom.window
  const favoriteButton = w.document.querySelector('form.topic-favorites-action .fav-btn')
  favoriteButton?.setAttribute('data-favorite-state', '0')
  w.unsafeWindow = w
  w.requestAnimationFrame = (fn) => setTimeout(() => fn(Date.now()), 0)
  w.localStorage.setItem('lsb_base:__core:rate', JSON.stringify(0))
  return w
}

async function load(w, { checkin = false, traceEvents = null } = {}) {
  w.eval(baseCode)
  if (traceEvents) {
    w.LSB.register({ id: `write-trace-listener-${Math.random().toString(36).slice(2)}`, version: '1.0.0', permissions: ['events'] }, (api) => {
      api.on('ai:trace', (event) => traceEvents.push(event))
    })
  }
  w.LSB.register({ id: 'reaction-scope-test-provider', version: '1.0.0', permissions: ['read', 'events'] }, (api) => {
    api.handle('ai-copilot:reaction-scope-valid', () => true)
    api.handle('ai-copilot:action-scope-valid', () => true)
  })
  if (checkin) w.eval(checkinCode)
  w.eval(writeCode)
  await new Promise((resolve) => setTimeout(resolve, 30))
  return w.LSB.__core.ai
}

function selectedReplyHash({ postId, floor, authorName, content }) {
  let hash = 2166136261
  for (const ch of `${postId}|${floor}|${authorName}|${content}`) {
    hash ^= ch.charCodeAt(0)
    hash = Math.imul(hash, 16777619)
  }
  return (hash >>> 0).toString(36)
}

function selectedReplyTopicHtml({ topicId = 9101, title = 'M9 目标主题', postId = 91014, floor = 4, authorName = '回帖作者', content = '已选回帖证据', csrf = 'remote-csrf', formTopicId = topicId, action = '/reply_edit' } = {}) {
  return `<html><head><link rel="canonical" href="https://linux.sb/topic/${topicId}"></head><body>` +
    `<h1 class="post-content-title">${title}</h1><ul class="topic-post-list">` +
    `<li class="post-entry" id="post-${postId}" data-floor="${floor}"><a class="post-title post-author" href="/user/9">${authorName}</a><div class="post-content">${content}</div></li>` +
    `</ul><nav class="pagination"><ul><li class="active"><a href="/topic/${topicId}?p=2">2</a></li></ul></nav>` +
    `<form class="ajax-reply-form" method="post" action="${action}"><input type="hidden" name="_csrf" value="${csrf}">` +
    `<input type="hidden" name="topic_id" value="${formTopicId}"><textarea name="body"></textarea></form></body></html>`
}

function selectedReplyContext(overrides = {}) {
  const target = {
    targetKey: 'target-selected-reply',
    type: 'reply',
    topicId: 9101,
    postId: 91014,
    page: 2,
    floor: 4,
    title: 'M9 目标主题',
    authorName: '回帖作者',
    evidenceHash: selectedReplyHash({ postId: 91014, floor: 4, authorName: '回帖作者', content: '已选回帖证据' }),
    ...overrides,
  }
  return { route: { type: 'home', id: 0 }, reactionScopeNonce: 'selected-reply-scope', replyTargets: [target] }
}

async function until(fn, w, timeoutMs = 1000) {
  const end = Date.now() + timeoutMs
  while (Date.now() < end) {
    if (fn()) return true
    await new Promise((resolve) => w.setTimeout(resolve, 10))
  }
  return Boolean(fn())
}

test('AI 写动作：只公开验证过的当前帖子回复和本站新主题表单', async () => {
  const w = makePage()
  const ai = await load(w)
  const actions = ai.actions(topicRoute)
  const reply = actions.find((action) => action.id === 'site.write-reply')
  assert.equal(reply?.permission, 'write')
  assert.equal(actions.some((action) => action.id === 'site.write-topic'), false)
  assert.equal(actions.some((action) => action.id === 'site.write-checkin'), false)

  const badForms = [
    (form) => form.querySelector('input[name="_csrf"]').remove(),
    (form) => { form.querySelector('input[name="topic_id"]').value = '2' },
    (form) => form.setAttribute('action', 'https://evil.example/reply_edit'),
  ]
  for (const mutate of badForms) {
    const page = makePage()
    const actionAi = await load(page)
    const form = page.document.querySelector('form.ajax-reply-form')
    mutate(form)
    assert.equal(actionAi.actions(topicRoute).some((action) => action.id === 'site.write-reply'), false)
    await assert.rejects(
      () => actionAi.execute({ action: 'site.write-reply', args: { body: '测试' } }, topicRoute),
      /action\.unavailable/,
    )
  }
})

test('AI 互动写动作：目录只暴露短期目标 key 和站点提供的投币档位', async () => {
  const w = makePage()
  const ai = await load(w)
  const context = reactionContext()
  const actions = ai.actions(context)
  const favorite = actions.find((action) => action.id === 'site.write-favorite-state')
  const like = actions.find((action) => action.id === 'site.write-like-state')
  const coin = actions.find((action) => action.id === 'site.write-coin')
  assert.equal(favorite?.permission, 'write')
  assert.equal(like?.permission, 'write')
  assert.equal(coin?.permission, 'write')
  assert.deepEqual(Array.from(favorite.args.targetKey.values), ['target-topic-a'])
  assert.deepEqual(Array.from(like.args.targetKey.values), ['target-reply-b'])
  assert.deepEqual(Array.from(coin.args.targetKey.values), ['target-reply-b'])
  assert.equal(coin.args.coin.type, 'number')
  assert.equal(coin.args.coin.optional, true)
  assert.doesNotMatch(JSON.stringify(actions), /\"topicId\"|\"postId\"|\"floor\"|\"coin\":5/)
})

test('AI 互动写入：缺少本地目标会话引用时拒绝执行', async () => {
  const w = makePage()
  const requests = []
  w.fetch = async (url, init = {}) => {
    requests.push({ url: String(url), init })
    return { status: 200, ok: true, url: String(url), text: async () => '{"ok":1}' }
  }
  const ai = await load(w)
  const context = reactionContext()
  delete context.reactionScopeNonce
  const pending = ai.execute({ action: 'site.write-like-state', args: { targetKey: 'target-reply-b', liked: true } }, context)
  const observed = pending.then((value) => ({ value }), (error) => ({ error }))
  await new Promise((resolve) => setTimeout(resolve, 30))
  w.document.querySelector('.lsb-panel [data-yes]')?.click()
  const outcome = await observed
  assert.match(String(outcome.error?.message || ''), /互动目标会话|目标选择/)
  assert.equal(requests.length, 0)
})

test('AI 互动写入：非数组投币档位在目标状态复核时失败关闭', async () => {
  const w = makePage()
  const ai = await load(w)
  const context = reactionContext()
  context.reactionTargets[1].tiers = '1,5'
  await assert.rejects(
    () => ai.execute({ action: 'site.write-like-state', args: { targetKey: 'target-reply-b', liked: true } }, context),
    /目标状态|目标档位|目标已变化/,
  )
  assert.equal(w.document.querySelector('.lsb-panel'), null, '畸形档位不得进入确认流程')
})

test('AI 互动写入：点赞和收藏再次确认状态后只发送一次本站请求', async () => {
  const w = makePage()
  const requests = []
  w.fetch = async (url, init = {}) => {
    requests.push({ url: String(url), init })
    return { status: 200, ok: true, url: String(url), text: async () => '{"ok":1}' }
  }
  const ai = await load(w)
  const context = reactionContext()
  const like = ai.execute({ action: 'site.write-like-state', args: { targetKey: 'target-reply-b', liked: true } }, context)
  assert.equal(await until(() => w.document.querySelector('.lsb-panel [data-yes]'), w), true)
  const confirmText = w.document.querySelector('.lsb-panel').textContent
  assert.match(confirmText, /回帖/)
  assert.match(confirmText, /未点赞/)
  assert.match(confirmText, /已点赞/)
  assert.equal(requests.length, 0)
  w.document.querySelector('.lsb-panel [data-yes]').click()
  assert.equal((await like).kind, 'completed')
  assert.equal(requests.length, 1)
  assert.match(requests[0].url, /\/lsb_like_coin$/)
  assert.equal(requests[0].init.method, 'POST')
  assert.equal(requests[0].init.body.get('like_coin_type'), 'reply')
  assert.equal(requests[0].init.body.get('like_coin_id'), '87')
  assert.equal(requests[0].init.body.has('coin'), false, '点赞不能暗中投币')

  const favoritePage = makePage()
  const favoriteRequests = []
  favoritePage.fetch = async (url, init = {}) => {
    favoriteRequests.push({ url: String(url), init })
    return { status: 200, ok: true, url: String(url), text: async () => '{"ok":1}' }
  }
  const favoriteAi = await load(favoritePage)
  const favoritePending = favoriteAi.execute({
    action: 'site.write-favorite-state', args: { targetKey: 'target-topic-a', favorited: true },
  }, reactionContext())
  assert.equal(await until(() => favoritePage.document.querySelector('.lsb-panel [data-yes]'), favoritePage), true)
  assert.match(favoritePage.document.querySelector('.lsb-panel').textContent, /未收藏/)
  favoritePage.document.querySelector('.lsb-panel [data-yes]').click()
  assert.equal((await favoritePending).kind, 'completed')
  assert.equal(favoriteRequests.length, 1)
  assert.match(favoriteRequests[0].url, /\/topic_favorite$/)
  assert.equal(favoriteRequests[0].init.body.get('topic_id'), '1')
})

test('AI 投币写入：再次确认后只提交确认卡提供的本站有效档位', async () => {
  const w = makePage()
  const requests = []
  w.fetch = async (url, init = {}) => {
    requests.push({ url: String(url), init })
    return { status: 200, ok: true, url: String(url), text: async () => '{"ok":1}' }
  }
  const ai = await load(w)
  const pending = ai.execute({
    action: 'site.write-coin',
    args: { targetKey: 'target-reply-b', coin: 5 },
  }, reactionContext())

  assert.equal(await until(() => w.document.querySelector('.lsb-panel [data-yes]'), w), true)
  const confirmation = w.document.querySelector('.lsb-panel').textContent
  assert.match(confirmation, /投币 5/)
  assert.match(confirmation, /可投币档位：1、5、10、50、100/)
  assert.equal(requests.length, 0, '二次确认前不能发送投币')
  w.document.querySelector('.lsb-panel [data-yes]').click()

  assert.equal((await pending).kind, 'completed')
  assert.equal(requests.length, 1)
  assert.match(requests[0].url, /\/lsb_like_coin$/)
  assert.equal(requests[0].init.method, 'POST')
  assert.equal(requests[0].init.body.get('like_coin_type'), 'reply')
  assert.equal(requests[0].init.body.get('like_coin_id'), '87')
  assert.equal(requests[0].init.body.get('coin'), '5')
})

test('AI 互动写入：选择会话在二次确认期间失效时不发送请求', async () => {
  const w = makePage()
  w.eval(baseCode)
  let scopeChecks = 0
  w.LSB.register({ id: 'reaction-scope-test', version: '1.0.0', permissions: ['read', 'events'] }, (api) => {
    api.handle('ai-copilot:reaction-scope-valid', () => {
      scopeChecks += 1
      return scopeChecks === 1
    })
  })
  const requests = []
  w.fetch = async (url, init = {}) => {
    requests.push({ url: String(url), init })
    return { status: 200, ok: true, url: String(url), text: async () => '{"ok":1}' }
  }
  w.eval(writeCode)
  await new Promise((resolve) => setTimeout(resolve, 30))
  const ai = w.LSB.__core.ai
  const context = {
    ...reactionContext(),
    reactionScopeNonce: 'selected-cross-topic-scope',
  }
  const pending = ai.execute({
    action: 'site.write-like-state',
    args: { targetKey: 'target-reply-b', liked: true },
  }, context)
  assert.equal(await until(() => w.document.querySelector('.lsb-panel [data-yes]'), w), true)
  w.document.querySelector('.lsb-panel [data-yes]').click()

  await assert.rejects(() => pending, /目标选择.*失效|互动目标.*过期/)
  assert.equal(scopeChecks, 2, '写操作在初次核验和确认后均检查目标会话')
  assert.equal(requests.length, 0, '目标会话过期后不得发送写请求')
})

test('AI 互动写入：确认期间状态变化、未知状态和错误投币档位均不发请求', async () => {
  const w = makePage()
  const requests = []
  w.fetch = async (url, init = {}) => {
    requests.push({ url: String(url), init })
    return { status: 200, ok: true, url: String(url), text: async () => '{"ok":1}' }
  }
  const ai = await load(w)
  const pending = ai.execute({ action: 'site.write-like-state', args: { targetKey: 'target-reply-b', liked: true } }, reactionContext())
  assert.equal(await until(() => w.document.querySelector('.lsb-panel [data-yes]'), w), true)
  w.document.querySelector('[data-like-coin-action][data-like-coin-id="87"]').setAttribute('data-like-coin-liked', '1')
  w.document.querySelector('.lsb-panel [data-yes]').click()
  await assert.rejects(() => pending, /状态|变化|预期/)
  assert.equal(requests.length, 0)

  const unknown = reactionContext()
  unknown.reactionTargets[1].liked = null
  await assert.rejects(() => ai.execute({ action: 'site.write-like-state', args: { targetKey: 'target-reply-b', liked: true } }, unknown), /action\.unavailable|args\.enum|点赞状态|target/i)
  await assert.rejects(() => ai.execute({ action: 'site.write-coin', args: { targetKey: 'target-reply-b', coin: 7 } }, reactionContext()), /write\.coin-tier|档位/)
  assert.equal(requests.length, 0)
})

test('AI 回复动作：双重确认后仅提交本站白名单字段', async () => {
  const w = makePage()
  const ai = await load(w)
  const form = w.document.querySelector('form.ajax-reply-form')
  form.insertAdjacentHTML('beforeend', '<input type="hidden" name="unexpected" value="must-not-send"><input type="file" name="attachment">')
  const requests = []
  w.fetch = async (url, init = {}) => {
    requests.push({ url: String(url), init })
    return { status: 200, ok: true, url: String(url), text: async () => '{"ok":1,"message":"已回复"}' }
  }

  const args = { body: '完整回复正文\n保留换行' }
  const cancelled = ai.execute({ action: 'site.write-reply', args }, topicRoute)
  assert.equal(await until(() => w.document.querySelector('.lsb-panel [data-no]'), w), true)
  assert.equal(requests.length, 0, '计划执行前的第二次确认完成前不能提交')
  assert.match(w.document.querySelector('.lsb-panel').textContent, /帖子 #1/)
  assert.match(w.document.querySelector('.lsb-panel').textContent, /完整回复正文\n保留换行/)
  w.document.querySelector('.lsb-panel [data-no]').click()
  const cancelledResult = await cancelled
  assert.equal(cancelledResult.kind, 'cancelled')
  assert.equal(requests.length, 0, '取消确认不提交')

  const accepted = ai.execute({ action: 'site.write-reply', args }, topicRoute)
  assert.equal(await until(() => w.document.querySelector('.lsb-panel [data-yes]'), w), true)
  assert.equal(requests.length, 0)
  w.document.querySelector('.lsb-panel [data-yes]').click()
  const result = await accepted
  assert.equal(result.kind, 'completed')
  assert.equal(requests.length, 1)
  const submittedFields = [...requests[0].init.body.entries()].map(([name, value]) => [name, String(value)])
  assert.deepEqual(submittedFields.map(([name]) => name).sort(), ['_csrf', 'body', 'topic_id'])
  assert.equal(submittedFields.find(([name]) => name === 'body')?.[1], args.body)
  assert.equal(submittedFields.find(([name]) => name === 'topic_id')?.[1], '1')
})

test('AI 回复结果未知时可用短期凭据只读检查，且检查不重发 POST', async () => {
  const w = makePage()
  const body = '网络中断后的回复正文'
  const checkedHtml = topicHtml.replace(
    '</ul><div class="pagination-bar">',
    `<li class="post-item post-entry" id="post-999" data-floor="24"><div class="post-body"><div class="post-head has-floor"><a class="post-title post-author" href="/user/5372">xB70sR71</a></div></div><div class="post-content"><p>${body}</p></div></li></ul><div class="pagination-bar">`,
  )
  let posts = 0
  let gets = 0
  w.fetch = async (url, init = {}) => {
    const path = new URL(String(url), w.location.href).pathname
    if (String(init.method || 'GET').toUpperCase() === 'POST') {
      posts += 1
      throw new Error('连接中断')
    }
    gets += 1
    assert.equal(path, '/topic/1')
    return { status: 200, ok: true, url: String(url), text: async () => checkedHtml }
  }
  const ai = await load(w)
  const pending = ai.execute({ action: 'site.write-reply', args: { body } }, topicRoute)
  assert.equal(await until(() => w.document.querySelector('.lsb-panel [data-yes]'), w), true)
  w.document.querySelector('.lsb-panel [data-yes]').click()
  const unknown = await pending
  assert.equal(unknown.kind, 'unknown')
  assert.ok(unknown.receipt?.token)
  const checked = await w.LSB.bus.request('ai-write-actions:check-result', { receipt: unknown.receipt })
  assert.equal(checked.outcome, 'success')
  const replayed = await w.LSB.bus.request('ai-write-actions:check-result', { receipt: unknown.receipt })
  assert.equal(replayed.outcome, 'unknown')
  assert.equal(replayed.status, 'receipt-expired')
  assert.equal(posts, 1)
  assert.equal(gets, 1)
})

test('AI 点赞结果未知时检查重新读取目标状态，不重发 POST', async () => {
  const w = makePage()
  const checkedHtml = topicHtml.replace('data-like-coin-id="87" data-like-coin-tiers="1,5,10,50,100" data-like-coin-default="0" data-like-coin-liked="0"', 'data-like-coin-id="87" data-like-coin-tiers="1,5,10,50,100" data-like-coin-default="0" data-like-coin-liked="1"')
  let posts = 0
  let gets = 0
  w.fetch = async (url, init = {}) => {
    if (String(init.method || 'GET').toUpperCase() === 'POST') {
      posts += 1
      throw new Error('连接中断')
    }
    gets += 1
    return { status: 200, ok: true, url: String(url), text: async () => checkedHtml }
  }
  const ai = await load(w)
  const pending = ai.execute({ action: 'site.write-like-state', args: { targetKey: 'target-reply-b', liked: true } }, reactionContext())
  assert.equal(await until(() => w.document.querySelector('.lsb-panel [data-yes]'), w), true)
  w.document.querySelector('.lsb-panel [data-yes]').click()
  const unknown = await pending
  assert.equal(unknown.kind, 'unknown')
  const checked = await w.LSB.bus.request('ai-write-actions:check-result', { receipt: unknown.receipt })
  assert.equal(checked.outcome, 'success')
  assert.equal(posts, 1)
  assert.equal(gets, 1)
})

test('AI 签到结果未知时只读签到页确认，不重发 POST', async () => {
  const openForm = '<html><body><form method="post" action="/daily_checkin"><input type="hidden" name="_csrf" value="csrf-checkin"><input type="hidden" name="day" value="today"></form></body></html>'
  const checkedHtml = '<html><body><div>今日已签到</div></body></html>'
  const w = makePage('/daily_checkin', openForm)
  w.localStorage.setItem('lsb_base:checkin-calendar:__config', JSON.stringify({ autoProbe: false }))
  let posts = 0
  let gets = 0
  w.fetch = async (url, init = {}) => {
    if (String(init.method || 'GET').toUpperCase() === 'POST') {
      posts += 1
      throw new Error('签到提交连接中断')
    }
    gets += 1
    return { status: 200, ok: true, url: String(url), text: async () => gets > 1 ? checkedHtml : openForm }
  }
  const ai = await load(w, { checkin: true })
  const pending = ai.execute({ action: 'site.write-checkin', args: {} }, { route: { type: 'checkin' } })
  assert.equal(await until(() => w.document.querySelector('.lsb-panel [data-yes]'), w), true)
  w.document.querySelector('.lsb-panel [data-yes]').click()
  const unknown = await pending
  assert.equal(unknown.kind, 'unknown')
  const checked = await w.LSB.bus.request('ai-write-actions:check-result', { receipt: unknown.receipt })
  assert.equal(checked.outcome, 'success')
  assert.equal(posts, 1)
  assert.equal(gets, 2)
})

test('AI 投币结果未知时比较重新读取的累计投币数，不重发 POST', async () => {
  const w = makePage()
  const checkedHtml = topicHtml.replace('data-like-coin-id="87" data-like-coin-tiers="1,5,10,50,100" data-like-coin-default="0" data-like-coin-liked="0" data-like-coin-coined="0"', 'data-like-coin-id="87" data-like-coin-tiers="1,5,10,50,100" data-like-coin-default="0" data-like-coin-liked="0" data-like-coin-coined="5"')
  let posts = 0
  let gets = 0
  w.fetch = async (url, init = {}) => {
    if (String(init.method || 'GET').toUpperCase() === 'POST') {
      posts += 1
      throw new Error('连接中断')
    }
    gets += 1
    return { status: 200, ok: true, url: String(url), text: async () => checkedHtml }
  }
  const ai = await load(w)
  const pending = ai.execute({ action: 'site.write-coin', args: { targetKey: 'target-reply-b', coin: 5 } }, reactionContext())
  assert.equal(await until(() => w.document.querySelector('.lsb-panel [data-yes]'), w), true)
  w.document.querySelector('.lsb-panel [data-yes]').click()
  const unknown = await pending
  assert.equal(unknown.kind, 'unknown')
  const checked = await w.LSB.bus.request('ai-write-actions:check-result', { receipt: unknown.receipt })
  assert.equal(checked.outcome, 'success')
  assert.equal(posts, 1)
  assert.equal(gets, 1)
})

test('M9 已选楼层回复：显示所属主题和上下文楼层，取消不发请求，确认后只提交固定字段一次', async () => {
  const targetHtml = selectedReplyTopicHtml()
  const w = makePage('/topic/1')
  const requests = []
  w.fetch = async (url, init = {}) => {
    requests.push({ url: String(url), init })
    const parsed = new URL(String(url))
    if (parsed.pathname === '/topic/9101') return { status: 200, ok: true, url: String(url), text: async () => targetHtml }
    if (parsed.pathname === '/reply_edit') return { status: 200, ok: true, url: String(url), text: async () => '{"ok":1}' }
    return { status: 200, ok: true, url: String(url), text: async () => '<html><body></body></html>' }
  }
  const ai = await load(w)
  const context = selectedReplyContext()
  const action = ai.actions(context).find((item) => item.id === 'site.write-selected-reply')
  assert.equal(action?.permission, 'write')
  assert.deepEqual(Array.from(action.args.targetKey.values), ['target-selected-reply'])
  assert.deepEqual(Object.keys(action.args).sort(), ['body', 'targetKey'])

  const args = { targetKey: 'target-selected-reply', body: '完整的已选回帖回复草稿。' }
  const cancelled = ai.execute({ action: 'site.write-selected-reply', args }, context)
  assert.equal(await until(() => w.document.querySelector('.lsb-panel [data-no]'), w), true)
  const cancelText = w.document.querySelector('.lsb-panel').textContent
  assert.match(cancelText, /M9 目标主题/)
  assert.match(cancelText, /参考回帖 #4/)
  assert.match(cancelText, /发到所属主题/)
  assert.match(cancelText, /完整的已选回帖回复草稿。/)
  assert.equal(requests.filter((row) => new URL(row.url).pathname === '/reply_edit').length, 0)
  w.document.querySelector('.lsb-panel [data-no]').click()
  assert.equal((await cancelled).kind, 'cancelled')
  assert.equal(requests.filter((row) => new URL(row.url).pathname === '/reply_edit').length, 0)

  const accepted = ai.execute({ action: 'site.write-selected-reply', args }, context)
  assert.equal(await until(() => w.document.querySelector('.lsb-panel [data-yes]'), w), true)
  w.document.querySelector('.lsb-panel [data-yes]').click()
  const result = await accepted
  assert.equal(result.kind, 'completed')
  const posts = requests.filter((row) => new URL(row.url).pathname === '/reply_edit')
  assert.equal(posts.length, 1)
  assert.equal(posts[0].init.method, 'POST')
  assert.deepEqual([...posts[0].init.body.keys()].sort(), ['_csrf', 'body', 'topic_id'])
  assert.equal(posts[0].init.body.get('_csrf'), 'remote-csrf')
  assert.equal(posts[0].init.body.get('topic_id'), '9101')
  assert.equal(posts[0].init.body.get('body'), args.body)
})

test('M9 已选主题回复：无有效同源回复表单、CSRF 或匹配主题字段时不会确认或提交', async () => {
  const invalidTargets = [
    selectedReplyTopicHtml({ csrf: '' }),
    selectedReplyTopicHtml({ formTopicId: 9102 }),
    selectedReplyTopicHtml({ action: 'https://evil.example/reply_edit' }),
    selectedReplyTopicHtml().replace(/<form class="ajax-reply-form"[\s\S]*?<\/form>/, ''),
  ]
  for (const html of invalidTargets) {
    const w = makePage('/topic/1')
    const posts = []
    w.fetch = async (url, init = {}) => {
      if (init.method === 'POST') posts.push(String(url))
      return { status: 200, ok: true, url: String(url), text: async () => html }
    }
    const ai = await load(w)
    await assert.rejects(() => ai.execute({
      action: 'site.write-selected-reply',
      args: { targetKey: 'target-selected-reply', body: '不要发送' },
    }, selectedReplyContext()), /验证|回复表单|目标不匹配|CSRF|校验/)
    assert.equal(w.document.querySelector('.lsb-panel'), null)
    assert.equal(posts.length, 0)
  }
})

test('M9 已选回帖回复：目标 scope 失效或楼层内容变化时不显示确认、不提交', async () => {
  const html = selectedReplyTopicHtml()
  for (const { valid, responseHtml } of [
    { valid: false, responseHtml: html },
    { valid: true, responseHtml: selectedReplyTopicHtml({ content: '目标内容已经变化' }) },
  ]) {
    const w = makePage('/topic/1')
    const posts = []
    w.fetch = async (url, init = {}) => {
      if (init.method === 'POST') posts.push(String(url))
      return { status: 200, ok: true, url: String(url), text: async () => responseHtml }
    }
    w.LSB
    const ai = await load(w)
    if (!valid) {
      const request = w.LSB.bus.request.bind(w.LSB.bus)
      w.LSB.bus.request = async (name, data) => name === 'ai-copilot:action-scope-valid' ? false : request(name, data)
    }
    await assert.rejects(() => ai.execute({
      action: 'site.write-selected-reply',
      args: { targetKey: 'target-selected-reply', body: '请勿提交' },
    }, selectedReplyContext()), /已失效|已变化/)
    assert.equal(w.document.querySelector('.lsb-panel'), null)
    assert.equal(posts.length, 0)
  }
})

test('AI 新主题动作：从当前原生表单读取论坛目标并二次确认', async () => {
  const html = '<html><body><form method="post" action="/topic_edit"><input type="hidden" name="_csrf" value="token"><input type="hidden" name="forum_id" value="7"><input name="title"><textarea name="body"></textarea><input type="hidden" name="unrecognized" value="omit"></form></body></html>'
  const w = makePage('/topic_edit', html)
  const requests = []
  w.fetch = async (url, init = {}) => {
    requests.push({ url: String(url), init })
    return { status: 200, ok: true, url: String(url), text: async () => '{"ok":1,"message":"已发布"}' }
  }
  const ai = await load(w)
  const action = ai.actions({ route: { type: 'topic_edit' } }).find((item) => item.id === 'site.write-topic')
  assert.equal(action?.permission, 'write')
  const pending = ai.execute({
    action: 'site.write-topic', args: { title: '新主题标题', body: '新主题完整正文' },
  }, { route: { type: 'topic_edit' } })
  assert.equal(await until(() => w.document.querySelector('.lsb-panel [data-yes]'), w), true)
  assert.match(w.document.querySelector('.lsb-panel').textContent, /版块 #7/)
  assert.match(w.document.querySelector('.lsb-panel').textContent, /新主题完整正文/)
  w.document.querySelector('.lsb-panel [data-yes]').click()
  assert.equal((await pending).kind, 'completed')
  assert.equal(requests.length, 1)
  const submitted = [...requests[0].init.body.entries()].map(([name, value]) => [name, String(value)])
  assert.deepEqual(submitted.map(([name]) => name).sort(), ['_csrf', 'body', 'forum_id', 'title'])
  assert.equal(submitted.find(([name]) => name === 'forum_id')?.[1], '7')
})

test('AI 签到动作：调用签到日历安全 RPC 并保留二次确认', async () => {
  const openForm = '<html><body><form method="post" action="/daily_checkin"><input type="hidden" name="_csrf" value="csrf-checkin"><input type="hidden" name="day" value="today"></form></body></html>'
  const w = makePage('/daily_checkin')
  w.localStorage.setItem('lsb_base:checkin-calendar:__config', JSON.stringify({ autoProbe: false }))
  const requests = []
  w.fetch = async (url, init = {}) => {
    if (init.method === 'POST') requests.push(String(url))
    return { status: 200, ok: true, url: String(url), text: async () => openForm }
  }
  const ai = await load(w, { checkin: true })
  const action = ai.actions({ route: { type: 'checkin' } }).find((item) => item.id === 'site.write-checkin')
  assert.equal(action?.permission, 'write')
  const requestedRpc = []
  const request = w.LSB.bus.request.bind(w.LSB.bus)
  w.LSB.bus.request = (name, ...args) => {
    requestedRpc.push(name)
    return request(name, ...args)
  }
  const pending = ai.execute({ action: 'site.write-checkin', args: {} }, { route: { type: 'checkin' } })
  assert.equal(await until(() => w.document.querySelector('.lsb-panel [data-no]'), w), true)
  w.document.querySelector('.lsb-panel [data-no]').click()
  assert.equal((await pending).kind, 'cancelled')
  assert.deepEqual(requestedRpc, ['checkin-calendar:ai-checkin'])
  assert.deepEqual(requests, [])
})

test('M11 AI 写动作 trace：未知回执只发布 execute/check/limit 安全事件', async () => {
  const w = makePage()
  const body = 'trace-private-body'
  const checkedHtml = topicHtml.replace(
    '</ul><div class="pagination-bar">',
    `<li class="post-item post-entry" id="post-999" data-floor="24"><div class="post-body"><div class="post-head has-floor"><a class="post-title post-author" href="/user/5372">xB70sR71</a></div></div><div class="post-content"><p>${body}</p></div></li></ul><div class="pagination-bar">`,
  )
  const events = []
  let posts = 0
  let gets = 0
  w.fetch = async (url, init = {}) => {
    if (String(init.method || 'GET').toUpperCase() === 'POST') {
      posts += 1
      throw new Error('trace connection lost')
    }
    gets += 1
    return { status: 200, ok: true, url: String(url), text: async () => checkedHtml }
  }
  const ai = await load(w, { traceEvents: events })
  const flowId = 'write-trace-test'
  const pending = ai.execute({ action: 'site.write-reply', args: { body } }, { ...topicRoute, flowId })
  assert.equal(await until(() => w.document.querySelector('.lsb-panel [data-yes]'), w), true)
  w.document.querySelector('.lsb-panel [data-yes]').click()
  const unknown = await pending
  assert.equal(unknown.kind, 'unknown')
  assert.equal(posts, 1)
  const checked = await w.LSB.bus.request('ai-write-actions:check-result', { receipt: unknown.receipt })
  assert.equal(checked.outcome, 'success')
  assert.equal(gets, 1)

  assert.deepEqual(events.map((event) => [event.stage, event.state]), [
    ['execute', 'active'],
    ['execute', 'unknown'],
    ['limit', 'complete'],
    ['check', 'active'],
    ['check', 'complete'],
  ])
  assert.ok(events.every((event) => event.flowId === flowId))
  const serialized = JSON.stringify(events)
  assert.doesNotMatch(serialized, /trace-private-body|csrf|receipt|topic\/1/i)
})
