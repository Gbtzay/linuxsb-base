import { readFileSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { outputDirectory, readBuildProfile, applyPluginBuildProfile } from './build-profile.mjs'
import { SUITE_VERSION } from '../suite/version.js'

const root = dirname(fileURLToPath(import.meta.url))
const repoRoot = join(root, '..')

export function readCoreVersion() {
  for (const p of [join(repoRoot, 'src/core/core-version.js'), join(repoRoot, 'src/core.js')]) {
    try {
      const raw = readFileSync(p, 'utf8')
      const m = raw.match(/VERSION = '([^']+)'/)
      if (m) return m[1]
    } catch { /* try next */ }
  }
  throw new Error('无法从 src/core/version 解析 VERSION')
}

export function stripHeader(source) {
  const match = source.match(/^\/\/ ==UserScript==\r?\n[\s\S]*?\/\/ ==\/UserScript==\r?\n*/)
  if (!match) throw new Error('缺少 userscript header')
  return { header: match[0], body: source.slice(match[0].length) }
}

export function readPluginBody(id, profile) {
  const raw = readFileSync(join(repoRoot, 'plugins', `${id}.user.js`), 'utf8')
  if (raw.charCodeAt(0) === 0xfeff) throw new Error(`${id}：源码带 UTF-8 BOM，不能安全拼接进套件产物`)
  if (/\r/.test(raw)) throw new Error(`${id}：源码含 CRLF 行尾，请统一保存为 LF 后再打包`)
  const { body } = stripHeader(raw)
  return applyPluginBuildProfile(id, body, profile)
}

export function readPluginMeta(id) {
  const raw = readFileSync(join(repoRoot, 'plugins', `${id}.user.js`), 'utf8')
  const headerVersion = raw.match(/@version\s+([\d.]+)/)?.[1] || null
  const headerName = raw.match(/@name\s+(.+)/)?.[1]?.trim() || id
  const manifestVersion = raw.match(/\bversion:\s*'([\d][\w.\-+]*)'/)?.[1] || null
  const manifestId = raw.match(/\bid:\s*'([a-z0-9-]+)'/)?.[1] || null
  return { headerVersion, headerName, manifestVersion, manifestId, raw }
}

export function readSuiteCenter(members) {
  const raw = readFileSync(join(repoRoot, 'suite/suite-center.js'), 'utf8')
  return raw.replace('__SUITE_MEMBERS__', JSON.stringify(members))
}

export function assertPackageVersionMatchesCore() {
  const pkg = JSON.parse(readFileSync(join(repoRoot, 'package.json'), 'utf8'))
  const core = readCoreVersion()
  if (pkg.version !== core) throw new Error(`package.json ${pkg.version} ≠ src/core.js ${core}`)
  return { pkgVersion: pkg.version, coreVersion: core }
}

export { SUITE_VERSION, outputDirectory, readBuildProfile, applyPluginBuildProfile }
