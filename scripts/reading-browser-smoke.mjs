#!/usr/bin/env node
import assert from 'node:assert/strict'
import { mkdirSync, readFileSync, writeFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { JSDOM } from 'jsdom'
import { chromium } from 'playwright'
import { applyPluginBuildProfile } from './build-profile.mjs'

const source = (path) => readFileSync(new URL(path, import.meta.url), 'utf8')
const base = source('../dist/linuxsb-base.user.js')
const skin = applyPluginBuildProfile('skin', source('../plugins/skin.user.js'), 'release')
const feed = source('../plugins/live-feed.user.js')
const resume = source('../plugins/resume-reading.user.js')
const center = source('../plugins/reading-center.user.js')
const output = resolve(process.env.READING_SCREEN_DIR || 'artifacts/reading-acceptance')
mkdirSync(output, { recursive: true })

function fixture(name, path) {
  const dom = new JSDOM(source(`../test/fixtures/${name}.html`))
  const doc = dom.window.document
  // All requests are fulfilled below. Native site scripts are excluded so this
  // suite measures the userscripts against a deterministic captured document.
  doc.querySelectorAll('script, link[rel="stylesheet"], link[rel="canonical"]').forEach((node) => node.remove())
  const canonical = doc.createElement('link')
  canonical.rel = 'canonical'
  canonical.href = `https://linux.sb${path}`
  doc.head.append(canonical)
  if (name === 'home') {
    const list = doc.querySelector('.main-panel > ul.post-list')
    list.children[2].insertAdjacentHTML('beforebegin', '<li class="post-item"><div class="post-body">' +
      '<a class="post-title" data-reading-link="1" href="/topic/1">阅读验收一</a> · ' +
      '<a data-reading-link="2" href="/topic/2">阅读验收二</a></div></li>')
    const pagination = doc.querySelector('.pagination-bar')
    pagination.classList.remove('sb-infinite-scroll-pagination-hidden')
    pagination.innerHTML = '<a href="/?p=2">下一页</a>'
  } else {
    doc.querySelector('.post-content-title').textContent = `阅读验收主题 ${path.endsWith('/2') ? '2' : '1'}`
  }
  const style = doc.createElement('style')
  style.textContent = `
    *,*::before,*::after{box-sizing:border-box} html,body{margin:0}
    body{font:14px/1.6 system-ui,sans-serif}a{color:inherit}
    svg{width:1em;height:1em}img{max-width:100%}
    .wrap{max-width:1200px;margin:auto;padding:12px}
    .home-shell{background:white;padding:24px;border-radius:12px}
    .forum-layout{display:flex;gap:12px;align-items:flex-start}
    .forum-main{flex:1;min-width:0}.main-panel{background:white;overflow:hidden}
    .sidebar{width:230px}ul.post-list{padding:0;list-style:none}
    li.post-item{min-height:88px;padding:12px;border-bottom:1px solid #ddd}
    li.post-entry{min-height:120px}textarea{display:block;width:100%;min-height:100px}
    @media(max-width:700px){.forum-layout{display:block}.sidebar{width:100%}}
  `
  doc.head.append(style)
  const html = dom.serialize()
  dom.window.close()
  return html
}

const home = fixture('home', '/')
const topic = fixture('topic1', '/topic/1')
const topic2 = fixture('topic1', '/topic/2').replaceAll('/topic/1', '/topic/2')
function appendRow(html, selector, row) {
  const dom = new JSDOM(html)
  dom.window.document.querySelector(selector).insertAdjacentHTML('beforeend', row)
  const result = dom.serialize()
  dom.window.close()
  return result
}
const freshTopic = appendRow(topic, 'ul.topic-post-list',
  '<li class="post-entry" id="post-999991" data-floor="401"><div class="post-content">浏览器新回复</div></li>')
const page2 = appendRow(home, 'ul.post-list',
  '<li class="post-item"><a class="post-title" href="/topic/999992">浏览器第二页</a></li>')
  .replace('<a href="/?p=2">下一页</a>', '<span>最后一页</span>')

const browser = await chromium.launch({ headless: true })
const results = []
let completed = false

async function scenario(label, options, run) {
  const context = await browser.newContext(options)
  context.setDefaultTimeout(8000)
  await context.tracing.start({ screenshots: true, snapshots: true, sources: true })
  const state = { fresh: false, hold: false, held: [], reads: new Map(), writes: [], errors: [] }
  context.on('page', (page) => page.on('pageerror', (error) => state.errors.push(error.message)))
  await context.route('**/*', async (route) => {
    const request = route.request()
    const url = new URL(request.url())
    if (request.method() !== 'GET') {
      state.writes.push(`${request.method()} ${url.pathname}`)
      await route.abort()
      return
    }
    if (url.origin !== 'https://linux.sb') { await route.abort(); return }
    if (['/', '/index.php', '/topic/1', '/topic/2'].includes(url.pathname)) {
      const page = request.frame().page()
      state.reads.set(page, (state.reads.get(page) || 0) + 1)
      const body = url.pathname === '/topic/2' ? topic2
        : url.pathname === '/topic/1' ? (state.fresh ? freshTopic : topic)
        : url.searchParams.get('p') === '2' ? page2 : home
      if (state.hold && url.pathname === '/topic/1') {
        state.held.push(async () => {
          try { await route.fulfill({ status: 200, contentType: 'text/html', body }) }
          catch { /* The replacement navigation may already have aborted it. */ }
        })
        return
      }
      await route.fulfill({ status: 200, contentType: 'text/html', body })
    } else if (/\.(png|jpe?g|gif|webp|svg)$/i.test(url.pathname)) {
      await route.fulfill({ contentType: 'image/svg+xml', body: '<svg xmlns="http://www.w3.org/2000/svg" width="1" height="1"/>' })
    } else {
      await route.fulfill({ status: 200, body: '' })
    }
  })
  try {
    await run(context, state)
    assert.deepEqual(state.writes, [], `${label}: reading must not issue writes`)
    assert.deepEqual(state.errors, [], `${label}: unexpected browser exceptions`)
    results.push({ scenario: label, passed: true })
    console.log(`✔ ${label}`)
    await context.tracing.stop()
  } catch (error) {
    results.push({ scenario: label, passed: false, error: String(error) })
    for (const [index, page] of context.pages().entries()) {
      await page.screenshot({ path: resolve(output, `${label}-${index}.png`), fullPage: true }).catch(() => {})
    }
    await context.tracing.stop({ path: resolve(output, `${label}-trace.zip`) })
    throw error
  } finally {
    for (const release of state.held.splice(0)) await release()
    await context.close()
  }
}

async function boot(context, uiMode, path = '/', polling = false) {
  const page = await context.newPage()
  await page.goto(`https://linux.sb${path}`, { waitUntil: 'domcontentloaded' })
  await page.evaluate(({ uiMode, polling }) => {
    localStorage.setItem('lsb_base:skin:__config', JSON.stringify({ uiMode, topicSpa: true }))
    localStorage.setItem('lsb_base:skin:topicSpaNewWorldDefaultMigrationV1', 'true')
    localStorage.setItem('lsb_base:__core:rate', '10')
    localStorage.setItem('lsb_base:__core:urlPoll', '0')
    localStorage.setItem('lsb_base:live-feed:__config', JSON.stringify({
      jitterMs: 40, pollSec: polling ? 1 : 300, bgSec: polling ? 1 : 300,
      autoInsert: true, pauseWhileTyping: true,
    }))
    window.readingNative = {
      main: document.querySelector('main.wrap'),
      search: document.querySelector('form.search-form'),
      searchParent: document.querySelector('form.search-form')?.parentNode,
      first: document.querySelector('li.post-item'),
      scrollTo: window.scrollTo,
    }
  }, { uiMode, polling })
  await page.addScriptTag({ content: base })
  await page.addScriptTag({ content: skin })
  if (uiMode === 'ios27' || (page.viewportSize()?.width || 0) >= 1100) {
    await page.locator('#lsb-shell').waitFor({ state: 'attached' })
  }
  await page.waitForFunction(() => window.LSB?.info().plugins.some((p) => p.id === 'skin' && p.state === 'active'))
  return page
}

async function settled(page, path) {
  await page.waitForFunction((expected) => location.pathname === expected
    && !document.documentElement.hasAttribute('data-lsb-route-phase')
    && !document.documentElement.classList.contains('lsb-canvas-route-pending')
    && !document.querySelector('main.wrap')?.hasAttribute('aria-busy'), path)
}

async function swipe(page) {
  const session = await page.context().newCDPSession(page)
  await session.send('Input.dispatchTouchEvent', { type: 'touchStart', touchPoints: [{ x: 180, y: 650 }] })
  for (const y of [560, 450, 340, 220]) {
    await session.send('Input.dispatchTouchEvent', { type: 'touchMove', touchPoints: [{ x: 180, y }] })
    await page.waitForTimeout(40)
  }
  await session.send('Input.dispatchTouchEvent', { type: 'touchEnd', touchPoints: [] })
  await session.detach()
}

try {
  for (const uiMode of ['legacy', 'ios27']) {
    for (const touch of [false, true]) {
      const label = `${uiMode}-reading-center-${touch ? 'touch' : 'desktop'}`
      await scenario(label, { viewport: touch ? { width: 390, height: 844 } : { width: 1440, height: 1000 },
        ...(touch ? { hasTouch: true, isMobile: true } : {}) }, async (context, state) => {
        const page = await boot(context, uiMode)
        await page.evaluate(() => {
          localStorage.setItem('lsb_base:resume-reading:positions', JSON.stringify({
            1: { f: 18, p: 2, title: '阅读验收主题 1', ts: Date.now() },
            2: { f: 5, p: 1, title: '另一篇稍后阅读', ts: Date.now() - 1000 },
          }))
        })
        await page.addScriptTag({ content: resume })
        await page.addScriptTag({ content: center })
        const activate = async (locator) => touch ? locator.tap() : locator.click()
        const open = async () => {
          if (uiMode === 'ios27') {
            await activate(page.getByRole('button', { name: touch ? '更多工具' : '打开工具', exact: true }))
            await activate(page.locator('[data-tool-action="plugin-features-sheet"]'))
            await activate(page.locator('[data-plugin-feature-action="reading-center"]'))
          } else if (touch) {
            await activate(page.locator('.lsb-launcher'))
            await activate(page.locator('.lsb-tab').filter({ hasText: /^阅读中心$/ }))
          } else await activate(page.locator('[data-lsb-rpc="reading-center:open"]'))
          await page.locator('[data-reading-center][data-ready="true"]').waitFor()
        }
        const before = state.reads.get(page)
        await open()
        const view = page.locator('[data-reading-center]')
        assert.equal(await view.locator('[data-reading-topic="1"] a').first().getAttribute('href'), '/topic/1?p=2&floor=18')
        await activate(view.locator('[data-reading-topic="1"] [data-reading-save]'))
        await activate(view.locator('[data-reading-tab="later"]'))
        await view.locator('input[type="search"]').fill('阅读验收')
        assert.equal(await view.locator('[data-reading-topic]').count(), 1)
        assert.equal(state.reads.get(page), before, 'opening/searching/saving must not fetch site pages')
        assert.equal(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth + 1
          && document.querySelector('[data-reading-center]').scrollWidth <= document.querySelector('[data-reading-center]').clientWidth + 1), true)
        if (touch) assert.ok(await view.evaluate((node) => node.clientWidth >= 300), 'touch reading content needs the panel width')
        await page.screenshot({ path: resolve(output, `${label}.png`) })
        await activate(view.locator('[data-reading-topic="1"] .lsb-reading-actions a'))
        await settled(page, '/topic/1')
        await page.waitForFunction(() => {
          const target = document.querySelector('li.post-entry[data-floor="18"]')
          const rect = target?.getBoundingClientRect()
          return rect && rect.top < innerHeight && rect.bottom > 0
        })
        assert.equal(new URL(page.url()).search, '?p=2&floor=18')
        assert.equal(await view.count(), 0, 'continue reading dismisses the panel')
        assert.equal(await page.locator('[data-reading-toggle="1"]').getAttribute('aria-pressed'), 'true')
        await page.goBack()
        await settled(page, '/')
        await open()
        await activate(view.locator('[data-reading-tab="later"]'))
        assert.equal(await view.locator('[data-reading-topic="1"]').count(), 1)
        await activate(view.locator('[data-reading-topic="1"] [data-reading-remove]'))
        assert.equal(await view.locator('[data-reading-topic]').count(), 0)
        await page.evaluate(() => LSB.disable('reading-center'))
        assert.equal(await page.locator('[data-reading-center], [data-reading-toggle]').count(), 0)
      })
    }
    await scenario(`${uiMode}-desktop`, { viewport: { width: 1440, height: 1000 } }, async (context, state) => {
      const page = await boot(context, uiMode)
      const panel = page.locator('.home-shell .main-panel')
      // No synthetic route event: initial mounting alone must enable scrolling.
      const box = await panel.boundingBox()
      await page.mouse.move(box.x + box.width / 2, box.y + Math.min(box.height / 2, 400))
      await page.mouse.wheel(0, 20000)
      await page.locator('a[href="/topic/999992"]').waitFor({ state: 'attached' })
      await page.locator('[data-reading-link="1"]').scrollIntoViewIfNeeded()
      await page.evaluate(() => {
        window.readingHomeScroll = window.scrollY
        window.readingShell = document.querySelector('#lsb-shell')
      })
      await page.locator('[data-reading-link="1"]').click()
      await settled(page, '/topic/1')
      assert.equal(await page.evaluate(() => document.querySelector('#lsb-shell') === readingShell), true)
      await page.addScriptTag({ content: feed })
      await page.evaluate(async () => { window.readingFeed = await LSB.bus.request('live-feed:debug'); await readingFeed.pollOnce() })
      const editor = page.locator('form.ajax-reply-form textarea')
      await editor.fill('保留中文输入草稿🙂')
      await editor.evaluate((el) => { window.readingEditor = el; el.setSelectionRange(2, 6); window.readingInputScroll = scrollY })
      state.fresh = true
      await page.evaluate(() => readingFeed.pollOnce())
      assert.equal(await page.locator('#post-999991').count(), 0)
      assert.deepEqual(await editor.evaluate((el) => ({ focused: document.activeElement === el, value: el.value, start: el.selectionStart, end: el.selectionEnd })),
        { focused: true, value: '保留中文输入草稿🙂', start: 2, end: 6 })
      assert.ok(await page.evaluate(() => Math.abs(scrollY - readingInputScroll) <= 2), 'reply notification must not scroll the editor')
      await editor.fill('')
      await page.locator('.post-content-title').click()
      await page.locator('#post-999991').waitFor({ state: 'attached' })
      await page.evaluate(() => readingFeed.pollOnce())
      assert.equal(await page.locator('#post-999991').count(), 1)
      await page.evaluate(() => LSB.disable('live-feed'))
      await page.goBack()
      await settled(page, '/')
      assert.equal(await page.evaluate(() => document.querySelector('li.post-item') === readingNative.first), true)
      assert.ok(await page.evaluate(() => Math.abs(scrollY - readingHomeScroll) <= 2), 'history restores the actual home scroll root')

      // Hold the first navigation, commit the second, then let the old transport finish.
      state.hold = true
      await page.locator('[data-reading-link="1"]').click()
      await page.waitForFunction(() => document.documentElement.classList.contains('lsb-canvas-route-pending'))
      await page.locator('[data-reading-link="2"]').click()
      await settled(page, '/topic/2')
      assert.ok(state.held.length, 'first response really remained in flight')
      for (const release of state.held.splice(0)) await release()
      assert.match(await page.locator('.post-content-title').textContent(), /主题 2/)
      await page.goBack()
      await settled(page, '/')
      await page.locator('[data-reading-link="1"]').click()
      await page.waitForFunction(() => document.documentElement.classList.contains('lsb-canvas-route-pending'))
      await page.evaluate(() => LSB.disable('skin'))
      for (const release of state.held.splice(0)) await release()
      await page.waitForTimeout(100)
      assert.equal(await page.locator('#lsb-shell').count(), 0)
      assert.equal(new URL(page.url()).pathname, '/')
      assert.equal(await page.evaluate(() => readingNative.first.isConnected
        && readingNative.search.parentNode === readingNative.searchParent
        && window.scrollTo === readingNative.scrollTo
        && !document.documentElement.hasAttribute('data-lsb-route-phase')), true)
    })

    await scenario(`${uiMode}-touch`, { viewport: { width: 390, height: 844 }, hasTouch: true, isMobile: true }, async (context) => {
      const page = await boot(context, uiMode)
      assert.equal(await page.evaluate(() => navigator.maxTouchPoints > 0), true)
      if (uiMode === 'legacy') assert.equal(await page.locator('#lsb-shell').count(), 0, 'narrow legacy retains native flow')
      await swipe(page)
      await page.waitForFunction(() => scrollY > 100)
      assert.equal(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth + 1), true)
      await page.locator('[data-reading-link="1"]').tap()
      await settled(page, '/topic/1')
      await page.locator('form.ajax-reply-form textarea').fill('触屏草稿')
      assert.equal(await page.locator('form.ajax-reply-form textarea').inputValue(), '触屏草稿')
      await page.locator('form.ajax-reply-form textarea').fill('')
      await page.goBack()
      await settled(page, '/')
      assert.equal(await page.evaluate(() => readingNative.first.isConnected), true)
      await page.screenshot({ path: resolve(output, `${uiMode}-touch.png`) })
    })
  }

  await scenario('shared-context-tabs', { viewport: { width: 1440, height: 1000 } }, async (context, state) => {
    const left = await boot(context, 'legacy', '/topic/1', true)
    await left.addScriptTag({ content: feed })
    const right = await boot(context, 'ios27', '/topic/1', true)
    await right.addScriptTag({ content: feed })
    const role = (page) => page.evaluate(async () => (await LSB.bus.request('live-feed:debug')).role())
    let roles
    const deadline = Date.now() + 8000
    do {
      roles = await Promise.all([role(left), role(right)])
      if (roles.includes('leader') && roles.includes('follower')) break
      await left.waitForTimeout(100)
    } while (Date.now() < deadline)
    assert.deepEqual(roles.slice().sort(), ['follower', 'leader'])
    const leader = roles[0] === 'leader' ? left : right
    const follower = leader === left ? right : left
    const beforeLeader = state.reads.get(leader)
    const beforeFollower = state.reads.get(follower)
    await follower.waitForTimeout(1600)
    assert.ok(state.reads.get(leader) > beforeLeader, 'leader continues polling')
    assert.equal(state.reads.get(follower), beforeFollower, 'settled follower does not duplicate polling')
    await leader.close()
    console.log('  waiting for the surviving tab to take over the real heartbeat lease…')
    await follower.waitForFunction(async () => (await LSB.bus.request('live-feed:debug')).role() === 'leader', null, { timeout: 45000 })
    state.fresh = true
    await follower.evaluate(async () => (await LSB.bus.request('live-feed:debug')).pollOnce())
    await follower.locator('#post-999991').waitFor({ state: 'attached' })
    assert.equal(await follower.locator('#post-999991').count(), 1)
  })
  completed = true
} finally {
  writeFileSync(resolve(output, 'results.json'), JSON.stringify({ checkedAt: new Date().toISOString(), completed, results }, null, 2) + '\n')
  await browser.close()
}
