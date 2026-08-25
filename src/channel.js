/**
 * 跨标签页通道：同一浏览器多个 linux.sb 标签之间通信。
 * 优先 BroadcastChannel；不可用时退回 GM_addValueChangeListener（Tampermonkey 跨标签同步）。
 */
export class Channel {
  constructor(bus, { name = 'lsb-base', store = null } = {}) {
    this.bus = bus
    this.name = name
    this.store = store
    this.id = Math.random().toString(36).slice(2, 10)
    this._bc = null
    this._unsub = null
    this._seq = 0
    this._start()
  }

  _start() {
    if (typeof BroadcastChannel === 'function') {
      this._bc = new BroadcastChannel(this.name)
      this._bc.onmessage = (ev) => this._dispatch(ev.data)
      return
    }
    if (typeof GM_addValueChangeListener === 'function' && this.store) {
      const key = '__channel'
      const listenKey = `lsb_base:__core:${key}`
      const id = GM_addValueChangeListener(listenKey, (_k, _old, val, remote) => {
        if (remote) this._dispatch(val)
      })
      this._unsub = () => {
        if (typeof GM_removeValueChangeListener === 'function') GM_removeValueChangeListener(id)
      }
      this._fallbackKey = key
    }
  }

  _dispatch(msg) {
    if (!msg || msg.from === this.id || !msg.plugin) return
    this.bus.emit(`tab:${msg.plugin}:${msg.event}`, msg.payload, { source: `tab:${msg.from}` })
  }

  post({ plugin, event, payload }) {
    // seq 让每条消息都与上一条不同：GM fallback 走「写同一个 key 触发变更」，
    // 若两条消息内容完全相同，监听端可能因值未变而收不到第二次通知。
    const msg = { plugin, event, payload, from: this.id, ts: Date.now(), seq: ++this._seq }
    if (this._bc) return this._bc.postMessage(msg)
    if (this._fallbackKey && this.store) this.store.set(this._fallbackKey, msg)
  }

  close() {
    this._bc?.close()
    this._unsub?.()
  }
}
