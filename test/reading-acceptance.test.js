import { test } from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { makeDom, tick, until } from './helpers/setup.js'

const base = readFileSync(new URL('../dist-dev/linuxsb-base.user.js', import.meta.url), 'utf8')
const skin = readFileSync(new URL('../plugins/skin.user.js', import.meta.url), 'utf8')
const liveFeed = readFileSync(new URL('../plugins/live-feed.user.js', import.meta.url), 'utf8')
const topic = readFileSync(new URL('./fixtures/topic1.html', import.meta.url), 'utf8')
const reply = '<li class="post-entry" id="post-999991" data-floor="401">' +
  '<a class="post-author" href="/user/9">新读者</a><div class="post-content">阅读验收新回复</div></li>'

async function setup(t, uiMode) {
  const { w } = makeDom(topic, 'https://linux.sb/topic/1', {
    'lsb_base:skin:__config': { uiMode, topicSpa: true },
    'lsb_base:skin:topicSpaNewWorldDefaultMigrationV1': true,
    'lsb_base:live-feed:__config': {
      jitterMs: 0, pollSec: 300, bgSec: 300, autoInsert: true, pauseWhileTyping: true,
    },
  })
  Object.defineProperty(w, 'innerWidth', { configurable: true, value: 1440 })
  Object.defineProperty(w.document, 'visibilityState', { configurable: true, get: () => 'visible' })
  // Only the transport is replaced; parsing, routing, DOM, input and lifecycle are real.
  let respond = async (url) => ({ status: 200, ok: true, url: String(url), text: async () => topic })
  const requests = []
  w.fetch = (url, init) => {
    requests.push({ url: String(url), init })
    return respond(url, init)
  }
  t.after(() => {
    w.LSB?.disable('live-feed')
    w.LSB?.disable('skin')
    w.close()
  })
  w.eval(base)
  w.eval(skin)
  assert.ok(await until(() => w.document.querySelector('#lsb-shell')), `${uiMode}: shell mounted`)
  w.eval(liveFeed)
  const feed = await w.LSB.bus.request('live-feed:debug')
  await feed.pollOnce()
  assert.equal(feed.mode(), 'topic')
  const doc = new w.DOMParser().parseFromString(topic, 'text/html')
  doc.querySelector('ul.topic-post-list').insertAdjacentHTML('beforeend', reply)
  const updated = doc.documentElement.outerHTML
  return {
    w, feed, requests, updated,
    serve(html) { respond = async (url) => ({ status: 200, ok: true, url: String(url), text: async () => html }) },
    defer() {
      let release
      let signal
      respond = (url, init) => new Promise((resolve) => {
        signal = init.signal
        release = () => resolve({ status: 200, ok: true, url: String(url), text: async () => updated })
      })
      return { ready: () => !!release, release: () => release(), signal: () => signal }
    },
  }
}

