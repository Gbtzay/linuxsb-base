import test from 'node:test'
import assert from 'node:assert/strict'
import { clearMedia, isHttpsUrl, loadFontFace, openMediaDb, readMedia, validateMediaDescriptor, validateMediaFile, writeMedia } from '../src/shell-media.js'

test('媒体协议和视频/图片/字体大小分别校验', () => {
  assert.equal(isHttpsUrl('https://cdn.example/video.mp4'), true)
  assert.equal(isHttpsUrl('http://cdn.example/video.mp4'), false)
  assert.equal(isHttpsUrl('//cdn.example/video.mp4'), false)
  assert.equal(validateMediaFile({ size: 50 * 1024 * 1024, type: 'video/mp4' }, { kind: 'video' }).ok, true)
  assert.equal(validateMediaFile({ size: 50 * 1024 * 1024 + 1, type: 'video/mp4' }, { kind: 'video' }).ok, false)
  assert.equal(validateMediaFile({ size: 20 * 1024 * 1024, type: 'image/png' }, { kind: 'image' }).ok, true)
  assert.equal(validateMediaFile({ size: 20 * 1024 * 1024 + 1, type: 'image/png' }, { kind: 'image' }).ok, false)
  assert.equal(validateMediaFile({ size: 10 * 1024 * 1024 + 1, type: 'font/woff2' }, { kind: 'font' }).ok, false)
})

test('媒体描述只接受 HTTPS 或受限本地记录', () => {
  assert.equal(validateMediaDescriptor('video', { source: 'https://cdn.example/video.mp4' }).ok, true)
  assert.equal(validateMediaDescriptor('video', { source: 'http://cdn.example/video.mp4' }).ok, false)
  assert.equal(validateMediaDescriptor('video', { size: 50 * 1024 * 1024 + 1 }).ok, false)
  assert.equal(validateMediaDescriptor('image', { source: 'https://cdn.example/background.png' }).ok, true)
  assert.equal(validateMediaDescriptor('image', { mime: 'image/png', size: 20 * 1024 * 1024 + 1 }).ok, false)
  assert.equal(validateMediaDescriptor('font', { size: 10 * 1024 * 1024 + 1 }).ok, false)
  assert.equal(validateMediaDescriptor('font', { source: 'https://cdn.example/font.woff2', mime: 'font/woff2' }).ok, true)
})

test('没有 IndexedDB 时媒体读写回退到内存，按 kind/key 隔离', async () => {
  const db = await openMediaDb(null)
  await writeMedia({ db, kind: 'video', key: 'site:a', value: { bytes: 1 } })
  await writeMedia({ db, kind: 'image', key: 'site:a', value: { bytes: 4 } })
  await writeMedia({ db, kind: 'font', key: 'site:a', value: { bytes: 2 } })
  assert.deepEqual(await readMedia({ db, kind: 'video', key: 'site:a' }), { bytes: 1 })
  assert.deepEqual(await readMedia({ db, kind: 'image', key: 'site:a' }), { bytes: 4 })
  assert.deepEqual(await readMedia({ db, kind: 'font', key: 'site:a' }), { bytes: 2 })
  await clearMedia({ db, kind: 'video', key: 'site:a' })
  assert.equal(await readMedia({ db, kind: 'video', key: 'site:a' }), null)
  assert.deepEqual(await readMedia({ db, kind: 'font', key: 'site:a' }), { bytes: 2 })
})

test('IndexedDB 打开失败时媒体读写也回退到内存', async () => {
  const indexedDBRef = {
    open() {
      const request = {}
      queueMicrotask(() => {
        request.error = new Error('indexeddb-disabled')
        request.onerror?.()
      })
      return request
    },
  }
  const db = await openMediaDb(indexedDBRef)
  assert.equal(db.memory, true)
  await writeMedia({ db, kind: 'video', key: 'private:video', value: { bytes: 3 } })
  assert.deepEqual(await readMedia({ db, kind: 'video', key: 'private:video' }), { bytes: 3 })
})

test('FontFace 加载成功可加入 document，失败释放 object URL', async () => {
  const added = new Set()
  const removed = []
  const documentRef = { fonts: { add: (face) => added.add(face), delete: (face) => added.delete(face) } }
  class FakeFontFace {
    constructor(family, source) { this.family = family; this.source = source }
    async load() { return this }
  }
  const face = await loadFontFace({ family: 'Demo', source: 'url(https://cdn.example/demo.woff2)', document: documentRef, FontFaceCtor: FakeFontFace })
  assert.equal(added.has(face), true)
  face.dispose()
  assert.equal(added.has(face), false)

  class FailingFontFace extends FakeFontFace { async load() { throw new Error('bad-font') } }
  const URLCtor = { createObjectURL: () => 'blob:test-font', revokeObjectURL: (url) => removed.push(url) }
  await assert.rejects(
    loadFontFace({ family: 'Bad', source: new Blob(['x'], { type: 'font/woff2' }), document: documentRef, FontFaceCtor: FailingFontFace, URLCtor }),
  )
  assert.deepEqual(removed, ['blob:test-font'])
})

