/** URL 追踪：无限滚动 / 软导航下 api.page 保持新鲜并广播 route:changed */
import { test } from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { JSDOM } from 'jsdom'

const baseCode = readFileSync(new URL('../dist/linuxsb-base.user.js', import.meta.url), 'utf8')
const topicHtml = readFileSync(new URL('./fixtures/topic1.html', import.meta.url), 'utf8')

test('replaceState 软导航 → route:changed 广播 + api.page 更新', { skip: !new JSDOM().window.history?.pushState ? 'jsdom 无 history API' : false }, async (t) => {
  const dom = new JSDOM(topicHtml, { url: 'https://linux.sb/topic/1', runScripts: 'outside-only' })
  const w = dom.window
  w.unsafeWindow = w
  w.localStorage.setItem('lsb_base:__core:urlPoll', JSON.stringify(25))
  w.eval(baseCode)

  assert.equal(w.LSB.info().page.id, 1)

  const events = []
  w.LSB.bus.on('route:changed', (p) => events.push(p))

  // 模拟无限滚动站点更新地址（同帖第 2 页）
  w.history.replaceState({}, '', '/topic/1?p=2')
  await new Promise((r) => setTimeout(r, 150))

  assert.equal(events.length, 1, '轮询捕获一次变化')
  assert.equal(JSON.parse(JSON.stringify(events[0].page)).id, 1)
  assert.equal(JSON.parse(JSON.stringify(events[0].page)).page, 2)
  assert.equal(w.LSB.info().page.page, 2, 'api.page 已刷新')

  // 跨帖跳转（SPA 式软导航）
  w.history.pushState({}, '', '/forum/7?sort=post&p=3')
  await new Promise((r) => setTimeout(r, 150))
  assert.equal(events.length, 2)
  const last = JSON.parse(JSON.stringify(events[1].page))
  assert.deepEqual(last, { type: 'forum', id: 7, page: 3, sort: 'post' })

  // 地址没变时不重复广播
  await new Promise((r) => setTimeout(r, 120))
  assert.equal(events.length, 2)
})
