#!/usr/bin/env node

import { readFileSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { AI_MODULES, ORDER, ORDER_LTS, ORDER_RELEASE, SUITE_EXCLUDE } from '../suite/order.js'
import { SUITE_VERSION } from '../suite/version.js'
import { applyPluginBuildProfile, readPluginSource, stripHeader as stripHeaderCommon } from './build-common.mjs'
import { syncSkinSource } from './build-skin.mjs'

const root = dirname(dirname(fileURLToPath(import.meta.url)))
const read = (file) => readFileSync(join(root, file), 'utf8')
const stripHeader = (source) => stripHeaderCommon(source).body
const versionOf = (source) => source.match(/@version\s+([\d.]+)/)?.[1] || null
const fail = []
const check = (condition, message) => {
  if (!condition) fail.push(message)
}
syncSkinSource({ check: true })

const base = read('dist/linuxsb-base.user.js')
const suite = read('dist/linuxsb-suite.user.js')
const lts = read('dist/linuxsb-lts.user.js')
const core = (() => {
  try { return read('src/core/core-version.js') } catch { return read('src/core.js') }
})()
const pkg = JSON.parse(read('package.json'))
const center = read('suite/suite-center.js')
const readme = read('README.md')
const conventions = read('docs/CONVENTIONS.md')
const suiteVersion = versionOf(suite)
const ltsVersion = versionOf(lts)
const coreVersion = core.match(/VERSION\s*=\s*'([^']+)'/)?.[1] || null
const centerVersion = center.match(/version:\s*'([\d.]+)'/)?.[1] || null
const buildSuiteVersion = SUITE_VERSION

check(versionOf(base) === coreVersion, `Hydrogen dist ${versionOf(base) || 'missing'} ≠ src/core.js ${coreVersion || 'missing'}`)
check(pkg.version === coreVersion, `package.json ${pkg.version || 'missing'} ≠ src/core.js ${coreVersion || 'missing'}`)
check(suiteVersion === centerVersion, `Oxygen dist ${suiteVersion || 'missing'} ≠ suite center ${centerVersion || 'missing'}`)
check(buildSuiteVersion === centerVersion, `build-suite.mjs ${buildSuiteVersion || 'missing'} ≠ suite center ${centerVersion || 'missing'}`)
check(ltsVersion === suiteVersion, `LTS dist ${ltsVersion || 'missing'} ≠ Oxygen ${suiteVersion || 'missing'}`)
check(
  conventions.includes(`氢 **${coreVersion}** / 正式氧 **${suiteVersion}** / LTS **${ltsVersion}**`),
  'docs/CONVENTIONS.md 的正式版版本号未与产物同步',
)
check(
  readme.includes(`基座版本为 **${coreVersion}**，随 Oxygen **${suiteVersion}** 构建`),
  'README.md 的基座/Oxygen 版本号未与产物同步',
)
check(
  conventions.includes(`正式 Oxygen 收录 **${ORDER_RELEASE.length}** 个非 AI 模块`) &&
    conventions.includes(`**${ORDER.length}** 个套件模块`),
  `docs/CONVENTIONS.md 必须记录正式 ${ORDER_RELEASE.length} 个、开发 ${ORDER.length} 个模块`,
)
const documentedModules = readme.match(/正式氧[^\n]*内含\s*(\d+)\s*个(?:非 AI )?模块/)?.[1]
check(documentedModules === String(ORDER_RELEASE.length), `README.md 正式模块数 ${documentedModules || 'missing'} ≠ ${ORDER_RELEASE.length}`)
check(readme.includes(`${ORDER.length} 个模块`), 'README.md 缺少开发版完整模块数')
check(pkg.scripts?.['build:dev']?.includes('--profile=dev'), 'package.json 缺少独立 build:dev 配置')
check(pkg.scripts?.['verify:dev-dist'], 'package.json 缺少开发版产物校验脚本')
check(!exists('dist-dev/linuxsb-lts.user.js'), 'dist-dev 不得包含开发版 LTS')

for (const id of AI_MODULES) {
  check(!suite.includes(`id: '${id}'`), `正式 Oxygen 不应包含 ${id}`)
  check(!lts.includes(`id: '${id}'`), `正式 LTS 不应包含 ${id}`)
}
for (const artifact of [suite, lts]) {
  check(!artifact.includes('<section data-surface="ai-card"'), '正式套件不应包含 AI 卡片入口')
  check(!artifact.includes('data-canvas-open="ai-card"'), '正式套件不应包含 AI 快捷入口')
  check(!artifact.includes('data-tool-action="ai-card"'), '正式套件不应包含 AI 工具入口')
  check(!artifact.includes('lsb:canvas-ai-open'), '正式套件不应包含 skin AI 事件桥')
  check(!artifact.includes('lsb:canvas-ai-close'), '正式套件不应包含 skin AI 关闭事件桥')
}
for (const identifier of ['registerAction', 'prepareConversation', 'buildConversationContext', 'sanitizeTraceEvent']) {
  check(!base.includes(identifier), `正式 Hydrogen 不应包含 AI 专用 API 代码 ${identifier}`)
}
check(base.includes('requestBroker'), '正式 Hydrogen 应保留公共 RequestBroker')
check(!suite.includes("id: 'hover-profile'"), '正式 Oxygen 不应包含已下架的用户画像悬浮卡')
check(!lts.includes("id: 'hover-profile'"), 'LTS 不应包含已下架的用户画像悬浮卡')

for (const id of ORDER_RELEASE) {
  const source = readPluginSource(id)
  check(source.charCodeAt(0) !== 0xfeff, `${id} 源码带 UTF-8 BOM`)
  check(!/\r\n/.test(source), `${id} 源码含 CRLF 行尾`)
  const body = applyPluginBuildProfile(id, stripHeader(source).trim(), 'release')
  check(suite.includes(body), `${id} 当前 release 源码正文未进入正式 Oxygen 产物`)
  check(suite.includes(`(${id})`), `${id} 缺少正式 Oxygen 模块段落`)
}
for (const id of ORDER_LTS) {
  const source = readPluginSource(id)
  const body = applyPluginBuildProfile(id, stripHeader(source).trim(), 'release')
  check(lts.includes(body), `${id} 当前正式源码正文未进入 LTS 产物`)
}
for (const id of ORDER.filter((id) => !ORDER_LTS.includes(id) && !SUITE_EXCLUDE.includes(id))) {
  check(!lts.includes(`id: '${id}'`), `${id} 不应进入 LTS 产物`)
}

function exists(path) {
  try {
    read(path)
    return true
  } catch {
    return false
  }
}

if (fail.length) {
  console.error('✘ 正式 dist 新鲜度检查失败：\n' + fail.map((item) => `  - ${item}`).join('\n'))
  process.exit(1)
}

console.log(`✔ 正式 dist 通过：Hydrogen ${versionOf(base)} · Oxygen ${suiteVersion} · LTS ${ltsVersion} · ${ORDER_RELEASE.length} 模块 · AI 已排除`)
