import test from 'node:test'
import assert from 'node:assert/strict'
import { spawnSync } from 'node:child_process'
import { copyFileSync, mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { fileURLToPath } from 'node:url'

const repoRoot = fileURLToPath(new URL('../', import.meta.url))
const pluginSource = `// ==UserScript==
// @name         Sample
// @version      1.0.0
// ==/UserScript==
const manifest = {
  id: 'sample',
  version: '1.0.0',
}
`

function runBuild(source) {
  const root = mkdtempSync(join(tmpdir(), 'lsb-build-validation-'))
  try {
    mkdirSync(join(root, 'plugins'), { recursive: true })
    mkdirSync(join(root, 'scripts'), { recursive: true })
    mkdirSync(join(root, 'suite'), { recursive: true })
    copyFileSync(join(repoRoot, 'build-suite.mjs'), join(root, 'build-suite.mjs'))
    copyFileSync(join(repoRoot, 'scripts/build-common.mjs'), join(root, 'scripts/build-common.mjs'))
    copyFileSync(join(repoRoot, 'scripts/build-profile.mjs'), join(root, 'scripts/build-profile.mjs'))
    copyFileSync(join(repoRoot, 'scripts/build-skin.mjs'), join(root, 'scripts/build-skin.mjs'))
    copyFileSync(join(repoRoot, 'suite/version.js'), join(root, 'suite/version.js'))
    writeFileSync(join(root, 'package.json'), JSON.stringify({ type: 'module' }))
    writeFileSync(
      join(root, 'suite/order.js'),
      "export const ORDER = ['sample']\nexport const ORDER_RELEASE = ORDER\nexport const SUITE_EXCLUDE = []\n",
    )
    writeFileSync(join(root, 'suite/suite-center.js'), 'globalThis.__suite = __SUITE_MEMBERS__\n')
    writeFileSync(join(root, 'plugins/sample.user.js'), source)

    return spawnBuild(root)
  } finally {
    rmSync(root, { recursive: true, force: true })
  }
}

function spawnBuild(root) {
  return spawnSync(process.execPath, ['build-suite.mjs', '--profile=release'], {
    cwd: root,
    encoding: 'utf8',
  })
}

test('build-suite 拒绝 CRLF 插件源码，而不是先规范化后放行', () => {
  const result = runBuild(pluginSource.replace(/\n/g, '\r\n'))
  assert.notEqual(result.status, 0, 'CRLF 源码必须使构建失败')
  assert.match(result.stderr, /CRLF|行尾/)
})

test('build-suite 拒绝缺少 manifest.id 的插件', () => {
  const result = runBuild(pluginSource.replace("  id: 'sample',\n", ''))
  assert.notEqual(result.status, 0, '缺少 manifest.id 必须使构建失败')
  assert.match(result.stderr, /manifest.*id/i)
})
