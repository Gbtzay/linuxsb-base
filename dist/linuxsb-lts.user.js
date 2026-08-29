// ==UserScript==
// @name         LINUX.SB（LTS）
// @name:en      LINUX.SB (LTS)
// @namespace    https://linux.sb/
// @version      1.0.105
// @description  【LTS】一份脚本含基座与精简功能包。请先卸掉「LINUX.SB 氢」和「LINUX.SB 氧」。冻新功能，只修阻断。
// @description:en  [LTS] Base + feature pack in one script. Uninstall Hydrogen and Oxygen first. Feature-frozen.
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


(function () {
  'use strict'
  var W = typeof unsafeWindow !== 'undefined' ? unsafeWindow : window
  try { if (W.self !== W.top) return } catch (e) { return }
  if (W.LSB && W.LSB.__core) {
    var MSG = "请先在油猴里关掉或卸掉「LINUX.SB 氢」和「LINUX.SB 氧」，只留 LINUX.SB（LTS）。"
    var show = function () {
      var d = W.document
      if (!d || !d.documentElement) return
      var el = d.createElement('div')
      el.setAttribute('data-lsb-lts-collision', '1')
      el.textContent = MSG
      el.setAttribute('style', 'position:fixed;z-index:2147483647;right:16px;bottom:16px;max-width:320px;padding:9px 12px;border-radius:8px;background:#fff;color:#222;font-size:13px;box-shadow:0 6px 18px rgba(0,0,0,.18)')
      d.documentElement.appendChild(el)
      W.setTimeout(function () { el.remove() }, 8000)
    }
    if (W.document && W.document.documentElement) show()
    else W.addEventListener('DOMContentLoaded', show, { once: true })
    return
  }
  W.__LSB_CHANNEL__ = 'lts'
  W.__LSB_LTS_VERSION__ = "1.0.105";
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
  function compareVersion(a, b) {
    const pa = parseVersion(a) || [0, 0, 0];
    const pb = parseVersion(b) || [0, 0, 0];
    for (let i = 0; i < 3; i++) {
      if (pa[i] !== pb[i]) return pa[i] < pb[i] ? -1 : 1;
    }
    return 0;
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
    parseNotifications: () => parseNotifications,
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
    invite: "/invite_center",
    inviteLegacy: "/invite_code",
    gacha: "/gacha",
    gachaMarket: "/gacha_market",
    gachaProfile: "/gacha_profile",
    gachaForge: "/gacha_forge_center",
    gachaRecycle: "/gacha_recycle_center",
    gachaRecipes: "/gacha_recipes",
    wallet: "/community_wallet",
    featured: "/topic_featured",
    footprint: "/unread_topic_notice_footprint",
    colorScheme: "/color_scheme",
    keywordFilter: "/home_keyword_filter_settings",
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
    listItems: "ul.post-list > li.post-item:not(.post-entry)",
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
      "/invite_center": "invite",
      "/invite_code": "invite",
      "/forum_list": "forum_list",
      "/search": "search",
      "/donate": "donate",
      "/gacha": "gacha",
      "/gacha_market": "gacha_market",
      "/gacha_profile": "gacha_profile",
      "/gacha_forge_center": "gacha_forge",
      "/gacha_recycle_center": "gacha_recycle",
      "/gacha_recipes": "gacha_recipes",
      "/community_wallet": "wallet",
      "/topic_featured": "featured",
      "/unread_topic_notice_footprint": "footprint",
      "/color_scheme": "color_scheme",
      "/home_keyword_filter_settings": "keyword_filter"
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
    if (li.classList.contains("post-entry")) return null;
    const titleA = li.querySelector("a.post-title:not(.post-author)");
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
  function postLikeCount(li) {
    const likeBtn = li.querySelector("[data-like-coin-action]");
    if (likeBtn) return num(text(li.querySelector(".like-coin-count")));
    const donate = li.querySelector(".donate-topic-reaction-count, [data-donate-topic-like-count]");
    if (donate) {
      const n = num(text(donate));
      if (Number.isFinite(n)) return n;
      return num(donate.getAttribute("data-donate-topic-like-count"));
    }
    return null;
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
      groups: [...li.querySelectorAll(".post-user-group")].filter((g) => !g.classList.contains("gacha-title-post-badge") && !g.classList.contains("user-uid-badge")).map((g) => text(g)).filter((t) => t && !/^UID/.test(t)),
      ts: stamp ? num(stamp.getAttribute("data-performance-time")) : null,
      html: li.querySelector(".post-content")?.innerHTML ?? "",
      content: text(li.querySelector(".post-content")),
      likes: postLikeCount(li),
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
  function parseNotifications(root = document) {
    return [...root.querySelectorAll("li.notification-item")].map((el) => {
      const topicA = el.querySelector('a[href*="/topic/"]');
      const href = topicA ? topicA.getAttribute("href") : "";
      const content = el.querySelector(".notification-content");
      return {
        id: href ? idFrom(href, "topic") : null,
        title: content ? text(content) : text(el),
        href,
        unread: el.classList.contains("unread")
      };
    });
  }
  function parseLikeTargets(doc = document) {
    const coins = [...doc.querySelectorAll("[data-like-coin-action]")].map((btn) => ({
      type: btn.getAttribute("data-like-coin-type"),
      id: num(btn.getAttribute("data-like-coin-id")),
      tiers: (btn.getAttribute("data-like-coin-tiers") || "").split(",").filter(Boolean).map(num),
      liked: btn.getAttribute("data-like-coin-liked") === "1",
      coined: num(btn.getAttribute("data-like-coin-coined")),
      count: num(text(btn.parentElement?.querySelector(".like-coin-count"))),
      el: btn
    }));
    if (coins.length) return coins;
    return [...doc.querySelectorAll("[data-donate-btn]")].map((btn) => {
      const replyRaw = btn.getAttribute("data-donate-reply-id");
      const topicRaw = btn.getAttribute("data-donate-topic-id");
      const id = replyRaw != null && replyRaw !== "" ? num(replyRaw) : num(topicRaw);
      const countEl = btn.querySelector(".donate-topic-reaction-count") || btn;
      return {
        type: "donate",
        id,
        tiers: [],
        liked: null,
        coined: null,
        count: num(text(countEl)),
        el: btn
      };
    });
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
    if (page.type === "home" || page.type === "forum" || page.type === "featured" || page.type === "footprint") {
      snap.list = same && prev.list ? prev.list : parseList(doc);
    }
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
.lsb-mask{position:fixed;inset:0;z-index:99998;background:var(--backdrop,rgba(0,0,0,.45));overscroll-behavior:contain}
.lsb-panel{position:fixed;z-index:99999;left:50%;top:50%;transform:translate(-50%,-50%);width:min(720px,94vw);max-height:82vh;display:flex;flex-direction:column;border:1px solid var(--line,#ddd);border-radius:10px;background:var(--panel,#fff);color:var(--text,#222);font-size:13px;overflow:hidden;overscroll-behavior:contain;box-shadow:0 18px 48px var(--shadow-medium,rgba(0,0,0,.3))}
.lsb-panel-settings{height:min(640px,82vh)}
.lsb-panel-head{display:flex;align-items:center;gap:8px;padding:10px 12px;border-bottom:1px solid var(--line-soft,#eee)}
.lsb-panel-head strong{font-size:14px}
.lsb-panel-head .lsb-ver{color:var(--text-muted,#888);font-size:11px}
.lsb-panel-close{margin-left:auto;border:0;background:transparent;color:var(--text-muted,#888);font-size:18px;cursor:pointer;line-height:1}
.lsb-panel-body{display:flex;min-height:0;flex:1}
.lsb-tabs{flex:0 0 168px;border-right:1px solid var(--line-soft,#eee);overflow:auto;overscroll-behavior:contain;padding:6px}
.lsb-tab{display:block;width:100%;text-align:left;padding:7px 9px;margin-bottom:2px;border:0;border-radius:6px;background:transparent;color:var(--text,#222);cursor:pointer;font-size:13px}
.lsb-tab:hover{background:var(--bg,#f6f6f6)}
.lsb-tab.is-active{background:var(--brand-soft,#e8f4f2);color:var(--brand,#5eaaa0);font-weight:600}
.lsb-view{flex:1;min-width:0;overflow:auto;overscroll-behavior:contain;padding:12px 14px}
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
  function trapOverscroll(root) {
    const onWheel = (e) => {
      const dy = e.deltaY;
      const scroller = e.target?.closest?.(".lsb-view, .lsb-tabs");
      if (scroller && root.contains(scroller)) {
        const top = scroller.scrollTop;
        const max = scroller.scrollHeight - scroller.clientHeight;
        if (dy < 0 && top > 0 || dy > 0 && top < max - 0.5) return;
      }
      e.preventDefault();
    };
    root.addEventListener("wheel", onWheel, { passive: false });
  }
  var UI = class {
    constructor({ title = "LINUX.SB · 氢", version = "" } = {}) {
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
      trapOverscroll(mask);
      trapOverscroll(panel);
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

  // src/check-update.js
  var SCRIPTS = [
    {
      id: "hydrogen",
      gfId: 592914,
      label: "氢",
      installUrl: "https://greasyfork.org/zh-CN/scripts/592914-linux-sb-%E6%B0%A2-beta"
    },
    {
      id: "oxygen",
      gfId: 592915,
      label: "氧",
      installUrl: "https://greasyfork.org/zh-CN/scripts/592915-linux-sb-%E6%B0%A7-beta"
    },
    {
      id: "lts",
      gfId: 593319,
      label: "LTS",
      installUrl: "https://greasyfork.org/zh-CN/scripts/593319-linux-sb-lts"
    }
  ];
  function gfJsonUrl(gfId) {
    return `https://greasyfork.org/zh-CN/scripts/${gfId}.json`;
  }
  function parseStoreScript(json) {
    if (!json || typeof json !== "object") return null;
    const version = typeof json.version === "string" ? json.version.trim() : "";
    if (!version) return null;
    const url = typeof json.url === "string" ? json.url.trim() : "";
    return { version, url };
  }
  function classifyVersion(local, store) {
    if (!parseVersion(local) || !parseVersion(store)) return "invalid";
    const cmp = compareVersion(local, store);
    if (cmp < 0) return "behind";
    if (cmp > 0) return "ahead";
    return "equal";
  }
  function localOxygenVersion(plugins) {
    const suite = (plugins || []).find((p) => p.id === "suite");
    return suite && suite.version ? String(suite.version) : null;
  }
  function installHref(parsed, fallback) {
    return parsed && parsed.url || fallback;
  }
  function hostWindow() {
    if (typeof unsafeWindow !== "undefined") return unsafeWindow;
    if (typeof window !== "undefined") return window;
    return globalThis;
  }
  function isLtsChannel(win = hostWindow()) {
    return !!win && win.__LSB_CHANNEL__ === "lts";
  }
  function ltsDisplayVersion(win = hostWindow()) {
    const v = win && win.__LSB_LTS_VERSION__;
    return typeof v === "string" && v.trim() ? v.trim() : "";
  }

  // src/core.js
  var VERSION = "0.1.36";
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
      this.ui = new UI({
        title: isLtsChannel() ? "LINUX.SB · LTS" : "LINUX.SB · 氢",
        version: isLtsChannel() ? ltsDisplayVersion() || VERSION : VERSION
      });
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
          notifications: parseNotifications,
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
      this.ui.registerTab({
        id: "__core_updates",
        name: "检查更新",
        order: 3,
        render: (host) => this._renderUpdateTab(host)
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
    _renderUpdateTab(host) {
      const wrap = document.createElement("div");
      host.appendChild(wrap);
      let gen = 0;
      let inflight = null;
      const lts = isLtsChannel();
      const scripts = lts ? { lts: SCRIPTS.find((s) => s.id === "lts") } : {
        hydrogen: SCRIPTS.find((s) => s.id === "hydrogen"),
        oxygen: SCRIPTS.find((s) => s.id === "oxygen")
      };
      const snapshot2 = () => {
        if (lts) {
          return { lts: { local: ltsDisplayVersion() || VERSION, missing: false } };
        }
        const ox = localOxygenVersion([...this.plugins.values()]);
        return {
          hydrogen: { local: VERSION, missing: false },
          oxygen: { local: ox, missing: !ox }
        };
      };
      const paint = (states, { busy = false } = {}) => {
        const loc = snapshot2();
        const badgeClass = (status) => {
          if (status === "behind" || status === "fail" || status === "invalid") return "lsb-badge is-err";
          if (status === "equal") return "lsb-badge is-on";
          return "lsb-badge";
        };
        const badgeText = (st) => {
          if (!st || !st.status) return "";
          return {
            behind: "有更新",
            equal: "已是最新",
            ahead: "比商店新",
            missing: "未安装",
            invalid: "版本号无效",
            fail: "查询失败",
            unlisted: ""
          }[st.status] || "";
        };
        const desc = (id, st) => {
          const local = loc[id].local;
          if (!st || !st.status) return local ? `本地 ${local}` : "";
          if (st.status === "missing") return "";
          if (st.status === "unlisted") return "LTS 商店页公布后即可对照";
          if (st.status === "behind" || st.status === "ahead") return `本地 ${local} · 商店 ${st.store}`;
          if (st.status === "equal") return `本地与商店同为 ${local}`;
          if (st.status === "invalid") return [local, st.store].filter(Boolean).join(" · ");
          if (st.status === "fail") {
            if (!st.connect) return "无法读取 Greasy Fork";
            return id === "lts" ? "LTS 需要允许 greasyfork.org 跨域" : "氢需要允许 greasyfork.org 跨域";
          }
          return "";
        };
        const install2 = (id, st) => {
          const script = scripts[id];
          const show = st && (st.status === "behind" || st.status === "missing");
          if (!show) return "";
          const href = st.status === "missing" ? script.installUrl : installHref(st.parsed, script.installUrl);
          return `<a class="lsb-btn is-primary" data-install href="${esc(href)}" target="_blank" rel="noopener noreferrer">打开安装页</a>`;
        };
        const row = (id) => {
          const st = states[id] || (loc[id].missing ? { status: "missing" } : null);
          const local = loc[id].local;
          const bt = badgeText(st);
          const ver = local ? `<span class="lsb-badge">v${esc(local)}</span>` : "";
          const bd = bt ? `<span class="${badgeClass(st.status)}">${esc(bt)}</span>` : "";
          const d = desc(id, st);
          return `<div class="lsb-row" data-script="${id}">
          <div class="lsb-row-main">
            <div class="lsb-row-name">${esc(scripts[id].label)} ${ver}${bd}</div>
            ${d ? `<div class="lsb-row-desc">${esc(d)}</div>` : ""}
          </div>${install2(id, st)}</div>`;
        };
        const rows = lts ? row("lts") : row("hydrogen") + row("oxygen");
        const footer = lts ? "安装仍由油猴接管。请只留 LINUX.SB（LTS），不要同时开氢或氧。" : "安装仍由油猴接管；两个都要装，先氢后氧。";
        wrap.innerHTML = `<div class="lsb-actions" style="border:0;padding:0 0 8px;justify-content:flex-start"><button class="lsb-btn is-primary" type="button" data-check${busy ? " disabled" : ""}>${busy ? "查询中…" : "对照 Greasy Fork"}</button></div>` + rows + `<div class="lsb-row-desc">${footer}</div>`;
        const btn = wrap.querySelector("[data-check]");
        if (btn && !busy) btn.onclick = () => run();
      };
      const loadOne = async (script) => {
        try {
          const json = await this.net.json(gfJsonUrl(script.gfId), { external: true });
          const parsed = parseStoreScript(json);
          if (!parsed) return { error: "read" };
          return { parsed };
        } catch (e) {
          const msg = String(e && e.message || e);
          return { error: /域名未放行|跨域请求被拒绝/.test(msg) ? "connect" : "read" };
        }
      };
      const fromLoad = (res, local) => {
        if (res.status !== "fulfilled") {
          return { status: "fail", connect: false };
        }
        const v = res.value;
        if (v.error === "connect") return { status: "fail", connect: true };
        if (v.error) return { status: "fail", connect: false };
        const status = classifyVersion(local, v.parsed.version);
        return { status, store: v.parsed.version, parsed: v.parsed };
      };
      const run = () => {
        if (lts) {
          const script = scripts.lts;
          if (!script.gfId) {
            paint({ lts: { status: "unlisted" } });
            return;
          }
          if (inflight) return inflight;
          const my2 = ++gen;
          inflight = (async () => {
            paint({}, { busy: true });
            const loc = snapshot2();
            const settled = await Promise.allSettled([loadOne(script)]);
            if (my2 !== gen || !wrap.isConnected) return;
            const states = { lts: fromLoad(settled[0], loc.lts.local) };
            if (states.lts.status === "fail") this.log("core", "检查更新查询失败");
            paint(states);
          })().finally(() => {
            if (inflight && my2 === gen) inflight = null;
          });
          return inflight;
        }
        if (inflight) return inflight;
        const my = ++gen;
        inflight = (async () => {
          paint({ oxygen: snapshot2().oxygen.missing ? { status: "missing" } : null }, { busy: true });
          const loc = snapshot2();
          const jobs = [loadOne(scripts.hydrogen)];
          if (!loc.oxygen.missing) jobs.push(loadOne(scripts.oxygen));
          const settled = await Promise.allSettled(jobs);
          if (my !== gen || !wrap.isConnected) return;
          const hRes = settled[0];
          const states = { hydrogen: fromLoad(hRes, loc.hydrogen.local) };
          if (loc.oxygen.missing) states.oxygen = { status: "missing" };
          else states.oxygen = fromLoad(settled[1], loc.oxygen.local);
          if (states.hydrogen.status === "fail" || states.oxygen.status === "fail") {
            this.log("core", "检查更新查询失败");
          }
          paint(states);
        })().finally(() => {
          if (inflight && my === gen) inflight = null;
        });
        return inflight;
      };
      if (lts) {
        paint(scripts.lts.gfId ? {} : { lts: { status: "unlisted" } });
      } else {
        paint({ oxygen: snapshot2().oxygen.missing ? { status: "missing" } : null });
      }
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

;
/**
 * 示例要点：
 *  1. 标准引导写法 —— 基座未就绪就排队，加载顺序无关
 *  2. manifest 声明权限 / 页面 / 配置项
 *  3. api.handle 对其它脚本暴露 RPC 能力
 *  4. api.dom.each 幂等处理现有 + 未来新增的楼层
 *  5. api.ui.tab 注册基座设置面板里的分页
 */
(function () {
  'use strict'

  const manifest = {
    id: 'floor-stats',
    name: '楼层统计',
    version: '1.0.1',
    description: '统计当前帖各作者楼层数，提供 RPC 与「只看TA」按钮',
    author: 'you',
    requires: { base: '^0.1.0' },
    permissions: ['read', 'storage', 'ui', 'events'],
    pages: ['topic'],
    config: {
      topN: { type: 'number', label: '面板显示前 N 名', default: 10 },
      showButton: { type: 'switch', label: '楼层显示「只看TA」按钮', default: true },
    },
  }

  function setup(api) {
    let cfg = api.config()
    api.on('config:changed:floor-stats', () => {
      cfg = api.config()
    })
    let counts = new Map() // uid → { name, n }

    /** 从快照与增量事件重建统计 */
    function absorb(posts) {
      for (const p of posts || []) {
        if (!p.authorId) continue
        const cur = counts.get(p.authorId) || { uid: p.authorId, name: p.authorName, n: 0 }
        cur.name = p.authorName || cur.name
        cur.n++
        counts.set(p.authorId, cur)
      }
    }
    absorb(api.snapshot?.topic?.posts)

    // 新楼层（AJAX 回复）到达时增量更新
    api.on('topic:posts-added', (posts) => absorb(posts))

    /* ── 给其它脚本的 RPC：await api.request('floorstats:summary') ── */
    api.handle('floorstats:summary', () => ({
      topicId: api.page.id,
      total: [...counts.values()].reduce((s, x) => s + x.n, 0),
      authors: [...counts.values()].sort((a, b) => b.n - a.n),
      generatedAt: Date.now(),
    }))

    /* ── 楼层按钮：只看TA / 取消 ── */
    let focusUid = null
    api.ui.style(`
      li.post-entry.lsb-dim{display:none}
      .lsb-only-btn.is-on{color:var(--brand,#5eaaa0);font-weight:600}
    `)

    function applyFocus() {
      for (const li of document.querySelectorAll(api.sel.topicPosts)) {
        const a = li.querySelector('a[href^="/user/"]')
        const uid = a ? Number((a.getAttribute('href').match(/\/user\/(\d+)/) || [])[1]) : null
        li.classList.toggle('lsb-dim', focusUid != null && uid !== focusUid)
      }
    }

    function wire(li) {
      if (!cfg.showButton) return
      const a = li.querySelector('a[href^="/user/"]')
      if (!a) return
      const uid = Number((a.getAttribute('href').match(/\/user\/(\d+)/) || [])[1])
      const btn = api.ui.postAction(li, {
        label: '只看TA',
        title: `${api.util.text(a)} 的其余楼层将被隐藏`,
        onClick: () => {
          focusUid = focusUid === uid ? null : uid
          btn.textContent = focusUid === uid ? '显示全部' : '只看TA'
          btn.classList.toggle('is-on', focusUid === uid)
          // 同步其它楼层按钮的文案
          document.querySelectorAll('.lsb-only-btn').forEach((b) => {
            if (b !== btn) {
              b.textContent = '只看TA'
              b.classList.remove('is-on')
            }
          })
          applyFocus()
        },
      })
      btn?.classList.add('lsb-only-btn')
    }
    api.dom.each('li.post-entry', wire)

    /* ── 设置面板分页 ── */
    api.ui.tab({
      name: '楼层统计',
      order: 50,
      render(host) {
        const c = cfg
        const sorted = [...counts.values()].sort((a, b) => b.n - a.n)
        const rows = sorted.slice(0, c.topN || 10)
        const totalFloors = sorted.reduce((s, x) => s + x.n, 0)
        if (!rows.length) {
          host.innerHTML = '<div class="lsb-empty">本帖还没有可统计的楼层。</div>'
          return
        }
        const max = rows[0].n
        host.innerHTML = `
          <div class="lsb-row-desc" style="margin-bottom:8px">
            ${api.util.esc(api.snapshot?.topic?.title || '')} · 共 ${totalFloors} 楼 / ${counts.size} 人
          </div>
          ${rows
            .map(
              (r) => `
            <div class="lsb-row">
              <div class="lsb-row-main">
                <div class="lsb-row-name">${api.util.esc(r.name || 'uid ' + r.uid)}
                  <span class="lsb-badge">${r.n} 楼</span>
                </div>
                <div style="height:4px;background:var(--line-soft,#eee);border-radius:2px;margin-top:5px">
                  <div style="width:${Math.round((r.n / max) * 100)}%;height:100%;background:var(--brand,#5eaaa0);border-radius:2px"></div>
                </div>
              </div>
              <a class="lsb-btn" href="${api.routes.user(r.uid)}" target="_blank">主页</a>
            </div>`,
            )
            .join('')}`
      }
    })

    // 配置由面板保存，刷新页面后生效（按钮的挂载是一次性的）

    return {
      /** 其它已声明依赖的脚本也可用 api.plugin('floor-stats').countOf(uid) */
      countOf(uid) {
        return counts.get(uid)?.n ?? 0
      },
    }
  }

  /* ── 标准引导：与基座的加载顺序无关 ── */
  const w = typeof unsafeWindow !== 'undefined' ? unsafeWindow : window
  if (w.LSB && w.LSB.register) {
    w.LSB.register(manifest, setup)
  } else {
    ;(w.LSB_PLUGINS = w.LSB_PLUGINS || []).push({ manifest, setup })
  }
})()

;
(function () {
  'use strict'

  const manifest = {
    id: 'resume-reading',
    name: '断点续读',
    version: '1.0.5',
    description: '记住每帖读到哪层，回来一键续读，未读楼层标 NEW',
    author: 'you',
    requires: { base: '^0.1.0' },
    permissions: ['read', 'storage', 'ui', 'events'],
    pages: ['topic'],
    config: {
      minAsk: { type: 'number', label: '至少读到第几楼才提示续读', default: 3 },
      autoJump: { type: 'switch', label: '同一页时自动跳转（不再弹条）', default: false },
      keepDays: { type: 'number', label: '记录保留天数', default: 120 },
      cap: { type: 'number', label: '最多保存帖子数', default: 500 },
    },
  }

  function setup(api) {
    let cfg = api.config()
    api.on('config:changed:resume-reading', () => {
      cfg = api.config()
    })
    const tidOf = () => api.page.id
    const pageOf = () => api.page.page || 1

    /* ── 存储层：单键 + 容量/时效修剪 ── */
    function loadAll() {
      return api.store.get('positions', {}) || {}
    }
    function prune(all) {
      const deadline = Date.now() - cfg.keepDays * 864e5
      let list = Object.entries(all).filter(([, r]) => r.ts > deadline)
      list.sort((a, b) => b[1].ts - a[1].ts)
      list = list.slice(0, Math.max(50, cfg.cap))
      return Object.fromEntries(list)
    }
    function saveRec(rec, tidArg) {
      const t = tidArg || tidOf()
      const all = loadAll()
      all[t] = { ...(all[t] || {}), ...rec, ts: rec.ts || Date.now() }
      api.store.set('positions', prune(all))
      return all[t]
    }
    function load() {
      return loadAll()[tidOf()] || null
    }

    /* ── 阅读位置追踪 ── */
    let curFloor = 0
    let dirty = false
    const hideTimers = new Set()
    const hiding = new WeakSet()
    const NEW_HIDE_MS = 5000
    const flush = () => {
      if (!dirty) return
      dirty = false
      saveRec({ f: curFloor, p: pageOf(), title: api.snapshot?.topic?.title || '' })
    }
    const flushLater = api.util.throttle(flush, 1200)

    function lastVisibleFloor() {
      let max = 0
      for (const li of document.querySelectorAll('li.post-entry')) {
        const rect = li.getBoundingClientRect?.() || { top: 0, height: 0, width: 0 }
        if (!rect.height && !rect.width) continue
        if (rect.top <= window.innerHeight * 0.72) {
          const f = Number(li.getAttribute('data-floor') || 0)
          if (f > max) max = f
        } else {
          break // DOM 顺序≈视觉顺序，可提前结束；乱序也不会漏（max 取最大）
        }
      }
      return max
    }
    const onScroll = api.util.throttle(() => {
      const f = lastVisibleFloor()
      if (f > curFloor) {
        curFloor = f
        dirty = true
        flushLater()
      }
      if (valid && f > 0) scheduleHideUpTo(f)
    }, 600)

    const onVisibility = () => {
      if (document.hidden) flush()
    }

    /* ── 未读标记 ── */
    const saved = load()
    const valid = saved && saved.f >= (cfg.minAsk || 3)

    api.ui.style(`
      .lsb-new{display:inline-block;margin-left:6px;font-size:10px;font-weight:700;color:#fff;
        background:var(--brand,#5eaaa0);border-radius:4px;padding:1px 5px;vertical-align:middle;line-height:1.3}
      li.post-entry.lsb-flash{background:var(--warning-soft,#fff3d6)!important;transition:background 1.4s ease}
      .lsb-resume-bar{position:fixed;left:50%;transform:translateX(-50%);bottom:64px;z-index:99997;
        display:flex;align-items:center;gap:10px;padding:8px 14px;border-radius:999px;
        background:var(--panel,#fff);border:1px solid var(--line,#ddd);color:var(--text,#222);
        font-size:13px;box-shadow:0 6px 20px var(--shadow-medium,rgba(0,0,0,.2))}
      .lsb-resume-bar .lsb-btn{white-space:nowrap}
    `)

    function newAnchor(li) {
      const uid = [...li.querySelectorAll('.post-user-group')].find(
        (g) => g.classList.contains('user-uid-badge') || /^UID\b/i.test((g.textContent || '').trim()),
      )
      if (uid) return uid
      return li.querySelector('a.post-title.post-author')
    }

    function setUnread(li, unread) {
      li.classList.toggle('lsb-unread', unread)
      let badge = li.querySelector('.lsb-new')
      if (!unread) {
        badge?.remove()
        return
      }
      if (!badge) {
        badge = document.createElement('span')
        badge.className = 'lsb-new'
        badge.textContent = 'NEW'
      }
      const anchor = newAnchor(li)
      if (anchor) {
        if (badge.previousElementSibling !== anchor) anchor.after(badge)
      } else if (!li.contains(badge)) {
        li.appendChild(badge)
      }
    }

    function scheduleHideUpTo(readFloor) {
      for (const li of document.querySelectorAll('li.post-entry.lsb-unread')) {
        const f = Number(li.getAttribute('data-floor') || 0)
        if (!(f > 0) || f > readFloor || hiding.has(li)) continue
        hiding.add(li)
        const t = setTimeout(() => {
          hideTimers.delete(t)
          setUnread(li, false)
        }, NEW_HIDE_MS)
        hideTimers.add(t)
      }
    }

    function markUnread(fromFloor) {
      let n = 0
      for (const li of document.querySelectorAll(api.sel.topicPosts)) {
        const f = Number(li.getAttribute('data-floor') || 0)
        const unread = f > fromFloor
        setUnread(li, unread)
        if (unread) n++
      }
      return n
    }
    // 之后 AJAX 新增的楼层也按已读线标记
    api.dom.each('li.post-entry', (li) => {
      if (!valid) return
      const f = Number(li.getAttribute('data-floor') || 0)
      setUnread(li, f > saved.f)
    })
    let unreadCount = valid ? markUnread(saved.f) : 0
    window.addEventListener('scroll', onScroll, { passive: true })
    window.addEventListener('pagehide', flush)
    document.addEventListener('visibilitychange', onVisibility)
    api.onDispose(() => {
      // 三个监听都要摘：旧实现只摘了 scroll，pagehide/visibilitychange 会在
      // 插件停用后继续写存储。
      window.removeEventListener('scroll', onScroll)
      window.removeEventListener('pagehide', flush)
      document.removeEventListener('visibilitychange', onVisibility)
      for (const t of hideTimers) clearTimeout(t)
      hideTimers.clear()
      flush()
    })
    onScroll()

    /* ── 续读提示条 ── */
    function floorEl(floor) {
      const n = Number(floor)
      if (!Number.isFinite(n) || n <= 0) {
        return (
          document.querySelector('li.post-entry:not([data-floor])')
          || document.querySelector(`${api.sel.postEntry}:first-child`)
          || document.querySelector(api.sel.postEntry)
        )
      }
      return document.querySelector(`${api.sel.postEntry}[data-floor="${n}"]`)
    }

    function jump(floor) {
      const el = floorEl(floor)
      if (!el) {
        api.ui.toast(`#${floor} 楼不在当前页`, { type: 'error' })
        return false
      }
      try {
        el.scrollIntoView({ block: 'center', behavior: 'smooth' })
      } catch {
        /* jsdom 无此方法 */
      }
      el.classList.add('lsb-flash')
      setTimeout(() => el.classList.remove('lsb-flash'), 1800)
      return true
    }

    function dismissBar(bar) {
      bar?.remove()
    }

    if (valid) {
      const samePage = saved.p === pageOf()
      if (samePage && cfg.autoJump) {
        jump(saved.f)
      } else {
        const bar = document.createElement('div')
        bar.className = 'lsb-resume-bar'
        const info = document.createElement('span')
        info.textContent =
          `上次读到 #${saved.f}${unreadCount ? ` · 还有 ${unreadCount} 层没看` : ''}` +
          (samePage ? '' : ` · 在第 ${saved.p} 页`)
        const go = document.createElement('button')
        go.className = 'lsb-btn is-primary'
        go.textContent = samePage ? '接着看' : `去第 ${saved.p} 页`
        go.onclick = () => {
          if (samePage) jump(saved.f)
          else window.location.assign(api.routes.topic(tidOf(), saved.p))
          dismissBar(bar)
        }
        const no = document.createElement('button')
        no.className = 'lsb-btn'
        no.textContent = '忽略'
        no.onclick = () => dismissBar(bar)
        bar.append(info, go, no)
        document.body.appendChild(bar)
        const autoHide = setTimeout(() => dismissBar(bar), 15000) // 15 秒不打扰自动消失
        api.onDispose(() => {
          clearTimeout(autoHide)
          dismissBar(bar)
        })
      }
    }

    /* ── 面板：最近阅读 ── */
    function timeAgo(ts) {
      const s = Math.max(1, (Date.now() - ts) / 1000)
      if (s < 3600) return `${Math.floor(s / 60)} 分钟前`
      if (s < 86400) return `${Math.floor(s / 3600)} 小时前`
      return `${Math.floor(s / 86400)} 天前`
    }

    api.ui.tab({
      name: '阅读历史',
      order: 60,
      render(host) {
        const all = loadAll()
        const rows = Object.entries(all).sort((a, b) => b[1].ts - a[1].ts).slice(0, 30)
        if (!rows.length) {
          host.innerHTML = '<div class="lsb-empty">还没有阅读记录。</div>'
          return
        }
        host.innerHTML = `
          <div class="lsb-row-desc" style="margin-bottom:8px">共 ${Object.keys(all).length} 帖有记录（上限 ${cfg.cap}）</div>
          ${rows
            .map(([id, r]) => `
            <div class="lsb-row">
              <div class="lsb-row-main">
                <a class="lsb-row-name" href="${api.routes.topic(Number(id), r.p || 1)}">${api.util.esc(r.title || '帖子 #' + id)}</a>
                <div class="lsb-row-desc">读到 #${r.f} · ${r.p > 1 ? `第 ${r.p} 页 · ` : ''}${timeAgo(r.ts)}</div>
              </div>
            </div>`)
            .join('')}`
        const clear = document.createElement('button')
        clear.className = 'lsb-btn'
        clear.textContent = '清空全部记录'
        clear.style.marginTop = '10px'
        clear.onclick = async () => {
          if (await api.ui.confirm('确定清空所有阅读记录？不可恢复。')) {
            api.store.set('positions', {})
            api.ui.toast('已清空', { type: 'success' })
            host.innerHTML = ''
            api.ui.showTab('resume-reading')
          }
        }
        host.appendChild(clear)
      },
    })

    /* ── 调试/测试接口 ── */
    api.handle('resume-reading:debug', () => ({
      load,
      saveRec,
      all: loadAll,
      saveFloor: (f) => {
        curFloor = f
        return saveRec({ f, p: pageOf(), title: api.snapshot?.topic?.title || '' })
      },
      barVisible: () => !!document.querySelector('.lsb-resume-bar'),
      markCount: () => markUnread(curFloor || (saved ? saved.f : 0)),
      unreadCount,
      jump,
    }))

    return {}
  }

  const w = typeof unsafeWindow !== 'undefined' ? unsafeWindow : window
  if (w.LSB && w.LSB.register) w.LSB.register(manifest, setup)
  else ;(w.LSB_PLUGINS = w.LSB_PLUGINS || []).push({ manifest, setup })
})()

;
(function () {
  'use strict'

  const manifest = {
    id: 'read-mark',
    name: '已读置灰',
    version: '1.0.4',
    description: '看过的帖子在列表中变灰；未读仍用站点自己的标记',
    author: 'you',
    requires: { base: '^0.1.0' },
    permissions: ['read', 'storage', 'ui', 'events'],
    // 不设 pages：topic 页负责「标记已读」，列表页负责「上色」，两边都要在
    config: {
      dim: {
        type: 'select',
        label: '置灰强度',
        default: '中',
        options: ['轻', '中', '重'],
      },
      keepDays: { type: 'number', label: '记录保留天数', default: 180 },
      cap: { type: 'number', label: '最多保存帖子数', default: 3000 },
    },
  }

  function setup(api) {
    let cfg = api.config()
    api.on('config:changed:read-mark', () => {
      cfg = api.config()
      restyle()
    })

    /* ── 存储层：marks[tid] = { ts: 标记时间, w: 水位线(楼层最大ts), r: 标记时回复数 } ── */
    function loadAll() {
      return api.store.get('marks', {}) || {}
    }
    function save(all) {
      api.store.set('marks', prune(all))
    }
    function prune(all) {
      const deadline = Date.now() - cfg.keepDays * 864e5
      let list = Object.entries(all).filter(([, r]) => r.ts > deadline)
      list.sort((a, b) => b[1].ts - a[1].ts)
      list = list.slice(0, Math.max(100, cfg.cap))
      return Object.fromEntries(list)
    }
    /** 记录/更新已读：w 只增不减；r 为 null 表示保持原值 */
    function markSeen(tid, w, r) {
      if (tid == null) return null
      const all = loadAll()
      const prev = all[tid] || {}
      const rec = {
        ts: Date.now(),
        w: Math.max(prev.w || 0, w || 0),
        r: r != null ? r : prev.r,
      }
      all[tid] = rec
      save(all)
      return rec
    }

    /* ── 标记侧：帖子页打开即视为已读（壳内跳转也走 route:changed，不能只在 setup 时记一次） ── */
    function markOpenTopic() {
      if (api.page.type !== 'topic') return
      const tid = api.page.id
      let topic = null
      try {
        topic = api.parse.topic(document)
      } catch {
        /* 解析失败退回启动快照 */
      }
      if (!topic) topic = api.snapshot?.topic || null
      const floorTs = (topic?.posts || []).map((p) => p.ts || 0)
      markSeen(tid, Math.max(0, ...floorTs), topic?.replies != null ? topic.replies : null)
    }

    markOpenTopic()
    api.on('topic:posts-added', (posts) => {
      if (api.page.type !== 'topic' || !posts.length) return
      const tid = api.page.id
      const all = loadAll()
      const prev = all[tid]
      markSeen(
        tid,
        Math.max(0, ...posts.map((p) => p.ts || 0)),
        prev && prev.r != null ? prev.r + posts.length : null,
      )
    })

    /* ── 上色侧：列表页把看过的条目变灰 ── */
    const DIM = { 轻: 0.7, 中: 0.55, 重: 0.35 }

    function restyle() {
      const id = 'lsb-read-mark-style'
      let el = document.getElementById(id)
      if (!el) {
        el = document.createElement('style')
        el.id = id
        document.head.appendChild(el)
      }
      el.textContent = `
        li.post-item.lsb-seen{opacity:${DIM[cfg.dim] ?? 0.55}}
        li.post-item.lsb-seen .post-title{color:var(--text-soft,#6b7280)}
        li.post-item.lsb-seen img{filter:grayscale(.8)}
      `
    }
    restyle()

    function paint(li) {
      const it = api.parse.listItem(li)
      if (!it || !it.id) return
      const rec = loadAll()[it.id]
      if (!rec) return
      li.classList.add('lsb-seen')
    }

    function paintAll() {
      for (const li of document.querySelectorAll(api.sel?.listItems || 'ul.post-list > li.post-item:not(.post-entry)')) {
        paint(li)
      }
    }

    // 现有 + 无限滚动新增的条目各回调一次（幂等）
    api.dom.each(api.sel?.listItems || 'ul.post-list > li.post-item:not(.post-entry)', paint)
    // 软导航后 DOM 可能被整段换掉：记账 + 全量重涂
    api.on('route:changed', () => {
      markOpenTopic()
      setTimeout(paintAll, 50)
    })

    /* ── 面板：设置表单（自动生成）+ 统计与清空 ── */
    api.ui.configTab({
      name: '已读置灰',
      order: 40,
      render(host) {
        const all = loadAll()
        const total = Object.keys(all).length
        host.insertAdjacentHTML('beforeend', '<div style="height:10px"></div>')
        const info = document.createElement('div')
        info.className = 'lsb-row-desc'
        info.style.marginBottom = '10px'
        info.textContent = `本地已记录 ${total} 帖。置灰只改外观，未读仍用站点自己的标记。`
        host.appendChild(info)

        const clear = document.createElement('button')
        clear.className = 'lsb-btn'
        clear.textContent = '清空全部已读记录（全部恢复原色）'
        clear.onclick = async () => {
          if (await api.ui.confirm('清空全部已读记录？列表将恢复未读外观。')) {
            api.store.set('marks', {})
            paintAll()
            api.ui.showTab('read-mark')
          }
        }
        host.appendChild(clear)
      },
    })

    /* ── 调试接口（测试 / 年度报告聚合用） ── */
    api.handle('read-mark:debug', () => ({
      all: loadAll,
      seen: (id) => !!loadAll()[Number(id)],
      rec: (id) => loadAll()[Number(id)] || null,
      mark: (id, w, r) => markSeen(Number(id), w, r),
      forget: (id) => {
        const a = loadAll()
        delete a[Number(id)]
        save(a)
      },
      clear: () => api.store.set('marks', {}),
    }))

    return {}
  }

  const w = typeof unsafeWindow !== 'undefined' ? unsafeWindow : window
  if (w.LSB && w.LSB.register) w.LSB.register(manifest, setup)
  else ;(w.LSB_PLUGINS = w.LSB_PLUGINS || []).push({ manifest, setup })
})()

;
(function () {
  'use strict'

  const KEY = 'lsb_base:home-return:target'
  const MAX_PAGES = 20

  const manifest = {
    id: 'home-return',
    name: '首页回位',
    version: '1.0.1',
    description: '回首页时滚到上次点进的那条帖；回成功一次后刷新不再跳',
    author: 'you',
    requires: { base: '^0.1.0' },
    permissions: ['read', 'storage', 'ui', 'events'],
    config: {
      enabled: { type: 'switch', label: '回首页时回到上次点进的帖', default: true },
    },
  }

  function setup(api) {
    let cfg = api.config()
    api.on('config:changed:home-return', () => {
      cfg = api.config()
    })

    let scheduled = 0
    let inflight = null
    const watches = new Set()

    function topicIdFrom(href) {
      const m = String(href || '').match(/\/topic\/(\d+)/)
      return m ? Number(m[1]) : 0
    }

    function onHome() {
      try {
        return api.parse.detectPage(location).type === 'home'
      } catch {
        return api.page.type === 'home'
      }
    }

    function read() {
      try {
        const rec = JSON.parse(sessionStorage.getItem(KEY) || 'null')
        if (!rec || !Number.isFinite(rec.tid) || rec.tid <= 0) return null
        return rec
      } catch {
        return null
      }
    }

    function write(tid, offset) {
      try {
        sessionStorage.setItem(KEY, JSON.stringify({ tid, offset, ts: Date.now() }))
      } catch {
        /* 隐私模式可能写不了 */
      }
    }

    function clear() {
      try {
        sessionStorage.removeItem(KEY)
      } catch {
        /* ignore */
      }
    }

    function findItem(tid) {
      for (const li of document.querySelectorAll(api.sel.listItems)) {
        if (topicIdFrom(li.querySelector('a.post-title')?.getAttribute('href')) === tid) return li
      }
      return null
    }

    function applyScroll(li, offset) {
      const top = li.getBoundingClientRect().top + (window.scrollY || window.pageYOffset || 0)
      const y = Math.max(0, top - (Number.isFinite(offset) ? offset : 0))
      try {
        window.scrollTo(0, y)
      } catch {
        /* jsdom 视口 */
      }
    }

    function pagePath(p) {
      const url = new URL(location.href)
      url.searchParams.set('p', String(p))
      return `${url.pathname}${url.search}`
    }

    async function loadNext(page) {
      const doc = await api.net.doc(pagePath(page))
      const ul = document.querySelector(api.sel.listUl)
      if (!ul) return 0
      const seen = new Set(
        [...ul.querySelectorAll(api.sel.listItems)].map((li) =>
          topicIdFrom(li.querySelector('a.post-title')?.getAttribute('href')),
        ),
      )
      let added = 0
      for (const li of doc.querySelectorAll(api.sel.listItems)) {
        const id = topicIdFrom(li.querySelector('a.post-title')?.getAttribute('href'))
        if (!id || seen.has(id)) continue
        seen.add(id)
        ul.appendChild(document.importNode(li, true))
        added += 1
      }
      return added
    }

    async function restore() {
      if (!cfg.enabled) return false
      if (!onHome()) return false
      const rec = read()
      if (!rec) return false
      let el = findItem(rec.tid)
      if (!el) {
        let page = Number(api.page.page) || 1
        for (let i = 0; i < MAX_PAGES; i++) {
          page += 1
          let added = 0
          try {
            added = await loadNext(page)
          } catch {
            break
          }
          el = findItem(rec.tid)
          if (el) break
          if (!added) break
        }
      }
      if (!el) return false
      applyScroll(el, rec.offset)
      clear()
      return true
    }

    function scheduleRestore() {
      if (!cfg.enabled || !onHome()) return
      window.clearTimeout(scheduled)
      scheduled = window.setTimeout(() => {
        scheduled = 0
        if (inflight) return
        inflight = restore().finally(() => {
          inflight = null
        })
      }, 50)
    }

    function watchHomeArrival() {
      const from = location.href
      let n = 0
      const iv = window.setInterval(() => {
        n += 1
        if (onHome() && location.href !== from) {
          window.clearInterval(iv)
          watches.delete(iv)
          scheduleRestore()
        } else if (n >= 40) {
          window.clearInterval(iv)
          watches.delete(iv)
        }
      }, 20)
      watches.add(iv)
    }

    function onClick(e) {
      if (e.button !== 0) return
      const a = e.target?.closest?.('a[href]')
      if (!a) return
      if (a.target && a.target !== '_self') return
      try {
        const dest = api.parse.detectPage(new URL(a.href, location.href))
        if (cfg.enabled && dest.type === 'home' && !onHome()) watchHomeArrival()
      } catch {
        /* 坏 href 忽略 */
      }
      if (!cfg.enabled || !onHome()) return
      const title = a.closest('a.post-title')
      if (!title) return
      const li = title.closest('li.post-item')
      if (!li || !li.parentElement?.matches?.('ul.post-list')) return
      const tid = topicIdFrom(title.getAttribute('href'))
      if (!tid) return
      write(tid, li.getBoundingClientRect().top)
    }

    function onPageShow() {
      scheduleRestore()
    }

    document.addEventListener('click', onClick, true)
    window.addEventListener('pageshow', onPageShow)
    window.addEventListener('popstate', onPageShow)
    api.on('route:changed', scheduleRestore)
    api.onDispose(() => {
      document.removeEventListener('click', onClick, true)
      window.removeEventListener('pageshow', onPageShow)
      window.removeEventListener('popstate', onPageShow)
      if (scheduled) window.clearTimeout(scheduled)
      scheduled = 0
      for (const iv of watches) window.clearInterval(iv)
      watches.clear()
    })

    api.handle('home-return:debug', () => ({
      peek: read,
      find: (tid) => !!findItem(Number(tid)),
      restore,
    }))

    scheduleRestore()
    return {}
  }

  const w = typeof unsafeWindow !== 'undefined' ? unsafeWindow : window
  if (w.LSB && w.LSB.register) w.LSB.register(manifest, setup)
  else (w.LSB_PLUGINS = w.LSB_PLUGINS || []).push({ manifest, setup })
})()

;
(function () {
  'use strict'

  const manifest = {
    id: 'topic-preview',
    name: '主楼预览',
    version: '1.1.3',
    description: '列表点预览，浮窗嵌原帖（裁外壳）',
    author: 'you',
    requires: { base: '^0.1.0' },
    permissions: ['read', 'ui', 'events'],
  }

  const CROP_CSS =
    '.top,nav.forum-nav,aside.sidebar,aside.mobile-menu-drawer,footer.footer,' +
    '.mobile-menu-backdrop,.mobile-menu-trigger,.forum-more-region{display:none!important}' +
    '.forum-layout.forum-layout-has-sidebar{display:block!important;grid-template-columns:1fr!important}' +
    'main.wrap{max-width:none!important;margin-left:0!important;margin-right:0!important;width:auto!important}' +
    'body{overflow-y:auto!important}'

  function setup(api) {
    let activeId = null
    let mask = null
    let panel = null
    let onKey = null
    let frameWin = null
    let frameEsc = null

    const style = document.createElement('style')
    style.id = 'lsb-topic-preview-style'
    style.textContent = `
      .lsb-topic-preview-btn{
        margin-left:8px;padding:0 6px;height:20px;border:1px solid var(--line,#ddd);
        border-radius:4px;background:transparent;color:var(--text-muted,#888);
        font-size:12px;cursor:pointer;flex-shrink:0;vertical-align:middle;
      }
      .lsb-topic-preview-btn:hover{color:var(--brand,#5eaaa0);border-color:var(--brand,#5eaaa0)}
      .lsb-topic-preview-btn:active{transform:scale(.97)}
      #lsb-topic-preview{width:min(800px,94vw)}
      #lsb-topic-preview .lsb-view{
        position:relative;flex:0 0 auto;height:min(70vh,640px);padding:0;overflow:hidden;
      }
      #lsb-topic-preview iframe{
        position:absolute;inset:0;width:100%;height:100%;border:0;background:var(--bg,#fff);
      }
      #lsb-topic-preview [data-lsb-tp-loading]{
        position:absolute;inset:0;z-index:1;display:flex;align-items:center;justify-content:center;
        background:var(--panel,#fff);color:var(--text-muted,#888);font-size:13px;
      }
      #lsb-topic-preview [data-lsb-tp-loading][hidden]{display:none!important}
    `
    document.head.appendChild(style)

    function topicIdFrom(href) {
      const m = String(href || '').match(/\/topic\/(\d+)/)
      return m ? Number(m[1]) : null
    }

    function isTopicFrame(iframe) {
      return !!topicIdFrom(iframe?.getAttribute('src') || iframe?.src || '')
    }

    function unbindFrameEsc() {
      if (frameWin && frameEsc) {
        try {
          frameWin.removeEventListener('keydown', frameEsc)
        } catch {
          /* 翻页后旧 window 可能已经没了 */
        }
      }
      frameWin = null
      frameEsc = null
    }

    function bindFrameEsc(iframe) {
      unbindFrameEsc()
      const win = iframe.contentWindow
      if (!win) return
      frameEsc = (e) => {
        if (e.key === 'Escape') close()
      }
      frameWin = win
      win.addEventListener('keydown', frameEsc)
    }

    function cropFrame(iframe) {
      const doc = iframe.contentDocument
      if (!doc) return
      let st = doc.getElementById('lsb-topic-preview-crop')
      if (!st) {
        st = doc.createElement('style')
        st.id = 'lsb-topic-preview-crop'
        const host = doc.head || doc.documentElement
        if (!host) return
        host.appendChild(st)
      }
      st.textContent = CROP_CSS
    }

    function dropUi() {
      unbindFrameEsc()
      mask?.remove()
      panel?.remove()
      mask = null
      panel = null
      if (onKey) {
        document.removeEventListener('keydown', onKey)
        onKey = null
      }
    }

    function close() {
      activeId = null
      dropUi()
    }

    function onFrameLoad() {
      const iframe = panel?.querySelector('iframe')
      if (!iframe || !isTopicFrame(iframe)) return
      try {
        cropFrame(iframe)
        bindFrameEsc(iframe)
      } catch {
        /* 跨域错误页或沙箱拦 contentDocument：帖仍在 iframe 里，不能卡加载中 */
      }
      const loading = panel.querySelector('[data-lsb-tp-loading]')
      if (loading) loading.hidden = true
    }

    function ensureUi() {
      if (panel && mask) return panel
      dropUi()
      mask = document.createElement('div')
      mask.className = 'lsb-mask lsb-topic-preview-mask'
      panel = document.createElement('div')
      panel.className = 'lsb-panel'
      panel.id = 'lsb-topic-preview'
      panel.innerHTML =
        '<div class="lsb-panel-head"><strong data-lsb-tp-title>预览</strong>' +
        '<button type="button" class="lsb-panel-close" aria-label="关闭">×</button></div>' +
        '<div class="lsb-view"><div data-lsb-tp-loading>加载中</div>' +
        '<iframe class="lsb-topic-preview-frame" title="帖子预览"></iframe></div>' +
        '<div class="lsb-actions"><a class="lsb-btn is-primary" data-lsb-tp-open>打开帖子</a></div>'
      panel.querySelector('.lsb-panel-close').onclick = close
      mask.onclick = close
      panel.querySelector('iframe').addEventListener('load', onFrameLoad)
      document.body.append(mask, panel)
      onKey = (e) => {
        if (e.key === 'Escape') close()
      }
      document.addEventListener('keydown', onKey)
      return panel
    }

    function openPreview(id, listTitle) {
      const el = ensureUi()
      el.querySelector('[data-lsb-tp-title]').textContent = listTitle || '预览'
      el.querySelector('[data-lsb-tp-open]').setAttribute('href', api.routes.topic(id))
      const iframe = el.querySelector('iframe')
      const already = activeId === id && isTopicFrame(iframe) && topicIdFrom(iframe.getAttribute('src')) === id
      activeId = id
      if (already) return
      const loading = el.querySelector('[data-lsb-tp-loading]')
      if (loading) loading.hidden = false
      iframe.setAttribute('src', api.routes.topic(id))
    }

    function paint(li) {
      if (api.page.type === 'topic' || api.page.type === 'user') return
      if (!(li instanceof Element) || li.classList.contains('post-entry')) return
      if (li.querySelector(':scope .lsb-topic-preview-btn')) return
      const titleA = li.querySelector('a.post-title[href*="/topic/"]')
      if (!titleA) return
      const id = topicIdFrom(titleA.getAttribute('href'))
      if (!id) return
      const btn = document.createElement('button')
      btn.type = 'button'
      btn.className = 'lsb-topic-preview-btn'
      btn.textContent = '预览'
      btn.addEventListener('click', (e) => {
        e.preventDefault()
        e.stopPropagation()
        const it = api.parse.listItem(li)
        openPreview(id, (it && it.title) || titleA.textContent.trim())
      })
      const row = li.querySelector('.post-title-row')
      if (row && titleA.parentElement === row) titleA.after(btn)
      else (row || li.querySelector('.post-body') || li).append(btn)
    }

    api.dom.each(api.sel.listItems, paint)
    api.on('route:changed', close)
    api.onDispose(() => {
      close()
      for (const btn of document.querySelectorAll('.lsb-topic-preview-btn')) btn.remove()
      style.remove()
    })

    api.handle('topic-preview:debug', () => ({
      buttons: () => document.querySelectorAll('.lsb-topic-preview-btn').length,
      open: () => !!document.getElementById('lsb-topic-preview'),
      activeId: () => activeId,
      frameSrc: () => panel?.querySelector('iframe')?.getAttribute('src') || null,
    }))

    return {}
  }

  const w = typeof unsafeWindow !== 'undefined' ? unsafeWindow : window
  if (w.LSB && w.LSB.register) w.LSB.register(manifest, setup)
  else (w.LSB_PLUGINS = w.LSB_PLUGINS || []).push({ manifest, setup })
})()

;
(function () {
  'use strict'

  const manifest = {
    id: 'unread-sentinel',
    name: '未读哨兵',
    version: '1.0.17',
    description: '低频巡检首页新动态；跨标签选主去重；标题角标 + 通知 + 消息箱；左栏通知红点跟个人卡走',
    author: 'you',
    requires: { base: '^0.1.0' },
    permissions: ['read', 'storage', 'ui', 'events'],
    config: {
      intervalMin: { type: 'number', label: '巡检间隔 (分钟)', default: 3 },
      jitterMs: { type: 'number', label: '选主随机延迟 (ms)', default: 1200 },
      badgeInTitle: { type: 'switch', label: '标题栏未读角标', default: true },
      notifyDesktop: { type: 'switch', label: '桌面通知', default: false },
    },
  }

  function setup(api) {
    let cfg = api.config()
    api.on('config:changed:unread-sentinel', () => {
      cfg = api.config()
      if (election.isLeader) scheduleNext()
    })
    const origTitle = document.title
    let timer = null
    let inflight = null // 在途巡检 Promise：并发调用复用同一轮而非静默丢弃
    let notifyFresh = false
    let nextAt = null
    let lastErr = null
    const probe = {}
    const JITTER = Number.isFinite(Number(cfg.jitterMs)) ? Math.max(0, Number(cfg.jitterMs)) : 1200

    /* ── 状态存储 ── */
    const seenGet = () => api.store.get('seen', {}) || {}
    const seenSet = (m) => api.store.set('seen', m)
    const inboxGet = () => api.store.get('inbox', []) || []
    const inboxSet = (arr) => api.store.set('inbox', arr.slice(0, 100))
    const lastOpenTs = () => api.store.get('lastOpenTs', 0)

    api.ui.style(
      '.lsb-notify-badge{display:none!important}',
    )

    function notifyHosts() {
      const hosts = [...document.querySelectorAll('a[href*="tab=notifications"]')].filter((a) => {
        const href = a.getAttribute('href') || ''
        return !/[?&]p=/.test(href)
      })
      const mine = document.querySelector('a.nav-mine')
      if (mine && !hosts.includes(mine)) hosts.push(mine)
      return hosts
    }

    function isUserCardNotify(a) {
      if (a.classList.contains('nav-mine') || a.classList.contains('tab')) return false
      return !!(a.closest('.user-card, .user-links, [data-lsb-shell-me]'))
    }

    function isKeywordFilterBadge(el) {
      return !!(
        el.classList.contains('home-keyword-filter-count')
        || el.closest('.home-keyword-filter-button')
      )
    }

    function nativesOn(a) {
      // 个人卡「我的通知」原生是 .notify-badge（红底白字）。
      // .notification-unread 是通知页浅色胶囊，叠上去会看成白点。
      if (isUserCardNotify(a)) {
        a.querySelectorAll('.notification-unread').forEach((el) => el.remove())
      }
      return [...a.querySelectorAll('.notify-badge, .notification-unread, .mobile-nav-unread')].filter(
        (el) => !isKeywordFilterBadge(el),
      )
    }

    function rememberOrig(el) {
      if (!el.hasAttribute('data-lsb-notify-orig')) {
        el.setAttribute('data-lsb-notify-orig', el.textContent || '')
      }
    }

    function showNative(el, label) {
      rememberOrig(el)
      el.textContent = label
      el.hidden = false
      el.removeAttribute('data-lsb-notify-hid')
      el.style.removeProperty('display')
    }

    function hideNative(el) {
      rememberOrig(el)
      el.textContent = ''
      el.setAttribute('data-lsb-notify-hid', '')
      // 站点 .notification-unread{display:inline-flex} 会盖掉 hidden
      el.style.setProperty('display', 'none', 'important')
    }

    function canCreateNative(a) {
      return !a.classList.contains('nav-mine') && !a.classList.contains('tab')
    }

    function paintNotify(n) {
      const count = Math.max(0, Number(n) || 0)
      const label = count > 9 ? '9+' : String(count)
      document.querySelectorAll('.lsb-notify-badge').forEach((el) => el.remove())
      for (const a of notifyHosts()) {
        const natives = nativesOn(a)
        if (count <= 0) {
          for (const el of natives) {
            if (el.hasAttribute('data-lsb-notify')) el.remove()
            else hideNative(el)
          }
          continue
        }
        if (natives.length) {
          for (const el of natives) showNative(el, label)
          continue
        }
        if (!canCreateNative(a)) continue
        const el = document.createElement('span')
        el.className = 'notify-badge'
        el.setAttribute('data-lsb-notify', '')
        el.textContent = label
        a.append(el)
      }
    }

    function storedCount() {
      return Math.max(0, Number(api.store.get('notifyCount', 0)) || 0)
    }

    function stripCardSoftPills() {
      for (const a of notifyHosts()) {
        if (!isUserCardNotify(a)) continue
        a.querySelectorAll('.notification-unread').forEach((el) => el.remove())
      }
    }

    // 刷新后库存经常是 0：先留着站点 SSR 红点，等从个人卡抄到数字再决定藏不藏。
    function paintStored() {
      stripCardSoftPills()
      const n = storedCount()
      if (n > 0 || notifyFresh) paintNotify(n)
    }

    function applyNotify(n) {
      const count = Math.max(0, Number(n) || 0)
      notifyFresh = true
      api.store.set('notifyCount', count)
      paintNotify(count)
      api.tabs.post('notify', { count })
    }

    function cardNotifyAnchors(root) {
      return [...root.querySelectorAll('a[href*="tab=notifications"]')].filter((a) => {
        const href = a.getAttribute('href') || ''
        if (/[?&]p=/.test(href)) return false
        if (a.classList.contains('nav-mine') || a.classList.contains('tab')) return false
        return !!(a.closest('.user-card, .user-links, [data-lsb-shell-me]'))
      })
    }

    /** 从个人卡原生红点读数。打开通知页会把未读标掉，所以不能靠 GET 通知页。
     *  哨兵自己补的 / 藏掉的点不算原生：只有它们时返回 null，避免软跳把库存写成 0。 */
    function countNativeNotify(root) {
      const as = cardNotifyAnchors(root)
      if (!as.length) return null
      let max = 0
      let sawNative = false
      let sawOurs = false
      for (const a of as) {
        const els = [...a.querySelectorAll('.notify-badge, .notification-unread, .mobile-nav-unread')].filter(
          (el) => !isKeywordFilterBadge(el),
        )
        for (const el of els) {
          if (el.hasAttribute('data-lsb-notify') || el.hasAttribute('data-lsb-notify-hid')) {
            sawOurs = true
            continue
          }
          sawNative = true
          const raw = (el.textContent || '').trim()
          const n = raw === '9+' ? 10 : parseInt(raw, 10)
          if (Number.isFinite(n) && n > max) max = n
        }
      }
      if (sawNative) return max
      if (sawOurs) return null
      return 0
    }

    function isOwnNotifyPage(page = api.page) {
      if (page?.type !== 'user' || page.tab !== 'notifications') return false
      if (api.me.guest || api.me.uid == null) return false
      return Number(page.id) === Number(api.me.uid)
    }

    function refreshNotifyFromHere() {
      if (isOwnNotifyPage()) {
        applyNotify(0)
        return
      }
      applyNotifyFrom(document)
      paintStored()
    }

    function applyNotifyFrom(root) {
      if (isOwnNotifyPage()) {
        applyNotify(0)
        return
      }
      if (api.me.guest || api.me.uid == null) {
        applyNotify(0)
        return
      }
      const n = countNativeNotify(root)
      if (n == null) return
      applyNotify(n)
    }

    function unreadCount() {
      return inboxGet().filter((x) => x.lastTs > lastOpenTs()).length
    }
    function applyTitle() {
      if (!cfg.badgeInTitle) return
      const n = unreadCount()
      document.title = n > 0 ? `(${n}) ${origTitle}` : origTitle
    }

    api.tabs.on('events', ({ items, drop }) => {
      if (Array.isArray(drop) && drop.length) {
        const dropSet = new Set(drop.map(Number))
        inboxSet(inboxGet().filter((x) => !dropSet.has(Number(x.id))))
      }
      if (items?.length) mergeInbox(items)
      applyTitle()
    })
    api.tabs.on('notify', ({ count }) => {
      if (isOwnNotifyPage()) {
        notifyFresh = true
        api.store.set('notifyCount', 0)
        paintNotify(0)
        return
      }
      notifyFresh = true
      api.store.set('notifyCount', count)
      paintNotify(count)
    })
    api.on('route:changed', () => {
      refreshNotifyFromHere()
    })
    api.dom.each('a[href*="tab=notifications"], a.nav-mine', () => {
      if (isOwnNotifyPage()) applyNotify(0)
      else paintStored()
    })

    /* 红点只抄个人卡原生数字。GET 通知页会被站点当成打开，未读立刻清掉。
     * 人已经进了自己的通知页时，这一轮就清库存，不必等 3 分钟后再抄首页个人卡。 */
    applyTitle()
    refreshNotifyFromHere()

    const election = api.election({
      onPromote: () => cycle(),
      onDemote: () => {
        if (timer) clearTimeout(timer)
        timer = null
        nextAt = null
      },
      jitter: JITTER,
    })

    /* ── 巡检核心 ── */
    async function cycle(force = false) {
      if (inflight || (election.role === 'follower' && !force)) return inflight
      inflight = (async () => {
        try {
          probe.at = Date.now()
          const doc = await api.net.doc('/')
          applyNotifyFrom(doc)
          const parsed = api.parse.list(doc)
          probe.parsed = parsed.length
          const items = parsed.filter((x) => x.id && x.lastActiveTs)
          probe.items = items.length
          probe.seenBefore = Object.keys(seenGet()).length
          const seen = seenGet()
          const fresh = []
          const pinnedIds = new Set()
          for (const it of items) {
            const prev = seen[it.id]
            seen[it.id] = Math.max(prev || 0, it.lastActiveTs)
            if (it.pinned) {
              pinnedIds.add(it.id)
              continue
            }
            if (prev == null || it.lastActiveTs > prev) {
              fresh.push({ id: it.id, title: it.title, lastTs: it.lastActiveTs, replies: it.replies })
            }
          }
          // 容量修剪：保留最近 400 帖的水位线
          const entries = Object.entries(seen).sort((a, b) => b[1] - a[1]).slice(0, 400)
          seenSet(Object.fromEntries(entries))

          if (pinnedIds.size) {
            const kept = inboxGet().filter((x) => !pinnedIds.has(Number(x.id)))
            if (kept.length !== inboxGet().length) {
              inboxSet(kept)
              applyTitle()
            }
          }

          probe.fresh = fresh.length
          if (fresh.length) {
            fresh.sort((a, b) => (b.lastTs || 0) - (a.lastTs || 0))
            mergeInbox(fresh)
            applyTitle()
            if (!force) announce(fresh)
          }
          if (fresh.length || pinnedIds.size) {
            api.tabs.post('events', { items: fresh, drop: [...pinnedIds] })
          }
        } catch (e) {
          lastErr = String((e && e.message) || e); api.log('sentinel 巡检失败', lastErr)
        } finally {
          inflight = null
          if (election.isLeader) scheduleNext()
        }
      })()
      return inflight
    }

    function mergeInbox(items) {
      const inbox = inboxGet()
      for (const it of items) {
        // 入站条目的时间字段是 lastTs（cycle 里就这么组的）；
        // 旧实现读 it.ts → undefined → Math.max 出 NaN，被合并的条目时间戳直接坏掉。
        const ts = it.lastTs ?? it.ts ?? 0
        const exist = inbox.find((x) => x.id === it.id)
        if (exist) {
          exist.lastTs = Math.max(exist.lastTs || 0, ts)
          exist.count = (exist.count || 1) + 1
          exist.title = it.title || exist.title
        } else {
          inbox.unshift({ ...it, lastTs: ts, count: 1, firstTs: Date.now() })
        }
      }
      inbox.sort((a, b) => (b.lastTs || 0) - (a.lastTs || 0))
      inboxSet(inbox)
    }

    function announce(items) {
      const names = items.slice(0, 3).map((x) => x.title).join('、')
      api.ui.toast(`${items.length} 个帖子有新动态：${names}${items.length > 3 ? ' 等' : ''}`, {
        title: '未读哨兵',
        timeout: 5000,
      })
      if (cfg.notifyDesktop && typeof Notification !== 'undefined') {
        try {
          if (Notification.permission === 'granted') {
            new Notification(`linux.sb · ${items.length} 条新动态`, { body: names })
          } else if (Notification.permission === 'default') {
            Notification.requestPermission()
          }
        } catch {
          /* 无通知环境 */
        }
      }
    }

    function scheduleNext() {
      if (timer) clearTimeout(timer)
      nextAt = Date.now() + cfg.intervalMin * 60000
      timer = setTimeout(() => cycle(), cfg.intervalMin * 60000)
      timer.unref?.()
    }
    api.onDispose(() => {
      if (timer) clearTimeout(timer)
      timer = null
      document.title = origTitle // 停用即还原标题，不留角标
      document.querySelectorAll('.lsb-notify-badge').forEach((el) => el.remove())
      document.querySelectorAll('[data-lsb-notify]').forEach((el) => el.remove())
      document.querySelectorAll('[data-lsb-notify-orig]').forEach((el) => {
        el.style.removeProperty('display')
        el.hidden = false
        el.removeAttribute('data-lsb-notify-hid')
        el.textContent = el.getAttribute('data-lsb-notify-orig') || ''
        el.removeAttribute('data-lsb-notify-orig')
      })
    })

    /* ── 面板：消息箱 ── */
    api.ui.tab({
      id: 'unread-sentinel-inbox',
      name: '消息箱',
      order: 63,
      render(host) {
        api.store.set('lastOpenTs', Date.now())
        applyTitle()
        const inbox = inboxGet()
        const head = document.createElement('div')
        head.className = 'lsb-row-desc'
        head.style.marginBottom = '8px'
        head.textContent = `角色：${election.role === 'leader' ? '本标签负责巡检' : election.role === 'follower' ? '由其它标签巡检' : '待定'}${
          nextAt ? ` · 下次检查 ${Math.max(0, Math.round((nextAt - Date.now()) / 1000))}s 后` : ''
        }`
        host.appendChild(head)

        if (!inbox.length) {
          host.insertAdjacentHTML('beforeend', '<div class="lsb-empty">还没有捕获到新动态。</div>')
        } else {
          host.insertAdjacentHTML(
            'beforeend',
            inbox.slice(0, 30)
              .map(
                (x) => `
              <div class="lsb-row">
                <div class="lsb-row-main">
                  <a class="lsb-row-name" href="${api.routes.topic(x.id)}">${api.util.esc(x.title)}</a>
                  <div class="lsb-row-desc">${new Date(x.lastTs * 1000).toLocaleString('zh-CN')} · ${x.count > 1 ? `更新 ${x.count} 次` : '新动态'}</div>
                </div>
                <a class="lsb-btn" href="${api.routes.topic(x.id)}">查看</a>
              </div>`,
              )
              .join(''),
          )
        }
        const clear = document.createElement('button')
        clear.className = 'lsb-btn'
        clear.textContent = '清空消息箱'
        clear.style.marginTop = '10px'
        clear.onclick = async () => {
          if (await api.ui.confirm('清空全部消息？')) {
            inboxSet([])
            applyTitle()
            api.ui.showTab('unread-sentinel-inbox')
          }
        }
        host.appendChild(clear)
      },
    })

    /* ── 启动 ── */
    // 角色由 election 自行决定（单标签抖动后自动上位，多标签靠心跳竞争）

    /* ── 调试接口 ── */
    /* ── 设置页（由 manifest.config 自动生成） ── */
    api.ui.configTab({ name: "哨兵设置", order: 55 })

    api.handle('unread-sentinel:debug', () => ({
      role: () => election.role,
      election: () => election.state(), // id / leaderId / 距上次 leader 心跳，排查跨标签问题用
      lastError: () => lastErr,
      probe: () => probe,
      diag: () => ({ origTitle, badge: !!cfg.badgeInTitle, unread: unreadCount(), inboxLen: inboxGet().length, lastOpen: lastOpenTs(), firstTs: inboxGet()[0] && inboxGet()[0].lastTs, notifyCount: api.store.get('notifyCount', 0) }),
      tick: () => cycle(true), // force 绕过 follower 门禁，测试用
      inbox: inboxGet,
      seen: seenGet,
      setSeenEntry: (id, ts) => {
        const s = seenGet()
        s[id] = ts
        seenSet(s)
      },
      title: () => document.title,
    }))

    return {}
  }

  const w = typeof unsafeWindow !== 'undefined' ? unsafeWindow : window
  if (w.LSB && w.LSB.register) w.LSB.register(manifest, setup)
  else ;(w.LSB_PLUGINS = w.LSB_PLUGINS || []).push({ manifest, setup })
})()

;
/**
 * 说明：
 *  - 每天首次浏览时访问 /daily_checkin 探测状态（已签/未签），写入本地日历；
 *  - 「立即签到」会解析该页的签到表单并代表你提交（提交前有确认弹窗）；
 *  - 原生不支持补签，本插件同样只记录、不伪造历史。
 */
(function () {
  'use strict'

  const manifest = {
    id: 'checkin-calendar',
    name: '签到日历',
    version: '1.0.3',
    description: '签到状态日历 + 连击统计 + 一键签今天',
    author: 'you',
    requires: { base: '^0.1.0' },
    // write：一键签到是代表用户提交表单的写操作（POST /daily_checkin）。
    // 基座已把「站内非幂等请求」纳入 write 权限门，此处如实声明。
    permissions: ['read', 'storage', 'ui', 'events', 'write'],
    config: {
      remind: { type: 'switch', label: '未签到时提醒', default: true },
      harvest: { type: 'switch', label: '从签到页收割历史日期', default: true },
      autoProbe: { type: 'switch', label: '每天首次浏览自动探测', default: true },
    },
  }

  function setup(api) {
    let cfg = api.config()
    api.on('config:changed:checkin-calendar', () => {
      cfg = api.config()
    })

    function dkey(d) {
      const x = d || new Date()
      const p = (n) => String(n).padStart(2, '0')
      return x.getFullYear() + '-' + p(x.getMonth() + 1) + '-' + p(x.getDate())
    }
    const today = () => dkey(new Date())

    const recsGet = () => api.store.get('recs', {}) || {}
    function setDay(key, s) {
      const r = recsGet()
      r[key] = { s, t: Date.now() }
      api.store.set('recs', r)
    }

    /* ── 状态探测 ── */
    let status = null // ok | open | unknown
    let formInfo = null // {action, fields:[{name,value}]}

    function detect(doc) {
      const txt = doc.body ? doc.body.textContent : ''
      if (/已签到|今日已签|明日再来/.test(txt)) return 'ok'
      const f = [...doc.querySelectorAll('form')].find((f) =>
        /checkin/i.test(f.getAttribute('action') || ''),
      )
      if (f) {
        formInfo = {
          action: f.getAttribute('action') || '/daily_checkin',
          fields: [...f.querySelectorAll('input[name]')].map((i) => ({
            name: i.getAttribute('name'),
            value: i.value,
          })),
        }
        return 'open'
      }
      return 'unknown'
    }

    /** 从页面文本里收割历史签到日期（通用正则，不依赖具体 DOM） */
    function harvestHistory(doc) {
      const txt = doc.body ? doc.body.textContent : ''
      const found = []
      const seen = new Set()
      for (const m of txt.matchAll(/(20\d{2})-(\d{2})-(\d{2})/g)) {
        const key = m[1] + '-' + m[2] + '-' + m[3]
        const t = new Date(key + 'T12:00:00').getTime()
        if (Number.isNaN(t) || t > Date.now()) continue
        if (Date.now() - t > 366 * 864e5) continue
        if (key === today() || seen.has(key)) continue
        seen.add(key)
        found.push(key)
      }
      return found
    }
    async function probe(force = false) {
      if (!force && status) return status
      const doc = await api.net.doc('/daily_checkin')
      status = detect(doc)
      setDay(today(), status)
      if (cfg.harvest !== false && cfg.harvest) {
        for (const k of harvestHistory(doc)) setDay(k, 'ok')
      }
      if (status === 'open' && cfg.remind) {
        api.ui.toast('今天还没签到', { title: '签到日历' })
      }
      return status
    }

    // 每天首次浏览自动探测一次
    if (cfg.autoProbe && api.store.get('probedDay', '') !== today()) {
      probe()
        .then(() => api.store.set('probedDay', today()))
        .catch(() => {})
    }

    /* ── 一键签今天 ── */
    async function doCheckin(skipConfirm = false) {
      if (!skipConfirm && !(await api.ui.confirm('提交今天的签到？'))) return false
      if (!formInfo) await probe(true)
      if (status === 'ok' || /已签到|今日已签/.test(document.body?.textContent || '')) {
        setDay(today(), 'ok')
        api.ui.toast('今天已经签过啦', { title: '签到日历' })
        return { done: false, reason: 'already-signed' }
      }
      if (!formInfo) throw new Error('未找到签到表单（页面结构可能变化）')
      const fd = new FormData()
      for (const f of formInfo.fields) fd.append(f.name, f.value)
      const res = await api.net.raw(formInfo.action, {
        method: 'POST',
        body: fd,
        headers: { 'x-requested-with': 'XMLHttpRequest' },
      })
      if (!res.ok) {
        api.ui.toast('签到失败 HTTP ' + res.status, { type: 'error' })
        return { done: false, reason: 'http-' + res.status }
      }
      status = 'ok'
      setDay(today(), 'ok')
      api.ui.toast('签到完成', { type: 'success' })
      return true
    }

    /* ── 连击统计 ── */
    function streak() {
      const r = recsGet()
      let n = 0
      const d = new Date()
      if (r[dkey(d)]?.s !== 'ok') d.setDate(d.getDate() - 1) // 今天还没签则从昨天起算
      while (r[dkey(d)]?.s === 'ok') {
        n++
        d.setDate(d.getDate() - 1)
      }
      return n
    }
    function monthCount(offset = 0) {
      const now = new Date()
      const m = new Date(now.getFullYear(), now.getMonth() + offset, 1)
      const pre = dkey(m).slice(0, 7)
      const r = recsGet()
      return Object.keys(r).filter((k) => k.startsWith(pre) && r[k].s === 'ok').length
    }

    /* ── 面板：月历 ── */
    let viewOffset = 0
    api.ui.tab({
      name: '签到日历',
      order: 64,
      render(host) {
        const base = new Date()
        const view = new Date(base.getFullYear(), base.getMonth() + viewOffset, 1)
        const ym = dkey(view).slice(0, 7)
        const firstDow = new Date(view.getFullYear(), view.getMonth(), 1).getDay()
        const daysIn = new Date(view.getFullYear(), view.getMonth() + 1, 0).getDate()
        const r = recsGet()

        let cells = ''
        for (let i = 0; i < firstDow; i++) cells += '<span class="lsb-cal-cell is-empty"></span>'
        for (let d = 1; d <= daysIn; d++) {
          const key = ym + '-' + String(d).padStart(2, '0')
          const st = r[key]?.s
          const cls = st === 'ok' ? ' is-ok' : st === 'open' ? ' is-miss' : ' is-none'
          cells += `<span class="lsb-cal-cell${cls}" title="${key}">${d}</span>`
        }

        host.innerHTML = `
          <div class="lsb-cal-head">
            <button class="lsb-btn" data-prev>‹</button>
            <strong>${ym}</strong>
            <button class="lsb-btn" data-next>›</button>
            <span class="lsb-row-desc" style="margin-left:auto">
              本月 ${monthCount(viewOffset)} 天 · 连击 ${streak()} 天 · 今日：${
                r[today()]?.s === 'ok' ? '已签' : r[today()]?.s === 'open' ? '未签' : '未知'
              }</span>
          </div>
          <div class="lsb-cal-grid">
            ${['日', '一', '二', '三', '四', '五', '六'].map((x) => `<span class="lsb-cal-dow">${x}</span>`).join('')}
            ${cells}
          </div>
          <div class="lsb-actions" style="border:0;padding:10px 0 0">
            <button class="lsb-btn" data-probe>重新探测</button>
            <button class="lsb-btn is-primary" data-go>${
              r[today()]?.s === 'ok' ? '今日已签' : '立即签到'
            }</button>
          </div>`

        host.querySelector('[data-prev]').onclick = () => {
          viewOffset--
          host.innerHTML = ''
          thisRender()
        }
        host.querySelector('[data-next]').onclick = () => {
          viewOffset++
          host.innerHTML = ''
          thisRender()
        }
        host.querySelector('[data-probe]').onclick = () =>
          probe(true).then(() => {
            host.innerHTML = ''
            thisRender()
          })
        const go = host.querySelector('[data-go]')
        go.disabled = r[today()]?.s === 'ok'
        go.onclick = () =>
          doCheckin().then(() => {
            host.innerHTML = ''
            thisRender()
          }).catch((e) => api.ui.toast(e.message, { type: 'error' }))
      },
    })
    function thisRender() {
      api.ui.showTab('checkin-calendar')
    }

    api.ui.style(`
      .lsb-cal-head{display:flex;align-items:center;gap:8px;margin-bottom:8px}
      .lsb-cal-grid{display:grid;grid-template-columns:repeat(7,34px);gap:4px}
      .lsb-cal-dow{font-size:11px;color:var(--text-muted,#888);text-align:center}
      .lsb-cal-cell{height:30px;display:flex;align-items:center;justify-content:center;
        border-radius:6px;font-size:12px;background:var(--bg,#f5f5f5);color:var(--text,#222)}
      .lsb-cal-cell.is-empty{background:transparent}
      .lsb-cal-cell.is-ok{background:var(--brand,#5eaaa0);color:#fff;font-weight:600}
      .lsb-cal-cell.is-miss{background:var(--warning-soft,#fff3d6);color:var(--warning,#b8860b)}
      .lsb-cal-cell.is-none{opacity:.45}
    `)

    /* ── 调试接口 ── */
    api.handle('checkin-calendar:debug', () => ({
      probe,
      doCheckin: () => doCheckin(true),
      status: () => status,
      setDay,
      recs: recsGet,
      streak,
      form: () => formInfo,
    }))

    return {}
  }

  const w = typeof unsafeWindow !== 'undefined' ? unsafeWindow : window
  if (w.LSB && w.LSB.register) w.LSB.register(manifest, setup)
  else {
    w.LSB_PLUGINS = w.LSB_PLUGINS || []
    w.LSB_PLUGINS.push({ manifest, setup })
  }
})()

;
/**
 * 数据源：侧栏用户卡的「积分 xxxx」（site.js 的 me.points，选择器稳定）。
 * 快照序列 → 折线图 + 相邻差值（每日净变化）。明细归因（哪帖赚的）留给后续版本。
 */
(function () {
  'use strict'

  const manifest = {
    id: 'points-ledger',
    name: '积分趋势',
    version: '1.0.2',
    description: '积分余额快照时间序列 → 趋势折线 + 每日增减',
    author: 'you',
    requires: { base: '^0.1.0' },
    permissions: ['read', 'storage', 'ui', 'events'],
    config: {
      intervalHours: { type: 'number', label: '自动快照间隔 (小时)', default: 6 },
      keepDays: { type: 'number', label: '保留天数', default: 365 },
    },
  }

  function setup(api) {
    let cfg = api.config()
    api.on('config:changed:points-ledger', () => {
      cfg = api.config()
      arm()
    })
    let timer = null
    function arm() {
      if (timer) {
        clearInterval(timer)
        timer = null
      }
      const hours = Number(cfg.intervalHours)
      if (!(hours > 0)) return
      const ms = Math.max(250, hours * 3600e3)
      timer = setInterval(() => autoSnap().catch(() => {}), ms)
      timer.unref?.()
    }
    let rangeDays = 90 // 面板查看范围

    const get = () => api.store.get('series', []) || []
    const set = (a) => api.store.set('series', a)

    function pushSnap(ts, points) {
      if (points == null) return false
      const arr = get()
      const last = arr[arr.length - 1]
      if (last && last.p === points && ts - last.t < 3600e3 * 12) {
        last.t = Math.max(last.t, ts) // 同值 12h 内视为同一状态，只推进时间
        set(arr)
        return false
      }
      arr.push({ t: ts, p: points })
      const deadline = Date.now() - cfg.keepDays * 864e5
      set(arr.filter((x) => x.t >= deadline))
      return true
    }

    async function autoSnap(force = false) {
      if (api.me.uid == null) return false
      const arr = get()
      const last = arr[arr.length - 1]
      const due = !last || Date.now() - last.t >= cfg.intervalHours * 3600e3
      if (!due && !force) return false
      return pushSnap(Date.now(), api.me.points)
    }
    autoSnap().catch(() => {})
    arm()
    api.onDispose(() => {
      if (timer) clearInterval(timer)
      timer = null
    })

    /* ── SVG 图表 ── */
    function chart(series) {
      if (series.length < 2) {
        return '<div class="lsb-empty">至少两次快照后开始绘制（当前 ' + series.length + ' 次）。</div>'
      }
      const W = 620
      const H = 170
      const P = { l: 46, r: 12, t: 12, b: 22 }
      const ps = series.map((x) => x.p)
      const min = Math.min(...ps)
      const max = Math.max(...ps)
      const span = max - min || 1
      const X = (i) => P.l + (i / (series.length - 1)) * (W - P.l - P.r)
      const Y = (v) => P.t + (1 - (v - min) / span) * (H - P.t - P.b)
      const pts = series.map((s, i) => `${X(i).toFixed(1)},${Y(s.p).toFixed(1)}`).join(' ')
      const area = `${P.l},${H - P.b} ${pts} ${X(series.length - 1).toFixed(1)},${H - P.b}`
      const deltas = []
      for (let i = 1; i < series.length; i++) {
        const d = series[i].p - series[i - 1].p
        if (d !== 0) deltas.push({ t: series[i].t, d })
      }
      const recent = deltas.slice(-5).reverse()
      return `
        <svg class="lsb-svg" viewBox="0 0 ${W} ${H}" preserveAspectRatio="xMidYMid meet" role="img" style="aspect-ratio:${W}/${H}">
          <rect x="${P.l}" y="${P.t}" width="${W - P.l - P.r}" height="${H - P.t - P.b}" fill="none" stroke="var(--line-soft,#eee)"></rect>
          <polygon points="${area}" fill="var(--brand-soft,#e8f4f2)"></polygon>
          <polyline points="${pts}" fill="none" stroke="var(--brand,#5eaaa0)" stroke-width="2"></polyline>
          ${series
            .map((s, i) => `<circle cx="${X(i).toFixed(1)}" cy="${Y(s.p).toFixed(1)}" r="2.5" fill="var(--brand,#5eaaa0)"></circle>`)
            .join('')}
          <text x="${P.l - 6}" y="${Y(max) + 4}" text-anchor="end" font-size="11" fill="var(--text-muted,#888)">${max}</text>
          <text x="${P.l - 6}" y="${Y(min) + 4}" text-anchor="end" font-size="11" fill="var(--text-muted,#888)">${min}</text>
          <text x="${W - P.r}" y="${H - 6}" text-anchor="end" font-size="11" fill="var(--text-muted,#888)">
            ${new Date(series[series.length - 1].t).toLocaleDateString('zh-CN')} · ${series[series.length - 1].p}</text>
          <text x="${P.l}" y="${H - 6}" font-size="11" fill="var(--text-muted,#888)">${new Date(series[0].t).toLocaleDateString('zh-CN')}</text>
        </svg>
        <div class="lsb-row-desc" style="margin-top:6px">最近变化：</div>
        ${
          recent.length
            ? recent
                .map(
                  (d) =>
                    `<div class="lsb-row"><span>${new Date(d.t).toLocaleString('zh-CN')}</span>` +
                    `<strong style="margin-left:auto;color:${d.d > 0 ? 'var(--success,#3aa08f)' : 'var(--danger,#d55)'}">${d.d > 0 ? '+' : ''}${d.d}</strong></div>`,
                )
                .join('')
            : '<div class="lsb-empty">暂无变化记录。</div>'
        }`
    }

    /* ── 面板 ── */
    api.ui.tab({
      name: '积分趋势',
      order: 65,
      render(host) {
        const all = get()
        const cutoff = Date.now() - rangeDays * 864e5
        const view = all.filter((x) => x.t >= cutoff)
        host.innerHTML = `
          <div class="lsb-cal-head">
            <strong>积分趋势</strong>
            <span class="lsb-row-desc">当前 ${api.me.points != null ? api.me.points : '?'} · 快照 ${all.length} 次</span>
            <span style="margin-left:auto;display:flex;gap:6px">
              ${[30, 90, 365].map(
                (d) =>
                  `<button class="lsb-btn${rangeDays === d ? ' is-primary' : ''}" data-range="${d}">${d}天</button>`,
              ).join('')}
              <button class="lsb-btn" data-refresh>立即快照</button>
            </span>
          </div>
          <div class="lsb-chart-host">${chart(view.length >= 2 ? view : all)}</div>`
        host.querySelectorAll('[data-range]').forEach((b) => {
          b.onclick = () => {
            rangeDays = Number(b.dataset.range)
            api.ui.showTab('points-ledger')
          }
        })
        const rf = host.querySelector('[data-refresh]')
        rf.onclick = () =>
          autoSnap(true)
            .then((added) => {
              api.ui.toast(added ? '已记录当前积分' : '数值未变化', { type: 'success' })
              api.ui.showTab('points-ledger')
            })
            .catch((e) => api.ui.toast(e.message, { type: 'error' }))
      },
    })

    api.ui.style(
      '.lsb-chart-host{min-width:0;width:100%;overflow:hidden}' +
        '.lsb-svg{display:block;width:100%;height:auto;max-width:100%}',
    )

    /* ── 对外 RPC（给未来的年度报告/Dashboard 用） ── */
    api.handle('points-ledger:series', ({ days = 90 } = {}) => {
      const cutoff = Date.now() - days * 864e5
      return get().filter((x) => x.t >= cutoff)
    })

    /* ── 调试接口 ── */
    api.handle('points-ledger:debug', () => ({
      series: get,
      reset: () => set([]),
      snap: () => autoSnap(true),
      add: (t, p) => pushSnap(t, p),
      armed: () => !!timer,
    }))

    return {}
  }

  const w = typeof unsafeWindow !== 'undefined' ? unsafeWindow : window
  if (w.LSB && w.LSB.register) w.LSB.register(manifest, setup)
  else {
    w.LSB_PLUGINS = w.LSB_PLUGINS || []
    w.LSB_PLUGINS.push({ manifest, setup })
  }
})()

;
(function () {
  'use strict'

  const manifest = {
    id: 'data-migration',
    name: '配置迁移',
    version: '1.0.0',
    description: '全库数据备份/恢复（JSON），支持文件下载、剪贴板、合并或覆盖导入',
    author: 'you',
    requires: { base: '^0.1.1' }, // 需要 admin API
    permissions: ['read', 'storage', 'ui', 'events', 'admin'],
  }

  function setup(api) {
    function download(name, text) {
      try {
        const blob = new Blob([text], { type: 'application/json' })
        const a = document.createElement('a')
        a.href = URL.createObjectURL(blob)
        a.download = name
        a.click()
        setTimeout(() => URL.revokeObjectURL(a.href), 4000)
        return true
      } catch (e) {
        api.log('下载失败', e)
        return false
      }
    }

    /* ── 面板 ── */
    api.ui.tab({
      name: '配置迁移',
      order: 68,
      render(host) {
        const dump = api.admin.exportAll()
        const kb = (JSON.stringify(dump).length / 1024).toFixed(1)

        // 按模块聚合统计
        const per = {}
        for (const k of Object.keys(dump.data)) {
          const m = k.match(/^lsb_base:([^:]+):/)
          const mod = m ? m[1] : '(其它)'
          per[mod] = (per[mod] || 0) + 1
        }
        const breakdown = Object.entries(per)
          .sort((a, b) => b[1] - a[1])
          .map(([m, n]) => `${api.util.esc(m)}(${n})`)
          .join(' · ')

        host.innerHTML = `
          <div class="lsb-row">
            <div class="lsb-row-main">
              <div class="lsb-row-name">当前库：${dump.count} 个键 · ${kb} KB</div>
              <div class="lsb-row-desc">${breakdown || '空库'}</div>
            </div>
          </div>
          <div class="lsb-actions" style="border:0;padding:8px 0">
            <button class="lsb-btn is-primary" data-export>⬇ 导出备份文件</button>
            <button class="lsb-btn" data-copy>复制到剪贴板</button>
          </div>
          <label class="lsb-field"><span>导入：选择备份文件或直接粘贴 JSON</span>
            <input type="file" accept=".json,application/json" data-file style="margin-bottom:6px">
            <textarea data-json rows="6" placeholder='{"app":"lsb", ...}'></textarea>
          </label>
          <div class="lsb-row" style="border:0">
            <label style="display:flex;gap:6px;align-items:center;font-size:12px">
              <input type="checkbox" data-merge> 合并模式（保留现有同名键，只补缺失）
            </label>
            <button class="lsb-btn is-primary" data-import style="margin-left:auto">⬆ 导入</button>
          </div>
          <div class="lsb-row-desc" style="margin-top:10px">
            ⚠️ 覆盖模式会替换同名键的全部现值；导入后建议刷新页面。备份包含各模块数据与配置，
            请勿分享给不信任的人（可能含 Cookie 以外的敏感本地数据）。
          </div>`

        host.querySelector('[data-export]').onclick = () => {
          const name = `lsb-backup-${today()}.json`
          if (download(name, JSON.stringify(dump))) {
            api.ui.toast(`已下载 ${name}`, { type: 'success' })
          } else {
            api.ui.toast('下载失败，请用「复制到剪贴板」', { type: 'error' })
          }
        }
        host.querySelector('[data-copy]').onclick = async () => {
          try {
            await navigator.clipboard.writeText(JSON.stringify(dump))
            api.ui.toast('已复制到剪贴板', { type: 'success' })
          } catch {
            api.ui.toast('剪贴板不可用', { type: 'error' })
          }
        }

        const ta = host.querySelector('[data-json]')
        host.querySelector('[data-file]').onchange = async (e) => {
          const f = e.target.files?.[0]
          if (!f) return
          ta.value = await f.text()
          api.ui.toast(`已读取 ${f.name}，点击「导入」确认`)
        }
        host.querySelector('[data-import]').onclick = async () => {
          let payload
          try {
            payload = JSON.parse(ta.value)
          } catch {
            api.ui.toast('JSON 解析失败', { type: 'error' })
            return
          }
          const merge = host.querySelector('[data-merge]').checked
          const ok = await api.ui.confirm(
            merge ? `以合并模式导入 ${payload.count ?? '?'} 键？现有同名键保留。` : '以覆盖模式导入？同名键将被替换！',
            { title: '导入确认' },
          )
          if (!ok) return
          try {
            const r = api.admin.importAll(payload, { merge })
            api.ui.toast(`导入完成：写入 ${r.imported}，跳过 ${r.skipped}；建议刷新页面`, { type: 'success', timeout: 5000 })
          } catch (e) {
            api.ui.toast(e.message, { type: 'error' })
          }
        }
      },
    })

    function today() {
      const x = new Date()
      const p = (n) => String(n).padStart(2, '0')
      return x.getFullYear() + p(x.getMonth() + 1) + p(x.getDate())
    }

    /* ── 调试接口 ── */
    api.handle('data-migration:debug', () => ({
      export: () => api.admin.exportAll(),
      import: (payload, opts) => api.admin.importAll(payload, opts),
    }))

    return {}
  }

  const w = typeof unsafeWindow !== 'undefined' ? unsafeWindow : window
  if (w.LSB && w.LSB.register) w.LSB.register(manifest, setup)
  else {
    w.LSB_PLUGINS = w.LSB_PLUGINS || []
    w.LSB_PLUGINS.push({ manifest, setup })
  }
})()

;
(function () {
  'use strict'

  const manifest = {
    id: 'annual-report',
    name: '年度报告',
    version: '1.0.1',
    description: '聚合全部本地数据出一份「我的 linux.sb 这一年」',
    author: 'you',
    requires: { base: '^0.1.0' },
    permissions: ['read', 'storage', 'ui', 'events'],
  }

  const DAYS = 365

  function setup(api) {
    let lastMd = null

    async function collect() {
      const since = Date.now() - DAYS * 864e5
      const safe = async (label, fn) => {
        try {
          return { label, value: await fn() }
        } catch {
          return { label, value: null } // 模块未安装 / 被停用
        }
      }

      const [points, checkin, reading, inbox, hits, archive] = await Promise.all([
        safe('积分趋势', () => api.request('points-ledger:series', { days: DAYS })),
        safe('签到日历', () => api.request('checkin-calendar:debug')),
        safe('断点续读', () => api.request('resume-reading:debug')),
        safe('未读哨兵', () => api.request('unread-sentinel:debug')),
        safe('机会监控', () => api.request('forum-watch:debug')),
        safe('个人存档', () => api.request('my-archive:summary')),
      ])

      /* 积分 */
      let pointsStats = null
      if (points.value && points.value.length >= 2) {
        const s = points.value
        const first = s[0]
        const lastP = s[s.length - 1]
        const peak = s.reduce((m, x) => (x.p > m.p ? x : m), s[0])
        pointsStats = {
          start: first.p,
          end: lastP.p,
          delta: lastP.p - first.p,
          peak: peak.p,
          snapshots: s.length,
          spark: s.map((x) => x.p),
        }
      }

      /* 签到 */
      let checkinStats = null
      if (checkin.value) {
        const recs = checkin.value.recs()
        const okDays = Object.keys(recs).filter((k) => recs[k].s === 'ok')
        const inWindow = okDays.filter((k) => new Date(k + 'T12:00:00').getTime() >= since)
        checkinStats = { totalOk: okDays.length, windowOk: inWindow.length, streak: checkin.value.streak() }
      }

      /* 阅读 */
      let readingStats = null
      if (reading.value) {
        const all = reading.value.all()
        const list = Object.entries(all)
          .map(([id, r]) => ({ id: Number(id), title: r.title, f: r.f, ts: r.ts }))
          .sort((a, b) => b.ts - a.ts)
        readingStats = { count: list.length, recent: list.slice(0, 3) }
      }

      return {
        since,
        sections: [
          { key: 'points', label: '📈 积分轨迹', ok: !!pointsStats, stats: pointsStats, raw: null },
          {
            key: 'checkin',
            label: '✅ 签到',
            ok: !!checkinStats,
            stats: checkinStats,
            raw: null,
          },
          { key: 'reading', label: '📖 阅读足迹', ok: !!readingStats, stats: readingStats, raw: null },
          {
            key: 'inbox',
            label: '🔔 消息箱动态',
            ok: !!inbox.value,
            stats: inbox.value ? { count: inbox.value.inbox().length } : null,
            raw: null,
          },
          {
            key: 'hits',
            label: '🎯 机会命中',
            ok: !!hits.value,
            stats: hits.value ? { count: hits.value.hits().length } : null,
            raw: null,
          },
          {
            key: 'archive',
            label: '🗄 个人存档',
            ok: !!archive.value,
            stats: archive.value,
            raw: null,
          },
        ],
      }
    }

    /* ── 渲染 ── */
    function verdict(points, checkin) {
      const out = []
      if (points && points.delta !== 0) {
        out.push(points.delta > 0 ? `这一年净赚 ${points.delta} 分，攒饼能力在线。` : `这一年净亏 ${Math.abs(points.delta)} 分，消费需节制。`)
      }
      if (checkin && checkin.streak >= 7) out.push(`连续签到 ${checkin.streak} 天，毅力可嘉。`)
      return out
    }

    function renderHtml(data) {
      const sec = data.sections
      const row = (label, val, muted) =>
        `<div class="lsb-row"><span>${label}</span><strong style="margin-left:auto;${muted ? 'color:var(--text-muted,#888);font-weight:400' : ''}">${val}</strong></div>`
      let html = ''

      // 积分
      const p = sec.find((s) => s.key === 'points')
      html += `<h3 style="margin:10px 0 4px">📈 积分轨迹</h3>`
      if (p.ok) {
        const st = p.stats
        html +=
          row('区间变化', `${st.start} → ${st.end}`) +
          row('净增减', `${st.delta > 0 ? '+' : ''}${st.delta}`, false) +
          row('期间峰值', String(st.peak)) +
          row('快照次数', String(st.snapshots))
        // sparkline
        if (st.spark.length > 1) {
          const min = Math.min(...st.spark)
          const max = Math.max(...st.spark)
          const span = max - min || 1
          const pts = st.spark.map((v, i) => `${(i / (st.spark.length - 1)) * 300},${30 - ((v - min) / span) * 26}`).join(' ')
          html += `<svg width="300" height="34" style="margin-top:4px"><polyline points="${pts}" fill="none" stroke="var(--brand,#5eaaa0)" stroke-width="2"/></svg>`
        }
      } else {
        html += `<div class="lsb-empty">安装「积分趋势」并产生快照后解锁。</div>`
      }

      // 签到
      const c = sec.find((s) => s.key === 'checkin')
      html += `<h3 style="margin:14px 0 4px">✅ 签到</h3>`
      html += c.ok
        ? row('累计签到', `${c.stats.totalOk} 天`) + row('近一年', `${c.stats.windowOk} 天`) + row('当前连击', `${c.stats.streak} 天`)
        : `<div class="lsb-empty">安装「签到日历」后解锁。</div>`

      // 阅读
      const r = sec.find((s) => s.key === 'reading')
      html += `<h3 style="margin:14px 0 4px">📖 阅读足迹</h3>`
      html += r.ok
        ? row('追踪帖子', `${r.stats.count} 帖`) +
          (r.stats.recent.length
            ? `<div class="lsb-row-desc" style="margin-top:4px">最近在读：${r.stats.recent.map((x) => api.util.esc(x.title || '#' + x.id)).join('、')}</div>`
            : '')
        : `<div class="lsb-empty">安装「断点续读」后解锁。</div>`

      // 其余计数行
      for (const key of ['inbox', 'hits']) {
        const s = sec.find((x) => x.key === key)
        html += `<h3 style="margin:14px 0 4px">${s.label}</h3>`
        html += s.ok ? row('数值', String(s.stats.count ?? (s.stats.online ? '在线' : '离线'))) : `<div class="lsb-empty">对应模块未安装或无数据。</div>`
      }

      // 存档
      const a = sec.find((x) => x.key === 'archive')
      html += `<h3 style="margin:14px 0 4px">🗄 个人存档</h3>`
      html += a.ok
        ? row('主题 / 回帖', `${a.stats.topicCount} / ${a.stats.replyCount}`)
        : `<div class="lsb-empty">安装「个人存档」后解锁。</div>`

      // 判词
      const v = verdict(p.ok ? p.stats : null, c.ok ? c.stats : null)
      if (v.length) {
        html += `<div class="lsb-row" style="border:0;margin-top:10px"><em>${v.map(api.util.esc).join(' ')}</em></div>`
      }
      return html
    }

    function buildMd(data) {
      const L = [`# 我的 linux.sb 这一年`, '', `- 统计窗口：近 ${DAYS} 天`, `- 生成时间：${new Date().toLocaleString('zh-CN')}`, '']
      const s = Object.fromEntries(data.sections.map((x) => [x.key, x]))
      L.push(`## 📈 积分轨迹`)
      if (s.points.ok) {
        L.push(`- ${s.points.stats.start} → ${s.points.stats.end}（净增减 **${s.points.stats.delta > 0 ? '+' : ''}${s.points.stats.delta}**）`)
        L.push(`- 期间峰值 ${s.points.stats.peak} · 快照 ${s.points.stats.snapshots} 次`)
      } else L.push('- （无数据）')
      L.push('', `## ✅ 签到`)
      L.push(s.checkin.ok ? `- 累计 ${s.checkin.stats.totalOk} 天 · 近一年 ${s.checkin.stats.windowOk} 天 · 连击 ${s.checkin.stats.streak} 天` : '- （无数据）')
      L.push('', `## 📖 阅读足迹`)
      if (s.reading.ok) {
        L.push(`- 追踪 ${s.reading.stats.count} 帖`)
        for (const x of s.reading.stats.recent) L.push(`  - [${x.title || '#' + x.id}](${api.routes.topic(x.id)})`)
      } else L.push('- （无数据）')
      for (const [key, label] of [['inbox', '消息箱'], ['hits', '机会命中']]) {
        const x = s[key]
        L.push('', `## ${label}`)
        L.push(x.ok ? '- 有记录' : '- （无数据）')
      }
      L.push('', `## 🗄 个人存档`)
      L.push(s.archive.ok ? `- 主题 ${s.archive.stats.topicCount} · 回帖 ${s.archive.stats.replyCount}` : '- （无数据）')
      return L.join('\n')
    }

    /* ── 面板 ── */
    api.ui.tab({
      name: '年度报告',
      order: 70,
      render(host) {
        host.innerHTML = '<div class="lsb-empty">汇总中…</div>'
        collect().then((data) => {
          host.innerHTML =
            `<div class="lsb-cal-head"><strong>我的 linux.sb 这一年</strong>` +
            `<span class="lsb-row-desc">窗口：近 ${DAYS} 天</span></div>` +
            renderHtml(data)
          const bar = document.createElement('div')
          bar.className = 'lsb-actions'
          bar.style.border = '0'
          const md = document.createElement('button')
          md.className = 'lsb-btn is-primary'
          md.textContent = '⬇ 导出 Markdown'
          md.onclick = () => {
            lastMd = buildMd(data)
            try {
              const blob = new Blob([lastMd], { type: 'text/markdown' })
              const a = document.createElement('a')
              a.href = URL.createObjectURL(blob)
              a.download = `linuxsb-year-report-${today()}.md`
              a.click()
              setTimeout(() => URL.revokeObjectURL(a.href), 4000)
            } catch {
              api.ui.toast('下载失败，可用调试接口取文本', { type: 'error' })
            }
          }
          bar.appendChild(md)
          host.appendChild(bar)
        })
      },
    })

    function today() {
      const x = new Date()
      const p = (n) => String(n).padStart(2, '0')
      return x.getFullYear() + p(x.getMonth() + 1) + p(x.getDate())
    }

    /* ── 调试 ── */
    api.handle('annual-report:debug', () => ({
      collect,
      buildMd: async () => {
        lastMd = buildMd(await collect())
        return lastMd
      },
      lastMd: () => lastMd,
    }))

    return {}
  }

  const w = typeof unsafeWindow !== 'undefined' ? unsafeWindow : window
  if (w.LSB && w.LSB.register) w.LSB.register(manifest, setup)
  else {
    w.LSB_PLUGINS = w.LSB_PLUGINS || []
    w.LSB_PLUGINS.push({ manifest, setup })
  }
})()

;
(function () {
  'use strict'

  const manifest = {
    id: 'skin',
    name: '界面精修',
    version: '1.1.49',
    description: '氢壳 + 正文排版/列表密度/代码块/楼层优化/限宽阅读，分项开关',
    author: 'you',
    requires: { base: '^0.1.0' },
    permissions: ['ui', 'storage', 'events', 'read'],
    config: {
      shell: { type: 'switch', label: '氢壳（左栏导航 + 顶栏）', default: true },
      typography: { type: 'switch', label: '正文排版（行高 1.75 · 中文字体栈）', default: true },
      density: {
        type: 'select',
        label: '列表密度',
        default: '舒适',
        options: ['紧凑', '舒适'],
      },
      codeblock: { type: 'switch', label: '代码块样式强化', default: true },
      floors: { type: 'switch', label: '楼层优化（分隔线）', default: true },
      measure: { type: 'switch', label: '宽屏限宽阅读（≥1280px 生效）', default: false },
    },
  }

  function setup(api) {
    let cfg = api.config()
    let searchHome = null
    let userCardHome = null
    const extrasHomes = new Map()
    const asideHomes = new Map()
    let themeToggleHome = null
    let colorSchemeHome = null
    let onlineObs = null
    let extrasObs = null
    let timelineRaf = 0
    let refreshTimer = 0
    let windowListening = false
    let spaSerial = 0
    let spaFilledSerial = 0
    let toolsCache = null
    let spaProgressTimer = 0
    let spaIgnorePop = false
    let spaBound = false
    let homeInf = null
    let spaViewKey = ''
    const VIEW_CACHE_MAX = 5
    const HOME_STASH_REFRESH_MS = 30000
    const viewCache = new Map()
    let homeStashTimer = 0
    let homeStashInflight = null
    let homeStashGen = 0
    let homeStashPending = false

    /* ── 共存检测：色彩主题已由其它脚本负责，本模块只做排版层，天然无冲突。
       若未来加入色彩子项，须在此让位。 ── */
    const themesPresent = !!document.querySelector('style[data-themes-plugin]')

    const FONT_SANS =
      "system-ui,-apple-system,'Segoe UI','PingFang SC','Hiragino Sans GB','Microsoft YaHei','Noto Sans SC',sans-serif"
    const FONT_MONO =
      "ui-monospace,SFMono-Regular,'Cascadia Code',Consolas,'JetBrains Mono','Noto Sans Mono CJK SC',monospace"

    function esc(s) {
      return String(s ?? '').replace(/[&<>"']/g, (c) =>
        ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c],
      )
    }

    function shellCss() {
      return `
        html.lsb-skin-shell-on{
          --lsb-shell-header:48px;
          --lsb-shell-rail:240px;
          --lsb-shell-gutter:12px;
          --lsb-shell-panel-pad:24px;
          --lsb-shell-main-inset:calc(var(--lsb-shell-gutter) + var(--lsb-shell-panel-pad));
          --lsb-shell-aside:280px;
          --lsb-shell-timeline:72px;
          --lsb-radius:12px;
          --lsb-radius-sm:8px;
          --lsb-radius-lg:16px;
          background:var(--bg,#f4f5f7);
          color:var(--text,#222);
        }
        html.lsb-skin-shell-topic{--lsb-shell-main-inset:var(--lsb-shell-gutter)}
        html.lsb-skin-shell-user{--lsb-shell-main-inset:calc(var(--lsb-shell-gutter) + 12px)}
        html[data-themes-color-mode="dark"],html[data-dark-mode-theme="dark"]{color-scheme:dark}
        html[data-themes-color-mode="light"],html[data-dark-mode-theme="light"]{color-scheme:light}
        #lsb-shell{
          display:none;position:fixed;inset:0;z-index:7999;pointer-events:none;
        }
        #lsb-shell > *{pointer-events:auto}
        #lsb-shell-header{
          position:fixed;top:0;left:0;right:0;height:var(--lsb-shell-header);z-index:8002;
          display:grid;align-items:center;
          grid-template-columns:var(--lsb-shell-rail) minmax(160px,360px) minmax(0,1fr) auto auto;
          column-gap:0;padding:0 16px 0 0;
          background:color-mix(in srgb,var(--panel,#fff) 78%,transparent);
          backdrop-filter:blur(16px) saturate(140%);
          -webkit-backdrop-filter:blur(16px) saturate(140%);
          box-shadow:0 1px 0 color-mix(in srgb,var(--line,#ddd) 55%,transparent);
          font-family:${FONT_SANS};
        }
        #lsb-shell-rail{
          position:fixed;top:0;left:0;bottom:0;width:var(--lsb-shell-rail);z-index:8001;
          display:flex;flex-direction:column;
          background:var(--bg,#f4f5f7);color:var(--text,#222);
          border-right:1px solid var(--line-soft,#e8e8e8);
          font-family:${FONT_SANS};
        }
        .lsb-shell-rail-scroll{flex:1;min-height:0;overflow:hidden;padding:56px 12px 12px}
        .lsb-shell-me{margin:0 0 14px}
        .lsb-shell-me .sidebar-card.user-card{
          margin:0;padding:10px 10px;border:0;box-shadow:none;
          border-radius:var(--lsb-radius);
          background:color-mix(in srgb,var(--panel,#fff) 72%,transparent);
        }
        .lsb-shell-me .user-header-info{gap:8px}
        .lsb-shell-me .user-avatar-big img,.lsb-shell-me .avatar-img{
          width:40px!important;height:40px!important;
        }
        .lsb-shell-me .user-name{font-size:13px;font-weight:600;white-space:nowrap;overflow:hidden;text-overflow:ellipsis}
        .lsb-shell-me .user-rank{font-size:11px;color:var(--text-muted,#888)}
        .lsb-shell-rail-foot{padding:10px 12px 14px;border-top:1px solid var(--line-soft,#e8e8e8)}
        .lsb-shell-brand{
          display:flex;align-items:center;gap:8px;margin:0;width:100%;height:100%;
          padding:0 14px;font-weight:700;font-size:14px;letter-spacing:-.02em;
          color:var(--text,#222);text-decoration:none;
          min-width:0;white-space:nowrap;overflow:hidden;
        }
        .lsb-shell-logo{
          flex:0 0 22px;width:22px;height:22px;border-radius:6px;display:block;
        }
        .lsb-shell-search-host{
          min-width:0;max-width:360px;width:100%;box-sizing:border-box;
          padding-left:var(--lsb-shell-main-inset);
        }
        .lsb-shell-search-host .search-form,.lsb-shell-search-host .lsb-shell-search{
          display:flex;align-items:center;gap:8px;margin:0;padding:3px 6px 3px 10px;
          width:100%;max-width:none;justify-self:stretch;
          grid-column:auto;grid-row:auto;
          border-radius:var(--lsb-radius);overflow:hidden;
          background:color-mix(in srgb,var(--bg,#f4f5f7) 88%,transparent);
        }
        .lsb-shell-search-host .search-page-link{
          display:flex;align-items:center;margin:0;padding:0;width:100%;max-width:none;height:30px;
          grid-area:auto;grid-column:auto;grid-row:auto;justify-self:stretch;
          border:1px solid var(--line,#ddd);border-radius:var(--lsb-radius);
          background:color-mix(in srgb,var(--bg,#f4f5f7) 88%,transparent);
          color:var(--text-subtle,#888);text-decoration:none;overflow:hidden;
        }
        .lsb-shell-search-host .search-page-fake-input{
          flex:1;min-width:0;padding:0 10px;font-size:13px;
          white-space:nowrap;overflow:hidden;text-overflow:ellipsis;
        }
        .lsb-shell-search-host .search-page-fake-icon{
          display:inline-flex;align-items:center;justify-content:center;
          flex:0 0 30px;width:30px;height:100%;
        }
        .lsb-shell-search-host select{
          border:0;border-radius:var(--lsb-radius-sm);background:transparent;
          color:var(--text,#222);font-size:12px;height:26px;
        }
        .lsb-shell-search-host input[type=search],.lsb-shell-search-host input[name=q]{
          flex:1;min-width:0;height:26px;border:0;border-radius:var(--lsb-radius-sm);
          background:transparent;color:var(--text,#222);padding:0 8px;font-size:13px;
        }
        .lsb-shell-search-host button{
          border:0;border-radius:var(--lsb-radius-sm);height:26px;padding:0 10px;
          background:var(--brand-soft,#e8f4f2);color:var(--brand,#5eaaa0);font-size:12px;cursor:pointer;
        }
        .lsb-shell-extras{
          display:flex;align-items:center;gap:14px;min-width:0;overflow:hidden;
          margin-left:16px;
        }
        .lsb-shell-extras a{
          flex:0 0 auto;color:var(--text,#222);text-decoration:none;font-size:13px;font-weight:500;
          white-space:nowrap;
        }
        .lsb-shell-where{
          margin-left:16px;font-size:13px;font-weight:600;letter-spacing:-.01em;
          color:var(--text,#222);white-space:nowrap;overflow:hidden;text-overflow:ellipsis;max-width:22vw;
        }
        .lsb-shell-theme{margin-left:8px;display:flex;align-items:center;gap:8px;overflow:visible;position:relative}
        .lsb-shell-theme [data-themes-mode-toggle]{
          border:0;background:transparent;color:var(--text,#222);cursor:pointer;
          width:32px;height:32px;padding:4px;border-radius:var(--lsb-radius-sm);
        }
        .lsb-shell-theme [data-themes-mode-toggle] svg{display:block;width:18px;height:18px}
        .lsb-shell-theme .dark-mode-control{position:relative;flex:0 0 auto;grid-area:auto;justify-self:auto}
        .lsb-shell-theme .dark-mode-menu{z-index:8003}
        .lsb-shell-theme .color-scheme-top-link{
          display:inline-flex;width:30px;height:30px;align-items:center;justify-content:center;
          grid-area:auto;justify-self:auto;flex:0 0 30px;
          color:var(--text-muted,#888);text-decoration:none;
        }
        .lsb-shell-theme .color-scheme-top-link svg{width:17px;height:17px;display:block}
        #lsb-shell-aside{
          display:none;position:fixed;top:var(--lsb-shell-header);right:0;bottom:0;
          width:var(--lsb-shell-aside);z-index:7999;overflow:auto;padding:12px 10px 16px;
          background:var(--bg,#f4f5f7);color:var(--text,#222);
          border-left:1px solid var(--line-soft,#e8e8e8);
          font-family:${FONT_SANS};
        }
        #lsb-shell-aside .sidebar-card{
          margin:0 0 10px;padding:10px 10px 8px;border-radius:var(--lsb-radius);
          background:color-mix(in srgb,var(--panel,#fff) 78%,transparent);
        }
        .lsb-shell-nav-section{margin:0 0 16px}
        .lsb-shell-nav-section h2{
          margin:0 8px 6px;font-size:11px;font-weight:600;color:var(--text-muted,#888);
          letter-spacing:.04em;
        }
        .lsb-shell-nav .lsb-shell-link{
          display:flex;align-items:center;justify-content:space-between;gap:8px;padding:6px 10px;border-radius:var(--lsb-radius-sm);
          color:var(--text,#222);text-decoration:none;font-size:13px;font-weight:500;
          width:100%;border:0;background:transparent;cursor:pointer;text-align:left;font-family:inherit;box-sizing:border-box;
        }
        .lsb-shell-nav .lsb-shell-link-label{
          min-width:0;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;
        }
        .lsb-shell-nav .lsb-shell-count{
          flex:0 0 auto;font-size:11px;font-weight:500;color:var(--text-muted,#888);
          font-variant-numeric:tabular-nums;
        }
        .lsb-shell-nav a.is-active{
          background:var(--brand-soft,#e8f4f2);color:var(--brand,#5eaaa0);font-weight:600;
        }
        .lsb-shell-settings{
          width:100%;height:32px;border:0;border-radius:var(--lsb-radius-sm);cursor:pointer;
          background:transparent;color:var(--text,#222);font-size:13px;font-weight:600;
        }
        .lsb-shell-settings:active,.lsb-shell-nav .lsb-shell-link:active{transform:scale(.98)}
        #lsb-shell-timeline{
          position:fixed;top:calc(var(--lsb-shell-header) + 20px);right:14px;bottom:28px;
          width:var(--lsb-shell-timeline);z-index:7998;
          display:flex;flex-direction:column;align-items:center;gap:8px;
          font-family:${FONT_SANS};font-size:11px;font-weight:600;color:var(--text-muted,#888);
        }
        #lsb-shell-timeline[hidden]{display:none!important}
        html.lsb-skin-shell-on .image-lightbox-image{max-width:100%;max-height:100%}
        .lsb-shell-edge{
          border:0;background:transparent;color:var(--text,#222);cursor:pointer;
          font:inherit;font-weight:600;padding:4px;
        }
        .lsb-shell-edge:active{transform:scale(.97)}
        .lsb-shell-now{text-align:center;line-height:1.25}
        .lsb-shell-now strong{display:block;color:var(--text,#222);font-size:12px}
        .lsb-shell-track{
          flex:1;width:3px;padding:0;border:0;border-radius:99px;cursor:pointer;
          background:var(--line-soft,#e6e6e6);position:relative;min-height:64px;
        }
        .lsb-shell-thumb{
          position:absolute;left:50%;top:var(--lsb-timeline-progress,0%);
          width:8px;height:8px;margin:-4px 0 0 -4px;border-radius:50%;
          background:var(--brand,#5eaaa0);
        }
        html.lsb-skin-shell-on li.post-item{padding-block:8px!important;border-radius:var(--lsb-radius)}
        html.lsb-skin-shell-on li.post-item .post-title{
          font-weight:600;font-size:14px;letter-spacing:-.01em;line-height:1.3;
        }
        html.lsb-skin-shell-on li.post-item .post-meta{
          font-size:12px;font-weight:400;color:var(--text-muted,#888);
        }
        html.lsb-skin-shell-on li.post-item .post-avatar img{
          width:32px!important;height:32px!important;border-radius:50%;
        }
        html.lsb-skin-shell-on li.post-item:not(.post-entry) .meta-icon{display:none}
        html.lsb-skin-shell-on main.wrap{
          max-width:none!important;margin-left:0!important;margin-right:0!important;width:auto!important;
          padding-left:var(--lsb-shell-gutter)!important;
        }
        html.lsb-skin-shell-on .forum-layout.forum-layout-has-sidebar{gap:12px!important}
        html.lsb-skin-shell-on main.wrap,
        html.lsb-skin-shell-on .forum-main,
        html.lsb-skin-shell-on .home-shell{
          border-radius:var(--lsb-radius-lg);
        }
        html.lsb-skin-shell-on ul.post-list{
          border-radius:var(--lsb-radius-lg);
        }
        html.lsb-skin-shell-on li.post-entry{
          border-radius:var(--lsb-radius);
        }
        html.lsb-skin-shell-on .post-content img,
        html.lsb-skin-shell-on .post-content video{
          border-radius:var(--lsb-radius-sm);
        }
        html.lsb-skin-shell-on .pagination a,
        html.lsb-skin-shell-on .pagination span,
        html.lsb-skin-shell-on .tab-link,
        html.lsb-skin-shell-on .sort-tabs a{
          border-radius:var(--lsb-radius-sm)!important;
        }
        html.lsb-skin-shell-on .pagination-bar.sb-infinite-scroll-pagination-hidden{
          display:none!important;
        }
        html.lsb-skin-shell-on form.ajax-reply-form,
        html.lsb-skin-shell-on .reply-box,
        html.lsb-skin-shell-on textarea{
          border-radius:var(--lsb-radius)!important;
        }
        @media(min-width:900px){
          html.lsb-skin-shell-on #lsb-shell{display:block}
          html.lsb-skin-shell-on{padding-top:var(--lsb-shell-header);padding-left:var(--lsb-shell-rail)}
          html.lsb-skin-shell-topic{padding-right:var(--lsb-shell-timeline)}
          html.lsb-skin-shell-on .lsb-native-header-hidden,
          html.lsb-skin-shell-on .forum-more-region{display:none!important}
          html.lsb-skin-shell-on .lsb-native-sidebar-hidden{display:none!important}
          html.lsb-skin-shell-on .forum-layout.forum-layout-has-sidebar{
            display:block!important;grid-template-columns:1fr!important;
          }
          html.lsb-skin-shell-on .lsb-launcher{display:none!important}
          html.lsb-skin-shell-user{padding-right:var(--lsb-shell-aside)}
          html.lsb-skin-shell-user #lsb-shell-aside{display:block}
          html.lsb-skin-shell-on .image-lightbox-overlay{
            top:var(--lsb-shell-header);left:var(--lsb-shell-rail);right:0;bottom:0;
          }
          html.lsb-skin-shell-topic .image-lightbox-overlay{right:var(--lsb-shell-timeline)}
          html.lsb-skin-shell-user .image-lightbox-overlay{right:var(--lsb-shell-aside)}
        }
        @media(min-width:1100px){
          html.lsb-skin-shell-on{padding-right:var(--lsb-shell-aside)}
          html.lsb-skin-shell-topic{padding-right:var(--lsb-shell-aside)}
          html.lsb-skin-shell-on #lsb-shell-aside{display:block}
          html.lsb-skin-shell-on #lsb-shell-timeline{display:none!important}
          html.lsb-skin-shell-on .image-lightbox-overlay{right:var(--lsb-shell-aside)}
        }
        @media(hover:hover) and (pointer:fine){
          .lsb-shell-nav .lsb-shell-link:hover{background:color-mix(in srgb,var(--bg,#fff) 40%,transparent)}
          .lsb-shell-extras a:hover{color:var(--brand,#5eaaa0)}
          .lsb-shell-settings:hover{background:var(--brand-soft,#e8f4f2)}
        }
        @media(prefers-reduced-transparency:reduce){
          #lsb-shell-header{background:var(--panel,#fff);backdrop-filter:none;-webkit-backdrop-filter:none}
        }
        @media(prefers-reduced-motion:reduce){
          html.lsb-skin-shell-on #lsb-shell *{scroll-behavior:auto!important;transform:none!important}
          #lsb-shell-progress,
          #lsb-shell-progress [data-lsb-shell-progress-bar]{transition:none!important}
        }
        #lsb-shell-progress{
          --lsb-shell-progress:0;
          position:fixed;top:0;left:0;right:0;z-index:8002;height:2px;
          pointer-events:none;opacity:0;background:transparent;
          transition:opacity 120ms cubic-bezier(.23,1,.32,1);
        }
        #lsb-shell-progress[data-phase="loading"],
        #lsb-shell-progress[data-phase="done"]{opacity:1}
        #lsb-shell-progress [data-lsb-shell-progress-bar]{
          display:block;width:100%;height:100%;
          transform:scaleX(var(--lsb-shell-progress));transform-origin:left center;
          background:var(--brand,#5eaaa0);
          transition:transform 200ms cubic-bezier(.23,1,.32,1);
        }
      `
    }

    function css() {
      const parts = []

      if (cfg.shell) parts.push(shellCss())

      if (cfg.typography) {
        parts.push(`
          html.lsb-skin-type-on .post-content{font-family:${FONT_SANS};line-height:1.75;word-break:break-word}
          html.lsb-skin-type-on .post-content p{margin-block:.85em}
          html.lsb-skin-type-on .post-title{line-height:1.45}
        `)
      }

      if (cfg.density === '紧凑') {
        parts.push(`
          html.lsb-skin-density-compact ul.post-list li.post-item{padding-block:3px!important}
          html.lsb-skin-density-compact li.post-item .post-avatar img{width:32px!important;height:32px!important}
        `)
      }

      if (cfg.codeblock) {
        parts.push(`
          html.lsb-skin-code-on .post-content pre{
            background:var(--bg,#f6f8fa)!important;border:1px solid var(--line,#ddd)!important;
            border-radius:8px!important;padding:12px 14px!important;overflow-x:auto!important;
            font-family:${FONT_MONO}!important;font-size:13px!important;line-height:1.55!important;
          }
          html.lsb-skin-code-on .post-content code{font-family:${FONT_MONO}}
          html.lsb-skin-code-on .post-content :not(pre)>code{
            background:var(--line-soft,#eceff2);border-radius:4px;padding:1px 5px;font-size:.92em;
          }
        `)
      }

      if (cfg.floors) {
        parts.push(`
          html.lsb-skin-floors-on li.post-entry{border-bottom:1px solid var(--line-soft,#eee)}
        `)
      }

      if (cfg.measure) {
        parts.push(`
          @media(min-width:1280px){
            html.lsb-skin-measure-on main.wrap{max-width:1120px!important;margin-inline:auto!important}
            html.lsb-skin-measure-on .post-content>p{max-width:74ch}
          }
        `)
      }

      return parts.join('\n')
    }

    /** 状态类挂 <html> 上：CSS 特异性干净，测试也容易断言 */
    function applyMarkers() {
      const root = document.documentElement
      root.classList.toggle('lsb-skin-type-on', !!cfg.typography)
      root.classList.toggle('lsb-skin-density-compact', cfg.density === '紧凑')
      root.classList.toggle('lsb-skin-code-on', !!cfg.codeblock)
      root.classList.toggle('lsb-skin-floors-on', !!cfg.floors)
      root.classList.toggle('lsb-skin-measure-on', !!cfg.measure)
      root.classList.toggle('lsb-skin-shell-on', !!cfg.shell)
      root.classList.toggle('lsb-skin-shell-topic', !!cfg.shell && api.page?.type === 'topic')
      root.classList.toggle('lsb-skin-shell-user', !!cfg.shell && api.page?.type === 'user')
    }

    function restyle() {
      applyMarkers()
      const id = 'lsb-skin-style'
      let el = document.getElementById(id)
      if (!el) {
        el = document.createElement('style')
        el.id = id
        document.head.appendChild(el)
      }
      el.textContent = css()
    }

    function nativeSidebars() {
      return [...document.querySelectorAll('aside.sidebar')].filter(
        (el) => el.id !== 'mobile-menu-drawer' && !el.classList.contains('mobile-menu-drawer'),
      )
    }

    function markNative(on) {
      document.querySelector('body > .top')?.classList.toggle('lsb-native-header-hidden', on)
      for (const el of nativeSidebars()) el.classList.toggle('lsb-native-sidebar-hidden', on)
    }

    function collectBoards() {
      const forums = api.forums || []
      const cached = api.store.get('boardCounts') || {}
      const live = {}
      for (const f of forums) {
        if (Number.isFinite(f.topics)) live[f.id] = f.topics
      }
      const counts = { ...cached, ...live }
      if (Object.keys(live).length) api.store.set('boardCounts', counts)
      if (forums.length) {
        return forums.map((f) => ({
          href: `/forum/${f.id}`,
          label: f.name,
          count: counts[f.id],
        }))
      }
      const seen = new Set()
      const out = []
      for (const a of document.querySelectorAll('.forum-nav a[href^="/forum/"]')) {
        const href = a.getAttribute('href')
        const label = (a.textContent || '').trim()
        if (!href || seen.has(href)) continue
        seen.add(href)
        const id = Number((href.match(/\/forum\/(\d+)/) || [])[1])
        out.push({ href, label, count: counts[id] })
      }
      return out
    }

    function collectTools() {
      if (toolsCache) return toolsCache
      const w = typeof unsafeWindow !== 'undefined' ? unsafeWindow : window
      const active = new Set(
        (w.LSB?.info?.().plugins || []).filter((p) => p.state === 'active').map((p) => p.id),
      )
      toolsCache = [
        { plugin: 'ai-summary', panel: 'ai-summary-history', label: 'AI 历史' },
        { plugin: 'checkin-calendar', panel: 'checkin-calendar', label: '签到日历' },
        { plugin: 'points-ledger', panel: 'points-ledger', label: '积分趋势' },
        { plugin: 'title-quotes', rpc: 'title-quotes:open', label: '称号行情' },
        { plugin: 'annual-report', panel: 'annual-report', label: '年度报告' },
      ]
        .filter((t) => active.has(t.plugin))
        .map(({ panel, rpc, label }) => (rpc ? { rpc, label } : { panel, label }))
      return toolsCache
    }

    function invalidateTools() {
      toolsCache = null
    }

    function locationText() {
      const p = api.page || {}
      if (p.type === 'home') {
        if (p.sort === 'lucky') return '抽奖'
        if (p.sort === 'card') return '发卡'
        if (p.sort === 'comment') return '新评论'
        return '全部主题'
      }
      if (p.type === 'forum') {
        const f = (api.forums || []).find((x) => x.id === p.id)
        return f?.name || '版块'
      }
      if (p.type === 'topic') {
        try {
          const title = api.parse.topic(document)?.title
          if (title) return title
        } catch {
          /* 解析失败则读标题节点 */
        }
        return (document.querySelector('h1.post-content-title')?.textContent || '').trim() || '帖子'
      }
      if (p.type === 'user') return '用户'
      if (p.type === 'featured') return '精华'
      if (p.type === 'footprint') return '足迹'
      if (p.type === 'gacha') return '称号抽取'
      if (p.type === 'gacha_market') return '称号交易'
      if (p.type === 'gacha_profile') return '我的称号'
      if (p.type === 'wallet') return '我的烧饼'
      if (p.type === 'invite') return '邀请中心'
      return 'LINUX SB'
    }

    function isActiveHref(href) {
      const p = api.page || {}
      if (href === '/' || href === '') return p.type === 'home'
      if (p.type === 'forum') return href === `/forum/${p.id}`
      return false
    }

    function restoreNode(el, home, cls) {
      if (!el) return
      el.classList.remove(cls)
      if (!home?.parent?.isConnected) {
        el.remove()
        return
      }
      if (home.next?.parentNode === home.parent) {
        home.parent.insertBefore(el, home.next)
      } else {
        home.parent.append(el)
      }
    }

    function adoptSearch(host) {
      if (!(host instanceof Element)) return
      if (host.querySelector('form, .search-page-link')) return
      const el =
        document.querySelector('body > .top .search-form') ||
        document.querySelector('body > .top .search-page-link') ||
        document.querySelector('.search-form') ||
        document.querySelector('a.search-page-link')
      if (!(el instanceof Element) || host.contains(el)) return
      searchHome = { parent: el.parentNode, next: el.nextSibling }
      el.classList.add('lsb-shell-search')
      host.append(el)
    }

    function restoreSearch() {
      const el = document.querySelector('.lsb-shell-search')
      restoreNode(el, searchHome, 'lsb-shell-search')
      searchHome = null
    }

    function findNativeUserCard() {
      const hosted = document.querySelector('#lsb-shell [data-lsb-shell-me] .sidebar-card.user-card')
      if (hosted) return hosted
      for (const side of nativeSidebars()) {
        const card = side.querySelector('.sidebar-card.user-card')
        if (card) return card
      }
      return document.querySelector('aside.sidebar .sidebar-card.user-card')
    }

    function isSelfUserCard(card) {
      if (!(card instanceof Element)) return false
      const uid = api.me?.uid
      if (uid == null) return true
      const href = card.querySelector('a.user-name')?.getAttribute('href') || ''
      return href.includes(`/user/${uid}`)
    }

    function findIncomingSelfCard(host) {
      for (const side of nativeSidebars()) {
        for (const card of side.querySelectorAll('.sidebar-card.user-card')) {
          if (host?.contains(card)) continue
          if (!isSelfUserCard(card)) continue
          return card
        }
      }
      return null
    }

    function userCardKey(card) {
      if (!(card instanceof Element)) return ''
      return [...card.querySelectorAll('a[href]')]
        .map((a) => a.getAttribute('href') || '')
        .join('\n')
    }

    function adoptUserCard(host) {
      if (!(host instanceof Element)) return
      const incoming = findIncomingSelfCard(host)
      const hosted = host.querySelector('.sidebar-card.user-card')
      if (incoming && incoming !== hosted) {
        if (hosted && userCardKey(hosted) === userCardKey(incoming)) return
        if (hosted) restoreUserCard()
        userCardHome = { parent: incoming.parentNode, next: incoming.nextSibling }
        incoming.classList.add('lsb-shell-user-card')
        host.append(incoming)
        return
      }
      if (hosted) return
      const card = findNativeUserCard()
      if (!(card instanceof Element) || host.contains(card) || !isSelfUserCard(card)) return
      userCardHome = { parent: card.parentNode, next: card.nextSibling }
      card.classList.add('lsb-shell-user-card')
      host.append(card)
    }

    function restoreUserCard() {
      const card = document.querySelector('.lsb-shell-user-card')
      restoreNode(card, userCardHome, 'lsb-shell-user-card')
      userCardHome = null
    }

    function extraLabel(a) {
      if (!(a instanceof Element)) return ''
      const text = [...a.childNodes]
        .filter((n) => n.nodeType === 3)
        .map((n) => (n.textContent || '').trim())
        .find(Boolean)
      return text || (a.getAttribute('aria-label') || '').trim()
    }

    function isPersonalExtra(href, label) {
      const name = String(label || '').replace(/\s+/g, '')
      if (/^我的/.test(name)) return true
      try {
        const path = new URL(href, location.href).pathname
        if (/^\/user\/\d+\/?$/.test(path)) return true
      } catch {
        /* ignore */
      }
      return false
    }

    function isJunkExtra(href, label) {
      const name = String(label || '').replace(/\s+/g, '')
      if (!name || /^\d+$/.test(name)) return true
      return isPersonalExtra(href, label)
    }

    function collectTopExtras() {
      const top = document.querySelector('body > .top')
      if (!top) return []
      return [...top.querySelectorAll('a.forum-enhancements-custom-top-link')].filter(
        (a) => a instanceof HTMLAnchorElement && extraLabel(a) && !isJunkExtra(a.href, extraLabel(a)),
      )
    }

    function adoptTopExtras(host) {
      if (!(host instanceof Element)) return
      for (const a of [...host.querySelectorAll('a[href]')]) {
        const label = extraLabel(a) || (a.textContent || '').trim()
        if (!isJunkExtra(a.href, label)) continue
        if (extrasHomes.has(a)) {
          restoreNode(a, extrasHomes.get(a), 'lsb-shell-extra-link')
          extrasHomes.delete(a)
        } else {
          a.remove()
        }
      }
      const have = new Set([...host.querySelectorAll('a[href]')].map((a) => a.href))
      for (const a of collectTopExtras()) {
        if (host.contains(a)) continue
        if (have.has(a.href)) {
          a.remove()
          continue
        }
        extrasHomes.set(a, { parent: a.parentNode, next: a.nextSibling })
        a.classList.add('lsb-shell-extra-link')
        host.append(a)
        have.add(a.href)
      }
      hydrateTopExtras(host, have)
      pruneJunkExtraNodes(host)
      snapshotTopExtras(host)
    }

    function pruneJunkExtraNodes(host) {
      if (!(host instanceof Element)) return
      for (const node of [...host.childNodes]) {
        if (node.nodeType === 3 && /^\s*\d+\s*$/.test(node.textContent || '')) {
          node.remove()
          continue
        }
        if (!(node instanceof Element)) continue
        const label = extraLabel(node) || (node.textContent || '').trim()
        if (node.matches('a[href]') && isJunkExtra(node.getAttribute('href'), label)) {
          if (extrasHomes.has(node)) {
            restoreNode(node, extrasHomes.get(node), 'lsb-shell-extra-link')
            extrasHomes.delete(node)
          } else {
            node.remove()
          }
          continue
        }
        if (!node.matches('a') && /^\d+$/.test(label.replace(/\s+/g, ''))) node.remove()
      }
    }

    function snapshotTopExtras(host) {
      if (!(host instanceof Element)) return
      const links = [...host.querySelectorAll('a[href]')]
        .map((a) => ({ href: a.getAttribute('href'), label: extraLabel(a) || (a.textContent || '').trim() }))
        .filter((x) => x.href && x.label && !isJunkExtra(x.href, x.label))
      if (links.length) api.store.set('topExtras', links)
    }

    function hydrateTopExtras(host, have) {
      if (!(host instanceof Element)) return
      const known = have || new Set([...host.querySelectorAll('a[href]')].map((a) => a.href))
      for (const item of api.store.get('topExtras') || []) {
        if (!item?.href || !item.label || isJunkExtra(item.href, item.label)) continue
        let abs
        try {
          abs = new URL(item.href, location.href).href
        } catch {
          continue
        }
        if (known.has(abs)) continue
        const a = document.createElement('a')
        a.setAttribute('href', item.href)
        a.textContent = item.label
        a.className = 'lsb-shell-extra-link'
        a.setAttribute('data-lsb-extra-keep', '1')
        host.append(a)
        known.add(abs)
      }
    }

    function restoreTopExtras() {
      for (const [a, home] of extrasHomes) restoreNode(a, home, 'lsb-shell-extra-link')
      extrasHomes.clear()
    }

    function adoptThemeToggle(host) {
      if (!(host instanceof Element)) return
      if (!host.querySelector('.color-scheme-top-link')) {
        const scheme =
          document.querySelector('body > .top a.color-scheme-top-link') ||
          document.querySelector('a.color-scheme-top-link')
        if (scheme && !host.contains(scheme)) {
          if (!colorSchemeHome) colorSchemeHome = { parent: scheme.parentNode, next: scheme.nextSibling }
          scheme.classList.add('lsb-shell-theme-scheme')
          host.append(scheme)
        }
      }
      if (host.querySelector('.dark-mode-control, [data-themes-mode-toggle]')) return
      const widget =
        document.querySelector('body > .top .dark-mode-control') ||
        document.querySelector('.dark-mode-control') ||
        document.querySelector('[data-themes-mode-toggle]')
      if (!widget || host.contains(widget)) return
      if (!themeToggleHome) themeToggleHome = { parent: widget.parentNode, next: widget.nextSibling }
      widget.classList.add('lsb-shell-theme-toggle')
      host.append(widget)
    }

    function restoreThemeToggle() {
      const widget = document.querySelector('.lsb-shell-theme-toggle')
      restoreNode(widget, themeToggleHome, 'lsb-shell-theme-toggle')
      themeToggleHome = null
      const scheme = document.querySelector('.lsb-shell-theme-scheme')
      restoreNode(scheme, colorSchemeHome, 'lsb-shell-theme-scheme')
      colorSchemeHome = null
    }

    function nativeCards() {
      return nativeSidebars().flatMap((side) => [...side.querySelectorAll('.sidebar-card')])
    }

    function pickAsideCards() {
      const hosted = [...document.querySelectorAll('#lsb-shell-aside .sidebar-card')]
      const all = [...nativeCards(), ...hosted]
      const seen = new Set()
      const uniq = all.filter((el) => {
        if (seen.has(el)) return false
        seen.add(el)
        return true
      })
      const text = (el) => (el.textContent || '').replace(/\s+/g, ' ').trim()
      const onUser = api.page?.type === 'user'
      const profile = onUser
        ? uniq.find(
            (c) =>
              c.classList.contains('user-card')
              && !c.classList.contains('lsb-shell-user-card')
              && !isSelfUserCard(c),
          )
        : null
      const bio = onUser ? uniq.find((c) => c.classList.contains('bio-card')) : null
      const quick = uniq.find((c) => text(c).startsWith('快捷功能'))
      const hot = uniq.find((c) => c.classList.contains('daily-hot-topics-card'))
      const stats = uniq.find((c) => c.classList.contains('stats-card'))
      const online = uniq.find((c) => c.classList.contains('online-users-card'))
      return [profile, bio, quick, hot, stats, online].filter(Boolean)
    }

    function adoptAsideCards(host) {
      if (!(host instanceof Element)) return
      for (const card of pickAsideCards()) {
        if (host.contains(card) || card.classList.contains('lsb-shell-user-card')) continue
        asideHomes.set(card, { parent: card.parentNode, next: card.nextSibling })
        card.classList.add('lsb-shell-aside-card')
        host.append(card)
      }
      hydrateAsideKeep(host)
      snapshotAsideKeep(host)
    }

    function cardLabel(el) {
      return (el.textContent || '').replace(/\s+/g, ' ').trim()
    }

    function snapshotAsideKeep(host) {
      if (!(host instanceof Element)) return
      const keep = { ...(api.store.get('asideKeep') || {}) }
      const live = [...host.querySelectorAll('.sidebar-card')].filter(
        (el) => !el.hasAttribute('data-lsb-aside-keep'),
      )
      const quick = live.find((c) => cardLabel(c).startsWith('快捷功能'))
      const stats = live.find((c) => c.classList.contains('stats-card'))
      const online = live.find((c) => c.classList.contains('online-users-card'))
      let changed = false
      if (quick) {
        const node = quick.cloneNode(true)
        node.querySelectorAll('[data-themes-mode-toggle], .dark-mode-control').forEach((n) => n.remove())
        keep.quick = node.outerHTML
        changed = true
      }
      if (stats) {
        keep.stats = stats.outerHTML
        changed = true
      }
      if (online) {
        keep.online = online.outerHTML
        changed = true
      }
      if (changed) api.store.set('asideKeep', keep)
    }

    function injectKeptCard(host, html, slot, before) {
      if (!html || host.querySelector(`[data-lsb-aside-keep="${slot}"]`)) return
      const box = document.createElement('div')
      box.innerHTML = html
      const el = box.firstElementChild
      if (!(el instanceof Element)) return
      el.setAttribute('data-lsb-aside-keep', slot)
      el.classList.add('lsb-shell-aside-card')
      if (before instanceof Node && before.parentNode === host) host.insertBefore(el, before)
      else host.append(el)
    }

    function hydrateAsideKeep(host) {
      if (!(host instanceof Element)) return
      const keep = api.store.get('asideKeep') || {}
      const live = [...host.querySelectorAll('.sidebar-card')].filter(
        (el) => !el.hasAttribute('data-lsb-aside-keep'),
      )
      const hasQuick = live.some((c) => cardLabel(c).startsWith('快捷功能'))
      const hasStats = live.some((c) => c.classList.contains('stats-card'))
      const hasOnline = live.some((c) => c.classList.contains('online-users-card'))
      if (hasQuick) host.querySelector('[data-lsb-aside-keep="quick"]')?.remove()
      else injectKeptCard(host, keep.quick, 'quick', host.querySelector('.daily-hot-topics-card'))
      if (hasStats) host.querySelector('[data-lsb-aside-keep="stats"]')?.remove()
      else {
        const hot = host.querySelector('.daily-hot-topics-card')
        injectKeptCard(host, keep.stats, 'stats', hot?.nextSibling)
      }
      if (hasOnline) host.querySelector('[data-lsb-aside-keep="online"]')?.remove()
      else injectKeptCard(host, keep.online, 'online', null)
    }

    function restoreAsideCards() {
      for (const [card, home] of asideHomes) restoreNode(card, home, 'lsb-shell-aside-card')
      asideHomes.clear()
    }

    function pruneDetachedAsideCards() {
      for (const [card, home] of [...asideHomes]) {
        if (home?.parent?.isConnected) continue
        restoreNode(card, home, 'lsb-shell-aside-card')
        asideHomes.delete(card)
      }
    }

    function watchOnlineCard() {
      if (onlineObs || document.querySelector('#lsb-shell-aside .online-users-card')) return
      const sides = nativeSidebars()
      if (!sides.length) return
      onlineObs = new MutationObserver(() => {
        const host = document.querySelector('#lsb-shell-aside')
        if (!host || !cfg.shell) return
        adoptAsideCards(host)
        if (host.querySelector('.online-users-card')) stopOnlineWatch()
      })
      for (const side of sides) onlineObs.observe(side, { childList: true, subtree: true })
    }

    function stopOnlineWatch() {
      onlineObs?.disconnect()
      onlineObs = null
    }

    function watchTopExtras() {
      if (extrasObs) return
      const top = document.querySelector('body > .top')
      if (!top) return
      extrasObs = new MutationObserver(() => {
        const host = document.querySelector('[data-lsb-shell-extras]')
        if (!host || !cfg.shell) return
        adoptTopExtras(host)
      })
      extrasObs.observe(top, { childList: true, subtree: true })
    }

    function stopExtrasWatch() {
      extrasObs?.disconnect()
      extrasObs = null
    }

    function renderLinks(links) {
      return links
        .map((link) => {
          if (link.rpc) {
            return `<button type="button" class="lsb-shell-link" data-lsb-rpc="${esc(link.rpc)}"><span class="lsb-shell-link-label">${esc(link.label)}</span></button>`
          }
          if (link.panel) {
            return `<button type="button" class="lsb-shell-link" data-lsb-panel="${esc(link.panel)}"><span class="lsb-shell-link-label">${esc(link.label)}</span></button>`
          }
          const active = isActiveHref(link.href) ? ' is-active' : ''
          const count = Number.isFinite(link.count)
            ? `<span class="lsb-shell-count">${esc(String(link.count))}</span>`
            : ''
          return `<a class="lsb-shell-link${active}" href="${esc(link.href)}"><span class="lsb-shell-link-label">${esc(link.label)}</span>${count}</a>`
        })
        .join('')
    }

    function paintActive(host) {
      if (!(host instanceof Element)) return
      for (const a of host.querySelectorAll('a.lsb-shell-link')) {
        a.classList.toggle('is-active', isActiveHref(a.getAttribute('href')))
      }
    }

    function setSection(host, title, links) {
      if (!(host instanceof Element)) return
      const sig = title + JSON.stringify(links)
      if (host.dataset.sig === sig) {
        paintActive(host)
        return
      }
      host.dataset.sig = sig
      if (!links.length) {
        host.innerHTML = ''
        return
      }
      const heading = title ? `<h2>${esc(title)}</h2>` : ''
      host.innerHTML = `<section class="lsb-shell-nav-section">${heading}<div class="lsb-shell-nav">${renderLinks(links)}</div></section>`
    }

    function topicPosts() {
      const sel = api.sel?.topicPosts || 'ul.topic-post-list > li.post-entry, ul.post-list > li.post-entry'
      const nodes = [...document.querySelectorAll(sel)]
      return nodes.slice().sort((a, b) => {
        const fa = Number(a.dataset?.floor)
        const fb = Number(b.dataset?.floor)
        const na = Number.isFinite(fa) && fa > 0 ? fa : 0
        const nb = Number.isFinite(fb) && fb > 0 ? fb : 0
        if (na !== nb) return na - nb
        return nodes.indexOf(a) - nodes.indexOf(b)
      })
    }

    function scrollToPost(post, block) {
      post?.scrollIntoView({
        behavior: matchMedia('(prefers-reduced-motion: reduce)').matches ? 'auto' : 'smooth',
        block: block || 'start',
      })
    }

    function bindTimeline(timeline) {
      if (timeline.dataset.bound) return
      timeline.dataset.bound = '1'
      timeline.querySelector('.lsb-shell-edge[data-timeline-edge="start"]').addEventListener('click', () => {
        scrollToPost(topicPosts()[0], 'start')
      })
      timeline.querySelector('.lsb-shell-edge[data-timeline-edge="end"]').addEventListener('click', () => {
        scrollToPost(topicPosts().at(-1), 'center')
      })
      timeline.querySelector('.lsb-shell-track').addEventListener('click', (event) => {
        const posts = topicPosts()
        if (!posts.length) return
        const rect = event.currentTarget.getBoundingClientRect()
        const ratio = rect.height > 0 ? Math.min(1, Math.max(0, (event.clientY - rect.top) / rect.height)) : 0
        scrollToPost(posts[Math.round(ratio * Math.max(0, posts.length - 1))], 'center')
      })
    }

    function ensureTimeline(shellEl) {
      const onTopic = api.page?.type === 'topic' && topicPosts().length > 0
      let timeline = shellEl.querySelector('#lsb-shell-timeline')
      if (!onTopic) {
        if (timeline) timeline.hidden = true
        return null
      }
      if (!timeline) {
        timeline = document.createElement('nav')
        timeline.id = 'lsb-shell-timeline'
        timeline.setAttribute('aria-label', '楼层')
        timeline.innerHTML = `
          <button type="button" class="lsb-shell-edge" data-timeline-edge="start">主帖</button>
          <div class="lsb-shell-now"><strong data-timeline-current>主帖</strong><span data-timeline-date></span></div>
          <button type="button" class="lsb-shell-track" data-timeline-track role="scrollbar" aria-label="楼层轨道" aria-orientation="vertical" aria-valuemin="0" aria-valuemax="100" aria-valuenow="0">
            <span class="lsb-shell-thumb" aria-hidden="true"></span>
          </button>
          <div data-timeline-total></div>
          <button type="button" class="lsb-shell-edge" data-timeline-edge="end">最新</button>`
        shellEl.append(timeline)
        bindTimeline(timeline)
      }
      timeline.hidden = false
      return timeline
    }

    function currentTimelinePost(posts) {
      if (!posts.length) return { post: null, index: 0 }
      const offset = 56
      let index = 0
      for (let i = 0; i < posts.length; i += 1) {
        if (posts[i].getBoundingClientRect().top <= offset) index = i
        else break
      }
      return { post: posts[index], index }
    }

    function updateTimeline() {
      timelineRaf = 0
      if (!api.hasHandler('perf-probe:record')) {
        updateTimelineBody()
        return
      }
      const t0 = performance.now()
      try {
        updateTimelineBody()
      } finally {
        perfEmitTimeline(performance.now() - t0)
      }
    }

    function updateTimelineBody() {
      const timeline = document.querySelector('#lsb-shell-timeline')
      if (!timeline || !cfg.shell) return
      const posts = topicPosts()
      if (!posts.length) {
        timeline.hidden = true
        return
      }
      timeline.hidden = false
      const { post, index } = currentTimelinePost(posts)
      const floor = Number(post?.dataset?.floor)
      const progress = posts.length > 1 ? (index / (posts.length - 1)) * 100 : 0
      timeline.style.setProperty('--lsb-timeline-progress', `${progress}%`)
      timeline.querySelector('[data-timeline-current]').textContent =
        Number.isFinite(floor) && floor > 1 ? `#${floor}` : '主帖'
      const time = post?.querySelector('time, span[data-performance-time], .post-time')
      timeline.querySelector('[data-timeline-date]').textContent = (time?.textContent || '').trim().slice(0, 24)
      timeline.querySelector('[data-timeline-total]').textContent = `${Math.max(0, posts.length - 1)} 条回复`
      const track = timeline.querySelector('.lsb-shell-track')
      track.setAttribute('aria-valuenow', String(Math.round(progress)))
    }

    function scheduleTimeline() {
      if (timelineRaf) return
      timelineRaf = window.requestAnimationFrame(updateTimeline)
    }

    function bindWindow() {
      if (windowListening) return
      windowListening = true
      window.addEventListener('scroll', scheduleTimeline, { passive: true })
      window.addEventListener('resize', scheduleTimeline)
    }

    function unbindWindow() {
      if (!windowListening) return
      windowListening = false
      window.removeEventListener('scroll', scheduleTimeline)
      window.removeEventListener('resize', scheduleTimeline)
    }

    function ensureShell() {
      let el = document.getElementById('lsb-shell')
      if (el) {
        if (el.parentNode !== document.body) document.body.append(el)
        return el
      }
      el = document.createElement('div')
      el.id = 'lsb-shell'
      const nativeBrand = document.querySelector('body > .top a.brand')
      const brandName = (nativeBrand?.textContent || 'LINUX SB').trim()
      const nativeLogo = nativeBrand?.querySelector('img[src], source[src]')
      const logoSrc =
        (nativeLogo instanceof Element && nativeLogo.getAttribute('src'))
        || document.querySelector('link[rel~="icon"]')?.getAttribute('href')
        || '/app/assets/index.svg'
      el.innerHTML = `
        <header id="lsb-shell-header">
          <a class="lsb-shell-brand" href="/"><img class="lsb-shell-logo" src="${esc(logoSrc)}" alt="" width="22" height="22">${esc(brandName)}</a>
          <div class="lsb-shell-search-host"></div>
          <nav class="lsb-shell-extras" data-lsb-shell-extras aria-label="站点入口"></nav>
          <div class="lsb-shell-where" data-lsb-shell-where></div>
          <div class="lsb-shell-theme" data-lsb-shell-theme></div>
        </header>
        <aside id="lsb-shell-rail" aria-label="氢导航">
          <div class="lsb-shell-rail-scroll">
            <div class="lsb-shell-me" data-lsb-shell-me></div>
            <div data-lsb-shell-section="home"></div>
            <div data-lsb-shell-section="boards"></div>
            <div data-lsb-shell-section="tools"></div>
          </div>
          <div class="lsb-shell-rail-foot">
            <button type="button" class="lsb-shell-settings" data-lsb-shell-settings>设置</button>
          </div>
        </aside>
        <aside id="lsb-shell-aside" aria-label="站点信息"></aside>`
      el.querySelector('[data-lsb-shell-settings]').addEventListener('click', () => api.ui.openPanel('skin'))
      el.querySelector('#lsb-shell-rail').addEventListener('click', (e) => {
        const rpcBtn = e.target.closest('[data-lsb-rpc]')
        if (rpcBtn) {
          e.preventDefault()
          api.request(rpcBtn.getAttribute('data-lsb-rpc'))
          return
        }
        const btn = e.target.closest('[data-lsb-panel]')
        if (!btn) return
        e.preventDefault()
        api.ui.openPanel(btn.getAttribute('data-lsb-panel'))
      })
      document.body.append(el)
      return el
    }

    function syncShellRoute(el = document.getElementById('lsb-shell')) {
      applyMarkers()
      if (!(el instanceof Element)) return
      const where = el.querySelector('[data-lsb-shell-where]')
      if (where) where.textContent = locationText()
      paintActive(el.querySelector('[data-lsb-shell-section="home"]'))
      paintActive(el.querySelector('[data-lsb-shell-section="boards"]'))
      const timeline = ensureTimeline(el)
      if (timeline) {
        bindWindow()
        scheduleTimeline()
      } else {
        unbindWindow()
      }
    }

    function fillShell() {
      const el = ensureShell()
      pruneDetachedAsideCards()
      adoptSearch(el.querySelector('.lsb-shell-search-host'))
      adoptTopExtras(el.querySelector('[data-lsb-shell-extras]'))
      adoptThemeToggle(el.querySelector('[data-lsb-shell-theme]'))
      adoptUserCard(el.querySelector('[data-lsb-shell-me]'))
      adoptAsideCards(el.querySelector('#lsb-shell-aside'))
      watchOnlineCard()
      watchTopExtras()
      setSection(el.querySelector('[data-lsb-shell-section="home"]'), '', [
        { href: '/', label: '全部主题' },
      ])
      setSection(el.querySelector('[data-lsb-shell-section="boards"]'), '版块', collectBoards())
      setSection(el.querySelector('[data-lsb-shell-section="tools"]'), '工具', collectTools())
      syncShellRoute(el)
      syncHomeInfiniteScroll()
    }

    function isHomeInfPath(urlLike = location.href) {
      try {
        const url = new URL(urlLike, location.href)
        const path = url.pathname.replace(/\/{2,}/g, '/') || '/'
        if (path !== '/' && path !== '/index.php') return false
        if (url.searchParams.get('q')) return false
        return true
      } catch {
        return false
      }
    }

    function homeInfEnabled() {
      if ((document.cookie.match(/(?:^|; )sb_infinite_scroll_enabled=([^;]*)/) || [])[1] === '0') return false
      const config = window.__sbInfiniteScrollConfig || window.__infiniteScrollConfig || {}
      return config.enabled !== false
    }

    function homeInfTopicKey(item) {
      const title = item?.querySelector?.('.post-title')
      const href = title?.getAttribute('href') || ''
      if (href) return href.replace(/([?&])replyid=[^&]*/g, '').replace(/([?&])p=[^&]*/g, '')
      return `${(title?.textContent || '').trim()}|${(item?.textContent || '').trim().slice(0, 80)}`
    }

    function homeInfHasNext(root) {
      const pag = root?.querySelector?.('.pagination-bar') || root
      if (!pag?.querySelectorAll) return false
      for (const a of pag.querySelectorAll('a')) {
        if ((a.textContent || '').trim() === '下一页') return true
      }
      const page = homeInf?.page || 1
      for (const el of pag.querySelectorAll('a, span')) {
        const num = parseInt(el.textContent, 10)
        if (num > page) return true
      }
      return false
    }

    function unbindHomeInfiniteScroll() {
      if (!homeInf) return
      window.removeEventListener('scroll', homeInf.onScroll)
      homeInf.status?.remove()
      homeInf = null
    }

    function hideHomePagination(pagination) {
      if (!(pagination instanceof Element)) return
      pagination.classList.add('sb-infinite-scroll-pagination-hidden')
      pagination.setAttribute('aria-hidden', 'true')
      pagination.setAttribute('data-lsb-shell-inf', '1')
    }

    function setHomeInfStatus(kind, text) {
      if (!homeInf?.pagination?.parentNode) return
      homeInf.status?.remove()
      if (!kind) {
        homeInf.status = null
        return
      }
      const el = document.createElement('div')
      el.className = kind === 'end' ? 'infinite-scroll-end' : 'infinite-scroll-loader'
      el.setAttribute('data-lsb-inf-status', kind)
      el.textContent = text
      homeInf.pagination.parentNode.insertBefore(el, homeInf.pagination)
      homeInf.status = el
    }

    async function loadHomeInfPage() {
      const state = homeInf
      if (!state || state.loading || !state.hasMore) return
      state.loading = true
      setHomeInfStatus('loading', '加载中...')
      let next = state.page + 1
      while (state.loaded[next]) next += 1
      const url = new URL(location.href)
      url.searchParams.set('p', String(next))
      try {
        const res = await api.net.raw(`${url.pathname}${url.search}`, {
          queue: false,
          timeout: 15000,
          retry: 0,
        })
        if (homeInf !== state) return
        if (!res.ok) throw new Error(`HTTP ${res.status}`)
        const doc = new DOMParser().parseFromString(res.text, 'text/html')
        const remoteList = doc.querySelector('.main-panel > ul.post-list, ul.post-list')
        const items = remoteList ? [...remoteList.children] : []
        if (!items.length) {
          state.hasMore = false
          setHomeInfStatus('end', '没有更多内容了')
          return
        }
        const fresh = []
        for (const item of items) {
          const key = homeInfTopicKey(item)
          if (key && state.seen[key]) continue
          if (key) state.seen[key] = true
          fresh.push(document.importNode(item, true))
        }
        if (fresh.length) state.list.append(...fresh)
        const pagHtml = doc.querySelector('.pagination-bar')?.innerHTML
        if (pagHtml) state.pagination.innerHTML = pagHtml
        hideHomePagination(state.pagination)
        state.loaded[next] = true
        state.page = Math.max(state.page, next)
        if (!homeInfHasNext(doc)) {
          state.hasMore = false
          setHomeInfStatus('end', '没有更多内容了')
        } else {
          setHomeInfStatus(null)
        }
        document.dispatchEvent(new CustomEvent('sb:topic-list-updated', {
          detail: { list: state.list, items: fresh, page: next, source: 'lsb_shell' },
        }))
      } catch {
        if (homeInf !== state) return
        setHomeInfStatus('end', '加载失败，继续滚动或点分页重试')
      } finally {
        if (homeInf === state) state.loading = false
      }
    }

    function bindHomeInfiniteScroll(list, pagination) {
      const seen = {}
      for (const item of list.children) {
        if (item.matches?.('.post-item')) {
          const key = homeInfTopicKey(item)
          if (key) seen[key] = true
        }
      }
      const page = parseInt(new URL(location.href).searchParams.get('p'), 10) || 1
      const onScroll = () => {
        if (!homeInf || homeInf.loading || !homeInf.hasMore) return
        if (homeInf.scrollTimer) return
        homeInf.scrollTimer = window.setTimeout(() => {
          if (homeInf) homeInf.scrollTimer = 0
          const rect = list.getBoundingClientRect()
          const distance = rect.bottom - (window.innerHeight || 0)
          if (distance <= 100) void loadHomeInfPage()
        }, 200)
      }
      hideHomePagination(pagination)
      homeInf = {
        list,
        pagination,
        seen,
        loaded: { [page]: true },
        page,
        loading: false,
        hasMore: homeInfHasNext(document),
        onScroll,
        scrollTimer: 0,
        status: null,
      }
      if (!homeInf.hasMore) {
        setHomeInfStatus('end', '没有更多内容了')
        return
      }
      window.addEventListener('scroll', onScroll, { passive: true })
    }

    function syncHomeInfiniteScroll() {
      if (!cfg.shell || !isHomeInfPath() || !homeInfEnabled()) {
        unbindHomeInfiniteScroll()
        return
      }
      const list = document.querySelector('.main-panel > ul.post-list')
      const pagination = document.querySelector('.pagination-bar')
      if (!list || !pagination) {
        unbindHomeInfiniteScroll()
        return
      }
      if (homeInf?.list === list && homeInf.pagination === pagination) return
      unbindHomeInfiniteScroll()
      if (
        pagination.classList.contains('sb-infinite-scroll-pagination-hidden')
        && !pagination.hasAttribute('data-lsb-shell-inf')
      ) return
      bindHomeInfiniteScroll(list, pagination)
    }

    function findRouteOutlet(scope = document) {
      const candidates = [scope.querySelector?.('main.wrap'), scope.querySelector?.('main')]
      for (const el of candidates) {
        if (!el || el.id === 'lsb-shell' || el.querySelector?.('#lsb-shell')) continue
        return el
      }
      return null
    }

    function hideNativeSidebars(root) {
      if (!root?.querySelectorAll) return
      for (const el of root.querySelectorAll('aside.sidebar')) {
        if (el.id === 'mobile-menu-drawer' || el.classList.contains('mobile-menu-drawer')) continue
        el.classList.add('lsb-native-sidebar-hidden')
      }
    }

    function isSpaUrl(urlLike) {
      if (!cfg.shell) return false
      let url
      try {
        url = new URL(urlLike, location.href)
      } catch {
        return false
      }
      if (url.origin !== location.origin) return false
      const path = url.pathname.replace(/\/{2,}/g, '/') || '/'
      // 帖子页的讨论串靠站点脚本在整页生命周期里挂载；软跳进帖子会剥脚本，刷新才出现。
      if (/^\/topic\/\d+/.test(path)) return false
      return (
        path === '/'
        || path === '/index.php'
        || path === '/latest'
        || path === '/topic_featured'
        || path === '/unread_topic_notice_footprint'
        || /^\/forum\/\d+/.test(path)
        || /^\/category\/\d+/.test(path)
      )
    }

    function viewCacheKey(href) {
      const u = new URL(href, location.href)
      let path = u.pathname.replace(/\/{2,}/g, '/') || '/'
      if (path === '/index.php') path = '/'
      return path + u.search
    }

    function rememberView(key, entry) {
      if (viewCache.has(key)) viewCache.delete(key)
      viewCache.set(key, entry)
      while (viewCache.size > VIEW_CACHE_MAX) {
        const oldest = viewCache.keys().next().value
        viewCache.delete(oldest)
      }
    }

    function snapshotOutletAttrs(el) {
      if (!(el instanceof Element)) return []
      return [...el.attributes].map((a) => [a.name, a.value])
    }

    function stashView(key) {
      if (!key) return
      try {
        if (!isSpaUrl(new URL(key, location.origin).href)) return
      } catch {
        return
      }
      const outlet = findRouteOutlet()
      if (!outlet?.firstChild) return
      const frag = document.createDocumentFragment()
      while (outlet.firstChild) frag.appendChild(outlet.firstChild)
      rememberView(key, {
        frag,
        title: document.title,
        scrollY: window.scrollY || 0,
        live: true,
        attrs: snapshotOutletAttrs(outlet),
      })
    }

    function takeView(key) {
      const entry = viewCache.get(key)
      if (!entry) return null
      viewCache.delete(key)
      return entry
    }

    function applyView(entry, outlet) {
      if (!outlet || !entry?.frag) return
      if (entry.attrs) {
        for (const name of [...outlet.getAttributeNames()]) outlet.removeAttribute(name)
        for (const [name, value] of entry.attrs) {
          if (name.startsWith('data-lsb-')) continue
          outlet.setAttribute(name, value)
        }
      }
      outlet.replaceChildren()
      outlet.append(entry.frag)
      if (entry.title) document.title = entry.title
      outlet.removeAttribute('aria-busy')
      markNative(true)
    }

    function parseOutletFrag(html) {
      const pageDoc = new DOMParser().parseFromString(html, 'text/html')
      const remote = findRouteOutlet(pageDoc)
      if (!remote) return null
      remote.querySelectorAll('script').forEach((node) => node.remove())
      hideNativeSidebars(remote)
      const frag = document.createDocumentFragment()
      for (const node of [...remote.childNodes]) frag.appendChild(document.importNode(node, true))
      return { frag, title: pageDoc.title || '', attrs: snapshotOutletAttrs(remote) }
    }

    function wantsHomeStashRefresh() {
      return spaBound && cfg.shell && spaViewKey !== '/' && viewCache.has('/')
    }

    function stopHomeStashRefresh() {
      if (homeStashTimer) {
        window.clearTimeout(homeStashTimer)
        homeStashTimer = 0
      }
    }

    function scheduleHomeStashRefresh() {
      if (!wantsHomeStashRefresh()) {
        stopHomeStashRefresh()
        homeStashPending = false
        homeStashGen += 1
        return
      }
      if (homeStashTimer || homeStashInflight) return
      homeStashTimer = window.setTimeout(() => {
        homeStashTimer = 0
        void refreshStashedHome()
      }, HOME_STASH_REFRESH_MS)
    }

    async function refreshStashedHome() {
      if (!wantsHomeStashRefresh()) return
      if (document.visibilityState === 'hidden') {
        homeStashPending = true
        return
      }
      homeStashPending = false
      if (homeStashInflight) return homeStashInflight
      const gen = homeStashGen
      homeStashInflight = (async () => {
        try {
          const res = await api.net.raw('/', { queue: false, timeout: 15000, retry: 0 })
          if (gen !== homeStashGen) return
          if (!res.ok || !wantsHomeStashRefresh()) return
          const parsed = parseOutletFrag(res.text)
          if (!parsed || gen !== homeStashGen || !wantsHomeStashRefresh()) return
          rememberView('/', {
            frag: parsed.frag,
            title: parsed.title,
            scrollY: 0,
            live: false,
            attrs: parsed.attrs,
          })
        } catch {
          /* 后台刷新失败则还回仍用旧存档 */
        } finally {
          homeStashInflight = null
          if (gen === homeStashGen) scheduleHomeStashRefresh()
        }
      })()
      return homeStashInflight
    }

    function onHomeStashVisible() {
      if (document.visibilityState !== 'visible' || !homeStashPending) return
      homeStashPending = false
      void refreshStashedHome()
    }

    function seedHomeView() {
      const here = viewCacheKey(location.href)
      if (here === '/' || viewCache.has('/')) return
      void (async () => {
        try {
          const res = await api.net.raw('/', { queue: false, timeout: 15000, retry: 0 })
          if (!res.ok || viewCache.has('/') || spaViewKey === '/') return
          const parsed = parseOutletFrag(res.text)
          if (!parsed || viewCache.has('/') || spaViewKey === '/') return
          rememberView('/', {
            frag: parsed.frag,
            title: parsed.title,
            scrollY: 0,
            live: false,
            attrs: parsed.attrs,
          })
          scheduleHomeStashRefresh()
        } catch {
          /* 预取失败则点首页仍 GET */
        }
      })()
    }

    function hasUnsavedEditor() {
      return [...document.querySelectorAll('textarea, [contenteditable="true"]')].some((el) => {
        if (el.closest('#lsb-shell, .lsb-panel')) return false
        const value = 'value' in el ? el.value : el.textContent
        return String(value || '').trim().length > 0
      })
    }

    function ensureProgress() {
      const shell = document.getElementById('lsb-shell')
      if (!shell) return null
      let el = document.getElementById('lsb-shell-progress')
      if (el) return el
      el = document.createElement('div')
      el.id = 'lsb-shell-progress'
      el.setAttribute('aria-hidden', 'true')
      el.innerHTML = '<span data-lsb-shell-progress-bar></span>'
      shell.append(el)
      return el
    }

    function startProgress(serial) {
      const el = ensureProgress()
      if (!el) return
      el.dataset.phase = 'idle'
      el.style.setProperty('--lsb-shell-progress', '.08')
      window.clearTimeout(spaProgressTimer)
      spaProgressTimer = window.setTimeout(() => {
        if (serial !== spaSerial) return
        el.dataset.phase = 'loading'
        el.style.setProperty('--lsb-shell-progress', '.72')
      }, 90)
    }

    function finishProgress(serial) {
      const el = document.getElementById('lsb-shell-progress')
      window.clearTimeout(spaProgressTimer)
      spaProgressTimer = 0
      if (!el) return
      if (serial !== spaSerial) return
      el.dataset.phase = 'done'
      el.style.setProperty('--lsb-shell-progress', '1')
      spaProgressTimer = window.setTimeout(() => {
        el.dataset.phase = 'idle'
        el.style.setProperty('--lsb-shell-progress', '0')
      }, 160)
    }

    function syncRouteHead(pageDoc) {
      if (pageDoc.title) document.title = pageDoc.title
    }

    function syncOutletAttrs(outlet, remote) {
      for (const attr of [...outlet.attributes]) {
        if (attr.name.startsWith('data-lsb-') || attr.name === 'aria-busy') continue
        outlet.removeAttribute(attr.name)
      }
      for (const attr of [...remote.attributes]) {
        if (attr.name.startsWith('data-lsb-')) continue
        outlet.setAttribute(attr.name, attr.value)
      }
    }

    function commitRoute(pageDoc, remoteOutlet) {
      const outlet = findRouteOutlet()
      if (!outlet || !remoteOutlet) throw new Error('no outlet')
      remoteOutlet.querySelectorAll('script').forEach((node) => node.remove())
      hideNativeSidebars(remoteOutlet)
      const kids = [...remoteOutlet.childNodes].map((node) => document.importNode(node, true))
      syncOutletAttrs(outlet, remoteOutlet)
      outlet.replaceChildren(...kids)
      outlet.removeAttribute('aria-busy')
      syncRouteHead(pageDoc)
      markNative(true)
    }

    function notifyRoute() {
      spaIgnorePop = true
      try {
        const view = document.defaultView
        const Ev = view.PopStateEvent || view.Event
        view.dispatchEvent(new Ev('popstate'))
      } catch {
        try {
          window.dispatchEvent(new Event('popstate'))
        } catch {
          /* 基座还有 url 轮询兜底 */
        }
      } finally {
        spaIgnorePop = false
      }
    }

    function applyHistory(target, mode) {
      if (mode === 'none') return
      const state = { lsbShellSpa: true }
      try {
        if (mode === 'replace') history.replaceState(state, '', target.href)
        else history.pushState(state, '', target.href)
      } catch {
        /* history 不可用时仍换 DOM，地址栏可能落后 */
      }
    }

    function perfHref() {
      try {
        return location.pathname + location.search
      } catch {
        return ''
      }
    }

    function perfEmit(name, ms) {
      try {
        if (!api.hasHandler('perf-probe:record')) return
        api.emitGlobal('perf:span', {
          name,
          plugin: 'skin',
          ms,
          href: perfHref(),
          t: Date.now(),
        })
      } catch {
        /* 探针失败不得打断壳 */
      }
    }

    function perfSpan(name, fn) {
      if (!api.hasHandler('perf-probe:record')) return fn()
      const t0 = performance.now()
      try {
        return fn()
      } finally {
        perfEmit(name, performance.now() - t0)
      }
    }

    async function perfSpanAsync(name, fn) {
      if (!api.hasHandler('perf-probe:record')) return fn()
      const t0 = performance.now()
      try {
        return await fn()
      } finally {
        perfEmit(name, performance.now() - t0)
      }
    }

    let timelineEmitSec = -1
    let timelineEmitN = 0
    function perfEmitTimeline(ms) {
      if (ms < 8) return
      const sec = Math.floor(Date.now() / 1000)
      if (sec !== timelineEmitSec) {
        timelineEmitSec = sec
        timelineEmitN = 0
      }
      if (timelineEmitN >= 2) return
      timelineEmitN += 1
      perfEmit('timeline.update', ms)
    }

    async function navigateSpa(href, options = {}) {
      const settings = { historyMode: 'push', force: false, ...options }
      let target
      try {
        target = new URL(href, location.href)
      } catch {
        return false
      }
      if (!isSpaUrl(target.href)) return false
      if (!settings.force && hasUnsavedEditor() && !window.confirm('当前编辑内容尚未保存，确定离开吗？')) {
        return false
      }
      const same = target.pathname === location.pathname && target.search === location.search
      if (same && !settings.force) {
        if (target.hash) {
          const id = decodeURIComponent(target.hash.slice(1))
          document.getElementById(id)?.scrollIntoView()
        }
        return true
      }

      const fromKey = spaViewKey
      const destKey = viewCacheKey(target.href)
      const cached = takeView(destKey)
      const serial = ++spaSerial
      const tTotal = api.hasHandler('perf-probe:record') ? performance.now() : 0
      const outlet = findRouteOutlet()
      outlet?.setAttribute('aria-busy', 'true')
      startProgress(serial)
      let committed = false
      try {
        if (cached) {
          stashView(fromKey)
          applyHistory(target, settings.historyMode)
          perfSpan('spa.commit', () => applyView(cached, findRouteOutlet() || outlet))
          committed = true
          spaViewKey = destKey
          scheduleHomeStashRefresh()
          perfSpan('spa.fillShell', () => {
            applyMarkers()
            fillShell()
          })
          spaFilledSerial = serial
          window.clearTimeout(refreshTimer)
          refreshTimer = 0
          finishProgress(serial)
          try {
            if (settings.historyMode === 'none') window.scrollTo(0, cached.scrollY || 0)
            else window.scrollTo(0, 0)
          } catch {
            /* jsdom 没有视口 */
          }
          if (tTotal) perfEmit('spa.total', performance.now() - tTotal)
          afterPaint(() => {
            if (serial !== spaSerial) return
            perfSpan('spa.notify', () => {
              notifyRoute()
              syncShellRoute()
            })
            try {
              api.emitGlobal('spa:view-restored', { href: destKey, live: !!cached.live })
            } catch {
              /* 实时流缺席不得打断壳 */
            }
          })
          return true
        }

        const res = await perfSpanAsync('spa.fetch', () =>
          api.net.raw(`${target.pathname}${target.search}`, {
            queue: false,
            timeout: 15000,
            retry: 0,
          }),
        )
        if (serial !== spaSerial) return false
        if (!res.ok) throw new Error(`HTTP ${res.status}`)
        const finalUrl = new URL(res.url || target.href, target.href)
        if (!isSpaUrl(finalUrl.href)) {
          location.assign(finalUrl.href)
          return false
        }
        const pageDoc = perfSpan('spa.parse', () => new DOMParser().parseFromString(res.text, 'text/html'))
        const remoteOutlet = findRouteOutlet(pageDoc)
        if (!remoteOutlet) throw new Error('no remote outlet')
        stashView(fromKey)
        applyHistory(finalUrl, settings.historyMode)
        perfSpan('spa.commit', () => {
          commitRoute(pageDoc, remoteOutlet)
        })
        committed = true
        spaViewKey = viewCacheKey(finalUrl.href)
        scheduleHomeStashRefresh()
        perfSpan('spa.fillShell', () => {
          applyMarkers()
          fillShell()
        })
        spaFilledSerial = serial
        window.clearTimeout(refreshTimer)
        refreshTimer = 0
        finishProgress(serial)
        try {
          window.scrollTo(0, 0)
        } catch {
          /* jsdom 没有视口 */
        }
        if (tTotal) perfEmit('spa.total', performance.now() - tTotal)
        afterPaint(() => {
          if (serial !== spaSerial) return
          perfSpan('spa.notify', () => {
            notifyRoute()
            syncShellRoute()
          })
        })
        return true
      } catch (err) {
        if (serial !== spaSerial) return false
        finishProgress(serial)
        outlet?.removeAttribute('aria-busy')
        if (!committed && settings.historyMode !== 'none') location.assign(target.href)
        return false
      }
    }

    function onSpaClick(event) {
      if (event.defaultPrevented || event.button !== 0) return
      if (event.metaKey || event.ctrlKey || event.shiftKey || event.altKey) return
      const anchor = event.target?.closest?.('a[href]')
      if (
        !anchor
        || anchor.hasAttribute('download')
        || (anchor.target && anchor.target !== '_self')
        || /\bexternal\b/i.test(anchor.rel || '')
        || anchor.matches('[data-method], [data-confirm], [data-no-spa]')
        || anchor.closest('.pagination-bar, .pagination')
      ) return
      if (!isSpaUrl(anchor.href)) return
      if (anchor.href === location.href) return
      event.preventDefault()
      void navigateSpa(anchor.href)
    }

    function onSpaSubmit(event) {
      if (event.defaultPrevented) return
      const form = event.target instanceof HTMLFormElement ? event.target : null
      if (!form || String(form.method || 'get').toLowerCase() !== 'get') return
      if (form.target && form.target !== '_self') return
      if (form.matches('[data-no-spa], [data-confirm]')) return
      let target
      try {
        target = new URL(form.action || location.href, location.href)
        const data = event.submitter ? new FormData(form, event.submitter) : new FormData(form)
        target.search = new URLSearchParams(data).toString()
      } catch {
        return
      }
      if (!isSpaUrl(target.href)) return
      event.preventDefault()
      void navigateSpa(target.href)
    }

    function onSpaPop() {
      if (spaIgnorePop || !cfg.shell) return
      if (!isSpaUrl(location.href)) {
        // 软跳文档被后退到交易页/帖子等整页地址时，主栏还是列表，必须重开。
        // 交易页本身就是整页打开的，不能见 popstate 就 reload，否则会刷死。
        let paintedSpa = false
        try {
          paintedSpa = isSpaUrl(new URL(spaViewKey || '/', location.origin).href)
        } catch {
          paintedSpa = false
        }
        if (paintedSpa) location.reload()
        return
      }
      void navigateSpa(location.href, { historyMode: 'none', force: true })
    }

    function bindSpa() {
      if (spaBound) return
      spaBound = true
      try {
        history.scrollRestoration = 'manual'
      } catch {
        /* ignore */
      }
      document.addEventListener('click', onSpaClick, true)
      document.addEventListener('submit', onSpaSubmit, true)
      window.addEventListener('popstate', onSpaPop)
      document.addEventListener('visibilitychange', onHomeStashVisible)
      spaViewKey = viewCacheKey(location.href)
      seedHomeView()
      scheduleHomeStashRefresh()
    }

    function unbindSpa() {
      if (!spaBound) return
      spaBound = false
      spaSerial += 1
      window.clearTimeout(spaProgressTimer)
      spaProgressTimer = 0
      document.removeEventListener('click', onSpaClick, true)
      document.removeEventListener('submit', onSpaSubmit, true)
      window.removeEventListener('popstate', onSpaPop)
      document.removeEventListener('visibilitychange', onHomeStashVisible)
      stopHomeStashRefresh()
      homeStashPending = false
      homeStashGen += 1
      document.getElementById('lsb-shell-progress')?.remove()
    }

    function teardownShell() {
      window.clearTimeout(refreshTimer)
      refreshTimer = 0
      if (timelineRaf) {
        window.cancelAnimationFrame(timelineRaf)
        timelineRaf = 0
      }
      unbindSpa()
      unbindHomeInfiniteScroll()
      unbindWindow()
      stopOnlineWatch()
      stopExtrasWatch()
      restoreAsideCards()
      restoreUserCard()
      restoreTopExtras()
      restoreThemeToggle()
      restoreSearch()
      viewCache.clear()
      spaViewKey = ''
      document.getElementById('lsb-shell')?.remove()
      markNative(false)
      document.documentElement.classList.remove('lsb-skin-shell-on', 'lsb-skin-shell-topic', 'lsb-skin-shell-user')
      document.getElementById('lsb-shell-boot-style')?.remove()
      document.documentElement.classList.remove('lsb-shell-boot')
    }

    function refreshShell() {
      if (!cfg.shell) {
        teardownShell()
        return
      }
      markNative(true)
      applyMarkers()
      fillShell()
      bindSpa()
    }

    function afterPaint(fn) {
      const raf = window.requestAnimationFrame
      if (typeof raf === 'function') raf(() => fn())
      else setTimeout(fn, 0)
    }

    function scheduleRefresh(fromRoute) {
      if (fromRoute && spaFilledSerial && spaFilledSerial === spaSerial) return
      window.clearTimeout(refreshTimer)
      refreshTimer = window.setTimeout(refreshShell, 50)
    }

    function applyAll() {
      restyle()
      refreshShell()
    }

    api.ui.configTab({ name: '界面精修', order: 80 })

    let unregMenu = () => {}
    function syncGmMenu() {
      unregMenu()
      const on = !!api.config().shell
      unregMenu = api.ui.menuCommand(on ? '氢壳：关闭，回到原版界面' : '氢壳：开启', () => {
        api.saveConfig({ shell: !api.config().shell })
      })
    }
    syncGmMenu()

    api.on('config:changed:skin', () => {
      cfg = api.config()
      invalidateTools()
      applyAll()
      syncGmMenu()
    })
    api.on('route:changed', () => scheduleRefresh(true))
    api.on('plugin:activated', () => {
      invalidateTools()
      scheduleRefresh(false)
    })
    api.on('plugin:disabled', () => {
      invalidateTools()
      scheduleRefresh(false)
    })
    api.on('topic:posts-added', scheduleTimeline)
    api.dom.each(
      '.dark-mode-control, [data-themes-mode-toggle], a.color-scheme-top-link, a.search-page-link, form.search-form, .sidebar-card.user-card',
      () => {
        if (!cfg.shell) return
        adoptSearch(document.querySelector('.lsb-shell-search-host'))
        adoptThemeToggle(document.querySelector('[data-lsb-shell-theme]'))
        adoptUserCard(document.querySelector('[data-lsb-shell-me]'))
      },
    )

    api.onDispose(() => {
      unregMenu()
      teardownShell()
      const root = document.documentElement
      for (const c of [...root.classList].filter((x) => x.startsWith('lsb-skin-'))) root.classList.remove(c)
      document.getElementById('lsb-skin-style')?.remove()
    })

    api.handle('skin:debug', () => ({
      active: { ...cfg },
      markers: [...document.documentElement.classList].filter((c) => c.startsWith('lsb-skin-')),
      styleBytes: (document.getElementById('lsb-skin-style')?.textContent || '').length,
      themesPluginDetected: themesPresent,
      shell: {
        on: !!cfg.shell,
        mounted: !!document.getElementById('lsb-shell'),
        boards: collectBoards().length,
        location: locationText(),
        timeline: !!document.getElementById('lsb-shell-timeline'),
        me: !!document.querySelector('#lsb-shell .sidebar-card.user-card'),
        extras: document.querySelectorAll('.lsb-shell-extras a').length,
        aside: document.querySelectorAll('#lsb-shell-aside .sidebar-card').length,
        spa: spaBound,
      },
    }))

    applyAll()

    return {}
  }

  const w = typeof unsafeWindow !== 'undefined' ? unsafeWindow : window
  if (w.LSB && w.LSB.register) w.LSB.register(manifest, setup)
  else (w.LSB_PLUGINS = w.LSB_PLUGINS || []).push({ manifest, setup })
})()

;
(function () {
  'use strict'

  const manifest = {
    id: 'live-feed',
    name: '实时流',
    version: '1.2.17',
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
      ctx = { ul, seen, maxId, maxTs, sort: listSort(), prime: listSort() === 'comment' }
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
      // 回复流首页每条评论都在转：存档还回后立刻 cycle 会把整页热帖当成「新的」。
      // 第一轮只对齐水位，真正的增量留给之后的巡检。发布流不这么做——还回首页仍要立刻插入新 id。
      const priming = !!ctx.prime && !isPost
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
          if (!priming && (isPost ? it.id > ctx.maxId : (it.lastActiveTs || 0) > ctx.maxTs)) {
            pending.push(it)
            if (pending.length > 200) pending.shift()
          }
          ctx.seen.set(it.id, fp) // 无论是否计入，见过的都不再当新帖
          if (priming) {
            ctx.maxTs = Math.max(ctx.maxTs, it.lastActiveTs || 0)
            ctx.maxId = Math.max(ctx.maxId, it.id)
          }
        } else if (prev !== fp) {
          // 已在列表里、但回复数/活跃时间变了 → 老帖有新动态：原地高亮而非重复插入
          bumped.push(it)
          ctx.seen.set(it.id, fp)
        }
      }
      if (priming) ctx.prime = false
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

    function perfHref() {
      try {
        return location.pathname + location.search
      } catch {
        return ''
      }
    }

    function perfEmitCycle(ms) {
      try {
        if (!api.hasHandler('perf-probe:record')) return
        api.emitGlobal('perf:span', {
          name: 'cycle',
          plugin: 'live-feed',
          ms,
          href: perfHref(),
          t: Date.now(),
        })
      } catch {
        /* 探针失败不得打断巡检 */
      }
    }

    async function cycle() {
      if (!mode) init()
      if (!mode) return 0
      if (inflight) return inflight
      const timed = api.hasHandler('perf-probe:record')
      const t0 = timed ? performance.now() : 0
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
          if (timed) perfEmitCycle(performance.now() - t0)
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
      if (shouldPoll() && !timer) scheduleNext()
    })
    api.on('spa:view-restored', () => {
      init()
      void (async () => {
        const wait = inflight
        if (wait) await wait
        void cycle()
      })()
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

;
/* ══════════════ 套件中心（suite-core） ══════════════ */
;(function () {
  'use strict'
  const manifest = {
    id: 'suite',
    name: '重装套件',
    version: '1.0.105',
    description: '全家桶总览：各模块状态卡片、快捷开关、跨模块关键指标',
    author: 'you',
    requires: { base: '^0.1.0' },
    permissions: ['read', 'ui', 'events'],
  }

  const MEMBERS = ["floor-stats","resume-reading","read-mark","home-return","topic-preview","unread-sentinel","checkin-calendar","points-ledger","data-migration","annual-report","skin","live-feed"]

  /** 基座错误日志的四类条目（module-error=主动上报，其余为自动捕获） */
  const ERROR_KINDS = ['module-error', 'plugin-error', 'uncaught', 'rejection']

  function setup(api) {
    const W = typeof unsafeWindow !== 'undefined' ? unsafeWindow : window

    function today() {
      const x = new Date()
      const p = (n) => String(n).padStart(2, '0')
      return x.getFullYear() + '-' + p(x.getMonth() + 1) + '-' + p(x.getDate())
    }

    async function statLines() {
      const jobs = [
        ['⚠ 错误(7天)', () => {
          const n = (W.LSB.errors ? W.LSB.errors() : [])
            .filter((e) => ERROR_KINDS.includes(e.kind) && Date.now() - e.t < 7 * 864e5)
            .reduce((s, e) => s + (e.n || 1), 0)
          return Promise.resolve(n + ' 条')
        }],
        ['📖 阅读记录', () => api.request('resume-reading:debug').then((d) => Object.keys(d.all()).length + ' 帖'), 'resume-reading'],
        ['✅ 今日签到', () =>
          api.request('checkin-calendar:debug').then((d) => {
            const s = d.recs()[today()]?.s
            return s === 'ok' ? '已签 · 连击 ' + d.streak() : d.streak() + ' 天连击待续'
          }), 'checkin-calendar'],
        ['📈 积分快照', () =>
          api.request('points-ledger:series', { days: 7 }).then((s) =>
            s.length ? '最新 ' + s[s.length - 1].p + ' 分 / ' + s.length + ' 点' : '暂无',
          ), 'points-ledger'],
        ['🔔 消息箱', () => api.request('unread-sentinel:debug').then((d) => d.inbox().length + ' 条动态'), 'unread-sentinel'],
        ['🎯 机会命中', () => api.request('forum-watch:debug').then((d) => d.hits().length + ' 条'), 'forum-watch'],
        ['卡顿记录', () =>
          api.request('perf-probe:debug').then((d) => {
            const s = d.slowest()
            return s ? `最慢 ${s.ms}ms ${s.name}` : '未开记录'
          }).catch(() => '未开记录'), 'perf-probe'],
      ]
      return Promise.all(
        jobs
          .filter((job) => !job[2] || MEMBERS.includes(job[2]))
          .map(async ([label, fn]) => {
            try {
              return { label, value: await fn() }
            } catch {
              return { label, value: '—' } // 模块被停用或尚无数据
            }
          }),
      )
    }

    api.ui.tab({
      name: '套件总览',
      order: -1,
      render(host) {
        host.innerHTML =
          '<div class="lsb-row-desc" style="margin-bottom:6px">开关即时改写注册表，刷新页面后完全应用。</div>'
        const grid = document.createElement('div')
        grid.style.cssText =
          'display:grid;grid-template-columns:repeat(auto-fill,minmax(210px,1fr));gap:8px;margin-bottom:14px'
        host.appendChild(grid)

        function renderCards() {
          const info = W.LSB.info()
          // 近 7 天错误计数（来自基座持久化错误日志）：
          // module-error / plugin-error 带 e.id（插件 id），可归因到具体模块卡片；
          // uncaught / rejection 无归属，只进顶部「错误」指标行。
          let errBy = {}
          try {
            for (const e of W.LSB.errors ? W.LSB.errors() : []) {
              if (e.kind !== 'module-error' && e.kind !== 'plugin-error') continue
              if (Date.now() - e.t > 7 * 864e5) continue
              errBy[e.id] = (errBy[e.id] || 0) + (e.n || 1)
            }
          } catch {
            /* ignore */
          }
          grid.innerHTML = ''
          for (const id of MEMBERS) {
            const p = info.plugins.find((x) => x.id === id)
            if (!p) continue
            const cls = p.state === 'active' ? ' is-on' : p.state === 'error' ? ' is-err' : ''
            const label = {
              active: '运行中',
              disabled: '已停用',
              error: '出错',
              skipped: '本页不适用',
              registered: '等待依赖',
            }[p.state]
            const card = document.createElement('div')
            card.className = 'lsb-suite-card'
            card.innerHTML =
              '<div class="lsb-row-name">' +
              api.util.esc(p.name) +
              '<span class="lsb-badge">v' +
              api.util.esc(p.version) +
              '</span>' +
              (errBy[id] ? '<span class="lsb-badge is-err">⚠' + errBy[id] + '</span>' : '') +
              '<span class="lsb-badge' +
              cls +
              '">' +
              label +
              '</span></div><div class="lsb-row-desc">' +
              api.util.esc(p.description || p.id) +
              '</div>'
            const btn = document.createElement('button')
            btn.className = 'lsb-btn'
            btn.textContent = p.state === 'disabled' ? '启用' : '停用'
            btn.onclick = () => {
              if (p.state === 'disabled') W.LSB.enable(id)
              else W.LSB.disable(id)
              renderCards()
            }
            card.appendChild(btn)
            grid.appendChild(card)
          }
        }
        renderCards()

        const statBox = document.createElement('div')
        statBox.className = 'lsb-row-desc'
        statBox.textContent = '指标汇总中…'
        host.appendChild(statBox)
        statLines().then((rows) => {
          statBox.innerHTML =
            '<div style="margin:4px 0 6px;font-weight:600">关键指标</div>' +
            rows
              .map(
                (r) =>
                  '<div class="lsb-row"><span>' +
                  r.label +
                  '</span><strong style="margin-left:auto">' +
                  api.util.esc(String(r.value)) +
                  '</strong></div>',
              )
              .join('')
        })
      },
    })

    api.ui.style([
      '.lsb-suite-card{border:1px solid var(--line,#ddd);border-radius:8px;padding:9px 11px;',
      'display:flex;flex-direction:column;gap:6px;background:var(--bg,#fafafa)}',
      '.lsb-suite-card .lsb-btn{align-self:flex-start}',
    ].join(''))

    return {}
  }

  const w0 = typeof unsafeWindow !== 'undefined' ? unsafeWindow : window
  if (w0.LSB && w0.LSB.register) w0.LSB.register(manifest, setup)
  else {
    w0.LSB_PLUGINS = w0.LSB_PLUGINS || []
    w0.LSB_PLUGINS.push({ manifest, setup })
  }
})()

})()
