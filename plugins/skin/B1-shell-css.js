// @skin-part: B1 shellCss — 纯样式函数，已参数化 FONT_SANS，供 setup 闭包外复用。
// 当前 skin.user.js 仍内联旧实现；下一步将 skin 切换为目录聚合时，本文件将成为主源。
export function shellCss(fontSans) {
  const FONT_SANS = fontSans || "system-ui,-apple-system,'Segoe UI','PingFang SC','Hiragino Sans GB','Microsoft YaHei','Noto Sans SC',sans-serif";
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
        .lsb-shell-rail-scroll{flex:1;min-height:0;overflow:hidden;padding:56px 12px 12px;display:flex;flex-direction:column}
        .lsb-shell-rail-scroll [data-lsb-shell-section="home"]{flex:0 0 auto}
        .lsb-shell-rail-scroll [data-lsb-shell-section="boards"]{flex:1 1 auto;min-height:0;overflow:auto}
        .lsb-shell-rail-scroll [data-lsb-shell-section="tools"]{flex:0 0 auto}
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
        html.lsb-skin-shell-on #color-scheme-modal{z-index:8020!important}
        html.lsb-skin-shell-on .lsb-shell-theme-modal{z-index:8020!important}
        .lsb-shell-theme .color-scheme-top-link{
          display:inline-flex;width:30px;height:30px;align-items:center;justify-content:center;
          grid-area:auto;justify-self:auto;flex:0 0 30px;
          color:var(--text-muted,#888);text-decoration:none;
        }
        .lsb-shell-theme .color-scheme-top-link svg{width:17px;height:17px;display:block}
        #lsb-shell-aside{
          display:none;flex-direction:column;position:fixed;top:var(--lsb-shell-header);right:0;bottom:0;
          width:var(--lsb-shell-aside);z-index:7999;overflow:hidden;padding:0;
          background:var(--bg,#f4f5f7);color:var(--text,#222);
          border-left:1px solid var(--line-soft,#e8e8e8);
          font-family:${FONT_SANS};
        }
        #lsb-shell-aside-tabs{
          display:flex;align-items:center;gap:4px;min-height:40px;padding:6px 10px;
          border-bottom:1px solid var(--line-soft,#e8e8e8);background:color-mix(in srgb,var(--panel,#fff) 72%,transparent);
        }
        #lsb-shell-aside-tabs[hidden]{display:none!important}
        #lsb-shell-aside-tabs [data-lsb-shell-aside-tab]{
          flex:1 1 0;min-width:0;height:28px;padding:0 8px;border:0;border-radius:var(--lsb-radius-sm);
          background:transparent;color:var(--text-muted,#888);font:inherit;font-size:12px;cursor:pointer;
        }
        #lsb-shell-aside-tabs [data-lsb-shell-aside-tab][aria-selected="true"]{
          background:var(--brand-soft,#e8f4f2);color:var(--brand,#5eaaa0);font-weight:600;
        }
        .lsb-shell-aside-panes{flex:1 1 auto;height:auto;min-height:0}
        [data-lsb-shell-aside-pane]{height:100%;min-height:0;box-sizing:border-box;overflow:auto;padding:12px 10px 16px}
        [data-lsb-shell-aside-pane][hidden]{display:none!important}
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
        /* legacy 首页宽屏把纵向滚动交给中间面板，页面根和右栏保持固定。首页由 JS 明确标记，不能用 .home-shell 判断：首页和帖子页共用这个容器。 */
        @media(min-width:900px){
          html.lsb-skin-shell-on.lsb-skin-shell-home:not(.lsb-canvas-mode){
            box-sizing:border-box!important;height:100vh!important;max-height:100vh!important;overflow:hidden!important;
          }
          html.lsb-skin-shell-on.lsb-skin-shell-home:not(.lsb-canvas-mode) body{
            box-sizing:border-box!important;display:flex!important;flex-direction:column!important;
            height:calc(100vh - var(--lsb-shell-header))!important;
            max-height:calc(100vh - var(--lsb-shell-header))!important;
            min-height:0!important;margin:0!important;overflow:hidden!important;
          }
          html.lsb-skin-shell-on.lsb-skin-shell-home:not(.lsb-canvas-mode) body > main.wrap{
            box-sizing:border-box!important;display:flex!important;flex:1 1 auto!important;flex-direction:column!important;
            width:auto!important;max-width:none!important;margin-left:0!important;margin-right:0!important;padding-right:0!important;
            height:100%!important;max-height:100%!important;
            min-width:0!important;min-height:0!important;overflow:hidden!important;
          }
          html.lsb-skin-shell-on.lsb-skin-shell-home:not(.lsb-canvas-mode) body > main.wrap .home-shell,
          html.lsb-skin-shell-on.lsb-skin-shell-home:not(.lsb-canvas-mode) body > main.wrap .home-shell > .forum-layout.forum-layout-has-sidebar,
          html.lsb-skin-shell-on.lsb-skin-shell-home:not(.lsb-canvas-mode) body > main.wrap .home-shell > .forum-layout.forum-layout-has-sidebar > .forum-main{
            box-sizing:border-box!important;display:flex!important;flex:1 1 auto!important;flex-direction:column!important;
            width:100%!important;max-width:none!important;min-width:0!important;min-height:0!important;
          }
          html.lsb-skin-shell-on.lsb-skin-shell-home:not(.lsb-canvas-mode) body > main.wrap .home-shell{
            padding-right:0!important;
          }
          html.lsb-skin-shell-on.lsb-skin-shell-home:not(.lsb-canvas-mode) body > main.wrap .home-shell > .forum-layout.forum-layout-has-sidebar > .forum-main > .main-panel{
            box-sizing:border-box!important;display:flex!important;flex:1 1 auto!important;flex-direction:column!important;
            width:100%!important;max-width:none!important;min-width:0!important;min-height:0!important;
            overflow-y:auto!important;overflow-x:hidden!important;overscroll-behavior:contain;scrollbar-gutter:stable;
          }
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
          html.lsb-skin-shell-on .lsb-native-sidebar-hidden,
          html.lsb-skin-shell-on .lsb-native-left-hidden{display:none!important}
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
          html.lsb-skin-shell-on #lsb-shell-aside{display:flex}
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
          position:fixed;top:0;left:0;right:0;z-index:8002;height:3px;
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
        [data-lsb-route-content-enter]{animation:lsb-route-content-in 180ms ease both}
        @keyframes lsb-route-content-in{from{opacity:0;transform:translateY(5px)}to{opacity:1;transform:translateY(0)}}
        #lsb-route-announcer{
          position:absolute;width:1px;height:1px;padding:0;margin:-1px;overflow:hidden;
          clip-path:inset(50%);white-space:nowrap;border:0;
        }
        @media(prefers-reduced-motion:reduce){[data-lsb-route-content-enter]{animation:none!important;transform:none!important}}
        html.lsb-canvas-reduced-motion [data-lsb-route-content-enter]{animation:none!important;transform:none!important}
        /* H2 窗口工作区：默认令牌仍继承站点主题，几何由 skin 的 layout controller 写入。 */
        #lsb-shell[data-lsb-shell-mode="windowed"] #lsb-shell-workspace{
          position:fixed;top:var(--lsb-shell-header);left:0;right:0;bottom:0;
          overflow:hidden;pointer-events:none;
        }
        /* 窗口模式覆盖 700–899px 的媒体查询空档；窗口已挂载就必须可见。 */
        html.lsb-skin-shell-windowed #lsb-shell[data-lsb-shell-mode="windowed"]{display:block}
        html.lsb-skin-shell-windowed .lsb-native-header-hidden,
        html.lsb-skin-shell-windowed .lsb-native-sidebar-hidden,
        html.lsb-skin-shell-windowed .lsb-native-left-hidden,
        html.lsb-skin-shell-windowed .forum-more-region{display:none!important}
        #lsb-shell-workspace > [data-lsb-shell-video]{
          position:absolute;inset:0;width:100%;height:100%;object-fit:cover;
          z-index:0;pointer-events:none;opacity:0;transition:opacity 180ms ease;
        }
        html.lsb-skin-video-on #lsb-shell-workspace > [data-lsb-shell-video]{opacity:1}
        #lsb-shell-workspace > [data-lsb-shell-image]{
          position:absolute;inset:0;width:100%;height:100%;object-fit:cover;
          z-index:0;pointer-events:none;opacity:0;transition:opacity 180ms ease;
        }
        html.lsb-skin-image-on #lsb-shell-workspace > [data-lsb-shell-image]{opacity:1}
        #lsb-shell[data-lsb-shell-mode="windowed"] .lsb-shell-window{
          position:absolute;display:flex;flex-direction:column;min-width:0;min-height:0;
          box-sizing:border-box;overflow:hidden;pointer-events:auto;
          border:1px solid var(--line-soft,#e8e8e8);border-radius:var(--lsb-radius-lg);
          background:var(--panel,#fff);color:var(--text,#222);
          box-shadow:0 12px 30px color-mix(in srgb,var(--text,#222) 12%,transparent);
          z-index:1;
        }
        #lsb-shell[data-lsb-shell-mode="windowed"] .lsb-shell-window[data-lsb-shell-interacting="drag"]{
          will-change:transform;contain:layout paint;
        }
        #lsb-shell[data-lsb-shell-mode="windowed"] .lsb-shell-window[data-lsb-shell-interacting="resize"]{
          will-change:left,top,width,height;contain:layout paint;
        }
        #lsb-shell[data-lsb-shell-mode="windowed"] .lsb-shell-window[hidden]{display:none!important}
        #lsb-shell[data-lsb-shell-mode="windowed"] .lsb-shell-window[data-lsb-shell-external="true"][data-lsb-shell-open="false"]{display:none!important}
        #lsb-shell[data-lsb-shell-mode="windowed"] .lsb-shell-window-bar{
          display:flex;align-items:center;gap:6px;min-height:32px;flex:0 0 32px;
          padding:0 8px;border-bottom:1px solid var(--line-soft,#e8e8e8);
          background:color-mix(in srgb,var(--panel,#fff) 82%,transparent);
          color:var(--text,#222);user-select:none;touch-action:none;position:relative;z-index:5;
        }
        #lsb-shell[data-lsb-shell-mode="windowed"] .lsb-shell-window-title{
          min-width:0;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;
          font:600 12px/1 ${FONT_SANS};
        }
        #lsb-shell[data-lsb-shell-mode="windowed"] .lsb-shell-window-drag{
          flex:1;min-width:16px;height:100%;cursor:grab;
        }
        #lsb-shell[data-lsb-shell-mode="windowed"] .lsb-shell-window-drag:active{cursor:grabbing}
        #lsb-shell[data-lsb-shell-mode="windowed"] .lsb-shell-window-action{
          flex:0 0 28px;width:28px;height:28px;padding:0;border:0;border-radius:6px;
          background:transparent;color:var(--text-muted,#888);cursor:pointer;font:inherit;
        }
        #lsb-shell[data-lsb-shell-mode="windowed"] .lsb-shell-window-action:hover,
        #lsb-shell[data-lsb-shell-mode="windowed"] .lsb-shell-window-action:focus-visible{
          background:var(--brand-soft,#e8f4f2);color:var(--brand,#5eaaa0);outline:none;
        }
        #lsb-shell[data-lsb-shell-mode="windowed"] .lsb-shell-window:focus-visible{
          outline:2px solid var(--brand,#5eaaa0);outline-offset:2px;
        }
        #lsb-shell[data-lsb-shell-mode="windowed"] .lsb-shell-window-body{
          flex:1 1 auto;min-width:0;min-height:0;overflow:auto;overscroll-behavior:contain;
        }
        #lsb-shell[data-lsb-shell-mode="windowed"] #lsb-shell-rail > .lsb-shell-window-body,
        #lsb-shell[data-lsb-shell-mode="windowed"] #lsb-shell-aside > .lsb-shell-window-body{
          display:flex;flex-direction:column;
        }
        #lsb-shell[data-lsb-shell-mode="windowed"] #lsb-shell-rail,
        #lsb-shell[data-lsb-shell-mode="windowed"] #lsb-shell-aside,
        #lsb-shell[data-lsb-shell-mode="windowed"] #lsb-shell-window-content{
          top:0;right:auto;bottom:auto;left:auto;width:auto;height:auto;
          position:absolute;z-index:auto;
        }
        #lsb-shell[data-lsb-shell-mode="windowed"] #lsb-shell-rail{padding:0;border-right:0}
        #lsb-shell[data-lsb-shell-mode="windowed"] #lsb-shell-rail .lsb-shell-rail-scroll{padding-top:12px}
        #lsb-shell[data-lsb-shell-mode="windowed"] #lsb-shell-aside{display:flex;padding:0;border-left:0}
        #lsb-shell[data-lsb-shell-mode="windowed"] #lsb-shell-window-content main.wrap{
          width:auto!important;max-width:none!important;margin:0!important;padding:12px!important;
        }
        #lsb-shell[data-lsb-shell-mode="windowed"] .lsb-shell-window-content-body{
          flex:1 1 auto;min-width:0;min-height:0;overflow:auto;overscroll-behavior:contain;
        }
        #lsb-shell[data-lsb-shell-mode="windowed"] [data-lsb-shell-resize-edge]{
          position:absolute;z-index:4;touch-action:none;
        }
        #lsb-shell[data-lsb-shell-mode="windowed"] [data-lsb-shell-resize-edge="e"],
        #lsb-shell[data-lsb-shell-mode="windowed"] [data-lsb-shell-resize-edge="w"]{
          top:12px;bottom:12px;width:10px;cursor:ew-resize;
        }
        #lsb-shell[data-lsb-shell-mode="windowed"] [data-lsb-shell-resize-edge="e"]{right:-5px}
        #lsb-shell[data-lsb-shell-mode="windowed"] [data-lsb-shell-resize-edge="w"]{left:-5px}
        #lsb-shell[data-lsb-shell-mode="windowed"] [data-lsb-shell-resize-edge="s"],
        #lsb-shell[data-lsb-shell-mode="windowed"] [data-lsb-shell-resize-edge="n"]{
          left:12px;right:12px;height:10px;cursor:ns-resize;
        }
        #lsb-shell[data-lsb-shell-mode="windowed"] [data-lsb-shell-resize-edge="s"]{bottom:-5px}
        #lsb-shell[data-lsb-shell-mode="windowed"] [data-lsb-shell-resize-edge="n"]{top:-5px}
        #lsb-shell[data-lsb-shell-mode="windowed"] [data-lsb-shell-resize-edge="e"],
        #lsb-shell[data-lsb-shell-mode="windowed"] [data-lsb-shell-resize-edge="w"]{
          width:10px;top:12px;bottom:12px;
        }
        #lsb-shell[data-lsb-shell-mode="windowed"] [data-lsb-shell-resize-edge="e"]{right:-5px}
        #lsb-shell[data-lsb-shell-mode="windowed"] [data-lsb-shell-resize-edge="w"]{left:-5px}
        #lsb-shell[data-lsb-shell-mode="windowed"] [data-lsb-shell-resize-edge="s"],
        #lsb-shell[data-lsb-shell-mode="windowed"] [data-lsb-shell-resize-edge="n"]{
          height:10px;left:12px;right:12px;
        }
        #lsb-shell[data-lsb-shell-mode="windowed"] [data-lsb-shell-resize-edge="s"]{bottom:-5px}
        #lsb-shell[data-lsb-shell-mode="windowed"] [data-lsb-shell-resize-edge="n"]{top:32px}
        #lsb-shell[data-lsb-shell-mode="windowed"] [data-lsb-shell-resize-edge="ne"],
        #lsb-shell[data-lsb-shell-mode="windowed"] [data-lsb-shell-resize-edge="nw"],
        #lsb-shell[data-lsb-shell-mode="windowed"] [data-lsb-shell-resize-edge="se"],
        #lsb-shell[data-lsb-shell-mode="windowed"] [data-lsb-shell-resize-edge="sw"]{
          width:14px;height:14px;
        }
        #lsb-shell[data-lsb-shell-mode="windowed"] [data-lsb-shell-resize-edge="ne"]{right:-5px;top:32px;cursor:nesw-resize}
        #lsb-shell[data-lsb-shell-mode="windowed"] [data-lsb-shell-resize-edge="nw"]{left:-5px;top:32px;cursor:nwse-resize}
        #lsb-shell[data-lsb-shell-mode="windowed"] [data-lsb-shell-resize-edge="se"]{right:-5px;bottom:-5px;cursor:nwse-resize}
        #lsb-shell[data-lsb-shell-mode="windowed"] [data-lsb-shell-resize-edge="sw"]{left:-5px;bottom:-5px;cursor:nesw-resize}
        #lsb-shell[data-lsb-shell-mode="windowed"] .lsb-shell-window-switcher{display:none}
        @media(max-width:699px){
          html.lsb-skin-shell-on{padding:0!important;overflow:hidden}
          html.lsb-skin-shell-on body{overflow:hidden}
          html.lsb-skin-shell-on #lsb-shell{display:block}
          html.lsb-skin-shell-on .lsb-native-header-hidden,
          html.lsb-skin-shell-on .forum-more-region{display:none!important}
          html.lsb-skin-shell-on .lsb-native-sidebar-hidden,
          html.lsb-skin-shell-on .lsb-native-left-hidden{display:none!important}
          #lsb-shell[data-lsb-shell-mode="windowed"] #lsb-shell-workspace{top:var(--lsb-shell-header)}
          #lsb-shell[data-lsb-shell-mode="windowed"] .lsb-shell-window-switcher{
            display:flex;position:fixed;top:var(--lsb-shell-header);left:0;right:0;height:36px;
            z-index:8010;gap:4px;padding:4px;background:var(--panel,#fff);overflow:auto;
          }
          #lsb-shell[data-lsb-shell-mode="windowed"] .lsb-shell-window-switcher [role="tab"]{
            flex:1 0 auto;border:0;border-radius:6px;background:transparent;color:var(--text-muted,#888);
            padding:0 10px;font:600 12px ${FONT_SANS};
          }
          #lsb-shell[data-lsb-shell-mode="windowed"] .lsb-shell-window-switcher [aria-selected="true"]{
            background:var(--brand-soft,#e8f4f2);color:var(--brand,#5eaaa0);
          }
          #lsb-shell[data-lsb-shell-mode="windowed"] #lsb-shell-workspace{top:calc(var(--lsb-shell-header) + 44px)}
          #lsb-shell[data-lsb-shell-mode="windowed"] .lsb-shell-window:not([data-lsb-shell-active="true"]){display:none}
        }
        @media(prefers-reduced-motion:reduce){
          #lsb-shell[data-lsb-shell-mode="windowed"] .lsb-shell-window,
          #lsb-shell[data-lsb-shell-mode="windowed"] .lsb-shell-window *{transition:none!important;scroll-behavior:auto!important}
        }
        html.lsb-skin-shell-on{
          font-size:var(--lsb-shell-font-size,14px);
        }
        html.lsb-skin-shell-on #lsb-shell{
          font-family:var(--lsb-shell-font-family,${FONT_SANS});
        }
        html.lsb-skin-shell-on #lsb-shell-window-content,
        html.lsb-skin-shell-on #lsb-shell-rail,
        html.lsb-skin-shell-on #lsb-shell-aside{
          color:var(--lsb-shell-text,var(--text,#222));
        }
        html.lsb-skin-shell-on #lsb-shell[data-lsb-shell-mode="windowed"] .lsb-shell-window{
          background:var(--lsb-shell-panel,var(--panel,#fff));
        }
        html.lsb-skin-shell-on .lsb-shell-brand,
        html.lsb-skin-shell-on .lsb-shell-window-action{color:var(--lsb-shell-accent,var(--brand,#5eaaa0))}
        html.lsb-skin-glass-on #lsb-shell-header,
        html.lsb-skin-glass-on #lsb-shell[data-lsb-shell-mode="windowed"] .lsb-shell-window,
        html.lsb-skin-glass-on #lsb-shell[data-lsb-shell-mode="windowed"] .lsb-shell-window-bar{
          background:color-mix(in srgb,var(--lsb-shell-panel,var(--panel,#fff)) var(--lsb-shell-glass-opacity,.72),transparent);
          backdrop-filter:blur(var(--lsb-shell-glass-blur,18px));
          -webkit-backdrop-filter:blur(var(--lsb-shell-glass-blur,18px));
        }
        html.lsb-skin-shell-on #lsb-shell[data-lsb-shell-mode="windowed"] .lsb-shell-window[data-lsb-shell-glass="true"],
        html.lsb-skin-shell-on #lsb-shell[data-lsb-shell-mode="windowed"] .lsb-shell-window[data-lsb-shell-glass="true"] .lsb-shell-window-bar{
          background:color-mix(in srgb,var(--lsb-shell-panel,var(--panel,#fff)) var(--lsb-shell-glass-opacity,.72),transparent);
          backdrop-filter:blur(var(--lsb-shell-glass-blur,18px));
          -webkit-backdrop-filter:blur(var(--lsb-shell-glass-blur,18px));
        }
        @media(prefers-reduced-transparency:reduce){
          html.lsb-skin-glass-on #lsb-shell-header,
          html.lsb-skin-glass-on #lsb-shell[data-lsb-shell-mode="windowed"] .lsb-shell-window,
          html.lsb-skin-glass-on #lsb-shell[data-lsb-shell-mode="windowed"] .lsb-shell-window-bar{
            background:var(--lsb-shell-panel,var(--panel,#fff));backdrop-filter:none;-webkit-backdrop-filter:none;
          }
          html.lsb-skin-shell-on #lsb-shell[data-lsb-shell-mode="windowed"] .lsb-shell-window[data-lsb-shell-glass="true"],
          html.lsb-skin-shell-on #lsb-shell[data-lsb-shell-mode="windowed"] .lsb-shell-window[data-lsb-shell-glass="true"] .lsb-shell-window-bar{
            background:var(--lsb-shell-panel,var(--panel,#fff));backdrop-filter:none;-webkit-backdrop-filter:none;
          }
        }
      `;
}
