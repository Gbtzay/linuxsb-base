/**
 * 氢壳正文窗口的滚动桥。
 *
 * 页面内已有插件仍可能读取 window.scrollY、调用 window.scrollTo 或监听
 * window 的 scroll 事件。正文被迁移到独立滚动根后，在壳启用期间把这些
 * 访问转发到 root；dispose 会恢复原始属性和方法。
 */

function finite(value, fallback = 0) {
  const n = Number(value)
  return Number.isFinite(n) ? n : fallback
}

function readAxis(root, axis) {
  if (!root) return 0
  return finite(root[axis], 0)
}

function writeAxis(root, axis, value) {
  if (!root) return
  try { root[axis] = Math.max(0, finite(value, 0)) } catch { /* read-only test double */ }
}

function dispatchScroll(windowRef) {
  try {
    const event = typeof windowRef.Event === 'function'
      ? new windowRef.Event('scroll', { bubbles: false, cancelable: false })
      : { type: 'scroll' }
    windowRef.dispatchEvent?.(event)
  } catch {
    /* 事件通知失败不应阻塞滚动本身。 */
  }
}

export function readShellScroll(root) {
  return {
    x: readAxis(root, 'scrollLeft'),
    y: readAxis(root, 'scrollTop'),
  }
}

export function writeShellScroll(root, x = 0, y = 0) {
  writeAxis(root, 'scrollLeft', x)
  writeAxis(root, 'scrollTop', y)
  return readShellScroll(root)
}

/**
 * 安装桥接并返回可重复调用的 disposer。
 * options.windowRef/root 必须显式传入，方便 JSDOM 和多窗口环境测试。
 */
export function installShellScrollBridge(options = {}) {
  const windowRef = options.win || options.windowRef || globalThis.window
  const root = options.root
  const shouldDispatch = options.dispatch !== false
  if (!windowRef || !root) {
    return {
      root: root || null,
      read: () => readShellScroll(root),
      scrollTo: (x, y) => writeShellScroll(root, x, y),
      dispose: () => {},
      restore: () => {},
      getRoot: () => root || null,
      getTop: () => readAxis(root, 'scrollTop'),
      patched: false,
    }
  }

  const initialPosition = {
    x: finite(windowRef.scrollX ?? windowRef.pageXOffset, 0),
    y: finite(windowRef.scrollY ?? windowRef.pageYOffset, 0),
  }
  let carriedInitialPosition = false
  if (readAxis(root, 'scrollLeft') === 0 && initialPosition.x > 0) {
    writeAxis(root, 'scrollLeft', initialPosition.x)
    carriedInitialPosition = true
  }
  if (readAxis(root, 'scrollTop') === 0 && initialPosition.y > 0) {
    writeAxis(root, 'scrollTop', initialPosition.y)
    carriedInitialPosition = true
  }

  const originalScrollTo = windowRef.scrollTo
  const originalScrollBy = windowRef.scrollBy
  const originalX = Object.getOwnPropertyDescriptor(windowRef, 'scrollX')
  const originalY = Object.getOwnPropertyDescriptor(windowRef, 'scrollY')
  let disposed = false

  const defineAxis = (name, axis) => {
    try {
      Object.defineProperty(windowRef, name, {
        configurable: true,
        enumerable: originalX?.enumerable ?? true,
        get: () => readAxis(root, axis),
      })
      return true
    } catch {
      return false
    }
  }
  const ownX = defineAxis('scrollX', 'scrollLeft')
  const ownY = (() => {
    try {
      Object.defineProperty(windowRef, 'scrollY', {
        configurable: true,
        enumerable: originalY?.enumerable ?? true,
        get: () => readAxis(root, 'scrollTop'),
      })
      return true
    } catch {
      return false
    }
  })()

  const onRootScroll = () => {
    if (!disposed && shouldDispatch) dispatchScroll(windowRef)
  }
  root.addEventListener?.('scroll', onRootScroll)

  const scrollTo = (xOrOptions = 0, y = 0) => {
    if (disposed) return readShellScroll(root)
    if (xOrOptions && typeof xOrOptions === 'object') {
      writeShellScroll(root, xOrOptions.left ?? xOrOptions.x ?? 0, xOrOptions.top ?? xOrOptions.y ?? 0)
    } else {
      writeShellScroll(root, xOrOptions, y)
    }
    if (shouldDispatch) dispatchScroll(windowRef)
    return readShellScroll(root)
  }
  const scrollBy = (xOrOptions = 0, y = 0) => {
    const current = readShellScroll(root)
    if (xOrOptions && typeof xOrOptions === 'object') {
      return scrollTo(current.x + finite(xOrOptions.left ?? xOrOptions.x, 0), current.y + finite(xOrOptions.top ?? xOrOptions.y, 0))
    }
    return scrollTo(current.x + finite(xOrOptions, 0), current.y + finite(y, 0))
  }
  try { windowRef.scrollTo = scrollTo } catch { /* read-only host */ }
  try { windowRef.scrollBy = scrollBy } catch { /* read-only host */ }
  if (carriedInitialPosition && shouldDispatch) dispatchScroll(windowRef)

  return {
    root,
    read: () => readShellScroll(root),
    getRoot: () => root,
    getTop: () => readAxis(root, 'scrollTop'),
    scrollTo,
    scrollBy,
    patched: ownX || ownY,
    dispose() {
      if (disposed) return
      disposed = true
      root.removeEventListener?.('scroll', onRootScroll)
      try {
        if (windowRef.scrollTo === scrollTo) windowRef.scrollTo = originalScrollTo
      } catch { /* ignore */ }
      try {
        if (windowRef.scrollBy === scrollBy) windowRef.scrollBy = originalScrollBy
      } catch { /* ignore */ }
      try {
        if (ownX) {
          if (originalX) Object.defineProperty(windowRef, 'scrollX', originalX)
          else delete windowRef.scrollX
        }
      } catch { /* ignore */ }
      try {
        if (ownY) {
          if (originalY) Object.defineProperty(windowRef, 'scrollY', originalY)
          else delete windowRef.scrollY
        }
      } catch { /* ignore */ }
    },
    restore() {
      this.dispose()
    },
  }
}

