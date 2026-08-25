#!/usr/bin/env node
/**
 * 打包重型套件：plugins/*.user.js（全部模块）+ 套件中心 → dist/linuxsb-suite.user.js
 *
 * 设计：套件是「多个独立模块共居一个油猴脚本」——每个模块仍以自己的 manifest
 * 向基座注册，因此保留：单独启停、独立配置页、权限声明、依赖解析。
 * 额外提供一个『套件总览』仪表盘 Tab：状态卡片 + 快捷开关 + 跨模块关键指标。
 */
import { readFileSync, writeFileSync, mkdirSync, readdirSync } from 'node:fs'
import { join, dirname } from 'node:path'
import { fileURLToPath } from 'node:url'

const __dirname = dirname(fileURLToPath(import.meta.url))
const SUITE_VERSION = '1.0.44'

import { ORDER, SUITE_EXCLUDE } from './suite/order.js'

const pluginFiles = readdirSync(join(__dirname, 'plugins'))
  .filter((f) => f.endsWith('.user.js'))
  .map((f) => f.replace(/\.user\.js$/, ''))

const unregistered = pluginFiles.filter((id) => !ORDER.includes(id) && !SUITE_EXCLUDE.includes(id))
if (unregistered.length) {
  console.error(
    `✘ 套件收录校验失败：以下插件未登记进 ORDER（规定：新功能一律归入套件）\n` +
      unregistered.map((id) => `  - ${id}`).join('\n') +
      `\n  处理：加入 build-suite.mjs 的 ORDER；确不进套件则写入 SUITE_EXCLUDE 豁免。`,
  )
  process.exit(1)
}
const ghost = ORDER.filter((id) => !pluginFiles.includes(id))
if (ghost.length) {
  console.error(`✘ 套件收录校验失败：ORDER 引用了不存在的插件文件 → ${ghost.join(', ')}`)
  process.exit(1)
}

/**
 * 读取一个模块，并顺带抽出「两处版本号」与「manifest id」。
 *
 * 为什么要抽两处：套件 banner 展示的是 userscript 头部的 @version，
 * 而套件总览卡片展示的是 manifest.version（经 LSB.info() 读出）。
 * 两者漂移时，同一模块在两个地方显示不同版本——排障时对不上号。
 * 因此下面做构建期校验，让漂移在打包时就暴露。
 */
const readPlug = (id) => {
  const raw = readFileSync(join(__dirname, 'plugins', `${id}.user.js`), 'utf8')
  const version = raw.match(/@version\s+([\d.]+)/)?.[1] || null
  const name = raw.match(/@name\s+(.+)/)?.[1]?.trim() || id
  const manifestVersion = raw.match(/\bversion:\s*'([\d][\w.\-+]*)'/)?.[1] || null
  const manifestId = raw.match(/\bid:\s*'([a-z0-9-]+)'/)?.[1] || null
  const header = raw.match(/^\/\/ ==UserScript==\r?\n[\s\S]*?\/\/ ==\/UserScript==\r?\n*/)
  if (!header) {
    console.error(`✘ ${id}：文件必须以油猴头开头，套件打包才能剥离内嵌头`)
    process.exit(1)
  }
  const code = raw.slice(header[0].length)
  if (/\/\/ ==UserScript==/.test(code)) {
    console.error(`✘ ${id}：剥离油猴头后仍含 ==UserScript==，请勿在模块正文里写这段标记`)
    process.exit(1)
  }
  return { id, code, version, name, manifestVersion, manifestId }
}

const mods = ORDER.map(readPlug)

/* ── 一致性校验：版本号双处对齐 + manifest id 与文件名对齐 ── */
const versionIssues = []
for (const m of mods) {
  if (!m.version) versionIssues.push(`${m.id}：userscript 头部缺少 @version`)
  else if (!m.manifestVersion) versionIssues.push(`${m.id}：manifest 缺少 version 字段`)
  else if (m.version !== m.manifestVersion) {
    versionIssues.push(
      `${m.id}：@version ${m.version} ≠ manifest.version ${m.manifestVersion}` +
        `（banner 显示前者、套件卡片显示后者，会对不上号）`,
    )
  }
  if (m.manifestId && m.manifestId !== m.id) {
    versionIssues.push(`${m.id}：manifest.id 为 "${m.manifestId}"，与文件名不一致（ORDER/停用键均以文件名为准）`)
  }
}
if (versionIssues.length) {
  console.error(
    '✘ 模块一致性校验失败：\n' +
      versionIssues.map((s) => `  - ${s}`).join('\n') +
      '\n  处理：改版本号时头部 @version 与 manifest.version 必须同步更新。',
  )
  process.exit(1)
}

/** 套件中心：独立文件读取，__SUITE_MEMBERS__ 由构建时注入 */
const suiteCenter = readFileSync(join(__dirname, 'suite', 'suite-center.js'), 'utf8')
.replace('__SUITE_MEMBERS__', JSON.stringify(ORDER))

mkdirSync(join(__dirname, 'dist'), { recursive: true })

const banner = `// ==UserScript==
// @name         LINUX.SB 氧（Beta）
// @name:en      LINUX.SB Oxygen (Beta)
// @namespace    https://linux.sb/
// @version      ${SUITE_VERSION}
// @description  【Beta】linux.sb 功能套件：氢壳、实时流、未读哨兵、AI 总结、签到日历等 ${mods.length} 个模块。必须先安装「LINUX.SB 氢（Beta）」。
// @description:en  [Beta] Feature pack for linux.sb (shell, live feed, unread sentinel, AI summary, check-in, and more). Requires LINUX.SB Hydrogen (Beta).
// @author       xB70sR71
// @license      MIT
// @match        https://linux.sb/*
// @match        https://www.linux.sb/*
// @grant        none
// @run-at       document-end
// @noframes
// ==/UserScript==
//
// ── 包含模块 ──
${mods.map((m) => `// · ${m.name} v${m.version}`).join('\n')}
//

`

const body =
  banner +
  mods.map((m) => `\n;\n/* ══════════════ ${m.name} v${m.version} (${m.id}) ══════════════ */\n${m.code}`).join('\n') +
  '\n' +
  suiteCenter

const out = join(__dirname, 'dist/linuxsb-suite.user.js')
writeFileSync(out, body)

const size = readFileSync(out).length
console.log(`✔ dist/linuxsb-suite.user.js  ${(size / 1024).toFixed(1)} KB  v${SUITE_VERSION} · ${mods.length} 模块`)
