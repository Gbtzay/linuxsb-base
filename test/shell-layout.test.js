import test from 'node:test'
import assert from 'node:assert/strict'
import {
  widthBucket,
  layoutStorageKey,
  snapRect,
  sanitizeShellLayout,
  defaultShellLayout,
  arrangeShellWindows,
  migrateLegacyShellLayout,
} from '../src/shell-layout.js'

const registry = [
  { id: 'nav', order: 10, defaultRect: { width: 240, height: 480 } },
  { id: 'content', order: 20, defaultRect: { width: 720, height: 480 } },
  { id: 'site', order: 30, defaultRect: { width: 280, height: 480 } },
]

test('widthBucket keeps both breakpoint edges stable', () => {
  assert.equal(widthBucket(1100), 'wide')
  assert.equal(widthBucket(1099), 'medium')
  assert.equal(widthBucket(700), 'medium')
  assert.equal(widthBucket(699), 'narrow')
})

test('layoutStorageKey isolates origin and width bucket', () => {
  assert.equal(layoutStorageKey('https://linux.sb', 'wide'), 'layout:v1:https%3A%2F%2Flinux.sb:wide')
  assert.notEqual(layoutStorageKey('https://linux.sb', 'wide'), layoutStorageKey('https://example.com', 'wide'))
  assert.notEqual(layoutStorageKey('https://linux.sb', 'wide'), layoutStorageKey('https://linux.sb', 'medium'))
})

test('snapRect uses a 12px grid and edge/window threshold without removing overlap', () => {
  const next = snapRect(
    { x: 247, y: 73, width: 300, height: 240 },
    { bounds: { x: 0, y: 0, width: 1000, height: 700 }, others: [{ x: 560, y: 72, width: 200, height: 240 }] },
  )
  assert.equal(next.x % 12, 0)
  assert.equal(next.y % 12, 0)
  assert.equal(next.y, 72)
  const overlap = snapRect(
    { x: 552, y: 72, width: 200, height: 240 },
    { bounds: { x: 0, y: 0, width: 1000, height: 700 }, others: [{ x: 560, y: 72, width: 200, height: 240 }] },
  )
  assert.equal(overlap.x, 552)
})

test('sanitizeShellLayout drops unknown windows and clamps invalid rectangles', () => {
  const out = sanitizeShellLayout(
    {
      version: 1,
      windows: {
        bad: { x: -99 },
        content: { x: -99, width: 2, height: 2 },
      },
      zOrder: ['bad', 'content'],
    },
    { width: 900, height: 600, registry },
  )
  assert.deepEqual(Object.keys(out.windows), ['content'])
  assert.ok(out.windows.content.width >= 240)
  assert.ok(out.windows.content.height >= 160)
  assert.ok(out.windows.content.x >= 0)
  assert.deepEqual(out.zOrder, ['content'])
})

test('default layout and arrange include only registered visible windows', () => {
  const initial = defaultShellLayout({ width: 1440, height: 900, registry })
  const arranged = arrangeShellWindows(initial, registry, { width: 1440, height: 900 })
  assert.deepEqual(Object.keys(arranged.windows), ['nav', 'content', 'site'])
  assert.equal(arranged.viewport.width, 1440)
  assert.ok(arranged.windows.content.x >= arranged.windows.nav.x)
  assert.ok(arranged.windows.site.x > arranged.windows.content.x)
})

test('default windows leave vertical travel room for title-bar dragging', () => {
  const layout = defaultShellLayout({ width: 1200, height: 900, registry })
  for (const id of ['nav', 'content', 'site']) {
    assert.equal(layout.windows[id].y, 12)
    assert.ok(layout.windows[id].height < 900 - 24)
  }
})

test('legacy three-column migration is idempotent in shape', () => {
  const out = migrateLegacyShellLayout({
    viewport: { width: 1440, height: 900 },
    legacy: { header: 48, rail: 240, aside: 280, asideActiveId: 'site' },
    registry,
  })
  assert.equal(out.version, 1)
  assert.deepEqual(Object.keys(out.windows), ['nav', 'content', 'site'])
  assert.equal(out.windows.nav.width, 240)
  assert.equal(out.windows.site.width, 280)
  assert.equal(out.compat?.asideActiveId, 'site')
})
