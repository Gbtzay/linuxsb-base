#!/usr/bin/env node
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { chromium } from 'playwright'
import { applyPluginBuildProfile } from './build-profile.mjs'

const home = readFileSync(new URL('../test/fixtures/home.html', import.meta.url), 'utf8')
const base = readFileSync(new URL('../dist/linuxsb-base.user.js', import.meta.url), 'utf8')
const skin = applyPluginBuildProfile('skin', readFileSync(new URL('../plugins/skin.user.js', import.meta.url), 'utf8'), 'release')
const nativeLayoutCss = `
  *,*::before,*::after{box-sizing:border-box}
  html,body{margin:0}
  .wrap{max-width:1200px;margin:0 auto;padding:12px}
  .home-shell{background:#fff;border:1px solid #ddd;border-radius:12px;padding:24px;overflow:visible}
  .home-shell .forum-layout{gap:24px}
  .forum-layout{display:flex;gap:12px;align-items:flex-start}
  @media(min-width:721px){.forum-layout-has-sidebar{display:grid;grid-template-columns:minmax(0,1fr) 230px}}
  .forum-main{flex:1 1 0%;min-width:0}
  .main-panel{background:#fff;border-radius:12px;overflow:hidden}
  .sidebar{width:230px}
`
const browser = await chromium.launch({ headless: true })
const page = await browser.newPage({ viewport: { width: 1920, height: 1080 } })
const requests = []

try {
  page.on('request', (request) => {
    if (/[?&]p=2(?:&|$)/.test(request.url())) requests.push(request.url())
  })
  await page.addInitScript(() => {
    localStorage.setItem('lsb_base:skin:__config', JSON.stringify({ uiMode: 'legacy', measure: true }))
  })
  await page.route('https://linux.sb/**', async (route) => {
    const url = new URL(route.request().url())
    if (url.pathname === '/' || url.pathname === '/index.php') {
      await route.fulfill({ status: 200, contentType: 'text/html', body: home })
      return
    }
    if (/\.css$/i.test(url.pathname)) {
      await route.fulfill({ status: 200, contentType: 'text/css', body: nativeLayoutCss })
      return
    }
    if (/\.js$/i.test(url.pathname)) {
      await route.fulfill({ status: 200, contentType: 'application/javascript', body: '' })
      return
    }
    if (/\.(?:png|jpe?g|webp|gif|svg)$/i.test(url.pathname)) {
      await route.fulfill({ status: 200, contentType: 'image/svg+xml', body: '<svg xmlns="http://www.w3.org/2000/svg" width="1" height="1"></svg>' })
      return
    }
    await route.fulfill({ status: 404, body: '' })
  })
  await page.goto('https://linux.sb/', { waitUntil: 'domcontentloaded' })
  await page.evaluate(() => {
    const pagination = document.querySelector('.pagination-bar')
    pagination?.classList.remove('sb-infinite-scroll-pagination-hidden')
    if (pagination) pagination.innerHTML = '<a href="/?p=2">下一页</a>'
  })
  await page.addScriptTag({ content: base })
  await page.addScriptTag({ content: skin })
  await page.waitForSelector('#lsb-shell', { state: 'attached', timeout: 5000 })
  await page.waitForTimeout(300)

  const geometry = await page.evaluate(() => {
    const panel = document.querySelector('.main-panel')
    const aside = document.querySelector('#lsb-shell-aside')
    const panelStyle = panel ? getComputedStyle(panel) : null
    const rootStyle = getComputedStyle(document.documentElement)
    const panelRect = panel?.getBoundingClientRect()
    const asideRect = aside?.getBoundingClientRect()
    return {
      documentScrollHeight: document.documentElement.scrollHeight,
      viewportHeight: innerHeight,
      rootOverflowY: rootStyle.overflowY,
      homeMarker: document.documentElement.classList.contains('lsb-skin-shell-home'),
      panelOverflowY: panelStyle?.overflowY || '',
      panelClientHeight: panel?.clientHeight || 0,
      panelScrollHeight: panel?.scrollHeight || 0,
      panelRight: panelRect?.right || 0,
      asideLeft: asideRect?.left || 0,
      asidePosition: aside ? getComputedStyle(aside).position : '',
    }
  })
  assert.ok(geometry.documentScrollHeight <= geometry.viewportHeight + 1, `页面根仍在滚动: ${JSON.stringify(geometry)}`)
  assert.equal(geometry.rootOverflowY, 'hidden', `页面根未锁定: ${JSON.stringify(geometry)}`)
  assert.equal(geometry.homeMarker, true, `首页未打上专用布局标记: ${JSON.stringify(geometry)}`)
  assert.equal(geometry.panelOverflowY, 'auto', `中间首页面板未接管滚动: ${JSON.stringify(geometry)}`)
  assert.ok(geometry.panelScrollHeight > geometry.panelClientHeight, `中间首页面板没有可滚动内容: ${JSON.stringify(geometry)}`)
  assert.ok(Math.abs(geometry.panelRight - geometry.asideLeft) <= 1, `中间滚动条与右栏之间仍有空白: ${JSON.stringify(geometry)}`)
  assert.equal(geometry.asidePosition, 'fixed', `右栏不应参与页面流: ${JSON.stringify(geometry)}`)

  await page.evaluate(() => {
    const panel = document.querySelector('.main-panel')
    panel.scrollTop = panel.scrollHeight
    panel.dispatchEvent(new Event('scroll'))
  })
  await page.waitForTimeout(500)
  assert.ok(requests.length > 0, `中间面板滚动到底部没有触发下一页请求: ${JSON.stringify(geometry)}`)
  console.log('✔ legacy home scroll root and infinite loading')
} finally {
  await browser.close()
}
