// @skin-part: D3 nativeHeaders/Sidebars: 原生头部/侧栏收敛
// · D3 nativeHeaders/Sidebars: 原生头部/侧栏收敛 ──
    function nativeHeaders() {
      const headers = new Set(document.querySelectorAll('body > .top, body > header, body > .site-header, body > [data-site-header]'))
      for (const menu of document.querySelectorAll('[data-slot~="top.menu_links"]')) {
        if (menu.closest('#mobile-menu, #mobile-menu-drawer, .mobile-menu-drawer')) continue
        let header = menu
        while (header.parentElement && header.parentElement !== document.body) header = header.parentElement
        if (header.parentElement === document.body) headers.add(header)
      }
      return [...headers]
    }

    function nativeSidebars() {
      return [...new Set(document.querySelectorAll('aside.sidebar, [data-slot~="sidebar.stack"]'))].filter(
        (el) => el.id !== 'mobile-menu-drawer' && !el.classList.contains('mobile-menu-drawer'),
      )
    }

    function nativeLeftRails(scope = document) {
      return [...(scope?.querySelectorAll?.('.forum-enhancements-left-fixed') || [])]
    }

    function markNative(on) {
      for (const el of nativeHeaders()) el.classList.toggle('lsb-native-header-hidden', on)
      for (const el of nativeSidebars()) el.classList.toggle('lsb-native-sidebar-hidden', on)
      for (const el of nativeLeftRails()) el.classList.toggle('lsb-native-left-hidden', on)
      for (const el of document.querySelectorAll('.sidebar-card.user-card')) el.toggleAttribute('data-lsb-shell-me', on)
    }
