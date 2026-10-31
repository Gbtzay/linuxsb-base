import test from 'node:test'
import assert from 'node:assert/strict'
import { JSDOM } from 'jsdom'
import { createSkinOnlineController } from '../plugins/skin/online-controller.js'

const boot = (ids, label = '在线') => `<span hidden data-online-users-ids="${ids}" data-online-users-label="${label}"></span>`
const avatar = (id) => `<a href="/user/${id}"><img class="avatar-img" alt="${id}"></a>`
const settle = () => new Promise((resolve) => setImmediate(resolve))

function fixture(t, html = boot('1') + avatar('1') + avatar('2')) {
  const dom = new JSDOM(html, { url: 'https://linux.sb/topic/7?p=2', pretendToBeVisual: true, runScripts: 'outside-only' })
  const window = dom.window
  const document = window.document
  let time = 100000
  let sequence = 0
  let enabled = true
  let visibility = 'visible'
  let requestImpl
  const timers = new Map()
  const requests = []
  window.Date.now = () => time
  window.setTimeout = (fn, delay = 0) => {
    const id = ++sequence
    timers.set(id, { at: time + Number(delay), fn })
    return id
  }
  window.clearTimeout = (id) => timers.delete(id)
  Object.defineProperty(document, 'visibilityState', { get: () => visibility })
  const controller = createSkinOnlineController({
    window,
    document,
    isEnabled: () => enabled,
    isChallengeDocument: (doc) => doc.documentElement.hasAttribute('data-challenge'),
    request(path, options) {
      const call = { path, options }
      requests.push(call)
      if (requestImpl) return requestImpl(call)
      return new Promise((resolve, reject) => Object.assign(call, {
        resolve: (html, ok = true) => resolve({ ok, text: html }), reject,
      }))
    },
  })
  t.after(() => { controller.stop(); window.close() })
  async function advance(ms = 0) {
    const end = time + ms
    for (let count = 0; ; count++) {
      assert.ok(count < 100, 'timer loop must terminate')
      await settle()
      const next = [...timers].sort((a, b) => a[1].at - b[1].at)[0]
      if (!next || next[1].at > end) break
      const [id, job] = next
      time = job.at
      timers.delete(id)
      job.fn()
    }
    time = end
    await settle()
  }
  return {
    controller, window, document, requests, timers, advance,
    parse: (html) => new window.DOMParser().parseFromString(html, 'text/html'),
    ids: () => document.querySelector('[data-online-users-ids]')?.dataset.onlineUsersIds,
    dot: (id) => document.querySelector(`img[alt="${id}"]`)?.parentElement.querySelector('.online-users-dot'),
    enable: (value) => { enabled = value },
    respondWith: (fn) => { requestImpl = fn },
    visible(value) {
      visibility = value
      document.dispatchEvent(new window.Event('visibilitychange'))
    },
  }
}

async function refresh(f) {
  f.controller.start()
  f.controller.scheduleRefresh(0, true, true)
  await f.advance()
}

test('在线绿点保留原生卡片内容，支持显式用户标记与旧式链接', (t) => {
  const f = fixture(t, boot('1, 2,3', '正在浏览') + avatar('1') + avatar('9')
    + '<a href="/index.php?a=user&id=2"><img class="avatar-img" alt="2"></a>'
    + '<div data-online-user-id="3"><span><img class="avatar-img" alt="3"></span></div>'
    + '<section class="online-users-card"><h2>当前在线 9 人</h2><p>保留成员</p></section>')
  const card = f.document.querySelector('.online-users-card')
  const original = card.outerHTML
  assert.equal(f.controller.syncDots(), true)
  for (const id of ['1', '2', '3']) assert.equal(f.dot(id)?.title, '正在浏览')
  assert.equal(f.dot('9'), null)
  const existing = f.dot('1')
  f.controller.syncDots()
  assert.equal(f.dot('1'), existing, 'repeated sync preserves the dot node')
  f.controller.syncBoot(f.parse(boot('9')))
  assert.equal(f.dot('1'), null)
  assert.equal(f.document.querySelector('img[alt="1"]').parentElement.classList.contains('online-users-host'), false)
  assert.ok(f.dot('9'))
  assert.equal(card.outerHTML, original)
})

test('缺失在线清单保持已有标记，远端同步只导入清单属性', (t) => {
  const f = fixture(t, avatar('1'))
  assert.equal(f.controller.syncDots(), false)
  assert.equal(f.controller.syncBoot(f.parse('<p>no list</p>')), false)
  assert.equal(f.controller.syncBoot(f.parse(boot('1') + '<div id="foreign">foreign</div>')), true)
  assert.equal(f.ids(), '1')
  assert.equal(f.document.querySelector('[data-online-users-ids]').hidden, true)
  assert.equal(f.document.getElementById('foreign'), null)
  assert.ok(f.dot('1'))
})

