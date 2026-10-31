import test from 'node:test'
import assert from 'node:assert/strict'
import { JSDOM } from 'jsdom'
import * as sharedMedia from '../src/shell/media.js'
import * as style from '../src/shell/style.js'

import { createSkinMediaController } from '../plugins/skin/media-controller.js'
const flush = () => new Promise((resolve) => setImmediate(resolve))
function deferred() {
  let resolve, reject
  const promise = new Promise((yes, no) => { resolve = yes; reject = no })
  return { promise, resolve, reject }
}

async function fixture(t, mediaPatch = {}) {
  const { window: w } = new JSDOM('<body><main></main></body>', { url: 'https://linux.sb/' })
  const root = w.document.documentElement
  const urls = new Map(), revoked = [], pendingFonts = [], notices = []
  let serial = 0
  w.URL.createObjectURL = (file) => { const url = `blob:media-${++serial}`; urls.set(url, file); return url }
  w.URL.revokeObjectURL = (url) => { revoked.push(url); urls.delete(url) }
  w.HTMLMediaElement.prototype.load = () => {}
  w.HTMLMediaElement.prototype.pause = () => {}
  w.HTMLMediaElement.prototype.play = () => Promise.resolve()
  w.document.fonts = new Set()
  class FontFace {
    constructor(family, source) { this.family = family; this.source = source }
    load() { const task = deferred(); pendingFonts.push({ ...task, face: this }); return task.promise }
  }
  const media = { ...sharedMedia, loadFontFace: (args) => sharedMedia.loadFontFace({ ...args, FontFaceCtor: FontFace }), ...mediaPatch }
  const context = { config: { shell: true }, appearance: {}, workspace: w.document.querySelector('main'), canvasMode: false }
  const controller = createSkinMediaController({ window: w, document: w.document, media, style, getContext: () => context, toast: (...args) => notices.push(args) })
  t.after(() => { controller.dispose(); w.close() })
  return { w, root, context, controller, urls, revoked, pendingFonts, notices, media }
}

test('背景与字体请求独立，重复同步只注册一个待加载字体', async (t) => {
  const f = await fixture(t)
  f.context.appearance.fontUrl = 'https://cdn.example/font.woff2'
  const first = f.controller.sync()
  await flush()
  f.context.appearance.background = 'image'
  f.context.appearance.backgroundImageUrl = 'https://cdn.example/bg.png'
  const second = f.controller.sync()
  await flush()
  assert.equal(f.pendingFonts.length, 1)
  f.pendingFonts[0].resolve()
  await Promise.all([first, second])
  assert.equal(f.root.style.getPropertyValue('--lsb-shell-font-family'), 'LSBShellUserFont')
  assert.equal(f.w.document.fonts.size, 1)
  assert.ok(f.context.workspace.querySelector('img'))
})

test('字体晚到成功释放过期 face 和本地 URL', async (t) => {
  const f = await fixture(t)
  f.context.appearance.fontLocalKey = await f.controller.saveFile('font', new Blob(['font'], { type: 'font/woff2' }))
  const old = f.controller.sync()
  await flush()
  const oldUrl = [...f.urls.keys()][0]
  assert.ok(oldUrl)
  f.context.appearance.fontUrl = 'https://cdn.example/new.woff2'
  const next = f.controller.sync()
  await flush()
  f.pendingFonts[1].resolve()
  await next
  f.pendingFonts[0].resolve()
  await old
  assert.deepEqual([...f.w.document.fonts], [f.pendingFonts[1].face])
  assert.deepEqual(f.revoked, [oldUrl])
  f.controller.dispose()
  assert.equal(f.w.document.fonts.size, 0)
  assert.deepEqual(f.revoked, [oldUrl])
})

test('旧字体失败不清空新字体或显示过期提示', async (t) => {
  const f = await fixture(t)
  f.context.appearance.fontUrl = 'https://cdn.example/old.woff2'
  const old = f.controller.sync()
  await flush()
  f.context.appearance.fontUrl = 'https://cdn.example/new.woff2'
  const next = f.controller.sync()
  await flush()
  f.pendingFonts[1].resolve()
  await next
  f.pendingFonts[0].reject(new Error('network'))
  await old
  assert.equal(f.root.style.getPropertyValue('--lsb-shell-font-family'), 'LSBShellUserFont')
  assert.deepEqual([...f.w.document.fonts], [f.pendingFonts[1].face])
  assert.deepEqual(f.notices, [])
})

test('停用使晚到字体释放，reset 后可重新加载', async (t) => {
  const f = await fixture(t)
  f.context.appearance.fontUrl = 'https://cdn.example/font.woff2'
  const old = f.controller.sync()
  await flush()
  f.controller.reset()
  const next = f.controller.sync()
  await flush()
  f.pendingFonts[0].resolve()
  await old
  assert.equal(f.w.document.fonts.size, 0)
  f.pendingFonts[1].resolve()
  await next
  assert.equal(f.w.document.fonts.size, 1)
  f.controller.dispose()
  await f.controller.sync()
  assert.equal(f.w.document.fonts.size, 0)
  assert.equal(f.pendingFonts.length, 2)
  assert.equal(f.root.style.getPropertyValue('--lsb-shell-font-family'), '')
})

