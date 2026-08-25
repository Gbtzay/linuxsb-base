/** 未读哨兵（原三连里的悬浮引用已卸，改由 topic-preview 覆盖预览） */
import { test } from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { JSDOM } from 'jsdom'

const baseCode = readFileSync(new URL('../dist/linuxsb-base.user.js', import.meta.url), 'utf8')
const PLUG = (n) => readFileSync(new URL(`../plugins/${n}`, import.meta.url), 'utf8')
const FX = {
  topic: readFileSync(new URL('./fixtures/topic1.html', import.meta.url), 'utf8'),
  home: readFileSync(new URL('./fixtures/home.html', import.meta.url), 'utf8'),
}

function makeSite(name = 'topic', url = 'https://linux.sb/topic/1', preload = {}) {
  const dom = new JSDOM(FX[name], { url, runScripts: 'outside-only' })
  const w = dom.window
  w.unsafeWindow = w
  w.requestAnimationFrame = (fn) => setTimeout(() => fn(Date.now()), 0)
  w.localStorage.setItem('lsb_base:__core:rate', JSON.stringify(10))
  for (const [k, v] of Object.entries(preload)) w.localStorage.setItem(k, JSON.stringify(v))
  const tick = (ms) => new Promise((r) => setTimeout(r, ms))
  async function until(fn, ms = 1500, step = 20) {
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

/* ─────────── 未读哨兵 ─────────── */

function homeStub(calls) {
  return async (url) => {
    calls.push(String(url))
    return { status: 200, ok: true, url: String(url), text: async () => FX.home }
  }
}

const SENTINEL_PRELOAD = {
  'lsb_base:unread-sentinel:__config': {
    intervalMin: 1,
    jitterMs: 0,
    badgeInTitle: true,
    notifyDesktop: false,
  },
}

test('哨兵：单标签成为主节点；巡检产出消息箱与标题角标', async () => {
  const calls = []
  const { w, until } = makeSite('home', 'https://linux.sb/', SENTINEL_PRELOAD)
  await loadBase(w, PLUG('unread-sentinel.user.js'))
  w.fetch = homeStub(calls)

  const dbg = await w.LSB.bus.request('unread-sentinel:debug')
  await until(() => dbg.role() === 'leader', 3000)
  assert.equal(dbg.role(), 'leader')

  await dbg.tick()
  console.error('DIAG:', JSON.stringify(dbg.diag()))
    if (!dbg.inbox().length) {
    console.error('SENTINEL probe:', JSON.stringify(dbg.probe()), 'err:', dbg.lastError())
    console.error('CORE LOGS:', JSON.stringify(w.LSB.logs().slice(-6)))
  }
  assert.ok(dbg.inbox().length >= 20, `消息箱条目 ${dbg.inbox().length}；lastError=${dbg.lastError()}`)
  assert.match(dbg.title(), /^\([0-9]+\)/, `标题角标：${dbg.title()}`)

  const before = dbg.inbox().length
  await dbg.tick()
  assert.equal(dbg.inbox().length, before, '同水位线幂等')
})

test('哨兵：水位回退模拟新回复 → 合并计数', async () => {
  const { w, until } = makeSite('home', 'https://linux.sb/', SENTINEL_PRELOAD)
  await loadBase(w, PLUG('unread-sentinel.user.js'))
  w.fetch = homeStub([])

  const dbg = await w.LSB.bus.request('unread-sentinel:debug')
  await until(() => dbg.role() === 'leader', 3000)
  await dbg.tick()

  const first = dbg.inbox()[0]
  const n0 = dbg.inbox().length
  dbg.setSeenEntry(first.id, first.lastTs - 60000)
  await dbg.tick()
  assert.equal(dbg.inbox().length, n0, '同帖更新合并进原条目而非新增')
  const merged = dbg.inbox().find((x) => x.id === first.id)
  assert.equal(merged.count, 2, '同一帖合并计数')
  assert.match(dbg.title(), /^\([0-9]+\)/, '角标仍在')
})
