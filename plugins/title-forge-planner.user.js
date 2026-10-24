// ==UserScript==
// @name         LSB·UR 合成规划
// @namespace    https://linux.sb/
// @version      0.1.0
// @description  根据配方、行情、抽取概率、积分和库存规划 UR 合成路径
// @author       you
// @match        https://linux.sb/*
// @grant        none
// @run-at       document-end
// @noframes
// ==/UserScript==

(function () {
  'use strict'

  const manifest = {
    id: 'title-forge-planner',
    name: 'UR 合成规划',
    version: '0.1.0',
    description: '根据配方、行情、抽取概率、积分和库存规划 UR 合成路径',
    author: 'you',
    requires: { base: '^0.2.2', plugins: { 'title-quotes': '^1.0.19' } },
    permissions: ['read', 'storage', 'ui', 'events'],
  }

  function toDocument(input) {
    if (typeof input === 'string') return new DOMParser().parseFromString(input, 'text/html')
    if (input?.querySelectorAll) return input
    return document
  }

  function textOf(el) {
    return (el?.textContent || '').trim()
  }

  function attrOrText(el, attr, pattern) {
    const value = el?.getAttribute?.(attr)
    if (value != null && String(value).trim()) return String(value).trim()
    const text = textOf(el)
    const match = text.match(pattern)
    return match ? match[1].trim() : ''
  }

  function numberAttrOrText(el, attr, pattern) {
    const raw = attrOrText(el, attr, pattern)
    if (!raw) return null
    const n = Number(raw.replace(/,/g, ''))
    return Number.isFinite(n) ? n : null
  }

  function classRarity(el) {
    const match = String(el?.className || '').match(/(?:^|\s)gacha-(?:title|pool-rarity)-(ur|ssr|sr|r|n)(?:\s|$)/i)
    return match ? match[1].toUpperCase() : ''
  }

  function titleParts(el) {
    const badge = el?.matches?.('.gacha-title-badge') ? el : el?.querySelector?.('.gacha-title-badge')
    const name = textOf(badge?.querySelector?.('.gacha-title-name')) || textOf(el?.querySelector?.('.gacha-title-name')) || ''
    const rarity = (textOf(badge?.querySelector?.('.gacha-title-rarity')) || textOf(el?.querySelector?.('.gacha-title-rarity')) || classRarity(badge) || classRarity(el)).toUpperCase()
    return { name, rarity }
  }

  function slashQuantity(el) {
    const match = textOf(el).match(/\s+([\d,]+)\s*\/\s*([\d,]+)\s*$/)
    if (!match) return null
    const owned = Number(match[1].replace(/,/g, ''))
    const qty = Number(match[2].replace(/,/g, ''))
    return Number.isFinite(owned) && Number.isFinite(qty) ? { owned, qty } : null
  }

  function countFromClass(el) {
    const match = String(el?.className || '').match(/(?:^|\s)gacha-pull-(\d+)(?:\s|$)/i)
    return match ? Number(match[1]) : null
  }

  function keyOf(name, rarity) {
    return `${name}@${rarity || ''}`
  }

  function issue(scope, reason, extra = {}) {
    return { scope, reason, ...extra }
  }

  function parseRecipes(input) {
    const root = toDocument(input)
    const recipes = []
    const issues = []
    const nodes = [...root.querySelectorAll('[data-gacha-recipe], .gacha-recipe-card')]
    if (!nodes.length) {
      return { recipes, issues: [issue('recipes', 'recipes-not-found')] }
    }
    for (const el of nodes) {
      const actualCard = el.matches?.('.gacha-recipe-card')
      const form = el.querySelector('form')
      const recipeId = form?.querySelector('[name="recipe_id"]')?.getAttribute('value')
      const id = (el.getAttribute('data-recipe-id') || '').trim() || recipeId?.trim() || `recipe-${recipes.length + issues.length + 1}`
      const targetBadge = actualCard ? el.querySelector('.gacha-recipe-target .gacha-title-badge') : null
      const targetTitle = titleParts(targetBadge)
      const targetName = targetTitle.name || attrOrText(el, 'data-target-name', /(?:目标|产出|结果)\s*[:：]?\s*(.+?)(?:\s+(?:UR|SSR|SR|R|N)\b|$)/i) ||
        textOf(el.querySelector('[data-gacha-target], .gacha-recipe-target, h1, h2, h3, h4, strong')).match(/^\s*(.+?)\s+(?:UR|SSR|SR|R|N)\b/i)?.[1]?.trim() ||
        textOf(el).match(/^\s*(.+?)\s+(?:UR|SSR|SR|R|N)\b/i)?.[1]?.trim() || ''
      const targetRarity = (targetTitle.rarity || attrOrText(el, 'data-target-rarity', /\b(UR|SSR|SR|R|N)\b/i)).toUpperCase()
      let fee = numberAttrOrText(el, 'data-fee', /(?:费用|消耗|积分)\s*[:：]?\s*([\d,]+(?:\.\d+)?)/)
      if (actualCard && fee == null) fee = 0
      if (targetRarity !== 'UR') continue
      const materials = actualCard ? [...el.querySelectorAll('.gacha-recipe-materials > span')] : [...el.querySelectorAll('[data-gacha-material]')]
      const inputs = []
      let invalid = false
      for (const material of materials) {
        const parsedTitle = titleParts(material)
        const slash = slashQuantity(material)
        const rawMaterial = textOf(material)
        const name = attrOrText(material, 'data-name', /^\s*(.+?)\s+(?:UR|SSR|SR|R|N)\b/i) ||
          parsedTitle.name ||
          (actualCard ? rawMaterial.replace(/\s+[\d,]+\s*\/\s*[\d,]+\s*$/, '').trim() : '')
        const rarity = (parsedTitle.rarity || attrOrText(material, 'data-rarity', /\b(UR|SSR|SR|R|N)\b/i)).toUpperCase()
        const qty = numberAttrOrText(material, 'data-qty', /[×x]\s*([\d,]+(?:\.\d+)?)/i) ?? slash?.qty
        if (!name || (!actualCard && !rarity) || !Number.isFinite(qty) || qty <= 0) {
          invalid = true
          break
        }
        inputs.push({ key: keyOf(name, rarity), name, rarity, qty })
      }
      if (!targetName || targetRarity !== 'UR' || !inputs.length || !Number.isFinite(fee) || fee < 0 || invalid) {
        issues.push(issue('recipe', 'recipe-incomplete', { id }))
        continue
      }
      recipes.push({
        id,
        target: { key: keyOf(targetName, targetRarity), name: targetName, rarity: targetRarity },
        inputs,
        fee,
      })
    }
    return { recipes, issues }
  }

  function parseGacha(input) {
    const root = toDocument(input)
    const pools = []
    const issues = []
    const titleCatalog = []
    const knownTitles = new Set()
    const addTitle = (name, rarity) => {
      if (!name || !rarity) return
      const key = keyOf(name, rarity)
      if (knownTitles.has(key)) return
      knownTitles.add(key)
      titleCatalog.push({ key, name, rarity })
    }
    const nodes = [...root.querySelectorAll('[data-gacha-pool]')]
    if (nodes.length) {
      for (const el of nodes) {
        const id = (el.getAttribute('data-pool-id') || '').trim() || `pool-${pools.length + issues.length + 1}`
        const label = (el.getAttribute('data-pool-label') || '').trim() || textOf(el.querySelector('[data-gacha-pool-label]')) || id
        const drawCost = numberAttrOrText(el, 'data-draw-cost', /(?:抽取|消耗|费用)\s*[:：]?\s*([\d,]+(?:\.\d+)?)/)
        const outcomes = []
        let invalid = false
        for (const outcome of el.querySelectorAll('[data-gacha-outcome]')) {
          const name = attrOrText(outcome, 'data-name', /^\s*(.+?)\s+(?:UR|SSR|SR|R|N)\b/i)
          const rarity = attrOrText(outcome, 'data-rarity', /\b(UR|SSR|SR|R|N)\b/i).toUpperCase()
          const probability = numberAttrOrText(outcome, 'data-probability', /([\d.]+)\s*%?/)
          const probabilitySource = outcome.getAttribute('data-probability') || textOf(outcome)
          const normalizedProbability = probability != null && /%/.test(probabilitySource) ? probability / 100 : probability
          if (!name || !rarity || !Number.isFinite(normalizedProbability) || normalizedProbability < 0 || normalizedProbability > 1) {
            invalid = true
            continue
          }
          addTitle(name, rarity)
          outcomes.push({ key: keyOf(name, rarity), name, rarity, probability: normalizedProbability })
        }
        const total = outcomes.reduce((sum, item) => sum + item.probability, 0)
        if (!Number.isFinite(drawCost) || drawCost <= 0 || !outcomes.length || invalid) {
          issues.push(issue('pool', 'pool-incomplete', { id }))
          continue
        }
        const probabilityComplete = Math.abs(total - 1) <= 1e-9
        if (!probabilityComplete) issues.push(issue('pool', 'probability-incomplete', { id, total }))
        pools.push({ id, label, drawCost, outcomes, probabilityComplete })
      }
      return { pools, titleCatalog, issues }
    }

    const rarityNodes = [...root.querySelectorAll('.gacha-pool-section .gacha-pool-rarity')]
    const allItems = [...root.querySelectorAll('.gacha-all-item')]
    if (!rarityNodes.length && !allItems.length) return { pools, titleCatalog, issues: [issue('gacha', 'pools-not-found')] }
    for (const item of allItems) {
      const title = titleParts(item)
      addTitle(title.name, title.rarity)
    }
    if (!rarityNodes.length || !titleCatalog.length) {
      return { pools, titleCatalog, issues: [issue('gacha', 'pool-incomplete')] }
    }

    const rates = new Map()
    let invalid = false
    for (const el of rarityNodes) {
      const rarity = (textOf(el.querySelector('.gacha-pool-rarity-label')) || classRarity(el)).toUpperCase()
      const countMatch = textOf(el.querySelector('.gacha-pool-rarity-count')).match(/([\d,]+)\s*种/)
      const rateMatch = textOf(el.querySelector('.gacha-pool-rarity-rate')).match(/([\d.]+)\s*%/)
      const count = countMatch ? Number(countMatch[1].replace(/,/g, '')) : null
      const probability = rateMatch ? Number(rateMatch[1]) / 100 : null
      if (!rarity || !Number.isInteger(count) || count < 0 || !Number.isFinite(probability) || probability < 0 || probability > 1) {
        invalid = true
        continue
      }
      rates.set(rarity, { count, probability })
    }

    const outcomes = []
    for (const title of titleCatalog) {
      const rate = rates.get(title.rarity)
      if (!rate || rate.count <= 0) continue
      outcomes.push({ ...title, probability: rate.probability / rate.count })
    }
    const total = [...rates.values()].reduce((sum, item) => sum + item.probability, 0)
    const positiveRatesMissingTitles = [...rates.entries()].some(([rarity, rate]) => rate.probability > 0 && (rate.count <= 0 || !titleCatalog.some((title) => title.rarity === rarity)))
    const probabilityComplete = !invalid && !positiveRatesMissingTitles && Math.abs(total - 1) <= 1e-9
    const costOptions = [...root.querySelectorAll('.gacha-pull-btn[data-cost]')].map((button) => {
      const cost = Number((button.getAttribute('data-cost') || '').replace(/,/g, ''))
      const count = countFromClass(button)
      return Number.isFinite(cost) && cost > 0 && Number.isFinite(count) && count > 0 ? cost / count : null
    }).filter((cost) => cost != null)
    const drawCost = costOptions.length ? Math.min(...costOptions) : null
    const id = 'standard'
    if (!Number.isFinite(drawCost) || drawCost <= 0 || !outcomes.length || !probabilityComplete) {
      issues.push(issue('pool', !probabilityComplete ? 'probability-incomplete' : 'pool-incomplete', { id, total }))
    }
    if (Number.isFinite(drawCost) && drawCost > 0 && outcomes.length) {
      pools.push({ id, label: '标准抽取（按页面概率和同稀有度数量均分）', drawCost, outcomes, probabilityComplete })
    }
    return { pools, titleCatalog, issues }
  }

  function parseInventory(input) {
    const root = toDocument(input)
    const inventory = {}
    const issues = []
    const actualPage = !!root.querySelector('.gacha-profile-page')
    const nodes = [...root.querySelectorAll('[data-gacha-owned], .gacha-profile-item')]
    if (!nodes.length) return { inventory, issues: [issue('inventory', 'inventory-not-found')], recognized: actualPage || !!root.querySelector('[data-gacha-profile]') }
    for (const el of nodes) {
      const actualItem = el.matches?.('.gacha-profile-item')
      const title = titleParts(el.querySelector('.gacha-profile-badge') || el)
      const raw = textOf(el)
      const name = attrOrText(el, 'data-name', /^\s*(.+?)\s+(?:UR|SSR|SR|R|N)\b/i) ||
        title.name ||
        (actualItem ? raw.match(/^\s*(.+?)(?:\s+\S+)?\s+\S+\s+×\s*[\d,]+/i)?.[1]?.trim() || '' : '')
      const rarity = (title.rarity || attrOrText(el, 'data-rarity', /\b(UR|SSR|SR|R|N)\b/i)).toUpperCase()
      const qtySource = actualItem ? el.querySelector('.gacha-status-tag') || el : el
      const qty = numberAttrOrText(qtySource, 'data-qty', /[×x]\s*([\d,]+(?:\.\d+)?)/i)
      if (!name || !rarity || !Number.isFinite(qty) || qty < 0) {
        issues.push(issue('inventory', 'inventory-entry-incomplete'))
        continue
      }
      const key = keyOf(name, rarity)
      inventory[key] = (inventory[key] || 0) + qty
    }
    return { inventory, issues, recognized: actualPage || !!root.querySelector('[data-gacha-profile]') }
  }

  function aggregateRequirements(inputs) {
    const out = new Map()
    for (const input of inputs || []) {
      if (!input || !input.key || !Number.isFinite(Number(input.qty)) || Number(input.qty) <= 0) continue
      const qty = Number(input.qty)
      const current = out.get(input.key)
      if (current) current.qty += qty
      else out.set(input.key, {
        key: input.key,
        name: input.name || String(input.key).split('@').slice(0, -1).join('@'),
        rarity: input.rarity || String(input.key).split('@').pop() || '',
        qty,
      })
    }
    return [...out.values()]
  }

  function missingInputs(inputs, inventory = {}) {
    const owned = inventory && typeof inventory === 'object' ? inventory : {}
    return aggregateRequirements(inputs).flatMap((input) => {
      const have = Number(owned[input.key])
      const qty = Math.max(0, input.qty - (Number.isFinite(have) && have > 0 ? have : 0))
      return qty > 0 ? [{ ...input, qty }] : []
    })
  }

  function planResult(status, cost, fee, steps, reason, currentPoints = null) {
    const points = currentPoints == null || !Number.isFinite(Number(currentPoints)) ? null : Number(currentPoints)
    const amount = Number.isFinite(Number(cost)) ? Number(cost) : null
    return {
      status,
      cost: amount,
      fee: Number.isFinite(Number(fee)) ? Number(fee) : null,
      steps: steps || [],
      reason: reason || null,
      currentPoints: points,
      remaining: points != null && amount != null ? Math.max(0, points - amount) : null,
      shortfall: points != null && amount != null ? Math.max(0, amount - points) : null,
    }
  }

  function applyPoints(plan, points) {
    if (!plan || plan.status === 'unavailable') {
      const out = planResult(plan?.status || 'unavailable', plan?.cost, plan?.fee, plan?.steps, plan?.reason, points)
      for (const key of ['expected', 'approximate', 'expectedDraws', 'expectedCost', 'poolChoices', 'missing']) {
        if (plan?.[key] !== undefined) out[key] = plan[key]
      }
      return out
    }
    const out = planResult(plan.status, plan.cost, plan.fee, plan.steps, plan.reason, points)
    for (const key of ['expected', 'approximate', 'expectedDraws', 'expectedCost', 'poolChoices', 'missing']) {
      if (plan[key] !== undefined) out[key] = plan[key]
    }
    if (out.currentPoints != null && out.cost != null && out.cost > out.currentPoints) out.status = 'insufficient'
    return out
  }

  function unavailable(reason, fee = null, steps = [], points = null) {
    return planResult('unavailable', null, fee, steps, reason, points)
  }

  function marketCost(requirements, listings, fee) {
    if (!Number.isFinite(Number(fee)) || Number(fee) < 0) return unavailable('fee-missing')
    const rows = aggregateRequirements(requirements)
    const byKey = new Map()
    for (let i = 0; i < (listings || []).length; i++) {
      const listing = listings[i]
      const price = Number(listing?.price)
      const qty = Number(listing?.qty)
      if (!listing?.key || !Number.isFinite(price) || price < 0 || !Number.isFinite(qty) || qty <= 0) continue
      if (!byKey.has(listing.key)) byKey.set(listing.key, [])
      byKey.get(listing.key).push({ key: listing.key, price, qty, index: i })
    }
    for (const group of byKey.values()) group.sort((a, b) => a.price - b.price || a.index - b.index)
    const steps = [{ kind: 'fee', fee: Number(fee), cost: Number(fee) }]
    const missing = []
    let total = Number(fee)
    for (const requirement of rows) {
      let remaining = requirement.qty
      for (const listing of byKey.get(requirement.key) || []) {
        if (remaining <= 0) break
        const qty = Math.min(remaining, listing.qty)
        const cost = qty * listing.price
        steps.push({ kind: 'market', key: requirement.key, price: listing.price, qty, cost })
        total += cost
        remaining -= qty
      }
      if (remaining > 0) missing.push({ ...requirement, qty: remaining })
    }
    if (missing.length) {
      const out = unavailable('market-insufficient', Number(fee), steps)
      out.missing = missing
      return out
    }
    return planResult('ok', total, Number(fee), steps, 'market-low')
  }

  function medianCost(requirements, titles, fee) {
    if (!Number.isFinite(Number(fee)) || Number(fee) < 0) return unavailable('fee-missing')
    const rows = aggregateRequirements(requirements)
    const steps = [{ kind: 'fee', fee: Number(fee), cost: Number(fee) }]
    let total = Number(fee)
    for (const requirement of rows) {
      const mid = Number(titles?.[requirement.key]?.mid)
      if (!Number.isFinite(mid) || mid < 0) return unavailable('median-missing', Number(fee), steps)
      const cost = mid * requirement.qty
      steps.push({ kind: 'median', key: requirement.key, price: mid, qty: requirement.qty, cost })
      total += cost
    }
    return planResult('ok', total, Number(fee), steps, 'market-median')
  }

  function recipeFor(key, recipes) {
    return (recipes || []).find((recipe) => recipe?.target?.key === key) || null
  }

  function expandNode(recipe, recipes, trail, scale, leaves, steps) {
    const recipeFee = Number(recipe?.fee)
    if (!Number.isFinite(recipeFee) || recipeFee < 0) return { fee: 0, issue: 'fee-missing' }
    steps.push({ kind: 'recipe', id: recipe.id, target: recipe.target, qty: scale, fee: recipeFee * scale })
    let fee = recipeFee * scale
    let issueReason = null
    for (const input of recipe.inputs || []) {
      const qty = Number(input.qty) * scale
      const child = recipeFor(input.key, recipes)
      if (!child) {
        const current = leaves.get(input.key)
        if (current) current.qty += qty
        else leaves.set(input.key, { ...input, qty })
        continue
      }
      if (trail.has(child.target.key)) {
        issueReason ||= 'recipe-cycle'
        steps.push({ kind: 'direct', key: input.key, name: input.name, rarity: input.rarity, qty })
        const current = leaves.get(input.key)
        if (current) current.qty += qty
        else leaves.set(input.key, { ...input, qty })
        continue
      }
      const nextTrail = new Set(trail)
      nextTrail.add(child.target.key)
      const nested = expandNode(child, recipes, nextTrail, qty, leaves, steps)
      fee += nested.fee
      issueReason ||= nested.issue
    }
    return { fee, issue: issueReason }
  }

  function expandRequirements(targetRecipe, recipes, inventory = {}, seen = new Set()) {
    const leaves = new Map()
    const steps = []
    const trail = new Set(seen || [])
    if (targetRecipe?.target?.key) trail.add(targetRecipe.target.key)
    const expanded = expandNode(targetRecipe, recipes || [], trail, 1, leaves, steps)
    const allRequirements = [...leaves.values()]
    const requirements = missingInputs(allRequirements, inventory)
    const owned = inventory && typeof inventory === 'object' ? inventory : {}
    for (const input of allRequirements) {
      const have = Number(owned[input.key])
      const used = Math.min(input.qty, Number.isFinite(have) && have > 0 ? have : 0)
      if (used > 0) steps.push({ kind: 'inventory', key: input.key, name: input.name, rarity: input.rarity, qty: used })
    }
    return {
      requirements,
      fee: expanded.fee,
      steps,
      issue: expanded.issue || null,
      reason: expanded.issue || null,
    }
  }

  function addRecipeContext(route, expansion, recipe) {
    if (!route || route.status === 'unavailable') return route
    const context = expansion?.steps?.length ? expansion.steps : [{ kind: 'recipe', id: recipe.id, target: recipe.target, qty: 1, fee: recipe.fee }]
    return { ...route, steps: [...context, ...route.steps] }
  }

  function bestRoute(routes) {
    const valid = (routes || []).filter((route) => route && route.status !== 'unavailable' && Number.isFinite(route.cost))
    if (!valid.length) return routes?.find(Boolean) || unavailable('no-route')
    return valid.slice().sort((a, b) => a.cost - b.cost || (a.reason === 'market-low' ? -1 : 1))[0]
  }

  function planMarket({ recipes = [], market = {}, inventory = {}, points = null } = {}) {
    const out = []
    for (const recipe of recipes || []) {
      if (!recipe?.target?.key || recipe.target.rarity !== 'UR') continue
      const direct = { requirements: missingInputs(recipe.inputs, inventory), fee: recipe.fee, steps: [] }
      const directLow = addRecipeContext(marketCost(direct.requirements, market?.listings || [], direct.fee), direct, recipe)
      const directMedian = addRecipeContext(medianCost(direct.requirements, market?.titles || {}, direct.fee), direct, recipe)
      const expanded = expandRequirements(recipe, recipes, inventory, new Set())
      const candidates = [directLow, directMedian]
      if (!expanded.issue) {
        candidates.push(addRecipeContext(marketCost(expanded.requirements, market?.listings || [], expanded.fee), expanded, recipe))
        candidates.push(addRecipeContext(medianCost(expanded.requirements, market?.titles || {}, expanded.fee), expanded, recipe))
      }
      const route = applyPoints(bestRoute(candidates), points)
      out.push({ target: recipe.target, recipe, route, routes: {
        marketLow: applyPoints(bestRoute([directLow, !expanded.issue ? candidates[2] : null]), points),
        marketMedian: applyPoints(bestRoute([directMedian, !expanded.issue ? candidates[3] : null]), points),
      } })
    }
    return out.sort((a, b) => (a.route.cost ?? Infinity) - (b.route.cost ?? Infinity) || a.target.key.localeCompare(b.target.key, 'zh-CN') || String(a.recipe.id).localeCompare(String(b.recipe.id)))
  }

  const MAX_EXACT_GACHA_STATES = 250000
  const APPROX_GACHA_STEPS = 2048

  function stateSpaceSize(rows, limit = MAX_EXACT_GACHA_STATES) {
    let size = 1
    for (const row of rows || []) {
      size *= Number(row?.qty || 0) + 1
      if (size > limit) return size
    }
    return size
  }

  function logFactorial(n) {
    let value = 0
    for (let i = 2; i <= n; i++) value += Math.log(i)
    return value
  }

  function poissonTailAtLeast(shape, mean, shapeLogFactorial) {
    if (!(mean > 0)) return 0
    const threshold = shape + 12 * Math.sqrt(shape + 1)
    if (mean > threshold) {
      let term = Math.exp(-mean)
      let sum = term
      for (let k = 1; k < shape; k++) {
        term *= mean / k
        sum += term
      }
      return Math.max(0, Math.min(1, 1 - sum))
    }
    let term = Math.exp(-mean + shape * Math.log(mean) - shapeLogFactorial)
    let sum = term
    for (let k = shape; k < shape + 10000; k++) {
      term *= mean / (k + 1)
      sum += term
      if (k > mean && term <= sum * 1e-15) break
    }
    return Math.max(0, Math.min(1, sum))
  }

  function approximateSinglePoolDraws(rows, pool) {
    const probabilities = new Map()
    for (const outcome of pool?.outcomes || []) {
      const probability = Number(outcome?.probability)
      if (!outcome?.key || !Number.isFinite(probability) || probability <= 0) continue
      probabilities.set(outcome.key, (probabilities.get(outcome.key) || 0) + probability)
    }
    const normalized = (rows || []).map((row) => ({
      qty: Number(row.qty),
      probability: Number(probabilities.get(row.key)),
      logFactorial: logFactorial(Number(row.qty)),
    }))
    if (normalized.some((row) => !Number.isInteger(row.qty) || row.qty < 1 || !(row.probability > 0))) return null
    const upper = Math.max(...normalized.map((row) => (row.qty + 12 * Math.sqrt(row.qty + 1)) / row.probability))
    if (!Number.isFinite(upper) || upper <= 0) return null
    const integrand = (time) => {
      let completed = 1
      for (const row of normalized) {
        completed *= poissonTailAtLeast(row.qty, row.probability * time, row.logFactorial)
        if (completed === 0) break
      }
      return Math.max(0, 1 - completed)
    }
    const integrate = (steps) => {
      const width = upper / steps
      let sum = integrand(0) + integrand(upper)
      for (let i = 1; i < steps; i++) sum += (i % 2 ? 4 : 2) * integrand(i * width)
      return sum * width / 3
    }
    let steps = APPROX_GACHA_STEPS
    let value = integrate(steps)
    for (let i = 0; i < 2; i++) {
      const next = integrate(steps * 2)
      if (Math.abs(next - value) <= Math.max(1e-6, Math.abs(next) * 1e-5)) {
        value = next
        break
      }
      value = next
      steps *= 2
    }
    return Number.isFinite(value) && value >= 0 ? value : null
  }

  function expectedGachaCost(requirements, pools, fee) {
    if (!Number.isFinite(Number(fee)) || Number(fee) < 0) return unavailable('fee-missing')
    const rows = aggregateRequirements(requirements)
    if (rows.some((row) => !Number.isInteger(row.qty) || row.qty < 1)) return unavailable('requirements-invalid', Number(fee))
    const validPools = []
    let sawIncomplete = false
    for (const pool of pools || []) {
      const drawCost = Number(pool?.drawCost)
      if (!Number.isFinite(drawCost) || drawCost <= 0 || !Array.isArray(pool?.outcomes) || pool.outcomes.length === 0) {
        sawIncomplete = true
        continue
      }
      const outcomes = pool.outcomes.filter((outcome) => {
        const p = Number(outcome?.probability)
        return outcome?.key && Number.isFinite(p) && p >= 0 && p <= 1
      })
      const total = outcomes.reduce((sum, outcome) => sum + Number(outcome.probability), 0)
      if (outcomes.length !== pool.outcomes.length || Math.abs(total - 1) > 1e-9 || pool.probabilityComplete === false) {
        sawIncomplete = true
        continue
      }
      validPools.push({ ...pool, drawCost, outcomes })
    }
    if (!validPools.length) return unavailable(sawIncomplete ? 'probability-incomplete' : 'gacha-unavailable', Number(fee))
    const estimatedStates = stateSpaceSize(rows)
    if (estimatedStates > MAX_EXACT_GACHA_STATES) {
      if (validPools.length !== 1) return unavailable('state-space-too-large', Number(fee))
      const pool = validPools[0]
      const expectedDraws = approximateSinglePoolDraws(rows, pool)
      if (!Number.isFinite(expectedDraws)) return unavailable('gacha-unavailable', Number(fee))
      const expectedCost = pool.drawCost * expectedDraws
      const steps = [
        { kind: 'fee', fee: Number(fee), cost: Number(fee) },
        { kind: 'gacha', expected: true, approximate: true, expectedDraws, expectedCost, choices: [{ poolId: pool.id || null, label: pool.label || pool.id || '', approximate: true }] },
      ]
      const result = planResult('ok', Number(fee) + expectedCost, Number(fee), steps, 'gacha')
      result.expected = true
      result.approximate = true
      result.expectedDraws = expectedDraws
      result.expectedCost = expectedCost
      result.poolChoices = steps[1].choices
      return result
    }
    const indexOf = new Map(rows.map((row, index) => [row.key, index]))
    const memo = new Map()
    const solve = (remaining) => {
      const stateKey = remaining.join(',')
      if (memo.has(stateKey)) return memo.get(stateKey)
      if (remaining.every((qty) => qty === 0)) {
        const done = { cost: 0, draws: 0, choices: [] }
        memo.set(stateKey, done)
        return done
      }
      let best = null
      for (const pool of validPools) {
        const transitions = new Map()
        for (const outcome of pool.outcomes) {
          const index = indexOf.get(outcome.key)
          if (index == null || remaining[index] <= 0) continue
          transitions.set(index, (transitions.get(index) || 0) + Number(outcome.probability))
        }
        const progressProbability = [...transitions.values()].reduce((sum, p) => sum + p, 0)
        if (!(progressProbability > 0)) continue
        let childCost = 0
        let childDraws = 0
        let valid = true
        for (const [index, probability] of transitions) {
          const next = remaining.slice()
          next[index] -= 1
          const child = solve(next)
          if (!child) {
            valid = false
            break
          }
          childCost += probability * child.cost
          childDraws += probability * child.draws
        }
        if (!valid) continue
        const candidate = {
          cost: (pool.drawCost + childCost) / progressProbability,
          draws: (1 + childDraws) / progressProbability,
          // 只保留当前状态的最优决策；把所有后续概率分支展开到 choices
          // 会产生指数级重复数组，真实 UR 配方会因此耗尽页面内存。
          choices: [{ poolId: pool.id || null, label: pool.label || pool.id || '', state: stateKey, progressProbability }],
        }
        if (!best || candidate.cost < best.cost || (candidate.cost === best.cost && candidate.draws < best.draws)) best = candidate
      }
      memo.set(stateKey, best)
      return best
    }
    const solved = solve(rows.map((row) => row.qty))
    if (!solved) return unavailable('gacha-unavailable', Number(fee))
    const steps = [
      { kind: 'fee', fee: Number(fee), cost: Number(fee) },
      { kind: 'gacha', expected: true, expectedDraws: solved.draws, expectedCost: solved.cost, choices: solved.choices },
    ]
    const result = planResult('ok', Number(fee) + solved.cost, Number(fee), steps, 'gacha')
    result.expected = true
    result.expectedDraws = solved.draws
    result.expectedCost = solved.cost
    result.poolChoices = solved.choices
    return result
  }

  function resolveRecipeRarities(recipes, titleCatalog = [], fallbackKeys = []) {
    const byName = new Map()
    for (const title of titleCatalog || []) {
      if (!title?.name || !title?.rarity) continue
      if (!byName.has(title.name)) byName.set(title.name, new Set())
      byName.get(title.name).add(String(title.rarity).toUpperCase())
    }
    for (const key of fallbackKeys || []) {
      const value = String(key || '')
      const split = value.lastIndexOf('@')
      if (split <= 0) continue
      const name = value.slice(0, split)
      const rarity = value.slice(split + 1).toUpperCase()
      if (!name || !rarity) continue
      if (!byName.has(name)) byName.set(name, new Set())
      byName.get(name).add(rarity)
    }
    return (recipes || []).map((recipe) => ({
      ...recipe,
      inputs: (recipe.inputs || []).map((input) => {
        if (input?.rarity) return input
        const rarities = [...(byName.get(input?.name) || [])]
        if (rarities.length !== 1) return input
        const rarity = rarities[0]
        return { ...input, rarity, key: keyOf(input.name, rarity) }
      }),
    }))
  }

  function summarizeMode(targets, points) {
    const valid = (targets || []).filter((target) => target?.best && target.best.status !== 'unavailable' && Number.isFinite(target.best.cost))
    const ordered = valid.slice().sort((a, b) => a.best.cost - b.best.cost || a.target.key.localeCompare(b.target.key, 'zh-CN') || String(a.recipe.id).localeCompare(String(b.recipe.id)))
    const summaryEntry = (target) => target ? { ...target, route: target.best, cost: target.best.cost, shortfall: target.best.shortfall } : null
    const nearest = summaryEntry(ordered[0])
    if (points == null || !Number.isFinite(Number(points))) return { state: 'unknown', bestFeasible: null, nearest }
    const feasible = ordered.filter((target) => target.best.cost <= Number(points))
    if (feasible.length) return { state: 'feasible', bestFeasible: summaryEntry(feasible[0]), nearest }
    return { state: ordered.length ? 'insufficient' : 'unknown', bestFeasible: null, nearest }
  }

  function buildTargetPlan(recipe, recipes, market, gachaPools, inventory, points) {
    const direct = { requirements: missingInputs(recipe.inputs, inventory), fee: recipe.fee, steps: [] }
    const expanded = expandRequirements(recipe, recipes, inventory, new Set())
    const lowCandidates = [
      addRecipeContext(marketCost(direct.requirements, market?.listings || [], direct.fee), direct, recipe),
    ]
    const medianCandidates = [
      addRecipeContext(medianCost(direct.requirements, market?.titles || {}, direct.fee), direct, recipe),
    ]
    const gachaCandidates = [
      addRecipeContext(expectedGachaCost(direct.requirements, gachaPools, direct.fee), direct, recipe),
    ]
    if (!expanded.issue) {
      lowCandidates.push(addRecipeContext(marketCost(expanded.requirements, market?.listings || [], expanded.fee), expanded, recipe))
      medianCandidates.push(addRecipeContext(medianCost(expanded.requirements, market?.titles || {}, expanded.fee), expanded, recipe))
      gachaCandidates.push(addRecipeContext(expectedGachaCost(expanded.requirements, gachaPools, expanded.fee), expanded, recipe))
    }
    const routes = {
      marketLow: applyPoints(bestRoute(lowCandidates), points),
      marketMedian: applyPoints(bestRoute(medianCandidates), points),
      gacha: applyPoints(bestRoute(gachaCandidates), points),
    }
    return {
      target: recipe.target,
      recipe,
      routes,
      best: applyPoints(bestRoute(Object.values(routes)), points),
    }
  }

  function calculatePlans({ recipes = [], market = {}, gachaPools = [], inventory = {}, points = null } = {}) {
    const buildMode = (owned) => {
      const targets = (recipes || [])
        .filter((recipe) => recipe?.target?.rarity === 'UR')
        .map((recipe) => buildTargetPlan(recipe, recipes, market, gachaPools, owned, points))
        .sort((a, b) => a.target.key.localeCompare(b.target.key, 'zh-CN') || String(a.recipe.id).localeCompare(String(b.recipe.id)))
      return { targets, summary: summarizeMode(targets, points) }
    }
    return {
      modes: {
        noInventory: buildMode({}),
        inventory: buildMode(inventory || {}),
      },
      points: points == null || !Number.isFinite(Number(points)) ? null : Number(points),
    }
  }

  const SOURCE_NAMES = {
    recipes: '合成表',
    gacha: '抽取概率',
    inventory: '我的库存',
    market: '称号行情',
  }

  const SOURCE_TIMEOUT_MS = 10_000

  // ═══════════════════════════════════════════════════════════
  // 章节索引（1077 行，只读 UR 规划数据源，UI 已移至工作台）：
  //   A: 配方/概率/库存读取 B: calculate/refresh RPC
  // ═══════════════════════════════════════════════════════════
  function setup(api) {
    const sourceState = Object.fromEntries(Object.keys(SOURCE_NAMES).map((key) => [key, {
      status: 'idle', fetchedAt: null, error: null, stale: false, issues: [],
    }]))
    let data = { recipes: [], gachaPools: [], titleCatalog: [], inventory: {}, inventoryAvailable: false, market: null }
    let hostRef = null
    let refreshPromise = null
    let hasRendered = false
    let calculatedAt = null

    function cloneData(value) {
      try {
        return JSON.parse(JSON.stringify(value))
      } catch {
        return null
      }
    }

    function sourceMessage(error) {
      if (error?.message) return String(error.message)
      return String(error || '数据不足')
    }

    function classifyDocument(doc) {
      const body = String(doc?.body?.textContent || doc?.documentElement?.textContent || '').trim()
      if (/cloudflare|checking your browser|challenge/i.test(body)) return '挑战未完成'
      if (/登录|请先登录|log\s*in|sign\s*in/i.test(body) && !doc?.querySelector('[data-gacha-recipe], [data-gacha-pool], [data-gacha-owned]')) return '需要登录'
      return null
    }

    function sourceError(message) {
      const error = new Error(message)
      error.sourceMessage = message
      return error
    }

    function withSourceTimeout(job, timeoutMs = SOURCE_TIMEOUT_MS) {
      const controller = new AbortController()
      const parent = api.signal
      const forwardAbort = () => controller.abort(parent?.reason)
      if (parent?.aborted) forwardAbort()
      else parent?.addEventListener?.('abort', forwardAbort, { once: true })
      let timer = null
      const cleanup = () => {
        if (timer) clearTimeout(timer)
        parent?.removeEventListener?.('abort', forwardAbort)
      }
      return new Promise((resolve, reject) => {
        timer = setTimeout(() => {
          controller.abort()
          cleanup()
          reject(sourceError('读取超时'))
        }, timeoutMs)
        Promise.resolve()
          .then(() => job(controller.signal))
          .then(
            (value) => {
              cleanup()
              resolve(value)
            },
            (error) => {
              cleanup()
              reject(error)
            },
          )
      })
    }

    function setSource(key, patch) {
      Object.assign(sourceState[key], patch)
    }

    function hasSourceData(key) {
      if (key === 'recipes') return data.recipes.length > 0
      if (key === 'gacha') return data.gachaPools.length > 0
      if (key === 'inventory') return data.inventoryAvailable
      return !!data.market
    }

    function restoreCache() {
      const cached = api.store.get('snapshot', null)
      if (!cached?.data) return
      const saved = cached.data
      data = {
        recipes: Array.isArray(saved.recipes) ? saved.recipes : [],
        gachaPools: Array.isArray(saved.gachaPools) ? saved.gachaPools : [],
        titleCatalog: Array.isArray(saved.titleCatalog) ? saved.titleCatalog : [],
        inventory: saved.inventory && typeof saved.inventory === 'object' ? saved.inventory : {},
        inventoryAvailable: saved.inventoryAvailable === true,
        market: saved.market || null,
      }
      for (const key of Object.keys(SOURCE_NAMES)) {
        if (hasSourceData(key)) setSource(key, { status: 'stale', stale: true, fetchedAt: cached.savedAt || null })
      }
    }

    async function loadSources() {
      const jobs = {
        recipes: async (signal) => {
          const doc = await api.net.doc('/gacha_recipes', { signal })
          const failure = classifyDocument(doc)
          if (failure) throw sourceError(failure)
          const parsed = parseRecipes(doc)
          if (!parsed.recipes.length) throw sourceError(parsed.issues[0]?.reason === 'recipes-not-found' ? '页面格式无法识别' : '数据不足')
          return { value: parsed, partial: parsed.issues.length > 0 }
        },
        gacha: async (signal) => {
          const doc = await api.net.doc('/gacha', { signal })
          const failure = classifyDocument(doc)
          if (failure) throw sourceError(failure)
          const parsed = parseGacha(doc)
          if (!parsed.pools.length) throw sourceError(parsed.issues[0]?.reason === 'pools-not-found' ? '页面格式无法识别' : '数据不足')
          return { value: parsed, partial: parsed.issues.length > 0 }
        },
        inventory: async (signal) => {
          const doc = await api.net.doc('/gacha_profile', { signal })
          const failure = classifyDocument(doc)
          if (failure) throw sourceError(failure)
          const parsed = parseInventory(doc)
          if (!parsed.recognized) {
            throw sourceError(parsed.issues[0]?.reason === 'inventory-not-found' ? '页面格式无法识别' : '数据不足')
          }
          return { value: parsed, partial: parsed.issues.length > 0 }
        },
        market: async () => {
          const market = await api.request('title-quotes:market-data')
          if (!market || !Array.isArray(market.listings) || !market.titles || !Number.isFinite(Number(market.fetchedAt))) throw sourceError('数据不足')
          return { value: market, fetchedAt: Number(market.fetchedAt), partial: false }
        },
      }
      const entries = Object.entries(jobs)
      const results = await Promise.allSettled(entries.map(async ([key, job]) => [key, await withSourceTimeout(job)]))
      for (let i = 0; i < results.length; i++) {
        const result = results[i]
        const key = entries[i][0]
        if (result.status === 'fulfilled') {
          const loaded = result.value[1]
          const parsed = loaded.value
          if (key === 'recipes') data.recipes = parsed.recipes
          else if (key === 'gacha') {
            data.gachaPools = parsed.pools
            data.titleCatalog = parsed.titleCatalog || []
          } else if (key === 'inventory') {
            data.inventory = parsed.inventory
            data.inventoryAvailable = true
          } else data.market = parsed
          setSource(key, {
            status: loaded.partial ? 'partial' : 'ok',
            fetchedAt: loaded.fetchedAt || Date.now(),
            error: null,
            stale: false,
            issues: parsed.issues || [],
          })
        } else {
          const message = sourceMessage(result.reason)
          setSource(key, {
            status: hasSourceData(key) ? 'stale' : 'unavailable',
            error: message,
            stale: hasSourceData(key),
          })
        }
      }
      data.recipes = resolveRecipeRarities(
        data.recipes,
        data.titleCatalog,
        [
          ...Object.keys(data.market?.titles || {}),
          ...Object.keys(data.inventory || {}),
        ],
      )
      calculatedAt = Date.now()
      try {
        api.store.set('snapshot', { savedAt: Date.now(), data: cloneData(data) })
      } catch {
        /* storage failure does not invalidate current in-memory results */
      }
      return {
        sources: cloneData(sourceState),
        data: cloneData(data),
      }
    }

    function snapshot() {
      return {
        sources: cloneData(sourceState),
        data: cloneData(data),
      }
    }

    function publicSnapshot() {
      const full = snapshot()
      const sources = Object.fromEntries(['recipes', 'gacha', 'inventory'].map((key) => [key, full.sources[key]]))
      const data = { ...full.data }
      delete data.market
      return { sources, data }
    }

    function refresh() {
      if (refreshPromise) return refreshPromise
      for (const key of Object.keys(SOURCE_NAMES)) setSource(key, { status: 'loading', error: null })
      paint(hostRef)
      refreshPromise = loadSources().finally(() => {
        refreshPromise = null
        paint(hostRef)
      })
      return refreshPromise
    }

    function esc(value) {
      return api.util.esc(String(value ?? ''))
    }

    function sourceLabel(key) {
      const state = sourceState[key]
      const time = state.fetchedAt ? ` · 最后更新 ${new Date(state.fetchedAt).toLocaleString('zh-CN')}` : ''
      if (state.status === 'loading') return '读取中…'
      if (state.status === 'ok') return `已更新${time}`
      if (state.status === 'partial') return `部分可用${time}`
      if (state.status === 'stale') return `使用上次成功数据${time}`
      if (state.status === 'unavailable') return `${state.error || '数据不足'}${time}`
      return '未读取'
    }

    function routeText(route, key) {
      if (!route || route.status === 'unavailable') {
        if (route?.reason === 'market-insufficient') {
          const missing = (Array.isArray(route.missing) ? route.missing : [])
            .map((row) => `${row.name || row.key}还缺${Math.round(Number(row.qty) * 100) / 100}个`)
            .join('、')
          return `挂单不足${missing ? `：${missing}` : ''}`
        }
        return key === 'gacha' ? '数据不足' : '不可用'
      }
      const cost = Number.isFinite(route.cost) ? `预计 ${Math.round(route.cost * 100) / 100} 积分` : '成本未知'
      if (route.status === 'insufficient') return `${cost} · 还差 ${Math.round((route.shortfall || 0) * 100) / 100} 积分`
      if (route.currentPoints == null) return cost
      return `${cost} · 剩余 ${Math.round((route.remaining || 0) * 100) / 100} 积分`
    }

    function routeHtml(route, key) {
      const label = key === 'marketLow' ? '市场最低挂单' : key === 'marketMedian' ? '市场中位价估算' : '抽取路线'
      const note = key === 'gacha' ? route?.approximate ? '近似期望值，不保证实际结果' : '期望值，不保证实际结果' : ''
      const steps = route?.status === 'unavailable' ? '' : (() => {
        const rows = []
        const marketGroups = new Map()
        for (const step of Array.isArray(route?.steps) ? route.steps : []) {
          if (step.kind === 'market') {
            let group = marketGroups.get(step.key)
            if (!group) {
              group = { key: step.key, qty: 0, cost: 0, tiers: [] }
              marketGroups.set(step.key, group)
              rows.push({ kind: 'market', group })
            }
            const price = Number(step.price)
            let tier = group.tiers.find((item) => item.price === price)
            if (!tier) {
              tier = { price, qty: 0 }
              group.tiers.push(tier)
            }
            tier.qty += Number(step.qty) || 0
            group.qty += Number(step.qty) || 0
            group.cost += Number(step.cost) || 0
            continue
          }
          if (step.kind === 'median') rows.push({ html: `<li>${esc(step.key)}：中位价 ${esc(step.price)} × ${esc(step.qty)}</li>` })
          else if (step.kind === 'inventory') rows.push({ html: `<li>${esc(step.key)}：库存抵扣 ${esc(step.qty)}</li>` })
          else if (step.kind === 'gacha') rows.push({ html: `<li>期望抽取 ${esc(Math.round((step.expectedDraws || 0) * 100) / 100)} 次</li>` })
        }
        return rows.map((row) => {
          if (row.html) return row.html
          const group = row.group
          const tiers = group.tiers.map((tier) => `${esc(tier.qty)} 个 × ${esc(tier.price)}`).join(' + ')
          return `<li>${esc(group.key)}：${tiers}（合计 ${esc(group.qty)} 个，${esc(Math.round(group.cost * 100) / 100)} 积分）</li>`
        }).join('')
      })()
      const selectorKey = key === 'marketLow' ? 'market-low' : key === 'marketMedian' ? 'market-median' : 'gacha'
      return `<div class="lsb-title-forge-planner-plan" data-title-forge-planner-plan="${esc(selectorKey)}"><strong>${esc(label)}</strong><span>${esc(routeText(route, key))}</span>${note ? `<em>${esc(note)}</em>` : ''}${steps ? `<details><summary>查看步骤</summary><ul>${steps}</ul></details>` : ''}</div>`
    }

    function modeHtml(modeKey, modeName, result) {
      if (!result) return `<section data-title-forge-planner-mode="${esc(modeKey)}"><h3>${esc(modeName)}</h3><p>无法判断：合成表数据不足。</p></section>`
      const summary = result.summary
      let summaryText = '无法判断'
      if (summary.state === 'feasible') summaryText = `当前可行：${summary.bestFeasible.target.name}，${routeText(summary.bestFeasible.route, summary.bestFeasible.route.reason === 'gacha' ? 'gacha' : summary.bestFeasible.route.reason === 'market-median' ? 'marketMedian' : 'marketLow')}`
      else if (summary.state === 'insufficient' && summary.nearest) summaryText = `全部不足：${summary.nearest.target.name}，最小缺口 ${Math.round((summary.nearest.shortfall || 0) * 100) / 100} 积分`
      const targetRows = result.targets.map((target) => `<article data-title-forge-planner-target><h4>${esc(target.target.name)} <small>${esc(target.recipe.id)}</small></h4>${routeHtml(target.routes.marketLow, 'marketLow')}${routeHtml(target.routes.marketMedian, 'marketMedian')}${routeHtml(target.routes.gacha, 'gacha')}</article>`).join('')
      return `<section class="lsb-title-forge-planner-mode" data-title-forge-planner-mode="${esc(modeKey)}"><h3>${esc(modeName)}</h3><p class="lsb-title-forge-planner-summary">${esc(summaryText)}</p>${targetRows || '<p>无法判断：没有可解析的 UR 配方。</p>'}</section>`
    }

    function paint(host) {
      if (!host) return
      host.innerHTML = `<div class="lsb-title-forge-planner" data-title-forge-planner><div class="lsb-title-forge-planner-head"><strong>UR 合成规划</strong><span>当前积分：${esc(api.me.points == null ? '未知' : api.me.points)}</span><span>最后计算：${esc(calculatedAt ? new Date(calculatedAt).toLocaleString('zh-CN') : '尚未刷新')}</span><button type="button" class="lsb-btn is-primary" data-title-forge-planner-refresh>刷新数据</button></div><div class="lsb-title-forge-planner-sources">${Object.keys(SOURCE_NAMES).map((key) => `<div data-title-forge-planner-source="${esc(key)}"><b>${esc(SOURCE_NAMES[key])}</b><span>${esc(sourceLabel(key))}</span>${sourceState[key].error ? `<small>${esc(sourceState[key].error)}</small>` : ''}</div>`).join('')}</div>${!data.inventoryAvailable && (sourceState.inventory.status === 'unavailable' || sourceState.inventory.status === 'stale') ? `<div class="lsb-title-forge-planner-warning">计入当前库存：无法确认库存数据。</div>` : ''}${data.recipes.length ? (() => { const result = calculatePlans({ recipes: data.recipes, market: data.market || {}, gachaPools: data.gachaPools, inventory: data.inventory, points: api.me.points }); return modeHtml('no-inventory', '不计库存', result.modes.noInventory) + (data.inventoryAvailable ? modeHtml('inventory', '计入当前库存', result.modes.inventory) : `<section data-title-forge-planner-mode="inventory"><h3>计入当前库存</h3><p>无法确认当前库存。</p></section>`) })() : `${modeHtml('no-inventory', '不计库存', null)}<section data-title-forge-planner-mode="inventory"><h3>计入当前库存</h3><p>无法确认当前库存。</p></section>`}</div>`
      const button = host.querySelector('[data-title-forge-planner-refresh]')
      if (button) button.addEventListener('click', () => refresh())
    }

    restoreCache()
    api.ui.style('.lsb-title-forge-planner{padding:8px 0;color:var(--text,#222)}.lsb-title-forge-planner-head{display:flex;gap:10px;align-items:center;flex-wrap:wrap}.lsb-title-forge-planner-head strong{font-size:18px}.lsb-title-forge-planner-head span{font-size:12px;color:var(--muted,#777)}.lsb-title-forge-planner-head button{margin-left:auto}.lsb-title-forge-planner-sources{display:grid;grid-template-columns:repeat(auto-fit,minmax(150px,1fr));gap:6px;margin:12px 0}.lsb-title-forge-planner-sources>div{display:flex;flex-direction:column;gap:3px;padding:7px 9px;border:1px solid var(--line-soft,#eee);border-radius:7px}.lsb-title-forge-planner-sources span{font-size:12px;color:var(--muted,#777)}.lsb-title-forge-planner-sources small{color:var(--danger,#b44)}.lsb-title-forge-planner-warning{padding:8px;border:1px solid var(--warning,#c90);border-radius:7px;margin:8px 0}.lsb-title-forge-planner-mode{margin:12px 0;padding:10px;border:1px solid var(--line-soft,#eee);border-radius:9px}.lsb-title-forge-planner-mode h3{margin:0 0 6px}.lsb-title-forge-planner-summary{font-weight:600}.lsb-title-forge-planner-mode article{padding:8px 0;border-top:1px solid var(--line-soft,#eee)}.lsb-title-forge-planner-mode h4{margin:0 0 6px}.lsb-title-forge-planner-mode h4 small{font-weight:400;color:var(--muted,#777)}.lsb-title-forge-planner-plan{display:grid;grid-template-columns:150px 1fr;gap:5px;padding:4px 0;font-size:13px}.lsb-title-forge-planner-plan em{grid-column:2;color:var(--brand,#5eaaa0);font-size:12px}.lsb-title-forge-planner-plan details{grid-column:2}.lsb-title-forge-planner-plan ul{margin:4px 0 0;padding-left:18px}.lsb-title-forge-planner-plan span{color:var(--muted,#666)}@media(max-width:620px){.lsb-title-forge-planner-plan{grid-template-columns:1fr}.lsb-title-forge-planner-plan em,.lsb-title-forge-planner-plan details{grid-column:1}.lsb-title-forge-planner-head button{margin-left:0}}')
    api.handle('title-forge-planner:refresh', () => refresh().then(() => publicSnapshot()))
    api.handle('title-forge-planner:calculate', (input = {}) => calculatePlans(input))
    api.handle('title-forge-planner:debug', () => ({
      keyOf,
      parseRecipes,
      parseGacha,
      parseInventory,
      resolveRecipeRarities,
      missingInputs,
      marketCost,
      medianCost,
      expandRequirements,
      planMarket,
      expectedGachaCost,
      summarizeMode,
      calculatePlans,
      planResult,
      refresh,
      state: () => ({ sourceState: cloneData(sourceState), data: cloneData(data), calculatedAt }),
      issues: [],
    }))
  }

  const w = typeof unsafeWindow !== 'undefined' ? unsafeWindow : window
  if (w.LSB && w.LSB.register) w.LSB.register(manifest, setup)
  else {
    w.LSB_PLUGINS = w.LSB_PLUGINS || []
    w.LSB_PLUGINS.push({ manifest, setup })
  }
})()
