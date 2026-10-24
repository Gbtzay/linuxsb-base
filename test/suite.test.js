/** 重型套件端到端：单文件加载全部模块 + 套件总览仪表盘 */
import { afterEach, test } from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync, readdirSync } from 'node:fs'
import { JSDOM } from 'jsdom'

const suiteCode = readFileSync(new URL('../dist-dev/linuxsb-suite.user.js', import.meta.url), 'utf8')
const baseCode = readFileSync(new URL('../dist-dev/linuxsb-base.user.js', import.meta.url), 'utf8')
const releaseSuiteCode = readFileSync(new URL('../dist/linuxsb-suite.user.js', import.meta.url), 'utf8')
const releaseBaseCode = readFileSync(new URL('../dist/linuxsb-base.user.js', import.meta.url), 'utf8')
const ltsCode = readFileSync(new URL('../dist/linuxsb-lts.user.js', import.meta.url), 'utf8')
const topicHtml = readFileSync(new URL('./fixtures/topic1.html', import.meta.url), 'utf8')

import { ORDER as MEMBERS, ORDER_LTS, SUITE_EXCLUDE } from '../suite/order.js'
import { SUITE_VERSION } from '../suite/version.js'
import { applyPluginBuildProfile } from '../scripts/build-profile.mjs'

const configuredSuiteVersion = SUITE_VERSION

const activeDoms = new Set()
afterEach(() => {
  for (const dom of activeDoms) {
    try { dom.window.LSB?.shutdown() } catch { /* best-effort teardown */ }
    dom.window.close()
    activeDoms.delete(dom)
  }
})

