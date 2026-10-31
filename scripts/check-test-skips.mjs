#!/usr/bin/env node
/**
 * Keep skipped tests explicit and bounded.
 *
 * The historical skin skips were audited in docs/reading-acceptance.md.
 * Current suites have no approved skips. Keep this check so a new skip cannot
 * silently remove a regression from the release signal.
 */
import { readdirSync, readFileSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'

const root = dirname(dirname(fileURLToPath(import.meta.url)))
const testDir = join(root, 'test')
const expected = new Map()
const actual = new Map()

for (const name of readdirSync(testDir).filter((entry) => entry.endsWith('.test.js')).sort()) {
  const source = readFileSync(join(testDir, name), 'utf8')
  const count = (source.match(/\btest\.skip\s*\(/g) || []).length
  if (count) actual.set(name, count)
}

const failures = []
for (const [name, count] of actual) {
  if (!expected.has(name)) failures.push(`${name} contains ${count} skipped tests but has no approved skip budget`)
}
for (const [name, count] of expected) {
  if ((actual.get(name) || 0) !== count) {
    failures.push(`${name} skip count changed: expected ${count}, found ${actual.get(name) || 0}`)
  }
}

if (failures.length) {
  console.error(
    '✘ 跳过测试基线检查失败：\n' +
      failures.map((item) => `  - ${item}`).join('\n') +
      '\n  处理：补齐替代回归后删除旧 skip，或在评审中明确更新 scripts/check-test-skips.mjs。',
  )
  process.exit(1)
}

const total = [...actual.values()].reduce((sum, count) => sum + count, 0)
console.log(`✔ 跳过测试基线通过：${total} 项`)
