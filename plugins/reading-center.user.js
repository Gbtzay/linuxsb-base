// ==UserScript==
// @name         LSB·阅读中心
// @namespace    https://linux.sb/
// @version      1.0.0
// @description  最近阅读、稍后阅读与按楼层继续阅读，数据保存在本地。
// @author       you
// @match        https://linux.sb/*
// @grant        none
// @run-at       document-end
// @noframes
// ==/UserScript==

(function () {
  'use strict'

  const manifest = {
    id: 'reading-center', name: '阅读中心', version: '1.0.0',
    description: '统一最近阅读、稍后阅读与继续阅读', author: 'you',
    requires: { base: '^2.4.2' }, permissions: ['read', 'storage', 'ui', 'events'],
  }
  const CAP = 500
  const BATCH = 50
  const validId = (value) => Number.isSafeInteger(Number(value)) && Number(value) > 0

  function setup(api) {
    let alive = true, generation = 0, view = null
    let history = [], sourceStatus = 'unavailable', activeTab = 'recent', query = '', limit = BATCH
    const buttons = new Set()
    const esc = api.util.esc

    function loadLater() {
      const raw = api.store.get('later', {})
      if (!raw || typeof raw !== 'object' || Array.isArray(raw)) return {}
      return Object.fromEntries(Object.entries(raw).filter(([id, item]) => validId(id)
        && item && typeof item.title === 'string' && Number.isFinite(item.addedAt) && item.addedAt > 0)
        .map(([id, item]) => [Number(id), { title: item.title.slice(0, 500), addedAt: item.addedAt }]))
    }

    function saveLater(topicId, title, remove = false) {
      if (!alive || !validId(topicId)) return false
      const all = loadLater()
      if (remove) delete all[topicId]
      else if (!all[topicId]) {
        if (Object.keys(all).length >= CAP) {
          api.ui.toast('稍后阅读已满 500 帖，请先移除一些条目。', { type: 'error' })
          return false
        }
        all[topicId] = { title: String(title || `帖子 #${topicId}`).slice(0, 500), addedAt: Date.now() }
      }
      try { api.store.set('later', all) }
      catch {
        api.ui.toast('保存失败，请检查本地存储后重试。', { type: 'error' })
        return false
      }
      paintButtons()
      paint()
      return true
    }

    // Only identifiers and positions construct links; stored URLs are never trusted.
    function href(record) {
      const page = Number.isSafeInteger(record?.page) && record.page > 0 ? record.page : 1
      const floor = Number.isSafeInteger(record?.floor) && record.floor > 0 ? record.floor : 0
      return api.routes.topic(record.topicId, page) + (floor ? `${page > 1 ? '&' : '?'}floor=${floor}` : '')
    }

    function rows() {
      const later = loadLater()
      const byId = new Map(history.map((item) => [item.topicId, item]))
      const list = activeTab === 'recent' ? history : Object.entries(later).map(([id, item]) => ({
        ...byId.get(Number(id)), topicId: Number(id), title: byId.get(Number(id))?.title || item.title,
        addedAt: item.addedAt,
      })).sort((a, b) => b.addedAt - a.addedAt || b.topicId - a.topicId)
      const needle = query.trim().toLocaleLowerCase()
      return list.filter((item) => !needle || `${item.title} ${item.topicId}`.toLocaleLowerCase().includes(needle))
    }

    function paint() {
      if (!alive || !view?.isConnected) return
      const later = loadLater(), list = rows()
      view.querySelector('[data-reading-status]').textContent = sourceStatus === 'ok'
        ? `${history.length} 帖有阅读记录 · ${Object.keys(later).length} / ${CAP} 帖稍后阅读`
        : sourceStatus === 'error' ? '阅读记录暂时无法读取，请刷新重试；稍后阅读仍可使用。'
          : '未启用断点续读，暂不能显示最近阅读；稍后阅读仍可使用。'
      for (const button of view.querySelectorAll('[data-reading-tab]')) {
        const selected = button.dataset.readingTab === activeTab
        button.setAttribute('aria-selected', String(selected))
        button.classList.toggle('is-primary', selected)
      }
      view.querySelector('[data-reading-rows]').innerHTML = list.length ? list.slice(0, limit).map((item) => {
        const position = Number.isSafeInteger(item.floor) ? `读到 #${item.floor} · 第 ${item.page || 1} 页` : '尚无阅读位置'
        const timestamp = activeTab === 'later' ? item.addedAt : item.updatedAt
        const saved = !!later[item.topicId]
        return `<article class="lsb-reading-row" data-reading-topic="${item.topicId}">
          <div class="lsb-reading-main"><a class="lsb-reading-title" href="${href(item)}">${esc(item.title || `帖子 #${item.topicId}`)}</a>
          <p>${position} · ${esc(new Date(timestamp).toLocaleString('zh-CN'))}</p></div>
          <div class="lsb-reading-actions"><a class="lsb-btn" href="${href(item)}">${item.floor > 0 ? '继续阅读' : '打开帖子'}</a>
          <button type="button" class="lsb-btn" ${saved ? 'data-reading-remove' : 'data-reading-save'}>${saved ? '移出稍后阅读' : '稍后阅读'}</button></div>
        </article>`
      }).join('') : `<p class="lsb-empty">${query.trim() ? '没有匹配的帖子。' : activeTab === 'later'
        ? '还没有稍后阅读。在帖子标题旁或最近阅读中点击「稍后阅读」。'
        : sourceStatus === 'ok' ? '还没有阅读记录，打开一篇帖子开始阅读。' : '启用「断点续读」后可查看已有记录。'}</p>`
      const more = view.querySelector('[data-reading-more]')
      more.hidden = list.length <= limit
      more.textContent = `加载更多（已显示 ${Math.min(limit, list.length)} / ${list.length}）`
    }

    async function refresh() {
      if (!alive) return
      const ticket = ++generation
      let records = [], status = 'unavailable'
      if (api.hasHandler('resume-reading:list')) {
        try {
          const result = await api.request('resume-reading:list', null, { timeout: 2000 })
          records = Array.isArray(result) ? result.filter((r) => r && validId(r.topicId)
            && Number.isSafeInteger(r.floor) && r.floor >= 0 && Number.isSafeInteger(r.page) && r.page > 0
            && Number.isFinite(r.updatedAt)) : []
          status = Array.isArray(result) ? 'ok' : 'error'
        } catch { status = 'error' }
      }
      if (!alive || ticket !== generation) return
      history = records
      sourceStatus = status
      paintButtons()
      paint()
      if (view?.isConnected) view.dataset.ready = 'true'
    }

    function render(host) {
      view = document.createElement('section')
      view.dataset.readingCenter = ''
      view.className = 'lsb-reading-center'
      query = ''
      limit = BATCH
      view.innerHTML = `<header><h2>阅读中心</h2><p>找回读过的帖子，也留一些给下次。</p></header>
        <div class="lsb-reading-toolbar"><div role="tablist" aria-label="阅读列表">
          <button type="button" role="tab" class="lsb-btn" data-reading-tab="recent">最近阅读</button>
          <button type="button" role="tab" class="lsb-btn" data-reading-tab="later">稍后阅读</button></div>
          <button type="button" class="lsb-btn" data-reading-refresh>刷新</button></div>
        <label class="lsb-reading-search">搜索本地记录<input type="search" placeholder="标题或主题 ID" aria-label="搜索本地阅读记录"></label>
        <p class="lsb-reading-status" data-reading-status role="status" aria-live="polite">正在读取本地记录…</p>
        <div data-reading-rows></div><button type="button" class="lsb-btn" data-reading-more hidden>加载更多</button>
        <p class="lsb-reading-note">稍后阅读仅保存在本地，不会加入站点收藏。阅读记录的保留时间由「断点续读」设置决定。</p>`
      view.addEventListener('input', (event) => {
        if (!alive || event.target.type !== 'search') return
        query = event.target.value
        limit = BATCH
        paint()
      })
      view.addEventListener('click', (event) => {
        if (!alive) return
        const button = event.target.closest('button')
        if (button?.hasAttribute('data-reading-tab')) {
          activeTab = button.dataset.readingTab
          limit = BATCH
          paint()
        } else if (button?.hasAttribute('data-reading-refresh')) refresh()
        else if (button?.hasAttribute('data-reading-more')) { limit += BATCH; paint() }
        else if (button) {
          const row = button.closest('[data-reading-topic]')
          if (row) saveLater(Number(row.dataset.readingTopic), row.querySelector('a').textContent,
            button.hasAttribute('data-reading-remove'))
        }
        // Close the base panel through its own close handler; keep the real link
        // event intact so skin can soft-navigate (or the browser can open a tab).
        const link = event.target.closest('a[href]')
        if (link && event.button === 0 && !event.ctrlKey && !event.metaKey && !event.shiftKey && !event.altKey) {
          view.closest('.lsb-panel')?.querySelector('.lsb-panel-close')?.click()
        }
      })
      host.append(view)
      refresh()
    }

    function paintButtons() {
      const all = loadLater()
      for (const button of buttons) {
        if (!button.isConnected) { button.remove(); buttons.delete(button); continue }
        const saved = !!all[button.dataset.readingToggle]
        button.textContent = saved ? '已加入稍后阅读' : '稍后阅读'
        button.setAttribute('aria-pressed', String(saved))
        button.title = saved ? '移出稍后阅读' : '加入稍后阅读'
      }
    }

    function addButton(host, topicId, title) {
      if (!alive || !validId(topicId) || host.querySelector('[data-reading-toggle]')) return
      const button = document.createElement('button')
      button.type = 'button'
      button.className = 'lsb-reading-toggle'
      button.dataset.readingToggle = String(topicId)
      button.dataset.readingTitle = String(title || '').slice(0, 500)
      host.append(button)
      buttons.add(button)
      paintButtons()
    }

    function decorateList(li) {
      if (!alive || !li.isConnected) return
      const item = api.parse.listItem(li)
      if (item?.id) addButton(li.querySelector('.post-title-row') || li.querySelector('.post-body') || li, item.id, item.title)
    }

    function decorateTopic() {
      if (api.page.type !== 'topic') return
      const heading = document.querySelector('.post-content-title')
      if (!heading) return
      let host = heading.nextElementSibling
      if (!host?.matches('[data-reading-topic-actions]')) {
        host = document.createElement('div')
        host.dataset.readingTopicActions = ''
        heading.after(host)
      }
      // The heading can be reused by a skin route commit.
      if (host.firstElementChild?.dataset.readingToggle !== String(api.page.id)) host.replaceChildren()
      addButton(host, api.page.id, heading.textContent)
    }

    function syncPage() {
      paintButtons()
      document.querySelectorAll(api.sel.listItems).forEach(decorateList)
      decorateTopic()
      if (view?.isConnected) refresh()
    }

    const onToggle = (event) => {
      const button = event.target.closest?.('[data-reading-toggle]')
      if (!alive || !button || !buttons.has(button)) return
      event.preventDefault()
      const id = Number(button.dataset.readingToggle)
      saveLater(id, button.dataset.readingTitle, !!loadLater()[id])
    }
    const onFocus = () => { if (alive) { paintButtons(); if (view?.isConnected) refresh() } }
    const onVisible = () => { if (!document.hidden) onFocus() }
    document.addEventListener('click', onToggle)
    window.addEventListener('focus', onFocus)
    document.addEventListener('visibilitychange', onVisible)
    api.dom.each(api.sel.listItems, decorateList)
    api.on('route:changed', syncPage)
    api.on('plugin:resume-reading:changed', () => { if (view?.isConnected) refresh() })
    for (const event of ['plugin:activated', 'plugin:disabled']) api.on(event, ({ id } = {}) => {
      if (id === 'resume-reading' && view?.isConnected) refresh()
    })
    api.store.watch(() => { if (alive) { paintButtons(); paint() } })
    api.ui.tab({ name: '阅读中心', order: 59, render })
    api.handle('reading-center:open', () => { if (alive) api.ui.openPanel('reading-center') })
    api.handle('reading-center:debug', () => ({ refresh, state: () => ({
      activeTab, sourceStatus, recentCount: history.length, laterCount: Object.keys(loadLater()).length,
    }) }))
    api.ui.style(`
      .lsb-reading-center{color:var(--text,#222);min-width:0}
      .lsb-reading-center h2{margin:0 0 6px;font-size:22px}
      .lsb-reading-center header p,.lsb-reading-status,.lsb-reading-note,.lsb-reading-main p{color:var(--text,#222);opacity:.72;font-size:12px;line-height:1.6}
      .lsb-reading-toolbar,.lsb-reading-toolbar [role=tablist],.lsb-reading-actions{display:flex;gap:8px;flex-wrap:wrap;align-items:center}
      .lsb-reading-toolbar{justify-content:space-between;margin:18px 0 14px}
      .lsb-reading-search{display:block;font-size:12px}
      .lsb-reading-search input{display:block;box-sizing:border-box;width:100%;min-width:0;padding:10px;margin-top:6px;border:1px solid var(--line,#ddd);border-radius:8px;background:var(--panel,#fff);color:inherit;font:inherit;font-size:14px}
      .lsb-reading-row{padding:16px 0;border-bottom:1px solid var(--line,#ddd)}
      .lsb-reading-title{font-size:15px;font-weight:600;line-height:1.6;overflow-wrap:anywhere;color:inherit;text-decoration:none}
      .lsb-reading-title:hover{text-decoration:underline}.lsb-reading-main p{margin:6px 0 10px}
      .lsb-reading-actions .lsb-btn,.lsb-reading-toolbar .lsb-btn{min-height:36px}
      .lsb-reading-note{margin:18px 0 0}.lsb-reading-center [hidden]{display:none!important}
      .lsb-reading-toggle{font:inherit;font-size:11px;line-height:1.5;flex:0 0 auto;margin:4px 0 4px 8px;padding:4px 8px;border:1px solid var(--line,#ddd);border-radius:999px;background:var(--panel,#fff);color:var(--muted,#666);cursor:pointer}
      .lsb-reading-toggle[aria-pressed=true]{color:var(--brand,#38867c);border-color:currentColor}
      [data-reading-topic-actions] .lsb-reading-toggle{margin-left:0}
      @media(max-width:600px){
        .lsb-panel:has([data-reading-center]) .lsb-panel-body{flex-direction:column}
        .lsb-panel:has([data-reading-center]) .lsb-tabs{display:flex;flex:0 0 auto;border-right:0;border-bottom:1px solid var(--line,#ddd);max-width:100%;gap:4px}
        .lsb-panel:has([data-reading-center]) .lsb-tab{flex:0 0 auto;width:auto;white-space:nowrap;min-height:44px}
        .lsb-reading-toolbar .lsb-btn,.lsb-reading-actions .lsb-btn,.lsb-reading-toggle{min-height:44px}
        .lsb-reading-toolbar{gap:12px}.lsb-reading-actions{gap:6px}.lsb-reading-toggle{margin-left:0}
      }
    `)
    syncPage()
    api.onDispose(() => {
      alive = false
      generation++
      document.removeEventListener('click', onToggle)
      window.removeEventListener('focus', onFocus)
      document.removeEventListener('visibilitychange', onVisible)
      for (const button of buttons) button.remove()
      buttons.clear()
      document.querySelectorAll('[data-reading-topic-actions]').forEach((host) => host.remove())
      view?.remove()
      view = null
      document.getElementById('lsb-style-reading-center')?.remove()
    })
  }

  const w = typeof unsafeWindow !== 'undefined' ? unsafeWindow : window
  if (w.LSB && w.LSB.register) w.LSB.register(manifest, setup)
  else (w.LSB_PLUGINS = w.LSB_PLUGINS || []).push({ manifest, setup })
})()
