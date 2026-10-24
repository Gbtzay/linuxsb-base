#!/usr/bin/env node
/**
 * 本地氢壳浏览器前置验收。安装依赖中没有 Playwright 时只报告跳过，
 * 不访问生产站点；CI/开发机安装 Playwright 后会运行五档宽度检查。
 */
import { createServer } from 'node:http'
import { readFile } from 'node:fs/promises'
import { join } from 'node:path'
import { fileURLToPath } from 'node:url'

const root = fileURLToPath(new URL('..', import.meta.url))
let playwright
try {
  playwright = await import('playwright')
} catch {
  console.log('SKIP browser acceptance: playwright is not installed')
  process.exit(0)
}

const [topicFixture, homeFixture, challengeFixture, base, skin] = await Promise.all([
  readFile(join(root, 'test', 'fixtures', 'topic1.html'), 'utf8'),
  readFile(join(root, 'test', 'fixtures', 'home.html'), 'utf8'),
  readFile(join(root, 'test', 'fixtures', 'cloudflare-challenge.html'), 'utf8'),
  readFile(join(root, 'dist', 'linuxsb-base.user.js'), 'utf8'),
  readFile(join(root, 'plugins', 'skin.user.js'), 'utf8'),
])
function buildPageHtml(fixture, uiMode) {
  return fixture
    .replace(/<script\b[^>]*\bsrc=[^>]*>\s*<\/script>/gi, '')
    .replace(
      '<main class="wrap">',
      '<main class="wrap"><div class="forum-enhancements-left-fixed performance-render-root"><nav class="forum-enhancements-left-navigation"><a href="/">社区首页</a></nav></div>',
    )
    .replace(
      '</body>',
      `<script>(() => { const key = 'lsb_base:skin:__config'; let config = {}; try { config = JSON.parse(localStorage.getItem(key) || '{}') } catch {} config.uiMode = ${JSON.stringify(uiMode)}; localStorage.setItem(key, JSON.stringify(config)); const identity = document.createElement('a'); identity.className = 'forum-enhancements-custom-top-link'; identity.href = '/identity_center'; identity.textContent = '认证中心'; document.querySelector('body > .top .bar').append(identity) })()</script><script>${base}</script><script>${skin}</script></body>`,
    )
}
const server = createServer((request, res) => {
  const url = new URL(request.url || '/', 'http://127.0.0.1')
  if (url.pathname.endsWith('.css')) {
    res.writeHead(200, { 'content-type': 'text/css; charset=utf-8' })
    res.end('')
    return
  }
  if (/\.(?:png|jpe?g|webp|gif|svg)$/i.test(url.pathname)) {
    res.writeHead(200, { 'content-type': 'image/svg+xml' })
    res.end('<svg xmlns="http://www.w3.org/2000/svg" width="1" height="1"></svg>')
    return
  }
  const pageType = url.searchParams.get('page')
  const fixture = pageType === 'home' ? homeFixture : pageType === 'challenge' ? challengeFixture : topicFixture
  const uiMode = url.searchParams.get('uiMode') === 'legacy' ? 'legacy' : 'ios27'
  res.writeHead(200, { 'content-type': 'text/html; charset=utf-8' })
  res.end(buildPageHtml(fixture, uiMode))
})
await new Promise((resolve) => server.listen(0, '127.0.0.1', resolve))
const port = server.address().port