for (const uiMode of ['legacy', 'ios27']) {
  test(`${uiMode} 阅读：新回复等待草稿清空，保留编辑器、选区和原楼层`, async (t) => {
    const { w, feed, serve, updated } = await setup(t, uiMode)
    const editor = w.document.querySelector('form.ajax-reply-form textarea')
    const firstPost = w.document.querySelector('li.post-entry')
    assert.ok(editor, 'fixture includes the real reply editor')
    editor.value = '正在输入的回复草稿'
    editor.focus()
    editor.setSelectionRange(2, 6)
    editor.dispatchEvent(new w.CompositionEvent('compositionstart', { bubbles: true }))
    serve(updated)
    assert.equal(await feed.pollOnce(), 1)
    assert.equal(w.document.getElementById('post-999991'), null, 'typing must defer insertion')
    assert.match(w.document.querySelector('.lsb-live-banner')?.textContent || '', /写完自动加载/)
    assert.equal(w.document.activeElement, editor)
    assert.equal(editor.value, '正在输入的回复草稿')
    assert.equal(editor.selectionStart, 2)
    assert.equal(editor.selectionEnd, 6)
    assert.equal(w.document.querySelector('li.post-entry'), firstPost)

    editor.dispatchEvent(new w.CompositionEvent('compositionend', { bubbles: true }))
    editor.blur()
    await tick(25)
    assert.equal(w.document.getElementById('post-999991'), null, 'an unfocused draft still blocks insertion')
    editor.focus()
    editor.value = ''
    editor.dispatchEvent(new w.Event('input', { bubbles: true }))
    editor.blur()
    assert.ok(await until(() => w.document.getElementById('post-999991')))
    assert.equal(w.document.querySelector('form.ajax-reply-form textarea'), editor)
    assert.equal(w.document.querySelector('.lsb-live-banner')?.style.display, 'none')
    await feed.pollOnce()
    assert.equal(w.document.querySelectorAll('#post-999991').length, 1, 'repeat polling must not duplicate replies')
  })

  test(`${uiMode} 阅读：切换界面保留草稿和原生节点，后续回复只插入一次`, async (t) => {
    const { w, feed, serve, updated } = await setup(t, uiMode)
    const editor = w.document.querySelector('form.ajax-reply-form textarea')
    const list = w.document.querySelector('ul.topic-post-list')
    editor.value = '切换界面前的草稿'
    editor.setSelectionRange(1, 4)
    serve(updated)
    await feed.pollOnce()
    assert.equal(feed.pending(), 1)
    const otherMode = uiMode === 'legacy' ? 'ios27' : 'legacy'
    const key = 'lsb_base:skin:__config'
    w.localStorage.setItem(key, JSON.stringify({ uiMode: otherMode, topicSpa: true }))
    w.LSB.bus.emit('config:changed:skin', { uiMode: otherMode }, { source: 'core' })
    assert.ok(await until(() => otherMode === 'ios27'
      ? w.document.querySelector('#lsb-shell-surfaces')
      : w.document.querySelector('#lsb-shell-rail')))
    assert.equal(w.document.querySelector('ul.topic-post-list'), list)
    assert.equal(w.document.querySelector('form.ajax-reply-form textarea'), editor)
    assert.equal(editor.value, '切换界面前的草稿')
    assert.equal(editor.selectionStart, 1)
    assert.equal(editor.selectionEnd, 4)
    assert.equal(w.document.querySelector('#post-999991'), null)
    editor.focus()
    editor.value = ''
    editor.blur()
    assert.ok(await until(() => w.document.getElementById('post-999991')))
    await feed.pollOnce()
    assert.equal(list.querySelectorAll('#post-999991').length, 1)
    w.LSB.disable('skin')
    assert.ok(await until(() => !w.document.querySelector('#lsb-shell')))
    assert.ok(editor.isConnected && list.isConnected, 'native reading and reply DOM survive disable')
  })

  test(`${uiMode} 阅读：停用实时流中止在途请求，迟到响应和旧按钮不能写回`, async (t) => {
    const { w, feed, defer, serve, updated, requests } = await setup(t, uiMode)
    const list = w.document.querySelector('ul.topic-post-list')
    const editor = w.document.querySelector('form.ajax-reply-form textarea')
    editor.value = '停用时保留的草稿'
    serve(updated)
    await feed.pollOnce()
    const oldBanner = w.document.querySelector('.lsb-live-banner')
    assert.ok(oldBanner, 'pending reply has a real load action')
    const transport = defer()
    const polling = feed.pollOnce()
    assert.ok(await until(transport.ready))
    w.LSB.disable('live-feed')
    assert.equal(transport.signal()?.aborted, true)
    transport.release()
    await polling
    oldBanner.click()
    editor.focus()
    editor.value = ''
    editor.blur()
    w.document.dispatchEvent(new w.Event('visibilitychange'))
    const requestCount = requests.length
    await tick(50)
    assert.equal(requests.length, requestCount, 'dispose removes event driven polling')
    assert.equal(list.querySelector('#post-999991'), null)
    assert.equal(w.document.querySelector('.lsb-live-banner'), null)
    assert.equal(feed.pending(), 0)
    assert.equal(feed.mode(), null)
    assert.equal(w.document.querySelector('form.ajax-reply-form textarea'), editor)
    serve(updated)
    w.LSB.enable('live-feed')
    const resumed = await w.LSB.bus.request('live-feed:debug')
    await resumed.pollOnce()
    assert.ok(await until(() => list.querySelector('#post-999991')), 'reenabling creates a fresh working lifecycle')
    assert.equal(list.querySelectorAll('#post-999991').length, 1)
  })
}
