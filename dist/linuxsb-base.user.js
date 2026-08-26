// ==UserScript==
// @name         LINUX.SB 氢（RC）
// @name:en      LINUX.SB Hydrogen (RC)
// @namespace    https://linux.sb/
// @version      0.1.22
// @description  【RC】冻新功能，只修阻断。linux.sb 脚本基座：站点解析、统一网络请求、设置面板与插件挂载。请与「LINUX.SB 氧（RC）」一起使用。
// @description:en  [RC] Feature-frozen. Userscript base for linux.sb: site parsing, networked requests, settings panel, plugin host. Install LINUX.SB Oxygen (RC) for features.
// @author       xB70sR71
// @license      MIT
// @match        https://linux.sb/*
// @match        https://www.linux.sb/*
// @run-at       document-start
// @grant        unsafeWindow
// @grant        GM_getValue
// @grant        GM_setValue
// @grant        GM_deleteValue
// @grant        GM_listValues
// @grant        GM_addValueChangeListener
// @grant        GM_removeValueChangeListener
// @grant        GM_xmlhttpRequest
// @grant        GM_registerMenuCommand
// @grant        GM_unregisterMenuCommand
// @connect      linux.sb
// @connect      localhost
// @connect      127.0.0.1
// @connect      *
// @noframes
// ==/UserScript==

