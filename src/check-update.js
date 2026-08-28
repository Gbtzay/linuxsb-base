import { parseVersion, compareVersion } from './util.js'

export const SCRIPTS = [
  {
    id: 'hydrogen',
    gfId: 592914,
    label: '氢',
    installUrl: 'https://greasyfork.org/zh-CN/scripts/592914-linux-sb-%E6%B0%A2-beta',
  },
  {
    id: 'oxygen',
    gfId: 592915,
    label: '氧',
    installUrl: 'https://greasyfork.org/zh-CN/scripts/592915-linux-sb-%E6%B0%A7-beta',
  },
]

export function gfJsonUrl(gfId) {
  return `https://greasyfork.org/zh-CN/scripts/${gfId}.json`
}

export function parseStoreScript(json) {
  if (!json || typeof json !== 'object') return null
  const version = typeof json.version === 'string' ? json.version.trim() : ''
  if (!version) return null
  const url = typeof json.url === 'string' ? json.url.trim() : ''
  return { version, url }
}

export function classifyVersion(local, store) {
  if (!parseVersion(local) || !parseVersion(store)) return 'invalid'
  const cmp = compareVersion(local, store)
  if (cmp < 0) return 'behind'
  if (cmp > 0) return 'ahead'
  return 'equal'
}

export function localOxygenVersion(plugins) {
  const suite = (plugins || []).find((p) => p.id === 'suite')
  return suite && suite.version ? String(suite.version) : null
}

export function installHref(parsed, fallback) {
  return (parsed && parsed.url) || fallback
}
