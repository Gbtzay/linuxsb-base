/**
 * 三件套功能测试：断点续读 / 用户画像悬浮卡 / AI 总结
 * 在 jsdom 里加载 dist 产物 + 对应插件，stub 网络后走真实交互路径。
 */
import { test } from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { JSDOM } from 'jsdom'

const baseCode = readFileSync(new URL('../dist/linuxsb-base.user.js', import.meta.url), 'utf8')
const PLUG = (n) => readFileSync(new URL(`../plugins/${n}`, import.meta.url), 'utf8')
const topicHtml = readFileSync(new URL('./fixtures/topic1.html', import.meta.url), 'utf8')
const userHtml = readFileSync(new URL('./fixtures/user1.html', import.meta.url), 'utf8')
const homeHtml = readFileSync(new URL('./fixtures/home.html', import.meta.url), 'utf8')

function makeSite({ preload = {} } = {}) {
  const dom = new JSDOM(topicHtml, { url: 'https://linux.sb/topic/1', runScripts: 'outside-only' })
  const w = dom.window
  w.unsafeWindow = w
  w.requestAnimationFrame = (fn) => setTimeout(() => fn(Date.now()), 0)
  w.localStorage.setItem('lsb_base:__core:rate', JSON.stringify(10)) // 测试提速：限速 10ms
  for (const [k, v] of Object.entries(preload)) {
    w.localStorage.setItem(k, JSON.stringify(v))
  }
  const tick = (ms) => new Promise((r) => setTimeout(r, ms))
  async function until(fn, ms = 1200, step = 25) {
    const end = Date.now() + ms
    for (;;) {
      try {
        if (fn()) return true
      } catch {
        /* keep polling */
      }
      if (Date.now() > end) return false
      await tick(step)
    }
  }
  return { w, tick, until }
}

async function loadBase(w, ...plugins) {
  w.eval(baseCode)
  for (const code of plugins) w.eval(code)
  await new Promise((r) => setTimeout(r, 30))
}

/* ─────────── 断点续读 ─────────── */

test('续读：无记录不弹条；保存位置持久化；容量修剪到上限', async () => {
  const { w } = makeSite()
  await loadBase(w, PLUG('resume-reading.user.js'))
  const dbg = await w.LSB.bus.request('resume-reading:debug')

  assert.equal(dbg.barVisible(), false, '无记录时不弹条')

  dbg.saveFloor(40)
  const saved = dbg.load()
  assert.equal(saved.f, 40)
  assert.equal(saved.p, 1)
  assert.ok(saved.title.includes('LINUX SB上线'))

  // 容量修剪：tid1 的 ts 是「现在」，写入 ts 更晚的 500 帖后，最旧的 tid1 应被挤出
  for (let i = 2; i <= 501; i++) {
    dbg.saveRec({ f: i, p: 1, ts: Date.now() + i, title: `t${i}` }, i)
  }
  const all = dbg.all()
  assert.equal(Object.keys(all).length, 500, `实际 ${Object.keys(all).length}`)
  assert.ok(all['501'], '最新记录保留')
  assert.equal(all['1'], undefined, '最旧记录被修剪')
})

