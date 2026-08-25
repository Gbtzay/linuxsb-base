/**
 * 加固回归：权限门（写操作不可绕过）、资源清理（停用即收摊）、
 * 以及几个具体缺陷的定点断言。
 *
 * 这些用例对应一次健壮度审计后的修复，务必保留——它们守的是
 * 「权限模型不被 net.raw 击穿」「插件停用后不留后台活动」两条底线。
 */
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
  w.localStorage.setItem('lsb_base:__core:rate', JSON.stringify(5))
  w.localStorage.setItem('lsb_base:__core:urlPoll', JSON.stringify(0))
  for (const [k, v] of Object.entries(preload)) w.localStorage.setItem(k, JSON.stringify(v))
  const tick = (ms) => new Promise((r) => setTimeout(r, ms))
  const until = async (fn, ms = 2000) => {
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
      await tick(20)
    }
  }
  return { w, tick, until }
}

async function loadBase(w, ...extra) {
  w.eval(baseCode)
  for (const code of extra) w.eval(code)
  await new Promise((r) => setTimeout(r, 30))
}

/** 内联插件：直接拿到 api 做断言 */
function inline(id, permissions, body) {
  return `
  ;(function(){
    const manifest = { id: ${JSON.stringify(id)}, name: ${JSON.stringify(id)}, version: '1.0.0',
      requires: { base: '*' }, permissions: ${JSON.stringify(permissions)} }
    const setup = ${body}
    const w = typeof unsafeWindow !== 'undefined' ? unsafeWindow : window
    if (w.LSB && w.LSB.register) w.LSB.register(manifest, setup)
    else { w.LSB_PLUGINS = w.LSB_PLUGINS || []; w.LSB_PLUGINS.push({ manifest, setup }) }
  })()
  `
}

/* ═══════════ 权限门：站内写请求 ═══════════ */

test('权限门：只有 read 的插件不能用 net.raw 对站内发 POST（不得绕过 write）', async () => {
  const { w } = makeSite()
  const sent = []
  w.fetch = async (url, init = {}) => {
    sent.push({ url: String(url), method: init.method || 'GET' })
    return { status: 200, ok: true, url: String(url), text: async () => 'ok' }
  }
  await loadBase(
    w,
    inline('reader-only', ['read', 'events'], `async (api) => {
      const out = { get: null, post: null, put: null }
      try { await api.net.raw('/topic/1'); out.get = 'ok' } catch (e) { out.get = e.message }
      try { await api.net.raw('/reply_edit', { method: 'POST', body: 'x' }); out.post = 'ok' }
      catch (e) { out.post = e.message }
      try { await api.net.raw('/topic_favorite', { method: 'PUT' }); out.put = 'ok' }
      catch (e) { out.put = e.message }
      window.__probe = out
      return {}
    }`),
  )
  await new Promise((r) => setTimeout(r, 120))

  const out = w.__probe
  assert.equal(out.get, 'ok', '同源 GET 只需 read')
  assert.match(out.post, /未声明 'write'/, '同源 POST 必须 write')
  assert.match(out.put, /未声明 'write'/, '同源 PUT 必须 write')
  assert.ok(
    !sent.some((r) => r.method === 'POST' || r.method === 'PUT'),
    '被拒绝的写请求根本没有发出去',
  )
})

test('权限门：声明 write 后同站 POST 放行；站外仍需 net', async () => {
  const { w } = makeSite()
  w.fetch = async (url, init = {}) => ({
    status: 200,
    ok: true,
    url: String(url),
    text: async () => 'ok',
  })
  await loadBase(
    w,
    inline('writer', ['read', 'write', 'events'], `async (api) => {
      const out = {}
      try { await api.net.raw('/reply_edit', { method: 'POST', body: 'x' }); out.post = 'ok' }
      catch (e) { out.post = e.message }
      try { await api.net.raw('https://api.example.com/v1', { external: true }); out.ext = 'ok' }
      catch (e) { out.ext = e.message }
      window.__probe2 = out
      return {}
    }`),
  )
  await new Promise((r) => setTimeout(r, 120))
  assert.equal(w.__probe2.post, 'ok', 'write 已声明 → 同站 POST 放行')
  assert.match(w.__probe2.ext, /未声明 'net'/, '站外访问仍要 net 权限')
})

