// ==UserScript==
// @name         LSB·本地联动
// @namespace    https://linux.sb/
// @version      1.0.1
// @description  与本机 linuxsb-workbench（默认 127.0.0.1:7788）联动：健康监视、浏览预热缓存、一键把当前帖送进本地分析流水线。需要 LINUX.SB 基座。
// @author       you
// @match        https://linux.sb/*
// @grant        none
// @run-at       document-end
// @noframes
// ==/UserScript==

/**
 * 三种联动方式：
 *  1. 预热：浏览帖子时让 workbench 的 /api/topic 缓存热起来（边看边喂）
 *  2. 触发：主楼按钮把当前帖 id 发给 POST /api/analyze，由服务端用自己的 Cookie 抓取并跑分析
 *  3. 监视：定期 /api/state，掉线/上线弹提示；面板显示服务端配置摘要与分析历史
 *
 * 首次请求 127.0.0.1 时 Tampermonkey 会弹跨域确认，允许即可。
 */
(function () {
  'use strict'

  const SCHEMA = {
    apiUrl: { type: 'text', label: 'workbench 地址', default: 'http://127.0.0.1:7788' },
    mode: {
      type: 'select',
      label: '分析模式',
      default: 'llm',
      options: [
        { value: 'llm', label: 'LLM 深度分析' },
        { value: 'local', label: '仅本地统计（不调模型）' },
      ],
    },
    warmCache: { type: 'switch', label: '浏览时自动预热服务端缓存', default: true },
    healthSec: { type: 'number', label: '健康检查间隔 (秒，0=关闭)', default: 60 },
    showLink: { type: 'switch', label: '顶栏显示「工作台」入口', default: true },
  }

  const manifest = {
    id: 'local-bridge',
    name: '本地联动',
    version: '1.0.1',
    description: '浏览器 ↔ 本机 workbench：预热缓存、触发分析、健康监视',
    author: 'you',
    requires: { base: '^0.1.0' },
    permissions: ['read', 'storage', 'ui', 'events', 'net'],
    pages: ['topic', 'home', 'forum'],
    config: SCHEMA,
  }

  function setup(api) {
    let cfg = api.config()
    let state = null // 最近一次 /api/state 结果
    let everOnline = false

    const base = () => (cfg.apiUrl || '').replace(/\/+$/, '')
    const RAW_OPTS = { external: true, backoff: { rate: 50, err: 50 } }

    /* ── 历史记录 ── */
    const histGet = () => api.store.get('history', []) || []
    function pushHist(rec) {
      api.store.set('history', [rec, ...histGet()].slice(0, 50))
    }

    /* ── 健康 ── */
    async function health() {
      try {
        const res = await api.net.raw(base() + '/api/state', {
          ...RAW_OPTS,
          headers: { accept: 'application/json' },
        })
        if (!res.ok) throw new Error('HTTP ' + res.status)
        const j = JSON.parse(res.text)
        if (!j.ok) throw new Error('bad state')
        const was = everOnline
        state = j
        everOnline = true
        if (!was) api.ui.toast(`本地工作台在线 · 已缓存 ${j.topics?.length ?? 0} 帖`, { title: '本地联动', type: 'success' })
        return { online: true, state: j }
      } catch (e) {
        if (everOnline) api.ui.toast('本地工作台失联', { title: '本地联动', type: 'error' })
        everOnline = false
        return { online: false, error: String((e && e.message) || e) }
      }
    }

    /* ── 预热：让服务端缓存当前帖 ── */
    async function warm(topicId) {
      try {
        await api.net.raw(`${base()}/api/topic?id=${topicId}`, {
          ...RAW_OPTS,
          headers: { accept: 'application/json' },
        })
        return true
      } catch {
        return false // 离线时静默
      }
    }

    /* ── 触发分析 ── */
    async function analyze(topicId, modeOverride) {
      const mode = modeOverride || cfg.mode || 'llm'
      const t0 = Date.now()
      const body = mode === 'controversy'
        ? { mode, snapshotIds: [topicId] }
        : { mode, topicIds: [topicId] }
      try {
        const res = await api.net.raw(base() + '/api/analyze', {
          method: 'POST',
          ...RAW_OPTS,
          headers: { 'content-type': 'application/json', accept: 'application/json' },
          body: JSON.stringify(body),
        })
        if (!res.ok) throw new Error('HTTP ' + res.status + ': ' + String(res.text).slice(0, 160))
        const j = JSON.parse(res.text)
        if (!j.ok) throw new Error(j.error || 'analyze failed')
        pushHist({ tid: topicId, mode, ts: Date.now(), ms: Date.now() - t0, ok: true, chars: JSON.stringify(j).length })
        api.ui.toast(`分析完成（${Date.now() - t0}ms），结果已返回`, { title: '本地联动', type: 'success' })
        return j
      } catch (e) {
        const msg = String((e && e.message) || e)
        pushHist({ tid: topicId, mode, ts: Date.now(), ms: Date.now() - t0, ok: false, error: msg.slice(0, 160) })
        api.ui.toast(msg, { title: '本地分析失败', type: 'error', timeout: 5000 })
        throw e
      }
    }

    /* ── 帖子页：预热 + 按钮 ── */
    if (api.page.type === 'topic') {
      const tid = api.page.id
      if (cfg.warmCache) warm(tid) // 边看边喂：fire-and-forget

      api.dom.each(`li.post-entry#post-${tid}`, (li) => {
        api.ui.postAction(li, {
          label: '🛰 本地分析',
          title: `发送到 ${cfg.apiUrl} 运行${cfg.mode === 'llm' ? ' LLM' : '本地'}分析`,
          onClick: () => {
            analyze(tid).catch(() => {})
          },
        })
      })
    }

    if (cfg.showLink) {
      api.ui.topLink({
        label: '🛰 工作台',
        href: base() + '/',
        title: '打开本机 linuxsb-workbench 界面',
      })
    }

    /* ── 定期健康检查 ── */
    let healthTimer = null
    function armHealth() {
      if (healthTimer) {
        clearInterval(healthTimer)
        healthTimer = null
      }
      const sec = Number(cfg.healthSec)
      if (sec > 0) {
        healthTimer = setInterval(() => void health(), sec * 1000)
        healthTimer.unref?.()
      }
    }
    armHealth()
    api.on('config:changed:local-bridge', () => {
      cfg = api.config()
      armHealth()
    })
    api.onDispose(() => {
      if (healthTimer) clearInterval(healthTimer)
    })
    void health()

    /* ── 面板 ── */
    api.ui.tab({
      name: '本地联动',
      order: 67,
      render(host) {
        // 配置表单
        api.ui.buildForm(host, SCHEMA, cfg, (v) => {
          cfg = api.saveConfig(v)
          api.ui.toast('已保存，重新探测中…')
          health().then(() => api.ui.showTab('local-bridge'))
        })

        const box = document.createElement('div')
        host.appendChild(box)

        function renderState() {
          const dot = state ? '🟢 在线' : everOnline ? '🔴 离线' : '⚪ 未探测'
          const c = state?.config
          box.innerHTML = `
            <div class="lsb-row">
              <div class="lsb-row-main">
                <div class="lsb-row-name">${dot} <span class="lsb-badge">${api.util.esc(cfg.apiUrl)}</span></div>
                <div class="lsb-row-desc">${
                  state
                    ? `缓存 ${state.topics?.length ?? 0} 帖 · LLM ${c?.llmConfigured ? '已配置 (' + api.util.esc(c.llmModel || '') + ')' : '未配置'} · Cookie ${c?.cookieSet ? '已设置' : '未设置'}`
                    : '无法连接到 workbench —— 请确认 server.mjs 正在运行'
                }</div>
              </div>
              <button class="lsb-btn" data-recheck>重新探测</button>
            </div>
            <div class="lsb-row-desc" style="margin:8px 0 4px">分析历史（最近 50 次）</div>`

          box.querySelector('[data-recheck]').onclick = () =>
            health().then(renderState)

          const hist = histGet()
          if (!hist.length) {
            box.insertAdjacentHTML('beforeend', '<div class="lsb-empty">还没有分析记录。</div>')
          } else {
            box.insertAdjacentHTML(
              'beforeend',
              hist.slice(0, 20)
                .map(
                  (h) => `
                <div class="lsb-row">
                  <div class="lsb-row-main">
                    <a class="lsb-row-name" href="${api.routes.topic(h.tid)}">帖子 #${h.tid}</a>
                    <div class="lsb-row-desc">${h.mode} · ${h.ok ? '✅ ' + h.ms + 'ms · 返回 ' + h.chars + ' 字符' : '❌ ' + api.util.esc(h.error || '')} · ${new Date(h.ts).toLocaleTimeString('zh-CN')}</div>
                  </div>
                  <a class="lsb-btn" href="${api.routes.topic(h.tid)}">原帖</a>
                </div>`,
                )
                .join(''),
            )
            const clear = document.createElement('button')
            clear.className = 'lsb-btn'
            clear.textContent = '清空历史'
            clear.style.marginTop = '8px'
            clear.onclick = async () => {
              if (await api.ui.confirm('清空分析历史？')) {
                api.store.set('history', [])
                api.ui.showTab('local-bridge')
              }
            }
            box.appendChild(clear)
          }
        }
        renderState()
      },
    })

    /* ── 对外 RPC：其它插件可复用联动能力 ── */
    api.handle('local-bridge:health', () => health())
    api.handle('local-bridge:warm', ({ topicId }) => warm(topicId))
    api.handle('local-bridge:analyze', ({ topicId, mode }) => analyze(topicId, mode))

    /* ── 调试接口 ── */
    api.handle('local-bridge:debug', () => ({
      health,
      warm,
      analyze,
      state: () => state,
      history: histGet,
      buttons: () => [...document.querySelectorAll('.lsb-op')].map((b) => b.textContent),
    }))

    return {}
  }

  const w = typeof unsafeWindow !== 'undefined' ? unsafeWindow : window
  if (w.LSB && w.LSB.register) w.LSB.register(manifest, setup)
  else {
    w.LSB_PLUGINS = w.LSB_PLUGINS || []
    w.LSB_PLUGINS.push({ manifest, setup })
  }
})()
