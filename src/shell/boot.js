/**
 * 氢壳首屏占位：基座 @run-at document-start 时立刻建立中性的单画布状态。
 * 避免整页进帖时正文先出来、铬要等皮肤 setup（还要扫楼）才出现。
 *
 * frame 只保留一个 canvas 节点；真壳盖上来时直接复用同一层。
 */
import { rawGet } from '../store.js'

export const SHELL_BOOT_STYLE_ID = 'lsb-shell-boot-style'
export const SHELL_BOOT_CLASS = 'lsb-canvas-boot'
export const SHELL_BOOT_FRAME_ID = 'lsb-shell-boot-frame'
export const SHELL_NAVIGATING_CLASS = 'lsb-canvas-navigating'
const CLOUDFLARE_CHALLENGE_ATTR = 'data-lsb-cloudflare-challenge'
const CLOUDFLARE_CHALLENGE_OBSERVER_KEY = '__lsbCloudflareChallengeObserver'
const CLOUDFLARE_CHALLENGE_MARKERS = '#challenge-stage, #challenge-form, #challenge-running, #cf-challenge-running, .cf-browser-verification, [data-cf-challenge]'
const CLOUDFLARE_TITLE_COPY = /(?:just a moment|attention required|checking your browser|checking if (?:the )?site connection is secure)/i
const CLOUDFLARE_BODY_COPY = /(?:checking your browser|verify (?:that )?you are human|enable javascript and cookies to continue|performing (?:a )?security (?:check|verification)|complete (?:the )?security check|请完成.{0,12}验证|请进行.{0,12}验证|正在验证|人机验证)/i
const SHELL_NAVIGATING_ATTR = 'data-lsb-navigation'
const NAVIGATION_GUARD_KEY = '__lsbShellNavigationGuard'

const BOOT_CSS = `
html.lsb-canvas-boot{
  background:var(--bg,#f4f5f7);
}
#lsb-shell-boot-frame{pointer-events:none}
#lsb-shell-boot-frame > [data-boot="canvas"]{
  position:fixed;inset:0;z-index:7990;
  background:var(--bg,#f4f5f7);
}
html.lsb-canvas-boot .forum-enhancements-left-fixed{display:none!important}
html.lsb-canvas-boot > body > .top,
html.lsb-canvas-boot .forum-more-region{display:none!important}
html.lsb-canvas-boot aside.sidebar:not(#mobile-menu-drawer):not(.mobile-menu-drawer){display:none!important}
html.lsb-canvas-boot .forum-layout.forum-layout-has-sidebar{
  display:block!important;grid-template-columns:1fr!important;
}
html.lsb-canvas-boot main.wrap{
  max-width:none!important;margin-left:0!important;margin-right:0!important;width:auto!important;
}
html.lsb-canvas-boot .lsb-launcher{display:none!important}
html.lsb-canvas-navigating .forum-enhancements-left-fixed{display:none!important}
html.lsb-canvas-navigating > body > .top,
html.lsb-canvas-navigating .forum-more-region{display:none!important}
html.lsb-canvas-navigating aside.sidebar:not(#mobile-menu-drawer):not(.mobile-menu-drawer){display:none!important}
html.lsb-canvas-navigating .lsb-launcher{display:none!important}
`

