import { test } from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { JSDOM } from 'jsdom'
import { ORDER_LTS as MEMBERS } from '../suite/order.js'

const ltsCode = readFileSync(new URL('../dist/linuxsb-lts.user.js', import.meta.url), 'utf8')
const baseCode = readFileSync(new URL('../dist/linuxsb-base.user.js', import.meta.url), 'utf8')
const topicHtml = readFileSync(new URL('./fixtures/topic1.html', import.meta.url), 'utf8')
const COLLISION =
  '请先在油猴里关掉或卸掉「LINUX.SB 氢」和「LINUX.SB 氧」，只留 LINUX.SB（LTS）。'

function site() {
  const dom = new JSDOM(topicHtml, { url: 'https://linux.sb/topic/1', runScripts: 'outside-only' })
  const w = dom.window
  w.unsafeWindow = w
  w.requestAnimationFrame = (fn) => setTimeout(() => fn(Date.now()), 0)
  w.fetch = async (url) => ({ status: 200, ok: true, url: String(url), text: async () => '' })
  w.localStorage.setItem('lsb_base:__core:rate', JSON.stringify(10))
  w.localStorage.setItem('lsb_base:__core:urlPoll', JSON.stringify(0))
  return w
}

async function until(w, fn, ms = 2000, step = 20) {
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
    await new Promise((r) => setTimeout(r, step))
  }
}

test('LTS：先装氢再装 LTS 不得再注册一套模块，并提示卸氢氧', async () => {
  const w = site()
  w.eval(baseCode)
  await new Promise((r) => setTimeout(r, 40))
  const n = w.LSB.info().plugins.length
  w.eval(ltsCode)
  await new Promise((r) => setTimeout(r, 80))
  assert.equal(w.LSB.info().plugins.length, n)
  assert.ok(w.document.documentElement.textContent.includes(COLLISION))
  assert.ok(w.document.querySelector('[data-lsb-lts-collision]'))
})

test('LTS：只装这一份则 ORDER_LTS 全部激活，砍掉的不在，面板为 LTS', async () => {
  const w = site()
  w.eval(ltsCode)
  await new Promise((r) => setTimeout(r, 80))
  const byId = Object.fromEntries(w.LSB.info().plugins.map((p) => [p.id, p.state]))
  const keep = [
    'floor-stats',
    'resume-reading',
    'read-mark',
    'home-return',
    'topic-preview',
    'unread-sentinel',
    'checkin-calendar',
    'points-ledger',
    'data-migration',
    'annual-report',
    'skin',
    'live-feed',
  ]
  assert.deepEqual(MEMBERS, keep)
  for (const id of keep) {
    assert.equal(byId[id], 'active', id)
  }
  assert.equal(byId.suite, 'active')
  for (const id of ['title-quotes', 'forum-watch', 'ai-summary', 'my-archive', 'hot-floor-badge', 'perf-probe', 'hover-profile', 'local-bridge']) {
    assert.equal(byId[id], undefined, id)
  }
  assert.equal(byId.suite, 'active')
  assert.equal(w.__LSB_CHANNEL__, 'lts')
  w.LSB.open()
  assert.match(w.document.querySelector('.lsb-panel-head').textContent, /LINUX\.SB · LTS/)
  const suiteVer = readFileSync(new URL('../dist/linuxsb-suite.user.js', import.meta.url), 'utf8')
    .match(/@version\s+([\d.]+)/)[1]
  assert.match(w.document.querySelector('.lsb-ver').textContent, new RegExp(suiteVer.replace(/\./g, '\\.')))
  assert.equal(w.LSB.version, w.LSB.info().version)
  const baseVer = baseCode.match(/@version\s+([\d.]+)/)[1]
  assert.equal(w.LSB.version, baseVer)
  assert.notEqual(w.LSB.version, suiteVer)
})

test('LTS：套件总览不露出未打包模块的指标', async () => {
  const w = site()
  w.eval(ltsCode)
  await new Promise((r) => setTimeout(r, 80))
  w.LSB.open('suite')
  const ok = await until(w, () => {
    const t = w.document.querySelector('.lsb-view')?.textContent || ''
    return t.includes('关键指标') && !t.includes('汇总中')
  })
  assert.ok(ok, '指标渲染完成')
  const view = w.document.querySelector('.lsb-view').textContent
  assert.match(view, /阅读记录/)
  assert.match(view, /消息箱/)
  assert.doesNotMatch(view, /机会命中/)
  assert.doesNotMatch(view, /卡顿记录/)
})