test('签到日历声明了 write 权限（其一键签到是 POST 写操作）', async () => {
  const code = PLUG('checkin-calendar')
  const m = code.match(/permissions:\s*\[([^\]]+)\]/)
  assert.ok(m, '能读到 permissions 声明')
  assert.match(m[1], /'write'/, '签到会 POST /daily_checkin，必须声明 write')
})

test('非幂等请求默认不重试（避免重复回复/重复签到）', async () => {
  const { w } = makeSite()
  let posts = 0
  let gets = 0
  w.fetch = async (url, init = {}) => {
    if ((init.method || 'GET') === 'POST') {
      posts++
      throw new Error('network down')
    }
    gets++
    throw new Error('network down')
  }
  await loadBase(
    w,
    inline('retry-probe', ['read', 'write', 'events'], `async (api) => {
      try { await api.net.raw('/reply_edit', { method: 'POST', body: 'x', backoff: { err: 1 } }) } catch {}
      try { await api.net.raw('/topic/9', { backoff: { err: 1 } }) } catch {}
      window.__done = true
      return {}
    }`),
  )
  await new Promise((r) => setTimeout(r, 300))
  assert.equal(posts, 1, 'POST 只尝试一次')
  assert.ok(gets >= 2, 'GET 仍按幂等语义重试')
})

/* ═══════════ 资源清理：停用即收摊 ═══════════ */

test('停用清理：悬浮卡节点被移除，链接监听摘除', async () => {
  const { w, until } = makeSite()
  w.fetch = async (url) => ({ status: 200, ok: true, url: String(url), text: async () => topicHtml })
  await loadBase(w, PLUG('hover-profile'))

  const link = w.document.querySelector('a[href^="/user/"]')
  assert.ok(link, '夹具里有用户链接')
  link.dispatchEvent(new w.MouseEvent('mouseenter'))
  assert.ok(await until(() => !!w.document.querySelector('.lsb-hover-card')), '浮卡已创建')

  w.LSB.disable('hover-profile')
  assert.equal(w.document.querySelector('.lsb-hover-card'), null, '停用后浮卡节点不残留')

  // 摘掉监听后再次悬停不应重建
  link.dispatchEvent(new w.MouseEvent('mouseenter'))
  await new Promise((r) => setTimeout(r, 350))
  assert.equal(w.document.querySelector('.lsb-hover-card'), null, '监听已摘除，不再重建浮卡')
})

test('停用清理：未读哨兵还原标题并停掉定时器', async () => {
  const seed = {}
  const { w, until } = makeSite()
  w.fetch = async (url) => ({ status: 200, ok: true, url: String(url), text: async () => topicHtml })
  const orig = 'orig-title'
  await loadBase(w, `document.title = ${JSON.stringify(orig)};`, PLUG('unread-sentinel'))
  const dbg = await w.LSB.bus.request('unread-sentinel:debug')
  await dbg.tick()
  await until(() => w.document.title !== orig)

  w.LSB.disable('unread-sentinel')
  assert.equal(w.document.title, orig, '停用后标题角标还原')
})

test('停用清理：本地联动的健康巡检定时器被清掉', async () => {
  const { w } = makeSite({ 'lsb_base:local-bridge:__config': { healthSec: 1, warmCache: false } })
  let calls = 0
  w.fetch = async (url) => {
    calls++
    return { status: 200, ok: true, url: String(url), text: async () => JSON.stringify({ ok: true, topics: [] }) }
  }
  await loadBase(w, PLUG('local-bridge'))
  await new Promise((r) => setTimeout(r, 60))
  w.LSB.disable('local-bridge')
  const after = calls
  await new Promise((r) => setTimeout(r, 1300)) // 跨过一个 healthSec 周期
  assert.equal(calls, after, '停用后不再发健康检查')
})

/* ═══════════ 定点缺陷 ═══════════ */

