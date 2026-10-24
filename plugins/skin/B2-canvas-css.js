// @skin-part: B2 canvasCss — 单画布样式，纯函数（仅 FONT_SANS，外层 isCloudflare* 等不依赖）。
// 当前仍由 skin.user.js 主文件承载；B1/B2 已可作为目录聚合的第一批候选。
export function canvasCss(fontSans) {
  const FONT_SANS = fontSans || "system-ui,-apple-system,'Segoe UI','PingFang SC','Hiragino Sans GB','Microsoft YaHei','Noto Sans SC',sans-serif";
  return `
        html.lsb-skin-shell-on.lsb-canvas-mode{
          --lsb-canvas-safe-top:env(safe-area-inset-top,0px);
          --lsb-canvas-chrome-height:56px;
          --lsb-canvas-safe-bottom:env(safe-area-inset-bottom,0px);
          --lsb-canvas-surface-bg:color-mix(in srgb,var(--lsb-shell-panel,var(--panel,#fff)) calc(var(--lsb-shell-glass-opacity,.72) * 100%),transparent);
          --lsb-glass-fill:var(--lsb-canvas-surface-bg);
          --lsb-glass-border:color-mix(in srgb,var(--lsb-shell-text,var(--text,#222)) 18%,transparent);
          --lsb-glass-highlight:inset 0 1px 0 rgb(255 255 255 / 42%);
          --lsb-glass-shadow:0 14px 38px color-mix(in srgb,var(--lsb-shell-text,var(--text,#222)) 18%,transparent);
          --lsb-glass-blur:var(--lsb-shell-glass-blur,18px);
          --lsb-glass-saturation:140%;
          --lsb-canvas-content-bg:color-mix(in srgb,var(--lsb-shell-panel,var(--panel,#fff)) 94%,var(--bg,#f4f5f7));
          --lsb-canvas-media-scrim:rgb(8 12 22 / 18%);
          --lsb-canvas-radius:var(--lsb-shell-radius,16px);
          min-height:100%;padding:0!important;background:var(--bg,#f4f5f7);color:var(--lsb-shell-text,var(--text,#222));
          font-size:var(--lsb-shell-font-size,14px);
        }
        /* 让资料表面相对页面滚动而非被 body 的隐式滚动容器截断，sticky 才能跟随顶部状态条。 */
        html.lsb-skin-shell-on.lsb-canvas-mode body{min-height:100%;overflow-x:clip!important;overflow-y:visible!important;padding:0!important;isolation:isolate}
        html.lsb-skin-shell-on.lsb-canvas-mode #color-scheme-modal{z-index:8020!important}
        html.lsb-skin-shell-on.lsb-canvas-mode .lsb-shell-theme-modal{z-index:8020!important}
        html.lsb-skin-shell-on.lsb-canvas-mode body::before{content:'';position:fixed;inset:0;z-index:0;pointer-events:none;background:var(--lsb-canvas-media-scrim);opacity:0;transition:opacity 180ms ease}
        html.lsb-skin-shell-on.lsb-canvas-mode.lsb-skin-video-on body::before,
        html.lsb-skin-shell-on.lsb-canvas-mode.lsb-skin-image-on body::before{opacity:1}
        #lsb-shell-progress{
          --lsb-shell-progress:0;
          position:fixed;top:0;left:0;right:0;z-index:8002;height:3px;
          pointer-events:none;opacity:0;background:transparent;
          transition:opacity 120ms cubic-bezier(.23,1,.32,1)
        }
        #lsb-shell-progress[data-phase="loading"],#lsb-shell-progress[data-phase="done"]{opacity:1}
        #lsb-shell-progress [data-lsb-shell-progress-bar]{display:block;width:100%;height:100%;transform:scaleX(var(--lsb-shell-progress));transform-origin:left center;background:var(--brand,#5eaaa0);transition:transform 200ms cubic-bezier(.23,1,.32,1)}
        [data-lsb-route-content-enter]{animation:lsb-route-content-in 180ms ease both}
        @keyframes lsb-route-content-in{from{opacity:0;transform:translateY(5px)}to{opacity:1;transform:translateY(0)}}
        #lsb-route-announcer{position:absolute;width:1px;height:1px;padding:0;margin:-1px;overflow:hidden;clip-path:inset(50%);white-space:nowrap;border:0}
        @media(prefers-reduced-motion:reduce){[data-lsb-route-content-enter]{animation:none!important;transform:none!important}}
        html.lsb-canvas-reduced-motion [data-lsb-route-content-enter]{animation:none!important;transform:none!important}
        html.lsb-skin-shell-on.lsb-canvas-mode .lsb-canvas-content-root{position:relative;z-index:1;background:var(--lsb-canvas-content-bg);color:var(--lsb-shell-text,var(--text,#222))}
        html.lsb-skin-shell-on.lsb-canvas-mode main.wrap,
        html.lsb-skin-shell-on.lsb-canvas-mode .forum-main,
        html.lsb-skin-shell-on.lsb-canvas-mode .home-shell{
          box-sizing:border-box;display:block!important;width:auto!important;max-width:1120px!important;
          margin:0 auto!important;padding:calc(64px + var(--lsb-canvas-safe-top)) 24px calc(116px + var(--lsb-canvas-safe-bottom))!important;
        }
        html.lsb-skin-shell-on.lsb-canvas-mode .lsb-canvas-content-root{padding-top:0!important}
        html.lsb-skin-shell-on.lsb-canvas-mode .lsb-canvas-content-root .home-shell,html.lsb-skin-shell-on.lsb-canvas-mode .lsb-canvas-content-root .forum-main{padding-top:0!important}
        html.lsb-skin-shell-on.lsb-canvas-mode .lsb-canvas-content-root .main-panel{padding-top:0!important}
        html.lsb-skin-shell-on.lsb-canvas-mode:not(.lsb-canvas-page-home) .lsb-canvas-content-root{margin-top:calc(64px + var(--lsb-canvas-safe-top))!important}
        html.lsb-skin-shell-on.lsb-canvas-mode main.wrap,
        html.lsb-skin-shell-on.lsb-canvas-mode .forum-main,
        html.lsb-skin-shell-on.lsb-canvas-mode .home-shell,
        html.lsb-skin-shell-on.lsb-canvas-mode .main-panel{
          font-family:var(--lsb-shell-font-family,${FONT_SANS})!important;
          font-size:var(--lsb-shell-font-size,14px);
        }
        html.lsb-skin-shell-on.lsb-canvas-mode [data-canvas-profile-slot]{
          display:block;position:relative;margin:0 0 16px;padding:0;max-width:100%;
        }
        html.lsb-skin-shell-on.lsb-canvas-mode [data-canvas-profile-slot] > .sidebar-card.user-card{
          display:block!important;width:100%;margin:0;padding:12px 14px;border:1px solid color-mix(in srgb,var(--line,#ddd) 72%,transparent);
          border-radius:var(--lsb-canvas-radius);background:var(--lsb-canvas-surface-bg);backdrop-filter:blur(var(--lsb-shell-glass-blur,18px)) saturate(140%);
          box-shadow:0 8px 24px color-mix(in srgb,var(--text,#222) 10%,transparent);
        }
        [data-canvas-profile-slot] .user-header-info{gap:10px}
        [data-canvas-profile-slot] .user-avatar-big img,[data-canvas-profile-slot] .avatar-img{width:42px!important;height:42px!important}
        [data-canvas-profile-slot] .user-links{display:flex;gap:6px;flex-wrap:wrap;margin-top:10px}
        [data-canvas-profile-slot] .user-links a{display:inline-flex;align-items:center;gap:4px;padding:5px 8px;border-radius:999px;background:color-mix(in srgb,var(--panel,#fff) 42%,transparent);color:inherit;text-decoration:none;font-size:12px}
        [data-canvas-profile-slot] .btn-post{display:inline-flex;margin-top:10px}
        html.lsb-skin-shell-on.lsb-canvas-mode.lsb-canvas-page-user main.wrap{max-width:1120px!important;display:flex!important;flex-direction:column!important;gap:0!important}
        html.lsb-skin-shell-on.lsb-canvas-mode.lsb-canvas-page-user [data-lsb-canvas-profile],
        html.lsb-skin-shell-on.lsb-canvas-mode.lsb-canvas-page-user [data-lsb-canvas-list]{box-sizing:border-box;width:min(980px,100%)!important;max-width:980px!important;margin-left:auto!important;margin-right:auto!important;min-width:0}
        html.lsb-skin-shell-on.lsb-canvas-mode.lsb-canvas-page-user [data-lsb-canvas-profile]{
          position:sticky;top:calc(10px + var(--lsb-canvas-safe-top) + var(--lsb-canvas-chrome-height) + 6px);z-index:25;margin:0 auto!important;overflow:visible;
          width:fit-content!important;max-width:min(100%,760px)!important;
        }
        html.lsb-skin-shell-on.lsb-canvas-mode.lsb-canvas-page-user [data-lsb-canvas-profile] > .sidebar-card.user-card{
          display:block!important;width:fit-content!important;max-width:100%;margin:0;padding:12px 14px;border:1px solid color-mix(in srgb,var(--line,#ddd) 72%,transparent);
          border-radius:var(--lsb-canvas-radius);background:var(--lsb-canvas-surface-bg);backdrop-filter:blur(var(--lsb-shell-glass-blur,18px)) saturate(140%);
          box-shadow:0 8px 24px color-mix(in srgb,var(--text,#222) 10%,transparent);transition:none;
        }
        html.lsb-skin-shell-on.lsb-canvas-mode.lsb-canvas-page-user [data-lsb-canvas-list]{margin:12px auto 0!important;padding:12px!important;border:1px solid color-mix(in srgb,var(--line,#ddd) 72%,transparent);
          border-radius:var(--lsb-canvas-radius);background:var(--lsb-canvas-surface-bg);backdrop-filter:blur(var(--lsb-shell-glass-blur,18px)) saturate(140%);
          box-shadow:0 8px 24px color-mix(in srgb,var(--text,#222) 8%,transparent)}
        html.lsb-skin-shell-on.lsb-canvas-mode.lsb-canvas-page-user [data-lsb-canvas-list] > .home-shell,
        html.lsb-skin-shell-on.lsb-canvas-mode.lsb-canvas-page-user [data-lsb-canvas-list] > .forum-layout,
        html.lsb-skin-shell-on.lsb-canvas-mode.lsb-canvas-page-user [data-lsb-canvas-list] > .forum-main,
        html.lsb-skin-shell-on.lsb-canvas-mode.lsb-canvas-page-user [data-lsb-canvas-list] .forum-layout.forum-layout-has-sidebar,
        html.lsb-skin-shell-on.lsb-canvas-mode.lsb-canvas-page-user [data-lsb-canvas-list] .forum-main,
        html.lsb-skin-shell-on.lsb-canvas-mode.lsb-canvas-page-user [data-lsb-canvas-list] .main-panel{
          display:block!important;width:100%!important;max-width:none!important;margin:0!important;padding:0!important;background:transparent!important;
        }
        html.lsb-skin-shell-on.lsb-canvas-mode .forum-layout.forum-layout-has-sidebar{display:block!important;grid-template-columns:1fr!important}
        html.lsb-skin-shell-on.lsb-canvas-mode.lsb-canvas-page-home .home-shell,
        html.lsb-skin-shell-on.lsb-canvas-mode.lsb-canvas-page-home .forum-main{
          padding:0!important;
        }
        html.lsb-skin-shell-on.lsb-canvas-mode.lsb-canvas-page-home [data-canvas-profile-slot]{
          width:fit-content!important;max-width:min(100%,760px)!important;margin:0 auto 12px!important;
        }
        html.lsb-skin-shell-on.lsb-canvas-mode.lsb-canvas-page-home [data-canvas-profile-slot] > .sidebar-card.user-card{
          width:fit-content!important;max-width:100%;max-height:none!important;overflow:visible!important;
          padding:12px 14px;border-radius:var(--lsb-canvas-radius);
        }
        html.lsb-skin-shell-on.lsb-canvas-mode.lsb-canvas-page-home [data-canvas-profile-slot] .user-links{display:flex!important}
        html.lsb-skin-shell-on.lsb-canvas-mode.lsb-canvas-page-home [data-canvas-profile-slot] .btn-post{display:inline-flex!important}
        html.lsb-skin-shell-on.lsb-canvas-mode.lsb-canvas-page-home [data-canvas-profile-slot] .user-avatar-big img,
        html.lsb-skin-shell-on.lsb-canvas-mode.lsb-canvas-page-home [data-canvas-profile-slot] .avatar-img{width:36px!important;height:36px!important}
        html.lsb-skin-shell-on.lsb-canvas-mode.lsb-canvas-page-home .home-shell{
          background:transparent!important;border:0!important;box-shadow:none!important;border-radius:0!important;overflow:visible;
        }
        html.lsb-skin-shell-on.lsb-canvas-mode.lsb-canvas-page-home .main-panel{
          background:var(--lsb-canvas-surface-bg)!important;border:1px solid color-mix(in srgb,var(--line,#ddd) 72%,transparent);
          border-radius:var(--lsb-canvas-radius)!important;box-shadow:0 8px 24px color-mix(in srgb,var(--text,#222) 8%,transparent);
          overflow:hidden;
        }
        @media(min-width:700px){
          html.lsb-skin-shell-on.lsb-canvas-mode.lsb-canvas-page-home .lsb-canvas-content-root{
            display:flex!important;flex-direction:column!important;min-height:0!important;height:100vh!important;max-height:100vh!important;
            overflow:hidden!important;overscroll-behavior:none;
          }
          html.lsb-skin-shell-on.lsb-canvas-mode.lsb-canvas-page-home .lsb-canvas-content-root > .home-shell{
            display:flex!important;flex:1 1 auto;flex-direction:column;min-width:0;min-height:0;
          }
          html.lsb-skin-shell-on.lsb-canvas-mode.lsb-canvas-page-home .home-shell > .forum-layout.forum-layout-has-sidebar{
            display:flex!important;flex:1 1 auto;flex-direction:column;min-width:0;min-height:0;
          }
          html.lsb-skin-shell-on.lsb-canvas-mode.lsb-canvas-page-home .forum-layout.forum-layout-has-sidebar > .forum-main{
            display:flex!important;flex:1 1 auto;flex-direction:column;min-width:0;min-height:0;
          }
          html.lsb-skin-shell-on.lsb-canvas-mode.lsb-canvas-page-home .forum-main > .main-panel{
            display:flex!important;flex:1 1 auto;flex-direction:column;min-width:0;min-height:0;
            overflow-y:auto!important;overflow-x:hidden!important;overscroll-behavior:contain;scrollbar-gutter:stable;
          }
        }
        @media(max-width:699px){
          html.lsb-skin-shell-on.lsb-canvas-mode.lsb-canvas-page-home .lsb-canvas-content-root{
            height:auto!important;max-height:none!important;overflow:visible!important;
          }
          html.lsb-skin-shell-on.lsb-canvas-mode.lsb-canvas-page-home .main-panel{
            height:auto!important;max-height:none!important;overflow:visible!important;
          }
        }
        html.lsb-skin-shell-on.lsb-canvas-mode.lsb-canvas-page-home .topic-toolbar{
          min-height:44px;margin:0!important;padding:8px 12px!important;align-items:center;
        }
        html.lsb-skin-shell-on.lsb-canvas-mode .lsb-native-header-hidden,
        html.lsb-skin-shell-on.lsb-canvas-mode .lsb-native-sidebar-hidden,
        html.lsb-skin-shell-on.lsb-canvas-mode .lsb-native-left-hidden,
        html.lsb-skin-shell-on.lsb-canvas-mode .forum-more-region{display:none!important}
        html.lsb-canvas-route-pending body > .top,
        html.lsb-canvas-route-pending body > header,
        html.lsb-canvas-route-pending body > .site-header,
        html.lsb-canvas-route-pending body > [data-site-header],
        html.lsb-canvas-route-pending .forum-more-region,
        html.lsb-canvas-route-pending aside.sidebar:not(#mobile-menu-drawer):not(.mobile-menu-drawer),
        html.lsb-canvas-route-pending .forum-enhancements-left-fixed,
        html.lsb-canvas-route-pending #mobile-menu,
        html.lsb-canvas-route-pending .mobile-menu-backdrop,
        html.lsb-canvas-route-pending .lsb-launcher{display:none!important}
        html.lsb-skin-shell-on.lsb-canvas-mode aside.sidebar:not(#mobile-menu-drawer):not(.mobile-menu-drawer),
        html.lsb-skin-shell-on.lsb-canvas-mode .forum-enhancements-left-fixed{display:none!important}
        html.lsb-skin-shell-on.lsb-canvas-mode li.post-item:not(.post-entry) .meta-icon{display:none}
        html.lsb-skin-shell-on.lsb-canvas-mode li.post-item{padding-block:8px!important;border-radius:var(--lsb-canvas-radius)}
        html.lsb-skin-shell-on.lsb-canvas-mode li.post-entry{border-radius:var(--lsb-canvas-radius)}
        #lsb-shell[data-lsb-canvas-shell]{display:block;position:fixed;inset:0;z-index:7999;pointer-events:none;font-family:var(--lsb-shell-font-family,${FONT_SANS});color:var(--lsb-shell-text,var(--text,#222))}
        #lsb-shell[data-lsb-canvas-shell] *{box-sizing:border-box}
        #lsb-shell[data-lsb-canvas-shell] > [data-lsb-shell-video],#lsb-shell[data-lsb-canvas-shell] > [data-lsb-shell-image]{position:absolute;inset:0;width:100%;height:100%;object-fit:cover;z-index:0;pointer-events:none;opacity:0;transition:opacity 180ms ease}
        html.lsb-skin-video-on #lsb-shell[data-lsb-canvas-shell] > [data-lsb-shell-video]{opacity:1}
        html.lsb-skin-image-on #lsb-shell[data-lsb-canvas-shell] > [data-lsb-shell-image]{opacity:1}
        html.lsb-skin-shell-on.lsb-canvas-mode body > [data-lsb-shell-video][data-lsb-shell-video-layer="canvas"]{
          position:fixed;inset:0;width:100%;height:100%;box-sizing:border-box;object-fit:cover;
          z-index:0;pointer-events:none;opacity:0;transition:opacity 180ms ease;
        }
        html.lsb-skin-video-on.lsb-canvas-mode body > [data-lsb-shell-video][data-lsb-shell-video-layer="canvas"]{opacity:1}
        html.lsb-skin-shell-on.lsb-canvas-mode body > [data-lsb-shell-image][data-lsb-shell-image-layer="canvas"]{
          position:fixed;inset:0;width:100%;height:100%;box-sizing:border-box;object-fit:cover;
          z-index:0;pointer-events:none;opacity:0;transition:opacity 180ms ease;
        }
        html.lsb-skin-image-on.lsb-canvas-mode body > [data-lsb-shell-image][data-lsb-shell-image-layer="canvas"]{opacity:1}
        html.lsb-skin-shell-on .lsb-launcher{display:none!important}
        #lsb-shell-surfaces{position:absolute;inset:0;pointer-events:none;--lsb-canvas-chrome-height:56px}
        #lsb-shell-surfaces > [data-surface]{pointer-events:auto}
        #lsb-shell-surfaces [data-surface]{font:inherit;color:inherit}
        [data-canvas-profile-host]{
          position:fixed;top:calc(10px + var(--lsb-canvas-safe-top));left:max(12px,calc((100% - 1120px) / 2 + 24px));z-index:8004;
          display:flex;align-items:center;min-width:0;pointer-events:auto;color:inherit;
        }
        [data-canvas-profile-host][hidden]{display:none!important}
        [data-canvas-profile-host] > .sidebar-card.user-card{
          position:relative;display:block!important;box-sizing:border-box;width:190px;min-width:0;height:var(--lsb-canvas-chrome-height);max-height:var(--lsb-canvas-chrome-height);margin:0;padding:0 72px 0 10px;
          overflow:visible!important;border:1px solid var(--lsb-glass-border);border-radius:999px;background:var(--lsb-glass-fill);
          backdrop-filter:blur(var(--lsb-glass-blur)) saturate(var(--lsb-glass-saturation));-webkit-backdrop-filter:blur(var(--lsb-glass-blur)) saturate(var(--lsb-glass-saturation));
          box-shadow:var(--lsb-glass-highlight),var(--lsb-glass-shadow);transition:box-shadow 160ms ease;
        }
        [data-canvas-profile-host]:not([data-expanded="true"]) > .sidebar-card.user-card{overflow:hidden!important;}
        [data-canvas-profile-host]:not([data-expanded="true"]) .user-wrap{width:100%;height:100%;padding:0!important;margin:0!important;box-sizing:border-box}
        [data-canvas-profile-host]:not([data-expanded="true"]) .user-header{display:flex!important;align-items:center;min-height:100%;height:100%;margin:0!important;padding:0!important}
        [data-canvas-profile-host]:not([data-expanded="true"]) .user-header-info{display:flex!important;align-items:center;gap:6px;min-width:0;width:100%;height:100%;padding:0!important}
        [data-canvas-profile-host]:not([data-expanded="true"]) .user-avatar-big{display:flex!important;align-items:center;justify-content:center;flex:0 0 36px;width:36px!important;height:36px!important;min-width:36px}
        [data-canvas-profile-host]:not([data-expanded="true"]) .user-avatar-big img,[data-canvas-profile-host]:not([data-expanded="true"]) .avatar-img{display:block;width:36px!important;height:36px!important;min-width:36px;object-fit:cover}
        [data-canvas-profile-host]:not([data-expanded="true"]) .user-header-info > div{min-width:0;flex:0 1 auto;width:60px}
        [data-canvas-profile-host]:not([data-expanded="true"]) .user-name{display:block;max-width:60px;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;font-size:12px;font-weight:650;line-height:16px}
        [data-canvas-profile-host]:not([data-expanded="true"]) .user-rank,
        [data-canvas-profile-host]:not([data-expanded="true"]) .user-group,
        [data-canvas-profile-host]:not([data-expanded="true"]) .user-title{display:none!important}
        [data-canvas-profile-host]:not([data-expanded="true"]) .user-links{position:absolute;top:50%;right:42px;display:flex!important;align-items:center;gap:4px;margin:0!important;transform:translateY(-50%)}
        [data-canvas-profile-host] .user-links a[data-canvas-profile-bell]{position:relative;display:inline-flex!important;align-items:center;justify-content:center;width:27px;height:27px;padding:0;border-radius:999px;background:color-mix(in srgb,var(--panel,#fff) 42%,transparent);font-size:0;line-height:1;color:inherit}
        [data-canvas-profile-host] .user-links a[data-canvas-profile-bell] .meta-icon{width:16px;height:16px;margin:0}
        [data-canvas-profile-host] .user-links a[data-canvas-profile-bell]:hover,[data-canvas-profile-host] .user-links a[data-canvas-profile-bell]:focus-visible{background:var(--brand-soft,#e8f4f2);outline:none}
        [data-canvas-profile-host] .user-links a[data-canvas-profile-bell] .notify-badge{position:absolute;top:-2px;right:-2px;min-width:9px;height:9px;padding:0;border:2px solid var(--lsb-shell-panel,var(--panel,#fff));border-radius:50%;font-size:0;line-height:0;background:var(--danger,#e07a7a)}
        [data-canvas-profile-host]:not([data-expanded="true"]) .user-links a:not([data-canvas-profile-bell]),
        [data-canvas-profile-host]:not([data-expanded="true"]) .btn-post{display:none!important}
        [data-canvas-profile-host][data-expanded="true"]{align-items:flex-start}
        [data-canvas-profile-host][data-expanded="true"] > .sidebar-card.user-card{position:absolute;top:calc(100% + 8px);left:0;width:min(340px,calc(100vw - 24px));height:auto;max-height:none;padding:12px 14px;border-radius:var(--lsb-canvas-radius);box-shadow:var(--lsb-glass-highlight),0 18px 44px color-mix(in srgb,var(--lsb-shell-text,var(--text,#222)) 22%,transparent)}
        [data-canvas-profile-host][data-expanded="true"] .user-links{position:static;display:flex!important;gap:6px;flex-wrap:wrap;margin-top:10px!important}
        [data-canvas-profile-host][data-expanded="true"] .user-links a:not([data-canvas-profile-bell]){display:inline-flex!important}
        [data-canvas-profile-host][data-expanded="true"] .user-links a[data-canvas-profile-bell]{display:inline-flex!important;align-items:center;justify-content:center;width:auto!important;min-width:0;height:auto!important;min-height:27px;padding:5px 8px!important;gap:4px;font-size:12px!important;line-height:1.2;white-space:nowrap}
        [data-canvas-profile-host][data-expanded="true"] .user-links a[data-canvas-profile-bell] .meta-icon{flex:0 0 auto;width:14px;height:14px;margin:0}
        [data-canvas-profile-expand]{position:absolute;top:50%;right:4px;z-index:2;display:inline-flex;align-items:center;justify-content:center;width:28px;height:28px;padding:0;border:0;border-radius:999px;background:transparent;color:inherit;cursor:pointer;font:inherit;font-size:16px;line-height:1;transform:translateY(-50%)}
        [data-canvas-profile-expand]:hover,[data-canvas-profile-expand]:focus-visible{background:var(--brand-soft,#e8f4f2);outline:none}
        [data-canvas-profile-host][data-expanded="true"] [data-canvas-profile-expand]{background:var(--brand-soft,#e8f4f2)}
        @media(max-width:1099px){
          [data-canvas-profile-host]{top:calc(6px + var(--lsb-canvas-safe-top));left:8px;max-width:190px}
          [data-canvas-profile-host] > .sidebar-card.user-card{width:190px}
          #lsb-shell-surfaces [data-surface="top-status"]{left:210px;right:8px;transform:none;max-width:none}
          #lsb-shell-surfaces [data-surface="top-status"][data-compact="true"]{transform:translateY(-34px)}
          #lsb-shell-surfaces [data-surface="site-status"]{display:none!important}
        }
        @media(max-width:699px){
          [data-canvas-profile-host]{max-width:184px}
          [data-canvas-profile-host] > .sidebar-card.user-card{width:184px}
          [data-canvas-profile-host]:not([data-expanded="true"]) .user-header-info > div,
          [data-canvas-profile-host]:not([data-expanded="true"]) .user-name,
          [data-canvas-profile-host]:not([data-expanded="true"]) .user-rank{width:54px;max-width:54px}
          #lsb-shell-surfaces [data-surface="top-status"]{left:204px;max-width:calc(100vw - 16px);height:var(--lsb-canvas-chrome-height);min-height:var(--lsb-canvas-chrome-height)}
        }
        @media(min-width:1100px){
          #lsb-shell-surfaces [data-surface="top-status"]{width:min(620px,calc(100vw - 24px));max-width:min(620px,calc(100vw - 24px))}
          #lsb-shell-surfaces [data-surface="site-status"]{position:fixed;top:calc(10px + var(--lsb-canvas-safe-top));right:max(12px,calc((100vw - 1120px) / 2 + 12px));z-index:8000;display:flex;align-items:center;justify-content:flex-end;width:auto;height:var(--lsb-canvas-chrome-height);min-height:var(--lsb-canvas-chrome-height);padding:0;border:0;border-radius:0;background:transparent;backdrop-filter:none;-webkit-backdrop-filter:none;box-shadow:none;overflow:visible}
          #lsb-shell-surfaces [data-surface="site-status"][hidden]{display:none!important}
        }
        [data-canvas-backdrop]{position:fixed;inset:0;z-index:8009;background:rgb(5 8 18 / 52%);backdrop-filter:blur(4px);-webkit-backdrop-filter:blur(4px);pointer-events:auto}
        [data-canvas-backdrop][hidden]{display:none!important}
        [data-surface="top-status"]{
          position:fixed;top:calc(10px + var(--lsb-canvas-safe-top));left:50%;transform:translateX(-50%);z-index:8000;
          display:flex;align-items:center;gap:8px;height:var(--lsb-canvas-chrome-height);min-height:var(--lsb-canvas-chrome-height);max-width:min(840px,calc(100vw - 24px));padding:7px 10px;
          border:1px solid var(--lsb-glass-border);border-radius:999px;
          background:var(--lsb-glass-fill);backdrop-filter:blur(var(--lsb-glass-blur)) saturate(var(--lsb-glass-saturation));-webkit-backdrop-filter:blur(var(--lsb-glass-blur)) saturate(var(--lsb-glass-saturation));
          box-shadow:var(--lsb-glass-highlight),var(--lsb-glass-shadow);transition:opacity 160ms ease,transform 160ms ease;
        }
        [data-surface="top-status"][data-compact="true"]{opacity:.78;transform:translate(-50%,-34px)}
        [data-surface="top-status"] button,[data-surface="tool-capsule"] button,[data-surface="tool-sheet"] button{font:inherit}
        [data-surface="top-status"] [data-canvas-status-title]{flex:0 0 auto;min-width:0;max-width:46vw;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;font-weight:650}
        [data-route-transition="in"]{animation:lsb-route-title-in 180ms ease both}
        @keyframes lsb-route-title-in{from{opacity:.45;transform:translateY(2px)}to{opacity:1;transform:none}}
        [data-canvas-status-links]{display:flex;align-items:center;gap:5px;flex:1 1 auto;min-width:0;overflow-x:auto;overscroll-behavior-inline:contain;scrollbar-width:none}
        [data-canvas-status-links]::-webkit-scrollbar{display:none}
        [data-canvas-pinned-links]{display:flex;align-items:center;gap:5px;flex:0 0 auto;min-width:0}
        [data-canvas-status-links] a,[data-canvas-pinned-links] a,[data-canvas-pinned-links] [data-canvas-navigation-trigger]{display:inline-flex;align-items:center;flex:0 0 auto;min-height:30px;padding:0 8px;border:0;border-radius:999px;
          color:inherit;text-decoration:none;font:inherit;font-size:12px;font-weight:550;white-space:nowrap;background:color-mix(in srgb,var(--panel,#fff) 48%,transparent);cursor:pointer}
        [data-canvas-status-links] a:hover,[data-canvas-status-links] a:focus-visible,[data-canvas-pinned-links] a:hover,[data-canvas-pinned-links] a:focus-visible,[data-canvas-pinned-links] [data-canvas-navigation-trigger]:hover,[data-canvas-pinned-links] [data-canvas-navigation-trigger]:focus-visible{background:var(--brand-soft,#e8f4f2);outline:none}
        [data-canvas-search-host]{position:relative;display:flex;align-items:center;justify-content:center;flex:0 0 34px;width:34px;min-width:34px;max-width:34px;height:34px;margin-left:2px;overflow:visible}
        [data-canvas-search-host][hidden]{display:none!important}
        [data-canvas-search-trigger]{display:inline-flex;align-items:center;justify-content:center;flex:0 0 34px;width:34px;height:34px;padding:0;border:1px solid var(--lsb-glass-border);border-radius:50%;background:color-mix(in srgb,var(--panel,#fff) 42%,transparent);box-shadow:var(--lsb-glass-highlight);color:inherit;cursor:pointer}
        [data-canvas-search-trigger]:hover,[data-canvas-search-trigger]:focus-visible{background:var(--brand-soft,#e8f4f2);outline:none}
        [data-canvas-search-trigger] svg{display:block;width:17px;height:17px;stroke:currentColor;stroke-width:1.8;fill:none;stroke-linecap:round;stroke-linejoin:round}
        [data-canvas-search-panel]{position:absolute;top:calc(100% + 8px);right:0;z-index:8020;box-sizing:border-box;width:min(320px,calc(100vw - 24px));max-width:calc(100vw - 24px);padding:8px;border:1px solid var(--lsb-glass-border);border-radius:20px;background:var(--lsb-glass-fill);backdrop-filter:blur(var(--lsb-glass-blur)) saturate(var(--lsb-glass-saturation));-webkit-backdrop-filter:blur(var(--lsb-glass-blur)) saturate(var(--lsb-glass-saturation));box-shadow:var(--lsb-glass-highlight),var(--lsb-glass-shadow)}
        [data-canvas-search-panel][hidden]{display:none!important}
        [data-canvas-search-panel] .lsb-shell-search{display:flex!important;align-items:center;gap:4px;box-sizing:border-box;width:100%;min-width:0;max-width:none;height:34px;margin:0;padding:3px 5px 3px 9px;border:1px solid var(--lsb-glass-border);border-radius:999px;background:color-mix(in srgb,var(--panel,#fff) 42%,transparent);box-shadow:var(--lsb-glass-highlight);overflow:hidden}
        [data-canvas-search-panel] .lsb-shell-search input[type="search"],[data-canvas-search-panel] .lsb-shell-search input[name="q"]{box-sizing:border-box;flex:1 1 auto;width:100%;min-width:0;height:26px;margin:0;padding:0 5px;border:0;border-radius:999px;background:transparent;color:inherit;font:inherit;font-size:12px}
        [data-canvas-search-panel] .lsb-shell-search select{flex:0 1 auto;max-width:68px;min-width:0;height:26px;border:0;border-radius:999px;background:transparent;color:inherit;font:inherit;font-size:11px}
        [data-canvas-search-panel] .lsb-shell-search button{flex:0 0 auto;min-width:28px;height:26px;padding:0 7px;border:0;border-radius:999px;background:var(--brand-soft,#e8f4f2);color:var(--brand,#5eaaa0);font:inherit;font-size:11px;cursor:pointer}
        [data-canvas-search-panel] .lsb-shell-search.search-page-link{display:flex!important;align-items:center;justify-content:space-between;min-width:40px;padding:0 9px;color:inherit;text-decoration:none;font-size:12px}
        [data-canvas-site-status-host]{position:relative;isolation:isolate;display:flex;align-items:center;gap:2px;width:auto;height:100%;min-height:var(--lsb-canvas-chrome-height);padding:0 8px 0 14px;border:0;border-radius:999px;background:transparent;box-shadow:none;overflow:visible;z-index:1;cursor:pointer;color:inherit}
        [data-canvas-site-status-host]::before{content:'';position:absolute;inset:0;z-index:0;border:1px solid var(--lsb-glass-border);border-radius:inherit;background:var(--lsb-glass-fill);backdrop-filter:blur(var(--lsb-glass-blur)) saturate(var(--lsb-glass-saturation));-webkit-backdrop-filter:blur(var(--lsb-glass-blur)) saturate(var(--lsb-glass-saturation));box-shadow:var(--lsb-glass-highlight),var(--lsb-glass-shadow);pointer-events:none}
        [data-canvas-site-status-host][hidden]{display:none!important}
        [data-canvas-site-status-body]{display:flex;align-items:center;gap:6px;width:100%;height:100%;min-width:0;overflow:hidden;border:0;border-radius:999px;background:transparent;backdrop-filter:none;-webkit-backdrop-filter:none;box-shadow:none}
        [data-canvas-site-status-body] > .sidebar-card{display:block!important;flex:0 0 auto!important;width:100%;height:var(--lsb-canvas-chrome-height)!important;max-height:var(--lsb-canvas-chrome-height)!important;overflow:hidden!important;margin:0;padding:0 34px 0 10px;border:0;border-radius:999px;background:transparent;box-shadow:none}
        [data-canvas-site-status-body] > .sidebar-card .quick-wrap{height:100%;padding:0!important;margin:0!important;display:flex;align-items:center;min-width:0}
        [data-canvas-site-status-body] > .sidebar-card .quick-title,[data-canvas-site-status-body] > .sidebar-card .daily-hot-topics-head{display:block;min-width:0;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;font-size:12px;font-weight:650}
        [data-canvas-site-status-body] > .sidebar-card .quick-links,[data-canvas-site-status-body] > .sidebar-card .daily-hot-topics-list{display:none!important}
        [data-canvas-site-status-body] [data-canvas-site-empty-state]{display:block!important;margin:0;padding:0 10px;color:var(--text-muted,#888);font-size:11px;line-height:1.2;white-space:nowrap;overflow:hidden;text-overflow:ellipsis}
        [data-canvas-site-status-body] [data-canvas-site-empty-state][hidden]{display:none!important}
        [data-canvas-site-status-host]:not([data-expanded="true"]) [data-canvas-site-status-body]{display:none!important}
        [data-canvas-site-status-label]{position:relative;z-index:1;display:inline-flex;align-items:center;border:0;padding:0;background:transparent;color:inherit;font:inherit;font-size:12px;font-weight:550;line-height:1;white-space:nowrap;cursor:pointer}
        [data-canvas-site-status-expand]{position:relative;z-index:1;top:auto;right:auto;display:inline-flex;align-items:center;justify-content:center;width:22px;height:22px;padding:0;border:0;border-radius:999px;background:transparent;color:inherit;cursor:pointer;font:inherit;font-size:14px;line-height:1;transform:none}
        [data-canvas-site-status-expand]:hover,[data-canvas-site-status-expand]:focus-visible{background:var(--brand-soft,#e8f4f2);outline:none}
        [data-canvas-site-status-host][data-expanded="true"]{align-items:center}
        [data-canvas-site-status-host][data-expanded="true"] [data-canvas-site-status-body]{position:absolute;top:calc(100% + 8px);right:0;z-index:2;display:flex;flex-direction:column;align-items:stretch;gap:0;width:min(340px,calc(100vw - 24px));height:auto;max-height:calc(100vh - 90px);overflow:auto;padding:8px 14px;border:1px solid var(--lsb-glass-border);border-radius:34px;background:var(--lsb-glass-fill);backdrop-filter:blur(var(--lsb-glass-blur)) saturate(var(--lsb-glass-saturation));-webkit-backdrop-filter:blur(var(--lsb-glass-blur)) saturate(var(--lsb-glass-saturation));box-shadow:var(--lsb-glass-highlight),var(--lsb-glass-shadow)}
        [data-canvas-site-status-host][data-expanded="true"] [data-canvas-site-status-body] > .sidebar-card{height:auto!important;max-height:none!important;overflow:visible!important;margin:0!important;padding:10px 2px!important;border:0!important;border-radius:0!important;background:transparent!important;box-shadow:none!important}
        [data-canvas-site-status-host][data-expanded="true"] [data-canvas-site-status-body] > .sidebar-card + .sidebar-card{margin-top:0!important;border-top:1px solid color-mix(in srgb,var(--lsb-shell-text,var(--text,#222)) 12%,transparent)!important}
        [data-canvas-site-status-host][data-expanded="true"] [data-canvas-site-status-body] .quick-links,[data-canvas-site-status-host][data-expanded="true"] [data-canvas-site-status-body] .daily-hot-topics-list{display:block!important}
        [data-canvas-site-status-host][data-expanded="true"] [data-canvas-site-status-expand]{background:var(--brand-soft,#e8f4f2)}
        html.lsb-canvas-page-user #lsb-shell-surfaces [data-surface="top-status"] [data-canvas-status-title]{max-width:24vw}
        [data-canvas-action]{border:0;background:transparent;color:inherit;cursor:pointer;border-radius:999px;min-width:30px;min-height:30px;padding:0 8px}
        [data-canvas-action]:hover,[data-canvas-action]:focus-visible{background:color-mix(in srgb,var(--brand-soft,#e8f4f2) 80%,transparent);outline:none}
        [data-surface="tool-capsule"]{
          position:fixed;left:50%;bottom:calc(14px + var(--lsb-canvas-safe-bottom));transform:translateX(-50%);z-index:8001;
          display:flex;align-items:center;gap:4px;padding:6px;border:1px solid var(--lsb-glass-border);
          border-radius:999px;background:var(--lsb-glass-fill);backdrop-filter:blur(var(--lsb-glass-blur)) saturate(var(--lsb-glass-saturation));-webkit-backdrop-filter:blur(var(--lsb-glass-blur)) saturate(var(--lsb-glass-saturation));
          box-shadow:var(--lsb-glass-highlight),var(--lsb-glass-shadow)
        }
        [data-surface="tool-capsule"] button{min-width:38px;height:34px;border:0;border-radius:999px;background:transparent;color:inherit;cursor:pointer}
        [data-surface="tool-capsule"] button:hover,[data-surface="tool-capsule"] button:focus-visible{background:var(--brand-soft,#e8f4f2);outline:none}
        [data-surface="tool-sheet"], [data-surface="navigation-sheet"], [data-surface="site-card"], [data-surface="appearance-sheet"], [data-surface="ai-card"], [data-surface="plugin-features-sheet"], [data-surface="plugin-settings-sheet"]{
          position:fixed;left:50%;bottom:calc(70px + var(--lsb-canvas-safe-bottom));transform:translateX(-50%);z-index:8010;
          width:min(520px,calc(100vw - 24px));max-height:min(70vh,640px);overflow:auto;padding:18px;
          border:1px solid var(--lsb-glass-border);border-radius:var(--lsb-canvas-radius);
          background:var(--lsb-glass-fill);backdrop-filter:blur(var(--lsb-glass-blur)) saturate(var(--lsb-glass-saturation));-webkit-backdrop-filter:blur(var(--lsb-glass-blur)) saturate(var(--lsb-glass-saturation));
          box-shadow:var(--lsb-glass-highlight),var(--lsb-glass-shadow);opacity:1;transition:opacity 180ms ease,transform 180ms ease
        }
        [data-surface="tool-sheet"][hidden],[data-surface="navigation-sheet"][hidden],[data-surface="site-card"][hidden],[data-surface="appearance-sheet"][hidden],[data-surface="ai-card"][hidden],[data-surface="plugin-features-sheet"][hidden],[data-surface="plugin-settings-sheet"][hidden],[data-surface="context-pill"][hidden]{display:none!important}
        [data-surface="context-pill"]{
          position:fixed;display:flex;align-items:center;gap:3px;padding:4px;
          border:1px solid var(--lsb-glass-border);border-radius:999px;
          background:var(--lsb-glass-fill);backdrop-filter:blur(var(--lsb-glass-blur)) saturate(var(--lsb-glass-saturation));-webkit-backdrop-filter:blur(var(--lsb-glass-blur)) saturate(var(--lsb-glass-saturation));
          box-shadow:var(--lsb-glass-highlight),var(--lsb-glass-shadow);white-space:nowrap
        }
        [data-surface="context-pill"] button{min-height:30px;padding:0 10px;border:0;border-radius:999px;background:transparent;color:inherit;font:inherit;font-size:12px;cursor:pointer}
        [data-surface="context-pill"] button:hover,[data-surface="context-pill"] button:focus-visible{background:var(--brand-soft,#e8f4f2);outline:none}
        [data-surface="ai-card"][data-surface-mode="floating"]{left:auto;right:24px;bottom:88px;transform:none;width:420px;max-width:calc(100vw - 32px);height:560px;max-height:calc(100vh - 120px);resize:both;overflow:auto}
        [data-surface="site-card"][data-surface-mode="floating"],[data-surface="evidence-card"][data-surface-mode="floating"]{transform:none;right:auto;bottom:auto;max-width:calc(100vw - 32px);max-height:calc(100vh - 32px);height:auto}
        [data-surface="site-card"][data-surface-mode="rail"]{
          position:fixed;top:calc(72px + var(--lsb-canvas-safe-top));right:max(12px,calc((100vw - 1120px) / 2));bottom:calc(70px + var(--lsb-canvas-safe-bottom));left:auto;transform:none;
          width:min(320px,calc(30vw - 24px));max-width:calc(100vw - 32px);max-height:none;height:auto;overflow:auto;padding:16px;
          border-radius:20px;z-index:8005;
        }
        [data-surface="site-card"][data-surface-mode="rail"] [data-canvas-sheet-head]{cursor:default}
        [data-surface="site-card"][data-surface-mode="rail"] [data-canvas-resize-handle]{display:none!important}
        [data-surface="ai-card"]{display:flex;flex-direction:column;gap:10px}
        [data-surface="ai-card"] [data-canvas-ai-host]{min-height:0;flex:1;overflow:auto}
        [data-surface="ai-card"][data-surface-mode="sheet"]{bottom:calc(70px + var(--lsb-canvas-safe-bottom));width:min(520px,calc(100vw - 24px));max-height:min(70vh,640px)}
        [data-surface="ai-card"][data-surface-mode="fullscreen"]{left:8px;right:8px;bottom:calc(58px + var(--lsb-canvas-safe-bottom));transform:none;width:auto;max-height:calc(100vh - 82px);border-radius:22px}
        [data-surface="ai-card"][data-ai-workbench-mounted]{padding:0!important;gap:0}
        [data-surface="ai-card"][data-ai-workbench-mounted] > [data-canvas-sheet-head]{display:none!important}
        [data-surface][data-surface-mode="floating"] [data-canvas-sheet-head]{cursor:grab;user-select:none}
        [data-surface][data-surface-mode="floating"][data-canvas-dragging="true"]{will-change:transform;cursor:grabbing}
        [data-surface][data-surface-mode="floating"] [data-canvas-resize-handle]{position:absolute;right:3px;bottom:3px;width:16px;height:16px;cursor:nwse-resize;touch-action:none}
        [data-surface] [data-canvas-sheet-head]{position:relative;display:flex;align-items:center;justify-content:space-between;gap:12px;margin:-2px 0 12px;padding-top:8px}
        [data-canvas-sheet-grabber]{position:absolute;top:0;left:50%;width:34px;height:4px;transform:translateX(-50%);border-radius:999px;background:color-mix(in srgb,var(--lsb-shell-text,var(--text,#222)) 26%,transparent)}
        [data-surface][data-canvas-surface-state="opening"]{opacity:0;transform:translateX(-50%) translateY(8px) scale(.985)}
        [data-surface][data-canvas-surface-state="closing"]{opacity:0;pointer-events:none}
        [data-surface][data-surface-mode="floating"][data-canvas-surface-state="opening"]{transform:translateY(8px) scale(.985)}
        [data-surface="site-card"][data-surface-mode="rail"][data-canvas-surface-state="opening"]{transform:translateY(0) scale(1)}
        [data-surface][data-surface-mode="fullscreen"][data-canvas-surface-state="opening"]{transform:translateY(12px) scale(.99)}
        [data-surface] [data-canvas-sheet-head] h2{margin:0;font-size:16px;line-height:1.3}
        [data-surface] [data-canvas-close]{border:0;border-radius:999px;background:transparent;color:inherit;cursor:pointer;width:32px;height:32px;font-size:18px}
        [data-surface] [data-canvas-close]:hover,[data-surface] [data-canvas-close]:focus-visible{background:var(--brand-soft,#e8f4f2);outline:none}
        [data-surface="tool-sheet"] [data-tool-grid]{display:grid;grid-template-columns:repeat(2,minmax(0,1fr));gap:8px;margin-bottom:14px}
        [data-surface="tool-sheet"] [data-tool-action]{min-height:46px;padding:10px;border:1px solid var(--line-soft,#e8e8e8);border-radius:12px;background:color-mix(in srgb,var(--panel,#fff) 48%,transparent);color:inherit;text-align:left;cursor:pointer}
        [data-surface="tool-sheet"] [data-tool-action]:hover,[data-surface="tool-sheet"] [data-tool-action]:focus-visible{border-color:var(--brand,#5eaaa0);outline:none}
        [data-surface="tool-sheet"] [data-canvas-query]{display:flex;gap:8px;align-items:flex-end}
        [data-surface="tool-sheet"] textarea{flex:1;min-height:70px;resize:vertical;border:1px solid var(--line,#ddd);border-radius:12px;padding:9px;background:color-mix(in srgb,var(--panel,#fff) 64%,transparent);color:inherit;font:inherit}
        [data-surface="tool-sheet"] [data-canvas-send]{min-height:38px;border:0;border-radius:999px;padding:0 16px;background:var(--brand,#5eaaa0);color:#fff;cursor:pointer}
        [data-surface="plugin-features-sheet"] [data-plugin-feature-list],[data-surface="plugin-settings-sheet"] [data-plugin-settings-list]{display:grid;gap:7px;margin:8px 0 14px}
        [data-surface="plugin-features-sheet"] [data-plugin-feature-list] .lsb-empty,[data-surface="plugin-settings-sheet"] [data-plugin-settings-list] .lsb-empty{margin:0;padding:10px;border-radius:10px;background:color-mix(in srgb,var(--panel,#fff) 42%,transparent)}
        .lsb-plugin-entry{display:flex;align-items:center;gap:6px;min-width:0;padding:4px;border:1px solid var(--line-soft,#e8e8e8);border-radius:12px;background:color-mix(in srgb,var(--panel,#fff) 42%,transparent)}
        .lsb-plugin-entry-main,.lsb-plugin-entry-settings,.lsb-plugin-settings-entry,[data-plugin-settings-directory],[data-plugin-settings-back]{min-height:38px;border:0;border-radius:9px;background:transparent;color:inherit;font:inherit;cursor:pointer}
        .lsb-plugin-entry-main{flex:1;min-width:0;padding:7px 10px;text-align:left}
        .lsb-plugin-entry-settings{flex:0 0 38px;padding:0;font-size:17px}
        .lsb-plugin-settings-entry{display:flex;align-items:center;justify-content:space-between;gap:10px;width:100%;padding:8px 10px;border:1px solid var(--line-soft,#e8e8e8);text-align:left}
        .lsb-plugin-settings-entry small{color:var(--text-muted,#888);font-size:11px}
        [data-plugin-settings-directory]{padding:7px 12px;border:1px solid var(--line,#ddd);background:color-mix(in srgb,var(--panel,#fff) 48%,transparent)}
        [data-plugin-settings-back]{margin:-4px 0 8px;padding:4px 9px;color:var(--text-muted,#888)}
        .lsb-plugin-entry button:hover,.lsb-plugin-settings-entry:hover,[data-plugin-settings-directory]:hover,[data-plugin-settings-back]:hover{background:var(--brand-soft,#e8f4f2);color:var(--brand,#5eaaa0)}
        [data-surface="plugin-features-sheet"] h3,[data-surface="plugin-settings-sheet"] h3{margin:10px 0 6px;font-size:13px}
        [data-surface="site-card"] [data-canvas-site-sidebar]{display:flex;flex-direction:column;gap:10px;margin-top:14px;max-height:none!important;overflow:visible!important;padding-right:2px}
        [data-surface="site-card"] [data-canvas-site-sidebar]:empty::before{content:'当前页面没有可用的站点侧栏信息';display:block;padding:12px;border-radius:12px;color:var(--text-muted,#888);background:color-mix(in srgb,var(--panel,#fff) 38%,transparent);font-size:12px}
        [data-surface="site-card"] [data-canvas-site-empty-state]{display:block;margin:14px 0 0;padding:12px;border-radius:12px;color:var(--text-muted,#888);background:color-mix(in srgb,var(--panel,#fff) 38%,transparent);font-size:12px}
        [data-surface="site-card"] [data-canvas-site-empty-state][hidden]{display:none!important}
        [data-surface="site-card"] [data-canvas-site-sidebar] > .sidebar-card{display:block!important;flex:0 0 auto!important;width:100%;height:auto!important;max-height:none!important;overflow:visible!important;margin:0;padding:12px;border:1px solid color-mix(in srgb,var(--line,#ddd) 62%,transparent);border-radius:14px;background:color-mix(in srgb,var(--panel,#fff) 42%,transparent);box-shadow:none}
        [data-surface="site-card"] [data-canvas-site-sidebar] .quick-links{max-height:none!important;overflow:visible!important}
        [data-surface="site-card"]{height:auto;max-height:calc(100vh - 32px)}
        [data-surface="site-card"][data-surface-mode="sheet"],[data-surface="site-card"][data-surface-mode="fullscreen"]{height:auto;max-height:calc(100vh - 82px)}
        [data-surface="appearance-sheet"] [data-canvas-appearance-controls]{display:grid;grid-template-columns:repeat(2,minmax(0,1fr));gap:10px;margin-top:14px}
        [data-surface="appearance-sheet"] [data-canvas-background-modes]{display:flex;align-items:center;gap:7px;flex-wrap:wrap;margin-top:14px}
        [data-surface="appearance-sheet"] [data-canvas-background-modes] strong{font-size:12px;color:var(--text-muted,#888);font-weight:600;margin-right:2px}
        [data-surface="appearance-sheet"] [data-canvas-background-modes] button{min-height:32px;padding:5px 10px;border:1px solid var(--line,#ddd);border-radius:999px;background:transparent;color:inherit;cursor:pointer;font:inherit;font-size:12px}
        [data-surface="appearance-sheet"] [data-canvas-background-modes] button[aria-pressed="true"]{border-color:var(--lsb-shell-accent,var(--brand,#5eaaa0));background:var(--brand-soft,#e8f4f2);color:var(--lsb-shell-accent,var(--brand,#5eaaa0));font-weight:600}
        [data-surface="appearance-sheet"] [data-canvas-appearance-controls] label{display:flex;flex-direction:column;gap:5px;font-size:12px;color:var(--text-muted,#888)}
        [data-surface="appearance-sheet"] [data-canvas-appearance-controls] input{width:100%;min-width:0;border:1px solid var(--line,#ddd);border-radius:9px;padding:6px;background:color-mix(in srgb,var(--panel,#fff) 70%,transparent);color:inherit;font:inherit}
        [data-surface="appearance-sheet"] [data-canvas-appearance-controls] input[type="range"]{padding:0}
        [data-surface="appearance-sheet"] [data-canvas-appearance-actions]{display:flex;gap:8px;flex-wrap:wrap;margin-top:14px}
        [data-surface="appearance-sheet"] [data-canvas-appearance-actions] button{border:1px solid var(--line,#ddd);border-radius:999px;padding:7px 11px;background:transparent;color:inherit;cursor:pointer}
        [data-surface="top-status"] button:focus-visible,[data-surface="tool-capsule"] button:focus-visible,[data-surface="tool-sheet"] button:focus-visible,[data-surface="navigation-sheet"] a:focus-visible{outline:2px solid var(--brand,#5eaaa0);outline-offset:2px}
        html.lsb-skin-shell-on.lsb-canvas-mode.lsb-skin-glass-on #lsb-shell-surfaces [data-surface]{background:var(--lsb-canvas-surface-bg)}
        html.lsb-skin-shell-on.lsb-canvas-mode.lsb-skin-glass-on #lsb-shell-surfaces [data-surface="site-status"]{background:transparent;border:0;border-radius:0;box-shadow:none;overflow:visible}
        @media(max-width:699px){
          html.lsb-skin-shell-on.lsb-canvas-mode main.wrap,html.lsb-skin-shell-on.lsb-canvas-mode .forum-main,html.lsb-skin-shell-on.lsb-canvas-mode .home-shell{padding-inline:14px!important}
          [data-surface="top-status"]{max-width:calc(100vw - 16px);top:calc(6px + var(--lsb-canvas-safe-top));height:var(--lsb-canvas-chrome-height);min-height:var(--lsb-canvas-chrome-height)}
          [data-surface="top-status"] [data-canvas-status-title]{max-width:42vw}
          html.lsb-canvas-page-user #lsb-shell-surfaces [data-surface="top-status"]{width:calc(100vw - 16px);gap:4px;padding:5px 6px}
          html.lsb-canvas-page-user #lsb-shell-surfaces [data-surface="top-status"] [data-canvas-status-title]{max-width:20vw}
          #lsb-shell-surfaces [data-surface="site-status"]{display:none!important}
          html.lsb-skin-shell-on.lsb-canvas-mode.lsb-canvas-page-user [data-lsb-canvas-profile]{position:sticky!important;top:calc(6px + var(--lsb-canvas-safe-top) + var(--lsb-canvas-chrome-height))!important;z-index:25!important}
          html.lsb-skin-shell-on.lsb-canvas-mode.lsb-canvas-page-user [data-lsb-canvas-list]{padding:8px!important}
          [data-surface="tool-sheet"],[data-surface="navigation-sheet"],[data-surface="site-card"],[data-surface="appearance-sheet"],[data-surface="ai-card"],[data-surface="plugin-features-sheet"],[data-surface="plugin-settings-sheet"]{left:8px;right:8px;bottom:calc(58px + var(--lsb-canvas-safe-bottom));transform:none;width:auto;max-height:calc(100vh - 82px);border-radius:22px}
          [data-surface="tool-capsule"]{bottom:calc(8px + var(--lsb-canvas-safe-bottom));max-width:calc(100vw - 16px)}
          [data-surface="site-card"][data-surface-mode="rail"]{top:calc(6px + var(--lsb-canvas-safe-top) + var(--lsb-canvas-chrome-height));right:8px;bottom:calc(58px + var(--lsb-canvas-safe-bottom));left:8px;width:auto;max-width:none;max-height:calc(100vh - 82px);border-radius:22px}
          [data-surface="appearance-sheet"] [data-canvas-appearance-controls]{grid-template-columns:1fr!important}
          [data-surface="appearance-sheet"] [data-canvas-appearance-actions]{flex-direction:column!important;align-items:stretch!important}
          [data-surface="appearance-sheet"] [data-canvas-appearance-actions] button{min-height:40px}
        }
        @media(prefers-reduced-transparency:reduce){
          #lsb-shell-surfaces [data-surface]{background:var(--lsb-shell-panel,var(--panel,#fff));backdrop-filter:none;-webkit-backdrop-filter:none;box-shadow:0 8px 24px rgb(0 0 0 / 12%)}
          [data-canvas-site-status-host]::before,[data-canvas-site-status-host][data-expanded="true"] [data-canvas-site-status-body]{background:var(--lsb-shell-panel,var(--panel,#fff));backdrop-filter:none;-webkit-backdrop-filter:none}
          html.lsb-skin-shell-on.lsb-canvas-mode{--lsb-glass-fill:var(--lsb-shell-panel,var(--panel,#fff));--lsb-canvas-media-scrim:rgb(8 12 22 / 26%)}
        }
        @media(prefers-reduced-motion:reduce){
          #lsb-shell-surfaces [data-surface],#lsb-shell-progress,html.lsb-skin-shell-on.lsb-canvas-mode body::before{transition:none!important;scroll-behavior:auto!important}
          #lsb-shell-progress [data-lsb-shell-progress-bar]{transition:none!important}
          [data-route-transition="in"]{animation:none!important}
          [data-surface][data-canvas-surface-state="opening"],[data-surface][data-canvas-surface-state="closing"]{transform:none!important}
        }
        @media(prefers-reduced-motion:reduce){html.lsb-canvas-page-user [data-lsb-canvas-profile] > .sidebar-card.user-card{transition:none!important}}
        html.lsb-canvas-reduced-transparency #lsb-shell-surfaces [data-surface]{background:var(--lsb-shell-panel,var(--panel,#fff));backdrop-filter:none;-webkit-backdrop-filter:none;box-shadow:0 8px 24px rgb(0 0 0 / 12%)}
        html.lsb-canvas-reduced-transparency [data-canvas-site-status-host]::before,html.lsb-canvas-reduced-transparency [data-canvas-site-status-host][data-expanded="true"] [data-canvas-site-status-body]{background:var(--lsb-shell-panel,var(--panel,#fff));backdrop-filter:none;-webkit-backdrop-filter:none}
        html.lsb-canvas-reduced-motion #lsb-shell-surfaces [data-surface],html.lsb-canvas-reduced-motion #lsb-shell-progress{transition:none!important;scroll-behavior:auto!important}
        html.lsb-canvas-reduced-motion #lsb-shell-progress [data-lsb-shell-progress-bar]{transition:none!important}
        html.lsb-canvas-reduced-motion [data-route-transition="in"]{animation:none!important}
        html.lsb-canvas-reduced-motion [data-surface][data-canvas-surface-state="opening"],html.lsb-canvas-reduced-motion [data-surface][data-canvas-surface-state="closing"]{transform:none!important}
      `;
}
