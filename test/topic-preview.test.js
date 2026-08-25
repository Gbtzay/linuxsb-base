/** 主楼预览：列表「预览」按钮 + 蒙层浮窗里同源 iframe 嵌帖并裁壳 */
import { test } from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { JSDOM } from 'jsdom'

const baseCode = readFileSync(new URL('../dist/linuxsb-base.user.js', import.meta.url), 'utf8')
const PLUG = (n) => readFileSync(new URL(`../plugins/${n}`, import.meta.url), 'utf8')
const homeHtml = readFileSync(new URL('./fixtures/home.html', import.meta.url), 'utf8')
const topicHtml = readFileSync(new URL('./fixtures/topic1.html', import.meta.url), 'utf8')

function makeSite(html, url, preload = {}) {
  const dom = new JSDOM(html, { url: 'https://linux.sb' + url, runScripts: 'outside-only' })
  const w = dom.window
  w.unsafeWindow = w
  w.requestAnimationFrame = (fn) => setTimeout(() => fn(Date.now()), 0)
  w.localStorage.setItem('lsb_base:__core:rate', JSON.stringify(10))
  w.localStorage.setItem('lsb_base:__core:urlPoll', JSON.stringify(0))
  for (const [k, v] of Object.entries(preload)) w.localStorage.setItem(k, JSON.stringify(v))
  const tick = (ms) => new Promise((r) => setTimeout(r, ms))
  async function until(fn, ms = 2000, step = 20) {
    const end = Date.now() + ms
    for (;;) {
      let ok = false
      try {
        ok = fn()
      } catch {
        /* keep polling */
      }
      if (ok) return true
      if (Date.now() > end) return false
      await tick(step)
    }
  }
  return { w, tick, until }
}

async function loadBase(w, ...plugins) {
  w.eval(baseCode)
  for (const code of plugins) w.eval(code)
  await new Promise((r) => setTimeout(r, 30))
}

function firstItem(w) {
  return w.document.querySelector('ul.post-list > li.post-item')
}

function previewBtns(w) {
  return w.document.querySelectorAll('.lsb-topic-preview-btn')
}

function previewFrame(w) {
  return w.document.querySelector('#lsb-topic-preview iframe')
}

function topicPath(href) {
  const m = String(href || '').match(/\/topic\/(\d+)/)
  return m ? `/topic/${m[1]}` : ''
}

function simulateFrameLoad(iframe) {
  const doc = iframe.contentDocument
  const markup =
    '<div class="top"><div class="bar">顶栏</div></div>' +
    '<nav class="forum-nav">版块</nav><aside class="sidebar">侧栏</aside>' +
    '<main class="forum-main"><p id="lsb-tp-op-mark">正文</p></main>' +
    '<footer class="footer">页脚</footer>'
  if (doc) {
    if (doc.documentElement) {
      doc.documentElement.innerHTML = '<head></head><body>' + markup + '</body>'
    } else {
      doc.write('<!doctype html><html><head></head><body>' + markup + '</body></html>')
      doc.close()
    }
  }
  iframe.dispatchEvent(new iframe.ownerDocument.defaultView.Event('load'))
}

test('主楼预览：首页每条有按钮，帖子页和用户页没有', async () => {
  const home = makeSite(homeHtml, '/')
  await loadBase(home.w, PLUG('topic-preview.user.js'))
  const items = home.w.document.querySelectorAll('ul.post-list > li.post-item')
  assert.ok(items.length > 0)
  assert.equal(previewBtns(home.w).length, items.length, '每条列表帖一条预览')
  const btn = firstItem(home.w).querySelector('.lsb-topic-preview-btn')
  assert.equal(btn.type, 'button')
  assert.equal(btn.textContent.trim(), '预览')
  assert.ok(firstItem(home.w).querySelector('.post-title-row .lsb-topic-preview-btn'), '按钮在标题行标题后面')

  const topic = makeSite(topicHtml, '/topic/1')
  await loadBase(topic.w, PLUG('topic-preview.user.js'))
  assert.equal(previewBtns(topic.w).length, 0, '帖子页不挂预览')

  const user = makeSite(homeHtml, '/user/1')
  await loadBase(user.w, PLUG('topic-preview.user.js'))
  assert.equal(previewBtns(user.w).length, 0, '用户页主题列表不挂预览')
})

test('主楼预览：点标题不开窗；点预览才嵌 iframe', async () => {
  const { w, tick, until } = makeSite(homeHtml, '/')
  await loadBase(w, PLUG('topic-preview.user.js'))

  firstItem(w).querySelector('a.post-title').click()
  await tick(40)
  assert.equal(w.document.getElementById('lsb-topic-preview'), null, '点标题不开预览窗')

  const href = firstItem(w).querySelector('a.post-title').getAttribute('href')
  firstItem(w).querySelector('.lsb-topic-preview-btn').click()
  assert.ok(await until(() => previewFrame(w)))
  assert.equal(topicPath(previewFrame(w).getAttribute('src') || previewFrame(w).src), topicPath(href))
})