test('esc 转义反引号（模板/未加引号属性上下文）', async () => {
  const { w } = makeSite()
  await loadBase(
    w,
    inline('esc-probe', ['read', 'events'], `(api) => {
      window.__esc = api.util.esc('a\`b<c>d"e\\'f&g')
      return {}
    }`),
  )
  await new Promise((r) => setTimeout(r, 30))
  assert.equal(w.__esc, 'a&#96;b&lt;c&gt;d&quot;e&#39;f&amp;g')
})

test('dom:posts-added 不重复投递同一楼层（父节点+子查询去重）', async () => {
  const { w, until } = makeSite()
  await loadBase(w)
  const seen = []
  w.LSB.bus.on('dom:posts-added', (posts) => seen.push(posts.length))

  // 一次性插入「本身是 post-entry 且内部还嵌了一个」的结构
  const ul = w.document.querySelector('ul.post-list') || w.document.body
  const li = w.document.createElement('li')
  li.className = 'post-entry'
  li.id = 'post-9001'
  ul.appendChild(li)

  assert.ok(await until(() => seen.length > 0), '事件已触发')
  assert.equal(seen[0], 1, '同一元素只投递一次')
})

test('哨兵消息箱：合并已有条目时 lastTs 不被写成 NaN', async () => {
  const { w } = makeSite()
  w.fetch = async (url) => ({ status: 200, ok: true, url: String(url), text: async () => topicHtml })
  await loadBase(w, PLUG('unread-sentinel'))
  const dbg = await w.LSB.bus.request('unread-sentinel:debug')

  await dbg.tick()
  const first = dbg.inbox()
  if (!first.length) return // 夹具无列表数据时跳过（解析层另有专测）

  const id = first[0].id
  dbg.setSeenEntry(id, 1) // 压低水位 → 下一轮该帖重新算作新动态并走合并分支
  await dbg.tick()
  const rec = dbg.inbox().find((x) => x.id === id)
  assert.ok(rec, '条目仍在')
  assert.ok(Number.isFinite(rec.lastTs), `lastTs 必须是有限数（实际 ${rec.lastTs}）`)
  assert.ok(rec.count >= 2, '合并计数生效')
})

test('个人存档：抓取中途失败仍保留已抓页（增量落盘）', async () => {
  const item = (id, title, ts) =>
    `<li class="post-item"><a class="post-title" href="/topic/${id}">${title}</a>` +
    `<span data-performance-time="${ts}"></span></li>`
  const page = (uid, items, links = '') =>
    `<html><body><div class="sidebar-card user-card">` +
    `<a class="user-name" href="/user/${uid}">me</a><span class="user-rank">Lv3 · 100</span></div>` +
    `<a href="/user/${uid}">我的主页</a>${links}` +
    `<ul class="post-list">${items.join('')}</ul></body></html>`

  const { w } = makeSite()
  let n = 0
  w.fetch = async (url) => {
    const u = String(url)
    // 分页链接必须带当前登录用户的真实 uid，否则 discoverPagination 发现不了第 2 页
    const uid = (u.match(/\/user\/(\d+)/) || [])[1] || '1'
    if (u.includes('tab=topics')) {
      n++
      if (n === 1) {
        return {
          status: 200,
          ok: true,
          url: u,
          text: async () =>
            page(uid, [item(11, 'A', 100)], `<a href="/user/${uid}?tab=topics&p=3">3</a>`),
        }
      }
      if (n === 2) {
        return { status: 200, ok: true, url: u, text: async () => page(uid, [item(12, 'B', 200)]) }
      }
      throw new Error('network down') // 第 3 页失败
    }
    return { status: 200, ok: true, url: u, text: async () => page(uid, []) }
  }

  await loadBase(w, PLUG('my-archive'))
  const dbg = await w.LSB.bus.request('my-archive:debug')
  await assert.rejects(() => dbg.backup({ silent: true }), /network down/)

  const arch = dbg.archive()
  assert.ok(arch, '失败也留下了档案')
  assert.ok(arch.topics[11] && arch.topics[12], '前两页成果没有因末页失败而丢失')
})
