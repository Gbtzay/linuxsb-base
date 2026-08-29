import { esc, uid } from './util.js'

/**
 * UI 层：给插件提供统一的挂载点，避免每个插件自己往页面里塞浮层。
 *
 * 提供：toast / 确认框 / 设置面板（插件在里面注册自己的分页）/ 顶栏按钮 /
 * 楼层与列表项工具条（插件往里加按钮，样式由基座统一）。
 * 所有样式沿用站点 CSS 变量（--brand/--panel/--line…），自动适配明暗主题。
 */

const CSS = `
.lsb-toast-host{position:fixed;right:16px;bottom:16px;z-index:99999;display:flex;flex-direction:column;gap:8px;pointer-events:none}
.lsb-toast{pointer-events:auto;min-width:180px;max-width:320px;padding:9px 12px;border:1px solid var(--line,#ddd);border-radius:8px;background:var(--panel,#fff);color:var(--text,#222);font-size:13px;box-shadow:0 6px 18px var(--shadow-medium,rgba(0,0,0,.18));opacity:0;transform:translateY(6px);transition:opacity .18s,transform .18s}
.lsb-toast.is-in{opacity:1;transform:none}
.lsb-toast.is-err{border-color:var(--danger,#e07a7a)}
.lsb-toast.is-ok{border-color:var(--success,#7bc4b8)}
.lsb-toast-title{font-weight:600;margin-bottom:2px}
.lsb-launcher{position:fixed;right:16px;bottom:74px;z-index:99998;width:38px;height:38px;border-radius:50%;border:1px solid var(--line,#ddd);background:var(--panel,#fff);color:var(--brand,#5eaaa0);cursor:pointer;font-size:15px;font-weight:700;box-shadow:0 4px 12px var(--shadow-base,rgba(0,0,0,.15))}
.lsb-launcher:hover{border-color:var(--brand,#5eaaa0)}
.lsb-mask{position:fixed;inset:0;z-index:99998;background:var(--backdrop,rgba(0,0,0,.45));overscroll-behavior:contain}
.lsb-panel{position:fixed;z-index:99999;left:50%;top:50%;transform:translate(-50%,-50%);width:min(720px,94vw);max-height:82vh;display:flex;flex-direction:column;border:1px solid var(--line,#ddd);border-radius:10px;background:var(--panel,#fff);color:var(--text,#222);font-size:13px;overflow:hidden;overscroll-behavior:contain;box-shadow:0 18px 48px var(--shadow-medium,rgba(0,0,0,.3))}
.lsb-panel-settings{height:min(640px,82vh)}
.lsb-panel-head{display:flex;align-items:center;gap:8px;padding:10px 12px;border-bottom:1px solid var(--line-soft,#eee)}
.lsb-panel-head strong{font-size:14px}
.lsb-panel-head .lsb-ver{color:var(--text-muted,#888);font-size:11px}
.lsb-panel-close{margin-left:auto;border:0;background:transparent;color:var(--text-muted,#888);font-size:18px;cursor:pointer;line-height:1}
.lsb-panel-body{display:flex;min-height:0;flex:1}
.lsb-tabs{flex:0 0 168px;border-right:1px solid var(--line-soft,#eee);overflow:auto;overscroll-behavior:contain;padding:6px}
.lsb-tab{display:block;width:100%;text-align:left;padding:7px 9px;margin-bottom:2px;border:0;border-radius:6px;background:transparent;color:var(--text,#222);cursor:pointer;font-size:13px}
.lsb-tab:hover{background:var(--bg,#f6f6f6)}
.lsb-tab.is-active{background:var(--brand-soft,#e8f4f2);color:var(--brand,#5eaaa0);font-weight:600}
.lsb-view{flex:1;min-width:0;overflow:auto;overscroll-behavior:contain;padding:12px 14px}
.lsb-row{display:flex;align-items:center;gap:10px;padding:7px 0;border-bottom:1px solid var(--line-soft,#f0f0f0)}
.lsb-row:last-child{border-bottom:0}
.lsb-row-main{min-width:0;flex:1}
.lsb-row-name{font-weight:600}
.lsb-row-desc{color:var(--text-muted,#888);font-size:12px;margin-top:2px;word-break:break-word}
.lsb-badge{display:inline-block;padding:0 5px;border-radius:4px;background:var(--bg,#eee);color:var(--text-muted,#888);font-size:11px;margin-left:6px}
.lsb-badge.is-on{background:var(--success-soft,#e6f6f3);color:var(--success,#3aa08f)}
.lsb-badge.is-err{background:var(--danger-soft,#fdecec);color:var(--danger,#d55)}
.lsb-btn{padding:4px 10px;border:1px solid var(--line,#ddd);border-radius:6px;background:var(--bg,#fafafa);color:var(--text,#222);cursor:pointer;font-size:12px}
.lsb-btn:hover{border-color:var(--brand,#5eaaa0);color:var(--brand,#5eaaa0)}
.lsb-btn.is-primary{background:var(--brand,#5eaaa0);border-color:var(--brand,#5eaaa0);color:#fff}
.lsb-field{display:block;margin-bottom:10px}
.lsb-field>span{display:block;margin-bottom:4px;color:var(--text-muted,#888);font-size:12px}
.lsb-field input[type=text],.lsb-field input[type=number],.lsb-field select,.lsb-field textarea{width:100%;box-sizing:border-box;padding:5px 7px;border:1px solid var(--line,#ddd);border-radius:6px;background:var(--bg,#fff);color:var(--text,#222);font-size:13px}
.lsb-actions{display:flex;gap:8px;justify-content:flex-end;padding:10px 12px;border-top:1px solid var(--line-soft,#eee)}
.lsb-ops{display:inline-flex;gap:6px;align-items:center;margin-left:6px}
.lsb-op{border:0;background:transparent;color:var(--text-muted,#888);cursor:pointer;font-size:12px;padding:1px 4px;border-radius:4px}
.lsb-op:hover{color:var(--brand,#5eaaa0);background:var(--brand-soft,#eef6f5)}
.lsb-empty{color:var(--text-muted,#888);padding:14px 0}
`

