import { Core, VERSION, PERMISSIONS } from './core.js'
import { applyShellBoot, watchShellBoot } from './shell-boot.js'

function inIframe() {
  try {
    return window.self !== window.top
  } catch {
    return true
  }
}

if (!inIframe()) applyShellBoot()

/**
 * 入口：把基座挂到「页面 window」（unsafeWindow），这样其它独立油猴脚本
 * 才能看到同一个实例。沙箱 window 是每脚本一份，不能用来做跨脚本通信。
 */
const W = typeof unsafeWindow !== 'undefined' ? unsafeWindow : window

function install() {
  if (W.LSB && W.LSB.__core) return W.LSB

  const core = new Core()
  watchShellBoot(core.bus)

  /** 对外 API：插件只碰这一层 */
  const LSB = {
    __core: core,
    version: VERSION,
    PERMISSIONS,
    /**
     * 注册插件。
     * @param {object} manifest { id, name, version, description, author,
     *   requires:{ base, plugins }, permissions:[], pages:[], config:{} }
     * @param {(api)=>any} setup
     */
    register(manifest, setup) {
      return core.register(manifest, setup)
    },
    /** 基座是否就绪（插件通常不需要关心，register 会自动排队） */
    get ready() {
      return core.ready
    },
    info: () => core.info(),
    logs: () => core.logs(),
    /** 持久化错误日志（最近 200 条，跨页面留存） */
    errors: () => core.errors(),
    clearErrors: () => core.clearErrors(),
    open: (tab) => core.ui.openPanel(tab),
    enable: (id) => core.enable(id),
    disable: (id) => core.disable(id),
    /** 调试用：直接访问事件总线 */
    bus: core.bus,
  }

  // 消费在基座之前排队的插件（脚本执行顺序不可控）
  const queue = Array.isArray(W.LSB_PLUGINS) ? W.LSB_PLUGINS.slice() : []
  W.LSB = LSB
  // 之后再 push 的也立即注册
  W.LSB_PLUGINS = {
    push(...items) {
      for (const it of items) applyQueued(LSB, it)
      return 0
    },
    length: 0,
  }

  const start = () => {
    core.boot()
    for (const it of queue) applyQueued(LSB, it)
    W.dispatchEvent(new W.CustomEvent('lsb:ready', { detail: { version: VERSION } }))
  }

  if (document.body) start()
  else document.addEventListener('DOMContentLoaded', start, { once: true })

  return LSB
}

function applyQueued(LSB, item) {
  try {
    if (typeof item === 'function') item(LSB)
    else if (item && item.manifest && item.setup) LSB.register(item.manifest, item.setup)
  } catch (e) {
    console.error('[LSB] 排队插件注册失败', e)
  }
}

export default inIframe() ? null : install()
