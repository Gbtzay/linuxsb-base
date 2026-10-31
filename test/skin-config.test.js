import test from 'node:test'
import assert from 'node:assert/strict'
import * as stateApi from '../plugins/skin/canvas-state.js'
import { sanitizeTokenValue } from '../src/shell/style.js'
import { isHttpsUrl } from '../src/shell/media.js'
import { createSkinConfigController } from '../plugins/skin/config-controller.js'

function fixture({ config = {}, records = new Map(), unavailable = false } = {}) {
  let raw = { shell: true, uiMode: 'ios27', topicSpa: false, ...config }
  let href = 'https://linux.sb/topic/1'
  let width = 1200
  const store = {
    get(key, fallback) { if (unavailable) throw new Error('storage unavailable'); return records.get(key) ?? fallback },
    set(key, value) { if (unavailable) throw new Error('storage unavailable'); records.set(key, value) },
  }
  const controller = createSkinConfigController({
    getConfig: () => raw, saveConfig: (patch) => { raw = { ...raw, ...patch } }, store,
    getLocation: () => href, getViewport: () => ({ width, height: 800 }),
    stateApi, sanitizeTokenValue, isHttpsUrl,
  })
  controller.read()
  return { controller, records, setContext(url, pixels) { href = url; width = pixels; controller.refreshContext() } }
}

// Missing validation or ignoring defer would persist rejected/unfinished input.
test('配置适配校验外观输入并在保存时复制状态', () => {
  const { controller: c, records } = fixture()
  const persisted = structuredClone(records.get(stateApi.CANVAS_STATE_KEY))
  assert.equal(c.setAppearance('fontSize', 100, { defer: true }), true)
  assert.equal(c.effective.appearance.fontSize, 32)
  assert.deepEqual(records.get(stateApi.CANVAS_STATE_KEY), persisted)
  assert.equal(c.setAppearance('backgroundVideoUrl', 'http://cdn.example/bg.mp4'), false)
  assert.equal(c.setAppearance('fontFamily', 'serif; color:red'), false)
  assert.equal(c.setAppearance('__proto__', {}), false)
  assert.equal(c.setAppearance('opacity', 'bad-number'), false)
  c.save()
  const saved = records.get(stateApi.CANVAS_STATE_KEY)
  assert.equal(saved.sites['https://linux.sb'].appearance.fontSize, 32)
  c.setAppearance('fontSize', 18, { defer: true })
  assert.equal(saved.sites['https://linux.sb'].appearance.fontSize, 32)
  assert.equal(c.tokenValues().baseFontSize, 18)
})

// Resetting the whole site, or reusing a width bucket, would lose unrelated settings.
test('配置适配按站点和宽度保存布局，外观与布局重置互不覆盖', () => {
  const { controller: c, setContext } = fixture()
  const wide = { x: 10, y: 20, width: 420, height: 300 }
  c.persistSurfaceRect('evidence-card', wide)
  setContext('https://linux.sb/topic/2', 800)
  const mid = { x: 0, y: 0, width: 350, height: 260 }
  c.persistSurfaceRect('evidence-card', mid)
  c.setAppearance('fontSize', 21)
  c.choosePreset('static-readable')
  assert.deepEqual(c.effective.layout.wide['evidence-card'], wide)
  assert.deepEqual(c.effective.layout.mid['evidence-card'], mid)
  assert.equal(c.effective.appearance.fontSize, 14, '预设清除当前站点外观覆盖')
  c.setAppearance('fontSize', 19)
  c.resetLayout()
  assert.deepEqual(c.effective.layout.wide, {})
  assert.equal(c.effective.appearance.fontSize, 19)
  setContext('https://other.example/', 1200)
  assert.equal(c.effective.appearance.fontSize, 14)
  c.persistSurfaceRect('evidence-card', wide)
  c.resetAppearance()
  assert.deepEqual(c.effective.layout.wide['evidence-card'], wide)
  setContext('https://linux.sb/', 1200)
  assert.equal(c.effective.appearance.fontSize, 19)
})

// Repeating migration would re-enable a user's later opt-out; storage failure must stay non-fatal.
test('配置适配迁移只执行一次，存储不可用仍可调整内存外观', () => {
  const first = fixture()
  assert.equal(first.controller.config.topicSpa, true)
  const again = fixture({ records: first.records, config: { topicSpa: false } })
  assert.equal(again.controller.config.topicSpa, false)
  const { controller: c } = fixture({ unavailable: true, config: { baseFontSize: 20 } })
  assert.equal(c.effective.appearance.fontSize, 20)
  assert.equal(c.setAppearance('fontSize', 24), true)
  assert.equal(c.effective.appearance.fontSize, 24)
  c.saveLegacyMedia('image', 'local-image')
  assert.equal(c.config.backgroundImageLocalKey, 'local-image')
  assert.equal(c.config.backgroundVideoEnabled, false)
  assert.equal(c.config.backgroundVideoLocalKey, '')
})
