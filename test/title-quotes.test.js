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
  Object.defineProperty(w.document, 'hidden', {
    configurable: true,
    get: () => w._lsbHidden === true,
  })
  Object.defineProperty(w.document, 'visibilityState', {
    configurable: true,
    get: () => (w._lsbHidden === true ? 'hidden' : 'visible'),
  })
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

async function quotesView(w, dbg) {
  await dbg.openFloat()
  return w.document.querySelector('.lsb-title-quotes-float-body')
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
  const emptyView = await quotesView(w, dbg)
  const empty = emptyView?.textContent || ''
  assert.match(empty, /打开交易页|巡检/)
  assert.equal(emptyView.querySelector('.lsb-svg'), null)

  const t0 = Date.now() - 864e5
  const listings = dbg.parseCards(
    card('吃瓜群众', 'N', 20, 'a') + card('隐藏大佬', 'SSR', 666, 'e'),
  )
  const titles = dbg.foldTitles(listings)
  const anchors = dbg.pickAnchors(listings, titles)
  dbg.pushSnap({ anchors, titles }, t0)
  const onceView = await quotesView(w, dbg)
  const once = onceView?.textContent || ''
  assert.match(once, /隐藏大佬/)
  assert.match(once, /吃瓜群众/)
  const onceMarket = onceView.querySelector('.lsb-title-quotes-anchors')?.nextElementSibling
  assert.equal(onceMarket?.querySelector('polyline, .lsb-title-quotes-k'), null, '总览一笔仍不出图')
  assert.match(once, /再等/)
  assert.match(once, /上架 1 个/)

  dbg.pushSnap({ anchors, titles }, t0 + 13 * 3600e3)
  const twice = await quotesView(w, dbg)
  assert.ok(twice.querySelector('.lsb-svg'), '两次快照应出折线')
  assert.ok(twice.querySelector('.lsb-title-quotes-anchors')?.nextElementSibling?.querySelector('polyline'))
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

test('称号行情：氧面板是设置加打开浮层，不画行情图', async () => {
  const { w } = await boot()
  w.LSB.open('title-quotes')
  const view = w.document.querySelector('.lsb-view')
  assert.match(view.textContent, /巡检间隔/)
  assert.match(view.textContent, /打开浮层/)
  assert.equal(view.querySelector('.lsb-title-quotes-anchors'), null)
  assert.equal(view.querySelector('[data-board-view]'), null)
  const btn = [...view.querySelectorAll('button')].find((b) => b.textContent.trim() === '打开浮层')
  assert.ok(btn)
  btn.click()
  assert.ok(w.document.querySelector('.lsb-title-quotes-float'))
})

test('称号行情：默认巡检 30 秒', async () => {
  const { dbg } = await boot()
  assert.equal(dbg.intervalMs(), 30000)
})

test('称号行情：新鲜在看心跳时 pollMs 为 min(10秒, 配置)', async () => {
  const { dbg } = await boot()
  assert.equal(dbg.intervalMs(), 30000)
  assert.equal(dbg.watching(), false)
  dbg.setWatchBeat({ t: Date.now(), id: 'a' })
  assert.equal(dbg.watching(), true)
  assert.equal(dbg.intervalMs(), 10000)
  dbg.setWatchBeat({ t: 0, id: 'a' })
  assert.equal(dbg.watching(), false)
  assert.equal(dbg.intervalMs(), 30000)
  dbg.setWatchBeat({ t: Date.now() - 20000, id: 'a' })
  assert.equal(dbg.watching(), false)
  assert.equal(dbg.intervalMs(), 30000)
})

test('称号行情：配置已是 5 秒时心跳不把间隔拉到 10 秒', async () => {
  const { dbg } = await boot('https://linux.sb/', {
    'lsb_base:title-quotes:__config': { intervalSec: 5 },
  })
  assert.equal(dbg.intervalMs(), 5000)
  dbg.setWatchBeat({ t: Date.now(), id: 'a' })
  assert.equal(dbg.intervalMs(), 5000)
})

test('称号行情：旧的分钟默认改成 30 秒；自己改过的分钟间隔仍换算保留', async () => {
  const { dbg: oldDefault } = await boot('https://linux.sb/', {
    'lsb_base:title-quotes:__config': { intervalMin: 1 },
  })
  assert.equal(oldDefault.intervalMs(), 30000, '上一版默认 1 分钟视为未定制，改成 30 秒')

  const { dbg: custom } = await boot('https://linux.sb/', {
    'lsb_base:title-quotes:__config': { intervalMin: 10 },
  })
  assert.equal(custom.intervalMs(), 600000, '自己设过 10 分钟应换成 600 秒，不能被新默认盖掉')

  const { dbg: sec } = await boot('https://linux.sb/', {
    'lsb_base:title-quotes:__config': { intervalSec: 45 },
  })
  assert.equal(sec.intervalMs(), 45000)
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

test('称号行情：periodMs 随 7/30/90 天切换', async () => {
  const { dbg } = await boot()
  assert.equal(dbg.periodMs(0), 30 * 60e3, '本日用 30 分钟一根')
  assert.equal(dbg.periodMs(7), 4 * 3600e3)
  assert.equal(dbg.periodMs(30), 864e5)
  assert.equal(dbg.periodMs(90), 3 * 864e5)
})

test('称号行情：同一小时三笔收成一根挂单 K', async () => {
  const { dbg } = await boot()
  const t0 = 20 * 3600e3
  const key = '全站偶像@SSR'
  const q = (lo, hi, mid) => ({ [key]: { rarity: 'SSR', lo, hi, mid } })
  const series = [
    { t: t0 + 100, titles: q(10, 30, 20) },
    { t: t0 + 1000, titles: q(8, 40, 25) },
    { t: t0 + 2000, titles: q(12, 28, 18) },
  ]
  const bars = dbg.foldCandles(series, key, { rangeDays: 7, now: t0 + 3600e3 - 1 })
  assert.equal(bars.length, 1)
  assert.equal(bars[0].t, t0)
  assert.equal(bars[0].o, 20)
  assert.equal(bars[0].h, 25)
  assert.equal(bars[0].l, 18)
  assert.equal(bars[0].c, 18)
})

test('称号行情：下一根开接上一根收', async () => {
  const { dbg } = await boot()
  const t0 = 12 * 3600e3
  const key = 'A@N'
  const q = (mid) => ({ [key]: { lo: mid - 1, hi: mid + 1, mid } })
  const p = dbg.periodMs(7)
  const series = [
    { t: t0 + 1, titles: q(10) },
    { t: t0 + p + 1, titles: q(20) },
  ]
  const bars = dbg.foldCandles(series, key, { rangeDays: 7, now: t0 + p + 10 })
  assert.equal(bars.length, 2)
  assert.equal(bars[0].o, 10)
  assert.equal(bars[0].c, 10)
  assert.equal(bars[1].o, 10)
  assert.equal(bars[1].c, 20)
  assert.equal(bars[1].h, 20)
  assert.equal(bars[1].l, 10)
})

test('称号行情：收大于开为涨', async () => {
  const { dbg } = await boot()
  const t0 = 8 * 3600e3
  const key = 'A@N'
  const series = [
    { t: t0 + 1, titles: { [key]: { lo: 1, hi: 3, mid: 2 } } },
    { t: t0 + 2, titles: { [key]: { lo: 1, hi: 9, mid: 8 } } },
  ]
  const [bar] = dbg.foldCandles(series, key, { rangeDays: 7, now: t0 + 10 })
  assert.ok(bar.c >= bar.o)
})

test('称号行情：两笔相隔 3 小时仍在售则空档不补柱', async () => {
  const { dbg } = await boot()
  const t0 = 30 * 3600e3
  const key = 'A@N'
  const rec = { [key]: { lo: 10, hi: 20, mid: 15 } }
  const series = [
    { t: t0, titles: rec },
    { t: t0 + 3 * 3600e3, titles: rec },
  ]
  const bars = dbg.foldCandles(series, key, { rangeDays: 7, now: t0 + 3 * 3600e3 + 10 })
  assert.equal(bars.length, 2)
  assert.equal(bars[0].t, Math.floor(t0 / dbg.periodMs(7)) * dbg.periodMs(7))
  assert.equal(bars[1].o, 15)
  assert.equal(bars[1].c, 15)
})

test('称号行情：全场快照里没有该称号则停止补 K', async () => {
  const { dbg } = await boot()
  const t0 = 40 * 3600e3
  const key = 'A@N'
  const series = [
    { t: t0, titles: { [key]: { lo: 10, hi: 20, mid: 15 } } },
    { t: t0 + 2 * 3600e3, titles: { 'B@N': { lo: 1, hi: 2, mid: 1 } } },
  ]
  const bars = dbg.foldCandles(series, key, { rangeDays: 7, now: t0 + 4 * 3600e3 })
  assert.equal(
    bars.some((b) => b.t >= t0 + 2 * 3600e3),
    false,
    '下架之后不再补',
  )
  assert.ok(bars.some((b) => b.t === t0))
})

test('称号行情：各称号展开为挂单 K，总览仍折线', async () => {
  const { w, dbg } = await boot()
  dbg.reset()
  const t0 = Date.now() - 864e5
  const listings = dbg.parseCards(
    card('吃瓜群众', 'N', 20, 'a') + card('隐藏大佬', 'SSR', 666, 'e'),
  )
  const titles = dbg.foldTitles(listings)
  const anchors = dbg.pickAnchors(listings, titles)
  dbg.pushSnap({ anchors, titles }, t0)
  dbg.pushSnap({ anchors, titles }, t0 + 13 * 3600e3)
  const view = await quotesView(w, dbg)
  const marketHost = view.querySelector('.lsb-title-quotes-anchors')?.nextElementSibling
  assert.ok(marketHost?.querySelector('polyline'), '总览仍是折线')
  const row = [...view.querySelectorAll('.lsb-title-quotes-row')].find((el) =>
    /隐藏大佬/.test(el.textContent),
  )
  assert.ok(row)
  row.open = true
  assert.ok(row.querySelector('svg.lsb-title-quotes-k'))
  assert.match(row.querySelector('svg')?.getAttribute('font-family') || '', /system-ui/)
  assert.ok(view.querySelector('.lsb-title-quotes-pip'), '总览锚点带折线色点')
  assert.ok(row.querySelector('.lsb-title-quotes-grid'))
  assert.ok(row.querySelector('.lsb-title-quotes-wick, .lsb-title-quotes-body'))
  assert.match(row.textContent, /挂单合成 · 非成交/)
  assert.equal(row.querySelectorAll('polyline').length, 0, '称号行默认不用双折线')
})

test('称号行情：可切到最低最高折线并记住', async () => {
  const { w, dbg } = await boot()
  dbg.reset()
  const t0 = Date.now() - 864e5
  const listings = dbg.parseCards(
    card('吃瓜群众', 'N', 20, 'a') + card('隐藏大佬', 'SSR', 666, 'e'),
  )
  const titles = dbg.foldTitles(listings)
  const anchors = dbg.pickAnchors(listings, titles)
  dbg.pushSnap({ anchors, titles }, t0)
  dbg.pushSnap({ anchors, titles }, t0 + 13 * 3600e3)
  const view = await quotesView(w, dbg)
  const lineBtn = [...view.querySelectorAll('[data-chart]')].find((b) => b.dataset.chart === 'line')
  assert.ok(lineBtn, '应有折线按钮')
  lineBtn.click()
  const marketHost = view.querySelector('.lsb-title-quotes-anchors')?.nextElementSibling
  assert.ok(marketHost?.querySelector('polyline'), '总览仍是折线')
  const row = [...view.querySelectorAll('.lsb-title-quotes-row')].find((el) =>
    /隐藏大佬/.test(el.textContent),
  )
  assert.ok(row)
  row.open = true
  assert.equal(row.querySelector('svg.lsb-title-quotes-k'), null, '折线模式无 K')
  assert.equal(row.querySelectorAll('polyline').length, 2, '最低 + 最高两条')
  assert.match(row.textContent, /挂单高低 · 非成交/)
  assert.equal(row.querySelector('.lsb-title-quotes-wick, .lsb-title-quotes-body'), null)

  const kBtn = [...view.querySelectorAll('[data-chart]')].find((b) => b.dataset.chart === 'candle')
  kBtn.click()
  const rowK = [...view.querySelectorAll('.lsb-title-quotes-row')].find((el) =>
    /隐藏大佬/.test(el.textContent),
  )
  rowK.open = true
  assert.ok(rowK.querySelector('svg.lsb-title-quotes-k'))
  assert.match(rowK.textContent, /挂单合成 · 非成交/)

  const lineAgain = [...view.querySelectorAll('[data-chart]')].find((b) => b.dataset.chart === 'line')
  lineAgain.click()
  await dbg.openFloat()
  const again = [...w.document.querySelectorAll('.lsb-title-quotes-float-body .lsb-title-quotes-row')].find((el) =>
    /隐藏大佬/.test(el.textContent),
  )
  again.open = true
  assert.equal(again.querySelectorAll('polyline').length, 2, '关掉再打开仍是折线')
})

test('称号行情：本日只收当天快照，昨天的不进窗口', async () => {
  const { dbg } = await boot()
  const now = new Date()
  now.setHours(15, 0, 0, 0)
  const start = new Date(now)
  start.setHours(0, 0, 0, 0)
  const key = 'A@N'
  const q = (mid) => ({ [key]: { lo: mid - 1, hi: mid + 1, mid } })
  const series = [
    { t: start.getTime() - 3600e3, titles: q(9) },
    { t: start.getTime() + 2 * 3600e3, titles: q(20) },
  ]
  const bars = dbg.foldCandles(series, key, { rangeDays: 0, now: now.getTime() })
  assert.ok(bars.length >= 1)
  assert.ok(
    bars.every((b) => b.t >= start.getTime()),
    '本日 K 不得把昨天的桶画进来',
  )
  assert.equal(dbg.rangeCutoff(0, now.getTime()), start.getTime())
})

test('称号行情：可选本日；K 线悬停给出开高低收', async () => {
  const { w, dbg } = await boot()
  dbg.reset()
  const now = Date.now()
  const listings = dbg.parseCards(
    card('吃瓜群众', 'N', 20, 'a') + card('隐藏大佬', 'SSR', 666, 'e'),
  )
  const titles = dbg.foldTitles(listings)
  const anchors = dbg.pickAnchors(listings, titles)
  dbg.pushSnap({ anchors, titles }, now - 2 * 3600e3)
  dbg.pushSnap({ anchors, titles: { ...titles, '隐藏大佬@SSR': { ...titles['隐藏大佬@SSR'], mid: 680 } } }, now - 1800e3)
  const view = await quotesView(w, dbg)
  const todayBtn = [...view.querySelectorAll('[data-range]')].find((b) => b.dataset.range === '0')
  assert.ok(todayBtn, '应有本日按钮')
  assert.equal(todayBtn.textContent.trim(), '本日')
  todayBtn.click()
  assert.ok(todayBtn.classList.contains('is-primary') || view.querySelector('[data-range="0"].is-primary'))
  const row = [...view.querySelectorAll('.lsb-title-quotes-row')].find((el) => /隐藏大佬/.test(el.textContent))
  assert.ok(row)
  row.open = true
  const bar = row.querySelector('.lsb-title-quotes-bar')
  assert.ok(bar, 'K 柱要可指向')
  bar.dispatchEvent(new w.MouseEvent('mousemove', { bubbles: true, clientX: 48, clientY: 40 }))
  const tip = row.querySelector('.lsb-title-quotes-tip')
  assert.ok(tip?.classList.contains('is-on'), '悬停要出浮层')
  assert.match(tip.textContent, /开/)
  assert.match(tip.textContent, /高/)
  assert.match(tip.textContent, /低/)
  assert.match(tip.textContent, /收/)
})

test('称号行情：档指数平均、总指数等于全场等权', async () => {
  const { dbg } = await boot()
  const titles = {
    'a@R': { rarity: 'R', mid: 10, lo: 10, hi: 10 },
    'b@R': { rarity: 'R', mid: 10, lo: 10, hi: 10 },
    'c@SSR': { rarity: 'SSR', mid: 100, lo: 100, hi: 100 },
  }
  const idx = dbg.snapshotIndex(titles)
  assert.equal(idx.byRarity.R.mean, 10)
  assert.equal(idx.byRarity.R.n, 2)
  assert.equal(idx.byRarity.SSR.mean, 100)
  assert.equal(idx.overall, 40)
  assert.equal(dbg.mean([]), null)
  assert.equal(dbg.snapshotIndex({}).overall, null)
})

test('称号行情：空档该时点无指数点；空稀有度是未知档不是总指数', async () => {
  const { dbg } = await boot()
  const series = [
    { t: 1, titles: { 'a@R': { rarity: 'R', mid: 10 } } },
    { t: 2, titles: { 'u@': { rarity: '', mid: 5 } } },
  ]
  assert.deepEqual(
    [...dbg.indexPoints(series, 'SSR')],
    [],
    '从未出现的档没有点',
  )
  assert.equal(dbg.indexPoints(series, 'R').length, 1)
  assert.equal(dbg.indexPoints(series, 'R')[0].mid, 10)
  assert.equal(dbg.indexPoints(series, null).length, 2)
  assert.equal(dbg.indexPoints(series, '').length, 1)
  assert.equal(dbg.indexPoints(series, '')[0].mid, 5)
})

test('称号行情：本日空窗指数 K 不回退到昨天', async () => {
  const { dbg } = await boot()
  const now = new Date()
  now.setHours(15, 0, 0, 0)
  const start = new Date(now)
  start.setHours(0, 0, 0, 0)
  const points = [
    { t: start.getTime() - 3600e3, mid: 9 },
    { t: start.getTime() + 2 * 3600e3, mid: 20 },
  ]
  const bars = dbg.foldIndexCandles(points, { rangeDays: 0, now: now.getTime() })
  assert.ok(bars.length >= 1)
  assert.ok(bars.every((b) => b.t >= start.getTime()))
  const yesterdayOnly = dbg.foldIndexCandles([{ t: start.getTime() - 3600e3, mid: 9 }], {
    rangeDays: 0,
    now: now.getTime(),
  })
  assert.equal(yesterdayOnly.length, 0)
})

test('称号行情：SMA 与布林根数不足不出力；总体标准差', async () => {
  const { dbg } = await boot()
  const closes = [10, 12, 11, 13, 14]
  const s5 = dbg.sma(closes, 5)
  assert.equal(s5[3], null)
  assert.equal(s5[4], dbg.mean(closes))
  assert.equal(dbg.stdevPop([10, 10, 10, 10]), 0)
  assert.equal(dbg.stdevPop([]), null)
  const bbShort = dbg.bollinger(closes, 20, 2)
  assert.equal(bbShort.mid[4], null)
  const twenty = Array.from({ length: 20 }, () => 10)
  twenty[19] = 10
  const bb = dbg.bollinger(twenty, 20, 2)
  assert.equal(bb.mid[19], 10)
  assert.equal(bb.upper[19], 10)
  assert.equal(bb.lower[19], 10)
  const bars = closes.map((c, i) => ({ t: i, o: c, h: c, l: c, c }))
  const ov = dbg.overlays(bars)
  assert.equal(ov[3].sma5, undefined)
  assert.equal(ov[4].sma5, dbg.mean(closes))
  assert.equal(ov[4].sma20, undefined)
})

test('称号行情：有叠加字段时悬停追加均线布林；没有则不变', async () => {
  const { dbg } = await boot()
  const bar = { t: 0, o: 10, h: 12, l: 9, c: 11 }
  const plain = dbg.fmtBarTip(bar, 7)
  assert.match(plain, /开/)
  assert.doesNotMatch(plain, /均5/)
  const withOv = dbg.fmtBarTip({ ...bar, sma5: 10.5, sma20: 10, bbUpper: 12, bbLower: 8 }, 7)
  assert.match(withOv, /均5/)
  assert.match(withOv, /均20/)
  assert.match(withOv, /上轨/)
  assert.match(withOv, /下轨/)
  assert.ok(withOv.startsWith(plain) || withOv.includes('开'))
})

test('称号行情：movers 新上不下涨跌榜；下架只在摘要；基 0 剔除；Top 10', async () => {
  const { dbg } = await boot()
  const base = {
    '旧@R': { rarity: 'R', mid: 10 },
    '跌@R': { rarity: 'R', mid: 20 },
    '零@R': { rarity: 'R', mid: 0 },
    '平@R': { rarity: 'R', mid: 5 },
  }
  const latest = {
    '旧@R': { rarity: 'R', mid: 12 },
    '跌@R': { rarity: 'R', mid: 10 },
    '零@R': { rarity: 'R', mid: 8 },
    '平@R': { rarity: 'R', mid: 5 },
    '新@SSR': { rarity: 'SSR', mid: 3 },
  }
  const m = dbg.movers(latest, base)
  assert.equal(m.listed.length, 1)
  assert.equal(m.listed[0].key, '新@SSR')
  assert.equal(m.delisted.length, 0)
  assert.equal(m.up.some((x) => x.key === '新@SSR'), false)
  assert.equal(m.up[0].key, '旧@R')
  assert.equal(m.up[0].delta, 2)
  assert.ok(Math.abs(m.up[0].pct - 0.2) < 1e-9)
  assert.equal(m.down[0].key, '跌@R')
  assert.equal(m.up.some((x) => x.key === '平@R'), false)
  assert.equal(m.down.some((x) => x.key === '平@R'), false)
  assert.equal(m.up.some((x) => x.key === '零@R'), false)
  assert.equal(dbg.fmtPct(0.082), '+8.2%')

  const gone = dbg.movers({ '留@R': { rarity: 'R', mid: 1 } }, { '走@R': { rarity: 'R', mid: 2 }, '留@R': { rarity: 'R', mid: 1 } })
  assert.equal(gone.delisted[0].key, '走@R')
  assert.equal(gone.delisted[0].mid, undefined)

  const many = {}
  const nowT = {}
  for (let i = 0; i < 12; i++) {
    const k = `涨${String.fromCharCode(97 + i)}@R`
    many[k] = { rarity: 'R', mid: 10 }
    nowT[k] = { rarity: 'R', mid: 10 + i + 1 }
  }
  assert.equal(dbg.movers(nowT, many).up.length, 10)
})

test('称号行情：boardPair 短线用上一份；区间用窗起点；本日空窗 emptyWindow', async () => {
  const { dbg } = await boot()
  const now = new Date()
  now.setHours(15, 0, 0, 0)
  const start = new Date(now)
  start.setHours(0, 0, 0, 0)
  const series = [
    { t: start.getTime() - 3600e3, titles: { '昨@R': { rarity: 'R', mid: 1 } } },
    { t: start.getTime() + 3600e3, titles: { '今@R': { rarity: 'R', mid: 2 } } },
  ]
  const sh = dbg.boardPair(series, { rangeDays: 0, now: now.getTime(), mode: 'short' })
  assert.equal(Object.keys(sh.latest.titles)[0], '今@R')
  assert.equal(Object.keys(sh.base.titles)[0], '昨@R')
  assert.equal(sh.emptyWindow, false)
  const rg = dbg.boardPair(series, { rangeDays: 0, now: now.getTime(), mode: 'range' })
  assert.equal(Object.keys(rg.base.titles)[0], '今@R')
  assert.equal(rg.emptyWindow, false)
  const empty = dbg.boardPair(
    [{ t: start.getTime() - 3600e3, titles: { '昨@R': { rarity: 'R', mid: 1 } } }],
    { rangeDays: 0, now: now.getTime(), mode: 'range' },
  )
  assert.equal(empty.emptyWindow, true)
  assert.equal(empty.latest, null)
  const one = dbg.boardPair(
    [{ t: 1, titles: { 'a@R': { rarity: 'R', mid: 1 } } }],
    { rangeDays: 7, now: 10, mode: 'short' },
  )
  assert.equal(one.base, null)
})

test('称号行情：大盘视图无四锚点与称号行；指数 K 可悬停均线', async () => {
  const { w, dbg } = await boot()
  dbg.reset()
  const now = Date.now()
  const mk = (midR, midS) => ({
    '吃瓜群众@N': { rarity: 'N', lo: midR, hi: midR, mid: midR, n: 1 },
    '隐藏大佬@SSR': { rarity: 'SSR', lo: midS, hi: midS, mid: midS, n: 1 },
  })
  const listings = dbg.parseCards(card('吃瓜群众', 'N', 20, 'a') + card('隐藏大佬', 'SSR', 666, 'e'))
  const anchors = dbg.pickAnchors(listings, dbg.foldTitles(listings))
  for (let i = 0; i < 6; i++) {
    dbg.pushSnap({ anchors, titles: mk(20 + i, 666 + i * 2) }, now - (6 - i) * 5 * 3600e3)
  }
  const view = await quotesView(w, dbg)
  const quotesBtn = [...view.querySelectorAll('[data-board-view]')].find((b) => b.dataset.boardView === 'quotes')
  const boardBtn = [...view.querySelectorAll('[data-board-view]')].find((b) => b.dataset.boardView === 'board')
  assert.ok(quotesBtn && boardBtn)
  assert.equal(quotesBtn.textContent.trim(), '行情')
  assert.equal(boardBtn.textContent.trim(), '大盘')
  assert.ok(view.querySelector('.lsb-title-quotes-anchors'))
  assert.ok(view.querySelector('.lsb-title-quotes-row'))
  assert.ok(view.querySelector('[data-chart]'))
  boardBtn.click()
  assert.equal(view.querySelector('.lsb-title-quotes-anchors'), null)
  assert.equal(view.querySelector('.lsb-title-quotes-row'), null)
  assert.equal(view.querySelector('[data-chart]'), null)
  assert.ok(view.querySelector('[data-range]'))
  assert.match(view.textContent, /总指数/)
  assert.match(view.textContent, /挂单中位 · 非成交/)
  assert.ok(view.querySelector('svg.lsb-title-quotes-k'))
  const ovPaths = [...view.querySelectorAll('svg.lsb-title-quotes-k path')].filter(
    (p) => !p.closest('.lsb-title-quotes-bar'),
  )
  assert.ok(ovPaths.length > 0, '应有均线/布林 overlay path')
  for (const p of ovPaths) {
    assert.equal(p.getAttribute('pointer-events'), 'none')
  }
  const kBars = view.querySelectorAll('.lsb-title-quotes-bar')
  assert.ok(kBars.length >= 5, '要有足够 K 才画得出均5')
  const bar = kBars[kBars.length - 1]
  bar.dispatchEvent(new w.MouseEvent('mousemove', { bubbles: true, clientX: 48, clientY: 40 }))
  const tip = view.querySelector('.lsb-title-quotes-tip')
  assert.ok(tip?.classList.contains('is-on'))
  assert.match(tip.textContent, /开/)
  assert.match(tip.textContent, /均5/)
  quotesBtn.click()
  assert.ok(view.querySelector('.lsb-title-quotes-anchors'))
  assert.ok(view.querySelector('[data-chart]'))
})

test('称号行情：大盘无系列时用行情空态文案', async () => {
  const { w, dbg } = await boot()
  dbg.reset()
  const view = await quotesView(w, dbg)
  view.querySelector('[data-board-view="board"]').click()
  assert.match(view.textContent, /还没采到行情。打开交易页或等下一轮巡检。/)
  assert.doesNotMatch(view.textContent, /这个时间窗还不够画指数/)
})

test('称号行情：冷热榜短线有涨跌；点名称回到行情并展开', async () => {
  const { w, dbg } = await boot()
  dbg.reset()
  const now = Date.now()
  const listings = dbg.parseCards(card('吃瓜群众', 'N', 20, 'a') + card('隐藏大佬', 'SSR', 666, 'e'))
  const titles = dbg.foldTitles(listings)
  const anchors = dbg.pickAnchors(listings, titles)
  dbg.pushSnap({ anchors, titles }, now - 3600e3)
  dbg.pushSnap(
    {
      anchors,
      titles: { ...titles, '隐藏大佬@SSR': { ...titles['隐藏大佬@SSR'], mid: 800, lo: 800, hi: 800 } },
    },
    now,
  )
  const view = await quotesView(w, dbg)
  view.querySelector('[data-board-view="board"]').click()
  assert.match(view.textContent, /涨幅 Top 10/)
  assert.match(view.textContent, /跌幅 Top 10/)
  assert.match(view.textContent, /短线/)
  assert.match(view.textContent, /区间/)
  const hit = [...view.querySelectorAll('[data-board-key]')].find((el) => el.getAttribute('data-board-key') === '隐藏大佬@SSR')
  assert.ok(hit)
  hit.click()
  assert.ok(view.querySelector('.lsb-title-quotes-anchors'), '应回到行情')
  const row = view.querySelector('.lsb-title-quotes-row[data-key="隐藏大佬@SSR"]')
  assert.ok(row)
  assert.equal(row.open, true)
})

test('称号行情：区间空窗榜文案；短线仅一份则全是新上', async () => {
  const { w, dbg } = await boot()
  dbg.reset()
  const now = new Date()
  now.setHours(15, 0, 0, 0)
  const start = new Date(now)
  start.setHours(0, 0, 0, 0)
  const listings = dbg.parseCards(card('吃瓜群众', 'N', 20, 'a'))
  const titles = dbg.foldTitles(listings)
  const anchors = dbg.pickAnchors(listings, titles)
  dbg.pushSnap({ anchors, titles }, start.getTime() - 3600e3)
  const view = await quotesView(w, dbg)
  view.querySelector('[data-board-view="board"]').click()
  view.querySelector('[data-range="0"]').click()
  view.querySelector('[data-board-move="range"]').click()
  assert.match(view.textContent, /没有可比的涨跌/)
  view.querySelector('[data-board-move="short"]').click()
  assert.match(view.textContent, /新上/)
  assert.match(view.textContent, /吃瓜群众/)
})

test('称号行情：默认有行情钮；RPC 打开浮层且含行情大盘', async () => {
  const { w, dbg } = await boot()
  const fab = w.document.querySelector('.lsb-title-quotes-fab')
  assert.ok(fab)
  assert.equal(fab.textContent.trim(), '行情')
  assert.equal(fab.getAttribute('aria-label'), '称号行情')
  assert.equal(w.document.querySelector('.lsb-title-quotes-float'), null)
  await w.LSB.bus.request('title-quotes:open')
  const floatEl = w.document.querySelector('.lsb-title-quotes-float')
  assert.ok(floatEl)
  const body = floatEl.querySelector('.lsb-title-quotes-float-body')
  assert.ok(body)
  assert.ok(body.querySelector('[data-board-view="quotes"]'))
  assert.ok(body.querySelector('[data-board-view="board"]'))
  assert.match(floatEl.querySelector('.lsb-title-quotes-float-head')?.textContent || '', /称号行情/)
  assert.equal(dbg.watching(), true)
  assert.equal(dbg.intervalMs(), 10000)
  assert.equal(JSON.parse(w.localStorage.getItem('lsb_base:title-quotes:floatOpen')), true)
})

test('称号行情：关闭浮层后间隔回到配置；收起仍算在看', async () => {
  const { w, dbg } = await boot()
  await dbg.openFloat()
  w.document.querySelector('[data-float-collapse]').click()
  assert.ok(w.document.querySelector('.lsb-title-quotes-float')?.classList.contains('is-collapsed'))
  assert.equal(dbg.watching(), true)
  w.document.querySelector('[data-float-close]').click()
  assert.equal(w.document.querySelector('.lsb-title-quotes-float'), null)
  assert.ok(w.document.querySelector('.lsb-title-quotes-fab'))
  assert.equal(JSON.parse(w.localStorage.getItem('lsb_base:title-quotes:floatOpen')), false)
  assert.equal(dbg.watching(), false)
  assert.equal(dbg.intervalMs(), 30000)
})

test('称号行情：floatOpen 预载则启动即打开', async () => {
  const { w } = await boot('https://linux.sb/', {
    'lsb_base:title-quotes:floatOpen': true,
  })
  assert.ok(w.document.querySelector('.lsb-title-quotes-float'))
})

test('称号行情：氢面板存在时 Esc 不关浮层', async () => {
  const { w, dbg } = await boot()
  await dbg.openFloat()
  const panel = w.document.createElement('div')
  panel.className = 'lsb-panel'
  w.document.body.append(panel)
  w.document.dispatchEvent(new w.KeyboardEvent('keydown', { key: 'Escape', bubbles: true }))
  assert.ok(w.document.querySelector('.lsb-title-quotes-float'))
  panel.remove()
  w.document.dispatchEvent(new w.KeyboardEvent('keydown', { key: 'Escape', bubbles: true }))
  assert.equal(w.document.querySelector('.lsb-title-quotes-float'), null)
})

function setPageHidden(w, hidden) {
  Object.defineProperty(w.document, 'hidden', { configurable: true, get: () => hidden })
  Object.defineProperty(w.document, 'visibilityState', {
    configurable: true,
    get: () => (hidden ? 'hidden' : 'visible'),
  })
}

test('称号行情：隐藏页不续写在看心跳', async () => {
  const { w, dbg } = await boot()
  await dbg.openFloat()
  const t1 = dbg.watchBeat().t
  assert.ok(t1 > 0)
  setPageHidden(w, true)
  w.document.dispatchEvent(new w.Event('visibilitychange'))
  const tFrozen = dbg.watchBeat().t
  dbg.writeWatchBeat()
  assert.equal(dbg.watchBeat().t, tFrozen)
  setPageHidden(w, false)
  w.document.dispatchEvent(new w.Event('visibilitychange'))
  assert.ok(dbg.watchBeat().t > tFrozen)
  assert.equal(dbg.watching(), true)
})

test('称号行情：关闭只清自己的心跳', async () => {
  const { dbg } = await boot()
  await dbg.openFloat()
  dbg.setWatchBeat({ t: Date.now(), id: 'other-tab' })
  dbg.closeFloat()
  assert.equal(dbg.watchBeat().id, 'other-tab')
  assert.ok(dbg.watchBeat().t > 0)
})

test('称号行情：停用后卸浮层和钮', async () => {
  const { w, dbg } = await boot()
  await dbg.openFloat()
  w.LSB.disable('title-quotes')
  assert.equal(w.document.querySelector('.lsb-title-quotes-fab'), null)
  assert.equal(w.document.querySelector('.lsb-title-quotes-float'), null)
})