let browser
try {
  browser = await playwright.chromium.launch({ headless: true })
  for (const pageType of ['home', 'topic']) {
    for (const width of [1440, 1100, 1099, 700, 699]) {
      const context = await browser.newContext({ viewport: { width, height: 900 } })
      const page = await context.newPage()
      const errors = []
      page.on('pageerror', (error) => errors.push(error.message))
      page.on('console', (message) => { if (message.type() === 'error') errors.push(message.text()) })
      const route = pageType === 'home' ? '/?page=home&uiMode=legacy' : '/topic/1?uiMode=legacy'
      await page.goto(`http://127.0.0.1:${port}${route}`, { waitUntil: 'domcontentloaded' })
      await page.waitForTimeout(100)
      const result = await page.evaluate(() => {
        const rect = (node) => {
          const box = node?.getBoundingClientRect?.()
          return box ? { left: box.left, right: box.right, top: box.top, bottom: box.bottom, width: box.width, height: box.height } : null
        }
        const shell = document.getElementById('lsb-shell')
        const header = document.getElementById('lsb-shell-header')
        const rail = document.getElementById('lsb-shell-rail')
        const aside = document.getElementById('lsb-shell-aside')
        const content = document.querySelector('main.wrap')
        const nativeHeader = document.querySelector('body > .top')
        const nativeSidebars = [...document.querySelectorAll('aside.sidebar:not(#mobile-menu-drawer):not(.mobile-menu-drawer)')]
        const visible = (node) => !!node && getComputedStyle(node).display !== 'none' && rect(node).width > 0 && rect(node).height > 0
        return {
          width: innerWidth,
          shell: !!shell,
          shellDisplay: shell ? getComputedStyle(shell).display : 'missing',
          canvasMode: document.documentElement.classList.contains('lsb-canvas-mode'),
          surfaces: !!document.getElementById('lsb-shell-surfaces'),
          windowed: shell?.getAttribute('data-lsb-shell-mode') === 'windowed',
          dragChrome: document.querySelectorAll('[data-lsb-shell-window-drag], [data-lsb-shell-window-bar], [data-lsb-shell-resize-edge]').length,
          shellHeader: rect(header),
          shellRail: rect(rail),
          shellAside: rect(aside),
          content: rect(content),
          contentVisible: visible(content),
          nativeHeaderClassHidden: nativeHeader?.classList.contains('lsb-native-header-hidden') || false,
          nativeHeaderVisible: visible(nativeHeader),
          nativeSidebarClassesHidden: nativeSidebars.some((node) => node.classList.contains('lsb-native-sidebar-hidden')),
          nativeSidebarsVisible: nativeSidebars.length > 0 && nativeSidebars.some(visible),
          overflow: document.documentElement.scrollWidth > innerWidth || document.body.scrollWidth > innerWidth,
        }
      })
      if (errors.length) throw new Error(`${pageType} legacy ${width}px console errors: ${errors.join(' | ')}`)
      if (result.canvasMode || result.surfaces || result.windowed || result.dragChrome) {
        throw new Error(`${pageType} legacy ${width}px mounted canvas/window chrome: ${JSON.stringify(result)}`)
      }
      if (!result.contentVisible || result.overflow) {
        throw new Error(`${pageType} legacy ${width}px content is hidden or overflows: ${JSON.stringify(result)}`)
      }
      if (width >= 1100) {
        if (!result.shell || result.shellDisplay !== 'block' || !result.shellHeader || !result.shellRail || !result.shellAside) {
          throw new Error(`${pageType} legacy ${width}px three-column shell failed: ${JSON.stringify(result)}`)
        }
        if (result.shellHeader.top !== 0 || result.shellHeader.left !== 0 || result.shellHeader.right < width - 1) {
          throw new Error(`${pageType} legacy ${width}px top bar geometry failed: ${JSON.stringify(result)}`)
        }
        if (result.shellRail.left !== 0 || result.shellRail.right <= 0 || result.shellRail.top !== 0) {
          throw new Error(`${pageType} legacy ${width}px left rail geometry failed: ${JSON.stringify(result)}`)
        }
        if (result.shellAside.left < width - result.shellAside.width - 1 || result.shellAside.right < width - 1) {
          throw new Error(`${pageType} legacy ${width}px right aside geometry failed: ${JSON.stringify(result)}`)
        }
        if (result.content.left < result.shellRail.right - 1 || result.content.right > result.shellAside.left + 1) {
          throw new Error(`${pageType} legacy ${width}px content overlaps a side column: ${JSON.stringify(result)}`)
        }
      } else if (result.shell || result.nativeHeaderClassHidden || !result.nativeHeaderVisible || result.nativeSidebarClassesHidden || !result.nativeSidebarsVisible) {
        throw new Error(`${pageType} legacy ${width}px did not restore native responsive layout: ${JSON.stringify(result)}`)
      }
      console.log(`PASS legacy ${pageType} ${width}px`, result)
      await context.close()
    }
  }
  for (const pageType of ['home', 'topic']) {
    for (const width of [1440, 1100, 1099, 700, 699]) {
      const context = await browser.newContext({ viewport: { width, height: 900 } })
      const page = await context.newPage()
      const errors = []
      page.on('pageerror', (error) => errors.push(error.message))
      page.on('console', (message) => { if (message.type() === 'error') errors.push(message.text()) })
      const route = pageType === 'home' ? '/?page=home&uiMode=ios27' : '/topic/1?uiMode=ios27'
      await page.goto(`http://127.0.0.1:${port}${route}`, { waitUntil: 'domcontentloaded' })
    await page.waitForSelector('#lsb-shell-surfaces')
    const result = await page.evaluate(() => {
      const shell = document.querySelector('#lsb-shell')
      const nativeSidebars = [...document.querySelectorAll('aside.sidebar:not(#mobile-menu-drawer):not(.mobile-menu-drawer)')]
      const nativeLeftRails = [...document.querySelectorAll('.forum-enhancements-left-fixed')]
      const surfaces = [...document.querySelectorAll('#lsb-shell-surfaces [data-surface]')]
      const topStatus = document.querySelector('[data-surface="top-status"]')
      const navigation = topStatus?.querySelector('[data-canvas-navigation-trigger]')
      const navigationRect = navigation?.getBoundingClientRect()
      const topStatusRect = topStatus?.getBoundingClientRect()
      const navigationHit = navigationRect
        ? document.elementFromPoint((navigationRect.left + navigationRect.right) / 2, (navigationRect.top + navigationRect.bottom) / 2)
        : null
      return {
        bucket: document.documentElement.className.includes('lsb-canvas-page-') ? document.documentElement.className.match(/lsb-canvas-page-([\w-]+)/)?.[1] : '',
        shellDisplay: shell ? getComputedStyle(shell).display : 'missing',
        surfaces: surfaces.map((node) => node.getAttribute('data-surface')),
        navigation: navigationRect ? { left: navigationRect.left, right: navigationRect.right, top: navigationRect.top, bottom: navigationRect.bottom } : null,
        navigationOutsideScrollport: !!navigation && !navigation.closest('[data-canvas-status-links]'),
        navigationVisibleInTopStatus: !!(navigationRect && topStatusRect && navigationRect.width > 0 && navigationRect.left >= topStatusRect.left && navigationRect.right <= topStatusRect.right && navigationRect.top >= topStatusRect.top && navigationRect.bottom <= topStatusRect.bottom),
        navigationReceivesPointer: navigationHit?.closest?.('[data-canvas-navigation-trigger]') === navigation,
        content: Boolean(document.querySelector('main.wrap')),
        nativeInsideShell: nativeSidebars.some((node) => Boolean(node.closest('#lsb-shell'))),
        nativeVisible: nativeSidebars.some((node) => getComputedStyle(node).display !== 'none'),
        nativeLeftInsideShell: nativeLeftRails.some((node) => Boolean(node.closest('#lsb-shell'))),
        nativeLeftVisible: nativeLeftRails.some((node) => getComputedStyle(node).display !== 'none'),
      }
    })
    if (result.shellDisplay !== 'block' || !result.content || !result.surfaces.includes('tool-capsule')) {
      throw new Error(`canvas mount failed at ${width}px: ${JSON.stringify(result)}`)
    }
    if (!result.navigationOutsideScrollport || !result.navigationVisibleInTopStatus || !result.navigationReceivesPointer) {
      throw new Error(`top navigation is clipped or covered at ${width}px: ${JSON.stringify(result)}`)
    }
    if (result.nativeInsideShell || result.nativeVisible || result.nativeLeftInsideShell || result.nativeLeftVisible) {
      throw new Error(`native sidebar escaped isolation at ${width}px: ${JSON.stringify(result)}`)
    }
    if (width >= 1100) {
      await page.locator('[data-canvas-open="ai-card"]').click()
      const dragger = page.locator('[data-surface="ai-card"] [data-canvas-sheet-head]')
      const box = await dragger.evaluate((node) => {
        const rect = node.getBoundingClientRect()
        return { x: rect.x, y: rect.y, width: rect.width, height: rect.height }
      })
      const before = await page.locator('[data-surface="ai-card"]').evaluate((node) => ({
        x: Number.parseFloat(node.style.left),
        y: Number.parseFloat(node.style.top),
      }))
      await page.mouse.move(box.x + Math.min(24, box.width / 2), box.y + box.height / 2)
      await page.mouse.down()
      await page.mouse.move(box.x + Math.min(84, box.width / 2) + 48, box.y + box.height / 2 + 48)
      await page.mouse.up()
      const after = await page.locator('[data-surface="ai-card"]').evaluate((node) => ({
        x: Number.parseFloat(node.style.left),
        y: Number.parseFloat(node.style.top),
      }))
      if (after.x === before.x && after.y === before.y) {
        throw new Error(`AI card drag did not move at ${width}px`)
      }
    }
      if (errors.length) throw new Error(`${pageType} ios27 ${width}px console errors: ${errors.join(' | ')}`)
      console.log(`PASS ios27 ${pageType} ${width}px`, result)
      await context.close()
    }
  }
  {
    const context = await browser.newContext({ viewport: { width: 390, height: 844 } })
    const page = await context.newPage()
    const errors = []
    await page.route('https://challenges.cloudflare.com/**', (route) => route.fulfill({ status: 200, contentType: 'application/javascript', body: '' }))
    page.on('pageerror', (error) => errors.push(error.message))
    page.on('console', (message) => { if (message.type() === 'error') errors.push(message.text()) })
    await page.goto(`http://127.0.0.1:${port}/?page=challenge&uiMode=ios27`, { waitUntil: 'domcontentloaded' })
    await page.waitForTimeout(100)
    const challenge = await page.evaluate(() => {
      const main = document.querySelector('main.wrap')
      const top = document.querySelector('body > .top')
      const sidebar = document.querySelector('aside.sidebar')
      window.__lsbChallengeMain = main
      const visible = (node) => !!node && getComputedStyle(node).display !== 'none' && node.getBoundingClientRect().width > 0 && node.getBoundingClientRect().height > 0
      return {
        title: document.title,
        marker: !!document.querySelector('#challenge-stage'),
        challengeVisible: visible(document.querySelector('#challenge-stage')),
        main: !!main,
        challengeAttribute: document.documentElement.getAttribute('data-lsb-cloudflare-challenge'),
        bootClass: document.documentElement.classList.contains('lsb-canvas-boot'),
        bootFrame: !!document.getElementById('lsb-shell-boot-frame'),
        shell: !!document.getElementById('lsb-shell'),
        surfaces: !!document.getElementById('lsb-shell-surfaces'),
        canvasMode: document.documentElement.classList.contains('lsb-canvas-mode'),
        nativeHeaderVisible: visible(top),
        nativeSidebarVisible: visible(sidebar),
        overflow: document.documentElement.scrollWidth > innerWidth || document.body.scrollWidth > innerWidth,
      }
    })
    if (!/just a moment/i.test(challenge.title) || !challenge.marker || !challenge.challengeVisible || !challenge.main) {
      throw new Error(`challenge fixture did not render its verification content: ${JSON.stringify(challenge)}`)
    }
    if (challenge.challengeAttribute !== 'true' || challenge.bootClass || challenge.bootFrame || challenge.shell || challenge.surfaces || challenge.canvasMode) {
      throw new Error(`Cloudflare challenge was taken over by boot or shell UI: ${JSON.stringify(challenge)}`)
    }
    if (!challenge.nativeHeaderVisible || !challenge.nativeSidebarVisible || challenge.overflow) {
      throw new Error(`native challenge page is hidden or overflows: ${JSON.stringify(challenge)}`)
    }

    await page.evaluate(() => {
      const main = document.querySelector('main.wrap')
      const content = document.createElement('p')
      content.textContent = 'Normal forum content'
      main.replaceChildren(content)
      document.title = 'Forum | LINUX SB'
    })
    await page.waitForSelector('#lsb-shell-surfaces', { timeout: 3000 })
    const restored = await page.evaluate(() => ({
      sameMain: document.querySelector('main.wrap') === window.__lsbChallengeMain,
      challengeAttribute: document.documentElement.getAttribute('data-lsb-cloudflare-challenge'),
      canvasMode: document.documentElement.classList.contains('lsb-canvas-mode'),
      shell: !!document.querySelector('#lsb-shell[data-lsb-canvas-shell="true"]'),
      content: document.querySelector('main.wrap')?.textContent || '',
    }))
    if (!restored.sameMain || restored.challengeAttribute || !restored.canvasMode || !restored.shell || !/Normal forum content/.test(restored.content)) {
      throw new Error(`same-document challenge recovery did not restore canvas UI: ${JSON.stringify(restored)}`)
    }

    await page.evaluate(() => {
      const widget = document.createElement('div')
      widget.className = 'cf-turnstile'
      widget.innerHTML = '<iframe title="Widget containing a Cloudflare security challenge"></iframe>'
      document.body.append(widget)
      const resource = document.createElement('script')
      resource.src = 'https://challenges.cloudflare.com/turnstile/v0/api.js'
      document.head.append(resource)
    })
    const turnstile = await page.evaluate(() => ({
      widget: !!document.querySelector('.cf-turnstile iframe'),
      challengeAttribute: document.documentElement.getAttribute('data-lsb-cloudflare-challenge'),
      canvasMode: document.documentElement.classList.contains('lsb-canvas-mode'),
      surfaces: !!document.getElementById('lsb-shell-surfaces'),
    }))
    if (!turnstile.widget || turnstile.challengeAttribute || !turnstile.canvasMode || !turnstile.surfaces) {
      throw new Error(`ordinary Turnstile widget triggered challenge bypass: ${JSON.stringify(turnstile)}`)
    }
    if (errors.length) throw new Error(`Cloudflare challenge browser scenario console errors: ${errors.join(' | ')}`)
    console.log('PASS ios27 Cloudflare challenge, same-document recovery, and Turnstile negative case', { challenge, restored, turnstile })
    await context.close()
  }
} finally {
  await browser?.close()
  await new Promise((resolve) => server.close(resolve))
}
