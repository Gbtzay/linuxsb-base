#!/usr/bin/env node
import { readFileSync, writeFileSync, existsSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { ORDER, ORDER_LTS } from './suite/order.js'
import { readBuildProfile, readPluginBody, stripHeader, SUITE_VERSION } from './scripts/build-common.mjs'

const __dirname = dirname(fileURLToPath(import.meta.url))
const profile = readBuildProfile()
if (profile !== 'release') throw new Error('LTS 仅从正式版配置构建')
const COLLISION =
  '请先在油猴里关掉或卸掉「LINUX.SB 氢」和「LINUX.SB 氧」，只留 LINUX.SB（LTS）。'

function rewriteBaseHeader(header, version, description, descriptionEn) {
  return header
    .replace(/^\/\/ @name(?!:)\s+.+$/m, '// @name         LINUX.SB（LTS）')
    .replace(/^\/\/ @name:en\s+.+$/m, '// @name:en      LINUX.SB (LTS)')
    .replace(/^\/\/ @version\s+.+$/m, `// @version      ${version}`)
    .replace(/^\/\/ @description(?!:)\s+.+$/m, `// @description  ${description}`)
    .replace(/^\/\/ @description:en\s+.+$/m, `// @description:en  ${descriptionEn}`)
}

const missing = ORDER_LTS.filter((id) => !ORDER.includes(id))
if (missing.length) throw new Error('ORDER_LTS 必须是 ORDER 的子集：' + missing.join(','))

const basePath = join(__dirname, 'dist/linuxsb-base.user.js')
if (!existsSync(basePath)) throw new Error('缺少 dist/linuxsb-base.user.js，请先执行 npm run build 或 node build.mjs --profile=release')
const suitePath = join(__dirname, 'dist/linuxsb-suite.user.js')
if (!existsSync(suitePath)) throw new Error('缺少 dist/linuxsb-suite.user.js，请先执行 build-suite.mjs --profile=release')
const base = readFileSync(basePath, 'utf8')
const baseParts = stripHeader(base)
const version = SUITE_VERSION
const mods = ORDER_LTS.map((id) => readPluginBody(id, profile))
const suiteCenter = readFileSync(join(__dirname, 'suite', 'suite-center.js'), 'utf8').replace(
  '__SUITE_MEMBERS__',
  JSON.stringify(ORDER_LTS),
)
const description =
  '【LTS】一份脚本含基座与精简功能包。请先卸掉「LINUX.SB 氢」和「LINUX.SB 氧」。冻新功能，只修阻断。'
const descriptionEn =
  '[LTS] Base + feature pack in one script. Uninstall Hydrogen and Oxygen first. Feature-frozen.'
const banner = rewriteBaseHeader(baseParts.header, version, description, descriptionEn)
const wrap = `${banner}
(function () {
  'use strict'
  var W = typeof unsafeWindow !== 'undefined' ? unsafeWindow : window
  try { if (W.self !== W.top) return } catch (e) { return }
  if (W.LSB && W.LSB.__core) {
    var MSG = ${JSON.stringify(COLLISION)}
    var show = function () {
      var d = W.document
      if (!d || !d.documentElement) return
      var el = d.createElement('div')
      el.setAttribute('data-lsb-lts-collision', '1')
      el.textContent = MSG
      el.setAttribute('style', 'position:fixed;z-index:2147483647;right:16px;bottom:16px;max-width:320px;padding:9px 12px;border-radius:8px;background:#fff;color:#222;font-size:13px;box-shadow:0 6px 18px rgba(0,0,0,.18)')
      d.documentElement.appendChild(el)
      W.setTimeout(function () { el.remove() }, 8000)
    }
    if (W.document && W.document.documentElement) show()
    else W.addEventListener('DOMContentLoaded', show, { once: true })
    return
  }
  W.__LSB_CHANNEL__ = 'lts'
  W.__LSB_LTS_VERSION__ = ${JSON.stringify(version)};
${baseParts.body}
;
${mods.join('\n;\n')}
;
${suiteCenter}
})()
`
writeFileSync(join(__dirname, 'dist/linuxsb-lts.user.js'), wrap)
console.log('✔ dist/linuxsb-lts.user.js  v' + version)
