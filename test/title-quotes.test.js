/** 称号行情：挂单高低价 / 中位锚点 / 面板与交易页图 */
import { test } from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { JSDOM } from 'jsdom'

const baseCode = readFileSync(new URL('../dist/linuxsb-base.user.js', import.meta.url), 'utf8')
const PLUG = (n) => readFileSync(new URL(`../plugins/${n}`, import.meta.url), 'utf8')
const homeHtml = readFileSync(new URL('./fixtures/home.html', import.meta.url), 'utf8')

function card(name, rarity, price, id, qty = 1) {
  return (
    `<article class="gacha-market-card"><div class="gacha-market-title">` +
    `<span class="gacha-title-badge"><span class="gacha-title-name">${name}</span>` +
    `<span class="gacha-title-rarity">${rarity}</span></span></div>` +
    `<div class="gacha-market-meta"><span>剩余 <strong>${qty}</strong> 个</span></div>` +
    `<form class="gacha-market-buy" data-gacha-market-title="${name}" data-gacha-market-price="${price}">` +
    `<input type="hidden" name="listing_id" value="${id}">` +
    `<input type="number" name="quantity" min="1" max="${qty}" value="1"></form></article>`
  )
}

function marketPage(cardsHtml, extra = '') {
  return (
    `<div class="gacha-center-page"><section class="gacha-market-section">` +
    `<div class="gacha-market-head"><h2>在售交易</h2></div>` +
    `<div class="gacha-market-grid">${cardsHtml}</div>${extra}</section></div>`
  )
}

function pager(max, query = '') {
  const q = query ? `${query}&` : ''
  const links = Array.from({ length: max }, (_, i) => {
    const p = i + 1
    return `<a href="/gacha_market?${q}p=${p}">${p}</a>`
  }).join('')
  return `<nav class="pagination">${links}</nav>`
}

function makeDom(html, url, preload = {}) {
  const dom = JSDOM ? new JSDOM(html, { url, runScripts: 'outside-only' }) : null
  const w = dom.window
  w.unsafeWindow = w
  w.requestAnimationFrame = (fn) => setTimeout(() => fn(Date.now()), 0)
  w.localStorage.setItem('lsb_base:__core:rate', JSON.stringify(10))
  w.localStorage.setItem('lsb_base:__core:urlPoll', JSON.stringify(0))
  for (const [k, v] of Object.entries(preload)) w.localStorage.setItem(k, JSON.stringify(v))
  const tick = (ms) => new Promise((r) => setTimeout(r, ms))
  return { w, tick }
}

function stubFetch(w, htmlFor = '') {
  const calls = []
  w.fetch = async (url, init = {}) => {
    const href = String(url)
    calls.push({ href, method: (init.method || 'GET').toUpperCase() })
    const html = typeof htmlFor === 'function' ? htmlFor(href) : htmlFor
    return { status: 200, ok: true, url: href, text: async () => html }
  }
  return calls
}

async function loadBase(w, ...plugins) {
  w.eval(baseCode)
  for (const code of plugins) w.eval(code)
  await new Promise((r) => setTimeout(r, 40))
}

async function boot(url = 'https://linux.sb/', preload = {}, htmlFor = '<html><body></body></html>') {
  const page = url.includes('gacha_market')
    ? homeHtml.replace('</body>', `${marketPage('')}</body>`)
    : homeHtml
  const { w, tick } = makeDom(page, url, preload)
  const calls = stubFetch(w, htmlFor)
  await loadBase(w, PLUG('title-quotes.user.js'))
  const dbg = await w.LSB.bus.request('title-quotes:debug')
  return { w, tick, calls, dbg }
}

test('称号行情：同称号多单价 → lo / hi / mid', async () => {
  const { dbg } = await boot()
  const html =
    card('全站偶像', 'SSR', 260, '1', 9) +
    card('全站偶像', 'SSR', 300, '2', 1) +
    card('全站偶像', 'SSR', 298, '3', 2)
  const listings = dbg.parseCards(html)
  const titles = dbg.foldTitles(listings)
  const t = titles['全站偶像@SSR']
  assert.equal(t.lo, 260)
  assert.equal(t.hi, 300)
  assert.equal(t.mid, 298)
  assert.equal(t.n, 12, '上架数是各挂单剩余数量之和')
  assert.equal(dbg.median([1, 2, 3, 4]), 3)
})

