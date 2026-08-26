/**
 * 氢壳首屏占位：基座 @run-at document-start 时立刻藏原顶栏/侧栏、留出
 * 与壳相同的 padding，并画出顶栏/左栏/右栏色块。
 * 避免整页进帖时正文先出来、铬要等皮肤 setup（还要扫楼）才出现。
 *
 * 尺寸须与 plugins/skin.user.js 的 --lsb-shell-header/rail/aside 保持一致。
 * 色块 z-index 低于 #lsb-shell（7999+），真壳盖上来时直接叠住。
 */
import { rawGet } from './store.js'

export const SHELL_BOOT_STYLE_ID = 'lsb-shell-boot-style'
export const SHELL_BOOT_CLASS = 'lsb-shell-boot'
export const SHELL_BOOT_FRAME_ID = 'lsb-shell-boot-frame'

const BOOT_CSS = `
html.lsb-shell-boot{
  --lsb-shell-header:48px;
  --lsb-shell-rail:240px;
  --lsb-shell-aside:280px;
  background:var(--bg,#f4f5f7);
}
#lsb-shell-boot-frame{pointer-events:none}
#lsb-shell-boot-frame > [data-boot]{display:none;position:fixed}
#lsb-shell-boot-frame > [data-boot="header"]{
  top:0;left:0;right:0;height:48px;z-index:7990;
  background:color-mix(in srgb,var(--panel,#fff) 78%,transparent);
  box-shadow:0 1px 0 color-mix(in srgb,var(--line,#ddd) 55%,transparent);
}
#lsb-shell-boot-frame > [data-boot="rail"]{
  top:0;left:0;bottom:0;width:240px;z-index:7989;
  background:var(--bg,#f4f5f7);
  border-right:1px solid var(--line-soft,#e8e8e8);
}
#lsb-shell-boot-frame > [data-boot="aside"]{
  top:48px;right:0;bottom:0;width:280px;z-index:7989;
  background:var(--bg,#f4f5f7);
  border-left:1px solid var(--line-soft,#e8e8e8);
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
  html.lsb-shell-boot #lsb-shell-boot-frame > [data-boot="header"],
  html.lsb-shell-boot #lsb-shell-boot-frame > [data-boot="rail"]{display:block}
}
@media (min-width:1100px){
  html.lsb-shell-boot{padding-right:280px}
  html.lsb-shell-boot #lsb-shell-boot-frame > [data-boot="aside"]{display:block}
}
`

function shouldShellBoot() {
  if (rawGet('lsb_base:__core:disabled:skin') === true) return false
  const cfg = rawGet('lsb_base:skin:__config')
  if (cfg && cfg.shell === false) return false
  return true
}

function ensureBootFrame(doc) {
  const root = doc.documentElement
  if (!root || doc.getElementById(SHELL_BOOT_FRAME_ID)) return
  const frame = doc.createElement('div')
  frame.id = SHELL_BOOT_FRAME_ID
  frame.setAttribute('aria-hidden', 'true')
  frame.innerHTML =
    '<div data-boot="header"></div><div data-boot="rail"></div><div data-boot="aside"></div>'
  root.appendChild(frame)
}

export function clearShellBoot(doc = document) {
  doc.getElementById(SHELL_BOOT_STYLE_ID)?.remove()
  doc.getElementById(SHELL_BOOT_FRAME_ID)?.remove()
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
  if (!doc.getElementById(SHELL_BOOT_STYLE_ID)) {
    const el = doc.createElement('style')
    el.id = SHELL_BOOT_STYLE_ID
    el.textContent = BOOT_CSS
    const parent = doc.head || root
    parent.insertBefore(el, parent.firstChild)
  }
  ensureBootFrame(doc)
}

/** 皮肤关壳 / 停用时同步撤占位，不依赖皮肤 teardown 是否已升级。 */
export function watchShellBoot(bus) {
  if (!bus?.on) return
  const sync = () => applyShellBoot()
  bus.on('config:changed:skin', sync, { owner: '__shell-boot' })
  bus.on('plugin:disabled', sync, { owner: '__shell-boot' })
  bus.on('plugin:activated', sync, { owner: '__shell-boot' })
}
