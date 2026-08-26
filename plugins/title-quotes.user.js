// ==UserScript==
// @name         LSB·称号行情
// @namespace    https://linux.sb/
// @version      1.0.3
// @description  采集称号交易挂单的最低/最高与中位数，绘制全场锚点与各称号趋势。纯读，不提交购买。需要 LINUX.SB 基座。
// @author       you
// @match        https://linux.sb/*
// @grant        none
// @run-at       document-end
// @noframes
// ==/UserScript==

/**
 * 数据源：/gacha_market 在售卡片（按等级 × 价格升降各拉一页，躲开 100 条截断）。
 * 成交记录双方可见，不用。选择器只写在本文件。
 */
(function () {
  'use strict'

  const manifest = {
    id: 'title-quotes',
    name: '称号行情',
    version: '1.0.3',
    description: '称号交易挂单高低价与全场锚点趋势',
    author: 'you',
    requires: { base: '^0.1.0' },
    permissions: ['read', 'storage', 'ui', 'events'],
    config: {
      intervalMin: { type: 'number', label: '巡检间隔 (分钟)', default: 1 },
      keepDays: { type: 'number', label: '保留天数', default: 90 },
    },
  }

  const RARITIES = ['ur', 'ssr', 'sr', 'r', 'n']
  const SORTS = ['price_asc', 'price_desc']
  const MERGE_MS = 12 * 3600e3
  const FORCE_DEBOUNCE_MS = 5000
  const ROLES = [
    { id: 'hi', label: '最高', color: 'var(--danger,#d55)' },
    { id: 'midHi', label: '中位偏上', color: 'var(--warning,#c90)' },
    { id: 'midLo', label: '中位偏下', color: 'var(--brand,#5eaaa0)' },
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

  function setup(api) {
    const esc = api.util.esc
    let cfg = api.config()
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
    const get = () => api.store.get('series', []) || []
    const set = (a) => api.store.set('series', a)

    function pushSnap(snap, now = Date.now()) {
      const arr = get()
      const last = arr[arr.length - 1]
      if (last && snapSig(last) === snapSig(snap) && now - last.t < MERGE_MS) {
        last.t = Math.max(last.t, now)
        set(arr)
        return false
      }
      arr.push({ t: now, anchors: snap.anchors, titles: snap.titles })
      const deadline = now - cfg.keepDays * 864e5
      set(arr.filter((x) => x.t >= deadline))
      return true
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
      const sold = sections.find((s) => /在售交易/.test(s.querySelector('h2')?.textContent || ''))
      if (!sold) return
      let el = document.querySelector('.lsb-title-quotes-embed')
      if (!el) {
        el = document.createElement('section')
        el.className = 'lsb-title-quotes-embed'
        sold.parentNode.insertBefore(el, sold)
      }
      render(el)
    }

    function lines(points, keys) {
      if (points.length < 2) return ''
      const W = 620
      const H = 170
      const P = { l: 46, r: 12, t: 12, b: 22 }
      const vals = []
      for (const p of points) {
        for (const k of keys) if (p[k.id] != null) vals.push(p[k.id])
      }
      if (!vals.length) return ''
      const min = Math.min(...vals)
      const max = Math.max(...vals)
      const span = max - min || 1
      const X = (i) => P.l + (i / (points.length - 1)) * (W - P.l - P.r)
      const Y = (v) => P.t + (1 - (v - min) / span) * (H - P.t - P.b)
      const polylines = keys
        .map((k) => {
          const pts = points
            .map((p, i) => (p[k.id] == null ? null : `${X(i).toFixed(1)},${Y(p[k.id]).toFixed(1)}`))
            .filter(Boolean)
            .join(' ')
          if (!pts) return ''
          return `<polyline points="${pts}" fill="none" stroke="${k.color}" stroke-width="2"></polyline>`
        })
        .join('')
      return `
        <svg class="lsb-svg" viewBox="0 0 ${W} ${H}" preserveAspectRatio="xMidYMid meet" role="img" style="aspect-ratio:${W}/${H}">
          <rect x="${P.l}" y="${P.t}" width="${W - P.l - P.r}" height="${H - P.t - P.b}" fill="none" stroke="var(--line-soft,#eee)"></rect>
          ${polylines}
          <text x="${P.l - 6}" y="${Y(max) + 4}" text-anchor="end" font-size="11" fill="var(--text-muted,#888)">${max}</text>
          <text x="${P.l - 6}" y="${Y(min) + 4}" text-anchor="end" font-size="11" fill="var(--text-muted,#888)">${min}</text>
          <text x="${P.l}" y="${H - 6}" font-size="11" fill="var(--text-muted,#888)">${new Date(points[0].t).toLocaleDateString('zh-CN')}</text>
          <text x="${W - P.r}" y="${H - 6}" text-anchor="end" font-size="11" fill="var(--text-muted,#888)">${new Date(points[points.length - 1].t).toLocaleDateString('zh-CN')}</text>
        </svg>`
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
      const cutoff = Date.now() - rangeDays * 864e5
      const view = all.filter((x) => x.t >= cutoff)
      const chartSrc = view.length >= 2 ? view : all
      const anchors = latest?.anchors || []
      const byRole = Object.fromEntries(anchors.map((x) => [x.role, x]))
      const cards = ROLES.filter((r) => byRole[r.id])
        .map((r) => {
          const a = byRole[r.id]
          return `<div class="lsb-title-quotes-card">
            <span class="lsb-row-desc">${esc(r.label)}</span>
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
        marketChart = `<div class="lsb-title-quotes-host">${lines(pts, ROLES)}</div>`
      }

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
          const titleKeys = [
            { id: 'hi', color: 'var(--danger,#d55)' },
            { id: 'lo', color: 'var(--success,#3aa08f)' },
          ]
          const body =
            all.length >= 2
              ? `<div class="lsb-title-quotes-host">${lines(
                  chartSrc.map((s) => {
                    const t = s.titles && s.titles[k]
                    return { t: s.t, lo: t?.lo, hi: t?.hi }
                  }),
                  titleKeys,
                )}</div>`
              : ''
          const price = off ? '已下架' : `最低 ${lo} · 最高 ${hi} · 上架 ${cur.n ?? 0} 个`
          return `<details class="lsb-title-quotes-row${off ? ' is-off' : ''}">
            <summary><strong>${esc(meta.name)}</strong>
              <span class="lsb-row-desc">${esc(meta.rarity)} · ${esc(price)}</span></summary>
            ${body}
          </details>`
        })
        .join('')

      const rangeBtns = [7, 30, 90]
        .map(
          (d) =>
            `<button class="lsb-btn${rangeDays === d ? ' is-primary' : ''}" data-range="${d}">${d}天</button>`,
        )
        .join('')
      const isEmbed = host.classList.contains('lsb-title-quotes-embed')
      const keepOpen = isEmbed && !!host.querySelector('details.lsb-title-quotes-fold')?.open
      const head = isEmbed
        ? `<div class="lsb-cal-head"><span style="margin-left:auto;display:flex;gap:6px">${rangeBtns}</span></div>`
        : `<div class="lsb-cal-head">
          <strong>称号行情</strong>
          <span class="lsb-row-desc">${esc(statusLine())}</span>
          <span style="margin-left:auto;display:flex;gap:6px">${rangeBtns}</span>
        </div>`
      const inner = `
        ${head}
        <div class="lsb-title-quotes-anchors">${cards || ''}</div>
        ${marketChart}
        ${rows ? `<div class="lsb-title-quotes-list">${rows}</div>` : ''}`
      host.classList.add('lsb-title-quotes')
      host.innerHTML = isEmbed
        ? `<details class="lsb-title-quotes-fold"${keepOpen ? ' open' : ''}>
            <summary class="lsb-title-quotes-fold-sum"><strong>称号行情</strong>
              <span class="lsb-row-desc">${esc(statusLine())}</span></summary>
            <div class="lsb-title-quotes-fold-body">${inner}</div>
          </details>`
        : inner
      host.querySelectorAll('[data-range]').forEach((b) => {
        b.onclick = () => {
          rangeDays = Number(b.dataset.range)
          render(host)
        }
      })
    }

    function refreshViews() {
      mountEmbed()
      const panel = document.querySelector('.lsb-view')
      if (panel && panel.querySelector('.lsb-title-quotes, .lsb-title-quotes-anchors')) {
        /* 打开面板时由 tab render 负责；这里只刷新交易页 */
      }
    }

    async function cycle(force = false) {
      if (inflight) return inflight
      if (election.role === 'follower' && !force) return null
      inflight = (async () => {
        try {
          const lists = []
          for (const rarity of RARITIES) {
            for (const sort of SORTS) {
              const doc = await api.net.doc(`/gacha_market?rarity=${encodeURIComponent(rarity)}&sort=${sort}`)
              lists.push(parseCards(doc))
            }
          }
          const listings = mergeListings(lists)
          if (!listings.length) {
            lastErr = null
            return { empty: true }
          }
          const titles = foldTitles(listings)
          const anchors = pickAnchors(listings, titles)
          pushSnap({ anchors, titles })
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

    function scheduleNext() {
      if (timer) clearTimeout(timer)
      const ms = Math.max(250, Number(cfg.intervalMin) * 60000)
      timer = setTimeout(() => cycle(), ms)
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
      },
      jitter: 800,
    })

    api.on('route:changed', () => {
      mountEmbed()
      if (isMarket()) scheduleForceSnap()
    })
    mountEmbed()
    if (isMarket()) scheduleForceSnap()

    api.onDispose(() => {
      if (timer) clearTimeout(timer)
      if (forceTimer) clearTimeout(forceTimer)
      timer = null
      forceTimer = null
      unmountEmbed()
    })

    api.ui.tab({
      name: '称号行情',
      order: 66,
      render(host) {
        render(host)
      },
    })

    api.ui.style(
      '.lsb-title-quotes-host{min-width:0;width:100%;overflow:hidden}' +
        '.lsb-title-quotes .lsb-svg,.lsb-title-quotes-embed .lsb-svg{display:block;width:100%;height:auto;max-width:100%}' +
        '.lsb-title-quotes-anchors{display:grid;grid-template-columns:repeat(auto-fit,minmax(140px,1fr));gap:8px;margin:8px 0}' +
        '.lsb-title-quotes-card{border:1px solid var(--line-soft,#eee);border-radius:8px;padding:8px 10px}' +
        '.lsb-title-quotes-card strong{display:block;font-size:16px;margin:2px 0}' +
        '.lsb-title-quotes-row{margin:6px 0;border:1px solid var(--line-soft,#eee);border-radius:8px;padding:6px 10px}' +
        '.lsb-title-quotes-row summary{cursor:pointer;display:flex;gap:8px;flex-wrap:wrap;align-items:baseline}' +
        '.lsb-title-quotes-row.is-off{opacity:.65}' +
        '.lsb-title-quotes-embed{margin:0 0 16px}' +
        '.lsb-title-quotes-fold{border:1px solid var(--line-soft,#eee);border-radius:8px;padding:8px 12px}' +
        '.lsb-title-quotes-fold-sum{cursor:pointer;display:flex;gap:8px;flex-wrap:wrap;align-items:baseline}',
    )

    api.handle('title-quotes:debug', () => ({
      parseCards,
      mergeListings,
      foldTitles,
      median,
      pickAnchors,
      pushSnap,
      series: get,
      reset: () => set([]),
      snap: () => cycle(true),
      intervalMin: () => Number(cfg.intervalMin),
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
