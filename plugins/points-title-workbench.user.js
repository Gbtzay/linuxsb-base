// ==UserScript==
// @name         LSB·积分-称号工作台
// @namespace    https://linux.sb/
// @version      0.1.0
// @description  统一查看积分、称号行情和 UR 合成规划
// @author       you
// @match        https://linux.sb/*
// @grant        none
// @run-at       document-end
// @noframes
// ==/UserScript==

(function () {
  'use strict'

  const SOURCE_KEYS = ['points', 'recipes', 'gacha', 'inventory', 'market']
  const SOURCE_NAMES = {
    points: '积分',
    recipes: '合成表',
    gacha: '抽取概率',
    inventory: '我的库存',
    market: '称号行情',
  }
  const SOURCE_TIMEOUT_MS = 10_000
  const DEFAULT_RECT = { left: 42, top: 56, width: 820, height: 650 }

  const manifest = {
    id: 'points-title-workbench',
    name: '积分-称号工作台',
    version: '0.1.0',
    description: '统一查看积分、称号行情和 UR 合成规划',
    author: 'you',
    requires: {
      base: '^0.2.2',
      plugins: {
        'points-ledger': '^1.0.2',
        'title-quotes': '^1.0.19',
        'title-forge-planner': '^0.1.0',
      },
    },
    permissions: ['read', 'storage', 'ui', 'events'],
  }

  function finite(value, fallback = null) {
    if (value == null || (typeof value === 'string' && !value.trim())) return fallback
    const n = Number(value)
    return Number.isFinite(n) ? n : fallback
  }

  function clone(value) {
    try {
      return JSON.parse(JSON.stringify(value))
    } catch {
      return null
    }
  }

  function clampRect(rect, viewport = {}) {
    const vw = Math.max(1, finite(viewport.width, 1024))
    const vh = Math.max(1, finite(viewport.height, 768))
    const rawWidth = finite(rect?.width, DEFAULT_RECT.width)
    const rawHeight = finite(rect?.height, DEFAULT_RECT.height)
    const minWidth = Math.min(320, Math.max(220, vw - 16))
    const minHeight = Math.min(360, Math.max(180, vh - 16))
    const width = Math.min(Math.max(minWidth, rawWidth), Math.max(minWidth, vw - 16))
    const height = Math.min(Math.max(minHeight, rawHeight), Math.max(minHeight, vh - 16))
    const left = Math.min(Math.max(0, finite(rect?.left, DEFAULT_RECT.left)), Math.max(0, vw - width))
    const top = Math.min(Math.max(0, finite(rect?.top, DEFAULT_RECT.top)), Math.max(0, vh - height))
    return { left, top, width, height }
  }

  function setup(api) {
    let refreshPromise = null
    let refreshController = null
    let windowEl = null
    let activeView = 'overview'
    let collapsed = api.store.get('collapsed', false) === true
    let calculatedAt = null
    let rect = clampRect(api.store.get('rect', DEFAULT_RECT), {
      width: window.innerWidth,
      height: window.innerHeight,
    })
    const sourceState = Object.fromEntries(SOURCE_KEYS.map((key) => [key, {
      status: 'idle',
      fetchedAt: null,
      error: null,
      stale: false,
      issues: [],
    }]))
    let data = {
      points: null,
      series: [],
      recipes: [],
      gachaPools: [],
      titleCatalog: [],
      inventory: {},
      inventoryAvailable: false,
      market: null,
    }
    let plans = null

    function currentPoints() {
      const raw = api.me?.points
      if (raw == null) return null
      if (Number(raw) === 0) {
        const rank = String(api.me?.rank || '')
        const separator = rank.lastIndexOf('·')
        const pointText = separator >= 0 ? rank.slice(separator + 1) : ''
        if (!/\d/.test(pointText)) return null
      }
      return finite(raw)
    }

    function esc(value) {
      return api.util.esc(String(value ?? ''))
    }

    function sourceHasData(key) {
      if (key === 'points') return Number.isFinite(Number(data.points))
      if (key === 'recipes') return Array.isArray(data.recipes) && data.recipes.length > 0
      if (key === 'gacha') return Array.isArray(data.gachaPools) && data.gachaPools.length > 0
      if (key === 'inventory') return data.inventoryAvailable === true
      return !!data.market
    }

    function setSource(key, patch) {
      if (!sourceState[key]) return
      Object.assign(sourceState[key], patch)
    }

    function normalizeError(key, error) {
      const text = String(error?.message || error || '数据不足')
      if (key === 'inventory') {
        if (/登录|库存|profile|challenge|挑战|cloudflare|格式|超时/i.test(text)) return '无法确认库存数据'
      }
      if (/页面|格式|selector|challenge|挑战|cloudflare|登录|超时/i.test(text)) return '页面格式无法识别'
      return text || '数据不足'
    }

    function sourceLabel(key) {
      const state = sourceState[key]
      const time = state.fetchedAt ? ` · ${new Date(state.fetchedAt).toLocaleString('zh-CN')}` : ''
      if (state.status === 'loading') return '读取中…'
      if (state.status === 'ok') return `已更新${time}`
      if (state.status === 'partial') return `部分可用${time}`
      if (state.status === 'stale') return `使用上次成功数据${time}`
      if (state.status === 'unavailable') return `${state.error || '数据不足'}${time}`
      return '未读取'
    }

    function saveSnapshot() {
      try {
        api.store.set('snapshot', {
          savedAt: Date.now(),
          sources: clone(sourceState),
          data: clone(data),
          plans: clone(plans),
          calculatedAt,
        })
      } catch {
        /* 存储失败不影响当前页面结果 */
      }
    }

    function restoreSnapshot() {
      const saved = api.store.get('snapshot', null)
      if (!saved?.data) return
      const value = saved.data
      data = {
        points: finite(value.points),
        series: Array.isArray(value.series) ? value.series : [],
        recipes: Array.isArray(value.recipes) ? value.recipes : [],
        gachaPools: Array.isArray(value.gachaPools) ? value.gachaPools : [],
        titleCatalog: Array.isArray(value.titleCatalog) ? value.titleCatalog : [],
        inventory: value.inventory && typeof value.inventory === 'object' ? value.inventory : {},
        inventoryAvailable: value.inventoryAvailable === true,
        market: value.market || null,
      }
      plans = value.plans || null
      calculatedAt = finite(value.calculatedAt)
      for (const key of SOURCE_KEYS) {
        if (sourceHasData(key)) {
          const old = saved.sources?.[key] || {}
          setSource(key, {
            status: 'stale',
            fetchedAt: finite(old.fetchedAt, finite(saved.savedAt)),
            stale: true,
            error: null,
          })
        }
      }
    }

    function refreshAbortError() {
      const error = new Error('刷新已取消')
      error.name = 'AbortError'
      return error
    }

    function withTimeout(job, timeoutMs = SOURCE_TIMEOUT_MS, signal = null) {
      let timer = null
      let settled = false
      return new Promise((resolve, reject) => {
        const cleanup = () => {
          if (timer) clearTimeout(timer)
          signal?.removeEventListener?.('abort', onAbort)
        }
        const finish = (fn, value) => {
          if (settled) return
          settled = true
          cleanup()
          fn(value)
        }
        const onAbort = () => finish(reject, refreshAbortError())
        if (signal?.aborted) {
          onAbort()
          return
        }
        signal?.addEventListener?.('abort', onAbort, { once: true })
        timer = setTimeout(() => finish(reject, new Error('读取超时')), timeoutMs)
        Promise.resolve()
          .then(job)
          .then(
            (value) => finish(resolve, value),
            (error) => finish(reject, error),
          )
      })
    }

    function ensureRefreshActive(signal) {
      if (signal?.aborted) throw refreshAbortError()
    }

    function applyPlannerSnapshot(result) {
      const sourceMap = result?.sources || {}
      const value = result?.data || {}
      for (const key of ['recipes', 'gacha', 'inventory']) {
        const loaded = sourceMap[key]
        const state = loaded || { status: 'unavailable', error: '数据不足', issues: [] }
        const has = sourceHasData(key)
        if (state.status === 'ok' || state.status === 'partial') {
          if (key === 'recipes') data.recipes = Array.isArray(value.recipes) ? value.recipes : []
          if (key === 'gacha') {
            data.gachaPools = Array.isArray(value.gachaPools) ? value.gachaPools : []
            data.titleCatalog = Array.isArray(value.titleCatalog) ? value.titleCatalog : []
          }
          if (key === 'inventory') {
            data.inventory = value.inventory && typeof value.inventory === 'object' ? value.inventory : {}
            data.inventoryAvailable = value.inventoryAvailable === true
          }
        }
        const fresh = state.status === 'ok' || state.status === 'partial'
        const previousFetchedAt = finite(state.fetchedAt, finite(sourceState[key].fetchedAt))
        const fetchedAt = fresh ? finite(state.fetchedAt, Date.now()) : has ? previousFetchedAt : null
        setSource(key, {
          status: fresh ? state.status : has ? 'stale' : 'unavailable',
          fetchedAt,
          error: state.error ? normalizeError(key, state.error) : null,
          stale: state.stale === true || !fresh,
          issues: Array.isArray(state.issues) ? state.issues : [],
        })
      }
    }

    function applyMarket(market) {
      if (!market || !Array.isArray(market.listings) || !market.titles) throw new Error('行情数据不足')
      if (market.coverage && market.coverage.complete !== true) throw new Error('称号行情数据不足')
      data.market = market
      setSource('market', {
        status: 'ok',
        fetchedAt: finite(market.fetchedAt, Date.now()),
        error: null,
        stale: false,
        issues: [],
      })
    }

    function refresh() {
      if (refreshPromise) return refreshPromise
      const controller = new AbortController()
      const signal = controller.signal
      refreshController = controller
      for (const key of SOURCE_KEYS) setSource(key, { status: 'loading', error: null, stale: false })
      paint()
      refreshPromise = (async () => {
        const jobs = {
          points: () => Promise.all([
            Promise.resolve(currentPoints()),
            api.request('points-ledger:series', { days: 90 }),
          ]),
          market: () => api.request('title-quotes:refresh'),
          planner: () => api.request('title-forge-planner:refresh'),
        }
        const entries = Object.entries(jobs)
        const results = await Promise.allSettled(entries.map(async ([key, job]) => [key, await withTimeout(job, SOURCE_TIMEOUT_MS, signal)]))
        ensureRefreshActive(signal)
        for (const [index, result] of results.entries()) {
          const key = result.status === 'fulfilled' ? result.value[0] : entries[index][0]
          if (result.status === 'fulfilled') {
            const value = result.value[1]
            if (key === 'points') {
              data.points = finite(value[0])
              data.series = Array.isArray(value[1]) ? value[1] : []
              setSource('points', { status: 'ok', fetchedAt: Date.now(), error: null, stale: false, issues: [] })
            } else if (key === 'market') {
              try {
                applyMarket(value)
              } catch (error) {
                const has = sourceHasData('market')
                setSource('market', { status: has ? 'stale' : 'unavailable', fetchedAt: Date.now(), error: normalizeError('market', error), stale: has })
              }
            } else if (key === 'planner') {
              applyPlannerSnapshot(value)
            }
          } else if (key === 'planner') {
            const message = normalizeError('planner', result.reason)
            const targets = ['recipes', 'gacha', 'inventory']
            for (const target of targets) {
              const has = sourceHasData(target)
              setSource(target, { status: has ? 'stale' : 'unavailable', fetchedAt: Date.now(), error: normalizeError(target, result.reason), stale: has, issues: [{ reason: message }] })
            }
          } else {
            const has = sourceHasData(key)
            const message = normalizeError(key, result.reason)
            setSource(key, { status: has ? 'stale' : 'unavailable', fetchedAt: Date.now(), error: message, stale: has, issues: [{ reason: message }] })
          }
        }
        ensureRefreshActive(signal)
        const input = {
          recipes: data.recipes,
          market: data.market || {},
          gachaPools: data.gachaPools,
          inventory: data.inventory,
          points: data.points,
        }
        try {
          plans = await api.request('title-forge-planner:calculate', input)
          ensureRefreshActive(signal)
          calculatedAt = Date.now()
        } catch (error) {
          if (signal.aborted) throw refreshAbortError()
          plans = null
          calculatedAt = null
          setSource('recipes', { error: normalizeError('recipes', error) })
        }
        ensureRefreshActive(signal)
        saveSnapshot()
        paint()
        return { sources: clone(sourceState), data: clone(data), plans: clone(plans), calculatedAt }
      })().finally(() => {
        if (refreshController === controller) refreshController = null
        refreshPromise = null
      })
      return refreshPromise
    }

    function routeText(route, kind) {
      if (!route || route.status === 'unavailable') {
        if (route?.reason === 'market-insufficient' && Array.isArray(route.missing) && route.missing.length) {
          const missing = route.missing.map((item) => `${item.name || item.key}还缺${finite(item.qty, 0)}个`).join('、')
          return `挂单不足：${missing}`
        }
        return kind === 'gacha' ? '数据不足' : '不可用'
      }
      if (route.status === 'insufficient') return `预计 ${Math.round(Number(route.cost || 0) * 100) / 100} 积分 · 还差 ${Math.round(Number(route.shortfall || 0) * 100) / 100} 积分`
      return `预计 ${Math.round(Number(route.cost || 0) * 100) / 100} 积分`
    }

    function routeSteps(route) {
      const steps = Array.isArray(route?.steps) ? route.steps : []
      const rows = []
      const marketGroups = new Map()
      for (const step of steps) {
        if (step.kind === 'market') {
          let group = marketGroups.get(step.key)
          if (!group) {
            group = { key: step.key, qty: 0, cost: 0, tiers: [] }
            marketGroups.set(step.key, group)
            rows.push({ kind: 'market', group })
          }
          const price = finite(step.price)
          const qty = finite(step.qty, 0)
          if (price == null || qty <= 0) continue
          let tier = group.tiers.find((item) => item.price === price)
          if (!tier) {
            tier = { price, qty: 0 }
            group.tiers.push(tier)
          }
          tier.qty += qty
          group.qty += qty
          group.cost += finite(step.cost, price * qty)
          continue
        }
        if (step.kind === 'median') rows.push({ text: `${step.key}：中位价 ${finite(step.price, '未知')} × ${finite(step.qty, 0)}` })
        else if (step.kind === 'inventory') rows.push({ text: `${step.key}：库存抵扣 ${finite(step.qty, 0)}` })
        else if (step.kind === 'gacha') rows.push({ text: `期望抽取 ${Math.round(Number(step.expectedDraws || 0) * 100) / 100} 次` })
      }
      const items = rows.map((row) => {
        if (row.text) return row.text
        const group = row.group
        const tiers = group.tiers.map((tier) => `${tier.qty} 个 × ${tier.price}`).join(' + ')
        return `${group.key}：${tiers}（合计 ${group.qty} 个，${Math.round(group.cost * 100) / 100} 积分）`
      })
      return items.length
        ? `<details data-workbench-route-steps><summary>查看步骤</summary><ul>${items.map((row) => `<li>${esc(row)}</li>`).join('')}</ul></details>`
        : ''
    }

    function renderRoutes(result) {
      const targets = Array.isArray(result?.targets) ? result.targets : []
      return targets.map((target) => {
        const routes = target.routes || {}
        return `<article data-workbench-target><h4>${esc(target.target?.name || target.target?.key || '未知 UR')}</h4>${[
          ['market-low', routes.marketLow],
          ['market-median', routes.marketMedian],
          ['gacha', routes.gacha],
        ].map(([kind, route]) => `<div data-workbench-route="${kind}" data-status="${esc(route?.status || 'unavailable')}"><b>${kind === 'market-low' ? '市场最低挂单' : kind === 'market-median' ? '市场中位价估算' : '抽取路线'}</b><span>${esc(routeText(route, kind))}</span>${kind === 'gacha' ? '<em>期望值，不保证实际结果</em>' : ''}${routeSteps(route)}</div>`).join('')}</article>`
      }).join('')
    }

    function renderMode(key, label, result) {
      const summary = result?.summary
      const summaryText = summary?.state === 'feasible'
        ? `当前可行：${summary.bestFeasible?.target?.name || '未知目标'}`
        : summary?.state === 'insufficient'
          ? `全部不足：${summary.nearest?.target?.name || '未知目标'}`
          : '无法判断'
      return `<section data-workbench-mode="${key}"><h3>${label}</h3><p>${esc(summaryText)}</p>${renderRoutes(result)}</section>`
    }

    function renderOverview() {
      const marketSampleCount = Array.isArray(data.market?.listings) ? data.market.listings.length : null
      return `<section data-workbench-view="overview"><div class="lsb-points-title-summary"><div><small>当前积分</small><strong>${esc(data.points == null ? '未知' : data.points)}</strong></div><div><small>行情样本</small><strong>${esc(marketSampleCount == null ? '未知' : marketSampleCount)}</strong></div><div><small>最后计算</small><strong>${esc(calculatedAt ? new Date(calculatedAt).toLocaleString('zh-CN') : '尚未刷新')}</strong></div></div>${renderMode('no-inventory', '不计库存', plans?.modes?.noInventory)}${renderMode('inventory', '计入当前库存', data.inventoryAvailable ? plans?.modes?.inventory : null)}</section>`
    }

    function pointsChart(series) {
      const rows = (Array.isArray(series) ? series : [])
        .map((row) => ({ t: finite(row?.t), p: finite(row?.p) }))
        .filter((row) => row.t != null && row.p != null)
        .slice(-366)
      if (rows.length < 2) return `<div class="lsb-empty">至少两次快照后开始绘制（当前 ${esc(rows.length)} 次）。</div>`
      const W = 620
      const H = 180
      const P = { l: 46, r: 12, t: 12, b: 28 }
      const values = rows.map((row) => row.p)
      const min = Math.min(...values)
      const max = Math.max(...values)
      const span = max - min || 1
      const x = (index) => P.l + (index / (rows.length - 1)) * (W - P.l - P.r)
      const y = (value) => P.t + (1 - (value - min) / span) * (H - P.t - P.b)
      const points = rows.map((row, index) => `${x(index).toFixed(1)},${y(row.p).toFixed(1)}`).join(' ')
      const changes = []
      for (let i = 1; i < rows.length; i++) {
        const delta = rows[i].p - rows[i - 1].p
        if (delta !== 0) changes.push({ t: rows[i].t, delta })
      }
      const recent = changes.slice(-5).reverse()
      return `<div class="lsb-points-title-workbench-chart"><svg class="lsb-svg" viewBox="0 0 ${W} ${H}" preserveAspectRatio="xMidYMid meet" role="img"><rect x="${P.l}" y="${P.t}" width="${W - P.l - P.r}" height="${H - P.t - P.b}" fill="none" stroke="var(--line-soft,#eee)"></rect><polyline points="${esc(points)}" fill="none" stroke="var(--brand,#5eaaa0)" stroke-width="2"></polyline>${rows.map((row, index) => `<circle cx="${x(index).toFixed(1)}" cy="${y(row.p).toFixed(1)}" r="2.5" fill="var(--brand,#5eaaa0)"></circle>`).join('')}<text x="${P.l - 6}" y="${y(max) + 4}" text-anchor="end" font-size="11" fill="var(--text-muted,#888)">${esc(max)}</text><text x="${P.l - 6}" y="${y(min) + 4}" text-anchor="end" font-size="11" fill="var(--text-muted,#888)">${esc(min)}</text></svg><div class="lsb-row-desc">最近变化：</div>${recent.length ? recent.map((change) => `<div class="lsb-row"><span>${esc(new Date(change.t).toLocaleString('zh-CN'))}</span><strong>${change.delta > 0 ? '+' : ''}${esc(change.delta)}</strong></div>`).join('') : '<div class="lsb-empty">暂无变化记录。</div>'}</div>`
    }

    function renderPoints() {
      return `<section data-workbench-view="points"><h3>积分</h3><p>当前积分：${esc(data.points == null ? '未知' : data.points)}</p>${pointsChart(data.series)}</section>`
    }

    function renderMarket() {
      const coverage = data.market?.coverage
      const coverageText = coverage?.complete === true
        ? `完整 ${esc(coverage.fetchedPages)}/${esc(coverage.expectedPages)} 页`
        : '行情数据不足'
      const fetchedAt = finite(data.market?.fetchedAt)
      const titles = data.market?.titles && typeof data.market.titles === 'object' ? data.market.titles : {}
      const rows = Object.entries(titles).slice(0, 240).map(([key, value]) => {
        const split = String(key).lastIndexOf('@')
        const name = split > 0 ? String(key).slice(0, split) : String(key)
        const rarity = split > 0 ? String(key).slice(split + 1) : ''
        const lo = finite(value?.lo)
        const mid = finite(value?.mid)
        const n = finite(value?.n)
        return `<article data-workbench-market-title><strong>${esc(name)}</strong><span>${esc(rarity)} · 最低挂单 ${esc(lo == null ? '未知' : lo)} · 中位价估算 ${esc(mid == null ? '未知' : mid)} · 挂单数量 ${esc(n == null ? '未知' : n)}</span></article>`
      }).join('')
      return `<section data-workbench-view="market"><h3>行情</h3><p>${esc(coverageText)}</p><p>更新时间：${esc(fetchedAt == null ? '未知' : new Date(fetchedAt).toLocaleString('zh-CN'))}</p>${rows || '<p>行情数据不足</p>'}</section>`
    }

    function renderForge() {
      return `<section data-workbench-view="forge"><h3>UR 规划</h3>${renderMode('no-inventory', '不计库存', plans?.modes?.noInventory)}${renderMode('inventory', '计入当前库存', data.inventoryAvailable ? plans?.modes?.inventory : null)}</section>`
    }

    let interaction = null

    function onPointerMove(event) {
      if (!interaction) return
      const dx = finite(event.clientX, interaction.startX) - interaction.startX
      const dy = finite(event.clientY, interaction.startY) - interaction.startY
      if (interaction.type === 'drag') {
        rect = clampRect({ ...interaction.base, left: interaction.base.left + dx, top: interaction.base.top + dy }, {
          width: window.innerWidth,
          height: window.innerHeight,
        })
      } else {
        rect = clampRect({ ...interaction.base, width: interaction.base.width + dx, height: interaction.base.height + dy }, {
          width: window.innerWidth,
          height: window.innerHeight,
        })
      }
      applyRect()
    }

    function onPointerUp() {
      if (!interaction) return
      interaction = null
      api.store.set('rect', rect)
    }

    function bindWindowInteractions() {
      const head = windowEl?.querySelector('.lsb-points-title-workbench-head')
      const resize = windowEl?.querySelector('.lsb-points-title-workbench-resize')
      head?.addEventListener('pointerdown', (event) => {
        if (event.target?.closest?.('button')) return
        interaction = { type: 'drag', startX: event.clientX, startY: event.clientY, base: { ...rect } }
      })
      resize?.addEventListener('pointerdown', (event) => {
        interaction = { type: 'resize', startX: event.clientX, startY: event.clientY, base: { ...rect } }
      })
    }

    function applyRect() {
      if (!windowEl) return
      const next = clampRect(rect, { width: window.innerWidth, height: window.innerHeight })
      rect = next
      windowEl.style.left = `${next.left}px`
      windowEl.style.top = `${next.top}px`
      windowEl.style.width = `${next.width}px`
      windowEl.style.height = `${next.height}px`
    }

    function paint() {
      if (!windowEl) return
      const active = activeView
      windowEl.classList.toggle('is-collapsed', collapsed)
      windowEl.innerHTML = `<div class="lsb-points-title-workbench-head"><strong>积分-称号工作台</strong><span>可拖动 · ${sourceLabel('market')}</span><button type="button" data-workbench-collapse>${collapsed ? '展开' : '收起'}</button><button type="button" data-workbench-refresh>刷新</button><button type="button" data-workbench-close>×</button></div><nav class="lsb-points-title-workbench-tabs">${[['overview', '总览'], ['points', '积分'], ['market', '行情'], ['forge', 'UR 规划']].map(([key, label]) => `<button type="button" data-workbench-tab="${key}" class="${active === key ? 'is-active' : ''}">${label}</button>`).join('')}</nav><div class="lsb-points-title-workbench-body"><div class="lsb-points-title-workbench-sources">${SOURCE_KEYS.map((key) => `<div data-workbench-source="${key}" class="${sourceState[key].status === 'loading' ? 'is-loading' : ''}"><b>${esc(SOURCE_NAMES[key])}</b><span>${esc(sourceLabel(key))}</span></div>`).join('')}</div>${active === 'overview' ? renderOverview() : active === 'points' ? renderPoints() : active === 'market' ? renderMarket() : renderForge()}</div><i class="lsb-points-title-workbench-resize" aria-hidden="true"></i>`
      windowEl.querySelectorAll('[data-workbench-tab]').forEach((button) => {
        button.addEventListener('click', () => {
          activeView = button.dataset.workbenchTab || 'overview'
          paint()
        })
      })
      windowEl.querySelector('[data-workbench-refresh]')?.addEventListener('click', () => refresh())
      windowEl.querySelector('[data-workbench-collapse]')?.addEventListener('click', () => {
        collapsed = !collapsed
        api.store.set('collapsed', collapsed)
        paint()
      })
      windowEl.querySelector('[data-workbench-close]')?.addEventListener('click', closeWindow)
      bindWindowInteractions()
      applyRect()
    }

    function openWindow() {
      if (!windowEl || !windowEl.isConnected) {
        windowEl = document.createElement('section')
        windowEl.className = 'lsb-points-title-workbench'
        windowEl.dataset.pointsTitleWorkbench = ''
        document.body.appendChild(windowEl)
      }
      activeView = 'overview'
      paint()
      return refresh()
    }

    function closeWindow() {
      refreshController?.abort()
      refreshController = null
      windowEl?.remove()
      windowEl = null
    }

    restoreSnapshot()

    api.ui.style(
      '.lsb-points-title-workbench{position:fixed;z-index:99990;display:flex;flex-direction:column;min-width:220px;min-height:180px;overflow:hidden;background:var(--panel,#fff);color:var(--text,#222);border:1px solid var(--line,#ddd);border-radius:10px;box-shadow:0 18px 48px var(--shadow-medium,rgba(0,0,0,.3))}.lsb-points-title-workbench-head{display:flex;align-items:center;gap:8px;padding:10px 12px;border-bottom:1px solid var(--line-soft,#eee);cursor:move}.lsb-points-title-workbench-head strong{margin-right:auto}.lsb-points-title-workbench-head button{border:1px solid var(--line,#ddd);background:transparent;color:inherit;border-radius:5px;cursor:pointer}.lsb-points-title-workbench-tabs{display:flex;gap:4px;padding:8px 10px 0;overflow-x:auto;border-bottom:1px solid var(--line-soft,#eee)}.lsb-points-title-workbench-tabs button{flex:0 0 auto;padding:7px 10px;border:0;border-bottom:2px solid transparent;background:transparent;color:inherit;cursor:pointer}.lsb-points-title-workbench-tabs button.is-active{border-bottom-color:var(--brand,#5eaaa0);font-weight:700}.lsb-points-title-workbench-body{min-height:0;flex:1;overflow:auto;padding:10px 12px}.lsb-points-title-workbench-sources{display:grid;grid-template-columns:repeat(auto-fit,minmax(130px,1fr));gap:6px;margin-bottom:10px}.lsb-points-title-workbench-sources>div{display:flex;flex-direction:column;gap:3px;padding:7px 8px;border:1px solid var(--line-soft,#eee);border-radius:7px}.lsb-points-title-workbench-sources span{font-size:11px;color:var(--muted,#777)}.lsb-points-title-workbench-sources .is-loading span{color:var(--warning,#a66)}.lsb-points-title-summary{display:grid;grid-template-columns:repeat(3,minmax(0,1fr));gap:8px;margin-bottom:10px}.lsb-points-title-summary>div{padding:10px;border:1px solid var(--line-soft,#eee);border-radius:8px}.lsb-points-title-summary small,.lsb-points-title-summary strong{display:block}.lsb-points-title-summary strong{margin-top:4px}.lsb-points-title-workbench-body section{margin:10px 0;padding:10px;border:1px solid var(--line-soft,#eee);border-radius:8px}.lsb-points-title-workbench-body article{padding:7px 0;border-top:1px solid var(--line-soft,#eee)}.lsb-points-title-workbench-body article h4{margin:0 0 5px}.lsb-points-title-workbench-body [data-workbench-route]{display:grid;grid-template-columns:150px 1fr;gap:5px;padding:4px 0}.lsb-points-title-workbench-body [data-workbench-route] span{color:var(--muted,#777)}.lsb-points-title-workbench-body [data-workbench-route] em{grid-column:2;color:var(--brand,#5eaaa0);font-size:12px}.lsb-points-title-workbench-body [data-workbench-route] details{grid-column:2;min-width:0}.lsb-points-title-workbench-body [data-workbench-route] details>ul{margin:4px 0 0;padding-left:18px}.lsb-points-title-workbench-body [data-workbench-route] details>ul>li+li{margin-top:3px}.lsb-points-title-workbench-resize{position:absolute;right:0;bottom:0;width:15px;height:15px;cursor:nwse-resize}.lsb-points-title-workbench.is-collapsed{height:auto !important;min-height:0 !important}.lsb-points-title-workbench.is-collapsed .lsb-points-title-workbench-tabs,.lsb-points-title-workbench.is-collapsed .lsb-points-title-workbench-body,.lsb-points-title-workbench.is-collapsed .lsb-points-title-workbench-resize{display:none}@media(max-width:760px){.lsb-points-title-workbench{width:calc(100vw - 16px) !important}.lsb-points-title-summary{grid-template-columns:repeat(2,minmax(0,1fr))}.lsb-points-title-workbench-body [data-workbench-route]{grid-template-columns:1fr}.lsb-points-title-workbench-body [data-workbench-route] em{grid-column:1}.lsb-points-title-workbench-body [data-workbench-route] details{grid-column:1}}',
    )

    api.handle('points-title-workbench:open', () => openWindow())
    api.handle('points-title-workbench:debug', () => ({
      clampRect,
      refresh,
      state: () => ({ rect: clone(rect), activeView, sourceState: clone(sourceState), data: clone(data), plans: clone(plans), calculatedAt }),
    }))

    const onResize = () => {
      rect = clampRect(rect, { width: window.innerWidth, height: window.innerHeight })
      api.store.set('rect', rect)
      applyRect()
    }
    window.addEventListener('resize', onResize)
    document.addEventListener('pointermove', onPointerMove)
    document.addEventListener('pointerup', onPointerUp)
    api.onDispose(() => {
      window.removeEventListener('resize', onResize)
      document.removeEventListener('pointermove', onPointerMove)
      document.removeEventListener('pointerup', onPointerUp)
      closeWindow()
    })
  }

  const w = typeof unsafeWindow !== 'undefined' ? unsafeWindow : window
  if (w.LSB && w.LSB.register) w.LSB.register(manifest, setup)
  else {
    w.LSB_PLUGINS = w.LSB_PLUGINS || []
    w.LSB_PLUGINS.push({ manifest, setup })
  }
})()