function trapOverscroll(root) {
  const onWheel = (e) => {
    const dy = e.deltaY
    const scroller = e.target?.closest?.('.lsb-view, .lsb-tabs')
    if (scroller && root.contains(scroller)) {
      const top = scroller.scrollTop
      const max = scroller.scrollHeight - scroller.clientHeight
      if ((dy < 0 && top > 0) || (dy > 0 && top < max - 0.5)) return
    }
    e.preventDefault()
  }
  root.addEventListener('wheel', onWheel, { passive: false })
}

export class UI {
  constructor({ title = 'LINUX.SB · 氢', version = '' } = {}) {
    this.title = title
    this.version = version
    this._tabs = [] // 插件注册的面板分页
    this._panel = null
    this._active = null
    this._styleDone = false
    this._toastHost = null
    this._launcher = null
  }

  injectStyle(css, id) {
    const key = id || uid('lsb-style')
    if (document.getElementById(key)) return
    const el = document.createElement('style')
    el.id = key
    el.textContent = css
    document.head.appendChild(el)
  }

  ensureBase() {
    if (this._styleDone) return
    this.injectStyle(CSS, 'lsb-base-style')
    this._styleDone = true
  }

  /* ─────────── toast ─────────── */

  toast(message, { type = 'info', title = '', timeout = 2600 } = {}) {
    this.ensureBase()
    if (!this._toastHost) {
      this._toastHost = document.createElement('div')
      this._toastHost.className = 'lsb-toast-host'
      document.body.appendChild(this._toastHost)
    }
    const el = document.createElement('div')
    el.className = `lsb-toast${type === 'error' ? ' is-err' : type === 'success' ? ' is-ok' : ''}`
    el.innerHTML = `${title ? `<div class="lsb-toast-title">${esc(title)}</div>` : ''}<div>${esc(message)}</div>`
    this._toastHost.appendChild(el)
    requestAnimationFrame(() => el.classList.add('is-in'))
    const close = () => {
      el.classList.remove('is-in')
      setTimeout(() => el.remove(), 200)
    }
    if (timeout) setTimeout(close, timeout)
    el.addEventListener('click', close)
    return close
  }

  confirm(message, { title = '确认' } = {}) {
    return new Promise((resolve) => {
      this.ensureBase()
      const mask = document.createElement('div')
      mask.className = 'lsb-mask'
      const box = document.createElement('div')
      box.className = 'lsb-panel'
      box.style.width = 'min(400px,92vw)'
      box.innerHTML = `
        <div class="lsb-panel-head"><strong>${esc(title)}</strong></div>
        <div class="lsb-view">${esc(message)}</div>
        <div class="lsb-actions">
          <button class="lsb-btn" data-no>取消</button>
          <button class="lsb-btn is-primary" data-yes>确定</button>
        </div>`
      const done = (v) => {
        mask.remove()
        box.remove()
        resolve(v)
      }
      box.querySelector('[data-yes]').onclick = () => done(true)
      box.querySelector('[data-no]').onclick = () => done(false)
      mask.onclick = () => done(false)
      document.body.append(mask, box)
    })
  }

