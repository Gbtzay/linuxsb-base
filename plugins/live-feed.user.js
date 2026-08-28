// ==UserScript==
// @name         LSB·实时流
// @namespace    https://linux.sb/
// @version      1.2.12
// @description  免刷新获取新帖与新回复：前台短周期、后台长周期的自适应轮询（跨标签选主，只有一个标签发请求）；视口锚点补偿让任意滚动位置都能无感插入；打字期间只暂存不打扰；老帖有新回复原地高亮。需要 LINUX.SB 基座。
// @author       you
// @match        https://linux.sb/*
// @grant        none
// @run-at       document-end
// @noframes
// ==/UserScript==

(function () {
  'use strict'

  const manifest = {
    id: 'live-feed',
    name: '实时流',
    version: '1.2.12',
    description: '新帖/新回复免刷新送达：视口锚点无感插入 + 打字免打扰 + 新动态高亮',
    author: 'you',
    requires: { base: '^0.1.0' },
    permissions: ['read', 'storage', 'ui', 'events'],
    config: {
      pollSec: { type: 'number', label: '前台轮询间隔 (秒)', default: 30 },
      bgSec: { type: 'number', label: '后台标签轮询间隔 (秒)', default: 150 },
      toastOnNew: { type: 'switch', label: '发现新内容时弹提示', default: true },
      notifyDesktop: { type: 'switch', label: '桌面通知', default: false },
      autoInsert: { type: 'switch', label: '自动插入（时机合适时免点击）', default: true },
      anchorScroll: {
        type: 'switch',
        label: '视口锚点补偿（插入时画面不跳动）',
        default: true,
        desc: '关闭后仅在页面顶部自动插入，其余情况出横幅',
      },
      pauseWhileTyping: {
        type: 'switch',
        label: '写回复期间不自动插入',
        default: true,
        desc: '仍会照常检查并出横幅，写完自动补上',
      },
      highlightBumped: { type: 'switch', label: '老帖有新回复时原地高亮', default: true },
      trackTopicReplies: { type: 'switch', label: '跟踪当前帖新回复', default: true },
      maxInsert: { type: 'number', label: '单次最多加载数', default: 30 },
      jitterMs: { type: 'number', label: '选主随机延迟 (ms)', default: 800 },
    },
  }

  /** 锚点补偿的持续帧数：图片/字体late load 会继续改变高度，单帧校正不够 */
  const ANCHOR_FRAMES = 8
  /** 补偿期间用户自己滚动的容差（px）：超出即让位，绝不与用户抢滚动条 */
  const USER_SCROLL_TOLERANCE = 24
  /** 帖子页「回复顶到新页」时本轮最多追补几页 */
  const MAX_PAGE_CATCHUP = 3

  function setup(api) {
    let cfg = api.config()
    api.on('config:changed:live-feed', () => {
      cfg = api.config()
      if (shouldPoll()) scheduleNext()
    })

    /* ── 消息侧：复用未读哨兵的消息箱做「新消息」计数（哨兵缺席则静默降级） ── */
    let msgBase = null // 激活时的消息箱长度基线
    async function msgDelta() {
      try {
        const d = await api.request('unread-sentinel:debug')
        const n = d.inbox().length
        if (msgBase == null) msgBase = n
        return Math.max(0, n - msgBase)
      } catch {
        return 0
      }
    }

    /* ── 页面模式与基线 ── */
    let mode = null // 'list' | 'topic'
    let ctx = {} // list: {ul, seen:Map<id,fp>, maxId, maxTs, sort}  topic: {tid, ul, maxPostId, pages}
    let pending = [] // 待展示的新条目（保留来源文档节点，插入时 importNode）
    let banner = null
    let bannerAction = null
    let navGen = 0

    /**
     * 列表条目的「新鲜度指纹」：回复数 + 最后活跃时间。
     * 用它替代单纯的「见过/没见过」，才能区分三种状态：
     *   没见过 → 新帖（插入）
     *   见过且指纹不变 → 无动静（什么都不做）
     *   见过但指纹变了 → 老帖有新回复（原地高亮，不重复插入）
     * 指纹取自 parse.listItem 的结构化字段，不靠猜图标（逛吧靠匹配 SVG path 的 d
     * 属性来分辨「这个数字是回复数还是浏览数」，站点换图标即失效）。
     */
    function freshnessOf(it) {
      return `${it.replies ?? ''}#${it.lastActiveTs ?? 0}`
    }

    function isListRow(li) {
      return li && !li.classList.contains('notification-item') && !li.classList.contains('post-entry')
    }

    function listSort() {
      if (api.page.type === 'user') return api.page.tab === 'replies' ? 'comment' : 'post'
      return api.page.sort === 'comment' ? 'comment' : 'post'
    }

    function isUserTopicList() {
      if (api.page?.type !== 'user') return false
      const tab = api.page.tab || 'topics'
      return tab === 'topics' || tab === 'replies'
    }

    function shouldPoll() {
      return election.isLeader || isUserTopicList()
    }

    function captureList() {
      const ul = document.querySelector(api.sel?.listUl || 'ul.post-list')
      if (!ul) return false
      if (ul.querySelector('li.notification-item')) return false
      const seen = new Map()
      let maxId = 0
      let maxTs = 0
      for (const li of ul.querySelectorAll('li.post-item')) {
        if (!isListRow(li)) continue
        const it = api.parse.listItem(li)
        if (it?.id) {
          seen.set(it.id, freshnessOf(it))
          maxId = Math.max(maxId, it.id)
          maxTs = Math.max(maxTs, it.lastActiveTs || 0)
        }
      }
      ctx = { ul, seen, maxId, maxTs, sort: listSort() }
      mode = 'list'
      return true
    }

    function captureTopic() {
      const tid = api.page.type === 'topic' ? api.page.id : null
      if (!tid) return false
      const t = api.snapshot?.topic
      const ul = document.querySelector(api.sel?.topicUl || 'ul.topic-post-list, ul.post-list')
      if (!t || !ul) return false
      const posts = [...document.querySelectorAll('li.post-entry')]
      const seenPosts = new Set()
      let maxPostId = 0
      for (const li of posts) {
        const id = Number((li.id || '').match(/^post-(\d+)/)?.[1] || 0)
        if (!id) continue
        seenPosts.add(id)
        maxPostId = Math.max(maxPostId, id)
      }
      ctx = { tid, ul, maxPostId, pages: t.pages || 1, seenPosts }
      mode = 'topic'
      return true
    }

    /** 当前讨论串里已经出现过的楼（含站点 AJAX 自己插进来的）。不能用「最大 id」当水位：自己刚发出的回复 id 更新，会把中间还没插入的别人回复从暂存里冲掉。 */
    function ackLivePost(id) {
      if (!id || mode !== 'topic') return
      if (!ctx.seenPosts) ctx.seenPosts = new Set()
      ctx.seenPosts.add(id)
    }

    function isKnownPost(id) {
      if (!id) return true
      return !!(ctx.seenPosts?.has(id) || document.getElementById('post-' + id))
    }

    function init() {
      teardown()
      navGen += 1
      if (api.page.type === 'user' && !isUserTopicList()) {
        mode = null
        return
      }
      const ok = api.page.type === 'topic' && cfg.trackTopicReplies ? captureTopic() : captureList()
      if (!ok) mode = null
    }

    function teardown() {
      banner?.remove()
      banner = null
      bannerAction = null
      pending = []
      mode = null
      ctx = {}
    }

    function pinnedCount() {
      if (!ctx.ul || mode !== 'list') return 0
      let c = 0
      for (const li of ctx.ul.children) {
        // 置顶帖始终保持在最顶部，实时新帖插在其后
        if (li.classList.contains('topic-pinned') || li.querySelector('.topic-badge.pinned')) c++
        else break
      }
      return c
    }

    /* ── 样式 ── */
    api.ui.style(`
      .lsb-live-banner{cursor:pointer;display:flex;align-items:center;justify-content:center;gap:8px;
        margin:8px 0;padding:9px 12px;border:1px dashed var(--brand,#5eaaa0);border-radius:10px;
        background:var(--brand-soft,#eef7f5);color:var(--brand-hover,#3d7a72);list-style:none;
        font-size:13px;font-weight:600;text-align:center}
      .lsb-live-banner:hover{border-style:solid}
      .lsb-live-banner .lsb-live-dot{flex:0 0 auto;width:7px;height:7px;border-radius:50%;
        background:var(--brand,#5eaaa0);animation:lsb-live-pulse 1.6s ease-in-out infinite}
      .lsb-live-banner.is-topic{margin:10px auto}
      .lsb-live-banner.is-quiet{border-style:solid;opacity:.85;font-weight:500}
      @keyframes lsb-live-pulse{50%{opacity:.25}}
      li.post-item.lsb-live-bumped{animation:lsb-live-bump 2.4s ease-out;opacity:1}
      li.post-item.lsb-seen.lsb-live-bumped{opacity:1}
      li.post-item.lsb-seen.lsb-live-bumped .post-title{color:inherit}
      li.post-item.lsb-seen.lsb-live-bumped img{filter:none}
      @keyframes lsb-live-bump{
        0%,28%{background:var(--brand-soft,#eef7f5);box-shadow:inset 4px 0 0 var(--brand,#5eaaa0)}
        100%{background:transparent;box-shadow:none}
      }
    `)

    function showBanner(text, onClick, { asTopic = false, quiet = false } = {}) {
      // 动作存在可变引用里：横幅语义会随状态变化（「点击加载」→「已加载，回顶部」），
      // 旧实现只在创建时绑一次 onClick，后续传入的新动作会被静默忽略。
      bannerAction = onClick
      if (!banner) {
        banner = document.createElement(asTopic ? 'div' : 'li')
        banner.className = 'lsb-live-banner' + (asTopic ? ' is-topic' : '')
        banner.innerHTML = '<span class="lsb-live-dot"></span><span class="lsb-live-txt"></span>'
        banner.addEventListener('click', () => bannerAction?.())
      }
      banner.classList.toggle('is-quiet', !!quiet)
      if (asTopic) {
        const form = document.querySelector('form.ajax-reply-form')
        const host = form?.parentElement || ctx.ul?.parentElement
        if (host && banner.parentElement !== host) host.insertBefore(banner, form || ctx.ul.nextSibling)
      } else if (ctx.ul) {
        const pos = pinnedCount()
        const ref = ctx.ul.children[pos]
        if (banner.parentElement !== ctx.ul || banner.nextElementSibling !== ref) {
          if (ref) ctx.ul.insertBefore(banner, ref)
          else ctx.ul.appendChild(banner)
        }
      }
      banner.querySelector('.lsb-live-txt').textContent = text
      banner.style.display = ''
    }

    function hideBanner() {
      if (banner) banner.style.display = 'none'
    }

    /* ══════════════ 视口锚点：插入内容后画面不跳动 ══════════════
     * 记「哪个条目在视口的什么高度」，插完再把它挪回原高度。
     * 锚用内容标识（topicId / postId）而非像素，所以即便在锚上方插了 20 条也能精确回补——
     * 这正是可以取消「必须停在页面顶部」这一前提的原因。
     *
     * 相比逛吧的实现多做三件事：
     *   ① 多帧持续校正（图片/字体延迟加载会继续改变高度，单帧校正会残留偏移）
     *   ② 备用锚（首选锚可能因屏蔽/删除而消失，逐个回退）
     *   ③ 检测用户主动滚动并立即让位（绝不与用户抢滚动条）
     */
    function anchorItems() {
      if (mode === 'topic') return [...document.querySelectorAll('li.post-entry')]
      return ctx.ul ? [...ctx.ul.querySelectorAll(':scope > li.post-item')] : []
    }

    function anchorKeyOf(el) {
      if (mode === 'topic') {
        const m = (el.id || '').match(/^post-(\d+)$/)
        return m ? 'post-' + m[1] : null
      }
      const href = el.querySelector('a.post-title[href*="/topic/"]')?.getAttribute('href') || ''
      const m = href.match(/\/topic\/(\d+)/)
      return m ? 'topic-' + m[1] : null
    }

    function findAnchorEl(key) {
      if (key.startsWith('post-')) return document.getElementById(key)
      const id = key.slice('topic-'.length)
      for (const el of anchorItems()) {
        if (el.querySelector(`a.post-title[href*="/topic/${id}"]`)) return el
      }
      return null
    }

    function scrollTop() {
      return window.scrollY ?? window.pageYOffset ?? 0
    }

    function captureAnchor() {
      if (!cfg.anchorScroll) return null
      const vh = window.innerHeight || 0
      const cands = []
      for (const el of anchorItems()) {
        const r = el.getBoundingClientRect?.()
        if (!r) continue
        // 跨过视口顶线或位于视口内的条目才有参考价值
        if (r.bottom > 0 && r.top < vh) {
          const key = anchorKeyOf(el)
          if (key) cands.push({ key, top: r.top })
          if (cands.length >= 3) break // 首选 + 两个备用足够
        }
      }
      if (!cands.length) return null
      return { cands, scrollY: scrollTop(), at: Date.now() }
    }

    let anchorFrames = 0 // 供测试观察补偿是否真的跑过
    function restoreAnchor(anchor) {
      if (!anchor || typeof window.requestAnimationFrame !== 'function') return
      let expected = anchor.scrollY
      let frame = 0
      const step = () => {
        // 用户在补偿窗口内自己滚了 → 让位，不再纠正
        if (Math.abs(scrollTop() - expected) > USER_SCROLL_TOLERANCE) return
        const hit = anchor.cands.map((c) => ({ c, el: findAnchorEl(c.key) })).find((x) => x.el)
        if (!hit) return // 三个锚都没了（被屏蔽/删除）：宁可不动也不乱跳
        const delta = hit.el.getBoundingClientRect().top - hit.c.top
        if (Math.abs(delta) > 1) {
          window.scrollBy?.(0, delta)
          expected = scrollTop()
          anchorFrames++
        }
        if (++frame < ANCHOR_FRAMES) requestAnimationFrame(step)
      }
      // 双帧起步：等浏览器完成本次插入引起的重排
      requestAnimationFrame(() => requestAnimationFrame(step))
    }

    /* ══════════════ 打字保护 ══════════════
     * 正在写回复时往 DOM 里插内容会顶走焦点、打断输入法候选，最坏情况让人丢草稿。
     *
     * 与逛吧的关键差别（它那套有两个会让功能永久停摆的坑）：
     *   ① 它扫描全页所有 textarea/input，任何一个有内容就判定「在编辑」——
     *      搜索框里剩个关键词、站点预填了值，实时流就永久停摆。这里只看
     *      回复/发帖表单的正文框。
     *   ② 它在编辑期间连「抓取」都停。这里只暂停「自动插入」：照常抓、照常出横幅，
     *      用户想看随时点，写完自动补上。功能降级而非罢工。
     */
    const EDITOR_FOCUS_SELECTOR =
      'textarea,[contenteditable="true"],[contenteditable=""],' +
      'input:not([type=radio]):not([type=checkbox]):not([type=submit]):not([type=button]):not([type=reset])'
    const DRAFT_SELECTOR = [
      'form.ajax-reply-form textarea',
      'form[action="/reply_edit"] textarea',
      'form[action="/topic_edit"] textarea',
      'textarea[name="body"]',
      'textarea[name="content"]',
    ].join(',')

    function isTyping() {
      if (!cfg.pauseWhileTyping) return false
      const a = document.activeElement
      if (a && a !== document.body && a.matches?.(EDITOR_FOCUS_SELECTOR)) return true
      for (const ta of document.querySelectorAll(DRAFT_SELECTOR)) {
        if (ta.disabled || ta.hidden || ta.closest('[hidden]')) continue
        if (String(ta.value ?? '').trim() !== '') return true // 草稿未清空：也算在写
      }
      return false
    }

    function liveDoc(path) {
      // 当前页巡检不能进全站闸门：哨兵一启动会拉整页通知，称号行情也 30 秒一轮，
      // 排在它们后面时实时流整段停摆。氢壳无限滚动同样 queue:false。
      return api.net.doc(path, { queue: false })
    }
    function listUrl() {
      if (api.page.type === 'forum') {
        return api.routes.forum(api.page.id, { sort: ctx.sort === 'post' ? 'post' : undefined })
      }
      // 首页：沿用当前 URL 的排序参数、剥掉页码——轮询与视图同一条流，杜绝串台误报
      const q = new URLSearchParams(location.search)
      q.delete('p')
      const qs = q.toString()
      return location.pathname.replace(/\/+$/, '') + (qs ? '?' + qs : '') || '/'
    }

    let lastBumped = 0
    const bumpTimers = []
    function attachNativeUnread(row, src) {
      const from = src?.querySelector?.('a.unread-topic-notice')
      if (!row || !from || row.querySelector('a.unread-topic-notice')) return
      const node = document.importNode(from, true)
      const title = row.querySelector('a.post-title:not(.post-author)')
      if (title) title.after(node)
      else row.querySelector('.post-title-row')?.appendChild(node)
    }
    function markBumped(items) {
      lastBumped = items.length
      if (!items.length || !ctx.ul) return
      for (const it of items) {
        const row = ctx.ul.querySelector(`:scope > li.post-item a.post-title[href*="/topic/${it.id}"]`)
          ?.closest('li.post-item')
        if (!row) continue
        // 站点刷新会在标题旁留「未读」红点；高亮只闪 2.6 秒，点要一直留到用户进帖。
        attachNativeUnread(row, it.el)
        if (!cfg.highlightBumped) continue
        row.classList.remove('lsb-live-bumped')
        void row.offsetWidth
        row.classList.add('lsb-live-bumped')
        const tid = setTimeout(() => row.classList.remove('lsb-live-bumped'), 2600)
        bumpTimers.push(tid)
      }
    }

    function announceNew(kind, n) {
      if (!n) return
      if (cfg.toastOnNew) api.ui.toast(`发现 ${n} 条新${kind}`, { title: '实时流' })
      if (cfg.notifyDesktop && typeof Notification !== 'undefined') {
        try {
          if (Notification.permission === 'granted') {
            new Notification(`linux.sb · ${n} 条新${kind}`)
          } else if (Notification.permission === 'default') {
            Notification.requestPermission()
          }
        } catch {
          /* 无通知环境 */
        }
      }
    }

    async function cycleList() {
      const gen = navGen
      const ul = ctx.ul
      const seen = ctx.seen
      if (!seen) return 0
      const doc = await liveDoc(listUrl())
      if (gen !== navGen || ctx.ul !== ul || ctx.seen !== seen) return 0
      const isPost = ctx.sort === 'post'
      const bumped = []
      for (const li of doc.querySelectorAll('li.post-item')) {
        if (!isListRow(li)) continue
        const it = api.parse.listItem(li)
        if (!it?.id) continue
        const fp = freshnessOf(it)
        if (it.pinned) {
          ctx.seen.set(it.id, fp) // 置顶帖不参与新帖判定，但要记指纹免得当成新动态
          continue
        }
        const prev = ctx.seen.get(it.id)
        if (prev === undefined) {
          // 序数守卫：发布流只认 id 创新高的真·新帖；回复流只认活跃时间创新的。
          // 对侧流的旧帖即便没见过也不算数——这是「1 个说成 40+」的根因。
          if (isPost ? it.id > ctx.maxId : (it.lastActiveTs || 0) > ctx.maxTs) {
            pending.push(it)
            if (pending.length > 200) pending.shift()
          }
          ctx.seen.set(it.id, fp) // 无论是否计入，见过的都不再当新帖
        } else if (prev !== fp) {
          // 已在列表里、但回复数/活跃时间变了 → 老帖有新动态：原地高亮而非重复插入
          bumped.push(it)
          ctx.seen.set(it.id, fp)
        }
      }
      markBumped(bumped)

      if (!pending.length) {
        if (!bumped.length) hideBanner()
        return 0
      }
      announceNew('帖', pending.length)
      ctx.maxId = Math.max(ctx.maxId, ...pending.map((x) => x.id))
      ctx.maxTs = Math.max(ctx.maxTs, ...pending.map((x) => x.lastActiveTs || 0))
      const n = pending.length
      if (gen !== navGen || ctx.ul !== ul) return 0
      await flushOrOffer()
      return n
    }

    /** 距页面顶部足够近（用于决定插入后是否需要提示「已加载」） */
    function nearTop() {
      return scrollTop() < 240
    }

    /**
     * 有待插入内容时的统一决策：能插就插，不能插就出横幅等用户。
     * 「能插」= 自动插入已开启 + 不在打字 + 页面可见 +（锚点补偿可用 或 就在顶部）。
     */
    function canFlushNow() {
      if (!cfg.autoInsert || !pending.length) return false
      if (document.visibilityState === 'hidden') return false // 看不见时不动，切回来再补
      if (isTyping()) return false
      return cfg.anchorScroll || nearTop()
    }

    async function flushOrOffer() {
      if (!pending.length) return
      if (canFlushNow()) {
        const away = !nearTop()
        const n = insertPending(true)
        // 在视口外静默插入后仍然告知一声，并给一键回顶——内容不过期，用户也不失去感知。
        // （逛吧只是静默插入，用户不知道上面多了东西）
        if (n && away) {
          showBanner(`▲ 已加载 ${n} 条新帖 — 点击回到顶部`, () => {
            hideBanner()
            window.scrollTo?.({ top: 0, behavior: 'smooth' })
          }, { quiet: true })
        }
        return
      }
      const m = await msgDelta()
      const why = isTyping() ? '（写完自动加载）' : ''
      showBanner(
        `▲ ${pending.length} 条新帖${m ? ` · ${m} 条新消息` : ''} — 点击加载${why}`,
        () => insertPending(),
      )
    }

    function insertPending(silent = false) {
      if (!pending.length || !ctx.ul) return 0
      const anchor = captureAnchor()
      hideBanner()
      const frag = document.createDocumentFragment()
      const batch = pending.splice(0, cfg.maxInsert)
      for (const it of batch) {
        const node = document.importNode(it.el, true)
        const notices = [...node.querySelectorAll('a.unread-topic-notice')]
        notices.slice(1).forEach((n) => n.remove())
        frag.appendChild(node)
      }
      // 插入到置顶帖之后，保持置顶始终在最顶部
      const pos = pinnedCount()
      const ref = ctx.ul.children[pos]
      if (ref) ctx.ul.insertBefore(frag, ref)
      else ctx.ul.appendChild(frag)
      restoreAnchor(anchor)
      if (!silent) api.ui.toast(`已加载 ${batch.length} 条新帖`, { title: '实时流', type: 'success' })
      if (pending.length) showBanner(`▲ 还有 ${pending.length} 条新帖 — 继续加载`, () => insertPending())
      return batch.length
    }

    /* ── 轮询：帖子模式 ── */
    async function cycleTopic() {
      const gen = navGen
      const tid = ctx.tid
      if (!tid) return 0
      const fresh = new Map() // postId → post（跨页去重）
      const absorb = (t) => {
        for (const p of t.posts) {
          if (!p.postId || fresh.has(p.postId)) continue
          if (p.el?.classList?.contains('quote-threads-child')) {
            ackLivePost(p.postId)
            ctx.maxPostId = Math.max(ctx.maxPostId || 0, p.postId)
            continue
          }
          if (isKnownPost(p.postId)) {
            ackLivePost(p.postId)
            ctx.maxPostId = Math.max(ctx.maxPostId || 0, p.postId)
            continue
          }
          fresh.set(p.postId, p)
        }
      }

      // 新回复总在最后一页
      let t = api.parse.topic(await liveDoc(api.routes.topic(tid, Math.max(1, ctx.pages || 1))))
      if (gen !== navGen || ctx.tid !== tid) return 0
      absorb(t)
      // 回复把帖子顶到了新页：本轮立即追补，不必等下一个周期。
      // 否则每次翻页都会让新页的首批回复延迟一整个轮询间隔才出现。
      for (let i = 0; i < MAX_PAGE_CATCHUP && t.pages > ctx.pages; i++) {
        ctx.pages = t.pages
        t = api.parse.topic(await liveDoc(api.routes.topic(tid, ctx.pages)))
        if (gen !== navGen || ctx.tid !== tid) return 0
        absorb(t)
      }
      if (t.pages > ctx.pages) ctx.pages = t.pages

      if (!fresh.size) return 0
      pending = [...fresh.values()].sort((a, b) => a.floor - b.floor)
      const n = pending.length
      announceNew('回复', n)
      if (cfg.autoInsert && !isTyping() && document.visibilityState !== 'hidden') {
        insertFloors(true)
        return n
      }
      const m = await msgDelta()
      const why = isTyping() ? '（写完自动加载）' : ''
      showBanner(
        `↓ ${n} 条新回复${m ? ` · ${m} 条新消息` : ''} — 点击加载${why}`,
        () => insertFloors(),
        { asTopic: true },
      )
      return n
    }

    function insertFloors(silent = false) {
      if (!pending.length || !ctx.ul) return 0
      const anchor = captureAnchor()
      let n = 0
      for (const p of pending) {
        if (p.postId && document.getElementById('post-' + p.postId)) {
          ackLivePost(p.postId)
          ctx.maxPostId = Math.max(ctx.maxPostId || 0, p.postId)
          continue
        }
        if (p.el?.classList?.contains('quote-threads-child')) {
          ackLivePost(p.postId)
          continue
        }
        ctx.ul.appendChild(document.importNode(p.el, true))
        if (p.postId) {
          ackLivePost(p.postId)
          ctx.maxPostId = Math.max(ctx.maxPostId || 0, p.postId)
        }
        n += 1
      }
      pending = []
      hideBanner()
      restoreAnchor(anchor)
      if (!silent && n) api.ui.toast(`已加载 ${n} 条新回复`, { title: '实时流', type: 'success' })
      return n
    }

    /* ── 时机到了就把暂存内容补上（事件驱动，无需常驻定时器） ── */
    function tryFlush() {
      if (!pending.length) return false
      if (mode === 'topic') {
        if (!cfg.autoInsert || isTyping() || document.visibilityState === 'hidden') return false
        return insertFloors(true) > 0
      }
      if (!canFlushNow()) return false
      return insertPending(true) > 0
    }

    /* ── 巡检核心（在途 Promise 复用，并发不丢弃） ── */
    let inflight = null
    let lastErr = null
    let lastFresh = 0

    async function cycle() {
      if (!mode) init()
      if (!mode) return 0
      if (inflight) return inflight
      inflight = (async () => {
        try {
          lastFresh = mode === 'list' ? await cycleList() : await cycleTopic()
          return lastFresh
        } catch (e) {
          lastErr = String((e && e.message) || e)
          api.log('实时流巡检失败', lastErr)
          return 0
        } finally {
          inflight = null
          if (mode && shouldPoll()) scheduleNext()
        }
      })()
      return inflight
    }

    /* ── 跨标签：心跳选主（只有主标签发请求） ── */
    let timer = null
    let nextAt = null
    function intervalMs() {
      return (document.hidden ? cfg.bgSec : cfg.pollSec) * 1000
    }
    function scheduleNext() {
      if (timer) clearTimeout(timer)
      nextAt = Date.now() + intervalMs()
      timer = setTimeout(() => cycle(), intervalMs())
    }
    const JITTER = Number.isFinite(Number(cfg.jitterMs)) ? Math.max(0, Number(cfg.jitterMs)) : 800
    const election = api.election({
      onPromote: () => cycle(),
      onDemote: () => {
        if (isUserTopicList()) {
          // 资料页与首页不是同一条流：被首页主标签抢走后仍要自己巡检，否则只能刷新才看到新帖
          cycle()
          return
        }
        if (timer) clearTimeout(timer)
        timer = null
        nextAt = null
        hideBanner()
      },
      jitter: JITTER,
    })
    init()
    if (shouldPoll()) cycle()

    // 阻塞条件一解除就补上暂存内容：焦点离开编辑器、标签页切回前台。
    // 逛吧靠 1 秒心跳反复试探；这里事件驱动——响应更快，也不需要常驻定时器。
    const onFocusOut = () => setTimeout(tryFlush, 0) // 等 activeElement 更新完
    const onVisible = () => {
      if (document.visibilityState === 'visible') tryFlush()
    }
    document.addEventListener('focusout', onFocusOut)
    document.addEventListener('visibilitychange', onVisible)

    api.onDispose(() => {
      if (timer) clearTimeout(timer)
      timer = null
      for (const t of bumpTimers.splice(0)) clearTimeout(t)
      document.removeEventListener('focusout', onFocusOut)
      document.removeEventListener('visibilitychange', onVisible)
      teardown()
    })

    /* 消息基线尽早建立：此后每轮对比增量（哨兵缺席则静默，成功后不再重置） */
    msgDelta().catch(() => {})

    /* 软导航换页：立刻重建基线。旧实现延迟 80ms，换页窗口里巡检会写进已经卸掉的 ul。 */
    api.on('route:changed', () => {
      init()
      if (shouldPoll()) cycle()
    })
    api.on('topic:posts-added', (posts) => {
      if (mode !== 'topic') return
      for (const p of posts) ackLivePost(p.postId)
      pending = pending.filter((p) => p.postId && !ctx.seenPosts.has(p.postId) && !document.getElementById('post-' + p.postId))
      if (!pending.length) hideBanner()
    })
    api.dom.each('li.post-entry', (li) => {
      if (mode !== 'topic') return
      const id = Number((li.id || '').match(/^post-(\d+)/)?.[1] || 0)
      if (id) ackLivePost(id)
    })

    /* 无限滚动新增条目计入已见集合，避免误报。只认当前列表，换页插进来的节点不算。 */
    api.dom.each(api.sel?.listItems || 'ul.post-list > li.post-item', (li) => {
      if (mode !== 'list' || !ctx.seen || !ctx.ul?.contains(li)) return
      const it = api.parse.listItem(li)
      if (it?.id) ctx.seen.set(it.id, freshnessOf(it))
    })

    /* ── 调试接口 ── */
    api.handle('live-feed:debug', () => ({
      role: () => election.role,
      election: () => election.state(),
      mode: () => mode,
      pending: () => pending.length,
      baseline: () => ({ ...ctx, seen: ctx.seen ? ctx.seen.size : undefined }),
      autoInsert: () => !!cfg.autoInsert,
      lastErr: () => lastErr,
      lastFresh: () => lastFresh,
      lastBumped: () => lastBumped,
      nextAt: () => nextAt,
      intervalFor: (hidden) => (hidden ? cfg.bgSec : cfg.pollSec) * 1000,
      pollOnce: () => cycle(),
      demote: () => election.demote(),
      load: () => (mode === 'topic' ? insertFloors() : insertPending()),
      bannerVisible: () => !!banner && banner.style.display !== 'none',
      bannerText: () => banner?.querySelector('.lsb-live-txt')?.textContent || '',
      clickBanner: () => bannerAction?.(),
      typing: () => isTyping(),
      canFlush: () => canFlushNow(),
      tryFlush,
      anchorFrames: () => anchorFrames,
      freshness: (id) => ctx.seen?.get(Number(id)),
    }))

    return {}
  }

  const w = typeof unsafeWindow !== 'undefined' ? unsafeWindow : window
  if (w.LSB && w.LSB.register) w.LSB.register(manifest, setup)
  else ;(w.LSB_PLUGINS = w.LSB_PLUGINS || []).push({ manifest, setup })
})()
