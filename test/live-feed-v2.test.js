/**
 * 实时流 v1.2 新能力回归：视口锚点补偿 / 打字免打扰 / 老帖新动态高亮 /
 * 帖子页翻页追补 / 横幅动作可改写。
 *
 * 这些用例守的是「插入内容不抢用户的视线和输入」——退化时用户感知最强的部分。
 */
import { test } from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { JSDOM } from 'jsdom'

const baseCode = readFileSync(new URL('../dist/linuxsb-base.user.js', import.meta.url), 'utf8')
const PLUG = (n) => readFileSync(new URL(`../plugins/${n}.user.js`, import.meta.url), 'utf8')
const homeHtml = readFileSync(new URL('./fixtures/home.html', import.meta.url), 'utf8')
const topicHtml = readFileSync(new URL('./fixtures/topic1.html', import.meta.url), 'utf8')

const listItem = (id, title, ts, replies = 0) =>
  '<li class="post-item"><div class="post-body"><div class="post-title-row">' +
  `<a class="post-title" href="/topic/${id}">${title}</a></div>` +
  `<div class="post-meta"><span data-performance-time="${ts}"></span><span>${replies}</span></div>` +
  '</div></li>'

const floorItem = (postId, floor, ts = 1893456000) =>
  `<li class="post-entry" id="post-${postId}" data-floor="${floor}">` +
  '<a class="post-title post-author" href="/user/9">新人</a>' +
  `<span data-performance-time="${ts}"></span>` +
  `<div class="post-content"><p>楼层 ${floor}</p></div></li>`

/**
 * jsdom 不实现布局，getBoundingClientRect 恒为 0。
 * 这里装一个「虚拟布局」：每个条目固定高度，位置 = 序号 * 高 - 滚动量。
 * 于是「在前面插入 N 条 → 后面的条目下移 N*高」这一因果关系可被真实观测，
 * 锚点补偿是否有效就能断言，而不是只验函数被调用过。
 */
function installVirtualLayout(w, { itemHeight = 100, viewport = 800 } = {}) {
  let scrollY = 0
  Object.defineProperty(w, 'innerHeight', { value: viewport, configurable: true })
  Object.defineProperty(w, 'scrollY', { get: () => scrollY, configurable: true })
  Object.defineProperty(w, 'pageYOffset', { get: () => scrollY, configurable: true })
  w.scrollBy = (_x, dy) => {
    scrollY = Math.max(0, scrollY + dy)
  }
  w.scrollTo = (opt) => {
    scrollY = Math.max(0, typeof opt === 'object' ? opt.top || 0 : opt || 0)
  }
  const layoutRows = () => [
    ...w.document.querySelectorAll('ul.post-list > li.post-item, li.post-entry'),
  ]
  w.Element.prototype.getBoundingClientRect = function () {
    const rows = layoutRows()
    const idx = rows.indexOf(this)
    if (idx < 0) return { top: 0, bottom: 0, left: 0, right: 0, width: 0, height: 0 }
    const top = idx * itemHeight - scrollY
    return {
      top,
      bottom: top + itemHeight,
      left: 0,
      right: 600,
      width: 600,
      height: itemHeight,
      x: 0,
      y: top,
    }
  }
  return {
    get scrollY() {
      return scrollY
    },
    set scrollY(v) {
      scrollY = v
    },
  }
}

