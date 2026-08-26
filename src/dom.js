import { throttle } from './util.js'

/**
 * DOM 观察器：站点是服务端渲染 + 局部 AJAX（回复、打赏流、抽屉）。
 * 插件不该各自 new MutationObserver，统一在这里收敛成事件：
 *   dom:posts-added   新楼层出现（AJAX 回复后）
 *   dom:list-added    列表新增条目
 *   dom:changed       其它变更（节流后）
 * 同时提供 onEach：对现有和未来出现的元素都执行一次回调（幂等，靠 WeakSet 去重）。
 */
export class DomWatcher {
  constructor(bus) {
    this.bus = bus
    this._observer = null
    this._rules = [] // { selector, fn, seen:WeakSet }
    this._scanCount = 0
    this._notify = throttle(() => this.bus.emit('dom:changed', null, { source: 'core' }), 120)
  }

  get scanCount() {
    return this._scanCount
  }

  start(root = document.body) {
    if (this._observer || !root) return
    this._observer = new MutationObserver((records) => this._onMutations(records))
    this._observer.observe(root, { childList: true, subtree: true })
    this._scan(root)
  }

  stop() {
    this._observer?.disconnect()
    this._observer = null
  }

  _onMutations(records) {
    // Set 去重：站点一次性插入大批楼层时，父节点的 querySelectorAll 会把
    // 同一元素再收一遍（它自身也在 addedNodes 里）。旧实现直接 push 到数组，
    // 下游解析层会对同一楼层重复计数。
    const posts = new Set()
    const items = new Set()
    const added = []
    for (const rec of records) {
      for (const node of rec.addedNodes) {
        if (node.nodeType !== 1) continue
        if (node.matches?.('li.post-entry')) posts.add(node)
        else if (node.matches?.('li.post-item')) items.add(node)
        for (const el of node.querySelectorAll?.('li.post-entry') || []) posts.add(el)
        for (const el of node.querySelectorAll?.('li.post-item:not(.post-entry)') || []) items.add(el)
        added.push(node)
      }
    }
    this._scanBatch(added)
    if (posts.size) this.bus.emit('dom:posts-added', [...posts], { raw: true, source: 'core' })
    if (items.size) this.bus.emit('dom:list-added', [...items], { raw: true, source: 'core' })
    if (records.length) this._notify()
  }

  /** 同批兄弟节点只扫父节点一次，避免无限滚动 20 条各扫一遍全部 onEach */
  _scanBatch(nodes) {
    if (!nodes.length) return
    const byParent = new Map()
    const orphans = []
    for (const node of nodes) {
      const parent = node.parentNode
      if (parent && parent.nodeType === 1) {
        let bucket = byParent.get(parent)
        if (!bucket) {
          bucket = []
          byParent.set(parent, bucket)
        }
        bucket.push(node)
      } else {
        orphans.push(node)
      }
    }
    for (const [parent, kids] of byParent) {
      if (kids.length > 1) this._scan(parent)
      else this._scan(kids[0])
    }
    for (const node of orphans) this._scan(node)
  }

  /**
   * 对匹配 selector 的元素执行 fn，包含未来新增的。
   * fn 只会对同一元素执行一次。
   */
  onEach(selector, fn, { owner = 'anonymous' } = {}) {
    const rule = { selector, fn, owner, seen: new WeakSet() }
    this._rules.push(rule)
    this._applyRule(rule, document)
    return () => {
      this._rules = this._rules.filter((r) => r !== rule)
    }
  }

  offOwner(owner) {
    this._rules = this._rules.filter((r) => r.owner !== owner)
  }

  _scan(root) {
    this._scanCount++
    for (const rule of this._rules) this._applyRule(rule, root)
  }

  _applyRule(rule, root) {
    const nodes = []
    if (root.nodeType === 1 && root.matches?.(rule.selector)) nodes.push(root)
    if (root.querySelectorAll) nodes.push(...root.querySelectorAll(rule.selector))
    for (const el of nodes) {
      if (rule.seen.has(el)) continue
      rule.seen.add(el)
      try {
        rule.fn(el)
      } catch (e) {
        console.error(`[LSB dom] ${rule.owner} onEach(${rule.selector})`, e)
      }
    }
  }
}
