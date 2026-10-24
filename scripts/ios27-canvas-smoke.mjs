#!/usr/bin/env node
import assert from 'node:assert/strict'
import { mkdirSync, readFileSync } from 'node:fs'
import { createServer } from 'node:http'
import { join, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'
import { chromium } from 'playwright'
import { applyPluginBuildProfile } from './build-profile.mjs'

const root = fileURLToPath(new URL('..', import.meta.url))
const fixture = readFileSync(join(root, 'test', 'fixtures', 'user1.html'), 'utf8')
const homeFixture = readFileSync(join(root, 'test', 'fixtures', 'home.html'), 'utf8')
const topicFixture = readFileSync(join(root, 'test', 'fixtures', 'topic1.html'), 'utf8')
const homeRouteFixture = withRouteHead(homeFixture, {
  title: '首页软跳起始页',
  canonical: 'https://linux.sb/',
  description: '首页软跳起始描述',
  ogTitle: '首页软跳起始 Open Graph 标题',
})
const forumRouteFixture = withRouteHead(homeFixture, {
  title: '论坛软跳目标页',
  canonical: 'https://linux.sb/forum/4',
  description: '论坛软跳目标描述',
  ogTitle: '论坛软跳目标 Open Graph 标题',
})
const baseCode = readFileSync(join(root, 'dist', 'linuxsb-base.user.js'), 'utf8')
const skinCode = applyPluginBuildProfile('skin', readFileSync(join(root, 'plugins', 'skin.user.js'), 'utf8'), 'release')
const outputDir = resolve(process.env.IOS27_SCREEN_DIR || join(root, 'artifacts', 'ios27-canvas'))
const sizes = [
  ['wide', 1440, 1000],
  ['mid', 860, 900],
  ['narrow', 390, 900],
]

function withRouteHead(html, { title, canonical, description, ogTitle }) {
  const markers = [
    '<!--ios27-route-head-start-->',
    '<!--ios27-route-head-title-->',
    '<!--ios27-route-head-description-->',
    '<!--ios27-route-head-end-->',
  ]
  const existingStart = html.indexOf(markers[0])
  const existingEnd = html.indexOf(markers[3])
  if (existingStart !== -1 && existingEnd !== -1) html = html.slice(0, existingStart) + html.slice(existingEnd + markers[3].length)
  const head = `${markers[0]}<link rel="canonical" href="${canonical}"><meta property="og:title" content="${ogTitle}">${markers[1]}<title>${title}</title>${markers[2]}<meta name="description" content="${description}">${markers[3]}`
  return html.replace(/<head\b[^>]*>/i, (opening) => `${opening}${head}`)
}

async function waitForSpaSettled(page, expectedPath) {
  await page.waitForFunction((path) => {
    const outlet = document.querySelector('main.wrap')
    return location.pathname + location.search === path
      && !(document.documentElement.dataset.lsbRoutePhase || '')
      && !document.documentElement.classList.contains('lsb-canvas-route-pending')
      && !outlet?.hasAttribute('aria-busy')
  }, expectedPath)
}
async function enableIos27ModeBeforeNavigation(page) {
  await page.addInitScript(() => {
    const configKey = 'lsb_base:skin:__config'
    let config = {}
    try {
      const parsed = JSON.parse(localStorage.getItem(configKey) || '{}')
      if (parsed && typeof parsed === 'object' && !Array.isArray(parsed)) config = parsed
    } catch { /* replace malformed smoke-test storage with a valid config */ }
    config.uiMode = 'ios27'
    localStorage.setItem(configKey, JSON.stringify(config))
  })
}

async function enableExperimentalTopicSpa(page) {
  await page.evaluate(() => {
    const configKey = 'lsb_base:skin:__config'
    const config = JSON.parse(localStorage.getItem(configKey) || '{}')
    config.uiMode = 'ios27'
    config.topicSpa = true
    localStorage.setItem(configKey, JSON.stringify(config))
    localStorage.setItem('lsb_base:skin:topicSpaNewWorldDefaultMigrationV1', JSON.stringify(true))
  })
}

mkdirSync(outputDir, { recursive: true })
const browser = await chromium.launch({ headless: true })
try {
  for (const [label, width, height] of sizes) {
    const page = await browser.newPage({ viewport: { width, height } })
    await enableIos27ModeBeforeNavigation(page)
    await page.route('https://linux.sb/user/1', (route) =>
      route.fulfill({ status: 200, contentType: 'text/html', body: fixture }),
    )
    await page.goto('https://linux.sb/user/1', { waitUntil: 'domcontentloaded' })
    await page.addScriptTag({ content: baseCode })
    await page.addScriptTag({ content: skinCode })
    await page.locator('[data-lsb-canvas-profile]').waitFor()
    await page.waitForTimeout(250)

    assert.equal(await page.locator('[data-lsb-canvas-profile] .user-card').count(), 1)
    assert.equal(await page.locator('[data-lsb-canvas-list]').count(), 1)
    const labels = await page.locator('[data-canvas-status-links] a').allTextContents()
    for (const required of ['用户榜单', '每日签到', '邀请中心']) assert.ok(labels.includes(required), `${label}: missing ${required}`)

    const geometry = await page.evaluate(() => ({
      documentOverflow: document.documentElement.scrollWidth > window.innerWidth,
      bodyOverflow: document.body.scrollWidth > window.innerWidth,
      gap: getComputedStyle(document.querySelector('[data-lsb-canvas-list]')).marginTop,
    }))
    assert.equal(geometry.documentOverflow, false, `${label}: document has horizontal overflow`)
    assert.equal(geometry.bodyOverflow, false, `${label}: body has horizontal overflow`)
    assert.equal(geometry.gap, '12px', `${label}: profile/list gap drifted`)

    const profileSurface = await page.evaluate(() => {
      const profile = document.querySelector('[data-lsb-canvas-profile]')
      const list = document.querySelector('[data-lsb-canvas-list]')
      const firstLink = profile?.querySelector('.user-links a[href*="tab=topics"]')
      return {
        profileWidth: profile?.getBoundingClientRect().width ?? 0,
        listWidth: list?.getBoundingClientRect().width ?? 0,
        scrollMode: profile?.dataset.scrollMode || '',
        expandControls: profile?.querySelectorAll('[data-lsb-profile-expand]').length ?? 0,
        firstLinkVisible: !!firstLink && getComputedStyle(firstLink).display !== 'none',
      }
    })
    assert.ok(profileSurface.profileWidth <= profileSurface.listWidth + 1, `${label}: profile card is wider than the topic surface`)
    assert.ok(profileSurface.profileWidth <= 760 + 1, `${label}: profile card did not use the compact width cap`)
    assert.equal(profileSurface.scrollMode, 'full', `${label}: profile card entered a collapsed scroll mode`)
    assert.equal(profileSurface.expandControls, 0, `${label}: profile card still exposes a collapse control`)
    assert.equal(profileSurface.firstLinkVisible, true, `${label}: native profile options are hidden`)

    await page.evaluate(() => {
      window.scrollTo(0, 320)
      window.dispatchEvent(new Event('scroll'))
    })
    const sticky = await page.evaluate(() => {
      const profile = document.querySelector('[data-lsb-canvas-profile]')?.getBoundingClientRect()
      const status = document.querySelector('[data-surface="top-status"]')?.getBoundingClientRect()
      return { profileTop: profile?.top ?? 0, statusBottom: status?.bottom ?? 0 }
    })
    assert.ok(
      sticky.profileTop >= sticky.statusBottom - 2 && sticky.profileTop <= sticky.statusBottom + 32,
      `${label}: profile surface is not following the top status bar`,
    )
    await page.evaluate(() => {
      window.scrollTo(0, 520)
      window.dispatchEvent(new Event('scroll'))
    })
    assert.equal(await page.locator('[data-lsb-canvas-profile]').getAttribute('data-scroll-mode'), 'full')
    assert.equal(await page.locator('[data-lsb-canvas-profile] .user-links a[href*="tab=topics"]').isVisible(), true)
    await page.screenshot({ path: join(outputDir, `ios27-canvas-${label}.png`), fullPage: true })
    await page.close()
    console.log(`✔ ${label} ${width}x${height}`)
  }

  for (const [label, width, height] of sizes) {
    const page = await browser.newPage({ viewport: { width, height } })
    await enableIos27ModeBeforeNavigation(page)
    let releaseForumResponse
    let forumRequestStartedResolve
    const forumRequestStarted = new Promise((resolve) => { forumRequestStartedResolve = resolve })
    await page.on('requestfailed', (request) => {
      console.log(`${label}: failed ${request.resourceType()} ${request.url()} ${request.failure()?.errorText || ''}`)
    })
    await page.route('https://linux.sb/forum/4', async (route) => {
      forumRequestStartedResolve?.()
      await new Promise((resolve) => { releaseForumResponse = resolve })
      await route.fulfill({ status: 200, contentType: 'text/html', body: forumRouteFixture })
    })
    await page.route('https://linux.sb/', async (route) => {
      await route.fulfill({ status: 200, contentType: 'text/html', body: homeRouteFixture })
    })
    await page.goto('https://linux.sb/', { waitUntil: 'domcontentloaded', timeout: 10000 })
    await page.addScriptTag({ content: baseCode })
    await page.addScriptTag({ content: skinCode })
    await page.locator('.topic-toolbar').waitFor()
    await page.waitForTimeout(250)

    const geometry = await page.evaluate(() => {
      const profile = document.querySelector('[data-canvas-profile-host]')
      const status = document.querySelector('[data-surface="top-status"]')
      const toolbar = document.querySelector('.topic-toolbar')
      const title = document.querySelector('[data-canvas-status-title]')
      const profileRect = profile?.getBoundingClientRect()
      const statusRect = status?.getBoundingClientRect()
      const toolbarRect = toolbar?.getBoundingClientRect()
      const titleRect = title?.getBoundingClientRect()
      const profileCard = profile?.querySelector('.sidebar-card.user-card')
      const profileLinks = profile?.querySelector('.user-links')
      const firstProfileLink = profile?.querySelector('.user-links a[href*="tab=topics"]')
      const profileName = profile?.querySelector('.user-name')
      const profileAvatar = profile?.querySelector('.user-avatar-big img, .avatar-img')
      const profileRank = profile?.querySelector('.user-rank')
      const profileBell = profile?.querySelector('[data-canvas-profile-bell]')
      const profileExpand = profile?.querySelector('[data-canvas-profile-expand]')
      const rect = (node) => node?.getBoundingClientRect?.() || null
      const profileCardRect = rect(profileCard)
      const avatarRect = rect(profileAvatar)
      const nameRect = rect(profileName)
      const rankRect = rect(profileRank)
      const bellRect = rect(profileBell)
      const expandRect = rect(profileExpand)
      return {
        profileLeft: profileRect?.left ?? null,
         profileRight: profileRect?.right ?? null,
         statusLeft: statusRect?.left ?? null,
         statusCenter: statusRect ? (statusRect.left + statusRect.right) / 2 : null,
         profileCardHeight: profileCardRect?.height ?? 0,
         statusHeight: statusRect?.height ?? 0,
         profileWidth: profileRect?.width ?? 0,
        toolbarWidth: toolbarRect?.width ?? 0,
        profileLinksDisplay: profileLinks ? getComputedStyle(profileLinks).display : '',
         profileCardMaxHeight: profileCard ? getComputedStyle(profileCard).maxHeight : '',
         profileCardOverflow: profileCard ? getComputedStyle(profileCard).overflow : '',
         profileCardTransitionProperty: profileCard ? getComputedStyle(profileCard).transitionProperty : '',
         firstProfileLinkVisible: !!firstProfileLink && getComputedStyle(firstProfileLink).display !== 'none',
        profilePosition: profile ? getComputedStyle(profile).position : '',
        cardTop: profileCardRect?.top ?? null,
        cardBottom: profileCardRect?.bottom ?? null,
        avatarTop: avatarRect?.top ?? null,
        avatarBottom: avatarRect?.bottom ?? null,
        rankTop: rankRect?.top ?? null,
        rankBottom: rankRect?.bottom ?? null,
         rankDisplay: profileRank ? getComputedStyle(profileRank).display : '',
         bellCompactWidth: profileBell?.getBoundingClientRect?.().width ?? 0,
         bellCompactFontSize: profileBell ? getComputedStyle(profileBell).fontSize : '',
        nameRight: nameRect?.right ?? null,
        bellLeft: bellRect?.left ?? null,
        bellRight: bellRect?.right ?? null,
        expandLeft: expandRect?.left ?? null,
        homePaddingTop: getComputedStyle(document.querySelector('.home-shell')).paddingTop,
        forumMainPaddingTop: getComputedStyle(document.querySelector('.forum-main')).paddingTop,
        titleWidth: titleRect?.width ?? 0,
        titleScrollWidth: title?.scrollWidth ?? 0,
      }
    })
    assert.equal(geometry.profilePosition, 'fixed', `${label}: profile card is not detached from content flow`)
    assert.ok(geometry.profileLeft >= 0 && geometry.profileRight <= width + 1, `${label}: profile card leaves the viewport`)
    assert.ok(geometry.profileRight <= geometry.statusLeft + 2, `${label}: profile card overlaps the top status bar`)
    if (label === 'wide') assert.ok(Math.abs(geometry.statusCenter - width / 2) <= 20, `${label}: top status bar drifted from the central reading area`)
    assert.ok(Math.abs(geometry.profileCardHeight - geometry.statusHeight) <= 0.5, `${label}: status bar height does not match the profile card (${geometry.statusHeight}px vs ${geometry.profileCardHeight}px)`)
    assert.ok(geometry.profileWidth <= 240, `${label}: homepage profile card is too wide for the top bar`)
    assert.equal(geometry.profileLinksDisplay, 'flex', `${label}: homepage profile options are hidden`)
    assert.equal(geometry.profileCardMaxHeight, '56px', `${label}: homepage profile card is not compact by default`)
    assert.equal(geometry.profileCardOverflow, 'hidden', `${label}: compact profile card must contain native badges and avatar`)
    assert.equal(geometry.firstProfileLinkVisible, false, `${label}: homepage profile card did not start compact`)
    assert.ok(geometry.avatarTop >= geometry.cardTop && geometry.avatarBottom <= geometry.cardBottom, `${label}: avatar escapes the compact profile card: ${JSON.stringify(geometry)}`)
    assert.ok(geometry.nameRight <= geometry.bellLeft - 4, `${label}: profile name is squeezed into the notification button: ${JSON.stringify(geometry)}`)
    assert.ok(geometry.bellRight <= geometry.expandLeft - 4, `${label}: notification button is squeezed into the expand button: ${JSON.stringify(geometry)}`)
    assert.equal(geometry.rankDisplay, 'none', `${label}: compact profile card still exposes user group/title details`)
    assert.ok(!geometry.profileCardTransitionProperty.split(',').map((value) => value.trim()).includes('width'), `${label}: profile expansion still animates width and can reflow content`)
    assert.equal(geometry.bellCompactWidth, 27, `${label}: compact notification control is not the bell capsule`)
    assert.equal(geometry.bellCompactFontSize, '0px', `${label}: compact notification control exposes link text`)
    await page.locator('[data-canvas-profile-expand]').click()
    await page.waitForTimeout(50)
    assert.equal(await page.locator('[data-canvas-profile-host]').getAttribute('data-expanded'), 'true', `${label}: profile card did not expand`)
    assert.equal(await page.locator('[data-canvas-profile-host] > .sidebar-card.user-card').evaluate((node) => getComputedStyle(node).overflow), 'visible', `${label}: expanded profile card should escape its compact clip`)
    assert.equal(await page.locator('[data-canvas-profile-host] .user-links a[href*="tab=topics"]').isVisible(), true, `${label}: expanded native profile options are missing`)
    const expandedBell = await page.locator('[data-canvas-profile-host] [data-canvas-profile-bell]').evaluate((node) => {
      const style = getComputedStyle(node)
      const rect = node.getBoundingClientRect()
      return {
        text: node.textContent?.trim() || '',
        display: style.display,
        fontSize: style.fontSize,
        width: rect.width,
        height: rect.height,
        paddingLeft: style.paddingLeft,
        paddingRight: style.paddingRight,
      }
    })
    assert.match(expandedBell.text, /我的通知/, `${label}: expanded notification link lost its label`)
    assert.ok(['flex', 'inline-flex'].includes(expandedBell.display), `${label}: expanded notification link did not restore link layout`)
    assert.notEqual(expandedBell.fontSize, '0px', `${label}: expanded notification link is still using compact icon-only text`)
    assert.ok(expandedBell.width > geometry.bellCompactWidth + 8, `${label}: expanded notification link is still the compact bell size`)
    assert.ok(Number.parseFloat(expandedBell.paddingLeft) > 0 && Number.parseFloat(expandedBell.paddingRight) > 0, `${label}: expanded notification link has no readable padding`)
    await page.locator('[data-canvas-profile-expand]').click()
    assert.equal(geometry.homePaddingTop, '0px', `${label}: homepage shell keeps duplicate top padding`)
    assert.equal(geometry.forumMainPaddingTop, '0px', `${label}: forum main keeps duplicate top padding`)
    assert.ok(
      geometry.titleWidth >= geometry.titleScrollWidth - 1,
      `${label}: canvas status title is clipped by flex shrinking`,
    )

    await page.locator('[data-surface="tool-capsule"] [data-canvas-open="tool-sheet"]').click()
    await page.locator('[data-tool-action="appearance-sheet"]').click()
    const appearance = page.locator('[data-surface="appearance-sheet"]')
    await appearance.locator('[data-canvas-appearance="fontFamily"]').selectOption('system-ui')
    await appearance.locator('[data-canvas-save-appearance]').click()
    const appearanceState = await page.evaluate(() => {
      const home = document.querySelector('.home-shell')
      return {
        font: home ? getComputedStyle(home).fontFamily : '',
        status: document.querySelector('[data-canvas-appearance-status]')?.textContent?.trim() || '',
        panelRadius: getComputedStyle(document.querySelector('.main-panel')).borderTopLeftRadius,
        panelBackground: getComputedStyle(document.querySelector('.main-panel')).backgroundColor,
      }
    })
    assert.match(appearanceState.font, /system-ui/i, `${label}: appearance font did not reach .home-shell`)
    assert.match(appearanceState.status, /外观已保存/, `${label}: appearance save feedback missing`)
    assert.notEqual(appearanceState.panelRadius, '0px', `${label}: homepage panel lost its rounded surface`)
    assert.notEqual(appearanceState.panelBackground, 'rgba(0, 0, 0, 0)', `${label}: homepage panel lost its glass surface`)
    await page.screenshot({ path: join(outputDir, `ios27-home-${label}.png`), fullPage: true })
    await appearance.locator('[data-canvas-close]').click()
    await appearance.waitFor({ state: 'hidden' })
    await page.evaluate(() => {
      const spacer = document.createElement('div')
      spacer.id = 'ios27-soft-hop-scroll-spacer'
      spacer.setAttribute('aria-hidden', 'true')
      spacer.style.cssText = 'height:1000px;pointer-events:none'
      document.body.append(spacer)
      window.scrollTo(0, 280)
      window.__ios27HomeScrollY = window.scrollY
      window.__ios27ShellBeforeSoftHop = document.getElementById('lsb-shell')
      window.__ios27StatusBeforeSoftHop = document.querySelector('[data-surface="top-status"]')
      window.__ios27ToolsBeforeSoftHop = document.querySelector('[data-surface="tool-capsule"]')
      window.__ios27OutletBeforeSoftHop = document.querySelector('main.wrap')
      window.__ios27OldListBeforeSoftHop = document.querySelector('.post-list')
    })
    await page.waitForFunction(() => window.__ios27HomeScrollY > 0 && window.scrollY === window.__ios27HomeScrollY)
    await page.evaluate(() => document.querySelector('a[href="/forum/4"]')?.click())
    await forumRequestStarted
    await page.waitForFunction(() => document.getElementById('lsb-shell-progress')?.dataset.phase === 'loading')
    const softHop = await page.evaluate(() => {
      const pendingHeader = document.createElement('div')
      pendingHeader.className = 'top'
      pendingHeader.style.display = 'flex'
      document.body.append(pendingHeader)
      const nativeFloat = document.createElement('div')
      nativeFloat.className = 'mobile-menu-backdrop'
      nativeFloat.style.display = 'block'
      document.body.append(nativeFloat)

      const progress = document.getElementById('lsb-shell-progress')
      const progressStyle = progress ? getComputedStyle(progress) : null
      const progressRect = progress?.getBoundingClientRect()
      const status = document.querySelector('[data-surface="top-status"]')
      const tools = document.querySelector('[data-surface="tool-capsule"]')
      const outlet = document.querySelector('main.wrap')
      const nativeHeader = document.querySelector('body > .top')
      const nativeSidebar = document.querySelector('aside.sidebar:not(#mobile-menu-drawer):not(.mobile-menu-drawer)')
      const snapshot = {
        phase: document.documentElement.dataset.lsbRoutePhase || '',
        progressPhase: progress?.dataset.phase || '',
        progressHeight: progressStyle?.height || '',
        progressTop: progressRect?.top ?? null,
        progressPointerEvents: progressStyle?.pointerEvents || '',
        transitionCount: document.querySelectorAll('#lsb-shell-route-transition').length,
        shellStable: document.getElementById('lsb-shell') === window.__ios27ShellBeforeSoftHop,
        statusStable: status === window.__ios27StatusBeforeSoftHop,
        toolsStable: tools === window.__ios27ToolsBeforeSoftHop,
        outletStable: outlet === window.__ios27OutletBeforeSoftHop,
        oldListConnected: !!window.__ios27OldListBeforeSoftHop?.isConnected,
        nativeHeaderDisplay: nativeHeader ? getComputedStyle(nativeHeader).display : 'missing',
        nativeSidebarDisplay: nativeSidebar ? getComputedStyle(nativeSidebar).display : 'missing',
        pendingHeaderDisplay: getComputedStyle(pendingHeader).display,
        nativeFloatDisplay: getComputedStyle(nativeFloat).display,
        routeChromePending: document.documentElement.classList.contains('lsb-canvas-route-pending'),
        busy: outlet?.getAttribute('aria-busy') || '',
        historyUrl: history.state?.lsbShellSpaUrl || '',
        historyY: history.state?.lsbScrollY ?? null,
        currentY: window.scrollY,
      }
      pendingHeader.remove()
      nativeFloat.remove()
      return snapshot
    })
    assert.equal(softHop.phase, 'fetching', `${label}: soft hop did not enter fetching phase`)
    assert.equal(softHop.progressPhase, 'loading', `${label}: delayed request did not show the progress line`)
    assert.equal(softHop.progressHeight, '3px', `${label}: progress line is not 3px high`)
    assert.equal(softHop.progressTop, 0, `${label}: progress line is not fixed to the viewport top`)
    assert.equal(softHop.progressPointerEvents, 'none', `${label}: progress line intercepts pointer events`)
    assert.equal(softHop.transitionCount, 0, `${label}: a body transition overlay is still mounted`)
    assert.equal(softHop.shellStable, true, `${label}: canvas shell was rebuilt during soft hop`)
    assert.equal(softHop.statusStable, true, `${label}: top status node was rebuilt during soft hop`)
    assert.equal(softHop.toolsStable, true, `${label}: tool capsule was rebuilt during soft hop`)
    assert.equal(softHop.outletStable, true, `${label}: body outlet was replaced before the response`)
    assert.equal(softHop.oldListConnected, true, `${label}: old list disappeared before the response`)
    assert.equal(softHop.nativeHeaderDisplay, 'none', `${label}: native header flashed during soft hop`)
    assert.equal(softHop.nativeSidebarDisplay, 'none', `${label}: native sidebar flashed during soft hop`)
    assert.equal(softHop.pendingHeaderDisplay, 'none', `${label}: a remounted native header escaped transaction hiding`)
    assert.equal(softHop.nativeFloatDisplay, 'none', `${label}: a native floating menu escaped transaction hiding`)
    assert.equal(softHop.routeChromePending, true, `${label}: page-level route hiding state is missing`)
    assert.equal(softHop.busy, 'true', `${label}: outlet is not marked busy during navigation`)
    assert.equal(softHop.historyUrl, 'https://linux.sb/', `${label}: current history entry URL was not recorded`)
    assert.equal(softHop.historyY, softHop.currentY, `${label}: current history scroll position was not saved`)
    await page.screenshot({ path: join(outputDir, label === 'wide' ? 'soft-hop-wide.png' : `soft-hop-${label}.png`), fullPage: false })
    releaseForumResponse?.()
    await waitForSpaSettled(page, '/forum/4')
    await page.waitForFunction(() => document.activeElement === document.querySelector('main.wrap'))
    const submitted = await page.evaluate(() => {
      const outlet = document.querySelector('main.wrap')
      return {
        href: location.pathname + location.search,
        title: document.title,
        canonical: document.querySelector('link[rel="canonical"]')?.href || '',
        description: document.querySelector('meta[name="description"]')?.content || '',
        ogTitle: document.querySelector('meta[property="og:title"]')?.content || '',
        shellStable: document.getElementById('lsb-shell') === window.__ios27ShellBeforeSoftHop,
        statusStable: document.querySelector('[data-surface="top-status"]') === window.__ios27StatusBeforeSoftHop,
        toolsStable: document.querySelector('[data-surface="tool-capsule"]') === window.__ios27ToolsBeforeSoftHop,
        outletStable: outlet === window.__ios27OutletBeforeSoftHop,
        entered: outlet?.hasAttribute('data-lsb-route-content-enter') || false,
        animationName: outlet ? getComputedStyle(outlet).animationName : '',
        animationDuration: outlet ? getComputedStyle(outlet).animationDuration : '',
        focused: document.activeElement === outlet,
        tabindex: outlet?.getAttribute('tabindex') || '',
        announcement: document.getElementById('lsb-route-announcer')?.textContent || '',
        busy: outlet?.getAttribute('aria-busy') || '',
      }
    })
    assert.equal(submitted.href, '/forum/4', `${label}: forum URL did not settle`)
    assert.equal(submitted.title, '论坛软跳目标页', `${label}: document title did not update`)
    assert.equal(submitted.canonical, 'https://linux.sb/forum/4', `${label}: canonical URL did not update`)
    assert.equal(submitted.description, '论坛软跳目标描述', `${label}: description did not update`)
    assert.equal(submitted.ogTitle, '论坛软跳目标 Open Graph 标题', `${label}: Open Graph title did not update`)
    assert.equal(submitted.shellStable, true, `${label}: canvas shell changed after forum commit`)
    assert.equal(submitted.statusStable, true, `${label}: top status node changed after forum commit`)
    assert.equal(submitted.toolsStable, true, `${label}: tool capsule changed after forum commit`)
    assert.equal(submitted.outletStable, true, `${label}: body outlet node changed after forum commit`)
    assert.equal(submitted.entered, true, `${label}: committed body has no enter state`)
    assert.equal(submitted.animationName, 'lsb-route-content-in', `${label}: body enter animation is missing`)
    assert.equal(submitted.animationDuration, '0.18s', `${label}: body enter animation is not 180ms`)
    assert.equal(submitted.focused, true, `${label}: user navigation did not focus the body outlet`)
    assert.equal(submitted.tabindex, '-1', `${label}: body outlet cannot receive programmatic focus`)
    assert.equal(submitted.announcement, '已打开：论坛软跳目标页', `${label}: live region did not announce the target title`)
    assert.equal(submitted.busy, '', `${label}: outlet remains busy after commit`)
    await page.screenshot({ path: join(outputDir, `soft-hop-${label}-settled.png`), fullPage: false })

    await page.evaluate(() => {
      const marker = document.createElement('button')
      marker.id = 'ios27-history-focus-guard'
      marker.textContent = 'history focus guard'
      marker.style.cssText = 'position:fixed;left:0;top:0;width:1px;height:1px;opacity:0;pointer-events:none'
      document.body.append(marker)
      marker.focus()
      window.__ios27HistoryFocusGuard = marker
      window.__ios27AnnouncementBeforeHistory = document.getElementById('lsb-route-announcer')?.textContent || ''
    })
    await page.goBack()
    await waitForSpaSettled(page, '/')
    const homeBack = await page.evaluate(() => ({
      href: location.pathname + location.search,
      title: document.title,
      canonical: document.querySelector('link[rel="canonical"]')?.href || '',
      scrollY: window.scrollY,
      historyY: history.state?.lsbScrollY ?? null,
      expectedScrollY: window.__ios27HomeScrollY,
      shellStable: document.getElementById('lsb-shell') === window.__ios27ShellBeforeSoftHop,
      outletStable: document.querySelector('main.wrap') === window.__ios27OutletBeforeSoftHop,
      oldListConnected: !!window.__ios27OldListBeforeSoftHop?.isConnected,
      focusPreserved: document.activeElement === window.__ios27HistoryFocusGuard,
      announcement: document.getElementById('lsb-route-announcer')?.textContent || '',
      announcementBefore: window.__ios27AnnouncementBeforeHistory,
    }))
    assert.equal(homeBack.href, '/', `${label}: browser back did not restore home`)
    assert.equal(homeBack.title, '首页软跳起始页', `${label}: browser back did not restore the cached title`)
    assert.equal(homeBack.canonical, 'https://linux.sb/', `${label}: browser back did not restore cached canonical metadata`)
    assert.equal(homeBack.historyY, homeBack.expectedScrollY, `${label}: browser history scroll state changed during back navigation`)
    // Narrow Chromium layout applies a measured 6px scroll-anchor adjustment after the exact restore.
    const homeScrollTolerance = label === 'narrow' ? 8 : 1
    assert.ok(
      Math.abs(homeBack.scrollY - homeBack.expectedScrollY) <= homeScrollTolerance,
      `${label}: browser back did not restore history scroll position (actual ${homeBack.scrollY}, expected ${homeBack.expectedScrollY}, tolerance ${homeScrollTolerance}px)`,
    )
    assert.equal(homeBack.shellStable, true, `${label}: browser back rebuilt the canvas shell`)
    assert.equal(homeBack.outletStable, true, `${label}: browser back replaced the body outlet node`)
    assert.equal(homeBack.oldListConnected, true, `${label}: browser back did not restore the cached list node`)
    assert.equal(homeBack.focusPreserved, true, `${label}: history navigation stole focus`)
    assert.equal(homeBack.announcement, homeBack.announcementBefore, `${label}: history navigation announced a new route`)
    await page.goForward()
    await waitForSpaSettled(page, '/forum/4')
    const forumForward = await page.evaluate(() => ({
      href: location.pathname + location.search,
      title: document.title,
      focusPreserved: document.activeElement === window.__ios27HistoryFocusGuard,
      announcement: document.getElementById('lsb-route-announcer')?.textContent || '',
      announcementBefore: window.__ios27AnnouncementBeforeHistory,
    }))
    assert.equal(forumForward.href, '/forum/4', `${label}: browser forward did not restore the forum route`)
    assert.equal(forumForward.title, '论坛软跳目标页', `${label}: browser forward did not restore target metadata`)
    assert.equal(forumForward.focusPreserved, true, `${label}: browser forward stole focus`)
    assert.equal(forumForward.announcement, forumForward.announcementBefore, `${label}: browser forward announced a route`)
    await page.close()
    console.log(`✔ home soft hop, history, focus and head ${label} ${width}x${height}`)
  }

  for (const [label, width, height] of sizes) {
    const page = await browser.newPage({ viewport: { width, height } })
    await enableIos27ModeBeforeNavigation(page)
    let releaseTopicResponse
    let topicRequestStartedResolve
    let topicRequestCount = 0
    const topicRequestStarted = new Promise((resolve) => { topicRequestStartedResolve = resolve })
    await page.route('**/topic/1*', async (route) => {
      topicRequestCount += 1
      if (topicRequestCount === 1) {
        topicRequestStartedResolve?.()
        await new Promise((resolve) => { releaseTopicResponse = resolve })
      }
      await route.fulfill({ status: 200, contentType: 'text/html', body: topicFixture })
    })
    await page.route('https://linux.sb/', (route) =>
      route.fulfill({ status: 200, contentType: 'text/html', body: homeRouteFixture }),
    )
    await page.goto('https://linux.sb/', { waitUntil: 'domcontentloaded' })
    await page.addScriptTag({ content: baseCode })
    await enableExperimentalTopicSpa(page)
    await page.addScriptTag({ content: skinCode })
    await page.locator('.topic-toolbar').waitFor()
    await page.waitForTimeout(250)
    await page.evaluate(() => {
      const spacer = document.createElement('div')
      spacer.id = 'ios27-topic-scroll-spacer'
      spacer.setAttribute('aria-hidden', 'true')
      spacer.style.cssText = 'height:1000px;pointer-events:none'
      document.body.append(spacer)
      window.scrollTo(0, 280)
      window.__ios27TopicHomeScrollY = window.scrollY
      window.__ios27TopicShell = document.getElementById('lsb-shell')
      window.__ios27TopicStatus = document.querySelector('[data-surface="top-status"]')
      window.__ios27TopicTools = document.querySelector('[data-surface="tool-capsule"]')
      window.__ios27TopicOutlet = document.querySelector('main.wrap')
      window.__ios27TopicOldList = document.querySelector('.post-list')
    })
    await page.waitForFunction(() => window.__ios27TopicHomeScrollY > 0 && window.scrollY === window.__ios27TopicHomeScrollY)
    await page.evaluate(() => {
      const link = document.createElement('a')
      link.href = '/topic/1'
      link.textContent = '去帖子'
      link.setAttribute('data-ios27-topic-soft-hop', '')
      document.querySelector('main.wrap')?.append(link)
      link.click()
    })
    await topicRequestStarted
    await page.waitForFunction(() => document.getElementById('lsb-shell-progress')?.dataset.phase === 'loading')
    const softTopic = await page.evaluate(() => {
      const progress = document.getElementById('lsb-shell-progress')
      const progressStyle = progress ? getComputedStyle(progress) : null
      const progressRect = progress?.getBoundingClientRect()
      const status = document.querySelector('[data-surface="top-status"]')
      const tools = document.querySelector('[data-surface="tool-capsule"]')
      const outlet = document.querySelector('main.wrap')
      const nativeHeader = document.querySelector('body > .top')
      const nativeSidebar = document.querySelector('aside.sidebar:not(#mobile-menu-drawer):not(.mobile-menu-drawer)')
      return {
        phase: document.documentElement.dataset.lsbRoutePhase || '',
        progressPhase: progress?.dataset.phase || '',
        progressHeight: progressStyle?.height || '',
        progressTop: progressRect?.top ?? null,
        progressPointerEvents: progressStyle?.pointerEvents || '',
        transitionCount: document.querySelectorAll('#lsb-shell-route-transition').length,
        shellStable: document.getElementById('lsb-shell') === window.__ios27TopicShell,
        statusStable: status === window.__ios27TopicStatus,
        toolsStable: tools === window.__ios27TopicTools,
        outletStable: outlet === window.__ios27TopicOutlet,
        nativeHeaderDisplay: nativeHeader ? getComputedStyle(nativeHeader).display : 'missing',
        nativeSidebarDisplay: nativeSidebar ? getComputedStyle(nativeSidebar).display : 'missing',
        oldListConnected: !!window.__ios27TopicOldList?.isConnected,
        busy: outlet?.getAttribute('aria-busy') || '',
        historyUrl: history.state?.lsbShellSpaUrl || '',
        historyY: history.state?.lsbScrollY ?? null,
        currentY: window.scrollY,
        routeChromePending: document.documentElement.classList.contains('lsb-canvas-route-pending'),
        shield: !!document.getElementById('lsb-shell-route-shield'),
      }
    })
    assert.equal(softTopic.phase, 'fetching', `${label}: topic soft hop did not enter fetching phase`)
    assert.equal(softTopic.progressPhase, 'loading', `${label}: delayed topic request did not show the progress line`)
    assert.equal(softTopic.progressHeight, '3px', `${label}: topic progress line is not 3px high`)
    assert.equal(softTopic.progressTop, 0, `${label}: topic progress line is not fixed to the viewport top`)
    assert.equal(softTopic.progressPointerEvents, 'none', `${label}: topic progress line intercepts pointer events`)
    assert.equal(softTopic.transitionCount, 0, `${label}: topic body transition overlay is still mounted`)
    assert.equal(softTopic.shellStable, true, `${label}: canvas shell was rebuilt during topic soft hop`)
    assert.equal(softTopic.statusStable, true, `${label}: top status node was rebuilt during topic soft hop`)
    assert.equal(softTopic.toolsStable, true, `${label}: tool capsule was rebuilt during topic soft hop`)
    assert.equal(softTopic.outletStable, true, `${label}: body outlet was replaced before the topic response`)
    assert.equal(softTopic.nativeHeaderDisplay, 'none', `${label}: native header flashed during topic soft hop`)
    assert.equal(softTopic.nativeSidebarDisplay, 'none', `${label}: native sidebar flashed during topic soft hop`)
    assert.equal(softTopic.oldListConnected, true, `${label}: old home content disappeared before topic response`)
    assert.equal(softTopic.busy, 'true', `${label}: topic outlet is not marked busy during navigation`)
    assert.equal(softTopic.historyUrl, 'https://linux.sb/', `${label}: topic soft hop did not record the current history URL`)
    assert.equal(softTopic.historyY, softTopic.currentY, `${label}: topic soft hop did not save the home scroll position`)
    assert.equal(softTopic.routeChromePending, true, `${label}: page-level route hiding state is missing`)
    assert.equal(softTopic.shield, false, `${label}: topic soft hop created a full-screen shield`)
    await page.screenshot({ path: join(outputDir, `topic-soft-hop-${label}.png`), fullPage: false })
    releaseTopicResponse?.()
    await waitForSpaSettled(page, '/topic/1')
    await page.waitForFunction(() => document.activeElement === document.querySelector('main.wrap'))
    await page.locator('.topic-post-list').waitFor()
    const submitted = await page.evaluate(() => {
      const outlet = document.querySelector('main.wrap')
      return {
        href: location.pathname + location.search,
        title: document.querySelector('.post-content-title')?.textContent?.trim() || '',
        documentTitle: document.title,
        canonical: document.querySelector('link[rel="canonical"]')?.href || '',
        description: document.querySelector('meta[name="description"]')?.content || '',
        ogTitle: document.querySelector('meta[property="og:title"]')?.content || '',
        shellStable: document.getElementById('lsb-shell') === window.__ios27TopicShell,
        statusStable: document.querySelector('[data-surface="top-status"]') === window.__ios27TopicStatus,
        toolsStable: document.querySelector('[data-surface="tool-capsule"]') === window.__ios27TopicTools,
        outletStable: outlet === window.__ios27TopicOutlet,
        entered: outlet?.hasAttribute('data-lsb-route-content-enter') || false,
        animationName: outlet ? getComputedStyle(outlet).animationName : '',
        animationDuration: outlet ? getComputedStyle(outlet).animationDuration : '',
        focused: document.activeElement === outlet,
        tabindex: outlet?.getAttribute('tabindex') || '',
        announcement: document.getElementById('lsb-route-announcer')?.textContent || '',
        replyForm: document.querySelector('.ajax-reply-form') !== null,
        favorite: document.querySelector('.topic-favorites-action .fav-btn') !== null,
        donate: document.querySelector('[data-donate-btn]') !== null,
        coin: document.querySelector('[data-like-coin-action]') !== null,
      }
    })
    assert.equal(submitted.href, '/topic/1', `${label}: topic URL did not settle`)
    assert.match(submitted.title, /LINUX SB上线/, `${label}: topic title did not settle`)
    assert.equal(submitted.canonical, 'https://linux.sb/topic/1', `${label}: topic canonical URL did not update`)
    assert.equal(submitted.description, '打造更新的理想型社区', `${label}: topic description did not update`)
    assert.equal(submitted.ogTitle, '', `${label}: stale Open Graph title was not cleared when absent from the response`)
    assert.equal(submitted.shellStable, true, `${label}: canvas shell changed after topic commit`)
    assert.equal(submitted.statusStable, true, `${label}: top status node changed after topic commit`)
    assert.equal(submitted.toolsStable, true, `${label}: tool capsule changed after topic commit`)
    assert.equal(submitted.outletStable, true, `${label}: body outlet node changed after topic commit`)
    assert.equal(submitted.entered, true, `${label}: topic body has no enter state`)
    assert.equal(submitted.animationName, 'lsb-route-content-in', `${label}: topic body enter animation is missing`)
    assert.equal(submitted.animationDuration, '0.18s', `${label}: topic body enter animation is not 180ms`)
    assert.equal(submitted.focused, true, `${label}: user topic navigation did not focus the body outlet`)
    assert.equal(submitted.tabindex, '-1', `${label}: topic body outlet cannot receive programmatic focus`)
    assert.equal(submitted.announcement, `已打开：${submitted.documentTitle}`, `${label}: live region did not announce the topic title`)
    assert.equal(submitted.replyForm, true, `${label}: reply form disappeared after topic submission`)
    assert.equal(submitted.favorite, true, `${label}: favorite action disappeared after topic submission`)
    assert.equal(submitted.donate || submitted.coin, true, `${label}: donate/coin action disappeared after topic submission`)
    await page.screenshot({ path: join(outputDir, `topic-soft-hop-${label}-settled.png`), fullPage: false })

    let pagination = page.locator('.pagination-bar a[href*="p=2"]').first()
    if (await pagination.count() === 0) {
      await page.evaluate(() => {
        const nav = document.createElement('nav')
        nav.className = 'pagination-bar'
        nav.innerHTML = '<a href="/topic/1?p=2">下一页</a>'
        document.querySelector('main.wrap')?.append(nav)
      })
      pagination = page.locator('.pagination-bar a[href*="p=2"]').first()
    }
    await pagination.click()
    await page.waitForURL('**/topic/1?p=2')
    await waitForSpaSettled(page, '/topic/1?p=2')
    assert.equal(await page.locator('.topic-post-list').count(), 1, `${label}: topic pagination left the topic route`)
    assert.equal(await page.locator('.ajax-reply-form').count(), 1, `${label}: topic pagination lost reply interaction`)
    assert.equal(await page.locator('.topic-favorites-action .fav-btn').count(), 1, `${label}: topic pagination lost favorite interaction`)

    await page.evaluate(() => {
      const marker = document.createElement('button')
      marker.id = 'ios27-topic-history-focus-guard'
      marker.textContent = 'history focus guard'
      marker.style.cssText = 'position:fixed;left:0;top:0;width:1px;height:1px;opacity:0;pointer-events:none'
      document.body.append(marker)
      marker.focus()
      window.__ios27TopicHistoryFocusGuard = marker
      window.__ios27TopicAnnouncementBeforeHistory = document.getElementById('lsb-route-announcer')?.textContent || ''
    })
    await page.goBack()
    await page.waitForURL('**/topic/1')
    await waitForSpaSettled(page, '/topic/1')
    const topicBack = await page.evaluate(() => ({
      href: location.pathname + location.search,
      shellStable: document.getElementById('lsb-shell') === window.__ios27TopicShell,
      statusStable: document.querySelector('[data-surface="top-status"]') === window.__ios27TopicStatus,
      toolsStable: document.querySelector('[data-surface="tool-capsule"]') === window.__ios27TopicTools,
      topic: !!document.querySelector('.topic-post-list'),
      focusPreserved: document.activeElement === window.__ios27TopicHistoryFocusGuard,
      announcement: document.getElementById('lsb-route-announcer')?.textContent || '',
      announcementBefore: window.__ios27TopicAnnouncementBeforeHistory,
    }))
    assert.deepEqual(topicBack, {
      href: '/topic/1',
      shellStable: true,
      statusStable: true,
      toolsStable: true,
      topic: true,
      focusPreserved: true,
      announcement: topicBack.announcementBefore,
      announcementBefore: topicBack.announcementBefore,
    }, `${label}: topic back navigation did not restore the canvas without stealing focus`)

    await page.goBack()
    await page.waitForURL('https://linux.sb/')
    await waitForSpaSettled(page, '/')
    const homeBack = await page.evaluate(() => ({
      href: location.pathname + location.search,
      scrollY: window.scrollY,
      historyY: history.state?.lsbScrollY ?? null,
      expectedScrollY: window.__ios27TopicHomeScrollY,
      shellStable: document.getElementById('lsb-shell') === window.__ios27TopicShell,
      statusStable: document.querySelector('[data-surface="top-status"]') === window.__ios27TopicStatus,
      toolsStable: document.querySelector('[data-surface="tool-capsule"]') === window.__ios27TopicTools,
      list: !!document.querySelector('.post-list'),
      focusPreserved: document.activeElement === window.__ios27TopicHistoryFocusGuard,
      announcement: document.getElementById('lsb-route-announcer')?.textContent || '',
      announcementBefore: window.__ios27TopicAnnouncementBeforeHistory,
    }))
    assert.equal(homeBack.href, '/', `${label}: browser back did not restore the list route`)
    assert.equal(homeBack.historyY, homeBack.expectedScrollY, `${label}: browser history scroll state changed during topic back navigation`)
    const topicHomeScrollTolerance = label === 'narrow' ? 8 : 1
    assert.ok(
      Math.abs(homeBack.scrollY - homeBack.expectedScrollY) <= topicHomeScrollTolerance,
      `${label}: browser back did not restore topic home scroll (actual ${homeBack.scrollY}, expected ${homeBack.expectedScrollY}, tolerance ${topicHomeScrollTolerance}px)`,
    )
    assert.equal(homeBack.shellStable, true, `${label}: browser back rebuilt the canvas shell`)
    assert.equal(homeBack.statusStable, true, `${label}: browser back rebuilt the top status node`)
    assert.equal(homeBack.toolsStable, true, `${label}: browser back rebuilt the tool capsule`)
    assert.equal(homeBack.list, true, `${label}: browser back did not restore the list content`)
    assert.equal(homeBack.focusPreserved, true, `${label}: history back stole focus`)
    assert.equal(homeBack.announcement, homeBack.announcementBefore, `${label}: history back announced a route`)
    await page.screenshot({ path: join(outputDir, `topic-back-${label}.png`), fullPage: false })

    await page.goForward()
    await page.waitForURL('**/topic/1')
    await waitForSpaSettled(page, '/topic/1')
    assert.equal(await page.evaluate(() => document.activeElement === window.__ios27TopicHistoryFocusGuard), true, `${label}: browser forward to topic stole focus`)
    await page.goForward()
    await page.waitForURL('**/topic/1?p=2')
    await waitForSpaSettled(page, '/topic/1?p=2')
    assert.equal(await page.locator('.topic-post-list').count(), 1, `${label}: browser forward did not restore the paginated topic`)
    assert.equal(await page.evaluate(() => document.activeElement === window.__ios27TopicHistoryFocusGuard), true, `${label}: browser forward to pagination stole focus`)
    await page.close()
    console.log(`✔ topic soft hop, back/forward and history scroll ${label} ${width}x${height}`)
  }

  for (const [label, width, height] of sizes) {
    const page = await browser.newPage({ viewport: { width, height } })
    await enableIos27ModeBeforeNavigation(page)
    const remoteTopicWithUninitializedAd = topicFixture.replace(
      /<\/main>/i,
      `<aside class="sidebar"><section class="sidebar-card sidebar-promotions-card">
        <a href="#remote-reward" data-sidebar-promotions-ad-link="1">领取奖励</a>
        <form data-sidebar-promotions-click-form hidden></form>
      </section></aside></main>`,
    )
    await page.route('https://linux.sb/topic/1', (route) =>
      route.fulfill({ status: 200, contentType: 'text/html', body: remoteTopicWithUninitializedAd }),
    )
    await page.route('https://linux.sb/', (route) =>
      route.fulfill({ status: 200, contentType: 'text/html', body: homeFixture }),
    )
    await page.goto('https://linux.sb/', { waitUntil: 'domcontentloaded' })
    await page.evaluate(() => {
      const side = document.querySelector('aside.sidebar:not(#mobile-menu-drawer):not(.mobile-menu-drawer)')
      if (!side) throw new Error('native sidebar missing')
      const hot = side.querySelector('.daily-hot-topics-card') || document.createElement('section')
      hot.className = 'sidebar-card daily-hot-topics-card'
      hot.textContent = '每日热帖：原生首页节点'
      const promotion = document.createElement('section')
      promotion.className = 'sidebar-card sidebar-promotions-card'
      promotion.innerHTML = `<a href="#reward" data-sidebar-promotions-ad-link="1"
        style="--sidebar-promotion-text:#ffffff;--sidebar-promotion-background:#2c72ce">领取奖励</a>
        <form data-sidebar-promotions-click-form hidden></form>`
      const reward = promotion.querySelector('[data-sidebar-promotions-ad-link]')
      window.__ios27SidebarClicks = 0
      reward.addEventListener('click', (event) => {
        event.preventDefault()
        window.__ios27SidebarClicks += 1
      })
      side.append(hot, promotion)
      window.__ios27SidebarCards = { hot, promotion, reward }
    })
    await page.addScriptTag({ content: baseCode })
    await enableExperimentalTopicSpa(page)
    await page.addScriptTag({ content: skinCode })
    await page.locator('.topic-toolbar').waitFor()
    const siteHostSelector = label === 'wide'
      ? '[data-surface="site-status"] [data-canvas-site-status-body]'
      : '[data-surface="site-card"] [data-canvas-site-sidebar]'
    await page.waitForFunction((selector) => {
      const cards = window.__ios27SidebarCards
      return !!cards?.promotion && !!document.querySelector(selector)?.contains(cards.promotion)
    }, siteHostSelector)
    await page.evaluate(() => {
      const link = document.createElement('a')
      link.href = '/topic/1'
      link.textContent = '进入帖子并保留原生站点卡片'
      document.querySelector('main.wrap')?.append(link)
      link.click()
    })
    await waitForSpaSettled(page, '/topic/1')
    await page.locator('.topic-post-list').waitFor()
    await page.locator('[data-surface="tool-capsule"] [data-canvas-open="tool-sheet"]').click()
    await page.locator('[data-tool-action="site-card"]').click()
    await page.waitForFunction((selector) => {
      const cards = window.__ios27SidebarCards
      return !!cards?.promotion && !!document.querySelector(selector)?.contains(cards.promotion)
    }, siteHostSelector)
    const topicCards = await page.evaluate((selector) => {
      const cards = window.__ios27SidebarCards
      const host = document.querySelector(selector)
      const promotion = host?.querySelector('.sidebar-promotions-card')
      const reward = cards?.reward
      return {
        hotSame: host?.contains(cards?.hot),
        promotionSame: promotion === cards?.promotion,
        textColor: reward?.style.getPropertyValue('--sidebar-promotion-text') || '',
        background: reward?.style.getPropertyValue('--sidebar-promotion-background') || '',
        form: !!promotion?.querySelector('[data-sidebar-promotions-click-form]'),
      }
    }, siteHostSelector)
    assert.equal(topicCards.hotSame, true, `${label}: topic soft hop replaced the native daily-hot node`)
    assert.equal(topicCards.promotionSame, true, `${label}: topic soft hop used the uninitialized ad copy`)
    assert.equal(topicCards.textColor, '#ffffff', `${label}: topic ad lost its text color variable`)
    assert.equal(topicCards.background, '#2c72ce', `${label}: topic ad lost its background color variable`)
    assert.equal(topicCards.form, true, `${label}: topic ad lost its native reward form`)
    await page.evaluate(() => window.__ios27SidebarCards.reward.click())
    assert.equal(await page.evaluate(() => window.__ios27SidebarClicks), 1, `${label}: topic ad reward listener was lost`)
    const backdrop = page.locator('[data-canvas-backdrop]')
    if (await backdrop.isVisible()) await backdrop.click({ force: true })
    await page.evaluate(() => document.querySelector('[data-canvas-home]')?.click())
    await waitForSpaSettled(page, '/')
    await page.waitForFunction((selector) => {
      const cards = window.__ios27SidebarCards
      const host = document.querySelector(selector)
      return !!cards?.hot && !!cards?.promotion && host?.contains(cards.hot) && host.contains(cards.promotion)
    }, siteHostSelector)
    assert.equal(await page.evaluate((selector) => {
      const cards = window.__ios27SidebarCards
      const host = document.querySelector(selector)
      return host?.contains(cards.hot)
        && host.contains(cards.promotion)
    }, siteHostSelector), true, `${label}: returning home did not restore the original site cards`)
    await page.screenshot({ path: join(outputDir, `ios27-sidebar-soft-hop-${label}.png`), fullPage: false })
    await page.close()
    console.log(`✔ persistent site cards and ad lifecycle ${label} ${width}x${height}`)
  }

  const transactionPage = await browser.newPage({ viewport: { width: 1440, height: 1000 } })
  await enableIos27ModeBeforeNavigation(transactionPage)
  await transactionPage.emulateMedia({ reducedMotion: 'reduce' })
  let releaseOldTopic
  let oldTopicRequestStarted
  const oldTopicStarted = new Promise((resolve) => { oldTopicRequestStarted = resolve })
  const topicTwoFixture = topicFixture.replaceAll('/topic/1', '/topic/2').replaceAll('LINUX SB上线', '第二主题')
  await transactionPage.route('https://linux.sb/topic/1', async (route) => {
    oldTopicRequestStarted?.()
    await new Promise((resolve) => { releaseOldTopic = resolve })
    await route.fulfill({ status: 200, contentType: 'text/html', body: topicFixture })
  })
  await transactionPage.route('https://linux.sb/topic/2*', (route) =>
    route.fulfill({ status: 200, contentType: 'text/html', body: topicTwoFixture }),
  )
  await transactionPage.route('https://linux.sb/', (route) =>
    route.fulfill({ status: 200, contentType: 'text/html', body: homeFixture }),
  )
  await transactionPage.goto('https://linux.sb/', { waitUntil: 'domcontentloaded' })
  await transactionPage.addScriptTag({ content: baseCode })
  await enableExperimentalTopicSpa(transactionPage)
  await transactionPage.addScriptTag({ content: skinCode })
  await transactionPage.locator('.topic-toolbar').waitFor()
  await transactionPage.evaluate(() => {
    const first = document.createElement('a')
    first.id = 'keyboard-topic-link'
    first.href = '/topic/1'
    first.textContent = '键盘打开帖子'
    const second = document.createElement('a')
    second.id = 'rapid-topic-link'
    second.href = '/topic/2'
    second.textContent = '快速打开第二帖'
    document.querySelector('main.wrap')?.append(first, second)
    window.__transactionShell = document.getElementById('lsb-shell')
    window.__transactionOldList = document.querySelector('ul.post-list')
  })
  await transactionPage.locator('#keyboard-topic-link').focus()
  await transactionPage.keyboard.press('Enter')
  await oldTopicStarted
  await transactionPage.waitForFunction(() => document.getElementById('lsb-shell-progress')?.dataset.phase === 'loading')
  const reducedMotionState = await transactionPage.evaluate(() => {
    const progress = document.getElementById('lsb-shell-progress')
    const bar = progress?.querySelector('[data-lsb-shell-progress-bar]')
    return {
      phase: document.documentElement.dataset.lsbRoutePhase || '',
      progressHeight: progress ? getComputedStyle(progress).height : '',
      progressPointerEvents: progress ? getComputedStyle(progress).pointerEvents : '',
      progressTransition: progress ? getComputedStyle(progress).transitionDuration : '',
      barTransition: bar ? getComputedStyle(bar).transitionDuration : '',
      transitionCount: document.querySelectorAll('#lsb-shell-route-transition').length,
      oldListConnected: !!window.__transactionOldList?.isConnected,
    }
  })
  assert.equal(reducedMotionState.phase, 'fetching', 'keyboard Enter should begin the soft route')
  assert.equal(reducedMotionState.progressHeight, '3px', 'reduced-motion progress line should remain 3px high')
  assert.equal(reducedMotionState.progressPointerEvents, 'none', 'progress line should not intercept pointer events')
  assert.equal(reducedMotionState.progressTransition, '0s', 'reduced motion should remove progress transitions')
  assert.equal(reducedMotionState.barTransition, '0s', 'reduced motion should remove progress-bar transitions')
  assert.equal(reducedMotionState.transitionCount, 0, 'reduced-motion route should not mount a body overlay')
  assert.equal(reducedMotionState.oldListConnected, true, 'old page should remain during the delayed request')
  await transactionPage.locator('#rapid-topic-link').click()
  await transactionPage.waitForURL('https://linux.sb/topic/2')
  await waitForSpaSettled(transactionPage, '/topic/2')
  const reducedCommit = await transactionPage.evaluate(() => {
    const outlet = document.querySelector('main.wrap')
    return {
      path: location.pathname,
      title: document.title,
      animationName: outlet ? getComputedStyle(outlet).animationName : '',
      animationDuration: outlet ? getComputedStyle(outlet).animationDuration : '',
      focused: document.activeElement === outlet,
      announcement: document.getElementById('lsb-route-announcer')?.textContent || '',
    }
  })
  assert.equal(reducedCommit.path, '/topic/2', 'rapid second navigation should commit its target')
  assert.match(reducedCommit.title, /第二主题/, 'rapid topic response should update the page title')
  assert.equal(reducedCommit.animationName, 'none', 'reduced motion should disable the body enter animation')
  assert.equal(reducedCommit.animationDuration, '0s', 'reduced motion should set the body animation duration to zero')
  assert.equal(reducedCommit.focused, true, 'user navigation should focus the committed body')
  assert.equal(reducedCommit.announcement, `已打开：${reducedCommit.title}`, 'user navigation should announce the committed title')
  releaseOldTopic?.()
  await transactionPage.waitForTimeout(80)
  assert.equal(await transactionPage.evaluate(() => location.pathname), '/topic/2', 'late response must not replace the newest topic')
  assert.match(await transactionPage.locator('.post-content-title').textContent(), /第二主题/)
  assert.equal(await transactionPage.evaluate(() => document.getElementById('lsb-shell') === window.__transactionShell), true)

  await transactionPage.evaluate(() => {
    const calls = []
    const native = HTMLElement.prototype.scrollIntoView
    HTMLElement.prototype.scrollIntoView = function (options) {
      calls.push({ id: this.id, floor: this.getAttribute('data-floor'), block: options?.block || '' })
      return native?.call(this, options)
    }
    window.__topicTargetCalls = calls
    const reply = document.createElement('a')
    reply.id = 'replyid-target-link'
    reply.href = '/topic/2?replyid=24&floor=2'
    reply.textContent = '定位回帖'
    const floor = document.createElement('a')
    floor.id = 'floor-target-link'
    floor.href = '/topic/2?floor=18'
    floor.textContent = '定位楼层'
    document.querySelector('main.wrap')?.append(reply, floor)
  })
  await transactionPage.locator('#replyid-target-link').click()
  await transactionPage.waitForURL('https://linux.sb/topic/2?replyid=24&floor=2')
  await transactionPage.waitForFunction(() => window.__topicTargetCalls?.some((entry) => entry.id === 'post-24' && entry.block === 'center'))
  await transactionPage.evaluate(() => {
    const floor = document.createElement('a')
    floor.id = 'floor-target-link'
    floor.href = '/topic/2?floor=18'
    floor.textContent = '定位楼层'
    document.querySelector('main.wrap')?.append(floor)
  })
  await transactionPage.locator('#floor-target-link').click()
  await transactionPage.waitForURL('https://linux.sb/topic/2?floor=18')
  await transactionPage.waitForFunction(() => window.__topicTargetCalls?.some((entry) => entry.floor === '18' && entry.block === 'center'))
  await transactionPage.close()
  console.log('✔ keyboard, reduced motion, rapid navigation, replyid and floor targeting')

  const failedFetchPage = await browser.newPage({ viewport: { width: 1440, height: 1000 } })
  await enableIos27ModeBeforeNavigation(failedFetchPage)
  const failedFetchKinds = []
  await failedFetchPage.route('https://linux.sb/topic/1', async (route) => {
    const kind = route.request().resourceType()
    failedFetchKinds.push(kind)
    if (kind === 'document') {
      await route.fulfill({ status: 200, contentType: 'text/html', body: topicFixture })
    } else {
      await route.fulfill({ status: 500, contentType: 'text/plain', body: 'temporary failure' })
    }
  })
  await failedFetchPage.route('https://linux.sb/', (route) =>
    route.fulfill({ status: 200, contentType: 'text/html', body: homeFixture }),
  )
  await failedFetchPage.goto('https://linux.sb/', { waitUntil: 'domcontentloaded' })
  await failedFetchPage.addScriptTag({ content: baseCode })
  await enableExperimentalTopicSpa(failedFetchPage)
  await failedFetchPage.addScriptTag({ content: skinCode })
  await failedFetchPage.locator('.topic-toolbar').waitFor()
  await failedFetchPage.evaluate(() => {
    const link = document.createElement('a')
    link.href = '/topic/1'
    link.textContent = '错误时原生回退'
    link.id = 'failed-topic-link'
    document.querySelector('main.wrap')?.append(link)
  })
  await failedFetchPage.locator('#failed-topic-link').click()
  await failedFetchPage.waitForURL('https://linux.sb/topic/1')
  await failedFetchPage.locator('.topic-post-list').waitFor()
  assert.ok(failedFetchKinds.includes('fetch'), 'soft route should attempt the in-document request')
  assert.ok(failedFetchKinds.includes('document'), 'failed request should fall back to a native document navigation')
  await failedFetchPage.close()
  console.log('✔ HTTP failure falls back to native topic navigation')

  const redirectServer = createServer((request, response) => {
    if (request.url === '/topic/1') {
      response.writeHead(302, { location: '/profile' })
      response.end()
      return
    }
    if (request.url === '/' || request.url === '/profile') {
      response.writeHead(200, { 'content-type': 'text/html; charset=utf-8' })
      response.end(homeFixture)
      return
    }
    response.writeHead(404)
    response.end('not found')
  })
  await new Promise((resolve) => redirectServer.listen(0, '127.0.0.1', resolve))
  const redirectOrigin = `http://127.0.0.1:${redirectServer.address().port}`
  const redirectedPage = await browser.newPage({ viewport: { width: 1440, height: 1000 } })
  await enableIos27ModeBeforeNavigation(redirectedPage)
  const redirectedRequests = []
  redirectedPage.on('request', (request) => redirectedRequests.push({
    url: request.url(),
    type: request.resourceType(),
  }))
  try {
    await redirectedPage.goto(redirectOrigin, { waitUntil: 'domcontentloaded' })
    await redirectedPage.addScriptTag({ content: baseCode })
    await enableExperimentalTopicSpa(redirectedPage)
    await redirectedPage.addScriptTag({ content: skinCode })
    await redirectedPage.locator('.topic-toolbar').waitFor()
    await redirectedPage.evaluate(() => {
      const link = document.createElement('a')
      link.href = '/topic/1'
      link.textContent = '模拟登录重定向'
      link.id = 'redirect-topic-link'
      document.querySelector('main.wrap')?.append(link)
    })
    await redirectedPage.locator('#redirect-topic-link').click()
    await redirectedPage.waitForURL(`${redirectOrigin}/profile`)
    await redirectedPage.locator('.home-shell').waitFor()
    assert.ok(redirectedRequests.some((request) => request.url === `${redirectOrigin}/topic/1` && request.type === 'fetch'), 'redirect should be observed by the soft request')
    assert.ok(redirectedRequests.some((request) => request.url === `${redirectOrigin}/profile` && request.type === 'document'), 'non-topic redirect should be loaded as a full document')
  } finally {
    await redirectedPage.close()
    await new Promise((resolve) => redirectServer.close(resolve))
  }
  console.log('✔ non-topic redirect falls back to native document navigation')

  const navigationPage = await browser.newPage({ viewport: { width: 1440, height: 1000 } })
  await enableIos27ModeBeforeNavigation(navigationPage)
  await navigationPage.addInitScript(({ code }) => {
    const run = () => {
      if (!document.documentElement || window.__ios27BaseReplay) return
      window.__ios27BaseReplay = true
      ;(0, eval)(code)
    }
    if (document.documentElement) run()
    else {
      const observer = new MutationObserver(() => {
        if (!document.documentElement) return
        observer.disconnect()
        run()
      })
      observer.observe(document, { childList: true, subtree: true })
    }
  }, { code: baseCode })
  await navigationPage.route('https://linux.sb/', (route) =>
    route.fulfill({ status: 200, contentType: 'text/html', body: homeFixture }),
  )
  await navigationPage.route('https://linux.sb/topic/1', (route) =>
    route.fulfill({ status: 200, contentType: 'text/html', body: topicFixture }),
  )
  const softTopicRequestPromise = navigationPage.waitForRequest((request) =>
    request.url() === 'https://linux.sb/topic/1' && request.resourceType() === 'fetch',
  )
  await navigationPage.goto('https://linux.sb/', { waitUntil: 'domcontentloaded' })
  await navigationPage.addScriptTag({ content: skinCode })
  const navigationState = await navigationPage.evaluate(() => {
    const link = document.createElement('a')
    link.href = 'https://linux.sb/topic/1'
    link.textContent = '去帖子'
    document.body.append(link)
    let targetSawAllowed = false
    link.addEventListener('click', (event) => {
      targetSawAllowed = !event.defaultPrevented
      event.preventDefault()
    })
    const allowed = link.dispatchEvent(new MouseEvent('click', { bubbles: true, cancelable: true, button: 0 }))
    return {
      allowed,
      targetSawAllowed,
      phase: document.documentElement.dataset.lsbRoutePhase || '',
      href: location.pathname + location.search,
    }
  })
  assert.equal(navigationState.allowed, false, 'skin should intercept an enabled same-origin topic soft navigation')
  assert.equal(navigationState.targetSawAllowed, false, 'topic navigation should be prevented before site click handlers')
  assert.equal(navigationState.href, '/', 'intercepted topic navigation should keep the old URL until the response commits')
  const softTopicRequest = await softTopicRequestPromise
  assert.equal(softTopicRequest.resourceType(), 'fetch', 'topic soft navigation should use an in-document request')
  await waitForSpaSettled(navigationPage, '/topic/1')
  assert.equal(await navigationPage.locator('.topic-post-list').count(), 1, 'intercepted topic navigation should commit its topic body')

  await navigationPage.goto('https://linux.sb/topic/1', { waitUntil: 'domcontentloaded' })
  const firstPaint = await navigationPage.evaluate(() => {
    const header = document.querySelector('body > .top')
    const sidebar = document.querySelector('aside.sidebar:not(#mobile-menu-drawer):not(.mobile-menu-drawer)')
    return {
      boot: document.documentElement.classList.contains('lsb-canvas-boot'),
      frame: !!document.getElementById('lsb-shell-boot-frame'),
      headerDisplay: header ? getComputedStyle(header).display : 'missing',
      sidebarDisplay: sidebar ? getComputedStyle(sidebar).display : 'missing',
    }
  })
  assert.equal(firstPaint.boot, true, 'topic first paint did not enter canvas boot state')
  assert.equal(firstPaint.frame, true, 'topic first paint is missing the canvas boot frame')
  assert.equal(firstPaint.headerDisplay, 'none', 'native topic header was visible before the skin mounted')
  assert.equal(firstPaint.sidebarDisplay, 'none', 'native topic sidebar was visible before the skin mounted')
  await navigationPage.close()
  console.log('✔ topic navigation cloak and first-paint cover')

  const videoPage = await browser.newPage({ viewport: { width: 1440, height: 1000 } })
  await enableIos27ModeBeforeNavigation(videoPage)
  await videoPage.addInitScript(({ state }) => {
    localStorage.setItem('lsb_base:skin:canvas-state:v2', JSON.stringify(state))
    HTMLMediaElement.prototype.load = () => {}
    HTMLMediaElement.prototype.play = () => Promise.resolve()
    HTMLMediaElement.prototype.pause = () => {}
  }, {
    state: {
      version: 2,
      enabled: true,
      global: { appearance: { background: 'static' } },
      sites: { 'https://linux.sb': { appearance: { background: 'video', backgroundVideoUrl: 'https://cdn.example/home.mp4' } } },
    },
  })
  await videoPage.route('https://linux.sb/', (route) =>
    route.fulfill({ status: 200, contentType: 'text/html', body: homeFixture }),
  )
  await videoPage.goto('https://linux.sb/', { waitUntil: 'domcontentloaded' })
  await videoPage.addScriptTag({ content: baseCode })
  await videoPage.addScriptTag({ content: skinCode })
  await videoPage.locator('[data-lsb-shell-video]').waitFor()
  await videoPage.waitForTimeout(100)
  const videoLayer = await videoPage.evaluate(() => {
    const video = document.querySelector('[data-lsb-shell-video]')
    const post = document.querySelector('.post-item')
    const rect = post?.getBoundingClientRect()
    const hit = rect ? document.elementFromPoint(rect.left + rect.width / 2, rect.top + rect.height / 2) : null
    return {
      parent: video?.parentElement?.tagName || '',
      layer: video?.getAttribute('data-lsb-shell-video-layer') || '',
      position: video ? getComputedStyle(video).position : '',
      zIndex: video ? getComputedStyle(video).zIndex : '',
      pointerEvents: video ? getComputedStyle(video).pointerEvents : '',
      hitTag: hit?.tagName || '',
      hitClass: typeof hit?.className === 'string' ? hit.className : '',
    }
  })
  assert.deepEqual(videoLayer, {
    parent: 'BODY',
    layer: 'canvas',
    position: 'fixed',
    zIndex: '0',
    pointerEvents: 'none',
    hitTag: 'DIV',
    hitClass: 'post-body',
  }, 'canvas video must stay behind homepage content')
  await videoPage.screenshot({ path: join(outputDir, 'ios27-home-video-layer.png'), fullPage: false })
  await videoPage.close()
  console.log('✔ home video background stays behind content 1440x1000')

  for (const [label, width, height] of sizes) {
    const page = await browser.newPage({ viewport: { width, height } })
    await enableIos27ModeBeforeNavigation(page)
    await page.route('https://linux.sb/topic/1', (route) =>
      route.fulfill({ status: 200, contentType: 'text/html', body: topicFixture }),
    )
    await page.goto('https://linux.sb/topic/1', { waitUntil: 'domcontentloaded' })
    await page.addScriptTag({ content: baseCode })
    await page.addScriptTag({ content: skinCode })
    await page.locator('[data-surface="tool-capsule"]').waitFor()
    await page.locator('[data-surface="tool-capsule"] [data-canvas-open="tool-sheet"]').click()
    await page.locator('[data-tool-action="site-card"]').click()
    const siteCard = page.locator('[data-surface="site-card"]')
    const siteSurface = label === 'wide' ? page.locator('[data-surface="site-status"]') : siteCard
    await siteSurface.waitFor({ state: 'visible' })
    if (label === 'wide') assert.equal(await siteCard.isHidden(), true, `${label}: wide site sheet should stay closed`)
    const sidebarState = await siteSurface.evaluate((card, wide) => {
      const rows = [...card.querySelectorAll(`${wide ? '[data-canvas-site-status-body]' : '[data-canvas-site-sidebar]'} > .sidebar-card`)]
      return {
        count: rows.length,
        bodyDirection: wide ? getComputedStyle(card.querySelector('[data-canvas-site-status-body]')).flexDirection : '',
        bodyRect: wide ? (() => {
          const rect = card.querySelector('[data-canvas-site-status-body]')?.getBoundingClientRect()
          return rect ? { left: rect.left, right: rect.right, top: rect.top, bottom: rect.bottom } : null
        })() : null,
        rowRects: wide ? rows.map((row) => {
          const rect = row.getBoundingClientRect()
          return { left: rect.left, right: rect.right, top: rect.top, bottom: rect.bottom }
        }) : [],
        flexShrink: rows.map((row) => getComputedStyle(row).flexShrink),
        overflow: rows.map((row) => getComputedStyle(row).overflow),
        maxHeight: rows.map((row) => getComputedStyle(row).maxHeight),
        heights: rows.map((row) => ({ client: row.clientHeight, scroll: row.scrollHeight })),
      }
    }, label === 'wide')
    assert.ok(sidebarState.count >= 2, `${label}: site information cards did not mount`)
    assert.ok(sidebarState.flexShrink.every((value) => value === '0'), `${label}: site information card was flex-shrunk`)
    assert.ok(sidebarState.overflow.every((value) => value === 'visible'), `${label}: site information card content is clipped`)
    assert.ok(sidebarState.maxHeight.every((value) => value === 'none'), `${label}: site information card keeps a max-height clamp`)
    assert.ok(sidebarState.heights.every(({ client, scroll }) => client >= scroll), `${label}: site information card content is folded`)
    if (label === 'wide') {
      const statusRect = await page.locator('[data-surface="top-status"]').boundingBox()
      const siteRect = await siteSurface.boundingBox()
      assert.ok(statusRect, `${label}: top status bar is missing`)
      assert.ok(siteRect, `${label}: independent site status bar is missing`)
      assert.ok(Math.abs((statusRect.x + statusRect.width / 2) - width / 2) <= 20, `${label}: top status bar drifted from the central reading area`)
      assert.ok(Math.abs(siteRect.height - statusRect.height) <= 1, `${label}: independent site bar height differs from status bar`)
      assert.ok(siteRect.x >= statusRect.x + statusRect.width, `${label}: independent site bar overlaps the centered status bar`)
      assert.equal(await page.locator('[data-surface="top-status"] [data-canvas-site-status-host]').count(), 0, `${label}: site bar is nested in top status`)
      assert.equal(await siteSurface.locator('[data-canvas-site-status-host]').count(), 1, `${label}: independent site bar host is missing`)
      assert.equal(sidebarState.bodyDirection, 'column', `${label}: site information cards are not stacked vertically`)
      assert.ok(sidebarState.bodyRect, `${label}: expanded site information body is missing`)
      assert.ok(sidebarState.rowRects.every(({ left, right }) => left >= sidebarState.bodyRect.left && right <= sidebarState.bodyRect.right), `${label}: native site cards overflow the expanded body horizontally`)
    }
    await page.screenshot({ path: join(outputDir, `ios27-site-card-${label}.png`), fullPage: false })
    await page.close()
    console.log(`✔ site-card ${label} ${width}x${height}`)
  }

  const identity = await browser.newPage({ viewport: { width: 390, height: 900 } })
  await enableIos27ModeBeforeNavigation(identity)
  await identity.route('https://linux.sb/identity_center', (route) =>
    route.fulfill({ status: 200, contentType: 'text/html', body: homeFixture }),
  )
  await identity.goto('https://linux.sb/identity_center', { waitUntil: 'domcontentloaded' })
  await identity.addScriptTag({ content: baseCode })
  await identity.addScriptTag({ content: skinCode })
  await identity.waitForTimeout(250)
  const identityTitle = await identity.evaluate(() => {
    const title = document.querySelector('[data-canvas-status-title]')
    return { text: title?.textContent?.trim(), width: title?.getBoundingClientRect().width ?? 0, scrollWidth: title?.scrollWidth ?? 0 }
  })
  assert.equal(identityTitle.text, '认证中心')
  assert.ok(identityTitle.width >= identityTitle.scrollWidth - 1, 'identity status title is clipped')
  await identity.close()
  console.log('✔ identity narrow 390x900')
} finally {
  await browser.close()
}