  /* ─────────── 设置面板 ─────────── */

  /**
   * 注册一个面板分页。render(container, ctx) 由插件实现。
   * 返回注销函数。
   */
  registerTab({ id, name, order = 100, render }) {
    const tid = id || uid('tab')
    let tab = this._tabs.find((t) => t.id === tid)
    if (tab) {
      tab.name = name
      tab.order = order
      tab.render = render
    } else {
      tab = { id: tid, name, order, render }
      this._tabs.push(tab)
    }
    this._tabs.sort((a, b) => a.order - b.order || a.name.localeCompare(b.name))
    if (this._panel) this._renderTabs()
    return () => {
      this._tabs = this._tabs.filter((t) => t !== tab)
      if (this._panel) this._renderTabs()
    }
  }

  /** 右下角圆形入口按钮 */
  mountLauncher() {
    this.ensureBase()
    if (this._launcher) return
    const btn = document.createElement('button')
    btn.className = 'lsb-launcher'
    btn.type = 'button'
    btn.title = this.title
    btn.textContent = 'H'
    btn.onclick = () => this.openPanel()
    document.body.appendChild(btn)
    this._launcher = btn
  }

  /**
   * 油猴图标菜单项。无 GM_registerMenuCommand 时静默跳过（测试 / 非 TM 环境）。
   * 返回注销函数。
   */
  menuCommand(title, fn) {
    const register =
      (typeof GM_registerMenuCommand === 'function' && GM_registerMenuCommand) ||
      (typeof globalThis.GM_registerMenuCommand === 'function' && globalThis.GM_registerMenuCommand)
    if (typeof register !== 'function') return () => {}
    const id = register(String(title), fn)
    return () => {
      const unreg =
        (typeof GM_unregisterMenuCommand === 'function' && GM_unregisterMenuCommand) ||
        (typeof globalThis.GM_unregisterMenuCommand === 'function' && globalThis.GM_unregisterMenuCommand)
      if (typeof unreg === 'function' && id != null) {
        try {
          unreg(id)
        } catch {
          /* 各油猴实现注销接口略有差异 */
        }
      }
    }
  }

  openPanel(tabId) {
    this.ensureBase()
    if (this._panel) {
      if (tabId) this.showTab(tabId)
      return
    }
    const mask = document.createElement('div')
    mask.className = 'lsb-mask'
    const panel = document.createElement('div')
    panel.className = 'lsb-panel lsb-panel-settings'
    panel.innerHTML = `
      <div class="lsb-panel-head">
        <strong>${esc(this.title)}</strong>
        <span class="lsb-ver">v${esc(this.version)}</span>
        <button class="lsb-panel-close" title="关闭">×</button>
      </div>
      <div class="lsb-panel-body">
        <div class="lsb-tabs"></div>
        <div class="lsb-view"></div>
      </div>`
    const close = () => this.closePanel()
    panel.querySelector('.lsb-panel-close').onclick = close
    mask.onclick = close
    const onKey = (e) => {
      if (e.key === 'Escape') close()
    }
    document.addEventListener('keydown', onKey)
    this._panel = { mask, panel, onKey }
    document.body.append(mask, panel)
    trapOverscroll(mask)
    trapOverscroll(panel)
    this._renderTabs()
    this.showTab(tabId || this._tabs[0]?.id)
  }

  closePanel() {
    if (!this._panel) return
    document.removeEventListener('keydown', this._panel.onKey)
    this._panel.mask.remove()
    this._panel.panel.remove()
    this._panel = null
    this._activeTab = null
  }

  _renderTabs() {
    const host = this._panel?.panel.querySelector('.lsb-tabs')
    if (!host) return
    host.innerHTML = ''
    for (const t of this._tabs) {
      const b = document.createElement('button')
      b.className = `lsb-tab${t === this._activeTab ? ' is-active' : ''}`
      b.type = 'button'
      b.textContent = t.name
      b.onclick = () => this.showTab(t)
      host.appendChild(b)
    }
  }

  showTab(idOrTab) {
    const byObj = typeof idOrTab === 'object' && idOrTab && this._tabs.includes(idOrTab)
    const id = byObj ? idOrTab.id : idOrTab
    if (!this._panel) return this.openPanel(id)
    const tab = byObj ? idOrTab : this._tabs.find((t) => t.id === id) || this._tabs[0]
    const view = this._panel.panel.querySelector('.lsb-view')
    view.innerHTML = ''
    this._active = tab?.id || null
    this._activeTab = tab || null
    this._renderTabs()
    if (!tab) {
      view.innerHTML = '<div class="lsb-empty">还没有插件注册设置页。</div>'
      return
    }
    try {
      tab.render(view)
    } catch (e) {
      view.innerHTML = `<div class="lsb-empty">面板渲染失败：${esc(e.message)}</div>`
      console.error('[LSB ui] tab render', e)
    }
  }