test('称号行情：asc+desc 合并、listing_id 去重', async () => {
  const { dbg } = await boot()
  const cheap =
    card('全站偶像', 'SSR', 260, '10') +
    card('氪金大佬', 'SSR', 233, '11')
  const dear =
    card('全站偶像', 'SSR', 500, '90') +
    card('氪金大佬', 'SSR', 588, '91') +
    card('全站偶像', 'SSR', 260, '10')
  const merged = dbg.mergeListings([dbg.parseCards(cheap), dbg.parseCards(dear)])
  assert.equal(merged.length, 4, '重复 listing_id 只留一条')
  const titles = dbg.foldTitles(merged)
  assert.equal(titles['全站偶像@SSR'].lo, 260)
  assert.equal(titles['全站偶像@SSR'].hi, 500)
  assert.equal(titles['氪金大佬@SSR'].lo, 233)
  assert.equal(titles['氪金大佬@SSR'].hi, 588)
})

test('称号行情：四锚点；不足 4 个不硬凑；最高最低不进中位', async () => {
  const { dbg } = await boot()
  const html =
    card('吃瓜群众', 'N', 20, 'a') +
    card('路人甲', 'N', 25, 'b') +
    card('万人迷', 'SR', 60, 'c') +
    card('全站偶像', 'SSR', 300, 'd') +
    card('隐藏大佬', 'SSR', 666, 'e')
  const listings = dbg.parseCards(html)
  const titles = dbg.foldTitles(listings)
  const anchors = dbg.pickAnchors(listings, titles)
  const by = Object.fromEntries(anchors.map((x) => [x.role, x]))
  assert.equal(by.hi.name, '隐藏大佬')
  assert.equal(by.hi.price, 666)
  assert.equal(by.lo.name, '吃瓜群众')
  assert.equal(by.lo.price, 20)
  assert.ok(by.midLo, '应有中位偏下')
  assert.ok(by.midHi, '应有中位偏上')
  assert.notEqual(by.midLo.name, '隐藏大佬')
  assert.notEqual(by.midHi.name, '隐藏大佬')
  assert.notEqual(by.midLo.name, '吃瓜群众')
  assert.notEqual(by.midHi.name, '吃瓜群众')

  const few = dbg.parseCards(card('萌新', 'N', 10, '1') + card('欧皇', 'SSR', 400, '2'))
  const fewA = dbg.pickAnchors(few, dbg.foldTitles(few))
  assert.equal(fewA.some((x) => x.role === 'midHi' || x.role === 'midLo'), false, '两个称号只有最高最低')
  assert.equal(fewA.length, 2)
})

test('称号行情：12 小时内同价只推进 t，隔 12 小时再写一条', async () => {
  const { dbg } = await boot()
  dbg.reset()
  const t0 = 1_700_000_000_000
  const listings = dbg.parseCards(card('萌新', 'N', 10, '1'))
  const titles = dbg.foldTitles(listings)
  const anchors = dbg.pickAnchors(listings, titles)
  assert.equal(dbg.pushSnap({ anchors, titles }, t0), true)
  assert.equal(dbg.pushSnap({ anchors, titles }, t0 + 3600e3), false)
  assert.equal(dbg.series().length, 1)
  assert.equal(dbg.series()[0].t, t0 + 3600e3)
  assert.equal(dbg.pushSnap({ anchors, titles }, t0 + 13 * 3600e3), true)
  assert.equal(dbg.series().length, 2)
})

test('称号行情：零快照空状态；一次有锚点无折线；两次出线', async () => {
  const { w, dbg } = await boot()
  dbg.reset()
  w.LSB.open('title-quotes')
  const empty = w.document.querySelector('.lsb-view')?.textContent || ''
  assert.match(empty, /打开交易页|巡检/)
  assert.equal(w.document.querySelector('.lsb-svg'), null)

  const t0 = Date.now() - 864e5
  const listings = dbg.parseCards(
    card('吃瓜群众', 'N', 20, 'a') + card('隐藏大佬', 'SSR', 666, 'e'),
  )
  const titles = dbg.foldTitles(listings)
  const anchors = dbg.pickAnchors(listings, titles)
  dbg.pushSnap({ anchors, titles }, t0)
  w.LSB.open('title-quotes')
  const once = w.document.querySelector('.lsb-view')?.textContent || ''
  assert.match(once, /隐藏大佬/)
  assert.match(once, /吃瓜群众/)
  assert.equal(w.document.querySelector('.lsb-svg'), null)
  assert.match(once, /再等/)
  assert.match(once, /上架 1 个/)

  dbg.pushSnap({ anchors, titles }, t0 + 13 * 3600e3)
  w.LSB.open('title-quotes')
  assert.ok(w.document.querySelector('.lsb-svg'), '两次快照应出折线')
})