(() => {
  var __defProp = Object.defineProperty;
  var __export = (target, all) => {
    for (var name in all)
      __defProp(target, name, { get: all[name], enumerable: true });
  };

  // src/util.js
  function sleep(ms) {
    return new Promise((r) => setTimeout(r, ms));
  }
  function clone(v) {
    if (v === null || typeof v !== "object") return v;
    if (typeof structuredClone === "function") {
      try {
        return structuredClone(v);
      } catch {
        return v;
      }
    }
    try {
      return JSON.parse(JSON.stringify(v));
    } catch {
      return v;
    }
  }
  function deepFreeze(v) {
    if (v && typeof v === "object" && !Object.isFrozen(v)) {
      Object.freeze(v);
      for (const k of Object.getOwnPropertyNames(v)) deepFreeze(v[k]);
    }
    return v;
  }
  function parseVersion(v) {
    const m = String(v || "").trim().match(/^v?(\d+)\.(\d+)\.(\d+)(?:[-+].*)?$/);
    if (!m) return null;
    return [Number(m[1]), Number(m[2]), Number(m[3])];
  }
  function satisfies(version, range) {
    const r = String(range || "*").trim();
    if (!r || r === "*" || r === "latest") return true;
    const v = parseVersion(version);
    if (!v) return false;
    for (const part of r.split("||")) {
      if (part.split(/\s+/).filter(Boolean).every((c) => satisfiesOne(v, c))) return true;
    }
    return false;
  }
  function satisfiesOne(v, comparator) {
    const m = comparator.match(/^(\^|~|>=|<=|>|<|=)?\s*v?(\d+)(?:\.(\d+))?(?:\.(\d+))?/);
    if (!m) return false;
    const op = m[1] || "=";
    const t = [Number(m[2]), m[3] === void 0 ? 0 : Number(m[3]), m[4] === void 0 ? 0 : Number(m[4])];
    const cmp = cmpArr(v, t);
    switch (op) {
      case "=":
        return cmp === 0;
      case ">":
        return cmp > 0;
      case ">=":
        return cmp >= 0;
      case "<":
        return cmp < 0;
      case "<=":
        return cmp <= 0;
      case "^":
        if (cmp < 0) return false;
        return t[0] === 0 ? v[0] === 0 && v[1] === t[1] : v[0] === t[0];
      case "~":
        if (cmp < 0) return false;
        return v[0] === t[0] && v[1] === t[1];
      default:
        return false;
    }
  }
  function cmpArr(a, b) {
    for (let i = 0; i < 3; i++) if (a[i] !== b[i]) return a[i] < b[i] ? -1 : 1;
    return 0;
  }
  function num(s) {
    const m = String(s ?? "").replace(/[,\s]/g, "").match(/-?\d+/);
    return m ? Number(m[0]) : 0;
  }
  function text(el) {
    return el ? String(el.textContent || "").replace(/\s+/g, " ").trim() : "";
  }
  function idFrom(href, prefix) {
    const m = String(href || "").match(new RegExp(`/${prefix}/(\\d+)`));
    return m ? Number(m[1]) : null;
  }
  function uid(prefix = "lsb") {
    return `${prefix}-${Math.random().toString(36).slice(2, 9)}`;
  }
  function throttle(fn, wait) {
    let last = 0;
    let timer = null;
    let pending = null;
    return function throttled(...args) {
      pending = args;
      const now = Date.now();
      const rest = wait - (now - last);
      if (rest <= 0) {
        last = now;
        fn.apply(this, pending);
      } else if (!timer) {
        timer = setTimeout(() => {
          timer = null;
          last = Date.now();
          fn.apply(this, pending);
        }, rest);
      }
    };
  }
  function esc(s) {
    return String(s ?? "").replace(/[&<>"'`]/g, (c) => ({
      "&": "&amp;",
      "<": "&lt;",
      ">": "&gt;",
      '"': "&quot;",
      "'": "&#39;",
      "`": "&#96;"
    })[c]);
  }

  // src/bus.js
  var Bus = class {
    constructor({ onError } = {}) {
      this._map = /* @__PURE__ */ new Map();
      this._handlers = /* @__PURE__ */ new Map();
      this._onError = onError || ((e, info) => console.error("[LSB bus]", info, e));
      this._replay = /* @__PURE__ */ new Map();
    }
    on(event, fn, { owner = "anonymous", once = false } = {}) {
      if (typeof fn !== "function") throw new TypeError("on(event, fn): fn 必须是函数");
      const rec = { fn, owner, once, event };
      if (!this._map.has(event)) this._map.set(event, /* @__PURE__ */ new Set());
      this._map.get(event).add(rec);
      if (this._replay.has(event)) {
        const { payload, meta } = this._replay.get(event);
        this._invoke(rec, clone(payload), meta);
      }
      return () => this.off(event, fn);
    }
    once(event, fn, opts = {}) {
      return this.on(event, fn, { ...opts, once: true });
    }
    off(event, fn) {
      const set = this._map.get(event);
      if (!set) return false;
      for (const rec of set) {
        if (rec.fn === fn) {
          set.delete(rec);
          if (!set.size) this._map.delete(event);
          return true;
        }
      }
      return false;
    }
    /** 卸载某个插件的所有监听与 handler */
    offOwner(owner) {
      for (const [event, set] of [...this._map]) {
        for (const rec of [...set]) if (rec.owner === owner) set.delete(rec);
        if (!set.size) this._map.delete(event);
      }
      for (const [name, rec] of [...this._handlers]) {
        if (rec.owner === owner) this._handlers.delete(name);
      }
    }
    /**
     * @param {string} event
     * @param {any} payload
     * @param {{ sticky?: boolean, source?: string, raw?: boolean }} opts
     *   sticky: 记住最后一次，后注册的监听者立即收到（如 site:ready）
     *   raw:    不深拷贝（传 DOM 节点时用）
     */
    emit(event, payload, opts = {}) {
      const meta = { event, source: opts.source || "core", ts: Date.now(), id: uid("ev") };
      const data = opts.raw ? payload : clone(payload);
      if (opts.sticky) this._replay.set(event, { payload: data, meta });
      let n = 0;
      for (const key of this._matching(event)) {
        for (const rec of [...this._map.get(key) || []]) {
          n++;
          this._invoke(rec, data, meta);
        }
      }
      return n;
    }
    _invoke(rec, payload, meta) {
      if (rec.once) this._map.get(rec.event)?.delete(rec);
      try {
        const r = rec.fn(payload, meta);
        if (r && typeof r.catch === "function") {
          r.catch((e) => this._onError(e, { event: meta.event, owner: rec.owner, async: true }));
        }
      } catch (e) {
        this._onError(e, { event: meta.event, owner: rec.owner });
      }
    }
    /** 事件名 a:b:c 会命中 a:b:c、a:b:*、a:*、* */
    _matching(event) {
      const keys = ["*"];
      const parts = String(event).split(":");
      for (let i = 1; i < parts.length; i++) keys.push(parts.slice(0, i).join(":") + ":*");
      keys.push(event);
      return keys.filter((k) => this._map.has(k));
    }
    /* ─────────── 一对一 RPC ─────────── */
    /** 注册可被调用的能力，同名后注册者报错（先到先得，避免插件互相覆盖） */
    handle(name, fn, { owner = "anonymous" } = {}) {
      if (this._handlers.has(name)) {
        throw new Error(`handle('${name}') 已被 ${this._handlers.get(name).owner} 占用`);
      }
      this._handlers.set(name, { owner, fn });
      return () => {
        if (this._handlers.get(name)?.fn === fn) this._handlers.delete(name);
      };
    }
    hasHandler(name) {
      return this._handlers.has(name);
    }
    /** await bus.request('mod:stats', { uid: 1 }) */
    async request(name, payload, { timeout = 15e3 } = {}) {
      const rec = this._handlers.get(name);
      if (!rec) throw new Error(`no handler for '${name}'`);
      const call = Promise.resolve().then(() => rec.fn(clone(payload), { name, ts: Date.now() }));
      if (!timeout) return call;
      let timer;
      try {
        return await Promise.race([
          call,
          new Promise((_, rej) => {
            timer = setTimeout(() => rej(new Error(`request '${name}' 超时 ${timeout}ms`)), timeout);
          })
        ]);
      } finally {
        clearTimeout(timer);
      }
    }
    listEvents() {
      return [...this._map.keys()].sort();
    }
    listHandlers() {
      return [...this._handlers.entries()].map(([name, r]) => ({ name, owner: r.owner }));
    }
  };

  // src/site.js
  var site_exports = {};
  __export(site_exports, {
    ROUTES: () => ROUTES,
    SEL: () => SEL,
    USER_TABS: () => USER_TABS,
    detectPage: () => detectPage,
    parseLikeTargets: () => parseLikeTargets,
    parseList: () => parseList,
    parseListItem: () => parseListItem,
    parsePost: () => parsePost,
    parseTopic: () => parseTopic,
    parseUser: () => parseUser,
    readCsrf: () => readCsrf,
    readCurrentUser: () => readCurrentUser,
    readForums: () => readForums,
    snapshot: () => snapshot
  });
  var ROUTES = {
    home: "/",
    homeSorted: (sort = "post", p = 1) => `/index.php?sort=${sort}${p > 1 ? `&p=${p}` : ""}`,
    forum: (id, { sort, p } = {}) => {
      const q = [];
      if (sort) q.push(`sort=${sort}`);
      if (p && p > 1) q.push(`p=${p}`);
      return `/forum/${id}${q.length ? `?${q.join("&")}` : ""}`;
    },
    topic: (id, p = 1) => `/topic/${id}${p > 1 ? `?p=${p}` : ""}`,
    user: (id, tab) => `/user/${id}${tab ? `?tab=${tab}` : ""}`,
    forumList: "/forum_list",
    profile: "/profile",
    topicEdit: "/topic_edit",
    search: "/search",
    checkin: "/daily_checkin",
    leaderboard: (type = "points") => `/leaderboard?type=${type}`,
    invite: "/invite_code",
    donate: (topicId) => `/donate${topicId ? `?topic_id=${topicId}` : ""}`,
    donateFeed: "/donate_feed",
    notify: (id) => `/notify/${id}`,
    report: (id) => `/content_report/${id}`,
    // POST 端点
    post: {
      reply: "/reply_edit",
      topic: "/topic_edit",
      favorite: "/topic_favorite",
      likeCoin: "/lsb_like_coin",
      attachment: "/attachment_upload",
      preview: "/nb_editor_preview",
      featured: "/topic_featured",
      search: "/search"
    }
  };
  var USER_TABS = ["topics", "replies", "notifications", "points_rewards", "favorites"];
  var SEL = {
    topicPosts: "ul.topic-post-list > li.post-entry, ul.post-list > li.post-entry",
    topicUl: "ul.topic-post-list, ul.post-list",
    listItems: "ul.post-list > li.post-item",
    listUl: "ul.post-list",
    postEntry: "li.post-entry"
  };
  function detectPage(loc = location) {
    const path = loc.pathname.replace(/\/+$/, "") || "/";
    const q = new URLSearchParams(loc.search);
    const mTopic = path.match(/^\/topic\/(\d+)$/);
    if (mTopic) return { type: "topic", id: Number(mTopic[1]), page: Number(q.get("p") || 1) };
    const mForum = path.match(/^\/forum\/(\d+)$/);
    if (mForum) {
      return {
        type: "forum",
        id: Number(mForum[1]),
        page: Number(q.get("p") || 1),
        sort: q.get("sort") || "comment"
      };
    }
    const mUser = path.match(/^\/user\/(\d+)$/);
    if (mUser) return { type: "user", id: Number(mUser[1]), tab: q.get("tab") || "topics" };
    if (path === "/" || path === "/index.php") {
      return { type: "home", page: Number(q.get("p") || 1), sort: q.get("sort") || "post" };
    }
    const known = {
      "/profile": "profile",
      "/topic_edit": "topic_edit",
      "/daily_checkin": "checkin",
      "/leaderboard": "leaderboard",
      "/invite_code": "invite",
      "/forum_list": "forum_list",
      "/search": "search",
      "/donate": "donate"
    };
    if (known[path]) return { type: known[path] };
    if (/^\/notify\/\d+$/.test(path)) return { type: "notify", id: num(path) };
    if (/^\/content_report\/\d+$/.test(path)) return { type: "report", id: num(path) };
    return { type: "unknown", path };
  }
  function readCsrf(doc = document) {
    const el = doc.querySelector('input[name="_csrf"]');
    return el ? el.value : null;
  }
  function readCurrentUser(doc = document) {
    const uidOf = (a) => a ? idFrom(a.getAttribute("href"), "user") : null;
    const strategies = [
      // A. 「我的主页」直链（旧版移动端抽屉，改版后可能仍在别处）
      () => uidOf([...doc.querySelectorAll('a[href*="/user/"]')].find((a) => text(a) === "我的主页")),
      // B. 「我的主题/回帖/收藏/通知/积分」这类自指链接，措辞带「我的」即锁定本人
      () => uidOf(
        [...doc.querySelectorAll('a[href*="/user/"]')].find((a) => {
          const s = text(a);
          return /^我的(主题|回帖|收藏|通知|积分|称号)/.test(s);
        })
      ),
      // C. 侧栏用户卡 + 登录专属入口（/profile 个人设置、发帖按钮）同时存在 → 卡片即本人
      () => {
        const loggedIn = doc.querySelector('a[href="/profile"]') || doc.querySelector('a.btn-post[href="/topic_edit"]') || doc.querySelector('a[href="/daily_checkin"]');
        if (!loggedIn) return null;
        return uidOf(doc.querySelector(".sidebar-card.user-card a.user-name"));
      }
    ];
    let myUid = null;
    for (const fn of strategies) {
      try {
        myUid = fn();
      } catch {
        myUid = null;
      }
      if (myUid != null) break;
    }
    const card = doc.querySelector(".sidebar-card.user-card");
    const cardLink = card?.querySelector("a.user-name");
    const cardUid = uidOf(cardLink);
    const isSelfCard = myUid != null && cardUid === myUid;
    const rank = text(card?.querySelector(".user-rank"));
    const guest = myUid == null;
    return {
      guest,
      uid: myUid,
      name: isSelfCard ? text(cardLink) : null,
      rank: isSelfCard ? rank : null,
      points: isSelfCard ? num(rank.split("·")[1] || "") : null,
      group: isSelfCard ? (rank.split("·")[0] || "").trim() || null : null,
      avatar: isSelfCard ? card?.querySelector(".avatar-img")?.getAttribute("src") || null : null
    };
  }
  function readForums(doc = document) {
    const out = /* @__PURE__ */ new Map();
    const sel = '.forum-nav a[href^="/forum/"], #mobile-menu-drawer a[href^="/forum/"], .forum-more-region a[href^="/forum/"]';
    for (const a of doc.querySelectorAll(sel)) {
      const id = idFrom(a.getAttribute("href"), "forum");
      if (id && !out.has(id)) out.set(id, { id, name: text(a) });
    }
    const counted = '.forum-enhancements-sidebar-list a[href^="/forum/"], a.forum-enhancements-link[href^="/forum/"]';
    for (const a of doc.querySelectorAll(counted)) {
      const id = idFrom(a.getAttribute("href"), "forum");
      if (!id) continue;
      const nameEl = a.querySelector(".forum-enhancements-sidebar-name, .forum-enhancements-name");
      const countEl = a.querySelector(".forum-enhancements-sidebar-count, .forum-enhancements-count");
      const rec = out.get(id) || { id, name: nameEl ? text(nameEl) : text(a) };
      if (nameEl) rec.name = text(nameEl);
      if (countEl) {
        const n = num(text(countEl));
        if (Number.isFinite(n)) rec.topics = n;
      }
      out.set(id, rec);
    }
    return [...out.values()].sort((a, b) => a.id - b.id);
  }
  function parseListItem(li) {
    const titleA = li.querySelector("a.post-title");
    if (!titleA) return null;
    const authorA = li.querySelector('.post-avatar a[href^="/user/"]') || li.querySelector('.post-meta a[href^="/user/"]');
    const forumA = li.querySelector('.post-forum-meta a[href^="/forum/"], .post-meta a[href^="/forum/"]');
    const stamp = li.querySelector("span[data-performance-time]");
    const counts = [...li.querySelectorAll(".post-meta span")].map((s) => text(s)).filter((t) => /^\d[\d,]*$/.test(t)).map(num);
    return {
      id: idFrom(titleA.getAttribute("href"), "topic"),
      title: text(titleA),
      url: titleA.getAttribute("href"),
      authorId: authorA ? idFrom(authorA.getAttribute("href"), "user") : null,
      authorName: authorA ? text(authorA) || authorA.querySelector("img")?.getAttribute("alt") || null : null,
      forumId: forumA ? idFrom(forumA.getAttribute("href"), "forum") : null,
      forumName: forumA ? text(forumA) : null,
      replies: counts.length ? counts[counts.length - 1] : null,
      lastActiveTs: stamp ? num(stamp.getAttribute("data-performance-time")) : null,
      pinned: li.classList.contains("topic-pinned") || !!li.querySelector(".topic-badge.pinned"),
      badges: [...li.querySelectorAll(".topic-stamp-badge")].map((b) => text(b)),
      el: li
    };
  }
  function parseList(root = document) {
    return [...root.querySelectorAll(SEL.listItems)].map(parseListItem).filter((x) => x && x.id);
  }
  function parsePost(li) {
    const idm = (li.id || "").match(/^post-(\d+)$/);
    const authorA = li.querySelector("a.post-title.post-author") || li.querySelector('.post-avatar a[href^="/user/"]');
    const stamp = li.querySelector("span[data-performance-time]");
    const likeBtn = li.querySelector("[data-like-coin-action]");
    return {
      postId: idm ? Number(idm[1]) : null,
      floor: li.dataset?.floor ? Number(li.dataset.floor) : 0,
      authorId: authorA ? idFrom(authorA.getAttribute("href"), "user") : null,
      authorName: authorA ? text(authorA) || authorA.querySelector("img")?.getAttribute("alt") || null : null,
      groups: [...li.querySelectorAll(".post-user-group")].map((g) => text(g)).filter((t) => t && !/^UID/.test(t)),
      ts: stamp ? num(stamp.getAttribute("data-performance-time")) : null,
      html: li.querySelector(".post-content")?.innerHTML ?? "",
      content: text(li.querySelector(".post-content")),
      likes: likeBtn ? num(text(li.querySelector(".like-coin-count"))) : null,
      liked: likeBtn ? likeBtn.getAttribute("data-like-coin-liked") === "1" : null,
      coined: likeBtn ? num(likeBtn.getAttribute("data-like-coin-coined")) : null,
      el: li
    };
  }
  function parseTopic(doc = document) {
    const stats = [...doc.querySelectorAll(".post-content-stats span")].map((s) => num(text(s)));
    const crumbForum = [...doc.querySelectorAll('.breadcrumb a[href^="/forum/"]')].pop();
    const posts = [...doc.querySelectorAll(SEL.topicPosts)].map(parsePost);
    const pages = [...doc.querySelectorAll('.pagination a[href*="p="]')].reduce(
      (mx, a) => Math.max(mx, num((a.getAttribute("href").match(/[?&]p=(\d+)/) || [])[1])),
      1
    );
    const idFromCanonical = idFrom(doc.querySelector('link[rel="canonical"]')?.getAttribute("href") || "", "topic");
    return {
      id: idFromCanonical ?? (posts[0] ? posts[0].postId : null),
      title: text(doc.querySelector("h1.post-content-title")),
      forumId: crumbForum ? idFrom(crumbForum.getAttribute("href"), "forum") : null,
      forumName: crumbForum ? text(crumbForum) : null,
      views: stats[0] ?? null,
      replies: stats[1] ?? null,
      pages,
      op: posts[0] || null,
      posts,
      replyForm: !!doc.querySelector("form.ajax-reply-form"),
      loginRequired: !doc.querySelector("form.ajax-reply-form")
    };
  }
  function parseUser(doc = document) {
    const card = doc.querySelector(".sidebar-card.user-card");
    const link = card?.querySelector("a.user-name");
    const rank = text(card?.querySelector(".user-rank"));
    return {
      uid: link ? idFrom(link.getAttribute("href"), "user") : null,
      name: text(link),
      rank,
      group: (rank.split("·")[0] || "").trim() || null,
      points: num(rank.split("·")[1] || ""),
      avatar: card?.querySelector(".avatar-img")?.getAttribute("src") || null,
      tabs: [...doc.querySelectorAll('.tab[href*="tab="]')].map((a) => ({
        key: (a.getAttribute("href").match(/tab=(\w+)/) || [])[1],
        name: text(a),
        active: a.classList.contains("active")
      })),
      items: parseList(doc)
    };
  }
  function parseLikeTargets(doc = document) {
    return [...doc.querySelectorAll("[data-like-coin-action]")].map((btn) => ({
      type: btn.getAttribute("data-like-coin-type"),
      id: num(btn.getAttribute("data-like-coin-id")),
      tiers: (btn.getAttribute("data-like-coin-tiers") || "").split(",").filter(Boolean).map(num),
      liked: btn.getAttribute("data-like-coin-liked") === "1",
      coined: num(btn.getAttribute("data-like-coin-coined")),
      count: num(text(btn.parentElement?.querySelector(".like-coin-count"))),
      el: btn
    }));
  }
  function snapshot(doc = document, loc = location, prev = null) {
    const page = detectPage(loc);
    const same = prev?.page?.type === page.type && (prev.page.id ?? null) === (page.id ?? null);
    const snap = {
      page,
      csrf: readCsrf(doc),
      me: readCurrentUser(doc),
      forums: same && prev.forums ? prev.forums : readForums(doc),
      version: doc.querySelector('link[href*="index.css?v="]')?.getAttribute("href")?.match(/v=v?([\d.]+)/)?.[1] || null
    };
    if (page.type === "topic") snap.topic = same && prev.topic ? prev.topic : parseTopic(doc);
    if (page.type === "user") snap.user = same && prev.user ? prev.user : parseUser(doc);
    if (page.type === "home" || page.type === "forum") snap.list = same && prev.list ? prev.list : parseList(doc);
    return snap;
  }

  // src/net.js
  var Net = class {
    constructor({ origin = location.origin, rate = 900, log = () => {
    }, gmRequest = null } = {}) {
      this.origin = origin;
      this.rate = rate;
      this.log = log;
      this.gmRequest = gmRequest;
      this._queue = Promise.resolve();
      this._last = 0;
      this._csrf = null;
      this._inflight = /* @__PURE__ */ new Map();
    }
    setCsrf(token) {
      this._csrf = token || null;
    }
    csrf() {
      if (!this._csrf) this._csrf = readCsrf(document);
      return this._csrf;
    }
    /** 全局串行闸门：无论谁调用，都排队按 rate 出队 */
    _gate(task) {
      const run = this._queue.then(async () => {
        const wait = this.rate - (Date.now() - this._last);
        if (wait > 0) await sleep(wait);
        this._last = Date.now();
        return task();
      });
      this._queue = run.then(() => {
      }, () => {
      });
      return run;
    }
    _url(path) {
      return path.startsWith("http") ? path : this.origin + (path.startsWith("/") ? path : "/" + path);
    }
    _sameOrigin(url) {
      try {
        return new URL(url, this.origin).origin === this.origin;
      } catch {
        return false;
      }
    }
    /** 供权限层判定「这是站内请求还是站外请求」（core 的 write/net 分流依据） */
    isSameOrigin(path) {
      return this._sameOrigin(this._url(path));
    }
    async raw(path, { method = "GET", body = null, headers = {}, external = false, retry, timeout = 2e4, backoff, queue } = {}) {
      const url = this._url(path);
      if (!this._sameOrigin(url) && !external) {
        throw new Error(`跨域请求被拒绝：${url}（需 external:true 且脚本已 @connect）`);
      }
      const idempotent = method === "GET" || method === "HEAD";
      if (retry == null) retry = idempotent ? 2 : 0;
      const bo = { rate: 1500, err: 800, ...backoff || {} };
      const isExternal = !this._sameOrigin(url);
      const useQueue = queue == null ? !isExternal : !!queue;
      const attempt = async () => {
        let lastErr;
        for (let i = 0; i <= retry; i++) {
          try {
            const res = isExternal && this.gmRequest ? await this._viaGm(url, { method, body, headers, timeout }) : await this._viaFetch(url, { method, body, headers, timeout });
            if (res.status === 429 || res.status === 503) {
              this.log(`限流 ${res.status}，退避重试 ${i + 1}/${retry}`);
              await sleep(bo.rate * (i + 1));
              lastErr = new Error(`HTTP ${res.status}`);
              continue;
            }
            return res;
          } catch (e) {
            lastErr = e;
            if (i === retry) break;
            await sleep(bo.err * (i + 1));
          }
        }
        throw lastErr;
      };
      return useQueue ? this._gate(attempt) : attempt();
    }
    async _viaFetch(url, { method, body, headers, timeout }) {
      const ctrl = new AbortController();
      const timer = setTimeout(() => ctrl.abort(), timeout);
      try {
        const res = await fetch(url, {
          method,
          body,
          headers,
          credentials: "same-origin",
          redirect: "follow",
          signal: ctrl.signal
        });
        return { status: res.status, ok: res.ok, url: res.url, text: await res.text() };
      } finally {
        clearTimeout(timer);
      }
    }
    _viaGm(url, { method, body, headers, timeout }) {
      let data = body;
      if (body && typeof body !== "string" && typeof FormData !== "undefined" && !(body instanceof FormData)) {
        data = JSON.stringify(body);
      }
      return new Promise((resolve, reject) => {
        const fail = (why) => reject(
          new Error(
            `GM 请求失败: ${url}（${why}。氢需 @connect 该域名，请确认已更新氢脚本并允许跨域）`
          )
        );
        this.gmRequest({
          url,
          method,
          data,
          headers,
          timeout,
          anonymous: true,
          onload: (r) => {
            if (!r || !r.status) return fail(r?.error || "status 0，多半是域名未放行");
            resolve({ status: r.status, ok: r.status >= 200 && r.status < 300, url, text: r.responseText });
          },
          onerror: (r) => fail(r?.error || r?.status || "网络失败或被油猴拦截"),
          ontimeout: () => reject(new Error(`GM 请求超时: ${url}`))
        });
      });
    }
    /** 取 HTML 并解析为 Document（不执行脚本、不加载子资源） */
    async doc(path, opts = {}) {
      const key = `GET ${this._url(path)}`;
      if (this._inflight.has(key)) return this._inflight.get(key);
      const p = (async () => {
        const res = await this.raw(path, opts);
        if (!res.ok) throw new Error(`${path} → HTTP ${res.status}`);
        const d = new DOMParser().parseFromString(res.text, "text/html");
        const t = readCsrf(d);
        if (t) this._csrf = t;
        return d;
      })();
      this._inflight.set(key, p);
      try {
        return await p;
      } finally {
        this._inflight.delete(key);
      }
    }
    async json(path, opts = {}) {
      const res = await this.raw(path, {
        ...opts,
        headers: { accept: "application/json", ...opts.headers || {} }
      });
      try {
        return JSON.parse(res.text);
      } catch {
        throw new Error(`${path} 返回非 JSON（HTTP ${res.status}）`);
      }
    }
    /** 表单 POST，自动带 _csrf。fields 为普通对象或 FormData */
    async form(path, fields = {}, opts = {}) {
      const fd = fields instanceof FormData ? fields : new FormData();
      if (!(fields instanceof FormData)) {
        for (const [k, v] of Object.entries(fields)) {
          if (v !== void 0 && v !== null) fd.append(k, v);
        }
      }
      if (!fd.has("_csrf")) {
        const token = this.csrf();
        if (!token) throw new Error("缺少 _csrf：当前页面未登录或未渲染表单");
        fd.append("_csrf", token);
      }
      const res = await this.raw(path, {
        method: "POST",
        body: fd,
        headers: { "x-requested-with": "XMLHttpRequest", ...opts.headers || {} },
        ...opts
      });
      return res;
    }
  };
  var Actions = class {
    constructor(net) {
      this.net = net;
    }
    /** 回复帖子 */
    async reply(topicId, body, extra = {}) {
      if (!body || !String(body).trim()) throw new Error("回复内容不能为空");
      const res = await this.net.form(ROUTES.post.reply, { topic_id: topicId, body, ...extra });
      return { ok: res.ok, status: res.status, raw: res.text };
    }
    /** 收藏 / 取消收藏（服务端切换） */
    async toggleFavorite(topicId) {
      const res = await this.net.form(ROUTES.post.favorite, { topic_id: topicId });
      return { ok: res.ok, status: res.status };
    }
    /** 点赞或投币；type: 'topic' | 'reply'，coin 为投币数（0 = 仅点赞） */
    async likeCoin({ type = "reply", id, coin = 0 }) {
      const res = await this.net.form(ROUTES.post.likeCoin, {
        like_coin_type: type,
        like_coin_id: id,
        ...coin ? { coin } : {}
      });
      return { ok: res.ok, status: res.status, raw: res.text };
    }
    /** Markdown 预览（站点自带 /nb_editor_preview） */
    async preview(body) {
      const res = await this.net.form(ROUTES.post.preview, { body });
      return res.text;
    }
    /**
     * 搜索：field = title | body | reply。
     * GET 与 POST 各试一次，用「响应像不像搜索页」做合理性校验——
     * 旧实现盲信 GET 返回，站点回退到首页列表时把 53 条首页帖当搜索结果（误报根源）。
     */
    /**
     * 搜索（实测协议）：POST /search {_csrf,q} → JSON {ok:1,redirect:'/index.php?q=..&field=..'}
     * → GET 该 redirect 即结果列表页。旧 GET 直连会被 302 回首页造成假命中。
     */
    async search(q, field = "title") {
      const res = await this.net.form(ROUTES.post.search, { q, field });
      let j = null;
      try {
        j = JSON.parse(res.text || "");
      } catch {
      }
      if (!(j && j.ok && j.redirect)) {
        throw new Error("搜索接口返回异常：" + String(res.text || "").slice(0, 80));
      }
      return await this.net.doc(j.redirect);
    }
    /** 打赏动态流 */
    async donateFeed(topicId, lastId = 0) {
      return this.net.json(`${ROUTES.donateFeed}?topic_id=${topicId}&last_id=${lastId}`);
    }
  };

  // src/store.js
  var PREFIX = "lsb_base";
  function gmAvailable() {
    return typeof GM_getValue === "function" && typeof GM_setValue === "function";
  }
  var Backend = class {
    constructor() {
      this._mem = /* @__PURE__ */ new Map();
      this._lsRef = null;
    }
    /** 测试里每次换 JSDOM 会换 localStorage 实例，缓存必须跟着丢掉 */
    _syncCacheScope() {
      if (gmAvailable()) return;
      try {
        if (this._lsRef !== localStorage) {
          this._mem.clear();
          this._lsRef = localStorage;
        }
      } catch {
        this._mem.clear();
        this._lsRef = null;
      }
    }
    get(key, def) {
      this._syncCacheScope();
      if (gmAvailable()) {
        if (this._mem.has(key)) {
          const hit = this._mem.get(key);
          return hit.value === void 0 ? def : hit.value;
        }
        const v = GM_getValue(key, void 0);
        if (v === void 0) return def;
        this._mem.set(key, { value: v });
        return v;
      }
      try {
        const raw = localStorage.getItem(key);
        if (raw === null) {
          this._mem.delete(key);
          return def;
        }
        const hit = this._mem.get(key);
        if (hit && hit.raw === raw) return hit.value;
        const v = JSON.parse(raw);
        this._mem.set(key, { raw, value: v });
        return v;
      } catch {
        return def;
      }
    }
    set(key, value) {
      this._syncCacheScope();
      if (gmAvailable()) {
        this._mem.set(key, { value });
        return GM_setValue(key, value);
      }
      try {
        const raw = JSON.stringify(value);
        localStorage.setItem(key, raw);
        this._mem.set(key, { raw, value });
      } catch (e) {
        console.warn("[LSB store] 写入失败", e);
      }
    }
    del(key) {
      this._syncCacheScope();
      this._mem.delete(key);
      if (gmAvailable() && typeof GM_deleteValue === "function") return GM_deleteValue(key);
      try {
        localStorage.removeItem(key);
      } catch {
      }
    }
    keys() {
      if (gmAvailable() && typeof GM_listValues === "function") return GM_listValues();
      try {
        return Object.keys(localStorage);
      } catch {
        return [];
      }
    }
  };
  var backend = new Backend();
  var Store = class {
    constructor(ns) {
      this.ns = ns;
      this._prefix = `${PREFIX}:${ns}:`;
      this._watchers = /* @__PURE__ */ new Set();
    }
    _k(key) {
      return this._prefix + key;
    }
    get(key, def = null) {
      return backend.get(this._k(key), def);
    }
    set(key, value) {
      const old = backend.get(this._k(key), void 0);
      backend.set(this._k(key), value);
      for (const fn of this._watchers) {
        try {
          fn(key, value, old);
        } catch (e) {
          console.error("[LSB store watcher]", e);
        }
      }
      return value;
    }
    del(key) {
      backend.del(this._k(key));
    }
    /** 读改写一体，避免并发下丢更新 */
    update(key, fn, def = null) {
      return this.set(key, fn(this.get(key, def)));
    }
    keys() {
      return backend.keys().filter((k) => k.startsWith(this._prefix)).map((k) => k.slice(this._prefix.length));
    }
    all() {
      const out = {};
      for (const k of this.keys()) out[k] = this.get(k);
      return out;
    }
    clear() {
      for (const k of this.keys()) this.del(k);
    }
    /** 本标签页内的变更通知（跨标签页请配合 GM_addValueChangeListener） */
    watch(fn) {
      this._watchers.add(fn);
      return () => this._watchers.delete(fn);
    }
    /**
     * 配置项：带默认值合并，插件升级新增字段时旧数据不会缺键。
     * defaults 为 schema：{ key: { type, default, label, desc, options? } }
     */
    config(defaults = {}) {
      const saved = this.get("__config", {}) || {};
      const out = {};
      for (const [k, def] of Object.entries(defaults)) {
        const spec = typeof def === "object" && def && "default" in def ? def : { default: def };
        out[k] = k in saved ? saved[k] : spec.default;
      }
      return out;
    }
    saveConfig(patch) {
      return this.update("__config", (cur) => ({ ...cur || {}, ...patch }), {});
    }
  };
  function makeStore(ns) {
    return new Store(ns);
  }
  var coreStore = new Store("__core");
  var RAW_PREFIX = PREFIX;
  var rawKeys = () => backend.keys().filter((k) => k.startsWith(PREFIX));
  var rawGet = (k) => backend.get(k, void 0);
  var rawSet = (k, v) => backend.set(k, v);

  // src/ui.js
  var CSS = `
.lsb-toast-host{position:fixed;right:16px;bottom:16px;z-index:99999;display:flex;flex-direction:column;gap:8px;pointer-events:none}
.lsb-toast{pointer-events:auto;min-width:180px;max-width:320px;padding:9px 12px;border:1px solid var(--line,#ddd);border-radius:8px;background:var(--panel,#fff);color:var(--text,#222);font-size:13px;box-shadow:0 6px 18px var(--shadow-medium,rgba(0,0,0,.18));opacity:0;transform:translateY(6px);transition:opacity .18s,transform .18s}
.lsb-toast.is-in{opacity:1;transform:none}
.lsb-toast.is-err{border-color:var(--danger,#e07a7a)}
.lsb-toast.is-ok{border-color:var(--success,#7bc4b8)}
.lsb-toast-title{font-weight:600;margin-bottom:2px}
.lsb-launcher{position:fixed;right:16px;bottom:74px;z-index:99998;width:38px;height:38px;border-radius:50%;border:1px solid var(--line,#ddd);background:var(--panel,#fff);color:var(--brand,#5eaaa0);cursor:pointer;font-size:15px;font-weight:700;box-shadow:0 4px 12px var(--shadow-base,rgba(0,0,0,.15))}
.lsb-launcher:hover{border-color:var(--brand,#5eaaa0)}
.lsb-mask{position:fixed;inset:0;z-index:99998;background:var(--backdrop,rgba(0,0,0,.45))}
.lsb-panel{position:fixed;z-index:99999;left:50%;top:50%;transform:translate(-50%,-50%);width:min(720px,94vw);max-height:82vh;display:flex;flex-direction:column;border:1px solid var(--line,#ddd);border-radius:10px;background:var(--panel,#fff);color:var(--text,#222);font-size:13px;overflow:hidden;box-shadow:0 18px 48px var(--shadow-medium,rgba(0,0,0,.3))}
.lsb-panel-settings{height:min(640px,82vh)}
.lsb-panel-head{display:flex;align-items:center;gap:8px;padding:10px 12px;border-bottom:1px solid var(--line-soft,#eee)}
.lsb-panel-head strong{font-size:14px}
.lsb-panel-head .lsb-ver{color:var(--text-muted,#888);font-size:11px}
.lsb-panel-close{margin-left:auto;border:0;background:transparent;color:var(--text-muted,#888);font-size:18px;cursor:pointer;line-height:1}
.lsb-panel-body{display:flex;min-height:0;flex:1}
.lsb-tabs{flex:0 0 168px;border-right:1px solid var(--line-soft,#eee);overflow:auto;padding:6px}
.lsb-tab{display:block;width:100%;text-align:left;padding:7px 9px;margin-bottom:2px;border:0;border-radius:6px;background:transparent;color:var(--text,#222);cursor:pointer;font-size:13px}
.lsb-tab:hover{background:var(--bg,#f6f6f6)}
.lsb-tab.is-active{background:var(--brand-soft,#e8f4f2);color:var(--brand,#5eaaa0);font-weight:600}
.lsb-view{flex:1;min-width:0;overflow:auto;padding:12px 14px}
.lsb-row{display:flex;align-items:center;gap:10px;padding:7px 0;border-bottom:1px solid var(--line-soft,#f0f0f0)}
.lsb-row:last-child{border-bottom:0}
.lsb-row-main{min-width:0;flex:1}
.lsb-row-name{font-weight:600}
.lsb-row-desc{color:var(--text-muted,#888);font-size:12px;margin-top:2px;word-break:break-word}
.lsb-badge{display:inline-block;padding:0 5px;border-radius:4px;background:var(--bg,#eee);color:var(--text-muted,#888);font-size:11px;margin-left:6px}
.lsb-badge.is-on{background:var(--success-soft,#e6f6f3);color:var(--success,#3aa08f)}
.lsb-badge.is-err{background:var(--danger-soft,#fdecec);color:var(--danger,#d55)}
.lsb-btn{padding:4px 10px;border:1px solid var(--line,#ddd);border-radius:6px;background:var(--bg,#fafafa);color:var(--text,#222);cursor:pointer;font-size:12px}
.lsb-btn:hover{border-color:var(--brand,#5eaaa0);color:var(--brand,#5eaaa0)}
.lsb-btn.is-primary{background:var(--brand,#5eaaa0);border-color:var(--brand,#5eaaa0);color:#fff}
.lsb-field{display:block;margin-bottom:10px}
.lsb-field>span{display:block;margin-bottom:4px;color:var(--text-muted,#888);font-size:12px}
.lsb-field input[type=text],.lsb-field input[type=number],.lsb-field select,.lsb-field textarea{width:100%;box-sizing:border-box;padding:5px 7px;border:1px solid var(--line,#ddd);border-radius:6px;background:var(--bg,#fff);color:var(--text,#222);font-size:13px}
.lsb-actions{display:flex;gap:8px;justify-content:flex-end;padding:10px 12px;border-top:1px solid var(--line-soft,#eee)}
.lsb-ops{display:inline-flex;gap:6px;align-items:center;margin-left:6px}
.lsb-op{border:0;background:transparent;color:var(--text-muted,#888);cursor:pointer;font-size:12px;padding:1px 4px;border-radius:4px}
.lsb-op:hover{color:var(--brand,#5eaaa0);background:var(--brand-soft,#eef6f5)}
.lsb-empty{color:var(--text-muted,#888);padding:14px 0}
`;
  var UI = class {
    constructor({ title = "LINUX.SB · 氢（RC）", version = "" } = {}) {
      this.title = title;
      this.version = version;
      this._tabs = [];
      this._panel = null;
      this._active = null;
      this._styleDone = false;
      this._toastHost = null;
      this._launcher = null;
    }
    injectStyle(css, id) {
      const key = id || uid("lsb-style");
      if (document.getElementById(key)) return;
      const el = document.createElement("style");
      el.id = key;
      el.textContent = css;
      document.head.appendChild(el);
    }
    ensureBase() {
      if (this._styleDone) return;
      this.injectStyle(CSS, "lsb-base-style");
      this._styleDone = true;
    }
    /* ─────────── toast ─────────── */
    toast(message, { type = "info", title = "", timeout = 2600 } = {}) {
      this.ensureBase();
      if (!this._toastHost) {
        this._toastHost = document.createElement("div");
        this._toastHost.className = "lsb-toast-host";
        document.body.appendChild(this._toastHost);
      }
      const el = document.createElement("div");
      el.className = `lsb-toast${type === "error" ? " is-err" : type === "success" ? " is-ok" : ""}`;
      el.innerHTML = `${title ? `<div class="lsb-toast-title">${esc(title)}</div>` : ""}<div>${esc(message)}</div>`;
      this._toastHost.appendChild(el);
      requestAnimationFrame(() => el.classList.add("is-in"));
      const close = () => {
        el.classList.remove("is-in");
        setTimeout(() => el.remove(), 200);
      };
      if (timeout) setTimeout(close, timeout);
      el.addEventListener("click", close);
      return close;
    }
    confirm(message, { title = "确认" } = {}) {
      return new Promise((resolve) => {
        this.ensureBase();
        const mask = document.createElement("div");
        mask.className = "lsb-mask";
        const box = document.createElement("div");
        box.className = "lsb-panel";
        box.style.width = "min(400px,92vw)";
        box.innerHTML = `
        <div class="lsb-panel-head"><strong>${esc(title)}</strong></div>
        <div class="lsb-view">${esc(message)}</div>
        <div class="lsb-actions">
          <button class="lsb-btn" data-no>取消</button>
          <button class="lsb-btn is-primary" data-yes>确定</button>
        </div>`;
        const done = (v) => {
          mask.remove();
          box.remove();
          resolve(v);
        };
        box.querySelector("[data-yes]").onclick = () => done(true);
        box.querySelector("[data-no]").onclick = () => done(false);
        mask.onclick = () => done(false);
        document.body.append(mask, box);
      });
    }
    /* ─────────── 设置面板 ─────────── */
    /**
     * 注册一个面板分页。render(container, ctx) 由插件实现。
     * 返回注销函数。
     */
    registerTab({ id, name, order = 100, render }) {
      const tid = id || uid("tab");
      let tab = this._tabs.find((t) => t.id === tid);
      if (tab) {
        tab.name = name;
        tab.order = order;
        tab.render = render;
      } else {
        tab = { id: tid, name, order, render };
        this._tabs.push(tab);
      }
      this._tabs.sort((a, b) => a.order - b.order || a.name.localeCompare(b.name));
      if (this._panel) this._renderTabs();
      return () => {
        this._tabs = this._tabs.filter((t) => t !== tab);
        if (this._panel) this._renderTabs();
      };
    }
    /** 右下角圆形入口按钮 */
    mountLauncher() {
      this.ensureBase();
      if (this._launcher) return;
      const btn = document.createElement("button");
      btn.className = "lsb-launcher";
      btn.type = "button";
      btn.title = this.title;
      btn.textContent = "H";
      btn.onclick = () => this.openPanel();
      document.body.appendChild(btn);
      this._launcher = btn;
    }
    /**
     * 油猴图标菜单项。无 GM_registerMenuCommand 时静默跳过（测试 / 非 TM 环境）。
     * 返回注销函数。
     */
    menuCommand(title, fn) {
      const register = typeof GM_registerMenuCommand === "function" && GM_registerMenuCommand || typeof globalThis.GM_registerMenuCommand === "function" && globalThis.GM_registerMenuCommand;
      if (typeof register !== "function") return () => {
      };
      const id = register(String(title), fn);
      return () => {
        const unreg = typeof GM_unregisterMenuCommand === "function" && GM_unregisterMenuCommand || typeof globalThis.GM_unregisterMenuCommand === "function" && globalThis.GM_unregisterMenuCommand;
        if (typeof unreg === "function" && id != null) {
          try {
            unreg(id);
          } catch {
          }
        }
      };
    }
    openPanel(tabId) {
      this.ensureBase();
      if (this._panel) {
        if (tabId) this.showTab(tabId);
        return;
      }
      const mask = document.createElement("div");
      mask.className = "lsb-mask";
      const panel = document.createElement("div");
      panel.className = "lsb-panel lsb-panel-settings";
      panel.innerHTML = `
      <div class="lsb-panel-head">
        <strong>${esc(this.title)}</strong>
        <span class="lsb-ver">v${esc(this.version)}</span>
        <button class="lsb-panel-close" title="关闭">×</button>
      </div>
      <div class="lsb-panel-body">
        <div class="lsb-tabs"></div>
        <div class="lsb-view"></div>
      </div>`;
      const close = () => this.closePanel();
      panel.querySelector(".lsb-panel-close").onclick = close;
      mask.onclick = close;
      const onKey = (e) => {
        if (e.key === "Escape") close();
      };
      document.addEventListener("keydown", onKey);
      this._panel = { mask, panel, onKey };
      document.body.append(mask, panel);
      this._renderTabs();
      this.showTab(tabId || this._tabs[0]?.id);
    }
    closePanel() {
      if (!this._panel) return;
      document.removeEventListener("keydown", this._panel.onKey);
      this._panel.mask.remove();
      this._panel.panel.remove();
      this._panel = null;
      this._activeTab = null;
    }
    _renderTabs() {
      const host = this._panel?.panel.querySelector(".lsb-tabs");
      if (!host) return;
      host.innerHTML = "";
      for (const t of this._tabs) {
        const b = document.createElement("button");
        b.className = `lsb-tab${t === this._activeTab ? " is-active" : ""}`;
        b.type = "button";
        b.textContent = t.name;
        b.onclick = () => this.showTab(t);
        host.appendChild(b);
      }
    }
    showTab(idOrTab) {
      const byObj = typeof idOrTab === "object" && idOrTab && this._tabs.includes(idOrTab);
      const id = byObj ? idOrTab.id : idOrTab;
      if (!this._panel) return this.openPanel(id);
      const tab = byObj ? idOrTab : this._tabs.find((t) => t.id === id) || this._tabs[0];
      const view = this._panel.panel.querySelector(".lsb-view");
      view.innerHTML = "";
      this._active = tab?.id || null;
      this._activeTab = tab || null;
      this._renderTabs();
      if (!tab) {
        view.innerHTML = '<div class="lsb-empty">还没有插件注册设置页。</div>';
        return;
      }
      try {
        tab.render(view);
      } catch (e) {
        view.innerHTML = `<div class="lsb-empty">面板渲染失败：${esc(e.message)}</div>`;
        console.error("[LSB ui] tab render", e);
      }
    }
    /* ─────────── 表单构建（给插件写设置页省事） ─────────── */
    /**
     * 由 schema 生成表单，onSave 收到完整值对象。
     * schema: { key: { type:'text'|'password'|'number'|'switch'|'select'|'textarea', label, desc, default, options } }
     */
    buildForm(container, schema, values, onSave) {
      const form = document.createElement("div");
      const inputs = {};
      for (const [key, rawSpec] of Object.entries(schema || {})) {
        const spec = typeof rawSpec === "object" && rawSpec ? rawSpec : { default: rawSpec };
        const cur = values?.[key] ?? spec.default;
        const label = document.createElement("label");
        label.className = "lsb-field";
        const span = document.createElement("span");
        span.textContent = spec.label || key;
        label.appendChild(span);
        let input;
        if (spec.type === "switch" || typeof cur === "boolean") {
          input = document.createElement("input");
          input.type = "checkbox";
          input.checked = !!cur;
          label.style.display = "flex";
          label.style.alignItems = "center";
          label.style.gap = "8px";
          label.prepend(input);
          label.removeChild(span);
          const t = document.createElement("span");
          t.textContent = spec.label || key;
          t.style.margin = "0";
          label.appendChild(t);
        } else if (spec.type === "select") {
          input = document.createElement("select");
          for (const opt of spec.options || []) {
            const o = document.createElement("option");
            o.value = typeof opt === "object" ? opt.value : opt;
            o.textContent = typeof opt === "object" ? opt.label : opt;
            if (String(o.value) === String(cur)) o.selected = true;
            input.appendChild(o);
          }
          label.appendChild(input);
        } else if (spec.type === "textarea") {
          input = document.createElement("textarea");
          input.rows = spec.rows || 4;
          input.value = cur ?? "";
          label.appendChild(input);
        } else {
          input = document.createElement("input");
          input.type = spec.type === "number" ? "number" : spec.type === "password" ? "password" : "text";
          input.value = cur ?? "";
          label.appendChild(input);
        }
        if (spec.desc) {
          const d = document.createElement("div");
          d.className = "lsb-row-desc";
          d.textContent = spec.desc;
          label.appendChild(d);
        }
        inputs[key] = { input, spec };
        form.appendChild(label);
      }
      const bar = document.createElement("div");
      bar.style.display = "flex";
      bar.style.gap = "8px";
      bar.style.justifyContent = "flex-end";
      const save = document.createElement("button");
      save.className = "lsb-btn is-primary";
      save.textContent = "保存";
      save.onclick = () => {
        const out = {};
        for (const [k, { input, spec }] of Object.entries(inputs)) {
          out[k] = input.type === "checkbox" ? input.checked : spec.type === "number" ? Number(input.value) : input.value;
        }
        onSave(out);
        this.toast("已保存", { type: "success" });
      };
      bar.appendChild(save);
      container.append(form, bar);
      return inputs;
    }
    /* ─────────── 页面内挂点 ─────────── */
    /** 往某楼层的操作区加按钮（.post-ops 是站点自带的容器） */
    addPostAction(postEl, { label, title, onClick, icon = "" }) {
      const ops = postEl.querySelector(".post-ops");
      if (!ops) return null;
      let host = ops.querySelector(".lsb-ops");
      if (!host) {
        host = document.createElement("span");
        host.className = "lsb-ops";
        ops.appendChild(host);
      }
      const btn = document.createElement("button");
      btn.type = "button";
      btn.className = "lsb-op";
      btn.title = title || label;
      btn.innerHTML = `${icon}${esc(label)}`;
      btn.onclick = (e) => {
        e.preventDefault();
        onClick(e);
      };
      host.appendChild(btn);
      return btn;
    }
    /** 往顶栏加一个链接/按钮 */
    addTopLink({ label, href = "#", onClick, title }) {
      const nav = document.querySelector(".themes-top-menu .forum-nav") || document.querySelector(".forum-nav");
      if (!nav) return null;
      const a = document.createElement("a");
      a.className = "forum-link lsb-top-link";
      a.href = href;
      a.textContent = label;
      if (title) a.title = title;
      if (onClick) {
        a.onclick = (e) => {
          e.preventDefault();
          onClick(e);
        };
      }
      nav.appendChild(a);
      return a;
    }
  };

  // src/dom.js
  var DomWatcher = class {
    constructor(bus) {
      this.bus = bus;
      this._observer = null;
      this._rules = [];
      this._scanCount = 0;
      this._notify = throttle(() => this.bus.emit("dom:changed", null, { source: "core" }), 120);
    }
    get scanCount() {
      return this._scanCount;
    }
    start(root = document.body) {
      if (this._observer || !root) return;
      this._observer = new MutationObserver((records) => this._onMutations(records));
      this._observer.observe(root, { childList: true, subtree: true });
      this._scan(root);
    }
    stop() {
      this._observer?.disconnect();
      this._observer = null;
    }
    _onMutations(records) {
      const posts = /* @__PURE__ */ new Set();
      const items = /* @__PURE__ */ new Set();
      const added = [];
      for (const rec of records) {
        for (const node of rec.addedNodes) {
          if (node.nodeType !== 1) continue;
          if (node.matches?.("li.post-entry")) posts.add(node);
          else if (node.matches?.("li.post-item")) items.add(node);
          for (const el of node.querySelectorAll?.("li.post-entry") || []) posts.add(el);
          for (const el of node.querySelectorAll?.("li.post-item:not(.post-entry)") || []) items.add(el);
          added.push(node);
        }
      }
      this._scanBatch(added);
      if (posts.size) this.bus.emit("dom:posts-added", [...posts], { raw: true, source: "core" });
      if (items.size) this.bus.emit("dom:list-added", [...items], { raw: true, source: "core" });
      if (records.length) this._notify();
    }
    /** 同批兄弟节点只扫父节点一次，避免无限滚动 20 条各扫一遍全部 onEach */
    _scanBatch(nodes) {
      if (!nodes.length) return;
      const byParent = /* @__PURE__ */ new Map();
      const orphans = [];
      for (const node of nodes) {
        const parent = node.parentNode;
        if (parent && parent.nodeType === 1) {
          let bucket = byParent.get(parent);
          if (!bucket) {
            bucket = [];
            byParent.set(parent, bucket);
          }
          bucket.push(node);
        } else {
          orphans.push(node);
        }
      }
      for (const [parent, kids] of byParent) {
        if (kids.length > 1) this._scan(parent);
        else this._scan(kids[0]);
      }
      for (const node of orphans) this._scan(node);
    }
    /**
     * 对匹配 selector 的元素执行 fn，包含未来新增的。
     * fn 只会对同一元素执行一次。
     */
    onEach(selector, fn, { owner = "anonymous" } = {}) {
      const rule = { selector, fn, owner, seen: /* @__PURE__ */ new WeakSet() };
      this._rules.push(rule);
      this._applyRule(rule, document);
      return () => {
        this._rules = this._rules.filter((r) => r !== rule);
      };
    }
    offOwner(owner) {
      this._rules = this._rules.filter((r) => r.owner !== owner);
    }
    _scan(root) {
      this._scanCount++;
      for (const rule of this._rules) this._applyRule(rule, root);
    }
    _applyRule(rule, root) {
      const nodes = [];
      if (root.nodeType === 1 && root.matches?.(rule.selector)) nodes.push(root);
      if (root.querySelectorAll) nodes.push(...root.querySelectorAll(rule.selector));
      for (const el of nodes) {
        if (rule.seen.has(el)) continue;
        rule.seen.add(el);
        try {
          rule.fn(el);
        } catch (e) {
          console.error(`[LSB dom] ${rule.owner} onEach(${rule.selector})`, e);
        }
      }
    }
  };

  // src/channel.js
  var Channel = class {
    constructor(bus, { name = "lsb-base", store = null } = {}) {
      this.bus = bus;
      this.name = name;
      this.store = store;
      this.id = Math.random().toString(36).slice(2, 10);
      this._bc = null;
      this._unsub = null;
      this._seq = 0;
      this._start();
    }
    _start() {
      if (typeof BroadcastChannel === "function") {
        this._bc = new BroadcastChannel(this.name);
        this._bc.onmessage = (ev) => this._dispatch(ev.data);
        return;
      }
      if (typeof GM_addValueChangeListener === "function" && this.store) {
        const key = "__channel";
        const listenKey = `lsb_base:__core:${key}`;
        const id = GM_addValueChangeListener(listenKey, (_k, _old, val, remote) => {
          if (remote) this._dispatch(val);
        });
        this._unsub = () => {
          if (typeof GM_removeValueChangeListener === "function") GM_removeValueChangeListener(id);
        };
        this._fallbackKey = key;
      }
    }
    _dispatch(msg) {
      if (!msg || msg.from === this.id || !msg.plugin) return;
      this.bus.emit(`tab:${msg.plugin}:${msg.event}`, msg.payload, { source: `tab:${msg.from}` });
    }
    post({ plugin, event, payload }) {
      const msg = { plugin, event, payload, from: this.id, ts: Date.now(), seq: ++this._seq };
      if (this._bc) return this._bc.postMessage(msg);
      if (this._fallbackKey && this.store) this.store.set(this._fallbackKey, msg);
    }
    close() {
      this._bc?.close();
      this._unsub?.();
    }
  };

  // src/election.js
  var BEAT_MS = 1e4;
  var LEADER_TIMEOUT_MS = 3e4;
  var ANNOUNCE_THROTTLE_MS = 50;
  var Election = class {
    constructor(tabs, {
      onPromote,
      onDemote,
      jitter = 800,
      id = null,
      beatMs = BEAT_MS,
      leaderTimeoutMs = LEADER_TIMEOUT_MS
    } = {}) {
      this.tabs = tabs;
      this.onPromote = onPromote;
      this.onDemote = onDemote;
      this.jitter = Math.max(0, Number(jitter) || 0);
      this.beatMs = Math.max(200, Number(beatMs) || BEAT_MS);
      this.leaderTimeoutMs = Math.max(this.beatMs * 2, Number(leaderTimeoutMs) || LEADER_TIMEOUT_MS);
      this.id = id || `${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 10)}`;
      this.role = "pending";
      this.lastBeat = Date.now();
      this.lastLeaderBeat = 0;
      this.leaderId = null;
      this._beatTimer = null;
      this._promoteTimer = null;
      this._offBeat = null;
      this._lastAnnounce = 0;
    }
    start() {
      this._offBeat = this.tabs.on("beat", (msg) => this._onBeat(msg));
      this._beatTimer = setInterval(() => {
        this._announce();
        this._maybeElect();
      }, this.beatMs);
      this._beatTimer?.unref?.();
      this._announce();
      this._scheduleElection();
    }
    /** id 较大者让位——确定性且无环，双方独立计算得到同一结论 */
    _yieldsTo(otherId) {
      return String(this.id) > String(otherId);
    }
    _onBeat(msg) {
      const from = msg && msg.id;
      if (!from || from === this.id) return;
      this.lastBeat = Date.now();
      if (msg.role === "leader") {
        this.lastLeaderBeat = Date.now();
        if (this.role === "leader") {
          if (this._yieldsTo(from)) {
            this.leaderId = from;
            this.demote();
          } else {
            this._forceAnnounce();
          }
        } else {
          this.leaderId = from;
          this._cancelElection();
          if (this.role === "pending") this.demote();
        }
        return;
      }
      if (this.role === "leader") this._forceAnnounce();
    }
    _announce() {
      const now = Date.now();
      if (now - this._lastAnnounce < ANNOUNCE_THROTTLE_MS) return;
      this._lastAnnounce = now;
      this.tabs.post("beat", { id: this.id, role: this.role });
    }
    /** 状态刚变化时必须让对端知道，跳过节流 */
    _forceAnnounce() {
      this._lastAnnounce = 0;
      this._announce();
    }
    _maybeElect() {
      if (this.role === "leader") return;
      if (Date.now() - this.lastLeaderBeat <= this.leaderTimeoutMs) return;
      this._scheduleElection();
    }
    /** 抖动后竞选；抖动让并发上位的概率变低，真撞上了由 id 仲裁兜底 */
    _scheduleElection() {
      if (this._promoteTimer) return;
      this._promoteTimer = setTimeout(
        () => {
          this._promoteTimer = null;
          if (this.role === "leader") return;
          if (Date.now() - this.lastLeaderBeat <= this.leaderTimeoutMs) return;
          this.promote();
        },
        this.jitter ? Math.random() * this.jitter : 0
      );
      this._promoteTimer?.unref?.();
    }
    _cancelElection() {
      if (!this._promoteTimer) return;
      clearTimeout(this._promoteTimer);
      this._promoteTimer = null;
    }
    promote() {
      if (this.role === "leader") return;
      this.role = "leader";
      this.leaderId = this.id;
      this._forceAnnounce();
      try {
        this.onPromote?.();
      } catch (e) {
        console.error("[LSB election] onPromote", e);
      }
    }
    demote() {
      if (this.role === "follower") return;
      this.role = "follower";
      this._forceAnnounce();
      try {
        this.onDemote?.();
      } catch (e) {
        console.error("[LSB election] onDemote", e);
      }
    }
    stop() {
      clearInterval(this._beatTimer);
      this._beatTimer = null;
      this._cancelElection();
      this._offBeat?.();
      this._offBeat = null;
    }
    get isLeader() {
      return this.role === "leader";
    }
    /** 调试快照 */
    state() {
      return {
        id: this.id,
        role: this.role,
        leaderId: this.leaderId,
        sinceLeaderBeat: this.lastLeaderBeat ? Date.now() - this.lastLeaderBeat : null,
        beatMs: this.beatMs,
        leaderTimeoutMs: this.leaderTimeoutMs
      };
    }
  };

  // src/core.js
  var VERSION = "0.1.22";
  var PERMISSIONS = {
    read: "读取页面结构与站内 GET 请求",
    write: "代表当前用户发起写操作（回复/点赞/收藏等）",
    storage: "持久化自己的数据",
    ui: "注册面板、注入界面元素",
    net: "访问站外域名（需脚本自身 @connect）",
    admin: "全库数据导出/导入（数据主权，仅迁移类工具应申请）",
    events: "订阅与广播事件"
  };
  var DEFAULT_PERMISSIONS = ["read", "storage", "ui", "events"];
  var IDEMPOTENT_METHODS = /* @__PURE__ */ new Set(["GET", "HEAD", "OPTIONS"]);
  function isIdempotent(method) {
    return IDEMPOTENT_METHODS.has(String(method || "GET").toUpperCase());
  }
  var PluginRecord = class {
    constructor(manifest, setup) {
      this.id = manifest.id;
      this.name = manifest.name || manifest.id;
      this.version = manifest.version || "0.0.0";
      this.author = manifest.author || null;
      this.description = manifest.description || "";
      this.requires = manifest.requires || {};
      this.permissions = manifest.permissions || DEFAULT_PERMISSIONS;
      this.pages = manifest.pages || null;
      this.provides = manifest.provides || [];
      this.configSchema = manifest.config || null;
      this.setup = setup;
      this.state = "registered";
      this.error = null;
      this.disposers = [];
      this.exports = null;
    }
  };
  var Core = class {
    constructor(opts = {}) {
      this.version = VERSION;
      this.ready = false;
      this.debug = !!coreStore.get("debug", false);
      this.plugins = /* @__PURE__ */ new Map();
      this._logs = [];
      this.bus = new Bus({
        onError: (e, info) => this._onPluginError(info.owner, e, `event ${info.event}`)
      });
      this.net = new Net({
        rate: coreStore.get("rate", 900),
        log: (m) => this.log("net", m),
        gmRequest: typeof GM_xmlhttpRequest === "function" ? GM_xmlhttpRequest : null
      });
      this.actions = new Actions(this.net);
      this.ui = new UI({ title: "LINUX.SB · 氢（RC）", version: VERSION });
      this.dom = new DomWatcher(this.bus);
      this.site = site_exports;
      this.channel = null;
      this.snapshot = null;
      this._opts = opts;
      this._bootOff = [];
      this._errs = coreStore.get("errorlog", []) || [];
    }
    /* ─────────── 日志 ─────────── */
    log(scope, ...args) {
      const line = { ts: Date.now(), scope, args: args.map((a) => typeof a === "string" ? a : safeStr(a)) };
      this._logs.push(line);
      if (this._logs.length > 500) this._logs.shift();
      if (this.debug) console.log(`%c[LSB:${scope}]`, "color:#5eaaa0", ...args);
    }
    logs() {
      return [...this._logs];
    }
    /** 持久化错误日志（跨页面留存，最近 200 条） */
    errors() {
      return [...this._errs];
    }
    clearErrors() {
      this._errs = [];
      coreStore.set("errorlog", []);
      this.bus.emit("core:errors-cleared", null, { source: "core" });
    }
    /**
     * 错误入账：2 秒内同源同类合并计数防风暴；写存储持久化；广播供日志面板实时刷新。
     * entry: { kind, id?, phase?, msg, stack?, where? }
     */
    _pushErr(entry) {
      if (this._inErrEmit) return;
      const e = { t: Date.now(), page: this.snapshot?.page?.type || "?", n: 1, ...entry };
      const dup = this._errs.find(
        (x) => x.kind === e.kind && x.id === e.id && x.msg === e.msg && e.t - x.t < 2e3
      );
      if (dup) {
        dup.n++;
        dup.t = e.t;
      } else {
        this._errs.unshift(e);
        if (this._errs.length > 200) this._errs.length = 200;
      }
      try {
        coreStore.set("errorlog", this._errs);
      } catch {
      }
      this._inErrEmit = true;
      try {
        this.bus.emit("core:error-logged", { ...e }, { source: "core" });
        this.bus.emit(
          "plugin:error",
          { id: e.id || e.kind, phase: e.phase || e.kind, message: e.msg },
          { source: "core" }
        );
      } finally {
        this._inErrEmit = false;
      }
      if (this.debug) console.error(`%c[LSB:${e.kind}]`, "color:#d55", e);
    }
    /* ─────────── 启动 ─────────── */
    boot() {
      if (this.ready) return this;
      this.snapshot = snapshot(document, location);
      this._sealSnapshot();
      this.net.setCsrf(this.snapshot.csrf);
      this.channel = new Channel(this.bus, { store: coreStore });
      this.dom.start(document.body);
      this.ui.ensureBase();
      if (coreStore.get("launcher", true)) this.ui.mountLauncher();
      this._registerCoreTabs();
      this._bootOff = [];
      const onErr = (ev) => {
        const msg0 = String(ev.message || "");
        if (/^ResizeObserver loop/i.test(msg0)) return;
        this._pushErr({
          kind: "uncaught",
          msg: String(ev.message || ev.error && ev.error.message || "unknown error"),
          stack: String(ev.error && ev.error.stack || "").slice(0, 400),
          where: (ev.filename || "") + ":" + (ev.lineno || 0)
        });
      };
      const onRej = (ev) => {
        const r = ev.reason;
        this._pushErr({
          kind: "rejection",
          msg: String(r && r.message || r || "unknown rejection"),
          stack: String(r && r.stack || "").slice(0, 400)
        });
      };
      window.addEventListener("error", onErr);
      window.addEventListener("unhandledrejection", onRej);
      this._bootOff.push(() => window.removeEventListener("error", onErr));
      this._bootOff.push(() => window.removeEventListener("unhandledrejection", onRej));
      this.bus.on(
        "core:error-logged",
        () => {
          if (this.ui._panel && this.ui._active === "__core_logs") {
            const host = this.ui._panel.panel.querySelector(".lsb-view");
            if (host) this._renderLogTab(host);
          }
        },
        { owner: "__core" }
      );
      this.ready = true;
      this.log("core", `启动 v${VERSION}`, this.snapshot.page.type, this.snapshot.me.guest ? "访客" : `uid=${this.snapshot.me.uid}`);
      this.bus.emit("site:ready", this.snapshot, { sticky: true, source: "core", raw: true });
      this._activateAll();
      this._watchNavigation();
      return this;
    }
    /** 站点为多页面导航 + 原生无限滚动；这里把 DOM 增量与 URL 变化都归一成事件 */
    _watchNavigation() {
      this.bus.on(
        "dom:posts-added",
        (posts) => {
          const parsed = posts.map((el) => parsePost(el));
          this.bus.emit("topic:posts-added", parsed, { source: "core", raw: true });
        },
        { owner: "__core" }
      );
      this._watchUrl();
    }
    /**
     * URL 追踪：无限滚动/软导航下 pathname 与 ?p= 会变。
     * 不 patch history（油猴沙箱里改不到页面侧对象），用「事件 + 低频轮询」双保险：
     *   - popstate / hashchange 立即检查
     *   - urlPoll ms 轮询兜底（站点直接改 location 或用未覆盖的 API 时也能追上）
     * 触发时更新 snapshot.page（api.page 保持新鲜）并 emit route:changed。
     */
    _refreshSnapshot() {
      try {
        this.snapshot = snapshot(document, location, this.snapshot);
        this._sealSnapshot();
        this.net.setCsrf(this.snapshot.csrf);
      } catch {
        try {
          if (this.snapshot) this.snapshot.page = detectPage(window.location);
        } catch {
        }
      }
    }
    /** 只冻 me / forums：整份 snapshot 含 DOM 节点，不能冻 */
    _sealSnapshot() {
      const s = this.snapshot;
      if (!s) return;
      if (s.me) deepFreeze(s.me);
      if (s.forums) deepFreeze(s.forums);
    }
    /** pages: 限定的插件随路由启停；无 pages 的插件不受影响 */
    _syncPagePlugins() {
      const type = this.snapshot?.page?.type;
      if (!type) return;
      for (const rec of this.plugins.values()) {
        if (!rec.pages) continue;
        const inScope = rec.pages.includes(type);
        if (rec.state === "active" && !inScope) {
          this._dispose(rec);
          rec.state = "skipped";
          rec.error = `不适用于 ${type} 页`;
          this.log("core", `停用 ${rec.id}：离开 ${rec.pages.join("/")} 页`);
        } else if (rec.state === "skipped" && inScope && !coreStore.get(`disabled:${rec.id}`, false)) {
          rec.state = "registered";
          rec.error = null;
        }
      }
      this._activateAll();
    }
    _watchUrl() {
      let lastHref = window.location.href;
      const check = () => {
        if (window.location.href === lastHref) return;
        lastHref = window.location.href;
        this._refreshSnapshot();
        this.log("core", `路由 → ${this.snapshot.page.type}`, lastHref);
        this.bus.emit("route:changed", { href: lastHref, page: clone(this.snapshot.page) }, { source: "core" });
        this._syncPagePlugins();
      };
      const wins = [window];
      if (typeof unsafeWindow !== "undefined" && unsafeWindow !== window) wins.push(unsafeWindow);
      for (const w of wins) {
        w.addEventListener("popstate", check);
        w.addEventListener("hashchange", check);
        this._bootOff.push(() => {
          w.removeEventListener("popstate", check);
          w.removeEventListener("hashchange", check);
        });
      }
      const iv = Number(coreStore.get("urlPoll", 700));
      if (iv > 0) {
        this._urlTimer = setInterval(check, iv);
        this._urlTimer?.unref?.();
      }
    }
    /** 拆掉基座自身的全局副作用（测试与热重载用；正常页面生命周期不需要） */
    shutdown() {
      if (this._urlTimer) clearInterval(this._urlTimer);
      this._urlTimer = null;
      for (const off of this._bootOff || []) {
        try {
          off();
        } catch {
        }
      }
      this._bootOff = [];
      this.bus.offOwner("__core");
      this.dom.stop();
      this.channel?.close();
      for (const rec of this.plugins.values()) {
        if (rec.state === "active") this._dispose(rec);
      }
      this.ready = false;
    }
    /* ─────────── 插件注册 ─────────── */
    /**
     * @param {object} manifest { id, name, version, requires, permissions, pages, config }
     * @param {(api)=>any} setup 插件主体，返回值作为 exports 供其它插件读取
     */
    register(manifest, setup) {
      if (!manifest || !manifest.id) throw new Error("register: manifest.id 必填");
      if (typeof setup !== "function") throw new Error(`register(${manifest.id}): setup 必须是函数`);
      if (!/^[a-z0-9-]+$/.test(manifest.id)) throw new Error(`register: 非法 id "${manifest.id}"（仅小写字母/数字/连字符）`);
      if (manifest.version && !/^\d+\.\d+\.\d+/.test(manifest.version)) console.warn(`[LSB] 插件 ${manifest.id} 版本号 "${manifest.version}" 不符合 semver`);
      if (manifest.config && typeof manifest.config !== "object") throw new Error(`register(${manifest.id}): config 必须是对象`);
      if (this.plugins.has(manifest.id)) {
        this.log("core", `插件 ${manifest.id} 重复注册，已忽略`);
        return this.plugins.get(manifest.id);
      }
      const rec = new PluginRecord(manifest, setup);
      this.plugins.set(rec.id, rec);
      this.log("core", `注册插件 ${rec.id}@${rec.version}`);
      this.bus.emit("plugin:registered", { id: rec.id, version: rec.version }, { source: "core" });
      this._ensureConfigTab(rec);
      if (this.ready) this._activateAll();
      return rec;
    }
    /**
     * 有 config schema 的插件，设置页在 register 时就挂上。
     * pages 限定插件在非适用页是 skipped、setup 不会跑，但 API Key 这类配置
     * 必须在首页也能改，不能逼用户先进帖子。
     */
    _ensureConfigTab(rec) {
      if (!rec.configSchema || rec._configTabReady) return;
      rec._configTabReady = true;
      const store = makeStore(rec.id);
      this.ui.registerTab({
        id: rec.id,
        name: rec.name,
        order: 50,
        render: (host) => {
          if (!rec.configSchema) {
            host.innerHTML = '<div class="lsb-empty">该插件未声明配置项。</div>';
            return;
          }
          this.ui.buildForm(host, rec.configSchema, store.config(rec.configSchema), (v) => {
            store.saveConfig(v);
            this.bus.emit(`config:changed:${rec.id}`, v, { source: "core" });
          });
        }
      });
    }
    /** 反复扫描直到没有新插件能被激活（解决插件间依赖顺序问题） */
    _activateAll() {
      let progressed = true;
      while (progressed) {
        progressed = false;
        for (const rec of this.plugins.values()) {
          if (rec.state !== "registered") continue;
          const verdict = this._canActivate(rec);
          if (verdict.ok) {
            this._activate(rec);
            progressed = true;
          } else if (verdict.fatal) {
            rec.state = verdict.state;
            rec.error = verdict.reason;
            this.log("core", `跳过 ${rec.id}：${verdict.reason}`);
            progressed = true;
          }
        }
      }
      const pending = [...this.plugins.values()].filter((r) => r.state === "registered");
      if (pending.length) {
        const waitingIds = new Set(pending.map((r) => r.id));
        for (const rec of pending) {
          const deps = Object.keys(rec.requires.plugins || {});
          if (deps.some((d) => waitingIds.has(d))) {
            rec.state = "error";
            rec.error = `循环依赖（${deps.join(", ")}）`;
            this.log("core", `跳过 ${rec.id}：${rec.error}`);
          }
        }
      }
    }
    _canActivate(rec) {
      if (coreStore.get(`disabled:${rec.id}`, false)) {
        return { ok: false, fatal: true, state: "disabled", reason: "用户已停用" };
      }
      const baseRange = rec.requires.base;
      if (baseRange && !satisfies(VERSION, baseRange)) {
        return { ok: false, fatal: true, state: "error", reason: `需要基座 ${baseRange}，当前 ${VERSION}` };
      }
      if (rec.pages && !rec.pages.includes(this.snapshot.page.type)) {
        return { ok: false, fatal: true, state: "skipped", reason: `不适用于 ${this.snapshot.page.type} 页` };
      }
      for (const [dep, range] of Object.entries(rec.requires.plugins || {})) {
        const d = this.plugins.get(dep);
        if (!d) return { ok: false, fatal: false, reason: `等待依赖 ${dep}` };
        if (d.state === "error" || d.state === "disabled" || d.state === "skipped") {
          return { ok: false, fatal: true, state: "error", reason: `依赖 ${dep} 不可用（${d.state}）` };
        }
        if (d.state !== "active") return { ok: false, fatal: false, reason: `等待依赖 ${dep} 激活` };
        if (range && !satisfies(d.version, range)) {
          return { ok: false, fatal: true, state: "error", reason: `依赖 ${dep} 需要 ${range}，实际 ${d.version}` };
        }
      }
      return { ok: true };
    }
    _activate(rec) {
      const api = this._makeApi(rec);
      try {
        rec.exports = rec.setup(api) || null;
        rec.state = "active";
        this.log("core", `激活 ${rec.id}`);
        this.bus.emit("plugin:activated", { id: rec.id, version: rec.version }, { source: "core" });
      } catch (e) {
        rec.state = "error";
        rec.error = e.message;
        this._onPluginError(rec.id, e, "setup");
        this._dispose(rec);
      }
    }
    _dispose(rec) {
      for (const fn of rec.disposers.splice(0)) {
        try {
          fn();
        } catch (e) {
          console.error(`[LSB] ${rec.id} 清理失败`, e);
        }
      }
      this.bus.offOwner(rec.id);
      this.dom.offOwner(rec.id);
    }
    disable(id) {
      const rec = this.plugins.get(id);
      if (!rec) return false;
      coreStore.set(`disabled:${id}`, true);
      this._dispose(rec);
      rec.state = "disabled";
      this.bus.emit("plugin:disabled", { id }, { source: "core" });
      return true;
    }
    enable(id) {
      coreStore.del(`disabled:${id}`);
      const rec = this.plugins.get(id);
      if (!rec) return false;
      if (rec.state === "disabled") {
        rec.state = "registered";
        rec.error = null;
        this._activateAll();
      }
      return true;
    }
    _onPluginError(owner, err, phase) {
      this.log("error", `${owner} @ ${phase}: ${err?.message || err}`);
      console.error(`[LSB] 插件 ${owner} 在 ${phase} 出错`, err);
      this._pushErr({
        kind: "plugin-error",
        id: owner,
        phase,
        msg: String(err && err.message || err),
        stack: String(err && err.stack || "").slice(0, 400)
      });
    }
    /* ─────────── 插件 API（每插件一份，带权限校验与自动清理） ─────────── */
    _makeApi(rec) {
      const core = this;
      const has = (p) => rec.permissions.includes(p);
      const need = (p, what) => {
        if (!has(p)) throw new Error(`插件 ${rec.id} 未声明 '${p}' 权限，无法 ${what}`);
      };
      const own = (fn) => {
        rec.disposers.push(fn);
        return fn;
      };
      const store = makeStore(rec.id);
      const api = {
        base: { version: VERSION, id: rec.id, debug: core.debug },
        /** 页面快照（只读） */
        get page() {
          return core.snapshot.page;
        },
        get me() {
          return core.snapshot.me;
        },
        get forums() {
          return core.snapshot.forums;
        },
        get snapshot() {
          return core.snapshot;
        },
        /* 事件 */
        on(event, fn) {
          need("events", "订阅事件");
          const off = core.bus.on(event, fn, { owner: rec.id });
          own(off);
          return off;
        },
        once(event, fn) {
          need("events", "订阅事件");
          const off = core.bus.once(event, fn, { owner: rec.id });
          own(off);
          return off;
        },
        emit(event, payload, opts) {
          need("events", "广播事件");
          return core.bus.emit(`plugin:${rec.id}:${event}`, payload, { ...opts, source: rec.id });
        },
        /** 广播到全局命名空间（需明确事件名，用于公共约定事件如 'topic:scored'） */
        emitGlobal(event, payload, opts) {
          need("events", "广播事件");
          return core.bus.emit(event, payload, { ...opts, source: rec.id });
        },
        /** 提供能力给其它插件调用 */
        handle(name, fn) {
          need("events", "注册 RPC");
          const off = core.bus.handle(name, fn, { owner: rec.id });
          own(off);
          return off;
        },
        request(name, payload, opts) {
          need("events", "调用 RPC");
          return core.bus.request(name, payload, opts);
        },
        hasHandler: (name) => core.bus.hasHandler(name),
        /** 读取另一插件的 exports（依赖需在 manifest.requires.plugins 声明） */
        plugin(id) {
          if (!(rec.requires.plugins || {})[id] && id !== rec.id) {
            throw new Error(`插件 ${rec.id} 未在 requires.plugins 声明依赖 ${id}`);
          }
          return core.plugins.get(id)?.exports ?? null;
        },
        /* 存储 */
        store: {
          get: (k, d) => (need("storage", "读取存储"), store.get(k, d)),
          set: (k, v) => (need("storage", "写入存储"), store.set(k, v)),
          del: (k) => (need("storage", "删除存储"), store.del(k)),
          update: (k, fn, d) => (need("storage", "更新存储"), store.update(k, fn, d)),
          keys: () => (need("storage", "列出存储"), store.keys()),
          clear: () => (need("storage", "清空存储"), store.clear()),
          watch: (fn) => {
            need("storage", "监听存储");
            return own(store.watch(fn));
          }
        },
        /** 配置：读一次得到合并默认值的对象，save 后触发 config:changed */
        config: () => {
          need("storage", "读取配置");
          return store.config(rec.configSchema || {});
        },
        saveConfig: (patch) => {
          need("storage", "保存配置");
          const v = store.saveConfig(patch);
          core.bus.emit(`config:changed:${rec.id}`, v, { source: "core" });
          return v;
        },
        /* 网络（读） */
        net: {
          doc: (path, opts) => (need("read", "发起站内请求"), core.net.doc(path, opts)),
          json: (path, opts) => (need("read", "发起站内请求"), core.net.json(path, opts)),
          /**
           * 底层请求。权限判定按「去向 + 方法」双轴：
           *   站外任意方法   → net（脚本自身还需 @connect）
           *   站内非幂等方法 → write（POST/PUT/PATCH/DELETE 会改动站点状态）
           *   站内 GET/HEAD  → read
           * 补 write 这一档是因为：只有 read 却能 POST /reply_edit，
           * 等于绕开 api.actions 的权限门——写操作必须一视同仁。
           */
          raw: (path, opts) => {
            const external = opts?.external;
            if (external || !core.net.isSameOrigin(path)) {
              need("net", "访问站外域名");
            } else if (!isIdempotent(opts?.method)) {
              need("write", `对站内发起 ${String(opts?.method || "GET").toUpperCase()} 请求`);
            } else {
              need("read", "发起站内请求");
            }
            return core.net.raw(path, opts);
          },
          /** 分页抓取：await for (const doc of api.net.pages('/forum/1', 3)) */
          async *pages(pathFn, maxPage = 1) {
            need("read", "发起站内请求");
            for (let p = 1; p <= maxPage; p++) {
              yield { page: p, doc: await core.net.doc(typeof pathFn === "function" ? pathFn(p) : pathFn) };
            }
          }
        },
        /* 站点动作（写） */
        actions: new Proxy(
          {},
          {
            get(_t, key) {
              return (...args) => {
                need("write", `执行写操作 ${String(key)}`);
                const fn = core.actions[key];
                if (typeof fn !== "function") throw new Error(`未知动作 actions.${String(key)}`);
                core.log("action", `${rec.id} → ${String(key)}`, args[0]);
                return fn.apply(core.actions, args);
              };
            }
          }
        ),
        /* 解析器（纯函数，无权限要求） */
        parse: {
          list: parseList,
          listItem: parseListItem,
          topic: parseTopic,
          post: parsePost,
          user: parseUser,
          likeTargets: parseLikeTargets,
          detectPage,
          snapshot
        },
        routes: ROUTES,
        sel: SEL,
        /* UI */
        ui: {
          toast: (msg, opts) => (need("ui", "弹提示"), core.ui.toast(msg, opts)),
          confirm: (msg, opts) => (need("ui", "弹确认框"), core.ui.confirm(msg, opts)),
          style: (css) => (need("ui", "注入样式"), core.ui.injectStyle(css, `lsb-style-${rec.id}`)),
          /** 切换到指定插件 Tab 并重渲染（面板需已打开） */
          showTab: (id) => {
            need("ui", "切换面板页");
            core.ui.showTab(id);
          },
          /** 由 schema 生成表单（onSave 收到完整值对象） */
          buildForm: (host, schema, values, onSave) => {
            need("ui", "生成设置表单");
            return core.ui.buildForm(host, schema, values, onSave);
          },
          tab: (opt) => {
            need("ui", "注册设置页");
            return own(core.ui.registerTab({ id: opt.id || rec.id, name: opt.name || rec.name, order: opt.order, render: opt.render }));
          },
          openPanel: (id) => (need("ui", "打开面板"), core.ui.openPanel(id)),
          /** 油猴扩展图标下的菜单命令；无 GM 时为空操作 */
          menuCommand: (title, fn) => (need("ui", "注册油猴菜单"), core.ui.menuCommand(title, fn)),
          postAction: (postEl, opt) => (need("ui", "注入楼层按钮"), core.ui.addPostAction(postEl, opt)),
          topLink: (opt) => (need("ui", "注入顶栏"), core.ui.addTopLink(opt)),
          /** 由 configSchema 自动生成设置页 */
          configTab: (opt = {}) => {
            need("ui", "注册设置页");
            return core.ui.registerTab({
              id: opt.id || rec.id,
              name: opt.name || rec.name,
              order: opt.order,
              render: (host) => {
                if (!rec.configSchema) {
                  host.innerHTML = '<div class="lsb-empty">该插件未声明配置项。</div>';
                  return;
                }
                core.ui.buildForm(host, rec.configSchema, store.config(rec.configSchema), (v) => api.saveConfig(v));
                if (opt.render) opt.render(host);
              }
            });
          }
        },
        /* 数据主权（admin 权限） */
        admin: {
          /** 全库导出 */
          exportAll: () => {
            need("admin", "导出全部数据");
            const data = {};
            for (const k of rawKeys()) data[k] = rawGet(k);
            return { app: "lsb", version: VERSION, exportedAt: Date.now(), count: Object.keys(data).length, data };
          },
          /** merge=true 时保留现有同名键，默认覆盖 */
          importAll: (payload, opts = {}) => {
            need("admin", "导入全部数据");
            const merge = !!(opts && opts.merge);
            if (!payload || payload.app !== "lsb" || typeof payload.data !== "object") {
              throw new Error("备份文件格式不正确（缺少 app/data 字段）");
            }
            let imported = 0;
            let skipped = 0;
            for (const [k, v] of Object.entries(payload.data)) {
              if (!k.startsWith(RAW_PREFIX)) continue;
              if (merge && rawGet(k) !== void 0) {
                skipped++;
                continue;
              }
              rawSet(k, v);
              imported++;
            }
            return { imported, skipped };
          }
        },
        /* DOM */
        dom: {
          each: (selector, fn) => {
            need("read", "监听 DOM");
            return own(core.dom.onEach(selector, fn, { owner: rec.id }));
          },
          posts: () => [...document.querySelectorAll(SEL.postEntry)],
          items: () => [...document.querySelectorAll(SEL.listItems)]
        },
        /* 跨标签页 */
        tabs: {
          post: (event, payload) => {
            need("events", "跨标签广播");
            core.channel?.post({ plugin: rec.id, event, payload });
          },
          on: (event, fn) => {
            need("events", "跨标签订阅");
            return own(core.bus.on(`tab:${rec.id}:${event}`, fn, { owner: rec.id }));
          }
        },
        /* 选主（跨标签单例） */
        election: (opts = {}) => {
          need("events", "参与选主");
          const el = new Election(api.tabs, {
            onPromote: opts.onPromote,
            onDemote: opts.onDemote,
            jitter: opts.jitter ?? 800,
            // 身份取自跨标签通道的实例 id：同一标签内多个模块各自选主互不干扰，
            // 而跨标签比较时又稳定唯一（仲裁靠它比大小）。
            id: core.channel?.id ? `${core.channel.id}:${rec.id}` : void 0,
            beatMs: opts.beatMs,
            leaderTimeoutMs: opts.leaderTimeoutMs
          });
          el.start();
          own(() => el.stop());
          return el;
        },
        /* 工具 */
        util: { esc, num, text, sleep, throttle, clone, satisfies },
        log: (...a) => core.log(rec.id, ...a),
        /** 记录本模块的错误 → 持久化到基座错误日志（面板「运行日志」可见） */
        error: (msg) => {
          const e = msg instanceof Error ? msg : new Error(String(msg));
          core._pushErr({
            kind: "module-error",
            id: rec.id,
            msg: String(e.message),
            stack: String(e.stack || "").slice(0, 400)
          });
        },
        /** 主动打点：非错误的运行时事件（持久化，便于事后回溯） */
        track: (event, detail) => {
          core._pushErr({ kind: "track", id: rec.id, msg: event + (detail ? " · " + String(detail) : "") });
        },
        /** 注册清理逻辑（插件被停用时调用） */
        onDispose: (fn) => own(fn)
      };
      return api;
    }
    /* ─────────── 核心自带面板 ─────────── */
    _registerCoreTabs() {
      this.ui.registerTab({
        id: "__core_logs",
        name: "运行日志",
        order: 2,
        render: (host) => this._renderLogTab(host)
      });
      this.ui.registerTab({
        id: "__core_plugins",
        name: "插件",
        order: 0,
        render: (host) => this._renderPluginList(host)
      });
      this.ui.registerTab({
        id: "__core_settings",
        name: "基座设置",
        order: 1,
        render: (host) => {
          const schema = {
            rate: { type: "number", label: "请求最小间隔 (ms)", desc: "所有插件共享同一队列，过低会触发站点限流", default: 900 },
            urlPoll: { type: "number", label: "URL 变化轮询 (ms)", desc: "无限滚动时追踪 ?p= 变化；0 = 只靠 popstate 事件", default: 700 },
            launcher: { type: "switch", label: "显示右下角入口按钮", default: true },
            debug: { type: "switch", label: "调试日志", default: false }
          };
          const cur = {
            rate: coreStore.get("rate", 900),
            urlPoll: coreStore.get("urlPoll", 700),
            launcher: coreStore.get("launcher", true),
            debug: coreStore.get("debug", false)
          };
          this.ui.buildForm(host, schema, cur, (v) => {
            coreStore.set("rate", Math.max(200, Number(v.rate) || 900));
            coreStore.set("urlPoll", Math.max(0, Number(v.urlPoll) || 0));
            coreStore.set("launcher", !!v.launcher);
            coreStore.set("debug", !!v.debug);
            this.net.rate = coreStore.get("rate", 900);
            this.debug = !!v.debug;
          });
          const info = document.createElement("div");
          info.className = "lsb-row-desc";
          info.style.marginTop = "12px";
          info.textContent = `页面：${this.snapshot.page.type} · 站点版本：${this.snapshot.version || "未知"} · 身份：${this.snapshot.me.guest ? "访客" : `${this.snapshot.me.name || "uid " + this.snapshot.me.uid}`} · CSRF：${this.snapshot.csrf ? "已获取" : "无"}`;
          host.appendChild(info);
        }
      });
    }
    /** 运行日志面板：持久化错误 + 实时运行日志，可过滤/搜索/导出 */
    _renderLogTab(host) {
      host.replaceChildren();
      if (!this._logViewState) this._logViewState = { showErr: true, showRun: false, q: "" };
      const st = this._logViewState;
      const fmtT = (t) => new Date(t).toLocaleTimeString("zh-CN");
      const render = () => {
        const errs = this.errors();
        let rows = [];
        if (st.showErr)
          rows.push(
            ...errs.map((e) => ({
              t: e.t,
              lvl: "err",
              who: e.id || e.kind,
              txt: `[${e.kind}${e.phase ? "/" + e.phase : ""}] ${e.msg}${e.n > 1 ? " ×" + e.n : ""} · ${e.page}`,
              tip: [e.stack, e.where].filter(Boolean).join("\n")
            }))
          );
        if (st.showRun)
          rows.push(
            ...this.logs().slice(-200).reverse().map((l) => ({ t: l.ts, lvl: "run", who: l.scope, txt: l.args.join(" "), tip: "" }))
          );
        if (st.q) rows = rows.filter((r) => (r.who + " " + r.txt).toLowerCase().includes(st.q));
        rows.sort((a, b) => b.t - a.t);
        wrap.innerHTML = '<div style="display:flex;gap:8px;align-items:center;margin-bottom:8px;flex-wrap:wrap"><label style="font-size:12px;display:flex;gap:4px;align-items:center"><input type="checkbox" data-e' + (st.showErr ? " checked" : "") + "> 错误 (" + errs.length + ')</label><label style="font-size:12px;display:flex;gap:4px;align-items:center"><input type="checkbox" data-r' + (st.showRun ? " checked" : "") + '> 运行日志</label><input type="search" placeholder="过滤…" data-q value="' + esc(st.q).replace(/"/g, "&quot;") + '" style="flex:1;min-width:120px;padding:4px 7px;border:1px solid var(--line,#ddd);border-radius:6px;background:var(--bg,#fff);color:var(--text,#222)"><button class="lsb-btn" data-export>导出</button><button class="lsb-btn" data-clear>清空错误</button></div><div style="max-height:52vh;overflow:auto;border-top:1px solid var(--line-soft,#eee)">' + (rows.length ? rows.map(
          (r) => '<div class="lsb-row"' + (r.tip ? ' title="' + esc(r.tip).replace(/"/g, "&quot;") + '"' : "") + '><span style="color:var(--text-muted,#888);font-size:11px;min-width:64px">' + fmtT(r.t) + '</span><span class="lsb-badge' + (r.lvl === "err" ? " is-err" : "") + '">' + esc(String(r.who)) + '</span><span style="margin-left:8px;font-size:12px;word-break:break-word">' + esc(r.txt) + "</span></div>"
        ).join("") : '<div class="lsb-empty">暂无记录。</div>') + "</div>";
        wrap.querySelector("[data-e]").onchange = (e) => {
          st.showErr = e.target.checked;
          render();
        };
        wrap.querySelector("[data-r]").onchange = (e) => {
          st.showRun = e.target.checked;
          render();
        };
        wrap.querySelector("[data-q]").oninput = (e) => {
          st.q = e.target.value.toLowerCase();
          render();
        };
        wrap.querySelector("[data-clear]").onclick = async () => {
          if (await this.ui.confirm("清空全部错误记录？")) {
            this.clearErrors();
            render();
          }
        };
        wrap.querySelector("[data-export]").onclick = () => {
          try {
            const blob = new Blob([JSON.stringify({ errors: this.errors(), runLog: this.logs() }, null, 2)], {
              type: "application/json"
            });
            const a = document.createElement("a");
            a.href = URL.createObjectURL(blob);
            a.download = "lsb-logs-" + Date.now() + ".json";
            a.click();
            setTimeout(() => URL.revokeObjectURL(a.href), 4e3);
          } catch (e) {
            this.ui.toast("导出失败：" + e.message, { type: "error" });
          }
        };
      };
      const wrap = document.createElement("div");
      host.appendChild(wrap);
      render();
    }
    _renderPluginList(host) {
      if (!this.plugins.size) {
        host.innerHTML = '<div class="lsb-empty">尚未加载任何插件。安装依附脚本后会自动出现在这里。</div>';
        return;
      }
      for (const rec of this.plugins.values()) {
        const row = document.createElement("div");
        row.className = "lsb-row";
        const stateLabel = { active: "运行中", disabled: "已停用", error: "出错", skipped: "本页不适用", registered: "等待依赖" }[rec.state];
        const cls = rec.state === "active" ? " is-on" : rec.state === "error" ? " is-err" : "";
        row.innerHTML = `
        <div class="lsb-row-main">
          <div class="lsb-row-name">${esc(rec.name)} <span class="lsb-badge">v${esc(rec.version)}</span><span class="lsb-badge${cls}">${esc(stateLabel)}</span></div>
          <div class="lsb-row-desc">${esc(rec.description || rec.id)}${rec.error ? ` · ${esc(rec.error)}` : ""}</div>
          <div class="lsb-row-desc">权限：${esc(rec.permissions.join(" / "))}</div>
        </div>`;
        const btn = document.createElement("button");
        btn.className = "lsb-btn";
        btn.textContent = rec.state === "disabled" ? "启用" : "停用";
        btn.onclick = () => {
          if (rec.state === "disabled") this.enable(rec.id);
          else this.disable(rec.id);
          this.ui.toast("设置已生效，刷新页面后完全应用", { type: "info" });
          host.innerHTML = "";
          this._renderPluginList(host);
        };
        row.appendChild(btn);
        host.appendChild(row);
      }
    }
    /** 对外只读信息，供插件/调试使用 */
    info() {
      return deepFreeze({
        version: VERSION,
        page: this.snapshot?.page,
        plugins: [...this.plugins.values()].map((p) => ({
          id: p.id,
          name: p.name,
          version: p.version,
          state: p.state,
          error: p.error,
          permissions: p.permissions
        })),
        events: this.bus.listEvents(),
        handlers: this.bus.listHandlers()
      });
    }
  };
  function safeStr(v) {
    try {
      return typeof v === "object" ? JSON.stringify(v)?.slice(0, 300) : String(v);
    } catch {
      return String(v);
    }
  }

  // src/shell-boot.js
  var SHELL_BOOT_STYLE_ID = "lsb-shell-boot-style";
  var SHELL_BOOT_CLASS = "lsb-shell-boot";
  var SHELL_BOOT_FRAME_ID = "lsb-shell-boot-frame";
  var BOOT_CSS = `
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
`;
  function shouldShellBoot() {
    if (rawGet("lsb_base:__core:disabled:skin") === true) return false;
    const cfg = rawGet("lsb_base:skin:__config");
    if (cfg && cfg.shell === false) return false;
    return true;
  }
  function ensureBootFrame(doc) {
    const root = doc.documentElement;
    if (!root || doc.getElementById(SHELL_BOOT_FRAME_ID)) return;
    const frame = doc.createElement("div");
    frame.id = SHELL_BOOT_FRAME_ID;
    frame.setAttribute("aria-hidden", "true");
    frame.innerHTML = '<div data-boot="header"></div><div data-boot="rail"></div><div data-boot="aside"></div>';
    root.appendChild(frame);
  }
  function clearShellBoot(doc = document) {
    doc.getElementById(SHELL_BOOT_STYLE_ID)?.remove();
    doc.getElementById(SHELL_BOOT_FRAME_ID)?.remove();
    doc.documentElement?.classList.remove(SHELL_BOOT_CLASS);
  }
  function applyShellBoot(doc = document) {
    const root = doc.documentElement;
    if (!root) return;
    if (!shouldShellBoot()) {
      clearShellBoot(doc);
      return;
    }
    root.classList.add(SHELL_BOOT_CLASS);
    if (!doc.getElementById(SHELL_BOOT_STYLE_ID)) {
      const el = doc.createElement("style");
      el.id = SHELL_BOOT_STYLE_ID;
      el.textContent = BOOT_CSS;
      const parent = doc.head || root;
      parent.insertBefore(el, parent.firstChild);
    }
    ensureBootFrame(doc);
  }
  function watchShellBoot(bus) {
    if (!bus?.on) return;
    const sync = () => applyShellBoot();
    bus.on("config:changed:skin", sync, { owner: "__shell-boot" });
    bus.on("plugin:disabled", sync, { owner: "__shell-boot" });
    bus.on("plugin:activated", sync, { owner: "__shell-boot" });
  }

  // src/entry.js
  function inIframe() {
    try {
      return window.self !== window.top;
    } catch {
      return true;
    }
  }
  if (!inIframe()) applyShellBoot();
  var W = typeof unsafeWindow !== "undefined" ? unsafeWindow : window;
  function install() {
    if (W.LSB && W.LSB.__core) return W.LSB;
    const core = new Core();
    watchShellBoot(core.bus);
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
        return core.register(manifest, setup);
      },
      /** 基座是否就绪（插件通常不需要关心，register 会自动排队） */
      get ready() {
        return core.ready;
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
      bus: core.bus
    };
    const queue = Array.isArray(W.LSB_PLUGINS) ? W.LSB_PLUGINS.slice() : [];
    W.LSB = LSB;
    W.LSB_PLUGINS = {
      push(...items) {
        for (const it of items) applyQueued(LSB, it);
        return 0;
      },
      length: 0
    };
    const start = () => {
      core.boot();
      for (const it of queue) applyQueued(LSB, it);
      W.dispatchEvent(new W.CustomEvent("lsb:ready", { detail: { version: VERSION } }));
    };
    if (document.body) start();
    else document.addEventListener("DOMContentLoaded", start, { once: true });
    return LSB;
  }
  function applyQueued(LSB, item) {
    try {
      if (typeof item === "function") item(LSB);
      else if (item && item.manifest && item.setup) LSB.register(item.manifest, item.setup);
    } catch (e) {
      console.error("[LSB] 排队插件注册失败", e);
    }
  }
  var entry_default = inIframe() ? null : install();
})();
