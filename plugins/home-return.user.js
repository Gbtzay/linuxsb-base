// ==UserScript==
// @name         LSB·首页回位
// @namespace    https://linux.sb/
// @version      1.0.1
// @description  首页点进帖子时记下位置；回首页滚回那条帖，成功一次后丢掉记录。需要 LINUX.SB 基座。
// @author       you
// @match        https://linux.sb/*
// @grant        none
// @run-at       document-end
// @noframes
// ==/UserScript==

(function () {
  'use strict'

  const KEY = 'lsb_base:home-return:target'
  const MAX_PAGES = 20

  const manifest = {
    id: 'home-return',
    name: '首页回位',
    version: '1.0.1',
    description: '回首页时滚到上次点进的那条帖；回成功一次后刷新不再跳',
    author: 'you',
    requires: { base: '^0.1.0' },
    permissions: ['read', 'storage', 'ui', 'events'],
    config: {
      enabled: { type: 'switch', label: '回首页时回到上次点进的帖', default: true },
    },
  }

  function setup(api) {
    let cfg = api.config()
    api.on('config:changed:home-return', () => {
      cfg = api.config()
    })

    let scheduled = 0
    let inflight = null
    const watches = new Set()

    function topicIdFrom(href) {
      const m = String(href || '').match(/\/topic\/(\d+)/)
      return m ? Number(m[1]) : 0
    }

    function onHome() {
      try {
        return api.parse.detectPage(location).type === 'home'
      } catch {
        return api.page.type === 'home'
      }
    }

    function read() {
      try {
        const rec = JSON.parse(sessionStorage.getItem(KEY) || 'null')
        if (!rec || !Number.isFinite(rec.tid) || rec.tid <= 0) return null
        return rec
      } catch {
        return null
      }
    }

    function write(tid, offset) {
      try {
        sessionStorage.setItem(KEY, JSON.stringify({ tid, offset, ts: Date.now() }))
      } catch {
        /* 隐私模式可能写不了 */
      }
    }

    function clear() {
      try {
        sessionStorage.removeItem(KEY)
      } catch {
        /* ignore */
      }
    }

    function findItem(tid) {
      for (const li of document.querySelectorAll(api.sel.listItems)) {
        if (topicIdFrom(li.querySelector('a.post-title')?.getAttribute('href')) === tid) return li
      }
      return null
    }

    function applyScroll(li, offset) {
      const top = li.getBoundingClientRect().top + (window.scrollY || window.pageYOffset || 0)
      const y = Math.max(0, top - (Number.isFinite(offset) ? offset : 0))
      try {
        window.scrollTo(0, y)
      } catch {
        /* jsdom 视口 */
      }
    }

    function pagePath(p) {
      const url = new URL(location.href)
      url.searchParams.set('p', String(p))
      return `${url.pathname}${url.search}`
    }

    async function loadNext(page) {
      const doc = await api.net.doc(pagePath(page))
      const ul = document.querySelector(api.sel.listUl)
      if (!ul) return 0
      const seen = new Set(
        [...ul.querySelectorAll(api.sel.listItems)].map((li) =>
          topicIdFrom(li.querySelector('a.post-title')?.getAttribute('href')),
        ),
      )
      let added = 0
      for (const li of doc.querySelectorAll(api.sel.listItems)) {
        const id = topicIdFrom(li.querySelector('a.post-title')?.getAttribute('href'))
        if (!id || seen.has(id)) continue
        seen.add(id)
        ul.appendChild(document.importNode(li, true))
        added += 1
      }
      return added
    }

    async function restore() {
      if (!cfg.enabled) return false
      if (!onHome()) return false
      const rec = read()
      if (!rec) return false
      let el = findItem(rec.tid)
      if (!el) {
        let page = Number(api.page.page) || 1
        for (let i = 0; i < MAX_PAGES; i++) {
          page += 1
          let added = 0
          try {
            added = await loadNext(page)
          } catch {
            break
          }
          el = findItem(rec.tid)
          if (el) break
          if (!added) break
        }
      }
      if (!el) return false
      applyScroll(el, rec.offset)
      clear()
      return true
    }

    function scheduleRestore() {
      if (!cfg.enabled || !onHome()) return
      window.clearTimeout(scheduled)
      scheduled = window.setTimeout(() => {
        scheduled = 0
        if (inflight) return
        inflight = restore().finally(() => {
          inflight = null
        })
      }, 50)
    }

    function watchHomeArrival() {
      const from = location.href
      let n = 0
      const iv = window.setInterval(() => {
        n += 1
        if (onHome() && location.href !== from) {
          window.clearInterval(iv)
          watches.delete(iv)
          scheduleRestore()
        } else if (n >= 40) {
          window.clearInterval(iv)
          watches.delete(iv)
        }
      }, 20)
      watches.add(iv)
    }

    function onClick(e) {
      if (e.button !== 0) return
      const a = e.target?.closest?.('a[href]')
      if (!a) return
      if (a.target && a.target !== '_self') return
      try {
        const dest = api.parse.detectPage(new URL(a.href, location.href))
        if (cfg.enabled && dest.type === 'home' && !onHome()) watchHomeArrival()
      } catch {
        /* 坏 href 忽略 */
      }
      if (!cfg.enabled || !onHome()) return
      const title = a.closest('a.post-title')
      if (!title) return
      const li = title.closest('li.post-item')
      if (!li || !li.parentElement?.matches?.('ul.post-list')) return
      const tid = topicIdFrom(title.getAttribute('href'))
      if (!tid) return
      write(tid, li.getBoundingClientRect().top)
    }

    function onPageShow() {
      scheduleRestore()
    }

    document.addEventListener('click', onClick, true)
    window.addEventListener('pageshow', onPageShow)
    window.addEventListener('popstate', onPageShow)
    api.on('route:changed', scheduleRestore)
    api.onDispose(() => {
      document.removeEventListener('click', onClick, true)
      window.removeEventListener('pageshow', onPageShow)
      window.removeEventListener('popstate', onPageShow)
      if (scheduled) window.clearTimeout(scheduled)
      scheduled = 0
      for (const iv of watches) window.clearInterval(iv)
      watches.clear()
    })

    api.handle('home-return:debug', () => ({
      peek: read,
      find: (tid) => !!findItem(Number(tid)),
      restore,
    }))

    scheduleRestore()
    return {}
  }

  const w = typeof unsafeWindow !== 'undefined' ? unsafeWindow : window
  if (w.LSB && w.LSB.register) w.LSB.register(manifest, setup)
  else (w.LSB_PLUGINS = w.LSB_PLUGINS || []).push({ manifest, setup })
})()