test('续读：有记录时弹提示条、标 NEW、可跳转高亮', async () => {
  const floorsInDom = () =>
    [...new JSDOM(topicHtml).window.document.querySelectorAll('li.post-entry[data-floor]')]
  void floorsInDom

  const { w, until } = makeSite({
    preload: { 'lsb_base:resume-reading:positions': { 1: { f: 5, p: 1, ts: Date.now(), title: 'x' } } },
  })
  await loadBase(w, PLUG('resume-reading.user.js'))
  const dbg = await w.LSB.bus.request('resume-reading:debug')

  assert.equal(dbg.barVisible(), true, '#5 ≥ minAsk(3)，弹出续读条')
  assert.match(w.document.querySelector('.lsb-resume-bar').textContent, /上次读到 #5/)

  // NEW 标记数量 == 楼层号 > 5 的楼层数
  const expected = [...w.document.querySelectorAll('li.post-entry[data-floor]')].filter(
    (li) => Number(li.getAttribute('data-floor')) > 5,
  ).length
  await until(() => w.document.querySelectorAll('li.lsb-unread').length === expected)
  assert.equal(dbg.unreadCount, expected)

  // 跳转：目标楼层加高亮
  assert.equal(dbg.jump(18), true)
  assert.ok(w.document.querySelector('li.post-entry[data-floor="18"]').classList.contains('lsb-flash'))

  // 点忽略 → 提示条消失
  w.document.querySelector('.lsb-resume-bar .lsb-btn:not(.is-primary)').click()
  assert.equal(dbg.barVisible(), false)
})

test('续读：低于阈值的记录不弹条', async () => {
  const { w } = makeSite({
    preload: { 'lsb_base:resume-reading:positions': { 1: { f: 2, p: 1, ts: Date.now(), title: 'x' } } },
  })
  await loadBase(w, PLUG('resume-reading.user.js'))
  const dbg = await w.LSB.bus.request('resume-reading:debug')
  assert.equal(dbg.barVisible(), false, '#2 < minAsk(3)')
})

test('续读：只有 topic-post-list 时也能跳转（不依赖 ul.post-list）', async () => {
  const html =
    '<!DOCTYPE html><html><body>' +
    '<ul class="topic-post-list">' +
    [1, 5, 18]
      .map(
        (f) =>
          `<li class="post-entry" id="post-${1000 + f}" data-floor="${f}">` +
          '<a class="post-title post-author" href="/user/1">A</a>' +
          '<span data-performance-time="1"></span><div class="post-content">x</div></li>',
      )
      .join('') +
    '</ul><form class="ajax-reply-form"><input name="_csrf" value="c"></form>' +
    '<a href="/user/1">我的主页</a></body></html>'
  const dom = new JSDOM(html, { url: 'https://linux.sb/topic/1', runScripts: 'outside-only' })
  const w = dom.window
  w.unsafeWindow = w
  w.requestAnimationFrame = (fn) => setTimeout(() => fn(Date.now()), 0)
  w.localStorage.setItem('lsb_base:__core:rate', JSON.stringify(10))
  w.localStorage.setItem(
    'lsb_base:resume-reading:positions',
    JSON.stringify({ 1: { f: 5, p: 1, ts: Date.now(), title: 'x' } }),
  )
  w.eval(baseCode)
  w.eval(PLUG('resume-reading.user.js'))
  await new Promise((r) => setTimeout(r, 40))
  const dbg = await w.LSB.bus.request('resume-reading:debug')
  assert.equal(dbg.jump(18), true)
  assert.ok(w.document.querySelector('li.post-entry[data-floor="18"]').classList.contains('lsb-flash'))
  const unread = [...w.document.querySelectorAll('li.post-entry.lsb-unread')].map((li) => li.getAttribute('data-floor'))
  assert.deepEqual(unread, ['18'])
})

test('续读：NEW 挂在 UID 或创作者后面，不占右上角', async () => {
  const html =
    '<!DOCTYPE html><html><body><ul class="post-list">' +
    '<li class="post-item post-entry" id="post-10" data-floor="10">' +
    '<div class="post-head"><a class="post-title post-author" href="/user/2">无章</a>' +
    '<span class="post-user-group user-uid-badge" title="用户 UID">UID 2</span></div>' +
    '<span data-performance-time="1"></span><div class="post-content">x</div></li>' +
    '<li class="post-item post-entry" id="post-11" data-floor="11">' +
    '<div class="post-head"><a class="post-title post-author" href="/user/3">有章</a>' +
    '<span class="post-user-group user-uid-badge" title="用户 UID">UID 3</span>' +
    '<span class="post-user-group">创作者</span></div>' +
    '<span data-performance-time="1"></span><div class="post-content">x</div></li>' +
    '</ul><form class="ajax-reply-form"><input name="_csrf" value="c"></form>' +
    '<a href="/user/1">我的主页</a></body></html>'
  const dom = new JSDOM(html, { url: 'https://linux.sb/topic/1', runScripts: 'outside-only' })
  const w = dom.window
  w.unsafeWindow = w
  w.requestAnimationFrame = (fn) => setTimeout(() => fn(Date.now()), 0)
  w.localStorage.setItem('lsb_base:__core:rate', JSON.stringify(10))
  w.localStorage.setItem(
    'lsb_base:resume-reading:positions',
    JSON.stringify({ 1: { f: 3, p: 1, ts: Date.now(), title: 'x' } }),
  )
  w.eval(baseCode)
  w.eval(PLUG('resume-reading.user.js'))
  await new Promise((r) => setTimeout(r, 40))

  const noCreator = w.document.querySelector('[data-floor="10"]')
  const withCreator = w.document.querySelector('[data-floor="11"]')
  const new10 = noCreator.querySelector('.lsb-new')
  const new11 = withCreator.querySelector('.lsb-new')
  assert.ok(new10, '无创作者的楼应有 NEW 节点')
  assert.ok(new11, '有创作者的楼应有 NEW 节点')
  assert.equal(new10.textContent, 'NEW')
  assert.match(new10.previousElementSibling?.textContent || '', /UID 2/, '无创作者时 NEW 紧跟 UID')
  assert.match(new11.previousElementSibling?.textContent || '', /创作者/, '有创作者时 NEW 紧跟创作者标识')
  const css = w.document.getElementById('lsb-style-resume-reading')?.textContent || ''
  assert.ok(!/lsb-unread::after/.test(css), '不再用右上角伪元素，避免挡住只看 TA')
})

test('续读：已读楼层的 NEW 约 5 秒后消失，未读入视野的还在', async () => {
  const html =
    '<!DOCTYPE html><html><body><ul class="post-list">' +
    [10, 20]
      .map(
        (f) =>
          `<li class="post-item post-entry" id="post-${f}" data-floor="${f}">` +
          `<div class="post-head"><a class="post-title post-author" href="/user/${f}">U${f}</a>` +
          `<span class="post-user-group user-uid-badge">UID ${f}</span></div>` +
          '<span data-performance-time="1"></span><div class="post-content">x</div></li>',
      )
      .join('') +
    '</ul><form class="ajax-reply-form"><input name="_csrf" value="c"></form>' +
    '<a href="/user/1">我的主页</a></body></html>'
  const dom = new JSDOM(html, { url: 'https://linux.sb/topic/1', runScripts: 'outside-only' })
  const w = dom.window
  w.unsafeWindow = w
  w.innerHeight = 800
  w.requestAnimationFrame = (fn) => setTimeout(() => fn(Date.now()), 0)
  w.localStorage.setItem('lsb_base:__core:rate', JSON.stringify(10))
  w.localStorage.setItem(
    'lsb_base:resume-reading:positions',
    JSON.stringify({ 1: { f: 3, p: 1, ts: Date.now(), title: 'x' } }),
  )
  w.eval(baseCode)
  w.eval(PLUG('resume-reading.user.js'))
  await new Promise((r) => setTimeout(r, 40))
  assert.ok(w.document.querySelector('[data-floor="10"] .lsb-new'))
  assert.ok(w.document.querySelector('[data-floor="20"] .lsb-new'))

  w.document.querySelector('[data-floor="10"]').getBoundingClientRect = () => ({
    top: 20, bottom: 60, height: 40, width: 200, left: 0, right: 200, x: 0, y: 20,
  })
  w.document.querySelector('[data-floor="20"]').getBoundingClientRect = () => ({
    top: 900, bottom: 940, height: 40, width: 200, left: 0, right: 200, x: 0, y: 900,
  })
  w.dispatchEvent(new w.Event('scroll'))
  await new Promise((r) => setTimeout(r, 700))
  assert.ok(w.document.querySelector('[data-floor="10"] .lsb-new'), '刚读到时 NEW 还在，等 5 秒')
  await new Promise((r) => setTimeout(r, 5100))
  assert.equal(w.document.querySelector('[data-floor="10"] .lsb-new'), null, '已读约 5 秒后 NEW 消失')
  assert.equal(w.document.querySelector('[data-floor="10"]').classList.contains('lsb-unread'), false)
  assert.ok(w.document.querySelector('[data-floor="20"] .lsb-new'), '还没进入视野的楼 NEW 仍在')
})

test('续读：软翻页后保存的页码跟随 api.page', async () => {
  const { w, tick } = makeSite()
  w.localStorage.setItem('lsb_base:__core:urlPoll', JSON.stringify(20))
  await loadBase(w, PLUG('resume-reading.user.js'))
  const dbg = await w.LSB.bus.request('resume-reading:debug')
  w.history.pushState({}, '', '/topic/1?p=2')
  await tick(80)
  dbg.saveFloor(40)
  assert.equal(dbg.load().p, 2)
})

/* ─────────── 用户画像悬浮卡 ─────────── */

function userPageStub(calls) {
  return async (url) => {
    calls.push(String(url))
    return { status: 200, ok: true, url: String(url), text: async () => userHtml }
  }
}

test('画像卡：悬停加载真实用户页数据；同 uid 走缓存不再请求', async () => {
  const calls = []
  const { w, until } = makeSite({
    preload: { 'lsb_base:hover-profile:__config': { delayMs: 0, ttlHours: 24, negTtlMin: 5, showTopics: true } },
  })
  await loadBase(w, PLUG('hover-profile.user.js'))
  w.fetch = userPageStub(calls)

  const link = w.document.querySelector('a[href="/user/1"]')
  link.dispatchEvent(new w.MouseEvent('mouseenter', { bubbles: false }))

  const ok = await until(() => {
    const c = w.document.querySelector('.lsb-hover-card.is-on')
    return c && c.textContent.includes('痛失姓名的站长')
  })
  assert.ok(ok, '浮卡显示用户名')
  assert.match(w.document.querySelector('.lsb-hover-card').textContent, /6238/, '积分来自解析层')
  assert.equal(calls.length, 1, '只发了一次请求')
  assert.match(calls[0], /\/user\/1$/)

  // 缓存生效：换一个入口再次触发同一 uid
  const dbg = await w.LSB.bus.request('hover-profile:debug')
  await dbg.show(1)
  assert.equal(calls.length, 1, '缓存命中，零请求')
  assert.equal(dbg.cacheSize(), 1)
})

test('画像卡：请求失败进入负缓存，短时间不再重试', async () => {
  const calls = []
  const { w } = makeSite({
    preload: { 'lsb_base:hover-profile:__config': { delayMs: 0, ttlHours: 24, negTtlMin: 5 } },
  })
  await loadBase(w, PLUG('hover-profile.user.js'))
  w.fetch = async (url) => {
    calls.push(String(url))
    return { status: 404, ok: false, url: String(url), text: async () => '' }
  }

  const dbg = await w.LSB.bus.request('hover-profile:debug')
  await assert.rejects(() => dbg.show(99999), /HTTP 404|解析失败|没有帖子|非 2xx/)
  const afterFirst = calls.length
  assert.ok(afterFirst >= 1)

  await assert.rejects(() => dbg.show(99999))
  assert.equal(calls.length, afterFirst, '负缓存内不发第二次请求')
})

/* ─────────── AI 总结 ─────────── */

const LLM_URL = 'https://llm.test/v1/chat/completions'

function llmStub(calls, text = '【MOCK 摘要】这是测试输出。') {
  return async (url, init = {}) => {
    calls.push({ url: String(url), init })
    return {
      status: 200,
      ok: true,
      url: String(url),
      text: async () => JSON.stringify({ choices: [{ message: { content: text } }] }),
    }
  }
}

const AI_PRELOAD = {
  'lsb_base:ai-summary:__config': {
    apiUrl: LLM_URL,
    apiKey: 'k-test',
    model: 'mock-model',
    style: '要点速览',
    maxChars: 4000,
    fetchAll: false,
    customPrompt: '',
  },
}

test('AI 总结：点击主楼按钮 → 调用配置端点 → 弹出结果面板并缓存', async () => {
  const calls = []
  const { w, until } = makeSite({ preload: AI_PRELOAD })
  await loadBase(w, PLUG('ai-summary.user.js'))
  w.fetch = llmStub(calls)

  const btn = [...w.document.querySelectorAll('.lsb-op')].find((b) => b.textContent.includes('AI 总结'))
  assert.ok(btn, '主楼操作区已注入按钮')
  btn.click()

  const shown = await until(() =>
    w.document.querySelector('.lsb-summary-panel .lsb-sum-text')?.textContent.includes('【MOCK 摘要】'),
  )
  assert.ok(shown, '结果面板展示模型返回文本')
  assert.equal(calls.length, 1)
  assert.equal(calls[0].url, LLM_URL)
  assert.equal(calls[0].init.headers.authorization, 'Bearer k-test')
  const body = JSON.parse(calls[0].init.body)
  assert.equal(body.model, 'mock-model')
  assert.match(body.messages[1].content, /标题：LINUX SB上线/)
  assert.match(body.messages[1].content, /\[#18\]/, '楼层带楼层号标注')

  const dbg = await w.LSB.bus.request('ai-summary:debug')
  assert.equal(dbg.cached().text, '【MOCK 摘要】这是测试输出。')

  // 关闭后再点：命中缓存，不再发请求
  w.document.querySelector('.lsb-summary-panel .lsb-panel-close').click()
  assert.equal(w.document.querySelector('.lsb-summary-panel'), null)
  const btn2 = [...w.document.querySelectorAll('.lsb-op')].find((b) => b.textContent.includes('已有总结'))
  btn2.click()
  await until(() => !!w.document.querySelector('.lsb-summary-panel'))
  assert.equal(calls.length, 1, '缓存命中零请求')
})

test('AI 总结：采集实时 DOM（无限滚动新增楼层不丢失）', async () => {
  const calls = []
  const { w, until } = makeSite({ preload: AI_PRELOAD })
  await loadBase(w, PLUG('ai-summary.user.js'))
  w.fetch = llmStub(calls)

  // 模拟站点无限滚动追加了新楼层（启动快照里没有）
  const li = w.document.createElement('li')
  li.className = 'post-item post-entry'
  li.id = 'post-777'
  li.dataset.floor = '999'
  li.innerHTML =
    '<a class="post-title post-author" href="/user/5">晚到的楼层</a>' +
    '<div class="post-content"><p>无限滚动新增层XYZ</p></div>'
  w.document.querySelector('ul.topic-post-list').appendChild(li)
  await new Promise((r) => setTimeout(r, 40))

  const btn = [...w.document.querySelectorAll('.lsb-op')].find((b) => b.textContent.includes('AI 总结'))
  btn.click()
  await until(() => !!w.document.querySelector('.lsb-summary-panel'))

  const body = JSON.parse(calls[0].init.body)
  assert.match(body.messages[1].content, /无限滚动新增层XYZ/, '实时 DOM 中的新楼层被采集')
  assert.match(body.messages[1].content, /\[#999\]/)

  const dbg = await w.LSB.bus.request('ai-summary:debug')
  const { content } = await dbg.collect()
  assert.ok(content.includes('XYZ'))
})

test('AI 总结：未配置 Key 时引导打开设置页而不发请求', async () => {
  const calls = []
  const { w, until } = makeSite()
  await loadBase(w, PLUG('ai-summary.user.js'))
  w.fetch = llmStub(calls)

  const btn = [...w.document.querySelectorAll('.lsb-op')].find((b) => b.textContent.includes('AI 总结'))
  btn.click()
  await until(() => !!w.document.querySelector('.lsb-panel'))
  assert.equal(calls.length, 0, '零请求')
  assert.ok(w.LSB.info(), '面板被拉起且基座正常')
})

test('AI 总结：首页设置面板也能打开配置（不要求先进入帖子）', async () => {
  const dom = new JSDOM(homeHtml, { url: 'https://linux.sb/', runScripts: 'outside-only' })
  const w = dom.window
  w.unsafeWindow = w
  w.requestAnimationFrame = (fn) => setTimeout(() => fn(Date.now()), 0)
  w.localStorage.setItem('lsb_base:__core:rate', JSON.stringify(10))
  await loadBase(w, PLUG('ai-summary.user.js'))
  assert.equal(w.LSB.info().plugins.find((p) => p.id === 'ai-summary')?.state, 'active')
  w.LSB.open('ai-summary')
  const names = [...w.document.querySelectorAll('.lsb-tab')].map((b) => b.textContent)
  assert.ok(names.includes('AI 总结'), `侧栏应有 AI 总结，实际：${names.join('/')}`)
  assert.ok(names.includes('AI 历史'), `侧栏应有 AI 历史，实际：${names.join('/')}`)
  assert.match(w.document.querySelector('.lsb-view')?.textContent || '', /API 端点/)
})