function makeSuiteSite(preload = {}) {
  const dom = new JSDOM(topicHtml, { url: 'https://linux.sb/topic/1', runScripts: 'outside-only' })
  activeDoms.add(dom)
  const w = dom.window
  w.unsafeWindow = w
  w.requestAnimationFrame = (fn) => w.setTimeout(() => fn(Date.now()), 0)
  w.cancelAnimationFrame = (timer) => w.clearTimeout(timer)
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

test('已下架的用户画像悬浮卡不会注册到 Oxygen', async () => {
  const { w, tick } = makeSuiteSite()
  w.eval(baseCode)
  w.eval(suiteCode)
  await tick(60)

  for (const bundle of [suiteCode, releaseSuiteCode, ltsCode]) {
    assert.doesNotMatch(bundle, /id:\s*'hover-profile'/)
  }

  const plugins = w.LSB.info().plugins
  assert.equal(plugins.some((plugin) => plugin.id === 'hover-profile'), false)
  assert.equal(await w.LSB.bus.hasHandler('hover-profile:debug'), false)

  const link = w.document.querySelector('a[href^="/user/"]')
  assert.ok(link, '夹具包含用户链接')
  link.dispatchEvent(new w.MouseEvent('mouseenter'))
  await tick(40)
  assert.equal(w.document.querySelector('.lsb-hover-card'), null)
})

test('套件总览：卡片数量与状态正确，停用/启用即时反映', async () => {
  const { w, until } = makeSuiteSite()
  w.eval(baseCode)
  w.eval(suiteCode)

  w.LSB.disable('resume-reading')
  w.LSB.open('suite')
  await until(() => w.document.querySelectorAll('.lsb-suite-card').length === MEMBERS.length)

  const cards = [...w.document.querySelectorAll('.lsb-suite-card')]
  assert.equal(cards.length, MEMBERS.length)
  const resumeCard = cards.find((c) => c.textContent.includes('断点续读'))
  assert.match(resumeCard.textContent, /已停用/)
  assert.match(resumeCard.querySelector('.lsb-btn').textContent, /启用/)
  assert.ok(cards.find((c) => c.textContent.includes('已读置灰'))?.textContent.includes('运行中'))

  // 启用恢复
  w.LSB.enable('resume-reading')
  await until(() => w.LSB.info().plugins.find((p) => p.id === 'resume-reading').state === 'active')
  w.LSB.open('suite')
  await until(() =>
    [...w.document.querySelectorAll('.lsb-suite-card')].some(
      (c) => c.textContent.includes('断点续读') && c.textContent.includes('运行中'),
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
  assert.match(view, /机会命中/)
  assert.match(view, /卡顿记录/)
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

test('称号行情、UR 规划和积分-称号工作台只进入 Oxygen', () => {
  const quoteIndex = MEMBERS.indexOf('title-quotes')
  const plannerIndex = MEMBERS.indexOf('title-forge-planner')
  const workbenchIndex = MEMBERS.indexOf('points-title-workbench')
  assert.equal(MEMBERS[quoteIndex + 1], 'title-forge-planner')
  assert.equal(MEMBERS[plannerIndex + 1], 'points-title-workbench')
  assert.equal(ORDER_LTS.includes('title-quotes'), false)
  assert.equal(ORDER_LTS.includes('title-forge-planner'), false)
  assert.equal(ORDER_LTS.includes('points-title-workbench'), false)
  const planner = readFileSync(new URL('../plugins/title-forge-planner.user.js', import.meta.url), 'utf8')
  const workbench = readFileSync(new URL('../plugins/points-title-workbench.user.js', import.meta.url), 'utf8')
  const quotes = readFileSync(new URL('../plugins/title-quotes.user.js', import.meta.url), 'utf8')
  assert.match(planner, /@version\s+0\.1\.0/)
  assert.match(planner, /version:\s*'0\.1\.0'/)
  assert.match(planner, /'title-quotes':\s*'\^1\.0\.19'/)
  assert.doesNotMatch(planner, /api\.ui\.tab\(/)
  assert.match(workbench, /id:\s*'points-title-workbench'/)
  assert.match(workbench, /version:\s*'0\.1\.0'/)
  assert.match(workbench, /points-title-workbench:open/)
  assert.match(quotes, /title-quotes:market-data/)
  assert.doesNotMatch(quotes, /title-quotes:open/)
  assert.doesNotMatch(ltsCode, /id:\s*'(?:title-quotes|title-forge-planner|points-title-workbench)'/)
  const centerVersion = readFileSync(new URL('../suite/suite-center.js', import.meta.url), 'utf8')
    .match(/version:\s*'([\d.]+)'/)?.[1]
  assert.ok(configuredSuiteVersion, 'build-suite.mjs must declare a suite version')
  assert.equal(centerVersion, configuredSuiteVersion)
  assert.equal(releaseSuiteCode.match(/@version\s+([\d.]+)/)?.[1], configuredSuiteVersion)
  assert.equal(suiteCode.match(/@version\s+([\d.]+)/)?.[1], configuredSuiteVersion)
  assert.equal(ltsCode.match(/@version\s+([\d.]+)/)?.[1], configuredSuiteVersion)
})

test('AI 副驾登记在 AI 总结之后，且不进入 LTS', () => {
  const summaryIndex = MEMBERS.indexOf('ai-summary')
  assert.equal(MEMBERS[summaryIndex + 1], 'ai-copilot')
  assert.equal(ORDER_LTS.includes('ai-copilot'), false)
  const code = readFileSync(new URL('../plugins/ai-copilot.user.js', import.meta.url), 'utf8')
  assert.match(code, /@version\s+0\.11\.0/)
  assert.match(code, /\bversion:\s*'0\.11\.0'/)
  assert.match(code, /base:\s*'\^0\.1\.52'/)
  assert.match(code, /'ai-summary':\s*'\^1\.4\.0'/)
  assert.match(code, /const ANALYSIS_VERSION\s*=\s*'2'/)
  assert.match(code, /const TRACKING_VERSION\s*=\s*'2'/)
  assert.match(code, /\bid:\s*'ai-copilot'/)
})

test('AI 动作提供方位于副驾之后、工作台之前且不进入 LTS', () => {
  const copilot = MEMBERS.indexOf('ai-copilot')
  assert.equal(MEMBERS[copilot + 1], 'ai-actions')
  assert.equal(MEMBERS[copilot + 3], 'ai-workbench')
  assert.equal(ORDER_LTS.includes('ai-actions'), false)
  assert.equal(ORDER_LTS.includes('ai-workbench'), false)
  const source = readFileSync(new URL('../plugins/ai-actions.user.js', import.meta.url), 'utf8')
  assert.match(source, /id:\s*'ai-actions'/)
  assert.match(source, /@version\s+0\.1\.1/)
  assert.match(source, /version:\s*'0\.1\.1'/)
  assert.doesNotMatch(ltsCode, /id:\s*'ai-actions'/)
})

test('AI 写动作插件只进入 Oxygen，且仅申请站内写入权限', () => {
  const writeIndex = MEMBERS.indexOf('ai-write-actions')
  const workbenchIndex = MEMBERS.indexOf('ai-workbench')
  assert.ok(writeIndex >= 0 && writeIndex < workbenchIndex)
  assert.equal(ORDER_LTS.includes('ai-write-actions'), false)
  const source = readFileSync(new URL('../plugins/ai-write-actions.user.js', import.meta.url), 'utf8')
  assert.match(source, /id:\s*'ai-write-actions'/)
  assert.match(source, /@version\s+0\.1\.4/)
  assert.match(source, /version:\s*'0\.1\.4'/)
  assert.match(source, /base:\s*'\^0\.1\.49'/)
  assert.match(source, /permissions:\s*\['read',\s*'write',\s*'ui',\s*'events'\]/)
  assert.doesNotMatch(source, /permissions:\s*\[[^\]]*\b(?:net|admin)\b/)
  assert.match(suiteCode, /\(ai-write-actions\)/)
  assert.doesNotMatch(ltsCode, /id:\s*'ai-write-actions'/)
})

test('AI 工作台登记在 AI 副驾之后且不进入 LTS', () => {
  const copilotIndex = MEMBERS.indexOf('ai-copilot')
  assert.equal(MEMBERS[copilotIndex + 3], 'ai-workbench')
  assert.equal(ORDER_LTS.includes('ai-workbench'), false)
  const source = readFileSync(new URL('../plugins/ai-workbench.user.js', import.meta.url), 'utf8')
  assert.match(source, /@version\s+0\.8\.1/)
  assert.match(source, /version:\s*'0\.8\.1'/)
  assert.match(source, /base:\s*'\^0\.1\.52'/)
  assert.match(source, /plugins:\s*\{\s*'ai-copilot':\s*'\^0\.11\.0'/)
  assert.match(source, /data-ai-chat-messages/)
  assert.match(source, /\bid:\s*'ai-workbench'/)
  assert.match(suiteCode, /\(ai-workbench\)/)
  assert.match(suiteCode, /data-ai-chat-messages/)
  assert.doesNotMatch(ltsCode, /id:\s*'ai-workbench'/)
  assert.doesNotMatch(ltsCode, /id:\s*'ai-copilot'/)
})

test('动作代理版本与基座及工作台版本对齐', () => {
  assert.match(readFileSync(new URL('../src/core/core-version.js', import.meta.url), 'utf8'), /VERSION = '0\.2\.5'/)
  assert.match(readFileSync(new URL('../package.json', import.meta.url), 'utf8'), /"version": "0\.2\.5"/)
  assert.match(readFileSync(new URL('../package-lock.json', import.meta.url), 'utf8'), /"version": "0\.2\.5"/)
  assert.match(readFileSync(new URL('../plugins/ai-summary.user.js', import.meta.url), 'utf8'), /@version\s+1\.4\.0/)
  assert.match(readFileSync(new URL('../plugins/ai-summary.user.js', import.meta.url), 'utf8'), /version:\s*'1\.4\.0'/)
  assert.match(readFileSync(new URL('../plugins/ai-summary.user.js', import.meta.url), 'utf8'), /base:\s*'\^0\.1\.53'/)
  assert.match(readFileSync(new URL('../plugins/ai-copilot.user.js', import.meta.url), 'utf8'), /@version\s+0\.11\.0/)
  assert.match(readFileSync(new URL('../plugins/ai-copilot.user.js', import.meta.url), 'utf8'), /version:\s*'0\.11\.0'/)
  assert.match(readFileSync(new URL('../plugins/ai-workbench.user.js', import.meta.url), 'utf8'), /@version\s+0\.8\.1/)
  assert.match(readFileSync(new URL('../plugins/ai-workbench.user.js', import.meta.url), 'utf8'), /version:\s*'0\.8\.1'/)
  assert.match(readFileSync(new URL('../plugins/ai-write-actions.user.js', import.meta.url), 'utf8'), /@version\s+0\.1\.4/)
  assert.match(readFileSync(new URL('../plugins/ai-write-actions.user.js', import.meta.url), 'utf8'), /version:\s*'0\.1\.4'/)
})

test('M11 trace 分发边界：基座提供 trace API，LTS 不含 AI 插件正文', () => {
  assert.match(baseCode, /TRACE_STAGES/)
  assert.match(baseCode, /trace:\s*\{/)
  assert.match(baseCode, /ai:trace/)
  for (const id of ['ai-summary', 'ai-copilot', 'ai-actions', 'ai-write-actions', 'ai-workbench']) {
    assert.doesNotMatch(ltsCode, new RegExp(`id: '${id}'`))
  }
  assert.doesNotMatch(ltsCode, /data-ai-(?:summary|copilot|workbench|research)-(?:chat|messages|composer|result|research)/)
})

test('跨主题研究只进 Oxygen：候选界面与引用适配存在，LTS 不含研究支持', () => {
  assert.match(suiteCode, /data-ai-research-candidates/)
  assert.match(suiteCode, /data-ai-research-read/)
  assert.match(suiteCode, /conversationCitationHref\s*\(/)
  assert.match(suiteCode, /loadResearchCandidates\s*\(/)
  assert.doesNotMatch(ltsCode, /id:\s*'ai-(?:workbench|copilot)'/)
  assert.doesNotMatch(ltsCode, /RESEARCH_PLAN_VERSION|researchSessions|data-ai-research-/)
})

test('产物新鲜度：每个插件正文都来自当前源码', () => {
  for (const id of MEMBERS) {
    const source = readFileSync(new URL(`../plugins/${id}.user.js`, import.meta.url), 'utf8')
    const header = source.match(/^\/\/ ==UserScript==\r?\n[\s\S]*?\/\/ ==\/UserScript==\r?\n*/)
    assert.ok(header, `${id} 源码缺少 userscript 头`)
    const body = applyPluginBuildProfile(id, source.slice(header[0].length), 'dev').trim()
    assert.ok(suiteCode.includes(body), `${id} 的当前源码正文未进入开发 Oxygen 产物`)
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
  const suiteVersion = suiteCode.match(/@version\s+([\d.]+)/)?.[1]
  assert.equal(runtime.get('suite'), suiteVersion, '套件中心版本与氧 banner 声明不符')
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

test('产物可解析：正式版、开发版与 LTS 都是合法 JavaScript', () => {
  for (const [label, code] of [
    ['dist/linuxsb-base.user.js', releaseBaseCode],
    ['dist/linuxsb-suite.user.js', releaseSuiteCode],
    ['dist/linuxsb-lts.user.js', ltsCode],
    ['dist-dev/linuxsb-base.user.js', baseCode],
    ['dist-dev/linuxsb-suite.user.js', suiteCode],
  ]) {
    assert.doesNotThrow(() => new Function(code), `${label} 语法有误`)
  }
})

test('Greasy Fork：套件产物只有一段油猴头（模块内嵌头已剥离）', () => {
  const n = [...suiteCode.matchAll(/\/\/ ==UserScript==/g)].length
  assert.equal(n, 1, `套件里有 ${n} 段 ==UserScript==，GF/管理器会误读内嵌 @match/@grant`)
})

test('Greasy Fork：正式版氢/氧声明 license、作者、www 域', () => {
  assert.match(releaseBaseCode, /@license\s+MIT/)
  assert.match(releaseSuiteCode, /@license\s+MIT/)
  assert.match(releaseBaseCode, /@author\s+xB70sR71/)
  assert.match(releaseSuiteCode, /@author\s+xB70sR71/)
  assert.match(releaseBaseCode, /@match\s+https:\/\/www\.linux\.sb\/\*/)
  assert.match(releaseSuiteCode, /@match\s+https:\/\/www\.linux\.sb\/\*/)
  assert.doesNotMatch(releaseBaseCode, /@updateURL/)
  assert.doesNotMatch(releaseSuiteCode, /@updateURL/)
})

test('Greasy Fork：正式版对外名称与简介不带 RC，开发版带标记', () => {
  assert.match(releaseBaseCode, /@name\s+LINUX\.SB 氢\s*$/m)
  assert.match(releaseSuiteCode, /@name\s+LINUX\.SB 氧\s*$/m)
  assert.match(releaseBaseCode, /@name:en\s+LINUX\.SB Hydrogen\s*$/m)
  assert.match(releaseSuiteCode, /@name:en\s+LINUX\.SB Oxygen\s*$/m)
  assert.match(releaseBaseCode, /@version\s+0\.2\.5/)
  assert.equal(releaseSuiteCode.match(/@version\s+([\d.]+)/)?.[1], configuredSuiteVersion)
  assert.match(releaseBaseCode, /@description\s+linux\.sb 脚本基座/)
  assert.match(releaseSuiteCode, /@description\s+linux\.sb 正式功能套件/)
  assert.match(baseCode, /@name\s+LINUX\.SB 氢（开发版）/)
  assert.match(suiteCode, /@name\s+LINUX\.SB 氧（开发版）/)
  for (const source of [releaseBaseCode, releaseSuiteCode, baseCode, suiteCode]) {
    assert.doesNotMatch(source, /【RC】|（RC）|Hydrogen \(RC\)|Oxygen \(RC\)/)
  }
})

const LTS_COLLISION =
  '请先在油猴里关掉或卸掉「LINUX.SB 氢」和「LINUX.SB 氧」，只留 LINUX.SB（LTS）。'

test('Greasy Fork：LTS 产物一段头、document-start、含氢 grant、不含 local-bridge', () => {
  assert.equal([...ltsCode.matchAll(/\/\/ ==UserScript==/g)].length, 1)
  assert.match(ltsCode, /@name\s+LINUX\.SB（LTS）/)
  assert.match(ltsCode, /@name:en\s+LINUX\.SB \(LTS\)/)
  assert.equal(ltsCode.match(/@version\s+([\d.]+)/)?.[1], configuredSuiteVersion)
  assert.match(ltsCode, /冻新功能/)
  assert.doesNotMatch(ltsCode, /氢（RC）/)
  assert.doesNotMatch(ltsCode, /【RC】/)
  assert.match(ltsCode, /@run-at\s+document-start/)
  assert.match(ltsCode, /@grant\s+unsafeWindow/)
  assert.match(ltsCode, /@grant\s+GM_xmlhttpRequest/)
  assert.doesNotMatch(ltsCode, /@updateURL/)
  assert.match(ltsCode, /id: 'skin'/)
  assert.match(ltsCode, /id: 'live-feed'/)
  for (const id of ['local-bridge', 'title-quotes', 'forum-watch', 'ai-summary', 'ai-actions', 'ai-workbench', 'my-archive', 'hot-floor-badge', 'perf-probe', 'topic-marks']) {
    assert.doesNotMatch(ltsCode, new RegExp(`id: '${id}'`))
  }
  assert.match(ltsCode, /__LSB_CHANNEL__\s*=\s*'lts'/)
  assert.match(ltsCode, new RegExp(LTS_COLLISION.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')))
})

test('产物可解析：LTS 也是合法 JS', () => {
  assert.doesNotThrow(() => new Function(ltsCode))
})