test('同一字体同步恢复被外观令牌重写的字体变量', async (t) => {
  const f = await fixture(t)
  f.context.appearance.fontUrl = 'https://cdn.example/font.woff2'
  const task = f.controller.sync()
  await flush()
  f.pendingFonts[0].resolve()
  await task
  f.root.style.setProperty('--lsb-shell-font-family', 'system-ui')
  await f.controller.sync()
  assert.equal(f.root.style.getPropertyValue('--lsb-shell-font-family'), 'LSBShellUserFont')
  assert.equal(f.pendingFonts.length, 1)
})

test('字体失败使用最新配置的安全字体回退', async (t) => {
  const f = await fixture(t)
  f.context.appearance = { fontUrl: 'https://cdn.example/font.woff2', fontFamily: 'system-ui' }
  const task = f.controller.sync()
  await flush()
  f.context.appearance.fontFamily = 'serif'
  const same = f.controller.sync()
  f.pendingFonts[0].reject(new Error('network'))
  await Promise.all([task, same])
  assert.equal(f.root.style.getPropertyValue('--lsb-shell-font-family'), 'serif')
  assert.equal(f.notices.length, 1)
})

for (const kind of ['video', 'image', 'font']) {
  test(`${kind} 同键上传后替换资源并且只释放一次`, async (t) => {
    const f = await fixture(t)
    const localField = kind === 'font' ? 'fontLocalKey' : kind === 'image' ? 'backgroundImageLocalKey' : 'backgroundVideoLocalKey'
    f.context.appearance.background = kind === 'font' ? 'static' : kind
    for (let i = 0; i < 2; i++) {
      const file = new Blob([String(i)], { type: kind === 'font' ? 'font/woff2' : `${kind}/${kind === 'image' ? 'png' : 'mp4'}` })
      f.context.appearance[localField] = await f.controller.saveFile(kind, file)
      const task = f.controller.sync()
      await flush()
      if (kind === 'font') f.pendingFonts[i].resolve()
      await task
      assert.equal([...f.urls.values()][0], file)
      assert.equal(f.urls.size, 1)
    }
    assert.deepEqual(f.revoked, ['blob:media-1'])
    f.controller.reset()
    f.controller.reset()
    assert.equal(f.urls.size, 0)
    assert.deepEqual(f.revoked, ['blob:media-1', 'blob:media-2'])
    assert.equal(f.w.document.fonts.size, 0)
    assert.equal(f.w.document.querySelector('video, img'), null)
  })
}

test('相同源在宿主替换和关闭时迁移或释放背景', async (t) => {
  const f = await fixture(t)
  f.context.appearance = { background: 'image', backgroundImageUrl: 'https://cdn.example/bg.png' }
  await f.controller.sync()
  const original = f.context.workspace.querySelector('img')
  f.context.workspace = f.w.document.body
  f.context.canvasMode = true
  await f.controller.sync()
  const current = f.w.document.querySelector('img')
  assert.notEqual(current, original)
  assert.equal(original.isConnected, false)
  assert.equal(current.parentElement, f.w.document.body)
  assert.equal(current.dataset.lsbShellImageLayer, 'canvas')
  f.context.config.shell = false
  await f.controller.sync()
  assert.equal(current.isConnected, false)
  assert.equal(f.root.classList.contains('lsb-skin-image-on'), false)
})

test('本地背景优先、字体 HTTPS 优先，缺失本地背景退回 HTTPS', async (t) => {
  const f = await fixture(t)
  const key = await f.controller.saveFile('image', new Blob(['bg'], { type: 'image/png' }))
  f.context.appearance = { background: 'image', backgroundImageLocalKey: key, backgroundImageUrl: 'https://cdn.example/bg.png', fontLocalKey: 'unused', fontUrl: 'https://cdn.example/font.woff2' }
  const task = f.controller.sync()
  await flush()
  f.pendingFonts[0].resolve()
  await task
  assert.match(f.w.document.querySelector('img').src, /^blob:/)
  assert.equal(f.pendingFonts[0].face.source, 'url(https://cdn.example/font.woff2)')
  f.context.appearance.backgroundImageLocalKey = 'missing-key'
  await f.controller.sync()
  assert.equal(f.w.document.querySelector('img').src, 'https://cdn.example/bg.png')
  f.context.appearance.backgroundImageUrl = 'http://cdn.example/bg.png'
  await f.controller.sync()
  assert.equal(f.w.document.querySelector('img'), null)
})

test('在途背景读取消失效，过期结果不能创建对象 URL', async (t) => {
  const read = deferred()
  const f = await fixture(t, { readMedia: () => read.promise })
  f.context.appearance = { background: 'image', backgroundImageLocalKey: 'slow' }
  const task = f.controller.sync()
  await flush()
  f.controller.reset()
  read.resolve(new Blob(['bg'], { type: 'image/png' }))
  await task
  assert.equal(f.urls.size, 0)
  assert.equal(f.w.document.querySelector('img'), null)
})

