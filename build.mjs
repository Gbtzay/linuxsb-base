#!/usr/bin/env node
/** 打包：src/entry.js → dist/linuxsb-base.user.js（IIFE + 油猴头） */
import { build } from 'esbuild'
import { readFileSync, writeFileSync, mkdirSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'

const __dirname = dirname(fileURLToPath(import.meta.url))
const pkg = JSON.parse(readFileSync(join(__dirname, 'package.json'), 'utf8'))
const version = readFileSync(join(__dirname, 'src/core.js'), 'utf8').match(/VERSION = '([^']+)'/)[1]

const banner = `// ==UserScript==
// @name         LINUX.SB 氢
// @name:en      LINUX.SB Hydrogen
// @namespace    https://linux.sb/
// @version      ${version}
// @description  linux.sb 脚本基座：站点解析、统一网络请求、设置面板与插件挂载。请与「LINUX.SB 氧」一起使用。
// @description:en  Userscript base for linux.sb: site parsing, networked requests, settings panel, plugin host. Install LINUX.SB Oxygen for features.
// @author       xB70sR71
// @license      MIT
// @match        https://linux.sb/*
// @match        https://www.linux.sb/*
// @run-at       document-start
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

mkdirSync(join(__dirname, 'dist'), { recursive: true })

await build({
  entryPoints: [join(__dirname, 'src/entry.js')],
  bundle: true,
  format: 'iife',
  target: ['chrome100', 'firefox100'],
  charset: 'utf8',
  legalComments: 'none',
  outfile: join(__dirname, 'dist/linuxsb-base.user.js'),
  banner: { js: banner },
})

const out = join(__dirname, 'dist/linuxsb-base.user.js')
const size = readFileSync(out).length
console.log(`✔ dist/linuxsb-base.user.js  ${(size / 1024).toFixed(1)} KB  (v${version}, pkg ${pkg.version})`)
