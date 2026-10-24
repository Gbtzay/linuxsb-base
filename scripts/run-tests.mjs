import { readdir } from 'node:fs/promises'
import { spawn } from 'node:child_process'
import { fileURLToPath } from 'node:url'
import { resolve } from 'node:path'

const TEST_DIR = fileURLToPath(new URL('../test/', import.meta.url))
const AI_FILE = /^ai-.*\.test\.js$/
const SUITES = new Set(['quick', 'core', 'all', 'ai', 'live-feed', 'skin'])
const QUICK_FILES = [
  'bus.test.js',
  'check-update.test.js',
  'core.test.js',
  'dom.test.js',
  'election.test.js',
  'errors.test.js',
  'home-return.test.js',
  'net.test.js',
  'route.test.js',
  'runtime-action-broker.test.js',
  'runtime-capabilities.test.js',
  'runtime-request-broker.test.js',
  'shell-layout.test.js',
  'shell-media.test.js',
  'shell-scroll.test.js',
  'shell-style.test.js',
  'site.test.js',
  'store.test.js',
  'test-runner.test.js',
]
const SCOPED_FILES = {
  quick: QUICK_FILES,
  'live-feed': ['live-feed.test.js', 'live-feed-v2.test.js', 'read-mark.test.js'],
  skin: ['skin-canvas.test.js', 'skin.test.js'],
}

export function selectTestFiles(files, suite = 'quick') {
  if (!SUITES.has(suite)) throw new Error(`Unknown test suite: ${suite}`)
  const sorted = [...files].sort()
  if (suite === 'all') return sorted
  if (suite === 'core') return sorted.filter((file) => !AI_FILE.test(file))
  if (suite === 'ai') return sorted.filter((file) => AI_FILE.test(file))

  const available = new Set(sorted)
  const selected = SCOPED_FILES[suite]
  const missing = selected.filter((file) => !available.has(file))
  if (missing.length) throw new Error(`Missing ${suite} test file(s): ${missing.join(', ')}`)
  return selected.slice()
}

async function discoverTestFiles() {
  const entries = await readdir(TEST_DIR, { withFileTypes: true })
  return entries
    .filter((entry) => entry.isFile() && entry.name.endsWith('.test.js'))
    .map((entry) => entry.name)
}

export async function main(argv = []) {
  const first = argv[0]
  const hasSuite = Boolean(first && !first.startsWith('-'))
  const suite = hasSuite ? first : 'quick'
  const extraArgs = hasSuite ? argv.slice(1) : argv
  const files = selectTestFiles(await discoverTestFiles(), suite)
  const paths = files.map((file) => fileURLToPath(new URL(`../test/${file}`, import.meta.url)))
  const childArgs = [
    '--test',
    '--test-force-exit',
    '--test-concurrency=2',
    ...extraArgs,
    ...paths,
  ]

  await new Promise((resolveChild) => {
    const child = spawn(process.execPath, childArgs, { stdio: 'inherit' })
    child.once('error', () => {
      process.exitCode = 1
      resolveChild()
    })
    child.once('close', (code) => {
      process.exitCode = typeof code === 'number' ? code : 1
      resolveChild()
    })
  })
  return process.exitCode || 0
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  await main(process.argv.slice(2))
}