test('主楼预览：先加载中，load 后裁壳并收起加载层', async () => {
  const { w, until } = makeSite(homeHtml, '/')
  await loadBase(w, PLUG('topic-preview.user.js'))
  firstItem(w).querySelector('.lsb-topic-preview-btn').click()
  const panel = w.document.getElementById('lsb-topic-preview')
  assert.ok(panel)
  assert.ok((panel.textContent || '').includes('加载中'))
  const iframe = previewFrame(w)
  assert.ok(iframe)
  simulateFrameLoad(iframe)
  assert.ok(await until(() => iframe.contentDocument?.getElementById('lsb-topic-preview-crop')))
  const crop = iframe.contentDocument.getElementById('lsb-topic-preview-crop').textContent
  assert.match(crop, /\.top/)
  assert.match(crop, /nav\.forum-nav/)
  assert.match(crop, /aside\.sidebar/)
  assert.match(crop, /footer\.footer/)
  assert.match(crop, /forum-layout-has-sidebar/)
  assert.match(crop, /grid-template-columns:1fr/)
  assert.match(crop, /main\.wrap/)
  const loading = panel.querySelector('[data-lsb-tp-loading]')
  assert.ok(loading.hidden || loading.style.display === 'none')
  assert.ok(panel.querySelector('a[href^="/topic/"]'), '卡底有打开帖子')
})

test('主楼预览：卡身样式能压过基座 flex:1，避免高度被收成 0', async () => {
  const { w } = makeSite(homeHtml, '/')
  await loadBase(w, PLUG('topic-preview.user.js'))
  firstItem(w).querySelector('.lsb-topic-preview-btn').click()
  const css = (w.document.getElementById('lsb-topic-preview-style')?.textContent || '').replace(/\s+/g, '')
  assert.match(css, /#lsb-topic-preview\.lsb-view\{[^}]*flex:00auto/, 'flex:0 0 auto，不被 .lsb-view{flex:1} 收成 0')
  assert.match(css, /#lsb-topic-preview\.lsb-view\{[^}]*height:min\(70vh,640px\)/)
})

test('主楼预览：contentDocument 抛错时仍收起加载层', async () => {
  const { w } = makeSite(homeHtml, '/')
  await loadBase(w, PLUG('topic-preview.user.js'))
  firstItem(w).querySelector('.lsb-topic-preview-btn').click()
  const panel = w.document.getElementById('lsb-topic-preview')
  const iframe = previewFrame(w)
  const loading = panel.querySelector('[data-lsb-tp-loading]')
  assert.ok(iframe)
  loading.hidden = false
  Object.defineProperty(iframe, 'contentDocument', {
    configurable: true,
    get() {
      throw new Error('Blocked a frame with origin "https://linux.sb" from accessing a cross-origin frame.')
    },
  })
  Object.defineProperty(iframe, 'contentWindow', {
    configurable: true,
    get() {
      throw new Error('Blocked a frame with origin "https://linux.sb" from accessing a cross-origin frame.')
    },
  })
  try {
    iframe.dispatchEvent(new iframe.ownerDocument.defaultView.Event('load'))
  } catch {
    /* 当前实现会把异常甩出监听器 */
  }
  assert.equal(loading.hidden, true, '裁壳失败也不能卡在加载中')
})

test('主楼预览：点另一条则换 iframe 地址', async () => {
  const { w, until } = makeSite(homeHtml, '/')
  await loadBase(w, PLUG('topic-preview.user.js'))
  const items = [...w.document.querySelectorAll('ul.post-list > li.post-item')]
  assert.ok(items.length >= 2)
  const path0 = topicPath(items[0].querySelector('a.post-title').getAttribute('href'))
  const path1 = topicPath(items[1].querySelector('a.post-title').getAttribute('href'))
  assert.notEqual(path0, path1)

  items[0].querySelector('.lsb-topic-preview-btn').click()
  assert.ok(await until(() => topicPath(previewFrame(w)?.getAttribute('src') || previewFrame(w)?.src) === path0))
  items[1].querySelector('.lsb-topic-preview-btn').click()
  assert.ok(await until(() => topicPath(previewFrame(w)?.getAttribute('src') || previewFrame(w)?.src) === path1))
  assert.equal(w.document.querySelectorAll('#lsb-topic-preview').length, 1, '仍是一扇窗')
  assert.ok((w.document.getElementById('lsb-topic-preview').textContent || '').includes('加载中'))
})

test('主楼预览：新插入的列表条目也会挂按钮；停用后按钮和浮窗都消失', async () => {
  const { w, until, tick } = makeSite(homeHtml, '/')
  await loadBase(w, PLUG('topic-preview.user.js'))

  const ul = w.document.querySelector('ul.post-list')
  const li = w.document.createElement('li')
  li.className = 'post-item'
  li.innerHTML =
    '<div class="post-body"><div class="post-title-row">' +
    '<a class="post-title" href="/topic/424242">后加载的帖</a></div></div>'
  ul.appendChild(li)
  assert.ok(await until(() => li.querySelector('.lsb-topic-preview-btn')))

  li.querySelector('.lsb-topic-preview-btn').click()
  assert.ok(await until(() => previewFrame(w)))
  assert.equal(topicPath(previewFrame(w).getAttribute('src') || previewFrame(w).src), '/topic/424242')

  w.LSB.disable('topic-preview')
  await tick(20)
  assert.equal(previewBtns(w).length, 0, '停用摘按钮')
  assert.equal(w.document.getElementById('lsb-topic-preview'), null, '停用关窗')
})
