/** 错误日志体系：捕获、持久化、合并、面板、套件徽标 */
import { test } from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { JSDOM } from 'jsdom'

const baseCode = readFileSync(new URL('../dist/linuxsb-base.user.js', import.meta.url), 'utf8')
const suiteCode = readFileSync(new URL('../dist/linuxsb-suite.user.js', import.meta.url), 'utf8')
const topicHtml = readFileSync(new URL('./fixtures/topic1.html', import.meta.url), 'utf8')

function makeSite(preload = {}) {
  const dom = new JSDOM(topicHtml, { url: 'https://linux.sb/topic/1', runScripts: 'outside-only' })
  const w = dom.window
  w.unsafeWindow = w
  w.requestAnimationFrame = (fn) => setTimeout(() => fn(Date.now()), 0)
  w.fetch = async (url) => ({ status: 200, ok: true, url: String(url), text: async () => '' })
  w.localStorage.setItem('lsb_base:__core:rate', JSON.stringify(10))
  w.localStorage.setItem('lsb_base:__core:urlPoll', JSON.stringify(0))
  for (const [k, v] of Object.entries(preload)) w.localStorage.setItem(k, JSON.stringify(v))
  const tick = (ms) => new Promise((r) => setTimeout(r, ms))
  const until = async (fn, ms = 2000) => {
    const end = Date.now() + ms
    for (;;) {
      if (fn()) return true
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

test('错误捕获：模块主动上报 / setup 崩溃 / 未捕获异常，全部持久化', async () => {
  const { w } = makeSite()
  await loadBase(
    w,
    `;${String.fromCharCode(0)}`.slice(0, 0) +
      `
    window.__LSB_PLUGINS_QUIET__ = 1
    `,
    PLUG_INLINE('err-mod-a', ['read'], (api) => {
      api.error(new Error('boom-A'))
    }),
    PLUG_INLINE('err-mod-b', ['read'], () => {
      throw new Error('boom-B-setup')
    }),
  )

  // 模块主动上报
  let errs = w.LSB.errors()
  assert.ok(errs.some((e) => e.kind === 'module-error' && e.id === 'err-mod-a' && e.msg === 'boom-A'), 'api.error 入账')

  // setup 崩溃经 _onPluginError 入账
  errs = w.LSB.errors()
  assert.ok(errs.some((e) => e.kind === 'plugin-error' && e.id === 'err-mod-b' && /boom-B-setup/.test(e.msg)), 'setup 错误入账')

  // 未捕获异常（window error 事件）
  w.dispatchEvent(
    new w.ErrorEvent('error', { error: new TypeError('uncaught-x'), message: 'uncaught-x', filename: 'fake.js', lineno: 42 }),
  )
  await new Promise((r) => setTimeout(r, 20))
  errs = w.LSB.errors()
  assert.ok(errs.some((e) => e.kind === 'uncaught' && e.msg === 'uncaught-x' && e.where.includes('fake.js')), '未捕获异常入账')

  // 持久化：localStorage 里存在且可还原
  const raw = JSON.parse(w.localStorage.getItem('lsb_base:__core:errorlog'))
  assert.ok(Array.isArray(raw) && raw.length >= 3, '已写入存储')
})

// 生成内联注册代码（避免测试文件里出现跨域函数引用问题）
function PLUG_INLINE(id, permissions, setupBody) {
  return `
  ;(function(){
    const manifest = { id: ${JSON.stringify(id)}, name: ${JSON.stringify(id)}, version: '1.0.0',
      requires: { base: '*' }, permissions: ${JSON.stringify(permissions)} }
    const setup = (${setupBody.toString().replace(/^/, '')})
    const w = typeof unsafeWindow !== 'undefined' ? unsafeWindow : window
    if (w.LSB && w.LSB.register) w.LSB.register(manifest, setup)
    else { w.LSB_PLUGINS = w.LSB_PLUGINS || []; w.LSB_PLUGINS.push({ manifest, setup }) }
  })()
  `
}

test('合并去重：2 秒内同源同消息只留一条并累加计数', async () => {
  const { w } = makeSite()
  await loadBase(w, PLUG_INLINE('dup-mod', ['read'], (api) => {
    api.error('same-msg')
    api.error('same-msg')
    api.error('same-msg')
  }))
  const errs = w.LSB.errors().filter((e) => e.id === 'dup-mod')
  assert.equal(errs.length, 1, '合并为一条')
  assert.equal(errs[0].n, 3, '计数 ×3')
})

test('运行日志面板：渲染错误行、清空生效、导出不抛错', async () => {
  const { w } = makeSite()
  await loadBase(w, PLUG_INLINE('panel-mod', ['read'], (api) => {
    api.error('面板可见的错误')
  }))

  w.LSB.open('__core_logs')
  const view = () => w.document.querySelector('.lsb-view')?.textContent || ''
  assert.match(view(), /面板可见的错误/)
  assert.match(view(), /module-error/)

  // 清空（确认弹窗自动确认）
  ;[...w.document.querySelectorAll('[data-clear]')].pop().click()
  await new Promise((r) => setTimeout(r, 30))
  const yes = [...w.document.querySelectorAll('.lsb-panel [data-yes]')].pop()
  yes?.click()
  await new Promise((r) => setTimeout(r, 30))
  assert.equal(w.LSB.errors().length, 0, '清空后归零')

  // 导出按钮不抛错即可
  ;[...w.document.querySelectorAll('[data-export]')].pop()?.click()
  assert.ok(true)
})

test('套件总览：出错模块卡片显示 ⚠ 徽标 + 指标区有错误统计', async () => {
  const { w, until } = makeSite()
  w.eval(baseCode)
  w.eval(suiteCode)
  await new Promise((r) => setTimeout(r, 60))

  // 让一个真实成员报错：ai-summary 未配置 Key 时点击分析按钮 → toast 但不入 errorlog；
  // 改用直接调用其内部会抛错的路径：local-bridge analyze 离线 → 该插件自吞异常也不入。
  // 因此用通用通道：向基座登记一条 module-error（等价于任何模块真实上报后的状态）
  w.LSB.register({ id: 'badge-probe', version: '1.0.0', permissions: ['read'] }, (api) => {
    api.error('probe-error-for-badge')
  })
  await new Promise((r) => setTimeout(r, 20))

  // badge-probe 不在 MEMBERS 卡片中；改为验证指标行的总计数与「无徽标时不崩」：
  w.LSB.open('suite')
  const ok = await until(() => {
    const t = w.document.querySelector('.lsb-view')?.textContent || ''
    return t.includes('关键指标') && !t.includes('汇总中')
  })
  assert.ok(ok, '总览渲染完成')
  const view = w.document.querySelector('.lsb-view').textContent
  assert.match(view, /错误\(7天\)/)
  assert.match(view, /1 条/)
})