function bootVideoCss() {
  const cfg = rawGet('lsb_base:skin:__config') || {}
  const url = String(cfg.backgroundVideoUrl || '').trim()
  if (cfg.backgroundVideoEnabled !== true || !/^https:\/\//i.test(url)) return ''
  try {
    if (new URL(url).protocol !== 'https:') return ''
  } catch {
    return ''
  }
  return `\nhtml.lsb-canvas-boot{background-image:url(${JSON.stringify(url)});background-size:cover;background-position:center;background-attachment:fixed}`
}

function isVisibleChallengeCopy(node, doc) {
  const view = doc.defaultView
  for (let current = node; current?.nodeType === 1; current = current.parentElement) {
    if (current.hidden || current.getAttribute?.('aria-hidden') === 'true') return false
    const style = view?.getComputedStyle?.(current)
    if (style && (style.display === 'none' || style.visibility === 'hidden' || style.visibility === 'collapse' || style.opacity === '0')) return false
    if (current === doc.body || !current.parentElement) break
  }
  return true
}

function isCloudflareChallengePage(doc) {
  if (!doc?.querySelector?.(CLOUDFLARE_CHALLENGE_MARKERS)) return false
  if (CLOUDFLARE_TITLE_COPY.test(String(doc.title || ''))) return true
  const copyNodes = doc.querySelectorAll('h1, h2, h3, p, [role="heading"], #challenge-error-text, #challenge-body-text, [data-cf-challenge-message]')
  for (const node of copyNodes) {
    if (isVisibleChallengeCopy(node, doc) && CLOUDFLARE_BODY_COPY.test(node.textContent || '')) return true
  }
  return false
}

function releaseBootVisualsForChallenge(doc) {
  ensureBootStyle(doc)
  const root = doc.documentElement
  if (root?.classList.contains(SHELL_BOOT_CLASS)) root.classList.remove(SHELL_BOOT_CLASS)
  const frame = doc.getElementById(SHELL_BOOT_FRAME_ID)
  if (frame) frame.remove()
}

function bindCloudflareChallengeObserver(doc) {
  if (!doc?.documentElement || doc[CLOUDFLARE_CHALLENGE_OBSERVER_KEY]) return
  const Observer = doc.defaultView?.MutationObserver
  if (typeof Observer !== 'function') return
  const observer = new Observer(() => {
    if (!shouldShellBoot()) return
    const root = doc.documentElement
    const wasChallenge = root.getAttribute(CLOUDFLARE_CHALLENGE_ATTR) === 'true'
    if (isCloudflareChallengePage(doc)) {
      if (!wasChallenge) root.setAttribute(CLOUDFLARE_CHALLENGE_ATTR, 'true')
      releaseBootVisualsForChallenge(doc)
      return
    }
    if (wasChallenge) {
      root.removeAttribute(CLOUDFLARE_CHALLENGE_ATTR)
      applyShellBoot(doc)
    }
  })
  observer.observe(doc.documentElement, {
    childList: true,
    subtree: true,
    characterData: true,
    attributes: true,
    attributeFilter: ['id', 'class', 'hidden', 'style', 'aria-hidden', 'data-cf-challenge'],
  })
  doc[CLOUDFLARE_CHALLENGE_OBSERVER_KEY] = observer
}

function unbindCloudflareChallengeObserver(doc) {
  const observer = doc?.[CLOUDFLARE_CHALLENGE_OBSERVER_KEY]
  if (!observer) return
  observer.disconnect()
  try { delete doc[CLOUDFLARE_CHALLENGE_OBSERVER_KEY] } catch { /* document may be sealed by the host */ }
}

function shouldShellBoot() {
  if (rawGet('lsb_base:__core:disabled:skin') === true) return false
  const cfg = rawGet('lsb_base:skin:__config')
  if (cfg && cfg.shell === false) return false
  if (cfg?.uiMode !== 'ios27') return false
  return true
}

function ensureBootFrame(doc) {
  const root = doc.documentElement
  if (!root || doc.getElementById(SHELL_BOOT_FRAME_ID)) return
  const frame = doc.createElement('div')
  frame.id = SHELL_BOOT_FRAME_ID
  frame.setAttribute('aria-hidden', 'true')
  frame.innerHTML = '<div data-boot="canvas"></div>'
  root.appendChild(frame)
}

function isTopicNavigation(anchor, doc) {
  const ElementCtor = doc.defaultView?.Element
  if (!ElementCtor || !(anchor instanceof ElementCtor)) return false
  const eventTarget = anchor
  if (
    eventTarget.hasAttribute('download')
    || (eventTarget.target && eventTarget.target !== '_self')
    || /\bexternal\b/i.test(eventTarget.rel || '')
    || eventTarget.matches('[data-method], [data-confirm]')
  ) return false
  const view = doc.defaultView
  let target
  try {
    target = new URL(eventTarget.getAttribute('href') || eventTarget.href, view?.location?.href || 'https://linux.sb/')
  } catch {
    return false
  }
  if (!view?.location || target.origin !== view.location.origin) return false
  if (!/^\/topic\/\d+(?:\/|$)/.test(target.pathname)) return false
  return target.href !== view.location.href
}

function armNavigation(doc) {
  const root = doc.documentElement
  if (!root) return
  root.classList.add(SHELL_NAVIGATING_CLASS)
  root.setAttribute(SHELL_NAVIGATING_ATTR, 'leaving')
}

function disarmNavigation(doc) {
  const root = doc.documentElement
  if (!root) return
  root.classList.remove(SHELL_NAVIGATING_CLASS)
  root.removeAttribute(SHELL_NAVIGATING_ATTR)
}

function bindNavigationGuard(doc) {
  if (!doc || doc[NAVIGATION_GUARD_KEY]) return
  const onClick = (event) => {
    if (event.defaultPrevented || event.button !== 0) return
    if (event.metaKey || event.ctrlKey || event.shiftKey || event.altKey) return
    const target = event.target
    const anchor = target?.closest?.('a[href]')
    if (anchor && isTopicNavigation(anchor, doc)) {
      armNavigation(doc)
      const clearIfCancelled = () => {
        if (event.defaultPrevented) disarmNavigation(doc)
      }
      if (typeof queueMicrotask === 'function') queueMicrotask(clearIfCancelled)
      else Promise.resolve().then(clearIfCancelled)
    }
  }
  doc.addEventListener('click', onClick, true)
  doc[NAVIGATION_GUARD_KEY] = onClick
}

function unbindNavigationGuard(doc) {
  const onClick = doc?.[NAVIGATION_GUARD_KEY]
  if (!onClick) return
  doc.removeEventListener('click', onClick, true)
  try { delete doc[NAVIGATION_GUARD_KEY] } catch { /* document may be sealed by a host */ }
}

function ensureBootStyle(doc) {
  const root = doc.documentElement
  if (!root) return null
  if (!doc.getElementById(SHELL_BOOT_STYLE_ID)) {
    const el = doc.createElement('style')
    el.id = SHELL_BOOT_STYLE_ID
    const parent = doc.head || root
    parent.insertBefore(el, parent.firstChild)
  }
  const style = doc.getElementById(SHELL_BOOT_STYLE_ID)
  const content = BOOT_CSS + bootVideoCss()
  if (style && style.textContent !== content) style.textContent = content
  return style
}

function clearBootVisuals(doc) {
  doc.getElementById(SHELL_BOOT_STYLE_ID)?.remove()
  doc.getElementById(SHELL_BOOT_FRAME_ID)?.remove()
  doc.documentElement?.classList.remove(SHELL_BOOT_CLASS)
}

export function clearShellBoot(doc = document) {
  unbindNavigationGuard(doc)
  unbindCloudflareChallengeObserver(doc)
  clearBootVisuals(doc)
  doc.documentElement?.removeAttribute(CLOUDFLARE_CHALLENGE_ATTR)
  doc.documentElement?.classList.remove(SHELL_NAVIGATING_CLASS)
  doc.documentElement?.removeAttribute(SHELL_NAVIGATING_ATTR)
}

/** 按当前存储决定注入或撤掉。幂等，可在 document-start（尚无 body）调用。 */
export function applyShellBoot(doc = document) {
  const root = doc.documentElement
  if (!root) return
  if (!shouldShellBoot()) {
    clearShellBoot(doc)
    return
  }
  bindNavigationGuard(doc)
  bindCloudflareChallengeObserver(doc)
  if (isCloudflareChallengePage(doc)) {
    root.setAttribute(CLOUDFLARE_CHALLENGE_ATTR, 'true')
    releaseBootVisualsForChallenge(doc)
    return
  }
  root.removeAttribute(CLOUDFLARE_CHALLENGE_ATTR)
  /* plugin:activated is emitted after skin.setup has mounted the real canvas.
     Keep the navigation guard, but never recreate the opaque document-start
     layer after that canvas already owns the page. */
  const shell = doc.getElementById('lsb-shell')
  if (shell?.getAttribute('data-lsb-canvas-shell') === 'true') {
    root.classList.remove(SHELL_BOOT_CLASS)
    doc.getElementById(SHELL_BOOT_FRAME_ID)?.remove()
    /* Keep the style sheet: its navigating rules are still used by the
       document-start guard when the next full-page topic navigation begins. */
    ensureBootStyle(doc)
    return
  }
  root.classList.add(SHELL_BOOT_CLASS)
  ensureBootStyle(doc)
  ensureBootFrame(doc)
}

/** 皮肤关壳 / 停用时同步撤占位，不依赖皮肤 teardown 是否已升级。 */
export function watchShellBoot(bus) {
  if (!bus?.on) return
  const sync = () => applyShellBoot()
  bus.on('config:changed:skin', sync, { owner: '__shell-boot' })
  bus.on('plugin:disabled', sync, { owner: '__shell-boot' })
  bus.on('plugin:activated', sync, { owner: '__shell-boot' })
}
