export function abortError() {
  return Object.assign(new Error('请求已停止'), { name: 'AbortError' })
}

export function throwIfAborted(signal) {
  if (signal?.aborted) throw abortError()
}

export function withAbort(value, signal) {
  if (!signal) return Promise.resolve(value)
  return new Promise((resolve, reject) => {
    const stop = () => { signal.removeEventListener('abort', stop); reject(abortError()) }
    signal.addEventListener('abort', stop, { once: true })
    Promise.resolve(value).then(resolve, reject).finally(() => signal.removeEventListener('abort', stop))
    if (signal.aborted) stop()
  })
}

export function abortableDelay(ms, signal) {
  throwIfAborted(signal)
  return new Promise((resolve, reject) => {
    const done = () => { signal?.removeEventListener('abort', stop); resolve() }
    const timer = setTimeout(done, ms)
    const stop = () => { clearTimeout(timer); signal.removeEventListener('abort', stop); reject(abortError()) }
    signal?.addEventListener('abort', stop, { once: true })
  })
}