test('重复启动只建立一条周期刷新，并保留原有请求选项', async (t) => {
  const f = fixture(t)
  f.controller.start()
  f.controller.start()
  assert.ok(f.dot('1'))
  assert.equal(f.timers.size, 1)
  await f.advance(29999)
  assert.equal(f.requests.length, 0)
  await f.advance(1)
  assert.equal(f.requests.length, 1)
  assert.equal(f.requests[0].path, '/')
  assert.deepEqual(f.requests[0].options, {
    queue: false, timeout: 15000, retry: 0, headers: { 'cache-control': 'no-cache' },
  })
  f.requests[0].resolve(boot('2'))
  await f.advance()
  assert.equal(f.ids(), '2')
  assert.equal(f.dot('1'), null)
  assert.ok(f.dot('2'))
  assert.equal(f.timers.size, 1)
})

test('延迟头像合并处理，停止清理头像计时器和观察器并可重启', async (t) => {
  const f = fixture(t, boot('1,2,3'))
  f.controller.start()
  f.document.body.insertAdjacentHTML('beforeend', avatar('1') + avatar('2'))
  await f.advance(49)
  assert.equal(f.dot('1'), null)
  assert.equal(f.timers.size, 2)
  await f.advance(1)
  assert.ok(f.dot('1'))
  assert.ok(f.dot('2'))
  f.document.body.insertAdjacentHTML('beforeend', avatar('3'))
  await settle()
  f.controller.stop()
  f.controller.stop()
  assert.equal(f.timers.size, 0)
  await f.advance(60000)
  assert.equal(f.dot('3'), null)
  f.document.body.insertAdjacentHTML('beforeend', avatar('4'))
  await settle()
  assert.equal(f.timers.size, 0)
  f.controller.start()
  assert.ok(f.dot('3'))
})

test('隐藏页暂停周期请求，恢复可见只补一次，停止后不响应可见性事件', async (t) => {
  const f = fixture(t)
  f.visible('hidden')
  f.controller.start()
  await f.advance(60000)
  assert.equal(f.requests.length, 0)
  f.visible('visible')
  f.visible('visible')
  await f.advance()
  assert.equal(f.requests.length, 1)
  f.controller.stop()
  f.requests[0].resolve(boot('2'))
  await f.advance()
  f.visible('hidden')
  f.visible('visible')
  await f.advance(60000)
  assert.equal(f.requests.length, 1)
  assert.equal(f.ids(), '1')
})

test('普通调度尊重成功同步的冷却期，即时路由刷新可以绕过', async (t) => {
  const f = fixture(t)
  f.controller.start()
  f.controller.syncBoot(f.parse(boot('2')))
  await f.advance(1000)
  f.controller.scheduleRefresh(0, true)
  await f.advance(28999)
  assert.equal(f.requests.length, 0)
  await f.advance(1)
  f.requests[0].resolve(boot('1'))
  await f.advance()
  f.controller.scheduleRefresh(0, true, true)
  await f.advance()
  assert.equal(f.requests.length, 2)
})

test('周期计时器到期时重新检查其排期后同步的新清单冷却期', async (t) => {
  const f = fixture(t)
  f.controller.start()
  await f.advance(29000)
  f.controller.syncBoot(f.parse(boot('2')))
  await f.advance(1000)
  assert.equal(f.requests.length, 0, 'new roster must postpone the already scheduled request')
  await f.advance(28999)
  assert.equal(f.requests.length, 0)
  await f.advance(1)
  assert.equal(f.requests.length, 1)
})

test('隐藏等待期间同步的新清单会推迟恢复可见时的普通刷新', async (t) => {
  const f = fixture(t)
  f.visible('hidden')
  f.controller.start()
  await f.advance(30000)
  f.controller.syncBoot(f.parse(boot('2')))
  f.visible('visible')
  await f.advance(29999)
  assert.equal(f.requests.length, 0, 'visibility alone must not bypass the fresh roster cooldown')
  await f.advance(1)
  assert.equal(f.requests.length, 1)
})

test('隐藏时明确要求的即时刷新在恢复可见后仍可绕过冷却期', async (t) => {
  const f = fixture(t)
  f.visible('hidden')
  f.controller.start()
  f.controller.syncBoot(f.parse(boot('2')))
  f.controller.scheduleRefresh(0, true, true)
  await f.advance()
  assert.equal(f.requests.length, 0)
  f.visible('visible')
  await f.advance()
  assert.equal(f.requests.length, 1)
})