test('称号行情：交易页插入节且不请求购买', async () => {
  const { w, calls } = await boot('https://linux.sb/gacha_market')
  const embed = w.document.querySelector('.lsb-title-quotes-embed')
  assert.ok(embed, '交易页应插入称号行情')
  const sold = [...w.document.querySelectorAll('.gacha-market-section')].find((s) =>
    /在售交易/.test(s.textContent),
  )
  assert.ok(sold, '应有在售交易节')
  assert.equal(embed.nextElementSibling, sold, '插在在售交易前面')
  const fold = embed.querySelector('details.lsb-title-quotes-fold')
  assert.ok(fold, '交易页行情应包在折叠里')
  assert.equal(fold.open, false, '交易页默认折起')
  assert.match(fold.querySelector('summary')?.textContent || '', /称号行情/)
  fold.open = true
  const range = fold.querySelector('[data-range="30"]')
  if (range) range.click()
  assert.equal(embed.querySelector('details.lsb-title-quotes-fold')?.open, true, '点开后刷新仍保持展开')
  assert.equal(
    calls.some((c) => /gacha_market_buy/i.test(c.href) || c.method === 'POST'),
    false,
    '不得请求购买',
  )
})

test('称号行情：氧面板不折叠', async () => {
  const { w, dbg } = await boot()
  dbg.reset()
  w.LSB.open('title-quotes')
  assert.equal(w.document.querySelector('.lsb-view details.lsb-title-quotes-fold'), null)
})

test('称号行情：默认巡检 1 分钟', async () => {
  const { dbg } = await boot()
  assert.equal(dbg.intervalMin(), 1)
})

test('称号行情：分页第二页的挂单也要记进高低价，不能只采每筛选项的第一页', async () => {
  const page1 = marketPage(card('打酱油的', 'N', 6, '1'), pager(2))
  const page2 = marketPage(card('全站偶像', 'SSR', 260, '99') + card('隐藏大佬', 'SSR', 888, '100'), pager(2))
  const htmlFor = (href) => {
    const u = new URL(String(href), 'https://linux.sb')
    const p = Number(u.searchParams.get('p') || '1')
    return `<html><body>${p >= 2 ? page2 : page1}</body></html>`
  }
  const { dbg, tick, calls } = await boot('https://linux.sb/', {}, htmlFor)
  dbg.reset()
  await dbg.snap()
  await tick(40)
  const titles = dbg.series()[0]?.titles || {}
  assert.equal(titles['打酱油的@N']?.lo, 6, '第一页地板价')
  assert.equal(titles['全站偶像@SSR']?.lo, 260, '第二页的称号不能丢')
  assert.equal(titles['隐藏大佬@SSR']?.hi, 888, '第二页的最高价才是全场真高')
  assert.ok(
    calls.some((c) => /[?&]p=2\b/.test(c.href)),
    '必须翻到分页第 2 页',
  )
  assert.equal(
    calls.filter((c) => /gacha_market/.test(c.href) && c.method === 'GET').length >= 2,
    true,
    '至少拉两页',
  )
})

test('称号行情：交易页「在售列表」也能插入（站点现用文案）', async () => {
  const page = homeHtml.replace(
    '</body>',
    `<section class="gacha-market-section"><h2>在售列表</h2></section></body>`,
  )
  const { w } = makeDom(page, 'https://linux.sb/gacha_market')
  stubFetch(w, '<html><body></body></html>')
  await loadBase(w, PLUG('title-quotes.user.js'))
  const embed = w.document.querySelector('.lsb-title-quotes-embed')
  const sold = [...w.document.querySelectorAll('.gacha-market-section')].find((s) =>
    /在售列表/.test(s.querySelector('h2')?.textContent || ''),
  )
  assert.ok(embed, '现用「在售列表」标题也要插入')
  assert.equal(embed.nextElementSibling, sold)
})
