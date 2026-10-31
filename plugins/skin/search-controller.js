const SKIN_SEARCH_FORMS = 'form.search-form, form.meilisearch-search-top-form, form[role="search"][aria-label="站内搜索"]'
const SKIN_TOP_SEARCH_FORMS = 'body > .top form.search-form, body > .top form.meilisearch-search-top-form, body > .top form[role="search"][aria-label="站内搜索"]'

/** Moves native nodes without cloning their fields or taking over submission. */
export function createSkinSearchController({ document }) {
  const { Element, HTMLElement } = document.defaultView
  let node = null
  let home = null
  let panel = null

  function host() {
    return document.querySelector('#lsb-shell [data-canvas-search-host]') || document.querySelector('.lsb-shell-search-host')
  }

  function ownHosted(element, target) {
    if (node !== element) node?.classList.remove('lsb-shell-search')
    node = element
    panel = target
    node.classList.add('lsb-shell-search')
  }

  function reconcileReplacement() {
    // The site may replace a placeholder before our mutation callback runs.
    const replacement = node && !node.isConnected
      ? panel?.querySelector(SKIN_SEARCH_FORMS) || panel?.querySelector('a.search-page-link') : null
    if (replacement) ownHosted(replacement, panel)
  }

  function adopt(targetHost) {
    if (!(targetHost instanceof Element)) return
    const canvas = targetHost.matches('[data-canvas-search-host]')
    const target = canvas ? targetHost.querySelector('[data-canvas-search-panel]') : targetHost
    if (!(target instanceof Element)) return
    reconcileReplacement()
    if (node?.matches(SKIN_SEARCH_FORMS) && panel?.contains(node)) {
      const moving = panel !== target
      ownHosted(node, target)
      if (moving) target.append(node)
      if (canvas) targetHost.hidden = false
      return
    }
    const hostedForm = target.querySelector(SKIN_SEARCH_FORMS)
    if (hostedForm) {
      ownHosted(hostedForm, target)
      if (canvas) targetHost.hidden = false
      return
    }
    const nativeForm = document.querySelector(SKIN_TOP_SEARCH_FORMS) || document.querySelector(SKIN_SEARCH_FORMS)
    if (nativeForm && !target.contains(nativeForm)) {
      const fallback = target.querySelector('a.search-page-link')
      if (fallback) {
        fallback.classList.remove('lsb-shell-search')
        fallback.remove()
      }
      if (nativeForm !== node) home = { parent: nativeForm.parentNode, next: nativeForm.nextSibling }
      ownHosted(nativeForm, target)
      target.append(nativeForm)
      if (canvas) targetHost.hidden = false
      return
    }
    const hostedLink = target.querySelector('a.search-page-link')
    if (hostedLink) {
      ownHosted(hostedLink, target)
      if (canvas) targetHost.hidden = false
      return
    }
    const link = node?.matches('a.search-page-link') && panel?.contains(node)
      ? node : document.querySelector('body > .top .search-page-link') || document.querySelector('a.search-page-link')
    if (!(link instanceof Element) || targetHost.contains(link)) {
      if (canvas) targetHost.hidden = true
      return
    }
    if (link !== node) home = { parent: link.parentNode, next: link.nextSibling }
    ownHosted(link, target)
    target.append(link)
    if (canvas) targetHost.hidden = false
  }

  function restore() {
    reconcileReplacement()
    if (node) {
      node.classList.remove('lsb-shell-search')
      if (!home?.parent?.isConnected) node.remove()
      else if (home.next?.parentNode === home.parent) home.parent.insertBefore(node, home.next)
      else home.parent.append(node)
    }
    node = null
    home = null
    panel = null
  }

  function setOpen(targetHost, open, restoreFocus = false) {
    if (!(targetHost instanceof Element)) return false
    const trigger = targetHost.querySelector('[data-canvas-search-trigger]')
    const target = targetHost.querySelector('[data-canvas-search-panel]')
    if (!(trigger instanceof HTMLElement) || !(target instanceof HTMLElement)) return false
    const next = !!open && !!target.querySelector('form, .search-page-link')
    targetHost.dataset.searchOpen = String(next)
    target.hidden = !next
    trigger.setAttribute('aria-expanded', String(next))
    trigger.setAttribute('aria-label', next ? '关闭站点搜索' : '打开站点搜索')
    if (next) target.querySelector('input[type="search"], input[name="q"]')?.focus?.()
    else if (restoreFocus) trigger.focus?.()
    return next
  }

  return { host, adopt, restore, setOpen }
}
