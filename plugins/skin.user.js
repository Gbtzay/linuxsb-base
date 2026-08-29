// ==UserScript==
// @name         LSB·界面精修
// @namespace    https://linux.sb/
// @version      1.1.49
// @description  氢壳（左栏+顶栏+帖内时间轴）与排版层：正文行高、列表密度、代码块、楼层分隔、限宽阅读。只动结构与排版，不碰配色。需要 LINUX.SB 基座。
// @author       you
// @match        https://linux.sb/*
// @grant        none
// @run-at       document-end
// @noframes
// ==/UserScript==

(function () {
  'use strict'

  const manifest = {
    id: 'skin',
    name: '界面精修',
    version: '1.1.49',
    description: '氢壳 + 正文排版/列表密度/代码块/楼层优化/限宽阅读，分项开关',
    author: 'you',
    requires: { base: '^0.1.0' },
    permissions: ['ui', 'storage', 'events', 'read'],
    config: {
      shell: { type: 'switch', label: '氢壳（左栏导航 + 顶栏）', default: true },
      typography: { type: 'switch', label: '正文排版（行高 1.75 · 中文字体栈）', default: true },
      density: {
        type: 'select',
        label: '列表密度',
        default: '舒适',
        options: ['紧凑', '舒适'],
      },
      codeblock: { type: 'switch', label: '代码块样式强化', default: true },
      floors: { type: 'switch', label: '楼层优化（分隔线）', default: true },
      measure: { type: 'switch', label: '宽屏限宽阅读（≥1280px 生效）', default: false },
    },
  }

  function setup(api) {
    let cfg = api.config()
    let searchHome = null
    let userCardHome = null
    const extrasHomes = new Map()
    const asideHomes = new Map()
    let themeToggleHome = null
    let colorSchemeHome = null
    let onlineObs = null
    let extrasObs = null
    let timelineRaf = 0
    let refreshTimer = 0
    let windowListening = false
    let spaSerial = 0
    let spaFilledSerial = 0
    let toolsCache = null
    let spaProgressTimer = 0
    let spaIgnorePop = false
    let spaBound = false
    let homeInf = null
    let spaViewKey = ''
    const VIEW_CACHE_MAX = 5
    const HOME_STASH_REFRESH_MS = 30000
    const viewCache = new Map()
    let homeStashTimer = 0
    let homeStashInflight = null
    let homeStashGen = 0
    let homeStashPending = false

    /* ── 共存检测：色彩主题已由其它脚本负责，本模块只做排版层，天然无冲突。
       若未来加入色彩子项，须在此让位。 ── */
    const themesPresent = !!document.querySelector('style[data-themes-plugin]')

    const FONT_SANS =
      "system-ui,-apple-system,'Segoe UI','PingFang SC','Hiragino Sans GB','Microsoft YaHei','Noto Sans SC',sans-serif"
    const FONT_MONO =
      "ui-monospace,SFMono-Regular,'Cascadia Code',Consolas,'JetBrains Mono','Noto Sans Mono CJK SC',monospace"

    function esc(s) {
      return String(s ?? '').replace(/[&<>"']/g, (c) =>
        ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c],
      )
    }

    function shellCss() {
      return `
        html.lsb-skin-shell-on{
          --lsb-shell-header:48px;
          --lsb-shell-rail:240px;
          --lsb-shell-gutter:12px;
          --lsb-shell-panel-pad:24px;
          --lsb-shell-main-inset:calc(var(--lsb-shell-gutter) + var(--lsb-shell-panel-pad));
          --lsb-shell-aside:280px;
          --lsb-shell-timeline:72px;
          --lsb-radius:12px;
          --lsb-radius-sm:8px;
          --lsb-radius-lg:16px;
          background:var(--bg,#f4f5f7);
          color:var(--text,#222);
        }
        html.lsb-skin-shell-topic{--lsb-shell-main-inset:var(--lsb-shell-gutter)}
        html.lsb-skin-shell-user{--lsb-shell-main-inset:calc(var(--lsb-shell-gutter) + 12px)}
        html[data-themes-color-mode="dark"],html[data-dark-mode-theme="dark"]{color-scheme:dark}
        html[data-themes-color-mode="light"],html[data-dark-mode-theme="light"]{color-scheme:light}
        #lsb-shell{
          display:none;position:fixed;inset:0;z-index:7999;pointer-events:none;
        }
        #lsb-shell > *{pointer-events:auto}
        #lsb-shell-header{
          position:fixed;top:0;left:0;right:0;height:var(--lsb-shell-header);z-index:8002;
          display:grid;align-items:center;
          grid-template-columns:var(--lsb-shell-rail) minmax(160px,360px) minmax(0,1fr) auto auto;
          column-gap:0;padding:0 16px 0 0;
          background:color-mix(in srgb,var(--panel,#fff) 78%,transparent);
          backdrop-filter:blur(16px) saturate(140%);
          -webkit-backdrop-filter:blur(16px) saturate(140%);
          box-shadow:0 1px 0 color-mix(in srgb,var(--line,#ddd) 55%,transparent);
          font-family:${FONT_SANS};
        }
        #lsb-shell-rail{
          position:fixed;top:0;left:0;bottom:0;width:var(--lsb-shell-rail);z-index:8001;
          display:flex;flex-direction:column;
          background:var(--bg,#f4f5f7);color:var(--text,#222);
          border-right:1px solid var(--line-soft,#e8e8e8);
          font-family:${FONT_SANS};
        }
        .lsb-shell-rail-scroll{flex:1;min-height:0;overflow:hidden;padding:56px 12px 12px}
        .lsb-shell-me{margin:0 0 14px}
        .lsb-shell-me .sidebar-card.user-card{
          margin:0;padding:10px 10px;border:0;box-shadow:none;
          border-radius:var(--lsb-radius);
          background:color-mix(in srgb,var(--panel,#fff) 72%,transparent);
        }
        .lsb-shell-me .user-header-info{gap:8px}
        .lsb-shell-me .user-avatar-big img,.lsb-shell-me .avatar-img{
          width:40px!important;height:40px!important;
        }
        .lsb-shell-me .user-name{font-size:13px;font-weight:600;white-space:nowrap;overflow:hidden;text-overflow:ellipsis}
        .lsb-shell-me .user-rank{font-size:11px;color:var(--text-muted,#888)}
        .lsb-shell-rail-foot{padding:10px 12px 14px;border-top:1px solid var(--line-soft,#e8e8e8)}
        .lsb-shell-brand{
          display:flex;align-items:center;gap:8px;margin:0;width:100%;height:100%;
          padding:0 14px;font-weight:700;font-size:14px;letter-spacing:-.02em;
          color:var(--text,#222);text-decoration:none;
          min-width:0;white-space:nowrap;overflow:hidden;
        }
        .lsb-shell-logo{
          flex:0 0 22px;width:22px;height:22px;border-radius:6px;display:block;
        }
        .lsb-shell-search-host{
          min-width:0;max-width:360px;width:100%;box-sizing:border-box;
          padding-left:var(--lsb-shell-main-inset);
        }
        .lsb-shell-search-host .search-form,.lsb-shell-search-host .lsb-shell-search{
          display:flex;align-items:center;gap:8px;margin:0;padding:3px 6px 3px 10px;
          width:100%;max-width:none;justify-self:stretch;
          grid-column:auto;grid-row:auto;
          border-radius:var(--lsb-radius);overflow:hidden;
          background:color-mix(in srgb,var(--bg,#f4f5f7) 88%,transparent);
        }
        .lsb-shell-search-host .search-page-link{
          display:flex;align-items:center;margin:0;padding:0;width:100%;max-width:none;height:30px;
          grid-area:auto;grid-column:auto;grid-row:auto;justify-self:stretch;
          border:1px solid var(--line,#ddd);border-radius:var(--lsb-radius);
          background:color-mix(in srgb,var(--bg,#f4f5f7) 88%,transparent);
          color:var(--text-subtle,#888);text-decoration:none;overflow:hidden;
        }
        .lsb-shell-search-host .search-page-fake-input{
          flex:1;min-width:0;padding:0 10px;font-size:13px;
          white-space:nowrap;overflow:hidden;text-overflow:ellipsis;
        }
        .lsb-shell-search-host .search-page-fake-icon{
          display:inline-flex;align-items:center;justify-content:center;
          flex:0 0 30px;width:30px;height:100%;
        }
        .lsb-shell-search-host select{
          border:0;border-radius:var(--lsb-radius-sm);background:transparent;
          color:var(--text,#222);font-size:12px;height:26px;
        }
        .lsb-shell-search-host input[type=search],.lsb-shell-search-host input[name=q]{
          flex:1;min-width:0;height:26px;border:0;border-radius:var(--lsb-radius-sm);
          background:transparent;color:var(--text,#222);padding:0 8px;font-size:13px;
        }
        .lsb-shell-search-host button{
          border:0;border-radius:var(--lsb-radius-sm);height:26px;padding:0 10px;
          background:var(--brand-soft,#e8f4f2);color:var(--brand,#5eaaa0);font-size:12px;cursor:pointer;
        }
        .lsb-shell-extras{
          display:flex;align-items:center;gap:14px;min-width:0;overflow:hidden;
          margin-left:16px;
        }
        .lsb-shell-extras a{
          flex:0 0 auto;color:var(--text,#222);text-decoration:none;font-size:13px;font-weight:500;
          white-space:nowrap;
        }
        .lsb-shell-where{
          margin-left:16px;font-size:13px;font-weight:600;letter-spacing:-.01em;
          color:var(--text,#222);white-space:nowrap;overflow:hidden;text-overflow:ellipsis;max-width:22vw;
        }
        .lsb-shell-theme{margin-left:8px;display:flex;align-items:center;gap:8px;overflow:visible;position:relative}
        .lsb-shell-theme [data-themes-mode-toggle]{
          border:0;background:transparent;color:var(--text,#222);cursor:pointer;
          width:32px;height:32px;padding:4px;border-radius:var(--lsb-radius-sm);
        }
        .lsb-shell-theme [data-themes-mode-toggle] svg{display:block;width:18px;height:18px}
        .lsb-shell-theme .dark-mode-control{position:relative;flex:0 0 auto;grid-area:auto;justify-self:auto}
        .lsb-shell-theme .dark-mode-menu{z-index:8003}
        .lsb-shell-theme .color-scheme-top-link{
          display:inline-flex;width:30px;height:30px;align-items:center;justify-content:center;
          grid-area:auto;justify-self:auto;flex:0 0 30px;
          color:var(--text-muted,#888);text-decoration:none;
        }
        .lsb-shell-theme .color-scheme-top-link svg{width:17px;height:17px;display:block}
        #lsb-shell-aside{
          display:none;position:fixed;top:var(--lsb-shell-header);right:0;bottom:0;
          width:var(--lsb-shell-aside);z-index:7999;overflow:auto;padding:12px 10px 16px;
          background:var(--bg,#f4f5f7);color:var(--text,#222);
          border-left:1px solid var(--line-soft,#e8e8e8);
          font-family:${FONT_SANS};
        }
        #lsb-shell-aside .sidebar-card{
          margin:0 0 10px;padding:10px 10px 8px;border-radius:var(--lsb-radius);
          background:color-mix(in srgb,var(--panel,#fff) 78%,transparent);
        }
        .lsb-shell-nav-section{margin:0 0 16px}
        .lsb-shell-nav-section h2{
          margin:0 8px 6px;font-size:11px;font-weight:600;color:var(--text-muted,#888);
          letter-spacing:.04em;
        }
        .lsb-shell-nav .lsb-shell-link{
          display:flex;align-items:center;justify-content:space-between;gap:8px;padding:6px 10px;border-radius:var(--lsb-radius-sm);
          color:var(--text,#222);text-decoration:none;font-size:13px;font-weight:500;
          width:100%;border:0;background:transparent;cursor:pointer;text-align:left;font-family:inherit;box-sizing:border-box;
        }
        .lsb-shell-nav .lsb-shell-link-label{
          min-width:0;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;
        }
        .lsb-shell-nav .lsb-shell-count{
          flex:0 0 auto;font-size:11px;font-weight:500;color:var(--text-muted,#888);
          font-variant-numeric:tabular-nums;
        }
        .lsb-shell-nav a.is-active{
          background:var(--brand-soft,#e8f4f2);color:var(--brand,#5eaaa0);font-weight:600;
        }
        .lsb-shell-settings{
          width:100%;height:32px;border:0;border-radius:var(--lsb-radius-sm);cursor:pointer;
          background:transparent;color:var(--text,#222);font-size:13px;font-weight:600;
        }
        .lsb-shell-settings:active,.lsb-shell-nav .lsb-shell-link:active{transform:scale(.98)}
        #lsb-shell-timeline{
          position:fixed;top:calc(var(--lsb-shell-header) + 20px);right:14px;bottom:28px;
          width:var(--lsb-shell-timeline);z-index:7998;
          display:flex;flex-direction:column;align-items:center;gap:8px;
          font-family:${FONT_SANS};font-size:11px;font-weight:600;color:var(--text-muted,#888);
        }
        #lsb-shell-timeline[hidden]{display:none!important}
        html.lsb-skin-shell-on .image-lightbox-image{max-width:100%;max-height:100%}
        .lsb-shell-edge{
          border:0;background:transparent;color:var(--text,#222);cursor:pointer;
          font:inherit;font-weight:600;padding:4px;
        }
        .lsb-shell-edge:active{transform:scale(.97)}
        .lsb-shell-now{text-align:center;line-height:1.25}
        .lsb-shell-now strong{display:block;color:var(--text,#222);font-size:12px}
        .lsb-shell-track{
          flex:1;width:3px;padding:0;border:0;border-radius:99px;cursor:pointer;
          background:var(--line-soft,#e6e6e6);position:relative;min-height:64px;
        }
        .lsb-shell-thumb{
          position:absolute;left:50%;top:var(--lsb-timeline-progress,0%);
          width:8px;height:8px;margin:-4px 0 0 -4px;border-radius:50%;
          background:var(--brand,#5eaaa0);
        }
        html.lsb-skin-shell-on li.post-item{padding-block:8px!important;border-radius:var(--lsb-radius)}
        html.lsb-skin-shell-on li.post-item .post-title{
          font-weight:600;font-size:14px;letter-spacing:-.01em;line-height:1.3;
        }
        html.lsb-skin-shell-on li.post-item .post-meta{
          font-size:12px;font-weight:400;color:var(--text-muted,#888);
        }
        html.lsb-skin-shell-on li.post-item .post-avatar img{
          width:32px!important;height:32px!important;border-radius:50%;
        }
        html.lsb-skin-shell-on li.post-item:not(.post-entry) .meta-icon{display:none}
        html.lsb-skin-shell-on main.wrap{
          max-width:none!important;margin-left:0!important;margin-right:0!important;width:auto!important;
          padding-left:var(--lsb-shell-gutter)!important;
        }
        html.lsb-skin-shell-on .forum-layout.forum-layout-has-sidebar{gap:12px!important}
        html.lsb-skin-shell-on main.wrap,
        html.lsb-skin-shell-on .forum-main,
        html.lsb-skin-shell-on .home-shell{
          border-radius:var(--lsb-radius-lg);
        }
        html.lsb-skin-shell-on ul.post-list{
          border-radius:var(--lsb-radius-lg);
        }
        html.lsb-skin-shell-on li.post-entry{
          border-radius:var(--lsb-radius);
        }
        html.lsb-skin-shell-on .post-content img,
        html.lsb-skin-shell-on .post-content video{
          border-radius:var(--lsb-radius-sm);
        }
        html.lsb-skin-shell-on .pagination a,
        html.lsb-skin-shell-on .pagination span,
        html.lsb-skin-shell-on .tab-link,
        html.lsb-skin-shell-on .sort-tabs a{
          border-radius:var(--lsb-radius-sm)!important;
        }
        html.lsb-skin-shell-on .pagination-bar.sb-infinite-scroll-pagination-hidden{
          display:none!important;
        }
        html.lsb-skin-shell-on form.ajax-reply-form,
        html.lsb-skin-shell-on .reply-box,
        html.lsb-skin-shell-on textarea{
          border-radius:var(--lsb-radius)!important;
        }
        @media(min-width:900px){
          html.lsb-skin-shell-on #lsb-shell{display:block}
          html.lsb-skin-shell-on{padding-top:var(--lsb-shell-header);padding-left:var(--lsb-shell-rail)}
          html.lsb-skin-shell-topic{padding-right:var(--lsb-shell-timeline)}
          html.lsb-skin-shell-on .lsb-native-header-hidden,
          html.lsb-skin-shell-on .forum-more-region{display:none!important}
          html.lsb-skin-shell-on .lsb-native-sidebar-hidden{display:none!important}
          html.lsb-skin-shell-on .forum-layout.forum-layout-has-sidebar{
            display:block!important;grid-template-columns:1fr!important;
          }
          html.lsb-skin-shell-on .lsb-launcher{display:none!important}
          html.lsb-skin-shell-user{padding-right:var(--lsb-shell-aside)}
          html.lsb-skin-shell-user #lsb-shell-aside{display:block}
          html.lsb-skin-shell-on .image-lightbox-overlay{
            top:var(--lsb-shell-header);left:var(--lsb-shell-rail);right:0;bottom:0;
          }
          html.lsb-skin-shell-topic .image-lightbox-overlay{right:var(--lsb-shell-timeline)}
          html.lsb-skin-shell-user .image-lightbox-overlay{right:var(--lsb-shell-aside)}
        }
        @media(min-width:1100px){
          html.lsb-skin-shell-on{padding-right:var(--lsb-shell-aside)}
          html.lsb-skin-shell-topic{padding-right:var(--lsb-shell-aside)}
          html.lsb-skin-shell-on #lsb-shell-aside{display:block}
          html.lsb-skin-shell-on #lsb-shell-timeline{display:none!important}
          html.lsb-skin-shell-on .image-lightbox-overlay{right:var(--lsb-shell-aside)}
        }
        @media(hover:hover) and (pointer:fine){
          .lsb-shell-nav .lsb-shell-link:hover{background:color-mix(in srgb,var(--bg,#fff) 40%,transparent)}
          .lsb-shell-extras a:hover{color:var(--brand,#5eaaa0)}
          .lsb-shell-settings:hover{background:var(--brand-soft,#e8f4f2)}
        }
        @media(prefers-reduced-transparency:reduce){
          #lsb-shell-header{background:var(--panel,#fff);backdrop-filter:none;-webkit-backdrop-filter:none}
        }
        @media(prefers-reduced-motion:reduce){
          html.lsb-skin-shell-on #lsb-shell *{scroll-behavior:auto!important;transform:none!important}
          #lsb-shell-progress,
          #lsb-shell-progress [data-lsb-shell-progress-bar]{transition:none!important}
        }
        #lsb-shell-progress{
          --lsb-shell-progress:0;
          position:fixed;top:0;left:0;right:0;z-index:8002;height:2px;
          pointer-events:none;opacity:0;background:transparent;
          transition:opacity 120ms cubic-bezier(.23,1,.32,1);
        }
        #lsb-shell-progress[data-phase="loading"],
        #lsb-shell-progress[data-phase="done"]{opacity:1}
        #lsb-shell-progress [data-lsb-shell-progress-bar]{
          display:block;width:100%;height:100%;
          transform:scaleX(var(--lsb-shell-progress));transform-origin:left center;
          background:var(--brand,#5eaaa0);
          transition:transform 200ms cubic-bezier(.23,1,.32,1);
        }
      `
    }

    function css() {
      const parts = []

      if (cfg.shell) parts.push(shellCss())

      if (cfg.typography) {
        parts.push(`
          html.lsb-skin-type-on .post-content{font-family:${FONT_SANS};line-height:1.75;word-break:break-word}
          html.lsb-skin-type-on .post-content p{margin-block:.85em}
          html.lsb-skin-type-on .post-title{line-height:1.45}
        `)
      }

      if (cfg.density === '紧凑') {
        parts.push(`
          html.lsb-skin-density-compact ul.post-list li.post-item{padding-block:3px!important}
          html.lsb-skin-density-compact li.post-item .post-avatar img{width:32px!important;height:32px!important}
        `)
      }

      if (cfg.codeblock) {
        parts.push(`
          html.lsb-skin-code-on .post-content pre{
            background:var(--bg,#f6f8fa)!important;border:1px solid var(--line,#ddd)!important;
            border-radius:8px!important;padding:12px 14px!important;overflow-x:auto!important;
            font-family:${FONT_MONO}!important;font-size:13px!important;line-height:1.55!important;
          }
          html.lsb-skin-code-on .post-content code{font-family:${FONT_MONO}}
          html.lsb-skin-code-on .post-content :not(pre)>code{
            background:var(--line-soft,#eceff2);border-radius:4px;padding:1px 5px;font-size:.92em;
          }
        `)
      }

      if (cfg.floors) {
        parts.push(`
          html.lsb-skin-floors-on li.post-entry{border-bottom:1px solid var(--line-soft,#eee)}
        `)
      }

      if (cfg.measure) {
        parts.push(`
          @media(min-width:1280px){
            html.lsb-skin-measure-on main.wrap{max-width:1120px!important;margin-inline:auto!important}
            html.lsb-skin-measure-on .post-content>p{max-width:74ch}
          }
        `)
      }

      return parts.join('\n')
    }

    /** 状态类挂 <html> 上：CSS 特异性干净，测试也容易断言 */
    function applyMarkers() {
      const root = document.documentElement
      root.classList.toggle('lsb-skin-type-on', !!cfg.typography)
      root.classList.toggle('lsb-skin-density-compact', cfg.density === '紧凑')
      root.classList.toggle('lsb-skin-code-on', !!cfg.codeblock)
      root.classList.toggle('lsb-skin-floors-on', !!cfg.floors)
      root.classList.toggle('lsb-skin-measure-on', !!cfg.measure)
      root.classList.toggle('lsb-skin-shell-on', !!cfg.shell)
      root.classList.toggle('lsb-skin-shell-topic', !!cfg.shell && api.page?.type === 'topic')
      root.classList.toggle('lsb-skin-shell-user', !!cfg.shell && api.page?.type === 'user')
    }

    function restyle() {
      applyMarkers()
      const id = 'lsb-skin-style'
      let el = document.getElementById(id)
      if (!el) {
        el = document.createElement('style')
        el.id = id
        document.head.appendChild(el)
      }
      el.textContent = css()
    }

    function nativeSidebars() {
      return [...document.querySelectorAll('aside.sidebar')].filter(
        (el) => el.id !== 'mobile-menu-drawer' && !el.classList.contains('mobile-menu-drawer'),
      )
    }

    function markNative(on) {
      document.querySelector('body > .top')?.classList.toggle('lsb-native-header-hidden', on)
      for (const el of nativeSidebars()) el.classList.toggle('lsb-native-sidebar-hidden', on)
    }

    function collectBoards() {
      const forums = api.forums || []
      const cached = api.store.get('boardCounts') || {}
      const live = {}
      for (const f of forums) {
        if (Number.isFinite(f.topics)) live[f.id] = f.topics
      }
      const counts = { ...cached, ...live }
      if (Object.keys(live).length) api.store.set('boardCounts', counts)
      if (forums.length) {
        return forums.map((f) => ({
          href: `/forum/${f.id}`,
          label: f.name,
          count: counts[f.id],
        }))
      }
      const seen = new Set()
      const out = []
      for (const a of document.querySelectorAll('.forum-nav a[href^="/forum/"]')) {
        const href = a.getAttribute('href')
        const label = (a.textContent || '').trim()
        if (!href || seen.has(href)) continue
        seen.add(href)
        const id = Number((href.match(/\/forum\/(\d+)/) || [])[1])
        out.push({ href, label, count: counts[id] })
      }
      return out
    }

    function collectTools() {
      if (toolsCache) return toolsCache
      const w = typeof unsafeWindow !== 'undefined' ? unsafeWindow : window
      const active = new Set(
        (w.LSB?.info?.().plugins || []).filter((p) => p.state === 'active').map((p) => p.id),
      )
      toolsCache = [
        { plugin: 'ai-summary', panel: 'ai-summary-history', label: 'AI 历史' },
        { plugin: 'checkin-calendar', panel: 'checkin-calendar', label: '签到日历' },
        { plugin: 'points-ledger', panel: 'points-ledger', label: '积分趋势' },
        { plugin: 'title-quotes', rpc: 'title-quotes:open', label: '称号行情' },
        { plugin: 'annual-report', panel: 'annual-report', label: '年度报告' },
      ]
        .filter((t) => active.has(t.plugin))
        .map(({ panel, rpc, label }) => (rpc ? { rpc, label } : { panel, label }))
      return toolsCache
    }

    function invalidateTools() {
      toolsCache = null
    }

    function locationText() {
      const p = api.page || {}
      if (p.type === 'home') {
        if (p.sort === 'lucky') return '抽奖'
        if (p.sort === 'card') return '发卡'
        if (p.sort === 'comment') return '新评论'
        return '全部主题'
      }
      if (p.type === 'forum') {
        const f = (api.forums || []).find((x) => x.id === p.id)
        return f?.name || '版块'
      }
      if (p.type === 'topic') {
        try {
          const title = api.parse.topic(document)?.title
          if (title) return title
        } catch {
          /* 解析失败则读标题节点 */
        }
        return (document.querySelector('h1.post-content-title')?.textContent || '').trim() || '帖子'
      }
      if (p.type === 'user') return '用户'
      if (p.type === 'featured') return '精华'
      if (p.type === 'footprint') return '足迹'
      if (p.type === 'gacha') return '称号抽取'
      if (p.type === 'gacha_market') return '称号交易'
      if (p.type === 'gacha_profile') return '我的称号'
      if (p.type === 'wallet') return '我的烧饼'
      if (p.type === 'invite') return '邀请中心'
      return 'LINUX SB'
    }

    function isActiveHref(href) {
      const p = api.page || {}
      if (href === '/' || href === '') return p.type === 'home'
      if (p.type === 'forum') return href === `/forum/${p.id}`
      return false
    }

    function restoreNode(el, home, cls) {
      if (!el) return
      el.classList.remove(cls)
      if (!home?.parent?.isConnected) {
        el.remove()
        return
      }
      if (home.next?.parentNode === home.parent) {
        home.parent.insertBefore(el, home.next)
      } else {
        home.parent.append(el)
      }
    }

    function adoptSearch(host) {
      if (!(host instanceof Element)) return
      if (host.querySelector('form, .search-page-link')) return
      const el =
        document.querySelector('body > .top .search-form') ||
        document.querySelector('body > .top .search-page-link') ||
        document.querySelector('.search-form') ||
        document.querySelector('a.search-page-link')
      if (!(el instanceof Element) || host.contains(el)) return
      searchHome = { parent: el.parentNode, next: el.nextSibling }
      el.classList.add('lsb-shell-search')
      host.append(el)
    }

    function restoreSearch() {
      const el = document.querySelector('.lsb-shell-search')
      restoreNode(el, searchHome, 'lsb-shell-search')
      searchHome = null
    }

    function findNativeUserCard() {
      const hosted = document.querySelector('#lsb-shell [data-lsb-shell-me] .sidebar-card.user-card')
      if (hosted) return hosted
      for (const side of nativeSidebars()) {
        const card = side.querySelector('.sidebar-card.user-card')
        if (card) return card
      }
      return document.querySelector('aside.sidebar .sidebar-card.user-card')
    }

    function isSelfUserCard(card) {
      if (!(card instanceof Element)) return false
      const uid = api.me?.uid
      if (uid == null) return true
      const href = card.querySelector('a.user-name')?.getAttribute('href') || ''
      return href.includes(`/user/${uid}`)
    }

    function findIncomingSelfCard(host) {
      for (const side of nativeSidebars()) {
        for (const card of side.querySelectorAll('.sidebar-card.user-card')) {
          if (host?.contains(card)) continue
          if (!isSelfUserCard(card)) continue
          return card
        }
      }
      return null
    }

    function userCardKey(card) {
      if (!(card instanceof Element)) return ''
      return [...card.querySelectorAll('a[href]')]
        .map((a) => a.getAttribute('href') || '')
        .join('\n')
    }

    function adoptUserCard(host) {
      if (!(host instanceof Element)) return
      const incoming = findIncomingSelfCard(host)
      const hosted = host.querySelector('.sidebar-card.user-card')
      if (incoming && incoming !== hosted) {
        if (hosted && userCardKey(hosted) === userCardKey(incoming)) return
        if (hosted) restoreUserCard()
        userCardHome = { parent: incoming.parentNode, next: incoming.nextSibling }
        incoming.classList.add('lsb-shell-user-card')
        host.append(incoming)
        return
      }
      if (hosted) return
      const card = findNativeUserCard()
      if (!(card instanceof Element) || host.contains(card) || !isSelfUserCard(card)) return
      userCardHome = { parent: card.parentNode, next: card.nextSibling }
      card.classList.add('lsb-shell-user-card')
      host.append(card)
    }

    function restoreUserCard() {
      const card = document.querySelector('.lsb-shell-user-card')
      restoreNode(card, userCardHome, 'lsb-shell-user-card')
      userCardHome = null
    }

    function extraLabel(a) {
      if (!(a instanceof Element)) return ''
      const text = [...a.childNodes]
        .filter((n) => n.nodeType === 3)
        .map((n) => (n.textContent || '').trim())
        .find(Boolean)
      return text || (a.getAttribute('aria-label') || '').trim()
    }

    function isPersonalExtra(href, label) {
      const name = String(label || '').replace(/\s+/g, '')
      if (/^我的/.test(name)) return true
      try {
        const path = new URL(href, location.href).pathname
        if (/^\/user\/\d+\/?$/.test(path)) return true
      } catch {
        /* ignore */
      }
      return false
    }

    function isJunkExtra(href, label) {
      const name = String(label || '').replace(/\s+/g, '')
      if (!name || /^\d+$/.test(name)) return true
      return isPersonalExtra(href, label)
    }

    function collectTopExtras() {
      const top = document.querySelector('body > .top')
      if (!top) return []
      return [...top.querySelectorAll('a.forum-enhancements-custom-top-link')].filter(
        (a) => a instanceof HTMLAnchorElement && extraLabel(a) && !isJunkExtra(a.href, extraLabel(a)),
      )
    }

    function adoptTopExtras(host) {
      if (!(host instanceof Element)) return
      for (const a of [...host.querySelectorAll('a[href]')]) {
        const label = extraLabel(a) || (a.textContent || '').trim()
        if (!isJunkExtra(a.href, label)) continue
        if (extrasHomes.has(a)) {
          restoreNode(a, extrasHomes.get(a), 'lsb-shell-extra-link')
          extrasHomes.delete(a)
        } else {
          a.remove()
        }
      }
      const have = new Set([...host.querySelectorAll('a[href]')].map((a) => a.href))
      for (const a of collectTopExtras()) {
        if (host.contains(a)) continue
        if (have.has(a.href)) {
          a.remove()
          continue
        }
        extrasHomes.set(a, { parent: a.parentNode, next: a.nextSibling })
        a.classList.add('lsb-shell-extra-link')
        host.append(a)
        have.add(a.href)
      }
      hydrateTopExtras(host, have)
      pruneJunkExtraNodes(host)
      snapshotTopExtras(host)
    }

    function pruneJunkExtraNodes(host) {
      if (!(host instanceof Element)) return
      for (const node of [...host.childNodes]) {
        if (node.nodeType === 3 && /^\s*\d+\s*$/.test(node.textContent || '')) {
          node.remove()
          continue
        }
        if (!(node instanceof Element)) continue
        const label = extraLabel(node) || (node.textContent || '').trim()
        if (node.matches('a[href]') && isJunkExtra(node.getAttribute('href'), label)) {
          if (extrasHomes.has(node)) {
            restoreNode(node, extrasHomes.get(node), 'lsb-shell-extra-link')
            extrasHomes.delete(node)
          } else {
            node.remove()
          }
          continue
        }
        if (!node.matches('a') && /^\d+$/.test(label.replace(/\s+/g, ''))) node.remove()
      }
    }

    function snapshotTopExtras(host) {
      if (!(host instanceof Element)) return
      const links = [...host.querySelectorAll('a[href]')]
        .map((a) => ({ href: a.getAttribute('href'), label: extraLabel(a) || (a.textContent || '').trim() }))
        .filter((x) => x.href && x.label && !isJunkExtra(x.href, x.label))
      if (links.length) api.store.set('topExtras', links)
    }

    function hydrateTopExtras(host, have) {
      if (!(host instanceof Element)) return
      const known = have || new Set([...host.querySelectorAll('a[href]')].map((a) => a.href))
      for (const item of api.store.get('topExtras') || []) {
        if (!item?.href || !item.label || isJunkExtra(item.href, item.label)) continue
        let abs
        try {
          abs = new URL(item.href, location.href).href
        } catch {
          continue
        }
        if (known.has(abs)) continue
        const a = document.createElement('a')
        a.setAttribute('href', item.href)
        a.textContent = item.label
        a.className = 'lsb-shell-extra-link'
        a.setAttribute('data-lsb-extra-keep', '1')
        host.append(a)
        known.add(abs)
      }
    }

    function restoreTopExtras() {
      for (const [a, home] of extrasHomes) restoreNode(a, home, 'lsb-shell-extra-link')
      extrasHomes.clear()
    }

    function adoptThemeToggle(host) {
      if (!(host instanceof Element)) return
      if (!host.querySelector('.color-scheme-top-link')) {
        const scheme =
          document.querySelector('body > .top a.color-scheme-top-link') ||
          document.querySelector('a.color-scheme-top-link')
        if (scheme && !host.contains(scheme)) {
          if (!colorSchemeHome) colorSchemeHome = { parent: scheme.parentNode, next: scheme.nextSibling }
          scheme.classList.add('lsb-shell-theme-scheme')
          host.append(scheme)
        }
      }
      if (host.querySelector('.dark-mode-control, [data-themes-mode-toggle]')) return
      const widget =
        document.querySelector('body > .top .dark-mode-control') ||
        document.querySelector('.dark-mode-control') ||
        document.querySelector('[data-themes-mode-toggle]')
      if (!widget || host.contains(widget)) return
      if (!themeToggleHome) themeToggleHome = { parent: widget.parentNode, next: widget.nextSibling }
      widget.classList.add('lsb-shell-theme-toggle')
      host.append(widget)
    }

    function restoreThemeToggle() {
      const widget = document.querySelector('.lsb-shell-theme-toggle')
      restoreNode(widget, themeToggleHome, 'lsb-shell-theme-toggle')
      themeToggleHome = null
      const scheme = document.querySelector('.lsb-shell-theme-scheme')
      restoreNode(scheme, colorSchemeHome, 'lsb-shell-theme-scheme')
      colorSchemeHome = null
    }

    function nativeCards() {
      return nativeSidebars().flatMap((side) => [...side.querySelectorAll('.sidebar-card')])
    }

    function pickAsideCards() {
      const hosted = [...document.querySelectorAll('#lsb-shell-aside .sidebar-card')]
      const all = [...nativeCards(), ...hosted]
      const seen = new Set()
      const uniq = all.filter((el) => {
        if (seen.has(el)) return false
        seen.add(el)
        return true
      })
      const text = (el) => (el.textContent || '').replace(/\s+/g, ' ').trim()
      const onUser = api.page?.type === 'user'
      const profile = onUser
        ? uniq.find(
            (c) =>
              c.classList.contains('user-card')
              && !c.classList.contains('lsb-shell-user-card')
              && !isSelfUserCard(c),
          )
        : null
      const bio = onUser ? uniq.find((c) => c.classList.contains('bio-card')) : null
      const quick = uniq.find((c) => text(c).startsWith('快捷功能'))
      const hot = uniq.find((c) => c.classList.contains('daily-hot-topics-card'))
      const stats = uniq.find((c) => c.classList.contains('stats-card'))
      const online = uniq.find((c) => c.classList.contains('online-users-card'))
      return [profile, bio, quick, hot, stats, online].filter(Boolean)
    }

    function adoptAsideCards(host) {
      if (!(host instanceof Element)) return
      for (const card of pickAsideCards()) {
        if (host.contains(card) || card.classList.contains('lsb-shell-user-card')) continue
        asideHomes.set(card, { parent: card.parentNode, next: card.nextSibling })
        card.classList.add('lsb-shell-aside-card')
        host.append(card)
      }
      hydrateAsideKeep(host)
      snapshotAsideKeep(host)
    }

    function cardLabel(el) {
      return (el.textContent || '').replace(/\s+/g, ' ').trim()
    }

    function snapshotAsideKeep(host) {
      if (!(host instanceof Element)) return
      const keep = { ...(api.store.get('asideKeep') || {}) }
      const live = [...host.querySelectorAll('.sidebar-card')].filter(
        (el) => !el.hasAttribute('data-lsb-aside-keep'),
      )
      const quick = live.find((c) => cardLabel(c).startsWith('快捷功能'))
      const stats = live.find((c) => c.classList.contains('stats-card'))
      const online = live.find((c) => c.classList.contains('online-users-card'))
      let changed = false
      if (quick) {
        const node = quick.cloneNode(true)
        node.querySelectorAll('[data-themes-mode-toggle], .dark-mode-control').forEach((n) => n.remove())
        keep.quick = node.outerHTML
        changed = true
      }
      if (stats) {
        keep.stats = stats.outerHTML
        changed = true
      }
      if (online) {
        keep.online = online.outerHTML
        changed = true
      }
      if (changed) api.store.set('asideKeep', keep)
    }

    function injectKeptCard(host, html, slot, before) {
      if (!html || host.querySelector(`[data-lsb-aside-keep="${slot}"]`)) return
      const box = document.createElement('div')
      box.innerHTML = html
      const el = box.firstElementChild
      if (!(el instanceof Element)) return
      el.setAttribute('data-lsb-aside-keep', slot)
      el.classList.add('lsb-shell-aside-card')
      if (before instanceof Node && before.parentNode === host) host.insertBefore(el, before)
      else host.append(el)
    }

    function hydrateAsideKeep(host) {
      if (!(host instanceof Element)) return
      const keep = api.store.get('asideKeep') || {}
      const live = [...host.querySelectorAll('.sidebar-card')].filter(
        (el) => !el.hasAttribute('data-lsb-aside-keep'),
      )
      const hasQuick = live.some((c) => cardLabel(c).startsWith('快捷功能'))
      const hasStats = live.some((c) => c.classList.contains('stats-card'))
      const hasOnline = live.some((c) => c.classList.contains('online-users-card'))
      if (hasQuick) host.querySelector('[data-lsb-aside-keep="quick"]')?.remove()
      else injectKeptCard(host, keep.quick, 'quick', host.querySelector('.daily-hot-topics-card'))
      if (hasStats) host.querySelector('[data-lsb-aside-keep="stats"]')?.remove()
      else {
        const hot = host.querySelector('.daily-hot-topics-card')
        injectKeptCard(host, keep.stats, 'stats', hot?.nextSibling)
      }
      if (hasOnline) host.querySelector('[data-lsb-aside-keep="online"]')?.remove()
      else injectKeptCard(host, keep.online, 'online', null)
    }

    function restoreAsideCards() {
      for (const [card, home] of asideHomes) restoreNode(card, home, 'lsb-shell-aside-card')
      asideHomes.clear()
    }

    function pruneDetachedAsideCards() {
      for (const [card, home] of [...asideHomes]) {
        if (home?.parent?.isConnected) continue
        restoreNode(card, home, 'lsb-shell-aside-card')
        asideHomes.delete(card)
      }
    }

    function watchOnlineCard() {
      if (onlineObs || document.querySelector('#lsb-shell-aside .online-users-card')) return
      const sides = nativeSidebars()
      if (!sides.length) return
      onlineObs = new MutationObserver(() => {
        const host = document.querySelector('#lsb-shell-aside')
        if (!host || !cfg.shell) return
        adoptAsideCards(host)
        if (host.querySelector('.online-users-card')) stopOnlineWatch()
      })
      for (const side of sides) onlineObs.observe(side, { childList: true, subtree: true })
    }

    function stopOnlineWatch() {
      onlineObs?.disconnect()
      onlineObs = null
    }

    function watchTopExtras() {
      if (extrasObs) return
      const top = document.querySelector('body > .top')
      if (!top) return
      extrasObs = new MutationObserver(() => {
        const host = document.querySelector('[data-lsb-shell-extras]')
        if (!host || !cfg.shell) return
        adoptTopExtras(host)
      })
      extrasObs.observe(top, { childList: true, subtree: true })
    }

    function stopExtrasWatch() {
      extrasObs?.disconnect()
      extrasObs = null
    }

    function renderLinks(links) {
      return links
        .map((link) => {
          if (link.rpc) {
            return `<button type="button" class="lsb-shell-link" data-lsb-rpc="${esc(link.rpc)}"><span class="lsb-shell-link-label">${esc(link.label)}</span></button>`
          }
          if (link.panel) {
            return `<button type="button" class="lsb-shell-link" data-lsb-panel="${esc(link.panel)}"><span class="lsb-shell-link-label">${esc(link.label)}</span></button>`
          }
          const active = isActiveHref(link.href) ? ' is-active' : ''
          const count = Number.isFinite(link.count)
            ? `<span class="lsb-shell-count">${esc(String(link.count))}</span>`
            : ''
          return `<a class="lsb-shell-link${active}" href="${esc(link.href)}"><span class="lsb-shell-link-label">${esc(link.label)}</span>${count}</a>`
        })
        .join('')
    }

    function paintActive(host) {
      if (!(host instanceof Element)) return
      for (const a of host.querySelectorAll('a.lsb-shell-link')) {
        a.classList.toggle('is-active', isActiveHref(a.getAttribute('href')))
      }
    }

    function setSection(host, title, links) {
      if (!(host instanceof Element)) return
      const sig = title + JSON.stringify(links)
      if (host.dataset.sig === sig) {
        paintActive(host)
        return
      }
      host.dataset.sig = sig
      if (!links.length) {
        host.innerHTML = ''
        return
      }
      const heading = title ? `<h2>${esc(title)}</h2>` : ''
      host.innerHTML = `<section class="lsb-shell-nav-section">${heading}<div class="lsb-shell-nav">${renderLinks(links)}</div></section>`
    }

    function topicPosts() {
      const sel = api.sel?.topicPosts || 'ul.topic-post-list > li.post-entry, ul.post-list > li.post-entry'
      const nodes = [...document.querySelectorAll(sel)]
      return nodes.slice().sort((a, b) => {
        const fa = Number(a.dataset?.floor)
        const fb = Number(b.dataset?.floor)
        const na = Number.isFinite(fa) && fa > 0 ? fa : 0
        const nb = Number.isFinite(fb) && fb > 0 ? fb : 0
        if (na !== nb) return na - nb
        return nodes.indexOf(a) - nodes.indexOf(b)
      })
    }

    function scrollToPost(post, block) {
      post?.scrollIntoView({
        behavior: matchMedia('(prefers-reduced-motion: reduce)').matches ? 'auto' : 'smooth',
        block: block || 'start',
      })
    }

    function bindTimeline(timeline) {
      if (timeline.dataset.bound) return
      timeline.dataset.bound = '1'
      timeline.querySelector('.lsb-shell-edge[data-timeline-edge="start"]').addEventListener('click', () => {
        scrollToPost(topicPosts()[0], 'start')
      })
      timeline.querySelector('.lsb-shell-edge[data-timeline-edge="end"]').addEventListener('click', () => {
        scrollToPost(topicPosts().at(-1), 'center')
      })
      timeline.querySelector('.lsb-shell-track').addEventListener('click', (event) => {
        const posts = topicPosts()
        if (!posts.length) return
        const rect = event.currentTarget.getBoundingClientRect()
        const ratio = rect.height > 0 ? Math.min(1, Math.max(0, (event.clientY - rect.top) / rect.height)) : 0
        scrollToPost(posts[Math.round(ratio * Math.max(0, posts.length - 1))], 'center')
      })
    }

    function ensureTimeline(shellEl) {
      const onTopic = api.page?.type === 'topic' && topicPosts().length > 0
      let timeline = shellEl.querySelector('#lsb-shell-timeline')
      if (!onTopic) {
        if (timeline) timeline.hidden = true
        return null
      }
      if (!timeline) {
        timeline = document.createElement('nav')
        timeline.id = 'lsb-shell-timeline'
        timeline.setAttribute('aria-label', '楼层')
        timeline.innerHTML = `
          <button type="button" class="lsb-shell-edge" data-timeline-edge="start">主帖</button>
          <div class="lsb-shell-now"><strong data-timeline-current>主帖</strong><span data-timeline-date></span></div>
          <button type="button" class="lsb-shell-track" data-timeline-track role="scrollbar" aria-label="楼层轨道" aria-orientation="vertical" aria-valuemin="0" aria-valuemax="100" aria-valuenow="0">
            <span class="lsb-shell-thumb" aria-hidden="true"></span>
          </button>
          <div data-timeline-total></div>
          <button type="button" class="lsb-shell-edge" data-timeline-edge="end">最新</button>`
        shellEl.append(timeline)
        bindTimeline(timeline)
      }
      timeline.hidden = false
      return timeline
    }

    function currentTimelinePost(posts) {
      if (!posts.length) return { post: null, index: 0 }
      const offset = 56
      let index = 0
      for (let i = 0; i < posts.length; i += 1) {
        if (posts[i].getBoundingClientRect().top <= offset) index = i
        else break
      }
      return { post: posts[index], index }
    }

    function updateTimeline() {
      timelineRaf = 0
      if (!api.hasHandler('perf-probe:record')) {
        updateTimelineBody()
        return
      }
      const t0 = performance.now()
      try {
        updateTimelineBody()
      } finally {
        perfEmitTimeline(performance.now() - t0)
      }
    }

    function updateTimelineBody() {
      const timeline = document.querySelector('#lsb-shell-timeline')
      if (!timeline || !cfg.shell) return
      const posts = topicPosts()
      if (!posts.length) {
        timeline.hidden = true
        return
      }
      timeline.hidden = false
      const { post, index } = currentTimelinePost(posts)
      const floor = Number(post?.dataset?.floor)
      const progress = posts.length > 1 ? (index / (posts.length - 1)) * 100 : 0
      timeline.style.setProperty('--lsb-timeline-progress', `${progress}%`)
      timeline.querySelector('[data-timeline-current]').textContent =
        Number.isFinite(floor) && floor > 1 ? `#${floor}` : '主帖'
      const time = post?.querySelector('time, span[data-performance-time], .post-time')
      timeline.querySelector('[data-timeline-date]').textContent = (time?.textContent || '').trim().slice(0, 24)
      timeline.querySelector('[data-timeline-total]').textContent = `${Math.max(0, posts.length - 1)} 条回复`
      const track = timeline.querySelector('.lsb-shell-track')
      track.setAttribute('aria-valuenow', String(Math.round(progress)))
    }

    function scheduleTimeline() {
      if (timelineRaf) return
      timelineRaf = window.requestAnimationFrame(updateTimeline)
    }

    function bindWindow() {
      if (windowListening) return
      windowListening = true
      window.addEventListener('scroll', scheduleTimeline, { passive: true })
      window.addEventListener('resize', scheduleTimeline)
    }

    function unbindWindow() {
      if (!windowListening) return
      windowListening = false
      window.removeEventListener('scroll', scheduleTimeline)
      window.removeEventListener('resize', scheduleTimeline)
    }

    function ensureShell() {
      let el = document.getElementById('lsb-shell')
      if (el) {
        if (el.parentNode !== document.body) document.body.append(el)
        return el
      }
      el = document.createElement('div')
      el.id = 'lsb-shell'
      const nativeBrand = document.querySelector('body > .top a.brand')
      const brandName = (nativeBrand?.textContent || 'LINUX SB').trim()
      const nativeLogo = nativeBrand?.querySelector('img[src], source[src]')
      const logoSrc =
        (nativeLogo instanceof Element && nativeLogo.getAttribute('src'))
        || document.querySelector('link[rel~="icon"]')?.getAttribute('href')
        || '/app/assets/index.svg'
      el.innerHTML = `
        <header id="lsb-shell-header">
          <a class="lsb-shell-brand" href="/"><img class="lsb-shell-logo" src="${esc(logoSrc)}" alt="" width="22" height="22">${esc(brandName)}</a>
          <div class="lsb-shell-search-host"></div>
          <nav class="lsb-shell-extras" data-lsb-shell-extras aria-label="站点入口"></nav>
          <div class="lsb-shell-where" data-lsb-shell-where></div>
          <div class="lsb-shell-theme" data-lsb-shell-theme></div>
        </header>
        <aside id="lsb-shell-rail" aria-label="氢导航">
          <div class="lsb-shell-rail-scroll">
            <div class="lsb-shell-me" data-lsb-shell-me></div>
            <div data-lsb-shell-section="home"></div>
            <div data-lsb-shell-section="boards"></div>
            <div data-lsb-shell-section="tools"></div>
          </div>
          <div class="lsb-shell-rail-foot">
            <button type="button" class="lsb-shell-settings" data-lsb-shell-settings>设置</button>
          </div>
        </aside>
        <aside id="lsb-shell-aside" aria-label="站点信息"></aside>`
      el.querySelector('[data-lsb-shell-settings]').addEventListener('click', () => api.ui.openPanel('skin'))
      el.querySelector('#lsb-shell-rail').addEventListener('click', (e) => {
        const rpcBtn = e.target.closest('[data-lsb-rpc]')
        if (rpcBtn) {
          e.preventDefault()
          api.request(rpcBtn.getAttribute('data-lsb-rpc'))
          return
        }
        const btn = e.target.closest('[data-lsb-panel]')
        if (!btn) return
        e.preventDefault()
        api.ui.openPanel(btn.getAttribute('data-lsb-panel'))
      })
      document.body.append(el)
      return el
    }

    function syncShellRoute(el = document.getElementById('lsb-shell')) {
      applyMarkers()
      if (!(el instanceof Element)) return
      const where = el.querySelector('[data-lsb-shell-where]')
      if (where) where.textContent = locationText()
      paintActive(el.querySelector('[data-lsb-shell-section="home"]'))
      paintActive(el.querySelector('[data-lsb-shell-section="boards"]'))
      const timeline = ensureTimeline(el)
      if (timeline) {
        bindWindow()
        scheduleTimeline()
      } else {
        unbindWindow()
      }
    }

    function fillShell() {
      const el = ensureShell()
      pruneDetachedAsideCards()
      adoptSearch(el.querySelector('.lsb-shell-search-host'))
      adoptTopExtras(el.querySelector('[data-lsb-shell-extras]'))
      adoptThemeToggle(el.querySelector('[data-lsb-shell-theme]'))
      adoptUserCard(el.querySelector('[data-lsb-shell-me]'))
      adoptAsideCards(el.querySelector('#lsb-shell-aside'))
      watchOnlineCard()
      watchTopExtras()
      setSection(el.querySelector('[data-lsb-shell-section="home"]'), '', [
        { href: '/', label: '全部主题' },
      ])
      setSection(el.querySelector('[data-lsb-shell-section="boards"]'), '版块', collectBoards())
      setSection(el.querySelector('[data-lsb-shell-section="tools"]'), '工具', collectTools())
      syncShellRoute(el)
      syncHomeInfiniteScroll()
    }

    function isHomeInfPath(urlLike = location.href) {
      try {
        const url = new URL(urlLike, location.href)
        const path = url.pathname.replace(/\/{2,}/g, '/') || '/'
        if (path !== '/' && path !== '/index.php') return false
        if (url.searchParams.get('q')) return false
        return true
      } catch {
        return false
      }
    }

    function homeInfEnabled() {
      if ((document.cookie.match(/(?:^|; )sb_infinite_scroll_enabled=([^;]*)/) || [])[1] === '0') return false
      const config = window.__sbInfiniteScrollConfig || window.__infiniteScrollConfig || {}
      return config.enabled !== false
    }

    function homeInfTopicKey(item) {
      const title = item?.querySelector?.('.post-title')
      const href = title?.getAttribute('href') || ''
      if (href) return href.replace(/([?&])replyid=[^&]*/g, '').replace(/([?&])p=[^&]*/g, '')
      return `${(title?.textContent || '').trim()}|${(item?.textContent || '').trim().slice(0, 80)}`
    }

    function homeInfHasNext(root) {
      const pag = root?.querySelector?.('.pagination-bar') || root
      if (!pag?.querySelectorAll) return false
      for (const a of pag.querySelectorAll('a')) {
        if ((a.textContent || '').trim() === '下一页') return true
      }
      const page = homeInf?.page || 1
      for (const el of pag.querySelectorAll('a, span')) {
        const num = parseInt(el.textContent, 10)
        if (num > page) return true
      }
      return false
    }

    function unbindHomeInfiniteScroll() {
      if (!homeInf) return
      window.removeEventListener('scroll', homeInf.onScroll)
      homeInf.status?.remove()
      homeInf = null
    }

    function hideHomePagination(pagination) {
      if (!(pagination instanceof Element)) return
      pagination.classList.add('sb-infinite-scroll-pagination-hidden')
      pagination.setAttribute('aria-hidden', 'true')
      pagination.setAttribute('data-lsb-shell-inf', '1')
    }

    function setHomeInfStatus(kind, text) {
      if (!homeInf?.pagination?.parentNode) return
      homeInf.status?.remove()
      if (!kind) {
        homeInf.status = null
        return
      }
      const el = document.createElement('div')
      el.className = kind === 'end' ? 'infinite-scroll-end' : 'infinite-scroll-loader'
      el.setAttribute('data-lsb-inf-status', kind)
      el.textContent = text
      homeInf.pagination.parentNode.insertBefore(el, homeInf.pagination)
      homeInf.status = el
    }

    async function loadHomeInfPage() {
      const state = homeInf
      if (!state || state.loading || !state.hasMore) return
      state.loading = true
      setHomeInfStatus('loading', '加载中...')
      let next = state.page + 1
      while (state.loaded[next]) next += 1
      const url = new URL(location.href)
      url.searchParams.set('p', String(next))
      try {
        const res = await api.net.raw(`${url.pathname}${url.search}`, {
          queue: false,
          timeout: 15000,
          retry: 0,
        })
        if (homeInf !== state) return
        if (!res.ok) throw new Error(`HTTP ${res.status}`)
        const doc = new DOMParser().parseFromString(res.text, 'text/html')
        const remoteList = doc.querySelector('.main-panel > ul.post-list, ul.post-list')
        const items = remoteList ? [...remoteList.children] : []
        if (!items.length) {
          state.hasMore = false
          setHomeInfStatus('end', '没有更多内容了')
          return
        }
        const fresh = []
        for (const item of items) {
          const key = homeInfTopicKey(item)
          if (key && state.seen[key]) continue
          if (key) state.seen[key] = true
          fresh.push(document.importNode(item, true))
        }
        if (fresh.length) state.list.append(...fresh)
        const pagHtml = doc.querySelector('.pagination-bar')?.innerHTML
        if (pagHtml) state.pagination.innerHTML = pagHtml
        hideHomePagination(state.pagination)
        state.loaded[next] = true
        state.page = Math.max(state.page, next)
        if (!homeInfHasNext(doc)) {
          state.hasMore = false
          setHomeInfStatus('end', '没有更多内容了')
        } else {
          setHomeInfStatus(null)
        }
        document.dispatchEvent(new CustomEvent('sb:topic-list-updated', {
          detail: { list: state.list, items: fresh, page: next, source: 'lsb_shell' },
        }))
      } catch {
        if (homeInf !== state) return
        setHomeInfStatus('end', '加载失败，继续滚动或点分页重试')
      } finally {
        if (homeInf === state) state.loading = false
      }
    }

    function bindHomeInfiniteScroll(list, pagination) {
      const seen = {}
      for (const item of list.children) {
        if (item.matches?.('.post-item')) {
          const key = homeInfTopicKey(item)
          if (key) seen[key] = true
        }
      }
      const page = parseInt(new URL(location.href).searchParams.get('p'), 10) || 1
      const onScroll = () => {
        if (!homeInf || homeInf.loading || !homeInf.hasMore) return
        if (homeInf.scrollTimer) return
        homeInf.scrollTimer = window.setTimeout(() => {
          if (homeInf) homeInf.scrollTimer = 0
          const rect = list.getBoundingClientRect()
          const distance = rect.bottom - (window.innerHeight || 0)
          if (distance <= 100) void loadHomeInfPage()
        }, 200)
      }
      hideHomePagination(pagination)
      homeInf = {
        list,
        pagination,
        seen,
        loaded: { [page]: true },
        page,
        loading: false,
        hasMore: homeInfHasNext(document),
        onScroll,
        scrollTimer: 0,
        status: null,
      }
      if (!homeInf.hasMore) {
        setHomeInfStatus('end', '没有更多内容了')
        return
      }
      window.addEventListener('scroll', onScroll, { passive: true })
    }

    function syncHomeInfiniteScroll() {
      if (!cfg.shell || !isHomeInfPath() || !homeInfEnabled()) {
        unbindHomeInfiniteScroll()
        return
      }
      const list = document.querySelector('.main-panel > ul.post-list')
      const pagination = document.querySelector('.pagination-bar')
      if (!list || !pagination) {
        unbindHomeInfiniteScroll()
        return
      }
      if (homeInf?.list === list && homeInf.pagination === pagination) return
      unbindHomeInfiniteScroll()
      if (
        pagination.classList.contains('sb-infinite-scroll-pagination-hidden')
        && !pagination.hasAttribute('data-lsb-shell-inf')
      ) return
      bindHomeInfiniteScroll(list, pagination)
    }

    function findRouteOutlet(scope = document) {
      const candidates = [scope.querySelector?.('main.wrap'), scope.querySelector?.('main')]
      for (const el of candidates) {
        if (!el || el.id === 'lsb-shell' || el.querySelector?.('#lsb-shell')) continue
        return el
      }
      return null
    }

    function hideNativeSidebars(root) {
      if (!root?.querySelectorAll) return
      for (const el of root.querySelectorAll('aside.sidebar')) {
        if (el.id === 'mobile-menu-drawer' || el.classList.contains('mobile-menu-drawer')) continue
        el.classList.add('lsb-native-sidebar-hidden')
      }
    }

    function isSpaUrl(urlLike) {
      if (!cfg.shell) return false
      let url
      try {
        url = new URL(urlLike, location.href)
      } catch {
        return false
      }
      if (url.origin !== location.origin) return false
      const path = url.pathname.replace(/\/{2,}/g, '/') || '/'
      // 帖子页的讨论串靠站点脚本在整页生命周期里挂载；软跳进帖子会剥脚本，刷新才出现。
      if (/^\/topic\/\d+/.test(path)) return false
      return (
        path === '/'
        || path === '/index.php'
        || path === '/latest'
        || path === '/topic_featured'
        || path === '/unread_topic_notice_footprint'
        || /^\/forum\/\d+/.test(path)
        || /^\/category\/\d+/.test(path)
      )
    }

    function viewCacheKey(href) {
      const u = new URL(href, location.href)
      let path = u.pathname.replace(/\/{2,}/g, '/') || '/'
      if (path === '/index.php') path = '/'
      return path + u.search
    }

    function rememberView(key, entry) {
      if (viewCache.has(key)) viewCache.delete(key)
      viewCache.set(key, entry)
      while (viewCache.size > VIEW_CACHE_MAX) {
        const oldest = viewCache.keys().next().value
        viewCache.delete(oldest)
      }
    }

    function snapshotOutletAttrs(el) {
      if (!(el instanceof Element)) return []
      return [...el.attributes].map((a) => [a.name, a.value])
    }

    function stashView(key) {
      if (!key) return
      try {
        if (!isSpaUrl(new URL(key, location.origin).href)) return
      } catch {
        return
      }
      const outlet = findRouteOutlet()
      if (!outlet?.firstChild) return
      const frag = document.createDocumentFragment()
      while (outlet.firstChild) frag.appendChild(outlet.firstChild)
      rememberView(key, {
        frag,
        title: document.title,
        scrollY: window.scrollY || 0,
        live: true,
        attrs: snapshotOutletAttrs(outlet),
      })
    }

    function takeView(key) {
      const entry = viewCache.get(key)
      if (!entry) return null
      viewCache.delete(key)
      return entry
    }

    function applyView(entry, outlet) {
      if (!outlet || !entry?.frag) return
      if (entry.attrs) {
        for (const name of [...outlet.getAttributeNames()]) outlet.removeAttribute(name)
        for (const [name, value] of entry.attrs) {
          if (name.startsWith('data-lsb-')) continue
          outlet.setAttribute(name, value)
        }
      }
      outlet.replaceChildren()
      outlet.append(entry.frag)
      if (entry.title) document.title = entry.title
      outlet.removeAttribute('aria-busy')
      markNative(true)
    }

    function parseOutletFrag(html) {
      const pageDoc = new DOMParser().parseFromString(html, 'text/html')
      const remote = findRouteOutlet(pageDoc)
      if (!remote) return null
      remote.querySelectorAll('script').forEach((node) => node.remove())
      hideNativeSidebars(remote)
      const frag = document.createDocumentFragment()
      for (const node of [...remote.childNodes]) frag.appendChild(document.importNode(node, true))
      return { frag, title: pageDoc.title || '', attrs: snapshotOutletAttrs(remote) }
    }

    function wantsHomeStashRefresh() {
      return spaBound && cfg.shell && spaViewKey !== '/' && viewCache.has('/')
    }

    function stopHomeStashRefresh() {
      if (homeStashTimer) {
        window.clearTimeout(homeStashTimer)
        homeStashTimer = 0
      }
    }

    function scheduleHomeStashRefresh() {
      if (!wantsHomeStashRefresh()) {
        stopHomeStashRefresh()
        homeStashPending = false
        homeStashGen += 1
        return
      }
      if (homeStashTimer || homeStashInflight) return
      homeStashTimer = window.setTimeout(() => {
        homeStashTimer = 0
        void refreshStashedHome()
      }, HOME_STASH_REFRESH_MS)
    }

    async function refreshStashedHome() {
      if (!wantsHomeStashRefresh()) return
      if (document.visibilityState === 'hidden') {
        homeStashPending = true
        return
      }
      homeStashPending = false
      if (homeStashInflight) return homeStashInflight
      const gen = homeStashGen
      homeStashInflight = (async () => {
        try {
          const res = await api.net.raw('/', { queue: false, timeout: 15000, retry: 0 })
          if (gen !== homeStashGen) return
          if (!res.ok || !wantsHomeStashRefresh()) return
          const parsed = parseOutletFrag(res.text)
          if (!parsed || gen !== homeStashGen || !wantsHomeStashRefresh()) return
          rememberView('/', {
            frag: parsed.frag,
            title: parsed.title,
            scrollY: 0,
            live: false,
            attrs: parsed.attrs,
          })
        } catch {
          /* 后台刷新失败则还回仍用旧存档 */
        } finally {
          homeStashInflight = null
          if (gen === homeStashGen) scheduleHomeStashRefresh()
        }
      })()
      return homeStashInflight
    }

    function onHomeStashVisible() {
      if (document.visibilityState !== 'visible' || !homeStashPending) return
      homeStashPending = false
      void refreshStashedHome()
    }

    function seedHomeView() {
      const here = viewCacheKey(location.href)
      if (here === '/' || viewCache.has('/')) return
      void (async () => {
        try {
          const res = await api.net.raw('/', { queue: false, timeout: 15000, retry: 0 })
          if (!res.ok || viewCache.has('/') || spaViewKey === '/') return
          const parsed = parseOutletFrag(res.text)
          if (!parsed || viewCache.has('/') || spaViewKey === '/') return
          rememberView('/', {
            frag: parsed.frag,
            title: parsed.title,
            scrollY: 0,
            live: false,
            attrs: parsed.attrs,
          })
          scheduleHomeStashRefresh()
        } catch {
          /* 预取失败则点首页仍 GET */
        }
      })()
    }

    function hasUnsavedEditor() {
      return [...document.querySelectorAll('textarea, [contenteditable="true"]')].some((el) => {
        if (el.closest('#lsb-shell, .lsb-panel')) return false
        const value = 'value' in el ? el.value : el.textContent
        return String(value || '').trim().length > 0
      })
    }

    function ensureProgress() {
      const shell = document.getElementById('lsb-shell')
      if (!shell) return null
      let el = document.getElementById('lsb-shell-progress')
      if (el) return el
      el = document.createElement('div')
      el.id = 'lsb-shell-progress'
      el.setAttribute('aria-hidden', 'true')
      el.innerHTML = '<span data-lsb-shell-progress-bar></span>'
      shell.append(el)
      return el
    }

    function startProgress(serial) {
      const el = ensureProgress()
      if (!el) return
      el.dataset.phase = 'idle'
      el.style.setProperty('--lsb-shell-progress', '.08')
      window.clearTimeout(spaProgressTimer)
      spaProgressTimer = window.setTimeout(() => {
        if (serial !== spaSerial) return
        el.dataset.phase = 'loading'
        el.style.setProperty('--lsb-shell-progress', '.72')
      }, 90)
    }

    function finishProgress(serial) {
      const el = document.getElementById('lsb-shell-progress')
      window.clearTimeout(spaProgressTimer)
      spaProgressTimer = 0
      if (!el) return
      if (serial !== spaSerial) return
      el.dataset.phase = 'done'
      el.style.setProperty('--lsb-shell-progress', '1')
      spaProgressTimer = window.setTimeout(() => {
        el.dataset.phase = 'idle'
        el.style.setProperty('--lsb-shell-progress', '0')
      }, 160)
    }

    function syncRouteHead(pageDoc) {
      if (pageDoc.title) document.title = pageDoc.title
    }

    function syncOutletAttrs(outlet, remote) {
      for (const attr of [...outlet.attributes]) {
        if (attr.name.startsWith('data-lsb-') || attr.name === 'aria-busy') continue
        outlet.removeAttribute(attr.name)
      }
      for (const attr of [...remote.attributes]) {
        if (attr.name.startsWith('data-lsb-')) continue
        outlet.setAttribute(attr.name, attr.value)
      }
    }

    function commitRoute(pageDoc, remoteOutlet) {
      const outlet = findRouteOutlet()
      if (!outlet || !remoteOutlet) throw new Error('no outlet')
      remoteOutlet.querySelectorAll('script').forEach((node) => node.remove())
      hideNativeSidebars(remoteOutlet)
      const kids = [...remoteOutlet.childNodes].map((node) => document.importNode(node, true))
      syncOutletAttrs(outlet, remoteOutlet)
      outlet.replaceChildren(...kids)
      outlet.removeAttribute('aria-busy')
      syncRouteHead(pageDoc)
      markNative(true)
    }

    function notifyRoute() {
      spaIgnorePop = true
      try {
        const view = document.defaultView
        const Ev = view.PopStateEvent || view.Event
        view.dispatchEvent(new Ev('popstate'))
      } catch {
        try {
          window.dispatchEvent(new Event('popstate'))
        } catch {
          /* 基座还有 url 轮询兜底 */
        }
      } finally {
        spaIgnorePop = false
      }
    }

    function applyHistory(target, mode) {
      if (mode === 'none') return
      const state = { lsbShellSpa: true }
      try {
        if (mode === 'replace') history.replaceState(state, '', target.href)
        else history.pushState(state, '', target.href)
      } catch {
        /* history 不可用时仍换 DOM，地址栏可能落后 */
      }
    }

    function perfHref() {
      try {
        return location.pathname + location.search
      } catch {
        return ''
      }
    }

    function perfEmit(name, ms) {
      try {
        if (!api.hasHandler('perf-probe:record')) return
        api.emitGlobal('perf:span', {
          name,
          plugin: 'skin',
          ms,
          href: perfHref(),
          t: Date.now(),
        })
      } catch {
        /* 探针失败不得打断壳 */
      }
    }

    function perfSpan(name, fn) {
      if (!api.hasHandler('perf-probe:record')) return fn()
      const t0 = performance.now()
      try {
        return fn()
      } finally {
        perfEmit(name, performance.now() - t0)
      }
    }

    async function perfSpanAsync(name, fn) {
      if (!api.hasHandler('perf-probe:record')) return fn()
      const t0 = performance.now()
      try {
        return await fn()
      } finally {
        perfEmit(name, performance.now() - t0)
      }
    }

    let timelineEmitSec = -1
    let timelineEmitN = 0
    function perfEmitTimeline(ms) {
      if (ms < 8) return
      const sec = Math.floor(Date.now() / 1000)
      if (sec !== timelineEmitSec) {
        timelineEmitSec = sec
        timelineEmitN = 0
      }
      if (timelineEmitN >= 2) return
      timelineEmitN += 1
      perfEmit('timeline.update', ms)
    }

    async function navigateSpa(href, options = {}) {
      const settings = { historyMode: 'push', force: false, ...options }
      let target
      try {
        target = new URL(href, location.href)
      } catch {
        return false
      }
      if (!isSpaUrl(target.href)) return false
      if (!settings.force && hasUnsavedEditor() && !window.confirm('当前编辑内容尚未保存，确定离开吗？')) {
        return false
      }
      const same = target.pathname === location.pathname && target.search === location.search
      if (same && !settings.force) {
        if (target.hash) {
          const id = decodeURIComponent(target.hash.slice(1))
          document.getElementById(id)?.scrollIntoView()
        }
        return true
      }

      const fromKey = spaViewKey
      const destKey = viewCacheKey(target.href)
      const cached = takeView(destKey)
      const serial = ++spaSerial
      const tTotal = api.hasHandler('perf-probe:record') ? performance.now() : 0
      const outlet = findRouteOutlet()
      outlet?.setAttribute('aria-busy', 'true')
      startProgress(serial)
      let committed = false
      try {
        if (cached) {
          stashView(fromKey)
          applyHistory(target, settings.historyMode)
          perfSpan('spa.commit', () => applyView(cached, findRouteOutlet() || outlet))
          committed = true
          spaViewKey = destKey
          scheduleHomeStashRefresh()
          perfSpan('spa.fillShell', () => {
            applyMarkers()
            fillShell()
          })
          spaFilledSerial = serial
          window.clearTimeout(refreshTimer)
          refreshTimer = 0
          finishProgress(serial)
          try {
            if (settings.historyMode === 'none') window.scrollTo(0, cached.scrollY || 0)
            else window.scrollTo(0, 0)
          } catch {
            /* jsdom 没有视口 */
          }
          if (tTotal) perfEmit('spa.total', performance.now() - tTotal)
          afterPaint(() => {
            if (serial !== spaSerial) return
            perfSpan('spa.notify', () => {
              notifyRoute()
              syncShellRoute()
            })
            try {
              api.emitGlobal('spa:view-restored', { href: destKey, live: !!cached.live })
            } catch {
              /* 实时流缺席不得打断壳 */
            }
          })
          return true
        }

        const res = await perfSpanAsync('spa.fetch', () =>
          api.net.raw(`${target.pathname}${target.search}`, {
            queue: false,
            timeout: 15000,
            retry: 0,
          }),
        )
        if (serial !== spaSerial) return false
        if (!res.ok) throw new Error(`HTTP ${res.status}`)
        const finalUrl = new URL(res.url || target.href, target.href)
        if (!isSpaUrl(finalUrl.href)) {
          location.assign(finalUrl.href)
          return false
        }
        const pageDoc = perfSpan('spa.parse', () => new DOMParser().parseFromString(res.text, 'text/html'))
        const remoteOutlet = findRouteOutlet(pageDoc)
        if (!remoteOutlet) throw new Error('no remote outlet')
        stashView(fromKey)
        applyHistory(finalUrl, settings.historyMode)
        perfSpan('spa.commit', () => {
          commitRoute(pageDoc, remoteOutlet)
        })
        committed = true
        spaViewKey = viewCacheKey(finalUrl.href)
        scheduleHomeStashRefresh()
        perfSpan('spa.fillShell', () => {
          applyMarkers()
          fillShell()
        })
        spaFilledSerial = serial
        window.clearTimeout(refreshTimer)
        refreshTimer = 0
        finishProgress(serial)
        try {
          window.scrollTo(0, 0)
        } catch {
          /* jsdom 没有视口 */
        }
        if (tTotal) perfEmit('spa.total', performance.now() - tTotal)
        afterPaint(() => {
          if (serial !== spaSerial) return
          perfSpan('spa.notify', () => {
            notifyRoute()
            syncShellRoute()
          })
        })
        return true
      } catch (err) {
        if (serial !== spaSerial) return false
        finishProgress(serial)
        outlet?.removeAttribute('aria-busy')
        if (!committed && settings.historyMode !== 'none') location.assign(target.href)
        return false
      }
    }

    function onSpaClick(event) {
      if (event.defaultPrevented || event.button !== 0) return
      if (event.metaKey || event.ctrlKey || event.shiftKey || event.altKey) return
      const anchor = event.target?.closest?.('a[href]')
      if (
        !anchor
        || anchor.hasAttribute('download')
        || (anchor.target && anchor.target !== '_self')
        || /\bexternal\b/i.test(anchor.rel || '')
        || anchor.matches('[data-method], [data-confirm], [data-no-spa]')
        || anchor.closest('.pagination-bar, .pagination')
      ) return
      if (!isSpaUrl(anchor.href)) return
      if (anchor.href === location.href) return
      event.preventDefault()
      void navigateSpa(anchor.href)
    }

    function onSpaSubmit(event) {
      if (event.defaultPrevented) return
      const form = event.target instanceof HTMLFormElement ? event.target : null
      if (!form || String(form.method || 'get').toLowerCase() !== 'get') return
      if (form.target && form.target !== '_self') return
      if (form.matches('[data-no-spa], [data-confirm]')) return
      let target
      try {
        target = new URL(form.action || location.href, location.href)
        const data = event.submitter ? new FormData(form, event.submitter) : new FormData(form)
        target.search = new URLSearchParams(data).toString()
      } catch {
        return
      }
      if (!isSpaUrl(target.href)) return
      event.preventDefault()
      void navigateSpa(target.href)
    }

    function onSpaPop() {
      if (spaIgnorePop || !cfg.shell) return
      if (!isSpaUrl(location.href)) {
        // 软跳文档被后退到交易页/帖子等整页地址时，主栏还是列表，必须重开。
        // 交易页本身就是整页打开的，不能见 popstate 就 reload，否则会刷死。
        let paintedSpa = false
        try {
          paintedSpa = isSpaUrl(new URL(spaViewKey || '/', location.origin).href)
        } catch {
          paintedSpa = false
        }
        if (paintedSpa) location.reload()
        return
      }
      void navigateSpa(location.href, { historyMode: 'none', force: true })
    }

    function bindSpa() {
      if (spaBound) return
      spaBound = true
      try {
        history.scrollRestoration = 'manual'
      } catch {
        /* ignore */
      }
      document.addEventListener('click', onSpaClick, true)
      document.addEventListener('submit', onSpaSubmit, true)
      window.addEventListener('popstate', onSpaPop)
      document.addEventListener('visibilitychange', onHomeStashVisible)
      spaViewKey = viewCacheKey(location.href)
      seedHomeView()
      scheduleHomeStashRefresh()
    }

    function unbindSpa() {
      if (!spaBound) return
      spaBound = false
      spaSerial += 1
      window.clearTimeout(spaProgressTimer)
      spaProgressTimer = 0
      document.removeEventListener('click', onSpaClick, true)
      document.removeEventListener('submit', onSpaSubmit, true)
      window.removeEventListener('popstate', onSpaPop)
      document.removeEventListener('visibilitychange', onHomeStashVisible)
      stopHomeStashRefresh()
      homeStashPending = false
      homeStashGen += 1
      document.getElementById('lsb-shell-progress')?.remove()
    }

    function teardownShell() {
      window.clearTimeout(refreshTimer)
      refreshTimer = 0
      if (timelineRaf) {
        window.cancelAnimationFrame(timelineRaf)
        timelineRaf = 0
      }
      unbindSpa()
      unbindHomeInfiniteScroll()
      unbindWindow()
      stopOnlineWatch()
      stopExtrasWatch()
      restoreAsideCards()
      restoreUserCard()
      restoreTopExtras()
      restoreThemeToggle()
      restoreSearch()
      viewCache.clear()
      spaViewKey = ''
      document.getElementById('lsb-shell')?.remove()
      markNative(false)
      document.documentElement.classList.remove('lsb-skin-shell-on', 'lsb-skin-shell-topic', 'lsb-skin-shell-user')
      document.getElementById('lsb-shell-boot-style')?.remove()
      document.documentElement.classList.remove('lsb-shell-boot')
    }

    function refreshShell() {
      if (!cfg.shell) {
        teardownShell()
        return
      }
      markNative(true)
      applyMarkers()
      fillShell()
      bindSpa()
    }

    function afterPaint(fn) {
      const raf = window.requestAnimationFrame
      if (typeof raf === 'function') raf(() => fn())
      else setTimeout(fn, 0)
    }

    function scheduleRefresh(fromRoute) {
      if (fromRoute && spaFilledSerial && spaFilledSerial === spaSerial) return
      window.clearTimeout(refreshTimer)
      refreshTimer = window.setTimeout(refreshShell, 50)
    }

    function applyAll() {
      restyle()
      refreshShell()
    }

    api.ui.configTab({ name: '界面精修', order: 80 })

    let unregMenu = () => {}
    function syncGmMenu() {
      unregMenu()
      const on = !!api.config().shell
      unregMenu = api.ui.menuCommand(on ? '氢壳：关闭，回到原版界面' : '氢壳：开启', () => {
        api.saveConfig({ shell: !api.config().shell })
      })
    }
    syncGmMenu()

    api.on('config:changed:skin', () => {
      cfg = api.config()
      invalidateTools()
      applyAll()
      syncGmMenu()
    })
    api.on('route:changed', () => scheduleRefresh(true))
    api.on('plugin:activated', () => {
      invalidateTools()
      scheduleRefresh(false)
    })
    api.on('plugin:disabled', () => {
      invalidateTools()
      scheduleRefresh(false)
    })
    api.on('topic:posts-added', scheduleTimeline)
    api.dom.each(
      '.dark-mode-control, [data-themes-mode-toggle], a.color-scheme-top-link, a.search-page-link, form.search-form, .sidebar-card.user-card',
      () => {
        if (!cfg.shell) return
        adoptSearch(document.querySelector('.lsb-shell-search-host'))
        adoptThemeToggle(document.querySelector('[data-lsb-shell-theme]'))
        adoptUserCard(document.querySelector('[data-lsb-shell-me]'))
      },
    )

    api.onDispose(() => {
      unregMenu()
      teardownShell()
      const root = document.documentElement
      for (const c of [...root.classList].filter((x) => x.startsWith('lsb-skin-'))) root.classList.remove(c)
      document.getElementById('lsb-skin-style')?.remove()
    })

    api.handle('skin:debug', () => ({
      active: { ...cfg },
      markers: [...document.documentElement.classList].filter((c) => c.startsWith('lsb-skin-')),
      styleBytes: (document.getElementById('lsb-skin-style')?.textContent || '').length,
      themesPluginDetected: themesPresent,
      shell: {
        on: !!cfg.shell,
        mounted: !!document.getElementById('lsb-shell'),
        boards: collectBoards().length,
        location: locationText(),
        timeline: !!document.getElementById('lsb-shell-timeline'),
        me: !!document.querySelector('#lsb-shell .sidebar-card.user-card'),
        extras: document.querySelectorAll('.lsb-shell-extras a').length,
        aside: document.querySelectorAll('#lsb-shell-aside .sidebar-card').length,
        spa: spaBound,
      },
    }))

    applyAll()

    return {}
  }

  const w = typeof unsafeWindow !== 'undefined' ? unsafeWindow : window
  if (w.LSB && w.LSB.register) w.LSB.register(manifest, setup)
  else (w.LSB_PLUGINS = w.LSB_PLUGINS || []).push({ manifest, setup })
})()
