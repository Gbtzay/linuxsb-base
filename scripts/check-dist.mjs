#!/usr/bin/env node

import { readFileSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { ORDER, ORDER_LTS, SUITE_EXCLUDE } from '../suite/order.js'

const root = dirname(dirname(fileURLToPath(import.meta.url)))
const read = (file) => readFileSync(join(root, file), 'utf8')
const stripHeader = (source) => {
  const match = source.match(/^\/\/ ==UserScript==\r?\n[\s\S]*?\/\/ ==\/UserScript==\r?\n*/)
  if (!match) throw new Error('缺少 userscript header')
  return source.slice(match[0].length)
}
const versionOf = (source) => source.match(/@version\s+([\d.]+)/)?.[1] || null
const fail = []
const check = (condition, message) => {
  if (!condition) fail.push(message)
}

const base = read('dist/linuxsb-base.user.js')
const suite = read('dist/linuxsb-suite.user.js')
const lts = read('dist/linuxsb-lts.user.js')
const core = read('src/core.js')
const center = read('suite/suite-center.js')
const suiteVersion = versionOf(suite)
const ltsVersion = versionOf(lts)
const coreVersion = core.match(/VERSION\s*=\s*'([^']+)'/)?.[1] || null
const centerVersion = center.match(/version:\s*'([\d.]+)'/)?.[1] || null

check(versionOf(base) === coreVersion, `Hydrogen dist ${versionOf(base) || 'missing'} ≠ src/core.js ${coreVersion || 'missing'}`)
check(suiteVersion === centerVersion, `Oxygen dist ${suiteVersion || 'missing'} ≠ suite center ${centerVersion || 'missing'}`)
check(ltsVersion === suiteVersion, `LTS dist ${ltsVersion || 'missing'} ≠ Oxygen ${suiteVersion || 'missing'}`)
check(!lts.includes("id: 'ai-copilot'"), 'LTS 产物不应包含 ai-copilot')

for (const id of ORDER) {
  const source = read(`plugins/${id}.user.js`)
  const body = stripHeader(source).trim()
  check(suite.includes(body), `${id} 当前源码正文未进入 Oxygen 产物`)
  check(suite.includes(`(${id})`), `${id} 缺少 Oxygen 模块段落`)
}
for (const id of ORDER_LTS) {
  const source = read(`plugins/${id}.user.js`)
  check(lts.includes(stripHeader(source).trim()), `${id} 当前源码正文未进入 LTS 产物`)
}
for (const id of ORDER.filter((id) => !ORDER_LTS.includes(id) && !SUITE_EXCLUDE.includes(id))) {
  check(!lts.includes(`id: '${id}'`), `${id} 不应进入 LTS 产物`)
}

if (fail.length) {
  console.error('✘ dist 新鲜度检查失败：\n' + fail.map((item) => `  - ${item}`).join('\n'))
  process.exit(1)
}

console.log(`✔ dist 新鲜度通过：Hydrogen ${versionOf(base)} · Oxygen ${suiteVersion} · LTS ${ltsVersion} · ${ORDER.length} 模块`)