  /* ─────────── 表单构建（给插件写设置页省事） ─────────── */

  /**
   * 由 schema 生成表单，onSave 收到完整值对象。
   * schema: { key: { type:'text'|'password'|'number'|'switch'|'select'|'textarea', label, desc, default, options } }
   */
  buildForm(container, schema, values, onSave) {
    const form = document.createElement('div')
    const inputs = {}
    for (const [key, rawSpec] of Object.entries(schema || {})) {
      const spec = typeof rawSpec === 'object' && rawSpec ? rawSpec : { default: rawSpec }
      const cur = values?.[key] ?? spec.default
      const label = document.createElement('label')
      label.className = 'lsb-field'
      const span = document.createElement('span')
      span.textContent = spec.label || key
      label.appendChild(span)
      let input
      if (spec.type === 'switch' || typeof cur === 'boolean') {
        input = document.createElement('input')
        input.type = 'checkbox'
        input.checked = !!cur
        label.style.display = 'flex'
        label.style.alignItems = 'center'
        label.style.gap = '8px'
        label.prepend(input)
        label.removeChild(span)
        const t = document.createElement('span')
        t.textContent = spec.label || key
        t.style.margin = '0'
        label.appendChild(t)
      } else if (spec.type === 'select') {
        input = document.createElement('select')
        for (const opt of spec.options || []) {
          const o = document.createElement('option')
          o.value = typeof opt === 'object' ? opt.value : opt
          o.textContent = typeof opt === 'object' ? opt.label : opt
          if (String(o.value) === String(cur)) o.selected = true
          input.appendChild(o)
        }
        label.appendChild(input)
      } else if (spec.type === 'textarea') {
        input = document.createElement('textarea')
        input.rows = spec.rows || 4
        input.value = cur ?? ''
        label.appendChild(input)
      } else {
        input = document.createElement('input')
        input.type = spec.type === 'number' ? 'number' : spec.type === 'password' ? 'password' : 'text'
        input.value = cur ?? ''
        label.appendChild(input)
      }
      if (spec.desc) {
        const d = document.createElement('div')
        d.className = 'lsb-row-desc'
        d.textContent = spec.desc
        label.appendChild(d)
      }
      inputs[key] = { input, spec }
      form.appendChild(label)
    }
    const bar = document.createElement('div')
    bar.style.display = 'flex'
    bar.style.gap = '8px'
    bar.style.justifyContent = 'flex-end'
    const save = document.createElement('button')
    save.className = 'lsb-btn is-primary'
    save.textContent = '保存'
    save.onclick = () => {
      const out = {}
      for (const [k, { input, spec }] of Object.entries(inputs)) {
        out[k] = input.type === 'checkbox'
          ? input.checked
          : spec.type === 'number'
            ? Number(input.value)
            : input.value
      }
      onSave(out)
      this.toast('已保存', { type: 'success' })
    }
    bar.appendChild(save)
    container.append(form, bar)
    return inputs
  }

  /* ─────────── 页面内挂点 ─────────── */

  /** 往某楼层的操作区加按钮（.post-ops 是站点自带的容器） */
  addPostAction(postEl, { label, title, onClick, icon = '' }) {
    const ops = postEl.querySelector('.post-ops')
    if (!ops) return null
    let host = ops.querySelector('.lsb-ops')
    if (!host) {
      host = document.createElement('span')
      host.className = 'lsb-ops'
      ops.appendChild(host)
    }
    const btn = document.createElement('button')
    btn.type = 'button'
    btn.className = 'lsb-op'
    btn.title = title || label
    btn.innerHTML = `${icon}${esc(label)}`
    btn.onclick = (e) => {
      e.preventDefault()
      onClick(e)
    }
    host.appendChild(btn)
    return btn
  }

  /** 往顶栏加一个链接/按钮 */
  addTopLink({ label, href = '#', onClick, title }) {
    const nav = document.querySelector('.themes-top-menu .forum-nav') || document.querySelector('.forum-nav')
    if (!nav) return null
    const a = document.createElement('a')
    a.className = 'forum-link lsb-top-link'
    a.href = href
    a.textContent = label
    if (title) a.title = title
    if (onClick) {
      a.onclick = (e) => {
        e.preventDefault()
        onClick(e)
      }
    }
    nav.appendChild(a)
    return a
  }
}
