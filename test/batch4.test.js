/** 第四批：配置迁移 / 个人存档 / 年度报告 */
import { test } from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { JSDOM } from 'jsdom'

const baseCode = readFileSync(new URL('../dist/linuxsb-base.user.js', import.meta.url), 'utf8')
const PLUG = (n) => readFileSync(new URL(`../plugins/${n}.user.js`, import.meta.url), 'utf8')
const topicHtml = readFileSync(new URL('./fixtures/topic1.html', import.meta.url), 'utf8')

function makeSite(preload = {}) {
  const dom = new JSDOM(topicHtml, { url: 'https://linux.sb/topic/1', runScripts: 'outside-only' })
  const w = dom.window
  w.unsafeWindow = w
  w.requestAnimationFrame = (fn) => setTimeout(() => fn(Date.now()), 0)
  w.localStorage.setItem('lsb_base:__core:rate', JSON.stringify(10))
  for (const [k, v] of Object.entries(preload)) w.localStorage.setItem(k, JSON.stringify(v))
  const tick = (ms) => new Promise((r) => setTimeout(r, ms))
  async function until(fn, ms = 2500, step = 20) {
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

/* ─────────── 配置迁移 ─────────── */

test('迁移：全库导出包含各模块键；破坏后覆盖导入恢复；合并模式保留新增', async () => {
  const now = Date.now()
  const { w } = makeSite({
    'lsb_base:points-ledger:series': [{ t: now - 864e5, p: 4100 }],
    'lsb_base:x:y': { a: 1 },
    'not_lsb:junk': true,
  })
  await loadBase(w, PLUG('data-migration'))
  const dbg = await w.LSB.bus.request('data-migration:debug')

  const dump = dbg.export()
  assert.equal(dump.app, 'lsb')
  assert.ok(dump.count >= 3, `应含种子键与核心键（${dump.count}）`)
  assert.equal(JSON.stringify(dump.data['lsb_base:x:y']), '{"a":1}')
  assert.ok(!('not_lsb:junk' in dump.data), '非 lsb 键不纳入')

  // 破坏后覆盖导入
  w.localStorage.setItem('lsb_base:x:y', JSON.stringify({ a: 999 }))
  const r1 = dbg.import(dump, { merge: false })
  assert.ok(r1.imported >= 3)
  assert.equal(JSON.stringify(JSON.parse(w.localStorage.getItem('lsb_base:x:y'))), '{"a":1}')

  // 合并模式：dump 之后新出现的键不被清除
  w.localStorage.setItem('lsb_base:newmod:k', '"keepme"')
  dbg.import(dump, { merge: true })
  assert.equal(w.localStorage.getItem('lsb_base:newmod:k'), '"keepme"')

  // 权限门：未声明 admin 的插件拿不到全库
  w.__err = null
  w.LSB.register({ id: 'no-admin-x', version: '1.0.0', permissions: ['read'] }, (a) => {
    try {
      a.admin.exportAll()
    } catch (e) {
      w.__err = String(e.message)
    }
  })
  await new Promise((r) => setTimeout(r, 20))
  assert.match(w.__err, /admin/)
})

/* ─────────── 个人存档 ─────────── */

const item = (id, title, ts) =>
  `<li class="post-item"><a class="post-title" href="/topic/${id}">${title}</a>` +
  `<span data-performance-time="${ts}"></span></li>`

function archiveStub(state) {
  return async (url) => {
    const u = String(url)
    if (u.includes('tab=topics')) {
      if (u.includes('page=2')) {
        return {
          status: 200,
          ok: true,
          url: u,
          text: async () =>
            `<html><body><ul class="post-list">${item(9004, state.p2Title, 1787000004)}</ul></body></html>`,
        }
      }
      const items = [
        item(9001, state.t1, 1787000001),
        item(9002, state.t2, 1787000002),
        ...(state.includeThird ? [item(9003, state.t3, 1787000003)] : []),
      ]
      return {
        status: 200,
        ok: true,
        url: u,
        text: async () =>
          `<html><body><ul class="post-list">${items.join('')}</ul>` +
          `<a href="/user/5372?tab=topics&amp;page=2">下一页</a></body></html>`,
      }
    }
    if (u.includes('tab=replies')) {
      return {
        status: 200,
        ok: true,
        url: u,
        text: async () =>
          `<html><body><ul class="post-list">${item(8001, '回复一', 1787100001)}${item(8002, '回复二', 1787100002)}</ul></body></html>`,
      }
    }
    return { status: 404, ok: false, url: u, text: async () => '' }
  }
}

test('个人存档：分页发现（page 参数）→ 抓全量 → 增量合并不丢旧帖', async () => {
  const state = { t1: '我的第一帖', t2: '第二帖', t3: '将被删除的第三帖', includeThird: true, p2Title: '第二页的帖子' }
  const { w } = makeSite({
    'lsb_base:my-archive:__config': { includeReplies: true, maxPages: 10 },
  })
  w.fetch = archiveStub(state)
  await loadBase(w, PLUG('my-archive'))
  const dbg = await w.LSB.bus.request('my-archive:debug')

  const s1 = await dbg.backup()
  assert.equal(s1.topicCount, 4, '第 1 页 3 帖 + 第 2 页 1 帖')
  assert.equal(s1.replyCount, 2)

  const md = dbg.markdown()
  assert.match(md, /# linux\.sb 个人存档/)
  assert.match(md, /我的第一帖/)
  assert.match(md, /第二页的帖子/)

  // 增量：线上删了 9003、改了 9001 标题 → 本地档保留 9003、更新 9001
  state.includeThird = false
  state.t1 = '我的第一帖（已编辑）'
  await dbg.backup()
  const a = dbg.archive()
  assert.equal(Object.keys(a.topics).length, 4, '累积模式：被删帖保留在本地档')
  assert.match(a.topics[9001].title, /已编辑/)
})

/* ─────────── 年度报告 ─────────── */

test('年度报告：聚合各模块数据渲染 + 导出 Markdown；缺失模块自动降级', async () => {
  const now = Date.now()
  const day = (n) => dkeyOf(new Date(Date.now() - n * 864e5))
  function dkeyOf(x) {
    const p = (n) => String(n).padStart(2, '0')
    return x.getFullYear() + '-' + p(x.getMonth() + 1) + '-' + p(x.getDate())
  }

  const { w, until } = makeSite({
    'lsb_base:points-ledger:series': [
      { t: now - 90 * 864e5, p: 4000 },
      { t: now, p: 4200 },
    ],
    'lsb_base:checkin-calendar:__config': { autoProbe: false }, // 避免探测覆盖今日种子
    'lsb_base:checkin-calendar:recs': Object.fromEntries(
      [0, 1, 2, 5, 9].map((n) => [day(n), { s: 'ok', t: Date.now() }]),
    ),
    'lsb_base:resume-reading:positions': {
      111: { f: 9, p: 1, title: '甲帖', ts: now - 3600e3 },
      222: { f: 3, p: 1, title: '乙帖', ts: now - 7200e3 },
    },
  })

  // 万能静音 stub（签到探测等）
  w.fetch = async (url) => ({ status: 200, ok: true, url: String(url), text: async () => '' })

  await loadBase(
    w,
    PLUG('points-ledger'),
    PLUG('checkin-calendar'),
    PLUG('resume-reading'),
    PLUG('annual-report'),
  )
  const dbg = await w.LSB.bus.request('annual-report:debug')

  w.LSB.open('annual-report')
  await until(() => w.document.querySelector('.lsb-view')?.textContent.includes('净增减'))

  const view = w.document.querySelector('.lsb-view').textContent
  assert.match(view, /\+200/, '积分净增计算正确')
  assert.match(view, /4200/)
  assert.match(view, /5 天/, '签到天数统计')
  assert.match(view, /2 帖/, '阅读足迹计数')
  assert.match(view, /对应模块未安装或无数据/, '未安装模块降级提示')

  const md = await dbg.buildMd()
  assert.match(md, /# 我的 linux\.sb 这一年/)
  assert.match(md, /\*\*\+200\*\*/, 'Markdown 中净增减带符号加粗')
})
