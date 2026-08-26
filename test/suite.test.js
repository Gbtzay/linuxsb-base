/** 重型套件端到端：单文件加载全部模块 + 套件总览仪表盘 */
import { test } from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync, readdirSync } from 'node:fs'
import { JSDOM } from 'jsdom'

const suiteCode = readFileSync(new URL('../dist/linuxsb-suite.user.js', import.meta.url), 'utf8')
const baseCode = readFileSync(new URL('../dist/linuxsb-base.user.js', import.meta.url), 'utf8')
const topicHtml = readFileSync(new URL('./fixtures/topic1.html', import.meta.url), 'utf8')

import { ORDER as MEMBERS, SUITE_EXCLUDE } from '../suite/order.js'

function makeSuiteSite(preload = {}) {
  const dom = new JSDOM(topicHtml, { url: 'https://linux.sb/topic/1', runScripts: 'outside-only' })
  const w = dom.window
  w.unsafeWindow = w
  w.requestAnimationFrame = (fn) => setTimeout(() => fn(Date.now()), 0)
  // 万能静音 stub：任何请求都返回空 200，模块各自优雅降级
  w.fetch = async (url) => ({ status: 200, ok: true, url: String(url), text: async () => '' })
  w.localStorage.setItem('lsb_base:__core:rate', JSON.stringify(10))
  w.localStorage.setItem('lsb_base:__core:urlPoll', JSON.stringify(0))
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

test('单文件全家桶：一次注册全部成员 + 套件中心，全部激活', async () => {
  const { w } = makeSuiteSite()
  w.eval(baseCode)
  w.eval(suiteCode)
  await new Promise((r) => setTimeout(r, 60))

  const info = w.LSB.info()
  const byId = Object.fromEntries(info.plugins.map((p) => [p.id, p.state]))
  for (const id of MEMBERS) {
    assert.equal(byId[id], 'active', `${id} 应激活（实际 ${byId[id]}）`)
  }
  assert.equal(byId['suite'], 'active')

  // 各模块功能入口真实存在
  assert.equal(await w.LSB.bus.hasHandler('resume-reading:debug'), true)
  assert.equal(await w.LSB.bus.hasHandler('points-ledger:series'), true)
  assert.equal(await w.LSB.bus.hasHandler('unread-sentinel:debug'), true)
})

test('套件总览：卡片数量与状态正确，停用/启用即时反映', async () => {
  const { w, until } = makeSuiteSite()
  w.eval(baseCode)
  w.eval(suiteCode)

  w.LSB.disable('hover-profile')
  w.LSB.open('suite')
  await until(() => w.document.querySelectorAll('.lsb-suite-card').length === MEMBERS.length)

  const cards = [...w.document.querySelectorAll('.lsb-suite-card')]
  assert.equal(cards.length, MEMBERS.length)
  const profileCard = cards.find((c) => c.textContent.includes('用户画像'))
  assert.match(profileCard.textContent, /已停用/)
  assert.match(profileCard.querySelector('.lsb-btn').textContent, /启用/)
  assert.ok(
    cards.find((c) => c.textContent.includes('断点续读'))?.textContent.includes('运行中'),
  )

  // 启用恢复
  w.LSB.enable('hover-profile')
  await until(() => w.LSB.info().plugins.find((p) => p.id === 'hover-profile').state === 'active')
  w.LSB.open('suite')
  await until(() =>
    [...w.document.querySelectorAll('.lsb-suite-card')].some(
      (c) => c.textContent.includes('用户画像') && c.textContent.includes('运行中'),
    ),
  )
})

test('套件总览：关键指标聚合各模块 RPC（含停用降级为 —）', async () => {
  const { w, until } = makeSuiteSite()
  w.eval(baseCode)
  w.eval(suiteCode)


  w.LSB.open('suite')
  const ok = await until(() => {
    const t = w.document.querySelector('.lsb-view')?.textContent || ''
    return t.includes('关键指标') && !t.includes('汇总中')
  })
  assert.ok(ok, '指标渲染完成')

  const view = w.document.querySelector('.lsb-view').textContent
  assert.match(view, /阅读记录/)
  assert.match(view, /消息箱/)
  assert.doesNotMatch(view, /本地工作台/)

  // 停用 points-ledger 后其指标降级为 — 而不是报错
  w.LSB.disable('points-ledger')
  w.LSB.open('suite')
  await until(() => {
    const t = w.document.querySelector('.lsb-view')?.textContent || ''
    return t.includes('关键指标')
  })
  const rows = w.document.querySelector('.lsb-view').textContent
  assert.match(rows, /积分快照/)
})


/* ─────────── 收录与版本一致性（构建期校验的运行期复核） ─────────── */

test('套件收录完整：plugins/ 下每个模块都在 ORDER 里，且产物真的包含它们', () => {
  const dir = new URL('../plugins/', import.meta.url)
  const files = readdirSync(dir)
    .filter((f) => f.endsWith('.user.js'))
    .map((f) => f.replace(/\.user\.js$/, ''))

  const unregistered = files.filter((id) => !MEMBERS.includes(id) && !SUITE_EXCLUDE.includes(id))
  assert.deepEqual(unregistered, [], `未登记进 ORDER：${unregistered.join(', ')}`)

  const ghost = MEMBERS.filter((id) => !files.includes(id))
  assert.deepEqual(ghost, [], `ORDER 引用了不存在的文件：${ghost.join(', ')}`)

  // 产物里每个成员都有自己的段落分隔注释（构建器按 id 生成）
  for (const id of MEMBERS) {
    assert.ok(suiteCode.includes(`(${id})`), `${id} 未被打进 dist/linuxsb-suite.user.js`)
  }
  for (const id of SUITE_EXCLUDE) {
    assert.equal(suiteCode.includes(`(${id})`), false, `${id} 已豁免，不应打进套件`)
  }
})

test('版本号双处对齐：userscript 头部 @version === manifest.version', () => {
  const mismatches = []
  for (const id of MEMBERS) {
    const code = readFileSync(new URL(`../plugins/${id}.user.js`, import.meta.url), 'utf8')
    const header = code.match(/@version\s+([\d.]+)/)?.[1] || null
    const manifest = code.match(/\bversion:\s*'([\d][\w.\-+]*)'/)?.[1] || null
    if (!header || !manifest || header !== manifest) {
      mismatches.push(`${id}: @version=${header} manifest=${manifest}`)
    }
  }
  // banner 读头部、套件卡片读 manifest —— 漂移会让同一模块在两处显示不同版本
  assert.deepEqual(mismatches, [], `版本号不一致：\n  ${mismatches.join('\n  ')}`)
})

test('套件 banner 声明的版本与卡片实际展示的版本一致', async () => {
  const { w, until } = makeSuiteSite()
  w.eval(baseCode)
  w.eval(suiteCode)
  await until(() => w.LSB.info().plugins.length > MEMBERS.length - 1, 3000)

  const runtime = new Map(w.LSB.info().plugins.map((p) => [p.id, p.version]))
  for (const id of MEMBERS) {
    const code = readFileSync(new URL(`../plugins/${id}.user.js`, import.meta.url), 'utf8')
    const header = code.match(/@version\s+([\d.]+)/)?.[1]
    assert.equal(runtime.get(id), header, `${id} 运行期版本与 banner 声明不符`)
  }
})

test('源码卫生：插件文件无 BOM、统一 LF 行尾', () => {
  const offenders = []
  for (const id of MEMBERS) {
    const buf = readFileSync(new URL(`../plugins/${id}.user.js`, import.meta.url))
    if (buf[0] === 0xef && buf[1] === 0xbb && buf[2] === 0xbf) offenders.push(`${id}: 带 UTF-8 BOM`)
    if (buf.includes('\r\n')) offenders.push(`${id}: 含 CRLF 行尾`)
  }
  // BOM 会被拼进套件产物中段，破坏 userscript 头部解析；行尾混杂则让 diff 噪音化
  assert.deepEqual(offenders, [], offenders.join('; '))
})

test('产物可解析：两个 dist 产物都是合法 JS（拼接未破坏语法）', () => {
  // 套件是「多个源文件字符串拼接」而成，源文件的编码/BOM 问题只在这里暴露。
  // new Function 只做解析、不执行。
  for (const [label, code] of [
    ['dist/linuxsb-base.user.js', baseCode],
    ['dist/linuxsb-suite.user.js', suiteCode],
  ]) {
    assert.doesNotThrow(() => new Function(code), `${label} 语法有误`)
  }
})

test('Greasy Fork：套件产物只有一段油猴头（模块内嵌头已剥离）', () => {
  const n = [...suiteCode.matchAll(/\/\/ ==UserScript==/g)].length
  assert.equal(n, 1, `套件里有 ${n} 段 ==UserScript==，GF/管理器会误读内嵌 @match/@grant`)
})

test('Greasy Fork：氢/氧声明 license、作者、www 域', () => {
  assert.match(baseCode, /@license\s+MIT/)
  assert.match(suiteCode, /@license\s+MIT/)
  assert.match(baseCode, /@author\s+xB70sR71/)
  assert.match(suiteCode, /@author\s+xB70sR71/)
  assert.match(baseCode, /@match\s+https:\/\/www\.linux\.sb\/\*/)
  assert.match(suiteCode, /@match\s+https:\/\/www\.linux\.sb\/\*/)
  assert.doesNotMatch(baseCode, /@updateURL/)
  assert.doesNotMatch(suiteCode, /@updateURL/)
})

test('Greasy Fork：氢/氧对外名称与简介标明 RC', () => {
  assert.match(baseCode, /@name\s+LINUX\.SB 氢（RC）/)
  assert.match(suiteCode, /@name\s+LINUX\.SB 氧（RC）/)
  assert.match(baseCode, /@name:en\s+LINUX\.SB Hydrogen \(RC\)/)
  assert.match(suiteCode, /@name:en\s+LINUX\.SB Oxygen \(RC\)/)
  assert.match(baseCode, /@description\s+【RC】/)
  assert.match(suiteCode, /@description\s+【RC】/)
  assert.match(baseCode, /@description:en\s+\[RC\]/)
  assert.match(suiteCode, /@description:en\s+\[RC\]/)
  assert.doesNotMatch(baseCode, /（Beta）/)
  assert.doesNotMatch(suiteCode, /@name\s+LINUX\.SB 氧（Beta）/)
})