test('在途请求去重，多个即时刷新合并成一次后续请求', async (t) => {
  const f = fixture(t)
  await refresh(f)
  for (let i = 0; i < 4; i++) {
    f.controller.start()
    f.controller.scheduleRefresh(0, true, true)
  }
  await f.advance()
  assert.equal(f.requests.length, 1)
  f.requests[0].resolve(boot('2'))
  await f.advance()
  assert.equal(f.requests.length, 2)
  f.requests[1].resolve(boot('1'))
  await f.advance()
  assert.equal(f.timers.size, 1)
  assert.equal(f.requests.length, 2)
})

test('停止使晚到响应和已排队的即时刷新失效', async (t) => {
  const f = fixture(t)
  await refresh(f)
  f.controller.scheduleRefresh(0, true, true)
  f.controller.stop()
  f.requests[0].resolve(boot('2'))
  await f.advance(60000)
  assert.equal(f.ids(), '1')
  assert.equal(f.requests.length, 1)
  assert.equal(f.timers.size, 0)
})

test('在途时停止再启动，旧响应不落地且当前周期能继续刷新', async (t) => {
  const f = fixture(t)
  await refresh(f)
  f.controller.stop()
  f.controller.start()
  await f.advance(30000)
  assert.equal(f.requests.length, 1, 'still share the unfinished network request')
  f.requests[0].resolve(boot('2'))
  await f.advance()
  assert.equal(f.ids(), '1', 'old lifecycle result must not commit')
  await f.advance(30000)
  assert.equal(f.requests.length, 2, 'new lifecycle must not lose its refresh timer')
  f.requests[1].resolve(boot('2'))
  await f.advance()
  assert.equal(f.ids(), '2')
})

test('重启期间的新即时刷新保留，前一生命周期不能吞掉它', async (t) => {
  const f = fixture(t)
  await refresh(f)
  f.controller.stop()
  f.controller.start()
  f.controller.scheduleRefresh(0, true, true)
  f.requests[0].resolve(boot('2'))
  await f.advance()
  assert.equal(f.requests.length, 2)
  assert.equal(f.ids(), '1')
})

test('软跳提交的新清单不会被此前开始的刷新响应覆盖', async (t) => {
  const f = fixture(t)
  await refresh(f)
  assert.equal(f.controller.syncBoot(f.parse(boot('2', '新页面'))), true)
  f.requests[0].resolve(boot('1', '旧请求'))
  await f.advance()
  assert.equal(f.ids(), '2')
  assert.equal(f.dot('2')?.title, '新页面')
  assert.equal(f.dot('1'), null)
  await f.advance(30000)
  assert.equal(f.requests.length, 2)
})

for (const failure of ['reject', 'throw', 'http', 'missing']) {
  test(`刷新失败 (${failure}) 保留清单且下一周期可以恢复`, async (t) => {
    const f = fixture(t)
    let first = true
    f.respondWith(() => {
      if (!first) return Promise.resolve({ ok: true, text: boot('2') })
      first = false
      if (failure === 'throw') throw new Error('sync failure')
      if (failure === 'reject') return Promise.reject(new Error('network failure'))
      return Promise.resolve({ ok: failure !== 'http', text: failure === 'missing' ? '<p>empty</p>' : boot('2') })
    })
    await refresh(f)
    assert.equal(f.ids(), '1')
    await f.advance(30000)
    assert.equal(f.requests.length, 2)
    assert.equal(f.ids(), '2')
  })
}

for (const state of ['disabled', 'challenge']) {
  test(`实时 ${state} 状态阻止增强和请求，恢复后可以启动`, async (t) => {
    const f = fixture(t)
    if (state === 'disabled') f.enable(false)
    else f.document.documentElement.setAttribute('data-challenge', '')
    f.controller.start()
    f.controller.scheduleRefresh(0, true, true)
    assert.equal(f.controller.syncBoot(f.parse(boot('2'))), false)
    assert.equal(f.controller.syncDots(), false)
    await f.advance(60000)
    assert.equal(f.requests.length, 0)
    assert.equal(f.dot('1'), null)
    f.enable(true)
    f.document.documentElement.removeAttribute('data-challenge')
    await refresh(f)
    if (state === 'disabled') f.enable(false)
    else f.document.documentElement.setAttribute('data-challenge', '')
    f.requests[0].resolve(boot('2'))
    await f.advance(60000)
    assert.equal(f.ids(), '1')
    assert.equal(f.requests.length, 1)
    assert.equal(f.timers.size, 0)
  })
}

test('远端挑战页即使残留在线属性也不能替换当前清单', async (t) => {
  const f = fixture(t)
  const challenge = '<html data-challenge><body>' + boot('2') + '</body></html>'
  assert.equal(f.controller.syncBoot(f.parse(challenge)), false)
  await refresh(f)
  f.requests[0].resolve(challenge)
  await f.advance()
  assert.equal(f.ids(), '1')
  assert.equal(f.timers.size, 1, 'retry in the next period')
})