test('相同本地背景在途同步去重', async (t) => {
  const read = deferred()
  let reads = 0
  const f = await fixture(t, { readMedia: () => { reads++; return read.promise } })
  f.context.appearance = { background: 'image', backgroundImageLocalKey: 'slow' }
  const a = f.controller.sync(), b = f.controller.sync()
  await flush()
  assert.equal(reads, 1)
  read.resolve(new Blob(['bg'], { type: 'image/png' }))
  await Promise.all([a, b])
  assert.equal(f.urls.size, 1)
  assert.equal(f.w.document.querySelectorAll('img').length, 1)
})

test('替换视频清理监听器，晚到播放失败不影响新图片', async (t) => {
  const f = await fixture(t)
  const play = deferred()
  f.w.HTMLMediaElement.prototype.play = () => play.promise
  f.context.appearance = { background: 'video', backgroundVideoUrl: 'https://cdn.example/old.mp4' }
  const task = f.controller.sync()
  const video = f.w.document.querySelector('video')
  assert.ok(video)
  f.context.appearance = { background: 'image', backgroundImageUrl: 'https://cdn.example/new.png' }
  await f.controller.sync()
  video.dispatchEvent(new f.w.Event('error'))
  play.reject(new Error('blocked'))
  await task
  assert.equal(video.isConnected, false)
  assert.equal(video.hasAttribute('src'), false)
  assert.equal(f.root.classList.contains('lsb-skin-video-on'), false)
  assert.equal(f.root.classList.contains('lsb-skin-image-on'), true)
  assert.deepEqual(f.notices, [])
})

test('媒体库晚到关闭且可重新打开，已开连接 reset 只关闭一次', async (t) => {
  const opens = []
  const f = await fixture(t, { openMediaDb: () => { const task = deferred(); opens.push(task); return task.promise } })
  const old = f.controller.saveFile('image', new Blob(['bg'], { type: 'image/png' }))
  const cancelled = assert.rejects(old, { name: 'AbortError' })
  await flush()
  f.controller.reset()
  let closedOld = 0, closedNew = 0
  opens[0].resolve({ memory: true, close() { closedOld++ } })
  await cancelled
  assert.equal(closedOld, 1)
  const next = f.controller.saveFile('image', new Blob(['bg'], { type: 'image/png' }))
  await flush()
  opens[1].resolve({ memory: true, close() { closedNew++ } })
  assert.equal(await next, 'https://linux.sb:image')
  f.controller.reset()
  f.controller.reset()
  assert.equal(closedOld, 1)
  assert.equal(closedNew, 1)
})

test('保存完成前停用拒绝结果，避免上传回调继续应用外观', async (t) => {
  const write = deferred()
  const f = await fixture(t, { writeMedia: () => write.promise })
  const save = f.controller.saveFile('image', new Blob(['bg'], { type: 'image/png' }))
  const cancelled = assert.rejects(save, { name: 'AbortError' })
  await flush()
  f.controller.dispose()
  write.resolve()
  await cancelled
  await assert.rejects(f.controller.saveFile('image', new Blob(['bg'], { type: 'image/png' })), { name: 'AbortError' })
  assert.equal(f.w.document.querySelector('img'), null)
})

test('非法文件拒绝保存，数据库不可用不吞掉写入错误', async (t) => {
  const f = await fixture(t, { openMediaDb: () => Promise.reject(new Error('db unavailable')) })
  await assert.rejects(f.controller.saveFile('video', new Blob(['bad'], { type: 'text/plain' })), /invalid-type/)
  await assert.rejects(f.controller.saveFile('image', new Blob(['bg'], { type: 'image/png' })), /media-store-unavailable/)
})

test('临时读取失败后相同背景配置可重试，在途重试仍去重', async (t) => {
  let attempts = 0
  const next = deferred()
  const f = await fixture(t, { readMedia: () => ++attempts === 1 ? Promise.reject(new Error('transient')) : next.promise })
  f.context.appearance = { background: 'image', backgroundImageLocalKey: 'transient' }
  await f.controller.sync()
  assert.equal(f.w.document.querySelector('img'), null)
  const retry = f.controller.sync(), duplicate = f.controller.sync()
  await flush()
  assert.equal(attempts, 2)
  next.resolve(new Blob(['bg'], { type: 'image/png' }))
  await Promise.all([retry, duplicate])
  assert.ok(f.w.document.querySelector('img'))
  assert.equal(f.urls.size, 1)
})

test('字体临时加载失败后相同配置可重试', async (t) => {
  const f = await fixture(t)
  f.context.appearance.fontUrl = 'https://cdn.example/font.woff2'
  const first = f.controller.sync()
  await flush()
  f.pendingFonts[0].reject(new Error('transient'))
  await first
  const retry = f.controller.sync(), duplicate = f.controller.sync()
  await flush()
  assert.equal(f.pendingFonts.length, 2)
  f.pendingFonts[1].resolve()
  await Promise.all([retry, duplicate])
  assert.equal(f.w.document.fonts.size, 1)
  assert.equal(f.root.style.getPropertyValue('--lsb-shell-font-family'), 'LSBShellUserFont')
})
