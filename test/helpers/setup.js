import { JSDOM } from 'jsdom'

/** 共享的 jsdom + GM 轻量桩，降低各测试的手写重复。需要真实产物验证的测试仍自建 dom。 */

export function makeDom(html, url = 'https://linux.sb/topic/1', preload = {}) {
  const dom = new JSDOM(html, { url, runScripts: 'outside-only' })
  const w = dom.window
  w.unsafeWindow = w
  w.requestAnimationFrame = (fn) => w.setTimeout(() => fn(Date.now()), 0)
  w.cancelAnimationFrame = (timer) => w.clearTimeout(timer)
  w.scrollTo = () => {}
  w.localStorage.setItem('lsb_base:__core:rate', JSON.stringify(10))
  w.localStorage.setItem('lsb_base:__core:urlPoll', JSON.stringify(0))
  for (const [k, v] of Object.entries(preload)) w.localStorage.setItem(k, JSON.stringify(v))
  return { dom, w }
}

export function tick(ms = 0) { return new Promise((r) => setTimeout(r, ms)) }

export async function until(fn, ms = 2000, step = 20) {
  const end = Date.now() + ms
  for (;;) {
    let ok = false
    try { ok = fn() } catch { /* polling */ }
    if (ok) return true
    if (Date.now() > end) return false
    await tick(step)
  }
}
