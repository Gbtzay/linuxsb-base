#!/usr/bin/env node
/** Bundle src/entry.js for a selected Hydrogen distribution profile. */
import { build } from 'esbuild'
import { readFileSync, mkdirSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { outputDirectory, readBuildProfile, readCoreVersion } from './scripts/build-common.mjs'

const __dirname = dirname(fileURLToPath(import.meta.url))
const pkg = JSON.parse(readFileSync(join(__dirname, 'package.json'), 'utf8'))
const version = readCoreVersion()
const profile = readBuildProfile()
const distDir = outputDirectory(profile)
const isDev = profile === 'dev'
const name = isDev ? 'LINUX.SB 氢（开发版）' : 'LINUX.SB 氢'
const nameEn = isDev ? 'LINUX.SB Hydrogen (Developer Build)' : 'LINUX.SB Hydrogen'
const description = isDev
  ? 'linux.sb 脚本基座开发版：包含 AI 专用插件 API，仅用于开发与测试。'
  : 'linux.sb 脚本基座：站点解析、统一网络请求、设置面板与插件挂载。请与「LINUX.SB 氧」一起使用。'
const descriptionEn = isDev
  ? 'Developer Hydrogen build with AI plugin APIs. For development and testing only.'
  : 'Userscript base for linux.sb: site parsing, networked requests, settings panel, plugin host. Install LINUX.SB Oxygen for features.'

const banner = `// ==UserScript==
// @name         ${name}
// @name:en      ${nameEn}
// @namespace    https://linux.sb/
// @version      ${version}
// @description  ${description}
// @description:en  ${descriptionEn}
// @author       xB70sR71
// @license      MIT
// @run-at       document-start
// @match        https://linux.sb/*
// @match        https://www.linux.sb/*
// @grant        unsafeWindow
// @grant        GM_getValue
// @grant        GM_setValue
// @grant        GM_deleteValue
// @grant        GM_listValues
// @grant        GM_addValueChangeListener
// @grant        GM_removeValueChangeListener
// @grant        GM_xmlhttpRequest
// @grant        GM_registerMenuCommand
// @grant        GM_unregisterMenuCommand
// @connect      linux.sb
// @connect      localhost
// @connect      127.0.0.1
// @connect      *
// @noframes
// ==/UserScript==
`

mkdirSync(join(__dirname, distDir), { recursive: true })

await build({
  entryPoints: [join(__dirname, 'src/entry.js')],
  bundle: true,
  format: 'iife',
  target: ['chrome100', 'firefox100'],
  charset: 'utf8',
  legalComments: 'none',
  minifySyntax: true,
  treeShaking: true,
  define: { __LSB_BUILD_PROFILE__: JSON.stringify(profile) },
  outfile: join(__dirname, `${distDir}/linuxsb-base.user.js`),
  banner: { js: banner },
})

const out = join(__dirname, `${distDir}/linuxsb-base.user.js`)
const size = readFileSync(out).length
console.log(`✔ ${distDir}/linuxsb-base.user.js  ${(size / 1024).toFixed(1)} KB  (v${version}, pkg ${pkg.version}, ${profile})`)
