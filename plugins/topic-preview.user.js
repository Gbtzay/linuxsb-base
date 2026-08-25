// ==UserScript==
// @name         LSB·主楼预览
// @namespace    https://linux.sb/
// @version      1.1.3
// @description  列表每条标题旁「预览」，浮窗里嵌原帖并裁掉站点外壳。需要 LINUX.SB 基座。
// @author       you
// @match        https://linux.sb/*
// @grant        none
// @run-at       document-end
// @noframes
// ==/UserScript==

(function () {
  'use strict'

  const manifest = {
    id: 'topic-preview',
    name: '主楼预览',
    version: '1.1.3',
    description: '列表点预览，浮窗嵌原帖（裁外壳）',
    author: 'you',
    requires: { base: '^0.1.0' },
    permissions: ['read', 'ui', 'events'],
  }

  const CROP_CSS =
    '.top,nav.forum-nav,aside.sidebar,aside.mobile-menu-drawer,footer.footer,' +
    '.mobile-menu-backdrop,.mobile-menu-trigger,.forum-more-region{display:none!important}' +
    '.forum-layout.forum-layout-has-sidebar{display:block!important;grid-template-columns:1fr!important}' +
    'main.wrap{max-width:none!important;margin-left:0!important;margin-right:0!important;width:auto!important}' +
    'body{overflow-y:auto!important}'

  function setup(api) {
    let activeId = null
    let mask = null
    let panel = null
    let onKey = null
    let frameWin = null
    let frameEsc = null

    const style = document.createElement('style')
    style.id = 'lsb-topic-preview-style'
    style.textContent = `
      .lsb-topic-preview-btn{
        margin-left:8px;padding:0 6px;height:20px;border:1px solid var(--line,#ddd);
        border-radius:4px;background:transparent;color:var(--text-muted,#888);
        font-size:12px;cursor:pointer;flex-shrink:0;vertical-align:middle;
      }
      .lsb-topic-preview-btn:hover{color:var(--brand,#5eaaa0);border-color:var(--brand,#5eaaa0)}
      .lsb-topic-preview-btn:active{transform:scale(.97)}
      #lsb-topic-preview{width:min(800px,94vw)}
      #lsb-topic-preview .lsb-view{
        position:relative;flex:0 0 auto;height:min(70vh,640px);padding:0;overflow:hidden;
      }
      #lsb-topic-preview iframe{
        position:absolute;inset:0;width:100%;height:100%;border:0;background:var(--bg,#fff);
      }
      #lsb-topic-preview [data-lsb-tp-loading]{
        position:absolute;inset:0;z-index:1;display:flex;align-items:center;justify-content:center;
        background:var(--panel,#fff);color:var(--text-muted,#888);font-size:13px;
      }
      #lsb-topic-preview [data-lsb-tp-loading][hidden]{display:none!important}
    `
    document.head.appendChild(style)

    function topicIdFrom(href) {
      const m = String(href || '').match(/\/topic\/(\d+)/)
      return m ? Number(m[1]) : null
    }

    function isTopicFrame(iframe) {
      return !!topicIdFrom(iframe?.getAttribute('src') || iframe?.src || '')
    }

    function unbindFrameEsc() {
      if (frameWin && frameEsc) {
        try {
          frameWin.removeEventListener('keydown', frameEsc)
        } catch {
          /* 翻页后旧 window 可能已经没了 */
        }
      }
      frameWin = null
      frameEsc = null
    }

    function bindFrameEsc(iframe) {
      unbindFrameEsc()
      const win = iframe.contentWindow
      if (!win) return
      frameEsc = (e) => {
        if (e.key === 'Escape') close()
      }
      frameWin = win
      win.addEventListener('keydown', frameEsc)
    }

    function cropFrame(iframe) {
      const doc = iframe.contentDocument
      if (!doc) return
      let st = doc.getElementById('lsb-topic-preview-crop')
      if (!st) {
        st = doc.createElement('style')
        st.id = 'lsb-topic-preview-crop'
        const host = doc.head || doc.documentElement
        if (!host) return
        host.appendChild(st)
      }
      st.textContent = CROP_CSS
    }

    function dropUi() {
      unbindFrameEsc()
      mask?.remove()
      panel?.remove()
      mask = null
      panel = null
      if (onKey) {
        document.removeEventListener('keydown', onKey)
        onKey = null
      }
    }

    function close() {
      activeId = null
      dropUi()
    }

    function onFrameLoad() {
      const iframe = panel?.querySelector('iframe')
      if (!iframe || !isTopicFrame(iframe)) return
      try {
        cropFrame(iframe)
        bindFrameEsc(iframe)
      } catch {
        /* 跨域错误页或沙箱拦 contentDocument：帖仍在 iframe 里，不能卡加载中 */
      }
      const loading = panel.querySelector('[data-lsb-tp-loading]')
      if (loading) loading.hidden = true
    }

    function ensureUi() {
      if (panel && mask) return panel
      dropUi()
      mask = document.createElement('div')
      mask.className = 'lsb-mask lsb-topic-preview-mask'
      panel = document.createElement('div')
      panel.className = 'lsb-panel'
      panel.id = 'lsb-topic-preview'
      panel.innerHTML =
        '<div class="lsb-panel-head"><strong data-lsb-tp-title>预览</strong>' +
        '<button type="button" class="lsb-panel-close" aria-label="关闭">×</button></div>' +
        '<div class="lsb-view"><div data-lsb-tp-loading>加载中</div>' +
        '<iframe class="lsb-topic-preview-frame" title="帖子预览"></iframe></div>' +
        '<div class="lsb-actions"><a class="lsb-btn is-primary" data-lsb-tp-open>打开帖子</a></div>'
      panel.querySelector('.lsb-panel-close').onclick = close
      mask.onclick = close
      panel.querySelector('iframe').addEventListener('load', onFrameLoad)
      document.body.append(mask, panel)
      onKey = (e) => {
        if (e.key === 'Escape') close()
      }
      document.addEventListener('keydown', onKey)
      return panel
    }

    function openPreview(id, listTitle) {
      const el = ensureUi()
      el.querySelector('[data-lsb-tp-title]').textContent = listTitle || '预览'
      el.querySelector('[data-lsb-tp-open]').setAttribute('href', api.routes.topic(id))
      const iframe = el.querySelector('iframe')
      const already = activeId === id && isTopicFrame(iframe) && topicIdFrom(iframe.getAttribute('src')) === id
      activeId = id
      if (already) return
      const loading = el.querySelector('[data-lsb-tp-loading]')
      if (loading) loading.hidden = false
      iframe.setAttribute('src', api.routes.topic(id))
    }

    function paint(li) {
      if (api.page.type === 'topic' || api.page.type === 'user') return
      if (!(li instanceof Element) || li.classList.contains('post-entry')) return
      if (li.querySelector(':scope .lsb-topic-preview-btn')) return
      const titleA = li.querySelector('a.post-title[href*="/topic/"]')
      if (!titleA) return
      const id = topicIdFrom(titleA.getAttribute('href'))
      if (!id) return
      const btn = document.createElement('button')
      btn.type = 'button'
      btn.className = 'lsb-topic-preview-btn'
      btn.textContent = '预览'
      btn.addEventListener('click', (e) => {
        e.preventDefault()
        e.stopPropagation()
        const it = api.parse.listItem(li)
        openPreview(id, (it && it.title) || titleA.textContent.trim())
      })
      const row = li.querySelector('.post-title-row')
      if (row && titleA.parentElement === row) titleA.after(btn)
      else (row || li.querySelector('.post-body') || li).append(btn)
    }

    api.dom.each(api.sel.listItems, paint)
    api.on('route:changed', close)
    api.onDispose(() => {
      close()
      for (const btn of document.querySelectorAll('.lsb-topic-preview-btn')) btn.remove()
      style.remove()
    })

    api.handle('topic-preview:debug', () => ({
      buttons: () => document.querySelectorAll('.lsb-topic-preview-btn').length,
      open: () => !!document.getElementById('lsb-topic-preview'),
      activeId: () => activeId,
      frameSrc: () => panel?.querySelector('iframe')?.getAttribute('src') || null,
    }))

    return {}
  }

  const w = typeof unsafeWindow !== 'undefined' ? unsafeWindow : window
  if (w.LSB && w.LSB.register) w.LSB.register(manifest, setup)
  else (w.LSB_PLUGINS = w.LSB_PLUGINS || []).push({ manifest, setup })
})()
