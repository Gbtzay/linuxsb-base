/** 第三批：签到日历 / 积分趋势 / 机会监控 */
import { test } from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { JSDOM } from 'jsdom'

const baseCode = readFileSync(new URL('../dist/linuxsb-base.user.js', import.meta.url), 'utf8')
const PLUG = (n) => readFileSync(new URL(`../plugins/${n}`, import.meta.url), 'utf8')
const topicHtml = readFileSync(new URL('./fixtures/topic1.html', import.meta.url), 'utf8')

function dkey(d) {
  const x = d || new Date()
  const p = (n) => String(n).padStart(2, '0')
  return x.getFullYear() + '-' + p(x.getMonth() + 1) + '-' + p(x.getDate())
}

function makeSite(preload = {}) {
  const dom = new JSDOM(topicHtml, { url: 'https://linux.sb/topic/1', runScripts: 'outside-only' })
  const w = dom.window
  w.unsafeWindow = w
  w.requestAnimationFrame = (fn) => setTimeout(() => fn(Date.now()), 0)
  w.localStorage.setItem('lsb_base:__core:rate', JSON.stringify(10))
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

/* ─────────── 签到日历 ─────────── */

const CHECKIN_OPEN =
  '<html><body><form action="/do_checkin" method="post">' +
  '<input type="hidden" name="_csrf" value="csrf-token-x"><input type="hidden" name="day" value="today">' +
  '<button>签到</button></form></body></html>'
const CHECKIN_OK = '<html><body><div>今日已签到，获得 5 积分</div></body></html>'

test('签到日历：自动探测未签→提醒；一键签到组表单提交并记录', async () => {
  const posts = []
  let checked = false
  const { w, until } = makeSite({
    'lsb_base:checkin-calendar:recs': {
      [dkey(new Date(Date.now() - 864e5))]: { s: 'ok', t: Date.now() },
      [dkey(new Date(Date.now() - 2 * 864e5))]: { s: 'ok', t: Date.now() },
    },
  })
  w.fetch = async (url, init = {}) => {
    const u = String(url)
    if (init.method === 'POST') {
      posts.push({ url: u, body: init.body })
      checked = true
      return { status: 200, ok: true, url: u, text: async () => 'ok' }
    }
    return {
      status: 200,
      ok: true,
      url: u,
      text: async () => (checked ? CHECKIN_OK : CHECKIN_OPEN),
    }
  }

  await loadBase(w, PLUG('checkin-calendar.user.js'))
  const dbg = await w.LSB.bus.request('checkin-calendar:debug')

  // 自动探测（每天首次浏览）
  await until(() => dbg.status() === 'open')
  assert.equal(dbg.status(), 'open')
  assert.ok(await until(() => !!w.document.querySelector('.lsb-toast')), '未签提醒弹出')
  assert.equal(
    JSON.stringify(dbg.form().fields.map((f) => f.name).sort()),
    JSON.stringify(['_csrf', 'day']),
  )

  // 一键签到（测试跳过确认弹窗）
  assert.equal(await dbg.doCheckin(), true)
  assert.equal(posts.length, 1)
  assert.match(posts[0].url, /\/do_checkin$/)
  assert.equal(posts[0].body.get('_csrf'), 'csrf-token-x')
  assert.equal(posts[0].body.get('day'), 'today')
  assert.equal(dbg.recs()[dkey(new Date())].s, 'ok')

  // 连击：前两天 ok + 今天 ok = 3
  assert.equal(dbg.streak(), 3)

  // 日历渲染出 ok 格子
  w.LSB.open('checkin-calendar')
  assert.ok(w.document.querySelectorAll('.lsb-cal-cell.is-ok').length >= 2)
})

test('签到日历：HTTP 非 2xx 不把当天标成已签', async () => {
  const { w, until } = makeSite()
  w.fetch = async (url, init = {}) => {
    const u = String(url)
    if (init.method === 'POST') {
      return { status: 500, ok: false, url: u, text: async () => 'fail' }
    }
    return { status: 200, ok: true, url: u, text: async () => CHECKIN_OPEN }
  }
  await loadBase(w, PLUG('checkin-calendar.user.js'))
  const dbg = await w.LSB.bus.request('checkin-calendar:debug')
  await until(() => dbg.status() === 'open')
  const out = await dbg.doCheckin()
  assert.equal(out.done, false)
  assert.match(String(out.reason), /http/)
  assert.notEqual(dbg.recs()[dkey(new Date())]?.s, 'ok', '失败不得写入 ok')
  assert.equal(dbg.status(), 'open')
})

test('签到日历：已签状态不再提醒、按钮置灰', async () => {
  const { w } = makeSite()
  w.fetch = async (url) => ({
    status: 200,
    ok: true,
    url: String(url),
    text: async () => CHECKIN_OK,
  })
  await loadBase(w, PLUG('checkin-calendar.user.js'))
  const dbg = await w.LSB.bus.request('checkin-calendar:debug')
  await dbg.probe(true)
  assert.equal(dbg.status(), 'ok')
  assert.equal(dbg.recs()[dkey(new Date())].s, 'ok')
})

/* ─────────── 积分趋势 ─────────── */

test('积分趋势：快照序列 → 折线图与增减列表；同值去重', async () => {
  const { w } = makeSite()
  await loadBase(w, PLUG('points-ledger.user.js'))
  const dbg = await w.LSB.bus.request('points-ledger:debug')
  dbg.reset()

  const now = Date.now()
  dbg.add(now - 2 * 864e5, 4100)
  dbg.add(now - 864e5, 4120)
  dbg.add(now, 4138)

  w.LSB.open('points-ledger')
  assert.ok(w.document.querySelector('.lsb-svg polyline'), '折线已绘制')
  const txt = w.document.querySelector('.lsb-view').textContent
  assert.match(txt, /\+20/)
  assert.match(txt, /\+18/)

  // 同值 12h 内去重
  assert.equal(await dbg.snap(), false)
  assert.equal(dbg.series().length, 3)

  // RPC 供其它插件消费
  const s = await w.LSB.bus.request('points-ledger:series', { days: 90 })
  assert.equal(s.length, 3)
})

test('积分趋势：间隔定时器已挂上（配置 intervalHours 不是一次性）', async () => {
  const { w } = makeSite({
    'lsb_base:points-ledger:__config': { intervalHours: 6, keepDays: 365 },
  })
  await loadBase(w, PLUG('points-ledger.user.js'))
  const dbg = await w.LSB.bus.request('points-ledger:debug')
  assert.equal(dbg.armed(), true)
})

test('积分趋势：折线图带 viewBox，按栏宽缩放而不是裁掉右侧', async () => {
  const { w } = makeSite()
  await loadBase(w, PLUG('points-ledger.user.js'))
  const dbg = await w.LSB.bus.request('points-ledger:debug')
  dbg.reset()
  const now = Date.now()
  dbg.add(now - 2 * 864e5, 4100)
  dbg.add(now - 864e5, 4120)
  dbg.add(now, 4138)
  w.LSB.open('points-ledger')
  const svg = w.document.querySelector('.lsb-svg')
  assert.ok(svg, '应有折线图')
  const vb = svg.getAttribute('viewBox') || ''
  assert.match(vb, /^0 0 \d+(\.\d+)? \d+(\.\d+)?$/, `需要 viewBox 才能随容器缩放，实际 viewBox="${vb}"`)
  const vw = Number(vb.trim().split(/\s+/)[2])
  const lastCx = Number([...svg.querySelectorAll('circle')].at(-1)?.getAttribute('cx'))
  assert.ok(lastCx <= vw, `末点 cx=${lastCx} 应落在 viewBox 宽 ${vw} 内`)
  const wAttr = svg.getAttribute('width')
  assert.ok(
    !wAttr || /%$/.test(wAttr),
    `width 应省略或用百分比，否则固定像素会裁掉右侧；实际 width="${wAttr}"`,
  )
  const css = w.document.getElementById('lsb-style-points-ledger')?.textContent || ''
  assert.match(css, /\.lsb-svg[\s\S]*width:\s*100%/, '样式要把 SVG 拉满内容栏')
})

test('积分趋势：范围过滤只影响视图', async () => {
  const { w } = makeSite()
  await loadBase(w, PLUG('points-ledger.user.js'))
  const dbg = await w.LSB.bus.request('points-ledger:debug')
  dbg.reset()
  dbg.add(Date.now() - 400 * 864e5, 100) // 超过 keepDays 的会被修剪
  const s = dbg.series()
  assert.equal(s.length, 0, '365 天外的快照被保留策略清除')
})

/* ─────────── 机会监控 ─────────── */

const FORUM_HTML =
  '<html><body><ul class="post-list">' +
  '<li class="post-item"><a class="post-title" href="/topic/7001">【求助】k8s pod 起不来</a>' +
  '<span data-performance-time="1787216186"></span></li>' +
  '<li class="post-item"><a class="post-title" href="/topic/7002">随便聊聊今天的天气</a>' +
  '<span data-performance-time="1787216000"></span></li>' +
  '</ul></body></html>'

const WATCH_PRELOAD = {
  'lsb_base:forum-watch:__config': {
    forums: '5',
    keywords: 'k8s\ntauri',
    intervalMin: 5,
    jitterMs: 0,
    notifyDesktop: false,
  },
}

test('机会监控：关键词命中入箱并提醒；水位去重；forget 后可重捕', async () => {
  const calls = []
  const { w, until } = makeSite(WATCH_PRELOAD)
  // stub 必须先于插件加载：选主后的首轮巡检会立即发请求
  w.fetch = async (url) => {
    calls.push(String(url))
    return { status: 200, ok: true, url: String(url), text: async () => FORUM_HTML }
  }
  await loadBase(w, PLUG('forum-watch.user.js'))

  const dbg = await w.LSB.bus.request('forum-watch:debug')
  const p = dbg.probe()
  assert.equal(JSON.stringify({ forums: p.forums, kws: p.kws }), JSON.stringify({ forums: [5], kws: ['k8s', 'tauri'] }))

  await until(() => dbg.role() === 'leader', 3000)
  await until(() => dbg.hits().length === 1, 2000)

  assert.ok(calls.filter((u) => u.includes('/forum/5')).length >= 1)
  const hits = dbg.hits()
  assert.equal(hits.length, 1, '只有 k8s 帖命中')
  assert.match(hits[0].title, /k8s/)
  assert.equal(hits[0].kw, 'k8s')
  assert.ok(await until(() => [...w.document.querySelectorAll('.lsb-toast')].some((t) => t.textContent.includes('命中'))))

  // 水位去重
  await dbg.tick()
  assert.equal(dbg.hits().length, 1)

  // 遗忘后重新捕获（模拟漏抓）
  dbg.forget(7001)
  await dbg.tick()
  assert.equal(dbg.hits().length, 2)
})

test('机会监控：forget 在未见过的版块键上不抛错', async () => {
  const { w } = makeSite(WATCH_PRELOAD)
  w.fetch = async (url) => ({ status: 200, ok: true, url: String(url), text: async () => FORUM_HTML })
  await loadBase(w, PLUG('forum-watch.user.js'))
  const dbg = await w.LSB.bus.request('forum-watch:debug')
  assert.doesNotThrow(() => dbg.forget(99999))
})
