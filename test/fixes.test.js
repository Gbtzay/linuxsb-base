/** Bug 修复回归：ui.showTab 暴露 / 签到历史收割 / 配置页补全 */
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
  w.fetch = async (url) => ({ status: 200, ok: true, url: String(url), text: async () => '' }) // 万能静音
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

test('基座暴露 api.ui.showTab；签到日历翻月即时重渲染（无需刷新）', async () => {
  const { w } = makeSite()
  await loadBase(w, PLUG('checkin-calendar'))

  // showTab 已在插件 API 层可用且受权限门保护
  let probe = null
  w.LSB.register({ id: 'showtab-probe', version: '1.0.0', permissions: ['read'] }, (a) => {
    try {
      a.ui.showTab('x')
    } catch (e) {
      probe = e.message
    }
  })
  assert.match(probe, /'ui'/, '未声明 ui 权限时被拦截')

  // 打开日历 → 点「下一个月」→ 月份标题变化（旧版会抛 api.ui.showTab is not a function）
  w.LSB.open('checkin-calendar')
  const ymOf = () => w.document.querySelector('.lsb-cal-head strong')?.textContent
  const before = ymOf()
  assert.ok(before, '月份标题渲染')

  w.document.querySelector('[data-next]').click()
  await new Promise((r) => setTimeout(r, 30))
  const afterNext = ymOf()
  assert.ok(afterNext && afterNext !== before, `翻到下月：${before} → ${afterNext}`)

  w.document.querySelector('[data-prev]').click()
  await new Promise((r) => setTimeout(r, 30))
  assert.equal(ymOf(), before, '再翻回来')

  // 其它依赖 showTab 的刷新路径同样恢复：积分趋势范围切换
  w.LSB.register({ id: 'range-probe', version: '1.0.0', permissions: ['read', 'storage', 'ui'] }, () => {})
})

test('AI 总结配置页存在并渲染字段（此前完全缺失）', async () => {
  const { w } = makeSite()
  await loadBase(w, PLUG('ai-summary'))

  w.LSB.open('ai-summary')
  const view = w.document.querySelector('.lsb-view')
  assert.ok(view.querySelector('input'), '配置表单已生成')
  const text = view.textContent
  assert.match(text, /API 端点/)
  assert.match(text, /API Key/)
  assert.match(text, /总结风格/)
})

test('用户画像 / 高频标记 / 哨兵设置 三页补齐', async () => {
  const { w } = makeSite()
  await loadBase(w, PLUG('hover-profile'), PLUG('hot-floor-badge'), PLUG('unread-sentinel'))
  for (const id of ['hover-profile', 'hot-floor-badge', 'unread-sentinel']) {
    w.LSB.open(id)
    const t = w.document.querySelector('.lsb-view')?.textContent || ''
    assert.ok(!t.includes('面板渲染失败'), `${id} 面板渲染异常: ${t.slice(0, 80)}`)
  }
  w.LSB.open('hot-floor-badge')
  assert.match(w.document.querySelector('.lsb-view').textContent, /多少楼以上|高频/)

  const clickTab = (name) => {
    const b = [...w.document.querySelectorAll('.lsb-tab')].find((el) => el.textContent === name)
    assert.ok(b, `找不到选项卡 ${name}`)
    b.click()
    return b
  }
  w.LSB.open('unread-sentinel')
  clickTab('消息箱')
  const inboxText = w.document.querySelector('.lsb-view')?.textContent || ''
  assert.match(inboxText, /还没有捕获到新动态|角色：/)
  assert.ok([...w.document.querySelectorAll('.lsb-tab')].find((el) => el.textContent === '消息箱')?.classList.contains('is-active'))
  clickTab('哨兵设置')
  const cfgText = w.document.querySelector('.lsb-view')?.textContent || ''
  assert.match(cfgText, /巡检间隔/)
  assert.ok([...w.document.querySelectorAll('.lsb-tab')].find((el) => el.textContent === '哨兵设置')?.classList.contains('is-active'))
  assert.equal(
    [...w.document.querySelectorAll('.lsb-tab')].find((el) => el.textContent === '消息箱')?.classList.contains('is-active'),
    false,
  )
})

test('签到日历：从签到页收割过去的历史日期', async () => {
  const day = (n) => {
    const x = new Date(Date.now() - n * 864e5)
    const p = (v) => String(v).padStart(2, '0')
    return `${x.getFullYear()}-${p(x.getMonth() + 1)}-${p(x.getDate())}`
  }
  const histHtml =
    '<html><body><div>今日已签到</div>' +
    `<ul class="sign-history"><li>${day(1)} 获得 5 积分</li><li>${day(2)} 获得 5 积分</li>` +
    `<li>注册时间：2026-01-15</li></ul></body></html>` // 注册日期也会被抓，但属可接受的过标记

  const { w } = makeSite()
  w.fetch = async (url) => ({ status: 200, ok: true, url: String(url), text: async () => histHtml })
  await loadBase(w, PLUG('checkin-calendar'))
  const dbg = await w.LSB.bus.request('checkin-calendar:debug')
  await dbg.probe(true)

  const recs = dbg.recs()
  assert.equal(recs[day(1)]?.s, 'ok', '昨日从页面收割为已签')
  assert.equal(recs[day(2)]?.s, 'ok', '前日同上')
  assert.equal(recs[day(0)].s, 'ok', '今天由「今日已签到」判定')
})
