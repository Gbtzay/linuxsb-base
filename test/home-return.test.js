/** 首页回位：点列表帖记下位置，回首页再滚到那条；不在第一页就往后加载 */
import { test } from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { JSDOM } from 'jsdom'

const baseCode = readFileSync(new URL('../dist/linuxsb-base.user.js', import.meta.url), 'utf8')
const PLUG = (n) => readFileSync(new URL(`../plugins/${n}`, import.meta.url), 'utf8')
const homeHtml = readFileSync(new URL('./fixtures/home.html', import.meta.url), 'utf8')
const userHtml = readFileSync(new URL('./fixtures/user1.html', import.meta.url), 'utf8')

const KEY = 'lsb_base:home-return:target'

function makeDom(html, url, preload = {}) {
  const dom = new JSDOM(html, { url, runScripts: 'outside-only' })
  const w = dom.window
  w.unsafeWindow = w
  w.requestAnimationFrame = (fn) => setTimeout(() => fn(Date.now()), 0)
  w.scrollTo = () => {}
  w.localStorage.setItem('lsb_base:__core:rate', JSON.stringify(10))
  w.localStorage.setItem('lsb_base:__core:urlPoll', JSON.stringify(0))
  for (const [k, v] of Object.entries(preload)) w.localStorage.setItem(k, JSON.stringify(v))
  const tick = (ms) => new Promise((r) => setTimeout(r, ms))
  async function until(fn, ms = 2000, step = 20) {
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

function makeHome(preload = {}) {
  return makeDom(homeHtml, 'https://linux.sb/', preload)
}

async function loadBase(w, ...plugins) {
  w.eval(baseCode)
  for (const code of plugins) w.eval(code)
  await new Promise((r) => setTimeout(r, 30))
}

function firstList(w) {
  const li = w.document.querySelector('ul.post-list > li.post-item')
  const a = li.querySelector('a.post-title[href*="/topic/"]')
  const id = Number((a.getAttribute('href').match(/\/topic\/(\d+)/) || [])[1])
  return { li, a, id }
}

function stubRect(w, tid, top) {
  const orig = w.Element.prototype.getBoundingClientRect
  w.Element.prototype.getBoundingClientRect = function () {
    const href = this.querySelector?.('a.post-title')?.getAttribute('href') || this.getAttribute?.('href') || ''
    if (href.includes(`/topic/${tid}`) || (this.closest && this.closest(`a.post-title[href*="/topic/${tid}"]`))) {
      return { top, bottom: top + 50, height: 50, width: 400, left: 0, right: 400, x: 0, y: top }
    }
    if (this.matches?.('li.post-item') && this.querySelector(`a.post-title[href*="/topic/${tid}"]`)) {
      return { top, bottom: top + 50, height: 50, width: 400, left: 0, right: 400, x: 0, y: top }
    }
    return orig.call(this)
  }
}

function captureScroll(w) {
  const scrolled = []
  w.scrollTo = (a, b) => {
    if (typeof a === 'object' && a) scrolled.push(Number(a.top) || 0)
    else scrolled.push(Number(b) || 0)
  }
  return scrolled
}

function stubHtmlFetch(w, htmlFor) {
  const calls = []
  w.fetch = async (url) => {
    const href = String(url)
    calls.push(href)
    const html = typeof htmlFor === 'function' ? htmlFor(href) : htmlFor
    return {
      status: 200,
      ok: true,
      url: href,
      text: async () => html,
    }
  }
  return calls
}

test('首页回位：点列表标题记下帖 id 与视口偏移', async () => {
  const { w } = makeHome()
  await loadBase(w, PLUG('home-return.user.js'))
  const { a, id, li } = firstList(w)
  stubRect(w, id, 180)
  a.click()
  const raw = w.sessionStorage.getItem(KEY)
  const rec = JSON.parse(raw)
  assert.equal(rec.tid, id, '记下点进的帖 id')
  assert.equal(rec.offset, 180, '记下点击时该条在视口里的 top')
  assert.equal(li.querySelector('a.post-title'), a)
})

test('首页回位：再进首页滚到记下的那条', async () => {
  const probe = makeHome()
  const { id } = firstList(probe.w)
  const { w, tick } = makeHome()
  w.sessionStorage.setItem(KEY, JSON.stringify({ tid: id, offset: 90, ts: Date.now() }))
  stubRect(w, id, 400)
  const scrolled = captureScroll(w)
  await loadBase(w, PLUG('home-return.user.js'))
  await tick(50)
  assert.ok(
    scrolled.some((y) => y === 310),
    `应滚到 400-90=310，实际 ${JSON.stringify(scrolled)}`,
  )
})

test('首页回位：第一页没有时加载后续页再回位', async () => {
  const page2 =
    '<!DOCTYPE html><html><body><ul class="post-list">' +
    '<li class="post-item"><div class="post-body"><a class="post-title" href="/topic/99002">第二页才出现的帖</a></div></li>' +
    '</ul></body></html>'
  const { w, tick, until } = makeHome()
  w.sessionStorage.setItem(KEY, JSON.stringify({ tid: 99002, offset: 80, ts: Date.now() }))
  stubRect(w, 99002, 500)
  const scrolled = captureScroll(w)
  const calls = stubHtmlFetch(w, (url) => (/[?&]p=2(?:&|$)/.test(String(url)) ? page2 : homeHtml))
  await loadBase(w, PLUG('home-return.user.js'))
  const found = await until(
    () => w.document.querySelector('a.post-title[href*="/topic/99002"]'),
    2000,
  )
  assert.equal(found, true, '应把第二页那条插进当前列表')
  await tick(40)
  assert.ok(
    calls.some((u) => /[?&]p=2(?:&|$)/.test(u)),
    '第一页没有目标帖时去拉 ?p=2',
  )
  assert.ok(
    scrolled.some((y) => y === 420),
    `找到后滚到 500-80=420，实际 ${JSON.stringify(scrolled)}`,
  )
})

test('首页回位：氢壳软跳清滚动后仍能回位', async () => {
  const { w, tick, until } = makeHome()
  const { id } = firstList(w)
  w.sessionStorage.setItem(KEY, JSON.stringify({ tid: id, offset: 90, ts: Date.now() }))
  stubRect(w, id, 400)
  const scrolled = captureScroll(w)
  const forumHtml = homeHtml
    .replace(/<ul class="post-list">[\s\S]*?<\/ul>/, '<ul class="post-list"></ul>')
    .replace('<title>', '<title>技术交流 - ')
  stubHtmlFetch(w, (url) => (/\/forum\/4/.test(String(url)) ? forumHtml : homeHtml))
  await loadBase(w, PLUG('home-return.user.js'), PLUG('skin.user.js'))
  await tick(50)
  scrolled.length = 0

  const forumLink = w.document.querySelector('a[href="/forum/4"]')
  assert.ok(forumLink, '夹具有技术交流入口')
  forumLink.click()
  await tick(80)
  const homeLink = w.document.querySelector('#lsb-shell-rail a[href="/"], a.lsb-shell-brand')
  assert.ok(homeLink, '左栏或站名可回首页')
  homeLink.click()
  const restored = await until(() => scrolled.some((y) => y === 310), 2000)
  assert.ok(scrolled.includes(0), '氢壳软跳会先 scrollTo(0,0)')
  assert.equal(restored, true, `清顶之后仍滚到 310，实际 ${JSON.stringify(scrolled)}`)
})

test('首页回位：用户页点帖不记首页位置', async () => {
  const { w } = makeDom(userHtml, 'https://linux.sb/user/1')
  await loadBase(w, PLUG('home-return.user.js'))
  const a = w.document.querySelector('a.post-title[href*="/topic/"]')
  if (a) a.click()
  assert.equal(w.sessionStorage.getItem(KEY), null, '非首页不写记录')
})
