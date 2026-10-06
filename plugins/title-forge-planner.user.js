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

  function setup(api) {
    api.handle('title-forge-planner:debug', () => ({
      keyOf,
      parseRecipes,
      parseGacha,
      parseInventory,
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
