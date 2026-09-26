/** 红包发卡：只给 live 行画左侧色条 */
import { test } from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { JSDOM } from 'jsdom'

const baseCode = readFileSync(new URL('../dist/linuxsb-base.user.js', import.meta.url), 'utf8')
const plug = readFileSync(new URL('../plugins/topic-marks.user.js', import.meta.url), 'utf8')

function listPage(rows) {
  return (
    '<html><body><ul class="post-list">' +
    rows
      .map(
        (r) =>
          `<li class="post-item"><div class="post-title-row">` +
          `<a class="post-title" href="/topic/${r.id}">${r.title}</a>${r.extra || ''}` +
          `</div></li>`,
      )
      .join('') +
    '</ul></body></html>'
  )
}

function makeSite(html) {
  const dom = new JSDOM(html, { url: 'https://linux.sb/', runScripts: 'outside-only' })
  const w = dom.window
  w.unsafeWindow = w
  w.requestAnimationFrame = (fn) => setTimeout(() => fn(Date.now()), 0)
  w.localStorage.setItem('lsb_base:__core:rate', JSON.stringify(10))
  w.localStorage.setItem('lsb_base:__core:urlPoll', JSON.stringify(0))
  return w
}

async function boot(html) {
  const w = makeSite(html)
  w.eval(baseCode)
  w.eval(plug)
  await new Promise((r) => setTimeout(r, 40))
  const dbg = await w.LSB.bus.request('topic-marks:debug')
  return { w, dbg }
}

const LIVE =
  '<span class="red-packet-title-status">红包帖</span>' +
  '<span class="virtual-card-title-status active">发卡中</span>'
const ENDED_RED = '<span class="red-packet-title-status">已抢完</span>'
const ENDED_CARD = '<span class="virtual-card-title-status">结束</span>'

test('红包发卡：只给 live 加 class，结束态不加', async () => {
  const { w, dbg } = await boot(
    listPage([
      { id: 1, title: '双活', extra: LIVE },
      { id: 2, title: '抢完', extra: ENDED_RED },
      { id: 3, title: '结束', extra: ENDED_CARD },
      { id: 4, title: '普通' },
    ]),
  )
  const items = [...w.document.querySelectorAll('ul.post-list > li.post-item')]
  assert.ok(items[0].classList.contains('lsb-topic-mark-red'))
  assert.ok(items[0].classList.contains('lsb-topic-mark-card'))
  assert.equal(items[1].classList.contains('lsb-topic-mark-red'), false)
  assert.equal(items[2].classList.contains('lsb-topic-mark-card'), false)
  assert.equal(items[3].classList.contains('lsb-topic-mark-red'), false)
  assert.equal(dbg.painted(), 1)
  assert.equal(dbg.liveRed(), 1)
  assert.equal(dbg.liveCard(), 1)
  const css = w.document.getElementById('lsb-topic-marks-style').textContent
  assert.match(css, /lsb-topic-mark-red\.lsb-topic-mark-card/)
  assert.match(css, /#e11d48.*#d97706/)
})

test('红包发卡：route:changed 后能摘能补', async () => {
  const { w, dbg } = await boot(
    listPage([{ id: 1, title: '活', extra: '<span class="red-packet-title-status">红包帖</span>' }]),
  )
  assert.equal(dbg.liveRed(), 1)
  w.document.querySelector('ul.post-list').innerHTML = listPage([
    { id: 1, title: '死', extra: ENDED_RED },
    { id: 2, title: '卡', extra: '<span class="virtual-card-title-status active">发卡中</span>' },
  ]).match(/<ul class="post-list">([\s\S]*)<\/ul>/)[1]
  w.LSB.bus.emit('route:changed', { href: w.location.href, page: { type: 'home' } }, { source: 'core' })
  await new Promise((r) => setTimeout(r, 80))
  const items = [...w.document.querySelectorAll('ul.post-list > li.post-item')]
  assert.equal(items[0].classList.contains('lsb-topic-mark-red'), false)
  assert.ok(items[1].classList.contains('lsb-topic-mark-card'))
  assert.equal(dbg.liveRed(), 0)
  assert.equal(dbg.liveCard(), 1)
})

test('红包发卡：disable 去掉 style 与 class', async () => {
  const { w } = await boot(
    listPage([{ id: 1, title: '活', extra: '<span class="red-packet-title-status">红包帖</span>' }]),
  )
  assert.ok(w.document.querySelector('.lsb-topic-mark-red'))
  w.LSB.disable('topic-marks')
  assert.equal(w.document.getElementById('lsb-topic-marks-style'), null)
  assert.equal(w.document.querySelector('.lsb-topic-mark-red'), null)
})
