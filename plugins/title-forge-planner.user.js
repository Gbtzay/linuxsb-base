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

  function keyOf(name, rarity) {
    return `${name}@${rarity}`
  }

  function issue(scope, reason, extra = {}) {
    return { scope, reason, ...extra }
  }

  function parseRecipes(input) {
    const root = toDocument(input)
    const recipes = []
    const issues = []
    const nodes = [...root.querySelectorAll('[data-gacha-recipe]')]
    if (!nodes.length) {
      return { recipes, issues: [issue('recipes', 'recipes-not-found')] }
    }
    for (const el of nodes) {
      const id = (el.getAttribute('data-recipe-id') || '').trim() || `recipe-${recipes.length + issues.length + 1}`
      const targetName = attrOrText(el, 'data-target-name', /(?:目标|产出|结果)\s*[:：]?\s*(.+?)(?:\s+(?:UR|SSR|SR|R|N)\b|$)/i) ||
        textOf(el.querySelector('[data-gacha-target], .gacha-recipe-target, h1, h2, h3, h4, strong')).match(/^\s*(.+?)\s+(?:UR|SSR|SR|R|N)\b/i)?.[1]?.trim() ||
        textOf(el).match(/^\s*(.+?)\s+(?:UR|SSR|SR|R|N)\b/i)?.[1]?.trim() || ''
      const targetRarity = attrOrText(el, 'data-target-rarity', /\b(UR|SSR|SR|R|N)\b/i).toUpperCase()
      const fee = numberAttrOrText(el, 'data-fee', /(?:费用|消耗|积分)\s*[:：]?\s*([\d,]+(?:\.\d+)?)/)
      if (targetRarity !== 'UR') continue
      const materials = [...el.querySelectorAll('[data-gacha-material]')]
      const inputs = []
      let invalid = false
      for (const material of materials) {
        const name = attrOrText(material, 'data-name', /^\s*(.+?)\s+(?:UR|SSR|SR|R|N)\b/i)
        const rarity = attrOrText(material, 'data-rarity', /\b(UR|SSR|SR|R|N)\b/i).toUpperCase()
        const qty = numberAttrOrText(material, 'data-qty', /[×x]\s*([\d,]+(?:\.\d+)?)/i)
        if (!name || !rarity || !Number.isFinite(qty) || qty <= 0) {
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
    const nodes = [...root.querySelectorAll('[data-gacha-pool]')]
    if (!nodes.length) return { pools, issues: [issue('gacha', 'pools-not-found')] }
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
    return { pools, issues }
  }

  function parseInventory(input) {
    const root = toDocument(input)
    const inventory = {}
    const issues = []
    const nodes = [...root.querySelectorAll('[data-gacha-owned]')]
    if (!nodes.length) return { inventory, issues: [issue('inventory', 'inventory-not-found')] }
    for (const el of nodes) {
      const name = attrOrText(el, 'data-name', /^\s*(.+?)\s+(?:UR|SSR|SR|R|N)\b/i)
      const rarity = attrOrText(el, 'data-rarity', /\b(UR|SSR|SR|R|N)\b/i).toUpperCase()
      const qty = numberAttrOrText(el, 'data-qty', /[×x]\s*([\d,]+(?:\.\d+)?)/i)
      if (!name || !rarity || !Number.isFinite(qty) || qty < 0) {
        issues.push(issue('inventory', 'inventory-entry-incomplete'))
        continue
      }
      const key = keyOf(name, rarity)
      inventory[key] = (inventory[key] || 0) + qty
    }
    return { inventory, issues }
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
      return planResult(plan?.status || 'unavailable', plan?.cost, plan?.fee, plan?.steps, plan?.reason, points)
    }
    const out = planResult(plan.status, plan.cost, plan.fee, plan.steps, plan.reason, points)
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
      if (remaining > 0) return unavailable('market-insufficient', Number(fee), steps)
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

  function setup(api) {
    api.handle('title-forge-planner:debug', () => ({
      keyOf,
      parseRecipes,
      parseGacha,
      parseInventory,
      missingInputs,
      marketCost,
      medianCost,
      expandRequirements,
      planMarket,
      planResult,
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
