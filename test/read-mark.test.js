/** 已读置灰：帖子页标记 / 列表上色与未读角标 / 无限滚动新增条目 */
import { test } from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { JSDOM } from 'jsdom'

const baseCode = readFileSync(new URL('../dist/linuxsb-base.user.js', import.meta.url), 'utf8')
const PLUG = (n) => readFileSync(new URL(`../plugins/${n}`, import.meta.url), 'utf8')
const homeHtml = readFileSync(new URL('./fixtures/home.html', import.meta.url), 'utf8')
const topicHtml = readFileSync(new URL('./fixtures/topic1.html', import.meta.url), 'utf8')

function makeSite(html, url, preload = {}) {
  const dom = new JSDOM(html, { url: 'https://linux.sb' + url, runScripts: 'outside-only' })
  const w = dom.window
  w.unsafeWindow = w
  w.requestAnimationFrame = (fn) => setTimeout(() => fn(Date.now()), 0)
  w.localStorage.setItem('lsb_base:__core:rate', JSON.stringify(10))
  w.localStorage.setItem('lsb_base:__core:urlPoll', JSON.stringify(0))
  for (const [k, v] of Object.entries(preload)) w.localStorage.setItem(k, JSON.stringify(v))
  const tick = (ms) => new Promise((r) => setTimeout(r, ms))
  async function until(fn, ms = 2000, step = 20) {
    const end = Date.now() + ms
    for (;;) {
      let ok = false
      try {
        ok = fn()
      } catch {
        /* keep polling */
      }
      if (ok) return true
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

/** 与 parseListItem 相同的启发式：取 post-meta 里最后一个纯数字 span */
function itemInfo(w, index) {
  const li = w.document.querySelectorAll('ul.post-list > li.post-item')[index]
  const a = li.querySelector('a.post-title')
  const id = Number(a.getAttribute('href').match(/\/topic\/(\d+)/)[1])
  const stamp = li.querySelector('span[data-performance-time]')
  const num = (s) => Number(String(s).replace(/,/g, ''))
  const text = (el) => (el ? el.textContent.trim() : '')
  const counts = [...li.querySelectorAll('.post-meta span')]
    .map(text)
    .filter((t) => /^\d[\d,]*$/.test(t))
    .map(num)
  return { id, lastTs: stamp ? Number(stamp.getAttribute('data-performance-time')) : 0, replies: counts.length ? counts[counts.length - 1] : null, li }
}

/* ─────────── 标记侧 ─────────── */

test('已读置灰：帖子页打开即记录水位线与回复数', async () => {
  const { w } = makeSite(topicHtml, '/topic/1')
  await loadBase(w, PLUG('read-mark.user.js'))

  const dbg = await w.LSB.bus.request('read-mark:debug')
  assert.equal(dbg.seen(1), true, '访问即标记')

  // 回复数应等于 stats 的第二个数字（浏览/回复），从夹具动态求期望值
  const text = (el) => el.textContent.trim()
  const stats = [...w.document.querySelectorAll('.post-content-stats span')]
    .map(text)
    .filter((t) => /^\d[\d,]*$/.test(t))
    .map((t) => Number(t.replace(/,/g, '')))
  const rec = dbg.rec(1)
  assert.equal(rec.r, stats[1], `回复数 ${rec.r} 应为页面回复统计 ${stats[1]}`)
  assert.ok(rec.w > 0 && rec.w <= Date.now() / 1000 + 5, '水位线是楼层时间戳')
})

/* ─────────── 上色侧 ─────────── */

test('已读置灰：看过的帖子只置灰，不再挂未读角标（站点自己有未读）', async () => {
  const probe = makeSite(homeHtml, '/')
  const a = itemInfo(probe.w, 0)
  const b = itemInfo(probe.w, 1)
  const c = itemInfo(probe.w, 2)

  const marks = {
    [a.id]: { ts: Date.now(), w: a.lastTs, r: a.replies },
    [b.id]: { ts: Date.now(), w: b.lastTs - 1000, r: b.replies == null ? null : b.replies - 3 },
    [c.id]: { ts: Date.now(), w: c.lastTs - 1000, r: null },
  }

  const { w, until } = makeSite(homeHtml, '/', { 'lsb_base:read-mark:marks': marks })
  await loadBase(w, PLUG('read-mark.user.js'))

  const liOf = (i) => w.document.querySelectorAll('ul.post-list > li.post-item')[i]
  await until(() => liOf(0).classList.contains('lsb-seen'))

  assert.ok(liOf(0).classList.contains('lsb-seen'), 'A 置灰')
  assert.ok(liOf(1).classList.contains('lsb-seen'), 'B 有新回复也只置灰')
  assert.ok(liOf(2).classList.contains('lsb-seen'), 'C 只置灰')
  assert.equal(w.document.querySelectorAll('.lsb-read-badge').length, 0, '不再显示未读/新回复角标')
  assert.equal(liOf(3).classList.contains('lsb-seen'), false, '未看过的条目保持原样')
})

test('已读置灰：无限滚动新增的条目也会被上色', async () => {
  const probe = makeSite(homeHtml, '/')
  const a = itemInfo(probe.w, 0)

  const marks = { [a.id]: { ts: Date.now(), w: a.lastTs - 5000, r: (a.replies ?? 0) + 0 } }
  const { w, until } = makeSite(homeHtml, '/', { 'lsb_base:read-mark:marks': marks })
  await loadBase(w, PLUG('read-mark.user.js'))

  // 模拟站点无限滚动追加一个"同一帖子的更后列表项"，回复数多了 6 条
  const ul = w.document.querySelector('ul.post-list')
  const li = w.document.createElement('li')
  li.className = 'post-item'
  li.innerHTML =
    `<div class="post-body"><div class="post-title-row">` +
    `<a class="post-title" href="/topic/${a.id}">同帖后加载</a></div>` +
    `<div class="post-meta"><span data-performance-time="${a.lastTs}"></span><span>${(a.replies || 0) + 6}</span></div></div>`
  ul.appendChild(li)

  const ok = await until(() => li.classList.contains('lsb-seen'))
  assert.ok(ok, '新增条目被置灰')
  assert.equal(li.querySelector('.lsb-read-badge'), null, '无限滚动条目也不挂未读角标')
})

test('已读置灰：站点自带未读标记保留，我们不再叠角标', async () => {
  const probe = makeSite(homeHtml, '/')
  const a = itemInfo(probe.w, 0)

  const marks = {
    [a.id]: { ts: Date.now(), w: a.lastTs - 1000, r: Math.max(0, (a.replies ?? 0) - 3) },
    4242: { ts: Date.now(), w: 1, r: 0 },
  }
  const { w, until } = makeSite(homeHtml, '/', { 'lsb_base:read-mark:marks': marks })
  await loadBase(w, PLUG('read-mark.user.js'))

  const liOf = (i) => w.document.querySelectorAll('ul.post-list > li.post-item')[i]

  assert.ok(await until(() => liOf(0).classList.contains('lsb-seen')), 'A 置灰')
  assert.equal(liOf(0).querySelector('.lsb-read-badge'), null)
  assert.equal(w.document.querySelectorAll('.lsb-read-badge').length, 0)

  const ul = w.document.querySelector('ul.post-list')
  const hot = w.document.createElement('li')
  hot.className = 'post-item'
  hot.innerHTML =
    '<div class="post-body"><div class="post-title-row">' +
    '<span class="topic-badge pinned">置顶</span>' +
    '<a class="post-title" href="/topic/4242">超长标题</a>' +
    '<a class="unread-topic-notice" href="/topic/4242">未读</a></div>' +
    '<div class="post-meta"><span data-performance-time="1"></span><span>150</span></div></div>'
  ul.appendChild(hot)
  await until(() => hot.classList.contains('lsb-seen'))
  assert.ok(hot.querySelector('a.unread-topic-notice'), '站点原生未读标记还在')
  assert.equal(hot.querySelector('.lsb-read-badge'), null, '不再叠自己的未读角标')
})

test('已读置灰：列表点进帖子再回来，软导航也要记账并置灰', async () => {
  const probe = makeSite(homeHtml, '/')
  const a = itemInfo(probe.w, 0)
  const { w, tick, until } = makeSite(homeHtml, '/')
  await loadBase(w, PLUG('read-mark.user.js'))

  const li = () => [...w.document.querySelectorAll('ul.post-list > li.post-item')].find((el) =>
    el.querySelector(`a.post-title[href="/topic/${a.id}"]`),
  )
  assert.equal(li()?.classList.contains('lsb-seen'), false, '没点进去之前不应置灰')

  w.history.pushState({}, '', `/topic/${a.id}`)
  w.dispatchEvent(new w.PopStateEvent('popstate'))
  await tick(30)
  w.history.pushState({}, '', '/')
  w.dispatchEvent(new w.PopStateEvent('popstate'))

  assert.ok(await until(() => li()?.classList.contains('lsb-seen')), '壳内跳进帖子再回列表，该帖应记已读并置灰')
  const dbg = await w.LSB.bus.request('read-mark:debug')
  assert.equal(dbg.seen(a.id), true)
})

test('已读置灰：debug RPC 的 forget/clear 生效', async () => {
  const marks = { 999: { ts: Date.now(), w: 100, r: 5 }, 998: { ts: Date.now(), w: 90, r: 4 } }
  const { w } = makeSite(homeHtml, '/', { 'lsb_base:read-mark:marks': marks })
  await loadBase(w, PLUG('read-mark.user.js'))

  const dbg = await w.LSB.bus.request('read-mark:debug')
  assert.equal(dbg.seen(999), true)
  dbg.forget(999)
  assert.equal(dbg.seen(999), false, 'forget 后不再视为看过')
  assert.equal(dbg.seen(998), true, '不影响其它记录')
  dbg.clear()
  assert.equal(Object.keys(dbg.all()).length, 0, 'clear 清空全部')
})
