// ==UserScript==
// @name         LSB·称号行情
// @namespace    https://linux.sb/
// @version      1.0.17
// @description  采集称号交易挂单的最低/最高与中位数；全场锚点折线，各称号可切挂单合成K或高低折线；交易页与全站浮层可切分析大盘。氢壳开着时走左栏，关壳才留右下钮。打开浮层时巡检加快。纯读，不提交购买。需要 LINUX.SB 基座。
// @author       you
// @match        https://linux.sb/*
// @grant        none
// @run-at       document-end
// @noframes
// ==/UserScript==

/**
 * 数据源：/gacha_market 在售卡片。站点按页展示（约 24 条/页），必须跟分页把挂单收全；
 * 只拉每个筛选的第一页会丢掉中间价，巡检高低价就会和交易页对不上。
 * 成交记录双方可见，不用。选择器只写在本文件。
 */
(function () {
  'use strict'

  const manifest = {
    id: 'title-quotes',
    name: '称号行情',
    version: '1.0.17',
    description: '称号交易挂单高低价、全场锚点折线；各称号可切挂单合成K或高低折线；全站浮层；氢壳开着走左栏，关壳才留右下钮',
    author: 'you',
    requires: { base: '^0.1.0' },
    permissions: ['read', 'storage', 'ui', 'events'],
    config: {
      intervalSec: { type: 'number', label: '巡检间隔 (秒)', default: 30 },
      keepDays: { type: 'number', label: '保留天数', default: 90 },
    },
  }

  const MERGE_MS = 12 * 3600e3
  const MOVER_TOP = 10
  const FORCE_DEBOUNCE_MS = 5000
  const WATCH_MS = 10000
  const WATCH_TTL_MS = 15000
  const WATCH_BEAT_MS = 5000
  const MAX_PAGES = 40
  const ROLES = [
    { id: 'hi', label: '最高', color: 'var(--danger,#d55)' },
    { id: 'midHi', label: '中位偏上', color: 'var(--warning,#c90)' },
    { id: 'midLo', label: '中位偏下', color: 'var(--brand,#5eaaa0)' },
    { id: 'lo', label: '最低', color: 'var(--success,#3aa08f)' },
  ]
  const TITLE_LINES = [
    { id: 'hi', label: '最高', color: 'var(--danger,#d55)' },
    { id: 'lo', label: '最低', color: 'var(--success,#3aa08f)' },
  ]

  function titleKey(name, rarity) {
    return `${name}@${rarity}`
  }
  function splitKey(k) {
    const i = String(k).lastIndexOf('@')
    if (i < 0) return { name: k, rarity: '' }
    return { name: k.slice(0, i), rarity: k.slice(i + 1) }
  }
  function median(nums) {
    const a = (nums || []).slice().sort((x, y) => x - y)
    if (!a.length) return 0
    const lo = Math.floor((a.length - 1) / 2)
    const hi = Math.ceil((a.length - 1) / 2)
    if (lo === hi) return a[lo]
    return Math.round((a[lo] + a[hi]) / 2)
  }
  function parseCards(src) {
    let root = src
    if (typeof src === 'string') {
      root = new DOMParser().parseFromString(src, 'text/html')
    } else if (!src || !src.querySelectorAll) {
      root = document
    }
    const out = []
    for (const el of root.querySelectorAll('.gacha-market-card')) {
      const name = (el.querySelector('.gacha-title-name')?.textContent || '').trim()
      const rarity = (el.querySelector('.gacha-title-rarity')?.textContent || '').trim()
      const form = el.querySelector('[data-gacha-market-price]')
      const price = Number(form?.getAttribute('data-gacha-market-price'))
      const id = (el.querySelector('input[name="listing_id"]')?.value || '').trim()
      if (!name || !Number.isFinite(price)) continue
      const meta = el.querySelector('.gacha-market-meta')?.textContent || ''
      const qtyMatch = meta.match(/剩余\s*(\d+)\s*个/)
      const maxQty = Number(el.querySelector('input[name="quantity"]')?.getAttribute('max'))
      const qty = qtyMatch ? Number(qtyMatch[1]) : maxQty > 0 ? maxQty : 1
      out.push({
        id: id || `${name}@${rarity}@${price}@${out.length}`,
        name,
        rarity,
        price,
        qty: qty > 0 ? qty : 1,
      })
    }
    return out
  }
  function parsePageCount(src) {
    let root = src
    if (typeof src === 'string') {
      root = new DOMParser().parseFromString(src, 'text/html')
    } else if (!src || !src.querySelectorAll) {
      root = document
    }
    let max = 1
    for (const a of root.querySelectorAll('a[href]')) {
      const m = (a.getAttribute('href') || '').match(/[?&]p=(\d+)/)
      if (m) max = Math.max(max, Number(m[1]))
    }
    return Math.min(MAX_PAGES, Math.max(1, max))
  }
  function mergeListings(lists) {
    const seen = new Set()
    const out = []
    for (const arr of lists || []) {
      for (const x of arr || []) {
        if (x.id && seen.has(x.id)) continue
        if (x.id) seen.add(x.id)
        out.push(x)
      }
    }
    return out
  }
  function foldTitles(listings) {
    const bag = {}
    for (const x of listings || []) {
      const k = titleKey(x.name, x.rarity)
      if (!bag[k]) bag[k] = { name: x.name, rarity: x.rarity, prices: [], n: 0 }
      bag[k].prices.push(x.price)
      bag[k].n += Number(x.qty) > 0 ? Number(x.qty) : 1
    }
    const titles = {}
    for (const [k, v] of Object.entries(bag)) {
      titles[k] = { rarity: v.rarity, lo: Math.min(...v.prices), hi: Math.max(...v.prices), mid: median(v.prices), n: v.n }
    }
    return titles
  }

  const BOOK_STALE_MS = 3 * 3600e3

  function bookFromListings(listings) {
    const rows = {}
    for (const x of listings || []) {
      if (!x || !x.id) continue
      const qty = Number(x.qty) > 0 ? Number(x.qty) : 1
      rows[String(x.id)] = { key: titleKey(x.name, x.rarity), qty }
    }
    return rows
  }

  function diffBook(prevRows, listings) {
    const curr = bookFromListings(listings)
    const prev = prevRows || {}
    const out = {}
    const add = (key, sold, fills) => {
      if (!key || (!(sold > 0) && !(fills > 0))) return
      if (!out[key]) out[key] = { sold: 0, fills: 0 }
      out[key].sold += sold
      out[key].fills += fills
    }
    for (const [id, row] of Object.entries(prev)) {
      const now = curr[id]
      if (!now) {
        add(row.key, Number(row.qty) > 0 ? Number(row.qty) : 0, 1)
        continue
      }
      const before = Number(row.qty) > 0 ? Number(row.qty) : 0
      const after = Number(now.qty) > 0 ? Number(now.qty) : 0
      if (after < before) add(now.key || row.key, before - after, 1)
    }
    return out
  }

  function estimateFlow(prevBook, listings, now = Date.now()) {
    if (!prevBook || !prevBook.rows || !Number.isFinite(prevBook.t)) return {}
    if (now - prevBook.t > BOOK_STALE_MS) return {}
    return diffBook(prevBook.rows, listings)
  }

  function flowTraded(flow) {
    return Object.values(flow || {}).some((d) => Number(d?.sold) > 0 || Number(d?.fills) > 0)
  }

  function sumFlow(series, key, { rangeDays = 7, now = Date.now() } = {}) {
    const cutoff = rangeCutoff(rangeDays, now)
    let sold = 0
    let fills = 0
    for (const s of series || []) {
      if (!s || s.t < cutoff) continue
      const d = (s.flow && s.flow[key]) || (s.titles && s.titles[key])
      if (!d) continue
      const ds = Number(d.sold)
      const df = Number(d.fills)
      if (ds > 0) sold += ds
      if (df > 0) fills += df
    }
    return { sold, fills }
  }

  function pickAnchors(listings, titles) {
    if (!listings || !listings.length) return []
    let hiL = listings[0]
    let loL = listings[0]
    for (const L of listings) {
      if (L.price > hiL.price) hiL = L
      if (L.price < loL.price) loL = L
    }
    const used = new Set([titleKey(hiL.name, hiL.rarity), titleKey(loL.name, loL.rarity)])
    const anchors = [{ role: 'hi', name: hiL.name, rarity: hiL.rarity, price: hiL.price }]
    const S = Object.entries(titles || {})
      .filter(([k]) => !used.has(k))
      .map(([k, v]) => ({ key: k, name: splitKey(k).name, ...v }))
      .sort((a, b) => a.mid - b.mid || a.name.localeCompare(b.name, 'zh-CN'))
    const n = S.length
    if (n === 1) {
      anchors.push({ role: 'midLo', name: S[0].name, rarity: S[0].rarity, price: S[0].mid })
    } else if (n >= 2) {
      let iLo = Math.floor((n - 1) / 2)
      let iHi = Math.ceil((n - 1) / 2)
      if (iLo === iHi) iHi = iHi + 1 < n ? iHi + 1 : null
      anchors.push({ role: 'midLo', name: S[iLo].name, rarity: S[iLo].rarity, price: S[iLo].mid })
      if (iHi != null) {
        anchors.push({ role: 'midHi', name: S[iHi].name, rarity: S[iHi].rarity, price: S[iHi].mid })
      }
    }
    anchors.push({ role: 'lo', name: loL.name, rarity: loL.rarity, price: loL.price })
    return anchors
  }
  function snapSig(s) {
    const a = (s.anchors || [])
      .map((x) => [x.role, x.name, x.rarity, x.price].join('|'))
      .sort()
      .join(';')
    const t = Object.keys(s.titles || {})
      .sort()
      .map((k) => {
        const v = s.titles[k]
        return `${k}:${v.lo}/${v.hi}/${v.mid}/${v.n ?? ''}`
      })
      .join(';')
    return a + '#' + t
  }

  function rangeCutoff(rangeDays, now = Date.now()) {
    const d = Number(rangeDays)
    if (d === 0) {
      const start = new Date(now)
      start.setHours(0, 0, 0, 0)
      return start.getTime()
    }
    const days = Number.isFinite(d) && d > 0 ? d : 7
    return now - days * 864e5
  }

  function periodMs(rangeDays, barMin) {
    const d = Number(rangeDays)
    if (d === 0) {
      const m = Number(barMin)
      if (m === 1 || m === 5 || m === 15 || m === 30 || m === 60) return m * 60e3
      return 30 * 60e3
    }
    if (!Number.isFinite(d) || d < 0) return 4 * 3600e3
    if (d <= 7) return 4 * 3600e3
    if (d <= 30) return 864e5
    return 3 * 864e5
  }

  function foldCandles(series, key, { rangeDays = 7, now = Date.now(), barMin } = {}) {
    const period = periodMs(rangeDays, barMin)
    const cutoff = rangeCutoff(rangeDays, now)
    const raw = series || []
    const inRange = raw.filter((s) => s.t >= cutoff)
    const snaps = (inRange.length ? inRange : rangeDays === 0 ? [] : raw).slice().sort((a, b) => a.t - b.t)
    const points = snaps.map((s) => ({
      t: s.t,
      q: s.titles && s.titles[key] ? s.titles[key] : null,
    }))
    const firstWith = points.find((p) => p.q)
    if (!firstWith) return []
    const start = Math.floor(firstWith.t / period) * period
    const end = Math.floor(now / period) * period + period
    const bars = []
    let prevC = null
    for (let b = start; b < end; b += period) {
      const quotes = points.filter((p) => p.t >= b && p.t < b + period && p.q).map((p) => p.q)
      if (!quotes.length) continue
      const mids = quotes.map((q) => q.mid)
      const c = mids[mids.length - 1]
      const o = prevC == null ? mids[0] : prevC
      bars.push({
        t: b,
        o,
        h: Math.max(o, ...mids),
        l: Math.min(o, ...mids),
        c,
      })
      prevC = c
    }
    return bars
  }

  function mean(nums) {
    const a = (nums || []).filter((n) => Number.isFinite(n))
    if (!a.length) return null
    return a.reduce((s, x) => s + x, 0) / a.length
  }

  function snapshotIndex(titles) {
    const buckets = {}
    const all = []
    for (const v of Object.values(titles || {})) {
      if (!v || !Number.isFinite(v.mid)) continue
      const r = typeof v.rarity === 'string' ? v.rarity : ''
      if (!buckets[r]) buckets[r] = []
      buckets[r].push(v.mid)
      all.push(v.mid)
    }
    const byRarity = {}
    for (const [r, mids] of Object.entries(buckets)) {
      byRarity[r] = { mean: mean(mids), n: mids.length }
    }
    return { overall: mean(all), byRarity }
  }

  function indexPoints(series, rarity) {
    const out = []
    for (const s of series || []) {
      const idx = snapshotIndex(s.titles || {})
      const mid = rarity === null ? idx.overall : idx.byRarity[rarity]?.mean
      if (Number.isFinite(mid)) out.push({ t: s.t, mid })
    }
    return out
  }

  function foldIndexCandles(points, opts) {
    const key = '__idx'
    const series = (points || [])
      .filter((p) => p && Number.isFinite(p.t) && Number.isFinite(p.mid))
      .map((p) => ({ t: p.t, titles: { [key]: { mid: p.mid } } }))
    return foldCandles(series, key, opts)
  }

  function sma(values, n) {
    const out = []
    const k = Number(n)
    for (let i = 0; i < (values || []).length; i++) {
      if (!Number.isFinite(k) || k < 1 || i + 1 < k) {
        out[i] = null
        continue
      }
      out[i] = mean(values.slice(i + 1 - k, i + 1))
    }
    return out
  }

  function stdevPop(values) {
    const a = (values || []).filter((n) => Number.isFinite(n))
    if (!a.length) return null
    const m = mean(a)
    let s = 0
    for (const x of a) s += (x - m) * (x - m)
    return Math.sqrt(s / a.length)
  }

  function bollinger(closes, n = 20, k = 2) {
    const mid = sma(closes, n)
    const upper = []
    const lower = []
    const kk = Number(k)
    for (let i = 0; i < (closes || []).length; i++) {
      if (mid[i] == null || !Number.isFinite(kk)) {
        upper[i] = null
        lower[i] = null
        continue
      }
      const sd = stdevPop(closes.slice(i + 1 - n, i + 1))
      upper[i] = mid[i] + kk * sd
      lower[i] = mid[i] - kk * sd
    }
    return { mid, upper, lower }
  }

  function overlays(bars) {
    const closes = (bars || []).map((b) => b.c)
    const sma5 = sma(closes, 5)
    const bb = bollinger(closes, 20, 2)
    return closes.map((_, i) => {
      const row = {}
      if (sma5[i] != null) row.sma5 = sma5[i]
      if (bb.mid[i] != null) {
        row.sma20 = bb.mid[i]
        row.bbMid = bb.mid[i]
        row.bbUpper = bb.upper[i]
        row.bbLower = bb.lower[i]
      }
      return row
    })
  }

  function niceTicks(min, max, n = 4) {
    if (!(max > min)) return [min]
    const span = max - min
    const step0 = span / n
    const mag = Math.pow(10, Math.floor(Math.log10(step0)))
    const err = step0 / mag
    const step = err >= 7.5 ? 10 * mag : err >= 3 ? 5 * mag : err >= 1.5 ? 2 * mag : mag
    const lo = Math.floor(min / step) * step
    const hi = Math.ceil(max / step) * step
    const ticks = []
    for (let v = lo; v <= hi + step * 0.25; v += step) {
      ticks.push(Number(Number(v).toPrecision(12)))
    }
    return ticks.length ? ticks : [min, max]
  }

  function fmtPrice(v) {
    if (!Number.isFinite(v)) return ''
    return Number.isInteger(v) ? String(v) : String(Math.round(v * 10) / 10)
  }

  function fmtTime(t, rangeDays) {
    const d = new Date(t)
    const md = `${d.getMonth() + 1}-${d.getDate()}`
    const hh = String(d.getHours()).padStart(2, '0')
    const mm = String(d.getMinutes()).padStart(2, '0')
    if (rangeDays === 0) return `${hh}:${mm}`
    if (rangeDays <= 7) return `${md} ${hh}:${mm}`
    return md
  }

  function fmtPct(ratio) {
    if (!Number.isFinite(ratio)) return ''
    const p = ratio * 100
    const sign = p > 0 ? '+' : ''
    return `${sign}${(Math.round(p * 10) / 10).toFixed(1)}%`
  }

  function movers(latestTitles, baseTitles) {
    const latest = latestTitles || {}
    const base = baseTitles || {}
    const listed = []
    const delisted = []
    const up = []
    const down = []
    for (const key of Object.keys(latest)) {
      if (!base[key]) {
        const meta = splitKey(key)
        listed.push({ key, name: meta.name, rarity: latest[key].rarity ?? meta.rarity, mid: latest[key].mid })
      }
    }
    for (const key of Object.keys(base)) {
      if (!latest[key]) {
        const meta = splitKey(key)
        delisted.push({ key, name: meta.name, rarity: base[key].rarity ?? meta.rarity })
      }
    }
    for (const key of Object.keys(latest)) {
      if (!base[key]) continue
      const cur = Number(latest[key].mid)
      const prev = Number(base[key].mid)
      if (!Number.isFinite(cur) || !Number.isFinite(prev) || prev === 0) continue
      const delta = cur - prev
      const pct = delta / prev
      if (pct === 0) continue
      const meta = splitKey(key)
      const row = {
        key,
        name: meta.name,
        rarity: latest[key].rarity ?? meta.rarity,
        mid: cur,
        delta,
        pct,
      }
      if (pct > 0) up.push(row)
      else down.push(row)
    }
    const byKey = (a, b) => a.key.localeCompare(b.key, 'zh-CN')
    up.sort((a, b) => b.pct - a.pct || byKey(a, b))
    down.sort((a, b) => a.pct - b.pct || byKey(a, b))
    return {
      up: up.slice(0, MOVER_TOP),
      down: down.slice(0, MOVER_TOP),
      listed,
      delisted,
    }
  }

  function boardPair(series, { rangeDays = 7, now = Date.now(), mode = 'short' } = {}) {
    const all = (series || []).slice().sort((a, b) => a.t - b.t)
    if (mode === 'short') {
      return {
        latest: all[all.length - 1] || null,
        base: all.length >= 2 ? all[all.length - 2] : null,
        emptyWindow: false,
      }
    }
    const cutoff = rangeCutoff(rangeDays, now)
    const view = all.filter((s) => s.t >= cutoff)
    if (!view.length) return { latest: null, base: null, emptyWindow: true }
    return { latest: view[view.length - 1], base: view[0], emptyWindow: false }
  }

  function fmtBarTip(bar, rangeDays, barMin) {
    const t = Number(bar.t)
    const o = Number(bar.o)
    const h = Number(bar.h)
    const l = Number(bar.l)
    const c = Number(bar.c)
    const chg = c - o
    const sign = chg > 0 ? '+' : ''
    const when = `${fmtTime(t, rangeDays)}–${fmtTime(t + periodMs(rangeDays, barMin), rangeDays)}`
    const lines = [
      when,
      `开 ${fmtPrice(o)}`,
      `高 ${fmtPrice(h)}`,
      `低 ${fmtPrice(l)}`,
      `收 ${fmtPrice(c)}  ${sign}${fmtPrice(chg)}`,
    ]
    const add = (label, raw) => {
      const v = Number(raw)
      if (!Number.isFinite(v)) return
      lines.push(`${label} ${fmtPrice(v)}`)
    }
    add('均5', bar.sma5)
    add('均20', bar.sma20)
    add('上轨', bar.bbUpper)
    add('下轨', bar.bbLower)
    return lines.join('\n')
  }

  function setup(api) {
    const esc = api.util.esc
    let cfg = api.config()
    ;(function migrateInterval() {
      const saved = api.store.get('__config', {}) || {}
      if ('intervalSec' in saved) return
      if (!('intervalMin' in saved)) return
      const min = Number(saved.intervalMin)
      // 1 分钟 / 30 分钟是旧默认，不是用户定制；换成 30 秒
      let sec = 30
      if (Number.isFinite(min) && min > 0 && min !== 1 && min !== 30) {
        sec = Math.max(1, Math.round(min * 60))
      }
      api.saveConfig({ intervalSec: sec })
      cfg = api.config()
    })()
    api.on('config:changed:title-quotes', () => {
      cfg = api.config()
      if (election.isLeader) scheduleNext()
    })
    let timer = null
    let forceTimer = null
    let inflight = null
    let lastErr = null
    let lastAt = null
    let toasted = false
    let rangeDays = 7
    let boardView = 'quotes'
    let boardRarity = null
    let boardMove = 'short'
    let focusKey = null
    let forceFoldOpen = false
    const getKind = () => (api.store.get('chartKind') === 'line' ? 'line' : 'candle')
    const setKind = (k) => api.store.set('chartKind', k === 'line' ? 'line' : 'candle')
    const getBarMin = () => {
      const m = Number(api.store.get('barMin', 30))
      return m === 1 || m === 5 || m === 15 || m === 30 || m === 60 ? m : 30
    }
    const setBarMin = (n) => {
      const m = Number(n)
      api.store.set('barMin', m === 1 || m === 5 || m === 15 || m === 30 || m === 60 ? m : 30)
    }
    let clipSeq = 0
    const get = () => api.store.get('series', []) || []
    const set = (a) => api.store.set('series', a)
    const tabId = Math.random().toString(36).slice(2, 10)
    let beatTimer = null
    let armedMs = null
    let drag = null
    let plotW = 800
    let plotH = 380
    let sizeWatch = null
    let sizeTimer = 0
    let plotGen = 0

    function readChartH() {
      const n = Number(api.store.get('chartH', 380))
      return Math.min(720, Math.max(240, Number.isFinite(n) && n > 0 ? n : 380))
    }
    plotH = readChartH()

    function pushSnap(snap, now = Date.now()) {
      const arr = get()
      const last = arr[arr.length - 1]
      const traded = flowTraded(snap.flow)
      if (last && snapSig(last) === snapSig(snap) && now - last.t < MERGE_MS && !traded) {
        last.t = Math.max(last.t, now)
        set(arr)
        return false
      }
      arr.push({ t: now, anchors: snap.anchors, titles: snap.titles, flow: snap.flow || {} })
      const deadline = now - cfg.keepDays * 864e5
      set(arr.filter((x) => x.t >= deadline))
      return true
    }

    function ingestListings(listings, now = Date.now()) {
      const prev = api.store.get('book', null)
      const flow = estimateFlow(prev, listings, now)
      api.store.set('book', { t: now, rows: bookFromListings(listings) })
      const titles = foldTitles(listings)
      for (const k of Object.keys(titles)) {
        titles[k].sold = flow[k]?.sold ?? 0
        titles[k].fills = flow[k]?.fills ?? 0
      }
      const anchors = pickAnchors(listings, titles)
      return pushSnap({ anchors, titles, flow }, now)
    }

    function isMarket() {
      try {
        return location.pathname.replace(/\/+$/, '') === '/gacha_market'
      } catch {
        return false
      }
    }
    function unmountEmbed() {
      document.querySelectorAll('.lsb-title-quotes-embed').forEach((el) => el.remove())
    }
    function mountEmbed() {
      if (!isMarket()) {
        unmountEmbed()
        return
      }
      const sections = [...document.querySelectorAll('.gacha-market-section')]
      const sold = sections.find((s) => /在售(交易|列表)/.test(s.querySelector('h2')?.textContent || ''))
      if (!sold) return
      let el = document.querySelector('.lsb-title-quotes-embed')
      if (!el) {
        el = document.createElement('section')
        el.className = 'lsb-title-quotes-embed'
        sold.parentNode.insertBefore(el, sold)
      }
      render(el)
    }

    function plotGeom() {
      return { W: plotW, H: plotH, P: { l: 52, r: 14, t: 12, b: 32 } }
    }

    function timeWindow(times, rangeDays, now, barMin) {
      const tMax = now
      const rangeMin = rangeCutoff(rangeDays, now)
      const nums = (times || []).filter((t) => Number.isFinite(t) && t <= tMax)
      const inRange = nums.filter((t) => t >= rangeMin)
      const src = inRange.length ? inRange : rangeDays === 0 ? nums.filter((t) => t >= rangeMin) : nums
      const dataMin = src.length ? Math.min(...src) : rangeMin
      let tMin = Math.max(rangeMin, Math.min(dataMin, tMax))
      const period = periodMs(rangeDays, barMin)
      const minSpan = Math.max(period, rangeDays === 0 ? 30 * 60e3 : 3600e3)
      if (tMax - tMin < minSpan) tMin = Math.max(rangeMin, tMax - minSpan)
      const pad = Math.max((tMax - tMin) * 0.05, period * 0.35)
      tMin = Math.max(rangeMin, tMin - pad)
      return { tMin, tMax: tMax + pad * 0.12 }
    }

    function yScale(min, max, P, H) {
      const pad = (max - min || 1) * 0.12
      const lo = min - pad
      const hi = max + pad
      const span = hi - lo || 1
      const Y = (v) => P.t + (1 - (v - lo) / span) * (H - P.t - P.b)
      return { lo, hi, Y, ticks: niceTicks(min, max, 4) }
    }

    function xScale(tMin, tMax, P, W) {
      const span = Math.max(1, tMax - tMin)
      return (t) => P.l + ((t - tMin) / span) * (W - P.l - P.r)
    }

    function gridAndAxes({ W, H, P, Y, ticks, tMin, tMax, rangeDays, clip }) {
      const innerW = W - P.l - P.r
      const innerH = H - P.t - P.b
      const x0 = P.l
      const x1 = P.l + innerW
      const y0 = P.t
      const y1 = P.t + innerH
      const hair = 'stroke="currentColor" vector-effect="non-scaling-stroke" shape-rendering="crispEdges"'
      const gridH = ticks
        .map((v) => {
          const y = Y(v)
          if (y < y0 - 0.5 || y > y1 + 0.5) return ''
          return `<line class="lsb-title-quotes-grid" x1="${x0}" x2="${x1}" y1="${y.toFixed(1)}" y2="${y.toFixed(1)}" ${hair} stroke-opacity="0.28"></line>
            <text x="${x0 - 8}" y="${(y + 3.5).toFixed(1)}" text-anchor="end" font-size="10" fill="currentColor" fill-opacity="0.62">${esc(fmtPrice(v))}</text>`
        })
        .join('')
      const tMid = tMin + (tMax - tMin) / 2
      const times = tMax > tMin ? [tMin, tMid, tMax] : [tMin]
      const X = xScale(tMin, tMax, P, W)
      const gridV = times
        .map((t) => {
          const x = X(t)
          return `<line class="lsb-title-quotes-grid" x1="${x.toFixed(1)}" x2="${x.toFixed(1)}" y1="${y0}" y2="${y1}" ${hair} stroke-opacity="0.16"></line>`
        })
        .join('')
      const labels = times
        .map((t, i) => {
          const x = X(t)
          const anchor = i === 0 ? 'start' : i === times.length - 1 ? 'end' : 'middle'
          return `<text x="${x.toFixed(1)}" y="${H - 8}" text-anchor="${anchor}" font-size="10" fill="currentColor" fill-opacity="0.62">${esc(fmtTime(t, rangeDays))}</text>`
        })
        .join('')
      return `<defs><clipPath id="${clip}"><rect x="${x0}" y="${y0}" width="${innerW}" height="${innerH}"></rect></clipPath></defs>
        <rect x="${x0}" y="${y0}" width="${innerW}" height="${innerH}" fill="currentColor" fill-opacity="0.04" stroke="currentColor" stroke-opacity="0.32" vector-effect="non-scaling-stroke"></rect>
        ${gridH}${gridV}${labels}`
    }

    function chartSvg(extraClass, W, H, inner) {
      return `<svg class="lsb-svg${extraClass ? ` ${extraClass}` : ''}" viewBox="0 0 ${W} ${H}" preserveAspectRatio="none" role="img" font-family="ui-sans-serif, system-ui, sans-serif">${inner}</svg>`
    }

    function lines(points, keys, rangeDays = 7, now = Date.now()) {
      if (points.length < 2) return ''
      const { W, H, P } = plotGeom()
      const vals = []
      for (const p of points) {
        for (const k of keys) if (p[k.id] != null) vals.push(p[k.id])
      }
      if (!vals.length) return ''
      const min = Math.min(...vals)
      const max = Math.max(...vals)
      const { Y, ticks } = yScale(min, max, P, H)
      const { tMin, tMax } = timeWindow(
        points.map((p) => p.t),
        rangeDays,
        now,
        getBarMin(),
      )
      const X = xScale(tMin, tMax, P, W)
      const clip = `lsb-tq-l-${++clipSeq}`
      const polylines = keys
        .map((k) => {
          const pts = points
            .filter((p) => p[k.id] != null && p.t != null)
            .map((p) => `${X(p.t).toFixed(1)},${Y(p[k.id]).toFixed(1)}`)
            .join(' ')
          if (!pts) return ''
          return `<polyline points="${pts}" fill="none" stroke="${k.color}" stroke-width="2" stroke-linejoin="round" stroke-linecap="round" clip-path="url(#${clip})"></polyline>`
        })
        .join('')
      const frame = gridAndAxes({ W, H, P, Y, ticks, tMin, tMax, rangeDays, clip })
      return chartSvg('', W, H, `${frame}${polylines}`)
    }

    function overlayPaths(bars, overlayRows, X, Y, period) {
      if (!overlayRows) return ''
      const draw = (key, stroke, dash) => {
        const segs = []
        let d = ''
        const flush = () => {
          if (d) segs.push(d)
          d = ''
        }
        for (let i = 0; i < bars.length; i++) {
          if (i > 0 && bars[i].t - bars[i - 1].t > period) flush()
          const v = Number(overlayRows[i]?.[key])
          if (!Number.isFinite(v)) {
            flush()
            continue
          }
          const x = X(bars[i].t + period / 2).toFixed(1)
          const y = Y(v).toFixed(1)
          d += d ? ` L${x} ${y}` : `M${x} ${y}`
        }
        flush()
        const dashAttr = dash ? ' stroke-dasharray="4 3"' : ''
        return segs
          .map(
            (p) =>
              `<path fill="none" stroke="${stroke}" stroke-width="1.4"${dashAttr} vector-effect="non-scaling-stroke" pointer-events="none" d="${p}"></path>`,
          )
          .join('')
      }
      return (
        draw('sma5', '#6b8afd', false) +
        draw('sma20', '#c9892e', false) +
        draw('bbUpper', '#8b8d9a', true) +
        draw('bbLower', '#8b8d9a', true)
      )
    }

    function candles(bars, rangeDays = 7, now = Date.now(), overlayRows = null) {
      if (!bars.length) return ''
      const { W, H, P } = plotGeom()
      const barMin = getBarMin()
      const period = periodMs(rangeDays, barMin)
      const vals = bars.flatMap((bar) => [bar.o, bar.h, bar.l, bar.c])
      if (overlayRows) {
        for (const row of overlayRows) {
          if (!row) continue
          for (const v of Object.values(row)) {
            if (Number.isFinite(v)) vals.push(v)
          }
        }
      }
      const min = Math.min(...vals)
      const max = Math.max(...vals)
      const { Y, ticks } = yScale(min, max, P, H)
      const { tMin, tMax } = timeWindow(
        bars.map((bar) => bar.t),
        rangeDays,
        now,
        barMin,
      )
      const X = xScale(tMin, tMax, P, W)
      const innerW = W - P.l - P.r
      const span = Math.max(1, tMax - tMin)
      const slots = Math.max(bars.length + 1, span / period)
      const bodyW = Math.max(5, Math.min(14, (innerW / slots) * 0.58))
      const clip = `lsb-tq-k-${++clipSeq}`
      const parts = bars
        .map((bar, i) => {
          const x = X(bar.t + period / 2)
          const yO = Y(bar.o)
          const yC = Y(bar.c)
          const color = bar.c > bar.o ? '#d94c4c' : bar.c < bar.o ? '#2a9a7c' : '#8b8d9a'
          const yH = Y(bar.h)
          const yL = Y(bar.l)
          const flat = Math.abs(yO - yC) < 1.2
          const hair = 'vector-effect="non-scaling-stroke"'
          const body = flat
            ? `<line class="lsb-title-quotes-body" x1="${(x - bodyW / 2).toFixed(1)}" x2="${(x + bodyW / 2).toFixed(1)}" y1="${yC.toFixed(1)}" y2="${yC.toFixed(1)}" stroke="${color}" stroke-width="2" stroke-linecap="square" ${hair}></line>`
            : `<rect class="lsb-title-quotes-body" x="${(x - bodyW / 2).toFixed(1)}" y="${Math.min(yO, yC).toFixed(1)}" width="${bodyW.toFixed(1)}" height="${Math.max(1.2, Math.abs(yO - yC)).toFixed(1)}" fill="${color}" stroke="${color}" stroke-width="1" ${hair}></rect>`
          const wick = `<line class="lsb-title-quotes-wick" x1="${x.toFixed(1)}" x2="${x.toFixed(1)}" y1="${yH.toFixed(1)}" y2="${yL.toFixed(1)}" stroke="${color}" stroke-width="1" ${hair}></line>`
          const innerH = H - P.t - P.b
          const slotW = Math.max(bodyW + 6, innerW / slots)
          const hit = `<rect class="lsb-title-quotes-hit" x="${(x - slotW / 2).toFixed(1)}" y="${P.t}" width="${slotW.toFixed(1)}" height="${innerH}" fill="transparent"></rect>`
          let ovAttrs = ''
          if (overlayRows) {
            const ov = overlayRows[i] || {}
            const put = (attr, raw) => {
              const v = Number(raw)
              if (!Number.isFinite(v)) return
              ovAttrs += ` ${attr}="${v}"`
            }
            put('data-sma5', ov.sma5)
            put('data-sma20', ov.sma20)
            put('data-bb-upper', ov.bbUpper)
            put('data-bb-lower', ov.bbLower)
          }
          return `<g class="lsb-title-quotes-bar" data-t="${bar.t}" data-o="${bar.o}" data-h="${bar.h}" data-l="${bar.l}" data-c="${bar.c}"${ovAttrs}>${hit}${wick}${body}</g>`
        })
        .join('')
      const ovSvg = overlayPaths(bars, overlayRows, X, Y, period)
      const frame = gridAndAxes({ W, H, P, Y, ticks, tMin, tMax, rangeDays, clip })
      return chartSvg('lsb-title-quotes-k', W, H, `${frame}<g clip-path="url(#${clip})">${parts}${ovSvg}</g>`)
    }

    function statusLine() {
      if (lastErr) {
        const when = lastAt ? new Date(lastAt).toLocaleString('zh-CN') : '尚无成功采集'
        return `上次采集 ${when} · 本轮失败`
      }
      if (lastAt) return `上次采集 ${new Date(lastAt).toLocaleString('zh-CN')}`
      return ''
    }

    function render(host) {
      if (!host) return
      const all = get()
      const latest = all[all.length - 1]
      const cutoff = rangeCutoff(rangeDays)
      const view = all.filter((x) => x.t >= cutoff)
      const chartSrc = view.length >= 2 ? view : rangeDays === 0 ? view : all
      const kind = getKind()

      const viewBtns = `<button class="lsb-btn${boardView === 'quotes' ? ' is-primary' : ''}" data-board-view="quotes">行情</button>
          <button class="lsb-btn${boardView === 'board' ? ' is-primary' : ''}" data-board-view="board">大盘</button>`
      const chartBtns =
        boardView === 'quotes'
          ? [
              ['candle', 'K线'],
              ['line', '折线'],
            ]
              .map(
                ([id, label]) =>
                  `<button class="lsb-btn${kind === id ? ' is-primary' : ''}" data-chart="${id}">${label}</button>`,
              )
              .join('')
          : ''
      const rangeBtns = [
        [0, '本日'],
        [7, '7天'],
        [30, '30天'],
        [90, '90天'],
      ]
        .map(
          ([d, label]) =>
            `<button class="lsb-btn${rangeDays === d ? ' is-primary' : ''}" data-range="${d}">${label}</button>`,
        )
        .join('')
      const barMin = getBarMin()
      const showBarMin = rangeDays === 0 && (boardView === 'board' || kind !== 'line')
      const barMinBtns = showBarMin
        ? [1, 5, 15, 30, 60]
            .map(
              (m) =>
                `<button type="button" class="lsb-btn${barMin === m ? ' is-primary' : ''}" data-bar-min="${m}">${m}分</button>`,
            )
            .join('')
        : ''
      const tools = `<span style="display:flex;gap:6px;align-items:center">${viewBtns}</span>
        <span style="margin-left:auto;display:flex;gap:8px;align-items:center">
          ${chartBtns ? `<span style="display:flex;gap:6px">${chartBtns}</span>` : ''}
          <span style="display:flex;gap:6px">${rangeBtns}</span>
          ${barMinBtns ? `<span style="display:flex;gap:6px">${barMinBtns}</span>` : ''}
        </span>`
      const isEmbed = host.classList.contains('lsb-title-quotes-embed')
      const isFloat = host.classList.contains('lsb-title-quotes-float-body')
      const keepOpen =
        (isEmbed && !!host.querySelector('details.lsb-title-quotes-fold')?.open) || forceFoldOpen
      const head = isEmbed
        ? `<div class="lsb-cal-head">${tools}</div>`
        : `<div class="lsb-cal-head">
          ${isFloat ? '' : '<strong>称号行情</strong>'}
          <span class="lsb-row-desc">${esc(statusLine())}</span>
          ${tools}
        </div>`

      let bodyHtml = ''
      if (boardView === 'board') {
        if (!all.length) {
          bodyHtml = '<div class="lsb-empty">还没采到行情。打开交易页或等下一轮巡检。</div>'
        } else {
          const raritySet = new Set()
          for (const s of view) {
            for (const t of Object.values(s.titles || {})) raritySet.add(t.rarity ?? '')
          }
          const latestIdx = snapshotIndex(latest?.titles || {})
          const rarities = [...raritySet].sort((a, b) => {
            const na = latestIdx.byRarity[a]?.n ?? 0
            const nb = latestIdx.byRarity[b]?.n ?? 0
            if (nb !== na) return nb - na
            return a.localeCompare(b, 'zh-CN')
          })
          const chips =
            `<button type="button" class="lsb-title-quotes-chip${boardRarity === null ? ' is-primary' : ''}" data-board-idx="all">总指数</button>` +
            rarities
              .map((r) => {
                const label = r === '' ? '未知' : r
                const on = boardRarity === r
                return `<button type="button" class="lsb-title-quotes-chip${on ? ' is-primary' : ''}" data-board-idx="rarity" data-rarity="${esc(r)}">${esc(label)}</button>`
              })
              .join('')
          const bars = foldIndexCandles(indexPoints(all, boardRarity), { rangeDays, barMin })
          let chartBlock = '<div class="lsb-empty">这个时间窗还不够画指数</div>'
          if (bars.length) {
            const ov = overlays(bars)
            chartBlock =
              `<div class="lsb-title-quotes-host">${candles(bars, rangeDays, Date.now(), ov)}</div>` +
              `<div class="lsb-row-desc">K · 5 · 20 · 布林</div>` +
              `<div class="lsb-row-desc">挂单中位 · 非成交</div>`
          }
          const moveBtns = `<div style="display:flex;gap:6px;margin:8px 0">
          <button class="lsb-btn${boardMove === 'short' ? ' is-primary' : ''}" data-board-move="short">短线</button>
          <button class="lsb-btn${boardMove === 'range' ? ' is-primary' : ''}" data-board-move="range">区间</button>
        </div>`
          const pair = boardPair(all, { rangeDays, mode: boardMove })
          let pack = { up: [], down: [], listed: [], delisted: [] }
          if (pair.emptyWindow) pack = null
          else if (pair.latest && !pair.base && boardMove === 'short') pack = movers(pair.latest.titles, {})
          else if (pair.latest && pair.base) pack = movers(pair.latest.titles, pair.base.titles)
          const nameBtn = (row) =>
            `<button type="button" class="lsb-title-quotes-name" data-board-key="${esc(row.key)}">${esc(row.name)}</button>`
          const moverLine = (row) => {
            const dSign = row.delta > 0 ? '+' : ''
            const fl = sumFlow(all, row.key, { rangeDays })
            return `<div class="lsb-title-quotes-mover">${nameBtn(row)}<span>${dSign}${esc(fmtPrice(row.delta))} · ${esc(fmtPct(row.pct))} · 估 ${fl.fills}笔 ${fl.sold}件</span></div>`
          }
          const summarySide = (label, items) => {
            if (!items.length) return ''
            const shown = items.slice(0, 20)
            const tail = items.length > 20 ? '等' : ''
            return `<div class="lsb-row-desc">${label} ${items.length}：${shown.map(nameBtn).join('')}${tail}</div>`
          }
          let rankBody = '<div class="lsb-empty">没有可比的涨跌</div>'
          if (pack) {
            const { up, down, listed, delisted } = pack
            if (up.length || down.length || listed.length || delisted.length) {
              rankBody =
                `<div class="lsb-title-quotes-movers">${[
                  ['涨幅 Top 10', up],
                  ['跌幅 Top 10', down],
                ]
                  .map(
                    ([title, rows]) =>
                      `<div><div class="lsb-row-desc">${title}</div>${rows.map(moverLine).join('')}</div>`,
                  )
                  .join('')}</div>` +
                summarySide('新上', listed) +
                summarySide('下架', delisted)
            }
          }
          bodyHtml = `<div class="lsb-title-quotes-chips">${chips}</div>${chartBlock}${moveBtns}${rankBody}`
        }
      } else {
        const anchors = latest?.anchors || []
        const byRole = Object.fromEntries(anchors.map((x) => [x.role, x]))
        const cards = ROLES.filter((r) => byRole[r.id])
          .map((r) => {
            const a = byRole[r.id]
            return `<div class="lsb-title-quotes-card">
            <span class="lsb-row-desc"><span class="lsb-title-quotes-pip" style="background:${r.color}"></span>${esc(r.label)}</span>
            <strong>${esc(a.name)}</strong>
            <span class="lsb-row-desc">${esc(a.rarity)} · ${esc(a.price)} 积分</span>
          </div>`
          })
          .join('')
        let marketChart = '<div class="lsb-empty">还没采到行情。打开交易页或等下一轮巡检。</div>'
        if (all.length === 1) {
          marketChart = '<div class="lsb-empty">再等一轮巡检后开始绘制折线。</div>'
        } else if (all.length >= 2) {
          const pts = chartSrc.map((s) => {
            const row = { t: s.t }
            for (const a of s.anchors || []) row[a.role] = a.price
            return row
          })
          marketChart = `<div class="lsb-title-quotes-host">${lines(pts, ROLES, rangeDays)}</div>`
        }

        const openKeys = new Set(
          [...host.querySelectorAll('.lsb-title-quotes-row[open]')].map((el) => el.getAttribute('data-key')),
        )
        if (focusKey) openKeys.add(focusKey)
        const listed = latest?.titles || {}
        const keys = new Set()
        for (const s of all) Object.keys(s.titles || {}).forEach((k) => keys.add(k))
        const ordered = [...keys].sort((a, b) => {
          const da = listed[a] ? 0 : 1
          const db = listed[b] ? 0 : 1
          if (da !== db) return da - db
          return (listed[a]?.lo ?? 1e15) - (listed[b]?.lo ?? 1e15) || a.localeCompare(b, 'zh-CN')
        })
        const rows = ordered
          .map((k) => {
            const meta = splitKey(k)
            const cur = listed[k]
            const off = !cur
            const lo = cur?.lo
            const hi = cur?.hi
            let body = ''
            if (kind === 'line') {
              const pick = (src) =>
                src
                  .map((s) => {
                    const t = s.titles && s.titles[k]
                    return t ? { t: s.t, lo: t.lo, hi: t.hi } : null
                  })
                  .filter(Boolean)
              let pts = pick(view)
              if (pts.length < 2 && rangeDays !== 0) pts = pick(all)
              if (pts.length >= 2) {
                body =
                  `<div class="lsb-title-quotes-host">${lines(pts, TITLE_LINES, rangeDays)}</div>` +
                  `<div class="lsb-row-desc">挂单高低 · 非成交</div>`
              }
            } else {
              const bars = foldCandles(all, k, { rangeDays, barMin })
              if (bars.length) {
                body =
                  `<div class="lsb-title-quotes-host">${candles(bars, rangeDays)}</div>` +
                  `<div class="lsb-row-desc">挂单合成 · 非成交</div>`
              }
            }
            const flow = sumFlow(all, k, { rangeDays })
            const est = `估 ${flow.fills} 笔 · ${flow.sold} 件`
            const price = off
              ? `已下架 · ${est}`
              : `最低 ${lo} · 最高 ${hi} · 上架 ${cur.n ?? 0} 个 · ${est}`
            return `<details class="lsb-title-quotes-row${off ? ' is-off' : ''}" data-key="${esc(k)}"${openKeys.has(k) ? ' open' : ''}>
            <summary><strong>${esc(meta.name)}</strong>
              <span class="lsb-row-desc">${esc(meta.rarity)} · ${esc(price)}</span></summary>
            ${body}
          </details>`
          })
          .join('')
        bodyHtml = `<div class="lsb-title-quotes-anchors">${cards || ''}</div>
        ${marketChart}
        ${rows ? `<div class="lsb-title-quotes-list">${rows}</div>` : ''}`
      }

      const estNote = `<div class="lsb-row-desc">成交为挂单剩余变化的估计，含下架/撤单，不是真成交</div>`
      const inner = `
        ${head}
        ${estNote}
        ${bodyHtml}`
      host.classList.add('lsb-title-quotes')
      host.innerHTML = isEmbed
        ? `<details class="lsb-title-quotes-fold"${keepOpen ? ' open' : ''}>
            <summary class="lsb-title-quotes-fold-sum"><strong>称号行情</strong>
              <span class="lsb-row-desc">${esc(statusLine())}</span></summary>
            <div class="lsb-title-quotes-fold-body">${inner}</div>
          </details>`
        : inner
      forceFoldOpen = false
      focusKey = null
      host.querySelectorAll('[data-range]').forEach((b) => {
        b.onclick = () => {
          rangeDays = Number(b.dataset.range)
          render(host)
        }
      })
      host.querySelectorAll('[data-bar-min]').forEach((b) => {
        b.onclick = () => {
          setBarMin(Number(b.getAttribute('data-bar-min')))
          render(host)
        }
      })
      host.querySelectorAll('[data-chart]').forEach((b) => {
        b.onclick = () => {
          setKind(b.dataset.chart)
          render(host)
        }
      })
      host.querySelectorAll('[data-board-view]').forEach((b) => {
        b.onclick = () => {
          boardView = b.dataset.boardView
          render(host)
        }
      })
      host.querySelectorAll('[data-board-idx]').forEach((el) => {
        el.onclick = () => {
          if (el.getAttribute('data-board-idx') === 'all') boardRarity = null
          else boardRarity = el.getAttribute('data-rarity')
          render(host)
        }
      })
      host.querySelectorAll('[data-board-move]').forEach((b) => {
        b.onclick = () => {
          boardMove = b.getAttribute('data-board-move') === 'range' ? 'range' : 'short'
          render(host)
        }
      })
      host.querySelectorAll('[data-board-key]').forEach((el) => {
        el.onclick = () => {
          focusKey = el.getAttribute('data-board-key')
          boardView = 'quotes'
          forceFoldOpen = true
          render(host)
        }
      })
      bindCandleTips(host)
      bindChartSize(host)
    }

    function bindChartSize(root) {
      if (sizeWatch) {
        sizeWatch.disconnect()
        sizeWatch = null
      }
      const wraps = [...root.querySelectorAll('.lsb-title-quotes-host')]
      const h = readChartH()
      for (const wrap of wraps) wrap.style.height = `${h}px`
      const sample = wraps[0]
      if (sample && sample.clientWidth >= 40) {
        const nw = Math.round(sample.clientWidth)
        const nh = Math.round(sample.clientHeight || h)
        if (Math.abs(nw - plotW) > 8 || Math.abs(nh - plotH) > 8) {
          plotW = Math.max(320, nw)
          plotH = Math.min(720, Math.max(240, nh || h))
          queueMicrotask(() => render(root))
          return
        }
      }
      if (!sample || typeof ResizeObserver === 'undefined') return
      const gen = ++plotGen
      sizeWatch = new ResizeObserver((entries) => {
        const el = entries[0]?.target
        if (!el?.isConnected || gen !== plotGen) return
        window.clearTimeout(sizeTimer)
        sizeTimer = window.setTimeout(() => {
          if (gen !== plotGen || !el.isConnected) return
          const nw = Math.round(el.clientWidth)
          const nh = Math.round(el.clientHeight)
          if (nw < 40 || nh < 40) return
          if (Math.abs(nw - plotW) < 8 && Math.abs(nh - plotH) < 8) return
          api.store.set('chartH', Math.min(720, Math.max(240, nh)))
          plotW = Math.max(320, nw)
          plotH = Math.min(720, Math.max(240, nh))
          render(root)
        }, 320)
      })
      sizeWatch.observe(sample)
    }

    function bindCandleTips(root) {
      for (const wrap of root.querySelectorAll('.lsb-title-quotes-host')) {
        if (!wrap.querySelector('svg.lsb-title-quotes-k')) continue
        let tip = wrap.querySelector('.lsb-title-quotes-tip')
        if (!tip) {
          tip = document.createElement('div')
          tip.className = 'lsb-title-quotes-tip'
          wrap.append(tip)
        }
        const hide = () => tip.classList.remove('is-on')
        wrap.onmousemove = (e) => {
          const g = e.target.closest?.('.lsb-title-quotes-bar')
          if (!g || !wrap.contains(g)) {
            hide()
            return
          }
          tip.textContent = fmtBarTip(g.dataset, rangeDays, getBarMin())
          tip.classList.add('is-on')
          const box = wrap.getBoundingClientRect()
          const tw = tip.offsetWidth || 0
          const th = tip.offsetHeight || 0
          let x = e.clientX - box.left + 12
          let y = e.clientY - box.top - th - 8
          if (box.width && x + tw > box.width - 4) x = Math.max(4, box.width - tw - 4)
          if (x < 4) x = 4
          if (y < 4) y = e.clientY - box.top + 16
          if (box.height && y + th > box.height - 4) y = Math.max(4, box.height - th - 4)
          tip.style.left = `${x}px`
          tip.style.top = `${y}px`
        }
        wrap.onmouseleave = hide
      }
    }

    function refreshViews() {
      mountEmbed()
      const body = document.querySelector('.lsb-title-quotes-float-body')
      if (body) render(body)
    }

    async function cycle(force = false) {
      if (inflight) return inflight
      if (election.role === 'follower' && !force) return null
      inflight = (async () => {
        try {
          const lists = []
          const first = await api.net.doc('/gacha_market?p=1')
          lists.push(parseCards(first))
          const pages = parsePageCount(first)
          for (let p = 2; p <= pages; p++) {
            lists.push(parseCards(await api.net.doc(`/gacha_market?p=${p}`)))
          }
          if (isMarket()) lists.push(parseCards(document))
          const listings = mergeListings(lists)
          if (!listings.length) {
            lastErr = null
            return { empty: true }
          }
          ingestListings(listings)
          lastErr = null
          lastAt = Date.now()
          toasted = false
          refreshViews()
          return { n: listings.length }
        } catch (e) {
          lastErr = String((e && e.message) || e)
          api.log('采集失败', lastErr)
          if (!toasted) {
            toasted = true
            api.ui.toast('称号行情本轮采集失败', { type: 'error' })
          }
          refreshViews()
        } finally {
          inflight = null
          if (election.isLeader) scheduleNext()
        }
      })()
      return inflight
    }

    function watching() {
      const beat = api.store.get('watchBeat', null)
      const t = Number(beat && beat.t)
      return Number.isFinite(t) && t > 0 && Date.now() - t < WATCH_TTL_MS
    }
    function configMs() {
      const n = Number(cfg.intervalSec)
      return Math.max(250, (Number.isFinite(n) && n > 0 ? n : 30) * 1000)
    }
    function pollMs() {
      const ms = configMs()
      return watching() ? Math.min(WATCH_MS, ms) : ms
    }
    function scheduleNext() {
      if (timer) clearTimeout(timer)
      armedMs = pollMs()
      timer = setTimeout(() => cycle(), armedMs)
      timer.unref?.()
    }
    function scheduleForceSnap() {
      if (forceTimer) clearTimeout(forceTimer)
      forceTimer = setTimeout(() => {
        forceTimer = null
        cycle(true)
      }, FORCE_DEBOUNCE_MS)
      forceTimer.unref?.()
    }

    const election = api.election({
      onPromote: () => cycle(),
      onDemote: () => {
        if (timer) clearTimeout(timer)
        timer = null
        armedMs = null
      },
      jitter: 800,
    })

    function pageVisible() {
      return document.visibilityState === 'visible' && !document.hidden
    }
    function stopBeatTimer() {
      if (beatTimer) clearInterval(beatTimer)
      beatTimer = null
    }
    function maybeReschedule() {
      if (election.isLeader && pollMs() !== armedMs) scheduleNext()
    }
    function writeWatchBeat() {
      if (!api.store.get('floatOpen')) return
      if (!pageVisible()) return
      const beat = { t: Date.now(), id: tabId }
      api.store.set('watchBeat', beat)
      api.tabs.post('watch', beat)
      maybeReschedule()
    }
    function startBeatTimer() {
      stopBeatTimer()
      writeWatchBeat()
      beatTimer = setInterval(writeWatchBeat, WATCH_BEAT_MS)
      beatTimer.unref?.()
    }
    api.tabs.on('watch', () => maybeReschedule())

    function applyRect(el) {
      const r = api.store.get('floatRect', null)
      el.style.position = 'fixed'
      el.style.zIndex = '99990'
      el.style.minWidth = '360px'
      el.style.minHeight = '360px'
      el.style.maxWidth = '94vw'
      el.style.maxHeight = '90vh'
      if (
        r &&
        Number.isFinite(r.left) &&
        Number.isFinite(r.top) &&
        Number.isFinite(r.width) &&
        Number.isFinite(r.height)
      ) {
        el.style.left = `${r.left}px`
        el.style.top = `${r.top}px`
        el.style.width = `${Math.max(360, r.width)}px`
        el.style.height = `${Math.max(360, r.height)}px`
        el.style.right = 'auto'
        el.style.bottom = 'auto'
      } else {
        el.style.left = 'auto'
        el.style.top = 'auto'
        el.style.right = '16px'
        el.style.bottom = '130px'
        el.style.width = '560px'
        el.style.height = '640px'
      }
    }
    function persistRect(el) {
      const box = el.getBoundingClientRect()
      if (!box.width || !box.height) return
      const prev = api.store.get('floatRect', null) || {}
      const height = el.classList.contains('is-collapsed') && Number.isFinite(prev.height)
        ? prev.height
        : box.height
      api.store.set('floatRect', { left: box.left, top: box.top, width: box.width, height })
    }
    function clamp(el) {
      const box = el.getBoundingClientRect()
      const vw = window.innerWidth || 800
      const vh = window.innerHeight || 600
      let left = box.left
      let top = box.top
      if (box.right < 40) left = 0
      if (box.left > vw - 40) left = Math.max(0, vw - 40)
      if (box.bottom < 28) top = 0
      if (box.top > vh - 28) top = Math.max(0, vh - 28)
      el.style.left = `${left}px`
      el.style.top = `${top}px`
      el.style.right = 'auto'
      el.style.bottom = 'auto'
    }
    function setCollapsed(on) {
      const el = document.querySelector('.lsb-title-quotes-float')
      if (!el) return
      el.classList.toggle('is-collapsed', !!on)
      el.style.minHeight = on ? '0px' : '360px'
      api.store.set('floatCollapsed', !!on)
      const btn = el.querySelector('[data-float-collapse]')
      if (btn) btn.textContent = on ? '展开' : '收起'
    }
    function unmountFloat() {
      document.querySelectorAll('.lsb-title-quotes-float').forEach((n) => n.remove())
    }
    function unmountFab() {
      document.querySelectorAll('.lsb-title-quotes-fab').forEach((n) => n.remove())
    }
    function shellOn() {
      return document.documentElement.classList.contains('lsb-skin-shell-on')
    }
    function syncFab() {
      if (shellOn()) unmountFab()
      else mountFab()
    }
    function bindChrome(el) {
      const head = el.querySelector('.lsb-title-quotes-float-head')
      head.addEventListener('pointerdown', (e) => {
        if (e.target.closest('button')) return
        const box = el.getBoundingClientRect()
        drag = { kind: 'move', dx: e.clientX - box.left, dy: e.clientY - box.top }
        e.preventDefault()
      })
      el.querySelector('.lsb-title-quotes-float-resize').addEventListener('pointerdown', (e) => {
        const box = el.getBoundingClientRect()
        drag = { kind: 'resize', x: e.clientX, y: e.clientY, w: box.width, h: box.height, l: box.left, t: box.top }
        e.preventDefault()
        e.stopPropagation()
      })
      el.querySelector('[data-float-close]').addEventListener('click', () => closeFloat())
      el.querySelector('[data-float-collapse]').addEventListener('click', () => {
        setCollapsed(!el.classList.contains('is-collapsed'))
      })
      el.addEventListener('wheel', onFloatWheel, { passive: false })
    }
    function onFloatWheel(e) {
      const dy = e.deltaY
      const root = e.currentTarget
      const scroller = e.target?.closest?.('.lsb-title-quotes-float-body')
      if (scroller && root.contains(scroller)) {
        const top = scroller.scrollTop
        const max = scroller.scrollHeight - scroller.clientHeight
        if ((dy < 0 && top > 0) || (dy > 0 && top < max - 0.5)) return
      }
      e.preventDefault()
    }
    function onPointerMove(e) {
      const el = document.querySelector('.lsb-title-quotes-float')
      if (!drag || !el) return
      if (drag.kind === 'move') {
        el.style.left = `${e.clientX - drag.dx}px`
        el.style.top = `${e.clientY - drag.dy}px`
        el.style.right = 'auto'
        el.style.bottom = 'auto'
      } else {
        el.style.left = `${drag.l}px`
        el.style.top = `${drag.t}px`
        el.style.width = `${Math.max(360, drag.w + (e.clientX - drag.x))}px`
        el.style.height = `${Math.max(360, drag.h + (e.clientY - drag.y))}px`
        el.style.right = 'auto'
        el.style.bottom = 'auto'
      }
    }
    function onPointerUp() {
      const el = document.querySelector('.lsb-title-quotes-float')
      if (drag && el) {
        clamp(el)
        persistRect(el)
      }
      drag = null
    }
    function onWinResize() {
      const el = document.querySelector('.lsb-title-quotes-float')
      if (el) clamp(el)
    }
    function onVis() {
      if (!api.store.get('floatOpen')) return
      if (pageVisible()) startBeatTimer()
      else stopBeatTimer()
    }
    function onKey(e) {
      if (e.key !== 'Escape') return
      if (document.querySelector('.lsb-panel')) return
      if (!api.store.get('floatOpen')) return
      closeFloat()
    }
    function mountFab() {
      let btn = document.querySelector('.lsb-title-quotes-fab')
      if (!btn) {
        btn = document.createElement('button')
        btn.className = 'lsb-title-quotes-fab'
        btn.type = 'button'
        btn.textContent = '行情'
        btn.title = '称号行情'
        btn.setAttribute('aria-label', '称号行情')
        document.body.append(btn)
        btn.addEventListener('click', () => openFloat())
      }
    }
    function mountFloat() {
      let el = document.querySelector('.lsb-title-quotes-float')
      if (!el) {
        el = document.createElement('div')
        el.className = 'lsb-title-quotes-float'
        el.innerHTML =
          `<div class="lsb-title-quotes-float-head"><strong>称号行情</strong>` +
          `<button type="button" class="lsb-btn" data-float-collapse>收起</button>` +
          `<button type="button" class="lsb-panel-close" data-float-close title="关闭">×</button></div>` +
          `<div class="lsb-title-quotes-float-body"></div>` +
          `<div class="lsb-title-quotes-float-resize"></div>`
        document.body.append(el)
        bindChrome(el)
      }
      applyRect(el)
      setCollapsed(!!api.store.get('floatCollapsed', false))
      return el
    }
    function closeFloat() {
      stopBeatTimer()
      const beat = api.store.get('watchBeat', null)
      if (beat && beat.id === tabId) {
        const off = { t: 0, id: tabId }
        api.store.set('watchBeat', off)
        api.tabs.post('watch', off)
      }
      api.store.set('floatOpen', false)
      unmountFloat()
      maybeReschedule()
    }
    function showFloat({ expand } = {}) {
      api.store.set('floatOpen', true)
      if (expand) api.store.set('floatCollapsed', false)
      const el = mountFloat()
      setCollapsed(!!api.store.get('floatCollapsed', false))
      const body = el.querySelector('.lsb-title-quotes-float-body')
      render(body)
      startBeatTimer()
      maybeReschedule()
    }
    function openFloat() {
      showFloat({ expand: true })
    }

    document.addEventListener('pointermove', onPointerMove)
    document.addEventListener('pointerup', onPointerUp)
    window.addEventListener('resize', onWinResize)
    document.addEventListener('keydown', onKey)
    document.addEventListener('visibilitychange', onVis)

    api.on('route:changed', () => {
      mountEmbed()
      if (isMarket()) scheduleForceSnap()
      syncFab()
    })
    api.on('plugin:activated', syncFab)
    api.on('plugin:disabled', syncFab)
    api.on('config:changed:skin', () => {
      queueMicrotask(syncFab)
    })
    const fabWatch = new MutationObserver(syncFab)
    fabWatch.observe(document.documentElement, { attributes: true, attributeFilter: ['class'] })
    mountEmbed()
    if (isMarket()) scheduleForceSnap()
    syncFab()
    if (api.store.get('floatOpen')) showFloat({ expand: false })
    api.handle('title-quotes:open', () => openFloat())

    api.onDispose(() => {
      if (timer) clearTimeout(timer)
      if (forceTimer) clearTimeout(forceTimer)
      if (sizeTimer) window.clearTimeout(sizeTimer)
      if (sizeWatch) sizeWatch.disconnect()
      sizeWatch = null
      stopBeatTimer()
      timer = null
      forceTimer = null
      document.removeEventListener('pointermove', onPointerMove)
      document.removeEventListener('pointerup', onPointerUp)
      window.removeEventListener('resize', onWinResize)
      document.removeEventListener('keydown', onKey)
      document.removeEventListener('visibilitychange', onVis)
      fabWatch.disconnect()
      unmountEmbed()
      unmountFloat()
      unmountFab()
    })

    api.ui.tab({
      name: '称号行情',
      order: 66,
      render(host) {
        api.ui.buildForm(host, manifest.config, api.config(), (v) => api.saveConfig(v))
        const row = document.createElement('div')
        row.className = 'lsb-actions'
        row.style.justifyContent = 'flex-start'
        row.style.borderTop = '0'
        const btn = document.createElement('button')
        btn.type = 'button'
        btn.className = 'lsb-btn is-primary'
        btn.textContent = '打开浮层'
        btn.addEventListener('click', () => openFloat())
        row.appendChild(btn)
        host.appendChild(row)
      },
    })

    api.ui.style(
        '.lsb-title-quotes-host{position:relative;min-width:0;width:100%;height:380px;min-height:240px;max-height:720px;resize:vertical;overflow:hidden;margin:2px 0 4px}' +
        '.lsb-title-quotes .lsb-svg,.lsb-title-quotes-embed .lsb-svg,.lsb-title-quotes-host .lsb-svg{display:block;width:100%;height:100%;max-width:none;color:var(--text,#222)}' +
        '.lsb-title-quotes-bar{cursor:crosshair}' +
        '.lsb-title-quotes-tip{position:absolute;z-index:4;display:none;pointer-events:none;font-size:12px;line-height:1.45;padding:6px 8px;border-radius:6px;background:var(--panel,#fff);color:var(--text,#222);border:1px solid var(--line,#ddd);box-shadow:0 6px 18px var(--shadow-medium,rgba(0,0,0,.18));white-space:pre-line;max-width:min(16em,calc(100% - 8px));overflow-wrap:anywhere;word-break:break-word}' +
        '.lsb-title-quotes-tip.is-on{display:block}' +
        '.lsb-title-quotes-anchors{display:grid;grid-template-columns:repeat(auto-fit,minmax(140px,1fr));gap:8px;margin:8px 0}' +
        '.lsb-title-quotes-pip{display:inline-block;width:7px;height:7px;border-radius:50%;margin-right:6px;vertical-align:0.1em}' +
        '.lsb-title-quotes-card{border:1px solid var(--line-soft,#eee);border-radius:8px;padding:8px 10px}' +
        '.lsb-title-quotes-card strong{display:block;font-size:16px;margin:2px 0}' +
        '.lsb-title-quotes-row{margin:6px 0;border:1px solid var(--line-soft,#eee);border-radius:8px;padding:6px 10px}' +
        '.lsb-title-quotes-row summary{cursor:pointer;display:flex;gap:8px;flex-wrap:wrap;align-items:baseline}' +
        '.lsb-title-quotes-row.is-off{opacity:.65}' +
        '.lsb-title-quotes-embed{margin:0 0 16px}' +
        '.lsb-title-quotes-fold{border:1px solid var(--line-soft,#eee);border-radius:8px;padding:8px 12px}' +
        '.lsb-title-quotes-fold-sum{cursor:pointer;display:flex;gap:8px;flex-wrap:wrap;align-items:baseline}' +
        '.lsb-title-quotes-chips{display:flex;flex-wrap:wrap;gap:6px;margin:8px 0}' +
        '.lsb-title-quotes-chip{padding:4px 10px;border:1px solid var(--line,#ddd);border-radius:6px;background:var(--bg,#fafafa);color:var(--text,#222);cursor:pointer;font-size:12px}' +
        '.lsb-title-quotes-chip:hover{border-color:var(--brand,#5eaaa0);color:var(--brand,#5eaaa0)}' +
        '.lsb-title-quotes-chip.is-primary{background:var(--brand,#5eaaa0);border-color:var(--brand,#5eaaa0);color:#fff}' +
        '.lsb-title-quotes-movers{display:grid;grid-template-columns:repeat(auto-fit,minmax(220px,1fr));gap:12px;margin:8px 0}' +
        '.lsb-title-quotes-mover{display:flex;gap:8px;justify-content:space-between;align-items:baseline;margin:4px 0;font-size:13px}' +
        '.lsb-title-quotes-name{border:0;background:none;padding:0;color:var(--brand,#5eaaa0);cursor:pointer;font:inherit;text-align:left}' +
        '.lsb-title-quotes-name:hover{text-decoration:underline}' +
        '.lsb-title-quotes-fab{position:fixed;right:62px;bottom:74px;z-index:99998;width:38px;height:38px;border-radius:50%;border:1px solid var(--line,#ddd);background:var(--panel,#fff);color:var(--brand,#5eaaa0);cursor:pointer;font-size:13px;font-weight:700;box-shadow:0 4px 12px var(--shadow-base,rgba(0,0,0,.15))}' +
        '.lsb-title-quotes-float{position:fixed;z-index:99990;display:flex;flex-direction:column;background:var(--panel,#fff);color:var(--text,#222);border:1px solid var(--line,#ddd);border-radius:10px;box-shadow:0 18px 48px var(--shadow-medium,rgba(0,0,0,.3));overflow:hidden;overscroll-behavior:contain}' +
        '.lsb-title-quotes-float-head{display:flex;align-items:center;gap:8px;padding:8px 10px;border-bottom:1px solid var(--line-soft,#eee);cursor:move;flex:0 0 auto}' +
        '.lsb-title-quotes-float-head strong{font-size:14px;margin-right:auto}' +
        '.lsb-title-quotes-float-head .lsb-panel-close{margin-left:0}' +
        '.lsb-title-quotes-float-body{flex:1;min-height:0;overflow:auto;overscroll-behavior:contain;padding:8px 12px}' +
        '.lsb-title-quotes-float-resize{position:absolute;right:0;bottom:0;width:14px;height:14px;cursor:nwse-resize}' +
        '.lsb-title-quotes-float.is-collapsed{height:auto !important;min-height:0 !important}' +
        '.lsb-title-quotes-float.is-collapsed .lsb-title-quotes-float-body,.lsb-title-quotes-float.is-collapsed .lsb-title-quotes-float-resize{display:none}',
    )

    api.handle('title-quotes:debug', () => ({
      parseCards,
      parsePageCount,
      mergeListings,
      foldTitles,
      median,
      pickAnchors,
      bookFromListings,
      diffBook,
      estimateFlow,
      sumFlow,
      flowTraded,
      BOOK_STALE_MS,
      periodMs,
      rangeCutoff,
      fmtBarTip,
      fmtPct,
      movers,
      boardPair,
      foldCandles,
      mean,
      snapshotIndex,
      indexPoints,
      foldIndexCandles,
      sma,
      stdevPop,
      bollinger,
      overlays,
      pushSnap,
      ingestListings,
      series: get,
      reset: () => {
        set([])
        api.store.set('book', null)
      },
      snap: () => cycle(true),
      intervalMs: pollMs,
      watching,
      watchBeat: () => api.store.get('watchBeat', null),
      setWatchBeat: (v) => api.store.set('watchBeat', v),
      openFloat,
      closeFloat,
      barMin: getBarMin,
      writeWatchBeat,
      tabId: () => tabId,
      armed: () => !!timer,
      lastErr: () => lastErr,
      lastAt: () => lastAt,
    }))

    return {}
  }

  const w = typeof unsafeWindow !== 'undefined' ? unsafeWindow : window
  if (w.LSB && w.LSB.register) w.LSB.register(manifest, setup)
  else {
    w.LSB_PLUGINS = w.LSB_PLUGINS || []
    w.LSB_PLUGINS.push({ manifest, setup })
  }
})()
