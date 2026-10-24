#!/usr/bin/env node

import { existsSync, readdirSync, readFileSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { AI_MODULES, ORDER } from '../suite/order.js'
import { SUITE_VERSION } from '../suite/version.js'
import { applyPluginBuildProfile, stripHeader as stripHeaderCommon } from './build-common.mjs'

const root = dirname(dirname(fileURLToPath(import.meta.url)))
const dir = join(root, 'dist-dev')
const fail = []
const check = (condition, message) => {
  if (!condition) fail.push(message)
}
const read = (file) => readFileSync(join(root, file), 'utf8')
const stripHeader = (source) => stripHeaderCommon(source).body
const versionOf = (source) => source.match(/@version\s+([\d.]+)/)?.[1] || null

const expectedFiles = ['linuxsb-base.user.js', 'linuxsb-suite.user.js'].sort()
const actualFiles = existsSync(dir) ? readdirSync(dir).sort() : []
check(JSON.stringify(actualFiles) === JSON.stringify(expectedFiles), `dist-dev/ 应只包含 ${expectedFiles.join(' 与 ')}`)
check(!existsSync(join(dir, 'linuxsb-lts.user.js')), 'dist-dev/ 不得包含开发版 LTS')

let base = ''
let suite = ''
try { base = read('dist-dev/linuxsb-base.user.js') } catch { fail.push('缺少 dist-dev/linuxsb-base.user.js') }
try { suite = read('dist-dev/linuxsb-suite.user.js') } catch { fail.push('缺少 dist-dev/linuxsb-suite.user.js') }

const core = (() => {
  try { return read('src/core/core-version.js') } catch { return read('src/core.js') }
})()
const center = read('suite/suite-center.js')
const readme = read('README.md')
const conventions = read('docs/CONVENTIONS.md')
const coreVersion = core.match(/VERSION\s*=\s*'([^']+)'/)?.[1] || null
const suiteVersion = center.match(/version:\s*'([\d.]+)'/)?.[1] || null
const buildVersion = SUITE_VERSION

if (base && suite) {
  check(/@name\s+LINUX\.SB 氢（开发版）/.test(base), '开发 Hydrogen 缺少开发版脚本名标记')
  check(/@name\s+LINUX\.SB 氧（开发版）/.test(suite), '开发 Oxygen 缺少开发版脚本名标记')
  check(versionOf(base) === coreVersion, `开发 Hydrogen ${versionOf(base) || 'missing'} ≠ 基座版本 ${coreVersion || 'missing'}`)
  check(versionOf(suite) === suiteVersion, `开发 Oxygen ${versionOf(suite) || 'missing'} ≠ 套件中心版本 ${suiteVersion || 'missing'}`)
  check(buildVersion === suiteVersion, `build-suite.mjs ${buildVersion || 'missing'} ≠ 套件中心版本 ${suiteVersion || 'missing'}`)
  check(base.includes('registerAction'), '开发 Hydrogen 缺少 AI 动作注册 API')
  check(base.includes('prepareConversation'), '开发 Hydrogen 缺少对话 API')
  check(suite.includes('data-surface="ai-card"'), '开发 Oxygen 缺少 skin AI 卡片')
  check(suite.includes('data-canvas-open="ai-card"'), '开发 Oxygen 缺少 AI 快捷入口')
  check(suite.includes('data-tool-action="ai-card"'), '开发 Oxygen 缺少 AI 工具入口')
  check(suite.includes('lsb:canvas-ai-open') && suite.includes('lsb:canvas-ai-close'), '开发 Oxygen 缺少完整 skin AI 事件桥')
  check(!suite.includes("id: 'hover-profile'"), '开发 Oxygen 不应包含已下架的用户画像悬浮卡')
  for (const id of AI_MODULES) check(suite.includes(`id: '${id}'`), `开发 Oxygen 缺少 AI 模块 ${id}`)
  for (const id of ORDER) {
    const source = read(`plugins/${id}.user.js`)
    const body = applyPluginBuildProfile(id, stripHeader(source).trim(), 'dev')
    check(suite.includes(body), `${id} 当前源码正文未进入开发 Oxygen 产物`)
    check(suite.includes(`(${id})`), `${id} 缺少开发 Oxygen 模块段落`)
  }
  check(readme.includes('dist-dev/'), 'README.md 缺少开发产物目录说明')
  check(conventions.includes('25** 个套件模块'), 'docs/CONVENTIONS.md 缺少开发模块数说明')
}

if (fail.length) {
  console.error('✘ 开发版 dist 检查失败：\n' + fail.map((item) => `  - ${item}`).join('\n'))
  process.exit(1)
}

console.log(`✔ 开发版 dist 通过：Hydrogen ${versionOf(base)} · Oxygen ${versionOf(suite)} · ${ORDER.length} 模块 · AI 完整 · 无 LTS`)
