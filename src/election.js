/**
 * 选主服务：跨标签心跳选主（单例 leader）
 * 抽离自 unread-sentinel / forum-watch / live-feed 三处重复实现
 *
 * ── 协议 ──
 * 心跳载荷带 { id, role }，两条规则保证收敛：
 *   1. 让位有依据：只有「对方也自称 leader」才存在冲突，且固定由 id 较大者让位。
 *      早期实现是「收到任何心跳就让位」——两个标签互发心跳会双双退位，
 *      而退位后心跳仍在持续刷新「最近心跳时间」，于是「长时间无心跳才补位」
 *      的条件永远不成立 → 活锁：谁都不是 leader，巡检模块全部停摆。
 *   2. 补位看的是「有没有 leader 的心跳」而非「有没有任何心跳」。
 *      即使全场都是 follower 也能自愈。
 *
 * 另外用即时宣告压缩收敛时间：上位/让位/收到新标签的 pending 心跳时立刻广播一次，
 * 不必等下一个心跳周期（默认 10s）。
 */

const BEAT_MS = 10000
const LEADER_TIMEOUT_MS = 30000
const ANNOUNCE_THROTTLE_MS = 50

export class Election {
  constructor(
    tabs,
    {
      onPromote,
      onDemote,
      jitter = 800,
      id = null,
      beatMs = BEAT_MS,
      leaderTimeoutMs = LEADER_TIMEOUT_MS,
    } = {},
  ) {
    this.tabs = tabs
    this.onPromote = onPromote
    this.onDemote = onDemote
    this.jitter = Math.max(0, Number(jitter) || 0)
    this.beatMs = Math.max(200, Number(beatMs) || BEAT_MS)
    // 至少留两个心跳周期，否则正常抖动就会被误判为「leader 已死」
    this.leaderTimeoutMs = Math.max(this.beatMs * 2, Number(leaderTimeoutMs) || LEADER_TIMEOUT_MS)
    /** 本标签身份：仲裁靠它比较大小，必须全局唯一且稳定 */
    this.id = id || `${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 10)}`
    this.role = 'pending' // pending | leader | follower
    this.lastBeat = Date.now() // 最近一次收到任意心跳（保留旧字段语义）
    this.lastLeaderBeat = 0 // 最近一次收到 leader 心跳；0 = 从未见过 → 可竞选
    this.leaderId = null
    this._beatTimer = null
    this._promoteTimer = null
    this._offBeat = null
    this._lastAnnounce = 0
  }

  start() {
    this._offBeat = this.tabs.on('beat', (msg) => this._onBeat(msg))
    this._beatTimer = setInterval(() => {
      this._announce()
      this._maybeElect()
    }, this.beatMs)
    this._beatTimer?.unref?.()

    // 立刻自报家门（role=pending）：已有 leader 会即时回应，新标签因此不必
    // 白等一个心跳周期，也就避免了「明明有主却先上位再让位」的抖动。
    this._announce()
    this._scheduleElection()
  }

  /** id 较大者让位——确定性且无环，双方独立计算得到同一结论 */
  _yieldsTo(otherId) {
    return String(this.id) > String(otherId)
  }

  _onBeat(msg) {
    const from = msg && msg.id
    if (!from || from === this.id) return
    this.lastBeat = Date.now()

    if (msg.role === 'leader') {
      this.lastLeaderBeat = Date.now()
      if (this.role === 'leader') {
        // 双主：按 id 仲裁，只有一方退。绝不双双退位。
        if (this._yieldsTo(from)) {
          this.leaderId = from
          this.demote()
        } else {
          this._forceAnnounce() // 我留任，再宣告一次促使对方尽快退位
        }
      } else {
        this.leaderId = from
        this._cancelElection() // 有主在任，取消自己的竞选计划
        // pending → follower：让「有主可依」成为明确状态。
        // 停在 pending 会有两处麻烦：面板显示「待定」而非「由其它标签巡检」；
        // 且模块里 `role === 'follower'` 的门禁对 pending 不生效。
        if (this.role === 'pending') this.demote()
      }
      return
    }

    // 对方还没上位（pending/follower）：若我在任就立即宣告，让它马上知道有主
    if (this.role === 'leader') this._forceAnnounce()
  }

  _announce() {
    const now = Date.now()
    if (now - this._lastAnnounce < ANNOUNCE_THROTTLE_MS) return
    this._lastAnnounce = now
    this.tabs.post('beat', { id: this.id, role: this.role })
  }

  /** 状态刚变化时必须让对端知道，跳过节流 */
  _forceAnnounce() {
    this._lastAnnounce = 0
    this._announce()
  }

  _maybeElect() {
    if (this.role === 'leader') return
    if (Date.now() - this.lastLeaderBeat <= this.leaderTimeoutMs) return
    this._scheduleElection()
  }

  /** 抖动后竞选；抖动让并发上位的概率变低，真撞上了由 id 仲裁兜底 */
  _scheduleElection() {
    if (this._promoteTimer) return
    this._promoteTimer = setTimeout(
      () => {
        this._promoteTimer = null
        if (this.role === 'leader') return
        // 抖动期间若已有 leader 现身，放弃竞选
        if (Date.now() - this.lastLeaderBeat <= this.leaderTimeoutMs) return
        this.promote()
      },
      this.jitter ? Math.random() * this.jitter : 0,
    )
    this._promoteTimer?.unref?.()
  }

  _cancelElection() {
    if (!this._promoteTimer) return
    clearTimeout(this._promoteTimer)
    this._promoteTimer = null
  }

  promote() {
    if (this.role === 'leader') return
    this.role = 'leader'
    this.leaderId = this.id
    this._forceAnnounce() // 上位即宣告，冲突在毫秒级暴露而非等一个心跳周期
    try {
      this.onPromote?.()
    } catch (e) {
      console.error('[LSB election] onPromote', e)
    }
  }

  demote() {
    if (this.role === 'follower') return
    this.role = 'follower'
    this._forceAnnounce() // 让位也要广播，免得其他标签把空缺误判成「无主」
    try {
      this.onDemote?.()
    } catch (e) {
      console.error('[LSB election] onDemote', e)
    }
  }

  stop() {
    clearInterval(this._beatTimer)
    this._beatTimer = null
    this._cancelElection()
    this._offBeat?.()
    this._offBeat = null
  }

  get isLeader() {
    return this.role === 'leader'
  }

  /** 调试快照 */
  state() {
    return {
      id: this.id,
      role: this.role,
      leaderId: this.leaderId,
      sinceLeaderBeat: this.lastLeaderBeat ? Date.now() - this.lastLeaderBeat : null,
      beatMs: this.beatMs,
      leaderTimeoutMs: this.leaderTimeoutMs,
    }
  }
}
