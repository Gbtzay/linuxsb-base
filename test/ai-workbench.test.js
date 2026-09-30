import { test } from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { JSDOM } from 'jsdom'

const baseCode = readFileSync(new URL('../dist/linuxsb-base.user.js', import.meta.url), 'utf8')
const PLUG = (name) => readFileSync(new URL(`../plugins/${name}`, import.meta.url), 'utf8')
const topicHtml = readFileSync(new URL('./fixtures/topic1.html', import.meta.url), 'utf8')

function makeSite(width = 1200) {
  const dom = new JSDOM(topicHtml, { url: 'https://linux.sb/topic/1', runScripts: 'outside-only' })
  const w = dom.window
  w.unsafeWindow = w
  Object.defineProperty(w, 'innerWidth', { value: width, configurable: true })
  w.requestAnimationFrame = (fn) => setTimeout(() => fn(Date.now()), 1)
  w.localStorage.setItem('lsb_base:__core:rate', JSON.stringify(5))
  w.localStorage.setItem('lsb_base:__core:urlPoll', JSON.stringify(0))
  w.localStorage.setItem(
    'lsb_base:ai-summary:__config',
    JSON.stringify({ apiUrl: 'https://api.example.com/v1/chat/completions', apiKey: 'k', model: 'test-model' }),
  )
  w.localStorage.setItem(
    'lsb_base:ai-copilot:__config',
    JSON.stringify({ fetchAll: false, maxPages: 15, maxChars: 12000, sessionTurns: 6 }),
  )
  w.fetch = async (url) => ({
    status: 200,
    ok: true,
    url: String(url),
    text: async () => JSON.stringify({ choices: [{ message: { content: '回答' } }] }),
  })
  return w
}

async function load(w) {
  w.eval(baseCode)
  w.eval(PLUG('skin.user.js'))
  w.eval(PLUG('ai-summary.user.js'))
  w.eval(PLUG('ai-copilot.user.js'))
  w.eval(PLUG('ai-workbench.user.js'))
  await new Promise((resolve) => setTimeout(resolve, 100))
}

async function until(fn, ms = 2000) {
  const end = Date.now() + ms
  while (Date.now() < end) {
    if (fn()) return true
    await new Promise((resolve) => setTimeout(resolve, 15))
  }
  return Boolean(fn())
}

test('AI 工作台：右栏默认操作台，包含三段且可切换', async () => {
  const w = makeSite()
  await load(w)
  w.dispatchEvent(new w.Event('resize'))
  assert.equal(await until(() => w.document.querySelector('[data-lsb-shell-aside-tab="ai-workbench"]')), true)
  const workbench = w.document.querySelector('[data-ai-workbench]')
  assert.ok(workbench)
  assert.ok(workbench.querySelector('[data-ai-section="console"]'))
  assert.ok(workbench.querySelector('[data-ai-section="topic"]'))
  assert.ok(workbench.querySelector('[data-ai-section="tracking"]'))
  assert.equal(workbench.querySelector('[data-ai-section="console"]').hidden, false)
  assert.match(workbench.textContent, /受限计划|运行查询/)

  workbench.querySelector('[data-ai-section-tab="topic"]').click()
  assert.equal(workbench.querySelector('[data-ai-section="topic"]').hidden, false)
  assert.equal(workbench.querySelector('[data-ai-section="console"]').hidden, true)
  assert.match(workbench.textContent, /当前帖子|问答|讨论分析/)

  workbench.querySelector('[data-ai-section-tab="tracking"]').click()
  assert.equal(workbench.querySelector('[data-ai-section="tracking"]').hidden, false)
  assert.match(workbench.textContent, /追踪|活动追踪/)
})

test('AI 工作台：窄屏不注册右栏 AI 标签，保留旧入口能力', async () => {
  const w = makeSite(900)
  await load(w)
  w.dispatchEvent(new w.Event('resize'))
  assert.equal(w.document.querySelector('[data-lsb-shell-aside-tab="ai-workbench"]'), null)
  assert.ok(w.document.querySelector('a.lsb-ai-copilot-top'), '帖子页旧顶栏副驾入口仍存在')
})
