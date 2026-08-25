/**
 * 氢壳首屏占位：基座 @run-at document-start 时立刻藏原顶栏/侧栏并留出
 * 与壳相同的 padding，避免先画出原版再被壳盖住造成回流卡顿。
 *
 * 尺寸须与 plugins/skin.user.js 的 --lsb-shell-header/rail/aside 保持一致。
 */
import { rawGet } from './store.js'

export const SHELL_BOOT_STYLE_ID = 'lsb-shell-boot-style'
export const SHELL_BOOT_CLASS = 'lsb-shell-boot'

const BOOT_CSS = `
html.lsb-shell-boot{
  --lsb-shell-header:48px;
  --lsb-shell-rail:240px;
  --lsb-shell-aside:280px;
}
@media (min-width:900px){
  html.lsb-shell-boot{padding-top:48px;padding-left:240px}
  html.lsb-shell-boot > body > .top,
  html.lsb-shell-boot .forum-more-region{display:none!important}
  html.lsb-shell-boot aside.sidebar:not(#mobile-menu-drawer):not(.mobile-menu-drawer){display:none!important}
  html.lsb-shell-boot .forum-layout.forum-layout-has-sidebar{
    display:block!important;grid-template-columns:1fr!important;
  }
  html.lsb-shell-boot main.wrap{
    max-width:none!important;margin-left:0!important;margin-right:0!important;width:auto!important;
  }
  html.lsb-shell-boot .lsb-launcher{display:none!important}
}
@media (min-width:1100px){
  html.lsb-shell-boot{padding-right:280px}
}
`

function shouldShellBoot() {
  if (rawGet('lsb_base:__core:disabled:skin') === true) return false
  const cfg = rawGet('lsb_base:skin:__config')
  if (cfg && cfg.shell === false) return false
  return true
}

export function clearShellBoot(doc = document) {
  doc.getElementById(SHELL_BOOT_STYLE_ID)?.remove()
  doc.documentElement?.classList.remove(SHELL_BOOT_CLASS)
}

/** 按当前存储决定注入或撤掉。幂等，可在 document-start（尚无 body）调用。 */
export function applyShellBoot(doc = document) {
  const root = doc.documentElement
  if (!root) return
  if (!shouldShellBoot()) {
    clearShellBoot(doc)
    return
  }
  root.classList.add(SHELL_BOOT_CLASS)
  if (doc.getElementById(SHELL_BOOT_STYLE_ID)) return
  const el = doc.createElement('style')
  el.id = SHELL_BOOT_STYLE_ID
  el.textContent = BOOT_CSS
  const parent = doc.head || root
  parent.insertBefore(el, parent.firstChild)
}

/** 皮肤关壳 / 停用时同步撤占位，不依赖皮肤 teardown 是否已升级。 */
export function watchShellBoot(bus) {
  if (!bus?.on) return
  const sync = () => applyShellBoot()
  bus.on('config:changed:skin', sync, { owner: '__shell-boot' })
  bus.on('plugin:disabled', sync, { owner: '__shell-boot' })
  bus.on('plugin:activated', sync, { owner: '__shell-boot' })
}
