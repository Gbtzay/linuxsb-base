import test from 'node:test'
import assert from 'node:assert/strict'
import { existsSync, readFileSync } from 'node:fs'
import { AI_MODULES, ORDER, ORDER_RELEASE } from '../suite/order.js'
import { JSDOM } from 'jsdom'

const publicBasePath = new URL('../dist/linuxsb-base.user.js', import.meta.url)
const publicSuitePath = new URL('../dist/linuxsb-suite.user.js', import.meta.url)
const publicLtsPath = new URL('../dist/linuxsb-lts.user.js', import.meta.url)
const devBasePath = new URL('../dist-dev/linuxsb-base.user.js', import.meta.url)
const devSuitePath = new URL('../dist-dev/linuxsb-suite.user.js', import.meta.url)
const topicHtml = readFileSync(new URL('./fixtures/topic1.html', import.meta.url), 'utf8')

function createSite() {
  const dom = new JSDOM(topicHtml, { url: 'https://linux.sb/topic/1', runScripts: 'outside-only' })
  const w = dom.window
  w.unsafeWindow = w
  Object.defineProperty(w, 'innerWidth', { configurable: true, value: 1200 })
  w.requestAnimationFrame = (fn) => setTimeout(() => fn(Date.now()), 0)
  w.scrollTo = () => {}
  w.fetch = async (url) => ({ status: 200, ok: true, url: String(url), text: async () => '' })
  w.localStorage.setItem('lsb_base:skin:__config', JSON.stringify({ shell: true, uiMode: 'ios27' }))
  return w
}

function registerApiProbe(w) {
  let captured = null
  w.LSB.register({ id: 'build-profile-probe', version: '1.0.0', permissions: ['read'] }, (api) => {
    captured = api
  })
  assert.ok(captured, 'the base should activate a plugin that observes its public API')
  return captured
}

async function waitForPlugins(w) {
  const end = Date.now() + 2500
  while (Date.now() < end) {
    if (w.LSB?.info?.().plugins?.some((plugin) => plugin.id === 'suite')) return
    await new Promise((resolve) => setTimeout(resolve, 20))
  }
  assert.fail('Oxygen should register its suite center')
}

test('public distributions exclude AI APIs, plugins, and skin entry points', async () => {
  const baseCode = readFileSync(publicBasePath, 'utf8')
  const suiteCode = readFileSync(publicSuitePath, 'utf8')
  const ltsCode = readFileSync(publicLtsPath, 'utf8')
  const w = createSite()
  w.eval(baseCode)
  const api = registerApiProbe(w)
  assert.equal(api.ai, undefined, 'public Hydrogen must not expose the AI plugin API')
  w.eval(suiteCode)
  await waitForPlugins(w)

  const pluginIds = w.LSB.info().plugins.map((plugin) => plugin.id)
  assert.equal(ORDER_RELEASE.length, 20, 'public Oxygen should contain 20 non-AI modules')
  assert.equal(ORDER.length, 25, 'the full developer Oxygen should contain 25 modules')
  for (const id of ORDER_RELEASE) assert.ok(pluginIds.includes(id), `public Oxygen should register ${id}`)
  for (const id of AI_MODULES) {
    assert.equal(pluginIds.includes(id), false, `public Oxygen must not register ${id}`)
    assert.equal(suiteCode.includes(`id: '${id}'`), false, `public Oxygen must not contain ${id}`)
    assert.equal(ltsCode.includes(`id: '${id}'`), false, `public LTS must not contain ${id}`)
  }
  assert.equal(pluginIds.includes('skin'), true, 'non-AI shell functionality remains available')
  assert.equal(w.document.querySelector('[data-surface="ai-card"]'), null)
  assert.equal(w.document.querySelector('[data-canvas-open="ai-card"]'), null)
  assert.equal(w.document.querySelector('[data-tool-action="ai-card"]'), null)
  assert.doesNotMatch(w.document.querySelector('[data-surface="tool-sheet"]')?.textContent || '', /AI 助理/)
})

test('developer distributions include the complete AI Hydrogen and Oxygen pair only', async () => {
  assert.equal(existsSync(devBasePath), true, 'build:dev should emit a developer Hydrogen artifact')
  assert.equal(existsSync(devSuitePath), true, 'build:dev should emit a developer Oxygen artifact')
  assert.equal(existsSync(new URL('../dist-dev/linuxsb-lts.user.js', import.meta.url)), false, 'there is no developer LTS')

  const baseCode = readFileSync(devBasePath, 'utf8')
  const suiteCode = readFileSync(devSuitePath, 'utf8')
  assert.match(baseCode, /@name\s+LINUX\.SB 氢（开发版）/)
  assert.match(suiteCode, /@name\s+LINUX\.SB 氧（开发版）/)

  const w = createSite()
  w.eval(baseCode)
  const api = registerApiProbe(w)
  assert.equal(typeof api.ai?.registerAction, 'function', 'developer Hydrogen retains the AI plugin API')
  w.eval(suiteCode)
  await waitForPlugins(w)

  const plugins = new Map(w.LSB.info().plugins.map((plugin) => [plugin.id, plugin.state]))
  for (const id of AI_MODULES) assert.equal(plugins.get(id), 'active', `developer Oxygen should activate ${id}`)
  assert.ok(w.document.querySelector('[data-surface="ai-card"]'), 'developer skin retains its AI card')
  assert.ok(w.document.querySelector('[data-canvas-open="ai-card"]'), 'developer skin retains its AI entry point')
})
