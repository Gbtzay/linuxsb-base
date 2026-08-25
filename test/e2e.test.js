/**
 * 端到端：在 jsdom 里加载「构建产物基座 + 两个示例插件」的真实脚本文件，
 * 验证：排队握手（乱序安装）、依赖解析、跨插件 RPC、UI 实际生效。
 */
import { test } from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { JSDOM } from 'jsdom'

const baseCode = readFileSync(new URL('../dist/linuxsb-base.user.js', import.meta.url), 'utf8')
const pluginStats = readFileSync(new URL('../plugins/floor-stats.user.js', import.meta.url), 'utf8')
const pluginBadge = readFileSync(new URL('../plugins/hot-floor-badge.user.js', import.meta.url), 'utf8')
const topicHtml = readFileSync(new URL('./fixtures/topic1.html', import.meta.url), 'utf8')

function makeSite({ preload = {} } = {}) {
  const dom = new JSDOM(topicHtml, {
    url: 'https://linux.sb/topic/1',
    runScripts: 'outside-only',
  })
  const w = dom.window
  w.unsafeWindow = w // 模拟 @grant none：页面 window 即 unsafeWindow
  w.requestAnimationFrame = (fn) => setTimeout(() => fn(Date.now()), 0) // 替代 pretendToBeVisual
  for (const [k, v] of Object.entries(preload)) {
    w.localStorage.setItem(k, JSON.stringify(v))
  }
  const tick = (ms = 25) => new Promise((r) => setTimeout(r, ms))
  return { dom, w, tick }
}

test('正常顺序：先装基座后装插件，全部激活且 RPC 可用', async () => {
  const { w, tick } = makeSite({
    preload: { 'lsb_base:hot-floor-badge:__config': { threshold: 1 } },
  })
  w.eval(baseCode)
  assert.equal(w.LSB.ready, true, 'body 已存在时同步启动')
  w.eval(pluginStats)
  w.eval(pluginBadge)
  await tick()

  const info = w.LSB.info()
  assert.equal(
    JSON.stringify(info.plugins.filter((p) => !p.id.startsWith('__')).map((p) => [p.id, p.state])),
    JSON.stringify([
      ['floor-stats', 'active'],
      ['hot-floor-badge', 'active'],
    ]),
  )

  // 跨插件 RPC（消费方 → 生产方）
  const summary = await w.LSB.bus.request('floorstats:summary')
  assert.equal(summary.topicId, 1)
  assert.equal(summary.total, 51, '主楼 + 50 层回复')

  // UI 实际生效：每层都有「只看TA」按钮；阈值 1 时全员高频标记
  assert.equal(w.document.querySelectorAll('.lsb-only-btn').length, 51)
  assert.ok(w.document.querySelectorAll('.lsb-hot-badge').length >= 45)

  // 只看TA 按钮真的能隐藏其它楼层：第一个按钮在主楼（uid 1），聚焦后只剩 TA 的楼层
  const firstBtn = w.document.querySelector('.lsb-only-btn')
  const opLi = firstBtn.closest('li.post-entry')
  const opUid = (opLi.querySelector('a[href^="/user/"]').getAttribute('href').match(/\/user\/(\d+)/) || [])[1]
  firstBtn.click()
  await tick(10)
  const visible = [...w.document.querySelectorAll('ul.post-list > li.post-entry')].filter(
    (li) => !li.classList.contains('lsb-dim'),
  )
  const expectVisible = [...w.document.querySelectorAll('ul.post-list > li.post-entry')].filter((li) =>
    [...li.querySelectorAll('a[href^="/user/"]')].some((a) => a.getAttribute('href') === `/user/${opUid}`),
  ).length
  assert.equal(visible.length, expectVisible)
  assert.ok(visible.includes(opLi), '主楼保持可见')
  assert.ok(expectVisible < 51, '确实隐藏了别的楼层')
})

test('乱序：插件先于基座加载 → 排队等待，基座就绪后补注册', async () => {
  const { w, tick } = makeSite()
  w.eval(pluginStats)
  w.eval(pluginBadge)
  assert.equal(w.LSB, undefined, '基座未装')
  assert.equal(w.LSB_PLUGINS.length, 2, '插件进入待命队列')

  w.eval(baseCode)
  await tick()

  const info = w.LSB.info()
  for (const id of ['floor-stats', 'hot-floor-badge']) {
    assert.equal(info.plugins.find((p) => p.id === id).state, 'active', `${id} 被补激活`)
  }
  assert.equal(await w.LSB.bus.hasHandler('floorstats:summary'), true)
})

test('缺依赖：只装消费方 → 挂起等待而不是报错崩溃', async () => {
  const { w, tick } = makeSite()
  w.eval(baseCode)
  w.eval(pluginBadge) // 没有 floor-stats
  await tick()
  const rec = w.LSB.info().plugins.find((p) => p.id === 'hot-floor-badge')
  assert.equal(rec.state, 'registered', '等待依赖中')
  assert.equal(w.bus ?? true, true)

  // 此时把生产方装上，应立即连带激活
  w.eval(pluginStats)
  await tick()
  assert.equal(w.LSB.info().plugins.find((p) => p.id === 'hot-floor-badge').state, 'active')
})

test('面板：核心页 + 插件页都渲染，楼层统计有数据', async () => {
  const { w, tick } = makeSite()
  w.eval(baseCode)
  w.eval(pluginStats)
  await tick()

  w.LSB.open('__core_plugins')
  assert.match(w.document.querySelector('.lsb-view').textContent, /楼层统计/)

  w.LSB.open('floor-stats')
  const view = w.document.querySelector('.lsb-view').textContent
  assert.match(view, /共 51 楼/)
  assert.match(view, /痛失姓名的站长/)
  w.LSB.open() // close
})

test('高频标记：AJAX 新楼层后重算阈值，新作者也能打标', async () => {
  const { w, tick } = makeSite({
    preload: { 'lsb_base:hot-floor-badge:__config': { threshold: 1 } },
  })
  w.eval(baseCode)
  w.eval(pluginStats)
  w.eval(pluginBadge)
  await tick()

  const li = w.document.createElement('li')
  li.className = 'post-entry'
  li.id = 'post-999001'
  li.setAttribute('data-floor', '999')
  li.innerHTML =
    '<a class="post-title post-author" href="/user/777001">新人甲</a>' +
    '<span data-performance-time="1"></span><div class="post-content">x</div>'
  const ul = w.document.querySelector('ul.topic-post-list, ul.post-list')
  ul.appendChild(li)
  await tick(80)
  assert.ok(li.querySelector('.lsb-hot-badge'), '阈值 1：新作者发言后应打 高频 标')
})