function makeSite(html, url, preload = {}) {
  const dom = new JSDOM(html, { url: 'https://linux.sb' + url, runScripts: 'outside-only' })
  const w = dom.window
  w.unsafeWindow = w
  // rAF 用真实回调链：锚点补偿依赖多帧连续执行
  w.requestAnimationFrame = (fn) => setTimeout(() => fn(Date.now()), 1)
  w.localStorage.setItem('lsb_base:__core:rate', JSON.stringify(5))
  w.localStorage.setItem('lsb_base:__core:urlPoll', JSON.stringify(0))
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

function feedStub(w, getHtml) {
  w.fetch = async (url) => ({ status: 200, ok: true, url: String(url), text: async () => getHtml() })
}

/* ═══════════ 视口锚点补偿 ═══════════ */

test('锚点补偿：在视口上方插入 3 条，用户视线里的条目位置不变', async () => {
  let serve = homeHtml
  const { w, tick, until } = makeSite(homeHtml, '/', {
    'lsb_base:live-feed:__config': { jitterMs: 0, autoInsert: true, anchorScroll: true },
  })
  const layout = installVirtualLayout(w)
  feedStub(w, () => serve)
  await loadBase(w, PLUG('live-feed'))
  const dbg = await w.LSB.bus.request('live-feed:debug')
  await until(() => dbg.role() === 'leader', 3000)
  await dbg.pollOnce()

  // 用户滚到中段（远离顶部，旧实现在这里只会出横幅而不敢插入）
  layout.scrollY = 1500
  const rows = [...w.document.querySelectorAll('ul.post-list > li.post-item')]
  const probe = rows.find((li) => {
    const r = li.getBoundingClientRect()
    return r.bottom > 0 && r.top < w.innerHeight
  })
  assert.ok(probe, '视口内有条目可作观测点')
  const probeTopBefore = probe.getBoundingClientRect().top
  const countBefore = rows.length

  // 三条新帖到达（id 与时间都创新高）
  serve = homeHtml.replace(
    '</ul>',
    listItem(99990001, '新帖1', 1893456001, 0) +
      listItem(99990002, '新帖2', 1893456002, 0) +
      listItem(99990003, '新帖3', 1893456003, 0) +
      '</ul>',
  )
  await dbg.pollOnce()

  assert.ok(
    await until(
      () => w.document.querySelectorAll('ul.post-list > li.post-item').length === countBefore + 3,
    ),
    '远离顶部也自动插入了（锚点补偿使其安全）',
  )
  await until(() => dbg.anchorFrames() > 0, 800)
  await tick(150) // 等多帧补偿收敛

  const probeTopAfter = probe.getBoundingClientRect().top
  assert.ok(
    Math.abs(probeTopAfter - probeTopBefore) <= 1,
    `观测条目应停在原视口高度：插入前 ${probeTopBefore} → 插入后 ${probeTopAfter}`,
  )
  assert.equal(layout.scrollY, 1500 + 300, '滚动量按 3×100px 精确补偿')
})

test('锚点补偿：用户在补偿窗口内自己滚动 → 立即让位，不与用户抢滚动条', async () => {
  let serve = homeHtml
  const { w, tick, until } = makeSite(homeHtml, '/', {
    'lsb_base:live-feed:__config': { jitterMs: 0, autoInsert: true, anchorScroll: true },
  })
  const layout = installVirtualLayout(w)
  feedStub(w, () => serve)
  await loadBase(w, PLUG('live-feed'))
  const dbg = await w.LSB.bus.request('live-feed:debug')
  await until(() => dbg.role() === 'leader', 3000)
  await dbg.pollOnce()

  layout.scrollY = 1200
  serve = homeHtml.replace('</ul>', listItem(99990101, '新帖', 1893456101, 0) + '</ul>')
  await dbg.pollOnce()
  // 插入后立刻模拟用户猛滚（超出容差）
  layout.scrollY = 4000
  await tick(180)
  assert.equal(layout.scrollY, 4000, '用户滚动后补偿放手，不再回拽画面')
})

test('锚点补偿关闭时退回原行为：远离顶部只出横幅、不擅自插入', async () => {
  let serve = homeHtml
  const { w, until } = makeSite(homeHtml, '/', {
    'lsb_base:live-feed:__config': { jitterMs: 0, autoInsert: true, anchorScroll: false },
  })
  const layout = installVirtualLayout(w)
  feedStub(w, () => serve)
  await loadBase(w, PLUG('live-feed'))
  const dbg = await w.LSB.bus.request('live-feed:debug')
  await until(() => dbg.role() === 'leader', 3000)
  await dbg.pollOnce()

  layout.scrollY = 2000
  const before = w.document.querySelectorAll('ul.post-list > li.post-item').length
  serve = homeHtml.replace('</ul>', listItem(99990201, '新帖', 1893456201, 0) + '</ul>')
  await dbg.pollOnce()
  assert.ok(await until(() => dbg.bannerVisible()), '出横幅等用户点')
  assert.equal(
    w.document.querySelectorAll('ul.post-list > li.post-item').length,
    before,
    '未擅自插入',
  )
})

/* ═══════════ 打字免打扰 ═══════════ */

test('打字保护：焦点在回复框时只暂存不插入；失焦后自动补上', async () => {
  let serve = topicHtml
  const { w, tick, until } = makeSite(topicHtml, '/topic/1', {
    'lsb_base:live-feed:__config': { jitterMs: 0, autoInsert: true, pauseWhileTyping: true },
  })
  installVirtualLayout(w)
  feedStub(w, () => serve)
  await loadBase(w, PLUG('live-feed'))
  const dbg = await w.LSB.bus.request('live-feed:debug')
  await until(() => dbg.role() === 'leader', 3000)
  await dbg.pollOnce()

  // 造一个回复框并聚焦 + 写入草稿
  const form = w.document.createElement('form')
  form.className = 'ajax-reply-form'
  const ta = w.document.createElement('textarea')
  ta.name = 'body'
  form.appendChild(ta)
  w.document.body.appendChild(form)
  ta.focus()
  ta.value = '我正在写一段很长的回复'
  assert.equal(dbg.typing(), true, '识别为正在编辑')

  const floorsBefore = w.document.querySelectorAll('li.post-entry').length
  serve = topicHtml.replace('</ul>', floorItem(999001, 201) + '</ul>')
  await dbg.pollOnce()

  assert.equal(
    w.document.querySelectorAll('li.post-entry').length,
    floorsBefore,
    '打字期间不插入楼层（不顶走焦点、不打断输入法）',
  )
  assert.equal(dbg.pending(), 1, '内容已暂存')
  assert.ok(dbg.bannerVisible(), '仍然出横幅告知——功能降级而非罢工')
  assert.match(dbg.bannerText(), /写完自动加载/)

  // 写完：清空草稿并失焦 → 自动补上
  ta.value = ''
  ta.blur()
  ta.dispatchEvent(new w.FocusEvent('focusout', { bubbles: true }))
  assert.ok(
    await until(() => w.document.querySelectorAll('li.post-entry').length === floorsBefore + 1, 1500),
    '失焦后暂存内容自动补上',
  )
  await tick(20)
  assert.equal(dbg.pending(), 0)
})

test('实时流（帖子）：打字时自己的回复先入栏，横幅点击仍能补上别人的新楼', async () => {
  let serve = topicHtml
  const { w, tick, until } = makeSite(topicHtml, '/topic/1', {
    'lsb_base:live-feed:__config': { jitterMs: 0, autoInsert: true, pauseWhileTyping: true },
  })
  installVirtualLayout(w)
  feedStub(w, () => serve)
  await loadBase(w, PLUG('live-feed'))
  const dbg = await w.LSB.bus.request('live-feed:debug')
  await until(() => dbg.role() === 'leader', 3000)
  await dbg.pollOnce()

  const form = w.document.createElement('form')
  form.className = 'ajax-reply-form'
  const ta = w.document.createElement('textarea')
  ta.name = 'body'
  form.appendChild(ta)
  w.document.body.appendChild(form)
  ta.focus()
  ta.value = '我还在写'

  const floorsBefore = w.document.querySelectorAll('li.post-entry').length
  serve = topicHtml.replace('</ul>', floorItem(999001, 201) + floorItem(999002, 202) + '</ul>')
  await dbg.pollOnce()
  assert.equal(w.document.querySelectorAll('li.post-entry').length, floorsBefore, '打字期间不插楼')
  assert.equal(dbg.pending(), 2, '别人的两层已暂存')
  assert.ok(dbg.bannerVisible())

  const added = []
  w.LSB.bus.on(
    'topic:posts-added',
    (posts) => added.push(...posts.map((p) => p.postId)),
    { owner: 'test-own-reply' },
  )
  const ul = w.document.querySelector('ul.topic-post-list, ul.post-list')
  ul.insertAdjacentHTML('beforeend', floorItem(999003, 203))
  assert.ok(
    await until(() => added.includes(999003), 1500),
    '站点 AJAX 把自己的回复插进讨论串',
  )

  assert.equal(dbg.pending(), 2, '自己的楼不得把还没插入的别人回复从暂存里冲掉')
  assert.ok(dbg.bannerVisible(), '横幅仍可点')

  dbg.clickBanner()
  await tick(20)
  assert.ok(w.document.getElementById('post-999001'), '点击加载应补上别人的楼')
  assert.ok(w.document.getElementById('post-999002'))
  assert.equal(dbg.pending(), 0)
  assert.equal(dbg.bannerVisible(), false)
})

test('实时流（帖子）：打字时自己的回复先入栏，写完失焦仍自动补上别人的新楼', async () => {
  let serve = topicHtml
  const { w, until } = makeSite(topicHtml, '/topic/1', {
    'lsb_base:live-feed:__config': { jitterMs: 0, autoInsert: true, pauseWhileTyping: true },
  })
  installVirtualLayout(w)
  feedStub(w, () => serve)
  await loadBase(w, PLUG('live-feed'))
  const dbg = await w.LSB.bus.request('live-feed:debug')
  await until(() => dbg.role() === 'leader', 3000)
  await dbg.pollOnce()

  const form = w.document.createElement('form')
  form.className = 'ajax-reply-form'
  const ta = w.document.createElement('textarea')
  ta.name = 'body'
  form.appendChild(ta)
  w.document.body.appendChild(form)
  ta.focus()
  ta.value = '我还在写'

  serve = topicHtml.replace('</ul>', floorItem(999001, 201) + floorItem(999002, 202) + '</ul>')
  await dbg.pollOnce()
  assert.equal(dbg.pending(), 2)

  const added = []
  w.LSB.bus.on(
    'topic:posts-added',
    (posts) => added.push(...posts.map((p) => p.postId)),
    { owner: 'test-own-reply-flush' },
  )
  const ul = w.document.querySelector('ul.topic-post-list, ul.post-list')
  ul.insertAdjacentHTML('beforeend', floorItem(999003, 203))
  assert.ok(await until(() => added.includes(999003), 1500))
  assert.equal(dbg.pending(), 2, '自己的楼不得冲掉暂存')

  ta.value = ''
  ta.blur()
  ta.dispatchEvent(new w.FocusEvent('focusout', { bubbles: true }))
  assert.ok(await until(() => !!w.document.getElementById('post-999001'), 1500), '写完失焦应自动补上')
  assert.ok(w.document.getElementById('post-999002'))
  assert.equal(dbg.pending(), 0)
})

test('打字保护：搜索框有残留文字不算"在编辑"（逛吧会因此永久停摆）', async () => {
  const { w, until } = makeSite(homeHtml, '/', {
    'lsb_base:live-feed:__config': { jitterMs: 0, pauseWhileTyping: true },
  })
  installVirtualLayout(w)
  feedStub(w, () => homeHtml)
  await loadBase(w, PLUG('live-feed'))
  const dbg = await w.LSB.bus.request('live-feed:debug')
  await until(() => dbg.role() === 'leader', 3000)

  // 夹具自带 .search-input；给它填上值（很常见：用户搜过东西没清）
  const search = w.document.querySelector('.search-input') || (() => {
    const i = w.document.createElement('input')
    i.className = 'search-input'
    i.type = 'search'
    w.document.body.appendChild(i)
    return i
  })()
  search.value = 'k8s'
  assert.equal(dbg.typing(), false, '搜索框残留不应冻结实时流')

  // 焦点真的落在搜索框里时才算（此时确实在输入）
  search.focus()
  assert.equal(dbg.typing(), true, '焦点在输入框内：暂缓插入')
})

test('打字保护关闭时不受编辑状态影响', async () => {
  const { w, until } = makeSite(topicHtml, '/topic/1', {
    'lsb_base:live-feed:__config': { jitterMs: 0, pauseWhileTyping: false },
  })
  installVirtualLayout(w)
  feedStub(w, () => topicHtml)
  await loadBase(w, PLUG('live-feed'))
  const dbg = await w.LSB.bus.request('live-feed:debug')
  await until(() => dbg.role() === 'leader', 3000)

  const ta = w.document.createElement('textarea')
  ta.name = 'body'
  w.document.body.appendChild(ta)
  ta.focus()
  ta.value = 'draft'
  assert.equal(dbg.typing(), false, '开关关闭 → 不做打字判定')
})

/* ═══════════ 老帖新动态：指纹 ═══════════ */

test('新鲜度指纹：老帖回复数变化 → 原地高亮而非当成新帖插入', async () => {
  const OLD = listItem(4242, '会被顶起来的老帖', 1700000000, 3)
  const NEW = listItem(4242, '会被顶起来的老帖', 1893457777, 7)
  const base = homeHtml.replace('</ul>', OLD + '</ul>')
  let serve = base
  const { w, tick, until } = makeSite(base, '/', {
    'lsb_base:live-feed:__config': { jitterMs: 0, autoInsert: true, highlightBumped: true },
  })
  installVirtualLayout(w)
  feedStub(w, () => serve)
  await loadBase(w, PLUG('live-feed'))
  const dbg = await w.LSB.bus.request('live-feed:debug')
  await until(() => dbg.role() === 'leader', 3000)
  await dbg.pollOnce()

  const countBefore = w.document.querySelectorAll('ul.post-list > li.post-item').length
  const fp0 = dbg.freshness(4242)
  assert.ok(fp0, '基线已记录该帖指纹')

  // 同一帖：回复数 3 → 7，活跃时间推进（典型「被顶起来」）
  serve = base.replace(OLD, NEW)
  await dbg.pollOnce()

  assert.equal(dbg.pending(), 0, '不当作新帖排队')
  assert.equal(
    w.document.querySelectorAll('ul.post-list > li.post-item').length,
    countBefore,
    '不重复插入同一帖',
  )
  assert.equal(dbg.lastBumped(), 1, '识别为 1 条老帖有新动态')
  assert.notEqual(dbg.freshness(4242), fp0, '指纹已更新')
  assert.ok(
    await until(() => !!w.document.querySelector('li.post-item.lsb-live-bumped'), 800),
    '对应行原地高亮',
  )
  await tick(20)

  // 再轮询同样内容：指纹相同 → 不再报动静（幂等）
  await dbg.pollOnce()
  assert.equal(dbg.lastBumped(), 0, '指纹未变则不重复提示')
})

test('置灰行被顶起来：高亮期间拉回不透明，不被 lsb-seen 压成半透明', async () => {
  const OLD = listItem(4242, '已读老帖', 1700000000, 3)
  const NEW = listItem(4242, '已读老帖', 1893457777, 7)
  const base = homeHtml.replace('</ul>', OLD + '</ul>')
  let serve = base
  const { w, until } = makeSite(base, '/', {
    'lsb_base:live-feed:__config': { jitterMs: 0, autoInsert: true, highlightBumped: true },
    'lsb_base:read-mark:marks': { 4242: { ts: Date.now(), w: 1, r: 3 } },
  })
  installVirtualLayout(w)
  feedStub(w, () => serve)
  await loadBase(w, PLUG('read-mark'), PLUG('live-feed'))
  const dbg = await w.LSB.bus.request('live-feed:debug')
  await until(() => dbg.role() === 'leader', 3000)
  await dbg.pollOnce()

  const row = () =>
    [...w.document.querySelectorAll('li.post-item')].find((li) => li.querySelector('a[href*="/topic/4242"]'))
  assert.ok(row()?.classList.contains('lsb-seen'), '已读置灰已上色')
  const dimmed = Number(w.getComputedStyle(row()).opacity)
  assert.ok(dimmed > 0 && dimmed < 1, `置灰应降低透明度，实际 ${dimmed}`)

  serve = base.replace(OLD, NEW)
  await dbg.pollOnce()
  assert.ok(
    await until(() => row()?.classList.contains('lsb-live-bumped'), 800),
    '对应行原地高亮',
  )
  assert.equal(w.getComputedStyle(row()).opacity, '1', '高亮期间必须盖过置灰，否则闪一下看不见')
  const css = [...w.document.querySelectorAll('style')].map((s) => s.textContent).join('\n')
  assert.match(css, /lsb-live-bumped[\s\S]{0,180}box-shadow/, '高亮用左边线，不只改半透明背景')
})

/* ═══════════ 帖子页翻页追补 ═══════════ */

test('帖子页：新回复把帖子顶到新一页时，本轮立即追补而非等下个周期', async () => {
  // jitter 拉大：不让选主触发自动巡检，全程手动轮询，
  // 以保证「远端扩页」这一刻 ctx.pages 仍是旧末页——这正是要考察的追补场景。
  const { w, until } = makeSite(topicHtml, '/topic/1', {
    'lsb_base:live-feed:__config': { jitterMs: 600000, autoInsert: true },
  })
  installVirtualLayout(w)

  // 夹具自带分页（末页 N）。稍后让远端宣告 N+1 页，新楼层只出现在这一新页上——
  // 旧实现只抓 ctx.pages 那一页，要等下一轮 ctx.pages 推进后才看得到。
  const basePages = Math.max(
    1,
    ...[...w.document.querySelectorAll('.pagination a[href*="p="]')].map(
      (a) => Number((a.getAttribute('href').match(/[?&]p=(\d+)/) || [])[1]) || 1,
    ),
  )
  const newPage = basePages + 1
  const onNewPage = (u) => new RegExp(`[?&]p=${newPage}(?:&|$)`).test(u)
  const PAGE_LINK = `<div class="pagination"><a href="/topic/1?p=${newPage}">${newPage}</a></div>`

  let expanded = false // 远端是否已扩出新页
  const fetched = []
  w.fetch = async (url) => {
    const u = String(url)
    fetched.push(u)
    let body = topicHtml
    if (expanded) {
      body = onNewPage(u)
        ? topicHtml.replace('</ul>', floorItem(999777, 301) + '</ul>').replace('</body>', PAGE_LINK + '</body>')
        : topicHtml.replace('</body>', PAGE_LINK + '</body>')
    }
    return { status: 200, ok: true, url: u, text: async () => body }
  }

  await loadBase(w, PLUG('live-feed'))
  const dbg = await w.LSB.bus.request('live-feed:debug')

  // 第一轮：远端还没扩页，建立基线（顺带让 mode/ctx 初始化）
  await dbg.pollOnce()
  assert.equal(dbg.mode(), 'topic')
  assert.equal(dbg.baseline().pages, basePages, '起点是旧末页')
  assert.equal(w.document.querySelector('li#post-999777'), null, '新楼层尚未到达')

  // 远端扩页：新回复落在第 N+1 页
  expanded = true
  fetched.length = 0
  const before = w.document.querySelectorAll('li.post-entry').length
  await dbg.pollOnce()

  assert.ok(
    fetched.some(onNewPage),
    `同一轮内追抓了新增第 ${newPage} 页，实际请求：${JSON.stringify(fetched)}`,
  )
  assert.ok(
    await until(() => w.document.querySelectorAll('li.post-entry').length === before + 1, 1500),
    '新页的回复当轮即到（不必等下个轮询周期）',
  )
  assert.ok(w.document.querySelector('li#post-999777'), '目标楼层已在文档中')
  assert.equal(dbg.baseline().pages, newPage, '末页水位已推进')
})

/* ═══════════ 横幅动作可改写 ═══════════ */

test('横幅动作随状态改写：静默插入后变为「回到顶部」并真的滚回顶部', async () => {
  let serve = homeHtml
  const { w, tick, until } = makeSite(homeHtml, '/', {
    'lsb_base:live-feed:__config': { jitterMs: 0, autoInsert: true, anchorScroll: true, maxInsert: 30 },
  })
  const layout = installVirtualLayout(w)
  feedStub(w, () => serve)
  await loadBase(w, PLUG('live-feed'))
  const dbg = await w.LSB.bus.request('live-feed:debug')
  await until(() => dbg.role() === 'leader', 3000)
  await dbg.pollOnce()

  layout.scrollY = 2600 // 远离顶部
  serve = homeHtml.replace('</ul>', listItem(99991001, '远处插入的新帖', 1893458001, 0) + '</ul>')
  await dbg.pollOnce()
  await tick(150)

  assert.ok(
    await until(() => dbg.bannerVisible() && /已加载/.test(dbg.bannerText())),
    `静默插入后仍告知用户，实际文案：${dbg.bannerText()}`,
  )
  assert.match(dbg.bannerText(), /回到顶部/)

  dbg.clickBanner() // 动作已被改写为「回顶部」，而非旧的「加载」
  await tick(20)
  assert.equal(layout.scrollY, 0, '点击后回到顶部')
  assert.equal(dbg.bannerVisible(), false, '横幅随之收起')
})

/* ═══════════ 后台不插入 ═══════════ */

test('页面不可见时不插入，切回前台自动补上', async () => {
  let serve = topicHtml
  const { w, until } = makeSite(topicHtml, '/topic/1', {
    'lsb_base:live-feed:__config': { jitterMs: 0, autoInsert: true },
  })
  installVirtualLayout(w)
  feedStub(w, () => serve)
  await loadBase(w, PLUG('live-feed'))
  const dbg = await w.LSB.bus.request('live-feed:debug')
  await until(() => dbg.role() === 'leader', 3000)
  await dbg.pollOnce()

  let vis = 'hidden'
  Object.defineProperty(w.document, 'visibilityState', { get: () => vis, configurable: true })

  const before = w.document.querySelectorAll('li.post-entry').length
  serve = topicHtml.replace('</ul>', floorItem(999888, 401) + '</ul>')
  await dbg.pollOnce()
  assert.equal(w.document.querySelectorAll('li.post-entry').length, before, '后台不动 DOM')
  assert.equal(dbg.pending(), 1, '暂存待补')

  vis = 'visible'
  w.document.dispatchEvent(new w.Event('visibilitychange'))
  assert.ok(
    await until(() => w.document.querySelectorAll('li.post-entry').length === before + 1, 1500),
    '切回前台自动补上',
  )
})

test('列表页软导航（首页→版块）重建基线，不沿用旧 seen', async () => {
  const { w, until } = makeSite(homeHtml, '/', {
    'lsb_base:__core:urlPoll': 25,
    'lsb_base:live-feed:__config': { jitterMs: 0, autoInsert: false, pollSec: 30 },
  })
  feedStub(w, () => w.document.documentElement.outerHTML)
  await loadBase(w, PLUG('live-feed'))
  const dbg = await w.LSB.bus.request('live-feed:debug')
  await until(() => dbg.role() === 'leader', 3000)
  await dbg.pollOnce()
  const homeSeen = dbg.baseline().seen
  assert.ok(homeSeen > 1, '首页基线应记下多条')

  w.document.querySelector('ul.post-list').innerHTML = listItem(42, '版块帖', 1893456000, 0)
  w.history.pushState({}, '', '/forum/4?sort=comment')
  assert.ok(await until(() => w.LSB.info().page.type === 'forum', 800), '软导航被基座捕获')
  await until(() => dbg.baseline().seen === 1, 800)
  assert.equal(dbg.mode(), 'list')
  assert.equal(dbg.baseline().seen, 1, '必须按新列表重建，不得残留首页 id')
})

test('进出帖子后立刻回到列表模式，巡检不能插进已经卸掉的 ul', async () => {
  let serve = homeHtml
  const { w, tick, until } = makeSite(homeHtml, '/', {
    'lsb_base:__core:urlPoll': 25,
    'lsb_base:live-feed:__config': { jitterMs: 0, autoInsert: false, pollSec: 30 },
  })
  feedStub(w, () => serve)
  await loadBase(w, PLUG('live-feed'))
  const dbg = await w.LSB.bus.request('live-feed:debug')
  await until(() => dbg.role() === 'leader', 3000)
  await dbg.pollOnce()
  assert.equal(dbg.mode(), 'list')
  const homeSeen = dbg.baseline().seen
  assert.ok(homeSeen > 1)

  const ul = w.document.querySelector('ul.post-list')
  const parent = ul.parentNode
  const next = ul.nextSibling
  ul.remove()
  parent.insertAdjacentHTML('beforeend', `<ul class="topic-post-list">${floorItem(1, 0)}</ul>`)
  w.history.pushState({}, '', '/topic/1')
  assert.ok(await until(() => w.LSB.info().page.type === 'topic', 800))
  await tick(120)
  assert.notEqual(dbg.mode(), 'list', '进帖子后不应还停在首页列表基线')

  w.document.querySelector('ul.topic-post-list')?.remove()
  if (next) parent.insertBefore(ul, next)
  else parent.append(ul)
  w.history.pushState({}, '', '/')
  w.dispatchEvent(new w.PopStateEvent('popstate'))
  await tick(5)
  assert.equal(dbg.mode(), 'list', '换页后应马上重建基线，不能再等 80ms（那一窗巡检会写进卸掉的列表）')
  assert.equal(dbg.baseline().ul, ul, '基线应对着当前还在文档里的列表')

  serve = homeHtml.replace('</ul>', listItem(99990022, '回家后的新帖', 1893456099, 0) + '</ul>')
  await dbg.pollOnce()
  assert.ok(dbg.pending() >= 1, '回首页后的巡检仍能发现新帖')
})

test('实时流（帖子）：站点已经插进楼中楼的回复，不再复制到回复栏下面', async () => {
  let serve = topicHtml
  const extra = floorItem(888777, 300)
  const { w, until } = makeSite(topicHtml, '/topic/1', {
    'lsb_base:live-feed:__config': { jitterMs: 0, autoInsert: true, pauseWhileTyping: false },
  })
  feedStub(w, () => serve)
  await loadBase(w, PLUG('live-feed'))
  const dbg = await w.LSB.bus.request('live-feed:debug')
  await until(() => dbg.role() === 'leader', 3000)
  await dbg.pollOnce()

  const ul = w.document.querySelector('ul.topic-post-list, ul.post-list')
  const host = ul.querySelector('li.post-entry')
  host.insertAdjacentHTML('afterend', extra)
  const native = w.document.getElementById('post-888777')
  assert.ok(native, '站点 AJAX 已经把回复插在被回复楼后面')
  assert.equal(host.nextElementSibling, native)

  serve = topicHtml.replace('</ul>', extra + '</ul>')
  await dbg.pollOnce()

  assert.equal(
    w.document.querySelectorAll('[id="post-888777"]').length,
    1,
    '实时流不得再克隆一份楼层',
  )
  assert.equal(host.nextElementSibling, native, '仍跟在被回复楼后面')
  assert.notEqual(ul.lastElementChild, native, '不得被追加到列表末尾（回复栏一侧）')
})

test('发现新帖时读取 toastOnNew：关闭自动插入则弹提示', async () => {
  let serve = homeHtml
  const { w, until } = makeSite(homeHtml, '/', {
    'lsb_base:live-feed:__config': { jitterMs: 0, autoInsert: false, toastOnNew: true },
  })
  feedStub(w, () => serve)
  await loadBase(w, PLUG('live-feed'))
  const dbg = await w.LSB.bus.request('live-feed:debug')
  await until(() => dbg.role() === 'leader', 3000)
  await dbg.pollOnce()
  serve = homeHtml.replace('</ul>', listItem(99990011, '发现我', 1893456099, 0) + '</ul>')
  await dbg.pollOnce()
  assert.ok(dbg.pending() >= 1)
  assert.ok(
    await until(() => [...w.document.querySelectorAll('.lsb-toast')].some((t) => t.textContent.includes('新帖')), 800),
    'toastOnNew 打开时应弹提示',
  )
})
